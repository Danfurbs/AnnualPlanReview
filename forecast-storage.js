/**
 * forecast-storage.js
 * Handles all forecast data persistence (localStorage and file import/export)
 */

const FORECAST_STORAGE_KEY = 'aprForecastDataV1';

/**
 * Generate localStorage key for a forecast
 * Note: Storage is FY-wide (not per-RF stage), indexed by year and plan version only
 */
function getForecastStorageKey(year, planVersion) {
  if (!year || !planVersion) return FORECAST_STORAGE_KEY;
  return `${FORECAST_STORAGE_KEY}:${year}:${planVersion}`;
}

/**
 * Serialize forecast Map to plain object for storage
 */
function serializeForecastData(forecastMap) {
  const output = {};
  if (!forecastMap) return output;
  forecastMap.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

/**
 * Normalize work group code (uppercase, trimmed)
 */
function normalizeWorkGroupCode(code) {
  if (!code || typeof code !== 'string') return code;
  return code.trim().toUpperCase();
}

/**
 * Normalize work group codes in a job's wgs and comments objects
 */
function normalizeJobWorkGroups(job) {
  if (!job) return job;

  // Normalize wgs keys
  if (job.wgs) {
    const normalizedWgs = {};
    Object.entries(job.wgs).forEach(([wgCode, data]) => {
      const normalizedCode = normalizeWorkGroupCode(wgCode);
      // If we already have data for this normalized code, merge it
      if (normalizedWgs[normalizedCode]) {
        Object.entries(data || {}).forEach(([period, value]) => {
          const existing = Number(normalizedWgs[normalizedCode][period] || 0);
          const newValue = Number(value || 0);
          // Keep the non-zero value, or sum if both non-zero
          if (newValue !== 0 && existing === 0) {
            normalizedWgs[normalizedCode][period] = newValue;
          }
        });
      } else {
        normalizedWgs[normalizedCode] = { ...data };
      }
    });
    job.wgs = normalizedWgs;
  }

  // Normalize comments keys
  if (job.comments) {
    const normalizedComments = {};
    Object.entries(job.comments).forEach(([wgCode, comment]) => {
      const normalizedCode = normalizeWorkGroupCode(wgCode);
      // Keep existing comment or use new one if not empty
      if (!normalizedComments[normalizedCode] && comment) {
        normalizedComments[normalizedCode] = comment;
      }
    });
    job.comments = normalizedComments;
  }

  return job;
}

/**
 * Hydrate stored object back to Map (with work group normalization)
 */
function hydrateForecastData(rawData) {
  const output = new Map();
  Object.entries(rawData || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object') {
      // Normalize work group codes when hydrating
      output.set(key, normalizeJobWorkGroups({ ...value }));
    }
  });
  return output;
}

/**
 * Deep clone forecast data Map
 */
function cloneForecastData(forecastMap) {
  const cloned = new Map();
  if (!forecastMap) return cloned;
  forecastMap.forEach((value, key) => {
    const periods = value?.periods ? { ...value.periods } : {};
    const wgs = {};
    Object.entries(value?.wgs || {}).forEach(([wg, data]) => {
      wgs[wg] = { ...data };
    });
    const comments = value?.comments ? { ...value.comments } : {};
    cloned.set(key, { periods, wgs, comments });
  });
  return cloned;
}

/**
 * Load forecast from localStorage
 * Returns: { data: Map, rowCount: number, savedAt: string } or null
 */
function loadForecastFromStorage(year, planVersion) {
  try {
    const raw = localStorage.getItem(getForecastStorageKey(year, planVersion));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const hydrated = hydrateForecastData(parsed.data);
    if (!hydrated.size) return null;

    return {
      data: hydrated,
      rowCount: parsed.rowCount ?? hydrated.size,
      savedAt: parsed.savedAt || null
    };
  } catch (err) {
    console.warn('Failed to load forecast from storage:', err);
    return null;
  }
}

/**
 * Load forecast from storage or API (async version)
 * Returns: { data: Map, rowCount: number, savedAt: string } or null
 */
