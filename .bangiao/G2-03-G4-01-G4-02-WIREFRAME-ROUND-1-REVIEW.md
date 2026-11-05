# PO Hub follow-up workflow — verification handoff

**Date:** 2026-11-03  
**Scope:** G2-03, G3-04, G4-01, G4-02 owner-feedback round  
**Status:** `WF11 EXPLICIT-SELECTION PATH VERIFIED ON SYNTHETIC QA / REWORK / OWNER REVIEW PENDING`. Remaining genuine-data, complete mobile and report-API verification gates remain open. No owner acceptance, merge, release or deployment is implied.

## Business outcome

- **PO goal:** Continue from a saved research finding into a same-question follow-up, compare exact reports carefully, then record dated observations against the correct decision.
- **User journey:** Research result → research again → edit the new period → import → open the exact before/after pair → review finding identity/sources → save a PO review → open the corresponding Tracking item → record a dated note or correction → refresh and reopen.
- **Automated work:** Preserves project/question/GEO/platform, leaves a new period open for editing, records exact predecessor lineage, keeps report review separate from PO decision state, requires an explicit source-bound prior-observation selection for decision tracking, matches only that saved metric identity, protects append-only review history, retries manual-update revisions, and leaves PO decision fields unchanged when a metric is marked seen.
- **Expected result:** The PO can tell which reports are compared, review source-backed ambiguity, choose the exact metric attached to a saved decision, see the compatible later-period signal on that Tracking card, and retain dated updates without fabricated values or silent history loss.
- **Remaining friction:** A genuine comparable follow-up pair, full mobile journeys, API report-test completion, and saved 1440/390/320 captures remain unverified. The approved v4 wireframe and A01–A29 criteria are available at the documented handoff path.

## Implementation

- `backend/migrations/versions/20261102_0016_report_comparison_lineage.py` adds optional predecessor lineage and per-follow-up PO finding review storage. It was applied only to the isolated QA database.
- `backend/app/reports.py` and `backend/app/schemas.py` validate same-project lineage and same-project finding review references.
- `frontend/src/reports/ResearchIntake.tsx` and `ReportResults.tsx` carry research-again context and link the imported follow-up to its exact predecessor.
- `frontend/src/reports/ReportUpdateComparison.tsx` selects exact report IDs, separates tracked PO decisions from exploratory findings, presents ambiguity and source context, uses strict compatible-pair conditions, and saves an explicit PO same/different finding review.
- `frontend/src/tracking/TrackingWorkspace.tsx` submits only writable decision fields, preserves retry content, saves dated PO notes/corrections, supports explicit source-bound metric selection, shows the period signal on the saved decision card, and leaves the decision unchanged when the PO acknowledges the signal.
- `backend/app/opportunities.py` rejects removal or rewriting of existing tracking update history and validates explicit metric selection against the decision’s exact report/hash/finding. `backend/app/reports.py` accepts only the exact saved prior observation and uses append-only prefix validation plus a compare-and-swap update for comparison reviews.

## Verification evidence

