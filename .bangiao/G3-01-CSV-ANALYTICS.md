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

## G3-01 — nghiệm thu browser sau đồng bộ `ebd9a819` — 2026-10-28

**Kết luận:** `TECHNICAL PASS` cho frontend; `BROWSER UAT PASS` cho các luồng bên dưới trên DB QA cô lập; `PRODUCT ACCEPTANCE PENDING OWNER REVIEW`. Không chuyển sang task khác.

### Đồng bộ và an toàn dữ liệu

- Nhánh `feat/ux-recovery-01-research-results` được fast-forward an toàn tới `ebd9a8190c9742d8b5708efc7c6b48d0920368e5`; không reset hoặc ghi đè local changes.
- Backend chạy tại `http://127.0.0.1:15296/`, frontend tại `http://127.0.0.1:15295/`; dữ liệu test nằm trong `.g3-01-qa-20261028/`.
- Giữ nguyên thay đổi đã tồn tại trong `scripts/setup.ps1` cùng các thư mục QA/scratch. Không đưa chúng vào commit nghiệm thu.
- Không mở hoặc sửa SQLite production. Không lưu một bản dataset trùng trong lượt kiểm tra này; dùng dataset QA đã có và chọn lại file trong preview để xác minh UI mới.

### Kết quả browser UAT

| Luồng | Kết quả | Bằng chứng |
|---|---|---|
| Project Home → Phân tích dữ liệu | **PASS** — một lần bấm mở thẳng `view=data&action=import-csv#project-csv-data`; vùng nhập đã mở và thấy `Chọn tệp CSV` ngay | Kiểm tra URL và trạng thái DOM của trang đang chạy |
| Chọn CSV Sensor Tower thật | **PASS** — chọn bằng file chooser trình duyệt, không nạp lên trước khi xác nhận | `acceptance-import-preview-desktop-1440.jpg` |
| Giá trị nguồn / metric | **PASS** — 27 dòng CSV, dấu `;`, 25 sản phẩm, 9 metric được nhận diện; cột và giá trị hiển thị theo nguồn | Ảnh preview desktop và bảng explorer desktop |
| Readiness và scope | **PASS** — 243 phép đo, 0 phép đo đủ điều kiện phân tích; không tạo kết luận tăng trưởng | `acceptance-explorer-desktop-1440.jpg` |
| GEO / platform / dates | **PASS** — GEO không có; `Unified` không bị đổi thành Android/iOS; `2026-10-14` và `2026-09-14` hiển thị là ngày nguồn, ý nghĩa kỳ đo chưa xác nhận | CSV preview và trạng thái từng sản phẩm |
| Tìm kiếm / sắp xếp | **PASS** — tìm `Mystery Dumpling` còn một kết quả; sort Downloads tăng dần đưa Jigsaw Drop (1,948,943) lên đầu và Surprise Dumpling (13,837,982) xuống cuối | Thao tác thật trên `.workspace-explorer` |
| Hồ sơ / bộ so sánh / refresh | **PASS** — mở hồ sơ Mystery Dumpling; thêm Surprise Dumpling vào collection QA; sau refresh collection còn hai sản phẩm | Browser page sau refresh; DB chỉ là QA |
| Mobile 390px | **PASS** — tên, giá trị, scope và thao tác đọc được; `document.documentElement.scrollWidth=375`, không tràn ngang toàn trang | `acceptance-product-actions-mobile-390.jpg` |

### Lỗi giao diện được sửa trong lượt này

Kiểm tra ở 390px phát hiện bảng preview CSV rộng tràn khỏi khung và kéo document tới 624px. Chuyển phần preview sang cuộn ngang bên trong khung giới hạn chiều rộng. Thẻ sản phẩm đã lưu tiếp tục xếp dọc; nút mở hồ sơ và thêm vào bộ so sánh xếp thành hai hàng ở ≤420px để không bẻ nhãn trên các nút hẹp. Sau sửa, mobile preview có cuộn ngang cục bộ cho các cột CSV rộng; trang không tràn ngang.

