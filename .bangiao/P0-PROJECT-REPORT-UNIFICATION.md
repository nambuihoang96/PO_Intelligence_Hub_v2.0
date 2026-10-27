# P0 — Project / Report Unification

## Audit snapshot

- Working branch: `feat/ux-recovery-01-research-results`
- Feature HEAD before implementation: `3f4eacb666b353820183baa26a76df2335f3bd11`
- Implementation commit SHA: `52f9d71` (`feat(reports): unify project and report workflow`)
- Local `master` and `origin/master`: `57b7167ae60729fd3221e283c7ff2433e22454a4`
- Branch divergence at audit: feature is 86 commits ahead and 0 behind `master` (86 commits ahead of merge base); 158 changed paths relative to master.
- No merge or rebase was performed. A scoped commit and push are authorized by the owner's standing instruction to push completed work for review.
- Existing unrelated modifications and QA folders were preserved, including `scripts/setup.ps1` and the pre-existing `.m*` / `.ux-ia-01-uat` directories.

## Root cause / evidence / fix

| Root cause | Evidence | Fix |
|---|---|---|
| Project Detail and Reports Library already read the same report records but entry points were not visibly unified. | `ImportedResearchReport` is the shared source; project report endpoint filters on `project_id`, while `GET /api/v1/reports` pages across all reports. Project workflow navigation already links Research → Report → Tracking. | Kept the shared library as the source of truth and added project and unassigned filters to it. Project-scoped URLs retain their filter. |
| Existing reports without a project had no explicit organization action. | Read-only production DB inspection found 8 imported reports with `project_id = NULL`, 0 linked reports and 1 project with no reports. No production writes were made. | Added an explicit per-report project selector and link action. It never guesses from report title, and uses the existing link API. |
| Report Detail navigation discarded its originating project/unassigned context. | Breadcrumb and back link previously always pointed to `/reports`. | Back and breadcrumb links now retain `projectId` for linked reports and return to the unassigned filter when the report was opened from that filter. The report detail URL keeps the same report ID. |

## Data model and migration decision

- `ImportedResearchReport.project_id` already exists as a nullable foreign key to `research_projects.id`, introduced by migration `20261023_0008_workspace_owned_quant_datasets.py`.
- There is no report `run_id` column. User-imported ChatGPT reports do not necessarily originate from a local `ResearchRun`; assigning one would imply provenance that is not established by the current architecture. No `run_id` was added.
- No schema migration was required. Existing report IDs, source text, structured data, benchmark selections, PO notes, datasets and immutable run manifests were left intact.
- The existing `PUT /api/v1/projects/{project_id}/reports/{report_id}` link operation is reused. It updates the optional project association in place, preserves the same report record, and rejects a conflicting second project with HTTP 409.

## Implementation files

- `frontend/src/reports/ResearchIntake.tsx` — shared report library project/unassigned filters and explicit linking action.
- `frontend/src/reports/ReportResults.tsx` — project/unassigned context in report breadcrumb and back navigation.
- `frontend/src/style.css` — compact linking controls, result count and inline link errors.
- `frontend/src/reports/ResearchIntake.test.tsx` — library/project filters, explicit old-report linking and context navigation.
- `tests/test_workspace_data_first.py` — 3/2 project allocation, shared library counts, in-place linking, conflict and data preservation/reopen.

## Validation evidence

