import {
  getBuiltin,
  type Block,
  type Expr,
  type Module,
  type Stmt,
  type TopItem,
  type Trivia,
  type ValueType,
} from '@stitch/ir';
import { ARITH_OPS, COMPARE_OPS, LOGIC_OPS } from './definitions';
import type { BlockJson, InputJson, Position } from './json';
import { blockTypeOf } from './labels';

/** Slot kinds decide which shadow (typed-in default) an input gets. */
type Slot = ValueType;

/** IR module -> Blockly top-level blocks. Block ids are IR node ids. */
export function toBlocks(m: Module, layout: Record<string, Position> = {}): BlockJson[] {
  return m.items.map((it) => {
    const b = topItem(it);
    const pos = layout[it.id];
    if (pos) {
      b.x = pos.x;
      b.y = pos.y;
    }
    return b;
  });
}

function withComment(b: BlockJson, t: Trivia | undefined): BlockJson {
  // Shown without the space after `--`; carryTextDetails restores exact spelling if unchanged.
  if (t?.comments?.length)
    b.icons = {
      comment: {
        text: t.comments.map((c) => c.replace(/^ /, '')).join('\n'),
        pinned: false,
        height: 80,
        width: 200,
      },
    };
  return b;
}

function topItem(it: TopItem): BlockJson {
  switch (it.kind) {
    case 'VarDecl':
      return withComment(
        {
          type: 'stitch_var_decl',
          id: it.id,
          fields: { SCOPE: it.scope, NAME: it.name },
          inputs: { INIT: input(it.init, 'any') },
        },
        it.trivia,
      );
    case 'FunctionDef':
      return withComment(
        {
          type: 'stitch_function',
          id: it.id,
          fields: { NAME: it.name, PARAMS: it.params.join(', '), WARP: it.warp === true },
          ...chainAsNext(it.body),
        },
        it.trivia,
      );
    case 'EventScript': {
      const ev = it.event;
      const head: BlockJson =
        ev.type === 'start'
          ? { type: 'stitch_on_start', id: it.id }
          : ev.type === 'key'
            ? { type: 'stitch_on_key', id: it.id, fields: { KEY: ev.key } }
            : { type: 'stitch_on_message', id: it.id, fields: { MSG: ev.name } };
      return withComment({ ...head, ...chainAsNext(it.body) }, it.trivia);
    }
    case 'Raw':
      return withComment(
        { type: 'stitch_raw_item', id: it.id, fields: { TEXT: it.text } },
        it.trivia,
      );
  }
}

/** A block's statements as a `next` chain starting at the first statement. */
function chain(b: Block): BlockJson | undefined {
  let first: BlockJson | undefined;
  let prev: BlockJson | undefined;
  for (const s of b.stmts) {
    const cur = stmt(s);
    if (prev) prev.next = { block: cur };
    else first = cur;
    prev = cur;
  }
  return first;
}

function chainAsNext(b: Block): { next?: InputJson } {
  const first = chain(b);
  return first ? { next: { block: first } } : {};
}

function stmtInput(b: Block): InputJson | undefined {
  const first = chain(b);
  return first ? { block: first } : undefined;
}

function inputs(entries: [string, InputJson | undefined][]): Record<string, InputJson> {
  const out: Record<string, InputJson> = {};
  for (const [k, v] of entries) if (v) out[k] = v;
  return out;
}

function stmt(s: Stmt): BlockJson {
  const b = stmtBlock(s);
  return withComment(b, s.trivia);
}

function stmtBlock(s: Stmt): BlockJson {
  const id = s.id;
  switch (s.kind) {
    case 'LocalDecl':
      return {
        type: 'stitch_local',
        id,
        fields: { NAME: s.name },
        inputs: { VALUE: input(s.init, 'any') },
      };
    case 'Assign': {
      const t = s.target;
      if (t.kind === 'Index')
        return {
          type: 'stitch_set_index',
          id,
          fields: { OP: s.op },
          inputs: {
            INDEX: input(t.index, 'number'),
            LIST: input(t.target, 'list'),
            VALUE: input(s.value, s.op === '=' ? 'any' : 'number'),
          },
        };
      return {
        type: 'stitch_set',
        id,
        fields: { NAME: t.kind === 'Prop' ? t.prop : t.name, OP: s.op },
        inputs: { VALUE: input(s.value, s.op === '=' ? 'any' : 'number') },
      };
    }
    case 'CallStmt':
      return callBlock(s.call, 'command', id);
    case 'If': {
      const ins: [string, InputJson | undefined][] = [
        ['IF0', input(s.cond, 'boolean')],
        ['DO0', stmtInput(s.then)],
      ];
      s.elifs.forEach((e, i) => {
        ins.push([`IF${i + 1}`, input(e.cond, 'boolean')], [`DO${i + 1}`, stmtInput(e.body)]);
      });
      if (s.else) ins.push(['ELSE', stmtInput(s.else)]);
      const extraState: Record<string, unknown> = {};
      if (s.elifs.length) extraState.elseIfCount = s.elifs.length;
      if (s.else) extraState.hasElse = true;
      return { type: 'controls_if', id, extraState, inputs: inputs(ins) };
    }
    case 'Forever':
      return { type: 'stitch_forever', id, inputs: inputs([['DO', stmtInput(s.body)]]) };
    case 'Repeat':
      return {
        type: 'stitch_repeat',
        id,
        inputs: inputs([
          ['COUNT', input(s.count, 'number')],
          ['DO', stmtInput(s.body)],
        ]),
      };
    case 'RepeatUntil':
      return {
        type: 'stitch_repeat_until',
        id,
        inputs: inputs([
          ['COND', input(s.cond, 'boolean')],
          ['DO', stmtInput(s.body)],
        ]),
      };
    case 'While':
      return {
        type: 'stitch_while',
        id,
        inputs: inputs([
          ['COND', input(s.cond, 'boolean')],
          ['DO', stmtInput(s.body)],
        ]),
      };
    case 'ForRange':
      return {
        type: s.step ? 'stitch_for_step' : 'stitch_for',
        id,
        fields: { VAR: s.var },
        inputs: inputs([
          ['FROM', input(s.from, 'number')],
          ['TO', input(s.to, 'number')],
          ['STEP', s.step ? input(s.step, 'number') : undefined],
          ['DO', stmtInput(s.body)],
        ]),
      };
    case 'ForEach':
      return {
        type: 'stitch_for_each',
        id,
        fields: { VAR: s.var },
        inputs: inputs([
          ['LIST', input(s.list, 'list')],
          ['DO', stmtInput(s.body)],
        ]),
      };
    case 'WaitUntil':
      return { type: 'stitch_wait_until', id, inputs: { COND: input(s.cond, 'boolean') } };
    case 'Return':
      return s.value
        ? { type: 'stitch_return_value', id, inputs: { VALUE: input(s.value, 'any') } }
        : { type: 'stitch_return', id };
    case 'Raw':
      return { type: 'stitch_raw', id, fields: { TEXT: s.text } };
  }
}

