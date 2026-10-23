// Regenerates src/parser.gen.js from src/stitch.grammar. The output is committed.
import { buildParserFile } from '@lezer/generator';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const grammar = readFileSync(src + 'stitch.grammar', 'utf8');
const { parser, terms } = buildParserFile(grammar, { fileName: 'stitch.grammar', moduleStyle: 'es', warn: (m) => { throw new Error(m); } });
writeFileSync(src + 'parser.gen.js', parser);
writeFileSync(src + 'parser.gen.terms.js', terms);
console.log('wrote parser.gen.js');
