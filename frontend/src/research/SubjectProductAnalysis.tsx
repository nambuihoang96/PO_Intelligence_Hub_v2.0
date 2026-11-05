import { useState } from 'react';
import { reportApi, type ImportedReport, type QuantitativeObservation } from '../reports/api';
import { researchApi, type ResearchSubject, type ResearchSubjectAnalysisSection, type ResearchSubjectSource } from './api';
import type { CodexResearchControls } from './CodexResearchSettings';

type EvidenceSource = {
  ref: string;
  kind: 'report' | 'csv';
  name: string;
  sourceId: string;
  sourceHash: string;
  context: string;
  href: string;
  payload: Record<string, unknown>;
};

function reportEvidence(report: ImportedReport, source: ResearchSubjectSource, ref: string): EvidenceSource {
  const entity = report.research_data.entities.find((item) => item.key === source.source_key);
  const findings = report.research_data.findings.filter((item) => item.related_entities.includes(source.source_key));
  return {
    ref,
    kind: 'report',
    name: report.question,
    sourceId: report.id,
    sourceHash: report.content_sha256,
    context: `${report.geo} · ${report.os} · ${report.research_period || 'chưa ghi kỳ'} · báo cáo chưa xác minh độc lập`,
    href: `/reports/${encodeURIComponent(report.id)}?section=entities&entity=${encodeURIComponent(source.source_key)}`,
    payload: {
      report_id: report.id,
      content_sha256: report.content_sha256,
      question: report.question,
      geo: report.geo,
      platform: report.os,
      period: report.research_period,
      verification_status: report.verification_status,
      linked_entity: entity ? {
        key: entity.key, name: entity.name, type: entity.entity_type,
        attributes: entity.attributes, evidence_references: entity.evidence_references,
      } : null,
      related_findings: findings.map((item) => ({
        key: item.key, title: item.title, description: item.description,
        evidence_references: item.evidence_references, source_locations: item.source_locations,
        evidence_status: item.evidence_status, confidence: item.confidence,
        uncertainty: item.uncertainty, po_implications: item.po_implications,
      })),
      research_gaps: report.research_data.research_gaps,
    },
  };
}

function csvObservationMatches(row: QuantitativeObservation, sourceKey: string): boolean {
  return row.source_entity_id === sourceKey || row.entity_id === sourceKey;
}

function csvEvidence(dataset: Awaited<ReturnType<typeof reportApi.getProjectQuantitativeDataset>>, source: ResearchSubjectSource, projectId: string, ref: string): EvidenceSource {
  const observations = dataset.observations.filter((row) => csvObservationMatches(row, source.source_key));
  return {
    ref,
    kind: 'csv',
    name: dataset.filename,
    sourceId: dataset.id,
    sourceHash: dataset.content_sha256,
    context: `${observations.length} số liệu của ${source.source_name} · chưa xác minh độc lập`,
    href: `/research?projectId=${encodeURIComponent(projectId)}&view=csv&datasetId=${encodeURIComponent(dataset.id)}`,
    payload: {
      dataset_id: dataset.id,
      filename: dataset.filename,
      content_sha256: dataset.content_sha256,
      matched_by: 'exact linked source entity id only',
      observations: observations.map((row) => ({
        entity_id: row.source_entity_id || row.entity_id,
        source_row_number: row.source_row_number,
        metric_id: row.metric_id,
        metric_definition: row.metric_definition,
        value: row.value,
        value_precision: row.value_precision,
        reported_value_text: row.reported_value_text,
        unit: row.unit,
        geo: row.geo,
        platform: row.platform,
        period_start: row.period_start,
        period_end: row.period_end,
        snapshot_date: row.snapshot_date,
        period_semantics: row.period_semantics,
        granularity: row.granularity,
        methodology: row.methodology,
        source_reference: row.source_reference,
        evidence_reference: row.evidence_reference,
        verification_status: row.verification_status,
        validation_reasons: row.validation_reasons,
        report_compatibility: row.report_compatibility,
        report_compatibility_reasons: row.report_compatibility_reasons,
      })),
    },
  };
}

async function prepareEvidence(projectId: string, sources: ResearchSubjectSource[]): Promise<EvidenceSource[]> {
  const reportSources = sources.filter((item) => item.source_kind === 'report_entity');
  const csvSources = sources.filter((item) => item.source_kind === 'csv_entity');
  const prepared = await Promise.all([
    ...reportSources.map(async (source, index) => reportEvidence(await reportApi.get(source.source_id), source, `R${index + 1}`)),
    ...csvSources.map(async (source, index) => csvEvidence(await reportApi.getProjectQuantitativeDataset(projectId, source.source_id), source, projectId, `C${index + 1}`)),
  ]);
  if (prepared.some((item) => item.kind === 'csv' && !Array.isArray(item.payload.observations))) {
    throw new Error('Không đọc được số liệu CSV đã liên kết với sản phẩm này.');
  }
  return prepared;
}

