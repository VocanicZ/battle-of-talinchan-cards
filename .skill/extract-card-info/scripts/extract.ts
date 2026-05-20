/**
 * The card-extraction engine. Given a print code, reads the card image and
 * extracts its properties with zero AI — region colour sampling, NCC template
 * matching, digit segmentation. Every field carries a confidence flag.
 *
 * Usage (single card): npx tsx .skill/extract-card-info/scripts/extract.ts BT01-001
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';
import { imagesDir, skillDir } from './paths.ts';
import { avgRGB, crop, hasCircle, matchBest, nearestSwatch, segmentDigits, type Rect, type RGB } from './cv.ts';

const regions = JSON.parse(
  readFileSync(join(skillDir, 'scripts/regions.json'), 'utf8'),
) as Record<string, Rect>;

// Rarity / promo suffixes that mark a variant of a base print.
const VARIANT_SUFFIX = /-(SCR|UR|CBR|PR\d?|SR|R|C|USEC|PROMO)$/i;

/** Strip a variant suffix to the base print code. */
export function resolveBasePrint(print: string): string {
  return print.replace(VARIANT_SUFFIX, '');
}

const templatesDir = join(skillDir, 'templates');
const TPL_MIN_SCORE = 0.55, TPL_MARGIN = 0.08;
// ex stamps need a stricter gate: a no-stamp ex region still correlates with
// the stamp templates around 0.6, while a real stamp scores >=0.77 on its own
// template. 0.72 cleanly separates "stamp present" from "bare card art".
const EX_MIN_SCORE = 0.72;

/** Load every template PNG for one field into a label→PNG map. */
function loadTemplates(field: string): Record<string, PNG[]> {
  const dir = join(templatesDir, field);
  if (!existsSync(dir)) return {};
  const out: Record<string, PNG[]> = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.png'))) {
    const base = file.replace(/\.png$/, '');
    const isDigit = field === 'digit' || field === 'powerDigit' || field === 'circleDigit';
    // Multi-exemplar naming: '{label}-{print}.png' where print is one or two
    // dash-segments (e.g. 'BT01-005', 'PRMO-005'). The label is everything
    // before the FIRST dash and doesn't contain dashes itself.
    const head = base.split('-')[0];
    const label = isDigit ? head : Buffer.from(head, 'base64url').toString('utf8');
    (out[label] ??= []).push(PNG.sync.read(readFileSync(join(dir, file))));
  }
  return out;
}

const SYMBOL_TPL = loadTemplates('symbol');
const SUBTYPE_TPL = loadTemplates('subtype');
const EX_TPL = loadTemplates('ex');
const DIGIT_TPL = loadTemplates('digit');
const POWER_DIGIT_TPL = loadTemplates('powerDigit');
// customLimit digits inside the override circle don't match the cost-box
// digit templates (different stroke weight, different background structure).
// circleDigit templates are full 92×92 circle crops — one per known cl value
// — matched against the test card's circle crop directly.
const CIRCLE_DIGIT_TPL = loadTemplates('circleDigit');
const DIGIT_MIN_SCORE = 0.5;
const DIGIT_MARGIN = 0.05;
// segmentDigits occasionally yields a thin noise sliver beside a real glyph
// (anti-aliasing on a box edge). Anything narrower than this is not a digit.
const MIN_DIGIT_W = 5;

/**
 * Read a 1–3 digit number from a region: segment into digit columns, match
 * each against the 0–9 glyph templates, concatenate. Returns null if no
 * digits segment out.
 *
 * The `templates` parameter lets callers select the appropriate template set:
 * - DIGIT_TPL for white-on-dark regions (costNum, circle)
 * - POWER_DIGIT_TPL for black-on-white regions (powerNum inner whitebox)
 */
