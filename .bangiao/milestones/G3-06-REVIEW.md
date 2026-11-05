# G3-06 Review — Subject Profile Follow-up Workflow

**Date:** 2026-10-28  
**Branch:** `feat/ux-recovery-01-research-results`  
**Implementation commit:** `7bea79efc3a274b746baab296459ab628f0d345c`  
**Status:** `DEV_DONE` for scoped feedback round; owner review pending.

## Product change

The open subject profile now leads with one contextual “Câu hỏi nghiên cứu tiếp theo” field and a single save action. Existing custom analysis sections remain editable behind “Ghi chú phân tích khác”; they are not deleted or renamed. The existing API and `analysis_sections` persistence contract remain unchanged.

## Verification

- Focused `ResearchSubjectsPanel.test.tsx`: 12/12 PASS.
- Full frontend suite: 26 files / 223 tests PASS.
- TypeScript: PASS.
- Production build: PASS. Existing Vite warning for a JavaScript chunk above 500 kB remains.
- `git diff --check`: PASS.
- Actual isolated QA browser at `http://127.0.0.1:15310`: saved a clearly QA-labeled follow-up question, refreshed, reopened the profile and verified the exact question remained. The earlier QA trend record remained visible and unverified.
- Browser viewport was 375px. Exact 390px and desktop visual checks are NOT VERIFIED. A screenshot was visually inspected in the browser session but not saved as a repository file.
- QA database `.peachy-g1-qa-20261028` only; production SQLite was not accessed.

## Product Acceptance

- **PO goal:** Keep a product/topic history usable and capture what the PO wants to learn next without presenting a technical form first.
- **User journey:** Project → open subject profile → enter follow-up question → save → refresh → reopen.
- **Automated work:** The existing profile persistence stores the PO note separately from source-reported/unverified history and retains other analysis sections.
- **Expected result:** Follow-up question is available on reopen; saved source history remains separate and unchanged.
- **Remaining friction:** No genuine source-backed subject was available; collection association was not exercised. Responsive review at exact 390px and desktop remains outstanding.
- **Verification:** Automated checks above and isolated browser save/refresh/reopen at 375px.
- **Decision:** `TECHNICAL PASS / scoped browser pass; OWNER REVIEW PENDING`. No Product Pass claimed.

## Changed files

- `frontend/src/research/ResearchSubjectsPanel.tsx`
- `frontend/src/research/ResearchSubjectsPanel.test.tsx`
- `frontend/src/style.css`
- `.bangiao/G3-06-SUBJECT-PROFILES.md`
- `docs/RECOVERY_BOARD.md`
- `.bangiao/milestones/G3-06-REVIEW.md`

## 2026-11-03 responsive UAT recheck

- **Outcome:** Exact desktop and mobile visual verification completed against the existing isolated QA Puzzle Research project. The open profile showed its existing QA-only follow-up question and unchanged source/collection context.
- **Corrections:** Removed the Research page's 320px minimum body width at ≤560px and placed the profile type label below the product name. No profile or report data was written.
- **Evidence:** At 1440×900, 390×844 and 320×700, document/client widths were 1425/1425, 375/375 and 305/305. The 320px horizontal page bar is gone. The question and save control remain within the viewport; the save button is disabled without edits. Browser screenshots were viewed but not saved as files. Current build/TypeScript PASS, existing 677.62 kB chunk advisory; `git diff --check` PASS with line-ending warnings.
- **Decision:** `TECHNICAL PASS / OWNER REVIEW PENDING`; no Product Pass. Existing evidence is QA-only and genuine-source acceptance remains separate.
