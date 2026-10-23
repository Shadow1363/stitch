import type { Block, EventSpec, Expr, Module, Project, Stmt, TopItem, Trivia } from '@stitch/ir';
import { escapeString } from './lower';

const INDENT = '  ';

/** Binding strength, low to high. Mirrors @precedence in stitch.grammar. */
const PREC: Record<string, number> = {
  or: 1,
  and: 2,
  '==': 3,
  '~=': 3,
  '<': 3,
  '<=': 3,
  '>': 3,
  '>=': 3,
  '..': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};
const PREC_UNARY = 7;
const PREC_POW = 8;
const PREC_POSTFIX = 9;
const PREC_ATOM = 10;
const RIGHT_ASSOC = new Set(['..', '^']);

/** Canonical text for one module. `print(parse(t))` is a fixed point. */
export function printModule(m: Module): string {
  const lines: string[] = [];
  m.items.forEach((it, i) => {
    leading(lines, it.trivia, '', i === 0);
    topItem(lines, it);
  });
  if (m.trailing?.comments) {
    if (m.trailing.blankBefore && m.items.length) lines.push('');
    for (const c of m.trailing.comments) lines.push('--' + c);
  }
  return lines.length ? lines.join('\n') + '\n' : '';
}

/** Prints every file in a project, keyed by "stage" or sprite name. */
export function printProject(p: Project): Map<string, string> {
  const out = new Map<string, string>([['stage', printModule(p.stage)]]);
  for (const s of p.sprites) out.set(s.name, printModule(s.module));
  return out;
}

function leading(lines: string[], t: Trivia | undefined, ind: string, first: boolean) {
  if (!t) return;
  if (t.blankBefore && !first) lines.push('');
  for (const c of t.comments ?? []) lines.push(ind + '--' + c);
}

function withLineComment(line: string, t: Trivia | undefined): string {
  return t?.lineComment !== undefined ? `${line} --${t.lineComment}` : line;
}

function topItem(lines: string[], it: TopItem) {
  switch (it.kind) {
    case 'VarDecl':
      lines.push(
        withLineComment(
          `${it.scope === 'global' ? 'global ' : ''}var ${it.name} = ${expr(it.init)}`,
          it.trivia,
        ),
      );
      return;
    case 'FunctionDef':
      lines.push(`function ${it.name}(${it.params.join(', ')})`);
      block(lines, it.body, INDENT);
      lines.push(withLineComment('end', it.trivia));
      return;
    case 'EventScript':
      lines.push(`on ${event(it.event)} do`);
      block(lines, it.body, INDENT);
      lines.push(withLineComment('end', it.trivia));
      return;
    case 'Raw':
      raw(lines, it.text, '', it.trivia);
      return;
  }
}

function event(e: EventSpec): string {
  switch (e.type) {
    case 'start':
      return 'start';
    case 'key':
      return `key ${escapeString(e.key)}`;
    case 'message':
      return `message ${escapeString(e.name)}`;
  }
}

/** Raw text keeps its own internal layout; only the first line is indented. */
function raw(lines: string[], text: string, ind: string, t: Trivia | undefined) {
  const parts = text.split('\n');
  parts[0] = ind + parts[0];
  parts[parts.length - 1] = withLineComment(parts[parts.length - 1]!, t);
  lines.push(...parts);
}

function block(lines: string[], b: Block, ind: string) {
  b.stmts.forEach((s, i) => {
    leading(lines, s.trivia, ind, i === 0);
    stmt(lines, s, ind);
  });
  if (b.trailing?.comments) {
    if (b.trailing.blankBefore && b.stmts.length) lines.push('');
    for (const c of b.trailing.comments) lines.push(ind + '--' + c);
  }
}

