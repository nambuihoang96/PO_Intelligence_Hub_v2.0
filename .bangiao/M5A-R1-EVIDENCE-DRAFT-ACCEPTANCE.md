# M5-A R1 — Evidence Consistency & Decision Draft Protection

## Kết quả

- **Branch:** `feat/ux-recovery-01-research-results`
- **HEAD trước khi làm:** `97f5349c7a1d70d86aa9e57e342f886098a2b55e`
- **Migration:** Không thêm migration; giữ nguyên dữ liệu CSV/report hiện có.
- **Trạng thái:** `TECHNICAL PASS`; `PRODUCT PASS` cho luồng PO decision được kiểm thử.

## Root causes và cách xử lý

1. **Evidence trong PO review không theo projection M2.** Candidate measurements lấy dữ liệu CSV gốc trực tiếp, nên có thể bỏ qua metadata review và readiness được lưu ở lớp overlay. Backend hiện dùng `effective_observations` và cùng predicate `_observation_usable` của M2; hiển thị riêng complete observation, readiness theo M2, verification, metadata provenance và lý do validation. Readiness của một observation không khẳng định cả cặp dữ liệu đã tương thích; giao diện nêu rõ bước Compare Periods vẫn kiểm tra scope/period của cả cặp.
2. **Lần lưu decision thứ hai trả 422.** Browser UAT tái hiện được: sau lần lưu đầu, response chứa metadata do server quản lý (`candidate_name`, `dataset_filename`, `selection_reason`, `updated_at`, `revision`). UI spread toàn bộ object response vào request tiếp theo, trong khi request schema cấm các metadata này. Frontend hiện dựng payload theo whitelist các trường PO được phép ghi; regression test mô phỏng metadata response và kiểm tra lần lưu thứ hai dùng revision mới mà không gửi metadata dư.
3. **Draft PO có thể bị ghi đè hoặc mất khi người dùng rời candidate.** Trạng thái dirty được so sánh với snapshot đã lưu; đổi candidate, refresh trong ứng dụng và điều hướng nội bộ hiện có bước Save / Discard / Continue editing. Lỗi lưu giữ nguyên draft và cho retry. Response cũ không ghi đè chỉnh sửa mới; cập nhật membership/workspace không được coi là xác nhận cho các sửa đổi PO sau đó.
4. **Assessment kiểu observed fact chưa buộc phải có căn cứ trong UI.** UI cảnh báo khi assessment `Observed fact` chưa gắn evidence, cho phép gắn evidence chính xác vào từng assessment, và backend xác thực các reference cả ở assessment lẫn danh sách evidence chung. Reference giả/stale bị từ chối; assessment hợp lệ được resolve khi mở lại.
5. **Candidate lịch sử bị nhầm là nguồn stale.** Candidate bị bỏ khỏi shortlist nhưng dataset/hash/entity gốc vẫn còn được đưa vào khu vực lịch sử, với measurement và note gốc. Chỉ đánh dấu stale khi đúng source hoặc identity không còn resolve được; không âm thầm remap key.

## Thay đổi

- `backend/app/opportunities.py` — M2 effective observation/readiness/provenance, resolve assessment evidence, historical source resolution.
- `frontend/src/research/api.ts` — metadata cho active/historical candidate; giải thích field-level validation errors.
- `frontend/src/research/OpportunityReview.tsx` — bảo vệ PO draft, chống stale response, evidence-aware assessment, phân biệt nguồn lịch sử và nguồn stale; chỉ gửi request fields hợp lệ.
- `frontend/src/style.css` — draft confirmation, trạng thái evidence, validation/provenance progressive disclosure và responsive layout.
- `frontend/src/research/OpportunityReview.test.tsx` — candidate switch, discard/continue/save, stale response, conflict/retry, observed-fact evidence, approximate zero, repeated save.
- `tests/test_workspace_data_first.py` — M2 overlay và CSV immutability, approximate zero, assessment evidence validation, historical decision.
- `.bangiao/M5A-R1-EVIDENCE-DRAFT-ACCEPTANCE.md` — handoff này.

Không đổi API/database schema hoặc migrations. `scripts/setup.ps1` là thay đổi có sẵn của người dùng từ trước; không stage/commit. Các scratch folders có sẵn cũng được giữ nguyên.

## Kiểm thử

- Backend toàn bộ: **143 passed**.
- Frontend toàn bộ: **151 passed** (`--maxWorkers=1` để tránh timeout do tải song song trên Windows).
- OpportunityReview tập trung: **12 passed**.
- TypeScript: **passed**.
- Production build: **passed**; Vite vẫn in cảnh báo bundle JS vượt ngưỡng 500 kB, không làm build thất bại.
- Alembic upgrade cô lập đến `20261024_0009`: **passed**; task không thêm migration.
- `git diff --check`: **passed**.

