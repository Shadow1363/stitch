import { normalizeStage, type CartV1, type ImageAsset, type SpriteInit } from '@stitch/cart';
import { compile, nodeAtLine, type CompileResult } from '@stitch/compiler';
import { createIdGen, IR_VERSION, type Diagnostic, type Project } from '@stitch/ir';
import { parse, type Span } from '@stitch/lang';
import type { CostumeImage, LoadPayload } from '@stitch/runtime/protocol';
import sampleCart from '../samples/bounce/cart.json';
import playerSource from '../samples/bounce/player.stitch?raw';

export const STAGE_FILE = '$stage';

/** One editable source file: the stage or a sprite. */
export interface SourceFile {
  id: string;
  name: string;
  text: string;
}

/** Everything in a cart except the program, which is derived from the source files. */
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

export function loadSample(): { shell: CartShell; files: SourceFile[] } {
  const raw = sampleCart as unknown as CartShell;
  const shell: CartShell = { ...raw, stage: normalizeStage(raw.stage) };
  const files: SourceFile[] = [
    { id: STAGE_FILE, name: 'Stage', text: '-- Stage scripts and global variables go here.\n' },
    { id: 'player', name: 'Player', text: playerSource },
  ];
  return { shell, files };
}

export function build(shell: CartShell, files: SourceFile[]): Build {
  const where = new Map<string, { fileId: string; span: Span }>();
  const syntax: Located[] = [];
  const modules = new Map<string, Project['stage']>();
  for (const f of files) {
    const r = parse(f.text, createIdGen(`${f.id}:`));
    modules.set(f.id, r.module);
    for (const [id, span] of r.spans) where.set(id, { fileId: f.id, span });
    for (const d of r.diagnostics)
      syntax.push({ severity: 'error', message: d.message, fileId: f.id, span: d, file: f.name });
  }
  const project: Project = {
    irVersion: IR_VERSION,
    stage: modules.get(STAGE_FILE) ?? { items: [] },
    sprites: shell.sprites.map((s: SpriteInit) => ({
      id: s.id,
      name: s.name,
      module: modules.get(s.id) ?? { items: [] },
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
