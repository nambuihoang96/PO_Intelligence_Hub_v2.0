# UX-IA-01 — Unified Research Product Experience

## Delivery

- Branch: `feat/ux-recovery-01-research-results`
- Starting HEAD: `5f57e848b8b9ae6ed5ed012664a6a8f6e55a4aa2`
- Implementation commit: `0f371d7` (`feat: unify research project experience`)
- Scope: frontend information architecture and presentation only; no backend, API, schema, migration, or production database changes.

## Current information architecture

The primary navigation has exactly three areas: **Research**, **Reports**, and **Tracking**. A project is the shared context for its research question, scope, datasets, imported reports, comparisons, and saved PO decisions. The project header exposes the same **Research → Report → Tracking** journey from project-scoped screens.

| Previous screen or entry point | New location / behavior | Preserved capability and compatibility |
|---|---|---|
| Home (`/`) ChatGPT intake | Opens the Research project list; existing `/?projectId=…` intake URLs still open the project-scoped import flow | New project creation offers CSV-first and ChatGPT-first entry points; no report is fabricated for CSV |
| Research project list and project creation | Primary **Research** area | Existing projects remain available; project context is retained across project links |
| Plan editor and research sessions | Research stage, with sessions/history linked contextually | Existing plan and run routes and data are retained |
| CSV import, data explorer, metadata review, compare periods | Project Research/data workspace | Existing CSV/data features remain reachable; project ID is preserved in links |
| App Store Explorer and Sources | Contextual exploration/research links, rather than primary navigation destinations | Existing direct routes remain valid |
| Reports and report history | Primary **Reports** area with search and project filtering | Global report discovery, direct report URLs, original report, evidence, benchmark and PO data remain available |
| Report-level PO assessment | Clearly labeled **Report notes (legacy)** for project-linked reports, with a link to project decisions | Historic report-specific notes remain readable/editable; persistence records are not merged or deleted |
| Workspace Opportunity Review / PO Decision | Project Research stage and contextual links from Reports | Existing workspace decision and evidence behavior remains authoritative and unchanged |
| Compare Periods | Linked from the active project data workspace | Direct route remains supported; project ID is retained |
| Tracking | Primary **Tracking** area and project Tracking stage | Explicit **Tracking setup pending** state; no fabricated history, monitoring, or change calculations |

## Before / after PO workflow

Before, the PO encountered a ChatGPT intake at Home and a separate Research project manager, while CSV, reports, comparison, decisions, and other tools appeared as disconnected destinations. The app now opens at Research projects and preserves the project as the common context.

**CSV-first:** Research projects → create/open a project → import CSV and review data → compare compatible periods → review candidates/PO decisions → import or open reports for that same project → Tracking status.

**ChatGPT-first:** Research projects → create/open a project → copy prompt and import the returned report in that project → review findings/evidence → open project PO decisions → return to Research or view Tracking status.

## Existing features and data preserved

- No backend, research contract, database model/schema, or migration was changed.
- No production SQLite file was opened for writing or reset.
- Existing reports and original report content, CSV datasets, projects, plans, runs/manifests, evidence, benchmark selections, report-level notes, opportunity decisions, and saved shortlists were not modified by this frontend-only work.
- Existing direct routes remain available; secondary screens are repositioned contextually rather than deleted.
- Report-level notes and project-level decisions remain separate persistence records. The UI now identifies the former as legacy context and guides the PO to the authoritative project decision workflow.

## Browser UAT

Browser checks used a separate local frontend/backend on ports `15201`/`15200`, backed by `.ux-ia-01-uat/appdata` (an isolated copy of the existing owner-UAT database). The user's app at port `15184` and production SQLite were not changed. The isolated workspace contains QA fixtures; synthetic fixture content is not represented as genuine market research.

