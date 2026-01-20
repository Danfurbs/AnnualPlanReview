    // Core data (exposed on window for forecast modules)
    window.wData = null;
    window.stdJobs = new Map();
    window.workGroupSets = new Map();
    window.currentJobsMap = new Map();

    // UI state (not in modules)
    let groupStore = [];
    let editingGroupId = null;
    let currentChart = null;
    let currentWorkOrders = [];
    let currentWorkOrderWorkGroup = 'all';
    let lastForecastRowCount = null;
    let requiresContextSelection = true;

    // Comment-related (not in modules)
    const COMMENT_CATEGORIES = ['General', 'RF3', 'RF6', 'RF9', 'RF11', 'IME'];
    const COMMENT_STORAGE_KEY = 'aprJobCommentsV2';
    const LEGACY_COMMENT_STORAGE_KEY = 'aprJobComments';
    let commentStore = {};
    let currentCommentJob = null;

    // Review tracking (not in modules)
    const REVIEW_STORAGE_KEY = 'aprReviewStatusV1';
    let reviewStore = {};

    // Work order amendments (not in modules)
    const WORK_ORDER_AMENDMENTS_KEY = 'aprWorkOrderAmendmentsV1';
    let workOrderAmendments = {};

    // Group management (not in modules)
    const GROUP_STORAGE_KEY = 'aprGroupStoreV1';

    // Breakdown plan version preference
    const BREAKDOWN_PLAN_VERSION_KEY = 'aprBreakdownPlanVersionV1';
    let breakdownPlanVersion = 'v0'; // Default to v0

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

    function handleBreakdownPlanVersionChange() {
      const select = document.getElementById('breakdownPlanVersion');
      if (!select) return;
      saveBreakdownPlanVersion(select.value);
      // Re-render the current breakdown if it's open
      if (currentCommentJob) {
        const job = window.currentJobsMap.get(currentCommentJob);
        if (job) showBreakdown(job);
      }
    }
    // Expose globally for HTML onclick handler
    window.handleBreakdownPlanVersionChange = handleBreakdownPlanVersionChange;

    function handleDashboardPlanVersionChange() {
      const select = document.getElementById('dashboardPlanVersion');
      if (!select) return;

      const newPlanVersion = select.value;
      if (!PLAN_VERSIONS.some(plan => plan.id === newPlanVersion)) return;

      // Update current plan version
      currentPlanVersion = newPlanVersion;
      localStorage.setItem(PLAN_VERSION_KEY, currentPlanVersion);

      // Reload forecast data for new plan version
      fData = null;
      const forecastCache = loadForecastFromStorage(currentFinancialYear, currentPlanVersion);
      if (forecastCache) {
        fData = forecastCache.data;
        updateWorkGroupFilterOptions();
        console.log(`✓ Switched to ${newPlanVersion}: Forecast cache restored`);
      } else {
        const libraryForecast = loadForecastFromLibrary(currentFinancialYear, currentPlanVersion);
        if (libraryForecast) {
          fData = libraryForecast.data;
          updateWorkGroupFilterOptions();
          console.log(`✓ Switched to ${newPlanVersion}: Library forecast loaded`);
        } else if (currentPlanVersion === 'v1') {
          // Try to initialize v1 from v0
          const initialized = initializeV1FromV0(currentFinancialYear);
          if (initialized) {
            fData = initialized.data;
            updateWorkGroupFilterOptions();
            console.log(`✓ Switched to ${newPlanVersion}: Initialized from v0`);
          }
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

    function loadReviewStore() {
      try {
        const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
        reviewStore = raw ? JSON.parse(raw) : {};
      } catch (err) {
        console.warn('Failed to load review store:', err);
        reviewStore = {};
      }
    }

    function saveReviewStore() {
      localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviewStore));
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

    function setReviewContext(stage, year, { persist = true } = {}) {
      if (!REVIEW_STAGES.includes(stage)) return;
      currentReviewStage = stage;
      currentFinancialYear = year || currentFinancialYear;
      currentPlanVersion = getPreferredPlanVersion(currentFinancialYear);
      requiresContextSelection = false;
      if (persist) {
        localStorage.setItem(REVIEW_STAGE_KEY, stage);
        if (currentFinancialYear) {
          localStorage.setItem(FINANCIAL_YEAR_KEY, currentFinancialYear);
        }
        if (currentPlanVersion) {
          localStorage.setItem(PLAN_VERSION_KEY, currentPlanVersion);
        }
      }
      updateReviewContextDisplay();
      updateContextControls();
      fData = null;
      const forecastCache = loadForecastFromStorage(currentFinancialYear, currentPlanVersion);
      if (forecastCache) {
        fData = forecastCache.data;
        updateWorkGroupFilterOptions();
        console.log('✓ Forecast cache restored', forecastCache.savedAt ? `(${forecastCache.savedAt})` : '');
      } else {
        const libraryForecast = loadForecastFromLibrary(currentFinancialYear, currentPlanVersion);
        if (libraryForecast) {
          fData = libraryForecast.data;
          updateWorkGroupFilterOptions();
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
        reviewStageHelper.textContent = `Current selection: ${yearLabel} ${stageLabel}.`;
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
      const statusMessage = document.getElementById('forecastStatusMessage');
      if (statusMessage) {
        if (!currentFinancialYear || !currentReviewStage) {
          statusMessage.textContent = 'Select a financial year and RF stage to load forecasts.';
        } else {
          const availability = getForecastAvailability(currentFinancialYear);
          if (!availability.v0 && !availability.v1) {
            statusMessage.textContent = `No forecast updated for ${currentFinancialYear} yet.`;
          } else {
            const label = PLAN_VERSIONS.find(plan => plan.id === currentPlanVersion)?.label || 'Plan';
            const suffix = availability.v1 && availability.v0 ? ' (v0 & v1 available)' : '';
            statusMessage.textContent = `Using ${label} forecast${suffix} (FY-wide across RF stages).`;
          }
        }
      }
      const forecastPage = document.getElementById('forecastPage');
      if (forecastPage && !forecastPage.classList.contains('is-hidden')) {
        renderForecastEditorSelectors();
      }
    }

    function normalizeJobNumberInput(value) {
      return String(value || '').trim();
    }

    function setForecastContext(stage, year, planVersion, { persist = true } = {}) {
      if (!REVIEW_STAGES.includes(stage)) return;
      if (planVersion && !PLAN_VERSIONS.some(plan => plan.id === planVersion)) return;
      currentReviewStage = stage;
      currentFinancialYear = year || currentFinancialYear;
      currentPlanVersion = planVersion || currentPlanVersion;
      requiresContextSelection = false;
      if (persist) {
        localStorage.setItem(REVIEW_STAGE_KEY, stage);
        if (currentFinancialYear) {
          localStorage.setItem(FINANCIAL_YEAR_KEY, currentFinancialYear);
        }
        if (currentPlanVersion) {
          localStorage.setItem(PLAN_VERSION_KEY, currentPlanVersion);
        }
      }
      updateReviewContextDisplay();
      updateContextControls();
      fData = null;
      const forecastCache = loadForecastFromStorage(currentFinancialYear, currentPlanVersion);
      if (forecastCache) {
        fData = forecastCache.data;
        updateWorkGroupFilterOptions();
        console.log('✓ Forecast cache restored', forecastCache.savedAt ? `(${forecastCache.savedAt})` : '');
      } else {
        const libraryForecast = loadForecastFromLibrary(currentFinancialYear, currentPlanVersion);
        if (libraryForecast) {
          fData = libraryForecast.data;
          updateWorkGroupFilterOptions();
        } else if (currentPlanVersion === 'v1') {
          const initialized = initializeV1FromV0(currentFinancialYear);
          if (initialized) {
            fData = initialized.data;
            updateWorkGroupFilterOptions();
          }
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
      const grid = document.getElementById('stageSelectionGrid');
      if (grid && !grid.childElementCount) {
        grid.innerHTML = REVIEW_STAGES
          .map(stage => `<button type="button" class="stage-button" data-stage="${stage}">${stage}</button>`)
          .join('');
        grid.querySelectorAll('[data-stage]').forEach(button => {
          button.addEventListener('click', () => {
            const selectedYear = document.getElementById('financialYearSelect')?.value || '';
            if (!selectedYear) {
              alert('Please choose a financial year.');
              return;
            }
            setReviewContext(button.dataset.stage, selectedYear);
          });
        });
      }
      modal.classList.add('open');
    }

    function closeStageModal() {
      document.getElementById('stageModal')?.classList.remove('open');
    }

    function isJobReviewed(jobNumber, stage) {
      return Boolean(reviewStore?.[jobNumber]?.[stage]);
    }

    function markJobReviewed(jobNumber, stage) {
      if (!reviewStore[jobNumber]) reviewStore[jobNumber] = {};
      reviewStore[jobNumber][stage] = {
        reviewedAt: new Date().toISOString()
      };
      saveReviewStore();
    }

    function reopenJobReview(jobNumber, stage) {
      if (!reviewStore[jobNumber]) return;
      if (!reviewStore[jobNumber][stage]) return;
      delete reviewStore[jobNumber][stage];
      if (!Object.keys(reviewStore[jobNumber]).length) {
        delete reviewStore[jobNumber];
      }
      saveReviewStore();
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

    function loadWorkOrderAmendments() {
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

    function loadGroupStore() {
      try {
        const raw = localStorage.getItem(GROUP_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        groupStore = Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.warn('Failed to load group store:', err);
        groupStore = [];
      }
    }

    function saveGroupStore() {
      localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(groupStore));
    }

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
      if (!select) return;
      const current = select.value || 'all';
      const options = [
        '<option value="all">All Standard Jobs</option>',
        ...groupStore.map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(getGroupName(group))}</option>`)
      ];
      select.innerHTML = options.join('');
      select.value = groupStore.some(group => group.id === current) ? current : 'all';
    }

    function renderGroupList() {
      const list = document.getElementById('groupList');
      if (!list) return;
      if (!groupStore.length) {
        list.innerHTML = '<p class="group-help">No groups created yet.</p>';
        return;
      }
      list.innerHTML = groupStore.map(group => `
        <div class="group-item">
          <div>
            <h4>${escapeHtml(getGroupName(group))}</h4>
            <p>${escapeHtml(group.jobNumbers.join(', '))} • Unit: ${escapeHtml(getGroupUnitLabel(group))}${group.rollUp ? ' • Roll Up' : ''}</p>
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
        const group = groupStore.find(entry => entry.id === groupId);
        if (group) {
          editingGroupId = groupId;
          document.getElementById('groupModalTitle').textContent = 'Edit Group';
          document.getElementById('groupSubmit').textContent = 'Update Group';
          document.getElementById('groupName').value = group.name || '';
          document.getElementById('groupDesc').value = group.description || '';
          document.getElementById('groupRollup').checked = Boolean(group.rollUp);
        }
      }
      renderGroupList();
      renderGroupJobTable({
        filterText: document.getElementById('groupJobSearch')?.value || '',
        selectedJobs: groupId ? groupStore.find(entry => entry.id === groupId)?.jobNumbers || [] : []
      });
      updateGroupRollupHelp();
      modal.classList.add('open');
    }

    function closeGroupModal() {
      document.getElementById('groupModal').classList.remove('open');
    }

    function deleteGroup(groupId) {
      const group = groupStore.find(entry => entry.id === groupId);
      if (!group) return;
      const confirmed = confirm(`Delete group "${getGroupName(group)}"?`);
      if (!confirmed) return;
      groupStore = groupStore.filter(entry => entry.id !== groupId);
      saveGroupStore();
      updateGroupFilterOptions();
      renderGroupList();
      render();
    }

    function handleGroupSubmit(event) {
      event.preventDefault();
      const name = document.getElementById('groupName').value.trim();
      const jobNumbers = getSelectedGroupJobNumbers();
      const description = document.getElementById('groupDesc').value.trim();
      const rollUp = document.getElementById('groupRollup').checked;
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
        rollUp
      };

      if (editingGroupId) {
        groupStore = groupStore.map(entry => (entry.id === editingGroupId ? groupPayload : entry));
      } else {
        groupStore.push(groupPayload);
      }
      saveGroupStore();
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
      saveWorkOrderAmendments();
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
      return true;
    }

    function getJobComments(jobNumber) {
      return commentStore[jobNumber] || [];
    }

    function addJobComment(jobNumber, category, value) {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (!commentStore[jobNumber]) commentStore[jobNumber] = [];
      commentStore[jobNumber].unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        category,
        text: trimmed,
        timestamp: new Date().toISOString()
      });
      saveCommentStore();
    }

    function deleteJobComment(jobNumber, id) {
      if (!commentStore[jobNumber]) return;
      commentStore[jobNumber] = commentStore[jobNumber].filter(entry => entry.id !== id);
      saveCommentStore();
    }

    function init() {
      loadCommentStore();
      loadReviewStore();
      initializeForecastContext();  // Load forecast context from localStorage
      loadWorkOrderAmendments();
      loadGroupStore();
      loadBreakdownPlanVersion();
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
        const forecastCache = loadForecastFromStorage(currentFinancialYear, currentPlanVersion);
        if (forecastCache) {
          fData = forecastCache.data;
          updateWorkGroupFilterOptions();
          console.log('✓ Forecast cache restored', forecastCache.savedAt ? `(${forecastCache.savedAt})` : '');
        } else {
          const libraryForecast = loadForecastFromLibrary(currentFinancialYear, currentPlanVersion);
          if (libraryForecast) {
            fData = libraryForecast.data;
            updateWorkGroupFilterOptions();
          }
        }
      }
      updateGroupFilterOptions();
      const groupForm = document.getElementById('groupForm');
      if (groupForm) {
        groupForm.addEventListener('submit', handleGroupSubmit);
      }
      const compareChangedOnly = document.getElementById('compareChangedOnly');
      const compareSearch = document.getElementById('compareSearch');
      if (compareChangedOnly) {
        compareChangedOnly.addEventListener('change', renderForecastComparison);
      }
      if (compareSearch) {
        compareSearch.addEventListener('input', renderForecastComparison);
      }
      const groupJobSearch = document.getElementById('groupJobSearch');
      const groupRollupInput = document.getElementById('groupRollup');
      if (groupJobSearch) {
        groupJobSearch.addEventListener('input', () => {
          renderGroupJobTable({ filterText: groupJobSearch.value });
        });
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
      const code = text.split(/\s+/)[0];
      if (window.workGroupSets.has(code)) return window.workGroupSets.get(code);
      if (window.workGroupSets.has(text)) return window.workGroupSets.get(text);
      return text;
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
      const variance = pd?.v || 0;
      const forecast = pd?.f || 0;
      const ratio = forecast ? Math.abs(variance / forecast) : (variance !== 0 ? 1 : 0);
      const status = ratio > 0.5 ? 'bad' : ratio > 0.1 ? 'warning' : 'good';
      return { status, hasVariance: variance !== 0 };
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
      [fData, window.wData].forEach(source => {
        if (!source) return;
        source.forEach(job => {
          Object.keys(job.wgs || {}).forEach(wg => {
            if (wg) names.add(wg);
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
          total += 1;
          const category = entry.category || 'General';
          counts[category] = (counts[category] || 0) + 1;
        });
      });
      return { total, counts };
    }

    function updateTopBarStats({ jobs, baseFiltered, period, getJobDisplayData, reviewStage, varianceFilter }) {
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

      const ragCounts = { red: 0, amber: 0, green: 0 };
      baseFiltered.forEach(job => {
        const displayData = getJobDisplayData(job);
        const pd = period === 'all' ? displayData.tot : displayData.periods[period];
        const { status } = getVarianceStatus(pd);
        if (status === 'bad') ragCounts.red += 1;
        else if (status === 'warning') ragCounts.amber += 1;
        else ragCounts.green += 1;
      });
      const ragRed = document.getElementById('ragRed');
      const ragAmber = document.getElementById('ragAmber');
      const ragGreen = document.getElementById('ragGreen');
      if (ragRed) ragRed.textContent = ragCounts.red;
      if (ragAmber) ragAmber.textContent = ragCounts.amber;
      if (ragGreen) ragGreen.textContent = ragCounts.green;
      document.querySelectorAll('.rag-pill').forEach(pill => {
        const filter = pill.dataset.filter;
        pill.classList.toggle('active', filter && filter === varianceFilter);
      });

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

      const varianceListEl = document.getElementById('varianceList');
      if (varianceListEl) {
        const topVariances = baseFiltered
          .map(job => {
            const displayData = getJobDisplayData(job);
            const pd = period === 'all' ? displayData.tot : displayData.periods[period];
            return { job, variance: pd.v || 0 };
          })
          .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
          .slice(0, 10);
        if (!topVariances.length) {
          varianceListEl.innerHTML = '<li class="variance-item"><span class="variance-desc">No variances to display.</span></li>';
        } else {
          varianceListEl.innerHTML = topVariances.map(({ job, variance }) => {
            const valueClass = variance > 0 ? 'positive' : variance < 0 ? 'negative' : 'neutral';
            return `
              <li class="variance-item" onclick="showBreakdownByJobNumber('${escapeHtml(job.jn)}')">
                <div class="variance-job">
                  <strong>${escapeHtml(job.jn)}</strong>
                  <span class="variance-desc">${escapeHtml(job.desc)}</span>
                </div>
                <div class="variance-value ${valueClass}">${variance > 0 ? '+' : ''}${variance.toFixed(1)}</div>
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
      const options = getWorkGroupOptions();
      const optionHtml = [
        '<option value="all">All Work Group Sets</option>',
        ...options.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
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
        console.log('Forecast:', rows.length, 'rows');
        console.log('Columns:', Object.keys(rows[0]||{}));
        
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
        rows.forEach(r => {
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
        saveForecastToStorage(fData, rows.length, selectedYear, selectedPlan);
        setReviewContext(currentReviewStage, selectedYear);
        closeModal();
      } catch(err) {
        console.error(err);
        alert('Error loading forecast');
      }
    }

    async function loadWorkDone(e) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab);
        if (!wb.Sheets['Detail']) {
          alert('Need "Detail" sheet');
          return;
        }
        const row = parseInt(document.getElementById('wRow').value) - 1;
        const rows = XLSX.utils.sheet_to_json(wb.Sheets['Detail'], {range:row});
        console.log('Work done:', rows.length, 'rows');
        console.log('Columns:', Object.keys(rows[0]||{}));
        
        window.wData = new Map();
        let matched = 0;
        let sampleUnmatched = [];
        
        rows.forEach(r => {
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
        
        console.log('Sample work done rows:');
        sampleUnmatched.forEach(s => {
          console.log('  Job:', s.raw, '→', s.extracted);
          console.log('  Period:', s.periodRaw, '→', s.periodNormalized, 'Units:', s.units);
        });
        console.log('✓ Matched:', matched, 'of', rows.length);
        updateWorkGroupFilterOptions();
        render();
        closeModal();
      } catch(err) {
        console.error(err);
        alert('Error loading work done');
      }
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
          if (!jn || jn === '000000' || !text) return;
          if (!commentStore[jn]) commentStore[jn] = [];
          commentStore[jn].unshift({
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            category,
            text,
            timestamp: new Date().toISOString()
          });
          added += 1;
        });
        saveCommentStore();
        if (currentCommentJob) {
          renderCommentsTable(currentCommentJob);
        }
        alert(`Imported ${added} comments.`);
      } catch (err) {
        console.error(err);
        alert('Error loading comments');
      } finally {
        e.target.value = '';
      }
    }

    function exportComments() {
      const rows = [];
      Object.entries(commentStore).forEach(([jobNumber, comments]) => {
        comments.forEach(entry => {
          rows.push({
            'Standard Job Number': jobNumber,
            'Comment Type': entry.category,
            'Comment': entry.text
          });
        });
      });
      if (!rows.length) {
        alert('No comments to export.');
        return;
      }
      const ws = XLSX.utils.json_to_sheet(rows, {
        header: ['Standard Job Number', 'Comment Type', 'Comment']
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Comments');
      XLSX.writeFile(wb, 'apr-comments.xlsx');
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
        tot: { f: 0, a: 0, v: 0 },
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
            const data = job.periods[p] || { f: 0, a: 0, v: 0 };
            acc.f += data.f || 0;
            acc.a += data.a || 0;
            acc.v += data.v || 0;
            return acc;
          },
          { f: 0, a: 0, v: 0 }
        );
        rollup.periods[p] = periodTotals;
        rollup.tot.f += periodTotals.f;
        rollup.tot.a += periodTotals.a;
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
              const data = job.wgs?.[wg]?.periods?.[p] || { f: 0, a: 0, v: 0 };
              acc.f += data.f || 0;
              acc.a += data.a || 0;
              acc.v += data.v || 0;
              return acc;
            },
            { f: 0, a: 0, v: 0 }
          );
          rollup.wgs[wg].periods[p] = totals;
        }
      });
      return rollup;
    }

    function getWorkOrdersForGroup(groupId) {
      if (!groupId) return [];
      const group = groupStore.find(entry => entry.id === groupId);
      if (!group) return [];
      return group.jobNumbers.flatMap(jobNumber => window.wData?.get(jobNumber)?.workOrders || []);
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

      const baseFiltered = enriched.filter(order => (
        currentWorkOrderWorkGroup === 'all' || order.workGroup === currentWorkOrderWorkGroup
      ));

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
        return `
          <tr class="${rowClass}">
            <td><strong>${escapeHtml(order.number || 'Unknown')}</strong></td>
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
      const viewMode = document.getElementById('viewMode')?.value || 'actual';
      const cutoffValue = document.getElementById('forecastCutoff')?.value || 'auto';
      const varianceFilter = document.getElementById('varianceFilter')?.value || 'all';
      const maxWorkDonePeriod = (() => {
        if (viewMode !== 'forecast') return 0;
        if (cutoffValue === 'auto') return getMaxWorkDonePeriod();
        const numeric = parseInt(String(cutoffValue).replace(/[^0-9]/g, ''), 10);
        return Number.isNaN(numeric) ? 0 : numeric;
      })();
      const all = new Set([...(fData?.keys()||[]), ...(window.wData?.keys()||[])]);
      const baseJobs = [];
      all.forEach(jn => {
        // Get metadata from standard jobs if available
        const meta = window.stdJobs.get(jn);
        const f = fData?.get(jn);
        const a = window.wData?.get(jn);
        
        const job = {
          jn, 
          disc: meta?.disc || 'Unknown', 
          desc: meta?.desc || `Job ${jn}`, 
          unit: meta?.unit || 'Unit not specified',
          periods:{}, 
          tot:{f:0,a:0,v:0},
          wgs: {}
        };
        for(let i=1; i<=13; i++) {
          const p = `P${i}`;
          const fv = f?.periods[p]||0;
          const avRaw = a?.periods[p]||0;
          const useForecast = viewMode === 'forecast' && i > maxWorkDonePeriod;
          const av = useForecast ? fv : avRaw;
          job.periods[p] = {f:fv, a:av, v:av-fv};
          job.tot.f += fv;
          job.tot.a += av;
          job.tot.v += av-fv;
        }

        const wgNames = new Set([
          ...Object.keys(f?.wgs || {}),
          ...Object.keys(a?.wgs || {})
        ]);
        wgNames.forEach(wg => {
          job.wgs[wg] = {periods: {}};
          for(let i=1; i<=13; i++) {
            const p = `P${i}`;
            const fv = f?.wgs?.[wg]?.[p] || 0;
            const avRaw = a?.wgs?.[wg]?.[p] || 0;
            const useForecast = viewMode === 'forecast' && i > maxWorkDonePeriod;
            const av = useForecast ? fv : avRaw;
            job.wgs[wg].periods[p] = {f: fv, a: av, v: av - fv};
          }
        });
        baseJobs.push(job);
      });
      const groupFilter = document.getElementById('groupFilter')?.value || 'all';
      const activeGroup = groupStore.find(group => group.id === groupFilter);

      const search = document.getElementById('search')?.value.toLowerCase() || '';
      const period = document.getElementById('period')?.value || 'all';
      const wgFilter = document.getElementById('wgFilter')?.value || 'all';
      const reviewStage = currentReviewStage;
      const getJobDisplayData = (job) => {
        if (wgFilter === 'all') {
          return { periods: job.periods, tot: job.tot };
        }
        const wgData = job.wgs?.[wgFilter];
        const periods = {};
        const totals = { f: 0, a: 0, v: 0 };
        for (let i = 1; i <= 13; i++) {
          const p = `P${i}`;
          const data = wgData?.periods?.[p] || { f: 0, a: 0, v: 0 };
          periods[p] = data;
          totals.f += data.f || 0;
          totals.a += data.a || 0;
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

      const filterBySearch = (job) => {
        const matchesSearch = !search || job.jn.includes(search) || job.desc.toLowerCase().includes(search) || job.disc.toLowerCase().includes(search);
        if (!matchesSearch) return false;
        if (wgFilter === 'all') return true;
        const wgData = job.wgs[wgFilter];
        if (!wgData) return false;
        return Object.values(wgData.periods || {}).some(periodData => periodData.f !== 0 || periodData.a !== 0);
      };

      const baseFiltered = baseJobs.filter(job => filterByGroup(job) && filterBySearch(job));
      const rollupJobs = groupStore
        .filter(group => group.rollUp)
        .map(group => buildGroupRollupJob(group, baseJobs))
        .filter(Boolean);
      const rollupFiltered = rollupJobs.filter(job => filterByGroup(job) && filterBySearch(job));

      const applyVarianceFilter = (job) => {
        const displayData = getJobDisplayData(job);
        const pd = period === 'all' ? displayData.tot : displayData.periods[period];
        const { status, hasVariance } = getVarianceStatus(pd);
        if (varianceFilter === 'all') return true;
        if (varianceFilter === 'variance') return hasVariance;
        return status === varianceFilter;
      };

      const filtered = [...baseFiltered.filter(applyVarianceFilter), ...rollupFiltered.filter(applyVarianceFilter)];
      
      filtered.sort((a,b) => {
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
      cont.innerHTML = '';
      window.currentJobsMap = new Map([...baseFiltered, ...rollupFiltered].map(job => [job.jn, job]));
      updateTopBarStats({ jobs: baseJobs, baseFiltered, period, getJobDisplayData, reviewStage, varianceFilter });

      Object.keys(byDisc).sort().forEach(disc => {
        const sec = document.createElement('div');
        sec.className = 'discipline-section';
        sec.innerHTML = `
          <div class="discipline-header">
            <h2>${disc}</h2>
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
          const isReviewed = !isGroupRollup && isJobReviewed(j.jn, reviewStage);
          const statusLabel = isGroupRollup ? 'Group Rollup' : (isReviewed ? 'Reviewed' : 'Needs Review');
          const statusClass = isGroupRollup ? 'group-rollup' : (isReviewed ? 'reviewed' : 'needs-review');
          const commentCount = isGroupRollup ? 0 : getJobComments(j.jn).length;
          const varianceValue = `${pd.v > 0 ? '+' : ''}${pd.v.toFixed(1)}`;
          const alertTitle = stat === 'bad'
            ? 'Significant variance detected'
            : stat === 'warning'
              ? 'Variance requires review'
              : isReviewed
                ? 'Commentary complete'
                : isGroupRollup
                  ? 'Aggregated group totals'
                  : 'On track';
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
          
          const card = document.createElement('div');
          card.className = `job-card ${stat}`;
          card.onclick = () => showBreakdown(j);
          
          card.innerHTML = `
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
                <div class="job-card-subtitle">${escapeHtml(subtitleText)}</div>
                <div class="job-alert ${stat}">
                  <span>${alertTitle}</span>
                  <span>${alertDetail}</span>
                </div>
              </div>
              <div class="job-metrics">
                <div class="metric-card">
                  <div class="metric-label">Planned</div>
                  <div class="metric-value">${pd.f.toFixed(1)}</div>
                </div>
                <div class="metric-card">
                  <div class="metric-label">Actual</div>
                  <div class="metric-value">${pd.a.toFixed(1)}</div>
                </div>
                <div class="metric-card">
                  <div class="metric-label">Variance</div>
                  <div class="metric-value ${vc}">${pd.v > 0 ? '+' : ''}${pd.v.toFixed(1)}</div>
                </div>
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
                render();
              }
              if (action === 'reopen' && isReviewed) {
                reopenJobReview(j.jn, reviewStage);
                render();
              }
            });
          });
          
          grid.appendChild(card);
        });
        
        sec.appendChild(grid);
        cont.appendChild(sec);
      });
      updateForecastCutoffVisibility(viewMode);
      updateModalModeNotes(viewMode, maxWorkDonePeriod, cutoffValue);
    }

    function updateForecastCutoffVisibility(viewMode) {
      const cutoffGroup = document.getElementById('forecastCutoffGroup');
      if (!cutoffGroup) return;
      cutoffGroup.style.display = viewMode === 'forecast' ? 'flex' : 'none';
    }

    function updateModalModeNotes(viewMode, maxWorkDonePeriod, cutoffValue) {
      const isForecast = viewMode === 'forecast';
      const cutoffLabel = cutoffValue === 'auto' ? 'Auto' : 'Selected';
      const periodLabel = maxWorkDonePeriod > 0 ? `Period ${maxWorkDonePeriod}` : 'Period N/A';
      const message = isForecast
        ? `Units derived from Work Done up to ${periodLabel} (${cutoffLabel}) then Forecast for remaining. Forecasts are managed in the Forecast Builder.`
        : 'Units derived from Work Done only.';
      const uploadNote = document.getElementById('uploadModeNote');
      const breakdownNote = document.getElementById('breakdownModeNote');
      if (uploadNote) uploadNote.textContent = message;
      if (breakdownNote) breakdownNote.textContent = message;
    }

    function getForecastTotal(jobData) {
      if (!jobData || !jobData.periods) return 0;
      return Object.values(jobData.periods).reduce((sum, value) => sum + (Number(value) || 0), 0);
    }

    function getForecastPeriodsForJob(jobNumber, wgFilter, planVersion) {
      const snapshot = getForecastSnapshot(currentFinancialYear, planVersion);
      if (!snapshot) return null;
      const jobData = snapshot.data.get(jobNumber);
      if (!jobData) return null;
      if (!wgFilter || wgFilter === 'all') return jobData.periods || {};
      return jobData.wgs?.[wgFilter] || null;
    }

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
      const v1Snapshot = getForecastSnapshot(currentFinancialYear, 'v1');
      if (!v0Snapshot || !v1Snapshot) {
        table.innerHTML = '<thead><tr><th>Forecast comparison</th></tr></thead><tbody><tr><td class="wo-empty">Both Plan v0 and Plan v1 forecasts must be available in the library or local cache to compare.</td></tr></tbody>';
        if (meta) {
          meta.textContent = `Missing data for ${currentFinancialYear} ${currentReviewStage}.`;
        }
        return;
      }
      const allJobs = new Set([...(v0Snapshot.data.keys()), ...(v1Snapshot.data.keys())]);
      const rows = [];
      allJobs.forEach(jobNumber => {
        const v0 = getForecastTotal(v0Snapshot.data.get(jobNumber));
        const v1 = getForecastTotal(v1Snapshot.data.get(jobNumber));
        const delta = v1 - v0;
        const desc = window.stdJobs.get(jobNumber)?.desc || `Job ${jobNumber}`;
        if (changedOnly && delta === 0) return;
        if (search && !`${jobNumber} ${desc}`.toLowerCase().includes(search)) return;
        rows.push({ jobNumber, desc, v0, v1, delta });
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
              return `
                <tr>
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
        meta.textContent = `${currentFinancialYear} ${currentReviewStage} • Plan v0 (${v0Snapshot.source}) vs Plan v1 (${v1Snapshot.source}) • ${rows.length} jobs`;
      }
    }

    function showBreakdown(job, options = {}) {
      const wgFilter = document.getElementById('wgFilter')?.value || 'all';
      const period = document.getElementById('period')?.value || 'all';
      const wgLabel = wgFilter === 'all' ? '' : ` • ${wgFilter}`;
      const breakdownModal = document.getElementById('breakdown');
      const modalContent = breakdownModal?.querySelector('.modal-content');
      document.getElementById('bdTitle').textContent = `${job.jn} - Breakdown`;
      document.getElementById('bdMeta').textContent = `${job.desc} • ${job.disc} • ${job.unit}${wgLabel}`;
      const displayData = (() => {
        if (wgFilter === 'all') {
          return { periods: job.periods, tot: job.tot };
        }
        const wgData = job.wgs?.[wgFilter];
        const periods = {};
        const totals = { f: 0, a: 0, v: 0 };
        for (let i = 1; i <= 13; i++) {
          const p = `P${i}`;
          const data = wgData?.periods?.[p] || { f: 0, a: 0, v: 0 };
          periods[p] = data;
          totals.f += data.f || 0;
          totals.a += data.a || 0;
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

      // Build cumulative data
      const periods = [];
      let cumA = 0;
      let cumV0 = 0, cumV1 = 0;
      const cumActual = [];
      const cumPlanV0 = [], cumPlanV1 = [];
      const v0Periods = getForecastPeriodsForJob(job.jn, wgFilter, 'v0');
      const v1Periods = getForecastPeriodsForJob(job.jn, wgFilter, 'v1');
      
      for(let i=1; i<=13; i++) {
        const p = `P${i}`;
        periods.push(`Period ${i}`);
        cumA += displayData.periods[p].a;
        cumActual.push(cumA);
        if (v0Periods) {
          cumV0 += v0Periods[p] || 0;
          cumPlanV0.push(cumV0);
        }
        if (v1Periods) {
          cumV1 += v1Periods[p] || 0;
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
          label: 'Planned v0 (Cumulative)',
          data: cumPlanV0,
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96, 165, 250, 0.12)',
          tension: 0.3,
          fill: true
        });
      }
      if (showV1 && v1Periods) {
        datasets.push({
          label: 'Planned v1 (Cumulative)',
          data: cumPlanV1,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.12)',
          tension: 0.3,
          fill: true
        });
      }
      datasets.push({
        label: 'Actual (Cumulative)',
        data: cumActual,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.3,
        fill: true
      });

      currentChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: periods,
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}`
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
      let tableHTML = '<thead><tr><th>Work Group</th>';
      for(let i=1; i<=13; i++) tableHTML += `<th>P${i}</th>`;
      tableHTML += '<th>Total</th></tr></thead><tbody>';
      
      const isFiltered = wgFilter !== 'all';
      const wgEntries = Object.entries(job.wgs || {}).filter(([wg]) => !isFiltered || wg === wgFilter);
      if (wgEntries.length === 0) {
        tableHTML += '<tr><td colspan="15"><em>No work group data available.</em></td></tr>';
      } else {
        wgEntries.forEach(([wg, data], idx) => {
          let rowTotal = 0;
          const summaryOpen = isFiltered;
          tableHTML += `<tr class="wg-summary${summaryOpen ? ' is-open' : ''}" data-wg="${idx}"><td><strong>${wg} <span class="wg-toggle">${summaryOpen ? 'Hide details' : 'Show details'}</span></strong></td>`;
          for(let i=1; i<=13; i++) {
            const p = `P${i}`;
            const d = data.periods[p] || {v: 0};
            const v = d.v || 0;
            rowTotal += v;
            const cl = v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral';
            tableHTML += `<td class="${cl}">${v > 0 ? '+' : ''}${v.toFixed(1)}</td>`;
          }
          const tcl = rowTotal > 0 ? 'positive' : rowTotal < 0 ? 'negative' : 'neutral';
          tableHTML += `<td class="${tcl}"><strong>${rowTotal > 0 ? '+' : ''}${rowTotal.toFixed(1)}</strong></td></tr>`;

          const detailRows = [
            { label: 'Planned', key: 'f' },
            { label: 'Actual', key: 'a' },
            { label: 'Variance', key: 'v' }
          ];
          detailRows.forEach(({ label, key }) => {
            let detailTotal = 0;
            tableHTML += `<tr class="wg-detail${summaryOpen ? ' open' : ''}" data-wg="${idx}"><td>${label}</td>`;
            for(let i=1; i<=13; i++) {
              const p = `P${i}`;
              const d = data.periods[p] || {f: 0, a: 0, v: 0};
              const val = d[key] || 0;
              detailTotal += val;
              const cl = key === 'v' ? (val > 0 ? 'positive' : val < 0 ? 'negative' : 'neutral') : '';
              tableHTML += `<td class="${cl}">${key === 'v' && val > 0 ? '+' : ''}${val.toFixed(1)}</td>`;
            }
            const tcl = key === 'v' ? (detailTotal > 0 ? 'positive' : detailTotal < 0 ? 'negative' : 'neutral') : '';
            tableHTML += `<td class="${tcl}"><strong>${key === 'v' && detailTotal > 0 ? '+' : ''}${detailTotal.toFixed(1)}</strong></td></tr>`;
          });
        });
      }
      tableHTML += '</tbody>';
      wgTable.innerHTML = tableHTML;

      wgTable.querySelectorAll('.wg-summary').forEach(row => {
        row.addEventListener('click', () => {
          const key = row.dataset.wg;
          const details = wgTable.querySelectorAll(`.wg-detail[data-wg="${key}"]`);
          const isOpen = row.classList.toggle('is-open');
          details.forEach(detail => detail.classList.toggle('open', isOpen));
          const toggle = row.querySelector('.wg-toggle');
          if (toggle) toggle.textContent = isOpen ? 'Hide details' : 'Show details';
        });
      });
      
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
      const commentAdd = document.getElementById('commentAdd');
      if (!commentType.options.length) {
        commentType.innerHTML = COMMENT_CATEGORIES.map(category => `<option value="${category}">${category}</option>`).join('');
      }
      commentText.value = '';
      commentAdd.onclick = () => {
        addJobComment(job.jn, commentType.value, commentText.value);
        commentText.value = '';
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
      const cards = comments.map(entry => `
        <div class="comment-card">
          <div class="comment-card-header">
            <span class="comment-type">${escapeHtml(entry.category)}</span>
            <span class="comment-meta">${formatTimestamp(entry.timestamp)}</span>
          </div>
          <div class="comment-body">${escapeHtml(entry.text)}</div>
          <div class="comment-actions">
            <button type="button" class="comment-delete" data-id="${entry.id}">Delete</button>
          </div>
        </div>
      `).join('');
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
    document.getElementById('breakdown').onclick = e => { if (e.target.id==='breakdown') closeBreakdown(); };
    document.getElementById('forecastCompare').onclick = e => { if (e.target.id === 'forecastCompare') closeForecastComparison(); };

    document.querySelectorAll('.rag-pill').forEach(pill => {
      const filter = pill.dataset.filter;
      if (!filter) return;
      pill.addEventListener('click', () => applyRagFilter(filter));
      pill.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          applyRagFilter(filter);
        }
      });
    });

    init();
    render();
  
