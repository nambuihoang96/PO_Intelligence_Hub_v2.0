# G1 UI/UX Rework — Feedback Round 2

**Date:** 2026-10-28  
**Branch:** `feat/ux-recovery-01-research-results`  
**Starting HEAD:** `649dc1e97d2ffcb463af1950633d585a42b67062`  
**Status:** `DEV_IMPLEMENTED / BROWSER UAT PASS FOR AVAILABLE QA STATE / VISUAL ACCEPTANCE PENDING` — Owner review required; not Product Accepted.

## Owner feedback and impact

The Product Owner rejected G1 UI/UX because Research Home and Project Home looked inconsistent, Peachy Studio was applied by route-specific theme overrides, Project Home still felt like recolored legacy cards, and Report Reader did not follow the approved research-reading structure. Functional browser success was explicitly not considered visual acceptance.

Classification: **UI/UX rework with shared-shell correction**. Affected existing tasks: **G1-01, G1-03, G1-02**, in that priority order. G2-02 behavior remains in place; this round does not alter APIs, database schema, report data, or navigation destinations. Dependent broad visual rollout remains paused pending owner review.

## Changes

- Replaced route-specific Project/Report shell styling with one Peachy Studio token set and shared sidebar, top bar, content canvas, focus, and mobile-navigation treatment.
- Removed the old `body:has(...)` theme overrides that made the Research shell visually diverge. Kept only screen-scoped layout selectors where needed.
- Reorganized Project Home as a project dashboard: three primary workflow actions, saved reports and activity as the main area, and collections, subjects, data, and decisions as supporting context.
- Refined Report Reader into a clearer reading flow with project context, report header/data status, results navigation, a readable full-report column, and table of contents that stacks on mobile. Existing text-only/needs-structuring state remains truthful.
- Unified the remaining mobile Research shell colors with Peachy tokens without changing its behavior.

## Files changed

- `frontend/src/peachyStudio.css`
- `frontend/src/research/ProjectHome.css`
- `frontend/src/style.css`
- `docs/RECOVERY_BOARD.md`

No backend, schema, migration, SQLite, or report-content changes.

## Visual comparison against the approved Peachy references

References reviewed from `docs/design/approved/peachy/`:

- `Pastel Vietnamese PO Intelligence Dashboard.png`
- `PO Intelligence Hub Storyboard.png`
- `PO Hub Research Dashboard Flowchart.png`

**Matched:** warm light canvas, shared sidebar and compact topbar, consistent coral/peach accents, readable dark headings, calm surfaces, restrained outlines/shadows, one Project title, three distinct primary workflow actions, saved reports separated from secondary Project context, and a report reading hierarchy with Project context/status, result tabs and a readable full-report area. All captured product copy remains Vietnamese.

**Remaining differences:** the references include a mascot/logo treatment, global search/profile controls, denser dashboard composition and populated conclusion/insight/evidence panels. Those are not present in these routes and were not invented as filler. Research Home is the existing Project list, so its one-project QA state naturally leaves unused space; changing that workflow is outside this visual rework. The isolated report is synthetic and text-only, so populated structured-report fidelity is **NOT VERIFIED**. The screenshots demonstrate shared shell and layout direction, not pixel-level matching.

### Side-by-side evidence

The left column points to the approved local reference; the right column is a capture from the running app. The reference files remain in the supplied `docs/design/approved/peachy/` folder and are not copied into these implementation commits.

<table>
  <tr><th>Approved Peachy dashboard</th><th>Actual Project Home — 1440×900</th></tr>
  <tr>
    <td><a href="../docs/design/approved/peachy/Pastel Vietnamese PO Intelligence Dashboard.png">Open approved reference</a></td>
    <td><a href="screenshots/g1-03-peachy/round-2/project-home-desktop-1440x900.png">Open actual capture</a></td>
  </tr>
  <tr><th>Approved storyboard</th><th>Actual Report Reader — 1440×900</th></tr>
  <tr>
    <td><a href="../docs/design/approved/peachy/PO Intelligence Hub Storyboard.png">Open approved reference</a></td>
    <td><a href="screenshots/g1-03-peachy/round-2/report-reader-desktop-1440x900.png">Open actual capture</a></td>
  </tr>
