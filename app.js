    // Core data (exposed on window for forecast modules)
    window.wData = null;
    window.stdJobs = new Map();
    window.workGroupSets = new Map();
    window.currentJobsMap = new Map();

    // UI state (not in modules)
    let groupStore = [];
    let publicGroupStore = [];
    let editingGroupId = null;
    let currentChart = null;
    let topVarianceBriefCharts = [];
    let latestTopVarianceBrief = null;
    let currentWorkOrders = [];
    let currentWorkOrderWorkGroup = 'all';
    let lastForecastRowCount = null;
    let requiresContextSelection = true;
    let disciplineCollapseState = {};
    let currentForecastCutoff = 'auto';
    let breakdownChartScope = 'overall';
    let breakdownChartScopeTarget = '';
    let currentBreakdownJobNumber = null;

    // Comment-related (not in modules)
    const COMMENT_CATEGORIES = ['General', 'RF3', 'RF6', 'RF9', 'RF11', 'IME'];
    const COMMENT_STORAGE_KEY = 'aprJobCommentsV2';
    const LEGACY_COMMENT_STORAGE_KEY = 'aprJobComments';
    let commentStore = {};
    let currentCommentJob = null;

    // Review tracking (not in modules)
    const REVIEW_STORAGE_KEY = 'aprReviewStatusV1';
    let reviewStore = {};
    const REVIEW_CELEBRATION_MS = 1400;
    const recentlyReviewedJobs = new Map();

    // Work order amendments (not in modules)
    const WORK_ORDER_AMENDMENTS_KEY = 'aprWorkOrderAmendmentsV1';
    let workOrderAmendments = {};

    // Group management (not in modules)
    const GROUP_STORAGE_KEY = 'aprGroupStoreV1';
    const WORK_DONE_STORAGE_KEY = 'aprWorkDoneByYearV1';
    let workDoneUploadedAt = null;

    // Breakdown plan version preference
    const BREAKDOWN_PLAN_VERSION_KEY = 'aprBreakdownPlanVersionV1';
    let breakdownPlanVersion = 'v0'; // Default to v0
    const DELIVERY_UNIT_KEY = 'aprDeliveryUnitV1';
    let currentDeliveryUnit = localStorage.getItem(DELIVERY_UNIT_KEY) || 'all';

    function loadBreakdownPlanVersion() {
      const saved = localStorage.getItem(BREAKDOWN_PLAN_VERSION_KEY);
      if (saved && ['v0', 'v1', 'both'].includes(saved)) {
        breakdownPlanVersion = saved;
      }
    }

    function saveBreakdownPlanVersion(version) {
      breakdownPlanVersion = version;
      localStorage.setItem(BREAKDOWN_PLAN_VERSION_KEY, version);
    }

    function handleBreakdownPlanVersionChange(sourceSelect) {
      const select = sourceSelect || document.getElementById('wgComparePlanVersion') || document.getElementById('breakdownPlanVersion');
      if (!select) return;
      saveBreakdownPlanVersion(select.value);
      const modalSelect = document.getElementById('breakdownPlanVersion');
      if (modalSelect && modalSelect !== select && modalSelect.value !== select.value) modalSelect.value = select.value;
      const sectionSelect = document.getElementById('wgComparePlanVersion');
      if (sectionSelect && sectionSelect !== select && sectionSelect.value !== select.value) sectionSelect.value = select.value;
      // Re-render the current breakdown if it's open
      if (currentCommentJob) {
        const job = window.currentJobsMap.get(currentCommentJob);
        if (job) showBreakdown(job);
      }
    }
    // Expose globally for HTML onclick handler
    window.handleBreakdownPlanVersionChange = handleBreakdownPlanVersionChange;

    function getDefaultBreakdownChartScope() {
      const workGroup = document.getElementById('wgFilter')?.value || 'all';
      const engineer = document.getElementById('engineerFilter')?.value || 'all';
      if (workGroup !== 'all') return 'workgroup';
      if (engineer !== 'all') return 'engineer';
      return 'overall';
    }

    function handleBreakdownChartScopeChange() {
      const select = document.getElementById('breakdownChartScope');
      if (!select || !['overall', 'workgroup', 'engineer'].includes(select.value)) return;
      breakdownChartScope = select.value;
      breakdownChartScopeTarget = '';
      if (currentCommentJob) {
        const job = window.currentJobsMap.get(currentCommentJob);
        if (job) showBreakdown(job);
      }
    }
    window.handleBreakdownChartScopeChange = handleBreakdownChartScopeChange;

    function handleBreakdownChartScopeTargetChange() {
      breakdownChartScopeTarget = document.getElementById('breakdownChartScopeTarget')?.value || '';
      if (currentCommentJob) {
        const job = window.currentJobsMap.get(currentCommentJob);
        if (job) showBreakdown(job);
      }
    }
    window.handleBreakdownChartScopeTargetChange = handleBreakdownChartScopeTargetChange;
    function getBreakdownComparisonLabel() {
      if (breakdownPlanVersion === 'v1') return 'Comparing against Plan v1';
      if (breakdownPlanVersion === 'both') return 'Comparing against both Plan v0 and Plan v1';
      return 'Comparing against Plan v0';
    }

    // Work group table display mode preference (forecast vs variance)
    const WG_DISPLAY_MODE_KEY = 'aprWgDisplayModeV1';
    let wgDisplayMode = 'variance'; // Default to variance (current behavior)

    function loadWgDisplayMode() {
      const saved = localStorage.getItem(WG_DISPLAY_MODE_KEY);
      if (saved && ['forecast', 'variance'].includes(saved)) {
        wgDisplayMode = saved;
      }
    }

    function saveWgDisplayMode(mode) {
      wgDisplayMode = mode;
      localStorage.setItem(WG_DISPLAY_MODE_KEY, mode);
    }

    function handleWgDisplayModeChange() {
      const select = document.getElementById('wgDisplayMode');
      if (!select) return;
      saveWgDisplayMode(select.value);
      // Re-render the current breakdown if it's open
      if (currentCommentJob) {
        const job = window.currentJobsMap.get(currentCommentJob);
        if (job) showBreakdown(job);
      }
    }
    // Expose globally for HTML onclick handler
    window.handleWgDisplayModeChange = handleWgDisplayModeChange;

    async function handleDashboardPlanVersionChange() {
      const select = document.getElementById('dashboardPlanVersion');
      if (!select) return;

      const newPlanVersion = select.value;
      if (!PLAN_VERSIONS.some(plan => plan.id === newPlanVersion)) return;

      // Update current plan version
      currentPlanVersion = newPlanVersion;
      localStorage.setItem(PLAN_VERSION_KEY, currentPlanVersion);

      // Reload forecast data for new plan version
      fData = null;
      const forecastCache = await loadForecastFromStorageAsync(currentFinancialYear, currentPlanVersion);
      if (forecastCache) {
        fData = currentPlanVersion === 'v1' ? getEffectiveForecastSnapshot(currentFinancialYear).data : forecastCache.data;
        updateWorkGroupFilterOptions();
        console.log(`✓ Switched to ${newPlanVersion}: Forecast loaded (${window.isApiEnabled() ? 'API' : 'local'})`);
      } else {
        const libraryForecast = await loadForecastFromLibraryAsync(currentFinancialYear, currentPlanVersion);
        if (libraryForecast) {
          fData = currentPlanVersion === 'v1' ? getEffectiveForecastSnapshot(currentFinancialYear).data : libraryForecast.data;
          updateWorkGroupFilterOptions();
          const source = libraryForecast.source === 'github' ? 'GitHub' : 'library';
          console.log(`✓ Switched to ${newPlanVersion}: ${source} forecast loaded`);
        }
      }

      // Update UI and re-render
      updateContextControls();
      render();
    }
    // Expose globally for HTML onclick handler
    window.handleDashboardPlanVersionChange = handleDashboardPlanVersionChange;

    function loadCommentStore() {
      try {
        localStorage.removeItem(LEGACY_COMMENT_STORAGE_KEY);
        const raw = localStorage.getItem(COMMENT_STORAGE_KEY);
        commentStore = raw ? JSON.parse(raw) : {};
      } catch (err) {
        console.warn('Failed to load comments:', err);
        commentStore = {};
      }
    }

    async function loadCommentStoreAsync() {
      // Try API first if enabled
      if (window.isApiEnabled && window.isApiEnabled() && window.loadJobCommentsFromApi) {
        try {
          const apiData = await window.loadJobCommentsFromApi();
          if (apiData) {
            commentStore = apiData;
            // Cache in localStorage for offline access
            localStorage.setItem(COMMENT_STORAGE_KEY, JSON.stringify(commentStore));
            return;
          }
        } catch (err) {
          console.warn('Failed to load comments from API, falling back to localStorage:', err);
        }
      }

      // Fall back to localStorage
      loadCommentStore();
    }

    async function loadReviewStoreAsync() {
      if (window.isApiEnabled && window.isApiEnabled() && window.loadReviewsFromApi) {
        try {
          const apiData = await window.loadReviewsFromApi();
          if (apiData) {
            reviewStore = apiData;
            migrateLegacyReviewStore();
            localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviewStore));
            return;
          }
        } catch (err) {
          console.warn('Failed to load reviews from API, falling back to localStorage:', err);
        }
      }

      try {
        const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
        reviewStore = raw ? JSON.parse(raw) : {};
        migrateLegacyReviewStore();
      } catch (err) {
        console.warn('Failed to load review store:', err);
        reviewStore = {};
      }
    }

    function migrateLegacyReviewStore() {
      // Review records must be job -> FY -> RF. Older records only contained an
      // RF key, so there is no reliable financial year to which they can be
      // assigned. Keep them quarantined rather than showing them in every FY.
      let migrated = 0;
      Object.entries(reviewStore || {}).forEach(([jobNumber, jobReviews]) => {
        if (!jobReviews || typeof jobReviews !== 'object') return;
        Object.entries(jobReviews).forEach(([key, value]) => {
          if (key !== '_legacy' && value?.reviewedAt) {
            jobReviews._legacy ||= {};
            jobReviews._legacy[key] = value;
            delete jobReviews[key];
            migrated++;
          }
        });
        if (!Object.keys(jobReviews).length) delete reviewStore[jobNumber];
      });
      if (migrated) {
        console.info(`Quarantined ${migrated} legacy review entr${migrated === 1 ? 'y' : 'ies'} that had no financial year.`);
        saveReviewStore();
      }
    }

    function saveReviewStore() {
      localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviewStore));
    }

    async function saveReviewStoreAsync() {
      saveReviewStore();
      if (window.isApiEnabled && window.isApiEnabled() && window.saveReviewsToApi) {
        try {
          const ok = await window.saveReviewsToApi(reviewStore);
          if (!ok && window.API_CONFIG?.forceServerPersistence) {
            alert('Server review sync failed. Local cache updated, but Render database did not confirm the write.');
          }
        } catch (err) {
          console.warn('Failed to save review store to API (saved locally):', err);
        }
      }
    }

    function updateReviewContextDisplay() {
      const stageDisplay = document.getElementById('reviewStageDisplay');
      if (stageDisplay) stageDisplay.textContent = currentReviewStage || 'RF';
      const fyDisplay = document.getElementById('financialYearDisplay');
      if (fyDisplay) fyDisplay.textContent = currentFinancialYear || 'FY';
      const planDisplay = document.getElementById('planVersionDisplay');
      if (planDisplay) {
        const label = PLAN_VERSIONS.find(plan => plan.id === currentPlanVersion)?.label || 'Plan';
        planDisplay.textContent = label;
      }
    }

    function getDeliveryUnitOptions() {
      const values = new Set(['all']);
      window.stdJobs.forEach(job => {
        if (job?.mnt) values.add(job.mnt);
      });
      return Array.from(values);
    }

    async function setReviewContext(stage, year, { persist = true, deliveryUnit = currentDeliveryUnit } = {}) {
      if (!REVIEW_STAGES.includes(stage)) return;
      currentReviewStage = stage;
      currentFinancialYear = year || currentFinancialYear;
      currentPlanVersion = getPreferredPlanVersion(currentFinancialYear);
      currentDeliveryUnit = deliveryUnit || 'all';
      requiresContextSelection = false;
      if (persist) {
        localStorage.setItem(REVIEW_STAGE_KEY, stage);
        if (currentFinancialYear) {
          localStorage.setItem(FINANCIAL_YEAR_KEY, currentFinancialYear);
        }
        if (currentPlanVersion) {
          localStorage.setItem(PLAN_VERSION_KEY, currentPlanVersion);
        }
        localStorage.setItem(DELIVERY_UNIT_KEY, currentDeliveryUnit);
      }
      updateReviewContextDisplay();
      updateContextControls();
      refreshWorkDoneYearSelector();
      await loadWorkDoneStoreAsync(currentFinancialYear);
      fData = null;
      const forecastCache = await loadForecastFromStorageAsync(currentFinancialYear, currentPlanVersion);
      if (forecastCache) {
        fData = currentPlanVersion === 'v1' ? getEffectiveForecastSnapshot(currentFinancialYear).data : forecastCache.data;
        updateWorkGroupFilterOptions();
        console.log('✓ Forecast loaded', forecastCache.savedAt ? `(${forecastCache.savedAt})` : '', window.isApiEnabled() ? '[API]' : '[local]');
      } else {
        const libraryForecast = await loadForecastFromLibraryAsync(currentFinancialYear, currentPlanVersion);
        if (libraryForecast) {
          fData = currentPlanVersion === 'v1' ? getEffectiveForecastSnapshot(currentFinancialYear).data : libraryForecast.data;
          updateWorkGroupFilterOptions();
          const source = libraryForecast.source === 'github' ? 'GitHub' : 'library';
          console.log(`✓ Forecast loaded from ${source}`);
        }
      }
      closeStageModal();
      render();
    }

    function updateContextControls() {
      const reviewStageHelper = document.getElementById('reviewStageHelper');
      if (reviewStageHelper) {
        const stageLabel = currentReviewStage || 'RF';
        const yearLabel = currentFinancialYear || 'FY';
        const duLabel = currentDeliveryUnit === 'all' ? 'All Delivery Units' : currentDeliveryUnit;
        reviewStageHelper.textContent = `Current selection: ${yearLabel} ${stageLabel} • ${duLabel}.`;
      }
      const planDisplay = document.getElementById('planVersionDisplay');
      if (planDisplay) {
        const label = PLAN_VERSIONS.find(plan => plan.id === currentPlanVersion)?.label || 'Plan';
        planDisplay.textContent = label;
      }
      // Sync dashboard plan version selector
      const dashboardPlanVersionSelect = document.getElementById('dashboardPlanVersion');
      if (dashboardPlanVersionSelect && dashboardPlanVersionSelect.value !== currentPlanVersion) {
        dashboardPlanVersionSelect.value = currentPlanVersion;
      }
      const forecastPage = document.getElementById('forecastPage');
      if (forecastPage && !forecastPage.classList.contains('is-hidden')) {
        renderForecastEditorSelectors();
      }
    }

    function normalizeJobNumberInput(value) {
      return String(value || '').trim();
    }

    async function setForecastContext(stage, year, planVersion, { persist = true, deliveryUnit = currentDeliveryUnit } = {}) {
      if (!REVIEW_STAGES.includes(stage)) return;
      if (planVersion && !PLAN_VERSIONS.some(plan => plan.id === planVersion)) return;
      currentReviewStage = stage;
      currentFinancialYear = year || currentFinancialYear;
      currentPlanVersion = planVersion || currentPlanVersion;
      currentDeliveryUnit = deliveryUnit || 'all';
      requiresContextSelection = false;
      if (persist) {
        localStorage.setItem(REVIEW_STAGE_KEY, stage);
        if (currentFinancialYear) {
          localStorage.setItem(FINANCIAL_YEAR_KEY, currentFinancialYear);
        }
        if (currentPlanVersion) {
          localStorage.setItem(PLAN_VERSION_KEY, currentPlanVersion);
        }
        localStorage.setItem(DELIVERY_UNIT_KEY, currentDeliveryUnit);
      }
      updateReviewContextDisplay();
      updateContextControls();
      refreshWorkDoneYearSelector();
      await loadWorkDoneStoreAsync(currentFinancialYear);
      fData = null;
      const forecastCache = await loadForecastFromStorageAsync(currentFinancialYear, currentPlanVersion);
      if (forecastCache) {
        fData = currentPlanVersion === 'v1' ? getEffectiveForecastSnapshot(currentFinancialYear).data : forecastCache.data;
        updateWorkGroupFilterOptions();
        console.log('✓ Forecast loaded', forecastCache.savedAt ? `(${forecastCache.savedAt})` : '', window.isApiEnabled() ? '[API]' : '[local]');
      } else {
        const libraryForecast = await loadForecastFromLibraryAsync(currentFinancialYear, currentPlanVersion);
        if (libraryForecast) {
          fData = currentPlanVersion === 'v1' ? getEffectiveForecastSnapshot(currentFinancialYear).data : libraryForecast.data;
          updateWorkGroupFilterOptions();
          const source = libraryForecast.source === 'github' ? 'GitHub' : 'library';
          console.log(`✓ Forecast loaded from ${source}`);
        }
      }
      render();
    }

    function openStageModal() {
      const modal = document.getElementById('stageModal');
      if (!modal) return;
      const fySelect = document.getElementById('financialYearSelect');
      if (fySelect) {
        const options = getFinancialYearOptions();
        fySelect.innerHTML = options.map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join('');
        fySelect.value = options.includes(currentFinancialYear) ? currentFinancialYear : options[0] || '';
      }
      const duSelect = document.getElementById('deliveryUnitSelect');
      if (duSelect) {
        const duOptions = getDeliveryUnitOptions();
        duSelect.innerHTML = duOptions.map(unit => `<option value="${escapeHtml(unit)}">${unit === 'all' ? 'All Delivery Units' : escapeHtml(unit)}</option>`).join('');
        duSelect.value = duOptions.includes(currentDeliveryUnit) ? currentDeliveryUnit : 'all';
      }
      const grid = document.getElementById('stageSelectionGrid');
      if (grid && !grid.childElementCount) {
        grid.innerHTML = REVIEW_STAGES
          .map(stage => `<button type="button" class="stage-button" data-stage="${stage}">${stage}</button>`)
          .join('');
        grid.querySelectorAll('[data-stage]').forEach(button => {
          button.addEventListener('click', () => {
            const selectedYear = document.getElementById('financialYearSelect')?.value || '';
            const selectedDeliveryUnit = document.getElementById('deliveryUnitSelect')?.value || 'all';
            if (!selectedYear) {
              alert('Please choose a financial year.');
              return;
            }
            setReviewContext(button.dataset.stage, selectedYear, { deliveryUnit: selectedDeliveryUnit });
          });
        });
      }
      modal.classList.add('open');
    }

    function closeStageModal() {
      document.getElementById('stageModal')?.classList.remove('open');
    }

    function getJobReviewStatus(jobNumber, year = currentFinancialYear, stage = currentReviewStage) {
      const review = reviewStore?.[jobNumber]?.[year]?.[stage];
      if (!review?.reviewedAt) return 'not_reviewed';
      return 'reviewed';
    }

    function isJobReviewed(jobNumber, stage = currentReviewStage, year = currentFinancialYear) {
      const status = getJobReviewStatus(jobNumber, year, stage);
      return status === 'reviewed';
    }

    function markJobReviewed(jobNumber, stage = currentReviewStage, year = currentFinancialYear) {
      if (!reviewStore[jobNumber]) reviewStore[jobNumber] = {};
      if (!reviewStore[jobNumber][year]) reviewStore[jobNumber][year] = {};
      reviewStore[jobNumber][year][stage] = {
        reviewedAt: new Date().toISOString(),
        reviewedBy: ''
      };
      saveReviewStoreAsync();
    }

    function reopenJobReview(jobNumber, stage = currentReviewStage, year = currentFinancialYear) {
      if (!reviewStore[jobNumber]) return;
      if (!reviewStore[jobNumber][year]?.[stage]) return;
      delete reviewStore[jobNumber][year][stage];
      if (!Object.keys(reviewStore[jobNumber][year]).length) delete reviewStore[jobNumber][year];
      if (!Object.keys(reviewStore[jobNumber]).length) {
        delete reviewStore[jobNumber];
      }
      saveReviewStoreAsync();
    }

    window.getJobReviewStatus = getJobReviewStatus;
    window.isJobReviewed = isJobReviewed;
    window.markJobReviewed = markJobReviewed;
    window.reopenJobReview = reopenJobReview;

    function renderPreservingScroll() {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      render();
      requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
    }

    function getRenderedJobCard(jobNumber) {
      return Array.from(document.querySelectorAll('.job-card'))
        .find(card => card.dataset.jobNumber === jobNumber);
    }

    function triggerReviewCelebration(jobNumber) {
      recentlyReviewedJobs.set(jobNumber, Date.now() + REVIEW_CELEBRATION_MS);
      window.setTimeout(() => {
        recentlyReviewedJobs.delete(jobNumber);
        getRenderedJobCard(jobNumber)?.classList.remove('review-celebrating');
      }, REVIEW_CELEBRATION_MS);
    }

    // Forecast functions are now in separate modules:
    // - forecast-storage.js: serializeForecastData, hydrateForecastData, cloneForecastData,
    //   getForecastStorageKey, loadForecastFromStorage, saveForecastToStorage,
    //   loadForecastFromLibrary, getForecastSnapshot, initializeV1FromV0,
    //   exportForecastFile, importForecastFile, getForecastPeriodsForJob,
    //   getForecastWorkGroupData, updateForecastWorkGroup, cleanForecastData
    // - forecast-state.js: initializeForecastContext, setReviewContext, setForecastContext,
    //   getCurrentContext, getFinancialYearOptions, getForecastAvailability,
    //   getPreferredPlanVersion, loadForecastForCurrentContext, saveCurrentForecast,
    //   getAllWorkGroupSetNames, getJobNumbersForWorkGroupSet, getStandardJobList, getJobMetadata
    // - forecast-editor.js: All forecast editor UI and interaction functions
    function saveCommentStore() {
      localStorage.setItem(COMMENT_STORAGE_KEY, JSON.stringify(commentStore));
    }

    async function saveCommentStoreAsync() {
      // Save to localStorage first (always)
      saveCommentStore();

      // Also save to API if enabled
      if (window.isApiEnabled && window.isApiEnabled() && window.saveCommentsToApi) {
        try {
          const apiSaved = await window.saveCommentsToApi(commentStore);
          if (!apiSaved && window.API_CONFIG?.forceServerPersistence) {
            alert('Server comment sync failed. Local cache updated, but Render database did not confirm the write.');
          }
        } catch (err) {
          console.warn('Failed to save comments to API (data saved locally):', err);
          if (window.API_CONFIG?.forceServerPersistence) {
            alert('Server comment sync failed. Local cache updated, but Render database did not confirm the write.');
          }
        }
      }
    }

    async function loadWorkOrderAmendmentsAsync() {
      if (window.isApiEnabled && window.isApiEnabled() && window.loadWorkOrderAmendmentsFromApi) {
        try {
          const apiData = await window.loadWorkOrderAmendmentsFromApi();
          if (apiData && typeof apiData === 'object') {
            workOrderAmendments = apiData;
            localStorage.setItem(WORK_ORDER_AMENDMENTS_KEY, JSON.stringify(workOrderAmendments));
            return;
          }
        } catch (err) {
          console.warn('Failed to load work order amendments from API, falling back to localStorage:', err);
        }
      }

      try {
        const raw = localStorage.getItem(WORK_ORDER_AMENDMENTS_KEY);
        workOrderAmendments = raw ? JSON.parse(raw) : {};
      } catch (err) {
        console.warn('Failed to load work order amendments:', err);
        workOrderAmendments = {};
      }
    }

    function saveWorkOrderAmendments() {
      localStorage.setItem(WORK_ORDER_AMENDMENTS_KEY, JSON.stringify(workOrderAmendments));
    }

    async function saveWorkOrderAmendmentsAsync() {
      saveWorkOrderAmendments();
      if (window.isApiEnabled && window.isApiEnabled() && window.saveWorkOrderAmendmentsToApi) {
        try {
          const ok = await window.saveWorkOrderAmendmentsToApi(workOrderAmendments);
          if (!ok && window.API_CONFIG?.forceServerPersistence) {
            alert('Server work order amendment sync failed. Local cache updated, but Render database did not confirm the write.');
          }
        } catch (err) {
          console.warn('Failed to save work order amendments to API (saved locally):', err);
        }
      }
    }

    function getAllGroups() {
      return [...publicGroupStore, ...groupStore];
    }

    function loadGroupStore() {
      try {
        const raw = localStorage.getItem(GROUP_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        groupStore = Array.isArray(parsed) ? parsed.map(group => ({ ...group, scope: 'private' })) : [];
      } catch (err) {
        console.warn('Failed to load group store:', err);
        groupStore = [];
      }
    }

    function saveGroupStore() {
      localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(groupStore));
    }

    async function loadGroupStoreAsync() {
      loadGroupStore();
      if (window.isApiEnabled && window.isApiEnabled() && window.loadPublicGroupsFromApi) {
        try {
          const publicGroups = await window.loadPublicGroupsFromApi();
          publicGroupStore = Array.isArray(publicGroups) ? publicGroups : [];
        } catch (err) {
          console.warn('Failed to load public groups from API:', err);
          publicGroupStore = [];
        }
      }
    }

    function serializeWorkDoneMap(workDoneMap) {
      if (!(workDoneMap instanceof Map)) return {};
      return Object.fromEntries(workDoneMap.entries());
    }

    function hydrateWorkDoneMap(rawData) {
      const map = new Map();
      for (const [jobNumber, payload] of Object.entries(rawData || {})) {
        map.set(jobNumber, payload || { periods: {}, wgs: {}, workOrders: [] });
      }
      return map;
    }

    async function runInChunks(items, handler, chunkSize = 300) {
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        chunk.forEach(handler);
        // Yield so large uploads don't freeze the UI
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    function loadWorkDoneFromLocal(year) {
      try {
        const raw = localStorage.getItem(WORK_DONE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const entry = parsed?.[year];
        if (!entry) return null;
        return {
          data: hydrateWorkDoneMap(entry.data || {}),
          uploadedAt: entry.uploadedAt || null
        };
      } catch (err) {
        console.warn('Failed to load local work done store:', err);
        return null;
      }
    }

    function saveWorkDoneToLocal(year, mapData, uploadedAt) {
      try {
        const raw = localStorage.getItem(WORK_DONE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[year] = {
          uploadedAt: uploadedAt || new Date().toISOString(),
          data: serializeWorkDoneMap(mapData)
        };
        localStorage.setItem(WORK_DONE_STORAGE_KEY, JSON.stringify(parsed));
      } catch (err) {
        console.warn('Failed to save local work done store:', err);
      }
    }

    async function loadWorkDoneStoreAsync(year) {
      if (!year) return;
      const local = loadWorkDoneFromLocal(year);
      if (local) {
        window.wData = local.data;
        workDoneUploadedAt = local.uploadedAt;
      }
      if (window.isApiEnabled && window.isApiEnabled() && window.loadWorkDoneFromApi) {
        try {
          const apiPayload = await window.loadWorkDoneFromApi(year);
          if (apiPayload?.data && Object.keys(apiPayload.data).length > 0) {
            window.wData = hydrateWorkDoneMap(apiPayload.data);
            workDoneUploadedAt = apiPayload.uploadedAt || workDoneUploadedAt;
            saveWorkDoneToLocal(year, window.wData, workDoneUploadedAt);
          }
        } catch (err) {
          console.warn('Failed to load work done from API:', err);
        }
      }
    }

    function getSelectedWorkDoneYear() {
      return document.getElementById('workDoneFySelect')?.value || currentFinancialYear;
    }

    function refreshWorkDoneYearSelector() {
      const select = document.getElementById('workDoneFySelect');
      if (!select) return;
      const options = getFinancialYearOptions ? getFinancialYearOptions() : [currentFinancialYear];
      const safeOptions = options.filter(Boolean);
      select.innerHTML = safeOptions.map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join('');
      const selected = getSelectedWorkDoneYear();
      if (safeOptions.includes(selected)) {
        select.value = selected;
      } else if (currentFinancialYear && safeOptions.includes(currentFinancialYear)) {
        select.value = currentFinancialYear;
      } else if (safeOptions.length) {
        select.value = safeOptions[0];
      }
    }

    function removeWorkDoneFromLocal(year) {
      try {
        const raw = localStorage.getItem(WORK_DONE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        delete parsed[year];
        localStorage.setItem(WORK_DONE_STORAGE_KEY, JSON.stringify(parsed));
      } catch (err) {
        console.warn('Failed to remove local work done snapshot:', err);
      }
    }

    function clearAllWorkDoneFromLocal() {
      localStorage.setItem(WORK_DONE_STORAGE_KEY, JSON.stringify({}));
    }

    async function clearWorkDoneForSelectedFy() {
      const year = getSelectedWorkDoneYear();
      if (!year) {
        alert('Please select a financial year.');
        return;
      }
      if (!confirm(`Clear work done snapshot for ${year}?`)) return;
      removeWorkDoneFromLocal(year);
      if (window.isApiEnabled && window.isApiEnabled() && window.deleteWorkDoneForYearFromApi) {
        await window.deleteWorkDoneForYearFromApi(year);
      }
      if (year === currentFinancialYear) {
        window.wData = null;
        workDoneUploadedAt = null;
        render();
      }
      alert(`Work done cleared for ${year}.`);
    }
    window.clearWorkDoneForSelectedFy = clearWorkDoneForSelectedFy;

    async function clearAllWorkDoneSnapshots() {
      if (!confirm('Clear ALL work done snapshots from local cache and server?')) return;
      clearAllWorkDoneFromLocal();
      if (window.isApiEnabled && window.isApiEnabled() && window.clearAllWorkDoneFromApi) {
        await window.clearAllWorkDoneFromApi();
      }
      window.wData = null;
      workDoneUploadedAt = null;
      render();
      alert('All work done snapshots cleared.');
    }
    window.clearAllWorkDoneSnapshots = clearAllWorkDoneSnapshots;

    function getGroupName(group) {
      const name = group.name ? String(group.name).trim() : '';
      const desc = group.description ? String(group.description).trim() : '';
      if (name && desc) return `${name} - ${desc}`;
      return name || desc || 'Unnamed Group';
    }

    function getUnitForJob(jobNumber) {
      return window.stdJobs.get(jobNumber)?.unit || window.currentJobsMap.get(jobNumber)?.unit || '';
    }

    function getGroupUnitLabel(group) {
      const units = getGroupUnits(group.jobNumbers || []);
      if (units.length === 1) return units[0].toUpperCase();
      if (units.length > 1) return 'Multiple Units';
      return 'Unit not specified';
    }

    function getGroupUnits(jobNumbers) {
      const units = jobNumbers
        .map(jobNumber => getUnitForJob(jobNumber))
        .filter(Boolean);
      return Array.from(new Set(units.map(unit => unit.toLowerCase().trim()))).filter(Boolean);
    }

    function validateGroupRollup(jobNumbers) {
      const units = getGroupUnits(jobNumbers);
      if (units.length > 1) {
        return { ok: false, message: 'Units of measure do not match across the selected jobs.' };
      }
      return { ok: true };
    }

    function updateGroupFilterOptions() {
      const select = document.getElementById('groupFilter');
      const container = document.getElementById('groupFilterContainer');
      if (!select) return;
      const current = select.value || 'all';
      const allGroups = getAllGroups();
      const options = [
        '<option value="all">All Standard Jobs</option>',
        ...allGroups.map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(getGroupName(group))}${group.scope === 'public' ? ' (Public)' : ''}</option>`)
      ];
      select.innerHTML = options.join('');
      select.value = allGroups.some(group => group.id === current) ? current : 'all';
      // Show/hide group filter container based on whether groups exist
      if (container) {
        container.style.display = allGroups.length > 0 ? 'flex' : 'none';
      }
    }

    // Engineer filter functions
    function updateEngineerFilterOptions() {
      const select = document.getElementById('engineerFilter');
      if (!select) return;
      const current = select.value || 'all';
      const engineers = window.getEngineers ? window.getEngineers() : [];
      const options = [
        '<option value="all">All Engineers</option>',
        ...engineers.map(eng => `<option value="${escapeHtml(eng.id)}">${escapeHtml(eng.name)}</option>`)
      ];
      select.innerHTML = options.join('');
      select.value = engineers.some(eng => eng.id === current) ? current : 'all';
    }

    function getSelectedEngineerWorkGroups() {
      const engineerFilter = document.getElementById('engineerFilter')?.value || 'all';
      if (engineerFilter === 'all' || !window.getEngineerWorkGroups) return null;
      return window.getEngineerWorkGroups(engineerFilter);
    }

    function onEngineerFilterChange() {
      // Update work group filter options based on selected engineer
      updateWorkGroupFilterOptions();
      render();
    }
    // Expose for HTML onclick handler
    window.onEngineerFilterChange = onEngineerFilterChange;

    function renderGroupList() {
      const list = document.getElementById('groupList');
      if (!list) return;
      const allGroups = getAllGroups();
      if (!allGroups.length) {
        list.innerHTML = '<p class="group-help">No groups created yet.</p>';
        return;
      }
      list.innerHTML = allGroups.map(group => `
        <div class="group-item">
          <div>
            <h4>${escapeHtml(getGroupName(group))}</h4>
            <p>${escapeHtml(group.jobNumbers.join(', '))} • Unit: ${escapeHtml(getGroupUnitLabel(group))}${group.rollUp ? ' • Roll Up' : ''} • ${group.scope === 'public' ? 'Public' : 'Private'}</p>
          </div>
          <div class="group-item-actions">
            <button type="button" class="group-action-button" data-group-edit="${escapeHtml(group.id)}">Edit</button>
            <button type="button" class="comment-delete" data-group-delete="${escapeHtml(group.id)}">Delete</button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('[data-group-edit]').forEach(button => {
        button.addEventListener('click', () => {
          openGroupModal(button.dataset.groupEdit);
        });
      });

      list.querySelectorAll('[data-group-delete]').forEach(button => {
        button.addEventListener('click', () => {
          deleteGroup(button.dataset.groupDelete);
        });
      });
    }

    function getSelectedGroupJobNumbers() {
      const selected = Array.from(document.querySelectorAll('#groupJobTable input[type="checkbox"]:checked'))
        .map(input => input.value)
        .filter(Boolean);
      return selected;
    }

    function updateGroupSelectionCount() {
      const countEl = document.getElementById('groupJobCount');
      if (!countEl) return;
      const selectedCount = getSelectedGroupJobNumbers().length;
      countEl.textContent = `${selectedCount} job${selectedCount === 1 ? '' : 's'} selected.`;
    }

    function renderGroupJobTable({ filterText = '', selectedJobs = null } = {}) {
      const table = document.getElementById('groupJobTable');
      if (!table) return;
      const normalizedFilter = filterText.toLowerCase().trim();
      const selectedSet = new Set(selectedJobs || getSelectedGroupJobNumbers());
      const jobs = Array.from(window.stdJobs.entries()).map(([jobNumber, meta]) => ({
        jobNumber,
        disc: meta?.disc || '',
        desc: meta?.desc || '',
        unit: meta?.unit || '',
        mnt: meta?.mnt || ''
      }));
      const filtered = jobs.filter(job => {
        if (!normalizedFilter) return true;
        const haystack = [job.jobNumber, job.disc, job.desc, job.unit, job.mnt].join(' ').toLowerCase();
        return haystack.includes(normalizedFilter);
      });

      const rows = filtered.map(job => `
        <tr>
          <td>
            <input type="checkbox" value="${escapeHtml(job.jobNumber)}" ${selectedSet.has(job.jobNumber) ? 'checked' : ''}>
          </td>
          <td>${escapeHtml(job.disc)}</td>
          <td>${escapeHtml(job.mnt)}</td>
          <td>${escapeHtml(job.jobNumber)}</td>
          <td>${escapeHtml(job.desc)}</td>
          <td>${escapeHtml(job.unit)}</td>
        </tr>
      `).join('');

      table.innerHTML = `
        <thead>
          <tr>
            <th>Select</th>
            <th>Discipline</th>
            <th>MNT</th>
            <th>Job</th>
            <th>Description</th>
            <th>Unit</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6"><em>No standard jobs match the current filter.</em></td></tr>'}</tbody>
      `;

      table.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', () => {
          updateGroupSelectionCount();
          updateGroupRollupHelp();
        });
      });

      updateGroupSelectionCount();
    }

    function resetGroupForm() {
      const form = document.getElementById('groupForm');
      if (!form) return;
      form.reset();
      editingGroupId = null;
      document.getElementById('groupModalTitle').textContent = 'Create Group';
      document.getElementById('groupSubmit').textContent = 'Save Group';
      const scopeInput = document.getElementById('groupScope');
      if (scopeInput) {
        scopeInput.disabled = false;
        scopeInput.value = 'private';
      }
      const searchInput = document.getElementById('groupJobSearch');
      if (searchInput) searchInput.value = '';
      renderGroupJobTable({ filterText: '', selectedJobs: [] });
      updateGroupRollupHelp();
    }

    function openGroupModal(groupId = null) {
      const modal = document.getElementById('groupModal');
      if (!modal) return;
      resetGroupForm();
      if (groupId) {
        const group = getAllGroups().find(entry => entry.id === groupId);
        if (group) {
          editingGroupId = groupId;
          document.getElementById('groupModalTitle').textContent = 'Edit Group';
          document.getElementById('groupSubmit').textContent = 'Update Group';
          document.getElementById('groupName').value = group.name || '';
          document.getElementById('groupDesc').value = group.description || '';
          document.getElementById('groupRollup').checked = Boolean(group.rollUp);
          const scopeInput = document.getElementById('groupScope');
          if (scopeInput) {
            scopeInput.value = group.scope || 'private';
            scopeInput.disabled = true;
          }
        }
      }
      renderGroupList();
      renderGroupJobTable({
        filterText: document.getElementById('groupJobSearch')?.value || '',
        selectedJobs: groupId ? getAllGroups().find(entry => entry.id === groupId)?.jobNumbers || [] : []
      });
      updateGroupRollupHelp();
      modal.classList.add('open');
    }

    function closeGroupModal() {
      document.getElementById('groupModal').classList.remove('open');
    }

    async function deleteGroup(groupId) {
      const group = getAllGroups().find(entry => entry.id === groupId);
      if (!group) return;
      const confirmed = confirm(`Delete group "${getGroupName(group)}"?`);
      if (!confirmed) return;
      if (group.scope === 'public') {
        if (window.isApiEnabled && window.isApiEnabled() && window.deletePublicGroupFromApi) {
          await window.deletePublicGroupFromApi(groupId);
        }
        publicGroupStore = publicGroupStore.filter(entry => entry.id !== groupId);
      } else {
        groupStore = groupStore.filter(entry => entry.id !== groupId);
        saveGroupStore();
      }
      updateGroupFilterOptions();
      renderGroupList();
      render();
    }

    async function handleGroupSubmit(event) {
      event.preventDefault();
      const name = document.getElementById('groupName').value.trim();
      const jobNumbers = getSelectedGroupJobNumbers();
      const description = document.getElementById('groupDesc').value.trim();
      const rollUp = document.getElementById('groupRollup').checked;
      const scope = document.getElementById('groupScope')?.value || 'private';
      if (!jobNumbers.length) {
        alert('Please enter at least one Standard Job Number.');
        return;
      }
      if (rollUp) {
        const validation = validateGroupRollup(jobNumbers);
        if (!validation.ok) {
          alert(validation.message);
          return;
        }
      }
      const groupPayload = {
        id: editingGroupId || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name,
        jobNumbers: Array.from(new Set(jobNumbers)),
        description,
        rollUp,
        scope
      };

      if (scope === 'public') {
        if (!(window.isApiEnabled && window.isApiEnabled() && window.savePublicGroupToApi)) {
          alert('Public groups require API mode.');
          return;
        }
        const saved = await window.savePublicGroupToApi(groupPayload);
        if (!saved) {
          alert('Failed to save public group.');
          return;
        }
        const next = { ...saved, scope: 'public' };
        if (editingGroupId) {
          publicGroupStore = publicGroupStore.map(entry => (entry.id === editingGroupId ? next : entry));
        } else {
          publicGroupStore.unshift(next);
        }
      } else {
        if (editingGroupId) {
          groupStore = groupStore.map(entry => (entry.id === editingGroupId ? groupPayload : entry));
        } else {
          groupStore.push(groupPayload);
        }
        saveGroupStore();
      }
      updateGroupFilterOptions();
      renderGroupList();
      render();
      resetGroupForm();
    }

    function updateGroupRollupHelp() {
      const help = document.getElementById('groupRollupHelp');
      if (!help) return;
      const jobNumbers = getSelectedGroupJobNumbers();
      const rollUp = document.getElementById('groupRollup').checked;
      if (!rollUp) {
        help.textContent = 'Units must match across jobs to roll up.';
        help.style.color = '#64748b';
        return;
      }
      const validation = validateGroupRollup(jobNumbers);
      if (!validation.ok) {
        help.textContent = validation.message;
        help.style.color = '#b91c1c';
      } else {
        help.textContent = 'Units match. This group can be rolled up.';
        help.style.color = '#15803d';
      }
    }

    function getWorkOrderAmendment(orderId) {
      return workOrderAmendments?.[orderId] || null;
    }

    function updateWorkOrderAmendment(orderId, units, originalUnits) {
      const numeric = Number(units);
      if (!Number.isFinite(numeric)) return;
      const original = Number(originalUnits);
      const isSame = Number.isFinite(original) && Math.abs(numeric - original) < 0.0001;
      if (isSame) {
        delete workOrderAmendments[orderId];
      } else {
        workOrderAmendments[orderId] = {
          units: numeric,
          updatedAt: new Date().toISOString()
        };
      }
      saveWorkOrderAmendmentsAsync();
    }

    function formatUnits(value) {
      return (Number(value) || 0).toFixed(2);
    }

    function applyWorkOrderUnitAmendment(orderId, nextUnits) {
      const updatedUnits = Number(nextUnits);
      if (!Number.isFinite(updatedUnits)) return false;
      const order = currentWorkOrders.find(item => item.id === orderId);
      if (!order) return false;
      const job = window.wData?.get(order.jobNumber);
      if (!job) return false;
      const previousUnits = Number(order.units) || 0;
      if (Math.abs(previousUnits - updatedUnits) < 0.0001) return false;
      const delta = updatedUnits - previousUnits;
      order.units = updatedUnits;
      order.isAmended = Number.isFinite(order.originalUnits)
        ? Math.abs(updatedUnits - order.originalUnits) >= 0.0001
        : true;
      const jobOrder = job.workOrders?.find(item => item.id === orderId);
      if (jobOrder) {
        jobOrder.units = updatedUnits;
        jobOrder.isAmended = order.isAmended;
      }
      job.periods[order.period] = (job.periods[order.period] || 0) + delta;
      if (!job.wgs[order.workGroup]) job.wgs[order.workGroup] = {};
      job.wgs[order.workGroup][order.period] = (job.wgs[order.workGroup][order.period] || 0) + delta;
      updateWorkOrderAmendment(orderId, updatedUnits, order.originalUnits);
      render();
      const updatedJob = window.currentJobsMap.get(order.jobNumber);
      if (updatedJob) {
        showBreakdown(updatedJob, { scrollTop: false });
      }
      if (document.getElementById('breakdown')?.classList.contains('show')) {
        renderBreakdownWorkGroupTable();
      }
      return true;
    }

    function getJobComments(jobNumber) {
      const allComments = commentStore[jobNumber] || [];
      // Comments belong to the financial year, so every RF review in that FY
      // shares the same conversation while comments from other FYs stay hidden.
      return allComments.filter(comment => {
        const commentFY = comment.fy || comment.financialYear;
        return commentFY === currentFinancialYear;
      });
    }

    async function addJobComment(jobNumber, category, value, details = {}) {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (!commentStore[jobNumber]) commentStore[jobNumber] = [];
      const newComment = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        jobNumber,
        category,
        text: trimmed,
        timestamp: new Date().toISOString(),
        fy: currentFinancialYear,
        rf: currentReviewStage,
        rootCause: String(details.rootCause || '').trim(),
        correctiveAction: String(details.correctiveAction || '').trim(),
        owner: String(details.owner || '').trim(),
        dueDate: String(details.dueDate || '').trim(),
        evidenceLinks: Array.isArray(details.evidenceLinks) ? details.evidenceLinks : [],
        deliveryUnit: currentDeliveryUnit === 'all' ? '' : currentDeliveryUnit,
        filteredWorkGroup: String(details.filteredWorkGroup || '').trim(),
        filteredEngineerId: String(details.filteredEngineerId || '').trim(),
        filteredEngineerName: String(details.filteredEngineerName || '').trim()
      };
      commentStore[jobNumber].unshift(newComment);

      // Save to localStorage
      saveCommentStore();

      // Save single comment to API if enabled
      if (window.isApiEnabled && window.isApiEnabled() && window.saveCommentToApi) {
        try {
          const apiSaved = await window.saveCommentToApi({ ...newComment, jobNumber });
          if (!apiSaved && window.API_CONFIG?.forceServerPersistence) {
            alert('Server comment save failed. Local cache updated, but Render database did not confirm the write.');
          }
        } catch (err) {
          console.warn('Failed to save comment to API (saved locally):', err);
          if (window.API_CONFIG?.forceServerPersistence) {
            alert('Server comment save failed. Local cache updated, but Render database did not confirm the write.');
          }
        }
      }
    }

    async function deleteJobComment(jobNumber, id) {
      if (!commentStore[jobNumber]) return;
      commentStore[jobNumber] = commentStore[jobNumber].filter(entry => entry.id !== id);

      // Save to localStorage first
      saveCommentStore();

      // Delete from API if enabled
      if (window.isApiEnabled && window.isApiEnabled() && window.deleteCommentFromApi) {
        try {
          const deleted = await window.deleteCommentFromApi(id);
          if (!deleted && window.API_CONFIG?.forceServerPersistence) {
            alert('Server comment delete failed. Local cache changed, but Render database delete was not confirmed.');
          }
        } catch (err) {
          console.warn('Failed to delete comment from API (deleted locally):', err);
          if (window.API_CONFIG?.forceServerPersistence) {
            alert('Server comment delete failed. Local cache changed, but Render database delete was not confirmed.');
          }
        }
      }
    }

    async function init() {
      await loadCommentStoreAsync();
      await loadReviewStoreAsync();
      initializeForecastContext();  // Load forecast context from localStorage
      await loadWorkOrderAmendmentsAsync();
      await loadGroupStoreAsync();
      refreshWorkDoneYearSelector();
      loadBreakdownPlanVersion();
    try { disciplineCollapseState = JSON.parse(localStorage.getItem('aprDisciplineCollapseStateV1') || '{}'); } catch { disciplineCollapseState = {}; }
    initForecastCutoffTimeline();
      loadWgDisplayMode();
      const stageDisplay = document.getElementById('reviewStageDisplay');
      if (stageDisplay && window.currentReviewStage) stageDisplay.textContent = window.currentReviewStage;
      const fyDisplay = document.getElementById('financialYearDisplay');
      if (fyDisplay) fyDisplay.textContent = window.currentFinancialYear || 'FY';
      updateContextControls();
      if (typeof WORK_GROUP_SETS_RAW !== 'undefined') {
        WORK_GROUP_SETS_RAW.split('\n').slice(1).forEach(line => {
          const p = line.split('\t');
          if (p.length >= 2) {
            window.workGroupSets.set(p[0].trim(), p[1].trim());
          }
        });
        console.log('✓ Work group sets loaded:', window.workGroupSets.size);
      } else {
        console.warn('⚠ work-group-sets-data.js not found - using raw values');
      }
      // Check if external file loaded
      if (typeof STANDARD_JOBS_RAW !== 'undefined') {
        STANDARD_JOBS_RAW.split('\n').slice(1).forEach(line => {
          const p = line.split('\t');
          if (p.length >= 5) {
            window.stdJobs.set(p[2].trim().padStart(6,'0'), {
              disc: p[0].trim(), mnt: p[1].trim(), desc: p[3].trim(), unit: p[4].trim()
            });
          }
        });
        console.log('✓ Standard jobs loaded:', window.stdJobs.size);
      } else {
        console.warn('⚠ standard-jobs-data.js not found - all jobs will be processed');
        // Process all jobs when no filter available
      }
      if (currentFinancialYear && currentReviewStage) {
        currentPlanVersion = getPreferredPlanVersion(currentFinancialYear);
        refreshWorkDoneYearSelector();
        await loadWorkDoneStoreAsync(currentFinancialYear);
        const forecastCache = await loadForecastFromStorageAsync(currentFinancialYear, currentPlanVersion);
        if (forecastCache) {
          fData = currentPlanVersion === 'v1' ? getEffectiveForecastSnapshot(currentFinancialYear).data : forecastCache.data;
          updateWorkGroupFilterOptions();
          console.log('✓ Forecast loaded on init', forecastCache.savedAt ? `(${forecastCache.savedAt})` : '', window.isApiEnabled() ? '[API]' : '[local]');
        } else {
          // Load from GitHub or library if not in storage/API
          const libraryForecast = await loadForecastFromLibraryAsync(currentFinancialYear, currentPlanVersion);
          if (libraryForecast) {
            fData = currentPlanVersion === 'v1' ? getEffectiveForecastSnapshot(currentFinancialYear).data : libraryForecast.data;
            updateWorkGroupFilterOptions();
            const source = libraryForecast.source === 'github' ? 'GitHub' : 'library';
            console.log(`✓ Forecast loaded from ${source} on init`);
          }
        }
      }
      updateGroupFilterOptions();
      updateEngineerFilterOptions();
      const groupForm = document.getElementById('groupForm');
      if (groupForm) {
        groupForm.addEventListener('submit', handleGroupSubmit);
      }
      const compareChangedOnly = document.getElementById('compareChangedOnly');
      const compareSearch = document.getElementById('compareSearch');
      if (compareChangedOnly) {
        compareChangedOnly.addEventListener('change', renderForecastComparison);
      }
      if (compareSearch && window.debounce) {
        const debouncedCompare = window.debounce(renderForecastComparison, 300);
        compareSearch.addEventListener('input', debouncedCompare);
      }
      const groupJobSearch = document.getElementById('groupJobSearch');
      const groupRollupInput = document.getElementById('groupRollup');
      if (groupJobSearch && window.debounce) {
        const debouncedRender = window.debounce(() => {
          renderGroupJobTable({ filterText: groupJobSearch.value });
        }, 300);
        groupJobSearch.addEventListener('input', debouncedRender);
      }
      if (groupRollupInput) groupRollupInput.addEventListener('change', updateGroupRollupHelp);
    }

    function extractJob(txt) {
      if (!txt) return null;
      const s = String(txt).trim().split('-')[0].trim();
      const m = s.match(/(\d{6})/);
      return m ? m[1] : null;
    }

    function normalizeWorkGroupSet(raw) {
      if (!raw) return 'Unspecified';
      const text = String(raw).trim();
      if (!text) return 'Unspecified';
      const code = text.split(/\s+/)[0].toUpperCase();
      // Try lookup by code
      if (window.workGroupSets.has(code)) return window.workGroupSets.get(code);
      // Try lookup by full text as code
      const upperText = text.toUpperCase();
      if (window.workGroupSets.has(upperText)) return window.workGroupSets.get(upperText);
      // Try matching against description values (for Work Done files that have descriptions instead of codes)
      // Normalize: lowercase, collapse whitespace, remove spaces before parentheses
      const normalizeForMatch = (s) => s.toLowerCase().replace(/\s+/g, ' ').replace(/\s*\(/g, '(').trim();
      const normalizedInput = normalizeForMatch(text);
      for (const [wgCode, description] of window.workGroupSets) {
        if (normalizeForMatch(description) === normalizedInput) {
          return description; // Return canonical description
        }
      }
      return text;
    }

    function getEngineerForWorkGroupNormalized(workGroupCode) {
      if (!workGroupCode || !window.getEngineers) return null;
      const normalizedWorkGroup = normalizeWorkGroupSet(workGroupCode);
      return window.getEngineers().find(eng =>
        eng.workGroupSets.some(setCode =>
          normalizeWorkGroupSet(setCode) === normalizedWorkGroup
        )
      ) || null;
    }

    function extractWorkOrderNumber(row) {
      const raw = row['Work Order'] ||
        row['Work Order Number'] ||
        row['Work Order No'] ||
        row['WO Number'] ||
        row['WO No'] ||
        row['Work Order #'] ||
        row['WO #'] ||
        '';
      const text = String(raw || '').trim();
      return text || null;
    }

    function getVarianceStatus(pd) {
      const variance = Number(pd?.v || 0);
      const forecast = Number(pd?.f || 0);
      const actual = Number(pd?.a || 0);
      const hasNoForecast = forecast === 0;
      if (hasNoForecast) {
        return {
          status: actual === 0 ? 'good' : 'noforecast',
          hasVariance: variance !== 0,
          hasNoForecast: true
        };
      }
      const ratio = Math.abs(variance / forecast);
      const status = ratio > 0.5 ? 'bad' : ratio > 0.1 ? 'warning' : 'good';
      return { status, hasVariance: variance !== 0, hasNoForecast: false };
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getWorkGroupOptions() {
      const names = new Set();
      const forecastSnapshot = currentPlanVersion === 'v1'
        ? getEffectiveForecastSnapshot(currentFinancialYear)
        : getForecastSnapshot(currentFinancialYear, 'v0');
      [forecastSnapshot?.data, window.wData].forEach(source => {
        if (!source) return;
        source.forEach(job => {
          Object.keys(job.wgs || {}).forEach(wg => {
            if (wg) names.add(normalizeWorkGroupSet(wg));
          });
        });
      });
      return Array.from(names).sort((a, b) => a.localeCompare(b));
    }

    function getCommentSummary() {
      const counts = {};
      let total = 0;
      Object.values(commentStore || {}).forEach(comments => {
        comments.forEach(entry => {
          // Filter by current FY across all RF stages
          const commentFY = entry.fy || entry.financialYear;
          if (commentFY !== currentFinancialYear) return;

          total += 1;
          const category = entry.category || 'General';
          counts[category] = (counts[category] || 0) + 1;
        });
      });
      return { total, counts };
    }

    function getJobHealthStatus(varianceData) {
      const forecast = Math.abs(varianceData.f || 0);
      const rawVariance = varianceData.v || 0;
      const absVariance = Math.abs(rawVariance);
      const variancePercent = forecast > 0 ? (absVariance / forecast) * 100 : (absVariance !== 0 ? 100 : 0);
      const isOverdelivering = rawVariance > 0;

      if (variancePercent >= 50) {
        const label = isOverdelivering ? 'OVER DELIVERED' : 'UNDER DELIVERED';
        return { status: 'critical', label, percent: variancePercent, isOverdelivering };
      } else if (variancePercent >= 10) {
        const label = isOverdelivering ? 'AHEAD OF PLAN' : 'BEHIND PLAN';
        return { status: 'warning', label, percent: variancePercent, isOverdelivering };
      } else {
        return { status: 'good', label: 'ON TRACK', percent: variancePercent, isOverdelivering };
      }
    }


    function normalizePeriodKey(value) {
      if (!value || value === 'all') return value;
      const numeric = parseInt(String(value).replace(/[^0-9]/g, ''), 10);
      if (Number.isNaN(numeric)) return String(value).toUpperCase();
      return `P${numeric}`;
    }

    function updateForecastHealth({ baseFiltered, period, getJobDisplayData, varianceFilter }) {
      if (!baseFiltered || !baseFiltered.length) {
        // Hide or clear health indicator when no jobs
        ['healthBarGreen', 'healthBarAmber', 'healthBarRed', 'healthBarGrey'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.width = '0%';
        });

        ['healthGoodCount', 'healthWarningCount', 'healthCriticalCount', 'healthNoForecastCount'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '0';
        });
        ['healthGoodPercent', 'healthWarningPercent', 'healthCriticalPercent', 'healthNoForecastPercent'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '0%';
        });
        ['legendGoodCount', 'legendWarningCount', 'legendCriticalCount', 'legendNoForecastCount'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '0';
        });

        const healthJobCount = document.getElementById('healthJobCount');
        if (healthJobCount) healthJobCount.textContent = '0 jobs';

        const healthIssues = document.getElementById('healthIssues');
        if (healthIssues) healthIssues.innerHTML = '';
        return;
      }

      // Calculate health metrics based on variance
      let goodCount = 0;
      let warningCount = 0;
      let criticalCount = 0;
      let noForecastCount = 0;
      baseFiltered.forEach(job => {
        const displayData = getJobDisplayData(job);
        const pd = period === 'all' ? displayData.tot : displayData.periods[period];
        const forecast = Math.abs(pd.f || 0);
        const variance = Math.abs(pd.v || 0);

        // Check if job has no forecast
        if (forecast === 0 && (pd.a || 0) === 0) {
          noForecastCount++;
          return;
        }

        const variancePercent = forecast > 0 ? (variance / forecast) * 100 : (variance !== 0 ? 100 : 0);

        if (variancePercent < 10) {
          goodCount++;
        } else if (variancePercent < 50) {
          warningCount++;
        } else {
          criticalCount++;
        }
      });

      const totalJobs = baseFiltered.length;
      const jobsWithForecast = goodCount + warningCount + criticalCount;
      const goodPercent = totalJobs > 0 ? Math.round((goodCount / totalJobs) * 100) : 0;
      const warningPercent = totalJobs > 0 ? Math.round((warningCount / totalJobs) * 100) : 0;
      const criticalPercent = totalJobs > 0 ? Math.round((criticalCount / totalJobs) * 100) : 0;
      const noForecastPercent = totalJobs > 0 ? Math.round((noForecastCount / totalJobs) * 100) : 0;

      // Update segmented health bar
      const healthBarGreen = document.getElementById('healthBarGreen');
      const healthBarAmber = document.getElementById('healthBarAmber');
      const healthBarRed = document.getElementById('healthBarRed');
      const healthBarGrey = document.getElementById('healthBarGrey');

      if (healthBarGreen) healthBarGreen.style.width = `${goodPercent}%`;
      if (healthBarAmber) healthBarAmber.style.width = `${warningPercent}%`;
      if (healthBarRed) healthBarRed.style.width = `${criticalPercent}%`;
      if (healthBarGrey) healthBarGrey.style.width = `${noForecastPercent}%`;

      // Update job count display
      const healthJobCount = document.getElementById('healthJobCount');
      if (healthJobCount) healthJobCount.textContent = `${totalJobs} jobs`;

      // Update stat counts
      const updateEl = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };

      updateEl('healthGoodCount', goodCount);
      updateEl('healthWarningCount', warningCount);
      updateEl('healthCriticalCount', criticalCount);
      updateEl('healthNoForecastCount', noForecastCount);

      updateEl('healthGoodPercent', `${goodPercent}%`);
      updateEl('healthWarningPercent', `${warningPercent}%`);
      updateEl('healthCriticalPercent', `${criticalPercent}%`);
      updateEl('healthNoForecastPercent', `${noForecastPercent}%`);

      // Update legend counts
      updateEl('legendGoodCount', goodCount);
      updateEl('legendWarningCount', warningCount);
      updateEl('legendCriticalCount', criticalCount);
      updateEl('legendNoForecastCount', noForecastCount);

      // Update active state for filter
      document.querySelectorAll('.health-stat[data-filter]').forEach(stat => {
        const filter = stat.dataset.filter;
        stat.classList.toggle('active', filter && filter === varianceFilter);
      });
      document.querySelectorAll('.health-legend-clickable-item[data-filter]').forEach(item => {
        const filter = item.dataset.filter;
        item.classList.toggle('active', filter && filter === varianceFilter);
      });
      document.querySelectorAll('.health-bar-segment[data-filter]').forEach(segment => {
        const filter = segment.dataset.filter;
        segment.classList.toggle('active', filter && filter === varianceFilter);
      });
    }

    function getPeriodNumber(period) {
      if (!period || period === 'all') return 13;
      const numeric = parseInt(String(period).replace(/[^0-9]/g, ''), 10);
      return Number.isNaN(numeric) ? 13 : Math.max(1, Math.min(13, numeric));
    }

    function getTopVariancePeriodLabel(period) {
      if (!period || period === 'all') return 'Full year';
      return `Period ${getPeriodNumber(period)}`;
    }

    function getTopVarianceThroughLabel(periodNumber) {
      const normalizedPeriodNumber = Math.max(1, Math.min(13, Number(periodNumber) || 13));
      return `Overall to P${normalizedPeriodNumber}`;
    }

    function formatSignedUnits(value, decimals = 1) {
      const numeric = Number(value) || 0;
      return `${numeric > 0 ? '+' : ''}${numeric.toFixed(decimals)}`;
    }

    function getSelectDisplayText(id, fallback = 'All') {
      const select = document.getElementById(id);
      if (!select) return fallback;
      const option = select.options?.[select.selectedIndex];
      return option ? option.textContent.trim() : (select.value || fallback);
    }

    function getTopVarianceSelectionMeta(period, varianceFilter, reviewStatusFilter = 'all') {
      const parts = [
        currentFinancialYear,
        currentPlanVersion,
        currentReviewStage,
        getTopVariancePeriodLabel(period),
        `Group: ${getSelectDisplayText('groupFilter')}`,
        `Delivery unit: ${currentDeliveryUnit === 'all' ? 'All Delivery Units' : currentDeliveryUnit}`,
        `Engineer: ${getSelectDisplayText('engineerFilter')}`,
        `Work group: ${getSelectDisplayText('wgFilter')}`
      ].filter(Boolean);
      if (reviewStatusFilter && reviewStatusFilter !== 'all') {
        parts.push(`Review status: ${getSelectDisplayText('reviewStatusFilter')}`);
      }
      if (varianceFilter && varianceFilter !== 'all') {
        parts.push(`Variance filter: ${getSelectDisplayText('varianceFilter')}`);
      }
      return parts.join(' • ');
    }

    function buildTopVarianceBriefData({ baseFiltered, period, getJobDisplayData, varianceFilter, reviewStatusFilter }) {
      const periodNumber = getPeriodNumber(period);
      const throughLabel = getTopVarianceThroughLabel(periodNumber);
      const items = (baseFiltered || [])
        .map(job => {
          const displayData = getJobDisplayData(job);
          let cumulativeForecast = 0;
          let cumulativeActual = 0;
          let cumulativeWorkDone = 0;
          const chartLabels = [];
          const forecastSeries = [];
          const actualSeries = [];
          for (let i = 1; i <= periodNumber; i++) {
            const p = `P${i}`;
            const data = displayData.periods[p] || { f: 0, a: 0, wd: 0, v: 0 };
            cumulativeForecast += data.f || 0;
            cumulativeActual += data.a || 0;
            cumulativeWorkDone += data.wd || 0;
            chartLabels.push(`P${i}`);
            forecastSeries.push(cumulativeForecast);
            actualSeries.push(cumulativeActual);
          }
          const cumulativeVariance = cumulativeActual - cumulativeForecast;
          const selected = {
            f: cumulativeForecast,
            a: cumulativeActual,
            wd: cumulativeWorkDone,
            v: cumulativeVariance
          };
          return {
            job,
            selected,
            variance: cumulativeVariance,
            chartLabels,
            forecastSeries,
            actualSeries
          };
        })
        .filter(item => Math.abs(item.variance) > 0.0001)
        .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
        .slice(0, 10);

      const selectedTotals = items.reduce((acc, item) => {
        acc.f += item.selected.f || 0;
        acc.a += item.selected.a || 0;
        acc.wd += item.selected.wd || 0;
        acc.v += item.selected.v || 0;
        return acc;
      }, { f: 0, a: 0, wd: 0, v: 0 });

      return {
        items,
        selectedTotals,
        period,
        periodNumber,
        periodLabel: getTopVariancePeriodLabel(period),
        throughLabel,
        meta: getTopVarianceSelectionMeta(period, varianceFilter, reviewStatusFilter)
      };
    }

    function destroyTopVarianceBriefCharts() {
      topVarianceBriefCharts.forEach(chart => chart?.destroy?.());
      topVarianceBriefCharts = [];
    }

    function renderTopVariancesModal() {
      const data = latestTopVarianceBrief;
      const modal = document.getElementById('topVariancesModal');
      const metaEl = document.getElementById('topVarianceModalMeta');
      const summaryEl = document.getElementById('topVarianceBriefSummary');
      const gridEl = document.getElementById('topVarianceSlideGrid');
      if (!modal || !summaryEl || !gridEl) return;

      destroyTopVarianceBriefCharts();
      if (!data || !data.items.length) {
        if (metaEl) metaEl.textContent = 'No variance data for the current dashboard selection.';
        summaryEl.innerHTML = '';
        gridEl.innerHTML = '<div class="empty-slide-state">No variances to display for the current filters.</div>';
        return;
      }

      if (metaEl) metaEl.textContent = data.meta;
      const totalClass = data.selectedTotals.v > 0 ? 'positive' : data.selectedTotals.v < 0 ? 'negative' : 'neutral';
      summaryEl.innerHTML = `
        <div class="brief-summary-card"><span>Selection</span><strong>${escapeHtml(data.throughLabel)}</strong></div>
        <div class="brief-summary-card"><span>Jobs shown</span><strong>${data.items.length}</strong></div>
        <div class="brief-summary-card"><span>Forecast to P${data.periodNumber}</span><strong>${formatUnits(data.selectedTotals.f)}</strong></div>
        <div class="brief-summary-card"><span>Actual to P${data.periodNumber}</span><strong>${formatUnits(data.selectedTotals.a)}</strong></div>
        <div class="brief-summary-card"><span>Work Done to P${data.periodNumber}</span><strong>${formatUnits(data.selectedTotals.wd)}</strong></div>
        <div class="brief-summary-card"><span>Variance to P${data.periodNumber}</span><strong class="${totalClass}">${formatSignedUnits(data.selectedTotals.v)}</strong></div>
      `;

      gridEl.innerHTML = data.items.map((item, index) => {
        const selectedClass = item.variance > 0 ? 'positive' : item.variance < 0 ? 'negative' : 'neutral';
        const health = getJobHealthStatus(item.selected);
        return `
          <article class="top-variance-slide-card">
            <div class="slide-card-heading">
              <div>
                <div class="slide-card-rank">#${index + 1}</div>
                <h3>${escapeHtml(item.job.jn)}</h3>
                <p>${escapeHtml(item.job.desc)}</p>
              </div>
              <span class="slide-rag slide-rag-${health.status}">${escapeHtml(health.label)}</span>
            </div>
            <div class="slide-period-summary">
              <div><span>Forecast to P${data.periodNumber}</span><strong>${formatUnits(item.selected.f)}</strong></div>
              <div><span>Actual to P${data.periodNumber}</span><strong>${formatUnits(item.selected.a)}</strong></div>
              <div><span>Work Done to P${data.periodNumber}</span><strong>${formatUnits(item.selected.wd || 0)}</strong></div>
              <div><span>${escapeHtml(data.throughLabel)}</span><strong class="${selectedClass}">${formatSignedUnits(item.variance)}</strong></div>
            </div>
            <div class="slide-chart-wrap"><canvas id="topVarianceChart${index}" aria-label="Cumulative forecast and work done for ${escapeHtml(item.job.jn)}"></canvas></div>
          </article>
        `;
      }).join('');

      data.items.forEach((item, index) => {
        const canvas = document.getElementById(`topVarianceChart${index}`);
        if (!canvas) return;
        const chart = new Chart(canvas, {
          type: 'line',
          data: {
            labels: item.chartLabels,
            datasets: [
              {
                label: 'Forecast',
                data: item.forecastSeries,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.08)',
                borderWidth: 2,
                pointRadius: 1.5,
                tension: 0.25,
                fill: false
              },
              {
                label: 'Work Done',
                data: item.actualSeries,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                borderWidth: 2,
                pointRadius: 1.5,
                tension: 0.25,
                fill: false
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
              tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}` } }
            },
            scales: {
              x: { ticks: { font: { size: 10 }, maxRotation: 0 }, grid: { display: false } },
              y: { beginAtZero: true, ticks: { font: { size: 10 } } }
            }
          }
        });
        topVarianceBriefCharts.push(chart);
      });
    }

    function openTopVariancesModal() {
      renderTopVariancesModal();
      document.getElementById('topVariancesModal')?.classList.add('open');
    }
    window.openTopVariancesModal = openTopVariancesModal;

    function closeTopVariancesModal() {
      document.getElementById('topVariancesModal')?.classList.remove('open');
      destroyTopVarianceBriefCharts();
    }
    window.closeTopVariancesModal = closeTopVariancesModal;

    function updateTopBarStats({ jobs, baseFiltered, period, getJobDisplayData, reviewStage, varianceFilter, reviewStatusFilter }) {
      const totalJobs = jobs.length;
      const reviewedJobs = jobs.filter(job => isJobReviewed(job.jn, reviewStage)).length;
      const percent = totalJobs ? Math.round((reviewedJobs / totalJobs) * 100) : 0;

      const reviewedEl = document.getElementById('reviewedCount');
      const totalEl = document.getElementById('totalCount');
      const percentEl = document.getElementById('reviewPercent');
      const progressEl = document.getElementById('reviewProgress');
      const stageDisplay = document.getElementById('reviewStageDisplay');
      if (reviewedEl) reviewedEl.textContent = reviewedJobs;
      if (totalEl) totalEl.textContent = totalJobs;
      if (percentEl) percentEl.textContent = `${percent}% jobs reviewed at ${reviewStage}`;
      if (progressEl) progressEl.style.width = `${percent}%`;
      if (stageDisplay) stageDisplay.textContent = reviewStage;
      const disciplineProgressEl = document.getElementById('disciplineProgressList');
      if (disciplineProgressEl) {
        const byDiscipline = new Map();
        (baseFiltered || []).forEach(job => {
          const discipline = String(job.disc || 'Other').trim() || 'Other';
          if (!byDiscipline.has(discipline)) byDiscipline.set(discipline, { total: 0, reviewed: 0 });
          const entry = byDiscipline.get(discipline);
          entry.total += 1;
          if (isJobReviewed(job.jn, reviewStage)) entry.reviewed += 1;
        });

        const rows = [...byDiscipline.entries()]
          .sort((a, b) => {
            const pctA = a[1].total ? a[1].reviewed / a[1].total : 0;
            const pctB = b[1].total ? b[1].reviewed / b[1].total : 0;
            if (pctB !== pctA) return pctB - pctA;
            return b[1].total - a[1].total;
          })
          .slice(0, 8)
          .map(([discipline, stats]) => {
            const pct = stats.total ? Math.round((stats.reviewed / stats.total) * 100) : 0;
            return `<li class="discipline-progress-item"><span class="discipline-progress-name">${escapeHtml(discipline)}</span><span class="discipline-progress-count">${stats.reviewed}/${stats.total}</span><span class="discipline-progress-pct">${pct}%</span></li>`;
          })
          .join('');

        disciplineProgressEl.innerHTML = rows || '<li class="discipline-progress-item"><span class="discipline-progress-name">No jobs</span><span class="discipline-progress-count">0/0</span><span class="discipline-progress-pct">0%</span></li>';
      }

      // Update Work Order Activity card
      let totalWorkOrders = 0;
      let totalUnits = 0;
      let flaggedCount = 0;
      let amendedCount = 0;
      if (window.wData) {
        window.wData.forEach(jobData => {
          const workOrders = jobData.workOrders || [];
          totalWorkOrders += workOrders.length;
          workOrders.forEach(wo => {
            totalUnits += wo.units || 0;
            if (wo.flags && wo.flags.length > 0) flaggedCount++;
            if (wo.isAmended) amendedCount++;
          });
        });
      }
      const workOrderCountEl = document.getElementById('workOrderCount');
      const workOrderMetaEl = document.getElementById('workOrderMeta');
      const workOrderFlaggedEl = document.getElementById('workOrderFlagged');
      const workOrderAmendedEl = document.getElementById('workOrderAmended');
      if (workOrderCountEl) workOrderCountEl.textContent = totalWorkOrders.toLocaleString();
      if (workOrderMetaEl) workOrderMetaEl.textContent = `${totalUnits.toLocaleString()} units complete`;
      if (workOrderFlaggedEl) workOrderFlaggedEl.textContent = flaggedCount.toLocaleString();
      if (workOrderAmendedEl) workOrderAmendedEl.textContent = amendedCount.toLocaleString();

      const { total: commentTotal, counts: commentCounts } = getCommentSummary();
      const commentTotalEl = document.getElementById('commentTotal');
      const commentMetaEl = document.getElementById('commentMeta');
      const commentBreakdownEl = document.getElementById('commentBreakdown');
      if (commentTotalEl) commentTotalEl.textContent = commentTotal;
      if (commentMetaEl) {
        commentMetaEl.textContent = commentTotal ? 'By category' : 'No comments yet';
      }
      if (commentBreakdownEl) {
        const items = Object.entries(commentCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([category, count]) => `<li><span>${escapeHtml(category)}</span><strong>${count}</strong></li>`)
          .join('');
        commentBreakdownEl.innerHTML = items || '<li><span>General</span><strong>0</strong></li>';
      }
      refreshCommentExportTypeOptions(commentCounts);

      const varianceListEl = document.getElementById('varianceList');
      latestTopVarianceBrief = buildTopVarianceBriefData({ baseFiltered, period, getJobDisplayData, varianceFilter, reviewStatusFilter });
      if (varianceListEl) {
        if (!latestTopVarianceBrief.items.length) {
          varianceListEl.innerHTML = '<li class="variance-item"><span class="variance-desc">No variances to display.</span></li>';
        } else {
          varianceListEl.innerHTML = latestTopVarianceBrief.items.map(({ job, variance }) => {
            const valueClass = variance > 0 ? 'positive' : variance < 0 ? 'negative' : 'neutral';
            return `
              <li class="variance-item" onclick="showBreakdownByJobNumber('${escapeHtml(job.jn)}')">
                <div class="variance-job">
                  <strong>${escapeHtml(job.jn)}</strong>
                  <span class="variance-desc">${escapeHtml(job.desc)}</span>
                </div>
                <div class="variance-value ${valueClass}">${formatSignedUnits(variance)}</div>
              </li>
            `;
          }).join('');
        }
      }
    }

    function showBreakdownByJobNumber(jobNumber) {
      const job = window.currentJobsMap.get(jobNumber);
      if (!job) return;
      showBreakdown(job, { scrollTop: true });
    }

    function updateWorkGroupFilterOptions() {
      const select = document.getElementById('wgFilter');
      if (!select) return;
      const current = select.value || 'all';
      let options = getWorkGroupOptions();

      // Filter by selected engineer's work groups
      const engineerWorkGroups = getSelectedEngineerWorkGroups();
      if (engineerWorkGroups && engineerWorkGroups.length > 0) {
        options = options.filter(key => {
          const normalizedKey = normalizeWorkGroupSet(key);
          return engineerWorkGroups.some(ewg => normalizeWorkGroupSet(ewg) === normalizedKey);
        });
      }

      // Get contextual label for "all" option
      const engineerFilter = document.getElementById('engineerFilter')?.value || 'all';
      const selectedEngineer = engineerFilter !== 'all' && window.getEngineerById
        ? window.getEngineerById(engineerFilter)
        : null;
      const allLabel = selectedEngineer
        ? `All Work Groups (${selectedEngineer.name})`
        : 'All Work Group Sets';

      const optionHtml = [
        `<option value="all">${escapeHtml(allLabel)}</option>`,
        ...options.map(key => {
          // key might be a code (like "DBAPPTRA") or already a description
          let description = key;

          // Try direct lookup (key is a code)
          if (window.workGroupSets?.has(key)) {
            description = window.workGroupSets.get(key);
          } else {
            // Try uppercase version (handles case mismatches)
            const upperKey = String(key).trim().toUpperCase();
            if (window.workGroupSets?.has(upperKey)) {
              description = window.workGroupSets.get(upperKey);
            } else {
              // Try extracting first word as code (handles combined formats like "DBAPPTRA Appleby SM(TRACK)")
              const extractedCode = String(key).trim().split(/\s+/)[0].toUpperCase();
              if (extractedCode !== upperKey && window.workGroupSets?.has(extractedCode)) {
                description = window.workGroupSets.get(extractedCode);
              }
              // If still not found, key might already be a description or unknown - use as-is
            }
          }

          return `<option value="${escapeHtml(key)}">${escapeHtml(description)}</option>`;
        })
      ].join('');
      select.innerHTML = optionHtml;
      select.value = options.includes(current) ? current : 'all';
    }

    function getMaxWorkDonePeriod() {
      if (!window.wData) return 0;
      let max = 0;
      window.wData.forEach(job => {
        Object.entries(job.periods || {}).forEach(([period, value]) => {
          const numeric = parseInt(String(period).replace(/[^0-9]/g, ''), 10);
          if (!Number.isNaN(numeric) && numeric > max && value !== 0) {
            max = numeric;
          }
        });
      });
      return max;
    }

    async function loadForecast(e) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        if (!currentReviewStage) {
          alert('Select a review stage before uploading a forecast.');
          openStageModal();
          return;
        }
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab);
        if (!wb.Sheets['Results']) {
          alert('Need "Results" sheet');
          return;
        }
        const row = parseInt(document.getElementById('fRow').value) - 1;
        const rows = XLSX.utils.sheet_to_json(wb.Sheets['Results'], {range:row});
        
        const selectedYear = document.getElementById('forecastYearSelect')?.value || currentFinancialYear;
        if (!selectedYear) {
          alert('Please confirm the financial year for this forecast.');
          return;
        }
        const selectedPlan = document.getElementById('forecastPlanVersion')?.value || currentPlanVersion;
        if (!selectedPlan || !PLAN_VERSIONS.some(plan => plan.id === selectedPlan)) {
          alert('Please confirm the plan version for this forecast.');
          return;
        }
        fData = new Map();
        let matched = 0;
        lastForecastRowCount = rows.length;
        await runInChunks(rows, r => {
          // Try multiple column names for forecast
          let jn = String(r['Standard Job'] || r['STD_JOB_NO'] || r['Standard Job No'] || '').trim();
          if (jn.includes('.')) jn = jn.split('.').pop();
          jn = jn.replace(/\D/g, '').padStart(6,'0');
          
          if (!jn || jn==='000000') return;
          
          // If no standard jobs loaded, accept all jobs
          if (window.stdJobs.size > 0 && !window.stdJobs.has(jn)) return;
          
          matched++;
          if (!fData.has(jn)) {
            fData.set(jn, {periods:{}, wgs:{}});
          }
          const job = fData.get(jn);
          const wg = normalizeWorkGroupSet(
            r['Work Group Set'] || r['WGST_DESC'] || r['Work Group Set Description']
          );
          
          // Look for P01-P13 or P1-P13
          for(let i=1; i<=13; i++) {
            const p = `P${i}`;
            const pPad = `P${String(i).padStart(2,'0')}`;
            const v = parseFloat(r[pPad] || r[p] || 0);
            job.periods[p] = (job.periods[p]||0) + v;
            if (!job.wgs[wg]) job.wgs[wg] = {};
            job.wgs[wg][p] = (job.wgs[wg][p]||0) + v;
          }
        });
        console.log('✓ Matched:', matched, 'of', rows.length);
        await saveForecastToStorageAsync(fData, rows.length, selectedYear, selectedPlan);
        setReviewContext(currentReviewStage, selectedYear);
        closeModal();
      } catch(err) {
        console.error(err);
        alert('Error loading forecast');
      }
    }

    async function loadWorkDone(file) {
      if (!file) return;
      try {
        const selectedYear = getSelectedWorkDoneYear();
        if (!selectedYear) {
          alert('Please select the financial year for this Work Done upload.');
          return;
        }
        const clearBeforeUpload = Boolean(document.getElementById('clearWorkDoneForFyBeforeUpload')?.checked);
        if (clearBeforeUpload) {
          removeWorkDoneFromLocal(selectedYear);
          if (window.isApiEnabled && window.isApiEnabled() && window.deleteWorkDoneForYearFromApi) {
            await window.deleteWorkDoneForYearFromApi(selectedYear);
          }
        }

        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab);
        if (!wb.Sheets['Detail']) {
          alert('Need "Detail" sheet');
          return;
        }
        const row = parseInt(document.getElementById('wRow').value) - 1;
        const rows = XLSX.utils.sheet_to_json(wb.Sheets['Detail'], {range:row});
        
        window.wData = new Map();
        let matched = 0;
        let sampleUnmatched = [];
        
        await runInChunks(rows, r => {
          const jobText = r['Standard Job Number & Desc'] || r['Standard Job No'] || '';
          const jn = extractJob(jobText);
          
          // Get period and normalize it
          let per = String(r['Work Order Closed Period']||'').trim();
          
          // If it's just a number like "8", convert to "P8"
          if (per && /^\d+$/.test(per)) {
            per = 'P' + per;
          }
          per = per.toUpperCase();
          
          const units = r['Units Complete'];
          
          // Debug first few rows
          if (sampleUnmatched.length < 3) {
            sampleUnmatched.push({
              raw: jobText,
              extracted: jn,
              periodRaw: r['Work Order Closed Period'],
              periodNormalized: per,
              units: units
            });
          }
          
          if (!jn) return;
          
          // If no standard jobs loaded, accept all jobs
          if (window.stdJobs.size > 0 && !window.stdJobs.has(jn)) return;
          
          if (!per.match(/^P\d+$/i)) return;
          matched++;
          if (!window.wData.has(jn)) window.wData.set(jn, {periods:{}, wgs:{}});
          const job = window.wData.get(jn);
          if (!job.workOrders) job.workOrders = [];
          const rawUnits = parseFloat(units || 0);
          const workOrderNumber = extractWorkOrderNumber(r);
          const workOrderId = `${jn}-${workOrderNumber || 'unknown'}-${job.workOrders.length + 1}`;
          const amendment = getWorkOrderAmendment(workOrderId);
          const amendedUnits = Number.isFinite(Number(amendment?.units)) ? Number(amendment.units) : rawUnits;
          const u = amendedUnits;
          job.periods[per] = (job.periods[per] || 0) + u;
          const wg = normalizeWorkGroupSet(
            r['Work Group Set'] || r['Work Group Set Description']
          );
          if (!job.wgs[wg]) job.wgs[wg] = {};
          job.wgs[wg][per] = (job.wgs[wg][per] || 0) + u;
          const workOrder = {
            id: workOrderId,
            jobNumber: jn,
            number: workOrderNumber || 'Unknown',
            description: String(
              r['Work Order Description'] ||
              r['Work Order Desc'] ||
              r['WO Description'] ||
              r['Description'] ||
              ''
            ).trim(),
            workOrderType: String(
              r['Work Order Type Code & Desc'] ||
              r['Work Order Type Code'] ||
              r['Work Order Type Description'] ||
              r['Work Order Type'] ||
              r['WO Type'] ||
              ''
            ).trim(),
            period: per,
            units: u,
            originalUnits: rawUnits,
            isAmended: Number.isFinite(Number(amendment?.units)) && Math.abs(amendedUnits - rawUnits) >= 0.0001,
            workGroup: wg,
            closedDate: String(
              r['Work Order Closed Date'] ||
              r['Closed Date'] ||
              ''
            ).trim()
          };
          job.workOrders.push(workOrder);
        });

        workDoneUploadedAt = new Date().toISOString();
        saveWorkDoneToLocal(selectedYear, window.wData, workDoneUploadedAt);
        if (window.isApiEnabled && window.isApiEnabled() && window.saveWorkDoneToApi && selectedYear) {
          const uploadedAt = await window.saveWorkDoneToApi(selectedYear, serializeWorkDoneMap(window.wData));
          if (uploadedAt) {
            workDoneUploadedAt = uploadedAt;
            saveWorkDoneToLocal(selectedYear, window.wData, workDoneUploadedAt);
          }
        }

        if (selectedYear !== currentFinancialYear) {
          await loadWorkDoneStoreAsync(currentFinancialYear);
          alert(`Work Done uploaded for ${selectedYear}. Current dashboard remains on ${currentFinancialYear}.`);
        }
        
        updateWorkGroupFilterOptions();
        render();
        closeModal();
      } catch(err) {
        console.error(err);
        alert('Error loading work done');
      }
    }

    async function uploadSelectedWorkDoneFile() {
      const workDoneInput = document.getElementById('wFile');
      const file = workDoneInput?.files?.[0];
      if (!file) {
        alert('Please choose a Work Done file first.');
        return;
      }
      await loadWorkDone(file);
    }

    async function loadComments(e) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab);
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          alert('No worksheet found in comments file.');
          return;
        }
        const row = parseInt(document.getElementById('cRow').value, 10) - 1;
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { range: row });
        if (!rows.length) {
          alert('No comment rows found.');
          return;
        }
        const required = ['Standard Job Number', 'Comment Type', 'Comment'];
        const missing = required.filter(key => !(key in rows[0]));
        if (missing.length) {
          alert(`Missing required columns: ${missing.join(', ')}`);
          return;
        }
        let added = 0;
        rows.forEach(r => {
          const rawJob = String(r['Standard Job Number'] || '').trim();
          const jn = rawJob.replace(/\D/g, '').padStart(6, '0');
          const category = String(r['Comment Type'] || '').trim() || 'General';
          const text = String(r['Comment'] || '').trim();
          const fy = String(r['Financial Year'] || '').trim() || currentFinancialYear;
          const rf = String(r['Review Stage'] || '').trim() || currentReviewStage;
          if (!jn || jn === '000000' || !text) return;
          if (!commentStore[jn]) commentStore[jn] = [];
          commentStore[jn].unshift({
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            jobNumber: jn,
            category,
            text,
            timestamp: new Date().toISOString(),
            fy,
            rf,
            rootCause: String(r['Root Cause'] || '').trim(),
            correctiveAction: String(r['Corrective Action'] || '').trim(),
            owner: String(r['Owner'] || '').trim(),
            dueDate: String(r['Due Date'] || '').trim(),
            evidenceLinks: String(r['Evidence Links'] || '').split(/\n|,/).map(link => link.trim()).filter(Boolean),
            deliveryUnit: String(r['Delivery Unit'] || '').trim(),
            filteredWorkGroup: String(r['Work Group Set'] || '').trim()
          });
          added += 1;
        });
        await saveCommentStoreAsync();
        if (currentCommentJob) {
          renderCommentsTable(currentCommentJob);
        }
        const apiStatus = window.isApiEnabled && window.isApiEnabled() ? ' (synced to server)' : '';
        alert(`Imported ${added} comments.${apiStatus}`);
      } catch (err) {
        console.error(err);
        alert('Error loading comments');
      } finally {
        e.target.value = '';
      }
    }

    function refreshCommentExportTypeOptions(commentCounts = {}) {
      const select = document.getElementById('commentExportType');
      if (!select) return;
      const previousValue = select.value || 'all';
      const categories = new Set(['all', ...COMMENT_CATEGORIES]);
      Object.keys(commentCounts || {}).forEach(category => {
        if (category) categories.add(category);
      });
      const options = Array.from(categories).map(category => {
        const label = category === 'all' ? 'All comment types' : category;
        const suffix = category !== 'all' && Number.isFinite(Number(commentCounts[category]))
          ? ` (${Number(commentCounts[category]).toLocaleString()})`
          : '';
        return `<option value="${escapeHtml(category)}">${escapeHtml(label)}${suffix}</option>`;
      }).join('');
      select.innerHTML = options;
      select.value = categories.has(previousValue) ? previousValue : 'all';
    }

    function getSelectedCommentExportType(explicitType) {
      if (explicitType) return explicitType;
      return document.getElementById('commentExportType')?.value || 'all';
    }

    function exportComments(commentType) {
      const selectedType = getSelectedCommentExportType(commentType);
      const rows = [];
      Object.entries(commentStore).forEach(([jobNumber, comments]) => {
        comments.forEach(entry => {
          // Only export comments for current FY
          const commentFY = entry.fy || entry.financialYear;
          if (commentFY !== currentFinancialYear) return;
          const category = entry.category || 'General';
          if (selectedType !== 'all' && category !== selectedType) return;
          const workGroupSet = String(entry.filteredWorkGroup || '').trim();

          rows.push({
            'Standard Job Number': jobNumber,
            'Comment Type': category,
            'Comment': entry.text,
            'Financial Year': entry.fy || '',
            'Review Stage': entry.rf || '',
            'Root Cause': entry.rootCause || '',
            'Corrective Action': entry.correctiveAction || '',
            'Owner': entry.owner || '',
            'Due Date': entry.dueDate || '',
            'Evidence Links': Array.isArray(entry.evidenceLinks) ? entry.evidenceLinks.join('\n') : '',
            'Delivery Unit': entry.deliveryUnit || '',
            'Work Group Set': workGroupSet,
            'Work Group Set Description': workGroupSet
              ? (window.workGroupSets?.get(workGroupSet) || '')
              : ''
          });
        });
      });
      if (!rows.length) {
        const typeLabel = selectedType === 'all' ? 'comments' : `${selectedType} comments`;
        alert(`No ${typeLabel} to export for ${currentFinancialYear}.`);
        return;
      }
      const ws = XLSX.utils.json_to_sheet(rows, {
        header: ['Standard Job Number', 'Comment Type', 'Comment', 'Financial Year', 'Review Stage', 'Root Cause', 'Corrective Action', 'Owner', 'Due Date', 'Evidence Links', 'Delivery Unit', 'Work Group Set', 'Work Group Set Description']
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Comments');
      const typeSlug = selectedType === 'all' ? 'all' : selectedType.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      XLSX.writeFile(wb, `apr-comments-${typeSlug}-${currentFinancialYear}.xlsx`);
    }

    function exportAmendedWorkOrders() {
      if (!window.wData || !window.wData.size) {
        alert('No Work Done data loaded to export amended work orders.');
        return;
      }
      const rows = [];
      window.wData.forEach((jobData, jobNumber) => {
        const meta = window.stdJobs.get(jobNumber) || {};
        (jobData.workOrders || []).forEach(order => {
          if (!order.isAmended) return;
          const originalUnits = Number(order.originalUnits);
          const amendedUnits = Number(order.units);
          rows.push({
            'Standard Job Number': jobNumber,
            'Standard Job Description': meta.desc || '',
            'Discipline': meta.disc || '',
            'Delivery Unit': meta.mnt || '',
            'Work Order': order.number || '',
            'Work Order Description': order.description || '',
            'Work Order Type': order.workOrderType || '',
            'Closed Period': order.period || '',
            'Closed Date': order.closedDate || '',
            'Work Group': order.workGroup || '',
            'Original Units Complete': Number.isFinite(originalUnits) ? originalUnits : '',
            'Amended Units Complete': Number.isFinite(amendedUnits) ? amendedUnits : '',
            'Unit Difference': Number.isFinite(originalUnits) && Number.isFinite(amendedUnits) ? amendedUnits - originalUnits : '',
            'Amended At': getWorkOrderAmendment(order.id)?.updatedAt || ''
          });
        });
      });
      if (!rows.length) {
        alert(`No amended work orders to export for ${currentFinancialYear}.`);
        return;
      }
      const headers = [
        'Standard Job Number',
        'Standard Job Description',
        'Discipline',
        'Delivery Unit',
        'Work Order',
        'Work Order Description',
        'Work Order Type',
        'Closed Period',
        'Closed Date',
        'Work Group',
        'Original Units Complete',
        'Amended Units Complete',
        'Unit Difference',
        'Amended At'
      ];
      const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
      ws['!cols'] = headers.map(header => {
        if (header.includes('Description')) return { wch: 45 };
        if (header.includes('Units') || header === 'Unit Difference') return { wch: 18 };
        return { wch: 16 };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Amended Work Orders');
      XLSX.writeFile(wb, `apr-amended-work-orders-${currentFinancialYear}.xlsx`);
    }

    function exportWorkGroupJobSummary() {
      // Get all work groups
      const workGroups = [];
      if (window.workGroupSets) {
        window.workGroupSets.forEach((desc, code) => {
          workGroups.push({ code, description: desc });
        });
      }

      // Sort work groups by code
      workGroups.sort((a, b) => a.code.localeCompare(b.code));

      const rows = [];
      const fiscalYears = ['FY27', 'FY28', 'FY29', 'FY30'];

      // For each work group, count jobs in V0 and V1 for each FY
      workGroups.forEach(wg => {
        const row = {
          'Work Group Code': wg.code,
          'Work Group Description': wg.description
        };

        fiscalYears.forEach(fy => {
          // Load V0 data
          const v0Data = loadForecastFromStorage(fy, 'v0');
          let v0JobCount = 0;
          if (v0Data && v0Data.data) {
            v0Data.data.forEach((job) => {
              if (job.wgs && job.wgs[wg.description]) {
                // Check if any period has data for this work group
                const wgData = job.wgs[wg.description];
                const hasData = Object.values(wgData).some(val => val && val !== 0);
                if (hasData) v0JobCount++;
              }
            });
          }

          // Load V1 data
          const v1Data = loadForecastFromStorage(fy, 'v1');
          let v1JobCount = 0;
          if (v1Data && v1Data.data) {
            v1Data.data.forEach((job) => {
              if (job.wgs && job.wgs[wg.description]) {
                // Check if any period has data for this work group
                const wgData = job.wgs[wg.description];
                const hasData = Object.values(wgData).some(val => val && val !== 0);
                if (hasData) v1JobCount++;
              }
            });
          }

          row[`${fy} V0`] = v0JobCount;
          row[`${fy} V1`] = v1JobCount;
        });

        rows.push(row);
      });

      if (!rows.length) {
        alert('No work group data to export.');
        return;
      }

      // Create Excel workbook
      const ws = XLSX.utils.json_to_sheet(rows, {
        header: ['Work Group Code', 'Work Group Description',
                 'FY27 V0', 'FY27 V1', 'FY28 V0', 'FY28 V1',
                 'FY29 V0', 'FY29 V1', 'FY30 V0', 'FY30 V1']
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Work Group Job Summary');
      XLSX.writeFile(wb, 'apr-workgroup-job-summary.xlsx');
    }

    function exportForecastSummary() {
      // Get current year and plan version from UI or use defaults
      const year = currentFinancialYear || 'FY27';
      const planVersion = currentPlanVersion || 'v0';

      // Load forecast data
      // Plan v1 is stored sparsely, so exports must use its complete read-time projection.
      const forecastSnapshot = planVersion === 'v1'
        ? getEffectiveForecastSnapshot(year)
        : getForecastSnapshot(year, planVersion);
      const forecastData = forecastSnapshot?.data || new Map();

      // Get all standard jobs
      if (!window.STANDARD_JOBS || !window.STANDARD_JOBS.length) {
        alert('Standard jobs data not loaded.');
        return;
      }

      const rows = [];

      // Debug: Check first few job numbers
      const firstFewStdJobs = window.STANDARD_JOBS.slice(0, 5).map(j => j.standardJobNo);

      // Process each standard job
      let foundCount = 0;
      let notFoundCount = 0;
      window.STANDARD_JOBS.forEach(job => {
        // Pad job number to 6 digits to match forecast data format
        const jobNumber = String(job.standardJobNo).padStart(6, '0');
        const forecastJob = forecastData.get(jobNumber);
        if (forecastJob) foundCount++; else notFoundCount++;

        // Create row with basic info
        const row = {
          'Standard Job No': jobNumber,
          'Description': job.standardJobDescription,
          'Discipline': job.discipline,
          'MNT Code': job.mntCode
        };

        // Determine which work groups have allocated volume (even if 0)
        const workGroupsWithData = [];
        if (forecastJob && forecastJob.wgs) {
          Object.keys(forecastJob.wgs).forEach(wgName => {
            // Check if this work group has any data defined (even if all zeros)
            const wgData = forecastJob.wgs[wgName];
            const hasDefined = window.FORECAST_PERIODS.some(period => {
              return wgData.hasOwnProperty(period);
            });
            if (hasDefined) {
              // Find the work group code for this description
              let wgCode = wgName;
              if (window.workGroupSets) {
                window.workGroupSets.forEach((desc, code) => {
                  if (desc === wgName) {
                    wgCode = code;
                  }
                });
              }
              workGroupsWithData.push(wgCode);
            }
          });
        }

        row['Work Groups'] = workGroupsWithData.join(', ');

        // Add period columns (P01-P13)
        // Check if job has been forecast (has any work group data)
        const jobHasBeenForecast = forecastJob && forecastJob.wgs && Object.keys(forecastJob.wgs).length > 0;

        window.FORECAST_PERIODS.forEach((period, index) => {
          // Use padded format for column headers (P01, P02, etc.)
          const paddedPeriod = `P${String(index + 1).padStart(2, '0')}`;
          if (jobHasBeenForecast) {
            // Forecast has been entered - show period total (may be 0)
            row[paddedPeriod] = forecastJob.periods?.[period] || 0;
          } else {
            // No forecast entered
            row[paddedPeriod] = '(not forecast)';
          }
        });

        rows.push(row);
      });


      if (!rows.length) {
        alert('No standard jobs data to export.');
        return;
      }

      // Create Excel workbook with padded period headers (P01-P13)
      const periodHeaders = Array.from({ length: 13 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
      const headers = ['Standard Job No', 'Description', 'Discipline', 'MNT Code', 'Work Groups']
        .concat(periodHeaders);

      const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

      // Auto-size columns
      const colWidths = headers.map(h => {
        if (h === 'Description') return { wch: 50 };
        if (h === 'Work Groups') return { wch: 30 };
        if (h === 'Standard Job No') return { wch: 15 };
        if (h === 'Discipline') return { wch: 20 };
        if (h === 'MNT Code') return { wch: 12 };
        return { wch: 12 };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Forecast Summary');
      XLSX.writeFile(wb, `apr-forecast-summary-${year}-${planVersion}.xlsx`);

      console.log(`✓ Exported forecast summary for ${year} ${planVersion}`);
    }

    function computeQuantile(sorted, q) {
      if (!sorted.length) return 0;
      const pos = (sorted.length - 1) * q;
      const base = Math.floor(pos);
      const rest = pos - base;
      if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
      }
      return sorted[base];
    }

    function getWorkOrderStats(workOrders) {
      const units = workOrders
        .map(order => Number(order.units))
        .filter(val => !Number.isNaN(val))
        .sort((a, b) => a - b);
      if (!units.length) {
        return { median: 0, q1: 0, q3: 0, iqr: 0, mean: 0, highThreshold: 0 };
      }
      const q1 = computeQuantile(units, 0.25);
      const q3 = computeQuantile(units, 0.75);
      const median = computeQuantile(units, 0.5);
      const iqr = q3 - q1;
      const mean = units.reduce((sum, val) => sum + val, 0) / units.length;
      let highThreshold = q3 + 1.5 * iqr;
      if (highThreshold === 0) {
        highThreshold = mean ? mean * 4 : 0;
      }
      if (median > 0) {
        highThreshold = Math.max(highThreshold, median * 4);
      }
      return { median, q1, q3, iqr, mean, highThreshold };
    }

    function getWorkOrderFlags(order, stats) {
      const flags = [];
      const units = Number(order.units) || 0;
      if (units === 0 && order.period) {
        flags.push('Zero units in closed period');
      }
      if (stats.highThreshold > 0 && units > stats.highThreshold) {
        flags.push('High units vs typical');
      }
      return flags;
    }

    function buildGroupRollupJob(group, jobs) {
      const groupJobs = jobs.filter(job => group.jobNumbers.includes(job.jn));
      if (!groupJobs.length) return null;
      const rollup = {
        jn: group.name || `GRP-${group.id}`,
        disc: 'Group Rollups',
        desc: group.description || getGroupName(group),
        unit: getGroupUnitLabel(group),
        periods: {},
        tot: { f: 0, a: 0, wd: 0, v: 0 },
        wgs: {},
        isGroupRollup: true,
        groupId: group.id,
        groupName: getGroupName(group),
        groupJobCount: groupJobs.length
      };

      for (let i = 1; i <= 13; i++) {
        const p = `P${i}`;
        const periodTotals = groupJobs.reduce(
          (acc, job) => {
            const data = job.periods[p] || { f: 0, a: 0, wd: 0, v: 0 };
            acc.f += data.f || 0;
            acc.a += data.a || 0;
            acc.wd += data.wd || 0;
            acc.v += data.v || 0;
            return acc;
          },
          { f: 0, a: 0, wd: 0, v: 0 }
        );
        rollup.periods[p] = periodTotals;
        rollup.tot.f += periodTotals.f;
        rollup.tot.a += periodTotals.a;
        rollup.tot.wd += periodTotals.wd;
        rollup.tot.v += periodTotals.v;
      }

      const wgNames = new Set();
      groupJobs.forEach(job => {
        Object.keys(job.wgs || {}).forEach(wg => wgNames.add(wg));
      });
      wgNames.forEach(wg => {
        rollup.wgs[wg] = { periods: {} };
        for (let i = 1; i <= 13; i++) {
          const p = `P${i}`;
          const totals = groupJobs.reduce(
            (acc, job) => {
              const data = job.wgs?.[wg]?.periods?.[p] || { f: 0, a: 0, wd: 0, v: 0 };
              acc.f += data.f || 0;
              acc.a += data.a || 0;
              acc.wd += data.wd || 0;
              acc.v += data.v || 0;
              return acc;
            },
            { f: 0, a: 0, wd: 0, v: 0 }
          );
          rollup.wgs[wg].periods[p] = totals;
        }
      });
      return rollup;
    }

    function getWorkOrdersForGroup(groupId) {
      if (!groupId) return [];
      const group = getAllGroups().find(entry => entry.id === groupId);
      if (!group) return [];
      return group.jobNumbers.flatMap(jobNumber => window.wData?.get(jobNumber)?.workOrders || []);
    }


    function getForecastCutoffValue() {
      const timeline = document.getElementById('forecastCutoffTimeline');
      if (timeline) {
        const active = timeline.querySelector('.cutoff-chip.active');
        return active?.dataset?.value || currentForecastCutoff || 'auto';
      }
      return currentForecastCutoff || 'auto';
    }

    function getEffectiveForecastCutoffPeriod() {
      const cutoffValue = getForecastCutoffValue();
      if (cutoffValue === 'auto') return getMaxWorkDonePeriod();
      const numeric = parseInt(String(cutoffValue).replace(/[^0-9]/g, ''), 10);
      return Number.isNaN(numeric) ? 0 : Math.max(0, Math.min(13, numeric));
    }

    function getMainPageActual(forecastValue, workDonePeriods, period, cutoffPeriod) {
      const hasReportedWork = Object.prototype.hasOwnProperty.call(workDonePeriods || {}, period);
      return getPeriodNumber(period) <= cutoffPeriod || hasReportedWork
        ? Number(workDonePeriods?.[period] || 0)
        : Number(forecastValue || 0);
    }

    function initForecastCutoffTimeline() {
      const timeline = document.getElementById('forecastCutoffTimeline');
      if (!timeline) return;
      const chips = Array.from(timeline.querySelectorAll('.cutoff-chip'));
      const apply = (val) => {
        currentForecastCutoff = val || 'auto';
        chips.forEach(ch => ch.classList.toggle('active', ch.dataset.value === currentForecastCutoff));
      };
      chips.forEach(ch => ch.addEventListener('click', () => { apply(ch.dataset.value); render(); }));
      apply(currentForecastCutoff);
    }

    function renderWorkOrders() {
      const table = document.getElementById('woTable');
      if (!table) return;
      const workOrders = currentWorkOrders || [];
      const stats = getWorkOrderStats(workOrders);
      const search = (document.getElementById('woSearch')?.value || '').toLowerCase();
      const flaggedOnly = document.getElementById('woFlagOnly')?.checked || false;

      const enriched = workOrders.map(order => {
        const flags = getWorkOrderFlags(order, stats);
        return { ...order, flags };
      });

      const engineerWorkGroups = getSelectedEngineerWorkGroups();
      const baseFiltered = enriched.filter(order => {
        const matchesWorkGroupFilter = currentWorkOrderWorkGroup === 'all' || order.workGroup === currentWorkOrderWorkGroup;
        if (!matchesWorkGroupFilter) return false;
        if (!engineerWorkGroups || engineerWorkGroups.length === 0) return true;
        const normalizedOrderWg = normalizeWorkGroupSet(order.workGroup);
        return engineerWorkGroups.some(ewg => normalizeWorkGroupSet(ewg) === normalizedOrderWg);
      });

      const filtered = baseFiltered.filter(order => {
        const haystack = [
          order.number,
          order.description,
          order.workOrderType,
          order.period,
          order.workGroup,
          order.closedDate,
          ...order.flags
        ].join(' ').toLowerCase();
        if (flaggedOnly && order.flags.length === 0) return false;
        if (search && !haystack.includes(search)) return false;
        return true;
      });

      const flaggedCount = baseFiltered.filter(order => order.flags.length).length;
      const totalUnits = baseFiltered.reduce((sum, order) => sum + (Number(order.units) || 0), 0);

      const totalEl = document.getElementById('woTotal');
      const unitsEl = document.getElementById('woUnits');
      const flaggedEl = document.getElementById('woFlagged');
      if (totalEl) totalEl.textContent = baseFiltered.length;
      if (unitsEl) unitsEl.textContent = totalUnits.toFixed(2);
      if (flaggedEl) flaggedEl.textContent = flaggedCount;

      if (!workOrders.length) {
        table.innerHTML = '<thead><tr><th>Work Orders</th></tr></thead><tbody><tr><td class="wo-empty">No work orders found in the work done report for this job.</td></tr></tbody>';
        return;
      }

      if (!filtered.length) {
        table.innerHTML = '<thead><tr><th>Work Orders</th></tr></thead><tbody><tr><td class="wo-empty">No work orders match the current filters.</td></tr></tbody>';
        return;
      }

      const rows = filtered.map(order => {
        const flagsHtml = order.flags.length
          ? order.flags.map(flag => `<span class="wo-badge">${escapeHtml(flag)}</span>`).join('')
          : '<span class="wo-empty">None</span>';
        const rowClass = order.flags.length ? 'wo-flagged' : '';
        const canRevert = order.isAmended && Number.isFinite(order.originalUnits);
        const amendedNote = canRevert
          ? `
            <div class="wo-unit-meta">
              Amended from ${formatUnits(order.originalUnits)}
              <button type="button" class="wo-revert" data-id="${escapeHtml(order.id)}">Revert</button>
            </div>
          `
          : '';
        const unitClass = canRevert ? 'wo-unit-value amended' : 'wo-unit-value';

        // Create Ellipse hyperlink for work order number
        const workOrderNumber = order.number || 'Unknown';
        const ellipseUrl = `http://ellipse-ell9p.unix.ukrail.net/html/ui?application=MSEWOT&type=read&workOrder=${encodeURIComponent(workOrderNumber)}#!home`;
        const workOrderLink = workOrderNumber !== 'Unknown'
          ? `<a href="${ellipseUrl}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(workOrderNumber)}</strong></a>`
          : `<strong>${escapeHtml(workOrderNumber)}</strong>`;

        return `
          <tr class="${rowClass}">
            <td>${workOrderLink}</td>
            <td>${escapeHtml(order.description || '-')}</td>
            <td>${escapeHtml(order.workOrderType || '-')}</td>
            <td>${escapeHtml(order.period || '-')}</td>
            <td>${escapeHtml(order.workGroup || '-')}</td>
            <td class="wo-units" data-units-cell data-order-id="${escapeHtml(order.id)}">
              <div class="wo-unit-cell">
                <span class="${unitClass}">${formatUnits(order.units)}</span>
                <button type="button" class="wo-amend" data-id="${escapeHtml(order.id)}">Amend</button>
              </div>
              ${amendedNote}
            </td>
            <td>${flagsHtml}</td>
          </tr>
        `;
      }).join('');

      table.innerHTML = `
        <thead>
          <tr>
            <th>Work Order</th>
            <th>Description</th>
            <th>Work Order Type</th>
            <th>Closed Period</th>
            <th>Work Group</th>
            <th class="wo-units">Units</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      `;

      table.querySelectorAll('.wo-revert').forEach(button => {
        button.addEventListener('click', () => {
          const orderId = button.dataset.id;
          const order = currentWorkOrders.find(item => item.id === orderId);
          if (!order || !Number.isFinite(order.originalUnits)) return;
          applyWorkOrderUnitAmendment(orderId, order.originalUnits);
        });
      });

      table.querySelectorAll('.wo-amend').forEach(button => {
        button.addEventListener('click', () => {
          const orderId = button.dataset.id;
          const order = currentWorkOrders.find(item => item.id === orderId);
          if (!order) return;
          const row = button.closest('tr');
          const unitCell = row?.querySelector('[data-units-cell]');
          if (!unitCell) return;
          unitCell.innerHTML = `
            <div class="wo-unit-edit">
              <input type="number" class="wo-unit-input" step="0.01" value="${formatUnits(order.units)}">
              <div class="wo-unit-actions">
                <button type="button" class="wo-unit-save">Save</button>
                <button type="button" class="wo-unit-cancel">Cancel</button>
              </div>
            </div>
          `;
          const input = unitCell.querySelector('.wo-unit-input');
          const saveBtn = unitCell.querySelector('.wo-unit-save');
          const cancelBtn = unitCell.querySelector('.wo-unit-cancel');
          if (input) input.focus();
          const handleSave = () => {
            const nextValue = Number(input?.value);
            if (!Number.isFinite(nextValue)) {
              alert('Please enter a valid number for units.');
              return;
            }
            applyWorkOrderUnitAmendment(orderId, nextValue);
          };
          saveBtn?.addEventListener('click', handleSave);
          cancelBtn?.addEventListener('click', renderWorkOrders);
          input?.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleSave();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              renderWorkOrders();
            }
          });
        });
      });
    }

    function render() {
      if (requiresContextSelection) {
        openStageModal();
        return;
      }
      if (!currentReviewStage || !currentFinancialYear) {
        openStageModal();
        return;
      }
      // Sync dashboard plan version selector with current plan version
      const dashboardPlanVersionSelect = document.getElementById('dashboardPlanVersion');
      if (dashboardPlanVersionSelect && dashboardPlanVersionSelect.value !== currentPlanVersion) {
        dashboardPlanVersionSelect.value = currentPlanVersion;
      }
      // Always show work done and forecast (no view mode toggle)
      const cutoffValue = getForecastCutoffValue();
      const varianceFilter = document.getElementById('varianceFilter')?.value || 'all';
      const reviewStatusFilter = document.getElementById('reviewStatusFilter')?.value || 'all';
      const maxWorkDonePeriod = getEffectiveForecastCutoffPeriod();

      const forecastSnapshot = currentPlanVersion === 'v1'
        ? getEffectiveForecastSnapshot(currentFinancialYear)
        : getForecastSnapshot(currentFinancialYear, 'v0');
      const forecastDataToUse = forecastSnapshot?.data || new Map();

      const all = new Set([...(forecastDataToUse?.keys()||[]), ...(window.wData?.keys()||[])]);
      const baseJobs = [];
      all.forEach(jn => {
        // Get metadata from standard jobs if available
        const meta = window.stdJobs.get(jn);
        const f = forecastDataToUse?.get(jn);
        const a = window.wData?.get(jn);
        
        const job = {
          jn, 
          disc: meta?.disc || 'Unknown', 
          desc: meta?.desc || `Job ${jn}`, 
          unit: meta?.unit || 'Unit not specified',
          mnt: meta?.mnt || '',
          periods:{}, 
          tot:{f:0,a:0,wd:0,v:0},
          wgs: {}
        };
        for(let i=1; i<=13; i++) {
          const p = `P${i}`;
          const fv = f?.periods[p]||0;
          const avRaw = a?.periods[p]||0;
          // A reported period must remain actual even when it falls after a manually
          // selected cutoff. The cutoff only determines how unreported periods are filled.
          const av = getMainPageActual(fv, a?.periods, p, maxWorkDonePeriod);
          job.periods[p] = {f:fv, a:av, wd:avRaw, v:av-fv};
          job.tot.f += fv;
          job.tot.a += av;
          job.tot.wd = (job.tot.wd || 0) + avRaw;
          job.tot.v += av-fv;
        }

        // Build mapping from normalized workgroup to actual keys in each source
        // This prevents duplicate entries when the same workgroup has different key formats
        const fWgKeys = Object.keys(f?.wgs || {});
        const aWgKeys = Object.keys(a?.wgs || {});
        const normalizedToActual = new Map();

        fWgKeys.forEach(key => {
          const normalized = normalizeWorkGroupSet(key);
          if (!normalizedToActual.has(normalized)) {
            normalizedToActual.set(normalized, {});
          }
          normalizedToActual.get(normalized).fKey = key;
        });

        aWgKeys.forEach(key => {
          const normalized = normalizeWorkGroupSet(key);
          if (!normalizedToActual.has(normalized)) {
            normalizedToActual.set(normalized, {});
          }
          normalizedToActual.get(normalized).aKey = key;
        });

        normalizedToActual.forEach((keys, normalized) => {
          job.wgs[normalized] = {periods: {}};
          for(let i=1; i<=13; i++) {
            const p = `P${i}`;
            const fv = (keys.fKey ? f?.wgs?.[keys.fKey]?.[p] : 0) || 0;
            const avRaw = (keys.aKey ? a?.wgs?.[keys.aKey]?.[p] : 0) || 0;
            const av = getMainPageActual(
              fv,
              keys.aKey ? a?.wgs?.[keys.aKey] : null,
              p,
              maxWorkDonePeriod
            );
            job.wgs[normalized].periods[p] = {f: fv, a: av, wd: avRaw, v: av - fv};
          }
        });
        baseJobs.push(job);
      });
      const groupFilter = document.getElementById('groupFilter')?.value || 'all';
      const activeGroup = getAllGroups().find(group => group.id === groupFilter);

      const search = document.getElementById('search')?.value.toLowerCase() || '';
      const period = normalizePeriodKey(document.getElementById('period')?.value || 'all');
      const wgFilter = document.getElementById('wgFilter')?.value || 'all';
      const normalizedWgFilter = wgFilter === 'all' ? 'all' : normalizeWorkGroupSet(wgFilter);
      const reviewStage = currentReviewStage;
      const getJobDisplayData = (job) => {
        if (normalizedWgFilter === 'all') {
          if (!engineerWorkGroups || engineerWorkGroups.length === 0) {
            return { periods: job.periods, tot: job.tot };
          }

          const periods = {};
            const totals = { f: 0, a: 0, wd: 0, v: 0 };
            for (let i = 1; i <= 13; i++) {
              const p = `P${i}`;
              const data = engineerWorkGroups.reduce((acc, engineerWg) => {
                const normalizedWg = normalizeWorkGroupSet(engineerWg);
                const wgPeriod = job.wgs?.[normalizedWg]?.periods?.[p];
                if (!wgPeriod) return acc;
                acc.f += wgPeriod.f || 0;
                acc.a += wgPeriod.a || 0;
                acc.wd += wgPeriod.wd || 0;
                acc.v += wgPeriod.v || 0;
                return acc;
            }, { f: 0, a: 0, wd: 0, v: 0 });
            periods[p] = data;
            totals.f += data.f;
            totals.a += data.a;
            totals.wd += data.wd;
            totals.v += data.v;
          }
          return { periods, tot: totals };
        }
        const wgData = job.wgs?.[normalizedWgFilter];
        const periods = {};
        const totals = { f: 0, a: 0, wd: 0, v: 0 };
        for (let i = 1; i <= 13; i++) {
          const p = `P${i}`;
          const data = wgData?.periods?.[p] || { f: 0, a: 0, wd: 0, v: 0 };
          periods[p] = data;
          totals.f += data.f || 0;
          totals.a += data.a || 0;
          totals.wd += data.wd || 0;
          totals.v += data.v || 0;
        }
        return { periods, tot: totals };
      };

      const filterByGroup = (job) => {
        if (groupFilter === 'all') return true;
        if (!activeGroup) return false;
        if (job.isGroupRollup) return job.groupId === activeGroup.id;
        return activeGroup.jobNumbers.includes(job.jn);
      };

      const engineerWorkGroups = getSelectedEngineerWorkGroups();
      const filterByDeliveryUnit = (job) => currentDeliveryUnit === 'all' || job.mnt === currentDeliveryUnit;
      const filterByEngineer = (job) => {
        // If no engineer selected, show all jobs
        if (!engineerWorkGroups || engineerWorkGroups.length === 0) return true;
        // Check if job has data for any of the engineer's work groups
        const jobWorkGroups = Object.keys(job.wgs || {});
        return jobWorkGroups.some(jwg => {
          const normalizedJwg = normalizeWorkGroupSet(jwg);
          return engineerWorkGroups.some(ewg => normalizeWorkGroupSet(ewg) === normalizedJwg);
        });
      };

      const filterBySearch = (job) => {
        const matchesSearch = !search || job.jn.includes(search) || job.desc.toLowerCase().includes(search) || job.disc.toLowerCase().includes(search);
        if (!matchesSearch) return false;
        if (normalizedWgFilter === 'all') return true;
        const wgData = job.wgs[normalizedWgFilter];
        if (!wgData) return false;
        return Object.values(wgData.periods || {}).some(periodData => periodData.f !== 0 || periodData.a !== 0);
      };

      const baseFiltered = baseJobs.filter(job => filterByGroup(job) && filterByDeliveryUnit(job) && filterByEngineer(job) && filterBySearch(job));
      const rollupJobs = getAllGroups()
        .filter(group => group.rollUp)
        .map(group => buildGroupRollupJob(group, baseJobs))
        .filter(Boolean);
      const rollupFiltered = rollupJobs.filter(job => filterByGroup(job) && filterByDeliveryUnit(job) && filterByEngineer(job) && filterBySearch(job));

      const applyVarianceFilter = (job) => {
        const displayData = getJobDisplayData(job);
        const pd = period === 'all' ? displayData.tot : displayData.periods[period];
        const { status, hasVariance, hasNoForecast } = getVarianceStatus(pd);
        if (varianceFilter === 'all') return true;
        if (varianceFilter === 'variance') return hasVariance;
        if (varianceFilter === 'noforecast') return hasNoForecast;
        if (varianceFilter === 'over') return pd.v > 0;
        if (varianceFilter === 'under') return pd.v < 0;
        // For good/warning/bad filters, exclude jobs with no forecast
        if (hasNoForecast) return false;
        return status === varianceFilter;
      };

      const applyReviewStatusFilter = (job) => {
        if (reviewStatusFilter === 'all') return true;
        if (job.isGroupRollup) return false;
        const isReviewed = isJobReviewed(job.jn, reviewStage);
        if (reviewStatusFilter === 'reviewed') return isReviewed;
        if (reviewStatusFilter === 'needsreview') return !isReviewed;
        return true;
      };

      const hideZeroVolume = document.getElementById('hideZeroVolume')?.checked || false;
      const applyZeroVolumeFilter = (job) => {
        if (!hideZeroVolume) return true;
        const displayData = getJobDisplayData(job);
        // Hide only if BOTH forecast AND actual are 0
        return !(displayData.tot.f === 0 && displayData.tot.a === 0);
      };

      const filtered = [
        ...baseFiltered.filter(applyReviewStatusFilter).filter(applyVarianceFilter).filter(applyZeroVolumeFilter),
        ...rollupFiltered.filter(applyReviewStatusFilter).filter(applyVarianceFilter).filter(applyZeroVolumeFilter)
      ];
      
      const shouldPrioritizeSelectedGroupRollup = groupFilter !== 'all';
      filtered.sort((a,b) => {
        if (shouldPrioritizeSelectedGroupRollup && a.isGroupRollup !== b.isGroupRollup) {
          return a.isGroupRollup ? -1 : 1;
        }
        const aDisplay = getJobDisplayData(a);
        const bDisplay = getJobDisplayData(b);
        const av = period==='all' ? Math.abs(aDisplay.tot.v) : Math.abs(aDisplay.periods[period]?.v||0);
        const bv = period==='all' ? Math.abs(bDisplay.tot.v) : Math.abs(bDisplay.periods[period]?.v||0);
        return bv - av;
      });

      const byDisc = {};
      filtered.forEach(j => {
        if (!byDisc[j.disc]) byDisc[j.disc] = [];
        byDisc[j.disc].push(j);
      });

      const cont = document.getElementById('jobs');
      if (!forecastDataToUse.size) {
        cont.innerHTML = `<div class="discipline-section"><h3>No forecast loaded for ${currentFinancialYear} ${currentPlanVersion}</h3><p>Upload a forecast file or build one in Forecast Builder.</p></div>`;
        return;
      }
      const fragment = document.createDocumentFragment();
      window.currentJobsMap = new Map([...baseFiltered, ...rollupFiltered].map(job => [job.jn, job]));
      const topVariancePeriod = period === 'all' && maxWorkDonePeriod > 0 ? `P${maxWorkDonePeriod}` : period;
      updateTopBarStats({ jobs: baseJobs, baseFiltered, period: topVariancePeriod, getJobDisplayData, reviewStage, varianceFilter, reviewStatusFilter });
      updateForecastHealth({ baseFiltered, period, getJobDisplayData, varianceFilter });

      // Custom discipline order: ALL, P-Way, W&G, Off Track, S&T, E&P CS, E&P D, then groups/others
      const disciplineOrder = ['ALL', 'P-Way', 'W&G', 'Off Track', 'S&T', 'E&P CS', 'E&P D'];
      const sortedDisciplines = Object.keys(byDisc).sort((a, b) => {
        if (shouldPrioritizeSelectedGroupRollup && (a === 'Group Rollups' || b === 'Group Rollups')) {
          if (a === b) return 0;
          return a === 'Group Rollups' ? -1 : 1;
        }
        const aIndex = disciplineOrder.indexOf(a);
        const bIndex = disciplineOrder.indexOf(b);
        // Both in order list - sort by order
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        // Only a in order list - a comes first
        if (aIndex !== -1) return -1;
        // Only b in order list - b comes first
        if (bIndex !== -1) return 1;
        // Neither in list - sort alphabetically
        return a.localeCompare(b);
      });
      sortedDisciplines.forEach(disc => {
        const sec = document.createElement('div');
        sec.className = 'discipline-section';
        sec.dataset.discipline = disc;
        if (disciplineCollapseState[disc]) sec.classList.add('collapsed');
        const standardDisciplineJobs = byDisc[disc].filter(job => !job.isGroupRollup);
        const disciplineSummaryJobs = standardDisciplineJobs.length ? standardDisciplineJobs : byDisc[disc];
        const disciplineSummary = disciplineSummaryJobs.reduce((totals, job) => {
          const displayData = getJobDisplayData(job);
          const pd = period === 'all' ? displayData.tot : displayData.periods[period];
          totals.f += Number(pd?.f || 0);
          totals.a += Number(pd?.a || 0);
          totals.wd += Number(pd?.wd || 0);
          totals.v += Number(pd?.v || 0);
          return totals;
        }, { f: 0, a: 0, wd: 0, v: 0 });
        const disciplineStatus = getVarianceStatus(disciplineSummary).status;
        const disciplineHealth = getJobHealthStatus(disciplineSummary);
        const disciplineSummaryClass = disciplineStatus === 'bad'
          ? 'critical'
          : disciplineStatus === 'warning'
            ? 'warning'
            : disciplineStatus === 'noforecast'
              ? 'noforecast'
              : 'good';
        const disciplineVarianceClass = disciplineSummary.v > 0
          ? 'variance-positive'
          : disciplineSummary.v < 0
            ? 'variance-negative'
            : '';

        sec.innerHTML = `
          <div class="discipline-header summary-${disciplineSummaryClass}">
            <div class="discipline-title-wrap">
              <span class="discipline-rollup-dot"></span>
              <h2>${escapeHtml(disc)}</h2>
              <span class="discipline-rollup-status">${escapeHtml(disciplineHealth.label)}</span>
            </div>
            <div class="discipline-rollup-metrics" aria-label="${escapeHtml(disc)} planned actual work done and variance roll-up">
              <div class="discipline-rollup-metric">
                <span>Planned</span>
                <strong>${disciplineSummary.f.toFixed(1)}</strong>
              </div>
              <div class="discipline-rollup-metric">
                <span>Actual</span>
                <strong>${disciplineSummary.a.toFixed(1)}</strong>
              </div>
              <div class="discipline-rollup-metric">
                <span>Work Done</span>
                <strong>${disciplineSummary.wd.toFixed(1)}</strong>
              </div>
              <div class="discipline-rollup-metric">
                <span>Variance</span>
                <strong class="${disciplineVarianceClass}">${disciplineSummary.v > 0 ? '+' : ''}${disciplineSummary.v.toFixed(1)} (${disciplineHealth.percent.toFixed(0)}%)</strong>
              </div>
            </div>
            <div class="header-actions">
              <span>${byDisc[disc].length} jobs</span>
              <button type="button" class="section-toggle" onclick="toggleDisciplineSection(this)">Collapse</button>
            </div>
          </div>
        `;

        const grid = document.createElement('div');
        grid.className = 'jobs-grid';
        
        byDisc[disc].forEach(j => {
          const displayData = getJobDisplayData(j);
          const pd = period==='all' ? displayData.tot : displayData.periods[period];
          const { status: stat } = getVarianceStatus(pd);
          const vc = pd.v>0 ? 'positive' : pd.v<0 ? 'negative' : 'neutral';
          const isGroupRollup = Boolean(j.isGroupRollup);
          const isPriority = !isGroupRollup && ['009112', '009113'].includes(j.jn);
          const reviewStatus = isGroupRollup ? 'not_reviewed' : getJobReviewStatus(j.jn, currentFinancialYear, reviewStage);
          const isReviewed = !isGroupRollup && reviewStatus === 'reviewed';
          const reviewStatusLabels = {
            reviewed: 'Reviewed',
            not_reviewed: 'Needs Review'
          };
          const statusLabel = isGroupRollup ? 'Group Rollup' : reviewStatusLabels[reviewStatus];
          const statusClass = isGroupRollup ? 'group-rollup' : (isReviewed ? 'reviewed' : 'needs-review');
          const commentCount = isGroupRollup ? 0 : getJobComments(j.jn).length;
          const varianceValue = `${pd.v > 0 ? '+' : ''}${pd.v.toFixed(1)}`;
          const plannedValue = Math.max(0, Number(pd.f) || 0);
          const actualValue = Math.max(0, Number(pd.a) || 0);
          const baseForBar = Math.max(plannedValue, actualValue, 1);
          const planPct = (plannedValue / baseForBar) * 100;
          const actualWithinPlanPct = (Math.min(actualValue, plannedValue) / baseForBar) * 100;
          const overflowPct = actualValue > plannedValue
            ? ((actualValue - plannedValue) / baseForBar) * 100
            : 0;
          const underPct = actualValue < plannedValue
            ? ((plannedValue - actualValue) / baseForBar) * 100
            : 0;
          const alertTitle = stat === 'bad'
            ? 'Significant variance detected'
            : stat === 'warning'
              ? 'Variance requires review'
              : isReviewed
                ? 'Commentary complete'
                : isGroupRollup
                  ? 'Aggregated group totals'
                  : 'On track';
          const duPeriodData = period === 'all' ? j.tot : j.periods[period];
          const duSummary = `DU total F ${Math.max(0, Number(duPeriodData?.f) || 0).toFixed(1)} • A ${Math.max(0, Number(duPeriodData?.a) || 0).toFixed(1)} • V ${(duPeriodData?.v || 0) > 0 ? '+' : ''}${(duPeriodData?.v || 0).toFixed(1)}`;
          const alertDetail = stat === 'bad'
            ? `Large variance (${varianceValue}). Root cause analysis required.`
            : stat === 'warning'
              ? `Variance (${varianceValue}). Provide commentary for ${reviewStage}.`
              : isReviewed
                ? `Reviewed for ${reviewStage}.`
                : isGroupRollup
                  ? `Includes ${j.groupJobCount} standard job${j.groupJobCount === 1 ? '' : 's'}.`
                  : 'Variance within tolerance.';
          const titleText = isGroupRollup ? j.groupName : `${j.jn} - ${j.desc}`;
          const subtitleText = isGroupRollup
            ? `Group of ${j.groupJobCount} job${j.groupJobCount === 1 ? '' : 's'} • Unit: ${j.unit}`
            : `Discipline: ${j.disc} • Unit: ${j.unit} • Status: ${statusLabel}`;
          const showDuSummary = wgFilter === 'all' && engineerWorkGroups && engineerWorkGroups.length > 0;
          const subtitleWithContext = showDuSummary ? `${subtitleText} • ${duSummary}` : subtitleText;
          
          // Calculate health status for non-rollup jobs
          const healthStatus = !isGroupRollup ? getJobHealthStatus(pd) : null;

          // Get work group count (work groups with volume forecast)
          const workGroupCount = !isGroupRollup ? (j.wgs && Object.keys(j.wgs).length) || 0 : 0;

          // Get actual work orders count from Work Done data
          const actualWorkOrderCount = !isGroupRollup ? (window.wData?.get(j.jn)?.workOrders?.length || 0) : 0;

          // Calculate period progress for progress bar
          let periodsPlanned = 0;
          let periodsActual = 0;
          if (period === 'all') {
            for (let i = 1; i <= 13; i++) {
              const p = `P${i}`;
              if (displayData.periods[p].f > 0) periodsPlanned++;
              if (displayData.periods[p].a > 0) periodsActual++;
            }
          }

          const card = document.createElement('div');
          const celebrateUntil = recentlyReviewedJobs.get(j.jn) || 0;
          const celebrationClass = celebrateUntil > Date.now() ? ' review-celebrating' : '';
          card.className = `job-card ${stat}${celebrationClass}`;
          card.dataset.jobNumber = j.jn;
          card.onclick = () => showBreakdown(j);

          card.innerHTML = `
            ${!isGroupRollup && healthStatus ? `
              <div class="job-status-badge status-${healthStatus.status}">
                ${healthStatus.status === 'critical' ? '🔴' : healthStatus.status === 'warning' ? '🟡' : '🟢'} ${healthStatus.label}
              </div>
            ` : ''}

            <div class="job-card-header">
              <div class="job-pill-group">
                ${isPriority ? '<span class="job-pill priority">Priority</span>' : ''}
                ${isGroupRollup ? '<span class="group-pill">Group</span>' : ''}
                ${!isGroupRollup ? `<span class="job-pill ${statusClass}">${statusLabel}</span>` : ''}
              </div>
            </div>

            <div class="job-card-body">
              <div class="job-details">
                <div class="job-card-title">${escapeHtml(titleText)}</div>
                <div class="job-card-subtitle">${escapeHtml(subtitleWithContext)}</div>

                ${isGroupRollup ? `
                  <div class="group-planned-actual-box">
                    <div class="group-pa-item">
                      <div class="group-pa-label">PLANNED</div>
                      <div class="group-pa-value">${pd.f.toFixed(1)}</div>
                    </div>
                    <div class="group-pa-divider">vs</div>
                    <div class="group-pa-item">
                      <div class="group-pa-label">ACTUAL</div>
                      <div class="group-pa-value">${pd.a.toFixed(1)}</div>
                    </div>
                    <div class="group-pa-divider">/</div>
                    <div class="group-pa-item">
                      <div class="group-pa-label">WORK DONE</div>
                      <div class="group-pa-value">${(pd.wd || 0).toFixed(1)}</div>
                    </div>
                  </div>
                ` : `
                  <div class="job-variance-overview">
                    <div class="job-variance-row">
                      <div class="job-variance-item">
                        <div class="job-variance-label">Planned</div>
                        <div class="job-variance-value">${pd.f.toFixed(1)}</div>
                      </div>
                      <div class="job-variance-item">
                        <div class="job-variance-label">Actual</div>
                        <div class="job-variance-value">${pd.a.toFixed(1)}</div>
                      </div>
                      <div class="job-variance-item">
                        <div class="job-variance-label">Work Done</div>
                        <div class="job-variance-value">${(pd.wd || 0).toFixed(1)}</div>
                      </div>
                      <div class="job-variance-item">
                        <div class="job-variance-label">Variance</div>
                        <div class="job-variance-value ${vc === 'negative' ? 'variance-negative' : vc === 'positive' ? 'variance-positive' : ''}">${pd.v > 0 ? '+' : ''}${pd.v.toFixed(1)} ${healthStatus ? `(${healthStatus.percent.toFixed(0)}%)` : ''}</div>
                      </div>
                    </div>
                    <div class="job-progress-bar-wrap" title="Blue=actual delivered, Grey=remaining to plan, Red=over plan">
                      <div class="job-progress-bar">
                        <div class="job-progress-actual" style="width:${actualWithinPlanPct.toFixed(2)}%"></div>
                        ${underPct > 0 ? `<div class="job-progress-under" style="width:${underPct.toFixed(2)}%"></div>` : ''}
                        ${overflowPct > 0 ? `<div class="job-progress-overflow" style="width:${overflowPct.toFixed(2)}%"></div>` : ''}
                        <div class="job-progress-plan-marker" style="left:${planPct.toFixed(2)}%"></div>
                      </div>
                    </div>
                  </div>
                `}

                ${!isGroupRollup ? `
                  <div class="job-info-row">
                    <div class="job-rag-indicator rag-${healthStatus?.status === 'critical' ? 'red' : healthStatus?.status === 'warning' ? 'amber' : 'green'}"></div>
                    <span class="job-info-text">${commentCount} comment${commentCount === 1 ? '' : 's'} • ${actualWorkOrderCount} work order${actualWorkOrderCount === 1 ? '' : 's'} • ${workGroupCount} work group${workGroupCount === 1 ? '' : 's'} with forecast • ${statusLabel}</span>
                  </div>
                ` : ''}
              </div>
            </div>

            <div class="job-actions">
              ${isGroupRollup
                ? '<button type="button" class="group-action-button" data-action="manage-group">Manage Group</button>'
                : '<button type="button" class="primary-button" data-action="commentary">Add Commentary</button>'}
              ${!isGroupRollup && commentCount ? `<button type="button" class="secondary" data-action="view-comments">View Comments (${commentCount})</button>` : ''}
              <button type="button" class="secondary" data-action="details">View Details</button>
              ${!isGroupRollup && (isReviewed
                ? '<button type="button" class="secondary" data-action="reopen">Reopen</button>'
                : '<button type="button" class="success" data-action="reviewed">Mark Reviewed</button>')}
            </div>
          `;

          card.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', event => {
              event.stopPropagation();
              const action = button.dataset.action;
              if (action === 'details') {
                showBreakdown(j, { scrollTop: true });
              }
              if (action === 'commentary') {
                openCommentary(j);
              }
              if (action === 'view-comments') {
                openCommentary(j);
              }
              if (action === 'manage-group' && j.groupId) {
                openGroupModal(j.groupId);
              }
              if (action === 'reviewed' && !isReviewed) {
                markJobReviewed(j.jn, reviewStage);
                triggerReviewCelebration(j.jn);
                renderPreservingScroll();
              }
              if (action === 'reopen' && isReviewed) {
                reopenJobReview(j.jn, reviewStage);
                renderPreservingScroll();
              }
            });
          });
          
          grid.appendChild(card);
        });
        
        sec.appendChild(grid);
        fragment.appendChild(sec);
      });
      cont.replaceChildren(fragment);
      updateModalModeNotes(maxWorkDonePeriod, cutoffValue);
    }

    function updateModalModeNotes(maxWorkDonePeriod, cutoffValue) {
      const cutoffLabel = cutoffValue === 'auto' ? 'Auto' : 'Selected';
      const periodLabel = maxWorkDonePeriod > 0 ? `Period ${maxWorkDonePeriod}` : 'Period N/A';
      const uploadedLabel = workDoneUploadedAt ? ` Work Done uploaded: ${new Date(workDoneUploadedAt).toLocaleString()}.` : '';
      const message = `Units derived from Work Done up to ${periodLabel} (${cutoffLabel}) then Forecast for remaining. Plan v1 can be updated below or in Forecast Builder.${uploadedLabel}`;
      const uploadNote = document.getElementById('uploadModeNote');
      const breakdownNote = document.getElementById('breakdownModeNote');
      if (uploadNote) uploadNote.textContent = message;
      if (breakdownNote) breakdownNote.textContent = message;
    }

    function getForecastTotal(jobData) {
      if (!jobData || !jobData.periods) return 0;
      return Object.values(jobData.periods).reduce((sum, value) => sum + (Number(value) || 0), 0);
    }

    function getAggregateForecastPeriods(jobData) {
      if (!jobData) return {};

      const workGroups = Object.values(jobData.wgs || {});
      if (!workGroups.length) return jobData.periods || {};

      // Work-group rows are the source of truth for a forecast. Rebuild the
      // aggregate here so older V1 snapshots whose cached `periods` object was
      // not recalculated still render their forecast in the breakdown chart.
      const periods = {};
      for (let i = 1; i <= 13; i++) {
        const period = `P${i}`;
        periods[period] = workGroups.reduce(
          (total, workGroup) => total + (Number(workGroup?.[period]) || 0),
          0
        );
      }
      return periods;
    }

    function getForecastPeriodsForJob(jobNumber, wgFilter, planVersion) {
      const snapshot = planVersion === 'v1'
        ? getEffectiveForecastSnapshot(currentFinancialYear)
        : getForecastSnapshot(currentFinancialYear, planVersion);
      if (!snapshot) return null;
      const jobData = snapshot.data.get(jobNumber);
      if (!jobData) return null;
      if (!wgFilter || wgFilter === 'all') return getAggregateForecastPeriods(jobData);

      const directMatch = jobData.wgs?.[wgFilter];
      if (directMatch) return directMatch;

      const normalizedWgFilter = normalizeWorkGroupSet(wgFilter);
      for (const [wgName, wgPeriods] of Object.entries(jobData.wgs || {})) {
        if (normalizeWorkGroupSet(wgName) === normalizedWgFilter) {
          return wgPeriods;
        }
      }

      return null;
    }

    function getForecastPeriodsForGroup(jobNumbers, wgFilter, planVersion) {
      const snapshot = planVersion === 'v1'
        ? getEffectiveForecastSnapshot(currentFinancialYear)
        : getForecastSnapshot(currentFinancialYear, planVersion);
      if (!snapshot || !Array.isArray(jobNumbers) || !jobNumbers.length) return null;

      const totals = {};
      for (let i = 1; i <= 13; i++) {
        totals[`P${i}`] = 0;
      }

      let hasData = false;
      const normalizedWgFilter = wgFilter && wgFilter !== 'all'
        ? normalizeWorkGroupSet(wgFilter)
        : null;

      jobNumbers.forEach(jobNumber => {
        const jobData = snapshot.data.get(jobNumber);
        if (!jobData) return;

        if (!normalizedWgFilter) {
          Object.entries(getAggregateForecastPeriods(jobData)).forEach(([period, value]) => {
            if (period in totals) {
              totals[period] += Number(value) || 0;
              hasData = true;
            }
          });
          return;
        }

        Object.entries(jobData.wgs || {}).forEach(([wgName, wgPeriods]) => {
          if (normalizeWorkGroupSet(wgName) !== normalizedWgFilter) return;
          Object.entries(wgPeriods || {}).forEach(([period, value]) => {
            if (period in totals) {
              totals[period] += Number(value) || 0;
              hasData = true;
            }
          });
        });
      });

      return hasData ? totals : null;
    }

    function getForecastPeriodsForScope(job, workGroups, planVersion) {
      if (!workGroups) {
        return job.isGroupRollup
          ? getForecastPeriodsForGroup(getAllGroups().find(group => group.id === job.groupId)?.jobNumbers || [], 'all', planVersion)
          : getForecastPeriodsForJob(job.jn, 'all', planVersion);
      }

      const totals = Object.fromEntries(Array.from({ length: 13 }, (_, index) => [`P${index + 1}`, 0]));
      let hasData = false;
      workGroups.forEach(workGroup => {
        const periods = job.isGroupRollup
          ? getForecastPeriodsForGroup(getAllGroups().find(group => group.id === job.groupId)?.jobNumbers || [], workGroup, planVersion)
          : getForecastPeriodsForJob(job.jn, workGroup, planVersion);
        if (!periods) return;
        hasData = true;
        Object.keys(totals).forEach(period => {
          totals[period] += Number(periods[period]) || 0;
        });
      });
      return hasData ? totals : null;
    }

    function getWorkDonePeriodsForScope(job, workGroups) {
      const periods = {};
      const sourceJobs = job.isGroupRollup
        ? (getAllGroups().find(group => group.id === job.groupId)?.jobNumbers || [])
            .map(jobNumber => window.wData?.get(jobNumber))
            .filter(Boolean)
        : [window.wData?.get(job.jn)].filter(Boolean);

      for (let i = 1; i <= 13; i++) {
        const period = `P${i}`;
        if (!workGroups) {
          const reportedJobs = sourceJobs.filter(sourceJob =>
            Object.prototype.hasOwnProperty.call(sourceJob?.periods || {}, period)
          );
          if (reportedJobs.length) periods[period] = reportedJobs.reduce(
            (sum, sourceJob) => sum + (Number(sourceJob.periods[period]) || 0),
            0
          );
          continue;
        }

        let hasReportedWork = false;
        const total = sourceJobs.reduce((jobSum, sourceJob) => {
          const sourceWorkGroups = Object.entries(sourceJob?.wgs || {});
          return jobSum + workGroups.reduce((sum, workGroup) => {
            const normalized = normalizeWorkGroupSet(workGroup);
            const matchingEntry = sourceWorkGroups.find(([name]) => normalizeWorkGroupSet(name) === normalized);
            if (!matchingEntry || !Object.prototype.hasOwnProperty.call(matchingEntry[1] || {}, period)) return sum;
            hasReportedWork = true;
            return sum + (Number(matchingEntry[1][period]) || 0);
          }, 0);
        }, 0);
        if (hasReportedWork) periods[period] = total;
      }

      return periods;
    }

    function getBreakdownTableJob(job, planVersion) {
      const tablePlanVersion = planVersion === 'v1' ? 'v1' : 'v0';
      const sourceJobNumbers = job.isGroupRollup
        ? getAllGroups().find(group => group.id === job.groupId)?.jobNumbers || []
        : [job.jn];
      const selectedForecastJobs = sourceJobNumbers.map(jobNumber => tablePlanVersion === 'v1'
        ? getEffectiveForecastJob(currentFinancialYear, jobNumber)
        : getForecastSnapshot(currentFinancialYear, 'v0')?.data.get(jobNumber)
      ).filter(Boolean);
      const workGroupsByIdentity = new Map();

      // Retain Work Done-only rows from the dashboard job, then add any rows
      // that exist only in the plan selected inside the breakdown modal.
      Object.keys(job.wgs || {}).forEach(workGroup => {
        workGroupsByIdentity.set(normalizeWorkGroupSet(workGroup), workGroup);
      });
      selectedForecastJobs.forEach(forecastJob => {
        Object.keys(forecastJob.wgs || {}).forEach(workGroup => {
          workGroupsByIdentity.set(normalizeWorkGroupSet(workGroup), workGroup);
        });
      });

      const cutoffPeriod = getEffectiveForecastCutoffPeriod();
      const wgs = {};
      workGroupsByIdentity.forEach(workGroup => {
        const forecastPeriods = getForecastPeriodsForScope(job, [workGroup], tablePlanVersion) || {};
        const workDonePeriods = getWorkDonePeriodsForScope(job, [workGroup]);
        const periods = {};
        for (let index = 1; index <= 13; index++) {
          const period = `P${index}`;
          const forecast = Number(forecastPeriods[period]) || 0;
          const workDone = Number(workDonePeriods[period]) || 0;
          const actual = getMainPageActual(forecast, workDonePeriods, period, cutoffPeriod);
          periods[period] = { f: forecast, a: actual, wd: workDone, v: actual - forecast };
        }
        wgs[workGroup] = { periods };
      });
      return { wgs };
    }

    function resolveForecastWorkGroupPeriods(forecastJob, workGroup) {
      const stored = Object.keys(forecastJob?.wgs || {}).find(
        candidate => normalizeWorkGroupSet(candidate) === normalizeWorkGroupSet(workGroup)
      );
      return stored ? forecastJob.wgs[stored] : null;
    }

    let breakdownPlanEditContext = null;

    function openWorkGroupPlanEditor(job, workGroup) {
      const modal = document.getElementById('workGroupPlanEditModal');
      const grid = document.getElementById('workGroupPlanEditGrid');
      if (!modal || !grid) return;
      const effectivePeriods = resolveForecastWorkGroupPeriods(getEffectiveForecastJob(currentFinancialYear, job.jn), workGroup) || {};
      const v0Periods = resolveForecastWorkGroupPeriods(getForecastSnapshot(currentFinancialYear, 'v0')?.data.get(job.jn), workGroup) || {};
      // Intentionally raw: the reset action is available only when this work group itself has a sparse v1 override.
      const rawV1Job = getForecastSnapshot(currentFinancialYear, 'v1')?.data.get(job.jn);
      const hasOverride = Boolean(resolveForecastWorkGroupPeriods(rawV1Job, workGroup));
      breakdownPlanEditContext = { job, workGroup };
      document.getElementById('workGroupPlanEditTitle').textContent = window.workGroupSets?.get(workGroup) || workGroup;
      document.getElementById('workGroupPlanEditMeta').textContent = `${job.jn} · Plan v1 override`;
      const resetButton = document.getElementById('resetWorkGroupPlanEdit');
      if (resetButton) resetButton.hidden = !hasOverride;
      grid.innerHTML = Array.from({ length: 13 }, (_, index) => {
        const period = `P${index + 1}`;
        const value = Number(effectivePeriods[period] || 0);
        const v0Value = Number(v0Periods[period] || 0);
        return `<label class="wg-plan-edit-period"><span>${period}</span><input data-period="${period}" type="number" min="0" step="0.01" value="${value}" aria-label="Plan v1 ${escapeHtml(workGroup)} ${period}"><small>Plan v0: ${v0Value.toFixed(1)}</small></label>`;
      }).join('');
      modal.classList.add('open');
      grid.querySelector('input')?.focus();
    }

    function closeWorkGroupPlanEditor() {
      document.getElementById('workGroupPlanEditModal')?.classList.remove('open');
      breakdownPlanEditContext = null;
    }

    async function saveBreakdownPlanV1() {
      if (!breakdownPlanEditContext) return;
      const { job, workGroup } = breakdownPlanEditContext;
      const inputs = [...document.querySelectorAll('#workGroupPlanEditGrid input[data-period]')];
      const periods = {};
      for (const input of inputs) {
        const value = Number(input.value);
        if (!Number.isFinite(value) || value < 0) {
          alert(`Enter a valid non-negative value for ${input.dataset.period}.`);
          input.focus();
          return;
        }
        periods[input.dataset.period] = value;
      }

      const saveButton = document.getElementById('saveWorkGroupPlanEdit');
      if (saveButton) saveButton.disabled = true;
      let snapshot = await getForecastSnapshotAsync(currentFinancialYear, 'v1');
      if (!snapshot) snapshot = { data: new Map(), rowCount: 0 };
      let forecastJob = snapshot.data.get(job.jn);
      if (!forecastJob) {
        forecastJob = { periods: {}, wgs: {}, comments: {}, amendments: {} };
        snapshot.data.set(job.jn, forecastJob);
      }
      forecastJob.periods ||= {};
      forecastJob.wgs ||= {};
      forecastJob.comments ||= {};
      forecastJob.amendments ||= {};
      const storedWorkGroup = Object.keys(forecastJob.wgs).find(candidate => normalizeWorkGroupSet(candidate) === normalizeWorkGroupSet(workGroup));
      const workGroupKey = storedWorkGroup || workGroup;
      const previousPeriods = resolveForecastWorkGroupPeriods(getEffectiveForecastJob(currentFinancialYear, job.jn), workGroup) || {};
      Object.entries(periods).forEach(([period, value]) => {
        const previous = Number(previousPeriods[period] || 0);
        if (Math.abs(value - previous) >= 0.0001) {
          const amendmentKey = `${workGroupKey}:${period}`;
          forecastJob.amendments[amendmentKey] ||= { original: previous };
          forecastJob.amendments[amendmentKey].updatedAt = new Date().toISOString();
        }
      });
      forecastJob.wgs[workGroupKey] = periods;
      forecastJob.periods = recalculatePeriodsFromWgs(forecastJob.wgs);

      const saved = await saveForecastJobToStorageAsync(
        job.jn,
        forecastJob,
        snapshot,
        currentFinancialYear,
        'v1'
      );
      if (saveButton) saveButton.disabled = false;
      if (!saved) {
        window.Toast?.error('Plan v1 was not saved. Please try again.');
        return;
      }
      await addToV1OverridesAsync(currentFinancialYear, [job.jn]);
      if (currentPlanVersion === 'v1') fData = getEffectiveForecastSnapshot(currentFinancialYear).data;
      closeWorkGroupPlanEditor();
      render();
      showBreakdown(window.currentJobsMap.get(job.jn) || job);
      const status = document.getElementById('breakdownForecastStatus');
      if (status) status.textContent = window.isApiEnabled?.() ? 'Plan v1 saved to server' : 'Plan v1 saved locally';
    }

    async function resetBreakdownPlanV1() {
      if (!breakdownPlanEditContext) return;
      const { job, workGroup } = breakdownPlanEditContext;
      const resetButton = document.getElementById('resetWorkGroupPlanEdit');
      if (resetButton) resetButton.disabled = true;

      // Intentionally raw: reset removes only the stored override, never an inherited v0 work group.
      const snapshot = await getForecastSnapshotAsync(currentFinancialYear, 'v1');
      const forecastJob = snapshot?.data.get(job.jn);
      const storedWorkGroup = Object.keys(forecastJob?.wgs || {}).find(
        candidate => normalizeWorkGroupSet(candidate) === normalizeWorkGroupSet(workGroup)
      );
      if (!snapshot || !forecastJob || !storedWorkGroup) {
        if (resetButton) resetButton.disabled = false;
        return;
      }

      delete forecastJob.wgs[storedWorkGroup];
      if (forecastJob.comments) delete forecastJob.comments[storedWorkGroup];
      if (forecastJob.amendments) {
        Object.keys(forecastJob.amendments).forEach(key => {
          if (normalizeWorkGroupSet(key.split(':')[0]) === normalizeWorkGroupSet(storedWorkGroup)) {
            delete forecastJob.amendments[key];
          }
        });
      }
      forecastJob.periods = recalculatePeriodsFromWgs(forecastJob.wgs);
      const saved = await saveForecastJobToStorageAsync(job.jn, forecastJob, snapshot, currentFinancialYear, 'v1');
      if (resetButton) resetButton.disabled = false;
      if (!saved) {
        window.Toast?.error('Plan v1 reset was not saved. Please try again.');
        return;
      }

      // Keep job-level tracking while any other work group remains overridden.
      if (Object.keys(forecastJob.wgs || {}).length === 0) {
        await removeFromV1OverridesAsync(currentFinancialYear, [job.jn]);
      }
      if (currentPlanVersion === 'v1') fData = getEffectiveForecastSnapshot(currentFinancialYear).data;
      closeWorkGroupPlanEditor();
      render();
      showBreakdown(window.currentJobsMap.get(job.jn) || job);
      const status = document.getElementById('breakdownForecastStatus');
      if (status) status.textContent = 'Work group reset to Plan v0';
    }

    window.openWorkGroupPlanEditor = openWorkGroupPlanEditor;
    window.closeWorkGroupPlanEditor = closeWorkGroupPlanEditor;
    window.saveBreakdownPlanV1 = saveBreakdownPlanV1;
    window.resetBreakdownPlanV1 = resetBreakdownPlanV1;

    function openForecastComparison() {
      if (!currentFinancialYear || !currentReviewStage) {
        openStageModal();
        return;
      }
      const modal = document.getElementById('forecastCompare');
      if (!modal) return;
      renderForecastComparison();
      modal.classList.add('open');
    }

    function closeForecastComparison() {
      document.getElementById('forecastCompare')?.classList.remove('open');
    }

    function renderForecastComparison() {
      const meta = document.getElementById('forecastCompareMeta');
      const table = document.getElementById('compareTable');
      const changedOnly = document.getElementById('compareChangedOnly')?.checked || false;
      const search = (document.getElementById('compareSearch')?.value || '').toLowerCase();
      if (!table) return;
      const v0Snapshot = getForecastSnapshot(currentFinancialYear, 'v0');
      // Intentionally raw: only source metadata comes from stored v1; comparison values use the effective snapshot below.
      const v1SnapshotRaw = getForecastSnapshot(currentFinancialYear, 'v1');
      const v1Snapshot = getEffectiveForecastSnapshot(currentFinancialYear);
      if (!v0Snapshot) {
        table.innerHTML = '<thead><tr><th>Forecast comparison</th></tr></thead><tbody><tr><td class="wo-empty">Plan v0 forecast must be available to compare.</td></tr></tbody>';
        if (meta) {
          meta.textContent = `Missing v0 data for ${currentFinancialYear} ${currentReviewStage}.`;
        }
        return;
      }

      // Compare v0 with the complete projection of sparse v1 overrides.
      const v1Data = v1Snapshot.data;

      const allJobs = new Set([...(v0Snapshot.data.keys()), ...(v1Data.keys())]);
      const rows = [];
      allJobs.forEach(jobNumber => {
        const v0Job = v0Snapshot.data.get(jobNumber);
        const v1Job = v1Data.get(jobNumber);
        const v0 = getForecastTotal(v0Job);
        const v1 = getForecastTotal(v1Job);
        const delta = v1 - v0;
        const desc = window.stdJobs.get(jobNumber)?.desc || `Job ${jobNumber}`;

        // Build work group breakdown for tooltip
        const v0Breakdown = [];
        const v1Breakdown = [];

        if (v0Job && v0Job.wgs) {
          Object.entries(v0Job.wgs).forEach(([wgName, wgData]) => {
            let wgTotal = 0;
            window.FORECAST_PERIODS.forEach(period => {
              wgTotal += Number(wgData?.[period] || 0);
            });
            if (wgTotal !== 0) {
              v0Breakdown.push(`${wgName}: ${wgTotal.toFixed(2)}`);
            }
          });
        }

        if (v1Job && v1Job.wgs) {
          Object.entries(v1Job.wgs).forEach(([wgName, wgData]) => {
            let wgTotal = 0;
            window.FORECAST_PERIODS.forEach(period => {
              wgTotal += Number(wgData?.[period] || 0);
            });
            if (wgTotal !== 0) {
              v1Breakdown.push(`${wgName}: ${wgTotal.toFixed(2)}`);
            }
          });
        }

        if (changedOnly && delta === 0) return;
        if (search && !`${jobNumber} ${desc}`.toLowerCase().includes(search)) return;
        rows.push({ jobNumber, desc, v0, v1, delta, v0Breakdown, v1Breakdown });
      });
      rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      const header = `
        <thead>
          <tr>
            <th>Standard Job</th>
            <th>Description</th>
            <th>Plan v0 total</th>
            <th>Plan v1 total</th>
            <th>Δ (v1 - v0)</th>
          </tr>
        </thead>
      `;
      if (!rows.length) {
        table.innerHTML = `${header}<tbody><tr><td colspan="5" class="wo-empty">No forecast differences found.</td></tr></tbody>`;
      } else {
        table.innerHTML = `
          ${header}
          <tbody>
            ${rows.map(row => {
              const deltaClass = row.delta > 0 ? 'positive' : row.delta < 0 ? 'negative' : 'neutral';

              // Build tooltip text
              const tooltipParts = [];
              if (row.v0Breakdown.length > 0) {
                tooltipParts.push(`Plan v0 breakdown:\n${row.v0Breakdown.join('\n')}`);
              }
              if (row.v1Breakdown.length > 0) {
                tooltipParts.push(`Plan v1 breakdown:\n${row.v1Breakdown.join('\n')}`);
              }
              const tooltip = tooltipParts.length > 0 ? tooltipParts.join('\n\n') : 'No work group data';

              return `
                <tr title="${escapeHtml(tooltip)}" style="cursor: help;">
                  <td>${escapeHtml(row.jobNumber)}</td>
                  <td>${escapeHtml(row.desc)}</td>
                  <td>${row.v0.toFixed(2)}</td>
                  <td>${row.v1.toFixed(2)}</td>
                  <td class="${deltaClass}">${row.delta > 0 ? '+' : ''}${row.delta.toFixed(2)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        `;
      }
      if (meta) {
        const v1Source = v1SnapshotRaw ? v1SnapshotRaw.source : 'not available';
        meta.textContent = `${currentFinancialYear} ${currentReviewStage} • Plan v0 (${v0Snapshot.source}) vs Plan v1 (${v1Source}) • ${rows.length} jobs`;
      }
    }

    function showBreakdown(job, options = {}) {
      const wgFilter = document.getElementById('wgFilter')?.value || 'all';
      const engineerFilter = document.getElementById('engineerFilter')?.value || 'all';
      if (currentBreakdownJobNumber !== job.jn) {
        breakdownChartScope = getDefaultBreakdownChartScope();
        breakdownChartScopeTarget = breakdownChartScope === 'workgroup'
          ? wgFilter
          : breakdownChartScope === 'engineer' ? engineerFilter : '';
        currentBreakdownJobNumber = job.jn;
      }
      const period = normalizePeriodKey(document.getElementById('period')?.value || 'all');
      const wgLabel = wgFilter === 'all' ? '' : ` • ${wgFilter}`;
      const breakdownModal = document.getElementById('breakdown');
      const modalContent = breakdownModal?.querySelector('.modal-content');
      document.getElementById('bdTitle').textContent = `${job.jn} - Breakdown`;
      document.getElementById('bdMeta').textContent = `${job.desc} • ${job.disc} • ${job.unit}${wgLabel}`;
      const selectedEngineerWorkGroups = getSelectedEngineerWorkGroups();
      const dashboardScopeWorkGroups = wgFilter !== 'all'
        ? [wgFilter]
        : selectedEngineerWorkGroups?.length ? selectedEngineerWorkGroups : null;
      const displayData = (() => {
        if (!dashboardScopeWorkGroups) {
          return { periods: job.periods, tot: job.tot };
        }
        const periods = {};
        const totals = { f: 0, a: 0, wd: 0, v: 0 };
        for (let i = 1; i <= 13; i++) {
          const p = `P${i}`;
          const data = dashboardScopeWorkGroups.reduce((sum, workGroup) => {
            const normalized = normalizeWorkGroupSet(workGroup);
            const scoped = job.wgs?.[normalized]?.periods?.[p];
            if (!scoped) return sum;
            sum.f += scoped.f || 0;
            sum.a += scoped.a || 0;
            sum.wd += scoped.wd || 0;
            sum.v += scoped.v || 0;
            return sum;
          }, { f: 0, a: 0, wd: 0, v: 0 });
          periods[p] = data;
          totals.f += data.f || 0;
          totals.a += data.a || 0;
          totals.wd += data.wd || 0;
          totals.v += data.v || 0;
        }
        return { periods, tot: totals };
      })();
      if (modalContent) {
        const pd = period === 'all' ? displayData.tot : displayData.periods[period];
        const { status } = getVarianceStatus(pd);
        modalContent.classList.remove('rag-good', 'rag-warning', 'rag-bad');
        modalContent.classList.add(`rag-${status}`);
      }
      const compareButton = document.getElementById('compareForecastButton');
      if (compareButton) {
        const hasV1 = Boolean(getForecastSnapshot(window.currentFinancialYear, 'v1'));
        compareButton.style.display = hasV1 ? 'inline-flex' : 'none';
      }

      // Set breakdown plan version selector
      const breakdownPlanSelect = document.getElementById('breakdownPlanVersion');
      if (breakdownPlanSelect) {
        breakdownPlanSelect.value = breakdownPlanVersion;
      }
      const wgComparePlanSelect = document.getElementById('wgComparePlanVersion');
      if (wgComparePlanSelect) {
        wgComparePlanSelect.value = breakdownPlanVersion;
      }
      const wgCompareBadge = document.getElementById('wgCompareBadge');
      if (wgCompareBadge) {
        wgCompareBadge.textContent = getBreakdownComparisonLabel();
      }

      // Set work group display mode selector
      const wgDisplaySelect = document.getElementById('wgDisplayMode');
      if (wgDisplaySelect) {
        wgDisplaySelect.value = wgDisplayMode;
      }

      const chartScopeSelect = document.getElementById('breakdownChartScope');
      const chartScopeTargetSelect = document.getElementById('breakdownChartScopeTarget');
      const jobWorkGroups = Object.keys(job.wgs || {});
      const jobWorkGroupSet = new Set(jobWorkGroups.map(normalizeWorkGroupSet));
      const availableEngineers = (window.getEngineers ? window.getEngineers() : []).filter(engineer =>
        (window.getEngineerWorkGroups?.(engineer.id) || []).some(workGroup => jobWorkGroupSet.has(normalizeWorkGroupSet(workGroup)))
      );
      if (chartScopeSelect) {
        chartScopeSelect.value = breakdownChartScope;
      }
      let chartScopeTargetOptions = [];
      if (breakdownChartScope === 'workgroup') {
        chartScopeTargetOptions = jobWorkGroups.map(workGroup => ({
          value: workGroup,
          label: window.workGroupSets?.get(workGroup) || workGroup
        }));
      } else if (breakdownChartScope === 'engineer') {
        chartScopeTargetOptions = availableEngineers.map(engineer => ({ value: engineer.id, label: engineer.name }));
      }
      if (breakdownChartScope === 'workgroup' && breakdownChartScopeTarget) {
        const normalizedTarget = normalizeWorkGroupSet(breakdownChartScopeTarget);
        breakdownChartScopeTarget = chartScopeTargetOptions.find(option => normalizeWorkGroupSet(option.value) === normalizedTarget)?.value || breakdownChartScopeTarget;
      }
      if (!chartScopeTargetOptions.some(option => option.value === breakdownChartScopeTarget)) {
        breakdownChartScopeTarget = chartScopeTargetOptions[0]?.value || '';
      }
      if (chartScopeTargetSelect) {
        chartScopeTargetSelect.hidden = breakdownChartScope === 'overall';
        chartScopeTargetSelect.innerHTML = chartScopeTargetOptions.length
          ? chartScopeTargetOptions.map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('')
          : '<option value="">No matching data</option>';
        chartScopeTargetSelect.value = breakdownChartScopeTarget;
      }
      const chartScopeWorkGroups = breakdownChartScope === 'workgroup'
        ? (breakdownChartScopeTarget ? [breakdownChartScopeTarget] : [])
        : breakdownChartScope === 'engineer'
          ? (window.getEngineerWorkGroups?.(breakdownChartScopeTarget) || [])
          : null;
      const selectedTarget = chartScopeTargetOptions.find(option => option.value === breakdownChartScopeTarget);
      const chartScopeLabel = breakdownChartScope === 'overall'
        ? 'Overall'
        : `${breakdownChartScope === 'workgroup' ? 'Work group set' : 'Engineer'} · ${selectedTarget?.label || 'No matching data'}`;
      const chartScopeBadge = document.getElementById('breakdownChartScopeBadge');
      if (chartScopeBadge) chartScopeBadge.textContent = `Showing ${chartScopeLabel}`;

      // Build cumulative data
      const periods = [];
      let cumA = 0;
      let cumV0 = 0, cumV1 = 0;
      const cumActual = [];
      const cumPlanV0 = [], cumPlanV1 = [];
      const v0Periods = getForecastPeriodsForScope(job, chartScopeWorkGroups, 'v0');
      const v1Periods = getForecastPeriodsForScope(job, chartScopeWorkGroups, 'v1');
      const forecastCutoffPeriod = getEffectiveForecastCutoffPeriod();
      // Complete the projected line with the updated plan whenever v1 is part
      // of the selected comparison and is available. Fall back to v0 for
      // legacy years without a v1 snapshot (or when v0 is explicitly chosen).
      const hasV1Forecast = Boolean(getForecastSnapshot(currentFinancialYear, 'v1'));
      const projectionPlanVersion = breakdownPlanVersion !== 'v0' && hasV1Forecast ? 'v1' : 'v0';
      const projectionPeriods = projectionPlanVersion === 'v1' ? v1Periods : v0Periods;
      const reportedWorkDonePeriods = getWorkDonePeriodsForScope(job, chartScopeWorkGroups);
      
      for(let i=1; i<=13; i++) {
        const p = `P${i}`;
        periods.push(`Period ${i}`);
        cumA += getMainPageActual(
          Number(projectionPeriods?.[p]) || 0,
          reportedWorkDonePeriods,
          p,
          forecastCutoffPeriod
        );
        // Match the dashboard calculation exactly: reported Work Done remains
        // actual even beyond a manual cutoff, while only unreported periods
        // are completed from the selected comparison forecast.
        cumActual.push(cumA);
        if (v0Periods) {
          cumV0 += Number(v0Periods[p]) || 0;
          cumPlanV0.push(cumV0);
        }
        if (v1Periods) {
          cumV1 += Number(v1Periods[p]) || 0;
          cumPlanV1.push(cumV1);
        }
      }
      
      // Draw chart
      const ctx = document.getElementById('chart');
      if (currentChart) currentChart.destroy();

      const datasets = [];

      // Add plan datasets based on user preference
      const showV0 = breakdownPlanVersion === 'v0' || breakdownPlanVersion === 'both';
      const showV1 = breakdownPlanVersion === 'v1' || breakdownPlanVersion === 'both';

      if (showV0 && v0Periods) {
        datasets.push({
          label: 'Forecast v0 (Original)',
          data: cumPlanV0,
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96, 165, 250, 0.12)',
          tension: 0.3,
          fill: true
        });
      }
      if (showV1 && v1Periods) {
        datasets.push({
          label: 'Forecast v1 (Updated)',
          data: cumPlanV1,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.12)',
          tension: 0.3,
          fill: true
        });
      }
      datasets.push({
        label: `Work Done + Forecast ${projectionPlanVersion} (Projected)`,
        data: cumActual,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.3,
        fill: true
      });

      const forecastCutoffLine = {
        id: 'forecastCutoffLine',
        afterDatasetsDraw(chart) {
          if (forecastCutoffPeriod < 1 || forecastCutoffPeriod >= 13) return;
          const xScale = chart.scales.x;
          const yScale = chart.scales.y;
          const leftTick = xScale.getPixelForTick(forecastCutoffPeriod - 1);
          const rightTick = xScale.getPixelForTick(forecastCutoffPeriod);
          const x = (leftTick + rightTick) / 2;
          const { ctx: chartContext } = chart;
          chartContext.save();
          chartContext.beginPath();
          chartContext.setLineDash([6, 5]);
          chartContext.strokeStyle = '#b45309';
          chartContext.lineWidth = 2;
          chartContext.moveTo(x, yScale.top);
          chartContext.lineTo(x, yScale.bottom);
          chartContext.stroke();
          chartContext.setLineDash([]);
          chartContext.fillStyle = '#92400e';
          chartContext.font = '600 11px sans-serif';
          chartContext.textAlign = 'center';
          chartContext.fillText('Work done ends · Forecast starts', x, yScale.top + 12);
          chartContext.restore();
        }
      };

      // Add baseline if it exists and not filtered by workgroup
      // (baseline is route-level, so don't show when viewing a specific workgroup)
      // For group rollups, aggregate baselines from all jobs in the group
      let baselineCumulative;
      if (job.isGroupRollup) {
        const group = getAllGroups().find(g => g.id === job.groupId);
        baselineCumulative = group ? getGroupSjnLifetimeTargetCumulative(group.jobNumbers, 13) : Array(13).fill(0);
      } else {
        baselineCumulative = getSjnLifetimeTargetCumulative(job.jn, 13);
      }
      const hasBaseline = baselineCumulative.some(val => val > 0);
      if (hasBaseline && breakdownChartScope === 'overall') {
        datasets.push({
          label: 'Prior Submission (Cumulative)',
          data: baselineCumulative,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          tension: 0.3,
          fill: false,
          borderDash: [5, 5],
          borderWidth: 2
        });
      }

      currentChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: periods,
          datasets
        },
        plugins: [forecastCutoffLine],
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => ctx.parsed.y == null ? '' : `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}`
              }
            }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
      
      // Build work group table
      const wgTable = document.getElementById('wgTable');
      // Work-group edits are available only while viewing v1; the popup saves a sparse override.
      const canEditPlanV1 = !job.isGroupRollup && ['v1', 'both'].includes(breakdownPlanVersion);
      const v0BreakdownJob = getForecastSnapshot(currentFinancialYear, 'v0')?.data.get(job.jn);
      // Intentionally raw: presence here drives the per-work-group "Edited" indicator, not displayed forecast values.
      const v1BreakdownJob = getForecastSnapshot(currentFinancialYear, 'v1')?.data.get(job.jn);
      const findForecastWorkGroup = (forecastJob, workGroup) => Object.keys(forecastJob?.wgs || {})
        .find(candidate => normalizeWorkGroupSet(candidate) === normalizeWorkGroupSet(workGroup));
      const getForecastWorkGroupPeriods = (forecastJob, workGroup) => {
        const stored = findForecastWorkGroup(forecastJob, workGroup);
        return stored ? forecastJob.wgs[stored] : null;
      };
      const renderPlannedCell = (_workGroup, _period, fallbackValue) => Number(fallbackValue || 0).toFixed(1);
      let tableHTML = '<thead><tr><th>Work Group</th>';
      for(let i=1; i<=13; i++) tableHTML += `<th>P${i}</th>`;
      tableHTML += '<th>Total</th></tr></thead><tbody>';

      const isFiltered = wgFilter !== 'all';
      const engineerWorkGroups = getSelectedEngineerWorkGroups();
      // "Both" uses v0 for the single-value table; the chart remains the
      // explicit two-plan comparison and v1 overrides retain their edit badge.
      const tablePlanVersion = breakdownPlanVersion === 'v1' ? 'v1' : 'v0';
      const tableJob = getBreakdownTableJob(job, tablePlanVersion);
      const wgEntries = Object.entries(tableJob.wgs || {}).filter(([wg]) => {
        if (isFiltered && normalizeWorkGroupSet(wg) !== normalizeWorkGroupSet(wgFilter)) return false;
        if (!engineerWorkGroups || engineerWorkGroups.length === 0) return true;
        const normalizedWg = normalizeWorkGroupSet(wg);
        return engineerWorkGroups.some(ewg => normalizeWorkGroupSet(ewg) === normalizedWg);
      });
      const showForecast = wgDisplayMode === 'forecast';

      if (wgEntries.length === 0) {
        tableHTML += '<tr><td colspan="15"><em>No work group data available.</em></td></tr>';
      } else {
        // Group work groups by engineer
        const engineerGroups = new Map();
        const ungrouped = [];
        let ungroupedTotal = 0;

        wgEntries.forEach(([wg, data]) => {
          const engineer = getEngineerForWorkGroupNormalized(wg);
          if (engineer) {
            if (!engineerGroups.has(engineer.id)) {
              engineerGroups.set(engineer.id, { engineer, workGroups: [] });
            }
            engineerGroups.get(engineer.id).workGroups.push([wg, data]);
          } else {
            ungrouped.push([wg, data]);
            for (let i = 1; i <= 13; i++) {
              const p = `P${i}`;
              const d = data.periods[p] || { f: 0, v: 0 };
              const val = showForecast ? (d.f || 0) : (d.v || 0);
              ungroupedTotal += val;
            }
          }
        });

        let globalIdx = 0;

        // Render grouped work groups by engineer
        engineerGroups.forEach(({ engineer, workGroups }, engKey) => {
          // Calculate engineer subtotals
          const engSubtotals = Array(13).fill(0);
          let engTotal = 0;
          workGroups.forEach(([wg, data]) => {
            for(let i=1; i<=13; i++) {
              const p = `P${i}`;
              const d = data.periods[p] || {f: 0, v: 0};
              const val = showForecast ? (d.f || 0) : (d.v || 0);
              engSubtotals[i-1] += val;
              engTotal += val;
            }
          });

          // Engineer header row
          const engHeaderLabel = `${escapeHtml(engineer.name)} (${workGroups.length} work group${workGroups.length !== 1 ? 's' : ''})<span class="eng-toggle">Show</span>`;
          const engHeaderTotalClass = showForecast
            ? (engTotal !== 0 ? 'forecast-nonzero' : '')
            : (engTotal > 0 ? 'positive' : engTotal < 0 ? 'negative' : 'neutral');
          const engHeaderPrefix = showForecast ? '' : (engTotal > 0 ? '+' : '');
          tableHTML += `<tr class="engineer-header" data-eng="${engineer.id}"><td colspan="14">${engHeaderLabel}</td><td class="${engHeaderTotalClass}"><strong>${engHeaderPrefix}${engTotal.toFixed(1)}</strong></td></tr>`;

          // Work group rows for this engineer
          workGroups.forEach(([wg, data]) => {
            const idx = globalIdx++;
            let rowTotal = 0;
            const summaryOpen = isFiltered;
            const wgDescription = window.workGroupSets?.get(wg) || wg;
            tableHTML += `<tr class="wg-summary engineer-row${summaryOpen ? ' is-open' : ''}" data-wg="${idx}" data-eng="${engineer.id}"><td><strong>${escapeHtml(wgDescription)} <span class="wg-toggle">${summaryOpen ? 'Hide details' : 'Show details'}</span>${canEditPlanV1 ? `<button type="button" class="wg-plan-edit-button" data-edit-work-group="${escapeHtml(wg)}" aria-label="Edit Plan v1 for ${escapeHtml(wgDescription)}">✎</button>${getForecastWorkGroupPeriods(v1BreakdownJob, wg) ? '<span class="wg-plan-edited">Edited</span>' : ''}` : ''}</strong></td>`;
            for(let i=1; i<=13; i++) {
              const p = `P${i}`;
              const d = data.periods[p] || {f: 0, v: 0};
              const val = showForecast ? (d.f || 0) : (d.v || 0);
              rowTotal += val;
              const cl = showForecast ? (val !== 0 ? 'forecast-nonzero' : '') : (val > 0 ? 'positive' : val < 0 ? 'negative' : 'neutral');
              const prefix = showForecast ? '' : (val > 0 ? '+' : '');
              tableHTML += `<td class="${cl}">${prefix}${val.toFixed(1)}</td>`;
            }
            const tcl = showForecast ? (rowTotal !== 0 ? 'forecast-nonzero' : '') : (rowTotal > 0 ? 'positive' : rowTotal < 0 ? 'negative' : 'neutral');
            const tprefix = showForecast ? '' : (rowTotal > 0 ? '+' : '');
            tableHTML += `<td class="${tcl}"><strong>${tprefix}${rowTotal.toFixed(1)}</strong></td></tr>`;

            const detailRows = [
              { shortLabel: 'P', label: 'Planned', key: 'f' },
              { shortLabel: 'A', label: 'Actual', key: 'a' },
              { shortLabel: 'V', label: 'Variance', key: 'v' }
            ];
            detailRows.forEach(({ shortLabel, label, key }) => {
              let detailTotal = 0;
              tableHTML += `<tr class="wg-detail engineer-row${summaryOpen ? ' open' : ''}" data-wg="${idx}" data-eng="${engineer.id}"><td><span class="wg-detail-label"><span class="wg-detail-pill">${shortLabel}</span><span class="wg-detail-text">${label}</span></span></td>`;
              for(let i=1; i<=13; i++) {
                const p = `P${i}`;
                const d = data.periods[p] || {f: 0, a: 0, v: 0};
                const val = d[key] || 0;
                detailTotal += val;
                const cl = key === 'v' ? (val > 0 ? 'positive' : val < 0 ? 'negative' : 'neutral') : '';
                tableHTML += `<td class="${cl}" data-detail-key="${key}" data-period="${p}">${key === 'f' ? renderPlannedCell(wg, p, val) : `${key === 'v' && val > 0 ? '+' : ''}${val.toFixed(1)}`}</td>`;
              }
              const tcl = key === 'v' ? (detailTotal > 0 ? 'positive' : detailTotal < 0 ? 'negative' : 'neutral') : '';
              tableHTML += `<td class="${tcl}" data-detail-total="${key}"><strong>${key === 'v' && detailTotal > 0 ? '+' : ''}${detailTotal.toFixed(1)}</strong></td></tr>`;
            });
          });

          // Engineer subtotal row
          tableHTML += `<tr class="engineer-subtotal engineer-row" data-eng="${engineer.id}"><td>Subtotal</td>`;
          for(let i=0; i<13; i++) {
            const val = engSubtotals[i];
            const cl = showForecast ? (val !== 0 ? 'forecast-nonzero' : '') : (val > 0 ? 'positive' : val < 0 ? 'negative' : 'neutral');
            const prefix = showForecast ? '' : (val > 0 ? '+' : '');
            tableHTML += `<td class="${cl}">${prefix}${val.toFixed(1)}</td>`;
          }
          const etcl = showForecast ? (engTotal !== 0 ? 'forecast-nonzero' : '') : (engTotal > 0 ? 'positive' : engTotal < 0 ? 'negative' : 'neutral');
          const etprefix = showForecast ? '' : (engTotal > 0 ? '+' : '');
          tableHTML += `<td class="${etcl}"><strong>${etprefix}${engTotal.toFixed(1)}</strong></td></tr>`;
        });

        // Render ungrouped work groups (if any)
        if (ungrouped.length > 0) {
          if (engineerGroups.size > 0) {
            const ungroupedHeaderLabel = `Other Work Groups (${ungrouped.length})<span class="eng-toggle">Show</span>`;
            const ungroupedHeaderTotalClass = showForecast
              ? (ungroupedTotal !== 0 ? 'forecast-nonzero' : '')
              : (ungroupedTotal > 0 ? 'positive' : ungroupedTotal < 0 ? 'negative' : 'neutral');
            const ungroupedHeaderPrefix = showForecast ? '' : (ungroupedTotal > 0 ? '+' : '');
            tableHTML += `<tr class="engineer-header" data-eng="ungrouped"><td colspan="14">${ungroupedHeaderLabel}</td><td class="${ungroupedHeaderTotalClass}"><strong>${ungroupedHeaderPrefix}${ungroupedTotal.toFixed(1)}</strong></td></tr>`;
          }
          ungrouped.forEach(([wg, data]) => {
            const idx = globalIdx++;
            let rowTotal = 0;
            const summaryOpen = isFiltered;
            const wgDescription = window.workGroupSets?.get(wg) || wg;
            const engRowClass = engineerGroups.size > 0 ? ' engineer-row' : '';
            tableHTML += `<tr class="wg-summary${engRowClass}${summaryOpen ? ' is-open' : ''}" data-wg="${idx}" data-eng="ungrouped"><td><strong>${escapeHtml(wgDescription)} <span class="wg-toggle">${summaryOpen ? 'Hide details' : 'Show details'}</span>${canEditPlanV1 ? `<button type="button" class="wg-plan-edit-button" data-edit-work-group="${escapeHtml(wg)}" aria-label="Edit Plan v1 for ${escapeHtml(wgDescription)}">✎</button>${getForecastWorkGroupPeriods(v1BreakdownJob, wg) ? '<span class="wg-plan-edited">Edited</span>' : ''}` : ''}</strong></td>`;
            for(let i=1; i<=13; i++) {
              const p = `P${i}`;
              const d = data.periods[p] || {f: 0, v: 0};
              const val = showForecast ? (d.f || 0) : (d.v || 0);
              rowTotal += val;
              const cl = showForecast ? (val !== 0 ? 'forecast-nonzero' : '') : (val > 0 ? 'positive' : val < 0 ? 'negative' : 'neutral');
              const prefix = showForecast ? '' : (val > 0 ? '+' : '');
              tableHTML += `<td class="${cl}">${prefix}${val.toFixed(1)}</td>`;
            }
            const tcl = showForecast ? (rowTotal !== 0 ? 'forecast-nonzero' : '') : (rowTotal > 0 ? 'positive' : rowTotal < 0 ? 'negative' : 'neutral');
            const tprefix = showForecast ? '' : (rowTotal > 0 ? '+' : '');
            tableHTML += `<td class="${tcl}"><strong>${tprefix}${rowTotal.toFixed(1)}</strong></td></tr>`;

            const detailRows = [
              { shortLabel: 'P', label: 'Planned', key: 'f' },
              { shortLabel: 'A', label: 'Actual', key: 'a' },
              { shortLabel: 'V', label: 'Variance', key: 'v' }
            ];
            detailRows.forEach(({ shortLabel, label, key }) => {
              let detailTotal = 0;
              tableHTML += `<tr class="wg-detail${engRowClass}${summaryOpen ? ' open' : ''}" data-wg="${idx}" data-eng="ungrouped"><td><span class="wg-detail-label"><span class="wg-detail-pill">${shortLabel}</span><span class="wg-detail-text">${label}</span></span></td>`;
              for(let i=1; i<=13; i++) {
                const p = `P${i}`;
                const d = data.periods[p] || {f: 0, a: 0, v: 0};
                const val = d[key] || 0;
                detailTotal += val;
                const cl = key === 'v' ? (val > 0 ? 'positive' : val < 0 ? 'negative' : 'neutral') : '';
                tableHTML += `<td class="${cl}" data-detail-key="${key}" data-period="${p}">${key === 'f' ? renderPlannedCell(wg, p, val) : `${key === 'v' && val > 0 ? '+' : ''}${val.toFixed(1)}`}</td>`;
              }
              const tcl = key === 'v' ? (detailTotal > 0 ? 'positive' : detailTotal < 0 ? 'negative' : 'neutral') : '';
              tableHTML += `<td class="${tcl}" data-detail-total="${key}"><strong>${key === 'v' && detailTotal > 0 ? '+' : ''}${detailTotal.toFixed(1)}</strong></td></tr>`;
            });
          });
        }
      }
      tableHTML += '</tbody>';
      wgTable.innerHTML = tableHTML;

      wgTable.querySelectorAll('.wg-plan-edit-button').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          openWorkGroupPlanEditor(job, button.dataset.editWorkGroup);
        });
      });

      const reviewButton = document.getElementById('markBreakdownReviewed');
      if (reviewButton) {
        const reviewStatus = getJobReviewStatus(job.jn, currentFinancialYear, currentReviewStage);
        const reviewStatusLabels = {
          reviewed: 'Reviewed',
          not_reviewed: 'Not reviewed'
        };
        const reviewStatusPill = document.getElementById('breakdownReviewStatus');
        if (reviewStatusPill) {
          reviewStatusPill.textContent = reviewStatusLabels[reviewStatus];
          reviewStatusPill.className = `job-pill ${isJobReviewed(job.jn) ? 'reviewed' : 'needs-review'}`;
        }
        reviewButton.textContent = 'Mark Reviewed';
        reviewButton.style.display = job.isGroupRollup || isJobReviewed(job.jn) ? 'none' : '';
        reviewButton.onclick = () => {
          markJobReviewed(job.jn, currentReviewStage, currentFinancialYear);
          showBreakdown(job);
          renderPreservingScroll();
        };
      }

      // Engineer header click to expand/collapse
      wgTable.querySelectorAll('.engineer-header').forEach(row => {
        row.addEventListener('click', () => {
          const engId = row.dataset.eng;
          const engRows = wgTable.querySelectorAll(`.engineer-row[data-eng="${engId}"]`);
          const isOpen = row.classList.toggle('is-open');
          engRows.forEach(r => r.classList.toggle('open', isOpen));
          const toggle = row.querySelector('.eng-toggle');
          if (toggle) toggle.textContent = isOpen ? 'Hide' : 'Show';
        });
      });

      // Work group summary click to expand/collapse details
      wgTable.querySelectorAll('.wg-summary').forEach(row => {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          const key = row.dataset.wg;
          const details = wgTable.querySelectorAll(`.wg-detail[data-wg="${key}"]`);
          const isOpen = row.classList.toggle('is-open');
          details.forEach(detail => detail.classList.toggle('open', isOpen));
          const toggle = row.querySelector('.wg-toggle');
          if (toggle) toggle.textContent = isOpen ? 'Hide details' : 'Show details';
        });
      });

      // Forecast Comments Section
      const forecastCommentsSection = document.getElementById('forecastCommentsSection');
      const forecastCommentsContainer = document.getElementById('forecastCommentsContainer');

      if (forecastCommentsSection && forecastCommentsContainer) {
        // Get forecast data for this job
        const v0Forecast = getForecastSnapshot(window.currentFinancialYear, 'v0');
        // Intentionally raw: comments are labelled by the plan where they were authored; inherited v0 comments must not be relabelled v1.
        const v1Forecast = getForecastSnapshot(window.currentFinancialYear, 'v1');

        const comments = [];

        // Collect comments from v0 and v1
        if (v0Forecast && v0Forecast.data) {
          const v0Job = v0Forecast.data.get(job.jn);
          if (v0Job?.comments) {
            Object.entries(v0Job.comments).forEach(([wg, comment]) => {
              if (comment && (!isFiltered || wg === wgFilter)) {
                comments.push({ workGroup: wg, plan: 'v0', comment });
              }
            });
          }
        }

        if (v1Forecast && v1Forecast.data) {
          const v1Job = v1Forecast.data.get(job.jn);
          if (v1Job?.comments) {
            Object.entries(v1Job.comments).forEach(([wg, comment]) => {
              if (comment && (!isFiltered || wg === wgFilter)) {
                // Check if we already have a v0 comment for this work group
                const existingIndex = comments.findIndex(c => c.workGroup === wg && c.plan === 'v0');
                if (existingIndex >= 0) {
                  // Add v1 comment to the same entry
                  comments[existingIndex].v1Comment = comment;
                } else {
                  comments.push({ workGroup: wg, plan: 'v1', comment });
                }
              }
            });
          }
        }

        if (comments.length > 0) {
          forecastCommentsSection.style.display = 'block';
          let commentsHTML = '<div class="forecast-comments-list">';

          comments.forEach(({ workGroup, plan, comment, v1Comment }) => {
            const wgDescription = window.workGroupSets?.get(workGroup) || workGroup;
            commentsHTML += `
              <div class="forecast-comment-item">
                <div class="forecast-comment-header">
                  <strong>${escapeHtml(wgDescription)}</strong>
                  ${plan === 'v0' && !v1Comment ? '<span class="plan-badge plan-v0">Plan v0</span>' : ''}
                  ${plan === 'v1' && !v1Comment ? '<span class="plan-badge plan-v1">Plan v1</span>' : ''}
                </div>`;

            if (plan === 'v0' || comment) {
              commentsHTML += `
                <div class="forecast-comment-text">
                  ${v1Comment ? '<span class="plan-label">v0:</span>' : ''}
                  ${escapeHtml(comment)}
                </div>`;
            }

            if (v1Comment) {
              commentsHTML += `
                <div class="forecast-comment-text">
                  <span class="plan-label">v1:</span> ${escapeHtml(v1Comment)}
                </div>`;
            }

            commentsHTML += '</div>';
          });

          commentsHTML += '</div>';
          forecastCommentsContainer.innerHTML = commentsHTML;
        } else {
          forecastCommentsSection.style.display = 'none';
        }
      }

      // Period summary
      const periodGrid = document.getElementById('periodGrid');
      periodGrid.innerHTML = '';
      for(let i=1; i<=13; i++) {
        const p = `P${i}`;
        const d = displayData.periods[p];
        const vc = d.v > 0 ? 'positive' : d.v < 0 ? 'negative' : 'neutral';
        periodGrid.innerHTML += `
          <div class="breakdown-item">
            <strong>Period ${i}</strong>
            <div class="breakdown-row"><span>Forecast:</span><span>${d.f.toFixed(2)}</span></div>
            <div class="breakdown-row"><span>Actual:</span><span>${d.a.toFixed(2)}</span></div>
            <div class="breakdown-row ${vc}"><span>Variance:</span><span>${d.v>0?'+':''}${d.v.toFixed(2)}</span></div>
          </div>
        `;
      }

      // Work orders
      currentWorkOrders = job.isGroupRollup
        ? getWorkOrdersForGroup(job.groupId).slice()
        : (window.wData?.get(job.jn)?.workOrders || []).slice();
      currentWorkOrderWorkGroup = wgFilter;
      const woSearch = document.getElementById('woSearch');
      const woFlagOnly = document.getElementById('woFlagOnly');
      if (woSearch) woSearch.value = '';
      if (woFlagOnly) woFlagOnly.checked = false;
      if (woSearch) woSearch.oninput = renderWorkOrders;
      if (woFlagOnly) woFlagOnly.onchange = renderWorkOrders;
      renderWorkOrders();

      // Comments section
      currentCommentJob = job.jn;
      const commentType = document.getElementById('commentType');
      const commentText = document.getElementById('commentText');
      const commentWorkGroupTag = document.getElementById('commentWorkGroupTag');
      const commentEngineerTag = document.getElementById('commentEngineerTag');
      const commentAdd = document.getElementById('commentAdd');
      if (!commentType.options.length) {
        commentType.innerHTML = COMMENT_CATEGORIES.map(category => `<option value="${category}">${category}</option>`).join('');
      }
      commentType.value = COMMENT_CATEGORIES.includes(currentReviewStage) ? currentReviewStage : 'General';

      const workGroupOptions = getWorkGroupOptions();
      if (commentWorkGroupTag) {
        commentWorkGroupTag.innerHTML = [
          '<option value="">Tag work group (optional)</option>',
          ...workGroupOptions.map(key => {
            const description = window.workGroupSets?.get(key) || key;
            const label = description === key ? key : `${key} • ${description}`;
            return `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`;
          })
        ].join('');
      }

      if (commentEngineerTag) {
        const engineers = window.getEngineers ? window.getEngineers() : [];
        commentEngineerTag.innerHTML = [
          '<option value="">Tag engineer (optional)</option>',
          ...engineers.map(eng => `<option value="${escapeHtml(eng.id)}">${escapeHtml(eng.name)}</option>`)
        ].join('');
      }

      commentText.value = '';
      commentAdd.onclick = () => {
        const taggedWorkGroup = commentWorkGroupTag?.value || '';
        const taggedEngineerId = commentEngineerTag?.value || '';
        const taggedEngineer = taggedEngineerId && window.getEngineerById
          ? window.getEngineerById(taggedEngineerId)
          : null;
        addJobComment(job.jn, commentType.value, commentText.value, {
          rootCause: '',
          correctiveAction: '',
          owner: '',
          dueDate: '',
          evidenceLinks: [],
          filteredWorkGroup: taggedWorkGroup,
          filteredEngineerId: taggedEngineer ? taggedEngineer.id : '',
          filteredEngineerName: taggedEngineer ? taggedEngineer.name : ''
        });
        commentText.value = '';
        if (commentWorkGroupTag) commentWorkGroupTag.value = '';
        if (commentEngineerTag) commentEngineerTag.value = '';
        renderCommentsTable(job.jn);
        render();
      };
      renderCommentsTable(job.jn);
      
      breakdownModal.classList.add('open');
      if (options.scrollTop && modalContent) {
        modalContent.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    function openCommentary(job) {
      showBreakdown(job);
      setTimeout(() => {
        const commentText = document.getElementById('commentText');
        if (commentText) commentText.focus();
      }, 0);
    }

    function renderCommentsTable(jobNumber) {
      const commentList = document.getElementById('commentList');
      const comments = getJobComments(jobNumber);
      if (!comments.length) {
        commentList.innerHTML = '<div class="comment-empty">No comments yet.</div>';
        return;
      }
      const cards = comments.map(entry => {
        const filteredWorkGroupCode = String(entry.filteredWorkGroup || '').trim();
        let filteredWorkGroupLabel = '';
        if (filteredWorkGroupCode) {
          const description = window.workGroupSets?.get(filteredWorkGroupCode);
          filteredWorkGroupLabel = description
            ? `${filteredWorkGroupCode} • ${description}`
            : filteredWorkGroupCode;
        }
        const filteredEngineerName = String(entry.filteredEngineerName || '').trim();
        return `
        <div class="comment-card">
          <div class="comment-card-header">
            <div class="comment-header-left">
              <span class="comment-type">${escapeHtml(entry.category)}</span>
              ${filteredWorkGroupLabel ? `<span class="comment-context-tag" title="Comment added while filtered to a work group set">WG: ${escapeHtml(filteredWorkGroupLabel)}</span>` : ''}
              ${filteredEngineerName ? `<span class="comment-context-tag" title="Comment added while filtered to an engineer">Engineer: ${escapeHtml(filteredEngineerName)}</span>` : ''}
            </div>
            <span class="comment-meta">${escapeHtml(entry.rf || entry.reviewStage || '')}${entry.rf || entry.reviewStage ? ' • ' : ''}${formatTimestamp(entry.timestamp)}</span>
          </div>
          <div class="comment-body">${escapeHtml(entry.text)}</div>
          ${(entry.rootCause || entry.correctiveAction || entry.owner || entry.dueDate) ? `
            <div class="comment-body"><strong>Root cause:</strong> ${escapeHtml(entry.rootCause || '—')}</div>
            <div class="comment-body"><strong>Corrective action:</strong> ${escapeHtml(entry.correctiveAction || '—')}</div>
            <div class="comment-body"><strong>Owner:</strong> ${escapeHtml(entry.owner || '—')} &nbsp; <strong>Due:</strong> ${escapeHtml(entry.dueDate || '—')}</div>
          ` : ''}
          ${Array.isArray(entry.evidenceLinks) && entry.evidenceLinks.length ? `
            <div class="comment-body"><strong>Evidence:</strong> ${entry.evidenceLinks.map(link => `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link)}</a>`).join('<br>')}</div>
          ` : ''}
          <div class="comment-actions">
            <button type="button" class="comment-delete" data-id="${entry.id}">Delete</button>
          </div>
        </div>
      `;
      }).join('');
      commentList.innerHTML = cards;
      commentList.querySelectorAll('.comment-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          deleteJobComment(jobNumber, btn.dataset.id);
          renderCommentsTable(jobNumber);
          render();
        });
      });
    }

    function formatTimestamp(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleString();
    }

    function toggleDisciplineSection(button) {
      const section = button.closest('.discipline-section');
      if (!section) return;
      const isCollapsed = section.classList.toggle('collapsed');
      const disc = section.dataset.discipline;
      if (disc) {
        disciplineCollapseState[disc] = isCollapsed;
        localStorage.setItem('aprDisciplineCollapseStateV1', JSON.stringify(disciplineCollapseState));
      }
      button.textContent = isCollapsed ? 'Expand' : 'Collapse';
    }


    function toggleTopSummaryCard(cardId, button) {
      const card = document.getElementById(cardId);
      if (!card) return;
      const isCollapsed = card.classList.toggle('is-collapsed');
      button.textContent = isCollapsed ? 'Expand' : 'Collapse';
    }

    function toggleBreakdownSection(targetId, button) {
      const target = document.getElementById(targetId);
      if (!target) return;
      const isCollapsed = target.classList.toggle('collapsed');
      button.textContent = isCollapsed ? 'Expand' : 'Collapse';
    }

    function closeBreakdown() {
      document.getElementById('breakdown').classList.remove('open');
    }

    function openModal() {
      updateContextControls();
      document.getElementById('modal').classList.add('open');
    }
    function closeModal() { document.getElementById('modal').classList.remove('open'); }

    function applyRagFilter(filter) {
      const select = document.getElementById('varianceFilter');
      if (!select) return;
      const nextFilter = select.value === filter ? 'all' : filter;
      select.value = nextFilter;
      render();
    }
    
    document.getElementById('modal').onclick = e => { if (e.target.id==='modal') closeModal(); };
    document.getElementById('groupModal').onclick = e => { if (e.target.id === 'groupModal') closeGroupModal(); };
    document.getElementById('topVariancesModal').onclick = e => { if (e.target.id === 'topVariancesModal') closeTopVariancesModal(); };
    // Keep breakdown open when clicking the backdrop; close via the top-right × button only.
    document.getElementById('forecastCompare').onclick = e => { if (e.target.id === 'forecastCompare') closeForecastComparison(); };

    // Health stats, legend items, and bar segments all act as filter buttons
    document.querySelectorAll('.health-stat[data-filter], .health-legend-clickable-item[data-filter], .health-bar-segment[data-filter]').forEach(el => {
      const filter = el.dataset.filter;
      if (!filter) return;
      el.addEventListener('click', () => applyRagFilter(filter));
      el.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          applyRagFilter(filter);
        }
      });
    });

    init();
    render();
  
