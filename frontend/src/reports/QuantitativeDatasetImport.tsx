import { DatasetMetadataReview } from './DatasetMetadataReview';
import { canonicalCsvIdentityBytes } from './csvIdentity';
import { useMemo, useRef, useState } from 'react';
import { reportApi, type ImportedReport, type QuantitativeDataset, type QuantitativeDatasetInput, type QuantitativeDatasetPreview, type QuantitativeMetricColumnMapping } from './api';

const dimensions = [
  ['entity_id', 'Ứng dụng (ID / tên)'], ['geo', 'GEO'], ['platform', 'Platform'], ['snapshot_date', 'Snapshot date'],
  ['period_start', 'Period start'], ['period_end', 'Period end'], ['granularity', 'Granularity'], ['unit', 'Unit'],
  ['source_reference', 'Source URL'], ['methodology', 'Methodology'],
] as const;
const LONG_FIELDS = [...dimensions, ['metric_id', 'Metric identity'], ['metric_definition', 'Metric definition'], ['value', 'Exact value']] as const;
type EntityMappingRequirement = { csv_value: string; csv_name?: string | null; row: number; candidates: string[] };
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

function sensorTowerMetric(header: string): QuantitativeMetricColumnMapping | undefined {
  const value = header.trim().toLocaleLowerCase();
  const percent = /%|percent|percentage|\bpct\b/.test(value);
  let metric_id: string | undefined;
  let unit: string | undefined;
  if (/\bdownloads\b/.test(value) && /\byoy\b/.test(value)) {
    metric_id = percent ? 'downloads_yoy_growth_percent' : 'downloads_yoy_growth_absolute';
    unit = percent ? '%' : 'downloads';
  } else if (/\bdownloads\b/.test(value) && /\babsolute\b/.test(value)) {
    metric_id = 'downloads_absolute'; unit = 'downloads';
  } else if (/\brevenue\b/.test(value) && /\byoy\b/.test(value)) {
    metric_id = percent ? 'revenue_yoy_growth_percent' : 'revenue_yoy_growth_absolute';
    unit = percent ? '%' : '';
  } else if (/\brevenue\b/.test(value) && /\babsolute\b/.test(value)) {
    metric_id = 'revenue_absolute'; unit = '';
  } else if (/\bdau\b/.test(value) && /\byoy\b/.test(value)) {
    metric_id = percent ? 'dau_yoy_growth_percent' : 'dau_yoy_growth_absolute';
    unit = percent ? '%' : 'users';
  } else if (/\bdau\b/.test(value) && /\babsolute\b/.test(value)) {
    metric_id = 'dau_absolute'; unit = 'users';
  }
  return metric_id ? { column: header, metric_id, metric_definition: header, unit, methodology: '' } : undefined;
}

function semanticHeader(field: string, header: string): boolean {
  const normalized = header.trim().toLocaleLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
  const patterns: Record<string, RegExp> = {
    entity_id: /^(?:(?:unified|entity|product|app) id|entity|product|app)$/,
    entity_name: /^(?:(?:unified|entity|product|app) name)$/,
    geo: /^(?:geo|country|market|region)$/,
    platform: /^(?:platform|os|environment)$/,
    period_start: /^(?:period start|start date|date start|start)$/,
    period_end: /^(?:period end|end date|date end|end)$/,
    snapshot_date: /^(?:snapshot date|date|as of date|as of)$/,
    granularity: /^(?:granularity|frequency|period)$/,
    unit: /^(?:unit|units)$/,
    source_reference: /^(?:source|source url|source reference|url)$/,
    methodology: /^(?:methodology|method)$/,
    metric_id: /^(?:metric|metric id|metric name)$/,
    metric_definition: /^(?:metric definition|definition)$/,
    value: /^(?:value|amount|count)$/,
  };
  return patterns[field]?.test(normalized) ?? false;
}