function readNumber(
  png: PNG,
  rect: Rect,
  templates: Record<string, PNG[]> = DIGIT_TPL,
): FieldResult | null {
  let segs = segmentDigits(crop(png, rect));
  // drop noise slivers; if every segment is thin, keep the widest one
  const wide = segs.filter((s) => s.width >= MIN_DIGIT_W);
  segs = (wide.length ? wide : segs.slice().sort((a, b) => b.width - a.width).slice(0, 1))
    .slice(0, 3);
  if (segs.length === 0) return null;
  let digits = '';
  let minScore = 1;
  // Pad narrow segs AND templates so both have roughly the same aspect ratio
  // when resampled to NCC_SIZE². Without padding, a 3×25 "1" stretches to fill
  // the full 32×32 frame and correlates poorly with wider templates.
  const paddedTpls: Record<string, PNG[]> = {};
  for (const [label, list] of Object.entries(templates)) {
    paddedTpls[label] = list.map(padSegment);
  }
  for (const seg of segs) {
    const padded = padSegment(seg);
    const m = matchBest(padded, paddedTpls, DIGIT_MIN_SCORE, DIGIT_MARGIN, 'gray');
    digits += m.value;
    minScore = Math.min(minScore, m.score);
  }
  const value = Number(digits);
  return {
    value: Number.isNaN(value) ? null : value,
    confidence: minScore >= DIGIT_MIN_SCORE ? 'high' : 'low',
    score: minScore,
  };
}

export interface FieldResult {
  value: string | number | null;
  confidence: 'high' | 'low';
  score: number;
}
export interface CardResult {
  print: string;
  source: 'image' | 'inherited';
  fields: Record<string, FieldResult>;
}

/**
 * Border colour → card type.
 * Sampled from the left-edge border (regions.border) — chosen because the
 * top-right override circle never occludes the left edge, so the type reads
 * correctly even on circle cards. Calibrated against Avatar (dark red), Magic
 * (dark blue), Construct (golden yellow), Life (grey).
 */
const TYPE_PALETTE: Record<string, RGB> = {
  Avatar:    [131, 27, 25],
  Magic:     [23, 76, 124],
  Construct: [223, 186, 35],
  Life:      [95, 95, 95],
};

/**
 * COST-box colour → card Color enum value.
 * Calibrated by sampling BT01 red Avatars, BT01 blue Avatars, BT01 purple Avatars.
 */
const COLOR_PALETTE: Record<string, RGB> = {
  แดง:  [217, 68, 71],
  ฟ้า:  [93, 128, 189],
  ม่วง: [109, 78, 130],
  เขียว: [60, 155, 90],
};

/**
 * Diamond-interior colour → gemColor.
 * Calibrated by averaging the centre pixels INSIDE each detected diamond run
 * on cards with known gemColor (BT03-006 Red, BT04-011/012 Blue, BT08-031/037
 * Green, BT08-024/CC01-011 Purple). The gem icons are filled with the card's
 * colour; an empty/silver gem reads near-gray (~140,140,140) and is classified
 * as ไม่มีสี by the gray-channel-spread check below, not by the palette.
 */
const GEM_PALETTE: Record<string, RGB> = {
  แดง:  [130, 60, 60],
  ฟ้า:  [80, 100, 125],
  เขียว: [70, 115, 90],
  ม่วง: [80, 70, 100],
};
// Max(R,G,B) - Min(R,G,B) below this -> empty/silver gem -> ไม่มีสี.
const GEM_GRAY_SPREAD = 15;

const TYPE_MAX_DIST = 80;
const TYPE_MARGIN = 25;
const COLOR_MAX_DIST = 80;
const COLOR_MARGIN = 20;

/**
 * Gem detection constants.
 * The gem strip encodes gem count (0–4) as diamond icons in its left portion.
 * An angled banner decoration crosses the upper part of the strip, so detection
 * scans only the lower band of the strip to isolate the diamonds from the
 * banner. The right ~40% of the strip is the solid colour bar (gemColorBar) —
 * scanning is restricted to the left 60% to avoid mistaking the bar for a gem.
 *
 * Detection counts contiguous "dark" column runs (a column is dark when ≥2 of
 * its band pixels are below the brightness threshold; a run is a gem when ≥5
 * such columns are adjacent). This is robust to:
 *   - colour-filled diamonds (BT01-022/027: dark stroke + dark fill)
 *   - silver/white-filled diamonds (BT01-032: dark stroke, light fill — far
 *     less dark area, but still a continuous dark column run from the outline)
 *   - small horizontal drift between cards (~8 px between BT01-022 and BT01-032)
 *
 * Verified across BT01 gem counts 0/1/2/3/4.
 */
