# Research repeat and comparison — final self-review

**Date:** 2026-11-03  
**Branch:** `feat/ux-recovery-01-research-results`  
**QA project:** `[QA SYNTHETIC] WF11 decision linked metric` (`da80de5b-8990-48ae-b1e3-5f52c36df57b`)  
**Status:** `TECHNICAL PASS / READY_FOR_OWNER` for the verified workflow mechanics; real market research acceptance remains unverified.

## What the PO can do

**Repeat Research:** Start from a saved report or project question. The question and scope are carried forward; choose the new period, copy the prompt into ChatGPT, then import its response. The prompt requests the `PO_RESEARCH_V1` structure. Report import is separate from CSV Analytics.

**Review a change:** Open the old/new report pair, confirm whether a finding is the same finding, then review a measurement only when the observation identity, unit, methodology, GEO, platform, period semantics, duration and source references meet the comparison rules. Tracking shows the dates, values, delta and both source links; it keeps report-supplied values marked unverified and does not change the saved PO decision.

**Record a manual update:** In Tracking, write what the PO observed, its date, and an optional source and note. The entry is labeled PO-entered and stays in history after reload; it does not claim automatic verification.

## Self-review correction

Returning to Tracking could briefly display “no newer report” while the report lookup was still pending. `frontend/src/tracking/TrackingWorkspace.tsx` now shows a loading message until the lookup completes. `frontend/src/tracking/TrackingWorkspace.test.tsx` covers both the pending state and the final no-report state.

The report selector now distinguishes repeated questions using measurement dates or, when these are absent, the import date and report identifier. Percent changes use percentage points for the absolute difference and label relative change separately. A saved PO-confirmed finding is no longer presented as awaiting confirmation.

## Verification evidence

- Isolated browser UAT reused the saved question and US/iOS scope, copied the Research prompt, imported a structured synthetic answer, opened a two-period comparison, saved the PO same-finding confirmation, acknowledged the metric pair, and returned to Tracking.
- Tracking showed `62% → 74%`, `+12 percentage points`, `+19.4% relative`, both measurement dates, both sources and the unverified caveat. The saved PO decision remained unchanged after reload.
- Tracking opened the exact originating report finding. Browser Back returned to the same project Tracking route.
- A dated manual PO observation, source and note remained in Tracking history after reload; it was visibly labeled PO-entered. No online-monitoring claim appeared.
- A deliberately incorrect entity key was rejected during import. The corrected synthetic entity key allowed the report to import. The invalid fixture remains isolated in QA and was not deleted.
- Focused `ReportUpdateComparison` and `TrackingWorkspace` tests: **15/15 passed**.
- Full frontend suite: **28 files / 250 tests passed**.
- `npm run build`: **passed**, including TypeScript. Vite reports a 679.65 kB minified JavaScript chunk advisory.
- No screenshot file was saved. Browser UAT and persistence checks were done in the running isolated local app. The full backend suite was not rerun during this final frontend correction; browser writes and reads exercised the existing import, comparison-review, PO-decision and manual-update APIs.

## Data and product limits

All `62%` and `74%` comparison values and the manual `76%` observation are fabricated QA values. They establish mechanics only and do not support any market or product conclusion. The previous genuine Puzzle 2026 report remains preserved, but a genuine second-period report was unavailable.

The workflow depends on a structured `PO_RESEARCH_V1` response for safe automatic metric comparison. An arbitrary freeform ChatGPT answer can be retained/read but cannot safely produce a normalized numeric delta without structured fields. CSV remains a separate provider-data workflow. PO Hub does not watch the Internet and does not independently verify report sources.

## Product Acceptance

- **PO goal:** Re-run a research question later and understand what changed in one tracked finding.
- **User journey:** Reuse question/scope → choose a period → copy the prompt to ChatGPT → import the new report → compare reports → confirm a finding match → review the source-backed delta in Tracking. Manual path: choose the tracked item → record observation/date/source → reopen the saved entry.
- **Automated work:** Preserve report lineage, show compatible sourced differences, keep the PO decision intact, and retain manual notes as PO-authored records.
- **Expected result:** The PO sees a period-to-period delta with source and uncertainty alongside the related decision, or a dated, clearly attributed manual observation.
- **Remaining friction:** Genuine second-period research and accuracy have not been verified; non-contract ChatGPT formats do not yield safe normalized metrics automatically; no online monitoring or independent source validation.
- **Verification:** Focused 15/15 and full frontend 250/250 tests, TypeScript/Vite build, and isolated desktop browser save/read/reload/navigation UAT as listed above.
- **Decision:** `TECHNICAL PASS / READY_FOR_OWNER` for workflow mechanics. `PRODUCT PASS` for genuine market research is **not claimed**.

## Next task

After Research owner acceptance, continue G3-06 Product Analysis. The saved Subject Profile currently holds PO-authored notes; it still needs an understandable product insight linked to its evidence or marked as a PO hypothesis, a clear unknowns section and a practical next action. Preserve existing profile data and keep report and CSV provenance separate.
