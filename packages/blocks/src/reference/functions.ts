import type { DocSection } from '../registry';

export const functions: DocSection = {
  id: 'functions',
  title: 'Functions',
  entries: [
    {
      id: 'function',
      title: '`function name(a, b) … end` — define',
      snippet: 'function ${name}(${a})\n\t${}\nend',
      keywords: ['function'],
      doc: 'Defines a function in this file. Call it from any script in the same file. Parameters are local. Functions are called as statements, or as values when they `return` one.',
      example: `function jump(height)
  repeat 10 do
    y += height / 10
  end
  repeat 10 do
    y -= height / 10
  end
end`,
      alt: 'define jump (height): repeat 10 change y by height / 10, repeat 10 change y minus height / 10',
    },
    {
      id: 'warp-function',
      title: '`warp function` — run without screen refresh',
      snippet: 'warp function ${name}(${a})\n\t${}\nend',
      keywords: ['warp'],
      doc: "A `warp` function runs its loops without waiting for the next tick, like Scratch's *run without screen refresh*. Functions it calls are warped too. It still pauses once a tick has run for 500 ms, so a runaway loop can't freeze the page ([D5](departures.md)).",
      example: `warp function fill_row(row)
  for col = 1, 30 do
    set_tile(col * 16, row * 16, 1)
  end
end`,
      alt: 'define fill_row (row) warp: for col from 1 to 30, set tile',
    },
    {
      id: 'return',
      title: '`return` — return a value',
      snippet: 'return ${value}',
      keywords: ['return'],
      doc: 'Ends the function, reporting `value` (or `""` with no value). `return` must be the last statement of its block ([D12](departures.md)).',
      example: `function double(n)
  return n * 2
end

function check()
  if x > 0 then
    return
  end
  say("left side")
end`,
      alt: 'define double (n): return n * 2; define check: if x > 0 then return, say left side',
    },
    {
      id: 'call',
      title: 'Calling a function',
      doc: "A call is a statement when its result isn't used, and an expression when it is. In blocks, calls come from the **Functions** category with one slot per parameter ([D14](departures.md)).",
      example: `on start do
  jump(40)
  say(double(21))
end

function jump(height)
  y += height
end

function double(n)
  return n * 2
end`,
      alt: 'when program starts: call jump 40, say call double 21',
    },
  ],
};
