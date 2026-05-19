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
