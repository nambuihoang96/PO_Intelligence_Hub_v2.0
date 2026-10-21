# PO Hub Repository Instructions

These instructions apply to all work in this repository. Follow the user's current task and preserve the safeguards below.

## Product-first principle

The Product Owner must not need to understand database schemas, entity mappings, APIs, internal data models, or programming concepts to complete a normal business task. PO Hub should adapt to the Product Owner's workflow, not force the Product Owner to adapt to the code.

## Business-first thinking

Before implementing a user-facing feature, establish:

- The business problem the PO wants to solve.
- What the PO expects to do and see.
- What the application can automate safely.
- What genuinely requires manual confirmation.

Define success as a business outcome, not only as technical deliverables.

## Minimize manual work

- Do not require repetitive actions that can be automated safely. For example, do not require mapping dozens or hundreds of unmatched CSV products individually, manually merging CSV exports to compare periods, or editing JSON and technical metadata during ordinary workflows.
- Ask for confirmation only when data is ambiguous, conflicting, or potentially destructive.
- Never invent data to simplify a workflow.

## Hide implementation complexity

- Use clear business terminology in the default UI.
- Do not make raw observations, technical identifiers, internal validation structures, or large debug lists the primary user experience.
- Keep technical details available in advanced views when needed.

## Deliver useful results

Successful data import is not the final business outcome. A PO should be able to explore data, compare products, understand trends, and determine a next action.

Design workflows to cover: **Input → Processing → Review exceptions → Useful result → Next action**.

## Progressive disclosure

Prioritize clear summaries, useful tables and charts, sensible filters, important warnings, and primary next actions. Keep advanced technical options secondary.

## Realistic acceptance

- Do not rely exclusively on small synthetic fixtures.
- For CSV import, consider dozens or hundreds of products.
- For comparisons, consider multiple CSVs, missing products, incompatible scopes, and incomplete measurements.
- For charts, consider insufficient data and missing periods.
- Perform browser UAT where possible. Never claim UAT passed if it was not performed.

## Product acceptance gate

Before declaring a user-facing task complete, evaluate technical correctness, data correctness, business usability, workflow completeness, UX clarity, and realistic test coverage.

A feature that passes automated tests but cannot be used effectively by a PO is **PRODUCT NEEDS FIX**.

## Avoid overengineering

Prefer the smallest maintainable implementation that fully solves the user's business problem. Do not add unnecessary configuration, screens, manual mapping steps, complex architecture, or confirmation dialogs.

## Preserve existing safeguards

Maintain:

- Existing reports, CSV data, benchmarks, and PO notes.
- Backward compatibility.
- Evidence and provenance.
- Accurate GEO, platform, and period handling.
- No fabricated metrics.
- Safe database migrations and no destructive database resets.
- No automatic merge to master.
- Explicit PO approval for release.

## Handoff: Product Acceptance

For future user-facing tasks, include a short **Product Acceptance** section in the handoff document:

- **PO goal:** What business task does this feature solve?
- **User journey:** What steps does the PO take?
- **Automated work:** What does the application handle?
- **Expected result:** What useful result is displayed?
- **Remaining friction:** What is still confusing or manual?
- **Verification:** What tests and browser scenarios were actually run?
- **Decision:** `TECHNICAL PASS`, `PRODUCT PASS`, or `NEEDS FIX`.

Do not declare `PRODUCT PASS` if a core business workflow remains incomplete.

## Scope control

Follow the user's explicit task boundaries. Do not create, modify, configure, or invoke a Planner/Coder/Tester/Reviewer multi-agent system unless the user explicitly requests it in a future task.