async function loadForecastFromStorageAsync(year, planVersion) {
  // Try API first if enabled
  if (window.isApiEnabled && window.isApiEnabled() && window.loadForecastFromApi) {
    try {
      const apiData = await window.loadForecastFromApi(year, planVersion);
      if (apiData) {
        // Cache in localStorage for offline access
        saveForecastToStorage(apiData.data, apiData.rowCount, year, planVersion);
        return apiData;
      }
    } catch (err) {
      console.warn('Failed to load from API, falling back to localStorage:', err);
    }
  }

  // Fall back to localStorage
  return loadForecastFromStorage(year, planVersion);
}

/**
 * Get v1 overrides storage key (tracks which jobs have been explicitly edited in v1)
 */
function getV1OverridesKey(year) {
  return `${FORECAST_STORAGE_KEY}:${year}:v1-overrides`;
}

/**
 * Load v1 overrides (job numbers that have been explicitly edited in v1)
 */
function loadV1Overrides(year) {
  try {
    const raw = localStorage.getItem(getV1OverridesKey(year));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    console.warn('Failed to load v1 overrides:', err);
    return new Set();
  }
}

/**
 * Load v1 overrides from storage or API (async version)
 */
async function loadV1OverridesAsync(year) {
  // Try API first if enabled
  if (window.isApiEnabled && window.isApiEnabled() && window.loadV1OverridesFromApi) {
    try {
      const apiData = await window.loadV1OverridesFromApi(year);
      if (apiData && apiData.size > 0) {
        // Cache in localStorage
        saveV1Overrides(year, apiData);
        return apiData;
      }
    } catch (err) {
      console.warn('Failed to load v1 overrides from API, falling back to localStorage:', err);
    }
  }

  // Fall back to localStorage
  return loadV1Overrides(year);
}

/**
 * Save v1 overrides
 */
function saveV1Overrides(year, overridesSet) {
  try {
    const arr = Array.from(overridesSet);
    localStorage.setItem(getV1OverridesKey(year), JSON.stringify(arr));
  } catch (err) {
    console.warn('Failed to save v1 overrides:', err);
  }
}

/**
 * Save v1 overrides to storage and API (async version)
 */
async function saveV1OverridesAsync(year, overridesSet) {
  // Save to localStorage first (always)
  saveV1Overrides(year, overridesSet);

  // Also save to API if enabled
  if (window.isApiEnabled && window.isApiEnabled() && window.saveV1OverridesToApi) {
    try {
      await window.saveV1OverridesToApi(year, overridesSet);
    } catch (err) {
      console.warn('Failed to save v1 overrides to API (data saved locally):', err);
    }
  }
}

/**
 * Add job numbers to v1 overrides (marks them as explicitly edited in v1)
 */
function addToV1Overrides(year, jobNumbers) {
  const overrides = loadV1Overrides(year);
  jobNumbers.forEach(jn => overrides.add(jn));
  saveV1Overrides(year, overrides);
}

/**
 * Remove job numbers from v1 overrides (allows them to inherit from v0 again)
 */
function removeFromV1Overrides(year, jobNumbers) {
  const overrides = loadV1Overrides(year);
  jobNumbers.forEach(jn => overrides.delete(jn));
  saveV1Overrides(year, overrides);
}

/**
 * Check if v0 changes would overwrite v1 edits
 * Returns array of job numbers that have v1 overrides
 */
function checkV0ConflictsWithV1(year, jobNumbers) {
  const overrides = loadV1Overrides(year);
  return jobNumbers.filter(jn => overrides.has(jn));
}

/**
 * Save forecast to localStorage
 */