### Automated checks sau sửa

- `npm test`: **PASS**, 25 test files / 212 tests.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**; giữ cảnh báo hiện có về bundle JavaScript lớn hơn 500 kB.
- Vitest chỉ chạy được sau khi đặt `TEMP`/`TMP` vào `frontend/.g3-01-uat-temp`; thư mục TEMP mặc định trên Windows gây `EPERM` khi rename trước khi chạy test. Không phải lỗi của test sản phẩm.
- Backend test suite không được chạy lại trong lượt nghiệm thu visual này; các API đã được gọi trong workflow trình duyệt dùng backend QA nói trên. Backend quantitative unit suite 29 tests PASS đã ghi ở phần kiểm thử ban đầu.

### Ảnh mới

- [CSV preview thật — desktop 1440×900](screenshots/g3-01/acceptance-import-preview-desktop-1440.jpg)
- [CSV explorer — desktop 1440×900](screenshots/g3-01/acceptance-explorer-desktop-1440.jpg)
- [Sản phẩm, giá trị nguồn và thao tác — mobile 390×844](screenshots/g3-01/acceptance-product-actions-mobile-390.jpg)

### Product Acceptance

- **PO goal:** Nhập một CSV Sensor Tower và đọc được ngay danh sách sản phẩm, metric/giá trị gốc, điều kiện so sánh và bước nghiên cứu tiếp.
- **User journey:** Project Home → Phân tích dữ liệu → chọn CSV → xem dữ liệu gốc → tìm/sắp xếp → mở hồ sơ hoặc thêm bộ so sánh.
- **Automated work:** Nhận diện các cột/metric đã biết, trình bày giá trị nguồn, báo điều kiện thiếu và chỉ đánh dấu quan sát đủ điều kiện khi metadata thực sự đáp ứng.
- **Expected result:** 25 sản phẩm và 9 metric nhìn thấy; giá trị thô có thể khám phá dù 0/243 phép đo đủ điều kiện so sánh chuẩn hóa; các thao tác hồ sơ/bộ so sánh giữ qua refresh.
- **Remaining friction:** CSV nguồn không cho biết GEO, `Unified` không xác định OS, và `Date` không định nghĩa kỳ đo. Mobile xem trước các cột rộng bằng cuộn ngang bên trong bảng. Biểu đồ tăng trưởng chưa hợp lệ với metadata hiện tại.
- **Verification:** Frontend 25 files/212 tests, typecheck/build và browser UAT ở desktop 1440×900, mobile 390×844; ảnh thật ở trên. 768px không được chạy lại trong lượt cuối này; full backend test suite cũng không được chạy lại.
- **Decision:** `TECHNICAL PASS` cho kiểm thử chạy; `BROWSER UAT PASS` cho các bước nêu trên; `PRODUCT ACCEPTANCE PENDING OWNER REVIEW`.

**Commit sửa CSS:** `3658116b5c3298655400118c0dc2fb2c6b0588e7`. Ảnh và bàn giao của lượt nghiệm thu này được commit riêng sau đó trên cùng nhánh; HEAD cuối và kết quả push được báo trong phần bàn giao của Codex.

## G3-01 — Tự phân tích CSV và highlight thay đổi — 2026-11-03

### Phản hồi PO và phạm vi

PO muốn biết sau khi nhập CSV, PO Hub có thể tự đọc điểm đáng chú ý, tô màu chỉ số và nhận gợi ý bước tiếp theo hay không; đồng thời khi nhập CSV mới vào cùng dự án, PO Hub cần tự nêu thay đổi so với kỳ trước. Đây là luồng CSV riêng, không phải luồng nhập báo cáo ChatGPT Research.

### Hành vi đã bổ sung