const GEM_DARK_THRESH = 100;     // pixel brightness threshold for "dark"
const GEM_BAND_TOP = 0.45;       // scan the strip's lower 55% (skip the banner)
const GEM_SCAN_FRAC = 0.6;       // scan only the strip's left 60% (skip colour bar)
const GEM_COL_MIN_DARK = 2;      // a column counts as dark when ≥ this many band pixels are dark
const GEM_MIN_RUN = 5;           // a diamond is a dark-column run ≥ this wide

/** Load a 388×528 card image, or throw. */
function loadCard(print: string): PNG {
  const png = PNG.sync.read(readFileSync(join(imagesDir, `${print}.png`)));
  if (png.width !== 388 || png.height !== 528) {
    throw new Error(`${print}: non-standard ${png.width}×${png.height}`);
  }
  return png;
}

/**
 * Detect gems by scanning the gem strip for contiguous dark-column runs.
 *
 * The plan's seed approach (per-slot colour averaged against a sampled
 * header-grey baseline) was superseded: the averaged baseline was unreliable
 * across card colours. A second approach (fixed slot offsets + dark-pixel
 * fraction) also failed — on silver/white-filled diamonds the fraction drops
 * below the threshold, and small layout drift between cards (~8 px) shifts
 * gems out of their slots. Blob counting is robust to both: every diamond,
 * whether colour- or silver-filled, leaves a contiguous run of columns with
 * dark outline pixels.
 *
 * The two halves use orthogonal strategies on purpose: gem counting reads the
 * dark icons on the left; gemColor reads the solid colour bar on the right
 * (regions.gemColorBar), which is always filled with the card's colour —
 * EXCEPT when the customLimit override circle covers it, in which case
 * gemColor is reported as low-confidence.
 */
function readGems(png: PNG): { gem: FieldResult; gemColor: FieldResult } {
  const [sx, sy, sw, sh] = regions.gemStrip;
  const yTop = sy + Math.round(sh * GEM_BAND_TOP);
  const yBot = sy + sh;
  const xEnd = sx + Math.round(sw * GEM_SCAN_FRAC);

  // Per-column dark-pixel count across the scan band.
  const cols: number[] = [];
  for (let x = sx; x < xEnd; x++) {
    let dark = 0;
    for (let y = yTop; y < yBot; y++) {
      const i = (png.width * y + x) << 2;
      const brightness = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
      if (brightness < GEM_DARK_THRESH) dark++;
    }
    cols.push(dark);
  }

  // Count runs of consecutive "dark" columns at least GEM_MIN_RUN wide;
  // remember each run's x extent for gemColor sampling.
  const runs: { x0: number; x1: number }[] = [];
  let inRun = false, runStart = 0;
  for (let i = 0; i < cols.length; i++) {
    const hot = cols[i] >= GEM_COL_MIN_DARK;
    if (hot && !inRun) { inRun = true; runStart = i; }
    else if (!hot && inRun) {
      inRun = false;
      if (i - runStart >= GEM_MIN_RUN) runs.push({ x0: sx + runStart, x1: sx + i });
    }
  }
  if (inRun && cols.length - runStart >= GEM_MIN_RUN) {
    runs.push({ x0: sx + runStart, x1: sx + cols.length });
  }
  const filled = runs.length;

  // gemColor: average the interior of the diamond icons themselves. The fill
  // colour is the card's gemColor; empty/silver gems read near-gray and map to
  // ไม่มีสี via the channel-spread check. The icons sit on the strip's left
  // half (x ≤ ~190), so the customLimit circle on the right cannot occlude
  // them — no `occluded` path needed.
  let gemColor: FieldResult;
  if (filled === 0) {
    gemColor = { value: 'ไม่มีสี', confidence: 'high', score: 1 };
  } else {
    let R = 0, G = 0, B = 0, n = 0;
    const cy0 = sy + Math.round(sh * 0.30);
    const cy1 = sy + Math.round(sh * 0.85);
    for (const r of runs) {
      const cx0 = Math.round(r.x0 + (r.x1 - r.x0) * 0.25);
      const cx1 = Math.round(r.x0 + (r.x1 - r.x0) * 0.75);
      for (let y = cy0; y < cy1; y++) {
        for (let x = cx0; x < cx1; x++) {
          const i = (png.width * y + x) << 2;
          R += png.data[i]; G += png.data[i + 1]; B += png.data[i + 2];
          n++;
        }
      }
    }
    const rgb: RGB = [Math.round(R / n), Math.round(G / n), Math.round(B / n)];
    const spread = Math.max(...rgb) - Math.min(...rgb);
    gemColor = spread < GEM_GRAY_SPREAD
      ? { value: 'ไม่มีสี', confidence: 'high', score: 1 }
      : nearestSwatch(rgb, GEM_PALETTE, COLOR_MAX_DIST, COLOR_MARGIN);
  }

  return {
    gem: { value: filled, confidence: 'high', score: 1 },
    gemColor,
  };
}

