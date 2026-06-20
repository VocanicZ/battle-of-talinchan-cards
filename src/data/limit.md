# Sin Card list — custom rules (การ์ดบาป)

Source: `vendor/docs/library/rules/floor-rules.TH.md` — การ์ดบาปล่าสุด (1 ธค 2025) · version 2025-12-01.

Copy-count caps live in `limit.json` (`print-ID: max-copies`). The rules below are **not** copy caps, so they can't go in that flat map — kept here. All also apply to the **Side Deck**.

## ห้ามใส่ด้วยกัน (Cannot be included together)

| Card A | Card B |
|---|---|
| เจ้ากล้าดียังไง | ริกกี้นักปลอมแปลง |
| ไม่นะโดม ! | ทศกัณฐ์ยักษ์ที่---เมียพระอิศวร |
| พี่หน่วง พิธีกรผมสวย | เลือกมันสำหรับพวกจน |

## เงื่อนไขพิเศษ (Special condition)

- To run **เมียพระอิศวร**: every Avatar in the Deck **and** Side Deck must have the **เทพ (God)** Symbol in its Text Box.

## Unresolved

- **SD Plaza สายใต้เก่า** — listed in the ban doc at limit 1, but the card DB only has `SD Plaza สายเหนือเก่า` (north, `CC01-050`). South vs north mismatch → omitted from `limit.json` pending confirmation (doc typo vs missing card).
- **แมลงปอมีพิษ** (`BT03-027`) — doc lists it under both "1 ใบ" and "2 ใบ"; stricter cap (1) used in `limit.json`.
- **พระพรหม** (`BT02-008` / `KD01-008` / `SL01-006`) — explicit 3, reduced from default 4.
