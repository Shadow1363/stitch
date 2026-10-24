/**
 * Web Audio output for the stage. Sounds arrive as rendered samples (the editor renders them
 * from cart sources with @stitch/cart/audio), so nothing here synthesizes or fetches.
 */
import type { AudioOut } from '../core/audio';
import type { PcmClip } from '../protocol';

/** Overlapping sounds beyond this stop the oldest, so a fast loop can't pile up voices. */
const MAX_VOICES = 32;

export class WebAudioOut implements AudioOut {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private songs = new Map<string, { buffer: AudioBuffer; loop: boolean }>();
  private voices: AudioBufferSourceNode[] = [];
  private music: AudioBufferSourceNode | undefined;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
  }

  /** Browsers start contexts suspended until a user gesture; call this from one. */
  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  get state(): AudioContextState {
    return this.ctx.state;
  }

  setClips(sounds: PcmClip[], songs: PcmClip[]): void {
    this.stopSounds();
    this.stopMusic();
    this.buffers = new Map(sounds.map((c) => [c.id, this.toBuffer(c)]));
    this.songs = new Map(
      songs.map((c) => [c.id, { buffer: this.toBuffer(c), loop: c.loop === true }]),
    );
  }

  private toBuffer(c: PcmClip): AudioBuffer {
    const b = this.ctx.createBuffer(1, Math.max(1, c.samples.length), c.rate);
    b.copyToChannel(c.samples as Float32Array<ArrayBuffer>, 0);
    return b;
  }

  playSound(id: string): void {
    const buffer = this.buffers.get(id);
    if (!buffer) return;
    if (this.voices.length >= MAX_VOICES) this.voices.shift()?.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.master);
    src.onended = () => (this.voices = this.voices.filter((v) => v !== src));
    this.voices.push(src);
    src.start();
  }

  stopSounds(): void {
    for (const v of this.voices) v.stop();
    this.voices = [];
  }

  /** One song at a time, as in most trackers' players: starting another replaces it. */
  playMusic(id: string): void {
    const song = this.songs.get(id);
    if (!song) return;
    this.stopMusic();
    const src = this.ctx.createBufferSource();
    src.buffer = song.buffer;
    src.loop = song.loop;
    src.connect(this.master);
    src.start();
    this.music = src;
  }

  stopMusic(): void {
    this.music?.stop();
    this.music = undefined;
  }

  setVolume(v: number): void {
    this.master.gain.setValueAtTime(v, this.ctx.currentTime);
  }
}