- Một CSV: tự nêu giá trị cao nhất/thấp nhất trong từng nhóm có cùng chỉ số, GEO, nền tảng, phương pháp, đơn vị và kỳ; không gọi đó là thứ hạng thị trường.
- CSV mới trong cùng dự án: tự chọn tệp cũ gần nhất mà có thể xác nhận cùng định nghĩa chỉ số, đơn vị, phương pháp, GEO/nền tảng và kỳ đo. So sánh các sản phẩm ghép được bằng ID nguồn ổn định; hiển thị tăng, giảm, không đổi, mới, không còn hoặc cần rà soát.
- Bảng sản phẩm: giá trị nguồn được tô xanh/đỏ/xanh dương kèm mũi tên và chữ “Tăng”, “Giảm”, “Mới trong tệp kỳ này”; màu không phải tín hiệu duy nhất và không mang ý nghĩa tốt/xấu.
- Insight nêu mạnh nhất một tăng và một giảm, hai tệp/kỳ nguồn, cảnh báo chưa xác minh độc lập và gợi ý kiểm tra nguồn/kỳ trước khi quyết định. PO có thể đưa sản phẩm nổi bật vào shortlist để nghiên cứu tiếp bằng ChatGPT.
- Thiếu hoặc xung đột thông tin kỳ đo/phạm vi/chỉ số thì không tự tính; dữ liệu gốc được giữ nguyên. Quy trình không bịa số liệu, nguyên nhân hay khuyến nghị sản phẩm.
- Nếu shortlist đang lưu thuộc CSV khác, nút insight không ghi đè hoặc báo đã chọn nhầm; PO được yêu cầu mở shortlist mới một cách rõ ràng. Khi lưu lựa chọn thất bại, không còn thông báo thành công sớm.

### Kiểm tra

- Isolated QA project: `[QA ONLY] CSV Auto Analysis Valid Periods`, project ID `fcfedfeb-0cb8-455c-aa85-d45d0e6694b6`; các CSV Sep/Oct/Nov 2026 đều là fixture tổng hợp, không phải dữ liệu thị trường.
- Sau khi thêm CSV Nov vào project, trình duyệt thực tế tải lại dự án và tự so với CSV Oct gần nhất đủ tương thích: 4 sản phẩm so được, 3 tăng, 1 giảm, 1 mới, 0 không còn và 0 cần rà soát. Puzzle A tăng 150 lượt tải; Puzzle C giảm 20. Giá trị delta trong insight trùng với ô bảng được tô màu. Dữ liệu nguồn/tệp/kỳ vẫn hiển thị.
- `CsvAutoAnalysis.test.tsx` + `DataFirstWorkspace.test.tsx`: **15/15 PASS** sau patch cuối.
- Full frontend Vitest: **29 files / 254 tests PASS**.
- `npm run typecheck`: **PASS**. `npm run build`: **PASS**, còn cảnh báo bundle JS 697.82 kB lớn hơn 500 kB. `git diff --check`: **PASS**; chỉ báo line-ending warnings.
- Browser screenshots được xem trực tiếp trong phiên UAT để kiểm tra panel và màu; screenshot của lượt này **chưa được lưu thành artifact**. Không kiểm thử mobile theo phạm vi PO đã đặt trước.

### Product Acceptance