function stmt(lines: string[], s: Stmt, ind: string) {
  const inner = ind + INDENT;
  const compound = (header: string, body: Block) => {
    lines.push(ind + header);
    block(lines, body, inner);
    lines.push(withLineComment(ind + 'end', s.trivia));
  };
  switch (s.kind) {
    case 'LocalDecl':
      lines.push(withLineComment(`${ind}local ${s.name} = ${expr(s.init)}`, s.trivia));
      return;
    case 'Assign':
      lines.push(withLineComment(`${ind}${expr(s.target)} ${s.op} ${expr(s.value)}`, s.trivia));
      return;
    case 'CallStmt':
      lines.push(withLineComment(ind + expr(s.call), s.trivia));
      return;
    case 'WaitUntil':
      lines.push(withLineComment(`${ind}wait until ${expr(s.cond)}`, s.trivia));
      return;
    case 'Return':
      lines.push(
        withLineComment(s.value ? `${ind}return ${expr(s.value)}` : `${ind}return`, s.trivia),
      );
      return;
    case 'Raw':
      raw(lines, s.text, ind, s.trivia);
      return;
    case 'If': {
      lines.push(`${ind}if ${expr(s.cond)} then`);
      block(lines, s.then, inner);
      for (const e of s.elifs) {
        lines.push(`${ind}elseif ${expr(e.cond)} then`);
        block(lines, e.body, inner);
      }
      if (s.else) {
        lines.push(`${ind}else`);
        block(lines, s.else, inner);
      }
      lines.push(withLineComment(ind + 'end', s.trivia));
      return;
    }
    case 'Forever':
      return compound('forever do', s.body);
    case 'Repeat':
      return compound(`repeat ${expr(s.count)} do`, s.body);
    case 'RepeatUntil':
      return compound(`repeat until ${expr(s.cond)} do`, s.body);
    case 'While':
      return compound(`while ${expr(s.cond)} do`, s.body);
    case 'ForRange': {
      const step = s.step ? `, ${expr(s.step)}` : '';
      return compound(`for ${s.var} = ${expr(s.from)}, ${expr(s.to)}${step} do`, s.body);
    }
    case 'ForEach':
      return compound(`for ${s.var} in ${expr(s.list)} do`, s.body);
  }
}

function prec(e: Expr): number {
  switch (e.kind) {
    case 'Binary':
      return e.op === '^' ? PREC_POW : PREC[e.op]!;
    case 'Unary':
      return PREC_UNARY;
    case 'Num':
      return e.value < 0 || Object.is(e.value, -0) || e.raw?.startsWith('-')
        ? PREC_UNARY
        : PREC_ATOM;
    case 'Index':
    case 'Call':
      return PREC_POSTFIX;
    default:
      return PREC_ATOM;
  }
}

function wrap(e: Expr, needParens: boolean): string {
  return needParens ? `(${expr(e)})` : expr(e);
}

export function expr(e: Expr): string {
  switch (e.kind) {
    case 'Num':
      return e.raw ?? numberText(e.value);
    case 'Str':
      return escapeString(e.value);
    case 'Bool':
      return e.value ? 'true' : 'false';
    case 'List':
      return `[${e.items.map(expr).join(', ')}]`;
    case 'Var':
      return e.name;
    case 'Prop':
      return e.prop;
    case 'Call':
      return `${e.name}(${e.args.map(expr).join(', ')})`;
    case 'Index':
      return `${wrap(e.target, prec(e.target) < PREC_POSTFIX)}[${expr(e.index)}]`;
    case 'Unary': {
      const operand = wrap(e.operand, prec(e.operand) < PREC_UNARY);
      if (e.op === 'not') return `not ${operand}`;
      return operand.startsWith('-') ? `- ${operand}` : `-${operand}`;
    }
    case 'Binary': {
      const p = prec(e);
      const right = RIGHT_ASSOC.has(e.op);
      const l = wrap(e.left, right ? prec(e.left) <= p : prec(e.left) < p);
      // A prefix operator on the right can't capture the left operand, so `a ^ -b` needs no parens.
      const rp = prec(e.right);
      const r = wrap(e.right, rp === PREC_UNARY ? false : right ? rp < p : rp <= p);
      return `${l} ${e.op} ${r}`;
    }
  }
}

/** Numbers the grammar can read back: no exponent form, no NaN/Infinity literals. */
function numberText(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`cannot print non-finite number ${v}`);
  const s = String(v);
  if (!s.includes('e')) return s;
  return v.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
}
