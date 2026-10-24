import { describe, expect, it } from 'vitest';
import { normalizeStage } from '@stitch/cart';
import { createBuiltins } from './builtins';
import { World, type MapInit } from './world';

const map = (): MapInit => ({
  tileset: 't',
  tileSize: 10,
  width: 4,
  height: 3,
  cells: new Uint16Array([1, 0, 0, 2, 0, 3, 0, 0, 0, 0, 0, 4]),
});
const world = (stage = normalizeStage({ width: 40, height: 30 })) =>
  new World({ stage, sprites: [], costumes: {}, map: map() });

describe('tile map builtins', () => {
  it('reads cells under cart coordinates (centre origin, y up)', () => {
    const b = createBuiltins(world());
    // stage px (0,0) is cart (-20, 15)
    expect(b.tile_at(-20, 15)).toBe(1);
    expect(b.tile_at(15, 10)).toBe(2);
    expect(b.tile_at(-5, 0)).toBe(3);
    expect(b.tile_at(19, -14)).toBe(4);
    expect(b.tile_at(100, 0)).toBe(0);
  });

  it('reads the same cells under a top-left, y-down stage', () => {
    const b = createBuiltins(
      world(normalizeStage({ width: 40, height: 30, origin: 'top-left', yAxis: 'down' })),
    );
    expect([b.tile_at(0, 0), b.tile_at(35, 5), b.tile_at(15, 15), b.tile_at(39, 29)]).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('set_tile writes a cell, marks it dirty, and ignores out-of-map points', () => {
    const w = world(normalizeStage({ width: 40, height: 30, origin: 'top-left', yAxis: 'down' }));
    const b = createBuiltins(w);
    b.set_tile(25, 15, 7);
    b.set_tile(-1, 0, 9);
    expect(b.tile_at(25, 15)).toBe(7);
    expect([...w.map!.dirty]).toEqual([6]);
  });

  it('copies the initial cells so a run never edits the cart', () => {
    const init = map();
    const w = new World({ stage: normalizeStage({}), sprites: [], costumes: {}, map: init });
    createBuiltins(w).set_tile(-240, 180, 9);
    expect(init.cells[0]).toBe(1);
  });

  it('reports 0 everywhere without a map', () => {
    const w = new World({ stage: normalizeStage({}), sprites: [], costumes: {} });
    const b = createBuiltins(w);
    b.set_tile(0, 0, 1);
    expect(b.tile_at(0, 0)).toBe(0);
  });
});
