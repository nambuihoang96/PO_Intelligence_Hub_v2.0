# G2-03 — Contextual PO Decisions

**Status:** READY_FOR_OWNER · browser UAT NOT VERIFIED

**Branch:** `feat/ux-recovery-01-research-results`

**Baseline:** `badfe4db8125321564a02f4e171482258aff66fd`
**Implementation commit:** `f9baf04`

## Root cause

The existing project decision workspace persisted decisions for CSV shortlist candidates. A report finding could only be attached as evidence, while subjects and trend updates had no direct decision target. Report-local PO notes were stored separately, which made the normal route from a research result to a project decision unclear.

## Implementation

- Reused the existing `POOpportunityDecision` persistence and optimistic revision check. Contextual decisions are keyed by an explicit target; existing CSV candidate identity remains unchanged.
- Added project, report finding, report entity, subject, benchmark collection and trend update targets. The API verifies that the target still belongs to the current project; report targets must still match the report content hash and item key.
- Added revision snapshots to decision JSON. The previous rationale, decision, next action and other saved fields remain reviewable after later saves.
- Added contextual entry links from Research Results, Project Workspace, Research Subjects, Collections and Trend Updates.
- Kept report-local benchmark notes/selections and immutable report content separate and unchanged. No guessed links, report edits, database schema change or migration were needed.
- Updated decision workspace language and empty states so the page can be used for findings and other research targets without implying a CSV is required.

## Files changed

- `backend/app/opportunities.py`
- `backend/app/schemas.py`
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/research/DataFirstWorkspace.tsx`
- `frontend/src/research/OpportunityReview.tsx`
- `frontend/src/research/ResearchSubjectsPanel.tsx`
- `frontend/src/research/TrendUpdatesPanel.tsx`
- `frontend/src/research/api.ts`
- `tests/test_workspace_data_first.py`
- `frontend/src/research/OpportunityReview.test.tsx`
- `frontend/src/research/ResearchSubjectsPanel.test.tsx`
- `frontend/src/research/TrendUpdatesPanel.test.tsx`
- `docs/RECOVERY_BOARD.md`

No migration was added. Decisions use the existing project-scoped decision table and JSON payload.

## Verification

- Focused backend regression: **37 passed** (`test_workspace_data_first`, `test_subjects`, `test_trend_updates`, `test_benchmark_collections`, `test_image_evidence`), using an isolated `APP_DATA_ROOT` under `.g2-03-tmp`.
- Frontend tests: **179 passed** across 21 test files.
- Frontend TypeScript check and production build: **passed** (`npm run build`). Vite reports the existing large-chunk advisory (546.55 kB).
- `git diff --check`: **passed**.
- Browser navigation, save, refresh and reopen: **NOT VERIFIED**. No browser UAT was performed in this pass.
- Genuine owner report: **NOT VERIFIED**. Automated tests use isolated fixtures; no user production SQLite data was accessed or changed.

## Product Acceptance

- **PO goal:** Record one project decision against an explicitly selected research finding, entity, subject, collection, trend update or project, with evidence and a next action.
- **User journey:** Open the contextual PO decision link → review the selected target and available evidence → save assessment and next action → reopen the same project decision.
- **Automated work:** The workspace supplies project-owned targets, validates target identity and report version, preserves CSV candidate IDs, resolves attached evidence, and stores decision revisions.
- **Expected result:** A contextual decision is saved in the existing project decision store and can be reopened without changing the source report or its legacy notes.
- **Remaining friction:** The decision workspace is a shared list of targets; browser save/refresh/reopen behavior and usability with a genuine owner report remain to be checked.
- **Verification:** Focused backend tests and all frontend tests/build passed. Browser UAT was not run.
- **Decision:** **NEEDS FIX** until browser UAT and owner review confirm the workflow. This is not PRODUCT_ACCEPTED.

## Known limitations and next action

No new backend actions lifecycle was added; next action remains part of the saved decision as approved. G2-04 and G4-01 remain gated until owner review confirms the contextual decision model. Do not infer that a report is project-linked when it is not. No merge or release was performed.
