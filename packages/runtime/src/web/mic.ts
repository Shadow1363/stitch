/**
 * The microphone level behind `loudness`. The sandboxed stage never opens the microphone: the
 * editor (after asking) and exported players measure it in their own page and pass the level
 * on, so the sandbox stays as it is (D34).
 */
import { micLevel } from '../core/audio';

/** Whether compiled code reads the loudness (the reporter or the `on loudness >` hat). */
export function usesLoudness(code: string): boolean {
  return /\bB\.loudness\(|rt\.on\(S, "loudness"/.test(code);
}

export class Microphone {
  private last = 0;
  private buf: Float32Array<ArrayBuffer>;

  private constructor(
    private ctx: AudioContext,
    private stream: MediaStream,
    private analyser: AnalyserNode,
  ) {
    this.buf = new Float32Array(analyser.fftSize);
  }

  /** Opens the default microphone, or undefined when there's none or the user says no. */
  static async open(): Promise<Microphone | undefined> {
    if (!navigator.mediaDevices?.getUserMedia) return undefined;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      return new Microphone(ctx, stream, analyser);
    } catch {
      return undefined;
    }
  }

  /** The level now, 0–100, smoothed as Scratch does. */
  level(): number {
    this.analyser.getFloatTimeDomainData(this.buf);
    const r = micLevel(this.buf, this.last);
    this.last = r.smoothed;
    return r.level;
  }

  close(): void {
    for (const t of this.stream.getTracks()) t.stop();
    void this.ctx.close().catch(() => {});
  }
}

/** Calls `send` with the level once a frame until the returned function is called. */
export function streamLevel(mic: Microphone, send: (level: number) => void): () => void {
  let frame = 0;
  const step = () => {
    send(mic.level());
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}
