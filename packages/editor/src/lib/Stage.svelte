<script lang="ts">
  import { StageClient } from '@stitch/runtime/bridge';
  import type { FromStage, LoadPayload } from '@stitch/runtime/protocol';
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
</script>

<div class="stage" bind:this={host}></div>

<style>
  .stage {
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #111;
    border-radius: 8px;
    overflow: hidden;
  }
</style>
