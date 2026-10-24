import type { ValueType } from './builtins';
import { CORE_CATALOG, type Catalog } from './catalog';
import { didYouMean, REF_WORDS, type CartNames } from './names';
import type { Block, Expr, Module, NodeId, Project, Stmt } from './nodes';
import { isSpriteProp, SPRITE_PROPS } from './props';
import { looksLikeSecret } from './secrets';
import { childBlocks, childExprs } from './walk';

export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  nodeId?: NodeId;
  /** Sprite name, or "stage". */
  file?: string;
  /** Quick fixes, best first. The editor turns each into a text edit at the node's span. */
  fixes?: Fix[];
}

/** A quick fix, as data: the IR has no source positions, so the editor applies it. */
export type Fix =
  /** Replace the node's name: a variable, a called function, or a string literal's text. */
  | { kind: 'rename'; to: string }
  /** Add a declaration as the first line of the file. */
  | { kind: 'declare'; line: string }
  /** Keep the call's first `keep` arguments and append `add` (source text). */
  | { kind: 'args'; keep: number; add: string[] };

/** What a file's string arguments may name, for the cart-name checks. */
export interface FileContext {
  names: CartNames;
  /** The file's sprite (for its costumes); undefined for the stage. */
  sprite?: string;
  /** Messages some script in the project receives. */
  received: ReadonlySet<string>;
}

/** Placeholder text for a missing argument of a type. */
const PLACEHOLDER: Record<ValueType, string> = {
  number: '0',
  string: '""',
  boolean: 'true',
  list: '[]',
  any: '0',
};

const isNumeric = (v: string) => v.trim() !== '' && !Number.isNaN(Number(v));

/** Every message name an `on message` script in the project receives. */
export function receivedMessages(project: Project): Set<string> {
  const out = new Set<string>();
  for (const m of [project.stage, ...project.sprites.map((s) => s.module)])
    for (const it of m.items)
      if (it.kind === 'EventScript' && it.event.type === 'message') out.add(it.event.name);
  return out;
}

/** Semantic checks over a whole project. Syntax errors arrive as Raw nodes. */
export function validateProject(
  project: Project,
  catalog: Catalog = CORE_CATALOG,
  names?: CartNames,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const globals = new Set<string>();
  const declare = (m: Module) => {
    for (const it of m.items)
      if (it.kind === 'VarDecl' && it.scope === 'global') globals.add(it.name);
  };
  declare(project.stage);
  for (const s of project.sprites) declare(s.module);
  const files = [
    { name: 'stage', module: project.stage, sprite: undefined },
    ...project.sprites.map((s) => ({ name: s.name, module: s.module, sprite: s.name })),
  ];
  const received = receivedMessages(project);
  for (const f of files) {
    const context = names
      ? { names, received, ...(f.sprite ? { sprite: f.sprite } : {}) }
      : undefined;
    for (const d of validateModule(f.module, globals, catalog, context))
      out.push({ ...d, file: f.name });
  }
  return out;
}

