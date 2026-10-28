# PO Intelligence Hub V2 — Full Product Recovery Audit

**Ngày audit:** 2026-10-27  
**Branch:** `feat/ux-recovery-01-research-results`  
**HEAD local:** `15f64f03bc65964a285619944ed77280fb3895c5`  
**HEAD trên GitHub:** cùng SHA `15f64f03bc65964a285619944ed77280fb3895c5`  
**Master / origin/master:** `57b7167ae60729fd3221e283c7ff2433e22454a4`  
**Phạm vi:** audit sản phẩm và xác minh có giới hạn; không sửa code, không merge/push, không ghi vào SQLite sản xuất.

## 1. Tóm tắt điều hành

PO Hub đã có nền tảng local-first thực sự: Project, Research Plan/Run, nhập báo cáo ChatGPT, Research Results, evidence, Benchmark, shortlist/quyết định PO, nhập CSV và so sánh có điều kiện. Các đường dẫn này dùng chung dữ liệu SQLite; báo cáo có thể được nối vào Project bằng lựa chọn tường minh. Bản sao QA vượt `PRAGMA integrity_check` với `ok` ở schema `20261024_0009`.

Sản phẩm vẫn chưa khép kín chu trình **Research → Report → Decision → Tracking**. Trang Tracking hiện là trạng thái chờ, chưa có lịch sử/snapshot hay theo dõi hành động. Luồng quyết định cấp Project hiện dựa vào shortlist sản phẩm từ dữ liệu CSV; trong khi báo cáo có thể chứa finding hữu ích nhưng chưa có shortlist, trang PO Review báo không có candidate. Nút quyết định trong Report mở phần **Report notes (legacy)**, tách biệt với quyết định Project. Người dùng vì thế có thể hiểu rằng đã ghi quyết định sản phẩm dù dữ liệu nằm ở vùng lịch sử riêng.

Quantitative layer có nhiều xử lý an toàn: các URL và số liệu report hiển thị unverified, dữ liệu không tương thích không bị ép thành chart/growth. Tuy nhiên, report thật trong bản sao QA vẫn hiển thị vùng “Market Data & Charts” với danh sách observation dài dù không có chart tương thích; lý do readiness chi tiết và bước sửa tiếp theo chưa đủ rõ cho PO. Không có xác nhận độc lập cho các kết luận thị trường trong report.

**Kết luận:** chưa nên coi là sản phẩm đã sẵn sàng phát hành. Frontend hiện tại vượt toàn bộ suite và build; backend chỉ xác minh chắc chắn được bộ 15 test workspace. Các bài backend report/API bị treo trong môi trường audit và dừng thủ công, nên backend regression toàn phần là **NOT VERIFIED**. Browser UAT thực tế đã xem Reports, Report Detail, Insights, Benchmark, PO Review và Tracking. Ban đầu ảnh chưa được xuất thành file; đã khắc phục bằng cách chụp lại từ Chrome headless trên frontend/backend localhost dùng bản sao SQLite QA cô lập. Ảnh thật hiện nằm trong `.bangiao/screenshots/product-recovery-audit/` và được liệt kê ở Mục 6. Không dùng ảnh tạo sinh.

## 2. Trạng thái Git và bảo vệ dữ liệu

- Branch hiện tại và HEAD khớp branch remote; không có commit mới kể từ `15f64f0`.
- Branch hiện có **85 commits ahead, 0 behind** master; handoff trước đó ghi nhận khoảng **144 paths / 14,792 insertions** so với master. Đây là rủi ro tích hợp lớn, không phải bằng chứng từng commit đều lỗi.
- Working tree đã bẩn trước audit. Các file đã sửa và thư mục untracked được giữ nguyên, không stage/reset/commit:
  - Sửa: `frontend/src/reports/ReportResults.tsx`, `frontend/src/reports/ResearchIntake.test.tsx`, `frontend/src/reports/ResearchIntake.tsx`, `frontend/src/style.css`, `scripts/setup.ps1`, `tests/test_workspace_data_first.py`.
  - Untracked có trước audit: `.agents/`, `.devcrew/`, nhiều thư mục `.m*-test-*`/`.m*-qa-*`, `.ux-ia-01-uat/`, `frontend/.vitest-tmp/`, `frontend/frontend/`, `.bangiao/P0-PROJECT-REPORT-UNIFICATION.md` và các mục đã có khác.
  - Audit tạo thêm `.product-recovery-audit-uat/` để chứa bản SQLite tách biệt và thư mục ảnh yêu cầu. Không có sửa code hoặc thay đổi schema.
- SQLite sản xuất không bị mở để ghi. Bản sao QA được tạo từ SQLite hiện có; integrity check `ok`, Alembic revision `20261024_0009`.
- Bản sao QA trước thao tác thử có 8 Reports, 1 Project, 1 Plan, 1 Run, 2 CSV datasets, 0 Run Manifest và 0 Project-level `po_opportunity_decisions`. Trước thao tác QA cả 8 Report chưa có `project_id`; cả hai CSV gắn với cùng một report nhưng `project_id` là null. Sau khi thử UI, một Report được gắn vào Project rõ ràng trên bản sao QA, còn 7 report không gán. ID/report body không bị nhân bản.
- Hai CSV cùng tên có SHA khác nhau (`035ddb…3153d`, `f049c8…e5901e60`), độ dài 5,791 và 6,251 ký tự, cả hai được lưu với trạng thái `incompatible`. Cùng tên không chứng minh là bản trùng; không kết luận chúng là duplicate data.
- Không có `run_id` trong schema ImportedReport; chỉ có `project_id` nullable. Không tự gán report cho run vì ChatGPT user import không chứng minh được nguồn là một Research Run cụ thể.

