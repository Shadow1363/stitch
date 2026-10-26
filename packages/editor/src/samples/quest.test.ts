/**
 * Thimble Quest: the code is canonical and has no problems, the map scrolls a room at a time,
 * the Needle and the Lint work, and a bot that walks to the thimble wins.
 */
import { format } from '@stitch/lang';
import { describe, expect, it } from 'vitest';
import { questCart, ROOM, worldText } from './quest/build';
import { runSample } from './testing';

type Game = ReturnType<typeof runSample>;

/** Holds one key at a time, letting go of the last, so `key_pressed` sees each new press. */
function keys(game: Game) {
  let held: string | undefined;
  return (key: string | undefined) => {
    if (key === held) return;
    if (held) game.world.input.keyUp(held);
    if (key) game.world.input.keyDown(key);
    held = key;
  };
}

/** The room showing, as [column, row] of rooms. */
const room = (game: Game) => {
  const m = game.world.map!.scroll;
  return [Math.round(m.x / ROOM.width), Math.round(m.y / ROOM.height)];
};

/**
 * Plays to the thimble: from the start room north twice, then east into the glade, walking
 * across then up or down toward each waypoint (stage pixels in a room). When a Lint is close it
 * turns to face it and pokes. Returns the hearts it lost.
 */
function playThrough(game: Game, maxTicks: number) {
  const { G, tick, sprite, world } = game;
  const press = keys(game);
  const route: { room: [number, number]; x: number; y: number }[] = [
    { room: [1, 2], x: 96, y: -20 },
    { room: [1, 1], x: 96, y: -20 },
    { room: [1, 0], x: 96, y: 64 },
    { room: [1, 0], x: 220, y: 64 },
    { room: [2, 0], x: 140, y: 60 },
  ];
  let lost = 0;
  let hearts = G.hearts as number;
  let poked = 0;
  let wi = 0;
  let stuck = 0;
  let lastX = NaN;
  let lastY = NaN;
  const sameRoom = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1];
  for (let t = 0; t < maxTicks && G.state !== 'won' && G.state !== 'over'; t++) {
    const hero = sprite('Hero');
    const [rx, ry] = room(game);
    const near = world
      .clonesOf(sprite('Lint'))
      .map((l) => ({ dx: l.x - hero.x, dy: l.y - hero.y }))
      .filter((d) => Math.hypot(d.dx, d.dy) < 18)
      .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))[0];
    if (G.state !== 'play') press(undefined);
    else if (near && poked === 0) {
      const toward =
        Math.abs(near.dx) > Math.abs(near.dy) ? (near.dx > 0 ? 90 : -90) : near.dy > 0 ? 180 : 0;
      if (G.facing === toward) {
        press('z');
        poked = 14;
      } else press({ 90: 'right', [-90]: 'left', 180: 'down', 0: 'up' }[toward]);
    } else if (poked > 0) {
      poked--;
      press(undefined);
    } else {
      // A new room: skip to its first waypoint. Reaching a waypoint moves on to the next.
      while (wi < route.length && !sameRoom(route[wi]!.room, [rx!, ry!])) wi++;
      const wp = route[wi];
      if (wp && Math.abs(hero.x - wp.x) < 1 && Math.abs(hero.y - wp.y) < 1) wi++;
      const next = route[wi];
      if (!next) press(undefined);
      else {
        // Across first, unless that's blocked (a knock-back can leave Pip off the path).
        if (hero.x === lastX && hero.y === lastY) stuck = 20;
        const across =
          Math.abs(hero.x - next.x) >= 1 && (stuck === 0 || Math.abs(hero.y - next.y) < 1);
        if (stuck > 0) stuck--;
        if (across) press(hero.x < next.x ? 'right' : 'left');
        else press(hero.y < next.y ? 'down' : 'up');
      }
      lastX = hero.x;
      lastY = hero.y;
    }
    tick();
    const h = G.hearts as number;
    if (h < hearts) lost += hearts - h;
    hearts = h;
  }
  return lost;
}

const start = (seed = 1) => {
  const { parts, sources } = questCart();
  return runSample(parts, sources, seed);
};

/** Walks north from the start into the lakes room, which has three Lint, and stops there. */
function enterLakes() {
  const game = start();
  game.tick(5);
  const press = keys(game);
  press('up');
  let t = 0;
  while (game.G.state !== 'slide' && t++ < 400) game.tick();
  while (game.G.state !== 'play' && t++ < 800) game.tick();
  press(undefined);
  expect(room(game)).toEqual([1, 1]);
  return game;
}