- Frontend full suite: **PASS — 18 test files, 167 tests**.
- Focused report library suite after final edits: **PASS — 38 tests**.
- Backend workspace data-first suite: **PASS — 15 tests**.
- Focused project/report allocation and linking regression after final edits: **PASS — 1 test**.
- Frontend TypeScript check and production build: **PASS** (`npm run build`). Vite emitted the existing bundle-size advisory for the ~512 kB JS bundle.
- SQLite migrations: the isolated backend tests upgraded a temporary SQLite database through `20261024_0009`; all passed. No production database was migrated by this task.
- Production SQLite was inspected read-only: `PRAGMA integrity_check` returned `ok`; current version was `20261024_0009`. No mutation occurred.
- `git diff --check`: **PASS** (only line-ending conversion advisories).
- Automated interaction coverage confirms the same report URL/ID is used from the shared library and project-filtered list, and that explicit linking preserves original report fields and PO-owned state after reloading the row from SQLite.
- Actual browser UAT: **PASS on isolated QA copy** using Playwright + Chrome, 1440×900. The flow opened the unassigned library, explicitly linked a legacy report, filtered by project, opened the same report ID, refreshed, returned to the project-filtered library, and checked that report count remained 8 with no duplicate. SQLite `PRAGMA integrity_check` returned `ok`.
- Browser requests: report detail and project APIs returned successfully; no failed browser requests or UI alerts. The project heading was allowed to finish loading before the final screenshot.
- Screenshots captured from the running app are committed under `.bangiao/screenshots/p0-project-report-unification/`.
- Production SQLite was not used for writes. The isolated QA copy was mutated only for the explicit-link UAT; source/production databases were not changed.

## UAT scenario mapping

1. **Project A with 3 reports / Project B with 2 reports:** covered by frontend filter test and backend list test.
2. **Project A list and Project B list:** each returns the expected 3 / 2 existing IDs.
3. **Shared Reports Library:** returns all 5; project lists contain the same IDs, with no copies.
4. **Project A filter:** returns the same three IDs as Project A's report endpoint.
5. **Open from project and library:** the report detail href retains the same `report_id`; project context is retained on detail breadcrumbs/back.
6. **Link an old unassigned report:** explicit user selection updates only `project_id`; the report ID, original content/hash, structured data, benchmark selection and PO note remain unchanged. A conflicting project assignment is rejected with 409.
7. **Reload and migrations:** test database is upgraded to migration head; the backend test expires cached ORM objects and reloads the linked record, confirming persistence.
8. **Browser visual UAT:** verified the project-filtered library and report detail context at 1440×900. The report's breadcrumb/back link retained the project context; browser history back-button behavior was not independently tested.

## Remaining issues by priority

- **P0 — Owner acceptance pending:** owner should confirm the UI/business flow on their local copy. Browser UAT is technically verified on isolated QA data, not owner-accepted.
- **P1 — Master integration risk:** this branch is 85 commits ahead of `master` and carries 144 paths / 14,792 insertions relative to it. This task does not resolve or certify that broad branch delta; review/merge planning should account for it.
- **P2 — Run association:** reports currently have no `run_id`. Keep them project-linked unless product semantics define an explicit report-to-run relationship in a future reviewed task.

## Product Acceptance

- **PO goal:** organize multiple reports under the project they inform and find older unassigned reports without recreating them.
- **User journey:** open Reports → filter by project or unassigned → explicitly choose a project for a legacy report → open the same report from either route.
- **Automated work:** the library fetches paginated report/project records, filters them, and saves only the selected project association using the current API.
- **Expected result:** each project shows its own reports; the shared library retains every report; linking preserves report and PO-owned data.
- **Remaining friction:** old reports require one explicit project choice per report; no bulk-linking or inferred ownership is provided.
- **Verification:** 167 frontend tests from the current audit run; focused ResearchIntake suite 38 tests; backend workspace suite 15 tests including allocation/linking preservation; TypeScript and production build; isolated migration tests; isolated Chrome/Playwright UAT; screenshot evidence below. Vite reports its existing ~512 kB bundle advisory.
- **Decision:** `TECHNICAL PASS` for this bounded Project/Report slice; core journey verified on isolated QA data. Overall product recovery and Product Owner acceptance remain pending.

## Browser screenshots

- [Unassigned report library before link](screenshots/p0-project-report-unification/reports-unassigned-before.png)
- [Project-filtered Reports library after explicit link](screenshots/p0-project-report-unification/reports-project-filter-after-link.png)
- [Report detail with Project context](screenshots/p0-project-report-unification/report-detail-project-context-verified.png)

## Review state

- New implementation commit SHA: `52f9d71`.
- PR URL: none; not requested.
- Merge status: **not merged**.
- Decision: **awaiting Product Owner review**.
