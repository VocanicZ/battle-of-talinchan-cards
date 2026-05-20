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
npx tsx .skill/extract-card-info/scripts/extract.ts BT01-001
```

Prints a JSON object: `{ print, source, fields }`, where each field is
`{ value, confidence, score }`. Fields: `type`, `color`, `subtype`, `cost`,
`symbol`, `ex`, `gem`, `gemColor`, `power`, `customLimit`, `name`. Fields not
applicable to the card type are omitted. A `-SCR`/`-UR`/… variant print
inherits its base print's result (`source: "inherited"`).

## Mode 2 — Batch audit

```bash
npx tsx .skill/extract-card-info/scripts/dump-db.ts   # DB diff baseline
npx tsx .skill/extract-card-info/scripts/audit.ts     # → audit/report.md
```

`audit.ts` extracts every base print and diffs each field against the database.
`report.md` has three sections: summary, ❌ confirmed mismatches (high-confidence
extraction disagreeing with the DB), 🔍 uncertain (low-confidence — manual
review). The audit never edits card files.

## How fields are read

| Field | Location | Technique |
|---|---|---|
| `type` | left-edge border colour | colour sample → Avatar/Magic/Construct/Life |
| `color` | COST box background | colour sample (Avatar/Construct) |
| `subtype` | COST-box position | template match (Magic) |
| `cost` | COST box number | digit glyph match |
| `symbol` | top-right icon | template match — `unknown` if circle-occluded |
| `ex` | icon under the symbol | template match — `unknown` if circle-occluded |
| `gem` | top-centre strip | dark-column blob count (works on silver-filled diamonds) |
| `gemColor` | inside gem-strip diamond icons | colour sample of diamond interior; near-gray → `ไม่มีสี` |
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
- `customLimit` reads inside the override circle yield inherently low NCC
  scores because the digit is rendered differently than the cost-box digits
  the templates were built from; the score is always low-confidence and the
  read value is best-effort.
