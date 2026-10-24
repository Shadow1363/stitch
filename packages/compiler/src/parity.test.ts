/**
 * Behaviour of the Phase 9 blocks (clones, pen, sensing, data, control), compiled from real
 * Stitch source and run on World with NullRenderer.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE, type SpriteInit, type StageSettings } from '@stitch/cart';
import {
  Dict,
  NullRenderer,
  World,
  type AskOut,
  type CostumeInfo,
  type MapInit,
  type PenOp,
  type Program,
} from '@stitch/runtime';
import { compile } from './compile';
import { projectFrom } from './testing';

/** 40×40 box; with `ring`, only a 4-pixel red frame is opaque (the middle is see-through). */
function box(id: string, ring = false): CostumeInfo {
  const pixels = new Uint8ClampedArray(40 * 40 * 4);
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 40; x++) {
      const edge = x < 4 || y < 4 || x >= 36 || y >= 36;
      if (ring && !edge) continue;
      const i = (y * 40 + x) * 4;
      pixels.set(ring ? [255, 0, 77, 255] : [41, 173, 255, 255], i);
    }
  return { id, name: id, width: 40, height: 40, center: [20, 20], pixelArt: false, pixels };
}

function run(
  sprites: Record<string, string>,
  opts: {
    stage?: string;
    settings?: Partial<StageSettings>;
    init?: Record<string, Partial<SpriteInit>>;
    map?: MapInit;
    ask?: AskOut;
  } = {},
) {
  const project = projectFrom(sprites, opts.stage);
  const r = compile(project);
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
  const logs: string[] = [];
  const errors: string[] = [];
  const world = new World({
    stage: { ...DEFAULT_STAGE, ...opts.settings },
    sprites: project.sprites.map((s, i) => ({
      id: s.id,
      name: s.name,
      x: 0,
      y: 0,
      direction: 90,
      size: 100,
      visible: true,
      layer: i,
      costumes: [s.name === 'Ring' ? 'ring' : 'box'],
      costume: 1,
      ...opts.init?.[s.name],
    })),
    costumes: { box: box('box'), ring: box('ring', true) },
    ...(opts.map ? { map: opts.map } : {}),
    ...(opts.ask ? { ask: opts.ask } : {}),
    seed: 7,
    onLog: (_s, t) => logs.push(t),
    onError: (e) => errors.push(String(e.error)),
  });
  world.load(new Function('rt', r.code) as Program);
  world.start();
  const pen: PenOp[] = [];
  const renderer = new NullRenderer();
  const ticks = (n: number) => {
    for (let i = 0; i < n; i++) {
      world.tick();
      pen.push(...world.pen.pending);
      renderer.render(world);
    }
  };
  const sprite = (name: string) => world.all.find((s) => s.name === name)!;
  return { world, logs, errors, ticks, pen, sprite };
}

describe('control', () => {
  it('break leaves the loop and continue still waits a tick per iteration', () => {
    const { ticks, logs } = run({
      A: [
        'on start do',
        '  for i = 1, 10 do',
        '    if i % 2 == 0 then',
        '      continue',
        '    end',
        '    if i > 6 then',
        '      break',
        '    end',
        '    print(i)',
        '  end',
        '  print("done")',
        'end',
      ].join('\n'),
    });
    ticks(1);
    expect(logs).toEqual(['1']);
    ticks(1);
    // i = 2 continued, which still took this tick.
    expect(logs).toEqual(['1']);
    ticks(10);
    expect(logs).toEqual(['1', '3', '5', 'done']);
  });

  it('rejects break and continue outside a loop, including inside a called function', () => {
    const r = compile(
      projectFrom({
        A: 'function f()\n  break\nend\non start do\n  forever do\n    f()\n  end\nend',
      }),
    );
    expect(r.diagnostics.map((d) => d.message)).toContain("'break' outside a loop");
  });

  it("stop other scripts ends the sprite's other threads only", () => {
    const { ticks, world, sprite } = run({
      A: 'on start do\n  forever do\n    x += 1\n  end\nend\non key "s" do\n  stop_other_scripts()\nend',
      B: 'on start do\n  forever do\n    x += 1\n  end\nend',
    });
    ticks(2);
    world.input.keyDown('s');
    ticks(3);
    expect(sprite('A').x).toBe(3);
    expect(sprite('B').x).toBe(5);
  });
});

