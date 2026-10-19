# UI-02 — Quantitative Intelligence Foundation

**Status:** AWAITING PRODUCT OWNER REVIEW

**Branch:** `feat/ux-recovery-01-research-results`

**Starting HEAD:** `983ccf61c3f972bc7541b371bc32e2cd50a61a09`
**Implementation commit:** `52cf009` — `feat(ui-02): add quantitative data foundation`

## Delivered

### Data contract

Added optional `quantitative_observations` to the existing `UniversalResearchData` / `po_research_v1` payload. Each observation carries a canonical metric ID, definition, exact finite numeric value, unit, entity, GEO, platform, ISO period bounds, granularity, source URL, verification status, provenance type/ID, observation type, and explicit validation reasons.

Missing fields and invalid period values remain visible as incomplete observations. Report-supplied observations cannot claim `verified`; ChatGPT output is not treated as independent verification. The importer does not derive observations from prose, headings, tables, screenshots, approximate values, or URL presence alone. A supplied quantitative source URL must also exist in the report's source-reference registry.

### Persistence and compatibility

Migration `20261020_0007` adds the report-scoped `quantitative_datasets` table. It stores the original CSV text, SHA-256, filename, field/entity mappings, normalized observations, coverage status, and validation reasons. A foreign key links each dataset to one imported report; a per-report content-hash constraint prevents duplicate dataset imports.

The migration is additive. No existing columns, reports, benchmark selections, PO workspace notes, projects, runs, or manifests are rewritten. An integration test upgrades a report and saved PO data from revision `20261017_0006` and confirms those values survive.

### API and data flow

- `POST /api/v1/reports/{report_id}/quantitative-datasets`: accepts CSV content with explicit header mappings and optional confirmed entity mappings. CSV is stored verbatim locally; mapped rows become `imported`, unverified observations.
- `GET /api/v1/reports/{report_id}/quantitative-datasets`: returns datasets linked to that report, with pagination.
- Re-importing identical CSV content for the same report returns the existing dataset with `duplicate: true`.
- Ambiguous exact entity-name matches return `409 AMBIGUOUS_ENTITY_MAPPING` with candidate keys; no dataset is saved until mappings are confirmed.
- CSV normalization canonicalizes metric IDs and a small set of unambiguous unit aliases. Unknown or missing fields remain incomplete.
- Different GEO/platform or non-overlapping periods are reported as incompatible; unknown report scope is marked partial. `Both` accepts iOS/Android only; cross-platform accepts broader platform scope.
- `calculate_change` supports strict compatible absolute/percentage change for adjacent period-over-period or year-over-year observations. It retains both source references and provenance IDs, and calculated values remain unverified.

The generated OpenAPI document exposes typed import and response schemas.

### Frontend foundation

Added TypeScript types and API methods for quantitative observations and datasets. Research Results now selects among no data, report-supplied, CSV-linked, mixed-compatible, and partial/incompatible states, and exposes validation reasons and dataset provenance in a compact disclosure. No charts or V2 dashboard panels were added.

## Files changed

- `backend/app/models.py`
- `backend/app/quantitative.py`
- `backend/app/reports.py`
- `backend/app/research_data.py`
- `backend/app/schemas.py`
- `backend/migrations/versions/20261020_0007_quantitative_foundation.py`
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/reports/api.ts`
- `frontend/src/reports/quantitativeState.ts`
- `frontend/src/reports/quantitativeState.test.ts`
- `frontend/src/style.css`
- `tests/test_quantitative.py`

## Verification

- Backend full suite: **77 passed**, 1 Starlette/AnyIO deprecation warning from the installed test stack.
- Frontend suite: **50 passed** across 5 test files.
- TypeScript: **passed** (`npm run typecheck`).
- Production build: **passed** (`npm run build`).
- Migration verification: `alembic upgrade head` on an isolated temporary SQLite database, then `alembic check`: **passed; no schema drift detected**.
- Migration compatibility test: legacy report content, structured JSON, benchmark selections, and PO workspace notes preserved through the additive migration.
- Browser UAT: **NOT VERIFIED**. This is a data/API foundation task; no browser session or owner-provided real qualitative report dataset was available for quantitative-data UAT.
- Real report example: **NOT VERIFIED**. Tests use explicit synthetic fixtures and are not represented as real research data.

Integration tests needed local loopback sockets for FastAPI TestClient. They ran against isolated temporary SQLite files; the configured production SQLite database was not read or modified.

## Known limitations

- CSV import is available through the typed local API/client foundation; a file-picker and interactive header-mapping workflow are not included.
- Entity auto-matching is exact by entity key or case-insensitive exact display name. Fuzzy matches are not guessed; unresolved entities stay partial, and ambiguous exact matches require an explicit mapping.
- Derived comparison is a deterministic backend helper, not a persisted comparison endpoint or dashboard. UI-02 charts and quantitative analytics remain out of scope.
- Report periods are checked for explicit overlap when recognizable years are present; arbitrary period prose is retained but cannot establish compatibility.
- No external source verification, web access, scraping, or paid API is used.

## Product review

**Decision:** AWAITING PRODUCT OWNER REVIEW.
The foundation preserves qualitative report behavior and provides report-scoped quantitative storage, validation, provenance, compatibility states, and tested calculation rules. Visual dashboard acceptance is intentionally deferred; no quantitative chart or market KPI has been fabricated.
