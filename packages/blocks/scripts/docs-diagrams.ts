/**
 * Renders every ```mermaid fence in the docs to docs/diagrams/<hash>-light.svg and -dark.svg,
 * with Mermaid in headless Chromium. `docs.html` shows these pictures in place of the fence (GitHub
 * draws the fence itself), so Mermaid stays a dev tool and ships in nothing. Run after adding or
 * changing a diagram: `pnpm docs:diagrams`. The docs check (`docs.test.ts`) fails when a picture
 * is missing or stale.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import type { Mermaid } from 'mermaid';
import type * as Playwright from 'playwright';
import { diagramFile, diagramsIn } from '../src/diagrams.ts';

const root = resolve(import.meta.dirname, '../../..');
const out = join(root, 'docs/diagrams');
// Playwright and Mermaid are root dev dependencies, so resolve them from there.
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('playwright') as typeof Playwright;
const mermaidJs = join(require.resolve('mermaid/package.json'), '../dist/mermaid.min.js');

/** README.md, CONTRIBUTING.md and every markdown file under docs/. */
function markdownFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.name === 'api'
        ? []
        : e.isDirectory()
          ? walk(join(dir, e.name))
          : e.name.endsWith('.md')
            ? [join(dir, e.name)]
            : [],
    );
  return [join(root, 'README.md'), join(root, 'CONTRIBUTING.md'), ...walk(join(root, 'docs'))];
}

/**
 * Mermaid sizes its SVG to fill the page (`width="100%"`), which an <img> can't size from. Gives
 * it the viewBox's size instead, so the docs page can scale it down to fit but never up.
 */
function sized(svg: string): string {
  const vb = /viewBox="([^"]+)"/
    .exec(svg)?.[1]
    ?.split(/[\s,]+/)
    .map(Number);
  if (!vb || vb.length !== 4) return svg;
  const [, , w, h] = vb.map((n) => Math.ceil(n));
  return svg
    .replace(/<svg([^>]*?) width="100%"/, `<svg$1 width="${w}" height="${h}"`)
    .replace(/ style="max-width: [^"]*"/, '');
}

const texts = [...new Set(markdownFiles().flatMap((p) => diagramsIn(readFileSync(p, 'utf8'))))];

const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e));
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ path: mermaidJs });
  const files: Record<string, string> = {};
  for (const theme of ['light', 'dark'] as const) {
    const svgs = await page.evaluate(
      async ([list, dark]) => {
        const m = (globalThis as unknown as { mermaid: Mermaid }).mermaid;
        m.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: dark ? 'dark' : 'default',
          // Shown as <img>, where HTML labels and the page's fonts aren't available.
          htmlLabels: false,
          // SVG labels wrap at 200px by default, which splits names like `@stitch/compiler`.
          flowchart: { htmlLabels: false, wrappingWidth: 400 },
          themeVariables: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
        });
        const out: string[] = [];
        for (const [i, text] of list.entries())
          out.push((await m.render(`d${dark ? 'd' : 'l'}${i}`, text)).svg);
        return out;
      },
      [texts, theme === 'dark'] as const,
    );
    texts.forEach((t, i) => (files[basename(diagramFile(t, theme))] = svgs[i]!));
  }
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) if (f.endsWith('.svg') && !(f in files)) rmSync(join(out, f));
  for (const [name, svg] of Object.entries(files))
    writeFileSync(join(out, name), sized(svg) + '\n');
  console.log(`Rendered ${texts.length} diagram${texts.length === 1 ? '' : 's'} to docs/diagrams.`);
} finally {
  await browser.close();
}
