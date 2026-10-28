# G3-06 — Subject Profile & Extensible Analysis Sections

**Status:** `DEV_DONE — scoped feedback round verified; owner review pending; Product Acceptance not claimed`
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