function headerFor(field: string, headers: string[]): string | undefined {
  if (field === 'entity_id') {
    const idColumn = headers.find((header) => semanticHeader(field, header) && /\bid\b/i.test(header.trim()));
    if (idColumn) return idColumn;
  }
  const aliases: Record<string, string[]> = {
    entity_id: ['entity', 'entity_id', 'product', 'app', 'unified id', 'entity id', 'product id', 'app id'],
    geo: ['geo', 'country', 'market', 'region'], platform: ['platform', 'os', 'environment'],
    period_start: ['period_start', 'start_date', 'date_start'], period_end: ['period_end', 'end_date', 'date_end'],
    snapshot_date: ['snapshot_date', 'snapshot date', 'date', 'as of date'],
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
  const isoDates = [...filename.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  if (isoDates.length >= 2) {
    hints.period_start = isoDates[0];
    hints.period_end = isoDates[1];
    return hints;
  }
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
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) { reject(new Error('Unsupported file encoding')); return; }
      try {
        const bytes = new Uint8Array(reader.result);
        const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
        // TextDecoder normally consumes a UTF-8 BOM. Keep it in the stored CSV
        // text so the payload hash and original_csv still describe the source
        // bytes; parseDelimited removes it only from the first header cell.
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(reader.result);
        resolve(hasUtf8Bom && !decoded.startsWith('\ufeff') ? `\ufeff${decoded}` : decoded);
      } catch { reject(new Error('Unsupported file encoding')); }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    // Read bytes so decoding cannot silently remove the source UTF-8 BOM.
    reader.readAsArrayBuffer(file);
  });
}

