import type { DocSection } from '../registry';

/** One example of each kind of variable a program can make, side by side. */
export const variableKinds: DocSection = {
  id: 'variable-kinds',
  title: 'Variable kinds',
  entries: [
    {
      id: 'kind-global',
      title: 'Global: one value for everyone',
      doc: 'A `global var` is shared by the stage and every sprite and clone. Use it for the score, the level, or anything the whole game needs.',
      example: `global var score = 0

on message "coin" do
  score += 1
end`,
      alt: 'global var score = 0; when I receive coin: change score by 1',
    },
    {
      id: 'kind-sprite',
      title: 'Per sprite: one value per sprite family',
      doc: 'A `shared var` in a sprite file has one value for the sprite and all of its clones together, so the family can count things like how many enemies are left.',
      example: `shared var enemies = 0

on clone do
  enemies += 1
end`,
      alt: 'shared var enemies = 0; when I start as a clone: change enemies by 1',
    },
    {
      id: 'kind-clone',
      title: 'Per clone: one value each',
      doc: "A plain `var` in a sprite file belongs to that sprite, and each clone gets its own copy, starting from its parent's value. Change it in the clone and only that clone sees it.",
      example: `var hp = 3

on clone do
  hp = random_int(1, 5)
  say(hp)
end`,
      alt: 'var hp = 3; when I start as a clone: set hp to pick random 1 to 5, say hp',
    },
    {
      id: 'kind-local',
      title: 'Local: only inside one block',
      doc: 'A `local` lives until the end of the script, loop body or branch that declares it. Each run of the script gets a fresh one.',
      example: `on start do
  local total = 0
  for i = 1, 10 do
    total += i
  end
  say(total)
end`,
      alt: 'when program starts: local total = 0, for i from 1 to 10: change total by i, say total',
    },
    {
      id: 'kind-list',
      title: 'List: items in order',
      doc: 'Any variable can hold a list. Items are numbered from 1, and `push` adds to the end.',
      example: `var path = []

on start do
  push(path, x)
  push(path, y)
  say(len(path))
end`,
      alt: 'var path = empty list; when program starts: add x to path, add y to path, say length of path',
    },
    {
      id: 'kind-grid',
      title: 'Grid: a list of rows',
      doc: 'A 2D grid is a list of rows, made with `make_grid` and read and written by column and row with `cell` and `set_cell`.',
      example: `var board = make_grid(8, 8, 0)

on start do
  set_cell(board, 3, 2, 1)
  say(cell(board, 3, 2))
end`,
      alt: 'var board = make grid 8 by 8 of 0; when program starts: set cell 3, 2 of board to 1, say cell 3, 2 of board',
    },
    {
      id: 'kind-dict',
      title: 'Dictionary: values by name',
      doc: 'A dictionary maps text keys to values. Make one with `dict()` and index it with a key.',
      example: `var stats = dict()

on start do
  stats["hp"] = 10
  stats["name"] = "Knight"
  say(stats["name"] .. " " .. stats["hp"])
end`,
      alt: 'var stats = empty dictionary; when program starts: set item hp of stats to 10, set item name of stats to Knight, say joined name and hp',
    },
    {
      id: 'kind-function',
      title: 'Function with a return value',
      doc: 'A function that ends in `return` is a reporter: call it inside an expression to use its value.',
      example: `function double(n)
  return n * 2
end

on start do
  say(double(21))
end`,
      alt: 'define double n: return n * 2; when program starts: say double 21',
    },
  ],
};
