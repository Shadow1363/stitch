import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PNGS, TEXT_FILES } from '../scripts/icons';

const pub = join(import.meta.dirname, '../public');

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('icons', () => {
  it('are generated from the current logo (run `pnpm --filter @stitch/editor icons`)', () => {
    for (const [file, text] of Object.entries(TEXT_FILES))
      expect(readFileSync(join(pub, file), 'utf8'), file).toBe(text);
  });

  it('have the sizes the manifest and index.html name', () => {
    for (const [file, size] of PNGS) expect(pngSize(join(pub, file)), file).toEqual([size, size]);
    const desktop = join(import.meta.dirname, '../../../desktop/src-tauri/icons/icon.png');
    expect(pngSize(desktop)).toEqual([512, 512]);
    const html = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8');
    for (const f of [
      'favicon.svg',
      'favicon-32.png',
      'apple-touch-icon.png',
      'manifest.webmanifest',
    ])
      expect(html).toContain(`/${f}`);
  });
});
