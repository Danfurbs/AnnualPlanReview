const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeDraft, clearScope, exportRows, importRows } = require('../forecast-builder-actions');
const stored = () => ({ wgs: { A: { P1: 4 }, B: { P1: 6 } }, comments: { A: 'A note', B: 'B note' }, periods: { P1: 10 } });

test('saving and clearing one Engineer row preserves other Engineer rows and comments', () => {
  const source = stored();
  const draft = { rows: { A: { periods: { P1: 0 }, comment: 'zero' } }, clearedWorkGroups: new Set() };
  const saved = mergeDraft(source, draft);
  assert.equal(saved.wgs.A.P1, 0);
  assert.deepEqual(saved.wgs.B, source.wgs.B);
  assert.equal(saved.comments.B, 'B note');
  assert.equal(saved.periods.P1, 6);
  draft.clearedWorkGroups.add('A');
  const cleared = mergeDraft(source, draft);
  assert.equal(cleared.wgs.A, undefined);
  assert.equal(cleared.comments.A, undefined);
  assert.equal(cleared.comments.B, 'B note');
  assert.deepEqual(source, stored());
});

test('Clear All scopes to current ownership and does not mutate its input', () => {
  const source = new Map([['123456', stored()], ['other', { periods: { P1: 7 } }]]);
  const one = clearScope(source, wg => wg === 'A');
  assert.equal(one.count, 1);
  assert.equal(one.data.get('123456').periods.P1, 6);
  assert.equal(one.data.get('123456').comments.B, 'B note');
  assert.deepEqual(one.data.get('other'), source.get('other'));
  assert.deepEqual(source.get('123456'), stored());
  const all = clearScope(new Map([['123456', stored()]]), () => true);
  assert.equal(all.data.size, 0);
});

test('V0 export/import round trip preserves comments and explicit zero; scope excludes other WGS', () => {
  const source = new Map([['123456', stored()]]);
  source.get('123456').wgs.A.P2 = 0;
  const rows = exportRows(source, 'FY32', wg => wg === 'A');
  const restored = importRows(rows, 'FY32');
  assert.equal(restored.get('123456').comments.A, 'A note');
  assert.equal(restored.get('123456').wgs.A.P2, 0);
  assert.equal(restored.get('123456').wgs.B, undefined);
  assert.throws(() => importRows(rows, 'FY33'), /Financial Year/);
  assert.throws(() => importRows([...rows, ...rows], 'FY32'), /Duplicate/);
  rows[0].P01 = -1;
  assert.throws(() => importRows(rows, 'FY32'), /non-negative/);
});

test('save rejects nonfinite input and normalises edited aliases without touching unrelated rows', () => {
  const source = { wgs: { 'A description': { P1: 2 }, B: { P1: 6 } }, comments: { 'A description': 'old' } };
  const draft = { rows: { A: { periods: { P1: Infinity }, comment: '' } }, clearedWorkGroups: new Set() };
  assert.throws(() => mergeDraft(source, draft), /finite/);
  draft.rows.A.periods.P1 = 3;
  const saved = mergeDraft(source, draft, key => key === 'A description' ? 'A' : key);
  assert.equal(saved.wgs['A description'], undefined);
  assert.equal(saved.comments['A description'], undefined);
  assert.equal(saved.wgs.B.P1, 6);
});
