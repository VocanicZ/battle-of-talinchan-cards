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
 * Resample to NCC_SIZE² and return Sobel gradient magnitude per pixel.
 *
 * Edge intensity is symmetric to contrast direction: a "9" rendered white on
 * purple and the same "9" rendered black on white produce identical edge
 * maps. This is what we want for digits — templates are cropped from cards
 * of varying colours (purple, blue, green, red), and grayscale NCC of the
 * raw pixels mixes shape similarity with bg/fg luminance bias that varies
 * by card colour. Ink-mask NCC also breaks down when the digit dominates the
 * tight template bbox (mode bg picks the digit colour, inverting the mask).
 */
function toEdges(png: PNG): Float64Array {
  const g = toGray(png);
  const out = new Float64Array(NCC_SIZE * NCC_SIZE);
  const at = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= NCC_SIZE ? NCC_SIZE - 1 : x;
    const cy = y < 0 ? 0 : y >= NCC_SIZE ? NCC_SIZE - 1 : y;
    return g[cy * NCC_SIZE + cx];
  };
  for (let y = 0; y < NCC_SIZE; y++) {
    for (let x = 0; x < NCC_SIZE; x++) {
      const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
               - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
               - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      out[y * NCC_SIZE + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

/** NCC of two images' Sobel edge maps — polarity- and colour-invariant. */
export function nccEdges(a: PNG, b: PNG): number {
  const ea = toEdges(a), eb = toEdges(b);
  let ma = 0, mb = 0;
  for (let i = 0; i < ea.length; i++) { ma += ea[i]; mb += eb[i]; }
  ma /= ea.length; mb /= eb.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ea.length; i++) {
    const xa = ea[i] - ma, xb = eb[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/**
 * Match a patch against a labelled template set.
 * Each label may carry multiple exemplar PNGs (e.g. several "3" templates
 * cropped from different cards); the label's score is the MAX over its
 * exemplars. `high` iff the best label's score ≥ `minScore` AND beats the
 * runner-up by `margin`. `mode='edges'` correlates Sobel edge maps instead
 * of raw grayscale — required for digits across cards of different colours.
 */
export function matchBest(
  patch: PNG,
  templates: Record<string, PNG | PNG[]>,
  minScore: number,
  margin: number,
  mode: 'gray' | 'edges' = 'gray',
): FieldMatch {
  const score = mode === 'edges' ? nccEdges : ncc;
  const ranked = Object.entries(templates).map(([label, tpl]) => {
    const list = Array.isArray(tpl) ? tpl : [tpl];
    let s = -Infinity;
    for (const t of list) {
      const v = score(patch, t);
      if (v > s) s = v;
    }
    return { label, s };
  }).sort((a, b) => b.s - a.s);
  const [best, rival] = ranked;
  const high =
    best.s >= minScore && (!rival || best.s - rival.s >= margin);
  return { value: best.label, confidence: high ? 'high' : 'low', score: best.s };
}

/**
 * Most-common quantized colour in the patch — the background estimate.
 *
 * Was averaging the four corners, but that breaks when a corner lands on a
 * box border (e.g. BT01-032's cost-box left edge is pure black, while the
 * background is purple — the mean of two purples and two blacks lands on a
 * grey that's barely separated from the real purple by INK_DIST, so every
 * column reads as "ink" and no digit segments out). Mode over the whole
 * patch is robust because the background occupies the majority of pixels.
 */
function backgroundColor(png: PNG): RGB {
  const counts = new Map<number, number>();
  for (let i = 0; i < png.data.length; i += 4) {
    // Quantize to 5-bit-per-channel buckets so noise/AA pixels group together.
    const key = ((png.data[i] & 0xF8) << 16) | ((png.data[i + 1] & 0xF8) << 8) | (png.data[i + 2] & 0xF8);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let bestKey = 0, bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { bestKey = k; bestN = n; }
  // Return the bucket centre.
  return [
    ((bestKey >> 16) & 0xFF) | 0x04,
    ((bestKey >> 8) & 0xFF) | 0x04,
    (bestKey & 0xFF) | 0x04,
  ];
}

const INK_DIST = 70;       // colour distance from background to count as "ink"
// Card boxes are textured: a thin band of pixels around the digit's bounding
// box reads as 10–15% "ink" purely from rendering noise (gradient + AA). The
// digit columns themselves are 30%+ ink, so a 0.25 threshold cleanly excludes
// the noise band — important because the noise inflates the segment width past
// the template width, which throws off NCC scale matching.
const MIN_INK_FRAC = 0.25;
const BAR_INK_FRAC = 0.7;
const ROW_MIN_INK = 3;

/**
 * Split a number region into digit-sized rectangles.
 *
 * First the crop is trimmed vertically: any row inked across its FULL width
 * is a cost-box / power-box border bleeding into the region; the digit lives
 * above any such border. (Per-segment bar detection breaks down — a solid
 * "1"'s body is full-width inked at its own narrow segmented width.)
 *
 * Then the trimmed strip is split horizontally on contiguous ink columns,
 * yielding one PNG per digit, left to right (0 segments = blank patch).
 */
export function segmentDigits(png: PNG): PNG[] {
  const bg = backgroundColor(png);
  const w = png.width, h = png.height;

  // Per-row ink count on the FULL crop. A row inked across the full width is
  // a box border — find the topmost+bottommost non-border ink rows.
  let yTop = -1, yBot = -1;
  for (let y = 0; y < h; y++) {
    let ink = 0;
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2;
      if (dist([png.data[i], png.data[i + 1], png.data[i + 2]], bg) > INK_DIST) ink++;
    }
    // A row is a "bar" — the cost/power-box border bleeding into the crop —
    // when it's inked far wider than any digit cross-section. Real digit rows
    // never span the full crop width (the crop is at least a couple px wider
    // than the digit on either side); box borders span ≥70% on cards with
    // rounded box corners. Rows with just 1–2 ink pixels are AA noise / box
    // corners and shouldn't be counted as digit content.
    const isBar = ink >= w * BAR_INK_FRAC;
    const hasInk = ink >= ROW_MIN_INK;
    if (hasInk && !isBar) {
      if (yTop < 0) yTop = y;
      yBot = y;
    } else if (isBar && yTop >= 0) {
      break;
    }
  }
  if (yTop < 0) return [];

  // Per-column ink count within the trimmed vertical band.
  const bandH = yBot - yTop + 1;
  const colInk: number[] = [];
  for (let x = 0; x < w; x++) {
    let ink = 0;
    for (let y = yTop; y <= yBot; y++) {
      const i = (w * y + x) << 2;
      if (dist([png.data[i], png.data[i + 1], png.data[i + 2]], bg) > INK_DIST) ink++;
    }
    colInk.push(ink);
  }

  const segments: PNG[] = [];
  let start = -1;
  for (let x = 0; x <= w; x++) {
    const hot = x < w && colInk[x] >= bandH * MIN_INK_FRAC;
    if (hot && start < 0) start = x;
    else if (!hot && start >= 0) {
      segments.push(crop(png, [start, yTop, x - start, bandH]));
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
