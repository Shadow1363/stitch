/**
 * Web Audio output for the stage. Sounds arrive as rendered samples (the editor renders them
 * from cart sources with @stitch/cart/audio), so nothing here synthesizes or fetches.
 */
import { pitchRate, type AudioOut, type Voice } from '../core/audio';
import type { PcmClip } from '../protocol';

/** Overlapping sounds beyond this stop the oldest, so a fast loop can't pile up voices. */
const MAX_VOICES = 32;

export class WebAudioOut implements AudioOut {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private songs = new Map<string, { buffer: AudioBuffer; loop: boolean }>();
  /** Playing sounds, with the sprite that plays them and its panner (when panned). */
  private voices: { src: AudioBufferSourceNode; owner: string; pan?: StereoPannerNode }[] = [];
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

  playSound(id: string, voice?: Voice): void {
    const buffer = this.buffers.get(id);
    if (!buffer) return;
    if (this.voices.length >= MAX_VOICES) this.voices.shift()?.src.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    // Scratch's pitch effect changes the playback rate, so the sound also gets shorter.
    src.playbackRate.value = pitchRate(voice?.pitch ?? 0);
    const v: (typeof this.voices)[number] = { src, owner: voice?.owner ?? '' };
    // A panner only for panned voices, so plain sounds keep the shortest path.
    if (voice?.pan) {
      v.pan = this.ctx.createStereoPanner();
      v.pan.pan.value = voice.pan / 100;
      src.connect(v.pan).connect(this.master);
    } else src.connect(this.master);
    src.onended = () => (this.voices = this.voices.filter((x) => x !== v));
    this.voices.push(v);
    src.start();
  }

  /** Scratch applies a sprite's new pitch and pan to the sounds it's already playing. */
  setSoundEffects(owner: string, fx: { pitch: number; pan: number }): void {
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      if (v.owner !== owner) continue;
      v.src.playbackRate.setValueAtTime(pitchRate(fx.pitch), t);
      if (!v.pan && fx.pan) {
        v.pan = this.ctx.createStereoPanner();
        v.src.disconnect();
        v.src.connect(v.pan).connect(this.master);
      }
      v.pan?.pan.setValueAtTime(fx.pan / 100, t);
    }
  }

  stopSounds(): void {
    for (const v of this.voices) v.src.stop();
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
