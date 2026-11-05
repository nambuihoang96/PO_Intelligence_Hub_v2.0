import { describe, expect, it } from 'vitest';
import type { QuantitativeDataset, QuantitativeObservation } from '../reports/api';
import { computeTop10Rankings, rowsForLens } from './top10Insight';
import { top5FactLines, TOP5_OUTPUT_RULES } from './top5Prompt';

function obs(row: number, metric: string, name: string, value: number): QuantitativeObservation {
  return { metric_id: metric, metric_definition: metric, value, unit: 'downloads', entity_id: null, entity_name: null,
    source_entity_id: `sensor_tower:id${row}`, source_entity_name: name, source_provider: 'sensor_tower', geo: null, platform: 'Unified',
    period_start: null, period_end: null, snapshot_date: '2026-09-14', period_semantics: 'unknown', granularity: null, source_reference: null,
    verification_status: 'unverified', provenance_type: 'csv_dataset', provenance_id: 'd', observation_type: 'imported', validation_reasons: [],
    source_row_number: row, source_publisher_name: 'Pub A' } as unknown as QuantitativeObservation;
}

const data = {
  id: 'ds', report_id: null, filename: 'sample.csv', content_sha256: 'x', field_mapping: {}, entity_mappings: {}, compatibility_status: 'partial',
  validation_reasons: [], created_at: '', duplicate: false,
  observations: [
    obs(1, 'downloads_absolute', 'Alpha', 10100), obs(1, 'downloads_yoy_growth_absolute', 'Alpha', 10000), obs(1, 'dau_absolute', 'Alpha', 50),
    obs(2, 'downloads_absolute', 'Bravo', 800), obs(2, 'downloads_yoy_growth_absolute', 'Bravo', 800), obs(2, 'revenue_absolute', 'Bravo', 900),
  ],
} as unknown as QuantitativeDataset;

describe('top5FactLines', () => {
  it('states calculated facts, flags the low-base growth and labels new games', () => {
    const rankings = computeTop10Rankings(data, '2026-11-05');
    const top10 = rowsForLens(rankings, 'downloads');
    const text = top5FactLines(data, top10, top10.slice(0, 5), rankings).join('\n');
    expect(text).toContain('Game mới trong top 10 (ngày phát hành khớp mốc năm trước): ');
    expect(text).toContain('CẦN KIỂM TRA: nền năm trước nhỏ');
    expect(text).toContain('Nhà phát hành lặp trong top 10: Pub A (2 game)');
    expect(text).toContain('Đơn vị doanh thu: chưa xác nhận');
  });

  it('keeps the required output rules and forbids metadata or taxonomy as main actions', () => {
    const rules = TOP5_OUTPUT_RULES.join('\n');
    expect(rules).toContain('Tối đa 3 cơ hội sản phẩm');
    expect(rules).toContain('tối đa 3 thí nghiệm');
    expect(rules).toContain('Không đưa giới hạn dữ liệu thành phát hiện hay hành động chính');
    expect(rules).toContain('chưa có nguồn độc lập');
    expect(rules).toContain('confidence');
    expect(rules).not.toContain('Số CSV chỉ đặt trong quantitative_observations');
    expect(rules).toContain('Meowdoku 13.837.982');
  });
});
