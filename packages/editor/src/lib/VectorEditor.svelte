<script lang="ts">
  import { Circle, Crosshair, MousePointer2, PenTool, RectangleHorizontal, Redo2, Slash, Spline, Trash2, Undo2 } from '@lucide/svelte';
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

  type Tool = 'select' | 'reshape' | 'pen' | 'rect' | 'ellipse' | 'line' | 'center';
  const TOOLS: { id: Tool; label: string; key: string; icon: typeof PenTool }[] = [
    { id: 'select', label: 'Select', key: 'v', icon: MousePointer2 },
    { id: 'reshape', label: 'Reshape', key: 'a', icon: Spline },
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
  /** The shape whose points the Reshape tool shows, as in Scratch. */
  let target: paper.Path | paper.CompoundPath | null = null;
  /** How many of its points are selected; the Curved and Pointed buttons act on them. */
  let pointCount = $state(0);
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
    target = null;
    pointCount = 0;
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

  // ---- reshape: points and handles ----

  const segmentsOf = (item: paper.Item): paper.Segment[] =>
    item instanceof scope.CompoundPath ? item.children.flatMap((c) => (c as paper.Path).segments) : item instanceof scope.Path ? item.segments : [];
  const selectedPoints = () => (target ? segmentsOf(target).filter((s) => s.selected) : []);
  /** The path or compound path a hit belongs to (a compound path's points live in its children). */
  const shapeOf = (item: paper.Item): paper.Path | paper.CompoundPath | null => {
    const parent = item.parent;
    if (parent instanceof scope.CompoundPath) return parent;
    return item instanceof scope.Path || item instanceof scope.CompoundPath ? item : null;
  };

  /** Shows `shape`'s points (or hides the current one's), keeping no point selected. */
  function reshape(shape: paper.Path | paper.CompoundPath | null) {
    if (target && target !== shape) {
      for (const s of segmentsOf(target)) s.selected = false;
      target.selected = false;
    }
    target = shape;
    if (shape) {
      shape.selected = true;
      select(null);
      selected = shape; // so the style controls and Delete act on it
      noFill = !shape.fillColor;
      if (shape.fillColor) fill = shape.fillColor.toCSS(true);
      if (shape.strokeColor) stroke = shape.strokeColor.toCSS(true);
      strokeWidth = shape.strokeWidth;
    }
    pointCount = selectedPoints().length;
  }

  function choosePoint(seg: paper.Segment, add: boolean) {
    if (add) seg.selected = !seg.selected;
    else if (!seg.selected) {
      for (const s of selectedPoints()) s.selected = false;
      seg.selected = true;
    }
    pointCount = selectedPoints().length;
  }

  /** Curved: smooth handles through the point. Pointed: no handles, so the outline has a corner. */
  function setCurved(curved: boolean) {
    const pts = selectedPoints();
    if (!pts.length) return;
    const before = exportSvg();
    for (const s of pts) {
      if (curved) s.smooth({ type: 'catmull-rom' });
      else {
        s.handleIn = new scope.Point(0, 0);
        s.handleOut = new scope.Point(0, 0);
      }
    }
    commit(before);
  }

  /** Deletes the selected points; a shape left with too few points goes too. */
  function removePoints(): boolean {
    const pts = selectedPoints();
    if (!target || !pts.length) return false;
    const before = exportSvg();
    for (const s of pts) {
      const path = s.path;
      s.remove();
      if (path.segments.length < (path.closed ? 3 : 2)) path.remove();
    }
    if (!segmentsOf(target).length || !target.parent) {
      target.remove();
      target = null;
      selected = null;
    }
    pointCount = selectedPoints().length;
    commit(before);
    return true;
  }

  onMount(() => {
    scope = new paper.PaperScope();
    scope.setup(canvas);
    // Points and handles big enough to see and grab, as in Scratch's reshape tool.
    scope.settings.handleSize = 8;
    // Paper skips the point squares while this is unset; hollow ones are unselected points.
    (scope.settings as { segmentSize?: number }).segmentSize = 9;
    load(asset.svg);
    const t = new scope.Tool();
    let start: paper.Point | null = null;
    let shape: paper.Path | null = null;
    let before = '';
    let moved = false;
    /** What a Reshape drag moves: the selected points, one handle, or the whole shape. */
    let drag:
      | { kind: 'points' }
      | { kind: 'handle'; seg: paper.Segment; which: 'handleIn' | 'handleOut' }
      | { kind: 'shape' }
      | null = null;
    /** A point was added on mouse down, which is a change even without a drag. */
    let added = false;

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
      if (tool === 'reshape') {
        added = false;
        drag = null;
        const tolerance = 8 / scale;
        // Handles first, but only those showing: the handles of selected points.
        const handle = target
          ? scope.project.hitTest(e.point, { handles: true, tolerance, match: (h: paper.HitResult) => h.segment?.selected === true && shapeOf(h.item) === target })
          : null;
        if (handle) {
          drag = { kind: 'handle', seg: handle.segment, which: handle.type === 'handle-in' ? 'handleIn' : 'handleOut' };
          return;
        }
        // Points win over the outline they sit on, so grabbing a corner never adds a point.
        const hit =
          scope.project.hitTest(e.point, { segments: true, tolerance }) ??
          scope.project.hitTest(e.point, { stroke: true, fill: true, tolerance });
        const shape = hit ? shapeOf(hit.item) : null;
        if (!hit || !shape) {
          reshape(null);
          selected = null;
          return;
        }
        if (shape !== target) reshape(shape);
        if (hit.type === 'segment') {
          choosePoint(hit.segment, e.modifiers.shift);
          drag = { kind: 'points' };
        } else if (hit.type === 'stroke' && hit.location) {
          // Clicking the outline of the shape being reshaped adds a point there, as in Scratch.
          const seg = (hit.location.path as paper.Path).divideAt(hit.location);
          if (seg) {
            choosePoint(seg, false);
            added = true;
            drag = { kind: 'points' };
          }
        } else drag = { kind: 'shape' };
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
      if (tool === 'reshape') {
        if (!drag || !target) return;
        if (drag.kind === 'shape') target.position = target.position.add(e.delta);
        else if (drag.kind === 'points') for (const s of selectedPoints()) s.point = s.point.add(e.delta);
        else {
          const { seg, which } = drag;
          const other = which === 'handleIn' ? 'handleOut' : 'handleIn';
          // A smooth point keeps its handles in line, unless Alt breaks them apart.
          const smooth = !e.modifiers.alt && !seg[other].isZero() && seg[which].isCollinear(seg[other]);
          seg[which] = seg[which].add(e.delta);
          if (smooth) seg[other] = seg[which].normalize(-seg[other].length);
        }
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
      const changed = tool === 'reshape' ? (moved && drag !== null) || added : moved && (tool !== 'select' || selected);
      drag = null;
      if (shape && tool !== 'pen') select(shape);
      shape = null;
      start = null;
      if (changed) commit(before);
    };
    return () => scope.project.remove();
  });

  // Leaving Reshape hides the points.
  $effect(() => {
    if (tool !== 'reshape' && target) untrack(() => reshape(null));
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
    if (selected === target) {
      target = null;
      pointCount = 0;
    }
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
      if (!(tool === 'reshape' && removePoints())) remove();
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
    {#if tool === 'reshape'}
      <span class="gap"></span>
      <button onclick={() => setCurved(true)} disabled={!pointCount} title="Smooth the selected points">Curved</button>
      <button onclick={() => setCurved(false)} disabled={!pointCount} title="Make the selected points corners">Pointed</button>
      <span class="muted">{pointCount ? `${pointCount} point${pointCount > 1 ? 's' : ''}` : 'Click the outline to add a point'}</span>
      <span class="gap"></span>
    {/if}
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
