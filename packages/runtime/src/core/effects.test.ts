import { describe, expect, it } from 'vitest';
import { micLevel, pitchRate } from './audio';
import { distortion, distortPixels, transformPoint } from './effects';
import { NO_EFFECTS } from './sprite';

const fx = (e: Partial<typeof NO_EFFECTS>) => distortion({ ...NO_EFFECTS, ...e })!;

describe('distortion effects', () => {
  it('are off when every distortion is 0', () => {
    expect(distortion({ ...NO_EFFECTS, ghost: 50, color: 20 })).toBeUndefined();
  });

  it("use Scratch's uniforms", () => {
    expect(fx({ mosaic: 10 }).mosaic).toBe(2);
    expect(fx({ mosaic: 10_000 }).mosaic).toBe(512);
    expect(fx({ pixelate: -40 }).pixelate).toBe(4);
    expect(fx({ fisheye: -200 }).fisheye).toBe(0);
    expect(fx({ whirl: 90 }).whirl).toBeCloseTo(-Math.PI / 2);
  });

  it('mosaic repeats the costume; pixelate snaps to cell centres', () => {
    const [u, v] = transformPoint(fx({ mosaic: 10 }), 0.75, 0.25, 40, 40);
    expect([u, v]).toEqual([0.5, 0.5]);
    const [pu] = transformPoint(fx({ pixelate: 100 }), 0.01, 0.5, 40, 40);
    expect(pu * 40).toBe(5);
  });

  it('whirl and fisheye leave the centre and the corners alone', () => {
    const w = fx({ whirl: 180 });
    expect(transformPoint(w, 0.5, 0.5, 8, 8)).toEqual([0.5, 0.5]);
    const [cu, cv] = transformPoint(w, 0, 0, 8, 8);
    expect([cu, cv]).toEqual([0, 0]);
    const f = fx({ fisheye: 100 });
    const [fu, fv] = transformPoint(f, 0.5, 0.5, 8, 8);
    expect([fu, fv]).toEqual([0.5, 0.5]);
  });

  it('draws the same pixels touching samples', () => {
    // 2×2: red, green / blue, white. Mosaic 2 shows four copies, each one source pixel here.
    const src = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const out = distortPixels(src, 2, 2, fx({ mosaic: 10 }));
    expect([...out.slice(0, 4)]).toEqual([255, 255, 255, 255]);
  });
});

describe('sound effects and loudness', () => {
  it('pitch: 120 is an octave up, clamped at ±360', () => {
    expect(pitchRate(120)).toBe(2);
    expect(pitchRate(-1000)).toBe(pitchRate(-360));
  });

  it('measures loudness as Scratch does, falling off smoothly', () => {
    expect(micLevel(new Float32Array(64), 0).level).toBe(0);
    const loud = micLevel(new Float32Array(64).fill(0.5), 0);
    expect(loud.level).toBe(Math.round(Math.sqrt(0.5 * 1.63) * 100));
    const after = micLevel(new Float32Array(64), loud.smoothed);
    expect(after.level).toBeGreaterThan(0);
    expect(after.level).toBeLessThan(loud.level);
  });
});
