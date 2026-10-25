/** Where sound goes. The stage uses Web Audio (web/audio.ts); tests use NullAudio. */
export interface AudioOut {
  /** `voice`: the sprite playing it and its sound effects, which it keeps until it ends. */
  playSound(id: string, voice?: Voice): void;
  /** Applies a sprite's new sound effects to the sounds it's playing (as Scratch). */
  setSoundEffects?(owner: string, fx: { pitch: number; pan: number }): void;
  stopSounds(): void;
  playMusic(id: string): void;
  stopMusic(): void;
  /** 0..1, applies to sounds and music. */
  setVolume(v: number): void;
}

export interface Voice {
  /** The playing sprite's handle (its name, or a clone's id). */
  owner: string;
  pitch: number;
  pan: number;
}

/** Playback rate for a pitch effect: 10 is a semitone, clamped to ±360 as in Scratch. */
export function pitchRate(pitch: number): number {
  return 2 ** (Math.max(-360, Math.min(360, pitch)) / 120);
}

/**
 * Scratch's loudness from one buffer of microphone samples (scratch-audio's getLoudness): the
 * RMS, held up by 60% of the last value so it falls smoothly, then curved and scaled to 0–100.
 * Returns the level and the smoothed RMS to pass back next time.
 */
export function micLevel(
  samples: ArrayLike<number>,
  last: number,
): { level: number; smoothed: number } {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! ** 2;
  const rms = Math.max(Math.sqrt(sum / Math.max(1, samples.length)), last * 0.6);
  const level = Math.min(100, Math.round(Math.sqrt(rms * 1.63) * 100));
  return { level, smoothed: rms };
}

/** A sound scripts can name. `seconds` is its rendered length, so waits need no audio clock. */
export interface SoundInfo {
  id: string;
  name: string;
  seconds: number;
}

export interface SongInfo {
  id: string;
  name: string;
}

/** Records calls, for tests and for running without audio. */
export class NullAudio implements AudioOut {
  readonly calls: string[] = [];
  playSound(id: string, voice?: Voice): void {
    this.calls.push(
      voice && (voice.pitch || voice.pan)
        ? `sound ${id} pitch ${voice.pitch} pan ${voice.pan}`
        : `sound ${id}`,
    );
  }
  setSoundEffects(owner: string, fx: { pitch: number; pan: number }): void {
    this.calls.push(`effects ${owner} pitch ${fx.pitch} pan ${fx.pan}`);
  }
  stopSounds(): void {
    this.calls.push('stop sounds');
  }
  playMusic(id: string): void {
    this.calls.push(`music ${id}`);
  }
  stopMusic(): void {
    this.calls.push('stop music');
  }
  setVolume(v: number): void {
    this.calls.push(`volume ${v}`);
  }
}

/** By name first, then as a 1-based number in cart order (like costumes). */
export function findByNameOrNumber<T extends { name: string }>(
  list: readonly T[],
  key: unknown,
): T | undefined {
  if (typeof key === 'string') {
    const hit = list.find((x) => x.name === key);
    if (hit) return hit;
    if (key.trim() === '' || Number.isNaN(Number(key))) return undefined;
  }
  if (typeof key !== 'number' && typeof key !== 'string') return undefined;
  const i = Math.round(Number(key)) - 1;
  return list[i];
}
