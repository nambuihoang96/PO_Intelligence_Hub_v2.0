# M3-A — ChatGPT Research Chart Renderer

## Delivery status

Implementation is committed on `feat/ux-recovery-01-research-results`. Browser/product acceptance remains pending because the available localhost browser tab is disconnected from the backend. No screenshots are claimed for this task.

## What changed

- Research report-supplied numeric observations can retain an explicit `exact` or `approximate` precision and the source's original value wording. Older observations default to `exact`, preserving the existing `po_research_v1` shape and stored reports.
- Approximate source values display with an `≈` prefix and an explicit approximate/source-reported/unverified label. The source wording remains available in observation details. Derived changes reject approximate inputs.
- Overview selects visual forms from the observations actually present: a two-point view for one entity across two periods, grouped bars for multiple entities across two compatible periods, and chronologically spaced time series for one entity across three or more periods. Incomplete or incompatible observations remain available in a table with their validation reasons.
- Every displayed observation retains its evidence action. Multi-entity/two-period charts have a table view, and missing period/entity observations remain explicitly missing.
- Reports without structured quantitative observations receive a compact explanation and a “Prepare chart data from this report” action. It opens the existing ChatGPT structuring flow; it does not infer numbers from prose or chart images.
- The existing report content, PO notes, benchmark selections, dataset schema, and finalized research runs were not reset or migrated.

## Selection and data rules

- Metric identity, full definition, unit, GEO, platform, granularity, and methodology remain part of compatibility grouping.
- Chart-ready observations must have explicit entity, scope, dates, source/evidence references, complete status, and confirmed scope compatibility.
- Approximate values are displayable as reported observations. They are not inputs to derived growth or change calculations.
- Report-supplied values remain unverified. No ranking, value, period, source, or missing observation is synthesized.

## Files changed

- `backend/app/quantitative.py`
- `backend/app/research_data.py`
- `tests/test_quantitative.py`
- `frontend/src/reports/api.ts`
- `frontend/src/reports/researchPrompt.ts`
- `frontend/src/reports/quantitativeAnalytics.ts`
- `frontend/src/reports/QuantitativeEvidence.tsx`
- `frontend/src/reports/QuantitativeEvidence.test.tsx`
- `frontend/src/reports/ResearchIntake.test.tsx`
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/style.css`

The pre-existing uncommitted changes in `scripts/setup.ps1`, `.devcrew/`, `.m1-test-tmp/`, and `.test-tmp/` were preserved and excluded.

## Verification

- Frontend tests: **PASS** — 111 tests across 10 files.
- TypeScript check: **PASS** — `tsc --noEmit`.
- Production build: **PASS** — Vite production build completed.
- Backend quantitative rules: **PASS** — 27 `QuantitativeObservationTest` tests, including approximate value preservation and rejection of derived changes from approximate inputs.
- Backend persistence/API regression: **NOT VERIFIED** — the broader `tests.test_quantitative` run reached isolated Alembic setup, then stopped producing output and was canceled. It did not touch the user's SQLite database.
- Browser UAT: **NOT VERIFIED / PRODUCT UAT PENDING** — the current in-app browser's `127.0.0.1:15173` page reports that it cannot connect to the backend. No alternate browser restrictions were bypassed and no screenshots were fabricated.
- Schema migration: **None required** — precision fields are additive within the existing JSON research contract; historical observations use the default `exact` value.

## Known limitations

- A live report has not been opened in the browser during this task. Product acceptance of the rendered chart remains pending until browser access is restored and Overview, evidence navigation, and the “Prepare chart data” workflow are exercised.
- API persistence of the new approximate source wording was not verified end-to-end because the backend API test run stalled in the current environment.
- Approximate figures can be shown with their source wording but do not support calculated deltas or growth rates.

## Commit

- Implementation commit: `cdfeb54e6e2b4190349fec865ae6a53176c782ac` (`feat(m3-a): render report quantitative insights`).
- Delivery report commit: follows the implementation commit on the same branch.
