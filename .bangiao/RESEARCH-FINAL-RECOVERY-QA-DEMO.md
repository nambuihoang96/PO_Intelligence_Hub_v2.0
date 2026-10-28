# Research Final Recovery + Persistent QA Demo

Date: 2026-10-29
Branch: `feat/ux-recovery-01-research-results`
Starting HEAD: `bff572fa5c7885b42a6b8243071fc7a63000713b`
Status: `TECHNICAL PASS — QA demo / OWNER REVIEW PENDING`

## 1. Demo entry point

The following routes were opened in the actual QA app in the Codex in-app browser. They depend on the task-owned QA services still running at frontend `127.0.0.1:15313` and backend `127.0.0.1:15312`; the app is configured to use the isolated database at `.research-final-qa-demo-20261029/po_intelligence_hub.sqlite3`.

| Destination | QA URL |
|---|---|
| Project Home | `http://127.0.0.1:15313/research?projectId=09eb2703-22f3-4ced-aa6f-ee1767e56f9e` |
| Structured report | `http://127.0.0.1:15313/reports/95e4fb2e-bfcf-43ab-b2df-7f5c0bd96d1c` |
| Single-finding report | `http://127.0.0.1:15313/reports/44bef852-7645-4ec6-b516-5d2132a3bd48` |
| Text-only report | `http://127.0.0.1:15313/reports/3dfd648e-67ac-4b9c-b864-7f5c0bd96d1c` |
| Findings | `http://127.0.0.1:15313/reports/95e4fb2e-bfcf-43ab-b2df-7f5c0bd96d1c?section=insights` |
| Entities | `http://127.0.0.1:15313/reports/95e4fb2e-bfcf-43ab-b2df-7f5c0bd96d1c?section=entities` |
| Report Benchmark | `http://127.0.0.1:15313/reports/95e4fb2e-bfcf-43ab-b2df-7f5c0bd96d1c?section=benchmark` |
| Report notes | `http://127.0.0.1:15313/reports/95e4fb2e-bfcf-43ab-b2df-7f5c0bd96d1c?section=decisions` |
| Project Decision | `http://127.0.0.1:15313/research?projectId=09eb2703-22f3-4ced-aa6f-ee1767e56f9e&view=opportunities` |
| Tracking | `http://127.0.0.1:15313/tracking?projectId=09eb2703-22f3-4ced-aa6f-ee1767e56f9e` |

Persistent QA IDs:

- Project `09eb2703-22f3-4ced-aa6f-ee1767e56f9e`
- Reports A/B/C as listed above
- Report-linked benchmark collection `430e2635-3dff-48b0-8dc4-ba6e3d5a3afa`
- Two selected research subjects: `03e1d674-8f0f-47ea-b936-25f0828bf073`, `9cea14bb-f637-4d53-8069-dc1a4638538f`

Seed command (from repository root):

```powershell
.venv\Scripts\python.exe scripts\seed_research_qa_demo.py --qa-root .research-final-qa-demo-20261029 --confirm-qa --api-base http://127.0.0.1:15312 --frontend-url http://127.0.0.1:15313
```

The command requires an explicit QA confirmation, rejects remote API origins and the default production database location, and uses deterministic reserved IDs to safely reuse records. It does not delete/reset records. Run it only with the QA service and QA root above. The banner is enabled only with `VITE_QA_DEMO_MODE=true`.

## 2. Wireframe comparison

References: `docs/design/approved/peachy/POHub_Findings_Peachy.png` and `POHub_Entity_Benchmark_Peachy.png`. Screens below are real browser captures of the running app, not generated mockups. The visible research text is conspicuously synthetic QA fixture content.

