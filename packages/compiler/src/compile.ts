import {
  CORE_CATALOG,
  validateProject,
  type CartNames,
  type Catalog,
  type Diagnostic,
  type NodeId,
  type Project,
} from '@stitch/ir';
import { emitProject } from './emit';

export interface CompileResult {
  /** Body of `new Function('rt', code)`. Empty when there are errors. */
  code: string;
  lineMap: (NodeId | undefined)[];
  diagnostics: Diagnostic[];
  ok: boolean;
}

/**
 * Validates and compiles a project. `spriteOrder` is the cart's sprite order, which decides
 * script order at runtime; it defaults to the project order. `catalog` adds the cart's extensions,
 * and `names` (the cart's sprites, costumes, sounds and songs) turns on the cart-name warnings.
 */
export function compile(
  project: Project,
  spriteOrder?: string[],
  catalog: Catalog = CORE_CATALOG,
  names?: CartNames,
): CompileResult {
  const diagnostics = validateProject(project, catalog, names);
  const emitted = emitProject(project, spriteOrder, catalog);
  const all = [...diagnostics, ...emitted.diagnostics];
  const ok = !all.some((d) => d.severity === 'error');
  return { code: ok ? emitted.code : '', lineMap: ok ? emitted.lineMap : [], diagnostics: all, ok };
}

/** Finds the IR node for a 1-based line in the generated code (nearest mapped line at or above). */
export function nodeAtLine(lineMap: (NodeId | undefined)[], line: number): NodeId | undefined {
  for (let i = Math.min(line - 1, lineMap.length - 1); i >= 0; i--)
    if (lineMap[i]) return lineMap[i];
  return undefined;
}
