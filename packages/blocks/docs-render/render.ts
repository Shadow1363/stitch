/**
 * The page `scripts/docs-blocks.ts` drives: renders one docs example through `toBlocks` and real
 * Blockly, and returns a standalone SVG with computed styles inlined (no Blockly CSS needed).
 */
import { createCatalog, validateManifest } from '@stitch/ir';
import * as Blockly from 'blockly/core';
import { exampleBlocks, exampleHash, examplesIn, manifestsIn } from '../src/docs';
import { blocksTheme, defineExtensionBlocks, register } from '../src/workspace';

/** Fonts every docs reader has, so text fits the shapes measured here. */
const FONT = 'Helvetica, Arial, sans-serif';
const PAD = 4;
const GAP = 16;
/** Presentation properties to inline, with SVG's initial values (left out to keep files small). */
const STYLE_PROPS: Record<string, string | undefined> = {
  fill: undefined,
  'fill-opacity': '1',
  stroke: 'none',
  'stroke-width': '1px',
  'stroke-opacity': '1',
  'font-family': undefined,
  'font-size': undefined,
  'font-weight': '400',
  'dominant-baseline': 'auto',
  'text-anchor': 'start',
  opacity: '1',
  visibility: 'visible',
  display: 'inline',
};
const TEXT_ONLY = new Set([
  'font-family',
  'font-size',
  'font-weight',
  'dominant-baseline',
  'text-anchor',
]);

function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  const text = src.tagName === 'text' || src.tagName === 'tspan';
  const style = Object.entries(STYLE_PROPS)
    .filter(([p]) => text || !TEXT_ONLY.has(p))
    .map(([p, initial]) => [p, cs.getPropertyValue(p), initial] as const)
    .filter(([, v, initial]) => v !== '' && v !== initial)
    .map(([p, v]) => `${p}:${v}`)
    .join(';');
  if (style) dst.setAttribute('style', style);
  else dst.removeAttribute('style');
  dst.removeAttribute('class');
  for (let i = 0; i < src.children.length; i++) inlineStyles(src.children[i]!, dst.children[i]!);
}

function render(code: string, manifests: unknown[], hash: string): string {
  register();
  const catalog = createCatalog(
    manifests.map((m) => {
      const r = validateManifest(m);
      if (!r.ok) throw new Error(`bad manifest: ${r.errors.join('; ')}`);
      return r.manifest;
    }),
  );
  defineExtensionBlocks(catalog);
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:0;top:0;width:2400px;height:2400px';
  document.body.append(host);
  const ws = Blockly.inject(host, {
    renderer: 'zelos',
    theme: blocksTheme({
      workspace: '#ffffff',
      toolbox: '#ffffff',
      flyout: '#ffffff',
      text: '#151922',
      muted: '#586172',
      font: FONT,
    }),
    sounds: false,
    trashcan: false,
    zoom: { startScale: 1 },
    move: { scrollbars: false, drag: false, wheel: false },
  });
  try {
    const blocks = exampleBlocks(code, catalog);
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks } }, ws);
    Blockly.renderManagement.triggerQueuedRenders(ws);
    // Stack top-level blocks with a gap, as they'd sit in the editor.
    let y = 0;
    for (const b of ws.getTopBlocks(true)) {
      const xy = b.getRelativeToSurfaceXY();
      b.moveBy(-xy.x, y - xy.y);
      y += b.getHeightWidth().height + GAP;
    }
    const canvas = ws.getCanvas();
    const box = canvas.getBBox();
    const clone = canvas.cloneNode(true) as SVGGElement;
    inlineStyles(canvas, clone);
    clone.removeAttribute('transform');
    const w = Math.ceil(box.width + PAD * 2);
    const h = Math.ceil(box.height + PAD * 2);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${w}" height="${h}" viewBox="${box.x - PAD} ${box.y - PAD} ${w} ${h}" ` +
      `data-source-hash="${hash}">` +
      new XMLSerializer().serializeToString(clone) +
      '</svg>';
    return svg;
  } finally {
    ws.dispose();
    host.remove();
  }
}

/** Renders every example in `docs` (markdown texts); names must be unique across them. */
function renderAll(docs: { path: string; text: string }[], sample: unknown[]) {
  const manifests = [...sample, ...docs.flatMap((d) => manifestsIn(d.text))];
  const out: Record<string, string> = {};
  const where: Record<string, string> = {};
  for (const d of docs)
    for (const e of examplesIn(d.text)) {
      if (where[e.name])
        throw new Error(`example "${e.name}" is in both ${where[e.name]} and ${d.path}`);
      where[e.name] = d.path;
      out[e.name] = render(e.code, manifests, exampleHash(e.code));
    }
  return out;
}

(globalThis as { renderAll?: typeof renderAll }).renderAll = renderAll;
