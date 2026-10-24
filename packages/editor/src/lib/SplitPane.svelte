<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getLayoutContext } from './layout.svelte';
  import type { Orientation } from './layout';
  import Sash from './Sash.svelte';
  import type { SplitState } from './split';

  interface Props {
    /** Saved per cart under this id (see layout.ts). */
    id: string;
    orientation?: Orientation;
    /** Pane A's share before anything is saved. */
    ratio?: number;
    minA?: number;
    minB?: number;
    /** Names the sash for screen readers, e.g. "Resize blocks and code". */
    label: string;
    a: Snippet;
    b: Snippet;
  }
  let { id, orientation = 'horizontal', ratio = 0.5, minA = 200, minB = 200, label, a, b }: Props = $props();

  /** Width of the sash's grab area; the line it draws is thinner. */
  const SASH = 7;

  const store = getLayoutContext();
  let own = $state<SplitState | undefined>();
  const split = $derived(own ?? store?.get(id, { ratio, collapsed: null }) ?? { ratio, collapsed: null });

  function change(s: SplitState) {
    if (store) store.set(id, s);
    else own = s;
  }

  let el: HTMLDivElement | undefined;
  const horizontal = $derived(orientation === 'horizontal');
  /** Measured when asked (during a drag or a key press), so nothing re-renders on resize. */
  const length = () => {
    const r = el?.getBoundingClientRect();
    return r ? (horizontal ? r.width : r.height) : 0;
  };
  const limits = () => ({ total: Math.max(0, length() - SASH), minA, minB });
  const origin = () => {
    const r = el?.getBoundingClientRect();
    return r ? (horizontal ? r.left : r.top) : 0;
  };

  /** Fractions rather than pixels, so the split keeps its proportions as the window resizes. */
  const template = $derived(
    split.collapsed === 'a'
      ? `0px ${SASH}px minmax(0, 1fr)`
      : split.collapsed === 'b'
        ? `minmax(0, 1fr) ${SASH}px 0px`
        : `minmax(0, ${split.ratio}fr) ${SASH}px minmax(0, ${1 - split.ratio}fr)`,
  );
</script>

<div
  bind:this={el}
  class="split {orientation}"
  style:grid-template-columns={horizontal ? template : null}
  style:grid-template-rows={horizontal ? null : template}
  data-split={id}
>
  <div class="pane" class:closed={split.collapsed === 'a'} inert={split.collapsed === 'a'}>{@render a()}</div>
  <Sash {orientation} {split} {limits} {origin} onchange={change} {label} />
  <div class="pane" class:closed={split.collapsed === 'b'} inert={split.collapsed === 'b'}>{@render b()}</div>
</div>

<style>
  .split { display: grid; min-width: 0; min-height: 0; height: 100%; width: 100%; }
  .pane { min-width: 0; min-height: 0; overflow: hidden; position: relative; display: flex; flex-direction: column; }
  .pane.closed { visibility: hidden; }
</style>
