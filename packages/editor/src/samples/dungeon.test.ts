/**
 * The shipped Stitch Dungeon cart (public/samples/stitch-dungeon.stitch.png): its code matches
 * the readable source in src/samples/dungeon, and it plays. A bot walks to the stairs, fights,
 * dies and restarts on World with NullRenderer, using the cart's own art for pixel sensing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composite, decodeLayers, decodeTiles, type Cart } from '@stitch/cart';
import { extractCart } from '@stitch/cart/png';
import { compile } from '@stitch/compiler';
import { parse, printModule } from '@stitch/lang';
import { NullRenderer, World, type CostumeInfo, type Program, type Value } from '@stitch/runtime';

const src = (name: string) =>
  readFileSync(join(import.meta.dirname, 'dungeon', `${name}.stitch`), 'utf8');
const cart: Cart = extractCart(
  new Uint8Array(
    readFileSync(join(import.meta.dirname, '../../public/samples/stitch-dungeon.stitch.png')),
  ),
);

type Grid = Value[][];

/** Costume metadata and pixels, decoded from the cart's pixel assets. */
function costumes(): Record<string, CostumeInfo> {
  const out: Record<string, CostumeInfo> = {};
  for (const [id, a] of Object.entries(cart.assets)) {
    if (a.kind !== 'pixel') throw new Error(`${a.name} isn't pixel art`);
    const img = decodeLayers(a.width, a.height, a.layers);
    out[id] = {
      id,
      name: a.name,
      width: a.width,
      height: a.height,
      center: a.center,
      pixelArt: true,
      pixels: composite(img, cart.palette),
    };
  }
  return out;
}

function start(seed: number) {
  const r = compile(
    cart.project,
    cart.sprites.map((s) => s.id),
  );
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics, null, 1));
  const errors: string[] = [];
  const map = cart.map!;
  const world = new World({
    stage: cart.stage,
    sprites: cart.sprites,
    costumes: costumes(),
    map: {
      tileset: map.tileset,
      tileSize: map.tileSize,
      width: map.width,
      height: map.height,
      cells: decodeTiles(map),
    },
    sounds: Object.entries(cart.sounds).map(([id, s]) => ({ id, name: s.name, seconds: 0.2 })),
    songs: Object.entries(cart.music.songs).map(([id, s]) => ({ id, name: s.name })),
    seed,
    onError: (e) => errors.push(`${e.sprite} ${e.event}: ${String(e.error)}`),
  });
  world.load(new Function('rt', r.code) as Program);
  const G = world.globals as Record<string, Value>;
  G.seed = seed;
  world.start();
  const renderer = new NullRenderer();
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      world.tick();
      renderer.render(world);
    }
  };
  const press = (key: string) => {
    world.input.keyDown(key);
    tick();
    world.input.keyUp(key);
    tick();
  };
  const cellOf = (g: string, x: number, y: number) => (G[g] as Grid)[y - 1]?.[x - 1];
  return { world, G, errors, tick, press, cellOf };
}

/** Breadth-first search over non-wall cells; the first step toward `to`, or undefined. */
function firstStep(level: Grid, from: [number, number], to: [number, number]) {
  const key = (x: number, y: number) => `${x},${y}`;
  const prev = new Map<string, string>();
  const queue: [number, number][] = [from];
  prev.set(key(...from), '');
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (x === to[0] && y === to[1]) {
      let k = key(x, y);
      while (prev.get(k) !== key(...from) && prev.get(k)) k = prev.get(k)!;
      const [sx, sy] = k.split(',').map(Number) as [number, number];
      return [sx - from[0], sy - from[1]] as const;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n: [number, number] = [x + dx, y + dy];
      if (level[n[1] - 1]?.[n[0] - 1] === 1 || prev.has(key(...n))) continue;
      prev.set(key(...n), key(x, y));
      queue.push(n);
    }
  }
  return undefined;
}

const stairs = (level: Grid): [number, number] => {
  for (let y = 0; y < level.length; y++)
    for (let x = 0; x < level[y]!.length; x++) if (level[y]![x] === 3) return [x + 1, y + 1];
  throw new Error('no stairs');
};

/** The key for each step; "w" checks WASD works too. */
const KEY: Record<string, string> = {
  '1,0': 'ArrowRight',
  '-1,0': 'ArrowLeft',
  '0,1': 'ArrowDown',
  '0,-1': 'w',
};

