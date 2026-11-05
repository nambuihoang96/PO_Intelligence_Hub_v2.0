# Scoped owner acceptance — research-again and CSV

Date: 2026-11-04. Status: **TECHNICAL PASS / READY_FOR_OWNER on isolated QA**.

| Owner item | Result | Evidence |
|---|---|---|
| Preserve Peachy layout; readable type/dark contrast | PASS, affected screens | Actual intake/CSV light and dark review; picker geometry identical; no new layout changes |
| Visible, selectable Codex model | PASS | One model selector and shared theme switch; gpt-6-luna selected in browser; lightweight recommendation fallback corrected |
| Factual CSV calculations, source trace, no invented advice | PASS | Exact old/new values, periods, file/row references, QA provenance and selection rule; generic recommendation blocks absent |
| Codex run → preview → save | PASS on short synthetic QA | Exactly one actual browser run, gpt-6-luna/low, 10.64s, correct Total: 12; saved with Codex origin and previous-report link |
| Root cause of historical 240-second timeout | NOT VERIFIED | Not reproduced by the one permitted QA request; old logs lacked causal evidence |

## Ready-to-review links

- [Research-again/model controls](http://127.0.0.1:15401/?projectId=f7152a29-0f5a-43a4-b422-f142f3c227c0&fromReportId=672c257d-159e-4a8b-957a-cc3e21a0d708&action=research-again&question=QA%20ONLY%3A%20verify%20the%20supplied%20synthetic%20counts&geo=US&environment=iOS)
- [Saved actual QA response — no new inference needed](http://127.0.0.1:15401/reports/577d3166-5388-4ca6-a25c-52eceac633cc)
- [QA CSV comparison](http://127.0.0.1:15401/research?projectId=f7152a29-0f5a-43a4-b422-f142f3c227c0&view=csv&datasetId=4e450f4e-4518-44fa-913d-b13cb2761a2e)

QA API/frontend use ports 15400/15401 and fresh data under `.bangiao/qa/codex-acceptance-round13-20261104/data`. Existing real-data backend at 8000 was not restarted or changed. QA services remain running for review; PID ownership is recorded in that folder's `runtime.json`.

## Fixes completed in this continuation

- `backend/app/codex_research.py`: if the catalog marks a model lightweight but its name lacks a hint such as mini/fast, recommendation now still chooses an available lightweight model. Explicit low reasoning prevents inheriting the machine's high setting. No deadline extension.
- `frontend/src/reports/ResearchIntake.tsx`: actual Codex response guidance identifies the returned answer and asks for review/save, without another ChatGPT copy step.
- `tests/test_codex_research.py`, `frontend/src/reports/ResearchIntake.test.tsx`: focused regressions for these behaviors.
- Earlier scoped color/source-label/recommendation-removal fixes retained; no new design or architecture work.

## Single real request and quota disclosure

The owner authorized at most one synthetic QA inference. The actual browser button sent a 233-character fixture prompt using `gpt-6-luna`, reasoning `low`, asking for 7+5 and a tiny fixed Markdown response. It returned:

```text
# QA ONLY

Total: 12. Source: supplied synthetic fixture; not market data.
```

Reference `f8be0f4445f7`: process exit 0 after **10.64 seconds**. Access log count: **1** POST to `/api/v1/codex/research`; no retry or second inference. The catalog describes this configured Luna model as fast/affordable and marks it suitable for lightweight testing. It does not expose prices, so absolute cheapest, exact tokens and monetary cost are not verified.

Saved QA report origin is `codex_cli_research`; `previous_report_id` points to the synthetic baseline. The browser reached the exact old/new report comparison after saving. This is not market-data or long-research acceptance.

Safe evidence retained:

- `.bangiao/qa/codex-acceptance-round13-20261104/acceptance-result.json`
- `.bangiao/qa/codex-acceptance-round13-20261104/api.stderr.log` — safe stage/reference metadata
- `.bangiao/qa/codex-acceptance-round13-20261104/api.stdout.log` — HTTP request count
- `.bangiao/qa/codex-acceptance-round13-20261104/fixture.json`

## Exact verification

- Backend mocked tests: **8/8 PASS**.
- ResearchIntake, CsvAutoAnalysis, ProjectThemeToggle: **3 files / 67 tests PASS**.
- Final TypeScript/Vite build: **PASS**, 81 modules; existing 765.09 kB JS chunk advisory.
- Actual browser UAT: model selection, one real run, returned answer, separate save/source link, factual QA CSV comparison, both themes and shared controls.
- Screenshot images inspected in the browser session; no exported screenshot files.
- No full suite, second inference, real-data test, merge or deployment.

## Product Acceptance

- **PO goal:** Read the existing Peachy screens, select a lightweight model, run/review research and inspect CSV evidence without invented advice.
- **User journey:** Research-again → model → run → actual answer → review/save linked new report; CSV → choose two periods → inspect calculated/source-backed observations.
- **Automated work:** Safe model recommendation, explicit low reasoning, request diagnostics, actual returned content/provenance and compatible arithmetic.
- **Expected result:** All four owner-scoped paths are reviewable in the isolated app.
- **Remaining friction:** Historical timeout root cause remains unproven; short QA does not establish long genuine research performance; tokens/cost are not exposed; main 8000 backend has not been restarted/deployed.
- **Verification:** Focused checks and one actual QA request above.
- **Decision:** **TECHNICAL PASS / READY_FOR_OWNER (QA scope)**. Owner acceptance remains explicit; no Product Pass is inferred.
