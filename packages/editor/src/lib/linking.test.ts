import { parse } from '@stitch/lang';
import { describe, expect, it } from 'vitest';
import { itemAt, nodesAt } from './linking';

const text = 'var a = 1\n\non start do\n  say(a + 2)\nend\n';
const r = parse(text);

describe('linking', () => {
  it('finds the innermost node at a position first', () => {
    const ids = nodesAt(r.spans, text.indexOf('a + 2'));
    const spanText = (id: string) => {
      const s = r.spans.get(id)!;
      return text.slice(s.from, s.to);
    };
    expect(ids.map(spanText).slice(0, 3)).toEqual(['a', 'a + 2', 'say(a + 2)']);
  });

  it('finds the top-level item at or after a position', () => {
    const [decl, script] = r.module.items;
    expect(itemAt(r.module, r.spans, 0)).toBe(decl!.id);
    expect(itemAt(r.module, r.spans, text.indexOf('\n\n') + 1)).toBe(script!.id);
    expect(itemAt(r.module, r.spans, text.length + 5)).toBeUndefined();
  });
});
