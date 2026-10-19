import { useMemo, useState } from 'react';
import { reportApi, type ImportedReport, type QuantitativeDataset, type QuantitativeDatasetInput, type QuantitativeDatasetPreview, type QuantitativeMetricColumnMapping } from './api';

const dimensions = [
  ['entity_id', 'Entity'], ['geo', 'GEO'], ['platform', 'Platform'], ['period_start', 'Period start'],
  ['period_end', 'Period end'], ['granularity', 'Granularity'], ['unit', 'Unit'],
  ['source_reference', 'Source URL'], ['methodology', 'Methodology'],
] as const;
const LONG_FIELDS = [...dimensions, ['metric_id', 'Metric identity'], ['metric_definition', 'Metric definition'], ['value', 'Exact value']] as const;
function parseDelimited(text: string): { rows: string[][]; delimiter: string } {
  const first = text.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const delimiter = [',', ';', '\t', '|'].map((item) => ({ item, count: first.split(item).length })).sort((a, b) => b.count - a.count)[0]?.item ?? ',';
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  return { rows, delimiter };
}

function safeMetricId(header: string): string {
  return header.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 160) || 'metric';
}

function headerFor(field: string, headers: string[]): string | undefined {
  if (field === 'entity_id') {
    const idColumn = headers.find((header) => /(?:^|\b)(?:unified|entity|product|app)\s*id\b/i.test(header.trim()));
    if (idColumn) return idColumn;
  }
  const aliases: Record<string, string[]> = {
    entity_id: ['entity', 'entity_id', 'product', 'app', 'unified name', 'unified id'],
    geo: ['geo', 'country', 'market', 'region'], platform: ['platform', 'os', 'environment'],
    period_start: ['period_start', 'start_date', 'date_start'], period_end: ['period_end', 'end_date', 'date_end'],
    granularity: ['granularity', 'frequency'], unit: ['unit', 'units'],
    source_reference: ['source', 'source_url', 'source_reference', 'url'], methodology: ['methodology', 'method'],
    metric_id: ['metric', 'metric_id', 'metric_name'], metric_definition: ['metric_definition', 'definition'], value: ['value', 'amount', 'count'],
  };
  const aliasesForField = aliases[field] ?? [field];
  return headers.find((header) => aliasesForField.includes(header.trim().toLocaleLowerCase().replace(/_/g, ' ')))
    ?? headers.find((header) => aliasesForField.includes(header.trim().toLocaleLowerCase()));
}

function dateHints(filename: string): { geo?: string; period_start?: string; period_end?: string } {
  const hints: { geo?: string; period_start?: string; period_end?: string } = {};
  if (/\bworldwide\b/i.test(filename)) hints.geo = 'Worldwide';
  const matches = [...filename.matchAll(/(\w{3,9})\s+(\d{1,2}),?\s+(20\d{2})/g)];
  const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12', january: '01', february: '02', march: '03', april: '04', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };
  if (matches.length >= 2) {
    const start = matches[0]; const end = matches[1];
    const startMonth = months[start[1].toLocaleLowerCase()]; const endMonth = months[end[1].toLocaleLowerCase()];
    if (startMonth && endMonth) {
      hints.period_start = `${start[3]}-${startMonth}-${start[2].padStart(2, '0')}`;
      hints.period_end = `${end[3]}-${endMonth}-${end[2].padStart(2, '0')}`;
    }
  }
  return hints;
}

function readLocalFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unsupported file encoding'));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsText(file);
  });
}

