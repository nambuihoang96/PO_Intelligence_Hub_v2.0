# G1–G3 P0 Recovery — Continuation Milestone

**Date:** 2026-10-28
**Branch / HEAD:** `feat/ux-recovery-01-research-results` / `5581f1efb3a2993511abd6c62ee6719e0528b4c4`
**Status:** Technical slice verified; full P0 recovery remains `IN_PROGRESS`; Product Owner acceptance pending.

## This slice

- Project Home opens the exact saved dataset, research subject profile, or comparison collection selected by the Product Owner, using the existing project workspace and query context.
- Saved PO decisions appear on Project Home; their links from Project Home and Tracking reopen the matching report-finding/entity decision context when the existing target identifiers are present.
- Project Home's recent-activity list includes imported datasets and saved decisions; image-evidence actions and report/CSV source labels use Vietnamese UI copy.
- Projects with datasets or decision candidates no longer appear to have no work.
- The quantitative dataset explorer, period comparison, chart and table controls use Vietnamese labels and user-facing statuses. Imported provider names, metric definitions, IDs, and validation/source text remain faithful to their supplied values.
- No backend or database change was made. Production SQLite was not opened or modified.

## Verification evidence

- Frontend: `24` test files, `203` tests passed.
- TypeScript: `npm run typecheck` passed.
- Production build: `npm run build` passed. Vite reports the main JavaScript chunk at approximately `599 kB` minified.
- Backend: `37` targeted tests passed across saved information, trend updates, subjects, benchmark collections, and data-first workspace.
- `git diff --check`: passed; Git reports line-ending normalization warnings for mixed-LF working copies.
- Browser UAT: **NOT VERIFIED**. The available browser window was not a PO Hub test session; the Codex desktop UI is not an allowed automation target for this check; shell requests to the local app were denied. No app screenshot is claimed or attached for this slice.
- Remote synchronization: local HEAD and its existing `origin/feat/ux-recovery-01-research-results` tracking ref matched. A live GitHub check could not be completed because network name resolution was unavailable earlier in this session.

## Remaining work

- Verify actual Project → Research/report → saved data → CSV analysis → PO decision journeys in a real browser on isolated QA data.
- Verify responsive layouts with real viewport evidence and capture screenshots.
- Continue remaining cross-source history, business-first CSV results and decision continuity work under the existing G1/G2/G3 IDs.
- Run genuine owner-provided report/dataset acceptance when available; isolated test fixtures do not count as genuine research UAT.
- Complete the broader Vietnamese-language and Peachy Studio product review.

## Product Acceptance

- **PO goal:** Keep Project Home actionable and make quantitative review understandable in Vietnamese.
- **User journey:** Project Home → open a selected saved dataset, subject profile, collection, or saved PO decision → review the corresponding existing workspace; Tracking can reopen a decision in its original finding context.
- **Automated work:** Deep-links to the selected item and localized interface labels; decision targets use the existing report hash/item key or target ID; source values and provenance stay unchanged.
- **Expected result:** The user can reach the intended existing project content or decision without searching through unrelated panels.
- **Remaining friction:** Full report/trend/CSV/decision journey and responsive behavior remain unverified in a real browser.
- **Verification:** Automated tests, typecheck, build, and targeted backend tests passed; Browser UAT NOT VERIFIED.
- **Decision:** `TECHNICAL PASS` for this implementation slice; `NEEDS FIX` for full P0 recovery pending browser/product validation and remaining workflows.

No commit, push, merge, or release was performed. Existing worktree changes and test scratch data were preserved.

## Browser-UAT closure addendum — 2026-10-28

This addendum supersedes the earlier `Browser UAT: NOT VERIFIED` statement for the four requested journeys in this continuation only; the earlier statement remains as an accurate historical record of that execution.

- **Actual browser:** Codex in-app browser on `http://127.0.0.1:15295`, backed by the current workspace API on `15296` and isolated QA data under `.p0-recovery-tmp/browser-uat-20261028/`. Existing listeners `15195`/`15196` and the owner's `15190` tab were left untouched.
- **Project Home → Report Reader:** PASS. The linked `[UAT]` text-only report opened with project navigation context and without raw JSON in the default reader.
- **Project Home → Dataset:** PASS. The specifically selected Sensor Tower dataset opened with 25 source products, provider columns, Worldwide/Unified scope and period visible as supplied.
- **Project Home → Profile:** Initially reproduced as a URL change with viewport remaining at the top. Fixed by following a delayed fragment target using a bounded mutation observer; after rerun the requested profile was open at the viewport top. PASS after fix.
- **Decision Hold → Tracking:** PASS. A QA-only Hold was saved in the isolated SQLite copy, showed in Tracking with its next step, reopened to its decision context and remained visible after refresh.
- **Visual check:** Sampled pages displayed Vietnamese UI labels and the Peachy warm-light / plum navigation theme. Source-supplied filenames and metric names remain in English where provided by the CSV. Project Home at 390×844 had `document.scrollWidth=375`; no horizontal page overflow. Other mobile flows and widths were not tested.
- **Real screenshots:** `.bangiao/screenshots/p0-ux-final-uat-20261028/{project-home.jpg,report-reader.jpg,dataset.jpg,subject-profile.jpg,hold-tracking.jpg,project-home-mobile-390.jpg}`. They were captured from the running app and inspected; they are not mockups.
- **Fresh frontend:** 24 files / 204 tests PASS; TypeScript PASS; production build PASS with the existing 601 kB bundle advisory.
- **Relevant backend:** 115 tests PASS across workspace, subjects, saved information, trends, reports and quantitative datasets. Full suite: 173 passed, with 1 error and 1 failure in unchanged `test_database.py`: Alembic autogenerate sees a unique index vs model unique constraint, and a historical restore test still expects revision `20261027_0012` instead of current head `20261027_0015`. No backend or migration code was edited.
- **Product limitation:** The report was an explicitly labeled UAT text-only fixture, not a genuine owner research report; genuine-report acceptance is NOT VERIFIED. Full P0 product acceptance remains NEEDS FIX and is not implied by these route checks.
- **Data safety:** Production SQLite not touched. Frontend/backend QA processes at `15295`/`15296` remain available for owner preview; the temporary screenshot receiver was stopped. No merge or deployment.
- **Handoff:** `.bangiao/P0-UX-FINAL-UAT-20261028.md` contains test evidence, limitations and Product Acceptance assessment. Commit/push evidence is recorded there after commit creation.
- **Commit / push:** `29c8547a5e2cefbb152e021a02f6fa6b89f412e1` pushed successfully to `origin/feat/ux-recovery-01-research-results`.
