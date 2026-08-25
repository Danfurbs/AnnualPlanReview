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
  assert.match(css, /\.preview-grid-scroll\s*\{[^}]*overflow-x:\s*auto/s);
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
