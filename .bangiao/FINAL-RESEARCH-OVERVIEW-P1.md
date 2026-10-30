# Final Research Overview P1 Fix

**Branch:** `feat/research-auto-presentation-v1`
**Starting commit:** `080e7da840526dbd4d358c193136f4e8b9e8afd2`
**Product acceptance:** **PENDING OWNER REVIEW**

## Changes

- Compacted the Project journey and report header and reduced Overview spacing so the report scope and source-provided conclusion stay prominent.
- Kept the executive summary at its existing three-line preview with an accessible expand/collapse control. The Overview now shows two takeaways by default; all supplied takeaways remain available.
- Limited Overview to two finding cards. It honors valid report-supplied `highlighted_finding_keys`, ignores invalid keys, preserves stored order for the remaining items, and provides one clear action to open all findings. Each preview retains its evidence status.
- KPI labels now use GEO when one subject is shown across several GEOs, and use the supplied metric definition when several different metrics are shown. This keeps eCPM-by-GEO legible and D1/D7/D30 distinct without changing measurements or chart eligibility.
- Compact KPI tiles on desktop make the start of the compatible chart visible sooner. No content is hidden or removed.

## Browser UAT

QA app: `http://127.0.0.1:15331` with backend `http://127.0.0.1:15332/health`; the backend reported `ok` and `po_research_v1`. The app used the isolated Auto-Presentation QA SQLite database. Production SQLite was not accessed.

| Scenario | Result |
|---|---|
| Genuine Puzzle 2026: title/scope, conclusion, 3 eligible KPIs and start of chart in 1440×900 first viewport | PASS |
| Puzzle findings preview | PASS — 2 of 6, evidence status retained, one “Xem toàn bộ 6 phát hiện” action |
| Expand summary and all takeaways | PASS — summary expands; all 6 takeaways become visible |
| Open all findings from Overview | PASS — Findings tab opens with all 6 |
| Puzzle responsive at 390×844 | PASS — `innerWidth`, document width and body width are all 390; no page horizontal overflow |
| eCPM by GEO | PASS — United States, Vietnam and Japan labels; chart remains “Rewarded ad eCPM” |
| Retention D1/D7/D30 | PASS — each supplied metric remains individually named; no combined chart |
| Qualitative-only QA report | PASS for no fabricated KPI/chart; Findings panel is present. This QA fixture supplies zero findings, so a real qualitative finding card was not available for browser verification. |

The eCPM and qualitative screenshots are explicitly labeled QA fixtures, not research results. No data was inferred from them.

## Verification

- Focused frontend tests: **14 passed** across 3 files (`overviewFindings`, `autoPresentation`, `AutoResearchInsights`).
- TypeScript: **PASS**.
- Production build: **PASS**, with the existing advisory that the main JS chunk is over 500 kB.
- Backend tests were not rerun: no backend, API or database code changed.
- Browser interaction smoke ran on the live QA app after the final UI changes. The original report data and persisted records were not changed.

## Screenshots

All images are captures from the running QA application except the comparison panel’s approved prototype reference. The comparison explicitly labels the reference artwork as design guidance; its sample data is not used by the product.

- [Puzzle Overview — 1440×900](screenshots/final-research-overview-p1/puzzle-desktop-1440x900.png)
- [Puzzle Overview — 390×844](screenshots/final-research-overview-p1/puzzle-mobile-390x844.png)
- [Puzzle findings preview — 1440×900](screenshots/final-research-overview-p1/puzzle-findings-preview-1440.png)
- [eCPM by GEO — 1440×900 (QA fixture)](screenshots/final-research-overview-p1/ecpm-desktop-1440x900.png)
- [Qualitative-only — 1440×900 (QA fixture)](screenshots/final-research-overview-p1/qualitative-desktop-1440x900.png)
- [Reference | before | after comparison](screenshots/final-research-overview-p1/overview-comparison.png)

## Product Acceptance

- **PO goal:** Understand the report’s scope and conclusion and see useful source-backed results immediately when opening it.
- **User journey:** Open report → read compact conclusion and takeaways → review eligible KPIs/chart → preview findings or open all findings.
- **Automated work:** Valid presentation-plan finding keys are prioritized; invalid keys are ignored; KPI labels distinguish GEOs and metric definitions; all original summary, takeaways, findings, sources and measurements remain accessible.
- **Expected result:** Puzzle 2026 first viewport contains report title/scope, conclusion, three eligible KPIs and the beginning of its compatible chart. Qualitative-only state does not fabricate numeric content.
- **Remaining friction:** Qualitative-only browser fixture has no findings, so qualitative finding-card placement is covered by the shared Overview rendering path and ordering tests but not by a real QA record with findings. Main bundle-size advisory remains.
- **Verification:** Focused tests, TypeScript, production build, Chrome QA screenshots and browser interactions listed above.
- **Decision:** **TECHNICAL PASS / PRODUCT ACCEPTANCE PENDING OWNER REVIEW**.

**Implementation commit:** `3131370d824c8911efc85e720035134e80680f0c`.
