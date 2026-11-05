# Kế hoạch chốt phần Research (planner: Claude Sonnet 5.5, người làm: phiên Haiku 5.5 medium)

Ngày lập: 2026-11-04. Nguồn sự thật về tiến độ vẫn là `docs/RECOVERY_BOARD.md`. File này chỉ là lộ trình chốt Research, không thay thế board và không phải một roadmap cạnh tranh.

## 1. Kết luận của planner

Phần Research **gần như đã xây xong**. Gần như mọi mục G1-02, G2-01..04, G3-01, G4-01/02 đang ở trạng thái `READY_FOR_OWNER` hoặc `DEV_DONE`, nghĩa là code đã có và đang **chờ chủ dự án nghiệm thu**, không phải chờ viết thêm. Phần còn thiếu để gọi là "xong Research":

1. **Nghiệm thu của chủ dự án** cho từng mục (im lặng không tính là chấp nhận).
2. **Chạy thử bằng file thật** của chủ dự án (Sensor Tower, AdMob). Từ trước tới nay các bài kiểm tra hầu hết dùng dữ liệu tổng hợp (synthetic).
3. **Hai chỗ chưa xác minh**: nguyên nhân timeout 240 giây của Codex research, và máy chủ thật (cổng 8000) vẫn đang chạy code cũ.
4. **Đã duyệt ngày 2026-11-04:** research chạy nền không mất kết quả (R4) và cập nhật research theo lịch tuần/tháng (R6).

Phiên Haiku **không viết tính năng lớn**. Việc của nó là kiểm tra, sửa lỗi nhỏ trong phạm vi một module, và chuẩn bị gói nghiệm thu.

## 2. Luật chung cho phiên Haiku (bắt buộc)

- Làm **đúng một nhiệm vụ R-n mỗi lượt**, xong thì báo cáo và dừng.
- Đọc trước: `AGENTS.md`, `handoff/claude-transfer-2026-11-04/CLAUDE_HANDOFF.md`, mục liên quan trong `docs/RECOVERY_BOARD.md`. Không đọc lại cả dự án.
- Chỉ đọc và sửa module liên quan. Chạy test/build **theo file** (focused), không chạy toàn bộ test suite, không quét cả repo (quy tắc quota của chủ dự án ngày 2026-11-04).
- Không gọi Codex hay model trả phí để kiểm tra code. Không chạy suy luận thật trừ khi nhiệm vụ ghi rõ và chủ dự án đã đồng ý.
- Nhánh hiện tại có nhiều thay đổi chưa commit: **không** reset, clean, checkout đè, stash, hay xoá. Chạy `git status` đầu tiên và ghi lại.
- Mọi thử nghiệm dùng **database cô lập** (thư mục `.bangiao/qa/<tên>/data`, cổng 154xx). Không ghi vào dữ liệu thật ở cổng 8000.
- Không thêm migration, không sửa `models.py` hay `schemas.py` quá một trường nhỏ, **trừ R6-A và R4-B** (xem mục 4, phải có bản thiết kế được planner duyệt trước). Ngoài ra nếu cần hơn: **dừng và hỏi planner**.
- Không bịa số liệu, không điền GEO/ngày/nền tảng bằng suy đoán. Không ghi "PASS" cho thứ chưa chạy; dùng `NOT VERIFIED`.
- Không merge, push, release.
- Sau mỗi nhiệm vụ: cập nhật mục tương ứng trong `RECOVERY_BOARD.md` (không ghi đè phần cũ) và báo cáo theo mẫu ở mục 5.

## 3. Danh sách nhiệm vụ (làm lần lượt)

### R0. Kiểm tra đầu vào (chỉ đọc, không sửa gì)
- Chạy `git status`, ghi nhánh, HEAD, số file thay đổi. Xác nhận `.env` và database thật không bị đụng tới.
- Xác nhận có Python/Node phù hợp, `.venv` và `node_modules` dùng được.
- **Xong khi:** có một đoạn báo cáo ngắn về hiện trạng môi trường. Nếu môi trường hỏng (không chạy được test), dừng và báo.

### R1. Chạy thử bằng 2 file CSV thật (ưu tiên cao nhất)
Chủ dự án sẽ đặt hai file vào thư mục QA cô lập (đừng copy vào repo hay commit chúng):
- `Unified_Top_Apps_Downloads_YoY_Growth__Sep_14__2026_-_Oct_13__2026__Worldwide__rutgon.csv` (Sensor Tower)
- `admob-report (1).csv` (AdMob)

