/** Phase 2 read-only shell and manual Forecasted workflow. */
(function initializeForecastBuilderPreview(window) {
  const LOCAL_METADATA_KEY = 'aprForecastPlanningMetadataV1';
  const WORK_DONE_KEY = 'aprWorkDoneByYearV1';
  const state = {
    selectedYear: '', selectedEngineerId: '', filter: 'all', search: '', metadata: [],
    effectiveForecastsByYear: {}, v0ForecastsByYear: {}, workDoneByYear: {},
    loading: false, requestSerial: 0, jobsByEngineer: new Map()
  };

  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  function ensureLoadingStyles() {
    if (document.getElementById('forecastPreviewLoadingStyles')) return;
    const style = document.createElement('style');
    style.id = 'forecastPreviewLoadingStyles';
    style.textContent = `
      .preview-loading-card{max-width:520px;margin:48px auto;padding:24px;border:1px solid #dbe3ef;border-radius:12px;background:#fff;text-align:left;box-shadow:0 1px 3px rgba(15,23,42,.06)}
      .preview-loading-head{display:flex;align-items:center;gap:12px;color:#0f172a;font-weight:750}
      .preview-loading-spinner{width:20px;height:20px;flex:0 0 auto;border:3px solid #dbeafe;border-top-color:#2563eb;border-radius:50%;animation:preview-spin .8s linear infinite}
      .preview-loading-detail{margin:10px 0 12px;color:#64748b;font-size:12px}
      .preview-loading-track{height:7px;overflow:hidden;border-radius:999px;background:#e2e8f0}
      .preview-loading-bar{height:100%;width:0;background:#2563eb;transition:width .2s ease}
      .preview-loading-note{margin-top:10px;color:#64748b;font-size:11px}
      @keyframes preview-spin{to{transform:rotate(360deg)}}
      @media (prefers-reduced-motion:reduce){.preview-loading-spinner{animation:none}.preview-loading-bar{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function setLoadingProgress(title, detail, percent = 0) {
    ensureLoadingStyles();
    const target = byId('forecastPreviewLoading');
    if (!target) return;
    target.innerHTML = `<div class="preview-loading-card">
      <div class="preview-loading-head"><span class="preview-loading-spinner" aria-hidden="true"></span><span>${escapeHtml(title)}</span></div>
      <div class="preview-loading-detail">${escapeHtml(detail)}</div>
      <div class="preview-loading-track" aria-hidden="true"><div class="preview-loading-bar" style="width:${Math.max(0, Math.min(100, percent))}%"></div></div>
      <div class="preview-loading-note">Reading planning evidence only — no forecast data is changed while this loads.</div>
    </div>`;
  }

  function getLocalMetadata() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_METADATA_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Failed to load local Forecast Builder planning metadata:', error);
      return [];
    }
  }
  function setLocalMetadata(metadata) { localStorage.setItem(LOCAL_METADATA_KEY, JSON.stringify(metadata)); }
  function metadataKey(item) { return [item.fiscalYear, item.engineerId, item.jobNumber, item.workGroup || ''].join('|'); }

  async function loadMetadata(year) {
    if (window.isApiEnabled?.()) {
      const remote = await window.loadForecastPlanningMetadataFromApi?.(year);
      if (remote) return remote;
      if (window.API_CONFIG?.forceServerPersistence) throw new Error('Planning status could not be loaded from the server. The preview was not opened.');
    }
    return getLocalMetadata().filter(item => item.fiscalYear === year);
  }

  async function persistMetadata(item) {
    if (window.isApiEnabled?.()) {
      const saved = await window.saveForecastPlanningMetadataToApi?.(item);
      if (saved) return saved;
      if (window.API_CONFIG?.forceServerPersistence) throw new Error('The server did not confirm the planning-status change.');
    }
    const all = getLocalMetadata();
    const key = metadataKey(item);
    const next = [...all.filter(existing => metadataKey(existing) !== key), item];
    setLocalMetadata(next);
    return item;
  }

  async function removeMetadata(item) {
    if (window.isApiEnabled?.()) {
      const removed = await window.deleteForecastPlanningMetadataFromApi?.(item);
      if (removed) return true;
      if (window.API_CONFIG?.forceServerPersistence) throw new Error('The server did not confirm removal from the planning queue.');
    }
    const key = metadataKey(item);
    setLocalMetadata(getLocalMetadata().filter(existing => metadataKey(existing) !== key));
    return true;
  }

  function hydrateMap(raw) { return raw instanceof Map ? raw : new Map(Object.entries(raw || {})); }
  function loadLocalWorkDone(year) {
    try {
      const store = JSON.parse(localStorage.getItem(WORK_DONE_KEY) || '{}');
      return hydrateMap(store?.[year]?.data);
    } catch { return new Map(); }
  }
  async function loadWorkDone(year) {
    if (window.isApiEnabled?.()) {
      const result = await window.loadWorkDoneFromApi?.(year);
      return hydrateMap(result?.data);
    }
    return loadLocalWorkDone(year);
  }

  function requestIsCurrent(requestId, year) {
    return requestId === state.requestSerial && year === state.selectedYear;
  }

  async function loadPlanningEvidence(year, requestId) {
    const historyYears = window.getPlanningHistoryYears(year);
    const allYears = [year, ...historyYears];
    const v0ForecastsByYear = {};
    const effectiveForecastsByYear = {};
    const workDoneByYear = {};

    for (let index = 0; index < allYears.length; index += 1) {
      const fiscalYear = allYears[index];
      if (!requestIsCurrent(requestId, year)) return null;
      setLoadingProgress('Loading planning evidence', `Reading forecasts and Work Done for ${fiscalYear} (${index + 1} of ${allYears.length})`, (index / allYears.length) * 80);

      const [v0, v1, workDone] = await Promise.all([
        window.getForecastSnapshotAsync(fiscalYear, 'v0'),
        window.getForecastSnapshotAsync(fiscalYear, 'v1'),
        loadWorkDone(fiscalYear)
      ]);
      if (!requestIsCurrent(requestId, year)) return null;

      v0ForecastsByYear[fiscalYear] = v0?.data || new Map();
      effectiveForecastsByYear[fiscalYear] = (v0 || v1)
        ? window.getEffectiveForecastSnapshot(fiscalYear).data
        : new Map();
      workDoneByYear[fiscalYear] = workDone;
      setLoadingProgress('Loading planning evidence', `Finished ${fiscalYear} (${index + 1} of ${allYears.length})`, ((index + 1) / allYears.length) * 80);
    }
    return { v0ForecastsByYear, effectiveForecastsByYear, workDoneByYear };
  }

  function discoveryOptions(engineerId = state.selectedEngineerId) {
    return {
      selectedYear: state.selectedYear, engineerId,
      engineers: window.getEngineers?.() || [], planningMetadata: state.metadata,
      effectiveForecastsByYear: state.effectiveForecastsByYear,
      v0ForecastsByYear: state.v0ForecastsByYear,
      workDoneByYear: state.workDoneByYear,
      resolveWorkGroupCode: window.resolveWorkGroupCode
    };
  }

  function rebuildJobCache() {
    const next = new Map();
    (window.getEngineers?.() || []).forEach(engineer => {
      next.set(engineer.id, window.getStandardJobsForEngineer(discoveryOptions(engineer.id)));
    });
    state.jobsByEngineer = next;
  }

  function getJobs(engineerId = state.selectedEngineerId) {
    return state.jobsByEngineer.get(engineerId) || [];
  }
  function jobDetails(jobNumber) { return window.stdJobs?.get(jobNumber) || window.stdJobs?.get(String(jobNumber).padStart(6, '0')) || {}; }
  function currentV0Total(jobNumber) {
    const source = state.v0ForecastsByYear[state.selectedYear];
    const job = source?.get(jobNumber) || source?.get(String(jobNumber).padStart(6, '0'));
    return Object.values(job?.periods || {}).reduce((total, value) => total + (Number(value) || 0), 0);
  }
  function matchesFilter(jobs) {
    if (state.filter === 'forecasted') return jobs.length > 0 && jobs.every(job => job.forecasted);
    if (state.filter === 'not-forecasted') return jobs.some(job => !job.forecasted);
    return true;
  }

  function renderEngineerList() {
    const engineers = window.getEngineers?.() || [];
    const query = state.search.trim().toLowerCase();
    const visible = engineers.filter(engineer => (!query || engineer.name.toLowerCase().includes(query)) && matchesFilter(getJobs(engineer.id)));
    byId('forecastPreviewEngineerList').innerHTML = visible.length ? visible.map(engineer => {
      const jobs = getJobs(engineer.id), done = jobs.filter(job => job.forecasted).length;
      const percent = jobs.length ? (done / jobs.length) * 100 : 0;
      return `<button type="button" class="preview-engineer-item ${engineer.id === state.selectedEngineerId ? 'active' : ''}" data-engineer-id="${escapeHtml(engineer.id)}">
        <span class="preview-engineer-item-head"><span>${escapeHtml(engineer.name)}</span><span>${done}/${jobs.length}</span></span>
        <span class="preview-engineer-item-meta">${done} of ${jobs.length} Standard Jobs forecasted</span>
        <span class="preview-mini-track"><span style="width:${percent}%"></span></span></button>`;
    }).join('') : '<div class="preview-empty">No engineers match this filter.</div>';
  }

  function renderJobList() {
    const jobs = getJobs(), list = byId('forecastPreviewJobList');
    if (!jobs.length) {
      list.innerHTML = '<div class="preview-empty forecast-card">No Standard Jobs were found in the three-year evidence window. Use “Add Standard Job” for genuinely new work.</div>';
      return;
    }
    list.innerHTML = jobs.map(job => {
      const details = jobDetails(job.jobNumber), total = currentV0Total(job.jobNumber);
      const canRemove = window.canRemoveManuallyAddedStandardJob({ ...discoveryOptions(), jobNumber: job.jobNumber });
      return `<article class="preview-job-card"><div class="preview-job-card-main"><div>
        <div class="preview-job-title"><span class="preview-job-number">${escapeHtml(job.jobNumber)}</span><span>${escapeHtml(details.desc || 'Standard Job')}</span></div>
        <div class="preview-job-meta">${escapeHtml(details.unit || 'Unit not recorded')} · ${job.workGroupCount} Work Group Set${job.workGroupCount === 1 ? '' : 's'}</div>
        <div class="preview-reasons">${job.reasons.map(reason => `<span class="preview-reason">${escapeHtml(reason)}</span>`).join('')}</div></div>
        <div class="preview-job-actions"><div class="preview-job-total"><span>${escapeHtml(state.selectedYear)} V0 total</span><strong>${total.toLocaleString()}</strong></div>
        ${canRemove ? `<button type="button" class="group-action-button preview-remove-job" data-remove-job="${escapeHtml(job.jobNumber)}">Remove</button>` : ''}
        <button type="button" class="preview-status-toggle ${job.forecasted ? 'is-forecasted' : ''}" data-job-number="${escapeHtml(job.jobNumber)}" data-forecasted="${job.forecasted}">${job.forecasted ? '✓ Forecasted' : 'Mark Forecasted'}</button></div></div></article>`;
    }).join('');
  }

  function renderSelectedEngineer() {
    const engineers = window.getEngineers?.() || [];
    const engineer = engineers.find(item => item.id === state.selectedEngineerId) || engineers[0];
    if (!engineer) return;
    state.selectedEngineerId = engineer.id;
    const jobs = getJobs(), done = jobs.filter(job => job.forecasted).length;
    const percent = jobs.length ? (done / jobs.length) * 100 : 0;
    byId('forecastPreviewEngineerTitle').textContent = engineer.name;
    byId('forecastPreviewProgressText').textContent = `${done} of ${jobs.length} Standard Jobs forecasted`;
    byId('forecastPreviewProgressBar').style.width = `${percent}%`;
    renderJobList();
  }
  function renderAll() { renderEngineerList(); renderSelectedEngineer(); }

  async function refreshPreview() {
    const requestId = ++state.requestSerial;
    const requestedYear = state.selectedYear;
    state.loading = true;
    byId('forecastPreviewLoading').hidden = false;
    byId('forecastPreviewContent').hidden = true;
    setLoadingProgress('Loading planning evidence', `Preparing ${requestedYear}`, 2);

    try {
      const metadataPromise = loadMetadata(requestedYear);
      const evidence = await loadPlanningEvidence(requestedYear, requestId);
      if (!evidence || !requestIsCurrent(requestId, requestedYear)) return;
      const metadata = await metadataPromise;
      if (!requestIsCurrent(requestId, requestedYear)) return;

      state.metadata = metadata;
      Object.assign(state, evidence);
      setLoadingProgress('Organising Standard Jobs', 'Building engineer planning queues once for fast navigation', 90);
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!requestIsCurrent(requestId, requestedYear)) return;
      rebuildJobCache();

      const engineers = window.getEngineers?.() || [];
      if (!engineers.some(item => item.id === state.selectedEngineerId)) state.selectedEngineerId = engineers[0]?.id || '';
      setLoadingProgress('Organising Standard Jobs', 'Ready', 100);
      renderAll();
      byId('forecastPreviewLoading').hidden = true;
      byId('forecastPreviewContent').hidden = false;
      byId('forecastPreviewState').textContent = 'Planning status loaded';
    } catch (error) {
      if (!requestIsCurrent(requestId, requestedYear)) return;
      console.error('Failed to open Forecast Builder Preview:', error);
      byId('forecastPreviewLoading').textContent = error.message || 'Planning evidence could not be loaded.';
      byId('forecastPreviewState').textContent = 'Preview unavailable';
    } finally {
      if (requestIsCurrent(requestId, requestedYear)) state.loading = false;
    }
  }

  async function openForecastBuilderPreview() {
    byId('dashboardPage')?.classList.add('is-hidden'); byId('forecastPage')?.classList.add('is-hidden');
    byId('baselinePage')?.classList.add('is-hidden'); byId('forecastBuilderPreviewPage')?.classList.remove('is-hidden');
    window.scrollTo({ top: 0, behavior: 'auto' });
    const years = window.getFinancialYearOptions?.() || window.DEFAULT_FINANCIAL_YEARS || [];
    const yearSelect = byId('forecastPreviewYear');
    yearSelect.innerHTML = years.map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)} — Original Approved Plan</option>`).join('');
    state.selectedYear = years.includes('FY28') ? 'FY28' : (window.currentFinancialYear || years[0]);
    yearSelect.value = state.selectedYear;
    await refreshPreview();
  }
  function closeForecastBuilderPreview() {
    state.requestSerial += 1;
    byId('forecastBuilderPreviewPage')?.classList.add('is-hidden'); byId('dashboardPage')?.classList.remove('is-hidden');
  }

  async function toggleForecasted(button) {
    const item = { fiscalYear: state.selectedYear, engineerId: state.selectedEngineerId, jobNumber: button.dataset.jobNumber, workGroup: '', forecasted: button.dataset.forecasted !== 'true' };
    button.disabled = true; byId('forecastPreviewState').textContent = 'Saving planning status…';
    try {
      const saved = await persistMetadata(item), key = metadataKey(saved);
      state.metadata = [...state.metadata.filter(existing => metadataKey(existing) !== key), saved];
      rebuildJobCache(); renderAll(); byId('forecastPreviewState').textContent = 'Planning status saved';
    } catch (error) { window.Toast?.error(error.message); byId('forecastPreviewState').textContent = 'Planning status not saved'; button.disabled = false; }
  }

  async function removeStandardJob(button) {
    const item = { fiscalYear: state.selectedYear, engineerId: state.selectedEngineerId, jobNumber: button.dataset.removeJob, workGroup: '', forecasted: false };
    if (!window.confirm('Remove this untouched Standard Job from the planning queue? No forecast data will be deleted.')) return;
    button.disabled = true;
    try {
      await removeMetadata(item); const key = metadataKey(item);
      state.metadata = state.metadata.filter(existing => metadataKey(existing) !== key);
      rebuildJobCache(); renderAll(); byId('forecastPreviewState').textContent = 'Untouched Standard Job removed';
    } catch (error) { window.Toast?.error(error.message); button.disabled = false; }
  }

  function navigateEngineer(offset) {
    const engineers = window.getEngineers?.() || [], current = engineers.findIndex(item => item.id === state.selectedEngineerId);
    state.selectedEngineerId = engineers[(current + offset + engineers.length) % engineers.length]?.id || state.selectedEngineerId; renderAll();
  }
  function openForecastPreviewAddJob() {
    byId('forecastPreviewJobOptions').innerHTML = (window.STANDARD_JOBS || []).map(job => `<option value="${escapeHtml(job.standardJobNo)} — ${escapeHtml(job.standardJobDescription)}"></option>`).join('');
    byId('forecastPreviewJobSearch').value = ''; byId('forecastPreviewAddJobMessage').textContent = '';
    byId('forecastPreviewAddJobModal').classList.add('open'); byId('forecastPreviewJobSearch').focus();
  }
  function closeForecastPreviewAddJob() { byId('forecastPreviewAddJobModal').classList.remove('open'); }
  async function addStandardJob() {
    const value = byId('forecastPreviewJobSearch').value.trim(), jobNumber = value.match(/^\s*(\d+)/)?.[1];
    const exists = (window.STANDARD_JOBS || []).some(job => String(job.standardJobNo) === jobNumber);
    if (!jobNumber || !exists) { byId('forecastPreviewAddJobMessage').textContent = 'Select a valid Standard Job from the list.'; return; }
    const item = { fiscalYear: state.selectedYear, engineerId: state.selectedEngineerId, jobNumber: window.normalizeJobNumber(jobNumber), workGroup: '', forecasted: false };
    try {
      const saved = await persistMetadata(item), key = metadataKey(saved);
      state.metadata = [...state.metadata.filter(existing => metadataKey(existing) !== key), saved];
      rebuildJobCache(); closeForecastPreviewAddJob(); renderAll(); byId('forecastPreviewState').textContent = 'Standard Job added as Not Forecasted';
    } catch (error) { byId('forecastPreviewAddJobMessage').textContent = error.message; }
  }

  document.addEventListener('DOMContentLoaded', () => {
    byId('forecastPreviewYear')?.addEventListener('change', event => { state.selectedYear = event.target.value; refreshPreview(); });
    byId('forecastPreviewEngineerSearch')?.addEventListener('input', event => { state.search = event.target.value; renderEngineerList(); });
    document.querySelectorAll('[data-preview-filter]').forEach(button => button.addEventListener('click', () => {
      state.filter = button.dataset.previewFilter;
      document.querySelectorAll('[data-preview-filter]').forEach(item => item.classList.toggle('active', item === button)); renderEngineerList();
    }));
    byId('forecastPreviewEngineerList')?.addEventListener('click', event => { const button = event.target.closest('[data-engineer-id]'); if (!button) return; state.selectedEngineerId = button.dataset.engineerId; renderAll(); });
    byId('forecastPreviewJobList')?.addEventListener('click', event => {
      const removeButton = event.target.closest('[data-remove-job]'); if (removeButton) { removeStandardJob(removeButton); return; }
      const button = event.target.closest('[data-job-number]'); if (button) toggleForecasted(button);
    });
    byId('forecastPreviewPrevious')?.addEventListener('click', () => navigateEngineer(-1));
    byId('forecastPreviewNext')?.addEventListener('click', () => navigateEngineer(1));
    byId('forecastPreviewAddJob')?.addEventListener('click', openForecastPreviewAddJob);
    byId('forecastPreviewConfirmAddJob')?.addEventListener('click', addStandardJob);
  });

  Object.assign(window, { openForecastBuilderPreview, closeForecastBuilderPreview, openForecastPreviewAddJob, closeForecastPreviewAddJob });
})(window);
