import { useEffect, useMemo, useState } from 'react';
import { reportApi, type BenchmarkSelection, type BenchmarkWorkspace, type BenchmarkWorkspaceEntry, type ImportedReport, type ResearchData } from './api';
import { extractHeadings, MarkdownReport } from './MarkdownReport';
import { buildStructuringPrompt } from './researchPrompt';

type Tab = 'overview' | 'insights' | 'entities' | 'benchmark' | 'evidence' | 'report';

function itemLabel(report: ImportedReport, item: BenchmarkSelection): string {
  if (item.item_type === 'entity') return report.research_data.entities.find((entry) => entry.key === item.item_key)?.name ?? item.item_key;
  if (item.item_type === 'finding') return report.research_data.findings.find((entry) => entry.key === item.item_key)?.title ?? item.item_key;
  return report.research_data.benchmark_dimensions.find((entry) => entry.key === item.item_key)?.name ?? item.item_key;
}

function excerptAtLocations(content: string, locations: string[]): string[] {
  const lines = content.split(/\r?\n/);
  return [...new Set(locations.flatMap((location) => {
    const match = /^line:(\d+)$/.exec(location);
    if (!match) return [];
    const line = Number(match[1]);
    if (line < 1 || line > lines.length) return [];
    return [`${location}: ${lines[line - 1]}`];
  }))];
}

function blankWorkspace(): BenchmarkWorkspace { return { custom_dimensions: [], entries: [] }; }

function includeSelectedEntries(workspace: BenchmarkWorkspace, selections: BenchmarkSelection[]): BenchmarkWorkspace {
  const entries = [...workspace.entries];
  for (const item of selections) {
    if (!entries.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key)) entries.push({ ...item, po_assessment: '', notes: '', next_action: '', dimension_assessments: {} });
  }
  return { ...workspace, entries };
}