Planner đã đọc thử hai file và thấy các đặc điểm sau. Phiên Haiku phải kiểm tra app xử lý ra sao với từng điểm:

| Đặc điểm của file thật | App phải làm |
|---|---|
| Sensor Tower: phân tách bằng dấu chấm phẩy, UTF-8 có BOM | Nhận đúng định dạng, không báo lỗi cột |
| 10.000 dòng nhưng chỉ 25 dòng có dữ liệu, còn lại trống | Bỏ dòng trống, báo rõ "25 sản phẩm hợp lệ", không báo 9.975 lỗi |
| Chỉ một ngày duy nhất (14/09/2026) dù tên file ghi 14/09 đến 13/10 | Ghi nhận kỳ dữ liệu theo nội dung file và cảnh báo lệch với tên file; không tự suy ra kỳ khác |
| Không có cột GEO/quốc gia, nền tảng ghi "Unified" | Hiện GEO là "chưa rõ", không điền Worldwide từ tên file |
| Cột "YoY Growth %" lẫn dấu chấm (ví dụ `1.296.217.657`) | Không hiển thị nó như một phần trăm đúng; tính lại từ hai cột tuyệt đối hoặc báo "không đọc được" |
| App mới ra mắt (không có số năm trước, 16/25 dòng) | Hiện "mới ra mắt" hoặc "chưa có dữ liệu", không coi là 0% và không chia cho 0 |
| AdMob: UTF-16, phân tách bằng tab, 33 cột, giá trị như `39.73%`, nhiều ô trống | Đọc được, chuyển phần trăm đúng, ô trống là "không có" chứ không phải 0 |
| AdMob: chỉ 6 ngày (29/08 đến 03/09), ngày cuối thiếu (lượt hiển thị khoảng một nửa các ngày trước) | Không rút ra xu hướng từ ngày cuối; cảnh báo "ít dữ liệu" nếu có tính năng so sánh |

- **Việc làm:** nhập từng file vào QA cô lập, mở CSV analytics, ghi lại kết quả theo bảng trên (đúng / sai / chưa kiểm tra). Chụp màn hình bằng trình duyệt nếu có.
- **Được sửa:** lỗi phân tích cú pháp nhỏ trong module nhập CSV, kèm một test nhỏ dùng dữ liệu **tổng hợp** có cùng định dạng (không đưa dòng thật vào test hay repo).
- **Dừng và hỏi planner** nếu cần đổi schema, hoặc nếu sửa ảnh hưởng tới CSV demo hiện có.
- **Xong khi:** bảng kết quả hoàn chỉnh, mọi lỗi tìm thấy hoặc đã sửa kèm test, hoặc đã ghi vào mục "Defects" của board.

### R2. Gói nghiệm thu Research cho chủ dự án (không sửa code)
- Lập một checklist ngắn bằng tiếng Việt, mỗi mục một đường dẫn mở thẳng và 2–4 thao tác để chủ dự án tự bấm thử: nhập báo cáo một lần dán, xem Report Reader, lưu quyết định PO, so sánh hai báo cáo, xem Tracking, phân tích một CSV và so hai kỳ.
- Mỗi mục có ba lựa chọn cho chủ dự án: **Chấp nhận / Cần sửa (ghi lý do) / Chưa thử**. Kết quả được chép vào board đúng mục (G1-02, G2-01..04, G3-01, G4-01/02) với ngày và nguyên văn nhận xét.
- Chỉ dùng dữ liệu QA hiện có hoặc dữ liệu thật của chủ dự án; không tạo thêm dữ liệu giả để cho "đẹp".
- **Xong khi:** checklist nằm trong `docs/` và chủ dự án đã có nó trong tay.

### R3. Xử lý các mục "Cần sửa" mà chủ dự án trả về
- Mỗi nhận xét là một vòng phản hồi mới đặt dưới mục gốc trong board (quy tắc `REWORK → IN_PROGRESS → DEV_DONE → READY_FOR_OWNER`). Không tạo mục trùng.
- Sửa nhỏ, theo module, test theo file. Việc nào vượt quy mô (đổi luồng, đổi bố cục Peachy, đổi dữ liệu) thì dừng và đưa lại cho planner.

### R4. Research chạy được lâu mà không mất kết quả (đã chốt với chủ dự án ngày 2026-11-04: A rồi B)

