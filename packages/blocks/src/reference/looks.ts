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
      doc: 'Sets a graphic effect: `"ghost"` (0–100, see-through), `"brightness"` (-100–100) or `"color"` (hue; 200 is a full turn).',
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