- **Actual browser UAT:** Current running app at `http://127.0.0.1:15330`, API `15331`, isolated database `.codex-qa-ux-delivery-tmp/manual-appdata`.
- Synthetic QA project: `0226129f-bd2e-4c44-8a65-84a0dede9f91`.
- Synthetic before/after reports: `73865437-ebf7-4bec-8939-c4ac4de52ddf` and `fccf9903-d474-4d32-a042-c3b89a165da5`.
- Research-again preserved the same question and US/iOS scope; the period was blank. February import stored the exact predecessor and showed a CTA to the exact pair.
- Qualitative-only pair showed no quantitative deltas. Finding ambiguity linked both reports. A PO same-finding review survived reopen.
- A finding-specific PO decision was opened in Tracking. A dated manual note survived a fresh browser load. An appended correction retained both old and new entries; the PO decision remained `Cần nghiên cứu thêm` with the original rationale and next action.
- **Focused frontend:** four test files, 62 tests PASS; TypeScript PASS; production build PASS with the existing 658.02 kB chunk-size advisory. Test run used a workspace temp folder.
- **Focused backend:** `tests/test_workspace_data_first.py` 19/19 PASS using a workspace temp folder. This covers append-only deletion/rewrite rejection and existing context/decision cases.
- **Migration:** revision 0016 manually applied to the isolated QA DB. No production database was opened.
- **Report-test limitation:** `tests/test_reports.py` did not complete in this Windows harness; setup stalled after Alembic migration. A prior default-temp attempt also hit restricted OS temp access. No backend report-test or full-suite PASS is claimed.
- **Independent review:** Read-only scoped reviewer inspected lineage/project validation, comparison gates, tracking payload/retry behavior, and append-only history. One actionable issue was fixed and tested; no other actionable issue was reported. Migration and broad regressions were outside reviewer scope.
- **Visual review correction:** A separate review used the running QA app at 1440×900, 390×844 and 320×700. The comparison page had no page-level horizontal overflow. At both mobile widths its project strip initially contained a large blank area; setting the mobile `.project-journey-heading` flex basis to auto reduced that strip to 99px at 390 and 107px at 320. The Tracking manual-update form opened and fit at both mobile widths. Browser screenshot files for these exact states were not saved, and the full mobile journeys remain unverified.
- **Design source correction:** The approved v4 spec, interactive wireframe, ZIP and A01–A29 criteria are readable at `C:\Users\Admin\Documents\Codex\2026-11-02\referenced-chatgpt-conversation-this-is-an\outputs`. They are separate from any Peachy Studio G1-03 reference gate. UI UX Pro Max was read for this independent review.

## A01–A29 evidence matrix

The criteria are in the approved v4 spec at the handoff path above. This matrix distinguishes a narrow synthetic QA pass from an unverified full acceptance path; neither constitutes overall Product Acceptance.

| ID | Status | Criterion and observed limit |
|---|---|---|
| A01 | NOT VERIFIED | Menu order, active state and project header were inspected on selected pages; all report tabs were not traversed. |
| A02 | NOT VERIFIED | Project Home → report → exact finding was not replayed in this round. |
| A03 | NOT VERIFIED | Cancel follow-up without creating a record was not replayed. |
| A04 | NOT VERIFIED | A finding decision was saved in QA; the quick save with no decision and return context were not fully replayed. |
| A05 | NOT VERIFIED | Saving the same finding twice without duplication was not replayed. |
| A06 | PASS | Synthetic QA decision and manual update remained after a fresh browser load; source data came from the QA API. |
| A07 | NOT VERIFIED | Source and browser Back were not tested with a retained filter and scroll position. |
| A08 | NOT VERIFIED | A frontend failure test kept the draft and retry action; real network-loss recovery was not replayed in browser. |
| A09 | NOT VERIFIED | A stale comparison-review payload was rejected with 409 in isolated API UAT; simultaneous two-tab browser edits were not replayed. |
| A10 | NOT VERIFIED | Today/overdue/future dates, local timezone, and paused/completed behavior were not checked. |
| A11 | NOT VERIFIED | Completing work without changing PO decision or source verification was not replayed. |
| A12 | PASS | The qualitative-only synthetic pair showed no fabricated numeric difference; original reports remained readable. |
| A13 | NOT VERIFIED | Linked and empty relationship-map states were not replayed in this round. |
| A14 | NOT VERIFIED | Report note save without creating a task or decision was not replayed in this round. |
| A15 | NOT VERIFIED | Numeric compatibility has focused tests; a real comparable source pair and chart/source behavior were not browser-tested. |
| A16 | NOT VERIFIED | The entire read → follow → save → return journey was not completed at both 390px and 320px. |
| A17 | NOT VERIFIED | The owner-provided Puzzle report exists in QA; finding, evidence, limit and next action were not accepted in this round. |
| A18 | NOT VERIFIED | Missing/replaced source handling was not replayed. |
| A19 | NOT VERIFIED | No genuine compatible report pair with old/new sources was browser-tested. |
| A20 | NOT VERIFIED | Full legacy decision-field preservation across the new form was not replayed. |
| A21 | NOT VERIFIED | Browser confirmed old question/scope and blank new period; copied prompt content was not independently checked. |
| A22 | NOT VERIFIED | A new synthetic report preserved its predecessor; failed import and duplicate retry were not replayed. |
| A23 | NOT VERIFIED | Tests cover changed, ambiguous and not-mentioned labels; all four groups were not reviewed in a complete browser path. |
| A24 | NOT VERIFIED | PO same/different review persisted in synthetic QA; missing game ID/source ambiguity and both-source review were not fully exercised. |
| A25 | NOT VERIFIED | Focused tests cover reversed order, multiple and duplicate metrics; no genuine compatible numeric pair was browser-tested. |
| A26 | PASS | Synthetic qualitative before/after descriptions and source links were shown as proposals, with no numeric change inferred. |
| A27 | PASS | Synthetic QA manual update stayed on the selected finding/decision after reload; date, source fields and PO decision state were checked. |
| A28 | NOT VERIFIED | Append-only PO updates and stale comparison-review rejection are tested; response-lost browser retry and source-free case were not fully replayed. |
| A29 | NOT VERIFIED | Tracking form and comparison were inspected at 390px and 320px without page overflow; research-again and return journey were not completed at both widths. |

