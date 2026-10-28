# G3-05 feedback round — data-first image attachment verification — 2026-10-28

## Status

`IN_PROGRESS / TECHNICAL PASS FOR SAVED-INFORMATION IMAGE PATH / BROWSER UPLOAD NOT VERIFIED / OWNER IMAGE NOT VERIFIED`

## Change and rationale

The approved Project Home flow places content-first “Lưu thông tin” ahead of choosing a product/topic. The existing `ProjectSavedInformation` API/model already accepts an optional image without a subject and retains local image URL/hash/provenance. This round adds regression coverage; it does not change the backend, migration, or product behavior.

## Verification

- Frontend `SavedInformationPanel.test.tsx`: 5/5 PASS, including image upload payload with `subject_id: null`, reload, image URL, filename, and unverified caption.
- Backend `tests/test_saved_information.py` + `tests/test_image_evidence.py`: 10 PASS against isolated test SQLite.
- Full frontend suite: 26 files / 222 tests PASS.
- TypeScript: PASS.
- Production build: PASS; existing Vite bundle advisory at 617.36 kB.
- Browser opened the QA Saved Information form at `15310` using isolated database `.peachy-g1-qa-20261028`. The optional image picker was visible, but Browser Use did not open a native file chooser when activated; upload/reload was not claimed as Browser UAT.
- No production SQLite was accessed. No schema change was made.

## Changed file

- `frontend/src/research/SavedInformationPanel.test.tsx`

## Product Acceptance

- **PO goal:** Save an observation and its evidence image without first creating a product/topic.
- **User journey:** Project → Lưu thông tin → add optional image → save → reopen saved item.
- **Automated work:** Existing backend stores image bytes/hash and source context, supports unverified provenance, and reloads the saved item; test now protects the subject-free upload contract.
- **Expected result:** A saved observation and local image remain together and marked unverified.
- **Remaining friction:** Real file-picker upload/reopen through browser and a genuine PO image were not verified. Exact 390/1440 screenshot was not required or claimed for this regression-only slice.
- **Verification:** 222 frontend tests; 10 backend tests; typecheck/build; browser form opened but file selection was blocked by the available Browser Use file-input wrapper.
- **Decision:** `TECHNICAL PASS` for the covered path; G3-05 remains `IN_PROGRESS`, not `DEV_DONE` or Product Accepted.

## Commit

- Code/test: `46d82e5`.
- Recovery Board and milestone record: following documentation commit.
## Browser upload closure — 2026-10-28

### Result

`DEV_DONE` for the existing image-attachment workflow, with isolated browser UAT and focused regression tests passing. Owner review remains pending; this is not Product Acceptance.

### Browser UAT

- Environment: existing QA frontend `http://127.0.0.1:15310`, backend `127.0.0.1:15311`, isolated database `.peachy-g1-qa-20261028`.
- Opened Project “Lưu thông tin” and attached a locally generated QA-only PNG through the actual browser file chooser before selecting a product/topic.
- Saved a second QA note with explicit source context and the same synthetic image.
- Refreshed the page. Both new records and the previously saved QA note remained. The newest retained the exact source context; its image loaded as 320×180 and remained labeled `Tệp lưu cục bộ · Chưa xác minh`.
- Screenshots: `.bangiao/screenshots/g3-05/saved-image-after-refresh.jpg` and `.bangiao/screenshots/g3-05/saved-image-source-after-refresh.jpg`.
- Synthetic QA material only; it is not owner-provided evidence. No production SQLite was accessed.

### Tests

- `SavedInformationPanel.test.tsx`: 5/5 PASS. Vitest first hit an OS temp-folder `EPERM`; the same test passed with task-local `TEMP`/`TMP`.
- `tests/test_saved_information.py` and `tests/test_image_evidence.py`: 10/10 PASS.
- No application code changed in this verification round, so TypeScript and production build were not rerun.

### Product Acceptance

- **PO goal:** attach a local image to a project note before selecting a product/topic.
- **User journey:** Project → “Lưu thông tin” → attach image and optional context → save → refresh/reopen.
- **Automated work:** store image bytes/metadata/hash and source context; serve the same image after refresh.
- **Expected result:** the original note and image remain available and clearly unverified.
- **Remaining friction:** no genuine owner image/source was available; genuine-source acceptance remains unverified.
- **Verification:** actual browser file chooser, save, refresh and image re-render; focused frontend/backend regressions.
- **Decision:** `TECHNICAL PASS / OWNER PRODUCT REVIEW PENDING`.