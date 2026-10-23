import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { projectFrom } from './testing';

const js = (src: string) => {
  const r = compile(projectFrom({ P: src }));
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
  return r.code;
};

describe('emit', () => {
  it('compiles the sample game', () => {
    expect(
      js(`var vx = 3
on start do
  forever do
    if key_down("left") then
      vx -= 0.5
    end
    x += vx
    local edge = on_edge()
    if edge == "left" or edge == "right" then
      vx = -vx
    end
    clamp_to_stage()
  end
end`),
    ).toMatchSnapshot();
  });

  it('compiles loops, functions and waits', () => {
    expect(
      js(`var items = [1, 2]
function fact(n)
  if n <= 1 then
    return 1
  end
  return n * fact(n - 1)
end
on message "go" do
  repeat 3 do
    say_for(fact(3) .. "!", 1)
  end
  for i = 10, 1, -1 do
    items[1] += i
  end
  for it in items do
    print(it)
  end
  wait until timer() > 2
  wait(0.5)
end`),
    ).toMatchSnapshot();
  });

  it('skips coercion when both sides are known numbers', () => {
    const code = js('on start do\n  if x < 10 and y == 0 then\n    x += 1 + 2 * 3\n  end\nend');
    expect(code).toContain('if (((S.x < 10) && (S.y === 0))) {');
    expect(code).toContain('S.x += (1 + (2 * 3));');
  });

  it('dedupes identical sprite modules', () => {
    const src = 'on start do\n  move(1)\nend';
    const r = compile(projectFrom({ A: src, B: src, C: 'on start do\nend' }));
    expect(r.code.match(/defineModule/g)).toHaveLength(3); // stage + shared + C
    expect(r.code).toContain('rt.instantiate({"$stage":"m0","A":"m1","B":"m1","C":"m2"});');
  });

  it('refuses to compile programs with errors', () => {
    const r = compile(projectFrom({ P: 'on start do\n  x = = 1\nend' }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe('');
  });

  it('rejects initialisers that wait or call user functions', () => {
    const r = compile(
      projectFrom({ P: 'function f()\n  return 1\nend\nvar a = f()\nvar b = random(1, 2)' }),
    );
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      "variable 'a' must start with a value that doesn't wait or call your functions",
    ]);
  });

  it('maps generated lines back to IR nodes', () => {
    const r = compile(projectFrom({ P: 'on start do\n  move(1)\n  turn(2)\nend' }));
    const turnLine = r.code.split('\n').findIndex((l) => l.includes('B.turn'));
    expect(r.lineMap[turnLine]).toBeDefined();
  });
});
