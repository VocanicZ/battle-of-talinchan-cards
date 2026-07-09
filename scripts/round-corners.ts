/**
 * Normalize every card PNG in images/ to the same full-bleed rounded-corner look:
 *   - cards with the CDN's transparent-margin template (rounded, inset ~354x495 bbox)
 *     are cropped to their opaque bbox and bilinear-upscaled to 388x528
 *   - then every card gets one uniform antialiased rounded-corner alpha mask
 * Overwrites files in place (git-tracked, revert with `git checkout -- images`).
 *
 * Usage: pnpm tsx scripts/round-corners.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { resize } from "./scrape";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES_DIR = process.argv[2] ?? path.join(ROOT, "images");
const W = 388;
const H = 528;
// CDN rounded template: radius 15.2px on a 354px-wide card, scaled to full bleed
const RADIUS = 15.2 * (W / 354);

function opaqueBbox(p: PNG): [number, number, number, number] {
  let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (p.data[(y * p.width + x) * 4 + 3] >= 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

function cropToFullBleed(p: PNG, x0: number, y0: number, w: number, h: number): PNG {
  const crop = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    p.data.copy(crop.data, y * w * 4, ((y + y0) * p.width + x0) * 4, ((y + y0) * p.width + x0 + w) * 4);
  }
  return PNG.sync.read(resize(PNG.sync.write(crop)));
}

/** Antialiased rounded-rect coverage for pixel (x,y): 1 inside, 0 outside, fractional on the arc. */
function coverage(x: number, y: number): number {
  const cx = x + 0.5 < RADIUS ? RADIUS : x + 0.5 > W - RADIUS ? W - RADIUS : x + 0.5;
  const cy = y + 0.5 < RADIUS ? RADIUS : y + 0.5 > H - RADIUS ? H - RADIUS : y + 0.5;
  if (cx === x + 0.5 || cy === y + 0.5) return 1; // not in a corner square
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  return Math.max(0, Math.min(1, RADIUS - d + 0.5));
}

// precompute mask once
const mask = new Float32Array(W * H).fill(1);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if ((x + 0.5 < RADIUS || x + 0.5 > W - RADIUS) && (y + 0.5 < RADIUS || y + 0.5 > H - RADIUS)) {
      mask[y * W + x] = coverage(x, y);
    }
  }
}

const files = fs.readdirSync(IMAGES_DIR).filter((f) => f.endsWith(".png"));
let cropped = 0, masked = 0, skipped = 0;
for (const f of files) {
  const file = path.join(IMAGES_DIR, f);
  let p = PNG.sync.read(fs.readFileSync(file));
  if (p.width !== W || p.height !== H) {
    console.log(`  skip ${f}: ${p.width}x${p.height}`);
    skipped++;
    continue;
  }
  const [x0, y0, w, h] = opaqueBbox(p);
  if (w < W - 2 || h < H - 2) {
    // inset 1px to shave the template's antialiased fringe so edges end up fully opaque
    p = cropToFullBleed(p, x0 + 1, y0 + 1, w - 2, h - 2);
    cropped++;
  }
  for (let i = 0; i < W * H; i++) {
    const a = p.data[i * 4 + 3] * mask[i];
    p.data[i * 4 + 3] = a < 0 ? 0 : a > 255 ? 255 : a;
  }
  fs.writeFileSync(file, PNG.sync.write(p));
  masked++;
}
console.log(`done: ${masked} masked (${cropped} of those margin-cropped+rescaled), ${skipped} skipped`);
