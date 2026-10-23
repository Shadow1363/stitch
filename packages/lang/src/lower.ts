import type { SyntaxNode, Tree } from '@lezer/common';
import {
  createIdGen,
  isSpriteProp,
  type AssignOp,
  type BinaryOp,
  type Block,
  type EventSpec,
  type Expr,
  type IdGen,
  type LValue,
  type Module,
  type NodeId,
  type Raw,
  type Stmt,
  type TopItem,
  type Trivia,
  type UnaryOp,
} from '@stitch/ir';

export interface Span {
  from: number;
  to: number;
}

export interface SyntaxDiagnostic extends Span {
  message: string;
}

export interface LowerResult {
  module: Module;
  spans: Map<NodeId, Span>;
  diagnostics: SyntaxDiagnostic[];
}

const EXPR_NODES = new Set([
  'Number',
  'String',
  'Boolean',
  'ListLit',
  'Name',
  'CallExpr',
  'IndexExpr',
  'ParenExpr',
  'UnaryExpr',
  'BinaryExpr',
]);

interface Comment extends Span {
  text: string;
  used: boolean;
}

/** Turns a Lezer tree into IR. Unparseable regions become `Raw` nodes with their exact text. */
export function lower(tree: Tree, text: string, ids: IdGen = createIdGen()): LowerResult {
  return new Lowerer(tree, text, ids).run();
}

class Lowerer {
  private spans = new Map<NodeId, Span>();
  private diagnostics: SyntaxDiagnostic[] = [];
  private comments: Comment[] = [];
  private lineStarts: number[] = [0];
  private errorMemo = new Map<SyntaxNode, boolean>();

  constructor(
    private tree: Tree,
    private text: string,
    private ids: IdGen,
  ) {
    for (let i = 0; i < text.length; i++)
      if (text.charCodeAt(i) === 10) this.lineStarts.push(i + 1);
    tree.iterate({
      enter: (n) => {
        if (n.name === 'LineComment')
          this.comments.push({
            from: n.from,
            to: n.to,
            text: text.slice(n.from + 2, n.to),
            used: false,
          });
        if (n.type.isError) this.diagnostics.push(this.errorDiagnostic(n.from, n.to));
      },
    });
  }

  run(): LowerResult {
    const top = this.tree.topNode;
    const { items, trailing } = this.lowerSequence(top, 0, this.text.length, (n) =>
      this.topItem(n),
    );
    // Anything not yet attached (e.g. comments inside expressions) must not be lost.
    const leftover = this.comments.filter((c) => !c.used).map((c) => c.text);
    const module: Module = { items: items as TopItem[] };
    const tail = mergeTrivia(trailing, leftover.length ? { comments: leftover } : undefined);
    if (tail) module.trailing = tail;
    return { module, spans: this.spans, diagnostics: this.diagnostics };
  }

  // ---- sequences (Module items / Body statements) ----