## 3. Bản đồ chức năng

| Chức năng | Mục tiêu / lối vào | Thành phần chính | Tình trạng và bằng chứng audit | Khuyến nghị |
|---|---|---|---|---|
| Research Projects | `Research` → danh sách/mở Project | `ResearchWorkspace.tsx`, `api.ts`, `backend/app/api.py`, `models.py` | **PARTIAL** — Project đang chứa scope, workspace data, report links và quyết định; browser mở được Project hiện có. Chưa chạy tạo Project mới trong phiên UAT này. | KEEP; làm Project context nhất quán |
| Research Plans | Trong Project Research | `ResearchWorkspace.tsx`, `ResearchRunsWorkspace.tsx`, `backend/app/api.py` | **PARTIAL** — API tạo/version/list Plan tồn tại; bản QA có 1 Plan. Không kiểm thử chỉnh sửa đầy đủ trên browser trong audit. | KEEP; hiển thị lịch sử kế hoạch trong Project |
| Research Runs / manifests | `/research/runs`, route theo `runId` | `ResearchRunsWorkspace.tsx`, `SourcesWorkspace.tsx`, `backend/app/api.py`, manifest/models | **PARTIAL** — API/state machine và manifest immutable có test lịch sử; bản QA có 1 Run nhưng không có Manifest nên không thể kiểm chứng một manifest thực. | KEEP; phân biệt run local với report ChatGPT |
| ChatGPT Prompt / Report Intake | Project hoặc Home → nhập report; one-paste | `ResearchIntake.tsx`, `reports/api.ts`, `backend/app/reports.py`, `research_data.py`, `schemas.py` | **PARTIAL** — API/UI/test bao phủ Markdown/TXT/JSON và structured extraction; không thực hiện một lần nhập mới với response ChatGPT thật trong audit. ChatGPT bên ngoài không được tự gọi. | KEEP; giữ gốc, trình bày lỗi nghiệp vụ rõ |
| Reports Library | `Reports`, tìm kiếm, project filter, unassigned filter | `ResearchIntake.tsx`, `reports/api.ts`, `backend/app/reports.py` | **WORKING trong working tree** — Browser hiển thị 8 báo cáo, unassigned và project filter; liên kết một report chọn rõ Project, hiện notice, không tạo bản copy. Sau reload filter Project vẫn trả đúng report ID. Các sửa liên quan đang uncommitted. | KEEP; review và commit riêng trước khi đưa lên remote |
| Report Detail / original report | `/reports/{report_id}` | `ReportResults.tsx`, `MarkdownReport.tsx`, `research_data.py` | **PARTIAL** — Browser mở report cùng ID từ Project filter; summary, takeaways, findings, report tabs và Data Sources có thật; Full Report là nơi xem nguồn gốc. | KEEP; giảm phần dày chữ, tăng lối đọc nguồn |
| Findings, Insights, Evidence | Report → `Insights`, `Evidence`, `Full Report` | `ReportResults.tsx`, `ResearchTextHighlighter.tsx`, `ResearchResults*`, `backend/app/reports.py` | **PARTIAL** — Browser đọc finding có 2 source references được đánh dấu `Unverified`, scope/uncertainty/PO implication hiện diện. Không kiểm chứng nguồn bên ngoài hoặc độ đúng của kết luận. | KEEP; giữ traceability và trạng thái chưa xác minh |
| Benchmark workspace | Report → `Benchmark` | `ReportResults.tsx`, benchmark helpers/API trong `reports.py`, models/schemas | **PARTIAL** — Bản report có một subject dimension được chọn; observation thiếu hiện `Unknown / Not provided`, source unverified. Bảng nhiều cột khá dày; thao tác PO hiện chủ yếu theo lựa chọn rõ ràng. | KEEP; làm gọn matrix và giải thích so sánh được gì |
| Report-level PO notes | Report → `Report notes (legacy)` hoặc “Record PO decision” | `ReportResults.tsx`, benchmark workspace/report fields | **WORKING nhưng LEGACY** — Browser thấy assessment/notes/next action và trạng thái đã lưu trên Match-3. Đây là dữ liệu report-specific, không phải project decision. | Bảo toàn lịch sử; nhãn legacy rõ |
| Project-level PO decision | Research → Project → Opportunities | `OpportunityReview.tsx`, `opportunities.py`, `workspace_data.py`, `POOpportunityDecision` | **PARTIAL** — Browser hiện rõ “No candidates to review yet”; trang yêu cầu lưu shortlist CSV trước. Không thể đánh giá finding report độc lập nếu chưa có candidate trong project. | REFAC/CONSOLIDATE; đưa quyết định contextual từ finding vào nguồn quyết định hiện có |
| CSV import / metadata review | Report hoặc Project data → Import CSV / map / validate | `QuantitativeDatasetImport.tsx`, `DatasetMetadataReview.tsx`, `backend/app/quantitative.py`, `dataset_metadata.py`, `reports.py` | **PARTIAL** — Có preview/mapping/readiness/provenance và persistence; 2 dataset bản QA vẫn incompatible. Full browser import workflow không chạy lại trong audit. | KEEP; giữ raw bytes, không đoán GEO/platform/period |
| Data explorer, charts, period compare | Project data / `/explorer`, `/compare-periods` | `QuantitativeDatasetExplorer.tsx`, `QuantitativePeriodComparison.tsx`, chart adapters, `quantitative_comparisons.py` | **PARTIAL** — Capability có trong code/test/handoff; report đang xem không có chart tương thích và hiển thị lý do tổng quát. Không xác minh comparison thực trên browser với hai file QA này. | KEEP; chỉ hiện chart khi cohort tương thích và giải thích loại trừ |
| Sources / Explorer | `/sources`, `/explorer`, route theo context | `SourcesWorkspace.tsx`, `ExplorerWorkspace.tsx`, `backend/app/sources.py`, `apps.py` | **NOT VERIFIED trong browser audit** — router/component tồn tại nhưng không chạy search/source workflow lần này. | CONSOLIDATE dưới Research/Report context, giữ direct route |
| Tracking | `Tracking` → Project follow-up | `TrackingWorkspace.tsx` | **NOT IMPLEMENTED** — Browser hiển thị “Tracking setup pending” và xác nhận không có automatic updates, trend comparisons, change alerts. Không gọi placeholder là tracking thật. | Giữ trạng thái trung thực; cần hoàn thiện snapshot/history/action tracking trước PRODUCT PASS |
| Launcher / local data setup | `run.bat`, `run-local.ps1`, `scripts/setup.ps1` | scripts, database configuration | **NOT VERIFIED trong audit** — Không thử launcher để tránh khởi tạo ngoài bản QA; `scripts/setup.ps1` có thay đổi chưa commit trước audit. | Review riêng, test safe startup với exact data root/port |