function productAnalysisPrompt(subject: ResearchSubject, sources: EvidenceSource[]): string {
  const evidence = JSON.stringify(sources.map(({ ref, kind, name, sourceId, sourceHash, context, payload }) => ({ ref: `[${ref}]`, type: kind, name, source_id: sourceId, source_hash: sourceHash, context, payload })));
  const prompt = [
    `Phân tích sản phẩm "${subject.name}" chỉ từ các nguồn được liên kết rõ bên dưới.`,
    `Loại: ${subject.subject_type || 'chưa phân loại'}. Tên gọi khác: ${subject.aliases.join(', ') || 'không có'}.`,
    'Không tìm kiếm web, không thêm kiến thức ngoài, không đoán nguyên nhân. Mọi dữ kiện phải trích đúng mã [R#] hoặc [C#] và chỉ rõ kỳ/phạm vi/đơn vị khi có.',
    'Tách rõ: (1) Điều nguồn báo cáo/CSV ghi nhận; (2) Nhận định có thể rút ra trực tiếp; (3) Giả thuyết cần kiểm chứng; (4) Dữ liệu còn thiếu hoặc mâu thuẫn; (5) Một hành động tiếp theo cụ thể cho PO.',
    'Không gọi tăng/giảm là tốt/xấu nếu chưa có mục tiêu hoặc chuẩn đối chiếu. Không cộng hoặc so sánh các chỉ số khác đơn vị, phạm vi, phương pháp hay kỳ đo. Không biến ghi chú nguồn chưa xác minh thành sự thật đã xác minh.',
    'Nếu không có bằng chứng đủ cho một mục, ghi rõ “Chưa đủ dữ liệu”. Trả lời bằng tiếng Việt, gọn dưới 900 từ, dùng tiêu đề đúng như năm phần trên. Không tự lưu kết quả.',
    '', 'DỮ LIỆU NGUỒN ĐÃ LIÊN KẾT:', evidence,
  ].join('\n');
  if (prompt.length > 45_000) throw new Error('Nguồn đã liên kết vượt giới hạn một lượt phân tích. Hãy chọn ít nguồn hơn trong hồ sơ rồi thử lại.');
  return prompt;
}

