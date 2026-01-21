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
function initializeBaselinePage() {
  // Load baseline data into temporary state
  baselineEdits = new Map(loadBaselineData());

  // Render the table
  renderBaselineTable();

  // Update stats
  updateBaselineStats();
}

/**
 * Render the baseline table with all standard jobs
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

  // Build table rows
  const rows = filteredJobs.map(job => {
    const baseline = baselineEdits.get(job.jobNumber) || 0;
    const perPeriod = baseline > 0 ? (baseline / 13).toFixed(2) : '0.00';

    return `
      <tr>
        <td>${job.jobNumber}</td>
        <td>${job.desc}</td>
        <td>${job.unit || 'N/A'}</td>
        <td>
          <input
            type="number"
            class="baseline-input"
            data-job="${job.jobNumber}"
            value="${baseline}"
            min="0"
            step="0.01"
            onchange="handleBaselineChange('${job.jobNumber}', this.value)"
            placeholder="0"
          >
        </td>
        <td class="per-period" data-job="${job.jobNumber}">${perPeriod}</td>
      </tr>
    `;
  }).join('');

  tableBody.innerHTML = rows;
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
 * @param {string} jobNumber - The job number
 */
function updatePerPeriodDisplay(jobNumber) {
  const perPeriodCell = document.querySelector(`.per-period[data-job="${jobNumber}"]`);
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
function saveBaselineChanges() {
  try {
    saveBaselineData(baselineEdits);
    alert('Baseline data saved successfully!');
    updateBaselineStats();
  } catch (err) {
    console.error('Error saving baseline data:', err);
    alert('Failed to save baseline data. Please try again.');
  }
}

/**
 * Export baseline data as JSON file
 */
function exportBaselineDataFile() {
  // Load current baseline data from storage
  const baselineData = loadBaselineData();
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
function handleBaselineImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    const success = importBaselineData(content);

    if (success) {
      alert('Baseline data imported successfully!');
      // Reload the page data
      initializeBaselinePage();
    } else {
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
function clearAllBaselines() {
  const success = clearBaselineData();
  if (success) {
    baselineEdits.clear();
    renderBaselineTable();
    updateBaselineStats();
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
