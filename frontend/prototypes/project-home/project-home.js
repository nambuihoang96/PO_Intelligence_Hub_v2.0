const $ = (selector) => document.querySelector(selector);
const views = { home: $('#home-view'), flow: $('#flow-view'), report: $('#report-view') };
const state = { project: 'puzzle', flow: null, step: 1, subjectMode: 'new', emptyUpdateSaved: false, emptyReportSaved: false, reportTitle: 'What keeps puzzle players engaged?' };

function showView(name) {
  Object.entries(views).forEach(([key, node]) => node.classList.toggle('active', key === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => { el.hidden = true; }, 3200);
}
function setProject(kind) {
  state.project = kind;
  const empty = kind === 'empty';
  const title = empty ? 'New Research Project' : 'Puzzle Discovery';
  $('#project-title').textContent = title;
  $('#crumb-project').textContent = title;
  $('#report-project-link').textContent = title;
  $('#project-description').textContent = empty ? 'A focused space for research, updates and decisions.' : 'Understand what keeps players coming back to creative puzzle games.';
  $('#project-symbol').textContent = empty ? '+' : '✦';
  $('#project-empty').hidden = !empty;
  $('#reports-list').hidden = empty;
  $('#empty-reports-list').hidden = !empty || !state.emptyReportSaved;
  $('#reports-empty').hidden = !empty || state.emptyReportSaved;
  $('#activity-list').hidden = empty;
  $('#empty-activity-list').hidden = !empty || !state.emptyUpdateSaved;
  $('#activity-empty').hidden = !empty || state.emptyUpdateSaved;
  $('#collection-open').hidden = empty;
  $('#collections-empty').hidden = !empty;
  $('#subject-list').hidden = empty;
  $('#empty-subject-list').hidden = !empty || !state.emptyUpdateSaved;
  $('#subjects-empty').hidden = !empty || state.emptyUpdateSaved;
}
function showProjectOptions() {
  const chooseEmpty = state.project === 'puzzle';
  setProject(chooseEmpty ? 'empty' : 'puzzle');
}
function field(label, name, placeholder, helper = '', type = 'text') {
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" placeholder="${placeholder}" />${helper ? `<p class="help">${helper}</p>` : ''}</div>`;
}
function openFlow(kind) {
  state.flow = kind;
  state.step = 1;
  if (kind === 'trend') state.subjectMode = 'new';
  $('#flow-feedback').hidden = true;
  $('#flow-feedback').classList.remove('info');
  $('#flow-continue').innerHTML = 'Review next step <span>→</span>';
  $('#flow-back').textContent = '← Back to project';
  const flows = {
    deep: {
      eyebrow: 'DEEP RESEARCH', title: 'What would you like to learn?', intro: 'Start with your question. We’ll keep the scope with this project so the report is easy to find later.',
      fields: `${field('Research question', 'research-question', 'e.g. What makes cozy puzzle games feel rewarding?')}<div class="field inline"><div><label for="geo">Market</label><select id="geo"><option>Global / not specified</option><option>United States</option><option>Vietnam</option><option>Japan</option></select></div><div><label for="platform">Platform</label><select id="platform"><option>Not specified</option><option>iOS</option><option>Android</option><option>Web</option><option>Cross-platform</option></select></div></div><div class="field"><label for="period">Research period <span class="optional">Optional</span></label><input id="period" placeholder="e.g. Q3 2026" /></div>`,
      continue: 'Review research brief <span>→</span>'
    },
    trend: {
      eyebrow: 'CAPTURE A TREND UPDATE', title: 'What changed, and where?', intro: 'Save an observation with its source. First choose the product or topic this update is about.',
      fields: `<div class="field"><span class="field-label">Choose a subject</span><div class="subject-choice"><label class="choice"><input type="radio" name="subject-mode" value="new" checked /><span><b>Create a new subject</b><small>Add a product or topic not listed yet</small></span></label><label class="choice"><input type="radio" name="subject-mode" value="existing" /><span><b>Choose an existing subject</b><small>Link this update to a saved product</small></span></label></div></div><div id="subject-entry">${field('Product or topic name', 'new-subject', 'e.g. Rotate Rings', 'This creates the subject and keeps the update together.')}</div><div id="existing-subject" class="field" hidden><label for="saved-subject">Saved product or topic</label><select id="saved-subject"><option>Save the Forest</option><option>Cozy Tiles</option><option>Merge Garden</option></select></div><div class="field"><label for="trend-note">What did you find?</label><textarea id="trend-note" placeholder="Write the exact observation in your own words."></textarea></div><div class="field inline"><div><label for="trend-source">Where did it come from?</label><input id="trend-source" placeholder="Source name or link" /></div><div><label for="trend-date">When was it published?</label><input id="trend-date" type="date" /></div></div>`,
      continue: 'Review update <span>→</span>'
    },
    csv: {
      eyebrow: 'IMPORT A DATASET', title: 'Bring in project data', intro: 'Choose a CSV to review. It will only be linked to this project after you confirm the details.',
      fields: `<div class="field"><label for="csv-file">Choose a CSV file</label><input id="csv-file" type="file" accept=".csv,text/csv" /><p class="help">The file is previewed before it is saved. No rows are changed in the original file.</p></div><div id="csv-preview" class="csv-preview" hidden></div><div class="field inline"><div><label for="csv-source">Data source <span class="optional">Optional</span></label><input id="csv-source" placeholder="e.g. Sensor Tower" /></div><div><label for="csv-scope">Market <span class="optional">Confirm if known</span></label><input id="csv-scope" placeholder="Leave blank if unknown" /></div></div>`,
      continue: 'Review dataset <span>→</span>'
    }
  };
  const config = flows[kind];
  $('#flow-eyebrow').textContent = config.eyebrow;
  $('#flow-title').textContent = config.title;
  $('#flow-intro').textContent = config.intro;
  $('#flow-fields').innerHTML = config.fields;
  $('#flow-continue').innerHTML = config.continue;
  $('#flow-continue').dataset.originalLabel = config.continue;
  $('#flow-progress').hidden = false;
  $('#flow-step-3').hidden = kind !== 'deep';
  $('#flow-line-2').hidden = kind !== 'deep';
  $('#flow-step-2').innerHTML = `<i>2</i> ${kind === 'deep' ? 'Review brief' : 'Review details'}`;
  showView('flow');
  if (kind === 'trend') {
    document.querySelectorAll('[name="subject-mode"]').forEach((radio) => radio.addEventListener('change', () => {
      state.subjectMode = radio.value;
      $('#subject-entry').hidden = state.subjectMode !== 'new';
      $('#existing-subject').hidden = state.subjectMode !== 'existing';
    }));
  }
  if (kind === 'csv') {
    $('#csv-file').addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const lines = String(reader.result).split(/\r?\n/).filter(Boolean).slice(0, 4);
        const preview = $('#csv-preview');
        preview.hidden = false;
        preview.innerHTML = `<strong>${escapeHtml(file.name)}</strong><small>Preview · first ${Math.max(0, lines.length - 1)} data rows</small><pre>${escapeHtml(lines.join('\n'))}</pre>`;
      };
      reader.readAsText(file);
    });
  }
}
function escapeHtml(value) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function advanceFlow() {
  if (state.step === 4) { showView('home'); return; }
  const feedback = $('#flow-feedback');
  feedback.hidden = false;
  if (state.step === 1) {
    if (state.flow === 'deep' && !$('#research-question').value.trim()) {
      feedback.className = 'flow-feedback error';
      feedback.textContent = 'Add a research question before reviewing this brief.';
      $('#research-question').focus();
      return;
    }
    if (state.flow === 'trend') {
      const subject = state.subjectMode === 'new' ? $('#new-subject').value.trim() : $('#saved-subject').value;
      if (!subject) {
        feedback.className = 'flow-feedback error'; feedback.textContent = 'Add the product or topic name to continue.'; $('#new-subject').focus(); return;
      }
      state.subjectName = subject;
    }
    if (state.flow === 'csv' && !$('#csv-file').files?.length) {
      feedback.className = 'flow-feedback error'; feedback.textContent = 'Choose a CSV file to see a preview first.'; $('#csv-file').focus(); return;
    }
    state.step = 2;
    document.querySelectorAll('.progress-step').forEach((node, index) => node.classList.toggle('current', index < 2));
    const summary = state.flow === 'deep' ? `Your question: “${$('#research-question').value.trim()}”. The next step is to review the brief and use it with ChatGPT. PO Hub will not run AI research.` : state.flow === 'trend' ? `This update will be saved under “${state.subjectName}” in ${$('#project-title').textContent}. The source stays marked as supplied, not independently verified.` : `This file will be reviewed and linked to ${$('#project-title').textContent} only after you confirm its scope and preview.`;
    feedback.className = 'flow-feedback info'; feedback.textContent = summary;
    $('#flow-continue').textContent = state.flow === 'deep' ? 'Copy research prompt' : state.flow === 'trend' ? 'Save update' : 'Confirm project link';
    return;
  }
  if (state.flow === 'deep') {
    if (state.step === 2) {
      const prompt = `Research question: ${$('#research-question').value.trim()}\nMarket: ${$('#geo').value}\nPlatform: ${$('#platform').value}\nResearch period: ${$('#period').value || 'Not specified'}\n\nAnswer directly, cite real sources, separate unknowns, and do not invent metrics.`;
      if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(prompt).then(() => toast('Research brief copied. Open ChatGPT to continue.'), () => toast('Copy was unavailable; the brief remains on this screen.'));
      feedback.className = 'flow-feedback info'; feedback.textContent = 'Use the copied brief in ChatGPT. When you return, paste its full response here so it is kept with this project. PO Hub does not run AI research.';
      $('#flow-title').textContent = 'Bring your research back to this project';
      $('#flow-eyebrow').textContent = 'NEXT · IMPORT YOUR REPORT';
      $('#flow-intro').textContent = 'Paste the complete ChatGPT response once. Your original report remains part of this project.';
      $('#flow-fields').innerHTML = `<div class="field"><label for="chatgpt-report">ChatGPT research report</label><textarea id="chatgpt-report" placeholder="Paste the complete report here…"></textarea><p class="help">One paste · original wording retained · no AI call from PO Hub.</p></div>`;
      state.step = 3;
      document.querySelectorAll('.progress-step').forEach((node, index) => node.classList.toggle('current', index < 3));
      $('#flow-continue').textContent = 'Preview report import';
      return;
    }
    const report = $('#chatgpt-report').value.trim();
    if (!report) {
      feedback.className = 'flow-feedback error'; feedback.textContent = 'Paste the report before previewing the import.'; $('#chatgpt-report').focus(); return;
    }
    feedback.className = 'flow-feedback'; feedback.textContent = `Preview ready (${report.length.toLocaleString()} characters). In the application, this step saves the original report and links it to this project. This prototype does not write to SQLite.`;
    state.step = 4;
    $('#flow-continue').textContent = 'Back to project';
  } else if (state.flow === 'trend') {
    const activity = state.project === 'empty' ? $('#empty-activity-list') : $('#activity-list');
    const reportRow = document.createElement('div');
    reportRow.className = 'activity-item';
    reportRow.innerHTML = `<span class="timeline-dot peach"></span><span><b>Trend update saved for ${escapeHtml(state.subjectName)}</b><small>Source-reported · not independently verified · just now</small></span>`;
    activity.prepend(reportRow);
    if (state.project === 'empty') state.emptyUpdateSaved = true;
    if (state.subjectMode === 'new') {
      const chip = document.createElement('span'); chip.className = 'subject-pill'; chip.innerHTML = `<i class="subject-avatar">${escapeHtml(state.subjectName.slice(0,1).toUpperCase())}</i>${escapeHtml(state.subjectName)}`; (state.project === 'empty' ? $('#empty-subject-list') : $('#subject-list')).prepend(chip);
    }
    setProject(state.project);
    feedback.className = 'flow-feedback'; feedback.textContent = `Update saved for ${state.subjectName}. It is labeled source-reported until someone verifies it.`;
    state.step = 4;
    $('#flow-continue').textContent = 'Back to project';
  } else {
    const file = $('#csv-file').files[0];
    feedback.className = 'flow-feedback'; feedback.textContent = `${file.name} is ready to review in this project. This demo does not write to the application database.`;
    state.step = 4;
    $('#flow-continue').textContent = 'Back to project';
  }
}

document.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => {
  const action = button.dataset.open;
  if (action === 'report') { showView('report'); return; }
  openFlow(action);
}));
$('#project-menu').addEventListener('click', showProjectOptions);
$('#flow-back').addEventListener('click', () => showView('home'));
$('#flow-cancel').addEventListener('click', () => showView('home'));
$('#flow-continue').addEventListener('click', advanceFlow);
$('#report-back').addEventListener('click', () => showView('home'));
$('#report-source').addEventListener('click', () => toast('Original source is a demo report and opens in this project context.'));
$('#report-project-link').addEventListener('click', (event) => { event.preventDefault(); showView('home'); });
$('#all-reports').addEventListener('click', () => toast('All reports for this project are shown in this list.'));
$('#view-collections').addEventListener('click', () => toast('Project collections stay together in this workspace.'));
$('#view-subjects').addEventListener('click', () => toast('Products and topics can be confirmed when you capture an update.'));
$('#collection-open').addEventListener('click', () => toast('Puzzle October · 3 products · demo collection'));
$('#project-menu').setAttribute('aria-label', 'Switch between demo project states');
