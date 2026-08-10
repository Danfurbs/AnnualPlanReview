/**
 * SJN Lifetime Target Storage Module
 * Manages the single lifetime target per Standard Job Number across all FYs.
 */

const SJN_LIFETIME_TARGET_STORAGE_KEY = 'aprSjnLifetimeTargetV1';
const LEGACY_SJN_LIFETIME_TARGET_STORAGE_KEY = 'aprBaselineDataV1';

function migrateLegacySjnLifetimeTargetData() {
  if (!localStorage.getItem(SJN_LIFETIME_TARGET_STORAGE_KEY)) {
    const legacy = localStorage.getItem(LEGACY_SJN_LIFETIME_TARGET_STORAGE_KEY);
    if (legacy) localStorage.setItem(SJN_LIFETIME_TARGET_STORAGE_KEY, legacy);
  }
  localStorage.removeItem(LEGACY_SJN_LIFETIME_TARGET_STORAGE_KEY);
}

/**
 * Load baseline data from localStorage
 * @returns {Map<string, number>} Map of job number to baseline value
 */
function loadSjnLifetimeTargetData() {
  try {
    migrateLegacySjnLifetimeTargetData();
    const raw = localStorage.getItem(SJN_LIFETIME_TARGET_STORAGE_KEY);
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
async function loadSjnLifetimeTargetDataAsync() {
  // Try API first if enabled
  if (window.isApiEnabled && window.isApiEnabled() && window.loadBaselinesFromApi) {
    try {
      const apiData = await window.loadBaselinesFromApi();
      if (apiData) {
        const baselineMap = new Map(Object.entries(apiData));
        // Cache in localStorage for offline access
        saveSjnLifetimeTargetData(baselineMap);
        return baselineMap;
      }
    } catch (err) {
      console.warn('Failed to load baselines from API, falling back to localStorage:', err);
    }
  }

  // Fall back to localStorage
  return loadSjnLifetimeTargetData();
}

/**
 * Save baseline data to localStorage
 * @param {Map<string, number>} baselineData - Map of job number to baseline value
 */
function saveSjnLifetimeTargetData(baselineData) {
  try {
    const obj = Object.fromEntries(baselineData);
    localStorage.setItem(SJN_LIFETIME_TARGET_STORAGE_KEY, JSON.stringify(obj));
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
async function saveSjnLifetimeTargetDataAsync(baselineData) {
  // Save to localStorage first (always)
  saveSjnLifetimeTargetData(baselineData);

  // Also save to API if enabled
  if (window.isApiEnabled && window.isApiEnabled() && window.saveBaselinesToApi) {
    try {
      const obj = Object.fromEntries(baselineData);
      const apiSaved = await window.saveBaselinesToApi(obj);
      if (!apiSaved && window.API_CONFIG?.forceServerPersistence) {
        alert('Server baseline save failed. Local cache updated, but Render database did not confirm the write.');
      }
    } catch (err) {
      console.warn('Failed to save baselines to API (data saved locally):', err);
      if (window.API_CONFIG?.forceServerPersistence) {
        alert('Server baseline save failed. Local cache updated, but Render database did not confirm the write.');
      }
    }
  }
}

/**
 * Get baseline value for a specific job
 * @param {string} jobNumber - The job number
 * @returns {number} The baseline value (0 if not set)
 */
function getSjnLifetimeTarget(jobNumber) {
  const baselineData = loadSjnLifetimeTargetData();
  return baselineData.get(jobNumber) || 0;
}

/**
 * Set baseline value for a specific job
 * @param {string} jobNumber - The job number
 * @param {number} value - The baseline value
 */
function setSjnLifetimeTarget(jobNumber, value) {
  const baselineData = loadSjnLifetimeTargetData();

  if (value === 0 || value === null || value === undefined || value === '') {
    baselineData.delete(jobNumber);
  } else {
    baselineData.set(jobNumber, Number(value));
  }

  saveSjnLifetimeTargetData(baselineData);
}

/**
 * Set baseline value for a specific job (async version)
 * @param {string} jobNumber - The job number
 * @param {number} value - The baseline value
 * @returns {Promise<void>}
 */
async function setSjnLifetimeTargetAsync(jobNumber, value) {
  const baselineData = loadSjnLifetimeTargetData();

  if (value === 0 || value === null || value === undefined || value === '') {
    baselineData.delete(jobNumber);

    // Delete from API if enabled
    if (window.isApiEnabled && window.isApiEnabled() && window.deleteBaselineFromApi) {
      try {
        const deleted = await window.deleteBaselineFromApi(jobNumber);
        if (!deleted && window.API_CONFIG?.forceServerPersistence) {
          alert('Server baseline delete failed. Local cache changed, but Render database delete was not confirmed.');
        }
      } catch (err) {
        console.warn('Failed to delete baseline from API (deleted locally):', err);
        if (window.API_CONFIG?.forceServerPersistence) {
          alert('Server baseline delete failed. Local cache changed, but Render database delete was not confirmed.');
        }
      }
    }
  } else {
    baselineData.set(jobNumber, Number(value));

    // Save to API if enabled
    if (window.isApiEnabled && window.isApiEnabled() && window.saveBaselineToApi) {
      try {
        const apiSaved = await window.saveBaselineToApi(jobNumber, Number(value));
        if (!apiSaved && window.API_CONFIG?.forceServerPersistence) {
          alert('Server baseline save failed. Local cache updated, but Render database did not confirm the write.');
        }
      } catch (err) {
        console.warn('Failed to save baseline to API (saved locally):', err);
        if (window.API_CONFIG?.forceServerPersistence) {
          alert('Server baseline save failed. Local cache updated, but Render database did not confirm the write.');
        }
      }
    }
  }

  saveSjnLifetimeTargetData(baselineData);
}

/**
 * Get cumulative baseline values for display in charts
 * @param {string} jobNumber - The job number
 * @param {number} periodCount - Number of periods (default 13)
 * @returns {number[]} Array of cumulative values per period
 */
function getSjnLifetimeTargetCumulative(jobNumber, periodCount = 13) {
  const baseline = getSjnLifetimeTarget(jobNumber);
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
function getGroupSjnLifetimeTargetCumulative(jobNumbers, periodCount = 13) {
  if (!jobNumbers || !jobNumbers.length) {
    return Array(periodCount).fill(0);
  }

  // Sum up all baselines from the group's jobs
  const baselineData = loadSjnLifetimeTargetData();
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
function exportSjnLifetimeTargetData() {
  const baselineData = loadSjnLifetimeTargetData();
  const obj = Object.fromEntries(baselineData);
  return JSON.stringify(obj, null, 2);
}

/**
 * Import baseline data from JSON
 * @param {string} jsonString - JSON string to import
 * @returns {boolean} True if successful, false otherwise
 */
function importSjnLifetimeTargetData(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    const baselineData = new Map(Object.entries(parsed));
    saveSjnLifetimeTargetData(baselineData);
    return true;
  } catch (err) {
    console.error('Error importing baseline data:', err);
    return false;
  }
}

/**
 * Clear all baseline data (sync version - localStorage only)
 */
function clearSjnLifetimeTargetData() {
  localStorage.removeItem(SJN_LIFETIME_TARGET_STORAGE_KEY);
  return true;
}

window.loadSjnLifetimeTargetData = loadSjnLifetimeTargetData;
window.loadSjnLifetimeTargetDataAsync = loadSjnLifetimeTargetDataAsync;
window.saveSjnLifetimeTargetData = saveSjnLifetimeTargetData;
window.saveSjnLifetimeTargetDataAsync = saveSjnLifetimeTargetDataAsync;
window.getSjnLifetimeTarget = getSjnLifetimeTarget;
window.setSjnLifetimeTarget = setSjnLifetimeTarget;
window.setSjnLifetimeTargetAsync = setSjnLifetimeTargetAsync;
window.getSjnLifetimeTargetCumulative = getSjnLifetimeTargetCumulative;
window.getGroupSjnLifetimeTargetCumulative = getGroupSjnLifetimeTargetCumulative;
window.exportSjnLifetimeTargetData = exportSjnLifetimeTargetData;
window.importSjnLifetimeTargetData = importSjnLifetimeTargetData;
window.clearSjnLifetimeTargetData = clearSjnLifetimeTargetData;
