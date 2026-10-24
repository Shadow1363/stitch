import type { DocSection } from '../registry';

export const map: DocSection = {
  id: 'map',
  title: 'Map',
  entries: [
    {
      id: 'tile_at',
      doc: "The tile at a position, or 0 when it's empty, off the map, or there is no map.",
      example: `if tile_at(x, y - 16) == 1 then
  say("On the ground")
end`,
      alt: 'if tile at x x y (y - 16) = 1 then say On the ground',
    },
    {
      id: 'set_tile',
      doc: 'Changes the tile at a position. Off the map, it does nothing.',
      example: `set_tile(x, y, 0)`,
      alt: 'set tile at x x y y to 0',
    },
    {
      id: 'map_cell',
      doc: 'The tile at a map cell, counting columns and rows from 1 at the top-left. 0 is empty or off the map.',
      example: `if map_cell(3, 4) == 1 then
  say("wall")
end`,
      alt: 'if tile at column 3 row 4 = 1 then say wall',
    },
    {
      id: 'set_map_cell',
      doc: 'Changes the tile at a map cell (0 clears it). Off the map, nothing happens.',
      example: `set_map_cell(3, 4, 2)`,
      alt: 'set tile at column 3 row 4 to 2',
    },
    {
      id: 'map_width',
      doc: "The map's width in cells (0 without a map).",
      example: `print(map_width())`,
      alt: 'print map width',
      scope: 'global',
    },
    {
      id: 'map_height',
      doc: "The map's height in cells.",
      example: `print(map_height())`,
      alt: 'print map height',
      scope: 'global',
    },
    {
      id: 'tile_size',
      doc: "The map's tile size in stage pixels.",
      example: `goto(col * tile_size(), row * tile_size())`,
      alt: 'go to x col * tile size y row * tile size',
      scope: 'global',
    },
  ],
};
