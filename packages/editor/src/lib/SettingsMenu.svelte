<script lang="ts">
  import { Settings } from '@lucide/svelte';
  import type { EditorSettings } from './settings';

  interface Props {
    settings: EditorSettings;
    onchange: (s: EditorSettings) => void;
  }
  let { settings, onchange }: Props = $props();

  let open = $state(false);
  let root: HTMLDivElement;

  const set = <K extends keyof EditorSettings>(k: K, v: EditorSettings[K]) => onchange({ ...settings, [k]: v });

  function onWindowPointer(e: PointerEvent) {
    if (open && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onpointerdown={onWindowPointer} onkeydown={(e) => open && e.key === 'Escape' && (open = false)} />

<div class="settings" bind:this={root}>
  <button onclick={() => (open = !open)} aria-expanded={open} aria-haspopup="true" aria-label="Editor settings" title="Editor settings"><Settings /></button>
  {#if open}
    <div class="menu" role="group" aria-label="Editor settings">
      <label><input type="checkbox" checked={settings.formatOnSave} onchange={(e) => set('formatOnSave', e.currentTarget.checked)} /> Format code when saving the cart</label>
      <label><input type="checkbox" checked={settings.linkScrolling} onchange={(e) => set('linkScrolling', e.currentTarget.checked)} /> Link scrolling between blocks and code</label>
    </div>
  {/if}
</div>

<style>
  .settings { position: relative; }
  .settings > button { font-size: var(--text-s); white-space: nowrap; }
  .menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 20; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); min-width: 280px; background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--radius); box-shadow: 0 6px 20px color-mix(in srgb, var(--text) 18%, transparent); font-size: var(--text-s); }
  label { display: flex; gap: var(--space-2); align-items: center; }
</style>
