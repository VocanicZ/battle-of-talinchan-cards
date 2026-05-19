# Card-Info CV Extractor — Design

_2026-05-19_

## Problem

The `extract-card-info` skill claims to "analyze the card to extract card
info." In reality only one field (`color`) is read by image processing — a flat
RGB sample of the COST box. Every other field is dispatched to an AI worker, and
the batch mode compares against a `db-cards.json` dumped from `src/cards/*.ts`.
The skill is a thin pixel-sample plus an AI dispatcher, not an extractor.

This redesign replaces it with a **real computer-vision extraction program**:
given a card PNG, it produces the card's properties with **zero AI**, using
hand-rolled template matching, region color sampling, and a local OCR engine.

## Goal

A standalone program: `image.png → { field: { value, confidence, score } }`.
It never reads the card database. The database is consulted only by the *audit*
wrapper, which diffs the extractor's output against `src/cards/*.ts`.

## Non-goals

- No AI / model in the extraction path. Low-confidence fields are **reported**,
  not auto-resolved. (`tesseract.js` is a local OCR engine, not a model.)
- Fields not visually reliable are out of scope: `rare`, `soi`, `dropRate`,
  `mainEffect`, `favorText`, `variants`.
- No auto-fixing of card files. The audit is report-only.

## Decisions (resolved during design grilling)

1. **Pure extractor is the product.** The audit is `extract` + `diff`.
2. **Toolbox:** hand-rolled normalized cross-correlation (NCC) template matching
   in pure JS (`pngjs`) for 9 fields; `tesseract.js` Thai OCR for `name`.
3. **Template library** built by a one-time `build-templates.ts` that auto-crops
   from BT01 (the trusted golden set), labels from `src/cards/bt01.ts`, and
   emits a contact sheet for **human sign-off** before templates are committed.
   Symbols absent from BT01 are sourced from a later set, also human-verified.
4. **Digits** (`cost`, `power`, `customLimit` circle) read by glyph templates
   `0-9` with column segmentation (up to 3 columns). Field identified by
   position: `cost` top-left, `power` bottom-left, `customLimit` big circle
   top-right.
5. **Zero AI in the core extractor.** Every field emits `{ value, confidence }`.
   Low-confidence fields are reported for human review. The old Mode-2 AI-worker
   pipeline is deleted.
6. **Variant prints** (`-SCR`, `-UR`, `-CBR`, `-PR`, …) inherit from their base
   print and are tagged `source: "inherited"`; only the ~1025 base prints run
   through CV. Base-less promo variants are processed directly.
7. **`gem` / `gemColor`** read by fixed-slot pixel sampling (no templates);
   transparent (`Color.None`) gems disambiguated by outline-edge detection.
8. `regions.json` is a separate committed file; pixel rectangles are tunable
   without code edits. SKILL.md Mode 1 is rewritten to run `extract.ts`.

## Field map

Every field reads from the **base-print image** (uniform 388×528 PNG).

| Field | Location | Technique | N-A / occlusion rule |
|---|---|---|---|
| `type` | outer border color | region color sample → red=Avatar, blue=Magic, yellow=Construct, gray/black=Life | — |
| `color` | top-left COST box background | region color sample | Avatar/Construct only |
| `subtype` | top-left box (same spot as COST) | template match, 4 pictograms | Magic only |
| `cost` | top-left COST box number | digit glyph match | Avatar/Construct/Magic |
| `symbol` (race) | top-right icon | template match, 21 icons | occluded by customLimit circle → `unknown`, low-conf |
| `ex` | icon under the race icon | template match, 3 stamps (`Only #1`, `โดนใจ`, `ลำเอียง`) | occluded → `unknown`; absent → none |
| `gem` | top-center strip | fixed-slot sampling (count filled) | Avatar/Construct |
| `gemColor` | top-center strip | fixed-slot color sample | Avatar/Construct |
| `power` | bottom-left POWER box number | digit glyph match | Avatar/Construct |
| `customLimit` | big red-ring circle, top-right | detect circle → digit glyph match (1–3 cols) | absent if no circle |
| `name` | bottom name plate | `tesseract.js` Thai OCR | always a low-conf candidate |

