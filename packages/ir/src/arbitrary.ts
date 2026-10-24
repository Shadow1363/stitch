/**
 * fast-check arbitraries for IR, shared by round-trip tests (text and blocks).
 * Test-only: imported via `@stitch/ir/arbitrary`.
 */
import fc from 'fast-check';
import type { Expr, Module, Stmt, TopItem } from './nodes';

let nextId = 0;
const id = () => `g${++nextId}`;
const NAMES = ['a', 'b', 'speed', 'items'];
const name = fc.constantFrom(...NAMES);
const BIN = [
  'or',
  'and',
  '==',
  '~=',
  '<',
  '<=',
  '>',
  '>=',
  '..',
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
] as const;

/** `-` applied to a non-negative literal is always read back as a negative literal. */
function validNegation(e: Expr): boolean {
  if (
    e.kind === 'Unary' &&
    e.op === '-' &&
    e.operand.kind === 'Num' &&
    e.operand.value >= 0 &&
    !Object.is(e.operand.value, -0)
  )
    return false;
  if (e.kind === 'Num' && Object.is(e.value, -0)) return false;
  const kids: Expr[] =
    e.kind === 'List'
      ? e.items
      : e.kind === 'Call'
        ? e.args
        : e.kind === 'Index'
          ? [e.target, e.index]
          : e.kind === 'Unary'
            ? [e.operand]
            : e.kind === 'Binary'
              ? [e.left, e.right]
              : [];
  return kids.every(validNegation);
}

export const exprArb: fc.Arbitrary<Expr> = fc
  .letrec<{ e: Expr }>((tie) => ({
    e: fc.oneof(
      { depthSize: 'small', withCrossShrink: true },
      fc.integer({ min: -1000, max: 1000 }).map((v): Expr => ({ id: id(), kind: 'Num', value: v })),
      fc
        .double({ min: 0, max: 1000, noNaN: true })
        .map((v): Expr => ({ id: id(), kind: 'Num', value: Math.round(v * 100) / 100 })),
      fc.string({ maxLength: 6 }).map((v): Expr => ({ id: id(), kind: 'Str', value: v })),
      fc.boolean().map((v): Expr => ({ id: id(), kind: 'Bool', value: v })),
      name.map((n): Expr => ({ id: id(), kind: 'Var', name: n })),
      fc
        .constantFrom('x', 'y', 'direction', 'size', 'costume_number' as const)
        .map((p): Expr => ({ id: id(), kind: 'Prop', prop: p })),
      fc
        .array(tie('e'), { maxLength: 3 })
        .map((items): Expr => ({ id: id(), kind: 'List', items })),
      fc
        .tuple(
          fc.constantFrom('abs', 'max', 'f', 'move', 'timer', 'random'),
          fc.array(tie('e'), { maxLength: 2 }),
        )
        .map(([n, args]): Expr => ({ id: id(), kind: 'Call', name: n, args })),
      fc
        .tuple(tie('e'), tie('e'))
        .map(([t, i]): Expr => ({ id: id(), kind: 'Index', target: t, index: i })),
      fc
        .tuple(fc.constantFrom('-', 'not' as const), tie('e'))
        .map(([op, operand]): Expr => ({ id: id(), kind: 'Unary', op, operand })),
      fc
        .tuple(fc.constantFrom(...BIN), tie('e'), tie('e'))
        .map(([op, left, right]): Expr => ({ id: id(), kind: 'Binary', op, left, right })),
    ),
  }))
  .e.filter(validNegation);

/** Statements that may only end a block. */
const capArb = fc.option(fc.constantFrom('Break', 'Continue' as const), { nil: undefined });

