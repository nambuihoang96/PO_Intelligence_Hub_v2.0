import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, researchApi } from './api';
import type { ResearchPlan, ResearchPlanPayload, ResearchProject, ResearchRun } from './api';
import { reportApi, type ReportSummary } from '../reports/api';
import { DataFirstWorkspace } from './DataFirstWorkspace';
import { ProjectJourneyNav } from './ProjectJourneyNav';
import { ProjectHome } from './ProjectHome';

type PlanForm = {
  question: string;
  geos: string;
  platforms: string;
  periodStart: string;
  periodEnd: string;
  comparisonStart: string;
  comparisonEnd: string;
  goals: string;
  keywords: string;
  sources: string;
};

const emptyPlan: PlanForm = {
  question: '', geos: '', platforms: '', periodStart: '', periodEnd: '',
  comparisonStart: '', comparisonEnd: '', goals: '', keywords: '', sources: '',
};

function listValue(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

function planToForm(plan: ResearchPlan | null): PlanForm {
  if (!plan) return emptyPlan;
  return {
    question: plan.question,
    geos: plan.geos.join(', '),
    platforms: plan.platforms.join(', '),
    periodStart: plan.period_start ?? '',
    periodEnd: plan.period_end ?? '',
    comparisonStart: plan.comparison_period_start ?? '',
    comparisonEnd: plan.comparison_period_end ?? '',
    goals: plan.goals.join(', '),
    keywords: plan.keywords.join(', '),
    sources: Array.isArray(plan.source_policy.requested_sources)
      ? plan.source_policy.requested_sources.filter((item): item is string => typeof item === 'string').join(', ')
      : '',
  };
}

function toPayload(form: PlanForm, sourcePolicy: Record<string, unknown> = {}): ResearchPlanPayload {
  return {
    question: form.question.trim(),
    geos: listValue(form.geos),
    platforms: listValue(form.platforms),
    period_start: form.periodStart || null,
    period_end: form.periodEnd || null,
    comparison_period_start: form.comparisonStart || null,
    comparison_period_end: form.comparisonEnd || null,
    goals: listValue(form.goals),
    keywords: listValue(form.keywords),
    source_policy: { ...sourcePolicy, requested_sources: listValue(form.sources) },
  };
}

function validationMessages(error: ApiError): string[] {
  const errors = error.details.errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((item) => {
    if (!item || typeof item !== 'object') return 'Review the research plan values.';
    const detail = item as { location?: unknown[]; message?: string };
    const field = detail.location?.slice(-1)[0];
    return `${typeof field === 'string' ? `${field}: ` : ''}${detail.message ?? 'Invalid value.'}`;
  });
}

function ErrorNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const messages = validationMessages(error);
  return (
    <div className="research-alert" role="alert">
      <div><strong>{error.code === 'STALE_PLAN_VERSION' ? 'This plan changed in another view.' : error.message}</strong>
        {messages.length > 0 && <ul>{messages.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul>}
      </div>
      {onRetry && <button className="text-button" type="button" onClick={onRetry}>Tải lại dự án</button>}
    </div>
  );
}

function ProjectList({
  projects, nextCursor, onLoadMore, loading, error, onRetry, recentReports, reportsLoading, reportsError,
}: {
  projects: ResearchProject[];
  nextCursor: string | null;
  onLoadMore: () => void;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  recentReports: ReportSummary[];
  reportsLoading: boolean;
  reportsError: string;
}) {
  return (
    <div className="research-home">
      <section className="research-panel" aria-labelledby="projects-title">
        <div className="panel-heading"><div><span className="state-label">KHÔNG GIAN NGHIÊN CỨU</span><h2 id="projects-title">Dự án của bạn</h2><p>Mở lại nghiên cứu đã lưu hoặc bắt đầu một dự án mới.</p></div>
          <a className="primary-action" href="/research/new">Tạo dự án <span aria-hidden="true">＋</span></a>
        </div>
        {error && <ErrorNotice error={error} onRetry={onRetry} />}
        {loading ? <p className="state-message" role="status">Đang tải dự án…</p> : projects.length === 0 && !error ? (
          <div className="research-home-empty"><div><strong>Chưa có dự án nghiên cứu</strong><p>Tạo dự án đầu tiên để lưu câu hỏi, báo cáo và dữ liệu cùng một nơi.</p></div></div>
        ) : (
          <div className="research-home-project-list">
            {projects.map((project) => (
              <div className="project-row-wrap" key={project.id}><a className="project-row" href={`/research?projectId=${encodeURIComponent(project.id)}`}>
                <span className="project-mark" aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span>
                <span className="project-row-copy"><strong>{project.name}</strong><small>{project.category || 'Chưa phân loại'}{project.owner ? ` · ${project.owner}` : ''}</small></span>
                <span className="row-arrow" aria-hidden="true">→</span>
              </a></div>
            ))}
            {nextCursor && <button className="secondary-action load-more" type="button" onClick={onLoadMore}>Tải thêm dự án</button>}
          </div>
        )}
      </section>
      <section className="research-panel research-home-recent" aria-labelledby="recent-reports-title">
        <div className="panel-heading"><div><span className="state-label">KẾT QUẢ GẦN ĐÂY</span><h2 id="recent-reports-title">Báo cáo nghiên cứu</h2><p>Mở lại nội dung đã lưu để tiếp tục công việc.</p></div><a className="secondary-action" href="/reports">Tất cả báo cáo</a></div>
        {reportsError ? <p className="research-home-recent-empty" role="status">Chưa tải được báo cáo gần đây. Bạn vẫn có thể mở lại dự án ở phía trên.</p>
          : reportsLoading ? <p className="research-home-recent-empty" role="status">Đang tải báo cáo gần đây…</p>
            : recentReports.length === 0 ? <p className="research-home-recent-empty">Báo cáo đã lưu sẽ xuất hiện tại đây.</p>
              : <div className="research-home-report-list">{recentReports.slice(0, 5).map((report) => (
                <a className="research-home-report-row" href={`/reports/${encodeURIComponent(report.id)}`} key={report.id}>
                  <span className="research-home-report-mark" aria-hidden="true">↗</span>
                  <span className="research-home-report-copy"><strong>{report.question || 'Báo cáo nghiên cứu'}</strong><small>{[report.geo, report.os, report.research_period].filter(Boolean).join(' · ') || 'Chưa ghi phạm vi'}</small></span>
                  <time>{new Date(report.imported_at).toLocaleDateString('vi-VN')}</time>
                </a>
              ))}</div>}
      </section>
    </div>
  );
}

function NewProjectForm() {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const project = await researchApi.createProject({
        name: name.trim(), owner: owner.trim() || null, category: category.trim() || null,
      });
      window.location.assign(`/research?projectId=${encodeURIComponent(project.id)}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('Không thể tạo dự án. Vui lòng thử lại.', 0, 'REQUEST_FAILED', {}));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="research-layout">
      <form className="research-panel research-form" onSubmit={submit}>
        <div className="panel-heading"><div><span className="state-label">DỰ ÁN MỚI</span><h2>Tạo không gian cho nghiên cứu này</h2></div></div>
        <p className="form-intro">Báo cáo, cập nhật và nội dung so sánh sẽ được tập hợp tại đây.</p>
        {error && <ErrorNotice error={error} />}
        <label className="field-label" htmlFor="project-name">Tên dự án <span>Bắt buộc</span></label>
        <input id="project-name" autoComplete="off" maxLength={200} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Nghiên cứu thị trường game giải đố" />
        <div className="field-grid">
          <div><label className="field-label" htmlFor="project-owner">Người phụ trách <span>Không bắt buộc</span></label><input id="project-owner" maxLength={200} value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Cá nhân hoặc nhóm" /></div>
          <div><label className="field-label" htmlFor="project-category">Lĩnh vực <span>Không bắt buộc</span></label><input id="project-category" maxLength={120} value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Trò chơi, năng suất…" /></div>
        </div>
        <div className="form-actions"><a className="secondary-action" href="/research">Hủy</a><button className="primary-action" type="submit" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo dự án'}</button></div>
      </form>
    </div>
  );
}

function PlanEditor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [plans, setPlans] = useState<ResearchPlan[]>([]);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [runPlanVersion, setRunPlanVersion] = useState('');
  const [creatingRun, setCreatingRun] = useState(false);
  const [runNotice, setRunNotice] = useState('');
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyPlan);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState('');

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [loadedProject, loadedPlans, loadedRuns] = await Promise.all([
        researchApi.getProject(projectId), researchApi.getPlans(projectId), researchApi.getRuns(projectId),
      ]);
      setProject(loadedProject);
      setPlans(loadedPlans);
      setRuns(loadedRuns);
      setRunPlanVersion((current) => current || String(loadedPlans.at(-1)?.version ?? ''));
      setViewVersion(loadedPlans.at(-1)?.version ?? null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('Không thể mở dự án. Vui lòng thử lại.', 0, 'REQUEST_FAILED', {}));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [projectId]);

  const latestPlan = plans.at(-1) ?? null;
  const activePlan = useMemo(() => plans.find((plan) => plan.version === viewVersion) ?? latestPlan, [plans, viewVersion, latestPlan]);
  const readOnly = activePlan !== null && latestPlan !== null && activePlan.version < latestPlan.version;

  useEffect(() => { setForm(planToForm(activePlan)); }, [activePlan]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const payload = toPayload(form, latestPlan?.source_policy ?? {});
      const saved = latestPlan
        ? await researchApi.revisePlan(projectId, latestPlan.version, payload)
        : await researchApi.createPlan(projectId, payload);
      await reload();
      setViewVersion(saved.version);
      setNotice(`Đã lưu phiên bản yêu cầu nghiên cứu ${saved.version}.`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('Không thể lưu yêu cầu nghiên cứu. Vui lòng thử lại.', 0, 'REQUEST_FAILED', {}));
    } finally {
      setBusy(false);
    }
  }

  async function createRun() {
    const selectedVersion = Number(runPlanVersion);
    if (!Number.isInteger(selectedVersion) || selectedVersion < 1) return;
    setCreatingRun(true);
    setError(null);
    setRunNotice('');
    try {
      const run = await researchApi.createRun(projectId, selectedVersion);
      setRuns((current) => [run, ...current]);
      setRunNotice(`Đã lưu lượt nghiên cứu theo yêu cầu phiên bản ${run.plan_version}. Nghiên cứu không tự chạy; hãy gửi yêu cầu cho ChatGPT.`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('Không thể tạo lượt nghiên cứu.', 0, 'REQUEST_FAILED', {}));
    } finally {
      setCreatingRun(false);
    }
  }

  function update(field: keyof PlanForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  if (loading) return <div className="research-panel"><p className="state-message" role="status">Đang tải dự án và kế hoạch…</p></div>;
  if (error && !project) return <div className="research-panel"><ErrorNotice error={error} onRetry={() => void reload()} /></div>;
  if (!project) return <div className="research-panel"><p className="state-message">Không tìm thấy dự án.</p><a href="/research">Về danh sách dự án</a></div>;

  return (
    <div className="research-layout">
      <div className="research-main-column">
        <ProjectJourneyNav projectId={projectId} active="research" />
        <form className="research-panel research-form" onSubmit={save}>
          <div className="panel-heading"><div><span className="state-label">NGHIÊN CỨU CHUYÊN SÂU · {latestPlan ? `BẢN TÓM TẮT PHIÊN BẢN ${activePlan?.version ?? latestPlan.version}` : 'TÓM TẮT MỚI'}</span><h2>Chuẩn bị nghiên cứu</h2><p>Định hình câu hỏi và phạm vi. Bạn sẽ nghiên cứu bằng ChatGPT; ứng dụng không tự truy cập nguồn từ màn hình này.</p></div>
            <a className="secondary-action" href={`/research?projectId=${encodeURIComponent(projectId)}`}>← Về trang dự án</a>
          </div>
          {latestPlan && <div className="project-context-actions"><a className="primary-action" href={`/?projectId=${encodeURIComponent(projectId)}&question=${encodeURIComponent(latestPlan.question)}&geo=${encodeURIComponent(latestPlan.geos.join(', '))}&environment=${encodeURIComponent(latestPlan.platforms.join(', '))}&period=${encodeURIComponent([latestPlan.period_start, latestPlan.period_end].filter(Boolean).join(' – '))}`}>Tiếp tục nhập báo cáo ChatGPT</a><a className="secondary-action" href={`/research/runs?projectId=${encodeURIComponent(projectId)}`}>Xem lịch sử nghiên cứu đã lưu</a></div>}
          {readOnly && <div className="read-only-note" role="status">Phiên bản kế hoạch đã lưu chỉ có thể xem. Chỉnh sửa bản mới nhất sẽ tạo phiên bản mới.</div>}
          {error && <ErrorNotice error={error} onRetry={() => void reload()} />}
          {notice && <div className="research-success" role="status">{notice}</div>}
          <label className="field-label" htmlFor="research-question">Câu hỏi nghiên cứu <span>Bắt buộc</span></label>
          <textarea id="research-question" rows={3} maxLength={5000} required disabled={readOnly} value={form.question} onChange={(event) => update('question', event.target.value)} placeholder="Bạn cần hiểu điều gì về thị trường hoặc sản phẩm này?" />
          <details className="deep-research-scope"><summary>Phạm vi và tùy chọn nghiên cứu (không bắt buộc)</summary>
            <div className="field-grid">
              <div><label className="field-label" htmlFor="plan-geos">Thị trường <span>Không bắt buộc</span></label><input id="plan-geos" disabled={readOnly} value={form.geos} onChange={(event) => update('geos', event.target.value)} placeholder="Ví dụ: Hoa Kỳ, Nhật Bản" /></div>
              <div><label className="field-label" htmlFor="plan-platforms">Nền tảng hoặc môi trường <span>Không bắt buộc</span></label><input id="plan-platforms" disabled={readOnly} value={form.platforms} onChange={(event) => update('platforms', event.target.value)} placeholder="Ví dụ: iOS, Android, Web" /></div>
            </div>
            <fieldset className="period-fieldset">
              <legend>Thời gian nghiên cứu <span>Không bắt buộc</span></legend>
              <div className="field-grid">
                <div><label className="field-label" htmlFor="period-start">Từ ngày</label><input id="period-start" type="date" disabled={readOnly} value={form.periodStart} onChange={(event) => update('periodStart', event.target.value)} /></div>
                <div><label className="field-label" htmlFor="period-end">Đến ngày</label><input id="period-end" type="date" disabled={readOnly} value={form.periodEnd} onChange={(event) => update('periodEnd', event.target.value)} /></div>
              </div>
            </fieldset>
            <fieldset className="period-fieldset comparison-fieldset">
              <legend>So sánh với một giai đoạn khác <span>Không bắt buộc</span></legend>
              <p className="field-help">Để trống nếu bạn không cần so sánh.</p>
              <div className="field-grid">
                <div><label className="field-label" htmlFor="comparison-start">Từ ngày</label><input id="comparison-start" type="date" disabled={readOnly} value={form.comparisonStart} onChange={(event) => update('comparisonStart', event.target.value)} /></div>
                <div><label className="field-label" htmlFor="comparison-end">Đến ngày</label><input id="comparison-end" type="date" disabled={readOnly} value={form.comparisonEnd} onChange={(event) => update('comparisonEnd', event.target.value)} /></div>
              </div>
            </fieldset>
            <div className="field-grid">
              <div><label className="field-label" htmlFor="plan-goals">Quyết định nào cần được hỗ trợ? <span>Không bắt buộc</span></label><textarea id="plan-goals" rows={2} disabled={readOnly} value={form.goals} onChange={(event) => update('goals', event.target.value)} placeholder="Ví dụ: hiểu định vị hoặc nhu cầu chưa được đáp ứng" /></div>
              <div><label className="field-label" htmlFor="plan-keywords">Chủ đề cần nghiên cứu <span>Không bắt buộc</span></label><textarea id="plan-keywords" rows={2} disabled={readOnly} value={form.keywords} onChange={(event) => update('keywords', event.target.value)} placeholder="Phân tách các chủ đề bằng dấu phẩy" /></div>
            </div>
            <div><label className="field-label" htmlFor="plan-sources">Nguồn bạn muốn tham khảo <span>Không bắt buộc</span></label><textarea id="plan-sources" rows={2} disabled={readOnly} value={form.sources} onChange={(event) => update('sources', event.target.value)} placeholder="Tên nguồn cụ thể bạn muốn xem xét" /><small className="field-help">Đây chỉ là gợi ý; ứng dụng không tự truy cập nguồn từ màn hình này.</small></div>
          </details>
          <div className="form-actions"><a className="secondary-action" href={`/research?projectId=${encodeURIComponent(projectId)}`}>Về trang dự án</a>{readOnly ? <button className="primary-action" type="button" onClick={() => setViewVersion(latestPlan?.version ?? null)}>Chỉnh sửa bản tóm tắt mới nhất</button> : <button className="primary-action" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : latestPlan ? 'Lưu thay đổi' : 'Lưu yêu cầu nghiên cứu'}</button>}</div>
        </form>
      </div>
      <details className="research-side-note"><summary><strong>Các phiên bản yêu cầu đã lưu</strong></summary>
        {plans.length === 0 ? <p>Chưa có yêu cầu nghiên cứu nào được lưu.</p> : <div className="version-list">{[...plans].reverse().map((plan) => <button className={`version-item${plan.version === activePlan?.version ? ' selected' : ''}`} type="button" key={plan.id} onClick={() => setViewVersion(plan.version)}><span>Phiên bản {plan.version}</span><small>{new Date(plan.created_at).toLocaleDateString('vi-VN')}</small></button>)}</div>}
        <span>Các phiên bản đã lưu vẫn được giữ cùng lịch sử nghiên cứu.</span>
      </details>
      <details className="research-panel research-run-section" aria-labelledby="project-runs-title" open>
        <summary className="panel-heading"><div><span className="state-label">CHI TIẾT</span><h2 id="project-runs-title">Lịch sử lượt nghiên cứu</h2></div></summary>
        {error && <ErrorNotice error={error} onRetry={() => void reload()} />}
        {runNotice && <div className="research-success" role="status">{runNotice}</div>}
        <div className="run-create-controls">
          <label className="field-label" htmlFor="run-plan-version">Dùng phiên bản yêu cầu</label>
          <select id="run-plan-version" value={runPlanVersion} onChange={(event) => setRunPlanVersion(event.target.value)} disabled={!plans.length || creatingRun}>
            {plans.length === 0 && <option value="">Lưu yêu cầu trước khi tạo lượt nghiên cứu</option>}
            {[...plans].reverse().map((plan) => <option value={plan.version} key={plan.id}>Phiên bản {plan.version} · {new Date(plan.created_at).toLocaleDateString('vi-VN')}</option>)}
          </select>
          <button type="button" className="primary-action" disabled={!plans.length || creatingRun || !runPlanVersion} onClick={() => void createRun()}>{creatingRun ? 'Đang tạo…' : 'Tạo lượt nghiên cứu'}</button>
        </div>
        {runs.length === 0 ? <p className="state-message">Chưa có lượt nghiên cứu. Tạo lượt sẽ lưu phiên bản yêu cầu đã chọn; ứng dụng không tự chạy nghiên cứu.</p> : <div className="research-run-list">
          {[...runs].sort((left, right) => right.created_at.localeCompare(left.created_at)).map((run) => <article className="research-run-row" key={run.id}>
            <div><strong>{{ queued: 'Đang chờ', collecting: 'Đang thu thập', validating: 'Đang kiểm tra', synthesizing: 'Đang tổng hợp', completed: 'Hoàn tất', completed_with_gaps: 'Hoàn tất, còn thiếu dữ liệu', partial: 'Hoàn tất một phần', failed: 'Thất bại', cancelled: 'Đã hủy' }[run.state]}</strong><span>Phiên bản yêu cầu {run.plan_version} · {new Date(run.created_at).toLocaleString('vi-VN')}</span></div>
            <a className="text-button" href={`/research/runs?runId=${encodeURIComponent(run.id)}&projectId=${encodeURIComponent(projectId)}`}>Mở lượt nghiên cứu →</a>
          </article>)}
        </div>}
      </details>
    </div>
  );
}

export function ResearchWorkspace({ mode }: { mode: 'list' | 'new' | 'data' }) {
  const projectId = new URLSearchParams(window.location.search).get('projectId');
  const view = new URLSearchParams(window.location.search).get('view');
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [recentReports, setRecentReports] = useState<ReportSummary[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState('');

  async function loadProjects(cursor?: string) {
    setLoading(true);
    setError(null);
    try {
      const page = await researchApi.listProjects(cursor);
      setProjects((current) => cursor ? [...current, ...page.items] : page.items);
      setNextCursor(page.next_cursor);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError('Projects could not be loaded.', 0, 'REQUEST_FAILED', {}));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!projectId && mode === 'list') void loadProjects(); }, [projectId, mode]);
  useEffect(() => {
    if (projectId || mode !== 'list') return;
    let active = true;
    setReportsLoading(true);
    reportApi.list().then((page) => { if (active) setRecentReports(page.items); })
      .catch((cause: unknown) => { if (active) setReportsError(cause instanceof Error ? cause.message : 'Không tải được báo cáo gần đây.'); })
      .finally(() => { if (active) setReportsLoading(false); });
    return () => { active = false; };
  }, [projectId, mode]);

  if (projectId && (mode === 'data' || view === 'data')) return <DataFirstWorkspace projectId={projectId} />;
  if (projectId && view === 'plan') return <PlanEditor projectId={projectId} />;
  if (projectId) return <ProjectHome projectId={projectId} />;
  if (mode === 'new') return <NewProjectForm />;
  return <ProjectList projects={projects} nextCursor={nextCursor} onLoadMore={() => void loadProjects(nextCursor ?? undefined)} loading={loading} error={error} onRetry={() => void loadProjects()} recentReports={recentReports} reportsLoading={reportsLoading} reportsError={reportsError} />;
}
