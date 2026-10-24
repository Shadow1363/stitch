// API docs from TSDoc comments: `pnpm docs:api` writes docs/api (not committed).
// Entry points are every package's `exports`, so a new public module is documented automatically.
import { readFileSync } from 'node:fs';

const PACKAGES = ['ir', 'lang', 'compiler', 'runtime', 'cart', 'blocks', 'export'];

const entryPoints = PACKAGES.flatMap((p) => {
  const { exports } = JSON.parse(readFileSync(`packages/${p}/package.json`, 'utf8'));
  return Object.values(exports).map((f) => `packages/${p}/${f.replace(/^\.\//, '')}`);
});

/** @type {Partial<import('typedoc').TypeDocOptions>} */
export default {
  name: 'Stitch API',
  entryPoints,
  tsconfig: 'tsconfig.json',
  out: 'docs/api',
  readme: 'none',
  excludePrivate: true,
  excludeInternal: true,
  // Test helpers and generated parser tables aren't API.
  exclude: ['**/*.test.ts', '**/parser.gen.*'],
  // No git remote yet, so source links would be broken.
  disableSources: true,
  treatWarningsAsErrors: true,
  validation: { notExported: false, invalidLink: true },
};