function saveForecastToStorage(forecastData, rowCount, year, planVersion) {
  try {
    if (!year || !planVersion) {
      console.warn('Missing year or plan version; skipping save.');
      return false;
    }

    const payload = {
      data: serializeForecastData(forecastData || new Map()),
      rowCount: rowCount ?? null,
      savedAt: new Date().toISOString()
    };

    localStorage.setItem(getForecastStorageKey(year, planVersion), JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn('Failed to save forecast to storage:', err);
    return false;
  }
}

/**
 * Save forecast to storage and API (async version)
 */
async function saveForecastToStorageAsync(forecastData, rowCount, year, planVersion) {
  // Save to localStorage first (always)
  const localSuccess = saveForecastToStorage(forecastData, rowCount, year, planVersion);

  // Also save to API if enabled
  if (window.isApiEnabled && window.isApiEnabled() && window.saveForecastToApi) {
    try {
      await window.saveForecastToApi(forecastData, rowCount, year, planVersion);
    } catch (err) {
      console.warn('Failed to save to API (data saved locally):', err);
    }
  }

  return localSuccess;
}

/**
 * Load forecast from library (FORECAST_LIBRARY global)
 * Note: Library structure is FY > planVersion (no stage nesting)
 */
function loadForecastFromLibrary(year, planVersion) {
  try {
    if (!year || !planVersion) return null;
    if (typeof FORECAST_LIBRARY === 'undefined' || !FORECAST_LIBRARY) return null;

    // New structure: FORECAST_LIBRARY[year][planVersion] (no stage)
    const entry = FORECAST_LIBRARY?.[year]?.[planVersion];
    if (!entry || !entry.data) return null;

    const hydrated = hydrateForecastData(entry.data);
    if (!hydrated.size) return null;

    return {
      data: hydrated,
      rowCount: entry.rowCount ?? hydrated.size,
      source: 'library'
    };
  } catch (err) {
    console.warn('Failed to load forecast from library:', err);
    return null;
  }
}

/**
 * Load forecast from GitHub URL (async)
 * Fetches forecast JSON from configured GitHub raw URL
 */
async function loadForecastFromGitHub(year, planVersion) {
  try {
    if (!year || !planVersion) return null;
    if (typeof window.GITHUB_FORECAST_URLS === 'undefined') return null;

    // Check if URL is configured for this year/version
    const url = window.GITHUB_FORECAST_URLS?.[year]?.[planVersion];
    if (!url) return null;

    console.log(`Fetching forecast from GitHub: ${year} ${planVersion}...`);

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`GitHub fetch failed (${response.status}): ${url}`);
      return null;
    }

    const json = await response.json();
    if (!json || typeof json !== 'object') {
      console.warn('Invalid JSON from GitHub:', url);
      return null;
    }

    // Handle two possible formats:
    // 1. Full export format: { forecasts: { [year]: { [planVersion]: { data, rowCount } } } }
    // 2. Direct format: { data: {...}, rowCount: N }
    let forecastData, rowCount;

    if (json.forecasts?.[year]?.[planVersion]) {
      // Full export format
      forecastData = json.forecasts[year][planVersion].data;
      rowCount = json.forecasts[year][planVersion].rowCount;
    } else if (json.data) {
      // Direct format
      forecastData = json.data;
      rowCount = json.rowCount;
    } else {
      console.warn('Unrecognized forecast format from GitHub:', url);
      return null;
    }

    const hydrated = hydrateForecastData(forecastData);
    if (!hydrated.size) return null;

    console.log(`✓ Loaded forecast from GitHub: ${year} ${planVersion} (${hydrated.size} jobs)`);

    return {
      data: hydrated,
      rowCount: rowCount ?? hydrated.size,
      source: 'github'
    };
  } catch (err) {
    console.warn('Failed to load forecast from GitHub:', err);
    return null;
  }
}

/**
 * Load forecast from library with GitHub support (async)
 * Tries GitHub first, then falls back to FORECAST_LIBRARY global
 */
async function loadForecastFromLibraryAsync(year, planVersion) {
  // Try GitHub first if configured
  const githubData = await loadForecastFromGitHub(year, planVersion);
  if (githubData) return githubData;

  // Fall back to local FORECAST_LIBRARY
  return loadForecastFromLibrary(year, planVersion);
}

/**
 * Get forecast data from storage or library (storage takes precedence)
 */
function getForecastSnapshot(year, planVersion) {
  if (!year || !planVersion) return null;

  // Try localStorage first
  const cached = loadForecastFromStorage(year, planVersion);
  if (cached) return cached;

  // Fall back to library
  return loadForecastFromLibrary(year, planVersion);
}

/**
 * Get forecast data from storage/API, GitHub, or library (async version)
 * Priority: API (if enabled) > localStorage > GitHub > FORECAST_LIBRARY
 */
