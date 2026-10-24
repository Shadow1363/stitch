<script lang="ts">
  import SplitPane from './SplitPane.svelte';
  import {
    cloneImage,
    composite,
    decodeLayers,
    drawLine,
    drawRect,
    encodeLayers,
    floodFill,
    MAX_COLORS,
    setPixel,
    TRANSPARENT,
    type Asset,
    type PixelAsset,
    type PixelImage,
  } from '@stitch/cart';
  import { renderAsset } from '@stitch/cart/render';
  import { untrack } from 'svelte';
  import { token } from './theme';
  import { themeVersion } from './theme-version.svelte';
  import { askText } from './dialog.svelte';

  interface Props {
    asset: PixelAsset;
    /** Shared cart palette; colours 1..n. Edited in place. */
    palette: string[];
    /** Previous frame, drawn faintly underneath when onion skin is on. */
    onionAsset?: Asset | undefined;
    onchange: (what: 'pixels' | 'palette') => void;
  }
  let { asset, palette, onionAsset, onchange }: Props = $props();

  type Tool = 'pencil' | 'eraser' | 'fill' | 'line' | 'rect' | 'picker' | 'center';
  const TOOLS: { id: Tool; label: string; key: string }[] = [
    { id: 'pencil', label: '✏️ Pencil', key: 'p' },
    { id: 'eraser', label: '⌫ Eraser', key: 'e' },
    { id: 'fill', label: '🪣 Fill', key: 'f' },
    { id: 'line', label: '╱ Line', key: 'l' },
    { id: 'rect', label: '▭ Rect', key: 'r' },
    { id: 'picker', label: '💧 Pick', key: 'i' },
    { id: 'center', label: '✛ Center', key: 'c' },
  ];

  // Initial values only; the effect below reloads when `asset` changes.
  const first = untrack(() => ({ asset, palette }));
  let img = $state.raw<PixelImage>(decodeLayers(first.asset.width, first.asset.height, first.asset.layers));
  let shown: PixelAsset = first.asset;
  let layer = $state(0);
  let tool = $state<Tool>('pencil');
  let color = $state(Math.min(9, first.palette.length));
  let zoom = $state(autoZoom(first.asset));
  let grid = $state(true);
  let onion = $state(true);
  let hover = $state<[number, number] | null>(null);
  let paletteVersion = $state(0);
  let onionBitmap: ImageBitmap | null = null;
  let onionFor: Asset | undefined;
  let undoStack: PixelImage[] = [];
  let redoStack: PixelImage[] = [];

  let canvas: HTMLCanvasElement;
  const scratch = new OffscreenCanvas(1, 1);

  function autoZoom(a: PixelAsset) {
    return Math.max(2, Math.min(32, Math.floor(448 / Math.max(a.width, a.height))));
  }

  // Switching costumes (frames) loads the new image and its own history.
  $effect(() => {
    if (asset !== shown) {
      shown = asset;
      img = decodeLayers(asset.width, asset.height, asset.layers);
      layer = Math.min(layer, img.layers.length - 1);
      zoom = autoZoom(asset);
      undoStack = [];
      redoStack = [];
    }
  });

  $effect(() => {
    const a = onionAsset;
    void paletteVersion;
    if (a === onionFor && onionBitmap) return;
    onionFor = a;
    onionBitmap = null;
    if (a) void renderAsset(a, palette).then((b) => (a === onionFor ? ((onionBitmap = b), draw()) : undefined));
  });

  // ---- drawing ----

  let drag: { x0: number; y0: number; x: number; y: number; preview: boolean } | null = null;

  function draw() {
    if (!canvas) return;
    const { width: w, height: h } = img;
    canvas.width = w * zoom;
    canvas.height = h * zoom;
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const checkerA = token('--checker-a');
    const checkerB = token('--checker-b');
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        g.fillStyle = (x + y) % 2 ? checkerB : checkerA;
        g.fillRect(x * zoom, y * zoom, zoom, zoom);
      }
    if (onion && onionBitmap && onionAsset) {
      g.globalAlpha = 0.3;
      const dx = asset.center[0] - onionAsset.center[0];
      const dy = asset.center[1] - onionAsset.center[1];
      g.drawImage(onionBitmap, dx * zoom, dy * zoom, onionBitmap.width * zoom, onionBitmap.height * zoom);
      g.globalAlpha = 1;
    }
    const view = drag?.preview ? withPreview() : img;
    scratch.width = w;
    scratch.height = h;
    scratch.getContext('2d')!.putImageData(new ImageData(composite(view, palette), w, h), 0, 0);
    g.drawImage(scratch, 0, 0, w * zoom, h * zoom);
    if (grid && zoom >= 6) {
      g.strokeStyle = token('--grid-line');
      g.beginPath();
      for (let x = 1; x < w; x++) g.moveTo(x * zoom + 0.5, 0), g.lineTo(x * zoom + 0.5, h * zoom);
      for (let y = 1; y < h; y++) g.moveTo(0, y * zoom + 0.5), g.lineTo(w * zoom, y * zoom + 0.5);
      g.stroke();
    }
    const [cx, cy] = asset.center;
    g.strokeStyle = token('--guide');
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx * zoom - 8, cy * zoom);
    g.lineTo(cx * zoom + 8, cy * zoom);
    g.moveTo(cx * zoom, cy * zoom - 8);
    g.lineTo(cx * zoom, cy * zoom + 8);
    g.stroke();
  }

  /** The image with the in-progress line or rectangle applied to a copy. */
  function withPreview(): PixelImage {
    const copy = cloneImage(img);
    if (drag) shape(copy.layers[layer]!.pixels, drag);
    return copy;
  }

  function shape(px: Uint8Array, d: { x0: number; y0: number; x: number; y: number }) {
    const c = tool === 'eraser' ? TRANSPARENT : color;
    if (tool === 'line') drawLine(px, img.width, img.height, d.x0, d.y0, d.x, d.y, c);
    else drawRect(px, img.width, img.height, d.x0, d.y0, d.x, d.y, c);
  }

  $effect(() => {
    void [img, zoom, grid, onion, layer, paletteVersion, themeVersion()];
    draw();
  });

  // ---- editing ----

  function remember() {
    undoStack.push(cloneImage(img));
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }

  function commit() {
    asset.layers = encodeLayers(img);
    onchange('pixels');
    draw();
  }

  function cell(e: PointerEvent): [number, number] {
    const r = canvas.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * img.width), Math.floor(((e.clientY - r.top) / r.height) * img.height)];
  }

  const active = () => img.layers[layer]!.pixels;

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = cell(e);
    if (tool === 'picker') {
      for (let i = img.layers.length - 1; i >= 0; i--) {
        const l = img.layers[i]!;
        const v = l.visible ? l.pixels[y * img.width + x] : 0;
        if (v) {
          color = v;
          return;
        }
      }
      return;
    }
    if (tool === 'center') {
      const r = canvas.getBoundingClientRect();
      asset.center = [Math.round(((e.clientX - r.left) / r.width) * img.width), Math.round(((e.clientY - r.top) / r.height) * img.height)];
      onchange('pixels');
      draw();
      return;
    }
    remember();
    if (tool === 'fill') {
      floodFill(active(), img.width, img.height, x, y, color);
      commit();
      return;
    }
    drag = { x0: x, y0: y, x, y, preview: tool === 'line' || tool === 'rect' };
    if (!drag.preview) setPixel(active(), img.width, img.height, x, y, tool === 'eraser' ? TRANSPARENT : color);
    draw();
  }

  function move(e: PointerEvent) {
    const [x, y] = cell(e);
    hover = x >= 0 && y >= 0 && x < img.width && y < img.height ? [x, y] : null;
    if (!drag) return;
    if (drag.preview) {
      drag.x = x;
      drag.y = y;
    } else {
      drawLine(active(), img.width, img.height, drag.x, drag.y, x, y, tool === 'eraser' ? TRANSPARENT : color);
      drag.x = x;
      drag.y = y;
    }
    draw();
  }

  function up() {
    if (!drag) return;
    if (drag.preview) shape(active(), drag);
    drag = null;
    commit();
  }

  function undo() {
    const prev = undoStack.pop();
    if (!prev) return;
    redoStack.push(cloneImage(img));
    img = prev;
    layer = Math.min(layer, img.layers.length - 1);
    commit();
  }

  function redo() {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(cloneImage(img));
    img = next;
    commit();
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      e.stopPropagation();
      redo();
      return;
    }
    if (mod) return;
    const t = TOOLS.find((t) => t.key === e.key.toLowerCase());
    if (t) tool = t.id;
  }

  // ---- layers ----

  function editLayers(f: (img: PixelImage) => void) {
    remember();
    const next = cloneImage(img);
    f(next);
    img = next;
    commit();
  }

  const addLayer = () =>
    editLayers((im) => {
      im.layers.splice(layer + 1, 0, { name: `Layer ${im.layers.length + 1}`, visible: true, pixels: new Uint8Array(im.width * im.height) });
      layer += 1;
    });
  const deleteLayer = () =>
    editLayers((im) => {
      if (im.layers.length === 1) return;
      im.layers.splice(layer, 1);
      layer = Math.max(0, layer - 1);
    });
  const moveLayer = (d: number) =>
    editLayers((im) => {
      const j = layer + d;
      if (j < 0 || j >= im.layers.length) return;
      [im.layers[layer], im.layers[j]] = [im.layers[j]!, im.layers[layer]!];
      layer = j;
    });
  const toggleLayer = (i: number) =>
    editLayers((im) => {
      im.layers[i]!.visible = !im.layers[i]!.visible;
    });
  const renameLayer = async (i: number) => {
    const name = (await askText('Rename layer', { value: img.layers[i]!.name, label: 'Layer name', ok: 'Rename' }))?.trim();
    if (name && img.layers[i]) editLayers((im) => (im.layers[i]!.name = name));
  };

  // ---- palette ----

  function setColor(hex: string) {
    palette[color - 1] = hex;
    paletteVersion++;
    onchange('palette');
  }

  function addColor() {
    if (palette.length >= MAX_COLORS) return;
    palette.push('#ffffff');
    color = palette.length;
    paletteVersion++;
    onchange('palette');
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="art-editor pixel" tabindex="-1" onkeydown={onKey} role="application" aria-label="Pixel editor">
  <div class="tools" role="toolbar">
    {#each TOOLS as t (t.id)}
      <button class:on={tool === t.id} title="{t.label} ({t.key.toUpperCase()})" onclick={() => (tool = t.id)}>{t.label}</button>
    {/each}
    <span class="gap"></span>
    <button onclick={undo} title="Undo (⌘Z)">↶</button>
    <button onclick={redo} title="Redo (⇧⌘Z)">↷</button>
    <span class="gap"></span>
    <button onclick={() => (zoom = Math.max(1, zoom - 2))} title="Zoom out">−</button>
    <span class="zoom">{zoom}×</span>
    <button onclick={() => (zoom = Math.min(48, zoom + 2))} title="Zoom in">+</button>
    <label><input type="checkbox" bind:checked={grid} /> grid</label>
    <label title="Show the previous frame underneath"><input type="checkbox" bind:checked={onion} /> onion skin</label>
  </div>

  <div class="body">
    <SplitPane id="pixel-side" ratio={0.75} minA={240} minB={170} label="Resize the canvas and the palette">
      {#snippet a()}
        <div class="canvas-wrap">
          <canvas
            bind:this={canvas}
            class:crosshair={tool !== 'picker'}
            onpointerdown={down}
            onpointermove={move}
            onpointerup={up}
            onpointercancel={up}
            onpointerleave={() => (hover = null)}
          ></canvas>
          <div class="status">
            {img.width}×{img.height}
            {#if hover}· {hover[0]}, {hover[1]}{/if}
            · center {asset.center[0]}, {asset.center[1]}
          </div>
        </div>
      {/snippet}
      {#snippet b()}
        <aside>
          <h4>Palette</h4>
          <div class="palette">
            {#each palette as c, i (i)}
              <button class="swatch" class:sel={color === i + 1} style="background:{c}" title="{i + 1}: {c}" aria-label="colour {i + 1}" onclick={() => (color = i + 1)}></button>
            {/each}
            <button class="swatch add" title="Add colour" onclick={addColor} disabled={palette.length >= MAX_COLORS}>+</button>
          </div>
          <label class="edit-color">
            Colour {color}
            <input type="color" value={palette[color - 1] ?? '#000000'} oninput={(e) => setColor((e.target as HTMLInputElement).value)} />
          </label>

          <h4>Layers</h4>
          <ul class="layers">
            {#each img.layers.map((l, i) => ({ l, i })).reverse() as { l, i } (i)}
              <li class:sel={i === layer}>
                <button class="eye" title={l.visible ? 'Hide' : 'Show'} onclick={() => toggleLayer(i)}>{l.visible ? '👁' : '–'}</button>
                <button class="name" onclick={() => (layer = i)} ondblclick={() => renameLayer(i)}>{l.name}</button>
              </li>
            {/each}
          </ul>
          <div class="layer-actions">
            <button onclick={addLayer} title="New layer">＋</button>
            <button onclick={deleteLayer} disabled={img.layers.length === 1} title="Delete layer">🗑</button>
            <button onclick={() => moveLayer(1)} disabled={layer === img.layers.length - 1} title="Move up">↑</button>
            <button onclick={() => moveLayer(-1)} disabled={layer === 0} title="Move down">↓</button>
          </div>
        </aside>
      {/snippet}
    </SplitPane>
  </div>
</div>

<style>
  .art-editor { display: flex; flex-direction: column; gap: 8px; height: 100%; outline: none; min-height: 0; }
  .tools { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 12px; }
  .tools button { padding: 3px 7px; }
  .tools button.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .gap { width: 8px; }
  .zoom { min-width: 32px; text-align: center; font-variant-numeric: tabular-nums; }
  .body { flex: 1; display: flex; min-height: 0; }
  .canvas-wrap { flex: 1; overflow: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--chrome); border-radius: var(--radius-l); padding: 12px; min-height: 0; }
  canvas { image-rendering: pixelated; box-shadow: 0 0 0 1px var(--line); touch-action: none; }
  canvas.crosshair { cursor: crosshair; }
  .status { margin-top: 6px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  aside { flex: 1; padding-left: 6px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; overflow: auto; }
  h4 { margin: 4px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .palette { display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px; }
  .swatch { aspect-ratio: 1; padding: 0; border-radius: var(--radius-s); border: 1px solid var(--line-strong); }
  .swatch.sel { outline: 2px solid var(--accent); outline-offset: 1px; }
  .swatch.add { background: var(--panel); font-size: 14px; line-height: 1; }
  .edit-color { display: flex; align-items: center; justify-content: space-between; }
  .layers { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--radius); }
  .layers li { display: flex; border-bottom: 1px solid var(--line); }
  .layers li:last-child { border-bottom: none; }
  .layers li.sel { background: color-mix(in srgb, var(--accent) 15%, transparent); }
  .layers button { border: none; background: none; border-radius: 0; padding: 4px 6px; }
  .layers .name { flex: 1; text-align: left; }
  .layer-actions { display: flex; gap: 4px; }
  .layer-actions button { flex: 1; padding: 3px; }
</style>
