import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { printModule } from './print';

const rawTexts = (text: string): string[] => {
  const out: string[] = [];
  JSON.stringify(parse(text).module, (_k, v: { kind?: string; text?: string }) => {
    if (v && v.kind === 'Raw' && typeof v.text === 'string') out.push(v.text);
    return v;
  });
  return out;
};

const CASES: Record<string, string> = {
  'missing expression': 'on start do\n  x =\n  y = 2\nend\n',
  'stray token': 'on start do\n  x = = 2\n  say("ok")\nend\n',
  'statement at top level': 'x = 1\non start do\nend\n',
  'unclosed script': 'on start do\n  say("hi")\n',
  'garbage line': 'var a = 1\n@@@ !!\nvar b = 2\n',
  'bad if header': 'on start do\n  if then\n    x = 1\n  end\nend\n',
};

describe('raw code preservation', () => {
  for (const [name, text] of Object.entries(CASES)) {
    it(`${name}: no characters are lost`, () => {
      const r = parse(text);
      expect(r.diagnostics.length).toBeGreaterThan(0);
      const printed = printModule(r.module);
      // Every non-whitespace character of the input survives, in order.
      expect(printed.replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
      // And reprinting is stable.
      expect(printModule(parse(printed).module)).toBe(printed);
    });
  }

  it('keeps the broken statement verbatim and the rest structured', () => {
    expect(rawTexts('on start do\n  x = = 2\n  say("ok")\nend\n')).toEqual(['x = = 2']);
    expect(rawTexts('var a = 1\n@@@ !!\nvar b = 2\n')).toEqual(['@@@ !!']);
  });

  it('groups everything on a broken line into one raw node', () => {
    expect(rawTexts('on start do\n  x =\n  y = 2\nend\n')).toEqual(['x =\n  y = 2']);
  });
});
