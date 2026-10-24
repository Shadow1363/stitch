/**
 * Writes the generated regions of docs/reference.md (`<!-- generated: id -->`) from the docs
 * registry (`src/registry.ts`): every entry's heading, prose and example, and the table of
 * built-in variables. Run after changing the registry or the catalog: `pnpm docs:reference`,
 * then `pnpm docs:blocks` for new pictures. The docs check fails while the file is stale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import type * as Registry from '../src/registry';

const root = resolve(import.meta.dirname, '../../..');
const path = join(root, 'docs/reference.md');

// The registry imports workspace packages as TS source, so load it through Vite.
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { renderReference } = (await server.ssrLoadModule(
    '/packages/blocks/src/registry.ts',
  )) as typeof Registry;
  const before = readFileSync(path, 'utf8');
  const after = renderReference(before);
  if (after === before) console.log('docs/reference.md is up to date.');
  else {
    writeFileSync(path, after);
    console.log('Wrote docs/reference.md. Run `pnpm docs:blocks` for new or changed examples.');
  }
} finally {
  await server.close();
}
