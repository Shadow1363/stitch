import type { DocSection } from '../registry';

export const events: DocSection = {
  id: 'events',
  title: 'Events',
  entries: [
    {
      id: 'on-start',
      title: '`on start do … end` — when program starts',
      snippet: 'on start do\n\t${}\nend',
      keywords: ['on', 'start'],
      doc: "Runs when you press **Run** (Scratch's green flag).",
      example: `on start do
  goto(0, 0)
  say_for("Hello!", 2)
end`,
      alt: 'when program starts: go to x 0 y 0, say Hello! for 2 seconds',
    },
    {
      id: 'on-key',
      title: '`on key "k" do … end` — when key pressed',
      snippet: 'on key "${space}" do\n\t${}\nend',
      keywords: ['key'],
      doc: 'Runs each time a key is pressed. Key names are `"left"`, `"right"`, `"up"`, `"down"`, `"space"`, `"enter"`, `"escape"`, letters and digits ([D8](departures.md)).',
      example: `on key "space" do
  next_costume()
end`,
      alt: 'when space key pressed: next costume',
    },
    {
      id: 'on-message',
      title: '`on message "m" do … end` — when I receive',
      snippet: 'on message "${message}" do\n\t${}\nend',
      keywords: ['message'],
      doc: 'Runs when any sprite or the stage broadcasts the message. See [Messages](#messages).',
      example: `on message "game over" do
  hide()
end`,
      alt: 'when I receive game over: hide',
    },
    {
      id: 'on-clone',
      title: '`on clone do … end` — when I start as a clone',
      snippet: 'on clone do\n\t${}\nend',
      keywords: ['clone'],
      doc: "Runs in each new clone, from the tick after it's made. Only the clone runs it, not the sprite it was cloned from. See [Clones](#clones).",
      example: `on clone do
  goto(random(-200, 200), 180)
  show()
end`,
      alt: 'when I start as a clone: go to x pick random -200 to 200 y 180, show',
    },
    {
      id: 'on-click',
      title: '`on click do … end` — when this sprite clicked',
      snippet: 'on click do\n\t${}\nend',
      keywords: ['click'],
      doc: 'Runs when the sprite is clicked on stage. The topmost sprite under the pointer gets the click; in the Stage file, it runs when the click lands on no sprite.',
      example: `on click do
  say_for("Ouch!", 1)
end`,
      alt: 'when this sprite clicked: say Ouch! for 1 seconds',
    },
    {
      id: 'on-backdrop',
      title: '`on backdrop "b" do … end` — when backdrop switches to',
      snippet: 'on backdrop "${backdrop1}" do\n\t${}\nend',
      keywords: ['backdrop'],
      doc: 'Runs when the stage switches to the backdrop with this name, from [`backdrop`](#backdropbackdrop--command), `backdrop_wait` or `next_backdrop`.',
      example: `on backdrop "night" do
  show()
end`,
      alt: 'when backdrop switches to night: show',
    },
    {
      id: 'on-greater',
      title: '`on timer > n do … end` — when timer or loudness is more than',
      snippet: 'on ${timer} > ${10} do\n\t${}\nend',
      keywords: ['timer', 'loudness'],
      doc: 'Runs once each time the [timer](#timer--reporter) or the microphone [loudness](#loudness--reporter) rises above `n`. It runs again only after the value drops back to `n` or below and rises again, as in Scratch. `n` is a plain number.',
      example: `on timer > 5 do
  say("Five seconds!")
end`,
      alt: 'when timer > 5: say Five seconds!',
    },
  ],
};
