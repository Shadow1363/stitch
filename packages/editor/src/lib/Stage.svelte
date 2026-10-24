<script lang="ts">
  import { StageClient } from '@stitch/runtime/bridge';
  import type { FromStage, HttpResponse, LoadPayload } from '@stitch/runtime/protocol';
  import { Maximize, Minimize } from '@lucide/svelte';
  import { onMount } from 'svelte';

  interface Props {
    onmessage: (m: FromStage) => void;
  }
  let { onmessage }: Props = $props();

  let host: HTMLDivElement;
  let frame: HTMLDivElement;
  let client: StageClient | undefined;
  let full = $state(false);

  /** Shows the stage full screen (Esc leaves), with the keyboard going to the game. */
  function toggleFullscreen() {
    if (document.fullscreenElement === frame) void document.exitFullscreen();
    else void frame.requestFullscreen().then(() => client?.focus(), () => {});
  }

  onMount(() => {
    client = new StageClient(host, {
      src: '/stage.html',
      onMessage: (m) => onmessage(m),
      onRestart: () => onmessage({ t: 'log', sprite: 'editor', text: 'Stage stopped responding and was restarted.' }),
    });
    return () => client?.destroy();
  });

  export function load(p: LoadPayload) {
    client?.load(p);
  }
  export function run() {
    client?.run();
  }
  export function stop() {
    client?.stop();
  }
  export function pause(paused: boolean) {
    client?.pause(paused);
  }
  export function httpResult(id: number, res: HttpResponse) {
    client?.httpResult(id, res);
  }
</script>

<svelte:document onfullscreenchange={() => (full = document.fullscreenElement === frame)} />

<div class="frame" bind:this={frame}>
  <div class="stage" bind:this={host}></div>
  <button class="full" onclick={toggleFullscreen} title={full ? 'Leave full screen (Esc)' : 'Full screen'} aria-label={full ? 'Leave full screen' : 'Full screen'}>
    {#if full}<Minimize />{:else}<Maximize />{/if}
  </button>
</div>

<style>
  .frame {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    background: var(--letterbox);
    border-radius: var(--radius-l);
  }
  .frame:fullscreen, .frame:fullscreen .stage { border-radius: 0; }
  .full {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    padding: var(--space-1);
    opacity: 0.55;
    background: var(--panel);
  }
  .full:hover, .full:focus-visible { opacity: 1; }
  .stage {
    /* Fills its frame; the renderer letterboxes the cart's stage inside. */
    width: 100%;
    flex: 1;
    min-height: 0;
    background: var(--letterbox);
    border-radius: var(--radius-l);
    overflow: hidden;
  }
</style>
