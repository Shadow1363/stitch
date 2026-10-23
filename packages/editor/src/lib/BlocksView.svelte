<script lang="ts">
  import type { BlockJson, Position } from '@stitch/blocks';
  import { BlocksWorkspace } from '@stitch/blocks/workspace';
  import type { Module } from '@stitch/ir';
  import { onMount } from 'svelte';

  interface Props {
    onchange: (blocks: BlockJson[]) => void;
    onlayout: (layout: Record<string, Position>) => void;
    onundo: () => void;
    onredo: () => void;
    info: () => { vars: string[]; functions: { name: string; params: string[] }[] };
    onready: () => void;
    /** Pointer entered the blocks area: flush any pending redraw before the user edits. */
    onenter: () => void;
  }
  let { onchange, onlayout, onundo, onredo, info, onready, onenter }: Props = $props();

  let host: HTMLDivElement;
  let ws: BlocksWorkspace | undefined;

  onMount(() => {
    ws = new BlocksWorkspace(host, {
      onChange: (b) => onchange(b),
      onLayout: (l) => onlayout(l),
      onUndo: () => onundo(),
      onRedo: () => onredo(),
      info: () => info(),
      debugGlobal: import.meta.env.DEV,
    });
    const ro = new ResizeObserver(() => ws?.resize());
    ro.observe(host);
    onready();
    return () => {
      ro.disconnect();
      ws?.dispose();
    };
  });

  export function show(module: Module, layout: Record<string, Position>, loose: BlockJson[]) {
    ws?.show(module, layout, loose);
  }
</script>

<div class="blocks" bind:this={host} onpointerenter={onenter} role="application" aria-label="Blocks editor"></div>

<style>
  .blocks {
    width: 100%;
    height: 100%;
  }
</style>
