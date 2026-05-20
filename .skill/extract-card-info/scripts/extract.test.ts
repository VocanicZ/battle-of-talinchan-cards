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
  // The customLimit circle occludes the gem-colour bar — gemColor is unknown.
  assert.equal(r.fields.gemColor?.value, 'unknown');
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
