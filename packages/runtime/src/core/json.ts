import * as $ from './values';
import { Dict, type Value } from './values';

/**
 * JSON as Stitch values: arrays become lists, objects become dictionaries, null becomes "".
 * Anything that isn't valid JSON reads as "", like other missing values.
 */
export function fromJson(v: unknown): Value {
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (v instanceof Dict) return v;
  if (Array.isArray(v)) return v.map(fromJson);
  if (v !== null && typeof v === 'object')
    return new Dict(Object.entries(v).map(([k, x]) => [k, fromJson(x)]));
  return '';
}

const NOT_JSON = Symbol('not json');

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return NOT_JSON;
  }
}

/** `json_parse`: a list for a JSON array, a dictionary for an object, the value for a scalar. */
export function jsonParse(text: Value): Value {
  if (Array.isArray(text) || text instanceof Dict) return text;
  const v = tryParse($.s(text));
  return v === NOT_JSON ? '' : fromJson(v);
}

/**
 * `json_get`: follows a dotted path ("items.1.name") into JSON text, a list or a dictionary.
 * Numbers index arrays from 1, as Stitch lists do. A missing step gives "". A text step is
 * parsed again before looking inside it, so JSON nested as text still reads.
 */
export function jsonGet(json: Value, path: Value): Value {
  let cur: unknown = json;
  const p = $.s(path).trim();
  for (const seg of p === '' ? [] : p.split('.')) {
    if (typeof cur === 'string') cur = tryParse(cur);
    if (cur instanceof Dict) {
      if (!cur.has(seg)) return '';
      cur = cur.get(seg);
    } else if (Array.isArray(cur)) {
      const i = Number(seg);
      if (!Number.isInteger(i) || i < 1 || i > cur.length) return '';
      cur = cur[i - 1];
    } else if (cur !== null && typeof cur === 'object' && Object.hasOwn(cur, seg)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else return '';
  }
  if (p === '' && typeof cur === 'string') return jsonParse(cur);
  return fromJson(cur);
}
