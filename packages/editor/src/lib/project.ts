import { normalizeStage, type CartV1, type ImageAsset } from '@stitch/cart';
import { compile, nodeAtLine, type CompileResult } from '@stitch/compiler';
import { IR_VERSION, type Diagnostic, type Project } from '@stitch/ir';
import type { Span } from '@stitch/lang';
import type { CostumeImage, LoadPayload } from '@stitch/runtime/protocol';
import sampleCart from '../samples/bounce/cart.json';
import playerSource from '../samples/bounce/player.stitch?raw';
import { SourceDoc } from './doc';

export const STAGE_FILE = '$stage';

/** Everything in a cart except the program, which comes from the source docs. */
export type CartShell = Omit<CartV1, 'project'>;

export interface Located extends Diagnostic {
  fileId?: string;
  span?: Span;
}

export interface Build {
  project: Project;
  compiled: CompileResult;
  diagnostics: Located[];
  /** NodeId -> file and span, across all files (ids are prefixed per file). */
  where: Map<string, { fileId: string; span: Span }>;
}

export function loadSample(): { shell: CartShell; docs: SourceDoc[] } {
  const raw = sampleCart as unknown as CartShell;
  const shell: CartShell = { ...raw, stage: normalizeStage(raw.stage) };
  const docs = [
    new SourceDoc(STAGE_FILE, 'Stage', '-- Stage scripts and global variables go here.\n'),
    new SourceDoc('player', 'Player', playerSource),
  ];
  return { shell, docs };
}

/** Assembles the project from each doc's IR and compiles it. */
export function build(shell: CartShell, docs: SourceDoc[]): Build {
  const where = new Map<string, { fileId: string; span: Span }>();
  const syntax: Located[] = [];
  const byId = new Map(docs.map((d) => [d.id, d]));
  for (const d of docs) {
    for (const [id, span] of d.spans) where.set(id, { fileId: d.id, span });
    for (const s of d.syntax)
      syntax.push({ severity: 'error', message: s.message, fileId: d.id, span: s, file: d.name });
  }
  const project: Project = {
    irVersion: IR_VERSION,
    stage: byId.get(STAGE_FILE)?.module ?? { items: [] },
    sprites: shell.sprites.map((s) => ({
      id: s.id,
      name: s.name,
      module: byId.get(s.id)?.module ?? { items: [] },
    })),
  };
  const compiled = compile(
    project,
    shell.sprites.map((s) => s.id),
  );
  const semantic: Located[] = compiled.diagnostics
    .filter((d) => !d.message.startsWith('syntax error'))
    .map((d) => {
      const at = d.nodeId ? where.get(d.nodeId) : undefined;
      return at ? { ...d, fileId: at.fileId, span: at.span } : d;
    });
  return { project, compiled, diagnostics: [...syntax, ...semantic], where };
}

/** Maps a runtime error line in the generated code back to a source location. */
export function locateRuntimeError(b: Build, line: number | undefined) {
  if (line === undefined) return undefined;
  const id = nodeAtLine(b.compiled.lineMap, line);
  return id ? b.where.get(id) : undefined;
}

const blobs = new Map<string, Promise<Blob>>();

/** Decodes fresh ImageBitmaps for every costume (they are transferred, so never reused). */
export async function decodeCostumes(shell: CartShell): Promise<CostumeImage[]> {
  const entries = Object.entries(shell.assets) as [string, ImageAsset][];
  return Promise.all(
    entries.map(async ([id, a]) => {
      let blob = blobs.get(a.data);
      if (!blob) {
        blob = fetch(a.data).then((r) => {
          if (!r.ok) throw new Error(`asset ${a.name}: HTTP ${r.status}`);
          return r.blob();
        });
        blobs.set(a.data, blob);
      }
      return {
        id,
        name: a.name,
        bitmap: await createImageBitmap(await blob),
        pixelArt: a.pixelArt,
        center: a.center,
      };
    }),
  );
}

export async function payloadFor(shell: CartShell, b: Build): Promise<LoadPayload> {
  return {
    code: b.compiled.code,
    stage: shell.stage,
    sprites: shell.sprites,
    costumes: await decodeCostumes(shell),
  };
}
