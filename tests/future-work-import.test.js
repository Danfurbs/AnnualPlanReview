const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFutureWorkWorkbook, patchForecastSnapshot, normalizeJob, appendImportComment, readWorkGroupForecast } = require('../future-work-import');

const XLSX = { utils: { sheet_to_json: sheet => sheet.rows } };
const workbook = rows => ({ Sheets: { 'Period Summary': { rows } } });
const options = { XLSX, activeJobs: ['001234', '009999'], activeWorkGroups: ['WGA', 'WGB'], resolveWorkGroupCode: value => ({ 'Track team': 'WGA', WGA: 'WGA', WGB: 'WGB' })[String(value).trim()] || '' };
const headings = periods => [
  ['Work Group Set', 'Standard Job Number & Desc', ...periods.flatMap(period => [period, ''])],
  ['', '', ...periods.flatMap(() => ['Units Required', 'Hours Required'])]
];
const detailHeadings = ['Route', 'IMDM', 'Discipline', 'Engineer', 'Work Group Set', 'Work Group',
  'Cost Centre Code & Desc', 'MNT Code & Desc', 'Project Code & Description', 'Asset Number',
  'Asset Desc 1', 'Asset Desc 2', 'Structured Plant Number', 'ELR', 'Mileage From', 'Mileage To',
  'SRS Code & Description', 'MST Task Number', 'MST Description Line 1', 'MST Description Line 2',
  'Deleted?', 'Projected MST Date', 'MST Frequency', 'Work Order No', 'Work Order Desc',
  'Standard Job Unit of Work Code & Desc', 'Component Code & Desc', 'Component Modifier Code & Desc',
  'Track ID', 'Extended Text', 'Planned Start Date', 'Required Finish Date', 'Hours Required',
  'Defect Code & Desc', 'Standard Job Number & Desc', 'Units Required', 'Account Code',
  'Projected MST Date', 'Planned Start Date', 'Required Finish Date', 'Backlog Hours Required',
  'Backlog Units Required', 'Completed Period Number', 'Completed Week Number'];
const detailRow = (workGroup, job, period, units) => {
  const row = Array(44).fill('');
  row[4] = workGroup; row[5] = 'Different individual work group'; row[20] = 'Y';
  row[23] = '0'; row[32] = 900; row[34] = job; row[35] = units;
  row[40] = 800; row[41] = 700; row[42] = period; row[43] = 20;
  return row;
};
const detailWorkbook = rows => ({ Sheets: { Detail: { rows: [[], ['Selected Parameters: report'], [], [], [], detailHeadings, ...rows] } } });

test('standard report Detail at row 6 sums units by job, WG set and completed period, ignoring summaries and hours', () => {
  const book = detailWorkbook([
    detailRow('Track team', '1234 - Renew rail', 5, 2.5),
    detailRow('WGA', '001234 - Renew rail', '05', '1,200.25'),
    detailRow('WGB', '1234 - Renew rail', 5, 4),
    detailRow('WGA', '9999 - Inspect', 6, 3),
    detailRow('WGA', '1234 - Renew rail', 'P13', 0)
  ]);
  book.Sheets['Period Summary'] = { rows: [...headings(['P01']), ['WGA', '1234', 999999, 0]] };
  const result = parseFutureWorkWorkbook(book, options);
  assert.equal(result.sourceSheet, 'Detail');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.periods, ['P05', 'P06', 'P13']);
  assert.deepEqual(result.values, [
    { jobNumber: '001234', workGroup: 'WGA', period: 'P5', value: 1202.75 },
    { jobNumber: '001234', workGroup: 'WGB', period: 'P5', value: 4 },
    { jobNumber: '009999', workGroup: 'WGA', period: 'P6', value: 3 },
    { jobNumber: '001234', workGroup: 'WGA', period: 'P13', value: 0 }
  ]);
  assert.deepEqual(result.totals, { P05: 1206.75, P06: 3, P13: 0 });
  assert.equal(result.recognisedRows, 5);
  assert.equal(result.aggregatedRows, 1);
  assert.equal(result.duplicateRows, 0, 'repeated scheduled tasks are expected detail records');
  const patched = patchForecastSnapshot(new Map(), result.values).data;
  assert.deepEqual(patched.get('001234').wgs.WGA, { P5: 1202.75, P13: 0 });
  assert.equal(patched.get('001234').periods.P5, 1206.75);
});

