const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApiClient(fetch, overrides = {}) {
  const storage = new Map();
  const window = {
    location: { hostname: 'localhost', origin: 'http://localhost:3000' },
    Toast: { error() {} },
    ForecastModel: require('../../forecast-model'),
    serializeForecastData: map => Object.fromEntries(map),
    hydrateForecastData: object => new Map(Object.entries(object)),
    recalculatePeriodsFromWgs: wgs => Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`P${i + 1}`, Object.values(wgs || {}).reduce((n, row) => n + (row[`P${i + 1}`] || 0), 0)])),
    confirm: () => false,
    ...overrides
  };
  const context = {
    AbortController,
    structuredClone,
    clearTimeout,
    console,
    fetch,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    Math,
    Promise,
    setTimeout,
    window
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../../api-client.js'), 'utf8'),
    context
  );
  return window;
}

function successfulResponse(revision) {
  return {
    ok: true,
    json: async () => ({ success: true, revision })
  };
}

test('rapid review saves are serialized and use the latest server revision', async () => {
  const requests = [];
  let releaseFirst;
  const firstResponse = new Promise(resolve => { releaseFirst = resolve; });
  const client = loadApiClient(async (_url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) return firstResponse;
    return successfulResponse(2);
  });

  const store = { JOB1: { FY26: { RF1: { reviewedAt: 'first' } } } };
  const firstSave = client.saveReviewsToApi(store);
  store.JOB2 = { FY26: { RF1: { reviewedAt: 'second' } } };
  const secondSave = client.saveReviewsToApi(store);

  await Promise.resolve();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].expectedRevision, 0);
  assert.equal(requests[0].reviewStore.JOB2, undefined);

  releaseFirst(successfulResponse(1));
  assert.equal(await firstSave, true);
  assert.equal(await secondSave, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].expectedRevision, 1);
  assert.equal(requests[1].reviewStore.JOB2.FY26.RF1.reviewedAt, 'second');
});

const response = (data, status = 200) => ({ ok: status === 200, status, statusText: 'Conflict', json: async () => data, clone() { return this; } });
test('forecast conflict merges untouched server cells and preserves explicit zero', async () => {
  let revision = 1;
  let remote = { '000123': { wgs: { WG: { P8: 10, P9: 20 } }, periods: {}, comments: {} } };
  const client = loadApiClient(async (_url, options) => {
    if (options.method === 'GET') return response({ success: true, data: structuredClone(remote), revision });
    const body = JSON.parse(options.body);
    if (body.expectedRevision !== revision) return response({ error: 'Revision conflict' }, 409);
    remote = body.data; revision++;
    return response({ success: true, revision });
  });
  const loaded = await client.loadForecastFromApi('FY27', 'v1');
  loaded.data.get('000123').wgs.WG.P8 = 0;
  remote['000123'].wgs.WG.P9 = 30; revision++;
  assert.equal(await client.saveForecastToApi(loaded.data, 1, 'FY27', 'v1'), true);
  assert.deepEqual(remote['000123'].wgs.WG, { P8: 0, P9: 30 });
  assert.equal(loaded.data.get('000123').wgs.WG.P9, 30);
});

test('declining a same-cell conflict retains its ancestry and asks again on retry', async () => {
  let revision = 1, prompts = 0, writes = 0;
  const remote = { '000123': { wgs: { WG: { P8: 10 } }, periods: {}, comments: {} } };
  const client = loadApiClient(async (_url, options) => {
    if (options.method === 'GET') return response({ success: true, data: structuredClone(remote), revision });
    writes++;
    return response({ error: 'Revision conflict' }, 409);
  }, { confirm: () => { prompts++; return false; } });
  const loaded = await client.loadForecastFromApi('FY27', 'v1');
  loaded.data.get('000123').wgs.WG.P8 = 0;
  remote['000123'].wgs.WG.P8 = 40; revision++;
  assert.equal(await client.saveForecastToApi(loaded.data, 1, 'FY27', 'v1'), false);
  assert.equal(await client.saveForecastToApi(loaded.data, 1, 'FY27', 'v1'), false);
  assert.equal(prompts, 2);
  assert.equal(writes, 2);
  assert.equal(loaded.data.get('000123').wgs.WG.P8, 0);
  assert.equal(remote['000123'].wgs.WG.P8, 40);
});

