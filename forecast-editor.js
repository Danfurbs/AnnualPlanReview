/**
 * forecast-editor.js
 * Forecast editor UI and interaction logic
 */

/**
 * Create an empty forecast row
 */
function createForecastEditorRow() {
  const volumes = {};
  window.FORECAST_PERIODS.forEach(period => {
    volumes[period] = 0;
  });

  return {
    jobNumber: '',
    desc: '',
    unit: '',
    volumes,
    comment: ''
  };
}

/**
 * Open the forecast editor page
 */
async function openForecastEditor() {
  try {
    const dashboardPage = document.getElementById('dashboardPage');
    const forecastPage = document.getElementById('forecastPage');

    if (dashboardPage) dashboardPage.classList.add('is-hidden');
    if (forecastPage) forecastPage.classList.remove('is-hidden');

    await initializeForecastEditor();
  } catch (error) {
    console.error('Error in openForecastEditor:', error);
    alert('Error opening forecast editor: ' + error.message);
  }
}

/**
 * Close the forecast editor page
 */
async function closeForecastEditor() {
  // Sync DOM state to editor state
  syncForecastEditorTableState();

  // Check if there are ACTUAL unsaved changes by comparing editor state to saved data
  const hasUnsavedChanges = hasActualUnsavedChanges();

  if (hasUnsavedChanges) {
    const shouldSave = confirm(
      'You have unsaved changes in the forecast editor.\n\n' +
      'Click OK to save before closing, or Cancel to discard changes.'
    );

    if (shouldSave) {
      // Wait for save to complete before closing
      await handleForecastEditorSubmit();
    }
  }

  const dashboardPage = document.getElementById('dashboardPage');
  const forecastPage = document.getElementById('forecastPage');

  if (forecastPage) forecastPage.classList.add('is-hidden');
  if (dashboardPage) dashboardPage.classList.remove('is-hidden');

  // Reload forecast data from API/storage and refresh dashboard
  const forecastCache = await loadForecastFromStorageAsync(window.currentFinancialYear, window.currentPlanVersion);
  if (forecastCache) {
    window.fData = forecastCache.data;
  }

  // Trigger dashboard re-render to show updated forecast
  if (typeof window.render === 'function') {
    window.render();
  }
}

/**
 * Check if there are actual unsaved changes by comparing editor state to saved data
 */
function hasActualUnsavedChanges() {
  if (!window.forecastEditorState.workGroup || !window.fData) {
    return false;
  }

  const workGroup = window.forecastEditorState.workGroup;

  // Get rows with data from editor state
  const editorRows = window.forecastEditorState.rows.filter(row => {
    if (!row.jobNumber) return false;
    const hasVolume = Object.values(row.volumes).some(v => v !== 0);
    const hasComment = row.comment && row.comment.trim().length > 0;
    return hasVolume || hasComment;
  });

  // Compare each editor row against saved data
  for (const row of editorRows) {
    const savedJob = window.fData.get(row.jobNumber);
    const savedWgData = savedJob?.wgs?.[workGroup];
    const savedComment = savedJob?.comments?.[workGroup];

    // Check volumes
    for (const period of window.FORECAST_PERIODS) {
      const editorValue = Number(row.volumes[period]) || 0;
      const savedValue = Number(savedWgData?.[period]) || 0;
      if (editorValue !== savedValue) {
        return true; // Found a difference
      }
    }

    // Check comments
    const editorComment = (row.comment || '').trim();
    const savedCommentText = (savedComment || '').trim();
    if (editorComment !== savedCommentText) {
      return true; // Comment differs
    }
  }

  // Check if any saved jobs for this work group are missing from editor (deletions)
  if (window.fData) {
    for (const [jobNumber, job] of window.fData.entries()) {
      if (job.wgs && job.wgs[workGroup]) {
        // This job exists in saved data for this work group
        const inEditor = editorRows.some(row => row.jobNumber === jobNumber);
        if (!inEditor) {
          return true; // Job was deleted in editor
        }
      }
    }
  }

  return false; // No changes detected
}

/**
 * Initialize forecast editor (load data and render)
 */
async function initializeForecastEditor() {
  try {
    // Set initial context
    const yearOptions = getFinancialYearOptions();

    window.forecastEditorState.year = window.currentFinancialYear || yearOptions[0] || 'FY27';
    window.forecastEditorState.planVersion = window.currentPlanVersion || 'v0';

    // Load forecast for this context (checks API if enabled)
    const snapshot = await getForecastSnapshotAsync(window.forecastEditorState.year, window.forecastEditorState.planVersion);

    window.fData = snapshot ? snapshot.data : null;

    // Render selectors and table
    renderForecastEditorSelectors();
    renderForecastEditorTable();
    updateForecastEditorSummary();
  } catch (error) {
    console.error('Error in initializeForecastEditor:', error);
    throw error;
  }
}

/**
 * Render forecast editor context selectors (year, plan, work group)
 */
function renderForecastEditorSelectors() {
  const yearSelect = document.getElementById('forecastEditorYear');
  const planSelect = document.getElementById('forecastEditorPlan');

  if (!yearSelect || !planSelect) return;

  // Year selector
  const yearOptions = getFinancialYearOptions();
  yearSelect.innerHTML = yearOptions
    .map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`)
    .join('');
  window.forecastEditorState.year = yearOptions.includes(window.forecastEditorState.year)
    ? window.forecastEditorState.year
    : (window.currentFinancialYear || yearOptions[0] || '');
  yearSelect.value = window.forecastEditorState.year;

  // Plan version selector
  planSelect.innerHTML = window.PLAN_VERSIONS
    .map(plan => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.label)}</option>`)
    .join('');
  window.forecastEditorState.planVersion = window.PLAN_VERSIONS.some(plan => plan.id === window.forecastEditorState.planVersion)
    ? window.forecastEditorState.planVersion
    : (window.currentPlanVersion || 'v0');
  planSelect.value = window.forecastEditorState.planVersion;

  // Render grouped work group selector
  renderWorkGroupSelector();
  updateCurrentWorkGroupDisplay();

  // Load rows for current context
  loadForecastEditorRows();
  renderForecastEditorJobOptions();
}

/**
 * Get collapsed disciplines from localStorage
 */
function getCollapsedDisciplines() {
  try {
    const stored = localStorage.getItem('forecastCollapsedDisciplines');
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.warn('Failed to load collapsed disciplines:', e);
  }
  return new Set();
}

/**
 * Save collapsed disciplines to localStorage
 */
function saveCollapsedDisciplines(disciplines) {
  try {
    localStorage.setItem('forecastCollapsedDisciplines', JSON.stringify(Array.from(disciplines)));
  } catch (e) {
    console.warn('Failed to save collapsed disciplines:', e);
  }
}

/**
 * Render the grouped work group selector list
 */
function renderWorkGroupSelector(filter = 'all', searchText = '') {
  const container = document.getElementById('workGroupSelectorList');
  if (!container) return;

  const statuses = getWorkGroupStatuses(
    window.fData,
    window.forecastEditorState.planVersion,
    window.forecastEditorState.year
  );

  const disciplines = getSortedDisciplines();
  const normalizedSearch = searchText.toLowerCase().trim();
  const v1Comparison = window.forecastEditorState.planVersion === 'v1'
    ? getV1WorkGroupComparison(window.forecastEditorState.year)
    : new Map();

  let html = '';

  disciplines.forEach(discipline => {
    // Filter work groups by status and search
    const filteredWorkGroups = discipline.workGroups.filter(wg => {
      const status = statuses.get(wg.code);
      const hasData = status?.hasData || false;

      // Apply status filter
      if (filter === 'with-data' && !hasData) return false;
      if (filter === 'without-data' && hasData) return false;

      // Apply search filter
      if (normalizedSearch) {
        const searchable = `${wg.code} ${wg.description} ${wg.shortName}`.toLowerCase();
        if (!searchable.includes(normalizedSearch)) return false;
      }

      return true;
    });

    if (filteredWorkGroups.length === 0) return;

    // Count stats for this discipline
    const disciplineStats = filteredWorkGroups.reduce((acc, wg) => {
      const status = statuses.get(wg.code);
      if (status?.hasData) acc.done++;
      else acc.todo++;
      return acc;
    }, { done: 0, todo: 0 });

    // Check if this discipline should be collapsed (persisted state)
    const collapsedDisciplines = getCollapsedDisciplines();
    const isCollapsed = collapsedDisciplines.has(discipline.name);

    html += `
      <div class="wg-discipline-group${isCollapsed ? ' collapsed' : ''}" data-discipline="${escapeHtml(discipline.name)}">
        <div class="wg-discipline-header" data-toggle-discipline="${escapeHtml(discipline.name)}">
          <span class="wg-discipline-toggle">&#9660;</span>
          <span class="wg-discipline-name">${escapeHtml(discipline.name)}</span>
          <span class="wg-discipline-stats">
            <span class="wg-disc-done">${disciplineStats.done}</span>/<span class="wg-disc-total">${filteredWorkGroups.length}</span>
          </span>
        </div>
        <div class="wg-discipline-items">
          ${filteredWorkGroups.map(wg => {
            const status = statuses.get(wg.code);
            const hasData = status?.hasData || false;
            const isSelected = wg.code === window.forecastEditorState.workGroup;
            const versionState = v1Comparison.get(normalizeWorkGroupSet(wg.code));
            const versionLabel = versionState === 'changed' ? 'Changed'
              : versionState === 'v1-only' ? 'New'
                : versionState === 'removed' ? 'Removed'
                  : versionState === 'mirrored' ? 'From v0' : '';
            return `
              <button type="button"
                      class="wg-item ${hasData ? 'wg-item--done' : 'wg-item--todo'} ${isSelected ? 'wg-item--selected' : ''}"
                      data-wg-code="${escapeHtml(wg.code)}"
                      title="${escapeHtml(wg.description)}${status?.jobCount ? ` (${status.jobCount} jobs)` : ''}">
                <span class="wg-item-indicator"></span>
                <span class="wg-item-name">${escapeHtml(wg.shortName)}</span>
                ${versionLabel ? `<span class="wg-version-badge wg-version-badge--${versionState}">${versionLabel}</span>` : ''}
                ${status?.jobCount ? `<span class="wg-item-count">${status.jobCount}</span>` : ''}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  if (!html) {
    html = '<div class="wg-empty">No work groups match your filter</div>';
  }

  container.innerHTML = html;

  // Attach click handlers for work group items
  container.querySelectorAll('.wg-item').forEach(item => {
    item.addEventListener('click', () => {
      const wgCode = item.dataset.wgCode;
      selectWorkGroup(wgCode);
    });
  });

  // Attach click handlers for discipline headers (collapse/expand)
  container.querySelectorAll('.wg-discipline-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't toggle if clicking on a work group item
      if (e.target.closest('.wg-item')) return;

      const disciplineName = header.dataset.toggleDiscipline;
      if (!disciplineName) return;

      const group = header.closest('.wg-discipline-group');
      if (!group) return;

      // Toggle collapsed class
      group.classList.toggle('collapsed');

      // Persist collapsed state
      const collapsedDisciplines = getCollapsedDisciplines();
      if (group.classList.contains('collapsed')) {
        collapsedDisciplines.add(disciplineName);
      } else {
        collapsedDisciplines.delete(disciplineName);
      }
      saveCollapsedDisciplines(collapsedDisciplines);
    });
  });
}

