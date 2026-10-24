<script lang="ts">
  import type { Orientation } from './layout';
  import { collapse, dragTo, evenSplit, nudge, sizeA, type SplitLimits, type SplitState } from './split';

  interface Props {
    /** horizontal: panes side by side (a vertical bar); vertical: stacked (a horizontal bar). */
    orientation: Orientation;
    split: SplitState;
    /** The space and minimum sizes right now (measured by the SplitPane). */
    limits: () => SplitLimits;
    /** Where pane A starts, in viewport pixels along the split. */
    origin: () => number;
    onchange: (s: SplitState) => void;
    label: string;
  }
  let { orientation, split, limits, origin, onchange, label }: Props = $props();

  let dragging = $state(false);
  let el: HTMLDivElement;
  let pending: PointerEvent | undefined;
  let frame = 0;
  /** Where in the sash the pointer grabbed it, so the sash doesn't jump under the pointer. */
  let grab = 0;

  const along = (e: PointerEvent) => (orientation === 'horizontal' ? e.clientX : e.clientY);

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    grab = along(e) - (orientation === 'horizontal' ? r.left : r.top);
    dragging = true;
    // While dragging, iframes and editors mustn't take the pointer (the stage would swallow it).
    document.body.classList.add('sash-dragging', `sash-${orientation}`);
  }

  function move(e: PointerEvent) {
    if (!dragging) return;
    pending = e;
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (pending) onchange(dragTo(along(pending) - grab - origin(), limits()));
    });
  }

  function up(e: PointerEvent) {
    if (!dragging) return;
    el.releasePointerCapture(e.pointerId);
    dragging = false;
    document.body.classList.remove('sash-dragging', `sash-${orientation}`);
  }

  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 64 : 16;
    const back = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const forward = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    let next: SplitState | undefined;
    if (e.key === back) next = nudge(split, -step, limits());
    else if (e.key === forward) next = nudge(split, step, limits());
    else if (e.key === 'Home') next = collapse(split, 'a');
    else if (e.key === 'End') next = collapse(split, 'b');
    else if (e.key === 'Enter') next = split.collapsed ? { ...split, collapsed: null } : evenSplit();
    if (!next) return;
    e.preventDefault();
    onchange(next);
  }

  const percent = $derived.by(() => {
    const t = limits().total;
    return t ? Math.round((sizeA(split, t) / t) * 100) : Math.round(split.ratio * 100);
  });
</script>

<!-- A focusable separator is ARIA's window-splitter pattern: it's interactive by design. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={el}
  class="sash {orientation}"
  class:dragging
  role="separator"
  aria-orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={percent}
  tabindex="0"
  title="Drag to resize · double-click for 50/50 · arrows, Home and End from the keyboard"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  ondblclick={() => onchange(evenSplit())}
  onkeydown={key}
></div>

<style>
  .sash { position: relative; z-index: 2; touch-action: none; outline: none; }
  .sash::before { content: ''; position: absolute; background: var(--line); transition: background 0.1s, box-shadow 0.1s; }
  .horizontal { cursor: col-resize; }
  .vertical { cursor: row-resize; }
  .horizontal::before { left: 50%; top: 0; bottom: 0; width: 1px; transform: translateX(-50%); }
  .vertical::before { top: 50%; left: 0; right: 0; height: 1px; transform: translateY(-50%); }
  .sash:hover::before, .sash.dragging::before, .sash:focus-visible::before { background: var(--accent); }
  .horizontal:hover::before, .horizontal.dragging::before, .horizontal:focus-visible::before { width: 4px; }
  .vertical:hover::before, .vertical.dragging::before, .vertical:focus-visible::before { height: 4px; }
  .sash:focus-visible::before { box-shadow: 0 0 0 2px var(--focus); }
</style>
