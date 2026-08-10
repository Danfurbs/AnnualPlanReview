/**
 * Baseline Page Module
 * Handles UI and interactions for the baseline management page
 */

// Temporary state to hold baseline edits before saving
let baselineEdits = new Map();

/**
 * Open the baseline management page
 */
function openBaselinePage() {
  const dashboardPage = document.getElementById('dashboardPage');
  const forecastPage = document.getElementById('forecastPage');
  const baselinePage = document.getElementById('baselinePage');

  if (dashboardPage) dashboardPage.classList.add('is-hidden');
  if (forecastPage) forecastPage.classList.add('is-hidden');
  if (baselinePage) baselinePage.classList.remove('is-hidden');

  initializeBaselinePage();
}

/**
 * Close the baseline management page
 */
function closeBaselinePage() {
  const dashboardPage = document.getElementById('dashboardPage');
  const baselinePage = document.getElementById('baselinePage');

  if (baselinePage) baselinePage.classList.add('is-hidden');
  if (dashboardPage) dashboardPage.classList.remove('is-hidden');

  // Clear temporary edits
  baselineEdits.clear();
}

/**
 * Initialize the baseline page
 */
async function initializeBaselinePage() {
  // Load baseline data into temporary state (from API if enabled, otherwise localStorage)
  const baselineData = await loadSjnLifetimeTargetDataAsync();
  baselineEdits = new Map(baselineData);

  // Render the table
  renderBaselineTable();

  // Update stats
  updateBaselineStats();

  // Initialize event listeners
  initializeBaselineTableListeners();
}

/**
 * Render the baseline table with all standard jobs
 * Uses DOM APIs to prevent XSS/HTML injection vulnerabilities
 */
function renderBaselineTable() {
  const tableBody = document.getElementById('baselineTableBody');
  if (!tableBody) return;

  // Get all standard jobs
  const allJobs = getStandardJobList();

  // Get search filter
  const searchInput = document.getElementById('baselineSearch');
  const searchText = searchInput ? searchInput.value.toLowerCase() : '';

  // Filter jobs
  const filteredJobs = searchText
    ? allJobs.filter(job =>
        job.jobNumber.toLowerCase().includes(searchText) ||
        job.desc.toLowerCase().includes(searchText)
      )
    : allJobs;

  // Clear existing content
  tableBody.innerHTML = '';

  // Build table rows using DOM APIs
  const fragment = document.createDocumentFragment();

  filteredJobs.forEach(job => {
    const baseline = baselineEdits.get(job.jobNumber) || 0;
    const perPeriod = baseline > 0 ? (baseline / 13).toFixed(2) : '0.00';

    const tr = document.createElement('tr');

    // Job number cell - textContent prevents HTML injection
    const tdJobNumber = document.createElement('td');
    tdJobNumber.textContent = job.jobNumber;
    tr.appendChild(tdJobNumber);

    // Description cell - textContent prevents HTML injection
    const tdDesc = document.createElement('td');
    tdDesc.textContent = job.desc;
    tr.appendChild(tdDesc);

    // Unit cell
    const tdUnit = document.createElement('td');
    tdUnit.textContent = job.unit || 'N/A';
    tr.appendChild(tdUnit);

    // Baseline input cell
    const tdInput = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'baseline-input';
    input.dataset.job = job.jobNumber;
    input.value = baseline;
    input.min = '0';
    input.step = '0.01';
    input.placeholder = '0';
    // Attach event listener instead of inline onchange
    input.addEventListener('change', function() {
      handleBaselineChange(job.jobNumber, this.value);
    });
    tdInput.appendChild(input);
    tr.appendChild(tdInput);

    // Per-period cell
    const tdPerPeriod = document.createElement('td');
    tdPerPeriod.className = 'per-period';
    tdPerPeriod.dataset.job = job.jobNumber;
    tdPerPeriod.textContent = perPeriod;
    tr.appendChild(tdPerPeriod);

    fragment.appendChild(tr);
  });

  tableBody.appendChild(fragment);
}

/**
 * Filter the baseline table based on search input
 */
function filterBaselineTable() {
  renderBaselineTable();
}

