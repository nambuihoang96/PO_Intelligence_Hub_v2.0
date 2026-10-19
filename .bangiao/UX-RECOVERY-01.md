# UX-RECOVERY-01 — Research Results Redesign

## Delivery status

**GO with a visual verification limitation.** Research Results has been redesigned and exercised in the in-app browser against real reports copied into an isolated local database. No production SQLite file or Research Run Manifest was changed. Independent product review: **GO** after the final focused re-review.

## Before / after

- **Before:** Report Results opened with a text-oriented header and sequential result sections. PO had to navigate the original report and backend-shaped sections to understand what was provided.
- **After:** The report opens on a Research Overview with report scope/provenance, supplied summary and takeaways, factual counts, report-supplied findings, source references explicitly marked unverified, research gaps, report recommendations distinguished from saved PO decisions, and direct paths to Insights, Benchmark, Evidence, and Full Report.
- Finding cards open the complete insight detail. The original-report support control is independent and does not close the insight. Missing observations remain Unknown. Text-only reports receive a structuring prompt and are not turned into synthetic findings.

## Design and implementation

- Added a results-only light SaaS visual system with reusable layout patterns, readable typography, focus styles, responsive grids and report table overflow handling.
- Removed insight numbering that could imply ranking. Overview descriptions are clamped; the Insights tab retains the full description.
- Added keyboard arrow/Home/End navigation for result tabs.
- Kept existing report, benchmark selection, assessment, note, evidence, and immutable-run contracts. No backend/schema/migration change was needed.

## Files changed

- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/reports/ResearchIntake.test.tsx`
- `frontend/src/style.css`

Operator-owned pre-existing changes to `scripts/setup.ps1` and `.devcrew/` were preserved and excluded.

## Tests and checks

- Frontend tests: **35 passed, 0 failed** (3 test files).
- TypeScript check and production build: **passed** (`npm run build`).
- Backend regression tests: **63 passed** (`python -m unittest discover -s tests -v`; run before final frontend-only adjustments).
- Alembic check against isolated UAT data: **passed**, no new upgrade operations.
- `git diff --check`: **passed**.

## Browser UAT

Used the Codex in-app browser against a local backend/frontend using a separate SQLite copy under `data/.uat-ux-recovery-01/`. Production data was not used for writes.

- **Qualitative report with findings/entities/evidence/gaps/recommendations:** Overview displayed supplied data, no invented quantitative values, and source references as unverified.
- **Sparse report:** Overview showed the available summary, one finding and one source reference without filling absent sections with fabricated content.
- **Text-only report:** Overview showed “This report needs semantic structure”; no Insights/Entities/Evidence tabs were fabricated, and Full Report remained available.
- **Existing PO work:** Opened an existing saved report, viewed an Insight and its source, added an entity to Benchmark, saved PO assessment and Next Action, removed/restored selection, refreshed, and reopened the report. Confirmed the saved assessment, action, and selection persisted. All writes were against the isolated copy.
- **Viewport:** Browser screenshot/interaction was verified at approximately **1265 × 720 CSS pixels**. The available in-app browser controls do not expose viewport resizing, so exact visual UAT at **1440, 1024, 768, and 390 px is NOT VERIFIED**. CSS breakpoints cover responsive layouts, but this is not a substitute for those viewport checks.
- **Screenshots:** The browser showed the real Overview during UAT. The browser bridge returned a live screenshot but does not expose an export-to-workspace operation; no screenshot file is attached to this handoff.

## Limitations

- No independently verifiable source data is created; supplied source references and structured findings remain labeled unverified.
- This contract has no linked quantitative dataset model, so a separate quantitative dashboard/charts are intentionally not shown.
- Exact requested viewport widths remain unverified due to the in-app browser's lack of viewport controls.
- Independent product review: **GO**.

## Review decision

**GO for owner review**, subject to the viewport limitation above. Product Reviewer final result: **GO**.

## Commit

- Branch: `feat/ux-recovery-01-research-results`
- Implementation commit SHA: `040afa8bf26722fd71724b54dcc3812c366763a3`
