import { irEqual, stripIds, type Module } from '@stitch/ir';
import { moduleArb } from '@stitch/ir/arbitrary';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { format } from './format';
import { parse } from './parse';
import { printModule } from './print';

/** The program without blank-line trivia, which is the only thing formatting may change. */
const meaning = (m: Module): string =>
  JSON.stringify(stripIds(m), (k, v: unknown) => {
    if (k !== 'trivia' || !v || typeof v !== 'object') return v;
    const { blankBefore: _, ...rest } = v as Record<string, unknown>;
    return Object.keys(rest).length ? rest : undefined;
  });

describe('format', () => {
  it('normalizes indentation, spacing and blank lines between scripts', () => {
    const messy = [
      'var  speed=2',
      'var lives =3',
      'on start do',
      '\tforever do',
      '        x+=speed*2',
      '\tend',
      'end',
      'function hit( n )',
      '      lives-=n',
      'end',
    ].join('\n');
    expect(format(messy).text).toBe(
      [
        'var speed = 2',
        'var lives = 3',
        '',
        'on start do',
        '  forever do',
        '    x += speed * 2',
        '  end',
        'end',
        '',
        'function hit(n)',
        '  lives -= n',
        'end',
        '',
      ].join('\n'),
    );
  });

  it('keeps comments where they were', () => {
    const text = [
      '-- Player',
      'var hp = 3 -- hearts',
      '-- start here',
      'on start do',
      '  -- greet',
      '  say("hi")   -- once',
      'end',
      '-- the end',
    ].join('\n');
    const out = format(text).text;
    expect(out).toBe(
      [
        '-- Player',
        'var hp = 3 -- hearts',
        '',
        '-- start here',
        'on start do',
        '  -- greet',
        '  say("hi") -- once',
        'end',
        '-- the end',
        '',
      ].join('\n'),
    );
  });

  it('keeps text that does not parse exactly as written', () => {
    const text = 'on start do\n  move(10\nend\n\nfunction (  oops\n';
    const out = format(text).text;
    expect(out).toContain('move(10');
    expect(out).toContain('function (  oops');
    expect(format(out).text).toBe(out);
  });

  it('handles CRLF line endings and reports whether anything changed', () => {
    expect(format('var a = 1\r\non start do\r\nend\r\n')).toEqual({
      text: 'var a = 1\n\non start do\nend\n',
      changed: true,
    });
    expect(format('var a = 1\n').changed).toBe(false);
    expect(format('').text).toBe('');
  });

  it('never changes the program, and is idempotent (random programs)', () => {
    fc.assert(
      fc.property(moduleArb, (m) => {
        const text = printModule(m);
        const once = format(text).text;
        expect(meaning(parse(once).module)).toBe(meaning(parse(text).module));
        expect(format(once).text).toBe(once);
        expect(irEqual(parse(printModule(parse(once).module)).module, parse(once).module)).toBe(
          true,
        );
      }),
      { numRuns: 300 },
    );
  });
});
