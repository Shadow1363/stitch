/**
 * What an exported player runs: the cart's sources minus editor state, plus the compiled
 * program. Assets and audio stay sources and are rendered in the player, exactly as the editor
 * renders them for its stage, so an export can't drift from what the author saw.
 */
import type {
  Asset,
  Cart,
  CartExtension,
  Music,
  Sound,
  SpriteInit,
  StageSettings,
  TileMap,
} from '@stitch/cart';

export const GAME_FORMAT = 'stitch-game' as const;
/** Bump when the shape changes; a player refuses games it doesn't know. */
export const GAME_VERSION = 2 as const;

export interface ExportedGame {
  format: typeof GAME_FORMAT;
  v: typeof GAME_VERSION;
  title: string;
  author?: string;
  /** Compiled program: the body of `new Function('rt', code)`. */
  code: string;
  stage: StageSettings;
  sprites: SpriteInit[];
  palette: string[];
  assets: Record<string, Asset>;
  map?: TileMap;
  sounds: Record<string, Sound>;
  music: Music;
  extensions: CartExtension[];
}

/**
 * The game for `cart`, with `code` compiled from its project. Leaves out the IR (the code
 * replaces it) and editor state. Secrets and host permissions were never cart data.
 */
export function gameFromCart(cart: Cart, code: string): ExportedGame {
  return {
    format: GAME_FORMAT,
    v: GAME_VERSION,
    title: cart.meta.title,
    ...(cart.meta.author ? { author: cart.meta.author } : {}),
    code,
    stage: cart.stage,
    sprites: cart.sprites,
    palette: cart.palette,
    assets: cart.assets,
    ...(cart.map ? { map: cart.map } : {}),
    sounds: cart.sounds,
    music: cart.music,
    extensions: cart.extensions,
  };
}

/** A filename-safe slug of the title. */
export function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'game'
  );
}
