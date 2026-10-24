/**
 * Patch Hop: the code is canonical and has no problems, the physics behave, and a bot that runs
 * right and jumps at obstacles finishes all three levels.
 */
import { format } from '@stitch/lang';
import { describe, expect, it } from 'vitest';
import { levelText, platformerCart } from './platformer/build';
import { runSample } from './testing';

/**
 * Plays the game: holds right, and jumps (holding jump for a full jump) when a wall, a pit, spikes
 * or a Snip is just ahead. Returns how many lives it lost.
 */
function playThrough(game: ReturnType<typeof runSample>, maxTicks: number) {
  const { world, tick, sprite, G } = game;
  const map = world.map!;
  const tileAt = (px: number, py: number) => {
    const c = Math.floor(px / 8);
    const r = Math.floor(py / 8);
    // The stage's sides are walls in the game, so count them as ground here.
    if (c < 0 || c >= map.width) return 1;
    return r < 0 || r >= map.height ? 0 : map.cells[r * map.width + c]!;
  };
  const solid = (px: number, py: number) => {
    const t = tileAt(px, py);
    return t >= 1 && t <= 3;
  };
  let held = 0;
  let deaths = 0;
  let lives = G.lives as number;
  world.input.keyDown('ArrowRight');
  for (let t = 0; t < maxTicks && G.state !== 'won' && G.state !== 'over'; t++) {
    const p = sprite('Player');
    const onGround = solid(p.x - 3, p.y + 4) || solid(p.x + 2, p.y + 4);
    const snipAhead = world
      .clonesOf(sprite('Snip'))
      .some((s) => s.x - p.x > 0 && s.x - p.x < 24 && Math.abs(s.y - p.y) < 10);
    const wall = solid(p.x + 8, p.y) || solid(p.x + 8, p.y - 4);
    const pit = !solid(p.x + 6, p.y + 8) && !solid(p.x + 6, p.y + 16);
    const spikes = [8, 12].some(
      (d) => tileAt(p.x + d, p.y) === 4 || tileAt(p.x + d, p.y + 3) === 4,
    );
    if (held > 0) {
      held--;
      if (held === 0) world.input.keyUp('z');
    } else if (G.state === 'play' && onGround && (wall || pit || spikes || snipAhead)) {
      world.input.keyDown('z');
      held = 18;
    }
    tick();
    const now = G.lives as number;
    if (now !== lives) {
      deaths += lives - now;
      lives = now;
    }
  }
  world.input.releaseAll();
  return deaths;
}

const { parts, sources } = platformerCart();

describe('Patch Hop', () => {
  it('is canonical text with no problems', () => {
    for (const [id, text] of Object.entries(sources)) expect(format(text).text, id).toBe(text);
    const { diagnostics } = runSample(parts, sources);
    expect(diagnostics).toEqual([]);
  });

  it('has three 32 by 20 levels', () => {
    for (const n of [1, 2, 3]) {
      const rows = levelText(n);
      expect(rows.length).toBe(20);
      for (const r of rows) expect(r.length).toBe(32);
      expect(rows.join('')).toContain('P');
      expect(rows.join('')).toContain('F');
    }
  });

  it('starts level 1 with Patch standing on the ground', () => {
    const { tick, G, sprite, errors } = runSample(parts, sources);
    tick(60);
    expect(errors).toEqual([]);
    expect(G.state).toBe('play');
    const p = sprite('Player');
    expect(p.visible).toBe(true);
    // Feet on the ground at row 17 (y = 136), so the centre is 4 pixels above.
    expect(p.y).toBe(132);
  });

  it('a bot that runs right and jumps at obstacles finishes all three levels', () => {
    const game = runSample(parts, sources);
    game.tick(10);
    const deaths = playThrough(game, 6000);
    expect(game.errors).toEqual([]);
    expect({ state: game.G.state, level: game.G.level, deaths }).toEqual({
      state: 'won',
      level: 3,
      deaths: 0,
    });
    expect(game.G.buttons).toBeGreaterThan(0);
  });

  it('a pit costs a life, the third ends the game, and R starts again', () => {
    const { world, tick, G, errors } = runSample(parts, sources);
    tick(10);
    // Running right without jumping falls into the first pit, three times.
    world.input.keyDown('ArrowRight');
    for (let i = 0; i < 1200 && G.state !== 'over'; i++) tick();
    world.input.releaseAll();
    expect(G.lives).toBe(0);
    expect(G.state).toBe('over');
    world.input.keyDown('r');
    tick(5);
    world.input.keyUp('r');
    tick(5);
    expect({ state: G.state, lives: G.lives, level: G.level }).toEqual({
      state: 'play',
      lives: 3,
      level: 1,
    });
    expect(errors).toEqual([]);
  });

  it('landing on a Snip stops it and bounces Patch', () => {
    const { world, tick, G, sprite } = runSample(parts, sources);
    tick(10);
    // Out in the open, on the last stretch of ground of level 1.
    const snip = world.clonesOf(sprite('Snip'))[0]!;
    snip.moveTo(212, 132);
    sprite('Player').moveTo(212, 108);
    tick(30);
    expect(world.clonesOf(sprite('Snip')).length).toBe(0);
    expect(G.lives).toBe(3);
  });

  it('walking into a Snip costs a life', () => {
    const { world, tick, G, sprite } = runSample(parts, sources);
    tick(10);
    world.clonesOf(sprite('Snip'))[0]!.moveTo(220, 132);
    sprite('Player').moveTo(204, 132);
    world.input.keyDown('ArrowRight');
    tick(40);
    expect(G.lives).toBe(2);
  });
});
