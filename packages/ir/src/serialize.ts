import { IR_VERSION, type Project } from './nodes';

export function serializeProject(project: Project): string {
  return JSON.stringify(project);
}

export function deserializeProject(json: string): Project {
  return migrateProject(JSON.parse(json) as unknown);
}

/** Upgrades older IR to the current version. Rejects newer versions. */
export function migrateProject(data: unknown): Project {
  if (!data || typeof data !== 'object') throw new Error('project: expected an object');
  const v = (data as { irVersion?: unknown }).irVersion;
  if (typeof v !== 'number') throw new Error('project: missing irVersion');
  if (v > IR_VERSION)
    throw new Error(`project: irVersion ${v} is newer than this build supports (${IR_VERSION})`);
  // 1 -> 2 only added shapes (Break, Continue, clone and click events, shared vars): no rewrite.
  return { ...(data as Project), irVersion: IR_VERSION };
}
