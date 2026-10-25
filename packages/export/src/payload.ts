/**
 * Cart sources -> what the stage runner loads (browser only). The editor uses the same costume
 * rendering for its sandboxed stage; players render everything here at start-up.
 */
import { decodeTiles, isPixelArt, type Asset, type Music, type Sound } from '@stitch/cart';
import { MUSIC_RATE, renderSong, soundPcm } from '@stitch/cart/audio';
import { renderAsset } from '@stitch/cart/render';
import { extensionSource } from '@stitch/runtime/extensions';
import type { CostumeImage, LoadPayload, PcmClip } from '@stitch/runtime/protocol';
import type { ExportedGame } from './game';

/** Renders every asset to a fresh bitmap. An asset that can't be drawn is skipped with a warning. */
export async function renderCostumes(
  assets: Record<string, Asset>,
  palette: readonly string[],
): Promise<CostumeImage[]> {
  const out = await Promise.all(
    Object.entries(assets).map(async ([id, a]) => {
      try {
        return {
          id,
          name: a.name,
          bitmap: await renderAsset(a, palette),
          pixelArt: isPixelArt(a),
          center: a.center,
        };
      } catch (err) {
        console.warn(`asset ${a.name} could not be drawn`, err);
        return undefined;
      }
    }),
  );
  return out.filter((c): c is CostumeImage => c !== undefined);
}

/** Every sound and song as samples, in cart order. */
export function renderClips(
  sounds: Record<string, Sound>,
  music: Music,
): { sounds: PcmClip[]; songs: PcmClip[] } {
  return {
    sounds: Object.entries(sounds).map(([id, s]) => ({ id, name: s.name, ...soundPcm(s) })),
    songs: Object.entries(music.songs).map(([id, s]) => ({
      id,
      name: s.name,
      rate: MUSIC_RATE,
      samples: renderSong(music, s, sounds),
      loop: s.loop,
    })),
  };
}

export async function gamePayload(game: ExportedGame): Promise<LoadPayload> {
  const p: LoadPayload = {
    code: game.code,
    stage: game.stage,
    sprites: game.sprites,
    backdrops: game.backdrops,
    backdrop: game.backdrop,
    costumes: await renderCostumes(game.assets, game.palette),
    ...renderClips(game.sounds, game.music),
    extensions: game.extensions.map(extensionSource),
  };
  const m = game.map;
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
