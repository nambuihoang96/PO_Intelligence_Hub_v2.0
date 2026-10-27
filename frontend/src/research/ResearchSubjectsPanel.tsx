import { useEffect, useState, type ChangeEvent } from 'react';
import { researchApi, type ResearchBenchmarkCollection, type ResearchSubject, type ResearchSubjectAnalysisSection, type ResearchSubjectSource } from './api';

function sourceKey(source: ResearchSubjectSource): string {
  return [source.source_kind, source.source_id, source.source_key].join('|');
}

export function ResearchSubjectsPanel({ projectId }: { projectId: string }) {
  const [subjects, setSubjects] = useState<ResearchSubject[]>([]);
  const [sources, setSources] = useState<ResearchSubjectSource[]>([]);
  const [collections, setCollections] = useState<ResearchBenchmarkCollection[]>([]);
  const [sourceCursor, setSourceCursor] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [analysisDrafts, setAnalysisDrafts] = useState<Record<string, ResearchSubjectAnalysisSection[]>>({});
  const [customSectionLabels, setCustomSectionLabels] = useState<Record<string, string>>({});
  const [collectionName, setCollectionName] = useState('');
  const [collectionSubjectDrafts, setCollectionSubjectDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(append = false) {
    setLoading(true); setError('');
    try {
      const [subjectPage, sourcePage, collectionPage] = await Promise.all([
        researchApi.listSubjects(projectId),
        researchApi.listSubjectSources(projectId, append ? sourceCursor ?? undefined : undefined),
        researchApi.listBenchmarkCollections(projectId),
      ]);
      setSubjects(subjectPage.items);
      setCollections(collectionPage.items);
      setSources((current) => append ? [...current, ...sourcePage.items] : sourcePage.items);
      setSourceCursor(sourcePage.next_cursor);
      setDrafts((current) => {
        const next = append ? { ...current } : {};
        for (const item of sourcePage.items) if (current[sourceKey(item)] === undefined) next[sourceKey(item)] = item.mapped_subject_id ?? '';
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load research subjects.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [projectId]);

  async function mapSource(source: ResearchSubjectSource, createFromSource = false) {
    const key = sourceKey(source);
    const selected = drafts[key] || '';
    if (!selected && !createFromSource) return;
    setBusy(key); setError(''); setNotice('');
    try {
      await researchApi.mapSubjectSource(projectId, {
        source_kind: source.source_kind, source_id: source.source_id, source_key: source.source_key,
        ...(createFromSource ? { create_subject_from_source: true } : { subject_id: selected }),
        ...(source.mapped_subject_id && source.mapped_subject_id !== selected ? { expected_subject_id: source.mapped_subject_id } : {}),
      });
      setNotice(createFromSource ? 'Subject created from the supplied source identity and linked.' : 'Source linked to the selected subject.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this subject link.');
      await load();
    } finally { setBusy(null); }
  }

  async function saveName(subject: ResearchSubject) {
    setBusy(subject.id); setError(''); setNotice('');
    try {
      await researchApi.updateSubject(projectId, subject.id, { name: editName });
      setEditingId(null); setNotice('Subject name saved.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update subject.'); }
    finally { setBusy(null); }
  }

  function toggleProfile(subject: ResearchSubject) {
    if (profileId === subject.id) { setProfileId(null); return; }
    setProfileId(subject.id);
    setAnalysisDrafts((current) => current[subject.id] !== undefined ? current : ({ ...current, [subject.id]: (subject.analysis_sections ?? []).map((item) => ({ ...item })) }));
    setError(''); setNotice('');
  }

  function editAnalysisSection(subjectId: string, key: string, field: 'label' | 'content', value: string) {
    setAnalysisDrafts((current) => ({ ...current, [subjectId]: (current[subjectId] ?? []).map((item) => item.key === key ? { ...item, [field]: value } : item) }));
  }

  function addAnalysisSection(subject: ResearchSubject, label: string) {
    const cleanLabel = label.trim();
    if (!cleanLabel) return;
    const sections = analysisDrafts[subject.id] ?? subject.analysis_sections ?? [];
    if (sections.some((item) => item.label.trim().toLocaleLowerCase() === cleanLabel.toLocaleLowerCase())) {
      setError('A section with this title already exists in this subject profile.'); return;
    }
    const key = `${cleanLabel.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-') || 'section'}-${Date.now()}`;
    setAnalysisDrafts((current) => ({ ...current, [subject.id]: [...(current[subject.id] ?? subject.analysis_sections ?? []), { key, label: cleanLabel, content: '' }] }));
    setCustomSectionLabels((current) => ({ ...current, [subject.id]: '' })); setError(''); setNotice('');
  }

  function changeCustomSectionLabel(subjectId: string, event: ChangeEvent<HTMLInputElement>) {
    setCustomSectionLabels((current) => ({ ...current, [subjectId]: event.target.value }));
  }

  async function saveAnalysis(subject: ResearchSubject) {
    const sections = analysisDrafts[subject.id] ?? [];
    if (sections.some((item) => !item.label.trim() || !item.content.trim())) {
      setError('Add content to each analysis section or remove the empty draft before saving.'); return;
    }
    setBusy(`analysis:${subject.id}`); setError(''); setNotice('');
    try {
      await researchApi.updateSubject(projectId, subject.id, { analysis_sections: sections.map((item) => ({ ...item, label: item.label.trim(), content: item.content.trim() })) });
      setNotice('Subject analysis saved. These are PO notes and are not independently verified.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the subject analysis. Your draft is still here.'); }
    finally { setBusy(null); }
  }

  async function createCollection() {
    if (!collectionName.trim()) return;
    setBusy('new-collection'); setError(''); setNotice('');
    try {
      await researchApi.createBenchmarkCollection(projectId, { name: collectionName.trim() });
      setCollectionName(''); setNotice('Benchmark collection created. Add only the subjects you want to compare.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create this collection.'); }
    finally { setBusy(null); }
  }

  async function updateCollectionMember(collection: ResearchBenchmarkCollection, subjectId: string, add: boolean) {
    const key = `${collection.id}:${subjectId}`;
    setBusy(key); setError(''); setNotice('');
    try {
      if (add) await researchApi.addBenchmarkCollectionSubject(projectId, collection.id, subjectId);
      else await researchApi.removeBenchmarkCollectionSubject(projectId, collection.id, subjectId);
      setNotice(add ? `Subject added to ${collection.name}.` : `Subject removed from ${collection.name}. Its saved identity and source links remain.`);
      setCollectionSubjectDrafts((current) => ({ ...current, [collection.id]: '' }));
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this collection.'); }
    finally { setBusy(null); }
  }

  function renderSubjectProfile(subject: ResearchSubject) {
    const savedSections = subject.analysis_sections ?? [];
    const sections = analysisDrafts[subject.id] ?? savedSections;
    const hasChanges = JSON.stringify(savedSections) !== JSON.stringify(sections);
    const linkedSources = sources.filter((source) => source.mapped_subject_id === subject.id);
    const subjectCollections = collections.filter((collection) => collection.members.some((member) => member.subject_id === subject.id));
    return <article className="research-subject-item research-subject-profile-item" key={subject.id}>
      <div className="research-subject-profile-heading">
        {editingId === subject.id ? <><label>Subject name<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
          <button type="button" className="secondary-action" disabled={busy === subject.id || !editName.trim()} onClick={() => void saveName(subject)}>Save name</button>
          <button type="button" className="text-button" onClick={() => setEditingId(null)}>Cancel</button></>
          : <><div><strong>{subject.name}</strong><small>{subject.subject_type || 'Type not specified'}{subject.aliases.length ? ` · ${subject.aliases.join(', ')}` : ''}</small></div>
            <button type="button" className="text-button" onClick={() => { setEditingId(subject.id); setEditName(subject.name); }}>Edit name</button>
            <button type="button" className="secondary-action" aria-expanded={profileId === subject.id} onClick={() => toggleProfile(subject)}>{profileId === subject.id ? 'Close profile' : 'Open profile'}</button></>}
      </div>
      {profileId === subject.id && <section className="research-subject-profile" aria-label={`${subject.name} profile`}>
        <div className="research-subject-profile-summary"><div><h4>{subject.name}</h4><p>{subject.subject_type || 'Type not specified'} · {linkedSources.length} linked source{linkedSources.length === 1 ? '' : 's'} · {subjectCollections.length} collection{subjectCollections.length === 1 ? '' : 's'} · {savedSections.length} saved analysis section{savedSections.length === 1 ? '' : 's'}</p></div>
          <nav aria-label={`${subject.name} related workspace sections`}><a href="#project-trend-updates">Trend updates</a><a href="#project-image-evidence">Image evidence</a><a href="#project-benchmark-collections">Collections</a></nav></div>
        <div className="research-subject-profile-details"><p><strong>Aliases:</strong> {subject.aliases.length ? subject.aliases.join(', ') : 'None supplied'}</p>
          <p><strong>External identifiers:</strong> {subject.external_ids.length ? 'Available in source details' : 'None supplied'}</p>
          <details><summary>Source identity details</summary><ul>
            {subject.external_ids.map((item, index) => <li key={`${item.provider}:${item.value}:${index}`}>{item.provider}: {item.value}</li>)}
            {Object.entries(subject.provenance).map(([key, value]) => <li key={key}>{key}: {typeof value === 'string' ? value : JSON.stringify(value)}</li>)}
          </ul></details>
        </div>
        <section className="research-subject-analysis" aria-label={`${subject.name} optional analysis`}>
          <div><h5>Optional PO analysis</h5><p>These are your working notes. They remain separate from source-reported research and can use any section names.</p></div>
          <div className="research-subject-analysis-starters" aria-label="Suggested optional analysis sections">
            {['Core Loop', 'Level Design', 'Ad Placement'].map((label) => <button type="button" className="text-button" key={label} disabled={sections.some((item) => item.label.toLocaleLowerCase() === label.toLocaleLowerCase())} onClick={() => addAnalysisSection(subject, label)}>Add {label}</button>)}
          </div>
          <form className="research-subject-analysis-custom" onSubmit={(event) => { event.preventDefault(); addAnalysisSection(subject, customSectionLabels[subject.id] ?? ''); }}>
            <label htmlFor={`custom-analysis-${subject.id}`}>Custom section title</label><input id={`custom-analysis-${subject.id}`} maxLength={120} value={customSectionLabels[subject.id] ?? ''} onChange={(event) => changeCustomSectionLabel(subject.id, event)} placeholder="Use a topic relevant to this subject" />
            <button className="secondary-action" type="submit" disabled={!(customSectionLabels[subject.id] ?? '').trim()}>Add custom section</button>
          </form>
          {!sections.length && <p>No optional analysis sections yet.</p>}
          <div className="research-subject-analysis-list">{sections.map((section) => <article key={section.key}>
            <label>Section title<input maxLength={120} value={section.label} onChange={(event) => editAnalysisSection(subject.id, section.key, 'label', event.target.value)} /></label>
            <label>PO analysis<textarea rows={3} maxLength={20_000} value={section.content} onChange={(event) => editAnalysisSection(subject.id, section.key, 'content', event.target.value)} placeholder={`Add your notes for ${section.label}.`} /></label>
            <button type="button" className="text-button" onClick={() => setAnalysisDrafts((current) => ({ ...current, [subject.id]: (current[subject.id] ?? []).filter((item) => item.key !== section.key) }))}>Remove from draft</button>
          </article>)}</div>
          <div className="research-subject-analysis-actions">{hasChanges && <span>Unsaved changes</span>}
            <button type="button" className="primary-action" disabled={!hasChanges || busy === `analysis:${subject.id}`} onClick={() => void saveAnalysis(subject)}>{busy === `analysis:${subject.id}` ? 'Saving analysis…' : 'Save PO analysis'}</button>
            {hasChanges && <button type="button" className="text-button" onClick={() => setAnalysisDrafts((current) => ({ ...current, [subject.id]: savedSections.map((item) => ({ ...item })) }))}>Discard draft changes</button>}
          </div>
        </section>
      </section>}
    </article>;
  }

  return <details className="research-subjects-panel">
    <summary><span>Research subjects</span><small>{subjects.length} saved · reusable identities across this project</small></summary>
    <div className="research-subjects-content">
      <p>Names from reports and CSVs stay source-specific until you link them. Similar names are never merged automatically.</p>
      {error && <div className="research-alert" role="alert">{error}</div>}
      {notice && <div className="research-success" role="status">{notice}</div>}
      {loading && !subjects.length && !sources.length ? <p role="status">Loading subjects and source identities…</p> : <>
        <section aria-label="Saved research subjects" className="research-subject-list">
          <h3>Saved in this project</h3>
          {subjects.length ? subjects.map(renderSubjectProfile) : <p>No reusable subjects saved yet.</p>}
        </section>
        <section id="project-benchmark-collections" aria-label="Project benchmark collections" className="research-benchmark-collections">
          <div className="research-collections-heading"><div><h3>Benchmark collections</h3><p>Group confirmed subjects for reuse. Source reports and CSV data remain unchanged.</p></div></div>
          <form className="research-collection-create" onSubmit={(event) => { event.preventDefault(); void createCollection(); }}>
            <label htmlFor="new-benchmark-collection">Collection name</label>
            <input id="new-benchmark-collection" value={collectionName} onChange={(event) => setCollectionName(event.target.value)} placeholder="e.g. Products to compare" maxLength={200} />
            <button type="submit" className="secondary-action" disabled={!collectionName.trim() || busy === 'new-collection'}>{busy === 'new-collection' ? 'Creating…' : 'Create collection'}</button>
          </form>
          {!collections.length ? <p>No collections yet. Create one, then add project subjects when ready.</p> : collections.map((collection) => {
            const memberIds = new Set(collection.members.map((member) => member.subject_id));
            const availableSubjects = subjects.filter((subject) => !memberIds.has(subject.id));
            const selectedSubject = collectionSubjectDrafts[collection.id] ?? '';
            return <article className="research-benchmark-collection" key={collection.id}>
              <header><div><strong>{collection.name}</strong><small>{collection.members.length} subject{collection.members.length === 1 ? '' : 's'} · project collection</small>{collection.description && <p>{collection.description}</p>}</div></header>
              {collection.members.length ? <ul>{collection.members.map((member) => <li key={member.subject_id}>
                <div><strong>{member.name}</strong><small>{member.subject_type || 'Type not specified'} · {member.source_count} linked input{member.source_count === 1 ? '' : 's'} ({member.report_source_count} reports, {member.csv_source_count} CSVs, {member.trend_update_count} trend updates)</small></div>
                <button type="button" className="text-button" disabled={busy === `${collection.id}:${member.subject_id}`} onClick={() => void updateCollectionMember(collection, member.subject_id, false)}>Remove from collection</button>
              </li>)}</ul> : <p>This collection is empty. Add confirmed subjects to start organizing a comparison.</p>}
              {collection.members.length > 0 && <details className="research-collection-matrix">
                <summary>View source-backed comparison{collection.dimensions.length ? ` · ${collection.dimensions.length} supplied dimension${collection.dimensions.length === 1 ? '' : 's'}` : ''}</summary>
                {collection.dimensions.length ? <div className="research-collection-matrix-scroll"><table><thead><tr><th scope="col">Subject</th>{collection.dimensions.map((dimension) => <th scope="col" key={dimension.key}>{dimension.name}<small>{dimension.source_kind === 'report_entity' ? 'Report-supplied' : dimension.source_kind === 'trend_update' ? 'Source-reported updates' : 'CSV imported'}</small></th>)}</tr></thead>
                  <tbody>{collection.members.map((member) => <tr key={member.subject_id}><th scope="row">{member.name}</th>{collection.dimensions.map((dimension) => {
                    const values = member.observations.filter((observation) => observation.dimension_key === dimension.key);
                    return <td key={dimension.key}>{values.length ? values.map((observation, index) => <div className="research-collection-observation" key={`${observation.source_name}:${index}`}>
                      <strong>{observation.value === null || observation.value === undefined || observation.value === '' ? 'Unknown / Not provided' : String(observation.value)}{observation.unit ? ` ${observation.unit}` : ''}</strong>
                      <small>{observation.source_name} · {observation.source_kind === 'trend_update' ? 'Source-reported · unverified' : observation.verification_status}</small>
                      {observation.source_note && <small>Source note: {observation.source_note}</small>}
                      {Object.entries(observation.scope).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => <small key={label}>{label}: {String(value)}</small>)}
                      {observation.evidence_status && <small>Evidence: {observation.evidence_status}</small>}
                      {observation.uncertainty && <small>Uncertainty: {observation.uncertainty}</small>}
                      {observation.validation_reasons.length > 0 && <details className="research-collection-validation"><summary>Validation details · {observation.validation_reasons.length}</summary><ul>{observation.validation_reasons.map((reason, reasonIndex) => <li key={`${reasonIndex}:${reason}`}>{reason}</li>)}</ul></details>}
                      {observation.evidence_references.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">Open source</a>)}
                      {observation.source_locations.map((location, locationIndex) => <small key={`${locationIndex}:${location}`}>{location}</small>)}
                    </div>) : <span className="research-collection-unknown">Unknown / Not provided</span>}</td>;
                  })}</tr>)}</tbody></table></div> : <p>No explicit report dimensions or mapped CSV observations are available yet. Missing information stays unknown.</p>}
              </details>}
              <div className="research-collection-add">
                <label className="sr-only" htmlFor={`collection-subject-${collection.id}`}>Choose a project subject to add to {collection.name}</label>
                <select id={`collection-subject-${collection.id}`} value={selectedSubject} onChange={(event) => setCollectionSubjectDrafts((current) => ({ ...current, [collection.id]: event.target.value }))} disabled={!availableSubjects.length}>
                  <option value="">{availableSubjects.length ? 'Choose a confirmed subject…' : 'All saved subjects are already members'}</option>
                  {availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
                <button type="button" className="secondary-action" disabled={!selectedSubject || busy === `${collection.id}:${selectedSubject}`} onClick={() => void updateCollectionMember(collection, selectedSubject, true)}>Add subject</button>
              </div>
            </article>;
          })}
        </section>
        <section aria-label="Report and CSV identities" className="research-subject-sources">
          <h3>Names found in this project’s sources</h3>
          {!sources.length ? <p>No structured report entities or stable CSV identities are available to link.</p> : sources.map((source) => {
            const key = sourceKey(source);
            const selected = drafts[key] ?? source.mapped_subject_id ?? '';
            return <article className="research-subject-source" key={key}>
              <div><strong>{source.source_name}</strong><small>{source.source_kind === 'report_entity' ? 'Report' : 'CSV'} · {source.context_name}</small>
                {source.source_state === 'stale' && <small role="status">Historical link · source no longer exposes this identity</small>}
                {source.mapped_subject_name && <small>Linked to {source.mapped_subject_name}</small>}</div>
              {source.source_state === 'available' && <div className="research-subject-source-actions">
                <label className="sr-only" htmlFor={`subject-target-${encodeURIComponent(key)}`}>Link {source.source_name} to a saved subject</label>
                <select id={`subject-target-${encodeURIComponent(key)}`} value={selected} disabled={busy === key || subjects.length === 0}
                  onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}>
                  <option value="">Choose a saved subject…</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
                {subjects.length > 0 && <button type="button" className="secondary-action" disabled={busy === key || !selected || selected === source.mapped_subject_id}
                  onClick={() => void mapSource(source)}>{busy === key ? 'Saving…' : source.mapped_subject_id ? 'Change link' : 'Link subject'}</button>}
                {!source.mapped_subject_id && <button type="button" className="text-button" disabled={busy === key}
                  onClick={() => void mapSource(source, true)}>{busy === key ? 'Creating…' : 'Create subject from this name'}</button>}
              </div>}
            </article>;
          })}
          {sourceCursor && <button type="button" className="secondary-action" disabled={loading} onClick={() => void load(true)}>{loading ? 'Loading…' : 'Load more source identities'}</button>}
        </section>
      </>}
    </div>
  </details>;
}
