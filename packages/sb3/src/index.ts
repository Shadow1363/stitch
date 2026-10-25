/**
 * Scratch 3 projects (`.sb3`) → Stitch carts. Pure apart from the hooks the caller passes for
 * MP3 decoding and bitmap scaling. Scripts become IR and go through the printer and parser, so an
 * imported cart holds ordinary, canonical Stitch. What maps to what: `docs/import-scratch.md`.
 */
import {
  CART_FORMAT,
  CART_VERSION,
  normalizeCart,
  type Asset,
  type Cart,
  type SpriteInit,
} from '@stitch/cart';
import { createIdGen, IR_VERSION, type Expr, type Module, type TopItem } from '@stitch/ir';
import { parse, printModule } from '@stitch/lang';
import { strFromU8, unzipSync } from 'fflate';
import { costumeAsset, SoundBank, type ImportHooks } from './assets';
import { Namespace } from './names';
import type { Sb3Project, Sb3Target } from './project';
import { emptyReport, type ImportReport } from './report';
import {
  addComments,
  declareProcs,
  ScriptConverter,
  type Context,
  type TargetNames,
  type VarInfo,
} from './scripts';

export type { ImportHooks } from './assets';
export type { ImportReport } from './report';
export { HANDLED } from './scripts';

export interface ImportOptions extends ImportHooks {
  /** The cart's title; usually the file name. */
  title?: string;
}

export interface ImportResult {
  cart: Cart;
  report: ImportReport;
}

/** Zip files start with `PK\x03\x04`; `.sb3` files are zips. */
export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
}

/** Reads a `.sb3` file. Throws if it isn't a Scratch 3 project. */
export async function importSb3(
  bytes: Uint8Array,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('not a Scratch project (the file is not a zip)');
  }
  const json = files['project.json'];
  if (!json) throw new Error('not a Scratch project (no project.json inside)');
  let project: Sb3Project;
  try {
    project = JSON.parse(strFromU8(json)) as Sb3Project;
  } catch {
    throw new Error('not a Scratch project (project.json is not JSON)');
  }
  if (!Array.isArray(project.targets)) {
    if (project && typeof project === 'object' && 'objName' in project)
      throw new Error('this is a Scratch 2 project; open it in Scratch 3 and save it again');
    throw new Error('not a Scratch 3 project (no targets)');
  }
  return convert(project, files, opts);
}

async function convert(
  project: Sb3Project,
  files: Record<string, Uint8Array>,
  opts: ImportOptions,
): Promise<ImportResult> {
  const report = emptyReport();
  const stage = project.targets.find((t) => t.isStage) ?? { isStage: true, name: 'Stage' };
  const sprites = project.targets
    .filter((t) => !t.isStage)
    .sort((a, b) => (a.layerOrder ?? 0) - (b.layerOrder ?? 0));
  report.sprites = sprites.length;

  // Names first, so any script can refer to any variable, list or custom block.
  const root = new Namespace();
  const stageNames = targetNames(stage, root, true, report);
  const spriteNames = new Map<Sb3Target, TargetNames>();
  for (const t of sprites) spriteNames.set(t, targetNames(t, new Namespace(root), false, report));
  const ctx: Context = {
    ids: createIdGen('sb'),
    report,
    stage: stageNames,
    sprites: new Map(sprites.map((t) => [t.name, spriteNames.get(t)!])),
  };
  for (const [t, names] of [[stage, stageNames] as const, ...spriteNames])
    declareProcs(t, names, report);

  // Sounds join one bank; costumes become assets.
  const bank = new SoundBank(files, opts, report);
  const assets: Record<string, Asset> = {};
  const costumeIds = async (t: Sb3Target, prefix: string) => {
    const ids: string[] = [];
    for (const [i, c] of (t.costumes ?? []).entries()) {
      const id = `${prefix}c${i + 1}`;
      assets[id] = await costumeAsset(c, files, opts, report, t.name);
      ids.push(id);
      report.costumes++;
    }
    return ids;
  };
  for (const [t, names] of [[stage, stageNames] as const, ...spriteNames])
    for (const s of t.sounds ?? []) {
      const name = await bank.add(s, t.name);
      if (name) names.sounds.set(s.name, name);
    }
  const backdrops = await costumeIds(stage, 'stage-');
  const inits: SpriteInit[] = [];
  for (const [i, t] of sprites.entries()) {
    const costumes = await costumeIds(t, `sprite${i + 1}-`);
    inits.push({
      id: `sprite${i + 1}`,
      name: t.name,
      x: t.x ?? 0,
      y: t.y ?? 0,
      direction: t.direction ?? 90,
      size: t.size ?? 100,
      visible: t.visible ?? true,
      layer: i,
      costumes,
      costume: clampIndex(t.currentCostume, costumes.length),
    });
    if (t.volume !== undefined && t.volume !== 100)
      report.notes.push(
        `${t.name}: its volume (${t.volume}%) is ignored; Stitch has one volume for the cart`,
      );
  }

  const moduleOf = (t: Sb3Target, names: TargetNames) => {
    const c = new ScriptConverter(ctx, t, names);
    const scripts = c.scripts();
    const items: TopItem[] = [
      ...declarations(t, names, c, report),
      ...prelude(t, c),
      ...scripts,
      ...monitors(project, t, names, c),
    ];
    // A blank line between items, except within the block of declarations at the top.
    items.forEach((it, i) => {
      if (i > 0 && !(it.kind === 'VarDecl' && items[i - 1]!.kind === 'VarDecl'))
        it.trivia = { ...it.trivia, blankBefore: true };
    });
    const module: Module = { items };
    if (c.looseComments.length) {
      if (items[0]) addComments(items[0], c.looseComments);
      else module.trailing = { comments: c.looseComments };
    }
    // Through the printer and parser, so the cart holds what the editor would.
    const text = printModule(module);
    const parsed = parse(text);
    for (const d of parsed.diagnostics)
      report.notes.push(
        `${t.name}: the importer wrote code that doesn't parse (${d.message}); please report this`,
      );
    return parsed.module;
  };

  const cart = normalizeCart({
    format: CART_FORMAT,
    version: CART_VERSION,
    meta: { title: opts.title ?? 'Scratch project' },
    stage: {},
    project: {
      irVersion: IR_VERSION,
      stage: moduleOf(stage, stageNames),
      sprites: sprites.map((t, i) => ({
        id: inits[i]!.id,
        name: t.name,
        module: moduleOf(t, spriteNames.get(t)!),
      })),
    },
    sprites: inits,
    backdrops,
    backdrop: clampIndex(stage.currentCostume, backdrops.length),
    assets,
    sounds: bank.sounds,
  });
  return { cart, report };
}

