# M4 — Data-First Research Workflow

## Delivery

- Branch: `feat/ux-recovery-01-research-results`
- Starting HEAD: `931c881fe81c91fd17bb092d22386df6eb5b0417`
- Implementation commit SHA: `e7fada9` (full SHA: `e7fada9efb3f16c360ff0a66343603351aa848e0`)
- Scope: CSV-first research workspaces, workspace-owned datasets, manual candidate selection and prompt preparation, report linking, and safe period comparison.

## What changed

A Product Owner can start a research workspace before creating a Research Project plan or report, import CSV exports into that workspace, inspect product observations, and compare compatible exports. CSV files are stored once per workspace with their original content and source provenance. Existing report-owned datasets remain visible through linked reports; linking does not copy or silently replace records.

The workspace can select products from the observed rows and save that selection. The optional “Select 5 highest values in this CSV” action uses only one exact metric, unit, methodology, GEO, platform and period group from the selected file. The saved prompt describes the rule and explicitly says this is not a market-wide ranking. Research remains manual in ChatGPT Plus; the app does not call an AI API.

ChatGPT reports can be imported with a workspace association or linked later. Original report data, plans, finalized run manifests, benchmark state and historical CSV data are preserved. Migration `20261023_0008` adds workspace ownership while retaining existing report ownership and rows.

## Product Acceptance

- **PO goal:** Start with market data, identify candidates worth researching, then add ChatGPT findings to the same workspace.
- **User journey:** Create workspace → import CSV → explore observed products and scope → select candidates → copy prompt for ChatGPT → import/link the report → review compatible period comparisons.
- **Automated work:** Parse mapped CSV columns, retain original files and provenance, group product observations, save selections and shortlist criterion, and prevent incompatible or unsupported period calculations.
- **Expected result:** A reusable local workspace containing imported datasets and linked reports, with candidate and comparison context that remains after refresh.
- **Remaining friction:** CSV columns still need explicit mapping when not detected; ambiguous metadata and product identities need review. The provided exports’ comparison is withheld for valid scope/time reasons described below. Browser verification of saved shortlist refresh remains incomplete.
- **Verification:** Backend suite previously passed 132 tests and Alembic reported no new operations; the 3 focused workspace tests passed again in the final check. Frontend suite passed 136 tests; TypeScript and production build passed. Browser UAT imported both supplied Sensor Tower exports, explored the products and attempted period comparison. Browser confirmation of shortlist save/reload was interrupted by the stale UAT server and localhost test-server replacement issue. This is not a full browser pass.
- **Decision:** `NEEDS FIX` for final Product Acceptance until shortlist save/refresh is confirmed in browser against the current backend. Technical implementation and automated checks pass.

## Real-file browser UAT

Used the two owner-supplied Sensor Tower CSV exports in an isolated SQLite database, not production data.

- The September–October export was detected as semicolon-delimited, with 22 columns and 25 populated product rows despite blank padded lines. `Downloads (Absolute)` was explicitly selected; GEO and dates were confirmed from the supplied export context. The platform remained `Unified` as provided.
- The October–November export was imported into the same workspace with the same metric and compatible stated scope. The UI showed two datasets, 25 populated app rows each, Worldwide, Unified and their supplied date ranges.
- Refresh/reopen showed both datasets in the workspace. The source CSV contents were retained. A row-count issue caused by blank-padded lines was fixed so the UI now counts populated rows, with a backend regression test.
- Period comparison executed but withheld changes: the later interval extends beyond the current date (2026-10-23), the windows have different lengths, and granularity is not stated. The UI reported zero comparable values and 50 observations needing review. No change values were fabricated.
- A separate isolated workspace/report UAT verified report association survives refresh. Automated coverage also checks direct report import into a workspace and linking an existing report.
- During a later browser check, selecting the five highest observed values hit a 422 from the still-running older UAT API. The current API schema and service tests include the saved criterion; a browser retry could not be completed after server replacement was blocked by the localhost environment. The user’s port 15174 was not touched. Mark shortlist browser persistence `NOT VERIFIED`.

No screenshot files were saved for this handoff. No screenshot is claimed as evidence.

## Data and compatibility

- Additive migration makes quantitative datasets optionally report-owned or workspace-owned and permits reports to be linked to workspaces.
- Existing report IDs, report content, CSV bytes, report-owned dataset rows, PO notes, benchmark selections, plans and immutable manifests are preserved.
- Duplicate CSV import is idempotent within a workspace. The same file can remain a separate report-provenance record where required; no provenance is merged.
- `Unified` is preserved exactly and is not converted to Android or iOS.
- Comparison eligibility requires compatible definitions, measurement periods and scope. Missing values are never treated as zero.

## Files changed

- Backend: `backend/app/main.py`, `models.py`, `quantitative.py`, `quantitative_comparisons.py`, `reports.py`, `schemas.py`, new `workspace_data.py`.
- Migration: `backend/migrations/versions/20261023_0008_workspace_owned_quant_datasets.py`.
- Frontend: `frontend/src/main.tsx`, `frontend/src/style.css`, report CSV import/explorer/metadata/period comparison components and APIs, `ResearchIntake.tsx`, research workspace APIs, new `DataFirstWorkspace.tsx` and focused tests.
- Tests: `tests/test_database.py`, `tests/test_quantitative.py`, new `tests/test_workspace_data_first.py`.

The existing uncommitted `scripts/setup.ps1`, `.devcrew/`, `.m1-test-tmp/` and `.test-tmp/` changes are user-owned and excluded from this task commit.

## Test results

- Workspace-specific backend tests: **3 passed** in final focused run.
- Full backend suite: **132 passed** in the prior complete run; Alembic check reported `No new upgrade operations detected`. A later repeat did not finish within the command session and was interrupted, so it is not counted as a new pass.
- Frontend: **136 tests passed** across 14 files.
- TypeScript check: passed.
- Production build: passed.
- `git diff --check`: pending final check.

## Limitations and review status

The supplied second CSV contains a future end date relative to the test date and the two exports have unequal window lengths. Comparison is therefore correctly withheld until the inputs represent completed, compatible periods and have sufficient measurement metadata. Independent vendor documentation was not provided, so owner-confirmed context remains unverified rather than promoted to independently verified provenance.

The data-first workflow is implemented and the real CSV ingestion/exploration path was exercised. Final browser acceptance of saved shortlist refresh remains open. Product decision: **NEEDS FIX / owner review of the browser-persistence limitation**.