/**
 * Handle baseline value change
 * @param {string} jobNumber - The job number
 * @param {string} value - The new baseline value
 */
function handleBaselineChange(jobNumber, value) {
  const numValue = parseFloat(value);

  if (isNaN(numValue) || numValue <= 0) {
    baselineEdits.delete(jobNumber);
  } else {
    baselineEdits.set(jobNumber, numValue);
  }

  // Update per-period display
  updatePerPeriodDisplay(jobNumber);

  // Update stats
  updateBaselineStats();
}

/**
 * Update the per-period display for a specific job
 * Uses safe DOM traversal instead of CSS selector to avoid injection risks
 * @param {string} jobNumber - The job number
 */
function updatePerPeriodDisplay(jobNumber) {
  // Find the per-period cell by iterating through elements
  // This avoids CSS selector injection if jobNumber contains special characters
  const perPeriodCells = document.querySelectorAll('.per-period');
  let perPeriodCell = null;
  for (const cell of perPeriodCells) {
    if (cell.dataset.job === jobNumber) {
      perPeriodCell = cell;
      break;
    }
  }
  if (!perPeriodCell) return;

  const baseline = baselineEdits.get(jobNumber) || 0;
  const perPeriod = baseline > 0 ? (baseline / 13).toFixed(2) : '0.00';

  perPeriodCell.textContent = perPeriod;
}

/**
 * Update baseline statistics
 */
function updateBaselineStats() {
  const jobCountEl = document.getElementById('baselineJobCount');
  const totalValueEl = document.getElementById('baselineTotalValue');

  if (!jobCountEl || !totalValueEl) return;

  const jobCount = baselineEdits.size;
  const totalValue = Array.from(baselineEdits.values()).reduce((sum, val) => sum + val, 0);

  jobCountEl.textContent = jobCount;
  totalValueEl.textContent = totalValue.toFixed(2);
}

/**
 * Save all baseline changes
 */
async function saveBaselineChanges() {
  try {
    await saveSjnLifetimeTargetDataAsync(baselineEdits);
    const apiStatus = window.isApiEnabled && window.isApiEnabled() ? ' (synced to server)' : ' (saved locally)';
    alert('Baseline data saved successfully!' + apiStatus);
    updateBaselineStats();
  } catch (err) {
    console.error('Error saving baseline data:', err);
    alert('Failed to save baseline data. Please try again.');
  }
}

/**
 * Export baseline data as JSON file
 */
