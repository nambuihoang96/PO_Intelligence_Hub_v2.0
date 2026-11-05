# Brief cho planner (Claude Opus 5.5, medium) — trạng thái dự án ngày 2026-11-05

Mục đích: để một phiên planner mới hiểu ngữ cảnh mà không cần đọc lại cả cuộc trò chuyện. Nguồn sự thật vẫn là các file trong repo. File này chỉ là điểm vào.

## 1. Cách bắt đầu một phiên planner mới

Mở phiên Claude Code trong thư mục `D:\AI\PO Analysis\PO_Intelligence_Hub_v2.0`, rồi dán lời nhắc sau:

> Bạn là planner duy nhất (Claude Opus 5.5, medium) cho dự án PO Intelligence Hub. Chủ dự án là PO, không biết code, giao tiếp tiếng Việt. Đọc theo thứ tự: `docs/PLANNER_BRIEF_20261105.md`, `AGENTS.md`, `docs/RECOVERY_BOARD.md` (mục cuối cùng HAIKU-CLOSEOUT và các mục UX/feedback), `docs/HAIKU_RESEARCH_CLOSEOUT_PLAN.md` (mục 7–8), `docs/UX_REVIEW_CSV_20261104.md`, `docs/R2_OWNER_CHECKLIST_v2.md`. Sau đó đề xuất next action theo mục 6 của file brief. Không sửa code, không merge, không ghi dữ liệu thật, không gọi model trả phí khi chưa được duyệt.

Phiên mới không kế thừa cuộc trò chuyện này. Mọi thứ cần nhớ phải nằm trong các file trên.

## 2. Đã xong (kiểm chứng được)

- **Sao lưu tự động trong launcher:** `scripts/launcher-backup.ps1`, `scripts/backup_sqlite.py`, `scripts/test-launcher-backup.ps1` (20/20 PASS). `run-local.ps1` gọi sao lưu trước `alembic upgrade head`. Trợ lý duyệt đã DUYỆT vòng 2. Chưa chạy `run-local.ps1` trên dữ liệu thật.
- **R0:** môi trường kiểm tra xong.
- **R1 (dữ liệu thật):** AdMob đã preview; Sensor Tower thật (`...rutgon.csv`) đã preview. Đã sửa: `39.73%` với đơn vị `%`, cảnh báo kỳ theo tên tệp, nhãn ô YoY trống. Chưa kiểm trên giao diện đầy đủ.
- **R4-A:** đã chạy đúng một lượt Codex trên QA (`gpt-6-luna`, 66,66 giây, mã thoát 0). JSON `po_research_v1` hợp lệ. Nội dung và nguồn chưa kiểm chứng. Không đủ để kết luận về timeout 240 giây, nên chưa cần R4-B.
- **Bản sao dữ liệu thật:** báo cáo Puzzle 2026 đã có sẵn, khớp với file đầu vào.
- **Checklist cho chủ dự án v2:** `docs/R2_OWNER_CHECKLIST_v2.md` (4 mục cần mắt người). Đã DUYỆT vòng 2.
- **Cảnh báo CSV:** đã dịch sang tiếng Việt. Trợ lý duyệt đã DUYỆT. Dữ liệu nhập trước đó vẫn giữ câu tiếng Anh.

## 3. Chưa xong hoặc chưa kiểm chứng

- Chủ dự án chưa nghiệm thu bất kỳ mục nào. Im lặng không được coi là chấp nhận.
- Chưa kiểm trên trình duyệt: lưu quyết định PO, nhập hai file CSV, so sánh hai kỳ, bản mobile.
- Chưa kiểm: G2-01 (dán một lần và trùng), G2-02 (định danh dự án–báo cáo), G4-01 (so sánh hai báo cáo; mỗi dự án hiện chỉ có một báo cáo trong bản sao).
- Chưa chạy `run-local.ps1` thật. Lần đầu tiên chủ dự án bấm `run.bat` với launcher mới là lần đầu sao lưu tự động trên dữ liệu thật.
- Chưa chạy full test suite và frontend test.
- Chưa phân tích trong `RECOVERY_BOARD`: mục R3 chờ phản hồi "Cần sửa" của chủ dự án.

