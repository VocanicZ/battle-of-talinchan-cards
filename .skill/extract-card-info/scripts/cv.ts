/**
 * Computer-vision primitives for card extraction.
 * Pure functions over a decoded pngjs `PNG`. No AI, no native deps.
 */
import type { PNG } from 'pngjs';

export type RGB = [number, number, number];
/** Pixel rectangle on the card canvas: [x, y, width, height]. */
export type Rect = [number, number, number, number];

export interface FieldMatch {
  value: string;
  confidence: 'high' | 'low';
  score: number;
}

/** Mean RGB over a rectangle. */
export function avgRGB(png: PNG, [x0, y0, w, h]: Rect): RGB {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (png.width * y + x) << 2;
      r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++;
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Euclidean distance between two colors. */
export const dist = (a: RGB, b: RGB): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Nearest-color classify with a confidence margin.
 * Confidence is `high` iff the best swatch is within `maxDist` AND no rival
 * swatch is within `margin` of it.
 */
export function nearestSwatch(
  rgb: RGB,
  palette: Record<string, RGB>,
  maxDist: number,
  margin: number,
): FieldMatch {
  const ranked = Object.entries(palette)
    .map(([label, swatch]) => ({ label, d: dist(rgb, swatch) }))
    .sort((a, b) => a.d - b.d);
  const [best, rival] = ranked;
  const high = best.d <= maxDist && (!rival || rival.d - best.d >= margin);
  // score: 1 at distance 0, 0 at distance maxDist.
  const score = Math.max(0, 1 - best.d / maxDist);
  return { value: best.label, confidence: high ? 'high' : 'low', score };
}
