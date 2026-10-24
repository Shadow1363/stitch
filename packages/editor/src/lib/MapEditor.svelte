<script lang="ts">
  import { blankImage, blankMap, decodeLayers, decodeTiles, encodeLayers, encodeTiles, resizeImage, resizeMap, type PixelAsset } from '@stitch/cart';
  import { renderAsset } from '@stitch/cart/render';
  import PixelEditor from './PixelEditor.svelte';
  import type { Session } from './session';
  import { token } from './theme';
  import { themeVersion } from './theme-version.svelte';
  import { ask } from './dialog.svelte';

  interface Props {
    session: Session;
    version: number;
    onchange: (what: 'assets' | 'palette') => void;
  }
  let { session, version, onchange }: Props = $props();

  const map = $derived((void version, session.map));
  const tilesetAsset = $derived((void version, map ? session.assets[map.tileset] : undefined));
  const imageAssets = $derived((void version, Object.entries(session.assets)));

  let tile = $state(1);
  let editingTiles = $state(false);
  let newTileSize = $state(16);
  let newTileset = $state('');
  let tilesBitmap = $state.raw<ImageBitmap | null>(null);
  let mapCanvas = $state<HTMLCanvasElement>();
  let tilesCanvas = $state<HTMLCanvasElement>();
  let undoStack: string[] = [];
  let redoStack: string[] = [];
  let cells: Uint16Array = new Uint16Array(0);
  let cellsFor = '';

  const TILE_ZOOM = 3;
  const mapScale = $derived(map ? Math.max(1, Math.min(3, Math.floor(560 / (map.width * map.tileSize)))) : 1);
  const tileCols = $derived(tilesBitmap && map ? Math.floor(tilesBitmap.width / map.tileSize) : 0);
  const tileRows = $derived(tilesBitmap && map ? Math.floor(tilesBitmap.height / map.tileSize) : 0);

  $effect(() => {
    void version;
    const a = tilesetAsset;
    if (!a) {
      tilesBitmap = null;
      return;
    }
    void renderAsset(a, session.palette).then((b) => (tilesBitmap = b));
  });

  $effect(() => {
    void [tilesBitmap, mapCanvas, tilesCanvas, version, tile, themeVersion()];
    if (map && map.tiles !== cellsFor) {
      cells = decodeTiles(map);
      cellsFor = map.tiles;
    }
    drawMap();
    drawTiles();
  });

  function drawMap() {
    if (!map || !mapCanvas) return;
    const ts = map.tileSize;
    const s = mapScale;
    mapCanvas.width = map.width * ts * s;
    mapCanvas.height = map.height * ts * s;
    const g = mapCanvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.fillStyle = session.stage.background;
    g.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    // Stage outline: the map may be larger or smaller than the stage.
    if (tilesBitmap && tileCols) {
      cells.forEach((v, i) => {
        if (!v) return;
        const t = v - 1;
        g.drawImage(tilesBitmap!, (t % tileCols) * ts, Math.floor(t / tileCols) * ts, ts, ts, (i % map.width) * ts * s, Math.floor(i / map.width) * ts * s, ts * s, ts * s);
      });
    }
    g.strokeStyle = token('--grid-line');
    g.beginPath();
    for (let x = 1; x < map.width; x++) g.moveTo(x * ts * s + 0.5, 0), g.lineTo(x * ts * s + 0.5, mapCanvas.height);
    for (let y = 1; y < map.height; y++) g.moveTo(0, y * ts * s + 0.5), g.lineTo(mapCanvas.width, y * ts * s + 0.5);
    g.stroke();
    g.strokeStyle = token('--guide');
    g.setLineDash([6, 4]);
    g.strokeRect(0.5, 0.5, session.stage.width * s - 1, session.stage.height * s - 1);
    g.setLineDash([]);
  }

  function drawTiles() {
    if (!map || !tilesCanvas || !tilesBitmap) return;
    const ts = map.tileSize;
    tilesCanvas.width = tileCols * ts * TILE_ZOOM;
    tilesCanvas.height = tileRows * ts * TILE_ZOOM;
    const g = tilesCanvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, tilesCanvas.width, tilesCanvas.height);
    g.drawImage(tilesBitmap, 0, 0, tileCols * ts, tileRows * ts, 0, 0, tilesCanvas.width, tilesCanvas.height);
    if (tile > 0) {
      const t = tile - 1;
      g.strokeStyle = token('--accent');
      g.lineWidth = 3;
      g.strokeRect((t % tileCols) * ts * TILE_ZOOM + 1.5, Math.floor(t / tileCols) * ts * TILE_ZOOM + 1.5, ts * TILE_ZOOM - 3, ts * TILE_ZOOM - 3);
    }
  }

  function pickTile(e: MouseEvent) {
    if (!map || !tilesCanvas) return;
    const r = tilesCanvas.getBoundingClientRect();
    const cx = Math.floor(((e.clientX - r.left) / r.width) * tileCols);
    const cy = Math.floor(((e.clientY - r.top) / r.height) * tileRows);
    tile = cy * tileCols + cx + 1;
  }

  let painting = false;
  let before = '';

  function paintAt(e: PointerEvent) {
    if (!map || !mapCanvas) return;
    const r = mapCanvas.getBoundingClientRect();
    const cx = Math.floor(((e.clientX - r.left) / r.width) * map.width);
    const cy = Math.floor(((e.clientY - r.top) / r.height) * map.height);
    if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return;
    const v = e.buttons === 2 || e.altKey ? 0 : tile;
    if (cells[cy * map.width + cx] === v) return;
    cells[cy * map.width + cx] = v;
    drawMap();
  }

  function down(e: PointerEvent) {
    if (!map) return;
    mapCanvas!.setPointerCapture(e.pointerId);
    painting = true;
    before = map.tiles;
    paintAt(e);
  }

  function up() {
    if (!painting || !map) return;
    painting = false;
    const next = encodeTiles(cells);
    if (next === before) return;
    undoStack.push(before);
    redoStack = [];
    map.tiles = next;
    cellsFor = next;
    onchange('assets');
  }

  function setTiles(tiles: string) {
    if (!map) return;
    map.tiles = tiles;
    onchange('assets');
  }

  function onKey(e: KeyboardEvent) {
    if (!map || (e.target as HTMLElement).closest('input, select, .pixel')) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (!mod || (k !== 'z' && k !== 'y')) return;
    e.preventDefault();
    e.stopPropagation();
    if (k === 'y' || e.shiftKey) {
      const n = redoStack.pop();
      if (n === undefined) return;
      undoStack.push(map.tiles);
      setTiles(n);
    } else {
      const p = undoStack.pop();
      if (p === undefined) return;
      redoStack.push(map.tiles);
      setTiles(p);
    }
  }

  /** A starter tileset: four tiles (brick, grass, stone, water) in the cart palette. */
  function starterTileset(ts: number): PixelAsset {
    const img = blankImage(ts * 4, ts);
    const px = img.layers[0]!.pixels;
    const w = ts * 4;
    for (let y = 0; y < ts; y++)
      for (let x = 0; x < w; x++) {
        const t = Math.floor(x / ts);
        const lx = x % ts;
        const mortar = y % (ts / 2) === 0 || (lx === ((Math.floor(y / (ts / 2)) % 2) * (ts / 2)) % ts);
        px[y * w + x] = t === 0 ? (mortar ? 6 : 5) : t === 1 ? (y < ts / 4 ? 12 : 4) : t === 2 ? ((lx + y) % 5 === 0 ? 6 : 7) : (y + lx / 2) % 6 < 1 ? 7 : 13;
      }
    return { kind: 'pixel', name: 'tiles', width: w, height: ts, center: [0, 0], layers: encodeLayers(img) };
  }

  function create() {
    const ts = newTileSize;
    const tileset = newTileset || session.addAsset(starterTileset(ts), 'tiles');
    session.map = blankMap(tileset, ts, Math.ceil(session.stage.width / ts), Math.ceil(session.stage.height / ts));
    tile = 1;
    undoStack = [];
    redoStack = [];
    onchange('assets');
  }

  function resize(width: number, height: number) {
    if (!map || width < 1 || height < 1 || width > 512 || height > 512) return;
    undoStack.push(map.tiles);
    session.map = resizeMap(map, width, height);
    onchange('assets');
  }

  /** Widens a pixel tileset by one blank tile at the end of its first row. */
  function addTile() {
    const a = tilesetAsset;
    if (!map || a?.kind !== 'pixel') return;
    const img = resizeImage(decodeLayers(a.width, a.height, a.layers), a.width + map.tileSize, a.height);
    session.assets[map.tileset] = { ...a, width: img.width, layers: encodeLayers(img) };
    onchange('assets');
  }

  /** The last tile can go when it's blank and the map doesn't use it. */
  const lastTileFree = $derived.by(() => {
    void version;
    const a = tilesetAsset;
    if (!map || a?.kind !== 'pixel' || a.height !== map.tileSize || a.width <= map.tileSize) return false;
    const last = a.width / map.tileSize;
    if (decodeTiles(map).includes(last)) return false;
    const img = decodeLayers(a.width, a.height, a.layers);
    return img.layers.every((l) => {
      for (let y = 0; y < a.height; y++)
        for (let x = a.width - map.tileSize; x < a.width; x++) if (l.pixels[y * a.width + x]) return false;
      return true;
    });
  });

  function removeTile() {
    const a = tilesetAsset;
    if (!map || a?.kind !== 'pixel' || !lastTileFree) return;
    const img = resizeImage(decodeLayers(a.width, a.height, a.layers), a.width - map.tileSize, a.height);
    session.assets[map.tileset] = { ...a, width: img.width, layers: encodeLayers(img) };
    onchange('assets');
  }

  async function clearTiles() {
    const m = map;
    if (!m || !(await ask('Clear every tile?', { ok: 'Clear', danger: true })) || map !== m) return;
    setTiles(encodeTiles(new Uint16Array(m.width * m.height)));
  }

  async function removeMap() {
    if (!map || !(await ask('Remove the tile map?', { message: 'Its tileset image stays in the cart.', ok: 'Remove', danger: true }))) return;
    session.map = undefined;
    onchange('assets');
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="mapper" role="application" aria-label="Map editor" tabindex="-1" onkeydown={onKey}>
  {#if !map}
    <div class="create">
      <h3>Tile map</h3>
      <p>A grid of tiles drawn behind every sprite. Scripts read and change it with <code>tile_at(x, y)</code> and <code>set_tile(x, y, n)</code>.</p>
      <label>Tile size
        <select bind:value={newTileSize}>
          {#each [8, 16, 32] as n (n)}<option value={n}>{n}px</option>{/each}
        </select>
      </label>
      <label>Tileset
        <select bind:value={newTileset}>
          <option value="">New starter tileset</option>
          {#each imageAssets as [id, a] (id)}<option value={id}>{a.name} ({a.kind})</option>{/each}
        </select>
      </label>
      <button class="primary" onclick={create}>Create map</button>
    </div>
  {:else}
    <div class="bar">
      <label>Width <input type="number" min="1" max="512" value={map.width} onchange={(e) => resize(+(e.target as HTMLInputElement).value, map.height)} /></label>
      <label>Height <input type="number" min="1" max="512" value={map.height} onchange={(e) => resize(map.width, +(e.target as HTMLInputElement).value)} /></label>
      <span class="muted">{map.tileSize}px tiles · tileset “{tilesetAsset?.name ?? 'missing'}”</span>
      <span class="gap"></span>
      {#if tilesetAsset?.kind === 'pixel'}
        {#if tilesetAsset.height === map.tileSize}
          <button onclick={addTile} title="Add a blank tile to the end of the tileset">＋ Tile</button>
          <button onclick={removeTile} disabled={!lastTileFree} title="Remove the last tile (only when it's blank and unused)">− Tile</button>
        {/if}
        <button onclick={() => (editingTiles = !editingTiles)}>{editingTiles ? 'Done editing tiles' : 'Edit tileset'}</button>
      {/if}
      <button onclick={clearTiles}>Clear</button>
      <button onclick={removeMap}>Remove map</button>
    </div>

    {#if editingTiles && tilesetAsset?.kind === 'pixel'}
      <div class="tile-editor">
        <PixelEditor asset={tilesetAsset} palette={session.palette} onchange={(w) => onchange(w === 'palette' ? 'palette' : 'assets')} />
      </div>
    {:else}
      <div class="work">
        <aside>
          <h4>Tiles</h4>
          <button class="eraser" class:on={tile === 0} onclick={() => (tile = 0)}>⌫ Eraser</button>
          <canvas bind:this={tilesCanvas} class="tiles" onclick={pickTile}></canvas>
          <p class="muted">Paint with the mouse. Right-click or ⌥-drag erases.</p>
        </aside>
        <div class="map-wrap">
          <canvas bind:this={mapCanvas} class="map" onpointerdown={down} onpointermove={(e) => painting && paintAt(e)} onpointerup={up} onpointercancel={up} oncontextmenu={(e) => e.preventDefault()}></canvas>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .mapper { display: flex; flex-direction: column; gap: 8px; height: 100%; padding: 8px; box-sizing: border-box; outline: none; min-height: 0; }
  .create { max-width: 420px; display: flex; flex-direction: column; gap: 10px; padding: 8px; }
  .create label { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); align-self: flex-start; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; }
  .bar input { width: 56px; }
  .gap { flex: 1; }
  .muted { color: var(--muted); font-size: 12px; }
  .work { flex: 1; display: flex; gap: 12px; min-height: 0; }
  aside { width: 220px; display: flex; flex-direction: column; gap: 6px; overflow: auto; }
  h4 { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .eraser.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .tiles { image-rendering: pixelated; cursor: pointer; align-self: flex-start; max-width: 100%; background: repeating-conic-gradient(var(--checker-b) 0 25%, var(--checker-a) 0 50%) 0 0 / 12px 12px; }
  .map-wrap { flex: 1; overflow: auto; background: var(--chrome); border-radius: var(--radius-l); padding: 12px; }
  .map { image-rendering: pixelated; cursor: crosshair; touch-action: none; box-shadow: 0 0 0 1px var(--line); }
  .tile-editor { flex: 1; min-height: 0; }
</style>
