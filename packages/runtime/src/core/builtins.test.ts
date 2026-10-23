import { describe, expect, it } from 'vitest';
import { BUILTINS } from '@stitch/ir';
import { DEFAULT_STAGE, normalizeStage } from '@stitch/cart';
import { createBuiltins } from './builtins';
import { World } from './world';

const box = {
  id: 'box',
  name: 'box',
  width: 20,
  height: 20,
  center: [10, 10] as [number, number],
  pixelArt: false,
};
const world = (stage = DEFAULT_STAGE) =>
  new World({
    stage,
    sprites: [
      {
        id: 'p',
        name: 'P',
        x: 0,
        y: 0,
        direction: 90,
        size: 100,
        visible: true,
        layer: 0,
        costumes: ['box'],
        costume: 1,
      },
    ],
    costumes: { box },
    seed: 42,
  });

describe('runtime builtins', () => {
  it('implements exactly the catalog', () => {
    const impl = Object.keys(createBuiltins(world())).sort();
    expect(impl).toEqual([...BUILTINS.keys()].sort());
  });

  it('marks generator builtins as yielding in the catalog', () => {
    const lib = createBuiltins(world()) as Record<string, unknown>;
    for (const [name, def] of BUILTINS) {
      const isGen =
        (lib[name] as { constructor: { name: string } }).constructor.name === 'GeneratorFunction';
      expect([name, isGen]).toEqual([name, def.yields === true]);
    }
  });

  it('reports edges visually and clamps without fencing (D1, D3)', () => {
    const w = world();
    const b = createBuiltins(w);
    const S = w.all[0]!;
    S.x = 500; // fully off-stage: allowed, nothing moves it back implicitly
    expect(S.x).toBe(500);
    expect(b.on_edge(S)).toBe('right');
    b.clamp_to_stage(S);
    expect(S.x).toBeCloseTo(230);
    expect(b.on_edge(S)).toBe('');
    S.y = 175;
    expect(b.on_edge(S)).toBe('top');
  });

  it('reports the same visual edge under a y-down, top-left stage', () => {
    const w = world(normalizeStage({ origin: 'top-left', yAxis: 'down' }));
    const S = w.all[0]!;
    const b = createBuiltins(w);
    S.x = 100;
    S.y = 2; // near the top of the screen in y-down space
    expect(b.on_edge(S)).toBe('top');
    S.y = 355;
    expect(b.on_edge(S)).toBe('bottom');
  });

  it('bounce reflects direction off the edge and puts the sprite back on stage', () => {
    const w = world();
    const b = createBuiltins(w);
    const S = w.all[0]!;
    S.x = 235;
    S.direction = 45;
    b.bounce(S);
    expect(S.direction).toBeCloseTo(-45);
    expect(b.on_edge(S)).toBe('');
  });

  it('points and measures using visual directions (D10)', () => {
    const w = world();
    const b = createBuiltins(w);
    const S = w.all[0]!;
    expect(b.angle_to(S, 0, 10)).toBeCloseTo(0);
    expect(b.angle_to(S, 10, 0)).toBeCloseTo(90);
    b.point_towards(S, -10, 0);
    expect(S.direction).toBeCloseTo(-90);
    expect(b.distance_to(S, 3, 4)).toBe(5);
    b.move(S, 10);
    expect(S.x).toBeCloseTo(-10);
  });

  it('switches costumes by name or wrapped number', () => {
    const w = new World({
      stage: DEFAULT_STAGE,
      sprites: [
        {
          id: 'p',
          name: 'P',
          x: 0,
          y: 0,
          direction: 90,
          size: 100,
          visible: true,
          layer: 0,
          costumes: ['a', 'b'],
          costume: 1,
        },
      ],
      costumes: { a: { ...box, id: 'a', name: 'walk1' }, b: { ...box, id: 'b', name: 'walk2' } },
    });
    const b = createBuiltins(w);
    const S = w.all[0]!;
    b.costume(S, 'walk2');
    expect(S.costume_number).toBe(2);
    b.costume(S, 3);
    expect(S.costume_number).toBe(1);
    b.next_costume(S);
    expect(S.costume_number).toBe(2);
  });

  it('random is inclusive for integers and seeded', () => {
    const b = createBuiltins(world());
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(b.random(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
    const f = b.random(0, 0.5);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(0.5);
  });
});
