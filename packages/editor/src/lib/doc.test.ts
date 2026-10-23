import { describe, expect, it } from 'vitest';
import { toBlocks, type BlockJson } from '@stitch/blocks';
import { History, SourceDoc } from './doc';

const SRC = `-- greet
var n = 1

on start do
  say("hi") -- friendly
  move(10)
end
`;

const blocksOf = (d: SourceDoc): BlockJson[] => toBlocks(d.module, d.layout);

describe('SourceDoc', () => {
  it('keeps block ids stable across text edits', () => {
    const d = new SourceDoc('p', 'P', SRC);
    const before = blocksOf(d).map((b) => b.id);
    d.setText(SRC.replace('move(10)', 'move(20)'));
    expect(blocksOf(d).map((b) => b.id)).toEqual(before);
  });

  it('a blocks edit reprints the text, keeping comments, blank lines and order', () => {
    const d = new SourceDoc('p', 'P', SRC);
    const blocks = blocksOf(d);
    // Simulate editing the move block's number in Blockly, and moving the script first.
    const script = blocks[1]!;
    const move = script.next!.block!.next!.block!;
    move.inputs!.ARG0!.shadow!.fields = { NUM: 99 };
    const changed = d.setBlocks([script, blocks[0]!]);
    expect(changed).toBe(false);
    expect(d.text).toBe(SRC.replace('move(10)', 'move(99)'));
  });

  it('turns a fixed raw-code block into real blocks', () => {
    const d = new SourceDoc('p', 'P', 'on start do\n  move(\nend\n');
    const blocks = blocksOf(d);
    const raw = blocks[0]!.next!.block!;
    expect(raw.type).toBe('stitch_raw');
    raw.fields = { TEXT: 'move(5)' };
    expect(d.setBlocks(blocks)).toBe(true);
    expect(d.text).toBe('on start do\n  move(5)\nend\n');
    expect(blocksOf(d)[0]!.next!.block!.type).toBe('stitch_b_move');
  });

  it('keys source spans by the reconciled ids', () => {
    const d = new SourceDoc('p', 'P', SRC);
    d.setText(SRC.replace('move(10)', 'move(20)'));
    const ev = d.module.items[1]!;
    const span = d.spans.get(ev.id)!;
    expect(d.text.slice(span.from, span.from + 11)).toBe('on start do');
  });

  it('keeps loose blocks out of the program', () => {
    const d = new SourceDoc('p', 'P', SRC);
    const loose: BlockJson = { type: 'stitch_b_turn', id: 'loose1', x: 400, y: 10 };
    d.setBlocks([...blocksOf(d), loose]);
    expect(d.loose).toEqual([loose]);
    expect(d.text).toBe(SRC);
  });
});

describe('History', () => {
  it('undoes and redoes across text and blocks edits', () => {
    const d = new SourceDoc('p', 'P', 'var a = 1\n');
    const h = new History();
    const cur = () => d.snapshot();

    h.record('p', d.snapshot(), 'text', 0);
    d.setText('var a = 2\n');
    h.record('p', d.snapshot(), 'blocks', 10);
    const blocks = blocksOf(d);
    blocks[0]!.inputs!.INIT!.shadow!.fields = { NUM: 3 };
    d.setBlocks(blocks);
    expect(d.text).toBe('var a = 3\n');

    d.restore(h.undo(cur)!.snapshot);
    expect(d.text).toBe('var a = 2\n');
    d.restore(h.undo(cur)!.snapshot);
    expect(d.text).toBe('var a = 1\n');
    expect(h.undo(cur)).toBeUndefined();
    d.restore(h.redo(cur)!.snapshot);
    d.restore(h.redo(cur)!.snapshot);
    expect(d.text).toBe('var a = 3\n');
  });

  it('merges a burst of typing into one entry', () => {
    const h = new History();
    const d = new SourceDoc('p', 'P', 'a');
    h.record('p', { ...d.snapshot(), text: 'a' }, 'text', 0);
    h.record('p', { ...d.snapshot(), text: 'ab' }, 'text', 300);
    h.record('p', { ...d.snapshot(), text: 'abc' }, 'text', 2000);
    expect(h.undo(() => d.snapshot())!.snapshot.text).toBe('abc');
    expect(h.undo(() => d.snapshot())!.snapshot.text).toBe('a');
  });
});
