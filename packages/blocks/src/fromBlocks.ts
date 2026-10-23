import {
  getBuiltin,
  isSpriteProp,
  type AssignOp,
  type BinaryOp,
  type Block,
  type Call,
  type Expr,
  type LValue,
  type Module,
  type Stmt,
  type TopItem,
  type Trivia,
} from '@stitch/ir';
import { TOP_TYPES } from './definitions';
import type { BlockJson, InputJson, Position } from './json';

export interface FromBlocksResult {
  module: Module;
  /** Workspace position of each top-level program block, by node id. */
  layout: Record<string, Position>;
  /** Top-level blocks that are not program (stray stacks and reporters): scratch paper. */
  loose: BlockJson[];
}

const typeName = (t: string) => /^stitch_[br]_(.+)$/.exec(t)?.[1];

/**
 * Blockly top-level blocks -> IR. Every program block maps to exactly one IR node and keeps its
 * id. Empty inputs read as the slot's neutral value (false, 0 or ""), as Scratch treats them.
 */
export function fromBlocks(top: BlockJson[]): FromBlocksResult {
  const items: TopItem[] = [];
  const layout: Record<string, Position> = {};
  const loose: BlockJson[] = [];
  for (const b of top) {
    if (!TOP_TYPES.has(b.type)) {
      loose.push(b);
      continue;
    }
    items.push(topItem(b));
    if (b.x !== undefined && b.y !== undefined) layout[b.id] = { x: b.x, y: b.y };
  }
  return { module: { items }, layout, loose };
}

const field = (b: BlockJson, name: string): string => {
  const v = b.fields?.[name];
  return v === undefined || v === null ? '' : String(v);
};

function trivia(b: BlockJson): { trivia?: Trivia } {
  const text = b.icons?.comment?.text;
  if (text === undefined) return {};
  return { trivia: { comments: text.split('\n').map((l) => (l === '' ? '' : ' ' + l)) } };
}

function topItem(b: BlockJson): TopItem {
  const id = b.id;
  const t = trivia(b);
  switch (b.type) {
    case 'stitch_var_decl':
      return {
        id,
        kind: 'VarDecl',
        scope: field(b, 'SCOPE') === 'global' ? 'global' : 'sprite',
        name: field(b, 'NAME'),
        init: value(b, 'INIT', 'string'),
        ...t,
      };
    case 'stitch_function': {
      const params = field(b, 'PARAMS')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const warp = b.fields?.WARP === true || b.fields?.WARP === 'TRUE';
      const body = seq(b.next?.block);
      return warp
        ? { id, kind: 'FunctionDef', warp, name: field(b, 'NAME'), params, body, ...t }
        : { id, kind: 'FunctionDef', name: field(b, 'NAME'), params, body, ...t };
    }
    case 'stitch_on_start':
      return { id, kind: 'EventScript', event: { type: 'start' }, body: seq(b.next?.block), ...t };
    case 'stitch_on_key':
      return {
        id,
        kind: 'EventScript',
        event: { type: 'key', key: field(b, 'KEY') },
        body: seq(b.next?.block),
        ...t,
      };
    case 'stitch_on_message':
      return {
        id,
        kind: 'EventScript',
        event: { type: 'message', name: field(b, 'MSG') },
        body: seq(b.next?.block),
        ...t,
      };
    default:
      return { id, kind: 'Raw', text: field(b, 'TEXT'), error: 'raw code', ...t };
  }
}

/** A `next` chain as a statement list. */
function seq(first: BlockJson | undefined): Block {
  const stmts: Stmt[] = [];
  for (let b = first; b; b = b.next?.block) stmts.push(stmt(b));
  return { stmts };
}

const body = (b: BlockJson, name: string) => seq(b.inputs?.[name]?.block);

function stmt(b: BlockJson): Stmt {
  const s = stmtNode(b);
  const t = trivia(b);
  return t.trivia ? { ...s, trivia: t.trivia } : s;
}

