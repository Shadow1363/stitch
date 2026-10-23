import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as Blockly from 'blockly/core';
import { carryTextDetails, irEqual } from '@stitch/ir';
import { moduleArb } from '@stitch/ir/arbitrary';
import { parse, printModule } from '@stitch/lang';
import { fromBlocks } from './fromBlocks';
import type { BlockJson } from './json';
import { toBlocks } from './toBlocks';
import { functionsFlyout, toolbox, variablesFlyout } from './toolbox';
import { register } from './workspace';

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