  private lowerSequence<T extends TopItem | Stmt>(
    parent: SyntaxNode,
    regionFrom: number,
    regionTo: number,
    lowerOne: (n: SyntaxNode) => T,
  ): { items: T[]; trailing?: Trivia } {
    // Entries are child nodes, or text ranges of trailing errors split off a valid node.
    const entries: { node?: SyntaxNode; from: number; to: number; bad: boolean }[] = [];
    for (let c = parent.firstChild; c; c = c.nextSibling) {
      if (c.name === 'LineComment') continue;
      if (c.type.isError) {
        entries.push({ from: c.from, to: c.to, bad: true });
        continue;
      }
      const tail = this.trailingErrors(c);
      if (tail) {
        entries.push({ node: c, from: c.from, to: tail.from, bad: false });
        entries.push({ from: tail.from, to: c.to, bad: true });
      } else {
        entries.push({ node: c, from: c.from, to: c.to, bad: this.hasShallowError(c) });
      }
    }

    // Any entry sharing a line with a bad entry joins it, so recovery never splits a line.
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of entries) {
        if (e.bad) continue;
        if (entries.some((b) => b.bad && this.linesOverlap(e, b))) {
          e.bad = true;
          changed = true;
        }
      }
    }

    const items: T[] = [];
    let prevEnd = regionFrom;
    let prevItem: T | undefined;
    for (let i = 0; i < entries.length;) {
      const entry = entries[i]!;
      let item: T;
      let from = entry.from;
      let to = entry.to;
      if (entry.bad) {
        let j = i;
        while (j + 1 < entries.length && entries[j + 1]!.bad) j++;
        // Error nodes can include surrounding whitespace; Raw keeps only the text itself.
        [from, to] = this.trim(from, entries[j]!.to);
        i = j + 1;
        // Zero-width error nodes carry no text; skip them.
        if (from === to) continue;
        item = this.raw(from, to) as T;
      } else {
        // Comments inside a split-off error tail belong to that Raw text.
        const next = entries[i + 1];
        if (next?.bad) this.markUsed(next.from, next.to);
        item = lowerOne(entry.node!);
        this.spans.set(item.id, { from, to });
        i++;
      }
      const gap = this.takeGap(prevEnd, from, prevItem !== undefined);
      if (gap.lineComment && prevItem)
        setTrivia(prevItem, { ...prevItem.trivia, lineComment: gap.lineComment });
      const leading = mergeTrivia(gap.leading, item.trivia);
      if (leading) item.trivia = leading;
      else delete item.trivia;
      items.push(item);
      prevItem = item;
      prevEnd = to;
    }
    const gap = this.takeGap(prevEnd, regionTo, prevItem !== undefined);
    if (gap.lineComment && prevItem)
      setTrivia(prevItem, { ...prevItem.trivia, lineComment: gap.lineComment });
    const result: { items: T[]; trailing?: Trivia } = { items };
    if (gap.leading?.comments) {
      result.trailing = gap.leading;
      if (!prevItem) delete result.trailing.blankBefore;
    }
    return result;
  }

  /** Comments and blank lines in the text between two siblings. */
  private takeGap(
    from: number,
    to: number,
    hasPrev: boolean,
  ): { leading?: Trivia; lineComment?: string } {
    const comments = this.comments.filter((c) => !c.used && c.from >= from && c.to <= to);
    let lineComment: string | undefined;
    let rest = comments;
    const first = comments[0];
    if (hasPrev && first && !this.text.slice(from, first.from).includes('\n')) {
      lineComment = first.text;
      first.used = true;
      rest = comments.slice(1);
    }
    // Blank line: two newlines with only whitespace between, anywhere in the gap (outside comments).
    let gapText = this.text.slice(lineComment !== undefined && first ? first.to : from, to);
    for (const c of rest) gapText = gapText.replace(this.text.slice(c.from, c.to), '#');
    const blank = hasPrev && /\n[ \t\r]*\n/.test(gapText);
    for (const c of rest) c.used = true;
    const leading: Trivia = {};
    if (rest.length) leading.comments = rest.map((c) => c.text);
    if (blank) leading.blankBefore = true;
    const out: { leading?: Trivia; lineComment?: string } = {};
    if (leading.comments || leading.blankBefore) out.leading = leading;
    if (lineComment !== undefined) out.lineComment = lineComment;
    return out;
  }

  /** Comments inside a node that no nested body claimed (e.g. inside a long argument list). */
  private claimInner(node: SyntaxNode, target: { trivia?: Trivia }) {
    const inner = this.comments.filter((c) => !c.used && c.from >= node.from && c.to <= node.to);
    if (!inner.length) return;
    for (const c of inner) c.used = true;
    setTrivia(target, mergeTrivia(target.trivia, { comments: inner.map((c) => c.text) }));
  }

  private markUsed(from: number, to: number) {
    for (const c of this.comments) if (c.from >= from && c.to <= to) c.used = true;
  }

  /**
   * Lezer attaches junk that follows a complete node to that node as trailing error children.
   * When the junk starts on a later line, split it off so the valid node keeps its structure.
   */
  private trailingErrors(n: SyntaxNode): { from: number } | undefined {
    let last = n.lastChild;
    if (!last?.type.isError) return undefined;
    let firstErr = last;
    while (last && last.type.isError) {
      firstErr = last;
      last = last.prevSibling;
    }
    if (!last) return undefined;
    for (let c: SyntaxNode | null = last; c; c = c.prevSibling)
      if (c.type.isError || (c.name !== 'Body' && this.hasShallowError(c))) return undefined;
    const [ef, et] = this.trim(firstErr.from, n.to);
    if (ef === et) return undefined;
    if (this.line(ef) <= this.line(Math.max(last.from, last.to - 1))) return undefined;
    return { from: firstErr.from };
  }

  private raw(from: number, to: number): Raw {
    this.markUsed(from, to);
    const d = this.diagnostics.find((d) => d.from >= from && d.from <= to);
    const node: Raw = {
      id: this.ids.next(),
      kind: 'Raw',
      text: this.text.slice(from, to),
      error: d?.message ?? 'syntax error',
    };
    this.spans.set(node.id, { from, to });
    return node;
  }

  // ---- items ----

  private topItem(n: SyntaxNode): TopItem {
    switch (n.name) {
      case 'VarDecl': {
        const name = this.textOf(n.getChild('Name')!);
        // The first Name is the declared variable, not part of an expression.
        const init = this.expr(this.exprChildren(n)[1]!);
        return this.finish(n, {
          id: this.ids.next(),
          kind: 'VarDecl',
          scope: n.getChild('global') ? 'global' : 'sprite',
          name,
          init,
        });
      }
      case 'FunctionDef': {
        const id = this.ids.next();
        const name = this.textOf(n.getChild('Name')!);
        const params = n
          .getChild('ParamList')!
          .getChildren('Name')
          .map((p) => this.textOf(p));
        return this.finish(n, {
          id,
          kind: 'FunctionDef',
          name,
          params,
          body: this.body(n.getChild('Body')!),
        });
      }
      case 'EventScript': {
        const id = this.ids.next();
        return this.finish(n, {
          id,
          kind: 'EventScript',
          event: this.event(n),
          body: this.body(n.getChild('Body')!),
        });
      }
    }
    throw new Error(`unexpected item ${n.name}`);
  }

  private event(n: SyntaxNode): EventSpec {
    if (n.getChild('StartEvent')) return { type: 'start' };
    const key = n.getChild('KeyEvent');
    if (key) return { type: 'key', key: this.str(key.getChild('String')!) };
    const msg = n.getChild('MessageEvent')!;
    return { type: 'message', name: this.str(msg.getChild('String')!) };
  }

  private body(b: SyntaxNode): Block {
    const from = b.prevSibling?.to ?? b.from;
    const to = b.nextSibling?.from ?? b.parent?.nextSibling?.from ?? b.to;
    const { items, trailing } = this.lowerSequence(b, from, to, (n) => this.stmt(n));
    const block: Block = { stmts: items };
    if (trailing) block.trailing = trailing;
    return block;
  }

  // ---- statements ----

  private stmt(n: SyntaxNode): Stmt {
    const id = this.ids.next();
    const ex = () => this.exprChildren(n).map((e) => this.expr(e));
    const body = () => this.body(n.getChild('Body')!);
    switch (n.name) {
      case 'LocalDecl':
        return this.finish(n, {
          id,
          kind: 'LocalDecl',
          name: this.textOf(n.getChild('Name')!),
          init: ex()[1]!,
        });
      case 'Assign': {
        const t = n.firstChild!;
        const target: LValue = t.name === 'IndexTarget' ? this.indexTarget(t) : this.nameRef(t);
        const op = this.textOf(n.getChild('AssignOp')!) as AssignOp;
        const value = this.expr(this.exprChildren(n)[t.name === 'Name' ? 1 : 0]!);
        return this.finish(n, { id, kind: 'Assign', target, op, value });
      }
      case 'CallStmt': {
        const call = this.expr(n.getChild('CallExpr')!);
        if (call.kind !== 'Call') throw new Error('CallStmt without call');
        return this.finish(n, { id, kind: 'CallStmt', call });
      }
      case 'If': {
        const cond = ex()[0]!;
        const then = body();
        const elifs = n.getChildren('ElseIf').map((e) => ({
          id: this.ids.next(),
          cond: this.expr(this.exprChildren(e)[0]!),
          body: this.body(e.getChild('Body')!),
        }));
        const els = n.getChild('Else');
        return this.finish(
          n,
          els
            ? { id, kind: 'If', cond, then, elifs, else: this.body(els.getChild('Body')!) }
            : { id, kind: 'If', cond, then, elifs },
        );
      }
      case 'Forever':
        return this.finish(n, { id, kind: 'Forever', body: body() });
      case 'Repeat':
        return this.finish(n, { id, kind: 'Repeat', count: ex()[0]!, body: body() });
      case 'RepeatUntil':
        return this.finish(n, { id, kind: 'RepeatUntil', cond: ex()[0]!, body: body() });
      case 'While':
        return this.finish(n, { id, kind: 'While', cond: ex()[0]!, body: body() });
      case 'ForRange': {
        const [, from, to, step] = ex();
        const v = this.textOf(n.getChild('Name')!);
        const b = body();
        return this.finish(
          n,
          step
            ? { id, kind: 'ForRange', var: v, from: from!, to: to!, step, body: b }
            : { id, kind: 'ForRange', var: v, from: from!, to: to!, body: b },
        );
      }
      case 'ForEach':
        return this.finish(n, {
          id,
          kind: 'ForEach',
          var: this.textOf(n.getChild('Name')!),
          list: ex()[1]!,
          body: body(),
        });
      case 'WaitUntil':
        return this.finish(n, { id, kind: 'WaitUntil', cond: ex()[0]! });
      case 'Return': {
        const v = ex()[0];
        return this.finish(n, v ? { id, kind: 'Return', value: v } : { id, kind: 'Return' });
      }
    }
    throw new Error(`unexpected statement ${n.name}`);
  }

  private indexTarget(t: SyntaxNode): LValue {
    let target: LValue = this.nameRef(t.getChild('Name')!);
    for (const ix of this.exprChildren(t).slice(1)) {
      const idx: LValue = { id: this.ids.next(), kind: 'Index', target, index: this.expr(ix) };
      this.spans.set(idx.id, { from: t.from, to: ix.to + 1 });
      target = idx;
    }
    return target;
  }

  private nameRef(n: SyntaxNode): LValue {
    const name = this.textOf(n);
    const node: LValue = isSpriteProp(name)
      ? { id: this.ids.next(), kind: 'Prop', prop: name }
      : { id: this.ids.next(), kind: 'Var', name };
    this.spans.set(node.id, { from: n.from, to: n.to });
    return node;
  }

  // ---- expressions ----

  private expr(n: SyntaxNode): Expr {
    const id = this.ids.next();
    const span = { from: n.from, to: n.to };
    const done = <E extends Expr>(e: E): E => {
      this.spans.set(e.id, span);
      return e;
    };
    switch (n.name) {
      case 'Number': {
        const raw = this.textOf(n);
        const value = Number(raw);
        return done(
          String(value) === raw ? { id, kind: 'Num', value } : { id, kind: 'Num', value, raw },
        );
      }
      case 'String':
        return done({ id, kind: 'Str', value: this.str(n) });
      case 'Boolean':
        return done({ id, kind: 'Bool', value: n.getChild('true') !== null });
      case 'ListLit':
        return done({ id, kind: 'List', items: this.exprChildren(n).map((c) => this.expr(c)) });
      case 'Name': {
        const name = this.textOf(n);
        return done(
          isSpriteProp(name) ? { id, kind: 'Prop', prop: name } : { id, kind: 'Var', name },
        );
      }
      case 'CallExpr': {
        const args = this.exprChildren(n.getChild('ArgList')!).map((c) => this.expr(c));
        return done({ id, kind: 'Call', name: this.textOf(n.getChild('Name')!), args });
      }
      case 'IndexExpr': {
        const [t, i] = this.exprChildren(n);
        return done({ id, kind: 'Index', target: this.expr(t!), index: this.expr(i!) });
      }
      case 'ParenExpr':
        return this.expr(this.exprChildren(n)[0]!);
      case 'UnaryExpr': {
        const operandNode = this.exprChildren(n)[0]!;
        const op = this.opText(n.from, operandNode.from) as UnaryOp;
        const operand = this.expr(operandNode);
        // `-5` is a negative number literal (one number field in blocks), not negation.
        if (
          op === '-' &&
          operand.kind === 'Num' &&
          !(operand.raw ?? String(operand.value)).startsWith('-')
        ) {
          const raw = '-' + (operand.raw ?? String(operand.value));
          const value = -operand.value;
          this.spans.delete(operand.id);
          return done(
            String(value) === raw ? { id, kind: 'Num', value } : { id, kind: 'Num', value, raw },
          );
        }
        return done({ id, kind: 'Unary', op, operand });
      }
      case 'BinaryExpr': {
        const [l, r] = this.exprChildren(n);
        const op = this.opText(l!.to, r!.from) as BinaryOp;
        return done({ id, kind: 'Binary', op, left: this.expr(l!), right: this.expr(r!) });
      }
    }
    throw new Error(`unexpected expression ${n.name}`);
  }

  // ---- helpers ----

  private finish<T extends TopItem | Stmt>(n: SyntaxNode, node: T): T {
    this.spans.set(node.id, { from: n.from, to: n.to });
    this.claimInner(n, node);
    return node;
  }

  private exprChildren(n: SyntaxNode): SyntaxNode[] {
    const out: SyntaxNode[] = [];
    for (let c = n.firstChild; c; c = c.nextSibling) if (EXPR_NODES.has(c.name)) out.push(c);
    return out;
  }

  private textOf(n: SyntaxNode): string {
    return this.text.slice(n.from, n.to);
  }

  /** Operator text between two positions, ignoring comments and whitespace. */
  private opText(from: number, to: number): string {
    return this.text
      .slice(from, to)
      .replace(/--[^\n]*/g, '')
      .trim();
  }

  private str(n: SyntaxNode): string {
    return unescapeString(this.textOf(n));
  }

  private hasShallowError(n: SyntaxNode): boolean {
    const memo = this.errorMemo.get(n);
    if (memo !== undefined) return memo;
    let found = false;
    for (let c = n.firstChild; c && !found; c = c.nextSibling) {
      // Errors inside nested bodies are handled when that body is lowered.
      if (c.type.isError) found = true;
      else if (c.name !== 'Body') found = this.hasShallowError(c);
    }
    this.errorMemo.set(n, found);
    return found;
  }

  private line(pos: number): number {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  private linesOverlap(a: Span, b: Span): boolean {
    const [af, at] = this.trim(a.from, a.to);
    const [bf, bt] = this.trim(b.from, b.to);
    if (af === at || bf === bt) return false;
    const a0 = this.line(af);
    const a1 = this.line(at - 1);
    const b0 = this.line(bf);
    const b1 = this.line(bt - 1);
    return a0 <= b1 && b0 <= a1;
  }

  private trim(from: number, to: number): [number, number] {
    while (from < to && /\s/.test(this.text[from]!)) from++;
    while (to > from && /\s/.test(this.text[to - 1]!)) to--;
    return [from, to];
  }

  private errorDiagnostic(from: number, to: number): SyntaxDiagnostic {
    if (from === to) {
      const next = /\S+/.exec(this.text.slice(from));
      if (!next) return { from, to, message: 'unexpected end of file' };
      const tokFrom = from + next.index;
      return { from: tokFrom, to: tokFrom + next[0].length, message: `unexpected '${next[0]}'` };
    }
    return { from, to, message: `unexpected '${this.text.slice(from, to).split('\n')[0]}'` };
  }
}

function setTrivia(target: { trivia?: Trivia }, t: Trivia | undefined) {
  if (t && (t.comments?.length || t.blankBefore || t.lineComment !== undefined)) target.trivia = t;
  else delete target.trivia;
}

function mergeTrivia(a: Trivia | undefined, b: Trivia | undefined): Trivia | undefined {
  if (!a) return b;
  if (!b) return a;
  const out: Trivia = {};
  const comments = [...(a.comments ?? []), ...(b.comments ?? [])];
  if (comments.length) out.comments = comments;
  if (a.blankBefore || b.blankBefore) out.blankBefore = true;
  const lc = b.lineComment ?? a.lineComment;
  if (lc !== undefined) out.lineComment = lc;
  return out;
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' };

export function unescapeString(quoted: string): string {
  return quoted.slice(1, -1).replace(/\\(.)/g, (_, c: string) => ESCAPES[c] ?? c);
}

export function escapeString(value: string): string {
  return (
    '"' +
    value.replace(
      /[\\"\n\t\r]/g,
      (c) => ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\t': '\\t', '\r': '\\r' })[c]!,
    ) +
    '"'
  );
}
