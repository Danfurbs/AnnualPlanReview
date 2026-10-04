const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFutureWorkWorkbook, patchForecastSnapshot, normalizeJob, appendImportComment } = require('../future-work-import');

const XLSX = { utils: { sheet_to_json: sheet => sheet.rows } };
const workbook = rows => ({ Sheets: { 'Period Summary': { rows } } });
const options = { XLSX, activeJobs: ['001234', '009999'], activeWorkGroups: ['WGA', 'WGB'], resolveWorkGroupCode: value => ({ 'Track team': 'WGA', WGA: 'WGA', WGB: 'WGB' })[String(value).trim()] || '' };
const headings = periods => [
  ['Work Group Set', 'Standard Job Number & Desc', ...periods.flatMap(period => [period, ''])],
  ['', '', ...periods.flatMap(() => ['Units Required', 'Hours Required'])]
];

test('requires Period Summary and required multi-row headings', () => {
  assert.match(parseFutureWorkWorkbook({ Sheets: {} }, options).errors[0], /Period Summary/);
  assert.match(parseFutureWorkWorkbook(workbook([['wrong']]), options).errors[0], /Missing required headings/);
});

test('discovers P05-P13, selects units, ignores hours, normalises catalogues, and aggregates duplicates', () => {
  const periods = Array.from({ length: 9 }, (_, index) => `P${String(index + 5).padStart(2, '0')}`);
  const row = (units, hours) => ['Track team', '1234 - Renew rail', ...periods.flatMap((_, i) => [i === 0 ? units : '', hours])];
  const result = parseFutureWorkWorkbook(workbook([...headings(periods), row(2, 900), row(3, 800)]), options);
  assert.deepEqual(result.periods, periods);
  assert.deepEqual(result.values, [{ jobNumber: '001234', workGroup: 'WGA', period: 'P5', value: 5 }]);
  assert.equal(result.duplicateRows, 1);
  assert.equal(result.errors.length, 0);
});

test('supports all thirteen periods, blanks and dashes are absent, and zero is explicit', () => {
  const periods = Array.from({ length: 13 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
  const cells = periods.flatMap((_, i) => [i === 0 ? 0 : i === 1 ? '-' : ' ', 50]);
  const result = parseFutureWorkWorkbook(workbook([...headings(periods), ['WGA', '001234 desc', ...cells]]), options);
  assert.deepEqual(result.values, [{ jobNumber: '001234', workGroup: 'WGA', period: 'P1', value: 0 }]);
});

test('unknown catalogues are exceptions while malformed and negative units block', () => {
  const rows = [...headings(['P01']), ['NOPE', '777 unknown', 4, 1], ['WGA', '1234 ok', 'abc', 2], ['WGA', '1234 ok', -1, 2]];
  const result = parseFutureWorkWorkbook(workbook(rows), options);
  assert.equal(result.exceptions.length, 1);
  assert.equal(result.values.length, 0);
  assert.equal(result.errors.length, 2);
});

test('job extraction and exact comment rules', () => {
  assert.equal(normalizeJob('123 - Description'), '000123');
  assert.equal(appendImportComment(''), 'forecast via future work report');
  assert.equal(appendImportComment('Existing'), 'Existing\nforecast via future work report');
  assert.equal(appendImportComment('Existing\n forecast via future work report '), 'Existing\n forecast via future work report ');
});

test('patch replaces only reported cells, preserves other jobs/WGS, applies zero, and recalculates aggregate', () => {
  const original = new Map([
    ['001234', { periods: { P1: 13, P2: 9 }, wgs: { WGA: { P1: 10, P2: 7 }, WGB: { P1: 3, P2: 2 } }, comments: { WGA: 'Existing' }, amendments: { retained: true } }],
    ['009999', { periods: { P1: 8 }, wgs: { WGA: { P1: 8 } }, comments: {} }]
  ]);
  const { data } = patchForecastSnapshot(original, [{ jobNumber: '001234', workGroup: 'WGA', period: 'P1', value: 0 }]);
  assert.equal(data.get('001234').wgs.WGA.P1, 0);
  assert.equal(data.get('001234').wgs.WGA.P2, 7);
  assert.deepEqual(data.get('001234').wgs.WGB, { P1: 3, P2: 2 });
  assert.deepEqual(data.get('001234').periods, { P1: 3, P2: 9 });
  assert.deepEqual(data.get('001234').amendments, { retained: true });
  assert.equal(data.get('001234').comments.WGA, 'Existing\nforecast via future work report');
  assert.deepEqual(data.get('009999'), original.get('009999'));
  assert.equal(original.get('001234').wgs.WGA.P1, 10, 'source snapshot is not mutated');
});