- **PO goal:** Nạp số liệu CSV và nhanh chóng biết các giá trị cần xem, rồi nhận ra sản phẩm nào thay đổi khi có tệp kỳ mới.
- **User journey:** mở dự án → nhập CSV → xem tín hiệu trong tệp → thêm CSV mới cùng dự án → đọc chênh lệch an toàn theo kỳ và bảng tô màu → chọn sản phẩm để nghiên cứu sâu nếu cần.
- **Automated work:** giữ hai tệp riêng; khớp quan sát tương thích; tính chênh lệch; highlight và nêu phạm vi/kỳ nguồn.
- **Expected result:** PO thấy delta và bước tiếp theo, không cần tự ghép CSV. Màu đi cùng chữ/mũi tên; hệ thống không kết luận nguyên nhân hay tốt/xấu.
- **Remaining friction:** kiểm thử cặp kỳ mới hiện dùng 5 dòng tổng hợp; chưa có CSV nhiều kỳ do PO cung cấp, dataset 100+ dòng, hoặc screenshot lưu kèm review. Dữ liệu thật thiếu period/scope sẽ cần bổ sung hoặc xác nhận trước khi so. Đây là phân tích tín hiệu/delta có quy tắc, chưa phải AI giải thích nguyên nhân hay tự quyết định action sản phẩm.
- **Verification:** test, build, typecheck, diff check và browser UAT isolated nêu trên. Production SQLite không được mở/ghi; không merge/deploy.
- **Decision:** `TECHNICAL PASS / SYNTHETIC BROWSER UAT PASS / OWNER REVIEW PENDING`. Không tuyên bố Product Pass.

## G3-01 — chỉnh màn dữ liệu theo wireframe #8 — 2026-11-03

PO phản hồi: “cả phần data hình như cũng khác”. Đối chiếu trang CSV với Peachy Studio screen #8, “Phân tích dữ liệu – Bảng và biểu đồ trực quan”, cho thấy kết quả dữ liệu chưa nổi bật: bộ nhập và auto-analysis chiếm nhiều chỗ trước bảng, chỉ một metric hiện mặc định, phạm vi dài lặp ở từng sản phẩm, tên cột nguồn xuất hiện quá sớm.

### Đã chỉnh

- Thu gọn chọn tệp/bộ dữ liệu thành thanh công cụ ngang.
- Đưa bảng nhiều chỉ số và biểu đồ Top 5 lên trước; mặc định hiện tối đa bốn metric.
- Đưa phân tích tự động xuống dưới kết quả chính; nhóm chi tiết được thu gọn.
- Hiện phạm vi chung một lần; để phạm vi/nguồn riêng từng sản phẩm trong phần mở rộng.
- Việt hóa đơn vị “downloads” thành “lượt tải”; giữ nguyên giá trị và điều kiện so sánh an toàn.

### Verification và giới hạn

- Full frontend suite chạy tuần tự: **29 files / 262 tests PASS**. Bộ CSV liên quan: **6 files / 100 tests PASS**. Typecheck và production build: **PASS**; build còn cảnh báo chunk JS lớn hơn 500 kB. `git diff --check` không phát hiện lỗi whitespace (có cảnh báo line-ending).
- Đã xem ứng dụng desktop đang chạy ở viewport 1264×720 trên dự án `[QA ONLY] CSV Auto Analysis Valid Periods`; bố cục bảng/biểu đồ và trạng thái màu được nhìn thấy. Tệp QA có dữ liệu tổng hợp, không đại diện dữ liệu thị trường.
- Ảnh chụp mới chưa lưu thành artifact; chưa kiểm tra tại 1440px; browser fixture hiện có 1 metric và 5 sản phẩm. Phần khung điều hướng toàn ứng dụng vẫn lệch wireframe. Không làm mobile theo phạm vi PO đã đặt.
- Không dùng SQLite sản xuất, không migration, không merge/release.

### Product Acceptance

- **PO goal:** Xem dữ liệu CSV theo bố cục wireframe để đọc được chỉ số và điểm cần chú ý nhanh.
- **User journey:** Mở Phân tích dữ liệu → chọn tệp → đọc bảng nhiều metric và Top 5 → mở phân tích/chi tiết phạm vi khi cần.
- **Automated work:** Giữ giá trị nguồn; so sánh những phép đo đủ tương thích; dùng màu kèm nhãn trạng thái.
- **Expected result:** Bảng và biểu đồ là nội dung chính, không bị các thẻ phụ đẩy xuống.
- **Remaining friction:** Cần kiểm tra screenshot desktop 1440px và CSV lớn/nhiều metric thật; user acceptance chưa có.
- **Verification:** Các lệnh và browser review nêu trên.
- **Decision:** `TECHNICAL PASS / SYNTHETIC DESKTOP REVIEW / OWNER REVIEW PENDING`.

