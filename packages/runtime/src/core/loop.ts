export const TICK_MS = 1000 / 60;
/** Most ticks run in one frame; anything beyond is dropped instead of spiralling. */
export const MAX_TICKS_PER_FRAME = 4;
/** Frames this close to one tick count as one tick, so 60 Hz jitter never doubles or skips. */
const SLOP_MS = 1;

export interface LoopHooks {
  tick(): void;
  render(): void;
  /** A frame threw. The loop keeps going; without this hook the error is rethrown. */
  onError?: (error: unknown) => void;
  now?: () => number;
  requestFrame?: (cb: (t: number) => void) => number;
  cancelFrame?: (handle: number) => void;
}

export interface Loop {
  start(): void;
  stop(): void;
  /** Feeds one frame at time `t` (ms). Exposed for tests. */
  frame(t: number): number;
  readonly running: boolean;
  /** Paused: frames still render, but no ticks run, so simulation time stands still. */
  paused: boolean;
}

/** Fixed-timestep loop: simulation at 60 ticks/s, rendering once per animation frame. */
export function createLoop(h: LoopHooks): Loop {
  const raf = h.requestFrame ?? ((cb) => requestAnimationFrame(cb));
  const caf = h.cancelFrame ?? ((id) => cancelAnimationFrame(id));
  let acc = 0;
  let last: number | undefined;
  let handle: number | undefined;
  let paused = false;

  const frame = (t: number): number => {
    const elapsed = last === undefined ? TICK_MS : Math.min(t - last, 250);
    last = t;
    acc += paused ? 0 : elapsed;
    let ticks = 0;
    while (acc >= TICK_MS - SLOP_MS && ticks < MAX_TICKS_PER_FRAME) {
      h.tick();
      acc -= TICK_MS;
      ticks++;
    }
    if (acc >= TICK_MS - SLOP_MS) acc = 0;
    h.render();
    return ticks;
  };

  const loop = (t: number) => {
    // Schedule first, so one bad frame (say, a renderer error) can't stop the game for good.
    handle = raf(loop);
    try {
      frame(t);
    } catch (e) {
      if (!h.onError) throw e;
      h.onError(e);
    }
  };

  return {
    start() {
      if (handle !== undefined) return;
      acc = 0;
      last = undefined;
      handle = raf(loop);
    },
    stop() {
      if (handle !== undefined) caf(handle);
      handle = undefined;
    },
    frame,
    get running() {
      return handle !== undefined;
    },
    get paused() {
      return paused;
    },
    set paused(p: boolean) {
      paused = p;
      acc = 0;
    },
  };
}
