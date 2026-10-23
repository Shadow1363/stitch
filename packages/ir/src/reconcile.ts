import type { Block, Expr, Module, Node, NodeId, Stmt, TopItem, Trivia } from './nodes';
import { childBlocks, childExprs } from './walk';

/**
 * Carries node ids from `old` onto structurally matching nodes of `next` (mutating `next`).
 * Text re-parses produce fresh ids; reconciling keeps ids stable so the blocks view keeps each
 * block's identity, position and selection across text edits. Each old id is reused at most once.
 */
export function reconcile(old: Module, next: Module): Module {
  matchSeq(old.items, next.items, matchNode);
  return next;
}

/** Shallow identity of a node: what must agree for two nodes to count as "the same" block. */
function sig(n: Node): string {
  switch (n.kind) {
    case 'VarDecl':
      return `VarDecl:${n.scope}:${n.name}`;
    case 'FunctionDef':
      return `FunctionDef:${n.name}`;
    case 'EventScript':
      return `EventScript:${JSON.stringify(n.event)}`;
    case 'LocalDecl':
      return `LocalDecl:${n.name}`;
    case 'Assign':
      return `Assign:${n.op}:${sig(n.target)}`;
    case 'CallStmt':
      return `CallStmt:${n.call.name}`;
    case 'ForRange':
    case 'ForEach':
      return `${n.kind}:${n.var}`;
    case 'Var':
      return `Var:${n.name}`;
    case 'Prop':
      return `Prop:${n.prop}`;
    case 'Call':
      return `Call:${n.name}`;
    case 'Unary':
    case 'Binary':
      return `${n.kind}:${n.op}`;
    default:
      return n.kind;
  }
}

function matchNode(o: Node, n: Node) {
  n.id = o.id;
  if (o.kind === 'If' && n.kind === 'If') {
    matchSeq(
      o.elifs,
      n.elifs,
      (a, b) => {
        b.id = a.id;
      },
      (e) => sig(e.cond),
    );
  }
  matchSeq(childExprs(o as Stmt | Expr), childExprs(n as Stmt | Expr), matchNode);
  const ob = childBlocks(o as Stmt | TopItem);
  const nb = childBlocks(n as Stmt | TopItem);
  for (let i = 0; i < Math.min(ob.length, nb.length); i++)
    matchSeq(ob[i]!.stmts, nb[i]!.stmts, matchNode);
}

/** Longest common subsequence by signature, then leftovers by signature; pairs go to `onMatch`. */
function matchSeq<T>(
  a: T[],
  b: T[],
  onMatch: (x: T, y: T) => void,
  key: (x: T) => string = (x) => sig(x as Node),
) {
  const ka = a.map(key);
  const kb = b.map(key);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] =
        ka[i] === kb[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const usedA = new Uint8Array(n);
  const usedB = new Uint8Array(m);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      onMatch(a[i]!, b[j]!);
      usedA[i] = usedB[j] = 1;
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  // Second pass: nodes that moved (out of LCS order) still pair up by signature.
  for (let y = 0; y < m; y++) {
    if (usedB[y]) continue;
    for (let x = 0; x < n; x++) {
      if (usedA[x] || ka[x] !== kb[y]) continue;
      onMatch(a[x]!, b[y]!);
      usedA[x] = usedB[y] = 1;
      break;
    }
  }
}

/**
 * Copies text-only details that the blocks view does not edit (blank lines, same-line comments,
 * number spellings, block-trailing comments) from `old` onto nodes of `next` with the same id.
 * Leading comments are not carried: the blocks view shows and edits them as block comments.
 */
export function carryTextDetails(old: Module, next: Module): Module {
  const byId = new Map<NodeId, Node>();
  const blocksOf = new Map<NodeId, Block[]>();
  const index = (n: Node) => {
    byId.set(n.id, n);
    const bs = childBlocks(n as Stmt | TopItem);
    if (bs.length) blocksOf.set(n.id, bs);
    for (const b of bs) for (const s of b.stmts) index(s);
    for (const e of childExprs(n as Stmt | Expr)) index(e);
  };
  for (const it of old.items) index(it);

  const visit = (n: Node) => {
    const o = byId.get(n.id);
    if (o && o.kind === n.kind) {
      const t = carryTrivia(o.trivia, n.trivia);
      if (t) n.trivia = t;
      if (o.kind === 'Num' && n.kind === 'Num' && o.raw !== undefined && o.value === n.value)
        n.raw = o.raw;
      const ob = blocksOf.get(n.id);
      const nb = childBlocks(n as Stmt | TopItem);
      if (ob)
        for (let i = 0; i < Math.min(ob.length, nb.length); i++)
          if (ob[i]!.trailing && !nb[i]!.trailing) nb[i]!.trailing = ob[i]!.trailing;
    }
    for (const b of childBlocks(n as Stmt | TopItem)) for (const s of b.stmts) visit(s);
    for (const e of childExprs(n as Stmt | Expr)) visit(e);
  };
  for (const it of next.items) visit(it);
  if (old.trailing && !next.trailing) next.trailing = old.trailing;
  return next;
}

const spaceless = (cs: string[]) => cs.map((c) => c.replace(/^ /, '')).join('\n');

function carryTrivia(o: Trivia | undefined, n: Trivia | undefined): Trivia | undefined {
  if (!o) return n;
  const out: Trivia = { ...n };
  // Blocks show comments without the space after `--`; keep the original spelling if unchanged.
  if (o.comments && out.comments && spaceless(o.comments) === spaceless(out.comments))
    out.comments = o.comments;
  // Bare `--` lines can't be shown as a block comment (Blockly drops empty ones); keep them.
  if (o.comments && !out.comments && o.comments.every((c) => c.trim() === ''))
    out.comments = o.comments;
  if (o.blankBefore && out.blankBefore === undefined) out.blankBefore = true;
  if (o.lineComment !== undefined && out.lineComment === undefined) out.lineComment = o.lineComment;
  return out.comments || out.blankBefore || out.lineComment !== undefined ? out : undefined;
}
