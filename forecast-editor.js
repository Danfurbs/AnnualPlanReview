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

    if (snapshot) {
      window.fData = snapshot.data;
    }

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
  const workGroupSelect = document.getElementById('forecastEditorWorkGroup');

  if (!yearSelect || !planSelect || !workGroupSelect) return;

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

  // Work group selector with indicators for groups that have data
  const workGroupOptions = getAllWorkGroupSetNames();
  workGroupSelect.innerHTML = workGroupOptions
    .map(name => {
      const hasData = workGroupHasForecastData(name);
      const indicator = hasData ? '✓ ' : '';
      return `<option value="${escapeHtml(name)}">${indicator}${escapeHtml(name)}</option>`;
    })
    .join('');
  window.forecastEditorState.workGroup = workGroupOptions.includes(window.forecastEditorState.workGroup)
    ? window.forecastEditorState.workGroup
    : (workGroupOptions[0] || '');
  workGroupSelect.value = window.forecastEditorState.workGroup;

  // Load rows for current context
  loadForecastEditorRows();
  renderForecastEditorJobOptions();
}

/**
 * Check if a work group has any forecast data in current context
 */
function workGroupHasForecastData(workGroupName) {
  if (!workGroupName) return false;

  const year = window.forecastEditorState.year;
  const planVersion = window.forecastEditorState.planVersion;

  // For v1, check both v1 and inherited v0 data
  if (planVersion === 'v1') {
    const v0Snapshot = getForecastSnapshot(year, 'v0');
    const v1Overrides = loadV1Overrides(year);

    // Check v0 for non-overridden jobs
    if (v0Snapshot && v0Snapshot.data) {
      let hasV0Data = false;
      v0Snapshot.data.forEach((job, jobNumber) => {
        if (!v1Overrides.has(jobNumber) && job?.wgs?.[workGroupName]) {
          hasV0Data = true;
        }
      });
      if (hasV0Data) return true;
    }
  }

  // Check current fData (v0 or v1 explicit edits)
  if (!window.fData) return false;
  let hasData = false;
  window.fData.forEach((job) => {
    if (job?.wgs?.[workGroupName]) {
      hasData = true;
    }
  });

  return hasData;
}

/**
 * Load forecast editor rows from current forecast data
 * For v1: Inherits v0 values for jobs not explicitly edited in v1
 */
