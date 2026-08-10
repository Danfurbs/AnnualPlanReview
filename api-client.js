/**
 * API Client
 * Handles communication with the backend API
 */

// Configuration
const IS_RENDER_HOST = window.location.hostname.endsWith('onrender.com');
const API_CONFIG = {
  baseUrl: window.location.origin, // Will be overridden by loadApiConfig()
  enabled: true, // Set to true to use backend API, false to use localStorage only
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  forceServerPersistence: IS_RENDER_HOST
};

/**
 * Check if API mode is enabled
 */
function isApiEnabled() {
  return API_CONFIG.enabled;
}

/**
 * Get current API base URL
 */
function getApiBaseUrl() {
  return API_CONFIG.baseUrl;
}

/**
 * Set API base URL
 */
function setApiBaseUrl(url) {
  // Remove trailing slash if present
  API_CONFIG.baseUrl = url.replace(/\/$/, '');
  localStorage.setItem('aprApiBaseUrl', API_CONFIG.baseUrl);
  console.log(`API base URL set to: ${API_CONFIG.baseUrl}`);
}

/**
 * Toggle API mode
 */
function toggleApiMode(enabled) {
  if (API_CONFIG.forceServerPersistence && enabled === false) {
    console.warn('API mode cannot be disabled on Render-hosted environments.');
    return;
  }
  API_CONFIG.enabled = enabled;
  localStorage.setItem('aprApiEnabled', JSON.stringify(enabled));
  console.log(`API mode ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Load API configuration from localStorage
 */
function loadApiConfig() {
  try {
    // Load enabled status
    const savedEnabled = localStorage.getItem('aprApiEnabled');
    if (savedEnabled !== null) {
      API_CONFIG.enabled = JSON.parse(savedEnabled);
    }

    if (API_CONFIG.forceServerPersistence) {
      API_CONFIG.enabled = true;
      localStorage.setItem('aprApiEnabled', JSON.stringify(true));
    }

    // Load base URL
    const savedBaseUrl = localStorage.getItem('aprApiBaseUrl');
    if (savedBaseUrl) {
      API_CONFIG.baseUrl = savedBaseUrl;
      console.log(`Loaded API base URL: ${API_CONFIG.baseUrl}`);
    } else {
      // Default to current origin
      console.log(`Using default API base URL: ${API_CONFIG.baseUrl}`);
    }
  } catch (err) {
    console.warn('Failed to load API config:', err);
  }
}

// Load config on startup
loadApiConfig();

/**
 * In-flight request tracking for deduplication
 * Key: `${method}:${endpoint}:${bodyHash}` -> Promise
 */
const inFlightRequests = new Map();
const forecastRevisions = new Map();
let reviewRevision = 0;

/**
 * Generate a cache key for request deduplication
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {string|undefined} body - Stringified request body
 * @returns {string} - Cache key
 */
function getRequestCacheKey(method, endpoint, body) {
  // Use body string directly for hashing (simple but effective for JSON)
  const bodyKey = body || '';
  return `${method}:${endpoint}:${bodyKey}`;
}

/**
 * Calculate retry delay with jitter to avoid thundering herd
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} - Delay in milliseconds with jitter applied
 */
function getRetryDelayWithJitter(attempt) {
  const baseDelay = API_CONFIG.retryDelay * Math.pow(2, attempt);
  // Add jitter: random value between -25% and +25% of base delay
  const jitter = baseDelay * (Math.random() * 0.5 - 0.25);
  return Math.max(0, Math.round(baseDelay + jitter));
}

/**
 * Determine whether a failed request should be retried.
 * Retries are limited to network/server issues and specific transient HTTP statuses.
 * @param {number|null} status - HTTP status code when available
 * @returns {boolean}
 */
function shouldRetryRequest(status) {
  if (status == null) return true; // network or fetch-level failure
  if (status >= 500) return true; // server-side transient errors
  return status === 408 || status === 429; // timeout / rate limit
}

/**
 * Try to parse API error response body safely.
 * @param {Response} response
 * @returns {Promise<string|null>}
 */
async function parseApiErrorMessage(response) {
  try {
    const payload = await response.clone().json();
    if (payload && typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }
  } catch {
    // No-op: response may not be JSON
  }
  return null;
}

/**
 * Generic API request handler with retry logic and deduplication
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_CONFIG.baseUrl}/api${endpoint}`;
  const method = options.method || 'GET';
  const config = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  let bodyString;
  if (options.body && typeof options.body === 'object') {
    bodyString = JSON.stringify(options.body);
    config.body = bodyString;
  }

  // Request deduplication: check for identical in-flight request
  const cacheKey = getRequestCacheKey(method, endpoint, bodyString);
  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) {
    // Return the same promise for duplicate in-flight requests
    return existingRequest;
  }

  // Create the request promise and track it
  const requestPromise = (async () => {
    let lastError;
    let lastStatus = null;
    let attemptsMade = 0;
    for (let attempt = 0; attempt < API_CONFIG.retryAttempts; attempt++) {
      let timeoutId;
      attemptsMade = attempt + 1;
      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

        // Create a fresh config for each attempt with new signal
        const attemptConfig = { ...config, signal: controller.signal };

        const response = await fetch(url, attemptConfig);

        if (!response.ok) {
          const errorDetail = await parseApiErrorMessage(response);
          const reason = errorDetail || response.statusText || 'Request failed';
          const err = new Error(`HTTP ${response.status}: ${reason}`);
          err.status = response.status;
          throw err;
        }

        return await response.json();
      } catch (err) {
        lastError = err;
        lastStatus = typeof err.status === 'number' ? err.status : null;

        if (err.name === 'AbortError') {
          err.message = `Request timed out after ${API_CONFIG.timeout}ms`;
        }

        const canRetry = shouldRetryRequest(lastStatus);
        if (attempt < API_CONFIG.retryAttempts - 1 && canRetry) {
          const delay = getRetryDelayWithJitter(attempt);
          console.warn(`API request ${method} ${endpoint} failed, retrying in ${delay}ms...`, err.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (!canRetry) {
          break;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // Create descriptive error with endpoint and method, preserving original cause
    const errorMessage = `API request failed: ${method} ${endpoint} - ${lastError.message}`;
    console.error(`${errorMessage} (after ${attemptsMade} attempt${attemptsMade === 1 ? '' : 's'})`);

    // Use Error cause if supported (ES2022+), otherwise attach as property
    let finalError;
    try {
      finalError = new Error(errorMessage, { cause: lastError });
    } catch {
      // Fallback for older environments that don't support cause option
      finalError = new Error(errorMessage);
      finalError.cause = lastError;
    }
    finalError.endpoint = endpoint;
    finalError.method = method;
    finalError.status = lastStatus;

    throw finalError;
  })();

  // Track the in-flight request
  inFlightRequests.set(cacheKey, requestPromise);

  // Clean up tracking when request completes (success or failure)
  requestPromise.finally(() => {
    inFlightRequests.delete(cacheKey);
  });

  return requestPromise;
}

// ========== Forecast API Functions ==========

/**
 * Valid period keys for forecast data
 */
const VALID_PERIOD_KEYS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13'];

/**
 * Validate serialized forecast data before sending to API
 * @param {*} serialized - The serialized forecast data to validate
 * @returns {{ valid: boolean, error?: string }} - Validation result
 */
function validateSerializedForecastData(serialized) {
  // Check that serialized is a non-null object (not array)
  if (!serialized || typeof serialized !== 'object' || Array.isArray(serialized)) {
    return { valid: false, error: 'Serialized data must be a non-null object' };
  }

  const jobNumbers = Object.keys(serialized);

  // Empty object is valid (no jobs to save)
  if (jobNumbers.length === 0) {
    return { valid: true };
  }

  for (const jobNumber of jobNumbers) {
    // Job number must be a non-empty string
    if (typeof jobNumber !== 'string' || jobNumber.trim() === '') {
      return { valid: false, error: `Invalid job number: must be a non-empty string` };
    }

    const jobData = serialized[jobNumber];

    // Job data must be a non-null object
    if (!jobData || typeof jobData !== 'object' || Array.isArray(jobData)) {
      return { valid: false, error: `Job ${jobNumber}: data must be a non-null object` };
    }

    // Validate 'wgs' (workgroups) - required field
    if (!jobData.wgs || typeof jobData.wgs !== 'object' || Array.isArray(jobData.wgs)) {
      return { valid: false, error: `Job ${jobNumber}: 'wgs' must be a non-null object` };
    }

    // Validate each workgroup's period values
    for (const [wgName, wgData] of Object.entries(jobData.wgs)) {
      if (!wgData || typeof wgData !== 'object' || Array.isArray(wgData)) {
        return { valid: false, error: `Job ${jobNumber}, workgroup '${wgName}': period data must be a non-null object` };
      }

      // Check that period values are numbers
      for (const [periodKey, periodValue] of Object.entries(wgData)) {
        if (!VALID_PERIOD_KEYS.includes(periodKey)) {
          return { valid: false, error: `Job ${jobNumber}, workgroup '${wgName}': invalid period key '${periodKey}'` };
        }
        if (typeof periodValue !== 'number' || !Number.isFinite(periodValue)) {
          return { valid: false, error: `Job ${jobNumber}, workgroup '${wgName}': period ${periodKey} must be a finite number` };
        }
      }
    }

    // Validate 'periods' if present (aggregated totals) - optional but must be valid if present
    if (jobData.periods !== undefined) {
      if (!jobData.periods || typeof jobData.periods !== 'object' || Array.isArray(jobData.periods)) {
        return { valid: false, error: `Job ${jobNumber}: 'periods' must be a non-null object if present` };
      }

      for (const [periodKey, periodValue] of Object.entries(jobData.periods)) {
        if (!VALID_PERIOD_KEYS.includes(periodKey)) {
          return { valid: false, error: `Job ${jobNumber}: invalid period key '${periodKey}' in periods` };
        }
        if (typeof periodValue !== 'number' || !Number.isFinite(periodValue)) {
          return { valid: false, error: `Job ${jobNumber}: period ${periodKey} must be a finite number` };
        }
      }
    }

    // Validate 'comments' if present - optional but must be valid if present
    if (jobData.comments !== undefined) {
      if (!jobData.comments || typeof jobData.comments !== 'object' || Array.isArray(jobData.comments)) {
        return { valid: false, error: `Job ${jobNumber}: 'comments' must be a non-null object if present` };
      }
    }
  }

  return { valid: true };
}

/**
 * Load forecast from API
 * @param {string} year - Fiscal year
 * @param {string} planVersion - Plan version (v0, v1)
 * @returns {Promise<Object|null>} - { data: Map, rowCount, savedAt } or null
 */
async function loadForecastFromApi(year, planVersion) {
  if (!isApiEnabled()) return null;

  try {
    const response = await apiRequest(`/forecasts/${year}/${planVersion}`);

    if (response.success && response.data) {
      forecastRevisions.set(`${year}:${planVersion}`, response.revision || 0);
      const hydrated = window.hydrateForecastData(response.data);
      return {
        data: hydrated,
        rowCount: response.rowCount || hydrated.size,
        savedAt: response.savedAt || new Date().toISOString()
      };
    }

    return null;
  } catch (err) {
    console.warn('Failed to load forecast from API:', err);
    return null;
  }
}

/**
 * Save forecast to API
 * @param {Map} forecastData - Forecast data map
 * @param {number} rowCount - Number of rows
 * @param {string} year - Fiscal year
 * @param {string} planVersion - Plan version
 * @returns {Promise<boolean>} - Success status
 */
async function saveForecastToApi(forecastData, rowCount, year, planVersion) {
  if (!isApiEnabled()) return false;

  const endpoint = `/forecasts/${year}/${planVersion}`;

  try {
    const serialized = window.serializeForecastData(forecastData);

    // Validate serialized data before sending to API
    const validation = validateSerializedForecastData(serialized);
    if (!validation.valid) {
      const errorMsg = `Failed to save forecast: ${validation.error}`;
      console.error(`Forecast validation failed for POST ${endpoint}:`, validation.error);

      // Surface error to user via Toast (non-blocking)
      if (window.Toast && typeof window.Toast.error === 'function') {
        window.Toast.error(errorMsg);
      }

      return false;
    }

    const response = await apiRequest(endpoint, {
      method: 'POST',
      body: { data: serialized, expectedRevision: forecastRevisions.get(`${year}:${planVersion}`) ?? 0 }
    });
    if (response.success) forecastRevisions.set(`${year}:${planVersion}`, response.revision);
    return response.success === true;
  } catch (err) {
    if (err.status === 409) window.Toast?.error('This forecast changed in another session. Reload before saving again.');
    console.error(`Failed to save forecast to API (POST ${endpoint}):`, err);
    return false;
  }
}

/** Save one edited job without replacing the entire financial-year snapshot. */
async function saveForecastJobToApi(jobNumber, forecastData, year, planVersion) {
  if (!isApiEnabled()) return false;
  const endpoint = `/forecasts/${year}/${planVersion}/job/${encodeURIComponent(jobNumber)}`;
  const validation = validateSerializedForecastData({ [jobNumber]: forecastData });
  if (!validation.valid) {
    window.Toast?.error(`Failed to save forecast: ${validation.error}`);
    return false;
  }
  try {
    const response = await apiRequest(endpoint, { method: 'POST', body: forecastData });
    if (response.success) forecastRevisions.set(`${year}:${planVersion}`, response.revision);
    return response.success === true;
  } catch (err) {
    console.error(`Failed to save forecast job to API (POST ${endpoint}):`, err);
    return false;
  }
}

/**
 * Load v1 overrides from API
 * @param {string} year - Fiscal year
 * @returns {Promise<Set>} - Set of job numbers with v1 overrides
 */
async function loadV1OverridesFromApi(year) {
  if (!isApiEnabled()) return new Set();

  try {
    const response = await apiRequest(`/forecasts/v1-overrides/${year}`);

    if (response.success && Array.isArray(response.data)) {
      return new Set(response.data);
    }

    return new Set();
  } catch (err) {
    console.warn('Failed to load v1 overrides from API:', err);
    return new Set();
  }
}

/**
 * Save v1 overrides to API
 * @param {string} year - Fiscal year
 * @param {Set} overridesSet - Set of job numbers
 * @returns {Promise<boolean>} - Success status
 */
async function saveV1OverridesToApi(year, overridesSet) {
  if (!isApiEnabled()) return false;

  try {
    const jobNumbers = Array.from(overridesSet);

    // The batch endpoint replaces the complete set, including with an empty
    // set when a V1 plan is deleted.
    const response = await apiRequest(`/forecasts/v1-overrides/${year}/batch`, {
      method: 'POST',
      body: { jobNumbers }
    });

    return response.success === true;
  } catch (err) {
    console.error('Failed to save v1 overrides to API:', err);
    return false;
  }
}

/** Permanently replace one server-side plan version with an empty snapshot. */
async function deleteForecastVersionFromApi(year, planVersion) {
  if (!isApiEnabled()) return false;
  // Refresh the revision before the destructive replacement. This preserves
  // optimistic concurrency protection instead of deleting from stale state.
  const current = await loadForecastFromApi(year, planVersion);
  if (!current) return false;
  const deleted = await saveForecastToApi(new Map(), 0, year, planVersion);
  if (!deleted) return false;
  if (planVersion === 'v1') return saveV1OverridesToApi(year, new Set());
  return true;
}

// ========== Baseline API Functions ==========

/**
 * Load all baselines from API
 * @returns {Promise<Object|null>} - { jobNumber: totalValue, ... } or null
 */
async function loadBaselinesFromApi() {
  if (!isApiEnabled()) return null;

  try {
    const response = await apiRequest('/baselines');

    if (response.success && response.data) {
      return response.data;
    }

    return null;
  } catch (err) {
    console.warn('Failed to load baselines from API:', err);
    return null;
  }
}

/**
 * Save all baselines to API
 * @param {Object} baselines - { jobNumber: totalValue, ... }
 * @returns {Promise<boolean>} - Success status
 */
async function saveBaselinesToApi(baselines) {
  if (!isApiEnabled()) return false;

  try {
    const response = await apiRequest('/baselines', {
      method: 'POST',
      body: baselines
    });

    return response.success === true;
  } catch (err) {
    console.error('Failed to save baselines to API:', err);
    return false;
  }
}

/**
 * Save single baseline to API
 * @param {string} jobNumber - Job number
 * @param {number} totalValue - Total baseline value
 * @returns {Promise<boolean>} - Success status
 */
async function saveBaselineToApi(jobNumber, totalValue) {
  if (!isApiEnabled()) return false;

  try {
    const response = await apiRequest(`/baselines/${jobNumber}`, {
      method: 'POST',
      body: { value: totalValue }
    });

    return response.success === true;
  } catch (err) {
    console.error('Failed to save baseline to API:', err);
    return false;
  }
}

/**
 * Delete baseline from API
 * @param {string} jobNumber - Job number
 * @returns {Promise<boolean>} - Success status
 */
async function deleteBaselineFromApi(jobNumber) {
  if (!isApiEnabled()) return false;

  try {
    const response = await apiRequest(`/baselines/${jobNumber}`, {
      method: 'DELETE'
    });

    return response.success === true;
  } catch (err) {
    console.error('Failed to delete baseline from API:', err);
    return false;
  }
}

// ========== Comment API Functions ==========

function normalizeCommentForApi(comment, fallbackJobNumber = '') {
  const raw = (comment && typeof comment === 'object') ? comment : {};
  const normalized = {
    ...raw,
    jobNumber: String(raw.jobNumber || fallbackJobNumber || '').trim(),
    evidenceLinks: Array.isArray(raw.evidenceLinks)
      ? raw.evidenceLinks.map(link => String(link || '').trim()).filter(Boolean)
      : []
  };

  const optionalFieldMaxLengths = {
    owner: 120,
    rootCause: 2000,
    correctiveAction: 2000,
    dueDate: 30
  };

  Object.entries(optionalFieldMaxLengths).forEach(([field, maxLength]) => {
    if (normalized[field] === undefined || normalized[field] === null) return;
    const value = String(normalized[field]).trim();
    if (!value) {
      delete normalized[field];
      return;
    }
    normalized[field] = value.slice(0, maxLength);
  });

  if (typeof normalized.category === 'string') {
    normalized.category = normalized.category.trim().slice(0, 50);
  }
  if (typeof normalized.text === 'string') {
    normalized.text = normalized.text.trim().slice(0, 5000);
  }

  return normalized;
}



/**
 * Load all job comments from API
 * @returns {Promise<Object|null>} - { jobNumber: [comments], ... } or null
 */
async function loadJobCommentsFromApi() {
  if (!isApiEnabled()) return null;

  try {
    const response = await apiRequest('/comments');

    if (response.success && response.data) {
      return response.data;
    }

    return null;
  } catch (err) {
    console.warn('Failed to load comments from API:', err);
    return null;
  }
}

/**
 * Save single comment to API
 * @param {Object} comment - Comment object
 * @returns {Promise<boolean>} - Success status
 */
async function saveCommentToApi(comment) {
  if (!isApiEnabled()) return false;

  try {
    const response = await apiRequest('/comments', {
      method: 'POST',
      body: normalizeCommentForApi(comment)
    });

    return response.success === true;
  } catch (err) {
    console.error('Failed to save comment to API:', err);
    return false;
  }
}

/**
 * Save multiple comments to API
 * @param {Object} commentStore - { jobNumber: [comments], ... }
 * @returns {Promise<boolean>} - Success status
 */
async function saveCommentsToApi(commentStore) {
  if (!isApiEnabled()) return false;

  try {
    const normalizedCommentStore = Object.fromEntries(
      Object.entries(commentStore || {}).map(([jobNumber, comments]) => [
        jobNumber,
        (Array.isArray(comments) ? comments : []).map(comment => normalizeCommentForApi(comment, jobNumber))
      ])
    );

    const response = await apiRequest('/comments/bulk', {
      method: 'POST',
      body: { commentStore: normalizedCommentStore }
    });

    const ok = response.success === true;
    if (ok && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('apr:comments-saved', {
        detail: {
          count: response.count || 0,
          durationMs: response.durationMs ?? null
        }
      }));
    }
    return ok;
  } catch (err) {
    console.error('Failed to save comments to API:', err);
    return false;
  }
}

/**
 * Delete comment from API
 * @param {string} commentId - Comment ID
 * @returns {Promise<boolean>} - Success status
 */
async function deleteCommentFromApi(commentId) {
  if (!isApiEnabled()) return false;

  try {
    const response = await apiRequest(`/comments/${commentId}`, {
      method: 'DELETE'
    });

    return response.success === true;
  } catch (err) {
    console.error('Failed to delete comment from API:', err);
    return false;
  }
}


async function loadWorkOrderAmendmentsFromApi() {
  if (!isApiEnabled()) return null;
  try {
    const response = await apiRequest('/work-order-amendments');
    return response.success && response.data ? response.data : {};
  } catch (err) {
    console.warn('Failed to load work order amendments from API:', err);
    return null;
  }
}

async function saveWorkOrderAmendmentsToApi(data) {
  if (!isApiEnabled()) return false;
  try {
    const response = await apiRequest('/work-order-amendments', {
      method: 'POST',
      body: { data: data || {} }
    });
    return response.success === true;
  } catch (err) {
    console.error('Failed to save work order amendments to API:', err);
    return false;
  }
}

async function loadPublicGroupsFromApi() {
  if (!isApiEnabled()) return [];
  try {
    const response = await apiRequest('/groups');
    return response.success && Array.isArray(response.data) ? response.data : [];
  } catch (err) {
    console.warn('Failed to load public groups from API:', err);
    return [];
  }
}

async function savePublicGroupToApi(group) {
  if (!isApiEnabled()) return null;
  try {
    const response = await apiRequest('/groups', {
      method: 'POST',
      body: group
    });
    return response.success ? response.data : null;
  } catch (err) {
    console.error('Failed to save public group:', err);
    return null;
  }
}

async function deletePublicGroupFromApi(groupId) {
  if (!isApiEnabled()) return false;
  try {
    const response = await apiRequest(`/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
    return response.success === true;
  } catch (err) {
    console.error('Failed to delete public group:', err);
    return false;
  }
}

async function loadWorkDoneFromApi(year) {
  if (!isApiEnabled()) return null;
  try {
    const response = await apiRequest(`/work-done/${year}`);
    if (!response.success) return null;
    return { data: response.data || {}, uploadedAt: response.uploadedAt || null };
  } catch (err) {
    console.warn('Failed to load work done from API:', err);
    return null;
  }
}

async function saveWorkDoneToApi(year, data) {
  if (!isApiEnabled()) return null;
  try {
    const response = await apiRequest(`/work-done/${year}`, {
      method: 'POST',
      body: { data }
    });
    return response.success ? (response.uploadedAt || new Date().toISOString()) : null;
  } catch (err) {
    console.error('Failed to save work done to API:', err);
    return null;
  }
}

async function deleteWorkDoneForYearFromApi(year) {
  if (!isApiEnabled()) return false;
  try {
    const response = await apiRequest(`/work-done/${year}`, { method: 'DELETE' });
    return response.success === true;
  } catch (err) {
    console.error('Failed to delete work done for fiscal year:', err);
    return false;
  }
}

async function clearAllWorkDoneFromApi() {
  if (!isApiEnabled()) return false;
  try {
    const response = await apiRequest('/work-done', { method: 'DELETE' });
    return response.success === true;
  } catch (err) {
    console.error('Failed to clear all work done snapshots:', err);
    return false;
  }
}


async function loadReviewsFromApi() {
  if (!isApiEnabled()) return null;
  try {
    const response = await apiRequest('/reviews');
    if (response.success) reviewRevision = response.revision || 0;
    return response.success && response.data ? response.data : null;
  } catch (err) {
    console.warn('Failed to load reviews from API:', err);
    return null;
  }
}

async function saveReviewsToApi(reviewStore) {
  if (!isApiEnabled()) return false;
  try {
    const response = await apiRequest('/reviews/bulk', {
      method: 'POST',
      body: { reviewStore: reviewStore || {}, expectedRevision: reviewRevision }
    });
    if (response.success) reviewRevision = response.revision;
    return response.success === true;
  } catch (err) {
    if (err.status === 409) window.Toast?.error('Review statuses changed in another session. Reload before saving again.');
    console.error('Failed to save reviews to API:', err);
    return false;
  }
}
// ========== Health Check ==========

/**
 * Check if API is available
 * @returns {Promise<boolean>}
 */
async function checkApiHealth() {
  try {
    const response = await apiRequest('/health');
    return response.success === true;
  } catch (err) {
    console.warn('API health check failed:', err);
    return false;
  }
}

// Expose API functions globally
window.API_CONFIG = API_CONFIG;
window.isApiEnabled = isApiEnabled;
window.getApiBaseUrl = getApiBaseUrl;
window.setApiBaseUrl = setApiBaseUrl;
window.toggleApiMode = toggleApiMode;
window.checkApiHealth = checkApiHealth;
window.loadForecastFromApi = loadForecastFromApi;
window.saveForecastToApi = saveForecastToApi;
window.saveForecastJobToApi = saveForecastJobToApi;
window.loadV1OverridesFromApi = loadV1OverridesFromApi;
window.saveV1OverridesToApi = saveV1OverridesToApi;
window.deleteForecastVersionFromApi = deleteForecastVersionFromApi;
window.loadBaselinesFromApi = loadBaselinesFromApi;
window.saveBaselinesToApi = saveBaselinesToApi;
window.saveBaselineToApi = saveBaselineToApi;
window.deleteBaselineFromApi = deleteBaselineFromApi;
window.loadJobCommentsFromApi = loadJobCommentsFromApi;
window.saveCommentToApi = saveCommentToApi;
window.saveCommentsToApi = saveCommentsToApi;
window.deleteCommentFromApi = deleteCommentFromApi;
window.loadPublicGroupsFromApi = loadPublicGroupsFromApi;
window.savePublicGroupToApi = savePublicGroupToApi;
window.deletePublicGroupFromApi = deletePublicGroupFromApi;
window.loadWorkDoneFromApi = loadWorkDoneFromApi;
window.saveWorkDoneToApi = saveWorkDoneToApi;
window.deleteWorkDoneForYearFromApi = deleteWorkDoneForYearFromApi;
window.clearAllWorkDoneFromApi = clearAllWorkDoneFromApi;

window.loadReviewsFromApi = loadReviewsFromApi;
window.saveReviewsToApi = saveReviewsToApi;

window.loadWorkOrderAmendmentsFromApi = loadWorkOrderAmendmentsFromApi;
window.saveWorkOrderAmendmentsToApi = saveWorkOrderAmendmentsToApi;
