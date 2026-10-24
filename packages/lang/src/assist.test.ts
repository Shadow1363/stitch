import { describe, expect, it } from 'vitest';
import { contextAt, declarations, definitionAt, messageNames, scopeAt, wordAt } from './assist';

/** Text with `|` marking the cursor. */
const at = (marked: string) => {
  const pos = marked.indexOf('|');
  return { text: marked.slice(0, pos) + marked.slice(pos + 1), pos };
};
const ctx = (marked: string) => {
  const { text, pos } = at(marked);
  return contextAt(text, pos);
};
const scope = (marked: string) => {
  const { text, pos } = at(marked);
  return scopeAt(text, pos).map((s) => `${s.kind}:${s.name}`);
};

describe('contextAt', () => {
  it('tells top level, statements and expressions apart', () => {
    expect(ctx('var a = 1\nfu|').kind).toBe('top');
    expect(ctx('on start do\n  mo|\nend').kind).toBe('statement');
    expect(ctx('on start do\n  x = a|\nend').kind).toBe('expr');
    expect(ctx('on start do\n  if ke| then\n  end\nend').kind).toBe('expr');
  });

  it('keeps working on half-typed scripts', () => {
    expect(ctx('on start do\n  forever do\n    tu|').kind).toBe('statement');
    expect(ctx('on start do\n  say(|').kind).toBe('expr');
  });

  it('reports the word being typed', () => {
    expect(ctx('on start do\n  x = spe|ed\nend').word).toMatchObject({ text: 'spe' });
  });

  it('finds the call and argument the cursor is in, through nesting and strings', () => {
    expect(ctx('on start do\n  goto(1, |)\nend').call).toMatchObject({ name: 'goto', arg: 1 });
    expect(ctx('on start do\n  goto(max(1, 2), |').call).toMatchObject({ name: 'goto', arg: 1 });
    expect(ctx('on start do\n  goto(max(1, |), 0)\nend').call).toMatchObject({
      name: 'max',
      arg: 1,
    });
    expect(ctx('on start do\n  say("a, (b", |)\nend').call).toMatchObject({ name: 'say', arg: 1 });
    expect(ctx('on start do\n  x = [1, |]\nend').call).toBeUndefined();
    expect(ctx('function jump(|').call).toBeUndefined();
  });

  it('knows string arguments and event strings', () => {
    const c = ctx('on start do\n  play_sound("co|")\nend');
    expect(c).toMatchObject({ kind: 'string', call: { name: 'play_sound', arg: 0 } });
    expect(c.word.text).toBe('co');
    expect(ctx('on message "le|"').event).toBe('message');
    expect(ctx('on key "|').event).toBe('key');
  });

  it('suggests nothing in comments or numbers, and event names after on', () => {
    expect(ctx('-- say(|').kind).toBe('none');
    expect(ctx('on start do\n  x = 12|').kind).toBe('none');
    expect(ctx('on |').kind).toBe('event');
  });
});

describe('scopeAt', () => {
  const program = [
    'global var score = 0',
    'shared var alive = 0',
    'var speed = 2',
    'function hop(height, times)',
    '  local up = height',
    '  for i = 1, times do',
    '    local k = i',
    '    |',
    '  end',
    'end',
  ].join('\n');

  it('lists locals, loop variables, parameters and file declarations, innermost first', () => {
    expect(scope(program)).toEqual([
      'local:k',
      'loop:i',
      'local:up',
      'param:height',
      'param:times',
      'global:score',
      'shared:alive',
      'sprite:speed',
      'function:hop',
    ]);
  });

  it('leaves out locals declared later, in sibling branches or in other scripts', () => {
    const s = scope(
      [
        'on start do',
        '  if true then',
        '    local a = 1',
        '  else',
        '    local b = 2',
        '    |',
        '    local c = 3',
        '  end',
        'end',
        'on click do',
        '  local d = 4',
        'end',
      ].join('\n'),
    );
    expect(s).toEqual(['local:b']);
  });

  it('finds locals on a blank line before end', () => {
    expect(scope('on start do\n  local a = 1\n|\nend')).toEqual(['local:a']);
  });
});

describe('definitions', () => {
  it('finds where a function, variable or local is declared', () => {
    const { text, pos } = at('var lives = 3\non start do\n  local n = 1\n  say(n + liv|es)\nend');
    expect(definitionAt(text, pos)).toMatchObject({ name: 'lives', kind: 'sprite', from: 4 });
    const p = text.indexOf('n +');
    expect(definitionAt(text, p)).toMatchObject({ name: 'n', kind: 'local' });
    expect(definitionAt(text, text.indexOf('say'))).toBeUndefined();
  });

  it('lists declarations with function parameters', () => {
    expect(declarations('function f(a, b)\nend\nvar v = 1')).toEqual([
      { name: 'f', kind: 'function', from: 9, to: 10, params: ['a', 'b'] },
      { name: 'v', kind: 'sprite', from: 25, to: 26 },
    ]);
  });
});

describe('helpers', () => {
  it('wordAt spans the identifier around a position', () => {
    expect(wordAt('say(score)', 6)).toEqual({ from: 4, to: 9, text: 'score' });
  });

  it('messageNames collects received and broadcast messages', () => {
    expect(
      messageNames(
        'on message "win" do\nend\non start do\n  broadcast("lose")\n  broadcast_wait("a\\"b")\nend',
      ),
    ).toEqual(['win', 'lose', 'a"b']);
  });
});

describe('scopeAt on blank lines', () => {
  it('uses the else branch, not the then branch, before end', () => {
    expect(
      scope('on start do\n  if true then\n    local a = 1\n  else\n    local b = 2\n|\n  end\nend'),
    ).toEqual(['local:b']);
  });
});
