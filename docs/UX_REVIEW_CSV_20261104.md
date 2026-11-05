# Phản hồi UX: Phân tích CSV và So sánh hai kỳ (2026-11-04)

Nguồn: chủ dự án thử trên dữ liệu thật, trang `http://127.0.0.1:5173/research?projectId=897a61dd-f7a6-42b9-ad50-7301cf648fe5&view=csv`, kèm 3 ảnh chụp màn hình.
Trạng thái: **backlog, chưa sửa code**. Sẽ làm ở khâu validate UI/UX theo yêu cầu của chủ dự án.

## 1. Điều chủ dự án thấy (quan sát của PO)

| # | Quan sát | Nơi xảy ra |
|---|---|---|
| 1 | Không thấy cảnh báo "file name states the period … but the CSV dates cover …" | Trang Phân tích CSV, sau khi nhập file |
| 2 | Không thấy sản phẩm nào có ghi chú "no year-over-year value …" | Danh sách 25 sản phẩm |
| 3 | Trang phân tích CSV "không thấy insight gì", chưa đúng chức năng | Trang Phân tích CSV |
| 4 | Bấm "Phân tích cặp tệp này" thì biểu tượng xoay mãi | Tab So sánh hai kỳ |
| 5 | Phần so sánh hai kỳ khó hiểu | Tab So sánh hai kỳ và trang So sánh hai kỳ CSV |
| 6 | Nhìn chung nhiều màn hình chưa dễ hiểu, dễ dùng | Toàn bộ luồng CSV |

## 2. Kiểm tra thực tế (đã đối chiếu với dữ liệu thật, chỉ đọc)

- **Mục 1 và 2 (cảnh báo bị "mất"): cảnh báo CÓ được lưu, nhưng nằm ẩn.**
  - Hai dataset nhập ngày 2026-11-04 (16:24 và 16:34) đều có cảnh báo kỳ dữ liệu và 17 ghi chú YoY trong danh sách lý do kiểm tra (`validation_reasons_json`).
  - Giao diện hiện chỉ ghi: "Ngày ghi trong CSV: 14/09/2026 (chưa xác nhận ý nghĩa kỳ đo)" và một khối "Thông tin cần xem lại" thu gọn. Cảnh báo nằm trong khối thu gọn này, nên người dùng không thấy.
  - Ghi chú YoY chỉ nằm trong chi tiết từng dòng, không hiện ở danh sách sản phẩm.
  - Kết luận: vấn đề là **khả năng phát hiện**, không phải thiếu tính năng. Đồng thời, cả hai câu cảnh báo đều là tiếng Anh.
- **Mục 3 (không có insight):** đúng về thiết kế hiện tại. Trang này chỉ liệt kê số liệu và nguồn, không có kết luận. Điều chủ dự án mong đợi (kết luận, xu hướng, điều cần làm) chưa được thiết kế. Đây là vấn đề **sản phẩm**, cần planner quyết định.
- **Mục 4 (xoay mãi):** chưa tái hiện được. Ảnh cho thấy hai tệp đang chọn giống hệt nhau và thông báo "Hãy chọn hai tệp khác nhau". Cần kiểm tra thêm trạng thái chờ khi bấm nút.
- **Mục 5 (khó hiểu) và cấu trúc:** có **hai màn hình so sánh** cho cùng một việc:
  - Tab "So sánh hai kỳ" nằm trong "Phân tích CSV".
  - Trang "So sánh hai kỳ CSV" riêng.
  - Hai nơi có form khác nhau (chọn chỉ số, thị trường, nền tảng, ý nghĩa ngày, nút "Tạo kết quả so sánh" và "Phân tích cặp tệp này"). Người dùng không biết nên dùng cái nào.
  - Form có nhiều ô bắt buộc và thuật ngữ kỹ thuật ("ý nghĩa ngày", "phép đo", "phương pháp đo tương thích") trước khi thấy bất kỳ kết quả nào.

## 3. Đề xuất hướng xử lý (để planner brainstorm)

