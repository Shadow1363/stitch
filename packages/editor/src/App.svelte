<script lang="ts">
  import type { BlockJson, Position } from '@stitch/blocks';
  import type { FromStage } from '@stitch/runtime/protocol';
  import type BlocksViewComponent from './lib/BlocksView.svelte';
  import CodeEditor from './lib/CodeEditor.svelte';
  import { History, type HistoryEntry } from './lib/doc';
  import { build, loadSample, locateRuntimeError, payloadFor, type Build, type Located } from './lib/project';
  import Stage from './lib/Stage.svelte';

  type Mode = 'blocks' | 'split' | 'text';

  const sample = loadSample();
  const shell = sample.shell;
  const docs = sample.docs;
  const docById = new Map(docs.map((d) => [d.id, d]));
  const history = new History();

  /** Docs are plain objects; bumping this re-derives everything that reads them. */
  let version = $state(0);
  let currentId = $state('player');
  let mode = $state<Mode>(loadMode());
  let running = $state(false);
  let renderer = $state('…');
  let fps = $state(0);
  let threads = $state(0);
  let consoleLines = $state<{ kind: 'log' | 'error'; text: string; at?: { fileId: string; from: number; to: number } }[]>([]);
  let BlocksView = $state<typeof BlocksViewComponent | undefined>();
  let blocksView = $state<BlocksViewComponent | undefined>();

  let stage: Stage;
  let editor: CodeEditor;

  const current = $derived.by(() => (void version, docById.get(currentId)!));
  const result: Build = $derived.by(() => (void version, build(shell, docs)));
  const problems: Located[] = $derived(result.diagnostics);
  const canUndo = $derived.by(() => (void version, history.canUndo));
  const canRedo = $derived.by(() => (void version, history.canRedo));

  function loadMode(): Mode {
    try {
      const m = localStorage.getItem('stitch.view');
      if (m === 'blocks' || m === 'split' || m === 'text') return m;
    } catch {
      // storage unavailable: use the default
    }
    return 'split';
  }

  function setMode(m: Mode) {
    mode = m;
    try {
      localStorage.setItem('stitch.view', m);
    } catch {
      // not persisted; fine
    }
  }

  // Blockly is large, so it loads only when a blocks view is first shown.
  $effect(() => {
    if (mode !== 'text' && !BlocksView)
      void import('./lib/BlocksView.svelte').then((m) => (BlocksView = m.default));
  });

  /** Globals declared in any file, so per-file lint doesn't flag them. */
  const globals = () => {
    const out = new Set<string>();
    for (const d of docs) for (const it of d.module.items) if (it.kind === 'VarDecl' && it.scope === 'global') out.add(it.name);
    return out;
  };

  const toolboxInfo = () => {
    const vars = new Set(globals());
    const functions: { name: string; params: string[] }[] = [];
    for (const it of current.module.items) {
      if (it.kind === 'VarDecl') vars.add(it.name);
      if (it.kind === 'FunctionDef') functions.push({ name: it.name, params: it.params });
    }
    return { vars: [...vars].sort(), functions };
  };

  // ---- syncing text <-> IR <-> blocks ----

  let redrawTimer: ReturnType<typeof setTimeout> | undefined;
  /** The blocks view shows an older program than the doc. */
  let blocksStale = true;

  function scheduleRedraw(delay: number) {
    blocksStale = true;
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(redraw, delay);
  }

  function redraw() {
    clearTimeout(redrawTimer);
    if (!blocksStale || !blocksView) return;
    blocksStale = false;
    blocksView.show(current.module, current.layout, current.loose);
  }

  function onTextChange(text: string) {
    const doc = current;
    history.record(doc.id, doc.snapshot(), 'text');
    const changed = doc.setText(text);
    version++;
    // While the text has syntax errors, wait longer so blocks don't churn through raw code.
    if (changed) scheduleRedraw(doc.syntax.length ? 1500 : 300);
  }

  function onBlocksChange(blocks: BlockJson[]) {
    const doc = current;
    if (blocksStale) {
      // The blocks were behind the text; never let an old view overwrite newer text.
      redraw();
      return;
    }
    const before = doc.snapshot();
    const reload = doc.setBlocks(blocks);
    if (JSON.stringify(before) === JSON.stringify(doc.snapshot())) return;
    history.record(doc.id, before, 'blocks');
    editor.setText(doc.text);
    version++;
    if (reload) {
      blocksStale = true;
      redraw();
    }
  }

  function onLayout(placed: Record<string, Position>) {
    Object.assign(current.layout, placed);
  }

  function apply(e: HistoryEntry | undefined) {
    if (!e) return;
    const doc = docById.get(e.docId)!;
    doc.restore(e.snapshot);
    version++;
    if (currentId !== e.docId) currentId = e.docId;
    else editor.setText(doc.text);
    blocksStale = true;
    redraw();
  }

  const undo = () => apply(history.undo((id) => docById.get(id)!.snapshot()));
  const redo = () => apply(history.redo((id) => docById.get(id)!.snapshot()));

  function switchTo(id: string) {
    if (id === currentId) return;
    redraw();
    currentId = id;
    blocksStale = true;
    queueMicrotask(redraw);
  }

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || !(e.metaKey || e.ctrlKey)) return;
    const t = e.target as HTMLElement | null;
    // CodeMirror routes these itself; text fields being edited keep their own undo.
    if (t?.closest('.cm-editor, input, textarea, [contenteditable="true"]')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) undo();
    else if ((k === 'z' && e.shiftKey) || k === 'y') redo();
    else return;
    e.preventDefault();
  }

  // ---- running ----

  function print(kind: 'log' | 'error', text: string, at?: { fileId: string; from: number; to: number }) {
    consoleLines = [...consoleLines.slice(-199), at ? { kind, text, at } : { kind, text }];
  }

  async function load() {
    if (!result.compiled.ok) return false;
    stage.load(await payloadFor(shell, result));
    return true;
  }

  async function run() {
    if (!result.compiled.ok) {
      print('error', `Can't run: ${problems.length} problem${problems.length === 1 ? '' : 's'} to fix first.`);
      return;
    }
    consoleLines = [];
    await load();
    stage.run();
    running = true;
  }

  function stop() {
    stage.stop();
    running = false;
  }

  function onStage(m: FromStage) {
    switch (m.t) {
      case 'ready':
        renderer = m.renderer;
        void load();
        break;
      case 'log':
        print('log', `${m.sprite}: ${m.text}`);
        break;
      case 'error': {
        const at = locateRuntimeError(result, m.line);
        print('error', `${m.sprite} (on ${m.event}): ${m.message}`, at ? { fileId: at.fileId, ...at.span } : undefined);
        break;
      }
      case 'stats':
        fps = Math.round(m.fps);
        threads = m.threads;
        if (running && m.threads === 0) running = false;
        break;
    }
  }

  function goTo(at: { fileId: string; from: number; to: number }) {
    if (mode === 'blocks') setMode('split');
    switchTo(at.fileId);
    queueMicrotask(() => editor.reveal(at.from, at.to));
  }

  function lineCol(fileId: string, pos: number) {
    const text = docById.get(fileId)?.text ?? '';
    const before = text.slice(0, pos);
    return `${before.split('\n').length}:${pos - before.lastIndexOf('\n')}`;
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="app">
  <header>
    <div class="brand">Stitch</div>
    <button class="run" onclick={run} title="Run (restart from the beginning)">▶ Run</button>
    <button class="stop" onclick={stop} disabled={!running} title="Stop all scripts">■ Stop</button>
    <span class="sep"></span>
    <button onclick={undo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
    <button onclick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">↷</button>
    <span class="sep"></span>
    <div class="seg" role="group" aria-label="View">
      <button class:on={mode === 'blocks'} onclick={() => setMode('blocks')}>Blocks</button>
      <button class:on={mode === 'split'} onclick={() => setMode('split')}>Split</button>
      <button class:on={mode === 'text'} onclick={() => setMode('text')}>Text</button>
    </div>
    <div class="spacer"></div>
    <span class="meta">{shell.meta.title} · {renderer} · {fps} fps · {threads} thread{threads === 1 ? '' : 's'}</span>
  </header>

  <main>
    <section class="left">
      <nav class="tabs">
        {#each docs as d (d.id)}
          <button class:active={d.id === currentId} onclick={() => switchTo(d.id)}>
            {d.name}
            {#if problems.some((p) => p.fileId === d.id)}<span class="dot" title="has problems"></span>{/if}
          </button>
        {/each}
      </nav>
      <div class="views {mode}">
        {#if mode !== 'text'}
          <div class="pane blocks-pane">
            {#if BlocksView}
              <BlocksView
                bind:this={blocksView}
                onchange={onBlocksChange}
                onlayout={onLayout}
                onundo={undo}
                onredo={redo}
                info={toolboxInfo}
                onready={() => {
                  blocksStale = true;
                  queueMicrotask(redraw);
                }}
                onenter={redraw}
              />
            {:else}
              <div class="loading">Loading blocks…</div>
            {/if}
          </div>
        {/if}
        <div class="pane text-pane" hidden={mode === 'blocks'}>
          <CodeEditor bind:this={editor} docKey={current.id} text={current.text} {globals} onchange={onTextChange} onundo={undo} onredo={redo} />
        </div>
      </div>
    </section>

    <section class="right">
      <Stage bind:this={stage} onmessage={onStage} />
      <div class="panel">
        <h3>Problems <span class="count">{problems.length}</span></h3>
        <ul>
          {#each problems as p, i (i)}
            <li class="problem">
              {#if p.fileId && p.span}
                <button class="link" onclick={() => goTo({ fileId: p.fileId!, from: p.span!.from, to: p.span!.to })}>
                  {docById.get(p.fileId)?.name}:{lineCol(p.fileId, p.span.from)}
                </button>
              {:else}<span>{p.file ?? ''}</span>{/if}
              {p.message}
            </li>
          {:else}
            <li class="ok">No problems.</li>
          {/each}
        </ul>
        <h3>Console</h3>
        <ul class="console">
          {#each consoleLines as l, i (i)}
            <li class={l.kind}>
              {#if l.at}<button class="link" onclick={() => goTo(l.at!)}>{docById.get(l.at.fileId)?.name}:{lineCol(l.at.fileId, l.at.from)}</button>{/if}
              {l.text}
            </li>
          {/each}
        </ul>
      </div>
    </section>
  </main>
</div>

<style>
  .app { display: flex; flex-direction: column; height: 100vh; }
  header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--chrome); border-bottom: 1px solid var(--line); }
  .brand { font-weight: 700; letter-spacing: 0.02em; margin-right: 12px; }
  .spacer { flex: 1; }
  .sep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
  .meta { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  button { font: inherit; border: 1px solid var(--line); background: var(--panel); color: var(--text); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: default; }
  .run { background: var(--go); border-color: var(--go); color: #fff; font-weight: 600; }
  .seg { display: inline-flex; }
  .seg button { border-radius: 0; margin-left: -1px; }
  .seg button:first-child { border-radius: 6px 0 0 6px; }
  .seg button:last-child { border-radius: 0 6px 6px 0; }
  .seg button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
  main { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 38%); min-height: 0; }
  .left { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line); }
  .tabs { display: flex; gap: 2px; padding: 6px 8px 0; background: var(--chrome); }
  .tabs button { border-bottom: none; border-radius: 6px 6px 0 0; background: transparent; }
  .tabs button.active { background: var(--panel); }
  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--bad); margin-left: 4px; vertical-align: middle; }
  .views { flex: 1; min-height: 0; display: grid; }
  .views.split { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
  .pane { min-width: 0; min-height: 0; position: relative; }
  .pane[hidden] { display: none; }
  .split .text-pane { border-left: 1px solid var(--line); }
  .loading { padding: 16px; color: var(--muted); }
  .right { display: flex; flex-direction: column; gap: 10px; padding: 12px; min-height: 0; overflow: auto; }
  .panel h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 10px 0 4px; }
  .count { background: var(--line); border-radius: 8px; padding: 0 6px; }
  ul { list-style: none; margin: 0; padding: 0; font-size: 13px; }
  li { padding: 3px 0; border-bottom: 1px solid var(--line); }
  .ok { color: var(--muted); }
  .console { font-family: ui-monospace, monospace; font-size: 12px; max-height: 220px; overflow: auto; }
  .console .error, .problem { color: var(--bad); }
  .link { border: none; background: none; padding: 0 6px 0 0; color: var(--accent); text-decoration: underline; }
</style>
