<script lang="ts">
  import { StageClient } from '@stitch/runtime/bridge';
  import type { FromStage, HttpResponse, LoadPayload } from '@stitch/runtime/protocol';
  import { onMount } from 'svelte';

  interface Props {
    onmessage: (m: FromStage) => void;
  }
  let { onmessage }: Props = $props();

  let host: HTMLDivElement;
  let client: StageClient | undefined;

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

<div class="stage" bind:this={host}></div>

<style>
  .stage {
    /* Fills its pane; the renderer letterboxes the cart's stage inside. */
    width: 100%;
    flex: 1;
    min-height: 0;
    background: var(--letterbox);
    border-radius: var(--radius-l);
    overflow: hidden;
  }
</style>
