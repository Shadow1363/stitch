/**
 * The Examples cart: generated from the registry, it covers every built-in variable and every
 * variable kind, has no problems, and runs on World with NullRenderer.
 */
import { builtinVariableNames, SECTIONS } from '@stitch/blocks/registry';
import { composite, decodeLayers } from '@stitch/cart';
import { compile } from '@stitch/compiler';
import { IR_VERSION, type Project } from '@stitch/ir';
import { parse } from '@stitch/lang';
import { NullAsk, NullRenderer, World, type CostumeInfo, type Program } from '@stitch/runtime';
import { describe, expect, it } from 'vitest';
import { examplesCart } from './examples/build';

const { parts, sources } = examplesCart();

const project: Project = {
  irVersion: IR_VERSION,
  stage: parse(sources.stage!).module,
  sprites: parts.sprites.map((s) => ({
    id: s.id,
    name: s.name,
    module: parse(sources[s.id]!).module,
  })),
};

function costumes(): Record<string, CostumeInfo> {
  const out: Record<string, CostumeInfo> = {};
  for (const [id, a] of Object.entries(parts.assets)) {
    const img = decodeLayers(a.width, a.height, a.layers);
    out[id] = {
      id,
      name: a.name,
      width: a.width,
      height: a.height,
      center: a.center,
      pixelArt: true,
      pixels: composite(img, parts.palette),
    };
  }
  return out;
}

describe('Examples cart', () => {
  it('shows every built-in variable in the Inspector', () => {
    const missing = builtinVariableNames().filter((n) => !sources.inspector!.includes(`"${n}`));
    expect(missing).toEqual([]);
  });

  it('runs every variable-kind example from the reference, verbatim', () => {
    const kinds = SECTIONS.find((s) => s.id === 'variable-kinds')!.entries;
    expect(kinds.length).toBe(8);
    for (const k of kinds) expect(sources[k.id], k.id).toContain(k.example);
  });

  it('is canonical text and has no problems', () => {
    for (const [id, text] of Object.entries(sources))
      expect(parse(text).diagnostics, id).toEqual([]);
    const r = compile(
      project,
      parts.sprites.map((s) => s.id),
    );
    expect(r.diagnostics).toEqual([]);
  });

  it('runs for five seconds without errors, answering the Inspector when clicked', async () => {
    const r = compile(
      project,
      parts.sprites.map((s) => s.id),
    );
    const errors: string[] = [];
    const ask = new NullAsk(['Ada']);
    const world = new World({
      stage: parts.stage,
      sprites: parts.sprites,
      costumes: costumes(),
      ask,
      seed: 1,
      onError: (e) => errors.push(`${e.sprite} ${e.event}: ${String(e.error)}`),
    });
    world.load(new Function('rt', r.code) as Program);
    world.start();
    const renderer = new NullRenderer();
    const inspector = world.all.find((s) => s.name === 'Inspector')!;
    for (let i = 0; i < 300; i++) {
      if (i === 60) {
        world.input.pointerDown(inspector.x, inspector.y);
        world.input.pointerUp();
      }
      // Answers arrive through promises, which settle between frames.
      if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0));
      world.tick();
      renderer.render(world);
    }
    expect(errors).toEqual([]);
    expect(world.find('Function')?.sayText).toBe('42');
    expect(world.find('Global')?.sayText).toMatch(/^score: [1-9]/);
    expect(world.find('Shared')?.sayText).toBe('enemies: 2');
    expect(ask.prompts).toEqual(['']);
    expect(inspector.sayText).toBe('Hello, Ada');
  });
});