describe('clones', () => {
  const enemy = [
    'var hp = 3',
    'shared var made = 0',
    'on start do',
    '  hp = 5',
    '  repeat 3 do',
    '    create_clone()',
    '    x += 10',
    '  end',
    'end',
    'on clone do',
    '  made += 1',
    '  hp -= 1',
    '  print(my_id() .. " hp " .. hp .. " at " .. x)',
    'end',
  ].join('\n');

  it('copy their parent and its variables; shared vars are one per family', () => {
    const { ticks, logs, world, sprite } = run({ Enemy: enemy });
    ticks(4);
    expect(logs).toEqual(['Enemy#1 hp 4 at 0', 'Enemy#2 hp 4 at 10', 'Enemy#3 hp 4 at 20']);
    expect(world.sharedVars(sprite('Enemy')).made).toBe(3);
    expect(sprite('Enemy').vars.hp).toBe(5);
    expect(world.clonesOf(sprite('Enemy')).map((c) => c.handle)).toEqual([
      'Enemy#1',
      'Enemy#2',
      'Enemy#3',
    ]);
    // Behind the parent, as in Scratch.
    expect(world.sprites.map((s) => s.handle)).toEqual(['Enemy#1', 'Enemy#2', 'Enemy#3', 'Enemy']);
  });

  it('can be listed, read and deleted; deleting ends their scripts', () => {
    const { ticks, logs, world, sprite } = run({
      Enemy:
        'on start do\n  create_clone()\n  create_clone()\nend\non clone do\n  forever do\n    x += 1\n  end\nend\non message "die" do\n  delete_clone()\nend',
      Boss: [
        'on start do',
        '  wait(0.1)',
        '  for c in clones("Enemy") do',
        '    print(c .. " " .. x_of(c))',
        '  end',
        '  print(clone_count())',
        '  broadcast_wait("die")',
        '  print(len(clones("Enemy")))',
        'end',
      ].join('\n'),
    });
    ticks(30);
    // The loop waits a tick per clone, and each clone moved meanwhile.
    expect(logs).toEqual(['Enemy#1 5', 'Enemy#2 6', '0', '0']);
    expect(world.sprites).toHaveLength(2);
    expect(world.scheduler.activeCount).toBe(0);
    expect(sprite('Enemy').x).toBe(0);
  });

  it('stop at the clone limit with an error that says how to fix it', () => {
    const { ticks, errors, world } = run(
      { A: 'on start do\n  forever do\n    create_clone()\n  end\nend' },
      { settings: { cloneLimit: 5 } },
    );
    ticks(10);
    expect(world.sprites).toHaveLength(6);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/clone limit reached \(5 clones\).*Cart → Stage/);
  });

  it('stop_all removes every clone', () => {
    const { ticks, world } = run({
      A: 'on start do\n  create_clone()\n  create_clone()\n  wait(0.1)\n  stop_all()\nend',
    });
    ticks(10);
    expect(world.sprites).toHaveLength(1);
    expect(world.scheduler.activeCount).toBe(0);
  });
});

