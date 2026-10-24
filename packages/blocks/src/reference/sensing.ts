import type { DocSection } from '../registry';

export const sensing: DocSection = {
  id: 'sensing',
  title: 'Sensing',
  entries: [
    {
      id: 'key_down',
      doc: 'Whether a key is held down. Key names as in [`on key`](#on-key-k-do--end--when-key-pressed); `"any"` means any key.',
      example: `if key_down("right") then
  x += 3
end`,
      alt: 'if key right pressed then change x by 3',
    },
    {
      id: 'key_pressed',
      doc: "True only on the tick the key went down, so holding it counts once. `key_down` is true for as long as it's held. Good for turn-based moves and menus.",
      example: `if key_pressed("right") then
  x += 8
end`,
      alt: 'if key right just pressed then change x by 8',
    },
    {
      id: 'mouse_x',
      doc: "The pointer's x in stage coordinates.",
      example: `goto(mouse_x(), mouse_y())`,
      alt: 'go to x mouse x y mouse y',
      scope: 'global',
    },
    {
      id: 'mouse_y',
      doc: "The pointer's y in stage coordinates.",
      example: `print(mouse_y())`,
      alt: 'print mouse y',
      scope: 'global',
    },
    {
      id: 'mouse_down',
      doc: 'True while a mouse button (or a finger) is down on the stage.',
      example: `wait until mouse_down()`,
      alt: 'wait until mouse down',
      scope: 'global',
    },
    {
      id: 'touching',
      doc: 'True when an opaque pixel of this sprite overlaps one of the other sprite (or of any of its clones, given a name). Also takes `"mouse"` and `"edge"`.',
      example: `if touching("Coin") then
  score += 1
end`,
      alt: 'if touching Coin then change score by 1',
    },
    {
      id: 'touching_edge',
      doc: "True when the sprite's box reaches an edge of the stage. [`on_edge`](#on_edge--reporter) says which one.",
      example: `if touching_edge() then
  delete_clone()
end`,
      alt: 'if touching edge then delete this clone',
      scope: 'clone',
    },
    {
      id: 'touching_mouse',
      doc: 'True when the pointer is over an opaque pixel of the sprite.',
      example: `if touching_mouse() and mouse_down() then
  say("Got me")
end`,
      alt: 'if touching mouse-pointer and mouse down then say Got me',
      scope: 'clone',
    },
    {
      id: 'touching_color',
      doc: 'True when the sprite is over the colour: on another sprite, the tile map or the stage background. `color` is `"#rrggbb"` or a palette number 1–16. Pen drawing doesn\'t count ([D27](departures.md)).',
      example: `if touching_color("#ff004d") then
  lives -= 1
end`,
      alt: 'if touching color #ff004d then change lives by -1',
    },
    {
      id: 'color_touching',
      doc: 'True when a part of this sprite in `color` is over `other` ([D27](departures.md)).',
      example: `if color_touching("#ffec27", "#29adff") then
  say("splash")
end`,
      alt: 'if color #ffec27 is touching #29adff then say splash',
    },
    {
      id: 'distance_to_sprite',
      doc: 'The distance to another sprite (or `"mouse"`).',
      example: `if distance_to_sprite("Player") < 50 then
  point_towards_sprite("Player")
end`,
      alt: 'if distance to Player < 50 then point towards Player',
    },
    {
      id: 'sprite_at',
      doc: 'The id of the topmost visible sprite with an opaque pixel at a point, or `""`.',
      example: `local who = sprite_at(mouse_x(), mouse_y())`,
      alt: 'local who = sprite at x mouse x y mouse y',
    },
    {
      id: 'x_of',
      doc: "Another sprite's x position (Scratch's *x position of*).",
      example: `goto(x_of("Player"), y_of("Player") + 40)`,
      alt: 'go to x x position of Player y y position of Player + 40',
    },
    {
      id: 'y_of',
      doc: "Another sprite's y position.",
      example: `print(y_of("Player"))`,
      alt: 'print y position of Player',
    },
    {
      id: 'direction_of',
      doc: "Another sprite's direction.",
      example: `point(direction_of("Player"))`,
      alt: 'point in direction direction of Player',
    },
    {
      id: 'costume_of',
      doc: "Another sprite's costume number.",
      example: `costume(costume_of("Player"))`,
      alt: 'switch costume to costume # of Player',
    },
    {
      id: 'var_of',
      doc: 'Another sprite\'s variable (its own `var`, then its `shared var`). For `"stage"`, a stage or global variable. `""` when there\'s none.',
      example: `if var_of("Player", "hp") <= 0 then
  broadcast("game over")
end`,
      alt: 'if hp of Player <= 0 then broadcast game over',
    },
    {
      id: 'ask',
      doc: "Asks the player a question and waits for the answer, which `answer()` then reports. A visible sprite asks in its speech bubble; the stage and hidden sprites show the question above the answer field. Questions from several scripts take turns, in the order asked. The field sits over the bottom of the stage, and keys typed into it don't start `on key` scripts ([D32](departures.md)).",
      example: `ask("What's your name?")
say("Hello, " .. answer())`,
      alt: "ask What's your name? and wait, say join Hello, answer",
    },
    {
      id: 'answer',
      doc: 'The last answer typed for `ask`: one for the whole program, empty until the first answer and after each **Run**.',
      example: `ask("How many?")
repeat answer() do
  create_clone()
end`,
      alt: 'ask How many? and wait, repeat answer: create clone of myself',
      scope: 'global',
    },
    {
      id: 'stage_width',
      doc: "The stage's width in stage pixels, from **Cart → Stage** (480 by default).",
      example: `goto(random(-stage_width() / 2, stage_width() / 2), 0)`,
      alt: 'go to x: pick random -stage width / 2 to stage width / 2 y: 0',
      scope: 'global',
    },
    {
      id: 'stage_height',
      doc: "The stage's height in stage pixels (360 by default).",
      example: `if y > stage_height() / 2 then
  y = -stage_height() / 2
end`,
      alt: 'if y > stage height / 2 then set y to -stage height / 2',
      scope: 'global',
    },
  ],
};
