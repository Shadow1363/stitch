import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE, type SpriteInit } from '@stitch/cart';
import { createCatalog, validateManifest, type Catalog } from '@stitch/ir';
import {
  Dict,
  loadExtensions,
  NullAudio,
  NullNet,
  NullRenderer,
  World,
  type CostumeInfo,
  type HttpRequest,
  type HttpResponse,
  type NetOut,
  type Program,
  type WorldOptions,
} from '@stitch/runtime';
import { compile } from './compile';
import { projectFrom } from './testing';

const box: CostumeInfo = {
  id: 'box',
  name: 'box',
  width: 40,
  height: 40,
  center: [20, 20],
  pixelArt: false,
};

function run(
  sprites: Record<string, string>,
  opts: {
    stage?: string;
    init?: Partial<SpriteInit>;
    audio?: NullAudio;
    net?: NetOut;
    catalog?: Catalog;
    extensions?: WorldOptions['extensions'];
  } = {},
) {
  const project = projectFrom(sprites, opts.stage);
  const r = compile(project, undefined, opts.catalog);
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
  const logs: string[] = [];
  const errors: string[] = [];
  const world = new World({
    stage: DEFAULT_STAGE,
    sprites: project.sprites.map((s, i) => ({
      id: s.id,
      name: s.name,
      x: 0,
      y: 0,
      direction: 90,
      size: 100,
      visible: true,
      layer: i,
      costumes: ['box'],
      costume: 1,
      ...opts.init,
    })),
    costumes: { box },
    sounds: [
      { id: 's1', name: 'coin', seconds: 0.25 },
      { id: 's2', name: 'boom', seconds: 1 },
    ],
    songs: [{ id: 'm1', name: 'theme' }],
    ...(opts.audio ? { audio: opts.audio } : {}),
    ...(opts.net ? { net: opts.net } : {}),
    ...(opts.extensions ? { extensions: opts.extensions } : {}),
    seed: 7,
    onLog: (_s, t) => logs.push(t),
    onError: (e) => errors.push(String(e.error)),
  });
  world.load(new Function('rt', r.code) as Program);
  world.start();
  const renderer = new NullRenderer();
  const ticks = (n: number) => {
    for (let i = 0; i < n; i++) {
      world.tick();
      renderer.render(world);
    }
  };
  return { world, logs, errors, ticks, sprite: world.all[0]! };
}

const SAMPLE = `var vx = 3
var vy = 2

on start do
  goto(0, 0)
  forever do
    if key_down("left") then
      vx -= 0.5
    end
    if key_down("right") then
      vx += 0.5
    end
    x += vx
    y += vy
    local edge = on_edge()
    if edge == "left" or edge == "right" then
      vx = -vx
    end
    if edge == "top" or edge == "bottom" then
      vy = -vy
    end
    clamp_to_stage()
  end
end
`;

