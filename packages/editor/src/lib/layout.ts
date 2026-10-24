/**
 * Panel layout preferences: every split's sash position and closed pane, and whether blocks and
 * code sit side by side or stacked. Kept per cart (by title) in IndexedDB beside the autosave,
 * never in the cart; a cart seen for the first time starts from the last layout used.
 */
import { parseSplit, type SplitState } from './split';

export type Orientation = 'horizontal' | 'vertical';

export interface LayoutPrefs {
  /** Blocks and code: side by side (horizontal) or stacked (vertical). */
  orientation: Orientation;
  splits: Record<string, SplitState>;
}

/** The layout used for carts with no layout of their own: whichever was used last. */
export const DEFAULT_LAYOUT_KEY = 'layout:default';

export const layoutKey = (title: string) => `layout:${title}`;

export const emptyLayout = (): LayoutPrefs => ({ orientation: 'horizontal', splits: {} });

/** A saved layout, checked field by field. */
export function parseLayout(v: unknown): LayoutPrefs {
  const out = emptyLayout();
  if (!v || typeof v !== 'object') return out;
  const { orientation, splits } = v as Record<string, unknown>;
  if (orientation === 'vertical') out.orientation = 'vertical';
  if (splits && typeof splits === 'object')
    for (const [id, s] of Object.entries(splits)) {
      const parsed = parseSplit(s, { ratio: -1, collapsed: null });
      if (parsed.ratio >= 0) out.splits[id] = parsed;
    }
  return out;
}

/**
 * The view mode saved by earlier versions (localStorage `stitch.view`) as the code split's
 * state: Blocks only closes the code pane, Text only closes the blocks pane.
 */
export function legacyLayout(view: string | null): LayoutPrefs {
  const out = emptyLayout();
  if (view === 'blocks') out.splits.code = { ratio: 0.6, collapsed: 'b' };
  else if (view === 'text') out.splits.code = { ratio: 0.6, collapsed: 'a' };
  return out;
}
