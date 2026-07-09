/**
 * Scrape card data + images from bottcg.com and compare with local/upstream.
 *
 * Usage:
 *   pnpm tsx scripts/scrape.ts data              # dump site card DB -> scraped/site-cards.json
 *   pnpm tsx scripts/scrape.ts images bt01       # download missing images for a set (or "all")
 *   pnpm tsx scripts/scrape.ts images bt01 --force
 *   pnpm tsx scripts/scrape.ts compare bt01      # local ts vs site data vs upstream (kerlos) ts
 *
 * Images land in images/ with the existing naming (PRINT.png, PRINT-<RARE>.png)
 * and are guaranteed 388x528 (CDN native size; resized with pngjs if it ever differs).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { CardType, Rarity, MagicSubtype, Symbol, Color } from "../src/types/base";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES_DIR = path.join(ROOT, "images");
const SCRAPED_JSON = path.join(ROOT, "scraped", "site-cards.json");
const SITE = "https://bottcg.com";
const CDN = "https://cdn.bangbon.app/cards";
const UPSTREAM_API = "https://api.github.com/repos/kerlos/battle-of-talinchan-cards/contents/src/cards";
const TARGET_W = 388;
const TARGET_H = 528;
const UA = { "User-Agent": "Mozilla/5.0 (bot-cards-sync)" };

interface SiteCard {
  name: string;
  type: string;
  print: string;
  rare: string;
  soi: number;
  subtype?: string;
  cost?: number;
  gem?: number;
  gemColor?: string;
  power?: number;
  symbol?: string;
  color?: string;
  mainEffect?: string;
  favorText?: string;
  dropRate?: string;
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res;
}

/**
 * Safe parser for JS data literals (no eval/new Function — remote text never executes).
 * Supports: strings, numbers, booleans, null/undefined, !0/!1, arrays, objects,
 * and dotted identifier paths resolved against `scope` (for enum refs like Rarity.UR).
 * Anything else (calls, template ${}, spread, operators) throws.
 */
export function parseLiteral(src: string, start: number, scope: Record<string, unknown> = {}): unknown {
  let i = start;
  const err = (msg: string): never => {
    throw new Error(`parse error at ${i}: ${msg} (near ${JSON.stringify(src.slice(i, i + 30))})`);
  };
  const ws = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith("//", i)) while (i < src.length && src[i] !== "\n") i++;
      else if (src.startsWith("/*", i)) {
        const end = src.indexOf("*/", i);
        if (end === -1) err("unclosed comment");
        i = end + 2;
      }
      else return;
    }
  };
  const str = (): string => {
    const q = src[i++];
    let out = "";
    while (i < src.length && src[i] !== q) {
      if (q === "`" && src.startsWith("${", i)) err("template interpolation not allowed");
      if (src[i] === "\\") {
        const c = src[++i];
        if (c === "n") out += "\n";
        else if (c === "t") out += "\t";
        else if (c === "r") out += "\r";
        else if (c === "u") {
          const hex = src.slice(i + 1, i + 5);
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else out += c;
        i++;
      } else out += src[i++];
    }
    if (src[i++] !== q) err("unterminated string");
    return out;
  };
  const value = (): unknown => {
    ws();
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") return str();
    if (c === "[") {
      i++;
      const arr: unknown[] = [];
      for (ws(); src[i] !== "]"; ws()) {
        arr.push(value());
        ws();
        if (src[i] === ",") i++;
        else if (src[i] !== "]") err("expected , or ]");
      }
      i++;
      return arr;
    }
    if (c === "{") {
      i++;
      const obj: Record<string, unknown> = {};
      for (ws(); src[i] !== "}"; ws()) {
        let key: string;
        if (/["'`]/.test(src[i])) key = str();
        else {
          const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i)) ?? err("bad key");
          key = m[0];
          i += key.length;
        }
        ws();
        if (src[i++] !== ":") err("expected :");
        obj[key] = value();
        ws();
        if (src[i] === ",") i++;
        else if (src[i] !== "}") err("expected , or }");
      }
      i++;
      return obj;
    }
    if (c === "!") {
      i++;
      return !value();
    }
    const num = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i));
    if (num && /[\d+-.]/.test(c)) {
      i += num[0].length;
      return Number(num[0]);
    }
    const ident = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/.exec(src.slice(i));
    if (ident) {
      i += ident[0].length;
      ws();
      if (src[i] === "(") err(`function call "${ident[0]}(" not allowed`);
      if (ident[0] === "true") return true;
      if (ident[0] === "false") return false;
      if (ident[0] === "null") return null;
      if (ident[0] === "undefined") return undefined;
      const v = ident[0].split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], scope);
      if (v === undefined) err(`unknown identifier ${ident[0]}`);
      return v;
    }
    return err("unexpected token");
  };
  return value();
}

