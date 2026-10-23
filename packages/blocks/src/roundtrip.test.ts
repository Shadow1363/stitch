import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { BUILTINS, carryTextDetails, irEqual, stripIds } from '@stitch/ir';
import { moduleArb } from '@stitch/ir/arbitrary';
import { parse, printModule } from '@stitch/lang';
import { DEFINITIONS } from './definitions';
import { fromBlocks } from './fromBlocks';
import { BUILTIN_LABELS, blockTypeOf } from './labels';
import { toBlocks } from './toBlocks';

/** Comments other than leading ones are text-only; blocks carry leading comments. */
const roundTrip = (text: string) => fromBlocks(toBlocks(parse(text).module)).module;

describe('IR <-> blocks', () => {
  it('round-trips random programs: fromBlocks(toBlocks(ir)) ≅ ir', () => {
    fc.assert(
      fc.property(moduleArb, (m) => {
        // The editor carries text-only details (blank lines, comment spelling) across by id.
        const back = carryTextDetails(m, fromBlocks(toBlocks(m)).module);
        if (!irEqual(back, m)) {
          throw new Error(
            `mismatch:\n${printModule(m)}\n---\n${printModule(back)}\n${JSON.stringify(stripIds(back))}`,
          );
        }
      }),
      { numRuns: 500 },
    );
  });

  it('keeps node ids as block ids', () => {
    const m = parse('on start do\n  move(10)\nend').module;
    const blocks = toBlocks(m);
    expect(blocks[0]!.id).toBe(m.items[0]!.id);
    const back = fromBlocks(blocks).module;
    expect(back.items[0]!.id).toBe(m.items[0]!.id);
  });

  it('uses builtin blocks, typed-in shadows, and generic calls for odd arities', () => {
    const m = parse(
      'function f(a)\nend\non start do\n  move(10)\n  move(1, 2)\n  f(x)\nend',
    ).module;
    const ev = toBlocks(m)[1]!;
    const move = ev.next!.block!;
    expect(move.type).toBe('stitch_b_move');
    expect(move.inputs!.ARG0!.shadow).toMatchObject({ type: 'stitch_num', fields: { NUM: 10 } });
    expect(move.next!.block!.type).toBe('stitch_call');
    const fx = move.next!.block!.next!.block!;
    expect(fx).toMatchObject({
      type: 'stitch_call',
      fields: { NAME: 'f' },
      extraState: { args: 1 },
    });
    expect(fx.inputs!.ARG0!.block!.type).toBe('stitch_prop');
  });

  it('keeps leading comments as block comments', () => {
    const back = roundTrip('-- start here\non start do\n  -- say hi\n  say("hi")\nend');
    expect(printModule(back)).toBe('-- start here\non start do\n  -- say hi\n  say("hi")\nend\n');
  });

  it('separates loose blocks from the program and records positions', () => {
    const blocks = toBlocks(parse('on start do\nend').module, {});
    blocks[0]!.x = 10;
    blocks[0]!.y = 20;
    const loose = { type: 'stitch_b_move', id: 'L1', x: 300, y: 0, inputs: {} };
    const r = fromBlocks([...blocks, loose]);
    expect(r.module.items).toHaveLength(1);
    expect(r.loose).toEqual([loose]);
    expect(r.layout).toEqual({ [blocks[0]!.id]: { x: 10, y: 20 } });
  });

  it('reads empty inputs as neutral values', () => {
    const r = fromBlocks([
      {
        type: 'stitch_on_start',
        id: 'e',
        next: {
          block: {
            type: 'controls_if',
            id: 'i',
            inputs: { DO0: { block: { type: 'stitch_b_move', id: 'm' } } },
          },
        },
      },
    ]);
    expect(printModule(r.module)).toBe('on start do\n  if false then\n    move(0)\n  end\nend\n');
  });
});

describe('definitions', () => {
  it('cover every builtin with a label whose %n match its parameters', () => {
    const types = new Set(DEFINITIONS.map((d) => d.type));
    for (const b of BUILTINS.values()) {
      expect(types.has(blockTypeOf(b)), b.name).toBe(true);
      const used = [...(BUILTIN_LABELS[b.name] ?? '').matchAll(/%(\d+)/g)]
        .map((m) => Number(m[1]))
        .sort();
      expect(used, b.name).toEqual(b.params.map((_, i) => i + 1));
    }
  });

  it('have unique types', () => {
    const types = DEFINITIONS.map((d) => d.type);
    expect(new Set(types).size).toBe(types.length);
  });
});
