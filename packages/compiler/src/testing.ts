import { IR_VERSION, type Project } from '@stitch/ir';
import { parse } from '@stitch/lang';

/** Test helper: builds a project from source text per sprite. */
export function projectFrom(sprites: Record<string, string>, stage = ''): Project {
  return {
    irVersion: IR_VERSION,
    stage: parse(stage).module,
    sprites: Object.entries(sprites).map(([name, text]) => ({
      id: name,
      name,
      module: parse(text).module,
    })),
  };
}
