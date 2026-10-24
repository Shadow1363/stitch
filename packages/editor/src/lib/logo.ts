/**
 * The Stitch logo: an "S" sewn in a running stitch on a brand-blue tile. The dashes read as
 * thread through fabric at large sizes and still make an "S" at 16×16. Pure strings, so
 * `scripts/icons.ts` renders the PNG icons from the same source as the editor's header.
 */

/** The brand blue (`--brand` in app.css). */
export const BRAND = '#1f5be1';
export const BRAND_INK = '#ffffff';

export interface LogoOptions {
  /** One colour (default `currentColor`): the stitches are cut out of the tile. */
  mono?: boolean;
  /** Full-bleed square with the mark inside the maskable safe zone (centre 80%). */
  maskable?: boolean;
  /** Tile colour; the stitches use `ink`. */
  color?: string;
  ink?: string;
}

// On a 64-unit grid. Round caps turn each dash into a stitch. The path is 90.38 long, so with
// width 6 the dash pattern fits exactly six stitches (12.7 visible) and five gaps (4.0 visible),
// starting and ending on a stitch.
const S_PATH =
  'M44.5 18.5C39 12.5 20.5 13 20.5 23.5C20.5 33 43.5 31 43.5 41.5C43.5 51.5 25 52.5 19.5 45.5';
const STROKE = 'stroke-width="6" stroke-linecap="round" stroke-dasharray="6.74 9.98" fill="none"';

export function logoSvg(opts: LogoOptions = {}): string {
  const { mono = false, maskable = false } = opts;
  const color = opts.color ?? (mono ? 'currentColor' : BRAND);
  const ink = opts.ink ?? BRAND_INK;
  // Maskable icons get cropped to a circle or squircle, so the tile fills the canvas and the
  // "S" shrinks into the safe zone.
  const mark = maskable ? 'transform="translate(32 32) scale(0.78) translate(-32 -32)"' : '';
  const tile = maskable
    ? `<rect width="64" height="64" fill="${color}"/>`
    : `<rect width="64" height="64" rx="15" fill="${color}"/>`;
  const head =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Stitch">';
  if (mono)
    return (
      `${head}<mask id="stitch-cut"><rect width="64" height="64" fill="#fff"/>` +
      `<path ${mark} d="${S_PATH}" stroke="#000" ${STROKE}/></mask>` +
      tile.replace('/>', ' mask="url(#stitch-cut)"/>') +
      '</svg>'
    );
  return `${head}${tile}<path ${mark} d="${S_PATH}" stroke="${ink}" ${STROKE}/></svg>`;
}

/** The logo as an image, for canvas drawing (cover art). */
export function logoImage(opts?: LogoOptions): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg(opts))}`;
  return img.decode().then(() => img);
}
