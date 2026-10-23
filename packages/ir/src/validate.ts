import { getBuiltin } from './builtins';
import type { Block, Expr, Module, NodeId, Project, Stmt } from './nodes';
import { isSpriteProp, SPRITE_PROPS } from './props';
import { childBlocks, childExprs } from './walk';

export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  nodeId?: NodeId;
  /** Sprite name, or "stage". */
  file?: string;
}

/** Semantic checks over a whole project. Syntax errors arrive as Raw nodes. */
export function validateProject(project: Project): Diagnostic[] {
  const out: Diagnostic[] = [];
  const globals = new Set<string>();
  const declare = (m: Module) => {
    for (const it of m.items)
      if (it.kind === 'VarDecl' && it.scope === 'global') globals.add(it.name);
  };
  declare(project.stage);
  for (const s of project.sprites) declare(s.module);
  const files = [
    { name: 'stage', module: project.stage },
    ...project.sprites.map((s) => ({ name: s.name, module: s.module })),
  ];
  for (const f of files) {
    for (const d of validateModule(f.module, globals)) out.push({ ...d, file: f.name });
  }
  return out;
}

export function validateModule(
  module: Module,
  globals: ReadonlySet<string> = new Set(),
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const err = (message: string, nodeId?: NodeId) =>
    out.push(nodeId ? { severity: 'error', message, nodeId } : { severity: 'error', message });

  const checkName = (name: string, nodeId: NodeId) => {
    if (isSpriteProp(name))
      err(`'${name}' is a sprite property and can't be used as a variable name`, nodeId);
  };

  const spriteVars = new Set<string>();
  const functions = new Map<string, number>();
  for (const it of module.items) {
    if (it.kind === 'VarDecl') {
      checkName(it.name, it.id);
      if (it.scope === 'sprite') {
        if (spriteVars.has(it.name)) err(`'${it.name}' is declared twice`, it.id);
        spriteVars.add(it.name);
      }
    } else if (it.kind === 'FunctionDef') {
      if (functions.has(it.name)) err(`function '${it.name}' is declared twice`, it.id);
      if (getBuiltin(it.name)) err(`'${it.name}' is a builtin and can't be redefined`, it.id);
      for (const p of it.params) checkName(p, it.id);
      functions.set(it.name, it.params.length);
    }
  }

  const visible = (scopes: Set<string>[], name: string) =>
    scopes.some((s) => s.has(name)) || spriteVars.has(name) || globals.has(name);

  const checkExpr = (e: Expr, scopes: Set<string>[]) => {
    if (e.kind === 'Var' && !visible(scopes, e.name)) err(`unknown variable '${e.name}'`, e.id);
    if (e.kind === 'Call') {
      const b = getBuiltin(e.name);
      const arity = b ? b.params.length : functions.get(e.name);
      if (arity === undefined) err(`unknown function '${e.name}'`, e.id);
      else if (arity !== e.args.length)
        err(
          `'${e.name}' takes ${arity} argument${arity === 1 ? '' : 's'}, got ${e.args.length}`,
          e.id,
        );
    }
    for (const c of childExprs(e)) checkExpr(c, scopes);
  };

  const checkBlock = (b: Block, scopes: Set<string>[], inFunction: boolean) => {
    const local = new Set<string>();
    const inner = [...scopes, local];
    for (const s of b.stmts) checkStmt(s, inner, inFunction);
  };

  const checkStmt = (s: Stmt, scopes: Set<string>[], inFunction: boolean) => {
    switch (s.kind) {
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
        const b = getBuiltin(s.call.name);
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
    for (const b of childBlocks(s))
      checkBlock(b, loopVar ? [...scopes, new Set([loopVar])] : scopes, inFunction);
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
        checkBlock(it.body, [new Set(it.params)], true);
        break;
      case 'EventScript':
        checkBlock(it.body, [], false);
        break;
    }
  }
  return out;
}
