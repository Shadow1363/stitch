import { BUILTINS, type Builtin } from '@stitch/ir';
import { STYLES } from './definitions';
import type { InputJson } from './json';
import { blockTypeOf, TOOLBOX_DEFAULTS } from './labels';
import { defaultShadow, numBlock, strBlock } from './toBlocks';

/** What the dynamic Variables / Functions categories list. */
export interface ToolboxInfo {
  vars: string[];
  functions: { name: string; params: string[] }[];
}

export interface ToolboxItem {
  kind: 'block' | 'label' | 'sep';
  type?: string;
  text?: string;
  gap?: number;
  fields?: Record<string, unknown>;
  inputs?: Record<string, InputJson>;
  extraState?: Record<string, unknown>;
}

let n = 0;
const sid = () => `tb${++n}`;
const num = (v: number): InputJson => ({ shadow: numBlock(sid(), v) });
const str = (v: string): InputJson => ({ shadow: strBlock(sid(), v) });
const blk = (type: string, extra: Partial<ToolboxItem> = {}): ToolboxItem => ({
  kind: 'block',
  type,
  ...extra,
});

function builtin(name: string): ToolboxItem {
  const b = BUILTINS.get(name) as Builtin;
  const defaults = TOOLBOX_DEFAULTS[name] ?? [];
  const inputs: Record<string, InputJson> = {};
  b.params.forEach((p, i) => {
    const d = defaults[i];
    const sh =
      d === undefined
        ? defaultShadow(p.type, sid())
        : typeof d === 'number'
          ? numBlock(sid(), d)
          : strBlock(sid(), d);
    if (sh && p.type !== 'list') inputs[`ARG${i}`] = { shadow: sh };
  });
  return blk(blockTypeOf(b), { inputs });
}

const byCategory = (cat: Builtin['category']) =>
  [...BUILTINS.values()].filter((b) => b.category === cat).map((b) => builtin(b.name));

const binary = (type: string, op: string | undefined, a: InputJson, b: InputJson): ToolboxItem =>
  blk(type, { ...(op ? { fields: { OP: op } } : {}), inputs: { A: a, B: b } });

/** Static categories; Variables and Functions are filled per workspace from ToolboxInfo. */
export function toolbox() {
  const cat = (name: string, style: string, contents: ToolboxItem[]) => ({
    kind: 'category',
    name,
    categorystyle: style,
    contents,
  });
  return {
    kind: 'categoryToolbox',
    contents: [
      cat('Events', 'event_category', [
        blk('stitch_on_start'),
        blk('stitch_on_key'),
        blk('stitch_on_message'),
        ...byCategory('events'),
      ]),
      cat('Motion', 'motion_category', [
        ...byCategory('motion').filter(
          (b) =>
            !['stitch_r_on_edge', 'stitch_r_angle_to', 'stitch_r_distance_to'].includes(b.type!),
        ),
        blk('stitch_set', { fields: { NAME: 'x', OP: '+=' }, inputs: { VALUE: num(10) } }),
        blk('stitch_set', { fields: { NAME: 'y', OP: '+=' }, inputs: { VALUE: num(10) } }),
        blk('stitch_set', { fields: { NAME: 'x', OP: '=' }, inputs: { VALUE: num(0) } }),
        blk('stitch_set', { fields: { NAME: 'y', OP: '=' }, inputs: { VALUE: num(0) } }),
        builtin('on_edge'),
        builtin('angle_to'),
        builtin('distance_to'),
        blk('stitch_prop', { fields: { PROP: 'x' } }),
        blk('stitch_prop', { fields: { PROP: 'y' } }),
        blk('stitch_prop', { fields: { PROP: 'direction' } }),
      ]),
      cat('Looks', 'looks_category', [
        ...byCategory('looks'),
        blk('stitch_set', { fields: { NAME: 'size', OP: '=' }, inputs: { VALUE: num(100) } }),
        blk('stitch_prop', { fields: { PROP: 'size' } }),
        blk('stitch_prop', { fields: { PROP: 'costume_number' } }),
      ]),
      cat('Control', 'control_category', [
        builtin('wait'),
        blk('stitch_repeat', { inputs: { COUNT: num(10) } }),
        blk('stitch_forever'),
        blk('controls_if'),
        blk('controls_if', { extraState: { hasElse: true } }),
        blk('stitch_wait_until'),
        blk('stitch_repeat_until'),
        blk('stitch_while'),
        blk('stitch_for', { inputs: { FROM: num(1), TO: num(10) } }),
        blk('stitch_for_step', { inputs: { FROM: num(10), TO: num(1), STEP: num(-1) } }),
        builtin('stop'),
      ]),
      cat('Sensing', 'sensing_category', byCategory('sensing')),
      cat('Operators', 'operator_category', [
        binary('stitch_arith', '+', num(0), num(0)),
        binary('stitch_arith', '-', num(0), num(0)),
        binary('stitch_arith', '*', num(0), num(0)),
        binary('stitch_arith', '/', num(0), num(0)),
        binary('stitch_arith', '%', num(0), num(0)),
        builtin('random'),
        binary('stitch_compare', '==', str(''), num(50)),
        binary('stitch_compare', '<', str(''), num(50)),
        binary('stitch_compare', '>', str(''), num(50)),
        binary('stitch_logic', 'and', {}, {}),
        binary('stitch_logic', 'or', {}, {}),
        blk('stitch_not'),
        blk('stitch_neg', { inputs: { X: num(1) } }),
        binary('stitch_join', undefined, str('apple '), str('banana')),
        blk('stitch_bool'),
        ...byCategory('math').filter((b) => b.type !== 'stitch_r_random'),
      ]),
      {
        kind: 'category',
        name: 'Variables',
        categorystyle: 'variable_category',
        custom: 'STITCH_VARIABLES',
      },
      cat('Lists', 'list_category', [
        blk('lists_create_with', { extraState: { itemCount: 2 } }),
        blk('stitch_index', { inputs: { INDEX: num(1) } }),
        blk('stitch_set_index', {
          fields: { OP: '=' },
          inputs: { INDEX: num(1), VALUE: str('thing') },
        }),
        ...byCategory('lists'),
        blk('stitch_for_each'),
      ]),
      {
        kind: 'category',
        name: 'Functions',
        categorystyle: 'procedure_category',
        custom: 'STITCH_FUNCTIONS',
      },
      cat('Debug', 'debug_category', [...byCategory('debug'), blk('stitch_raw')]),
    ],
  };
}

