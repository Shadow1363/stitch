/**
 * Sound effects as sfxr parameter sets. The synth that turns them into samples is in
 * `audio.ts` (`@stitch/cart/audio`); this module holds the data, presets and editing helpers.
 */

export type SfxWave = 'square' | 'saw' | 'sine' | 'noise';
export const SFX_WAVES: readonly SfxWave[] = ['square', 'saw', 'sine', 'noise'];

/** sfxr's parameters. Most are 0..1; the ones listed as signed in SFX_PARAMS are -1..1. */
export interface SfxParams {
  wave: SfxWave;
  attack: number;
  sustain: number;
  punch: number;
  decay: number;
  freq: number;
  /** Sound stops when a falling pitch reaches this. 0 = no limit. */
  freqLimit: number;
  slide: number;
  deltaSlide: number;
  vibDepth: number;
  vibSpeed: number;
  arpMod: number;
  arpSpeed: number;
  /** Square wave only. */
  duty: number;
  dutySweep: number;
  /** Restarts the pitch envelope at this rate. 0 = off. */
  repeatSpeed: number;
  phaserOffset: number;
  phaserSweep: number;
  lpCutoff: number;
  lpCutoffSweep: number;
  lpResonance: number;
  hpCutoff: number;
  hpCutoffSweep: number;
  volume: number;
}

export type SfxNumericParam = Exclude<keyof SfxParams, 'wave'>;

/** A sound effect made from sfxr parameters. */
export interface SfxSound {
  kind: 'sfx';
  name: string;
  params: SfxParams;
}

/**
 * A recorded sound (from a Scratch import, for now): mono 16-bit PCM, little-endian, base64. Kept
 * as plain PCM rather than WAV or MP3 so decoding is pure and players need no codec.
 */
export interface SampleSound {
  kind: 'sample';
  name: string;
  /** Samples per second, at most MAX_SAMPLE_RATE. */
  rate: number;
  data: string;
}

/** A named sound in the cart. */
export type Sound = SfxSound | SampleSound;

/** Highest rate a recorded sound is stored at; faster sources are resampled down. */
export const MAX_SAMPLE_RATE = 48000;

/** Slider metadata, in editor order. */
export const SFX_PARAMS: readonly {
  key: SfxNumericParam;
  label: string;
  group: string;
  signed?: boolean;
}[] = [
  { key: 'attack', label: 'Attack', group: 'Envelope' },
  { key: 'sustain', label: 'Sustain', group: 'Envelope' },
  { key: 'punch', label: 'Punch', group: 'Envelope' },
  { key: 'decay', label: 'Decay', group: 'Envelope' },
  { key: 'freq', label: 'Start pitch', group: 'Pitch' },
  { key: 'freqLimit', label: 'Min pitch', group: 'Pitch' },
  { key: 'slide', label: 'Slide', group: 'Pitch', signed: true },
  { key: 'deltaSlide', label: 'Delta slide', group: 'Pitch', signed: true },
  { key: 'vibDepth', label: 'Vibrato depth', group: 'Vibrato' },
  { key: 'vibSpeed', label: 'Vibrato speed', group: 'Vibrato' },
  { key: 'arpMod', label: 'Change amount', group: 'Arpeggio', signed: true },
  { key: 'arpSpeed', label: 'Change speed', group: 'Arpeggio' },
  { key: 'duty', label: 'Square duty', group: 'Tone' },
  { key: 'dutySweep', label: 'Duty sweep', group: 'Tone', signed: true },
  { key: 'repeatSpeed', label: 'Repeat speed', group: 'Repeat' },
  { key: 'phaserOffset', label: 'Phaser offset', group: 'Phaser', signed: true },
  { key: 'phaserSweep', label: 'Phaser sweep', group: 'Phaser', signed: true },
  { key: 'lpCutoff', label: 'Low-pass cutoff', group: 'Filters' },
  { key: 'lpCutoffSweep', label: 'Low-pass sweep', group: 'Filters', signed: true },
  { key: 'lpResonance', label: 'Low-pass resonance', group: 'Filters' },
  { key: 'hpCutoff', label: 'High-pass cutoff', group: 'Filters' },
  { key: 'hpCutoffSweep', label: 'High-pass sweep', group: 'Filters', signed: true },
  { key: 'volume', label: 'Volume', group: 'Output' },
];

const SIGNED = new Set(SFX_PARAMS.filter((p) => p.signed).map((p) => p.key));

