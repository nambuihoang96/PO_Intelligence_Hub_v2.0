// Pure helpers for the one-file CSV result page: group many raw warnings into a few Vietnamese types.

export type WarningGroup = {
  id: string;
  title: string;
  help: string;
  count: number;
  rows: number[];
  examples: string[];
};

type Rule = { id: string; title: string; help: string; test: RegExp };

// Order matters: the first matching rule wins. Backend messages are kept as-is (some are English);
// only their Vietnamese grouping title is shown by default.
const RULES: Rule[] = [
  { id: 'future', title: 'Kỳ hoặc ngày sau hôm nay', help: 'Số liệu của kỳ này chưa thể coi là đã hoàn tất. Chỉ so sánh sau khi kỳ kết thúc.', test: /beyond today|sau hôm nay/i },
  { id: 'filename', title: 'Tên tệp ghi kỳ khác với ngày trong CSV', help: 'Tên tệp chỉ là gợi ý. Nếu PO đã xác nhận kỳ từ tên tệp, cảnh báo này chỉ để tham khảo.', test: /Tên tệp ghi kỳ|file name states/i },
  { id: 'growth', title: 'Tăng trưởng lớn hơn giá trị tuyệt đối', help: 'Dòng có thể bị sai cột hoặc sai định dạng số. Kiểm tra trong bảng gốc trước khi dùng.', test: /tăng trưởng lớn hơn|growth.*(larger|greater|exceed)/i },
  { id: 'format', title: 'Số không đọc được (sai định dạng)', help: 'Ô số có dấu chấm phân cách hàng nghìn hoặc ký tự lạ. Các dòng này không được tính.', test: /non-numeric value/i },
  { id: 'confirm', title: 'Chờ PO xác nhận căn cứ', help: 'Đơn vị, phương pháp, GEO hoặc kỳ chưa có căn cứ trong CSV. Xác nhận ở khung “Xác nhận thông tin tệp”.', test: /lacks a CSV or documented|not confirmed by CSV|documented provider basis/i },
  { id: 'geo', title: 'Thiếu khu vực (GEO)', help: 'Tệp không có cột GEO. Có thể xác nhận từ tên tệp nếu tên có ghi khu vực.', test: /missing GEO/i },
  { id: 'period', title: 'Chưa rõ kỳ đo hoặc ngày snapshot', help: 'Cần biết mỗi ngày là một thời điểm hay tổng trong một khoảng.', test: /period meaning|Snapshot date semantics|Snapshot and interval|Interval and snapshot/i },
  { id: 'unit', title: 'Thiếu đơn vị', help: 'Đơn vị không có trong CSV. PO xác nhận đơn vị tại khung xác nhận.', test: /missing unit/i },
  { id: 'value', title: 'Thiếu giá trị số', help: 'Ô số trống. Dòng này không được tính.', test: /Missing numeric value/i },
  { id: 'date', title: 'Ngày không đọc được', help: 'Ngày trong CSV không đúng định dạng hoặc mơ hồ (ví dụ 05/09 có thể là 5/9 hoặc 9/5). Nên dùng 2026-09-05 hoặc 14/09/2026.', test: /invalid (snapshot_date|period_start|period_end|snapshot|period)|Invalid (snapshot|period)/i },
  { id: 'yoy', title: 'Chưa có số năm trước', help: 'Có thể là sản phẩm mới ra mắt. Đây không phải lỗi dữ liệu.', test: /year-over-year|không có giá trị so sánh cùng kỳ năm trước/i },
];

const ROW = /\brow (\d+)\b/i;

export function groupWarnings(reasons: string[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>();
  for (const reason of reasons) {
    const text = String(reason ?? '').trim();
    if (!text) continue;
    const rule = RULES.find((item) => item.test.test(text));
    const id = rule?.id ?? 'other';
    const group = groups.get(id) ?? {
      id,
      title: rule?.title ?? 'Cảnh báo khác',
      help: rule?.help ?? 'Đọc chi tiết để biết cần kiểm tra điều gì.',
      count: 0,
      rows: [],
      examples: [],
    };
    group.count += 1;
    const row = ROW.exec(text);
    if (row) group.rows.push(Number(row[1]));
    if (!group.examples.includes(text) && group.examples.length < 3) group.examples.push(text);
    groups.set(id, group);
  }
  const order = [...RULES.map((rule) => rule.id), 'other'];
  return [...groups.values()]
    .map((group) => ({ ...group, rows: [...new Set(group.rows)].sort((a, b) => a - b) }))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const FILENAME_PERIOD = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\s*[-–—]+\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/;

function isoDate(month: string, day: string, year: string): string | null {
  const monthNumber = MONTHS[month.slice(0, 3).toLowerCase()];
  if (!monthNumber) return null;
  const value = `${year}-${String(monthNumber).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

// Proposes period and GEO from the file name only. Anything not written there stays null.
export function proposalFromFilename(filename: string): { periodStart: string | null; periodEnd: string | null; geo: string | null } {
  const match = FILENAME_PERIOD.exec(filename ?? '');
  const periodStart = match ? isoDate(match[1], match[2], match[3]) : null;
  const periodEnd = match ? isoDate(match[4], match[5], match[6]) : null;
  const ordered = periodStart && periodEnd && periodStart <= periodEnd;
  const geo = /\bworldwide\b/i.test(filename ?? '') ? 'Worldwide' : null;
  return { periodStart: ordered ? periodStart : null, periodEnd: ordered ? periodEnd : null, geo };
}

export function formatIsoDateVi(value: string | null): string {
  if (!value) return 'chưa có';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}
