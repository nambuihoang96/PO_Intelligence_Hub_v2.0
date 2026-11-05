# G3-01 Milestone Review — CSV Auto-Analysis

**Date:** 2026-11-03  
**Status:** `DEV_DONE / TECHNICAL PASS / SYNTHETIC BROWSER UAT PASS / OWNER REVIEW PENDING`  
**Branch:** `feat/ux-recovery-01-research-results`  
**Production data:** untouched; UAT used an isolated QA database.

## PO feedback

The PO asked whether importing CSV can automatically surface highlighted metrics, insights and a next action, and whether adding a later CSV to the same project automatically detects and analyzes changes.

## Implemented result

- `frontend/src/research/CsvAutoAnalysis.tsx` produces deterministic within-file high/low signals for complete, exact, known-scope observations and automatically requests a preview comparison against the nearest earlier compatible dataset.
- It compares only matched source IDs under the same metric definition, unit, method, GEO, platform and known measurement period. Unknown or incompatible scope does not become a delta.
- It displays strongest reported increase/decrease, counts for comparable/increased/decreased/unchanged/new/missing/review rows, source filenames and dates, and a PO next step to check the source/period or investigate the changed product further.
- `frontend/src/research/DataFirstWorkspace.tsx` ties highlight states to the matching current CSV table cells and prevents a selected insight product from falsely overwriting a shortlist belonging to another CSV.
- `frontend/src/style.css` gives values explicit color, arrow and text labels. Color does not imply positive/negative business value.
- No API/schema/database migration was added. No values, causal explanation or independent verification are fabricated.

## Verification evidence

- **Focused frontend tests:** `CsvAutoAnalysis.test.tsx` and `DataFirstWorkspace.test.tsx`, 15/15 PASS after the final patch.
- **Full frontend suite:** 29 test files / 254 tests PASS.
- **Typecheck:** `npm run typecheck`, PASS.
- **Production build:** `npm run build`, PASS. Vite reports the existing/minified JavaScript chunk is 697.82 kB, above its 500 kB advisory.
- **Whitespace check:** `git diff --check`, PASS with CRLF/LF warnings only.
- **Live browser UAT:** Project `[QA ONLY] CSV Auto Analysis Valid Periods`, ID `fcfedfeb-0cb8-455c-aa85-d45d0e6694b6`, backed by an isolated copied QA DB. Adding the synthetic 2026-11 CSV caused the browser to compare it with the nearest compatible 2026-10 CSV. It displayed four comparable products, three increases, one decrease, one new product, no missing/current rows and no review exceptions; Puzzle A was +150 downloads and Puzzle C was −20 downloads. Current table values displayed matching colored/text deltas, and product E displayed “new”. The report named both files and the date ranges.
- The screenshot was visually inspected in the active browser session but not saved as an artifact. This is an outstanding evidence-quality gap.
- No mobile review was performed in accordance with the PO's prior instruction to exclude mobile work.

## Product Acceptance

- **PO goal:** See useful CSV signals after import and understand what changed when a later dataset arrives.
- **User journey:** Open project → import CSV → review within-file high/low → import next CSV → inspect auto comparison and color-highlighted rows → choose a changed product for further ChatGPT research if needed.
- **Automated work:** Keep source files separate; match safe comparable measurements; compute the reported delta; show provenance and uncertainty; color-highlight values with text and arrows.
- **Expected result:** The PO sees where to look and one safe next action without manually joining files.
- **Remaining friction:** New period-pair UAT used five synthetic rows, not a PO-provided real pair or 100+ product dataset. A real CSV missing explicit measurement periods/scope will be excluded from automatic comparison. Saved screenshot artifacts for this round are missing. The feature reports arithmetic signals and cautious follow-up; it does not infer causes or provide autonomous product strategy.
- **Verification:** Automated tests/build/typecheck plus the isolated desktop browser UAT listed above. The previous G3-01 report still carries evidence from the genuine single-period Sensor Tower CSV import; it does not prove a real multi-period delta.
- **Decision:** `TECHNICAL PASS / SYNTHETIC BROWSER UAT PASS / OWNER REVIEW PENDING`. Not `PRODUCT PASS`.

## Files in this slice

- `frontend/src/research/CsvAutoAnalysis.tsx`
- `frontend/src/research/CsvAutoAnalysis.test.tsx`
- `frontend/src/research/DataFirstWorkspace.tsx`
- `frontend/src/research/DataFirstWorkspace.test.tsx`
- `frontend/src/style.css`
- `.bangiao/G3-01-CSV-ANALYTICS.md`
- `docs/RECOVERY_BOARD.md`

## Next executable work

Continue G3-06 Product Analysis after the timeboxed Research closeout. Keep a real multi-period CSV and a larger CSV stress case as explicit G3-01 acceptance gates; do not delay independent approved work while waiting for the unavailable owner dataset. Do not merge or release automatically.