describe('compiled behaviour', () => {
  it('sample game: moves each tick, steers with keys, stays on stage and bounces', () => {
    const { ticks, sprite, world } = run({ Player: SAMPLE });
    ticks(1);
    expect([sprite.x, sprite.y]).toEqual([3, 2]);
    world.input.keyDown('ArrowRight');
    ticks(1);
    expect(sprite.x).toBe(3 + 3.5);
    world.input.keyUp('ArrowRight');
    let minX = Infinity;
    let maxX = -Infinity;
    let flips = 0;
    let lastDx = 1;
    for (let i = 0; i < 600; i++) {
      const before = sprite.x;
      ticks(1);
      const dx = sprite.x - before;
      if (Math.sign(dx) !== Math.sign(lastDx) && dx !== 0) flips++;
      if (dx !== 0) lastDx = dx;
      minX = Math.min(minX, sprite.x);
      maxX = Math.max(maxX, sprite.x);
      expect(Math.abs(sprite.y)).toBeLessThanOrEqual(180 - 20 + 1e-9);
    }
    expect(maxX).toBeCloseTo(240 - 20);
    expect(minX).toBeCloseTo(-240 + 20);
    expect(flips).toBeGreaterThan(2);
  });

  it('runs recursion, lists and strings', () => {
    const { ticks, logs } = run({
      P: `var items = [3, 1, 2]
function fact(n)
  if n <= 1 then
    return 1
  end
  return n * fact(n - 1)
end
on start do
  print(fact(5))
  push(items, 9)
  items[2] += 10
  local total = 0
  for v in items do
    total += v
  end
  print(total .. " / " .. len(items))
  print("A" == "a")
  print("10" == 10)
  print(-7 % 3)
end`,
    });
    ticks(10);
    expect(logs).toEqual(['120', '25 / 4', 'false', 'true', '2']);
  });

  it('wait(1) takes 60 ticks; loops run one iteration per tick (D4, D5)', () => {
    const { ticks, logs, world } = run({
      P: `var n = 0
on start do
  wait(1)
  print("waited " .. timer())
  repeat 5 do
    n += 1
  end
  print(n)
end`,
    });
    ticks(60);
    expect(logs).toEqual([]);
    ticks(1);
    expect(logs).toEqual(['waited 1']);
    ticks(4);
    expect(logs).toHaveLength(1);
    ticks(1);
    expect(logs).toEqual(['waited 1', '5']);
    expect(world.ticks).toBe(66);
  });

  it('messages, globals and key events across sprites', () => {
    const { ticks, logs, world } = run(
      {
        A: 'on key "space" do\n  score += 1\n  broadcast("scored")\nend',
        B: 'on message "scored" do\n  print("score " .. score)\nend',
      },
      { stage: 'global var score = 0' },
    );
    world.input.keyDown(' ');
    ticks(3);
    expect(logs).toEqual(['score 1']);
  });

  it('isolates runtime errors to one thread', () => {
    const { ticks, errors, logs } = run({
      P: 'function boom(n)\n  return boom(n + 1)\nend\non start do\n  print(boom(1))\nend\non start do\n  wait(0)\n  print("alive")\nend',
    });
    ticks(3);
    expect(errors[0]).toMatch(/RangeError/);
    expect(logs).toEqual(['alive']);
  });
});

describe('warp functions', () => {
  it('run a whole loop in one tick, and normal functions do not', () => {
    const { ticks, logs } = run({
      P: `var n = 0
warp function fill(k)
  repeat k do
    n += 1
  end
  count_to(k)
end
function count_to(k)
  repeat k do
    n += 1
  end
end
function slow(k)
  repeat k do
    n += 1
  end
end
on start do
  fill(100)
  print(n)
  slow(3)
  print(n)
end`,
    });
    ticks(1);
    // fill() and the count_to() it calls inherit warp: 200 increments in the first tick.
    expect(logs).toEqual(['200']);
    ticks(3);
    expect(logs).toEqual(['200', '203']);
  });

  it('yields an endless warp loop once the tick is over budget', () => {
    let clock = 0;
    const project = projectFrom({
      P: 'warp function spin()\n  forever do\n    x += 1\n  end\nend\non start do\n  spin()\nend',
    });
    const r = compile(project);
    const world = new World({
      stage: DEFAULT_STAGE,
      sprites: [
        {
          id: 'P',
          name: 'P',
          x: 0,
          y: 0,
          direction: 90,
          size: 100,
          visible: true,
          layer: 0,
          costumes: [],
          costume: 1,
        },
      ],
      costumes: {},
      now: () => (clock += 1), // every clock read advances 1 ms
    });
    world.load(new Function('rt', r.code) as Program);
    world.start();
    world.tick();
    const after1 = world.all[0]!.x;
    expect(after1).toBeGreaterThan(100);
    expect(after1).toBeLessThan(1000);
    world.tick();
    expect(world.all[0]!.x).toBeGreaterThan(after1);
  });
});

