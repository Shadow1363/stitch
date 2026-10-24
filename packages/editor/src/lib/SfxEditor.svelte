<script lang="ts">
  import SplitPane from './SplitPane.svelte';
  import { DEFAULT_SFX, SFX_PARAMS, SFX_PRESETS, SFX_WAVES, sfxMutate, sfxPreset, sfxRandomize, type SfxParams, type SfxPreset, type Sound } from '@stitch/cart';
  import { encodeWav, SFX_RATE } from '@stitch/cart/audio';
  import { download } from './files';
  import type { Session } from './session';
  import { uniqueName } from './session';
  import { preview, soundSamples } from './sound';
  import { token } from './theme';
  import { themeVersion } from './theme-version.svelte';
  import { ask } from './dialog.svelte';

  interface Props {
    session: Session;
    version: number;
    onchange: () => void;
  }
  let { session, version, onchange }: Props = $props();

  /** Bumped on local edits; sounds are mutated in place. */
  let rev = $state(0);
  let selectedId = $state<string | undefined>();
  let undoStack: { id: string; params: SfxParams }[] = [];
  let redoStack: { id: string; params: SfxParams }[] = [];

  const list = $derived.by(() => (void version, void rev, Object.entries(session.sounds).map(([id, s]) => ({ id, name: s.name }))));
  const currentId = $derived(selectedId && session.sounds[selectedId] ? selectedId : list[0]?.id);
  const current: Sound | undefined = $derived((void version, void rev, currentId ? session.sounds[currentId] : undefined));
  /** A copy, so sliders see each change. */
  const params = $derived(current ? { ...current.params } : undefined);
  const seconds = $derived(current ? soundSamples(current).length / SFX_RATE : 0);
  const groups = $derived([...new Set(SFX_PARAMS.map((p) => p.group))]);

  let canvas = $state<HTMLCanvasElement>();
  $effect(() => {
    void themeVersion();
    if (canvas && current) drawWave(canvas, soundSamples({ ...current, params: { ...current.params } }));
  });

  const seed = () => (Math.random() * 2 ** 32) >>> 0;

  function changed() {
    rev++;
    onchange();
  }

  function play() {
    if (current) preview(soundSamples(current), SFX_RATE);
  }

  /** Records the current parameters for undo, then applies `next` and plays it (as sfxr). */
  function setParams(next: SfxParams, sound = true) {
    if (!current || !currentId) return;
    undoStack.push({ id: currentId, params: { ...current.params } });
    if (undoStack.length > 200) undoStack.shift();
    redoStack = [];
    current.params = next;
    changed();
    if (sound) play();
  }

  function add(params: SfxParams, base: string) {
    const id = session.newId('sound');
    session.sounds[id] = { kind: 'sfx', name: uniqueName(base, Object.values(session.sounds).map((s) => s.name)), params };
    selectedId = id;
    changed();
    play();
  }

  async function remove() {
    const id = currentId;
    if (!id || !current) return;
    if (!(await ask(`Delete the sound “${current.name}”?`, { message: 'Scripts that play it will stay silent.', ok: 'Delete', danger: true })) || currentId !== id) return;
    delete session.sounds[currentId];
    for (const i of Object.values(session.music.instruments)) if (i.sound === currentId) delete i.sound;
    selectedId = undefined;
    changed();
  }

  function rename(name: string) {
    if (current && name.trim()) {
      current.name = name.trim();
      changed();
    }
  }

  function step(from: typeof undoStack, to: typeof undoStack) {
    const e = from.pop();
    const s = e && session.sounds[e.id];
    if (!e || !s) return;
    to.push({ id: e.id, params: { ...s.params } });
    s.params = e.params;
    selectedId = e.id;
    changed();
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input[type="text"]')) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && (k === 'z' || k === 'y')) {
      e.preventDefault();
      e.stopPropagation();
      if (k === 'y' || e.shiftKey) step(redoStack, undoStack);
      else step(undoStack, redoStack);
    } else if (!mod && k === ' ') {
      e.preventDefault();
      play();
    }
  }

  function exportWav() {
    if (!current) return;
    const wav = encodeWav(soundSamples(current), SFX_RATE);
    download(new Blob([wav as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), `${current.name}.wav`);
  }

  function drawWave(c: HTMLCanvasElement, s: Float32Array) {
    const g = c.getContext('2d');
    if (!g) return;
    const { width: w, height: h } = c;
    g.clearRect(0, 0, w, h);
    g.fillStyle = token('--violet');
    const per = Math.max(1, s.length / w);
    for (let x = 0; x < w; x++) {
      let lo = 0;
      let hi = 0;
      const end = Math.min(s.length, Math.floor((x + 1) * per));
      for (let i = Math.floor(x * per); i < end; i++) {
        const v = s[i]!;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      g.fillRect(x, h / 2 - hi * (h / 2), 1, Math.max(1, (hi - lo) * (h / 2)));
    }
  }

  const label = (p: SfxPreset) => p[0]!.toUpperCase() + p.slice(1);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="art-editor sfx" tabindex="-1" onkeydown={onKey} role="application" aria-label="Sound effect editor">
  <SplitPane id="sound-list" ratio={0.22} minA={150} minB={320} label="Resize the sound list">
    {#snippet a()}
      <aside class="list">
        <div class="new">
          <span class="muted">New sound</span>
          {#each SFX_PRESETS as p (p)}
            <button onclick={() => add(sfxPreset(p, seed()), p)}>{label(p)}</button>
          {/each}
          <button onclick={() => add(sfxRandomize(seed()), 'random')}>Random</button>
          <button onclick={() => add({ ...DEFAULT_SFX }, 'sound')}>Blank</button>
        </div>
        <ul>
          {#each list as s (s.id)}
            <li class:sel={s.id === currentId}>
              <button class="pick" onclick={() => (selectedId = s.id)}>{s.name}</button>
              <button class="play" aria-label="Play {s.name}" onclick={() => { selectedId = s.id; queueMicrotask(play); }}>▶</button>
            </li>
          {:else}
            <li class="muted">No sounds yet. Pick a kind above.</li>
          {/each}
        </ul>
      </aside>
    {/snippet}
    {#snippet b()}
      {#if current && params}
        <div class="edit">
          <div class="bar">
            <input class="name" type="text" value={current.name} onchange={(e) => rename((e.target as HTMLInputElement).value)} aria-label="Sound name" title="Scripts play it by this name" />
            <button class="go" onclick={play} title="Play (Space)">▶ Play</button>
            <span class="gap"></span>
            {#each SFX_PRESETS as p (p)}
              <button onclick={() => setParams(sfxPreset(p, seed()))} title="Replace with a new {p} sound">{label(p)}</button>
            {/each}
            <span class="gap"></span>
            <button onclick={() => setParams(sfxMutate(current.params, seed()))} title="Small random changes">Mutate</button>
            <button onclick={() => setParams({ ...sfxRandomize(seed()), volume: current.params.volume })}>Randomize</button>
            <span class="gap"></span>
            <button onclick={() => step(undoStack, redoStack)} title="Undo (⌘Z)">↶</button>
            <button onclick={() => step(redoStack, undoStack)} title="Redo (⇧⌘Z)">↷</button>
            <button onclick={exportWav}>Export WAV</button>
            <button onclick={remove} title="Delete sound">🗑</button>
          </div>
          <div class="wave-row">
            <div class="seg" role="radiogroup" aria-label="Wave">
              {#each SFX_WAVES as w (w)}
                <button role="radio" aria-checked={params.wave === w} class:on={params.wave === w} onclick={() => setParams({ ...current.params, wave: w })}>{w}</button>
              {/each}
            </div>
            <canvas bind:this={canvas} width="360" height="48" aria-label="Waveform"></canvas>
            <span class="muted">{seconds.toFixed(2)} s</span>
          </div>
          <div class="sliders">
            {#each groups as g (g)}
              <fieldset>
                <legend>{g}</legend>
                {#each SFX_PARAMS.filter((p) => p.group === g) as p (p.key)}
                  <label>
                    <span>{p.label}</span>
                    <input
                      type="range"
                      min={p.signed ? -1 : 0}
                      max="1"
                      step="0.01"
                      value={params[p.key]}
                      onchange={(e) => setParams({ ...current.params, [p.key]: Number((e.target as HTMLInputElement).value) })}
                    />
                    <output>{params[p.key].toFixed(2)}</output>
                  </label>
                {/each}
              </fieldset>
            {/each}
          </div>
        </div>
      {/if}
    {/snippet}
  </SplitPane>
</div>

<style>
  .sfx { display: flex; height: 100%; min-height: 0; outline: none; font-size: 12px; }
  .list { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .new { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px; border-bottom: 1px solid var(--line); }
  .new .muted { width: 100%; }
  .new button { padding: 2px 6px; font-size: 11px; }
  ul { list-style: none; margin: 0; padding: 4px; overflow: auto; flex: 1; }
  li { display: flex; gap: 2px; margin-bottom: 2px; }
  li.sel .pick { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .pick { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .play { padding: 2px 8px; }
  .edit { flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 8px; min-width: 0; overflow: auto; }
  .bar, .wave-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .bar button { padding: 3px 7px; font-size: 12px; }
  .go { background: var(--violet); border-color: var(--violet); color: var(--on-violet); }
  .name { width: 120px; font: inherit; padding: 3px 6px; border: 1px solid var(--line); border-radius: var(--radius); }
  .gap { width: 8px; }
  .seg { display: inline-flex; }
  .seg button { border-radius: 0; margin-left: -1px; padding: 3px 8px; }
  .seg button:first-child { border-radius: 6px 0 0 6px; }
  .seg button:last-child { border-radius: 0 6px 6px 0; }
  .seg button.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  canvas { background: var(--chrome); border-radius: var(--radius); max-width: 100%; }
  .sliders { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; }
  fieldset { border: 1px solid var(--line); border-radius: var(--radius-l); margin: 0; padding: 4px 8px 6px; }
  legend { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
  label { display: grid; grid-template-columns: 110px 1fr 36px; gap: 6px; align-items: center; }
  output { font-variant-numeric: tabular-nums; color: var(--muted); text-align: right; }
  .muted { color: var(--muted); }
</style>