| Reference screen | Actual screenshot | Matched | Remaining differences |
|---|---|---|---|
| Findings — list plus contextual detail | `.bangiao/screenshots/research-final-recovery-qa-demo/findings-multiple-desktop-1440x900.png`, `findings-multiple-mobile-390x844.png` | Multiple items select into the corresponding detail; finding, evidence state, unknowns and report-supplied implication stay together; mobile is stacked. | Existing report shell and navigation remain; demo prose is intentionally fixture-like and has no genuine source claims. |
| Finding — direct single-item view | `finding-single-desktop-1440x900.png`, `finding-detail-mobile-390x844.png` | No redundant one-row selector; evidence remains explicitly unverified; original-report support and report suggestion are distinct. | The fixture is compact and does not reproduce decorative reference artwork. |
| Entity — multiple/single item | `entity-multiple-desktop-1440x900.png`, `entity-single-desktop-1440x900.png`, `entity-detail-mobile-390x844.png` | Domain-neutral object names/types, report links, findings and evidence context; selected object can open the correct benchmark context. | The wireframe has richer visual grouping. Sparse entity properties remain sparse; no icons, metrics or app identity were invented. |
| Benchmark with two subjects | `benchmark-desktop-1440x900.png`, `benchmark-mobile-390x844.png` | Selected subjects and supplied dimensions render; missing observations remain unknown and fixture sources remain unverified. | On mobile, the comparison matrix scrolls within its contained region rather than squeezing columns. |
| Project home / saved decision | `project-home-desktop-1440x900.png`, `project-home-mobile-390x844.png`, `project-decision-desktop-1440x900.png`, `tracking-desktop-1440x900.png` | Three agreed actions, saved reports, comparison, subjects and project decision are distinct; the demo warning is prominent. | Synthetic project/report labels visibly differ from the approved content examples. |
| Report notes | `report-notes-desktop-1440x900.png`, `report-notes-mobile-390x844.png` | Report-level note is clearly separate from the official Project Decision. | Report note persistence reuses the existing workspace API; no new decision backend was added. |

All listed screenshots reside in `.bangiao/screenshots/research-final-recovery-qa-demo/`. Mobile captures were made at CSS viewport 390×844; checks reported `innerWidth=390`, `innerHeight=844`, `clientWidth=390`, and `scrollWidth=390`. A contained horizontal benchmark table is intentional and did not widen the page.

## 3. Research browser UAT

| Journey | Result | Evidence |
|---|---|---|
| Project Home → open saved report → same Project | PASS | Project Home AX tree lists the seeded report links under the same Project ID; browser navigation retained the report/project context. |
| Structured report → Findings → linked Entity → return to same Finding | PASS | Opened the explicit related entity, verified its heading, then returned to the selected finding. New deep links accept `?section=` for directly opening a report section. |
| Report A → Benchmark with two subjects | PASS | Both selected subjects and report dimensions were visible. Unknown values stayed missing; sources stayed unverified. |
| Report B single item | PASS | Direct detail rendered without a one-item selector. |
| Report C text-only | PASS | No fabricated finding/entity was shown; the text-only/structuring state remained explicit. |
| Report note → save → refresh → reopen | PASS | Edited report-level assessment/note/next action, saved through existing API, reloaded and confirmed all values persisted with the success message “Đã lưu ghi chú báo cáo.” |
| Comparison membership remove → refresh → restore → refresh | PASS | Membership state persisted through reload; report notes remained intact. |
| Project Hold decision → Tracking → refresh | PASS | Saved status, rationale, next action and review date reopened for the same Project target. |
| Mobile navigation and page width | PASS | Actual app checked at 390×844; document width equaled viewport width for Project Home and report pages. |
| Browser console | PASS | No error or warning entries were present on the inspected QA app tab. |
| Genuine owner report | NOT VERIFIED | The isolated library had three seeded synthetic records and two existing `[QA ONLY]` fixtures. No genuine long-form report was found in accessible workspace documents. **REAL REPORT UAT PENDING — NEED OWNER INPUT.** |

One QA fixture uses reserved `https://example.invalid/...` links explicitly marked unverified. One such link was inadvertently clicked during UAT and opened a browser error page (`ERR_NAME_NOT_RESOLVED`). No genuine site/source content was loaded, no source was verified, and no research claim was based on the link. This was an execution mistake; future evidence checks should inspect the label/location without following the URL.

## 4. Data integrity

