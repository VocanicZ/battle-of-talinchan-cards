// Self-check for scripts/scrape.ts: pnpm tsx scripts/scrape.check.ts
import assert from "node:assert";
import { PNG } from "pngjs";
import { parseLiteral, resize } from "./scrape";

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
console.log("all checks pass");
