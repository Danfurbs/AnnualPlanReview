const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function mockExpress(request, parent, isMain) {
  if (request === 'express') return { Router: () => ({}) };
  return originalLoad.call(this, request, parent, isMain);
};
const createForecastRoutes = require('../routes/forecasts');
Module._load = originalLoad;
const { validateForecastEntry } = createForecastRoutes;

test('forecast validation accepts zero and positive values', () => {
  assert.equal(validateForecastEntry('000001', {
    periods: { P1: 0, P2: 2.5 },
    wgs: { Track: { P1: 0, P2: 2.5 } },
    comments: {}
  }), null);
});

test('forecast validation rejects a negative work-group value with its context', () => {
  assert.equal(
    validateForecastEntry('000001', { wgs: { Track: { P6: -1 } } }),
    "Job 000001 workgroup 'Track' period 'P6' must be non-negative"
  );
});

test('forecast validation also rejects negative aggregate period values', () => {
  assert.equal(
    validateForecastEntry('000001', { periods: { P6: -1 }, wgs: {} }),
    "Job 000001 periods period 'P6' must be non-negative"
  );
});
