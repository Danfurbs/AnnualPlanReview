/**
 * API Client
 * Handles communication with the backend API
 */

// Configuration
const API_CONFIG = {
  baseUrl: window.location.origin,
  enabled: true, // Set to true to use backend API, false to use localStorage only
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
};

/**
 * Check if API mode is enabled
 */
function isApiEnabled() {
  return API_CONFIG.enabled;
}

/**
 * Toggle API mode
 */
function toggleApiMode(enabled) {
  API_CONFIG.enabled = enabled;
  localStorage.setItem('aprApiEnabled', JSON.stringify(enabled));
  console.log(`API mode ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Load API configuration from localStorage
 */
function loadApiConfig() {
  try {
    const saved = localStorage.getItem('aprApiEnabled');
    if (saved !== null) {
      API_CONFIG.enabled = JSON.parse(saved);
    }
  } catch (err) {
    console.warn('Failed to load API config:', err);
  }
}

// Load config on startup
loadApiConfig();

/**
 * Generic API request handler with retry logic
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_CONFIG.baseUrl}/api${endpoint}`;
  const config = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  let lastError;
  for (let attempt = 0; attempt < API_CONFIG.retryAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

      config.signal = controller.signal;

      const response = await fetch(url, config);
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      lastError = err;
      if (attempt < API_CONFIG.retryAttempts - 1) {
        const delay = API_CONFIG.retryDelay * Math.pow(2, attempt);
        console.warn(`API request failed, retrying in ${delay}ms...`, err.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error('API request failed after retries:', lastError);
  throw lastError;
}

// ========== Forecast API Functions ==========

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

  try {
    const serialized = window.serializeForecastData(forecastData);
    const response = await apiRequest(`/forecasts/${year}/${planVersion}`, {
      method: 'POST',
      body: { data: serialized }
    });

    return response.success === true;
  } catch (err) {
    console.error('Failed to save forecast to API:', err);
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
    const promises = Array.from(overridesSet).map(jobNumber =>
      apiRequest(`/forecasts/v1-overrides/${year}/${jobNumber}`, {
        method: 'POST'
      })
    );

    await Promise.all(promises);
    return true;
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
