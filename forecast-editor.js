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
function openForecastEditor() {
  console.log('openForecastEditor called');

  try {
    const dashboardPage = document.getElementById('dashboardPage');
    const forecastPage = document.getElementById('forecastPage');

    console.log('  - dashboardPage:', dashboardPage);
    console.log('  - forecastPage:', forecastPage);

    if (dashboardPage) dashboardPage.classList.add('is-hidden');
    if (forecastPage) forecastPage.classList.remove('is-hidden');

    console.log('  - Calling initializeForecastEditor...');
    initializeForecastEditor();
    console.log('  - initializeForecastEditor completed');
  } catch (error) {
    console.error('Error in openForecastEditor:', error);
    alert('Error opening forecast editor: ' + error.message);
  }
}

/**
 * Close the forecast editor page
 */
function closeForecastEditor() {
  const dashboardPage = document.getElementById('dashboardPage');
  const forecastPage = document.getElementById('forecastPage');

  if (forecastPage) forecastPage.classList.add('is-hidden');
  if (dashboardPage) dashboardPage.classList.remove('is-hidden');

  // Reload forecast data and refresh dashboard
  const forecastCache = loadForecastFromStorage(window.currentFinancialYear, window.currentPlanVersion);
  if (forecastCache) {
    window.fData = forecastCache.data;
  }

  // Trigger dashboard re-render to show updated forecast
  if (typeof window.render === 'function') {
    window.render();
  }
}

/**
 * Initialize forecast editor (load data and render)
 */
