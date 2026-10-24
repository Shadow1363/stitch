<script lang="ts">
  import SfxEditor from './SfxEditor.svelte';
  import type { Session } from './session';
  import Tracker from './Tracker.svelte';

  interface Props {
    session: Session;
    version: number;
    onchange: () => void;
  }
  let { session, version, onchange }: Props = $props();
  let tab = $state<'effects' | 'music'>('effects');
</script>

<div class="sounds">
  <div class="seg" role="tablist" aria-label="Sounds">
    <button role="tab" aria-selected={tab === 'effects'} class:on={tab === 'effects'} onclick={() => (tab = 'effects')}>Effects</button>
    <button role="tab" aria-selected={tab === 'music'} class:on={tab === 'music'} onclick={() => (tab = 'music')}>Music</button>
  </div>
  <div class="host">
    {#if tab === 'effects'}
      <SfxEditor {session} {version} {onchange} />
    {:else}
      <Tracker {session} {version} {onchange} />
    {/if}
  </div>
</div>

<style>
  .sounds { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .seg { display: inline-flex; padding: 8px 8px 0; }
  .seg button { border-radius: 0; margin-left: -1px; padding: 3px 10px; font-size: 12px; }
  .seg button:first-child { border-radius: 6px 0 0 6px; }
  .seg button:last-child { border-radius: 0 6px 6px 0; }
  .seg button.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .host { flex: 1; min-height: 0; }
</style>
