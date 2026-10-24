/**
 * The Blockly view (browser only; loaded lazily by the editor). Converts between Blockly's
 * workspace and BlockJson; the editor owns the IR, history and syncing.
 */
import { registerFieldMultilineInput } from '@blockly/field-multilineinput';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as En from 'blockly/msg/en';
import { DEFINITIONS, extensionDefinitions } from './definitions';
import type { BlockJson, Position } from './json';
import { toBlocks } from './toBlocks';
import {
  functionsFlyout,
  themeStyles,
  toolbox,
  variablesFlyout,
  type ToolboxInfo,
} from './toolbox';
import { CORE_CATALOG, type Catalog, type Module } from '@stitch/ir';

export interface WorkspaceCallbacks {
  /** A user edit settled. `blocks` is every top-level block, program and loose. */
  onChange(blocks: BlockJson[]): void;
  /** Positions chosen for blocks that had none (so they stay put next time). */
  onLayout(layout: Record<string, Position>): void;
  onUndo(): void;
  onRedo(): void;
  info(): ToolboxInfo;
  /** Expose the workspace as `globalThis.__stitchBlocks` (dev builds, for scripted tests). */
  debugGlobal?: boolean;
  /** Workspace colours and font from the editor's tokens. */
  surfaces: BlocksSurfaces;
  /**
   * The user selected a block (or nothing): its id, then its parents' ids outward, so the
   * editor can find the nearest one that is an IR node (shadows and sub-blocks aren't).
   */
  onSelect?(ids: string[]): void;
  /** The user scrolled or zoomed the workspace (not `highlight` scrolling it). */
  onScroll?(): void;
}

/** The editor's tokens Blockly needs. Blockly sets colours as SVG attributes, so not var(--…). */
export interface BlocksSurfaces {
  workspace: string;
  toolbox: string;
  flyout: string;
  text: string;
  muted: string;
  font: string;
}

let themes = 0;
/** A Blockly theme with Stitch's block styles on the given surfaces. */
export function blocksTheme(s: BlocksSurfaces): Blockly.Theme {
  return Blockly.Theme.defineTheme(`stitch-${++themes}`, {
    name: `stitch-${themes}`,
    base: Blockly.Themes.Classic,
    ...themeStyles(),
    fontStyle: { family: s.font, weight: '600', size: 12 },
    componentStyles: {
      workspaceBackgroundColour: s.workspace,
      toolboxBackgroundColour: s.toolbox,
      toolboxForegroundColour: s.text,
      flyoutBackgroundColour: s.flyout,
      flyoutForegroundColour: s.text,
      flyoutOpacity: 1,
      scrollbarColour: s.muted,
      scrollbarOpacity: 0.5,
      insertionMarkerColour: s.text,
      insertionMarkerOpacity: 0.3,
      cursorColour: s.text,
    },
  });
}

let registered = false;

export function register(): void {
  if (registered) return;
  registered = true;
  Blockly.setLocale(En as unknown as Record<string, string>);
  registerFieldMultilineInput();
  Blockly.Extensions.registerMutator('stitch_call_args', {
    saveExtraState(this: CallBlock) {
      return { args: this.argCount ?? 0 };
    },
    loadExtraState(this: CallBlock, state: { args?: number }) {
      this.argCount = Number(state.args ?? 0);
      for (let i = 0; i < this.argCount; i++)
        if (!this.getInput(`ARG${i}`)) this.appendValueInput(`ARG${i}`);
      for (let i = this.argCount; this.getInput(`ARG${i}`); i++) this.removeInput(`ARG${i}`);
    },
  });
  Blockly.common.defineBlocksWithJsonArray(DEFINITIONS);
  uncheckIfConditions();
  // The editor handles Cmd/Ctrl+Z for both views; Blockly's own shortcuts would undo twice.
  for (const name of [Blockly.ShortcutItems.names.UNDO, Blockly.ShortcutItems.names.REDO])
    if (Blockly.ShortcutRegistry.registry.getRegistry()[name])
      Blockly.ShortcutRegistry.registry.unregister(name);
}

