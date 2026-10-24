/**
 * The maths of a two-pane split with a draggable sash, pure so it's tested in Node
 * (Sash.svelte and SplitPane.svelte apply it). Sizes are pane A's (left or top) in pixels.
 */

/** A split's state: pane A's share of the space, and which pane (if any) is snapped closed. */
export interface SplitState {
  /** Pane A's fraction of the space while both are open, 0–1. Kept while a pane is closed. */
  ratio: number;
  collapsed: 'a' | 'b' | null;
}

export interface SplitLimits {
  /** Space for both panes, in pixels (the sash excluded). */
  total: number;
  minA: number;
  minB: number;
}

export const evenSplit = (): SplitState => ({ ratio: 0.5, collapsed: null });

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Pane A's size in pixels. */
export function sizeA(s: SplitState, total: number): number {
  if (s.collapsed === 'a') return 0;
  if (s.collapsed === 'b') return total;
  return Math.round(s.ratio * total);
}

/**
 * The state for a sash dragged so pane A would be `size` pixels. A pane can't be smaller than
 * its minimum: past half of it, the pane snaps closed; dragging back out reopens it.
 */
export function dragTo(size: number, l: SplitLimits): SplitState {
  const { total, minA, minB } = l;
  if (size < minA / 2) return { ratio: minA / Math.max(total, 1), collapsed: 'a' };
  if (total - size < minB / 2) return { ratio: 1 - minB / Math.max(total, 1), collapsed: 'b' };
  // Too small to honour both minimums: share the space.
  if (total < minA + minB)
    return { ratio: clamp(size / Math.max(total, 1), 0, 1), collapsed: null };
  return { ratio: clamp(size, minA, total - minB) / total, collapsed: null };
}

/** Keyboard steps: arrows move by `step`, never closing a pane; arrows out of a closed pane reopen it. */
export function nudge(s: SplitState, delta: number, l: SplitLimits): SplitState {
  if (s.collapsed === 'a') return delta > 0 ? dragTo(l.minA, l) : s;
  if (s.collapsed === 'b') return delta < 0 ? dragTo(l.total - l.minB, l) : s;
  const next = clamp(sizeA(s, l.total) + delta, l.minA, l.total - l.minB);
  return dragTo(next, l);
}

/** Home and End: close pane A or pane B, keeping the open size to come back to. */
export const collapse = (s: SplitState, pane: 'a' | 'b'): SplitState => ({ ...s, collapsed: pane });

/** A saved state, checked: anything malformed gives `fallback`. */
export function parseSplit(v: unknown, fallback: SplitState): SplitState {
  if (!v || typeof v !== 'object') return fallback;
  const { ratio, collapsed } = v as Record<string, unknown>;
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return fallback;
  return {
    ratio: clamp(ratio, 0, 1),
    collapsed: collapsed === 'a' || collapsed === 'b' ? collapsed : null,
  };
}