function loadForecastEditorRows() {
  const workGroup = window.forecastEditorState.workGroup;
  const year = window.forecastEditorState.year;
  const planVersion = window.forecastEditorState.planVersion;
  const rows = [];

  // If editing v1, merge with v0 for non-overridden jobs
  let dataToUse = window.fData;
  if (planVersion === 'v1') {
    const v0Snapshot = getForecastSnapshot(year, 'v0');
    const v1Overrides = loadV1Overrides(year);

    if (v0Snapshot && v0Snapshot.data) {
      // Create merged data: v1 overrides take precedence, otherwise use v0
      dataToUse = new Map();

      // First, add all v0 jobs
      v0Snapshot.data.forEach((job, jobNumber) => {
        if (!v1Overrides.has(jobNumber)) {
          dataToUse.set(jobNumber, job);
        }
      });

      // Then add/override with v1 jobs
      if (window.fData) {
        window.fData.forEach((job, jobNumber) => {
          dataToUse.set(jobNumber, job);
        });
      }
    }
  }

  if (dataToUse && workGroup) {
    dataToUse.forEach((job, jobNumber) => {
      const wgData = job?.wgs?.[workGroup];
      if (!wgData) return;

      const meta = getJobMetadata(jobNumber);
      const volumes = {};
      window.FORECAST_PERIODS.forEach(period => {
        volumes[period] = Number(wgData[period] || 0);
      });

      const comment = job?.comments?.[workGroup] || '';

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

  // Build forecast data lookup for quick access
  const forecastLookup = {};
  window.forecastEditorState.rows.forEach(row => {
    if (row.jobNumber) {
      forecastLookup[row.jobNumber] = row;
    }
  });

  // Group standard jobs by discipline
  const jobsByDiscipline = {};
  window.STANDARD_JOBS.forEach(job => {
    const discipline = job.discipline || 'Other';
    if (!jobsByDiscipline[discipline]) {
      jobsByDiscipline[discipline] = [];
    }
    jobsByDiscipline[discipline].push(job);
  });

  // Sort disciplines alphabetically
  const disciplines = Object.keys(jobsByDiscipline).sort();

  // Header
  const header = `
    <thead>
      <tr>
        <th>Standard job</th>
        <th>Description</th>
        <th>Unit</th>
        ${window.FORECAST_PERIODS.map(period => `<th>${period}</th>`).join('')}
        <th>Total</th>
        <th>Comment</th>
        <th></th>
      </tr>
    </thead>
  `;

  // Body with discipline groups
  const body = `
    <tbody>
      ${disciplines.map(discipline => {
        const jobs = jobsByDiscipline[discipline];
        const disciplineJobsWithData = jobs.filter(job => forecastLookup[job.standardJobNo]);
        const totalJobs = jobs.length;
        const jobsWithData = disciplineJobsWithData.length;

        return `
          <!-- Discipline Header Row -->
          <tr class="discipline-header-row" data-discipline="${escapeHtml(discipline)}">
            <td colspan="3" class="discipline-header-cell">
              <button type="button" class="discipline-toggle" data-discipline="${escapeHtml(discipline)}">
                <span class="discipline-toggle-icon">▼</span>
                <span class="discipline-name">${escapeHtml(discipline)}</span>
                <span class="discipline-stats">${jobsWithData}/${totalJobs} jobs</span>
              </button>
            </td>
            <td colspan="${window.FORECAST_PERIODS.length + 3}" class="discipline-header-spacer"></td>
          </tr>

          <!-- Jobs in this discipline -->
          ${jobs.map(job => {
            const jobNumber = job.standardJobNo;
            const forecastRow = forecastLookup[jobNumber];
            const hasData = !!forecastRow;
            const rowTotal = hasData ? getForecastEditorRowTotal(forecastRow) : 0;
            const comment = forecastRow?.comment || '';

            return `
              <tr class="discipline-job-row ${hasData ? 'has-forecast-data' : ''}"
                  data-discipline="${escapeHtml(discipline)}"
                  data-job="${escapeHtml(jobNumber)}">
                <td class="forecast-job-cell">
                  <span class="forecast-job-indicator ${hasData ? 'has-data' : ''}"></span>
                  <span class="forecast-job-number">${escapeHtml(jobNumber)}</span>
                </td>
                <td class="forecast-desc-cell">${escapeHtml(job.standardJobDescription || '')}</td>
                <td class="forecast-unit-cell">${escapeHtml(job.unitOfMeasure || '')}</td>
                ${window.FORECAST_PERIODS.map(period => {
                  const value = forecastRow ? Number(forecastRow.volumes?.[period] || 0) : 0;
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
                    placeholder="Comment..."
                    rows="1"
                  >${escapeHtml(comment)}</textarea>
                </td>
                <td class="forecast-action-cell">
                  ${hasData ? '<span class="forecast-status-icon">✓</span>' : ''}
                </td>
              </tr>
            `;
          }).join('')}
        `;
      }).join('')}
    </tbody>
  `;

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

  // Attach discipline toggle handlers
  attachDisciplineToggleHandlers();

  // Filter table if needed
  filterForecastEditorTable();
}

/**
 * Attach discipline toggle handlers
 */
function attachDisciplineToggleHandlers() {
  const toggleButtons = document.querySelectorAll('.discipline-toggle');

  toggleButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const discipline = button.dataset.discipline;
      toggleDiscipline(discipline);
    });
  });
}

/**
 * Toggle discipline group visibility
 */
