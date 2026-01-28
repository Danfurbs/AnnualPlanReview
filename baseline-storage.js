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
 * Load baseline data from storage or API (async version)
 * @returns {Promise<Map<string, number>>} Map of job number to baseline value
 */
async function loadBaselineDataAsync() {
  // Try API first if enabled
  if (window.isApiEnabled && window.isApiEnabled() && window.loadBaselinesFromApi) {
    try {
      const apiData = await window.loadBaselinesFromApi();
      if (apiData) {
        const baselineMap = new Map(Object.entries(apiData));
        // Cache in localStorage for offline access
        saveBaselineData(baselineMap);
        return baselineMap;
      }
    } catch (err) {
      console.warn('Failed to load baselines from API, falling back to localStorage:', err);
    }
  }

  // Fall back to localStorage
  return loadBaselineData();
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
 * Save baseline data to storage and API (async version)
 * @param {Map<string, number>} baselineData - Map of job number to baseline value
 * @returns {Promise<void>}
 */
async function saveBaselineDataAsync(baselineData) {
  // Save to localStorage first (always)
  saveBaselineData(baselineData);

  // Also save to API if enabled
  if (window.isApiEnabled && window.isApiEnabled() && window.saveBaselinesToApi) {
    try {
      const obj = Object.fromEntries(baselineData);
      await window.saveBaselinesToApi(obj);
    } catch (err) {
      console.warn('Failed to save baselines to API (data saved locally):', err);
    }
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
 * Set baseline value for a specific job (async version)
 * @param {string} jobNumber - The job number
 * @param {number} value - The baseline value
 * @returns {Promise<void>}
 */
async function setBaselineAsync(jobNumber, value) {
  const baselineData = loadBaselineData();

  if (value === 0 || value === null || value === undefined || value === '') {
    baselineData.delete(jobNumber);

    // Delete from API if enabled
    if (window.isApiEnabled && window.isApiEnabled() && window.deleteBaselineFromApi) {
      try {
        await window.deleteBaselineFromApi(jobNumber);
      } catch (err) {
        console.warn('Failed to delete baseline from API (deleted locally):', err);
      }
    }
  } else {
    baselineData.set(jobNumber, Number(value));

    // Save to API if enabled
    if (window.isApiEnabled && window.isApiEnabled() && window.saveBaselineToApi) {
      try {
        await window.saveBaselineToApi(jobNumber, Number(value));
      } catch (err) {
        console.warn('Failed to save baseline to API (saved locally):', err);
      }
    }
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
 * Get cumulative baseline values for a group of jobs (rolled up)
 * @param {string[]} jobNumbers - Array of job numbers in the group
 * @param {number} periodCount - Number of periods (default 13)
 * @returns {number[]} Array of cumulative values per period for the entire group
 */
function getGroupBaselineCumulative(jobNumbers, periodCount = 13) {
  if (!jobNumbers || !jobNumbers.length) {
    return Array(periodCount).fill(0);
  }

  // Sum up all baselines from the group's jobs
  const baselineData = loadBaselineData();
  const totalBaseline = jobNumbers.reduce((sum, jobNumber) => {
    return sum + (baselineData.get(jobNumber) || 0);
  }, 0);

  if (totalBaseline === 0) return Array(periodCount).fill(0);

  const perPeriod = totalBaseline / periodCount;
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
 * Clear all baseline data (sync version - localStorage only)
 */
function clearBaselineData() {
  localStorage.removeItem(BASELINE_STORAGE_KEY);
  return true;
}
