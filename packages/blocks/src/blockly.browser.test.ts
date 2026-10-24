import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as Blockly from 'blockly/core';
import { carryTextDetails, createCatalog, irEqual, validateManifest } from '@stitch/ir';
import { moduleArb } from '@stitch/ir/arbitrary';
import { parse, printModule } from '@stitch/lang';
import { fromBlocks } from './fromBlocks';
import type { BlockJson } from './json';
import { toBlocks } from './toBlocks';
import { functionsFlyout, toolbox, variablesFlyout } from './toolbox';
import { defineExtensionBlocks, register } from './workspace';

register();

/** Loads blocks into a real (headless) Blockly workspace and saves them back. */
function throughBlockly(blocks: BlockJson[]): BlockJson[] {
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks } }, ws);
    const saved = Blockly.serialization.workspaces.save(ws) as {
      blocks?: { blocks?: BlockJson[] };
    };
    return saved.blocks?.blocks ?? [];
  } finally {
    ws.dispose();
  }
}

describe('real Blockly', () => {
  it('round-trips random programs through load/save without losing anything', () => {
    fc.assert(
      fc.property(moduleArb, (m) => {
        const back = carryTextDetails(m, fromBlocks(throughBlockly(toBlocks(m))).module);
        if (!irEqual(back, m))
          throw new Error(`mismatch:\n${printModule(m)}\n---\n${printModule(back)}`);
      }),
      { numRuns: 150 },
    );
  });

  it('keeps comments, warp, raw code and else-if chains', () => {
    const text = `-- the main loop
on start do
  -- step
  if a then
    move(1)
  elseif b then
    move(2)
  elseif c then
    move(3)
  else
    move(4)
  end
end

warp function fill(n, m)
  return n
end

x = = 1
`;
    const m = parse(text).module;
    const back = carryTextDetails(m, fromBlocks(throughBlockly(toBlocks(m))).module);
    expect(printModule(back)).toBe(printModule(m));
  });

  it('builds every toolbox and flyout block', () => {
    const items: { type?: string; kind: string }[] = [];
    for (const c of toolbox().contents) if ('contents' in c) items.push(...c.contents);
    items.push(
      ...variablesFlyout({ vars: ['score'], functions: [] }),
      ...functionsFlyout({ vars: [], functions: [{ name: 'jump', params: ['h'] }] }),
    );
    const ws = new Blockly.Workspace();
    for (const it of items) {
      if (it.kind !== 'block') continue;
      const { kind: _kind, ...state } = it;
      expect(
        () => Blockly.serialization.blocks.append(state as Blockly.serialization.blocks.State, ws),
        it.type,
      ).not.toThrow();
    }
    expect(ws.getTopBlocks(false).length).toBe(items.filter((i) => i.kind === 'block').length);
    ws.dispose();
  });
});

describe('extension blocks in real Blockly', () => {
  it('register from a catalog and round-trip', () => {
    const r = validateManifest({
      id: 'ext',
      name: 'Ext',
      version: '1',
      color: '#336699',
      blocks: [
        {
          name: 'ext_go',
          kind: 'command',
          label: 'go %2 then %1',
          params: [{ name: 'a' }, { name: 'b', type: 'number' }],
        },
        { name: 'ext_val', kind: 'reporter', label: 'value', params: [], returns: 'boolean' },
      ],
    });
    if (!r.ok) throw new Error(r.errors.join());
    const catalog = createCatalog([r.manifest]);
    defineExtensionBlocks(catalog);
    const m = parse(
      'on start do\n  ext_go("x", 3)\n  if ext_val() then\n    move(1)\n  end\nend',
    ).module;
    const saved = throughBlockly(toBlocks(m, {}, catalog));
    expect(JSON.stringify(saved)).toContain('stitch_b_ext_go');
    const back = fromBlocks(saved, catalog).module;
    expect(printModule(back)).toBe(printModule(m));
  });
});

describe('BlocksWorkspace linking', () => {
  const surfaces = {
    workspace: '#ffffff',
    toolbox: '#ffffff',
    flyout: '#eeeeee',
    text: '#000000',
    muted: '#666666',
    font: 'sans-serif',
  };

  it('glows a block by IR id, finds the top block in view, and reports user selection', async () => {
    const { BlocksWorkspace } = await import('./workspace');
    const host = document.createElement('div');
    host.style.cssText = 'width: 600px; height: 400px';
    document.body.append(host);
    const selected: string[][] = [];
    const ws = new BlocksWorkspace(host, {
      surfaces,
      onChange: () => {},
      onLayout: () => {},
      onUndo: () => {},
      onRedo: () => {},
      info: () => ({ vars: [], functions: [] }),
      onSelect: (ids) => selected.push(ids),
    });
    try {
      const r = parse('on start do\n  move(10)\nend\n\non click do\n  turn(5)\nend');
      ws.show(r.module, {}, []);
      const script = r.module.items[0]!;
      if (script.kind !== 'EventScript') throw new Error('expected a script');
      const move = script.body.stmts[0]!;
      expect(ws.highlight(move.id)).toBe(true);
      expect(ws.highlight('nope')).toBe(false);
      expect(ws.topBlockInView()).toBe(script.id);
      Blockly.common.setSelected(ws.ws.getBlockById(move.id)!);
      // Blockly fires events in a batch after the current task.
      await new Promise((r) => setTimeout(r, 20));
      expect(selected.at(-1)).toEqual([move.id, script.id]);
    } finally {
      ws.dispose();
      host.remove();
    }
  });
});