## Product Acceptance

### Reviewer blocker status — updated 2026-11-03

- **WF11 explicit-selection blocker is addressed on synthetic QA:** Tracking now says “Chưa chọn số liệu để theo dõi” until the PO chooses one exact observation. The decision stores its report ID/hash, stable metric identity, period/value/source signature and revision snapshot. Tracking shows the compatible later-period signal, both sources and a seen action; backend checks the saved reference and never edits the PO decision.
- **Stale review overwrite blocker is addressed on the verified API path:** Review writes must contain the exact current history prefix; an atomic compare-and-swap prevents concurrent stale writes. A synthetic stale payload received HTTP 409 with the already saved review retained.
- **Broader persistence acceptance remains open:** The browser did not replay two simultaneous tabs, response-lost acknowledgements or every manual-update failure path. A09/A28 remain NOT VERIFIED overall.
- **Insight placement improved, journey still open:** The first comparison now has a visible summary and a link to the first proposed finding on a 390px viewport. The link scrolled to the exact finding in browser QA. The caveats are collapsed into help. The full import/retry journey and saved screenshot artifacts remain unverified.
- **Full product gate remains open:** The QA pair is synthetic. Genuine comparable reports, complete report API regression, and end-to-end mobile journeys are still required before Product PASS.

- **PO goal:** Follow up on a saved report finding with a comparable report and keep dated evidence with the right PO decision.
- **User journey:** Research again → import → exact report comparison → PO finding review → Tracking update/correction → reopen. A report finding now links directly to its PO decision, and that decision links back to the exact finding.
- **Automated work:** Preserves context and lineage, requires a decision-specific measurement choice, checks both source links and compatible periods, appends review history without silently replacing earlier decisions, and prevents rewriting prior manual records.
- **Expected result:** The saved decision card displays only the exact metric explicitly chosen by the PO and its compatible later counterpart, while keeping source and unverified status visible.
- **Remaining friction:** Genuine comparable data, full responsive journeys and saved viewport captures, full report API tests, two-tab browser concurrency and response-lost acknowledgement are still unverified.
- **Verification:** Four frontend files / 71 tests PASS; TypeScript/build PASS; Python compileall PASS. Direct API UAT on `.codex-qa-ux-delivery-tmp/manual-appdata` saved the exact source-bound selection, saved the matching seen review without changing `investigate`, and rejected a stale payload with 409. Actual browser review on the synthetic Tracking card showed `62 percent → 68 percent`, both synthetic source links, the unverified caveat and saved seen state. The attempted browser 390px override did not apply; no mobile overflow claim is made. `tests/test_reports.py` stalled after Alembic setup and is not claimed as passing.
- **Decision:** `TECHNICAL PASS` for the verified synthetic WF11 path; overall `NEEDS FIX / OWNER REVIEW PENDING`.

## Next executable work

Use the available v4 wireframe and A01–A29 criteria to complete the bounded Report Reader prototype. Then capture the actual app at 1440px, 390px and 320px, finish the mobile journeys, and test a genuine comparable follow-up report pair. Multi-period benchmark acceptance still requires comparable real period datasets.

## Isolated mobile Tracking card recheck — 2026-11-03

