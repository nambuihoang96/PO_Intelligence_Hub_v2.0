import type { QuantitativeDataset } from '../reports/api';
import { GROWTH_SMALL_BASE_RATIO, type Top10Rankings, type Top10Row } from './top10Insight';

// Layer 1 facts for the top 5 research run. Every line is calculated by PO Hub from the CSV ("Tính từ CSV").
// The model is asked to interpret these facts, not to repeat them as findings.

const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

export function top5FactLines(dataset: QuantitativeDataset, top10: Top10Row[], top5: Top10Row[], rankings: Top10Rankings): string[] {
  const lines: string[] = [];
  const newInTop10 = top10.filter((row) => row.newStatus === 'new').map((row) => row.name);
  lines.push(`Game mới trong top 10 (ngày phát hành khớp mốc năm trước): ${newInTop10.length ? newInTop10.join(', ') : 'không có'}.`);
  const publishers = new Map<string, string[]>();
  for (const row of top10) if (row.publisher) publishers.set(row.publisher, [...(publishers.get(row.publisher) ?? []), row.name]);
  const repeated = [...publishers.entries()].filter(([, games]) => games.length >= 2).map(([pub, games]) => `${pub} (${games.length} game)`);
  lines.push(`Nhà phát hành lặp trong top 10: ${repeated.length ? repeated.join('; ') : 'không có'}.`);
  for (const row of top5) {
    const growth = row.growthRatio === null ? 'không có năm trước' : `+${nf2.format(row.growthRatio * 100)}%`;
    const warning = row.smallBaseGrowth ? ` · CẦN KIỂM TRA: nền năm trước nhỏ (≥ ${GROWTH_SMALL_BASE_RATIO}×), % chỉ tham khảo` : '';
    const revenue = row.revenue === null ? 'chưa có' : `${nf2.format(row.revenue)}${row.zeroRevenue ? ' (0 trong CSV)' : ''}`;
    lines.push(`Hạng ${row.rank} ${row.name} (${row.publisher ?? 'nhà phát hành chưa rõ'}): lượt tải ${nf0.format(row.downloads)}; DAU ${row.dau === null ? 'chưa có' : nf0.format(row.dau)}; doanh thu ${revenue}; tăng trưởng ${growth}${warning}.`);
  }
  const best = (rows: Top10Row[], pick: (row: Top10Row) => number | null) => rows
    .filter((row) => pick(row) !== null).sort((a, b) => Number(pick(b)) - Number(pick(a)))[0];
  const topDownloads = best(top5, (row) => row.downloads);
  const topDau = best(top5, (row) => row.dau);
  const topRevenue = best(top5, (row) => row.revenue);
  if (topDownloads && topDau && topRevenue) {
    lines.push(`Khoảng cách trong 5 game: lượt tải cao nhất ${topDownloads.name}; DAU cao nhất ${topDau.name}; doanh thu cao nhất ${topRevenue.name}. Đây là số trong tệp, không phải tỷ lệ chuyển đổi.`);
  }
  const newOutside = rankings.newGames.map((row) => row.name);
  lines.push(`Game mới trong toàn tệp (không xếp %): ${newOutside.length ? newOutside.join(', ') : 'không có'}.`);
  const smallBase = top5.filter((row) => row.smallBaseGrowth).length;
  lines.push(`Tăng trưởng: ${rankings.growthEligibleCount}/${rankings.productCount} game có năm trước; trong 5 game này có ${smallBase} game nền năm trước nhỏ.`);
  lines.push(`Đơn vị doanh thu: ${rankings.revenueCurrencyConfirmed ? (rankings.revenueUnit ?? 'đã xác nhận') : 'chưa xác nhận'}. Tệp: ${dataset.filename}.`);
  return lines;
}

export const TOP5_OUTPUT_RULES = [
  '## Yêu cầu đầu ra (bắt buộc, tiếng Việt)',
  'Phạm vi: chỉ 5 game đầu theo bộ lọc trong tệp CSV. Không khái quát cho cả thị trường. Số CSV là ước tính chưa xác minh.',
  '',
  'A. Mỗi game (5 mục): vòng lặp chính, yếu tố kéo người chơi quay lại, cách kiếm tiền, PO học được gì. Mỗi ý kèm nguồn công khai hoặc ghi “giả thuyết”. Trang store chỉ dùng để mô tả game là gì, không dùng làm insight.',
  '',
  'B. Tổng hợp:',
  '- 5 điểm nổi bật. Mỗi điểm phải nêu đúng tên game và đúng số từ mục “Tính từ CSV”, chép số đúng từng chữ, không tạo số mới. Ví dụ: “Meowdoku 13.837.982 lượt tải”.',
  '- Insight chính: giải thích ý nghĩa của các số đó, cũng nêu tên game và số đúng.',
  '- Tối đa 3 cơ hội sản phẩm và tối đa 3 thí nghiệm. Mỗi cái phải dựa trên một mẫu cụ thể trong dữ liệu này, nêu ít nhất hai tên game hoặc một số đúng. Không viết lời khuyên chung áp dụng cho mọi game. Ghi metric, bằng chứng, tác động kỳ vọng và nhãn [dữ liệu] / [giả thuyết] / [nhận định AI].',
  '- Insight cần nguồn độc lập (phân tích ngành, giải mã game, phỏng vấn, báo chí). Chỉ tìm nguồn thật có URL hoạt động. Nếu không có nguồn độc lập, ghi đúng “chưa có nguồn độc lập” và đánh dấu giả thuyết. Không bịa nguồn.',
  '',
  'C. Giới hạn dữ liệu: một mục ngắn, tối đa 4 gạch đầu dòng. Không đưa giới hạn dữ liệu thành phát hiện hay hành động chính. Không đề xuất “thêm metadata” hay “chuẩn hóa taxonomy”.',
  '',
  'Ràng buộc: quan hệ nhân quả chỉ là giả thuyết; không nói dữ liệu đại diện cho thị trường; không tạo số mới; mọi số lấy đúng từ mục “Tính từ CSV” hoặc từ JSON nguồn.',
  'JSON PO_RESEARCH_V1: mỗi game, điểm nổi bật, cơ hội và thí nghiệm là một findings với key riêng. Mỗi finding có confidence (số từ 0 đến 1) và uncertainty (một dòng nêu lý do). Mỗi cơ hội/thí nghiệm có po_implications nêu metric, bằng chứng, tác động và nhãn. Tối đa 14 findings.',
];
