# G1-03 — Wireframe v4 desktop review, round 5

**Date:** 2026-11-04  
**Status:** `SCOPED DESKTOP IMPLEMENTATION PASS / OWNER ACCEPTANCE PENDING`  
**Scope:** Existing PO Hub project, report, finding, follow-up and Tracking journeys. Desktop only.

## What changed

- Project Home follows the approved v4 two-column structure: a primary next step with its source report and separate PO/work statuses, alongside a four-step research-to-action path.
- CSV actions, recent activity, saved files, profiles, comparison collections and saved PO decisions remain available behind one collapsed “Dữ liệu và nội dung đã lưu” section.
- The project navigation uses consistent Vietnamese names. Report relationship content omits empty relationships and internal report labels use PO-facing Vietnamese wording.
- The finding follow-up form stays in the report. Tracking shows the source and keeps PO decision separate from work status. Research-again keeps the old report, original question, new-period field, one prompt-copy action and the paste/save area together. Report updates distinguish comparing two saved reports from a PO-entered update; no Internet monitoring is implied.

## Review and verification

- Loaded the workspace UI UX Pro Max skill at `.agents/skills/ui-ux-pro-max/SKILL.md` and applied its guidance on primary task clarity, progressive disclosure, source context, status distinctions and focus.
- Focused Project Home and Research Run integration tests: **2 files / 13 tests PASS**.
- Full frontend suite: **31 files / 282 tests PASS**.
- `npm run build`, which includes TypeScript checking: **PASS**. Vite reports a 760.97 kB JavaScript chunk advisory.
- Live browser review used the isolated QA app at `http://127.0.0.1:5175` and QA project `79bafa81-4b0a-4ffd-8c10-490ba70a254a`. Project Home was revisited after the disclosure change and verified in both collapsed and expanded states. The report library, report overview, finding, inline follow-up, Tracking, report updates and research-again screens were also inspected in this isolated desktop QA environment during this review.
- Screenshots were captured and visually inspected in the active session; they were not exported to files. The exact 1440×900 viewport and full A01–A29 screen-by-screen traceability have not been recorded. A first focused test run failed because the operating-system temp folder rejected a rename; the rerun with the existing workspace-local test temp folder passed.
- QA content is synthetic. No genuine comparable two-period report was available, so report-level change output is not accepted as real-data behavior. No save action, production database, external AI request or quota was used. No backend test suite was run in this UI review.

## Product Acceptance

- **PO goal:** Understand where to start, what a tracked decision refers to, how to return to its source, and how research/progress updates work.
- **User journey:** Project Home → open the exact report/finding → save or edit PO follow-up in place → return through Tracking or repeat the question for a new period → review the selected reports.
- **Automated work:** Preserve project/report/finding links; separate PO decisions from work progress; retain the previous report; keep saved data available without crowding the primary project screen.
- **Expected result:** A focused desktop workflow with a visible next action and source context.
- **Remaining friction:** Full desktop v4 criteria traceability and owner acceptance remain pending. A genuine comparable report pair is still required to accept real report-change analysis. PO Hub does not monitor the Internet.
- **Verification:** 31 frontend test files / 282 tests, production build, and isolated live desktop browser review. No real report-pair result or backend test is claimed.
- **Decision:** `NEEDS FIX FOR FULL PRODUCT ACCEPTANCE`; scoped desktop implementation is ready for owner review, not accepted as a full Product Pass.

## Next action

Keep G1-03 in `REWORK` until the owner reviews the integrated app and the remaining v4 criteria are reconciled. Continue independent approved Product Analysis work. Do not generate synthetic report output to close the genuine comparison gate.
