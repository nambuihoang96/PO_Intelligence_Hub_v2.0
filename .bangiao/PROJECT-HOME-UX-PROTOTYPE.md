# Project Home UX Rework — Owner Preview

**Date:** 2026-10-27
**Status:** `READY_FOR_OWNER` — prototype only; Product Acceptance pending
**Preview:** [Project Home prototype](http://127.0.0.1:15190/prototypes/project-home/)
**Board:** [Recovery Board](../docs/RECOVERY_BOARD.md)

## Why this rework was opened

The Product Owner rejected the running Project workflow as a product UX failure. The current path creates a Project and immediately exposes a technical Research Plan form, multiple competing destinations, and no clear business-oriented next action. Trend Update also requires choosing an existing subject before the workflow offers any way to create one. Projects, research sessions, saved reports, and tracking therefore appear disconnected to a nontechnical PO.

| Root cause | Source evidence | Prototype response |
|---|---|---|
| Project creation routes directly to technical plan editing | `frontend/src/research/ResearchWorkspace.tsx`: `NewProjectForm` creates a project and navigates to `/research?projectId=...`; empty-state copy says to create a project to draft a plan. | One Project Home with three plain-language actions; research details open only after choosing Deep Research. |
| Research workspace exposes several technical destinations/actions at once | `frontend/src/research/ResearchWorkspace.tsx`: plan page exposes data workspace, CSV data, research sessions, store explorer, report import, project reports, and tracking status. | Keep reports, activity, benchmark collection, and subjects in the same project context; progressive disclosure for each action. |
| Research Plan uses implementation-oriented fields too early | `frontend/src/research/ResearchWorkspace.tsx`: plan editor asks for research question, GEO/platform lists, period, goals, keywords, and sources. | Start with the research question and a small scope review; display the generated brief before continuing. |
| Trend Update cannot start with a new subject | `frontend/src/research/TrendUpdatesPanel.tsx`: subject selector requires a saved subject and has no create-subject option in that flow. | The same Trend Update flow lets the PO create a subject or choose one already saved. |
| Project/report continuity is unclear in the interaction | Existing report list and detail routes exist, but the rejected Project landing does not make reports the visible continuation of work. | Open a saved report from Project Home and return to the same Project context. |

## Prototype experience

The prototype is a standalone page served by the existing frontend preview server. It does not replace or alter the production React routes.

- **Project Home:** a single project context with three primary actions: Start Deep Research, Capture Trend Update, and Import / Analyze CSV. Saved reports, recent activity, benchmark collections, and research subjects remain visible below.
- **Deep Research:** enter a question and scope, review the brief, copy it for ChatGPT, then see the one-paste report return/import step. The prototype explicitly says PO Hub does not call an AI API.
- **Trend Update:** create or confirm a subject inline, enter an observation and source, review, and save to demo-only project state.
- **Report:** open an existing sample report, see which project it belongs to, and return to that project.
- **New Project:** switch to an empty-state project and see the same three clear first actions.

## Browser review evidence

Browser: Codex in-app browser, local preview at `http://127.0.0.1:15190/prototypes/project-home/`.

| Scenario | Actual interaction checked | Result |
|---|---|---|
| A. New Project — empty state | Switched from Puzzle Discovery to New Research Project; reviewed its empty state and primary actions. | PASS in prototype. |
| B. Existing Puzzle Project — one report | Switched to Puzzle Discovery and inspected the report, recent activity, collection, and subjects. | PASS in prototype. |
| C. Start Deep Research | Entered a question, reviewed scope, copied the prompt, continued to the one-paste ChatGPT report step, and inspected its import preview validation. | PASS in prototype. Clipboard copy succeeded. No AI call or persistence was made. |
| D. Trend Update for new subject | Chose “Create a new subject”, entered a demo subject, observation, and source, reviewed and saved; confirmed the update appeared under the new project and did not appear in Puzzle Discovery. | PASS in prototype; per-project demo state isolation verified. |
| E. Reopen existing report | Opened the Puzzle report, confirmed its Project context, used the back action, and returned to Puzzle Discovery. | PASS in prototype; context retained. |
| Mobile | Visually inspected Project Home and report flow at 390px after resetting the browser viewport. | Visually usable; no obvious horizontal overflow in the captured viewport. Other widths are NOT VERIFIED for this prototype. |

Real browser screenshots were captured in the Codex in-app browser during the scenarios above and appeared inline in the session. The active browser surface did not expose a supported screenshot-file export action, so no screenshots are claimed as repository artifacts. The preview is left available for owner review; the Product Owner can capture screenshots directly from the preview if local image files are required.

## Files changed

- `frontend/prototypes/project-home/index.html`
- `frontend/prototypes/project-home/project-home.css`
- `frontend/prototypes/project-home/project-home.js`
- `docs/RECOVERY_BOARD.md`
- `.bangiao/PROJECT-HOME-UX-PROTOTYPE.md`

No backend, React production route, database schema, migration, SQLite file, existing report, benchmark, note, or user data was changed.

## Verification

- Browser interactions A–E: PASS for the isolated prototype; not application UAT.
- 390px visual check: performed; only visual inspection, not an automated overflow assertion.
- JavaScript syntax check: PASS (`node --check frontend/prototypes/project-home/project-home.js`).
- `git diff --check`: PASS for the final staged task files.
- Frontend test suite: PASS, 21 files / 179 tests. First attempt hit Windows Temp `EPERM` before tests executed; rerun with a workspace-local temporary directory passed.
- TypeScript check and production build: PASS (`npm run build`; existing advisory about the 546.55 kB JS chunk remains).
- Backend tests: NOT RUN; no backend application code was changed.
- SQLite/persistence: NOT tested and not touched. Demo state is browser-local in-memory state and is not a persistence demonstration.

## Limitations and next gate

- This is an interaction prototype with clearly labeled sample content, not a connected implementation. It demonstrates the proposed journey but does not read or write application data.
- The report and trend-update flows do not prove backend persistence, migration compatibility, or refresh/reopen behavior.
- The owner must review the direction before it is applied to the application. Do not expand the rejected navigation or this layout across production screens before that review.
- G1-01, G1-02, G2-01, and G2-02 are reopened as `REWORK / PRODUCT NEEDS FIX`. G1-03, G2-03, G2-04, and Project-facing G3-01 UI entry points are paused where dependent on the rejected journey. Independent backend and data-integrity work may continue safely.

## Product Acceptance

- **PO goal:** Organize research around a Project and make the next useful action obvious without requiring the PO to understand Runs, Subjects, schemas, or internal workspaces.
- **User journey:** Project Home → choose Deep Research, Trend Update, or CSV → review → return to the same Project → reopen reports and recent work.
- **Automated work:** Prototype groups project context and reveals only the flow selected; Trend Update allows creating or selecting a subject in the same flow.
- **Expected result:** A coherent, low-friction Project Home with saved work and clear next actions.
- **Remaining friction:** Demo-only state; no application API/SQLite integration or real report import/save. Browser screenshot files could not be exported through the active browser surface.
- **Verification:** Actual browser interactions for A–E and a visual 390px check; automated syntax/whitespace checks. Production persistence and broader responsive testing were not run.
- **Decision:** `NEEDS FIX` for the current production UX; prototype is `READY_FOR_OWNER` for early direction review. Not Product Accepted.

## Commit

Implementation commit: `6df240b` (`Prototype product-first Project Home UX`). The commit is on `feat/ux-recovery-01-research-results`; push status is reported after synchronization completes.
