# P0 hotfix — stale local backend

## Root cause

The screenshot's `404` is consistent with an older PO Hub backend being reused on port 8000. The launcher treated any backend exposing `/api/v1/reports` as compatible, even if it lacked `/api/v1/reports/{report_id}/structure-from-response`. The UI also cleared the pasted ChatGPT response after failed requests because the shared update helper swallowed errors.

## Changes

- Launcher now requires the structuring endpoint in OpenAPI before reusing an existing backend, and tells the user to close the old PO Hub process and reopen `run.bat` when it is stale. It does not terminate processes automatically.
- A 404 from the structuring endpoint now gives actionable restart instructions.
- The ChatGPT response remains in the textarea after any failed update and clears only after success.
- Added a regression test for the stale-backend 404 and preservation of pasted content.

## Verification

- Frontend: 23 tests passed across 3 files.
- Frontend production build: passed.
- `run-local.ps1` PowerShell parser check: passed.
- Browser UAT against the user's current API/database: not run; no local report or SQLite data was touched.

## Files

- `run-local.ps1`
- `frontend/src/reports/api.ts`
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/reports/ResearchIntake.test.tsx`