**Hiện trạng trong code** (`backend/app/codex_research.py`): trình duyệt gửi một yêu cầu rồi đứng chờ; web search bật sẵn; quá 240 giây (`RESEARCH_TIMEOUT_SECONDS`) thì Codex bị tắt và mất toàn bộ kết quả vì đầu ra chỉ được đọc lúc kết thúc. Giả thuyết chưa kiểm chứng: research thật có tìm web mất hơn 4 phút.

**Nguyên tắc chủ dự án đặt ra:** sau này có thể không dùng Codex nữa, nên phần chạy nền, lịch và so sánh **không được phụ thuộc vào Codex**. Codex chỉ là một "bộ máy research" cắm vào được. Bộ máy luôn có sẵn là **ChatGPT dán một lần** (thủ công). Các bộ máy khác (CLI khác, API trả phí) chỉ thêm khi chủ dự án duyệt riêng, vì có chi phí.

#### R4-A. Đo một lần (chủ dự án đã cho phép đúng 1 lượt quota)
- Dùng QA cô lập. Model nhẹ đã có trong danh mục (ví dụ `gpt-6-luna`), reasoning low, **bật web search**.
- Câu hỏi dùng nguyên văn: *"Top 5 game puzzle tăng tải nhanh nhất tháng 10/2026 trên Google Play US, kèm nguồn."*
- Bấm "Chạy bằng Codex" **đúng một lần**, không thử lại kể cả khi lỗi. Ghi lại: thời điểm bắt đầu/kết thúc theo log `record(...)`, mã thoát, có hết 240 giây không, độ dài nội dung, câu trả lời có theo mẫu `PO_RESEARCH_V1` không.
- **Kết luận được phép:** chỉ những gì log cho thấy. Nếu hết giờ thì ghi "vượt 240 giây với câu hỏi này", không ghi nguyên nhân sâu hơn.
- **Xong khi:** board ghi bằng chứng, và có quyết định: làm R4-B ngay (nếu hết giờ hoặc trên 120 giây), hoặc để R4-B sau.

#### R4-B. Chạy research ở nền, bộ máy cắm được (cần planner duyệt bản thiết kế trước khi code)
Hành vi cần có:
1. Bấm "Chạy" → app trả về ngay một **phiếu research** với trạng thái `Đang chạy`. Màn hình hiện thời gian đã chạy và nút **Huỷ**.
2. Đóng tab hoặc tải lại trang không mất phiếu; mở lại thấy đúng trạng thái. Xong thì phiếu chuyển sang `Xong`, câu trả lời được **xem trước rồi mới lưu**, như luồng hiện tại.
3. Giới hạn chạy dài hơn (đề xuất 15 phút, một hằng số), hết giờ thì `Hết giờ` và giữ lại câu hỏi. Huỷ thì tắt tiến trình.
4. Mỗi phiếu ghi: bộ máy, model, thời gian bắt đầu/kết thúc, trạng thái, lỗi (nếu có), câu hỏi, và report cũ liên kết. Không tự thử lại.
5. Lớp chạy nền gọi bộ máy qua một giao diện chung, ví dụ `run(question, scope) -> markdown`. Codex là bộ máy đầu tiên. Khi không có bộ máy tự động nào, app hiện luồng ChatGPT dán một lần như hiện tại.
6. Yêu cầu bộ máy trả về theo mẫu `PO_RESEARCH_V1` (Markdown + JSON) để so sánh hai kỳ hoạt động được, giống báo cáo ChatGPT.
7. Một lúc chỉ một phiếu chạy. Phiếu mới phải chờ trong hàng đợi, không chạy song song.
8. Tiến trình backend khởi động lại thì phiếu đang chạy chuyển sang `Bị gián đoạn`, không giả vờ đang chạy tiếp.

Ràng buộc: cần **một bảng mới** cho phiếu research, nên cần migration bổ sung (chỉ thêm, không sửa bảng cũ). Thử downgrade/upgrade trên database tạm. Test bằng bộ máy giả (mock), không tốn quota. Chạy thật chỉ khi chủ dự án cho phép thêm.

- Lưu ý: `PO_INTELLIGENCE_MASTER_PLAN.md` ghi "không gọi Codex CLI", nhưng chỉ đạo mới hơn của chủ dự án (feedback round 6, ngày 2026-11-03) cho phép Codex như một lựa chọn. Chỉ đạo mới thắng.

