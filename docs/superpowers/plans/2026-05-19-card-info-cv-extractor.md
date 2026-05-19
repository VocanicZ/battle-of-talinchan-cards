# Card-Info CV Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI-dispatcher `extract-card-info` skill with a zero-AI computer-vision program that extracts card properties from a PNG.

**Architecture:** A `cv.ts` module of pure vision primitives (region color sampling, normalized cross-correlation template matching, digit segmentation, circle detection). `extract.ts` is the engine — it reads `regions.json` (calibrated pixel rectangles) and a committed `templates/` library, and produces `{ field: {value, confidence, score} }`. `build-templates.ts` crops the template library from the trusted BT01 set. `audit.ts` runs the extractor over every base print and diffs against the card database. The `name` field uses `tesseract.js` (local Thai OCR — not a model).

**Tech Stack:** TypeScript, run via `tsx`. `pngjs` for image decode. `tesseract.js` for Thai OCR. `node:test` + `node:assert` for unit tests. No native deps.

**Reference spec:** `docs/superpowers/specs/2026-05-19-card-info-cv-extractor-design.md`

**Working directory note:** All `npx tsx` / `npx tsc` commands run from the project root `/media/nathanielsong/Sata Programming/battle-of-talinchan-cards`. The skill folder is a shared inode mirrored at `.skill/`, `.claude/skills/`, `.agents/skills/` — editing `.skill/extract-card-info/...` edits all three. Use the `.skill/` path throughout.

---

## File Structure

| File | Responsibility |
|---|---|
| `.skill/extract-card-info/scripts/paths.ts` | Path resolution (exists — unchanged) |
| `.skill/extract-card-info/scripts/cv.ts` | **New.** Vision primitives: sampling, NCC matching, digit segmentation, circle detection |
| `.skill/extract-card-info/scripts/cv.test.ts` | **New.** Unit tests for `cv.ts` |
| `.skill/extract-card-info/scripts/regions.json` | **New.** Calibrated pixel rectangle per field |
| `.skill/extract-card-info/scripts/preview-regions.ts` | **New.** Calibration aid — crops every region from a card for visual check |
| `.skill/extract-card-info/scripts/build-templates.ts` | **New.** Crops the template library from BT01 + a contact sheet |
| `.skill/extract-card-info/scripts/extract.ts` | **New.** The extraction engine + single-card CLI |
| `.skill/extract-card-info/scripts/audit.ts` | **New.** Batch extract + diff vs DB → `audit/report.md` |
| `.skill/extract-card-info/scripts/dump-db.ts` | Modify — add `ex` and `subtype` to the dump |
| `.skill/extract-card-info/templates/` | **New (generated, committed after sign-off).** `symbol/*.png`, `subtype/*.png`, `ex/*.png`, `digit/*.png` |
| `.skill/extract-card-info/SKILL.md` | Rewrite — Mode 1 runs `extract.ts`, Mode 2 runs `audit.ts` |
| `package.json` | Modify — add `tesseract.js` |

**Deleted:** `scan-colors.ts`, `compare.ts`, `build-batches.ts`, `merge-results.ts`.

---

## Task 1: Dependencies and cleanup

**Files:**
- Modify: `package.json`
- Delete: `.skill/extract-card-info/scripts/{scan-colors,compare,build-batches,merge-results}.ts`
- Modify: `.skill/extract-card-info/scripts/dump-db.ts`

- [ ] **Step 1: Install tesseract.js**

Run: `npm install tesseract.js@5`
Expected: `package.json` `dependencies` gains `"tesseract.js": "^5..."`, install succeeds.

- [ ] **Step 2: Delete the four obsolete AI-pipeline scripts**

Run:
```bash
git rm .skill/extract-card-info/scripts/scan-colors.ts \
       .skill/extract-card-info/scripts/compare.ts \
       .skill/extract-card-info/scripts/build-batches.ts \
       .skill/extract-card-info/scripts/merge-results.ts
```
Expected: four files removed.

- [ ] **Step 3: Extend `dump-db.ts` to dump `ex` and `subtype`**

In `dump-db.ts`, add two fields to the `DbEntry` interface, after `power`:
```typescript
  ex?: string;
  subtype?: string;
```
And in the `byPrint.set(print, { ... })` object literal, add after `power: ...`:
```typescript
    ex: card.ex as string | undefined,
    subtype: card.subtype as string | undefined,
```

- [ ] **Step 4: Verify dump-db still runs**

Run: `npx tsx .skill/extract-card-info/scripts/dump-db.ts`
Expected: `db-cards.json written: <N> unique prints` (N ≈ 1025). Confirm `.skill/extract-card-info/audit/db-cards.json` now contains `ex`/`subtype` keys on some entries:
Run: `grep -c '"ex"' ".skill/extract-card-info/audit/db-cards.json"`
Expected: a non-zero count (~101).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .skill/extract-card-info/scripts/dump-db.ts
git commit -m "Add tesseract.js, remove AI-pipeline scripts, dump ex/subtype

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: `cv.ts` — color sampling primitives

**Files:**
- Create: `.skill/extract-card-info/scripts/cv.ts`
- Test: `.skill/extract-card-info/scripts/cv.test.ts`

- [ ] **Step 1: Write the failing test**

Create `cv.test.ts`:
```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { avgRGB, dist, nearestSwatch, type RGB } from './cv.ts';

/** A solid w×h image of one color. */
function solid(w: number, h: number, [r, g, b]: RGB): PNG {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return png;
}

test('avgRGB averages a uniform region', () => {
  const png = solid(10, 10, [100, 150, 200]);
  assert.deepEqual(avgRGB(png, [0, 0, 10, 10]), [100, 150, 200]);
});

test('avgRGB respects the rectangle bounds', () => {
  const png = solid(10, 10, [10, 20, 30]);
  // paint a 2×2 patch at (0,0) a different color
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const i = (10 * y + x) << 2;
    png.data[i] = 200; png.data[i + 1] = 200; png.data[i + 2] = 200;
  }
  assert.deepEqual(avgRGB(png, [0, 0, 2, 2]), [200, 200, 200]);
  assert.deepEqual(avgRGB(png, [5, 5, 2, 2]), [10, 20, 30]);
});

test('dist is euclidean', () => {
  assert.equal(dist([0, 0, 0], [0, 0, 0]), 0);
  assert.equal(dist([0, 0, 0], [3, 4, 0]), 5);
});

test('nearestSwatch picks the closest palette entry, high confidence', () => {
  const palette: Record<string, RGB> = { red: [200, 0, 0], blue: [0, 0, 200] };
  const m = nearestSwatch([195, 5, 5], palette, 55, 30);
  assert.equal(m.value, 'red');
  assert.equal(m.confidence, 'high');
});

test('nearestSwatch flags low confidence when far from every swatch', () => {
  const palette: Record<string, RGB> = { red: [200, 0, 0], blue: [0, 0, 200] };
  const m = nearestSwatch([120, 120, 120], palette, 55, 30);
  assert.equal(m.confidence, 'low');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test .skill/extract-card-info/scripts/cv.test.ts`
