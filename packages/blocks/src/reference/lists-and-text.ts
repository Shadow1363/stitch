import type { DocSection } from '../registry';

export const listsAndText: DocSection = {
  id: 'lists-and-text',
  title: 'Lists and text',
  entries: [
    {
      id: 'len',
      doc: 'The number of items in a list, keys in a dictionary, or characters in text.',
      example: `say(len(fruit))`,
      alt: 'say length of fruit',
    },
    {
      id: 'push',
      doc: 'Adds an item to the end of a list.',
      example: `push(fruit, "kiwi")`,
      alt: 'add kiwi to fruit',
    },
    {
      id: 'insert',
      doc: 'Inserts an item at position `index`, moving later items along. `index` can be one past the end.',
      example: `insert(fruit, 1, "lime")`,
      alt: 'insert lime at 1 of fruit',
    },
    {
      id: 'remove',
      doc: 'Deletes item `index` of a list, or key `index` of a dictionary.',
      example: `remove(fruit, 1)`,
      alt: 'delete item 1 of fruit',
    },
    {
      id: 'contains',
      doc: 'Whether a list has the item (compared like `==`), a dictionary has the key, or text contains other text (case-sensitive).',
      example: `if contains(fruit, "fig") then
  say("Figs!")
end`,
      alt: 'if fruit contains fig? then say Figs!',
    },
    {
      id: 'clear',
      doc: 'Deletes every item of a list, or every key of a dictionary.',
      example: `clear(items)`,
      alt: 'delete all of items',
    },
    {
      id: 'index_of',
      doc: "Where `item` first appears in the list, from 1, or 0 when it isn't there.",
      example: `print(index_of(["a", "b"], "b"))`,
      alt: 'print item # of b in list a b',
    },
  ],
};
