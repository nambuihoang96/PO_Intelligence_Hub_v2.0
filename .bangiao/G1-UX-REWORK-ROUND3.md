# G1 UX Rework — Round 3

**Status:** `DEV_DONE / READY_FOR_OWNER`
**Product decision:** `NEEDS FIX / OWNER REVIEW PENDING` — no Product Pass is claimed.
**Branch:** `feat/ux-recovery-01-research-results`
**HEAD before this round:** `fbc96ba07507c73908febfbb98cd3e648c5d91c8`

## Owner feedback and scope

The owner retained the unified Peachy shell but rejected the Project Home composition, Report Reader architecture, and remaining Research Home inconsistency. This was a UI/UX rework of existing G1-01, G1-02, and G1-03 tasks, not a feature expansion. Backend, API, schema, migrations, reports, benchmark selections, and PO data were not changed.

## Changes

- Research Home now presents project reopening/creation and recent reports as two clear destinations. Report links reuse existing report IDs.
- Project Home uses a single project identity header, the three approved primary actions, saved reports as the main result, recent activity as supporting context, and other saved project information below. Empty support sections stay hidden.
- Report Reader now has contextual project navigation, a report header and scope, a data-source section, in-report navigation, the selected report content, and a support rail for source references, report recommendations, and saved PO decisions. The full original report remains available.
- Text-only reports remain explicitly unstructured and show the existing structuring path; no findings are inferred from their headings.
- Structured layout was exercised with a conspicuously synthetic `[QA ONLY]` report. It is not research evidence and its `example.invalid` reference was not opened.
- On mobile, removed a duplicate report breadcrumb and compacted the project context so the report navigation and start of report content appear sooner.

## Screenshot evidence

All images below are real captures of the running local application using an isolated QA database. Desktop viewport is 1440×900; mobile viewport is 390×844. The browser capture measured 390px `innerWidth`, document width, and body width on all mobile routes. No horizontal overflow was measured.

| Screen | Before | After |
|---|---|---|
| Research Home | [Round 2 desktop](screenshots/g1-03-peachy/round-2/research-home-desktop-1440x900.png), [mobile](screenshots/g1-03-peachy/round-2/research-home-mobile-390x844.png) | [1440×900](screenshots/g1-03-peachy/round-3/research-home-1440x900.png), [390×844](screenshots/g1-03-peachy/round-3/research-home-390x844.png) |
| Project Home | [Round 2 desktop](screenshots/g1-03-peachy/round-2/project-home-desktop-1440x900.png), [mobile](screenshots/g1-03-peachy/round-2/project-home-390x844.png) | [1440×900](screenshots/g1-03-peachy/round-3/project-home-1440x900.png), [390×844](screenshots/g1-03-peachy/round-3/project-home-390x844.png) |
| Report Reader — text only | [Round 2 desktop](screenshots/g1-03-peachy/round-2/report-reader-desktop-1440x900.png), [mobile](screenshots/g1-03-peachy/round-2/report-reader-390x844.png) | [1440×900](screenshots/g1-03-peachy/round-3/report-text-only-1440x900.png), [390×844](screenshots/g1-03-peachy/round-3/report-text-only-390x844.png) |
| Report Reader — structured QA fixture | Round 2 had no structured QA report | [1440×900](screenshots/g1-03-peachy/round-3/report-structured-qa-only-1440x900.png), [390×844](screenshots/g1-03-peachy/round-3/report-structured-qa-only-390x844.png) |

## Visual comparison with approved Peachy references

Reference set: `docs/design/approved/peachy/Pastel Vietnamese PO Intelligence Dashboard.png`, `PO Hub Research Dashboard Flowchart.png`, and `PO Intelligence Hub Storyboard.png`.

| Screen | Matches | Differences and assessment |
|---|---|---|
| Research Home | Shared warm shell/sidebar, light surfaces, readable hierarchy, one create action, and saved results. | Unlike the dashboard mockup, this screen is a compact project/recent-report index. That is intentional: it is the approved place to resume or start research, so no dashboard charts or fabricated counts appear. Sparse QA data leaves open canvas below the two useful lists; it is not filled with invented content. |
| Project Home | Peachy shell, strong project identity, visible primary actions, saved report list, supporting activity. | The reference is a populated research dashboard; Project Home prioritizes the three approved tasks and the project’s saved work instead. The QA project has little report data, so support content is secondary and lower on the page. There are no competing six-card blocks or fake market metrics. |
| Report Reader — text only | Shared Peachy navigation, clear title/scope, report navigation, wide reading column, secondary source/PO context. | A text-only report cannot show findings/evidence cards. The UI states that it needs structuring and retains the original text. On mobile, the main report starts after compact project/report context and horizontal section navigation; this uses more vertical space than desktop but avoids squeezing the reading/support columns. |
| Report Reader — structured | In-report TOC/tabs, conclusion/takeaways, finding cards, source and PO side rail. | The reference has richer populated dashboard panels. The fixture validates layout and explicit relationships only; it cannot establish visual/product quality for a genuine owner report. No quantitative charts or content from the design mockup were copied. |