/** Summarize the two independent snapshots for optional visual comparison. */
function getV1WorkGroupComparison(year) {
  const comparison = new Map();
  const v0 = getForecastSnapshot(year, 'v0')?.data || new Map();
  const savedV1 = getForecastSnapshot(year, 'v1')?.data || new Map();
  const v1 = savedV1;
  const groups = new Set();
  const collect = data => data.forEach(job => Object.keys(job?.wgs || {}).forEach(code => groups.add(normalizeWorkGroupSet(code))));
  collect(v0);
  collect(v1);

  const snapshot = (data, group) => {
    const result = {};
    data.forEach((job, jobNumber) => {
      const key = Object.keys(job?.wgs || {}).find(code => normalizeWorkGroupSet(code) === group);
      if (!key) return;
      result[jobNumber] = {
        periods: window.FORECAST_PERIODS.map(period => Number(job.wgs[key]?.[period]) || 0),
        comment: String(job.comments?.[key] || '')
      };
    });
    return result;
  };

  groups.forEach(group => {
    const before = snapshot(v0, group);
    const after = snapshot(v1, group);
    const hasBefore = Object.keys(before).length > 0;
    const hasAfter = Object.keys(after).length > 0;
    comparison.set(group, !hasBefore ? 'v1-only' : !hasAfter ? 'removed'
      : JSON.stringify(before) === JSON.stringify(after) ? 'mirrored' : 'changed');
  });
  return comparison;
}

let copyWorkGroupRows = [];
let selectedCopyWorkGroups = new Set();

function getWorkGroupCopySummary(year) {
  const v0 = getForecastSnapshot(year, 'v0')?.data || new Map();
  const v1 = getForecastSnapshot(year, 'v1')?.data || new Map();
  const groups = new Set();
  [v0, v1].forEach(data => data.forEach(job => Object.keys(job?.wgs || {}).forEach(key => groups.add(normalizeWorkGroupSet(key)))));
  const summarize = (data, group) => {
    const values = [];
    let volume = 0;
    data.forEach((job, jobNumber) => {
      const key = Object.keys(job?.wgs || {}).find(name => normalizeWorkGroupSet(name) === group);
      if (!key) return;
      const periods = window.FORECAST_PERIODS.map(period => Number(job.wgs[key]?.[period]) || 0);
      volume += periods.reduce((sum, value) => sum + value, 0);
      values.push([String(jobNumber), periods, String(job.comments?.[key] || '')]);
    });
    values.sort((a, b) => a[0].localeCompare(b[0]));
    return { jobs: values.length, volume, fingerprint: JSON.stringify(values), values: new Map(values.map(value => [value[0], JSON.stringify(value.slice(1))])) };
  };
  return [...groups].sort().map(group => {
    const before = summarize(v0, group);
    const after = summarize(v1, group);
    const jobNumbers = new Set([...before.values.keys(), ...after.values.keys()]);
    const changedJobs = [...jobNumbers].filter(job => before.values.get(job) !== after.values.get(job)).length;
    const status = after.jobs === 0 ? 'empty' : before.fingerprint === after.fingerprint ? 'same' : 'amended';
    return { group, v0: before, v1: after, changedJobs, status };
  });
}

function renderCopyWorkGroupsTable() {
  const body = document.getElementById('copyWorkGroupsTableBody');
  if (!body) return;
  const query = (document.getElementById('copyWorkGroupsSearch')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('copyWorkGroupsStatusFilter')?.value || 'all';
  const shown = copyWorkGroupRows.filter(row => (statusFilter === 'all' || row.status === statusFilter) && `${row.group} ${window.workGroupSets?.get(row.group) || ''}`.toLowerCase().includes(query));
  body.innerHTML = shown.length ? shown.map(row => {
    const delta = row.v1.volume - row.v0.volume;
    const status = row.status === 'empty' ? ['Not in V1', 'empty'] : row.status === 'amended' ? ['Amended', 'amended'] : ['Matches V0', 'same'];
    const percent = row.v0.volume ? `${delta >= 0 ? '+' : ''}${((delta / row.v0.volume) * 100).toFixed(1)}%` : 'n/a';
    return `<tr><td><input type="checkbox" class="copy-wg-checkbox" value="${escapeHtml(row.group)}" aria-label="Copy ${escapeHtml(row.group)}" ${selectedCopyWorkGroups.has(row.group) ? 'checked' : ''}></td>` +
      `<td><span class="copy-wg-name">${escapeHtml(row.group)}</span><span class="copy-wg-description">${escapeHtml(window.workGroupSets?.get(row.group) || '')}</span></td>` +
      `<td>${row.v0.jobs}</td><td>${row.v1.jobs}</td><td>${row.changedJobs}</td><td>${formatForecastNumber(row.v0.volume)}</td><td>${formatForecastNumber(row.v1.volume)}</td>` +
      `<td class="${delta ? 'copy-wg-delta--changed' : ''}">${delta > 0 ? '+' : ''}${formatForecastNumber(delta)} <small>(${percent})</small></td>` +
      `<td><span class="copy-wg-status copy-wg-status--${status[1]}">${status[0]}</span></td></tr>`;
  }).join('') : '<tr><td colspan="9">No matching workgroups.</td></tr>';
  body.querySelectorAll('.copy-wg-checkbox').forEach(box => box.addEventListener('change', updateCopyWorkGroupSelection));
  updateCopyWorkGroupSelection();
}

function updateCopyWorkGroupSelection() {
  document.querySelectorAll('.copy-wg-checkbox').forEach(box => box.checked ? selectedCopyWorkGroups.add(box.value) : selectedCopyWorkGroups.delete(box.value));
  const selectedRows = copyWorkGroupRows.filter(row => selectedCopyWorkGroups.has(row.group));
  const count = selectedRows.length;
  const label = document.getElementById('copyWorkGroupsSelectionCount');
  if (label) label.textContent = `${count} selected`;
  const button = document.getElementById('copySelectedWorkGroupsButton');
  if (button) button.disabled = count === 0;
  const amended = selectedRows.filter(row => row.status === 'amended').length;
  const jobs = selectedRows.reduce((sum, row) => sum + row.v0.jobs, 0);
  const v0Volume = selectedRows.reduce((sum, row) => sum + row.v0.volume, 0);
  const v1Volume = selectedRows.reduce((sum, row) => sum + row.v1.volume, 0);
  const impact = document.getElementById('copyWorkGroupsImpact');
  if (impact) impact.innerHTML = `
    <div class="copy-wg-impact-card"><strong>${count}</strong><span>Workgroups selected</span></div>
    <div class="copy-wg-impact-card"><strong>${jobs}</strong><span>V0 jobs to copy</span></div>
    <div class="copy-wg-impact-card"><strong>${formatForecastNumber(v0Volume - v1Volume)}</strong><span>Net volume change</span></div>
    <div class="copy-wg-impact-card ${amended ? 'copy-wg-impact-card--warning' : ''}"><strong>${amended}</strong><span>Amended V1 groups overwritten</span></div>`;
}

function openCopyWorkGroupsToV1Modal() {
  const year = window.forecastEditorState.year;
  if (!getForecastSnapshot(year, 'v0')?.data?.size) return alert(`No Plan v0 forecast exists for ${year}.`);
  copyWorkGroupRows = getWorkGroupCopySummary(year).filter(row => row.v0.jobs > 0);
  selectedCopyWorkGroups = new Set();
  const search = document.getElementById('copyWorkGroupsSearch');
  if (search) search.value = '';
  const filter = document.getElementById('copyWorkGroupsStatusFilter');
  if (filter) filter.value = 'all';
  renderCopyWorkGroupsTable();
  document.getElementById('copyWorkGroupsToV1Modal')?.classList.add('open');
}

function closeCopyWorkGroupsToV1Modal() {
  document.getElementById('copyWorkGroupsToV1Modal')?.classList.remove('open');
}

function setAllCopyWorkGroups(selected) {
  document.querySelectorAll('.copy-wg-checkbox').forEach(box => {
    box.checked = selected;
    if (selected) selectedCopyWorkGroups.add(box.value); else selectedCopyWorkGroups.delete(box.value);
  });
  updateCopyWorkGroupSelection();
}

function clearCopyWorkGroupSelection() {
  selectedCopyWorkGroups.clear();
  document.querySelectorAll('.copy-wg-checkbox').forEach(box => { box.checked = false; });
  updateCopyWorkGroupSelection();
}

async function copySelectedWorkGroupsToV1() {
  const groups = new Set(selectedCopyWorkGroups);
  if (!groups.size) return;
  const year = window.forecastEditorState.year;
  const v0 = getForecastSnapshot(year, 'v0')?.data;
  const current = getForecastSnapshot(year, 'v1')?.data;
  if (!v0) return;
  const amendedCount = copyWorkGroupRows.filter(row => groups.has(row.group) && row.status === 'amended').length;
  const warning = amendedCount ? `\n\nWARNING: ${amendedCount} selected workgroup(s) contain V1 amendments that will be overwritten.` : '';
  if (!confirm(`Copy ${groups.size} selected workgroup set(s) from ${year} V0 to V1?\n\nExisting V1 data for these workgroups will be replaced.${warning}`)) return;
  const v1 = current ? cloneForecastData(current) : new Map();
  const affectedJobs = new Set();
  [v0, v1].forEach(data => data.forEach((job, jobNumber) => {
    if (Object.keys(job?.wgs || {}).some(key => groups.has(normalizeWorkGroupSet(key)))) affectedJobs.add(jobNumber);
  }));
  affectedJobs.forEach(jobNumber => {
    const target = v1.get(jobNumber);
    if (!target) return;
    Object.keys(target.wgs || {}).forEach(key => { if (groups.has(normalizeWorkGroupSet(key))) delete target.wgs[key]; });
    Object.keys(target.comments || {}).forEach(key => { if (groups.has(normalizeWorkGroupSet(key))) delete target.comments[key]; });
  });
  v0.forEach((source, jobNumber) => {
    Object.keys(source.wgs || {}).forEach(key => {
      if (!groups.has(normalizeWorkGroupSet(key))) return;
      if (!v1.has(jobNumber)) v1.set(jobNumber, cloneForecastData(new Map([[jobNumber, source]])).get(jobNumber));
      const target = v1.get(jobNumber);
      target.wgs ||= {};
      target.comments ||= {};
      target.wgs[key] = { ...source.wgs[key] };
      if (source.comments?.[key]) target.comments[key] = source.comments[key];
    });
  });
  affectedJobs.forEach(jobNumber => {
    const job = v1.get(jobNumber);
    if (!job) return;
    job.periods = {};
    Object.values(job.wgs || {}).forEach(wg => window.FORECAST_PERIODS.forEach(period => { job.periods[period] = (job.periods[period] || 0) + (Number(wg?.[period]) || 0); }));
  });
  const saved = await saveForecastToStorageAsync(v1, v1.size, year, 'v1');
  if (!saved) {
    window.Toast?.error('Could not copy workgroups to V1 because the forecast save failed.');
    const statusEl = document.getElementById('forecastEditorStatus');
    if (statusEl) statusEl.textContent = '⚠️ Copy to V1 failed. No changes were applied.';
    return;
  }
  window.forecastEditorState.planVersion = 'v1';
  window.currentPlanVersion = 'v1';
  window.fData = v1;
  closeCopyWorkGroupsToV1Modal();
  renderForecastEditorSelectors(); loadForecastEditorRows(); renderForecastEditorTable(); updateForecastEditorSummary();
  const statusEl = document.getElementById('forecastEditorStatus');
  if (statusEl) statusEl.textContent = `✓ Copied ${groups.size} workgroup set(s) from ${year} V0 to V1.`;
  window.Toast?.success(`Copied ${groups.size} workgroup set(s) to V1`);
}

/**
 * Select a work group and load its data
 */
async function selectWorkGroup(wgCode) {
  if (!wgCode) return;

  // Sync current state first
  syncForecastEditorTableState();

  // Update state
  window.forecastEditorState.workGroup = wgCode;

  // Update UI
  renderWorkGroupSelector(getCurrentWorkGroupFilter(), getWorkGroupSearchText());
  updateCurrentWorkGroupDisplay();

  // Load rows for new work group
  loadForecastEditorRows();
  renderForecastEditorTable();
  updateForecastEditorSummary();
}

/**
 * Update the current work group display
 */
function updateCurrentWorkGroupDisplay() {
  const container = document.getElementById('currentWorkGroupDisplay');
  if (!container) return;

  const wgCode = window.forecastEditorState.workGroup;
  if (!wgCode) {
    container.innerHTML = '<span class="current-wg-none">No work group selected</span>';
    return;
  }

  const description = window.workGroupSets?.get(wgCode) || wgCode;
  const { discipline } = extractDiscipline(description);

  container.innerHTML = `
    <span class="current-wg-code">${escapeHtml(wgCode)}</span>
    <span class="current-wg-desc">${escapeHtml(description)}</span>
    <span class="current-wg-discipline">${escapeHtml(discipline)}</span>
  `;
}

/**
 * Get current work group filter selection
 */
function getCurrentWorkGroupFilter() {
  const activeTab = document.querySelector('.wg-filter-tab.active');
  return activeTab?.dataset.filter || 'all';
}

/**
 * Get current work group search text
 */
function getWorkGroupSearchText() {
  const searchInput = document.getElementById('workGroupSearch');
  return searchInput?.value || '';
}

/**
 * Load forecast editor rows from the selected plan's forecast data.
 */
function loadForecastEditorRows() {
  const workGroup = window.forecastEditorState.workGroup;
  const rows = [];
  const dataToUse = window.fData;

  if (dataToUse && workGroup) {
    // Normalize work group code for consistent lookups
    const normalizedWg = workGroup.trim().toUpperCase();

    dataToUse.forEach((job, jobNumber) => {
      // Try both exact and normalized lookups for backwards compatibility
      const wgData = job?.wgs?.[normalizedWg] || job?.wgs?.[workGroup];
      if (!wgData) return;

      const meta = getJobMetadata(jobNumber);
      const volumes = {};
      window.FORECAST_PERIODS.forEach(period => {
        volumes[period] = Number(wgData[period] || 0);
      });

      // Try both exact and normalized lookups for comments too
      const comment = job?.comments?.[normalizedWg] || job?.comments?.[workGroup] || '';

      rows.push({
        jobNumber,
        desc: meta?.desc || '',
        unit: meta?.unit || '',
        volumes,
        comment
      });
    });
  }

  // Sort by job number
  rows.sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));

  // Set rows or create empty rows
  window.forecastEditorState.rows = rows.length ? rows : Array.from({ length: 5 }, () => createForecastEditorRow());
}