Notes:
- The `customLimit` circle, when present, occludes the `symbol` and `ex` icons.
  Detect the circle **first**; if it overlaps a field's region, that field is
  emitted as `unknown` with low confidence.
- `"Only #1"` is the `ex` field — it does **not** imply `customLimit: 1`.
- For Magic cards the COST box position holds either a cost number or the
  subtype pictogram; both are read from that region.

## Architecture

```
.skill/extract-card-info/
  SKILL.md              # rewritten: Mode 1 runs extract.ts, Mode 2 runs audit.ts
  scripts/
    paths.ts            # path resolution (keep)
    cv.ts               # NCC template matching + region sampling primitives
    extract.ts          # THE ENGINE: image path -> per-field {value, confidence, score}
    build-templates.ts  # one-time: crop BT01 -> templates/ + contact-sheet.png
    dump-db.ts          # keep — audit diff baseline only
    audit.ts            # extract all base prints, diff vs DB -> audit/report.md
    tsconfig.json
  templates/            # committed: symbol/*.png, subtype/*.png, ex/*.png, digit/*.png
  regions.json          # committed: every field's pixel rectangle, calibrated on BT01
  audit/                # gitignored output
```

Deleted: `scan-colors.ts`, `compare.ts`, `build-batches.ts`, `merge-results.ts`,
the worker subagent prompt, and the `image-scan.json` / `batches/` /
`ai-results/` artifacts. `scan-colors.ts`'s color-sampling logic is absorbed
into `cv.ts` + `extract.ts`.

## Components

### `cv.ts` — vision primitives

Pure functions over a decoded `PNG`:

- `avgRGB(png, rect)` — mean RGB of a rectangle (existing logic).
- `nearestSwatch(rgb, palette)` — nearest-color classify with a confidence
  margin (existing `classify` logic, generalized).
- `crop(png, rect)` — extract a sub-image.
- `ncc(patch, template)` — normalized cross-correlation score in `[0,1]`,
  size-tolerant by resampling to a common dimension.
- `matchBest(patch, templateSet)` — rank a patch against a labeled template set,
  return `{ label, score, runnerUpScore }`.
- `segmentDigits(patch)` — split a number region into 1–3 digit columns by
  background-gap detection.
- `detectCircle(png, rect)` — look for the customLimit red ring; return its
  bounding box or null.

Confidence rule (shared): a match is `high` iff `score >= MIN_SCORE` **and**
`score - runnerUpScore >= MARGIN`; otherwise `low`. Thresholds live as named
constants, tuned against BT01.

### `regions.json` — calibration data

One entry per field, each a pixel rectangle `[x, y, w, h]` on the 388×528
canvas, calibrated against BT01. Example:

```json
{
  "border":   [4, 4, 380, 6],
  "costBox":  [34, 34, 28, 28],
  "costNum":  [30, 60, 40, 34],
  "gemStrip": [120, 18, 150, 34],
  "symbol":   [330, 14, 44, 44],
  "ex":       [336, 58, 32, 32],
  "powerNum": [30, 470, 44, 36],
  "circle":   [296, 8, 84, 84],
  "namePlate":[150, 470, 200, 40]
}
```

Tunable without recompiling; the extractor reads it at startup.

### `build-templates.ts` — template library builder

One-time, regenerable. Steps:

1. Import `src/cards/bt01.ts`.
2. For each distinct value of `symbol`, `subtype`, `ex`: pick the first BT01
   card with that value, crop the field region (from `regions.json`), save as
   `templates/<field>/<value>.png`.
3. For digits `0-9`: crop known cost/power regions from BT01 cards whose DB cost
   or power equals that digit; save as `templates/digit/<n>.png`.
4. Symbols/ex values absent from BT01: source from the first card in any later
   set that has them.
