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
