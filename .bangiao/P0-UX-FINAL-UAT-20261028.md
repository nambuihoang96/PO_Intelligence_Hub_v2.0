# P0 UX Recovery — Browser UAT and Local Commit Handoff

**Date:** 2026-10-28  
**Branch:** `feat/ux-recovery-01-research-results`  
**Base before this handoff:** `5581f1efb3a2993511abd6c62ee6719e0528b4c4`  
**Status:** Technical checks pass for the current frontend slice; product acceptance for the broader P0 recovery remains pending.

## Scope completed

This handoff closes the dirty Project Home / Vietnamese UI continuation and its browser UAT. Project Home deep links open the selected report, CSV dataset and subject profile in the existing workspace. Saved PO decisions are listed on Project Home and in Tracking. Tracking links reopen the decision context. A delayed hash target is now observed so a subject section rendered after workspace loading still receives the deep-link scroll. No backend, API contract, migration or database schema was changed.

## Browser UAT

The running app was tested in the Codex in-app browser, using isolated local QA services:

- Frontend: `http://127.0.0.1:15295`
- Backend: `http://127.0.0.1:15296`
- Isolated QA data root: `.p0-recovery-tmp/browser-uat-20261028/`
- QA project: `UAT — luồng nghiên cứu 28-10-2026`
- All records used for decision edits are explicitly `[UAT]`; production SQLite was not opened or modified.

| Journey | Result | Evidence |
|---|---|---|
| Project Home → Report Reader | PASS | Opened report `80af1170-298a-49cb-b85a-b8a5935eb8bb` from its Home card. Project context remained visible, report loaded, and machine JSON was not shown in the default reader. The report fixture is text-only and explicitly `[UAT]`, not genuine market research. | `screenshots/p0-ux-final-uat-20261028/report-reader.jpg` |
| Project Home → Dataset | PASS | Opened the linked Sensor Tower dataset `c246f296-a5c5-4d43-bdba-ca894b443322`. Confirmed filename, 25 source products, supplied metric labels, Worldwide/Unified scope and period. No values or platform equivalence were invented. | `screenshots/p0-ux-final-uat-20261028/dataset.jpg` |
| Project Home → Subject Profile | PASS after fix | First reproduced a no-op-feeling link: URL changed but viewport remained at the top because the section was mounted after the parent’s one-time scroll. Added a bounded hash-anchor observer and regression test. Retested from Home; selected profile is expanded and the target section is at the viewport top (`scrollY=1589`, target top ≈ 0 px). | `screenshots/p0-ux-final-uat-20261028/subject-profile.jpg` |
| Decision Hold → Tracking → reopen → refresh | PASS | Saved a clearly labeled QA-only Hold decision in the isolated DB; Tracking displayed `Tạm hoãn` and its next action. `Mở quyết định` reopened the saved decision. After browser refresh, Tracking still displayed Hold. | `screenshots/p0-ux-final-uat-20261028/hold-tracking.jpg` |
| Vietnamese / Peachy Studio visual check | PASS for sampled screens | Project Home, report, dataset, profile and Tracking use Vietnamese business UI copy and the warm Peachy light surface/plum navigation. Provider/file/metric labels remain source-supplied English where applicable. This is not a claim that every screen in the full product is fully localized. | `project-home.jpg`, `report-reader.jpg`, `dataset.jpg`, `subject-profile.jpg`, `hold-tracking.jpg` |
| Mobile visual check | PARTIAL | Project Home checked at 390×844; document scroll width was 375 px, with no horizontal page overflow. Other journeys were not viewport-tested on mobile. | `project-home-mobile-390.jpg` |

## Screenshots

All images below are captured from the running browser, not generated mockups.

- [Project Home](screenshots/p0-ux-final-uat-20261028/project-home.jpg)
- [Report Reader](screenshots/p0-ux-final-uat-20261028/report-reader.jpg)
- [Dataset](screenshots/p0-ux-final-uat-20261028/dataset.jpg)
- [Subject Profile](screenshots/p0-ux-final-uat-20261028/subject-profile.jpg)
- [Hold in Tracking](screenshots/p0-ux-final-uat-20261028/hold-tracking.jpg)
- [Project Home at 390 px](screenshots/p0-ux-final-uat-20261028/project-home-mobile-390.jpg)

## Verification

- Focused delayed-anchor frontend test: **7 passed** in `DataFirstWorkspace.test.tsx`.
- Full frontend suite: **24 files / 204 tests passed**.
- TypeScript: `npm run typecheck` **passed**.
- Production build: `npm run build` **passed**. Existing Vite advisory remains: the main minified JS chunk is about 601 kB.
- Relevant backend regression tests: **115 passed** across workspace, subjects, saved information, trends, reports and quantitative datasets.
- Full backend suite: **173 passed, 1 failure, 1 error out of 175**. Both findings are in unchanged migration-test coverage: (1) Alembic autogenerate reports a uniqueness representation mismatch for `project_trend_updates` (unique index vs unique constraint); (2) a historical restore test expects revision `20261027_0012` although current migration head is `20261027_0015`. No backend code or migration was changed in this slice; these test findings are recorded rather than masked by test edits.
- `git diff --check`: **passed**.
- An initial frontend test attempt and a backend attempt without normal local temp access failed with Windows `EPERM`; frontend was rerun successfully with allowed local temp access, and the backend regressions were rerun against isolated scratch roots.

## Data safety and remaining issues

- Production SQLite, reports, CSV datasets, PO notes and finalized runs were not opened or modified.
- Existing listeners at `15195`/`15196` were not terminated or reused. Current preview uses the exact local frontend/backend sessions started for this QA run at `15295`/`15296`; preview URL: `http://127.0.0.1:15295/`.
- The isolated QA report is a text-only test fixture, not an owner-provided genuine research report. Genuine-report acceptance remains **NOT VERIFIED**.
- Full product language/Peachy review and mobile verification of the dataset, profile, report and Tracking flows remain outstanding.
- Full backend suite still has the two existing migration-test findings described above.
- Broader P0 tasks in G1/G2/G3 remain `IN_PROGRESS` / `REWORK`; this UAT does not imply Product Owner acceptance or release readiness.

## Product Acceptance

- **PO goal:** Reach project research outputs and decisions without losing project context.
- **User journey:** Project Home → open report/dataset/profile → open saved Hold in Tracking → reopen and refresh.
- **Automated work:** Existing IDs/deep links select the correct saved records; the UI reveals the subject anchor when asynchronously rendered; current saved state is read back from SQLite.
- **Expected result:** The selected item opens in the expected area and a saved Hold decision remains visible after refresh.
- **Remaining friction:** The report is a QA fixture, most mobile journeys and full product localization are not checked, and two unrelated migration tests remain red.
- **Verification:** Browser flows above, six actual screenshots, 204 frontend tests, TypeScript/build, 115 relevant backend tests; full backend suite 173/175 with two migration-test findings.
- **Decision:** `TECHNICAL PASS` for this bounded slice; `NEEDS FIX` for overall P0/product acceptance pending genuine report UAT, remaining responsive review and migration-test cleanup.

## Changed files and commit

The implementation changes in this commit cover the Vietnamese shell, report/data/research/tracking presentation, Project Home deep links, current frontend tests, recovery audit/board notes, milestone evidence and the screenshots listed above. `scripts/setup.ps1` and all QA scratch directories are excluded. No merge, deployment or database migration was performed.

**Commit SHA:** to be filled after the commit is created.

**Push status:** to be recorded after attempting the authorized branch push.