## 4. Information Architecture

### Hiện tại

```text
Research
├─ Projects
├─ Project Research / data / opportunities
├─ Plans and Runs (contextual routes)
└─ Compare periods (contextual route)

Reports
├─ Shared saved-report library
├─ Project filter / unassigned filter
└─ Report detail: Overview, Insights, Entities, Benchmark,
   Report notes (legacy), Evidence, Full Report, Data Sources

Tracking
└─ Project follow-up placeholder (setup pending)

Secondary direct routes: Sources · Explorer · Research Runs
```

### Đánh giá và sơ đồ đích đề xuất (low-fidelity; không triển khai trong audit)

```text
Research
└─ Project
   ├─ Question & scope → Plan → Run history / external ChatGPT import
   ├─ Project data (CSV, metadata, compatible comparisons)
   └─ Reports in this Project (shared records; no copies)

Reports
├─ All reports (one source of truth)
├─ Filters: Project / Unassigned / date / topic
└─ Report
   ├─ Results: conclusion → findings → evidence / gaps
   ├─ Benchmark (only explicit comparable subjects)
   └─ PO decision (same authoritative Project decision record)

Tracking
└─ Project timeline: report snapshots → confirmed changes → PO actions
```

Giữ ba mục điều hướng chính Research / Reports / Tracking. Không thêm menu trái mới cho Sources, Explorer, Insights hay Benchmark; chúng là công cụ theo ngữ cảnh của Project/Report. Reports Library và Project reports đã được xác minh là hai bộ lọc trên cùng record: URL chi tiết giữ cùng `report_id`. Unassigned reports cần PO chọn Project tường minh; không suy đoán theo tiêu đề.

## 5. End-to-end workflow

| Bước | Kết quả thực tế | Trạng thái |
|---|---|---|
| Mở Project | Mở được Project có sẵn và các tab Research / Report / Tracking. Không tạo Project mới trong browser run. | PARTIAL |
| Đặt câu hỏi, tạo prompt ChatGPT | UI/copy-prompt có trong source và test; không chạy ChatGPT bên ngoài. | NOT VERIFIED (external step) |
| Import một câu trả lời thật một lần | Không import report mới trong audit. Existing saved report đã có provenance `ChatGPT user import`, nhưng nguồn gốc ngữ nghĩa không thể xác nhận từ DB. | NOT VERIFIED |
| Review conclusion/findings | Browser mở report đã lưu; đọc conclusion, 6 findings, scope, uncertainties, implications. | PASS cho render, không phải fact-check |
| Review source | Source URLs trong finding hiện `Unverified`; vị trí dòng report có hiển thị. Không truy cập URL bên ngoài và không xác minh nội dung nguồn. | PASS cho provenance display; verification NOT DONE |
| Benchmark | Một subject dimension có mặt; missing observations là Unknown; một report sample không chứng minh được multi-entity comparison đầy đủ. | PARTIAL |
| Ghi PO decision | Insight “Record PO decision” chuyển sang Report notes legacy. Project Opportunities hiện 0 candidates/0 decisions và yêu cầu CSV shortlist. Chưa hoàn tất đường insight → authoritative Project decision. Không save thay đổi mới để tránh sửa dữ liệu test user ngoài yêu cầu. | NEEDS FIX |
| Refresh / reopen | Report filter and same ID persisted sau reload trên bản SQLite copy. Không thực hiện save assessment mới/refresh ở UAT vì không cần thiết để chứng minh lỗi split. | PARTIAL |
| Tracking kết quả | Trang nêu rõ chưa có update/trend/change alert. | NOT IMPLEMENTED |

## 6. UI/UX browser review

