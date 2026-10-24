/**
 * Stage geometry stored in every cart. Phase 1 ships Scratch defaults; the runtime already
 * honours every field through runtime/src/core/space.ts.
 */
export interface StageSettings {
  width: number;
  height: number;
  /** Where cart (0, 0) sits on the stage. */
  origin: 'center' | 'top-left';
  /** Direction of increasing cart y on screen. */
  yAxis: 'up' | 'down';
  scaling: {
    /** fit: largest scale that fits the viewport; integer: largest whole-number scale. */
    mode: 'fit' | 'integer';
    /** pixel: nearest-neighbour for every texture; smooth: per-costume `pixelArt` decides. */
    filter: 'smooth' | 'pixel';
  };
  background: string;
  /** Most clones alive at once; `create_clone` past it is an error (Scratch: 300, silently). */
  cloneLimit: number;
}

/** Highest clone limit a cart may set. */
export const MAX_CLONE_LIMIT = 10000;

export const DEFAULT_STAGE: Readonly<StageSettings> = Object.freeze({
  width: 480,
  height: 360,
  origin: 'center',
  yAxis: 'up',
  scaling: Object.freeze({ mode: 'fit', filter: 'smooth' }),
  background: '#ffffff',
  cloneLimit: 300,
});

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

const positiveInt = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 8192 ? v : fallback;

/** Fills missing or invalid fields with defaults. */
export function normalizeStage(input: unknown): StageSettings {
  const s = (input && typeof input === 'object' ? input : {}) as Partial<
    Record<keyof StageSettings, unknown>
  >;
  const sc = (s.scaling && typeof s.scaling === 'object' ? s.scaling : {}) as Record<
    string,
    unknown
  >;
  return {
    width: positiveInt(s.width, DEFAULT_STAGE.width),
    height: positiveInt(s.height, DEFAULT_STAGE.height),
    origin: pick(s.origin, ['center', 'top-left'], DEFAULT_STAGE.origin),
    yAxis: pick(s.yAxis, ['up', 'down'], DEFAULT_STAGE.yAxis),
    scaling: {
      mode: pick(sc.mode, ['fit', 'integer'], DEFAULT_STAGE.scaling.mode),
      filter: pick(sc.filter, ['smooth', 'pixel'], DEFAULT_STAGE.scaling.filter),
    },
    background: typeof s.background === 'string' ? s.background : DEFAULT_STAGE.background,
    cloneLimit:
      typeof s.cloneLimit === 'number' &&
      Number.isInteger(s.cloneLimit) &&
      s.cloneLimit >= 0 &&
      s.cloneLimit <= MAX_CLONE_LIMIT
        ? s.cloneLimit
        : DEFAULT_STAGE.cloneLimit,
  };
}
