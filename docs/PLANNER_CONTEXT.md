# Ngữ cảnh planner: PO Intelligence Hub

Đọc file này **trước mọi việc lập kế hoạch hoặc duyệt**. File giữ mục tiêu tổng và các quyết định đã chốt, để agent nào cũng hiểu cùng một bức tranh dù bắt đầu từ phiên mới. Cập nhật lần cuối: 2026-11-05.

## 1. Mục tiêu tổng (lời chủ dự án, tóm tắt)

Một công cụ **không cần biết code** giúp PO mobile game/app tự động hoá và phân tích chuyên sâu, thay cho hàng giờ tự research, dựng funnel, xem retention, theo dõi biến động, xem từng phiên người dùng, đọc từng review. Tham khảo: GA4, Amplitude, Sensor Tower, AppMagic.

Ba trục phân tích:
1. **Thị trường và đối thủ**: research dữ liệu thật, hoặc phân tích CSV từ Sensor Tower/AppMagic.
2. **Sức khoẻ app đang vận hành**: AdMob, Firebase/GA4: doanh thu, DAU, retention, funnel, biến động.
3. **Các nhóm tính năng theo bảng tham chiếu của chủ dự án**: Product analytics (funnel, cohort, retention), Session replay & UX, A/B test & feature flag, Paywall & subscription, Feedback & review, LiveOps.

Câu hỏi PO cần trả lời thường xuyên: nên làm thể loại nào, thể loại phụ, benchmark đối thủ, kiếm tiền thế nào, phong cách đồ hoạ, core loop, cơ chế game, game có đang tăng hoặc scale tốt không, có đang thành xu hướng không.

Mỗi lượt phân tích phải có: **5 điểm nổi bật, Key insights, Gợi ý next action**, kèm ví dụ và số liệu có nguồn.

Cảnh báo thay đổi đến từ hai nơi: chỉ số sản phẩm biến động bất thường, và research thay đổi (thứ hạng, đánh giá, insight). Research được cập nhật theo lịch hàng tuần hoặc hàng tháng, hoặc chọn một danh sách báo cáo rồi bấm cập nhật và lưu thay đổi.

## 2. Nguyên tắc không đổi

- **Không bịa số liệu.** Không điền GEO, kỳ, nền tảng bằng suy đoán. Số ước tính (Sensor Tower, AppMagic) luôn ghi là ước tính.
- Tách rõ phép tính có nguồn khỏi diễn giải của AI. Không gọi một quy tắc viết sẵn là "AI insight".
- **Chủ dự án là PO, không biết code.** Càng ít bước thủ công càng tốt, không bắt làm việc máy làm được. Dùng tiếng Việt, dễ đọc, dùng được trên điện thoại, có chế độ tối.
- An toàn dữ liệu: không reset hoặc xoá dữ liệu thật, sao lưu trước khi migrate, thử nghiệm trên bản sao. Không merge hoặc release khi chưa được duyệt.
- Tiết kiệm quota: làm theo module, test theo file, gọi model thật chỉ khi được cho phép.

## 3. Bản đồ tài liệu (đọc cái nào cho việc gì)

| File | Là gì | Dùng để |
|---|---|---|
| `docs/PLANNER_CONTEXT.md` | File này | Mục tiêu tổng, quyết định, câu hỏi mở |
| `docs/RECOVERY_BOARD.md` | Nguồn sự thật về tiến độ | Trạng thái từng nhiệm vụ G1–G4 |
| `docs/HAIKU_RESEARCH_CLOSEOUT_PLAN.md` | Kế hoạch đang thực hiện | Nhiệm vụ R0–R6, cổng duyệt |
| `docs/so-do-thanh-phan.html` | Sơ đồ **tầm nhìn ban đầu** (vẽ trước khi biết đã có v2.0) | Hiểu đích đến: các màn hình, luồng dữ liệu, chỗ khó. **Không phải bản thiết kế kỹ thuật**: kiến trúc thật là v2.0 hiện có (FastAPI, SQLite, Alembic, React) |
| `docs/demo-mo-phong.html` | Demo trình bày bằng số mô phỏng | Ý tưởng cách hiển thị 5 điểm nổi bật, cảnh báo, bảng đối thủ |
| `AGENTS.md` | Quy tắc làm việc trong repo | Cách làm, cổng nghiệm thu |
| `handoff/claude-transfer-2026-11-04/CLAUDE_HANDOFF.md` | Bàn giao từ Codex | Hiện trạng lúc chuyển sang Claude |

