<script lang="ts">
  import type { BlockJson, Position } from '@stitch/blocks';
  import { normalizeCart, type Cart } from '@stitch/cart';
  import { format } from '@stitch/lang';
  import { BookOpen, Columns2, Moon, Pause, Play, Plus, Redo2, Rows2, Square, Sun, SunMoon, Undo2, X } from '@lucide/svelte';
  import { declarations, messageNames } from '@stitch/lang/assist';
  import type { FileContext } from '@stitch/ir';
  import type { AssistData } from './lib/assist';
  import type { FromStage } from '@stitch/runtime/protocol';
  import { Microphone, streamLevel, usesLoudness } from '@stitch/runtime/mic';
  import { onMount } from 'svelte';
  import type BlocksViewComponent from './lib/BlocksView.svelte';
  import type SoundsPanelComponent from './lib/SoundsPanel.svelte';
  import CartPanel from './lib/CartPanel.svelte';
  import CodeEditor from './lib/CodeEditor.svelte';
  import CostumesPanel from './lib/CostumesPanel.svelte';
  import { History, type HistoryEntry } from './lib/doc';
  import { cartFilename, cartFromFile, cartFromUrl, cartToPng, download, type Opened } from './lib/files';
  import { describeImport } from './lib/scratch';
  import MapEditor from './lib/MapEditor.svelte';
  import { build, loadSample, locateRuntimeError, payloadFor, type Build, type Located } from './lib/project';
  import { openSample, SAMPLES } from './lib/samples';
  import { Session, STAGE_FILE } from './lib/session';
  import Stage from './lib/Stage.svelte';
  import { kvGet, kvSet } from './lib/storage';
  import ExportPanel from './lib/ExportPanel.svelte';
  import ExtensionsPanel from './lib/ExtensionsPanel.svelte';
  import { nativeFetch, NetProxy } from './lib/net';
  import NetworkPanel from './lib/NetworkPanel.svelte';
  import { loadSecrets, saveSecrets, type Secret } from './lib/secrets';
  import { ask, askText, tell } from './lib/dialog.svelte';
  import Dialogs from './lib/Dialogs.svelte';
  import Logo from './lib/Logo.svelte';
  import { setThemePref, themePref, type ThemePref } from './lib/theme';
  import { loadSettings, saveSettings, type EditorSettings } from './lib/settings';
  import SettingsMenu from './lib/SettingsMenu.svelte';
  import SplitPane from './lib/SplitPane.svelte';
  import { LayoutStore, setLayoutContext } from './lib/layout.svelte';
  import type { SplitState } from './lib/split';
  import { itemAt, nodesAt } from './lib/linking';

  type Mode = 'blocks' | 'split' | 'text';
  type Section = 'code' | 'costumes' | 'sounds' | 'map' | 'cart';
  const AUTOSAVE_KEY = 'autosave';
  /** Hosts the autosaved cart may reach. Kept beside the cart, never in it, so a cart can't grant itself access. */
  const HOSTS_KEY = 'autosave-hosts';

  let session = $state.raw<Session>(loadSample());
  /** Bumped when a different cart is opened, so editors reset instead of merging. */
  let sessionNo = $state(0);
  let history = new History();

  /** Session data is plain objects; bumping this re-derives everything that reads it. */
  let version = $state(0);
  let currentId = $state('player');
  let section = $state<Section>('code');
  let running = $state(false);
  /** The running program is frozen (Pause); Run and Stop end the pause. */
  let paused = $state(false);
  let renderer = $state('…');
  let fps = $state(0);
  let threads = $state(0);
  /** The stage's AudioContext state; browsers keep it suspended until a gesture. */
  let audioState = $state('');
  let status = $state('');
  let notice = $state<{ kind: 'info' | 'error'; text: string } | undefined>();
  let consoleLines = $state<{ kind: 'log' | 'error'; text: string; at?: { fileId: string; from: number; to: number } }[]>([]);
  let BlocksView = $state<typeof BlocksViewComponent | undefined>();
  let blocksView = $state<BlocksViewComponent | undefined>();
  let SoundsPanel = $state<typeof SoundsPanelComponent | undefined>();

  let stage: Stage;
  let editor = $state<CodeEditor>();

  let secrets = $state.raw<Secret[]>([]);
  let allowedHosts = $state.raw<string[]>([]);
  const nativeFetchFn = nativeFetch();
  const net = new NetProxy({
    secrets: () => secrets,
    allowHost: async (host) => {
      // The prompt names the host only: secrets are added later, and only for their own hosts.
      const ok = await ask('Allow this connection?', {
        message: 'This cart wants to connect to',
        code: host,
        note: 'Requests come from this editor, with any secrets you set for this host.',
        ok: 'Allow',
        cancel: 'Block',
      });
      if (ok) {
        allowedHosts = [...allowedHosts, host];
        void kvSet(HOSTS_KEY, allowedHosts);
      }
      return ok;
    },
    log: (text) => print('error', text),
    // The desktop app fetches natively (no CORS); the browser uses its own fetch.
    ...(nativeFetchFn ? { fetch: nativeFetchFn } : {}),
  });

  function setSecrets(list: Secret[]) {
    secrets = list;
    saveSecrets(list).catch((e: unknown) => fail('Couldn’t save secrets', e));
  }

  function setHosts(list: string[]) {
    allowedHosts = list;
    net.reset(list);
    void kvSet(HOSTS_KEY, list).catch(() => {});
  }

  // Fresh view objects, so tabs see sprites added, removed or renamed in place.
  const docs = $derived.by(() => (void version, session.docs.map((d) => ({ id: d.id, name: d.name }))));
  const current = $derived.by(() => (void version, session.doc(currentId) ?? session.docs[0]!));
  const result: Build = $derived.by(() => (void version, build(session)));
  const problems: Located[] = $derived(result.diagnostics);
  const canUndo = $derived.by(() => (void version, history.canUndo));
  const canRedo = $derived.by(() => (void version, history.canRedo));

  let settings = $state.raw<EditorSettings>(loadSettings());
  function setSettings(s: EditorSettings) {
    settings = s;
    saveSettings(s);
  }

  let theme = $state<ThemePref>(themePref());
  const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
  const THEME_LABEL: Record<ThemePref, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };
  const THEME_ICON = { system: SunMoon, light: Sun, dark: Moon };
  const ThemeIcon = $derived(THEME_ICON[theme]);
  function cycleTheme() {
    theme = THEME_NEXT[theme];
    setThemePref(theme);
  }

  // ---- layout: sashes, view mode and orientation, per cart (lib/layout.ts) ----

  const layout = new LayoutStore();
  setLayoutContext(layout);
  /** Blocks and code share the code split; a view mode is that split with a pane closed. */
  const CODE_SPLIT: SplitState = { ratio: 0.6, collapsed: null };
  const mode: Mode = $derived.by(() => {
    const c = layout.get('code', CODE_SPLIT).collapsed;
    return c === 'a' ? 'text' : c === 'b' ? 'blocks' : 'split';
  });

  function setMode(m: Mode) {
    const s = layout.get('code', CODE_SPLIT);
    layout.set('code', { ...s, collapsed: m === 'blocks' ? 'b' : m === 'text' ? 'a' : null });
  }

  const toggleOrientation = () => layout.setOrientation(layout.orientation === 'horizontal' ? 'vertical' : 'horizontal');

  // Blockly is large, so it loads only when a blocks view is first shown.
  $effect(() => {
    if (section === 'code' && mode !== 'text' && !BlocksView) void import('./lib/BlocksView.svelte').then((m) => (BlocksView = m.default));
  });

  $effect(() => {
    if (section === 'sounds' && !SoundsPanel) void import('./lib/SoundsPanel.svelte').then((m) => (SoundsPanel = m.default));
  });

  /** Globals declared in any file, so per-file lint doesn't flag them. */
  const globals = () => {
    const out = new Set<string>();
    for (const d of session.docs) for (const it of d.module.items) if (it.kind === 'VarDecl' && it.scope === 'global') out.add(it.name);
    return out;
  };

  /** The cart around the current file, for completion and hover (lib/assist.ts). */
  const assistData = (): AssistData => {
    const others = session.docs.filter((d) => d.id !== currentId);
    return {
      catalog: session.catalog,
      names: session.names(),
      messages: [...new Set(session.docs.flatMap((d) => messageNames(d.text)))],
      globals: others.flatMap((d) => declarations(d.text).filter((x) => x.kind === 'global').map((x) => ({ name: x.name, file: d.name }))),
      ...(currentId !== STAGE_FILE ? { sprite: current.name } : {}),
    };
  };

  /** What the current file's string arguments may name, for the cart-name lint. */
  const lintContext = (): FileContext => ({
    names: session.names(),
    received: new Set(session.docs.flatMap((d) => d.module.items.flatMap((it) => (it.kind === 'EventScript' && it.event.type === 'message' ? [it.event.name] : [])))),
    ...(currentId !== STAGE_FILE ? { sprite: current.name } : {}),
  });

  /** Go to definition across files: a global or function another file declares. */
  function goToName(name: string): boolean {
    for (const d of session.docs) {
      if (d.id === currentId) continue;
      // Only globals reach across files; functions and sprite variables belong to their sprite.
      const decl = declarations(d.text).find((x) => x.name === name && x.kind === 'global');
      if (decl) {
        goTo({ fileId: d.id, from: decl.from, to: decl.to });
        return true;
      }
    }
    return false;
  }

  const toolboxInfo = () => {
    const vars = new Set(globals());
    const functions: { name: string; params: string[] }[] = [];
    for (const it of current.module.items) {
      if (it.kind === 'VarDecl') vars.add(it.name);
      if (it.kind === 'FunctionDef') functions.push({ name: it.name, params: it.params });
    }
    return { vars: [...vars].sort(), functions };
  };

  // ---- change tracking: autosave and stage refresh ----

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let stageTimer: ReturnType<typeof setTimeout> | undefined;

  /** Something in the session changed. `stageToo`: what the stage shows changed (assets, settings). */
  function touch(stageToo = false) {
    version++;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(autosave, 800);
    if (stageToo && !running) {
      clearTimeout(stageTimer);
      stageTimer = setTimeout(() => void load(), 400);
    }
  }

  async function autosave() {
    try {
      await kvSet(AUTOSAVE_KEY, session.toCart());
      status = `Saved in this browser at ${new Date().toLocaleTimeString()}.`;
    } catch (err) {
      status = `Couldn't save in this browser: ${String(err)}`;
    }
  }

  /** `hosts`: network permissions to keep (only when restoring the autosave). */
  function openSession(s: Session, message?: string, hosts: string[] = []) {
    if (running) stop();
    closeMic();
    micAllowed = undefined;
    setHosts(hosts);
    session = s;
    sessionNo++;
    void layout.load(s.meta.title);
    history = new History();
    currentId = s.sprites[0]?.id ?? STAGE_FILE;
    blocksStale = true;
    touch(true);
    queueMicrotask(redraw);
    if (message) notice = { kind: 'info', text: message };
  }

  function openCart(cart: Cart, message: string, hosts: string[] = []) {
    openSession(Session.fromCart(cart), message, hosts);
  }

  /** Opens a loaded file; a Scratch import also says what came across and what didn't. */
  function openLoaded(o: Opened, from: string) {
    openCart(o.cart, o.report ? `Imported ${from} from Scratch.` : `Opened ${from}`);
    const summary = o.report && describeImport(o.report);
    if (summary) void tell('Imported from Scratch', summary);
  }

  function fail(what: string, err: unknown) {
    notice = { kind: 'error', text: `${what}: ${err instanceof Error ? err.message : String(err)}` };
  }

  onMount(() => {
    // The starting cart's layout; opening another cart loads that one's (openSession).
    void layout.load(session.meta.title);
    // Dev builds expose the session for scripted UI tests (like __stitchBlocks).
    if (import.meta.env.DEV) (globalThis as { __stitchSession?: () => Session }).__stitchSession = () => session;
    const sample = new URLSearchParams(location.search).get('sample');
    if (sample) {
      void openSampleCart(sample);
      return;
    }
    const url = new URLSearchParams(location.search).get('cart');
    if (url) {
      cartFromUrl(url).then((o) => openLoaded(o, url), (e: unknown) => fail('Couldn’t open the cart', e));
      return;
    }
    loadSecrets().then(
      (list) => (secrets = list),
      (e: unknown) => fail('Couldn’t load secrets', e),
    );
    Promise.all([kvGet<unknown>(AUTOSAVE_KEY), kvGet<string[]>(HOSTS_KEY)])
      .then(([saved, hosts]) => {
        if (saved) openCart(normalizeCart(saved), 'Restored your last session from this browser.', hosts ?? []);
      })
      .catch((e: unknown) => fail('Couldn’t restore the autosave', e));
  });

  // ---- file actions ----

  async function saveFile() {
    if (settings.formatOnSave) formatAll();
    try {
      const cart = session.toCart();
      download(await cartToPng(cart), cartFilename(cart));
    } catch (e) {
      fail('Couldn’t save', e);
    }
  }

  async function openFile(f: File) {
    try {
      openLoaded(await cartFromFile(f), f.name);
    } catch (e) {
      fail(`Couldn’t open ${f.name}`, e);
    }
  }

  async function openSampleCart(id: string) {
    try {
      const s = await openSample(id);
      openSession(s, `Opened the ${SAMPLES.find((x) => x.id === id)?.title ?? id} sample.`);
    } catch (e) {
      fail('Couldn’t open the sample', e);
    }
  }

  async function openUrl(url: string) {
    try {
      openLoaded(await cartFromUrl(url), url);
    } catch (e) {
      fail('Couldn’t open the cart', e);
    }
  }

  function onDrop(e: DragEvent) {
    const f = e.dataTransfer?.files[0];
    if (!f) return;
    e.preventDefault();
    void openFile(f);
  }

  /** Extensions change the catalog: blocks, toolbox and lint all re-derive from it. */
  function onExtensionsChange() {
    blocksStale = true;
    touch(true);
    queueMicrotask(redraw);
    editor?.relint();
  }

  // ---- sprites ----

  function addSprite() {
    const s = session.addSprite();
    currentId = s.id;
    blocksStale = true;
    touch(true);
    queueMicrotask(redraw);
  }

  async function renameSprite(id: string) {
    const s = session.sprite(id);
    if (!s) return;
    const name = (await askText('Rename sprite', { value: s.name, label: 'Sprite name', ok: 'Rename' }))?.trim();
    if (session.sprite(id) !== s) return;
    if (!name || name === s.name) return;
    if (session.sprites.some((x) => x.name === name)) {
      notice = { kind: 'error', text: `There is already a sprite called ${name}.` };
      return;
    }
    session.renameSprite(id, name);
    touch(true);
  }

  async function deleteSprite(id: string) {
    const s = session.sprite(id);
    if (!s || !(await ask(`Delete ${s.name}?`, { message: 'Its scripts and costumes go too. This can’t be undone.', ok: 'Delete', danger: true }))) return;
    if (session.sprite(id) !== s) return;
    session.removeSprite(id);
    switchTo(session.sprites[0]?.id ?? STAGE_FILE);
    touch(true);
  }

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
    blocksView.show(current.module, current.layout, current.loose, session.catalog);
  }

  function onTextChange(text: string) {
    const doc = current;
    history.record(doc.id, doc.snapshot(), 'text');
    const changed = doc.setText(text);
    touch();
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
    const reload = doc.setBlocks(blocks, session.catalog);
    if (JSON.stringify(before) === JSON.stringify(doc.snapshot())) return;
    history.record(doc.id, before, 'blocks');
    editor?.setText(doc.text);
    touch();
    if (reload) {
      blocksStale = true;
      redraw();
    }
  }

  // ---- linked selection and scrolling between blocks and code ----

  /** Linking applies while both views show the same program. */
  const linkable = () => mode === 'split' && !blocksStale && blocksView !== undefined;

  /** The cursor moved in the code: glow the innermost block under it. */
  function onCursor(pos: number) {
    if (!linkable()) return;
    for (const id of nodesAt(current.spans, pos)) if (blocksView!.highlight(id)) return;
    blocksView!.highlight(undefined);
  }

  /** A block was selected: mark its lines in the code (the first of it and its parents that has text). */
  function onBlockSelect(ids: string[]) {
    if (!linkable()) return;
    const span = ids.map((id) => current.spans.get(id)).find((s) => s !== undefined);
    editor?.link(span);
  }

  function onTextScroll(pos: number) {
    if (!settings.linkScrolling || !linkable()) return;
    const id = itemAt(current.module, current.spans, pos);
    if (id) blocksView!.highlight(id);
  }

  function onBlocksScroll() {
    if (!settings.linkScrolling || !linkable()) return;
    const id = blocksView!.topBlockInView();
    const span = id ? current.spans.get(id) : undefined;
    if (span) editor?.link(span, 'top');
  }

  function onLayout(placed: Record<string, Position>) {
    Object.assign(current.layout, placed);
  }

  function apply(e: HistoryEntry | undefined) {
    if (!e) return;
    const doc = session.doc(e.docId);
    if (!doc) return;
    doc.restore(e.snapshot);
    touch();
    if (currentId !== e.docId) currentId = e.docId;
    else editor?.setText(doc.text);
    blocksStale = true;
    redraw();
  }

  const undo = () => apply(history.undo((id) => session.doc(id)!.snapshot()));
  const redo = () => apply(history.redo((id) => session.doc(id)!.snapshot()));

  function switchTo(id: string) {
    if (id === currentId) return;
    redraw();
    currentId = id;
    blocksStale = true;
    queueMicrotask(redraw);
  }

  // ---- formatting ----

  /** Formats one file through the shared history (one undo step). False when it was already formatted. */
  function formatFile(id: string): boolean {
    const doc = session.doc(id);
    if (!doc) return false;
    const r = format(doc.text);
    if (!r.changed) return false;
    history.record(id, doc.snapshot(), 'format');
    doc.setText(r.text);
    if (id === currentId) editor?.setText(doc.text);
    return true;
  }

  function formatCurrent() {
    if (formatFile(currentId)) touch();
  }

  function formatAll() {
    let any = false;
    for (const d of session.docs) any = formatFile(d.id) || any;
    if (any) touch();
  }

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    const mod = e.metaKey || e.ctrlKey;
    // Plain text fields keep their keys; the code editor gets these shortcuts too.
    const typing = !!t?.closest('input, textarea, .art-editor, .mapper');
    if (!mod && e.shiftKey && e.altKey && e.code === 'KeyF' && section === 'code' && !typing) {
      e.preventDefault();
      formatCurrent();
      return;
    }
    if (!mod) return;
    // View modes and orientation: ⌘⌥1 Blocks, ⌘⌥2 Split, ⌘⌥3 Text, ⌘⌥O stacked or side by side.
    // By key code, since ⌥ changes the character, and browsers keep ⌘1–9 for tabs.
    if (e.altKey && !e.shiftKey && section === 'code') {
      const m = ({ Digit1: 'blocks', Digit2: 'split', Digit3: 'text' } as const)[e.code as 'Digit1'];
      if (m || e.code === 'KeyO') {
        e.preventDefault();
        if (m) setMode(m);
        else toggleOrientation();
        return;
      }
    }
    if (e.code === 'KeyS' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      void saveFile();
      return;
    }
    // CodeMirror and the art editors keep their own undo; so do text fields being edited.
    if (t?.closest('.cm-editor, .art-editor, .mapper, input, textarea, [contenteditable="true"]')) return;
    if (section !== 'code') return;
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
    stage.load(await payloadFor(session, result));
    return true;
  }

  async function run() {
    if (!result.compiled.ok) {
      print('error', `Can't run: ${problems.length} problem${problems.length === 1 ? '' : 's'} to fix first.`);
      return;
    }
    consoleLines = [];
    // A reload still pending from an edit would replace the running world.
    clearTimeout(stageTimer);
    await load();
    stage.run();
    running = true;
    paused = false;
    void startMicIfUsed();
  }

  /** The microphone behind `loudness`: asked once per cart, kept open until Stop (D34). */
  let mic: Microphone | undefined;
  let micAllowed: boolean | undefined;
  let stopMicStream: (() => void) | undefined;

  async function startMicIfUsed() {
    if (!result.compiled.ok || !usesLoudness(result.compiled.code) || micAllowed === false) return;
    micAllowed ??= await ask('Use the microphone?', {
      message: 'This cart reads how loud it is around you. Only the level goes to the stage; no sound is recorded or saved.',
      ok: 'Allow',
      cancel: 'Not now',
    });
    if (!micAllowed) return;
    mic ??= await Microphone.open();
    if (!mic) {
      micAllowed = false;
      print('error', 'No microphone is available, so loudness() stays -1.');
      return;
    }
    stopMicStream ??= streamLevel(mic, (level) => stage.loudness(level));
  }

  function closeMic() {
    stopMicStream?.();
    stopMicStream = undefined;
    mic?.close();
    mic = undefined;
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    stage.pause(paused);
  }

  function stop() {
    paused = false;
    stage.stop();
    running = false;
    closeMic();
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
      case 'http': {
        const id = m.id;
        void net.handle(m).then((r) => stage.httpResult(id, r));
        break;
      }
      case 'stats':
        fps = Math.round(m.fps);
        threads = m.threads;
        audioState = m.audio;
        if (running && m.started && m.threads === 0) running = paused = false;
        break;
    }
  }

  function goTo(at: { fileId: string; from: number; to: number }) {
    section = 'code';
    if (mode === 'blocks') setMode('split');
    switchTo(at.fileId);
    queueMicrotask(() => editor?.reveal(at.from, at.to));
  }

  function lineCol(fileId: string, pos: number) {
    const text = session.doc(fileId)?.text ?? '';
    const before = text.slice(0, pos);
    return `${before.split('\n').length}:${pos - before.lastIndexOf('\n')}`;
  }
