const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApiClient(fetch) {
  const storage = new Map();
  const window = {
    location: { hostname: 'localhost', origin: 'http://localhost:3000' },
    Toast: { error() {} }
  };
  const context = {
    AbortController,
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
