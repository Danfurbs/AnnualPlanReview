const test = require('node:test');
const assert = require('node:assert/strict');
const { prepare } = require('../exports-data');
const orgs = {
  A: { engineer: { id: 'e1', name: 'Engineer one' }, deliveryUnit: { id: 'du1', name: 'DU one' } },
  B: { engineer: { id: 'e2', name: 'Engineer two' }, deliveryUnit: { id: 'du1', name: 'DU one' } },
  C: { engineer: { id: 'e3', name: 'Engineer three' }, deliveryUnit: { id: 'du2', name: 'DU two' } }
};
function fixture(changes = {}) {
  return { year: 'FY27', stage: 'RF6', cutoff: 1, hasWorkDone: true,
    v0: new Map([['000001', { wgs: { A: { P1: 10, P2: 20 }, B: { P1: 5 } } }], ['000002', { wgs: { C: { P1: 4, P2: 6 } } }]]),
    v1: new Map([['000001', { wgs: { 'Alias A': { P2: 0 } } }]]),
    done: new Map([['000001', { wgs: { A: { P1: 8, P2: 999 }, B: { P1: 3 } }, workOrders: [{ id: 'order', workGroup: 'A', period: 'P1', number: 'WO1', units: 8, originalUnits: 7, isAmended: true }] }]]),
    catalogue: new Map([['000001', { desc: 'Job one', unit: 'Miles' }], ['000002', { desc: 'Job two', unit: 'Count' }]]),
    comments: { '000001': [{ fy: 'FY27', rf: 'RF6', category: 'General', text: '=literal text', filteredWorkGroup: 'A' }, { fy: 'FY27', rf: 'RF3', category: 'RF3', text: 'B comment', filteredWorkGroup: 'B' }] },
    reviews: { '000001': { FY27: { RF6: { reviewedAt: '2026-10-28' } } } },
    normalise: code => code === 'Alias A' ? 'A' : code,
    organisation: code => orgs[code], commentOrganisation: entry => orgs[entry.filteredWorkGroup], groupDescription: code => code, ...changes };
}
test('report scopes isolate DU, Engineer and Work Group Set with sparse zero inheritance', () => {
  const input = fixture();
  const du = prepare(input, { du: 'du1', scale: 'du' }).datasets;
  assert.equal(du.performance.length, 1);
  assert.equal(du.performance[0]['Latest forecast'], 15);
  assert.equal(du.performance[0]['Projected full year'], 11);
  const engineer = prepare(input, { du: 'du1', scale: 'engineer', target: 'e1' }).datasets;
  assert.equal(engineer.performance[0]['Original plan V0'], 30);
  assert.equal(engineer.performance[0]['Latest forecast'], 10);
  assert.equal(engineer.performance[0]['Projected full year'], 8);
  assert.equal(engineer.periods.find(row => row.Period === 'P2')['Explicit V1 update'], 'Yes');
  assert.equal(engineer.periods.find(row => row.Period === 'P1')['Explicit V1 update'], 'No');
  assert.equal(engineer.periods.find(row => row.Period === 'P2')['Completed Work Done'], null);
  assert.equal(prepare(input, { du: 'du1', scale: 'workgroup', target: 'C' }).datasets.performance.length, 0);
  assert.equal(prepare(input, { du: 'all', scale: 'du' }).datasets.performance.length, 2);
  assert.equal(input.v0.get('000001').wgs.A.P2, 20, 'sources remain unchanged');
});
test('missing uploads and cutoffs remain unavailable; P0 and P13 are explicit', () => {
  const scope = { du: 'du1', scale: 'workgroup', target: 'A' };
  for (const changes of [{ hasWorkDone: false }, { cutoff: null }, { correctionsError: 'Failed read' }]) {
    assert.equal(prepare(fixture(changes), scope).datasets.performance[0]['Projected full year'], null);
  }
  assert.equal(prepare(fixture({ cutoff: 0, hasWorkDone: false }), scope).datasets.performance[0]['Projected full year'], 10);
  assert.equal(prepare(fixture({ cutoff: 13 }), scope).datasets.performance[0]['Projected full year'], 1007);
});
test('filters, corrected orders, comment categories and review flags share the scoped cohort', () => {
  const scope = { du: 'du1', scale: 'workgroup', target: 'A' };
  const data = prepare(fixture(), scope, { review: 'reviewed', orders: 'corrected', commentType: 'General', commentStage: 'RF6' }).datasets;
  assert.equal(data.orders[0].Difference, 1);
  assert.equal(data.comments.length, 1);
  assert.equal(data.comments[0].Comment, '=literal text');
  assert.equal(data.reviews[0]['Review status'], 'Reviewed');
  assert.equal(prepare(fixture(), scope, { search: 'not a job' }).datasets.comments.length, 0);
  assert.equal(prepare(fixture(), scope, { members: ['000001','000001'] }).datasets.performance.length, 1);
  assert.equal(prepare(fixture(), scope, { review: 'needsreview' }).datasets.performance.length, 0);
});
test('coverage counts distinct SJNs and preserves original/effective differences', () => {
  const data = prepare(fixture(), { du: 'all', scale: 'du' }).datasets;
  assert.equal(data.coverage.find(row => row['Work Group Set'] === 'A')['V0 SJN count'], 1);
  assert.equal(data.coverage.find(row => row['Work Group Set'] === 'A')['Latest forecast SJN count'], 1);
  assert.equal(data.performance[0]['Standard Job No'], '000001');
  assert.equal(new Set(data.performance.map(row => row.Unit)).size, 2);
});