function exportSjnLifetimeTargetDataFile() {
  // Load current baseline data from storage
  const baselineData = loadSjnLifetimeTargetData();
  const obj = Object.fromEntries(baselineData);
  const jsonString = JSON.stringify(obj, null, 2);

  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `baseline-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Trigger baseline file import
 */
function triggerBaselineImport() {
  const fileInput = document.getElementById('baselineFileInput');
  if (fileInput) {
    fileInput.click();
  }
}

/**
 * Handle baseline file import
 * @param {Event} event - The file input change event
 */
async function handleBaselineImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target.result;
    try {
      const parsed = JSON.parse(content);
      const baselineData = new Map(Object.entries(parsed));

      // Save to localStorage and API
      await saveSjnLifetimeTargetDataAsync(baselineData);

      const apiStatus = window.isApiEnabled && window.isApiEnabled() ? ' (synced to server)' : ' (saved locally)';
      alert('Baseline data imported successfully!' + apiStatus);
      // Reload the page data
      await initializeBaselinePage();
    } catch (err) {
      console.error('Error importing baseline data:', err);
      alert('Failed to import baseline data. Please check the file format.');
    }
  };
  reader.readAsText(file);

  // Reset file input
  event.target.value = '';
}

/**
 * Clear all baselines
 */
async function clearAllBaselines() {
  if (!confirm('Are you sure you want to clear all baseline data? This cannot be undone.')) {
    return;
  }

  try {
    // Clear from localStorage
    clearSjnLifetimeTargetData();

    // Clear from API if enabled
    if (window.isApiEnabled && window.isApiEnabled() && window.saveBaselinesToApi) {
      await window.saveBaselinesToApi({});
    }

    baselineEdits.clear();
    renderBaselineTable();
    updateBaselineStats();

    const apiStatus = window.isApiEnabled && window.isApiEnabled() ? ' (synced to server)' : '';
    alert('All baseline data cleared!' + apiStatus);
  } catch (err) {
    console.error('Error clearing baseline data:', err);
    alert('Failed to clear baseline data. Please try again.');
  }
}

/**
 * Get standard job list (utility function)
 * @returns {Array} List of standard jobs with jobNumber, desc, unit
 */
function getStandardJobList() {
  if (!window.stdJobs) return [];

  const jobs = [];
  for (const [jobNumber, jobData] of window.stdJobs.entries()) {
    jobs.push({
      jobNumber,
      desc: jobData.desc || 'N/A',
      unit: jobData.unit || 'N/A',
      disc: jobData.disc || 'N/A'
    });
  }

  // Sort by job number
  jobs.sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));

  return jobs;
}

/**
 * Handle paste events on the baseline table
 * Supports multi-row paste for job numbers and baseline values
 */
function handleBaselineTablePaste(event) {
  const target = event.target;

  // Only handle paste on baseline input fields
  if (!target || !target.matches('.baseline-input')) {
    return;
  }

  const clipboard = event.clipboardData?.getData('text');
  if (!clipboard) return;

  const rows = clipboard.replace(/\r/g, '').split('\n').filter(line => line.length);
  if (!rows.length) return;

  const parsed = rows.map(row => row.split('\t'));

  // Single value paste - allow default behavior
  if (parsed.length === 1 && parsed[0].length === 1) {
    return;
  }

  event.preventDefault();

  // Get all currently displayed job numbers in table order
  const tableBody = document.getElementById('baselineTableBody');
  if (!tableBody) return;

  const tableRows = Array.from(tableBody.querySelectorAll('tr'));
  const currentRowIndex = tableRows.findIndex(row =>
    row.querySelector('.baseline-input') === target
  );

  if (currentRowIndex < 0) return;

  // Process each pasted row
  parsed.forEach((rowData, rowOffset) => {
    const targetRowIndex = currentRowIndex + rowOffset;
    if (targetRowIndex >= tableRows.length) return; // No more rows to paste into

    const tableRow = tableRows[targetRowIndex];
    const jobNumber = tableRow.querySelector('td:first-child')?.textContent?.trim();
    if (!jobNumber) return;

    // Determine what to paste based on number of columns
    let baselineValue;

    if (rowData.length === 1) {
      // Single column: just the baseline value
      baselineValue = rowData[0];
    } else if (rowData.length >= 2) {
      // Two columns: assume job number + baseline value (like copy from Excel)
      // Use the second column as the baseline value
      baselineValue = rowData[1];
    }

    // Update the baseline value
    const numValue = parseFloat(baselineValue);
    if (!isNaN(numValue) && numValue >= 0) {
      if (numValue === 0) {
        baselineEdits.delete(jobNumber);
      } else {
        baselineEdits.set(jobNumber, numValue);
      }

      // Update the input field
      const input = tableRow.querySelector('.baseline-input');
      if (input) {
        input.value = numValue;
      }

      // Update per-period display
      updatePerPeriodDisplay(jobNumber);
    }
  });

  // Update stats
  updateBaselineStats();

  console.log(`✓ Pasted ${parsed.length} baseline values`);
}

/**
 * Initialize baseline table event listeners
 */
function initializeBaselineTableListeners() {
  const tableBody = document.getElementById('baselineTableBody');
  if (tableBody) {
    // Remove existing listener if any
    tableBody.removeEventListener('paste', handleBaselineTablePaste);
    // Add paste listener
    tableBody.addEventListener('paste', handleBaselineTablePaste);
  }

  // Search/filter with debouncing
  const searchInput = document.getElementById('baselineSearch');
  if (searchInput && window.debounce) {
    const debouncedFilter = window.debounce(filterBaselineTable, 300);
    searchInput.removeEventListener('input', debouncedFilter); // Clean up if re-initializing
    searchInput.addEventListener('input', debouncedFilter);
  }
}
