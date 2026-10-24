import { describe, expect, it } from 'vitest';
import { collapse, dragTo, evenSplit, nudge, parseSplit, sizeA } from './split';

const l = { total: 1000, minA: 200, minB: 200 };

describe('split', () => {
  it('drags to a size, clamped to both minimums', () => {
    expect(dragTo(600, l)).toEqual({ ratio: 0.6, collapsed: null });
    expect(sizeA(dragTo(150, l), 1000)).toBe(200);
    expect(sizeA(dragTo(900, l), 1000)).toBe(800);
  });

  it('snaps a pane closed past half its minimum, and reopens it when dragged back', () => {
    expect(dragTo(90, l).collapsed).toBe('a');
    expect(sizeA(dragTo(90, l), 1000)).toBe(0);
    expect(dragTo(950, l).collapsed).toBe('b');
    expect(sizeA(dragTo(950, l), 1000)).toBe(1000);
    expect(dragTo(120, l)).toEqual({ ratio: 0.2, collapsed: null });
  });

  it('resets to 50/50', () => {
    expect(sizeA(evenSplit(), 800)).toBe(400);
  });

  it('moves by keyboard steps without closing panes, and reopens closed ones', () => {
    const half = evenSplit();
    expect(sizeA(nudge(half, 16, l), 1000)).toBe(516);
    expect(sizeA(nudge(dragTo(205, l), -64, l), 1000)).toBe(200);
    const closed = collapse(half, 'a');
    expect(sizeA(closed, 1000)).toBe(0);
    expect(nudge(closed, -16, l)).toBe(closed);
    expect(sizeA(nudge(closed, 16, l), 1000)).toBe(200);
    expect(sizeA(nudge(collapse(half, 'b'), -16, l), 1000)).toBe(800);
  });

  it('keeps the open size while a pane is closed', () => {
    expect(collapse({ ratio: 0.3, collapsed: null }, 'b')).toEqual({ ratio: 0.3, collapsed: 'b' });
  });

  it('shares the space when it is too small for both minimums', () => {
    expect(dragTo(150, { total: 300, minA: 200, minB: 200 })).toEqual({
      ratio: 0.5,
      collapsed: null,
    });
  });

  it('parses saved states defensively', () => {
    const fb = evenSplit();
    expect(parseSplit({ ratio: 0.7, collapsed: 'b' }, fb)).toEqual({ ratio: 0.7, collapsed: 'b' });
    expect(parseSplit({ ratio: 3, collapsed: 'x' }, fb)).toEqual({ ratio: 1, collapsed: null });
    expect(parseSplit('nope', fb)).toBe(fb);
    expect(parseSplit({ ratio: NaN }, fb)).toBe(fb);
  });
});