test('Detail supports every forecast period, excludes unassigned backlog, and leaves blank units absent', () => {
  const rows = Array.from({ length: 13 }, (_, i) => detailRow('WGA', '1234 desc', i + 1, i));
  rows.push(...['', '-', 0].map(period => detailRow('WGA', '1234 desc', period, 100)));
  rows.push(...['', '-', ' '].map(units => detailRow('WGB', '1234 desc', 1, units)));
  const result = parseFutureWorkWorkbook(detailWorkbook(rows), options);
  assert.equal(result.values.length, 13);
  assert.equal(result.values[12].period, 'P13');
  assert.equal(result.values[0].value, 0);
  assert.equal(result.ignoredRows, 6);
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings[0], /3 Detail row.*no forecast period/);
});

test('Detail validates periods and units with actual worksheet row numbers and excludes unknown catalogue rows', () => {
  const result = parseFutureWorkWorkbook(detailWorkbook([
    detailRow('WGA', '1234', 14, 1), detailRow('WGA', '1234', 1, -2),
    detailRow('WGA', '1234', 2, 'bad'), detailRow('NOPE', '1234', 1, 5),
    detailRow('WGA', '777', 1, 5), detailRow('WGA', '1234', 'week 5', 1)
  ]), options);
  assert.equal(result.values.length, 0);
  assert.equal(result.errors.length, 4);
  assert.match(result.errors[0], /Row 7.*Completed Period Number/);
  assert.match(result.errors[1], /Row 8 P01.*negative/);
  assert.match(result.errors[2], /Row 9 P02.*malformed/);
  assert.equal(result.exceptions.length, 2);
  assert.equal(result.exceptions[0].row, 10);
});

test('invalid Detail blocks rather than silently falling back to Period Summary', () => {
  const book = workbook([...headings(['P01']), ['WGA', '1234', 99, 0]]);
  book.Sheets.Detail = { rows: [['Work Group Set', 'Units Required']] };
  assert.match(parseFutureWorkWorkbook(book, options).errors[0], /Missing required headings in Detail/);
});

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

test('import merges WG description aliases into the code while retaining unreported periods and comments', () => {
  const original = new Map([['001234', {
    wgs: { 'Track team': { P1: 4, P2: 7 }, WGB: { P1: 3 } },
    comments: { 'Track team': 'Existing note', WGB: 'Keep other WG' }
  }]]);
  const { data } = patchForecastSnapshot(original, [
    { jobNumber: '001234', workGroup: 'WGA', period: 'P1', value: 0 },
    { jobNumber: '001234', workGroup: 'WGA', period: 'P5', value: 35.2 }
  ], options);
  const patched = data.get('001234');
  assert.deepEqual(patched.wgs.WGA, { P1: 0, P2: 7, P5: 35.2 });
  assert.equal(patched.wgs['Track team'], undefined);
  assert.equal(patched.comments['Track team'], undefined);
  assert.equal(patched.comments.WGA, 'Existing note\nforecast via future work report');
  assert.equal(patched.comments.WGB, 'Keep other WG');
  assert.deepEqual(patched.periods, { P1: 3, P2: 7, P5: 35.2 });
  assert.deepEqual(original.get('001234').wgs['Track team'], { P1: 4, P2: 7 });
});

test('already imported code values display ahead of older description values regardless of key order', () => {
  for (const wgs of [
    { 'Track team': { P1: 4, P2: 7 }, WGA: { P1: 0, P5: 35.2 } },
    { WGA: { P1: 0, P5: 35.2 }, 'Track team': { P1: 4, P2: 7 } }
  ]) {
    const job = { wgs, comments: { 'Track team': 'Existing note', WGA: 'forecast via future work report' } };
    const row = readWorkGroupForecast(job, 'WGA', options.resolveWorkGroupCode);
    assert.deepEqual(row.periods, { P1: 0, P2: 7, P5: 35.2 });
    assert.equal(row.comment, 'Existing note\nforecast via future work report');
    const { data } = patchForecastSnapshot(new Map([['001234', job]]), [
      { jobNumber: '001234', workGroup: 'WGA', period: 'P6', value: 2 }
    ], options);
    assert.deepEqual(data.get('001234').wgs, { WGA: { P1: 0, P2: 7, P5: 35.2, P6: 2 } });
    assert.deepEqual(data.get('001234').periods, { P1: 0, P2: 7, P5: 35.2, P6: 2 });
  }
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
