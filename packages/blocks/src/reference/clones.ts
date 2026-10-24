import type { DocSection } from '../registry';

export const clones: DocSection = {
  id: 'clones',
  title: 'Clones',
  entries: [
    {
      id: 'create_clone',
      doc: "Makes a clone of this sprite (or of this clone). It's drawn just behind its parent.",
      example: `repeat 5 do
  create_clone()
  x += 40
end`,
      alt: 'repeat 5: create clone of myself, change x by 40',
    },
    {
      id: 'create_clone_of',
      doc: 'Makes a clone of another sprite by name (`"myself"` for this one). The stage can use it too.',
      example: `create_clone_of("Enemy")`,
      alt: 'create clone of Enemy',
    },
    {
      id: 'delete_clone',
      doc: 'Deletes this clone and stops its scripts. Does nothing on an original sprite.',
      example: `if y < -180 then
  delete_clone()
end`,
      alt: 'if y < -180 then delete this clone',
    },
    {
      id: 'is_clone',
      doc: 'True in a clone, false in the original sprite.',
      example: `if not is_clone() then
  hide()
end`,
      alt: 'if not I am a clone then hide',
      scope: 'clone',
    },
    {
      id: 'clone_count',
      doc: 'How many clones of this sprite exist now.',
      example: `say(clone_count())`,
      alt: 'say clone count',
      scope: 'sprite',
    },
    {
      id: 'clones',
      doc: "The ids of a sprite's live clones, oldest first, as a list.",
      example: `for e in clones("Enemy") do
  print(e .. " is at " .. x_of(e))
end`,
      alt: 'for each e in clones of Enemy: print join e is at x position of e',
    },
    {
      id: 'my_id',
      doc: 'This sprite\'s id: its name, or `"Name#k"` in a clone.',
      example: `print(my_id())`,
      alt: 'print my id',
      scope: 'clone',
    },
  ],
};
