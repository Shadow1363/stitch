/**
 * Turns cart sound sources into samples: sfxr sound effects, recorded sounds and tracker songs. Pure and
 * deterministic (noise is seeded), so the editor, the stage and exported players all hear the
 * same thing and tests can compare buffers in Node.
 */
import {
  MAX_VOL,
  NOTE_OFF,
  ROWS_PER_BEAT,
  TICKS_PER_ROW,
  type Instrument,
  type Music,
  type Song,
} from './music';
import { decodePcm } from './sample';
import { sfxRandom, type SfxParams, type Sound } from './sfx';

/** sfxr's own rate; its parameters are tuned in samples at this rate. */
export const SFX_RATE = 44100;
export const MUSIC_RATE = 44100;
/** Longest song rendered, so a runaway order can't eat memory. */
export const MAX_SONG_SECONDS = 180;

/** A sound as mono samples at their own rate: rendered for sfx, decoded for recordings. */
export function soundPcm(s: Sound): { rate: number; samples: Float32Array } {
  return s.kind === 'sample'
    ? { rate: s.rate, samples: decodePcm(s.data) }
    : { rate: SFX_RATE, samples: renderSfx(s.params) };
}

/**
 * An independent implementation of the synth in DrPetter's sfxr (MIT): square/saw/sine/noise
 * with 8x supersampling, pitch slide, vibrato, arpeggio, duty sweep, repeat, phaser and
 * low/high-pass filters.
 */
export function renderSfx(p: SfxParams): Float32Array {
  const rand = sfxRandom(1);
  const noise = new Float32Array(32);
  const refillNoise = () => {
    for (let i = 0; i < 32; i++) noise[i] = rand.frnd(2) - 1;
  };
  const phaser = new Float32Array(1024);
  const waveType = ['square', 'saw', 'sine', 'noise'].indexOf(p.wave);

  // Pitch state, reset on every repeat.
  let fperiod = 0;
  let fmaxperiod = 0;
  let fslide = 0;
  let fdslide = 0;
  let squareDuty = 0;
  let squareSlide = 0;
  let arpMod = 0;
  let arpTime = 0;
  let arpLimit = 0;
  const resetPitch = () => {
    fperiod = 100 / (p.freq * p.freq + 0.001);
    fmaxperiod = 100 / (p.freqLimit * p.freqLimit + 0.001);
    fslide = 1 - p.slide ** 3 * 0.01;
    fdslide = -(p.deltaSlide ** 3) * 0.000001;
    squareDuty = 0.5 - p.duty * 0.5;
    squareSlide = -p.dutySweep * 0.00005;
    arpMod = p.arpMod >= 0 ? 1 - p.arpMod ** 2 * 0.9 : 1 + p.arpMod ** 2 * 10;
    arpTime = 0;
    arpLimit = p.arpSpeed === 1 ? 0 : Math.floor((1 - p.arpSpeed) ** 2 * 20000 + 32);
  };
  resetPitch();

  let fltp = 0;
  let fltdp = 0;
  let fltw = p.lpCutoff ** 3 * 0.1;
  const fltwD = 1 + p.lpCutoffSweep * 0.0001;
  const fltdmp = Math.min(0.8, (5 / (1 + p.lpResonance ** 2 * 20)) * (0.01 + fltw));
  let fltphp = 0;
  let flthp = p.hpCutoff ** 2 * 0.1;
  const flthpD = 1 + p.hpCutoffSweep * 0.0003;
  let vibPhase = 0;
  const vibSpeed = p.vibSpeed ** 2 * 0.01;
  const vibAmp = p.vibDepth * 0.5;
  const envLength = [
    Math.floor(p.attack * p.attack * 100000),
    Math.floor(p.sustain * p.sustain * 100000),
    Math.floor(p.decay * p.decay * 100000),
  ];
  let fphase = p.phaserOffset ** 2 * 1020 * Math.sign(p.phaserOffset);
  const fdphase = p.phaserSweep ** 2 * Math.sign(p.phaserSweep);
  let iphase = Math.abs(Math.trunc(fphase));
  let ipp = 0;
  refillNoise();
  let repTime = 0;
  const repLimit = p.repeatSpeed === 0 ? 0 : Math.floor((1 - p.repeatSpeed) ** 2 * 20000 + 32);

  const out = new Float32Array(envLength[0]! + envLength[1]! + envLength[2]! + 3);
  let envStage = 0;
  let envTime = 0;
  let envVol = 0;
  let phase = 0;
  let n = 0;
  // sfxr scales by a tiny master volume and boosts on export; this is that net gain.
  const gain = p.volume;
  for (; n < out.length; n++) {
    if (repLimit !== 0 && ++repTime >= repLimit) {
      repTime = 0;
      resetPitch();
    }
    if (arpLimit !== 0 && ++arpTime >= arpLimit) {
      arpLimit = 0;
      fperiod *= arpMod;
    }
    fslide += fdslide;
    fperiod *= fslide;
    if (fperiod > fmaxperiod) {
      fperiod = fmaxperiod;
      if (p.freqLimit > 0) break;
    }
    let rfperiod = fperiod;
    if (vibAmp > 0) {
      vibPhase += vibSpeed;
      rfperiod = fperiod * (1 + Math.sin(vibPhase) * vibAmp);
    }
    const period = Math.max(8, Math.trunc(rfperiod));
    squareDuty = Math.max(0, Math.min(0.5, squareDuty + squareSlide));

    if (++envTime > envLength[envStage]!) {
      envTime = 0;
      if (++envStage === 3) break;
    }
    const len = envLength[envStage]!;
    if (envStage === 0) envVol = len ? envTime / len : 1;
    else if (envStage === 1) envVol = 1 + (len ? 1 - envTime / len : 0) * 2 * p.punch;
    else envVol = len ? 1 - envTime / len : 0;

    fphase += fdphase;
    iphase = Math.min(1023, Math.abs(Math.trunc(fphase)));
    if (flthpD !== 0) flthp = Math.max(0.00001, Math.min(0.1, flthp * flthpD));

    let ssample = 0;
    for (let si = 0; si < 8; si++) {
      let sample = 0;
      if (++phase >= period) {
        phase %= period;
        if (waveType === 3) refillNoise();
      }
      const fp = phase / period;
      if (waveType === 0) sample = fp < squareDuty ? 0.5 : -0.5;
      else if (waveType === 1) sample = 1 - fp * 2;
      else if (waveType === 2) sample = Math.sin(fp * 2 * Math.PI);
      else sample = noise[Math.floor((phase * 32) / period)]!;

      const pp = fltp;
      fltw = Math.max(0, Math.min(0.1, fltw * fltwD));
      if (p.lpCutoff !== 1) {
        fltdp += (sample - fltp) * fltw;
        fltdp -= fltdp * fltdmp;
      } else {
        fltp = sample;
        fltdp = 0;
      }
      fltp += fltdp;
      fltphp += fltp - pp;
      fltphp -= fltphp * flthp;
      sample = fltphp;

      phaser[ipp & 1023] = sample;
      sample += phaser[(ipp - iphase + 1024) & 1023]!;
      ipp = (ipp + 1) & 1023;
      ssample += sample * envVol;
    }
    out[n] = Math.max(-1, Math.min(1, (ssample / 8) * gain));
  }
  return out.subarray(0, n);
}

