import { describe, expect, it } from 'vitest';
import {
  encodeWav,
  MUSIC_RATE,
  renderSfx,
  renderSong,
  SFX_RATE,
  sfxSeconds,
  soundPcm,
} from './audio';
import { emptyMusic, emptyPattern, NOTE_OFF, starterInstruments, type Music } from './music';
import { sampleSound } from './sample';
import {
  DEFAULT_SFX,
  SFX_PARAMS,
  SFX_PRESETS,
  sfxMutate,
  sfxPreset,
  sfxRandomize,
  type SfxParams,
} from './sfx';

const hash = (a: Float32Array) => {
  let h = 2166136261;
  const u = new Uint32Array(a.buffer, a.byteOffset, a.length);
  for (const x of u) h = Math.imul(h ^ x, 16777619) >>> 0;
  return h;
};

const inRange = (p: SfxParams) =>
  SFX_PARAMS.every(({ key, signed }) => p[key] >= (signed ? -1 : 0) && p[key] <= 1);

describe('sfx synth', () => {
  it('renders the same samples for the same parameters', () => {
    for (const kind of SFX_PRESETS) {
      const p = sfxPreset(kind, 1234);
      expect(hash(renderSfx(p))).toBe(hash(renderSfx({ ...p })));
    }
  });

  it('seeds noise, so explosions are reproducible too', () => {
    const p = { ...sfxPreset('explosion', 5), wave: 'noise' as const };
    const a = renderSfx(p);
    expect(a.length).toBeGreaterThan(1000);
    expect(hash(a)).toBe(hash(renderSfx(p)));
  });

  it('lasts as long as the envelope', () => {
    const p = { ...DEFAULT_SFX, attack: 0.1, sustain: 0.2, decay: 0.3 };
    const expected = (0.01 + 0.04 + 0.09) * 100000;
    expect(Math.abs(renderSfx(p).length - expected)).toBeLessThan(5);
    expect(sfxSeconds(p)).toBeCloseTo(expected / SFX_RATE, 3);
  });

  it('stops early when a falling pitch hits the limit', () => {
    const p = { ...DEFAULT_SFX, freq: 0.5, slide: -0.5, freqLimit: 0.3, sustain: 1, decay: 1 };
    expect(renderSfx(p).length).toBeLessThan(renderSfx({ ...p, freqLimit: 0 }).length / 4);
  });

  it('is audible and never clips past full scale', () => {
    for (const kind of SFX_PRESETS) {
      const s = renderSfx(sfxPreset(kind, 99));
      let peak = 0;
      for (const v of s) peak = Math.max(peak, Math.abs(v));
      expect(peak, kind).toBeGreaterThan(0.01);
      expect(peak, kind).toBeLessThanOrEqual(1);
    }
  });

  it('keeps presets, randomize and mutate inside parameter ranges', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const kind of SFX_PRESETS) expect(inRange(sfxPreset(kind, seed))).toBe(true);
      expect(inRange(sfxRandomize(seed))).toBe(true);
      expect(inRange(sfxMutate(sfxRandomize(seed), seed + 1))).toBe(true);
    }
    expect(sfxPreset('coin', 3)).toEqual(sfxPreset('coin', 3));
  });
});

describe('wav', () => {
  it('writes a 16-bit mono PCM header and samples', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), 22050);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE');
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint32(40, true)).toBe(6);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)]).toEqual([
      0, 32767, -32768,
    ]);
  });
});

function tune(): Music {
  const m = emptyMusic();
  m.instruments = starterInstruments();
  const p = emptyPattern('A', m.channels, 8);
  p.cells[0]![0] = { note: 60, inst: 'i1' };
  p.cells[2]![0] = { note: NOTE_OFF };
  p.cells[4]![1] = { note: 48, inst: 'i2', fx: '037' };
  m.patterns.p1 = p;
  m.songs.s1 = { name: 'theme', bpm: 120, order: ['p1', 'p1'], loop: true };
  return m;
}

describe('soundPcm', () => {
  it('renders sound effects at the sfxr rate', () => {
    const p = sfxPreset('coin', 1);
    const pcm = soundPcm({ kind: 'sfx', name: 'c', params: p });
    expect(pcm.rate).toBe(SFX_RATE);
    expect(hash(pcm.samples)).toBe(hash(renderSfx(p)));
  });

  it('decodes recordings at their own rate', () => {
    const pcm = soundPcm(sampleSound('r', Float32Array.of(0, 0.5, -0.5), 16000));
    expect(pcm.rate).toBe(16000);
    expect([...pcm.samples].map((v) => Math.round(v * 100) / 100)).toEqual([0, 0.5, -0.5]);
  });
});

describe('song renderer', () => {
  it('is deterministic', () => {
    const m = tune();
    expect(hash(renderSong(m, m.songs.s1!, {}))).toBe(hash(renderSong(m, m.songs.s1!, {})));
  });

  it('lasts exactly the rows when looping, plus the release tail when not', () => {
    const m = tune();
    const row = (MUSIC_RATE * 60) / (120 * 4);
    expect(renderSong(m, m.songs.s1!, {}).length).toBe(16 * row);
    const once = renderSong(m, { ...m.songs.s1!, loop: false }, {});
    expect(once.length).toBe(16 * row + Math.ceil(0.3 * MUSIC_RATE));
  });

  it('is silent where no note plays, and sounds where one does', () => {
    const m = tune();
    const s = renderSong(m, m.songs.s1!, {});
    const row = (MUSIC_RATE * 60) / (120 * 4);
    const energy = (from: number, to: number) => {
      let e = 0;
      for (let i = Math.floor(from * row); i < Math.floor(to * row); i++) e += s[i]! ** 2;
      return e;
    };
    expect(energy(0, 1)).toBeGreaterThan(1);
    expect(energy(3.5, 4)).toBe(0); // lead released at row 2 (0.1 s), bass not started
    expect(energy(4, 5)).toBeGreaterThan(1);
  });

  it('plays from a cursor', () => {
    const m = tune();
    const row = (MUSIC_RATE * 60) / (120 * 4);
    const from = renderSong(m, m.songs.s1!, {}, { from: { order: 1, row: 4 } });
    expect(from.length).toBe(4 * row);
  });

  it('plays sample instruments from cart sounds', () => {
    const m = tune();
    m.instruments.i5 = { ...m.instruments.i1!, wave: 'sample', sound: 'snd' };
    m.patterns.p1!.cells[0]![0] = { note: 60, inst: 'i5' };
    const silent = renderSong(m, m.songs.s1!, {});
    const sounds = { snd: { kind: 'sfx' as const, name: 'snd', params: sfxPreset('coin', 1) } };
    const withSample = renderSong(m, m.songs.s1!, sounds);
    expect(hash(withSample)).not.toBe(hash(silent));
  });

  it('plays recorded sounds as instruments at their own rate', () => {
    const m = tune();
    m.instruments.i5 = { ...m.instruments.i1!, wave: 'sample', sound: 'rec', release: 0 };
    m.patterns.p1!.cells[0]![0] = { note: 60, inst: 'i5' };
    // A 100 ms tone at half the music rate still lasts 100 ms at C-4.
    const tone = Float32Array.from({ length: 2205 }, (_, i) => Math.sin(i / 3) * 0.5);
    const out = renderSong(m, m.songs.s1!, { rec: sampleSound('rec', tone, 22050) });
    let last = 0;
    for (let i = 0; i < MUSIC_RATE / 4; i++) if (out[i] !== 0) last = i;
    expect(last / MUSIC_RATE).toBeCloseTo(0.1, 2);
  });
});