**Môi trường:** Chrome headless điều khiển bằng Playwright → frontend `http://127.0.0.1:15201`, backend `http://127.0.0.1:15200`, SQLite bản sao cô lập. Không dùng tab/browser desktop của người dùng hoặc SQLite production. Các PNG trong `.bangiao/screenshots/product-recovery-audit/` là ảnh chụp thật từ giao diện đang chạy. Đây là kiểm tra render/navigation trong browser; không đồng nghĩa đã xác nhận mọi nghiệp vụ end-to-end.

### Reports Library — desktop mặc định của browser (~1265 × 712)

- 8 reports và bộ lọc project/unassigned dễ nhận ra; mỗi report chưa gán có nút chọn Project riêng, thao tác lặp nhiều nếu cần phân loại nhiều report.
- Một báo cáo được chọn Project, hiện thông báo thành công; report tiếp tục nằm trong cùng library.
- Điểm tốt: không tự gán; report không bị nhân bản.
- Khác biệt: khoảng trắng dọc lớn giữa phần giới thiệu và bộ lọc/danh sách, khiến ít report xuất hiện trong viewport đầu.

### Report Detail / Overview — 1440 × 900

- Header Project workflow cộng header Report chiếm phần trên; conclusion và takeaways xuất hiện cuối viewport.
- **Key findings chưa xuất hiện trong viewport đầu**; cần cuộn xuống. Data Sources nằm giữa tabs và Overview, làm kết quả chính thấp hơn.
- Khu quantitative có nhãn measurements unverified nhưng hiển thị danh sách định nghĩa/observation dài khi chart chưa sẵn sàng; tạo cảm giác raw-data viewer hơn là kết luận cho PO.
- Kết luận report chứa nhiều market claims; report đánh dấu nguồn unverified, nhưng người đọc cần mở nhiều nơi để nối claim–metric–source.

### Insight / Evidence / Benchmark

- Insight list có finding type, trạng thái unverified, scope, uncertainty, PO implication, source references; dữ liệu định tính không bị ép thành verified.
- Evidence có tên nguồn và vị trí `line:n`, link rõ. Không tuyên bố link đã được fetch hay kiểm chứng.
- Benchmark báo `Unknown / Not provided` với observation thiếu; matrix có nhiều cột và chiều ngang lớn. Không thấy giá trị ranking tự sinh trong trạng thái sample đang mở.
- “Record PO decision” đặt PO vào Report notes (legacy), không ghi ngay quyết định Project hiện hành.

### Tracking — 1440 × 900

- Empty/pending state trung thực, cho biết không có auto updates/trends/alerts; có danh sách Project. Tuy nhiên đây là placeholder chức năng chứ chưa đáp ứng tracking outcome.

### Responsive checks

| Viewport | Đo lường DOM | Quan sát thật |
|---|---|---|
| 1440 × 900 | Document/body 1425px ≤ 1440px | Không overflow ngang; report header + conclusion/takeaways; findings chưa vào viewport đầu. |
| 768 × 1024 | Document/body 753px ≤ 768px | Không overflow trang; tiêu đề report xuống nhiều dòng; tab strip và matrix cần cuộn trong vùng riêng. |
| 390 × 844 | Document/body 375px ≤ 390px | Không overflow trang; tab cuối chỉ hiện một phần trong thanh cuộn ngang; bảng comparison rộng. Cần đảm bảo người dùng nhận ra tab/table có thể cuộn. |
| 1076 × 828 | Không kiểm tra viewport này | **NOT VERIFIED**. |

Ảnh chụp thật đã được lưu:

- Reports Library: `.bangiao/screenshots/product-recovery-audit/reports-library-1440x900.png`
- Report Overview desktop: `.bangiao/screenshots/product-recovery-audit/report-overview-1440x900.png`
- Overview toàn trang: `.bangiao/screenshots/product-recovery-audit/report-overview-full.png`
- Insight detail: `.bangiao/screenshots/product-recovery-audit/insight-detail-1440x900.png`
- Benchmark desktop: `.bangiao/screenshots/product-recovery-audit/benchmark-1440x900.png`
- PO Assessment đã lưu: `.bangiao/screenshots/product-recovery-audit/po-assessment-saved-1440x900.png`
- Overview 768px / 390px: `.bangiao/screenshots/product-recovery-audit/report-overview-768x1024.png`, `.bangiao/screenshots/product-recovery-audit/report-overview-390x844.png`
- Benchmark 768px / 390px: `.bangiao/screenshots/product-recovery-audit/report-benchmark-768x1024.png`, `.bangiao/screenshots/product-recovery-audit/report-benchmark-390x844.png`
- Tracking desktop: `.bangiao/screenshots/product-recovery-audit/tracking-1440x900.png`

Các ảnh cho thấy trạng thái thực tế, gồm nội dung report hiện có và PO assessment đã lưu; không có dữ liệu được tạo để làm ảnh demo. Ảnh 390px được chụp ở viewport mobile nhưng hiện page có thanh điều hướng compact; ảnh cũng cho thấy Benchmark cần cuộn ngang trong tab và không nên hiểu đó là kiểm tra usability hoàn chỉnh.

### Accessibility / errors

- Accessibility snapshot nhận diện được điều hướng, tabs, native combobox, heading, status và nút actions. Đây chỉ là kiểm tra role/name cơ bản; keyboard-only, screen reader và contrast audit đầy đủ chưa chạy.
- Browser console log ở lượt kiểm tra cuối không trả warning/error.