## 4. Hiện trạng và khoảng cách với mục tiêu

- Dự án **tiếp tục trên v2.0**, không viết lại.
- Đã có: research (nhập báo cáo, đọc, quyết định PO, so sánh hai báo cáo, theo dõi), phân tích CSV một file và hai kỳ, Codex research tuỳ chọn, Product Analysis bản đầu (G3-06).
- Đang làm: chốt Research (R0–R6), rồi tới Product Analysis.
- **Chưa có trong backlog** dù nằm trong mục tiêu: dữ liệu Firebase/GA4 (funnel, cohort, retention), phiên người dùng, A/B test, paywall, gom review, LiveOps, cảnh báo chỉ số sản phẩm tự động. Agent duyệt **không tự thêm** các mục này vào phạm vi. Chỉ ghi chú nếu một quyết định hiện tại sẽ chặn chúng về sau.

## 5. Nhật ký quyết định

| Ngày | Quyết định |
|---|---|
| 2026-11-04 | Tiếp tục v2.0, không viết lại. Ưu tiên chốt Research trước. |
| 2026-11-04 | Claude (Opus) làm planner, phiên Haiku 5.5 medium làm người thực hiện. |
| 2026-11-04 | R4: đo 1 lượt Codex thật (R4-A) rồi làm research chạy nền (R4-B). Bộ máy research cắm được; bỏ Codex vẫn còn ChatGPT dán một lần. |
| 2026-11-04 | R6: nhắc cập nhật theo lịch và chọn nhiều Project (R6-A) trước, tự chạy khi đến hạn (R6-B) sau, tối đa 3 phiếu/ngày (đã xác nhận 2026-11-05). |
| 2026-11-04 | Giảm việc thủ công: `run.bat` tự sao lưu trước khi migrate, Haiku tự chạy thử trước, checklist cho chủ dự án tối đa 4 mục. |
| 2026-11-04 | Cổng duyệt tự động: Haiku gọi trợ lý Opus chỉ đọc ở các cổng, tối đa 2 vòng. |
| 2026-11-05 | Trợ lý duyệt chỉ chấm cổng. Brainstorm diễn ra ở phiên planner riêng, và kết quả được ghi vào file này. |
| 2026-11-05 | Chủ dự án chọn: màn so sánh hai kỳ CSV là **trang riêng** (bỏ tab "So sánh hai kỳ" trong Phân tích CSV). Chưa làm, chờ thiết kế. |
| 2026-11-05 | Chủ dự án chọn: metric chính cho insight top 10 game là **lượt tải**. Doanh thu và tăng trưởng là lớp phụ. |
| 2026-11-05 | Quy tắc làm việc: mỗi nhiệm vụ một phiên riêng, xong thì dừng. Câu có lựa chọn sẵn hỏi trực tiếp. Câu cần bàn kỹ ghi vào mục 6 này. |
| 2026-11-05 | Chủ dự án chọn: giữ bố cục và bảng màu Peachy Studio, chỉ tăng cỡ chữ và độ tương phản tối. Không dùng bảng kem/navy/jade. |
| 2026-11-05 | Chủ dự án chọn: sau Research và Product Analysis, làm **cảnh báo chỉ số** trước. Lưu ý: mục này nằm ở phần cảnh báo của mục 1, không thuộc danh sách 1.3; cảnh báo chỉ số sản phẩm cần có nguồn dữ liệu sản phẩm trước. Thứ tự các nhóm trong 1.3 vẫn chưa chốt. |
| 2026-11-05 | Chủ dự án chọn: dữ liệu Firebase/GA4 lấy bằng **xuất file**, không kết nối BigQuery. Giới hạn của cách này cần được kiểm tra khi thiết kế funnel và cohort. |
| 2026-11-05 | Chủ dự án xác nhận: giới hạn tự chạy R6-B là tối đa 3 phiếu/ngày. |
| 2026-11-05 | Chủ dự án duyệt: insight top 10 làm **hai lớp**, lớp tính từ CSV làm trước, lớp nghiên cứu thêm chạy khi bấm. Chi tiết ở mục 7. |
| 2026-11-05 | Chủ dự án xác nhận: tệp "rutgon - Copy" là bản sửa tay để thử, và hiện không xuất được tệp kỳ thật khác. Vì vậy so sánh hai kỳ chỉ xem được bằng cặp tệp DEMO, chưa nghiệm thu G3-07 trên dữ liệu thật. |
| 2026-11-05 | Chủ dự án duyệt luồng CSV một đường, gồm bước xác nhận kỳ và GEO từ tên tệp bằng một lần bấm. Chưa làm. |
| 2026-11-05 | Chủ dự án duyệt: xác nhận của PO đủ điều kiện để tính chênh lệch cho tệp không có cột GEO, kỳ, phương pháp hoặc đơn vị, và kết quả luôn gắn nhãn rõ nguồn xác nhận. Chưa làm. Hai kỳ lệch độ dài vẫn bị từ chối cho tới khi có quyết định riêng. |
| 2026-11-05 | Chủ dự án chọn: giữ nhãn "Game mới" trên trang một tệp dù kỳ chưa được xác nhận, dựa vào ngày phát hành so với mốc trong CSV. Game có ngày phát hành không khớp vẫn ghi "Cần kiểm tra". |
| 2026-11-05 | Chủ dự án duyệt nghiên cứu bắt đầu từ CSV (mục 8), với góc nhìn là bộ lọc và giữ cách trình bày ô nổi bật. Lượt tải chỉ còn là giá trị mặc định của bộ lọc. |
| 2026-11-05 | Chủ dự án chọn: nghiên cứu Codex từ CSV chỉ lấy top 5 của bộ lọc đang chọn, trong một lượt. Chưa làm chạy nền (R4-B). |
| 2026-11-05 | Quy tắc: mọi phiên thực hiện phải đặt rõ model Haiku 5.5, effort medium, không để kế thừa Opus của planner. |

