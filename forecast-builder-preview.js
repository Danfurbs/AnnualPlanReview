/** Phase 3 Engineer -> Discipline -> Standard Job -> Work Group Set preview. */
(function initializeForecastBuilderPreview(window) {
  const LOCAL_METADATA_KEY = 'aprForecastPlanningMetadataV1';
  const WORK_DONE_KEY = 'aprWorkDoneByYearV1';
  const PERIODS = Array.from({ length: 13 }, (_, index) => `P${index + 1}`);
  const FALLBACK_DISCIPLINE = 'Other / Unclassified';
  const state = {
    selectedYear: '', selectedEngineerId: '', filter: 'all', search: '', metadata: [],
    effectiveForecastsByYear: {}, v0ForecastsByYear: {}, workDoneByYear: {},
    loading: false, requestSerial: 0, jobsByEngineer: new Map(), expanded: new Set(), contextExpanded: new Set(), showAllHistory: new Set(), profileWorkGroup: new Map(), profileYear: new Map(), charts: new Map(), drafts: new Map(),
    workDoneUploadedByYear: {}, jobComments: {},
    historyLoadedForYear: '', temporaryEvidenceByYear: new Map(), evidenceParseSerial: 0,
    selectedCatalogueJob: '', selectedWgs: '', addWgsJob: '', lastAddJobTrigger: null
  };
  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const normalizeJob = value => window.normalizeJobNumber?.(value) || String(value || '').replace(/^0+(?=\d)/, '');
  const catalogue = () => (window.STANDARD_JOBS || []).map(job => ({
    jobNumber: normalizeJob(job.standardJobNo), storedJobNumber: String(job.standardJobNo),
    description: job.standardJobDescription || '', unit: job.unitOfMeasure || '',
    discipline: String(job.discipline || '').trim() || FALLBACK_DISCIPLINE
  }));
  const compareJobs = (a, b) => {
    const an = /^\d+$/.test(a.jobNumber), bn = /^\d+$/.test(b.jobNumber);
    if (an && bn) return Number(a.jobNumber) - Number(b.jobNumber) || a.jobNumber.localeCompare(b.jobNumber);
    if (an !== bn) return an ? -1 : 1;
    return a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true, sensitivity: 'base' });
  };
  function groupJobs(jobs) {
    const groups = new Map();
    jobs.forEach(job => {
      const detail = catalogue().find(item => item.jobNumber === normalizeJob(job.jobNumber));
      const discipline = detail?.discipline || FALLBACK_DISCIPLINE;
      if (!groups.has(discipline)) groups.set(discipline, []);
      groups.get(discipline).push({ ...job, jobNumber: String(job.jobNumber), catalogue: detail });
    });
    return Array.from(groups, ([discipline, items]) => ({ discipline, jobs: items.sort(compareJobs) }))
      .sort((a, b) => a.discipline.localeCompare(b.discipline, undefined, { sensitivity: 'base' }));
  }
  function ensureLoadingStyles() {
    if (byId('forecastPreviewLoadingStyles')) return;
    const style = document.createElement('style'); style.id = 'forecastPreviewLoadingStyles'; style.textContent = `.preview-loading-card{max-width:520px;margin:48px auto;padding:24px;border:1px solid #dbe3ef;border-radius:12px;background:#fff}.preview-loading-head{display:flex;align-items:center;gap:12px;font-weight:750}.preview-loading-spinner{width:20px;height:20px;border:3px solid #dbeafe;border-top-color:#2563eb;border-radius:50%;animation:preview-spin .8s linear infinite}.preview-loading-detail,.preview-loading-note{margin-top:10px;color:#64748b;font-size:12px}.preview-loading-track{height:7px;margin-top:12px;overflow:hidden;border-radius:999px;background:#e2e8f0}.preview-loading-bar{height:100%;background:#2563eb}@keyframes preview-spin{to{transform:rotate(360deg)}}`;
    document.head.appendChild(style);
  }
  function setLoadingProgress(title, detail, percent = 0) { ensureLoadingStyles(); const target = byId('forecastPreviewLoading'); if (target) target.innerHTML = `<div class="preview-loading-card"><div class="preview-loading-head"><span class="preview-loading-spinner" aria-hidden="true"></span>${escapeHtml(title)}</div><div class="preview-loading-detail">${escapeHtml(detail)}</div><div class="preview-loading-track"><div class="preview-loading-bar" style="width:${Math.max(0, Math.min(100, percent))}%"></div></div><div class="preview-loading-note">Reading planning evidence only — no forecast data is changed while this loads.</div></div>`; }
  function getLocalMetadata() { try { const value = JSON.parse(localStorage.getItem(LOCAL_METADATA_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
  const metadataKey = item => [item.fiscalYear, item.engineerId, normalizeJob(item.jobNumber), item.workGroup || ''].join('|');
  async function loadMetadata(year) { if (window.isApiEnabled?.()) { const remote = await window.loadForecastPlanningMetadataFromApi?.(year); if (remote) return remote; if (window.API_CONFIG?.forceServerPersistence) throw new Error('Planning metadata could not be loaded.'); } return getLocalMetadata().filter(item => item.fiscalYear === year); }
  async function persistMetadata(item) { if (window.isApiEnabled?.()) { const saved = await window.saveForecastPlanningMetadataToApi?.(item); if (saved) return saved; if (window.API_CONFIG?.forceServerPersistence) throw new Error('The server did not confirm the planning change.'); } const all = getLocalMetadata(), next = [...all.filter(existing => metadataKey(existing) !== metadataKey(item)), item]; localStorage.setItem(LOCAL_METADATA_KEY, JSON.stringify(next)); return item; }
  async function removeMetadata(item) { if (window.isApiEnabled?.()) { const removed = await window.deleteForecastPlanningMetadataFromApi?.(item); if (removed) return true; if (window.API_CONFIG?.forceServerPersistence) throw new Error('The server did not confirm removal.'); } localStorage.setItem(LOCAL_METADATA_KEY, JSON.stringify(getLocalMetadata().filter(existing => metadataKey(existing) !== metadataKey(item)))); return true; }
  const hydrateMap = raw => raw instanceof Map ? raw : new Map(Object.entries(raw || {}));
  async function loadWorkDone(year) {
    if (window.isApiEnabled?.()) {
      const payload = await window.loadWorkDoneFromApi?.(year);
      return { data: hydrateMap(payload?.data), uploadedAt: payload?.uploadedAt || null };
    }
    try {
      const entry = JSON.parse(localStorage.getItem(WORK_DONE_KEY) || '{}')?.[year];
      return { data: hydrateMap(entry?.data), uploadedAt: entry?.uploadedAt || null };
    } catch { return { data: new Map(), uploadedAt: null }; }
  }
  async function loadHistoricalComments() {
    if (window.isApiEnabled?.()) return (await window.loadJobCommentsFromApi?.()) || {};
    try { return JSON.parse(localStorage.getItem('aprJobCommentsV2') || '{}'); } catch { return {}; }
  }
  function renderTemporaryEvidenceStatus() {
    const entries = Array.from(state.temporaryEvidenceByYear.values()).sort((a, b) => b.year.localeCompare(a.year));
    const selectedYear = byId('forecastPreviewEvidenceYear')?.value;
    byId('forecastPreviewClearEvidence').hidden = !state.temporaryEvidenceByYear.has(selectedYear);
    byId('forecastPreviewEvidenceCount').textContent = entries.length ? `${entries.length} FY loaded` : 'Optional';
    byId('forecastPreviewEvidenceStatus').innerHTML = entries.length
      ? entries.map(item => `<span class="preview-evidence-chip"><b>${escapeHtml(item.year)}</b> ${item.accepted.toLocaleString()} rows · ${escapeHtml(item.fileName)}</span>`).join('')
      : 'No temporary evidence loaded.';
  }
  function clearTemporaryEvidence({ render = true, year = byId('forecastPreviewEvidenceYear')?.value, all = false } = {}) {
    const years = all ? Array.from(state.temporaryEvidenceByYear.keys()) : [year];
    let changed = false;
    years.forEach(fy => {
      const evidence = state.temporaryEvidenceByYear.get(fy);
      if (!evidence) return;
      state.workDoneByYear[fy] = evidence.originalData;
      state.workDoneUploadedByYear[fy] = evidence.originalUploadedAt;
      state.temporaryEvidenceByYear.delete(fy); changed = true;
    });
    if (byId('forecastPreviewEvidenceFile')) byId('forecastPreviewEvidenceFile').value = '';
    renderTemporaryEvidenceStatus();
    if (render && changed) { rebuildJobCache(); renderAll(); }
  }
  async function loadTemporaryWorkDone(file) {
    const year = byId('forecastPreviewEvidenceYear').value, parseId = ++state.evidenceParseSerial;
    if (!year || !file) return;
    const headerRow = Number(byId('forecastPreviewEvidenceHeaderRow').value);
    if (!Number.isInteger(headerRow) || headerRow < 1) throw new Error('Header row must be 1 or greater.');
    const status = byId('forecastPreviewEvidenceStatus');
    status.textContent = `Reading ${file.name} locally…`;
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    if (parseId !== state.evidenceParseSerial) return;
    const sheet = workbook.Sheets.Detail;
    if (!sheet) throw new Error('The workbook must contain a sheet named “Detail”.');
    const sourceRows = window.XLSX.utils.sheet_to_json(sheet, { range: headerRow - 1, defval: '' });
    if (!sourceRows.length) throw new Error('The Detail sheet has no data rows at the selected header row.');
    const requiredColumns = ['Work Order Closed Period', 'Units Complete'];
    const missingColumns = requiredColumns.filter(column => !(column in sourceRows[0]));
    if (!('Standard Job Number & Desc' in sourceRows[0]) && !('Standard Job No' in sourceRows[0])) missingColumns.unshift('Standard Job Number & Desc');
    if (!('Work Group Set' in sourceRows[0]) && !('Work Group Set Description' in sourceRows[0])) missingColumns.push('Work Group Set');
    if (missingColumns.length) throw new Error(`Missing required column${missingColumns.length === 1 ? '' : 's'}: ${missingColumns.join(', ')}`);
    const { data: aggregated, accepted, rejected } = window.buildTemporaryWorkDoneEvidence(sourceRows, {
      extractJob: value => String(value || '').trim().split('-')[0].match(/\d{6}/)?.[0],
      resolveWorkGroupCode: window.resolveWorkGroupCode,
      activeWorkGroups: new Set(window.workGroupSets?.keys() || []),
      activeJobs: new Set(catalogue().map(job => job.jobNumber))
    });
    if (parseId !== state.evidenceParseSerial) return;
    const previous = state.temporaryEvidenceByYear.get(year);
    state.temporaryEvidenceByYear.set(year, {
      year, fileName: file.name, accepted, rejected,
      originalData: previous?.originalData || state.workDoneByYear[year] || new Map(),
      originalUploadedAt: previous?.originalUploadedAt || state.workDoneUploadedByYear[year] || null
    });
    state.workDoneByYear[year] = aggregated; state.workDoneUploadedByYear[year] = `temporary:${file.name}`;
    renderTemporaryEvidenceStatus();
    rebuildJobCache(); renderAll();
  }
  function getScopedEngineers() { const id = window.getCurrentDeliveryUnitId?.() || ''; return (!id || id === 'all') ? [] : (window.getEngineersForDeliveryUnit?.(id) || []); }
  function syncEvidenceYearOptions() {
    const sourceYears = [state.selectedYear, ...window.getPlanningHistoryYears(state.selectedYear)];
    const select = byId('forecastPreviewEvidenceYear');
    select.innerHTML = sourceYears.map((year, index) => `<option value="${escapeHtml(year)}">${escapeHtml(year)} — ${index === 0 ? 'current FY' : 'historical'} Work Done</option>`).join('');
    select.value = sourceYears[0];
  }
  function ensureSelectedEngineer() { const engineers = getScopedEngineers(); if (!engineers.some(item => item.id === state.selectedEngineerId)) state.selectedEngineerId = engineers[0]?.id || ''; return engineers; }
  const requestIsCurrent = (id, year) => id === state.requestSerial && year === state.selectedYear;
  async function loadPlanningEvidence(year, id) { const years = [year, ...window.getPlanningHistoryYears(year)], result = { v0ForecastsByYear: {}, effectiveForecastsByYear: {}, workDoneByYear: {}, workDoneUploadedByYear: {} }; for (let i = 0; i < years.length; i += 1) { const fy = years[i]; if (!requestIsCurrent(id, year)) return null; setLoadingProgress('Loading planning evidence', `Reading V0, V1 and Work Done for ${fy} (${i + 1} of ${years.length})`, i / years.length * 80); const [v0, v1, wd] = await Promise.all([window.getForecastSnapshotAsync(fy, 'v0'), window.getForecastSnapshotAsync(fy, 'v1'), loadWorkDone(fy)]); if (!requestIsCurrent(id, year)) return null; result.v0ForecastsByYear[fy] = v0?.data || new Map(); result.effectiveForecastsByYear[fy] = (v0 || v1) ? window.getEffectiveForecastSnapshot(fy).data : new Map(); result.workDoneByYear[fy] = wd.data; result.workDoneUploadedByYear[fy] = wd.uploadedAt; } return result; }
  function discoveryOptions(engineerId = state.selectedEngineerId) { return { selectedYear: state.selectedYear, engineerId, engineers: getScopedEngineers(), planningMetadata: state.metadata, effectiveForecastsByYear: state.effectiveForecastsByYear, v0ForecastsByYear: state.v0ForecastsByYear, workDoneByYear: state.workDoneByYear, resolveWorkGroupCode: window.resolveWorkGroupCode }; }
  function rebuildJobCache() { const next = new Map(); getScopedEngineers().forEach(engineer => next.set(engineer.id, window.getStandardJobsForEngineer(discoveryOptions(engineer.id)))); state.jobsByEngineer = next; }
  function rebuildEngineerJobCache(engineerId = state.selectedEngineerId) {
    const next = new Map(state.jobsByEngineer);
    next.set(engineerId, window.getStandardJobsForEngineer(discoveryOptions(engineerId)));
    state.jobsByEngineer = next;
  }
  const getJobs = (id = state.selectedEngineerId) => state.jobsByEngineer.get(id) || [];
  function getStoredJobEntry(jobNumber) {
    const source = state.v0ForecastsByYear[state.selectedYear];
    const candidates = [String(jobNumber), normalizeJob(jobNumber), normalizeJob(jobNumber).padStart(6, '0')];
    const storedKey = candidates.find(candidate => source?.has(candidate));
    return { key: storedKey || String(jobNumber), data: storedKey ? source.get(storedKey) : { periods: {}, wgs: {}, comments: {} } };
  }
  function getStoredJob(jobNumber) { return getStoredJobEntry(jobNumber).data; }
  function draftKey(jobNumber) { return `${state.selectedYear}|${state.selectedEngineerId}|${normalizeJob(jobNumber)}`; }
  function rowsForJob(jobNumber) { return window.getWorkGroupSetsForStandardJob({ ...discoveryOptions(), jobNumber: normalizeJob(jobNumber) }); }
  function getDraft(jobNumber) { const key = draftKey(jobNumber); if (state.drafts.has(key)) return state.drafts.get(key); const storedEntry = getStoredJobEntry(jobNumber), stored = storedEntry.data, rows = rowsForJob(jobNumber), draft = { dirty: false, saving: false, error: '', storageJobNumber: storedEntry.key, rows: {} }; rows.forEach(row => { const code = window.resolveWorkGroupCode?.(row.workGroup) || row.workGroup; const existingKey = Object.keys(stored.wgs || {}).find(key => (window.resolveWorkGroupCode?.(key) || key) === code) || code; draft.rows[code] = { periods: Object.fromEntries(PERIODS.map(period => [period, Number(stored.wgs?.[existingKey]?.[period]) || 0])), comment: String(stored.comments?.[existingKey] || ''), reasons: row.reasons }; }); state.drafts.set(key, draft); return draft; }
  const hasDirty = () => Array.from(state.drafts.values()).some(draft => draft.dirty);
  function confirmDiscard(message) { return !hasDirty() || window.confirm(message || 'You have unsaved Standard Job changes. Discard them?'); }
  function matchesFilter(jobs) { if (state.filter === 'forecasted') return jobs.length > 0 && jobs.every(job => job.forecasted); if (state.filter === 'not-forecasted') return jobs.some(job => !job.forecasted); return true; }
  function renderEngineerList() { const query = state.search.trim().toLowerCase(), visible = getScopedEngineers().filter(engineer => (!query || engineer.name.toLowerCase().includes(query)) && matchesFilter(getJobs(engineer.id))); const target = byId('forecastPreviewEngineerList'); if (!target) return; target.innerHTML = visible.length ? visible.map(engineer => { const jobs = getJobs(engineer.id), done = jobs.filter(job => job.forecasted).length, pc = jobs.length ? done / jobs.length * 100 : 0; return `<button type="button" class="preview-engineer-item ${engineer.id === state.selectedEngineerId ? 'active' : ''}" data-engineer-id="${escapeHtml(engineer.id)}"><span class="preview-engineer-item-head"><span>${escapeHtml(engineer.name)}</span><span>${done}/${jobs.length}</span></span><span class="preview-engineer-item-meta">${done} of ${jobs.length} Standard Jobs forecasted</span><span class="preview-mini-track"><span style="width:${pc}%"></span></span></button>`; }).join('') : '<div class="preview-empty">No engineers match this filter.</div>'; }
  function contextKey(jobNumber, workGroup) { return `${draftKey(jobNumber)}|${workGroup}`; }
  function getHistoricalJobComments(jobNumber, workGroup, year) {
    const normalized = normalizeJob(jobNumber), comments = Object.entries(state.jobComments || {})
      .find(([key]) => normalizeJob(key) === normalized)?.[1] || [];
    return comments.filter(comment => {
      if ((comment.fy || comment.financialYear) !== year) return false;
      const taggedWgs = window.resolveWorkGroupCode?.(comment.filteredWorkGroup) || comment.filteredWorkGroup || '';
      if (taggedWgs && taggedWgs !== workGroup) return false;
      if (comment.filteredEngineerId && comment.filteredEngineerId !== state.selectedEngineerId) return false;
      if (window.commentMatchesOrganisationScope && !window.commentMatchesOrganisationScope(comment, { deliveryUnitId: window.getCurrentDeliveryUnitId?.() })) return false;
      return true;
    }).map(comment => {
      const taggedWgs = window.resolveWorkGroupCode?.(comment.filteredWorkGroup) || comment.filteredWorkGroup || '';
      const scope = taggedWgs === workGroup ? 'Work Group Set' : (comment.filteredEngineerId ? 'Engineer' : 'Delivery Unit');
      return { text: comment.text || '', scope, source: comment.rf || comment.category || 'Comment' };
    }).sort((a, b) => (a.scope === 'Work Group Set' ? -1 : 1) - (b.scope === 'Work Group Set' ? -1 : 1));
  }
  function getForecastComment(jobNumber, workGroup, year) {
    const source = state.effectiveForecastsByYear[year], normalized = normalizeJob(jobNumber);
    const job = Array.from(source || []).find(([key]) => normalizeJob(key) === normalized)?.[1];
    const key = Object.keys(job?.comments || {}).find(name => (window.resolveWorkGroupCode?.(name) || name) === workGroup);
    return key ? String(job.comments[key] || '') : '';
  }
  function renderPlanningContext(jobNumber, workGroup) {
    const selectedNumber = Number(String(state.selectedYear).replace(/^FY/i, ''));
    const historyYears = Object.keys(state.effectiveForecastsByYear).filter(year => Number(String(year).replace(/^FY/i, '')) < selectedNumber)
      .sort((a, b) => Number(String(b).replace(/^FY/i, '')) - Number(String(a).replace(/^FY/i, '')));
    const contexts = window.getPlanningContext({ selectedYear: state.selectedYear, historyYears, jobNumber: normalizeJob(jobNumber), workGroup,
      effectiveForecastsByYear: state.effectiveForecastsByYear, workDoneByYear: state.workDoneByYear,
      workDoneUploadedByYear: state.workDoneUploadedByYear, resolveWorkGroupCode: window.resolveWorkGroupCode });
    return `<section class="preview-planning-context" aria-label="Planning context for ${escapeHtml(workGroup)}"><div class="preview-context-heading"><div><h4>Planning context</h4><p>${escapeHtml(workGroup)} · previous years at a glance</p></div></div><div class="preview-history-list">${contexts.map(context => {
      const forecastComment = getForecastComment(jobNumber, workGroup, context.year);
      const comments = getHistoricalJobComments(jobNumber, workGroup, context.year);
      const allComments = [...(forecastComment ? [{ scope: 'Final forecast', text: forecastComment }] : []), ...comments];
      return `<article class="preview-history-year"><div class="preview-history-summary"><strong>${escapeHtml(context.year)}</strong><span><b>${context.forecastTotal.toLocaleString()}</b> forecast</span><span><b>${context.workDoneTotal.toLocaleString()}</b> Work Done</span><span>${escapeHtml(context.coverage.label)}</span></div><div class="preview-history-actions"><button type="button" class="group-action-button" data-copy-context="forecast" data-copy-year="${escapeHtml(context.year)}" data-copy-job="${escapeHtml(jobNumber)}" data-copy-wgs="${escapeHtml(workGroup)}">Copy forecast</button><button type="button" class="group-action-button" data-copy-context="work-done" data-copy-year="${escapeHtml(context.year)}" data-copy-job="${escapeHtml(jobNumber)}" data-copy-wgs="${escapeHtml(workGroup)}" ${context.coverage.label === 'not uploaded' ? 'disabled' : ''}>Copy Work Done</button></div>${allComments.length ? `<details class="preview-history-comments"><summary>${allComments.length} comment${allComments.length === 1 ? '' : 's'}</summary>${allComments.map(comment => `<p><span>${escapeHtml(comment.scope)}${comment.source ? ` · ${escapeHtml(comment.source)}` : ''}</span>${escapeHtml(comment.text)}</p>`).join('')}</details>` : ''}</article>`;
    }).join('')}</div></section>`;
  }
  function getProfileYears() {
    const selectedNumber = Number(String(state.selectedYear).replace(/^FY/i, ''));
    return Object.keys(state.effectiveForecastsByYear)
      .filter(year => Number(String(year).replace(/^FY/i, '')) < selectedNumber)
      .sort((a, b) => Number(String(b).replace(/^FY/i, '')) - Number(String(a).replace(/^FY/i, '')));
  }
  function renderProfile(jobNumber) {
    const key = draftKey(jobNumber), workGroups = Object.keys(getDraft(jobNumber).rows), years = getProfileYears();
    let selected = state.profileWorkGroup.get(key);
    if (!workGroups.includes(selected)) { selected = workGroups[0] || ''; state.profileWorkGroup.set(key, selected); }
    let selectedYear = state.profileYear.get(key);
    if (!years.includes(selectedYear)) { selectedYear = years[0] || ''; state.profileYear.set(key, selectedYear); }
    return `<section class="preview-profile" aria-label="Work Group Set period profile"><div class="preview-profile-header"><div><h4>Work Group Set profile</h4><p>Compare the live V0 draft with one previous financial year.</p></div><div class="preview-profile-controls"><label>Comparison FY<select data-profile-year="${escapeHtml(jobNumber)}" ${years.length ? '' : 'disabled'}>${years.length ? years.map(year => `<option value="${escapeHtml(year)}" ${year === selectedYear ? 'selected' : ''}>${escapeHtml(year)}</option>`).join('') : '<option>No history</option>'}</select></label><div class="preview-profile-switcher"><button type="button" class="group-action-button" data-profile-step="-1" data-profile-job="${escapeHtml(jobNumber)}" ${workGroups.length < 2 ? 'disabled' : ''} aria-label="Previous Work Group Set">←</button><strong>${escapeHtml(selected || 'No Work Group Set')}</strong><button type="button" class="group-action-button" data-profile-step="1" data-profile-job="${escapeHtml(jobNumber)}" ${workGroups.length < 2 ? 'disabled' : ''} aria-label="Next Work Group Set">→</button></div></div></div><div class="preview-chart-wrap"><canvas data-profile-chart="${escapeHtml(jobNumber)}" aria-label="P1 to P13 profile for ${escapeHtml(selected)}" role="img"></canvas></div><div class="preview-profile-footer"><div class="preview-profile-transition" data-profile-transition="${escapeHtml(jobNumber)}"></div><button type="button" class="primary-button" data-copy-profile="${escapeHtml(jobNumber)}" ${selectedYear && selected ? '' : 'disabled'}>Copy to forecast</button></div></section>`;
  }
  function profileSeries(jobNumber) {
    const key = draftKey(jobNumber), draft = getDraft(jobNumber), workGroups = Object.keys(draft.rows), workGroup = state.profileWorkGroup.get(key) || workGroups[0], row = draft.rows[workGroup];
    const current = Object.fromEntries(PERIODS.map(period => [period, Number(row?.periods[period]) || 0]));
    const year = state.profileYear.get(key) || getProfileYears()[0];
    const history = year ? [year].map(fy => {
      const context = window.getPlanningContext({ selectedYear: state.selectedYear, historyYears: [fy], jobNumber: normalizeJob(jobNumber), workGroup,
        effectiveForecastsByYear: state.effectiveForecastsByYear, workDoneByYear: state.workDoneByYear,
        workDoneUploadedByYear: state.workDoneUploadedByYear, resolveWorkGroupCode: window.resolveWorkGroupCode })[0];
      const coverage = context?.coverage || { lastPeriod: 0, label: 'not uploaded' };
      const periods = coverage.label === 'not uploaded' ? context.forecastPeriods : window.copyPlanningProfile(context, 'work-done');
      return { year: fy, periods, coverage };
    }) : [];
    return { current, history, workGroup };
  }
  function renderProfileCharts() {
    state.charts.forEach(chart => chart.destroy?.()); state.charts.clear();
    document.querySelectorAll('[data-profile-chart]').forEach(canvas => {
      const jobNumber = canvas.dataset.profileChart, series = profileSeries(jobNumber);
      const transition = canvas.closest('.preview-profile')?.querySelector('[data-profile-transition]');
      if (transition) transition.textContent = series.history.map(item => item.coverage.label === 'not uploaded'
        ? `${item.year}: Work Done not uploaded — final effective forecast shown.`
        : item.coverage.lastPeriod >= 13 ? `${item.year}: full-year corrected Work Done.`
          : `${item.year}: Work Done ends after P${item.coverage.lastPeriod} → forecast begins at P${item.coverage.lastPeriod + 1}.`).join(' ');
      if (!window.Chart) { canvas.replaceWith(Object.assign(document.createElement('p'), { textContent: 'Chart library unavailable.' })); return; }
      const colours = ['#64748b', '#7c3aed', '#0891b2', '#c2410c', '#be123c'];
      const datasets = [{ label: `${state.selectedYear} V0 · ${series.workGroup} (current draft)`, data: PERIODS.map(period => series.current[period]), borderColor: '#2563eb', backgroundColor: '#2563eb', borderWidth: 3, tension: .2 }];
      series.history.forEach((item, index) => datasets.push({ label: `${item.year} (${item.coverage.label})`, data: PERIODS.map(period => item.periods[period]), borderColor: colours[index % colours.length], backgroundColor: colours[index % colours.length], borderWidth: 2, tension: .2, segment: { borderDash: context => item.coverage.lastPeriod > 0 && context.p0DataIndex >= item.coverage.lastPeriod ? [6, 4] : undefined } }));
      state.charts.set(draftKey(jobNumber), new window.Chart(canvas, { type: 'line', data: { labels: PERIODS, datasets }, options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } } }));
    });
  }
  function updateCurrentProfileChart(jobNumber) {
    const chart = state.charts.get(draftKey(jobNumber));
    if (!chart) return;
    const series = profileSeries(jobNumber);
    chart.data.datasets[0].data = PERIODS.map(period => series.current[period]);
    chart.update('none');
  }
  function renderGrid(job) { const draft = getDraft(job.jobNumber); const rows = Object.entries(draft.rows); return `<div class="preview-job-expanded"><p class="preview-grid-scroll-hint">Enter P1–P13. Paste a row of values to fill consecutive periods.</p><div class="preview-grid-scroll" tabindex="0" aria-label="Work Group Set periods; scroll horizontally for all columns"><table class="preview-wgs-grid"><thead><tr><th>Work Group Set</th>${PERIODS.map(p => `<th>${p}</th>`).join('')}<th>Total</th><th>Comment</th></tr></thead><tbody>${rows.map(([code, row]) => `<tr><th scope="row"><strong>${escapeHtml(code)}</strong><small>${escapeHtml(window.workGroupSets?.get(code) || '')}</small><span class="preview-reasons">${row.reasons.map(reason => `<span class="preview-reason">${escapeHtml(reason)}</span>`).join('')}</span>${row.reasons.includes('manually added') ? `<button type="button" class="preview-remove-wgs" data-remove-wgs="${escapeHtml(code)}" data-job="${escapeHtml(job.jobNumber)}">Remove</button>` : ''}</th>${PERIODS.map(p => `<td><input type="number" min="0" step="any" aria-label="${escapeHtml(code)} ${p}" data-grid-job="${escapeHtml(job.jobNumber)}" data-grid-wgs="${escapeHtml(code)}" data-period="${p}" value="${row.periods[p] || ''}"></td>`).join('')}<td class="preview-row-total">${PERIODS.reduce((n, p) => n + (Number(row.periods[p]) || 0), 0).toLocaleString()}</td><td><textarea data-comment-job="${escapeHtml(job.jobNumber)}" data-comment-wgs="${escapeHtml(code)}" aria-label="Current-year V0 comment for Work Group Set ${escapeHtml(code)}">${escapeHtml(row.comment)}</textarea></td></tr>`).join('')}</tbody></table></div><div class="preview-job-footer"><button type="button" class="group-action-button" data-add-wgs="${escapeHtml(job.jobNumber)}">+ Add Work Group Set</button><span class="preview-job-save-message ${draft.error ? 'is-error' : ''}" role="status">${escapeHtml(draft.error || (draft.dirty ? 'Unsaved changes' : 'Up to date'))}</span><button type="button" class="primary-button" data-save-job="${escapeHtml(job.jobNumber)}" ${!draft.dirty || draft.saving ? 'disabled' : ''}>${draft.saving ? 'Saving…' : 'Save job'}</button></div></div>`; }
  function renderJobList() { const jobs = getJobs(), target = byId('forecastPreviewJobList'); if (!target) return; if (!jobs.length) { target.innerHTML = '<div class="preview-empty forecast-card">No Standard Jobs found. Use “Add Standard Job” for genuinely new work.</div>'; return; } target.innerHTML = groupJobs(jobs).map(group => `<section class="preview-discipline-group" aria-labelledby="discipline-${escapeHtml(group.discipline.replace(/\W+/g, '-'))}"><h3 id="discipline-${escapeHtml(group.discipline.replace(/\W+/g, '-'))}">${escapeHtml(group.discipline)}</h3><div class="preview-job-list">${group.jobs.map(job => { const details = job.catalogue || {}, expanded = state.expanded.has(draftKey(job.jobNumber)), stored = getStoredJob(job.jobNumber), total = Object.values(stored.periods || {}).reduce((n, value) => n + (Number(value) || 0), 0), canRemove = window.canRemoveManuallyAddedStandardJob({ ...discoveryOptions(), jobNumber: job.jobNumber }); return `<article class="preview-job-card" data-expand-card="${escapeHtml(job.jobNumber)}"><div class="preview-job-card-main"><button type="button" class="preview-expand-job" data-expand-job="${escapeHtml(job.jobNumber)}" aria-expanded="${expanded}"><span aria-hidden="true">${expanded ? '▾' : '▸'}</span><span class="preview-job-number">${escapeHtml(normalizeJob(job.jobNumber))}</span><span>${escapeHtml(details.description || 'Standard Job')}</span></button><div class="preview-job-actions"><div class="preview-job-total"><span>${escapeHtml(state.selectedYear)} V0 total</span><strong>${total.toLocaleString()}</strong></div>${canRemove ? `<button type="button" class="group-action-button preview-remove-job" data-remove-job="${escapeHtml(job.jobNumber)}">Remove</button>` : ''}<button type="button" class="preview-status-toggle ${job.forecasted ? 'is-forecasted' : ''}" data-job-number="${escapeHtml(job.jobNumber)}" data-forecasted="${job.forecasted}">${job.forecasted ? '✓ Forecasted' : 'Mark Forecasted'}</button></div></div><div class="preview-job-meta">${escapeHtml(details.unit || 'Unit not recorded')} · ${job.workGroupCount} Work Group Set${job.workGroupCount === 1 ? '' : 's'}</div><div class="preview-reasons">${job.reasons.map(r => `<span class="preview-reason">${escapeHtml(r)}</span>`).join('')}</div>${expanded ? `${renderGrid(job)}${renderProfile(job.jobNumber)}` : ''}</article>`; }).join('')}</div></section>`).join(''); window.requestAnimationFrame?.(renderProfileCharts); }
  function scrollActiveEngineerIntoView() {
    const list = byId('forecastPreviewEngineerList'), active = list?.querySelector('.active');
    if (!list || !active) return;
    if (window.matchMedia?.('(max-width: 900px)').matches) {
      if (active.offsetLeft < list.scrollLeft) list.scrollLeft = active.offsetLeft;
      else if (active.offsetLeft + active.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = active.offsetLeft + active.offsetWidth - list.clientWidth;
    } else {
      if (active.offsetTop < list.scrollTop) list.scrollTop = active.offsetTop;
      else if (active.offsetTop + active.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = active.offsetTop + active.offsetHeight - list.clientHeight;
    }
  }
  function renderAll() { const engineers = ensureSelectedEngineer(), engineer = engineers.find(item => item.id === state.selectedEngineerId); renderEngineerList(); if (!engineer) return; const jobs = getJobs(), done = jobs.filter(j => j.forecasted).length; byId('forecastPreviewEngineerTitle').textContent = engineer.name; byId('forecastPreviewProgressText').textContent = `${done} of ${jobs.length} Standard Jobs forecasted`; byId('forecastPreviewProgressBar').style.width = `${jobs.length ? done / jobs.length * 100 : 0}%`; renderJobList(); scrollActiveEngineerIntoView(); }
  async function refreshPreview() { const id = ++state.requestSerial, year = state.selectedYear; state.loading = true; byId('forecastPreviewLoading').hidden = false; byId('forecastPreviewContent').hidden = true; try { const metadataPromise = loadMetadata(year), commentsPromise = loadHistoricalComments(), evidence = await loadPlanningEvidence(year, id); if (!evidence || !requestIsCurrent(id, year)) return; [state.metadata, state.jobComments] = await Promise.all([metadataPromise, commentsPromise]); if (!requestIsCurrent(id, year)) return; Object.assign(state, evidence); rebuildJobCache(); if (!ensureSelectedEngineer().length) throw new Error('Select a Delivery Unit before opening the Forecast Builder Preview.'); renderAll(); byId('forecastPreviewLoading').hidden = true; byId('forecastPreviewContent').hidden = false; byId('forecastPreviewState').textContent = 'V0 planning workspace loaded'; } catch (error) { if (requestIsCurrent(id, year)) byId('forecastPreviewLoading').textContent = error.message; } finally { if (requestIsCurrent(id, year)) state.loading = false; } }
  async function openForecastBuilderPreview() { if (!getScopedEngineers().length) return window.Toast?.error('Select a Delivery Unit before opening the Forecast Builder Preview.'); byId('dashboardPage')?.classList.add('is-hidden'); byId('forecastPage')?.classList.add('is-hidden'); byId('forecastBuilderPreviewPage')?.classList.remove('is-hidden'); const years = window.getFinancialYearOptions?.() || window.DEFAULT_FINANCIAL_YEARS || []; byId('forecastPreviewYear').innerHTML = years.map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)} — Original Approved Plan</option>`).join(''); state.selectedYear = window.currentFinancialYear || years[0]; byId('forecastPreviewYear').value = state.selectedYear; syncEvidenceYearOptions(); await refreshPreview(); }
  function closeForecastBuilderPreview() { if (!confirmDiscard()) return; state.requestSerial += 1; state.evidenceParseSerial += 1; clearTemporaryEvidence({ render: false, all: true }); state.drafts.clear(); byId('forecastBuilderPreviewPage')?.classList.add('is-hidden'); byId('dashboardPage')?.classList.remove('is-hidden'); }
  async function toggleForecasted(button) { const jobNumber = normalizeJob(button.dataset.jobNumber), existing = state.metadata.find(item => metadataKey(item) === metadataKey({ fiscalYear: state.selectedYear, engineerId: state.selectedEngineerId, jobNumber, workGroup: '' })); const item = { fiscalYear: state.selectedYear, engineerId: state.selectedEngineerId, jobNumber, workGroup: '', forecasted: button.dataset.forecasted !== 'true', manuallyAdded: Boolean(existing?.manuallyAdded ?? existing?.manually_added ?? (existing && !existing.forecasted)) }; const saved = await persistMetadata(item); state.metadata = [...state.metadata.filter(x => metadataKey(x) !== metadataKey(saved)), saved]; rebuildEngineerJobCache(); renderAll(); }
  async function saveJob(jobNumber) { const draft = getDraft(jobNumber); draft.saving = true; draft.error = ''; renderJobList(); const wgs = {}, comments = {}, periods = Object.fromEntries(PERIODS.map(p => [p, 0])); for (const [code, row] of Object.entries(draft.rows)) { wgs[code] = {}; for (const p of PERIODS) { const value = Number(row.periods[p]) || 0; if (value < 0) { draft.saving = false; draft.error = 'Volumes must be zero or positive.'; renderJobList(); return; } wgs[code][p] = value; periods[p] += value; } if (row.comment.trim()) comments[code] = row.comment; } const job = { periods, wgs, comments }, storageJobNumber = draft.storageJobNumber, snapshot = { data: new Map(state.v0ForecastsByYear[state.selectedYear]) }; snapshot.data.set(storageJobNumber, job); const saved = await window.saveForecastJobToStorageAsync?.(storageJobNumber, job, snapshot, state.selectedYear, 'v0'); if (!saved) { draft.saving = false; draft.error = 'Save failed. Your unsaved values are retained; retry when ready.'; renderJobList(); return; } state.v0ForecastsByYear[state.selectedYear] = snapshot.data; draft.dirty = false; draft.saving = false; rebuildEngineerJobCache(); renderAll(); byId('forecastPreviewState').textContent = 'Standard Job V0 and comments saved'; }
  function renderCatalogueResults() { const query = byId('forecastPreviewJobSearch').value.trim().toLowerCase(), queued = new Set(getJobs().map(j => normalizeJob(j.jobNumber))), matches = catalogue().filter(job => !query || job.jobNumber.includes(query) || job.description.toLowerCase().includes(query) || job.discipline.toLowerCase().includes(query)).slice(0, 150); byId('forecastPreviewJobOptions').innerHTML = groupJobs(matches).map(group => `<div class="preview-option-group" role="group" aria-label="${escapeHtml(group.discipline)}"><strong>${escapeHtml(group.discipline)}</strong>${group.jobs.map(job => { const exists = queued.has(job.jobNumber); return `<button type="button" role="option" data-catalogue-job="${escapeHtml(job.jobNumber)}" aria-selected="${state.selectedCatalogueJob === job.jobNumber}" ${exists ? 'disabled' : ''}><span>${escapeHtml(job.jobNumber)} — ${escapeHtml(job.description)}</span><small>${exists ? 'Already in this engineer’s queue' : job.discipline}</small></button>`; }).join('')}</div>`).join(''); }
  function openForecastPreviewAddJob() { state.lastAddJobTrigger = byId('forecastPreviewAddJob'); state.selectedCatalogueJob = ''; byId('forecastPreviewJobSearch').value = ''; byId('forecastPreviewAddJobMessage').textContent = ''; renderCatalogueResults(); byId('forecastPreviewAddJobModal').classList.add('open'); byId('forecastPreviewJobSearch').focus(); }
  function closeForecastPreviewAddJob() { byId('forecastPreviewAddJobModal').classList.remove('open'); state.lastAddJobTrigger?.focus(); }
  async function addStandardJob() { if (!state.selectedCatalogueJob) { byId('forecastPreviewAddJobMessage').textContent = 'Select a Standard Job from the grouped results.'; return; } const item = { fiscalYear: state.selectedYear, engineerId: state.selectedEngineerId, jobNumber: state.selectedCatalogueJob, workGroup: '', forecasted: false, manuallyAdded: true }, saved = await persistMetadata(item); state.metadata = [...state.metadata.filter(x => metadataKey(x) !== metadataKey(saved)), saved]; rebuildEngineerJobCache(); closeForecastPreviewAddJob(); renderAll(); }
  async function removeStandardJob(jobNumber) {
    const item = { fiscalYear: state.selectedYear, engineerId: state.selectedEngineerId, jobNumber: normalizeJob(jobNumber), workGroup: '', forecasted: false };
    if (!window.confirm('Remove this untouched Standard Job from the planning queue? No forecast data will be deleted.')) return;
    await removeMetadata(item);
    state.metadata = state.metadata.filter(existing => metadataKey(existing) !== metadataKey(item));
    rebuildEngineerJobCache(); renderAll();
  }
  function toggleExpandedJob(jobNumber) {
    const key = draftKey(jobNumber);
    if (state.expanded.has(key)) state.expanded.delete(key);
    else { state.expanded.add(key); getDraft(jobNumber); }
    renderJobList();
  }
  function showDirtyDraft(target, jobNumber) {
    const expanded = target.closest('.preview-job-expanded');
    const saveButton = expanded?.querySelector('[data-save-job]');
    const message = expanded?.querySelector('.preview-job-save-message');
    if (saveButton) saveButton.disabled = false;
    if (message) { message.textContent = 'Unsaved changes'; message.classList.remove('is-error'); }
  }
  async function ensurePlanningHistoryLoaded() {
    if (state.historyLoadedForYear === state.selectedYear) return;
    const requestedYear = state.selectedYear, requestId = state.requestSerial;
    const selectedNumber = Number(String(state.selectedYear).replace(/^FY/i, ''));
    const olderYears = (window.getFinancialYearOptions?.() || window.DEFAULT_FINANCIAL_YEARS || [])
      .filter(year => Number(String(year).replace(/^FY/i, '')) < selectedNumber)
      .filter(year => !state.effectiveForecastsByYear[year]);
    for (const year of olderYears) {
      byId('forecastPreviewState').textContent = `Loading Planning Context for ${year}…`;
      const [v0, v1, workDone] = await Promise.all([
        window.getForecastSnapshotAsync(year, 'v0'), window.getForecastSnapshotAsync(year, 'v1'), loadWorkDone(year)
      ]);
      if (!requestIsCurrent(requestId, requestedYear)) return false;
      state.v0ForecastsByYear[year] = v0?.data || new Map();
      state.effectiveForecastsByYear[year] = (v0 || v1) ? window.getEffectiveForecastSnapshot(year).data : new Map();
      const temporaryEvidence = state.temporaryEvidenceByYear.get(year);
      if (temporaryEvidence) {
        temporaryEvidence.originalData = workDone.data;
        temporaryEvidence.originalUploadedAt = workDone.uploadedAt;
      } else {
        state.workDoneByYear[year] = workDone.data;
        state.workDoneUploadedByYear[year] = workDone.uploadedAt;
      }
    }
    state.historyLoadedForYear = state.selectedYear;
    byId('forecastPreviewState').textContent = 'Planning Context loaded';
    return true;
  }
  async function togglePlanningContext(jobNumber, workGroup) {
    const key = contextKey(jobNumber, workGroup);
    if (state.contextExpanded.has(key)) state.contextExpanded.delete(key);
    else { if (await ensurePlanningHistoryLoaded() === false) return; state.contextExpanded.add(key); }
    renderJobList();
  }
  function copyHistoricalProfile(button) {
    const contexts = window.getPlanningContext({ selectedYear: state.selectedYear, historyYears: [button.dataset.copyYear], jobNumber: normalizeJob(button.dataset.copyJob), workGroup: button.dataset.copyWgs,
      effectiveForecastsByYear: state.effectiveForecastsByYear, workDoneByYear: state.workDoneByYear,
      workDoneUploadedByYear: state.workDoneUploadedByYear, resolveWorkGroupCode: window.resolveWorkGroupCode });
    const context = contexts.find(item => item.year === button.dataset.copyYear);
    const periods = window.copyPlanningProfile(context, button.dataset.copyContext);
    if (!periods) return;
    const draft = getDraft(button.dataset.copyJob), row = draft.rows[button.dataset.copyWgs];
    row.periods = periods;
    row.comment = button.dataset.copyContext === 'forecast'
      ? `Copied from ${context.year} final effective forecast.`
      : `Copied from ${context.year} corrected Work Done ${context.coverage.label}, with remaining periods populated from ${context.year} final effective forecast.`;
    draft.dirty = true; renderJobList();
  }
  async function toggleAllHistory(jobNumber) {
    if (await ensurePlanningHistoryLoaded() === false) return;
    const key = draftKey(jobNumber);
    if (state.showAllHistory.has(key)) state.showAllHistory.delete(key); else state.showAllHistory.add(key);
    renderJobList();
  }
  function copySelectedProfile(jobNumber) {
    const key = draftKey(jobNumber), year = state.profileYear.get(key) || getProfileYears()[0];
    const workGroup = state.profileWorkGroup.get(key) || Object.keys(getDraft(jobNumber).rows)[0];
    if (!year || !workGroup) return;
    copyHistoricalProfile({ dataset: { copyYear: year, copyJob: jobNumber, copyWgs: workGroup, copyContext: state.workDoneUploadedByYear[year] ? 'work-done' : 'forecast' } });
  }
  function switchProfileWorkGroup(jobNumber, offset) {
    const key = draftKey(jobNumber), workGroups = Object.keys(getDraft(jobNumber).rows);
    if (!workGroups.length) return;
    const current = Math.max(0, workGroups.indexOf(state.profileWorkGroup.get(key)));
    state.profileWorkGroup.set(key, workGroups[(current + offset + workGroups.length) % workGroups.length]);
    renderJobList();
  }
  function renderWgsResults() { const q = byId('forecastPreviewWgsSearch').value.trim().toLowerCase(), existing = new Set(Object.keys(getDraft(state.addWgsJob).rows)); const values = Array.from(window.workGroupSets || []).filter(([code, desc]) => !q || code.toLowerCase().includes(q) || String(desc).toLowerCase().includes(q)).slice(0, 150); byId('forecastPreviewWgsOptions').innerHTML = values.map(([code, desc]) => `<button type="button" role="option" data-catalogue-wgs="${escapeHtml(code)}" aria-selected="${state.selectedWgs === code}" ${existing.has(code) ? 'disabled' : ''}><span>${escapeHtml(code)} — ${escapeHtml(desc)}</span><small>${existing.has(code) ? 'Already shown' : (window.getEngineerForWorkGroup?.(code)?.name || 'Owner not recorded')}</small></button>`).join(''); }
  function openWgsModal(job) { state.addWgsJob = job; state.selectedWgs = ''; byId('forecastPreviewWgsSearch').value = ''; byId('forecastPreviewAddWgsMessage').textContent = ''; renderWgsResults(); byId('forecastPreviewAddWgsModal').classList.add('open'); byId('forecastPreviewWgsSearch').focus(); }
  function closeWgsModal() { byId('forecastPreviewAddWgsModal').classList.remove('open'); }
  async function addWgs() { if (!state.selectedWgs) return byId('forecastPreviewAddWgsMessage').textContent = 'Select a Work Group Set.'; const item = { fiscalYear: state.selectedYear, engineerId: state.selectedEngineerId, jobNumber: normalizeJob(state.addWgsJob), workGroup: state.selectedWgs, forecasted: false, manuallyAdded: true }, saved = await persistMetadata(item); state.metadata = [...state.metadata.filter(x => metadataKey(x) !== metadataKey(saved)), saved]; state.drafts.delete(draftKey(state.addWgsJob)); rebuildEngineerJobCache(); closeWgsModal(); renderAll(); }
  window.forecastBuilderPreviewContext = Object.freeze({ getScopedEngineers, groupJobs, compareJobs, hasDirtyChanges: hasDirty });
  window.openForecastBuilderPreview = openForecastBuilderPreview; window.closeForecastBuilderPreview = closeForecastBuilderPreview; window.openForecastPreviewAddJob = openForecastPreviewAddJob; window.closeForecastPreviewAddJob = closeForecastPreviewAddJob;
  window.openProductionForecastBuilderFromPreview = function openProductionForecastBuilderFromPreview() {
    if (!confirmDiscard('You have unsaved Standard Job changes. Discard them and open the current Forecast Builder?')) return;
    state.drafts.clear(); state.expanded.clear(); window.openForecastEditor?.();
  };
  document.addEventListener('DOMContentLoaded', () => {
    const stickySentinel = byId('forecastPreviewEngineerSentinel'), engineerHeader = document.querySelector('.preview-engineer-header');
    if (stickySentinel && engineerHeader && window.IntersectionObserver) new IntersectionObserver(([entry]) => engineerHeader.classList.toggle('is-condensed', !entry.isIntersecting), { threshold: 1 }).observe(stickySentinel);
    byId('forecastPreviewYear')?.addEventListener('change', event => { if (!confirmDiscard()) { event.target.value = state.selectedYear; return; } state.evidenceParseSerial += 1; clearTemporaryEvidence({ render: false, all: true }); state.drafts.clear(); state.expanded.clear(); state.selectedYear = event.target.value; syncEvidenceYearOptions(); refreshPreview(); });
    byId('forecastPreviewEvidenceYear')?.addEventListener('change', () => { state.evidenceParseSerial += 1; byId('forecastPreviewEvidenceFile').value = ''; renderTemporaryEvidenceStatus(); });
    byId('forecastPreviewEngineerSearch')?.addEventListener('input', e => { state.search = e.target.value; renderEngineerList(); });
    document.querySelectorAll('[data-preview-filter]').forEach(button => button.addEventListener('click', () => { state.filter = button.dataset.previewFilter; document.querySelectorAll('[data-preview-filter]').forEach(b => b.classList.toggle('active', b === button)); renderEngineerList(); }));
    byId('forecastPreviewPrevious')?.addEventListener('click', () => navigateEngineer(-1)); byId('forecastPreviewNext')?.addEventListener('click', () => navigateEngineer(1)); byId('forecastPreviewAddJob')?.addEventListener('click', openForecastPreviewAddJob); byId('forecastPreviewConfirmAddJob')?.addEventListener('click', addStandardJob);
    byId('forecastPreviewJobSearch')?.addEventListener('input', renderCatalogueResults); byId('forecastPreviewJobOptions')?.addEventListener('click', e => { const b = e.target.closest('[data-catalogue-job]'); if (b && !b.disabled) { state.selectedCatalogueJob = b.dataset.catalogueJob; renderCatalogueResults(); } });
    byId('forecastPreviewJobOptions')?.addEventListener('keydown', event => handleListboxKeyboard(event, '[data-catalogue-job]', button => { state.selectedCatalogueJob = button.dataset.catalogueJob; renderCatalogueResults(); }));
    byId('forecastPreviewWgsSearch')?.addEventListener('input', renderWgsResults); byId('forecastPreviewWgsOptions')?.addEventListener('click', e => { const b = e.target.closest('[data-catalogue-wgs]'); if (b && !b.disabled) { state.selectedWgs = b.dataset.catalogueWgs; renderWgsResults(); } });
    byId('forecastPreviewWgsOptions')?.addEventListener('keydown', event => handleListboxKeyboard(event, '[data-catalogue-wgs]', button => { state.selectedWgs = button.dataset.catalogueWgs; renderWgsResults(); }));
    byId('forecastPreviewCloseWgs')?.addEventListener('click', closeWgsModal); byId('forecastPreviewCancelWgs')?.addEventListener('click', closeWgsModal); byId('forecastPreviewConfirmWgs')?.addEventListener('click', addWgs);
    byId('forecastPreviewEngineerList')?.addEventListener('click', e => { const b = e.target.closest('[data-engineer-id]'); if (b && b.dataset.engineerId !== state.selectedEngineerId && confirmDiscard()) { state.drafts.clear(); state.expanded.clear(); state.selectedEngineerId = b.dataset.engineerId; renderAll(); } });
    byId('forecastPreviewJobList')?.addEventListener('click', async e => { const expand = e.target.closest('[data-expand-job]'), status = e.target.closest('[data-job-number]'), save = e.target.closest('[data-save-job]'), add = e.target.closest('[data-add-wgs]'), remove = e.target.closest('[data-remove-wgs]'), removeJob = e.target.closest('[data-remove-job]'), context = e.target.closest('[data-context-job]'), copy = e.target.closest('[data-copy-context]'), history = e.target.closest('[data-show-history]'), profileStep = e.target.closest('[data-profile-step]'), copyProfile = e.target.closest('[data-copy-profile]'), card = e.target.closest('[data-expand-card]'); if (expand) toggleExpandedJob(expand.dataset.expandJob); else if (status) await toggleForecasted(status); else if (save) await saveJob(save.dataset.saveJob); else if (add) openWgsModal(add.dataset.addWgs); else if (removeJob) await removeStandardJob(removeJob.dataset.removeJob); else if (context) await togglePlanningContext(context.dataset.contextJob, context.dataset.contextWgs); else if (copy) copyHistoricalProfile(copy); else if (history) await toggleAllHistory(history.dataset.showHistory); else if (copyProfile) copySelectedProfile(copyProfile.dataset.copyProfile); else if (profileStep) switchProfileWorkGroup(profileStep.dataset.profileJob, Number(profileStep.dataset.profileStep)); else if (remove) { const draft = getDraft(remove.dataset.job), row = draft.rows[remove.dataset.removeWgs]; if (PERIODS.some(p => row.periods[p]) || row.comment.trim()) return window.Toast?.error('This row has V0 data or a comment and cannot be removed.'); const item = { fiscalYear: state.selectedYear, engineerId: state.selectedEngineerId, jobNumber: normalizeJob(remove.dataset.job), workGroup: remove.dataset.removeWgs }; await removeMetadata(item); state.metadata = state.metadata.filter(x => metadataKey(x) !== metadataKey(item)); state.drafts.delete(draftKey(remove.dataset.job)); rebuildEngineerJobCache(); renderAll(); } else if (card && !e.target.closest('button, input, textarea, select, a, .preview-job-expanded')) toggleExpandedJob(card.dataset.expandCard); });
    byId('forecastPreviewJobList')?.addEventListener('input', e => { if (e.target.dataset.gridJob) { const draft = getDraft(e.target.dataset.gridJob), value = e.target.value === '' ? 0 : Number(e.target.value); draft.rows[e.target.dataset.gridWgs].periods[e.target.dataset.period] = value; draft.dirty = true; e.target.closest('tr').querySelector('.preview-row-total').textContent = PERIODS.reduce((n, p) => n + (Number(draft.rows[e.target.dataset.gridWgs].periods[p]) || 0), 0).toLocaleString(); showDirtyDraft(e.target, e.target.dataset.gridJob); updateCurrentProfileChart(e.target.dataset.gridJob); } else if (e.target.dataset.commentJob) { const draft = getDraft(e.target.dataset.commentJob); draft.rows[e.target.dataset.commentWgs].comment = e.target.value; draft.dirty = true; showDirtyDraft(e.target, e.target.dataset.commentJob); } });
    byId('forecastPreviewJobList')?.addEventListener('change', event => { if (event.target.dataset.profileYear) { state.profileYear.set(draftKey(event.target.dataset.profileYear), event.target.value); renderJobList(); } });
    byId('forecastPreviewJobList')?.addEventListener('paste', handlePeriodPaste);
    byId('forecastPreviewEvidenceFile')?.addEventListener('change', event => loadTemporaryWorkDone(event.target.files?.[0]).catch(error => { byId('forecastPreviewEvidenceStatus').textContent = `File not loaded: ${error.message}`; }));
    byId('forecastPreviewClearEvidence')?.addEventListener('click', () => clearTemporaryEvidence());
    window.addEventListener('beforeunload', event => { if (hasDirty()) { event.preventDefault(); event.returnValue = ''; } });
  });
  function navigateEngineer(offset) { const engineers = ensureSelectedEngineer(); if (!engineers.length || !confirmDiscard()) return; state.drafts.clear(); state.expanded.clear(); const current = engineers.findIndex(e => e.id === state.selectedEngineerId); state.selectedEngineerId = engineers[(current + offset + engineers.length) % engineers.length].id; renderAll(); }
  function handleListboxKeyboard(event, selector, select) {
    const buttons = Array.from(event.currentTarget.querySelectorAll(selector)).filter(button => !button.disabled);
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(current + offset + buttons.length) % buttons.length].focus();
    } else if ((event.key === 'Enter' || event.key === ' ') && current >= 0) {
      event.preventDefault(); select(buttons[current]);
    }
  }
  function handlePeriodPaste(event) {
    const input = event.target.closest('[data-grid-job][data-period]');
    if (!input) return;
    const values = event.clipboardData?.getData('text').trim().split(/[\t,\s]+/).filter(Boolean) || [];
    if (values.length < 2 || values.some(value => !Number.isFinite(Number(value)) || Number(value) < 0)) return;
    event.preventDefault();
    const draft = getDraft(input.dataset.gridJob), start = PERIODS.indexOf(input.dataset.period), row = draft.rows[input.dataset.gridWgs];
    values.slice(0, PERIODS.length - start).forEach((value, index) => { row.periods[PERIODS[start + index]] = Number(value); });
    draft.dirty = true; renderJobList();
  }
})(window);
