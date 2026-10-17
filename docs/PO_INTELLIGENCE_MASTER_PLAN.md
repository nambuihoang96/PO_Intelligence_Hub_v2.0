# PO INTELLIGENCE HUB V2 — MASTER IMPLEMENTATION PLAN

Role: Principal Product Architect + Senior Full-stack Engineer + UX Architect + QA Lead.

Workspace: D:\AI\PO Analysis\PO_Intelligence_Hub_v2.0

Current reference branch: fix/research-contract-p0
Last reviewed remote HEAD: f49bbee28fc43316394d40155255657d4ae37037

## 0. STARTUP RULES

Before making changes:

1. Check actual local branch, HEAD, git status and uncommitted changes.
2. Read current source, relevant migrations, tests and handoff documents.
3. Do not blindly reset to the reference commit; preserve any newer local changes.
4. Verify the active backend/frontend correspond to the current code before browser UAT.
5. Preserve local SQLite data and finalized Research Run Manifests.
6. Save this execution plan as docs/PO_INTELLIGENCE_MASTER_PLAN.md.

Work ONE task at a time.

Implement P01 only in this execution.

Do not automatically start P02–P08.

Do not push, merge, create PR, or delete existing work without approval.

## 1. PRODUCT NORTH STAR

PO Intelligence Hub supports:

Research Question
→ ChatGPT Plus Research
→ One-Paste Import
→ Structured Research Results
→ Evidence-backed Insights
→ Competitor / Product Benchmark
→ PO Assessment & Decisions
→ Actions & Tracking
→ Repeat Research
→ Snapshot Comparison
→ CSV Data Enrichment
→ Updated Insights & Decisions.

The product must answer:

- What did we learn?
- What evidence supports it?
- Which entities/products should we compare?
- What changed since the previous research?
- What should the PO do next?
- What happened after the PO acted?

Do not turn the project into a Markdown viewer, raw JSON viewer, generic CSV spreadsheet, unrelated dashboards or an AI crawler.

Keep the existing po_research_v1 one-paste import contract compatible.

## 2. RESEARCH DATA PRINCIPLES

- Domain-agnostic business taxonomy.
- No Puzzle, ASMR, Drama, AdMob or education-specific hardcoding.
- Separate observed facts, estimated metrics, inferred findings, hypotheses and PO decisions.
- Evidence must retain provider, scope, units, period and verification status.
- Preserve original source material.
- Avoid data duplication across reports and snapshots.
- Never fabricate identifiers, competitor metrics, downloads, growth, revenue or causal claims.
- Never claim research trends from review counts, installs milestones or search results.
- Do not call paid AI APIs or Codex CLI for report reasoning.
- ChatGPT Plus remains the user-operated semantic analysis engine.
- Public findings and internal/private CSV must not be uploaded to external services automatically.

## 3. ROADMAP — IMPLEMENT IN ORDER

### P01 — Insight & Benchmark UX

Goal:
Make research findings usable immediately for comparison and PO assessment.

Deliver:
- Concise expandable Insight cards.
- Human-readable scope, uncertainty and evidence.
- Add to Benchmark with immediate inline feedback.
- Button changes to "Đã thêm" and offers "Xem Benchmark".
- Benchmark matrix: comparable entities/products as rows and dimensions as columns.
- Findings support cells/dimensions rather than becoming peer product rows.
- For non-competitor research, use a contextual Insight Assessment view.
- Contextual PO Assessment, Notes and Next Action.
- Atomic Add/Remove persistence and safe handling of orphan references.
- No detached long list of forms.

Acceptance:
Insight → Add to Benchmark → See product matrix or contextual assessment → Save PO notes → Refresh → Data preserved.

Do not implement Actions Dashboard or snapshots during P01.

### P02 — PO Actions & Dashboard

Goal:
Turn findings and PO decisions into managed work.

Deliver:
- Action records with title, status, priority, optional owner/due date.
- Link each action to source finding/entity/benchmark and report.
- Create Action directly from relevant context.
- Consolidated dashboard with filters and status updates.
- Navigate from Action back to source research.
- Preserve old Next Action notes; conversion to a real task requires explicit PO action.

Acceptance:
Create Action from finding → Find it in Dashboard → Change status → Refresh → Return to original finding.

No automatic mass task generation.

### P03 — Research Projects & Snapshots

Goal:
Support repeated research over time.

Deliver:
- Connect imported reports to existing ResearchProjects.
- Multiple immutable research snapshots per project.
- Research scope, captured period and version metadata.
- Snapshot history and user-controlled baseline selection.
- Safe association of legacy imported reports.
- Separate report content identity from snapshot identity.
- Retain PO assessments/actions linked to historical snapshots.
- Preserve finalized Research Run Manifests.

