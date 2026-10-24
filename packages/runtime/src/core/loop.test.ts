import { describe, expect, it } from 'vitest';
import { createLoop, MAX_TICKS_PER_FRAME, TICK_MS } from './loop';

const loop = () => {
  const counts = { ticks: 0, renders: 0 };
  const l = createLoop({
    tick: () => counts.ticks++,
    render: () => counts.renders++,
    requestFrame: () => 1,
    cancelFrame: () => {},
  });
  return { l, counts };
};

describe('fixed-timestep loop', () => {
  it('runs one tick per 60 Hz frame despite jitter', () => {
    const { l, counts } = loop();
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += TICK_MS + (i % 2 ? 0.6 : -0.6);
      expect(l.frame(t)).toBe(1);
    }
    expect(counts).toEqual({ ticks: 120, renders: 120 });
  });

  it('ticks every other frame at 120 Hz', () => {
    const { l, counts } = loop();
    let t = 0;
    for (let i = 0; i < 120; i++) l.frame((t += TICK_MS / 2));
    expect(counts.ticks).toBeGreaterThanOrEqual(59);
    expect(counts.ticks).toBeLessThanOrEqual(61);
  });

  it('caps catch-up after a long frame and drops the rest', () => {
    const { l } = loop();
    l.frame(0);
    expect(l.frame(1000)).toBe(MAX_TICKS_PER_FRAME);
    expect(l.frame(1000 + TICK_MS)).toBe(1);
  });

  it('keeps running after a frame throws, and reports it', () => {
    const frames: ((t: number) => void)[] = [];
    const errors: unknown[] = [];
    let renders = 0;
    const l = createLoop({
      tick: () => {},
      render: () => {
        if (++renders === 1) throw new Error('boom');
      },
      onError: (e) => errors.push(e),
      requestFrame: (cb) => frames.push(cb),
      cancelFrame: () => {},
    });
    l.start();
    frames.shift()!(0);
    frames.shift()!(TICK_MS);
    expect(renders).toBe(2);
    expect(errors).toEqual([new Error('boom')]);
    expect(l.running).toBe(true);
  });

  it('renders but runs no ticks while paused, and resumes without catching up', () => {
    const { l, counts } = loop();
    let t = 0;
    l.frame((t += TICK_MS));
    l.paused = true;
    for (let i = 0; i < 60; i++) expect(l.frame((t += TICK_MS))).toBe(0);
    l.paused = false;
    expect(l.frame((t += TICK_MS))).toBe(1);
    expect(counts).toEqual({ ticks: 2, renders: 62 });
  });
});
