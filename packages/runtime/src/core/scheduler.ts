import type { Sprite } from './sprite';

export type ThreadGen = Generator<unknown, unknown, unknown>;
export type EventType = 'start' | 'key' | 'message';

export interface Script {
  sprite: Sprite;
  event: EventType;
  /** Key name or message name; null for start. */
  arg: string | null;
  body: () => ThreadGen;
}

export interface Thread {
  readonly script: Script;
  gen: ThreadGen;
  /** pending: starts on the next tick. */
  state: 'pending' | 'running' | 'done';
}

/** Thrown by `stop()` to end the current thread. */
export const STOP_THREAD: unique symbol = Symbol('stop thread');

export interface ThreadError {
  script: Script;
  error: unknown;
}

/**
 * Green threads over generators. Each tick, every running thread advances to its next `yield`.
 * Threads started during a tick (broadcasts, key presses) begin on the following tick, so the
 * order never depends on where the triggering thread sits in the list.
 */
export class Scheduler {
  readonly scripts: Script[] = [];
  threads: Thread[] = [];
  /** The thread being stepped, if any. */
  current: Thread | null = null;

  constructor(private onError: (e: ThreadError) => void = () => {}) {}

  add(script: Script): void {
    this.scripts.push(script);
  }

  /**
   * Starts every script listening for (event, arg), in registration order.
   * restart: a script that is already running starts over in place (broadcast semantics);
   * otherwise it is left alone (key semantics).
   */
  trigger(event: EventType, arg: string | null, restart: boolean): Thread[] {
    const started: Thread[] = [];
    for (const script of this.scripts) {
      if (script.event !== event || script.arg !== arg) continue;
      const existing = this.threads.find((t) => t.script === script && t.state !== 'done');
      if (existing) {
        if (!restart) continue;
        existing.gen = script.body();
        existing.state = 'pending';
        started.push(existing);
        continue;
      }
      const t: Thread = { script, gen: script.body(), state: 'pending' };
      this.threads.push(t);
      started.push(t);
    }
    return started;
  }

  step(): void {
    const batch = this.threads;
    for (const t of batch) if (t.state === 'pending') t.state = 'running';
    for (const t of batch.slice()) {
      if (t.state !== 'running') continue;
      const gen = t.gen;
      this.current = t;
      try {
        const r = gen.next();
        if (t.gen !== gen) continue; // restarted itself (e.g. broadcast to its own message)
        if (r.done) t.state = 'done';
      } catch (error) {
        if (t.gen !== gen) continue;
        t.state = 'done';
        if (error !== STOP_THREAD) this.onError({ script: t.script, error });
      }
    }
    this.current = null;
    if (this.threads.some((t) => t.state === 'done'))
      this.threads = this.threads.filter((t) => t.state !== 'done');
  }

  stopAll(): void {
    for (const t of this.threads) t.state = 'done';
    this.threads = [];
  }

  get activeCount(): number {
    return this.threads.length;
  }
}
