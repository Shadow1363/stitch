import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createIdGen, reconcile, type Module, type Node } from '@stitch/ir';
import { moduleArb } from '@stitch/ir/arbitrary';
import { parse } from './parse';
import { printModule } from './print';

/** Every node id in a module, in document order. */
function ids(m: Module): string[] {
  const out: string[] = [];
  JSON.stringify(m, (k, v: unknown) => {
    if (k === 'id' && typeof v === 'string') out.push(v);
    return v;
  });
  return out;
}

const byKind = (m: Module) => {
  const map = new Map<string, string>();
  JSON.stringify(m, (_k, v: Partial<Node> & { name?: string }) => {
    if (v && typeof v === 'object' && v.id && v.kind) map.set(`${v.kind}:${v.name ?? ''}`, v.id);
    return v;
  });
  return map;
};

describe('reconcile', () => {
  const gen = createIdGen('t');

  it('keeps ids when text is unchanged', () => {
    const text = 'var a = 1\non start do\n  move(10)\nend\n';
    const old = parse(text, gen).module;
    const next = reconcile(old, parse(text, gen).module);
    expect(ids(next)).toEqual(ids(old));
  });

  it('keeps ids of untouched statements when one is edited, inserted or removed', () => {
    const old = parse('on start do\n  move(10)\n  turn(15)\n  say("hi")\nend', gen).module;
    const edited = reconcile(
      old,
      parse('on start do\n  move(99)\n  show()\n  say("hi")\nend', gen).module,
    );
    const o = byKind(old);
    const e = byKind(edited);
    expect(e.get('EventScript:')).toBe(o.get('EventScript:'));
    expect(e.get('Call:move')).toBe(o.get('Call:move'));
    expect(e.get('Call:say')).toBe(o.get('Call:say'));
    expect(e.get('Call:show')).not.toBe(o.get('Call:turn'));
  });

  it('follows a script that moved', () => {
    const old = parse('on start do\nend\non key "a" do\nend', gen).module;
    const next = reconcile(old, parse('on key "a" do\nend\non start do\nend', gen).module);
    expect(next.items.map((i) => i.id)).toEqual([old.items[1]!.id, old.items[0]!.id]);
  });

  it('never assigns one old id twice', () => {
    fc.assert(
      fc.property(moduleArb, moduleArb, (a, b) => {
        const old = parse(printModule(a), gen).module;
        const next = reconcile(old, parse(printModule(b), gen).module);
        const all = ids(next);
        expect(new Set(all).size).toBe(all.length);
      }),
      { numRuns: 200 },
    );
  });
});
