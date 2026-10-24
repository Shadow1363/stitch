import type { DocSection } from '../registry';

/**
 * The sprite properties. The reporters that also count as built-in variables (`timer()`,
 * `mouse_x()`…) keep their entries in their own sections and are marked with a `scope`.
 */
export const builtinVariables: DocSection = {
  id: 'built-in-variables',
  title: 'Built-in variables',
  entries: [
    {
      id: 'x',
      title: '`x` — sprite property',
      doc: "The sprite's x position. Setting it moves the sprite (and draws if the pen is down).",
      example: `x += 5`,
      alt: 'set x change by 5',
      scope: 'clone',
    },
    {
      id: 'y',
      title: '`y` — sprite property',
      doc: "The sprite's y position. Up is positive on a stage whose y axis points up (the default).",
      example: `if y < -150 then
  y = 150
end`,
      alt: 'if y < -150 then set y to 150',
      scope: 'clone',
    },
    {
      id: 'direction',
      title: '`direction` — sprite property',
      doc: 'Where the sprite points, in degrees: 0 is up, 90 is right, -90 is left.',
      example: `direction = 180`,
      alt: 'set direction to 180',
      scope: 'clone',
    },
    {
      id: 'size',
      title: '`size` — sprite property',
      doc: "The sprite's size in percent of its costume (100 is the costume's own size).",
      example: `size = size * 1.1`,
      alt: 'set size to size * 1.1',
      scope: 'clone',
    },
    {
      id: 'costume_number',
      title: '`costume_number` — sprite property',
      doc: "The number of the sprite's costume, from 1. Read-only: change it with `costume()` or `next_costume()`.",
      example: `say(costume_number)`,
      alt: 'say costume number',
      scope: 'clone',
    },
  ],
};