/** Builtin block when name, kind and arity match; otherwise the generic call block. */
function callBlock(
  c: Extract<Expr, { kind: 'Call' }>,
  as: 'command' | 'reporter',
  id: string,
): BlockJson {
  const b = getBuiltin(c.name);
  if (b && b.kind === as && b.params.length === c.args.length) {
    const ins: Record<string, InputJson> = {};
    c.args.forEach((a, i) => (ins[`ARG${i}`] = input(a, b.params[i]!.type)));
    // A call statement is one block: it takes the statement's id (the call's id is derived).
    return { type: blockTypeOf(b), id: as === 'command' ? id : c.id, inputs: ins };
  }
  const ins: Record<string, InputJson> = {};
  c.args.forEach((a, i) => (ins[`ARG${i}`] = input(a, 'any')));
  return as === 'command'
    ? {
        type: 'stitch_call',
        id,
        fields: { NAME: c.name },
        extraState: { args: c.args.length },
        inputs: ins,
      }
    : {
        type: 'stitch_call_expr',
        id: c.id,
        fields: { NAME: c.name },
        extraState: { args: c.args.length },
        inputs: ins,
      };
}

/**
 * A value input. Literals that fit the slot become its shadow (the typed-in field); anything
 * else is a real block, with the slot's default shadow underneath like in Scratch.
 */
function input(e: Expr, slot: Slot): InputJson {
  if (e.kind === 'Num' && (slot === 'number' || slot === 'any'))
    return { shadow: numBlock(e.id, e.value) };
  if (e.kind === 'Str' && (slot === 'string' || slot === 'any'))
    return { shadow: strBlock(e.id, e.value) };
  const out: InputJson = { block: expr(e) };
  const sh = defaultShadow(slot, `${e.id}~s`);
  if (sh) out.shadow = sh;
  return out;
}

export function numBlock(id: string, value: number): BlockJson {
  return { type: 'stitch_num', id, fields: { NUM: value } };
}

export function strBlock(id: string, value: string): BlockJson {
  return { type: 'stitch_str', id, fields: { TEXT: value } };
}

/** Shadow for an empty slot of this kind (none for boolean and list slots, as in Scratch). */
export function defaultShadow(slot: Slot, id: string): BlockJson | undefined {
  if (slot === 'number') return numBlock(id, 0);
  if (slot === 'string' || slot === 'any') return strBlock(id, '');
  return undefined;
}

function expr(e: Expr): BlockJson {
  const id = e.id;
  switch (e.kind) {
    case 'Num':
      return numBlock(id, e.value);
    case 'Str':
      return strBlock(id, e.value);
    case 'Bool':
      return { type: 'stitch_bool', id, fields: { BOOL: String(e.value) } };
    case 'List': {
      const ins: Record<string, InputJson> = {};
      e.items.forEach((it, i) => (ins[`ADD${i}`] = input(it, 'any')));
      return {
        type: 'lists_create_with',
        id,
        extraState: { itemCount: e.items.length },
        inputs: ins,
      };
    }
    case 'Var':
      return { type: 'stitch_var', id, fields: { NAME: e.name } };
    case 'Prop':
      return { type: 'stitch_prop', id, fields: { PROP: e.prop } };
    case 'Index':
      return {
        type: 'stitch_index',
        id,
        inputs: { INDEX: input(e.index, 'number'), LIST: input(e.target, 'list') },
      };
    case 'Unary':
      return e.op === '-'
        ? { type: 'stitch_neg', id, inputs: { X: input(e.operand, 'number') } }
        : { type: 'stitch_not', id, inputs: { X: input(e.operand, 'boolean') } };
    case 'Binary': {
      const [type, slot]: [string, Slot] = ARITH_OPS.includes(e.op)
        ? ['stitch_arith', 'number']
        : COMPARE_OPS.includes(e.op)
          ? ['stitch_compare', 'any']
          : LOGIC_OPS.includes(e.op)
            ? ['stitch_logic', 'boolean']
            : ['stitch_join', 'string'];
      const b: BlockJson = {
        type,
        id,
        inputs: { A: input(e.left, slot), B: input(e.right, slot) },
      };
      if (type !== 'stitch_join') b.fields = { OP: e.op };
      return b;
    }
    case 'Call':
      return callBlock(e, 'reporter', id);
  }
}