function stmtNode(b: BlockJson): Stmt {
  const id = b.id;
  switch (b.type) {
    case 'stitch_local':
      return { id, kind: 'LocalDecl', name: field(b, 'NAME'), init: value(b, 'VALUE', 'string') };
    case 'stitch_set': {
      const name = field(b, 'NAME');
      const target: LValue = isSpriteProp(name)
        ? { id: `${id}.t`, kind: 'Prop', prop: name }
        : { id: `${id}.t`, kind: 'Var', name };
      return { id, kind: 'Assign', target, op: assignOp(b), value: value(b, 'VALUE', 'number') };
    }
    case 'stitch_set_index': {
      const target: LValue = {
        id: `${id}.t`,
        kind: 'Index',
        target: value(b, 'LIST', 'list'),
        index: value(b, 'INDEX', 'number'),
      };
      return { id, kind: 'Assign', target, op: assignOp(b), value: value(b, 'VALUE', 'number') };
    }
    case 'controls_if': {
      const n = Number(b.extraState?.elseIfCount ?? 0);
      const elifs = Array.from({ length: n }, (_, i) => ({
        id: `${id}.e${i + 1}`,
        cond: value(b, `IF${i + 1}`, 'boolean'),
        body: body(b, `DO${i + 1}`),
      }));
      const s: Stmt = {
        id,
        kind: 'If',
        cond: value(b, 'IF0', 'boolean'),
        then: body(b, 'DO0'),
        elifs,
      };
      if (b.extraState?.hasElse) s.else = body(b, 'ELSE');
      return s;
    }
    case 'stitch_forever':
      return { id, kind: 'Forever', body: body(b, 'DO') };
    case 'stitch_repeat':
      return { id, kind: 'Repeat', count: value(b, 'COUNT', 'number'), body: body(b, 'DO') };
    case 'stitch_repeat_until':
      return { id, kind: 'RepeatUntil', cond: value(b, 'COND', 'boolean'), body: body(b, 'DO') };
    case 'stitch_while':
      return { id, kind: 'While', cond: value(b, 'COND', 'boolean'), body: body(b, 'DO') };
    case 'stitch_for':
    case 'stitch_for_step': {
      const s: Stmt = {
        id,
        kind: 'ForRange',
        var: field(b, 'VAR'),
        from: value(b, 'FROM', 'number'),
        to: value(b, 'TO', 'number'),
        body: body(b, 'DO'),
      };
      if (b.type === 'stitch_for_step') s.step = value(b, 'STEP', 'number');
      return s;
    }
    case 'stitch_for_each':
      return {
        id,
        kind: 'ForEach',
        var: field(b, 'VAR'),
        list: value(b, 'LIST', 'list'),
        body: body(b, 'DO'),
      };
    case 'stitch_wait_until':
      return { id, kind: 'WaitUntil', cond: value(b, 'COND', 'boolean') };
    case 'stitch_return':
      return { id, kind: 'Return' };
    case 'stitch_return_value':
      return { id, kind: 'Return', value: value(b, 'VALUE', 'string') };
    case 'stitch_raw':
      return { id, kind: 'Raw', text: field(b, 'TEXT'), error: 'raw code' };
    case 'stitch_call':
      return { id, kind: 'CallStmt', call: call(b, `${id}.c`) };
    default: {
      if (typeName(b.type)) return { id, kind: 'CallStmt', call: call(b, `${id}.c`) };
      // An expression block in a statement slot can't happen in Blockly; keep it as raw text.
      return {
        id,
        kind: 'Raw',
        text: `-- unsupported block ${b.type}`,
        error: `unsupported block ${b.type}`,
      };
    }
  }
}

function assignOp(b: BlockJson): AssignOp {
  const op = field(b, 'OP');
  return op === '+=' || op === '-=' || op === '*=' || op === '/=' ? op : '=';
}

function call(b: BlockJson, id: string): Call {
  const name =
    b.type === 'stitch_call' || b.type === 'stitch_call_expr'
      ? field(b, 'NAME')
      : typeName(b.type)!;
  const builtin =
    b.type === 'stitch_call' || b.type === 'stitch_call_expr' ? undefined : getBuiltin(name);
  const count = builtin ? builtin.params.length : Number(b.extraState?.args ?? 0);
  const args = Array.from({ length: count }, (_, i) =>
    value(b, `ARG${i}`, builtin?.params[i]?.type === 'number' ? 'number' : 'string'),
  );
  return { id, kind: 'Call', name, args };
}

type Neutral = 'number' | 'string' | 'boolean' | 'list';

/** The expression in an input: the dropped-in block, else the shadow, else a neutral value. */
function value(b: BlockJson, name: string, neutral: Neutral): Expr {
  const inp: InputJson | undefined = b.inputs?.[name];
  const blk = inp?.block ?? inp?.shadow;
  if (blk) return expr(blk);
  const id = `${b.id}.${name}`;
  if (neutral === 'boolean') return { id, kind: 'Bool', value: false };
  if (neutral === 'number') return { id, kind: 'Num', value: 0 };
  if (neutral === 'list') return { id, kind: 'List', items: [] };
  return { id, kind: 'Str', value: '' };
}

function expr(b: BlockJson): Expr {
  const id = b.id;
  switch (b.type) {
    case 'stitch_num': {
      const v = Number(b.fields?.NUM ?? 0);
      return { id, kind: 'Num', value: Number.isFinite(v) ? v : 0 };
    }
    case 'stitch_str':
      return { id, kind: 'Str', value: field(b, 'TEXT') };
    case 'stitch_bool':
      return { id, kind: 'Bool', value: field(b, 'BOOL') === 'true' };
    case 'lists_create_with': {
      const n = Number(b.extraState?.itemCount ?? 0);
      return {
        id,
        kind: 'List',
        items: Array.from({ length: n }, (_, i) => value(b, `ADD${i}`, 'string')),
      };
    }
    case 'stitch_var': {
      const name = field(b, 'NAME');
      return isSpriteProp(name) ? { id, kind: 'Prop', prop: name } : { id, kind: 'Var', name };
    }
    case 'stitch_prop': {
      const p = field(b, 'PROP');
      return isSpriteProp(p) ? { id, kind: 'Prop', prop: p } : { id, kind: 'Var', name: p };
    }
    case 'stitch_index':
      return {
        id,
        kind: 'Index',
        target: value(b, 'LIST', 'list'),
        index: value(b, 'INDEX', 'number'),
      };
    case 'stitch_neg':
      return { id, kind: 'Unary', op: '-', operand: value(b, 'X', 'number') };
    case 'stitch_not':
      return { id, kind: 'Unary', op: 'not', operand: value(b, 'X', 'boolean') };
    case 'stitch_arith':
    case 'stitch_compare':
    case 'stitch_logic': {
      const neutral: Neutral =
        b.type === 'stitch_logic' ? 'boolean' : b.type === 'stitch_arith' ? 'number' : 'string';
      return {
        id,
        kind: 'Binary',
        op: field(b, 'OP') as BinaryOp,
        left: value(b, 'A', neutral),
        right: value(b, 'B', neutral),
      };
    }
    case 'stitch_join':
      return {
        id,
        kind: 'Binary',
        op: '..',
        left: value(b, 'A', 'string'),
        right: value(b, 'B', 'string'),
      };
    case 'stitch_call_expr':
      return call(b, id);
    default:
      if (typeName(b.type)) return call(b, id);
      return { id, kind: 'Str', value: '' };
  }
}