## 6. Câu hỏi mở (chờ chủ dự án)

- **[2026-11-05, từ phiên Haiku R-CSV-UX] Phạm vi insight cho top 10 game (đã chốt hướng hai lớp, xem mục 7; giữ lại làm yêu cầu gốc).** Chủ dự án yêu cầu tối thiểu: (a) đánh giá top 10 trong danh sách; (b) nói rõ thay đổi giữa các kỳ khi là so sánh; (c) điều đáng chú ý trong danh sách; (d) insight gameplay/cơ chế của top 10 từ nguồn internet, có nguồn; (e) nhận định sub-genre đang dẫn đầu từ dữ liệu. Ràng buộc dữ liệu hiện có: file Sensor Tower chỉ có một ngày (14/09), không có GEO, nền tảng ghi chung "Unified", 25 sản phẩm, chỉ khoảng 9 sản phẩm có số tăng trưởng năm trước, một số ô % lỗi định dạng. Cần thiết kế: đầu vào, xử lý, màn hình, giới hạn, và cách ghi nhãn phân biệt số có nguồn với nhận định AI. Metric chính sẽ do chủ dự án chọn (xem câu hỏi có lựa chọn đã hỏi trực tiếp).
- **[2026-11-05, từ phiên Haiku R-CSV-UX] Thiết kế lại luồng CSV (cần brainstorm).** Phản hồi chủ dự án ngày 2026-11-04 (`docs/UX_REVIEW_CSV_20261104.md`): cảnh báo bị ẩn trong khối thu gọn; trang Phân tích CSV chưa có insight; nút "Phân tích cặp tệp này" có trạng thái xoay mãi; nhiều thuật ngữ kỹ thuật trước khi có kết quả. Cần thiết kế luồng một đường, cảnh báo lên đầu, và trạng thái rõ khi xử lý. Chưa đề xuất màn hình cụ thể.
- **[2026-11-05, từ phiên Haiku R-CSV-UX] Trạng thái "Kiểm tra lại dữ liệu" trên dữ liệu thật.** Hai tệp Sensor Tower đã nhập (16:24 và 16:34, 2026-11-04) vẫn lưu câu cảnh báo tiếng Anh. Nhập lại tệp không đổi được vì hệ thống trả tệp cũ khi trùng nội dung. Chủ dự án cần bấm "Kiểm tra lại dữ liệu" trong màn Khám phá dữ liệu CSV. Chưa xác nhận đã làm. Lưu ý: nếu tệp đã có "kiểm tra metadata" được lưu, nút có thể không cập nhật lại (đã kiểm trong mã nguồn `reports.py`, `workspace_data.py`).
  - Cập nhật 2026-11-05 (đọc cơ sở dữ liệu, chỉ đọc): hai tệp này chưa có mục kiểm tra metadata nào, nên nút sẽ cập nhật được. Lỗi còn lại trong mã nguồn: với tệp đã có mục kiểm tra, nút không đổi gì nhưng vẫn báo "Đã kiểm tra lại từ CSV gốc".
