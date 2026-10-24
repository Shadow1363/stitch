/**
 * Builds the player bundle to dist/player.js and checks it against the size budget.
 * `pnpm check:size` runs this; CI fails when the gzipped bundle passes the budget.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildPlayer, PLAYER_BUDGET_GZIP } from '../build.ts';

const js = await buildPlayer();
const dist = resolve(import.meta.dirname, '../dist');
mkdirSync(dist, { recursive: true });
writeFileSync(resolve(dist, 'player.js'), js);
const raw = Buffer.byteLength(js);
const gz = gzipSync(js, { level: 9 }).length;
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
console.log(`player.js: ${kb(raw)}, ${kb(gz)} gzipped (budget ${kb(PLAYER_BUDGET_GZIP)})`);
if (gz > PLAYER_BUDGET_GZIP) {
  console.error('The player bundle is over its size budget.');
  process.exit(1);
}
