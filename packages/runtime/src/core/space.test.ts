import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { normalizeStage, type StageSettings } from '@stitch/cart';
import { createSpace, normalizeDirection } from './space';

const settings = (o: Partial<StageSettings>) => normalizeStage(o);
const ALL = [
  settings({}),
  settings({ origin: 'top-left', yAxis: 'down', width: 320, height: 240 }),
  settings({ origin: 'center', yAxis: 'down' }),
  settings({ origin: 'top-left', yAxis: 'up', width: 128, height: 128 }),
];

describe('space', () => {
  it('maps Scratch defaults: centre origin, y up', () => {
    const s = createSpace(settings({}));
    expect(s.toStagePx(0, 0)).toEqual({ x: 240, y: 180 });
    expect(s.toStagePx(240, 180)).toEqual({ x: 480, y: 0 });
    expect(s.toStagePx(-240, -180)).toEqual({ x: 0, y: 360 });
  });

  it('maps top-left / y-down like a screen', () => {
    const s = createSpace(settings({ origin: 'top-left', yAxis: 'down', width: 320, height: 240 }));
    expect(s.toStagePx(0, 0)).toEqual({ x: 0, y: 0 });
    expect(s.toStagePx(10, 20)).toEqual({ x: 10, y: 20 });
  });

  it('round-trips cart <-> stage pixels for every setting', () => {
    for (const st of ALL) {
      const s = createSpace(st);
      fc.assert(
        fc.property(
          fc.double({ min: -1e4, max: 1e4, noNaN: true }),
          fc.double({ min: -1e4, max: 1e4, noNaN: true }),
          (x, y) => {
            const p = s.toStagePx(x, y);
            const back = s.fromStagePx(p.x, p.y);
            expect(back.x).toBeCloseTo(x, 6);
            expect(back.y).toBeCloseTo(y, 6);
          },
        ),
      );
    }
  });

  it('toMapPx is stage pixels plus the scroll, for every setting', () => {
    for (const st of ALL) {
      const s = createSpace(st);
      const p = s.toStagePx(7, -3);
      expect(s.toMapPx(7, -3, { x: 0, y: 0 })).toEqual(p);
      expect(s.toMapPx(7, -3, { x: 100, y: 40 })).toEqual({ x: p.x + 100, y: p.y + 40 });
    }
  });

  it('direction 90 moves screen-right and 0 moves screen-up, whatever the y axis', () => {
    for (const st of ALL) {
      const s = createSpace(st);
      const right = s.forward(90, 10);
      const up = s.forward(0, 10);
      const p0 = s.toStagePx(0, 0);
      const pr = s.toStagePx(right.dx, right.dy);
      const pu = s.toStagePx(up.dx, up.dy);
      expect(pr.x - p0.x).toBeCloseTo(10);
      expect(pr.y - p0.y).toBeCloseTo(0);
      expect(pu.x - p0.x).toBeCloseTo(0);
      expect(pu.y - p0.y).toBeCloseTo(-10);
    }
  });

  it('directionOf inverts forward', () => {
    for (const st of ALL) {
      const s = createSpace(st);
      for (const dir of [0, 45, 90, 135, 180, -45, -90, -135]) {
        const d = s.forward(dir, 5);
        expect(s.directionOf(d.dx, d.dy)).toBeCloseTo(dir === -180 ? 180 : dir);
      }
    }
  });

  it('fits and letterboxes, with optional integer scaling', () => {
    const s = createSpace(settings({}));
    expect(s.fit(960, 1000)).toEqual({ scale: 2, offX: 0, offY: 140 });
    const p = createSpace(
      settings({ width: 128, height: 128, scaling: { mode: 'integer', filter: 'pixel' } }),
    );
    expect(p.fit(500, 500)).toEqual({ scale: 3, offX: 58, offY: 58 });
  });

  it('normalizes directions into (-180, 180]', () => {
    expect([0, 180, -180, 190, 360, -190, 540, 45.5].map(normalizeDirection)).toEqual([
      0, 180, 180, -170, 0, 170, 180, 45.5,
    ]);
  });
});
