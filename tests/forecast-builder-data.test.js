const assert = require('node:assert/strict');
const test = require('node:test');
const {
  REASONS, getPlanningHistoryYears, getStandardJobsForEngineer,
  getWorkGroupSetsForStandardJob, canRemoveManuallyAddedStandardJob
} = require('../forecast-builder-data');

const engineers = [
  { id: 'track', workGroupSets: ['WG-TRACK'] },
  { id: 'ole', workGroupSets: ['WG-OLE'] }
];
const base = {
  selectedYear: 'FY28', engineerId: 'track', engineers,
  effectiveForecastsByYear: {}, v0ForecastsByYear: {}, workDoneByYear: {}, planningMetadata: []
};
const job = (workGroup, periods = {}, comment = '') => ({
  wgs: { [workGroup]: periods }, comments: comment ? { [workGroup]: comment } : {}
});

test('derives the three-year planning window without hard-coded production years', () => {
  assert.deepEqual(getPlanningHistoryYears('FY30'), ['FY29', 'FY28', 'FY27']);
  assert.throws(() => getPlanningHistoryYears('2028'), /Invalid financial year/);
});

test('normalizes padded and unpadded Standard Job identities into one queue entry', () => {
  const result = getStandardJobsForEngineer({
    ...base,
    effectiveForecastsByYear: { FY27: new Map([['009005', job('WG-TRACK', { P1: 2 })]]) },
    planningMetadata: [{ fiscalYear: 'FY28', engineerId: 'track', jobNumber: '9005', workGroup: '', forecasted: false }]
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].jobNumber, '9005');
});

test('includes final effective forecast evidence, including evidence only in FY-3', () => {
  const result = getStandardJobsForEngineer({
    ...base, effectiveForecastsByYear: { FY25: new Map([['100', job('WG-TRACK', { P13: 4 })]]) }
  });
  assert.equal(result[0].jobNumber, '100');
  assert.deepEqual(result[0].reasons, [REASONS.RECENT_FORECAST]);
});

test('includes corrected Work Done evidence without forecast evidence', () => {
  const result = getStandardJobsForEngineer({
    ...base, workDoneByYear: { FY27: new Map([['101', job('WG-TRACK', { P2: 3 })]]) }
  });
  assert.deepEqual(result[0].reasons, [REASONS.RECENT_WORK_DONE]);
});

test('includes comment-only evidence without volume', () => {
  const result = getStandardJobsForEngineer({
    ...base, effectiveForecastsByYear: { FY26: new Map([['102', job('WG-TRACK', {}, 'Historic context')]]) }
  });
  assert.deepEqual(result[0].reasons, [REASONS.COMMENT_ONLY]);
});

test('excludes evidence outside the prior-three-year window', () => {
  const result = getStandardJobsForEngineer({
    ...base, effectiveForecastsByYear: { FY24: new Map([['103', job('WG-TRACK', { P1: 5 })]]) }
  });
  assert.deepEqual(result, []);
});

test('returns simultaneous inclusion reasons', () => {
  const result = getStandardJobsForEngineer({
    ...base,
    effectiveForecastsByYear: { FY27: new Map([['104', job('WG-TRACK', { P1: 5 })]]) },
    workDoneByYear: { FY26: new Map([['104', job('WG-TRACK', { P1: 2 })]]) }
  });
  assert.deepEqual(new Set(result[0].reasons), new Set([REASONS.RECENT_FORECAST, REASONS.RECENT_WORK_DONE]));
});

test('cross-discipline evidence follows current Work Group Set ownership only', () => {
  const options = {
    ...base, effectiveForecastsByYear: { FY27: new Map([['OLE-JOB', job('WG-TRACK', { P1: 1 })]]) }
  };
  assert.equal(getStandardJobsForEngineer(options)[0].jobNumber, 'OLE-JOB');
  assert.deepEqual(getStandardJobsForEngineer({ ...options, engineerId: 'ole' }), []);
});

test('filters Work Group Sets to the selected engineer', () => {
  const rows = getWorkGroupSetsForStandardJob({
    ...base, jobNumber: '105', effectiveForecastsByYear: {
      FY27: new Map([['105', { wgs: { 'WG-TRACK': { P1: 1 }, 'WG-OLE': { P1: 2 } }, comments: {} }]])
    }
  });
  assert.deepEqual(rows.map(row => row.workGroup), ['WG-TRACK']);
});

test('manual jobs persist in the queue and start not Forecasted', () => {
  const planningMetadata = [{ fiscalYear: 'FY28', engineerId: 'track', jobNumber: '200', workGroup: '', forecasted: false, manuallyAdded: true }];
  const result = getStandardJobsForEngineer({ ...base, planningMetadata });
  assert.equal(result[0].forecasted, false);
  assert.deepEqual(result[0].reasons, [REASONS.MANUALLY_ADDED]);
});

test('manual removal is allowed only before V0 data or comments exist', () => {
  const planningMetadata = [{ fiscalYear: 'FY28', engineerId: 'track', jobNumber: '200', workGroup: '', forecasted: false, manuallyAdded: true }];
  const options = { ...base, jobNumber: '200', planningMetadata };
  assert.equal(canRemoveManuallyAddedStandardJob(options), true);
  assert.equal(canRemoveManuallyAddedStandardJob({
    ...options, v0ForecastsByYear: { FY28: new Map([['200', job('WG-TRACK', { P1: 1 })]]) }
  }), false);
  assert.equal(canRemoveManuallyAddedStandardJob({
    ...options, v0ForecastsByYear: { FY28: new Map([['200', job('WG-TRACK', {}, 'Do not hide')]]) }
  }), false);
});

test('manual exceptional Work Group Sets survive through isolated metadata', () => {
  const rows = getWorkGroupSetsForStandardJob({
    ...base, jobNumber: '201', planningMetadata: [{
      fiscalYear: 'FY28', engineerId: 'track', jobNumber: '201', workGroup: 'WG-OLE', forecasted: false, manuallyAdded: true
    }]
  });
  assert.deepEqual(rows, [{ workGroup: 'WG-OLE', reasons: [REASONS.MANUALLY_ADDED] }]);
});

test('Forecasted metadata does not label an automatically discovered job as manually added', () => {
  const result = getStandardJobsForEngineer({
    ...base,
    effectiveForecastsByYear: { FY27: new Map([['105', job('WG-TRACK', { P1: 1 })]]) },
    planningMetadata: [{
      fiscalYear: 'FY28', engineerId: 'track', jobNumber: '105', workGroup: '',
      forecasted: true, manuallyAdded: false
    }]
  });
  assert.equal(result[0].forecasted, true);
  assert.deepEqual(result[0].reasons, [REASONS.RECENT_FORECAST]);
});

test('a manually added job remains manually added after it is marked Forecasted', () => {
  const result = getStandardJobsForEngineer({
    ...base,
    planningMetadata: [{
      fiscalYear: 'FY28', engineerId: 'track', jobNumber: '200', workGroup: '',
      forecasted: true, manuallyAdded: true
    }]
  });
  assert.equal(result[0].forecasted, true);
  assert.deepEqual(result[0].reasons, [REASONS.MANUALLY_ADDED]);
});
