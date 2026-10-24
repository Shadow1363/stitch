import type { DocSection } from '../registry';

export const control: DocSection = {
  id: 'control',
  title: 'Control',
  entries: [
    {
      id: 'if',
      title: '`if … then … elseif … else … end`',
      snippet: 'if ${condition} then\n\t${}\nend',
      keywords: ['if', 'then', 'elseif', 'else'],
      doc: 'Runs the first branch whose condition is true. `elseif` and `else` are optional; in blocks the gear adds them.',
      example: `if score > 10 then
  say("Great!")
elseif score > 5 then
  say("Good")
else
  say("Keep going")
end`,
      alt: 'if score > 10 then say Great! else if score > 5 then say Good else say Keep going',
    },
    {
      id: 'forever',
      title: '`forever do … end`',
      snippet: 'forever do\n\t${}\nend',
      keywords: ['forever'],
      doc: 'Repeats until the script is stopped.',
      example: `forever do
  turn(3)
end`,
      alt: 'forever: turn 3 degrees',
    },
    {
      id: 'repeat',
      title: '`repeat n do … end`',
      snippet: 'repeat ${10} do\n\t${}\nend',
      keywords: ['repeat'],
      doc: 'Repeats `n` times (rounded).',
      example: `repeat 10 do
  move(5)
end`,
      alt: 'repeat 10: move 5 steps',
    },
    {
      id: 'repeat-until',
      title: '`repeat until c do … end`',
      snippet: 'repeat until ${condition} do\n\t${}\nend',
      keywords: ['until'],
      doc: 'Repeats while `c` is false, checking before each iteration.',
      example: `repeat until x > 200 do
  x += 4
end`,
      alt: 'repeat until x > 200: change x by 4',
    },
    {
      id: 'while',
      title: '`while c do … end`',
      snippet: 'while ${condition} do\n\t${}\nend',
      keywords: ['while'],
      doc: 'Repeats while `c` is true, checking before each iteration.',
      example: `while key_down("space") do
  size += 1
end`,
      alt: 'while key space pressed: change size by 1',
    },
    {
      id: 'for',
      title: '`for i = a, b do … end` — count',
      snippet: 'for ${i} = ${1}, ${10} do\n\t${}\nend',
      keywords: ['for'],
      doc: 'Counts `i` from `a` to `b`, both included, in steps of 1. `i` is local to the loop.',
      example: `for i = 1, 5 do
  say(i)
  wait(0.5)
end`,
      alt: 'for i from 1 to 5: say i, wait 0.5 seconds',
    },
    {
      id: 'for-step',
      title: '`for i = a, b, step do … end` — count by',
      snippet: 'for ${i} = ${1}, ${10}, ${2} do\n\t${}\nend',
      doc: 'Counts with a step. A negative step counts down.',
      example: `for i = 10, 0, -2 do
  say(i)
  wait(0.2)
end`,
      alt: 'for i from 10 to 0 by -2: say i, wait 0.2 seconds',
    },
    {
      id: 'for-each',
      title: '`for item in list do … end` — for each',
      snippet: 'for ${item} in ${list} do\n\t${}\nend',
      keywords: ['in'],
      doc: 'Runs once per item of a list (a copy taken when the loop starts), or once per character of a string.',
      example: `for f in fruit do
  say_for(f, 1)
end`,
      alt: 'for each f in fruit: say f for 1 seconds',
    },
    {
      id: 'wait-until',
      title: '`wait until c`',
      snippet: 'wait until ${condition}',
      keywords: ['wait'],
      doc: 'Waits until `c` is true, checking once per tick.',
      example: `wait until key_down("space")
say("Go!")`,
      alt: 'wait until key space pressed, say Go!',
    },
    {
      id: 'break',
      title: '`break`',
      snippet: 'break',
      keywords: ['break'],
      doc: 'Leaves the innermost loop. Like `return`, it must be the last statement of its block, so it usually sits in an `if` ([D30](departures.md)).',
      example: `for i = 1, 100 do
  if tile_at(i * 8, 0) == 1 then
    break
  end
  set_tile(i * 8, 0, 2)
end`,
      alt: 'for i from 1 to 100: if tile at x i * 8 y 0 = 1 then break; set tile',
    },
    {
      id: 'continue',
      title: '`continue`',
      snippet: 'continue',
      keywords: ['continue'],
      doc: 'Skips the rest of this iteration. The loop still waits for the next tick before going round again (one iteration per tick, [D5](departures.md)). Like `break`, it ends its block.',
      example: `for item in items do
  if item == "" then
    continue
  end
  print(item)
end`,
      alt: 'for each item in items: if item = empty then continue; print item',
    },
  ],
};
