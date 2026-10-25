/**
 * Scratch blocks → Stitch IR, one target at a time. Statements and reporters each have one switch
 * on the opcode; `HANDLED` lists every opcode they cover, and anything else becomes a
 * `-- sb3: <opcode>` comment in place (see `docs/import-scratch.md`).
 */
import type {
  BinaryOp,
  Block,
  ElseIf,
  EventSpec,
  Expr,
  IdGen,
  LValue,
  SpriteProp,
  Stmt,
  TopItem,
  Trivia,
} from '@stitch/ir';
import { Namespace } from './names';
import type { Sb3Block, Sb3Input, Sb3Target } from './project';
import type { ImportReport } from './report';

/** What a slot holds when its input is empty, and how literal text in it is read. */
type Slot = 'num' | 'text' | 'bool';

export interface VarInfo {
  /** The Stitch identifier. */
  name: string;
  /** The Scratch name, for monitor labels and `var_of`. */
  label: string;
  list: boolean;
  global: boolean;
}

export interface ProcInfo {
  name: string;
  params: string[];
  /** Scratch argument ids, in the order of `params`. */
  argIds: string[];
  argNames: string[];
  /** Per argument: does it take a boolean (`%b`)? */
  bools: boolean[];
  warp: boolean;
}

/** One target's names, worked out before any script is converted so references can resolve. */
export interface TargetNames {
  ns: Namespace;
  /** By Scratch variable or list id. */
  vars: Map<string, VarInfo>;
  /** By `v:<name>` or `l:<name>`, for references whose id doesn't match. */
  byName: Map<string, VarInfo>;
  /** By proccode. */
  procs: Map<string, ProcInfo>;
  /** Scratch sound name → cart sound name. */
  sounds: Map<string, string>;
  /** Variables found only in references, declared on the fly. */
  extra: VarInfo[];
}

export interface Context {
  ids: IdGen;
  report: ImportReport;
  stage: TargetNames;
  /** Sprite name → its names, for `sensing_of` reading another sprite's variable. */
  sprites: Map<string, TargetNames>;
}

const KEYS: Record<string, string> = {
  space: 'space',
  'left arrow': 'left',
  'right arrow': 'right',
  'up arrow': 'up',
  'down arrow': 'down',
  enter: 'enter',
  any: 'any',
};

/** Scratch key name → Stitch key name (D8). */
export function keyName(raw: string): string {
  const k = raw.toLowerCase();
  return KEYS[k] ?? k;
}

const MATHOPS: Record<string, string> = {
  abs: 'abs',
  floor: 'floor',
  ceiling: 'ceil',
  sqrt: 'sqrt',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  asin: 'asin',
  acos: 'acos',
  atan: 'atan',
  ln: 'ln',
  log: 'log',
  'e ^': 'exp',
  '10 ^': 'pow10',
};

const UNITS: Record<string, string> = {
  YEAR: 'year',
  MONTH: 'month',
  DATE: 'date',
  DAYOFWEEK: 'day of week',
  HOUR: 'hour',
  MINUTE: 'minute',
  SECOND: 'second',
};

const PEN_PARAMS: Record<string, [set: string, change: string]> = {
  color: ['set_pen_hue', 'change_pen_color'],
  saturation: ['set_pen_saturation', 'change_pen_saturation'],
  brightness: ['set_pen_brightness', 'change_pen_brightness'],
  transparency: ['set_pen_transparency', 'change_pen_transparency'],
};

const BINARY: Record<string, [BinaryOp, Slot]> = {
  operator_add: ['+', 'num'],
  operator_subtract: ['-', 'num'],
  operator_multiply: ['*', 'num'],
  operator_divide: ['/', 'num'],
  operator_mod: ['%', 'num'],
  operator_gt: ['>', 'text'],
  operator_lt: ['<', 'text'],
  operator_equals: ['==', 'text'],
  operator_and: ['and', 'bool'],
  operator_or: ['or', 'bool'],
  operator_join: ['..', 'text'],
};

/** Hats Stitch has an event for. */
const HATS = new Set([
  'event_whenflagclicked',
  'event_whenkeypressed',
  'event_whenthisspriteclicked',
  'event_whenbroadcastreceived',
  'event_whenbackdropswitchesto',
  'event_whengreaterthan',
  'control_start_as_clone',
]);

