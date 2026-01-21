/**
 * Baseline Storage Module
 * Manages baseline data for Standard Jobs
 * Baseline is a single total value per SJN that applies across all FYs
 */

const BASELINE_STORAGE_KEY = 'aprBaselineDataV1';

/**
 * Load baseline data from localStorage
 * @returns {Map<string, number>} Map of job number to baseline value
 */
function loadBaselineData() {
  try {
    const raw = localStorage.getItem(BASELINE_STORAGE_KEY);
    if (!raw) return new Map();

    const parsed = JSON.parse(raw);
    return new Map(Object.entries(parsed));
  } catch (err) {
    console.error('Error loading baseline data:', err);
    return new Map();
  }
}

/**
 * Save baseline data to localStorage
 * @param {Map<string, number>} baselineData - Map of job number to baseline value
 */
function saveBaselineData(baselineData) {
  try {
    const obj = Object.fromEntries(baselineData);
    localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(obj));
  } catch (err) {
    console.error('Error saving baseline data:', err);
    alert('Failed to save baseline data. Please try again.');
  }
}

/**
 * Get baseline value for a specific job
 * @param {string} jobNumber - The job number
 * @returns {number} The baseline value (0 if not set)
 */
function getBaseline(jobNumber) {
  const baselineData = loadBaselineData();
  return baselineData.get(jobNumber) || 0;
}

/**
 * Set baseline value for a specific job
 * @param {string} jobNumber - The job number
 * @param {number} value - The baseline value
 */
function setBaseline(jobNumber, value) {
  const baselineData = loadBaselineData();

  if (value === 0 || value === null || value === undefined || value === '') {
    baselineData.delete(jobNumber);
  } else {
    baselineData.set(jobNumber, Number(value));
  }

  saveBaselineData(baselineData);
}

/**
 * Get cumulative baseline values for display in charts
 * @param {string} jobNumber - The job number
 * @param {number} periodCount - Number of periods (default 13)
 * @returns {number[]} Array of cumulative values per period
 */
function getBaselineCumulative(jobNumber, periodCount = 13) {
  const baseline = getBaseline(jobNumber);
  if (baseline === 0) return Array(periodCount).fill(0);

  const perPeriod = baseline / periodCount;
  const cumulative = [];

  for (let i = 0; i < periodCount; i++) {
    cumulative.push(perPeriod * (i + 1));
  }

  return cumulative;
}

/**
 * Export baseline data as JSON
 * @returns {string} JSON string of baseline data
 */
function exportBaselineData() {
  const baselineData = loadBaselineData();
  const obj = Object.fromEntries(baselineData);
  return JSON.stringify(obj, null, 2);
}

/**
 * Import baseline data from JSON
 * @param {string} jsonString - JSON string to import
 * @returns {boolean} True if successful, false otherwise
 */
function importBaselineData(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    const baselineData = new Map(Object.entries(parsed));
    saveBaselineData(baselineData);
    return true;
  } catch (err) {
    console.error('Error importing baseline data:', err);
    return false;
  }
}

/**
 * Clear all baseline data
 */
function clearBaselineData() {
  if (confirm('Are you sure you want to clear all baseline data? This cannot be undone.')) {
    localStorage.removeItem(BASELINE_STORAGE_KEY);
    return true;
  }
  return false;
}
