/**
 * Renders the block picture for every docs example (`<!-- example: name -->` before a `stitch`
 * fence) to docs/blocks/<name>.svg, through `toBlocks` and real Blockly in headless Chromium.
 * Run after adding or changing an example: `pnpm docs:blocks`. The docs check (`docs.test.ts`)
 * fails when an image is missing or older than its example.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import type * as Playwright from 'playwright';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '../../..');
const out = join(root, 'docs/blocks');
// Playwright is a root dev dependency, so resolve it from there.
const { chromium } = createRequire(join(root, 'package.json'))('playwright') as typeof Playwright;

/** README.md plus every markdown file under docs/. */
function markdownFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : [],
    );
  return [join(root, 'README.md'), ...walk(join(root, 'docs'))];
}

const docs = markdownFiles().map((p) => ({
  path: relative(root, p),
  text: readFileSync(p, 'utf8'),
}));
// Examples may use the sample extension's blocks.
const manifests = [
  JSON.parse(
    readFileSync(join(root, 'packages/editor/public/extensions/text/manifest.json'), 'utf8'),
  ),
];

const server = await createServer({
  root: resolve(import.meta.dirname, '../docs-render'),
  configFile: false,
  logLevel: 'warn',
  server: { port: 0 },
});
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e));
  await page.goto(server.resolvedUrls!.local[0]!);
  await page.waitForFunction(() => 'renderAll' in globalThis);
  const svgs = await page.evaluate(
    ([d, m]) =>
      (
        globalThis as unknown as { renderAll: (...a: unknown[]) => Record<string, string> }
      ).renderAll(d, m),
    [docs, manifests] as const,
  );
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out))
    if (f.endsWith('.svg') && !(f.slice(0, -4) in svgs)) rmSync(join(out, f));
  for (const [name, svg] of Object.entries(svgs))
    writeFileSync(join(out, `${name}.svg`), svg + '\n');
  console.log(`Rendered ${Object.keys(svgs).length} examples to docs/blocks.`);
} finally {
  await browser.close();
  await server.close();
}
