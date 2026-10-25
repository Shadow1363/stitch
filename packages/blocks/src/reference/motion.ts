import type { DocSection } from '../registry';

export const motion: DocSection = {
  id: 'motion',
  title: 'Motion',
  entries: [
    {
      id: 'move',
      doc: "Moves `steps` along the sprite's direction.",
      example: `move(10)`,
      alt: 'move 10 steps',
    },
    {
      id: 'turn',
      doc: 'Turns clockwise by `degrees`.',
      example: `turn(15)`,
      alt: 'turn 15 degrees',
    },
    {
      id: 'goto',
      doc: 'Jumps to a position.',
      example: `goto(0, 0)`,
      alt: 'go to x 0 y 0',
    },
    {
      id: 'point',
      doc: 'Sets the direction: 0 up, 90 right, 180 down, -90 left.',
      example: `point(90)`,
      alt: 'point in direction 90',
    },
    {
      id: 'point_towards',
      doc: 'Turns to face a position ([D10](departures.md)).',
      example: `point_towards(0, 0)`,
      alt: 'point towards x 0 y 0',
    },
    {
      id: 'bounce',
      doc: "If the sprite's box crosses an edge of the stage, reflects its direction away from that edge and moves it back on stage ([D3](departures.md)).",
      example: `forever do
  move(4)
  bounce()
end`,
      alt: 'forever: move 4 steps, if on edge bounce',
    },
    {
      id: 'clamp_to_stage',
      doc: 'Moves the sprite so its box is inside the stage. Stitch never does this by itself ([D1](departures.md)).',
      example: `x += 5
clamp_to_stage()`,
      alt: 'change x by 5, keep on stage',
    },
    {
      id: 'on_edge',
      doc: 'The edge the sprite\'s box crosses: `"left"`, `"right"`, `"top"`, `"bottom"`, or `""` when it\'s inside ([D3](departures.md)).',
      example: `if on_edge() == "left" then
  vx = -vx
end`,
      alt: 'if edge touched = left then set vx to - vx',
      scope: 'clone',
    },
    {
      id: 'angle_to',
      doc: 'The direction from the sprite to a position.',
      example: `point(angle_to(100, 50))`,
      alt: 'point in direction (direction to x 100 y 50)',
    },
    {
      id: 'distance_to',
      doc: 'The distance from the sprite to a position.',
      example: `if distance_to(player_x, player_y) < 20 then
  say("Got you!")
end`,
      alt: 'if distance to x player_x y player_y < 20 then say Got you!',
    },
    {
      id: 'goto_random',
      doc: 'Jumps to a random point on the stage.',
      example: `goto_random()`,
      alt: 'go to random position',
    },
    {
      id: 'goto_sprite',
      doc: 'Jumps to another sprite\'s position. `sprite` is a name, a clone id from [`my_id`](#my_id--reporter), `"mouse"` or `"random"`.',
      example: `goto_sprite("Player")`,
      alt: 'go to Player',
    },
    {
      id: 'glide',
      doc: 'Moves smoothly to a position over `seconds`, in whole ticks like [`wait`](#waitseconds--command-waits) ([D4](departures.md)).',
      example: `glide(1, 100, 0)`,
      alt: 'glide 1 secs to x 100 y 0',
    },
    {
      id: 'glide_to',
      doc: 'Glides to another sprite, `"mouse"` or `"random"` (a random spot on stage) over `seconds`. A sprite that doesn\'t exist does nothing.',
      example: `glide_to(1, "mouse")`,
      alt: 'glide 1 secs to mouse',
    },
    {
      id: 'point_towards_sprite',
      doc: 'Turns to face another sprite (or `"mouse"`).',
      example: `point_towards_sprite("Player")`,
      alt: 'point towards Player',
    },
    {
      id: 'rotation_style',
      doc: 'How the costume turns with direction: `"all around"` (the default), `"left-right"` (mirrors when facing left) or `"don\'t rotate"`.',
      example: `rotation_style("left-right")`,
      alt: 'set rotation style left-right',
    },
  ],
};