## 7. Data integrity và độ tin cậy nghiên cứu

- SQLite bản sao: integrity `ok`, revision `20261024_0009`; production SQLite không bị chạm.
- Report schema có `content`, hash, provenance, parsed structured data, benchmark selection/workspace và nullable `project_id`. Không có `run_id`.
- CSV schema giữ nguyên text gốc, hash, mapping, entity mappings, observations, compatibility và validation reasons; hai dataset hiện lưu riêng, hash khác nhau.
- Browser hiển thị quantitative report data `SOURCE-REPORTED MEASUREMENTS · UNVERIFIED`; source links “Unverified”; unknown cells không được điền số giả.
- Một report có số liệu nhiều metric/period nhưng app ghi “incomplete or incompatible coverage” và không vẽ chart. Hành vi chặn so sánh thiếu căn cứ là đúng; hiện UX cần nói chính xác observation/điều kiện nào chặn và PO có thể bổ sung metadata nào.
- 0 Project opportunity-decision records trong bản QA hiện tại; có một report-level benchmark note saved. Đây là hai miền lưu riêng, không thể gọi cùng một quyết định.
- 0 Run Manifest trong bản QA nên immutability của một manifest thực không thể xác minh browser. Automated prior handoffs cover migration/restore fixtures, nhưng không thay thế fixture thật ở snapshot này.
- Không kiểm tra website nguồn bên ngoài; không xác minh market facts; không suy ra `Unified` là Android/iOS hoặc các metadata không có trong export.

## 8. Issue register

### REC-P1-01 — Tracking chưa thực hiện theo dõi nghiên cứu

- **Tái hiện:** Mở `Tracking` → `Project follow-up`.
- **Thực tế:** Hiện “Tracking setup pending”; không có research snapshots, change comparison, action status hay alert. Component nói rõ chưa có auto updates/trend comparisons/change alerts.
- **Mong đợi:** Revisit report qua thời gian, chọn baseline, xem thay đổi có bằng chứng, xem PO action và cập nhật trạng thái.
- **Bằng chứng:** Browser snapshot/screenshot Tracking tại 1440×900; `frontend/src/tracking/TrackingWorkspace.tsx`; Master Plan các phần P02–P04.
- **Ảnh hưởng:** Project longitudinal value, quyết định và follow-up.
- **Hướng giải quyết:** Dùng report snapshots và PO action/decision hiện có làm lõi; không hiển thị update tự động nếu chưa có nguồn/snapshot.
- **Tiêu chí chấp nhận:** Hai report snapshot cùng project có thể được xem theo timeline; thay đổi chỉ dựa trên dữ liệu đối chiếu; hành động giữ trạng thái sau refresh; unknown/missing không bị xem là removed.

### REC-P1-02 — Report decision và Project decision bị tách

- **Tái hiện:** Report → Insights → `Record PO decision`; sau đó nhấn `Open project decisions`.
- **Thực tế:** Nút mở tab `Report notes (legacy)` với assessment/notes/next action report-specific. Project Opportunities của sample hiện `0 candidates`, thông báo phải lưu shortlist CSV trước; không có authoritative project decision để mở cho finding này.
- **Mong đợi:** PO có thể ghi assessment cho finding/report phù hợp trực tiếp, phân biệt AI recommendation với PO decision; cùng một decision được mở lại từ Report và Project, không bắt buộc CSV shortlist khi đang đánh giá finding.
- **Bằng chứng:** Browser DOM snapshot, report `Record PO decision`, Project Opportunities empty state; `frontend/src/reports/ReportResults.tsx`, `frontend/src/research/OpportunityReview.tsx`, `backend/app/opportunities.py`, `backend/app/models.py`.
- **Hướng giải quyết:** Hợp nhất đường vào quyết định bằng persistence hiện có hoặc định nghĩa rõ nguồn authoritative; giữ nguyên legacy records, không tự migrate/suy đoán note.
- **Tiêu chí chấp nhận:** Từ finding tạo/mở cùng decision đã lưu; record có report/finding/evidence context; không cần candidate CSV trừ khi decision là shortlist/product opportunity; save-refresh-reopen giữ nguyên notes và provenance.

### REC-P1-03 — Quantitative khu vực chưa dẫn PO từ “không so sánh được” tới lý do cụ thể

- **Tái hiện:** Mở report sample → Overview → `Data Sources` / `Market Data & Charts`.
- **Thực tế:** Hiển thị trạng thái tổng quát “incomplete or incompatible coverage”, các metric definitions/observations dài, trong khi chart không hiện. Hai file CSV cùng tên nhưng khác hash và incompatible vẫn là hai dataset riêng.
- **Mong đợi:** Tóm tắt nguồn/coverage ngắn; nêu dimensions nào chưa khớp (metric, period, GEO, platform, entity, methodology) và cách PO có thể xác nhận/sửa; giữ raw rows trong phần mở rộng.
- **Bằng chứng:** Browser Overview/Benchmark; bản QA SQLite `quantitative_datasets` và `research_data_json`; `frontend/src/reports/ReportResults.tsx`, `QuantitativeEvidence.tsx`, `QuantitativePeriodComparison.tsx`, `backend/app/quantitative_comparisons.py`, `dataset_metadata.py`.
- **Hướng giải quyết:** Trình bày readiness reason per comparison group, không nới compatibility rules và không tạo chart.
- **Tiêu chí chấp nhận:** Incompatible cohort không có delta/chart; PO thấy chính xác lý do và nguồn/dòng liên quan; raw observation vẫn mở được; compatible cohort thật vẫn hiển thị đúng kỳ/scope.

