/**
 * Editor assistance that needs only the text: what the cursor is in (a statement, an expression,
 * a string argument of some call), which names are in scope there, and where a name is defined.
 * Pure and DOM-free, tested in Node; the CodeMirror adapters in codemirror.ts and the editor's
 * registry data turn the answers into completions, signature help, hovers and go-to-definition.
 * It reads the error-tolerant Lezer tree, so it keeps working on half-typed code.
 */
import type { SyntaxNode, Tree } from '@lezer/common';
import { unescapeString } from './lower';
import { parser } from './parser.gen.js';

export interface Range {
  from: number;
  to: number;
}

/** The call whose argument list holds the cursor. */
export interface CallSite {
  name: string;
  /** 0-based index of the argument the cursor is in. */
  arg: number;
  /** Where the name starts, and the position just after `(`. */
  nameFrom: number;
  argsFrom: number;
}

export type ContextKind =
  /** Between items, where `var`, `function` and `on` go. */
  | 'top'
  /** At the start of a statement inside a script or function. */
  | 'statement'
  /** Inside an expression. */
  | 'expr'
  /** Right after `on `, where an event name goes. */
  | 'event'
  /** Inside a string literal. */
  | 'string'
  /** Inside a comment, or after a number: nothing to suggest. */
  | 'none';

export interface CursorContext {
  kind: ContextKind;
  /** The partly typed word (or string contents) before the cursor, to replace on completion. */
  word: Range & { text: string };
  /** The innermost call whose arguments hold the cursor. */
  call?: CallSite;
  /** In a string after `on key` or `on message`. */
  event?: 'key' | 'message';
}

const IDENT = /[A-Za-z0-9_]/;

/** The identifier around `pos` (possibly empty). */
export function wordAt(text: string, pos: number): Range & { text: string } {
  let from = pos;
  let to = pos;
  while (from > 0 && IDENT.test(text[from - 1]!)) from--;
  while (to < text.length && IDENT.test(text[to]!)) to++;
  return { from, to, text: text.slice(from, to) };
}

interface Open {
  ch: '(' | '[';
  /** Commas seen at this depth. */
  commas: number;
  at: number;
}

/**
 * Scans from the start of the text to `pos`, tracking strings, comments and open brackets.
 * Strings and comments end at a newline, as in the grammar.
 */
function scan(text: string, pos: number) {
  const stack: Open[] = [];
  let str: number | undefined;
  let comment = false;
  for (let i = 0; i < pos; i++) {
    const c = text[i]!;
    if (c === '\n') {
      str = undefined;
      comment = false;
    } else if (comment) continue;
    else if (str !== undefined) {
      if (c === '\\') i++;
      else if (c === '"') str = undefined;
    } else if (c === '"') str = i;
    else if (c === '-' && text[i + 1] === '-') comment = true;
    else if (c === '(' || c === '[') stack.push({ ch: c, commas: 0, at: i });
    else if (c === ')' || c === ']') stack.pop();
    else if (c === ',' && stack.length) stack[stack.length - 1]!.commas++;
  }
  return { stack, str, comment };
}

/** The innermost open call at `pos`, from the scan's bracket stack. */
function callFrom(text: string, stack: Open[]): CallSite | undefined {
  for (let k = stack.length - 1; k >= 0; k--) {
    const o = stack[k]!;
    if (o.ch !== '(') continue;
    let end = o.at;
    while (end > 0 && /[ \t]/.test(text[end - 1]!)) end--;
    const w = wordAt(text, end);
    if (w.to !== end || !w.text || !/^[A-Za-z_]/.test(w.text)) continue;
    // `function name(` is a definition, not a call.
    if (/\bfunction\s+$/.test(text.slice(Math.max(0, w.from - 20), w.from))) return undefined;
    return { name: w.text, arg: o.commas, nameFrom: w.from, argsFrom: o.at + 1 };
  }
  return undefined;
}

/** What the cursor at `pos` is in. `tree` defaults to a fresh parse of `text`. */
export function contextAt(text: string, pos: number, tree?: Tree): CursorContext {
  const { stack, str, comment } = scan(text, pos);
  const call = callFrom(text, stack);
  const withCall = <T extends object>(o: T) => (call ? { ...o, call } : o);
  if (comment) return { kind: 'none', word: { from: pos, to: pos, text: '' } };
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  if (str !== undefined) {
    const word = { from: str + 1, to: pos, text: text.slice(str + 1, pos) };
    const ev = /^\s*on\s+(key|message)\s*$/.exec(text.slice(lineStart, str));
    return withCall({
      kind: 'string' as const,
      word,
      ...(ev ? { event: ev[1] as 'key' | 'message' } : {}),
    });
  }
  const word = wordAt(text, pos);
  word.to = pos;
  word.text = text.slice(word.from, pos);
  const before = text.slice(lineStart, word.from);
  if (/^\d/.test(word.text)) return { kind: 'none', word };
  if (/^\s*on\s+$/.test(before)) return { kind: 'event', word };
  if (/^\s*$/.test(before) && !stack.length) {
    const inItem = enclosingItem(tree ?? parser.parse(text), pos) !== undefined;
    return { kind: inItem || before.length > 0 ? 'statement' : 'top', word };
  }
  return withCall({ kind: 'expr' as const, word });
}