/** Every opcode the converter maps. Used by the coverage test and for menus it reads itself. */
export const HANDLED = new Set([
  ...HATS,
  'procedures_definition',
  'procedures_prototype',
  'procedures_call',
  'argument_reporter_string_number',
  'argument_reporter_boolean',
  // motion
  'motion_movesteps',
  'motion_turnright',
  'motion_turnleft',
  'motion_goto',
  'motion_gotoxy',
  'motion_glideto',
  'motion_glidesecstoxy',
  'motion_pointindirection',
  'motion_pointtowards',
  'motion_changexby',
  'motion_setx',
  'motion_changeyby',
  'motion_sety',
  'motion_ifonedgebounce',
  'motion_setrotationstyle',
  'motion_xposition',
  'motion_yposition',
  'motion_direction',
  // looks
  'looks_sayforsecs',
  'looks_say',
  'looks_thinkforsecs',
  'looks_think',
  'looks_switchcostumeto',
  'looks_nextcostume',
  'looks_switchbackdropto',
  'looks_switchbackdroptoandwait',
  'looks_nextbackdrop',
  'looks_changesizeby',
  'looks_setsizeto',
  'looks_changeeffectby',
  'looks_seteffectto',
  'looks_cleargraphiceffects',
  'looks_show',
  'looks_hide',
  'looks_gotofrontback',
  'looks_goforwardbackwardlayers',
  'looks_costumenumbername',
  'looks_backdropnumbername',
  'looks_size',
  // sound
  'sound_play',
  'sound_playuntildone',
  'sound_stopallsounds',
  'sound_changeeffectby',
  'sound_seteffectto',
  'sound_cleareffects',
  'sound_changevolumeby',
  'sound_setvolumeto',
  'sound_volume',
  // events
  'event_broadcast',
  'event_broadcastandwait',
  // control
  'control_wait',
  'control_repeat',
  'control_forever',
  'control_if',
  'control_if_else',
  'control_wait_until',
  'control_repeat_until',
  'control_while',
  'control_stop',
  'control_create_clone_of',
  'control_delete_this_clone',
  // sensing
  'sensing_touchingobject',
  'sensing_touchingcolor',
  'sensing_coloristouchingcolor',
  'sensing_distanceto',
  'sensing_askandwait',
  'sensing_answer',
  'sensing_keypressed',
  'sensing_mousedown',
  'sensing_mousex',
  'sensing_mousey',
  'sensing_setdragmode',
  'sensing_loudness',
  'sensing_loud',
  'sensing_timer',
  'sensing_resettimer',
  'sensing_of',
  'sensing_current',
  'sensing_dayssince2000',
  'sensing_username',
  // operators
  ...Object.keys(BINARY),
  'operator_random',
  'operator_not',
  'operator_letter_of',
  'operator_length',
  'operator_contains',
  'operator_round',
  'operator_mathop',
  // data
  'data_variable',
  'data_setvariableto',
  'data_changevariableby',
  'data_showvariable',
  'data_hidevariable',
  'data_listcontents',
  'data_addtolist',
  'data_deleteoflist',
  'data_deletealloflist',
  'data_insertatlist',
  'data_replaceitemoflist',
  'data_itemoflist',
  'data_itemnumoflist',
  'data_lengthoflist',
  'data_listcontainsitem',
  'data_showlist',
  'data_hidelist',
  // pen
  'pen_clear',
  'pen_stamp',
  'pen_penDown',
  'pen_penUp',
  'pen_setPenColorToColor',
  'pen_changePenColorParamBy',
  'pen_setPenColorParamTo',
  'pen_changePenSizeBy',
  'pen_setPenSizeTo',
  'pen_changePenHueBy',
  'pen_setPenHueToNumber',
]);

/** `jump %s high %b` → its words (`jump high`) and whether each input is a boolean. */
export function parseProccode(proccode: string): { words: string; bools: boolean[] } {
  const bools: boolean[] = [];
  const words = proccode.replace(/%([snb])/g, (_, t: string) => {
    bools.push(t === 'b');
    return ' ';
  });
  return { words: words.replace(/\s+/g, ' ').trim(), bools };
}

const parseJsonArray = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return [];
  try {
    const out: unknown = JSON.parse(v);
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
};

/** Registers a target's custom blocks, so calls from anywhere in it resolve. */
export function declareProcs(t: Sb3Target, names: TargetNames, report: ImportReport): void {
  for (const b of Object.values(t.blocks ?? {})) {
    if (Array.isArray(b) || b.opcode !== 'procedures_prototype') continue;
    const m = b.mutation ?? {};
    const proccode = typeof m.proccode === 'string' ? m.proccode : '';
    if (!proccode || names.procs.has(proccode)) continue;
    const { words, bools } = parseProccode(proccode);
    const name = names.ns.claim(words, 'block');
    if (name !== words)
      report.renamed.push({ kind: 'block', from: words, to: name, target: t.name });
    const scope = new Namespace(names.ns);
    const argNames = parseJsonArray(m.argumentnames).map(String);
    const params = argNames.map((a) => {
      const p = scope.claim(a, 'arg');
      if (p !== a) report.renamed.push({ kind: 'input', from: a, to: p, target: t.name });
      return p;
    });
    names.procs.set(proccode, {
      name,
      params,
      argIds: parseJsonArray(m.argumentids).map(String),
      argNames,
      bools,
      warp: m.warp === true || m.warp === 'true',
    });
  }
}

/** Numbers as Scratch saves them: plain decimals, optionally negative. */
const DECIMAL = /^-?\d+(\.\d+)?$/;

export class ScriptConverter {
  private readonly blocks: Record<string, Sb3Block | unknown[]>;
  /** Notes for the statement being converted: unsupported reporters inside it. */
  private notes: string[] = [];
  private proc: { info: ProcInfo; args: Map<string, string> } | undefined;
  private readonly commentsByBlock = new Map<string, string[]>();
  /** Proccodes whose definition has been converted. */
  private readonly defined = new Set<string>();
  /** Comments not attached to a block, put above the first item. */
  readonly looseComments: string[] = [];