### R5. Máy chủ thật (cổng 8000) chạy code cũ: việc này do chủ dự án làm trên máy Windows
- Haiku **không** khởi động lại hay chạy migration trên dữ liệu thật.
- Việc của Haiku: viết hướng dẫn ngắn và an toàn: sao lưu file `po_intelligence_hub.sqlite3` và thư mục dữ liệu trước, kiểm tra tích hợp (`PRAGMA integrity_check`), rồi chạy `run.bat`; cách quay lại bản sao lưu nếu lỗi. Đây là một phần của G4-03/REL-01 và chưa được xác minh.
- **Xong khi:** hướng dẫn nằm trong `docs/` và chủ dự án đã đọc.

### R6. Cập nhật research theo lịch (đã chốt ngày 2026-11-04: A trước, B sau)
App đã có luồng research lại (dùng lại câu hỏi/phạm vi, kỳ mới, so với báo cáo cũ) nhưng phải tự nhớ để làm. `AUTO-01` (giám sát Internet tự động) vẫn hoãn; R6 không phải crawler.

#### R6-A. Nhắc trong app và cập nhật nhiều Project cùng lúc
1. Mỗi Project có thiết lập **Lịch cập nhật: Tắt / Hàng tuần / Hàng tháng** (mặc định Tắt, nên Project cũ không đổi gì).
2. Ngày đến hạn tính từ **lần research gần nhất** của Project, cộng 7 ngày hoặc 1 tháng. Chưa có lần nào thì đến hạn ngay khi bật.
3. Project Home hiện nhãn **"Đến hạn cập nhật"** hoặc **"Cập nhật tiếp: <ngày>"**, kèm nút mở luồng research lại có sẵn, điền sẵn câu hỏi/phạm vi.
4. Có danh sách **"Cần cập nhật"** liệt kê các Project đến hạn, mỗi dòng có ô tick, nút **"Cập nhật các mục đã chọn"**. Trước R4-B: nút mở lần lượt luồng research lại cho từng Project (dán ChatGPT). Sau R4-B: nút xếp từng Project vào hàng đợi phiếu research.
5. Lưu xong báo cáo mới thì ngày đến hạn tự dời. Nhắc chỉ hiện khi mở app; không chạy nền, không gọi mạng, không gửi thông báo.
6. Thay đổi giữa hai lần research vẫn hiện qua màn so sánh báo cáo có sẵn (G4-01). Không tự kết luận xu hướng từ dữ liệu không tương thích.

Ràng buộc: cần **thêm cột lịch cập nhật cho Project** (migration bổ sung, mặc định Tắt, thử downgrade/upgrade trên database tạm). Test theo file; kiểm tra trên trình duyệt với QA cô lập, gồm cả Project cũ không bật lịch.

#### R6-B. Tự chạy khi đến hạn (chỉ sau khi R4-B đã được chủ dự án chấp nhận)
- Mỗi Project chọn thêm: **Chỉ nhắc** (mặc định) hoặc **Tự chạy bằng <bộ máy>**.
- Khi app đang mở và có Project đến hạn ở chế độ tự chạy, app tạo phiếu research trong hàng đợi R4-B (mỗi lần một phiếu). Kết quả **chờ chủ dự án xem và lưu**, không tự lưu.
- Có giới hạn số phiếu tự chạy mỗi ngày (đề xuất 3) để không tiêu quota ngoài ý muốn. Bộ máy không dùng được thì quay về "Chỉ nhắc" và báo rõ.
- Nhắc khi app đóng (Task Scheduler Windows) không nằm trong phạm vi này; chỉ làm nếu chủ dự án yêu cầu sau.

## 4. Thứ tự và điểm dừng

`R0 → R1 → R4-A → R2 → (chủ dự án nghiệm thu) → R3 → R6-A → R4-B → R6-B → R5`

- R4-A được làm sớm vì chủ dự án đã cho phép đúng 1 lượt quota, và kết quả quyết định độ gấp của R4-B.
- **R6-A và R4-B được phép thêm migration bổ sung** như mô tả ở trên. Trước khi code, Haiku viết bản thiết kế ngắn (bảng/cột mới, API, màn hình, test) và **chờ planner duyệt**.
- R5 (khởi động lại máy chủ thật) để cuối, sau khi các migration mới đã được chấp nhận, để chủ dự án chỉ sao lưu và nâng cấp một lần.

Điểm dừng bắt buộc: migration ngoài hai mục trên, sửa tính năng ngoài phạm vi module, rủi ro mất dữ liệu, chi phí ngoài (thêm lượt quota hoặc API trả phí), hoặc mọi thứ liên quan merge/release.

## 5. Mẫu báo cáo sau mỗi nhiệm vụ (ngắn)

