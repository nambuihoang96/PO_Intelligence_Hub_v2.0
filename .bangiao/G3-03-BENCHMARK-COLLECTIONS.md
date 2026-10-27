# G3-03 — Project Benchmark Collections

**Status:** `DEV_DONE` for report and CSV sources; trend-source integration remains pending G3-04. Owner acceptance is pending.
**Branch:** `feat/ux-recovery-01-research-results`
**Starting HEAD:** `7c45cad3ab12b7eb92940f4d5300541274ac78e6`
**Production SQLite:** not accessed or modified

## Outcome

Project Research now supports named benchmark collections using existing project-scoped Research Subjects. A PO explicitly creates a collection and adds/removes confirmed subjects. Removing membership leaves the subject, report/CSV source links, reports, raw CSV, observations, benchmark selections and PO notes intact.

The comparison matrix only includes report-supplied benchmark dimensions and CSV observations whose source entity was explicitly linked to a subject. CSV dimensions retain dataset and metric/method/scope/period identity, so similar labels are not treated as equivalent. Missing observations display `Unknown / Not provided`; imported and report-supplied records remain unverified unless their source explicitly says otherwise. Validation details are collapsed by default and accessible on demand.

Trend Update records are not yet a persisted source type, so they are not represented in the collection matrix in this slice. G3-04 will add that source workflow; collection integration must be revisited against its actual provenance model rather than inferred now.

## API and migration

- `GET /api/v1/projects/{project_id}/benchmark-collections`
- `POST /api/v1/projects/{project_id}/benchmark-collections`
- `GET /api/v1/projects/{project_id}/benchmark-collections/{collection_id}`
- `PUT /api/v1/projects/{project_id}/benchmark-collections/{collection_id}/subjects/{subject_id}`
- `DELETE /api/v1/projects/{project_id}/benchmark-collections/{collection_id}/subjects/{subject_id}`
- Additive Alembic revision `20261027_0011` creates project-owned collections and explicit subject-membership tables with project-scoped foreign keys and uniqueness constraints. No existing reports, CSV records or PO state are rewritten.

## Files changed

- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/benchmark_collections.py`
- `backend/migrations/versions/20261027_0011_benchmark_collections.py`
- `frontend/src/research/api.ts`
- `frontend/src/research/ResearchSubjectsPanel.tsx`
- `frontend/src/research/ResearchSubjectsPanel.test.tsx`
- `frontend/src/style.css`
- `tests/test_benchmark_collections.py`
- `tests/test_database.py`
- `AGENTS.md` (continuous PO feedback operating rules)
- `docs/RECOVERY_BOARD.md` (feedback history and live backlog status)
- `.bangiao/G3-03-BENCHMARK-COLLECTIONS.md`
- `.bangiao/screenshots/g3-03-benchmark-collection/collection-membership-after-refresh.png`
- `.bangiao/screenshots/g3-03-benchmark-collection/collection-comparison-matrix.png`

## Verification

- Backend focused regression: **23 passed** across `test_benchmark_collections`, `test_subjects`, and `test_workspace_data_first`. Includes additive migration round-trip in the collection test and verifies legacy report text, benchmark selections, PO notes, subject references and raw report/CSV data are preserved.
- Broader `DatabaseMigrationTest`: **NOT VERIFIED**; an isolated run did not finish within the session and was stopped. No pass is claimed for the broader database backup/restore suite.
- Frontend: **171 passed** across 19 test files.
- TypeScript: **passed**.
- Production build: **passed**; Vite reports the existing >500 kB chunk advisory (524.46 kB JS).
- `git diff --check`: **passed** before handoff edits; rerun before commit.
- Browser UAT: **passed for the collection/report/CSV workflow** using headless Google Chrome + Playwright and isolated QA SQLite under `.g3-03-collection-uat/appdata`. The test created a QA project, imported one structured report and one CSV, explicitly linked both source identities to one subject, created a collection, added/removed/restored the subject, refreshed/reopened, and verified two source-backed observations and the original report/CSV/subject links remained. This is synthetic mechanics UAT, not genuine owner-data acceptance. Responsive/mobile UAT is **NOT VERIFIED**.
- The screenshots are real captures from that running QA app. The matrix capture predates the final progressive-disclosure adjustment for CSV validation reasons. The final collapsed/expand behavior is verified by a frontend interaction test; a post-adjustment browser screenshot is **NOT VERIFIED** because the isolated QA server ports could not be rebound in this session.
- Screenshot 1: [membership after refresh](screenshots/g3-03-benchmark-collection/collection-membership-after-refresh.png)
- Screenshot 2: [source-backed comparison matrix (captured before validation disclosure adjustment)](screenshots/g3-03-benchmark-collection/collection-comparison-matrix.png)

## Product Acceptance

- **PO goal:** Keep a reusable, explicitly confirmed group of research subjects and compare only observations grounded in their linked report/CSV sources.
- **User journey:** Project Research → Research subjects → create collection → add confirmed subject → inspect source-backed matrix → remove/restore membership → refresh and reopen.
- **Automated work:** Persistence, project-scope checks, duplicate membership protection, source retrieval, provenance/scope/evidence display and unknown states.
- **Expected result:** A saved project collection with report/CSV source counts and attributable observations; no invented dimensions or values.
- **Remaining friction:** Trend updates are not integrated until G3-04. Subject mapping is explicit and the panel remains inside the Research Subjects disclosure. No genuine owner dataset was used.
- **Verification:** Automated backend/frontend checks, TypeScript/build and isolated Chrome UAT with screenshots above. Mobile and broad migration backup/restore are not verified here.
- **Decision:** `TECHNICAL PASS` for the report/CSV collection slice; overall G3-03 `NEEDS FOLLOW-UP` for trend-source integration. Owner acceptance remains pending.

## Limitations

- Collections use the first 100 saved subjects and first 100 collections in the current UI request; pagination controls are not exposed in this slice.
- The matrix deliberately keeps CSV dimensions dataset-specific; cross-dataset metric equivalence/aggregation is not performed.
- The full backend suite and responsive browser views were not verified.

**Implementation commit:** `e1728be7e9f76a700ab04beed021df417673c2c1`
