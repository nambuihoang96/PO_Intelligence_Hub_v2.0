# PO HUB — M2 Multi-CSV Period Comparison

**Branch:** `feat/ux-recovery-01-research-results`
**Baseline:** `31aaed51f66985257068e8e2cb825959c588e221`
**Status:** Technical acceptance complete; Product UAT pending.

## Architecture and decisions

The existing CSV dataset records remain the source of truth. M2 adds a typed, deterministic comparison API over those stored observations and does not copy CSV data into a second model. The comparison is report-independent: each export keeps its original report association and provenance, while its own CSV GEO/platform can be compared independently of the research report's scope.

No database migration was needed. New `snapshot_date`, `period_semantics`, and `source_row_number` values are optional fields in the existing JSON observation storage. Older datasets still load; a legacy mapping of a single `Date` column to `period_start` is surfaced as a snapshot candidate, never silently treated as an interval.

## Product workflow

The new **Compare Periods** page lets a PO attach original CSV files to a selected report through the existing import flow, choose two datasets, select their exact shared metric, GEO, platform and periods, then review app-by-app results. Dataset selection paginates through the full catalog. The result table supports search, name/absolute-change/percentage-change sorting, pagination and source/report links for each observation.

Comparison preview is reproducible from the preserved datasets; the app does not persist a duplicate result or claim a saved comparison. On refresh, imported datasets remain available and the PO can reselect the comparison.

## Matching and comparison rules

- Automatic matching requires the same stable, namespaced provider source ID. Sensor Tower Unified IDs are retained as `sensor_tower:<id>`.
- Generic CSV identities and name-derived IDs never auto-match. Different IDs and same-name apps remain separate. Unmatched rows from both exports stay visible.
- Duplicate observations are reported without aggregation. Conflicting display names for one stable ID require review.
- Metric identity is exact across metric ID, definition, unit and methodology. Similar labels do not establish equivalence. Revenue needs a recognized ISO currency in its unit.
- GEO and platform must match exactly after case/whitespace normalization. Dataset scope is used; a linked report's unrelated GEO/platform does not rewrite CSV scope.
- A bare `Date` column is retained as a date value but its meaning stays unknown until the PO confirms it. A confirmed snapshot can be compared only to an earlier snapshot; snapshots cannot be mixed with intervals.
- Intervals require explicit bounds, matching semantics/granularity, valid windows, chronological order and no overlap. Quarter/week and other incompatible windows are blocked.
- Missing, approximate, invalid, or provenance-incomplete values are never turned into zero or silently discarded. Baseline zero, negative/signed values, percentage metrics and precomputed YoY metrics do not receive unsupported percentage growth.
- Absolute change is `current − baseline`. Percentage change is `(current − baseline) / baseline × 100` only for exact compatible non-negative absolute measurements with a non-zero baseline. Both source observations and the formula are returned; source measurements remain unchanged and unverified unless their stored status says otherwise.

## API and M3-B integration contract

- `GET /api/v1/quantitative-comparisons/datasets?limit=100&cursor=...` returns typed report-linked datasets with metrics, periods, scope, source app counts, readiness and warnings.
- `POST /api/v1/quantitative-comparisons/preview` accepts two dataset IDs, exact metric identity, GEO/platform, two period keys, and optional explicit meaning confirmations for ambiguous legacy dates.
- The typed preview returns the selected source datasets and periods, `period_readiness`, coverage counts, metric warnings, and one row per matched or source-only app. Each row carries baseline/current source values, immutable dataset/report/row/source references, verification status, derived change fields, formula and blocking reasons.
- M3-B should visualize this response or call the same comparison service. It must not repeat identity joins or derive alternate values from report scope. Unavailable changes remain `null`; `incompatible_periods`, `needs_review`, `identity_conflict`, duplicate and missing statuses should remain visible.

## Changed files

- `backend/app/main.py`
- `backend/app/quantitative.py`
- `backend/app/quantitative_comparisons.py` (new)
- `backend/app/research_data.py`
- `backend/app/schemas.py`
- `frontend/src/main.tsx`
- `frontend/src/reports/QuantitativeDatasetImport.tsx`
- `frontend/src/reports/QuantitativeDatasetImport.test.tsx`
- `frontend/src/reports/QuantitativePeriodComparison.tsx` (new)
- `frontend/src/reports/QuantitativePeriodComparison.test.tsx` (new)
- `frontend/src/reports/api.ts`
- `frontend/src/style.css`
- `tests/test_quantitative.py`
- `tests/test_quantitative_comparisons.py` (new)
- `.bangiao/M2-MULTI-CSV-PERIOD-COMPARISON.md` (new)

