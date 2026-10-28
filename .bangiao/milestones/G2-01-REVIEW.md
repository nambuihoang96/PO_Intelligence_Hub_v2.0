# G2-01 — Kiểm tra nhập và mở báo cáo (28-10-2026)

## Kết quả

- **Kiểm tra kỹ thuật theo phạm vi:** PASS. **Nghiệm thu sản phẩm:** chờ PO; không tuyên bố PRODUCT PASS.
- Trên cơ sở dữ liệu QA cô lập, nhập một lần báo cáo văn bản có nhãn QA; báo cáo giữ nguyên nội dung và URL, mở lại sau refresh và không tự tạo phát hiện. Nhập lại cùng nội dung mở đúng report ID cũ và thông báo trùng.
- Báo cáo JSON có cấu trúc QA được nhập và mở từ dự án; kết luận và phát hiện hiển thị theo dữ liệu cung cấp. Project Home hiển thị cả hai báo cáo cùng đúng ID. Hai báo cáo dùng dữ liệu giả lập để kiểm thử, không phải nghiên cứu thật.
- Sửa nhãn nhầm trên trang tổng quan: ghi chú lịch sử riêng của báo cáo được gọi đúng tên, không còn trình bày như quyết định hiện hành của dự án. Dữ liệu không bị di chuyển hoặc ghi đè.

## Kiểm thử và hình ảnh

- Frontend: 26 files, 221 tests PASS; TypeScript và production build PASS (cảnh báo chunk lớn hơn 500 kB).
- Backend `test_reports.py`: 31 tests PASS với SQLite tạm và migrations; không sử dụng SQLite sản xuất.
- Browser QA: text-only, structured, duplicate, reopen/refresh và project context PASS theo các thao tác trên. Desktop 1440×900: [báo cáo cấu trúc](../screenshots/g2-01/structured-report-desktop.jpg); mobile 390×844: [báo cáo văn bản](../screenshots/g2-01/text-report-mobile.jpg).
- Mobile header còn cao; cải tiến thiết kế rộng hơn thuộc G1-02 và chưa được nghiệm thu sản phẩm. Bộ dữ liệu thật và hành trình báo cáo dài vẫn cần G2-04; không xác nhận thay bằng fixture.

## Product Acceptance

- **PO goal:** Lưu một báo cáo nghiên cứu và mở lại trong dự án.
- **User journey:** Dán một lần → lưu → xem báo cáo → trở về dự án và mở lại.
- **Automated work:** Nhận diện nội dung hỗ trợ, giữ bản gốc và phát hiện nhập trùng.
- **Expected result:** Báo cáo văn bản hiển thị nguyên văn; báo cáo có cấu trúc hiển thị phát hiện thật sự được cung cấp.
- **Remaining friction:** Văn bản thuần không tự sinh insights; header mobile cao. Nghiệm thu với báo cáo ChatGPT thật chưa thực hiện.
- **Verification:** Các kiểm tra tự động và browser QA liệt kê ở trên.
- **Decision:** TECHNICAL PASS theo phạm vi nêu trên; PRODUCT ACCEPTANCE PENDING.

## Files

`frontend/src/reports/ReportResults.tsx`, `frontend/src/reports/ResearchIntake.test.tsx`, `docs/RECOVERY_BOARD.md`, tài liệu và ảnh trong `.bangiao/`. Không đổi backend, schema hay dữ liệu sản xuất.
