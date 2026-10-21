# M3-A R1 — Chart Correctness & Product Acceptance

## Status

**Automated checks: PASS. Browser product acceptance: NOT VERIFIED.** The app frontend was reachable, but the local API was offline in the browser session, so report-level interaction and screenshots could not be verified.

## Starting point

- Branch: `feat/ux-recovery-01-research-results`
- HEAD before this work: `a9886f7e21fa1d37300d939e68894db9defc41af`
- SQLite and backend schema: unchanged by this task.
- Existing working-tree changes in `scripts/setup.ps1`, `.devcrew/`, `.m1-test-tmp/` and `.test-tmp/` were preserved and excluded from commits.

## Root causes addressed

- Chart eligibility required a granularity value even when exact, valid start and end dates defined the observation window.
- Overlapping windows could be presented in a time-oriented visualization that suggested consecutive periods.
- Zero-valued observations received a minimum-width bar, making zero look positive.
- Negative values were not consistently protected from positive-width chart rendering.
- CSV mapping and readiness diagnostics competed with the report-supplied charts for attention in the Overview.

## Changes

- Exact ISO date-only bounds are now required and validated as real calendar dates. Granularity may be absent when explicit period bounds are supplied.
- Granularity remains part of comparison identity. Known and missing cadence, or different known cadences, are not combined. Readiness explains that separation.
- Any overlapping date windows use a dated table, including nested or multi-entity windows. The UI does not connect them as a trend.
- Multi-entity reports with two compatible non-overlapping periods retain a date-labeled grouped comparison. Missing entity-period observations remain missing; each supplied point keeps its evidence action.
- Zero measurements render zero-width bars. Signed negative measurements use a table, preserving their sign and avoiding misleading positive bars.
- The Overview chart section is labeled **Market Data & Charts**. CSV import and technical readiness controls are grouped under a collapsed Data Sources disclosure, while report-supplied charts remain directly visible in Overview.
- Existing text-only report structuring instructions now explain the complete prepare → ChatGPT Plus → paste response → update workflow and state that the original report and PO workspace are preserved.

No backend, API contract, database schema, migration, or SQLite data was changed.

## Files changed

- `frontend/src/reports/quantitativeAnalytics.ts`
- `frontend/src/reports/QuantitativeEvidence.tsx`
- `frontend/src/reports/QuantitativeEvidence.test.tsx`
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/style.css`

## Test results

- Frontend: **119 passed, 0 failed** across 10 test files. The run used one worker and a repository-local temporary directory because the default protected Windows temp directory rejected Vitest cache renames (`EPERM`).
- Targeted quantitative chart tests: **23 passed, 0 failed**.
- TypeScript check: **passed**.
- Production build: **passed** (`vite build`, 49 modules).
- Backend quantitative API/persistence regression: **47 passed, 0 failed** on an isolated temporary SQLite database in the earlier verification run. This task made no backend changes.
- Database migrations: no new migration was needed; the existing additive migration/backward-compatibility coverage ran as part of the quantitative backend suite.
- `git diff --check`: passed for staged implementation changes.

The first default parallel frontend run encountered protected-temp `EPERM` errors and timeouts under concurrent workers. Re-running the complete suite serially with the temp directory inside the repository passed all 119 tests.

## Browser UAT

**NOT VERIFIED. No screenshots were captured.** The in-app browser showed the frontend at `http://127.0.0.1:15173/`, but displayed “Không kết nối được tới backend”; the existing report route at `http://127.0.0.1:15174/reports/3fa376e1-a4ed-469e-9f1d-106783a3e2a0` showed “This site can't be reached.” Without the API, I could not load an actual report or verify chart/evidence navigation, persistence, or responsive report layout. I did not replace or stop any local processes.

Owner UAT after the local backend is available:

1. Open a report with three entities and two explicitly dated, compatible observations per entity.
2. Confirm all six reported values, both period labels, and evidence navigation for every value in Overview.
3. Switch to the table and verify the same values and source actions.
4. Open Data Sources and confirm existing CSV preview/import/readiness controls remain reachable.
5. Open a legacy qualitative report and confirm its structuring workflow, PO notes, benchmark selections, and original report remain available.
6. Refresh and reopen the report. Repeat at desktop and mobile widths; check that date labels and evidence actions remain readable without horizontal page overflow.

## Known limitations

- Browser rendering and real-report persistence remain unverified until the local API is running in the existing app session.
- Dataset import/compatibility rules were not changed; this work only adjusts the report-supplied quantitative view selector and its Overview presentation.
- Overlap fallback keeps source values and dates, but does not compute interval-adjusted or normalized comparisons.

## Delivery

- Implementation commit: `a58c2e4`.
- Handoff commit: pending.
- Push: pending to `origin/feat/ux-recovery-01-research-results`.
- Product decision: **Technical checks pass; hold final product acceptance for browser UAT.**
