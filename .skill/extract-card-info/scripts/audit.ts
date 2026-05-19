/**
 * Batch audit — runs the extractor over every base print and diffs each field
 * against the card database. Report-only; never edits card files.
 *
 * Prereq: run dump-db.ts first (writes audit/db-cards.json).
 * Usage:  npx tsx .skill/extract-card-info/scripts/audit.ts
 * Output: <skill>/audit/report.md
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditDir, imagesDir } from './paths.ts';
import { extractCardFull, resolveBasePrint, type FieldResult } from './extract.ts';

interface DbEntry {
  print: string;
  [field: string]: unknown;
}

const dbPath = join(auditDir, 'db-cards.json');
if (!existsSync(dbPath)) {
  throw new Error('run dump-db.ts first — audit/db-cards.json missing');
}
const db = JSON.parse(readFileSync(dbPath, 'utf8')) as Record<string, DbEntry>;

// gemColor is intentionally excluded: it is a derived display value, not a
// tracked card-DB property, so diffing it produces only noise.
const FIELDS = ['type', 'color', 'gem', 'symbol', 'ex',
  'subtype', 'cost', 'power', 'customLimit'] as const;

interface Row {
  print: string; field: string;
  dbValue: unknown; imageValue: unknown;
  confidence: 'high' | 'low'; note: string;
}
const mismatches: Row[] = [];
const uncertain: Row[] = [];

let checked = 0, skipped = 0;

for (const print of Object.keys(db)) {
  // only base prints carry an image worth extracting
  if (resolveBasePrint(print) !== print) continue;
  if (!existsSync(join(imagesDir, `${print}.png`))) { skipped++; continue; }

  let result;
  try {
    result = await extractCardFull(print);
  } catch (e) {
    uncertain.push({ print, field: '(image)', dbValue: '', imageValue: '',
      confidence: 'low', note: String(e) });
    continue;
  }

  for (const field of FIELDS) {
    const fr = result.fields[field] as FieldResult | undefined;
    if (!fr) continue; // field N/A for this card type
    checked++;
    const dbValue = db[print][field] ?? null;
    const imageValue = fr.value;
    if (String(dbValue) === String(imageValue)) continue;
    const row: Row = { print, field, dbValue, imageValue,
      confidence: fr.confidence, note: '' };
    (fr.confidence === 'low' ? uncertain : mismatches).push(row);
  }
}

const fmt = (v: unknown) => (v === null || v === undefined ? '∅' : String(v));
const table = (rows: Row[]) => {
  if (!rows.length) return ['_None._'];
  const out = ['| Print | Field | DB value | Image value | Note |',
    '|---|---|---|---|---|'];
  for (const r of rows.sort((a, b) => a.print.localeCompare(b.print))) {
    out.push(`| ${r.print} | ${r.field} | ${fmt(r.dbValue)} | ${fmt(r.imageValue)} | ${r.note} |`);
  }
  return out;
};

const lines = [
  '# Card Image Audit Report', '',
  `_Generated ${new Date().toISOString()}_`, '',
  '## Summary', '',
  `- Field checks performed: **${checked}**`,
  `- Cards skipped (no image): **${skipped}**`,
  `- ❌ Confirmed mismatches (high confidence): **${mismatches.length}**`,
  `- 🔍 Uncertain (low confidence, manual review): **${uncertain.length}**`,
  '', '## ❌ Confirmed mismatches', '', ...table(mismatches),
  '', '## 🔍 Uncertain', '', ...table(uncertain), '',
];

mkdirSync(auditDir, { recursive: true });
writeFileSync(join(auditDir, 'report.md'), lines.join('\n'));
console.log(`report.md: ${mismatches.length} mismatch(es), ${uncertain.length} uncertain`);
