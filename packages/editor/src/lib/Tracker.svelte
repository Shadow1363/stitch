<script lang="ts">
  import SplitPane from './SplitPane.svelte';
  import { defaultInstrument, EFFECTS, emptyPattern, INSTRUMENT_WAVES, MAX_VOL, NOTE_OFF, noteName, ROWS_PER_BEAT, starterInstruments, type Cell, type Music, type Song } from '@stitch/cart';
  import { encodeWav, MUSIC_RATE } from '@stitch/cart/audio';
  import { onDestroy } from 'svelte';
  import { download } from './files';
  import { uniqueName, type Session } from './session';
  import { preview, previewTime, songSamples, stopPreview } from './sound';
  import { ask } from './dialog.svelte';

  interface Props {
    session: Session;
    version: number;
    onchange: () => void;
  }
  let { session, version, onchange }: Props = $props();

  /** Bumped on local edits; music is mutated in place. */
  let rev = $state(0);
  let songSel = $state<string | undefined>();
  let patSel = $state<string | undefined>();
  let instSel = $state<string | undefined>();
  /** Selected slot in the song order (for "play from cursor"). */
  let orderSel = $state(0);
  let cursor = $state({ row: 0, ch: 0, col: 0 });
  let octave = $state(4);
  let playRow = $state<number | undefined>();
  let undoStack: Music[] = [];
  let redoStack: Music[] = [];

  const m = $derived((void version, void rev, session.music));
  const songIds = $derived((void rev, Object.keys(m.songs)));
  const songId = $derived(songSel && m.songs[songSel] ? songSel : songIds[0]);
  const song: Song | undefined = $derived((void rev, songId ? m.songs[songId] : undefined));
  const order = $derived((void rev, song ? [...song.order] : []));
  const patIds = $derived((void rev, Object.keys(m.patterns)));
  const patId = $derived(patSel && m.patterns[patSel] ? patSel : (order[0] ?? patIds[0]));
  const pattern = $derived((void rev, patId ? m.patterns[patId] : undefined));
  const instIds = $derived((void rev, Object.keys(m.instruments)));
  const instId = $derived(instSel && m.instruments[instSel] ? instSel : instIds[0]);
  const inst = $derived((void rev, instId ? { ...m.instruments[instId]! } : undefined));
  const soundList = $derived((void version, Object.entries(session.sounds).map(([id, s]) => ({ id, name: s.name }))));
  /** Fresh row views for the grid. */
  const rows = $derived.by(() => {
    void rev;
    if (!pattern) return [];
    return pattern.cells.map((r) => r.map((c) => (c ? { ...c } : null)));
  });

  // ---- editing ----

  function edit(fn: () => void) {
    undoStack.push(structuredClone(session.music));
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    fn();
    rev++;
    onchange();
  }

  function step(from: Music[], to: Music[]) {
    const prev = from.pop();
    if (!prev) return;
    to.push(structuredClone(session.music));
    session.music = prev;
    rev++;
    onchange();
  }

  function start() {
    edit(() => {
      Object.assign(session.music.instruments, starterInstruments());
      const pid = session.newId('pattern');
      session.music.patterns[pid] = emptyPattern('Pattern 1', session.music.channels);
      const sid = session.newId('song');
      session.music.songs[sid] = { name: 'song1', bpm: 120, order: [pid], loop: true };
    });
  }

  function newSong() {
    edit(() => {
      const id = session.newId('song');
      const first = patId ?? addPattern();
      session.music.songs[id] = { name: uniqueName('song', Object.values(session.music.songs).map((s) => s.name)), bpm: song?.bpm ?? 120, order: [first], loop: true };
      songSel = id;
    });
  }

  function addPattern(copyOf?: string): string {
    const id = session.newId('pattern');
    const names = Object.values(session.music.patterns).map((p) => p.name);
    const src = copyOf ? session.music.patterns[copyOf] : undefined;
    session.music.patterns[id] = src ? { ...structuredClone(src), name: uniqueName('Pattern ', names) } : emptyPattern(uniqueName('Pattern ', names), session.music.channels);
    patSel = id;
    return id;
  }

  async function deletePattern() {
    const id = patId;
    if (!id || !pattern) return;
    if (!(await ask(`Delete ${pattern.name}?`, { message: 'It is removed from every song.', ok: 'Delete', danger: true })) || patId !== id) return;
    edit(() => {
      delete session.music.patterns[patId];
      for (const s of Object.values(session.music.songs)) s.order = s.order.filter((p) => p !== patId);
      patSel = undefined;
    });
  }

  async function deleteSong() {
    const id = songId;
    if (!id || !song || !(await ask(`Delete the song “${song.name}”?`, { message: 'Its patterns stay.', ok: 'Delete', danger: true })) || songId !== id) return;
    edit(() => {
      delete session.music.songs[songId];
      songSel = undefined;
    });
  }

  function resize(n: number) {
    if (!pattern || !Number.isFinite(n)) return;
    const rowsN = Math.max(1, Math.min(256, Math.round(n)));
    edit(() => {
      const p = session.music.patterns[patId!]!;
      if (rowsN < p.rows) p.cells.length = rowsN;
      else for (let r = p.rows; r < rowsN; r++) p.cells.push(Array.from({ length: session.music.channels }, () => null));
      p.rows = rowsN;
      cursor.row = Math.min(cursor.row, rowsN - 1);
    });
  }

  function setCell(row: number, ch: number, fn: (c: Cell) => void) {
    edit(() => {
      const p = session.music.patterns[patId!]!;
      const c: Cell = { ...(p.cells[row]![ch] ?? {}) };
      fn(c);
      for (const k of Object.keys(c) as (keyof Cell)[]) if (c[k] === undefined) delete c[k];
      p.cells[row]![ch] = Object.keys(c).length ? c : null;
    });
  }

  function setInst<K extends keyof NonNullable<typeof inst>>(key: K, value: NonNullable<typeof inst>[K]) {
    if (!instId) return;
    edit(() => {
      const i = session.music.instruments[instId]!;
      i[key] = value;
      if (key === 'wave' && value === 'sample' && !i.sound) {
        const first = Object.keys(session.sounds)[0];
        if (first) i.sound = first;
      }
    });
  }

  function newInstrument() {
    edit(() => {
      const id = session.newId('inst');
      session.music.instruments[id] = defaultInstrument(uniqueName('Instrument', Object.values(session.music.instruments).map((i) => i.name)));
      instSel = id;
    });
  }

  async function deleteInstrument() {
    const id = instId;
    if (!id || !inst || !(await ask(`Delete the instrument “${inst.name}”?`, { message: 'Notes using it go silent.', ok: 'Delete', danger: true })) || instId !== id) return;
    edit(() => {
      delete session.music.instruments[instId];
      instSel = undefined;
    });
  }

  // ---- playback ----

  const rowSeconds = () => 60 / ((song?.bpm ?? 120) * ROWS_PER_BEAT);
  let raf = 0;

  /** Plays and follows the cursor. `rowsFrom`: which pattern row each played row is, in order. */
  function playFrom(target: Song, from: { order: number; row: number } | undefined, rowsFrom: { pid: string; row: number }[]) {
    preview(songSamples(session.music, target, session.sounds, from), MUSIC_RATE, () => (playRow = undefined));
    cancelAnimationFrame(raf);
    const follow = () => {
      const t = previewTime();
      if (t === undefined) {
        playRow = undefined;
        return;
      }
      const r = rowsFrom[Math.floor(t / rowSeconds())];
      if (r) {
        if (r.pid !== patId) patSel = r.pid;
        playRow = r.row;
      } else playRow = undefined;
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
  }

  function songRows(s: Song) {
    const out: { order: number; pid: string; row: number }[] = [];
    s.order.forEach((pid, order) => {
      const p = session.music.patterns[pid];
      if (p) for (let row = 0; row < p.rows; row++) out.push({ order, pid, row });
    });
    return out;
  }

  function playSong(fromCursor: boolean) {
    if (!song) return;
    const s: Song = { ...song, order: [...song.order], loop: false };
    const all = songRows(s);
    const slot = Math.min(orderSel, s.order.length - 1);
    const from = fromCursor ? { order: slot, row: s.order[slot] === patId ? cursor.row : 0 } : undefined;
    const startAt = from ? Math.max(0, all.findIndex((r) => r.order === from.order && r.row >= from.row)) : 0;
    playFrom(s, from, all.slice(startAt));
  }

  function playPattern() {
    if (!patId || !pattern) return;
    const s: Song = { name: 'preview', bpm: song?.bpm ?? 120, order: [patId], loop: false };
    const rowsFrom = Array.from({ length: pattern.rows - cursor.row }, (_, i) => ({ pid: patId, row: cursor.row + i }));
    playFrom(s, { order: 0, row: cursor.row }, rowsFrom);
  }

  function stop() {
    cancelAnimationFrame(raf);
    stopPreview();
    playRow = undefined;
  }

  /** Plays one note on the selected instrument, as feedback while typing. */
  function previewNote(note: number) {
    if (!instId) return;
    const tmp: Music = { ...session.music, patterns: { n: { name: 'n', rows: 8, cells: Array.from({ length: 8 }, (_, r) => [r === 0 ? { note, inst: instId } : r === 3 ? { note: NOTE_OFF } : null]) } }, channels: 1 };
    preview(songSamples(tmp, { name: 'n', bpm: 120, order: ['n'], loop: false }, session.sounds), MUSIC_RATE);
  }

  function exportWav() {
    if (!song) return;
    const s = songSamples(session.music, { ...song, loop: false }, session.sounds);
    download(new Blob([encodeWav(s, MUSIC_RATE) as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), `${song.name}.wav`);
  }

  onDestroy(stop);

  // ---- keyboard entry ----

  /** Two piano rows, as in most trackers: Z-M is one octave, Q-U the next. */
  const PIANO: Record<string, number> = { z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12, q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23, i: 24 };

  function move(dr: number, dcol: number) {
    if (!pattern) return;
    const rowsN = pattern.rows;
    let { row, ch, col } = cursor;
    row = (row + dr + rowsN) % rowsN;
    col += dcol;
    if (col > 3) {
      col = 0;
      ch = (ch + 1) % m.channels;
    } else if (col < 0) {
      col = 3;
      ch = (ch - 1 + m.channels) % m.channels;
    }
    cursor = { row, ch, col };
  }

  function onGridKey(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && (k === 'z' || k === 'y')) {
      e.preventDefault();
      e.stopPropagation();
      if (k === 'y' || e.shiftKey) step(redoStack, undoStack);
      else step(undoStack, redoStack);
      return;
    }
    if (mod || !pattern) return;
    const { row, ch, col } = cursor;
    const nav: Record<string, () => void> = {
      arrowup: () => move(-1, 0),
      arrowdown: () => move(1, 0),
      arrowleft: () => move(0, -1),
      arrowright: () => move(0, 1),
      pageup: () => move(-Math.min(row, 16), 0),
      pagedown: () => move(Math.min(pattern.rows - 1 - row, 16), 0),
      home: () => (cursor = { ...cursor, row: 0 }),
      end: () => (cursor = { ...cursor, row: pattern.rows - 1 }),
      tab: () => (cursor = { row, ch: (ch + (e.shiftKey ? m.channels - 1 : 1)) % m.channels, col: 0 }),
      ' ': () => (playRow === undefined ? playPattern() : stop()),
    };
    if (nav[k]) {
      e.preventDefault();
      nav[k]();
      return;
    }
    if (k === 'delete' || k === 'backspace' || k === '.') {
      e.preventDefault();
      const field = (['note', 'inst', 'vol', 'fx'] as const)[col]!;
      setCell(row, ch, (c) => {
        delete c[field];
        if (field === 'note') delete c.inst;
      });
      move(1, 0);
      return;
    }
    if (col === 0) {
      if (k === '1' || k === '`') {
        e.preventDefault();
        setCell(row, ch, (c) => {
          c.note = NOTE_OFF;
          delete c.inst;
        });
        move(1, 0);
        return;
      }
      const semi = PIANO[k];
      if (semi === undefined) return;
      e.preventDefault();
      const note = Math.max(0, Math.min(127, (octave + 1) * 12 + semi));
      setCell(row, ch, (c) => {
        c.note = note;
        if (instId) c.inst = instId;
      });
      previewNote(note);
      move(1, 0);
    } else if (col === 1 && /^[0-9]$/.test(k)) {
      e.preventDefault();
      const id = instIds[Number(k) - 1];
      if (id) setCell(row, ch, (c) => (c.inst = id));
    } else if (col === 2 && /^[0-9]$/.test(k)) {
      e.preventDefault();
      setCell(row, ch, (c) => (c.vol = Math.min(MAX_VOL, ((c.vol ?? 0) % 10) * 10 + Number(k))));
    } else if (col === 3 && /^[0-9a-f]$/.test(k)) {
      e.preventDefault();
      setCell(row, ch, (c) => (c.fx = ((c.fx ?? '000').slice(1) + k).toUpperCase()));
    }
  }

  const instIndex = (id: string | undefined) => {
    const i = id ? instIds.indexOf(id) : -1;
    return i < 0 ? (id ? '??' : '··') : String(i + 1).padStart(2, '0');
  };
  const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
</script>

<div class="art-editor tracker" role="application" aria-label="Music tracker">
  {#if !song && !patIds.length}
    <div class="empty">
      <p>No music yet. Start with four instruments (lead, bass, pad, drum), one empty pattern and a song that plays it.</p>
      <button class="go" onclick={start}>Start a song</button>
    </div>
  {:else}
    <div class="bar">
      <label>Song
        <select value={songId} onchange={(e) => (songSel = (e.target as HTMLSelectElement).value)}>
          {#each songIds as id (id)}<option value={id}>{m.songs[id]!.name}</option>{/each}
        </select>
      </label>
      <button onclick={newSong} title="New song">＋</button>
      {#if song}
        <input type="text" class="name" value={song.name} aria-label="Song name" title="Scripts play it by this name" onchange={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (v) edit(() => (session.music.songs[songId!]!.name = v)); }} />
        <label>BPM <input type="number" min="20" max="400" value={song.bpm} onchange={(e) => { const v = Number((e.target as HTMLInputElement).value); if (v >= 20 && v <= 400) edit(() => (session.music.songs[songId!]!.bpm = v)); }} /></label>
        <label><input type="checkbox" checked={song.loop} onchange={(e) => edit(() => (session.music.songs[songId!]!.loop = (e.target as HTMLInputElement).checked))} /> loop in game</label>
        <button onclick={deleteSong} title="Delete song">🗑</button>
      {/if}
      <span class="gap"></span>
      <button class="go" onclick={() => playSong(false)} disabled={!song}>▶ Song</button>
      <button onclick={() => playSong(true)} disabled={!song} title="Play the song from the selected slot and row">▶ From cursor</button>
      <button onclick={playPattern} disabled={!pattern} title="Play this pattern from the cursor (Space)">▶ Pattern</button>
      <button onclick={stop}>■ Stop</button>
      <button onclick={exportWav} disabled={!song}>Export WAV</button>
      <span class="gap"></span>
      <button onclick={() => step(undoStack, redoStack)} title="Undo (⌘Z)">↶</button>
      <button onclick={() => step(redoStack, undoStack)} title="Redo (⇧⌘Z)">↷</button>
    </div>

    {#if song}
      <div class="order" aria-label="Song order">
        <span class="muted">Order</span>
        {#each order as pid, i (i)}
          <button class="slot" class:sel={i === orderSel} onclick={() => { orderSel = i; patSel = pid; }}>{i + 1}. {m.patterns[pid]?.name ?? '?'}</button>
        {/each}
        <button onclick={() => patId && edit(() => { session.music.songs[songId!]!.order.push(patId); orderSel = order.length; })} disabled={!patId} title="Append the pattern being edited">＋ {pattern?.name ?? ''}</button>
        <button onclick={() => edit(() => { const o = session.music.songs[songId!]!.order; if (orderSel > 0 && orderSel < o.length) { [o[orderSel - 1], o[orderSel]] = [o[orderSel]!, o[orderSel - 1]!]; orderSel--; } })} title="Move slot left">◀</button>
        <button onclick={() => edit(() => { const o = session.music.songs[songId!]!.order; if (orderSel < o.length - 1) { [o[orderSel + 1], o[orderSel]] = [o[orderSel]!, o[orderSel + 1]!]; orderSel++; } })} title="Move slot right">▶</button>
        <button onclick={() => edit(() => { session.music.songs[songId!]!.order.splice(orderSel, 1); orderSel = Math.max(0, orderSel - 1); })} disabled={!order.length} title="Remove slot">✕</button>
      </div>
    {/if}

    <div class="body">
      <SplitPane id="tracker-side" ratio={0.72} minA={320} minB={200} label="Resize the pattern and the instruments">
        {#snippet a()}
          <div class="grid-wrap">
            <div class="bar">
              <label>Pattern
                <select value={patId} onchange={(e) => (patSel = (e.target as HTMLSelectElement).value)}>
                  {#each patIds as id (id)}<option value={id}>{m.patterns[id]!.name}</option>{/each}
                </select>
              </label>
              <button onclick={() => edit(() => addPattern())}>New</button>
              <button onclick={() => patId && edit(() => addPattern(patId))} disabled={!patId}>Duplicate</button>
              {#if pattern}
                <input type="text" class="name" value={pattern.name} aria-label="Pattern name" onchange={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (v) edit(() => (session.music.patterns[patId!]!.name = v)); }} />
                <label>Rows <input type="number" min="1" max="256" value={pattern.rows} onchange={(e) => resize(Number((e.target as HTMLInputElement).value))} /></label>
                <button onclick={deletePattern} title="Delete pattern">🗑</button>
              {/if}
              <label>Octave <input type="number" min="0" max="8" bind:value={octave} /></label>
            </div>
            {#if pattern}
              <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
              <div class="grid" tabindex="0" role="grid" aria-label="Pattern cells. Type notes on Z–M and Q–U, 1 for note off." onkeydown={onGridKey}>
                {#each rows as r, ri (ri)}
                  <div class="row" class:beat={ri % ROWS_PER_BEAT === 0} class:playing={ri === playRow} role="row">
                    <span class="num">{hex(ri)}</span>
                    {#each r as c, ci (ci)}
                      <span class="cell" role="gridcell">
                        {#each [c?.note !== undefined ? noteName(c.note) : '···', c?.note === NOTE_OFF ? '··' : instIndex(c?.inst), c?.vol !== undefined ? String(c.vol).padStart(2, '0') : '··', c?.fx ?? '···'] as text, fi (fi)}
                          <!-- svelte-ignore a11y_click_events_have_key_events -->
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <span class="f f{fi}" class:cur={cursor.row === ri && cursor.ch === ci && cursor.col === fi} class:empty-f={text.startsWith('·')} onclick={() => (cursor = { row: ri, ch: ci, col: fi })}>{text}</span>
                        {/each}
                      </span>
                    {/each}
                  </div>
                {/each}
              </div>
              <p class="help muted">Columns: note · instrument · volume (0–64) · effect. Keys: Z–M / Q–U notes, 1 note off, Del clear, Space play/stop, Tab next channel. Effects: {EFFECTS.map((f) => f.label).join('; ')}.</p>
            {/if}
          </div>
        {/snippet}
        {#snippet b()}
          <aside class="insts">
            <div class="bar"><b>Instruments</b><button onclick={newInstrument}>＋</button></div>
            <ul>
              {#each instIds as id, i (id)}
                <li><button class:sel={id === instId} onclick={() => (instSel = id)}>{String(i + 1).padStart(2, '0')} {m.instruments[id]!.name}</button></li>
              {/each}
            </ul>
            {#if inst}
              <div class="inst">
                <input type="text" class="name" value={inst.name} aria-label="Instrument name" onchange={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (v) setInst('name', v); }} />
                <label>Wave
                  <select value={inst.wave} onchange={(e) => setInst('wave', (e.target as HTMLSelectElement).value as typeof inst.wave)}>
                    {#each INSTRUMENT_WAVES as w (w)}<option value={w}>{w}</option>{/each}
                  </select>
                </label>
                {#if inst.wave === 'sample'}
                  <label>Sound
                    <select value={inst.sound ?? ''} onchange={(e) => setInst('sound', (e.target as HTMLSelectElement).value)}>
                      <option value="" disabled>pick a sound</option>
                      {#each soundList as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
                    </select>
                  </label>
                {/if}
                {#each [['attack', 'Attack s', 0, 2], ['decay', 'Decay s', 0, 2], ['sustain', 'Sustain', 0, 1], ['release', 'Release s', 0, 2], ['volume', 'Volume', 0, 1]] as const as [key, label, lo, hi] (key)}
                  <label class="slider">{label}
                    <input type="range" min={lo} max={hi} step="0.01" value={inst[key]} onchange={(e) => setInst(key, Number((e.target as HTMLInputElement).value))} />
                    <output>{inst[key].toFixed(2)}</output>
                  </label>
                {/each}
                <div class="bar">
                  <button onclick={() => previewNote((octave + 1) * 12)}>▶ C-{octave}</button>
                  <button onclick={deleteInstrument} title="Delete instrument">🗑</button>
                </div>
              </div>
            {/if}
          </aside>
        {/snippet}
      </SplitPane>
    </div>
  {/if}
</div>

<style>
  .tracker { display: flex; flex-direction: column; gap: 6px; height: 100%; min-height: 0; padding: 8px; box-sizing: border-box; font-size: 12px; outline: none; }
  .bar, .order { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .bar button, .order button { padding: 3px 7px; font-size: 12px; }
  .go { background: var(--violet); border-color: var(--violet); color: var(--on-violet); }
  .gap { width: 8px; }
  .name { width: 100px; font: inherit; padding: 3px 6px; border: 1px solid var(--line); border-radius: var(--radius); }
  input[type='number'] { width: 52px; }
  .slot.sel { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .body { flex: 1; display: flex; min-height: 0; }
  .grid-wrap { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; min-height: 0; }
  .grid { flex: 1; overflow: auto; font-family: var(--font-mono); font-size: 12px; background: var(--chrome); border-radius: var(--radius-l); padding: 4px 0; outline: none; }
  .grid:focus { box-shadow: 0 0 0 2px var(--accent); }
  .row { display: flex; white-space: pre; line-height: 18px; }
  .row.beat { background: color-mix(in srgb, var(--line) 50%, transparent); }
  .row.playing { background: color-mix(in srgb, var(--violet) 30%, transparent); }
  .num { width: 28px; text-align: right; padding-right: 6px; color: var(--muted); }
  .cell { display: inline-flex; gap: 4px; padding: 0 8px; border-left: 1px solid var(--line); }
  .f { cursor: pointer; border-radius: 2px; }
  .f0 { color: var(--text); }
  .f1 { color: var(--violet); }
  .f2 { color: var(--teal); }
  .f3 { color: var(--amber); }
  .empty-f { color: var(--muted); opacity: 0.6; }
  .f.cur { background: var(--accent); color: var(--on-accent); opacity: 1; }
  .help { margin: 0; font-size: 11px; }
  .insts { flex: 1; padding-left: 6px; display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow: auto; }
  .insts ul { list-style: none; margin: 0; padding: 0; }
  .insts li button { width: 100%; text-align: left; margin-bottom: 2px; padding: 2px 6px; font-size: 12px; }
  .insts li button.sel { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .inst { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--line); padding-top: 6px; }
  .inst label { display: flex; gap: 6px; align-items: center; }
  .slider { display: grid !important; grid-template-columns: 64px minmax(0, 1fr) 34px; }
  output { font-variant-numeric: tabular-nums; color: var(--muted); text-align: right; }
  .empty { padding: 16px; color: var(--muted); }
  .muted { color: var(--muted); }
</style>
