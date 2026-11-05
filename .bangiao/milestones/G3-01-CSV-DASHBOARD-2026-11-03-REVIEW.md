# G3-01 CSV Dashboard — Review 2026-11-03

## Milestone result

Reworked the desktop CSV data view after PO feedback that it still looked unlike the approved wireframe. The target is Peachy Studio reference screen #8, “Phân tích dữ liệu – Bảng và biểu đồ trực quan”.

## Product changes

- Compact horizontal CSV/dataset toolbar.
- Multi-metric table and Top 5 chart lead the page; up to four available metrics are selected by default.
- Automated analysis is secondary and its group details are collapsed.
- Shared scope is presented once; per-product scope and source-column names are progressive details.
- “Downloads” is shown as “lượt tải” while source values and safe-compare rules stay intact.

## Verification

- Full frontend suite, serial: **29 files / 262 tests PASS**.
- Focused CSV suite: **6 files / 100 tests PASS**.
- Typecheck: **PASS**.
- Production build: **PASS**; advisory remains for a minified JS chunk over 500 kB.
- `git diff --check`: **PASS**; line-ending warnings only.
- Actual local desktop app reviewed at 1264×720 on isolated `[QA ONLY] CSV Auto Analysis Valid Periods`. The visible dataset contains synthetic QA values and is not market evidence. Table, color cues and chart were inspected in-session. No new screenshot artifact was saved; the 1440px capture remains open.
- No mobile UAT, production database operation, migration, merge, or release.

## Product Acceptance

- **PO goal:** Read imported CSV metrics and important signals in the approved visual hierarchy.
- **User journey:** Open project data → choose/import CSV → scan multiple metrics and Top 5 chart → inspect concise analysis/scope details → choose a next product if needed.
- **Automated work:** Preserve source data; compare only compatible measurements; explain colored changes with labels and source periods.
- **Expected result:** Table and chart are primary, with supporting analysis below.
- **Remaining friction:** The browser fixture has one metric and five synthetic products. A genuine multi-metric/100+ product CSV and 1440px saved screenshot are not verified. Broader app navigation is still not identical to the reference. Owner acceptance is pending.
- **Verification:** See evidence above.
- **Decision:** `TECHNICAL PASS / SYNTHETIC DESKTOP REVIEW / OWNER REVIEW PENDING`; not Product Pass.

## Next executable step

Capture and review the actual running data page at approximately 1440px with a multi-metric state; then continue G3-06 Product Analysis. Keep genuine large and multi-period CSV acceptance separate from this visual milestone.