  constructor(
    private readonly ctx: Context,
    private readonly t: Sb3Target,
    private readonly names: TargetNames,
  ) {
    this.blocks = t.blocks ?? {};
    for (const c of Object.values(t.comments ?? {})) {
      if (typeof c?.text !== 'string') continue;
      const lines = c.text.split(/\r?\n/).map((l) => (l ? ` ${l}` : ''));
      const target = c.blockId ? this.commentsByBlock.get(c.blockId) : undefined;
      if (c.blockId && this.blocks[c.blockId]) {
        if (target) target.push(...lines);
        else this.commentsByBlock.set(c.blockId, lines);
      } else this.looseComments.push(...lines);
    }
  }

  // ---- top level ----

  /** Event scripts and custom blocks, top to bottom as they sat in Scratch's workspace. */
  scripts(): TopItem[] {
    const tops: { id: string; b: Sb3Block }[] = [];
    for (const [id, b] of Object.entries(this.blocks)) {
      if (Array.isArray(b)) {
        // A loose variable or list reporter.
        this.ctx.report.dropped++;
        continue;
      }
      if (b.topLevel && !b.shadow) tops.push({ id, b });
    }
    tops.sort((p, q) => (p.b.y ?? 0) - (q.b.y ?? 0) || (p.b.x ?? 0) - (q.b.x ?? 0));
    const out: TopItem[] = [];
    for (const { id, b } of tops) {
      const item = this.top(b);
      if (!item) continue;
      const comments = this.commentsByBlock.get(id);
      if (comments) addComments(item, comments);
      out.push(item);
      this.ctx.report.scripts++;
    }
    return out;
  }

  private top(b: Sb3Block): TopItem | undefined {
    if (b.opcode === 'procedures_definition') return this.definition(b);
    const event = HATS.has(b.opcode) ? this.event(b) : undefined;
    if (event) {
      this.proc = undefined;
      return { kind: 'EventScript', id: this.id(), event, body: this.stack(b.next) };
    }
    if (b.opcode.includes('_when')) {
      // A hat Stitch has no event for. Its script is kept as a function nothing calls.
      this.unsupported(b.opcode);
      const name = this.names.ns.claim(b.opcode.replace(/^[a-zA-Z]+_/, ''), 'script');
      return {
        kind: 'FunctionDef',
        id: this.id(),
        name,
        params: [],
        body: this.stack(b.next),
        trivia: { comments: [` sb3: ${b.opcode} has no Stitch event, so nothing runs this`] },
      };
    }
    this.ctx.report.dropped++;
    return undefined;
  }

  private event(b: Sb3Block): EventSpec | undefined {
    switch (b.opcode) {
      case 'event_whenflagclicked':
        return { type: 'start' };
      case 'event_whenkeypressed':
        return { type: 'key', key: keyName(this.field(b, 'KEY_OPTION')) };
      case 'event_whenthisspriteclicked':
        return this.t.isStage ? undefined : { type: 'click' };
      case 'event_whenbroadcastreceived':
        return { type: 'message', name: this.field(b, 'BROADCAST_OPTION') };
      case 'event_whenbackdropswitchesto':
        return { type: 'backdrop', name: this.field(b, 'BACKDROP') };
      case 'control_start_as_clone':
        return this.t.isStage ? undefined : { type: 'clone' };
      case 'event_whengreaterthan': {
        const what = this.field(b, 'WHENGREATERTHANMENU').toLowerCase();
        const v = Number(this.literal(b, 'VALUE'));
        if ((what !== 'timer' && what !== 'loudness') || !Number.isFinite(v) || v < 0)
          return undefined;
        return { type: 'greater', what, value: v };
      }
    }
    return undefined;
  }

  private definition(b: Sb3Block): TopItem | undefined {
    const protoId = b.inputs?.custom_block?.[1];
    const proto = typeof protoId === 'string' ? this.blocks[protoId] : undefined;
    const proccode =
      proto && !Array.isArray(proto) && typeof proto.mutation?.proccode === 'string'
        ? proto.mutation.proccode
        : '';
    const info = this.names.procs.get(proccode);
    // Scratch runs the first of two definitions with the same text and ignores the other.
    if (!info || this.defined.has(proccode)) {
      this.ctx.report.dropped++;
      return undefined;
    }
    this.defined.add(proccode);
    this.proc = { info, args: new Map(info.argNames.map((a, i) => [a, info.params[i]!])) };
    const body = this.stack(b.next);
    this.proc = undefined;
    return {
      kind: 'FunctionDef',
      id: this.id(),
      ...(info.warp ? { warp: true } : {}),
      name: info.name,
      params: info.params,
      body,
    };
  }

  // ---- statements ----

  private stack(first: string | null | undefined): Block {
    // A C-block's inner stack is converted while its own statement is; keep that one's notes.
    const outer = this.notes;
    try {
      return this.stackInner(first);
    } finally {
      this.notes = outer;
    }
  }

  private stackInner(first: string | null | undefined): Block {
    const stmts: Stmt[] = [];
    let carry: string[] = [];
    const seen = new Set<string>();
    for (let id = first; id && !seen.has(id);) {
      seen.add(id);
      const b = this.blocks[id];
      if (!b || Array.isArray(b)) break;
      this.notes = [];
      const out = this.statement(b);
      const comments = [
        ...carry,
        ...this.notes.map((n) => ` sb3: ${n}`),
        ...(this.commentsByBlock.get(id) ?? []),
      ];
      if (out.length) {
        if (comments.length) addComments(out[0]!, comments);
        stmts.push(...out);
        carry = [];
      } else carry = comments;
      id = b.next;
    }
    return { stmts, ...(carry.length ? { trailing: { comments: carry } } : {}) };
  }