## G3-01 — gọn Project Home và làm rõ luồng CSV / ChatGPT — 2026-11-03

PO feedback: khu “Thông tin đã lưu” và tệp CSV nhìn xấu, compare chưa nói output ở đâu, import chiếm nhiều chỗ, và chưa rõ báo cáo ChatGPT xuất hiện trong Overview nào.

### Thay đổi

- Project Home chỉ nhấn mạnh tệp CSV mới nhất trong thẻ rộng toàn hàng; các tệp trước được gấp lại. Bỏ nhãn kỹ thuật readiness khỏi danh sách chính.
- Khi chỉ có một nhóm lưu, nhóm đó dùng toàn bộ chiều rộng.
- Trên trang so sánh, người dùng chọn hai tệp rồi bấm **Tạo kết quả so sánh**. Ban đầu chỉ hiện hai lựa chọn tệp; các trường chỉ số/phạm vi/kỳ mở sau khi có đủ cặp. Phép tính chạy trong PO Hub, bản xem trước hiện dưới trang và màn hình tự cuộn tới kết quả. Đây không phải báo cáo riêng được lưu; rời trang hoặc tải lại thì cần tính lại từ hai CSV còn lưu. Không cần ChatGPT.
- Khu nhập CSV nằm dưới form và gấp gọn thành nút **Thêm tệp CSV mới**; chỉ mở khi người dùng cần nạp kỳ mới.
- Luồng yêu cầu ChatGPT có một nút chính. Sau khi tạo, prompt được sao chép; hai bước kế tiếp là mở ChatGPT rồi quay lại nhập câu trả lời. Prompt dài được gấp lại.
- Nói rõ báo cáo được liệt kê trên Tổng quan dự án. Nhận định có cấu trúc nằm ở tab Tổng quan của báo cáo nếu nội dung được nhận diện; nội dung gốc vẫn ở tab Đọc báo cáo. PO phải tự dán và lưu câu trả lời, không có đồng bộ trực tiếp.

### Verification và Product Acceptance

- Bốn bộ test (`DataFirstWorkspace`, `ProjectHome`, `QuantitativeDatasetImport`, `QuantitativePeriodComparison`): **45/45 PASS** sau các thay đổi cuối.
- Full frontend suite **29 files / 264 tests PASS** sau khi gộp nút tạo yêu cầu; bản sao/copy CSS cuối sau đó được xác minh bằng focused suite và build.
- `npm run build` gồm TypeScript: **PASS**. Còn cảnh báo bundle JS 709.94 kB lớn hơn ngưỡng gợi ý 500 kB.
- `git diff --check`: **PASS**; chỉ có cảnh báo line endings hiện hữu.
- Đã chụp và xem app thật desktop 1440×900 trong isolated QA: `.bangiao/screenshots/g3-01/feedback-round-3/project-home-1440x900-after.png` và `period-comparison-1440x900-final.png`. Trang Project Home cho thấy tệp mới nhất full width, tệp cũ được gấp; trang compare chỉ hiện hai selector trước khi chọn cặp và khu nhập CSV thu gọn. Ảnh compare là trạng thái chưa chọn cặp; chưa có screenshot browser cho output sau khi tạo, dù test component xác minh gọi phép tính và render kết quả.
- **PO goal:** nhìn thấy nơi lưu CSV, hiểu cách tính đối chiếu hai kỳ và biết chỗ xem kết quả nghiên cứu ChatGPT.
- **User journey:** chọn hai tệp CSV → tạo kết quả ngay trong PO Hub; hoặc tạo prompt → chạy nghiên cứu ở ChatGPT → dán/lưu báo cáo → mở báo cáo để xem Overview hoặc bản gốc.
- **Automated work:** tính delta CSV đủ điều kiện; giữ file nguồn; báo cáo import được liên kết vào dự án. Không tự đồng bộ ChatGPT, không phát minh insight từ nội dung không parse được.
- **Expected result:** một CTA chính, import CSV thu gọn, kết quả compare ở cùng trang, report có nơi xem rõ ràng.
- **Remaining friction:** PO phải chọn đủ hai tệp; compare hiện chỉ là bản xem trước không lưu riêng; nội dung ChatGPT không cấu trúc có thể không hiện insight tự động ở tab Tổng quan; chưa capture browser output thực sau khi chọn cặp; chưa thử CSV nhiều kỳ thật/lớn.
- **Decision:** `TECHNICAL PASS / DESKTOP VISUAL CHECK / OWNER REVIEW PENDING`. Không tuyên bố Product Pass.

