<script lang="ts">
  import { ArrowLeft, ArrowRight, Copy, Plus, Trash2 } from '@lucide/svelte';
  import { blankImage, encodeLayers, quantize, type Asset, type PixelAsset, type SvgAsset } from '@stitch/cart';
  import { renderAsset, svgSize } from '@stitch/cart/render';
  import type { Component } from 'svelte';
  import { fileToDataUrl } from './assets';
  import PixelEditor from './PixelEditor.svelte';
  import type { Session } from './session';
  import { thumb } from './thumb';
  import { tell } from './dialog.svelte';

  interface Props {
    session: Session;
    spriteId: string;
    version: number;
    onchange: (what: 'assets' | 'palette') => void;
  }
  let { session, spriteId, version, onchange }: Props = $props();

  const sprite = $derived((void version, session.sprite(spriteId)));
  /** A fresh array per change: the costume list is mutated in place, so the strip needs a new value. */
  const costumeIds = $derived((void version, sprite ? [...sprite.costumes] : []));
  let selected = $state(0);
  let newSize = $state(32);
  let VectorEditor = $state<Component<{ asset: SvgAsset; onchange: () => void }> | undefined>();

  $effect(() => {
    if (sprite && selected >= sprite.costumes.length) selected = Math.max(0, sprite.costumes.length - 1);
  });

  const currentId = $derived(costumeIds[selected]);
  const startCostume = $derived((void version, sprite?.costume ?? 1));
  const current: Asset | undefined = $derived((void version, currentId ? session.assets[currentId] : undefined));
  const prevAsset: Asset | undefined = $derived.by(() => {
    void version;
    const id = sprite && selected > 0 ? sprite.costumes[selected - 1] : undefined;
    return id ? session.assets[id] : undefined;
  });

  $effect(() => {
    if (current?.kind === 'svg' && !VectorEditor) void import('./VectorEditor.svelte').then((m) => (VectorEditor = m.default));
  });

  const names = () => Object.values(session.assets).map((a) => a.name);
  const uniqueCostumeName = (base: string) => {
    const taken = new Set(names());
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  };

  function insert(asset: Asset, at = (sprite?.costumes.length ?? 0)) {
    if (!sprite) return;
    const id = session.addAsset(asset, 'costume');
    sprite.costumes.splice(at, 0, id);
    selected = at;
    onchange('assets');
  }

  function addPixel() {
    const n = newSize;
    insert({ kind: 'pixel', name: uniqueCostumeName('costume'), width: n, height: n, center: [n / 2, n / 2], layers: encodeLayers(blankImage(n, n)) });
  }

  function addVector() {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#4c97ff" stroke="#1d2b53" stroke-width="3"/></svg>';
    insert({ kind: 'svg', name: uniqueCostumeName('drawing'), svg, center: [50, 50] });
  }

  /** New frame: a copy of the current costume, right after it. */
  function duplicate() {
    if (!current) return;
    insert({ ...structuredClone(current), name: uniqueCostumeName(current.name) }, selected + 1);
  }

  function remove() {
    if (!sprite || !currentId || sprite.costumes.length < 2) return;
    sprite.costumes.splice(selected, 1);
    session.dropAssetIfUnused(currentId);
    if (sprite.costume > sprite.costumes.length) sprite.costume = sprite.costumes.length;
    onchange('assets');
  }

  function moveBy(d: number) {
    if (!sprite) return;
    const j = selected + d;
    if (j < 0 || j >= sprite.costumes.length) return;
    [sprite.costumes[selected], sprite.costumes[j]] = [sprite.costumes[j]!, sprite.costumes[selected]!];
    selected = j;
    onchange('assets');
  }

  function rename(name: string) {
    if (current && name.trim()) {
      current.name = name.trim();
      onchange('assets');
    }
  }

  async function importFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const base = uniqueCostumeName(file.name.replace(/\.[^.]+$/, '') || 'image');
    if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
      const svg = await file.text();
      const { width, height } = svgSize(svg);
      insert({ kind: 'svg', name: base, svg, center: [Math.round(width / 2), Math.round(height / 2)] });
      return;
    }
    const data = await fileToDataUrl(file);
    const bmp = await createImageBitmap(file);
    // Small images are almost always pixel art.
    const small = Math.max(bmp.width, bmp.height) <= 128;
    insert({ kind: 'png', name: base, data, pixelArt: small, center: [Math.round(bmp.width / 2), Math.round(bmp.height / 2)] });
  }

  /** Turns an imported bitmap into editable pixel art in the cart palette (same id, same place). */
  async function toPixelArt() {
    if (!current || current.kind !== 'png' || !currentId) return;
    const bmp = await renderAsset(current, session.palette);
    if (bmp.width > 256 || bmp.height > 256) {
      await tell('Too large for pixel art', 'Images larger than 256×256 can’t be converted to pixel art.');
      return;
    }
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    const q = quantize(g.getImageData(0, 0, bmp.width, bmp.height).data, session.palette);
    session.palette.splice(0, session.palette.length, ...q.palette);
    const img = blankImage(bmp.width, bmp.height);
    img.layers[0]!.pixels.set(q.pixels);
    const px: PixelAsset = { kind: 'pixel', name: current.name, width: bmp.width, height: bmp.height, center: current.center, layers: encodeLayers(img) };
    session.assets[currentId] = px;
    onchange('palette');
  }