Expected: FAIL — `Cannot find module './cv.ts'`.

- [ ] **Step 3: Write the minimal implementation**

Create `cv.ts`:
```typescript
/**
 * Computer-vision primitives for card extraction.
 * Pure functions over a decoded pngjs `PNG`. No AI, no native deps.
 */
import type { PNG } from 'pngjs';

export type RGB = [number, number, number];
/** Pixel rectangle on the card canvas: [x, y, width, height]. */
export type Rect = [number, number, number, number];

export interface FieldMatch {
  value: string;
  confidence: 'high' | 'low';
  score: number;
}

/** Mean RGB over a rectangle. */
export function avgRGB(png: PNG, [x0, y0, w, h]: Rect): RGB {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (png.width * y + x) << 2;
      r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++;
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Euclidean distance between two colors. */
export const dist = (a: RGB, b: RGB): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Nearest-color classify with a confidence margin.
 * Confidence is `high` iff the best swatch is within `maxDist` AND no rival
 * swatch is within `margin` of it.
 */
export function nearestSwatch(
  rgb: RGB,
  palette: Record<string, RGB>,
  maxDist: number,
  margin: number,
): FieldMatch {
  const ranked = Object.entries(palette)
    .map(([label, swatch]) => ({ label, d: dist(rgb, swatch) }))
    .sort((a, b) => a.d - b.d);
  const [best, rival] = ranked;
  const high = best.d <= maxDist && (!rival || rival.d - best.d >= margin);
  // score: 1 at distance 0, 0 at distance maxDist.
  const score = Math.max(0, 1 - best.d / maxDist);
  return { value: best.label, confidence: high ? 'high' : 'low', score };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test .skill/extract-card-info/scripts/cv.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .skill/extract-card-info/scripts/cv.ts .skill/extract-card-info/scripts/cv.test.ts
git commit -m "Add cv.ts color-sampling primitives

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: `cv.ts` — template matching (NCC)

**Files:**
- Modify: `.skill/extract-card-info/scripts/cv.ts`
- Modify: `.skill/extract-card-info/scripts/cv.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `cv.test.ts` (add `crop, ncc, matchBest` to the existing import from `./cv.ts`):
```typescript
test('crop extracts a sub-image', () => {
  const png = solid(10, 10, [0, 0, 0]);
  for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]]) {
    const i = (10 * y + x) << 2;
    png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255;
  }
  const c = crop(png, [3, 3, 2, 2]);
  assert.equal(c.width, 2);
  assert.equal(c.height, 2);
  assert.deepEqual(avgRGB(c, [0, 0, 2, 2]), [255, 255, 255]);
});

test('ncc is 1 for identical images', () => {
  const a = solid(8, 8, [10, 20, 30]);
  // ncc on a flat image is undefined (zero variance) → defined as 0;
  // use a patterned image instead.
  for (let i = 0; i < 32; i++) {
    a.data[i * 4] = 200; a.data[i * 4 + 1] = 200; a.data[i * 4 + 2] = 200;
  }
  const b = solid(8, 8, [10, 20, 30]);
  for (let i = 0; i < 32; i++) {
    b.data[i * 4] = 200; b.data[i * 4 + 1] = 200; b.data[i * 4 + 2] = 200;
  }
  assert.ok(ncc(a, b) > 0.99);
});

test('ncc is low for dissimilar images', () => {
  const a = solid(8, 8, [0, 0, 0]);
  for (let i = 0; i < 32; i++) { a.data[i * 4] = 255; a.data[i * 4 + 1] = 255; a.data[i * 4 + 2] = 255; }
  const b = solid(8, 8, [0, 0, 0]);
  for (let i = 32; i < 64; i++) { b.data[i * 4] = 255; b.data[i * 4 + 1] = 255; b.data[i * 4 + 2] = 255; }
  assert.ok(ncc(a, b) < 0.5);
});

test('matchBest ranks templates and flags confidence', () => {
  const white = solid(8, 8, [0, 0, 0]);
  for (let i = 0; i < 32; i++) { white.data[i * 4] = 255; white.data[i * 4 + 1] = 255; white.data[i * 4 + 2] = 255; }
  const other = solid(8, 8, [0, 0, 0]);
  for (let i = 32; i < 64; i++) { other.data[i * 4] = 255; other.data[i * 4 + 1] = 255; other.data[i * 4 + 2] = 255; }
  const m = matchBest(white, { topHalf: white, bottomHalf: other }, 0.7, 0.15);
  assert.equal(m.value, 'topHalf');
  assert.equal(m.confidence, 'high');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test .skill/extract-card-info/scripts/cv.test.ts`
Expected: FAIL — `crop`, `ncc`, `matchBest` not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `cv.ts` (and add `import { PNG } from 'pngjs';` as a value import at the top — change the existing `import type { PNG }` line to `import { PNG } from 'pngjs';`):
```typescript
/** Extract a rectangular sub-image. */
export function crop(png: PNG, [x0, y0, w, h]: Rect): PNG {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (png.width * (y0 + y) + (x0 + x)) << 2;
      const dst = (w * y + x) << 2;
      out.data[dst] = png.data[src];
      out.data[dst + 1] = png.data[src + 1];
      out.data[dst + 2] = png.data[src + 2];
      out.data[dst + 3] = 255;
    }
  }
  return out;
}

const NCC_SIZE = 32;

/** Nearest-neighbour resample to NCC_SIZE², returned as grayscale 0–255. */
function toGray(png: PNG): Float64Array {
  const g = new Float64Array(NCC_SIZE * NCC_SIZE);
  for (let y = 0; y < NCC_SIZE; y++) {
    for (let x = 0; x < NCC_SIZE; x++) {
      const sx = Math.floor((x / NCC_SIZE) * png.width);
      const sy = Math.floor((y / NCC_SIZE) * png.height);
      const i = (png.width * sy + sx) << 2;
      g[y * NCC_SIZE + x] =
        0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
    }
  }
  return g;
}

/**
 * Normalized cross-correlation of two images, in [-1, 1].
 * Both are resampled to a common size; flat (zero-variance) inputs give 0.
 */
export function ncc(a: PNG, b: PNG): number {
  const ga = toGray(a), gb = toGray(b);
  let ma = 0, mb = 0;
  for (let i = 0; i < ga.length; i++) { ma += ga[i]; mb += gb[i]; }
  ma /= ga.length; mb /= gb.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ga.length; i++) {
    const xa = ga[i] - ma, xb = gb[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/**
 * Match a patch against a labelled template set.
 * `high` iff the best NCC ≥ `minScore` AND beats the runner-up by `margin`.
 */
export function matchBest(
  patch: PNG,
  templates: Record<string, PNG>,
  minScore: number,
  margin: number,
): FieldMatch {
  const ranked = Object.entries(templates)
    .map(([label, tpl]) => ({ label, s: ncc(patch, tpl) }))
    .sort((a, b) => b.s - a.s);
  const [best, rival] = ranked;
  const high =
    best.s >= minScore && (!rival || best.s - rival.s >= margin);
  return { value: best.label, confidence: high ? 'high' : 'low', score: best.s };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test .skill/extract-card-info/scripts/cv.test.ts`
