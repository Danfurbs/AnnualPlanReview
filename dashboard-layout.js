/* Move existing controls, rather than duplicate them: IDs, handlers and state stay intact. */
(function () {
  'use strict';
  const page = document.getElementById('dashboardPage');
  if (!page) return;
  const $ = id => document.getElementById(id);
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  const button = (text, action) => {
    const el = make('button', 'group-action-button', text);
    el.type = 'button';
    el.addEventListener('click', action);
    return el;
  };
  const header = page.querySelector('.top-bar');
  const controls = page.querySelector('.controls');
  const groups = Array.from(controls.children);
  const context = make('div', 'dashboard-context');
  header.append(context);
  groups.slice(0, 3).forEach(group => {
    context.append(group);
    const help = group.querySelector('.helper-text');
    if (help) {
      const details = make('details', 'dashboard-field-help');
      details.append(make('summary', '', 'About this selection'), help);
      group.append(details);
    }
  });
  context.querySelector('label[for="dashboardPlanVersion"]').textContent = 'Compare against';
  context.querySelector('label[for="reportingPeriodSelect"]').textContent = 'Work Done through';
  const grid = make('div', 'dashboard-layout');
  const sidebar = make('aside', 'dashboard-sidebar');
  sidebar.id = 'dashboardSidebar';
  sidebar.setAttribute('aria-label', 'Review filters and supporting tools');
  const sidebarHead = make('div', 'dashboard-sidebar-head');
  const sectionLabel = make('strong', '', 'Review tools');
  const panels = make('div', 'dashboard-sidebar-content');
  const sections = {};
  const accordions = {};
  const summaries = {};
  let missingWorkDoneKey = null;
  [
    ['data', 'Data & uploads'], ['filters', 'Filters'],
    ['overview', 'Review overview'], ['workdone', 'Work Done activity'],
    ['comments', 'Comments & review'], ['manage', 'Manage']
  ].forEach(([key, title]) => {
    const accordion = make('details', 'dashboard-sidebar-section');
    accordion.id = 'dashboard-accordion-' + key;
    accordion.open = key === 'filters' || key === 'data';
    const heading = make('summary');
    const status = make('span', 'dashboard-section-status');
    heading.append(make('span', 'dashboard-section-title', title), status);
    accordion.append(heading);
    accordions[key] = accordion;
    summaries[key] = status;
    const panel = make('section', 'dashboard-sidebar-panel');
    panel.id = 'dashboard-section-' + key;
    panel.setAttribute('aria-label', title);
    accordion.append(panel);
    panels.append(accordion);
    sections[key] = panel;
  });
  const mobile = matchMedia('(max-width: 700px)');
  let expanded = !mobile.matches;
  const toggle = button('Filters & tools', () => setExpanded(!expanded));
  toggle.id = 'dashboardSidebarToggle';
  toggle.setAttribute('aria-controls', sidebar.id);
  const close = button('Close sidebar', () => { setExpanded(false); toggle.focus(); });
  close.classList.add('dashboard-sidebar-close');
  sidebarHead.append(sectionLabel, close);
  sidebar.append(sidebarHead, panels);
  const exportsButton = button('Exports', () => window.APRExports.open());
  exportsButton.id = 'dashboardExports';
  exportsButton.classList.add('dashboard-exports-button');
  sidebarHead.after(exportsButton);
  const main = make('main', 'dashboard-main');
  const toolbar = make('div', 'dashboard-job-toolbar');
  const searchGroup = $('search').closest('.control-group');
  searchGroup.classList.add('dashboard-search');
  $('search').placeholder = 'Search standard jobs…';
  toolbar.append(toggle, searchGroup, $('aprStartReview'));
  const meta = make('div', 'dashboard-job-meta');
  const count = make('span');
  count.id = 'dashboardMatchCount';
  count.setAttribute('role', 'status');
  const dataButton = button('Data status', () => openSection('data'));
  dataButton.id = 'dashboardDataStatus';
  const reset = button('Clear filters', () => {
    ['wgFilter', 'engineerFilter', 'groupFilter', 'reviewStatusFilter', 'varianceFilter'].forEach(id => { $(id).value = 'all'; });
    $('hideZeroVolume').checked = false;
    $('search').value = '';
    // Rebuild engineer-dependent group options using the existing application action.
    window.onEngineerFilterChange();
  });
  reset.id = 'dashboardClearFilters';
  meta.append(count, reset, $('aprReviewQueueStatus'), dataButton);
  const notice = make('p', 'dashboard-data-notice');
  notice.id = 'dashboardDataNotice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  main.append(toolbar, meta, notice, $('forecastLoadStatus'), $('retryCorrections'), $('jobs'));
  grid.append(sidebar, main);
  page.append(grid);
  groups.slice(3).forEach(group => {
    if (group === searchGroup) return;
    if (group.querySelector('[onclick="openGroupModal()"]')) sections.manage.append(group);
    else sections.filters.append(group);
  });
  controls.remove();
  sections.filters.append($('aprFilterDetails').parentElement);
  const contextBar = page.querySelector('.apr-context-bar');
  sections.data.append($('workDoneSessionStatus'), contextBar);
  sections.overview.append($('performanceSummary'), page.querySelector('.forecast-health'), $('reviewProgressCard'));
  sections.overview.querySelector('.health-header h3').textContent = 'Delivery variance';
  sections.workdone.append($('workOrderActivityCard'));
  sections.comments.append($('variancesCard'), $('commentsCard'));
  page.querySelector('.top-summary').remove();
  const actions = header.querySelector('.top-bar-actions');
  actions.prepend(toggle);
  sections.manage.append(actions.querySelector('[onclick="openBaselinePage()"]'));
  sections.data.prepend(actions.querySelector('[onclick="openModal()"]'));
  const headerStatus = make('div', 'dashboard-header-status');
  headerStatus.append($('saveStateIndicator'));
  header.querySelector('.top-bar-title > div:last-child').append(headerStatus);
  header.querySelector('.subtitle').remove();
  context.id = 'dashboardHeaderDetails';
  const compactContext = make('span', 'dashboard-compact-context');
  compactContext.hidden = true;
  header.querySelector('.top-bar-title > div:last-child').append(compactContext);
  let headerExpanded = true;
  const headerToggle = button('Collapse top bar', () => setHeaderExpanded(!headerExpanded));
  headerToggle.id = 'dashboardHeaderToggle';
  headerToggle.setAttribute('aria-controls', context.id);
  actions.append(headerToggle);
  function setHeaderExpanded(value) {
    headerExpanded = value;
    header.classList.toggle('is-collapsed', !value);
    context.hidden = !value;
    compactContext.hidden = value;
    headerToggle.textContent = value ? 'Collapse top bar' : 'Expand top bar';
    headerToggle.setAttribute('aria-expanded', String(value));
    try { localStorage.setItem('aprDashboardHeaderCollapsedV1', String(!value)); } catch {}
    measureHeader();
  }
  try { headerExpanded = localStorage.getItem('aprDashboardHeaderCollapsedV1') !== 'true'; } catch {}
  setHeaderExpanded(headerExpanded);
  // The live data summary replaces the old, repeated reporting-context paragraph.
  $('reportingContext').hidden = true;
  function setExpanded(value) {
    expanded = value;
    page.classList.toggle('dashboard-sidebar-collapsed', !value);
    toggle.setAttribute('aria-expanded', String(value));
    sidebar.hidden = !value;
  }
  function openSection(key) {
    if (!accordions[key]) return;
    accordions[key].open = true;
    setExpanded(true);
    // Scroll only the sidebar; preserve the user's position in the standard jobs.
    panels.scrollTop += accordions[key].getBoundingClientRect().top - panels.getBoundingClientRect().top;
  }
  sidebar.addEventListener('keydown', event => {
    if (event.key === 'Escape') { setExpanded(false); toggle.focus(); }
  });
  mobile.addEventListener('change', () => setExpanded(!mobile.matches));
  function measureHeader() {
    // A hidden dashboard has no height; measure again when returning from another page.
    if (header.getBoundingClientRect().height) page.style.setProperty('--dashboard-header-height', header.getBoundingClientRect().height + 'px');
  }
  new ResizeObserver(measureHeader).observe(header);
  setExpanded(expanded);
  measureHeader();
  window.APRDashboard = {
    openSection,
    update(c) {
      $('reviewStageButton').textContent = `${c.year} · ${c.stage} · ${c.deliveryUnit === 'all' ? 'All delivery units' : c.deliveryUnit}`;
      compactContext.textContent = `${$('reviewStageButton').textContent} · ${c.cutoff === null ? 'Reporting period not selected' : `Work Done through P${c.cutoff}`}`;
      const problem = c.error || (!c.file ? 'Upload Work Done for this session to see completed-period reporting.' : c.cutoff === null ? 'Select the completed reporting period to calculate projected delivery.' : '');
      if (c.error) count.textContent = 'Reporting unavailable';
      notice.textContent = problem;
      notice.hidden = !problem;
      dataButton.textContent = c.error ? 'Data unavailable' : !c.file ? 'Work Done needed' : !c.loadedAt ? 'Forecast not loaded' : 'Data details';
      dataButton.classList.toggle('dashboard-data-attention', Boolean(problem) || !c.loadedAt);
      const active = ['wgFilter', 'engineerFilter', 'groupFilter', 'reviewStatusFilter', 'varianceFilter'].filter(id => $(id).value !== 'all' && $(id).value !== '').length
        + Number($('hideZeroVolume').checked) + Number(Boolean($('search').value.trim()));
      toggle.textContent = active ? `Filters & tools (${active})` : 'Filters & tools';
      reset.hidden = !active;
      summaries.filters.textContent = active ? `${active} active` : 'All jobs';
      summaries.data.textContent = c.error ? 'Data unavailable' : !c.file ? 'Work Done needed' : 'Work Done loaded';
      // Open on first missing upload or a newly selected year, not on every render.
      // Native details preserve the user's choices while filters and data refresh.
      const missingKey = c.file ? null : c.year;
      if (missingKey && missingKey !== missingWorkDoneKey) accordions.data.open = true;
      missingWorkDoneKey = missingKey;
    },
    counts(rows) {
      const jobs = rows.filter(row => !row.group);
      summaries.overview.textContent = `${jobs.filter(row => row.reviewed).length}/${jobs.length} reviewed`;
      count.textContent = `${rows.filter(row => !row.group).length} standard jobs · ${rows.filter(row => row.group).length} groups`;
    }
  };
})();
