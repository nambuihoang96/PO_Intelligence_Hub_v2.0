# G3-01 Milestone Review — Explicit CSV Analysis Modes

**Date:** 2026-11-03  
**Status:** `DEV_DONE / TECHNICAL PASS / BROWSER UAT NOT VERIFIED / OWNER REVIEW PENDING`  
**Scope:** Desktop Research → Data only. The complete wireframe v4 rollout remains open.

## PO feedback

The PO could not tell which two CSV files were being compared, said the changes looked the same, and asked for separate single-file analysis and two-period analysis with insights/actions. He also stated that wireframe v4 was still not visible in the app.

## Implemented in the app

- The Research → Data route now has two explicit modes: **Phân tích một tệp** and **So sánh hai kỳ**.
- One-file mode is the default and continues to show deterministic within-file signals even when other CSVs exist in the project. It names the file, shows the eligible observation count, describes the highest/lowest values and their observed range, and suggests checking the two source rows before further research.
- Two-period mode shows **Tệp kỳ trước** and **Tệp kỳ hiện tại** selectors. The exact pair is printed beside the controls, and the PO must click **Phân tích cặp tệp này** before a preview request runs. The app does not silently replace the selected files with a “nearest” baseline.
- Comparison remains blocked when the same file is selected or when metric, measurement scope, method, unit, identity or period cannot be compared safely.
- The table's file selector now says **Tệp đang mở trong bảng**, distinguishing it from the separate comparison pair. The redundant CSV comparison card linking to another screen was removed.
- The preview reports numeric deltas and a cautious PO follow-up. It does not infer causes, good/bad market performance, or independent verification.
- No Codex/ChatGPT request was made. No database schema or production data was changed.

## Verification evidence

- `CsvAutoAnalysis.test.tsx` and `DataFirstWorkspace.test.tsx`: **2 files / 22 tests PASS**, including a regression proving that changing the baseline changes the exact dataset ID sent to the comparison API.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**; the existing Vite large-chunk advisory reports 738.93 kB JavaScript.
- Scoped `git diff --check`: **PASS**, with a line-ending advisory for `peachyStudio.css`.
- A cloned synthetic QA database was prepared under `.csv-auto-analysis-review-20261103/data`; the actual production SQLite database was not opened.
- CUA could not load the local `127.0.0.1:5173` page (`ERR_CONNECTION_TIMED_OUT`). Therefore no live browser UAT or screenshot is claimed for this revision.

## Product Acceptance

- **PO goal:** Read one CSV by itself, then compare two chosen periods and understand the resulting changes.
- **User journey:** Open Research → Data → read the one-file signals, or switch to two-period comparison → choose both source files → click **Phân tích cặp tệp này** → review the result and source caveat.
- **Automated work:** Calculate only deterministic changes from exact compatible observations and keep both source files identified in the result.
- **Expected result:** The PO sees the actual baseline and current filenames before and after calculation, plus highlighted signals and a grounded follow-up.
- **Remaining friction:** A real running-browser review is still needed; genuine large provider CSVs are not covered by this test fixture; the complete v4 cross-screen design has not been implemented or accepted.
- **Verification:** 21 focused component/workspace tests, TypeScript check and production build passed. Browser UAT did not run successfully.
- **Decision:** `TECHNICAL PASS / BROWSER UAT NOT VERIFIED / OWNER REVIEW PENDING`; not `PRODUCT PASS`.

## Next

Keep G1-03 open for the complete wireframe v4 rollout. Review the approved workflow's A01–A29 criteria against the actual app and capture desktop screenshots from the running app before claiming full implementation.
