# G3-04 — Project Trend Updates

**Status:** `DEV_DONE` — isolated browser capture, saved-subject association, optional collection link, Tracking target and refresh/reopen verified; genuine-source owner acceptance pending.
**Branch:** `feat/ux-recovery-01-research-results`
**Starting HEAD:** `ee25199561552552e8a08874ab4d74083e009b08`
**Production SQLite:** not accessed or modified

## Outcome

Project Research now has a trend-update form and saved-update history. A PO can capture an exact claim, source note, publication date, optional source title/link, a saved project subject, and an optional collection that already contains that subject. Updates are append-only: a correction is another record, and earlier wording remains available.

The API always labels records `source-reported · unverified`. It does not open or fetch links. It does not parse a claim into a metric or infer GEO, platform, measurement period, methodology, or growth. When a collection is selected, its comparison response shows the exact claim as text in a generic trend-update dimension, with publication date, source note, link, and unverified status. It is not treated as a measured value.

## Root cause / impact

- There was no persisted trend-update source model or capture workflow in Project Research.
- Reused G3-02 subject identity and G3-03 collection membership provide the existing explicit association points.
- G3-03 was reopened for the bounded collection-response extension after the G3-04 source contract existed; no duplicate collection task was created.
- Dependent work: G3-05 local image evidence and G4 Tracking/decision history can associate with these records later. Those modules were not changed here.

## API and migration

- `GET /api/v1/projects/{project_id}/trend-updates` — paginated list; optional subject/collection filters.
- `POST /api/v1/projects/{project_id}/trend-updates` — append an owner-captured update after validating project subject and, if supplied, existing subject membership in that project collection.
- No update/delete endpoint is exposed. A corrected statement is a new record.
- Collection reads include trend claims only for the exact subject and collection IDs recorded on the update.
- Additive Alembic revision `20261027_0012` creates `project_trend_updates`, scoped foreign keys, publication ordering indexes, and a constraint fixing new records to the unverified source-reported state. No existing report, dataset, run, PO note, benchmark selection or production database is modified.

## Files changed

- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/trend_updates.py`
- `backend/app/benchmark_collections.py` (G3-03 trend observation extension)
- `backend/migrations/versions/20261027_0012_project_trend_updates.py`
- `frontend/src/research/api.ts`
- `frontend/src/research/DataFirstWorkspace.tsx`
- `frontend/src/research/TrendUpdatesPanel.tsx`
- `frontend/src/research/TrendUpdatesPanel.test.tsx`
- `frontend/src/research/ResearchSubjectsPanel.tsx`
- `frontend/src/research/ResearchSubjectsPanel.test.tsx`
- `frontend/src/style.css`
- `tests/test_trend_updates.py`
- `tests/test_benchmark_collections.py`
- `tests/test_database.py`
- `docs/RECOVERY_BOARD.md`
- `.bangiao/G3-03-BENCHMARK-COLLECTIONS.md`
- `.bangiao/G3-04-TREND-UPDATES.md`

## Verification

- Backend focused regression: **26 passed** across `test_trend_updates`, `test_benchmark_collections`, `test_subjects`, and `test_workspace_data_first`. Includes schema rejection, append-only records, exact claim retention, project/collection membership checks, collection matrix provenance, OpenAPI path exposure, migration upgrade/downgrade round trip, and prior report/PO state preservation.
- Frontend: **174 passed** across 20 files in the final standalone full-suite run. The two targeted Research Subjects/Trend Updates suites also passed **7 tests**. One earlier run executed alongside the build and produced a timing failure in the unrelated Research Run UI test; that file passed alone and the subsequent standalone full suite passed.
- TypeScript: **passed**.
- Production build: **passed**; Vite reports a 530.24 kB main chunk advisory.
- `git diff --check`: **passed** for staged implementation; rerun after final handoff changes.
- Browser UAT (follow-up 2026-10-28): **passed for the scoped workflow** on the host-launched isolated QA app at `http://127.0.0.1:15310`, using project `[QA] Peachy Studio UAT` and saved QA subject `[QA] Subject for trend workflow`. Saved an explicitly synthetic trend note with date/source, selected its existing collection, refreshed, and confirmed the exact unverified claim persisted in the update list and the same project collection matrix. Opened the saved update's PO decision link and confirmed it resolved to the same trend-update target in Tracking. Browser screenshot was not saved in this follow-up; exact desktop/390px viewports remain NOT VERIFIED. No production SQLite was accessed.
- Genuine Rotate Rings source note/link/file was not supplied. Only synthetic test text was used; no market claim is asserted as true.

## Product Acceptance

- **PO goal:** Record a trend claim in the existing project workspace and reuse it in the chosen subject/benchmark context without losing attribution.
- **User journey:** Open Project Research → choose a saved subject → optionally choose a collection containing it → enter date, exact claim and source context → save → reopen in Saved updates and collection comparison.
- **Automated work:** Validate project/subject/collection scope; append and retrieve the record; retain exact text; label as unverified; show it in the selected collection without extracting metrics.
- **Expected result:** A saved source-attributed claim remains visible after refresh and is distinguishable from verified or measured data.
- **Remaining friction:** Subject must already exist; optional collection association requires the subject to be an existing member. Genuine owner source data is still required for product acceptance. Exact desktop/mobile visual checks and browser screenshot artifact are not included in this follow-up.
- **Verification:** Focused backend/frontend tests, TypeScript and production build from implementation; actual isolated browser verified capture, collection, refresh/reopen and Tracking navigation. The follow-up was browser-only with documentation updates, so automated tests were not rerun in this round.
- **Decision:** `DEV_DONE / TECHNICAL PASS` for the scoped capture and matrix workflow. `PRODUCT ACCEPTANCE PENDING OWNER REVIEW`; no Product Pass claimed.

## Known limitations

- Source title and link are optional; a source note is required. A source link is rendered for the user but never fetched.
- Trend claims are displayed as text only. There is no metric normalization, period comparison, image upload, PO decision history, or Tracking timeline in this task.
- API HTTP behavior was not exercised through a running browser/server in this environment; direct handler/schema tests and OpenAPI exposure were exercised.

**Implementation commit:** `867f321`; browser-verified documentation update: see Recovery Board G3-04 follow-up dated 2026-10-28.
