import { describe, expect, it } from 'vitest';
import { layoutKey, legacyLayout, parseLayout } from './layout';

describe('layout prefs', () => {
  it('parses saved layouts and drops anything malformed', () => {
    expect(
      parseLayout({
        orientation: 'vertical',
        splits: { code: { ratio: 0.4, collapsed: 'a' }, bad: { ratio: 'x' }, main: 7 },
      }),
    ).toEqual({ orientation: 'vertical', splits: { code: { ratio: 0.4, collapsed: 'a' } } });
    expect(parseLayout(undefined)).toEqual({ orientation: 'horizontal', splits: {} });
  });

  it('turns the old view setting into the code split', () => {
    expect(legacyLayout('blocks').splits.code?.collapsed).toBe('b');
    expect(legacyLayout('text').splits.code?.collapsed).toBe('a');
    expect(legacyLayout(null).splits).toEqual({});
  });

  it('keys layouts by cart title', () => {
    expect(layoutKey('Gem Dash')).toBe('layout:Gem Dash');
  });
});