/**
 * Magic card "cost" = number of diamond icons in the strip right of the
 * subtype glyph. Same blob-counter as readGems but on a different region.
 */
function readMagicCost(png: PNG): FieldResult {
  const [sx, sy, sw, sh] = regions.magicCostStrip;
  const yTop = sy + Math.round(sh * GEM_BAND_TOP);
  const yBot = sy + sh;
  let filled = 0, inRun = false, runStart = 0;
  for (let x = sx; x <= sx + sw; x++) {
    let dark = 0;
    if (x < sx + sw) {
      for (let y = yTop; y < yBot; y++) {
        const i = (png.width * y + x) << 2;
        const b = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
        if (b < GEM_DARK_THRESH) dark++;
      }
    }
    const hot = x < sx + sw && dark >= GEM_COL_MIN_DARK;
    if (hot && !inRun) { inRun = true; runStart = x; }
    else if (!hot && inRun) {
      inRun = false;
      if (x - runStart >= GEM_MIN_RUN) filled++;
    }
  }
  return { value: filled, confidence: 'high', score: 1 };
}

/**
 * Pad a digit segment horizontally with background pixels so its width is at
 * least PAD_MIN_W. Narrow "1" digits otherwise stretch to fill the entire
 * NCC frame on resample and stop correlating with wider templates.
 */
