/**
 * The builtin catalog: the single registry of commands and reporters.
 * The parser, validator, compiler, runtime and (later) blocks all read this table.
 */
export type ValueType = 'number' | 'string' | 'boolean' | 'list' | 'any';

/** What a string argument names, so the editor can complete it and lint unknown names. */
export type ParamRef =
  | 'sprite'
  | 'costume'
  | 'backdrop'
  | 'sound'
  | 'song'
  | 'message'
  | 'key'
  | 'effect'
  | 'rotation'
  | 'sound_effect'
  | 'time_unit';

export interface BuiltinParam {
  name: string;
  type: ValueType;
  ref?: ParamRef;
}

export interface Builtin {
  name: string;
  kind: 'command' | 'reporter';
  category:
    | 'motion'
    | 'looks'
    | 'sound'
    | 'events'
    | 'control'
    | 'clones'
    | 'sensing'
    | 'map'
    | 'math'
    | 'strings'
    | 'lists'
    | 'pen'
    | 'data'
    | 'debug'
    | 'extension';
  params: BuiltinParam[];
  returns?: ValueType;
  /** Takes ticks to finish; compiled as `yield*`. */
  yields?: boolean;
  /** Needs the calling sprite (S) as first runtime argument. */
  sprite?: boolean;
  /** Set on entries an extension adds. Core blocks keep their text in @stitch/blocks labels. */
  ext?: {
    id: string;
    name: string;
    color: string;
    label: string;
    description?: string;
    /** Toolbox starting value per parameter. */
    defaults: (number | string | undefined)[];
  };
}

const n = (name: string): BuiltinParam => ({ name, type: 'number' });
const s = (name: string): BuiltinParam => ({ name, type: 'string' });
const a = (name: string): BuiltinParam => ({ name, type: 'any' });
const l = (name: string): BuiltinParam => ({ name, type: 'list' });
const bo = (name: string): BuiltinParam => ({ name, type: 'boolean' });
/** A parameter that names something in the cart (or a key, effect or style). */
const ref = (p: BuiltinParam, to: ParamRef): BuiltinParam => ({ ...p, ref: to });

