/**
 * The card-extraction engine. Given a print code, reads the card image and
 * extracts its properties with zero AI — region colour sampling, NCC template
 * matching, digit segmentation. Every field carries a confidence flag.
 *
 * Usage (single card): npx tsx .skill/extract-card-info/scripts/extract.ts BT01-001
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
function loadTemplates(field: string): Record<string, PNG> {
  const dir = join(templatesDir, field);
  if (!existsSync(dir)) return {};
  const out: Record<string, PNG> = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.png'))) {
    const base = file.replace(/\.png$/, '');
    // icon templates are base64url-encoded Thai/symbol values; digits are plain
    const label = (field === 'digit' || field === 'powerDigit')
      ? base
      : Buffer.from(base, 'base64url').toString('utf8');
    out[label] = PNG.sync.read(readFileSync(join(dir, file)));
  }
  return out;
}

const SYMBOL_TPL = loadTemplates('symbol');
const SUBTYPE_TPL = loadTemplates('subtype');
const EX_TPL = loadTemplates('ex');
const DIGIT_TPL = loadTemplates('digit');
const POWER_DIGIT_TPL = loadTemplates('powerDigit');
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
  templates: Record<string, PNG> = DIGIT_TPL,
): FieldResult | null {
  let segs = segmentDigits(crop(png, rect));
  // drop noise slivers; if every segment is thin, keep the widest one
  const wide = segs.filter((s) => s.width >= MIN_DIGIT_W);
  segs = (wide.length ? wide : segs.slice().sort((a, b) => b.width - a.width).slice(0, 1))
    .slice(0, 3);
  if (segs.length === 0) return null;
  let digits = '';
  let minScore = 1;
  for (const seg of segs) {
    const m = matchBest(seg, templates, DIGIT_MIN_SCORE, DIGIT_MARGIN);
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
 * Gem strip right-side colour → gemColor.
 * The right portion of the gem strip (x=199, w=56) is always filled with the
 * card's colour.
 */
const GEM_PALETTE: Record<string, RGB> = {
  แดง:  [217, 68, 71],
  ฟ้า:  [93, 128, 189],
  ม่วง: [109, 78, 130],
  ดำ:   [40, 40, 40],
};

const TYPE_MAX_DIST = 80;
const TYPE_MARGIN = 25;
const COLOR_MAX_DIST = 80;
const COLOR_MARGIN = 20;

/**
 * Gem slot detection constants.
 * The gem strip encodes gem count (0–4) as dark diamond icons in its left
 * portion. The four diamonds sit at progressively wider offsets; an angled
 * banner decoration crosses the upper part of the strip, so detection scans
 * only the lower band of the strip to isolate the diamonds from the banner.
 * A slot is "filled" when ≥12% of its lower-band pixels are dark.
 *
 * Calibrated across BT01–BT03: empty slots read 0–7%, filled diamonds 15–31%.
 */
const GEM_SLOT_OFFSETS = [0, 20, 46, 68]; // diamond x-offsets from gemStrip[0]
const GEM_SLOT_W = 12;                    // px wide per slot sample
const GEM_DARK_THRESH = 100;              // pixel brightness threshold for "dark"
const GEM_FILLED_FRAC = 0.12;             // min dark fraction to count a slot as filled
const GEM_BAND_TOP = 0.45;                // scan the strip's lower 55% (skip the banner)

/** Load a 388×528 card image, or throw. */
function loadCard(print: string): PNG {
  const png = PNG.sync.read(readFileSync(join(imagesDir, `${print}.png`)));
  if (png.width !== 388 || png.height !== 528) {
    throw new Error(`${print}: non-standard ${png.width}×${png.height}`);
  }
  return png;
}