export function validateModule(
  module: Module,
  globals: ReadonlySet<string> = new Set(),
  catalog: Catalog = CORE_CATALOG,
  context?: FileContext,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const withFixes = (fixes: Fix[] | undefined) => (fixes?.length ? { fixes } : {});
  const err = (message: string, nodeId?: NodeId, fixes?: Fix[]) =>
    out.push({ severity: 'error', message, ...(nodeId ? { nodeId } : {}), ...withFixes(fixes) });
  const warn = (message: string, nodeId: NodeId, fixes?: Fix[]) =>
    out.push({ severity: 'warning', message, nodeId, ...withFixes(fixes) });
  const renames = (name: string, candidates: Iterable<string>): Fix[] =>
    didYouMean(name, candidates).map((to) => ({ kind: 'rename', to }));

  const checkName = (name: string, nodeId: NodeId) => {
    if (isSpriteProp(name))
      err(`'${name}' is a sprite property and can't be used as a variable name`, nodeId);
  };

  const spriteVars = new Set<string>();
  const functions = new Map<string, number>();
  for (const it of module.items) {
    if (it.kind === 'VarDecl') {
      checkName(it.name, it.id);
      if (it.scope !== 'global') {
        if (spriteVars.has(it.name)) err(`'${it.name}' is declared twice`, it.id);
        spriteVars.add(it.name);
      }
    } else if (it.kind === 'FunctionDef') {
      if (functions.has(it.name)) err(`function '${it.name}' is declared twice`, it.id);
      if (catalog.get(it.name)) err(`'${it.name}' is a builtin and can't be redefined`, it.id);
      for (const p of it.params) checkName(p, it.id);
      functions.set(it.name, it.params.length);
    }
  }

  const visible = (scopes: Set<string>[], name: string) =>
    scopes.some((s) => s.has(name)) || spriteVars.has(name) || globals.has(name);
  const visibleNames = (scopes: Set<string>[]) => [
    ...scopes.flatMap((s) => [...s]),
    ...spriteVars,
    ...globals,
    ...Object.keys(SPRITE_PROPS),
  ];

  /** String literals naming sprites, costumes, sounds, songs, messages, effects or styles. */
  const checkRefs = (e: Expr & { kind: 'Call' }) => {
    const b = catalog.get(e.name);
    b?.params.forEach((p, i) => {
      const arg = e.args[i];
      if (!p.ref || arg?.kind !== 'Str') return;
      const v = arg.value;
      const words = REF_WORDS[p.ref];
      const unknown = (what: string, known: readonly string[]) =>
        warn(`there's no ${what} called "${v}"`, arg.id, renames(v, [...known, ...words]));
      switch (p.ref) {
        case 'effect':
        case 'rotation':
          if (!words.includes(v))
            warn(
              `'${e.name}' takes one of ${words.map((w) => `"${w}"`).join(', ')}`,
              arg.id,
              renames(v, words),
            );
          return;
        case 'key':
          return;
      }
      if (!context) return;
      const { names } = context;
      switch (p.ref) {
        case 'sprite':
          if (!names.sprites.includes(v) && !words.includes(v) && !v.includes('#'))
            unknown('sprite', names.sprites);
          return;
        case 'costume': {
          const own = context.sprite !== undefined ? names.costumes[context.sprite] : undefined;
          if (own && !own.includes(v) && !isNumeric(v)) unknown('costume', own);
          return;
        }
        case 'sound':
          if (!names.sounds.includes(v) && !isNumeric(v)) unknown('sound', names.sounds);
          return;
        case 'song':
          if (!names.songs.includes(v) && !isNumeric(v)) unknown('song', names.songs);
          return;
        case 'message':
          if (!context.received.has(v))
            warn(`no script receives the message "${v}"`, arg.id, renames(v, context.received));
          return;
      }
    });
  };

  const checkExpr = (e: Expr, scopes: Set<string>[]) => {
    if (e.kind === 'Var' && !visible(scopes, e.name))
      err(`unknown variable '${e.name}'`, e.id, [
        ...renames(e.name, visibleNames(scopes)),
        { kind: 'declare', line: `var ${e.name} = 0` },
      ]);
    // Carts are shared as files; keys belong in the editor's Secrets, which the proxy adds.
    if (e.kind === 'Str' && looksLikeSecret(e.value))
      warn(
        `this looks like an API key or token; carts are shared, so add it under Secrets instead`,
        e.id,
      );
    if (e.kind === 'Call') {
      const b = catalog.get(e.name);
      const arity = b ? b.params.length : functions.get(e.name);
      if (arity === undefined)
        err(
          `unknown function '${e.name}'`,
          e.id,
          renames(e.name, [...catalog.all.map((x) => x.name), ...functions.keys()]),
        );
      else if (arity !== e.args.length) {
        const add =
          e.args.length < arity
            ? Array.from({ length: arity - e.args.length }, (_, k) => {
                const p = b?.params[e.args.length + k];
                return p ? PLACEHOLDER[p.type] : '0';
              })
            : [];
        err(
          `'${e.name}' takes ${arity} argument${arity === 1 ? '' : 's'}, got ${e.args.length}`,
          e.id,
          [{ kind: 'args', keep: Math.min(arity, e.args.length), add }],
        );
      }
      checkRefs(e);
    }
    for (const c of childExprs(e)) checkExpr(c, scopes);
  };

  const checkBlock = (b: Block, scopes: Set<string>[], inFunction: boolean, inLoop: boolean) => {
    const local = new Set<string>();
    const inner = [...scopes, local];
    for (const s of b.stmts) checkStmt(s, inner, inFunction, inLoop);
  };

  const checkStmt = (s: Stmt, scopes: Set<string>[], inFunction: boolean, inLoop: boolean) => {
    switch (s.kind) {
      case 'Break':
      case 'Continue':
        // Loops don't reach into functions they call, so a function body starts outside any loop.
        if (!inLoop) err(`'${s.kind.toLowerCase()}' outside a loop`, s.id);
        break;
      case 'Raw':
        err(`syntax error: ${s.error}`, s.id);
        return;
      case 'Return':
        if (!inFunction) err(`'return' outside a function`, s.id);
        break;
      case 'Assign':
        if (s.target.kind === 'Prop' && !SPRITE_PROPS[s.target.prop].writable)
          err(`'${s.target.prop}' is read-only`, s.id);
        break;
      case 'CallStmt': {
        const b = catalog.get(s.call.name);
        if (b?.kind === 'reporter')
          err(`'${s.call.name}' reports a value; use it in an expression`, s.id);
        break;
      }
    }
    for (const e of childExprs(s)) checkExpr(e, scopes);
    if (s.kind === 'LocalDecl') {
      checkName(s.name, s.id);
      scopes[scopes.length - 1]?.add(s.name);
    }
    const loopVar = s.kind === 'ForRange' || s.kind === 'ForEach' ? s.var : undefined;
    if (loopVar) checkName(loopVar, s.id);
    const loop = inLoop || isLoop(s);
    for (const b of childBlocks(s))
      checkBlock(b, loopVar ? [...scopes, new Set([loopVar])] : scopes, inFunction, loop);
  };

  for (const it of module.items) {
    switch (it.kind) {
      case 'Raw':
        err(`syntax error: ${it.error}`, it.id);
        break;
      case 'VarDecl':
        checkExpr(it.init, []);
        break;
      case 'FunctionDef':
        checkBlock(it.body, [new Set(it.params)], true, false);
        break;
      case 'EventScript':
        checkBlock(it.body, [], false, false);
        break;
    }
  }
  return out;
}

const LOOPS = new Set(['Forever', 'Repeat', 'RepeatUntil', 'While', 'ForRange', 'ForEach']);

/** Statements that `break` and `continue` apply to. */
export function isLoop(s: Stmt): boolean {
  return LOOPS.has(s.kind);
}
