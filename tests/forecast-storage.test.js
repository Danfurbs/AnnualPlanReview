const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadForecastStorage(workGroupSets = new Map(), windowOverrides = {}) {
  const storage = new Map();
  const window = {
    workGroupSets,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    ...windowOverrides
  };
  const context = vm.createContext({
    window,
    localStorage: window.localStorage,
    console,
    structuredClone,
    Map,
    Set
  });
  vm.runInContext(fs.readFileSync('forecast-storage.js', 'utf8'), context);
  return window;
}

test('v1 inherits missing periods but explicitly overrides a period with zero', () => {
  const forecast = loadForecastStorage();
  const result = forecast.mergeForecastWorkGroups(
    { Track: { P1: 12, P2: 8, P3: 4 } },
    { Track: { P2: 0, P3: 6 } }
  );

  assert.deepEqual({ ...result.Track }, { P1: 12, P2: 0, P3: 6 });
  assert.deepEqual({ ...forecast.recalculatePeriodsFromWgs(result) }, {
    P1: 12, P2: 0, P3: 6, P4: 0, P5: 0, P6: 0, P7: 0,
    P8: 0, P9: 0, P10: 0, P11: 0, P12: 0, P13: 0
  });
});

test('v1 code and v0 description aliases replace rather than add together', () => {
  const forecast = loadForecastStorage(new Map([['WG1', 'Track Team (TRACK)']]));
  const result = forecast.mergeForecastWorkGroups(
    { 'Track Team (TRACK)': { P1: 10, P2: 20 } },
    { WG1: { P1: 3, P2: 0 } }
  );

  assert.equal(Object.keys(result).length, 1);
  assert.deepEqual({ ...result['Track Team (TRACK)'] }, { P1: 3, P2: 0 });
  assert.equal(forecast.recalculatePeriodsFromWgs(result).P1, 3);
});

test('existing explicit zeros, forecast comments, and amendment metadata survive a storage round trip', () => {
  const forecast = loadForecastStorage();
  const data = new Map([['000123', {
    periods: { P6: 0 },
    wgs: { Track: { P6: 0 } },
    comments: { Track: 'Keep this RF6 context' },
    amendments: { 'Track:P6': { original: 8, updatedAt: '2026-08-13T00:00:00.000Z' } }
  }]]);

  assert.equal(forecast.saveForecastToStorage(data, 1, 'FY27', 'v1', false), true);
  const restored = forecast.loadForecastFromStorage('FY27', 'v1').data.get('000123');
  assert.equal(Object.hasOwn(restored.wgs.Track, 'P6'), true);
  assert.equal(restored.wgs.Track.P6, 0);
  assert.equal(restored.comments.Track, 'Keep this RF6 context');
  assert.equal(restored.amendments['Track:P6'].original, 8);
});

test('standard-job breakdown edits persist through the per-job API', async () => {
  const calls = [];
  const forecast = loadForecastStorage(new Map(), {
    isApiEnabled: () => true,
    saveForecastJobToApi: async (...args) => {
      calls.push(args);
      return true;
    }
  });
  const job = { periods: { P1: 7 }, wgs: { Track: { P1: 7 } }, comments: {} };
  const snapshot = { data: new Map([['000123', job]]) };

  const saved = await forecast.saveForecastJobToStorageAsync('000123', job, snapshot, 'FY26', 'v1');

  assert.equal(saved, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['000123', job, 'FY26', 'v1']);
  assert.equal(forecast.forecastMemorySnapshots.get('FY26:v1').data.get('000123').wgs.Track.P1, 7);
});

test('standard-job breakdown edits fall back to local persistence outside Render', async () => {
  const forecast = loadForecastStorage(new Map(), {
    isApiEnabled: () => true,
    saveForecastJobToApi: async () => false,
    API_CONFIG: { forceServerPersistence: false }
  });
  const job = { periods: { P1: 9 }, wgs: { Track: { P1: 9 } }, comments: {} };
  const snapshot = { data: new Map([['000456', job]]) };

  assert.equal(await forecast.saveForecastJobToStorageAsync('000456', job, snapshot, 'FY26', 'v1'), true);
  assert.equal(forecast.loadForecastFromStorage('FY26', 'v1').data.get('000456').wgs.Track.P1, 9);
});
