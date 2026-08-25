const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadPreviewContext() {
  const engineers = [
    { id: 'du-a-1', name: 'A One', deliveryUnitId: 'du-a' },
    { id: 'du-a-2', name: 'A Two', deliveryUnitId: 'du-a' },
    { id: 'du-b-1', name: 'B One', deliveryUnitId: 'du-b' }
  ];
  let deliveryUnit = 'du-a';
  const document = {
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; }
  };
  const window = {
    getCurrentDeliveryUnitId: () => deliveryUnit,
    getEngineersForDeliveryUnit: id => engineers.filter(engineer => engineer.deliveryUnitId === id),
    normalizeJobNumber: value => String(Number(value)),
    STANDARD_JOBS: [
      { discipline: 'Track', standardJobNo: '010', standardJobDescription: 'Ten' },
      { discipline: 'Track', standardJobNo: '2', standardJobDescription: 'Two' },
      { discipline: 'Assets', standardJobNo: '100', standardJobDescription: 'Hundred' },
      { discipline: '', standardJobNo: 'ABC', standardJobDescription: 'Non numeric' }
    ]
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8'), {
    window, document, localStorage: {}, console, setTimeout
  });
  return { context: window.forecastBuilderPreviewContext, setDeliveryUnit: id => { deliveryUnit = id; } };
}

test('preview engineer scope follows only the selected Delivery Unit', () => {
  const fixture = loadPreviewContext();
  assert.deepEqual(Array.from(fixture.context.getScopedEngineers(), engineer => engineer.id), ['du-a-1', 'du-a-2']);
  fixture.setDeliveryUnit('du-b');
  assert.deepEqual(Array.from(fixture.context.getScopedEngineers(), engineer => engineer.id), ['du-b-1']);
});

test('preview requires a concrete Delivery Unit rather than treating all as a global queue', () => {
  const fixture = loadPreviewContext();
  fixture.setDeliveryUnit('all');
  assert.deepEqual(Array.from(fixture.context.getScopedEngineers()), []);
  fixture.setDeliveryUnit('');
  assert.deepEqual(Array.from(fixture.context.getScopedEngineers()), []);
});

test('all preview engineer operations use the central scoped helper', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  assert.doesNotMatch(source, /window\.getEngineers\s*\?/);
  assert.match(source, /function navigateEngineer[\s\S]*?ensureSelectedEngineer\(\)/);
  assert.match(source, /function rebuildJobCache[\s\S]*?getScopedEngineers\(\)\.forEach/);
});

test('tablet engineer list is a contained, single-row horizontal scroller', () => {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const responsive = css.slice(css.indexOf('@media (max-width: 900px)'));
  assert.match(responsive, /\.preview-engineer-list\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*hidden/s);
  assert.match(responsive, /\.preview-engineer-item\s*\{[^}]*flex:\s*0 0 220px/s);
});

test('jobs group by canonical discipline with deterministic headings and numeric order', () => {
  const { context } = loadPreviewContext();
  const groups = context.groupJobs([{ jobNumber: '010' }, { jobNumber: '2' }, { jobNumber: '100' }, { jobNumber: 'ABC' }]);
  assert.deepEqual(Array.from(groups, group => group.discipline), ['Assets', 'Other / Unclassified', 'Track']);
  assert.deepEqual(Array.from(groups[2].jobs, job => job.jobNumber), ['2', '010']);
});

test('padded identities are compared numerically without rewriting the rendered identity', () => {
  const { context } = loadPreviewContext();
  const jobs = [{ jobNumber: '010' }, { jobNumber: '10' }, { jobNumber: '2' }].sort(context.compareJobs);
  assert.deepEqual(Array.from(jobs, job => job.jobNumber), ['2', '010', '10']);
});

