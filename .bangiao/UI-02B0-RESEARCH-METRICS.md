# UI-02B.0 — ChatGPT Research Metrics → Analytics

Status: **Awaiting Product Owner review**  
Starting branch: `feat/ux-recovery-01-research-results`  
Starting HEAD: `8c9f6de4f80fc7c201eef2356c95e73f6b810be9`

## Delivered

- Extended the existing `po_research_v1` quantitative observation contract with an entity display name and a separate evidence reference. Existing reports without `quantitative_observations` remain readable; no migration was needed.
- Updated the ChatGPT research prompt to request only exact, source-linked numeric observations. It warns against turning prose estimates, rank positions, reviews, screenshots, or chart pixels into measurements. It asks for an empty collection when exact supported values are absent.
- The server validates registered entity/source references, exact observation fields, scope, period, duplicates, and methodology. It binds report provenance locally and derives readiness when reading a report; it does not trust ChatGPT-supplied readiness or verification claims and does not rewrite the persisted original report.
- Added a reusable visualization selector and report-supplied quantitative section. It renders compatible same-period entity comparisons, explicit ranking positions, two-point comparisons, or time series only when three or more compatible chronological observations exist. Incomplete or incompatible observations remain available with reasons rather than being plotted.
- Selecting a comparison row navigates to the corresponding Evidence record, which shows the source, report reference, verification state, and a supported passage location when present.
- No CSV upload was needed for report-supplied metrics. Existing CSV flows and database schema were left intact.

## Files changed

- `backend/app/research_data.py`
- `backend/app/quantitative.py`
- `backend/app/reports.py`
- `frontend/src/reports/researchPrompt.ts`
- `frontend/src/reports/api.ts`
- `frontend/src/reports/quantitativeAnalytics.ts` (new)
- `frontend/src/reports/QuantitativeEvidence.tsx` (new)
- `frontend/src/reports/QuantitativeEvidence.test.tsx` (new)
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/reports/ResearchIntake.test.tsx`
- `frontend/src/style.css`
- `tests/test_quantitative.py`
- `.bangiao/UI-02B0-RESEARCH-METRICS.md`

Pre-existing user changes in `scripts/setup.ps1` and `.devcrew/` were preserved and are not part of this delivery.

## Data flow and compatibility

ChatGPT output is validated against the existing contract and stored with the report. At read time, PO Hub checks local entity/source references, scope and period, flags duplicates, and binds the report ID as provenance. “Reported” stays distinct from “verified”; a URL alone never marks evidence verified. No database migration or new endpoint was introduced; the existing report create/read APIs carry the optional collection.

Visualization eligibility is derived from complete compatible observations. The selector does not combine different metric definitions, scopes, or periods. Two values are labeled as two points and are not shown as a continuous trend. A time-series line uses only the supplied dates and does not interpolate missing periods. Ranking observations remain ranking positions rather than download or revenue metrics.

## Test results

- Backend: **91 passed**, 1 existing Starlette/AnyIO deprecation warning.
- Frontend: **60 passed** across 7 files.
- TypeScript check: **passed**.
- Production build: **passed**.
- Migration check (`alembic check`): **passed**; no schema operations required.

Coverage includes report-supplied metric persistence without CSV, local provenance binding, unresolved entity/scope reasons, legacy report compatibility, approximate prose and chart-only inputs not producing observations, two-point labeling, chronological time-series selection, ranking semantics, incomplete data, and incompatible metric/scope separation.

## Browser UAT

Performed in the in-app browser against local frontend/backend services using an isolated SQLite database under `.test-tmp/ui02b0-uat-data`.

1. Imported one structured report with three explicitly **synthetic UAT-only** entities and values; no CSV was uploaded. Backend returned `201 Created`.
2. Overview rendered a same-period entity comparison and labeled it report-supplied and unverified.
3. Clicked a comparison row; the app opened Evidence for that observation. The source remained unverified and the supporting report location was shown.
4. Refreshed the report, returned to Reports history, and reopened it. All three observations and their evidence references remained present.
5. Saved screenshots from the running localhost app under `.bangiao/screenshots/ui-02b0/`:
   - [Overview, desktop 1440×900](screenshots/ui-02b0/overview-desktop-1440x900.png)
   - [Quantitative Evidence, desktop 1440×900](screenshots/ui-02b0/quantitative-evidence-desktop-1440x900.png)
   - [Evidence detail, desktop 1440×900](screenshots/ui-02b0/evidence-detail-desktop-1440x900.png)
   - [Quantitative Evidence, mobile 390×844](screenshots/ui-02b0/quantitative-evidence-mobile-390x844.png)

The mobile screenshot was captured, but it shows the wide comparison content clipped at 390px. Mobile responsiveness is therefore **not accepted** by this UAT. **Not verified:** a real owner-supplied quantitative report in the isolated database; browser rendering of the two-point and insufficient-data states. Those states are covered by automated frontend tests. A chart image alone was not imported or treated as data.

The synthetic values were created only for the acceptance workflow, clearly labeled synthetic in the report, and are not market findings. Production SQLite was not used or changed.

## Known limitations

- Exact structured observations are supported; approximate numeric prose is intentionally retained as report text rather than parsed into metric values.
- Chart images are not machine-read. The user must request exact structured values from ChatGPT Plus.
- The app selects visual forms deterministically from compatible observations instead of consuming a ChatGPT-authored chart intent.
- The quantitative section overflows/clips at the captured 390px viewport; it needs a focused responsive follow-up. Real-report UAT remains unverified.

## Commit

Implementation commit SHA: `5d2a474` (`feat: add report-supplied quantitative analytics`).

The handoff is committed separately. The implementation and handoff commits have been pushed to `origin/feat/ux-recovery-01-research-results` for review.