  private statement(b: Sb3Block): Stmt[] {
    const n = (name: string) => this.input(b, name, 'num');
    const s = (name: string) => this.input(b, name, 'text');
    const c = (name: string) => this.input(b, name, 'bool');
    const call = (name: string, ...args: Expr[]): Stmt[] => [this.callStmt(name, args)];
    switch (b.opcode) {
      // motion
      case 'motion_movesteps':
        return call('move', n('STEPS'));
      case 'motion_turnright':
        return call('turn', n('DEGREES'));
      case 'motion_turnleft':
        return call('turn', this.neg(n('DEGREES')));
      case 'motion_goto': {
        const m = this.menu(b, 'TO');
        if (m === '_random_') return call('goto_random');
        return call('goto_sprite', this.target(b, 'TO'));
      }
      case 'motion_gotoxy':
        return call('goto', n('X'), n('Y'));
      case 'motion_glideto':
        return call('glide_to', n('SECS'), this.target(b, 'TO'));
      case 'motion_glidesecstoxy':
        return call('glide', n('SECS'), n('X'), n('Y'));
      case 'motion_pointindirection':
        return call('point', n('DIRECTION'));
      case 'motion_pointtowards':
        if (this.menu(b, 'TOWARDS') === '_random_')
          return call('point', this.call('random', [this.num(-180), this.num(180)]));
        return call('point_towards_sprite', this.target(b, 'TOWARDS'));
      case 'motion_changexby':
        return [this.assign(this.prop('x'), '+=', n('DX'))];
      case 'motion_setx':
        return [this.assign(this.prop('x'), '=', n('X'))];
      case 'motion_changeyby':
        return [this.assign(this.prop('y'), '+=', n('DY'))];
      case 'motion_sety':
        return [this.assign(this.prop('y'), '=', n('Y'))];
      case 'motion_ifonedgebounce':
        return call('bounce');
      case 'motion_setrotationstyle':
        return call('rotation_style', this.str(this.field(b, 'STYLE')));
      // looks
      case 'looks_sayforsecs':
        return call('say_for', s('MESSAGE'), n('SECS'));
      case 'looks_say':
        return call('say', s('MESSAGE'));
      case 'looks_thinkforsecs':
        return call('think_for', s('MESSAGE'), n('SECS'));
      case 'looks_think':
        return call('think', s('MESSAGE'));
      case 'looks_switchcostumeto':
        return call('costume', s('COSTUME'));
      case 'looks_nextcostume':
        return call('next_costume');
      case 'looks_switchbackdropto':
        return call('backdrop', s('BACKDROP'));
      case 'looks_switchbackdroptoandwait':
        return call('backdrop_wait', s('BACKDROP'));
      case 'looks_nextbackdrop':
        return call('next_backdrop');
      case 'looks_changesizeby':
        return [this.assign(this.prop('size'), '+=', n('CHANGE'))];
      case 'looks_setsizeto':
        return [this.assign(this.prop('size'), '=', n('SIZE'))];
      case 'looks_changeeffectby':
        return call('change_effect', this.str(this.field(b, 'EFFECT').toLowerCase()), n('CHANGE'));
      case 'looks_seteffectto':
        return call('set_effect', this.str(this.field(b, 'EFFECT').toLowerCase()), n('VALUE'));
      case 'looks_cleargraphiceffects':
        return call('clear_effects');
      case 'looks_show':
        return call('show');
      case 'looks_hide':
        return call('hide');
      case 'looks_gotofrontback':
        return call(this.field(b, 'FRONT_BACK') === 'back' ? 'go_to_back' : 'go_to_front');
      case 'looks_goforwardbackwardlayers': {
        const by = n('NUM');
        return call(
          'change_layer',
          this.field(b, 'FORWARD_BACKWARD') === 'backward' ? this.neg(by) : by,
        );
      }
      // sound
      case 'sound_play':
        return call('play_sound', this.sound(b));
      case 'sound_playuntildone':
        return call('play_sound_wait', this.sound(b));
      case 'sound_stopallsounds':
        return call('stop_sounds');
      case 'sound_changeeffectby':
        return call(
          'change_sound_effect',
          this.str(this.field(b, 'EFFECT').toLowerCase()),
          n('VALUE'),
        );
      case 'sound_seteffectto':
        return call(
          'set_sound_effect',
          this.str(this.field(b, 'EFFECT').toLowerCase()),
          n('VALUE'),
        );
      case 'sound_cleareffects':
        return call('clear_sound_effects');
      case 'sound_changevolumeby':
        return call('change_volume', n('VOLUME'));
      case 'sound_setvolumeto':
        return call('set_volume', n('VOLUME'));
      // events
      case 'event_broadcast':
        return call('broadcast', s('BROADCAST_INPUT'));
      case 'event_broadcastandwait':
        return call('broadcast_wait', s('BROADCAST_INPUT'));
      // control
      case 'control_wait':
        return call('wait', n('DURATION'));
      case 'control_repeat':
        return [
          { kind: 'Repeat', id: this.id(), count: n('TIMES'), body: this.sub(b, 'SUBSTACK') },
        ];
      case 'control_forever':
        return [{ kind: 'Forever', id: this.id(), body: this.sub(b, 'SUBSTACK') }];
      case 'control_if':
        return [
          {
            kind: 'If',
            id: this.id(),
            cond: c('CONDITION'),
            then: this.sub(b, 'SUBSTACK'),
            elifs: [],
          },
        ];
      case 'control_if_else':
        return [this.ifElse(c('CONDITION'), this.sub(b, 'SUBSTACK'), this.sub(b, 'SUBSTACK2'))];
      case 'control_wait_until':
        return [{ kind: 'WaitUntil', id: this.id(), cond: c('CONDITION') }];
      case 'control_repeat_until':
        return [
          {
            kind: 'RepeatUntil',
            id: this.id(),
            cond: c('CONDITION'),
            body: this.sub(b, 'SUBSTACK'),
          },
        ];
      case 'control_while':
        return [
          { kind: 'While', id: this.id(), cond: c('CONDITION'), body: this.sub(b, 'SUBSTACK') },
        ];
      case 'control_stop': {
        const opt = this.field(b, 'STOP_OPTION');
        if (opt === 'all') return call('stop_all');
        if (opt.startsWith('other scripts')) return call('stop_other_scripts');
        // Inside a custom block, Scratch's "stop this script" only leaves the block.
        return this.proc ? [{ kind: 'Return', id: this.id() }] : call('stop');
      }
      case 'control_create_clone_of':
        if (this.menu(b, 'CLONE_OPTION') === '_myself_') return call('create_clone');
        return call('create_clone_of', s('CLONE_OPTION'));
      case 'control_delete_this_clone':
        return call('delete_clone');
      // sensing
      case 'sensing_askandwait':
        return call('ask', s('QUESTION'));
      case 'sensing_resettimer':
        return call('reset_timer');
      case 'sensing_setdragmode':
        return call('set_drag_mode', this.bool(this.field(b, 'DRAG_MODE') === 'draggable'));
      // data
      case 'data_setvariableto':
        return [this.assign(this.varRef(b, false), '=', s('VALUE'))];
      case 'data_changevariableby':
        return [this.assign(this.varRef(b, false), '+=', n('VALUE'))];
      case 'data_showvariable':
        return call('watch', this.str(this.varInfo(b, false).label), this.varRef(b, false));
      case 'data_hidevariable':
        return call('unwatch', this.str(this.varInfo(b, false).label));
      case 'data_showlist':
        return call('watch', this.str(this.varInfo(b, true).label), this.varRef(b, true));
      case 'data_hidelist':
        return call('unwatch', this.str(this.varInfo(b, true).label));
      case 'data_addtolist':
        return call('push', this.varRef(b, true), s('ITEM'));
      case 'data_deleteoflist': {
        const list = this.varRef(b, true);
        if (this.literal(b, 'INDEX') === 'all') return call('clear', list);
        return call('remove', list, this.listIndex(b, list, 0));
      }
      case 'data_deletealloflist':
        return call('clear', this.varRef(b, true));
      case 'data_insertatlist': {
        const list = this.varRef(b, true);
        return call('insert', list, this.listIndex(b, list, 1), s('ITEM'));
      }
      case 'data_replaceitemoflist': {
        const list = this.varRef(b, true);
        const target: LValue = {
          kind: 'Index',
          id: this.id(),
          target: list,
          index: this.listIndex(b, list, 0),
        };
        return [this.assign(target, '=', s('ITEM'))];
      }
      // custom blocks
      case 'procedures_call': {
        const proccode = typeof b.mutation?.proccode === 'string' ? b.mutation.proccode : '';
        const info = this.names.procs.get(proccode);
        if (!info) {
          // A call whose definition was deleted does nothing in Scratch.
          this.notes.push(`call to a missing custom block "${proccode}"`);
          return [];
        }
        return call(
          info.name,
          ...info.argIds.map((a, i) => this.input(b, a, info.bools[i] ? 'bool' : 'text')),
        );
      }
      // pen
      case 'pen_clear':
        return call('clear_pen');
      case 'pen_stamp':
        return call('stamp');
      case 'pen_penDown':
        return call('pen_down');
      case 'pen_penUp':
        return call('pen_up');
      case 'pen_setPenColorToColor':
        return call('set_pen_color', s('COLOR'));
      case 'pen_changePenColorParamBy':
      case 'pen_setPenColorParamTo': {
        const fns = PEN_PARAMS[this.menu(b, 'COLOR_PARAM') ?? ''];
        if (!fns) return this.unsupported(b.opcode);
        return call(fns[b.opcode === 'pen_setPenColorParamTo' ? 0 : 1], n('VALUE'));
      }
      case 'pen_changePenSizeBy':
        return call('change_pen_size', n('SIZE'));
      case 'pen_setPenSizeTo':
        return call('set_pen_size', n('SIZE'));
      // Scratch 2's pen hue ran 0–200 around the wheel; Scratch 3's colour runs 0–100.
      case 'pen_changePenHueBy':
        return call('change_pen_color', this.binary('/', n('HUE'), this.num(2)));
      case 'pen_setPenHueToNumber':
        return call('set_pen_hue', this.binary('/', n('HUE'), this.num(2)));
    }
    return this.unsupported(b.opcode);
  }

