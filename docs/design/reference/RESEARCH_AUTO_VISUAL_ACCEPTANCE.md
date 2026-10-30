# Research Auto-Adaptive — visual acceptance gate

**Implementation UAT (run by Codex):** 246 frontend tests, 181 backend tests,
TypeScript/build PASS on commit `5e23dc8`; browser flows functional PASS.
**Visual parity:** NOT VERIFIED until real screenshot artifacts are captured and
compared. This document is a QA reference, **not** Product Acceptance.

## Reference now version-controlled

**Exact approved interactive prototype:**

`docs/design/reference/POHub_Auto_Adaptive_Research_Demo.html`

Open this standalone HTML with a browser. It has no external asset or paid API
dependency. Its sample selector tests several QUESTIONS; it is NOT a user-side
metric picker.

The integrated application is expected to use the same hierarchy, not
necessarily the prototype's left-side QA selector:

1. Hero with research question, executive conclusion and a distinguishable PO
   takeaway. Do not put data import/form UI above the report.
2. High-signal numbers as prominent cards **only when sourced observations
   exist and pass relevant validation**.
3. A well-labeled eligible comparison or timeline, close to the KPI cards.
   Include metric, unit, period, GEO/platform, provider, verification state.
4. A short visible reason why the chart group is valid, followed by caveats.
5. Findings and direct Evidence actions, and route to PO Decision/Tracking.
6. Additional measurements and technical provenance in disclosure controls.
7. Qualitative fallback: summary/findings/gaps/action, **no empty KPI/chart**.

Use the same logic for Puzzle IAP, Rewarded eCPM, retention cohorts and any
previously unknown metric. No hard-coded sector, metric name, chart picker or
fabricated numbers.

**Known possible visual gap:** the integrated chart component currently
renders some comparison groups as horizontal bars, whereas the prototype uses
vertical columns. This is *not automatically a functional failure*. Review
whether the hierarchy, legibility and source association are comparable and
record a specific P1 visual issue if a change is needed.

## Capture screenshots of the running QA app

The earlier browser tool could not save image files. Use installed Chrome or
Edge from Windows PowerShell in the **QA worktree** instead, while ports 15331
and 15332 are still running:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/capture_research_screenshots.ps1 -ReportUrl "http://127.0.0.1:15331/reports/<real-qa-report-id>"
```

Replace the placeholder with the actual Puzzle QA report ID. Capture
**desktop 1440×900** and **responsive 390×844** screenshots from the same
report, then repeat with the separate Rewarded-eCPM fixture if desired. The
script refuses non-local URLs, writes only PNGs under
`.auto-presentation-qa/screenshots/`, and never modifies report data.
Review the generated PNGs manually for async data loading, clipped cards, the
presence of a real chart, wrong chart grouping, and duplicate sources.

A screenshot at 390px is a **responsive viewport screenshot**, not an
emulation of mobile device/browser behaviour; do not overclaim mobile UAT.

If Chrome/Edge headless capture fails, record the actual error and use any
locally available Playwright/DevTools screenshot capability. Do not claim
screenshot PASS from the previous browser's manual viewport checks alone.

## PO acceptance gates

- Actual **Puzzle 2026 imported report**, not the Golden Demo, is shown in
  screenshot with suitable KPI/chart or explicit reasons where source metrics
  cannot be compared.
- Synthetic Rewarded eCPM example clearly labeled QA; one comparable metric
  across GEO with eCPM Banner and show rate excluded from that visual.
- Different retention cohort metrics not falsely treated as one comparable
  time series.
- Qualitative-only input produces a readable report without decorative
  empty zero cards or chart placeholders.
- No page-level horizontal overflow at 390px; benchmark tables may scroll
  inside their container.
- Comparison vs exact reference archived: **Reference / Actual desktop /
  Actual responsive / Deviations / P0-P1 / Proposed fixes**.
- Preserve decisions and data; no merge/deploy or production SQLite updates.

When functional QA is already PASS, fix only observed P0/P1 issues. No new
features, no additional Research Library redesign, and no Data Analysis work.
