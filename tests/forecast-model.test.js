const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../forecast-model');

test('sparse edits retain explicit zero, existing equal overrides, and untouched periods', () => {
  assert.deepEqual(model.applyPeriodEdits({ P7: 100, P8: 2 }, { P8: '0' }), { P7: 100, P8: 0 });
  assert.deepEqual(model.applyPeriodEdits({ P7: 100, P8: 0 }, { P8: '' }), { P7: 100 });
  for (const value of ['-1', '12garbage', 'Infinity']) assert.throws(() => model.parseCell(value));
});

test('reporting distinguishes no selection, no evidence, confirmed zero, and P0', () => {
  assert.equal(model.performance({ P1: 20 }, {}, null, true).actual, null);
  assert.equal(model.performance({ P1: 20 }, {}, 1, false).actual, null);
  assert.equal(model.performance({ P1: 20 }, {}, 1, true).actual, 0);
  assert.equal(model.performance({ P1: 20 }, {}, 0, false).actual, 20);
  assert.equal(model.performance({ P5: 10, P6: 20 }, { P5: 5, P6: 99 }, 5, true).actual, 25);
  assert.deepEqual(model.movement(0, 5), { units: 5, percent: null });
});

test('three-way merge retains unrelated server edits and flags same-cell conflicts', () => {
  const base = { wgs: { A: { P8: 10, P9: 20 } }, comments: { A: 'Keep' } };
  const draft = { wgs: { A: { P8: 0, P9: 20 } }, comments: { A: 'Keep' } };
  const remote = { wgs: { A: { P8: 10, P9: 30 } }, comments: { A: 'Server comment' } };
  const merged = model.mergeChanges(base, draft, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.value, { wgs: { A: { P8: 0, P9: 30 } }, comments: { A: 'Server comment' } });
  remote.wgs.A.P8 = 99;
  assert.deepEqual(model.mergeChanges(base, draft, remote).conflicts, ['wgs.A.P8']);
});
