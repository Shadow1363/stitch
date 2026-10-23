import { readFileSync } from 'node:fs';
import { buildParserFile } from '@lezer/generator';
import { expect, it } from 'vitest';

it('committed parser matches stitch.grammar (run `pnpm gen`)', () => {
  const dir = new URL('./', import.meta.url);
  const grammar = readFileSync(new URL('stitch.grammar', dir), 'utf8');
  const { parser } = buildParserFile(grammar, { fileName: 'stitch.grammar', moduleStyle: 'es' });
  expect(readFileSync(new URL('parser.gen.js', dir), 'utf8')).toBe(parser);
});
