# G1-02 — Research Input and Report Reader v4 Review

**Date:** 2026-11-03  
**Status:** `DEV_DONE / READY_FOR_OWNER` for this desktop slice  
**Decision:** Not Product Pass for the full v4 wireframe or A01–A29 matrix.

## What changed

- Research input now has a clear 3-step path: question → result → read report.
- Copying a ChatGPT prompt opens the final-answer paste step and says to use ChatGPT once.
- The report-save panel has one distinct heading, a clear independent-verification label, and a collapsed content preview.
- If Codex is enabled without a selected model, one primary ChatGPT-copy action remains available. Enter does not issue an invalid Codex request.
- The report reader has six primary v4 sections. PO notes are secondary. A finding's follow-up links back to that exact report and finding.
- CSV summary language now says “product–metric pairs” and “measurements”, matching how the counts are calculated.

## Product Acceptance

- **PO goal:** Enter research once, know where its final answer goes, then read the saved report without losing the finding context.
- **User journey:** Question → copy one prompt or choose a Codex model → paste/review once → save → read the six-part report → follow a finding → return to that finding.
- **Automated work:** Preserve the report question and project, show import checks, keep long raw content collapsed, preserve finding/report identity, and calculate compatible CSV changes from saved source data.
- **Expected result:** One obvious next action, understandable verification/source labels, and a direct way back to the report finding.
- **Remaining friction:** No real ChatGPT or Codex response was requested in this review to conserve quota. Full v4 A01–A29 acceptance remains open. Owner review is pending.
- **Verification:** Frontend **31 files / 272 tests PASS**; focused intake/report/CSV tests **59/59 PASS**; TypeScript and production build PASS (735.74 kB chunk-size advisory). Live app at `127.0.0.1:5173` verified the one-copy ChatGPT transition without an AI call, Codex-unselected fallback, six report tabs, exact finding follow-up/back link, and two-period synthetic CSV changes. Screenshots were captured and visually reviewed inline but not saved as PNG artifacts. No product report was created during browser QA.
- **Decision:** `READY_FOR_OWNER` for this bounded desktop slice. Not Product Pass for all v4 workflows.

## Test data

The `[QA ONLY] CSV two-period change demo` project contains `2026-09-qa-only.csv` and `2026-10-qa-only.csv`. Both files are synthetic, contain no real market measurements, and are clearly identified as QA data in the app. No AI inference or external ChatGPT request was made.

## Owner review

Open the local app's project CSV view:

`http://127.0.0.1:5173/research?projectId=57404b49-07ab-42ef-8cdc-bec2cc1bba3d&view=data`

To read the saved report used for the reader smoke check:

`http://127.0.0.1:5173/reports/0ef31564-c0a7-4459-8358-ae353dcfacdd`

No merge, release, or deployment was performed.