The pre-existing user edit in `scripts/setup.ps1` and untracked `.devcrew/`, `.m1-test-tmp/`, and `.test-tmp/` were preserved and are excluded from this task's commit.

## Tests

- `python -m unittest discover -s tests` — **122 passed**; includes existing regression and migration tests using isolated temporary SQLite databases.
- Quantitative period semantics regression — **passed**, including the test that confirms a source Date as a snapshot before comparison.
- `npm.cmd test -- --run --maxWorkers=1` — **122 passed across 11 files**.
- `npm.cmd run build` — **passed** (TypeScript check and Vite production build).
- `git diff --check` — **passed** (Git emitted only a line-ending notice for the pre-existing, unstaged `scripts/setup.ps1` edit).
- Comparison acceptance fixtures include 100 rows per export, 70 shared Sensor Tower IDs, 30 baseline-only, 30 current-only and 130 distinct apps; also cover exact formula/evidence, duplicate rows, conflicting names, no common IDs, missing values, zero baseline, signed metrics, revenue without currency, GEO/platform mismatch, metric-method mismatch, date-meaning confirmation, quarter/week mismatch, overlapping and unequal-length windows, and API schema.

### Authorized owner CSV inspection and isolated API import

The two supplied period exports were imported into a disposable SQLite database through the existing dataset API; their files were read only. The older export contains 10,000 physical CSV records, of which 25 contain app observations and 9,975 are blank; the importer retained all 25 app observations and the original file hash. The newer export contains 25 observations. Each file has 25 distinct Unified IDs, and all 25 IDs are shared.

The CSV body has a single `Date` per app (14/09/2026 and 14/10/2026 respectively); filenames supply explicit ranges `14 Sep–13 Oct` and `14 Oct–13 Nov`. The API QA import supplied those filename ranges explicitly and did not infer them from the body. These ranges are unequal in length (30 versus 31 inclusive days), and no granularity is present. All 25 shared IDs also have identical `Downloads (Absolute)` values across the two supplied exports. Therefore this actual pair must not produce a growth conclusion. Methodology is absent from the files as well; the API correctly reports zero usable observations until it is confirmed. The data import worked, but a valid comparison is blocked by period and methodology readiness.

The separate 27-row `test.csv` was inspected read-only: it contains 25 unique IDs and two additional rows with a different date. It was not imported. Automated synthetic tests remain the coverage for matching and arithmetic.

## Browser UAT

**PRODUCT PENDING UAT — NOT VERIFIED.** The available local browser tab was on `http://127.0.0.1:15173/`, but its backend was unavailable during preflight. The M3-A handoff likewise records local chart UAT pending. No screenshot or successful browser interaction is claimed.

PO UAT checklist on a disposable local SQLite database:

1. Start the frontend and backend with `APP_DATA_ROOT` pointed at a new temporary folder, not the normal D: production-data folder.
2. Open **Compare Periods**, choose the report that should own each export's provenance, and import two genuine, non-duplicate period CSVs.
3. Confirm only metadata absent from the files or genuinely ambiguous, then refresh the dataset list.
4. Select baseline/current exports, shared metric, GEO, platform and their period meanings; run comparison.
5. Verify matched and source-only counts, sort by absolute and percentage change, search an app and open both source links and report links.
6. Refresh, repeat the same selections and verify source values and deterministic results are unchanged.
7. Check 1440px, 768px and 390px widths; capture screenshots if the browser is available.

## Limitations

- This phase returns a comparison preview; it does not persist comparison selections. The imported CSV datasets themselves remain persisted.
- Ambiguous historical `Date` meanings require an explicit confirmation. Confirming the meaning for preview does not rewrite the original dataset.
- Dataset metric methodology must be supplied during import; the current data model does not support editing this metadata after an identical-content dataset has already been saved.
- There is no automatic currency conversion, app-name matching, manual mapping interface, or market-wide inference.
- Browser and actual-owner-CSV UAT remain pending.

## Acceptance

- **Technical acceptance:** PASS for automated backend/frontend/build checks.
- **Product acceptance:** PENDING until the PO completes the browser checklist with real CSVs and confirms the workflow.

## Commit

Implementation commit: `162e303b35c9d7838ac0617d26b3f2b38aa891ea`.