## G3-01 — làm rõ nút soạn prompt và tab ChatGPT — 2026-11-03

PO feedback: bấm luồng CSV thấy mở tab khác và không hiểu vì sao có hai thao tác tạo yêu cầu.

- Đổi nút duy nhất thành **Soạn & sao chép yêu cầu cho ChatGPT**. Khi đã soạn prompt, nút đổi thành trạng thái hoàn tất, tránh một nút tạo mới nằm cạnh các bước tiếp theo.
- Link ghi rõ **Mở ChatGPT ở tab mới**. Chú thích nói PO Hub vẫn mở ở tab hiện tại; sau khi có kết quả, quay lại để nhập vào PO Hub.
- Khi clipboard không dùng được, hướng dẫn sao chép prompt trước khi mở ChatGPT.
- `DataFirstWorkspace.test.tsx`: **17/17 PASS**; test xác nhận một nút trước khi bấm, nút được thay bằng trạng thái sau khi tạo, và các link mở/nhập dùng đúng đích.
- `npm run build` bao gồm TypeScript: **PASS**; Vite đưa cảnh báo bundle JS **710.29 kB** lớn hơn 500 kB.
- App local chụp ở 1440×900: `.bangiao/screenshots/g3-01/feedback-round-3/csv-prompt-flow-1440x900-after.png`; screenshot cho thấy một CTA ở trạng thái trước khi tạo. Trạng thái sau khi tạo được kiểm chứng bằng test, chưa có browser screenshot riêng.
- **PO goal:** soạn yêu cầu từ shortlist mà không nhầm thao tác tạo prompt với mở ChatGPT; giữ đường quay lại để nhập câu trả lời.
- **Journey:** chọn sản phẩm → soạn và sao chép → mở ChatGPT ở tab mới → quay lại tab PO Hub → nhập câu trả lời.
- **Automated work:** tạo/copy prompt và giữ PO Hub ở tab nguồn.
- **Expected result:** một nút tạo; sau khi tạo chỉ còn thông báo trạng thái và các bước tiếp theo có nhãn rõ.
- **Remaining friction:** phải tự paste prompt và kết quả; không có đồng bộ ChatGPT.
- **Decision:** `TECHNICAL PASS / DESKTOP VISUAL CHECK / OWNER REVIEW PENDING`; chưa phải Product Pass.

## G3-01 — feedback round 5: one ChatGPT run, one answer import — 2026-11-03

The PO asked whether the CSV research flow required copying a first ChatGPT response into “Bạn muốn nghiên cứu gì?”, starting ChatGPT again, and pasting a second response. It did not: the screen accidentally showed the prompt composer beside the answer importer and the CSV handoff did not carry a report title, making it look that way.

### Implemented

