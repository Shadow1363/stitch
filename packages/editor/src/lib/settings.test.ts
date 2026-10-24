import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('parseSettings', () => {
  it('fills missing fields with defaults and ignores junk', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"formatOnSave":false,"linkScrolling":"yes","other":1}')).toEqual({
      ...DEFAULT_SETTINGS,
      formatOnSave: false,
    });
  });
});