function toggleDiscipline(discipline) {
  const jobRows = document.querySelectorAll(`.discipline-job-row[data-discipline="${discipline}"]`);
  const toggleButton = document.querySelector(`.discipline-toggle[data-discipline="${discipline}"]`);
  const icon = toggleButton?.querySelector('.discipline-toggle-icon');

  if (!jobRows.length) return;

  const isCollapsed = jobRows[0].classList.contains('collapsed');

  jobRows.forEach(row => {
    if (isCollapsed) {
      row.classList.remove('collapsed');
    } else {
      row.classList.add('collapsed');
    }
  });

  if (icon) {
    icon.textContent = isCollapsed ? '▼' : '▶';
  }
}

/**
 * Collapse all disciplines
 */
function collapseAllDisciplines() {
  const disciplines = Array.from(document.querySelectorAll('.discipline-toggle')).map(btn => btn.dataset.discipline);
  disciplines.forEach(discipline => {
    const jobRows = document.querySelectorAll(`.discipline-job-row[data-discipline="${discipline}"]`);
    const icon = document.querySelector(`.discipline-toggle[data-discipline="${discipline}"] .discipline-toggle-icon`);

    jobRows.forEach(row => row.classList.add('collapsed'));
    if (icon) icon.textContent = '▶';
  });
}

/**
 * Expand all disciplines
 */
function expandAllDisciplines() {
  const disciplines = Array.from(document.querySelectorAll('.discipline-toggle')).map(btn => btn.dataset.discipline);
  disciplines.forEach(discipline => {
    const jobRows = document.querySelectorAll(`.discipline-job-row[data-discipline="${discipline}"]`);
    const icon = document.querySelector(`.discipline-toggle[data-discipline="${discipline}"] .discipline-toggle-icon`);

    jobRows.forEach(row => row.classList.remove('collapsed'));
    if (icon) icon.textContent = '▼';
  });
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

  const workGroup = window.forecastEditorState.workGroup;

  // Calculate totals from fData
  if (window.fData) {
    window.fData.forEach((job, jobNumber) => {
      const wgData = job.wgs?.[workGroup];
      if (wgData) {
        window.FORECAST_PERIODS.forEach(period => {
          const value = Number(wgData[period] || 0);
          periodTotals[period] += value;
          grandTotal += value;
        });
      }
    });
  }

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
  const v1Overrides = loadV1Overrides(year);

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

    // Mark this job as explicitly edited in v1
    v1Overrides.add(jobNumber);
    copiedCount++;
  });

  // Save to v1 storage (and API)
  await saveForecastToStorageAsync(v1Data, v1Data.size, year, 'v1');

  // Save updated overrides
  saveV1Overrides(year, v1Overrides);

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

  // Refresh selectors to update checkmarks
  renderForecastEditorSelectors();
  renderForecastEditorTable();
  updateForecastEditorSummary();

  const statusEl = document.getElementById('forecastEditorStatus');
  if (statusEl) statusEl.textContent = `✓ Cleared and saved blank forecast for ${window.forecastEditorState.workGroup}`;
}

/**
 * Handle context change (year, plan, work group)
 */
