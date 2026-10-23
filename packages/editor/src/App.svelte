<script lang="ts">
  import type { FromStage } from '@stitch/runtime/protocol';
  import CodeEditor from './lib/CodeEditor.svelte';
  import Stage from './lib/Stage.svelte';
  import { build, loadSample, locateRuntimeError, payloadFor, STAGE_FILE, type Build, type Located } from './lib/project';

  const sample = loadSample();
  const shell = sample.shell;
  let files = $state(sample.files);
  let currentId = $state('player');
  let running = $state(false);
  let renderer = $state('…');
  let fps = $state(0);
  let threads = $state(0);
  let consoleLines = $state<{ kind: 'log' | 'error'; text: string; at?: { fileId: string; from: number; to: number } }[]>([]);

  let stage: Stage;
  let editor: CodeEditor;

  const current = $derived(files.find((f) => f.id === currentId)!);
  const result: Build = $derived(build(shell, files));
  const problems: Located[] = $derived(result.diagnostics);

  /** Globals declared in any file, so per-file lint doesn't flag them. */
  const globals = () => {
    const out = new Set<string>();
    for (const s of [result.project.stage, ...result.project.sprites.map((p) => p.module)])
      for (const it of s.items) if (it.kind === 'VarDecl' && it.scope === 'global') out.add(it.name);
    return out;
  };

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
    currentId = at.fileId;
    queueMicrotask(() => editor.reveal(at.from, at.to));
  }

  function lineCol(fileId: string, pos: number) {
    const text = files.find((f) => f.id === fileId)?.text ?? '';
    const before = text.slice(0, pos);
    return `${before.split('\n').length}:${pos - before.lastIndexOf('\n')}`;
  }
</script>

<div class="app">
  <header>
    <div class="brand">Stitch</div>
    <button class="run" onclick={run} title="Run (restart from the beginning)">▶ Run</button>
    <button class="stop" onclick={stop} disabled={!running} title="Stop all scripts">■ Stop</button>
    <div class="spacer"></div>
    <span class="meta">{shell.meta.title} · {renderer} · {fps} fps · {threads} thread{threads === 1 ? '' : 's'}</span>
  </header>

  <main>
    <section class="left">
      <nav class="tabs">
        {#each files as f (f.id)}
          <button class:active={f.id === currentId} onclick={() => (currentId = f.id)}>
            {f.name}
            {#if problems.some((p) => p.fileId === f.id)}<span class="dot" title="has problems"></span>{/if}
          </button>
        {/each}
      </nav>
      <div class="editor">
        <CodeEditor
          bind:this={editor}
          docKey={current.id}
          text={current.text}
          {globals}
          onchange={(t) => {
            const f = files.find((x) => x.id === currentId);
            if (f) f.text = t;
          }}
        />
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
                  {files.find((f) => f.id === p.fileId)?.name}:{lineCol(p.fileId, p.span.from)}
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
              {#if l.at}<button class="link" onclick={() => goTo(l.at!)}>{files.find((f) => f.id === l.at!.fileId)?.name}:{lineCol(l.at.fileId, l.at.from)}</button>{/if}
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
  .meta { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  button { font: inherit; border: 1px solid var(--line); background: var(--panel); color: var(--text); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: default; }
  .run { background: var(--go); border-color: var(--go); color: #fff; font-weight: 600; }
  main { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 46%); min-height: 0; }
  .left { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line); }
  .tabs { display: flex; gap: 2px; padding: 6px 8px 0; background: var(--chrome); }
  .tabs button { border-bottom: none; border-radius: 6px 6px 0 0; background: transparent; }
  .tabs button.active { background: var(--panel); }
  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--bad); margin-left: 4px; vertical-align: middle; }
  .editor { flex: 1; min-height: 0; }
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