describe('pen', () => {
  it('draws lines as the sprite moves, in stage pixels, plus a dot on pen down', () => {
    const { ticks, pen } = run({
      A: 'on start do\n  set_pen_color("#ff004d")\n  set_pen_size(3)\n  pen_down()\n  goto(10, 10)\n  x += 5\n  pen_up()\n  goto(0, 0)\nend',
    });
    ticks(1);
    expect(pen).toEqual([
      { kind: 'circle', x: 240, y: 180, r: 1.5, line: 0, color: 0xff004d, alpha: 1 },
      { kind: 'line', x1: 240, y1: 180, x2: 250, y2: 170, width: 3, color: 0xff004d, alpha: 1 },
      { kind: 'line', x1: 250, y1: 170, x2: 255, y2: 170, width: 3, color: 0xff004d, alpha: 1 },
    ]);
  });

  it('draws shapes between corners whatever the y axis, and clears', () => {
    const src =
      'on start do\n  set_pen_color(12)\n  set_pen_transparency(50)\n  fill_rect(0, 0, 10, 20)\n  draw_circle(5, 5, 4)\nend';
    const up = run({ A: src });
    up.ticks(1);
    expect(up.pen[0]).toEqual({
      kind: 'rect',
      x: 240,
      y: 160,
      w: 10,
      h: 20,
      line: 0,
      color: 0x00e436,
      alpha: 0.5,
    });
    const down = run({ A: src }, { settings: { origin: 'top-left', yAxis: 'down' } });
    down.ticks(1);
    expect(down.pen[0]).toMatchObject({ x: 0, y: 0, w: 10, h: 20 });
    expect(down.pen[1]).toMatchObject({ kind: 'circle', x: 5, y: 5, r: 4, line: 1 });
    const cleared = run({ A: src + '\non key "c" do\n  clear_pen()\nend' });
    cleared.ticks(1);
    cleared.world.input.keyDown('c');
    cleared.world.tick();
    expect(cleared.world.pen.pending).toEqual([{ kind: 'clear' }]);
  });

  it("changes colour by hue on Scratch's 0–100 scale, and stamps the costume", () => {
    const { ticks, pen } = run({
      A: 'on start do\n  set_pen_color("#ff0000")\n  change_pen_color(100 / 3)\n  draw_line(0, 0, 1, 0)\n  stamp()\nend',
    });
    ticks(1);
    expect(pen[0]).toMatchObject({ kind: 'line', color: 0x00ff00 });
    expect(pen[1]).toMatchObject({ kind: 'stamp', costume: 'box', center: [20, 20], alpha: 1 });
  });

  it('writes text in the pixel font as merged rectangles, scaled by pen size', () => {
    const { ticks, pen } = run(
      { A: 'on start do\n  set_pen_size(2)\n  draw_text("T", 0, 0)\nend' },
      { settings: { origin: 'top-left', yAxis: 'down' } },
    );
    ticks(1);
    // T: a full top row, then the middle column.
    expect(pen.map((o) => (o.kind === 'rect' ? [o.x, o.y, o.w, o.h] : []))).toEqual([
      [0, 0, 6, 2],
      [2, 2, 2, 2],
      [2, 4, 2, 2],
      [2, 6, 2, 2],
      [2, 8, 2, 2],
    ]);
  });
});

describe('sensing', () => {
  it('touches by pixels, not just boxes', () => {
    const src = 'on start do\n  forever do\n    print(touching("Ring"))\n  end\nend';
    const inside = run({ A: src, Ring: '' }, { init: { A: { size: 10 } } });
    inside.ticks(1);
    // The small box sits in the ring's see-through middle.
    expect(inside.logs).toEqual(['false']);
    const edge = run({ A: src, Ring: '' }, { init: { A: { size: 10, x: 18 } } });
    edge.ticks(1);
    expect(edge.logs).toEqual(['true']);
  });

  it('finds colours under the sprite and the sprite at a point', () => {
    const { ticks, logs } = run(
      {
        A: 'on start do\n  print(touching_color("#ff004d"))\n  print(color_touching("#29adff", "#ff004d"))\n  print(touching_color("#00e436"))\n  print(sprite_at(18, 0))\n  print(sprite_at(0, 0))\n  print(sprite_at(200, 0))\nend',
        Ring: '',
      },
      { init: { A: { size: 10, x: 18 } } },
    );
    ticks(1);
    // The ring is drawn over A, so it's what's at A's edge.
    expect(logs).toEqual(['true', 'true', 'false', 'Ring', '', '']);
  });

  it('tells a key that was just pressed from one that is held', () => {
    const { ticks, logs, world } = run({
      A: 'on start do\n  forever do\n    print(key_pressed("space") .. " " .. key_down("space"))\n  end\nend',
    });
    world.input.keyDown(' ');
    ticks(2);
    expect(logs).toEqual(['true true', 'false true']);
  });

  it('reads the mouse and runs click hats for the sprite under it', () => {
    const { ticks, logs, world } = run(
      {
        A: 'on click do\n  print("A clicked at " .. mouse_x())\nend',
        B: 'on click do\n  print("B")\nend',
      },
      { stage: 'on click do\n  print("stage")\nend', init: { B: { x: 100 } } },
    );
    world.input.pointerDown(5, 0);
    ticks(2);
    world.input.pointerDown(-200, 0);
    ticks(2);
    expect(logs).toEqual(['A clicked at 5', 'stage']);
    expect(world.input.mouseDown).toBe(true);
  });

  it('reads other sprites by name: position, distance, variables', () => {
    const { ticks, logs } = run({
      A: 'on start do\n  wait(0)\n  print(x_of("B") .. " " .. y_of("B") .. " " .. distance_to_sprite("B") .. " " .. var_of("B", "hp"))\n  point_towards_sprite("B")\n  print(format_number(direction, 2))\n  goto_sprite("B")\n  print(x)\nend',
      B: 'var hp = 9\non start do\n  goto(30, 40)\nend',
    });
    ticks(3);
    expect(logs).toEqual(['30 40 50 9', '36.87', '30']);
  });
});

