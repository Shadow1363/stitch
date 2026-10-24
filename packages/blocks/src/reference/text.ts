import type { DocSection } from '../registry';

export const text: DocSection = {
  id: 'text',
  title: 'Text',
  entries: [
    {
      id: 'split',
      doc: 'A list of the pieces of `text` between separators. An empty separator splits into letters.',
      example: `local words = split("a b c", " ")`,
      alt: 'local words = split a b c by space',
    },
    {
      id: 'join',
      doc: 'The items of a list as one text, with `separator` between them.',
      example: `say(join(["a", "b"], ", "))`,
      alt: 'say join items of list a b with comma',
    },
    {
      id: 'substring',
      doc: 'Letters `from` to `to` of `text`, counting from 1 and including both ends.',
      example: `say(substring("hello", 2, 4))`,
      alt: 'say letters 2 to 4 of hello',
    },
    {
      id: 'upper',
      doc: 'The text in capitals.',
      example: `say(upper(name))`,
      alt: 'say uppercase name',
    },
    {
      id: 'lower',
      doc: 'The text in small letters.',
      example: `if lower(answer) == "yes" then
  say("OK")
end`,
      alt: 'if lowercase answer = yes then say OK',
    },
    {
      id: 'format_number',
      doc: 'A number as text with a fixed number of decimals (0–20).',
      example: `say(format_number(3.14159, 2))`,
      alt: 'say 3.14159 to 2 decimals',
    },
  ],
};