export function QuantitativeDatasetImport({ report, projectId, onImported }: { report?: ImportedReport; projectId?: string; onImported: (dataset: QuantitativeDataset) => void }) {
  const [existing, setExisting] = useState<QuantitativeDataset | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const fileRevision = useRef(0);
  const [filename, setFilename] = useState(''); const [csvContent, setCsvContent] = useState('');
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({}); const [explicitValues, setExplicitValues] = useState<Record<string, string>>({});
  const [entityMappings, setEntityMappings] = useState<Record<string, string>>({}); const [metricMappings, setMetricMappings] = useState<QuantitativeMetricColumnMapping[]>([]);
  const [mappingRequirements, setMappingRequirements] = useState<EntityMappingRequirement[]>([]);
  const [preview, setPreview] = useState<QuantitativeDatasetPreview | null>(null); const [busy, setBusy] = useState<'validating' | 'saving' | null>(null);
  const [message, setMessage] = useState(''); const [failure, setFailure] = useState('');
  const validationRevision = useRef(0);
  const [validatedInputKey, setValidatedInputKey] = useState('');
  const { rows, delimiter } = useMemo(() => parseDelimited(csvContent), [csvContent]);
  const headers = rows[0] ?? []; const sampleRows = rows.slice(1, 4); const wide = Boolean(metricMappings.length);
  const hints = dateHints(filename);
  const dataRows = rows.slice(1);
  const metricColumns = headers.filter((header) => !Object.values(fieldMapping).includes(header)
    && !['entity_id', 'entity_name', 'geo', 'platform', 'period_start', 'period_end', 'snapshot_date', 'granularity', 'unit', 'source_reference', 'methodology'].some((field) => semanticHeader(field, header))
    && !/^(?:category|all title|publisher id|publisher name)$/i.test(header.trim()));
  const unresolved = mappingRequirements;
  const scopeMismatchReasons = [...new Set((preview?.validation_reasons ?? []).filter((reason) => /^(?:GEO '.+ differs from report scope|Platform '.+ differs from report scope)/.test(reason)))].slice(0, 2);

  function invalidatePreview() {
    validationRevision.current += 1;
    setPreview(null);
    setValidatedInputKey('');
    setBusy((current) => current === 'validating' ? null : current);
  }

  async function chooseFile(file?: File) {
    const chosenRevision = ++fileRevision.current; setExisting(null); setReviewOpen(false);
    invalidatePreview(); setMappingRequirements([]); setFailure(''); setMessage(''); setEntityMappings({}); setExplicitValues({}); setMetricMappings([]);
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith('.csv')) { setFailure('Chọn file .csv để tiếp tục.'); return; }
    try {
      const content = await readLocalFile(file); const parsed = parseDelimited(content); const next: Record<string, string> = {};
      const fileHeaders = parsed.rows[0] ?? [];
      for (const [field] of LONG_FIELDS) {
        const match = headerFor(field, fileHeaders);
        if (match && !Object.values(next).includes(match) && semanticHeader(field, match)) next[field] = match;
      }
      const entityName = fileHeaders.find((header) => /^(?:unified|entity|product|app)\s*name$/i.test(header.trim()));
      if (entityName && entityName !== next.entity_id) next.entity_name = entityName;
      const autoMetrics = fileHeaders.filter((header) => !Object.values(next).includes(header)).map(sensorTowerMetric).filter((item): item is QuantitativeMetricColumnMapping => Boolean(item));
      const uniqueMetricMappings = autoMetrics.map((item, index) => autoMetrics.findIndex((candidate) => candidate.metric_id === item.metric_id) === index ? item : { ...item, metric_id: `${item.metric_id}_${safeMetricId(item.column)}` });
      if (!('metric_id' in next) || !('value' in next)) {
        delete next.metric_id; delete next.metric_definition; delete next.value;
        for (const field of ['entity_id', 'platform', 'geo', 'snapshot_date', 'period_start', 'period_end', 'granularity', 'source_reference', 'methodology']) {
          const match = headerFor(field, fileHeaders); if (match && semanticHeader(field, match)) next[field] = match;
        }
        if (entityName && entityName !== next.entity_id) next.entity_name = entityName;
      }
      if (chosenRevision !== fileRevision.current) return;
      const explicitPeriodMeaning = next.period_start && next.period_end ? 'reporting_interval' : 'unknown';
      setFilename(file.name); setCsvContent(content); setFieldMapping(next); setMetricMappings(uniqueMetricMappings);
      setExplicitValues((current) => ({ ...current, period_semantics: explicitPeriodMeaning }));
      if (globalThis.crypto?.subtle) {
        try {
          const bytes = canonicalCsvIdentityBytes(content);
          const hash = await crypto.subtle.digest('SHA-256', bytes);
          const digest = Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
          if (!report) return;
          const duplicate = await reportApi.findQuantitativeDataset(report.id, digest);
          if (chosenRevision !== fileRevision.current) return;
          setExisting(duplicate);
        } catch {
          // A lookup outage must not discard the local file or block preview.
          // The backend duplicate check still runs when the user confirms import.
        }
      }
    } catch { setFailure('Không đọc được file. Hãy chọn lại file CSV.'); }
  }

  function input(): QuantitativeDatasetInput {
    return { filename, csv_content: csvContent, field_mapping: fieldMapping, entity_mappings: entityMappings, metric_mappings: metricMappings, explicit_values: explicitValues };
  }
  function setField(field: string, value: string) {
    if (field === 'entity_id') {
      setFieldMapping((current) => {
        const next = { ...current };
        delete next.entity_id; delete next.entity_name;
        if (value && semanticHeader('entity_name', value)) next.entity_name = value;
        else if (value) next.entity_id = value;
        return next;
      });
      setExplicitValues((current) => { const next = { ...current }; delete next.entity_id; delete next.entity_name; return next; });
      invalidatePreview();
      return;
    }
    setFieldMapping((current) => { const next = { ...current }; if (value) next[field] = value; else delete next[field]; return next; });
    setExplicitValues((current) => { const next = { ...current }; delete next[field]; return next; }); invalidatePreview();
  }
  function setConstant(field: string, value: string) {
    setExplicitValues((current) => {
      const next = { ...current };
      if (value) next[field] = value; else delete next[field];
      if (field === 'period_start' || field === 'period_end') {
        if (next.period_start && next.period_end) next.period_semantics = 'reporting_interval';
        else if (next.period_semantics === 'reporting_interval') next.period_semantics = 'unknown';
        if (value) delete next.snapshot_date;
      }
      if (field === 'snapshot_date' && value) next.period_semantics = 'snapshot';
      return next;
    });
    setFieldMapping((current) => { const next = { ...current }; delete next[field]; if ((field === 'period_start' || field === 'period_end') && value) delete next.snapshot_date; return next; }); invalidatePreview();
  }
  function setPeriodSemantics(value: string) {
    setExplicitValues((current) => {
      const next: Record<string, string> = { ...current, period_semantics: value };
      if (value === 'snapshot') { delete next.period_start; delete next.period_end; }
      if (value === 'reporting_interval' || value === 'rolling_interval') delete next.snapshot_date;
      return next;
    });
    setFieldMapping((current) => {
      const next = { ...current };
      if (value === 'snapshot') { delete next.period_start; delete next.period_end; }
      if (value === 'reporting_interval' || value === 'rolling_interval') delete next.snapshot_date;
      return next;
    });
    invalidatePreview();
  }
  function toggleMetric(column: string, enabled: boolean) {
    setMetricMappings((current) => enabled
      ? [...current, { column, metric_id: safeMetricId(column), metric_definition: column, unit: '', methodology: '' }]
      : current.filter((metric) => metric.column !== column));
    setFieldMapping((current) => { const next = { ...current }; delete next.metric_id; delete next.metric_definition; delete next.value; return next; }); invalidatePreview();
  }
  function patchMetric(column: string, patch: Partial<QuantitativeMetricColumnMapping>) {
    setMetricMappings((current) => current.map((metric) => metric.column === column ? { ...metric, ...patch } : metric)); invalidatePreview();
  }
  async function validate() {
    const metricIds = metricMappings.map((item) => item.metric_id.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
    if (metricIds.some((metricId, index) => !metricId || metricIds.indexOf(metricId) !== index)) {
      setFailure('Mỗi metric cần một Metric identity riêng. Giữ ID tăng trưởng tuyệt đối và tăng trưởng % khác nhau.');
      return;
    }
    const requestRevision = ++validationRevision.current;
    const requestInput = input();
    setBusy('validating'); setFailure(''); setMessage('');
    try {
      const result = report
        ? await reportApi.previewQuantitativeDataset(report.id, requestInput)
        : await reportApi.previewProjectQuantitativeDataset(projectId!, requestInput);
      if (requestRevision !== validationRevision.current) return;
      const requirements = [...result.ambiguities, ...(result.unmatched_entities ?? [])];
      setMappingRequirements([...new Map(requirements.map((item) => [item.csv_value, item])).values()]);
      setPreview(result);
      setValidatedInputKey(JSON.stringify(requestInput));
    } catch (reason) {
      if (requestRevision === validationRevision.current) {
        const detail = reason instanceof Error ? reason.message : 'Không thể kiểm tra CSV.';
        setFailure(/unsupported mapped field\(s\):\s*entity_name/i.test(detail)
          ? 'Backend đang chạy phiên bản cũ nên chưa nhận cột tên ứng dụng. Chưa có dữ liệu nào được nhập. Hãy đóng các cửa sổ/terminal PO Hub đang chạy, mở lại run.bat từ checkout nhánh feat/ux-recovery-01-research-results rồi bấm “3. Xem thử dữ liệu” lần nữa.'
          : detail);
        setPreview(null);
      }
    } finally { if (requestRevision === validationRevision.current) setBusy(null); }
  }
  async function confirmLink() {
    if (!preview || validatedInputKey !== JSON.stringify(input()) || unresolved.length > 0 || busy !== null) return;
    setBusy('saving'); setFailure(''); setMessage('');
    try { const dataset = report
      ? await reportApi.importQuantitativeDataset(report.id, input())
      : await reportApi.importProjectQuantitativeDataset(projectId!, input());
      onImported(dataset); setExisting(dataset.duplicate ? dataset : null); setMessage(dataset.duplicate ? 'File này đã có trong workspace; dữ liệu đã lưu được mở lại.' : report ? 'CSV đã được liên kết với báo cáo này.' : 'CSV đã được lưu trong workspace.'); setPreview(null); }
    catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Không thể lưu dataset.'); }
    finally { setBusy(null); }
  }

  return <details className="quant-import-flow">
    <summary>Nhập CSV · chọn file → kiểm tra → {report ? 'lưu vào báo cáo' : 'lưu vào workspace'}</summary>
    <div className="quant-import-steps">
      <p className="quant-import-purpose">Mục đích: {report ? 'lưu các chỉ số trong CSV vào báo cáo này để xem và so sánh.' : 'lưu CSV vào workspace để khám phá và so sánh trước khi có báo cáo ChatGPT.'} Bước 3 chỉ xem thử; chỉ bước 4 mới lưu. File CSV gốc được giữ nguyên.</p>
      <section><h4>1. Chọn file CSV</h4><label className="quant-file-picker">Chọn file CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event.target.files?.[0])} /></label>{filename && <span className="quant-file-name">{filename}</span>}
        {headers.length > 0 && !existing && <div className="quant-preview-table"><strong>Xem nhanh · {dataRows.length.toLocaleString('vi-VN')} dòng có dữ liệu · dấu phân cách {delimiter === '\t' ? 'tab' : delimiter}</strong><div className="quant-table-scroll"><table style={headers.length > 8 ? { minWidth: `${headers.length * 96}px` } : undefined}><thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`} style={{ whiteSpace: 'nowrap' }}>{header || `Column ${index + 1}`}</th>)}</tr></thead><tbody>{sampleRows.map((sample, rowIndex) => <tr key={rowIndex}>{headers.map((_, index) => <td key={index} style={{ whiteSpace: index === 0 ? 'normal' : 'nowrap' }}>{sample[index] ?? ''}</td>)}</tr>)}</tbody></table></div><small>Đang hiển thị {sampleRows.length} dòng đầu trong tổng số {dataRows.length}. Đây chỉ là mẫu xem nhanh.</small></div>}
      </section>
      {headers.length > 0 && !existing && <section><h4>2. Nhận diện dữ liệu và kiểm tra mapping</h4><p>ID/tên từ CSV được giữ làm danh tính nguồn. {report ? 'App khớp rõ ràng với report được liên kết; app không có trong report vẫn hợp lệ ở cấp dataset và không cần thao tác thủ công.' : 'CSV được lưu độc lập với mọi báo cáo; tên và ID nguồn được giữ nguyên.'} Chỉ ID/tên mâu thuẫn hoặc nhiều kết quả mới cần review.</p>
        <div className="quant-auto-summary" role="status">{fieldMapping.entity_id && fieldMapping.entity_name ? `Source identity: ID ${fieldMapping.entity_id} · name ${fieldMapping.entity_name}` : fieldMapping.entity_id ? `Source identity column: ${fieldMapping.entity_id}` : fieldMapping.entity_name ? `Source name column: ${fieldMapping.entity_name}` : 'Choose an ID or name column to preserve each source app'}{fieldMapping.geo ? ` · GEO: ${fieldMapping.geo}` : ''}{fieldMapping.platform ? ` · Platform: ${fieldMapping.platform}` : ''}{metricMappings.length ? ` · ${metricMappings.length} metric columns recognized` : ''}</div>
        <div className="quant-map-grid">{dimensions.map(([field, label]) => <label key={field}>{label}<select value={field === 'entity_id' ? (fieldMapping.entity_id || fieldMapping.entity_name || '') : (fieldMapping[field] ?? '')} onChange={(event) => setField(field, event.target.value)}><option value="">Không lấy từ cột</option>{headers.filter((header) => field === 'entity_id' ? semanticHeader('entity_id', header) || semanticHeader('entity_name', header) : semanticHeader(field, header)).map((header, index) => <option key={`${header}-${index}`} value={header}>{header}</option>)}</select>{field === 'entity_id' && <small>Giữ source ID ổn định; chỉ liên kết report khi khớp chính xác, không mơ hồ. App còn lại là source-only.</small>}</label>)}</div>
        <label className="quant-period-semantics">Ý nghĩa của ngày / kỳ<select value={explicitValues.period_semantics ?? 'unknown'} onChange={(event) => setPeriodSemantics(event.target.value)}><option value="unknown">Chưa xác nhận</option><option value="snapshot">Ngày snapshot (một thời điểm)</option><option value="reporting_interval">Khoảng báo cáo</option><option value="rolling_interval">Khoảng trượt</option></select><small>Cột Date được giữ nguyên như giá trị ngày. Hãy xác nhận đó là ngày snapshot hay mốc thuộc một khoảng đo; không suy ra kỳ từ tên file.</small></label>
        <div className="quant-map-grid">{dimensions.filter(([field]) => !['entity_id', 'source_reference', 'methodology'].includes(field)).map(([field, label]) => <label key={`constant-${field}`}>{label} · giá trị xác nhận<input value={explicitValues[field] ?? ''} disabled={Boolean(fieldMapping[field])} onChange={(event) => setConstant(field, event.target.value)} placeholder={field === 'geo' && hints.geo ? `Gợi ý từ tên file: ${hints.geo}` : field.startsWith('period_') && hints[field as 'period_start' | 'period_end'] ? `Gợi ý từ tên file: ${hints[field as 'period_start' | 'period_end']}` : 'Để trống nếu chưa biết'} /></label>)}</div>
        {(hints.geo || hints.period_start || hints.period_end) && <div className="quant-suggestions"><strong>Gợi ý scope từ tên file — chỉ dùng sau khi bạn xác nhận:</strong>{hints.geo && !fieldMapping.geo && !explicitValues.geo && <button type="button" className="text-button" onClick={() => setConstant('geo', hints.geo!)}>Xác nhận GEO: {hints.geo}</button>}{hints.period_start && !fieldMapping.period_start && !explicitValues.period_start && <button type="button" className="text-button" onClick={() => setConstant('period_start', hints.period_start!)}>Xác nhận ngày bắt đầu: {hints.period_start}</button>}{hints.period_end && !fieldMapping.period_end && !explicitValues.period_end && <button type="button" className="text-button" onClick={() => setConstant('period_end', hints.period_end!)}>Xác nhận ngày kết thúc: {hints.period_end}</button>}</div>}
        {!wide && <div className="quant-map-grid">{(['metric_id', 'metric_definition', 'value'] as const).map((field) => <label key={field}>{field === 'metric_id' ? 'Metric identity' : field === 'metric_definition' ? 'Metric definition' : 'Exact value'}<select value={fieldMapping[field] ?? ''} onChange={(event) => setField(field, event.target.value)}><option value="">Chọn cột…</option>{headers.filter((header) => semanticHeader(field, header)).map((header, index) => <option key={`${header}-${index}`} value={header}>{header}</option>)}</select></label>)}</div>}
        <details className="quant-metric-columns"><summary>{wide ? `${metricMappings.length} cột chỉ số được chọn` : 'Chọn thêm cột chỉ số'}</summary><p>Chỉ chọn cột chứa số đo. Ngày, tên/ID app, danh mục và nhà phát hành là thông tin mô tả, không phải chỉ số. Các cột này vẫn nằm trong CSV gốc.</p>{metricColumns.map((column) => { const selected = metricMappings.find((metric) => metric.column === column); return <div className="quant-metric-row" key={column}><label><input type="checkbox" checked={Boolean(selected)} onChange={(event) => toggleMetric(column, event.target.checked)} />{column}</label>{selected && <><label>Metric identity<input value={selected.metric_id} onChange={(event) => patchMetric(column, { metric_id: event.target.value })} /></label><label>Definition<input value={selected.metric_definition} onChange={(event) => patchMetric(column, { metric_definition: event.target.value })} /></label><label>Unit<input value={selected.unit ?? ''} onChange={(event) => patchMetric(column, { unit: event.target.value })} placeholder="Ví dụ: downloads hoặc %" /></label><label>Methodology<input value={selected.methodology ?? ''} onChange={(event) => patchMetric(column, { methodology: event.target.value })} placeholder="Nếu được cung cấp" /></label></>}</div>; })}</details>
        <button type="button" className="secondary-action" disabled={busy !== null || (!wide && (!fieldMapping.metric_id || !fieldMapping.value)) || (!fieldMapping.entity_id && !fieldMapping.entity_name)} onClick={() => void validate()}>{busy === 'validating' ? 'Đang kiểm tra…' : '3. Xem thử dữ liệu'}</button>
      </section>}
      {preview && !existing && <section className="quant-validation" aria-live="polite"><h4>Preview · {preview.total_rows.toLocaleString('vi-VN')} measurements from {preview.source_apps ?? 0} source apps</h4><div className="quant-readiness-counts"><span>Matched to report: <b>{preview.matched_entities ?? 0}</b></span><span>Source-only: <b>{preview.source_only_entities ?? 0}</b></span><span>Source-valid: <b>{preview.dataset_analysis_ready_observations ?? preview.complete_observations}</b></span>{report && <span>Report-compatible: <b>{preview.report_compatible_observations ?? preview.scope_compatible_observations}</b></span>}<span>Comparison candidates · require peers: <b>{preview.dataset_comparison_ready_observations ?? 0}</b></span><span>Incomplete: <b>{preview.total_rows - preview.complete_observations}</b></span><span>Duplicate measurements: <b>{preview.duplicate_rows}</b></span></div><p>{report ? (preview.compatibility_status === 'compatible' ? 'Dataset scope is compatible with the report.' : preview.compatibility_status === 'incompatible' ? 'Measurements remain available in their original dataset scope; comparison with this report is blocked.' : 'Dataset contains mixed or incomplete coverage. Each valid metric remains available in the explorer.') : (preview.compatibility_status === 'compatible' ? 'Dataset is usable within its own stated scope; no report scope has been applied.' : 'Dataset contains mixed or incomplete coverage. Each valid metric remains available with its original scope.')} Bước này chưa lưu gì. Sau khi kiểm tra bảng bên dưới, confirm to save the original CSV and measurements.</p>
        {scopeMismatchReasons.length > 0 && <p className="quant-scope-warning">Phạm vi không khớp: {scopeMismatchReasons.join(' ')} {scopeMismatchReasons.some((reason) => reason.startsWith('Platform ')) && 'Platform Unified được giữ nguyên; ứng dụng không tự đổi thành Android hoặc iOS.'}</p>}
        <details className="quant-row-details"><summary>Inspect preview measurements</summary><div className="quant-table-scroll"><table><thead><tr><th>Metric</th><th>Value</th><th>Entity</th><th>GEO / Platform</th><th>Readiness</th><th>Validation</th></tr></thead><tbody>{preview.observations.map((observation, index) => <tr key={`${index}-${observation.metric_id}`}><td>{observation.metric_definition || observation.metric_id || 'Unknown metric'}</td><td>{observation.value ?? 'Unknown'} {observation.unit ?? ''}</td><td>{`${observation.source_entity_name || observation.source_entity_id || 'Identity missing'} · ${observation.entity_resolution_state === 'matched' ? 'Matched' : observation.entity_resolution_state === 'source_only' ? 'Source-only' : 'Needs review'}`}</td><td>{observation.geo ?? 'GEO missing'} / {observation.platform ?? 'Platform missing'}</td><td>{observation.analysis_ready ? 'Ready for dataset analysis' : 'Incomplete'}</td><td>{[...(observation.source_validation_reasons ?? []), ...(observation.report_compatibility_reasons ?? [])].join(' ') || 'No validation issues detected'}</td></tr>)}</tbody></table></div></details>
        {unresolved.length === 0 && <button type="button" className="primary-action" disabled={busy !== null || !preview || validatedInputKey !== JSON.stringify(input())} onClick={() => void confirmLink()}>{busy === 'saving' ? 'Đang lưu…' : projectId ? '4. Lưu CSV vào workspace' : '4. Lưu các quan sát vào báo cáo'}</button>}
      </section>}
      {unresolved.length > 0 && <section className="quant-validation" aria-live="polite"><h4>{unresolved.length} entity mappings need review</h4><p>Only conflicting IDs/names or multiple exact report matches appear here. Other CSV apps are retained as source-only entities automatically.</p><div className="quant-ambiguities">{[...new Map(unresolved.map((item) => [item.csv_value, item])).values()].map((item) => <label key={item.csv_value}>{item.csv_name ? `${item.csv_name} · ID: ${item.csv_value}` : item.csv_value}<select aria-label={`Map entity ${item.csv_value}`} value={entityMappings[item.csv_value] ?? ''} onChange={(event) => { setEntityMappings((current) => ({ ...current, [item.csv_value]: event.target.value })); invalidatePreview(); }}><option value="">Chọn…</option><option value="__unmapped__">Keep as source-only</option>{(report?.research_data.entities ?? []).filter((entity) => !item.candidates.length || item.candidates.includes(entity.key)).map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}</select></label>)}</div><button type="button" className="secondary-action" disabled={busy !== null} onClick={() => void validate()}>{busy === 'validating' ? 'Đang xác thực…' : 'Revalidate mappings'}</button></section>}
      {failure && <div className="research-alert" role="alert">{failure}</div>}{message && <div className="research-success" role="status">{message}</div>}
      {existing && <section className="research-success" role="status"><p>CSV này đã được lưu. Không cần tải lại hoặc sửa file.</p><button type="button" className="secondary-action" onClick={() => onImported(existing)}>Mở dataset đã lưu</button><button type="button" className="secondary-action" onClick={() => setReviewOpen(true)}>Review dataset information</button></section>}
      {existing && reviewOpen && existing.report_id && <DatasetMetadataReview reportId={existing.report_id} datasetId={existing.id} onSaved={onImported} onClose={() => setReviewOpen(false)} />}
      <p className="quant-import-note">Không tải file lên trước khi bạn xác thực. CSV gốc được giữ cùng provenance; {projectId ? 'dataset này chỉ thuộc workspace hiện tại.' : 'dữ liệu chỉ liên kết với báo cáo hiện tại sau xác nhận.'}</p>
    </div>
  </details>;
}
