import { fromBlocks, type BlockJson, type Position } from '@stitch/blocks';
import {
  carryTextDetails,
  createIdGen,
  irEqual,
  reconcile,
  type IdGen,
  type Module,
  type NodeId,
} from '@stitch/ir';
import { parse, printModule, type Span, type SyntaxDiagnostic } from '@stitch/lang';

/** What undo/redo restores for one file. */
export interface Snapshot {
  text: string;
  layout: Record<string, Position>;
  loose: BlockJson[];
}

/**
 * One source file (stage or sprite). The IR module is the source of truth; the text and the
 * blocks are two views of it. Text edits re-parse and reconcile ids; block edits convert,
 * print, and re-parse so both views always agree on one canonical program.
 */
export class SourceDoc {
  text: string;
  module: Module = { items: [] };
  spans = new Map<NodeId, Span>();
  syntax: SyntaxDiagnostic[] = [];
  /** Top-level block positions by node id. */
  layout: Record<string, Position> = {};
  /** Blocks on the workspace that aren't part of the program (scratch paper). */
  loose: BlockJson[] = [];
  private ids: IdGen;

  constructor(
    readonly id: string,
    readonly name: string,
    text: string,
  ) {
    this.ids = createIdGen(`${id}:`);
    this.text = text;
    this.reparse(text);
  }

  /** The text view changed. Returns true if the program (or its comments) changed. */
  setText(text: string): boolean {
    this.text = text;
    return this.reparse(text);
  }

  /**
   * The blocks view changed. Returns true when re-parsing the printed text changed the program
   * (e.g. a raw-code block now holds valid code), so the blocks view should redraw.
   */
  setBlocks(blocks: BlockJson[]): boolean {
    const r = fromBlocks(blocks);
    const next = carryTextDetails(this.module, orderLike(this.module, r.module));
    this.layout = r.layout;
    this.loose = r.loose;
    this.text = printModule(next);
    this.module = next;
    this.reparse(this.text);
    return !irEqual(next, this.module);
  }

  snapshot(): Snapshot {
    return { text: this.text, layout: { ...this.layout }, loose: structuredClone(this.loose) };
  }

  restore(s: Snapshot): void {
    this.layout = { ...s.layout };
    this.loose = structuredClone(s.loose);
    this.setText(s.text);
  }

  private reparse(text: string): boolean {
    const r = parse(text, this.ids);
    // reconcile() rewrites ids, so remember each node's span by object first.
    const spanOf = new Map<object, Span>();
    eachNode(r.module, (n) => {
      const sp = r.spans.get(n.id);
      if (sp) spanOf.set(n, sp);
    });
    const next = reconcile(this.module, r.module);
    const changed = JSON.stringify(next) !== JSON.stringify(this.module);
    this.module = next;
    this.spans = new Map();
    eachNode(next, (n) => {
      const sp = spanOf.get(n);
      if (sp) this.spans.set(n.id, sp);
    });
    this.syntax = r.diagnostics;
    return changed;
  }
}

/** Visits every object with an `id` (IR nodes and else-if branches). */
function eachNode(m: Module, f: (n: { id: NodeId }) => void) {
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (typeof (v as { id?: unknown }).id === 'string') f(v as { id: NodeId });
      for (const x of Object.values(v)) walk(x);
    }
  };
  walk(m.items);
}

/** Keeps items in their previous text order; items new to the module go last, in given order. */
export function orderLike(old: Module, next: Module): Module {
  const rank = new Map(old.items.map((it, i) => [it.id, i]));
  const known = next.items
    .filter((it) => rank.has(it.id))
    .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const fresh = next.items.filter((it) => !rank.has(it.id));
  const out: Module = { items: [...known, ...fresh] };
  if (next.trailing) out.trailing = next.trailing;
  return out;
}

export interface HistoryEntry {
  docId: string;
  snapshot: Snapshot;
}

/**
 * One undo history for both views and all files. Each entry is a file's state *before* an edit.
 * A run of text edits within `mergeMs` of each other is one entry, like typing a word.
 */
export class History {
  private past: (HistoryEntry & { kind: 'text' | 'blocks'; at: number })[] = [];
  private future: HistoryEntry[] = [];

  constructor(
    private limit = 200,
    private mergeMs = 1000,
  ) {}

  record(docId: string, before: Snapshot, kind: 'text' | 'blocks', now = Date.now()): void {
    const last = this.past[this.past.length - 1];
    this.future = [];
    if (
      kind === 'text' &&
      last &&
      last.kind === 'text' &&
      last.docId === docId &&
      now - last.at < this.mergeMs
    ) {
      last.at = now;
      return;
    }
    this.past.push({ docId, snapshot: before, kind, at: now });
    if (this.past.length > this.limit) this.past.shift();
  }

  /** Pops the last edit. `current` gives a file's present state, kept for redo. */
  undo(current: (docId: string) => Snapshot): HistoryEntry | undefined {
    const e = this.past.pop();
    if (!e) return undefined;
    this.future.push({ docId: e.docId, snapshot: current(e.docId) });
    return { docId: e.docId, snapshot: e.snapshot };
  }

  redo(current: (docId: string) => Snapshot): HistoryEntry | undefined {
    const e = this.future.pop();
    if (!e) return undefined;
    this.past.push({ docId: e.docId, snapshot: current(e.docId), kind: 'blocks', at: 0 });
    return e;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
