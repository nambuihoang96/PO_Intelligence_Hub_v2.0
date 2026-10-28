# G3-01 — CSV Analytics theo luồng Product Owner

Ngày: 2026-10-28
Nhánh: `feat/ux-recovery-01-research-results`
Baseline đã xác nhận: `2bcecd75f6c2b0be42feadf377ee79b97ebb79c3`
Implementation commit: `e13343f2df4daa29c90a732c1f7673d403dac600`. UAT closure/screenshots: `4798877`, `1137a7c` (documentation + real browser evidence only; no source changes in these closures).

## Kết quả

**Kỹ thuật: PASS có giới hạn. Browser UAT cho luồng CSV: PASS trong QA cô lập ở các viewport đã đo. Product acceptance: chờ PO review; không tự đánh dấu PRODUCT PASS.**

Luồng CSV thật đã được chọn qua file chooser của ứng dụng, xem trước, xác thực, lưu vào project QA riêng, sau đó mở lại và thao tác tiếp. Đã kiểm tra ở viewport desktop 1440×900, tablet 768×900 và mobile 390×844; trang không tràn ngang ở các kích thước này. Không có kết luận tăng trưởng chuẩn hóa vì dữ liệu nguồn chưa xác định GEO, platform cụ thể hoặc ý nghĩa kỳ đo.

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
- Chỉ dùng SQLite QA cô lập tại `.g3-01-qa-20261028/`; không mở/ghi database sản xuất. Việc tạo project, dataset, subject và collection dưới đây chỉ tác động tới DB này.
- Tệp dùng dấu chấm phẩy, có 27 dòng, 25 sản phẩm nguồn và 9 metric được nhận diện.
- Import tạo 243 observation; 0 observation đủ điều kiện phân tích/so sánh; preview ghi nhận thiếu GEO/ý nghĩa kỳ, thiếu hoặc sai giá trị và duplicate. UI hiển thị giá trị thô nhưng đánh dấu chưa xác minh/thiếu metadata.
- `Platform=Unified` được giữ nguyên; không đổi thành Android/iOS. Cột Date hiển thị như ngày nguồn, không tự gán đó là kỳ tuần/tháng.
- Qua giao diện trình duyệt, chọn file gốc trong project `[QA] G3-01 UI upload test 2026-10-28`, xem preview, chạy validation, xác nhận lưu. Sau đó mở lại project và xác nhận dataset còn tồn tại.
- Trong project này, tạo hồ sơ `Mystery Dumpling: Unbox ASMR`, tạo collection `[QA] G3-01 UI upload comparison`, thêm hồ sơ vào collection, mở lại project sau khi điều hướng và xác nhận hồ sơ có `1 bộ so sánh`; collection có `1 hồ sơ · thuộc dự án`.
- Một project QA riêng đã có collection `[QA] G3-01 comparison`; tại đó cũng thêm `Mystery Dumpling: Unbox ASMR` từ CSV và xác nhận collection tăng từ 1 lên 2 hồ sơ sau khi mở lại trang. Không sửa/xóa dữ liệu ngoài DB QA.

## Browser UAT

Ứng dụng QA chạy tại `http://127.0.0.1:15295/`; API tại `http://127.0.0.1:15296/`, cùng SQLite cô lập.

Đã thực hiện trên browser thật:

1. Mở project UI-upload QA, bấm `Nhập CSV`, dùng file chooser thật chọn `Unified Top Apps Downloads YoY Growth test.csv`; preview hiện `25 sản phẩm · 9 chỉ số`, header/rows thực tế. Chuyển sang xem nhanh: `243 phép đo`, 0 đầy đủ/tương thích, 243 thiếu điều kiện, 16 mục trùng; không có row bị giấu khỏi phần kết quả.
2. Xác nhận lưu trong UI. Project hiển thị 1 dataset, 27 dòng, 25 sản phẩm. Mở lại project trên tab mới: dataset vẫn có.
3. Tại 1440×900, 768×900, 390×844, đọc `document.documentElement.scrollWidth`: tương ứng 1425, 753, 375 — không vượt viewport; không có tràn ngang trang. Chụp ảnh thật tại cả ba kích thước.
4. Ở mobile 390px, tìm `Mystery Dumpling`: còn đúng dòng tương ứng; chọn metric Downloads, sắp xếp tăng dần và xác nhận đầu/cuối bảng lần lượt là `Jigsaw Drop: Solitaire Puzzle` (1,948,943) và `Surprise Dumpling: ASMR Box` (13,837,982), đều đọc từ CSV.
5. Tạo hồ sơ cho `Mystery Dumpling: Unbox ASMR` từ dòng CSV, tạo collection QA, chọn collection trong explorer và bấm `Thêm vào bộ so sánh`; UI xác nhận đã thêm. `Mở hồ sơ` dẫn tới đúng hồ sơ.
6. Mở lại project sau thao tác: hồ sơ còn, trạng thái hồ sơ báo `1 bộ so sánh`, collection `[QA] G3-01 UI upload comparison` có 1 hồ sơ. Trong project QA seeded thứ hai, cùng luồng thêm hồ sơ làm collection hiện có tăng từ 1 lên 2; xác nhận sau khi mở lại.
7. API QA đã được ping; frontend chạy ở `15295`, API ở `15296`, DB root `.g3-01-qa-20261028/`. Production SQLite không được mở hoặc ghi.
8. Mở Project Home của project UI-upload; collection `[QA] G3-01 UI upload comparison` xuất hiện cùng số thành viên và dataset đã lưu. Mở collection từ Project Home dẫn về đúng collection trong workspace; hồ sơ và membership vẫn khớp.

