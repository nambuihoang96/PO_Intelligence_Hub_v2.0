import { useEffect, useMemo, useState } from 'react';
import { reportApi, type ReportSummary } from '../reports/api';
import { researchApi, type ProjectTrendUpdate, type ResearchBenchmarkCollection, type ResearchProject, type ResearchSubject } from './api';
import { ResultsIcon } from '../ui/ResultsIcon';
import './ProjectHome.css';

type ProjectHomeData = {
  project: ResearchProject;
  reports: ReportSummary[];
  collections: ResearchBenchmarkCollection[];
  subjects: ResearchSubject[];
  updates: ProjectTrendUpdate[];
};

function reportTitle(report: ReportSummary): string {
  return report.question || 'Research report';
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date not recorded' : date.toLocaleDateString();
}

export function ProjectHome({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      researchApi.getProject(projectId),
      reportApi.listProjectReports(projectId),
      researchApi.listBenchmarkCollections(projectId),
      researchApi.listSubjects(projectId),
      researchApi.listTrendUpdates(projectId, { limit: 10 }),
    ]).then(([project, reports, collections, subjects, updates]) => {
      if (active) setData({ project, reports: reports.items, collections: collections.items, subjects: subjects.items, updates: updates.items });
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not open this project. Please try again.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  const activity = useMemo(() => {
    if (!data) return [];
    return [
      ...data.reports.map((report) => ({ id: `report-${report.id}`, label: 'Research report added', detail: reportTitle(report), date: report.imported_at, href: `/reports/${encodeURIComponent(report.id)}` })),
      ...data.updates.map((update) => ({ id: `update-${update.id}`, label: 'Trend update captured', detail: update.subject_name, date: update.created_at, href: `/research?projectId=${encodeURIComponent(projectId)}&view=data#project-trend-updates` })),
    ].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 5);
  }, [data, projectId]);

  if (loading) return <section className="project-home-state" role="status">Opening your project…</section>;
  if (error || !data) return <section className="project-home-state" role="alert"><strong>We couldn’t open this project.</strong><p>{error || 'The project may have been moved or removed.'}</p><button className="secondary-action" type="button" onClick={() => window.location.reload()}>Try again</button><a className="text-button" href="/research">Back to projects</a></section>;

  const { project, reports, collections, subjects, updates } = data;
  const hasWork = reports.length > 0 || collections.length > 0 || subjects.length > 0 || updates.length > 0;
  const home = `/research?projectId=${encodeURIComponent(projectId)}`;
  const deepResearch = `${home}&view=plan`;
  const trendUpdate = `${home}&view=data#project-trend-updates`;
  const csvImport = `${home}&view=data&action=import-csv#project-csv-data`;

  return <div className="project-home">
    <header className="project-home-header">
      <div><a className="project-home-back" href="/research">← All projects</a><p className="project-home-eyebrow">YOUR RESEARCH PROJECT</p><h2>{project.name}</h2>
        <p className="project-home-description">{project.category || 'Research workspace'}{project.owner ? ` · ${project.owner}` : ''}</p></div>
      <a className="project-home-secondary" href={`/reports?projectId=${encodeURIComponent(projectId)}`}>Browse project reports <span aria-hidden="true">→</span></a>
    </header>

    {!hasWork && <section className="project-home-welcome"><div><span className="project-home-kicker">A CLEAR PLACE TO BEGIN</span><h3>Your research starts here</h3><p>Choose what you want to do. Reports and updates you save will stay together in this project.</p></div></section>}

    <section className="project-home-actions" aria-labelledby="project-home-actions-title">
      <div className="project-home-section-heading"><div><span className="project-home-kicker">WHAT WOULD YOU LIKE TO DO?</span><h3 id="project-home-actions-title">Move this research forward</h3></div></div>
      <div className="project-home-action-grid">
        <a className="project-home-action project-home-action-primary" href={deepResearch}><span className="project-home-action-mark" aria-hidden="true"><ResultsIcon name="search" /></span><span><strong>Start Deep Research</strong><small>Shape a research question and prepare a brief</small></span><span className="project-home-arrow" aria-hidden="true">→</span></a>
        <a className="project-home-action" href={trendUpdate}><span className="project-home-action-mark peach" aria-hidden="true"><ResultsIcon name="runs" /></span><span><strong>Capture Trend Update</strong><small>Record what changed and where you saw it</small></span><span className="project-home-arrow" aria-hidden="true">→</span></a>
        <a className="project-home-action" href={csvImport}><span className="project-home-action-mark lilac" aria-hidden="true"><ResultsIcon name="metric" /></span><span><strong>Import / Analyze CSV</strong><small>Bring a dataset into this project</small></span><span className="project-home-arrow" aria-hidden="true">→</span></a>
      </div>
    </section>

    <div className="project-home-content-grid">
      <section className="project-home-section project-home-reports" aria-labelledby="project-reports-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">SAVED RESEARCH</span><h3 id="project-reports-title">Research reports</h3></div><a href={`/reports?projectId=${encodeURIComponent(projectId)}`}>View all <span aria-hidden="true">→</span></a></div>
        {reports.length === 0 ? <div className="project-home-empty"><strong>No reports in this project yet</strong><p>After researching with ChatGPT, import the report to keep it here.</p><a href={`/?projectId=${encodeURIComponent(projectId)}`}>Import a ChatGPT report →</a></div> : <div className="project-home-report-list">{reports.slice(0, 5).map((report) => <a className="project-home-report" href={`/reports/${encodeURIComponent(report.id)}`} key={report.id}><span className="project-home-file-mark" aria-hidden="true"><ResultsIcon name="reports" /></span><span className="project-home-row-copy"><strong>{reportTitle(report)}</strong><small>{[report.geo, report.os, report.research_period].filter(Boolean).join(' · ') || 'Research report'}</small></span><span className="project-home-date">{dateLabel(report.imported_at)}</span><span className="project-home-arrow" aria-hidden="true">›</span></a>)}</div>}
      </section>

      <section className="project-home-section" aria-labelledby="project-activity-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">LATEST IN THIS PROJECT</span><h3 id="project-activity-title">Recent activity</h3></div></div>
        {activity.length === 0 ? <div className="project-home-empty"><p>Reports and updates you save will appear here.</p></div> : <div className="project-home-activity">{activity.map((item) => <a href={item.href} className="project-home-activity-row" key={item.id}><span className="project-home-activity-dot" aria-hidden="true" /><span className="project-home-row-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><time>{dateLabel(item.date)}</time></a>)}</div>}
      </section>

      <section className="project-home-section" aria-labelledby="project-collections-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">COMPARE PRODUCTS OR TOPICS</span><h3 id="project-collections-title">Benchmark collections</h3></div><a href={`${home}&view=data#workspace-reports`}>Open workspace <span aria-hidden="true">→</span></a></div>
        {collections.length === 0 ? <div className="project-home-empty"><p>Collections you create from confirmed subjects will appear here.</p></div> : <div className="project-home-compact-list">{collections.slice(0, 4).map((collection) => <div className="project-home-compact-row" key={collection.id}><span className="project-home-collection-mark" aria-hidden="true"><ResultsIcon name="comparison" /></span><span className="project-home-row-copy"><strong>{collection.name}</strong><small>{collection.members.length} {collection.members.length === 1 ? 'subject' : 'subjects'}</small></span><span className="project-home-arrow" aria-hidden="true">›</span></div>)}</div>}
      </section>

      <section className="project-home-section" aria-labelledby="project-subjects-title">
        <div className="project-home-section-heading"><div><span className="project-home-kicker">RESEARCH TOPICS</span><h3 id="project-subjects-title">Products and subjects</h3></div><a href={trendUpdate}>Capture an update <span aria-hidden="true">→</span></a></div>
        {subjects.length === 0 ? <div className="project-home-empty"><p>Subjects appear when you connect them to research or create one during a trend update.</p></div> : <div className="project-home-subject-list">{subjects.slice(0, 6).map((subject) => <span className="project-home-subject" key={subject.id}>{subject.name}</span>)}</div>}
      </section>
    </div>

    {reports.length > 0 && <section className="project-home-next-step"><div><span className="project-home-kicker">SUGGESTED NEXT STEP</span><h3>Review your latest research</h3><p>Open a saved report to explore findings, evidence, and decisions.</p></div><a className="project-home-next-button" href={`/reports/${encodeURIComponent(reports[0].id)}`}>Open latest report <span aria-hidden="true">→</span></a></section>}
  </div>;
}
