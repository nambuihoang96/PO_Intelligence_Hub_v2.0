# G3-01 Milestone Review — CSV-to-ChatGPT Prompt Handoff

**Date:** 2026-11-03  
**Status:** `TECHNICAL PASS / DESKTOP VISUAL CHECK / OWNER REVIEW PENDING`  
**QA project:** `[QA ONLY] CSV Auto Analysis Valid Periods` (`fcfedfeb-0cb8-455c-aa85-d45d0e6694b6`)

## PO feedback

The PO did not understand why the CSV research flow opened ChatGPT in another tab and saw two actions that looked like prompt generation.

## Implemented result

- The only primary action now says **Soạn & sao chép yêu cầu cho ChatGPT**, matching its behavior.
- After the prompt is created, the primary action is replaced by a completion status. It no longer remains beside the follow-up actions.
- The next link explicitly says **Mở ChatGPT ở tab mới** and explains that PO Hub remains open in the current tab.
- The return action says **Nhập câu trả lời vào PO Hub**.
- If automatic copying fails, the UI directs the PO to copy the prepared prompt before opening ChatGPT.

## Verification evidence

- `DataFirstWorkspace.test.tsx`: **17/17 PASS**. It checks the single pre-generation action, the status replacement, explicit new-tab target, return/import path, and prompt generation.
- `npm run build` including TypeScript: **PASS**. Vite reports its existing large-chunk advisory at **710.29 kB**.
- Actual local desktop screenshot at 1440×900: `.bangiao/screenshots/g3-01/feedback-round-3/csv-prompt-flow-1440x900-after.png`.
- Screenshot is the pre-generation state. Post-generation text/links are covered by component tests, not a separate browser screenshot. There is no automatic ChatGPT connection.

## Product Acceptance

- **PO goal:** Prepare research from selected CSV products without confusing prompt creation with leaving PO Hub.
- **User journey:** Select products → prepare/copy the prompt → open ChatGPT in a clearly labeled new tab → return to PO Hub → import the answer.
- **Automated work:** PO Hub creates/copies the request and keeps its project tab available.
- **Expected result:** One creation action that changes to a status after use, then one explicit ChatGPT handoff and one explicit return/import action.
- **Remaining friction:** The PO still pastes the prompt and answer manually. ChatGPT does not sync to PO Hub.
- **Verification:** Focused frontend test, final build and desktop screenshot above.
- **Decision:** `TECHNICAL PASS / DESKTOP VISUAL CHECK / OWNER REVIEW PENDING`. Not `PRODUCT PASS`.
