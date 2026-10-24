# M5-A — Evidence-Backed PO Decision Workspace

## Delivery

- Branch: `feat/ux-recovery-01-research-results`
- Base reviewed: `2bfc8127268c371d798c16176623a3313647eb36`
- Commit SHA: `e7d8846f32745243616c6c8225ff69c79903022d`.
- Push: pending.
- Production SQLite: not used or modified.

## What changed

Added an evidence-backed opportunity review workflow. A PO can review shortlisted products, inspect source observations and evidence gaps, explicitly attach report findings, record a classified assessment, choose a decision and priority, write rationale/open questions/next action, and reopen the saved decision.

Decisions persist independently from shortlist membership. Clearing or changing the shortlist does not erase the saved decision history. The current decision is matched by workspace project and stable source identity. Source observations use dataset hash plus source row identity; report findings require an explicit selection and are tied to the report content hash and finding key. Similar display names never create an automatic link.

Evidence and PO judgment remain distinct. Imported CSV and report-supplied values remain unverified. Source scope is retained, including `Unified` as provided; it is not translated into Android or iOS. Stale references remain reviewable and are not presented as current measurements. The workflow does not write to Research Runs/manifests, original reports, benchmark selections, or existing report assessment notes.

An additive Alembic migration creates `po_opportunity_decisions`. Updates use revisions to detect stale concurrent saves. Invalid or forged evidence references are rejected.

## Changed files

- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/opportunities.py`
- `backend/app/schemas.py`
- `backend/migrations/versions/20261024_0009_po_opportunity_decisions.py`
- `frontend/src/main.tsx`
- `frontend/src/research/DataFirstWorkspace.tsx`
- `frontend/src/research/api.ts`
- `frontend/src/research/OpportunityReview.tsx`
- `frontend/src/research/OpportunityReview.test.tsx`
- `frontend/src/style.css`
- `tests/test_database.py`
- `tests/test_workspace_data_first.py`
- `.bangiao/M5A-PO-DECISION-WORKSPACE.md`

The pre-existing user edit to `scripts/setup.ps1` was preserved and is not part of this task commit.

## API and persistence

- `GET /api/v1/projects/{project_id}/opportunities` returns shortlist candidates, source observations, saved decision state, and evidence gaps.
- `PUT /api/v1/projects/{project_id}/opportunities/decisions` saves the PO decision and explicit evidence references. A stale revision returns a conflict rather than silently overwriting another save.
- Migration `20261024_0009_po_opportunity_decisions` is additive. It does not rewrite existing report, run, benchmark, or dataset records.

## Test results

- Backend: `pytest` — 140 passed, 1 dependency deprecation warning.
- Frontend: `npm test` — 15 test files, 144 tests passed.
- TypeScript: `npm run typecheck` — passed.
- Production frontend build: `npm run build` — passed.
- Migration: isolated UAT database upgraded through `20261024_0009`; `alembic current` reported the same head.
- `git diff --check` — passed.

Backend coverage includes resolved quantitative evidence, invalid/forged reference rejection, preserving decisions after shortlist replacement or clearing, explicit report-finding attachment, retaining report notes and benchmark state, source-only candidates, and stale revision conflicts. Frontend coverage includes explicit linking, null/optional evidence reference round-trip, save/retry states, stale decisions, and avoiding name-based report matching.

## Browser UAT

Browser UAT ran in an isolated local workspace using copies imported from the two PO-provided Sensor Tower CSV files. The original CSVs and production database were untouched. The flow created a shortlist, reviewed imported observations, saved a PO decision, refreshed, changed the active shortlist, and reopened the historical decision. Rationale, assessment, next action, open question, and evidence references persisted. The CSV observation remained labeled unverified and its `Unified` platform scope was preserved.

A synthetic report was added only to the isolated UAT database to exercise explicit mixed CSV/report evidence linking. It is labeled as a synthetic fixture and contains no product or market claim. After save and refresh, the browser showed both evidence items selected and restored the PO decision fields. No genuine PO-supplied structured research report was available for this mixed-source scenario; this portion is verified only with the clearly labeled fixture.

Responsive browser checks were performed at 1440, 768, and 390 CSS pixels. The candidate list was changed to one column below 900px after the 768px check showed the two-column version was too narrow. At 768px and 390px, measured document/body widths did not exceed the viewport. The page remained navigable and evidence controls were accessible. 1024px was not separately verified.

Real screenshots were captured in the Codex in-app browser during the UAT, but the browser tool did not provide a repository file path or screenshot export operation. Therefore no screenshot files are included; browser screenshots are not claimed as committed artifacts.

## Product Acceptance

- **PO goal:** Make a source-backed product opportunity review usable without editing JSON or losing decisions when the shortlist changes.
- **User journey:** Open shortlisted opportunities → inspect source observations/gaps → optionally choose a report and finding → classify evidence → record decision, priority, rationale, open questions, and next action → save → refresh or change shortlist → reopen the decision.
- **Automated work:** Loads shortlist candidates, source observations and saved decisions; validates explicit evidence references; preserves history; detects stale revisions; reports evidence gaps without inventing missing values.
- **Expected result:** A product-by-product PO decision view with traceable, scope-preserving evidence and persisted PO judgment.
- **Remaining friction:** Report findings must be explicitly chosen. Imported/source-reported numbers are not independently verified. Real structured-report mixed-source UAT remains outstanding because no actual PO report was available. Screenshots were not exportable to committed files.
- **Verification:** Backend and frontend suites, typecheck, production build, additive migration, and actual browser workflows using isolated SQLite data and the two owner-provided CSV exports. Tested at 1440, 768, and 390px. No production data was changed.
- **Decision:** `PRODUCT PASS` for the tested M5-A decision workflow. Mixed-source report verification with a genuine PO report and 1024px browser verification remain limitations; neither is represented as completed.

## Known limitations

- Evidence references do not independently verify the underlying claims.
- Historical decision records are retained after shortlist membership changes; stale references are labeled for review and do not expose stale measurements as current.
- The mixed-source report path was tested with a synthetic isolated fixture, not a real owner report.
- Browser screenshots were inspected live but could not be saved under the repository screenshots directory.
- No M5-B or later workflow was started.
