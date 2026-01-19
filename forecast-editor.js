/**
 * forecast-editor.js
 * Forecast editor UI and interaction logic
 */

// Use shared globals from forecast-globals.js
const FORECAST_PERIODS = window.FORECAST_PERIODS;
const PLAN_VERSIONS = window.PLAN_VERSIONS;

/**
 * Create an empty forecast row
 */
function createForecastEditorRow() {
  const volumes = {};
  FORECAST_PERIODS.forEach(period => {
    volumes[period] = 0;
  });

  return {
    jobNumber: '',
    desc: '',
    unit: '',
    volumes
  };
}

/**
 * Open the forecast editor page
 */
function openForecastEditor() {
  const dashboardPage = document.getElementById('dashboardPage');
  const forecastPage = document.getElementById('forecastPage');

  if (dashboardPage) dashboardPage.classList.add('is-hidden');
  if (forecastPage) forecastPage.classList.remove('is-hidden');

  initializeForecastEditor();
}

/**
 * Close the forecast editor page
 */
function closeForecastEditor() {
  const dashboardPage = document.getElementById('dashboardPage');
  const forecastPage = document.getElementById('forecastPage');

  if (forecastPage) forecastPage.classList.add('is-hidden');
  if (dashboardPage) dashboardPage.classList.remove('is-hidden');
}

/**
 * Initialize forecast editor (load data and render)
 */
