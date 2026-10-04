const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createWorkDoneSession } = require('../work-done-session');

function uploadHarness() {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const functions = source.slice(source.indexOf('    async function loadWorkDone(file)'), source.indexOf('    async function uploadSelectedWorkDoneFile'));
  const loader = source.slice(source.indexOf('    async function loadWorkDoneStoreAsync'), source.indexOf('    function getSelectedWorkDoneYear'));
  const session = createWorkDoneSession();
  const state = { selected: 'FY27', rows: [], statuses: [], corrections: { '123456-WO1-1': { units: 9 } } };
  const context = vm.createContext({ Map, window: { WorkDoneSession: session, stdJobs: new Map() },
    console: { error() {} }, Number, Date,
    document: { getElementById: () => ({ value: '2' }) },
    XLSX: { read: () => ({ Sheets: { Detail: {} } }), utils: { sheet_to_json: () => state.rows } },
    getSelectedWorkDoneYear: () => state.selected,
    extractJob: value => value, extractWorkOrderNumber: row => row.order,
    normalizeWorkGroupSet: value => value,
    getWorkOrderAmendment: id => state.corrections[id],
    setWorkDoneUploadState: (...args) => state.statuses.push(args),
    runInChunks: async (rows, handler) => rows.forEach(handler),
    updateWorkGroupFilterOptions() {}, render() {}
  });
  vm.runInContext(`let workDoneUploadInProgress = false, workDoneUploadSerial = 0, currentFinancialYear = 'FY27', workDoneUploadedAt = null, currentWorkOrders = []; ${loader} ${functions}`, context);
  return { state, session, context, upload: file => context.loadWorkDone(file || { arrayBuffer: async () => new ArrayBuffer(0) }) };
}

test('real upload path reapplies corrections, isolates FYs and retains data on invalid replacement', async () => {
  const h = uploadHarness();
  h.state.rows = [{ 'Standard Job No': '123456', 'Work Order Closed Period': 1, 'Units Complete': 5, 'Work Group Set': 'WG', order: 'WO1' }];
  await h.upload();
  const first = h.session.get('FY27').data;
  assert.equal(first.get('123456').periods.P1, 9);
  assert.equal(first.get('123456').workOrders[0].originalUnits, 5);
  h.state.rows[0]['Units Complete'] = -1;
  await h.upload();
  assert.equal(h.session.get('FY27').data, first);
  assert.equal(h.state.statuses.at(-1)[0], 'error');
  h.state.rows[0]['Units Complete'] = 2;
  h.state.selected = 'FY28';
  await h.upload();
  assert.ok(h.session.get('FY28'));
  assert.equal(h.context.window.wData, first);
  await h.context.loadWorkDoneStoreAsync('FY29');
  assert.equal(h.context.window.wData, null);
  await h.context.loadWorkDoneStoreAsync('FY27');
  assert.equal(h.context.window.wData, first);
  // New page: no upload, but the separately stored correction can still apply.
  const fresh = uploadHarness();
  assert.equal(fresh.session.get('FY27'), null);
  fresh.state.rows = h.state.rows;
  await fresh.upload();
  assert.equal(fresh.session.get('FY27').data.get('123456').periods.P1, 9);
});

test('upload finishing after its selected FY changes cannot install stale evidence', async () => {
  const h = uploadHarness();
  h.state.rows = [{ 'Standard Job No': '123456', 'Work Order Closed Period': 1, 'Units Complete': 5 }];
  let finish;
  const uploading = h.upload({ arrayBuffer: () => new Promise(resolve => { finish = resolve; }) });
  h.state.selected = 'FY28';
  finish(new ArrayBuffer(0));
  await uploading;
  assert.equal(h.session.get('FY27'), null);
  assert.equal(h.session.get('FY28'), null);
  assert.equal(h.state.statuses.at(-1)[0], 'error');
});

test('session uploads replace only their FY; invalid replacement retains valid data; new sessions start empty', () => {
  const session = createWorkDoneSession();
  const first = new Map([['123456', { periods: { P1: 5 } }]]);
  session.replace('FY27', first);
  session.replace('FY28', new Map([['123456', { periods: { P1: 0 } }]]));
  assert.equal(session.get('FY27').data, first);
  assert.throws(() => session.replace('FY27', new Map()));
  assert.equal(session.get('FY27').data, first);
  const replacement = new Map([['123456', { periods: { P1: 8 } }]]);
  session.replace('FY27', replacement);
  assert.equal(session.get('FY27').data, replacement);
  assert.equal(session.get('FY28').data.get('123456').periods.P1, 0);
  assert.equal(createWorkDoneSession().get('FY27'), null);
  session.clear('FY27');
  assert.equal(session.get('FY27'), null);
  assert.ok(session.get('FY28'));
  session.clear();
  assert.equal(session.get('FY28'), null);
});

test('startup deletes only the legacy Work Done cache and never persists session data', () => {
  const values = new Map([['aprWorkDoneByYearV1', 'old'], ['aprWorkOrderAmendmentsV1', 'correction']]);
  const context = vm.createContext({ window: { localStorage: {
    removeItem(key) { values.delete(key); },
    setItem() { throw new Error('Must not persist'); },
    getItem() { throw new Error('Must not read old evidence'); }
  } }, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../work-done-session.js'), 'utf8'), context);
  vm.runInContext("window.WorkDoneSession.replace('FY27', new Map([['123456', {}]]))", context);
  assert.equal(values.has('aprWorkDoneByYearV1'), false);
  assert.equal(values.get('aprWorkOrderAmendmentsV1'), 'correction');
});
