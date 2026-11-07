/**
 * Bring this fork up to the official card database (bottcg.com).
 *
 *   pnpm tsx scripts/sync-official.ts report   # reports/official-text-diff-<month>.json  (existing prints vs official)
 *   pnpm tsx scripts/sync-official.ts gen      # write/extend src/cards/<set>.ts for every official print the fork lacks
 *   pnpm tsx scripts/sync-official.ts sync     # report (against the PRE-gen fork) then gen — the one-shot import
 *
 * Source rows come from scripts/scrape.ts (scraped/site-cards.json; `pnpm tsx scripts/scrape.ts data` refreshes it).
 * The site keeps one row per print+rarity; the fork keeps one entry per print with `variants`.
 *
 * Rules (issue #611 / owner rules 2026-11-07):
 *  - Tokens are skipped (not cards in a deck).
 *  - Existing prints are never rewritten — wording drift goes to the report for the errata audit.
 *  - Canonical spellings (commit 554e01f) win over the site's: names that fold to an existing fork name take the
 *    fork's spelling, and the known typo pairs are corrected.
 *  - Schema is the fork's: Magic carries `gem` (site `cost`) + `subtype`, `hashtagText` is folded into mainEffect as "\n#…".
 *  - Site symbol "สัตว์วิเศษ" is the fork's Symbol.WonderAnimal (the enum label predates the rename; converter keys on the name).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSiteCards, type SiteCard } from "./scrape";
import { CardType, Color, MagicSubtype, Rarity, Symbol } from "../src/types/base";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARDS_DIR = path.join(ROOT, "src", "cards");
export const REPORT_PATH = path.join(ROOT, "reports", "official-text-diff-2026-11.json");

type Row = SiteCard & Record<string, unknown>;
type Dict = Record<string, unknown>;

// ------------------------------------------------------------------ normalisation (report)

/** Site symbols that are the fork's existing enum values under a newer label. */
const SYMBOL_ALIAS: Record<string, string> = { "สัตว์วิเศษ": Symbol.WonderAnimal };

/** Whitespace + symbol-tag normalisation: `{symbol X}` / `{red X}` markup -> X, runs of whitespace -> one space, ํา -> ำ. */
export function normText(s: unknown): string {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/\{(?:symbol|red)\s+([^}]*)\}/gi, "$1")
    .replace(/ํา/g, "ำ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Official mainEffect as the fork stores it: hashtagText folded in as a trailing "#" line. */
export function effectiveEffect(row: Row): string {
  const base = cleanText(row.mainEffect);
  const tag = cleanText(row.hashtagText);
  if (!tag) return base;
  if (base.includes(tag)) return base;
  return base ? `${base}\n#${tag}` : `#${tag}`;
}

/** Strip per-line indentation/trailing blanks the site editor leaves in; keep the line structure. */
export function cleanText(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

// ------------------------------------------------------------------ canonical spellings

/** Known site typos the fork already settled on (554e01f). */
const TYPO_FIXES: Array<[RegExp, string]> = [
  [/ทศกัณ[ฑท]์/g, "ทศกัณฐ์"],
  [/แมลงปอแจ๊ค/g, "แมลงปอแจ็ค"],
  [/ราชีนี/g, "ราชินี"],
  [/พระปะแดง/g, "พระประแดง"],
  [/ร้ททาทุย/g, "รัททาทุย"],
];

export function fixTypos(s: string): string {
  return TYPO_FIXES.reduce((acc, [re, to]) => acc.replace(re, to), s);
}

/** Same fold the main repo's typo-twin lint uses: tone marks, spacing/punctuation dropped, ฑ→ฐ. */
export function foldName(n: string): string {
  let out = "";
  for (const ch of n) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0e47 && c <= 0x0e4e) continue;
    if (" :!.-?()".includes(ch)) continue;
    out += ch === "ฑ" ? "ฐ" : ch;
  }
  return out.toLowerCase();
}

/** fold -> fork spelling (first seen wins; fork names are already unique per fold or the lint would fail). */
export function canonicalNames(forkNames: Iterable<string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of forkNames) if (!m.has(foldName(n))) m.set(foldName(n), n);
  return m;
}

export function canonicalName(raw: string, canon: Map<string, string>): string {
  const fixed = fixTypos(raw.trim());
  return canon.get(foldName(fixed)) ?? fixed;
}

// ------------------------------------------------------------------ enum lookup