async function getForecastSnapshotAsync(year, planVersion) {
  if (!year || !planVersion) return null;

  // Try API/localStorage (API checked first if enabled)
  const cached = await loadForecastFromStorageAsync(year, planVersion);
  if (cached) return cached;

  // Try GitHub or library
  return await loadForecastFromLibraryAsync(year, planVersion);
}

/**
 * Initialize v1 from v0 if v1 doesn't exist
 * Returns the initialized data or null
 */
function initializeV1FromV0(year) {
  if (!year) return null;

  // Check if v1 already exists
  const v1Snapshot = getForecastSnapshot(year, 'v1');
  if (v1Snapshot) return null;

  // Get v0 data
  const v0Snapshot = getForecastSnapshot(year, 'v0');
  if (!v0Snapshot || !v0Snapshot.data?.size) return null;

  // Clone v0 to v1
  const clonedData = cloneForecastData(v0Snapshot.data);
  saveForecastToStorage(clonedData, clonedData.size, year, 'v1');

  console.log(`✓ Plan v1 initialized from v0 for ${year}`);
  return {
    data: clonedData,
    rowCount: clonedData.size,
    savedAt: new Date().toISOString()
  };
}

/**
 * Export forecast to JSON file
 * Format: { exportedAt, forecasts: { [year]: { [planVersion]: { data, rowCount, savedAt } } } }
 */