describe('Stitch Dungeon', () => {
  it.each(['stage', 'player', 'enemy', 'potion'])(
    '%s.stitch is canonical and is the code in the cart',
    (name) => {
      expect(printModule(parse(src(name)).module)).toBe(src(name));
      const module =
        name === 'stage'
          ? cart.project.stage
          : cart.project.sprites.find((s) => s.name.toLowerCase() === name)!.module;
      expect(printModule(module)).toBe(src(name));
    },
  );

  it('has its art, sounds, song and map', () => {
    const names = (ids: string[]) => ids.map((id) => cart.assets[id]!.name);
    expect(cart.sprites.map((s) => [s.name, names(s.costumes)])).toEqual([
      ['Player', ['player1', 'player2']],
      ['Enemy', ['rat', 'slime', 'skeleton']],
      ['Potion', ['potion']],
    ]);
    expect(cart.map).toMatchObject({ tileSize: 8, width: 32, height: 20 });
    expect(cart.assets[cart.map!.tileset]).toMatchObject({ width: 48, height: 8 });
    expect(Object.values(cart.sounds).map((s) => s.name)).toEqual([
      'step',
      'hit',
      'hurt',
      'pickup',
      'stairs',
      'death',
    ]);
    const song = Object.values(cart.music.songs)[0]!;
    expect(song).toMatchObject({ name: 'dungeon', bpm: 110, loop: true });
    expect(song.order).toHaveLength(2);
    expect(cart.stage).toMatchObject({
      width: 256,
      height: 208,
      origin: 'top-left',
      yAxis: 'down',
    });
  });

  it('builds connected floors and plays through several of them', () => {
    const g = start(1234);
    g.tick(20);
    expect(g.errors).toEqual([]);
    expect(g.G.state).toBe('play');
    const floors = new Set<number>();
    const said = new Set<string>();
    let fights = 0;
    for (let turn = 0; turn < 600 && g.G.state !== 'dead'; turn++) {
      if (g.G.state !== 'play') {
        g.tick();
        continue;
      }
      floors.add(g.G.depth as number);
      const level = g.G.level as Grid;
      const step = firstStep(level, [g.G.px as number, g.G.py as number], stairs(level));
      expect(step, `floor ${String(g.G.depth)} is connected`).toBeDefined();
      const [dx, dy] = step!;
      if (g.cellOf('occ', (g.G.px as number) + dx, (g.G.py as number) + dy) !== '') fights++;
      g.press(KEY[`${dx},${dy}`]!);
      for (const m of g.G.messages as string[]) said.add(m);
      g.tick(12);
    }
    expect(g.errors).toEqual([]);
    process.stderr.write(
      `DEBUG floors=${[...floors].join(',')} fights=${fights} health=${String(g.G.health)} turn=${String(g.G.turn)} state=${String(g.G.state)} msgs=${JSON.stringify(g.G.messages)} rooms=${(g.G.rooms as unknown[]).length} enemies=${g.world.clonesOf(g.world.all.find((s) => s.name === 'Enemy')!).length}\n`,
    );
    expect(floors.size).toBeGreaterThanOrEqual(3);
    expect(fights).toBeGreaterThan(0);
    const all = [...said].join('\n');
    expect(all).toMatch(/YOU HIT THE/);
    expect(all).toMatch(/IS DEFEATED/);
    expect(all).toMatch(/HITS YOU/);
  });

  it('is the same dungeon for the same seed', () => {
    const a = start(99);
    const b = start(99);
    a.tick(20);
    b.tick(20);
    expect(a.G.level).toEqual(b.G.level);
    expect(a.G.seed_used).toBe(99);
  });

  it('heals when you walk onto a potion', () => {
    // Find a seed whose first floor has a potion, then stand next to it.
    for (let seed = 1; seed < 50; seed++) {
      const g = start(seed);
      g.tick(20);
      const potion = g.world.all.find((s) => s.name === 'Potion')!;
      const p = g.world.clonesOf(potion)[0];
      if (!p) continue;
      const [cx, cy] = [p.vars.cx as number, p.vars.cy as number];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const [nx, ny] = [cx + dx, cy + dy];
        if (g.cellOf('level', nx, ny) !== 2 || g.cellOf('occ', nx, ny) !== '') continue;
        g.G.px = nx;
        g.G.py = ny;
        g.G.health = 3;
        g.press(KEY[`${-dx},${-dy}`]!);
        g.tick(20);
        expect(g.G.health).toBeGreaterThanOrEqual(8);
        expect(g.cellOf('loot', cx, cy)).toBe('');
        expect(p.deleted).toBe(true);
        expect(g.errors).toEqual([]);
        return;
      }
    }
    throw new Error('no seed put a potion next to a free cell');
  });

  it('ends at 0 health and restarts with R', () => {
    const g = start(7);
    g.tick(20);
    g.G.health = 0;
    // Any move that ends a turn checks health.
    const level = g.G.level as Grid;
    const step = firstStep(level, [g.G.px as number, g.G.py as number], stairs(level))!;
    g.press(KEY[`${step[0]},${step[1]}`]!);
    g.tick(30);
    expect(g.G.state).toBe('dead');
    g.press('r');
    g.tick(30);
    expect(g.G.state).toBe('play');
    expect([g.G.health, g.G.depth]).toEqual([10, 1]);
    expect(g.errors).toEqual([]);
  });
});
