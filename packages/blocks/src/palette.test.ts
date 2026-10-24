import { describe, expect, it } from 'vitest';
import { contrast, deltaE, DEFICIENCIES, simulate } from './color';
import { BLOCK_COLOURS, STYLES } from './definitions';

/** Distinct colours: control and logic deliberately share one. */
const colours = [...new Set(Object.values(BLOCK_COLOURS))];
const pairs = colours.flatMap((a, i) => colours.slice(i + 1).map((b) => [a, b] as const));

describe('block palette', () => {
  it('keeps white block text at WCAG AA on every fill', () => {
    for (const [name, fills] of Object.entries(STYLES))
      for (const fill of fills)
        expect(contrast(fill, '#ffffff'), `${name} ${fill}`).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps categories distinguishable', () => {
    for (const [a, b] of pairs) expect(deltaE(a, b), `${a} vs ${b}`).toBeGreaterThanOrEqual(12);
  });

  it('keeps categories distinguishable with colour-vision deficiencies', () => {
    for (const kind of DEFICIENCIES)
      for (const [a, b] of pairs)
        expect(
          deltaE(simulate(a, kind), simulate(b, kind)),
          `${kind}: ${a} vs ${b}`,
        ).toBeGreaterThanOrEqual(5);
  });
});

describe('colour maths', () => {
  it('matches WCAG and CIEDE2000 reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(deltaE('#ff0000', '#ff0000')).toBe(0);
    expect(deltaE('#000000', '#ffffff')).toBeCloseTo(100, 0);
    // Greys stay grey under every simulation.
    for (const k of DEFICIENCIES) expect(simulate('#808080', k)).toBe('#808080');
  });
});
