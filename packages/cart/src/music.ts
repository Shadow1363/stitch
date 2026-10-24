/**
 * Tracker music: instruments, patterns (rows x channels) and songs (an order of patterns).
 * Rendered to samples by `renderSong` in `audio.ts` (`@stitch/cart/audio`).
 */

export type InstrumentWave = 'square' | 'pulse' | 'triangle' | 'saw' | 'sine' | 'noise' | 'sample';
export const INSTRUMENT_WAVES: readonly InstrumentWave[] = [
  'square',
  'pulse',
  'triangle',
  'saw',
  'sine',
  'noise',
  'sample',
];

export interface Instrument {
  name: string;
  /** `pulse` is a 25% square. `sample` plays the sound `sound`, pitched so C-4 is as recorded. */
  wave: InstrumentWave;
  sound?: string;
  /** Seconds. */
  attack: number;
  decay: number;
  /** Level 0..1 held after the decay. */
  sustain: number;
  /** Seconds, after a note-off. */
  release: number;
  /** 0..1 */
  volume: number;
}

/**
 * One cell. Fields left out mean "no change" (a cell with only `vol` changes the playing note's
 * volume). `note` is MIDI (60 = C-4) or NOTE_OFF.
 */
export interface Cell {
  note?: number;
  /** Instrument id. */
  inst?: string;
  /** 0..64, as in classic trackers. */
  vol?: number;
  /** Effect: a letter and two hex digits, e.g. "037" (arpeggio), "A04" (volume slide down). */
  fx?: string;
}

export const NOTE_OFF = -1;
export const MAX_VOL = 64;

export interface Pattern {
  name: string;
  rows: number;
  /** cells[row][channel] */
  cells: (Cell | null)[][];
}

export interface Song {
  name: string;
  /** Beats per minute; each row is a sixteenth note (4 rows per beat). */
  bpm: number;
  /** Pattern ids, played in order. */
  order: string[];
  loop: boolean;
}

export interface Music {
  channels: number;
  instruments: Record<string, Instrument>;
  patterns: Record<string, Pattern>;
  songs: Record<string, Song>;
}

export const DEFAULT_CHANNELS = 4;
export const ROWS_PER_BEAT = 4;
/** Effect updates per row (classic tracker "speed"). */
export const TICKS_PER_ROW = 6;

/** Effects the renderer understands; anything else is kept but ignored. */
export const EFFECTS: readonly { code: string; label: string }[] = [
  { code: '0', label: '0xy arpeggio: +x, +y semitones' },
  { code: '1', label: '1xx slide up, xx/16 semitone per tick' },
  { code: '2', label: '2xx slide down, xx/16 semitone per tick' },
  { code: '4', label: '4xy vibrato: speed x, depth y/8 semitone' },
  { code: 'A', label: 'Axy volume slide: up x or down y per tick' },
];

export function emptyMusic(): Music {
  return { channels: DEFAULT_CHANNELS, instruments: {}, patterns: {}, songs: {} };
}

export function emptyPattern(name: string, channels: number, rows = 32): Pattern {
  return {
    name,
    rows,
    cells: Array.from({ length: rows }, () => Array.from({ length: channels }, () => null)),
  };
}

export function defaultInstrument(name: string, wave: InstrumentWave = 'square'): Instrument {
  return { name, wave, attack: 0.005, decay: 0.15, sustain: 0.6, release: 0.1, volume: 0.8 };
}

/** Starter instruments for a new tracker: lead, bass, pad and drums. */
export function starterInstruments(): Record<string, Instrument> {
  return {
    i1: defaultInstrument('Lead', 'square'),
    i2: { ...defaultInstrument('Bass', 'triangle'), sustain: 0.8, volume: 1 },
    i3: { ...defaultInstrument('Pad', 'saw'), attack: 0.08, release: 0.3, volume: 0.5 },
    i4: { ...defaultInstrument('Drum', 'noise'), decay: 0.08, sustain: 0, release: 0.02 },
  };
}

const NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/** "C-4" for 60; "OFF" for NOTE_OFF. */
export function noteName(n: number): string {
  if (n === NOTE_OFF) return 'OFF';
  return `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

/** Fills missing fields so the editor and renderer can trust the shape. */
export function normalizeMusic(input: unknown): Music {
  if (!input || typeof input !== 'object') return emptyMusic();
  const m = input as Partial<Music>;
  const num = (v: unknown, d: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  const channels = Math.round(num(m.channels, DEFAULT_CHANNELS, 1, 16));
  const instruments: Record<string, Instrument> = {};
  for (const [id, i] of Object.entries(m.instruments ?? {})) {
    const d = defaultInstrument(typeof i.name === 'string' ? i.name : id);
    instruments[id] = {
      name: d.name,
      wave: INSTRUMENT_WAVES.includes(i.wave) ? i.wave : d.wave,
      ...(typeof i.sound === 'string' ? { sound: i.sound } : {}),
      attack: num(i.attack, d.attack, 0, 10),
      decay: num(i.decay, d.decay, 0, 10),
      sustain: num(i.sustain, d.sustain, 0, 1),
      release: num(i.release, d.release, 0, 10),
      volume: num(i.volume, d.volume, 0, 1),
    };
  }
  const patterns: Record<string, Pattern> = {};
  for (const [id, p] of Object.entries(m.patterns ?? {})) {
    const rows = Math.round(num(p.rows, 32, 1, 256));
    const out = emptyPattern(typeof p.name === 'string' ? p.name : id, channels, rows);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < channels; c++) {
        const cell = p.cells?.[r]?.[c];
        if (cell && typeof cell === 'object') out.cells[r]![c] = { ...cell };
      }
    patterns[id] = out;
  }
  const songs: Record<string, Song> = {};
  for (const [id, s] of Object.entries(m.songs ?? {}))
    songs[id] = {
      name: typeof s.name === 'string' ? s.name : id,
      bpm: num(s.bpm, 120, 20, 400),
      order: Array.isArray(s.order) ? s.order.filter((o) => o in patterns) : [],
      loop: s.loop !== false,
    };
  return { channels, instruments, patterns, songs };
}
