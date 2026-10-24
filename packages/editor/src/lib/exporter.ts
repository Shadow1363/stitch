/**
 * Export from the editor: compiles the session and packs it with the player bundle as a single
 * HTML file, an installable PWA (zip) or a Tauri desktop project (zip). Secrets and host
 * permissions are editor-side only and never reach an export.
 */
import {
  exportHtml,
  gameFromCart,
  pwaFiles,
  slug,
  tauriFiles,
  zipFiles,
  type ExportedGame,
} from '@stitch/export';
import { renderCostumes } from './assets';
import { renderIcon } from './cover';
import { inlineAssets } from './files';
import { build } from './project';
import type { Session } from './session';

export type ExportKind = 'html' | 'pwa' | 'tauri';

export interface ExportResult {
  blob: Blob;
  filename: string;
}

/** The game in `session`; throws when the program has errors, since it couldn't run. */
export async function gameFromSession(session: Session): Promise<ExportedGame> {
  const b = build(session);
  const errors = b.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length)
    throw new Error(
      `fix ${errors.length === 1 ? 'the error' : `the ${errors.length} errors`} in Problems first (${errors[0]!.message})`,
    );
  return gameFromCart(await inlineAssets(session.toCart()), b.compiled.code);
}

export async function exportGame(session: Session, kind: ExportKind): Promise<ExportResult> {
  const game = await gameFromSession(session);
  // Large (the whole runtime), so it loads only when someone exports.
  const player = (await import('virtual:stitch-player')).default;
  const name = slug(game.title);
  if (kind === 'html')
    return {
      blob: new Blob([exportHtml(game, player)], { type: 'text/html' }),
      filename: `${name}.html`,
    };

  const cart = session.toCart();
  const images = await renderCostumes(game.assets, game.palette);
  const icon = (size: number) => renderIcon(cart, images, size);
  const files =
    kind === 'pwa'
      ? pwaFiles(game, player, { 192: await icon(192), 512: await icon(512) })
      : tauriFiles(game, player, { 256: await icon(256), 512: await icon(512) });
  const folder = kind === 'pwa' ? `${name}-pwa` : `${name}-desktop`;
  const zip = zipFiles(files, folder);
  return {
    blob: new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    filename: `${folder}.zip`,
  };
}
