/**
 * The editor's Run, Pause and Stop shortcuts (⌘↩, ⌘P, ⌘.; Ctrl elsewhere). Shared by the editor
 * and the stage, so they work whichever one has the keyboard, and never reach the game.
 */

export type StageShortcut = 'run' | 'pause' | 'stop';

/** The parts of a `KeyboardEvent` a shortcut depends on. */
export interface ShortcutKey {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const BY_CODE: Readonly<Record<string, StageShortcut>> = {
  Enter: 'run',
  NumpadEnter: 'run',
  KeyP: 'pause',
  Period: 'stop',
};

/** Which shortcut a key press is, if any. By key code, so keyboard layouts don't matter. */
export function stageShortcut(e: ShortcutKey): StageShortcut | undefined {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return undefined;
  return BY_CODE[e.code];
}
