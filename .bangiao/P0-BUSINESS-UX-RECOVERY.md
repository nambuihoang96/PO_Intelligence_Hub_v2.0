# P0 Business UX Recovery — implementation slice

**Date:** 2026-10-27  
**Branch:** `feat/ux-recovery-01-research-results`  
**Status:** Slice verified; overall P0 recovery remains `NEEDS FIX` / owner acceptance pending.

## Root cause

The previous information-capture path required an existing subject and dated/source-specific fields. A Product Owner could not safely preserve a complete note before resolving its identity. Project Home also needed a clearly visible route to save information while keeping project context.

## What changed

- Added an additive, project-scoped saved-information record and API. Original text is preserved; subject, comparison group, source context, source link, date and local image are optional. Saved content always stays `source_reported_unverified`.
- Project Home presents **Start Research**, **Save New Information**, and **Analyze Data**, and shows project reports, recent activity, topics, collections, available datasets and PO-decision access.
- The workspace supports saving first, then explicitly linking information to a product/topic. It can also create a topic in the same save flow.
- An explicitly linked topic profile shows the saved original note and supplied source/image context. A small project event keeps the profile synchronized after the save/link action.
- Earlier trend-update and image-evidence workflows remain available in a collapsed section. No report, run, benchmark or legacy evidence data is rewritten.

## Files changed for this slice

- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/saved_information.py`
- `backend/migrations/versions/20261027_0015_project_saved_information.py`
- `tests/test_saved_information.py`
- `frontend/src/research/api.ts`
- `frontend/src/research/ProjectHome.tsx`
- `frontend/src/research/DataFirstWorkspace.tsx`
- `frontend/src/research/SavedInformationPanel.tsx`
- `frontend/src/research/SavedInformationPanel.css`
- `frontend/src/research/SavedInformationPanel.test.tsx`
- `frontend/src/research/ResearchSubjectsPanel.tsx`
- `frontend/src/research/ResearchSubjectsPanel.test.tsx`
- `frontend/src/research/ResearchRunIntegration.test.tsx`
- `frontend/src/style.css`
- `docs/RECOVERY_BOARD.md`

Unrelated pre-existing working-tree changes were preserved and are not part of this handoff.

## Test results

- Backend focused persistence/migration + legacy trend regression: **8 passed**.
- Frontend full suite: **22 files, 191 passed**.
- TypeScript check: **passed**.
- Production build: **passed**; Vite reports the existing large JavaScript chunk advisory (~571 kB).
- `git diff --check`: **passed**.
- Full backend suite: **not run**.

The first frontend test attempt hit Windows temp-directory `EPERM`; rerunning with temp/cache directed to the workspace passed.

## Browser UAT

**Tested in the actual Codex in-app browser** against current workspace source at `http://127.0.0.1:15195`, with isolated backend port `15196` and SQLite under `.p0-business-ux-uat-data`:

1. Opened a new isolated project and verified the three Project Home actions.
2. Saved original content with no subject/date/source metadata and confirmed success.
3. Created an explicitly named QA topic while saving another note.
4. Refreshed, opened Research subjects, opened the topic profile and confirmed the saved note appears with `Source-reported · unverified` provenance.
5. Confirmed project history survives reload.

The screenshot was captured and visually inspected in the Codex browser session. The active browser surface did not provide a repository file export, so no screenshot file is committed. The existing user tab at port `15191` was not stopped or replaced; use `15195` to view the isolated current-source UAT. The QA project and data are test-only.

**Not verified:** 1440/1024/768/390 responsive dimensions; local image attachment; a genuine owner report; complete Deep Research → report import; business-oriented CSV analysis; decision persistence from this flow; genuine Rotate Rings data. No browser UAT claim is made for these.

## Product Acceptance

- **PO goal:** Preserve useful information in its project before a product/topic identity is confirmed.
- **User journey:** Project Home → Save New Information → paste/save → optionally create or link a topic → reopen the note in that topic profile.
- **Automated work:** Keeps the exact content, project association, optional local image bytes/hash and unverified provenance; updates relevant project/profile views.
- **Expected result:** The saved note remains available under project history and an explicitly linked topic.
- **Remaining friction:** CSV, report, subject and decision history are not yet one complete business workflow; prior trend/image records still use their original flows.
- **Verification:** 8 focused backend tests, 191 frontend tests, TypeScript, build, isolated browser save/profile/reload UAT. Screenshot export and responsive browser checks were not verified.
- **Decision:** **TECHNICAL PASS for this bounded slice; PRODUCT NEEDS FIX for the full P0 recovery.**

## Data and release safety

- Migration is additive. No table/data reset or production SQLite access was performed.
- Existing reports, runs, trend updates, image evidence, benchmark collections and PO decisions are untouched.
- No merge or release was performed.

## Git reference

Implementation commit: pending commit.  
Push: pending commit.