describe('sound', () => {
  const play = (src: string, n: number) => {
    const audio = new NullAudio();
    const r = run({ P: src }, { audio });
    r.ticks(n);
    return { ...r, audio };
  };

  it('plays sounds and songs by name or number', () => {
    const { audio } = play(
      'on start do\n  play_sound("coin")\n  play_sound(2)\n  play_sound("nope")\n  play_music("theme")\nend\n',
      1,
    );
    expect(audio.calls).toEqual(['sound s1', 'sound s2', 'music m1']);
  });

  it('play_sound_wait waits the sound length in simulation ticks', () => {
    const { sprite } = play(
      'var done = 0\non start do\n  play_sound_wait("coin")\n  done = timer()\nend\n',
      40,
    );
    // 0.25 s is 15 ticks; the next line runs once they have passed
    expect(sprite.vars.done).toBeCloseTo(15 / 60);
  });

  it('clamps the volume to 0..100 and reports it', () => {
    const { sprite, audio } = play(
      'var v = 0\non start do\n  set_volume(150)\n  v = volume()\nend\n',
      1,
    );
    expect(sprite.vars.v).toBe(100);
    expect(audio.calls).toEqual(['volume 1']);
  });

  it('Stop silences sounds and music', () => {
    const { world, audio } = play('on start do\n  play_music("theme")\nend\n', 1);
    world.stopAll();
    expect(audio.calls).toEqual(['music m1', 'stop sounds', 'stop music']);
  });
});

/** Answers requests only when the test says so, like a slow network. */
class FakeNet implements NetOut {
  readonly sent: HttpRequest[] = [];
  private waiting: ((r: HttpResponse) => void)[] = [];
  request(req: HttpRequest): Promise<HttpResponse> {
    this.sent.push(req);
    return new Promise((resolve) => this.waiting.push(resolve));
  }
  /** Answers the oldest request, then lets its promise callbacks run (they run between ticks). */
  async answer(r: HttpResponse) {
    this.waiting.shift()!(r);
    await Promise.resolve();
  }
}

describe('data', () => {
  it('http_get waits across ticks for the reply while other scripts keep running', async () => {
    const net = new FakeNet();
    const { sprite, ticks } = run(
      {
        p: [
          'var body = "none"',
          'var count = 0',
          'on start do',
          '  body = http_get("https://api.test/x")',
          'end',
          'on start do',
          '  forever do',
          '    count += 1',
          '  end',
          'end',
        ].join('\n'),
      },
      { net },
    );
    ticks(5);
    expect(net.sent).toEqual([{ method: 'GET', url: 'https://api.test/x' }]);
    expect(sprite.vars.body).toBe('none');
    expect(sprite.vars.count).toBe(5);
    await net.answer({ status: 200, body: '{"ok":true}' });
    ticks(1);
    expect(sprite.vars.body).toBe('{"ok":true}');
  });

  it('http_post sends the body, and http_status reports the last reply per sprite', async () => {
    const net = new FakeNet();
    const { sprite, ticks } = run(
      {
        p: 'var s = -1\non start do\n  local r = http_post("https://api.test/y", "hi")\n  s = http_status()\nend',
      },
      { net },
    );
    ticks(1);
    expect(net.sent).toEqual([{ method: 'POST', url: 'https://api.test/y', body: 'hi' }]);
    await net.answer({ status: 404, body: 'nope' });
    ticks(1);
    expect(sprite.vars.s).toBe(404);
  });

  it('without a network every request reads as status 0 with an empty body', async () => {
    const { sprite, ticks } = run({
      p: 'var b = "x"\nvar s = -1\non start do\n  b = http_get("https://api.test")\n  s = http_status()\nend',
    });
    ticks(1);
    await Promise.resolve();
    ticks(1);
    expect([sprite.vars.b, sprite.vars.s]).toEqual(['', 0]);
  });

  it('reads JSON: arrays as lists, objects as dictionaries, missing paths as ""', () => {
    const { sprite, ticks } = run({
      p: [
        'var doc = "{\\"items\\": [{\\"name\\": \\"a\\", \\"n\\": 1}, {\\"name\\": \\"b\\", \\"n\\": 2}], \\"ok\\": true}"',
        'var name = ""',
        'var n = 0',
        'var ok = false',
        'var missing = 0',
        'var items = 0',
        'var nums = 0',
        'var first = ""',
        'var bad = 0',
        'on start do',
        '  name = json_get(doc, "items.2.name")',
        '  n = json_get(doc, "items.1.n") + 1',
        '  ok = json_get(doc, "ok")',
        '  missing = json_get(doc, "items.3.name")',
        '  items = json_get(doc, "items")',
        '  nums = json_parse("[1, [2, 3], null]")',
        '  first = json_get(items, "1.name")',
        '  bad = json_parse("{oops")',
        'end',
      ].join('\n'),
    });
    ticks(1);
    const v = sprite.vars;
    expect([v.name, v.n, v.ok, v.missing]).toEqual(['b', 2, true, '']);
    expect(v.items).toEqual([
      new Dict([
        ['name', 'a'],
        ['n', 1],
      ]),
      new Dict([
        ['name', 'b'],
        ['n', 2],
      ]),
    ]);
    expect(v.nums).toEqual([1, [2, 3], '']);
    expect([v.first, v.bad]).toEqual(['a', '']);
  });
});