- Seed ran more than once and reused the same project/report/collection/subject IDs; it reported no deletes or resets and did not create duplicate report records.
- Seed used existing local API routes and a QA-only copy at `.research-final-qa-demo-20261029/po_intelligence_hub.sqlite3`; production SQLite was not accessed.
- Original report text and report IDs were preserved. Report-level notes and Project-level decisions are separate persisted scopes.
- Evidence/source references are fixture references and remain `unverified`. Missing benchmark data remains unknown; it is never converted to zero.
- Existing QA project data was copied into the isolated QA DB before seeding; no production data was imported, modified or reset.
- No backend schema or migration changed. No immutable Research Run manifest was edited.

## 5. Engineering and checks

Changed implementation files:

- `frontend/src/main.tsx` — QA-only banner flag.
- `frontend/src/peachyStudio.css` — banner styling.
- `frontend/src/reports/ReportResults.tsx` — section deep-link state, report note semantics, contextual finding→entity navigation and return path.
- `frontend/src/reports/ResearchIntake.test.tsx` — note persistence semantics and finding/entity context tests.
- `frontend/src/vite-env.d.ts` — Vite TypeScript environment reference.
- `scripts/seed_research_qa_demo.py` — guarded, idempotent API-based QA seed.

Checks after the final code patch:

- Frontend: `npm.cmd run test` — **26 files, 231 tests passed**.
- TypeScript: `npm.cmd run typecheck` — **PASS**.
- Production build: `npm.cmd run build` — **PASS**; existing Vite advisory for the ~628 kB JS chunk remains.
- Backend regressions (`test_reports.py`, `test_workspace_data_first.py`, `test_benchmark_collections.py`, `test_subjects.py`) — **60 passed, 1 warning**. Initial run was blocked by restricted Windows temp-folder permissions; rerun with TEMP/TMP under the local QA workspace passed.
- QA seed Python compile — **PASS**.
- `git diff --check` — **PASS**.
- Migrations: no new migration; existing migration chain was exercised by the focused temporary-DB tests. Production database was not migrated or opened.

Current QA browser tab remains open at Project Home. In this turn, a separate PowerShell socket probe returned “access forbidden” for localhost even though the real in-app browser tab continued to load the QA app. Browser UAT evidence is therefore attributed to the real browser interactions, not to that shell probe. No QA or unrelated process was killed.

## 6. Data Analysis preparation

Read-only inventory and next safe sequence: [DATA-ANALYSIS-PREPARATION.md](DATA-ANALYSIS-PREPARATION.md). This task did not implement new analytics features.

## 7. Next action

1. Keep G2-04 genuine-report acceptance pending until an accessible genuine owner report is available; do not relabel a QA fixture.
2. Continue with the Recovery Board's next approved independent item: G3-06 exact desktop/390px browser verification of the existing subject profile/analysis workflow. This handoff does not mark that item done.
3. Keep G1-01/G1-02/G1-03 owner review pending; do not infer acceptance from this QA demo.

## Product Acceptance

- **PO goal:** reopen and experience a complete Research workflow without manually constructing demo findings, entities, evidence or benchmark links.
- **User journey:** QA Project → report → finding/evidence → linked entity → benchmark → report note or Project Decision → Tracking → refresh/reopen.
- **Automated work:** deterministic synthetic QA seeding, an explicit QA banner, report section deep links and contextual navigation; existing storage APIs handle notes, membership and decisions.
- **Expected result:** QA data is persistent, navigable and clearly labeled, with missing/unverified evidence shown honestly.
- **Remaining friction:** genuine report UAT remains pending; all G1 product visual acceptance remains with the Product Owner; the linked example.invalid page incident is disclosed above.
- **Verification:** frontend tests, TypeScript, production build, focused backend regressions, actual browser workflows and real desktop/mobile screenshots as itemized above.
- **Decision:** `TECHNICAL PASS` for the persistent QA demo; `NEEDS FIX / OWNER INPUT` for genuine-report acceptance. This is not `PRODUCT PASS` and not Product Owner acceptance.

## Commit

Implementation and evidence commit: `d113adfd030e7f8f503bf6d44e61d25e44b36c97` (`feat: add persistent research QA recovery demo`). Recovery Board update is included in that commit. No push, merge or deploy was performed.
