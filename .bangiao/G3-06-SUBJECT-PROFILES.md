# G3-06 — Subject Profile & Extensible Analysis Sections

**Status:** `DEV_DONE — profile workflow plus source-linked Product Analysis MVP; one-run runtime UAT pending; Product Acceptance not claimed`
**Branch:** `feat/ux-recovery-01-research-results`
**Starting HEAD:** `127980bac588fde4beaf04cc5b19d513a9d3cb80`
**Implementation commit:** `bd69a72b617cf194c4e067fabacf1f27731fc1e2`
**Production SQLite:** not accessed or modified.

## Outcome

Saved Project Research subjects now have an expandable profile that keeps their identity, aliases, external identifiers, provenance, linked source/collection context, and optional PO-authored analysis together. The PO can add the suggested Core Loop, Level Design, or Ad Placement sections, or create any custom section name. These sections are stored separately from source-reported research and are explicitly labeled as unverified PO notes.

The analysis contract is a list of generic `{ key, label, content }` sections, not a fixed domain taxonomy. Sections can be edited, added or removed in a draft, saved through the existing subject update API, and reopened after refresh. Existing subject records receive an empty list through an additive migration. Existing subject identity and evidence links remain intact.

## Implementation

- Additive Alembic revision `20261027_0014_subject_analysis_sections` adds a non-null JSON column with an empty-list default to `research_subjects`.
- `ResearchSubjectUpdate` validates nonblank section fields, unique keys, at most 30 sections, and rejects explicit `null` (use an empty list to clear sections).
- Existing create/read/update subject routes carry the optional analysis sections; no new endpoint or backend architecture was added.
- The Research Subjects panel offers expandable profiles, source identity detail disclosure, linked workspace navigation, suggested starter blocks, custom extensible sections, unsaved/saving/saved/error feedback, and a discard-draft action.
- Added project anchors for the existing Trend Updates, Image Evidence and Benchmark Collections panels to support profile navigation.

## Files changed

- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/subjects.py`
- `backend/migrations/versions/20261027_0014_subject_analysis_sections.py`
- `frontend/src/research/ResearchSubjectsPanel.tsx`
- `frontend/src/research/ResearchSubjectsPanel.test.tsx`
- `frontend/src/research/TrendUpdatesPanel.tsx`
- `frontend/src/research/ImageEvidencePanel.tsx`
- `frontend/src/research/api.ts`
- `frontend/src/style.css`
- `tests/test_subjects.py`

## Verification

- Focused backend regression: **33 passed** across `test_subjects.py`, `test_image_evidence.py`, `test_trend_updates.py`, `test_benchmark_collections.py`, and `test_workspace_data_first.py`.
- Frontend suite: **177 passed** across 21 test files.
- Targeted subject profile frontend suite: **5 passed**.
- TypeScript check and production build: **PASS** (`npm run build`). Vite reported the existing large-chunk advisory; the emitted JavaScript bundle is 543.75 kB.
- Migration compatibility: **PASS** in an isolated temporary SQLite database. The test downgraded to revision `20261027_0013`, inserted a legacy subject, upgraded to head, and confirmed the subject receives an empty analysis list.
- Browser UAT: **NOT VERIFIED**. No real browser interaction or screenshots were executed for this slice.
- Production database: untouched.

## Product Acceptance

- **PO goal:** Keep a reusable subject profile and add lightweight, domain-neutral PO analysis without mixing it with source evidence.
- **User journey:** Open Research Subjects → open a saved profile → add a suggested or custom section → edit notes → save → close/reopen the profile.
- **Automated work:** The API validates section shape/limits, persists the sections with the existing subject, returns them on read, and applies an empty default for older records.
- **Expected result:** PO-authored analysis reopens after refresh while source identity, provenance and evidence remain separate.
- **Remaining friction:** Browser-level usability and responsive behavior have not been verified; sections are subject-scoped notes, not a decision/action lifecycle.
- **Verification:** Focused and full frontend tests, focused backend regressions, production TypeScript/build, and isolated migration upgrade coverage passed. Browser UAT is NOT VERIFIED.
- **Decision:** `TECHNICAL PASS`; `PRODUCT NEEDS OWNER REVIEW`.

## Limitations

- Starter labels are optional conveniences only; custom section names remain available and no category is required.
- This does not add AI interpretation, OCR, source verification, action management, or cross-subject analysis.
- Browser screenshots and UAT remain outstanding.
- Implementation commit: `bd69a72b617cf194c4e067fabacf1f27731fc1e2`.

## Feedback round — product-first follow-up workflow — 2026-10-28

- **Owner direction:** Rework the subject profile around a coherent product/topic history and in-context follow-up research questions, not database-like analysis forms. Preserve existing saved profiles, analysis sections and explicit links.
- **Change:** The profile now presents one follow-up question field with one save action. Other analysis notes remain editable under a collapsed “Ghi chú phân tích khác” section. The existing analysis-sections API/contract remains unchanged; no migration/backend edits.
- **Browser UAT:** On the isolated QA project at `http://127.0.0.1:15310`, saved a clearly labeled QA-only follow-up question, refreshed, reopened the same profile and verified it remained. Existing custom-analysis content and the QA trend history remained accessible. Browser inspected at 375px; no page-level horizontal overflow was visible in the captured viewport. Exact 390px and desktop screenshots were not saved and are NOT VERIFIED.
- **Tests:** Focused profile suite 12/12 PASS; full frontend suite 26 files / 223 tests PASS; TypeScript PASS; production build PASS with the existing large-chunk advisory; `git diff --check` PASS.
- **Implementation commit:** `7bea79efc3a274b746baab296459ab628f0d345c`.
- **Status:** `DEV_DONE` for this scoped rework; owner review pending. This does not mark G3-06 Product Accepted.