## 4. Quyết định đang chờ chủ dự án

1. **Một màn hình so sánh hay hai.** Hiện có tab "So sánh hai kỳ" trong trang Phân tích CSV và trang "So sánh hai kỳ CSV" riêng. Cần chọn một, planner đề xuất cách gộp.
2. **Phạm vi insight.** Chủ dự án yêu cầu tối thiểu: đánh giá top 10 game trong danh sách; nói rõ thay đổi giữa các kỳ; điều đáng chú ý; insight gameplay/cơ chế từ nguồn internet (có nguồn); nhận định sub-genre dẫn đầu. Cần planner thiết kế: đầu vào, xử lý, màn hình, giới hạn dữ liệu, và phân biệt dữ liệu có nguồn với nhận định.
3. **Nhập lại tệp để thấy câu cảnh báo tiếng Việt,** hay để nguyên dữ liệu cũ.
4. **Vai trò planner.** Chủ dự án muốn một planner duy nhất là Opus 5.5 (medium), vừa brainstorm vừa làm trợ lý duyệt. `docs/HAIKU_RESEARCH_CLOSEOUT_PLAN.md` vẫn ghi Sonnet 5.5 là planner. Cần cập nhật file đó.

## 5. Ràng buộc không được vi phạm

- Không reset, clean, stash, hay ghi đè thay đổi chưa commit. Nhánh `feat/ux-recovery-01-research-results` có rất nhiều thay đổi chưa commit.
- Không merge, không push, không release.
- Không ghi vào dữ liệu thật ngoài các thao tác chủ dự án tự làm. Thử nghiệm dùng bản sao hoặc QA cô lập (cổng 154xx).
- Không gọi model trả phí ngoài các lượt đã duyệt.
- Không migration mới nếu chưa được duyệt.
- Insight phải có nguồn; không gọi phép tính cứng là "AI insight"; không bịa số liệu, GEO, kỳ hay nền tảng.

## 6. Next action đề xuất (planner quyết)

1. Chủ dự án chọn một màn hình so sánh và trả lời phạm vi insight (mục 4.1 và 4.2).
2. Planner viết bản thiết kế ngắn cho màn hình CSV gộp: một luồng, cảnh báo lên đầu, ẩn thuật ngữ, và trạng thái rõ khi xử lý. Chưa code trước khi duyệt.
3. Planner viết bản thiết kế insight tối thiểu (mục 4.2), gồm nguồn và cách ghi nhãn.
4. Chủ dự án bấm `run.bat` (gõ `Y` nếu được hỏi), rồi làm checklist v2. Kết quả gửi lại để chép vào board.
5. Sau khi có phản hồi "Cần sửa" của chủ dự án: thực hiện R3 theo quy trình trong kế hoạch.
6. Sau đó mới cân nhắc R6-A và R4-B (cần thiết kế duyệt trước, có migration).

## 7. Các file cần đọc

- `AGENTS.md`: quy tắc của dự án.
- `docs/RECOVERY_BOARD.md`: nguồn sự thật, đọc phần cuối.
- `docs/HAIKU_RESEARCH_CLOSEOUT_PLAN.md`: kế hoạch chốt (mục 7 cổng duyệt, mục 8 chỉ đạo).
- `docs/UX_REVIEW_CSV_20261104.md`: phản hồi UX của chủ dự án và câu trả lời.
- `docs/R2_OWNER_CHECKLIST_v2.md`: checklist chủ dự án sẽ làm.
- `docs/PO_INTELLIGENCE_MASTER_PLAN.md`: kế hoạch tổng thể (mục 7 và 8 là hướng dẫn cũ, không phải lệnh hiện tại).
- `handoff/claude-transfer-2026-11-04/CLAUDE_HANDOFF.md`: bàn giao gốc.
