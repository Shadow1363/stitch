import type { DocSection } from '../registry';

export const rawCode: DocSection = {
  id: 'raw-code',
  title: 'Raw code',
  entries: [
    {
      id: 'raw',
      title: 'Raw code',
      doc: '',
      example: `on start do
  move(10
end

function (`,
      alt: 'a when program starts script holding a code block, and a top-level code block',
    },
  ],
};