function initializeForecastEditor() {
  console.log('initializeForecastEditor called');

  try {
    // Set initial context
    console.log('  - Getting financial year options...');
    const yearOptions = getFinancialYearOptions();
    console.log('  - Year options:', yearOptions);

    window.forecastEditorState.year = window.currentFinancialYear || yearOptions[0] || 'FY27';
    window.forecastEditorState.planVersion = window.currentPlanVersion || 'v0';

    console.log('  - Editor state:', window.forecastEditorState);

    // Load forecast for this context
    console.log('  - Loading forecast snapshot...');
    const snapshot = getForecastSnapshot(window.forecastEditorState.year, window.forecastEditorState.planVersion);
    console.log('  - Snapshot:', snapshot);

    if (snapshot) {
      window.fData = snapshot.data;
    }

    // Render selectors and table
    console.log('  - Rendering selectors...');
    renderForecastEditorSelectors();
    console.log('  - Rendering table...');
    renderForecastEditorTable();
    console.log('  - Updating summary...');
    updateForecastEditorSummary();
    console.log('  - Initialization complete');
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
  if (!window.fData || !workGroupName) return false;

  // Check if any job has data for this work group
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

  // Body
  const body = `
    <tbody>
      ${window.forecastEditorState.rows.map((row, index) => {
        const desc = row.desc || '';
        const unit = row.unit || '';
        const searchValue = `${row.jobNumber || ''} ${desc || ''}`.toLowerCase();
        const rowTotal = getForecastEditorRowTotal(row);

        return `
          <tr data-row="${index}" data-search="${escapeHtml(searchValue)}">
            <td>
              <input
                type="text"
                class="forecast-job-input"
                data-row="${index}"
                list="forecastEditorJobOptions"
                placeholder="Std job #"
                value="${escapeHtml(row.jobNumber || '')}"
              >
            </td>
            <td data-role="desc" class="${desc ? '' : 'forecast-cell-muted'}">${escapeHtml(desc || 'Auto-fill')}</td>
            <td data-role="unit" class="${unit ? '' : 'forecast-cell-muted'}">${escapeHtml(unit || 'Auto-fill')}</td>
            ${window.FORECAST_PERIODS.map(period => {
              const value = Number(row.volumes?.[period] || 0);
              const baselineValue = getBaselineValue(baselineMap, row.jobNumber, workGroup, period);
              const isChanged = baselineMap && row.jobNumber && value !== Number(baselineValue || 0);
              return `
                <td>
                  <input
                    type="number"
                    step="0.01"
                    class="forecast-period-input${isChanged ? ' is-changed' : ''}"
                    data-row="${index}"
                    data-period="${period}"
                    value="${value !== undefined && value !== null ? value : ''}"
                  >
                </td>
              `;
            }).join('')}
            <td class="forecast-total-cell" data-role="row-total" data-row="${index}">${formatForecastNumber(rowTotal)}</td>
            <td class="forecast-comment-cell">
              <textarea
                class="forecast-comment-input"
                data-row="${index}"
                placeholder="Why this forecast..."
                rows="1"
              >${escapeHtml(row.comment || '')}</textarea>
            </td>
            <td class="forecast-action-cell">
              <button type="button" class="forecast-delete-row" data-action="delete-row" data-row="${index}">Delete</button>
            </td>
          </tr>
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
  filterForecastEditorTable();
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
  window.forecastEditorState.rows.push(createForecastEditorRow());
  renderForecastEditorTable();
  updateForecastEditorSummary();
}

/**
 * Clear forecast editor table
 */
function clearForecastEditorTable() {
  if (!confirm('This will clear all forecast data for this work group and save it as blank. Continue?')) {
    return;
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

    // Save the cleared forecast
    saveForecastToStorage(window.fData, window.fData.size, window.forecastEditorState.year, window.forecastEditorState.planVersion);
  }

  renderForecastEditorTable();
  updateForecastEditorSummary();

  const statusEl = document.getElementById('forecastEditorStatus');
  if (statusEl) statusEl.textContent = `✓ Cleared and saved blank forecast for ${window.forecastEditorState.workGroup}`;
}

/**
 * Handle context change (year, plan, work group)
 */
function handleForecastEditorContextChange() {
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

  // Reload forecast data if year/plan changed
  if (contextChanged) {
    const snapshot = getForecastSnapshot(window.forecastEditorState.year, window.forecastEditorState.planVersion);
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
function handleForecastEditorSubmit(event) {
  if (event) event.preventDefault();

  // Sync DOM state to editor state
  syncForecastEditorTableState();

  // Filter out empty rows (keep rows with job number that have volumes or comments)
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

  const year = window.forecastEditorState.year;
  const planVersion = window.forecastEditorState.planVersion;
  const jobNumbers = rowsToSave.map(row => row.jobNumber);

  // If saving v0, check for conflicts with v1 edits
  if (planVersion === 'v0' && jobNumbers.length > 0) {
    const conflicts = checkV0ConflictsWithV1(year, jobNumbers);
    if (conflicts.length > 0) {
      const jobList = conflicts.join(', ');
      const confirmed = confirm(
        `Warning: The following jobs have been edited in Plan v1:\n\n${jobList}\n\n` +
        `Saving changes to v0 will overwrite your v1 changes for these jobs.\n\n` +
        `Do you want to continue and sync v1 with these v0 changes?`
      );

      if (!confirmed) {
        return; // User cancelled, don't save
      }

      // User confirmed - remove these jobs from v1 overrides so they inherit from v0 again
      removeFromV1Overrides(year, conflicts);

      // Also update v1 storage to match v0 for these jobs
      const v1Snapshot = getForecastSnapshot(year, 'v1');
      if (v1Snapshot && v1Snapshot.data) {
        const v1Data = v1Snapshot.data;

        // Update v1 with the v0 changes
        rowsToSave.forEach(row => {
          if (conflicts.includes(row.jobNumber)) {
            // Update v1 job data to match what will be in v0
            const jobData = window.fData.get(row.jobNumber);
            if (jobData) {
              v1Data.set(row.jobNumber, jobData);
            }
          }
        });

        saveForecastToStorage(v1Data, v1Data.size, year, 'v1');
      }
    }
  }

  // Update forecast data (empty rowsToSave will clear the work group)
  window.fData = updateForecastWorkGroup(window.fData, rowsToSave, window.forecastEditorState.workGroup);

  // Clean up empty jobs
  window.fData = cleanForecastData(window.fData);

  // Save to localStorage
  const saved = saveForecastToStorage(window.fData, window.fData.size, year, planVersion);

  if (saved) {
    // If saving v1, mark these jobs as explicitly edited (overrides)
    if (planVersion === 'v1' && jobNumbers.length > 0) {
      addToV1Overrides(year, jobNumbers);
    }

    const statusEl = document.getElementById('forecastEditorStatus');
    if (statusEl) {
      const message = rowsToSave.length
        ? `✓ Saved ${rowsToSave.length} jobs for ${window.forecastEditorState.workGroup} at ${new Date().toLocaleTimeString()}`
        : `✓ Saved blank forecast for ${window.forecastEditorState.workGroup} at ${new Date().toLocaleTimeString()}`;
      statusEl.textContent = message;
    }
    console.log(`✓ Forecast saved: ${year} ${planVersion} (${rowsToSave.length} jobs)`);
  } else {
    alert('Failed to save forecast. Check console for details.');
  }
}

/**
 * Sync DOM table state to editor state
 */
function syncForecastEditorTableState() {
  const rows = [];
  document.querySelectorAll('#forecastEditorTable tbody tr').forEach((rowEl, index) => {
    const jobInput = rowEl.querySelector('.forecast-job-input');
    const jobNumber = String(jobInput?.value || '').trim();
    const meta = getJobMetadata(jobNumber);

    const volumes = {};
    rowEl.querySelectorAll('input[data-period]').forEach(input => {
      const period = input.dataset.period;
      const value = parseFloat(input.value);
      volumes[period] = Number.isFinite(value) ? value : 0;
    });

    const commentInput = rowEl.querySelector('.forecast-comment-input');
    const comment = String(commentInput?.value || '').trim();

    rows[index] = {
      jobNumber,
      desc: meta?.desc || '',
      unit: meta?.unit || '',
      volumes,
      comment
    };
  });

  window.forecastEditorState.rows = rows;
}

/**
 * Handle table input changes
 */
function handleForecastEditorTableInput(event) {
  const rowEl = event.target.closest('tr');
  if (!rowEl) return;

  const rowIndex = Number(rowEl.dataset.row);
  if (!Number.isFinite(rowIndex)) return;

  // Handle job number input
  if (event.target.classList.contains('forecast-job-input')) {
    const jobNumber = String(event.target.value || '').trim();
    event.target.value = jobNumber;

    // Update row metadata
    const meta = getJobMetadata(jobNumber);
    window.forecastEditorState.rows[rowIndex].jobNumber = jobNumber;
    window.forecastEditorState.rows[rowIndex].desc = meta?.desc || '';
    window.forecastEditorState.rows[rowIndex].unit = meta?.unit || '';

    // Load existing volumes for this job
    const existingVolumes = getForecastWorkGroupData(window.fData, jobNumber, window.forecastEditorState.workGroup);
    window.FORECAST_PERIODS.forEach(period => {
      window.forecastEditorState.rows[rowIndex].volumes[period] = Number(existingVolumes[period] || 0);
    });

    // Load existing comment for this job
    const existingComment = getForecastComment(window.fData, jobNumber, window.forecastEditorState.workGroup);
    window.forecastEditorState.rows[rowIndex].comment = existingComment;

    // Update DOM
    const descCell = rowEl.querySelector('[data-role="desc"]');
    const unitCell = rowEl.querySelector('[data-role="unit"]');
    const commentInput = rowEl.querySelector('.forecast-comment-input');
    if (commentInput) {
      commentInput.value = existingComment;
    }
    if (descCell) {
      descCell.textContent = window.forecastEditorState.rows[rowIndex].desc || 'Auto-fill';
      descCell.classList.toggle('forecast-cell-muted', !window.forecastEditorState.rows[rowIndex].desc);
    }
    if (unitCell) {
      unitCell.textContent = window.forecastEditorState.rows[rowIndex].unit || 'Auto-fill';
      unitCell.classList.toggle('forecast-cell-muted', !window.forecastEditorState.rows[rowIndex].unit);
    }

    // Update period inputs
    rowEl.querySelectorAll('input[data-period]').forEach(input => {
      const period = input.dataset.period;
      const value = window.forecastEditorState.rows[rowIndex].volumes[period];
      input.value = (value !== undefined && value !== null) ? value : '';
      updateCellHighlight(rowIndex, period, input);
    });

    updateForecastEditorSummary();
    updateForecastEditorTotalsDisplay();
    return;
  }

  // Handle period input
  if (event.target.matches('input[data-period]')) {
    const period = event.target.dataset.period;
    const value = parseFloat(event.target.value);
    window.forecastEditorState.rows[rowIndex].volumes[period] = Number.isFinite(value) ? value : 0;
    updateCellHighlight(rowIndex, period, event.target);
    updateForecastEditorSummary();
    updateForecastEditorTotalsDisplay();
  }
}

/**
 * Update cell highlighting for v0 vs v1 changes
 */
function updateCellHighlight(rowIndex, period, inputElement) {
  if (window.forecastEditorState.planVersion !== 'v1') {
    inputElement.classList.remove('is-changed');
    return;
  }

  const baselineMap = getForecastEditorBaselineMap();
  if (!baselineMap) {
    inputElement.classList.remove('is-changed');
    return;
  }

  const row = window.forecastEditorState.rows[rowIndex];
  if (!row || !row.jobNumber) {
    inputElement.classList.remove('is-changed');
    return;
  }

  const currentValue = Number(row.volumes?.[period] || 0);
  const baselineValue = getBaselineValue(baselineMap, row.jobNumber, window.forecastEditorState.workGroup, period);
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

  // Allow paste on job number inputs and period inputs
  if (!target || (!target.matches('input[data-period]') && !target.matches('.forecast-job-input'))) {
    return;
  }

  const clipboard = event.clipboardData?.getData('text');
  if (!clipboard) return;

  const rows = clipboard.replace(/\r/g, '').split('\n').filter(line => line.length);
  if (!rows.length) return;

  const parsed = rows.map(row => row.split('\t'));
  if (parsed.length === 1 && parsed[0].length === 1) {
    // Single value paste - allow default behavior
    return;
  }

  event.preventDefault();

  const startRowIndex = Number(target.dataset.row);
  if (!Number.isFinite(startRowIndex)) return;

  // Determine starting column
  let startColIndex = 0;
  if (target.matches('input[data-period]')) {
    // Pasting into a period column
    startColIndex = window.FORECAST_PERIODS.indexOf(target.dataset.period);
    if (startColIndex < 0) return;
    startColIndex += 1; // +1 because job number is column 0
  } else if (target.matches('.forecast-job-input')) {
    // Pasting into job number column
    startColIndex = 0;
  }

  // Ensure enough rows exist
  const requiredRows = startRowIndex + parsed.length;
  while (window.forecastEditorState.rows.length < requiredRows) {
    window.forecastEditorState.rows.push(createForecastEditorRow());
  }

  // Paste data
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

  // Re-render table
  renderForecastEditorTable();
  updateForecastEditorSummary();

  console.log(`✓ Pasted ${parsed.length} rows × ${parsed[0].length} columns`);
}

/**
 * Handle delete row
 */
function handleForecastEditorDeleteRow(event) {
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
    const hasVolume = window.FORECAST_PERIODS.some(period => Number(row.volumes?.[period] || 0) !== 0);
    return hasVolume;
  });

  window.fData = updateForecastWorkGroup(window.fData, rowsToSave, window.forecastEditorState.workGroup);
  window.fData = cleanForecastData(window.fData);
  saveForecastToStorage(window.fData, window.fData.size, window.forecastEditorState.year, window.forecastEditorState.planVersion);

  // Re-render
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
    const result = importForecastFile(content);

    if (result.success) {
      alert(`✓ Imported ${result.count} forecast(s). Refresh the editor to see changes.`);
      // Reload editor
      handleForecastEditorContextChange();
    } else {
      alert(`Failed to import forecast: ${result.error}`);
    }
  };
  reader.readAsText(file);

  // Clear input so the same file can be loaded again
  event.target.value = '';
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
function handleCopyActuals(event) {
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

  // Save to storage
  saveForecastToStorage(window.fData, window.fData.size, year, planVersion);

  // If saving to v1, mark jobs as overrides
  if (planVersion === 'v1') {
    addToV1Overrides(year, jobsToUpdate);
  }

  // Reload editor
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
window.downloadForecastEditorExport = downloadForecastEditorExport;
window.triggerForecastFileUpload = triggerForecastFileUpload;
window.loadForecastFile = loadForecastFile;
window.handleForecastEditorContextChange = handleForecastEditorContextChange;
window.openCopyActualsModal = openCopyActualsModal;
window.closeCopyActualsModal = closeCopyActualsModal;
window.updateCopyActualsJobList = updateCopyActualsJobList;
window.handleCopyActuals = handleCopyActuals;

// Debug: Log that functions are loaded
console.log('✓ Forecast editor functions loaded and exposed globally');
console.log('  - openForecastEditor:', typeof window.openForecastEditor);
console.log('  - closeForecastEditor:', typeof window.closeForecastEditor);

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

  // Table interactions (delegated)
  const forecastTable = document.getElementById('forecastEditorTable');
  if (forecastTable) {
    forecastTable.addEventListener('input', handleForecastEditorTableInput);
    forecastTable.addEventListener('paste', handleForecastEditorTablePaste);
    forecastTable.addEventListener('click', handleForecastEditorDeleteRow);
  }

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