### REC-P1-04 — Branch tích hợp quá rộng để coi là một thay đổi nhỏ

- **Tái hiện:** So sánh branch `feat/ux-recovery-01-research-results` với master.
- **Thực tế:** 85 commits ahead; handoff P0 ghi 144 paths và ~14,792 insertions; nhiều khu vực chung (navigation, global CSS, models, migrations, CSV/data, reports) cùng có delta.
- **Mong đợi:** Owner biết merge slice nào, kiểm thử migrations và cross-feature regressions trước release.
- **Bằng chứng:** `git rev-parse`, `git status`, `.bangiao/P0-PROJECT-REPORT-UNIFICATION.md`; local/remote feature HEAD khớp, master đang ở SHA khác.
- **Hướng giải quyết:** Review theo commit/diff nhóm chức năng; xác nhận branch gốc và test release candidate trên bản sao DB trước merge; không squash/merge mù.
- **Tiêu chí chấp nhận:** Diff từ merge-base được owner review; migrations chạy trên backup copy; frontend/backend regression xanh; production DB backup/restore đã kiểm thử.

### REC-P2-01 — Cần liên kết rõ ràng nhiều báo cáo cũ chưa có Project

- **Tái hiện:** Reports → Project filter → Unassigned.
- **Thực tế:** Snapshot trước thao tác QA có 8/8 report unassigned; một chọn thủ công Project được giữ lại sau reload. Link rõ ràng tránh suy đoán nhưng người dùng phải phân loại từng report.
- **Mong đợi:** User có thể tìm/nhóm các report cũ nhanh mà không sửa report body hoặc mất IDs.
- **Bằng chứng:** Browser Reports Library; DB copy trước/sau; `frontend/src/reports/ResearchIntake.tsx`, `backend/app/reports.py`.
- **Hướng giải quyết:** Giữ tường minh; cân nhắc bulk linking chỉ khi tất cả report được user chọn rõ trong cùng một Project và có preview.
- **Tiêu chí chấp nhận:** Không tự gán theo tên; mỗi report giữ ID/content/notes; cancel không ghi; reload/filter nhất quán.

### REC-P2-02 — Mobile tabs và Benchmark matrix cần tín hiệu cuộn rõ hơn

- **Tái hiện:** Report Benchmark ở viewport 390×844 hoặc 768×1024.
- **Thực tế:** Trang không tràn ngang; thanh tabs chỉ hiển thị một phần tab cuối, matrix có nhiều cột và cuộn ngang trong panel. Scroll affordance không nổi bật ở ảnh tĩnh.
- **Mong đợi:** PO biết còn tab/cột bên phải; tên và evidence actions vẫn đọc được.
- **Bằng chứng:** Browser screenshots thật 390/768; DOM scrollWidth 375/753 ≤ viewport 390/768; `frontend/src/style.css`, `ReportResults.tsx`.
- **Hướng giải quyết:** Thêm chỉ báo/gradient/focus behavior accessible cho vùng cuộn và ưu tiên stacked subject cards ở màn nhỏ khi matrix không đọc được.
- **Tiêu chí chấp nhận:** Tab cuối mở được bằng bàn phím/chạm; table horizontal scroll không làm scroll cả trang; không cắt entity/action.

### REC-P2-03 — Reports Library dùng nhiều khoảng trắng và lặp thao tác gắn Project

- **Tái hiện:** Mở Reports ở desktop ~1265×712 với nhiều report unassigned.
- **Thực tế:** Khoảng trống lớn giữa introduction và search/filter/list; mỗi row có selector riêng.
- **Mong đợi:** Tìm/lọc danh sách hiệu quả và nhóm report cũ mà vẫn giữ quyết định từng report tường minh.
- **Bằng chứng:** Screenshot Reports Library thật, `frontend/src/reports/ResearchIntake.tsx`, `style.css`.
- **Hướng giải quyết:** Nén khoảng cách, giữ explicit row action; bulk action chỉ thêm nếu preview/cancel rõ và không đoán.
- **Tiêu chí chấp nhận:** Nhiều report thấy được hơn ở viewport đầu; action/status vẫn gắn đúng row.

## 9. Keep / Refactor / Consolidate / Remove

- **KEEP:** `po_research_v1`; nguyên văn report và hash; evidence/source provenance; state/manifest bất biến; SQLite additive migrations; report/project/dataset IDs; explicit compatibility; unknown/unverified states; ba khu vực điều hướng chính.
- **REFACTOR:** Research Results quantitative area để biến readiness reason thành thông tin hành động; Benchmark/PO Decision cho decision có ngữ cảnh và tiết kiệm chiều ngang; report header và content density.
- **CONSOLIDATE:** Reports Library toàn cục và Project reports thành cùng catalog/filter; Report notes legacy với Project decisions thành một journey nhưng bảo toàn lịch sử riêng cho tới khi PO chọn migration; Sources/Explorer/Compare thành công cụ ngữ cảnh, không menu chính thứ tư.
- **REMOVE:** Không đề nghị xóa feature hay dữ liệu nào trong audit. Chỉ bỏ copy/CTA tạo cảm giác đã tracking/verified nếu nó vượt quá trạng thái thật; hiện trang Tracking đã nêu rõ giới hạn nên giữ.

