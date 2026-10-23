/**
 * The builtin catalog: the single registry of commands and reporters.
 * The parser, validator, compiler, runtime and (later) blocks all read this table.
 */
export type ValueType = 'number' | 'string' | 'boolean' | 'list' | 'any';

export interface BuiltinParam {
  name: string;
  type: ValueType;
}

export interface Builtin {
  name: string;
  kind: 'command' | 'reporter';
  category: 'motion' | 'looks' | 'events' | 'control' | 'sensing' | 'math' | 'lists' | 'debug';
  params: BuiltinParam[];
  returns?: ValueType;
  /** Takes ticks to finish; compiled as `yield*`. */
  yields?: boolean;
  /** Needs the calling sprite (S) as first runtime argument. */
  sprite?: boolean;
}

const n = (name: string): BuiltinParam => ({ name, type: 'number' });
const s = (name: string): BuiltinParam => ({ name, type: 'string' });
const a = (name: string): BuiltinParam => ({ name, type: 'any' });
const l = (name: string): BuiltinParam => ({ name, type: 'list' });

const list: Builtin[] = [
  // motion
  { name: 'move', kind: 'command', category: 'motion', params: [n('steps')], sprite: true },
  { name: 'turn', kind: 'command', category: 'motion', params: [n('degrees')], sprite: true },
  { name: 'goto', kind: 'command', category: 'motion', params: [n('x'), n('y')], sprite: true },
  { name: 'point', kind: 'command', category: 'motion', params: [n('direction')], sprite: true },
  {
    name: 'point_towards',
    kind: 'command',
    category: 'motion',
    params: [n('x'), n('y')],
    sprite: true,
  },
  { name: 'bounce', kind: 'command', category: 'motion', params: [], sprite: true },
  { name: 'clamp_to_stage', kind: 'command', category: 'motion', params: [], sprite: true },
  {
    name: 'on_edge',
    kind: 'reporter',
    category: 'motion',
    params: [],
    returns: 'string',
    sprite: true,
  },
  {
    name: 'angle_to',
    kind: 'reporter',
    category: 'motion',
    params: [n('x'), n('y')],
    returns: 'number',
    sprite: true,
  },
  {
    name: 'distance_to',
    kind: 'reporter',
    category: 'motion',
    params: [n('x'), n('y')],
    returns: 'number',
    sprite: true,
  },
  // looks
  { name: 'costume', kind: 'command', category: 'looks', params: [a('costume')], sprite: true },
  { name: 'next_costume', kind: 'command', category: 'looks', params: [], sprite: true },
  { name: 'say', kind: 'command', category: 'looks', params: [a('text')], sprite: true },
  {
    name: 'say_for',
    kind: 'command',
    category: 'looks',
    params: [a('text'), n('seconds')],
    yields: true,
    sprite: true,
  },
  { name: 'show', kind: 'command', category: 'looks', params: [], sprite: true },
  { name: 'hide', kind: 'command', category: 'looks', params: [], sprite: true },
  // events
  { name: 'broadcast', kind: 'command', category: 'events', params: [s('message')] },
  {
    name: 'broadcast_wait',
    kind: 'command',
    category: 'events',
    params: [s('message')],
    yields: true,
  },
  // control
  { name: 'wait', kind: 'command', category: 'control', params: [n('seconds')], yields: true },
  { name: 'stop', kind: 'command', category: 'control', params: [] },
  // sensing
  {
    name: 'key_down',
    kind: 'reporter',
    category: 'sensing',
    params: [s('key')],
    returns: 'boolean',
  },
  { name: 'timer', kind: 'reporter', category: 'sensing', params: [], returns: 'number' },
  { name: 'reset_timer', kind: 'command', category: 'sensing', params: [] },
  // math
  { name: 'abs', kind: 'reporter', category: 'math', params: [n('x')], returns: 'number' },
  { name: 'floor', kind: 'reporter', category: 'math', params: [n('x')], returns: 'number' },
  { name: 'ceil', kind: 'reporter', category: 'math', params: [n('x')], returns: 'number' },
  { name: 'round', kind: 'reporter', category: 'math', params: [n('x')], returns: 'number' },
  { name: 'sqrt', kind: 'reporter', category: 'math', params: [n('x')], returns: 'number' },
  { name: 'sin', kind: 'reporter', category: 'math', params: [n('degrees')], returns: 'number' },
  { name: 'cos', kind: 'reporter', category: 'math', params: [n('degrees')], returns: 'number' },
  { name: 'tan', kind: 'reporter', category: 'math', params: [n('degrees')], returns: 'number' },
  { name: 'min', kind: 'reporter', category: 'math', params: [n('a'), n('b')], returns: 'number' },
  { name: 'max', kind: 'reporter', category: 'math', params: [n('a'), n('b')], returns: 'number' },
  {
    name: 'random',
    kind: 'reporter',
    category: 'math',
    params: [n('from'), n('to')],
    returns: 'number',
  },
  // lists and strings
  { name: 'len', kind: 'reporter', category: 'lists', params: [a('value')], returns: 'number' },
  { name: 'push', kind: 'command', category: 'lists', params: [l('list'), a('item')] },
  {
    name: 'insert',
    kind: 'command',
    category: 'lists',
    params: [l('list'), n('index'), a('item')],
  },
  { name: 'remove', kind: 'command', category: 'lists', params: [l('list'), n('index')] },
  {
    name: 'contains',
    kind: 'reporter',
    category: 'lists',
    params: [a('value'), a('item')],
    returns: 'boolean',
  },
  // debug
  { name: 'print', kind: 'command', category: 'debug', params: [a('value')] },
];

export const BUILTINS: ReadonlyMap<string, Builtin> = new Map(list.map((b) => [b.name, b]));

export function getBuiltin(name: string): Builtin | undefined {
  return BUILTINS.get(name);
}
