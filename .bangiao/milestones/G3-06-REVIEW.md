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