## 10. Năm hành động phục hồi có tác động cao nhất

Đây là thứ tự đề xuất để PO xem xét, **không tự khởi chạy task tiếp theo**:

1. Xác định authoritative PO decision cho insight/report và Project; làm thông suốt từ finding tới quyết định mà không bắt buộc CSV shortlist.
2. Thiết kế tracking thật dựa trên report snapshots và action history; giữ missing/conflicting evidence tách biệt.
3. Làm quantitative readiness minh bạch theo metric/scope/period/entity; xử lý dữ liệu Sensor Tower chỉ khi đủ metadata thực.
4. Giảm độ dày của Overview để findings/evidence xuất hiện sớm và biến unavailable-data thành giải thích gọn.
5. Tách review integration branch 85 commits theo diff nhóm, kiểm tra test/migrations và working tree trước quyết định merge.

## 11. Kết quả test và giới hạn

| Kiểm tra | Kết quả audit |
|---|---|
| Frontend full suite (`npm test -- --run --no-file-parallelism --maxWorkers=1`, TEMP/TMP workspace) | **PASS — 18 files, 167 tests** |
| TypeScript (`npm run typecheck`) | **PASS** |
| Production build (`npm run build`) | **PASS** — Vite warning bundle JS ~512.21 kB vượt advisory 500 kB; không phải build error |
| Backend `tests/test_workspace_data_first.py` | **PASS — 15 tests** trên temp folder trong workspace |
| Backend full `pytest -q` | **NOT VERIFIED** — lần đầu test temp mặc định lỗi quyền tạo thư mục dưới Windows sandbox temp; lần chạy temp trong workspace không kết thúc/không flush kết quả, dừng thủ công |
| Backend report API focused tests | **NOT VERIFIED** — các test report không trả kết quả sau >60s với temp path; dừng thủ công. Không tính là pass hoặc fail sản phẩm |
| `git diff --check` | **PASS** — chỉ cảnh báo chuyển LF/CRLF ở file đã sửa trước audit |
| SQLite bản QA integrity | **PASS — `ok`, revision `20261024_0009`** |
| Browser Reports link/filter/reload | **PASS trong bản sao QA** — cùng report ID, không nhân bản; unassigned state còn lại đúng |
| Browser responsive 390/768/1440 | **Đo được page width không overflow; UX findings ở Mục 6**; 1076 NOT VERIFIED |
| ChatGPT external research / genuine new import | **NOT VERIFIED** |
| URL/source fact-check và market conclusion accuracy | **NOT VERIFIED** — không tự mở URLs, không có nguồn xác minh độc lập |
| CSV import-to-chart / comparable period end-to-end | **NOT VERIFIED trong browser run này**; dữ liệu bản copy incompatible, app chặn chart |
| Screenshot files trong `.bangiao/screenshots/product-recovery-audit/` | **DELIVERED** — ảnh browser thật được lưu; xem Mục 6. Đây là bằng chứng render, không thay thế kiểm thử nghiệp vụ sâu |

## 12. Verdict

| Khu vực | Verdict | Căn cứ |
|---|---|---|
| Research Functionality | **NEEDS FIX** | Tổ chức project/report/plan/run tồn tại; ChatGPT là người dùng vận hành; full genuine report journey chưa UAT và decision→tracking chưa đóng. |
| Research Report Quality | **NEEDS FIX** | Original report và structured insights/evidence có thể xem; nguồn chưa xác minh, Overview nhiều text và finding bị đẩy xuống. |
| UI/UX | **NEEDS FIX** | Screenshots browser cho thấy layout chạy responsive không tràn ngang nhưng khoảng trắng/density, quantitative area, scroll affordance và PO decision context chưa đạt. |
| Quantitative Analysis | **NEEDS FIX** | Validation/provenance an toàn, nhưng datasets hiện incompatible; comparison/chart đúng không được xác nhận trên dữ liệu owner trong lần này. |
| Project / Report Consistency | **PASS trên local working tree; release NOT READY** | Browser explicit link/filter/reload giữ cùng `report_id`; các thay đổi liên quan chưa commit và branch còn integration risk lớn. |
| PO Decision Workflow | **NEEDS FIX** | Report notes legacy và project decisions tách biệt; Project workspace trống nếu chưa có CSV shortlist. |
| Tracking | **NEEDS FIX** | UI placeholder và chưa có snapshots/change/action tracking. |
| Overall Product Readiness | **NEEDS FIX** | Workflow chưa kín; backend full regression và screenshot artifacts chưa được xác minh/bàn giao. |

## Product Acceptance

