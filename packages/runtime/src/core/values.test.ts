import { describe, expect, it } from 'vitest';
import * as $ from './values';

describe('values', () => {
  it('coerces to numbers like Scratch', () => {
    expect([$.n('10'), $.n(''), $.n('abc'), $.n(true), $.n(NaN), $.n(' 2 '), $.n([1])]).toEqual([
      10, 0, 0, 1, 0, 2, 0,
    ]);
  });

  it('compares numerically when both sides are numeric, else exact text', () => {
    expect($.eq('10', 10)).toBe(true);
    expect($.eq('1.0', '1')).toBe(true);
    expect($.eq('A', 'a')).toBe(false); // D7: case-sensitive
    expect($.eq('', 0)).toBe(false);
    expect($.cmp('9', '10')).toBe(-1);
    expect($.cmp('b', 'a')).toBe(1);
  });

  it('uses floored modulo', () => {
    expect([$.mod(7, 3), $.mod(-7, 3), $.mod(7, -3)]).toEqual([1, 2, -2]);
  });

  it('indexes lists and strings from 1, returning "" out of range', () => {
    const l = [10, 20, 30];
    expect([$.index(l, 1), $.index(l, 3), $.index(l, 0), $.index(l, 4), $.index('abc', 2)]).toEqual(
      [10, 30, '', '', 'b'],
    );
    $.setIndex(l, 2, 99);
    $.setIndex(l, 9, 1);
    expect(l).toEqual([10, 99, 30]);
  });

  it('mutates lists in place', () => {
    const l: $.Value[] = [1];
    $.push(l, 2);
    $.insert(l, 1, 0);
    $.remove(l, 3);
    expect(l).toEqual([0, 1]);
    expect($.contains(l, '1')).toBe(true);
    expect($.contains('hello', 'ell')).toBe(true);
  });

  it('formats and tests truthiness', () => {
    expect([$.s(1.5), $.s(true), $.s([1, 'a']), $.s(-0)]).toEqual(['1.5', 'true', '1 a', '0']);
    expect([$.b(0), $.b('0'), $.b('false'), $.b(''), $.b('x'), $.b(2)]).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it('uses exact trig in degrees', () => {
    expect([$.sin(180), $.cos(90), $.sin(90), $.tan(90)]).toEqual([0, 0, 1, Infinity]);
  });
});
