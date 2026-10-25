import { CORE_CATALOG, createCatalog, validateManifest } from '@stitch/ir';
import { contextAt, scopeAt } from '@stitch/lang/assist';
import { describe, expect, it } from 'vitest';
import { completions, hoverInfo, signature, type AssistData } from './assist';

const data: AssistData = {
  catalog: CORE_CATALOG,
  names: {
    sprites: ['Player', 'Enemy'],
    costumes: { Player: ['idle', 'run'] },
    sounds: ['coin', 'jump'],
    songs: ['theme'],
  },
  messages: ['win', 'lose'],
  globals: [{ name: 'score', file: 'Stage' }],
  sprite: 'Player',
};

/** Completion labels at the `|` in `marked`. */
function labels(marked: string, d: AssistData = data): string[] {
  const pos = marked.indexOf('|');
  const text = marked.slice(0, pos) + marked.slice(pos + 1);
  return completions(contextAt(text, pos), scopeAt(text, pos), d).map((i) => i.label);
}
function items(marked: string) {
  const pos = marked.indexOf('|');
  const text = marked.slice(0, pos) + marked.slice(pos + 1);
  return completions(contextAt(text, pos), scopeAt(text, pos), data);
}

describe('completions', () => {
  it('offers declarations and event scripts at the top level', () => {
    const l = labels('|');
    expect(l).toContain('var name = 0');
    expect(l).toContain('function name(a)');
    expect(l).toContain('on key "space" do');
    expect(l).not.toContain('move');
  });

  it('offers statements, commands and names in scope inside a script, not reporters', () => {
    const l = labels('var speed = 1\non start do\n  local n = 2\n  |\nend');
    for (const want of [
      'forever do',
      'for i = 1, 10 do',
      'move',
      'say',
      'speed',
      'n',
      'score',
      'x',
    ])
      expect(l).toContain(want);
    expect(l).not.toContain('timer');
    expect(l).not.toContain('var name = 0');
  });

  it('offers reporters and names in expressions, not commands', () => {
    const l = labels('on start do\n  x = |\nend');
    expect(l).toContain('timer');
    expect(l).toContain('answer');
    expect(l).toContain('score');
    expect(l).not.toContain('move');
  });

  it('inserts builtins and user functions as snippets with a tab stop per parameter', () => {
    const it = items('function hop(h, n)\nend\non start do\n  |\nend');
    expect(it.find((i) => i.label === 'goto')).toMatchObject({
      snippet: 'goto(${x}, ${y})',
      detail: 'go to x: (x) y: (y)',
    });
    expect(it.find((i) => i.label === 'hop')?.snippet).toBe('hop(${h}, ${n})');
    expect(it.find((i) => i.label === 'for i = 1, 10 do')?.snippet).toBe(
      'for ${i} = ${1}, ${10} do\n\t${}\nend',
    );
  });

  it('matches block text, so Scratch users find blocks by their words', () => {
    const pick = items('on start do\n  x = |\nend').find((i) => i.label === 'pick random');
    expect(pick).toMatchObject({
      snippet: 'random(${from}, ${to})',
      displayLabel: 'random — pick random',
    });
  });

  it('completes cart names inside string arguments by what the parameter names', () => {
    expect(labels('on start do\n  play_sound("|")\nend')).toEqual(['coin', 'jump']);
    expect(labels('on start do\n  costume("|")\nend')).toEqual(['idle', 'run']);
    expect(labels('on start do\n  play_music("|")\nend')).toEqual(['theme']);
    expect(labels('on start do\n  broadcast("|")\nend')).toEqual(['win', 'lose']);
    expect(labels('on start do\n  say(touching("|"))\nend')).toContain('Enemy');
    expect(labels('on start do\n  set_effect("|", 1)\nend')).toEqual([
      'ghost',
      'brightness',
      'color',
      'fisheye',
      'whirl',
      'pixelate',
      'mosaic',
    ]);
    expect(labels('on key "|"')).toContain('space');
    expect(labels('on message "|"')).toEqual(['win', 'lose']);
    expect(labels('on start do\n  say("|")\nend')).toEqual([]);
  });

  it('offers event names after on', () => {
    expect(labels('on |')).toEqual([
      'start do',
      'key "space" do',
      'message "message" do',
      'clone do',
      'click do',
    ]);
  });

  it('includes extension blocks from the cart catalog', () => {
    const r = validateManifest({
      id: 'txt',
      name: 'Text',
      version: '1',
      color: '#123456',
      blocks: [
        {
          name: 'txt_shout',
          kind: 'reporter',
          label: 'shout %1',
          params: [{ name: 's', type: 'string' }],
        },
      ],
    });
    if (!r.ok) throw new Error(r.errors.join());
    expect(
      labels('on start do\n  say(|)\nend', { ...data, catalog: createCatalog([r.manifest]) }),
    ).toContain('txt_shout');
  });

  it('suggests nothing in comments', () => {
    expect(labels('-- mo|')).toEqual([]);
  });
});

describe('signature and hover', () => {
  it('shows the parameters of the call being typed', () => {
    expect(signature({ name: 'goto', arg: 1, nameFrom: 0, argsFrom: 5 }, [], data)).toMatchObject({
      params: ['x', 'y'],
      active: 1,
      blockText: 'go to x: (x) y: (y)',
    });
    const scope = scopeAt('function hop(h)\nend', 0);
    expect(signature({ name: 'hop', arg: 0, nameFrom: 0, argsFrom: 4 }, scope, data)).toMatchObject(
      {
        params: ['h'],
      },
    );
  });

  it('describes user names first, then globals from other files, then builtins', () => {
    const text = 'var timer = 1\non start do\n  say(timer)\nend';
    expect(hoverInfo('timer', scopeAt(text, text.length - 6), data)).toEqual({
      user: { name: 'timer', kind: 'sprite' },
    });
    expect(hoverInfo('score', [], data)).toEqual({
      user: { name: 'score', kind: 'global', file: 'Stage' },
    });
    expect(hoverInfo('mouse_x', [], data)).toMatchObject({
      builtin: { scope: 'global', returns: 'number' },
    });
    expect(hoverInfo('nothing', [], data)).toBeUndefined();
  });
});
