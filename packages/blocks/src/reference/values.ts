import type { DocSection } from '../registry';

export const values: DocSection = {
  id: 'values',
  title: 'Values',
  entries: [
    {
      id: 'literals',
      title: 'Numbers, strings and booleans',
      keywords: ['true', 'false'],
      doc: 'Literal values fill block slots.',
      example: `say_for("Ready?", 1.5)
show()
if true then
  say(42)
end`,
      alt: 'say Ready? for 1.5 seconds, show, if true then say 42',
    },
    {
      id: 'list-literal',
      title: '`[a, b, …]` — list',
      doc: "Makes a new list. In blocks it's the *create list with* reporter, with a gear to add or remove slots.",
      example: `var fruit = ["apple", "pear", "fig"]`,
      alt: 'var fruit = create list with apple, pear, fig',
    },
    {
      id: 'index',
      title: '`list[i]` — item',
      doc: 'Reads item `i` (from 1) of a list, or character `i` of a string. Out of range gives `""`.',
      example: `say(fruit[2])`,
      alt: 'say item 2 of fruit',
    },
  ],
};