- The CSV result link carries the project ID and the same research question used at the start of the generated prompt.
- Opening that link shows only the answer-import step. The “Bắt đầu với câu hỏi sản phẩm” composer and its copy action are absent.
- The report title is already filled in. Editing it changes only the saved title; it does not generate or send a new ChatGPT request.
- Scope and period remain available under a collapsed “Phạm vi lưu cùng báo cáo” disclosure.
- The PO pastes the answer once and saves it. The answer remains unverified, and the saved report stays attached to the current project.
- The existing “Nghiên cứu lại” action now uses a distinct `research-again` state: prepare/copy the prompt first, then switch to the import step after the single ChatGPT answer is ready.

### Verification

- `ResearchIntake.test.tsx` + `DataFirstWorkspace.test.tsx` + `ProjectHome.test.tsx`: **3 files / 76 tests PASS**. Coverage confirms the direct CSV route carries the project/title, hides the second prompt, and sends the pasted content in one POST; the repeat-research route starts at prompt preparation and switches to import afterward from Project Home, report library and report detail.
- `npm run build`: TypeScript and Vite **PASS**. Existing Vite advisory: minified JS chunk **712.74 kB** (>500 kB guidance).
- Read-only browser UAT on local port 5173 with the isolated synthetic QA project showed the one-step answer importer, prefilled title, no prompt composer, and a return link to CSV analysis. The browser did not submit external ChatGPT output.
- No mobile review, genuine ChatGPT result, production database access, merge, or release.

### Product Acceptance

- **PO goal:** Run the CSV-derived prompt once and save its answer once in the correct project.
- **User journey:** Copy request → run it once in ChatGPT → return to PO Hub → import link → paste answer once → save.
- **Automated work:** Preserve project/title context and remove the second prompt action from the answer screen.
- **Expected result:** One paste field saves one report into the intended project.
- **Remaining friction:** Prompt and answer are still copied manually; ChatGPT is not synchronized with PO Hub. Genuine research accuracy/format remains unverified.
- **Verification:** 76 focused tests, production build, isolated browser route review above.
- **Decision:** `READY_FOR_OWNER / OWNER REVIEW PENDING`; no real-research `PRODUCT PASS` claimed.

## G3-01 — feedback round 6: one-step Codex CLI research — 2026-11-03

### What changed

- Research accepts one prompt and one Enter press to start one local `codex exec` request. A persistent toggle turns this behavior off; Shift+Enter remains a line break. The response appears in the same screen and must be reviewed before saving.
- The settings load the model catalog through Codex `app-server`, choose a lightweight model based on model names when available, and let the PO choose another listed model. The name-based hint does not prove actual account entitlement or lowest cost.
- CSV observation analysis and compatible-period highlighting still run inside PO Hub without Codex. Codex is an optional follow-up for selected products; the request includes their selected CSV context, and the response is kept separate from unverified provider values.
- A saved response records `codex_cli_research` origin. `run.bat` now treats an API that lacks the two Codex routes as outdated and follows its existing ownership safeguards before restarting.
- Codex runs with `--sandbox read-only`, `--ephemeral`, and `--disable shell_tool` in a temporary directory. The installed CLI does not expose the attempted web-search option and local web search was unavailable; the prompt directs Codex to disclose this and never invent sources. No actual inference was performed to conserve quota.

### Verification and Product Acceptance