/**
 * Render job number options (datalist)
 */
function renderForecastEditorJobOptions() {
  const datalist = document.getElementById('forecastEditorJobOptions');
  if (!datalist) return;

  const jobs = getStandardJobList();
  datalist.innerHTML = jobs
    .map(job => (
      `<option value="${escapeHtml(job.jobNumber)}">${escapeHtml(job.jobNumber)} • ${escapeHtml(job.desc)}${job.unit ? ` (${escapeHtml(job.unit)})` : ''}</option>`
    ))
    .join('');
}

/**
 * Render forecast editor table
 */
function renderForecastEditorTable() {
  const table = document.getElementById('forecastEditorTable');
  if (!table) return;

  const baselineMap = getForecastEditorBaselineMap();
  const workGroup = window.forecastEditorState.workGroup;

  // Get all rows from state (including empty rows for user input)
  const forecastRows = window.forecastEditorState.rows;

  // Header
  const header = `
    <thead>
      <tr>
        <th>Standard Job</th>
        <th>Description</th>
        <th>Unit</th>
        ${window.FORECAST_PERIODS.map(period => `<th>${period}</th>`).join('')}
        <th>Total</th>
        <th>Comment</th>
        <th>Actions</th>
      </tr>
    </thead>
  `;

  // Body with only forecasted jobs
  let body = '';
  if (forecastRows.length === 0) {
    body = `
      <tbody>
        <tr class="forecast-empty-row">
          <td colspan="${3 + window.FORECAST_PERIODS.length + 3}" style="text-align: center; padding: 40px; color: #64748b;">
            <div style="margin-bottom: 12px;">No forecast entries yet for this work group.</div>
            <div style="font-size: 12px;">Click "+ Add Row" to add a new forecast entry, or paste data from Excel.</div>
          </td>
        </tr>
      </tbody>
    `;
  } else {
    body = `
      <tbody>
        ${forecastRows.map((row, index) => {
          const jobNumber = row.jobNumber;
          const jobMeta = getJobMetadataByNumber(jobNumber);
          const rowTotal = getForecastEditorRowTotal(row);
          const comment = row.comment || '';
          const hasData = hasRowData(row);

          return `
            <tr class="discipline-job-row ${hasData ? 'has-forecast-data' : ''}"
                data-job="${escapeHtml(jobNumber)}"
                data-row-index="${index}">
              <td class="forecast-job-cell">
                <span class="forecast-job-indicator ${hasData ? 'has-data' : ''}"></span>
                <input
                  type="text"
                  class="forecast-job-input"
                  data-row-index="${index}"
                  value="${escapeHtml(jobNumber)}"
                  placeholder="Job number..."
                  list="forecastEditorJobOptions"
                >
              </td>
              <td class="forecast-desc-cell">${escapeHtml(jobMeta?.desc || row.description || '')}</td>
              <td class="forecast-unit-cell">${escapeHtml(jobMeta?.unit || row.unit || '')}</td>
              ${window.FORECAST_PERIODS.map(period => {
                const value = Number(row.volumes?.[period] || 0);
                const baselineValue = getBaselineValue(baselineMap, jobNumber, workGroup, period);
                const isChanged = baselineMap && jobNumber && value !== Number(baselineValue || 0);
                return `
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      class="forecast-period-input${isChanged ? ' is-changed' : ''}${value !== 0 ? ' has-value' : ''}"
                      data-job="${escapeHtml(jobNumber)}"
                      data-period="${period}"
                      data-row-index="${index}"
                      value="${value !== 0 ? value : ''}"
                      placeholder="0"
                    >
                  </td>
                `;
              }).join('')}
              <td class="forecast-total-cell" data-role="row-total" data-job="${escapeHtml(jobNumber)}">${formatForecastNumber(rowTotal)}</td>
              <td class="forecast-comment-cell">
                <textarea
                  class="forecast-comment-input${comment ? ' has-value' : ''}"
                  data-job="${escapeHtml(jobNumber)}"
                  data-row-index="${index}"
                  placeholder="Comment..."
                  rows="1"
                >${escapeHtml(comment)}</textarea>
              </td>
              <td class="forecast-action-cell">
                <button type="button" class="forecast-delete-row" data-action="delete-row" data-row="${index}" title="Remove row">×</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;
  }

  // Footer (totals)
  const totals = getForecastEditorTotals();
  const footer = `
    <tfoot>
      <tr>
        <td class="forecast-total-label" colspan="3">Total</td>
        ${window.FORECAST_PERIODS.map(period => (
          `<td class="forecast-total-cell" data-role="period-total" data-period="${period}">${formatForecastNumber(totals.periodTotals[period])}</td>`
        )).join('')}
        <td class="forecast-total-cell" data-role="grand-total">${formatForecastNumber(totals.grandTotal)}</td>
        <td></td>
        <td></td>
      </tr>
    </tfoot>
  `;

  table.innerHTML = `${header}${body}${footer}`;

  // Attach event handlers
  attachForecastTableHandlers();

  // Filter table if needed
  filterForecastEditorTable();
}

/**
 * Check if a row has any data (non-zero values or comment)
 */
function hasRowData(row) {
  if (!row) return false;

  // Check for any non-zero period values
  for (const period of window.FORECAST_PERIODS) {
    if (Number(row.volumes?.[period] || 0) !== 0) {
      return true;
    }
  }

  // Check for comment
  if (row.comment && row.comment.trim().length > 0) {
    return true;
  }

  return false;
}

/**
 * Get job metadata by job number
 */
function getJobMetadataByNumber(jobNumber) {
  if (!jobNumber) return null;

  // Try standard jobs map first
  if (window.stdJobs && window.stdJobs.has(jobNumber)) {
    return window.stdJobs.get(jobNumber);
  }

  // Try STANDARD_JOBS array
  if (window.STANDARD_JOBS) {
    const job = window.STANDARD_JOBS.find(j => j.standardJobNo === jobNumber);
    if (job) {
      return {
        desc: job.standardJobDescription || '',
        unit: job.unitOfMeasure || '',
        disc: job.discipline || ''
      };
    }
  }

  return null;
}

/**
 * Attach event handlers to forecast table
 */
function attachForecastTableHandlers() {
  const table = document.getElementById('forecastEditorTable');
  if (!table) return;

  // Job number input change handlers
  table.querySelectorAll('.forecast-job-input').forEach(input => {
    input.addEventListener('change', handleJobNumberChange);
    input.addEventListener('blur', handleJobNumberChange);
  });

  // Note: Delete button handlers are handled via event delegation in the main event listener
  // (handleForecastEditorDeleteRow listens for [data-action="delete-row"] clicks)
}

/**
 * Handle job number input change
 */
function handleJobNumberChange(event) {
  const input = event.target;
  const rowIndex = parseInt(input.dataset.rowIndex, 10);
  const newJobNumber = input.value.trim();

  if (isNaN(rowIndex) || rowIndex < 0 || rowIndex >= window.forecastEditorState.rows.length) {
    return;
  }

  const row = window.forecastEditorState.rows[rowIndex];
  if (!row) return;

  // Update job number in state
  row.jobNumber = newJobNumber;

  // Auto-fill description and unit from job metadata
  const jobMeta = getJobMetadataByNumber(newJobNumber);
  if (jobMeta) {
    row.desc = jobMeta.desc || '';
    row.unit = jobMeta.unit || '';
  }

  // Update the row display (description and unit cells)
  const tableRow = document.querySelector(`tr[data-row-index="${rowIndex}"]`);
  if (tableRow) {
    const descCell = tableRow.querySelector('.forecast-desc-cell');
    const unitCell = tableRow.querySelector('.forecast-unit-cell');
    if (descCell) descCell.textContent = row.desc;
    if (unitCell) unitCell.textContent = row.unit;

    // Update data-job attribute on all inputs in the row
    tableRow.dataset.job = newJobNumber;
    tableRow.querySelectorAll('input[data-job], textarea[data-job]').forEach(el => {
      el.dataset.job = newJobNumber;
    });

    // Update has-forecast-data class
    if (hasRowData(row)) {
      tableRow.classList.add('has-forecast-data');
      tableRow.querySelector('.forecast-job-indicator')?.classList.add('has-data');
    }
  }

  updateForecastEditorSummary();
}

/**
 * Get baseline map for v0 vs v1 comparison
 */
function getForecastEditorBaselineMap() {
  if (window.forecastEditorState.planVersion !== 'v1') return null;

  const v0Snapshot = getForecastSnapshot(window.forecastEditorState.year, 'v0');
  if (!v0Snapshot) return null;

  return v0Snapshot.data;
}

/**
 * Get baseline value for a specific job/work group/period
 */
function getBaselineValue(baselineMap, jobNumber, workGroup, period) {
  if (!baselineMap || !jobNumber || !workGroup || !period) return 0;

  const job = baselineMap.get(jobNumber);
  if (!job) return 0;

  return Number(job.wgs?.[workGroup]?.[period] || 0);
}

/**
 * Get row total
 */
function getForecastEditorRowTotal(row) {
  let total = 0;
  window.FORECAST_PERIODS.forEach(period => {
    total += Number(row.volumes?.[period] || 0);
  });
  return total;
}

/**
 * Get totals for all rows
 */
