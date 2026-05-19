import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCard } from './extract.ts';

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
