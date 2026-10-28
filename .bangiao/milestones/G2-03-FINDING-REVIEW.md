# G2-03 — finding decision context

2026-10-28 · Branch `feat/ux-recovery-01-research-results` · Baseline `57be9e3`.

**Status:** Finding-specific slice: TECHNICAL PASS / BROWSER UAT PASS using a synthetic QA report. Broader G2-03: IN PROGRESS; product acceptance pending owner review.

Opening a PO decision from an explicitly selected report finding now shows the matching report and finding for context when report ID, content hash and finding key all match. It does not attach evidence or mark the report verified. A changed hash does not select the report.

Browser UAT used an explicitly labelled synthetic `[QA]` report in `.g3-01-qa-20261028/`, not production data: import → finding → PO decision → save `Tạm hoãn`, rationale and next action → Tracking → reopen → refresh. All saved fields and finding identity remained. At a 390px viewport the Tracking and decision pages had 375px document width with no page overflow.

Verification: 26 frontend test files / 220 tests PASS, TypeScript PASS, production build PASS with the existing bundle-size warning. Exact matching and mismatched-hash regression tests run. Backend suite was not rerun. Browser images: [finding context](../screenshots/g2-03/finding-decision-context.jpg), [Tracking](../screenshots/g2-03/tracking-finding-decision.jpg), [mobile](../screenshots/g2-03/finding-decision-mobile.jpg).

## Product Acceptance

- **PO goal:** Record and return to a decision about a specific research finding.
- **Journey:** Open finding → open project decision → review source context → save assessment and next action → Tracking → reopen.
- **Automated work:** Resolve the explicit report ID/hash/key and restore the decision; source evidence stays unverified and is not attached automatically.
- **Expected result:** The selected finding is readable alongside its decision and saved work persists.
- **Remaining friction:** Broader subject/update/legacy and conflict paths need review; this browser fixture is synthetic and is not genuine-report acceptance.
- **Verification:** Browser and frontend tests above; owner product review remains pending.
- **Decision:** `TECHNICAL PASS` for the finding slice; broader G2-03 remains IN PROGRESS.

Files: `frontend/src/research/OpportunityReview.tsx`, its test, Recovery Board and browser evidence. Commit: see task branch history containing this handoff.

## Additional subject and trend QA

After the finding slice, browser UAT also saved a separate subject decision (`Tìm hiểu thêm`) and an explicitly labelled synthetic trend-update decision (`Tạm hoãn`) in the same isolated project. Both appeared separately in Tracking and reopened with target, rationale and next action intact after refresh. The finding decision remained separate. [Trend decision](../screenshots/g2-03/trend-update-decision.jpg) · [Tracking with all three](../screenshots/g2-03/tracking-three-targets.jpg).

Legacy preservation and revision-conflict behavior still require applicable review; these synthetic checks do not confer owner product acceptance.

## Concurrent edit QA

Two browser tabs edited the same synthetic trend decision. The first saved a newer revision; the second received a conflict and retained its unsaved draft. After refresh, the first tab's saved value and revision history remained. The originally English conflict response is now displayed in Vietnamese with instructions to preserve the draft and review the newer version. [Conflict and retained draft](../screenshots/g2-03/decision-conflict-draft.jpg). After the fix, frontend 26 files / 220 tests, typecheck and build passed. Legacy preservation remains under review; product acceptance remains pending.

## Legacy preservation

In isolated browser QA, a `[QA]` historical report note survived a separate update to the finding's project decision; Tracking showed the new project next action while the note remained in the report. [Legacy note after decision update](../screenshots/g2-03/legacy-note-after-decision.jpg). The workspace backend regression suite ran 19 tests successfully on temporary SQLite databases and migrations, including legacy report notes, linking, stale targets, historical decisions and revision conflicts. Report-entity-specific browser UAT was not separately run. The scoped G2-03 technical workflow is DEV_DONE; genuine-report G2-04 and owner product acceptance are still pending.