describe('extensions', () => {
  const r = validateManifest({
    id: 'text',
    name: 'Text',
    version: '1',
    color: '#123456',
    blocks: [
      { name: 'text_upper', kind: 'reporter', label: 'upper %1', params: [{ name: 's' }] },
      { name: 'text_where', kind: 'reporter', label: 'where', params: [] },
      {
        name: 'text_later',
        kind: 'reporter',
        label: 'later %1',
        params: [{ name: 'v' }],
        waits: true,
      },
      { name: 'text_mutate', kind: 'command', label: 'mutate %1', params: [{ name: 'l' }] },
      { name: 'text_bad', kind: 'reporter', label: 'bad', params: [] },
    ],
  });
  if (!r.ok) throw new Error(r.errors.join());
  const catalog = createCatalog([r.manifest]);
  const source = {
    id: 'text',
    blocks: r.manifest.blocks.map((b) => ({ name: b.name, waits: b.waits === true })),
    code: `
      stitch.define('text_upper', (s) => String(s).toUpperCase());
      stitch.define('text_where', (ctx) => ctx.sprite.name + '@' + ctx.sprite.x);
      stitch.define('text_later', (v) => new Promise((ok) => setTimeout(() => ok({ got: v }), 1)));
      stitch.define('text_mutate', (l) => { l.push('x'); });
      stitch.define('text_bad', () => Promise.resolve(1));
    `,
  };
  const load = () => loadExtensions([source], { net: new NullNet(), log: () => {} });

  it('compiles extension calls and runs their implementations', async () => {
    const { sprite, ticks, errors } = run(
      {
        p: [
          'var a = ""',
          'var b = ""',
          'var c = ""',
          'var l = [1]',
          'on start do',
          '  a = text_upper("hi")',
          '  b = text_where()',
          '  text_mutate(l)',
          '  c = text_later(5)',
          'end',
        ].join('\n'),
      },
      { catalog, extensions: load().impls, init: { x: 12 } },
    );
    ticks(1);
    expect([sprite.vars.a, sprite.vars.b, sprite.vars.l]).toEqual(['HI', 'p@12', [1]]);
    await new Promise((ok) => setTimeout(ok, 5));
    ticks(1);
    expect(sprite.vars.c).toBe('{"got":5}');
    expect(errors).toEqual([]);
  });

  it('reports a non-waiting block that returns a Promise', () => {
    const { ticks, errors } = run(
      { p: 'var v = 0\non start do\n  v = text_bad()\nend' },
      { catalog, extensions: load().impls },
    );
    ticks(1);
    expect(errors[0]).toMatch(/'text_bad' returned a Promise/);
  });

  it('without the catalog, extension calls are unknown functions', () => {
    expect(() => run({ p: 'on start do\n  say(text_upper("a"))\nend' })).toThrow(
      /unknown function 'text_upper'/,
    );
  });

  it('reports load failures and missing blocks, and calls explain them', () => {
    const broken = loadExtensions(
      [
        { ...source, id: 'boom', code: 'throw new Error("nope")' },
        { ...source, id: 'half', code: 'stitch.define("text_upper", (s) => s)' },
      ],
      { net: new NullNet(), log: () => {} },
    );
    expect(broken.errors[0]).toEqual({ id: 'boom', message: 'nope' });
    expect(broken.errors.slice(1).map((e) => e.message)).toContain(
      "no implementation for 'text_where'",
    );
    expect(() =>
      loadExtensions([{ ...source, code: 'stitch.define("nope", () => 1)' }], {
        net: new NullNet(),
        log: () => {},
      }).impls.text_upper!({} as never),
    ).toThrow(/isn't a block in this manifest/);
  });
});
