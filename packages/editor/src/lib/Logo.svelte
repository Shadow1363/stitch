<script lang="ts">
  import { logoSvg } from './logo';

  let { size = 24, mono = false }: { size?: number; mono?: boolean } = $props();
</script>

<span class="logo" style:width="{size}px" style:height="{size}px">{@html logoSvg({ mono })}</span>

<style>
  .logo { display: inline-flex; flex: none; }
  .logo :global(svg) { width: 100%; height: 100%; }
</style>
