import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCard } from './extract.ts';
import { extractCardFull } from './extract.ts';
import { resolveBasePrint } from './extract.ts';

test('extractCard reads type/color/gem for a Red Avatar (BT01-001)', () => {
  const r = extractCard('BT01-001');
  assert.equal(r.print, 'BT01-001');
  assert.equal(r.fields.type?.value, 'Avatar');
  assert.equal(r.fields.color?.value, 'แดง');
  assert.equal(r.fields.gem?.value, 2);
});

test('extractCard reads type for a Magic card (BT01-050)', () => {
  const r = extractCard('BT01-050');
  assert.equal(r.fields.type?.value, 'Magic');
});

test('extractCard reads symbol for BT01-001 (Symbol.Giant = ยักษ์)', () => {
  const r = extractCard('BT01-001');
  assert.equal(r.fields.symbol?.value, 'ยักษ์');
});

// BT01-042: customLimit=1 in src/cards/bt01.ts, has images/BT01-042.png, and
// its override circle trips hasCircle(png, regions.circle).
test('extractCard marks symbol unknown when the override circle occludes it', () => {
  const r = extractCard('BT01-042');
  assert.equal(r.fields.symbol?.value, 'unknown');
  assert.equal(r.fields.symbol?.confidence, 'low');
});

test('extractCard reads cost and power for BT01-001 (cost 3, power 3)', () => {
  const r = extractCard('BT01-001');
  assert.equal(r.fields.cost?.value, 3);
  assert.equal(r.fields.power?.value, 3);
});

// BT01-032 is a regression target: silver-filled gems (so the dark-pixel
// fraction is low), a customLimit circle that covers the gem colour bar,
// and cost/power digits whose vertical position relative to the box border
// differs from the rest of BT01.
test('extractCard reads BT01-032 (purple Avatar with override circle)', () => {
  const r = extractCard('BT01-032');
  assert.equal(r.fields.type?.value, 'Avatar');
  assert.equal(r.fields.color?.value, 'ม่วง');
  assert.equal(r.fields.cost?.value, 9);
  assert.equal(r.fields.gem?.value, 4);
  assert.equal(r.fields.power?.value, 3);
  // BT01-032's diamond interiors read silver — DB has no gemColor field, so
  // 'ไม่มีสี' is the correct extraction. (Previously this test expected
  // 'unknown' from the strip-right bar sampling that the gemColor fix
  // replaced — that path is gone, the bar's occlusion no longer matters.)
  assert.equal(r.fields.gemColor?.value, 'ไม่มีสี');
});

// BT01-042 has customLimit=1 and the override circle is present on the image.
test('extractCard reads a two-digit customLimit override', () => {
  const r = extractCard('BT01-042');
  assert.equal(typeof r.fields.customLimit?.value, 'number');
});

test('extractCardFull adds a name field', async () => {
  const r = await extractCardFull('BT01-001');
  assert.ok(r.fields.name, 'name field present');
  assert.equal(typeof r.fields.name?.value, 'string');
});

test('resolveBasePrint strips known rarity suffixes', () => {
  assert.equal(resolveBasePrint('BT01-001-SCR'), 'BT01-001');
  assert.equal(resolveBasePrint('BT01-001-CBR'), 'BT01-001');
  assert.equal(resolveBasePrint('BT01-001'), 'BT01-001');
});

test('extractCardFull tags a variant print as inherited', async () => {
  const r = await extractCardFull('BT01-001-SCR');
  assert.equal(r.print, 'BT01-001-SCR');
  assert.equal(r.source, 'inherited');
  assert.equal(r.fields.type?.value, 'Avatar');
});

// CC02-061 is a borderless Magic card (high-rarity print). The left-edge
// border sample lands on artwork, not a uniform border colour. Previously the
// extractor confidently classified it as Life because grey was the nearest
// palette swatch to the noisy sample. The fix detects borderless prints via
// pixel variance and returns type='unknown' (low confidence) instead of
// confidently wrong Construct/Life.
test('extractCard returns unknown type for a borderless card (CC02-061)', () => {
  const r = extractCard('CC02-061');
  assert.equal(r.fields.type?.value, 'unknown');
  assert.equal(r.fields.type?.confidence, 'low');
});

// PRMO-044 has a uniform pale-pink border that doesn't match any type swatch
// closely (nearest distance ~141 vs maxDist 80). The previous code reused the
// low-confidence value downstream, so cost/power/gem were read against a
// Construct-frame assumption and produced garbage (e.g. cost=66). When the
// nearest-swatch match is low-confidence, the value is downgraded to
// 'unknown' so the downstream readers are skipped.
test('extractCard returns unknown type for a low-confidence border match (PRMO-044)', () => {
  const r = extractCard('PRMO-044');
  assert.equal(r.fields.type?.value, 'unknown');
  assert.equal(r.fields.cost, undefined);
  assert.equal(r.fields.power, undefined);
});

// CC02 "Only #1" stamps render with slightly different stroke weight than the
// BT01/02/03 exemplars previously in templates/ex, scoring ~0.63 — below the
// EX_MIN_SCORE gate of 0.72. The fix broadens template coverage so each ex
// value picks exemplars across more sets, not just BT01/02/03. CC02-006 is
// not itself an exemplar — it lives in the same set as the new CC02-001
// exemplar, but matches only via genuine template generalisation.
test('extractCard detects Only #1 on a non-exemplar CC02 print (CC02-006)', () => {
  const r = extractCard('CC02-006');
  assert.equal(r.fields.ex?.value, 'Only #1');
});

// PRMO-096 prints the Only #1 stamp at a noticeably different (x,y) than
// other prints — fixed-region matchBest never lines up with a template. A
// small sliding-window pass over the ex region catches the stamp regardless
// of layout drift.
test('extractCard detects Only #1 with positional drift (PRMO-096)', () => {
  const r = extractCard('PRMO-096');
  assert.equal(r.fields.ex?.value, 'Only #1');
});

// gemColor swatches for ฟ้า/ม่วง were calibrated from a small BT01 sample and
// drifted away from later-set print runs. Diamond interiors on borderline
// prints fell on the wrong side of the euclidean midpoint:
//   • BT03-039 reads [100,93,113] — visually ม่วง but classified ฟ้า.
//   • SD05-007 reads [62,83,113]  — visually ฟ้า but classified ม่วง.
// Re-calibration uses the means of known-correct samples across all sets.
test('extractCard classifies a purple gem on the ฟ้า/ม่วง boundary (BT03-039)', () => {
  const r = extractCard('BT03-039');
  assert.equal(r.fields.gemColor?.value, 'ม่วง');
});
test('extractCard classifies a blue gem on the ฟ้า/ม่วง boundary (SD05-007)', () => {
  const r = extractCard('SD05-007');
  assert.equal(r.fields.gemColor?.value, 'ฟ้า');
});

// BT04-025 and BT06-055 carry a customLimit=0 override — visually a diagonal
// "prohibited" bar through the circle, not a digit. The previous template set
// (circleDigit/{1,2,3}.png) forced these to misclassify; the 0.png exemplar
// is cropped from BT04-025 itself.
test('extractCard reads customLimit=0 from a "no-entry" circle (BT04-025)', () => {
  const r = extractCard('BT04-025');
  assert.equal(r.fields.customLimit?.value, 0);
});
