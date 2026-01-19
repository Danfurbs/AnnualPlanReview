/**
 * forecast-state.js
 * Manages forecast context (FY, RF stage, plan version) and global state
 */

const REVIEW_STAGES = ['RF3', 'RF6', 'RF9', 'RF11'];
const DEFAULT_FINANCIAL_YEARS = ['FY27', 'FY28', 'FY29', 'FY30'];
const PLAN_VERSIONS = [
  { id: 'v0', label: 'Plan v0' },
  { id: 'v1', label: 'Plan v1' }
];

const REVIEW_STAGE_KEY = 'aprReviewStageV1';
const FINANCIAL_YEAR_KEY = 'aprFinancialYearV1';
const PLAN_VERSION_KEY = 'aprPlanVersionV1';

// Global forecast context
let currentReviewStage = null;
let currentFinancialYear = null;
let currentPlanVersion = 'v1';

// Global forecast data (Map of job numbers to {periods, wgs})
let fData = null;

/**
 * Initialize context from localStorage
 */
function initializeForecastContext() {
  // Load saved stage
  const savedStage = localStorage.getItem(REVIEW_STAGE_KEY);
  if (REVIEW_STAGES.includes(savedStage)) {
    currentReviewStage = savedStage;
  }

  // Load saved year
  const savedYear = localStorage.getItem(FINANCIAL_YEAR_KEY);
  if (savedYear) {
    currentFinancialYear = savedYear;
  }

  // Load saved plan version
  const savedPlan = localStorage.getItem(PLAN_VERSION_KEY);
  if (savedPlan && PLAN_VERSIONS.some(plan => plan.id === savedPlan)) {
    currentPlanVersion = savedPlan;
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

  currentReviewStage = stage;
  currentFinancialYear = year || currentFinancialYear;

  // Auto-select plan version based on availability
  currentPlanVersion = getPreferredPlanVersion(currentFinancialYear);

  if (persist) {
    localStorage.setItem(REVIEW_STAGE_KEY, stage);
    if (currentFinancialYear) {
      localStorage.setItem(FINANCIAL_YEAR_KEY, currentFinancialYear);
    }
    if (currentPlanVersion) {
      localStorage.setItem(PLAN_VERSION_KEY, currentPlanVersion);
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

  currentReviewStage = stage;
  currentFinancialYear = year || currentFinancialYear;
  currentPlanVersion = planVersion || currentPlanVersion;

  if (persist) {
    localStorage.setItem(REVIEW_STAGE_KEY, stage);
    if (currentFinancialYear) {
      localStorage.setItem(FINANCIAL_YEAR_KEY, currentFinancialYear);
    }
    if (currentPlanVersion) {
      localStorage.setItem(PLAN_VERSION_KEY, currentPlanVersion);
    }
  }

  return true;
}

/**
 * Get current context
 */
function getCurrentContext() {
  return {
    stage: currentReviewStage,
    year: currentFinancialYear,
    planVersion: currentPlanVersion
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

  const current = currentFinancialYear ? [currentFinancialYear] : [];
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
  if (!year) return currentPlanVersion || 'v1';

  const availability = getForecastAvailability(year);
  if (availability.v1) return 'v1';
  if (availability.v0) return 'v0';
  return currentPlanVersion || 'v1';
}

/**
 * Load forecast for current context
 * Tries: localStorage > library > initialize v1 from v0
 */
function loadForecastForCurrentContext() {
  if (!currentFinancialYear || !currentPlanVersion) {
    console.warn('Cannot load forecast: missing year or plan version');
    fData = null;
    return null;
  }

  // Try localStorage first
  const cached = loadForecastFromStorage(currentFinancialYear, currentPlanVersion);
  if (cached) {
    fData = cached.data;
    console.log(`✓ Forecast loaded from storage: ${currentFinancialYear} ${currentPlanVersion} (${cached.savedAt || 'unknown date'})`);
    return cached;
  }

  // Try library
  const library = loadForecastFromLibrary(currentFinancialYear, currentPlanVersion);
  if (library) {
    fData = library.data;
    console.log(`✓ Forecast loaded from library: ${currentFinancialYear} ${currentPlanVersion}`);
    return library;
  }

  // Auto-initialize v1 from v0 if needed
  if (currentPlanVersion === 'v1') {
    const initialized = initializeV1FromV0(currentFinancialYear);
    if (initialized) {
      fData = initialized.data;
      return initialized;
    }
  }

  // No forecast available
  fData = null;
  console.log(`No forecast available for ${currentFinancialYear} ${currentPlanVersion}`);
  return null;
}

/**
 * Save current forecast data
 */
function saveCurrentForecast(rowCount) {
  if (!fData) {
    console.warn('No forecast data to save');
    return false;
  }

  if (!currentFinancialYear || !currentPlanVersion) {
    console.warn('Cannot save forecast: missing year or plan version');
    return false;
  }

  return saveForecastToStorage(fData, rowCount, currentFinancialYear, currentPlanVersion);
}

/**
 * Get all work group set names from forecast and work done data
 */
function getAllWorkGroupSetNames() {
  const names = new Set();

  // From work group sets mapping (if available)
  if (typeof workGroupSets !== 'undefined' && workGroupSets) {
    workGroupSets.forEach(value => {
      if (value) names.add(value);
    });
  }

  // From forecast data
  if (fData) {
    fData.forEach(job => {
      Object.keys(job.wgs || {}).forEach(wg => {
        if (wg) names.add(wg);
      });
    });
  }

  // From work done data (if available)
  if (typeof wData !== 'undefined' && wData) {
    wData.forEach(job => {
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

  [fData, typeof wData !== 'undefined' ? wData : null].forEach(source => {
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

  if (typeof stdJobs !== 'undefined' && stdJobs && stdJobs.size) {
    stdJobs.forEach((meta, jobNumber) => {
      list.push({
        jobNumber,
        desc: meta.desc || `Job ${jobNumber}`,
        unit: meta.unit || ''
      });
    });
  } else {
    // Fallback: get from forecast and work done data
    const numbers = new Set();
    [fData, typeof wData !== 'undefined' ? wData : null].forEach(source => {
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
  if (typeof stdJobs !== 'undefined' && stdJobs) {
    const stdMeta = stdJobs.get(jobNumber);
    if (stdMeta) return stdMeta;
  }

  // Try current jobs map
  if (typeof currentJobsMap !== 'undefined' && currentJobsMap) {
    const currentMeta = currentJobsMap.get(jobNumber);
    if (currentMeta) return currentMeta;
  }

  return {};
}
