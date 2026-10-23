/**
 * The Blockly view (browser only; loaded lazily by the editor). Converts between Blockly's
 * workspace and BlockJson; the editor owns the IR, history and syncing.
 */
import { registerFieldMultilineInput } from '@blockly/field-multilineinput';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as En from 'blockly/msg/en';
import { DEFINITIONS } from './definitions';
import type { BlockJson, Position } from './json';
import { toBlocks } from './toBlocks';
import {
  functionsFlyout,
  themeStyles,
  toolbox,
  variablesFlyout,
  type ToolboxInfo,
} from './toolbox';
import type { Module } from '@stitch/ir';

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

const EDIT_SETTLE_MS = 250;

export class BlocksWorkspace {
  readonly ws: Blockly.WorkspaceSvg;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: (() => void) | undefined;

  constructor(
    container: HTMLElement,
    private cb: WorkspaceCallbacks,
  ) {
    register();
    const theme = Blockly.Theme.defineTheme('stitch', {
      name: 'stitch',
      base: Blockly.Themes.Classic,
      ...themeStyles(),
      fontStyle: {
        family: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        weight: '500',
        size: 12,
      },
      componentStyles: {
        workspaceBackgroundColour: '#f9f9fb',
        toolboxBackgroundColour: '#fff',
        flyoutBackgroundColour: '#f2f2f5',
        flyoutOpacity: 1,
      },
    });
    this.ws = Blockly.inject(container, {
      renderer: 'zelos',
      theme,
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
      if (e.isUiEvent || e.type === Blockly.Events.FINISHED_LOADING) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.cb.onChange(this.save()), EDIT_SETTLE_MS);
    });
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
    const program = toBlocks(module, layout);
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

  resize(): void {
    Blockly.svgResize(this.ws);
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.ws.dispose();
  }
}