## 2026-11-03 exact responsive visual recheck

- **QA data:** Used the existing `[QA DEMO] Puzzle Research — US Android 2026` project from `.research-final-qa-demo-20261029` through a fresh clone under `.codex-qa-ux-delivery-tmp/g306-visual-2026-11-03`. The clone was upgraded additively from `20261027_0015` to `20261102_0016` because current code reads the new report lineage columns; the original QA database was untouched. Opened the existing subject profile and read the previously saved `[QA ONLY] Follow-up question for responsive profile verification — 2026-10-29`; no field was edited or saved.
- **Visual corrections:** At 320px, `body` retained a 320px minimum while the classic scrollbar reduced the document client width to 305px, causing a page-level horizontal bar. `peachyStudio.css` now removes that minimum width for Research pages at ≤560px. The collapsed profile header showed its subject type run together with the name; `style.css` now places the type label below the product name.
- **Browser verification:** Actual app at 1440×900, 390×844 and 320×700. Document/client widths: 1425/1425, 375/375 and 305/305. The profile, provenance and in-context links remained visible; the saved question fit at mobile sizes and the save button stayed disabled without edits. The 320px horizontal bar was absent after the CSS change. Desktop and mobile captures were visually inspected in-session but not saved to files.
- **Build and diff:** `npm run build` passed, including TypeScript; existing large JavaScript chunk advisory remains (677.62 kB). `git diff --check` passed with only line-ending normalization warnings in the dirty worktree.
- **Product Acceptance:** **PO goal:** keep a product/topic profile readable and add a next research question without mixing it with source evidence. **User journey:** open the QA profile, review source/collection context and the persisted question at desktop/mobile sizes. **Automated work:** responsive rules keep the page within the viewport and distinguish the profile name from its type. **Expected result:** profile sections and saved PO note are readable; no data is changed during visual review. **Remaining friction:** screenshot artifacts are not saved; QA evidence is synthetic and does not establish genuine-source acceptance or broader mobile save journeys. **Verification:** exact browser visual checks at 1440×900, 390×844 and 320×700 plus successful current build. **Decision:** `TECHNICAL PASS / OWNER REVIEW PENDING`; no Product Pass claimed.

## 2026-11-03 owner feedback — Product Analysis reopened

