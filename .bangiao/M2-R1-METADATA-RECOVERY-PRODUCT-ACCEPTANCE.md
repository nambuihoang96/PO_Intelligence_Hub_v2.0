# PO HUB — M2 R1 Metadata Recovery & Product Acceptance

**Branch:** `feat/ux-recovery-01-research-results`
**Starting HEAD:** `318e081e720301eb1d91e6f5ba56192b6a95af39`
**Status:** Technical acceptance passed; exact owner CSV acceptance remains unverified.

## Root cause

Imported CSV rows and their original mapping metadata were treated as the only source of measurement scope. When methodology or period meaning was missing, the PO had no safe correction path for an already-imported dataset. Reimporting the same bytes returned the existing record without a metadata review flow. In addition, the comparison client generated a metric identity differently from the opaque key used by the API's period catalog, leaving valid period controls unavailable after dataset selection.

## Implementation

- Added a non-destructive `metadata_review` overlay inside the existing dataset mapping JSON. It records values, provenance basis, supporting source details, confirmation, revision and history while retaining the original CSV, SHA-256, dataset/report IDs, observations, source IDs and row evidence.
- Added report-scoped metadata read/update, dataset read, duplicate-by-hash lookup and revalidation routes. Updates use revision checks and atomic compare-and-set behavior. Revalidation does not rewrite reviewed observation snapshots or orphan metadata keys.
- The comparison catalog and preview now use effective reviewed metadata and return metadata provenance; unverified PO-entered text remains ineligible as verified provider methodology.
- Duplicate CSV detection offers the saved dataset and its metadata review action instead of requiring another import.
- Added date/future-window and unequal-period-length guards. No database migration was needed; existing JSON rows remain backward compatible.
- Fixed the typed metric-key contract used by period selection and constrained the comparison page's grid to its container so mobile content no longer widens the page. The comparison table retains its own horizontal scrolling.

## Data-safety and period rules

Metadata is an overlay; original source bytes and parsed observations are not rewritten. Every change records its basis and audit details, stale revisions are rejected, and conflicting confirmations are not silently replaced. Reimport resolves to the same dataset. Only grounded provider documentation can make methodology comparable; a PO note remains explicitly unverified. Single dates are not promoted into intervals, future-ending windows and unequal-length interval totals remain blocked, and no per-day normalization or growth is invented.

## API and data flow

- `GET /api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}/metadata`
- `PUT /api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}/metadata`
- `GET /api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}`
- `GET /api/v1/reports/{report_id}/quantitative-dataset-by-hash/{sha256}`
- Existing `POST .../{dataset_id}/revalidate` and comparison catalog/preview now read the reviewed overlay.

Workflow: local CSV selection → same-report hash lookup → review saved metadata if duplicate → save versioned corrections with provenance → revalidate → refresh comparison catalog → select exact metric/scope/periods → source-traceable comparison preview.

## Verification

- Backend: `python -m unittest discover -s tests -p 'test_*.py'` — **128 tests passed**, including migration/regression tests on isolated SQLite databases.
- Frontend: `npm test -- --run --maxWorkers=1` — **126 tests passed across 12 files**.
- TypeScript and production build: `npm run build` — **passed**.
- Alembic model check — **No new upgrade operations detected**; no migration added.
- `git diff --check` — **passed**. Git printed only line-ending notices for the pre-existing, unstaged `scripts/setup.ps1` change.

## Browser UAT

Executed in the Codex in-app browser against a disposable SQLite database at `.m2r1-uat/data`; the production database was not used.

- Opened an incomplete saved dataset, reviewed its metadata, saved the methodology as PO-supplied/unverified, refreshed and reopened it. The note and provenance remained; it did not unlock a comparison.
- Imported two explicitly synthetic, Sensor Tower-shaped export fixtures (three stable source IDs each) through the browser. The confirmed August and September intervals were equal length, sequential, non-overlapping and past relative to the test date.
- Selected both datasets and ran the comparison. The catalog exposed the matching metric and period keys; the preview retained all three app IDs, CSV row numbers and evidence links. Synthetic values were 100→110, 200→210 and 300→330; the UI showed corresponding differences and kept source evidence labeled unverified. These are test fixture values, not market results.
- Desktop viewport: 1440×900. The page had no outer horizontal overflow; the wide comparison table scrolled inside its own container.
- Mobile viewport: 390×844. Initially found a page-width overflow caused by an intrinsic CSS grid track; fixed it. After the fix, body width and scroll width were both 375 CSS pixels (390 viewport minus scrollbar), while the table stayed inside a 303-pixel scroll container. Dataset, metric, GEO, platform, period selectors and compare action remained usable.
- Actual desktop and mobile screenshots were captured from the running app in the Codex browser session. The available browser capture surfaced the images inline but did not expose a local file-export path, so screenshot binaries are not staged in the repository.

### Exact owner CSV coverage

**NOT VERIFIED.** The exact owner exports were not present in the authorized workspace, so their current bytes were not inspected or imported. The successful comparison UAT above is synthetic only. The prior M2 handoff describes those exports as having unequal 30/31-day windows, identical Downloads Absolute values, and missing methodology; per the acceptance rules, they should remain blocked until their current source files and methodology/period evidence are reviewed.

## Changed files

- `backend/app/dataset_metadata.py` (new)
- `backend/app/quantitative.py`
- `backend/app/quantitative_comparisons.py`
- `backend/app/reports.py`
- `backend/app/research_data.py`
- `backend/app/schemas.py`
- `frontend/src/reports/DatasetMetadataReview.tsx` (new)
- `frontend/src/reports/DatasetMetadataReview.test.tsx` (new)
- `frontend/src/reports/QuantitativeDatasetExplorer.tsx`
- `frontend/src/reports/QuantitativeDatasetImport.tsx`
- `frontend/src/reports/QuantitativeDatasetImport.test.tsx`
- `frontend/src/reports/QuantitativePeriodComparison.tsx`
- `frontend/src/reports/QuantitativePeriodComparison.test.tsx`
- `frontend/src/reports/api.ts`
- `frontend/src/style.css`
- `tests/test_dataset_metadata.py` (new)
- `tests/test_quantitative.py`
- `tests/test_quantitative_comparisons.py`

The pre-existing user change in `scripts/setup.ps1` and unrelated untracked `.devcrew/`, `.m1-test-tmp/` and `.test-tmp/` content were preserved and excluded.

## Limitations and acceptance

- Technical implementation and synthetic browser workflow: **PASS**.
- Exact current owner CSV workflow: **NOT VERIFIED**; Product Owner validation remains pending those source files.
- A long-format CSV with more than 12 mapped fields may exceed the current import mapping schema limit; wide Sensor Tower exports used in this UAT fit the current mapper.
- No charts, analytics dashboard, paid API, scraping, market claims or production database changes were introduced.

**Implementation commit:** `09aea22` (`Fix M2 metadata recovery and comparison readiness`).
