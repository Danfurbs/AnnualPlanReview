/**
 * forecast-storage.js
 * Handles all forecast data persistence (localStorage and file import/export)
 */

const FORECAST_STORAGE_KEY = 'aprForecastDataV1';
const FORECAST_PERIODS = window.FORECAST_PERIODS;

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
 * Hydrate stored object back to Map
 */
function hydrateForecastData(rawData) {
  const output = new Map();
  Object.entries(rawData || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object') {
      output.set(key, value);
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
    cloned.set(key, { periods, wgs });
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
      forecastData.set(jobNumber, { periods: {}, wgs: {} });
    }
    const job = forecastData.get(jobNumber);

    // Update work group data
    job.wgs[workGroup] = {};
    FORECAST_PERIODS.forEach(period => {
      const value = Number(row.volumes?.[period] || 0);
      if (value) {
        job.wgs[workGroup][period] = value;
      }
    });

    // Recalculate period totals from all work groups
    const totals = {};
    Object.values(job.wgs).forEach(wgData => {
      FORECAST_PERIODS.forEach(period => {
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
    const hasData = Object.values(job.wgs || {}).some(wgData => {
      return FORECAST_PERIODS.some(period => Number(wgData?.[period] || 0) !== 0);
    });
    if (!hasData) {
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
window.saveForecastToStorage = saveForecastToStorage;
window.loadForecastFromLibrary = loadForecastFromLibrary;
window.getForecastSnapshot = getForecastSnapshot;
window.initializeV1FromV0 = initializeV1FromV0;
window.exportForecastFile = exportForecastFile;
window.importForecastFile = importForecastFile;
window.getForecastPeriodsForJob = getForecastPeriodsForJob;
window.getForecastWorkGroupData = getForecastWorkGroupData;
window.updateForecastWorkGroup = updateForecastWorkGroup;
window.cleanForecastData = cleanForecastData;