Acceptance:
Same topic researched twice → two independent snapshots → historical findings, assessments and actions remain accessible.

No comparison service in P03.

### P04 — Change Detection & Growth

Goal:
Show exactly what changed between research snapshots.

Deliver:
- Structured snapshot comparison.
- New observations/findings.
- Changed or conflicting evidence.
- Unmatched findings requiring review.
- Entity matching based on verified IDs or PO-confirmed mappings.
- Explicit distinction between "not mentioned now" and "removed".
- Comparable numeric delta only when metric, unit, scope, period and methodology support it.
- Green upward icon for positive numeric delta.
- Red downward icon for negative numeric delta.
- Gray neutral state for flat/unknown.
- Separate numeric direction from business favorability.
- Flag impacted PO actions as needing review, without changing decisions automatically.

Acceptance:
Two snapshots → What's Changed view → Source-backed changes and valid numeric deltas.

### P05 — CSV Dataset Import & Mapping

Goal:
Make external tabular data reusable.

Deliver:
- CSV upload with robust quoting, delimiter, encoding and multiline support.
- Header row selection.
- Rows/columns preview.
- Automatic type inference with manual correction.
- Generic dimension/metric/date/entity/GEO/OS column roles.
- Units, provider, estimation status and aggregation metadata.
- Schema/mapping version.
- Original dataset preservation with checksum.
- Link datasets to Research Project and Snapshot.
- Store raw datasets efficiently, without duplicating them in each report.
- CSV stays local; never auto-upload private data externally.

Acceptance:
Two different CSV formats → Correct mapping → Save → Reopen → Link dataset → No lost rows or numeric type errors.

Do not hardcode AdMob or Sensor Tower column names as the only supported formats.

### P06 — Dataset Explorer & Filters

Goal:
Provide a reporting experience inspired by AdMob Report Daily while remaining domain-agnostic.

Deliver:
- Dynamic filter bar generated from mapped dataset dimensions.
- Date, entity/app, GEO, OS and other mapped filters when available.
- Dimension selection and metric selection.
- Search, sorting, pagination/virtualization.
- Metric formatting by unit.
- Time series and dimension breakdown charts.
- Save and reopen filtered views.
- Correct aggregation rules.
- Ratio/rate metrics must use correct numerators/denominators where available.
- Unsupported aggregations must not fabricate values.
- Numeric growth indicators: green up, red down, neutral missing/flat.
- Comparison coverage and source quality visible.

Acceptance:
Filter a real mapped dataset → Select group by + metrics → See correct table/chart → Save view → Refresh → Same result.

This is a research data explorer, not a spreadsheet editor.

### P07 — Deterministic Data-Driven Insight Enrichment

Goal:
CSV data must add real quantitative intelligence to existing research, not just standalone metrics.

Deliver:

1. Data compatibility:
- Link dataset rows to research entities through known IDs or confirmed mappings.
- Validate GEO, OS, period, metric definition, currency, unit and source methodology.
- Reject silent ambiguous joins.

2. Quantitative evidence:
- Calculate supported metric changes and comparisons.
- Produce structured data-backed observations with source row/dataset references.
- Identify findings/benchmarks whose evidence may be supplemented or challenged.
- Separate observed metrics, estimates and hypotheses.

3. Insight impact:
- Show which findings gained new quantitative evidence.
- Show which opportunities/decisions need reconsideration.
- Show which existing PO actions may be impacted.
- Do not auto-update judgments or write unsupported causal claims.

4. Versioning:
- Preserve original public research and prior data.
- Create an enrichment version associated with the Research Snapshot.
- Dataset/mapping revisions must be traceable and must not silently change historical results.

Acceptance:
Import a relevant CSV → Link it to existing research → Obtain evidence-backed quantitative observations → See impacted findings/decisions → Compare before and after enrichment.

If CSV is irrelevant or incompatible, report no supported insight changes.

No AI inference in P07.

### P08 — ChatGPT Re-synthesis & End-to-End UAT

Goal:
Update semantic product insights using enriched quantitative evidence.

Deliver:

1. Evidence Packet Builder:
- Prepare prior research summary.
- Include only relevant findings and cited evidence.
- Include selected normalized CSV metrics and deltas.
- Include units, GEO, OS, periods and data limitations.
- Clearly separate public observations and supplied private data.
- Allow PO to preview and choose what is copied/shared.

2. ChatGPT Plus workflow:
- Generate a research update prompt requesting new analysis using this packet.
- Use po_research_v1 or an explicitly versioned compatible enrichment contract.
- User copies packet to ChatGPT Plus.
- User pastes the result back ONCE.
- Import results as an enrichment/revised interpretation, not an overwrite.

