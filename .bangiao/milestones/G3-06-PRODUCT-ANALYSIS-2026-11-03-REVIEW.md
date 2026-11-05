# G3-06 Product Analysis — Review 2026-11-03

## Outcome

Implemented a first usable Product Analysis path inside the saved Subject Profile. It reads only reports and CSV datasets explicitly linked to that subject, presents a source-referenced analysis preview, and saves to the existing profile only after PO confirmation. It does not infer a link from product names.

The approved wireframe v4 remains a separate HTML prototype/reference. The local React app is served from this checkout by the root `run.bat`; that proves how to open the implementation, but it does not establish full v4 visual or A01–A29 acceptance.

## PO goal and journey

- **PO goal:** Understand a selected product from evidence already saved in the project and choose a useful next action.
- **Journey:** Project → Research → open a saved product profile → review linked sources → enable Codex in workspace settings if needed → click **Phân tích sản phẩm bằng Codex** → review the source-tagged preview → save it to the profile only if useful.
- **Automated work:** Retrieve exact-linked report findings and exact-ID CSV rows; keep each source, scope and uncertainty visible; request a concise analysis and preserve provenance.
- **Expected result:** Evidence, direct interpretation, hypotheses, unknowns and a practical PO action appear together for review.
- **Remaining friction:** Actual local model discovery, Codex request/save and in-app usability are pending owner UAT. The configured local database has one subject and zero explicit source links, so the PO must link a real report entity or CSV product before the successful analysis path can run; the app will not guess a link. Codex quota is used per request. The CLI's effective no-web behavior and the selected model's cost were not verified live. Source claims remain unverified; internet monitoring and source verification are not provided.

## Implementation

- `frontend/src/research/SubjectProductAnalysis.tsx` builds the analysis from explicitly linked sources, exact-matches CSV IDs, links back to each source and waits for a separate save action.
- `frontend/src/research/ResearchSubjectsPanel.tsx` hosts the action inside the existing profile and preserves existing saved notes.
- `frontend/src/research/DataFirstWorkspace.tsx` provides a single collapsed workspace-wide Codex settings section.
- `frontend/src/reports/api.ts` and `backend/app/codex_research.py` pass the source-only request flag and add tests for the prompt policy.
- `run-local.ps1` and `scripts/launcher-compatibility.ps1` require the new Product Analysis UI and Codex request schema before reusing existing servers.

## Verification

- Product Analysis / Subject Profile / Project Workspace focused frontend tests: **33/33 PASS**.
- Full frontend suite: **31 files / 271 tests PASS**, run with two workers. An earlier unrestricted parallel run had two load-sensitive failures; both files passed independently and the controlled full rerun passed.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**; existing Vite advisory at 733.80 kB minified JS.
- `tests.test_codex_research` plus `tests.test_report_migration_regression`: **6/6 PASS** using isolated test databases.
- Launcher compatibility: **23 assertions PASS**; PowerShell parser: **3/3 PASS**; Python compileall: **PASS**; `git diff --check`: **PASS** with line-ending normalization warnings only.
- Full backend integration suite: **NOT VERIFIED**; Windows AnyIO/Proactor setup stalls before collection.
- `run.bat`, live browser UAT, model catalog, Codex inference and resulting profile save: **NOT RUN** in this session. No model quota was used and no SQLite file was touched in this milestone.

## Product Acceptance

**Decision: `NEEDS FIX / OWNER RUNTIME REVIEW PENDING`.** The source paths and save mechanics have automated coverage, but no live Codex result or owner browser review occurred. Do not call this Product Pass until the owner opens the current checkout once and verifies model discovery, one request, preview, source links and save/reopen. Do not repeat model calls while fixing a launcher issue.

## Next executable task

The owner runs the root `run.bat` once to review the current Research, Report, CSV, Product Analysis, Decision and Tracking workflows. Fix any concrete runtime defect found before declaring the local acceptance session complete. Keep the approved v4 visual criteria tracked separately; this report does not claim the prototype is already ported pixel-for-pixel.