export function variablesFlyout(info: ToolboxInfo): ToolboxItem[] {
  const items: ToolboxItem[] = [
    blk('stitch_var_decl', {
      fields: { SCOPE: 'sprite', NAME: 'score' },
      inputs: { INIT: num(0) },
    }),
  ];
  for (const v of info.vars) items.push(blk('stitch_var', { fields: { NAME: v } }));
  const first = info.vars[0] ?? 'score';
  items.push(
    blk('stitch_set', { fields: { NAME: first, OP: '=' }, inputs: { VALUE: num(0) } }),
    blk('stitch_set', { fields: { NAME: first, OP: '+=' }, inputs: { VALUE: num(1) } }),
    blk('stitch_local', { fields: { NAME: 'i' }, inputs: { VALUE: num(0) } }),
  );
  return items;
}

export function functionsFlyout(info: ToolboxInfo): ToolboxItem[] {
  const items: ToolboxItem[] = [blk('stitch_function')];
  for (const f of info.functions) {
    const inputs: Record<string, InputJson> = {};
    f.params.forEach((_, i) => (inputs[`ARG${i}`] = str('')));
    items.push(
      blk('stitch_call', {
        fields: { NAME: f.name },
        extraState: { args: f.params.length },
        inputs,
      }),
    );
    items.push(
      blk('stitch_call_expr', {
        fields: { NAME: f.name },
        extraState: { args: f.params.length },
        inputs,
      }),
    );
  }
  items.push(blk('stitch_return'), blk('stitch_return_value'));
  return items;
}

/** Blockly theme data (block and category styles) built from STYLES. */
export function themeStyles() {
  const blockStyles: Record<string, Record<string, string>> = {};
  const categoryStyles: Record<string, { colour: string }> = {};
  for (const [name, [p, s, t]] of Object.entries(STYLES)) {
    blockStyles[name] = { colourPrimary: p, colourSecondary: s, colourTertiary: t };
    categoryStyles[name.replace(/_blocks$/, '_category')] = { colour: p };
  }
  blockStyles.event_blocks!.hat = 'cap';
  blockStyles.procedure_blocks!.hat = 'cap';
  return { blockStyles, categoryStyles };
}
