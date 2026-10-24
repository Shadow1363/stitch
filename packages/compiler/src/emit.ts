import {
  CORE_CATALOG,
  stripIds,
  type Catalog,
  type Block,
  type Diagnostic,
  type Expr,
  type FunctionDef,
  type Module,
  type NodeId,
  type Project,
  type Stmt,
  type ValueType,
} from '@stitch/ir';

/**
 * IR -> JavaScript. Output targets the RuntimeApi in @stitch/runtime (core/world.ts):
 *   rt.defineModule(id, (S, V, G, P) => { ...vars; function* f_name() {}; rt.on(S, event, arg, function* () {}) })
 * V: this sprite's (or clone's) variables, P: variables its clones share, G: globals.
 *   rt.instantiate({ spriteId: moduleId })
 * Every loop iteration ends in `yield` (one iteration per tick). User functions are generators.
 */

type T = 'number' | 'string' | 'boolean' | 'any';

interface Code {
  js: string;
  t: T;
}

export interface Emitted {
  code: string;
  /** lineMap[i] = IR node that produced line i (0-based) of `code`. */
  lineMap: (NodeId | undefined)[];
  diagnostics: Diagnostic[];
}

const ARITH: Record<string, string> = { '+': '+', '-': '-', '*': '*', '/': '/' };
const CMP: Record<string, string> = { '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
const MATH_INLINE: Record<string, string> = {
  abs: 'Math.abs',
  floor: 'Math.floor',
  ceil: 'Math.ceil',
  round: 'Math.round',
  sqrt: 'Math.sqrt',
  min: 'Math.min',
  max: 'Math.max',
};

const toT = (v: ValueType | undefined): T =>
  v === 'number' || v === 'string' || v === 'boolean' ? v : 'any';

class Writer {
  lines: string[] = [];
  map: (NodeId | undefined)[] = [];
  private depth = 0;
  line(text: string, id?: NodeId) {
    this.lines.push('  '.repeat(this.depth) + text);
    this.map.push(id);
  }
  indent() {
    this.depth++;
  }
  dedent() {
    this.depth--;
  }
}

export function emitProject(
  project: Project,
  spriteOrder: string[] = project.sprites.map((s) => s.id),
  catalog: Catalog = CORE_CATALOG,
): Emitted {
  const w = new Writer();
  const diagnostics: Diagnostic[] = [];
  const globals = new Set<string>();
  const files = [
    { id: '$stage', name: 'stage', module: project.stage },
    ...project.sprites.map((s) => ({ id: s.id, name: s.name, module: s.module })),
  ];
  for (const f of files)
    for (const it of f.module.items)
      if (it.kind === 'VarDecl' && it.scope === 'global') globals.add(it.name);

  w.line('"use strict";');
  w.line('const $ = rt.ops, B = rt.b;');
  // Identical modules (e.g. many copies of one sprite) share one factory.
  const moduleIds = new Map<string, string>();
  const instances: Record<string, string> = {};
  for (const f of files) {
    const key = JSON.stringify(stripIds(f.module));
    let mid = moduleIds.get(key);
    if (!mid) {
      mid = `m${moduleIds.size}`;
      moduleIds.set(key, mid);
      new ModuleEmitter(w, f.module, globals, catalog, (d) =>
        diagnostics.push({ ...d, file: f.name }),
      ).emit(mid);
    }
    instances[f.id] = mid;
  }
  const ordered: Record<string, string> = { $stage: instances.$stage! };
  for (const id of spriteOrder) if (instances[id]) ordered[id] = instances[id];
  w.line(`rt.instantiate(${JSON.stringify(ordered)});`);
  return { code: w.lines.join('\n'), lineMap: w.map, diagnostics };
}

/** True when `b` has a `break`/`continue` for the loop that owns it (not one in a nested loop). */
function hasJump(b: Block): boolean {
  return b.stmts.some((s) => {
    if (s.kind === 'Break' || s.kind === 'Continue') return true;
    if (s.kind === 'If')
      return [s.then, ...s.elifs.map((e) => e.body), ...(s.else ? [s.else] : [])].some(hasJump);
    return false;
  });
}

class ModuleEmitter {
  private spriteVars = new Set<string>();
  private sharedVars = new Set<string>();
  /** Labels of the enclosing loops: `brk` ends the loop, `cont` ends the current iteration. */
  private loops: { brk: string; cont: string }[] = [];
  private functions = new Set<string>();
  private scopes: Map<string, string>[] = [];
  /** Inside a user function, where `$w` (warp flag) is in scope. */
  private inFunction = false;
  private tmp = 0;

  constructor(
    private w: Writer,
    private m: Module,
    private globals: ReadonlySet<string>,
    private catalog: Catalog,
    private report: (d: Diagnostic) => void,
  ) {
    for (const it of m.items) {
      if (it.kind === 'VarDecl' && it.scope === 'sprite') this.spriteVars.add(it.name);
      if (it.kind === 'VarDecl' && it.scope === 'shared') this.sharedVars.add(it.name);
      if (it.kind === 'FunctionDef') this.functions.add(it.name);
    }
  }

  emit(mid: string) {
    const w = this.w;
    w.line(`rt.defineModule(${JSON.stringify(mid)}, function (S, V, G, P) {`);
    w.indent();
    for (const it of this.m.items) {
      if (it.kind !== 'VarDecl') continue;
      if (!this.pureInit(it.init)) {
        this.report({
          severity: 'error',
          message: `variable '${it.name}' must start with a value that doesn't wait or call your functions`,
          nodeId: it.id,
        });
        continue;
      }
      const v = this.expr(it.init).js;
      if (it.scope === 'sprite') w.line(`V.${it.name} = ${v};`, it.id);
      else {
        // Globals and shared vars start once, however many sprites or clones declare them.
        const rec = it.scope === 'global' ? 'G' : 'P';
        w.line(`if (!(${JSON.stringify(it.name)} in ${rec})) ${rec}.${it.name} = ${v};`, it.id);
      }
    }
    for (const it of this.m.items) if (it.kind === 'FunctionDef') this.fn(it);
    for (const it of this.m.items) {
      if (it.kind !== 'EventScript') continue;
      const ev = it.event;
      const arg =
        ev.type === 'key'
          ? JSON.stringify(ev.key.toLowerCase())
          : ev.type === 'message'
            ? JSON.stringify(ev.name)
            : 'null';
      w.line(`rt.on(S, ${JSON.stringify(ev.type)}, ${arg}, function* () {`, it.id);
      this.block(it.body);
      w.line('});');
    }
    w.dedent();
    w.line('});');
  }

  private fn(f: FunctionDef) {
    this.scopes = [new Map(f.params.map((p) => [p, `l_${p}`]))];
    // `$w` is the warp flag: true inside a warp function and everything it calls.
    const params = ['$w', ...f.params.map((p) => `l_${p}`)].join(', ');
    this.w.line(`function* f_${f.name}(${params}) {`, f.id);
    if (f.warp) {
      this.w.indent();
      this.w.line('$w = true;');
      this.w.dedent();
    }
    this.inFunction = true;
    this.block(f.body);
    this.inFunction = false;
    this.w.line('}');
    this.scopes = [];
  }

  /** Initialisers run once at load, outside any thread: no waiting, no user functions. */
  private pureInit(e: Expr): boolean {
    if (e.kind === 'Call') {
      const b = this.catalog.get(e.name);
      if (!b || b.yields) return false;
    }
    const kids: Expr[] =
      e.kind === 'List'
        ? e.items
        : e.kind === 'Call'
          ? e.args
          : e.kind === 'Index'
            ? [e.target, e.index]
            : e.kind === 'Unary'
              ? [e.operand]
              : e.kind === 'Binary'
                ? [e.left, e.right]
                : [];
    return kids.every((k) => this.pureInit(k));
  }

  // ---- statements ----

  private block(b: Block, loopVar?: { name: string; js: string }) {
    this.w.indent();
    const scope = new Map<string, string>();
    if (loopVar) scope.set(loopVar.name, loopVar.js);
    this.scopes.push(scope);
    for (const s of b.stmts) this.stmt(s, scope);
    this.scopes.pop();
    this.w.dedent();
  }

  /**
   * A loop: `header {`, then the body and the per-iteration yield. When the body uses `break` or
   * `continue`, the loop gets a label and the body a labelled block, so `continue` jumps to the
   * end of the body and the yield still runs (rule 9).
   */
  private loop(
    header: string,
    id: NodeId,
    b: Block,
    loopVar?: { name: string; js: string; init: string },
  ) {
    const w = this.w;
    const jumps = hasJump(b);
    const brk = jumps ? this.temp('L') : '';
    const cont = jumps ? this.temp('C') : '';
    w.line(`${jumps ? `${brk}: ` : ''}${header} {`, id);
    w.indent();
    if (loopVar) w.line(`let ${loopVar.js} = ${loopVar.init};`);
    if (jumps) w.line(`${cont}: {`);
    w.dedent();
    if (jumps) w.indent();
    this.loops.push({ brk, cont });
    this.block(b, loopVar);
    this.loops.pop();
    if (jumps) {
      w.line('}');
      w.dedent();
    }
    w.indent();
    // Warp code skips the per-iteration yield, but still yields once a tick runs past its budget.
    w.line(this.inFunction ? 'if (!$w || rt.overBudget()) yield;' : 'yield;');
    w.dedent();
    w.line('}');
  }

  private stmt(s: Stmt, scope: Map<string, string>) {
    const w = this.w;
    switch (s.kind) {
      case 'Raw':
        w.line(`throw new SyntaxError(${JSON.stringify(s.error)});`, s.id);
        return;
      case 'LocalDecl': {
        const js = `l_${s.name}`;
        const v = this.expr(s.init).js;
        if (scope.has(s.name)) w.line(`${js} = ${v};`, s.id);
        else w.line(`let ${js} = ${v};`, s.id);
        scope.set(s.name, js);
        return;
      }
      case 'Assign':
        return this.assign(s);
      case 'CallStmt': {
        const c = this.expr(s.call).js;
        w.line(`${c.startsWith('(yield*') ? c.slice(1, -1) : c};`, s.id);
        return;
      }
      case 'If': {
        w.line(`if (${this.bool(s.cond)}) {`, s.id);
        this.block(s.then);
        for (const e of s.elifs) {
          w.line(`} else if (${this.bool(e.cond)}) {`, e.id);
          this.block(e.body);
        }
        if (s.else) {
          w.line('} else {');
          this.block(s.else);
        }
        w.line('}');
        return;
      }
      case 'Forever':
        return this.loop('while (true)', s.id, s.body);
      case 'Repeat': {
        const i = this.temp('i');
        const n = this.temp('n');
        return this.loop(
          `for (let ${i} = 0, ${n} = Math.round(${this.num(s.count)}); ${i} < ${n}; ${i}++)`,
          s.id,
          s.body,
        );
      }
      case 'RepeatUntil':
        return this.loop(`while (!${this.bool(s.cond)})`, s.id, s.body);
      case 'While':
        return this.loop(`while (${this.bool(s.cond)})`, s.id, s.body);
      case 'ForRange': {
        const c = this.temp('c');
        const e = this.temp('e');
        const st = this.temp('s');
        const step = s.step ? this.num(s.step) : '1';
        return this.loop(
          `for (let ${c} = ${this.num(s.from)}, ${e} = ${this.num(s.to)}, ${st} = ${step}; ${st} >= 0 ? ${c} <= ${e} : ${c} >= ${e}; ${c} += ${st})`,
          s.id,
          s.body,
          { name: s.var, js: `l_${s.var}`, init: c },
        );
      }
      case 'ForEach': {
        const v = this.temp('v');
        return this.loop(`for (const ${v} of $.iter(${this.expr(s.list).js}))`, s.id, s.body, {
          name: s.var,
          js: `l_${s.var}`,
          init: v,
        });
      }
      case 'Break':
      case 'Continue': {
        const l = this.loops[this.loops.length - 1];
        // Validation reports a jump outside a loop; emit nothing so the line map stays useful.
        if (l) w.line(`break ${s.kind === 'Break' ? l.brk : l.cont};`, s.id);
        return;
      }
      case 'WaitUntil':
        w.line(`while (!${this.bool(s.cond)}) yield;`, s.id);
        return;
      case 'Return':
        w.line(s.value ? `return ${this.expr(s.value).js};` : 'return "";', s.id);
        return;
    }
  }

  private assign(s: Extract<Stmt, { kind: 'Assign' }>) {
    const w = this.w;
    const t = s.target;
    const op = s.op === '=' ? undefined : s.op[0]!;
    if (t.kind === 'Prop') {
      const v = this.num(s.value);
      w.line(op ? `S.${t.prop} ${op}= ${v};` : `S.${t.prop} = ${v};`, s.id);
      return;
    }
    if (t.kind === 'Var') {
      const ref = this.varRef(t.name);
      if (!op) w.line(`${ref} = ${this.expr(s.value).js};`, s.id);
      else w.line(`${ref} = $.n(${ref}) ${op} ${this.num(s.value)};`, s.id);
      return;
    }
    const target = this.expr(t.target).js;
    const index = this.expr(t.index).js;
    if (!op) {
      w.line(`$.setIndex(${target}, ${index}, ${this.expr(s.value).js});`, s.id);
      return;
    }
    const a = this.temp('t');
    const b = this.temp('k');
    w.line(
      `{ const ${a} = ${target}, ${b} = ${index}; $.setIndex(${a}, ${b}, $.n($.index(${a}, ${b})) ${op} ${this.num(s.value)}); }`,
      s.id,
    );
  }

  private temp(prefix: string): string {
    return `$${prefix}${++this.tmp}`;
  }

  private varRef(name: string): string {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const js = this.scopes[i]!.get(name);
      if (js) return js;
    }
    if (this.spriteVars.has(name)) return `V.${name}`;
    if (this.sharedVars.has(name)) return `P.${name}`;
    if (this.globals.has(name)) return `G.${name}`;
    // Validation reports unknown names; keep emitting so the line map stays useful.
    return `V.${name}`;
  }

  // ---- expressions ----

  private num(e: Expr): string {
    const c = this.expr(e);
    return c.t === 'number' ? c.js : `$.n(${c.js})`;
  }

  private bool(e: Expr): string {
    const c = this.expr(e);
    return c.t === 'boolean' ? c.js : `$.b(${c.js})`;
  }

  private str(e: Expr): string {
    const c = this.expr(e);
    return c.t === 'string' ? c.js : `$.s(${c.js})`;
  }

  private expr(e: Expr): Code {
    switch (e.kind) {
      case 'Num':
        return {
          js:
            e.value < 0 || Object.is(e.value, -0)
              ? `(${String(e.value === 0 ? '-0' : e.value)})`
              : String(e.value),
          t: 'number',
        };
      case 'Str':
        return { js: JSON.stringify(e.value), t: 'string' };
      case 'Bool':
        return { js: String(e.value), t: 'boolean' };
      case 'List':
        return { js: `[${e.items.map((i) => this.expr(i).js).join(', ')}]`, t: 'any' };
      case 'Var':
        return { js: this.varRef(e.name), t: 'any' };
      case 'Prop':
        return { js: `S.${e.prop}`, t: 'number' };
      case 'Index':
        return { js: `$.index(${this.expr(e.target).js}, ${this.expr(e.index).js})`, t: 'any' };
      case 'Unary':
        return e.op === '-'
          ? { js: `(-${this.num(e.operand)})`, t: 'number' }
          : { js: `!${this.bool(e.operand)}`, t: 'boolean' };
      case 'Binary':
        return this.binary(e);
      case 'Call':
        return this.call(e);
    }
  }

  private binary(e: Extract<Expr, { kind: 'Binary' }>): Code {
    const op = e.op;
    if (ARITH[op])
      return { js: `(${this.num(e.left)} ${ARITH[op]} ${this.num(e.right)})`, t: 'number' };
    if (op === '%')
      return { js: `$.mod(${this.expr(e.left).js}, ${this.expr(e.right).js})`, t: 'number' };
    if (op === '^')
      return { js: `Math.pow(${this.num(e.left)}, ${this.num(e.right)})`, t: 'number' };
    if (op === '..') return { js: `(${this.str(e.left)} + ${this.str(e.right)})`, t: 'string' };
    if (op === 'and' || op === 'or')
      return {
        js: `(${this.bool(e.left)} ${op === 'and' ? '&&' : '||'} ${this.bool(e.right)})`,
        t: 'boolean',
      };
    const l = this.expr(e.left);
    const r = this.expr(e.right);
    const nums = l.t === 'number' && r.t === 'number';
    if (op === '==' || op === '~=') {
      const js = nums
        ? `(${l.js} ${op === '==' ? '===' : '!=='} ${r.js})`
        : `${op === '==' ? '' : '!'}$.eq(${l.js}, ${r.js})`;
      return { js, t: 'boolean' };
    }
    return {
      js: nums ? `(${l.js} ${CMP[op]} ${r.js})` : `($.cmp(${l.js}, ${r.js}) ${CMP[op]} 0)`,
      t: 'boolean',
    };
  }

  private call(e: Extract<Expr, { kind: 'Call' }>): Code {
    if (this.functions.has(e.name))
      return {
        js: `(yield* f_${e.name}(${[this.inFunction ? '$w' : 'false', ...e.args.map((a) => this.expr(a).js)].join(', ')}))`,
        t: 'any',
      };
    const b = this.catalog.get(e.name);
    if (!b) return { js: `B.${e.name}()`, t: 'any' };
    const inline = MATH_INLINE[e.name];
    if (inline)
      return { js: `${inline}(${e.args.map((a) => this.num(a)).join(', ')})`, t: 'number' };
    const args = e.args.map((a) => this.expr(a).js);
    if (b.sprite) args.unshift('S');
    const js = `B.${e.name}(${args.join(', ')})`;
    return { js: b.yields ? `(yield* ${js})` : js, t: toT(b.returns) };
  }
}