1. **Một luồng duy nhất** cho CSV: chọn file → xem tóm tắt → chọn kỳ để so (nếu có hai file) → kết quả. Bỏ hoặc gộp tab "So sánh hai kỳ" trùng với trang riêng.
2. **Đưa cảnh báo lên đầu**, không để trong khối thu gọn: một dòng tóm tắt kiểu "Có 2 điều cần kiểm tra trước khi dùng số liệu" với nút mở chi tiết. Dịch sang tiếng Việt.
3. **Insight có cấu trúc, không tự bịa:** chỉ đưa ra điều có thể tính từ dữ liệu (ví dụ: top 5 theo lượt tải, số sản phẩm có/không có số năm trước, tổng lượt tải), mỗi con số ghi rõ nguồn và kỳ. Không gọi là "AI insight". Phải được planner và chủ dự án duyệt trước khi làm.
4. **Trạng thái rõ ràng:** khi đang xử lý hiện thanh tiến trình kèm chữ, khi lỗi hiện nguyên nhân và cách sửa, không xoay mãi.
5. **Ẩn thuật ngữ kỹ thuật** trong luồng mặc định (ý nghĩa ngày, phép đo, phương pháp). Chỉ hiện khi người dùng mở "Chi tiết kỹ thuật".

## 4. Câu hỏi cần chủ dự án / planner trả lời trước khi làm

- Có muốn một màn hình so sánh duy nhất không? Nếu có, giữ bên nào?
- Insight nên gồm những gì? Ví dụ top sản phẩm, sản phẩm tăng/giảm nhiều nhất, nhóm mới ra mắt. Chủ dự án chọn.
- Hai câu cảnh báo tiếng Anh: dịch trước khi nghiệm thu, hay để tạm?
- Nút "Phân tích cặp tệp này" đang xoay: có phải do chọn hai tệp giống nhau? Cần kiểm lại khi có hai tệp khác nhau.

## 5. Ghi chú về quy trình

- Kế hoạch chốt ghi planner là Claude Sonnet 5.5 và Opus là trợ lý duyệt theo cổng. Nếu chủ dự án muốn brainstorm với Opus 5.5, có thể dán nội dung file này vào một phiên Opus mới. Phiên đó chỉ nên đọc và đề xuất, không sửa code.

## 6. Trả lời của chủ dự án (2026-11-04)

**Vai trò:** chủ dự án muốn **một planner duy nhất là Claude Opus 5.5 (medium)** vừa để brainstorm vừa làm trợ lý duyệt theo cổng. Không tách hai vai. Ghi nhận cho kế hoạch: vai trò planner trong `HAIKU_RESEARCH_CLOSEOUT_PLAN.md` (đang ghi Sonnet 5.5) cần được cập nhật theo chỉ đạo này. Chưa sửa file đó vì thuộc planner.

**Câu 1 (một màn hình so sánh hay hai):** hiện có hai nơi so sánh cùng việc, đó là tab "So sánh hai kỳ" nằm trong trang Phân tích CSV và trang "So sánh hai kỳ CSV" riêng. Câu hỏi là chọn giữ một trong hai. Chủ dự án chưa trả lời, cần làm rõ với planner.

**Câu 2 (insight phải có gì), yêu cầu tối thiểu:**
1. Đọc và đưa đánh giá về top 10 game đáng chú ý trong danh sách.
2. Nếu là so sánh, nói rõ thay đổi giữa các kỳ.
3. Điều gì đáng chú ý trong danh sách.
4. Nghiên cứu và đưa insight về gameplay, cơ chế (mechanics) của top 10 game, thu thập từ internet, có nguồn.
5. Nhận định sub-genre nào đang dẫn đầu từ dữ liệu này.
6. Các mục khác do planner đề xuất.

Ghi chú cho planner: mục 4 và 5 cần tra cứu bên ngoài và phân biệt rõ dữ liệu có nguồn, giả thuyết và nhận định của AI. Mục 5 là nhận định, không phải số liệu.

**Câu 3 (dịch hai câu cảnh báo):** đã dịch trong mã nguồn và test. Lưu ý: dữ liệu đã nhập trước đó vẫn lưu câu tiếng Anh. Cần nhập lại tệp để thấy câu tiếng Việt.