- **PO goal:** Review a compatible reported signal beside the exact saved finding decision, with its period and source context.
- **User journey:** Open the saved finding decision from Tracking; inspect the selected prior observation, later-period signal, both sources and reported/unverified caveat; use the prior-observation selector only if the chosen measure needs to change.
- **Automated work:** The app retains the exact report-linked decision reference, only shows a uniquely compatible later observation, and keeps the seen review separate from the PO decision.
- **Expected result:** The selected observation and `62 percent → 68 percent` synthetic signal remain on the same Tracking card with both source links and the unverified caveat.
- **Implementation:** At ≤560px, `body:has(.tracking-workspace) { min-width: 0; }` removes the global 320px body minimum from Tracking. No project, decision or tracking data changed.
- **Remaining friction:** The checked pair and URLs are synthetic. Full read→select→save→acknowledge→reopen at mobile widths, two-tab concurrency, response-lost retry, and saved screenshot files remain open.
- **Verification:** Read-only browser UAT on the existing QA project at 1440×900, 390×844 and 320×700. Initial 320px overflow (`documentElement.scrollWidth` 320 versus `clientWidth` 305) disappeared after the scoped CSS rule; post-fix document/body widths were 305/305 at 320px, 375/375 at 390px and 1425/1425 on desktop. The project decision, selected metric, both source links, caveat, seen state and next-action text were visible. No selection, save or seen action was triggered. Screenshots were reviewed in-session but not saved. No backend or frontend tests were rerun for this visual/CSS check.
- **Decision:** `NEEDS FIX / OWNER REVIEW PENDING`; this narrow synthetic visual recheck does not establish Product Acceptance.

## Report Reader prototype update — 2026-11-03

- **PO goal:** Read report evidence comfortably on desktop and phones, then act on a finding without losing the connection to its exact PO decision.
- **Original feedback:** Use the two owner-provided Report Reader images as references for a desktop reading layout and a mobile readability failure. Keep report metrics sourced from the selected report; make tables readable and scrollable with their first identity column recoverable; verify 1440px, 390px and 320px; avoid page-level overflow and preserve finding → decision → back plus Research Again → import → comparison → Tracking journeys. Do not copy sample content or invent report data.
- **Classification / affected work:** Bounded G1-02 Report Reader prototype rework and its 320px responsive defect. G1-03 cross-screen style rollout remains gated on the actual final approved full-resolution Peachy Studio references for Project Home / Report Reader / CSV Analytics. This iteration does not authorize applying tokens across screens.
- **Implementation:** In `frontend/src/reports/MarkdownReport.tsx`, wide Markdown tables are exposed as keyboard-focusable regions with semantic column headers. In `frontend/src/peachyStudio.css`, report tables use 14px text, horizontal scrolling and a sticky first column; the mobile Report Reader no longer inherits the global 320px minimum body width or sizes its container from `100vw`, which removed 15px of page-level overflow at the 320px viewport.
- **Verification:** Five focused frontend test files / 72 tests PASS with a repository-local temp path, including the new table scroll-region and column-header test. TypeScript and production build PASS (677.62 kB JS chunk advisory); `git diff --check` PASS. In the running app, the labeled synthetic QA report `25420e93-f871-4d5b-bc14-4237cd048b58` was inspected/captured at 1440×900, 390×844 and 320×700. At those viewports, document scroll width equaled layout width: 1425/1425, 375/375 and 305/305. Browser navigation reached the exact PO decision from its report finding and returned to that exact finding. The three screenshots were visually returned during the CUA inspection but are not stored as image artifacts. The QA report contains no Markdown table, so real wide-table browser rendering and the user-provided long-form report remain unverified. No invented report data or charts were added.
- **Remaining gates:** Save viewport screenshots as files; inspect a PO-provided long-form report and its actual table (if present); complete the full 390px/320px reading and Research Again/import/comparison/Tracking journeys. The actual final approved full-resolution Peachy references are still required before G1-03 cross-screen rollout. Genuine comparative-report acceptance and the open A01–A29 criteria remain outstanding.
- **Decision:** `NEEDS FIX / OWNER REVIEW PENDING`. The prototype and responsive overflow correction are technically verified on synthetic QA. This is not Product Pass, genuine-data acceptance or Owner Acceptance.
