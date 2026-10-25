import type { DocSection } from '../registry';

export const looks: DocSection = {
  id: 'looks',
  title: 'Looks',
  entries: [
    {
      id: 'costume',
      doc: 'Switches to the costume named `costume`, or to costume number `costume` (from 1, wrapping around).',
      example: `costume("jump")
costume(1)`,
      alt: 'switch costume to jump, switch costume to 1',
    },
    {
      id: 'next_costume',
      doc: 'Switches to the next costume, wrapping to the first.',
      example: `forever do
  next_costume()
  wait(0.1)
end`,
      alt: 'forever: next costume, wait 0.1 seconds',
    },
    {
      id: 'say',
      doc: 'Shows a speech bubble until something else is said. `say("")` removes it.',
      example: `say("Hello!")`,
      alt: 'say Hello!',
    },
    {
      id: 'say_for',
      doc: 'Shows a speech bubble, waits, then removes it (unless something else was said meanwhile).',
      example: `say_for("Hmm…", 2)`,
      alt: 'say Hmm… for 2 seconds',
    },
    {
      id: 'show',
      doc: 'Makes the sprite visible.',
      example: `show()`,
      alt: 'show',
    },
    {
      id: 'hide',
      doc: 'Hides the sprite. Hidden sprites still run their scripts.',
      example: `hide()`,
      alt: 'hide',
    },
    {
      id: 'think',
      doc: 'Shows a thought bubble. `think("")` removes it.',
      example: `think("Hmm...")`,
      alt: 'think Hmm...',
    },
    {
      id: 'think_for',
      doc: 'Thinks for a while, then removes the bubble.',
      example: `think_for("Hmm...", 2)`,
      alt: 'think Hmm... for 2 seconds',
    },
    {
      id: 'costume_name',
      doc: "The current costume's name.",
      example: `say(costume_name())`,
      alt: 'say costume name',
      scope: 'clone',
    },
    {
      id: 'set_effect',
      doc: 'Sets a graphic effect: `"ghost"` (0–100, see-through), `"brightness"` (-100–100), `"color"` (hue; 200 is a full turn), or one that bends the costume: `"fisheye"`, `"whirl"` (degrees at the centre), `"pixelate"` or `"mosaic"`, on Scratch\'s scales. Touching follows the bent shape.',
      example: `set_effect("ghost", 50)`,
      alt: 'set ghost effect to 50',
    },
    {
      id: 'change_effect',
      doc: 'Changes a graphic effect by an amount.',
      example: `change_effect("color", 25)`,
      alt: 'change color effect by 25',
    },
    {
      id: 'backdrop',
      doc: 'Switches the stage to a backdrop, by name or 1-based number, or to `"next backdrop"`, `"previous backdrop"` or `"random backdrop"` (a different one). Starts every [`on backdrop`](#on-backdrop-b-do--end--when-backdrop-switches-to) script for it. Backdrops are the stage\'s costumes, painted in the Costumes tab with the Stage file selected.',
      example: `backdrop("night")`,
      alt: 'switch backdrop to night',
    },
    {
      id: 'backdrop_wait',
      doc: 'Like `backdrop`, then waits until the `on backdrop` scripts it started have finished.',
      example: `backdrop_wait("level 2")`,
      alt: 'switch backdrop to level 2 and wait',
    },
    {
      id: 'next_backdrop',
      doc: 'Switches to the next backdrop, back to the first after the last.',
      example: `next_backdrop()`,
      alt: 'next backdrop',
    },
    {
      id: 'backdrop_number',
      doc: "The current backdrop's number, from 1 (0 when the stage has none).",
      example: `say(backdrop_number())`,
      alt: 'say backdrop number',
      scope: 'global',
    },
    {
      id: 'backdrop_name',
      doc: "The current backdrop's name.",
      example: `say(backdrop_name())`,
      alt: 'say backdrop name',
      scope: 'global',
    },
    {
      id: 'clear_effects',
      doc: 'Turns every graphic effect off.',
      example: `clear_effects()`,
      alt: 'clear graphic effects',
    },
    {
      id: 'go_to_front',
      doc: 'Draws the sprite in front of all others.',
      example: `go_to_front()`,
      alt: 'go to front layer',
    },
    {
      id: 'go_to_back',
      doc: 'Draws the sprite behind all others (still in front of the pen and the map).',
      example: `go_to_back()`,
      alt: 'go to back layer',
    },
    {
      id: 'change_layer',
      doc: 'Moves the sprite forward `by` layers, or back for a negative number.',
      example: `change_layer(-1)`,
      alt: 'go forward -1 layers',
    },
  ],
};
