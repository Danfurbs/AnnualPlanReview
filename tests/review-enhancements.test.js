const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
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

test('two rapid review changes preserve each confirmed result and a failed reopen keeps the status', async () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const code = source.slice(source.indexOf('    function changeJobReview('), source.indexOf('    window.getJobReviewStatus'));
  const writes = [];
  let finishFirst, fail = false;
  const firstResponse = new Promise(resolve => { finishFirst = resolve; });
  const context = vm.createContext({
    reviewChanges: Promise.resolve(), reviewStore: {}, aprRefreshing: false, reviewReadError: '',
    structuredClone, currentReviewStage: 'RF9', currentFinancialYear: 'FY27', saveReviewStore() {},
    getReportingJobAliases: key => [key], console,
    window: {
      isApiEnabled: () => true,
      saveReviewsToApi: async store => {
        writes.push(store);
        if (writes.length === 1) return firstResponse;
        return !fail;
      }
    }
  });
  vm.runInContext(code, context);
  const first = context.markJobReviewed('009045');
  const second = context.markJobReviewed('009280');
  await Promise.resolve();
  assert.equal(writes.length, 1);
  assert.deepEqual(context.reviewStore, {});
  finishFirst(true);
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(Object.keys(writes[1]).sort(), ['009045', '009280']);
  fail = true;
  assert.equal(await context.reopenJobReview('009045'), false);
  assert.ok(context.reviewStore['009045'].FY27.RF9.reviewedAt);
});
