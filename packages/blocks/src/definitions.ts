import { BUILTINS, type BinaryOp } from '@stitch/ir';
import { BUILTIN_LABELS, blockTypeOf } from './labels';

/** Block types that stand alone on the workspace and form the program. */
export const TOP_TYPES = new Set([
  'stitch_var_decl',
  'stitch_function',
  'stitch_on_start',
  'stitch_on_key',
  'stitch_on_message',
  'stitch_raw_item',
]);

export const ARITH_OPS: BinaryOp[] = ['+', '-', '*', '/', '%', '^'];
export const COMPARE_OPS: BinaryOp[] = ['==', '~=', '<', '<=', '>', '>='];
export const LOGIC_OPS: BinaryOp[] = ['and', 'or'];

export const ASSIGN_OPTIONS: [string, string][] = [
  ['to', '='],
  ['change by', '+='],
  ['minus', '-='],
  ['times', '*='],
  ['divide by', '/='],
];

type Def = Record<string, unknown>;

const STYLE_BY_CATEGORY: Record<string, string> = {
  motion: 'motion_blocks',
  looks: 'looks_blocks',
  events: 'event_blocks',
  control: 'control_blocks',
  sensing: 'sensing_blocks',
  math: 'operator_blocks',
  lists: 'list_blocks',
  debug: 'debug_blocks',
};

const stmt = { previousStatement: null, nextStatement: null };
const value = (name: string) => ({ type: 'input_value', name });
const text = (name: string, v = '') => ({ type: 'field_input', name, text: v });
const body = (name = 'DO') => ({ message1: '%1', args1: [{ type: 'input_statement', name }] });

function builtinDefs(): Def[] {
  return [...BUILTINS.values()].map((b) => {
    const label = BUILTIN_LABELS[b.name] ?? b.name;
    // %n in the label is the nth parameter; Blockly needs args in order of appearance.
    const order = [...label.matchAll(/%(\d+)/g)].map((m) => Number(m[1]) - 1);
    let k = 0;
    const message0 = label.replace(/%\d+/g, () => `%${++k}`);
    const def: Def = {
      type: blockTypeOf(b),
      message0,
      args0: order.map((i) => value(`ARG${i}`)),
      inputsInline: true,
      style: STYLE_BY_CATEGORY[b.category],
      tooltip: `${b.name}(${b.params.map((p) => p.name).join(', ')})`,
    };
    if (b.kind === 'command') Object.assign(def, stmt);
    else def.output = b.returns === 'boolean' ? 'Boolean' : null;
    return def;
  });
}