/** Find the JS chunk that bundles the card DB and eval its array literal. */
async function fetchSiteCards(): Promise<SiteCard[]> {
  if (fs.existsSync(SCRAPED_JSON)) {
    return JSON.parse(fs.readFileSync(SCRAPED_JSON, "utf-8"));
  }
  const html = await (await get(`${SITE}/cards`)).text();
  const chunks = [...new Set([...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+)"/g)].map((m) => m[1]))];
  for (const c of chunks) {
    const js = await (await get(SITE + c)).text();
    const i = js.indexOf("=[{name:");
    if (i === -1 || !js.includes("mainEffect:")) continue;
    return parseLiteral(js, i + 1) as SiteCard[];
  }
  throw new Error("card DB chunk not found on bottcg.com/cards");
}

interface PrintGroup {
  base: Record<string, unknown>;
  rares: string[]; // first = base rare (unsuffixed image), rest = variants
}

/** All sources (site DB, upstream ts, local expanded by createCards) have one row per print+rare; fold by print. */
function groupByPrint(cards: Array<Record<string, unknown>>): Map<string, PrintGroup> {
  const map = new Map<string, PrintGroup>();
  for (const c of cards) {
    const g = map.get(c.print as string);
    if (!g) map.set(c.print as string, { base: c, rares: [String(c.rare)] });
    else g.rares.push(String(c.rare));
  }
  return map;
}

function setPrefix(set: string): string {
  return set.toUpperCase() + "-";
}

// ---------------------------------------------------------------- data

async function cmdData(): Promise<SiteCard[]> {
  fs.rmSync(SCRAPED_JSON, { force: true });
  const cards = await fetchSiteCards();
  fs.mkdirSync(path.dirname(SCRAPED_JSON), { recursive: true });
  fs.writeFileSync(SCRAPED_JSON, JSON.stringify(cards, null, 1));
  const bySet = new Map<string, number>();
  for (const c of cards) bySet.set(c.print.split("-")[0], (bySet.get(c.print.split("-")[0]) ?? 0) + 1);
  console.log(`scraped ${cards.length} rows -> ${path.relative(ROOT, SCRAPED_JSON)}`);
  console.log([...bySet].map(([s, n]) => `${s}:${n}`).join(" "));
  return cards;
}

// ---------------------------------------------------------------- images

function pngDims(buf: Buffer): [number, number] {
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

export function resize(buf: Buffer, W = TARGET_W, H = TARGET_H): Buffer {
  const src = PNG.sync.read(buf);
  const dst = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // bilinear sample
      const fx = (x * (src.width - 1)) / (W - 1);
      const fy = (y * (src.height - 1)) / (H - 1);
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, src.width - 1), y1 = Math.min(y0 + 1, src.height - 1);
      const dx = fx - x0, dy = fy - y0;
      const di = (y * W + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const p = (xx: number, yy: number) => src.data[(yy * src.width + xx) * 4 + ch];
        dst.data[di + ch] =
          p(x0, y0) * (1 - dx) * (1 - dy) + p(x1, y0) * dx * (1 - dy) +
          p(x0, y1) * (1 - dx) * dy + p(x1, y1) * dx * dy;
      }
    }
  }
  return PNG.sync.write(dst);
}

async function cmdImages(set: string, force: boolean): Promise<void> {
  const groups = groupByPrint(await fetchSiteCards());
  const wanted: string[] = [];
  for (const [print, g] of groups) {
    if (set !== "all" && !print.startsWith(setPrefix(set))) continue;
    wanted.push(`${print}.png`, ...g.rares.slice(1).map((r) => `${print}-${r}.png`));
  }
  const todo = force ? wanted : wanted.filter((f) => !fs.existsSync(path.join(IMAGES_DIR, f)));
  console.log(`${wanted.length} images for "${set}", downloading ${todo.length} (${force ? "forced" : "missing only"})`);
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  let done = 0, failed = 0, resized = 0;
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try {
          let buf = Buffer.from(await (await get(`${CDN}/${f}`)).arrayBuffer());
          const [w, h] = pngDims(buf);
          if (w !== TARGET_W || h !== TARGET_H) {
            buf = resize(buf);
            resized++;
            console.log(`  resized ${f} ${w}x${h} -> ${TARGET_W}x${TARGET_H}`);
          }
          fs.writeFileSync(path.join(IMAGES_DIR, f), buf);
          done++;
        } catch (e) {
          failed++;
          console.error(`  FAIL ${f}: ${(e as Error).message}`);
        }
      }
    }),
  );
  console.log(`done: ${done} saved (${resized} resized), ${failed} failed`);
}