function reverse(e: Record<string, string>, label: string, alias: Record<string, string> = {}): (v: string, ctx: string) => string {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(e)) m.set(v, `${label}.${k}`);
  return (v, ctx) => {
    const hit = m.get(alias[v] ?? v);
    if (!hit) throw new Error(`${ctx}: no ${label} for ${JSON.stringify(v)}`);
    return hit;
  };
}
const colorRef = reverse(Color as never, "Color");
const typeRef = reverse(CardType as never, "CardType");
const rarityRef = reverse(Rarity as never, "Rarity");
const symbolRef = reverse(Symbol as never, "Symbol", SYMBOL_ALIAS);
const subtypeRef = reverse(MagicSubtype as never, "MagicSubtype");

// ------------------------------------------------------------------ grouping

export interface PrintGroup {
  print: string;
  rows: Row[];
}

export function groupRows(rows: Row[]): Map<string, PrintGroup> {
  const m = new Map<string, PrintGroup>();
  for (const r of rows) {
    let g = m.get(r.print);
    if (!g) m.set(r.print, (g = { print: r.print, rows: [] }));
    g.rows.push(r);
  }
  return m;
}

/** First row's value, else the first later row that has one (the site sometimes leaves the stats off the base rarity). */
function pick<K extends string>(g: PrintGroup, k: K): unknown {
  for (const r of g.rows) if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
  return undefined;
}

// ------------------------------------------------------------------ TS rendering

const q = (s: string) => JSON.stringify(s);

/** One `createCards([...])` element for a print group. Throws on unmappable enum values / missing required stats. */
export function renderCard(
  g: PrintGroup,
  canon: Map<string, string>,
  warn: (m: string) => void = () => {},
  sameName: (name: string, print: string) => Dict | undefined = () => undefined,
  setColor: (set: string) => string | undefined = () => undefined,
): string {
  const ctx = g.print;
  const first = g.rows[0];
  const type = String(first.type);
  const isMagic = type === "Magic";
  const names = g.rows.map((r) => canonicalName(String(r.name), canon));
  const name = names[0];
  if (new Set(names).size > 1) warn(`${ctx}: rarity rows disagree on name ${JSON.stringify([...new Set(names)])}; using ${JSON.stringify(name)}`);
  for (const k of ["mainEffect", "cost", "gem", "power", "symbol", "color", "subtype"] as const) {
    const vals = new Set(g.rows.map((r) => (r[k] === undefined ? "" : normText(r[k]))));
    vals.delete("");
    if (vals.size > 1) warn(`${ctx}: rarity rows disagree on ${k}; using first`);
  }

  // Same name = same card: reprint rows the site left without stats take them from the card they reprint.
  const twin = sameName(name, g.print);
  const stat = (k: string): unknown => {
    const own = pick(g, k);
    if (own !== undefined || !twin || twin[k] === undefined) return own;
    // a coloured-gem twin only applies when it has the same gem count
    if (k === "gemColor" && twin.gem !== undefined && String(twin.gem) !== String(pick(g, "gem") ?? pick(g, "cost"))) return own;
    warn(`${ctx}: site row has no ${k}; took ${JSON.stringify(twin[k])} from same-name print ${twin.print}`);
    return twin[k];
  };

  // Precon reprints with no colour on the site and no same-name twin: every coloured Avatar of the set shares one colour.
  const inferSetColor = (): unknown => {
    const c = setColor(g.print.split("-")[0]);
    if (c) warn(`${ctx}: no colour anywhere on the site; inferred ${JSON.stringify(c)} (the only Avatar colour in ${g.print.split("-")[0]}) — verify against the art`);
    return c;
  };

  const lines: string[] = [];
  lines.push(`    name: ${q(name)},`);
  lines.push(`    type: ${typeRef(type, `${ctx}.type`)},`);
  if (isMagic) lines.push(`    subtype: ${subtypeRef(String(pick(g, "subtype")), `${ctx}.subtype`)},`);
  lines.push(`    soi: ${first.soi},`);
  lines.push(`    print: ${q(g.print)},`);
  lines.push(`    rare: ${rarityRef(String(first.rare), `${ctx}.rare`)},`);
  const variants = [...new Set(g.rows.slice(1).map((r) => String(r.rare)))].filter((r) => r !== String(first.rare));
  if (variants.length) lines.push(`    variants: [${variants.map((v) => rarityRef(v, `${ctx}.variants`)).join(", ")}],`);

  const effectRow = g.rows.find((r) => cleanText(r.mainEffect) || cleanText(r.hashtagText)) ?? first;
  const hashRow = g.rows.find((r) => cleanText(r.hashtagText)) ?? effectRow;
  const effect = fixTypos(effectiveEffect({ ...effectRow, hashtagText: hashRow.hashtagText } as Row));
  if (effect) lines.push(`    mainEffect: ${q(effect)},`);

  if (type !== "Life") {
    const need = (k: string, v: unknown) => {
      if (v === undefined) throw new Error(`${ctx}: ${type} is missing ${k}`);
      return v;
    };
    if (isMagic) {
      lines.push(`    gem: ${need("gem/cost", stat("gem") ?? stat("cost"))},`);
    } else {
      lines.push(`    cost: ${need("cost", stat("cost"))},`);
      lines.push(`    gem: ${need("gem", stat("gem"))},`);
    }
    const gc = stat("gemColor");
    if (gc !== undefined) lines.push(`    gemColor: ${colorRef(String(gc), `${ctx}.gemColor`)},`);
    if (!isMagic) lines.push(`    power: ${need("power", stat("power"))},`);
    lines.push(`    symbol: ${symbolRef(String(need("symbol", stat("symbol"))), `${ctx}.symbol`)},`);
    // colourless Constructs exist (BT07-072, BT09-072..075): the fork omits `color` for them
    const color = isMagic ? undefined : type === "Construct" ? stat("color") : need("color", stat("color") ?? inferSetColor());
    if (color !== undefined) lines.push(`    color: ${colorRef(String(color), `${ctx}.color`)},`);
  }
  const ex = pick(g, "ex");
  if (ex !== undefined) lines.push(`    ex: ${q(String(ex))},`);
  const cl = pick(g, "customLimit");
  if (cl !== undefined) lines.push(`    customLimit: ${cl},`);
  const favor = type === "Life" ? cleanText(pick(g, "favorText")) : "";
  if (favor) lines.push(`    favorText: ${q(favor)},`);
  const drop = pick(g, "dropRate");
  if (drop !== undefined) lines.push(`    dropRate: ${q(String(drop))},`);
  return `  {\n${lines.join("\n")}\n  },`;
}

