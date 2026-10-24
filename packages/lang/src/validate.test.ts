import { describe, expect, it } from 'vitest';
import { didYouMean, validateModule, validateProject, IR_VERSION } from '@stitch/ir';
import { parse } from './parse';

const messages = (text: string) => validateModule(parse(text).module).map((d) => d.message);

describe('validate', () => {
  it('accepts the sample game', () => {
    expect(
      messages(`var vx = 3
on start do
  forever do
    if key_down("left") then
      vx -= 0.5
    end
    x += vx
    local edge = on_edge()
    if edge == "left" then
      vx = -vx
    end
  end
end`),
    ).toEqual([]);
  });

  it('reports unknown variables and functions', () => {
    expect(messages('on start do\n  a = 1\n  jump()\nend')).toEqual([
      "unknown variable 'a'",
      "unknown function 'jump'",
    ]);
  });

  it('checks arity for builtins and user functions', () => {
    expect(messages('function f(a)\nend\non start do\n  move(1, 2)\n  f()\nend')).toEqual([
      "'move' takes 1 argument, got 2",
      "'f' takes 1 argument, got 0",
    ]);
  });

  it('scopes locals, params and loop variables', () => {
    expect(
      messages(
        'function f(n)\n  local t = n\n  for i = 1, t do\n    t += i\n  end\n  return i\nend',
      ),
    ).toEqual(["unknown variable 'i'"]);
  });

  it('rejects return outside functions, read-only props, and prop names as variables', () => {
    expect(messages('var x = 1\non start do\n  costume_number = 2\n  return\nend')).toEqual([
      "'x' is a sprite property and can't be used as a variable name",
      "'costume_number' is read-only",
      "'return' outside a function",
    ]);
  });

  it('rejects reporters used as statements and redefined builtins', () => {
    expect(messages('function move(n)\nend\non start do\n  timer()\nend')).toEqual([
      "'move' is a builtin and can't be redefined",
      "'timer' reports a value; use it in an expression",
    ]);
  });

  it('reports raw code as a syntax error', () => {
    expect(messages('on start do\n  x = = 1\nend')[0]).toMatch(/^syntax error/);
  });

  it('sees globals declared in other files', () => {
    const stage = parse('global var score = 0').module;
    const sprite = parse('on start do\n  score += 1\nend').module;
    const project = {
      irVersion: IR_VERSION,
      stage,
      sprites: [{ id: 's1', name: 'Player', module: sprite }],
    };
    expect(validateProject(project)).toEqual([]);
  });
});

describe('cart names and quick fixes', () => {
  const names = {
    sprites: ['Player', 'Enemy'],
    costumes: { Player: ['idle', 'run'] },
    sounds: ['coin'],
    songs: ['theme'],
  };
  const lint = (text: string, sprite: string | null = 'Player') =>
    validateModule(parse(text).module, new Set(), undefined, {
      names,
      received: new Set(['go']),
      ...(sprite ? { sprite } : {}),
    });
  const wrap = (body: string) => `on start do\n${body}\nend`;

  it('warns about unknown sprites, costumes, sounds and songs, suggesting close names', () => {
    const d = lint(
      wrap('  goto_sprite("Enemi")\n  costume("rnu")\n  play_sound("con")\n  play_music("theem")'),
    );
    expect(d.map((x) => [x.severity, x.message])).toEqual([
      ['warning', `there's no sprite called "Enemi"`],
      ['warning', `there's no costume called "rnu"`],
      ['warning', `there's no sound called "con"`],
      ['warning', `there's no song called "theem"`],
    ]);
    expect(d[0]!.fixes).toEqual([{ kind: 'rename', to: 'Enemy' }]);
    expect(d[2]!.fixes).toEqual([{ kind: 'rename', to: 'coin' }]);
  });

  it('accepts real names, numbers, clone ids and special targets', () => {
    expect(
      lint(
        wrap(
          '  goto_sprite("random")\n  say(touching("Enemy#3"))\n  costume(2)\n  costume("run")\n  play_sound("1")\n  set_effect("ghost", 50)',
        ),
      ),
    ).toEqual([]);
  });

  it('skips costume checks in the stage file and all cart checks without names', () => {
    expect(lint(wrap('  costume("nope")'), null)).toEqual([]);
    expect(validateModule(parse(wrap('  play_sound("nope")')).module)).toEqual([]);
  });

  it('warns about broadcasts nobody receives', () => {
    expect(lint(wrap('  broadcast("og")\n  broadcast("go")'))).toEqual([
      {
        severity: 'warning',
        message: 'no script receives the message "og"',
        nodeId: expect.any(String),
        fixes: [{ kind: 'rename', to: 'go' }],
      },
    ]);
  });

  it('checks effect and rotation-style words even without cart names', () => {
    const d = validateModule(parse(wrap('  set_effect("gohst", 10)')).module);
    expect(d[0]?.fixes).toEqual([{ kind: 'rename', to: 'ghost' }]);
  });

  it('suggests close variables and a declaration for unknown variables', () => {
    const d = validateModule(parse('var speed = 1\non start do\n  x += sped\nend').module);
    expect(d[0]?.fixes).toEqual([
      { kind: 'rename', to: 'speed' },
      { kind: 'declare', line: 'var sped = 0' },
    ]);
  });

  it('suggests close builtins and functions for unknown calls', () => {
    const d = validateModule(parse('on start do\n  mvoe(10)\nend').module);
    expect(d[0]?.fixes?.[0]).toEqual({ kind: 'rename', to: 'move' });
  });

  it('fills missing arguments with typed placeholders and drops extra ones', () => {
    const d = validateModule(parse('on start do\n  goto(1)\n  say("a", 2)\nend').module);
    expect(d.map((x) => x.fixes)).toEqual([
      [{ kind: 'args', keep: 1, add: ['0'] }],
      [{ kind: 'args', keep: 1, add: [] }],
    ]);
  });

  it('validateProject finds receivers in any file', () => {
    const project = {
      irVersion: IR_VERSION,
      stage: parse('on message "win" do\nend').module,
      sprites: [{ id: 'p', name: 'Player', module: parse(wrap('  broadcast("win")')).module }],
    };
    expect(validateProject(project, undefined, names)).toEqual([]);
  });
});

describe('didYouMean', () => {
  it('finds case differences, typos and swapped letters, closest first', () => {
    expect(didYouMean('Score', ['score', 'scare', 'other'])).toEqual(['score']);
    expect(didYouMean('scroe', ['score', 'scare'])).toEqual(['score']);
    expect(didYouMean('mvoe', ['move', 'mouse_x'])).toEqual(['move']);
    expect(didYouMean('x', ['y', 'xx'])).toEqual(['xx', 'y']);
    expect(didYouMean('speed', ['lives'])).toEqual([]);
  });
});
