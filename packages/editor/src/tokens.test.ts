import { contrast, over } from '@stitch/blocks/color';
import { LETTERBOX } from '@stitch/runtime';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = import.meta.dirname;
const css = readFileSync(join(here, 'app.css'), 'utf8');

/** The custom properties declared in the rule that starts with `selector {`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} rule in app.css`);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

const light = block(':root');
const themes = { light, dark: { ...light, ...block(":root[data-theme='dark']") } };
const isColour = (v: string) => /^#[0-9a-f]{3,8}$/i.test(v);
/** Tokens that are deliberately the same in both themes. */
const SHARED = new Set(['--brand', '--brand-ink', '--letterbox', '--on-block']);

/** [foreground, background, minimum ratio]: 4.5 for text, 3 for UI parts and focus rings. */
const PAIRS: [string, string, number][] = [
  ...[
    '--text',
    '--muted',
    '--link',
    '--bad',
    '--warn',
    '--go',
    '--violet',
    '--teal',
    '--amber',
  ].flatMap((fg) => ['--panel', '--chrome'].map((bg): [string, string, number] => [fg, bg, 4.5])),
  ['--text', '--well', 4.5],
  ['--muted', '--well', 4.5],
  ['--on-accent', '--accent', 4.5],
  ['--on-go', '--go', 4.5],
  ['--on-bad', '--bad', 4.5],
  ['--on-violet', '--violet', 4.5],
  ['--brand-ink', '--brand', 4.5],
  ...[
    '--code-keyword',
    '--code-control',
    '--code-name',
    '--code-function',
    '--code-def',
    '--code-string',
    '--code-number',
    '--code-comment',
  ].flatMap((fg): [string, string, number][] => [
    [fg, '--panel', 4.5],
    [fg, '--code-active-line', 4.5],
    [fg, '--code-linked', 4.5],
  ]),
  ['--code-name', '--code-selection', 4.5],
  ['--line-strong', '--panel', 3],
  ['--accent', '--panel', 3],
  ['--focus', '--panel', 3],
  ['--focus', '--chrome', 3],
  ['--guide', '--checker-a', 3],
  ['--guide', '--checker-b', 3],
];

describe('design tokens', () => {
  for (const [name, t] of Object.entries(themes))
    it(`meet WCAG AA in the ${name} theme`, () => {
      for (const [fg, bg, min] of PAIRS) {
        const ratio = contrast(over(t[fg]!, t[bg]!), t[bg]!);
        expect(ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
      }
      // Notices tint the chrome with their colour and use it as text.
      const tinted = over(t['--bad']!, t['--chrome']!, 0.14);
      expect(contrast(t['--bad']!, tinted), 'error notice').toBeGreaterThanOrEqual(4.5);
      const info = over(t['--accent']!, t['--chrome']!, 0.12);
      expect(contrast(t['--text']!, info), 'info notice').toBeGreaterThanOrEqual(4.5);
    });

  it('give every colour a dark value, unless it is shared on purpose', () => {
    const dark = block(":root[data-theme='dark']");
    const missing = Object.entries(light)
      .filter(([k, v]) => isColour(v) && !SHARED.has(k) && !(k in dark))
      .map(([k]) => k);
    expect(missing).toEqual([]);
  });

  it('match the letterbox the runtime and stage page use', () => {
    expect(light['--letterbox']).toBe(LETTERBOX);
    expect(readFileSync(join(here, '../stage.html'), 'utf8')).toContain(`background: ${LETTERBOX}`);
  });
});

/** Every .svelte file under src. */
function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? svelteFiles(join(dir, e.name))
      : e.name.endsWith('.svelte')
        ? [join(dir, e.name)]
        : [],
  );
}

const LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|(?<![-\w])(?:white|black)(?![-\w])/gi;

describe('components', () => {
  it('take colours from tokens, not literals', () => {
    const found: string[] = [];
    for (const file of svelteFiles(here)) {
      const src = readFileSync(file, 'utf8');
      const style = src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
      // UI drawn on canvas (grids, guides, waveforms) and inline styles count too; art the
      // user makes (default fill, palette entries) is content, not UI, and isn't checked.
      const canvas = [...src.matchAll(/(?:fillStyle|strokeStyle)\s*=\s*([^;\n]+)/g)].map(
        (m) => m[1]!,
      );
      const inline = [...src.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]!);
      for (const text of [style, ...canvas, ...inline])
        for (const m of text.matchAll(LITERAL))
          found.push(`${file.slice(here.length + 1)}: ${m[0]}`);
    }
    expect(found).toEqual([]);
  });
});