test('per-job conflict merges server comments and confirms only after successful retry', async () => {
  let revision = 1;
  let job = { wgs: { WG: { P8: 10 } }, periods: {}, comments: { WG: 'Before' } };
  const client = loadApiClient(async (_url, options) => {
    if (options.method === 'GET') return response({ success: true, data: { '000123': structuredClone(job) }, revision });
    const { expectedRevision, ...value } = JSON.parse(options.body);
    if (expectedRevision !== revision) return response({ error: 'Revision conflict' }, 409);
    job = value; return response({ success: true, revision: ++revision });
  });
  const loaded = await client.loadForecastFromApi('FY27', 'v1');
  const draft = loaded.data.get('000123'); draft.wgs.WG.P8 = 0;
  job.comments.WG = 'Remote'; revision++;
  assert.equal(await client.saveForecastJobToApi('000123', draft, 'FY27', 'v1'), true);
  assert.equal(draft.comments.WG, 'Remote');
  assert.equal(job.wgs.WG.P8, 0);
});


test('correction reads reject unsuccessful responses instead of claiming an empty store', async () => {
  const client = loadApiClient(async () => ({ ok: true, json: async () => ({ success: false }) }));
  assert.equal(await client.loadWorkOrderAmendmentsFromApi(), null);
});

test('correction reads bypass HTTP caches and accept a confirmed empty server store', async () => {
  let options;
  const client = loadApiClient(async (_url, config) => { options = config; return { ok: true, json: async () => ({ success: true, data: {}, revisions: {} }) }; });
  assert.deepEqual(JSON.parse(JSON.stringify(await client.loadWorkOrderAmendmentsFromApi())), {});
  assert.equal(options.cache, 'no-store');
});

test('correction reads wait for pending writes and use the new revision afterwards', async () => {
  const calls = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const client = loadApiClient(async (_url, options) => {
    calls.push(options.method);
    if (options.method === 'PUT') { await gate; return successfulResponse(1); }
    return { ok: true, json: async () => ({ success: true, data: { WO1: { units: 8 } }, revisions: { WO1: 1 } }) };
  });
  const saving = client.saveWorkOrderAmendmentToApi('WO1', { units: 8 });
  const reading = client.loadWorkOrderAmendmentsFromApi();
  await Promise.resolve();
  assert.deepEqual(calls, ['PUT']);
  release();
  assert.equal(await saving, true);
  assert.equal((await reading).WO1.units, 8);
  assert.deepEqual(calls, ['PUT', 'GET']);
});


test('refreshing after a declined correction conflict cannot silently authorize overwrite on retry', async () => {
  const revisions = [];
  let confirmations = 0;
  const client = loadApiClient(async (_url, options) => {
    if (options.method === 'PUT') {
      revisions.push(JSON.parse(options.body).expectedRevision);
      return { ok: false, status: 409, json: async () => ({ error: 'Revision conflict' }) };
    }
    return { ok: true, json: async () => ({ success: true, data: { WO1: { units: 7 } }, revisions: { WO1: 3 } }) };
  }, { confirm: () => { confirmations++; return false; } });
  assert.equal(await client.saveWorkOrderAmendmentToApi('WO1', { units: 20 }), false);
  await client.loadWorkOrderAmendmentsFromApi();
  assert.equal(await client.saveWorkOrderAmendmentToApi('WO1', { units: 20 }), false);
  assert.deepEqual(revisions, [0, 0]);
  assert.equal(confirmations, 2);
});