  private ifElse(cond: Expr, then: Block, otherwise: Block): Stmt {
    // `else` holding just an `if` reads better as `elseif`, and means the same.
    const only =
      otherwise.stmts.length === 1 && !otherwise.trailing ? otherwise.stmts[0] : undefined;
    if (only?.kind === 'If' && !only.trivia) {
      const elifs: ElseIf[] = [{ id: this.id(), cond: only.cond, body: only.then }, ...only.elifs];
      return {
        kind: 'If',
        id: this.id(),
        cond,
        then,
        elifs,
        ...(only.else ? { else: only.else } : {}),
      };
    }
    return { kind: 'If', id: this.id(), cond, then, elifs: [], else: otherwise };
  }

  private sub(b: Sb3Block, name: string): Block {
    const v = b.inputs?.[name]?.[1];
    return this.stack(typeof v === 'string' ? v : undefined);
  }

  private unsupported(opcode: string): Stmt[] {
    const u = this.ctx.report.unsupported;
    u[opcode] = (u[opcode] ?? 0) + 1;
    this.notes.push(opcode);
    return [];
  }

  // ---- reporters ----

  private reporter(b: Sb3Block, slot: Slot): Expr {
    const n = (name: string) => this.input(b, name, 'num');
    const s = (name: string) => this.input(b, name, 'text');
    const c = (name: string) => this.input(b, name, 'bool');
    const call = (name: string, ...args: Expr[]) => this.call(name, args);
    const bin = BINARY[b.opcode];
    if (bin) {
      const [op, operand] = bin;
      const side = (name: string) => this.input(b, name, operand);
      const [l, r] =
        b.opcode === 'operator_join'
          ? ['STRING1', 'STRING2']
          : operand === 'num'
            ? ['NUM1', 'NUM2']
            : ['OPERAND1', 'OPERAND2'];
      return this.binary(op, side(l), side(r));
    }
    switch (b.opcode) {
      case 'motion_xposition':
        return this.prop('x');
      case 'motion_yposition':
        return this.prop('y');
      case 'motion_direction':
        return this.prop('direction');
      case 'looks_size':
        return this.prop('size');
      case 'looks_costumenumbername':
        return this.field(b, 'NUMBER_NAME') === 'name'
          ? call('costume_name')
          : this.prop('costume_number');
      case 'looks_backdropnumbername':
        return call(this.field(b, 'NUMBER_NAME') === 'name' ? 'backdrop_name' : 'backdrop_number');
      case 'sound_volume':
        return call('volume');
      case 'sensing_touchingobject': {
        const m = this.menu(b, 'TOUCHINGOBJECTMENU');
        if (m === '_mouse_') return call('touching_mouse');
        if (m === '_edge_') return call('touching_edge');
        return call('touching', s('TOUCHINGOBJECTMENU'));
      }
      case 'sensing_touchingcolor':
        return call('touching_color', s('COLOR'));
      case 'sensing_coloristouchingcolor':
        return call('color_touching', s('COLOR'), s('COLOR2'));
      case 'sensing_distanceto':
        if (this.menu(b, 'DISTANCETOMENU') === '_mouse_')
          return call('distance_to', call('mouse_x'), call('mouse_y'));
        return call('distance_to_sprite', s('DISTANCETOMENU'));
      case 'sensing_answer':
        return call('answer');
      case 'sensing_keypressed': {
        const m = this.menu(b, 'KEY_OPTION');
        return call('key_down', m !== undefined ? this.str(keyName(m)) : s('KEY_OPTION'));
      }
      case 'sensing_mousedown':
        return call('mouse_down');
      case 'sensing_mousex':
        return call('mouse_x');
      case 'sensing_mousey':
        return call('mouse_y');
      case 'sensing_loudness':
        return call('loudness');
      case 'sensing_loud':
        return this.binary('>', call('loudness'), this.num(10));
      case 'sensing_timer':
        return call('timer');
      case 'sensing_of':
        return this.sensingOf(b, slot);
      case 'sensing_current':
        return call(
          'current',
          this.str(UNITS[this.field(b, 'CURRENTMENU').toUpperCase()] ?? 'year'),
        );
      case 'sensing_dayssince2000':
        return call('days_since_2000');
      case 'sensing_username':
        return call('username');
      case 'operator_random':
        return call('random', n('FROM'), n('TO'));
      case 'operator_not':
        return { kind: 'Unary', id: this.id(), op: 'not', operand: c('OPERAND') };
      case 'operator_letter_of':
        return call('letter_of', n('LETTER'), s('STRING'));
      case 'operator_length':
        return call('len', s('STRING'));
      case 'operator_contains':
        return call('contains', s('STRING1'), s('STRING2'));
      case 'operator_round':
        return call('round', n('NUM'));
      case 'operator_mathop': {
        const fn = MATHOPS[this.field(b, 'OPERATOR')];
        return fn ? call(fn, n('NUM')) : this.unsupportedReporter(b.opcode, slot);
      }
      case 'data_variable':
        return this.varRef(b, false);
      case 'data_listcontents':
        return call('join', this.varRef(b, true), this.str(' '));
      case 'data_itemoflist': {
        const list = this.varRef(b, true);
        return { kind: 'Index', id: this.id(), target: list, index: this.listIndex(b, list, 0) };
      }
      case 'data_itemnumoflist':
        return call('index_of', this.varRef(b, true), s('ITEM'));
      case 'data_lengthoflist':
        return call('len', this.varRef(b, true));
      case 'data_listcontainsitem':
        return call('contains', this.varRef(b, true), s('ITEM'));
      case 'argument_reporter_string_number':
      case 'argument_reporter_boolean': {
        const param = this.proc?.args.get(this.field(b, 'VALUE'));
        if (param) return { kind: 'Var', id: this.id(), name: param };
        // Outside its definition, Scratch reads an input as 0 (or false).
        return b.opcode === 'argument_reporter_boolean' ? this.bool(false) : this.num(0);
      }
    }
    return this.unsupportedReporter(b.opcode, slot);
  }