3. Insight revision:
- Show Before vs After conclusion.
- Show new evidence that supports a revised conclusion.
- Explain what remains unknown.
- Indicate business implications and impacted PO Actions.
- PO approves/rejects suggested updates.
- No automatic changes to completed tasks or historical decisions.

4. End-to-end browser UAT:
Research → Import → Insights → Benchmark → Assessment → Create Action
→ Research again → Compare snapshots → Import CSV → Map columns
→ Filter dataset → Enrich findings → Re-synthesize through ChatGPT
→ Review changes → Update decision → Refresh.

Acceptance:
A user can conduct an ongoing research project, add CSV evidence and obtain an updated evidence-backed PO analysis without manually rebuilding insights.

Mark LIVE CHATGPT UAT as NOT VERIFIED if actual user-provided responses are unavailable.
Do not simulate an external AI result and claim live compatibility.

## 4. CONSISTENT UI RULES

Use clear product language and prioritize the PO's next action.

No raw scope JSON or redundant verification badges on main cards.

All buttons must have immediate local feedback and clear outcomes.

Insights, benchmark observations, decisions and actions must be navigable in both directions.

No empty dashboard tabs or placeholder charts claiming to be functional.

Show numbers with proper units, source, scope, period and data quality.

Use directional formatting consistently:
- Increase: green + up arrow
- Decrease: red + down arrow
- Flat: neutral
- Unknown/incomparable: no growth claim

Never interpret increased CPI, churn or error rate as a good business outcome merely because the number increased.

All these conventions must be reusable across research categories.

## 5. ENGINEERING & QUOTA CONTROL

For each task:

1. Audit only the relevant source modules.
2. Write a short implementation plan.
3. Implement the smallest complete vertical slice.
4. Add targeted backend/frontend tests.
5. Execute available tests and TypeScript/build checks.
6. Run browser UAT when possible, with real interaction.
7. Document limitations honestly.
8. Commit changes.
9. STOP and wait for PO approval.

Prefer one coding session for one task. Avoid unnecessary agents, full-repository rereads and unrelated refactoring.

Do not mark a task complete based solely on test pass counts.

Do not add paid APIs or unnecessary AI calls.

## 6. DATA SAFETY

- Additive migrations only unless explicitly approved.
- Backup/check the SQLite database before schema-changing tasks.
- Never truncate existing report, evidence, benchmark or action data.
- Maintain compatibility with current po_research_v1.
- Protect immutable Run Manifests.
- Never overwrite previous snapshots or evidence packets.
- Handle duplicate imports and unstable ChatGPT-generated local keys safely.
- Use explicit PO-confirmed mapping for ambiguous entity identity.
- Keep source datasets versioned and traceable.

## 7. TEST & ACCEPTANCE

Use realistic multi-domain reports:
- Puzzle
- ASMR
- Education
- Utilities or Drama
- Ad Monetization
- An unfamiliar non-mobile domain

These are test domains, not hardcoded business taxonomy.

For CSV tests, cover:
- Sensor Tower-style estimated downloads/revenue
- AdMob-style ad metric exports
- Generic unrelated CSV format
- Missing values
- Misformatted dates/numbers
- Different GEO/OS
- Duplicate source rows
- Incompatible comparison periods

When real user exports are unavailable, state REAL CSV COMPATIBILITY: NOT VERIFIED.

Do not claim browser UAT passed unless actually executed.

## 8. DELIVERY & STOP GATE

Create and maintain:

docs/PO_INTELLIGENCE_MASTER_PLAN.md

And per-task handoffs:
.bangiao/P01.md
.bangiao/P02.md
.bangiao/P03.md
.bangiao/P04.md
.bangiao/P05.md
.bangiao/P06.md
.bangiao/P07.md
.bangiao/P08.md

Each task handoff contains:
- Goal
- Actual implementation
- Files changed
- Migration/API changes
- Tests executed and their results
- Browser UAT evidence/status
- Known gaps
- Commit SHA
- Readiness for PO review

DO NOT automatically execute the entire roadmap.

IN THIS SESSION: execute P01 ONLY.

After finishing P01:
- report the commit SHA;
- report test/UAT status;
- explain unresolved blockers;
- STOP.

Wait for explicit PO approval before P02.

## FINAL PRODUCT PRINCIPLE

PO Intelligence Hub succeeds only when research and new data lead to better supported product decisions and trackable actions.

More tables, dashboards and JSON fields are not evidence of product success.

Prioritize end-to-end PO value over implementation volume.