/** sfxr's starting point: a plain square-wave beep. */
export const DEFAULT_SFX: Readonly<SfxParams> = {
  wave: 'square',
  attack: 0,
  sustain: 0.3,
  punch: 0,
  decay: 0.4,
  freq: 0.3,
  freqLimit: 0,
  slide: 0,
  deltaSlide: 0,
  vibDepth: 0,
  vibSpeed: 0,
  arpMod: 0,
  arpSpeed: 0,
  duty: 0,
  dutySweep: 0,
  repeatSpeed: 0,
  phaserOffset: 0,
  phaserSweep: 0,
  lpCutoff: 1,
  lpCutoffSweep: 0,
  lpResonance: 0,
  hpCutoff: 0,
  hpCutoffSweep: 0,
  volume: 0.5,
};

/** Fills missing fields and clamps every value into its range. */
export function normalizeSfx(input: unknown): SfxParams {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: SfxParams = { ...DEFAULT_SFX };
  out.wave = SFX_WAVES.includes(p.wave as SfxWave) ? (p.wave as SfxWave) : DEFAULT_SFX.wave;
  for (const { key } of SFX_PARAMS) {
    const v = p[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = clampParam(key, v);
  }
  return out;
}

function clampParam(key: SfxNumericParam, v: number): number {
  return Math.max(SIGNED.has(key) ? -1 : 0, Math.min(1, v));
}

export function clampSfx(p: SfxParams): SfxParams {
  for (const { key } of SFX_PARAMS) p[key] = clampParam(key, p[key]);
  return p;
}

export type SfxPreset = 'coin' | 'laser' | 'explosion' | 'powerup' | 'hit' | 'jump' | 'blip';
export const SFX_PRESETS: readonly SfxPreset[] = [
  'coin',
  'laser',
  'explosion',
  'powerup',
  'hit',
  'jump',
  'blip',
];

/** Seeded so a preset button can be tested; the editor passes a fresh seed per click. */
export function sfxRandom(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Float in [0, r). */
  const frnd = (r: number) => next() * r;
  /** Integer in 0..n inclusive, like sfxr's rnd(). */
  const rnd = (n: number) => Math.floor(next() * (n + 1));
  return { next, frnd, rnd };
}

/** One of sfxr's generators, re-expressed over SfxParams. */
export function sfxPreset(kind: SfxPreset, seed: number): SfxParams {
  const { frnd, rnd } = sfxRandom(seed);
  const p: SfxParams = { ...DEFAULT_SFX };
  const waveOf = (i: number) => SFX_WAVES[i] ?? 'square';
  switch (kind) {
    case 'coin':
      p.freq = 0.4 + frnd(0.5);
      p.attack = 0;
      p.sustain = frnd(0.1);
      p.decay = 0.1 + frnd(0.4);
      p.punch = 0.3 + frnd(0.3);
      if (rnd(1)) {
        p.arpSpeed = 0.5 + frnd(0.2);
        p.arpMod = 0.2 + frnd(0.4);
      }
      break;
    case 'laser': {
      let w = rnd(2);
      if (w === 2 && rnd(1)) w = rnd(1);
      p.wave = waveOf(w);
      p.freq = 0.5 + frnd(0.5);
      p.freqLimit = Math.max(0.2, p.freq - 0.2 - frnd(0.6));
      p.slide = -0.15 - frnd(0.2);
      if (rnd(2) === 0) {
        p.freq = 0.3 + frnd(0.6);
        p.freqLimit = frnd(0.1);
        p.slide = -0.35 - frnd(0.3);
      }
      if (rnd(1)) {
        p.duty = frnd(0.5);
        p.dutySweep = frnd(0.2);
      } else {
        p.duty = 0.4 + frnd(0.5);
        p.dutySweep = -frnd(0.7);
      }
      p.sustain = 0.1 + frnd(0.2);
      p.decay = frnd(0.4);
      if (rnd(1)) p.punch = frnd(0.3);
      if (rnd(2) === 0) {
        p.phaserOffset = frnd(0.2);
        p.phaserSweep = -frnd(0.2);
      }
      if (rnd(1)) p.hpCutoff = frnd(0.3);
      break;
    }
    case 'explosion':
      p.wave = 'noise';
      if (rnd(1)) {
        p.freq = 0.1 + frnd(0.4);
        p.slide = -0.1 + frnd(0.4);
      } else {
        p.freq = 0.2 + frnd(0.7);
        p.slide = -0.2 - frnd(0.2);
      }
      p.freq *= p.freq;
      if (rnd(4) === 0) p.slide = 0;
      if (rnd(2) === 0) p.repeatSpeed = 0.3 + frnd(0.5);
      p.sustain = 0.1 + frnd(0.3);
      p.decay = frnd(0.5);
      if (rnd(1) === 0) {
        p.phaserOffset = -0.3 + frnd(0.9);
        p.phaserSweep = -frnd(0.3);
      }
      p.punch = 0.2 + frnd(0.6);
      if (rnd(1)) {
        p.vibDepth = frnd(0.7);
        p.vibSpeed = frnd(0.6);
      }
      if (rnd(2) === 0) {
        p.arpSpeed = 0.6 + frnd(0.3);
        p.arpMod = 0.8 - frnd(1.6);
      }
      break;
    case 'powerup':
      if (rnd(1)) p.wave = 'saw';
      else p.duty = frnd(0.6);
      p.freq = 0.2 + frnd(0.3);
      if (rnd(1)) {
        p.slide = 0.1 + frnd(0.4);
        p.repeatSpeed = 0.4 + frnd(0.4);
      } else {
        p.slide = 0.05 + frnd(0.2);
        if (rnd(1)) {
          p.vibDepth = frnd(0.7);
          p.vibSpeed = frnd(0.6);
        }
      }
      p.sustain = frnd(0.4);
      p.decay = 0.1 + frnd(0.4);
      break;
    case 'hit': {
      const w = rnd(2);
      p.wave = w === 2 ? 'noise' : waveOf(w);
      if (p.wave === 'square') p.duty = frnd(0.6);
      p.freq = 0.2 + frnd(0.6);
      p.slide = -0.3 - frnd(0.4);
      p.sustain = frnd(0.1);
      p.decay = 0.1 + frnd(0.2);
      if (rnd(1)) p.hpCutoff = frnd(0.3);
      break;
    }
    case 'jump':
      p.duty = frnd(0.6);
      p.freq = 0.3 + frnd(0.3);
      p.slide = 0.1 + frnd(0.2);
      p.sustain = 0.1 + frnd(0.3);
      p.decay = 0.1 + frnd(0.2);
      if (rnd(1)) p.hpCutoff = frnd(0.3);
      if (rnd(1)) p.lpCutoff = 1 - frnd(0.6);
      break;
    case 'blip':
      p.wave = waveOf(rnd(1));
      if (p.wave === 'square') p.duty = frnd(0.6);
      p.freq = 0.2 + frnd(0.4);
      p.sustain = 0.1 + frnd(0.1);
      p.decay = frnd(0.2);
      p.hpCutoff = 0.1;
      break;
  }
  return clampSfx(p);
}

/** sfxr's "randomize": anything goes, nudged towards audible results. */
export function sfxRandomize(seed: number): SfxParams {
  const { frnd, rnd } = sfxRandom(seed);
  const sym = () => frnd(2) - 1;
  const p: SfxParams = { ...DEFAULT_SFX, wave: SFX_WAVES[rnd(3)] ?? 'square' };
  p.freq = rnd(1) ? sym() ** 3 + 0.5 : sym() ** 2;
  p.slide = sym() ** 5;
  if (p.freq > 0.7 && p.slide > 0.2) p.slide = -p.slide;
  if (p.freq < 0.2 && p.slide < -0.05) p.slide = -p.slide;
  p.deltaSlide = sym() ** 3;
  p.duty = sym();
  p.dutySweep = sym() ** 3;
  p.vibDepth = sym() ** 3;
  p.vibSpeed = sym();
  p.attack = sym() ** 3;
  p.sustain = sym() ** 2;
  p.decay = sym();
  p.punch = frnd(0.8) ** 2;
  if (p.attack + p.sustain + p.decay < 0.2) {
    p.sustain += 0.2 + frnd(0.3);
    p.decay += 0.2 + frnd(0.3);
  }
  p.lpResonance = sym();
  p.lpCutoff = 1 - frnd(1) ** 3;
  p.lpCutoffSweep = sym() ** 3;
  if (p.lpCutoff < 0.1 && p.lpCutoffSweep < -0.05) p.lpCutoffSweep = -p.lpCutoffSweep;
  p.hpCutoff = frnd(1) ** 5;
  p.hpCutoffSweep = sym() ** 5;
  p.phaserOffset = sym() ** 3;
  p.phaserSweep = sym() ** 3;
  p.repeatSpeed = sym();
  p.arpSpeed = sym();
  p.arpMod = sym();
  return clampSfx(p);
}

/** sfxr's "mutate": nudges about half the parameters by up to ±0.05. */
export function sfxMutate(params: SfxParams, seed: number): SfxParams {
  const { frnd, rnd } = sfxRandom(seed);
  const p = { ...params };
  for (const { key } of SFX_PARAMS) {
    if (key === 'volume') continue;
    if (rnd(1)) p[key] += frnd(0.1) - 0.05;
  }
  return clampSfx(p);
}
