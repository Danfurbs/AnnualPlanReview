const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, parseRows, patchSnapshot, restoreSources } = require('../waif-forecast-import');
const header = ['Work Group Set Code', 'Std Job Number', 'Work Order Closed Period', 'Average Yearly Volume (FY25&26 Actuals)'];
const options = { activeJobs: ['009144', '009127'], activeWorkGroups: ['DBCANTRA', 'DBCARTRA', 'DBBARTRA'] };
const value = (value, period = 'P2', workGroup = 'DBCANTRA') => ({ jobNumber: '009144', workGroup, period, value });

test('Power BI sample maps padded jobs and closed periods without annual spreading or rounding', () => {
  const result = parseRows([header,
    ['DBCANTRA', 9144, 2, 1.5], ['DBCANTRA', 9144, 3, 1], ['DBCANTRA', 9144, 4, 25],
    ['DBCARTRA', 9144, 13, 15], ...[[5, 1.5], [6, 2], [7, 4], [8, 1], [9, 2]].map(([p, n]) => ['DBBARTRA', 9127, p, n])
  ], options);
  assert.deepEqual(result.errors, []);
  assert.equal(result.values.length, 9);
  assert.deepEqual(result.values[0], value(1.5));
  assert.deepEqual(result.values[3], value(15, 'P13', 'DBCARTRA'));
  const snapshot = patchSnapshot(new Map(), result.values).data;
  assert.equal(snapshot.get('009144').wgs.DBCANTRA.P2, 1.5);
  assert.equal(snapshot.get('009144').wgs.DBCARTRA.P13, 15);
  assert.equal(snapshot.get('009144').periods.P13, 15);
});

test('CSV supports BOM, quoted commas, multiline fields, semicolons, zero, and category aggregation', () => {
  const result = parseCsv('\uFEFF' + [...header, 'Std Job Name'].join(',') + '\r\nDBCANTRA,9144,2,1.5,"Paint, rail\nwith ""quotes"""\r\nDBCANTRA,9144,2,2,Paint\r\nDBCANTRA,9144,3,0,Paint\r\n', options);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.values, [value(3.5), value(0, 'P3')]);
  assert.equal(result.aggregatedRows, 1);
  assert.deepEqual(parseCsv(header.join(';') + '\nDBCANTRA;9144;2;1.5', options).values, [value(1.5)]);
});

test('invalid headings, values, periods and truncated CSV block import; unknown codes are reported', () => {
  assert.equal(parseRows([['volume']], options).errors.length, 1);
  for (const n of [-1, 'bad', 'Infinity']) assert.equal(parseRows([header, ['DBCANTRA', 9144, 2, n]], options).errors.length, 1);
  for (const p of [0, 14, '', 'FY27 P2']) assert.equal(parseRows([header, ['DBCANTRA', 9144, p, 1]], options).errors.length, 1);
  const unknown = parseRows([header, ['UNKNOWN', 9144, 2, 1]], options);
  assert.equal(unknown.values.length, 0); assert.equal(unknown.exceptions.length, 1);
  assert.ok(parseCsv(header.join(',') + '\nDBCANTRA,9144,2,"1.5', options).errors.length);
});

test('MST wins overlaps; zero/missing MST uses BI directly, and sources remain separate', () => {
  const initial = new Map([['9144', { wgs: { DBCANTRA: { P2: 10, P3: 0 }, DBCARTRA: { P2: 99 } }, comments: {} }]]);
  const output = patchSnapshot(initial, [value(14), value(6, 'P3')]).data.get('9144');
  assert.deepEqual(output.wgs.DBCANTRA, { P2: 10, P3: 6 });
  assert.deepEqual(output.sources.DBCANTRA.mst, { P2: 10, P3: 0 });
  assert.deepEqual(output.sources.DBCANTRA.waif, { P2: 14, P3: 6 });
  assert.equal(output.wgs.DBCARTRA.P2, 99);
  assert.equal(initial.get('9144').wgs.DBCANTRA.P3, 0, 'source map remains untouched');
});

test('repeat uploads replace matched cells, preserve unreported scope and manual edits including zero', () => {
  const first = patchSnapshot(new Map(), [value(6), value(3, 'P3')]).data;
  assert.deepEqual(patchSnapshot(first, [value(6)]).data, first, 'identical upload is idempotent');
  const second = patchSnapshot(first, [value(8)]).data;
  assert.equal(second.get('009144').wgs.DBCANTRA.P2, 8);
  assert.equal(second.get('009144').wgs.DBCANTRA.P3, 3);
  second.get('009144').wgs.DBCANTRA.P2 = 0;
  const manual = patchSnapshot(second, [value(12)]).data.get('009144');
  assert.equal(manual.wgs.DBCANTRA.P2, 0);
  assert.equal(manual.sources.DBCANTRA.waif.P2, 12);
});

test('MST and BI uploads reconcile in either order and a reported MST zero falls back to BI', () => {
  const mstFirst = patchSnapshot(new Map(), [value(10)], { source: 'mst' }).data;
  const a = patchSnapshot(mstFirst, [value(14)]).data.get('009144');
  const biFirst = patchSnapshot(new Map(), [value(14)]).data;
  const b = patchSnapshot(biFirst, [value(10)], { source: 'mst' }).data.get('009144');
  assert.deepEqual(a.wgs, b.wgs); assert.deepEqual(a.sources, b.sources);
  assert.equal(b.wgs.DBCANTRA.P2, 10);
  const fallback = patchSnapshot(new Map([['009144', b]]), [value(0)], { source: 'mst' }).data;
  assert.equal(fallback.get('009144').wgs.DBCANTRA.P2, 14);
});

test('description aliases merge to canonical code and preserve comments', () => {
  const source = new Map([['009144', { wgs: { Carnforth: { P2: 10 } }, comments: { Carnforth: 'Existing note' } }]]);
  const output = patchSnapshot(source, [value(14)], { resolveWorkGroupCode: v => v === 'Carnforth' ? 'DBCANTRA' : v }).data.get('009144');
  assert.deepEqual(Object.keys(output.wgs), ['DBCANTRA']);
  assert.equal(output.wgs.DBCANTRA.P2, 10);
  assert.match(output.comments.DBCANTRA, /Existing note/);
});

test('JSON backups restore only exported scope with validated source evidence', () => {
  const source = patchSnapshot(new Map(), [value(6), value(15, 'P13', 'DBCARTRA')]).data;
  const target = new Map([['9144', { wgs: { DBCANTRA: { P2: 6 } } }]]);
  restoreSources(target, source);
  assert.deepEqual(Object.keys(target.get('9144').sources), ['DBCANTRA']);
  assert.equal(target.get('9144').sources.DBCANTRA.waif.P2, 6);
  source.get('009144').sources.DBCANTRA.waif.P2 = -1;
  assert.throws(() => restoreSources(target, source), /non-negative/);
});