- **PO goal:** dùng một Project để tổ chức nghiên cứu, report, bằng chứng, so sánh, quyết định và việc theo dõi về sau.
- **User journey đã kiểm tra:** mở Reports → chọn Project cho một report unassigned trong bản sao QA → lọc theo Project → mở đúng report ID → refresh → đọc Overview/Insight/Evidence/Benchmark; mở Project PO review và Tracking để xác nhận các giới hạn hiện tại.
- **Automated work:** UI giữ original report và record ID; project filter dùng cùng report catalog; CSV readiness chặn dữ liệu không tương thích; sources và observations không tự được gắn verified.
- **Expected result:** PO có thể tìm cùng report từ library/project và thấy scope/evidence/unknowns; quyết định Project cần nối thêm với findings không phụ thuộc shortlist CSV; tracking chưa có kết quả thật.
- **Remaining friction:** PO phải link báo cáo cũ tường minh; assessment legacy tách Project decision; chưa tracking snapshots/actions; incompatible CSV cần metadata tương thích; full backend suite chưa chạy xong.
- **Verification:** 167 frontend tests, typecheck/build, 15 backend workspace tests; browser UAT trên SQLite copy và viewport 1440/768/390 như trên; toàn bộ phần chưa chạy được ghi NOT VERIFIED.
- **Decision:** **NEEDS FIX**. Không tuyên bố PRODUCT PASS hay release-ready.

**Audit status:** hoàn tất trong phạm vi khả dụng; không có code sửa, commit, push hay merge. Dừng chờ PO duyệt kết quả và thứ tự phục hồi.

---

## 13. Unified Recovery refresh — 2026-10-27

Addendum này cập nhật trạng thái repository và bổ sung yêu cầu TW-01; các kết quả kiểm thử/UAT trong Mục 6–12 vẫn là kết quả của lần chạy đã ghi, **không phải lần chạy mới**.

### Snapshot hiện tại

- Branch `feat/ux-recovery-01-research-results`; local HEAD và remote HEAD: `3f4eacb666b353820183baa26a76df2335f3bd11` (commit bổ sung báo cáo và screenshots). `master`/`origin/master`: `57b7167ae60729fd3221e283c7ff2433e22454a4`.
- Feature branch hiện **86 commits ahead, 0 behind** master; merge-base diff **158 paths, +15,098 / -151 lines**. Đây là rủi ro tích hợp lớn cần review theo nhóm tính năng.
- Working tree đang có 6 file modified và 19 đường dẫn untracked. Phần Project/Report gồm `frontend/src/reports/ReportResults.tsx`, `ResearchIntake.tsx`, `ResearchIntake.test.tsx`, `style.css`, `tests/test_workspace_data_first.py`; `scripts/setup.ps1` là thay đổi launcher riêng, không trộn vào recovery slice. Các thư mục untracked và scratch được giữ nguyên. Không stage/reset trong lần cập nhật này.
- `.bangiao/P0-PROJECT-REPORT-UNIFICATION.md` vẫn là tài liệu untracked tại thời điểm kiểm tra. Nó ghi lại thiết kế và test trước đây; current dirty diff cần review/test riêng trước khi được coi là phần tích hợp ổn định.
- 13 screenshots thật đã được commit trong `.bangiao/screenshots/product-recovery-audit/`; commit chỉ tài liệu/ảnh, không chứa các thay đổi code đang dang dở.
- Production SQLite không bị sửa. Các kết quả test mới nhất có trong audit trước đó: frontend 167 tests, typecheck/build PASS; backend 15 workspace tests PASS; full/report backend suite NOT VERIFIED. Không chạy lại suite trong planning refresh này.

### TW-01 — Trend Intelligence trong cùng Research Project

Yêu cầu được thêm vào backlog hợp nhất: từ Project hiện tại PO lưu một Trend Update có source attribution → xác định/tạo Research Subject tường minh → thêm vào Benchmark Collection → mở Subject Profile → ghi các phân tích Core Loop / Level Design / Ad Placement → gắn image evidence → lưu PO Decision → refresh/reopen → thêm cập nhật mới và xem lịch sử.

Đây là **luồng acceptance mới, chưa phải capability đã triển khai**. Source model hiện không có Research Subject, Benchmark Collection, Trend Update hoặc image attachment. `Evidence`/`SourceRecord` hiện bị ràng buộc vào Research Run, nên phải có thiết kế liên kết additive nếu trend/report/CSV evidence cùng cần dùng. Không được tạo app “Trend Watch” song song, không suy diễn publisher country thành GEO, không biến `11,1 triệu lượt tải` thành số đã kiểm chứng hoặc tính tăng trưởng khi thiếu kỳ/định nghĩa/phạm vi.

Ví dụ `Rotate Rings vượt 11,1 triệu lượt tải`, source note ngày 2026-10-21 mới là test scenario do PO nêu. Trong audit/repository chưa có source note/link/image tương ứng; vì thế fact-check và browser UAT với source thật là **NOT VERIFIED**.

### Ưu tiên và blocker sau khi thêm TW-01

- **P0:** Project context/report worktree candidate cần review; persistent Subject + reusable Benchmark Collection; Trend Update + image evidence; decision continuity giữa report/subject/project; history/Tracking; genuine-data acceptance cho long report, trend và updates.
- **P1:** giải thích cụ thể lý do quantitative readiness, mobile tab/matrix usability, full backend regression, review branch 86 commits/158 paths, production-history backup/restore.
- **P2 (deferred có lý do):** automatic crawling/monitoring, paid/AI API và source auto-verification do chưa có source access/policy được duyệt.

Architecture, consolidated backlog, design direction, milestone Oct 27–31 và ba acceptance scenarios nằm trong [Unified Product Recovery — October 2026](UNIFIED-PRODUCT-RECOVERY-OCT-2026.md), được link từ Master Implementation Plan. Kết luận audit chưa đổi: **NEEDS FIX / RELEASE PENDING VERIFICATION**; không có Product PASS, merge hay push được thực hiện trong lần lập kế hoạch này.
