# Research Core v1 — Acceptance Blocker Closure

Date: 2026-10-30

Branch: `feat/research-auto-presentation-v1`

Base HEAD: `604b92560ed9e3b9dae7ead41d7358cf50e99e66`

Implementation commit: this handoff is included in the local implementation commit; the final commit SHA is provided with the delivery.

## Results

| Gate | Result | Evidence |
|---|---|---|
| Entity type labels | **PASS** | Shared Vietnamese mapping is rendered in Findings, Entity, Benchmark and PO assessment. Unknown values use a neutral fallback. Stored `entity_type` remains unchanged. |
| Puzzle Finding → Project Decision → Tracking | **PASS** | Selected “Royal Match dẫn đầu doanh thu casual H1 2026” from the real report’s project decision candidates, saved `[QA TEST]` status `hold`, rationale and next action; Tracking showed the same target and values; reopen and refresh preserved all three. |
| Puzzle Entity → Benchmark → refresh/remove | **PASS** | Added Royal Match and Gossip Harbor, saw both rows and report-supplied net IAP observations with source/unverified state, refreshed with both still selected, then removed Royal Match successfully. |

**Research Core v1:** `READY_FOR_OWNER` for Product Owner review. This is a technical/browser result, not Product Acceptance. G1-01 and G1-03 remain `READY_FOR_OWNER`; G3-07 remains `NOT STARTED`; G4-01 remains `BLOCKED`; G4-02 and G4-03 remain `NOT STARTED`.

## Entity type labels

Added `displayEntityType` as a shared presentation helper. Known values such as `mobile_game_genre`, `mobile_puzzle_game`, `research_subject`, `dataset`, `competitor` and `feature` receive understandable Vietnamese labels. Unknown values display `Loại đối tượng khác`; missing/unknown markers display `Chưa phân loại`. The helper does not mutate the report data or change API/schema values.

The helper is used for entity labels in Findings, Entity, Benchmark and PO assessment. Tests cover known values, aliases, unknown/missing values, and rendered use across those report sections.

## Browser UAT

UAT used a dedicated Chrome instance and isolated services:

- Frontend: `http://127.0.0.1:15341`
- Backend: `http://127.0.0.1:15342`
- Report: `http://127.0.0.1:15341/reports/71a70e67-7f7a-4340-b41b-df2054790c64`
- Project: `QA — Puzzle 2026 Auto Presentation`
- QA database: `.auto-presentation-qa/research-core-v1-copy/data/po_intelligence_hub.sqlite3`

The QA database was created as a SQLite backup copy before test mutations. After UAT it was restored from the verified pre-test snapshot; the restored database reported `PRAGMA integrity_check = ok` and zero project opportunity decisions. The original QA database and production database were not changed by this UAT.

### Decision path and Report Notes separation

From the report Finding, the project journey retained the correct Project context to Tracking. “Xem và cập nhật quyết định” opened that Project’s decision workspace; the exact Finding candidate was selected there. The `[QA TEST]` decision appeared in Tracking with target “Royal Match dẫn đầu doanh thu casual H1 2026”, status “Tạm hoãn”, rationale and next action. Opening it again after a browser refresh showed `hold` and the exact saved text.

The separate “Ghi chú báo cáo” section identified notes as report-scoped and exposed “Mở quyết định PO của dự án”; it did not convert a report note or a report recommendation into a Project Decision.

### Benchmark path

Selected Royal Match and Gossip Harbor from the report’s Entity view and opened Benchmark. The matrix showed their source-provided “Net IAP revenue — Worldwide — September 2026” observations (91.3 million USD and 99.1 million USD) as unverified estimates, with evidence links. Other selected dimensions without an observation displayed “Chưa có dữ liệu”; no comparison values were invented. Refresh retained both selected entities. Removing Royal Match left only Gossip Harbor in the matrix.

Real-browser viewport checks were run at 1440×900 and 390×844. At 390px, `documentElement.scrollWidth` equaled `clientWidth` (390); the wide comparison matrix remained horizontally scrollable within its own container. Screenshots are direct Chrome captures of the running QA application:

| Flow | Desktop | Mobile |
|---|---|---|
| Finding details | [1440×900](screenshots/research-core-v1-closure/puzzle-finding-desktop-1440x900.png) | [390×844](screenshots/research-core-v1-closure/puzzle-finding-mobile-390x844.png) |
| Project Decision editing | [1440×900](screenshots/research-core-v1-closure/puzzle-po-decision-editing-desktop-1440x900.png) | [390×844 form](screenshots/research-core-v1-closure/puzzle-project-decision-mobile-form-390x844.png) |
| Project Decision reopened after refresh | [1440×900](screenshots/research-core-v1-closure/puzzle-project-decision-reopened-desktop-1440x900.png) | [390×844](screenshots/research-core-v1-closure/puzzle-project-decision-reopened-mobile-390x844.png) |
| Tracking after save | [1440×900](screenshots/research-core-v1-closure/puzzle-tracking-after-decision-desktop-1440x900.png) | — |
| Benchmark, two selected entities | [1440×900](screenshots/research-core-v1-closure/puzzle-benchmark-selected-desktop-1440x900.png) | [390×844, matrix](screenshots/research-core-v1-closure/puzzle-benchmark-mobile-table-390x844.png) |
| Benchmark after removing one | [1440×900](screenshots/research-core-v1-closure/puzzle-benchmark-after-remove-desktop-1440x900.png) | [390×844](screenshots/research-core-v1-closure/puzzle-benchmark-after-remove-mobile-390x844.png) |
| Report Notes | [1440×900](screenshots/research-core-v1-closure/puzzle-report-notes-desktop-1440x900.png) | — |

## Automated verification

- Focused frontend tests: **56/56 PASS** (`entityTypeLabels.test.ts` and `ResearchIntake.test.tsx`).
- TypeScript: **PASS** (`npm run typecheck`).
- Production build: **PASS** (`npm run build`). Vite reports the existing advisory that the main JavaScript chunk is over 500 kB; build completes successfully.
- Backend regression suite: not rerun; this task changed no backend code or schema.
- `git diff --check`: PASS.

## Files changed for this task

- `frontend/src/reports/entityTypeLabels.ts`
- `frontend/src/reports/entityTypeLabels.test.ts`
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/reports/ResearchIntake.test.tsx`
- `.bangiao/RESEARCH-CORE-V1-BLOCKER-CLOSURE.md`
- `.bangiao/screenshots/research-core-v1-closure/*.png`

`docs/RECOVERY_BOARD.md` was updated in the worktree, but has pre-existing uncommitted review/history edits. It is intentionally excluded from the task commit to preserve that local work. Existing unrelated `ResearchWorkspace.tsx`, `style.css`, QA data/scratch and the earlier acceptance-review package are also excluded. A missing `useRef` import in the already-modified GEO multi-select file was repaired in the worktree so TypeScript/build could run; that one-line repair and the rest of the pre-existing file diff remain uncommitted and are not part of this task commit.

## Product Acceptance

- **PO goal:** Review a genuine research finding, make a separate Project-level decision, and keep selected report entities available in a reusable comparison.
- **User journey:** Open Finding → retain Project context → open Project Decision → save → Tracking/reopen/refresh; select entities → Benchmark → refresh/remove.
- **Automated work:** Shared known Entity labels are translated for presentation; evidence/source provenance and missing values remain explicit; decision and benchmark persistence are exercised through the existing UI and API.
- **Expected result:** The Project Decision is attached to the selected report finding and visible after refresh in Tracking; selected benchmark subjects remain and can be removed without changing source observations.
- **Remaining friction:** Product Owner visual and business acceptance is still pending. The matrix is sparse where the report supplies no observation; those cells correctly remain “Chưa có dữ liệu”.
- **Verification:** Focused frontend tests, TypeScript, production build, actual Chrome UAT at desktop/mobile, refresh/reopen, screenshot review, and QA clone restore were completed.
- **Decision:** **TECHNICAL PASS — READY_FOR_OWNER.** No Product Acceptance is claimed.