  private unsupportedReporter(opcode: string, slot: Slot): Expr {
    const u = this.ctx.report.unsupported;
    u[opcode] = (u[opcode] ?? 0) + 1;
    this.notes.push(
      `${opcode} (reads as ${slot === 'num' ? '0' : slot === 'bool' ? 'false' : '""'})`,
    );
    return this.empty(slot);
  }

  /** `x position of Sprite`, `backdrop # of Stage`, `score of Sprite` and the rest. */
  private sensingOf(b: Sb3Block, slot: Slot): Expr {
    const prop = this.field(b, 'PROPERTY');
    const obj = this.menu(b, 'OBJECT');
    if (obj === undefined) return this.unsupportedReporter('sensing_of', slot);
    const call = (name: string, ...args: Expr[]) => this.call(name, args);
    if (obj === '_stage_') {
      if (prop === 'backdrop #') return call('backdrop_number');
      if (prop === 'backdrop name') return call('backdrop_name');
      const v = this.lookup(this.ctx.stage, prop, false);
      return v
        ? { kind: 'Var', id: this.id(), name: v.name }
        : this.unsupportedReporter('sensing_of', slot);
    }
    const sprite = this.str(obj);
    switch (prop) {
      case 'x position':
        return call('x_of', sprite);
      case 'y position':
        return call('y_of', sprite);
      case 'direction':
        return call('direction_of', sprite);
      case 'costume #':
        return call('costume_of', sprite);
      case 'size':
        return call('size_of', sprite);
    }
    const names = this.ctx.sprites.get(obj);
    const v = names && this.lookup(names, prop, false);
    if (v && !v.global) return call('var_of', sprite, this.str(v.name));
    return this.unsupportedReporter('sensing_of', slot);
  }

