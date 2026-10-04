/** Parse and patch Future Work reports without mutating application state. */
(function initialiseFutureWorkImport(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FutureWorkImport = api;
})(typeof window !== 'undefined' ? window : globalThis, function futureWorkImportFactory() {
  const PERIOD_RE = /\bP(0?[1-9]|1[0-9])\b/i;
  const COMMENT = 'forecast via future work report';
  const text = value => String(value ?? '').trim();
  const normalizeJob = value => {
    const match = text(value).match(/^(?:\D*?)(\d+)/);
    return match ? match[1].replace(/^0+(?=\d)/, '').padStart(6, '0') : '';
  };
  const canonicalPeriod = value => {
    const match = text(value).match(PERIOD_RE);
    return match ? `P${Number(match[1]).toString().padStart(2, '0')}` : '';
  };
  const clone = value => JSON.parse(JSON.stringify(value || {}));
  const standaloneComment = value => text(value).split(/\r?\n/).some(line => line.trim() === COMMENT);
  function appendImportComment(value) {
    const current = String(value || '');
    if (standaloneComment(current)) return current;
    return current.trim() ? `${current}\n${COMMENT}` : COMMENT;
  }

  function decodeHeadings(rows) {
    const limit = Math.min(rows.length, 20);
    for (let end = 0; end < limit; end += 1) {
      const carried = [];
      const headings = [];
      const width = Math.max(...rows.slice(0, end + 1).map(row => row.length), 0);
      for (let r = 0; r <= end; r += 1) {
        let carry = '';
        for (let c = 0; c < width; c += 1) {
          const cell = text(rows[r]?.[c]);
          if (cell) carry = cell;
          (carried[c] ||= []).push(cell || carry);
        }
      }
      for (let c = 0; c < width; c += 1) headings[c] = [...new Set(carried[c].filter(Boolean))].join(' | ');
      const workGroup = headings.findIndex(h => /\bWork Group Set\b/i.test(h));
      const job = headings.findIndex(h => /\bStandard Job (?:Number & Desc|No)\b/i.test(h));
      const unitColumns = headings.map((heading, index) => ({ heading, index, period: canonicalPeriod(heading) }))
        .filter(column => column.period && /Units Required/i.test(column.heading) && !/Hours Required/i.test(column.heading));
      if (workGroup >= 0 && job >= 0 && unitColumns.length) return { headerRow: end, headings, workGroup, job, unitColumns };
    }
    return null;
  }

  function parseFutureWorkWorkbook(workbook, options = {}) {
    const result = { fileName: options.fileName || '', periods: [], values: [], recognisedRows: 0, ignoredRows: 0, duplicateRows: 0, totals: {}, warnings: [], errors: [], exceptions: [] };
    const sheet = workbook?.Sheets?.['Period Summary'];
    if (!sheet) { result.errors.push('Missing required worksheet “Period Summary”.'); return result; }
    const xlsx = options.XLSX || (typeof window !== 'undefined' && window.XLSX);
    if (!xlsx?.utils?.sheet_to_json) { result.errors.push('The XLSX reader is unavailable.'); return result; }
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    const decoded = decodeHeadings(rows);
    if (!decoded) { result.errors.push('Missing required headings: Work Group Set, Standard Job Number & Desc, and at least one P01–P13 Units Required column.'); return result; }
    const unsupported = decoded.unitColumns.filter(column => Number(column.period.slice(1)) > 13);
    if (unsupported.length) result.errors.push(`Unsupported period column(s): ${unsupported.map(x => x.period).join(', ')}.`);
    const columns = decoded.unitColumns.filter(column => Number(column.period.slice(1)) <= 13);
    result.periods = [...new Set(columns.map(column => column.period))].sort();
    const activeJobs = new Set(Array.from(options.activeJobs || [], normalizeJob));
    const activeWorkGroups = new Set(Array.from(options.activeWorkGroups || [], value => text(value).toUpperCase()));
    const resolve = options.resolveWorkGroupCode || (value => text(value).toUpperCase());
    const aggregated = new Map();
    rows.slice(decoded.headerRow + 1).forEach((row, offset) => {
      const sourceRow = decoded.headerRow + offset + 2;
      if (row.every(value => !text(value))) return;
      const job = normalizeJob(row[decoded.job]);
      const workGroup = text(resolve(row[decoded.workGroup])).toUpperCase();
      const unknownJob = !job || (activeJobs.size && !activeJobs.has(job));
      const unknownWgs = !workGroup || (activeWorkGroups.size && !activeWorkGroups.has(workGroup));
      if (unknownJob || unknownWgs) {
        result.ignoredRows += 1;
        result.exceptions.push({ row: sourceRow, job: job || text(row[decoded.job]), workGroup: workGroup || text(row[decoded.workGroup]), reasons: [unknownJob ? 'Unknown Standard Job' : '', unknownWgs ? 'Unknown Work Group Set' : ''].filter(Boolean) });
        return;
      }
      let recognised = false;
      columns.forEach(column => {
        const raw = row[column.index];
        const valueText = text(raw);
        if (!valueText || /^[-–—]$/.test(valueText)) return;
        const value = typeof raw === 'number' ? raw : Number(valueText.replace(/,/g, ''));
        if (!Number.isFinite(value) || value < 0) {
          result.errors.push(`Row ${sourceRow} ${column.period}: ${value < 0 ? 'negative' : 'malformed'} Units Required value “${valueText}”.`);
          return;
        }
        recognised = true;
        const storagePeriod = `P${Number(column.period.slice(1))}`;
        const key = `${job}|${workGroup}|${storagePeriod}`;
        if (aggregated.has(key)) result.duplicateRows += 1;
        aggregated.set(key, (aggregated.get(key) || 0) + value);
      });
      if (recognised) result.recognisedRows += 1; else result.ignoredRows += 1;
    });
    result.values = Array.from(aggregated, ([key, value]) => { const [jobNumber, workGroup, period] = key.split('|'); return { jobNumber, workGroup, period, value }; });
    result.values.forEach(item => { const displayPeriod = `P${Number(item.period.slice(1)).toString().padStart(2, '0')}`; result.totals[displayPeriod] = (result.totals[displayPeriod] || 0) + item.value; });
    if (result.duplicateRows) result.warnings.push(`${result.duplicateRows} duplicate value(s) were aggregated.`);
    if (result.exceptions.length) result.warnings.push(`${result.exceptions.length} row(s) contain unknown catalogue values and will be excluded.`);
    return result;
  }

  function patchForecastSnapshot(source, values) {
    const patched = new Map(Array.from(source || [], ([key, value]) => [key, clone(value)]));
    const affected = new Set();
    values.forEach(item => {
      let key = Array.from(patched.keys()).find(candidate => normalizeJob(candidate) === item.jobNumber) || item.jobNumber;
      const job = patched.get(key) || { periods: {}, wgs: {}, comments: {} };
      job.wgs ||= {}; job.comments ||= {};
      const wgsKey = Object.keys(job.wgs).find(candidate => text(candidate).toUpperCase() === item.workGroup) || item.workGroup;
      job.wgs[wgsKey] = { ...(job.wgs[wgsKey] || {}), [item.period]: item.value };
      const commentKey = Object.keys(job.comments).find(candidate => text(candidate).toUpperCase() === item.workGroup) || item.workGroup;
      job.comments[commentKey] = appendImportComment(job.comments[commentKey]);
      patched.set(key, job); affected.add(`${item.jobNumber}|${item.workGroup}`);
    });
    new Set(values.map(item => item.jobNumber)).forEach(jobNumber => {
      const key = Array.from(patched.keys()).find(candidate => normalizeJob(candidate) === jobNumber);
      const job = patched.get(key); job.periods = {};
      Object.values(job.wgs || {}).forEach(periods => Object.entries(periods || {}).forEach(([period, value]) => {
        if (/^P(?:0?[1-9]|1[0-3])$/.test(period)) job.periods[period] = (job.periods[period] || 0) + (Number(value) || 0);
      }));
    });
    return { data: patched, affected };
  }
  return { COMMENT, normalizeJob, decodeHeadings, parseFutureWorkWorkbook, appendImportComment, patchForecastSnapshot };
});
