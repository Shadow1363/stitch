import type { Music, Song, Sound } from '@stitch/cart';
import { MUSIC_RATE, renderSong, soundPcm } from '@stitch/cart/audio';
import type { PcmClip } from '@stitch/runtime/protocol';

/**
 * Rendered samples by source. Rendering a song takes a moment, and the stage reloads on every
 * edit, so unchanged sources reuse their samples. Cleared when it grows past CACHE_LIMIT.
 */
const cache = new Map<string, unknown>();
const CACHE_LIMIT = 64;

function cached<T>(key: string, render: () => T): T {
  let hit = cache.get(key) as T | undefined;
  if (!hit) {
    if (cache.size >= CACHE_LIMIT) cache.clear();
    hit = render();
    cache.set(key, hit);
  }
  return hit;
}

/** A sound as samples at its own rate. A recording's key is its data, which the Map hashes once. */
export function soundClip(s: Sound): { rate: number; samples: Float32Array } {
  const key =
    s.kind === 'sample' ? `sample:${s.rate}:${s.data}` : `sfx:${JSON.stringify(s.params)}`;
  return cached(key, () => soundPcm(s));
}

/** Sounds a song plays as sample instruments, so they can be part of its cache key. */
function samplesUsed(music: Music, sounds: Record<string, Sound>) {
  const used: Record<string, unknown> = {};
  for (const i of Object.values(music.instruments))
    if (i.wave === 'sample' && i.sound && sounds[i.sound]) {
      const s = sounds[i.sound]!;
      used[i.sound] = s.kind === 'sample' ? s.data : s.params;
    }
  return used;
}

export function songSamples(
  music: Music,
  song: Song,
  sounds: Record<string, Sound>,
  from?: { order: number; row: number },
): Float32Array {
  const key = JSON.stringify([song, from, music, samplesUsed(music, sounds)]);
  return cached(`song:${key}`, () => renderSong(music, song, sounds, from ? { from } : {}));
}

/** Clips for the stage. Copies, because their buffers are transferred to the iframe. */
export function stageClips(
  sounds: Record<string, Sound>,
  music: Music,
): { sounds: PcmClip[]; songs: PcmClip[] } {
  return {
    sounds: Object.entries(sounds).map(([id, s]) => {
      const clip = soundClip(s);
      return { id, name: s.name, rate: clip.rate, samples: clip.samples.slice() };
    }),
    songs: Object.entries(music.songs).map(([id, s]) => ({
      id,
      name: s.name,
      rate: MUSIC_RATE,
      samples: songSamples(music, s, sounds).slice(),
      loop: s.loop,
    })),
  };
}

// ---- preview in the editor page (its own context; the stage has another) ----

let ctx: AudioContext | undefined;
let playing: { src: AudioBufferSourceNode; started: number; rate: number } | undefined;

/** Plays samples, replacing any preview already playing. Call from a click (autoplay rules). */
export function preview(samples: Float32Array, rate: number, onend?: () => void): void {
  ctx ??= new AudioContext();
  void ctx.resume();
  stopPreview();
  const buffer = ctx.createBuffer(1, Math.max(1, samples.length), rate);
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.onended = () => {
    if (playing?.src === src) playing = undefined;
    onend?.();
  };
  src.start();
  playing = { src, started: ctx.currentTime, rate };
}

export function stopPreview(): void {
  const p = playing;
  playing = undefined;
  p?.src.stop();
}

/** Seconds into the preview now playing, or undefined. Drives the tracker's play cursor. */
export function previewTime(): number | undefined {
  return playing && ctx ? ctx.currentTime - playing.started : undefined;
}