</table>

## Screenshots

These are fresh real captures from the running isolated QA application, not generated mockups. Desktop captures use a 1440×900 browser viewport; mobile captures use a device emulation with CSS viewport 390×844. The project and report pages use isolated QA project `950d908b-ad16-4719-9955-859d820a9101` and synthetic text-only report `fb238ad0-53b7-4213-bfaa-143244780dd4`.

| Screen | Desktop 1440×900 | Mobile 390×844 |
|---|---|---|
| Research Home | [research-home-desktop-1440x900.png](screenshots/g1-03-peachy/round-2/research-home-desktop-1440x900.png) | [research-home-mobile-390x844.png](screenshots/g1-03-peachy/round-2/research-home-mobile-390x844.png) |
| Project Home | [project-home-desktop-1440x900.png](screenshots/g1-03-peachy/round-2/project-home-desktop-1440x900.png) | [project-home-mobile-390x844.png](screenshots/g1-03-peachy/round-2/project-home-mobile-390x844.png) |
| Report Reader | [report-reader-desktop-1440x900.png](screenshots/g1-03-peachy/round-2/report-reader-desktop-1440x900.png) | [report-reader-mobile-390x844.png](screenshots/g1-03-peachy/round-2/report-reader-mobile-390x844.png) |

Earlier 1265×712 captures and mobile images from the previous browser session are retained as historical artifacts but are not used as current evidence.

## Verification

- Frontend tests: **26 files / 224 tests PASS** (single worker).
- TypeScript: **PASS** (`npm run typecheck`).
- Production build: **PASS** (`npm run build`); Vite retains the existing ~618 kB main-chunk advisory.
- `git diff --check`: **PASS** for the scoped implementation and handoff files.
- Browser workflow on isolated QA app (`http://127.0.0.1:15310`, API `15311`, QA data under `.peachy-g1-qa-20261028`): **Project Home → report → same Project Home PASS**, same report ID and project context. Report shows the honest text-only/needs-structuring state; raw JSON is not the primary view.
- Mobile navigation: at actual 390×844 viewport the menu opened; pressing Escape closed it and returned focus to the toggle. Project Home retained all three main actions.
- Responsive measurements: desktop viewport 1440×900; mobile `innerWidth=390`, document and body scroll width 390 for Research Home, Project Home and Report Reader. No page-level horizontal overflow; the report page contains a visually hidden file input, excluded from that check.
- Exact 1440×900 and 390×844 screenshots were saved above. Research Home, Project Home and Report Reader were visually inspected after capture.
- Data caveat: report `fb238ad0-53b7-4213-bfaa-143244780dd4` is labeled `[QA]` and contains synthetic text-only test content, not genuine research. No structured-report visual UAT was possible with this QA report.
- Backend tests were not rerun because this round changes only frontend CSS and presentation; backend/API and database were not changed.

## Product Acceptance

- **PO goal:** make Research, Project Home, and Report Reader feel like one coherent Peachy Studio product and make saved research easy to continue.
- **User journey:** open a Project → choose one of three primary actions or reopen saved work → read the report → return to its Project.
- **Automated work:** shared shell styling and responsive layout preserve current routes and project/report identity.
- **Expected result:** consistent shell, clear Project actions and a more readable Report view without invented research content.
- **Remaining friction:** the approved mockup composition is not pixel-matched, and populated structured-report visual review has not occurred because QA contains only a synthetic text-only report.
- **Verification:** 224 frontend tests, TypeScript, production build, exact desktop/mobile screenshots and isolated Project → Report → Project browser flow; see limits above.
- **Decision:** `NEEDS FIX / OWNER VISUAL REVIEW PENDING`.

## Commits

- Implementation: `442567158211944ea4e1e1cb2ee0ab5549fe250f` (`fix(g1): unify Peachy shell and mobile readability`).
- Recovery Board, this handoff and six current viewport screenshots are recorded in a separate documentation/evidence commit.