/** Seconds a sound effect lasts, which is what `play_sound_wait` waits for. */
export function sfxSeconds(p: SfxParams): number {
  return renderSfx(p).length / SFX_RATE;
}

export interface SongRenderOptions {
  rate?: number;
  /** Start here instead of at the top (the tracker's "play from cursor"). */
  from?: { order: number; row: number };
}

interface Voice {
  inst: Instrument | undefined;
  note: number;
  /** Pitch offset in semitones from slides. */
  bend: number;
  vol: number;
  phase: number;
  /** Envelope: seconds since note-on, and level when the release started. */
  age: number;
  releasedAt: number;
  releaseFrom: number;
  on: boolean;
  noiseValue: number;
  fx: string;
  /** Effect tick counter within the row; vibrato phase. */
  tick: number;
  vibPhase: number;
}

const freqOf = (note: number) => 440 * 2 ** ((note - 69) / 12);

/**
 * Renders a song to mono samples. Rows are sixteenth notes at `song.bpm`. Without `loop`, the
 * last notes ring out for their release time; with it, the buffer ends exactly on the bar so it
 * can be looped seamlessly.
 */
export function renderSong(
  music: Music,
  song: Song,
  sounds: Record<string, Sound>,
  opts: SongRenderOptions = {},
): Float32Array {
  const rate = opts.rate ?? MUSIC_RATE;
  // Fractional, so tempo stays exact; rows start on the nearest sample.
  const rowSamples = (rate * 60) / (song.bpm * ROWS_PER_BEAT);
  const tickSamples = rowSamples / TICKS_PER_ROW;
  const rows: { order: number; row: number }[] = [];
  song.order.forEach((pid, order) => {
    const pat = music.patterns[pid];
    if (!pat) return;
    for (let row = 0; row < pat.rows; row++) rows.push({ order, row });
  });
  const start = opts.from
    ? Math.max(
        0,
        rows.findIndex((r) => r.order === opts.from!.order && r.row >= opts.from!.row),
      )
    : 0;
  const played = rows.slice(start);
  const tail = song.loop
    ? 0
    : Math.max(0, ...Object.values(music.instruments).map((i) => i.release));
  const total = Math.min(
    rate * MAX_SONG_SECONDS,
    Math.round(played.length * rowSamples) + Math.ceil(tail * rate),
  );
  const out = new Float32Array(total);

  const samples = new Map<string, { rate: number; samples: Float32Array }>();
  const sampleFor = (id: string | undefined) => {
    if (!id) return undefined;
    let s = samples.get(id);
    if (!s) {
      const snd = sounds[id];
      if (!snd) return undefined;
      s = soundPcm(snd);
      samples.set(id, s);
    }
    return s;
  };

  const rand = sfxRandom(7);
  const voices: Voice[] = Array.from({ length: music.channels }, () => ({
    inst: undefined,
    note: 60,
    bend: 0,
    vol: MAX_VOL,
    phase: 0,
    age: 0,
    releasedAt: -1,
    releaseFrom: 0,
    on: false,
    noiseValue: 0,
    fx: '',
    tick: 0,
    vibPhase: 0,
  }));

  const envelope = (v: Voice): number => {
    const i = v.inst!;
    let level: number;
    if (v.age < i.attack) level = v.age / i.attack;
    else if (v.age < i.attack + i.decay)
      level = 1 - ((v.age - i.attack) / i.decay) * (1 - i.sustain);
    else level = i.sustain;
    if (v.releasedAt >= 0) {
      const t = v.age - v.releasedAt;
      if (t >= i.release) {
        v.on = false;
        return 0;
      }
      level = v.releaseFrom * (1 - t / i.release);
    }
    if (i.sustain === 0 && v.age >= i.attack + i.decay) v.on = false;
    return level;
  };

  const startRow = (r: { order: number; row: number }) => {
    const pat = music.patterns[song.order[r.order]!]!;
    const cells = pat.cells[r.row] ?? [];
    voices.forEach((v, ch) => {
      const c = cells[ch];
      v.fx = c?.fx ?? '';
      v.tick = 0;
      if (!c) return;
      if (c.inst !== undefined) v.inst = music.instruments[c.inst];
      if (c.note === NOTE_OFF) {
        if (v.on && v.releasedAt < 0 && v.inst) {
          v.releaseFrom = envelope(v);
          v.releasedAt = v.age;
        }
      } else if (c.note !== undefined && v.inst) {
        v.note = c.note;
        v.bend = 0;
        v.phase = 0;
        v.age = 0;
        v.releasedAt = -1;
        v.on = true;
        v.vibPhase = 0;
        if (c.vol === undefined) v.vol = MAX_VOL;
      }
      if (c.vol !== undefined) v.vol = Math.max(0, Math.min(MAX_VOL, c.vol));
    });
  };

  /** Per-tick effect state: the semitone offset applied on top of note + bend. */
  const effectOffset = (v: Voice): number => {
    const code = v.fx[0];
    const x = parseInt(v.fx[1] ?? '0', 16) || 0;
    const y = parseInt(v.fx[2] ?? '0', 16) || 0;
    const xx = x * 16 + y;
    switch (code) {
      case '0':
        return [0, x, y][v.tick % 3]!;
      case '1':
        if (v.tick > 0) v.bend += xx / 16;
        return 0;
      case '2':
        if (v.tick > 0) v.bend -= xx / 16;
        return 0;
      case '4':
        v.vibPhase += x * 0.25;
        return Math.sin(v.vibPhase) * (y / 8);
      case 'A':
        if (v.tick > 0) v.vol = Math.max(0, Math.min(MAX_VOL, v.vol + x - y));
        return 0;
    }
    return 0;
  };

  const offsets = new Float64Array(music.channels);
  let tickIndex = -1;
  for (let n = 0; n < total; n++) {
    const t = Math.floor(n / tickSamples);
    if (t !== tickIndex) {
      tickIndex = t;
      const r = Math.floor(t / TICKS_PER_ROW);
      if (t % TICKS_PER_ROW === 0 && r < played.length) startRow(played[r]!);
      else voices.forEach((v) => v.tick++);
      voices.forEach((v, ch) => (offsets[ch] = effectOffset(v)));
    }
    let mix = 0;
    for (let ch = 0; ch < voices.length; ch++) {
      const v = voices[ch]!;
      if (!v.on || !v.inst) continue;
      const inst = v.inst;
      const env = envelope(v);
      v.age += 1 / rate;
      if (!v.on) continue;
      const note = v.note + v.bend + offsets[ch]!;
      let s = 0;
      if (inst.wave === 'sample') {
        const clip = sampleFor(inst.sound);
        const buf = clip?.samples;
        const i = Math.floor(v.phase);
        if (!clip || !buf || i + 1 >= buf.length) {
          v.on = false;
          continue;
        }
        const f = v.phase - i;
        s = (buf[i]! * (1 - f) + buf[i + 1]! * f) * 2;
        v.phase += (2 ** ((note - 60) / 12) * clip.rate) / rate;
      } else {
        const prev = v.phase;
        v.phase = (v.phase + freqOf(note) / rate) % 1;
        const p = v.phase;
        switch (inst.wave) {
          case 'square':
            s = p < 0.5 ? 1 : -1;
            break;
          case 'pulse':
            s = p < 0.25 ? 1 : -1;
            break;
          case 'triangle':
            s = 4 * Math.abs(p - 0.5) - 1;
            break;
          case 'saw':
            s = 2 * p - 1;
            break;
          case 'sine':
            s = Math.sin(2 * Math.PI * p);
            break;
          case 'noise':
            if (p < prev) v.noiseValue = rand.frnd(2) - 1;
            s = v.noiseValue;
            break;
        }
      }
      mix += s * env * inst.volume * (v.vol / MAX_VOL);
    }
    out[n] = Math.max(-1, Math.min(1, mix * 0.25));
  }
  return out;
}

/** 16-bit mono PCM WAV, for "Export WAV". */
export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
  }
  return bytes;
}