5. Emit `templates/contact-sheet.png` — a grid of every crop with its label —
   for human review. Templates are committed only after sign-off.

The 388×528 uniformity makes fixed-region crops reliable. The symbol/subtype/ex
icons sit in solid-background boxes, so background bleed is minimal.

### `extract.ts` — the engine

Input: a print code or image path. Output: a per-field result object.

```jsonc
{
  "print": "BT01-001",
  "source": "image",                 // or "inherited" for variant prints
  "type":   { "value": "Avatar", "confidence": "high", "score": 0.97 },
  "color":  { "value": "แดง",    "confidence": "high", "score": 0.99 },
  "symbol": { "value": "ยักษ์",  "confidence": "high", "score": 0.88 },
  "ex":     { "value": null,     "confidence": "high", "score": 1.0  },
  "gem":    { "value": 2,        "confidence": "high", "score": 0.95 },
  "cost":   { "value": 3,        "confidence": "high", "score": 0.93 },
  "name":   { "value": "นนทก นิ้วเพชร", "confidence": "low", "score": 0.62 }
}
```

Algorithm per card:
1. Decode PNG; assert 388×528 (non-standard → all fields low-conf).
2. `type` from border color sample.
3. `detectCircle` for the customLimit ring; record occlusion of `symbol`/`ex`.
4. Per field, by `type`, apply its technique from the field map. Skip N-A
   fields (e.g. `power` on a Magic card) — emit nothing.
5. `name` via `tesseract.js` (Thai). OCR confidence maps to high/low.
6. Assemble the result; write to `audit/extract/<print>.json` (batch) or print
   to stdout (single-card).

### `audit.ts` — batch wrapper

1. Run `extract.ts` over all ~1025 base prints (variant prints inherit).
2. `dump-db.ts` provides the DB baseline.
3. Diff each extracted field against the DB value.
4. Write `audit/report.md`: summary, ❌ confirmed mismatches (high-conf
   extraction disagreeing with DB), 🔍 low-confidence fields for human review.

## Usage

- **Single-card:** `npx tsx scripts/extract.ts BT01-001` → prints the JSON
  object. This is Mode 1 — a real program, no AI.
- **Batch / audit:** `npx tsx scripts/audit.ts` → `audit/report.md`.
- **Rebuild templates:** `npx tsx scripts/build-templates.ts` → crops +
  contact sheet for human sign-off.

## Variant handling

A `-SUFFIX` print has identical card data to its base. The extractor resolves
the base (`BT01-001-SCR` → `BT01-001`), copies its result, tags
`source: "inherited"`. Only base prints run CV. Base-less promo variants are
processed directly and typically land in the low-confidence report.

## Confidence model

Every field carries `confidence: "high" | "low"` and a raw `score`. `low` means
the region was ambiguous: full-art frame, occlusion, no matching template, weak
OCR. Low-confidence fields are surfaced in the audit report for a human; nothing
is auto-corrected and no model is invoked.

## Testing & verification

- **Golden test:** run `extract.ts` on every BT01 base print, diff against
  `src/cards/bt01.ts`. BT01 is trusted, so a correct extractor yields ~0
  high-confidence mismatches. This is the accuracy gate for thresholds.
- **Type-check:** `tsc -p scripts/tsconfig.json` exits 0.
- **Smoke test:** single-card extraction on a known card from each `type`.
- **Template review:** human signs off `contact-sheet.png` before commit.

## Migration / cleanup

- Delete `scan-colors.ts`, `compare.ts`, `build-batches.ts`,
  `merge-results.ts`.
- Rewrite `SKILL.md`: Mode 1 = run `extract.ts`; Mode 2 = run `audit.ts`;
  drop the AI-worker topology and the "use multimodal capabilities" wording.
- `.gitignore` already covers `extract-card-info/audit/`; keep it.
- Add `tesseract.js` to `package.json`.
- Changes apply once to the shared skill inode (mirrored at `.skill/`,
  `.claude/skills/`, `.agents/skills/`).