export const stmtArb: fc.Arbitrary<Stmt> = fc.letrec<{ s: Stmt }>((tie) => {
  const body = fc
    .tuple(fc.array(tie('s'), { maxLength: 3 }), capArb)
    .map(([stmts, cap]) => ({ stmts: cap ? [...stmts, { id: id(), kind: cap } as Stmt] : stmts }));
  return {
    s: fc.oneof(
      { depthSize: 'small' },
      fc
        .tuple(name, exprArb)
        .map(([n, init]): Stmt => ({ id: id(), kind: 'LocalDecl', name: n, init })),
      fc
        .tuple(name, fc.constantFrom('=', '+=', '-=', '*=', '/=' as const), exprArb)
        .map(([n, op, value]): Stmt => ({
          id: id(),
          kind: 'Assign',
          target: { id: id(), kind: 'Var', name: n },
          op,
          value,
        })),
      fc.tuple(fc.constantFrom('x', 'direction' as const), exprArb).map(([p, value]): Stmt => ({
        id: id(),
        kind: 'Assign',
        target: { id: id(), kind: 'Prop', prop: p },
        op: '+=',
        value,
      })),
      fc.tuple(name, exprArb, exprArb).map(([n, i, value]): Stmt => ({
        id: id(),
        kind: 'Assign',
        target: { id: id(), kind: 'Index', target: { id: id(), kind: 'Var', name: n }, index: i },
        op: '=',
        value,
      })),
      fc
        .tuple(
          fc.constantFrom('say', 'move', 'wait', 'f', 'timer'),
          fc.array(exprArb, { maxLength: 2 }),
        )
        .map(([n, args]): Stmt => ({
          id: id(),
          kind: 'CallStmt',
          call: { id: id(), kind: 'Call', name: n, args },
        })),
      fc
        .tuple(
          exprArb,
          body,
          fc.array(fc.tuple(exprArb, body), { maxLength: 2 }),
          fc.option(body, { nil: undefined }),
        )
        .map(([cond, then, elifs, els]): Stmt => {
          const e = elifs.map(([c, b]) => ({ id: id(), cond: c, body: b }));
          return els
            ? { id: id(), kind: 'If', cond, then, elifs: e, else: els }
            : { id: id(), kind: 'If', cond, then, elifs: e };
        }),
      body.map((b): Stmt => ({ id: id(), kind: 'Forever', body: b })),
      fc
        .tuple(exprArb, body)
        .map(([count, b]): Stmt => ({ id: id(), kind: 'Repeat', count, body: b })),
      fc
        .tuple(exprArb, body)
        .map(([cond, b]): Stmt => ({ id: id(), kind: 'RepeatUntil', cond, body: b })),
      fc
        .tuple(exprArb, body)
        .map(([cond, b]): Stmt => ({ id: id(), kind: 'While', cond, body: b })),
      fc
        .tuple(name, exprArb, exprArb, fc.option(exprArb, { nil: undefined }), body)
        .map(([v, from, to, step, b]): Stmt =>
          step
            ? { id: id(), kind: 'ForRange', var: v, from, to, step, body: b }
            : { id: id(), kind: 'ForRange', var: v, from, to, body: b },
        ),
      fc
        .tuple(name, exprArb, body)
        .map(([v, list, b]): Stmt => ({ id: id(), kind: 'ForEach', var: v, list, body: b })),
      exprArb.map((cond): Stmt => ({ id: id(), kind: 'WaitUntil', cond })),
    ),
  };
}).s;

const comments = fc.array(
  fc.string({ maxLength: 8 }).filter((s) => !s.includes('\n')),
  { maxLength: 2 },
);

const bodyWithReturn = fc
  .tuple(
    fc.array(stmtArb, { maxLength: 4 }),
    fc.option(fc.option(exprArb, { nil: undefined }), { nil: null }),
  )
  .map(([stmts, ret]) => {
    if (ret === null) return { stmts };
    const r: Stmt = ret ? { id: id(), kind: 'Return', value: ret } : { id: id(), kind: 'Return' };
    return { stmts: [...stmts, r] };
  });

export const topItemArb: fc.Arbitrary<TopItem> = fc.oneof(
  fc
    .tuple(fc.constantFrom('sprite', 'shared', 'global' as const), name, exprArb, comments)
    .map(([scope, n, init, c]): TopItem => ({
      id: id(),
      kind: 'VarDecl',
      scope,
      name: n,
      init,
      ...(c.length ? { trivia: { comments: c } } : {}),
    })),
  fc
    .tuple(name, fc.array(name, { maxLength: 2 }), fc.boolean(), bodyWithReturn)
    .map(([n, params, warp, body]): TopItem =>
      warp
        ? { id: id(), kind: 'FunctionDef', warp, name: n, params, body }
        : { id: id(), kind: 'FunctionDef', name: n, params, body },
    ),
  fc
    .tuple(
      fc.oneof(
        fc.constant({ type: 'start' as const }),
        fc.constant({ type: 'clone' as const }),
        fc.constant({ type: 'click' as const }),
        fc.constantFrom('space', 'left', 'a').map((key) => ({ type: 'key' as const, key })),
        fc.string({ maxLength: 5 }).map((n) => ({ type: 'message' as const, name: n })),
      ),
      fc.array(stmtArb, { maxLength: 4 }),
    )
    .map(([event, stmts]): TopItem => ({ id: id(), kind: 'EventScript', event, body: { stmts } })),
);

export const moduleArb: fc.Arbitrary<Module> = fc
  .array(topItemArb, { maxLength: 4 })
  .map((items) => ({ items }));