export function QuantitativeDatasetImport({ report, onImported }: { report: ImportedReport; onImported: (dataset: QuantitativeDataset) => void }) {
  const [filename, setFilename] = useState(''); const [csvContent, setCsvContent] = useState('');
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({}); const [explicitValues, setExplicitValues] = useState<Record<string, string>>({});
  const [entityMappings, setEntityMappings] = useState<Record<string, string>>({}); const [metricMappings, setMetricMappings] = useState<QuantitativeMetricColumnMapping[]>([]);
  const [preview, setPreview] = useState<QuantitativeDatasetPreview | null>(null); const [busy, setBusy] = useState<'validating' | 'saving' | null>(null);
  const [message, setMessage] = useState(''); const [failure, setFailure] = useState('');
  const { rows, delimiter } = useMemo(() => parseDelimited(csvContent), [csvContent]);
  const headers = rows[0] ?? []; const sampleRows = rows.slice(1, 4); const wide = Boolean(metricMappings.length);
  const hints = dateHints(filename);
  const dataRows = rows.slice(1);
  const metricColumns = headers.filter((header) => !Object.values(fieldMapping).includes(header));
  const unresolved = [...(preview?.ambiguities ?? []), ...(preview?.unmatched_entities ?? [])];

  async function chooseFile(file?: File) {
    setPreview(null); setFailure(''); setMessage(''); setEntityMappings({}); setExplicitValues({}); setMetricMappings([]);
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith('.csv')) { setFailure('Chọn file .csv để tiếp tục.'); return; }
    try {
      const content = await readLocalFile(file); const parsed = parseDelimited(content); const next: Record<string, string> = {};
      for (const [field] of LONG_FIELDS) { const match = headerFor(field, parsed.rows[0] ?? []); if (match && !Object.values(next).includes(match)) next[field] = match; }
      if (!('metric_id' in next) || !('value' in next)) {
        delete next.metric_id; delete next.metric_definition; delete next.value;
        for (const field of ['entity_id', 'platform', 'geo', 'period_start', 'period_end', 'granularity', 'source_reference', 'methodology']) {
          const match = headerFor(field, parsed.rows[0] ?? []); if (match) next[field] = match;
        }
      }
      setFilename(file.name); setCsvContent(content); setFieldMapping(next);
    } catch { setFailure('Không đọc được file. Hãy chọn lại file CSV.'); }
  }

  function input(): QuantitativeDatasetInput {
    return { filename, csv_content: csvContent, field_mapping: fieldMapping, entity_mappings: entityMappings, metric_mappings: metricMappings, explicit_values: explicitValues };
  }
  function setField(field: string, value: string) {
    setFieldMapping((current) => { const next = { ...current }; if (value) next[field] = value; else delete next[field]; return next; });
    setExplicitValues((current) => { const next = { ...current }; delete next[field]; return next; }); setPreview(null);
  }
  function setConstant(field: string, value: string) {
    setExplicitValues((current) => { const next = { ...current }; if (value) next[field] = value; else delete next[field]; return next; });
    setFieldMapping((current) => { const next = { ...current }; delete next[field]; return next; }); setPreview(null);
  }
  function toggleMetric(column: string, enabled: boolean) {
    setMetricMappings((current) => enabled
      ? [...current, { column, metric_id: safeMetricId(column), metric_definition: column, unit: '', methodology: '' }]
      : current.filter((metric) => metric.column !== column));
    setFieldMapping((current) => { const next = { ...current }; delete next.metric_id; delete next.metric_definition; delete next.value; return next; }); setPreview(null);
  }
  function patchMetric(column: string, patch: Partial<QuantitativeMetricColumnMapping>) {
    setMetricMappings((current) => current.map((metric) => metric.column === column ? { ...metric, ...patch } : metric)); setPreview(null);
  }
  async function validate() {
    setBusy('validating'); setFailure(''); setMessage('');
    try { setPreview(await reportApi.previewQuantitativeDataset(report.id, input())); }
    catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Không thể kiểm tra CSV.'); setPreview(null); }
    finally { setBusy(null); }
  }
  async function confirmLink() {
    if (!preview || unresolved.some((item) => !entityMappings[item.csv_value])) return;
    setBusy('saving'); setFailure(''); setMessage('');
    try { const dataset = await reportApi.importQuantitativeDataset(report.id, input()); onImported(dataset); setMessage(dataset.duplicate ? 'Dataset này đã được liên kết trước đó; dữ liệu đã lưu được mở lại.' : 'CSV đã được liên kết với báo cáo này.'); setPreview(null); }
    catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Không thể lưu dataset.'); }
    finally { setBusy(null); }
  }

  return <details className="quant-import-flow">
    <summary>Import CSV</summary>
    <div className="quant-import-steps">
      <section><h4>1. Chọn CSV</h4><label className="quant-file-picker">Chọn file CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event.target.files?.[0])} /></label>{filename && <span className="quant-file-name">{filename}</span>}
        {headers.length > 0 && <div className="quant-preview-table"><strong>Xem trước · {dataRows.length.toLocaleString('vi-VN')} dòng có nội dung · dấu phân cách {delimiter === '\t' ? 'tab' : delimiter}</strong><div className="quant-table-scroll"><table><thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{header || `Column ${index + 1}`}</th>)}</tr></thead><tbody>{sampleRows.map((sample, rowIndex) => <tr key={rowIndex}>{headers.map((_, index) => <td key={index}>{sample[index] ?? ''}</td>)}</tr>)}</tbody></table></div></div>}
      </section>
      {headers.length > 0 && <section><h4>2. Map cột và xác nhận scope</h4><p>Importer nhận diện dấu phân cách và cấu trúc cột; các giá trị GEO/kỳ gợi ý từ tên file chỉ được dùng sau khi bạn xác nhận.</p>
        <div className="quant-map-grid">{dimensions.map(([field, label]) => <label key={field}>{label}<select value={fieldMapping[field] ?? ''} onChange={(event) => setField(field, event.target.value)}><option value="">Không lấy từ cột</option>{headers.map((header, index) => <option key={`${header}-${index}`} value={header}>{header}</option>)}</select>{field === 'entity_id' && <small>Map cột nhận diện entity, ví dụ Unified ID hoặc Unified Name.</small>}</label>)}</div>
        <div className="quant-map-grid">{dimensions.filter(([field]) => !['entity_id', 'source_reference', 'methodology'].includes(field)).map(([field, label]) => <label key={`constant-${field}`}>{label} · giá trị xác nhận<input value={explicitValues[field] ?? ''} disabled={Boolean(fieldMapping[field])} onChange={(event) => setConstant(field, event.target.value)} placeholder={field === 'geo' && hints.geo ? `Gợi ý từ tên file: ${hints.geo}` : field.startsWith('period_') && hints[field as 'period_start' | 'period_end'] ? `Gợi ý từ tên file: ${hints[field as 'period_start' | 'period_end']}` : 'Để trống nếu chưa biết'} /></label>)}</div>
        {(hints.geo || hints.period_start || hints.period_end) && <div className="quant-suggestions"><strong>Gợi ý đọc được từ tên file — cần bạn xác nhận:</strong>{hints.geo && !fieldMapping.geo && <button type="button" className="text-button" onClick={() => setConstant('geo', hints.geo!)}>Dùng GEO: {hints.geo}</button>}{hints.period_start && !fieldMapping.period_start && <button type="button" className="text-button" onClick={() => setConstant('period_start', hints.period_start!)}>Dùng ngày bắt đầu: {hints.period_start}</button>}{hints.period_end && !fieldMapping.period_end && <button type="button" className="text-button" onClick={() => setConstant('period_end', hints.period_end!)}>Dùng ngày kết thúc: {hints.period_end}</button>}</div>}
        {!wide && <div className="quant-map-grid">{(['metric_id', 'metric_definition', 'value'] as const).map((field) => <label key={field}>{field === 'metric_id' ? 'Metric identity' : field === 'metric_definition' ? 'Metric definition' : 'Exact value'}<select value={fieldMapping[field] ?? ''} onChange={(event) => setField(field, event.target.value)}><option value="">Chọn cột…</option>{headers.map((header, index) => <option key={`${header}-${index}`} value={header}>{header}</option>)}</select></label>)}</div>}
        <details className="quant-metric-columns"><summary>{wide ? `${metricMappings.length} metric columns selected` : 'Or map multiple metric columns (wide CSV)'}</summary><p>Chọn cột cần nhập làm quan sát. Tên cột được giữ làm định nghĩa ban đầu; unit và methodology cần khai báo nếu biết. Cột không chọn vẫn được giữ trong CSV gốc.</p>{metricColumns.map((column) => { const selected = metricMappings.find((metric) => metric.column === column); return <div className="quant-metric-row" key={column}><label><input type="checkbox" checked={Boolean(selected)} onChange={(event) => toggleMetric(column, event.target.checked)} />{column}</label>{selected && <><label>Metric identity<input value={selected.metric_id} onChange={(event) => patchMetric(column, { metric_id: event.target.value })} /></label><label>Definition<input value={selected.metric_definition} onChange={(event) => patchMetric(column, { metric_definition: event.target.value })} /></label><label>Unit<input value={selected.unit ?? ''} onChange={(event) => patchMetric(column, { unit: event.target.value })} placeholder="Ví dụ: downloads" /></label><label>Methodology<input value={selected.methodology ?? ''} onChange={(event) => patchMetric(column, { methodology: event.target.value })} placeholder="Nếu được cung cấp" /></label></>}</div>; })}</details>
        <button type="button" className="secondary-action" disabled={busy !== null || (!wide && (!fieldMapping.metric_id || !fieldMapping.value))} onClick={() => void validate()}>{busy === 'validating' ? 'Đang xác thực…' : '3. Kiểm tra dữ liệu'}</button>
      </section>}
      {preview && <section className="quant-validation" aria-live="polite"><h4>Kết quả xác thực · {preview.total_rows.toLocaleString('vi-VN')} observations</h4><div className="quant-readiness-counts"><span>Đầy đủ: <b>{preview.complete_observations}</b></span><span>Đúng scope: <b>{preview.scope_compatible_observations}</b></span><span>Có thể so sánh: <b>{preview.comparison_ready_observations}</b></span><span>Dòng trùng: <b>{preview.duplicate_rows}</b></span></div><p>{preview.compatibility_status === 'compatible' ? 'Phạm vi khớp với báo cáo.' : preview.compatibility_status === 'incompatible' ? 'Không có dòng nào khớp scope báo cáo.' : 'Một phần dữ liệu chưa đầy đủ hoặc cần xem lại.'} Lưu thành công không đồng nghĩa mọi quan sát sẵn sàng phân tích.</p>
        {unresolved.length > 0 && <div className="quant-ambiguities"><strong>Entity chưa khớp — chọn mapping hoặc chủ động để trống</strong>{[...new Map(unresolved.map((item) => [item.csv_value, item])).values()].map((item) => <label key={item.csv_value}>{item.csv_value}<select value={entityMappings[item.csv_value] ?? ''} onChange={(event) => { setEntityMappings((current) => ({ ...current, [item.csv_value]: event.target.value })); setPreview(null); }}><option value="">Chọn…</option><option value="__unmapped__">Để trống entity (sẽ không dùng để so sánh)</option>{report.research_data.entities.filter((entity) => !item.candidates.length || item.candidates.includes(entity.key)).map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}</select></label>)}</div>}
        <details className="quant-row-details"><summary>Xem observations và lý do validation</summary><div className="quant-table-scroll"><table><thead><tr><th>Metric</th><th>Value</th><th>Entity</th><th>GEO / Platform</th><th>Readiness</th><th>Validation</th></tr></thead><tbody>{preview.observations.map((observation, index) => <tr key={`${index}-${observation.metric_id}`}><td>{observation.metric_definition || observation.metric_id || 'Unknown metric'}</td><td>{observation.value ?? 'Unknown'} {observation.unit ?? ''}</td><td>{report.research_data.entities.find((entity) => entity.key === observation.entity_id)?.name ?? 'Not mapped'}</td><td>{observation.geo ?? 'GEO missing'} / {observation.platform ?? 'Platform missing'}</td><td>{observation.comparison_ready ? 'Ready for pair check' : observation.scope_compatible === false ? 'Scope mismatch' : 'Incomplete'}</td><td>{observation.validation_reasons.length ? observation.validation_reasons.join(' ') : 'No validation issues detected'}</td></tr>)}</tbody></table></div></details>
        <button type="button" className="primary-action" disabled={busy !== null || unresolved.some((item) => !entityMappings[item.csv_value])} onClick={() => void confirmLink()}>{busy === 'saving' ? 'Đang lưu dataset…' : '4. Xác nhận liên kết với báo cáo này'}</button>
      </section>}
      {failure && <div className="research-alert" role="alert">{failure}</div>}{message && <div className="research-success" role="status">{message}</div>}
      <p className="quant-import-note">Không tải file lên trước khi bạn xác thực. CSV gốc được giữ cùng provenance; dữ liệu chỉ liên kết với báo cáo hiện tại sau xác nhận.</p>
    </div>
  </details>;
}
