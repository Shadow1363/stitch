import { decodeTiles } from '@stitch/cart';
import { compile, nodeAtLine, type CompileResult } from '@stitch/compiler';
import { IR_VERSION, type Diagnostic, type Project } from '@stitch/ir';
import type { Span } from '@stitch/lang';
import { extensionSource } from '@stitch/runtime';
import type { LoadPayload } from '@stitch/runtime/protocol';
import sampleCart from '../samples/bounce/cart.json';
import playerSource from '../samples/bounce/player.stitch?raw';
import { renderCostumes } from './assets';
import { Session, STAGE_FILE } from './session';
import { stageClips } from './sound';

export { STAGE_FILE };

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

export function loadSample(): Session {
  const raw = sampleCart as unknown as Parameters<typeof Session.fromSources>[0];
  return Session.fromSources(raw, { player: playerSource });
}

/** Assembles the project from each doc's IR and compiles it. */
export function build(session: Session): Build {
  const where = new Map<string, { fileId: string; span: Span }>();
  const syntax: Located[] = [];
  for (const d of session.docs) {
    for (const [id, span] of d.spans) where.set(id, { fileId: d.id, span });
    for (const s of d.syntax)
      syntax.push({ severity: 'error', message: s.message, fileId: d.id, span: s, file: d.name });
  }
  const project: Project = {
    irVersion: IR_VERSION,
    stage: session.doc(STAGE_FILE)?.module ?? { items: [] },
    sprites: session.sprites.map((s) => ({
      id: s.id,
      name: s.name,
      module: session.doc(s.id)?.module ?? { items: [] },
    })),
  };
  const compiled = compile(
    project,
    session.sprites.map((s) => s.id),
    session.catalog,
    session.names(),
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

export async function payloadFor(session: Session, b: Build): Promise<LoadPayload> {
  const p: LoadPayload = {
    code: b.compiled.code,
    stage: session.stage,
    sprites: session.sprites,
    backdrops: session.backdrops,
    backdrop: session.backdrop,
    costumes: await renderCostumes(session.assets, session.palette),
    ...stageClips(session.sounds, session.music),
    extensions: session.extensions.map(extensionSource),
  };
  const m = session.map;
  if (m)
    p.map = {
      tileset: m.tileset,
      tileSize: m.tileSize,
      width: m.width,
      height: m.height,
      cells: decodeTiles(m),
    };
  return p;
}