function getForecastEditorTotals() {
  const periodTotals = {};
  let grandTotal = 0;

  window.FORECAST_PERIODS.forEach(period => {
    periodTotals[period] = 0;
  });

  // Using editor rows keeps totals in sync with unsaved edits.
  window.forecastEditorState.rows.forEach(row => {
    window.FORECAST_PERIODS.forEach(period => {
      const value = Number(row.volumes?.[period] || 0);
      periodTotals[period] += value;
      grandTotal += value;
    });
  });

  return { periodTotals, grandTotal };
}

/**
 * Update forecast editor summary stats
 */
function updateForecastEditorSummary() {
  const jobCount = window.forecastEditorState.rows.filter(row => row.jobNumber).length;
  const totals = getForecastEditorTotals();

  const jobCountEl = document.getElementById('forecastEditorJobCount');
  if (jobCountEl) jobCountEl.textContent = jobCount;

  const totalVolumeEl = document.getElementById('forecastEditorTotalVolume');
  if (totalVolumeEl) totalVolumeEl.textContent = formatForecastNumber(totals.grandTotal);

  const rowCountEl = document.getElementById('forecastEditorRowCount');
  if (rowCountEl) rowCountEl.textContent = window.forecastEditorState.rows.length;

  const loadedBadgeEl = document.getElementById('forecastEditorLoadedBadge');
  if (loadedBadgeEl) loadedBadgeEl.textContent = `${jobCount} jobs loaded`;

  const summaryEl = document.getElementById('forecastEditorSummary');
  if (summaryEl) {
    summaryEl.textContent = `Editing ${window.forecastEditorState.year} ${window.forecastEditorState.planVersion.toUpperCase()} for work group: ${window.forecastEditorState.workGroup}`;
  }
}

/**
 * Filter forecast editor table based on search
 */
function filterForecastEditorTable() {
  const query = (document.getElementById('forecastEditorSearch')?.value || '').trim().toLowerCase();
  document.querySelectorAll('#forecastEditorTable tbody tr').forEach(row => {
    const haystack = row.dataset.search || '';
    row.style.display = !query || haystack.includes(query) ? '' : 'none';
  });
}

/**
 * Add a new row to the forecast editor
 */
function addForecastEditorRow() {
  // Sync current state first to preserve any unsaved changes
  syncForecastEditorTableState();

  window.forecastEditorState.rows.push(createForecastEditorRow());
  renderForecastEditorTable();
  updateForecastEditorSummary();
}

/**
 * Initialize v1 from v0 (explicit copy for current work group only)
 */
async function initializeV1FromV0Explicit() {
  // CRITICAL: Warn user about unsaved changes
  const hasUnsavedChanges = window.forecastEditorState.rows.some(row => {
    return row.jobNumber || row.comment || Object.values(row.volumes).some(v => v !== 0);
  });

  if (hasUnsavedChanges) {
    const saveFirst = confirm(
      'WARNING: You have unsaved changes in the current table.\n\n' +
      'Initializing v1 from v0 will REPLACE current work group data.\n\n' +
      'Click OK to save your changes first, or Cancel to discard them and continue.'
    );

    if (saveFirst) {
      // Save current changes before initializing
      handleForecastEditorSubmit();
    }
  }

  const year = window.forecastEditorState.year;
  const planVersion = window.forecastEditorState.planVersion;
  const workGroup = window.forecastEditorState.workGroup;

  if (planVersion !== 'v1') {
    alert('This action is only available when editing Plan v1.');
    return;
  }

  if (!workGroup) {
    alert('Please select a work group first.');
    return;
  }

  const v0Snapshot = getForecastSnapshot(year, 'v0');
  if (!v0Snapshot || !v0Snapshot.data) {
    alert('Plan v0 must exist before initializing v1. Please create a v0 forecast first.');
    return;
  }

  // Count how many jobs have data for this work group in v0
  let jobsWithWgData = 0;
  v0Snapshot.data.forEach((job) => {
    if (job?.wgs?.[workGroup]) {
      jobsWithWgData++;
    }
  });

  if (jobsWithWgData === 0) {
    alert(`No data found in Plan v0 for work group "${workGroup}".\n\nPlease add forecast data to v0 first.`);
    return;
  }

  const confirmed = confirm(
    `Initialize v1 from v0 for work group "${workGroup}"?\n\n` +
    `This will:\n` +
    `• Copy ${jobsWithWgData} job(s) from Plan v0 to Plan v1\n` +
    `• Only affect the "${workGroup}" work group\n` +
    `• Replace any existing v1 data for this work group\n` +
    `• Other work groups in v1 remain unchanged\n\n` +
    `Continue?`
  );

  if (!confirmed) return;

  // Get or create v1 data
  const v1Snapshot = getForecastSnapshot(year, 'v1');
  const v1Data = v1Snapshot ? cloneForecastData(v1Snapshot.data) : new Map();
  let copiedCount = 0;

  // Copy work group data from v0 to v1
  v0Snapshot.data.forEach((v0Job, jobNumber) => {
    const wgData = v0Job?.wgs?.[workGroup];
    if (!wgData) return;

    // Get or create job in v1
    if (!v1Data.has(jobNumber)) {
      v1Data.set(jobNumber, { periods: {}, wgs: {}, comments: {} });
    }
    const v1Job = v1Data.get(jobNumber);

    // Copy work group data
    if (!v1Job.wgs) v1Job.wgs = {};
    v1Job.wgs[workGroup] = { ...wgData };

    // Copy comment if exists
    if (v0Job.comments && v0Job.comments[workGroup]) {
      if (!v1Job.comments) v1Job.comments = {};
      v1Job.comments[workGroup] = v0Job.comments[workGroup];
    }

    // Recalculate period totals from all work groups
    const totals = {};
    Object.values(v1Job.wgs || {}).forEach(wg => {
      window.FORECAST_PERIODS.forEach(period => {
        totals[period] = (totals[period] || 0) + (Number(wg?.[period]) || 0);
      });
    });
    v1Job.periods = totals;

    copiedCount++;
  });

  // Save to v1 storage (and API)
  await saveForecastToStorageAsync(v1Data, v1Data.size, year, 'v1');

  // Reload the forecast editor and refresh selectors to update checkmarks
  window.fData = v1Data;
  renderForecastEditorSelectors();
  loadForecastEditorRows();
  renderForecastEditorTable();
  updateForecastEditorSummary();

  // Show success message
  const statusEl = document.getElementById('forecastEditorStatus');
  if (statusEl) {
    statusEl.textContent = `✓ Initialized v1 "${workGroup}" with ${copiedCount} jobs from v0 at ${new Date().toLocaleTimeString()}`;
  }

  alert(`✓ Work group "${workGroup}" initialized in Plan v1.\n\nCopied ${copiedCount} job(s) from Plan v0.\n\nYou can now edit this work group in v1 independently.`);
}

/**
 * Clear forecast editor table
 */
async function clearForecastEditorTable() {
  if (!confirm('This will clear all forecast data for this work group and save it as blank. Continue?')) {
    return;
  }

  // Save undo state before clearing
  if (window.saveUndoState) {
    window.saveUndoState(`Clear ${window.forecastEditorState.workGroup} forecast`);
  }

  // Clear rows
  window.forecastEditorState.rows = Array.from({ length: 5 }, () => createForecastEditorRow());

  // Remove this work group's data from the forecast
  if (window.fData && window.forecastEditorState.workGroup) {
    window.fData.forEach((job) => {
      if (job.wgs && job.wgs[window.forecastEditorState.workGroup]) {
        delete job.wgs[window.forecastEditorState.workGroup];
      }
      // Recalculate period totals
      const totals = {};
      Object.values(job.wgs || {}).forEach(wgData => {
        window.FORECAST_PERIODS.forEach(period => {
          totals[period] = (totals[period] || 0) + (Number(wgData?.[period]) || 0);
        });
      });
      job.periods = totals;
    });

    // Clean up empty jobs
    window.fData = cleanForecastData(window.fData);

    // Save the cleared forecast (and API)
    await saveForecastToStorageAsync(window.fData, window.fData.size, window.forecastEditorState.year, window.forecastEditorState.planVersion);
  }

  // Refresh work group selector to update checkmarks (don't reload rows - we want them empty)
  renderWorkGroupSelector(getCurrentWorkGroupFilter(), getWorkGroupSearchText());

  // Render the table with empty rows (already set above)
  renderForecastEditorTable();
  updateForecastEditorSummary();

  const statusEl = document.getElementById('forecastEditorStatus');
  if (statusEl) statusEl.textContent = `✓ Cleared and saved blank forecast for ${window.forecastEditorState.workGroup}`;
}

/**
 * Handle context change (year, plan, work group)
 * @param {boolean} forceReload - Force reload data even if context hasn't changed (e.g., after import)
 */
async function handleForecastEditorContextChange(forceReload = false) {
  // CRITICAL: Sync current state before switching contexts to prevent data loss
  syncForecastEditorTableState();

  const yearSelect = document.getElementById('forecastEditorYear');
  const planSelect = document.getElementById('forecastEditorPlan');

  const newYear = yearSelect?.value || window.forecastEditorState.year;
  const newPlan = planSelect?.value || window.forecastEditorState.planVersion;

  // Check if context changed
  const contextChanged = newYear !== window.forecastEditorState.year || newPlan !== window.forecastEditorState.planVersion;

  window.forecastEditorState.year = newYear;
  window.forecastEditorState.planVersion = newPlan;

  // Reload forecast data if year/plan changed OR force reload requested (e.g., after import)
  if (contextChanged || forceReload) {
    const snapshot = await getForecastSnapshotAsync(window.forecastEditorState.year, window.forecastEditorState.planVersion);
    if (snapshot) {
      window.fData = snapshot.data;
    } else {
      window.fData = null;
    }

    // Re-render work group selector with updated statuses
    renderWorkGroupSelector(getCurrentWorkGroupFilter(), getWorkGroupSearchText());
  }

  // Reload rows and re-render
  loadForecastEditorRows();
  renderForecastEditorTable();
  updateForecastEditorSummary();
}

/**
 * Handle forecast editor form submit
 */
async function handleForecastEditorSubmit(event) {
  if (event) event.preventDefault();

  try {
    // Sync DOM state to fData
    syncForecastEditorTableState();

    // Clean up empty jobs
    window.fData = cleanForecastData(window.fData);

    const year = window.forecastEditorState.year;
    const planVersion = window.forecastEditorState.planVersion;
    const workGroup = window.forecastEditorState.workGroup;

    if (!year || !planVersion || !workGroup) {
      alert('Missing year, plan version, or work group. Cannot save.');
      return;
    }

    // Count jobs with data for this work group
    let jobCount = 0;
    const jobNumbers = [];
    window.fData.forEach((job, jobNumber) => {
      const wgData = job.wgs?.[workGroup];
      const hasVolume = wgData && window.FORECAST_PERIODS.some(p => Number(wgData[p] || 0) !== 0);
      const hasComment = job.comments?.[workGroup]?.trim().length > 0;
      if (hasVolume || hasComment) {
        jobCount++;
        jobNumbers.push(jobNumber);
      }
    });

    // Show saving indicator
    const statusEl = document.getElementById('forecastEditorStatus');
    if (statusEl) {
      statusEl.textContent = '⏳ Saving forecast...';
    }

    // Save to localStorage and API
    const saved = await saveForecastToStorageAsync(window.fData, window.fData.size, year, planVersion);

    // Update API sync indicator
    if (window.updateApiSyncIndicator) {
      await window.updateApiSyncIndicator();
    }

    if (saved) {
      // Refresh only the work group selector (not full selectors) for better performance
      renderWorkGroupSelector(getCurrentWorkGroupFilter(), getWorkGroupSearchText());
      updateCurrentWorkGroupDisplay();

      if (statusEl) {
        const message = jobCount
          ? `✓ Saved ${jobCount} jobs for ${workGroup} at ${new Date().toLocaleTimeString()}`
          : `✓ Saved blank forecast for ${workGroup} at ${new Date().toLocaleTimeString()}`;
        statusEl.textContent = message;
      }

      // Show success toast
      if (window.Toast) {
        window.Toast.success(`Saved ${jobCount} job${jobCount !== 1 ? 's' : ''} for ${workGroup}`);
      }

      console.log(`✓ Forecast saved: ${year} ${planVersion} (${jobCount} jobs)`);
    } else {
      if (statusEl) {
        statusEl.textContent = '⚠️ Failed to save forecast';
      }
      alert('Failed to save forecast. Check console for details.');
    }
  } catch (error) {
    console.error('Error saving forecast:', error);
    const statusEl = document.getElementById('forecastEditorStatus');
    if (statusEl) {
      statusEl.textContent = `⚠️ Error: ${error.message}`;
    }
    alert(`Error saving forecast: ${error.message}`);
  }
}

