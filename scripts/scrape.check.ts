// Self-check for scripts/scrape.ts: pnpm tsx scripts/scrape.check.ts
import assert from "node:assert";
import { PNG } from "pngjs";
import { parseLiteral, resize, chunkPaths, findCardsJsonUrl, findImageDirs, remoteImagePath } from "./scrape";
import {
  normText, effectiveEffect, fixTypos, foldName, canonicalNames, canonicalName,
  groupRows, renderCard, spliceEntries, ensureEnumImports, buildReport,
} from "./sync-official";

// parseLiteral: minified site-bundle shape
assert.deepStrictEqual(
  parseLiteral(`x=[{name:"a\\"b",soi:1,cost:-2,ok:!0,arr:[1,2,]},{s:'q'}]`, 2),
  [{ name: 'a"b', soi: 1, cost: -2, ok: true, arr: [1, 2] }, { s: "q" }],
);
// enum path resolution + comments + trailing comma (upstream ts shape)
assert.deepStrictEqual(
  parseLiteral(`[\n // c\n { rare: Rarity.UR, /* x */ variants: [Rarity.SCR], },\n]`, 0, { Rarity: { UR: "UR", SCR: "SCR" } }),
  [{ rare: "UR", variants: ["SCR"] }],
);
// injection attempts rejected
for (const evil of [`[foo()]`, "[`a${1}b`]", `[{a: process.exit(1)}]`, `[unknownIdent]`]) {
  assert.throws(() => parseLiteral(evil, 0), /parse error|not allowed/);
}
// resize: 10x20 solid red -> 388x528, corners stay red
const src = new PNG({ width: 10, height: 20 });
for (let i = 0; i < src.data.length; i += 4) { src.data[i] = 255; src.data[i + 3] = 255; }
const out = PNG.sync.read(resize(PNG.sync.write(src)));
assert.strictEqual(out.width, 388);
assert.strictEqual(out.height, 528);
assert.strictEqual(out.data[0], 255);
assert.strictEqual(out.data[(528 * 388 - 1) * 4], 255);

// --- 2026-11 site layout: DB moved out of the page chunk into cdn.bottcg.com/data/cards.<hash>.json
assert.deepStrictEqual(
  chunkPaths(`<script src="/_next/static/immutable/chunks/0abc.js" async></script><link href="/_next/static/chunks/old.js"/><script src="/_next/static/immutable/chunks/0abc.js"></script>`),
  ["/_next/static/immutable/chunks/0abc.js", "/_next/static/chunks/old.js"],
);
assert.strictEqual(
  findCardsJsonUrl(`x={CARD_DB_URL:"https://cdn.bottcg.com/data/cards.feab7649.json",y:1}`),
  "https://cdn.bottcg.com/data/cards.feab7649.json",
);
assert.strictEqual(findCardsJsonUrl(`no db here https://cdn.bottcg.com/data/other.json`), null);
const dirs = findImageDirs(`let r="https://cdn.bottcg.com/cards",t=["SCR"],a={SD09:"123v1k1",RM01:"0aslabe",BT12:"thankyoupnes"};function i(){}`);
assert.deepStrictEqual(dirs, { SD09: "123v1k1", RM01: "0aslabe", BT12: "thankyoupnes" });
// image path rules mirror the site's cardImagePath: per-set dir; suffix only SCR/PR/CBR (every rarity for B2SA/B2SB)
assert.strictEqual(remoteImagePath("BT12-001", "UR", dirs), "thankyoupnes/BT12-001.png");
assert.strictEqual(remoteImagePath("BT12-001", "SCR", dirs), "thankyoupnes/BT12-001-SCR.png");
assert.strictEqual(remoteImagePath("BT10-001", "SR", dirs), "BT10-001.png");
assert.strictEqual(remoteImagePath("B2SA-001", "C", { B2SA: "thankyoupnes" }), "thankyoupnes/B2SA-001-C.png");

// --- sync-official: normalisation, canonical spellings, rendering
assert.strictEqual(normText("เลือก  Avatar {symbol ยักษ์}\n 1 ใบ จํานวน"), "เลือก Avatar ยักษ์ 1 ใบ จำนวน");
assert.strictEqual(normText('ได้รับ {red "โล่มนุษย์"}'), 'ได้รับ "โล่มนุษย์"');
assert.strictEqual(effectiveEffect({ mainEffect: "ก\n   ข ", hashtagText: "ค" } as never), "ก\nข\n#ค");
assert.strictEqual(effectiveEffect({ mainEffect: "ก #ค", hashtagText: "ค" } as never), "ก #ค");
assert.strictEqual(fixTypos("อาเมอร์ ทศกัณท์ / พญายักษ์ ทศกัณฑ์"), "อาเมอร์ ทศกัณฐ์ / พญายักษ์ ทศกัณฐ์");
assert.strictEqual(foldName("รัททาทุย แบงค์"), foldName("รัททาทุยแบงค์"));
const canon = canonicalNames(["รัททาทุยแบงค์", "พระนารายณ์"]);
assert.strictEqual(canonicalName("รัททาทุย แบงค์", canon), "รัททาทุยแบงค์");
assert.strictEqual(canonicalName("สายเลือดมังกร", canon), "สายเลือดมังกร");

