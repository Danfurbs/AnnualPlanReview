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

  // Populate Clear All FY dropdown
  populateClearAllFySelect();

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

/**
 * Populate the Clear All FY select dropdown
 */
function populateClearAllFySelect() {
  const select = document.getElementById('clearAllFySelect');
  if (!select) return;

  // Get available FY options
  const fyOptions = typeof getFinancialYearOptions === 'function'
    ? getFinancialYearOptions()
    : ['FY2025', 'FY2026'];

  // Clear and repopulate
  select.innerHTML = '<option value="">Select FY...</option>';
  fyOptions.forEach(fy => {
    const option = document.createElement('option');
    option.value = fy;
    option.textContent = fy;
    select.appendChild(option);
  });
}

/**
 * Clear all forecast data for the selected FY and version
 */
function clearAllForecastData() {
  const fySelect = document.getElementById('clearAllFySelect');
  const versionSelect = document.getElementById('clearAllVersionSelect');

  const year = fySelect?.value;
  const version = versionSelect?.value;

  if (!year) {
    alert('Please select a Financial Year');
    return;
  }

  if (!version) {
    alert('Please select a Plan Version');
    return;
  }

  const versionLabel = version === 'both' ? 'v0 and v1' : version;
  const confirmMsg = `Are you sure you want to permanently delete ALL forecast data for ${year} ${versionLabel}?\n\nThis action CANNOT be undone.\n\nMake sure you have exported your data if needed.`;

  if (!confirm(confirmMsg)) {
    return;
  }

  // Double confirm for safety
  const doubleConfirm = confirm(`FINAL WARNING: You are about to delete ALL forecast data for ${year} ${versionLabel}.\n\nClick OK to proceed with deletion.`);
  if (!doubleConfirm) {
    return;
  }

  try {
    const result = window.clearAllForecastDataForYear(year, version);

    if (result.success) {
      alert(`Successfully cleared all forecast data for ${year} ${versionLabel}.\n\nCleared keys:\n${result.cleared.join('\n')}\n\nPlease refresh the page to see the changes.`);

      // Reset the selects
      fySelect.value = '';
      versionSelect.value = '';

      // Refresh the page to reload with cleared data
      if (confirm('Would you like to refresh the page now?')) {
        window.location.reload();
      }
    } else {
      alert(`Error clearing data: ${result.errors?.map(e => e.error).join(', ')}`);
    }
  } catch (err) {
    alert(`Error clearing data: ${err.message}`);
    console.error('Clear all error:', err);
  }
}

/**
 * Download comments as JSON file
 */
function downloadComments() {
  const commentStore = JSON.parse(localStorage.getItem('aprJobCommentsV2') || '{}');
  const jsonString = JSON.stringify(commentStore, null, 2);

  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `comments-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Trigger comment file upload
 */
function triggerCommentFileUpload() {
  const fileInput = document.getElementById('commentFileInput');
  if (fileInput) {
    fileInput.click();
  }
}

/**
 * Load comments from JSON file
 */
async function loadCommentFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target.result;
    try {
      const parsed = JSON.parse(content);

      // Validate structure
      if (typeof parsed !== 'object') {
        throw new Error('Invalid comment file format');
      }

      // Save to localStorage
      localStorage.setItem('aprJobCommentsV2', JSON.stringify(parsed));

      // Save to API if enabled
      if (window.isApiEnabled && window.isApiEnabled() && window.saveCommentsToApi) {
        await window.saveCommentsToApi(parsed);
      }

      const apiStatus = window.isApiEnabled && window.isApiEnabled() ? ' (synced to server)' : '';
      alert('Comments imported successfully!' + apiStatus);

      // Refresh the page to load new comments
      if (confirm('Would you like to refresh the page to see the imported comments?')) {
        window.location.reload();
      }
    } catch (err) {
      console.error('Error importing comments:', err);
      alert('Failed to import comments. Please check the file format.');
    }
  };
  reader.readAsText(file);

  // Reset file input
  event.target.value = '';
}

// Expose functions globally
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.testApiConnection = testApiConnection;
window.updateSettingsStatus = updateSettingsStatus;
window.updateApiSyncIndicator = updateApiSyncIndicator;
window.clearAllForecastData = clearAllForecastData;
window.populateClearAllFySelect = populateClearAllFySelect;
window.downloadComments = downloadComments;
window.triggerCommentFileUpload = triggerCommentFileUpload;
window.loadCommentFile = loadCommentFile;
