/**
 * Matching places between the code and the blocks: a block's id is its IR node's id, and the
 * doc's spans say where each node is in the text. Pure, for the linked selection and scrolling.
 */
import type { Module, NodeId } from '@stitch/ir';
import type { Span } from '@stitch/lang';

/** Ids of the nodes whose text holds `pos`, innermost (shortest) first. */
export function nodesAt(spans: ReadonlyMap<NodeId, Span>, pos: number): NodeId[] {
  const hits: [NodeId, number][] = [];
  for (const [id, s] of spans) if (s.from <= pos && pos <= s.to) hits.push([id, s.to - s.from]);
  return hits.sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

/** The top-level item at `pos`, or the first one after it. */
export function itemAt(
  module: Module,
  spans: ReadonlyMap<NodeId, Span>,
  pos: number,
): NodeId | undefined {
  for (const it of module.items) {
    const s = spans.get(it.id);
    if (s && s.to >= pos) return it.id;
  }
  return undefined;
}
