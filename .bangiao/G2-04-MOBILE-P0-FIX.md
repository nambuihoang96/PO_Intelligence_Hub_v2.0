# G2-04 — Genuine Puzzle Report Mobile P0 Fix

**Branch:** `feat/research-auto-presentation-v1`  
**Starting HEAD:** `57d7452997c1dab4df088459332f131047aef4cf`  
**Status:** Technical/browser gate PASS; Product Owner review pending.

## Root cause

The genuine Puzzle 2026 report (`71a70e67-7f7a-4340-b41b-df2054790c64`) exposed three responsive defects in Chrome DevTools:

1. `.quant-data-details` used `display: inline-flex`. Its summary and expanded observation list became horizontal flex siblings; at 390px the observation list was squeezed to about 42px while its content remained wider.
2. At 760px the report page's app shell was still a row. The responsive sidebar was assigned 100% width but the shell did not stack, leaving the main pane at zero width and pushing the report out of view.
3. Between 761px and 900px the report title/actions and two-column reading layout stayed side by side at unusable widths, causing narrow title wrapping and a clipped support rail.

## Fix

- `frontend/src/style.css`: changed the quantitative disclosure to normal block flow, made its open state occupy the available flex row, and constrained the expanded panel with `box-sizing` and `min-width: 0`.
- `frontend/src/peachyStudio.css`: stack the report shell at ≤760px; stack the journey/title actions and reading layout at 761–900px.
- No global `overflow-x: hidden` was added. No backend, schema, data, chart, or workflow behavior changed.
- `frontend/src/reports/ResearchIntake.test.tsx`: corrected an assertion that expected PO actions for all findings even though the Overview intentionally previews a subset; it now verifies that the disclosed finding action is reachable.

## Genuine-report browser verification

Tested the actual QA app at `http://127.0.0.1:15331` against the genuine Puzzle 2026 report, using the isolated QA SQLite database. Production SQLite was not used or modified.

| Viewport | Result | Checks |
|---|---|---|
| 390×844 | PASS | Full report title, KPI cards/chart, section navigation; expanded observation cards fit their container; Findings, Entities, Benchmark, Report Notes and Evidence tabs accessible; no document-level horizontal overflow. |
| 375×812 | PASS | Title and results remain readable; KPI/chart present; no document overflow. |
| 430×932 | PASS | Title and results remain readable; KPI/chart present; no document overflow. |
| 760×844 | PASS | Sidebar and report content stack; main pane has usable width. |
| 761×844 | PASS | Title/actions and report reading area stack; no squeezed title/support rail. |
| 1440×900 | PASS | Desktop layout, title, KPI/chart and reading navigation remain intact. |

At 390px the section tabs form an internally horizontally scrollable navigation row (`scrollWidth` 856px, client width about 356px); this is intentional and does not widen the page. The expanded quantitative list uses the full available width (about 304px for its observation cards) and all 11 source observations remain reachable. Five observations remain comparison-ready in two compatible groups; six download observations remain uncharted because the measurement methodology is missing. No values were changed or marked verified.

## Screenshots

All are real captures from the running application and genuine QA report:

- Before, mobile overview: `.bangiao/screenshots/g2-04-mobile-p0-fix/before-puzzle-390x844.png`
- After, mobile overview: `.bangiao/screenshots/g2-04-mobile-p0-fix/after-puzzle-390x844.png`
- After, expanded observations: `.bangiao/screenshots/g2-04-mobile-p0-fix/after-puzzle-quantitative-panel-390x844.png`
- After, additional mobile sizes: `after-puzzle-375x812.png`, `after-puzzle-430x932.png`
- After, tablet breakpoint: `after-breakpoint-760x844.png`, `after-breakpoint-761x844.png`
- Before/after desktop: `before-puzzle-1440x900.png`, `after-puzzle-1440x900.png`

The overview first viewport itself looks the same before/after because the defect was in the expanded quantitative disclosure and narrow shell/layout breakpoints. The expanded-panel and breakpoint captures show the corrected states; desktop capture confirms no regression.

## Verification

- Frontend tests: **250/250 PASS** (29 test files).
- TypeScript: **PASS**.
- Production build: **PASS**; Vite reports the existing large JavaScript chunk advisory.
- Backend: not rerun for this CSS/test-only change; the latest prior full backend result is **177/177 PASS**. No backend files changed.
- Report content and QA database were not mutated by visual verification.

## CSS ownership and Git safety

- Before this task, the local working copy of `frontend/src/peachyStudio.css` matched local HEAD. The fetched remote `FETCH_HEAD` (`c42b301d0b8ab7014bef8da6d2fc3cb2f68a41d2`) is an ancestor/older point than the local branch HEAD; local HEAD already contains earlier styling changes absent from that remote point.
- The responsive rules described here are this task's local diff and are committed separately. Untracked `.auto-presentation-qa/` and `frontend/.auto-presentation-qa/` remain excluded, including QA databases and scratch scripts. No `scripts/setup.ps1`, production data, or unrelated files are staged.

## Status reconciliation

| State class | Result |
|---|---|
| Functional QA | PASS on the genuine report in the preceding G2-04 workflow run; this task did not change functional/data code. |
| Visual/browser | G2-04 mobile technical gate PASS at the listed viewports. Product Owner visual review remains pending; no Product Pass is claimed. G1-01/G1-03 remain REWORK; G1-02 remains owner review pending. G2-01/02/03 retain their existing scoped technical evidence only. |
| Missing capability | Research Extended capabilities are not implemented by this fix. G3-07/G4 retain their existing NOT STARTED/BLOCKED statuses. |

### Scope proposal for Product Owner decision

| Candidate milestone | Capabilities |
|---|---|
| Research Core v1 | Project → ChatGPT Research → Report → Findings/Evidence → Benchmark → PO Decision → Reopen |
| Research Extended | Subject Profile, Trend Update, Image Evidence, Monthly Tracking, Longitudinal History, Automation |

This is a classification proposal only; it does not alter Recovery Board scope or acceptance criteria.

## Product Acceptance

- **PO goal:** Read and use the genuine Puzzle research report on a mobile device without losing access to its title, navigation, evidence or results.
- **User journey:** Open the genuine report → read Overview/KPI/chart → navigate Findings, Entities, Evidence, Benchmark and Notes → expand quantitative observations.
- **Automated work:** Responsive layout now stacks the report shell and narrow reading layout; the expanded observation list occupies the available row width.
- **Expected result:** The report is readable and navigable at tested phone/tablet widths; the desktop layout remains usable.
- **Remaining friction:** Section tabs require horizontal scrolling inside their own row on mobile. Product Owner visual approval is still pending. Six download observations cannot be charted without methodology.
- **Verification:** Real Chrome screenshots and viewport checks at 390×844, 375×812, 430×932, 760×844, 761×844 and 1440×900; 250 frontend tests, TypeScript and build passed.
- **Decision:** **TECHNICAL PASS for the G2-04 mobile clipping fix; OWNER REVIEW PENDING. Not Product Accepted.**

**Implementation commit:** `eb61430` (`fix: resolve genuine report mobile clipping`). Documentation/board update follows separately; all commits remain local.