export function SubjectProductAnalysis({
  projectId, subject, sources, codexSettings, hasUnsavedChanges, onSaved,
}: {
  projectId: string;
  subject: ResearchSubject;
  sources: ResearchSubjectSource[];
  codexSettings: CodexResearchControls;
  hasUnsavedChanges: boolean;
  onSaved: (section: ResearchSubjectAnalysisSection) => void;
}) {
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ content: string; model: string; sources: EvidenceSource[] } | null>(null);
  const availableSources = sources.filter((item) => item.mapped_subject_id === subject.id && item.source_state === 'available');
  const savedSections = subject.analysis_sections ?? [];

  async function analyze() {
    if (!availableSources.length || !codexSettings.preferences.enabled || !codexSettings.catalog.available || !codexSettings.preferences.model_slug) return;
    setRunning(true); setError(''); setResult(null);
    try {
      const evidence = await prepareEvidence(projectId, availableSources);
      if (!evidence.length || evidence.some((item) => item.kind === 'csv' && (item.payload.observations as unknown[]).length === 0)) {
        throw new Error('Một tệp CSV đã liên kết không còn số liệu cho đúng mã sản phẩm. Mở nguồn để kiểm tra liên kết trước khi chạy.');
      }
      const prompt = productAnalysisPrompt(subject, evidence);
      const response = await reportApi.runCodexResearch({ model_slug: codexSettings.preferences.model_slug, prompt, allow_web_search: false });
      setResult({ content: response.content, model: response.model_slug, sources: evidence });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tạo được phân tích sản phẩm.');
    } finally { setRunning(false); }
  }

  async function saveResult() {
    if (!result || hasUnsavedChanges || savedSections.length >= 30) return;
    const date = new Date().toLocaleDateString('vi-VN');
    const sourceList = result.sources.map((item) => `[${item.ref}] ${item.kind} · ${item.name} · source_id=${item.sourceId} · sha256=${item.sourceHash}`).join('\n');
    const content = [
      `Nguồn phân tích: Codex CLI · model ${result.model} · ${date}.`,
      'Phân tích tự động từ nguồn đã liên kết; chưa được PO xác nhận và chưa xác minh độc lập.',
      'Mã nguồn tham chiếu:', sourceList, '', result.content.trim(),
    ].join('\n');
    if (content.length > 20_000) { setError('Kết quả dài hơn giới hạn lưu hồ sơ. Hãy tạo câu trả lời ngắn hơn trước khi lưu.'); return; }
    const section: ResearchSubjectAnalysisSection = {
      key: `product-analysis-codex-${Date.now()}`,
      label: `Phân tích sản phẩm · Codex · ${date}`,
      content,
    };
    setSaving(true); setError('');
    try {
      await researchApi.updateSubject(projectId, subject.id, { analysis_sections: [...savedSections, section] });
      onSaved(section);
      setResult(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không lưu được phân tích vào hồ sơ. Kết quả vẫn còn để thử lại.');
    } finally { setSaving(false); }
  }

  const unavailable = codexSettings.loadingModels || !codexSettings.catalog.available || !codexSettings.preferences.model_slug;
  return <section className="subject-product-analysis" aria-label={`Phân tích sản phẩm ${subject.name}`}>
    <div className="subject-product-analysis__heading"><div><span className="state-label">PHÂN TÍCH DỰA TRÊN NGUỒN</span><h5>Phân tích sản phẩm</h5></div><span>{availableSources.length} nguồn đã liên kết</span></div>
    <p>PO Hub chỉ gửi báo cáo và CSV đã được liên kết đích danh. Mỗi lượt dùng hạn mức Codex; bấm nút mới gửi. Kết quả chưa xác minh và chỉ được lưu khi anh chọn lưu.</p>
    {!availableSources.length ? <p className="subject-product-analysis__empty">Chưa có nguồn hợp lệ đã liên kết với hồ sơ này. Mở phần tên sản phẩm trong nguồn để liên kết báo cáo hoặc CSV trước.</p> : <>
      <details className="subject-product-analysis__sources"><summary>Xem {availableSources.length} nguồn sẽ dùng</summary><ul>{availableSources.map((source) => <li key={`${source.source_kind}:${source.source_id}:${source.source_key}`}>
        <span><strong>{source.source_kind === 'report_entity' ? 'Báo cáo' : 'CSV'} · {source.source_name}</strong><small>{source.context_name} · ghép theo mã nguồn đã liên kết</small></span>
        <a href={source.source_kind === 'report_entity'
          ? `/reports/${encodeURIComponent(source.source_id)}?section=entities&entity=${encodeURIComponent(source.source_key)}`
          : `/research?projectId=${encodeURIComponent(projectId)}&view=csv&datasetId=${encodeURIComponent(source.source_id)}`}>Mở nguồn</a>
      </li>)}</ul></details>
      {!codexSettings.preferences.enabled && <p className="subject-product-analysis__status">Codex đang tắt. <a href="#workspace-codex-settings">Mở cài đặt Codex</a> để bật lại.</p>}
      {codexSettings.preferences.enabled && codexSettings.catalog.message && <p className="subject-product-analysis__status" role="status">{codexSettings.catalog.message}</p>}
      <button className="primary-action" type="button" onClick={() => void analyze()} disabled={!codexSettings.preferences.enabled || unavailable || running || saving || hasUnsavedChanges || savedSections.length >= 30}>
        {running ? 'Đang phân tích nguồn đã liên kết…' : 'Phân tích sản phẩm bằng Codex'}
      </button>
      {hasUnsavedChanges && <small className="subject-product-analysis__status">Lưu hoặc bỏ bản nháp đang sửa trước khi phân tích để giữ nguyên ghi chú.</small>}
      {codexSettings.preferences.enabled && unavailable && !codexSettings.loadingModels && <small className="subject-product-analysis__status">Chưa có model Codex khả dụng. <a href="#workspace-codex-settings">Kiểm tra cài đặt Codex</a>.</small>}
      {savedSections.length >= 30 && <small className="subject-product-analysis__status">Hồ sơ đã đạt giới hạn 30 ghi chú phân tích.</small>}
    </>}
    {error && <p className="subject-product-analysis__error" role="alert">{error}</p>}
    {result && <div className="subject-product-analysis__result" aria-live="polite">
      <div className="subject-product-analysis__result-heading"><strong>Kết quả xem trước</strong><span>Codex · {result.model} · chưa xác minh</span></div>
      <pre>{result.content}</pre>
      <div className="subject-product-analysis__result-sources">{result.sources.map((item) => <a href={item.href} key={item.ref}>[{item.ref}] {item.name}</a>)}</div>
      <button className="secondary-action" type="button" onClick={() => void saveResult()} disabled={saving || hasUnsavedChanges || savedSections.length >= 30}>{saving ? 'Đang lưu…' : 'Lưu phân tích vào hồ sơ'}</button>
      <small>Kết quả chỉ được lưu khi anh bấm nút này. Nguồn gốc và mã tham chiếu sẽ được giữ kèm.</small>
    </div>}
  </section>;
}
