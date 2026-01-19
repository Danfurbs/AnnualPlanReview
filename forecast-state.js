/**
 * forecast-state.js
 * Manages forecast context (FY, RF stage, plan version) and global state
 */

// Use shared globals from forecast-globals.js
const REVIEW_STAGES = window.REVIEW_STAGES;
const DEFAULT_FINANCIAL_YEARS = window.DEFAULT_FINANCIAL_YEARS;
const PLAN_VERSIONS = window.PLAN_VERSIONS;

const REVIEW_STAGE_KEY = 'aprReviewStageV1';
const FINANCIAL_YEAR_KEY = 'aprFinancialYearV1';
const PLAN_VERSION_KEY = 'aprPlanVersionV1';

/**
 * Initialize context from localStorage
 */
function initializeForecastContext() {
  // Load saved stage
  const savedStage = localStorage.getItem(REVIEW_STAGE_KEY);
  if (REVIEW_STAGES.includes(savedStage)) {
    window.currentReviewStage = savedStage;
  }

  // Load saved year
  const savedYear = localStorage.getItem(FINANCIAL_YEAR_KEY);
  if (savedYear) {
    window.currentFinancialYear = savedYear;
  }

  // Load saved plan version
  const savedPlan = localStorage.getItem(PLAN_VERSION_KEY);
  if (savedPlan && PLAN_VERSIONS.some(plan => plan.id === savedPlan)) {
    window.currentPlanVersion = savedPlan;
  }
}

/**
 * Set review context (auto-selects plan version)
 */
function setReviewContext(stage, year, { persist = true } = {}) {
  if (!REVIEW_STAGES.includes(stage)) {
    console.warn(`Invalid stage: ${stage}`);
    return false;
  }

  window.currentReviewStage = stage;
  window.currentFinancialYear = year || window.currentFinancialYear;

  // Auto-select plan version based on availability
  window.currentPlanVersion = getPreferredPlanVersion(window.currentFinancialYear);

  if (persist) {
    localStorage.setItem(REVIEW_STAGE_KEY, stage);
    if (window.currentFinancialYear) {
      localStorage.setItem(FINANCIAL_YEAR_KEY, window.currentFinancialYear);
    }
    if (window.currentPlanVersion) {
      localStorage.setItem(PLAN_VERSION_KEY, window.currentPlanVersion);
    }
  }

  return true;
}

/**
 * Set forecast context (explicit plan version control)
 */
function setForecastContext(stage, year, planVersion, { persist = true } = {}) {
  if (!REVIEW_STAGES.includes(stage)) {
    console.warn(`Invalid stage: ${stage}`);
    return false;
  }

  if (planVersion && !PLAN_VERSIONS.some(plan => plan.id === planVersion)) {
    console.warn(`Invalid plan version: ${planVersion}`);
    return false;
  }

  window.currentReviewStage = stage;
  window.currentFinancialYear = year || window.currentFinancialYear;
  window.currentPlanVersion = planVersion || window.currentPlanVersion;

  if (persist) {
    localStorage.setItem(REVIEW_STAGE_KEY, stage);
    if (window.currentFinancialYear) {
      localStorage.setItem(FINANCIAL_YEAR_KEY, window.currentFinancialYear);
    }
    if (window.currentPlanVersion) {
      localStorage.setItem(PLAN_VERSION_KEY, window.currentPlanVersion);
    }
  }

  return true;
}

/**
 * Get current context
 */
function getCurrentContext() {
  return {
    stage: window.currentReviewStage,
    year: window.currentFinancialYear,
    planVersion: window.currentPlanVersion
  };
}

/**
 * Get available financial years (from library + defaults)
 */
function getFinancialYearOptions() {
  const libraryYears = (() => {
    if (typeof FORECAST_LIBRARY === 'undefined' || !FORECAST_LIBRARY) return [];
    return Object.keys(FORECAST_LIBRARY);
  })();

  const current = window.currentFinancialYear ? [window.currentFinancialYear] : [];
  const combined = Array.from(new Set([...libraryYears, ...DEFAULT_FINANCIAL_YEARS, ...current]));
  return combined.length ? combined.sort() : DEFAULT_FINANCIAL_YEARS;
}

/**
 * Get forecast availability for a year
 */
function getForecastAvailability(year) {
  return {
    v1: Boolean(getForecastSnapshot(year, 'v1')),
    v0: Boolean(getForecastSnapshot(year, 'v0'))
  };
}

/**
 * Get preferred plan version based on availability
 * Preference order: v1 > v0 > current
 */
function getPreferredPlanVersion(year) {
  if (!year) return window.currentPlanVersion || 'v0';

  const availability = getForecastAvailability(year);
  if (availability.v1) return 'v1';
  if (availability.v0) return 'v0';
  return window.currentPlanVersion || 'v0';
}

