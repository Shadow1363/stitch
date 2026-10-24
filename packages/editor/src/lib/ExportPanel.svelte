<script lang="ts">
  import { download } from './files';
  import { exportGame, type ExportKind } from './exporter';
  import type { Session } from './session';

  interface Props {
    session: Session;
  }
  let { session }: Props = $props();

  let busy = $state<ExportKind | undefined>();
  let error = $state('');
  let done = $state('');

  const KINDS: { kind: ExportKind; label: string; about: string }[] = [
    { kind: 'html', label: 'HTML file', about: 'One page that runs anywhere, even opened from disk. Easiest to share or upload to itch.io.' },
    { kind: 'pwa', label: 'Web app (zip)', about: 'Upload the folder to any HTTPS host. Players can install it and play offline.' },
    { kind: 'tauri', label: 'Desktop project (zip)', about: 'A Tauri 2 project for Windows, macOS and Linux apps. Building it needs Rust; see its README.' },
  ];

  async function run(kind: ExportKind) {
    busy = kind;
    error = '';
    done = '';
    try {
      const r = await exportGame(session, kind);
      download(r.blob, r.filename);
      done = `Exported ${r.filename} (${Math.ceil(r.blob.size / 1024)} KB).`;
    } catch (e) {
      error = `Couldn’t export: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busy = undefined;
    }
  }
</script>

<section>
  <h3>Export</h3>
  <p class="muted">
    A player for this cart alone, with no editor. It asks players before contacting a host and never includes your secrets, so a game that needs an API key needs a
    server of its own that holds it.
  </p>
  {#each KINDS as k (k.kind)}
    <div class="item">
      <button onclick={() => run(k.kind)} disabled={busy !== undefined}>{busy === k.kind ? 'Exporting…' : k.label}</button>
      <span class="muted">{k.about}</span>
    </div>
  {/each}
  {#if done}<p class="muted" role="status">{done}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .item { display: grid; grid-template-columns: 170px 1fr; align-items: center; gap: 10px; }
  .muted { color: var(--muted); font-size: 12px; margin: 0; }
  .error { color: var(--bad); font-size: 12px; margin: 0; }
</style>
