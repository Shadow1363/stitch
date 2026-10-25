/**
 * Scratch Parity: the code is canonical with no problems, and every check the Checker runs
 * passes, so the sample doubles as an end-to-end test of Scratch 3 behaviour.
 */
import { format } from '@stitch/lang';
import { describe, expect, it } from 'vitest';
import { parityCart } from './parity/build';
import { runSample } from './testing';

const { parts, sources } = parityCart();

describe('Scratch Parity', () => {
  it('is canonical text with no problems', () => {
    for (const [id, text] of Object.entries(sources)) expect(format(text).text, id).toBe(text);
    expect(runSample(parts, sources).diagnostics).toEqual([]);
  });

  it('passes every check, then starts the demo', () => {
    const { world, tick, G, errors, logs } = runSample(parts, sources);
    for (let i = 0; i < 600 && !logs.some((l) => l.startsWith('Scratch parity')); i++) tick();
    expect(logs.filter((l) => l.startsWith('FAIL'))).toEqual([]);
    expect(G.failed).toBe(0);
    expect(G.passed).toBe(logs.filter((l) => l.startsWith('PASS')).length);
    expect(logs.at(-1)).toBe(`Scratch parity: ${G.passed} passed, 0 failed`);
    // The demo runs without errors: backdrops change, the cat cycles its effects.
    tick(400);
    expect(errors).toEqual([]);
    expect(world.stage.costume).not.toBe(0);
  });
});