/**
 * Sync DOM table state to fData
 * Syncs ALL rows that have any input values (not just rows marked with has-forecast-data class)
 */
function syncForecastEditorTableState() {
  const workGroup = window.forecastEditorState.workGroup;
  if (!workGroup) return;

  // Ensure fData exists
  if (!window.fData) {
    window.fData = new Map();
  }

  // Sync ALL job rows - check each row for actual input values
  const allJobRows = document.querySelectorAll('#forecastEditorTable tbody tr.discipline-job-row');

  allJobRows.forEach((rowEl) => {
    const jobNumber = rowEl.dataset.job;
    if (!jobNumber) return;

    // Collect volumes from input fields
    const volumes = {};
    let hasAnyValue = false;
    rowEl.querySelectorAll('input[data-period]').forEach(input => {
      const period = input.dataset.period;
      const value = parseFloat(input.value);
      const numericValue = Number.isFinite(value) ? value : 0;
      volumes[period] = numericValue;
      if (numericValue !== 0) {
        hasAnyValue = true;
      }
    });

    // Get comment
    const commentInput = rowEl.querySelector('.forecast-comment-input');
    const comment = String(commentInput?.value || '').trim();
    if (comment.length > 0) {
      hasAnyValue = true;
    }

    // Only process rows that have actual data
    if (!hasAnyValue) {
      // If this job existed in fData for this workgroup but now has no data, remove it
      if (window.fData.has(jobNumber)) {
        const job = window.fData.get(jobNumber);
        if (job.wgs && job.wgs[workGroup]) {
          delete job.wgs[workGroup];
        }
        if (job.comments && job.comments[workGroup]) {
          delete job.comments[workGroup];
        }
      }
      // Update visual state
      rowEl.classList.remove('has-forecast-data');
      return;
    }

    // Ensure job exists in fData
    if (!window.fData.has(jobNumber)) {
      window.fData.set(jobNumber, {
        periods: {},
        wgs: {},
        comments: {}
      });
    }

    const job = window.fData.get(jobNumber);

    // Ensure workgroup exists
    if (!job.wgs[workGroup]) {
      job.wgs[workGroup] = {};
    }

    // Update volumes
    Object.assign(job.wgs[workGroup], volumes);

    // Update comment
    if (!job.comments) job.comments = {};
    job.comments[workGroup] = comment;

    // Recalculate period totals for this job
    const totals = {};
    Object.values(job.wgs || {}).forEach(wgData => {
      window.FORECAST_PERIODS.forEach(period => {
        totals[period] = (totals[period] || 0) + (Number(wgData?.[period]) || 0);
      });
    });
    job.periods = totals;

    // Update visual state
    rowEl.classList.add('has-forecast-data');
  });
}

/**
 * Handle table input changes
 */
// Debounced undo state saver (saves after user stops typing for 1 second)
const debouncedSaveUndoState = window.debounce ? window.debounce(() => {
  if (window.saveUndoState) {
    window.saveUndoState();
  }
}, 1000) : null;

function handleForecastEditorTableInput(event) {
  const rowEl = event.target.closest('tr');
  if (!rowEl) return;

  const jobNumber = rowEl.dataset.job;
  const rowIndex = parseInt(rowEl.dataset.rowIndex, 10);
  const workGroup = window.forecastEditorState.workGroup;

  // Handle period input
  if (event.target.matches('input[data-period]')) {
    const period = event.target.dataset.period;
    const value = parseFloat(event.target.value);
    const numericValue = Number.isFinite(value) ? value : 0;

    // Update state rows first (used for rendering)
    if (!isNaN(rowIndex) && rowIndex >= 0 && rowIndex < window.forecastEditorState.rows.length) {
      const stateRow = window.forecastEditorState.rows[rowIndex];
      if (stateRow && stateRow.volumes) {
        stateRow.volumes[period] = numericValue;
      }
    }

    // Also update fData if we have a valid job number
    if (jobNumber) {
      if (!window.fData) {
        window.fData = new Map();
      }
      if (!window.fData.has(jobNumber)) {
        window.fData.set(jobNumber, {
          periods: {},
          wgs: {},
          comments: {}
        });
      }

      const job = window.fData.get(jobNumber);

      // Ensure workgroup exists
      if (!job.wgs[workGroup]) {
        job.wgs[workGroup] = {};
      }

      // Update value
      job.wgs[workGroup][period] = numericValue;
    }

    // Update visual indicators
    event.target.classList.toggle('has-value', numericValue !== 0);

    // Check if row has any data
    const hasData = jobNumber ? hasAnyForecastData(jobNumber, workGroup) : false;
    rowEl.classList.toggle('has-forecast-data', hasData);

    // Update indicator
    const indicator = rowEl.querySelector('.forecast-job-indicator');
    if (indicator) {
      indicator.classList.toggle('has-data', hasData);
    }

    // Update cell highlighting for baseline comparison
    if (jobNumber) {
      updateCellHighlight(jobNumber, period, event.target);
      // Update row total
      updateRowTotal(jobNumber);
    }

    // Update summary
    updateForecastEditorSummary();
    updateForecastEditorTotalsDisplay();

    // Save undo state after user stops typing (debounced)
    if (debouncedSaveUndoState) {
      debouncedSaveUndoState();
    }
  }

  // Handle comment input
  if (event.target.matches('textarea.forecast-comment-input')) {
    const comment = event.target.value.trim();

    // Update state rows first
    if (!isNaN(rowIndex) && rowIndex >= 0 && rowIndex < window.forecastEditorState.rows.length) {
      const stateRow = window.forecastEditorState.rows[rowIndex];
      if (stateRow) {
        stateRow.comment = comment;
      }
    }

    // Also update fData if we have a valid job number
    if (jobNumber) {
      if (!window.fData) {
        window.fData = new Map();
      }
      if (!window.fData.has(jobNumber)) {
        window.fData.set(jobNumber, {
          periods: {},
          wgs: {},
          comments: {}
        });
      }

      const job = window.fData.get(jobNumber);

      // Update comment
      if (!job.comments) job.comments = {};
      job.comments[workGroup] = comment;
    }

    // Update visual indicator
    event.target.classList.toggle('has-value', comment.length > 0);

    const hasData = jobNumber ? hasAnyForecastData(jobNumber, workGroup) : (comment.length > 0);
    rowEl.classList.toggle('has-forecast-data', hasData);

    // Save undo state after user stops typing (debounced)
    if (debouncedSaveUndoState) {
      debouncedSaveUndoState();
    }
  }
}

/**
 * Check if a job has any forecast data for the given work group
 */
function hasAnyForecastData(jobNumber, workGroup) {
  if (!window.fData.has(jobNumber)) return false;

  const job = window.fData.get(jobNumber);
  const wgData = job.wgs?.[workGroup];

  if (!wgData) return false;

  // Check if any period has non-zero value
  const hasVolumes = window.FORECAST_PERIODS.some(period => {
    return Number(wgData[period] || 0) !== 0;
  });

  // Check if has comment
  const hasComment = job.comments?.[workGroup]?.trim().length > 0;

  return hasVolumes || hasComment;
}

/**
 * Update row total display
 */
function updateRowTotal(jobNumber) {
  const totalCell = document.querySelector(`[data-role="row-total"][data-job="${jobNumber}"]`);
  if (!totalCell) return;

  const job = window.fData.get(jobNumber);
  const workGroup = window.forecastEditorState.workGroup;
  const wgData = job?.wgs?.[workGroup];

  let total = 0;
  if (wgData) {
    window.FORECAST_PERIODS.forEach(period => {
      total += Number(wgData[period] || 0);
    });
  }

  totalCell.textContent = formatForecastNumber(total);
}

/**
 * Update cell highlighting for v0 vs v1 changes
 */
function updateCellHighlight(jobNumber, period, inputElement) {
  if (window.forecastEditorState.planVersion !== 'v1') {
    inputElement.classList.remove('is-changed');
    return;
  }

  const baselineMap = getForecastEditorBaselineMap();
  if (!baselineMap || !jobNumber) {
    inputElement.classList.remove('is-changed');
    return;
  }

  const job = window.fData.get(jobNumber);
  const workGroup = window.forecastEditorState.workGroup;
  const currentValue = Number(job?.wgs?.[workGroup]?.[period] || 0);
  const baselineValue = getBaselineValue(baselineMap, jobNumber, workGroup, period);
  const isChanged = currentValue !== Number(baselineValue || 0);

  inputElement.classList.toggle('is-changed', isChanged);
}

/**
 * Update totals display in the table footer
 */
function updateForecastEditorTotalsDisplay() {
  const totals = getForecastEditorTotals();

  // Update period totals
  window.FORECAST_PERIODS.forEach(period => {
    const cell = document.querySelector(`[data-role="period-total"][data-period="${period}"]`);
    if (cell) cell.textContent = formatForecastNumber(totals.periodTotals[period]);
  });

  // Update grand total
  const grandTotalCell = document.querySelector('[data-role="grand-total"]');
  if (grandTotalCell) grandTotalCell.textContent = formatForecastNumber(totals.grandTotal);

  // Update row totals
  window.forecastEditorState.rows.forEach((row, index) => {
    const rowTotal = getForecastEditorRowTotal(row);
    const cell = document.querySelector(`[data-role="row-total"][data-row="${index}"]`);
    if (cell) cell.textContent = formatForecastNumber(rowTotal);
  });
}

/**
 * Handle table paste (Excel-style)
 */