describe('data', () => {
  it('maths, strings and seeded randomness', () => {
    const { ticks, logs } = run({
      A: [
        'on start do',
        '  print(clamp(15, 0, 10) .. " " .. lerp(0, 10, 0.25) .. " " .. sign(-3) .. " " .. distance(0, 0, 3, 4))',
        '  print(angle(0, 0, 0, 10) .. " " .. round(asin(1)) .. " " .. log(1000) .. " " .. pow10(2))',
        '  print(join(split("a,b,c", ","), "|") .. " " .. substring("hello", 2, 4) .. " " .. upper("hi") .. lower("YO"))',
        '  print(format_number(3.14159, 2) .. " " .. format_number(2, 0))',
        '  set_seed(42)',
        '  local a = random_int(1, 100)',
        '  set_seed(42)',
        '  print(a == random_int(1, 100))',
        'end',
      ].join('\n'),
    });
    ticks(1);
    expect(logs).toEqual(['10 2.5 -1 5', '0 90 3 100', 'a|b|c ell HIyo', '3.14 2', 'true']);
  });

  it('grids are lists of rows; dictionaries read and write by key', () => {
    const { ticks, logs, sprite } = run({
      A: [
        'var g = 0',
        'var d = 0',
        'on start do',
        '  g = make_grid(3, 2, 0)',
        '  set_cell(g, 3, 2, 7)',
        '  print(cell(g, 3, 2) .. " " .. g[2][3] .. " " .. grid_width(g) .. "x" .. grid_height(g))',
        '  fill_grid(g, 1)',
        '  print(g[1][1])',
        '  d = dict()',
        '  d["hp"] = 3',
        '  d["name"] = "orc"',
        '  print(d["hp"] .. " " .. has_key(d, "hp") .. " " .. len(d) .. " " .. join(keys(d), ","))',
        '  remove(d, "hp")',
        '  print(d)',
        '  local l = [5, 6, 7]',
        '  print(index_of(l, 6))',
        '  clear(l)',
        '  print(len(l))',
        'end',
      ].join('\n'),
    });
    ticks(1);
    expect(logs).toEqual(['7 7 3x2', '1', '3 true 2 hp,name', '{"name": "orc"}', '2', '0']);
    expect(sprite('A').vars.d).toBeInstanceOf(Dict);
  });

  it('reads and writes the map by column and row', () => {
    const { ticks, logs, world } = run(
      {
        A: 'on start do\n  set_map_cell(2, 1, 5)\n  print(map_cell(2, 1) .. " " .. map_width() .. "x" .. map_height() .. " " .. tile_size())\nend',
      },
      { map: { tileset: 'box', tileSize: 8, width: 4, height: 3, cells: new Uint16Array(12) } },
    );
    ticks(1);
    expect(logs).toEqual(['5 4x3 8']);
    expect([...world.map!.dirty]).toEqual([1]);
  });

  it('watch keeps the latest value per label; assert stops the script', () => {
    const { ticks, world, errors, logs } = run({
      A: 'on start do\n  watch("hp", 3)\n  watch("hp", 2)\n  assert(1 == 1, "fine")\n  assert(1 == 2, "maths broke")\n  print("unreachable")\nend',
    });
    ticks(1);
    expect([...world.watches]).toEqual([['hp', '2']]);
    expect(errors).toEqual(['Error: assertion failed: maths broke']);
    expect(logs).toEqual([]);
  });
});

