const assert = require('node:assert/strict');
const test = require('node:test');

const { getForecastVarianceStatus } = require('../utils');

test('RAG boundaries make exactly 10 percent Amber and exactly 50 percent Red', () => {
  assert.equal(getForecastVarianceStatus(100, 109.999).status, 'good');
  assert.equal(getForecastVarianceStatus(100, 110).status, 'warning');
  assert.equal(getForecastVarianceStatus(100, 149.999).status, 'warning');
  assert.equal(getForecastVarianceStatus(100, 150).status, 'bad');
});

test('RAG is symmetric for under-delivery and over-delivery', () => {
  assert.equal(getForecastVarianceStatus(100, 90).status, 'warning');
  assert.equal(getForecastVarianceStatus(100, 110).status, 'warning');
  assert.equal(getForecastVarianceStatus(100, 50).status, 'bad');
  assert.equal(getForecastVarianceStatus(100, 150).status, 'bad');
});

test('zero forecast follows the explicit national special cases', () => {
  assert.equal(getForecastVarianceStatus(0, 0).status, 'good');
  assert.equal(getForecastVarianceStatus(0, 0).hasNoForecast, true);
  assert.equal(getForecastVarianceStatus(0, 1).status, 'bad');
  assert.equal(getForecastVarianceStatus(0, 1).hasNoForecast, true);
});