const FILE_HEAD = `import { createCards } from "@/src/utils/cardHelpers";
import { Card, CardType, Rarity, Symbol, MagicSubtype, Color } from "@/src/types/cards";
`;

export const exportName = (set: string) => `CARDS_${set.toUpperCase()}`;

/** Splice rendered entries before the closing `]);` of an existing createCards() file, or build a new file. Keeps the file's line endings. */
export function spliceEntries(existing: string | null, set: string, entries: string[]): string {
  const body = entries.join("\n") + "\n";
  if (existing === null) {
    return `${FILE_HEAD}\nexport const ${exportName(set)}: Card[] = createCards([\n${body}]);\n`;
  }
  const eol = existing.includes("\r\n") ? "\r\n" : "\n";
  const close = existing.lastIndexOf("]);");
  if (close === -1 || !/createCards\(\[/.test(existing)) {
    throw new Error(`${set}: existing file is not a createCards([...]) array — convert it by hand`);
  }
  let head = existing.slice(0, close).replace(/\s*$/, "");
  if (!head.endsWith(",")) head += ","; // last element had no trailing comma
  return ensureEnumImports(head + eol + body.replace(/\n/g, eol) + existing.slice(close), body);
}

/** Older set files import only the enums they used; the appended entries may need more. */
export function ensureEnumImports(src: string, body: string): string {
  const m = /import \{([^}]*)\} from (["'])@\/src\/types\/cards\2;?/.exec(src);
  if (!m) throw new Error("no '@/src/types/cards' import to extend");
  const have = new Set(m[1].split(",").map((x) => x.trim()).filter(Boolean));
  const need = ["CardType", "Rarity", "Symbol", "MagicSubtype", "Color"].filter((e) => new RegExp(`\\b${e}\\.`).test(body) && !have.has(e));
  if (!need.length) return src;
  const names = [...have, ...need];
  return src.replace(m[0], `import { ${names.join(", ")} } from ${m[2]}@/src/types/cards${m[2]};`);
}

// ------------------------------------------------------------------ report

export interface ReportEntry {
  print: string;
  set: string;
  changes: Record<string, { old: string; new: string }>;
}

export interface StatChange {
  print: string;
  field: string;
  old: unknown;
  new: unknown;
}

const STAT_FIELDS = ["type", "soi", "cost", "gem", "gemColor", "power", "symbol", "color", "ex", "subtype", "rarities"] as const;

function statView(c: Dict | Row, rarities: string[]): Dict {
  const v: Dict = { ...c };
  // Magic stores its gem count under `cost` in BT-style sources and `gem` elsewhere — same thing.
  if (v.type === "Magic" && v.gem === undefined && v.cost !== undefined) {
    v.gem = v.cost;
    delete v.cost;
  }
  if (v.type === "Magic") delete v.cost;
  if (v.gemColor === Color.None) delete v.gemColor;
  if (typeof v.symbol === "string") v.symbol = SYMBOL_ALIAS[v.symbol] ?? v.symbol;
  if (v.type !== "Magic") delete v.subtype; // Avatar subtype is free text the site does not carry
  v.rarities = [...rarities].sort().join(",");
  return v;
}

/** Existing fork prints whose official text/stats differ. `fork` is one entry per print (base rarity) plus its rarity list. */
export function buildReport(
  fork: Map<string, { card: Dict; rarities: string[] }>,
  official: Map<string, PrintGroup>,
): { textChanges: ReportEntry[]; statChanges: StatChange[] } {
  const textChanges: ReportEntry[] = [];
  const statChanges: StatChange[] = [];
  for (const [print, { card, rarities }] of [...fork].sort(([a], [b]) => a.localeCompare(b))) {
    const g = official.get(print);
    if (!g || g.rows[0].type === "Token") continue;
    const off = g.rows[0];
    const changes: ReportEntry["changes"] = {};
    const oldName = String(card.name ?? "");
    const newName = String(off.name ?? "");
    if (normText(oldName) !== normText(newName)) changes.name = { old: oldName, new: newName };
    const oldEffect = String(card.mainEffect ?? "");
    const newEffect = effectiveEffect(g.rows.find((r) => cleanText(r.mainEffect)) ?? off);
    if (normText(oldEffect) !== normText(newEffect)) changes.mainEffect = { old: oldEffect, new: newEffect };
    if (Object.keys(changes).length) textChanges.push({ print, set: print.split("-")[0], changes });

    const a = statView(card, rarities);
    const b = statView(off, g.rows.map((r) => String(r.rare)));
    for (const f of STAT_FIELDS) {
      const x = a[f] ?? null, y = b[f] ?? null;
      if (String(x) !== String(y)) statChanges.push({ print, field: f, old: x, new: y });
    }
  }
  return { textChanges, statChanges };
}

// ------------------------------------------------------------------ fork loading

async function loadFork(): Promise<Map<string, { card: Dict; rarities: string[] }>> {
  // enter through cardHelpers — the set files have a circular dep and TDZ-crash when imported directly
  await import(path.join(ROOT, "src", "utils", "cardHelpers.ts"));
  const idx = (await import(path.join(CARDS_DIR, "index.ts"))) as Record<string, Dict[]>;
  const out = new Map<string, { card: Dict; rarities: string[] }>();
  for (const [k, arr] of Object.entries(idx)) {
    if (!k.startsWith("CARDS_") || !Array.isArray(arr)) continue;
    for (const c of arr) {
      const e = out.get(c.print as string);
      if (!e) out.set(c.print as string, { card: c, rarities: [String(c.rare)] });
      else e.rarities.push(String(c.rare));
    }
  }
  return out;
}

// ------------------------------------------------------------------ registration (index.ts + cardHelpers SET_MAP)

function ensureRegistered(sets: string[]): void {
  const idxPath = path.join(CARDS_DIR, "index.ts");
  let idx = fs.readFileSync(idxPath, "utf8");
  const helpersPath = path.join(ROOT, "src", "utils", "cardHelpers.ts");
  let helpers = fs.readFileSync(helpersPath, "utf8");
  const eolOf = (t: string) => (t.includes("\r\n") ? "\r\n" : "\n");
  const idxEol = eolOf(idx), helpersEol = eolOf(helpers);
  for (const set of sets.map((s) => s.toLowerCase()).sort()) {
    const name = exportName(set);
    if (!idx.includes(`{ ${name} }`)) idx = idx.replace(/\s*$/, idxEol) + `export { ${name} } from "./${set}";${idxEol}`;
    if (!new RegExp(`\\b${name}\\b`).test(helpers.slice(0, helpers.indexOf("} from '../cards'")))) {
      helpers = helpers.replace(/(\r?\n\} from '\.\.\/cards';)/, `${helpersEol}  ${name},$1`);
    }
    if (!new RegExp(`\\b${set.toUpperCase()}: ${name}`).test(helpers)) {
      helpers = helpers.replace(/(const SET_MAP: Record<string, Card\[\]> = \{\r?\n)([\s\S]*?)(\r?\n\};)/, (_m, a, b, c) => `${a}${b}${helpersEol}  ${set.toUpperCase()}: ${name},${c}`);
    }
  }
  fs.writeFileSync(idxPath, idx);
  fs.writeFileSync(helpersPath, helpers);
}

// ------------------------------------------------------------------ commands

function cmdReport(fork: Map<string, { card: Dict; rarities: string[] }>, official: Map<string, PrintGroup>, rows: Row[]): void {
  const { textChanges, statChanges } = buildReport(fork, official);
  const report = {
    generated: "2026-11-07",
    source: "https://bottcg.com/cards (cdn.bottcg.com/data/cards.<hash>.json via scripts/scrape.ts)",
    normalisation:
      "text compared after: {symbol X}/{red X} markup -> X, whitespace runs -> one space, trim, ํา -> ำ; official hashtagText folded into mainEffect as a trailing \"#\" line. Stats compared with Magic cost==gem, gemColor ไม่มีสี==absent, site symbol สัตว์วิเศษ==fork สัตว์มหัศจรรย์.",
    counts: {
      officialRows: rows.length,
      officialPrints: official.size,
      forkPrintsCompared: [...fork.keys()].filter((p) => official.has(p) && official.get(p)!.rows[0].type !== "Token").length,
      textChanges: textChanges.length,
      statChanges: statChanges.length,
    },
    textChanges,
    statChanges,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log(`report: ${textChanges.length} prints with text changes, ${statChanges.length} stat changes -> ${path.relative(ROOT, REPORT_PATH)}`);
}

function cmdGen(fork: Map<string, { card: Dict; rarities: string[] }>, official: Map<string, PrintGroup>): void {
  const canon = canonicalNames([...fork.values()].map((e) => String(e.card.name)));
  const bySet = new Map<string, PrintGroup[]>();
  for (const g of official.values()) {
    if (fork.has(g.print) || g.rows[0].type === "Token") continue;
    const set = g.print.split("-")[0];
    (bySet.get(set) ?? bySet.set(set, []).get(set)!).push(g);
  }
  const warnings: string[] = [];
  let total = 0;
  const byName = new Map<string, Dict>();
  for (const { card } of fork.values()) if (!byName.has(canonicalName(String(card.name), canon))) byName.set(canonicalName(String(card.name), canon), card);
  const sameName = (name: string, print: string) => {
    const hit = byName.get(name);
    if (hit) return hit;
    for (const o of official.values()) {
      if (o.print !== print && fork.has(o.print) === false && canonicalName(String(o.rows[0].name), canon) === name && o.rows[0].color) return o.rows[0] as Dict;
    }
    return undefined;
  };
  const setColors = new Map<string, Set<string>>();
  for (const g of official.values()) {
    const r = g.rows.find((x) => x.color);
    if (r && g.rows[0].type === "Avatar") (setColors.get(g.print.split("-")[0]) ?? setColors.set(g.print.split("-")[0], new Set()).get(g.print.split("-")[0])!).add(String(r.color));
  }
  const setColor = (set: string) => (setColors.get(set)?.size === 1 ? [...setColors.get(set)!][0] : undefined);
  // render everything first so a bad row aborts before any file is touched
  const writes: Array<[string, string, string]> = [];
  for (const [set, groups] of [...bySet].sort(([a], [b]) => a.localeCompare(b))) {
    groups.sort((a, b) => a.print.localeCompare(b.print));
    const entries = groups.map((g) => renderCard(g, canon, (m) => warnings.push(m), sameName, setColor));
    const file = path.join(CARDS_DIR, `${set.toLowerCase()}.ts`);
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    writes.push([file, spliceEntries(existing, set, entries), `${set}: +${groups.length} prints -> ${path.relative(ROOT, file)}${existing ? " (appended)" : " (new)"}`]);
    total += groups.length;
  }
  for (const [file, text, msg] of writes) {
    fs.writeFileSync(file, text);
    console.log(msg);
  }
  ensureRegistered([...bySet.keys()]);
  console.log(`generated ${total} prints`);
  if (warnings.length) console.warn(`\n${warnings.length} warnings:\n  ${warnings.join("\n  ")}`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === "gen" || cmd === "sync") {
    // make sure every set file already on disk is exported + in SET_MAP before the fork is loaded
    ensureRegistered(fs.readdirSync(CARDS_DIR).filter((f) => /^[a-z0-9]+\.ts$/.test(f) && f !== "index.ts").map((f) => f.slice(0, -3)));
  }
  const rows = (await fetchSiteCards()) as Row[];
  const official = groupRows(rows);
  const fork = await loadFork();
  if (cmd === "report") cmdReport(fork, official, rows);
  else if (cmd === "gen") cmdGen(fork, official);
  else if (cmd === "sync") {
    cmdReport(fork, official, rows); // against the pre-gen fork: "existing prints"
    cmdGen(fork, official);
  } else {
    console.log("usage: tsx scripts/sync-official.ts <report|gen|sync>");
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
