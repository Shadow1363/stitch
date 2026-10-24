import type { DocSection } from '../registry';

export const operators: DocSection = {
  id: 'operators',
  title: 'Operators',
  entries: [
    {
      id: 'arith',
      title: '`+ - * / % ^` — arithmetic',
      doc: "`%` is modulo, floored like Scratch's (`-1 % 3` is `2`). `^` is power and groups right to left.",
      example: `say(2 + 3 * 4)
say(17 % 5)
say(2 ^ 10)`,
      alt: 'say 2 + 3 * 4, say 17 % 5, say 2 ^ 10',
    },
    {
      id: 'neg',
      title: '`-x` — negate',
      doc: 'Flips the sign of a number: `-x` is `0 - x`.',
      example: `x = -x`,
      alt: 'set x to - x',
    },
    {
      id: 'concat',
      title: '`a .. b` — join',
      doc: 'Joins two values as text.',
      example: `say("Score: " .. score)`,
      alt: 'say join Score: score',
    },
    {
      id: 'compare',
      title: '`== ~= < <= > >=` — compare',
      doc: '`~=` is *not equal*. Numbers and numeric text compare as numbers; other text compares by characters, case-sensitively ([D7](departures.md)).',
      example: `if lives <= 0 then
  say("Game over")
end
if name ~= "" then
  say(name)
end`,
      alt: 'if lives <= 0 then say Game over; if name ~= empty then say name',
    },
    {
      id: 'logic',
      title: '`and`, `or`, `not`',
      keywords: ['and', 'or', 'not'],
      doc: 'Logic on truth values. `and` and `or` always give `true` or `false` ([D11](departures.md)).',
      example: `if key_down("left") and not key_down("right") then
  x -= 2
end`,
      alt: 'if key left pressed and not key right pressed then change x minus 2',
    },
  ],
};
