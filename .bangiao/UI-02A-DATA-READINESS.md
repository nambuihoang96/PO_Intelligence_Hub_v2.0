# UI-02A — Quantitative Data Readiness & CSV Import UX

## Delivery status

Implemented quantitative readiness and a report-scoped CSV import workflow. Backend and frontend verification passed. Browser UAT verified CSV preview, validation, confirmation, and persistence after refresh against an isolated test database.

**Browser evidence limitation:** the in-app browser did not expose viewport resizing or an approved way to save its screenshots into the workspace. Mobile layout is **NOT VERIFIED**. Real browser screenshots were inspected during UAT but could not be committed under `.bangiao/screenshots/ui-02a/`; no screenshot files are claimed here. The browser fixture was synthetic test data, not a real market report.

## Data readiness rules

- CSV parsing retains every non-empty source row, including invalid and duplicate observations, along with validation reasons. The exact original CSV is preserved with the linked dataset.
- Import success means the dataset was stored. It does not mean that every observation is complete or usable.
- An observation is complete only when its canonical metric identity and definition, finite exact numeric value, unit, entity, GEO, platform, start/end dates, granularity, HTTP(S) source reference, and provenance are present and valid.
- Scope compatibility is reported separately as compatible, incompatible, or unknown. Missing scope is not filled from the report.
- Pair-check readiness requires a complete observation, explicit report-scope compatibility, and a supplied methodology. Calculations additionally require exact metric identity/definition, unit, entity, GEO, platform, granularity, methodology, source, provenance, and compatible adjacent periods. No label-only equivalence is assumed.
- Report-supplied observations remain `reported` and `unverified`. CSV rows are `imported` and `unverified`. Calculated values remain unverified and retain their source provenance.
- Existing stored dataset readiness is recalculated on read. No database migration was needed; the existing additive dataset storage and original reports remain compatible.

## API and user flow

- `POST /api/v1/reports/{report_id}/quantitative-datasets/preview` validates a proposed mapping without persisting it.
- `POST /api/v1/reports/{report_id}/quantitative-datasets` stores the original CSV and observations for that report only after confirmation. Re-importing the same CSV for the same report returns the existing dataset.
- `GET /api/v1/reports/{report_id}/quantitative-datasets` returns stored observations plus separate complete, scope-compatible, and pair-check-ready counts.
- The UI lets the PO choose a local CSV, inspect its filename and sample rows, edit detected column mappings, inspect row-level validation and resolve ambiguous entities, then explicitly confirm linking.
- Research Results now shows a compact Data Sources section with report-supplied quantitative observations, CSV datasets, provenance, verification state, and readiness. No analytics charts were added.

## Changed files

- `backend/app/quantitative.py`
- `backend/app/reports.py`
- `backend/app/research_data.py`
- `backend/app/schemas.py`
- `frontend/src/reports/QuantitativeDatasetImport.tsx`
- `frontend/src/reports/QuantitativeDatasetImport.test.tsx`
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/reports/ResearchIntake.test.tsx`
- `frontend/src/reports/api.ts`
- `frontend/src/style.css`
- `tests/test_quantitative.py`

The pre-existing user changes in `scripts/setup.ps1` and `.devcrew/` were not included.

## Verification

- Backend focused quantitative suite: **20 passed**.
- Full backend suite: **83 passed**.
- Alembic migration check: **passed**, no new upgrade operations detected.
- Frontend tests: **51 passed across 6 files**.
- TypeScript check and production build: **passed**.
- Browser UAT, isolated database, desktop in-app browser: **passed** for local file selection, sample preview, editable mappings, mixed valid/incomplete CSV validation, row-level reasons, explicit report linking, and refresh/reopen persistence.
- CSV UAT fixture contained four rows: three complete, scope-compatible rows and one incomplete row with an invalid value and missing scope/period. The linked dataset showed partial readiness after refresh.
- Duplicate import and entity ambiguity were covered by backend tests. Metric-semantic mismatch, valid/invalid period comparisons, legacy readiness and qualitative report compatibility were covered by backend tests.
- Mobile browser UAT: **NOT VERIFIED** because the available in-app browser did not expose viewport resizing.
- Screenshot files: **NOT SAVED**. Screenshot capture was visually inspected in the in-app browser, but the available browser integration did not provide an approved local-file export path.
- Production SQLite: **not used or modified**. UAT used `.test-tmp/ui02a-uat-data`.

## Known limitations

- No charts or quantitative analytics dashboard are included; this task establishes safe data intake and readiness only.
- The UI does not yet provide a separate entity catalogue for CSV-only entities. Unmatched values remain visible and incomplete; ambiguous matches require explicit mapping to an existing report entity.
- Pair readiness indicates that an observation can participate in a compatibility check; it does not assert that a compatible comparison pair exists. Dataset-level response keeps this distinction visible.
- Mobile layout and committed screenshot evidence remain unverified as stated above.

## Commit

Implementation commit SHA: `d5735017d561fd13923d5f4b3f8fe2ad07646f7c`.

The handoff document is committed separately after the implementation commit so this file can record the exact implementation SHA.
