import { useMemo, useState } from 'react';
import { reportApi, type ImportedReport, type QuantitativeDataset, type QuantitativeDatasetInput, type QuantitativeDatasetPreview } from './api';

const fields = [
  ['metric_id', 'Metric identity'], ['metric_definition', 'Metric definition'], ['value', 'Exact value'], ['unit', 'Unit'],
  ['entity_id', 'Entity'], ['geo', 'GEO'], ['platform', 'Platform'], ['period_start', 'Period start'],
  ['period_end', 'Period end'], ['granularity', 'Granularity'], ['source_reference', 'Source URL'], ['methodology', 'Methodology'],
] as const;

function parseCsvPreview(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}

function suggestedHeader(field: string, header: string): boolean {
  const value = header.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_');
  const aliases: Record<string, string[]> = {
    metric_id: ['metric', 'metric_id', 'metric_name'], metric_definition: ['metric_definition', 'definition'], value: ['value', 'amount', 'count'],
    unit: ['unit', 'units'], entity_id: ['entity', 'entity_id', 'product', 'app'], geo: ['geo', 'country', 'market', 'region'],
    platform: ['platform', 'os', 'environment'], period_start: ['period_start', 'start_date', 'date_start'], period_end: ['period_end', 'end_date', 'date_end'],
    granularity: ['granularity', 'period', 'frequency'], source_reference: ['source', 'source_url', 'source_reference', 'url'], methodology: ['methodology', 'method'],
  };
  return aliases[field]?.includes(value) ?? false;
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
  const [filename, setFilename] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [entityMappings, setEntityMappings] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<QuantitativeDatasetPreview | null>(null);
  const [busy, setBusy] = useState<'validating' | 'saving' | null>(null);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const rows = useMemo(() => parseCsvPreview(csvContent), [csvContent]);
  const headers = rows[0] ?? [];
  const sampleRows = rows.slice(1, 4);

  async function chooseFile(file?: File) {
    setPreview(null); setFailure(''); setMessage(''); setEntityMappings({});
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith('.csv')) { setFailure('Chọn file .csv để tiếp tục.'); return; }
    try {
      const content = await readLocalFile(file);
      setFilename(file.name); setCsvContent(content);
      const parsed = parseCsvPreview(content);
      const next: Record<string, string> = {};
      for (const [field] of fields) {
        const match = (parsed[0] ?? []).find((header) => suggestedHeader(field, header));
        if (match && !Object.values(next).includes(match)) next[field] = match;
      }
      setFieldMapping(next);
    } catch { setFailure('Không đọc được file. Hãy chọn lại file CSV.'); }
  }

  function input() { return { filename, csv_content: csvContent, field_mapping: fieldMapping, entity_mappings: entityMappings } satisfies QuantitativeDatasetInput; }

  async function validate() {
    setBusy('validating'); setFailure(''); setMessage('');
    try { setPreview(await reportApi.previewQuantitativeDataset(report.id, input())); }
    catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Không thể kiểm tra CSV.'); setPreview(null); }
    finally { setBusy(null); }
  }

  async function confirmLink() {
    if (!preview || preview.ambiguities.some((item) => !entityMappings[item.csv_value])) return;
    setBusy('saving'); setFailure(''); setMessage('');
    try {
      const dataset = await reportApi.importQuantitativeDataset(report.id, input());
      onImported(dataset);
      setMessage(dataset.duplicate ? 'Dataset này đã được liên kết trước đó; đang hiển thị dữ liệu đã lưu.' : 'CSV đã được liên kết với báo cáo này.');
      setPreview(null);
    } catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Không thể lưu dataset.'); }
    finally { setBusy(null); }
  }

  return <details className="quant-import-flow">
    <summary>Import CSV</summary>
    <div className="quant-import-steps">
      <section><h4>1. Chọn CSV</h4><label className="quant-file-picker">Chọn file CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event.target.files?.[0])} /></label>{filename && <span className="quant-file-name">{filename}</span>}
        {headers.length > 0 && <div className="quant-preview-table"><strong>Xem trước · {Math.max(rows.length - 1, 0)} dòng có nội dung</strong><div className="quant-table-scroll"><table><thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{header || `Column ${index + 1}`}</th>)}</tr></thead><tbody>{sampleRows.map((sample, rowIndex) => <tr key={rowIndex}>{headers.map((_, index) => <td key={index}>{sample[index] ?? ''}</td>)}</tr>)}</tbody></table></div></div>}
      </section>
      {headers.length > 0 && <section><h4>2. Map cột</h4><p>Kiểm tra từng ánh xạ trước khi gửi bản xem trước để xác thực.</p><div className="quant-map-grid">{fields.map(([field, label]) => <label key={field}>{label}<select value={fieldMapping[field] ?? ''} onChange={(event) => { setFieldMapping((current) => ({ ...current, [field]: event.target.value })); setPreview(null); }}><option value="">Chưa map</option>{headers.map((header, index) => <option key={`${header}-${index}`} value={header}>{header || `Column ${index + 1}`}</option>)}</select></label>)}</div><button type="button" className="secondary-action" disabled={busy !== null || !fieldMapping.metric_id || !fieldMapping.value} onClick={() => void validate()}>{busy === 'validating' ? 'Đang xác thực…' : '3. Kiểm tra dữ liệu'}</button></section>}
      {preview && <section className="quant-validation" aria-live="polite"><h4>Kết quả xác thực · {preview.total_rows} dòng</h4><div className="quant-readiness-counts"><span>Đầy đủ: <b>{preview.complete_observations}</b></span><span>Đúng scope: <b>{preview.scope_compatible_observations}</b></span><span>Có thể so sánh: <b>{preview.comparison_ready_observations}</b></span><span>Dòng trùng: <b>{preview.duplicate_rows}</b></span></div>
        <p>{preview.compatibility_status === 'compatible' ? 'Phạm vi khớp với báo cáo.' : preview.compatibility_status === 'incompatible' ? 'Không có dòng nào khớp scope báo cáo.' : 'Một phần dữ liệu chưa đầy đủ hoặc cần xem lại.'} Import thành công chỉ xác nhận lưu CSV; không đồng nghĩa mọi dòng sẵn sàng phân tích.</p>
        {preview.ambiguities.length > 0 && <div className="quant-ambiguities"><strong>Chọn entity cho các tên chưa rõ</strong>{[...new Map(preview.ambiguities.map((item) => [item.csv_value, item])).values()].map((item) => <label key={item.csv_value}>{item.csv_value}<select value={entityMappings[item.csv_value] ?? ''} onChange={(event) => { setEntityMappings((current) => ({ ...current, [item.csv_value]: event.target.value })); setPreview(null); }}><option value="">Chọn entity…</option>{report.research_data.entities.filter((entity) => item.candidates.includes(entity.key)).map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}</select></label>)}</div>}
        <details className="quant-row-details"><summary>Xem từng dòng và lý do</summary><div className="quant-table-scroll"><table><thead><tr><th>Metric</th><th>Value</th><th>Entity</th><th>GEO / Platform</th><th>Readiness</th><th>Validation</th></tr></thead><tbody>{preview.observations.map((observation, index) => <tr key={`${index}-${observation.metric_id}`}><td>{observation.metric_definition || observation.metric_id || 'Unknown metric'}</td><td>{observation.value ?? 'Unknown'} {observation.unit ?? ''}</td><td>{report.research_data.entities.find((entity) => entity.key === observation.entity_id)?.name ?? 'Not mapped'}</td><td>{observation.geo ?? 'GEO missing'} / {observation.platform ?? 'Platform missing'}</td><td>{observation.comparison_ready ? 'Ready for comparison check' : observation.scope_compatible === false ? 'Scope mismatch' : 'Incomplete'}</td><td>{observation.validation_reasons.length ? observation.validation_reasons.join(' ') : 'No validation issues detected'}</td></tr>)}</tbody></table></div></details>
        <button type="button" className="primary-action" disabled={busy !== null || preview.ambiguities.some((item) => !entityMappings[item.csv_value])} onClick={() => void confirmLink()}>{busy === 'saving' ? 'Đang lưu dataset…' : '4. Xác nhận liên kết với báo cáo này'}</button>
      </section>}
      {failure && <div className="research-alert" role="alert">{failure}</div>}{message && <div className="research-success" role="status">{message}</div>}
      <p className="quant-import-note">CSV chỉ được gửi để xác thực khi bạn bấm “Kiểm tra dữ liệu”, và chỉ được lưu/liên kết sau bước xác nhận cuối. File gốc được giữ nguyên trong workspace cục bộ.</p>
    </div>
  </details>;
}
