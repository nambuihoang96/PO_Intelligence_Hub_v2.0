# G1-03 — Neutral Project Home CSV label

**Date:** 2026-11-04  
**Status:** `COPY FIX IMPLEMENTED / FOCUSED CHECKS PASS / BROWSER UAT NOT VERIFIED`  
**Scope:** Project Home CSV entry only.

## Change

Replaced “Thay đổi cần xem” with “Dữ liệu CSV mới nhất” for all Project Home dataset states. Project Home does not currently receive validated pair-comparison and actual-signal state, so a one-file project or incompatible files must not imply an observed change. The entry keeps its direct link to the newest dataset and says comparisons appear only when eligible.

## Verification

- `ProjectHome.test.tsx`: **1 file / 8 tests PASS**.
- Regression coverage: one saved CSV and two saved incompatible CSVs both use the neutral label; the incompatible-files case still links to the newest CSV.
- `npm run build` (TypeScript + Vite): **PASS**, 81 modules; existing large-chunk advisory at 763.23 kB.
- No full suite, Browser UAT, model call, or change to comparison/data logic.

## Product Acceptance

- **PO goal:** Locate the latest CSV without implying that a comparison change has been detected when it has not.
- **User journey:** Project Home → read “Dữ liệu CSV mới nhất” → open the newest file → inspect its data and any eligible analysis there.
- **Automated work:** Keep the newest-file link exact and make the comparison eligibility caveat explicit.
- **Expected result:** Accurate, neutral wording for a single CSV and for incompatible files.
- **Remaining friction:** Project Home cannot summarize a validated pair or actual comparison signal.
- **Verification:** 8 focused tests and build/TypeScript; Browser UAT not verified.
- **Decision:** `TECHNICAL PASS / OWNER VISUAL REVIEW PENDING`.
