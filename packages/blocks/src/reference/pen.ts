import type { DocSection } from '../registry';

export const pen: DocSection = {
  id: 'pen',
  title: 'Pen',
  entries: [
    {
      id: 'pen_down',
      doc: 'Starts drawing: the sprite leaves a line wherever it moves, and a dot where it is.',
      example: `pen_down()
move(100)
pen_up()`,
      alt: 'pen down, move 100 steps, pen up',
    },
    {
      id: 'pen_up',
      doc: 'Stops drawing.',
      example: `pen_up()`,
      alt: 'pen up',
    },
    {
      id: 'clear_pen',
      doc: 'Erases everything the pen has drawn.',
      example: `clear_pen()`,
      alt: 'erase all',
    },
    {
      id: 'stamp',
      doc: "Draws the sprite's current look onto the pen layer.",
      example: `repeat 6 do
  stamp()
  turn(60)
end`,
      alt: 'repeat 6: stamp, turn 60 degrees',
    },
    {
      id: 'set_pen_color',
      doc: 'Sets the pen colour: `"#rrggbb"` or a palette number 1–16.',
      example: `set_pen_color("#29adff")`,
      alt: 'set pen color to #29adff',
    },
    {
      id: 'change_pen_color',
      doc: "Shifts the pen's hue. 100 is a full turn of the colour wheel, as in Scratch.",
      example: `change_pen_color(10)`,
      alt: 'change pen color by 10',
    },
    {
      id: 'set_pen_size',
      doc: 'Sets the line width in stage pixels (1–1200). [`draw_text`](#draw_texttext-x-y--command) uses it as its scale.',
      example: `set_pen_size(4)`,
      alt: 'set pen size to 4',
    },
    {
      id: 'change_pen_size',
      doc: 'Changes the pen size.',
      example: `change_pen_size(1)`,
      alt: 'change pen size by 1',
    },
    {
      id: 'set_pen_transparency',
      doc: '0 is solid, 100 is invisible.',
      example: `set_pen_transparency(50)`,
      alt: 'set pen transparency to 50',
    },
    {
      id: 'change_pen_transparency',
      doc: 'Changes the pen transparency.',
      example: `change_pen_transparency(10)`,
      alt: 'change pen transparency by 10',
    },
    {
      id: 'set_pen_hue',
      doc: "Sets the pen hue on Scratch's 0–100 colour wheel (wrapping around), keeping saturation and brightness.",
      example: `set_pen_hue(50)`,
      alt: 'set pen hue to 50',
    },
    {
      id: 'set_pen_saturation',
      doc: '0 is grey, 100 is full colour.',
      example: `set_pen_saturation(50)`,
      alt: 'set pen saturation to 50',
    },
    {
      id: 'change_pen_saturation',
      doc: 'Changes the pen saturation, staying within 0–100.',
      example: `change_pen_saturation(-10)`,
      alt: 'change pen saturation by -10',
    },
    {
      id: 'set_pen_brightness',
      doc: '0 is black, 100 is full brightness.',
      example: `set_pen_brightness(50)`,
      alt: 'set pen brightness to 50',
    },
    {
      id: 'change_pen_brightness',
      doc: 'Changes the pen brightness, staying within 0–100.',
      example: `change_pen_brightness(10)`,
      alt: 'change pen brightness by 10',
    },
    {
      id: 'draw_line',
      doc: 'Draws a line between two points.',
      example: `draw_line(-100, 0, 100, 0)`,
      alt: 'draw line from x -100 y 0 to x 100 y 0',
    },
    {
      id: 'draw_rect',
      doc: "Draws a rectangle's outline between two opposite corners.",
      example: `draw_rect(-50, -30, 50, 30)`,
      alt: 'draw rectangle from x -50 y -30 to x 50 y 30',
    },
    {
      id: 'fill_rect',
      doc: 'Fills a rectangle between two opposite corners.',
      example: `fill_rect(0, 0, 8, 8)`,
      alt: 'fill rectangle from x 0 y 0 to x 8 y 8',
    },
    {
      id: 'draw_circle',
      doc: "Draws a circle's outline.",
      example: `draw_circle(0, 0, 40)`,
      alt: 'draw circle at x 0 y 0 radius 40',
    },
    {
      id: 'fill_circle',
      doc: 'Fills a circle.',
      example: `fill_circle(0, 0, 40)`,
      alt: 'fill circle at x 0 y 0 radius 40',
    },
    {
      id: 'draw_text',
      doc: "Writes text in Stitch's built-in 3×5 pixel font, with its top-left corner at (x, y). Letters are drawn as capitals, each font pixel is `pen size` stage pixels, and `\\n` starts a new line. It's for HUDs and scores: crisp at any scale and the same in every player ([D31](departures.md)).",
      example: `set_pen_size(2)
draw_text("HP " .. hp, -230, 170)`,
      alt: 'set pen size to 2, write join HP hp at x -230 y 170',
    },
  ],
};