function handleForecastEditorTablePaste(event) {
  const target = event.target;

  // Allow paste on job number inputs, period inputs, and comment inputs
  if (!target || (!target.matches('input[data-period]') && !target.matches('.forecast-job-input') && !target.matches('.forecast-comment-input'))) {
    return;
  }

  const clipboard = event.clipboardData?.getData('text');
  if (!clipboard) return;

  const rows = clipboard.replace(/\r/g, '').split('\n').filter(line => line.length);
  if (!rows.length) return;

  const parsed = rows.map(row => row.split('\t'));

  // Save undo state before pasting data
  if (window.saveUndoState && parsed.length > 1) {
    window.saveUndoState('Paste data');
  }

  // Special handling for comment column - allow single value paste to preserve default textarea behavior
  if (target.matches('.forecast-comment-input') && parsed.length === 1 && parsed[0].length === 1) {
    // Single value paste in comment - allow default behavior
    return;
  }

  if (parsed.length === 1 && parsed[0].length === 1) {
    // Single value paste - allow default behavior
    return;
  }

  event.preventDefault();

  const startRowIndex = Number(target.dataset.rowIndex);
  if (!Number.isFinite(startRowIndex)) return;

  // Determine starting column
  let startColIndex = 0;
  let isCommentPaste = false;
  if (target.matches('input[data-period]')) {
    // Pasting into a period column
    startColIndex = window.FORECAST_PERIODS.indexOf(target.dataset.period);
    if (startColIndex < 0) return;
    startColIndex += 1; // +1 because job number is column 0
  } else if (target.matches('.forecast-job-input')) {
    // Pasting into job number column
    startColIndex = 0;
  } else if (target.matches('.forecast-comment-input')) {
    // Pasting into comment column - handle specially
    isCommentPaste = true;
  }

  // Ensure enough rows exist
  const requiredRows = startRowIndex + parsed.length;
  while (window.forecastEditorState.rows.length < requiredRows) {
    window.forecastEditorState.rows.push(createForecastEditorRow());
  }

  // Handle comment paste specially - each line is a comment
  if (isCommentPaste) {
    rows.forEach((commentLine, rowOffset) => {
      const rowIndex = startRowIndex + rowOffset;
      const row = window.forecastEditorState.rows[rowIndex];
      if (row) {
        row.comment = commentLine.trim();
      }
    });
  } else {
    // Paste data for job numbers and periods
    parsed.forEach((rowData, rowOffset) => {
      const rowIndex = startRowIndex + rowOffset;
      const row = window.forecastEditorState.rows[rowIndex];

      rowData.forEach((cellValue, colOffset) => {
        const colIndex = startColIndex + colOffset;

        if (colIndex === 0) {
          // Column 0: Job number
          const jobNumber = String(cellValue || '').trim().replace(/\D/g, '').padStart(6, '0');
          if (jobNumber && jobNumber !== '000000') {
            row.jobNumber = jobNumber;
            const meta = getJobMetadata(jobNumber);
            row.desc = meta?.desc || '';
            row.unit = meta?.unit || '';
          }
        } else {
          // Columns 1+: Period values (P1, P2, P3, etc.)
          const periodIndex = colIndex - 1;
          if (periodIndex < window.FORECAST_PERIODS.length) {
            const period = window.FORECAST_PERIODS[periodIndex];
            const value = parseFloat(cellValue);
            row.volumes[period] = Number.isFinite(value) ? value : 0;
          }
        }
      });
    });
  }

  // Re-render table
  renderForecastEditorTable();
  updateForecastEditorSummary();

  console.log(`✓ Pasted ${parsed.length} rows × ${parsed[0].length} columns`);
}

/**
 * Handle delete row
 */
function handleForecastEditorDeleteRow(event) {
  // Use closest() to handle clicks on child elements (like the × text)
  const button = event.target.closest('[data-action="delete-row"]');
  if (!button) return;

  // Prevent event from bubbling and causing double-triggers
  event.stopPropagation();

  const rowIndex = Number(button.dataset.row);
  if (!Number.isFinite(rowIndex)) return;

  // Get the job number for the row being deleted
  const row = window.forecastEditorState.rows[rowIndex];
  const jobNumber = row?.jobNumber || '';

  // Only confirm if there's actual data (non-empty job)
  if (jobNumber) {
    const hasData = window.FORECAST_PERIODS.some(period => {
      const val = row.volumes?.[period];
      return val && Number(val) !== 0;
    });

    if (hasData && !confirm(`Delete job ${jobNumber} from this forecast?`)) {
      return;
    }
  }

  // Remove the row from state IMMEDIATELY for responsive UI
  window.forecastEditorState.rows.splice(rowIndex, 1);

  // Ensure at least 1 empty row
  if (!window.forecastEditorState.rows.length) {
    window.forecastEditorState.rows.push(createForecastEditorRow());
  }

  // Re-render table IMMEDIATELY (before async operations)
  renderForecastEditorTable();
  updateForecastEditorSummary();

  // Update status immediately
  const statusEl = document.getElementById('forecastEditorStatus');
  if (statusEl) {
    statusEl.textContent = jobNumber
      ? `✓ Deleted job ${jobNumber}`
      : `✓ Deleted row`;
  }

  // Do the heavy lifting asynchronously (save, update selectors)
  (async () => {
    try {
      // If the deleted job had a job number, explicitly remove its work group data
      const workGroup = window.forecastEditorState.workGroup;
      const normalizedWg = workGroup ? workGroup.trim().toUpperCase() : '';

      if (jobNumber && window.fData && window.fData.has(jobNumber)) {
        const job = window.fData.get(jobNumber);
        if (job.wgs) {
          delete job.wgs[normalizedWg];
          delete job.wgs[workGroup]; // Also try original case
        }
        if (job.comments) {
          delete job.comments[normalizedWg];
          delete job.comments[workGroup];
        }
      }

      // Save the changes to persist the deletion
      const rowsToSave = window.forecastEditorState.rows.filter(r => {
        if (!r.jobNumber) return false;
        const hasVolume = window.FORECAST_PERIODS.some(period => {
          const val = r.volumes?.[period];
          return val !== undefined && val !== null && val !== '' && Number(val) !== 0;
        });
        const hasComment = r.comment && r.comment.trim().length > 0;
        return hasVolume || hasComment;
      });

      window.fData = updateForecastWorkGroup(window.fData, rowsToSave, workGroup);
      window.fData = cleanForecastData(window.fData);

      // Save asynchronously
      await saveForecastToStorageAsync(window.fData, window.fData.size, window.forecastEditorState.year, window.forecastEditorState.planVersion);

      // Update work group selector to refresh checkmarks (lighter than full re-render)
      renderWorkGroupSelector(getCurrentWorkGroupFilter(), getWorkGroupSearchText());

    } catch (err) {
      console.error('Error saving after delete:', err);
    }
  })();
}

/**
 * Submit forecast editor form (programmatic)
 */
function submitForecastEditorForm() {
  const form = document.getElementById('forecastEditorForm');
  if (!form) return;

  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit();
  } else {
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  }
}

/**
 * Download forecast export (JSON)
 */
function downloadForecastEditorExport() {
  if (!window.fData || !window.fData.size) {
    alert('No forecast data to export. Save your changes first.');
    return;
  }

  exportForecastFile(window.forecastEditorState.year, window.forecastEditorState.planVersion, window.fData, window.fData.size);
}

/**
 * Download every populated work group/standard job combination as CSV.
 * Each combination is a separate row so the file can be filtered or uploaded
 * without losing work-group-specific volumes and comments.
 */