const PAD_MIN_W = 6;
function padSegment(seg: PNG): PNG {
  if (seg.width >= PAD_MIN_W) return seg;
  const newW = PAD_MIN_W;
  const out = new PNG({ width: newW, height: seg.height });
  // Sample the top-right corner — likely past the digit's vertical stroke.
  const bgI = ((seg.width - 1)) << 2;
  let bgR = seg.data[bgI], bgG = seg.data[bgI + 1], bgB = seg.data[bgI + 2];
  // If that corner looks like ink, use top-left.
  if (bgR < 200 && bgG < 200 && bgB < 200) {
    bgR = seg.data[0]; bgG = seg.data[1]; bgB = seg.data[2];
  }
  // Fill with bg
  for (let y = 0; y < seg.height; y++) {
    for (let x = 0; x < newW; x++) {
      const i = (newW * y + x) << 2;
      out.data[i] = bgR; out.data[i + 1] = bgG; out.data[i + 2] = bgB; out.data[i + 3] = 255;
    }
  }
  // Copy seg centered.
  const ox = Math.floor((newW - seg.width) / 2);
  for (let y = 0; y < seg.height; y++) {
    for (let x = 0; x < seg.width; x++) {
      const si = (seg.width * y + x) << 2;
      const di = (newW * y + (ox + x)) << 2;
      out.data[di] = seg.data[si];
      out.data[di + 1] = seg.data[si + 1];
      out.data[di + 2] = seg.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

/** Extract every field from a single card image. */
export function extractCard(print: string): CardResult {
  const png = loadCard(print);
  const fields: Record<string, FieldResult> = {};

  // type — border colour
  const typeM = nearestSwatch(
    avgRGB(png, regions.border), TYPE_PALETTE, TYPE_MAX_DIST, TYPE_MARGIN,
  );
  fields.type = typeM;
  const type = typeM.value;

  // override circle occludes the top-right symbol + ex + gemColorBar regions
  const occluded = hasCircle(png, regions.circle);

  // color — COST box background (Avatar/Construct only)
  if (type === 'Avatar' || type === 'Construct') {
    fields.color = nearestSwatch(
      avgRGB(png, regions.costBox), COLOR_PALETTE, COLOR_MAX_DIST, COLOR_MARGIN,
    );
    const g = readGems(png);
    fields.gem = g.gem;
    fields.gemColor = g.gemColor;
  }

  // symbol — race icon, top-right (PlayableCard: Avatar/Magic/Construct)
  // When occluded, always mark unknown regardless of detected type (the circle
  // can corrupt the border colour sample, leading to type misdetection).
  if (occluded) {
    fields.symbol = { value: 'unknown', confidence: 'low', score: 0 };
  } else if (type !== 'Life') {
    // Symbol icons are rendered in the card's colour (purple for จอมเวทย์,
    // for example) — grayscale NCC was matching icons that shared a colour
    // (จอมเวทย์ ↔ สัตว์). Edge correlation is colour-invariant.
    fields.symbol = matchBest(
      crop(png, regions.symbol), SYMBOL_TPL, TPL_MIN_SCORE, TPL_MARGIN, 'edges',
    );
  }

  // subtype — Magic only, COST-box position
  if (type === 'Magic') {
    fields.subtype = matchBest(
      crop(png, regions.subtype), SUBTYPE_TPL, TPL_MIN_SCORE, TPL_MARGIN,
    );
  }

  // ex — stamp under the race icon. Margin 0: a real stamp's own template
  // dominates, so only the EX_MIN_SCORE presence gate matters.
  if (occluded) {
    fields.ex = { value: 'unknown', confidence: 'low', score: 0 };
  } else {
    const m = matchBest(crop(png, regions.ex), EX_TPL, EX_MIN_SCORE, 0);
    // best NCC below EX_MIN_SCORE → no stamp present
    fields.ex = m.confidence === 'high'
      ? m
      : { value: null, confidence: 'high', score: m.score };
  }

  // cost — Avatar/Construct render it as a digit in the COST box; Magic
  // renders it as a count of diamond icons in a strip right of the subtype
  // icon (the COST box on Magic cards holds the subtype glyph, not a digit).
  if (type === 'Avatar' || type === 'Construct') {
    const c = readNumber(png, regions.costNum);
    if (c) fields.cost = c;
  } else if (type === 'Magic') {
    fields.cost = readMagicCost(png);
  }
  // power — POWER box number (Avatar/Construct); uses the inner whitebox region
  // which has black digits on white background, requiring POWER_DIGIT_TPL.
  if (type === 'Avatar' || type === 'Construct') {
    const p = readNumber(png, regions.powerNum, POWER_DIGIT_TPL);
    if (p) fields.power = p;
  }
  // customLimit — only when the override circle is present. Use whole-crop
  // template matching against per-cl exemplar circles (CIRCLE_DIGIT_TPL).
  // Segmenting individual digits inside the circle fails because the red
  // ring's anti-aliased pixels connect to the digit stroke and the digits
  // are rendered with a much heavier weight than the cost-box templates.
  if (occluded) {
    const cir = crop(png, regions.circle);
    const m = matchBest(cir, CIRCLE_DIGIT_TPL, 0.5, 0.05);
    const num = Number(m.value);
    fields.customLimit = {
      value: Number.isNaN(num) ? null : num,
      confidence: m.confidence,
      score: m.score,
    };
  }

  return { print, source: 'image', fields };
}

/** OCR the Thai name plate. Tesseract confidence (0–100) maps to high/low. */
async function readName(print: string): Promise<FieldResult> {
  const png = loadCard(print);
  const plate = crop(png, regions.namePlate);
  const worker = await createWorker('tha');
  try {
    const { data } = await worker.recognize(PNG.sync.write(plate));
    const text = data.text.trim().replace(/\s+/g, ' ');
    return {
      value: text || null,
      confidence: data.confidence >= 70 ? 'high' : 'low',
      score: data.confidence / 100,
    };
  } finally {
    await worker.terminate();
  }
}

/** extractCard + the async OCR `name` field. */
export async function extractCardFull(print: string): Promise<CardResult> {
  const base = resolveBasePrint(print);
  if (base !== print && existsSync(join(imagesDir, `${base}.png`))) {
    const inherited = await extractCardFull(base);
    return { print, source: 'inherited', fields: inherited.fields };
  }
  const result = extractCard(print);
  result.fields.name = await readName(print);
  return result;
}

// CLI. Compare realpaths because `.claude/skills` is a symlink to `.skill`:
// import.meta.url resolves through the symlink, but process.argv[1] does not.
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const print = process.argv[2];
  if (!print) throw new Error('usage: extract.ts <print-code>');
  extractCardFull(print).then((r) => console.log(JSON.stringify(r, null, 2)));
}