- **[2026-11-05, phiên planner] Phát hiện về hai tệp Sensor Tower, cần chủ dự án xác nhận.**
  - Tệp thứ hai ("rutgon - Copy", ghi kỳ Oct 14 – Nov 13, 2026) có kỳ kết thúc sau ngày hiện tại. So với tệp đầu trên đủ 25 sản phẩm: lượt tải, doanh thu và DAU không đổi ở sản phẩm nào; cột ngày đổi sang 14/10; 8 ô tăng trưởng lượt tải bị đổi và lớn hơn cả lượt tải. Trông như bản sửa tay để thử, **chưa xác nhận**. Nếu đúng, chưa có cặp kỳ thật để nghiệm thu so sánh (G3-07).
  - Tên tệp có ghi kỳ và "Worldwide", dù trong dòng dữ liệu không có cột GEO.
  - Ô % lượt tải bị mất vị trí dấu thập phân, nên không đọc trực tiếp được: `3.070.038` là 3,07 lần, nhưng `1.296.217.657` là 1.296,2 lần và `705.968` là 7,06 lần. Chữ số đúng cả 9/9 ô của tệp đầu khi tính lại bằng tăng trưởng / (lượt tải − tăng trưởng). Quy tắc: tính lại từ hai cột này, chỉ dùng ô % để đối chiếu chữ số. Chỉ mới kiểm với lượt tải, chưa kiểm doanh thu và DAU.
  - 16/25 sản phẩm không có % lượt tải, cả 16 có tăng trưởng bằng đúng lượt tải, nghĩa là năm trước bằng 0. 15 game phát hành sau kỳ cùng năm trước (sau 13/10/2025), nên là game mới. Riêng Pocket Sort phát hành 05/09/2025 thì chưa giải thích được. Cảnh báo đã lưu đếm 17 ghi chú, chưa đối chiếu vì sao lệch với con số 16.
  - Cột Category chỉ ghi "Games", không có sub-genre. Nhận định sub-genre vì vậy phải dựa trên phân loại của AI, không thể tính trực tiếp từ CSV.
- **[2026-11-05, phiên planner] Hệ quả của hai quyết định vừa chốt.** Lấy dữ liệu Firebase/GA4 bằng xuất file nghĩa là cảnh báo chỉ số sản phẩm chỉ chạy khi có tệp mới được nhập, không tự động thật sự. Cảnh báo thay đổi research không bị ảnh hưởng. Cần kiểm tra bằng tệp xuất thật xem funnel và cohort có đủ dữ liệu không.
- **[2026-11-05, phiên planner] Tệp Sensor Tower thật có nguy cơ không đi hết luồng so sánh (cần chủ dự án quyết định).** Phát hiện khi chạy thử cặp DEMO, xem `docs/demo-data/README.md`.
  - Tệp thật không có cột đơn vị, GEO, kỳ và phương pháp. Quy tắc hiện tại chỉ chấp nhận các thông tin này khi lấy từ cột CSV hoặc tài liệu nhà cung cấp, nếu không thì mọi dòng ở trạng thái "cần xem lại" và không tính chênh lệch. Khi thử định dạng các chỉ số nằm trên cùng một dòng như tệp thật, dù đã thêm cột GEO, kỳ và phương pháp, chỉ riêng việc đơn vị không có cột đã làm cả 27 dòng "cần xem lại". Nhiều khả năng bước xác nhận một lần bấm đã duyệt sẽ không đủ nếu giữ nguyên quy tắc này. Chưa thử đường xác nhận trong màn "Xem lại thông tin tệp" với căn cứ tài liệu nhà cung cấp.
  - Hai kỳ dài lệch nhau bị từ chối: 14/09 – 13/10 có 30 ngày, 14/10 – 13/11 có 31 ngày. Xuất theo tháng từ Sensor Tower sẽ thường gặp trường hợp này.
  - Đã duyệt 2026-11-05: xác nhận của PO đủ để tính chênh lệch, luôn gắn nhãn nguồn xác nhận trên kết quả. Tên tệp chỉ cho biết kỳ và GEO; đơn vị tiền tệ và phương pháp không có trong tên tệp nên PO phải xác nhận riêng, không tự điền.
  - Còn chờ quyết định: hai kỳ lệch độ dài. Đề xuất của planner là vẫn hiện số gốc kèm cảnh báo, không tự quy đổi.
