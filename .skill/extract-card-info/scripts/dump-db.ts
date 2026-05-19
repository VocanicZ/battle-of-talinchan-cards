/**
 * Stage 0 — dump the card database to a flat JSON keyed by print code.
 *
 * One entry per print (rarity variants share a definition, so the first
 * occurrence wins). Only image-derivable fields are kept; this file is the
 * left-hand side of the audit join.
 *
 * Run from the project root: npx tsx .claude/skills/extract-card-info/scripts/dump-db.ts
 * Output: <skill>/audit/db-cards.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditDir, cardHelpers } from './paths.ts';

interface DbEntry {
  print: string;
  name: string;
  type?: string;
  color?: string;
  gem?: number;
  gemColor?: string;
  customLimit?: number;
  symbol?: string;
  cost?: number;
  power?: number;
  ex?: string;
  subtype?: string;
}

const { getAllCards } = (await import(pathToFileURL(cardHelpers).href)) as {
  getAllCards: () => Record<string, unknown>[];
};

const byPrint = new Map<string, DbEntry>();

for (const card of getAllCards()) {
  const print = card.print as string | undefined;
  if (!print || byPrint.has(print)) continue;
  byPrint.set(print, {
    print,
    name: card.name as string,
    type: card.type as string | undefined,
    color: card.color as string | undefined,
    gem: card.gem as number | undefined,
    gemColor: card.gemColor as string | undefined,
    customLimit: card.customLimit as number | undefined,
    symbol: card.symbol as string | undefined,
    cost: card.cost as number | undefined,
    power: card.power as number | undefined,
    ex: card.ex as string | undefined,
    subtype: card.subtype as string | undefined,
  });
}

const out = Object.fromEntries([...byPrint.entries()].sort());
mkdirSync(auditDir, { recursive: true });
writeFileSync(join(auditDir, 'db-cards.json'), JSON.stringify(out, null, 2));

console.log(`db-cards.json written: ${byPrint.size} unique prints`);
