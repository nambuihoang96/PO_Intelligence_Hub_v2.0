# Checklist nghiệm thu cho chủ dự án (phiên bản 2, tối đa 4 mục)

Ngày: 2026-11-04. Chỉ gồm các việc cần mắt người nhìn. Các phần còn lại được máy kiểm và ghi trong `docs/RECOVERY_BOARD.md`.

**Lưu ý quan trọng:** các bước trong mục 2, 3 và 4 lưu vào dữ liệu thật của anh.

## Chuẩn bị

1. Double-click `run.bat` ở thư mục gốc dự án.
2. Nếu được hỏi "Type Y to continue", gõ `Y` rồi Enter.
3. Mở `http://127.0.0.1:5173` nếu trình duyệt chưa mở.

Cho mỗi mục, chọn **Được** hoặc **Chưa được**. Nếu chọn "Chưa được", ghi một câu về điều anh thấy.

---

## Mục 1. Đọc báo cáo Puzzle 2026

- **Mở:** `http://127.0.0.1:5173/reports/47452361-7c16-48ea-aa89-df8469db681d`
- **Nhìn:**
  - Tiêu đề "Game puzzle nào đang đứng đầu thị trường năm 2026", kèm Toàn cầu, Android/iOS, 2026.
  - Phần "Kết luận nghiên cứu" đọc được và không bị cắt.
  - Mỗi phát hiện có nhãn "Chưa xác minh độc lập".
  - Phần số liệu ghi rõ "Chưa đủ dữ liệu tương thích để tạo biểu đồ" thay vì vẽ biểu đồ sai.
- **Thử nhanh:** thu hẹp cửa sổ trình duyệt hết cỡ. Trang không được bị kéo ngang.
- **Được / Chưa được vì:** ______

## Mục 2. Lưu quyết định PO và xem ở Theo dõi

- **Mở:** báo cáo ở mục 1.
- **Làm:** chọn một phát hiện, ghi quyết định của anh, rồi lưu. Thao tác này lưu vào dữ liệu thật của anh.
- **Mở:** `http://127.0.0.1:5173/tracking?projectId=897a61dd-f7a6-42b9-ad50-7301cf648fe5`
- **Nhìn:** quyết định vừa lưu hiện đúng nội dung và đúng nguồn của phát hiện. Trước khi lưu, trang này ghi "Chưa có quyết định PO nào được lưu trong dự án này".
- **Được / Chưa được vì:** ______

## Mục 3. Phân tích một file CSV (Sensor Tower, kỳ 14/09 – 13/10)

- **Mở:** `http://127.0.0.1:5173/research?projectId=897a61dd-f7a6-42b9-ad50-7301cf648fe5&view=csv`
- **Làm:** bấm "Chọn tệp CSV", chọn file `Unified Top Apps Downloads YoY Growth (Sep 14, 2026 - Oct 13, 2026, Worldwide),rutgon.csv` trong thư mục Downloads, xem thử, rồi lưu. Thao tác này lưu vào dữ liệu thật của anh.
- **Nhìn:**
  - Kỳ vọng: 25 sản phẩm hợp lệ, dòng trống không bị báo lỗi. Máy chưa kiểm được trên bản sao (NOT VERIFIED), nên đây là điều cần anh xác nhận.
  - Cảnh báo kỳ dữ liệu sẽ hiện, dạng: "Tên tệp ghi kỳ từ 2026-09-14 đến 2026-10-13, nhưng ngày trong CSV chỉ từ 2026-09-14 đến 2026-09-14. Hãy kiểm tra kỳ trước khi so sánh tệp này."
  - Sản phẩm không có số so sánh năm trước sẽ có ghi chú: "Dòng … không có giá trị so sánh cùng kỳ năm trước (không có dữ liệu năm trước, có thể là app mới ra mắt)." Không hiện 0%.
  - Hai câu trên đã được dịch sang tiếng Việt (phiên bản sau kiểm thử của anh). Nếu trên màn hình vẫn là tiếng Anh, hãy báo lại.
  - Không có nhận xét hay khuyến nghị do máy viết.
- **Được / Chưa được vì:** ______

## Mục 4. So sánh hai kỳ CSV

- **Mở:** `http://127.0.0.1:5173/compare-periods?projectId=897a61dd-f7a6-42b9-ad50-7301cf648fe5`
- **Làm:** bấm "Thêm tệp CSV mới", chọn file `Unified Top Apps Downloads YoY Growth (Oct 14, 2026 - Nov 13, 2026, Worldwide),rutgon - Copy.csv` và lưu. Thao tác này lưu vào dữ liệu thật của anh. Sau đó chọn file mục 3 làm "Tệp kỳ trước" và file vừa thêm làm "Tệp kỳ hiện tại".
- **Nhìn:** mỗi chênh lệch có nguồn và kỳ rõ ràng. Nếu hai kỳ không cùng định nghĩa hoặc kỳ 2 chưa đầy đủ, app phải cảnh báo rõ và không đưa ra kết luận tăng/giảm. Kỳ vọng này chưa được máy kiểm trên bản sao (NOT VERIFIED).
- **Được / Chưa được vì:** ______

---

## Dành cho kỹ thuật (không cần chủ dự án làm)

- **Sao lưu tự động trong launcher:** có script và test (`scripts/test-launcher-backup.ps1`, 20/20 PASS). Bản sao nằm trong `data-backups` cạnh `data`, và đã được gitignore. `run-local.ps1` chưa được chạy end-to-end trên dữ liệu thật.
- **Lần bấm `run.bat` đầu tiên của chủ dự án với launcher mới là lần đầu bản sao lưu tự động chạy trên dữ liệu thật.** Chưa kiểm end-to-end. Database thật đã ở bản migration mới nhất (`20261103_0017`), nên lần chạy này không đổi cấu trúc dữ liệu.
- **Khôi phục nếu lỗi:** đóng PO Hub, đổi tên `data` lỗi, đổi tên thư mục sao lưu mới nhất thành `data`, rồi chạy lại `run.bat`.
- Chưa xác minh (NOT VERIFIED) cho các mục sau, do máy kiểm:
  - Dán báo cáo một lần và kiểm tra trùng (G2-01): chưa chạy lại trên dữ liệu thật.
  - Đồng nhất dự án và báo cáo (G2-02): chưa kiểm.
  - So sánh hai báo cáo (G4-01): chưa có hai báo cáo cùng phạm vi trong một dự án để so.
  - Giao diện mobile của mục 1 và các thao tác bấm trên trình duyệt: chưa kiểm được do cửa sổ trình duyệt không hiển thị.
- Kết quả R4-A (một lượt Codex trên QA): xong, 66,66 giây, trả về theo mẫu `po_research_v1`. Nội dung và nguồn chưa được kiểm chứng.
