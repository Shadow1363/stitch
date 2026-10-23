import type { SpriteProp } from './props';

export const IR_VERSION = 1 as const;

/** Unique within a project. Ignored by `irEqual`; reassigned on every parse. */
export type NodeId = string;

/** Comments and blank-line breaks that the canonical printer keeps. */
export interface Trivia {
  /** Whole-line comments above the node, without the leading `--`. */
  comments?: string[];
  /** A blank line separates this node from the previous one. */
  blankBefore?: boolean;
  /** Comment at the end of the node's last line, without the leading `--`. */
  lineComment?: string;
}

interface Base {
  id: NodeId;
  trivia?: Trivia;
}

export interface Project {
  irVersion: typeof IR_VERSION;
  /** Globals and stage scripts. */
  stage: Module;
  sprites: SpriteModule[];
}

export interface SpriteModule {
  id: string;
  name: string;
  module: Module;
}

/** One source file. Items keep source order. */
export interface Module {
  items: TopItem[];
  trailing?: Trivia;
}

export type TopItem = VarDecl | FunctionDef | EventScript | Raw;

export interface VarDecl extends Base {
  kind: 'VarDecl';
  scope: 'sprite' | 'global';
  name: string;
  init: Expr;
}

export interface FunctionDef extends Base {
  kind: 'FunctionDef';
  /** Runs without yielding at loop ends (Scratch "run without screen refresh"). */
  warp?: boolean;
  name: string;
  params: string[];
  body: Block;
}

export interface EventScript extends Base {
  kind: 'EventScript';
  event: EventSpec;
  body: Block;
}

export type EventSpec =
  { type: 'start' } | { type: 'key'; key: string } | { type: 'message'; name: string };

export interface Block {
  stmts: Stmt[];
  trailing?: Trivia;
}

export type Stmt =
  | LocalDecl
  | Assign
  | If
  | Forever
  | Repeat
  | RepeatUntil
  | While
  | ForRange
  | ForEach
  | WaitUntil
  | Return
  | CallStmt
  | Raw;

export interface LocalDecl extends Base {
  kind: 'LocalDecl';
  name: string;
  init: Expr;
}

export type AssignOp = '=' | '+=' | '-=' | '*=' | '/=';
export type LValue = VarRef | PropRef | Index;

export interface Assign extends Base {
  kind: 'Assign';
  target: LValue;
  op: AssignOp;
  value: Expr;
}

export interface ElseIf {
  id: NodeId;
  cond: Expr;
  body: Block;
}

export interface If extends Base {
  kind: 'If';
  cond: Expr;
  then: Block;
  elifs: ElseIf[];
  else?: Block;
}

export interface Forever extends Base {
  kind: 'Forever';
  body: Block;
}

export interface Repeat extends Base {
  kind: 'Repeat';
  count: Expr;
  body: Block;
}

export interface RepeatUntil extends Base {
  kind: 'RepeatUntil';
  cond: Expr;
  body: Block;
}

export interface While extends Base {
  kind: 'While';
  cond: Expr;
  body: Block;
}

export interface ForRange extends Base {
  kind: 'ForRange';
  var: string;
  from: Expr;
  to: Expr;
  step?: Expr;
  body: Block;
}

export interface ForEach extends Base {
  kind: 'ForEach';
  var: string;
  list: Expr;
  body: Block;
}

export interface WaitUntil extends Base {
  kind: 'WaitUntil';
  cond: Expr;
}

export interface Return extends Base {
  kind: 'Return';
  value?: Expr;
}

export interface CallStmt extends Base {
  kind: 'CallStmt';
  call: Call;
}

/** Source text that could not be parsed. Kept verbatim, never dropped. */
export interface Raw extends Base {
  kind: 'Raw';
  text: string;
  error: string;
}

export type Expr =
  NumLit | StrLit | BoolLit | ListLit | VarRef | PropRef | Index | Unary | Binary | Call;

export interface NumLit extends Base {
  kind: 'Num';
  value: number;
  /** Original spelling when it differs from String(value), e.g. "1.50". */
  raw?: string;
}

export interface StrLit extends Base {
  kind: 'Str';
  value: string;
}

export interface BoolLit extends Base {
  kind: 'Bool';
  value: boolean;
}

export interface ListLit extends Base {
  kind: 'List';
  items: Expr[];
}

export interface VarRef extends Base {
  kind: 'Var';
  name: string;
}

export interface PropRef extends Base {
  kind: 'Prop';
  prop: SpriteProp;
}

/** 1-based. */
export interface Index extends Base {
  kind: 'Index';
  target: Expr;
  index: Expr;
}

export type UnaryOp = '-' | 'not';
export type BinaryOp =
  'or' | 'and' | '==' | '~=' | '<' | '<=' | '>' | '>=' | '..' | '+' | '-' | '*' | '/' | '%' | '^';

export interface Unary extends Base {
  kind: 'Unary';
  op: UnaryOp;
  operand: Expr;
}

export interface Binary extends Base {
  kind: 'Binary';
  op: BinaryOp;
  left: Expr;
  right: Expr;
}

/** Builtin vs user function is resolved by validate/compile, not stored. */
export interface Call extends Base {
  kind: 'Call';
  name: string;
  args: Expr[];
}

export type Node = TopItem | Stmt | Expr;
