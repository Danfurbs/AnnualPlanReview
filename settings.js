/**
 * Settings Management
 * Handles configuration UI for backend API and other application settings
 */

/**
 * Open settings modal
 */
function openSettings() {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;

  // Load current settings
  const apiBaseUrl = getApiBaseUrl();
  const apiEnabled = isApiEnabled();

  document.getElementById('apiBaseUrlInput').value = apiBaseUrl;
  document.getElementById('apiEnabledToggle').checked = apiEnabled;

  // Update status display
  updateSettingsStatus();

  modal.style.display = 'block';
}

/**
 * Close settings modal
 */
function closeSettings() {
  const modal = document.getElementById('settingsModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Save settings
 */
async function saveSettings() {
  const apiBaseUrl = document.getElementById('apiBaseUrlInput').value.trim();
  const apiEnabled = document.getElementById('apiEnabledToggle').checked;
  const statusDiv = document.getElementById('settingsStatus');

  // Validate URL if API is enabled
  if (apiEnabled && !apiBaseUrl) {
    statusDiv.innerHTML = '<div class="status-error">❌ Please enter a backend URL</div>';
    return;
  }

  if (apiEnabled && apiBaseUrl) {
    try {
      new URL(apiBaseUrl);
    } catch (err) {
      statusDiv.innerHTML = '<div class="status-error">❌ Invalid URL format. Must start with http:// or https://</div>';
      return;
    }
  }

  // Save settings
  if (apiBaseUrl) {
    setApiBaseUrl(apiBaseUrl);
  }
  toggleApiMode(apiEnabled);

  statusDiv.innerHTML = '<div class="status-success">✅ Settings saved successfully!</div>';

  // Update status display
  updateSettingsStatus();

  // If API is enabled, test the connection
  if (apiEnabled) {
    setTimeout(() => {
      testApiConnection();
    }, 500);
  }

  setTimeout(() => {
    statusDiv.innerHTML = '';
  }, 3000);
}

/**
 * Test API connection
 */
async function testApiConnection() {
  const statusDiv = document.getElementById('settingsStatus');
  const apiUrlInput = document.getElementById('apiBaseUrlInput').value.trim();

  if (!apiUrlInput) {
    statusDiv.innerHTML = '<div class="status-error">❌ Please enter a backend URL first</div>';
    return;
  }

  statusDiv.innerHTML = '<div class="status-info">🔄 Testing connection...</div>';

  try {
    // Temporarily save the URL to test it
    const originalUrl = getApiBaseUrl();
    setApiBaseUrl(apiUrlInput);
    const originalEnabled = isApiEnabled();
    toggleApiMode(true);

    // Test the health endpoint
    const healthy = await checkApiHealth();

    if (healthy) {
      // Get more details
      const response = await fetch(`${apiUrlInput}/api/health`);
      const data = await response.json();

      statusDiv.innerHTML = `
        <div class="status-success">
          ✅ Connection successful!<br>
          <small>Environment: ${data.environment || 'unknown'}</small><br>
          <small>Database: ${data.database || 'unknown'}</small>
        </div>
      `;

      // Update status display
      updateSettingsStatus(data);
    } else {
      statusDiv.innerHTML = `
        <div class="status-error">
          ❌ Connection failed<br>
          <small>Unable to reach backend API. Please check:</small>
          <ul style="margin: 10px 0; padding-left: 20px; text-align: left;">
            <li>URL is correct</li>
            <li>Backend is deployed and running</li>
            <li>No network issues</li>
          </ul>
        </div>
      `;

      // Restore original settings
      setApiBaseUrl(originalUrl);
      toggleApiMode(originalEnabled);
    }
  } catch (err) {
    statusDiv.innerHTML = `
      <div class="status-error">
        ❌ Connection failed<br>
        <small>${err.message}</small>
      </div>
    `;
    console.error('API connection test failed:', err);
  }
}

/**
 * Update settings status display
 */
async function updateSettingsStatus(healthData = null) {
  const apiStatusValue = document.getElementById('apiStatusValue');
  const apiUrlValue = document.getElementById('apiUrlValue');
  const databaseValue = document.getElementById('databaseValue');

  if (!apiStatusValue || !apiUrlValue || !databaseValue) return;

  const apiEnabled = isApiEnabled();
  const apiBaseUrl = getApiBaseUrl();

  // Update API status
  if (apiEnabled) {
    apiStatusValue.textContent = '✅ Enabled';
    apiStatusValue.className = 'status-value status-enabled';
  } else {
    apiStatusValue.textContent = '❌ Disabled';
    apiStatusValue.className = 'status-value status-disabled';
  }

  // Update URL
  apiUrlValue.textContent = apiBaseUrl || 'Not configured';

  // Update database info
  if (healthData) {
    databaseValue.textContent = healthData.database || 'Unknown';
  } else if (apiEnabled) {
    databaseValue.textContent = 'Testing...';
    try {
      const response = await fetch(`${apiBaseUrl}/api/health`);
      const data = await response.json();
      databaseValue.textContent = data.database || 'Unknown';
    } catch {
      databaseValue.textContent = 'Unable to connect';
    }
  } else {
    databaseValue.textContent = 'API disabled';
  }
}

/**
 * Add API sync indicator to the UI
 */
function addApiSyncIndicator() {
  const topBar = document.querySelector('.top-bar-hero');
  if (!topBar || document.getElementById('apiSyncIndicator')) return;

  const indicator = document.createElement('div');
  indicator.id = 'apiSyncIndicator';
  indicator.className = 'api-sync-indicator';
  indicator.title = 'API Sync Status';

  topBar.appendChild(indicator);

  // Update indicator status
  updateApiSyncIndicator();
}

/**
 * Update API sync indicator
 */
async function updateApiSyncIndicator() {
  const indicator = document.getElementById('apiSyncIndicator');
  if (!indicator) return;

  const apiEnabled = isApiEnabled();

  if (!apiEnabled) {
    indicator.innerHTML = '💾 Local';
    indicator.className = 'api-sync-indicator indicator-local';
    indicator.title = 'Using localStorage only (not synced across devices)';
    return;
  }

  // Check API health
  try {
    const healthy = await checkApiHealth();
    if (healthy) {
      indicator.innerHTML = '☁️ Synced';
      indicator.className = 'api-sync-indicator indicator-synced';
      indicator.title = 'Connected to backend API (synced across devices)';
    } else {
      indicator.innerHTML = '⚠️ Offline';
      indicator.className = 'api-sync-indicator indicator-offline';
      indicator.title = 'API enabled but unable to connect';
    }
  } catch {
    indicator.innerHTML = '⚠️ Error';
    indicator.className = 'api-sync-indicator indicator-error';
    indicator.title = 'API connection error';
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  addApiSyncIndicator();

  // Update indicator every 30 seconds
  setInterval(updateApiSyncIndicator, 30000);
});

// Close modal when clicking outside
window.addEventListener('click', (event) => {
  const modal = document.getElementById('settingsModal');
  if (event.target === modal) {
    closeSettings();
  }
});

// Expose functions globally
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.testApiConnection = testApiConnection;
window.updateSettingsStatus = updateSettingsStatus;
window.updateApiSyncIndicator = updateApiSyncIndicator;
