const test = require('node:test');
const assert = require('node:assert/strict');
const { prepare } = require('../exports-data');
const { prepareAsync } = require('../exports-data');
const { ordered } = require('../export-workbook');
const layout = require('../export-layout');
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

test('V0, V1 and RF plans aggregate only the chosen ownership and preserve zero overrides', () => {
  const scope = { du: 'du1', scale: 'engineer', target: 'e1' };
  const v0 = prepare(fixture(), scope, {}, 'v0').datasets.v0;
  const v1 = prepare(fixture(), scope, {}, 'v1').datasets.v1;
  const rf = prepare(fixture(), scope, {}, 'rf').datasets.rf;
  assert.equal(v0.length, 2);
  assert.deepEqual([v0[0].P1, v0[0].P2, v0[0]['Full year total']], [10, 20, 30]);
  assert.deepEqual([v1[0].P1, v1[0].P2, v1[0]['Full year total']], [10, 0, 10]);
  assert.deepEqual([rf[0].P1, rf[0].P2, rf[0]['Full year total']], [8, 0, 8]);
  assert.match(rf[0].Comments, /=literal text/);
  assert.doesNotMatch(rf[0].Comments, /B comment/);
  const du = prepare(fixture(), { du: 'du1', scale: 'du' }, {}, 'v1').datasets.v1;
  assert.equal(du[0]['Full year total'], 15);
  assert.equal(prepare(fixture({ cutoff: null }), scope, {}, 'rf').datasets.rf[0].P1, null);
  for (const changes of [{ cutoff: 0 }, { hasWorkDone: false }, { cutoff: null }, { cutoff: 14 }, { cutoff: 1.5 }]) {
    const report = prepare(fixture(changes), scope, {}, 'rf');
    assert.equal(report.available, false);
    assert.equal(report.datasets.rf[0]['Full year total'], null);
  }
  assert.equal(prepare(fixture({ cutoff: 13 }), scope, {}, 'rf').datasets.rf[0]['Full year total'], 1007);
  assert.equal(prepare(fixture({ stage: 'RF3' }), scope, {}, 'rf').datasets.rf[0].Comments, '');
});

test('plan versions retain every catalogue job and keep absent forecasts blank', () => {
  const input = fixture();
  input.done.set('000003', { wgs: { A: { P1: 9 } } });
  const scope = { du: 'du1', scale: 'workgroup', target: 'A' };
  for (const version of ['v0', 'v1', 'rf']) {
    const rows = prepare(input, scope, { hideZero: true, search: 'no match', members: ['999999'], review: 'needsreview', variance: 'bad' }, version).datasets[version];
    assert.deepEqual(rows.map(row => row['Standard Job No']), ['000001','000002','000003']);
    assert.equal(rows[1].P1, null);
    assert.equal(rows[1]['Full year total'], null);
    if (version !== 'rf') assert.equal(rows[2].P1, null);
  }
  assert.deepEqual(prepare(input, scope, {}, 'rf').datasets.rf.map(row => row['Standard Job No']), ['000001', '000002', '000003']);
});

test('RF RAG uses latest forecast and previous comments retain FY and ownership scope', () => {
  const input = fixture({ stage: 'RF9' });
  input.comments['000001'].push({ fy: 'FY26', rf: 'RF6', text: 'Wrong year', filteredWorkGroup: 'A' }, { fy: 'FY27', rf: 'RF9', text: 'Current review', filteredWorkGroup: 'A' });
  const scope = { du: 'du1', scale: 'engineer', target: 'e1' };
  const row = prepare(input, scope, { previousRF: 'RF6' }, 'rf').datasets.rf[0];
  assert.equal(row.RAG, 'Amber');
  assert.equal(row['Latest forecast'], 10);
  assert.match(row.Comments, /Current review/);
  assert.doesNotMatch(row.Comments, /literal/);
  assert.match(row['Previous RF Comments'], /=literal text/);
  assert.doesNotMatch(row['Previous RF Comments'], /Wrong year|B comment|Current review/);
  assert.equal(prepare(input, scope, {}, 'rf').datasets.rf[0]['Previous RF Comments'], undefined);
  assert.equal(prepare(input, scope, { previousRF: 'RF11' }, 'rf').datasets.rf[0]['Previous RF Comments'], undefined);
  for (const [done, expected] of [[10, 'Green'], [11, 'Amber'], [15, 'Red']]) {
    input.done.get('000001').wgs.A.P1 = done;
    assert.equal(prepare(input, scope, {}, 'rf').datasets.rf[0].RAG, expected);
  }
  input.v0.get('000001').wgs.A = { P1: 0 };
  assert.equal(prepare(input, scope, {}, 'rf').datasets.rf[0].RAG, 'Red');
  assert.equal(prepare(input, scope, {}, 'rf').datasets.rf[1].RAG, 'Unavailable');
});

test('data error exports include source flags and matching issues without saved amendments', () => {
  const input = fixture();
  input.done.get('000001').workOrders.push(
    { number: 'ZERO', workGroup: 'A', period: 'P1', units: 0 },
    { number: 'DUPLICATE', workGroup: 'A', units: 4, correctionMatchIssue: 'Duplicate rows' },
    { number: 'RESOLVED', workGroup: 'A', period: 'P1', units: 0, correctionResolved: true },
    { number: 'OTHER DU', workGroup: 'C', period: 'P1', units: 0 });
  const rows = prepare(input, { du: 'du1', scale: 'workgroup', target: 'A' }, { orders: 'corrected' }, 'orders').datasets.orders;
  assert.deepEqual(rows.map(row => row['Work Order']), ['WO1', 'ZERO', 'DUPLICATE']);
  assert.match(rows[1]['Data errors'], /Zero units/);
  assert.match(rows[2]['Data errors'], /Duplicate rows/);
});

test('reference ordering keeps MNT sequence and appends new jobs without losing them', () => {
  const rows = ordered(['009001', '999999', '009113', '009112'].map(job => ({ 'Standard Job No': job, Discipline: 'PWAY' })), layout);
  assert.deepEqual(rows.map(row => row['Standard Job No']), ['009112', '009113', '009001', '999999']);
  assert.equal(rows[0]['MNT Code'], 'MNT004');
  assert.equal(new Set(layout.map(row => row[0])).size, layout.length);
});
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

test('large report preparation yields to the UI, memoizes scope lookups and builds only requested detail', async () => {
  const data = fixture({ v0: new Map(), v1: new Map(), done: new Map(), comments: {}, catalogue: new Map() });
  const codes = Array.from({ length: 12 }, (_, i) => 'WG' + i);
  let lookups = 0, aliases = 0, ticks = 0;
  data.organisation = () => { lookups++; return orgs.A; };
  data.normalise = value => { aliases++; return value; };
  for (let index = 1; index <= 1200; index++) data.v0.set(String(index).padStart(6, '0'), { wgs: Object.fromEntries(codes.map(code => [code, { P1: 10, P2: 20 }])) });
  const timer = setInterval(() => ticks++, 0);
  let result;
  try { result = await prepareAsync(data, { du: 'du1', scale: 'du' }, {}, 'performance'); }
  finally { clearInterval(timer); }
  assert.equal(result.datasets.performance.length, 1200);
  assert.equal(result.datasets.periods.length, 0);
  assert.equal(result.datasets.comparison.length, 0);
  assert.ok(ticks > 10, 'main event loop remains responsive while preparing');
  assert.equal(lookups, codes.length);
  assert.equal(aliases, codes.length);
});
