import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadExtensions, NullNet } from '@stitch/runtime';
import { describe, expect, it } from 'vitest';
import { extensionFromFiles, extensionFromUrl } from './extensions';

const dir = resolve(import.meta.dirname, '../../public/extensions/text');
const manifest = { name: 'manifest.json', text: readFileSync(`${dir}/manifest.json`, 'utf8') };
const code = { name: 'text.js', text: readFileSync(`${dir}/text.js`, 'utf8') };

describe('extensions', () => {
  it('load the sample from files, and its code implements every block', () => {
    const ext = extensionFromFiles([code, manifest]);
    expect(ext.manifest.id).toBe('text');
    const loaded = loadExtensions(
      [
        {
          id: ext.manifest.id,
          code: ext.code,
          blocks: ext.manifest.blocks.map((b) => ({ name: b.name, waits: b.waits === true })),
        },
      ],
      { net: new NullNet(), log: () => {} },
    );
    expect(loaded.errors).toEqual([]);
    const S = { name: 'p', x: 0, y: 0, direction: 90, size: 100, visible: true, costume: 0 };
    expect(loaded.impls.text_split!(S as never, 'a,b', ',')).toEqual(['a', 'b']);
    expect(loaded.impls.text_replace!(S as never, 'a-a', '-', '+')).toBe('a+a');
  });

  it('explain what is missing or wrong', () => {
    expect(() => extensionFromFiles([code])).toThrow(/one manifest/);
    expect(() => extensionFromFiles([manifest])).toThrow(/text\.js/);
    expect(() => extensionFromFiles([{ name: 'm.json', text: '{' }, code])).toThrow(/valid JSON/);
    expect(() => extensionFromFiles([{ name: 'm.json', text: '{"id":"X"}' }, code])).toThrow(
      /m\.json: 'id'/,
    );
  });

  it('load from a manifest URL, fetching main relative to it', async () => {
    const files: Record<string, string> = {
      'https://ext.test/text/manifest.json': manifest.text,
      'https://ext.test/text/text.js': code.text,
    };
    const get = (u: string) =>
      Promise.resolve(
        files[u] === undefined ? new Response('', { status: 404 }) : new Response(files[u]),
      );
    const ext = await extensionFromUrl('https://ext.test/text/manifest.json', get);
    expect(ext.code).toBe(code.text);
    await expect(extensionFromUrl('https://ext.test/none.json', get)).rejects.toThrow(/HTTP 404/);
  });
});
