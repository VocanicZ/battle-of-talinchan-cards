/**
 * Calibration aid — crops every regions.json rectangle from a card image and
 * writes them side by side so the rectangles can be eyeballed and tuned.
 *
 * Usage: npx tsx .skill/extract-card-info/scripts/preview-regions.ts BT01-001
 * Output: <skill>/audit/regions-preview/<print>/<field>.png
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { auditDir, imagesDir, skillDir } from './paths.ts';
import { crop, type Rect } from './cv.ts';

const print = process.argv[2];
if (!print) throw new Error('usage: preview-regions.ts <print-code>');

const regions = JSON.parse(
  readFileSync(join(skillDir, 'scripts/regions.json'), 'utf8'),
) as Record<string, Rect>;

const png = PNG.sync.read(readFileSync(join(imagesDir, `${print}.png`)));
const outDir = join(auditDir, 'regions-preview', print);
mkdirSync(outDir, { recursive: true });

for (const [field, rect] of Object.entries(regions)) {
  const c = crop(png, rect);
  writeFileSync(join(outDir, `${field}.png`), PNG.sync.write(c));
}
console.log(`wrote ${Object.keys(regions).length} region crops to ${outDir}`);
