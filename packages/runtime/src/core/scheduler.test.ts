import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE } from '@stitch/cart';
import { World, type RuntimeApi } from './world';

const makeWorld = () =>
  new World({
    stage: DEFAULT_STAGE,
    sprites: [
      {
        id: 'a',
        name: 'A',
        x: 0,
        y: 0,
        direction: 90,
        size: 100,
        visible: true,
        layer: 0,
        costumes: [],
        costume: 1,
      },
      {
        id: 'b',
        name: 'B',
        x: 0,
        y: 0,
        direction: 90,
        size: 100,
        visible: true,
        layer: 1,
        costumes: [],
        costume: 1,
      },
    ],
    costumes: {},
    seed: 1,
  });

/** Registers hand-written scripts; `log` records the order things happen in. */
function setup(define: (rt: RuntimeApi, log: (s: string) => void, w: World) => void) {
  const w = makeWorld();
  const events: string[] = [];
  const log = (s: string) => events.push(`${w.ticks}:${s}`);
  w.load((rt) => {
    rt.defineModule('m', () => {});
    rt.instantiate({ $stage: 'm', a: 'm', b: 'm' });
    define(rt, log, w);
  });
  return { w, events };
}

const [A, B] = [0, 1];

describe('scheduler', () => {
  it('runs start scripts in registration order, one step per tick', () => {
    const { w, events } = setup((rt, log, w) => {
      rt.on(w.all[B]!, 'start', null, function* () {
        log('b1');
        yield;
        log('b2');
      });
      rt.on(w.all[A]!, 'start', null, function* () {
        log('a1');
        yield;
        log('a2');
      });
    });
    w.start();
    w.tick();
    w.tick();
    w.tick();
    expect(events).toEqual(['0:b1', '0:a1', '1:b2', '1:a2']);
    expect(w.scheduler.activeCount).toBe(0);
  });

  it('starts broadcast receivers on the next tick (D6)', () => {
    const { w, events } = setup((rt, log, w) => {
      rt.on(w.all[A]!, 'message', 'go', function* () {
        log('recv A');
      });
      rt.on(w.all[B]!, 'start', null, function* () {
        log('send');
        rt.b.broadcast('go');
        log('after send');
      });
      rt.on(w.all[B]!, 'message', 'go', function* () {
        log('recv B');
      });
    });
    w.start();
    w.tick();
    w.tick();
    expect(events).toEqual(['0:send', '0:after send', '1:recv A', '1:recv B']);
  });

  it('broadcast_wait waits for every receiver', () => {
    const { w, events } = setup((rt, log, w) => {
      rt.on(w.all[A]!, 'message', 'job', function* () {
        yield* rt.b.wait(2 / 60);
        log('job done');
      });
      rt.on(w.all[B]!, 'start', null, function* () {
        yield* rt.b.broadcast_wait('job');
        log('resumed');
      });
    });
    w.start();
    for (let i = 0; i < 6; i++) w.tick();
    expect(events).toEqual(['3:job done', '4:resumed']);
  });

  it('wait counts simulation ticks and always yields at least once', () => {
    const { w, events } = setup((rt, log, w) => {
      rt.on(w.all[A]!, 'start', null, function* () {
        log('start');
        yield* rt.b.wait(0);
        log('after 0');
        yield* rt.b.wait(0.5);
        log('after 0.5');
      });
    });
    w.start();
    for (let i = 0; i < 40; i++) w.tick();
    expect(events).toEqual(['0:start', '1:after 0', '31:after 0.5']);
  });

  it('restarts a running broadcast receiver in place', () => {
    let runs = 0;
    const { w } = setup((rt, _log, w) => {
      rt.on(w.all[A]!, 'message', 'm', function* () {
        runs++;
        for (;;) yield;
      });
    });
    w.scheduler.trigger('message', 'm', true);
    w.tick();
    w.scheduler.trigger('message', 'm', true);
    w.tick();
    expect(runs).toBe(2);
    expect(w.scheduler.activeCount).toBe(1);
  });

  it('does not restart a running key script, and fires on key-down edges only', () => {
    let runs = 0;
    const { w } = setup((rt, _log, w) => {
      rt.on(w.all[A]!, 'key', 'space', function* () {
        runs++;
        yield* rt.b.wait(10);
      });
    });
    w.input.keyDown(' ');
    w.tick();
    w.input.keyDown(' '); // auto-repeat while held: no new edge
    w.tick();
    w.input.keyUp(' ');
    w.input.keyDown(' ');
    w.tick();
    expect(runs).toBe(1);
  });

  it('stop() ends only the calling thread; errors are reported and isolated', () => {
    const errors: string[] = [];
    const events: string[] = [];
    const w2 = new World({
      stage: DEFAULT_STAGE,
      sprites: [],
      costumes: {},
      onError: (e) => errors.push(`${e.sprite}/${e.event}: ${String(e.error)}`),
    });
    w2.load((rt) => {
      rt.on(w2.stage, 'start', null, function* () {
        events.push('a');
        rt.b.stop();
        events.push('never');
      });
      rt.on(w2.stage, 'start', null, function* () {
        throw new Error('boom');
      });
      rt.on(w2.stage, 'start', null, function* () {
        yield;
        events.push('survivor');
      });
    });
    w2.start();
    w2.tick();
    w2.tick();
    expect(events).toEqual(['a', 'survivor']);
    expect(errors).toEqual(['stage/start: Error: boom']);
  });

  it('stopAll kills every thread', () => {
    const { w } = setup((rt, _log, w) => {
      rt.on(w.all[A]!, 'start', null, function* () {
        for (;;) yield;
      });
    });
    w.start();
    w.tick();
    w.stopAll();
    w.tick();
    expect(w.scheduler.activeCount).toBe(0);
  });
});