- **[2026-11-05, phiên planner] Khoảng trống của màn so sánh, thấy khi chạy DEMO.** Bảng sắp xếp mặc định theo giá trị kỳ hiện tại, danh sách sắp xếp không có lựa chọn "thay đổi nhiều nhất", và chưa có kết luận. Câu tóm tắt liệt kê "2 chỉ có ở kỳ trước, 2 chỉ có ở kỳ hiện tại, 4 thiếu dữ liệu" nên dễ đọc thành 8 dòng dù cả ba cụm cùng nói về 4 dòng: chưa kiểm trong mã nguồn. Nên xử lý cùng lớp 1 cho cặp kỳ.
- **[2026-11-05, phản hồi chủ dự án sau khi xem màn hình] Trang Phân tích CSV quá rối, thông tin không vào mắt ngay. Trạng thái: REWORK.** Thứ tự "xác nhận trước kết quả" do planner đề xuất là sai: nó chặn đầu trang bằng một biểu mẫu, trong khi xem một tệp không cần xác nhận gì. Đề xuất sắp xếp lại, chờ chủ dự án khởi động: kết quả trước; xác nhận chỉ hiện khi so sánh hai kỳ và chỉ hỏi phần máy không tự biết (tiền tệ, phương pháp); đơn vị lượt tải, người dùng, % lấy từ tên cột; nhà phát hành và ngày phát hành tự đọc từ CSV đã lưu, không bắt bấm "Kiểm tra lại dữ liệu"; thuật ngữ kỹ thuật chuyển vào phần chi tiết.
  - Ảnh chủ dự án gửi là tệp test nhập 27/10 trong dự án "tao đang test", có 2 ngày trong cùng tệp; không phải tệp 16:24 của dự án Puzzle.
  - Nội dung trang này là phép tính và câu mẫu viết sẵn trong code, chạy trên CSV. Không gọi AI, không tra internet. Lớp 2 chưa làm.
- **[2026-11-05, phiên planner] Thiết kế lại luồng CSV: đã duyệt, đang làm lại theo phản hồi ngay trên.** Một đường: nhập tệp → xác nhận kỳ và GEO từ tên tệp bằng một lần bấm → kết quả (cảnh báo đã gom nhóm ở đầu, insight, bảng) → trang so sánh riêng. Sửa kèm: nút "Phân tích cặp tệp này" có giới hạn thời gian chờ và báo lỗi rõ; nút "Kiểm tra lại dữ liệu" không báo thành công khi không đổi gì.

## 7. Thiết kế insight top 10 (hướng đã duyệt 2026-11-05)

Chủ dự án đã duyệt hướng hai lớp. Danh sách nội dung bên dưới là đề xuất của planner, nghiệm thu trên màn hình thật.

**Đầu vào:** một tệp CSV Sensor Tower đã nhập. Lớp 2 thêm nguồn internet.

