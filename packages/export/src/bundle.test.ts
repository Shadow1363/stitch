import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildPlayer, PLAYER_BUDGET_GZIP } from '../build';

describe('player bundle', () => {
  it('is one classic script within the size budget', async () => {
    const js = await buildPlayer();
    // A classic script: no module syntax left for the page to resolve.
    expect(js).not.toMatch(/^\s*(import|export)\s/m);
    expect(js).not.toMatch(/\bimport\(/);
    expect(gzipSync(js).length).toBeLessThan(PLAYER_BUDGET_GZIP);
    // Editor-only code stays out: no compiler, parser, Blockly or secrets.
    for (const marker of ['blockly', 'applySecrets', 'lezer', '{{NAME}}'])
      expect(js).not.toContain(marker);
  }, 60_000);
});
