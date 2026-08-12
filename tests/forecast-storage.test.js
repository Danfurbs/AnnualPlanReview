const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadForecastStorage(workGroupSets = new Map()) {
  const storage = new Map();
  const window = {
    workGroupSets,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    }
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
