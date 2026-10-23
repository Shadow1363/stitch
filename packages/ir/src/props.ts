/** Sprite properties exposed as reserved names in the language. */
export const SPRITE_PROPS = {
  x: { writable: true },
  y: { writable: true },
  direction: { writable: true },
  size: { writable: true },
  costume_number: { writable: false },
} as const;

export type SpriteProp = keyof typeof SPRITE_PROPS;

export function isSpriteProp(name: string): name is SpriteProp {
  return Object.hasOwn(SPRITE_PROPS, name);
}