Expected: PASS — 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .skill/extract-card-info/scripts/cv.ts .skill/extract-card-info/scripts/cv.test.ts
git commit -m "Add NCC template matching to cv.ts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: `cv.ts` — digit segmentation

**Files:**
- Modify: `.skill/extract-card-info/scripts/cv.ts`
- Modify: `.skill/extract-card-info/scripts/cv.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `cv.test.ts` (add `segmentDigits` to the `./cv.ts` import):
```typescript
test('segmentDigits splits two ink blocks separated by background', () => {
  // 20×10 image, background black, two 4-px-wide white blocks with a gap.
  const png = solid(20, 10, [0, 0, 0]);
  const paintCol = (xs: number[]) => {
    for (const x of xs) {
      for (let y = 0; y < 10; y++) {
        const i = (20 * y + x) << 2;
        png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255;
      }
    }
  };
  paintCol([2, 3, 4, 5]);      // block 1
  paintCol([12, 13, 14, 15]);  // block 2
  const digits = segmentDigits(png);
  assert.equal(digits.length, 2);
  assert.equal(digits[0].width, 4);
  assert.equal(digits[1].width, 4);
});

test('segmentDigits returns one segment for a single block', () => {
  const png = solid(20, 10, [0, 0, 0]);
  for (let x = 8; x < 12; x++) {
    for (let y = 0; y < 10; y++) {
      const i = (20 * y + x) << 2;
      png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255;
    }
  }
  assert.equal(segmentDigits(png).length, 1);
});

