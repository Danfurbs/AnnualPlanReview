const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const nodes = new Map(), messages = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', disabled: false, innerHTML: '', textContent: '', classList: { add() {}, remove() {} } });
    return nodes.get(id);
  };
  let snapshot = new Map(), fail = false, saves = 0;
  const window = {
    ForecastModel: require('../forecast-model'), FutureWorkImport: require('../future-work-import'), WaifForecastImport: require('../waif-forecast-import'),
    STANDARD_JOBS: [{ standardJobNo: '009144', standardJobDescription: 'Paint', discipline: 'Track' }],
    workGroupSets: new Map([['DBCANTRA', 'Carnforth'], ['DBCARTRA', 'Carlisle']]),
    resolveWorkGroupCode: v => v, normalizeJobNumber: v => String(Number(v)), getCurrentDeliveryUnitId: () => 'DU',
    getEngineersForDeliveryUnit: () => [{ id: 'engineer', workGroupSets: ['DBCANTRA'], deliveryUnitId: 'DU' }],
    getForecastSnapshotAsync: async () => ({ data: structuredClone(snapshot) }),
    saveForecastToStorageAsync: async data => { saves++; if (fail) return false; snapshot = structuredClone(data); return true; },
    Toast: { success: text => messages.push(text), error: text => messages.push(text) }
  };
  const source = fs.readFileSync('forecast-builder-preview.js', 'utf8').replace('  window.forecastBuilderPreviewContext =', `  window.uploadTest = { state, openWaifModal, reviewWaifFile, confirmWaifImport, renderWaifComparison };
  refreshPreview = async () => { state.v0ForecastsByYear[state.selectedYear] = (await window.getForecastSnapshotAsync()).data; };
  window.forecastBuilderPreviewContext =`);
  vm.runInNewContext(source, { window, document: { getElementById: node, addEventListener() {} }, localStorage: {}, console, setTimeout, Map, Set });
  const api = window.uploadTest;
  api.state.selectedYear = 'FY27'; api.state.selectedEngineerId = 'engineer'; api.state.v0ForecastsByYear.FY27 = new Map();
  return { api, node, messages, snapshot: () => snapshot, saves: () => saves, fail: value => { fail = value; } };
}
const header = 'Work Group Set Code,Std Job Number,Work Order Closed Period,Average Yearly Volume (FY25&26 Actuals)';
const file = text => ({ name: 'prediction.csv', text: async () => text });

test('WAIF upload handler reviews CSV, saves directly, and renders engineer-scoped comparison', async () => {
  const f = fixture(); f.api.openWaifModal();
  await f.api.reviewWaifFile(file(header + '\nDBCANTRA,9144,2,1.5\nDBCARTRA,9144,13,15'));
  assert.equal(f.node('forecastPreviewWaifConfirm').disabled, false);
  assert.match(f.node('forecastPreviewWaifReview').innerHTML, /FY27 V0/);
  await f.api.confirmWaifImport();
  assert.equal(f.snapshot().get('009144').wgs.DBCANTRA.P2, 1.5);
  assert.equal(f.snapshot().get('009144').wgs.DBCARTRA.P13, 15);
  const html = f.api.renderWaifComparison({ jobNumber: '9144' });
  assert.match(html, /DBCANTRA P2/); assert.doesNotMatch(html, /DBCARTRA/);
  assert.match(html, /1.5/); assert.equal(f.saves(), 1);
});

test('invalid CSV and stale financial-year context cannot save', async () => {
  const f = fixture();
  await f.api.reviewWaifFile(file(header + '\nDBCANTRA,9144,14,6'));
  assert.equal(f.node('forecastPreviewWaifConfirm').disabled, true);
  await f.api.confirmWaifImport(); assert.equal(f.saves(), 0);
  await f.api.reviewWaifFile(file(header + '\nDBCANTRA,9144,2,6'));
  f.api.state.selectedYear = 'FY28';
  await f.api.confirmWaifImport(); assert.equal(f.saves(), 0);
});

test('affected dirty drafts block import; failed save retains review and allows retry', async () => {
  const f = fixture();
  await f.api.reviewWaifFile(file(header + '\nDBCANTRA,9144,2,6'));
  f.api.state.drafts.set('FY27|engineer|9144', { dirty: true });
  await f.api.confirmWaifImport(); assert.equal(f.saves(), 0);
  assert.match(f.messages.at(-1), /unsaved edits/);
  f.api.state.drafts.clear(); f.fail(true);
  await f.api.confirmWaifImport();
  assert.equal(f.snapshot().size, 0); assert.match(f.messages.at(-1), /not saved/);
  f.fail(false); await f.api.confirmWaifImport();
  assert.equal(f.snapshot().get('009144').wgs.DBCANTRA.P2, 6);
});

test('a slower previous file cannot overwrite the latest preview', async () => {
  const f = fixture(); let finish;
  const pending = f.api.reviewWaifFile({ name: 'slow.csv', text: () => new Promise(resolve => { finish = resolve; }) });
  await f.api.reviewWaifFile(file(header + '\nDBCANTRA,9144,2,8'));
  finish(header + '\nDBCANTRA,9144,2,99'); await pending;
  await f.api.confirmWaifImport();
  assert.equal(f.snapshot().get('009144').wgs.DBCANTRA.P2, 8);
});