- `tests.test_codex_research`: **3/3 PASS**; backend `py_compile`: **PASS**.
- Focused `ResearchIntake.test.tsx` + `DataFirstWorkspace.test.tsx`: **2 files / 72 tests PASS**; `npm run typecheck`: **PASS**; `npm run build`: **PASS**, Vite chunk advisory at **722.54 kB**.
- `scripts/test-launcher-compatibility.ps1`: **9 cases PASS**. `git diff --check`: **PASS** with existing line-ending warnings.
- The report-origin API test did not finish after isolated database migrations. A read-only request to the currently open app's `/api/v1/codex/models` returned `{"detail":"Not Found"}`, confirming that its backend is still outdated. Model catalog retrieval, persistence API, browser UAT and real Codex output are **NOT VERIFIED**. No production database, external search, or Codex inference was used.
- **PO goal:** ask once in PO Hub, receive a result in the same app, and optionally save it; retain automatic CSV analysis without requiring a model call.
- **User journey:** Research question → Enter → review response → save if useful. For CSV: import → read local analysis/highlights → optionally select products → Codex context research → review → save.
- **Automated work:** one CLI call, model catalog discovery, selected model, same-screen preview, clear source provenance; CSV signals remain deterministic and separate.
- **Expected result:** no prompt/answer copy-paste for Codex; no Codex usage for local CSV analysis.
- **Remaining friction:** local server/runtime and model access are unverified; web-search availability and lowest billing model are not guaranteed; response still needs PO review/save and evidence is not independently verified.
- **Verification:** automated suite/build and launcher checks above; no browser UAT or actual CLI research request.
- **Decision:** `NEEDS FIX / OWNER REVIEW PENDING` until the local smoke test confirms model loading, Enter, preview and saving.
- **Next:** use `run.bat` and one lightweight-model smoke test only; if it fails, rework this same task. Do not repeatedly test and burn quota.

### Feedback round 7 — old backend startup handoff — 2026-11-03

- **Owner feedback:** `run.bat` stopped on an outdated API at port 8000 and asked the owner to identify and stop a PID in PowerShell; owner asked whether this was misleading.
- **Change:** The launcher now offers a direct Y/N restart confirmation for the outdated PO Hub API. It rechecks listener PIDs and process start times after consent; N/Enter, unknown process, or PID changes leave the process alone. A confirmed restart keeps saved reports and CSV files. Normal startup then runs existing additive migrations.
- **Verification:** `scripts/test-launcher-compatibility.ps1` **18 assertions PASS**. Actual old-backend restart, app launch, Codex model discovery, request/save, and database migration were not run in this environment. No Codex quota was used.
- **Decision:** `NEEDS FIX / OWNER RUNTIME REVIEW PENDING`; automated launcher logic is covered, but runtime acceptance is still open.

### Feedback round 8 — report foreign-key migration failure — 2026-11-03

- **Owner feedback:** Screenshot showed `run.bat` failing while dropping `imported_research_reports` because existing CSV datasets reference that table.
- **Finding:** The report lineage/origin migrations used SQLite batch table replacement with foreign-key enforcement on. The failed attempt left the original table and rows intact plus an empty Alembic temp table.
- **Correction:** The migration connection now temporarily disables FK enforcement, uses transactional DDL, checks all existing foreign keys before migration and again before commit, then restores FK enforcement. Revision `20261102_0016` drops a stale temp table only when it is empty; it refuses to discard a nonempty temp table.
- **Actual DB recovery:** Before migration, the configured DB was verified read-only at `20261027_0015` with 8 reports, 3 CSV datasets, `integrity_check=ok`, 0 FK errors and an empty stale temp table. A SQLite backup is retained at `data/backups/po_intelligence_hub_pre_fk_migration_fix_20261103_161609.sqlite3`. The actual DB is now at `20261103_0017`; common-column row hashes match the backup across 18 existing tables, report/CSV counts are unchanged, `integrity_check=ok`, FK errors 0 and stale temp count 0.
- **Verification:** `tests/test_report_migration_regression.py` + `tests/test_codex_research.py`: **4/4 PASS**. `scripts/test-launcher-compatibility.ps1`: **18 assertions PASS**. Backend module import passes. Agent-shell live launch did not pass: its localhost HTTP health request was denied by the environment (`socket access permissions`), leaving the app runtime/model list/browser UAT unverified. No real Codex inference or quota use.
- **Decision:** `TECHNICAL PASS for migration and data preservation / LIVE APP RUNTIME NEEDS OWNER-SIDE VERIFICATION`; no Product Pass.