async function handleForecastEditorContextChange() {
  // CRITICAL: Sync current state before switching contexts to prevent data loss
  syncForecastEditorTableState();

  const yearSelect = document.getElementById('forecastEditorYear');
  const planSelect = document.getElementById('forecastEditorPlan');
  const workGroupSelect = document.getElementById('forecastEditorWorkGroup');

  const newYear = yearSelect?.value || window.forecastEditorState.year;
  const newPlan = planSelect?.value || window.forecastEditorState.planVersion;
  const newWorkGroup = workGroupSelect?.value || window.forecastEditorState.workGroup;

  // Check if context changed
  const contextChanged = newYear !== window.forecastEditorState.year || newPlan !== window.forecastEditorState.planVersion;

  window.forecastEditorState.year = newYear;
  window.forecastEditorState.planVersion = newPlan;
  window.forecastEditorState.workGroup = newWorkGroup;

  // Reload forecast data if year/plan changed (checks API if enabled)
  if (contextChanged) {
    const snapshot = await getForecastSnapshotAsync(window.forecastEditorState.year, window.forecastEditorState.planVersion);
    if (snapshot) {
      window.fData = snapshot.data;
    } else {
      window.fData = null;
    }
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

  // Sync DOM state to fData
  syncForecastEditorTableState();

  // Clean up empty jobs
  window.fData = cleanForecastData(window.fData);

  const year = window.forecastEditorState.year;
  const planVersion = window.forecastEditorState.planVersion;
  const workGroup = window.forecastEditorState.workGroup;

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
    // If saving v1, mark these jobs as explicitly edited (overrides)
    if (planVersion === 'v1' && jobNumbers.length > 0) {
      addToV1Overrides(year, jobNumbers);
    }

    // Refresh work group selector to update checkmarks
    renderForecastEditorSelectors();

    if (statusEl) {
      const message = jobCount
        ? `✓ Saved ${jobCount} jobs for ${workGroup} at ${new Date().toLocaleTimeString()}`
        : `✓ Saved blank forecast for ${workGroup} at ${new Date().toLocaleTimeString()}`;
      statusEl.textContent = message;
    }
    console.log(`✓ Forecast saved: ${year} ${planVersion} (${jobCount} jobs)`);
  } else {
    alert('Failed to save forecast. Check console for details.');
  }
}

/**
 * Sync DOM table state to editor state
 */