test('Phase 3 CSS contains padded modal and contained grid scrolling', () => {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(css, /\.preview-modal-body\s*\{[^}]*padding:/s);
  assert.match(css, /\.preview-add-job-modal \.modal-actions\s*\{[^}]*gap:[^}]*padding:/s);
  assert.match(css, /\.preview-grid-scroll\s*\{[^}]*overflow-x:\s*(?:auto|scroll)/s);
});

test('Phase 3 retains stored job identity and wires manual job removal', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  assert.match(source, /storageJobNumber:\s*storedEntry\.key/);
  assert.match(source, /saveForecastJobToStorageAsync\?\.\(storageJobNumber/);
  assert.match(source, /removeJob\s*=\s*e\.target\.closest\('\[data-remove-job\]'\)/);
  assert.match(source, /else if \(removeJob\) await removeStandardJob/);
});

test('Phase 3 listboxes support arrow selection and V0 rows support safe multi-value paste', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  assert.match(source, /function handleListboxKeyboard/);
  assert.match(source, /event\.key === 'ArrowDown'/);
  assert.match(source, /function handlePeriodPaste/);
  assert.match(source, /values\.some\(value => !Number\.isFinite\(Number\(value\)\) \|\| Number\(value\) < 0\)/);
});

test('expanded grid exposes a visible contained horizontal scrollbar and per-WGS comments', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(source, /preview-grid-scroll" tabindex="0" aria-label="Work Group Set periods; scroll horizontally/);
  assert.match(source, /<th>Comment<\/th>/);
  assert.match(source, /data-comment-wgs=/);
  assert.match(css, /\.preview-grid-scroll\s*\{[^}]*overflow-x:\s*scroll[^}]*scrollbar-gutter:\s*stable/s);
  assert.match(css, /\.preview-grid-scroll::\-webkit-scrollbar\s*\{[^}]*height:\s*14px/s);
});

test('non-interactive card space expands while controls and grid interactions remain isolated', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  assert.match(source, /data-expand-card=/);
  assert.match(source, /function toggleExpandedJob/);
  assert.match(source, /!e\.target\.closest\('button, input, textarea, select, a, \.preview-job-expanded'\)/);
});

test('metadata updates rebuild only the active engineer queue and cell blur does not rerender every job', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  assert.match(source, /function rebuildEngineerJobCache/);
  assert.match(source, /async function toggleForecasted[\s\S]*?rebuildEngineerJobCache\(\)/);
  assert.match(source, /async function addStandardJob[\s\S]*?manuallyAdded: true[\s\S]*?rebuildEngineerJobCache\(\)/);
  assert.doesNotMatch(source, /addEventListener\('change',\s*\(\)\s*=>\s*renderJobList/);
});

test('Phase 4 Planning Context is per WGS, lazy in the UI, and copy actions only dirty the draft', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  assert.match(source, /function renderPlanningContext/);
  assert.match(source, /data-context-wgs=/);
  assert.match(source, /state\.contextExpanded\.has/);
  assert.match(source, /function copyHistoricalProfile/);
  assert.match(source, /row\.comment = button\.dataset\.copyContext === 'forecast'/);
  assert.match(source, /draft\.dirty = true; renderJobList\(\)/);
  assert.doesNotMatch(source, /function copyHistoricalProfile[\s\S]*?saveForecastJobToStorageAsync/);
});

test('Phase 4 context labels Work Done coverage and historical comment scope/source', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  assert.match(source, /\$\{escapeHtml\(context\.coverage\.label\)\}/);
  assert.match(source, /const allComments =/);
  assert.match(source, /<details class="preview-history-comments">/);
  assert.match(source, /comment\.filteredEngineerId/);
  assert.match(source, /commentMatchesOrganisationScope/);
});

