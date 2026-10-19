# UI-01 — Visual Fidelity Fix

## Delivery

- Branch: `feat/ux-recovery-01-research-results`
- Implementation commit: `bb6c2492158e5dd2aacf3e54550f78853500ca25`
- Product scope: approved qualitative V1 only. No backend, database, CSV, or V2 changes.

## What changed

- Added a reusable, dependency-free SVG icon set for workspace navigation, Results sections, finding types, evidence, decisions, and actions. Finding icons use only exact supported type names; unknown types use a neutral icon.
- Reworked finding cards with stronger titles, compact descriptions, explicit related entities, visible reference count and unverified status, expandable source links, PO implication, and clear insight navigation.
- Replaced the text-and-arrow Research Map with three aligned node columns. Finding-to-entity edges render only for the report’s `related_entities` keys. PO implication nodes render only when the finding supplies an implication. Missing relationships use compact “not supplied” states.
- Added focused assertions for semantic icons, evidence count, and explicit map connectors. Existing assessment, note, benchmark, and source behavior is unchanged.

## Mockup comparison

**Matched:** compact report title and scope, side-by-side conclusion and takeaways, two-column findings, secondary snapshot/gaps/PO rail, semantic icon containers, and three-column relationship map.

**Differences:** the app retains its current workspace sidebar and Results tabs. The approved reference uses a wider 1536px canvas; the available in-app browser measured 1076 × 828 CSS pixels, so cards wrap more and the viewport shows less content. The current report has qualitative data only, so no charts or quantitative widgets appear.

**Remaining limitation:** exact 1440 × 900 and 390px screenshots were unavailable in this browser session. Those viewport checks are **NOT VERIFIED**. At the available 1076 × 828 viewport, the page had no document-level horizontal overflow; the Results tabs remain horizontally scrollable when their labels do not fit.

## Browser screenshots

All screenshots below are from the running local app with an existing imported DIY Game report, served against the isolated UAT SQLite copy. They are not generated mockups.

- Overview first viewport: [overview-first-viewport.png](screenshots/ui-01-visual-fidelity/overview-first-viewport.png)
- Findings with snapshot, gaps and PO next steps: [findings.png](screenshots/ui-01-visual-fidelity/findings.png)
- Research Map: [research-map.png](screenshots/ui-01-visual-fidelity/research-map.png)
- Selected insight detail and source context: [insight-detail.png](screenshots/ui-01-visual-fidelity/insight-detail.png)

## Verification

- Frontend tests: **36 passed** across 3 test files.
- TypeScript and production build: **passed** (`npm run build`).
- Browser check: opened an existing qualitative report, inspected Overview, opened the Insights tab, confirmed source references and uncertainty are visible, and inspected the Research Map. No report edits were made during this check.
- Browser viewport measured: 1076 × 828 CSS pixels; document horizontal overflow: **false**.
- 1440 × 900 and 390px responsive screenshot checks: **NOT VERIFIED** because the available in-app browser did not expose viewport resizing.
- Backend tests: not rerun; no backend files or contracts changed.
- Production SQLite was not opened for this UAT; the app used `data/.uat-ux-recovery-01`.

## Files changed

- `frontend/src/ui/ResultsIcon.tsx`
- `frontend/src/main.tsx`
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/reports/ResearchIntake.test.tsx`
- `frontend/src/style.css`
- `.bangiao/screenshots/ui-01-visual-fidelity/*`

Existing user changes in `scripts/setup.ps1` and `.devcrew/` were left untouched and excluded from the implementation commit.

## Product review

**NEED OWNER REVIEW.** The visual direction now follows the approved V1 structure more closely and the Research Map represents only supplied relationships. Exact desktop and mobile viewport fidelity remains unverified.
