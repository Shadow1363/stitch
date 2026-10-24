/**
 * Editor settings: per user in localStorage, like the theme, never in carts.
 */
export interface EditorSettings {
  /** Format every file before saving the cart. */
  formatOnSave: boolean;
  /** Scrolling the blocks or the code highlights the matching place in the other view. */
  linkScrolling: boolean;
}

const KEY = 'stitch.settings';

export const DEFAULT_SETTINGS: EditorSettings = { formatOnSave: true, linkScrolling: true };

/** Saved settings over the defaults; unknown or mistyped fields are ignored. */
export function parseSettings(raw: string | null): EditorSettings {
  const out = { ...DEFAULT_SETTINGS };
  try {
    const v = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    for (const k of Object.keys(out) as (keyof EditorSettings)[])
      if (typeof v[k] === 'boolean') out[k] = v[k];
  } catch {
    // not JSON: defaults
  }
  return out;
}

export function loadSettings(): EditorSettings {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: EditorSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // not persisted; fine
  }
}
