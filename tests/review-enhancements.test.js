const test = require('node:test');
const assert = require('node:assert/strict');
const { totals, reviewQueue } = require('../review-enhancements');
test('rollup explanation uses completed Work Done and future forecast only', () => {
  assert.deepEqual(totals({ P1: 10, P2: 20 }, { P1: 7, P2: 999 }, 1, true), {
    annual: 30, completed: 7, future: 20, projected: 27
  });
  assert.equal(totals({ P1: 10 }, {}, null, false).projected, null);
  assert.equal(totals({ P1: 10 }, {}, 0, true).projected, 10);
});
test('review queue excludes rollups and reviewed jobs, sorts variances without mutating input', () => {
  const rows = [{ job: 'A', variance: 2 }, { job: 'B', variance: -8 }, { job: 'C', reviewed: true }, { job: 'Group', group: true }];
  assert.deepEqual(reviewQueue(rows).map(row => row.job), ['B', 'A']);
  assert.equal(rows[0].job, 'A');
});
