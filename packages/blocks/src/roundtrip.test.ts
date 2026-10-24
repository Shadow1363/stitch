import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  BUILTINS,
  carryTextDetails,
  createCatalog,
  irEqual,
  stripIds,
  validateManifest,
} from '@stitch/ir';
import { moduleArb } from '@stitch/ir/arbitrary';
import { parse, printModule } from '@stitch/lang';
import { DEFINITIONS, extensionDefinitions } from './definitions';
import { fromBlocks } from './fromBlocks';
import { BUILTIN_LABELS, blockTypeOf } from './labels';
import { toBlocks } from './toBlocks';
import { toolbox, type ToolboxItem } from './toolbox';

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

describe('every block round-trips through text', () => {
  /** A call to `b` with an argument of each parameter's type. */
  const callText = (name: string) => {
    const b = BUILTINS.get(name)!;
    const args = b.params.map((p, i) =>
      p.type === 'number' ? String(i + 1) : p.type === 'boolean' ? 'true' : `"a${i}"`,
    );
    return `${name}(${args.join(', ')})`;
  };

  it.each([...BUILTINS.keys()])('%s', (name) => {
    const b = BUILTINS.get(name)!;
    const line = b.kind === 'command' ? callText(name) : `local v = ${callText(name)}`;
    const text = `on start do\n  ${line}\nend\n`;
    const m = parse(text).module;
    const json = JSON.stringify(toBlocks(m));
    expect(json).toContain(`"${blockTypeOf(b)}"`);
    expect(printModule(fromBlocks(toBlocks(m)).module)).toBe(text);
  });

  it.each([
    [
      'break and continue',
      'on start do\n  forever do\n    if x > 1 then\n      break\n    end\n    continue\n  end\nend\n',
      ['stitch_break', 'stitch_continue'],
    ],
    [
      'clone and click hats',
      'on clone do\n  say("hi")\nend\non click do\n  delete_clone()\nend\n',
      ['stitch_on_clone', 'stitch_on_click'],
    ],
    [
      'shared variables',
      'shared var hits = 0\nvar hp = 3\nglobal var level = 1\n',
      ['"SCOPE":"shared"'],
    ],
  ])('%s', (_name, text, expected) => {
    const m = parse(text).module;
    const json = JSON.stringify(toBlocks(m));
    for (const e of expected) expect(json).toContain(e);
    expect(printModule(fromBlocks(toBlocks(m)).module)).toBe(text);
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

describe('extension blocks', () => {
  const r = validateManifest({
    id: 'text',
    name: 'Text tools',
    version: '1.0.0',
    color: '#2e8b57',
    blocks: [
      {
        name: 'text_upper',
        kind: 'reporter',
        label: 'uppercase %1',
        params: [{ name: 's', type: 'string', default: 'hi' }],
      },
      {
        name: 'text_ping',
        kind: 'command',
        label: 'ping %1',
        params: [{ name: 'n', type: 'number' }],
      },
    ],
  });
  if (!r.ok) throw new Error(r.errors.join());
  const catalog = createCatalog([r.manifest]);
  const src = 'on start do\n  text_ping(3)\n  say(text_upper("a"))\nend';

  it('get their own blocks with the catalog, generic calls without it', () => {
    const m = parse(src).module;
    const json = JSON.stringify(toBlocks(m, {}, catalog));
    expect(json).toContain('"stitch_b_text_ping"');
    expect(json).toContain('"stitch_r_text_upper"');
    expect(JSON.stringify(toBlocks(m))).not.toContain('stitch_b_text_ping');
    const back = fromBlocks(toBlocks(m, {}, catalog), catalog).module;
    expect(printModule(back)).toBe(printModule(m));
  });

  it('are defined in the extension colour with their manifest label', () => {
    const defs = extensionDefinitions(catalog);
    expect(defs.map((d) => d.type)).toEqual(['stitch_r_text_upper', 'stitch_b_text_ping']);
    expect(defs[0]).toMatchObject({ message0: 'uppercase %1', colour: '#2e8b57', output: null });
    expect(defs[1]).toMatchObject({ message0: 'ping %1', previousStatement: null });
  });

  it('get a toolbox category with their defaults', () => {
    const cats = toolbox(catalog).contents;
    const ext = cats[cats.length - 1] as { name: string; colour: string; contents: ToolboxItem[] };
    expect(ext).toMatchObject({ name: 'Text tools', colour: '#2e8b57' });
    expect(ext.contents.map((i) => i.type)).toEqual(['stitch_r_text_upper', 'stitch_b_text_ping']);
    expect(ext.contents[0]!.inputs!.ARG0!.shadow!.fields).toEqual({ TEXT: 'hi' });
    expect(toolbox().contents).toHaveLength(cats.length - 1);
  });
});
