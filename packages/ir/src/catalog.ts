import { BUILTINS, type Builtin } from './builtins';
import { extensionBuiltins, type ExtensionManifest } from './extension';

/**
 * The builtins a project can call: the core catalog plus entries from the cart's extensions.
 * Validation, compilation and the block views all take one, so extensions add calls without
 * touching the grammar or the IR.
 */
export interface Catalog {
  get(name: string): Builtin | undefined;
  /** Core entries first, then each extension's in manifest order. */
  readonly all: readonly Builtin[];
}

function catalogOf(entries: readonly Builtin[]): Catalog {
  const byName = new Map(entries.map((b) => [b.name, b]));
  return { get: (name) => byName.get(name), all: entries };
}

export const CORE_CATALOG: Catalog = catalogOf([...BUILTINS.values()]);

/**
 * Core builtins plus the blocks of already-validated manifests. A name that is taken (by the
 * core or an earlier extension) keeps its first owner, so an extension can never shadow a builtin.
 */
export function createCatalog(manifests: readonly ExtensionManifest[]): Catalog {
  if (!manifests.length) return CORE_CATALOG;
  const entries = [...CORE_CATALOG.all];
  const taken = new Set(entries.map((b) => b.name));
  for (const m of manifests)
    for (const b of extensionBuiltins(m)) {
      if (taken.has(b.name)) continue;
      taken.add(b.name);
      entries.push(b);
    }
  return catalogOf(entries);
}
