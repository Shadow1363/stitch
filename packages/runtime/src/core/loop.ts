export const TICK_MS = 1000 / 60;
/** Most ticks run in one frame; anything beyond is dropped instead of spiralling. */
export const MAX_TICKS_PER_FRAME = 4;
/** Frames this close to one tick count as one tick, so 60 Hz jitter never doubles or skips. */
const SLOP_MS = 1;

export interface LoopHooks {
  tick(): void;
  render(): void;
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
}

/** Fixed-timestep loop: simulation at 60 ticks/s, rendering once per animation frame. */
export function createLoop(h: LoopHooks): Loop {
  const raf = h.requestFrame ?? ((cb) => requestAnimationFrame(cb));
  const caf = h.cancelFrame ?? ((id) => cancelAnimationFrame(id));
  let acc = 0;
  let last: number | undefined;
  let handle: number | undefined;

  const frame = (t: number): number => {
    const elapsed = last === undefined ? TICK_MS : Math.min(t - last, 250);
    last = t;
    acc += elapsed;
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
    frame(t);
    handle = raf(loop);
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
  };
}