**Giới hạn UAT:** Không có GEO rõ ràng; `Platform=Unified` không cho biết iOS/Android; cột Date không đủ ngữ nghĩa để tự khẳng định period/granularity/methodology. Vì vậy dữ liệu được duyệt/khám phá nhưng không tuyên bố analytics-ready hoặc vẽ kết luận tăng trưởng. Các chiều 1440/768/390 được kiểm tra trực tiếp; 1076×828 không kiểm tra trong lượt này.

## Ảnh thật

- [CSV sau khi lưu — desktop 1440](screenshots/g3-01/csv-ui-upload-saved-desktop-1440.jpg) — ảnh thật full-page, viewport 1440×900 (document width 1425).
- [CSV sau khi lưu — tablet 768](screenshots/g3-01/csv-ui-upload-saved-tablet-768.jpg) — viewport 768×900 (document width 753).
- [CSV sau khi lưu — mobile 390](screenshots/g3-01/csv-ui-upload-saved-mobile-390.jpg) — viewport 390×844 (document width 375).
- [Preview trước khi lưu — desktop](screenshots/g3-01/csv-upload-preview-desktop.jpg).
- [Preview trước khi lưu — mobile](screenshots/g3-01/csv-upload-preview-mobile-390.jpg).
- [Hồ sơ và benchmark sau khi mở lại](screenshots/g3-01/csv-ui-upload-profile-benchmark-after-reopen.jpg) — trang ứng dụng thật sau khi reopen.
- [Project Home với collection và dataset](screenshots/g3-01/project-home-benchmark-collection.jpg) — xác nhận các kết quả đã lưu được đưa lại vào ngữ cảnh Project.
- Các ảnh lượt trước vẫn giữ nguyên: [bảng CSV](screenshots/g3-01/csv-analytics-browser.png), [tìm kiếm](screenshots/g3-01/csv-product-filtered.png), [hồ sơ/benchmark](screenshots/g3-01/csv-profile-benchmark-after-refresh.png).

## Kiểm thử

- Frontend: **24 test files / 206 tests PASS**.
- TypeScript: `npm run typecheck` **PASS**.
- Production build: `npm run build` **PASS**; Vite có cảnh báo bundle JavaScript >500 kB.
- Frontend tương tác tập trung (CSV import, CSV explorer, subject deep link): **3 files / 31 tests PASS**.
- Backend thuần cho quantitative validation: **29 tests PASS**.
- Full backend suite: **NOT VERIFIED**. Lượt đầu gặp quyền ghi vào thư mục TEMP mặc định; sau khi chuyển TEMP sang thư mục QA trong workspace, lượt đầy đủ vẫn không kết thúc ở TestClient trên Windows nên đã dừng. Không ghi nhận đó là PASS/FAIL của logic backend.
- Browser: file chooser → preview → validation → save → reopen, tìm kiếm/sort, tạo hồ sơ, add to collection và reopen **PASS** trong QA cô lập.
- Responsive browser check: 1440×900, 768×900, 390×844 **PASS** về overflow; 1076×828 **NOT VERIFIED**.
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
- **Remaining friction:** Nguồn thiếu GEO và methodology/semantics của Date; thao tác xem dữ liệu được nhưng chart/so sánh chuẩn hóa vẫn không hợp lệ nếu không có xác nhận phạm vi. Test backend đầy đủ còn bị treo trên môi trường Windows.
- **Verification:** Browser actions 1–7 ở trên trên SQLite QA, gồm file chooser thật; responsive check 1440/768/390; frontend tests/typecheck/build pass; quantitative validation 29 tests pass; ảnh thật lưu dưới thư mục screenshots.
- **Decision:** `TECHNICAL PASS` có giới hạn; `BROWSER UAT PASS` cho luồng CSV đã liệt kê; `PRODUCT ACCEPTANCE PENDING OWNER REVIEW`. Không tự tuyên bố PRODUCT PASS.

## Giới hạn còn lại

1. Không có GEO và kỳ đo được định nghĩa trong file nên không tạo kết luận tăng trưởng/biểu đồ chuẩn hóa.
2. 1076×828 chưa kiểm tra; biểu đồ/tăng trưởng chuẩn hóa không thể xác nhận từ metadata CSV hiện tại.
3. Full backend suite bị chặn bởi TestClient/Windows runtime; bộ 29 unit tests quantitative và API QA live được ghi riêng như trên.
4. Không chạy state machine hoặc tạo nghiên cứu giả; prompt chỉ được chuẩn bị/copy cho ChatGPT Plus.
