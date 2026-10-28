const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createWorkDoneSession } = require('../work-done-session');
const review = require('../work-order-review');
const correctionId = review.stableId({jobNumber:'000001',number:'WO1',workGroup:'TRACK'});
const source = fs.readFileSync('app.js', 'utf8');
function block(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
function harness() {
  const session = createWorkDoneSession();
  const order = { id: correctionId, number: 'WO1', jobNumber: '000001', originalUnits: 5, units: 5, period: 'P1', workGroup: 'Track' };
  const data = new Map([['000001', { workOrders: [order], periods: { P1: 5 }, wgs: { Track: { P1: 5 } } }]]);
  session.replace('FY27', data);
  const state = { server: { [correctionId]: { units: 9 } }, enabled: true, failSave: false, requests: 0 };
  const window = { WorkOrderReview: review, WorkDoneSession: session, currentJobsMap: new Map(), addEventListener() {}, Toast: { error() {} },
    isApiEnabled: () => state.enabled,
    loadWorkOrderAmendmentsFromApi: async () => state.server && structuredClone(state.server),
    saveWorkOrderAmendmentToApi: async (id, value) => {
      state.requests++;
      if (state.saveGate) await state.saveGate;
      if (state.failSave) return false;
      if (value === null) delete state.server[id]; else state.server[id] = structuredClone(value);
      return true;
    }
  };
  const context = vm.createContext({ window, console, Map, document: { getElementById: () => ({}) },
    localStorage: { getItem() { throw Error('Must not read cache'); }, setItem() { throw Error('Must not write cache'); } },
    render() {}, showBreakdown() {}
  });
  vm.runInContext("let workOrderAmendments = {}, currentFinancialYear = 'FY27', currentWorkOrders = [], workDoneUploadedAt = null, currentBreakdownJobNumber = null;" +
    block('    async function loadWorkOrderAmendmentsAsync()', '    function getAllGroups()') +
    block('    async function loadWorkDoneStoreAsync(year)', '    function getSelectedWorkDoneYear()') +
    block('    function getWorkOrderAmendment(orderId)', '    function getJobComments(jobNumber)'), context);
  return { context, state, window, order, data, session, pending: () => vm.runInContext('pendingCorrections.size', context) };
}

test('server corrections are reapplied to originals, including explicit zero and server deletion', async () => {
  const h = harness();
  await h.context.loadWorkDoneStoreAsync('FY27');
  assert.equal(h.order.units, 9);
  await h.context.loadWorkDoneStoreAsync('FY27');
  assert.equal(h.data.get('000001').periods.P1, 9);
  h.state.server[correctionId].units = 0;
  await h.context.loadWorkDoneStoreAsync('FY27');
  assert.equal(h.order.units, 0);
  h.state.server = {};
  await h.context.loadWorkDoneStoreAsync('FY27');
  assert.equal(h.order.units, 5);
  assert.equal(h.data.get('000001').wgs.Track.P1, 5);
});

test('failed and offline loads block reporting without losing uploaded originals; retry recovers', async () => {
  const h = harness();
  await h.context.loadWorkDoneStoreAsync('FY27');
  h.state.server = null;
  await h.context.loadWorkDoneStoreAsync('FY27');
  assert.equal(h.window.wData, null);
  assert.match(h.window.workOrderCorrectionsError, /Reporting is paused/);
  assert.equal(h.session.get('FY27').data, h.data);
  h.state.server = { [correctionId]: { units: 7 } };
  await h.window.retryWorkOrderCorrections();
  assert.equal(h.order.units, 7);
  assert.equal(h.window.workOrderCorrectionsError, null);
  h.state.enabled = false;
  await h.context.loadWorkDoneStoreAsync('FY27');
  assert.equal(h.window.wData, null);
});

test('pending and failed saves never affect totals; retry applies confirmed values and revert restores originals', async () => {
  const h = harness();
  await h.context.loadWorkDoneStoreAsync('FY27');
  let release;
  h.state.saveGate = new Promise(resolve => { release = resolve; });
  h.state.failSave = true;
  const saving = h.context.updateWorkOrderAmendment(correctionId, 20, 5);
  assert.equal(h.order.units, 9);
  release();
  assert.equal(await saving, false);
  assert.equal(h.order.units, 9);
  assert.equal(h.pending(), 1);
  h.state.failSave = false;
  await h.window.retryWorkOrderCorrections();
  assert.equal(h.order.units, 20);
  assert.equal(h.pending(), 0);
  assert.equal(await h.context.updateWorkOrderAmendment(correctionId, 5, 5), true);
  assert.equal(h.order.units, 5);
  assert.equal(h.order.isAmended, false);
});

test('a confirmed save followed by failed refresh blocks reporting until server data can be read', async () => {
  const h = harness();
  await h.context.loadWorkDoneStoreAsync('FY27');
  h.window.saveWorkOrderAmendmentToApi = async () => { h.state.server = null; return true; };
  assert.equal(await h.context.updateWorkOrderAmendment(correctionId, 20, 5), true);
  assert.equal(h.window.wData, null);
  assert.equal(h.pending(), 0);
  assert.match(h.window.workOrderCorrectionsError, /Reporting is paused/);
});
