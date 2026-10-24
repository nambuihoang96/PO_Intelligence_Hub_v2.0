# M4 R1 — Data-first Shortlist Persistence & Workflow Acceptance

## Delivery status

- Branch: `feat/ux-recovery-01-research-results`
- Starting HEAD: `49d9e44b6391418f1e3944031434008a3a282016`
- Implementation commit: pending
- Push: pending
- Master merge: not performed
- Scope: M4 R1 only; no M5 work started.

## Root cause and changes

The shortlist previously persisted product references without durable context tying them to the source dataset, exact selection rule, measurement scope, and source rows. A prompt could therefore drift from the file that produced the shortlist. The research workspace also lacked a direct report-independent CSV import route and long dataset/report lists were not fully navigable.

This change stores a bounded `selected_app_context` alongside the existing workspace state. It records the dataset identity/hash, manual or rule-based selection type, exact criterion, scope/methodology, source entity references, and observation row references. It does not copy raw CSV content into workspace state. Existing state fields are merged and retained; legacy shortlists do not receive fabricated provenance. Explicitly clearing context removes only this field.

The prompt is generated from the persisted source context, so it identifies the originating dataset and exact scope, includes selected source references, and retains the unverified status. Dataset switching does not silently reinterpret an existing selection; starting a new shortlist is an explicit user action.

The workspace now supports paginated dataset and report lists. Compare Periods can import CSV files directly into the active workspace without requiring a report selection; the existing report-scoped import route remains available.

## API and persistence

- `PUT /api/v1/projects/{project_id}/workspace-state` accepts optional `selected_app_context` while retaining existing request compatibility.
- Context validation limits serialized size to 64 KB, requires a supported selection type and dataset ID, and caps source entity references at 500.
- Context is stored within the existing workspace JSON state. No database schema migration or table changes were made.
- Existing qualitative report, report-scoped CSV, benchmark, PO note, and Research Run storage paths were not modified by this task.

## Files changed

- `backend/app/schemas.py`
- `backend/app/workspace_data.py`
- `frontend/src/reports/QuantitativePeriodComparison.tsx`
- `frontend/src/reports/QuantitativePeriodComparison.test.tsx`
- `frontend/src/reports/api.ts`
- `frontend/src/research/DataFirstWorkspace.test.tsx`
- `frontend/src/research/DataFirstWorkspace.tsx`
- `frontend/src/research/api.ts`
- `tests/test_workspace_data_first.py`
- `.bangiao/M4-R1-DATA-FIRST-PRODUCT-ACCEPTANCE.md`

User-owned `scripts/setup.ps1` changes and scratch directories were preserved and excluded from the task commit.

## Verification

- Backend full suite: **135 passed**, 1 deprecation warning.
- Frontend full suite: **139 passed** across 14 files.
- TypeScript typecheck: **passed**.
- Production frontend build: **passed**.
- `git diff --check`: **passed** (Git reported line-ending conversion warnings only).
- No migration was needed. UAT used a separate SQLite database and did not modify production SQLite.

### Browser workflow exercised

Using the running local application with isolated SQLite workspace `5a231ee3-48eb-4527-85be-98ed526fe88b`:

1. Imported both supplied Sensor Tower exports (225 observations each) and checked their provenance and validation.
2. Selected five actual products manually from one owner CSV, refreshed, and confirmed the shortlist and source context persisted. Switching the active dataset did not silently change that shortlist.
3. Checked the generated prompt against the source file identity, scope, selected entities, periods, observation references, and unverified status.
4. Imported a clearly labeled synthetic structured report into the workspace, opened it, refreshed, and confirmed it remained linked while the CSV shortlist was retained. Its example URL was not fetched and remained unverified.
5. Imported two clearly labeled synthetic compatible CSV periods through workspace Compare Periods; verified a 3-entity × 2-period comparison, missing/review states, and evidence navigation.
6. In a separate clearly labeled synthetic fixture, exercised the exact-metric “Select Top 5” rule and verified the selected entities, criterion, source references, metric/scope/period, and prompt survived refresh. The UI stated this was not a market-wide ranking.
7. Checked real browser layouts at 1440, 768, and 390 px. The document did not overflow horizontally; comparison evidence remained accessible and mobile rows stacked. Other viewport sizes were not verified.

The browser UAT used actual supplied CSVs for import and provenance checks. The structured-report and compatible-period scenarios used synthetic test-only data; they do not establish the accuracy of market research.

Screenshots were inspected during the live Codex browser session, but were not saved as repository image files. No screenshot files are claimed as deliverables.

## Real CSV limitations

The two supplied Sensor Tower files imported and persisted. Their exports use `Unified` as supplied and were not relabeled as Android or iOS. They omit methodology metadata, contain incomplete observation coverage, have unequal period lengths, and the later file’s period end is in the future relative to the UAT date (2026-10-24). The application correctly did not allow an automatic comparable Top 5/ranking or period comparison from these files. A PO can still make an explicit manual shortlist with its source context retained.

## Known limitations

- There was no actual PO-provided ChatGPT research report available for this UAT; report-link persistence was exercised with an explicitly synthetic structured report.
- Screenshots were not persisted to the repository.
- Cross-workspace/global report-search behavior and viewport widths not listed above were not part of this task’s UAT.

## Product Acceptance

- **PO goal:** Build a shortlist from a particular imported dataset and continue research without losing what the selection means or where it came from.
- **User journey:** Import/select a dataset → choose products manually or through an eligible deterministic rule → review the exact scope and source references → create a prompt anchored to that file → import/link a report in the same workspace → compare additional CSV periods where compatible → refresh and reopen.
- **Automated work:** Persist shortlist provenance and rule context, validate bounded references, paginate catalogs, construct a source-anchored prompt, and retain workspace-scoped CSV imports without requiring a report.
- **Expected result:** The PO can reopen the same shortlist with its original dataset, criterion, measurement scope, and row references. Ineligible data is not presented as a verified ranking or comparison.
- **Remaining friction:** The owner CSV exports lack fields needed for automatic comparability; methodology or period details may need explicit confirmation. Report workflow was verified using synthetic structured data because a genuine PO research report was unavailable. Browser screenshots were not saved in the repository.
- **Verification:** Backend/frontend suites, typecheck, production build, and isolated-browser UAT described above were run. Production SQLite was not used.
- **Decision:** **PRODUCT PASS for the shortlist persistence and workflow tested; research accuracy is not assessed from the synthetic report/period fixtures.**
