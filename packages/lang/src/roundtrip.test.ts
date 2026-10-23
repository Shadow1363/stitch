import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { irEqual } from '@stitch/ir';
import { moduleArb } from '@stitch/ir/arbitrary';
import { parse } from './parse';
import { printModule } from './print';

const canon = (t: string) => printModule(parse(t).module);

const FIXTURES: Record<string, string> = {
  sample: `-- Arrow keys steer; the sprite bounces off edges.
var vx = 3
var vy = 2

on start do
  goto(0, 0)
  forever do
    if key_down("left") then
      vx -= 0.5
    end
    x += vx -- move
    y += vy
    local edge = on_edge()
    if edge == "left" or edge == "right" then
      vx = -vx
    end
    clamp_to_stage()
  end
end
`,
  everything: `global var score = 0
var items = [1, "two", [3]]

warp function fact(n)
  if n <= 1 then
    return 1
  end
  return n * fact(n - 1)
end

on key "space" do
  broadcast("jump")
  say_for("hi" .. score, 2)
end

on message "jump" do
  repeat 10 do
    y += 2
  end
  repeat until y <= 0 do
    y -= 1
  end
  for i = 1, len(items) do
    print(items[i])
  end
  for it in items do
    push(items, it)
  end
  while not key_down("a") and timer() < 3 do
    turn(15)
  end
  wait until x > 10
  items[1] = (1 + 2) * 3 ^ -2
end
`,
  comments: `-- top
on start do -- header comment moves into the body
  -- first
  x = 1

  -- after blank
  y = 2 -- same line
  -- trailing in block
end -- after end
-- bottom
`,
};

describe('round-trip (canonical)', () => {
  for (const [name, text] of Object.entries(FIXTURES)) {
    it(`${name}: print(parse(t)) is a fixed point`, () => {
      const once = canon(text);
      expect(canon(once)).toBe(once);
      expect(irEqual(parse(once).module, parse(text).module)).toBe(true);
    });
  }

  it('sample is already canonical', () => {
    expect(canon(FIXTURES.sample!)).toBe(FIXTURES.sample);
    expect(canon(FIXTURES.everything!)).toBe(FIXTURES.everything);
  });

  it('normalizes whitespace and redundant parens', () => {
    expect(canon('var   a=( 1+2 )\n\n\n\nvar b=a*(2)')).toBe('var a = 1 + 2\n\nvar b = a * 2\n');
  });

  it('moves header comments into the body without losing them', () => {
    const out = canon(FIXTURES.comments!);
    for (const c of [
      'top',
      'header comment',
      'first',
      'after blank',
      'same line',
      'trailing in block',
      'after end',
      'bottom',
    ])
      expect(out).toContain(c);
  });
});

// ---- property test: random IR -> print -> parse ≅ IR ----

describe('round-trip (property)', () => {
  it('parse(print(ir)) ≅ ir for random programs', () => {
    fc.assert(
      fc.property(moduleArb, (m) => {
        const text = printModule(m);
        const r = parse(text);
        if (r.diagnostics.length)
          throw new Error(`diagnostics for:\n${text}\n${JSON.stringify(r.diagnostics)}`);
        if (!irEqual(r.module, m)) throw new Error(`mismatch for:\n${text}`);
        expect(printModule(r.module)).toBe(text);
      }),
      { numRuns: 500 },
    );
  });
});
