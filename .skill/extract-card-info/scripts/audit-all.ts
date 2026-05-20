/**
 * Batch audit — runs the extractor over every base print and diffs each field
 * against the card database. Outputs a full CSV report.
 *
 * Prereq: run dump-db.ts first (writes audit/db-cards.json).
 * Usage:  npx tsx .skill/extract-card-info/scripts/audit-all.ts
 * Output: audit/full-report.csv
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditDir, imagesDir } from './paths.ts';
import { extractCard, resolveBasePrint, type FieldResult } from './extract.ts';

interface DbEntry {
  print: string;
  [field: string]: unknown;
}

const dbPath = join(auditDir, 'db-cards.json');
if (!existsSync(dbPath)) {
  throw new Error('run dump-db.ts first — audit/db-cards.json missing');
}
const db = JSON.parse(readFileSync(dbPath, 'utf8')) as Record<string, DbEntry>;

const FIELDS = ['type', 'color', 'gem', 'gemColor', 'symbol', 'ex',
  'subtype', 'cost', 'power', 'customLimit'] as const;

function normalize(field: string, v: any): string {
  if (v === null || v === undefined || v === '' || v === '∅') {
    if (field === 'color' || field === 'gemColor') return 'colorless';
    return 'none';
  }
  const s = String(v).trim();
  if (field === 'color' || field === 'gemColor') {
    if (s === 'non' || s === 'none' || s === 'ไม่มีสี' || s === 'colorless') return 'colorless';
  }
  return s;
}

const rows: string[] = ['Print,Field,DB Value,Image Value,Confidence,Match'];

let checked = 0, skipped = 0;

const prints = Object.keys(db).sort();

for (const print of prints) {
  // only base prints carry an image worth extracting
  if (resolveBasePrint(print) !== print) continue;
  if (!existsSync(join(imagesDir, `${print}.png`))) {
    skipped++;
    continue;
  }

  let result;
  try {
    result = extractCard(print);
  } catch (e) {
    rows.push(`${print},(image),,,low,ERROR: ${String(e).replace(/,/g, ';')}`);
    continue;
  }

  for (const field of FIELDS) {
    const fr = result.fields[field] as FieldResult | undefined;
    const dbValueRaw = db[print][field];
    
    // If the field is not in the DB and not extracted, skip it (e.g. power for Magic)
    if (dbValueRaw === undefined && !fr) continue;

    const dbValue = normalize(field, dbValueRaw);
    const imageValue = fr ? normalize(field, fr.value) : 'none';
    const confidence = fr ? fr.confidence : 'n/a';
    const isMatch = dbValue === imageValue;

    rows.push(`${print},${field},"${dbValue}","${imageValue}",${confidence},${isMatch ? 'TRUE' : 'FALSE'}`);
    checked++;
  }
}

mkdirSync(auditDir, { recursive: true });
const outPath = join(auditDir, 'full-report.csv');
writeFileSync(outPath, rows.join('\n'));
console.log(`Full report written to ${outPath}`);
console.log(`Fields checked: ${checked}, Cards skipped: ${skipped}`);
