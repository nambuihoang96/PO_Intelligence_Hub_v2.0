# Gói nghiệm thu Research (R2)

Ngày: 2026-11-04. Người nghiệm thu: Product Owner.
Trạng thái nguồn sự thật vẫn là `docs/RECOVERY_BOARD.md`. Tài liệu này chỉ là lộ trình để bạn tự bấm thử.

## Trước khi bắt đầu

### Bước A. Sao lưu dữ liệu thật (bắt buộc)

Bước này kiêm luôn việc khởi động lại máy chủ thật theo code hiện tại (R5). Lý do: khi `run.bat` khởi động một backend mới, launcher chạy `alembic upgrade head` lên database thật. Bản sao lưu là cách duy nhất để quay lại nếu có lỗi.

1. **Tắt PO Hub.** Đóng cửa sổ launcher `run.bat` (hoặc nhấn Ctrl+C trong cửa sổ đó), và đóng tab trình duyệt PO Hub. Kiểm tra không còn cửa sổ PO Hub nào đang mở.
2. **Copy nguyên thư mục dữ liệu.** Thư mục dữ liệu mặc định là `D:\AI\PO Analysis\PO_Intelligence_Hub_v2.0\data` (có file `po_intelligence_hub.sqlite3`). Nếu bạn có file `.env` với dòng `APP_DATA_ROOT=`, dùng đường dẫn trong dòng đó. Copy cả thư mục vào một thư mục có ngày tháng, ví dụ `D:\AI\PO Analysis\PO_Intelligence_Hub_v2.0\data-backup-2026-11-04`. Copy cả các file `-wal` và `-shm` nếu có.

   ```powershell
   Copy-Item -Recurse "D:\AI\PO Analysis\PO_Intelligence_Hub_v2.0\data" "D:\AI\PO Analysis\PO_Intelligence_Hub_v2.0\data-backup-2026-11-04"
   ```
3. **Kiểm tra bản sao.** Mở thư mục `data-backup-2026-11-04` và xác nhận có `po_intelligence_hub.sqlite3`, cùng dung lượng với file gốc.
4. **Khôi phục nếu lỗi.** Đóng PO Hub. Đổi tên thư mục `data` lỗi thành `data-loi-2026-11-04`. Đổi tên `data-backup-2026-11-04` thành `data`. Chạy lại `run.bat`. Không xoá thư mục lỗi cho đến khi bạn đã xác nhận mọi thứ ổn.

### Bước B. Khởi động PO Hub

1. Chạy `run.bat` ở thư mục gốc. Đợi trình duyệt mở `http://127.0.0.1:5173`.
2. **Nếu launcher báo "An older PO Hub service is already running":**
   - Gõ `Y` rồi Enter để dùng bản hiện tại. Launcher dừng bản cũ và khởi động bản hiện tại. Báo cáo và dữ liệu CSV đã lưu được giữ nguyên.
   - Nếu nhấn Enter (không gõ `Y`), launcher huỷ và bản cũ vẫn chạy. Lúc đó bạn đang nghiệm thu **code cũ**, và kết quả không hợp lệ cho đợt này. Hãy đóng bản cũ rồi chạy lại `run.bat`.
3. Dùng dữ liệu thật của bạn, hoặc dữ liệu QA đã có. Không cần tạo thêm dữ liệu giả để "đẹp".
4. Các đường dẫn `127.0.0.1:15401` trong board chỉ mở được khi tiến trình QA còn chạy. Hiện tại chúng đã tắt, nên dùng `127.0.0.1:5173`.
5. Với mỗi mục, ghi một trong ba lựa chọn:
   - **Chấp nhận**
   - **Cần sửa** (kèm lý do cụ thể)
   - **Chưa thử**
6. Im lặng không được tính là chấp nhận.

## Danh sách nghiệm thu

### 1. Đọc báo cáo (G1-02)
- **Mục đích:** Đọc báo cáo nghiên cứu dài dễ hiểu, thấy phát hiện, bằng chứng và điều chưa rõ.
- **Trạng thái hiện tại trên board:** Chờ chủ dự án xem lại.
- **Đường dẫn:** `http://127.0.0.1:5173/reports`
- **Các bước:**
  1. Mở **Báo cáo đã lưu**, bấm một báo cáo.
  2. Đọc phần phát hiện và bằng chứng. Thử kéo xuống, xem bảng.
  3. Thu nhỏ cửa sổ về khoảng 390px (hoặc dùng công cụ thiết bị di động) và kiểm tra không bị tràn ngang.
