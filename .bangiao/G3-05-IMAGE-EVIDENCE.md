# G3-05 — Local Image Evidence

**Status:** `READY_FOR_OWNER`; browser UAT and genuine owner-image acceptance are not verified.
**Branch:** `feat/ux-recovery-01-research-results`
**Starting HEAD:** `b284c84`
**Production SQLite:** not accessed or modified.

## Outcome

Project Research now lets a PO attach a local PNG, JPEG, or WebP image to a saved project subject, either with a saved trend update's source context or a short independent source note. The image, SHA-256, filename, byte count, source note/title/link/date, subject and optional trend-update relationship are stored together in the configured SQLite database. Saved images can be previewed, reopened, and reloaded after refresh.

This adds no OCR, image interpretation, remote upload, source fetching, AI calls, or verification. Every attachment stays `source_reported_unverified`. Images are append-only; there is no silent replace/delete action. A single file is limited to 10 MB.

## Implementation

- Additive Alembic revision `20261027_0013` creates `project_image_evidence`. The original Research Run `Evidence` table and immutable manifests are untouched.
- Image bytes are stored as SQLite BLOBs so a database copy/backup keeps the files with their attribution. Supported image signatures are checked against declared PNG/JPEG/WebP MIME; SVG/HTML and mismatches are rejected. Source links are retained but never fetched.
- Project/subject and optional project/subject/trend-update relationships are constrained. The form only offers saved project subjects and only matching trend updates.
- API:
  - `POST /api/v1/projects/{project_id}/subjects/{subject_id}/image-evidence` — append image plus source context.
  - `GET /api/v1/projects/{project_id}/image-evidence` — paginated saved image list, optional subject filter.
  - `GET /api/v1/projects/{project_id}/image-evidence/{evidence_id}/content` — retrieve original bytes inline.
- The Project Research page now includes a responsive Image Evidence panel with local preview, source context, saved thumbnail, unverified state, and expandable hash details.

## Files changed

- `backend/app/image_evidence.py`
- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/migrations/versions/20261027_0013_project_image_evidence.py`
- `frontend/src/research/api.ts`
- `frontend/src/research/DataFirstWorkspace.tsx`
- `frontend/src/research/ImageEvidencePanel.tsx`
- `frontend/src/research/ImageEvidencePanel.test.tsx`
- `frontend/src/style.css`
- `tests/test_image_evidence.py`
- `docs/RECOVERY_BOARD.md`
- `.bangiao/G3-05-IMAGE-EVIDENCE.md`

## Verification

- Focused backend: **31 passed** across image evidence, trend updates, benchmark collections, subjects and data-first workspace tests. Includes migration to head in an isolated SQLite root, byte/hash/source attribution persistence after reopening the database, saved trend context preservation, scope mismatch, missing source note, unsafe link, unsupported/mismatched type, oversize image and OpenAPI paths.
- Frontend: **176 passed** across 21 test files.
- TypeScript + production build: **passed**. Existing Vite advisory remains: main JS bundle is 537.90 kB minified.
- `git diff --check`: **passed** for the tracked working diff; newly added implementation and handoff files are also checked in the staged review diff before commit.
- Full backend suite: **NOT VERIFIED**. The first attempt was blocked by the runner's denied temporary-directory permissions. With temporary files redirected into the workspace, the broader suite stalled in the Windows ASGI TestClient/asyncio event-loop path and had to be stopped; no suite-wide pass is claimed.
- Browser UAT/screenshots: **NOT VERIFIED**. The Windows TestClient could not create its Proactor socket pair in this restricted runner. No working browser session against the new backend was available during this slice. The UI test is component-level, not browser evidence.
- Genuine owner image / Rotate Rings case: **NOT VERIFIED**; no genuine image artifact was supplied for this work.
- Production database: untouched. All migration and persistence tests used isolated `.test-tmp` data roots.

## Product Acceptance

- **PO goal:** Keep a source image attached to the correct confirmed subject/update and find it again without losing its provenance.
- **User journey:** Project Research → choose a saved subject → choose a saved trend update or enter source context → select local image → preview → save → reopen the image and source details from Saved images after refresh.
- **Automated work:** The app validates the subject/update relationship, file size/type, hashes and stores the original bytes and source context together.
- **Expected result:** The exact image and attribution remain accessible in the project and explicitly unverified.
- **Remaining friction:** A subject must already exist. No delete/replace or image annotation tools are provided. Browser UAT and a genuine owner-image scenario remain unverified.
- **Verification:** Focused backend and frontend tests, TypeScript/build; browser UAT **NOT VERIFIED**.
- **Decision:** `TECHNICAL PASS` for the bounded persistence and component workflow; `PRODUCT NEEDS FIX` pending real-browser and owner-image verification. Owner acceptance remains pending.

## Known limitations

- SQLite BLOB storage keeps backups self-contained but can enlarge the database; 10 MB per-image cap is enforced, with no separate total-project quota yet.
- The browser UX, actual inline image rendering, refresh/reopen journey and responsive layout were not exercised in a real browser.
- No OCR, chart value extraction, image claims, or verification is performed.

**Implementation commit:** `100c994b2dab77b1ad2f632abbe1d732cc5c8543`
