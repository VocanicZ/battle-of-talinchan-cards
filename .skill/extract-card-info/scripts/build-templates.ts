/**
 * One-time builder for the template library.
 *
 * For each distinct symbol / subtype / ex value, and for each digit 0–9, it
 * picks an exemplar card from the database (BT01 preferred — the trusted
 * golden set), crops the field region from that card's image, and saves it as
 * templates/<field>/<value>.png. A contact sheet of every crop is emitted for
 * human sign-off before the templates are committed.
 *
 * Usage: npx tsx .skill/extract-card-info/scripts/build-templates.ts
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { cardHelpers, imagesDir, skillDir } from './paths.ts';
import { crop, segmentDigits, type Rect } from './cv.ts';

const regions = JSON.parse(
  readFileSync(join(skillDir, 'scripts/regions.json'), 'utf8'),
) as Record<string, Rect>;

const { getAllCards } = (await import(pathToFileURL(cardHelpers).href)) as {
  getAllCards: () => Record<string, unknown>[];
};
const cards = getAllCards();

const templatesDir = join(skillDir, 'templates');

/** Read a card image by print code, or null if missing. */
function image(print: string): PNG | null {
  try {
    return PNG.sync.read(readFileSync(join(imagesDir, `${print}.png`)));
  } catch {
    return null;
  }
}

/** First card (BT01 preferred) whose `field` equals `value` and has an image. */
function exemplar(field: string, value: string): { print: string; png: PNG } | null {
  const sorted = [...cards].sort((a, b) => {
    const ap = String(a.print).startsWith('BT01') ? 0 : 1;
    const bp = String(b.print).startsWith('BT01') ? 0 : 1;
    return ap - bp;
  });
  for (const c of sorted) {
    if (String(c[field] ?? '') !== value) continue;
    const png = image(String(c.print));
    if (png && png.width === 388 && png.height === 528) {
      return { print: String(c.print), png };
    }
  }
  return null;
}

const crops: { label: string; png: PNG }[] = [];

/** Crop one icon template for every distinct value of an enum field. */
function buildIconField(field: string, region: Rect) {
  const values = [...new Set(cards.map((c) => c[field]).filter(Boolean))].map(
    String,
  );
  mkdirSync(join(templatesDir, field), { recursive: true });
  for (const value of values) {
    const ex = exemplar(field, value);
    if (!ex) {
      console.warn(`  no exemplar for ${field}=${value}`);
      continue;
    }
    const c = crop(ex.png, region);
    // file name: sanitise so Thai/symbol values are filesystem-safe
    const safe = Buffer.from(value).toString('base64url');
    writeFileSync(join(templatesDir, field, `${safe}.png`), PNG.sync.write(c));
    crops.push({ label: `${field}:${value}`, png: c });
  }
}

buildIconField('symbol', regions.symbol);
buildIconField('subtype', regions.subtype ?? regions.costBox);
buildIconField('ex', regions.ex);

/**
 * Build a 0-9 glyph set by cropping a numeric region from Avatar/Construct
 * cards. Magic cards carry a subtype pictogram (not a digit) in the COST box,
 * so they are excluded. Among candidates (BT01 preferred) the first whose
 * region cleanly segments into exactly one glyph is used.
 *
 * @param dirName    - subdirectory under templates/ to write PNGs into
 * @param costOrPower - card field to filter by digit value ('cost' or 'power')
 * @param region      - image region to crop and segment
 */
function buildDigitField(dirName: string, costOrPower: 'cost' | 'power', region: Rect) {
  // Save up to MAX_PER_DIGIT exemplars per digit, named '{d}-{print}.png'.
  // loadTemplates groups them by leading digit and matchBest takes the max
  // score across exemplars — robust against per-card rendering variation.
  const MAX_PER_DIGIT = 3;
  const fieldDir = join(templatesDir, dirName);
  mkdirSync(fieldDir, { recursive: true });
  // Clear old templates so single-name '.png' files don't shadow new ones.
  for (const f of readdirSync(fieldDir)) {
    if (f.endsWith('.png')) rmSync(join(fieldDir, f));
  }
  for (let d = 0; d <= 9; d++) {
    const candidates = cards
      .filter((c) => c[costOrPower] === d && (c.type === 'Avatar' || c.type === 'Construct'))
      .sort((a, b) => (String(a.print).startsWith('BT01') ? -1 : 1));
    let saved = 0;
    for (const card of candidates) {
      if (saved >= MAX_PER_DIGIT) break;
      const png = image(String(card.print));
      if (!png) continue;
      const segs = segmentDigits(crop(png, region));
      if (segs.length !== 1) continue;
      const print = String(card.print);
      writeFileSync(join(fieldDir, `${d}-${print}.png`), PNG.sync.write(segs[0]));
      crops.push({ label: `${dirName}:${d}-${print}`, png: segs[0] });
      saved++;
    }
    if (saved === 0) console.warn(`  no clean exemplar for ${dirName} ${d}`);
  }
}

buildDigitField('digit', 'cost', regions.costNum);
buildDigitField('powerDigit', 'power', regions.powerNum);

// Contact sheet: a grid of every crop, each cell 64×64, for human review.
const CELL = 64, COLS = 8;
const rows = Math.ceil(crops.length / COLS);
const sheet = new PNG({ width: COLS * CELL, height: rows * CELL });
sheet.data.fill(255);
crops.forEach((c, idx) => {
  const cx = (idx % COLS) * CELL, cy = Math.floor(idx / COLS) * CELL;
  for (let y = 0; y < Math.min(CELL, c.png.height); y++) {
    for (let x = 0; x < Math.min(CELL, c.png.width); x++) {
      const s = (c.png.width * y + x) << 2;
      const d = (sheet.width * (cy + y) + (cx + x)) << 2;
      sheet.data[d] = c.png.data[s];
      sheet.data[d + 1] = c.png.data[s + 1];
      sheet.data[d + 2] = c.png.data[s + 2];
      sheet.data[d + 3] = 255;
    }
  }
});
writeFileSync(join(templatesDir, 'contact-sheet.png'), PNG.sync.write(sheet));
writeFileSync(
  join(templatesDir, 'contact-sheet-index.json'),
  JSON.stringify(crops.map((c) => c.label), null, 2),
);
console.log(`built ${crops.length} templates; review templates/contact-sheet.png`);