describe('motion and looks', () => {
  it('glides over whole ticks and ends exactly on target', () => {
    const { ticks, sprite } = run({ A: 'on start do\n  glide(0.5, 30, 0)\nend' });
    ticks(16);
    expect(sprite('A').x).toBe(15);
    ticks(15);
    expect(sprite('A').x).toBe(30);
  });

  it('effects clamp, layers reorder, rotation style and think bubbles', () => {
    const { ticks, world, sprite } = run({
      A: 'on start do\n  set_effect("ghost", 150)\n  change_effect("brightness", -30)\n  go_to_front()\n  rotation_style("left-right")\n  think("hmm")\n  print(costume_name())\nend',
      B: '',
    });
    ticks(1);
    const a = sprite('A');
    expect(a.effects).toEqual({ ghost: 100, brightness: -30, color: 0 });
    expect(world.sprites.map((s) => s.name)).toEqual(['B', 'A']);
    expect(a.rotationStyle).toBe('left-right');
    expect([a.sayText, a.thinking]).toEqual(['hmm', true]);
  });
});

/** An answer field the test fills in: `type` answers the open question. */
class FakeAsk implements AskOut {
  open: { prompt: string; resolve: (a: string) => void } | undefined;
  cancelled = 0;
  ask(prompt: string): Promise<string> {
    return new Promise((resolve) => (this.open = { prompt, resolve }));
  }
  cancel() {
    this.cancelled++;
    this.open = undefined;
  }
  async type(answer: string) {
    const o = this.open!;
    this.open = undefined;
    o.resolve(answer);
    await flush();
  }
}

/** Lets queued promise callbacks run, as they would between frames. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('ask and answer', () => {
  it('asks in the speech bubble, waits for the answer, and answer() reports it', async () => {
    const ask = new FakeAsk();
    const { ticks, logs, sprite } = run(
      { A: 'on start do\n  ask("Name?")\n  print("hi " .. answer())\nend' },
      { ask },
    );
    ticks(1);
    await flush();
    // A visible sprite shows the question in its bubble; the field's own prompt stays empty.
    expect(ask.open?.prompt).toBe('');
    expect(sprite('A').sayText).toBe('Name?');
    ticks(5);
    expect(logs).toEqual([]);
    await ask.type('Ada');
    ticks(1);
    expect(logs).toEqual(['hi Ada']);
    expect(sprite('A').sayText).toBeNull();
  });

  it('shows the question in the prompt for the stage and hidden sprites', async () => {
    const ask = new FakeAsk();
    const { ticks } = run({ A: '' }, { stage: 'on start do\n  ask("Ready?")\nend', ask });
    ticks(1);
    await flush();
    expect(ask.open?.prompt).toBe('Ready?');
  });

  it('takes questions one at a time, in the order asked', async () => {
    const ask = new FakeAsk();
    const { ticks, logs } = run(
      {
        A: 'on start do\n  ask("first")\n  print("A " .. answer())\nend',
        B: 'on start do\n  hide()\n  ask("second")\n  print("B " .. answer())\nend',
      },
      { ask },
    );
    ticks(1);
    await flush();
    expect(ask.open?.prompt).toBe('');
    await ask.type('one');
    expect(ask.open?.prompt).toBe('second');
    ticks(1);
    await ask.type('two');
    ticks(1);
    expect(logs).toEqual(['A one', 'B two']);
  });

  it('Stop closes the field and drops queued questions', async () => {
    const ask = new FakeAsk();
    const { ticks, world } = run(
      {
        A: 'on start do\n  ask("a")\nend',
        B: 'on start do\n  ask("b")\nend',
      },
      { ask },
    );
    ticks(1);
    await flush();
    world.stopAll();
    expect(ask.cancelled).toBe(1);
    await flush();
    expect(ask.open).toBeUndefined();
  });

  it('reports the stage size and the ticks since Run', () => {
    const { ticks, logs } = run(
      {
        A: 'on start do\n  print(stage_width() .. "x" .. stage_height())\n  wait(1)\n  print(frame_count())\nend',
      },
      { settings: { width: 128, height: 96 } },
    );
    ticks(62);
    expect(logs).toEqual(['128x96', '60']);
  });
});
