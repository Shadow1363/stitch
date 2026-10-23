/** Rolling frame statistics, reported a few times per second. */
export class FrameStats {
  private frames = 0;
  private tickMs = 0;
  private renderMs = 0;
  private since = performance.now();
  readonly frameTimes: number[] = [];
  private lastFrame: number | undefined;

  frame(tickMs: number, renderMs: number, now = performance.now()) {
    this.frames++;
    this.tickMs += tickMs;
    this.renderMs += renderMs;
    if (this.lastFrame !== undefined) {
      this.frameTimes.push(now - this.lastFrame);
      if (this.frameTimes.length > 1200) this.frameTimes.shift();
    }
    this.lastFrame = now;
  }

  /** Returns averages since the last call and resets the window. */
  take(now = performance.now()) {
    const secs = (now - this.since) / 1000;
    const n = Math.max(1, this.frames);
    const out = {
      fps: secs > 0 ? this.frames / secs : 0,
      tickMs: this.tickMs / n,
      renderMs: this.renderMs / n,
    };
    this.frames = 0;
    this.tickMs = 0;
    this.renderMs = 0;
    this.since = now;
    return out;
  }

  p95(): number {
    if (!this.frameTimes.length) return 0;
    const sorted = this.frameTimes.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)]!;
  }
}