- **Kết quả:** [ ] Chấp nhận  [ ] Cần sửa  [ ] Chưa thử
- **Nhận xét:**

### 2. Dán báo cáo ChatGPT một lần (G2-01)
- **Mục đích:** Lưu báo cáo ChatGPT vào dự án mà không cần sao chép nhiều lần.
- **Trạng thái:** Đã kiểm thử trên QA, chờ chủ dự án xem.
- **Đường dẫn:** `http://127.0.0.1:5173/` (Trang dự án, sau khi chọn dự án)
- **Các bước:**
  1. Chọn một dự án, dán nguyên văn báo cáo `po_research_v1` vào ô nhập.
  2. Lưu. Kiểm tra báo cáo xuất hiện trong danh sách và nội dung gốc còn nguyên.
  3. Dán lại đúng báo cáo đó. Kiểm tra hệ thống báo trùng, không tạo bản thứ hai.
- **Kết quả:** [ ] Chấp nhận  [ ] Cần sửa  [ ] Chưa thử
- **Nhận xét:**

### 3. Báo cáo gắn với dự án (G2-02)
- **Mục đích:** Báo cáo thuộc đúng dự án, và bạn đi lại giữa dự án và báo cáo dễ dàng.
- **Đường dẫn:** `http://127.0.0.1:5173/reports`
- **Các bước:**
  1. Ở Trang dự án, mở một báo cáo đã lưu.
  2. Quay lại dự án. Kiểm tra báo cáo vẫn đúng dự án và không bị lẫn sang dự án khác.
  3. Dùng bộ lọc theo dự án (nếu có) và kiểm tra danh sách.
- **Kết quả:** [ ] Chấp nhận  [ ] Cần sửa  [ ] Chưa thử
- **Nhận xét:**

### 4. Lưu quyết định PO từ phát hiện (G2-03)
- **Mục đích:** Từ một phát hiện trong báo cáo, lưu quyết định của bạn và thấy nó ở Theo dõi.
- **Trạng thái:** Đã kiểm thử trên QA với dữ liệu tổng hợp, chờ chủ dự án xem.
- **Đường dẫn:** `http://127.0.0.1:5173/reports`
- **Các bước:**
  1. Mở một báo cáo, chọn một phát hiện.
  2. Mở phần quyết định PO, ghi quyết định và lưu.
  3. Mở **Theo dõi** (`/tracking`). Kiểm tra quyết định vừa lưu có hiện đúng nội dung và đúng nguồn.
- **Kết quả:** [ ] Chấp nhận  [ ] Cần sửa  [ ] Chưa thử
- **Nhận xét:**

### 5. Báo cáo nghiên cứu thật, đầy đủ: "Puzzle 2026" (G2-04)
- **Mục đích:** Chạy một báo cáo dài thật từ đầu đến cuối: dán, đọc, bằng chứng, quyết định, mở lại.
- **Trạng thái:** Đã có báo cáo thật "Puzzle 2026" được nghiệm thu ngày 2026-10-30 trên bản QA cô lập (xem board, mục G2-04). Bạn cần lặp lại trên dữ liệu thật của mình để chốt mục này.
- **Nguồn:** File `qa-input\Puzzle_2026_po_research_v1.json` trong thư mục dự án. Đây là bản đã kiểm đúng định dạng `po_research_v1`.
- **Các bước:**
  1. Mở file `qa-input\Puzzle_2026_po_research_v1.json`, copy nguyên văn nội dung. Dán vào Trang dự án theo mục 2. Đây là lần nhập vào dữ liệu thật, nên chỉ làm sau khi đã sao lưu (Bước A).
  2. Đọc báo cáo, mở bằng chứng, lưu quyết định theo mục 4.
  3. Đóng app, mở lại. Kiểm tra quyết định và báo cáo còn nguyên.
