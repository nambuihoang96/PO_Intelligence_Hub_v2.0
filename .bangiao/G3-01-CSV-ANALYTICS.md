# G3-01 — CSV Analytics theo luồng Product Owner

Ngày: 2026-10-28
Nhánh: `feat/ux-recovery-01-research-results`
Baseline đã xác nhận: `2bcecd75f6c2b0be42feadf377ee79b97ebb79c3`
Implementation commit: `db9f8891357a823fd92b37ed9392b26e5686d5b5`.

## Kết quả

**Kỹ thuật: PASS có giới hạn. Browser UAT: PARTIAL. Product acceptance: NEEDS FIX / chờ owner review.**

Luồng dữ liệu thật đã hiển thị và thao tác được trong ứng dụng: xem các sản phẩm/metric, tìm kiếm, sắp xếp, mở hồ sơ, thêm vào bộ so sánh, mở prompt nghiên cứu; hồ sơ và membership vẫn còn sau refresh. Chưa xác minh thao tác chọn file trong UI, viewport 1440×900 hoặc mobile 390px; không tuyên bố G3-01 đạt đầy đủ nghiệm thu.

## Root cause

- Dữ liệu CSV trước đó chủ yếu đi qua wizard xác nhận metadata; PO khó đọc giá trị gốc trước khi xử lý các điều kiện so sánh.
- CSV explorer thiếu đường thao tác liền mạch từ một sản phẩm tới hồ sơ, bộ so sánh và prompt nghiên cứu.
- Khi tạo hồ sơ từ bảng CSV rồi điều hướng bằng deep link, `ResearchSubjectsPanel` giữ danh sách đã tải trước đó nên hồ sơ mới chưa xuất hiện cho tới khi tải lại.

## Thay đổi

- Thêm vùng xem dữ liệu CSV gốc ngay trong bước chọn file: số sản phẩm, metric được nhận diện, scope được cung cấp, tìm kiếm, lọc metric, sắp xếp và bảng giá trị nguồn.
- Giữ riêng giá trị gốc với trạng thái xác minh/readiness; không tự suy diễn GEO, nền tảng, kỳ hoặc methodology.
- Hoàn thiện explorer trong Project: bảng sản phẩm, metric selector, tìm kiếm/sắp xếp, trạng thái thiếu metadata, mở/tạo hồ sơ, thêm vào bộ so sánh và chọn sản phẩm để tạo prompt nghiên cứu.
- Deep link mở hồ sơ tải lại danh sách subject để hiển thị hồ sơ vừa tạo.
- Không sửa backend contract, database schema hoặc migration. Không thay đổi SQLite sản xuất.

## Luồng dữ liệu QA thật

- Nguồn: `Unified Top Apps Downloads YoY Growth test.csv` do PO cung cấp.
- Chỉ dùng bản QA cô lập tại `.g3-01-qa-20261028/`; không mở/ghi database sản xuất.
- Tệp dùng dấu chấm phẩy, có 27 dòng, 25 sản phẩm nguồn và 9 metric được nhận diện.
- Import tạo 243 observation; 0 observation đủ điều kiện phân tích/so sánh; preview ghi nhận thiếu GEO/ý nghĩa kỳ, thiếu hoặc sai giá trị và duplicate. UI hiển thị giá trị thô nhưng đánh dấu chưa xác minh/thiếu metadata.
- `Platform=Unified` được giữ nguyên; không đổi thành Android/iOS. Cột Date hiển thị như ngày nguồn, không tự gán đó là kỳ tuần/tháng.
- Dữ liệu đã lưu trong dataset QA; tạo subject QA từ `Surprise Dumpling: ASMR Box` và thêm subject đó vào collection `[QA] G3-01 comparison`.

## Browser UAT

Ứng dụng QA chạy tại `http://127.0.0.1:15295/`; API tại `http://127.0.0.1:15296/`, cùng SQLite cô lập.

Đã thực hiện trên browser thật:

1. Mở Project QA và dataset từ tệp CSV đã lưu; xác nhận 27 dòng, 25 sản phẩm, 9 metric.
2. Xem giá trị Downloads (Absolute), phạm vi `Chưa có GEO · Unified · 2026-10-14` và ngày còn lại; không có biểu đồ tăng trưởng vì observation chưa tương thích.
3. Sắp xếp theo giá trị giảm dần; giá trị đầu bảng hiển thị từ nguồn CSV.
4. Tìm `Mystery Dumpling`; bảng lọc còn đúng sản phẩm phù hợp. Đổi metric để thấy trạng thái dữ liệu trống/không hợp lệ.
5. Tạo hồ sơ cho `Surprise Dumpling: ASMR Box`, mở hồ sơ và thêm sản phẩm vào collection QA.
6. Chọn sản phẩm, mở yêu cầu nghiên cứu ChatGPT; prompt giữ rõ giới hạn GEO/platform/period, đánh dấu số liệu CSV chưa xác minh và không tự tạo nghiên cứu hoặc kết luận thành công.
7. Refresh. Dataset vẫn hiển thị; hồ sơ vẫn mở được; collection hiển thị 1 thành viên. API QA đọc lại membership cũng trả về 1.

