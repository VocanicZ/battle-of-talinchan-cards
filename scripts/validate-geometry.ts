// Validate normalized card geometry against the repo template.
// Usage: pnpm tsx validate-geometry.ts <dir> [baseline-dir]
import * as fs from "node:fs";
import * as path from "node:path";
import { PNG } from "pngjs";

const dir = process.argv[2];

// landmark: white gem-bar / cost-row region bbox in the top band
function topWhiteBar(p: PNG) {
  let x0 = 9999, x1 = -1, y0 = 9999, y1 = -1;
  for (let y = 20; y < 115; y++) {
    for (let x = 20; x < 368; x++) {
      const i = (y * p.width + x) * 4;
      if (p.data[i] > 235 && p.data[i + 1] > 235 && p.data[i + 2] > 235 && p.data[i + 3] > 200) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

let pass = 0, noBar = 0;
const fails: string[] = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".png"))) {
  const p = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
  if (p.width !== 388 || p.height !== 528) { fails.push(`${f}: size ${p.width}x${p.height}`); continue; }
  const bar = topWhiteBar(p);
  if (!bar) { noBar++; continue; } // Life cards / full-art have no gem bar
  // template geometry: bar at x 36..47, width 300..316 (old sets measure 43/309, text-box cards 36/311)
  if (bar.x >= 33 && bar.x <= 50 && bar.w >= 295 && bar.w <= 320) pass++;
  else fails.push(`${f}: bar x=${bar.x} w=${bar.w}`);
}
console.log(`gem-bar geometry: ${pass} pass, ${noBar} no-bar (life/full-art), ${fails.length} FAIL`);
if (fails.length) console.log(fails.join("\n"));
