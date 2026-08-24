/** Phase 2 read-only shell and manual Forecasted workflow. */
(function initializeForecastBuilderPreview(window) {
  const LOCAL_METADATA_KEY = 'aprForecastPlanningMetadataV1';
  const WORK_DONE_KEY = 'aprWorkDoneByYearV1';
  const state = {
    selectedYear: '', selectedEngineerId: '', filter: 'all', search: '',
    metadata: [], effectiveForecastsByYear: {}, v0ForecastsByYear: {}, workDoneByYear: {}, loading: false
  };

  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  function getLocalMetadata() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_METADATA_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Failed to load local Forecast Builder planning metadata:', error);
      return [];
    }
  }

  function setLocalMetadata(metadata) {
    localStorage.setItem(LOCAL_METADATA_KEY, JSON.stringify(metadata));
  }

  function metadataKey(item) {
    return [item.fiscalYear, item.engineerId, item.jobNumber, item.workGroup || ''].join('|');
  }

  async function loadMetadata(year) {
    if (window.isApiEnabled?.()) {
      const remote = await window.loadForecastPlanningMetadataFromApi?.(year);
      if (remote) return remote;
      if (window.API_CONFIG?.forceServerPersistence) {
        throw new Error('Planning status could not be loaded from the server. The preview was not opened.');
      }
    }
    return getLocalMetadata().filter(item => item.fiscalYear === year);
  }

  async function persistMetadata(item) {
    if (window.isApiEnabled?.()) {
      const saved = await window.saveForecastPlanningMetadataToApi?.(item);
      if (saved) return saved;
      if (window.API_CONFIG?.forceServerPersistence) {
        throw new Error('The server did not confirm the planning-status change.');
      }
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
      if (window.API_CONFIG?.forceServerPersistence) {
        throw new Error('The server did not confirm removal from the planning queue.');
      }
    }
    const key = metadataKey(item);
    setLocalMetadata(getLocalMetadata().filter(existing => metadataKey(existing) !== key));
    return true;
  }

  function hydrateMap(raw) {
    return raw instanceof Map ? raw : new Map(Object.entries(raw || {}));
  }

  function loadLocalWorkDone(year) {
    try {
      const store = JSON.parse(localStorage.getItem(WORK_DONE_KEY) || '{}');
      return hydrateMap(store?.[year]?.data);
    } catch {
      return new Map();
    }
  }

  async function loadWorkDone(year) {
    if (window.isApiEnabled?.()) {
      const result = await window.loadWorkDoneFromApi?.(year);
      return hydrateMap(result?.data);
    }
    return loadLocalWorkDone(year);
  }

  async function loadPlanningEvidence(year) {
    const historyYears = window.getPlanningHistoryYears(year);
    const allYears = [year, ...historyYears];
    const v0ForecastsByYear = {};
    const effectiveForecastsByYear = {};
    const workDoneByYear = {};
    await Promise.all(allYears.map(async fiscalYear => {
      const [v0, v1, workDone] = await Promise.all([
        window.getForecastSnapshotAsync(fiscalYear, 'v0'),
        window.getForecastSnapshotAsync(fiscalYear, 'v1'),
        loadWorkDone(fiscalYear)
      ]);
      v0ForecastsByYear[fiscalYear] = v0?.data || new Map();
      effectiveForecastsByYear[fiscalYear] = (v0 || v1)
        ? window.getEffectiveForecastSnapshot(fiscalYear).data
        : new Map();
      workDoneByYear[fiscalYear] = workDone;
    }));
    return { v0ForecastsByYear, effectiveForecastsByYear, workDoneByYear };
  }

  function discoveryOptions(engineerId = state.selectedEngineerId) {
    return {
      selectedYear: state.selectedYear,
      engineerId,
      engineers: window.getEngineers?.() || [],
      planningMetadata: state.metadata,
      effectiveForecastsByYear: state.effectiveForecastsByYear,
      v0ForecastsByYear: state.v0ForecastsByYear,
      workDoneByYear: state.workDoneByYear,
      resolveWorkGroupCode: window.resolveWorkGroupCode
    };
  }

  function getJobs(engineerId = state.selectedEngineerId) {
    return window.getStandardJobsForEngineer(discoveryOptions(engineerId));
  }

  function jobDetails(jobNumber) {
    return window.stdJobs?.get(jobNumber) || window.stdJobs?.get(String(jobNumber).padStart(6, '0')) || {};
  }

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
    const visible = engineers.filter(engineer => {
      const jobs = getJobs(engineer.id);
      return (!query || engineer.name.toLowerCase().includes(query)) && matchesFilter(jobs);
    });
    byId('forecastPreviewEngineerList').innerHTML = visible.length ? visible.map(engineer => {
      const jobs = getJobs(engineer.id);
      const done = jobs.filter(job => job.forecasted).length;
      const percent = jobs.length ? (done / jobs.length) * 100 : 0;
      return `<button type="button" class="preview-engineer-item ${engineer.id === state.selectedEngineerId ? 'active' : ''}" data-engineer-id="${escapeHtml(engineer.id)}">
        <span class="preview-engineer-item-head"><span>${escapeHtml(engineer.name)}</span><span>${done}/${jobs.length}</span></span>
        <span class="preview-engineer-item-meta">${done} of ${jobs.length} Standard Jobs forecasted</span>
        <span class="preview-mini-track"><span style="width:${percent}%"></span></span>
      </button>`;
    }).join('') : '<div class="preview-empty">No engineers match this filter.</div>';
  }

  function renderJobList() {
    const jobs = getJobs();
    const list = byId('forecastPreviewJobList');
    if (!jobs.length) {
      list.innerHTML = '<div class="preview-empty forecast-card">No Standard Jobs were found in the three-year evidence window. Use “Add Standard Job” for genuinely new work.</div>';
      return;
    }
    list.innerHTML = jobs.map(job => {
      const details = jobDetails(job.jobNumber);
      const total = currentV0Total(job.jobNumber);
      const canRemove = window.canRemoveManuallyAddedStandardJob({
        ...discoveryOptions(), jobNumber: job.jobNumber
      });
      return `<article class="preview-job-card">
        <div class="preview-job-card-main">
          <div>
            <div class="preview-job-title"><span class="preview-job-number">${escapeHtml(job.jobNumber)}</span><span>${escapeHtml(details.desc || 'Standard Job')}</span></div>
            <div class="preview-job-meta">${escapeHtml(details.unit || 'Unit not recorded')} · ${job.workGroupCount} Work Group Set${job.workGroupCount === 1 ? '' : 's'}</div>
            <div class="preview-reasons">${job.reasons.map(reason => `<span class="preview-reason">${escapeHtml(reason)}</span>`).join('')}</div>
          </div>
          <div class="preview-job-actions">
            <div class="preview-job-total"><span>${escapeHtml(state.selectedYear)} V0 total</span><strong>${total.toLocaleString()}</strong></div>
            ${canRemove ? `<button type="button" class="group-action-button preview-remove-job" data-remove-job="${escapeHtml(job.jobNumber)}">Remove</button>` : ''}
            <button type="button" class="preview-status-toggle ${job.forecasted ? 'is-forecasted' : ''}" data-job-number="${escapeHtml(job.jobNumber)}" data-forecasted="${job.forecasted}">${job.forecasted ? '✓ Forecasted' : 'Mark Forecasted'}</button>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  function renderSelectedEngineer() {
    const engineers = window.getEngineers?.() || [];
    const engineer = engineers.find(item => item.id === state.selectedEngineerId) || engineers[0];
    if (!engineer) return;
    state.selectedEngineerId = engineer.id;
    const jobs = getJobs();
    const done = jobs.filter(job => job.forecasted).length;
    const percent = jobs.length ? (done / jobs.length) * 100 : 0;
    byId('forecastPreviewEngineerTitle').textContent = engineer.name;
    byId('forecastPreviewProgressText').textContent = `${done} of ${jobs.length} Standard Jobs forecasted`;
    byId('forecastPreviewProgressBar').style.width = `${percent}%`;
    renderJobList();
  }

  function renderAll() {
    renderEngineerList();
    renderSelectedEngineer();
  }

  async function refreshPreview() {
    state.loading = true;
    byId('forecastPreviewLoading').hidden = false;
    byId('forecastPreviewContent').hidden = true;
    byId('forecastPreviewLoading').textContent = 'Loading planning evidence…';
    try {
      const [metadata, evidence] = await Promise.all([
        loadMetadata(state.selectedYear), loadPlanningEvidence(state.selectedYear)
      ]);
      state.metadata = metadata;
      Object.assign(state, evidence);
      const engineers = window.getEngineers?.() || [];
      if (!engineers.some(item => item.id === state.selectedEngineerId)) state.selectedEngineerId = engineers[0]?.id || '';
      renderAll();
      byId('forecastPreviewLoading').hidden = true;
      byId('forecastPreviewContent').hidden = false;
      byId('forecastPreviewState').textContent = 'Planning status loaded';
    } catch (error) {
      console.error('Failed to open Forecast Builder Preview:', error);
      byId('forecastPreviewLoading').textContent = error.message || 'Planning evidence could not be loaded.';
      byId('forecastPreviewState').textContent = 'Preview unavailable';
    } finally {
      state.loading = false;
    }
  }

  async function openForecastBuilderPreview() {
    byId('dashboardPage')?.classList.add('is-hidden');
    byId('forecastPage')?.classList.add('is-hidden');
    byId('baselinePage')?.classList.add('is-hidden');
    byId('forecastBuilderPreviewPage')?.classList.remove('is-hidden');
    window.scrollTo({ top: 0, behavior: 'auto' });
    const years = window.getFinancialYearOptions?.() || window.DEFAULT_FINANCIAL_YEARS || [];
    const yearSelect = byId('forecastPreviewYear');
    yearSelect.innerHTML = years.map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)} — Original Approved Plan</option>`).join('');
    state.selectedYear = years.includes('FY28') ? 'FY28' : (window.currentFinancialYear || years[0]);
    yearSelect.value = state.selectedYear;
    await refreshPreview();
  }

  function closeForecastBuilderPreview() {
    byId('forecastBuilderPreviewPage')?.classList.add('is-hidden');
    byId('dashboardPage')?.classList.remove('is-hidden');
  }

  async function toggleForecasted(button) {
    const item = {
      fiscalYear: state.selectedYear,
      engineerId: state.selectedEngineerId,
      jobNumber: button.dataset.jobNumber,
      workGroup: '',
      forecasted: button.dataset.forecasted !== 'true'
    };
    button.disabled = true;
    byId('forecastPreviewState').textContent = 'Saving planning status…';
    try {
      const saved = await persistMetadata(item);
      const key = metadataKey(saved);
      state.metadata = [...state.metadata.filter(existing => metadataKey(existing) !== key), saved];
      renderAll();
      byId('forecastPreviewState').textContent = 'Planning status saved';
    } catch (error) {
      window.Toast?.error(error.message);
      byId('forecastPreviewState').textContent = 'Planning status not saved';
      button.disabled = false;
    }
  }

  async function removeStandardJob(button) {
    const item = {
      fiscalYear: state.selectedYear, engineerId: state.selectedEngineerId,
      jobNumber: button.dataset.removeJob, workGroup: '', forecasted: false
    };
    if (!window.confirm('Remove this untouched Standard Job from the planning queue? No forecast data will be deleted.')) return;
    button.disabled = true;
    try {
      await removeMetadata(item);
      const key = metadataKey(item);
      state.metadata = state.metadata.filter(existing => metadataKey(existing) !== key);
      renderAll();
      byId('forecastPreviewState').textContent = 'Untouched Standard Job removed';
    } catch (error) {
      window.Toast?.error(error.message);
      button.disabled = false;
    }
  }

  function navigateEngineer(offset) {
    const engineers = window.getEngineers?.() || [];
    const current = engineers.findIndex(item => item.id === state.selectedEngineerId);
    state.selectedEngineerId = engineers[(current + offset + engineers.length) % engineers.length]?.id || state.selectedEngineerId;
    renderAll();
  }

  function openForecastPreviewAddJob() {
    const options = (window.STANDARD_JOBS || []).map(job =>
      `<option value="${escapeHtml(job.standardJobNo)} — ${escapeHtml(job.standardJobDescription)}"></option>`).join('');
    byId('forecastPreviewJobOptions').innerHTML = options;
    byId('forecastPreviewJobSearch').value = '';
    byId('forecastPreviewAddJobMessage').textContent = '';
    byId('forecastPreviewAddJobModal').classList.add('open');
    byId('forecastPreviewJobSearch').focus();
  }

  function closeForecastPreviewAddJob() {
    byId('forecastPreviewAddJobModal').classList.remove('open');
  }

  async function addStandardJob() {
    const value = byId('forecastPreviewJobSearch').value.trim();
    const jobNumber = value.match(/^\s*(\d+)/)?.[1];
    const exists = (window.STANDARD_JOBS || []).some(job => String(job.standardJobNo) === jobNumber);
    if (!jobNumber || !exists) {
      byId('forecastPreviewAddJobMessage').textContent = 'Select a valid Standard Job from the list.';
      return;
    }
    const item = {
      fiscalYear: state.selectedYear, engineerId: state.selectedEngineerId,
      jobNumber: window.normalizeJobNumber(jobNumber), workGroup: '', forecasted: false
    };
    try {
      const saved = await persistMetadata(item);
      const key = metadataKey(saved);
      state.metadata = [...state.metadata.filter(existing => metadataKey(existing) !== key), saved];
      closeForecastPreviewAddJob();
      renderAll();
      byId('forecastPreviewState').textContent = 'Standard Job added as Not Forecasted';
    } catch (error) {
      byId('forecastPreviewAddJobMessage').textContent = error.message;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    byId('forecastPreviewYear')?.addEventListener('change', event => {
      state.selectedYear = event.target.value;
      refreshPreview();
    });
    byId('forecastPreviewEngineerSearch')?.addEventListener('input', event => {
      state.search = event.target.value;
      renderEngineerList();
    });
    document.querySelectorAll('[data-preview-filter]').forEach(button => button.addEventListener('click', () => {
      state.filter = button.dataset.previewFilter;
      document.querySelectorAll('[data-preview-filter]').forEach(item => item.classList.toggle('active', item === button));
      renderEngineerList();
    }));
    byId('forecastPreviewEngineerList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-engineer-id]');
      if (!button) return;
      state.selectedEngineerId = button.dataset.engineerId;
      renderAll();
    });
    byId('forecastPreviewJobList')?.addEventListener('click', event => {
      const removeButton = event.target.closest('[data-remove-job]');
      if (removeButton) {
        removeStandardJob(removeButton);
        return;
      }
      const button = event.target.closest('[data-job-number]');
      if (button) toggleForecasted(button);
    });
    byId('forecastPreviewPrevious')?.addEventListener('click', () => navigateEngineer(-1));
    byId('forecastPreviewNext')?.addEventListener('click', () => navigateEngineer(1));
    byId('forecastPreviewAddJob')?.addEventListener('click', openForecastPreviewAddJob);
    byId('forecastPreviewConfirmAddJob')?.addEventListener('click', addStandardJob);
  });

  Object.assign(window, {
    openForecastBuilderPreview, closeForecastBuilderPreview,
    openForecastPreviewAddJob, closeForecastPreviewAddJob
  });
})(window);
