import { describe, expect, it } from 'vitest';
import { stageShortcut } from './shortcuts';

const key = (
  code: string,
  mods: Partial<Record<'meta' | 'ctrl' | 'alt' | 'shift', boolean>> = {},
) => ({
  code,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
});

describe('stageShortcut', () => {
  it('maps ⌘ and Ctrl chords to run, pause and stop', () => {
    expect(stageShortcut(key('Enter', { meta: true }))).toBe('run');
    expect(stageShortcut(key('NumpadEnter', { ctrl: true }))).toBe('run');
    expect(stageShortcut(key('KeyP', { ctrl: true }))).toBe('pause');
    expect(stageShortcut(key('Period', { meta: true }))).toBe('stop');
  });

  it('leaves plain keys and other chords to the game and the editor', () => {
    expect(stageShortcut(key('Enter'))).toBeUndefined();
    expect(stageShortcut(key('KeyP'))).toBeUndefined();
    expect(stageShortcut(key('Enter', { meta: true, shift: true }))).toBeUndefined();
    expect(stageShortcut(key('KeyP', { meta: true, alt: true }))).toBeUndefined();
    expect(stageShortcut(key('KeyS', { meta: true }))).toBeUndefined();
  });
});