const ITEMS = new Set(['FunctionDef', 'EventScript']);

function enclosingItem(tree: Tree, pos: number): SyntaxNode | undefined {
  for (let n: SyntaxNode | null = tree.resolveInner(pos, -1); n; n = n.parent)
    if (ITEMS.has(n.name) && n.from < pos) return n;
  return undefined;
}

export type NameKind = 'global' | 'shared' | 'sprite' | 'local' | 'param' | 'loop' | 'function';

/** A name the program declares, and where. */
export interface ScopeName extends Range {
  name: string;
  kind: NameKind;
  /** Functions only. */
  params?: string[];
}

const textOf = (text: string, n: SyntaxNode | null) => (n ? text.slice(n.from, n.to) : '');

/** Top-level declarations: variables and functions, in file order. */
export function declarations(text: string, tree: Tree = parser.parse(text)): ScopeName[] {
  const out: ScopeName[] = [];
  for (let c = tree.topNode.firstChild; c; c = c.nextSibling) {
    const name = c.getChild('Name');
    if (!name) continue;
    if (c.name === 'VarDecl') {
      const kind = c.getChild('global') ? 'global' : c.getChild('shared') ? 'shared' : 'sprite';
      out.push({ name: textOf(text, name), kind, from: name.from, to: name.to });
    } else if (c.name === 'FunctionDef') {
      const params = c.getChild('ParamList')?.getChildren('Name') ?? [];
      out.push({
        name: textOf(text, name),
        kind: 'function',
        from: name.from,
        to: name.to,
        params: params.map((p) => textOf(text, p)),
      });
    }
  }
  return out;
}

/**
 * Names visible at `pos`, innermost first: locals declared earlier in each enclosing block, loop
 * variables, the function's parameters, then the file's declarations. Globals from other files
 * aren't here; the editor adds them.
 */
export function scopeAt(text: string, pos: number, tree: Tree = parser.parse(text)): ScopeName[] {
  const out: ScopeName[] = [];
  const add = (n: SyntaxNode, kind: NameKind) =>
    out.push({ name: textOf(text, n), kind, from: n.from, to: n.to });
  const locals = (body: SyntaxNode) => {
    const found: SyntaxNode[] = [];
    for (let s = body.firstChild; s && s.to <= pos; s = s.nextSibling)
      if (s.name === 'LocalDecl') {
        const n = s.getChild('Name');
        if (n) found.push(n);
      }
    for (const n of found.reverse()) add(n, 'local');
  };
  let first = true;
  for (let n: SyntaxNode | null = tree.resolveInner(pos, -1); n; n = n.parent, first = false) {
    if (n.name === 'Body') locals(n);
    else if (first) {
      // The cursor sits in the node but outside its bodies' text, e.g. on a blank line before
      // `end`: use the last body (of any branch) that starts before it.
      const bodies = [n, ...n.getChildren('ElseIf'), ...n.getChildren('Else')]
        .flatMap((x) => x.getChildren('Body'))
        .filter((b) => b.from <= pos);
      const last = bodies.sort((x, y) => x.from - y.from)[bodies.length - 1];
      if (last) locals(last);
    }
    if (n.name === 'ForRange' || n.name === 'ForEach') {
      const body = n.getChild('Body');
      const v = n.getChild('Name');
      if (v && body && body.from <= pos) add(v, 'loop');
    }
    if (n.name === 'FunctionDef')
      for (const p of n.getChild('ParamList')?.getChildren('Name') ?? []) add(p, 'param');
  }
  return [...out, ...declarations(text, tree)];
}

/** Where the name at `pos` is declared in this file, innermost scope first. */
export function definitionAt(
  text: string,
  pos: number,
  tree: Tree = parser.parse(text),
): ScopeName | undefined {
  const w = wordAt(text, pos);
  if (!w.text) return undefined;
  return scopeAt(text, w.from, tree).find((s) => s.name === w.text);
}

/** Message names this file broadcasts or receives (string literals only). */
export function messageNames(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\bon\s+message\s+("(?:[^"\\\n]|\\.)*")/g))
    out.add(unescapeString(m[1]!));
  for (const m of text.matchAll(/\bbroadcast(?:_wait)?\s*\(\s*("(?:[^"\\\n]|\\.)*")/g))
    out.add(unescapeString(m[1]!));
  return [...out];
}
