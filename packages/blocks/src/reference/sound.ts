import type { DocSection } from '../registry';

export const sound: DocSection = {
  id: 'sound',
  title: 'Sound',
  entries: [
    {
      id: 'play_sound',
      doc: 'Starts a sound and carries on. Starting it again overlaps the first, up to 32 voices ([D17](departures.md)).',
      example: `play_sound("coin1")`,
      alt: 'start sound coin1',
    },
    {
      id: 'play_sound_wait',
      doc: 'Plays a sound and waits for its length, measured in ticks ([D15](departures.md)).',
      example: `play_sound_wait("jump1")`,
      alt: 'play sound jump1 until done',
    },
    {
      id: 'stop_sounds',
      doc: 'Stops every sound effect (not music).',
      example: `stop_sounds()`,
      alt: 'stop all sounds',
    },
    {
      id: 'play_music',
      doc: 'Plays a tracker song, replacing any song already playing. Songs set to loop repeat until stopped ([D18](departures.md)).',
      example: `play_music("theme")`,
      alt: 'play music theme',
    },
    {
      id: 'stop_music',
      doc: 'Stops the song.',
      example: `stop_music()`,
      alt: 'stop music',
    },
    {
      id: 'set_volume',
      doc: 'Sets the volume of all sounds and music, 0–100. **Run** resets it to 100.',
      example: `set_volume(50)`,
      alt: 'set volume to 50 %',
    },
    {
      id: 'volume',
      doc: 'The current volume.',
      example: `set_volume(volume() - 10)`,
      alt: 'set volume to (volume - 10) %',
      scope: 'global',
    },
    {
      id: 'change_volume',
      doc: 'Changes the master volume by `by` percent.',
      example: `change_volume(-10)`,
      alt: 'change volume by -10',
    },
  ],
};