Intentional differences: the approved reference uses sample market metrics, game artwork and populated dashboard cards; this implementation uses actual app data only. Those examples were not copied. The Peachy warm shell is retained; report content receives space and navigation based on available fields.

## Browser UAT

Application: `http://127.0.0.1:15310` with its paired API on `15311`; QA database directory `.peachy-g1-qa-20261028`. Production SQLite was not opened or modified.

- Research Home rendered the QA project, Create Project action and two recent report links.
- Project Home showed `Nghiên cứu chuyên sâu`, `Lưu thông tin`, and `Phân tích CSV`, plus saved reports and activity.
- Opened structured QA report `8f049e5a-1abf-4fa6-9cd5-a8ee0ec226ab`; opened its Findings section and confirmed the finding, report-supplied PO implication, uncertainty, linked entity, evidence reference and `Chưa xác minh` status were accessible.
- Expanded “Xem đoạn hỗ trợ trong báo cáo gốc”; the supplied source location appeared. The `example.invalid` URL was not opened.
- Followed the report’s Project link to project `950d908b-ad16-4719-9955-859d820a9101`; the same project page showed the same report ID. The text-only report `fb238ad0-53b7-4213-bfaa-143244780dd4` remained available and showed the honest text-only structuring state.
- Exact desktop/mobile screenshots were captured at the sizes above. All mobile routes measured 390px document/body width with no horizontal overflow. No production records were used.

**Important limitation:** Both QA reports are synthetic and visibly labeled `[QA]`/`[QA ONLY]`. The structured fixture is not a genuine ChatGPT report. This validates layout and navigation behavior only; real research-content visual acceptance remains for the owner.

## Automated verification

- Frontend: 26 test files, 227 tests passed.
- TypeScript: `npm run typecheck` passed.
- Production build: passed; Vite reports the existing main JS chunk exceeds 500 kB.
- `git diff --check`: passed (Git printed existing LF→CRLF working-copy warnings).
- No backend code changed; no backend/database tests were needed for this frontend-only rework.

## Files changed

- `frontend/src/main.tsx`
- `frontend/src/peachyStudio.css`
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/reports/ResearchIntake.test.tsx`
- `frontend/src/research/ProjectHome.test.tsx`
- `frontend/src/research/ProjectHome.tsx`
- `frontend/src/research/ResearchRunIntegration.test.tsx`
- `frontend/src/research/ResearchWorkspace.tsx`
- `docs/RECOVERY_BOARD.md`
- `docs/design/approved/peachy/` contains the approved reference inputs and is not altered.
- Screenshots: `.bangiao/screenshots/g1-03-peachy/round-3/` (the eight linked evidence captures above).

## Product Acceptance

- **PO goal:** Reopen research from a Project and read its results in a coherent Peachy experience.
- **User journey:** Research Home → Project Home → saved report → findings/evidence or full original report → return to the same Project.
- **Automated work:** Reuses project/report IDs and renders available structured fields, evidence status, recommendation and PO decision separately.
- **Expected result:** Project actions and saved reports are easy to find; report content has contextual navigation and support information without inventing research.
- **Remaining friction:** The structured UAT record is synthetic, mobile report reading still needs scrolling through the compact project context, and the sparse project naturally has open space. The owner must review the actual screenshots and use a genuine structured report for product acceptance.
- **Verification:** 227 frontend tests, TypeScript, production build, real browser route/section/evidence checks, and desktop/mobile app screenshots at the stated viewports.
- **Decision:** `TECHNICAL PASS / PRODUCT NEEDS FIX UNTIL OWNER REVIEW`; not Product Accepted.

## Remaining review items

1. Owner visual review of the before/after screenshots against the approved reference set.
2. Repeat visual/product review with a genuine structured report when one is available in QA.
3. Existing Vite bundle-size advisory remains.

**Implementation commit:** `765b7a376d3709e6c24f481fee074b2b434f7669`.
