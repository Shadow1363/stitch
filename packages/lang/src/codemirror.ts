import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import {
  foldInside,
  foldNodeProp,
  indentNodeProp,
  LanguageSupport,
  LRLanguage,
  continuedIndent,
  syntaxTree,
} from '@codemirror/language';
import { linter, type Action, type Diagnostic as CMDiagnostic } from '@codemirror/lint';
import { StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, hoverTooltip, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { styleTags, tags as t } from '@lezer/highlight';
import {
  CORE_CATALOG,
  validateModule,
  type Catalog,
  type Fix,
  type FileContext,
  type Module,
  type NodeId,
} from '@stitch/ir';
import {
  contextAt,
  definitionAt,
  scopeAt,
  wordAt,
  type CallSite,
  type CursorContext,
  type ScopeName,
} from './assist';
import { escapeString, type Span } from './lower';
import { parse } from './parse';
import { parser } from './parser.gen.js';

const BLOCKS = 'FunctionDef EventScript If Forever Repeat RepeatUntil While ForRange ForEach';

export const stitchLanguage = LRLanguage.define({
  name: 'stitch',
  parser: parser.configure({
    props: [
      styleTags({
        'var global shared local function warp on do end return': t.definitionKeyword,
        'if then elseif else forever repeat until while for in wait break continue':
          t.controlKeyword,
        'start key message clone click': t.keyword,
        'and or not': t.operatorKeyword,
        'true false': t.bool,
        Number: t.number,
        String: t.string,
        LineComment: t.lineComment,
        'CallExpr/Name': t.function(t.variableName),
        'FunctionDef/Name': t.function(t.definition(t.variableName)),
        'VarDecl/Name LocalDecl/Name ParamList/Name': t.definition(t.variableName),
        Name: t.variableName,
        AssignOp: t.definitionOperator,
        '( )': t.paren,
        '[ ]': t.squareBracket,
      }),
      indentNodeProp.add({
        [BLOCKS]: continuedIndent({ except: /^\s*(end|else|elseif)\b/ }),
      }),
      foldNodeProp.add(Object.fromEntries(BLOCKS.split(' ').map((n) => [n, foldInside]))),
    ],
  }),
  languageData: {
    commentTokens: { line: '--' },
    indentOnInput: /^\s*(end|else|elseif)$/,
  },
});

export function stitch(): LanguageSupport {
  return new LanguageSupport(stitchLanguage);
}

/**
 * Inline diagnostics: syntax errors plus semantic checks, with quick fixes. `globals` come from
 * other files, `catalog` adds the cart's extension blocks, and `context` gives the cart's names
 * (sprites, costumes, sounds, songs, received messages) for the string-argument checks.
 */
export function stitchLinter(
  globals: () => ReadonlySet<string> = () => new Set(),
  catalog: () => Catalog = () => CORE_CATALOG,
  context: () => FileContext | undefined = () => undefined,
): Extension {
  return linter(
    (view) => {
      const text = view.state.doc.toString();
      const r = parse(text);
      const out: CMDiagnostic[] = r.diagnostics.map((d) => ({
        from: d.from,
        to: Math.max(d.to, d.from),
        severity: 'error',
        message: d.message,
      }));
      for (const d of validateModule(r.module, globals(), catalog(), context())) {
        if (d.message.startsWith('syntax error')) continue; // already reported precisely above
        const span = d.nodeId ? r.spans.get(d.nodeId) : undefined;
        const actions = span && d.nodeId ? fixActions(d.fixes ?? [], text, span, d.nodeId, r) : [];
        out.push({
          from: span?.from ?? 0,
          to: span?.to ?? 0,
          severity: d.severity,
          message: d.message,
          ...(actions.length ? { actions } : {}),
        });
      }
      return out;
    },
    { delay: 250 },
  );
}

/** Turns validation's fix data into edits at the node's place in the text. */
function fixActions(
  fixes: Fix[],
  text: string,
  span: Span,
  nodeId: NodeId,
  parsed: { module: Module; spans: Map<NodeId, Span> },
): Action[] {
  const edit =
    (from: number, to: number, insert: string): Action['apply'] =>
    (view) =>
      view.dispatch({ changes: { from, to, insert } });
  return fixes.flatMap((f): Action[] => {
    switch (f.kind) {
      case 'rename': {
        if (text[span.from] === '"')
          return [
            { name: `Change to "${f.to}"`, apply: edit(span.from, span.to, escapeString(f.to)) },
          ];
        const w = wordAt(text, span.from);
        return [{ name: `Change to ${f.to}`, apply: edit(w.from, w.to, f.to) }];
      }
      case 'declare':
        return [{ name: `Declare ${f.line}`, apply: edit(0, 0, `${f.line}\n`) }];
      case 'args': {
        const call = findNode(parsed.module, nodeId);
        const open = text.indexOf('(', span.from);
        if (!call || !('args' in call) || open < 0 || text[span.to - 1] !== ')') return [];
        const kept = call.args.slice(0, f.keep).map((a) => {
          const s = parsed.spans.get(a.id);
          return s ? text.slice(s.from, s.to) : '';
        });
        const name = f.add.length ? 'Fill in missing arguments' : 'Remove extra arguments';
        return [{ name, apply: edit(open + 1, span.to - 1, [...kept, ...f.add].join(', ')) }];
      }
    }
  });
}

/** The IR node with this id (calls only carry the arguments the fix needs). */
function findNode(m: Module, id: NodeId): { args: { id: NodeId }[] } | undefined {
  let found: { args: { id: NodeId }[] } | undefined;
  const walk = (v: unknown) => {
    if (found || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    const o = v as { id?: unknown; args?: unknown };
    if (o.id === id && Array.isArray(o.args)) found = o as { args: { id: NodeId }[] };
    else Object.values(o).forEach(walk);
  };
  walk(m.items);
  return found;
}

// ---- assist: completion, signature help, hover, go to definition ----

/** One completion, as the editor builds it from the registry and the cart. */
export interface AssistCompletion {
  label: string;
  displayLabel?: string;
  type?: string;
  detail?: string;
  /** A CodeMirror snippet (`${name}` tab stops); plain `label` is inserted otherwise. */
  snippet?: string;
  boost?: number;
  info?: () => Node;
}

/** What the editor supplies: completions and DOM for signatures and hovers. */
export interface AssistSource {
  completions(ctx: CursorContext, scope: ScopeName[]): AssistCompletion[];
  signature(call: CallSite, scope: ScopeName[]): Node | null;
  hover(name: string, scope: ScopeName[]): Node | null;
  /** A name this file doesn't declare (another file's global): true when the editor went there. */
  gotoElsewhere(name: string): boolean;
}

const treeOf = (state: EditorState) => syntaxTree(state);

function complete(source: AssistSource, cx: CompletionContext): CompletionResult | null {
  const text = cx.state.doc.toString();
  const tree = treeOf(cx.state);
  const ctx = contextAt(text, cx.pos, tree);
  if (ctx.kind === 'none') return null;
  // Strings and `on ` open the list at once; elsewhere wait for a letter (or Ctrl-Space).
  if (!ctx.word.text && !cx.explicit && ctx.kind !== 'string' && ctx.kind !== 'event') return null;
  const items = source.completions(ctx, scopeAt(text, cx.pos, tree));
  if (!items.length) return null;
  const options = items.map((i): Completion => {
    const base: Completion = {
      label: i.label,
      ...(i.displayLabel ? { displayLabel: i.displayLabel } : {}),
      ...(i.type ? { type: i.type } : {}),
      ...(i.detail ? { detail: i.detail } : {}),
      ...(i.boost !== undefined ? { boost: i.boost } : {}),
      ...(i.info ? { info: i.info } : {}),
    };
    return i.snippet ? snippetCompletion(i.snippet, base) : base;
  });
  return {
    from: ctx.word.from,
    options,
    validFor: ctx.kind === 'string' ? /^[^"\\]*$/ : /^\w*$/,
  };
}

/** The signature tooltip for the call around the cursor, if any. */
function signatureTooltip(source: AssistSource, state: EditorState): Tooltip | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  const text = state.doc.toString();
  const tree = treeOf(state);
  const ctx = contextAt(text, sel.head, tree);
  if (!ctx.call) return null;
  const call = ctx.call;
  const dom = source.signature(call, scopeAt(text, sel.head, tree));
  if (!dom) return null;
  return {
    pos: call.nameFrom,
    above: true,
    create: () => {
      const wrap = document.createElement('div');
      wrap.className = 'cm-stitch-signature';
      wrap.append(dom);
      return { dom: wrap };
    },
  };
}

function signatureHelp(source: AssistSource): Extension {
  return StateField.define<Tooltip | null>({
    create: (state) => signatureTooltip(source, state),
    update: (value, tr) =>
      tr.docChanged || tr.selection ? signatureTooltip(source, tr.state) : value,
    provide: (f) => showTooltip.from(f),
  });
}

const NO_HOVER = new Set(['String', 'LineComment', 'Number']);

/** Goes to the declaration of the name at `pos`: in this file, or through the editor. */
function goToDefinition(source: AssistSource, view: EditorView, pos: number): boolean {
  const text = view.state.doc.toString();
  const def = definitionAt(text, pos, treeOf(view.state));
  if (def) {
    view.dispatch({ selection: { anchor: def.from, head: def.to }, scrollIntoView: true });
    return true;
  }
  const w = wordAt(text, pos);
  return w.text ? source.gotoElsewhere(w.text) : false;
}

/**
 * Completions with snippets, signature help, hover docs and go to definition (F12, or
 * Cmd/Ctrl-click). The analysis is `./assist`; the content comes from `source`.
 */
export function stitchAssist(source: AssistSource): Extension {
  return [
    autocompletion({ override: [(cx) => complete(source, cx)], icons: true }),
    signatureHelp(source),
    hoverTooltip((view, pos, side) => {
      const node = treeOf(view.state).resolveInner(pos, side);
      if (NO_HOVER.has(node.name)) return null;
      const text = view.state.doc.toString();
      const w = wordAt(text, pos);
      if (!w.text || /^\d/.test(w.text)) return null;
      const dom = source.hover(w.text, scopeAt(text, w.from, treeOf(view.state)));
      if (!dom) return null;
      return { pos: w.from, end: w.to, above: true, create: () => ({ dom: dom as HTMLElement }) };
    }),
    keymap.of([
      { key: 'F12', run: (view) => goToDefinition(source, view, view.state.selection.main.head) },
    ]),
    EditorView.domEventHandlers({
      mousedown(e, view) {
        if (!(e.metaKey || e.ctrlKey) || e.button !== 0) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos === null || !goToDefinition(source, view, pos)) return false;
        e.preventDefault();
        return true;
      },
    }),
  ];
}