export function ReportViewer({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<ImportedReport | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [structureResponse, setStructureResponse] = useState('');
  const [structurePrompt, setStructurePrompt] = useState('');
  const [workspace, setWorkspace] = useState<BenchmarkWorkspace>(blankWorkspace());
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [newDimension, setNewDimension] = useState('');
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const headings = useMemo(() => report ? extractHeadings(report.content) : [], [report]);
  const imported = new URLSearchParams(window.location.search).has('imported');

  useEffect(() => {
    reportApi.get(reportId).then((value) => {
      setReport(value);
      setWorkspace(includeSelectedEntries(value.benchmark_workspace || blankWorkspace(), value.benchmark_selections));
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Không mở được báo cáo.')).finally(() => setLoading(false));
  }, [reportId]);

  async function applyReportUpdate(action: () => Promise<ImportedReport>, successMessage: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await action();
      setReport(updated);
      setWorkspace(updated.benchmark_workspace || blankWorkspace());
      setNotice(successMessage);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không cập nhật được báo cáo.'); }
    finally { setBusy(false); }
  }

  async function reprocess() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await reportApi.reprocess(reportId);
      setReport(result); setWorkspace(result.benchmark_workspace || blankWorkspace()); setNotice(result.message);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể xử lý lại báo cáo.'); }
    finally { setBusy(false); }
  }

  async function copyStructuringPrompt() {
    if (!report) return;
    const prompt = buildStructuringPrompt(report);
    setStructurePrompt(prompt);
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice('Prompt chuẩn hóa đã được sao chép. Gửi vào ChatGPT Plus, rồi dán toàn bộ câu trả lời vào ô bên dưới.');
    } catch {
      setNotice('Sao chép tự động không khả dụng. Prompt đầy đủ đang hiển thị để bạn sao chép.');
    }
  }

  async function applyStructuringResponse() {
    if (!structureResponse.trim()) { setError('Dán toàn bộ câu trả lời ChatGPT có payload po_research_v1.'); return; }
    await applyReportUpdate(() => reportApi.structureFromResponse(reportId, structureResponse), 'Đã cấu trúc báo cáo. Báo cáo gốc, Benchmark và PO notes được giữ nguyên.');
    setStructureResponse('');
  }

  async function toggleSelection(item: BenchmarkSelection) {
    if (!report) return;
    const exists = report.benchmark_selections.some((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key);
    const selections = exists ? report.benchmark_selections.filter((entry) => entry.item_type !== item.item_type || entry.item_key !== item.item_key) : [...report.benchmark_selections, item];
    const nextWorkspace = includeSelectedEntries(workspace, selections);
    setBusy(true); setError(''); setNotice('');
    try {
      const selected = await reportApi.updateBenchmarkSelections(report.id, selections);
      const saved = await reportApi.updateBenchmarkWorkspace(report.id, nextWorkspace);
      setReport(saved); setWorkspace(includeSelectedEntries(saved.benchmark_workspace, saved.benchmark_selections)); setNotice('Benchmark workspace đã được lưu.');
      void selected;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không lưu được lựa chọn benchmark.'); }
    finally { setBusy(false); }
  }

  function changeEntry(item: BenchmarkSelection, field: keyof Pick<BenchmarkWorkspaceEntry, 'po_assessment' | 'notes' | 'next_action'>, value: string) {
    setWorkspace((current) => ({ ...current, entries: current.entries.map((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key ? { ...entry, [field]: value } : entry) }));
  }

  function changeDimensionAssessment(item: BenchmarkSelection, dimensionKey: string, value: string) {
    setWorkspace((current) => ({ ...current, entries: current.entries.map((entry) => entry.item_type === item.item_type && entry.item_key === item.item_key ? { ...entry, dimension_assessments: { ...entry.dimension_assessments, [dimensionKey]: value } } : entry) }));
  }

  async function saveWorkspace(next = workspace) {
    if (!report) return;
    await applyReportUpdate(() => reportApi.updateBenchmarkWorkspace(report.id, next), 'Đã lưu PO Assessment, Notes và Next Action.');
  }

  async function addCustomDimension() {
    const value = newDimension.trim();
    if (!value || workspace.custom_dimensions.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    const next = { ...workspace, custom_dimensions: [...workspace.custom_dimensions, value] };
    setNewDimension('');
    await saveWorkspace(next);
  }

  if (loading) return <section className="research-panel report-view-state" role="status">Đang mở kết quả nghiên cứu…</section>;
  if (error && !report) return <section className="research-panel report-view-state"><div className="research-alert" role="alert">{error}</div><a className="primary-action" href="/">Quay lại Research</a></section>;
  if (!report) return null;

  const data = report.research_data;
  const researchStatus = report.research_status || (report.parse_status === 'PARSED' ? 'STRUCTURED_READY' : 'TEXT_ONLY');
  const keyTakeaways = data.key_takeaways ?? [];
  const hasStructured = Boolean(data.executive_summary || keyTakeaways.length || data.findings.length + data.entities.length + data.benchmark_dimensions.length + data.research_gaps.length + data.po_recommendations.length > 0);
  const tabs: { id: Tab; label: string; visible: boolean }[] = [
    { id: 'overview', label: 'Overview', visible: true },
    { id: 'insights', label: 'Insights', visible: data.findings.length > 0 },
    { id: 'entities', label: 'Entities', visible: data.entities.length > 0 },
    { id: 'benchmark', label: 'Benchmark', visible: data.entities.length + data.findings.length + data.benchmark_dimensions.length > 0 || report.benchmark_selections.length > 0 },
    { id: 'evidence', label: 'Evidence', visible: data.evidence_references.length > 0 },
    { id: 'report', label: 'Full Report', visible: true },
  ];
  const candidates: BenchmarkSelection[] = [
    ...data.entities.map((item) => ({ item_type: 'entity' as const, item_key: item.key })),
    ...data.findings.map((item) => ({ item_type: 'finding' as const, item_key: item.key })),
    ...data.benchmark_dimensions.map((item) => ({ item_type: 'dimension' as const, item_key: item.key })),
  ];
  const selected = report.benchmark_selections;
  const selectedRows = selected.map((item) => ({ ...item, label: itemLabel(report, item) }));
  const dimensions = [...data.benchmark_dimensions.map((dimension) => ({ key: dimension.key, name: dimension.name, custom: false })), ...workspace.custom_dimensions.map((name) => ({ key: `po:${name}`, name, custom: true }))];

  function observation(item: BenchmarkSelection, dimensionKey: string): { value: unknown; urls: string[]; status: string; uncertainty: string | null } | null {
    const dimension = data.benchmark_dimensions.find((entry) => entry.key === dimensionKey);
    if (!dimension) return null;
    if (item.item_type === 'entity') {
      const matches = dimension.observations.filter((entry) => entry.entity_key === item.item_key);
      const usable = matches.filter((entry) => entry.value !== null && entry.value !== undefined && entry.value !== '');
      if (usable.length) return { value: usable.map((entry) => typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)).join('; '), urls: [...new Set(usable.flatMap((entry) => entry.evidence_references))], status: [...new Set(usable.map((entry) => entry.evidence_status))].join(', '), uncertainty: usable.map((entry) => entry.uncertainty).filter(Boolean).join('; ') || null };
    }
    return null;
  }

  function findingMetrics(findingKey: string): { dimension: string; value: string; urls: string[] }[] {
    const finding = data.findings.find((item) => item.key === findingKey);
    if (!finding) return [];
    return data.benchmark_dimensions.flatMap((dimension) => dimension.observations
      .filter((item) => item.entity_key && finding.related_entities.includes(item.entity_key) && item.value !== null && item.value !== undefined && item.value !== '')
      .map((item) => ({ dimension: dimension.name, value: typeof item.value === 'string' ? item.value : JSON.stringify(item.value), urls: item.evidence_references })));
  }

  return <article className="report-viewer">
    {imported && <div className="research-success" role="status">{new URLSearchParams(window.location.search).has('duplicate') ? 'Báo cáo trùng đã mở từ History; dữ liệu gốc được giữ nguyên.' : 'Đã nhập báo cáo.'}</div>}
    <header className="research-panel report-meta"><a className="text-button" href="/">← Quay lại Research</a><span className="field-label">RESEARCH RESULTS · {researchStatus}</span><h2>{report.question}</h2><dl><div><dt>Scope</dt><dd>{report.geo} · {report.os}</dd></div><div><dt>Research period</dt><dd>{report.research_period || 'Not provided'}</dd></div><div><dt>Import status</dt><dd>{researchStatus} · Imported, unverified</dd></div><div><dt>Imported</dt><dd>{new Date(report.imported_at).toLocaleString()}</dd></div></dl><a className="text-button" href="/reports">Mở History</a></header>
    {error && <div className="research-alert" role="alert">{error}</div>}{notice && <div className="research-success" role="status">{notice}</div>}
    {(report.orphaned_benchmark_selections?.length || report.orphaned_benchmark_entries?.length) ? <div className="research-alert" role="alert">Có {(report.orphaned_benchmark_selections?.length || 0) + (report.orphaned_benchmark_entries?.length || 0)} benchmark reference/PO note đang trỏ tới keys không còn trong structured data. Dữ liệu được giữ nguyên; xem tab Benchmark để xử lý references khi cần.</div> : null}
    {!hasStructured && <section className="research-panel structuring-callout"><strong>{report.research_status || 'TEXT_ONLY'} · cần cấu trúc ngữ nghĩa</strong><p>Đây là nội dung báo cáo gốc. Hệ thống không tự biến heading hoặc văn bản thành insight. Dùng ChatGPT Plus để cấu trúc report hiện có; báo cáo gốc và ghi chú PO sẽ được giữ nguyên.</p><div className="intake-actions"><button className="secondary-action" type="button" disabled={busy} onClick={reprocess}>Reprocess deterministic</button><button className="secondary-action" type="button" disabled={busy} onClick={copyStructuringPrompt}>Chuẩn hóa bằng ChatGPT Plus</button></div>{structurePrompt && <label className="intake-field"><span className="field-label">Prompt cho ChatGPT Plus</span><textarea rows={10} readOnly value={structurePrompt} onFocus={(event) => event.currentTarget.select()} /></label>}<label className="intake-field"><span className="field-label">Dán câu trả lời ChatGPT đầy đủ</span><textarea rows={12} value={structureResponse} onChange={(event) => setStructureResponse(event.target.value)} placeholder="Dán toàn bộ câu trả lời có marker PO_RESEARCH_V1 và JSON payload." /></label><button className="primary-action" type="button" disabled={busy || !structureResponse.trim()} onClick={() => void applyStructuringResponse()}>{busy ? 'Đang cập nhật…' : 'Cập nhật báo cáo hiện tại'}</button>{report.extraction_error && <p className="field-error">Không thể áp dụng cấu trúc trước đó: {report.extraction_error}</p>}</section>}
    <nav className="report-tabs" aria-label="Research result sections" role="tablist">{tabs.filter((item) => item.visible).map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
    {tab === 'overview' && <section className="research-panel results-panel" aria-label="Overview"><h3>Overview</h3>{data.executive_summary && <p className="executive-summary">{data.executive_summary}</p>}{keyTakeaways.length > 0 && <section><h4>Key takeaways</h4><ul>{keyTakeaways.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}{data.findings.length > 0 && <section><h4>Key insights</h4><div className="insight-grid">{data.findings.map((finding) => <button className="insight-card" key={finding.key} onClick={() => { setActiveFinding(finding.key); setTab('insights'); }}><span className="field-label">{finding.finding_type} · {finding.evidence_status}</span><strong>{finding.title}</strong><span>{finding.description}</span></button>)}</div></section>}{data.research_gaps.length > 0 && <section><h4>Research gaps</h4><ul>{data.research_gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></section>}{data.po_recommendations.length > 0 && <section><h4>PO recommendations</h4><ul>{data.po_recommendations.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}{data.findings.length + data.research_gaps.length + data.po_recommendations.length + keyTakeaways.length === 0 && !data.executive_summary && <p>{report.research_status === 'TEXT_ONLY' ? 'Chỉ có nội dung báo cáo gốc; chưa có insight được cấu trúc. Dùng “Chuẩn hóa bằng ChatGPT Plus” để nâng cấp báo cáo này.' : 'Structured report has no overview fields.'}</p>}</section>}
    {tab === 'insights' && <section className="research-panel results-panel"><h3>Insights</h3><div className="insight-list">{data.findings.map((finding) => { const locations = [...(finding.source_locations || []), ...finding.evidence_references.flatMap((url) => data.evidence_references.filter((source) => source.url === url && source.source_location).map((source) => source.source_location!))]; const excerpt = excerptAtLocations(report.content, locations); const metrics = findingMetrics(finding.key); const related = data.entities.filter((entity) => finding.related_entities.includes(entity.key)); return <article className="insight-result" key={finding.key} id={`finding-${finding.key}`}><div className="panel-heading"><div><span className="field-label">{finding.finding_type}</span><h4>{finding.title}</h4></div><span className="unverified-chip">{finding.evidence_status} · unverified</span></div><p>{finding.description}</p>{related.length > 0 && <section><h5>Related entities, features, or mechanics</h5><ul>{related.map((entity) => <li key={entity.key}><strong>{entity.name}</strong>{Object.keys(entity.attributes).length > 0 && ` — ${Object.entries(entity.attributes).map(([key, value]) => `${key}: ${String(value)}`).join('; ')}`}</li>)}</ul></section>}{metrics.length > 0 && <section><h5>Related reported dimensions / KPIs</h5><ul>{metrics.map((metric, index) => <li key={`${metric.dimension}-${index}`}><strong>{metric.dimension}:</strong> {metric.value} <EvidenceLinks urls={metric.urls} references={data.evidence_references} /></li>)}</ul></section>}{Object.keys(finding.scope).length > 0 && <p><strong>Scope:</strong> {JSON.stringify(finding.scope)}</p>}{finding.uncertainty && <p><strong>Uncertainty:</strong> {finding.uncertainty}</p>}{finding.po_implications && <p><strong>PO implications:</strong> {finding.po_implications}</p>}<EvidenceLinks urls={finding.evidence_references} references={data.evidence_references} /><button className="text-button" onClick={() => setActiveFinding(activeFinding === finding.key ? null : finding.key)}>View support in original report</button>{activeFinding === finding.key && <div className="support-excerpt">{excerpt.length ? excerpt.map((line) => <pre key={line}>{line}</pre>) : <p>No reliable source location was provided. Open Full Report and inspect the cited URL manually.</p>}</div>}<button className="secondary-action" disabled={busy || selected.some((item) => item.item_type === 'finding' && item.item_key === finding.key)} onClick={() => toggleSelection({ item_type: 'finding', item_key: finding.key })}>Add to Benchmark</button></article>; })}</div></section>}
    {tab === 'entities' && <section className="research-panel results-panel"><h3>Entities</h3><div className="dynamic-card-grid">{data.entities.map((entity) => <article className="dynamic-card" key={entity.key}><span className="field-label">{entity.entity_type}</span><h4>{entity.name}</h4>{Object.entries(entity.attributes).map(([key, value]) => <p key={key}><strong>{key}:</strong> {String(value)}</p>)}<EvidenceLinks urls={entity.evidence_references} references={data.evidence_references} /><button className="secondary-action" disabled={busy || selected.some((item) => item.item_type === 'entity' && item.item_key === entity.key)} onClick={() => toggleSelection({ item_type: 'entity', item_key: entity.key })}>Add to Benchmark</button></article>)}</div></section>}
    {tab === 'benchmark' && <section className="research-panel results-panel benchmark-workspace"><h3>Benchmark Workspace</h3><p>Research observations remain separate from PO assessments. Missing values are not inferred.</p><div className="benchmark-add"><label className="intake-field"><span className="field-label">Add an item from this report</span><select aria-label="Add benchmark item" value={selectedCandidate} onChange={(event) => setSelectedCandidate(event.target.value)}><option value="">Choose an entity, insight, or dimension</option>{candidates.map((item) => <option key={`${item.item_type}:${item.item_key}`} value={`${item.item_type}:${item.item_key}`}>{itemLabel(report, item)} · {item.item_type}</option>)}</select></label><button className="secondary-action" disabled={!selectedCandidate || busy} onClick={() => { const [item_type, ...rest] = selectedCandidate.split(':'); void toggleSelection({ item_type: item_type as BenchmarkSelection['item_type'], item_key: rest.join(':') }); setSelectedCandidate(''); }}>Add</button></div>
      <label className="intake-field"><span className="field-label">Add a PO-defined comparison dimension</span><div className="dimension-add"><input aria-label="PO dimension" value={newDimension} onChange={(event) => setNewDimension(event.target.value)} placeholder="Dimension name" /><button className="secondary-action" disabled={!newDimension.trim() || busy} onClick={() => void addCustomDimension()}>Add dimension</button></div></label>
      {dimensions.length > 0 && selectedRows.length > 0 && <div className="benchmark-table-wrap"><table className="benchmark-table"><thead><tr><th>Selected item</th>{dimensions.map((dimension) => <th key={dimension.key}>{dimension.name}{dimension.custom ? ' · PO-defined' : ''}</th>)}</tr></thead><tbody>{selectedRows.map((row) => { const entry = workspace.entries.find((candidate) => candidate.item_type === row.item_type && candidate.item_key === row.item_key); return <tr key={`${row.item_type}-${row.item_key}`}><th>{row.label}<small>{row.item_type}</small></th>{dimensions.map((dimension) => { const found = dimension.custom ? null : observation(row, dimension.key); const poValue = dimension.custom ? entry?.dimension_assessments?.[dimension.name] : undefined; return <td key={dimension.key}>{poValue ? <><span>{poValue}</span><small>PO-provided assessment</small></> : found ? <><span>{found.value === null || found.value === undefined || found.value === '' ? 'Unknown / Not provided' : String(found.value)}</span><small>{found.status} · source-provided and not independently verified{found.uncertainty ? ` · ${found.uncertainty}` : ''}</small>{found.urls.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">Evidence</a>)}</> : <span>Unknown / Not provided</span>}</td>; })}</tr>; })}</tbody></table></div>}
      {selectedRows.length === 0 && <p className="report-history-state">Add a report entity, insight, or dimension to begin a comparison.</p>}
      {selectedRows.map((item) => { const entry = workspace.entries.find((candidate) => candidate.item_type === item.item_type && candidate.item_key === item.item_key); if (!entry) return null; return <article className="benchmark-po-entry" key={`${item.item_type}-${item.item_key}`}><div className="panel-heading"><div><span className="field-label">PO ASSESSMENT</span><h4>{item.label}</h4></div><button className="text-button" disabled={busy} onClick={() => toggleSelection(item)}>Remove</button></div>{workspace.custom_dimensions.length > 0 && <div className="benchmark-po-fields">{workspace.custom_dimensions.map((dimension) => <label className="intake-field" key={dimension}><span className="field-label">{dimension} · PO value</span><textarea aria-label={`${dimension} assessment for ${item.label}`} value={entry.dimension_assessments?.[dimension] || ''} onChange={(event) => changeDimensionAssessment(item, dimension, event.target.value)} /></label>)}</div>}<div className="benchmark-po-fields"><label className="intake-field"><span className="field-label">PO Assessment</span><textarea value={entry.po_assessment} onChange={(event) => changeEntry(item, 'po_assessment', event.target.value)} /></label><label className="intake-field"><span className="field-label">Notes</span><textarea value={entry.notes} onChange={(event) => changeEntry(item, 'notes', event.target.value)} /></label><label className="intake-field"><span className="field-label">Next Action</span><textarea value={entry.next_action} onChange={(event) => changeEntry(item, 'next_action', event.target.value)} /></label></div></article>; })}
      {selectedRows.length > 0 && <button className="primary-action" disabled={busy} onClick={() => void saveWorkspace()}>{busy ? 'Saving…' : 'Save PO assessment and actions'}</button>}
    </section>}
    {tab === 'evidence' && <section className="research-panel results-panel"><h3>Evidence</h3><p>Imported sources are references supplied in the report. URLs and ChatGPT-provided data are not independently verified.</p><ul className="evidence-results">{data.evidence_references.map((source) => <li key={source.url}><strong>{source.title || source.url}</strong><a href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a><span>{source.source_location || 'No source location provided'} · Unverified</span></li>)}</ul></section>}
    {tab === 'report' && <section className="research-panel report-body full-report"><div className="panel-heading"><div><span className="field-label">ORIGINAL REPORT</span><h3>Full Report</h3></div><span className="unverified-chip">Verbatim</span></div>{headings.length > 0 && <nav className="report-toc" aria-label="Mục lục"><strong>Contents</strong><ol>{headings.map((heading, index) => <li key={`${heading.id}-${index}`} style={{ marginLeft: `${Math.max(0, heading.level - 1) * 8}px` }}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ol></nav>}<MarkdownReport markdown={report.content} /></section>}
    {report.structured_update_available && <div role="status" className="research-alert">This duplicate contains different structured results. They were not applied automatically; the saved report and PO workspace are unchanged.</div>}
  </article>;
}

function EvidenceLinks({ urls, references }: { urls: string[]; references: ResearchData['evidence_references'] }) {
  if (!urls.length) return <p className="unverified-chip">No evidence references provided · unverified</p>;
  return <ul className="evidence-link-list">{urls.map((url) => { const reference = references.find((item) => item.url === url); return <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{reference?.title || url}</a><small>{reference?.source_location || 'No source location provided'} · Unverified</small></li>; })}</ul>;
}
