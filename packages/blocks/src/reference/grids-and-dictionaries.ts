import type { DocSection } from '../registry';

export const gridsAndDictionaries: DocSection = {
  id: 'grids-and-dictionaries',
  title: 'Grids and dictionaries',
  entries: [
    {
      id: 'make_grid',
      doc: 'A new grid of `height` rows, each `width` cells of `value`. At most 1,000,000 cells.',
      example: `local g = make_grid(16, 12, 0)`,
      alt: 'local g = grid 16 by 12 of 0',
    },
    {
      id: 'cell',
      doc: 'The cell at column `x`, row `y` (from 1), or `""` outside the grid.',
      example: `if cell(g, 3, 2) == 1 then
  say("wall")
end`,
      alt: 'if cell x 3 y 2 of g = 1 then say wall',
    },
    {
      id: 'set_cell',
      doc: 'Changes one cell. Outside the grid, nothing happens.',
      example: `set_cell(g, 3, 2, 1)`,
      alt: 'set cell x 3 y 2 of g to 1',
    },
    {
      id: 'grid_width',
      doc: 'The number of columns.',
      example: `print(grid_width(g))`,
      alt: 'print width of grid g',
    },
    {
      id: 'grid_height',
      doc: 'The number of rows.',
      example: `print(grid_height(g))`,
      alt: 'print height of grid g',
    },
    {
      id: 'fill_grid',
      doc: 'Sets every cell to `value`.',
      example: `fill_grid(g, 0)`,
      alt: 'fill grid g with 0',
    },
    {
      id: 'dict',
      doc: 'A new, empty dictionary.',
      example: `local stats = dict()
stats["hp"] = 10
stats["name"] = "orc"
say(stats["name"])`,
      alt: 'local stats = empty dictionary, replace item hp of stats with 10, replace item name of stats with orc, say item name of stats',
    },
    {
      id: 'keys',
      doc: "A dictionary's keys, in the order they were added, as a list.",
      example: `for k in keys(stats) do
  print(k .. " = " .. stats[k])
end`,
      alt: 'for each k in keys of stats: print join k = item k of stats',
    },
    {
      id: 'has_key',
      doc: 'True when the dictionary has the key.',
      example: `if not has_key(stats, "hp") then
  stats["hp"] = 1
end`,
      alt: 'if not stats has key hp then replace item hp of stats with 1',
    },
  ],
};
