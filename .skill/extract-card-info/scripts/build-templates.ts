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

/** Crop icon templates for every distinct value of an enum field.
 * Saves up to MAX_PER_VALUE exemplars per value across sets, named
 * '{base64url(value)}-{print}.png' (loadTemplates groups by leading
 * b64 chunk). Multi-exemplar matching is the key to handling per-set
 * rendering drift (e.g. BT01-048's tree vs BT02-024's tree).
 */
// DB labels that disagree with the printed art — using them as template
// exemplars poisons the corresponding label's match. Confirmed by visual
// inspection of the card image. Entries: [field, value, print].
const KNOWN_DB_TYPOS: ReadonlyArray<[string, string, string]> = [
  // BT01-037 is rendered with the สัตว์ (monkey) symbol but DB stores Mage.
  ['symbol', 'จอมเวทย์', 'BT01-037'],
];

function buildIconField(field: string, region: Rect) {
  const MAX_PER_VALUE = 3;
  const fieldDir = join(templatesDir, field);
  mkdirSync(fieldDir, { recursive: true });
  for (const f of readdirSync(fieldDir)) {
    if (f.endsWith('.png')) rmSync(join(fieldDir, f));
  }
  const values = [...new Set(cards.map((c) => c[field]).filter(Boolean))].map(String);
  for (const value of values) {
    // Interleave by set so each set contributes ≥1 exemplar where possible.
    const matching = cards.filter((c) => String(c[field] ?? '') === value);
    const bySet = new Map<string, typeof matching>();
    for (const c of matching) {
      const set = String(c.print).split('-')[0];
      (bySet.get(set) ?? bySet.set(set, []).get(set)!).push(c);
    }
    const interleaved: typeof matching = [];
    const setKeys = [...bySet.keys()].sort((a, b) => a === 'BT01' ? -1 : b === 'BT01' ? 1 : a.localeCompare(b));
    let i = 0;
    while (interleaved.length < matching.length) {
      for (const k of setKeys) {
        const arr = bySet.get(k)!;
        if (i < arr.length) interleaved.push(arr[i]);
      }
      i++;
    }
    let saved = 0;
    const safe = Buffer.from(value).toString('base64url');
    for (const c of interleaved) {
      if (saved >= MAX_PER_VALUE) break;
      const print = String(c.print);
      if (KNOWN_DB_TYPOS.some(([f, v, p]) => f === field && v === value && p === print)) continue;
      const png = image(print);
      if (!png || png.width !== 388 || png.height !== 528) continue;
      const cr = crop(png, region);
      writeFileSync(join(fieldDir, `${safe}-${print}.png`), PNG.sync.write(cr));
      crops.push({ label: `${field}:${value}-${print}`, png: cr });
      saved++;
    }
    if (saved === 0) console.warn(`  no exemplar for ${field}=${value}`);
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
    // Group candidates by set (BT01, BT02, …) and pick ONE per set first
    // before doubling up — gives template diversity across the rendering
    // variations between card sets (BT02-010's narrow "1" doesn't match
    // BT01's "1" templates, for instance).
    const candidates = cards
      .filter((c) => c[costOrPower] === d && (c.type === 'Avatar' || c.type === 'Construct'));
    const bySet = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const set = String(c.print).split('-')[0];
      (bySet.get(set) ?? bySet.set(set, []).get(set)!).push(c);
    }
    const interleaved: typeof candidates = [];
    const setKeys = [...bySet.keys()].sort((a, b) => a === 'BT01' ? -1 : b === 'BT01' ? 1 : a.localeCompare(b));
    let i = 0;
    while (interleaved.length < candidates.length) {
      for (const k of setKeys) {
        const arr = bySet.get(k)!;
        if (i < arr.length) interleaved.push(arr[i]);
      }
      i++;
    }
    let saved = 0;
    for (const card of interleaved) {
      if (saved >= MAX_PER_DIGIT) break;
      const print = String(card.print);
      const png = image(print);
      if (!png) continue;
      const segs = segmentDigits(crop(png, region));
      if (segs.length !== 1) continue;
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