</script>

{#if !sprite}
  <div class="empty">
    <p>The stage has no costumes. Set its background colour in <b>Cart</b>, and paint a tile map in <b>Map</b>.</p>
  </div>
{:else}
  <div class="costumes">
    <div class="strip" aria-label="Costumes (frames)">
      {#each costumeIds as id, i (id + i)}
        {@const a = session.assets[id]}
        {#if a}
          <button class="frame" class:sel={i === selected} onclick={() => (selected = i)} title="{i + 1}. {a.name} ({a.kind})">
            <canvas width="64" height="64" use:thumb={{ asset: a, palette: session.palette, version }}></canvas>
            <span>{i + 1}. {a.name}</span>
            {#if startCostume === i + 1}<em title="Starting costume">start</em>{/if}
          </button>
        {/if}
      {/each}
    </div>
    <div class="actions">
      <select bind:value={newSize} title="New pixel costume size">
        {#each [8, 16, 32, 64, 128] as n (n)}<option value={n}>{n}×{n}</option>{/each}
      </select>
      <button onclick={addPixel}><Plus />Pixel</button>
      <button onclick={addVector}><Plus />Vector</button>
      <label class="file">Import…<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.svg" onchange={importFile} /></label>
      <span class="gap"></span>
      <button onclick={duplicate} disabled={!current} title="Copy this costume as the next frame"><Copy />Duplicate</button>
      <button onclick={() => moveBy(-1)} disabled={selected === 0} title="Move earlier" aria-label="Move earlier"><ArrowLeft /></button>
      <button onclick={() => moveBy(1)} disabled={selected >= costumeIds.length - 1} title="Move later" aria-label="Move later"><ArrowRight /></button>
      <button onclick={remove} disabled={costumeIds.length < 2} title="Delete costume" aria-label="Delete costume"><Trash2 /></button>
      {#if current}
        <span class="gap"></span>
        <input class="name" value={current.name} onchange={(e) => rename((e.target as HTMLInputElement).value)} aria-label="Costume name" />
        <button
          onclick={() => {
            sprite.costume = selected + 1;
            onchange('assets');
          }}
          disabled={startCostume === selected + 1}>Use as start</button
        >
      {/if}
    </div>

    <div class="editor">
      {#if current?.kind === 'pixel'}
        <PixelEditor asset={current} palette={session.palette} onionAsset={prevAsset} onchange={(w) => onchange(w === 'palette' ? 'palette' : 'assets')} />
      {:else if current?.kind === 'svg'}
        {#if VectorEditor}
          <VectorEditor asset={current} onchange={() => onchange('assets')} />
        {:else}
          <p class="muted">Loading vector editor…</p>
        {/if}
      {:else if current?.kind === 'png'}
        <div class="png">
          <canvas width="256" height="256" use:thumb={{ asset: current, palette: session.palette, version }}></canvas>
          <div>
            <p>Imported image. Convert it to edit it here; colours are added to the cart palette.</p>
            <button onclick={toPixelArt}>Convert to pixel art</button>
            <label
              ><input
                type="checkbox"
                checked={current.pixelArt}
                onchange={(e) => {
                  if (current?.kind === 'png') current.pixelArt = (e.target as HTMLInputElement).checked;
                  onchange('assets');
                }}
              /> draw as pixel art (sharp, whole pixels)</label
            >
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .costumes { display: flex; flex-direction: column; gap: 8px; height: 100%; padding: 8px; box-sizing: border-box; min-height: 0; }
  .strip { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
  .frame { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px; font-size: 11px; position: relative; min-width: 76px; }
  .frame.sel { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .frame canvas { background: repeating-conic-gradient(var(--checker-b) 0 25%, var(--checker-a) 0 50%) 0 0 / 12px 12px; border-radius: var(--radius-s); }
  .frame span { max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .frame em { position: absolute; top: 2px; right: 2px; font-size: 9px; font-style: normal; background: var(--go); color: var(--on-go); border-radius: var(--radius-s); padding: 0 3px; }
  .actions { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 12px; }
  .actions button, .actions select { padding: 3px 7px; font-size: 12px; }
  .file { border: 1px solid var(--line); border-radius: var(--radius); padding: 3px 7px; cursor: pointer; background: var(--panel); }
  .file input { display: none; }
  .gap { width: 8px; }
  .name { width: 110px; font: inherit; padding: 3px 6px; border: 1px solid var(--line); border-radius: var(--radius); }
  .editor { flex: 1; min-height: 0; }
  .png { display: flex; gap: 16px; align-items: flex-start; padding: 8px; }
  .png canvas { background: repeating-conic-gradient(var(--checker-b) 0 25%, var(--checker-a) 0 50%) 0 0 / 16px 16px; border-radius: var(--radius); image-rendering: pixelated; }
  .empty, .muted { padding: 16px; color: var(--muted); }
</style>