- **Kết quả:** [ ] Chấp nhận  [ ] Cần sửa  [ ] Chưa thử
- **Nhận xét:**

### 6. So sánh hai báo cáo (G4-01)
- **Mục đích:** Thấy thay đổi giữa hai lần nghiên cứu của cùng một chủ đề, có bằng chứng.
- **Trạng thái:** Đã kiểm thử kỹ thuật với dữ liệu tổng hợp, chờ chủ dự án xem.
- **Đường dẫn:** Mở `http://127.0.0.1:5173/`, chọn dự án, rồi vào mục **Cập nhật từ báo cáo** trong menu của dự án.
- **Các bước:**
  1. Chọn một báo cáo cũ và một báo cáo mới của cùng dự án.
  2. Xem danh sách thay đổi. Kiểm tra mỗi thay đổi có nguồn.
  3. Kiểm tra app không tự kết luận xu hướng từ dữ liệu không tương thích.
- **Kết quả:** [ ] Chấp nhận  [ ] Cần sửa  [ ] Chưa thử
- **Nhận xét:**

### 7. Theo dõi hành động PO (G4-02)
- **Mục đích:** Ghi hành động, thấy lịch sử cập nhật và mở lại đúng ngữ cảnh.
- **Trạng thái:** Đã kiểm thử kỹ thuật, chờ chủ dự án xem.
- **Đường dẫn:** `http://127.0.0.1:5173/tracking`
- **Các bước:**
  1. Mở một quyết định, thêm một ghi chú cập nhật có ngày và nguồn.
  2. Tải lại trang. Kiểm tra ghi chú vẫn còn.
  3. Bấm mở lại ngữ cảnh. Kiểm tra quay về đúng báo cáo hoặc dự án.
- **Kết quả:** [ ] Chấp nhận  [ ] Cần sửa  [ ] Chưa thử
- **Nhận xét:**

### 8. Phân tích một CSV (G3-01)
- **Mục đích:** Xem số liệu từ một file CSV với nguồn, GEO, nền tảng và kỳ rõ ràng; không có nhận xét do máy viết.
- **Trạng thái:** Đã kiểm thử trên QA. Chưa kiểm với file thật của bạn ngoài hai file đã nêu trong R1.
- **Đường dẫn:** `http://127.0.0.1:5173/research?view=csv` (chọn dự án trước)
- **Các bước:**
  1. Nhập một file CSV (Sensor Tower hoặc AdMob).
  2. Xem phần kết quả: số dòng hợp lệ, cảnh báo, số liệu có nguồn.
  3. Kiểm tra không có "phân tích AI" hay khuyến nghị bị viết sẵn.
- **Kết quả:** [ ] Chấp nhận  [ ] Cần sửa  [ ] Chưa thử
- **Nhận xét:**

### 9. So sánh hai kỳ CSV (G3-01)
- **Mục đích:** So sánh hai kỳ dữ liệu có cùng định nghĩa và phạm vi.
- **Đường dẫn:** `http://127.0.0.1:5173/compare-periods`
- **Các bước:**
  1. Chọn hai kỳ có cùng nguồn và phạm vi.
  2. Xem chênh lệch. Kiểm tra mỗi chênh lệch có nguồn và kỳ.
  3. Thử chọn hai kỳ không tương thích. Kiểm tra app từ chối hoặc cảnh báo rõ.
- **Kết quả:** [ ] Chấp nhận  [ ] Cần sửa  [ ] Chưa thử
- **Nhận xét:**

## Sau khi chấm

Chép kết quả vào board đúng mục:

| Mục | Board | Kết quả (Chấp nhận / Cần sửa / Chưa thử) | Ngày | Nhận xét nguyên văn |
|---|---|---|---|---|
| 1 | G1-02 | | | |
| 2 | G2-01 | | | |
| 3 | G2-02 | | | |
| 4 | G2-03 | | | |
| 5 | G2-04 | | | |
| 6 | G4-01 | | | |
| 7 | G4-02 | | | |
| 8 | G3-01 | | | |
| 9 | G3-01 | | | |

Nếu bạn chọn "Cần sửa", ghi lý do cụ thể (màn hình, bước, điều bạn mong đợi). Đó là đầu vào của R3.