Lần chạy frontend song song đầu tiên timeout ở hai suite không liên quan; từng suite qua khi chạy riêng và toàn bộ 15 suite qua khi giới hạn một worker. Lần chạy backend sandbox ban đầu bị Windows từ chối tạo thư mục SQLite tạm; lần chạy được cấp quyền cho test temp hoàn tất 143/143.

## Browser UAT

**Đã kiểm thử thực tế** trên in-app browser với backend/frontend ở cổng riêng và SQLite UAT cô lập. Workspace UAT chứa hai sản phẩm và một CSV fixture tổng hợp; database tạm đã được xóa sau khi dừng hai server UAT.

**Sai sót chuẩn bị UAT đã được khắc phục:** lần seed đầu không đặt biến `APP_DATA_ROOT`, nên tạo hai workspace thử nghiệm và một CSV fixture trong SQLite theo cấu hình mặc định. Mình xóa đúng hai workspace do lượt UAT này tạo (`21eaa334-9bbc-4187-9a15-fab8152d4079`, `bd6c2249-9d87-4313-85f2-71e031dbbace`) cùng dataset fixture `0ba23137-6bd7-4ad6-81e3-6621d3c9d7be`, rồi truy vấn xác nhận không còn các bản ghi đó. Không có report, CSV sẵn có, PO decision hay run manifest hiện hữu nào bị sửa hoặc xóa. Phần browser UAT hoàn chỉnh sau đó dùng SQLite riêng.

Đã thao tác:

1. Mở Opportunity Review và xác nhận hai candidate, source row, scope, provenance, trạng thái `unverified` và trạng thái M2 `not eligible` khi fixture thiếu metadata xác minh.
2. Gắn source row vào decision và assessment `Observed fact`; xác nhận cảnh báo xuất hiện trước khi evidence được gắn và biến mất khi chọn reference.
3. Lưu lần đầu, chỉnh sửa và lưu lần hai. Lần hai ban đầu trả 422; sau khi sửa whitelist request, lưu lần hai thành công.
4. Tạo draft, chọn candidate khác; dialog giữ ba lựa chọn. `Continue editing` giữ draft; `Discard changes` chuyển candidate sau xác nhận.
5. Mở lại candidate và bấm Refresh; rationale đã lưu, next action, assessment và evidence reference vẫn còn.

Không lưu screenshot vào repo. Đây là kiểm thử chức năng/browser, không phải visual audit. Không kiểm tra các kích thước viewport vì scope này tập trung vào thao tác decision/evidence.

## Known limitations

- Dataset UAT được cố ý để thiếu metadata provider-confirmed, vì vậy row hiển thị chưa đủ điều kiện theo predicate M2; điều này đúng với trạng thái dữ liệu thử và không đồng nghĩa source đã được xác minh.
- `Observed fact` được cảnh báo và hỗ trợ gắn evidence, nhưng task không tạo hệ thống tự xác minh nguồn bên ngoài.
- Vite production build phát cảnh báo bundle trên 500 kB; code splitting nằm ngoài phạm vi.

## Product Acceptance

- **PO goal:** Đánh giá một candidate bằng evidence còn truy vết được, lưu rationale/assessment/next action và mở lại được mà không mất nháp.
- **User journey:** Chọn candidate → kiểm tra measurement/provenance → gắn supporting/contradictory evidence → nhập PO decision và assessment → lưu → đổi candidate/refresh → mở lại.
- **Automated work:** Dùng effective metadata M2, kiểm tra readiness/ref, phát hiện reference stale, kiểm soát revision, chặn điều hướng vô tình khi còn draft, giữ measurement gốc bất biến.
- **Expected result:** Decision PO được lưu riêng với nguồn nghiên cứu; observation hiển thị scope, provenance, độ chính xác và readiness; lịch sử còn nguồn được phân biệt với nguồn mất.
- **Remaining friction:** PO vẫn phải chọn evidence reference một cách tường minh; ứng dụng không tự xác minh nguồn hay tự suy luận measurement bị thiếu.
- **Verification:** 143 backend tests, 151 frontend tests, TypeScript/build, migration và browser UAT cô lập đã chạy; chi tiết ở trên.
- **Decision:** `PRODUCT PASS` trong phạm vi evidence-linked PO decision và draft safety.

## Git handoff

- **Implementation commit:** `d0ea2c7` — `fix(m5a-r1): align evidence and protect decision drafts`.
- **Push:** Sẽ push implementation và handoff commit lên `origin/feat/ux-recovery-01-research-results`; không merge.
- **Merge:** Không thực hiện.
