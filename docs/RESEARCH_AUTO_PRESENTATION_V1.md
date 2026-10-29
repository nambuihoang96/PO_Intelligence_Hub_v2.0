# Research Auto-Presentation v1 — implementation handoff

**Status:** Implemented on feature branch **only**; **NOT browser-UAT verified** and **NOT product-accepted**.
**Branch:** `feat/research-auto-presentation-v1`
**Base:** `feat/ux-recovery-01-research-results` at `f108d010148fc6d6c8650f1cbce254e55c3e39d8`.

## Purpose

The report Overview can now select a visual summary using the **data**, not
hard-coded game genre or metric name. ChatGPT Plus can suggest highlighted
finding keys and quantitative observation indexes; the app verifies all input
and retains the right to reject inappropriate chart groupings.

### Research contract

`po_research_v1.research_data.presentation_plan` is optional:

```json
{
  "version": "presentation_v1",
  "headline": null,
  "highlighted_finding_keys": [],
  "featured_observation_indexes": [],
  "chart_observation_indexes": []
}
```

- References are **zero-based indexes** into the report's existing
  `quantitative_observations` or local finding keys; **no separate chart
  values** are accepted.
- Missing/duplicate/out-of-range *optional* references are ignored safely.
  Invalid invented attributes remain rejected by the strict contract.
- Old reports without a plan are valid and automatically presented.
- The source Markdown, report ID, benchmark selections and PO notes remain
  unchanged. No database migration is required: the optional plan is
  persisted in the existing `research_data_json`.
- Prompt builder requests the optional plan when copying to ChatGPT Plus;
  it does not require a paid API or call an LLM from the backend.

### Layout rules

1. **No observations:** no KPI/chart; existing executive summary, findings,
   evidence, gaps and PO actions remain, with a small qualitative label.
2. **Reported but not comparison-ready:** no chart or speculative KPI; show
   why observations are blocked and let the PO inspect source details.
3. **Individually valid but different metrics:** show up to 3 independent KPI
   cards; no fabricated joint trend/plot (e.g. different cohort metrics).
4. **Compatible group:** show source-bound KPI cards and the existing
   `QuantitativeEvidence` chart/table. All chart interactions open the
   original report observation, not an invented dashboard row.
5. Additional observations appear behind disclosure without being discarded.

The selection algorithm does **not** contain an eCPM, IAP, Retention or
Downloads branch. It relies on metric identity, definition, unit,
methodology, period, entity, GEO/platform scope, source and current
readiness flags.

### Across-GEO / platform comparisons

The chart engine can compare one **identical metric, source, methodology,
entity, period and the other scope dimension** across varying GEO or
platform values. Mixed/ad-format or cross-provider observations are not
collapsed. Negative values are not rendered as positive bars. Each displayed
measurement keeps its evidence action.

Backend scope parsing recognises explicit `iOS App Store + Android Google
Play` as a combined store scope **only** when the report's platform scope
also covers both. It never reclassifies `Unified` as Android or assumes
unknown provider strings.

### Visual acceptance

This version extends the existing Peachy Report Reader rather than adding
another report library or redesigning all Research routes. It uses pastel
metric cards, dynamic number formatting, a report-source note, the existing
validated chart renderer, and responsive two/one-column fallbacks.

## QA checklist before accepting / merging

Run only against an isolated QA database and workspace:

1. `python -m unittest discover -s tests` from repository root.
2. `npm run test -- --maxWorkers=1`, `npm run typecheck` and
   `npm run build` from `frontend/`.
3. Import a real owner report with quantitative observations; validate
   original content, all source URLs, scope and exact dates.
4. Open Report Overview with:
   - A source-backed multi-entity/period comparable group (Puzzle IAP).
   - One metric across multiple GEOs (Rewarded eCPM).
   - Different unrelated metrics with no valid joint chart (D1/D7/D30).
   - No numeric observations (qualitative only).
   - Incomplete/provenance-missing observations.
5. Check evidence clicks land on the correct original observation.
6. Browser UAT at **1440×900** and **390×844**: no page overflow, accessible
   labels/controls, no empty KPI tiles or false comparisons.
7. Test refresh/reopen, import deduplication and report-level vs project
   decision isolation.
8. Compare screenshots with
   `POHub_Auto_Adaptive_Research_Demo.html` reference **as a design
   direction**, not as evidence of integrated app UAT.

**Do not use synthetic test results as real market claims. Do not merge,
deploy, overwrite SQLite, or include pre-existing local CSS/setup changes.**

## Delivery / known limits

- New module files:
  `autoPresentation.ts`, `AutoResearchInsights.tsx`,
  `AutoResearchInsights.css`.
- Enhanced existing report quantitative charts for safe cross-GEO/platform
  dimension comparisons.
- Additive optional backend contract and updated ChatGPT Plus research prompt.
- Tests added for metric-agnostic selection, geo comparisons, qualitative
  fallback, contract backwards compatibility and platform scopes.
- This connector-driven implementation **has not run the repo's test suite or
  opened a local Windows browser**. Product Acceptance stays **PENDING**
  until the above QA is run by Codex/PO on the actual workspace.