/** Registers the blocks `catalog`'s extensions add (Blockly block types are global). */
export function defineExtensionBlocks(catalog: Catalog): void {
  const defs = extensionDefinitions(catalog);
  // Redefining replaces the old shape (an extension updated in place) without Blockly's warning.
  for (const d of defs) delete Blockly.Blocks[d.type as string];
  Blockly.common.defineBlocksWithJsonArray(defs);
}

/** Stitch is dynamically typed (`if 0 then` is valid), so `if` conditions accept any block. */
function uncheckIfConditions() {
  type IfBlock = Blockly.Block & { updateShape_?: () => void };
  const def = Blockly.Blocks['controls_if'] as { init: (this: IfBlock) => void };
  const uncheck = (b: IfBlock) => {
    for (let i = 0, input; (input = b.getInput(`IF${i}`)); i++) input.setCheck(null);
  };
  const init = def.init;
  def.init = function (this: IfBlock) {
    init.call(this);
    uncheck(this);
    // The else-if mixin rebuilds inputs (with Boolean checks) whenever its shape changes.
    const update = this.updateShape_;
    if (update)
      this.updateShape_ = function (this: IfBlock) {
        update.call(this);
        uncheck(this);
      };
  };
}

type CallBlock = Blockly.Block & { argCount?: number };

/** Every block in the stack has a definition (Blockly refuses to load unknown types). */
function definedStack(b: BlockJson): boolean {
  if (Blockly.Blocks[b.type] === undefined) return false;
  const kids = [...Object.values(b.inputs ?? {}), ...(b.next ? [b.next] : [])];
  return kids.every(
    (i) => (!i.block || definedStack(i.block)) && (!i.shadow || definedStack(i.shadow)),
  );
}

const EDIT_SETTLE_MS = 250;

export class BlocksWorkspace {
  readonly ws: Blockly.WorkspaceSvg;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: (() => void) | undefined;
  private catalog: Catalog = CORE_CATALOG;
  /** Scrolls this view makes itself are ignored until then, so linked views don't echo. */
  private quietUntil = 0;