  // ---- inputs ----

  private input(b: Sb3Block, name: string, slot: Slot): Expr {
    const inp: Sb3Input | undefined = b.inputs?.[name];
    if (!inp) return this.empty(slot);
    return this.value(inp[1], slot);
  }

  private value(v: unknown, slot: Slot): Expr {
    if (Array.isArray(v)) return this.primitive(v, slot);
    if (typeof v !== 'string') return this.empty(slot);
    const b = this.blocks[v];
    if (!b) return this.empty(slot);
    if (Array.isArray(b)) return this.primitive(b, slot);
    if (b.shadow) {
      // A literal (math_number, text, colour_picker) or a menu: either way, its one field. Menu
      // items stay text, so a costume named "2" isn't read as costume number 2.
      const f = Object.values(b.fields ?? {})[0];
      if (!f) return this.empty(slot);
      if (b.opcode.startsWith('math_')) return this.literalExpr(f[0], 'num');
      if (b.opcode === 'text') return this.literalExpr(f[0], 'text');
      return this.str(String(f[0] ?? ''));
    }
    return this.reporter(b, slot);
  }

  private primitive(p: unknown[], slot: Slot): Expr {
    const [type, value] = p;
    switch (type) {
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
        return this.literalExpr(value, 'num');
      case 9:
      case 11:
        return this.str(String(value ?? ''));
      case 10:
        return this.literalExpr(value, 'text');
      case 12:
      case 13: {
        const v = this.resolve(
          String(value ?? ''),
          typeof p[2] === 'string' ? p[2] : undefined,
          type === 13,
        );
        return { kind: 'Var', id: this.id(), name: v.name };
      }
    }
    return this.empty(slot);
  }

  /**
   * Literal text as Scratch saved it. In a number slot any decimal is a number; elsewhere only
   * text that prints back the same (`"10"`, not `"007"`), so text stays text.
   */
  literalExpr(v: unknown, slot: Slot): Expr {
    if (typeof v === 'number') return Number.isFinite(v) ? this.num(v) : this.str(String(v));
    if (typeof v === 'boolean') return this.bool(v);
    const text = String(v ?? '');
    if (slot === 'num' && text.trim() === '') return this.num(0);
    if (DECIMAL.test(text)) {
      const value = Number(text);
      if (slot === 'num') return this.num(value, text.replace(/^-/, ''));
      if (String(value) === text) return this.num(value);
    }
    return this.str(text);
  }

  /** The literal text in an input (a shadow or a primitive), or undefined if a block covers it. */
  private literal(b: Sb3Block, name: string): string | undefined {
    const inp = b.inputs?.[name];
    if (!inp || inp[0] === 3) return undefined;
    const v = inp[1];
    if (Array.isArray(v)) return String(v[1] ?? '');
    const blk = typeof v === 'string' ? this.blocks[v] : undefined;
    if (Array.isArray(blk)) return String(blk[1] ?? '');
    if (!blk?.shadow) return undefined;
    const f = Object.values(blk.fields ?? {})[0];
    return f ? String(f[0] ?? '') : undefined;
  }