/** Blockly JSON definitions for every Stitch block (plus built-in controls_if / lists_create_with). */
export const DEFINITIONS: Def[] = [
  // ---- top level ----
  {
    type: 'stitch_var_decl',
    message0: '%1 %2 = %3',
    args0: [
      {
        type: 'field_dropdown',
        name: 'SCOPE',
        options: [
          ['var', 'sprite'],
          ['global var', 'global'],
        ],
      },
      text('NAME', 'score'),
      value('INIT'),
    ],
    inputsInline: true,
    style: 'variable_blocks',
    tooltip: 'Declares a variable. Sprite variables belong to this sprite; globals are shared.',
  },
  {
    type: 'stitch_function',
    message0: 'define %1 ( %2 ) %3 warp',
    args0: [
      text('NAME', 'my_function'),
      text('PARAMS'),
      { type: 'field_checkbox', name: 'WARP', checked: false },
    ],
    nextStatement: null,
    style: 'procedure_blocks',
    tooltip:
      'A function. Parameters are comma-separated names. Warp runs loops without waiting for the next frame.',
  },
  {
    type: 'stitch_on_start',
    message0: 'when program starts',
    nextStatement: null,
    style: 'event_blocks',
  },
  {
    type: 'stitch_on_key',
    message0: 'when %1 key pressed',
    args0: [text('KEY', 'space')],
    nextStatement: null,
    style: 'event_blocks',
  },
  {
    type: 'stitch_on_message',
    message0: 'when I receive %1',
    args0: [text('MSG', 'message1')],
    nextStatement: null,
    style: 'event_blocks',
  },
  {
    type: 'stitch_raw_item',
    message0: 'code %1',
    args0: [{ type: 'field_multilinetext', name: 'TEXT', text: '' }],
    style: 'raw_blocks',
    tooltip: "Text that isn't valid Stitch yet. Fix it here or in the text view.",
  },

  // ---- statements ----
  {
    type: 'stitch_local',
    message0: 'local %1 = %2',
    args0: [text('NAME', 'i'), value('VALUE')],
    inputsInline: true,
    style: 'variable_blocks',
    ...stmt,
  },
  {
    type: 'stitch_set',
    message0: 'set %1 %2 %3',
    args0: [
      text('NAME', 'score'),
      { type: 'field_dropdown', name: 'OP', options: ASSIGN_OPTIONS },
      value('VALUE'),
    ],
    inputsInline: true,
    style: 'variable_blocks',
    ...stmt,
  },
  {
    type: 'stitch_set_index',
    message0: 'set item %1 of %2 %3 %4',
    args0: [
      value('INDEX'),
      value('LIST'),
      { type: 'field_dropdown', name: 'OP', options: ASSIGN_OPTIONS },
      value('VALUE'),
    ],
    inputsInline: true,
    style: 'list_blocks',
    ...stmt,
  },
  // Text allows statements after `forever` (they never run), so the block keeps a next connection.
  { type: 'stitch_forever', message0: 'forever', ...body(), ...stmt, style: 'control_blocks' },
  {
    type: 'stitch_repeat',
    message0: 'repeat %1',
    args0: [value('COUNT')],
    ...body(),
    ...stmt,
    style: 'control_blocks',
  },
  {
    type: 'stitch_repeat_until',
    message0: 'repeat until %1',
    args0: [value('COND')],
    ...body(),
    ...stmt,
    style: 'control_blocks',
  },
  {
    type: 'stitch_while',
    message0: 'while %1',
    args0: [value('COND')],
    ...body(),
    ...stmt,
    style: 'control_blocks',
  },
  {
    type: 'stitch_for',
    message0: 'for %1 from %2 to %3',
    args0: [text('VAR', 'i'), value('FROM'), value('TO')],
    inputsInline: true,
    ...body(),
    ...stmt,
    style: 'control_blocks',
  },
  {
    type: 'stitch_for_step',
    message0: 'for %1 from %2 to %3 by %4',
    args0: [text('VAR', 'i'), value('FROM'), value('TO'), value('STEP')],
    inputsInline: true,
    ...body(),
    ...stmt,
    style: 'control_blocks',
  },
  {
    type: 'stitch_for_each',
    message0: 'for each %1 in %2',
    args0: [text('VAR', 'item'), value('LIST')],
    inputsInline: true,
    ...body(),
    ...stmt,
    style: 'control_blocks',
  },
  {
    type: 'stitch_wait_until',
    message0: 'wait until %1',
    args0: [value('COND')],
    ...stmt,
    style: 'control_blocks',
  },
  // `return` ends a block, so it has no next connection (same rule as the text grammar).
  { type: 'stitch_return', message0: 'return', previousStatement: null, style: 'procedure_blocks' },
  {
    type: 'stitch_return_value',
    message0: 'return %1',
    args0: [value('VALUE')],
    previousStatement: null,
    style: 'procedure_blocks',
  },
  {
    type: 'stitch_raw',
    message0: 'code %1',
    args0: [{ type: 'field_multilinetext', name: 'TEXT', text: '' }],
    ...stmt,
    style: 'raw_blocks',
  },
  {
    type: 'stitch_call',
    message0: 'call %1',
    args0: [text('NAME', 'my_function')],
    inputsInline: true,
    ...stmt,
    style: 'procedure_blocks',
    mutator: 'stitch_call_args',
  },

  // ---- expressions ----
  {
    type: 'stitch_num',
    message0: '%1',
    args0: [{ type: 'field_number', name: 'NUM', value: 0 }],
    output: 'Number',
    style: 'operator_blocks',
  },
  {
    type: 'stitch_str',
    message0: '%1',
    args0: [text('TEXT')],
    output: 'String',
    style: 'operator_blocks',
  },
  {
    type: 'stitch_bool',
    message0: '%1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'BOOL',
        options: [
          ['true', 'true'],
          ['false', 'false'],
        ],
      },
    ],
    output: 'Boolean',
    style: 'operator_blocks',
  },
  {
    type: 'stitch_var',
    message0: '%1',
    args0: [text('NAME', 'score')],
    output: null,
    style: 'variable_blocks',
  },
  {
    type: 'stitch_prop',
    message0: '%1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'PROP',
        options: [
          ['x position', 'x'],
          ['y position', 'y'],
          ['direction', 'direction'],
          ['size', 'size'],
          ['costume number', 'costume_number'],
        ],
      },
    ],
    output: 'Number',
    style: 'motion_blocks',
  },
  {
    type: 'stitch_index',
    message0: 'item %1 of %2',
    args0: [value('INDEX'), value('LIST')],
    inputsInline: true,
    output: null,
    style: 'list_blocks',
  },
  {
    type: 'stitch_neg',
    message0: '- %1',
    args0: [value('X')],
    inputsInline: true,
    output: 'Number',
    style: 'operator_blocks',
  },
  {
    type: 'stitch_not',
    message0: 'not %1',
    args0: [value('X')],
    inputsInline: true,
    output: 'Boolean',
    style: 'operator_blocks',
  },
  {
    type: 'stitch_arith',
    message0: '%1 %2 %3',
    args0: [
      value('A'),
      {
        type: 'field_dropdown',
        name: 'OP',
        options: ARITH_OPS.map((o) => [
          o === '*' ? '×' : o === '/' ? '÷' : o === '%' ? 'mod' : o,
          o,
        ]),
      },
      value('B'),
    ],
    inputsInline: true,
    output: 'Number',
    style: 'operator_blocks',
  },
  {
    type: 'stitch_compare',
    message0: '%1 %2 %3',
    args0: [
      value('A'),
      {
        type: 'field_dropdown',
        name: 'OP',
        options: COMPARE_OPS.map((o) => [
          o === '==' ? '=' : o === '~=' ? '≠' : o === '<=' ? '≤' : o === '>=' ? '≥' : o,
          o,
        ]),
      },
      value('B'),
    ],
    inputsInline: true,
    output: 'Boolean',
    style: 'operator_blocks',
  },
  {
    type: 'stitch_logic',
    message0: '%1 %2 %3',
    args0: [
      value('A'),
      { type: 'field_dropdown', name: 'OP', options: LOGIC_OPS.map((o) => [o, o]) },
      value('B'),
    ],
    inputsInline: true,
    output: 'Boolean',
    style: 'operator_blocks',
  },
  {
    type: 'stitch_join',
    message0: 'join %1 %2',
    args0: [value('A'), value('B')],
    inputsInline: true,
    output: 'String',
    style: 'operator_blocks',
  },
  {
    type: 'stitch_call_expr',
    message0: 'call %1',
    args0: [text('NAME', 'my_function')],
    inputsInline: true,
    output: null,
    style: 'procedure_blocks',
    mutator: 'stitch_call_args',
  },

  ...builtinDefs(),
];

/** Scratch-like colours: [primary, secondary, tertiary]. */
export const STYLES: Record<string, [string, string, string]> = {
  motion_blocks: ['#4C97FF', '#4280D7', '#3373CC'],
  looks_blocks: ['#9966FF', '#855CD6', '#774DCB'],
  event_blocks: ['#FFBF00', '#E6AC00', '#CC9900'],
  control_blocks: ['#FFAB19', '#EC9C13', '#CF8B17'],
  logic_blocks: ['#FFAB19', '#EC9C13', '#CF8B17'],
  sensing_blocks: ['#5CB1D6', '#47A8D1', '#2E8EB8'],
  operator_blocks: ['#59C059', '#46B946', '#389438'],
  variable_blocks: ['#FF8C1A', '#FF8000', '#DB6E00'],
  list_blocks: ['#FF661A', '#FF5500', '#E64D00'],
  procedure_blocks: ['#FF6680', '#FF4D6A', '#FF3355'],
  debug_blocks: ['#8A8A8A', '#7A7A7A', '#5E5E5E'],
  raw_blocks: ['#5B6770', '#4B565E', '#3B444A'],
};
