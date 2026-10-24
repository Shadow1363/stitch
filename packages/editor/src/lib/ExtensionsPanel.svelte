<script lang="ts">
  import type { CartExtension } from '@stitch/cart';
  import { extensionFromFiles, extensionFromUrl } from './extensions';
  import type { Session } from './session';
  import { ask, askText } from './dialog.svelte';

  interface Props {
    session: Session;
    version: number;
    onchange: () => void;
  }
  let { session, version, onchange }: Props = $props();

  const list = $derived((void version, session.extensions.slice()));
  let error = $state('');

  async function add(ext: CartExtension) {
    const replacing = session.extensions.some((e) => e.manifest.id === ext.manifest.id);
    if (replacing && !(await ask(`Replace the “${ext.manifest.id}” extension?`, { message: `The installed version is replaced with version ${ext.manifest.version}.`, ok: 'Replace' }))) return;
    session.addExtension(ext);
    error = '';
    onchange();
  }

  async function fromFiles(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    try {
      add(extensionFromFiles(await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })))));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function fromUrl() {
    const url = (
      await askText('Add an extension from a URL', {
        message: 'The manifest’s "main" names the code. Its server must allow cross-origin requests.',
        placeholder: 'https://…/manifest.json',
        label: 'Manifest URL',
        ok: 'Add',
      })
    )?.trim();
    if (!url) return;
    try {
      await add(await extensionFromUrl(url));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function remove(ext: CartExtension) {
    if (!(await ask(`Remove “${ext.manifest.name}”?`, { message: 'Scripts that use its blocks will show errors until you add it back.', ok: 'Remove', danger: true }))) return;
    session.removeExtension(ext.manifest.id);
    onchange();
  }
</script>

<section class="ext">
  <h3>Extensions</h3>
  <p class="muted">
    An extension adds blocks from a manifest and a script. It is saved inside the cart, and its code runs only in the sandboxed stage.
  </p>
  {#each list as ext (ext.manifest.id)}
    <div class="item">
      <span class="swatch" style:background={ext.manifest.color}></span>
      <div class="info">
        <strong>{ext.manifest.name}</strong> <span class="muted">{ext.manifest.id} · v{ext.manifest.version} · {ext.manifest.blocks.length} block{ext.manifest.blocks.length === 1 ? '' : 's'}</span>
        {#if ext.manifest.description}<div class="muted">{ext.manifest.description}</div>{/if}
      </div>
      <button onclick={() => remove(ext)}>Remove</button>
    </div>
  {:else}
    <p class="muted">None yet. Try the sample: <code>/extensions/text/manifest.json</code></p>
  {/each}
  <div class="row">
    <label class="file">Add from files…<input type="file" multiple accept=".json,.js,application/json,text/javascript" onchange={(e) => fromFiles(e.target as HTMLInputElement)} /></label>
    <button onclick={fromUrl}>Add from URL…</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .item { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 6px 8px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
  .swatch { width: 14px; height: 14px; border-radius: var(--radius-s); flex: none; }
  .info { flex: 1; min-width: 0; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; }
  .file { border: 1px solid var(--line); border-radius: var(--radius); padding: 4px 10px; cursor: pointer; background: var(--panel); display: inline-block; font-size: 13px; }
  .file input { display: none; }
  .muted { color: var(--muted); font-size: 12px; margin: 0; }
  .error { color: var(--bad); font-size: 12px; margin: 0; }
  code { font-family: var(--font-mono); }
</style>
