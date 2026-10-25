/**
 * Test helper: builds `.sb3` files from a compact description of scripts, the way Scratch saves
 * them (shadow menus, compact primitives, `[kind, value, shadow]` inputs).
 */
import { strToU8, zipSync } from 'fflate';
import type { Sb3Block, Sb3Costume, Sb3Monitor, Sb3Sound, Sb3Target } from './project';

/** A block: opcode, inputs, fields, and for C-blocks the stacks inside. */
export interface B {
  op: string;
  inputs?: Record<string, In>;
  fields?: Record<string, [unknown, (string | null)?]>;
  mutation?: Record<string, unknown>;
  sub?: B[];
  sub2?: B[];
}

/** An input: a number or text literal, a menu, a compact primitive, or a reporter block. */
export type In =
  number | string | B | { menu: string; field: string; value: string } | { prim: unknown[] };

export const b = (op: string, inputs?: B['inputs'], fields?: B['fields']): B => ({
  op,
  ...(inputs ? { inputs } : {}),
  ...(fields ? { fields } : {}),
});
export const menu = (opcode: string, field: string, value: string): In => ({
  menu: opcode,
  field,
  value,
});
/** Variable and list references, as fields and as dropped-in reporters. */
export const vf = (name: string): [string, string] => [name, `v:${name}`];
export const lf = (name: string): [string, string] => [name, `l:${name}`];
export const v = (name: string): In => ({ prim: [12, name, `v:${name}`] });
export const msg = (name: string): In => ({ prim: [11, name, `m:${name}`] });

/** A custom block's definition and a call to it. */
export function proc(
  proccode: string,
  args: string[],
  body: B[],
  warp = false,
): { hat: B; body: B[] } {
  return {
    hat: {
      op: 'procedures_definition',
      mutation: {
        proccode,
        argumentids: JSON.stringify(args.map((a) => `arg:${a}`)),
        argumentnames: JSON.stringify(args),
        argumentdefaults: JSON.stringify(args.map(() => '')),
        warp: String(warp),
      },
    },
    body,
  };
}
export const callProc = (proccode: string, args: Record<string, In>): B => ({
  op: 'procedures_call',
  mutation: { proccode, argumentids: JSON.stringify(Object.keys(args).map((a) => `arg:${a}`)) },
  inputs: Object.fromEntries(Object.entries(args).map(([k, x]) => [`arg:${k}`, x])),
});
export const arg = (name: string, bool = false): B =>
  b(bool ? 'argument_reporter_boolean' : 'argument_reporter_string_number', undefined, {
    VALUE: [name],
  });

export interface TargetSpec {
  name: string;
  isStage?: boolean;
  variables?: Record<string, unknown>;
  lists?: Record<string, unknown[]>;
  cloud?: string[];
  /** Each script: a hat (or a definition from `proc`) and its body. */
  scripts?: { hat: B; body: B[] }[];
  costumes?: Sb3Costume[];
  sounds?: Sb3Sound[];
  comments?: Sb3Target['comments'];
  extra?: Partial<Sb3Target>;
}

export function target(spec: TargetSpec): Sb3Target {
  const blocks: Record<string, Sb3Block> = {};
  let n = 0;
  const id = () => `${spec.name}-${++n}`;
  const input = (x: In, parent: string): [number, unknown, unknown?] => {
    if (typeof x === 'number') return [1, [4, String(x)]];
    if (typeof x === 'string') return [1, [10, x]];
    if ('prim' in x)
      return x.prim[0] === 12 || x.prim[0] === 13 ? [3, x.prim, [10, '']] : [1, x.prim];
    if ('menu' in x) {
      const m = id();
      blocks[m] = {
        opcode: x.menu,
        parent,
        next: null,
        shadow: true,
        topLevel: false,
        inputs: {},
        fields: { [x.field]: [x.value, null] },
      };
      return [1, m];
    }
    return [3, block(x, parent), [10, '']];
  };
  const block = (x: B, parent: string | null): string => {
    const me = id();
    const blk: Sb3Block = {
      opcode: x.op,
      parent,
      next: null,
      shadow: false,
      topLevel: false,
      inputs: {},
      fields: x.fields ?? {},
      ...(x.mutation ? { mutation: x.mutation } : {}),
    };
    blocks[me] = blk;
    for (const [k, val] of Object.entries(x.inputs ?? {})) blk.inputs![k] = input(val, me);
    if (x.sub) blk.inputs!.SUBSTACK = [2, stack(x.sub, me)];
    if (x.sub2) blk.inputs!.SUBSTACK2 = [2, stack(x.sub2, me)];
    return me;
  };
  const stack = (xs: B[], parent: string): string | null => {
    let first: string | null = null;
    let prev = parent;
    for (const x of xs) {
      const me = block(x, prev);
      if (first === null) first = me;
      else blocks[prev]!.next = me;
      prev = me;
    }
    return first;
  };
  (spec.scripts ?? []).forEach((s, i) => {
    let hat: string;
    if (s.hat.op === 'procedures_definition') {
      hat = id();
      const proto = id();
      blocks[hat] = {
        opcode: s.hat.op,
        parent: null,
        next: null,
        topLevel: true,
        shadow: false,
        x: 0,
        y: i * 100,
        inputs: { custom_block: [1, proto] },
        fields: {},
      };
      blocks[proto] = {
        opcode: 'procedures_prototype',
        parent: hat,
        next: null,
        shadow: true,
        topLevel: false,
        inputs: {},
        fields: {},
        mutation: s.hat.mutation ?? {},
      };
    } else {
      hat = block(s.hat, null);
      Object.assign(blocks[hat]!, { topLevel: true, x: 0, y: i * 100 });
    }
    blocks[hat]!.next = stack(s.body, hat);
  });
  return {
    isStage: spec.isStage ?? false,
    name: spec.name,
    variables: Object.fromEntries(
      Object.entries(spec.variables ?? {}).map(([k, x]) => [
        `v:${k}`,
        [k, x, ...(spec.cloud?.includes(k) ? [true] : [])],
      ]),
    ) as Sb3Target['variables'],
    lists: Object.fromEntries(Object.entries(spec.lists ?? {}).map(([k, x]) => [`l:${k}`, [k, x]])),
    blocks,
    comments: spec.comments ?? {},
    currentCostume: 0,
    costumes: spec.costumes ?? [],
    sounds: spec.sounds ?? [],
    layerOrder: spec.isStage ? 0 : 1,
    ...(spec.isStage
      ? {}
      : {
          x: 0,
          y: 0,
          size: 100,
          direction: 90,
          visible: true,
          draggable: false,
          rotationStyle: 'all around',
        }),
    ...spec.extra,
  };
}

/** A zipped project. `files` are the assets by `md5ext`. */
export function sb3(
  targets: Sb3Target[],
  files: Record<string, Uint8Array> = {},
  monitors: Sb3Monitor[] = [],
): Uint8Array {
  const json = JSON.stringify({ targets, monitors, extensions: [], meta: { semver: '3.0.0' } });
  return zipSync({ 'project.json': strToU8(json), ...files });
}

export const stage = (spec: Omit<TargetSpec, 'name' | 'isStage'> = {}) =>
  target({ name: 'Stage', isStage: true, ...spec });