type Cat = Builtin['category'];
const cmd = (
  category: Cat,
  name: string,
  params: BuiltinParam[],
  more: Partial<Builtin> = {},
): Builtin => ({
  name,
  kind: 'command',
  category,
  params,
  ...more,
});
const rep = (
  category: Cat,
  name: string,
  params: BuiltinParam[],
  returns: ValueType,
  more: Partial<Builtin> = {},
): Builtin => ({ name, kind: 'reporter', category, params, returns, ...more });
const S = { sprite: true } as const;
const W = { yields: true } as const;

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
  {
    name: 'costume',
    kind: 'command',
    category: 'looks',
    params: [ref(a('costume'), 'costume')],
    sprite: true,
  },
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
  // sound (by name, or 1-based number in cart order)
  // The sprite plays it, so its pitch and pan effects apply.
  {
    name: 'play_sound',
    kind: 'command',
    category: 'sound',
    params: [ref(a('sound'), 'sound')],
    sprite: true,
  },
  {
    name: 'play_sound_wait',
    kind: 'command',
    category: 'sound',
    params: [ref(a('sound'), 'sound')],
    yields: true,
    sprite: true,
  },
  { name: 'stop_sounds', kind: 'command', category: 'sound', params: [] },
  { name: 'play_music', kind: 'command', category: 'sound', params: [ref(a('song'), 'song')] },
  { name: 'stop_music', kind: 'command', category: 'sound', params: [] },
  { name: 'set_volume', kind: 'command', category: 'sound', params: [n('percent')] },
  { name: 'volume', kind: 'reporter', category: 'sound', params: [], returns: 'number' },
  // events
  {
    name: 'broadcast',
    kind: 'command',
    category: 'events',
    params: [ref(s('message'), 'message')],
  },
  {
    name: 'broadcast_wait',
    kind: 'command',
    category: 'events',
    params: [ref(s('message'), 'message')],
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
    params: [ref(s('key'), 'key')],
    returns: 'boolean',
  },
  { name: 'timer', kind: 'reporter', category: 'sensing', params: [], returns: 'number' },
  { name: 'reset_timer', kind: 'command', category: 'sensing', params: [] },
  // map (cells under cart coordinates; 0 = empty)
  {
    name: 'tile_at',
    kind: 'reporter',
    category: 'map',
    params: [n('x'), n('y')],
    returns: 'number',
  },
  { name: 'set_tile', kind: 'command', category: 'map', params: [n('x'), n('y'), n('tile')] },
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
  // data: HTTP goes through the editor (the sandbox never fetches); JSON objects stay text
  {
    name: 'http_get',
    kind: 'reporter',
    category: 'data',
    params: [s('url')],
    returns: 'string',
    yields: true,
    sprite: true,
  },
  {
    name: 'http_post',
    kind: 'reporter',
    category: 'data',
    params: [s('url'), s('body')],
    returns: 'string',
    yields: true,
    sprite: true,
  },
  {
    name: 'http_status',
    kind: 'reporter',
    category: 'data',
    params: [],
    returns: 'number',
    sprite: true,
  },
  { name: 'json_get', kind: 'reporter', category: 'data', params: [a('json'), s('path')] },
  { name: 'json_parse', kind: 'reporter', category: 'data', params: [a('text')] },
  // debug
  { name: 'print', kind: 'command', category: 'debug', params: [a('value')] },
  // ---- block parity (Phase 9) ----
  // motion
  cmd('motion', 'goto_random', [], S),
  cmd('motion', 'goto_sprite', [ref(s('sprite'), 'sprite')], S),
  cmd('motion', 'glide', [n('seconds'), n('x'), n('y')], { ...S, ...W }),
  cmd('motion', 'glide_to', [n('seconds'), ref(s('sprite'), 'sprite')], { ...S, ...W }),
  cmd('motion', 'point_towards_sprite', [ref(s('sprite'), 'sprite')], S),
  cmd('motion', 'rotation_style', [ref(s('style'), 'rotation')], S),
  // looks
  cmd('looks', 'think', [a('text')], S),
  cmd('looks', 'think_for', [a('text'), n('seconds')], { ...S, ...W }),
  rep('looks', 'costume_name', [], 'string', S),
  cmd('looks', 'set_effect', [ref(s('effect'), 'effect'), n('value')], S),
  cmd('looks', 'change_effect', [ref(s('effect'), 'effect'), n('by')], S),
  cmd('looks', 'clear_effects', [], S),
  cmd('looks', 'go_to_front', [], S),
  cmd('looks', 'go_to_back', [], S),
  cmd('looks', 'change_layer', [n('by')], S),
  // backdrops (Phase 14): the stage's costumes
  cmd('looks', 'backdrop', [ref(a('backdrop'), 'backdrop')]),
  cmd('looks', 'backdrop_wait', [ref(a('backdrop'), 'backdrop')], W),
  cmd('looks', 'next_backdrop', []),
  rep('looks', 'backdrop_number', [], 'number'),
  rep('looks', 'backdrop_name', [], 'string'),
  // sound
  cmd('sound', 'change_volume', [n('by')]),
  cmd('sound', 'set_sound_effect', [ref(s('effect'), 'sound_effect'), n('value')], S),
  cmd('sound', 'change_sound_effect', [ref(s('effect'), 'sound_effect'), n('by')], S),
  cmd('sound', 'clear_sound_effects', [], S),
  // control
  cmd('control', 'stop_all', []),
  cmd('control', 'stop_other_scripts', [], S),
  // clones (sprite ids: an original's name, or "Name#k" for a clone)
  cmd('clones', 'create_clone', [], S),
  cmd('clones', 'create_clone_of', [ref(s('sprite'), 'sprite')], S),
  cmd('clones', 'delete_clone', [], S),
  rep('clones', 'is_clone', [], 'boolean', S),
  rep('clones', 'clone_count', [], 'number', S),
  rep('clones', 'clones', [ref(s('sprite'), 'sprite')], 'list'),
  rep('clones', 'my_id', [], 'string', S),
  // sensing
  rep('sensing', 'key_pressed', [ref(s('key'), 'key')], 'boolean'),
  rep('sensing', 'mouse_x', [], 'number'),
  rep('sensing', 'mouse_y', [], 'number'),
  rep('sensing', 'mouse_down', [], 'boolean'),
  rep('sensing', 'touching', [ref(s('sprite'), 'sprite')], 'boolean', S),
  rep('sensing', 'touching_edge', [], 'boolean', S),
  rep('sensing', 'touching_mouse', [], 'boolean', S),
  rep('sensing', 'touching_color', [s('color')], 'boolean', S),
  rep('sensing', 'color_touching', [s('color'), s('other')], 'boolean', S),
  rep('sensing', 'distance_to_sprite', [ref(s('sprite'), 'sprite')], 'number', S),
  rep('sensing', 'sprite_at', [n('x'), n('y')], 'string'),
  rep('sensing', 'x_of', [ref(s('sprite'), 'sprite')], 'number'),
  rep('sensing', 'y_of', [ref(s('sprite'), 'sprite')], 'number'),
  rep('sensing', 'direction_of', [ref(s('sprite'), 'sprite')], 'number'),
  rep('sensing', 'costume_of', [ref(s('sprite'), 'sprite')], 'number'),
  rep('sensing', 'size_of', [ref(s('sprite'), 'sprite')], 'number'),
  rep('sensing', 'var_of', [ref(s('sprite'), 'sprite'), s('variable')], 'any'),
  rep('sensing', 'delta_time', [], 'number'),
  rep('sensing', 'current', [ref(s('unit'), 'time_unit')], 'number'),
  rep('sensing', 'days_since_2000', [], 'number'),
  rep('sensing', 'loudness', [], 'number'),
  rep('sensing', 'username', [], 'string'),
  cmd('sensing', 'set_drag_mode', [bo('draggable')], S),
  // map by cell (columns and rows from 1)
  rep('map', 'map_cell', [n('column'), n('row')], 'number'),
  cmd('map', 'set_map_cell', [n('column'), n('row'), n('tile')]),
  rep('map', 'map_width', [], 'number'),
  rep('map', 'map_height', [], 'number'),
  rep('map', 'tile_size', [], 'number'),
  // map camera (the map pixel at the stage's top-left)
  cmd('map', 'scroll_map', [n('x'), n('y')]),
  rep('map', 'map_x', [], 'number'),
  rep('map', 'map_y', [], 'number'),
  // math
  rep('math', 'random_int', [n('from'), n('to')], 'number'),
  cmd('math', 'set_seed', [n('seed')]),
  rep('math', 'clamp', [n('x'), n('low'), n('high')], 'number'),
  rep('math', 'lerp', [n('a'), n('b'), n('t')], 'number'),
  rep('math', 'sign', [n('x')], 'number'),
  rep('math', 'distance', [n('x1'), n('y1'), n('x2'), n('y2')], 'number'),
  rep('math', 'angle', [n('x1'), n('y1'), n('x2'), n('y2')], 'number'),
  rep('math', 'asin', [n('x')], 'number'),
  rep('math', 'acos', [n('x')], 'number'),
  rep('math', 'atan', [n('x')], 'number'),
  rep('math', 'ln', [n('x')], 'number'),
  rep('math', 'log', [n('x')], 'number'),
  rep('math', 'exp', [n('x')], 'number'),
  rep('math', 'pow10', [n('x')], 'number'),
  // strings
  rep('strings', 'split', [s('text'), s('separator')], 'list'),
  rep('strings', 'join', [l('list'), s('separator')], 'string'),
  rep('strings', 'substring', [s('text'), n('from'), n('to')], 'string'),
  rep('strings', 'letter_of', [n('index'), s('text')], 'string'),
  rep('strings', 'upper', [s('text')], 'string'),
  rep('strings', 'lower', [s('text')], 'string'),
  rep('strings', 'format_number', [n('x'), n('decimals')], 'string'),
  // lists, grids (lists of rows) and dictionaries
  cmd('lists', 'clear', [l('list')]),
  rep('lists', 'index_of', [l('list'), a('item')], 'number'),
  rep('lists', 'make_grid', [n('width'), n('height'), a('value')], 'list'),
  rep('lists', 'cell', [l('grid'), n('x'), n('y')], 'any'),
  cmd('lists', 'set_cell', [l('grid'), n('x'), n('y'), a('value')]),
  rep('lists', 'grid_width', [l('grid')], 'number'),
  rep('lists', 'grid_height', [l('grid')], 'number'),
  cmd('lists', 'fill_grid', [l('grid'), a('value')]),
  rep('lists', 'dict', [], 'any'),
  rep('lists', 'keys', [a('dict')], 'list'),
  rep('lists', 'has_key', [a('dict'), s('key')], 'boolean'),
  // pen (stage coordinates; shapes use the calling sprite's pen colour and size)
  cmd('pen', 'clear_pen', []),
  cmd('pen', 'stamp', [], S),
  cmd('pen', 'pen_down', [], S),
  cmd('pen', 'pen_up', [], S),
  cmd('pen', 'set_pen_color', [a('color')], S),
  cmd('pen', 'change_pen_color', [n('by')], S),
  cmd('pen', 'set_pen_size', [n('size')], S),
  cmd('pen', 'change_pen_size', [n('by')], S),
  cmd('pen', 'set_pen_transparency', [n('percent')], S),
  cmd('pen', 'change_pen_transparency', [n('by')], S),
  cmd('pen', 'set_pen_hue', [n('hue')], S),
  cmd('pen', 'set_pen_saturation', [n('percent')], S),
  cmd('pen', 'change_pen_saturation', [n('by')], S),
  cmd('pen', 'set_pen_brightness', [n('percent')], S),
  cmd('pen', 'change_pen_brightness', [n('by')], S),
  cmd('pen', 'draw_line', [n('x1'), n('y1'), n('x2'), n('y2')], S),
  cmd('pen', 'draw_rect', [n('x1'), n('y1'), n('x2'), n('y2')], S),
  cmd('pen', 'fill_rect', [n('x1'), n('y1'), n('x2'), n('y2')], S),
  cmd('pen', 'draw_circle', [n('x'), n('y'), n('radius')], S),
  cmd('pen', 'fill_circle', [n('x'), n('y'), n('radius')], S),
  cmd('pen', 'draw_text', [a('text'), n('x'), n('y')], S),
  // debug
  cmd('debug', 'watch', [s('label'), a('value')]),
  cmd('debug', 'unwatch', [s('label')]),
  cmd('debug', 'assert', [bo('condition'), a('message')]),
  // ---- editor tooling (Phase 11) ----
  cmd('sensing', 'ask', [a('question')], { ...S, ...W }),
  rep('sensing', 'answer', [], 'string'),
  rep('sensing', 'stage_width', [], 'number'),
  rep('sensing', 'stage_height', [], 'number'),
  rep('sensing', 'frame_count', [], 'number'),
];

export const BUILTINS: ReadonlyMap<string, Builtin> = new Map(list.map((b) => [b.name, b]));

export function getBuiltin(name: string): Builtin | undefined {
  return BUILTINS.get(name);
}