- **Owner direction:** Research may not consume more than today and tomorrow; the remaining roadmap must move forward, especially Product Analysis.
- **Classification / affected work:** Rework this existing G3-06 task. The completed profile work is useful persistence for unverified PO-authored notes, but it does not yet deliver a Product Analysis outcome. No duplicate backlog task is created.
- **Impact / preservation:** Keep subject identity, aliases, evidence links, analysis sections, follow-up question, trend history and all existing records. The earlier visual UAT remains valid only for that narrow layout check.
- **Revised acceptance:** From a saved product profile, the PO can identify a useful product insight; inspect the report passage or compatible CSV source that supports it; distinguish source-reported information from a PO hypothesis; see unknowns/limitations; and decide a concrete next action. Core Loop, onboarding/progression, monetization and ad placement can use the approved optional sections, but must not become empty mandatory forms. No metric can be inferred from a label or incompatible source.
- **Next step:** After the timeboxed Research closeout on 2026-11-04, scope the smallest Product Analysis MVP against existing report, subject and CSV data paths, then implement and verify its end-to-end desktop journey. Product acceptance remains `NEEDS FIX` until an insight can be understood and traced to its evidence.

## 2026-11-03 source-linked Product Analysis MVP

- **Goal:** Turn a saved Subject Profile into an actionable product-analysis view using only report findings and CSV observations the PO explicitly linked to that subject.
- **Journey:** Open Project → Research → open a saved product profile → review the linked source list → enable Codex in the single collapsed workspace setting if needed → click **Phân tích sản phẩm bằng Codex** → review the source-tagged preview → save it to the existing profile only if useful.
- **Implementation:** `frontend/src/research/SubjectProductAnalysis.tsx` fetches exact linked report/CSV IDs and selects CSV rows by exact source/entity ID. It separates evidence, direct interpretation, hypothesis, unknowns and PO next action in the request; displays a preview and source links; stores the result as an unverified Codex-authored profile note with report/dataset IDs and content hashes only after explicit save. The existing profile notes, identity and source links are preserved. `CodexResearchRequest.allow_web_search` is false for this request, and the prompt tells Codex to stay within linked evidence; a live CLI session has not yet verified tool availability or prompt compliance.
- **Launcher:** Root `run.bat` calls `run-local.bat` and `run-local.ps1` from this same checkout. Compatibility checks require the Product Analysis module and the `allow_web_search` API schema before reusing a running backend. No second application or detached prototype is launched.
- **Verification:** `SubjectProductAnalysis.test.tsx`, `ResearchSubjectsPanel.test.tsx`, `DataFirstWorkspace.test.tsx`: **33/33 PASS**. Full frontend suite: **31 files / 271 tests PASS** with two workers. TypeScript and production build: **PASS**, existing 733.80 kB chunk advisory. Backend Codex + report-migration tests: **6/6 PASS**. Launcher compatibility: **23 assertions PASS**; PowerShell parser: **3/3 PASS**; Python compileall and `git diff --check`: **PASS**. The full backend integration suite could not start because its Windows AnyIO/Proactor harness stalls before collection. No real Codex request, model catalog lookup, run.bat launch, browser UAT or SQLite mutation was performed in this milestone.
- **Known limits:** The configured local database currently has one saved subject and zero explicit source links; a successful Product Analysis requires the PO to link a real report entity or CSV product first. The model call consumes Codex allowance. Its suggested test model has not been confirmed as the lowest-cost model for this account. `allow_web_search=false` is passed to PO Hub and the prompt asks Codex not to search, but the live CLI capability was not exercised in this turn. This MVP does not independently verify sources, monitor the internet or make causal claims. Similar display names are never auto-matched.
- **Product Acceptance:** **PO goal:** understand one selected product from evidence already saved in the project and choose a useful next action. **Automated work:** gather exact-linked report/CSV evidence, call Codex when explicitly requested and preserve traceable provenance. **Expected result:** a short reviewable analysis with source references, uncertainty and next action attached to the subject. **Remaining friction:** the configured subject has no linked evidence yet; first runtime model selection/request/save and visual owner review remain pending; full market research and live source verification are outside this MVP. **Verification:** automated checks above, no live model call. **Decision:** `NEEDS FIX / OWNER RUNTIME REVIEW PENDING`; no Product Pass.
- **Next:** Owner may exercise this alongside the delivered Research, CSV, Report and Tracking changes from the project-root `run.bat`. Keep the entire session within one launch; report any concrete runtime issue against this G3-06 task. Do not call Codex repeatedly while debugging.
