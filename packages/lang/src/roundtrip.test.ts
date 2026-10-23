import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { irEqual, type Expr, type Module, type Stmt } from '@stitch/ir';
import { parse } from './parse';
import { printModule } from './print';

const canon = (t: string) => printModule(parse(t).module);

const FIXTURES: Record<string, string> = {
  sample: `-- Arrow keys steer; the sprite bounces off edges.
var vx = 3
var vy = 2

on start do
  goto(0, 0)
  forever do
    if key_down("left") then
      vx -= 0.5
    end
    x += vx -- move
    y += vy
    local edge = on_edge()
    if edge == "left" or edge == "right" then
      vx = -vx
    end
    clamp_to_stage()
  end
end
`,
  everything: `global var score = 0
var items = [1, "two", [3]]

function fact(n)
  if n <= 1 then
    return 1
  end
  return n * fact(n - 1)
end

on key "space" do
  broadcast("jump")
  say_for("hi" .. score, 2)
end

on message "jump" do
  repeat 10 do
    y += 2
  end
  repeat until y <= 0 do
    y -= 1
  end
  for i = 1, len(items) do
    print(items[i])
  end
  for it in items do
    push(items, it)
  end
  while not key_down("a") and timer() < 3 do
    turn(15)
  end
  wait until x > 10
  items[1] = (1 + 2) * 3 ^ -2
end
`,
  comments: `-- top
on start do -- header comment moves into the body
  -- first
  x = 1

  -- after blank
  y = 2 -- same line
  -- trailing in block
end -- after end
-- bottom
`,
};

describe('round-trip (canonical)', () => {
  for (const [name, text] of Object.entries(FIXTURES)) {
    it(`${name}: print(parse(t)) is a fixed point`, () => {
      const once = canon(text);
      expect(canon(once)).toBe(once);
      expect(irEqual(parse(once).module, parse(text).module)).toBe(true);
    });
  }

  it('sample is already canonical', () => {
    expect(canon(FIXTURES.sample!)).toBe(FIXTURES.sample);
    expect(canon(FIXTURES.everything!)).toBe(FIXTURES.everything);
  });

  it('normalizes whitespace and redundant parens', () => {
    expect(canon('var   a=( 1+2 )\n\n\n\nvar b=a*(2)')).toBe('var a = 1 + 2\n\nvar b = a * 2\n');
  });

  it('moves header comments into the body without losing them', () => {
    const out = canon(FIXTURES.comments!);
    for (const c of [
      'top',
      'header comment',
      'first',
      'after blank',
      'same line',
      'trailing in block',
      'after end',
      'bottom',
    ])
      expect(out).toContain(c);
  });
});

// ---- property test: random IR -> print -> parse ≅ IR ----

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

const exprArb: fc.Arbitrary<Expr> = fc
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
        .tuple(fc.constantFrom('abs', 'max', 'f'), fc.array(tie('e'), { maxLength: 2 }))
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

const stmtArb: fc.Arbitrary<Stmt> = fc.letrec<{ s: Stmt }>((tie) => {
  const body = fc.array(tie('s'), { maxLength: 3 }).map((stmts) => ({ stmts }));
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
      fc.array(exprArb, { maxLength: 2 }).map((args): Stmt => ({
        id: id(),
        kind: 'CallStmt',
        call: { id: id(), kind: 'Call', name: 'say', args },
      })),
      fc
        .tuple(exprArb, body, fc.option(body, { nil: undefined }))
        .map(([cond, then, els]): Stmt =>
          els
            ? { id: id(), kind: 'If', cond, then, elifs: [], else: els }
            : { id: id(), kind: 'If', cond, then, elifs: [] },
        ),
      body.map((b): Stmt => ({ id: id(), kind: 'Forever', body: b })),
      fc
        .tuple(exprArb, body)
        .map(([count, b]): Stmt => ({ id: id(), kind: 'Repeat', count, body: b })),
      fc
        .tuple(exprArb, body)
        .map(([cond, b]): Stmt => ({ id: id(), kind: 'While', cond, body: b })),
      fc.tuple(name, exprArb, exprArb, body).map(([v, from, to, b]): Stmt => ({
        id: id(),
        kind: 'ForRange',
        var: v,
        from,
        to,
        body: b,
      })),
      exprArb.map((cond): Stmt => ({ id: id(), kind: 'WaitUntil', cond })),
    ),
  };
}).s;

const moduleArb: fc.Arbitrary<Module> = fc
  .tuple(
    fc.array(stmtArb, { maxLength: 4 }),
    fc.option(exprArb, { nil: undefined }),
    fc.array(
      fc.string({ maxLength: 8 }).filter((s) => !s.includes('\n')),
      { maxLength: 2 },
    ),
  )
  .map(([stmts, ret, comments]): Module => {
    const all: Stmt[] = ret ? [...stmts, { id: id(), kind: 'Return', value: ret }] : stmts;
    return {
      items: [
        {
          id: id(),
          kind: 'VarDecl',
          scope: 'sprite',
          name: 'a',
          init: { id: id(), kind: 'Num', value: 0 },
          ...(comments.length ? { trivia: { comments } } : {}),
        },
        { id: id(), kind: 'FunctionDef', name: 'f', params: ['a', 'b'], body: { stmts: all } },
      ],
    };
  });

describe('round-trip (property)', () => {
  it('parse(print(ir)) ≅ ir for random programs', () => {
    fc.assert(
      fc.property(moduleArb, (m) => {
        const text = printModule(m);
        const r = parse(text);
        if (r.diagnostics.length)
          throw new Error(`diagnostics for:\n${text}\n${JSON.stringify(r.diagnostics)}`);
        if (!irEqual(r.module, m)) throw new Error(`mismatch for:\n${text}`);
        expect(printModule(r.module)).toBe(text);
      }),
      { numRuns: 400 },
    );
  });
});