- Nhiệm vụ: R-n. Kết quả: PASS / PASS CÓ ĐIỀU KIỆN / CẦN SỬA / DỪNG.
- Đã chạy: liệt kê chính xác lệnh test/build/trình duyệt đã chạy. Chưa chạy: ghi `NOT VERIFIED`.
- Đã sửa: danh sách file.
- Còn vướng: tối đa 3 gạch đầu dòng.
- Cần chủ dự án quyết định: nếu có.

## 6. Lời nhắc khởi động cho phiên Haiku (dán nguyên văn)

> Bạn là người thực hiện trong dự án PO Intelligence Hub tại `D:\AI\PO Analysis\PO_Intelligence_Hub_v2.0`. Claude Sonnet 5.5 là planner, chủ dự án là PO không biết code. Hãy đọc `AGENTS.md`, `handoff/claude-transfer-2026-11-04/CLAUDE_HANDOFF.md` và `docs/HAIKU_RESEARCH_CLOSEOUT_PLAN.md`. Làm **chỉ nhiệm vụ R0**, sau đó báo cáo theo mẫu mục 5 và chờ tôi cho phép làm nhiệm vụ tiếp theo. Tuyệt đối không reset/clean/ghi đè thay đổi chưa commit, không chạy toàn bộ test suite, không gọi model trả phí, không ghi vào dữ liệu thật, không merge. Giao tiếp bằng tiếng Việt, ngắn gọn, nói rõ thứ gì chưa kiểm chứng.

## 7. Cổng duyệt tự động (chủ dự án đồng ý ngày 2026-11-04)

Mục tiêu: chủ dự án không phải chép tin nhắn qua lại giữa phiên Haiku và planner. Phiên Haiku tự gọi một **trợ lý duyệt** chạy model Opus tại các cổng dưới đây, rồi tự sửa và đi tiếp. Chủ dự án chỉ tham gia ở các điểm bắt buộc dừng.

### Khi nào gọi trợ lý duyệt (chỉ các cổng này, không gọi sau mỗi việc nhỏ)
1. Trước khi code R6-A và R4-B: duyệt bản thiết kế (bảng/cột mới, API, màn hình, test).
2. Trước khi đưa bất cứ thứ gì cho chủ dự án bấm thử hoặc đọc (ví dụ checklist R2 bản mới).
3. Khi xong một nhiệm vụ có sửa code (R1, R3, R6-A, R4-B, R6-B, sửa launcher): duyệt phần thay đổi trước khi ghi `DEV_DONE` trên board.

### Cách gọi
- Dùng công cụ tạo agent/subagent của phiên, `model: opus`, **phiên mới** (không fork, không kèm lịch sử hội thoại), chạy ở chế độ chờ kết quả.
- Trợ lý **chỉ đọc**: không sửa file, không chạy test, không gọi Codex hay model khác, không chạy app.
- Chỉ đưa đúng các file cần: **`docs/PLANNER_CONTEXT.md` (luôn đọc đầu tiên)**, file này, `AGENTS.md`, mục liên quan trong `docs/RECOVERY_BOARD.md`, và các file vừa viết hoặc `git diff` của đúng các file vừa sửa. Không bảo nó đọc cả repo.
- Lời gọi mẫu:

> Bạn là planner duyệt cho dự án PO Intelligence Hub (chủ dự án là PO, không biết code). Chỉ đọc, không sửa gì. Đọc trước tiên `docs/PLANNER_CONTEXT.md` để nắm mục tiêu tổng, rồi đọc: `docs/HAIKU_RESEARCH_CLOSEOUT_PLAN.md` (mục <R-n>), `AGENTS.md`, mục <…> của `docs/RECOVERY_BOARD.md`, và <danh sách file / diff>. Đối chiếu với tiêu chí của nhiệm vụ, quy tắc an toàn dữ liệu, không bịa số liệu, và mức thao tác thủ công của chủ dự án (càng ít càng tốt). Trả lời đúng mẫu:
> KẾT LUẬN: DUYỆT | CẦN SỬA | DỪNG HỎI CHỦ DỰ ÁN
> LÝ DO: tối đa 5 gạch đầu dòng, mỗi dòng chỉ rõ file/mục và cần sửa gì.
> CẦN CHỦ DỰ ÁN QUYẾT: (nếu có) một câu hỏi ngắn.
> Không viết lại code; nếu không đủ thông tin để kết luận thì chọn DỪNG HỎI CHỦ DỰ ÁN.

