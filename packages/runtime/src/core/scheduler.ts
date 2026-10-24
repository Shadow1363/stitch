import type { Sprite } from './sprite';

export type ThreadGen = Generator<unknown, unknown, unknown>;
export type EventType = 'start' | 'key' | 'message' | 'clone' | 'click';

export interface Script {
  sprite: Sprite;
  event: EventType;
  /** Key name or message name; null for the other events. */
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
  /** Scripts by event and argument, in registration order. */
  private byEvent = new Map<string, Script[]>();
  /** Each script's most recent thread, so triggers don't search every thread. */
  private latest = new Map<Script, Thread>();
  threads: Thread[] = [];
  /** The thread being stepped, if any. */
  current: Thread | null = null;

  constructor(private onError: (e: ThreadError) => void = () => {}) {}

  add(script: Script): void {
    const k = key(script.event, script.arg);
    const list = this.byEvent.get(k);
    if (list) list.push(script);
    else this.byEvent.set(k, [script]);
  }

  /** Every script, in registration order within each event. */
  get scripts(): Script[] {
    return [...this.byEvent.values()].flat();
  }

  /** Drops a deleted clone's scripts and ends its threads. */
  removeSprite(sprite: Sprite): void {
    for (const [k, list] of this.byEvent) {
      const keep = list.filter((s) => s.sprite !== sprite);
      if (keep.length === list.length) continue;
      this.byEvent.set(k, keep);
      for (const s of list) if (s.sprite === sprite) this.latest.delete(s);
    }
    for (const t of this.threads) if (t.script.sprite === sprite) t.state = 'done';
  }

  /** Ends every thread of `sprite` except `keep` (Scratch "stop other scripts in sprite"). */
  stopOthers(sprite: Sprite, keep: Thread | null): void {
    for (const t of this.threads) if (t.script.sprite === sprite && t !== keep) t.state = 'done';
  }

  /**
   * Starts every script listening for (event, arg), in registration order; only `sprite`'s
   * when given. restart: a script that is already running starts over in place (broadcast
   * semantics); otherwise it is left alone (key semantics).
   */
  trigger(event: EventType, arg: string | null, restart: boolean, sprite?: Sprite): Thread[] {
    const started: Thread[] = [];
    for (const script of this.byEvent.get(key(event, arg)) ?? []) {
      if (sprite && script.sprite !== sprite) continue;
      const last = this.latest.get(script);
      const existing = last && last.state !== 'done' ? last : undefined;
      if (existing) {
        if (!restart) continue;
        existing.gen = script.body();
        existing.state = 'pending';
        started.push(existing);
        continue;
      }
      const t: Thread = { script, gen: script.body(), state: 'pending' };
      this.threads.push(t);
      this.latest.set(script, t);
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

const key = (event: EventType, arg: string | null) => (arg === null ? event : `${event}:${arg}`);
