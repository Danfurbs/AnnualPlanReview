const assert = require('node:assert/strict');
const test = require('node:test');

const { getActualOrForecastForCutoff } = require('../utils');

test('manual cutoff ignores work done reported in a later period', () => {
  const workDone = { P4: 10, P5: 2 };

  assert.equal(getActualOrForecastForCutoff(10, workDone, 4, 4), 10);
  assert.equal(getActualOrForecastForCutoff(10, workDone, 5, 4), 10);
});

test('periods through the cutoff use work done including an explicit zero', () => {
  const workDone = { P3: 0, P4: 7 };

  assert.equal(getActualOrForecastForCutoff(12, workDone, 3, 4), 0);
  assert.equal(getActualOrForecastForCutoff(12, workDone, 4, 4), 7);
});

test('periods after the cutoff use a zero forecast rather than later work done', () => {
  const workDone = { P5: 9 };

  assert.equal(getActualOrForecastForCutoff(0, workDone, 5, 4), 0);
});
