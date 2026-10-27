# G3-02 — Persistent Research Subject Identity

**Status:** DONE (scoped); owner acceptance pending
**Branch:** `feat/ux-recovery-01-research-results`
**Starting HEAD:** `165bc5f1d8a21ddfe09e33a7aaed4fc7f14fe500`
**Production database:** not accessed or modified

## Outcome

Projects can now hold reusable subject identities and explicitly link them to report entities and stable CSV entity keys. Matching names remain separate until a PO chooses to link them. Existing report JSON, report content, CSV originals, benchmark selections, notes and immutable run data are not rewritten.

## API and migration

- `GET/POST /api/v1/projects/{project_id}/subjects`
- `PATCH /api/v1/projects/{project_id}/subjects/{subject_id}`
- `GET /api/v1/projects/{project_id}/subject-sources`
- `PUT /api/v1/projects/{project_id}/subject-sources`
- Additive Alembic revision `20261027_0010` adds `research_subjects` and `research_subject_references`. Source-to-subject references are project-scoped, source-keyed, and protected by foreign keys and uniqueness constraints. There is no data backfill or rename of existing source keys.
- Mapping changes require an explicit selection. Reassigning an existing mapping requires its expected prior subject ID; conflicting/stale changes return a conflict response. Creating a subject from a source is an explicit action and is atomic with its source link.

## Files changed

- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/subjects.py`
- `backend/migrations/versions/20261027_0010_research_subjects.py`
- `frontend/src/research/DataFirstWorkspace.tsx`
- `frontend/src/research/ResearchSubjectsPanel.tsx`
- `frontend/src/research/ResearchSubjectsPanel.test.tsx`
- `frontend/src/research/api.ts`
- `frontend/src/style.css`
- `tests/test_database.py`
- `tests/test_subjects.py`
- `.bangiao/G3-02-RESEARCH-SUBJECTS.md`
- `docs/RECOVERY_BOARD.md`
- `.bangiao/screenshots/g3-02-subject-identity/subject-report-csv-links-after-refresh.png`

## Verification

- Backend focused regression: **21 passed**, including subject mapping, project scope, migration preservation, and workspace data tests. One existing Starlette/AnyIO deprecation warning.
- Frontend: **170 passed** across 19 files.
- TypeScript check: **passed**.
- Production build: **passed**; Vite emitted the existing advisory that the JS bundle exceeds 500 kB (518.13 kB).
- `git diff --check`: **passed before documentation updates**; rerun before commit.
- Full backend suite: **NOT VERIFIED**. The default Windows temp location first caused permission errors. With temp redirected into the QA workspace, the full suite stalled during collection and was stopped; no full-suite pass is claimed.
- Browser UAT: **passed for the implemented flow** using headless real Chrome/Playwright, a fresh isolated QA SQLite database and synthetic fixture rows. Created one project, report entity and CSV entity with the same supplied name; explicitly created one subject from the report identity; explicitly linked the CSV identity; refreshed; verified both source references resolve to the same subject and the report/dataset remain persisted. The report and dataset checksum/observations were re-read. Screenshot is from the running app, not a mockup.
- The UAT fixture is synthetic and validates mechanics only. A genuine owner report/source acceptance scenario remains separate and is not claimed.

Screenshot: [subject/report/CSV links after refresh](screenshots/g3-02-subject-identity/subject-report-csv-links-after-refresh.png)

## Product Acceptance

- **PO goal:** Reuse a product/subject identity across reports and CSV exports without silently merging similarly named items.
- **User journey:** Open a Project Research workspace → review source-specific names → explicitly create a subject or select one → save the link → refresh and reopen.
- **Automated work:** Preserve source-local keys and provenance; validate source/project ownership; keep one explicit mapping per source identity; reject stale/conflicting reassignment.
- **Expected result:** A project-scoped reusable subject with visible report/CSV source links that survive refresh.
- **Remaining friction:** Ambiguous names require deliberate PO confirmation. The source identity list is paginated; the current UI loads up to 100 saved subjects for selection. Existing historical reports/CSV rows are not auto-linked.
- **Verification:** Automated tests above plus isolated Chrome workflow and screenshot. No production DB was used.
- **Decision:** `TECHNICAL PASS` for this slice; `PRODUCT PASS` for the explicit mapping workflow only; overall G3 and owner acceptance remain pending.

## Limitations / next task

- The model preserves subject identity but does not yet offer reusable Benchmark Collections or cross-source comparison. That is G3-03.
- Sources without a stable supplied key are not offered for mapping rather than being assigned a fabricated key.
- Full backend suite collection remains unverified in this Windows environment.

**Implementation commit:** `9f92a24a2184a73ef29bb91ea595c0786a26fd0b`
