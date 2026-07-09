/**
 * Normalize raw CDN card PNGs to this repo's card template:
 * 388x528 canvas, card face inset at (17,18) 354x495, rounded corners r=15.2,
 * transparent margin around it (the composition every pre-existing image uses).
 *
 * Per-file treatment, chosen automatically:
 *   keep   — already has the transparent-margin template (margin >= 8px)
 *   carve  — full-bleed with a uniform thick border (>= 25px): outer margin is
 *            made transparent + rounded mask; art pixels are never moved
 *   shrink — full-bleed with thin border or full-art design: whole canvas is
 *            bilinear-downscaled to 354x495 and centered in the margin
 *
 * Usage: pnpm tsx scripts/normalize-cards.ts <dir-or-file> [...]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { PNG } from "pngjs";
import { resize } from "./scrape";

const W = 388, H = 528;
const RECT = { x: 17, y: 18, w: 354, h: 495 };
const RADIUS = 15.2;

/** Antialiased rounded-rect coverage at pixel center, for the template rect. */
function coverage(x: number, y: number): number {
  const px = x + 0.5, py = y + 0.5;
  if (px < RECT.x || px > RECT.x + RECT.w || py < RECT.y || py > RECT.y + RECT.h) return 0;
  const cx = Math.min(Math.max(px, RECT.x + RADIUS), RECT.x + RECT.w - RADIUS);
  const cy = Math.min(Math.max(py, RECT.y + RADIUS), RECT.y + RECT.h - RADIUS);
  if (cx === px || cy === py) return 1;
  return Math.max(0, Math.min(1, RADIUS - Math.hypot(px - cx, py - cy) + 0.5));
}
const mask = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = coverage(x, y);

function classify(p: PNG): "keep" | "carve" | "shrink" {
  const A = (x: number, y: number) => p.data[(y * p.width + x) * 4 + 3];
  const midY = p.height >> 1;
  let margin = 0;
  while (margin < 60 && A(margin, midY) < 128) margin++;
  // full-bleed re-renders (margin <= 1) keep the template's content grid — always carve, never rescale;
  // narrow-margin renders (2..7) have an oversized face and need shrinking into the template
  if (margin >= 8) return "keep";
  return margin <= 1 ? "carve" : "shrink";
}

export function normalize(buf: Buffer): { out: Buffer; treatment: string } {
  let p = PNG.sync.read(buf);
  if (p.width !== W || p.height !== H) p = PNG.sync.read(resize(buf, W, H));
  const treatment = classify(p);
  if (treatment === "keep") return { out: PNG.sync.write(p), treatment };
  if (treatment === "shrink") {
    const scaled = PNG.sync.read(resize(PNG.sync.write(p), RECT.w, RECT.h));
    const canvas = new PNG({ width: W, height: H }); // zero-filled = transparent
    for (let y = 0; y < RECT.h; y++) {
      scaled.data.copy(canvas.data, ((y + RECT.y) * W + RECT.x) * 4, y * RECT.w * 4, (y + 1) * RECT.w * 4);
    }
    p = canvas;
  }
  // carve (and shrink, if the scaled art has square corners): clamp alpha to the template mask
  for (let i = 0; i < W * H; i++) {
    const a = p.data[i * 4 + 3] * mask[i];
    p.data[i * 4 + 3] = a < 0 ? 0 : a > 255 ? 255 : a;
  }
  return { out: PNG.sync.write(p), treatment };
}

if (process.argv[1] && process.argv[1].endsWith("normalize-cards.ts")) {
  const targets = process.argv.slice(2).flatMap((t) =>
    fs.statSync(t).isDirectory() ? fs.readdirSync(t).filter((f) => f.endsWith(".png")).map((f) => path.join(t, f)) : [t],
  );
  const counts: Record<string, number> = {};
  for (const file of targets) {
    const { out, treatment } = normalize(fs.readFileSync(file));
    fs.writeFileSync(file, out);
    counts[treatment] = (counts[treatment] ?? 0) + 1;
  }
  console.log(`done: ${targets.length} files`, counts);
}
