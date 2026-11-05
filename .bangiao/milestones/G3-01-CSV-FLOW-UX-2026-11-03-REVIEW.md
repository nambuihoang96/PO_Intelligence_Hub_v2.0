# G3-01 Milestone Review — Project Home and CSV Flow Clarity

**Date:** 2026-11-03  
**Status:** `TECHNICAL PASS / DESKTOP VISUAL CHECK / OWNER REVIEW PENDING`  
**QA project:** `[QA ONLY] CSV Auto Analysis Valid Periods` (`fcfedfeb-0cb8-455c-aa85-d45d0e6694b6`)  
**Production data:** untouched; screenshots came from the isolated local QA app.

## PO feedback

The PO said the saved information and CSV list looked poor, asked where the result appears after requesting a comparison, whether ChatGPT research fills Overview, and whether the CSV import section needs to occupy so much of the page.

## Implemented result

- Project Home presents the newest CSV as a compact, full-width card. Older CSV files are behind a short disclosure; technical readiness labels no longer dominate the list. When CSV is the only saved group, it uses the full content width.
- The compare page initially shows only the two file selectors. After both files are selected, the metric/scope/period controls appear. Clicking **Tạo kết quả so sánh** calculates locally in PO Hub; a temporary preview renders below and the page scrolls to it. This preview is not saved as a separate report; the PO can recompute it from the two saved CSVs. Adding a new CSV is collapsed below the comparison form.
- The ChatGPT prompt is copied when generated, the raw text is collapsed, and only one primary **Tạo yêu cầu cho ChatGPT** action remains. The next actions are **Mở ChatGPT** and **Nhập kết quả ChatGPT**.
- After saving ChatGPT's answer, the report is listed on Project Home. Its own Overview shows structured findings if the importer recognizes the answer. The original answer remains accessible in **Đọc báo cáo** when structure is not recognized. ChatGPT does not sync directly; the PO pastes and saves the answer.

## Verification evidence

- Final focused frontend tests: `DataFirstWorkspace`, `ProjectHome`, `QuantitativeDatasetImport`, and `QuantitativePeriodComparison`: **4 files / 45 tests PASS**.
- Full frontend suite: **29 files / 264 tests PASS** after removing the duplicate action and before the final copy/layout text adjustment. The final adjustment was covered by the focused tests and final build.
- Final `npm run build` (includes `tsc --noEmit`): **PASS**. Vite retains a bundle-size advisory at **709.94 kB** for the JavaScript output.
- Final scoped `git diff --check`: **PASS**, with the existing line-ending warning.
- Actual local app screenshots captured and visually reviewed at 1440×900:
  - `.bangiao/screenshots/g3-01/feedback-round-3/project-home-1440x900-after.png`
  - `.bangiao/screenshots/g3-01/feedback-round-3/period-comparison-1440x900-final.png`
- The Project Home image shows the full-width latest-CSV card and compact empty report panel. The comparison image shows only two file selectors before selection and a collapsed importer. No browser screenshot of the rendered period result was captured. Component tests verify the compare action calls the comparison API and renders the result.
- QA figures remain synthetic. No mobile review, genuine multi-period CSV verification, or owner acceptance is claimed.

## Product Acceptance

- **PO goal:** Find saved CSVs quickly, understand how period comparison produces an output, and know where a ChatGPT research answer appears.
- **User journey:** Open Project → select two CSV periods → create and review the on-page result; or create a prompt → run it in ChatGPT → paste/save the answer → open its report Overview or original text.
- **Automated work:** PO Hub computes compatible CSV deltas and preserves provenance; it lists imported reports. It does not sync with ChatGPT or invent findings from an unrecognized format.
- **Expected result:** One primary prompt action, a compact import section, a comparison result in the same PO Hub page, and an explicit report destination.
- **Remaining friction:** The PO must choose both CSV files. The compare preview is not saved and must be recomputed after leaving/reloading the page. ChatGPT output must be pasted and saved. Unrecognized formats may not populate structured Overview. Selected-pair browser output and real large multi-period data remain unverified.
- **Verification:** Tests, final build, and desktop screenshots described above.
- **Decision:** `TECHNICAL PASS / DESKTOP VISUAL CHECK / OWNER REVIEW PENDING`. Not `PRODUCT PASS`.

## Files changed in this slice

- `frontend/src/research/ProjectHome.tsx` and `ProjectHome.test.tsx`
- `frontend/src/research/DataFirstWorkspace.tsx` and `DataFirstWorkspace.test.tsx`
- `frontend/src/reports/QuantitativeDatasetImport.tsx` and its test
- `frontend/src/reports/QuantitativePeriodComparison.tsx` and its test
- `frontend/src/peachyStudio.css`
- `frontend/src/style.css`
- `.bangiao/G3-01-CSV-ANALYTICS.md`
- `docs/RECOVERY_BOARD.md`