**Lớp 1: tính từ CSV, tự động, không gọi AI, không tốn quota**
- Top 10 theo lượt tải, kèm doanh thu và DAU làm lớp phụ.
- Số game trong top 10 không có lượt tải năm trước. Trên tệp 14/09: 5/10.
- Tăng trưởng tính lại từ cột gốc theo quy tắc ở mục 6.
- Nhà phát hành xuất hiện nhiều lần. Trên tệp 14/09: Learnings 2, Grand Games 2.
- Khoảng cách lớn giữa lượt tải và doanh thu. Ví dụ tệp 14/09: Arrows GO! có 9,36 triệu lượt tải, DAU 5,56 triệu, doanh thu 0.
- Khi có cặp kỳ hợp lệ: thay đổi thứ hạng và số liệu giữa hai kỳ.
- Nhãn: "Tính từ CSV", kèm kỳ, GEO, nền tảng và chữ "ước tính". GEO và kỳ chỉ dùng sau khi chủ dự án xác nhận.

**Lớp 2: nghiên cứu thêm, chạy khi chủ dự án bấm, tốn quota**
- Gameplay và cơ chế của từng game, kèm link nguồn.
- Phân loại sub-genre từng game, rồi cộng lượt tải theo nhóm: phép cộng là số tính, còn việc phân loại là nhận định AI.
- Lưu theo từng game để lần sau không tốn lại.
- Nhãn: "Nhận định AI". Game không có nguồn thì ghi "chưa tìm được nguồn", không tự điền.

**Màn hình:** mục 5 điểm nổi bật và Key insights lấy số từ lớp 1; Gợi ý next action ghi rõ là đề xuất của AI. Đặt trên trang Phân tích CSV, trên bảng dữ liệu.

**Giới hạn phải nói rõ trên màn hình**
- Chỉ đúng trong danh sách đã nhập, không đại diện cho cả thị trường.
- Doanh thu 0 không chứng minh game không kiếm tiền. Số doanh thu của Sensor Tower có thể không gồm quảng cáo: **chưa xác minh**, cần kiểm trước khi viết câu nhận định về kiếm tiền.
- Lớp 1 không kết luận game mới nếu ngày phát hành không khớp, như Pocket Sort.
- Tệp có kỳ kết thúc sau ngày hiện tại, hoặc có tăng trưởng lớn hơn số tuyệt đối, phải bị cảnh báo trước khi dùng.

**Nghiệm thu:** chạy trên tệp 25 sản phẩm thật, chụp màn hình thật ở 1440px và 390px. So sánh hai kỳ chỉ nghiệm thu được khi có cặp kỳ thật.

## 8. Nghiên cứu bắt đầu từ CSV (đã duyệt 2026-11-05; chạy được trên bản sao, chưa commit, chưa nghiệm thu chính thức)

**Phản hồi của chủ dự án:** CSV chưa có insight từ Codex; không phải lúc nào cũng chỉ đánh giá theo lượt tải, có thể theo doanh thu, tăng trưởng hoặc kết hợp; chưa có gợi ý action cho PO; nghiên cứu phải bắt đầu được từ chủ đề và CSV, không bắt buộc qua nghiên cứu tổng quan ChatGPT, và kết quả phải đổ ra tổng quan dự án.

**Hiện trạng đã đọc trong mã nguồn**
- Luồng CSV → Codex có sẵn: `runCodexResearchFromCsv` và `saveCodexResearchFromCsv` trong `frontend/src/research/DataFirstWorkspace.tsx`. Kết quả lưu thành báo cáo, và Project Home lấy báo cáo mới nhất để hiện "Kết quả mới nhất". Toàn bộ luồng này chưa được chứng minh chạy thật trên CSV: test dùng kết quả giả, lượt đo R4-A là một lượt Codex trên dữ liệu QA.
- Nút chạy chỉ hiện sau khi tick sản phẩm trong bảng số liệu gốc. Đợt làm lại trang đã đẩy bảng này vào "Chi tiết kỹ thuật", nên PO gần như không thấy.
- Câu hỏi nghiên cứu là câu viết sẵn theo tên dự án. Form tạo dự án không có ô chủ đề, và nút chính của Project Home dẫn sang chuẩn bị nghiên cứu bằng ChatGPT.

