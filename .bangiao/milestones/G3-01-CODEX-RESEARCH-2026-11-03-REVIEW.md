# G3-01 Milestone Review — One-step Codex CLI Research

**Date:** 2026-11-03  
**Status:** Implemented; runtime acceptance remains open.

## Delivered

- Added a Codex CLI model catalog and one-shot research endpoint.
- Added a saved on/off preference and model selection. Enter sends once; Shift+Enter inserts a newline.
- Shows the answer in PO Hub for review; saving remains an explicit PO action.
- Keeps automatic CSV analysis independent from Codex. Selected product details are sent only when the PO explicitly requests optional Codex context.
- Persists Codex provenance on saved reports.
- Updated the launcher compatibility check so it does not reuse a backend missing the Codex endpoints.
- Uses a temporary working directory, read-only sandbox and disabled shell tool. No actual inference was run to conserve quota.

## Verification

- `tests.test_codex_research`: **3/3 PASS**.
- Backend `py_compile`: **PASS**.
- `ResearchIntake.test.tsx` and `DataFirstWorkspace.test.tsx`: **72/72 PASS**.
- Frontend typecheck and production build: **PASS**. Vite reports the existing bundle size advisory at **722.54 kB**.
- Launcher compatibility script before the owner-reported startup issue: **9 cases PASS**. After revising the old-backend prompt: **18 assertions PASS**, including explicit Y and safe N/Enter cancellation.
- `git diff --check`: **PASS**, with line-ending warnings.
- Report-origin API test was interrupted after database migrations completed; persistence is not claimed as verified. The running app's model catalog endpoint returned `{"detail":"Not Found"}`, confirming the open backend is outdated. No runtime browser UAT, model catalog, entitlement or genuine Codex output was verified.

## Product Acceptance

- **PO goal:** ask one research question once in PO Hub and see one Codex response in the same place; retain automatic local CSV insights.
- **User journey:** type question → Enter → review answer → save. CSV path: import → view local analysis → optionally select products → request Codex context → review → save.
- **Automated work:** one CLI invocation, model selection, same-screen preview and saved provenance. CSV comparison is independent and does not consume Codex quota.
- **Expected result:** no prompt/answer copy-paste for Codex; local CSV insights do not depend on Codex.
- **Remaining friction:** local runtime and persistence still require smoke verification. Search is conditional on CLI capability; a model-name hint does not guarantee the cheapest model; results remain unverified and need PO review.
- **Verification:** focused tests/build and launcher compatibility checks above; no actual browser UAT or Codex request.
- **Decision:** `NEEDS FIX / OWNER REVIEW PENDING` until one local smoke request confirms model discovery, Enter submission, preview and saving.

## Next

Use `run.bat` and one question with the suggested lightweight model. Stop after this one smoke request unless a defect needs correction; each actual request uses Codex allowance. Preserve the current data and do not merge or release automatically.

## Rework — owner could not start the current app

The owner ran `run.bat` and saw that port 8000 was occupied by an outdated PO Hub API. The prior launcher refused to stop a process it did not own, but told the owner to inspect and stop its PID manually. That was safe but not an acceptable PO-facing handoff.

`run-local.ps1` now explains the stale API and asks for a Y/N answer in the same window. It stops only the confirmed PO Hub listener after Y, and rechecks listener PID(s) and process start times after the prompt. Enter/N cancels. Saved reports and CSV files are retained; regular additive migrations still run on normal startup. The launcher tests pass 18 assertions.

The screenshot is defect evidence; it does not prove the app restarted. The user-visible app has not yet been relaunched, and model discovery, Codex response, preview, persistence, or browser UAT remain unverified. No actual inference was sent and no Codex quota was used.

## Rework — SQLite report foreign-key migration failure

The owner then reported `FOREIGN KEY constraint failed` at `DROP TABLE imported_research_reports`. The new lineage/origin migrations batch-rebuilt a parent table that existing quantitative CSV rows reference.

The configured database was inspected read-only before recovery: revision `20261027_0015`, 8 imported reports, 3 quantitative datasets, `integrity_check=ok`, no FK violations, and one empty `_alembic_tmp_imported_research_reports` table left by the failed batch. A verified backup is retained at `data/backups/po_intelligence_hub_pre_fk_migration_fix_20261103_161609.sqlite3`.

The migration environment now runs transactional DDL with FK enforcement disabled only on the Alembic connection, checks constraints before and after the migrations, and restores FK enforcement. Revision `20261102_0016` removes the stale temp table only when empty. The actual configured DB was upgraded to `20261103_0017`; all 18 existing tables' common-column row hashes match the backup, report and CSV counts are unchanged, integrity is `ok`, FK violations are zero, and no temp table remains.

Regression test `tests/test_report_migration_regression.py` plus `tests/test_codex_research.py`: **4/4 PASS**. Launcher tests: **18 assertions PASS**. Backend import passes. A live launcher attempt from this agent environment timed out because local HTTP requests to `127.0.0.1` are denied by its socket permissions; the model catalog, browser runtime and Codex response/save remain unverified. No inference was sent and no Codex quota was used. Current decision remains **TECHNICAL PASS for migration/data preservation; LIVE APP RUNTIME NEEDS OWNER-SIDE VERIFICATION**.