test('coverage includes in-scope work groups with no forecast evidence', () => {
  const result = prepare(fixture({ v0: new Map(), v1: new Map(), done: new Map(), groupCodes: ['A','B','C'] }), { du: 'du1', scale: 'du' });
  assert.deepEqual(result.datasets.coverage.map(row => row['Work Group Set']), ['A','B']);
  assert.equal(result.datasets.coverage[0]['Latest forecast SJN count'], 0);
});
test('comment-only DU records follow ownership and do not invent forecast or review rows', () => {
  const data = fixture({ v0: new Map(), v1: new Map(), done: new Map() });
  const result = prepare(data, { du: 'du1', scale: 'engineer', target: 'e1' }).datasets;
  assert.equal(result.comments.length, 1);
  assert.equal(result.performance.length, 0);
});

test('legacy comment ownership uses the same canonical scope decision as the dashboard', () => {
  let requested;
  const data = fixture({ commentScope: (_entry, scope) => { requested = scope; return false; } });
  const result = prepare(data, { du: 'du1', scale: 'engineer', target: 'e1' }).datasets;
  assert.equal(result.comments.length, 0);
  assert.deepEqual(requested, { deliveryUnitId: 'du1', engineerId: 'e1', workGroupCode: 'all' });
});

test('unit rankings retain ten entries per unit type and never compare unlike units', () => {
  const data = fixture();
  data.v0 = new Map(); data.done = new Map(); data.v1 = new Map(); data.catalogue = new Map(); data.comments = {};
  for (let index = 1; index <= 24; index++) {
    const key = String(index).padStart(6, '0');
    data.v0.set(key, { wgs: { A: { P1: 10 } } });
    data.done.set(key, { wgs: { A: { P1: index } } });
    data.catalogue.set(key, { unit: index <= 12 ? 'Miles' : 'Count' });
  }
  const ranked = prepare(data, { du: 'du1', scale: 'du' }).datasets.top10;
  assert.equal(ranked.filter(row => row.Unit === 'Miles').length, 10);
  assert.equal(ranked.filter(row => row.Unit === 'Count').length, 10);
  assert.equal(prepare(data, { du: 'du1', scale: 'du' }, { rank: 'percent' }).datasets.top10.length, 10);
});
