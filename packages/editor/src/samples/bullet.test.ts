/**
 * Needle Storm: the code is canonical and has no problems, bullets cost lives until the game is
 * over (and R restarts it), and a bot that stays under the boss and shoots beats all three phases.
 */
import { format } from '@stitch/lang';
import { describe, expect, it } from 'vitest';
import { bulletCart } from './bullet/build';
import { runSample } from './testing';

const { parts, sources } = bulletCart();

describe('Needle Storm', () => {
  it('is canonical text with no problems', () => {
    for (const [id, text] of Object.entries(sources)) expect(format(text).text, id).toBe(text);
    expect(runSample(parts, sources).diagnostics).toEqual([]);
  });

  it('bullets cost lives; the last one ends the game, and R starts again', () => {
    const { world, tick, G, errors } = runSample(parts, sources);
    // Sitting still under the spiral is soon fatal.
    for (let i = 0; i < 6000 && G.state !== 'over'; i++) tick();
    expect(G.state).toBe('over');
    expect(G.lives).toBe(0);
    world.input.keyDown('r');
    tick(5);
    world.input.keyUp('r');
    tick(5);
    expect({ state: G.state, lives: G.lives, hp: G.boss_hp, phase: G.phase }).toEqual({
      state: 'play',
      lives: 3,
      hp: 600,
      phase: 1,
    });
    expect(errors).toEqual([]);
  });

  it('a bot that stays under the boss and shoots beats all three phases', () => {
    const { world, tick, G, sprite, errors } = runSample(parts, sources);
    tick(2);
    // The bot doesn't dodge, so give it lives enough to outlast the patterns.
    G.lives = 1000;
    const boss = sprite('Boss');
    const player = sprite('Player');
    const phases = new Set<unknown>();
    let most = 0;
    world.input.keyDown('z');
    for (let i = 0; i < 12000 && G.state !== 'won'; i++) {
      const dx = boss.x - player.x;
      world.input.keyUp('ArrowLeft');
      world.input.keyUp('ArrowRight');
      if (dx < -2) world.input.keyDown('ArrowLeft');
      if (dx > 2) world.input.keyDown('ArrowRight');
      tick();
      phases.add(G.phase);
      most = Math.max(most, world.clonesOf(sprite('Bullet')).length);
    }
    expect(errors).toEqual([]);
    expect(G.state).toBe('won');
    expect([...phases]).toEqual([1, 2, 3]);
    // Busy, but well inside the clone limit.
    expect(most).toBeGreaterThan(50);
    expect(most).toBeLessThan(parts.stage.cloneLimit / 2);
  });
});