### Trợ lý duyệt không phải nơi brainstorm
- Trợ lý duyệt chỉ chấm cổng: đạt hay chưa đạt so với kế hoạch đã chốt. Nó không đề xuất hướng mới.
- Khi một quyết định cần bàn kỹ (nhiều hướng, đánh đổi lớn, chạm mục tiêu tổng), Haiku **dừng** và nhắn chủ dự án: "Cần brainstorm: <chủ đề>, mở phiên planner." Chủ dự án mở phiên planner (Opus, trỏ vào thư mục dự án, bắt đầu bằng việc đọc `docs/PLANNER_CONTEXT.md`) để bàn.
- Mỗi kết luận brainstorm được planner ghi vào mục 5 (Nhật ký quyết định) của `docs/PLANNER_CONTEXT.md` và, nếu đổi nhiệm vụ, vào file này. Lần duyệt sau sẽ tự đọc được.

### Giới hạn để không đốt quota
- Mỗi cổng **tối đa 2 vòng duyệt**. Lần thứ hai vẫn `CẦN SỬA` thì dừng và báo chủ dự án, không gọi vòng thứ ba.
- Không có phiên nào chạy ngầm hay hỏi đi hỏi lại theo giờ. Quota chỉ tốn khi một bên thực sự làm một lượt.
- Ghi mỗi lần duyệt vào board dưới đúng nhiệm vụ: ngày, cổng, vòng, kết luận, lý do tóm tắt.

### Bắt buộc dừng và hỏi chủ dự án (trợ lý duyệt không được thay chủ dự án ở các điểm này)
- Tiêu thêm quota model thật (R4-A chỉ được 1 lượt đã duyệt; R6-B tự chạy cần chủ dự án bật).
- Quyết định sản phẩm, đổi luồng hay đổi bố cục.
- Nghiệm thu bằng mắt (chủ dự án chấm Được / Chưa được).
- Rủi ro dữ liệu thật, migration lên dữ liệu thật, merge, push lên nhánh chính, release.
- Trợ lý trả `DỪNG HỎI CHỦ DỰ ÁN`, hoặc hết 2 vòng.

Khi dừng, gửi chủ dự án **một tin ngắn**: đang ở đâu, cần quyết gì, các lựa chọn. Không gửi báo cáo kỹ thuật dài.

## 8. Chỉ đạo bổ sung ngày 2026-11-04 tối (sau phản hồi R2 của chủ dự án)

Checklist R2 bản đầu bắt chủ dự án làm quá nhiều bước thủ công. Làm theo thứ tự:
1. **Tự sao lưu trong launcher** (chủ dự án đồng ý sửa launcher): trong `run-local.ps1`, ngay trước `alembic upgrade head`, sao lưu database thật bằng Python `sqlite3` `Connection.backup()` (an toàn khi có WAL) vào `<APP_DATA_ROOT>\..\data-backups\<yyyyMMdd-HHmmss>\po_intelligence_hub.sqlite3`, chạy `PRAGMA integrity_check` trên bản sao, in đường dẫn, chỉ giữ 5 bản mới nhất. Sao lưu lỗi thì dừng, không migrate. Không đổi hành vi khác của launcher. Có test theo kiểu test launcher hiện có. Không chạy launcher lên dữ liệu thật.
2. **R4-A đã được duyệt**: làm đúng mục R4-A, 1 lượt, không thử lại, trên QA cô lập.
3. **Haiku tự chạy thử 9 mục** trên bản sao dữ liệu thật (sao bằng `backup()` vào `.bangiao/qa/r2-owner-copy/`, cổng 154xx). Kiểm tra (chỉ đọc) báo cáo Puzzle 2026 đã có trong dữ liệu thật chưa; chưa có thì nhập vào bản sao, không bắt chủ dự án dán lại. Ghi mục nào máy đã kiểm và kết quả. Không có trình duyệt thì ghi `NOT VERIFIED`.
4. **Checklist cho chủ dự án tối đa 4 mục** cần mắt người. Mỗi mục: một đường dẫn mở thẳng (đã có `projectId`), một câu "nhìn gì", hai lựa chọn **Được / Chưa được vì…**. Bước chuẩn bị chỉ còn: bấm đúp `run.bat`, gõ `Y` nếu được hỏi. Phần kỹ thuật (sao lưu, khôi phục, R5) để ở mục "Dành cho kỹ thuật" cuối file.
5. Mục 1 và mục 4 phải qua cổng duyệt tự động (mục 7) trước khi đưa chủ dự án.
