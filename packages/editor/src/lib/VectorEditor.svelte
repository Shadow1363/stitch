<script lang="ts">
  import { Circle, Crosshair, MousePointer2, PenTool, RectangleHorizontal, Redo2, Slash, Trash2, Undo2 } from '@lucide/svelte';
  import type { SvgAsset } from '@stitch/cart';
  import { svgSize } from '@stitch/cart/render';
  import paper from 'paper/dist/paper-core';
  import { onMount, untrack } from 'svelte';
  import { download } from './files';

  interface Props {
    asset: SvgAsset;
    onchange: () => void;
  }
  let { asset, onchange }: Props = $props();

  type Tool = 'select' | 'pen' | 'rect' | 'ellipse' | 'line' | 'center';
  const TOOLS: { id: Tool; label: string; key: string; icon: typeof PenTool }[] = [
    { id: 'select', label: 'Select', key: 'v', icon: MousePointer2 },
    { id: 'pen', label: 'Pen', key: 'p', icon: PenTool },
    { id: 'rect', label: 'Rect', key: 'r', icon: RectangleHorizontal },
    { id: 'ellipse', label: 'Ellipse', key: 'o', icon: Circle },
    { id: 'line', label: 'Line', key: 'l', icon: Slash },
    { id: 'center', label: 'Center', key: 'c', icon: Crosshair },
  ];

  let tool = $state<Tool>('rect');
  let fill = $state('#4c97ff');
  let noFill = $state(false);
  let stroke = $state('#1d2b53');
  let strokeWidth = $state(2);
  // Initial values only; the effect below reloads when `asset` changes.
  const first = untrack(() => asset);
  let size = $state(svgSize(first.svg));
  let scale = $state(1);
  let center = $state<[number, number]>([...first.center]);

  let canvas: HTMLCanvasElement;
  let scope: paper.PaperScope;
  let shown: SvgAsset = first;
  let selected: paper.Item | null = null;
  let undoStack: string[] = [];
  let redoStack: string[] = [];

  const exportSvg = () => scope.project.exportSVG({ asString: true, bounds: new scope.Rectangle(0, 0, size.width, size.height) }) as string;

  function load(svg: string) {
    size = svgSize(svg);
    scale = Math.max(0.25, Math.min(3, 420 / Math.max(size.width, size.height)));
    canvas.width = Math.round(size.width * scale);
    canvas.height = Math.round(size.height * scale);
    scope.view.viewSize = new scope.Size(canvas.width, canvas.height);
    scope.view.zoom = scale;
    scope.view.center = new scope.Point(size.width / 2, size.height / 2);
    scope.project.clear();
    selected = null;
    scope.project.importSVG(svg, { insert: true, expandShapes: true });
  }

  function commit(before: string) {
    undoStack.push(before);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    asset.svg = exportSvg();
    onchange();
  }

  function select(item: paper.Item | null) {
    if (selected) selected.selected = false;
    selected = item;
    if (item) {
      item.selected = true;
      if (item instanceof scope.Path || item instanceof scope.CompoundPath) {
        noFill = !item.fillColor;
        if (item.fillColor) fill = item.fillColor.toCSS(true);
        if (item.strokeColor) stroke = item.strokeColor.toCSS(true);
        strokeWidth = item.strokeWidth;
      }
    }
  }

  function styleOf(): Partial<paper.Style> {
    return { fillColor: noFill ? null : new scope.Color(fill), strokeColor: new scope.Color(stroke), strokeWidth } as Partial<paper.Style>;
  }

  /** Applies the style controls to the selected shape. */
  function restyle() {
    if (!selected) return;
    const before = exportSvg();
    Object.assign(selected, styleOf());
    commit(before);
  }

  onMount(() => {
    scope = new paper.PaperScope();
    scope.setup(canvas);
    load(asset.svg);
    const t = new scope.Tool();
    let start: paper.Point | null = null;
    let shape: paper.Path | null = null;
    let before = '';
    let moved = false;

    t.onMouseDown = (e: paper.ToolEvent) => {
      before = exportSvg();
      moved = false;
      start = e.point;
      if (tool === 'center') {
        center = [Math.round(e.point.x), Math.round(e.point.y)];
        asset.center = [...center];
        onchange();
        return;
      }
      if (tool === 'select') {
        const hit = scope.project.hitTest(e.point, { fill: true, stroke: true, tolerance: 4 / scale });
        select(hit?.item ?? null);
        return;
      }
      select(null);
      if (tool === 'pen') {
        shape = new scope.Path({ ...styleOf(), fillColor: null, strokeCap: 'round', strokeJoin: 'round' });
        shape.add(e.point);
      }
    };

    t.onMouseDrag = (e: paper.ToolEvent) => {
      if (!start) return;
      moved = true;
      if (tool === 'select') {
        if (selected) selected.position = selected.position.add(e.delta);
        return;
      }
      if (tool === 'pen') {
        shape?.add(e.point);
        return;
      }
      shape?.remove();
      const style = styleOf();
      if (tool === 'rect') shape = new scope.Path.Rectangle({ from: start, to: e.point, ...style });
      else if (tool === 'ellipse') shape = new scope.Path.Ellipse({ rectangle: new scope.Rectangle(start, e.point), ...style });
      else if (tool === 'line') shape = new scope.Path.Line({ from: start, to: e.point, ...style, fillColor: null, strokeCap: 'round' });
    };

    t.onMouseUp = () => {
      if (tool === 'pen' && shape) {
        if (shape.segments.length > 2) shape.simplify(2.5);
        else if (!moved) shape.remove();
      }
      const changed = moved && (tool !== 'select' || selected);
      if (shape && tool !== 'pen') select(shape);
      shape = null;
      start = null;
      if (changed) commit(before);
    };
    return () => scope.project.remove();
  });

  // Switching costumes loads the other drawing with its own history.
  $effect(() => {
    if (asset !== shown && scope) {
      shown = asset;
      center = [...asset.center];
      undoStack = [];
      redoStack = [];
      load(asset.svg);
    }
  });

  function undo() {
    const prev = undoStack.pop();
    if (prev === undefined) return;
    redoStack.push(exportSvg());
    load(prev);
    asset.svg = prev;
    onchange();
  }

  function redo() {
    const next = redoStack.pop();
    if (next === undefined) return;
    undoStack.push(exportSvg());
    load(next);
    asset.svg = next;
    onchange();
  }

  function remove() {
    if (!selected) return;
    const before = exportSvg();
    selected.remove();
    selected = null;
    commit(before);
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input')) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && (k === 'z' || k === 'y')) {
      e.preventDefault();
      e.stopPropagation();
      if (k === 'y' || e.shiftKey) redo();
      else undo();
      return;
    }
    if (k === 'delete' || k === 'backspace') {
      e.preventDefault();
      remove();
      return;
    }
    if (mod) return;
    const found = TOOLS.find((x) => x.key === k);
    if (found) tool = found.id;
  }

  async function importFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const before = exportSvg();
    load(await file.text());
    commit(before);
    (e.target as HTMLInputElement).value = '';
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="art-editor vector" tabindex="-1" onkeydown={onKey} role="application" aria-label="Vector editor">
  <div class="tools" role="toolbar">
    {#each TOOLS as t (t.id)}
      <button class:on={tool === t.id} title="{t.label} ({t.key.toUpperCase()})" onclick={() => (tool = t.id)}><t.icon />{t.label}</button>
    {/each}
    <span class="gap"></span>
    <button onclick={undo} title="Undo (⌘Z)" aria-label="Undo"><Undo2 /></button>
    <button onclick={redo} title="Redo (⇧⌘Z)" aria-label="Redo"><Redo2 /></button>
    <button onclick={remove} title="Delete selected (⌫)" aria-label="Delete selected"><Trash2 /></button>
    <span class="gap"></span>
    <label class="file">Import SVG<input type="file" accept=".svg,image/svg+xml" onchange={importFile} /></label>
    <button onclick={() => download(new Blob([asset.svg], { type: 'image/svg+xml' }), `${asset.name}.svg`)}>Export SVG</button>
  </div>
  <div class="styles">
    <label>Fill <input type="color" bind:value={fill} onchange={restyle} disabled={noFill} /></label>
    <label><input type="checkbox" bind:checked={noFill} onchange={restyle} /> none</label>
    <label>Stroke <input type="color" bind:value={stroke} onchange={restyle} /></label>
    <label>Width <input type="number" min="0" max="40" bind:value={strokeWidth} onchange={restyle} /></label>
    <span class="muted">{size.width}×{size.height} · center {center[0]}, {center[1]}</span>
  </div>
  <div class="canvas-wrap">
    <div class="board">
      <canvas bind:this={canvas}></canvas>
      <div class="center" style="left:{center[0] * scale}px;top:{center[1] * scale}px"></div>
    </div>
  </div>
</div>

<style>
  .art-editor { display: flex; flex-direction: column; gap: 8px; height: 100%; outline: none; min-height: 0; }
  .tools, .styles { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
  .tools button { padding: 3px 7px; }
  .tools button.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .gap { width: 8px; }
  .file { border: 1px solid var(--line); border-radius: var(--radius); padding: 3px 7px; cursor: pointer; background: var(--panel); }
  .file input { display: none; }
  .styles input[type='number'] { width: 48px; }
  .muted { color: var(--muted); font-variant-numeric: tabular-nums; }
  .canvas-wrap { flex: 1; overflow: auto; display: flex; align-items: center; justify-content: center; background: var(--chrome); border-radius: var(--radius-l); padding: 12px; min-height: 0; }
  .board { position: relative; box-shadow: 0 0 0 1px var(--line); background: repeating-conic-gradient(var(--checker-b) 0 25%, var(--checker-a) 0 50%) 0 0 / 16px 16px; }
  canvas { display: block; cursor: crosshair; touch-action: none; }
  .center { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; pointer-events: none; background: linear-gradient(var(--guide), var(--guide)) center / 1.5px 100% no-repeat, linear-gradient(var(--guide), var(--guide)) center / 100% 1.5px no-repeat; }
</style>
