/**
 * Settings Management
 * Handles configuration UI for backend API and other application settings
 */

// Timing constants for status messages and polling
const STATUS_MESSAGE_CLEAR_DELAY_MS = 3000;
const CONNECTION_TEST_DELAY_MS = 500;
const SYNC_INDICATOR_POLL_INTERVAL_MS = 30000;

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

  // Populate export selectors
  populateExportSelectors();

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
    }, CONNECTION_TEST_DELAY_MS);
  }

  setTimeout(() => {
    statusDiv.innerHTML = '';
  }, STATUS_MESSAGE_CLEAR_DELAY_MS);
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

      // Build success message with DOM APIs (safe from XSS)
      statusDiv.innerHTML = '';
      const successDiv = document.createElement('div');
      successDiv.className = 'status-success';

      // "✅ Connection successful!" text
      successDiv.appendChild(document.createTextNode('✅ Connection successful!'));
      successDiv.appendChild(document.createElement('br'));

      // Environment line - dynamic value uses textContent
      const envSmall = document.createElement('small');
      envSmall.textContent = 'Environment: ' + (data.environment || 'unknown');
      successDiv.appendChild(envSmall);
      successDiv.appendChild(document.createElement('br'));

      // Database line - dynamic value uses textContent
      const dbSmall = document.createElement('small');
      dbSmall.textContent = 'Database: ' + (data.database || 'unknown');
      successDiv.appendChild(dbSmall);

      statusDiv.appendChild(successDiv);

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
    // Build error message with DOM APIs (safe from XSS)
    statusDiv.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'status-error';

    errorDiv.appendChild(document.createTextNode('❌ Connection failed'));
    errorDiv.appendChild(document.createElement('br'));

    // Error message - dynamic value uses textContent
    const msgSmall = document.createElement('small');
    msgSmall.textContent = err.message;
    errorDiv.appendChild(msgSmall);

    statusDiv.appendChild(errorDiv);
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
    indicator.textContent = '💾 Local';
    indicator.className = 'api-sync-indicator indicator-local';
    indicator.title = 'Using localStorage only (not synced across devices)';
    return;
  }

  // Check API health
  try {
    const healthy = await checkApiHealth();
    if (healthy) {
      indicator.textContent = '☁️ Synced';
      indicator.className = 'api-sync-indicator indicator-synced';
      indicator.title = 'Connected to backend API (synced across devices)';
    } else {
      indicator.textContent = '⚠️ Offline';
      indicator.className = 'api-sync-indicator indicator-offline';
      indicator.title = 'API enabled but unable to connect';
    }
  } catch {
    indicator.textContent = '⚠️ Error';
    indicator.className = 'api-sync-indicator indicator-error';
    indicator.title = 'API connection error';
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  addApiSyncIndicator();

  let syncIndicatorInterval = null;
  const startSyncPolling = () => {
    if (syncIndicatorInterval) return;
    syncIndicatorInterval = setInterval(updateApiSyncIndicator, SYNC_INDICATOR_POLL_INTERVAL_MS);
  };
  const stopSyncPolling = () => {
    if (!syncIndicatorInterval) return;
    clearInterval(syncIndicatorInterval);
    syncIndicatorInterval = null;
  };

  const refreshSyncPollingState = () => {
    const indicatorVisible = Boolean(document.getElementById('apiSyncIndicator'));
    if (document.hidden || !indicatorVisible) {
      stopSyncPolling();
      return;
    }
    updateApiSyncIndicator();
    startSyncPolling();
  };

  document.addEventListener('visibilitychange', refreshSyncPollingState);
  refreshSyncPollingState();
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

/**
 * Populate export selectors in settings modal
 */
function populateExportSelectors() {
  const fySelect = document.getElementById('exportFySelect');
  const workGroupSelect = document.getElementById('exportWorkGroupSelect');

  if (!fySelect || !workGroupSelect) return;

  // Populate FY dropdown
  const fyOptions = typeof getFinancialYearOptions === 'function'
    ? getFinancialYearOptions()
    : ['FY27', 'FY28', 'FY29', 'FY30'];

  fySelect.innerHTML = '<option value="">Select FY...</option>';
  fyOptions.forEach(fy => {
    const option = document.createElement('option');
    option.value = fy;
    option.textContent = fy;
    fySelect.appendChild(option);
  });

  // Populate work group dropdown with descriptions
  workGroupSelect.innerHTML = '<option value="">Select Work Group...</option>';

  if (window.workGroupSets && window.workGroupSets.size > 0) {
    // Sort work groups by description for easier selection
    const sortedWorkGroups = [];
    window.workGroupSets.forEach((description, code) => {
      // Skip retired entries
      if (description.includes('RETIRED') || description.includes('DO NOT USE')) {
        return;
      }
      sortedWorkGroups.push({ code, description });
    });

    // Sort alphabetically by description
    sortedWorkGroups.sort((a, b) => a.description.localeCompare(b.description));

    sortedWorkGroups.forEach(wg => {
      const option = document.createElement('option');
      option.value = wg.code; // Use code as value (matches how forecast data stores it)
      option.textContent = `${wg.description} (${wg.code})`;
      workGroupSelect.appendChild(option);
    });
  }
}

/**
 * Download forecast JSON export from settings (uses settings selectors)
 */
async function downloadSettingsForecastExport() {
  const fySelect = document.getElementById('exportFySelect');
  const planSelect = document.getElementById('exportPlanSelect');

  const year = fySelect?.value;
  const planVersion = planSelect?.value;

  if (!year) {
    alert('Please select a Financial Year');
    return;
  }

  if (!planVersion) {
    alert('Please select a Plan Version');
    return;
  }

  // Load forecast data for the selected year and plan version
  try {
    const snapshot = await window.getForecastSnapshotAsync(year, planVersion);

    if (!snapshot || !snapshot.data || !snapshot.data.size) {
      alert(`No forecast data found for ${year} ${planVersion}`);
      return;
    }

    // Export the forecast
    window.exportForecastFile(year, planVersion, snapshot.data, snapshot.data.size);
  } catch (err) {
    console.error('Failed to export forecast:', err);
    alert('Failed to export forecast: ' + err.message);
  }
}

/**
 * Download Excel template export from settings (uses settings selectors)
 */
async function downloadSettingsExcelExport() {
  const fySelect = document.getElementById('exportFySelect');
  const planSelect = document.getElementById('exportPlanSelect');
  const workGroupSelect = document.getElementById('exportWorkGroupSelect');

  const year = fySelect?.value;
  const planVersion = planSelect?.value;
  const workGroup = workGroupSelect?.value;

  if (!year) {
    alert('Please select a Financial Year');
    return;
  }

  if (!planVersion) {
    alert('Please select a Plan Version');
    return;
  }

  if (!workGroup) {
    alert('Please select a Work Group');
    return;
  }

  // Get work group description for display
  const workGroupDescription = window.workGroupSets?.get(workGroup) || workGroup;

  // Load forecast data for the selected year and plan version
  try {
    const snapshot = await window.getForecastSnapshotAsync(year, planVersion);

    if (!snapshot || !snapshot.data || !snapshot.data.size) {
      alert(`No forecast data found for ${year} ${planVersion}`);
      return;
    }

    // Convert FY27 -> 2027, FY26 -> 2026, etc.
    const financialYear = year.startsWith('FY') ? '20' + year.substring(2) : year;

    // Build CSV content
    const headers = ['Strategic Route', 'WGST', 'Financial Year', 'Standard Job', 'SJN and Desc', 'Account Code',
                     'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12', 'P13', 'Comment'];

    const rows = [];
    const periods = window.FORECAST_PERIODS || ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13'];

    snapshot.data.forEach((job, jobNumber) => {
      const wgData = job?.wgs?.[workGroup];
      if (!wgData) return;

      // Check if this job has any data for the current work group
      const hasData = periods.some(period => {
        const val = wgData[period];
        return val !== undefined && val !== null && val !== '';
      });

      if (!hasData) return;

      // Get job description from stdJobs
      const jobInfo = window.stdJobs?.get(jobNumber);
      const jobDesc = jobInfo?.desc || '';
      const sjnAndDesc = jobDesc ? `${jobNumber} - ${jobDesc}` : jobNumber;

      const row = [
        '', // Strategic Route (blank)
        workGroupDescription, // WGST (use description for readability)
        financialYear, // Financial Year (e.g., 2027)
        jobNumber, // Standard Job
        sjnAndDesc, // SJN and Desc (e.g., "006206 - T/C - TCAID - ACTIVATE")
        'XXXX', // Account Code (always XXXX)
      ];

      // Add P01-P13 values
      periods.forEach(period => {
        const value = wgData[period];
        // Export numeric values, including 0
        row.push(value !== undefined && value !== null && value !== '' ? value : '');
      });

      // Add comment for this work group
      const comment = job?.comments?.[workGroup] || '';
      row.push(comment);

      rows.push(row);
    });

    if (rows.length === 0) {
      alert(`No data to export for ${workGroupDescription} in ${year} ${planVersion}`);
      return;
    }

    // Sort by job number
    rows.sort((a, b) => a[3].localeCompare(b[3]));

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape cells that contain commas or quotes
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    // Sanitize workGroup for filename
    const safeWorkGroup = workGroup.replace(/[^a-zA-Z0-9_-]/g, '_');

    link.setAttribute('href', url);
    link.setAttribute('download', `Forecast_${year}_${planVersion}_${safeWorkGroup}_Upload.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`Exported ${rows.length} rows for ${workGroupDescription} (${workGroup}) in ${year} ${planVersion}`);
  } catch (err) {
    console.error('Failed to export Excel template:', err);
    alert('Failed to export Excel template: ' + err.message);
  }
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
window.populateExportSelectors = populateExportSelectors;
window.downloadSettingsForecastExport = downloadSettingsForecastExport;
window.downloadSettingsExcelExport = downloadSettingsExcelExport;