describe('Thimble Quest', () => {
  it('is canonical, compiles with no problems and starts without errors', () => {
    const { sources } = questCart();
    for (const [id, text] of Object.entries(sources)) expect(format(text).text, id).toBe(text);
    const game = start();
    expect(game.diagnostics).toEqual([]);
    game.tick(10);
    expect(game.errors).toEqual([]);
    expect(game.G.state).toBe('play');
  });

  it('has a world of whole rooms, all rows the same width', () => {
    const rows = worldText();
    expect(rows.length).toBe(48);
    for (const r of rows) expect(r.length).toBe(72);
    expect((rows.length * 8) % ROOM.height).toBe(0);
  });

  it('slides the map a room at a time, and tile_at reads the room showing', () => {
    const game = start();
    game.tick(5);
    expect(room(game)).toEqual([1, 2]);
    const press = keys(game);
    press('up');
    let t = 0;
    while (game.G.state !== 'slide' && t++ < 400) game.tick();
    expect(game.G.state).toBe('slide');
    const y0 = game.world.map!.scroll.y;
    game.tick(10);
    // Four pixels a tick, toward the room above.
    expect(game.world.map!.scroll.y).toBeLessThan(y0);
    expect(y0 - game.world.map!.scroll.y).toBeLessThanOrEqual(44);
    press(undefined);
    while (game.G.state === 'slide' && t++ < 800) game.tick();
    expect(room(game)).toEqual([1, 1]);
    expect(game.world.map!.scroll).toEqual({ x: ROOM.width, y: ROOM.height });
    // Pip is just inside the bottom doorway of the lakes room, on the sandy path (tile 2).
    const hero = game.sprite('Hero');
    expect(hero.y).toBeGreaterThan(ROOM.height - 16);
    expect(
      game.world.map!.cells[
        Math.floor((hero.y + ROOM.height) / 8) * 72 + Math.floor((hero.x + ROOM.width) / 8)
      ],
    ).toBe(2);
    // The lakes room has its own Lint now, inside the stage.
    const lint = game.world.clonesOf(game.sprite('Lint'));
    expect(lint.length).toBe(3);
    for (const l of lint)
      expect(l.x >= 0 && l.x < ROOM.width && l.y >= 0 && l.y < ROOM.height).toBe(true);
    expect(game.errors).toEqual([]);
  });

  it('bumping a Lint costs a heart, losing them all ends the game, and R restarts', () => {
    const game = enterLakes();
    const hero = game.sprite('Hero');
    const lint = game.world.clonesOf(game.sprite('Lint'))[0]!;
    // Keep a Lint on Pip: a heart goes each time Pip stops flashing.
    for (let t = 0; t < 400 && game.G.state === 'play'; t++) {
      lint.x = hero.x;
      lint.y = hero.y;
      game.tick();
    }
    // The Stage shows the game over a tick later.
    game.tick(2);
    expect(game.G.hearts).toBe(0);
    expect(game.G.state).toBe('over');
    game.world.input.keyDown('r');
    game.tick(5);
    game.world.input.keyUp('r');
    game.tick(5);
    expect(game.G.state).toBe('play');
    expect(game.G.hearts).toBe(3);
    expect(room(game)).toEqual([1, 2]);
    expect(game.errors).toEqual([]);
  });

  it('two pokes of the Needle get rid of a Lint', () => {
    const game = enterLakes();
    const lints = () => game.world.clonesOf(game.sprite('Lint'));
    const before = lints().length;
    const target = lints()[0]!;
    const hero = game.sprite('Hero');
    const press = keys(game);
    // Held just in front of Pip, who faces up: in the Needle's reach, out of Pip's.
    const hold = (n: number) => {
      for (let k = 0; k < n; k++) {
        target.x = hero.x;
        target.y = hero.y - 10;
        game.tick();
      }
    };
    for (let i = 0; i < 2; i++) {
      press('z');
      hold(2);
      press(undefined);
      hold(20);
    }
    expect(lints().length).toBe(before - 1);
    expect(lints()).not.toContain(target);
    expect(game.errors).toEqual([]);
  });

  it('a bot that walks to the Golden Thimble wins, whatever the Lint do', () => {
    // Lint wander at random, so play a few seeds.
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = start(seed);
      game.tick(5);
      const lost = playThrough(game, 60 * 90);
      expect(game.G.state, `seed ${seed}`).toBe('won');
      expect(lost).toBeLessThan(3);
      expect(game.errors).toEqual([]);
    }
  });
});
