/** Sprite properties exposed as reserved names in the language. Each clone has its own. */
export const SPRITE_PROPS = {
  x: { writable: true, type: 'number' },
  y: { writable: true, type: 'number' },
  direction: { writable: true, type: 'number' },
  size: { writable: true, type: 'number' },
  costume_number: { writable: false, type: 'number' },
} as const;

export type SpriteProp = keyof typeof SPRITE_PROPS;

export function isSpriteProp(name: string): name is SpriteProp {
  return Object.hasOwn(SPRITE_PROPS, name);
}