/**
 * Count filled gem slots by detecting dark-pixel groups in the left portion of
 * the gem strip. Each filled slot corresponds to one gem on the card.
 *
 * The plan's seed approach (per-slot colour averaged against a sampled
 * header-grey baseline) was superseded: the averaged baseline was unreliable
 * across card colours. Dark-pixel fraction is card-colour-agnostic — gem icons
 * are dark line-art regardless of the card's palette.
 *
 * The two halves use orthogonal strategies on purpose: slot counting reads the
 * dark icons on the left; gemColor reads the solid colour bar on the right
 * (regions.gemColorBar), which is always filled with the card's colour.
 */
function readGems(png: PNG): { gem: FieldResult; gemColor: FieldResult } {
  const [sx, sy, , sh] = regions.gemStrip;

  const yTop = sy + Math.round(sh * GEM_BAND_TOP);
  const yBot = sy + sh;
  let filled = 0;
  for (const off of GEM_SLOT_OFFSETS) {
    const x0 = sx + off;
    let dark = 0, total = 0;
    for (let x = x0; x < x0 + GEM_SLOT_W; x++) {
      for (let y = yTop; y < yBot; y++) {
        const i = (png.width * y + x) << 2;
        const brightness = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
        if (brightness < GEM_DARK_THRESH) dark++;
        total++;
      }
    }
    if (dark / total >= GEM_FILLED_FRAC) filled++;
  }

  // Gem colour from the solid colour bar on the right of the strip.
  const gemColorRgb = avgRGB(png, regions.gemColorBar);
  const gemColorM = nearestSwatch(gemColorRgb, GEM_PALETTE, COLOR_MAX_DIST, COLOR_MARGIN);

  return {
    gem: { value: filled, confidence: 'high', score: 1 },
    gemColor: {
      value: filled > 0 ? gemColorM.value : 'ไม่มีสี',
      confidence: filled > 0 ? gemColorM.confidence : 'high',
      score: gemColorM.score,
    },
  };
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

  // color — COST box background (Avatar/Construct only)
  if (type === 'Avatar' || type === 'Construct') {
    fields.color = nearestSwatch(
      avgRGB(png, regions.costBox), COLOR_PALETTE, COLOR_MAX_DIST, COLOR_MARGIN,
    );
    const g = readGems(png);
    fields.gem = g.gem;
    fields.gemColor = g.gemColor;
  }

  // override circle occludes the top-right symbol + ex icons
  const occluded = hasCircle(png, regions.circle);

  // symbol — race icon, top-right (PlayableCard: Avatar/Magic/Construct)
  // When occluded, always mark unknown regardless of detected type (the circle
  // can corrupt the border colour sample, leading to type misdetection).
  if (occluded) {
    fields.symbol = { value: 'unknown', confidence: 'low', score: 0 };
  } else if (type !== 'Life') {
    fields.symbol = matchBest(
      crop(png, regions.symbol), SYMBOL_TPL, TPL_MIN_SCORE, TPL_MARGIN,
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

  // cost — COST box number (PlayableCard)
  if (type !== 'Life') {
    const c = readNumber(png, regions.costNum);
    if (c) fields.cost = c;
  }
  // power — POWER box number (Avatar/Construct); uses the inner whitebox region
  // which has black digits on white background, requiring POWER_DIGIT_TPL.
  if (type === 'Avatar' || type === 'Construct') {
    const p = readNumber(png, regions.powerNum, POWER_DIGIT_TPL);
    if (p) fields.power = p;
  }
  // customLimit — only when the override circle is present.
  // NOTE: the circle region yields inherently low NCC scores because its
  // curved background produces noisy crops that don't cleanly match the
  // white-on-dark digit templates. Consequently, customLimit confidence is
  // essentially always 'low' even when the extracted value is correct.
  if (occluded) {
    const cl = readNumber(png, regions.circle);
    if (cl) fields.customLimit = cl;
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

// CLI
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const print = process.argv[2];
  if (!print) throw new Error('usage: extract.ts <print-code>');
  extractCardFull(print).then((r) => console.log(JSON.stringify(r, null, 2)));
}
