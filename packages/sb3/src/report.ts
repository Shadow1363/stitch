/** What an import brought in and what it had to leave out, for the editor to show. */
export interface ImportReport {
  sprites: number;
  costumes: number;
  sounds: number;
  /** Event scripts and custom blocks. */
  scripts: number;
  /** Blocks Stitch can't express, by Scratch opcode. Each left a `-- sb3:` comment. */
  unsupported: Record<string, number>;
  /** Names that had to change: variables, lists, custom blocks, inputs and sounds. */
  renamed: { kind: string; from: string; to: string; target: string }[];
  /** Stacks without a hat and stray reporters, which never run in Scratch either. */
  dropped: number;
  /** Anything else worth knowing: missing assets, cloud variables, approximations. */
  notes: string[];
}

export function emptyReport(): ImportReport {
  return {
    sprites: 0,
    costumes: 0,
    sounds: 0,
    scripts: 0,
    unsupported: {},
    renamed: [],
    dropped: 0,
    notes: [],
  };
}
