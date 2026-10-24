import type { DocSection } from '../registry';

export const programsAndFiles: DocSection = {
  id: 'programs-and-files',
  title: 'Programs and files',
  entries: [
    {
      id: 'comment',
      title: 'Comments',
      doc: 'A comment above an item or statement is attached to its block. A comment at the end of a line stays at the end of that line in text.',
      example: `-- Spin slowly, forever.
on start do
  forever do
    turn(1) -- one degree per tick
  end
end`,
      alt: 'when program starts (with a comment icon), forever, turn 1 degrees',
    },
  ],
};
