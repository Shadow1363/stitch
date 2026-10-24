import type { DocSection } from '../registry';

export const variables: DocSection = {
  id: 'variables',
  title: 'Variables',
  entries: [
    {
      id: 'var',
      title: '`var` — sprite variable',
      snippet: 'var ${name} = ${0}',
      keywords: ['var'],
      doc: "Declares a variable at the top of a file. In a sprite file each sprite has its own copy, and so does each of its clones, which start with their parent's value (Scratch's \"for this sprite only\"). In the Stage file it belongs to the stage. The starting value can't wait or call your own functions.",
      example: `var lives = 3
var speed = 2.5`,
      alt: 'var lives = 3, var speed = 2.5',
    },
    {
      id: 'global-var',
      title: '`global var` — global variable',
      snippet: 'global var ${name} = ${0}',
      keywords: ['global'],
      doc: 'Shared by every sprite and the stage. Declare it in any file (usually the Stage); every file can read and write it. If two files declare the same global, the first value wins.',
      example: `global var score = 0`,
      alt: 'global var score = 0',
    },
    {
      id: 'shared-var',
      title: '`shared var` — shared by a sprite and its clones',
      snippet: 'shared var ${name} = ${0}',
      keywords: ['shared'],
      doc: 'One value for a sprite and all of its clones: when any of them changes it, they all see the change. Use it for things the whole family counts, like how many enemies are left. Scratch has no such scope ([D26](departures.md)).',
      example: `shared var alive = 0

on clone do
  alive += 1
end`,
      alt: 'shared var alive = 0; when I start as a clone: change alive by 1',
    },
    {
      id: 'local',
      title: '`local` — local variable',
      snippet: 'local ${name} = ${0}',
      keywords: ['local'],
      doc: 'Declares a variable that lives until the end of the enclosing block (script, loop body or `if` branch).',
      example: `local half = size / 2
say(half)`,
      alt: 'local half = size / 2, say half',
    },
    {
      id: 'assign',
      title: '`=`, `+=`, `-=`, `*=`, `/=` — set and change',
      doc: 'Assigns to a variable, a sprite property or a list item. In blocks the operator is a dropdown: *to*, *change by* (`+=`), *minus*, *times* and *divided by*.',
      example: `lives = 3
score += 10
speed *= 0.9`,
      alt: 'set lives to 3, set score change by 10, set speed times 0.9',
    },
    {
      id: 'set-index',
      title: '`list[i] = value` — replace item',
      doc: 'Replaces item `i` of a list. Out of range does nothing, as in Scratch. Indexes can be chained (`grid[2][3] = 1`).',
      example: `fruit[1] = "plum"`,
      alt: 'set item 1 of fruit to plum',
    },
    {
      id: 'props',
      title: 'Sprite properties',
      doc: "`x`, `y`, `direction` and `size` are the sprite's own position, direction (degrees, 0 = up, 90 = right) and size in percent. Read them like variables and assign them like variables. `costume_number` is read-only. They are reserved names, so they can't be declared as variables.",
      example: `x += 5
direction = 180
size = 150
say(costume_number)`,
      alt: 'set x change by 5, set direction to 180, set size to 150, say costume number',
    },
  ],
};
