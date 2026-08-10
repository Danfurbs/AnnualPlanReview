/**
 * Data Migration Utility
 * Exports all data from localStorage and imports it to the backend API
 */

/**
 * Export all data from localStorage to backend
 */
async function migrateAllDataToBackend() {
  if (!window.isApiEnabled || !window.isApiEnabled()) {
    alert('API mode is not enabled. Please enable it first.');
    return;
  }

  const results = {
    forecasts: { success: 0, failed: 0 },
    baselines: { success: 0, failed: 0 },
    comments: { success: 0, failed: 0 },
    v1Overrides: { success: 0, failed: 0 }
  };

  console.log('Starting data migration to backend...');

  try {
    // 1. Migrate forecasts
    console.log('Migrating forecasts...');
    const forecastKeys = Object.keys(localStorage).filter(key =>
      key.startsWith('aprForecastDataV1:') && !key.includes('v1-overrides')
    );

    for (const key of forecastKeys) {
      try {
        const match = key.match(/aprForecastDataV1:(.+):(.+)/);
        if (match) {
          const [, year, planVersion] = match;
          const raw = localStorage.getItem(key);
          const parsed = JSON.parse(raw);

          if (parsed && parsed.data) {
            const hydrated = window.hydrateForecastData(parsed.data);
            await window.saveForecastToApi(hydrated, parsed.rowCount, year, planVersion);
            results.forecasts.success++;
            console.log(`✓ Migrated forecast: ${year} ${planVersion}`);
          }
        }
      } catch (err) {
        console.error(`Failed to migrate forecast ${key}:`, err);
        results.forecasts.failed++;
      }
    }

    // 2. Migrate v1 overrides
    console.log('Migrating v1 overrides...');
    const v1OverrideKeys = Object.keys(localStorage).filter(key =>
      key.includes('v1-overrides')
    );

    for (const key of v1OverrideKeys) {
      try {
        const match = key.match(/aprForecastDataV1:(.+):v1-overrides/);
        if (match) {
          const year = match[1];
          const raw = localStorage.getItem(key);
          const parsed = JSON.parse(raw);

          if (Array.isArray(parsed) && parsed.length > 0) {
            await window.saveV1OverridesToApi(year, new Set(parsed));
            results.v1Overrides.success++;
            console.log(`✓ Migrated v1 overrides for ${year}`);
          }
        }
      } catch (err) {
        console.error(`Failed to migrate v1 overrides ${key}:`, err);
        results.v1Overrides.failed++;
      }
    }

    // 3. Migrate baselines
    console.log('Migrating baselines...');
    try {
      const raw = localStorage.getItem('aprSjnLifetimeTargetV1') || localStorage.getItem('aprBaselineDataV1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Object.keys(parsed).length > 0) {
          await window.saveBaselinesToApi(parsed);
          results.baselines.success = Object.keys(parsed).length;
          console.log(`✓ Migrated ${results.baselines.success} baselines`);
        }
      }
    } catch (err) {
      console.error('Failed to migrate baselines:', err);
      results.baselines.failed++;
    }

    // 4. Migrate comments
    console.log('Migrating comments...');
    try {
      const raw = localStorage.getItem('aprJobCommentsV2');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Object.keys(parsed).length > 0) {
          await window.saveCommentsToApi(parsed);

          // Count total comments
          let totalComments = 0;
          Object.values(parsed).forEach(comments => {
            totalComments += comments.length;
          });
          results.comments.success = totalComments;
          console.log(`✓ Migrated ${totalComments} comments`);
        }
      }
    } catch (err) {
      console.error('Failed to migrate comments:', err);
      results.comments.failed++;
    }

    // 5. Display results
    const summary = `
Migration Complete!

Forecasts: ${results.forecasts.success} succeeded, ${results.forecasts.failed} failed
V1 Overrides: ${results.v1Overrides.success} succeeded, ${results.v1Overrides.failed} failed
Baselines: ${results.baselines.success} succeeded, ${results.baselines.failed} failed
Comments: ${results.comments.success} succeeded, ${results.comments.failed} failed

All data has been migrated to the backend.
    `.trim();

    console.log(summary);
    alert(summary);

  } catch (err) {
    console.error('Migration failed:', err);
    alert('Migration failed: ' + err.message);
  }
}

/**
 * Import all data from backend to localStorage
 */
async function migrateAllDataFromBackend() {
  if (!window.isApiEnabled || !window.isApiEnabled()) {
    alert('API mode is not enabled. Please enable it first.');
    return;
  }

  const results = {
    forecasts: 0,
    baselines: 0,
    comments: 0
  };

  console.log('Starting data import from backend...');

  try {
    // 1. Import baselines
    console.log('Importing baselines...');
    try {
      const baselines = await window.loadBaselinesFromApi();
      if (baselines) {
        const baselineMap = new Map(Object.entries(baselines));
        window.saveBaselineData(baselineMap);
        results.baselines = baselineMap.size;
        console.log(`✓ Imported ${results.baselines} baselines`);
      }
    } catch (err) {
      console.error('Failed to import baselines:', err);
    }

    // 2. Import comments
    console.log('Importing comments...');
    try {
      const comments = await window.loadJobCommentsFromApi();
      if (comments) {
        localStorage.setItem('aprJobCommentsV2', JSON.stringify(comments));

        // Count total comments
        let totalComments = 0;
        Object.values(comments).forEach(commentList => {
          totalComments += commentList.length;
        });
        results.comments = totalComments;
        console.log(`✓ Imported ${totalComments} comments`);
      }
    } catch (err) {
      console.error('Failed to import comments:', err);
    }

    // 3. Display results
    const summary = `
Import Complete!

Baselines: ${results.baselines} imported
Comments: ${results.comments} imported

Note: Forecasts are loaded automatically when you switch contexts.
To load forecasts now, use the Context Controls.
    `.trim();

    console.log(summary);
    alert(summary);

  } catch (err) {
    console.error('Import failed:', err);
    alert('Import failed: ' + err.message);
  }
}

/**
 * Check API health and show status
 */
async function checkBackendStatus() {
  console.log('Checking backend API status...');

  try {
    const isHealthy = await window.checkApiHealth();

    if (isHealthy) {
      alert('Backend API is running and healthy!');
      return true;
    } else {
      alert('Backend API is not responding. Please start the server.');
      return false;
    }
  } catch (err) {
    console.error('API health check failed:', err);
    alert('Cannot connect to backend API. Please ensure the server is running on port 3000.');
    return false;
  }
}

/**
 * Toggle API mode
 */
function toggleApiConnection() {
  const currentState = window.isApiEnabled();
  window.toggleApiMode(!currentState);

  const status = !currentState ? 'enabled' : 'disabled';
  alert(`Backend API ${status}.\n\n${!currentState ? 'Data will now sync with the server.' : 'Data will only be stored locally.'}`);

  // Update UI if there's a toggle button
  const toggle = document.getElementById('apiModeToggle');
  if (toggle) {
    toggle.textContent = !currentState ? 'Disable Backend' : 'Enable Backend';
    toggle.className = !currentState ? 'btn-danger' : 'btn-primary';
  }
}

// Expose functions globally
window.migrateAllDataToBackend = migrateAllDataToBackend;
window.migrateAllDataFromBackend = migrateAllDataFromBackend;
window.checkBackendStatus = checkBackendStatus;
window.toggleApiConnection = toggleApiConnection;
