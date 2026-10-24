import { getContext, setContext } from 'svelte';
import {
  DEFAULT_LAYOUT_KEY,
  emptyLayout,
  layoutKey,
  legacyLayout,
  parseLayout,
  type Orientation,
} from './layout';
import type { SplitState } from './split';
import { kvGet, kvSet } from './storage';

/** The live layout: SplitPanes read and write their state here by id (see layout.ts). */
export class LayoutStore {
  orientation = $state<Orientation>('horizontal');
  splits = $state<Record<string, SplitState>>({});
  private key = DEFAULT_LAYOUT_KEY;
  private timer: ReturnType<typeof setTimeout> | undefined;

  get(id: string, fallback: SplitState): SplitState {
    return this.splits[id] ?? fallback;
  }

  set(id: string, s: SplitState): void {
    this.splits[id] = s;
    this.save();
  }

  setOrientation(o: Orientation): void {
    this.orientation = o;
    this.save();
  }

  /** Switches to a cart's layout: its own, else the last one used, else the old view setting. */
  async load(title: string): Promise<void> {
    this.key = layoutKey(title);
    let saved: unknown;
    try {
      saved = (await kvGet<unknown>(this.key)) ?? (await kvGet<unknown>(DEFAULT_LAYOUT_KEY));
    } catch {
      // storage unavailable: defaults
    }
    const prefs = saved ? parseLayout(saved) : legacy();
    this.orientation = prefs.orientation;
    this.splits = prefs.splits;
  }

  /** Writes a moment after the last change, so a drag is one write. */
  private save(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const v = $state.snapshot({ orientation: this.orientation, splits: this.splits });
      void kvSet(this.key, v).catch(() => {});
      void kvSet(DEFAULT_LAYOUT_KEY, v).catch(() => {});
    }, 300);
  }
}

function legacy() {
  try {
    return legacyLayout(localStorage.getItem('stitch.view'));
  } catch {
    return emptyLayout();
  }
}

const KEY = Symbol('layout');

export const setLayoutContext = (s: LayoutStore) => setContext(KEY, s);
/** The app's layout store, or undefined outside the app (a SplitPane then keeps its own state). */
export const getLayoutContext = () => getContext<LayoutStore | undefined>(KEY);