  constructor(
    container: HTMLElement,
    private cb: WorkspaceCallbacks,
  ) {
    register();
    this.ws = Blockly.inject(container, {
      renderer: 'zelos',
      theme: blocksTheme(cb.surfaces),
      toolbox: toolbox() as Blockly.utils.toolbox.ToolboxDefinition,
      trashcan: true,
      sounds: false,
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: {
        controls: true,
        wheel: false,
        startScale: 0.7,
        maxScale: 2,
        minScale: 0.3,
        pinch: true,
      },
    });
    // One history for text and blocks: the editor owns undo/redo (this covers the context menu).
    this.ws.MAX_UNDO = 0;
    this.ws.undo = (redo?: boolean) => (redo ? cb.onRedo() : cb.onUndo());
    this.ws.registerToolboxCategoryCallback(
      'STITCH_VARIABLES',
      () => variablesFlyout(cb.info()) as Blockly.utils.toolbox.FlyoutItemInfoArray,
    );
    this.ws.registerToolboxCategoryCallback(
      'STITCH_FUNCTIONS',
      () => functionsFlyout(cb.info()) as Blockly.utils.toolbox.FlyoutItemInfoArray,
    );
    if (cb.debugGlobal) (globalThis as { __stitchBlocks?: unknown }).__stitchBlocks = this;
    this.ws.addChangeListener((e) => {
      if (e.type === Blockly.Events.SELECTED) {
        const id = (e as Blockly.Events.Selected).newElementId;
        const ids: string[] = [];
        for (let b = id ? this.ws.getBlockById(id) : null; b; b = b.getParent()) ids.push(b.id);
        this.cb.onSelect?.(ids);
        return;
      }
      if (e.type === Blockly.Events.VIEWPORT_CHANGE) {
        if (performance.now() >= this.quietUntil) this.cb.onScroll?.();
        return;
      }
      if (e.isUiEvent || e.type === Blockly.Events.FINISHED_LOADING) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.cb.onChange(this.save()), EDIT_SETTLE_MS);
    });
  }

  /**
   * Switches to the builtins of a cart's extensions: registers their blocks and rebuilds the
   * toolbox. Call `show` afterwards so existing calls pick up (or drop) their extension blocks.
   */
  setCatalog(catalog: Catalog): void {
    if (catalog === this.catalog) return;
    this.catalog = catalog;
    defineExtensionBlocks(catalog);
    this.ws.updateToolbox(toolbox(catalog) as Blockly.utils.toolbox.ToolboxDefinition);
  }

  /** Top-level blocks as JSON. */
  save(): BlockJson[] {
    const state = Blockly.serialization.workspaces.save(this.ws) as {
      blocks?: { blocks?: BlockJson[] };
    };
    return state.blocks?.blocks ?? [];
  }

  /** Replaces the workspace contents; waits until no field editor is open. */
  show(module: Module, layout: Record<string, Position>, loose: BlockJson[]): void {
    this.pending = () => this.load(module, layout, loose);
    this.flush();
  }

  private flush = () => {
    if (!this.pending) return;
    if (Blockly.WidgetDiv.isVisible() || Blockly.DropDownDiv.isVisible() || this.ws.isDragging()) {
      setTimeout(this.flush, 200);
      return;
    }
    const run = this.pending;
    this.pending = undefined;
    run();
  };

  private load(module: Module, layout: Record<string, Position>, loose: BlockJson[]) {
    clearTimeout(this.timer);
    // Calls to a removed extension come back as generic call blocks; loose ones are dropped.
    const program = toBlocks(module, layout, this.catalog);
    loose = loose.filter(definedStack);
    const metrics = this.ws.getMetrics();
    const scroll = { x: this.ws.scrollX, y: this.ws.scrollY };
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(
        { blocks: { languageVersion: 0, blocks: [...program, ...loose] } },
        this.ws,
        { recordUndo: false },
      );
      Blockly.renderManagement.triggerQueuedRenders(this.ws);
      const placed = this.arrange(program.filter((b) => b.x === undefined).map((b) => b.id));
      if (Object.keys(placed).length) this.cb.onLayout(placed);
    } finally {
      Blockly.Events.enable();
    }
    if (metrics) this.ws.scroll(scroll.x, scroll.y);
  }

  /** Stacks unpositioned top-level blocks under everything else. */
  private arrange(ids: string[]): Record<string, Position> {
    const placed: Record<string, Position> = {};
    if (!ids.length) return placed;
    const todo = new Set(ids);
    let bottom = 16;
    for (const b of this.ws.getTopBlocks(false)) {
      if (todo.has(b.id)) continue;
      const xy = b.getRelativeToSurfaceXY();
      bottom = Math.max(bottom, xy.y + b.getHeightWidth().height + 32);
    }
    for (const id of ids) {
      const b = this.ws.getBlockById(id);
      if (!b) continue;
      const xy = b.getRelativeToSurfaceXY();
      b.moveBy(24 - xy.x, bottom - xy.y);
      placed[id] = { x: 24, y: bottom };
      bottom += b.getHeightWidth().height + 32;
    }
    return placed;
  }

  /**
   * Glows one block (none for undefined) without selecting it, and scrolls it into view when
   * it's off screen. False when there's no such block.
   */
  highlight(id: string | undefined): boolean {
    const b = id ? this.ws.getBlockById(id) : null;
    this.ws.highlightBlock(b ? b.id : null);
    if (!b) return false;
    this.quietUntil = performance.now() + 300;
    this.ws.scrollBoundsIntoView(b.getBoundingRectangle(), 24);
    return true;
  }

  /** The top-level block nearest the top of the visible area, for linked scrolling. */
  topBlockInView(): string | undefined {
    const view = this.ws.getMetricsManager().getViewMetrics(true);
    const bottom = view.top + view.height;
    const right = view.left + view.width;
    let best: { id: string; y: number } | undefined;
    for (const b of this.ws.getTopBlocks(false)) {
      const r = b.getBoundingRectangle();
      if (r.bottom < view.top || r.top > bottom || r.right < view.left || r.left > right) continue;
      // A block reaching above the view counts as at the top.
      const y = Math.max(r.top, view.top);
      if (!best || y < best.y) best = { id: b.id, y };
    }
    return best?.id;
  }

  /** Applies new surfaces (the editor's theme changed). */
  setSurfaces(s: BlocksSurfaces): void {
    this.ws.setTheme(blocksTheme(s));
  }

  resize(): void {
    Blockly.svgResize(this.ws);
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.ws.dispose();
  }
}
