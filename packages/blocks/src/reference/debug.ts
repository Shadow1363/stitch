import type { DocSection } from '../registry';

export const debug: DocSection = {
  id: 'debug',
  title: 'Debug',
  entries: [
    {
      id: 'print',
      doc: "Writes a line to the editor's **Console** (and the browser console in exported games), prefixed with the sprite's name.",
      example: `print("x is " .. x)`,
      alt: 'print join x is x',
    },
    {
      id: 'watch',
      doc: "Shows `label: value` in a monitor at the top-left of the stage, updated each time it runs. Scratch's variable checkboxes do this automatically; in Stitch you choose what to watch ([D29](departures.md)).",
      example: `forever do
  watch("score", score)
end`,
      alt: 'forever: watch score as score',
    },
    {
      id: 'unwatch',
      doc: 'Takes down the monitor that `watch` put up with this label, like hiding a variable in Scratch.',
      example: `unwatch("score")`,
      alt: 'stop watching score',
    },
    {
      id: 'assert',
      doc: 'Stops the script with an error when `condition` is false, pointing at this line. Use it to catch mistakes early.',
      example: `assert(hp >= 0, "hp went negative")`,
      alt: 'assert hp >= 0 else hp went negative',
    },
  ],
};
