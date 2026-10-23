import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE, type SpriteInit } from '@stitch/cart';
import { NullRenderer, World, type CostumeInfo, type Program } from '@stitch/runtime';
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
  opts: { stage?: string; init?: Partial<SpriteInit> } = {},
) {
  const project = projectFrom(sprites, opts.stage);
  const r = compile(project);
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
      renderer.render();
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
