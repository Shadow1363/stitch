import { clampToStage, edgeCrossed, stageBounds } from './bounds';
import { STOP_THREAD } from './scheduler';
import type { Sprite } from './sprite';
import * as $ from './values';
import type { Value } from './values';
import type { World } from './world';

type Fn = (...args: never[]) => unknown;
/** A builtin that takes ticks; compiled code runs it with `yield*`. */
type Waits = Generator<undefined, void, unknown>;

/**
 * Runtime implementations of the builtin catalog (@stitch/ir builtins.ts), keyed by name.
 * Sprite builtins take the calling sprite first. A test keeps this 1:1 with the catalog.
 */
export function createBuiltins(w: World) {
  const space = w.space;
  const lib = {
    // motion
    move(S: Sprite, steps: Value) {
      const d = space.forward(S.direction, $.n(steps));
      S.x += d.dx;
      S.y += d.dy;
    },
    turn(S: Sprite, deg: Value) {
      S.direction = S.direction + $.n(deg);
    },
    goto(S: Sprite, x: Value, y: Value) {
      S.x = $.n(x);
      S.y = $.n(y);
    },
    point(S: Sprite, dir: Value) {
      S.direction = $.n(dir);
    },
    point_towards(S: Sprite, x: Value, y: Value) {
      const dx = $.n(x) - S.x;
      const dy = $.n(y) - S.y;
      if (dx !== 0 || dy !== 0) S.direction = space.directionOf(dx, dy);
    },
    bounce(S: Sprite) {
      const edge = edgeCrossed(S, space);
      if (!edge) return;
      // Reflect in screen space, keeping at least a small push away from the edge (as Scratch).
      const rad = (S.direction * Math.PI) / 180;
      let sx = Math.sin(rad);
      let sy = -Math.cos(rad);
      if (edge === 'left') sx = Math.max(0.2, Math.abs(sx));
      else if (edge === 'right') sx = -Math.max(0.2, Math.abs(sx));
      else if (edge === 'top') sy = Math.max(0.2, Math.abs(sy));
      else sy = -Math.max(0.2, Math.abs(sy));
      S.direction = (Math.atan2(sx, -sy) * 180) / Math.PI;
      clampToStage(S, space);
    },
    clamp_to_stage(S: Sprite) {
      clampToStage(S, space);
    },
    on_edge(S: Sprite): string {
      return edgeCrossed(S, space);
    },
    angle_to(S: Sprite, x: Value, y: Value): number {
      return space.directionOf($.n(x) - S.x, $.n(y) - S.y);
    },
    distance_to(S: Sprite, x: Value, y: Value): number {
      return Math.hypot($.n(x) - S.x, $.n(y) - S.y);
    },
    // looks
    costume(S: Sprite, c: Value) {
      const count = S.costumes.length;
      if (!count) return;
      if (typeof c === 'string') {
        const i = S.costumes.findIndex((k) => k.name === c);
        if (i >= 0) {
          S.costume = i;
          return;
        }
        if (c.trim() === '' || Number.isNaN(Number(c))) return;
      }
      const k = Math.round($.n(c)) - 1;
      S.costume = ((k % count) + count) % count;
    },
    next_costume(S: Sprite) {
      if (S.costumes.length) S.costume = (S.costume + 1) % S.costumes.length;
    },
    say(S: Sprite, text: Value) {
      const t = $.s(text);
      S.sayText = t === '' ? null : t;
    },
    *say_for(S: Sprite, text: Value, secs: Value): Waits {
      const t = $.s(text);
      S.sayText = t === '' ? null : t;
      yield* lib.wait(secs);
      if (S.sayText === t) S.sayText = null;
    },
    show(S: Sprite) {
      S.visible = true;
    },
    hide(S: Sprite) {
      S.visible = false;
    },
    // events
    broadcast(msg: Value) {
      w.scheduler.trigger('message', $.s(msg), true);
    },
    *broadcast_wait(msg: Value): Waits {
      const threads = w.scheduler.trigger('message', $.s(msg), true);
      const gens = threads.map((t) => t.gen);
      // Done when each started thread finished or was restarted by someone else.
      while (threads.some((t, i) => t.state !== 'done' && t.gen === gens[i])) yield;
    },
    // control
    *wait(secs: Value): Waits {
      // Simulation time: whole ticks, at least one, so `wait(0)` still yields.
      const until = w.ticks + Math.max(1, Math.round($.n(secs) * 60));
      while (w.ticks < until) yield;
    },
    stop(): never {
      throw STOP_THREAD;
    },
    // sensing
    key_down(key: Value): boolean {
      return w.input.isDown($.s(key));
    },
    timer(): number {
      return (w.ticks - w.timerStart) / 60;
    },
    reset_timer() {
      w.timerStart = w.ticks;
    },
    // math
    abs: (x: Value) => Math.abs($.n(x)),
    floor: (x: Value) => Math.floor($.n(x)),
    ceil: (x: Value) => Math.ceil($.n(x)),
    round: (x: Value) => Math.round($.n(x)),
    sqrt: (x: Value) => Math.sqrt($.n(x)),
    sin: (x: Value) => $.sin(x),
    cos: (x: Value) => $.cos(x),
    tan: (x: Value) => $.tan(x),
    min: (a: Value, c: Value) => Math.min($.n(a), $.n(c)),
    max: (a: Value, c: Value) => Math.max($.n(a), $.n(c)),
    random(a: Value, c: Value): number {
      const x = $.n(a);
      const y = $.n(c);
      const lo = Math.min(x, y);
      const hi = Math.max(x, y);
      const decimal = (v: Value) => typeof v === 'string' && v.includes('.');
      if (Number.isInteger(lo) && Number.isInteger(hi) && !decimal(a) && !decimal(c))
        return lo + Math.floor(w.random() * (hi - lo + 1));
      return lo + w.random() * (hi - lo);
    },
    // lists and strings
    len: (v: Value) => $.len(v),
    push: (list: Value, item: Value) => $.push(list, item),
    insert: (list: Value, i: Value, item: Value) => $.insert(list, i, item),
    remove: (list: Value, i: Value) => $.remove(list, i),
    contains: (v: Value, item: Value) => $.contains(v, item),
    // debug
    print(v: Value) {
      w.log($.s(v));
    },
  } satisfies Record<string, Fn>;
  return lib;
}

export type Builtins = ReturnType<typeof createBuiltins>;

export { stageBounds };