function initializeForecastEditor() {
  // Set initial context
  window.forecastEditorState.year = window.currentFinancialYear || getFinancialYearOptions()[0] || 'FY27';
  window.forecastEditorState.planVersion = window.currentPlanVersion || 'v0';

  // Load forecast for this context
  const snapshot = getForecastSnapshot(window.forecastEditorState.year, window.forecastEditorState.planVersion);
  if (snapshot) {
    window.fData = snapshot.data;
  }

  // Render selectors and table
  renderForecastEditorSelectors();
  renderForecastEditorTable();
  updateForecastEditorSummary();
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
  planSelect.innerHTML = PLAN_VERSIONS
    .map(plan => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.label)}</option>`)
    .join('');
  window.forecastEditorState.planVersion = PLAN_VERSIONS.some(plan => plan.id === window.forecastEditorState.planVersion)
    ? window.forecastEditorState.planVersion
    : (window.currentPlanVersion || 'v0');
  planSelect.value = window.forecastEditorState.planVersion;

  // Work group selector
  const workGroupOptions = getAllWorkGroupSetNames();
  workGroupSelect.innerHTML = workGroupOptions
    .map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
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
 * Load forecast editor rows from current forecast data
 */
function loadForecastEditorRows() {
  const workGroup = window.forecastEditorState.workGroup;
  const rows = [];

  if (window.fData && workGroup) {
    window.fData.forEach((job, jobNumber) => {
      const wgData = job?.wgs?.[workGroup];
      if (!wgData) return;

      const meta = getJobMetadata(jobNumber);
      const volumes = {};
      FORECAST_PERIODS.forEach(period => {
        volumes[period] = Number(wgData[period] || 0);
      });

      rows.push({
        jobNumber,
        desc: meta?.desc || '',
        unit: meta?.unit || '',
        volumes
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
        ${FORECAST_PERIODS.map(period => `<th>${period}</th>`).join('')}
        <th>Total</th>
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
            ${FORECAST_PERIODS.map(period => {
              const value = Number(row.volumes?.[period] || 0);
              const baselineValue = getBaselineValue(baselineMap, row.jobNumber, workGroup, period);
              const isChanged = baselineMap && row.jobNumber && value !== Number(baselineValue || 0);
              return `
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    class="forecast-period-input${isChanged ? ' is-changed' : ''}"
                    data-row="${index}"
                    data-period="${period}"
                    value="${value ? value : ''}"
                  >
                </td>
              `;
            }).join('')}
            <td class="forecast-total-cell" data-role="row-total" data-row="${index}">${formatForecastNumber(rowTotal)}</td>
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
        ${FORECAST_PERIODS.map(period => (
          `<td class="forecast-total-cell" data-role="period-total" data-period="${period}">${formatForecastNumber(totals.periodTotals[period])}</td>`
        )).join('')}
        <td class="forecast-total-cell" data-role="grand-total">${formatForecastNumber(totals.grandTotal)}</td>
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
  FORECAST_PERIODS.forEach(period => {
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

  FORECAST_PERIODS.forEach(period => {
    periodTotals[period] = 0;
  });

  window.forecastEditorState.rows.forEach(row => {
    FORECAST_PERIODS.forEach(period => {
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
  window.forecastEditorState.rows = Array.from({ length: 5 }, () => createForecastEditorRow());
  renderForecastEditorTable();
  updateForecastEditorSummary();

  const statusEl = document.getElementById('forecastEditorStatus');
  if (statusEl) statusEl.textContent = 'Table cleared (not saved).';
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

  // Filter out empty rows
  const rowsToSave = window.forecastEditorState.rows.filter(row => {
    if (!row.jobNumber) return false;
    const hasVolume = FORECAST_PERIODS.some(period => Number(row.volumes?.[period] || 0) !== 0);
    return hasVolume;
  });

  if (!rowsToSave.length) {
    alert('No forecast data to save. Add job numbers and volumes first.');
    return;
  }

  // Update forecast data
  window.fData = updateForecastWorkGroup(window.fData, rowsToSave, window.forecastEditorState.workGroup);

  // Clean up empty jobs
  window.fData = cleanForecastData(window.fData);

  // Save to localStorage
  const saved = saveForecastToStorage(window.fData, window.fData.size, window.forecastEditorState.year, window.forecastEditorState.planVersion);

  if (saved) {
    const statusEl = document.getElementById('forecastEditorStatus');
    if (statusEl) {
      statusEl.textContent = `✓ Saved ${rowsToSave.length} jobs for ${window.forecastEditorState.workGroup} at ${new Date().toLocaleTimeString()}`;
    }
    console.log(`✓ Forecast saved: ${window.forecastEditorState.year} ${window.forecastEditorState.planVersion} (${rowsToSave.length} jobs)`);
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

    rows[index] = {
      jobNumber,
      desc: meta?.desc || '',
      unit: meta?.unit || '',
      volumes
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
    FORECAST_PERIODS.forEach(period => {
      window.forecastEditorState.rows[rowIndex].volumes[period] = Number(existingVolumes[period] || 0);
    });

    // Update DOM
    const descCell = rowEl.querySelector('[data-role="desc"]');
    const unitCell = rowEl.querySelector('[data-role="unit"]');
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
      const value = Number(window.forecastEditorState.rows[rowIndex].volumes[period] || 0);
      input.value = value ? value : '';
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
  FORECAST_PERIODS.forEach(period => {
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
  if (!target || !target.matches('input[data-period]')) return;

  const clipboard = event.clipboardData?.getData('text');
  if (!clipboard) return;

  const rows = clipboard.replace(/\r/g, '').split('\n').filter(line => line.length);
  if (!rows.length) return;

  const parsed = rows.map(row => row.split('\t'));
  if (parsed.length === 1 && parsed[0].length === 1) return;

  event.preventDefault();

  const startRowIndex = Number(target.dataset.row);
  const startPeriodIndex = FORECAST_PERIODS.indexOf(target.dataset.period);
  if (!Number.isFinite(startRowIndex) || startPeriodIndex < 0) return;

  // Ensure enough rows exist
  const requiredRows = startRowIndex + parsed.length;
  while (window.forecastEditorState.rows.length < requiredRows) {
    window.forecastEditorState.rows.push(createForecastEditorRow());
  }

  // Paste data
  parsed.forEach((rowData, rowOffset) => {
    const rowIndex = startRowIndex + rowOffset;
    rowData.forEach((cellValue, colOffset) => {
      const periodIndex = startPeriodIndex + colOffset;
      if (periodIndex >= FORECAST_PERIODS.length) return;

      const period = FORECAST_PERIODS[periodIndex];
      const value = parseFloat(cellValue);
      window.forecastEditorState.rows[rowIndex].volumes[period] = Number.isFinite(value) ? value : 0;
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

  window.forecastEditorState.rows.splice(rowIndex, 1);

  // Ensure at least 1 empty row
  if (!window.forecastEditorState.rows.length) {
    window.forecastEditorState.rows.push(createForecastEditorRow());
  }

  renderForecastEditorTable();
  updateForecastEditorSummary();
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
 * Download forecast file
 */
function downloadForecastFile() {
  downloadForecastEditorExport();
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
});
