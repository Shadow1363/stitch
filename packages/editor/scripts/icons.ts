/**
 * Renders the logo (src/lib/logo.ts) to the editor's favicon, PWA and Apple icons, and the
 * desktop app's icons. Run after changing the logo: `pnpm --filter @stitch/editor icons`.
 * `icons.test.ts` fails when the committed files are stale.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type * as Playwright from 'playwright';
import { pngToIco } from '../../export/src/ico.ts';
import { BRAND, logoSvg } from '../src/lib/logo.ts';

const root = resolve(import.meta.dirname, '..');
const pub = resolve(root, 'public');
const desktop = resolve(root, '../../desktop/src-tauri/icons');
// Playwright is a root dev dependency, so resolve it from there.
const { chromium } = createRequire(resolve(root, '../../package.json'))(
  'playwright',
) as typeof Playwright;

/** The SVG files and web manifest, which the test compares byte for byte. */
export const TEXT_FILES: Record<string, string> = {
  'favicon.svg': logoSvg() + '\n',
  'logo-mono.svg': logoSvg({ mono: true, color: '#000000' }) + '\n',
  'manifest.webmanifest':
    JSON.stringify(
      {
        name: 'Stitch',
        short_name: 'Stitch',
        description: 'Make games with blocks or code, and share them as carts.',
        start_url: './',
        display: 'standalone',
        background_color: '#f3f4f7',
        theme_color: BRAND,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      null,
      2,
    ) + '\n',
};

export const PNGS: [file: string, size: number, maskable: boolean][] = [
  ['favicon-32.png', 32, false],
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true],
  // iOS rounds the corners itself, so the Apple icon is full-bleed.
  ['apple-touch-icon.png', 180, true],
];

if (import.meta.main) {
  mkdirSync(pub, { recursive: true });
  for (const [file, text] of Object.entries(TEXT_FILES)) writeFileSync(resolve(pub, file), text);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (size: number, maskable: boolean) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${logoSvg({ maskable })}`,
    );
    return new Uint8Array(await page.screenshot({ omitBackground: true }));
  };
  for (const [file, size, maskable] of PNGS)
    writeFileSync(resolve(pub, file), await render(size, maskable));
  mkdirSync(desktop, { recursive: true });
  writeFileSync(resolve(desktop, 'icon.png'), await render(512, false));
  writeFileSync(resolve(desktop, 'icon.ico'), pngToIco(await render(256, false), 256));
  await browser.close();
  console.log(
    `Wrote ${Object.keys(TEXT_FILES).length + PNGS.length} files to public/ and the desktop icons.`,
  );
}