test('Planning Context renders outside the period table without forcing horizontal scroll', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(source, /<\/tbody><\/table><\/div>\$\{rows\.filter/);
  assert.doesNotMatch(source, /preview-context-row/);
  assert.match(css, /\.preview-planning-context \{[^}]*width: 100%;[^}]*min-width: 0;[^}]*overflow: hidden;/s);
  assert.match(css, /\.preview-history-list \{[^}]*auto-fit[^}]*minmax\(min\(100%, 260px\), 1fr\)/s);
  assert.doesNotMatch(css, /\.preview-planning-context \{[^}]*min-width: 900px/);
});

test('older Planning Context loads lazily one FY at a time with stale-response protection', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  assert.match(source, /async function ensurePlanningHistoryLoaded/);
  assert.match(source, /for \(const year of olderYears\)/);
  assert.match(source, /Promise\.all\(\[\s*window\.getForecastSnapshotAsync\(year, 'v0'\), window\.getForecastSnapshotAsync\(year, 'v1'\), loadWorkDone\(year\)/s);
  assert.match(source, /if \(!requestIsCurrent\(requestId, requestedYear\)\) return false/);
});

test('Phase 5 profile uses live draft V0, blended history, transitions, and show-all history', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  assert.match(source, /function profileSeries/);
  assert.match(source, /V0 · \$\{series\.workGroup\} \(current draft\)/);
  assert.match(source, /window\.copyPlanningProfile\(context, 'work-done'\)/);
  assert.match(source, /Work Done ends after P\$\{item\.coverage\.lastPeriod\} → forecast begins/);
  assert.match(source, /segment: \{ borderDash:/);
  assert.match(source, /function updateCurrentProfileChart/);
  assert.match(source, /updateCurrentProfileChart\(e\.target\.dataset\.gridJob\)/);
  assert.match(source, /function toggleAllHistory/);
});

test('profile renders below inputs and switches left or right between Work Group Sets', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  assert.match(source, /\$\{renderGrid\(job\)\}\$\{renderProfile\(job\.jobNumber\)\}/);
  assert.match(source, /data-profile-step="-1"/);
  assert.match(source, /data-profile-step="1"/);
  assert.match(source, /function switchProfileWorkGroup/);
  assert.match(source, /const current = Object\.fromEntries\(PERIODS\.map\(period => \[period, Number\(row\?\.periods\[period\]\) \|\| 0\]\)\)/);
});

test('temporary lightweight Work Done import remains in memory and never calls persistence APIs', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="forecastPreviewEvidenceYear"/);
  assert.match(html, /Work Done source FY/);
  assert.match(html, /keep several years loaded together/);
  assert.match(html, /id="forecastPreviewEvidenceHeaderRow"[^>]*value="2"/);
  assert.match(html, /same Work Done report used by the main-page upload/);
  assert.match(html, /nothing is uploaded or saved/i);
  assert.match(source, /async function loadTemporaryWorkDone/);
  assert.match(source, /function syncEvidenceYearOptions/);
  assert.match(source, /const sourceYears = \[state\.selectedYear, \.\.\.window\.getPlanningHistoryYears\(state\.selectedYear\)\]/);
  assert.match(source, /index === 0 \? 'current FY' : 'historical'/);
  assert.doesNotMatch(source, /forecastPreviewEvidenceYear'\)\.innerHTML = years\.map/);
  assert.match(source, /workbook\.Sheets\.Detail/);
  assert.match(source, /sheet_to_json\(sheet, \{ range: headerRow - 1, defval: '' \}\)/);
  assert.match(source, /Standard Job Number & Desc/);
  assert.match(source, /Work Order Closed Period/);
  assert.match(source, /Work Group Set Description/);
  assert.match(source, /state\.workDoneByYear\[year\] = aggregated/);
  assert.match(source, /temporaryEvidenceByYear: new Map/);
  assert.match(source, /state\.temporaryEvidenceByYear\.set\(year/);
  assert.match(html, /Remove selected year/);
  assert.match(source, /renderTemporaryEvidenceStatus/);
  assert.doesNotMatch(source, /loadTemporaryWorkDone[\s\S]*?saveWorkDoneToApi/);
});