const avatar = groupRows([
  { name: "อิกนิส", type: "Avatar", soi: 3, print: "BT12-013", rare: "UR", mainEffect: "จุติ : ก", cost: 5, gem: 2, power: 4, symbol: "มังกร", color: "แดง", ex: "Only #1" },
  { name: "อิกนิส", type: "Avatar", soi: 3, print: "BT12-013", rare: "SCR", mainEffect: "จุติ : ก", cost: 5, gem: 2, power: 4, symbol: "มังกร", color: "แดง", ex: "Only #1" },
] as never).get("BT12-013")!;
const rendered = renderCard(avatar, canon);
for (const needle of ['name: "อิกนิส"', "type: CardType.Avatar", 'print: "BT12-013"', "rare: Rarity.UR", "variants: [Rarity.SCR]",
  "symbol: Symbol.Dragon", "color: Color.Red", 'ex: "Only #1"', "cost: 5", "gem: 2", "power: 4"]) assert.ok(rendered.includes(needle), `renderCard missing ${needle}\n${rendered}`);
// Magic: site cost is the gem count; subtype enum; no cost/power/color
const magic = renderCard(groupRows([{ name: "เวท", type: "Magic", subtype: "React", soi: 3, print: "BT12-050", rare: "C", mainEffect: "ก", cost: 1, symbol: "จอมเวทย์" }] as never).get("BT12-050")!, canon);
assert.ok(magic.includes("subtype: MagicSubtype.React") && magic.includes("gem: 1") && !/\bcost:/.test(magic) && !magic.includes("power:"), magic);
// site "สัตว์วิเศษ" is the fork's WonderAnimal; unknown symbols must fail loudly
assert.ok(renderCard(groupRows([{ name: "ก", type: "Avatar", soi: 3, print: "X-1", rare: "C", cost: 1, gem: 1, power: 1, symbol: "สัตว์วิเศษ", color: "แดง" }] as never).get("X-1")!, canon).includes("Symbol.WonderAnimal"));
assert.throws(() => renderCard(groupRows([{ name: "ก", type: "Avatar", soi: 3, print: "X-2", rare: "C", cost: 1, gem: 1, power: 1, symbol: "ไม่มี", color: "แดง" }] as never).get("X-2")!, canon), /no Symbol/);
// colourless Constructs keep no colour; colourless Avatars fall back to a same-name twin, else fail
const construct = renderCard(groupRows([{ name: "หอ", type: "Construct", soi: 3, print: "X-3", rare: "C", cost: 2, gem: 2, power: 1, symbol: "จอมเวทย์" }] as never).get("X-3")!, canon);
assert.ok(!construct.includes("color:"));
const bare = groupRows([{ name: "ก", type: "Avatar", soi: 3, print: "X-4", rare: "C", cost: 1, gem: 1, power: 1, symbol: "คน" }] as never).get("X-4")!;
assert.throws(() => renderCard(bare, canon), /missing color/);
assert.ok(renderCard(bare, canon, () => {}, () => ({ print: "Y-1", color: "ฟ้า" })).includes("color: Color.Blue"));

// splice: previous last element without trailing comma gets one; CRLF kept; missing enum imports added
const existing = `import { Card, CardType } from "@/src/types/cards";\r\nexport const CARDS_X: Card[] = createCards([\r\n  {\r\n    name: "a",\r\n  }\r\n]);\r\n`;
const spliced = spliceEntries(existing, "X", ['  {\n    type: MagicSubtype.Normal,\n    rare: Rarity.C,\n  },']);
assert.ok(spliced.includes("  },\r\n  {\r\n    type: MagicSubtype.Normal") && spliced.endsWith("]);\r\n"), JSON.stringify(spliced));
assert.ok(/import \{[^}]*MagicSubtype[^}]*\} from "@\/src\/types\/cards"/.test(spliced) && /import \{[^}]*Rarity[^}]*\} from/.test(spliced), spliced);
assert.strictEqual(ensureEnumImports(`import { Card } from '@/src/types/cards';`, "Symbol.God"), `import { Card, Symbol } from '@/src/types/cards';`);
assert.throws(() => spliceEntries("export const A = [];", "X", ["  {},"]), /createCards/);

// report: only real wording/stat differences survive normalisation
const fork = new Map([
  ["A-1", { card: { name: "ก", type: "Avatar", soi: 3, mainEffect: "ทำ {symbol คน} 1  ใบ", cost: 1, gem: 1, power: 1, symbol: "สัตว์มหัศจรรย์", color: "แดง" }, rarities: ["C"] }],
  ["A-2", { card: { name: "ข", type: "Avatar", soi: 3, mainEffect: "เก่า", cost: 1, gem: 1, power: 1, symbol: "คน", color: "แดง" }, rarities: ["C"] }],
]);
const official = groupRows([
  { name: "ก", type: "Avatar", soi: 3, print: "A-1", rare: "C", mainEffect: "ทำ คน 1 ใบ", cost: 1, gem: 1, power: 1, symbol: "สัตว์วิเศษ", color: "แดง" },
  { name: "ข", type: "Avatar", soi: 3, print: "A-2", rare: "C", mainEffect: "ใหม่", cost: 2, gem: 1, power: 1, symbol: "คน", color: "แดง" },
] as never);
const rep = buildReport(fork as never, official);
assert.deepStrictEqual(rep.textChanges, [{ print: "A-2", set: "A", changes: { mainEffect: { old: "เก่า", new: "ใหม่" } } }]);
assert.deepStrictEqual(rep.statChanges, [{ print: "A-2", field: "cost", old: 1, new: 2 }]);
assert.ok(!rep.statChanges.some((c) => c.print === "A-1"));

console.log("all checks pass");