function downloadTotalForecastExport() {
  if (!window.fData || !window.fData.size) {
    alert('No forecast data to export. Save your changes first.');
    return;
  }

  // Capture the currently visible table before building the export. Input
  // events normally keep fData current, but syncing also covers autofill and
  // other browser-driven edits that may not yet have emitted a change event.
  if (typeof syncForecastEditorTableState === 'function') {
    syncForecastEditorTableState();
  }

  const year = window.forecastEditorState.year;
  const planVersion = window.forecastEditorState.planVersion;
  const financialYear = year.startsWith('FY') ? `20${year.substring(2)}` : year;
  const headers = ['Strategic Route', 'WGST', 'Financial Year', 'Standard Job', 'SJN and Desc', 'Account Code',
    'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12', 'P13', 'Comment'];
  const rows = [];

  window.fData.forEach((job, jobNumber) => {
    // Include comment-only combinations as well as combinations with volumes.
    const workGroups = new Set([
      ...Object.keys(job?.wgs || {}),
      ...Object.keys(job?.comments || {})
    ]);

    workGroups.forEach(workGroup => {
      const wgData = job?.wgs?.[workGroup] || {};
      const comment = job?.comments?.[workGroup] || '';
      const hasVolumes = window.FORECAST_PERIODS.some(period => {
        const value = wgData[period];
        return value !== undefined && value !== null && value !== '';
      });

      if (!hasVolumes && !String(comment).trim()) return;

      const jobDesc = window.stdJobs?.get(jobNumber)?.desc || '';
      const row = [
        '',
        workGroup,
        financialYear,
        jobNumber,
        jobDesc ? `${jobNumber} - ${jobDesc}` : jobNumber,
        'XXXX'
      ];

      window.FORECAST_PERIODS.forEach(period => {
        const value = wgData[period];
        row.push(value !== undefined && value !== null && value !== '' ? value : '');
      });
      row.push(comment);
      rows.push(row);
    });
  });

  if (!rows.length) {
    alert('No work group data to export.');
    return;
  }

  rows.sort((a, b) => a[1].localeCompare(b[1]) || a[3].localeCompare(b[3]));
  const escapeCsvCell = cell => {
    const value = String(cell);
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  const csvContent = [headers, ...rows]
    .map(row => row.map(escapeCsvCell).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `Forecast_${year}_${planVersion}_All_Work_Groups.csv`;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  console.log(`Exported ${rows.length} work group and standard job rows for ${year} ${planVersion}`);
}

/**
 * Download Excel export for upload (CSV format)
 */
function downloadExcelUploadFormat() {
  const workGroup = window.forecastEditorState.workGroup;
  const year = window.forecastEditorState.year;

  if (!window.fData || !window.fData.size) {
    alert('No forecast data to export. Save your changes first.');
    return;
  }

  // Convert FY27 -> 2027, FY26 -> 2026, etc.
  const financialYear = year.startsWith('FY') ? '20' + year.substring(2) : year;

  // Build CSV content
  const headers = ['Strategic Route', 'WGST', 'Financial Year', 'Standard Job', 'SJN and Desc', 'Account Code',
                   'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12', 'P13', 'Comment'];

  const rows = [];

  window.fData.forEach((job, jobNumber) => {
    const wgData = job?.wgs?.[workGroup];
    if (!wgData) return;

    // Check if this job has any data for the current work group
    const hasData = window.FORECAST_PERIODS.some(period => {
      const val = wgData[period];
      return val !== undefined && val !== null && val !== '';
    });

    if (!hasData) return;

    // Get job description from stdJobs
    const jobInfo = window.stdJobs?.get(jobNumber);
    const jobDesc = jobInfo?.desc || '';
    const sjnAndDesc = jobDesc ? `${jobNumber} - ${jobDesc}` : jobNumber;

    const row = [
      '', // Strategic Route (blank)
      workGroup, // WGST
      financialYear, // Financial Year (e.g., 2027)
      jobNumber, // Standard Job
      sjnAndDesc, // SJN and Desc (e.g., "006206 - T/C - TCAID - ACTIVATE")
      'XXXX', // Account Code (always XXXX)
    ];

    // Add P01-P13 values
    window.FORECAST_PERIODS.forEach(period => {
      const value = wgData[period];
      // Export numeric values, including 0
      row.push(value !== undefined && value !== null && value !== '' ? value : '');
    });

    // Add comment for this work group
    const comment = job?.comments?.[workGroup] || '';
    row.push(comment);

    rows.push(row);
  });

  if (rows.length === 0) {
    alert('No data to export for the current work group.');
    return;
  }

  // Sort by job number
  rows.sort((a, b) => a[3].localeCompare(b[3]));

  // Create CSV content
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
      // Escape cells that contain commas or quotes
      const cellStr = String(cell);
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(','))
  ].join('\n');

  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `Forecast_${year}_${workGroup}_Upload.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Trigger forecast file upload
 */
function triggerForecastFileUpload() {
  const input = document.getElementById('forecastFileInput');
  if (input) input.click();
}

/**
 * Load forecast file
 */
function loadForecastFile(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const content = e.target.result;

    // First, confirm they want to import
    const shouldImport = confirm(
      `Import forecast from file: ${file.name}?\n\n` +
      'Click OK to continue, or Cancel to abort the import.'
    );

    if (!shouldImport) {
      // User cancelled - do nothing
      return;
    }

    // Ask user: Merge or Overwrite?
    const useMerge = confirm(
      'How do you want to import this forecast?\n\n' +
      'Merge (OK): Keep existing data and add/update from file\n' +
      'Overwrite (Cancel): Replace all existing data with file data\n\n' +
      'Choose your import method:'
    );

    if (useMerge) {
      // Merge mode - detect conflicts
      handleMergeForecastImport(content);
    } else {
      // Overwrite mode - original behavior
      const result = importForecastFile(content);
      if (result.success) {
        alert(`✓ Imported ${result.count} forecast(s).`);
        handleForecastEditorContextChange(true); // Force reload to show updated data
      } else {
        alert(`Failed to import forecast: ${result.error}`);
      }
    }
  };
  reader.readAsText(file);

  // Clear input so the same file can be loaded again
  event.target.value = '';
}

/**
 * Handle merge import with conflict detection
 */
function handleMergeForecastImport(fileContent) {
  try {
    const parsed = JSON.parse(fileContent);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JSON format');
    }

    const forecasts = parsed.forecasts || parsed;
    const conflicts = [];

    // Store the uploaded data for later use
    window.importConflictData = {
      uploadedForecasts: forecasts,
      conflicts: []
    };


    // Detect conflicts by comparing uploaded data with current storage
    Object.entries(forecasts).forEach(([year, yearData]) => {
      if (!yearData || typeof yearData !== 'object') return;

      Object.entries(yearData).forEach(([planVersion, planData]) => {
        if (!planData || typeof planData !== 'object') return;

        // Handle old format (stage-nested)
        let dataToImport = null;
        if (planData.RF3 || planData.RF6 || planData.RF9 || planData.RF11) {
          const firstStage = ['RF3', 'RF6', 'RF9', 'RF11'].find(stage => planData[stage]);
          if (firstStage && planData[firstStage].data) {
            dataToImport = planData[firstStage].data;
          }
        } else if (planData.data) {
          // New format (FY-wide)
          dataToImport = planData.data;
        }

        if (!dataToImport) {
          return;
        }

        // Get current storage for this year/plan
        const currentSnapshot = getForecastSnapshot(year, planVersion);
        const currentData = currentSnapshot ? serializeForecastData(currentSnapshot.data) : {};


        // Compare each job/workgroup/period
        Object.entries(dataToImport).forEach(([jobNumber, uploadedJob]) => {
          if (!uploadedJob || !uploadedJob.wgs) {
            return;
          }

          const currentJob = currentData[jobNumber];

          // If job doesn't exist in current data, no conflicts possible - will be imported as new
          if (!currentJob) {
            return; // No conflicts, will be imported in applyMergeImport
          }

          Object.entries(uploadedJob.wgs).forEach(([workGroup, uploadedWgData]) => {
            if (!uploadedWgData) return;

            const currentWgData = currentJob?.wgs?.[workGroup];

            // If workgroup doesn't exist in current data, no conflicts possible - will be imported as new
            if (!currentWgData) {
              return; // No conflicts, will be imported in applyMergeImport
            }

            // Check each period for conflicts (both values non-zero and different)
            window.FORECAST_PERIODS.forEach(period => {
              const uploadedValue = Number(uploadedWgData[period] || 0);
              const currentValue = Number(currentWgData?.[period] || 0);

              // Conflict exists if both are non-zero and different
              if (uploadedValue !== 0 && currentValue !== 0 && uploadedValue !== currentValue) {
                conflicts.push({
                  year,
                  planVersion,
                  jobNumber,
                  workGroup,
                  period,
                  currentValue,
                  uploadedValue,
                  selectedValue: null // User will choose
                });
              }
            });
          });
        });
      });
    });

    window.importConflictData.conflicts = conflicts;


    if (conflicts.length === 0) {
      // No conflicts - proceed with merge
      applyMergeImport(forecasts, []);
      alert('✓ Import completed successfully. No conflicts detected.');
      handleForecastEditorContextChange(true); // Force reload to show updated data
    } else {
      // Show conflicts modal
      displayImportConflicts(conflicts);
    }
  } catch (err) {
    console.error('Failed to process merge import:', err);
    alert(`Failed to import forecast: ${err.message}`);
  }
}

/**
 * Display import conflicts in modal
 */
function displayImportConflicts(conflicts) {
  const modal = document.getElementById('importConflictsModal');
  const conflictsList = document.getElementById('importConflictsList');

  if (!modal || !conflictsList) return;

  // Group conflicts by job for better display
  const conflictsByJob = {};
  conflicts.forEach((conflict, index) => {
    const key = `${conflict.year}-${conflict.planVersion}-${conflict.jobNumber}`;
    if (!conflictsByJob[key]) {
      conflictsByJob[key] = {
        year: conflict.year,
        planVersion: conflict.planVersion,
        jobNumber: conflict.jobNumber,
        conflicts: []
      };
    }
    conflictsByJob[key].conflicts.push({ ...conflict, index });
  });

  // Render conflicts
  conflictsList.innerHTML = Object.values(conflictsByJob).map(group => {
    const meta = getJobMetadata(group.jobNumber);
    const jobDesc = meta?.desc || 'Unknown job';

    return `
      <div class="import-conflict-card">
        <div class="import-conflict-header">
          <strong>Job ${escapeHtml(group.jobNumber)}</strong> ${escapeHtml(jobDesc)}
          <span class="import-conflict-badge">${group.year} ${group.planVersion.toUpperCase()}</span>
        </div>
        ${group.conflicts.map(c => `
          <div class="import-conflict-item" data-conflict-index="${c.index}">
            <div class="import-conflict-details">
              <strong>${escapeHtml(c.workGroup)}</strong> • ${escapeHtml(c.period)}
            </div>
            <div class="import-conflict-options">
              <label class="import-conflict-option">
                <input type="radio" name="conflict-${c.index}" value="current" checked>
                <div class="import-conflict-value">
                  <div class="import-conflict-label">Keep Current</div>
                  <div class="import-conflict-number">${formatForecastNumber(c.currentValue)}</div>
                </div>
              </label>
              <label class="import-conflict-option">
                <input type="radio" name="conflict-${c.index}" value="uploaded">
                <div class="import-conflict-value">
                  <div class="import-conflict-label">Use Upload</div>
                  <div class="import-conflict-number">${formatForecastNumber(c.uploadedValue)}</div>
                </div>
              </label>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');

  // Show modal
  modal.classList.add('open');
}

/**
 * Close import conflicts modal
 */
function closeImportConflictsModal() {
  const modal = document.getElementById('importConflictsModal');
  if (modal) modal.classList.remove('open');

  // Clear stored data
  window.importConflictData = null;
}

/**
 * Apply import conflict resolution
 */
async function applyImportConflictResolution() {
  if (!window.importConflictData) return;

  const { uploadedForecasts, conflicts } = window.importConflictData;

  // Collect user's choices for each conflict
  const resolutions = conflicts.map((conflict, index) => {
    const selectedRadio = document.querySelector(`input[name="conflict-${index}"]:checked`);
    return {
      ...conflict,
      selectedValue: selectedRadio?.value || 'current'
    };
  });

  // Apply the merge with conflict resolutions
  await applyMergeImport(uploadedForecasts, resolutions);

  // Close modal
  closeImportConflictsModal();

  // Refresh editor (force reload to show updated data and green indicators)
  handleForecastEditorContextChange(true);

  // Show success message
  alert(`✓ Import completed. Resolved ${conflicts.length} conflict(s).`);
}

/**
 * Apply merge import with conflict resolutions
 */
async function applyMergeImport(uploadedForecasts, resolutions) {
  // Build resolution map for quick lookup
  const resolutionMap = {};
  resolutions.forEach(r => {
    const key = `${r.year}:${r.planVersion}:${r.jobNumber}:${r.workGroup}:${r.period}`;
    resolutionMap[key] = r.selectedValue;
  });

  let importedCount = 0;

  // Use for...of instead of forEach to support await
  for (const [year, yearData] of Object.entries(uploadedForecasts)) {
    if (!yearData || typeof yearData !== 'object') continue;

    for (const [planVersion, planData] of Object.entries(yearData)) {
      if (!planData || typeof planData !== 'object') continue;

      // Handle old format (stage-nested) - merge data from all stages
      let dataToImport = null;
      if (planData.RF3 || planData.RF6 || planData.RF9 || planData.RF11) {
        // Merge data from all stages
        dataToImport = {};
        ['RF3', 'RF6', 'RF9', 'RF11'].forEach(stage => {
          if (planData[stage] && planData[stage].data) {
            Object.entries(planData[stage].data).forEach(([jobNumber, jobData]) => {
              if (!dataToImport[jobNumber]) {
                dataToImport[jobNumber] = { periods: {}, wgs: {}, comments: {} };
              }
              // Merge workgroups
              if (jobData.wgs) {
                if (!dataToImport[jobNumber].wgs) dataToImport[jobNumber].wgs = {};
                Object.entries(jobData.wgs).forEach(([wg, wgData]) => {
                  if (!dataToImport[jobNumber].wgs[wg]) {
                    dataToImport[jobNumber].wgs[wg] = {};
                  }
                  Object.assign(dataToImport[jobNumber].wgs[wg], wgData);
                });
              }
              // Merge comments
              if (jobData.comments) {
                if (!dataToImport[jobNumber].comments) dataToImport[jobNumber].comments = {};
                Object.assign(dataToImport[jobNumber].comments, jobData.comments);
              }
            });
          }
        });
      } else if (planData.data) {
        // New format (FY-wide)
        dataToImport = planData.data;
      }

      if (!dataToImport || Object.keys(dataToImport).length === 0) continue;

      // Get current storage
      const currentSnapshot = getForecastSnapshot(year, planVersion);
      const currentData = currentSnapshot ? cloneForecastData(currentSnapshot.data) : new Map();

      // Merge uploaded data
      Object.entries(dataToImport).forEach(([jobNumber, uploadedJob]) => {
        if (!uploadedJob) return;

        // Get or create job entry
        if (!currentData.has(jobNumber)) {
          currentData.set(jobNumber, { periods: {}, wgs: {}, comments: {} });
        }
        const job = currentData.get(jobNumber);

        // Merge work groups
        if (uploadedJob.wgs) {
          Object.entries(uploadedJob.wgs).forEach(([workGroup, uploadedWgData]) => {
            if (!job.wgs[workGroup]) {
              job.wgs[workGroup] = {};
            }

            window.FORECAST_PERIODS.forEach(period => {
              const uploadedValue = Number(uploadedWgData[period] || 0);
              const currentValue = Number(job.wgs[workGroup][period] || 0);

              // Check if there's a resolution for this conflict
              const resolutionKey = `${year}:${planVersion}:${jobNumber}:${workGroup}:${period}`;
              const resolution = resolutionMap[resolutionKey];

              if (resolution === 'current') {
                // Keep current value (do nothing)
              } else if (resolution === 'uploaded') {
                // Use uploaded value
                job.wgs[workGroup][period] = uploadedValue;
              } else {
                // No conflict - merge normally
                // If current is 0, use uploaded value
                // If uploaded is 0, keep current value
                // If both are non-zero and same, keep either
                if (currentValue === 0 || (uploadedValue !== 0 && uploadedValue === currentValue)) {
                  job.wgs[workGroup][period] = uploadedValue;
                }
                // Otherwise keep current value
              }
            });
          });
        }

        // Merge comments
        if (uploadedJob.comments) {
          if (!job.comments) job.comments = {};
          Object.entries(uploadedJob.comments).forEach(([workGroup, comment]) => {
            // Only overwrite if current comment is empty or same
            if (!job.comments[workGroup] || job.comments[workGroup] === comment) {
              job.comments[workGroup] = comment;
            }
          });
        }

        // Recalculate period totals from all work groups
        const totals = {};
        Object.values(job.wgs || {}).forEach(wgData => {
          window.FORECAST_PERIODS.forEach(period => {
            totals[period] = (totals[period] || 0) + (Number(wgData?.[period]) || 0);
          });
        });
        job.periods = totals;
      });

      // Save the merged data (and API)
      await saveForecastToStorageAsync(currentData, currentData.size, year, planVersion);
      importedCount++;
    }
  }

  console.log(`✓ Merged ${importedCount} forecast(s)`);
}

/**
 * Format forecast number for display
 */
function formatForecastNumber(value) {
  if (!value || value === 0) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Escape HTML for safe rendering
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Open copy actuals modal
 */
function openCopyActualsModal() {
  const modal = document.getElementById('copyActualsModal');
  if (!modal) return;

  // Reset form
  const form = document.getElementById('copyActualsForm');
  if (form) form.reset();

  // Hide job list initially
  const jobListGroup = document.getElementById('copyActualsJobListGroup');
  if (jobListGroup) jobListGroup.classList.add('is-hidden');

  // Update preview
  updateCopyActualsPreview();

  modal.classList.add('open');
}

/**
 * Close copy actuals modal
 */
function closeCopyActualsModal() {
  const modal = document.getElementById('copyActualsModal');
  if (modal) modal.classList.remove('open');
}

/**
 * Update copy actuals job list based on selection
 */
function updateCopyActualsJobList() {
  const selection = document.getElementById('copyActualsJobSelection')?.value;
  const jobListGroup = document.getElementById('copyActualsJobListGroup');
  const jobListDiv = document.getElementById('copyActualsJobList');

  if (selection === 'select') {
    if (jobListGroup) jobListGroup.classList.remove('is-hidden');

    // Get all jobs with work done in current work group
    const workGroup = window.forecastEditorState.workGroup;
    const jobs = new Set();

    if (window.wData) {
      window.wData.forEach((job, jobNumber) => {
        const wgData = job?.wgs?.[workGroup];
        if (wgData && Object.values(wgData).some(periodData => {
          return window.FORECAST_PERIODS.some(period => Number(periodData?.[period] || 0) !== 0);
        })) {
          jobs.add(jobNumber);
        }
      });
    }

    // Render checkboxes
    if (jobListDiv) {
      const sortedJobs = Array.from(jobs).sort((a, b) => a.localeCompare(b));
      jobListDiv.innerHTML = sortedJobs.map(jobNumber => {
        const meta = getJobMetadata(jobNumber);
        const desc = meta?.desc || '';
        return `
          <label>
            <input type="checkbox" value="${escapeHtml(jobNumber)}" checked>
            <span><strong>${escapeHtml(jobNumber)}</strong> ${escapeHtml(desc)}</span>
          </label>
        `;
      }).join('');
    }
  } else {
    if (jobListGroup) jobListGroup.classList.add('is-hidden');
  }

  updateCopyActualsPreview();
}

/**
 * Update copy actuals preview text
 */
function updateCopyActualsPreview() {
  const previewEl = document.getElementById('copyActualsPreview');
  if (!previewEl) return;

  const period = document.getElementById('copyActualsPeriod')?.value;
  const selection = document.getElementById('copyActualsJobSelection')?.value;

  if (!period || !selection) {
    previewEl.textContent = 'Select options above to see preview.';
    return;
  }

  const periodIndex = window.FORECAST_PERIODS.indexOf(period);
  const periodCount = periodIndex + 1;

  let jobText = '';
  if (selection === 'all') {
    jobText = 'all jobs with work done in this work group';
  } else if (selection === 'current') {
    jobText = 'jobs currently in the forecast table';
  } else if (selection === 'select') {
    const checked = document.querySelectorAll('#copyActualsJobList input[type="checkbox"]:checked');
    jobText = `${checked.length} selected job${checked.length !== 1 ? 's' : ''}`;
  }

  previewEl.textContent = `Will copy actual values for periods P1–${period} (${periodCount} period${periodCount !== 1 ? 's' : ''}) for ${jobText}.`;
}

/**
 * Handle copy actuals form submission
 */
async function handleCopyActuals(event) {
  event.preventDefault();

  const period = document.getElementById('copyActualsPeriod')?.value;
  const selection = document.getElementById('copyActualsJobSelection')?.value;
  const workGroup = window.forecastEditorState.workGroup;
  const year = window.forecastEditorState.year;
  const planVersion = window.forecastEditorState.planVersion;

  if (!period || !selection || !workGroup) {
    alert('Please select all required options.');
    return;
  }

  // Get list of jobs to update
  let jobsToUpdate = [];
  if (selection === 'all') {
    // All jobs with work done in this work group
    if (window.wData) {
      window.wData.forEach((job, jobNumber) => {
        const wgData = job?.wgs?.[workGroup];
        if (wgData) {
          jobsToUpdate.push(jobNumber);
        }
      });
    }
  } else if (selection === 'current') {
    // Only jobs currently in forecast
    jobsToUpdate = window.forecastEditorState.rows
      .filter(row => row.jobNumber)
      .map(row => row.jobNumber);
  } else if (selection === 'select') {
    // Selected jobs from checkboxes
    const checked = document.querySelectorAll('#copyActualsJobList input[type="checkbox"]:checked');
    jobsToUpdate = Array.from(checked).map(cb => cb.value);
  }

  if (!jobsToUpdate.length) {
    alert('No jobs to update. Make sure work done data is loaded.');
    return;
  }

  // Get period range
  const periodIndex = window.FORECAST_PERIODS.indexOf(period);
  if (periodIndex < 0) return;
  const periodsToUpdate = window.FORECAST_PERIODS.slice(0, periodIndex + 1);

  // Copy actual values into forecast
  let updatedCount = 0;
  jobsToUpdate.forEach(jobNumber => {
    const workDoneJob = window.wData?.get(jobNumber);
    if (!workDoneJob) return;

    const wgData = workDoneJob?.wgs?.[workGroup];
    if (!wgData) return;

    // Get or create forecast job entry
    if (!window.fData) window.fData = new Map();
    let forecastJob = window.fData.get(jobNumber);
    if (!forecastJob) {
      forecastJob = { periods: {}, wgs: {} };
      window.fData.set(jobNumber, forecastJob);
    }

    // Get or create work group data in forecast
    if (!forecastJob.wgs[workGroup]) {
      forecastJob.wgs[workGroup] = {};
    }

    // Copy actual values for selected periods
    periodsToUpdate.forEach(p => {
      const actualValue = Number(wgData[p] || 0);
      forecastJob.wgs[workGroup][p] = actualValue;
    });

    // Recalculate period totals
    const totals = {};
    Object.values(forecastJob.wgs).forEach(wgData => {
      window.FORECAST_PERIODS.forEach(period => {
        totals[period] = (totals[period] || 0) + (Number(wgData?.[period]) || 0);
      });
    });
    forecastJob.periods = totals;

    updatedCount++;
  });

  // Save to storage (and API)
  await saveForecastToStorageAsync(window.fData, window.fData.size, year, planVersion);

  // Reload editor and refresh selectors to update checkmarks
  renderForecastEditorSelectors();
  loadForecastEditorRows();
  renderForecastEditorTable();
  updateForecastEditorSummary();

  // Close modal
  closeCopyActualsModal();

  // Show success message
  const statusEl = document.getElementById('forecastEditorStatus');
  if (statusEl) {
    statusEl.textContent = `✓ Copied actuals for ${updatedCount} job${updatedCount !== 1 ? 's' : ''} through ${period} at ${new Date().toLocaleTimeString()}`;
  }

  alert(`✓ Successfully copied actual values for ${updatedCount} job${updatedCount !== 1 ? 's' : ''} through period ${period}.`);
}

// Expose functions globally for HTML onclick handlers
window.openForecastEditor = openForecastEditor;
window.closeForecastEditor = closeForecastEditor;
window.submitForecastEditorForm = submitForecastEditorForm;
window.addForecastEditorRow = addForecastEditorRow;
window.clearForecastEditorTable = clearForecastEditorTable;
window.initializeV1FromV0Explicit = initializeV1FromV0Explicit;
window.openCopyWorkGroupsToV1Modal = openCopyWorkGroupsToV1Modal;
window.closeCopyWorkGroupsToV1Modal = closeCopyWorkGroupsToV1Modal;
window.setAllCopyWorkGroups = setAllCopyWorkGroups;
window.clearCopyWorkGroupSelection = clearCopyWorkGroupSelection;
window.copySelectedWorkGroupsToV1 = copySelectedWorkGroupsToV1;
window.downloadForecastEditorExport = downloadForecastEditorExport;
window.downloadTotalForecastExport = downloadTotalForecastExport;
window.downloadExcelUploadFormat = downloadExcelUploadFormat;
window.triggerForecastFileUpload = triggerForecastFileUpload;
window.loadForecastFile = loadForecastFile;
window.handleForecastEditorContextChange = handleForecastEditorContextChange;
window.openCopyActualsModal = openCopyActualsModal;
window.closeCopyActualsModal = closeCopyActualsModal;
window.updateCopyActualsJobList = updateCopyActualsJobList;
window.handleCopyActuals = handleCopyActuals;
window.closeImportConflictsModal = closeImportConflictsModal;
window.applyImportConflictResolution = applyImportConflictResolution;

// Event listener setup
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('copyWorkGroupsSearch')?.addEventListener('input', renderCopyWorkGroupsTable);
  document.getElementById('copyWorkGroupsStatusFilter')?.addEventListener('change', renderCopyWorkGroupsTable);
  // Forecast editor form submit
  const forecastForm = document.getElementById('forecastEditorForm');
  if (forecastForm) {
    forecastForm.addEventListener('submit', handleForecastEditorSubmit);
  }

  // Context selector changes (year and plan only - work group uses click handlers)
  const yearSelect = document.getElementById('forecastEditorYear');
  const planSelect = document.getElementById('forecastEditorPlan');
  if (yearSelect) yearSelect.addEventListener('change', handleForecastEditorContextChange);
  if (planSelect) planSelect.addEventListener('change', handleForecastEditorContextChange);

  // Work group filter tabs
  document.querySelectorAll('.wg-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.wg-filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderWorkGroupSelector(tab.dataset.filter, getWorkGroupSearchText());
    });
  });

  // Work group search with debouncing
  const wgSearchInput = document.getElementById('workGroupSearch');
  if (wgSearchInput) {
    const debouncedWgSearch = window.debounce(() => {
      renderWorkGroupSelector(getCurrentWorkGroupFilter(), wgSearchInput.value);
    }, 200);
    wgSearchInput.addEventListener('input', debouncedWgSearch);
  }

  // Forecast table search/filter with debouncing
  const searchInput = document.getElementById('forecastEditorSearch');
  if (searchInput) {
    const debouncedFilter = window.debounce(filterForecastEditorTable, 300);
    searchInput.addEventListener('input', debouncedFilter);
  }

  // Table interactions (delegated)
  const forecastTable = document.getElementById('forecastEditorTable');
  if (forecastTable) {
    forecastTable.addEventListener('input', handleForecastEditorTableInput);
    forecastTable.addEventListener('paste', handleForecastEditorTablePaste);
    forecastTable.addEventListener('click', handleForecastEditorDeleteRow);

    // CRITICAL: Auto-sync on blur to prevent data loss when user clicks away
    forecastTable.addEventListener('blur', (e) => {
      if (e.target.matches('input, textarea')) {
        syncForecastEditorTableState();
      }
    }, true); // Use capture phase to catch all blur events
  }

  // CRITICAL: Periodic auto-sync every 10 seconds to protect typed values
  setInterval(() => {
    const forecastPage = document.getElementById('forecastPage');
    if (forecastPage && !forecastPage.classList.contains('is-hidden')) {
      syncForecastEditorTableState();
    }
  }, 10000);

  // Copy actuals modal listeners
  const copyActualsPeriod = document.getElementById('copyActualsPeriod');
  if (copyActualsPeriod) {
    copyActualsPeriod.addEventListener('change', updateCopyActualsPreview);
  }

  const copyActualsJobSelection = document.getElementById('copyActualsJobSelection');
  if (copyActualsJobSelection) {
    copyActualsJobSelection.addEventListener('change', () => {
      updateCopyActualsJobList();
      updateCopyActualsPreview();
    });
  }
});