</script>

<svelte:window onkeydowncapture={onKey} ondragover={(e) => e.dataTransfer?.types.includes('Files') && e.preventDefault()} ondrop={onDrop} />

<div class="app">
  <header>
    <div class="brand"><Logo size={22} /><span>Stitch</span></div>
    <button class="run" onclick={run} title="Run (restart from the beginning)"><Play />Run</button>
    <button onclick={togglePause} disabled={!running} aria-pressed={paused} class="pause" title={paused ? 'Continue from where it paused' : 'Pause: freeze the game, sound included'}><span class:off={paused}><Pause />Pause</span><span class:off={!paused}><Play />Resume</span></button>
    <button class="stop" onclick={stop} disabled={!running} title="Stop all scripts"><Square />Stop</button>
    <span class="sep"></span>
    <div class="seg" role="tablist" aria-label="Section">
      <button role="tab" aria-selected={section === 'code'} class:on={section === 'code'} onclick={() => (section = 'code')}>Code</button>
      <button role="tab" aria-selected={section === 'costumes'} class:on={section === 'costumes'} onclick={() => (section = 'costumes')}>Costumes</button>
      <button role="tab" aria-selected={section === 'sounds'} class:on={section === 'sounds'} onclick={() => (section = 'sounds')}>Sounds</button>
      <button role="tab" aria-selected={section === 'map'} class:on={section === 'map'} onclick={() => (section = 'map')}>Map</button>
      <button role="tab" aria-selected={section === 'cart'} class:on={section === 'cart'} onclick={() => (section = 'cart')}>Cart</button>
    </div>
    {#if section === 'code'}
      <span class="sep"></span>
      <button onclick={undo} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo"><Undo2 /></button>
      <button onclick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo"><Redo2 /></button>
      <button onclick={formatCurrent} title="Format this file (⇧⌥F)">Format</button>
      <div class="seg" role="group" aria-label="View">
        <button class:on={mode === 'blocks'} aria-pressed={mode === 'blocks'} onclick={() => setMode('blocks')} title="Blocks only (⌘⌥1)">Blocks</button>
        <button class:on={mode === 'split'} aria-pressed={mode === 'split'} onclick={() => setMode('split')} title="Blocks and code (⌘⌥2)">Split</button>
        <button class:on={mode === 'text'} aria-pressed={mode === 'text'} onclick={() => setMode('text')} title="Code only (⌘⌥3)">Text</button>
      </div>
      <button onclick={toggleOrientation} disabled={mode !== 'split'} title={layout.orientation === 'horizontal' ? 'Stack blocks above code (⌘⌥O)' : 'Put blocks and code side by side (⌘⌥O)'} aria-label="Toggle split orientation">{#if layout.orientation === 'horizontal'}<Rows2 />{:else}<Columns2 />{/if}</button>
    {/if}
    <!-- Shrinks before anything wraps: the status text gives way first. -->
    <div class="end">
    <span class="meta">{session.meta.title} · {renderer} · {fps} fps · {threads} thread{threads === 1 ? '' : 's'}</span>
    <!-- The docs ship with the editor (docs.html); a new tab keeps the editor as it was. -->
    <a class="docs-link" href="docs.html?page=docs%2Freference.md" target="_blank" rel="noopener" title="The language reference, tutorials and guides"><BookOpen />Docs</a>
    <SettingsMenu {settings} onchange={setSettings} />
    <button class="theme" onclick={cycleTheme} title="Theme: {theme === 'system' ? 'follows your system' : theme}. Click to change." aria-label="Theme: {THEME_LABEL[theme]}"><ThemeIcon /></button>
    </div>
  </header>

  {#if notice}
    <div class="notice {notice.kind}" role={notice.kind === 'error' ? 'alert' : 'status'}>
      {notice.text}
      <button onclick={() => (notice = undefined)} aria-label="Dismiss"><X /></button>
    </div>
  {/if}

  <main>
    <SplitPane id="main" ratio={0.62} minA={360} minB={260} label="Resize the editor and the stage">
      {#snippet a()}
        <section class="left">
          {#if section === 'code' || section === 'costumes'}
            <nav class="tabs">
              {#each docs as d (d.id)}
                <span class="tab" class:active={d.id === currentId}>
                  <button onclick={() => switchTo(d.id)} ondblclick={() => d.id !== STAGE_FILE && renameSprite(d.id)} title={d.id === STAGE_FILE ? 'Stage' : 'Double-click to rename'}>
                    {d.name}
                    {#if problems.some((p) => p.fileId === d.id)}<span class="dot" title="has problems"></span>{/if}
                  </button>
                  {#if d.id === currentId && d.id !== STAGE_FILE}
                    <button class="x" onclick={() => deleteSprite(d.id)} title="Delete sprite" aria-label="Delete {d.name}"><X /></button>
                  {/if}
                </span>
              {/each}
              <button class="add" onclick={addSprite} title="Add a sprite"><Plus />Sprite</button>
            </nav>
          {/if}

          <div class="views" hidden={section !== 'code'}>
            <SplitPane id="code" orientation={layout.orientation} ratio={0.6} label="Resize blocks and code">
              {#snippet a()}
                <div class="blocks-pane">
                  {#if section === 'code' && mode !== 'text'}
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
                  onselect={onBlockSelect}
                  onscroll={onBlocksScroll}
                      />
                    {:else}
                      <div class="loading">Loading blocks…</div>
                    {/if}
                  {/if}
                </div>
              {/snippet}
              {#snippet b()}
                <div class="text-pane">
                  <CodeEditor bind:this={editor} docKey="{sessionNo}:{current.id}" text={current.text} {globals} catalog={() => session.catalog} assist={assistData} {lintContext} ongoto={goToName} oncursor={onCursor} onscroll={onTextScroll} onchange={onTextChange} onundo={undo} onredo={redo} />
                </div>
              {/snippet}
            </SplitPane>
          </div>

          {#if section === 'costumes'}
            <div class="panel-host">
              {#key sessionNo}
                <CostumesPanel {session} spriteId={currentId} {version} onchange={() => touch(true)} />
              {/key}
            </div>
          {:else if section === 'sounds'}
            <div class="panel-host">
              {#if SoundsPanel}
                {#key sessionNo}
                  <SoundsPanel {session} {version} onchange={() => touch(true)} />
                {/key}
              {:else}
                <div class="loading">Loading sound editors…</div>
              {/if}
            </div>
          {:else if section === 'map'}
            <div class="panel-host">
              {#key sessionNo}
                <MapEditor {session} {version} onchange={() => touch(true)} />
              {/key}
            </div>
          {:else if section === 'cart'}
            <div class="panel-host scroll">
              <CartPanel
                {session}
                {version}
                {status}
                onchange={() => touch(true)}
                onsave={saveFile}
                onopen={openFile}
                onopenurl={openUrl}
                onnew={async () => (await ask('Start a new, empty cart?', { message: 'The current cart is kept only if you saved it.', ok: 'New cart', danger: true })) && openSession(Session.empty(), 'New cart.')}
                onsample={async (id) => (await ask('Replace this cart with the sample?', { message: 'The current cart is kept only if you saved it.', ok: 'Open sample', danger: true })) && void openSampleCart(id)}
              />
              <div class="panel-extra">
                <ExportPanel {session} />
                <ExtensionsPanel {session} {version} onchange={onExtensionsChange} />
                <NetworkPanel {secrets} onsecrets={setSecrets} hosts={allowedHosts} onrevoke={(h) => setHosts(allowedHosts.filter((x) => x !== h))} />
              </div>
            </div>
          {/if}
        </section>
      {/snippet}
      {#snippet b()}
        <section class="right">
          <SplitPane id="stage" orientation="vertical" ratio={0.62} minA={140} minB={80} label="Resize the stage and the problems list">
            {#snippet a()}
              <div class="stage-pane">
                <Stage bind:this={stage} onmessage={onStage} />
              </div>
            {/snippet}
            {#snippet b()}
            <div class="panel">
              <h3>Problems <span class="count">{problems.length}</span></h3>
              <ul>
                {#each problems as p, i (i)}
                  <li class="problem">
                    {#if p.fileId && p.span}
                      <button class="link" onclick={() => goTo({ fileId: p.fileId!, from: p.span!.from, to: p.span!.to })}>
                        {session.doc(p.fileId)?.name}:{lineCol(p.fileId, p.span.from)}
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
                {#if running && audioState === 'suspended'}
                  <li class="hint" role="status">Sound is off until you click or press a key on the stage (browser autoplay rules).</li>
                {/if}
                {#each consoleLines as l, i (i)}
                  <li class={l.kind}>
                    {#if l.at}<button class="link" onclick={() => goTo(l.at!)}>{session.doc(l.at.fileId)?.name}:{lineCol(l.at.fileId, l.at.from)}</button>{/if}
                    {l.text}
                  </li>
                {/each}
              </ul>
            </div>
            {/snippet}
          </SplitPane>
        </section>
      {/snippet}
    </SplitPane>
  </main>
</div>

<Dialogs />

<style>
  .app { display: flex; flex-direction: column; height: 100vh; }
  header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--chrome); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .brand { display: inline-flex; align-items: center; gap: var(--space-2); font-weight: 700; font-size: 15px; letter-spacing: 0.01em; margin-right: var(--space-3); }
  .end { flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .sep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
  .meta { color: var(--muted); font-size: var(--text-s); font-variant-numeric: tabular-nums; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .theme { font-size: var(--text-s); white-space: nowrap; }
  .docs-link { display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-1) 10px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--panel); color: var(--text); text-decoration: none; font-size: var(--text-s); }
  .docs-link:hover { border-color: var(--text); }
  .docs-link :global(svg) { width: 1.15em; height: 1.15em; }
  /* Both labels share one cell, so the button keeps the wider one's width when it flips. */
  .pause { display: inline-grid; }
  .pause > span { grid-area: 1 / 1; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1); }
  .pause > span > :global(svg.lucide-icon) { width: 1.15em; height: 1.15em; flex: none; }
  .pause > .off { visibility: hidden; }
  .run { background: var(--go); border-color: var(--go); color: var(--on-go); font-weight: 600; }
  .seg { display: inline-flex; }
  .seg button { border-radius: 0; margin-left: -1px; }
  .seg button:first-child { border-radius: 6px 0 0 6px; }
  .seg button:last-child { border-radius: 0 6px 6px 0; }
  .seg button.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .notice { display: flex; align-items: center; gap: 10px; padding: 6px 12px; font-size: 13px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--accent) 12%, var(--chrome)); }
  .notice.error { background: color-mix(in srgb, var(--bad) 14%, var(--chrome)); color: var(--bad); }
  .notice button { margin-left: auto; padding: 0 8px; }
  main { flex: 1; display: flex; min-height: 0; }
  .left { display: flex; flex-direction: column; min-height: 0; height: 100%; }
  .tabs { display: flex; gap: 2px; padding: 6px 8px 0; background: var(--chrome); align-items: flex-end; flex-wrap: wrap; }
  .tab { display: inline-flex; border-radius: 6px 6px 0 0; }
  .tab button { border: 1px solid var(--line); border-bottom: none; border-radius: 6px 6px 0 0; background: transparent; }
  .tab.active button { background: var(--panel); }
  .tab .x { border-radius: 0 6px 0 0; margin-left: -1px; padding: 4px 7px; color: var(--muted); }
  .tab.active button:first-child:not(:only-child) { border-radius: 6px 0 0 0; }
  .add { border-bottom: none; border-radius: 6px 6px 0 0; background: transparent; color: var(--muted); }
  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--bad); margin-left: 4px; vertical-align: middle; }
  .views { flex: 1; min-height: 0; display: flex; }
  .views[hidden] { display: none; }
  .blocks-pane, .text-pane { flex: 1; min-width: 0; min-height: 0; position: relative; }
  .stage-pane { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; padding-bottom: 6px; }
  .panel-host { flex: 1; min-height: 0; background: var(--panel); }
  .panel-host.scroll { overflow: auto; }
  .panel-extra { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 18px; max-width: 560px; }
  .loading { padding: 16px; color: var(--muted); }
  .hint { margin: 0; font-family: var(--font-ui); font-size: 12px; color: var(--muted); }
  .right { display: flex; flex-direction: column; padding: 12px; min-height: 0; height: 100%; box-sizing: border-box; }
  .panel { flex: 1; min-height: 0; overflow: auto; }
  .panel h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 10px 0 4px; }
  .count { background: var(--line); border-radius: var(--radius-l); padding: 0 6px; }
  ul { list-style: none; margin: 0; padding: 0; font-size: 13px; }
  li { padding: 3px 0; border-bottom: 1px solid var(--line); }
  .ok { color: var(--muted); }
  .console { font-family: var(--font-mono); font-size: 12px; max-height: 220px; overflow: auto; }
  .console .error, .problem { color: var(--bad); }
  .link { border: none; background: none; padding: 0 6px 0 0; color: var(--accent); text-decoration: underline; }
</style>
