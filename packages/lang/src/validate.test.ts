import { describe, expect, it } from 'vitest';
import { validateModule, validateProject, IR_VERSION } from '@stitch/ir';
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
