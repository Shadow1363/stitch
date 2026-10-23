import { createIdGen, type IdGen } from '@stitch/ir';
import { lower, type LowerResult } from './lower';
import { parser } from './parser.gen.js';

export type ParseResult = LowerResult;

/** Text -> IR. Never throws on bad input: unparseable regions become Raw nodes. */
export function parse(text: string, ids: IdGen = createIdGen()): ParseResult {
  return lower(parser.parse(text), text, ids);
}

export { parser };
