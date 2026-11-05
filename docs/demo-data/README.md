# Cặp tệp DEMO để xem so sánh hai kỳ

**Toàn bộ tên game, nhà phát hành và số liệu ở đây là tự tạo.** Không dùng để kết luận về thị trường, và không dùng để nghiệm thu G3-07 trên dữ liệu thật.

- **Kỳ:** 15/08 – 13/09/2026 và 14/09 – 13/10/2026, đều 30 ngày.
- **Quy mô:** mỗi tệp 25 game, 3 chỉ số (lượt tải, doanh thu, DAU).
- **Tình huống có sẵn:** game tăng mạnh, giảm mạnh, ổn định, đổi thứ hạng, lượt tải ổn định nhưng doanh thu đổi, thiếu giá trị, 2 game rời danh sách, 2 game mới vào danh sách.
- **Kết quả mong đợi với lượt tải:** 23 game so sánh được (13 tăng, 10 giảm), 2 game chỉ có ở kỳ trước, 2 game chỉ có ở kỳ hiện tại.

**Khác với tệp Sensor Tower thật:** tệp DEMO có sẵn cột GEO, kỳ, phương pháp, đơn vị và nguồn, và mỗi chỉ số nằm trên một dòng riêng. Tệp thật không có các cột này, nên kết quả trên DEMO chưa chứng minh tệp thật đi được hết luồng so sánh. Xem mục 6 của `docs/PLANNER_CONTEXT.md`.

**Tạo lại tệp:** `python docs/demo-data/generate_demo.py`

**Không nhập vào dữ liệu thật.** Lần chạy thử 2026-11-05 nhập trực tiếp qua API vào một bản sao dữ liệu. Việc nhập bằng nút "Thêm tệp CSV mới" trên giao diện chưa được thử.
