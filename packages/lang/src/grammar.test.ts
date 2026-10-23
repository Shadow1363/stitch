import { describe, expect, it } from 'vitest';
import { stripIds, type Module } from '@stitch/ir';
import { parse } from './parse';

const firstStmts = (m: Module) => {
  const it = m.items[0];
  return it?.kind === 'EventScript' ? it.body.stmts : [];
};

const ok = (text: string) => {
  const r = parse(text);
  expect(r.diagnostics).toEqual([]);
  return stripIds(r.module);
};

describe('grammar', () => {
  it('parses variable declarations', () => {
    expect(ok('var a = 1\nglobal var b = "hi"').items).toEqual([
      { kind: 'VarDecl', scope: 'sprite', name: 'a', init: { kind: 'Num', value: 1 } },
      { kind: 'VarDecl', scope: 'global', name: 'b', init: { kind: 'Str', value: 'hi' } },
    ]);
  });

  it('parses literals and lists', () => {
    const m = ok('var l = [1, 2.50, "a\\n", true, false, []]');
    expect(m.items[0]).toMatchObject({
      init: {
        kind: 'List',
        items: [
          { kind: 'Num', value: 1 },
          { kind: 'Num', value: 2.5, raw: '2.50' },
          { kind: 'Str', value: 'a\n' },
          { kind: 'Bool', value: true },
          { kind: 'Bool', value: false },
          { kind: 'List', items: [] },
        ],
      },
    });
  });

  it('parses all three events', () => {
    const m = ok('on start do\nend\non key "space" do\nend\non message "hit" do\nend');
    expect(m.items.map((i) => (i.kind === 'EventScript' ? i.event : null))).toEqual([
      { type: 'start' },
      { type: 'key', key: 'space' },
      { type: 'message', name: 'hit' },
    ]);
  });

  it('parses control flow', () => {
    const m = ok(`on start do
  if a then
    b = 1
  elseif c then
    b = 2
  else
    b = 3
  end
  forever do
  end
  repeat 10 do
  end
  repeat until done do
  end
  while x < 10 do
  end
  for i = 1, 10, 2 do
  end
  for item in items do
  end
  wait until key_down("a")
end`);
    const s = firstStmts(m);
    expect(s.map((x) => x.kind)).toEqual([
      'If',
      'Forever',
      'Repeat',
      'RepeatUntil',
      'While',
      'ForRange',
      'ForEach',
      'WaitUntil',
    ]);
    expect(s[0]).toMatchObject({
      elifs: [{ cond: { kind: 'Var', name: 'c' } }],
      else: { stmts: [{ kind: 'Assign' }] },
    });
  });

  it('parses functions with return', () => {
    const m = ok('function add(a, b)\n  return a + b\nend\nfunction nothing()\n  return\nend');
    expect(m.items[0]).toMatchObject({
      kind: 'FunctionDef',
      name: 'add',
      params: ['a', 'b'],
      body: { stmts: [{ kind: 'Return', value: { kind: 'Binary', op: '+' } }] },
    });
    expect(m.items[1]).toMatchObject({ body: { stmts: [{ kind: 'Return' }] } });
  });

  it('maps sprite props and assignment operators', () => {
    const m = ok('on start do\n  x += 4\n  direction = 90\n  grid[1][2] = 0\nend');
    const s = firstStmts(m);
    expect(s[0]).toMatchObject({ kind: 'Assign', op: '+=', target: { kind: 'Prop', prop: 'x' } });
    expect(s[1]).toMatchObject({ target: { kind: 'Prop', prop: 'direction' } });
    expect(s[2]).toMatchObject({
      target: {
        kind: 'Index',
        target: { kind: 'Index', target: { kind: 'Var', name: 'grid' }, index: { value: 1 } },
        index: { value: 2 },
      },
    });
  });

  it('keeps wait() as a call while supporting wait until', () => {
    const m = ok('on start do\n  wait(1)\n  wait until x > 0\nend');
    const s = firstStmts(m);
    expect(s[0]).toMatchObject({ kind: 'CallStmt', call: { name: 'wait' } });
    expect(s[1]).toMatchObject({ kind: 'WaitUntil' });
  });

  it('allows contextual keywords as names', () => {
    expect(ok('var key = 1\nvar start = 2\nvar message = 3').items).toHaveLength(3);
  });

  it('respects operator precedence', () => {
    const e = (src: string) => {
      const m = ok(`var v = ${src}`);
      const it = m.items[0];
      return it?.kind === 'VarDecl' ? it.init : null;
    };
    expect(e('1 + 2 * 3')).toMatchObject({ op: '+', right: { op: '*' } });
    expect(e('-a ^ 2')).toMatchObject({ kind: 'Unary', operand: { op: '^' } });
    expect(e('a or b and c')).toMatchObject({ op: 'or', right: { op: 'and' } });
    expect(e('a .. b .. c')).toMatchObject({ op: '..', right: { op: '..' } });
    expect(e('2 ^ 3 ^ 2')).toMatchObject({ op: '^', right: { op: '^' } });
    expect(e('a - b - c')).toMatchObject({ op: '-', left: { op: '-' } });
    expect(e('not a == b')).toMatchObject({ op: '==', left: { kind: 'Unary', op: 'not' } });
    expect(e('a .. 1 + 2')).toMatchObject({ op: '..', right: { op: '+' } });
    expect(e('f(1)[2]')).toMatchObject({ kind: 'Index', target: { kind: 'Call' } });
  });

  it('folds negative number literals', () => {
    const m = ok('var a = -5\nvar b = - -5\nvar c = -speed');
    const inits = m.items.map((i) => (i.kind === 'VarDecl' ? i.init : null));
    expect(inits[0]).toEqual({ kind: 'Num', value: -5 });
    expect(inits[1]).toEqual({ kind: 'Unary', op: '-', operand: { kind: 'Num', value: -5 } });
    expect(inits[2]).toMatchObject({ kind: 'Unary', operand: { kind: 'Var' } });
  });

  it('attaches comments and blank lines', () => {
    const m = ok('-- header\nvar a = 1 -- trailing\n\n-- about b\nvar b = 2\n-- end of file\n');
    expect(m.items[0]!.trivia).toEqual({ comments: [' header'], lineComment: ' trailing' });
    expect(m.items[1]!.trivia).toEqual({ comments: [' about b'], blankBefore: true });
    expect(m.trailing).toEqual({ comments: [' end of file'] });
  });

  it('reports positions for syntax errors', () => {
    const r = parse('on start do\n  x = = 2\nend');
    expect(r.diagnostics.length).toBeGreaterThan(0);
    expect(r.diagnostics[0]!.from).toBeGreaterThanOrEqual(14);
  });
});