**Đề xuất**
- **Bắt đầu:** tạo dự án có ô chủ đề; sau đó chọn "Nhập CSV" hoặc "Nghiên cứu tổng quan", hai đường ngang nhau.
- **Bộ lọc góc nhìn trên trang CSV (chủ dự án chọn bộ lọc, không dùng tab):** Lượt tải (mặc định), Doanh thu, Tăng trưởng, Kết hợp. Giữ nguyên cách trình bày các ô nổi bật hiện tại; số liệu trong ô và top 10 đổi theo bộ lọc. "Kết hợp" hiện ba danh sách và game xuất hiện ở nhiều danh sách, không tạo điểm tổng hợp tự nghĩ.
- **Nghiên cứu Codex:** một nút ngay dưới top 10, tự lấy top 10 của góc nhìn đang chọn, ghi rõ tốn quota, chỉ chạy khi bấm.
- **Kết quả:** gameplay, cơ chế, sub-genre, kiếm tiền, kèm nguồn, ghi là nhận định AI; gợi ý action cho PO lấy từ kết quả này, có metric và bằng chứng; PO lưu action thành "Quyết định PO"; báo cáo đổ ra tổng quan dự án.

**Giới hạn phải nói rõ**
- Tệp hiện tại là "Top Apps Downloads": top 10 doanh thu chỉ là top trong 25 game của tệp, không phải top doanh thu thị trường.
- Góc nhìn Tăng trưởng thiếu dữ liệu: 16/25 game không có năm trước, nên chỉ xếp % được cho 9 game; game mới hiện riêng, không trộn vào.
- Doanh thu chưa có đơn vị tiền tệ cho tới khi PO xác nhận.
- Gợi ý action chỉ đến từ nghiên cứu Codex. Không viết sẵn câu action bằng quy tắc rồi gọi là AI.
- Lượt đo R4-A mất 66,66 giây nhưng đó không phải nghiên cứu 10 game. Backend giới hạn mỗi lượt Codex 240 giây (`RESEARCH_TIMEOUT_SECONDS`), frontend chờ 270 giây.
- **Kết quả đo 2026-11-05:** lượt Codex thật với top 10 hết giờ ở 240 giây (HTTP 504, mã `32f3d696c79e`), không có báo cáo. Theo kế hoạch R4-A, hết giờ là điều kiện để làm R4-B. Trạng thái: NEEDS FIX; chưa có nút lưu action thành Quyết định PO.
- **Quyết định 2026-11-05:** chủ dự án chọn giảm nghiên cứu Codex còn top 5 của bộ lọc đang chọn, vẫn chạy trong một lượt. Không làm chạy nền (R4-B) lúc này. Nếu 5 game vẫn hết giờ thì dừng và hỏi lại, không tự chạy lại.
- **Kết quả đo top 5, 2026-11-05 (báo cáo của phiên thực hiện, trên bản sao):** khoảng 189 giây, báo cáo hợp lệ, lưu được và hiện ở Project Home. Trạng thái NEEDS FIX: link Color Block hỏng; action "so downloads theo sub-genre" không có bằng chứng; Loop Sort hiện +263.870,1% do năm trước rất nhỏ; trang vẫn báo "0 đủ điều kiện phân tích tự động" chưa rõ nguyên nhân. 189 giây sát giới hạn 240 giây, nên top 5 có thể vẫn hết giờ ở lần chạy khác.
- **Đã sửa không tốn quota (báo cáo của phiên thực hiện):** nhãn "Link hỏng", action không có nguồn không lưu được, cảnh báo % từ nền nhỏ (tăng từ 1.000%), giải thích dòng "0 đủ điều kiện". Giới hạn: "Link hỏng" của Color Block là kết quả kiểm tay ghi trong `reports/sourceStatus.ts`; báo cáo mới chưa được kiểm link.
- **Planner đọc báo cáo top 5 trên bản sao, 2026-11-05: chất lượng chưa đạt, PRODUCT NEEDS FIX.** Luồng chạy được nhưng báo cáo chưa giúp ra quyết định: 3/4 phát hiện nói về việc chuẩn hóa dữ liệu; gợi ý chính là "chuẩn hóa taxonomy" và "bổ sung đơn vị tiền tệ"; không có cơ hội hay thử nghiệm sản phẩm; không có 5 điểm nổi bật; nguồn chỉ là trang Google Play; không khai thác phát hiện có sẵn trong CSV (game mới, khoảng cách tải và doanh thu). Nhãn "Nghiên cứu ChatGPT" sai vì báo cáo tạo bằng Codex.
- **Nguyên nhân khả dĩ, chưa kiểm chứng:** yêu cầu gửi Codex tập trung vào giới hạn và cấm đoán, không đòi cơ hội và thử nghiệm; chạy với `reasoning_effort="low"` và giới hạn 240 giây.
- **Đề xuất của planner, chờ duyệt:** viết lại yêu cầu gửi Codex. Mỗi game: core loop, điểm hút, kiếm tiền, điều đáng học. Toàn nhóm: 5 điểm nổi bật, key insights, tối đa 3 cơ hội và 3 thử nghiệm có metric, bằng chứng, tác động; ghi rõ giả thuyết; đưa số đã tính ở lớp 1 vào làm đầu vào. Thử bằng một lượt Codex thật.
- **Kết quả 2026-11-05:** yêu cầu mới đã viết (`research/top5Prompt.ts`), nhưng lượt Codex thật hết giờ ở 240 giây (mã `ce3974b0838a`), không có báo cáo. Chất lượng yêu cầu mới **chưa được kiểm chứng**. Tổng cộng 3 lượt Codex thật gửi được: 1 thành công (189 giây), 2 hết giờ. Link Google Play của Royal Match cũng hỏng, đã đánh dấu tay.
- **Phản hồi chủ dự án sau khi thử ChatGPT, 2026-11-05. Trạng thái: REWORK.** (1) Sao chép xong không biết dán ở đâu, và không tự tìm được trang nhập báo cáo. (2) Thông tin có số phải viết số ra để nhìn trực quan; nội dung sơ sài, thiếu chắc chắn. (3) Insight chỉ trả về link store, thiếu chắc chắn.
- **Planner đọc báo cáo ChatGPT trên bản sao (`a5ba10dd`):** 11 phát hiện, không phát hiện nào có số liệu, 0 quan sát định lượng, độ tin cậy trống cả 11. Trong 7 phát hiện có nguồn, 6 chỉ có link store; toàn báo cáo 33/36 URL là store. Cơ hội và thử nghiệm chung chung, áp dụng được cho game nào cũng được.
- **Nguyên nhân tìm được trong yêu cầu của chính PO Hub (`research/top5Prompt.ts`):** "Số CSV chỉ đặt trong quantitative_observations" khiến số bị loại khỏi phát hiện; "trang store" được liệt kê là nguồn chấp nhận được. Yêu cầu không buộc nêu tên game và số trong từng insight.
- **Giới hạn phải nói thẳng:** nguồn công khai thường không có retention hay doanh thu theo game, nên nhiều insight vẫn sẽ là giả thuyết cần thử nghiệm. Việc cần làm là ghi rõ mức bằng chứng, không làm cho giả thuyết trông chắc chắn hơn.
- **Kết quả thử lại bằng ChatGPT, 2026-11-05 (báo cáo `23035976` trên bản sao):** chủ dự án nhận xét "tạm ổn", UI còn chưa đẹp nhưng để một vòng polish chung cho toàn dự án sau. Đây chưa phải nghiệm thu chính thức. Số đo của planner, so với `a5ba10dd`: phát hiện có số 7/14 (trước 0/11); có độ tin cậy 14/14 (trước 0/11); có nguồn ngoài store 6, chỉ store 1, không có link 7 (trước 1, 6, 4). "Ngoài store" chỉ dựa trên tên miền, chưa đọc nội dung link. Cơ hội và thử nghiệm mới có 2 mỗi loại.
- **Chưa chốt:** đường chạy chính. Hiện dán ChatGPT hoặc Claude chạy được; nút Codex có thể hết giờ (2/3 lượt đo). Chưa làm chạy nền.
- **Việc để sau:** vòng polish UI chung toàn dự án; khi làm phải có thiết kế tham chiếu Peachy Studio đã duyệt theo `AGENTS.md`.
- **Đề xuất cũ của planner:** tách hai câu hỏi. Trước hết kiểm chất lượng yêu cầu mới bằng cách dán vào ChatGPT rồi nhập báo cáo, không tốn quota Codex và không cần code mới. Sau đó mới chọn cách chạy: chạy nền từng game (R4-B), hoặc giữ ChatGPT dán một lần làm đường chính.

**Thay đổi quyết định cũ:** "metric chính là lượt tải" chuyển thành giá trị mặc định của bộ lọc.
