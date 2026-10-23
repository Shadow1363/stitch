import type { Block, Expr, Stmt, TopItem } from './nodes';

/** Child blocks of a statement, in source order. */
export function childBlocks(s: Stmt | TopItem): Block[] {
  switch (s.kind) {
    case 'If':
      return [s.then, ...s.elifs.map((e) => e.body), ...(s.else ? [s.else] : [])];
    case 'Forever':
    case 'Repeat':
    case 'RepeatUntil':
    case 'While':
    case 'ForRange':
    case 'ForEach':
    case 'FunctionDef':
    case 'EventScript':
      return [s.body];
    default:
      return [];
  }
}

/** Direct child expressions of a statement or expression. */
export function childExprs(n: Stmt | TopItem | Expr): Expr[] {
  switch (n.kind) {
    case 'VarDecl':
    case 'LocalDecl':
      return [n.init];
    case 'Assign':
      return [n.target, n.value];
    case 'If':
      return [n.cond, ...n.elifs.map((e) => e.cond)];
    case 'Repeat':
      return [n.count];
    case 'RepeatUntil':
    case 'While':
    case 'WaitUntil':
      return [n.cond];
    case 'ForRange':
      return [n.from, n.to, ...(n.step ? [n.step] : [])];
    case 'ForEach':
      return [n.list];
    case 'Return':
      return n.value ? [n.value] : [];
    case 'CallStmt':
      return [n.call];
    case 'List':
      return n.items;
    case 'Index':
      return [n.target, n.index];
    case 'Unary':
      return [n.operand];
    case 'Binary':
      return [n.left, n.right];
    case 'Call':
      return n.args;
    default:
      return [];
  }
}
