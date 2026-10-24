/** Formatting changes only layout: the compiled program is the same before and after. */
import { moduleArb } from '@stitch/ir/arbitrary';
import { format, printModule } from '@stitch/lang';
import fc from 'fast-check';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { projectFrom } from './testing';

/** Compiled code, or the error messages when the program doesn't compile. */
const compiled = (text: string) => {
  const r = compile(projectFrom({ A: text }));
  return r.ok ? r.code : r.diagnostics.map((d) => d.message).join('\n');
};

/** Re-indents and squeezes text the way a hurried writer might, without changing its tokens. */
const scramble = (text: string) =>
  text
    .split('\n')
    .map((l, i) => (i % 3 === 0 ? '\t' : '') + l.trim().replace(/ = /g, '=').replace(/, /g, ' ,  '))
    .join('\n\n');

describe('format keeps behaviour', () => {
  it('for random programs', () => {
    fc.assert(
      fc.property(moduleArb, (m) => {
        const text = printModule(m);
        expect(compiled(format(text).text)).toBe(compiled(text));
      }),
      { numRuns: 200 },
    );
  });

  it('for the Stitch Dungeon sources, scrambled then formatted', () => {
    const dir = resolve(import.meta.dirname, '../../editor/src/samples/dungeon');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.stitch'))) {
      const text = readFileSync(join(dir, f), 'utf8');
      expect(compiled(format(scramble(text)).text), f).toBe(compiled(text));
    }
  });
});
