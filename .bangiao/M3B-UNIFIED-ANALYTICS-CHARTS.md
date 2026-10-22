# M3-B — Unified CSV + ChatGPT Analytics Charts

## Result

Implemented the bounded CSV comparison presentation on `feat/ux-recovery-01-research-results`. No backend, schema, migration, data import contract, or database files were changed. Existing M2 comparison responses remain the source of truth; the new frontend adapter only selects and formats those response values.

**Status: TECHNICAL PASS for frontend implementation; PRODUCT ACCEPTANCE PENDING.** The CSV comparison journey was exercised in an isolated local workspace. Browser screenshots could be captured and inspected in the in-app browser, but the available browser bridge does not expose a supported way to write its screenshot bytes into the repository. The ChatGPT-only browser journey and responsive widths were not verified. No overall Product Pass is claimed.

## Architecture and behavior

- `QuantitativeComparisonCharts` is the shared presentation for period-comparison results. M3-A `QuantitativeEvidence` reuses the same value and period formatting helpers.
- `adaptComparisonForChart` is a thin adapter over `QuantitativeComparisonPreview`. It retains each original row and its evidence; it does not match entities, check periods, or calculate changes.
- Available views: baseline vs current, M2-provided absolute change, M2-provided percentage change, and the complete paginated comparison table.
- Percentage values and unavailable reasons come directly from M2. The frontend does not recalculate growth. A zero baseline has no percentage bar; a true zero in baseline/current or absolute change remains zero.
- Only rows with `comparable` status are charted. Missing, source-only, identity-conflict, invalid and other excluded rows remain in the complete table with their reasons and evidence.
- The selection panel exposes original source values, filenames, periods, metric context, GEO/platform, source row, methodology, verification state, metadata provenance, source/report links and the backend formula where supplied.
- Research Results shows a contextual “Compare CSV exports” link only when the current report has a linked dataset. Existing report-supplied quantitative charts remain in place.

### CSV-to-chart contract

The presentation adapter maps each M2 row to `{ key, label, row, baseline, current, absoluteChange, percentageChange }`. `row` is preserved intact as the provenance/evidence reference. Eligibility is type-specific and does not synthesize values. M2's `period_readiness`, metric identity, scope and row status remain authoritative.

## Product workflow

**Before:** Import/select two CSV exports, run the comparison, then review a dense table to understand changes.

**After:** Run the same M2 comparison and immediately see a grouped baseline/current view. Switch to absolute or backend-provided percentage changes, search/sort, limit the visible apps, inspect both original observations, or switch to the full table without losing source-only and invalid rows.

## Files changed

- `frontend/src/reports/QuantitativeComparisonCharts.tsx` — charts, toolbar, evidence panel and full table.
- `frontend/src/reports/comparisonChartAdapter.ts` — typed presentation adapter and chart eligibility.
- `frontend/src/reports/comparisonChartAdapter.test.ts` — adapter provenance and eligibility tests.
- `frontend/src/reports/quantitativePresentation.ts` — shared number and period formatting.
- `frontend/src/reports/QuantitativePeriodComparison.tsx` — render the new comparison result view.
- `frontend/src/reports/QuantitativePeriodComparison.test.tsx` — chart evidence, missing-data, percentage and 100-row behavior.
- `frontend/src/reports/QuantitativeEvidence.tsx` — reuse shared display formatters.
- `frontend/src/reports/ReportResults.tsx` — contextual link to CSV period comparison.
- `frontend/src/style.css` — chart/table layout, signed bars, evidence details and responsive rules.
- `.bangiao/M3B-UNIFIED-ANALYTICS-CHARTS.md` — this handoff.

The pre-existing `scripts/setup.ps1` modification and untracked `.devcrew/`, `.m1-test-tmp/`, and `.test-tmp/` were not part of this task and were not staged.

## Tests

- `npm.cmd test -- --run --maxWorkers=1` — **13 test files passed, 130 tests passed**.
- `npm.cmd run build` — **passed** (`tsc --noEmit` and Vite production build).
- `git diff --check` — **passed** (line-ending conversion warnings only).
- Backend regression `pytest tests/test_quantitative_comparisons.py -vv -s` was attempted against the existing isolated test setup. The first test stalled after the Alembic test database reached migration `20261020_0007`; it was interrupted. No backend source was changed. Backend regression is **NOT VERIFIED**.

## Browser UAT

Used an isolated SQLite root under `.m3b-uat/` and a clearly labelled synthetic fixture. The test data was not the owner's market data and was not added to the handoff as real research.

Verified in the running app:

1. Select two compatible CSV exports, choose the shared metric/scope/periods and run comparison.
2. See 3 paired apps; baseline/current values were `100 → 125`, `80 → 70`, and `0 → 0`.
3. Inspect one app and see both original observations and source metadata.
4. Switch to absolute change and see `+25`, `0`, and `-10` in the relevant test view.
5. Switch to percentage change: the zero-baseline percentage is omitted from the chart and its exact unavailability reason remains in the table.
6. Open the full table and retain exact observations/evidence.
7. Refresh, reselect the same periods and reproduce the same comparison.

The in-app browser screenshot was captured and visually inspected during UAT, but was not saved as a repository file: the available CUA screenshot method returns an image to the conversation and provides no supported filesystem export. No screenshot file or screenshot link is claimed.

Not verified:

- ChatGPT-only report chart flow in browser (existing frontend regression suite passed, but the browser journey was not run).
- Browser CSV file-picker upload; UAT used the app's local API to load the disposable fixture, then exercised the actual comparison UI.
- 1440px, 768px and 390px viewport checks; the current in-app browser surface does not expose viewport resizing.
- The owner's real CSV pair was not used for this UAT. Synthetic comparison correctness does not validate market conclusions.

## Limitations and acceptance

- The chart presents baseline/current values as paired proportional bars and signed changes as centered bars; it intentionally does not turn two period exports into a time series.
- Non-comparable rows remain table-only. Unsupported/negative source values are not rendered as positive baseline/current bars.
- Screenshot artifacts and full mobile/tablet browser checks remain outstanding, as does the browser Journey B.
- **Technical acceptance:** frontend tests and production build pass; backend comparison regression test did not complete.
- **Product acceptance:** CSV compare → chart → inspect evidence → full table → refresh/reopen was verified with isolated fixture. The complete acceptance remains pending until Journey B, responsive browser checks, screenshot artifacts and backend regression are verified.

## Commit

Commit SHA: to be filled after commit.