/**
 * Load forecast for current context
 * Tries: localStorage > library > initialize v1 from v0
 */
function loadForecastForCurrentContext() {
  if (!window.currentFinancialYear || !window.currentPlanVersion) {
    console.warn('Cannot load forecast: missing year or plan version');
    window.fData = null;
    return null;
  }

  // Try localStorage first
  const cached = loadForecastFromStorage(window.currentFinancialYear, window.currentPlanVersion);
  if (cached) {
    window.fData = cached.data;
    console.log(`✓ Forecast loaded from storage: ${window.currentFinancialYear} ${window.currentPlanVersion} (${cached.savedAt || 'unknown date'})`);
    return cached;
  }

  // Try library
  const library = loadForecastFromLibrary(window.currentFinancialYear, window.currentPlanVersion);
  if (library) {
    window.fData = library.data;
    console.log(`✓ Forecast loaded from library: ${window.currentFinancialYear} ${window.currentPlanVersion}`);
    return library;
  }

  // Auto-initialize v1 from v0 if needed
  if (window.currentPlanVersion === 'v1') {
    const initialized = initializeV1FromV0(window.currentFinancialYear);
    if (initialized) {
      window.fData = initialized.data;
      return initialized;
    }
  }

  // No forecast available
  window.fData = null;
  console.log(`No forecast available for ${window.currentFinancialYear} ${window.currentPlanVersion}`);
  return null;
}

/**
 * Save current forecast data
 */
function saveCurrentForecast(rowCount) {
  if (!window.fData) {
    console.warn('No forecast data to save');
    return false;
  }

  if (!window.currentFinancialYear || !window.currentPlanVersion) {
    console.warn('Cannot save forecast: missing year or plan version');
    return false;
  }

  return saveForecastToStorage(window.fData, rowCount, window.currentFinancialYear, window.currentPlanVersion);
}

/**
 * Get all work group set names from forecast and work done data
 */
function getAllWorkGroupSetNames() {
  const names = new Set();

  // From work group sets mapping (if available)
  if (typeof window.workGroupSets !== 'undefined' && window.workGroupSets) {
    window.workGroupSets.forEach(value => {
      if (value) names.add(value);
    });
  }

  // From forecast data
  if (window.fData) {
    window.fData.forEach(job => {
      Object.keys(job.wgs || {}).forEach(wg => {
        if (wg) names.add(wg);
      });
    });
  }

  // From work done data (if available)
  if (typeof window.wData !== 'undefined' && window.wData) {
    window.wData.forEach(job => {
      Object.keys(job.wgs || {}).forEach(wg => {
        if (wg) names.add(wg);
      });
    });
  }

  if (!names.size) names.add('Unspecified');
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Get job numbers for a specific work group set
 */
function getJobNumbersForWorkGroupSet(workGroup) {
  const numbers = new Set();
  if (!workGroup) return numbers;

  [window.fData, typeof window.wData !== 'undefined' ? window.wData : null].forEach(source => {
    if (!source) return;
    source.forEach((job, jobNumber) => {
      if (job?.wgs?.[workGroup]) numbers.add(jobNumber);
    });
  });

  return numbers;
}

/**
 * Get standard job list
 */
function getStandardJobList() {
  const list = [];

  if (typeof window.stdJobs !== 'undefined' && window.stdJobs && window.stdJobs.size) {
    window.stdJobs.forEach((meta, jobNumber) => {
      list.push({
        jobNumber,
        desc: meta.desc || `Job ${jobNumber}`,
        unit: meta.unit || ''
      });
    });
  } else {
    // Fallback: get from forecast and work done data
    const numbers = new Set();
    [window.fData, typeof window.wData !== 'undefined' ? window.wData : null].forEach(source => {
      if (!source) return;
      source.forEach((_, jobNumber) => numbers.add(jobNumber));
    });
    numbers.forEach(jobNumber => {
      list.push({ jobNumber, desc: `Job ${jobNumber}`, unit: '' });
    });
  }

  return list.sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
}

/**
 * Get metadata for a specific job
 */
function getJobMetadata(jobNumber) {
  if (!jobNumber) return {};

  // Try standard jobs lookup
  if (typeof window.stdJobs !== 'undefined' && window.stdJobs) {
    const stdMeta = window.stdJobs.get(jobNumber);
    if (stdMeta) return stdMeta;
  }

  // Try current jobs map
  if (typeof window.currentJobsMap !== 'undefined' && window.currentJobsMap) {
    const currentMeta = window.currentJobsMap.get(jobNumber);
    if (currentMeta) return currentMeta;
  }

  return {};
}
