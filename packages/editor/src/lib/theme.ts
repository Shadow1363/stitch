/**
 * Light/dark theme. The preference (system, light or dark) is per user in localStorage, never in
 * carts. The resolved theme is `data-theme` on <html>, which switches the tokens in app.css.
 * index.html runs the same resolution inline before first paint.
 */
export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'stitch.theme';
const listeners = new Set<(t: Theme) => void>();
const media = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)');

export function themePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // storage unavailable: follow the system
  }
  return 'system';
}

export function resolveTheme(pref: ThemePref = themePref()): Theme {
  if (pref !== 'system') return pref;
  return media()?.matches ? 'dark' : 'light';
}

export const currentTheme = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

function apply() {
  const t = resolveTheme();
  if (document.documentElement.dataset.theme === t) return;
  document.documentElement.dataset.theme = t;
  for (const f of listeners) f(t);
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // not persisted; still applies for this page
  }
  apply();
}

/** Calls `f` whenever the resolved theme changes (a toggle, or the system switching). */
export function onThemeChange(f: (t: Theme) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

media()?.addEventListener('change', () => themePref() === 'system' && apply());
if (typeof document !== 'undefined') apply();

/** A token's current value, e.g. `token('--grid-line')`, for canvas drawing. */
export function token(name: `--${string}`): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
