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
      body: { data: serialized }
    });

    return response.success === true;
  } catch (err) {
    console.error(`Failed to save forecast to API (POST ${endpoint}):`, err);
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

    if (jobNumbers.length === 0) return true;

    // Use batch endpoint instead of individual requests
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
      body: comment
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
    const response = await apiRequest('/comments/bulk', {
      method: 'POST',
      body: { commentStore }
    });

    return response.success === true;
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
window.loadV1OverridesFromApi = loadV1OverridesFromApi;
window.saveV1OverridesToApi = saveV1OverridesToApi;
window.loadBaselinesFromApi = loadBaselinesFromApi;
window.saveBaselinesToApi = saveBaselinesToApi;
window.saveBaselineToApi = saveBaselineToApi;
window.deleteBaselineFromApi = deleteBaselineFromApi;
window.loadJobCommentsFromApi = loadJobCommentsFromApi;
window.saveCommentToApi = saveCommentToApi;
window.saveCommentsToApi = saveCommentsToApi;
window.deleteCommentFromApi = deleteCommentFromApi;
