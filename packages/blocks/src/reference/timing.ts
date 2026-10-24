import type { DocSection } from '../registry';

export const timing: DocSection = {
  id: 'timing',
  title: 'Timing',
  entries: [
    {
      id: 'wait',
      doc: 'Waits `round(seconds × 60)` ticks, at least one.',
      example: `wait(1)`,
      alt: 'wait 1 seconds',
    },
    {
      id: 'stop',
      doc: 'Stops this script. Other scripts keep running.',
      example: `if lives == 0 then
  stop()
end`,
      alt: 'if lives = 0 then stop this script',
    },
    {
      id: 'timer',
      doc: 'Seconds since **Run** or the last `reset_timer()`.',
      example: `if timer() > 30 then
  broadcast("time up")
end`,
      alt: 'if timer > 30 then broadcast time up',
      scope: 'global',
    },
    {
      id: 'reset_timer',
      doc: 'Sets the timer back to 0.',
      example: `reset_timer()`,
      alt: 'reset timer',
    },
    {
      id: 'stop_all',
      doc: "Stops every script and deletes every clone, like Scratch's *stop all*. The **Stop** button does the same.",
      example: `if lives == 0 then
  stop_all()
end`,
      alt: 'if lives = 0 then stop all',
    },
    {
      id: 'stop_other_scripts',
      doc: "Stops this sprite's other scripts and keeps this one running.",
      example: `stop_other_scripts()`,
      alt: 'stop other scripts in sprite',
    },
    {
      id: 'delta_time',
      doc: "Seconds per tick: always 1/60, because Stitch runs at a fixed 60 ticks a second ([D28](departures.md)). It's there so code written for a variable frame rate reads naturally.",
      example: `x += 120 * delta_time()`,
      alt: 'change x by 120 * delta time',
      scope: 'global',
    },
    {
      id: 'frame_count',
      doc: 'How many ticks have run since **Run**: 0 in the first tick, then 60 a second. Use it for animation that must stay in step, like blinking every 30 ticks ([D32](departures.md)).',
      example: `if frame_count() % 30 == 0 then
  next_costume()
end`,
      alt: 'if frame count mod 30 = 0 then next costume',
      scope: 'global',
    },
  ],
};