**Chưa xác minh:** import thông qua chính hộp thoại chọn file trong UI (bản QA được import vào isolated DB qua API fallback, rồi kiểm thử UI đọc/tương tác); browser viewport 1440×900 và 390px. Browser surface hiện tại không cung cấp viewport override; ảnh được chụp từ trang ứng dụng thật ở kích thước browser 1001×819, không phải mockup. Không tuyên bố mobile hoặc desktop 1440 UAT PASS.

## Ảnh thật

- [Bảng CSV và các giá trị nguồn](screenshots/g3-01/csv-analytics-browser.png) — 1001×819.
- [Tìm kiếm sản phẩm](screenshots/g3-01/csv-product-filtered.png) — 1001×819.
- [Hồ sơ và collection sau refresh](screenshots/g3-01/csv-profile-benchmark-after-refresh.png) — 1001×819.

## Kiểm thử

- Frontend: **24 test files / 206 tests PASS**.
- TypeScript: `npm run typecheck` **PASS**.
- Production build: `npm run build` **PASS**; Vite có cảnh báo bundle JavaScript >500 kB.
- Frontend tương tác tập trung (CSV import, CSV explorer, subject deep link): **3 files / 31 tests PASS**.
- Backend thuần cho quantitative validation: **29 tests PASS**.
- Full backend suite: **NOT VERIFIED**. Lượt đầu gặp quyền ghi vào thư mục TEMP mặc định; sau khi chuyển TEMP sang thư mục QA trong workspace, lượt đầy đủ vẫn không kết thúc ở TestClient trên Windows nên đã dừng. Không ghi nhận đó là PASS/FAIL của logic backend.
- Browser QA API đọc collection QA sau refresh: **1 member PASS**.
- `git diff --check`: PASS trước khi thêm handoff.

## Files changed

- `frontend/src/reports/QuantitativeDatasetImport.tsx`
- `frontend/src/reports/QuantitativeDatasetImport.test.tsx`
- `frontend/src/research/DataFirstWorkspace.tsx`
- `frontend/src/research/DataFirstWorkspace.test.tsx`
- `frontend/src/research/ResearchSubjectsPanel.tsx`
- `frontend/src/research/ResearchSubjectsPanel.test.tsx`
- `frontend/src/style.css`
- `docs/RECOVERY_BOARD.md`
- `.bangiao/G3-01-CSV-ANALYTICS.md`
- `.bangiao/screenshots/g3-01/*.png`

Thay đổi sẵn có trong `scripts/setup.ps1` và các thư mục QA/scratch không thuộc task này; đã giữ nguyên và không đưa vào commit.

## Product Acceptance

- **PO goal:** Đọc nhanh CSV Sensor Tower, hiểu giá trị/phạm vi, chọn sản phẩm và tiếp tục sang hồ sơ, benchmark hoặc nghiên cứu.
- **User journey:** Dữ liệu CSV đã lưu → khám phá bảng → lọc/sắp xếp → mở/tạo hồ sơ → thêm collection → tạo prompt ChatGPT.
- **Automated work:** Nhận diện metric/cột, nhóm sản phẩm, giữ nguyên giá trị và cảnh báo dữ liệu thiếu; lưu subject/collection/shortlist bằng API hiện có.
- **Expected result:** 25 sản phẩm, 9 metric nguồn; giá trị gốc xem được; chỉ so sánh khi có metadata phù hợp; chọn sản phẩm và mở được prompt nghiên cứu.
- **Remaining friction:** Chọn file UI chưa được kiểm chứng trực tiếp; GEO và nghĩa của Date/methodology còn thiếu trong tệp; 1440px/mobile chưa kiểm thử; test backend đầy đủ còn bị treo trên môi trường Windows.
- **Verification:** Browser actions 1–7 ở trên trên SQLite QA; frontend tests/typecheck/build pass; quantitative validation 29 tests pass; ảnh thật lưu dưới thư mục screenshots.
- **Decision:** `NEEDS FIX` cho full acceptance; `TECHNICAL PASS` có giới hạn cho code/test đã chạy. `PRODUCT PASS` chưa được xác nhận.

## Giới hạn còn lại

1. Không có GEO và kỳ đo được định nghĩa trong file nên không tạo kết luận tăng trưởng/biểu đồ chuẩn hóa.
2. Chưa có bằng chứng Browser UAT qua input file chooser của UI và kích thước mobile/desktop mục tiêu.
3. Full backend suite bị chặn bởi TestClient/Windows runtime; bộ 29 unit tests quantitative và API QA live được ghi riêng như trên.
4. Không chạy state machine hoặc tạo nghiên cứu giả; prompt chỉ được chuẩn bị/copy cho ChatGPT Plus.