// ---------------------------------------------------------------- compare

type AnyCard = Record<string, unknown>;
const COMPARE_FIELDS = ["name", "type", "subtype", "soi", "cost", "gem", "gemColor", "power", "symbol", "color", "mainEffect", "favorText"] as const;

function norm(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? undefined : s;
}

/** Iron out schema drift so only real data diffs surface:
 *  - Magic cards store their cost in `gem` in some local sets and `cost` on the site -> coalesce to `cost`
 *  - gemColor "ไม่มีสี" (None) and an absent gemColor mean the same thing */
function normalizeCard(c: AnyCard): AnyCard {
  const n = { ...c };
  if (n.type === CardType.Magic && n.cost === undefined && n.gem !== undefined) {
    n.cost = n.gem;
    delete n.gem;
  }
  if (n.gemColor === Color.None) delete n.gemColor;
  return n;
}

async function loadLocal(set: string): Promise<AnyCard[]> {
  // enter through cardHelpers — set files have a circular dep and TDZ-crash when imported directly
  const mod = await import(path.join(ROOT, "src", "utils", "cardHelpers.ts"));
  const arr = mod.getCardsBySet(set);
  if (!arr.length) throw new Error(`set ${set} not found in local card db`);
  return arr;
}

async function loadUpstream(set: string): Promise<AnyCard[] | null> {
  const res = await fetch(`${UPSTREAM_API}/${set.toLowerCase()}.ts`, {
    headers: { ...UA, Accept: "application/vnd.github.raw+json" },
  });
  if (!res.ok) {
    console.error(`upstream fetch failed (${res.status}) - skipping upstream compare`);
    return null;
  }
  const src = await res.text();
  // upstream uses either a plain array literal or the createCards([...]) helper
  const m = /(?:createCards\(|CARDS_\w+(?::\s*Card\[\])?\s*=\s*)\[/.exec(src);
  if (!m) throw new Error("card array literal not found in upstream file");
  return parseLiteral(src, m.index + m[0].length - 1, { CardType, Rarity, MagicSubtype, Symbol, Color }) as AnyCard[];
}

function compareGroups(label: string, local: Map<string, PrintGroup>, other: Map<string, PrintGroup>): void {
  console.log(`\n=== local vs ${label} ===`);
  let mismatches = 0;
  for (const [print, lg] of local) {
    const og = other.get(print);
    if (!og) {
      console.log(`${print}  MISSING in ${label}`);
      mismatches++;
      continue;
    }
    const diffs: string[] = [];
    const lb = normalizeCard(lg.base), ob = normalizeCard(og.base);
    for (const f of COMPARE_FIELDS) {
      const va = norm(lb[f]), vb = norm(ob[f]);
      if (va !== vb) diffs.push(`${f}: ${va ?? "∅"} ≠ ${vb ?? "∅"}`);
    }
    const lr = [...lg.rares].sort().join(","), or_ = [...og.rares].sort().join(",");
    if (lr !== or_) diffs.push(`rarities: ${lr} ≠ ${or_}`);
    if (diffs.length) {
      console.log(`${print}  ${diffs.join("  |  ")}`);
      mismatches++;
    }
  }
  for (const print of other.keys()) {
    if (!local.has(print)) {
      console.log(`${print}  MISSING locally`);
      mismatches++;
    }
  }
  console.log(mismatches === 0 ? `all ${local.size} prints match` : `${mismatches} mismatched prints`);
}

async function cmdCompare(set: string): Promise<void> {
  if (set === "all") throw new Error("compare needs a specific set, e.g. bt01");
  const local = groupByPrint(await loadLocal(set));
  const site = groupByPrint((await fetchSiteCards()).filter((c) => c.print.startsWith(setPrefix(set))));
  compareGroups("site (bottcg.com)", local, site);
  const upstream = await loadUpstream(set);
  if (upstream) compareGroups("upstream (kerlos)", local, groupByPrint(upstream));
}

// ---------------------------------------------------------------- main

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, set = "all", ...flags] = process.argv.slice(2);
  try {
    if (cmd === "data") await cmdData();
    else if (cmd === "images") await cmdImages(set, flags.includes("--force"));
    else if (cmd === "compare") await cmdCompare(set);
    else {
      console.log("usage: tsx scripts/scrape.ts <data|images|compare> [set|all] [--force]");
      process.exit(1);
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