test('segmentDigits returns empty for a blank patch', () => {
  assert.equal(segmentDigits(solid(20, 10, [0, 0, 0])).length, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test .skill/extract-card-info/scripts/cv.test.ts`
Expected: FAIL — `segmentDigits` not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `cv.ts`:
```typescript
/** Mean color of the patch's four corner pixels — the background estimate. */
function cornerBg(png: PNG): RGB {
  const w = png.width, h = png.height;
  const corners: RGB[] = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(
    ([x, y]) => {
      const i = (w * y + x) << 2;
      return [png.data[i], png.data[i + 1], png.data[i + 2]] as RGB;
    },
  );
  return [
    Math.round(corners.reduce((s, c) => s + c[0], 0) / 4),
    Math.round(corners.reduce((s, c) => s + c[1], 0) / 4),
    Math.round(corners.reduce((s, c) => s + c[2], 0) / 4),
  ];
}

const INK_DIST = 70;       // colour distance from background to count as "ink"
const MIN_INK_FRAC = 0.12; // fraction of a column that must be ink

/**
 * Split a number region into digit-sized columns.
 * A column is "ink" if enough of its pixels differ from the background;
 * contiguous ink columns form one digit. Returns each digit cropped, left
 * to right (0 segments = blank patch).
 */
export function segmentDigits(png: PNG): PNG[] {
  const bg = cornerBg(png);
  const inkCol: boolean[] = [];
  for (let x = 0; x < png.width; x++) {
    let ink = 0;
    for (let y = 0; y < png.height; y++) {
      const i = (png.width * y + x) << 2;
      const d = dist([png.data[i], png.data[i + 1], png.data[i + 2]], bg);
      if (d > INK_DIST) ink++;
    }
    inkCol.push(ink >= png.height * MIN_INK_FRAC);
  }
  const segments: PNG[] = [];
  let start = -1;
  for (let x = 0; x <= inkCol.length; x++) {
    if (inkCol[x] && start < 0) start = x;
    else if (!inkCol[x] && start >= 0) {
      segments.push(crop(png, [start, 0, x - start, png.height]));
      start = -1;
    }
  }
  return segments;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test .skill/extract-card-info/scripts/cv.test.ts`
Expected: PASS — 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .skill/extract-card-info/scripts/cv.ts .skill/extract-card-info/scripts/cv.test.ts
git commit -m "Add digit segmentation to cv.ts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: `cv.ts` — customLimit circle detection

**Files:**
- Modify: `.skill/extract-card-info/scripts/cv.ts`
- Modify: `.skill/extract-card-info/scripts/cv.test.ts`

The override circle is a large disc with a bright-red ring in the top-right
corner. Detection proxy: the fraction of strongly-red pixels in the region
exceeds a threshold.

- [ ] **Step 1: Write the failing test**

Append to `cv.test.ts` (add `hasCircle` to the `./cv.ts` import):
```typescript
test('hasCircle is true when the region is heavily red', () => {
  const png = solid(40, 40, [190, 40, 40]); // strong red region
  assert.equal(hasCircle(png, [0, 0, 40, 40]), true);
});

test('hasCircle is false for a non-red region', () => {
  const png = solid(40, 40, [200, 200, 200]); // grey region
  assert.equal(hasCircle(png, [0, 0, 40, 40]), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test .skill/extract-card-info/scripts/cv.test.ts`
Expected: FAIL — `hasCircle` not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `cv.ts`:
```typescript
const CIRCLE_RED_FRAC = 0.18; // min fraction of strong-red pixels

/** True if a strongly-red pixel cluster (the override circle ring) fills the region. */
export function hasCircle(png: PNG, [x0, y0, w, h]: Rect): boolean {
  let red = 0, n = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (png.width * y + x) << 2;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      if (r > 140 && g < 95 && b < 95) red++;
      n++;
    }
  }
  return n > 0 && red / n >= CIRCLE_RED_FRAC;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test .skill/extract-card-info/scripts/cv.test.ts`
Expected: PASS — 14 tests pass.

- [ ] **Step 5: Type-check the whole scripts folder**

Run: `npx tsc -p .skill/extract-card-info/scripts/tsconfig.json`
Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add .skill/extract-card-info/scripts/cv.ts .skill/extract-card-info/scripts/cv.test.ts
git commit -m "Add override-circle detection to cv.ts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: `regions.json` + the calibration aid

**Files:**
- Create: `.skill/extract-card-info/scripts/regions.json`
- Create: `.skill/extract-card-info/scripts/preview-regions.ts`

Card images are a uniform 388×528. Every field's pixel rectangle is recorded
here so it can be tuned without code edits.

- [ ] **Step 1: Create `regions.json` with starting coordinates**

These are seed values derived from the old `scan-colors.ts` (`costBox` was
`[34,34,28,28]`). They WILL be tuned in Step 4.
```json
{
  "border":    [6, 6, 376, 8],
  "costBox":   [34, 34, 28, 28],
  "costNum":   [26, 56, 48, 38],
  "gemStrip":  [110, 16, 168, 34],
  "symbol":    [322, 12, 52, 52],
  "ex":        [330, 60, 38, 38],
  "powerNum":  [24, 462, 56, 44],
  "circle":    [288, 6, 94, 94],
  "namePlate": [140, 470, 210, 44]
}
```

- [ ] **Step 2: Create `preview-regions.ts`**

```typescript
/**
 * Calibration aid — crops every regions.json rectangle from a card image and
 * writes them side by side so the rectangles can be eyeballed and tuned.
 *
 * Usage: npx tsx .skill/extract-card-info/scripts/preview-regions.ts BT01-001
 * Output: <skill>/audit/regions-preview/<print>/<field>.png
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { auditDir, imagesDir, skillDir } from './paths.ts';
import { crop, type Rect } from './cv.ts';

const print = process.argv[2];
if (!print) throw new Error('usage: preview-regions.ts <print-code>');

const regions = JSON.parse(
  readFileSync(join(skillDir, 'scripts/regions.json'), 'utf8'),
) as Record<string, Rect>;

const png = PNG.sync.read(readFileSync(join(imagesDir, `${print}.png`)));
const outDir = join(auditDir, 'regions-preview', print);
mkdirSync(outDir, { recursive: true });

for (const [field, rect] of Object.entries(regions)) {
  const c = crop(png, rect);
  writeFileSync(join(outDir, `${field}.png`), PNG.sync.write(c));
}
console.log(`wrote ${Object.keys(regions).length} region crops to ${outDir}`);
```

- [ ] **Step 3: Run the preview on three card types**

Run:
```bash
npx tsx .skill/extract-card-info/scripts/preview-regions.ts BT01-001
npx tsx .skill/extract-card-info/scripts/preview-regions.ts BT01-050
```
Expected: crops written under `.skill/extract-card-info/audit/regions-preview/`.

- [ ] **Step 4: Calibrate (human visual step)**

Open the generated crops (`audit/regions-preview/BT01-001/*.png`). For each
field, confirm the crop tightly contains the intended element:
- `border` — solid border colour, no art bleed.
- `costBox` — the COST label box background, no digits.
- `costNum` — the cost digit(s), centred, minimal box bleed.
- `gemStrip` — all 4 gem slots, nothing else.
- `symbol` — the top-right race icon, centred.
- `ex` — the stamp icon under the race icon.
- `powerNum` — the power digit(s).
- `circle` — the override-circle area (will be mostly art when absent).
- `namePlate` — the Thai name text only.

Adjust the numbers in `regions.json` and re-run Step 3 until every crop is
tight. This is a visual judgement — iterate until satisfied.

- [ ] **Step 5: Commit**

```bash
git add .skill/extract-card-info/scripts/regions.json .skill/extract-card-info/scripts/preview-regions.ts
git commit -m "Add calibrated regions.json and the region-preview aid

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: `build-templates.ts` — the template library

**Files:**
- Create: `.skill/extract-card-info/scripts/build-templates.ts`
- Create (generated): `.skill/extract-card-info/templates/{symbol,subtype,ex,digit}/*.png`, `templates/contact-sheet.png`

- [ ] **Step 1: Create `build-templates.ts`**

```typescript
/**
 * One-time builder for the template library.
 *
 * For each distinct symbol / subtype / ex value, and for each digit 0–9, it
 * picks an exemplar card from the database (BT01 preferred — the trusted
 * golden set), crops the field region from that card's image, and saves it as
 * templates/<field>/<value>.png. A contact sheet of every crop is emitted for
 * human sign-off before the templates are committed.
 *
 * Usage: npx tsx .skill/extract-card-info/scripts/build-templates.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { cardHelpers, imagesDir, skillDir } from './paths.ts';
import { crop, segmentDigits, type Rect } from './cv.ts';

const regions = JSON.parse(
  readFileSync(join(skillDir, 'scripts/regions.json'), 'utf8'),
) as Record<string, Rect>;

const { getAllCards } = (await import(pathToFileURL(cardHelpers).href)) as {
  getAllCards: () => Record<string, unknown>[];
};
const cards = getAllCards();

const templatesDir = join(skillDir, 'templates');

/** Read a card image by print code, or null if missing. */
function image(print: string): PNG | null {
  try {
    return PNG.sync.read(readFileSync(join(imagesDir, `${print}.png`)));
  } catch {
    return null;
  }
}

/** First card (BT01 preferred) whose `field` equals `value` and has an image. */
function exemplar(field: string, value: string): { print: string; png: PNG } | null {
  const sorted = [...cards].sort((a, b) => {
    const ap = String(a.print).startsWith('BT01') ? 0 : 1;
    const bp = String(b.print).startsWith('BT01') ? 0 : 1;
    return ap - bp;
  });
  for (const c of sorted) {
    if (String(c[field] ?? '') !== value) continue;
    const png = image(String(c.print));
    if (png && png.width === 388 && png.height === 528) {
      return { print: String(c.print), png };
    }
  }
  return null;
}

const crops: { label: string; png: PNG }[] = [];

/** Crop one icon template for every distinct value of an enum field. */
function buildIconField(field: string, region: Rect) {
  const values = [...new Set(cards.map((c) => c[field]).filter(Boolean))].map(
    String,
  );
  mkdirSync(join(templatesDir, field), { recursive: true });
  for (const value of values) {
    const ex = exemplar(field, value);
    if (!ex) {
      console.warn(`  no exemplar for ${field}=${value}`);
      continue;
    }
    const c = crop(ex.png, region);
    // file name: sanitise so Thai/symbol values are filesystem-safe
    const safe = Buffer.from(value).toString('base64url');
    writeFileSync(join(templatesDir, field, `${safe}.png`), PNG.sync.write(c));
    crops.push({ label: `${field}:${value}`, png: c });
  }
}

buildIconField('symbol', regions.symbol);
buildIconField('subtype', regions.subtype ?? regions.costBox);
buildIconField('ex', regions.ex);

// Digits 0–9: crop from the cost region of cards whose cost is that digit.
mkdirSync(join(templatesDir, 'digit'), { recursive: true });
for (let d = 0; d <= 9; d++) {
  const card = [...cards]
    .sort((a, b) => (String(a.print).startsWith('BT01') ? -1 : 1))
    .find((c) => c.cost === d);
  if (!card) { console.warn(`  no exemplar for digit ${d}`); continue; }
  const png = image(String(card.print));
  if (!png) continue;
  const segs = segmentDigits(crop(png, regions.costNum));
  if (segs.length !== 1) {
    console.warn(`  digit ${d}: expected 1 segment, got ${segs.length} (${card.print})`);
    continue;
  }
  writeFileSync(join(templatesDir, 'digit', `${d}.png`), PNG.sync.write(segs[0]));
  crops.push({ label: `digit:${d}`, png: segs[0] });
}

// Contact sheet: a grid of every crop, each cell 64×64, for human review.
const CELL = 64, COLS = 8;
const rows = Math.ceil(crops.length / COLS);
const sheet = new PNG({ width: COLS * CELL, height: rows * CELL });
sheet.data.fill(255);
crops.forEach((c, idx) => {
  const cx = (idx % COLS) * CELL, cy = Math.floor(idx / COLS) * CELL;
  for (let y = 0; y < Math.min(CELL, c.png.height); y++) {
    for (let x = 0; x < Math.min(CELL, c.png.width); x++) {
      const s = (c.png.width * y + x) << 2;
      const d = (sheet.width * (cy + y) + (cx + x)) << 2;
      sheet.data[d] = c.png.data[s];
      sheet.data[d + 1] = c.png.data[s + 1];
      sheet.data[d + 2] = c.png.data[s + 2];
      sheet.data[d + 3] = 255;
    }
  }
});
writeFileSync(join(templatesDir, 'contact-sheet.png'), PNG.sync.write(sheet));
writeFileSync(
  join(templatesDir, 'contact-sheet-index.json'),
  JSON.stringify(crops.map((c) => c.label), null, 2),
);
console.log(`built ${crops.length} templates; review templates/contact-sheet.png`);
```

- [ ] **Step 2: Add `subtype` to `regions.json`**

The Magic subtype pictogram sits in the COST-box position. Add to `regions.json`:
```json
  "subtype": [30, 30, 36, 36]
```
(seed value — verify in Step 4 against a Magic card such as BT01-050.)

- [ ] **Step 3: Run the builder**

Run: `npx tsx .skill/extract-card-info/scripts/build-templates.ts`
Expected: `built <N> templates; review templates/contact-sheet.png`. Note any
`no exemplar` / `expected 1 segment` warnings.

- [ ] **Step 4: Human sign-off (visual step)**

Open `.skill/extract-card-info/templates/contact-sheet.png`. Cross-reference
each cell against `contact-sheet-index.json` (same order). Confirm every cell
shows the correct, recognisable icon/digit for its label. If a crop is wrong:
- bad region → fix `regions.json`, re-run Step 3;
- bad exemplar (icon on busy art) → note the label; the engine will tolerate it
  via the confidence margin, or pick a cleaner exemplar manually.
Do not commit until the sheet looks correct.

- [ ] **Step 5: Commit (templates included)**

```bash
git add .skill/extract-card-info/scripts/build-templates.ts \
        .skill/extract-card-info/scripts/regions.json \
        .skill/extract-card-info/templates
git commit -m "Add build-templates.ts and the committed template library

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: `extract.ts` — engine skeleton + type / color / gem

**Files:**
- Create: `.skill/extract-card-info/scripts/extract.ts`
- Test: `.skill/extract-card-info/scripts/extract.test.ts`

`extract.ts` exports `extractCard(print)` and also runs as a CLI. This task
builds the skeleton plus the three template-free fields.

- [ ] **Step 1: Write the failing test**

Create `extract.test.ts`. It runs the real extractor against known BT01 cards
(BT01-001 is a Red Avatar, gem 2; BT01-050 is a Magic card).
```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCard } from './extract.ts';

test('extractCard reads type/color/gem for a Red Avatar (BT01-001)', () => {
  const r = extractCard('BT01-001');
  assert.equal(r.print, 'BT01-001');
  assert.equal(r.fields.type?.value, 'Avatar');
  assert.equal(r.fields.color?.value, 'แดง');
  assert.equal(r.fields.gem?.value, 2);
});

test('extractCard reads type for a Magic card (BT01-050)', () => {
  const r = extractCard('BT01-050');
  assert.equal(r.fields.type?.value, 'Magic');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test .skill/extract-card-info/scripts/extract.test.ts`
Expected: FAIL — `Cannot find module './extract.ts'`.

- [ ] **Step 3: Write the minimal implementation**

Create `extract.ts`:
```typescript
/**
 * The card-extraction engine. Given a print code, reads the card image and
 * extracts its properties with zero AI — region colour sampling, NCC template
 * matching, digit segmentation. Every field carries a confidence flag.
 *
 * Usage (single card): npx tsx .skill/extract-card-info/scripts/extract.ts BT01-001
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { imagesDir, skillDir } from './paths.ts';
import { avgRGB, hasCircle, nearestSwatch, type Rect, type RGB } from './cv.ts';

const regions = JSON.parse(
  readFileSync(join(skillDir, 'scripts/regions.json'), 'utf8'),
) as Record<string, Rect>;

export interface FieldResult {
  value: string | number | null;
  confidence: 'high' | 'low';
  score: number;
}
export interface CardResult {
  print: string;
  source: 'image' | 'inherited';
  fields: Record<string, FieldResult>;
}

// Border colour → card type. Calibrated against BT01.
const TYPE_PALETTE: Record<string, RGB> = {
  Avatar: [193, 47, 47],   // red
  Magic: [60, 96, 168],    // blue
  Construct: [216, 178, 58], // yellow
  Life: [90, 90, 90],      // gray/black
};
// Card colour (COST box) → Color enum value. From the old scan-colors palette.
const COLOR_PALETTE: Record<string, RGB> = {
  แดง: [193, 63, 64],
  ฟ้า: [85, 116, 168],
  ม่วง: [98, 70, 117],
  เขียว: [60, 155, 90],
};
// Gem fill → Color enum value. None = transparent (reads near header grey).
const GEM_PALETTE: Record<string, RGB> = {
  ฟ้า: [85, 116, 168],
  ม่วง: [98, 70, 117],
  แดง: [193, 63, 64],
  ดำ: [40, 40, 40],
};

const TYPE_MAX_DIST = 80, TYPE_MARGIN = 25;
const COLOR_MAX_DIST = 55, COLOR_MARGIN = 30;
const GEM_SLOT_W = 38; // approx per-slot width inside gemStrip — tune if needed
const GEM_EMPTY_DIST = 60; // sampled colour within this of header grey = empty

/** Load a 388×528 card image, or throw. */
function loadCard(print: string): PNG {
  const png = PNG.sync.read(readFileSync(join(imagesDir, `${print}.png`)));
  if (png.width !== 388 || png.height !== 528) {
    throw new Error(`${print}: non-standard ${png.width}×${png.height}`);
  }
  return png;
}

/** Count filled gem slots and resolve their (uniform) colour. */
function readGems(png: PNG): { gem: FieldResult; gemColor: FieldResult } {
  const [sx, sy, , sh] = regions.gemStrip;
  const headerGrey = avgRGB(png, [sx, sy, 6, sh]); // strip background estimate
  let filled = 0;
  const colors: string[] = [];
  let minScore = 1;
  for (let slot = 0; slot < 4; slot++) {
    const rect: Rect = [sx + slot * GEM_SLOT_W + 8, sy + 6, 16, sh - 12];
    const rgb = avgRGB(png, rect);
    if (Math.hypot(rgb[0] - headerGrey[0], rgb[1] - headerGrey[1], rgb[2] - headerGrey[2]) < GEM_EMPTY_DIST) {
      continue; // empty slot
    }
    filled++;
    const m = nearestSwatch(rgb, GEM_PALETTE, COLOR_MAX_DIST, COLOR_MARGIN);
    colors.push(m.value);
    minScore = Math.min(minScore, m.score);
  }
  const uniform = colors.length === 0 || colors.every((c) => c === colors[0]);
  return {
    gem: { value: filled, confidence: 'high', score: 1 },
    gemColor: {
      value: colors.length ? (uniform ? colors[0] : 'ไม่มีสี') : 'ไม่มีสี',
      confidence: uniform ? 'high' : 'low',
      score: minScore,
    },
  };
}

/** Extract every field from a single card image. */
export function extractCard(print: string): CardResult {
  const png = loadCard(print);
  const fields: Record<string, FieldResult> = {};

  // type — border colour
  const typeM = nearestSwatch(
    avgRGB(png, regions.border), TYPE_PALETTE, TYPE_MAX_DIST, TYPE_MARGIN,
  );
  fields.type = typeM;
  const type = typeM.value;

  // color — COST box background (Avatar/Construct only)
  if (type === 'Avatar' || type === 'Construct') {
    fields.color = nearestSwatch(
      avgRGB(png, regions.costBox), COLOR_PALETTE, COLOR_MAX_DIST, COLOR_MARGIN,
    );
    const g = readGems(png);
    fields.gem = g.gem;
    fields.gemColor = g.gemColor;
  }

  // override circle — record for occlusion handling by later tasks
  void hasCircle;

  return { print, source: 'image', fields };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const print = process.argv[2];
  if (!print) throw new Error('usage: extract.ts <print-code>');
  console.log(JSON.stringify(extractCard(print), null, 2));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test .skill/extract-card-info/scripts/extract.test.ts`
Expected: PASS — 2 tests pass. If `gem` or `color` is wrong, tune `GEM_SLOT_W`,
`GEM_EMPTY_DIST`, or `regions.gemStrip` / `regions.costBox` and re-run.

- [ ] **Step 5: Commit**

```bash
git add .skill/extract-card-info/scripts/extract.ts .skill/extract-card-info/scripts/extract.test.ts
git commit -m "Add extract.ts engine skeleton with type/color/gem

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: `extract.ts` — symbol / subtype / ex template fields

**Files:**
- Modify: `.skill/extract-card-info/scripts/extract.ts`
- Modify: `.skill/extract-card-info/scripts/extract.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `extract.test.ts`:
```typescript
test('extractCard reads symbol for BT01-001 (Symbol.Giant = ยักษ์)', () => {
  const r = extractCard('BT01-001');
  assert.equal(r.fields.symbol?.value, 'ยักษ์');
});

test('extractCard marks symbol unknown when the override circle occludes it', () => {
  // pick a card with a customLimit override circle; replace with a real print
  // from `grep -rl "customLimit:" src/cards/` whose image exists.
  const r = extractCard('SD02-003');
  assert.equal(r.fields.symbol?.value, 'unknown');
  assert.equal(r.fields.symbol?.confidence, 'low');
});
```
(If `SD02-003` is not a circle-override card with an image, substitute another
from `grep -rl "customLimit:" src/cards/`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test .skill/extract-card-info/scripts/extract.test.ts`
Expected: FAIL — `symbol` field is `undefined`.

- [ ] **Step 3: Write the implementation**

In `extract.ts`, add to the imports from `./cv.ts`: `crop`, `matchBest`.
Add after `const regions = ...`:
```typescript
import { existsSync, readdirSync } from 'node:fs';

const templatesDir = join(skillDir, 'templates');
const TPL_MIN_SCORE = 0.55, TPL_MARGIN = 0.08;

/** Load every template PNG for one field into a label→PNG map. */
function loadTemplates(field: string): Record<string, PNG> {
  const dir = join(templatesDir, field);
  if (!existsSync(dir)) return {};
  const out: Record<string, PNG> = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.png'))) {
    const base = file.replace(/\.png$/, '');
    // icon templates are base64url-encoded Thai/symbol values; digits are plain
    const label = field === 'digit'
      ? base
      : Buffer.from(base, 'base64url').toString('utf8');
    out[label] = PNG.sync.read(readFileSync(join(dir, file)));
  }
  return out;
}

const SYMBOL_TPL = loadTemplates('symbol');
const SUBTYPE_TPL = loadTemplates('subtype');
const EX_TPL = loadTemplates('ex');
```
Then, inside `extractCard`, before `return`, add:
```typescript
  // override circle occludes the top-right symbol + ex icons
  const occluded = hasCircle(png, regions.circle);

  // symbol — race icon, top-right (PlayableCard: Avatar/Magic/Construct)
  if (type !== 'Life') {
    if (occluded) {
      fields.symbol = { value: 'unknown', confidence: 'low', score: 0 };
    } else {
      fields.symbol = matchBest(
        crop(png, regions.symbol), SYMBOL_TPL, TPL_MIN_SCORE, TPL_MARGIN,
      );
    }
  }

  // subtype — Magic only, COST-box position
  if (type === 'Magic') {
    fields.subtype = matchBest(
      crop(png, regions.subtype), SUBTYPE_TPL, TPL_MIN_SCORE, TPL_MARGIN,
    );
  }

  // ex — stamp under the race icon
  if (occluded) {
    fields.ex = { value: 'unknown', confidence: 'low', score: 0 };
  } else {
    const m = matchBest(crop(png, regions.ex), EX_TPL, TPL_MIN_SCORE, TPL_MARGIN);
    // a low-confidence ex match most often means "no stamp present"
    fields.ex = m.confidence === 'high'
      ? m
      : { value: null, confidence: 'high', score: m.score };
  }
```
Delete the now-unused `void hasCircle;` line.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test .skill/extract-card-info/scripts/extract.test.ts`
Expected: PASS — 4 tests pass. If `symbol` mismatches, lower `TPL_MIN_SCORE` or
re-check the `symbol` template crop in Task 7's contact sheet.

- [ ] **Step 5: Commit**

```bash
git add .skill/extract-card-info/scripts/extract.ts .skill/extract-card-info/scripts/extract.test.ts
git commit -m "Add symbol/subtype/ex template extraction

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: `extract.ts` — cost / power / customLimit digits

**Files:**
- Modify: `.skill/extract-card-info/scripts/extract.ts`
- Modify: `.skill/extract-card-info/scripts/extract.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `extract.test.ts`:
```typescript
test('extractCard reads cost and power for BT01-001 (cost 3, power 3)', () => {
  const r = extractCard('BT01-001');
  assert.equal(r.fields.cost?.value, 3);
  assert.equal(r.fields.power?.value, 3);
});

test('extractCard reads a two-digit customLimit override', () => {
  // a card with customLimit 12 or 50; replace with a real print whose image exists.
  const r = extractCard('SD02-003');
  assert.equal(typeof r.fields.customLimit?.value, 'number');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test .skill/extract-card-info/scripts/extract.test.ts`
Expected: FAIL — `cost`/`power`/`customLimit` undefined.

- [ ] **Step 3: Write the implementation**

In `extract.ts`, add `segmentDigits` to the `./cv.ts` import. Add after the
template-map constants:
```typescript
const DIGIT_TPL = loadTemplates('digit');
const DIGIT_MIN_SCORE = 0.5;

/**
 * Read a 1–3 digit number from a region: segment into digit columns, match
 * each against the 0–9 glyph templates, concatenate. Returns null if no
 * digits segment out.
 */
function readNumber(png: PNG, rect: Rect): FieldResult | null {
  const segs = segmentDigits(crop(png, rect)).slice(0, 3);
  if (segs.length === 0) return null;
  let digits = '';
  let minScore = 1;
  for (const seg of segs) {
    const m = matchBest(seg, DIGIT_TPL, DIGIT_MIN_SCORE, 0.05);
    digits += m.value;
    minScore = Math.min(minScore, m.score);
  }
  const value = Number(digits);
  return {
    value: Number.isNaN(value) ? null : value,
    confidence: minScore >= DIGIT_MIN_SCORE ? 'high' : 'low',
    score: minScore,
  };
}
```
Inside `extractCard`, before `return`, add:
```typescript
  // cost — COST box number (PlayableCard)
  if (type !== 'Life') {
    const c = readNumber(png, regions.costNum);
    if (c) fields.cost = c;
  }
  // power — POWER box number (Avatar/Construct)
  if (type === 'Avatar' || type === 'Construct') {
    const p = readNumber(png, regions.powerNum);
    if (p) fields.power = p;
  }
  // customLimit — only when the override circle is present
  if (occluded) {
    const cl = readNumber(png, regions.circle);
    if (cl) fields.customLimit = cl;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test .skill/extract-card-info/scripts/extract.test.ts`
Expected: PASS — 6 tests pass. If a digit misreads, re-check the `digit`
templates in the contact sheet and tune `regions.costNum` / `regions.powerNum`.

- [ ] **Step 5: Commit**

```bash
git add .skill/extract-card-info/scripts/extract.ts .skill/extract-card-info/scripts/extract.test.ts
git commit -m "Add cost/power/customLimit digit extraction

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: `extract.ts` — name via tesseract.js OCR

**Files:**
- Modify: `.skill/extract-card-info/scripts/extract.ts`
- Modify: `.skill/extract-card-info/scripts/extract.test.ts`

`tesseract.js` is async, so `extractCard` gains an async sibling `extractName`.
Keep `extractCard` synchronous for all non-name fields; add `extractCardFull`
that awaits the name.

- [ ] **Step 1: Write the failing test**

Append to `extract.test.ts`:
```typescript
import { extractCardFull } from './extract.ts';

test('extractCardFull adds a name field', async () => {
  const r = await extractCardFull('BT01-001');
  assert.ok(r.fields.name, 'name field present');
  assert.equal(typeof r.fields.name?.value, 'string');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test .skill/extract-card-info/scripts/extract.test.ts`
Expected: FAIL — `extractCardFull` not exported.

- [ ] **Step 3: Write the implementation**

In `extract.ts` add at the top: `import { createWorker } from 'tesseract.js';`
Append before the CLI block:
```typescript
/** OCR the Thai name plate. Tesseract confidence (0–100) maps to high/low. */
async function readName(print: string): Promise<FieldResult> {
  const png = loadCard(print);
  const plate = crop(png, regions.namePlate);
  const worker = await createWorker('tha');
  try {
    const { data } = await worker.recognize(PNG.sync.write(plate));
    const text = data.text.trim().replace(/\s+/g, ' ');
    return {
      value: text || null,
      confidence: data.confidence >= 70 ? 'high' : 'low',
      score: data.confidence / 100,
    };
  } finally {
    await worker.terminate();
  }
}

/** extractCard + the async OCR `name` field. */
export async function extractCardFull(print: string): Promise<CardResult> {
  const base = extractCard(print);
  base.fields.name = await readName(print);
  return base;
}
```
Update the CLI block to use the full extractor:
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  const print = process.argv[2];
  if (!print) throw new Error('usage: extract.ts <print-code>');
  extractCardFull(print).then((r) => console.log(JSON.stringify(r, null, 2)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test .skill/extract-card-info/scripts/extract.test.ts`
Expected: PASS — 7 tests pass. First run downloads the Thai language data
(slow, ~10 MB, cached afterwards). The OCR'd name need not be exact — the test
only requires a string.

- [ ] **Step 5: Smoke-test the CLI**

Run: `npx tsx .skill/extract-card-info/scripts/extract.ts BT01-001`
Expected: a JSON object with `type`, `color`, `gem`, `symbol`, `cost`, `power`,
`name` fields, each `{ value, confidence, score }`.

- [ ] **Step 6: Commit**

```bash
git add .skill/extract-card-info/scripts/extract.ts .skill/extract-card-info/scripts/extract.test.ts
git commit -m "Add Thai name OCR via tesseract.js

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 12: `extract.ts` — variant-print inheritance

**Files:**
- Modify: `.skill/extract-card-info/scripts/extract.ts`
- Modify: `.skill/extract-card-info/scripts/extract.test.ts`

A `-SUFFIX` print (e.g. `BT01-001-SCR`) has identical card data to its base.
The extractor resolves the base, reuses its result, and tags it `inherited`.

- [ ] **Step 1: Write the failing test**

Append to `extract.test.ts`:
```typescript
import { resolveBasePrint } from './extract.ts';

test('resolveBasePrint strips known rarity suffixes', () => {
  assert.equal(resolveBasePrint('BT01-001-SCR'), 'BT01-001');
  assert.equal(resolveBasePrint('BT01-001-CBR'), 'BT01-001');
  assert.equal(resolveBasePrint('BT01-001'), 'BT01-001');
});

test('extractCardFull tags a variant print as inherited', async () => {
  const r = await extractCardFull('BT01-001-SCR');
  assert.equal(r.print, 'BT01-001-SCR');
  assert.equal(r.source, 'inherited');
  assert.equal(r.fields.type?.value, 'Avatar');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test .skill/extract-card-info/scripts/extract.test.ts`
Expected: FAIL — `resolveBasePrint` not exported.

- [ ] **Step 3: Write the implementation**

In `extract.ts` add near the top (after the `regions` const):
```typescript
// Rarity / promo suffixes that mark a variant of a base print.
const VARIANT_SUFFIX = /-(SCR|UR|CBR|PR\d?|SR|R|C|USEC|PROMO)$/i;

/** Strip a variant suffix to the base print code. */
export function resolveBasePrint(print: string): string {
  return print.replace(VARIANT_SUFFIX, '');
}
```
In `extractCardFull`, replace the body with:
```typescript
export async function extractCardFull(print: string): Promise<CardResult> {
  const base = resolveBasePrint(print);
  if (base !== print && existsSync(join(imagesDir, `${base}.png`))) {
    const inherited = await extractCardFull(base);
    return { print, source: 'inherited', fields: inherited.fields };
  }
  const result = extractCard(print);
  result.fields.name = await readName(print);
  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test .skill/extract-card-info/scripts/extract.test.ts`
Expected: PASS — 9 tests pass.

- [ ] **Step 5: Type-check**

Run: `npx tsc -p .skill/extract-card-info/scripts/tsconfig.json`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add .skill/extract-card-info/scripts/extract.ts .skill/extract-card-info/scripts/extract.test.ts
git commit -m "Add variant-print inheritance to the extractor

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 13: `audit.ts` — batch extract + diff vs DB

**Files:**
- Create: `.skill/extract-card-info/scripts/audit.ts`

- [ ] **Step 1: Write `audit.ts`**

```typescript
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

const FIELDS = ['type', 'color', 'gem', 'gemColor', 'symbol', 'ex',
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
```

- [ ] **Step 2: Run the full pipeline on the golden set**

Run:
```bash
npx tsx .skill/extract-card-info/scripts/dump-db.ts
npx tsx .skill/extract-card-info/scripts/audit.ts
```
Expected: `report.md: N mismatch(es), M uncertain`. Open
`.skill/extract-card-info/audit/report.md`.

- [ ] **Step 3: Accuracy gate (verification against BT01)**

In `report.md`, inspect the ❌ mismatches whose `Print` starts with `BT01`.
BT01 is the trusted golden set, so a correct extractor should produce **very
few** high-confidence BT01 mismatches. For each BT01 mismatch:
- if the *image* value is actually right and the DB is wrong → genuine finding,
  leave it;
- if the *extractor* is wrong → a calibration bug. Tune the relevant threshold
  / region / template (Tasks 6–10) and re-run.
A healthy result: high-confidence BT01 mismatches are near zero or all genuine
DB errors. Document the final count in the commit message.

- [ ] **Step 4: Commit**

```bash
git add .skill/extract-card-info/scripts/audit.ts
git commit -m "Add audit.ts batch extract-and-diff

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 14: Rewrite `SKILL.md`

**Files:**
- Modify: `.skill/extract-card-info/SKILL.md`

- [ ] **Step 1: Replace `SKILL.md` entirely**

Overwrite `.skill/extract-card-info/SKILL.md` with:
````markdown
---
name: extract-card-info
description: Extract card properties from card images with a zero-AI computer-vision program. Supports single-card extraction and whole-database auditing.
---

# Extract Card Info

A computer-vision program that reads card properties off a card PNG — region
colour sampling, NCC template matching, digit segmentation, local Thai OCR.
**No AI is used for extraction.** Every field is emitted with a confidence flag;
low-confidence fields are reported for human review, never auto-resolved.

All scripts live in `scripts/` and run with `tsx` from the project root.
Generated output goes to the gitignored `audit/` folder.

## Mode 1 — Single-card extraction

```bash
npx tsx .claude/skills/extract-card-info/scripts/extract.ts BT01-001
```

Prints a JSON object: `{ print, source, fields }`, where each field is
`{ value, confidence, score }`. Fields: `type`, `color`, `subtype`, `cost`,
`symbol`, `ex`, `gem`, `gemColor`, `power`, `customLimit`, `name`. Fields not
applicable to the card type are omitted. A `-SCR`/`-UR`/… variant print
inherits its base print's result (`source: "inherited"`).

## Mode 2 — Batch audit

```bash
npx tsx .claude/skills/extract-card-info/scripts/dump-db.ts   # DB diff baseline
npx tsx .claude/skills/extract-card-info/scripts/audit.ts     # → audit/report.md
```

`audit.ts` extracts every base print and diffs each field against the database.
`report.md` has three sections: summary, ❌ confirmed mismatches (high-confidence
extraction disagreeing with the DB), 🔍 uncertain (low-confidence — manual
review). The audit never edits card files.

## How fields are read

| Field | Location | Technique |
|---|---|---|
| `type` | outer border colour | colour sample → Avatar/Magic/Construct/Life |
| `color` | COST box background | colour sample (Avatar/Construct) |
| `subtype` | COST-box position | template match (Magic) |
| `cost` | COST box number | digit glyph match |
| `symbol` | top-right icon | template match — `unknown` if circle-occluded |
| `ex` | icon under the symbol | template match — `unknown` if circle-occluded |
| `gem` / `gemColor` | top-centre strip | fixed-slot colour sample |
| `power` | bottom-left number | digit glyph match |
| `customLimit` | top-right override circle | circle detect + digit glyph match |
| `name` | bottom name plate | `tesseract.js` Thai OCR |

## Maintenance

- Pixel rectangles are in `scripts/regions.json` — tune without code edits.
  `scripts/preview-regions.ts <print>` crops every region for visual checking.
- The template library (`templates/`) is rebuilt by
  `scripts/build-templates.ts`, which crops exemplars from BT01 and emits
  `templates/contact-sheet.png` for human sign-off.
- Calibration constants (palettes, thresholds) are named constants at the top
  of `extract.ts` and `cv.ts`.

See [REFERENCE.md](REFERENCE.md) for property/type definitions.
````

- [ ] **Step 2: Verify the skill folder is consistent**

Run: `ls .skill/extract-card-info/scripts/`
Expected: `audit.ts build-templates.ts cv.ts cv.test.ts dump-db.ts extract.ts extract.test.ts paths.ts preview-regions.ts regions.json tsconfig.json` — no `scan-colors.ts`, `compare.ts`, `build-batches.ts`, `merge-results.ts`.

- [ ] **Step 3: Final full type-check and test run**

Run:
```bash
npx tsc -p .skill/extract-card-info/scripts/tsconfig.json
npx tsx --test .skill/extract-card-info/scripts/cv.test.ts .skill/extract-card-info/scripts/extract.test.ts
```
Expected: `tsc` exits 0; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add .skill/extract-card-info/SKILL.md
git commit -m "Rewrite SKILL.md for the CV extractor

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Done

The skill is now a real zero-AI extraction program. Final state:
- `extract.ts` — single-card CV extraction, 11 fields, confidence-flagged.
- `audit.ts` — whole-database extract-and-diff report.
- `cv.ts` — tested vision primitives.
- `templates/` + `regions.json` — committed, human-verified calibration data.
- No AI in the extraction path; `tesseract.js` handles `name` locally.