  /** A menu's chosen item, or undefined when a reporter is dropped into it. */
  private menu(b: Sb3Block, name: string): string | undefined {
    return this.literal(b, name);
  }

  private field(b: Sb3Block, name: string): string {
    return String(b.fields?.[name]?.[0] ?? '');
  }

  /** A sprite menu (go to, glide to, point towards) in Stitch's words. */
  private target(b: Sb3Block, name: string): Expr {
    const m = this.menu(b, name);
    if (m === '_mouse_') return this.str('mouse');
    if (m === '_random_') return this.str('random');
    return this.input(b, name, 'text');
  }

  /** A sound menu, with the sound's name in the cart (it may have been renamed). */
  private sound(b: Sb3Block): Expr {
    const m = this.menu(b, 'SOUND_MENU');
    if (m !== undefined) return this.str(this.names.sounds.get(m) ?? m);
    return this.input(b, 'SOUND_MENU', 'text');
  }

  /** A list index, with Scratch's `last` and `random` (`any`). `extra` is 1 for insert. */
  private listIndex(b: Sb3Block, list: Expr, extra: number): Expr {
    const lit = this.literal(b, 'INDEX');
    const length = () => {
      const len = this.call('len', [list]);
      return extra ? this.binary('+', len, this.num(extra)) : len;
    };
    if (lit === 'last') return length();
    if (lit === 'random' || lit === 'any') return this.call('random', [this.num(1), length()]);
    return this.input(b, 'INDEX', 'num');
  }

  // ---- variables ----

  private varInfo(b: Sb3Block, list: boolean): VarInfo {
    const f = b.fields?.[list ? 'LIST' : 'VARIABLE'];
    return this.resolve(String(f?.[0] ?? ''), typeof f?.[1] === 'string' ? f[1] : undefined, list);
  }

  private varRef(b: Sb3Block, list: boolean): LValue {
    return { kind: 'Var', id: this.id(), name: this.varInfo(b, list).name };
  }

  private lookup(names: TargetNames, label: string, list: boolean): VarInfo | undefined {
    return names.byName.get(`${list ? 'l' : 'v'}:${label}`);
  }

  /** By id, then by name, here and then on the stage. A name found nowhere is declared here. */
  private resolve(label: string, id: string | undefined, list: boolean): VarInfo {
    const found =
      (id && (this.names.vars.get(id) ?? this.ctx.stage.vars.get(id))) ||
      this.lookup(this.names, label, list) ||
      this.lookup(this.ctx.stage, label, list);
    if (found) return found;
    const v: VarInfo = {
      name: this.names.ns.claim(label, list ? 'list' : 'var'),
      label,
      list,
      global: this.t.isStage,
    };
    this.names.byName.set(`${list ? 'l' : 'v'}:${label}`, v);
    if (id) this.names.vars.set(id, v);
    this.names.extra.push(v);
    this.ctx.report.notes.push(
      `${this.t.name}: "${label}" was used but not declared, so it starts empty`,
    );
    return v;
  }

  // ---- IR helpers ----

  id(): string {
    return this.ctx.ids.next();
  }

  num(value: number, raw?: string): Expr {
    if (value < 0 || Object.is(value, -0)) {
      const operand = this.num(-value, raw);
      return value === 0 ? operand : { kind: 'Unary', id: this.id(), op: '-', operand };
    }
    // The grammar has no exponent form, so huge or tiny numbers stay text, which reads the same.
    if (String(value).includes('e')) return this.str(String(value));
    return { kind: 'Num', id: this.id(), value, ...(raw && raw !== String(value) ? { raw } : {}) };
  }

  str(value: string): Expr {
    return { kind: 'Str', id: this.id(), value };
  }

  bool(value: boolean): Expr {
    return { kind: 'Bool', id: this.id(), value };
  }

  private empty(slot: Slot): Expr {
    return slot === 'num' ? this.num(0) : slot === 'bool' ? this.bool(false) : this.str('');
  }

  private neg(e: Expr): Expr {
    if (e.kind === 'Num') return this.num(-e.value);
    return { kind: 'Unary', id: this.id(), op: '-', operand: e };
  }

  private binary(op: BinaryOp, left: Expr, right: Expr): Expr {
    return { kind: 'Binary', id: this.id(), op, left, right };
  }

  call(name: string, args: Expr[]): Expr & { kind: 'Call' } {
    return { kind: 'Call', id: this.id(), name, args };
  }

  callStmt(name: string, args: Expr[]): Stmt {
    return { kind: 'CallStmt', id: this.id(), call: this.call(name, args) };
  }

  private prop(prop: SpriteProp): LValue & { kind: 'Prop' } {
    return { kind: 'Prop', id: this.id(), prop };
  }

  private assign(target: LValue, op: '=' | '+=', value: Expr): Stmt {
    return { kind: 'Assign', id: this.id(), target, op, value };
  }
}

/** Adds comment lines above a node, after any it already has. */
export function addComments(node: { trivia?: Trivia }, lines: string[]): void {
  node.trivia = { ...node.trivia, comments: [...(node.trivia?.comments ?? []), ...lines] };
}
