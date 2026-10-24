/** Where sound goes. The stage uses Web Audio (web/audio.ts); tests use NullAudio. */
export interface AudioOut {
  playSound(id: string): void;
  stopSounds(): void;
  playMusic(id: string): void;
  stopMusic(): void;
  /** 0..1, applies to sounds and music. */
  setVolume(v: number): void;
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
  playSound(id: string): void {
    this.calls.push(`sound ${id}`);
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
