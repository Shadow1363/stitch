import { describe, expect, it } from 'vitest';
import { normalizeStage } from '@stitch/cart';
import { createSpace } from '../core/space';
import { Sprite, type CostumeInfo } from '../core/sprite';
import { displayTransform, mapOffset } from './transform';

const costume: CostumeInfo = {
  id: 'c',
  name: 'c',
  width: 16,
  height: 16,
  center: [8, 8],
  pixelArt: true,
};
const sprite = (x: number, y: number) => {
  const s = new Sprite('p', 'P', [costume]);
  s.x = x;
  s.y = y;
  return s;
};

describe('displayTransform', () => {
  it('places sprites through the space module', () => {
    const t = displayTransform(sprite(10, 20), costume, createSpace(normalizeStage({})), false);
    expect(t).toMatchObject({ x: 250, y: 160, rotation: 0, scale: 1, anchorX: 0.5, anchorY: 0.5 });
  });

  it('follows stage settings', () => {
    const t = displayTransform(
      sprite(10, 20),
      costume,
      createSpace(normalizeStage({ origin: 'top-left', yAxis: 'down' })),
      false,
    );
    expect(t).toMatchObject({ x: 10, y: 20 });
  });

  it('snaps pixel art to whole pixels without touching the stored position', () => {
    const s = sprite(10.4, -3.6);
    const t = displayTransform(s, costume, createSpace(normalizeStage({})), true);
    expect(t.x - 8).toBe(Math.round(t.x - 8));
    expect(t.y - 8).toBe(Math.round(t.y - 8));
    expect(t.x).toBe(250);
    expect(s.x).toBe(10.4);
  });

  it('rotates by visual direction', () => {
    const s = sprite(0, 0);
    s.direction = 180;
    expect(
      displayTransform(s, costume, createSpace(normalizeStage({})), false).rotation,
    ).toBeCloseTo(Math.PI / 2);
  });
});

describe('mapOffset', () => {
  it('moves the map against the scroll, snapping to whole pixels for pixel art', () => {
    expect(mapOffset({ x: 10.4, y: 3.6 }, false)).toEqual({ x: -10.4, y: -3.6 });
    expect(mapOffset({ x: 10.4, y: 3.6 }, true)).toEqual({ x: -10, y: -4 });
    expect(mapOffset({ x: 0, y: 0 }, true)).toEqual({ x: 0, y: 0 });
  });
});