- **CSV-first:** opened the existing isolated QA project and its Data workspace; confirmed five linked datasets including `Unified Top Apps Downloads YoY Growth test.csv`. Followed “Import ChatGPT research” and confirmed the project-scoped intake URL retained that project ID.
- **ChatGPT-first:** created isolated QA project `UX-IA-01 QA ChatGPT-first`, imported a clearly labeled synthetic Markdown-only report, verified it opened in the viewer, refreshed, and found it in project-filtered Reports.
- **Historical paths:** opened a previously saved report by its direct URL and verified the report viewer and project navigation rendered. Opened the `Report notes (legacy)` tab and confirmed its **Open project decisions** link resolves to the workspace Opportunity Review for that same project.
- **Workspace decision and tracking:** opened the linked Opportunity Review and verified saved candidates/evidence were displayed; opened the project Tracking route and verified the truthful “Tracking setup pending” state and links back to project reports and decisions.
- **Responsive:** the isolated app was checked at 1440×900, 768×1024, and 390×844. At 390px the report document width was 375px within a 390px viewport, with no horizontal page overflow; the mobile menu showed only Research, Reports, and Tracking. At 768px the project-filtered Reports view fit the viewport without horizontal overflow. Browser viewport was restored after testing.
- **Runtime:** a final reload rendered the current app and the newly exercised routes without a new runtime error. The browser log contains old hot-reload errors from before the `researchPage` fix; those are historical records and were not re-emitted on the final reload.
- This was workflow/navigation UAT on isolated QA records, not a validation of genuine research findings or market conclusions. No screenshot artifact was saved for this task.

## Regression verification

- `frontend`: `npm run build` — **PASS** (TypeScript and Vite production build). Vite reports the existing main JS bundle is about 510 KB, above its 500 KB advisory threshold.
- Focused frontend tests — **PASS**, 4 files / 54 tests: `AppNavigation.test.tsx`, `ResearchIntake.test.tsx`, `TrackingWorkspace.test.tsx`, and `OpportunityReview.test.tsx`.
- The first focused-test invocation was blocked before test collection by Windows `EPERM` while Vitest renamed a temporary dependency directory. Re-running with `TEMP` and `TMP` pointed to the existing workspace-local `.vitest-tmp` directory and one worker passed all 54 tests.
- Relevant quantitative CSV/period regression tests — **PASS**, 8 tests in isolated runs (`SourcesRunIntegration.test.tsx` and `QuantitativePeriodComparison.test.tsx`).
- Full frontend suite — **NOT ALL GREEN**: an earlier parallel run completed 161 tests and had 3 timeout failures under worker contention. The two affected files passed in isolation (8/8). A later serial focused rerun passed 54/54; the full suite was not rerun serially.
- Backend tests were not rerun because this task made no backend or data-contract changes.
- `git diff --check` — **PASS** (only line-ending normalization warnings).

## Known limitations and follow-up

- Longitudinal tracking, report-to-report change history, alerts, and automatic updates are not implemented; Tracking explicitly states this.
- Existing advanced routes are still individual screens, but they are linked from the project stage that owns their workflow. Further report/decision consolidation belongs in **UX-IA-02**.
- Historical report-specific assessment data remains in its own persistence model; migration or consolidation requires a separate validated task.
- Browser UAT used isolated QA records and did not import a new genuine ChatGPT research report. No market conclusions were verified.
- **TRACK-01** is required to implement research update history and comparison; it was not started.

## Product Acceptance

- **PO goal:** Navigate one research project from its input through the saved report and PO decision, then understand what Tracking can do today.
- **User journey:** Open Research → create/open a CSV-first or ChatGPT-first project → work with project-linked data/report → review the project-level decision → open Tracking.
- **Automated work:** The app preserves project IDs in contextual navigation, lists and filters reports, opens direct report paths, and labels report-specific notes as legacy while linking to workspace decisions.
- **Expected result:** Research, Reports, and Tracking feel like stages of one project workflow; the PO can find existing tools and saved decisions without knowing their internal module names.
- **Remaining friction:** Tracking is only a truthful pending entry point; advanced tools remain separate screens; report and project decision records are not physically consolidated.
- **Verification:** Focused UI tests 54/54 and separate CSV/period regression tests 8/8; TypeScript/Vite build passed; isolated browser workflow checked at 1440, 768, and 390 widths. Full suite had 3 parallel-timeout failures and backend tests were not rerun.
- **Decision:** **TECHNICAL PASS · PRODUCT PASS for UX-IA-01 navigation/consolidation scope**, with TRACK-01 and UX-IA-02 explicitly outstanding. Full-suite regression is not all-green, as noted above.

## Commit

- Implementation SHA: `0f371d7`
