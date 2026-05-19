/**
 * Computer-vision primitives for card extraction.
 * Pure functions over a decoded pngjs `PNG`. No AI, no native deps.
 */
import { PNG } from 'pngjs';

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

/** Extract a rectangular sub-image. */
export function crop(png: PNG, [x0, y0, w, h]: Rect): PNG {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (png.width * (y0 + y) + (x0 + x)) << 2;
      const dst = (w * y + x) << 2;
      out.data[dst] = png.data[src];
      out.data[dst + 1] = png.data[src + 1];
      out.data[dst + 2] = png.data[src + 2];
      out.data[dst + 3] = 255;
    }
  }
  return out;
}

const NCC_SIZE = 32;

/** Nearest-neighbour resample to NCC_SIZE², returned as grayscale 0–255. */
function toGray(png: PNG): Float64Array {
  const g = new Float64Array(NCC_SIZE * NCC_SIZE);
  for (let y = 0; y < NCC_SIZE; y++) {
    for (let x = 0; x < NCC_SIZE; x++) {
      const sx = Math.floor((x / NCC_SIZE) * png.width);
      const sy = Math.floor((y / NCC_SIZE) * png.height);
      const i = (png.width * sy + sx) << 2;
      g[y * NCC_SIZE + x] =
        0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
    }
  }
  return g;
}

/**
 * Normalized cross-correlation of two images, in [-1, 1].
 * Both are resampled to a common size; flat (zero-variance) inputs give 0.
 */
export function ncc(a: PNG, b: PNG): number {
  const ga = toGray(a), gb = toGray(b);
  let ma = 0, mb = 0;
  for (let i = 0; i < ga.length; i++) { ma += ga[i]; mb += gb[i]; }
  ma /= ga.length; mb /= gb.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ga.length; i++) {
    const xa = ga[i] - ma, xb = gb[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/**
 * Match a patch against a labelled template set.
 * `high` iff the best NCC ≥ `minScore` AND beats the runner-up by `margin`.
 */
export function matchBest(
  patch: PNG,
  templates: Record<string, PNG>,
  minScore: number,
  margin: number,
): FieldMatch {
  const ranked = Object.entries(templates)
    .map(([label, tpl]) => ({ label, s: ncc(patch, tpl) }))
    .sort((a, b) => b.s - a.s);
  const [best, rival] = ranked;
  const high =
    best.s >= minScore && (!rival || best.s - rival.s >= margin);
  return { value: best.label, confidence: high ? 'high' : 'low', score: best.s };
}

/** Mean color of the patch's four corner pixels — the background estimate. */
function cornerBg(png: PNG): RGB {
  const w = png.width, h = png.height;
  const corners: RGB[] = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(
    ([x, y]) => {
      const i = (w * y + x) << 2;
      return [png.data[i], png.data[i + 1], png.data[i + 2]] as RGB;
    },
  );
  return [
    Math.round(corners.reduce((s, c) => s + c[0], 0) / 4),
    Math.round(corners.reduce((s, c) => s + c[1], 0) / 4),
    Math.round(corners.reduce((s, c) => s + c[2], 0) / 4),
  ];
}

const INK_DIST = 70;       // colour distance from background to count as "ink"
const MIN_INK_FRAC = 0.12; // fraction of a column that must be ink

/**
 * Split a number region into digit-sized columns.
 * A column is "ink" if enough of its pixels differ from the background;
 * contiguous ink columns form one digit. Returns each digit cropped, left
 * to right (0 segments = blank patch).
 */
export function segmentDigits(png: PNG): PNG[] {
  const bg = cornerBg(png);
  const inkCol: boolean[] = [];
  for (let x = 0; x < png.width; x++) {
    let ink = 0;
    for (let y = 0; y < png.height; y++) {
      const i = (png.width * y + x) << 2;
      const d = dist([png.data[i], png.data[i + 1], png.data[i + 2]], bg);
      if (d > INK_DIST) ink++;
    }
    inkCol.push(ink >= png.height * MIN_INK_FRAC);
  }
  const segments: PNG[] = [];
  let start = -1;
  for (let x = 0; x <= inkCol.length; x++) {
    if (inkCol[x] && start < 0) start = x;
    else if (!inkCol[x] && start >= 0) {
      segments.push(crop(png, [start, 0, x - start, png.height]));
      start = -1;
    }
  }
  return segments;
}

const CIRCLE_RED_FRAC = 0.18; // min fraction of strong-red pixels

/** True if a strongly-red pixel cluster (the override circle ring) fills the region. */
export function hasCircle(png: PNG, [x0, y0, w, h]: Rect): boolean {
  let red = 0, n = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (png.width * y + x) << 2;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      if (r > 140 && g < 95 && b < 95) red++;
      n++;
    }
  }
  return n > 0 && red / n >= CIRCLE_RED_FRAC;
}