function syncForecastEditorTableState() {
  const workGroup = window.forecastEditorState.workGroup;
  if (!workGroup) return;

  // Sync all job rows from DOM to fData
  document.querySelectorAll('#forecastEditorTable tbody tr.discipline-job-row').forEach((rowEl) => {
    const jobNumber = rowEl.dataset.job;
    if (!jobNumber) return;

    // Collect volumes from input fields
    const volumes = {};
    let hasAnyVolume = false;
    rowEl.querySelectorAll('input[data-period]').forEach(input => {
      const period = input.dataset.period;
      const value = parseFloat(input.value);
      const numericValue = Number.isFinite(value) ? value : 0;
      volumes[period] = numericValue;
      if (numericValue !== 0) hasAnyVolume = true;
    });

    // Get comment
    const commentInput = rowEl.querySelector('.forecast-comment-input');
    const comment = String(commentInput?.value || '').trim();

    // Update fData
    if (hasAnyVolume || comment) {
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
    }
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
  if (!jobNumber) return;

  const workGroup = window.forecastEditorState.workGroup;

  // Handle period input
  if (event.target.matches('input[data-period]')) {
    const period = event.target.dataset.period;
    const value = parseFloat(event.target.value);
    const numericValue = Number.isFinite(value) ? value : 0;

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

    // Update value
    job.wgs[workGroup][period] = numericValue;

    // Update visual indicators
    event.target.classList.toggle('has-value', numericValue !== 0);
    rowEl.classList.toggle('has-forecast-data', hasAnyForecastData(jobNumber, workGroup));

    // Update cell highlighting for baseline comparison
    updateCellHighlight(jobNumber, period, event.target);

    // Update row total
    updateRowTotal(jobNumber);

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

    // Ensure job exists in fData
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

    // Update visual indicator
    event.target.classList.toggle('has-value', comment.length > 0);
    rowEl.classList.toggle('has-forecast-data', hasAnyForecastData(jobNumber, workGroup));

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

  const startRowIndex = Number(target.dataset.row);
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
async function handleForecastEditorDeleteRow(event) {
  const button = event.target;
  if (!button || !button.matches('[data-action="delete-row"]')) return;

  const rowIndex = Number(button.dataset.row);
  if (!Number.isFinite(rowIndex)) return;

  // Get the job number for the row being deleted
  const row = window.forecastEditorState.rows[rowIndex];
  const jobNumber = row?.jobNumber || '';

  // Confirm deletion
  const confirmMessage = jobNumber
    ? `Delete job ${jobNumber} from this forecast?`
    : 'Delete this empty row?';

  if (!confirm(confirmMessage)) {
    return;
  }

  // Remove the row from state
  window.forecastEditorState.rows.splice(rowIndex, 1);

  // Ensure at least 1 empty row
  if (!window.forecastEditorState.rows.length) {
    window.forecastEditorState.rows.push(createForecastEditorRow());
  }

  // Save the changes to persist the deletion
  const rowsToSave = window.forecastEditorState.rows.filter(row => {
    if (!row.jobNumber) return false;
    // Keep row if it has non-zero volumes OR has a comment
    const hasVolume = window.FORECAST_PERIODS.some(period => {
      const val = row.volumes?.[period];
      return val !== undefined && val !== null && val !== '';
    });
    const hasComment = row.comment && row.comment.trim().length > 0;
    return hasVolume || hasComment;
  });

  // If the deleted job had a job number, explicitly remove its work group data
  if (jobNumber && window.fData.has(jobNumber)) {
    const job = window.fData.get(jobNumber);
    if (job.wgs && job.wgs[window.forecastEditorState.workGroup]) {
      delete job.wgs[window.forecastEditorState.workGroup];
    }
    if (job.comments && job.comments[window.forecastEditorState.workGroup]) {
      delete job.comments[window.forecastEditorState.workGroup];
    }
  }

  window.fData = updateForecastWorkGroup(window.fData, rowsToSave, window.forecastEditorState.workGroup);
  window.fData = cleanForecastData(window.fData);
  await saveForecastToStorageAsync(window.fData, window.fData.size, window.forecastEditorState.year, window.forecastEditorState.planVersion);

  // If deleting from v1 and job had a number, mark it as explicitly deleted (override)
  // This prevents it from being inherited from v0
  if (window.forecastEditorState.planVersion === 'v1' && jobNumber) {
    addToV1Overrides(window.forecastEditorState.year, [jobNumber]);
  }

  // Re-render and refresh selectors to update checkmarks
  renderForecastEditorSelectors();
  renderForecastEditorTable();
  updateForecastEditorSummary();

  // Update status
  const statusEl = document.getElementById('forecastEditorStatus');
  if (statusEl) {
    statusEl.textContent = jobNumber
      ? `✓ Deleted job ${jobNumber} at ${new Date().toLocaleTimeString()}`
      : `✓ Deleted row at ${new Date().toLocaleTimeString()}`;
  }
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
        alert(`✓ Imported ${result.count} forecast(s). Refresh the editor to see changes.`);
        handleForecastEditorContextChange();
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
      handleForecastEditorContextChange();
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

  // Refresh editor
  handleForecastEditorContextChange();

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

  // If saving to v1, mark jobs as overrides
  if (planVersion === 'v1') {
    addToV1Overrides(year, jobsToUpdate);
  }

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
window.downloadForecastEditorExport = downloadForecastEditorExport;
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
  // Forecast editor form submit
  const forecastForm = document.getElementById('forecastEditorForm');
  if (forecastForm) {
    forecastForm.addEventListener('submit', handleForecastEditorSubmit);
  }

  // Context selector changes
  const yearSelect = document.getElementById('forecastEditorYear');
  const planSelect = document.getElementById('forecastEditorPlan');
  const workGroupSelect = document.getElementById('forecastEditorWorkGroup');
  if (yearSelect) yearSelect.addEventListener('change', handleForecastEditorContextChange);
  if (planSelect) planSelect.addEventListener('change', handleForecastEditorContextChange);
  if (workGroupSelect) workGroupSelect.addEventListener('change', handleForecastEditorContextChange);

  // Search/filter with debouncing
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
