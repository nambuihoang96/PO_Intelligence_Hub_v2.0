# Research Contract P0 — Handoff

## Result

Implemented on local branch `fix/research-contract-p0`. No push, PR, or merge was performed. No database migration was added.

## Root causes addressed

- The research prompt produced a versioned `{ schema_version, research_data }` envelope, while the import parser accepted only bare research data. Valid prompt output could therefore fail request validation.
- Structured JSON embedded in a Markdown response did not follow the same duplicate-upgrade path as the legacy separate JSON field.
- Source URLs inside a structured response were not consistently extracted, and ChatGPT-provided source locations could be mistaken for verified report locations.
- The results view did not surface summary/takeaways and actual findings prominently; benchmark dimensions with absent observations could display a fabricated placeholder.

## Changes

- Added a versioned Pydantic research-response envelope, while retaining support for bare/legacy structured data and Markdown with a fenced JSON response.
- Added actionable schema/reference validation, extraction of source URLs, and deterministic source-location derivation from the original report. Source verification remains false unless explicitly verified elsewhere; generated locations are not trusted.
- Added a controlled endpoint for structuring an existing text-only report from one complete ChatGPT response. It preserves the original report, benchmark selections/workspace, and PO notes. Conflicting existing structured data is not silently overwritten.
- Added explicit research readiness/version fields and surfaced summary, takeaways, clickable findings, evidence, scope, uncertainty, and PO implications in the Results view. Missing benchmark observations display `Unknown`.
- Updated the prompt builder, API types, UI tests, backend tests, and health contract.

## Files changed

- `backend/app/main.py`
- `backend/app/reports.py`
- `backend/app/research_data.py`
- `backend/app/schemas.py`
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/reports/ResearchIntake.test.tsx`
- `frontend/src/reports/ResearchIntake.tsx`
- `frontend/src/reports/api.ts`
- `frontend/src/reports/researchPrompt.ts` (new)
- `tests/test_health.py`
- `tests/test_reports.py`

Pre-existing local edits to `.gitignore` and `scripts/setup.ps1` were left unstaged and are not part of this task commit.

## Verification

- Backend: `python -m unittest discover -s tests` — **62 tests passed**.
- Frontend: `npm test -- --testTimeout=15000` with temp files redirected into the workspace — **22 tests passed across 3 files**. A first attempt using the OS Temp directory was blocked by Windows sandbox `EPERM`; the rerun passed.
- Frontend production build: `npm run build` — **passed** (TypeScript check and Vite production build).
- Migration check: **passed; no new upgrade operations detected**. No migration was needed.
- Browser UAT: **NOT VERIFIED**. Chrome could not connect to the isolated localhost test services (connection refused/timeout, with both isolated ports unavailable). The running application and its SQLite database were not used or modified.
- Live ChatGPT compatibility: **NOT VERIFIED**; no external/paid API was called.

## Remaining limitations

- Browser workflow acceptance (import, view, benchmark, refresh persistence) must still be exercised in the user's local browser environment.
- Source URLs and structured claims remain unverified user-provided research. Deterministic traceability does not certify claim accuracy.
- Research content without a valid structured response remains text-only until the user submits a valid response for that report.

## Commits

- Feature commit: `6cae24a2fe49411c478b7c06e49509776bd214ac`.
- Handoff commit: recorded in the final response after this report is committed.