function exportForecastFile(year, planVersion, forecastData, rowCount) {
  if (!year || !planVersion || !forecastData) {
    alert('Missing forecast data to export.');
    return;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 'v2', // Simplified format (FY-wide, no stage nesting)
    forecasts: {
      [year]: {
        [planVersion]: {
          data: serializeForecastData(forecastData),
          rowCount: rowCount ?? forecastData.size,
          savedAt: new Date().toISOString()
        }
      }
    }
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `forecast-${year}-${planVersion}-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);

  console.log(`✓ Forecast exported: ${year} ${planVersion}`);
}

/**
 * Import forecast from JSON file
 * Handles both old (stage-nested) and new (FY-wide) formats
 */
function importForecastFile(fileContent) {
  try {
    const parsed = JSON.parse(fileContent);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JSON format');
    }

    let importedCount = 0;
    const forecasts = parsed.forecasts || parsed;

    Object.entries(forecasts).forEach(([year, yearData]) => {
      if (!yearData || typeof yearData !== 'object') return;

      Object.entries(yearData).forEach(([planVersion, planData]) => {
        if (!planData || typeof planData !== 'object') return;

        // Handle old format (stage-nested)
        if (planData.RF3 || planData.RF6 || planData.RF9 || planData.RF11) {
          console.warn(`Legacy stage-based format detected for ${year} ${planVersion}. Using first available stage.`);
          const firstStage = ['RF3', 'RF6', 'RF9', 'RF11'].find(stage => planData[stage]);
          if (firstStage && planData[firstStage].data) {
            const hydrated = hydrateForecastData(planData[firstStage].data);
            saveForecastToStorage(hydrated, planData[firstStage].rowCount, year, planVersion);
            importedCount++;
          }
        } else if (planData.data) {
          // New format (FY-wide)
          const hydrated = hydrateForecastData(planData.data);
          saveForecastToStorage(hydrated, planData.rowCount, year, planVersion);
          importedCount++;
        }
      });
    });

    console.log(`✓ Imported ${importedCount} forecast(s)`);
    return { success: true, count: importedCount };
  } catch (err) {
    console.error('Failed to import forecast file:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get period totals for a specific job
 */
function getForecastPeriodsForJob(forecastData, jobNumber) {
  if (!forecastData || !jobNumber) return {};
  const job = forecastData.get(jobNumber);
  return job?.periods || {};
}

/**
 * Get work group data for a specific job
 */
function getForecastWorkGroupData(forecastData, jobNumber, workGroup) {
  if (!forecastData || !jobNumber || !workGroup) return {};
  const job = forecastData.get(jobNumber);
  return job?.wgs?.[workGroup] || {};
}

/**
 * Get forecast comment for a specific job and work group
 */
function getForecastComment(forecastData, jobNumber, workGroup) {
  if (!forecastData || !jobNumber || !workGroup) return '';
  const job = forecastData.get(jobNumber);
  return job?.comments?.[workGroup] || '';
}

/**
 * Update forecast data for a work group
 * This merges work group data and recalculates period totals
 */
function updateForecastWorkGroup(forecastData, rows, workGroup) {
  if (!forecastData) forecastData = new Map();
  if (!workGroup || !Array.isArray(rows)) return forecastData;

  rows.forEach(row => {
    const jobNumber = String(row.jobNumber || '').trim();
    if (!jobNumber) return;

    // Get or create job entry
    if (!forecastData.has(jobNumber)) {
      forecastData.set(jobNumber, { periods: {}, wgs: {}, comments: {} });
    }
    const job = forecastData.get(jobNumber);

    // Ensure comments object exists
    if (!job.comments) job.comments = {};

    // Update work group data
    job.wgs[workGroup] = {};
    window.FORECAST_PERIODS.forEach(period => {
      const value = Number(row.volumes?.[period] || 0);
      // Save all values including 0
      job.wgs[workGroup][period] = value;
    });

    // Save comment for this work group
    if (row.comment) {
      job.comments[workGroup] = row.comment;
    } else {
      delete job.comments[workGroup];
    }

    // Recalculate period totals from all work groups
    const totals = {};
    Object.values(job.wgs).forEach(wgData => {
      window.FORECAST_PERIODS.forEach(period => {
        totals[period] = (totals[period] || 0) + (Number(wgData?.[period]) || 0);
      });
    });
    job.periods = totals;
  });

  return forecastData;
}

/**
 * Remove empty jobs from forecast data
 */
function cleanForecastData(forecastData) {
  if (!forecastData) return forecastData;

  const toDelete = [];
  forecastData.forEach((job, jobNumber) => {
    const hasVolumes = Object.values(job.wgs || {}).some(wgData => {
      return window.FORECAST_PERIODS.some(period => {
        const val = wgData?.[period];
        return val !== undefined && val !== null && val !== '';
      });
    });
    const hasComments = job.comments && Object.keys(job.comments).length > 0;

    if (!hasVolumes && !hasComments) {
      toDelete.push(jobNumber);
    }
  });

  toDelete.forEach(jobNumber => forecastData.delete(jobNumber));
  return forecastData;
}

// Expose functions globally for cross-module access
window.getForecastStorageKey = getForecastStorageKey;
window.serializeForecastData = serializeForecastData;
window.hydrateForecastData = hydrateForecastData;
window.cloneForecastData = cloneForecastData;
window.loadForecastFromStorage = loadForecastFromStorage;
window.loadForecastFromStorageAsync = loadForecastFromStorageAsync;
window.saveForecastToStorage = saveForecastToStorage;
window.saveForecastToStorageAsync = saveForecastToStorageAsync;
window.loadForecastFromLibrary = loadForecastFromLibrary;
window.loadForecastFromGitHub = loadForecastFromGitHub;
window.loadForecastFromLibraryAsync = loadForecastFromLibraryAsync;
window.getForecastSnapshot = getForecastSnapshot;
window.getForecastSnapshotAsync = getForecastSnapshotAsync;
window.initializeV1FromV0 = initializeV1FromV0;
window.exportForecastFile = exportForecastFile;
window.importForecastFile = importForecastFile;
window.getForecastPeriodsForJob = getForecastPeriodsForJob;
window.getForecastWorkGroupData = getForecastWorkGroupData;
window.getForecastComment = getForecastComment;
window.updateForecastWorkGroup = updateForecastWorkGroup;
window.cleanForecastData = cleanForecastData;
window.loadV1Overrides = loadV1Overrides;
window.loadV1OverridesAsync = loadV1OverridesAsync;
window.saveV1Overrides = saveV1Overrides;
window.saveV1OverridesAsync = saveV1OverridesAsync;
window.addToV1Overrides = addToV1Overrides;
window.removeFromV1Overrides = removeFromV1Overrides;
window.checkV0ConflictsWithV1 = checkV0ConflictsWithV1;
window.normalizeWorkGroupCode = normalizeWorkGroupCode;
window.normalizeJobWorkGroups = normalizeJobWorkGroups;

