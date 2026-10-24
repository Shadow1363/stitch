import type { DocSection } from '../registry';

export const messages: DocSection = {
  id: 'messages',
  title: 'Messages',
  entries: [
    {
      id: 'broadcast',
      doc: 'Starts every `on message` script for `message`, and carries on.',
      example: `broadcast("level up")`,
      alt: 'broadcast level up',
    },
    {
      id: 'broadcast_wait',
      doc: 'Starts them and waits until all of them have finished.',
      example: `broadcast_wait("intro")
say("Let's go")`,
      alt: "broadcast intro and wait, say Let's go",
    },
  ],
};
