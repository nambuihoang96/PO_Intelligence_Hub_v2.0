# G3-04 feedback round — data-first capture and reopen — 2026-10-28

## Status

`IN_PROGRESS / DATA-FIRST CAPTURE + REOPEN BROWSER PASS / FULL TREND-SOURCE FLOW NOT VERIFIED`

## Browser evidence

- Used the isolated project `[QA] Peachy Studio UAT` in database `.peachy-g1-qa-20261028`.
- Saved a clearly labeled QA note without a subject, date, source title, or URL.
- The app showed success and `Theo nguồn cung cấp · chưa xác minh`.
- Reloaded the same Project Research URL and confirmed the exact note remained visible and unlinked.
- Screenshot: `.bangiao/screenshots/g3-04/data-first-note-refresh-375.png` (real app, Browser Use viewport 375px).
- No production SQLite or existing research data was touched.

## Limits

This verifies the new content-first capture and persistence path only. It does not verify a genuine Trend Update, explicit subject/collection association, the full Trend → Subject → Analysis → Image Evidence workflow, or desktop/390px responsiveness. The QA note is synthetic and is not evidence of market research.

## Product Acceptance

- **PO goal:** Capture research-adjacent information immediately, before metadata is known, and find it again later.
- **User journey:** Project → Lưu thông tin → save without subject/date/source → refresh → reopen the same saved note.
- **Automated work:** The existing app stores original text and provenance without requiring a subject or metadata.
- **Expected result:** Exact QA note persists and is visibly marked unverified and unlinked.
- **Remaining friction:** Linking to a subject/collection and adding a genuine source-backed trend claim still need browser acceptance.
- **Verification:** Browser Use at 375px; isolated QA database; no production writes.
- **Decision:** `SCOPED BROWSER PASS / OWNER REVIEW PENDING`; G3-04 remains `IN_PROGRESS`, not Product Accepted.
