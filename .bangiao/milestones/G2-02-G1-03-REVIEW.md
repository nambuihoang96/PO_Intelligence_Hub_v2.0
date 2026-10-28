# G2-02 and first G1-03 application pass — 2026-10-28

## QA environment diagnosis

A minimal Python HTTP server was the control case. In the restricted command environment, the server printed `BIND_BEGIN` and `netstat` showed PID 37988 listening on `127.0.0.1:15311`, but a Windows-host Python HTTP request timed out and Browser Use returned `ERR_CONNECTION_TIMED_OUT`. The same probe launched with Windows-host execution permission returned HTTP 200 and body `QA_HTTP_OK`; Browser Use displayed that body. Root cause: loopback isolation between sandbox-launched and host/browser processes. This was not a PO Hub/Uvicorn app error.

Uvicorn itself works when launched in the host context: startup logs show `Application startup complete` and `Uvicorn running on http://127.0.0.1:15311`. Vite runs on 15310 with `DEVCREW_UAT_API_TARGET=http://127.0.0.1:15311`. QA database is `.peachy-g1-qa-20261028/po_intelligence_hub.sqlite3`; migrations were applied there only. Old QA services 15295/15296 were inspected and left untouched.

## G2-02 verification and implementation

- Created a clearly labelled `[QA] Peachy Studio UAT` project in isolated QA.
- From Project Home, used the saved report import entry point, imported one synthetic text-only report, and confirmed the report opened with the project context.
- Returned from report to the same Project Home; the same report ID appeared in the saved reports and recent activity. Reopened it from Project Home.
- Corrected the `Dự án` breadcrumb so a project-linked report returns to `/research?projectId=...`, rather than the global root.
- Reworded the three Project Home actions to the approved business language: `Nghiên cứu chuyên sâu`, `Lưu thông tin`, `Phân tích CSV`.
- Existing explicit legacy report-linking and project-filter tests/UAT are recorded in `.bangiao/P0-PROJECT-REPORT-UNIFICATION.md`.
- Browser UAT: desktop PASS. Synthetic report only. No production SQLite use.

## G1-03 first application pass

Read all three approved files in `docs/design/approved/peachy/`: dashboard, workflow flowchart, and storyboard. The files are directionally consistent. UI UX Pro Max is installed and was previously read; the implementation follows its token, semantic control, contrast, focus and responsive-table guidance.

Applied Peachy shared token reuse and scoped warm sidebar/background/surface styling to the actual Project Home and Report Reader. This is an initial implementation, not finished design acceptance. Screenshot comparison shows improved warm palette and navigation alignment, while the overall Results composition still differs from the mockup. Mobile viewport is NOT VERIFIED because no viewport control is exposed in the current Browser Use API.

Screenshots from the running QA app:

- `.bangiao/screenshots/g2-g1-peachy/project-home-peachy-desktop.png`
- `.bangiao/screenshots/g2-g1-peachy/report-reader-peachy-desktop.png`

## Verification

- Frontend full suite, single worker: **26 files / 221 tests PASS**. Parallel run caused unrelated test timeouts under load; serial run passed.
- Focused research/report integration suites: **46 tests PASS**.
- TypeScript and production build: **PASS**; Vite retains its existing >500 kB chunk-size advisory.
- QA browser requests reached frontend and backend through Vite proxy, and the create-project/list/import/report/project-return workflow completed.
- Mobile Browser UAT: **NOT VERIFIED**.

## Product Acceptance

- **PO goal:** Start work in a Project and find the same saved report when returning to it.
- **User journey:** Project Home → choose one of three actions → import report → review → return to the same Project → reopen the same report.
- **Automated work:** Preserve project/report identity and route context; keep saved items in Project Home.
- **Expected result:** A single project owns the report context; the same report ID remains visible and reusable.
- **Remaining friction:** Project Home and Report Reader only received a first visual pass; the Report Reader still has structural differences from the approved Peachy mockup. Mobile visual check and broader saved-information/CSV journeys remain open.
- **Verification:** Browser desktop workflow on isolated QA, 221 frontend tests, TypeScript and build.
- **Decision:** G2-02 `TECHNICAL PASS / OWNER REVIEW PENDING`. G1-03 `DEV_IMPLEMENTED / BROWSER UAT desktop only / NEEDS FURTHER VISUAL ITERATION`; not PRODUCT PASS.

## Commits

- Recovery Board and QA diagnosis: `2160d9c` (separate documentation commit).
- G2-02/G1-03 code and tests: `b15cc9b`.