const clampIndex = (i: number | undefined, n: number) =>
  Math.min(Math.max(1, Math.floor(i ?? 0) + 1), Math.max(1, n));

/** Claims identifiers for a target's variables and lists. Stage ones are the cart's globals. */
function targetNames(
  t: Sb3Target,
  ns: Namespace,
  global: boolean,
  report: ImportReport,
): TargetNames {
  const names: TargetNames = {
    ns,
    vars: new Map(),
    byName: new Map(),
    procs: new Map(),
    sounds: new Map(),
    extra: [],
  };
  const add = (id: string, label: string, list: boolean) => {
    const name = ns.claim(label, list ? 'list' : 'var');
    if (name !== label)
      report.renamed.push({
        kind: list ? 'list' : 'variable',
        from: label,
        to: name,
        target: t.name,
      });
    const v: VarInfo = { name, label, list, global };
    names.vars.set(id, v);
    const key = `${list ? 'l' : 'v'}:${label}`;
    if (!names.byName.has(key)) names.byName.set(key, v);
  };
  for (const [id, v] of Object.entries(t.variables ?? {})) add(id, String(v[0]), false);
  for (const [id, l] of Object.entries(t.lists ?? {})) add(id, String(l[0]), true);
  return names;
}

/** `var` / `global var` for each variable and list, with its saved value. */
function declarations(
  t: Sb3Target,
  names: TargetNames,
  c: ScriptConverter,
  report: ImportReport,
): TopItem[] {
  const out: TopItem[] = [];
  const decl = (v: VarInfo, init: Expr) =>
    out.push({
      kind: 'VarDecl',
      id: c.id(),
      scope: v.global ? 'global' : 'sprite',
      name: v.name,
      init,
    });
  for (const [id, [label, value, cloud]] of Object.entries(t.variables ?? {})) {
    if (cloud)
      report.notes.push(`${t.name}: cloud variable "${label}" is an ordinary variable here`);
    decl(names.vars.get(id)!, c.literalExpr(value, 'text'));
  }
  for (const [id, [, items]] of Object.entries(t.lists ?? {}))
    decl(names.vars.get(id)!, {
      kind: 'List',
      id: c.id(),
      items: (Array.isArray(items) ? items : []).map((i) => c.literalExpr(i, 'text')),
    });
  for (const v of names.extra) decl(v, v.list ? { kind: 'List', id: c.id(), items: [] } : c.num(0));
  return out;
}

/** Sprite settings Stitch sets from code: drag mode and rotation style, at the start. */
function prelude(t: Sb3Target, c: ScriptConverter): TopItem[] {
  if (t.isStage) return [];
  const stmts = [];
  if (t.draggable) stmts.push(c.callStmt('set_drag_mode', [c.bool(true)]));
  if (t.rotationStyle && t.rotationStyle !== 'all around')
    stmts.push(c.callStmt('rotation_style', [c.str(t.rotationStyle)]));
  if (!stmts.length) return [];
  return [{ kind: 'EventScript', id: c.id(), event: { type: 'start' }, body: { stmts } }];
}

/** Scratch's visible variable and list monitors, as `watch` calls kept up to date (D29). */
function monitors(
  project: Sb3Project,
  t: Sb3Target,
  names: TargetNames,
  c: ScriptConverter,
): TopItem[] {
  const stmts = [];
  for (const m of project.monitors ?? []) {
    if (!m.visible || (m.opcode !== 'data_variable' && m.opcode !== 'data_listcontents')) continue;
    if (t.isStage ? m.spriteName : m.spriteName !== t.name) continue;
    const list = m.opcode === 'data_listcontents';
    const label = m.params?.[list ? 'LIST' : 'VARIABLE'] ?? '';
    const v = names.vars.get(m.id) ?? names.byName.get(`${list ? 'l' : 'v'}:${label}`);
    if (!v) continue;
    stmts.push(c.callStmt('watch', [c.str(v.label), { kind: 'Var', id: c.id(), name: v.name }]));
  }
  if (!stmts.length) return [];
  return [
    {
      kind: 'EventScript',
      id: c.id(),
      event: { type: 'start' },
      body: { stmts: [{ kind: 'Forever', id: c.id(), body: { stmts } }] },
      trivia: { comments: [' Scratch showed these on stage'] },
    },
  ];
}
