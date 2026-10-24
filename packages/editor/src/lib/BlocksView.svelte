<script lang="ts">
  import type { BlockJson, Position } from '@stitch/blocks';
  import { BlocksWorkspace, type BlocksSurfaces } from '@stitch/blocks/workspace';
  import type { Catalog, Module } from '@stitch/ir';
  import { onMount } from 'svelte';
  import { onThemeChange, token } from './theme';

  interface Props {
    onchange: (blocks: BlockJson[]) => void;
    onlayout: (layout: Record<string, Position>) => void;
    onundo: () => void;
    onredo: () => void;
    info: () => { vars: string[]; functions: { name: string; params: string[] }[] };
    onready: () => void;
    /** Pointer entered the blocks area: flush any pending redraw before the user edits. */
    onenter: () => void;
    /** A block was selected: its id and its parents' ids (see WorkspaceCallbacks.onSelect). */
    onselect: (ids: string[]) => void;
    /** The user scrolled the workspace. */
    onscroll: () => void;
  }
  let { onchange, onlayout, onundo, onredo, info, onready, onenter, onselect, onscroll }: Props = $props();

  let host: HTMLDivElement;
  let ws: BlocksWorkspace | undefined;
  /** When the user last used the pointer, wheel or keys here: Blockly also selects and scrolls by itself. */
  let lastInput = -Infinity;
  const markInput = () => (lastInput = performance.now());

  const surfaces = (): BlocksSurfaces => ({
    workspace: token('--blocks-workspace'),
    toolbox: token('--panel'),
    flyout: token('--blocks-flyout'),
    text: token('--text'),
    muted: token('--muted'),
    font: token('--font-ui'),
  });

  onMount(() => {
    ws = new BlocksWorkspace(host, {
      surfaces: surfaces(),
      onChange: (b) => onchange(b),
      onLayout: (l) => onlayout(l),
      onUndo: () => onundo(),
      onRedo: () => onredo(),
      info: () => info(),
      onSelect: (ids) => {
        if (performance.now() - lastInput < 1000) onselect(ids);
      },
      onScroll: () => {
        if (performance.now() - lastInput < 1000) onscroll();
      },
      debugGlobal: import.meta.env.DEV,
    });
    const ro = new ResizeObserver(() => ws?.resize());
    ro.observe(host);
    const off = onThemeChange(() => ws?.setSurfaces(surfaces()));
    onready();
    return () => {
      off();
      ro.disconnect();
      ws?.dispose();
    };
  });

  /** Glows a block and scrolls it into view (linked with the code). False when it isn't there. */
  export function highlight(id: string | undefined): boolean {
    return ws?.highlight(id) ?? false;
  }

  export function topBlockInView(): string | undefined {
    return ws?.topBlockInView();
  }

  /** `catalog` brings the cart's extension blocks; switching it rebuilds the toolbox. */
  export function show(module: Module, layout: Record<string, Position>, loose: BlockJson[], catalog: Catalog) {
    ws?.setCatalog(catalog);
    ws?.show(module, layout, loose);
  }
</script>

<div class="blocks" bind:this={host} onpointerenter={onenter} onpointerdowncapture={markInput} onkeydowncapture={markInput} onwheelcapture={markInput} role="application" aria-label="Blocks editor"></div>

<style>
  .blocks {
    width: 100%;
    height: 100%;
  }
</style>
