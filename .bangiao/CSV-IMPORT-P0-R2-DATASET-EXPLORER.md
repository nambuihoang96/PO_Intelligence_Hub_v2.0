# CSV Import P0 R2 — Dataset Explorer

Status: **Implemented; awaiting Product Owner review.**

## Root causes

- CSV entities were resolved only against report entities. Ordinary unmatched apps became unresolved records and were treated as incomplete, which forced unnecessary per-app mapping and made valid source measurements appear unusable.
- One validation result combined source-data quality, ability to analyze within the CSV dataset, and compatibility with the linked report. A GEO/platform mismatch therefore obscured otherwise valid CSV data.
- The report Evidence tab rendered every imported CSV observation as a full detail card, alongside the dataset explorer, recreating the raw-observation dump.
- Existing records retained their original CSV and column mappings, which makes deterministic revalidation possible without replacing the dataset or report link.

## Data and behavior changes

- Each CSV observation keeps a provider-namespaced source entity ID and source display name, plus an optional report entity ID and resolution state (`matched`, `source_only`, `ambiguous`, or `conflict`). Ordinary source-only apps are retained without manual mapping. No report entity is fabricated.
- Readiness is separated into source validation, display readiness, dataset analysis readiness, dataset comparison readiness, and linked-report compatibility. Scope mismatches do not invalidate source values. `Unified` stays `Unified` and is never converted to iOS or Android.
- The dataset explorer presents CSV filename, source rows/apps, metric count, source-valid and report-compatible observation counts, incomplete rows, filters, sorting, selectable metric columns, pagination, missing/ambiguous cells, and per-cell provenance inspection. Raw per-observation diagnostics remain under a collapsed Advanced section.
- Existing linked datasets can be revalidated from their stored original CSV and mappings using `POST /api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}/revalidate`. The update reuses the dataset record and report link. It returns a conflict when required saved mappings are missing or unresolved; it does not silently discard or guess those mappings.
- No schema migration was required. Production SQLite was not opened or modified.

## Files changed

- `backend/app/quantitative.py`
- `backend/app/reports.py`
- `backend/app/research_data.py`
- `backend/app/schemas.py`
- `frontend/src/reports/QuantitativeDatasetExplorer.tsx` (new)
- `frontend/src/reports/QuantitativeDatasetExplorer.test.tsx` (new)
- `frontend/src/reports/QuantitativeDatasetImport.tsx`
- `frontend/src/reports/QuantitativeDatasetImport.test.tsx`
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/reports/api.ts`
- `frontend/src/style.css`
- `tests/test_quantitative.py`

The pre-existing user changes in `scripts/setup.ps1`, `.devcrew/`, and `.test-tmp/` were not included.

## Verification

- Backend quantitative API and readiness suite: **40 passed**. It exercised Alembic migrations against isolated temporary SQLite databases.
- Backend report API regression suite: **31 passed**, also using isolated temporary SQLite databases.
- Frontend suite: **10 files, 91 tests passed**.
- TypeScript check and production Vite build: **passed** (`npm run build`).
- `git diff --check`: **passed**.
- Database migration: no new migration needed; existing migrations ran successfully in the isolated tests.

## Browser UAT

- Tested the running local application with an isolated SQLite database and a 100-app Sensor Tower-style semicolon-delimited fixture: 10 exact report matches, 90 source-only entities, 3 metric columns, one invalid metric value, explicit `Worldwide`, and `Unified` platform scope.
- Confirmed the explorer retained all 100 source identities, presented the invalid measurement as `Unknown`, kept `Unified` intact, filtered by source ID, opened a measurement's evidence/provenance, revalidated the stored CSV while retaining the dataset ID/report link, and retained the dataset after browser refresh.
- At 390px, the document width stayed within the viewport (`scrollWidth` 375px, viewport 390px); the dataset table used contained horizontal scrolling. Main navigation, breadcrumb, and report tabs also scroll horizontally at mobile width.
- A real browser screenshot of the mobile view was captured and displayed during this task. The in-app browser capture interface exposed it as an image result but did not provide a path/export operation to write the PNG into the repository. Therefore screenshot files under `.bangiao/screenshots/csv-import-p0-r2/` are **NOT VERIFIED / NOT COMMITTED**.
- The browser UAT seeded the linked dataset through the local API. File selection and upload through the browser's CSV chooser were **NOT VERIFIED**. Frontend import interactions are covered by component tests.
- The browser fixture was synthetic and isolated; the owner's two supplied Sensor Tower exports were inspected for headers and sample rows, but were not uploaded in this UAT.

## Limitations

- Multi-period observations that share an app/metric cell are surfaced as ambiguous rather than combined. The explorer does not aggregate incompatible periods or scopes.
- The current UAT did not exercise the upload chooser with the two owner-provided exports and repository screenshot artifacts could not be saved through the available browser capture interface.
- `Unified` platform is intentionally treated as its own scope; comparisons that require a native mobile OS remain incompatible until explicitly mapped with valid evidence.

## Commits

- Implementation commit SHA: `2ece4c8` (`feat: add source-aware CSV dataset explorer`).
- Handoff and status update: committed and pushed to `feat/ux-recovery-01-research-results` (the delivery commit SHA is in Git history).
