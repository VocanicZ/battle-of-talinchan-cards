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
  const segs = segmentDigits(crop(png, rect)).slice(0, 3);
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
 * Calibrated by sampling BT01 Avatar (dark red), BT01-050 Magic (dark blue),
 * BT06-064 Construct (golden yellow), BT01-051 Life (grey).
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
 * The gem strip (x=100, y=32, w=155, h=26) encodes gem count as small gem icons.
 * Each gem adds a group of dark pixels at one of 4 positions in the left portion
 * of the strip. Slots are at x=104, 120, 136, 152 (8px wide).
 * A slot is "filled" (has a gem) when ≥5% of its pixels are dark (brightness < 80).
 *
 * Calibrated on BT01 cards: gem=0 → 0%, gem=1 → 11%, gem=2 → [11%,18%,0%,0%],
 * gem=3 → [11%,18%,2%,15%].
 */
const GEM_SLOT_OFFSETS = [4, 20, 36, 52]; // offsets from regions.gemStrip[0]
const GEM_SLOT_W = 8;                     // px wide per slot sample
const GEM_DARK_THRESH = 80;               // pixel brightness threshold for "dark"
const GEM_FILLED_FRAC = 0.05;             // min dark fraction to count a slot as filled

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

  let filled = 0;
  for (const off of GEM_SLOT_OFFSETS) {
    const x0 = sx + off;
    let dark = 0, total = 0;
    for (let x = x0; x < x0 + GEM_SLOT_W; x++) {
      for (let y = sy + 1; y < sy + sh - 1; y++) {
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

  // ex — stamp under the race icon
  if (occluded) {
    fields.ex = { value: 'unknown', confidence: 'low', score: 0 };
  } else {
    const m = matchBest(crop(png, regions.ex), EX_TPL, TPL_MIN_SCORE, TPL_MARGIN);
    // a low-confidence ex match most often means "no stamp present"
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
