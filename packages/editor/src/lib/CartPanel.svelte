<script lang="ts">
  import { MAX_CLONE_LIMIT, type StageSettings } from '@stitch/cart';
  import type { Session } from './session';
  import { askText } from './dialog.svelte';
  import { SAMPLES } from './samples';

  interface Props {
    session: Session;
    version: number;
    status: string;
    onchange: (what: 'meta' | 'stage') => void;
    onsave: () => void;
    onopen: (file: File) => void;
    onopenurl: (url: string) => void;
    onnew: () => void;
    onsample: (id: string) => void;
  }
  let { session, version, status, onchange, onsave, onopen, onopenurl, onnew, onsample }: Props = $props();

  const stage = $derived((void version, session.stage));
  const meta = $derived((void version, session.meta));

  function setStage<K extends keyof StageSettings>(k: K, v: StageSettings[K]) {
    session.stage = { ...session.stage, [k]: v };
    onchange('stage');
  }

  function setScaling(k: 'mode' | 'filter', v: string) {
    session.stage = { ...session.stage, scaling: { ...session.stage.scaling, [k]: v } };
    onchange('stage');
  }

  function setSize(k: 'width' | 'height', v: number) {
    if (Number.isInteger(v) && v > 0 && v <= 4096) setStage(k, v);
  }

  function setCloneLimit(v: number) {
    if (Number.isInteger(v) && v >= 0 && v <= MAX_CLONE_LIMIT) setStage('cloneLimit', v);
  }

  async function openUrl() {
    const url = await askText('Open a cart from a URL', {
      message: 'A .stitch.png or .json file. Its server must allow cross-origin requests.',
      placeholder: 'https://…',
      label: 'Cart URL',
      ok: 'Open',
    });
    if (url?.trim()) onopenurl(url.trim());
  }
</script>

<div class="cart">
  <section>
    <h3>Cart</h3>
    <label>Title <input value={meta.title} onchange={(e) => ((session.meta = { ...session.meta, title: (e.target as HTMLInputElement).value || 'Untitled' }), onchange('meta'))} /></label>
    <label
      >Author <input
        value={meta.author ?? ''}
        onchange={(e) => {
          const v = (e.target as HTMLInputElement).value.trim();
          const { author: _drop, ...rest } = session.meta;
          session.meta = v ? { ...rest, author: v } : rest;
          onchange('meta');
        }}
      /></label
    >
    <div class="row">
      <button class="primary" onclick={onsave}>⬇ Save .stitch.png</button>
      <label class="file">Open file…<input type="file" accept=".png,.json,image/png,application/json" onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) onopen(f); }} /></label>
      <button onclick={openUrl}>Open URL…</button>
    </div>
    <div class="row">
      <button onclick={onnew}>New cart</button>
      <label
        >Samples
        <select value="" onchange={(e) => { const s = e.target as HTMLSelectElement; const id = s.value; s.value = ''; if (id) onsample(id); }}>
          <option value="" disabled>Open a sample…</option>
          {#each SAMPLES as s (s.id)}<option value={s.id}>{s.title}: {s.about}</option>{/each}
        </select>
      </label>
    </div>
    <p class="muted">You can also drop a <code>.stitch.png</code> anywhere on the editor, or open <code>?cart=URL</code>. {status}</p>
  </section>

  <section>
    <h3>Stage</h3>
    <div class="grid">
      <label>Width <input type="number" min="1" max="4096" value={stage.width} onchange={(e) => setSize('width', +(e.target as HTMLInputElement).value)} /></label>
      <label>Height <input type="number" min="1" max="4096" value={stage.height} onchange={(e) => setSize('height', +(e.target as HTMLInputElement).value)} /></label>
      <label
        >Origin
        <select value={stage.origin} onchange={(e) => setStage('origin', (e.target as HTMLSelectElement).value as StageSettings['origin'])}>
          <option value="center">centre (Scratch)</option>
          <option value="top-left">top-left</option>
        </select>
      </label>
      <label
        >Y axis
        <select value={stage.yAxis} onchange={(e) => setStage('yAxis', (e.target as HTMLSelectElement).value as StageSettings['yAxis'])}>
          <option value="up">up (Scratch)</option>
          <option value="down">down (screen)</option>
        </select>
      </label>
      <label
        >Scaling
        <select value={stage.scaling.mode} onchange={(e) => setScaling('mode', (e.target as HTMLSelectElement).value)}>
          <option value="fit">fit</option>
          <option value="integer">whole numbers only</option>
        </select>
      </label>
      <label
        >Filtering
        <select value={stage.scaling.filter} onchange={(e) => setScaling('filter', (e.target as HTMLSelectElement).value)}>
          <option value="smooth">smooth (pixel-art costumes stay sharp)</option>
          <option value="pixel">pixel (everything sharp)</option>
        </select>
      </label>
      <label>Background <input type="color" value={stage.background} oninput={(e) => setStage('background', (e.target as HTMLInputElement).value)} /></label>
      <label title="Most clones alive at once. Scratch uses 300.">Clone limit <input type="number" min="0" max={MAX_CLONE_LIMIT} value={stage.cloneLimit} onchange={(e) => setCloneLimit(+(e.target as HTMLInputElement).value)} /></label>
    </div>
    <p class="muted">Direction is always visual: 90 points right and 0 points up, whatever the y axis.</p>
  </section>
</div>

<style>
  .cart { padding: 12px 16px 18px; display: flex; flex-direction: column; gap: 18px; max-width: 560px; box-sizing: border-box; }
  h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  section { display: flex; flex-direction: column; gap: 8px; }
  label { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; }
  input:not([type]), input[type='number'] { font: inherit; padding: 4px 6px; border: 1px solid var(--line); border-radius: var(--radius); width: 260px; }
  select { width: 272px; }
  input[type='number'] { width: 90px; }
  select { font: inherit; padding: 3px 6px; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; }
  .primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .file { border: 1px solid var(--line); border-radius: var(--radius); padding: 4px 10px; cursor: pointer; background: var(--panel); display: inline-block; }
  .file input { display: none; }
  .muted { color: var(--muted); font-size: 12px; margin: 0; }
</style>
