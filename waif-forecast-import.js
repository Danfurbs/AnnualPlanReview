/* Historical total predictions are evidence, never an additive forecast source. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./forecast-model') : root.ForecastModel,
    typeof module === 'object' && module.exports ? require('./otm-forecast') : root.OtmForecast);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WaifForecastImport = api;
})(typeof window === 'undefined' ? globalThis : window, function (model, otm) {
  const text = value => String(value ?? '').trim();
  const clone = value => JSON.parse(JSON.stringify(value));
  function parseCsv(input, options = {}) {
    const csv = String(input).replace(/^\uFEFF/, '');
    const firstLine = csv.split(/\r?\n/)[0];
    const delimiter = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < csv.length; i++) {
      const char = csv[i];
      if (char === '"') {
        if (quoted && csv[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && char === delimiter) { row.push(cell); cell = ''; }
      else if (!quoted && (char === '\n' || char === '\r')) {
        row.push(cell); rows.push(row); row = []; cell = '';
        if (char === '\r' && csv[i + 1] === '\n') i++;
      } else cell += char;
    }
    row.push(cell); rows.push(row);
    const result = parseRows(rows, options);
    if (quoted) result.errors.push('The CSV contains an unclosed quoted field.');
    return result;
  }
  function parseRows(rows, options = {}) {
    const result = { values: [], errors: [], warnings: [], exceptions: [], recognisedRows: 0, ignoredRows: 0, aggregatedRows: 0, periods: [], totals: {} };
    const header = (rows[0] || []).map(value => text(value).replace(/^\uFEFF/, '').replace(/\s+/g, ' ').toLowerCase());
    const required = ['work group set code', 'std job number', 'work order closed period'];
    const columns = required.map(name => header.indexOf(name));
    const volumes = header.map((name, index) => /^average yearly volume\s*\(/.test(name) ? index : -1).filter(index => index >= 0);
    if (columns.some(index => index < 0) || volumes.length !== 1) {
      result.errors.push('Required columns: Work Group Set Code, Std Job Number, Work Order Closed Period, and one Average Yearly Volume (...) column.');
      return result;
    }
    result.volumeHeading = text(rows[0][volumes[0]]);
    const jobs = new Set(Array.from(options.activeJobs || [], model.extractJobNumber));
    const groups = new Set(Array.from(options.activeWorkGroups || [], value => text(value).toUpperCase()));
    const resolve = options.resolveWorkGroupCode || (value => value);
    const values = new Map();
    rows.slice(1).forEach((row, offset) => {
      if (row.every(value => !text(value))) return;
      const rowNumber = offset + 2, rawJob = text(row[columns[1]]);
      const jobNumber = /^\d{1,6}$/.test(rawJob) ? model.extractJobNumber(rawJob) : '';
      const workGroup = text(resolve(text(row[columns[0]]))).toUpperCase();
      if (!jobNumber || (jobs.size && !jobs.has(jobNumber)) || !workGroup || (groups.size && !groups.has(workGroup))) {
        result.exceptions.push(`Row ${rowNumber}: unknown Standard Job or Work Group Set (${rawJob} / ${text(row[columns[0]])}).`);
        result.ignoredRows++; return;
      }
      const rawPeriod = text(row[columns[2]]);
      if (!/^(?:P)?(0?[1-9]|1[0-3])$/i.test(rawPeriod)) {
        result.errors.push(`Row ${rowNumber}: Work Order Closed Period must be 1-13.`); return;
      }
      const rawValue = row[volumes[0]];
      if (!text(rawValue) || text(rawValue) === '-') { result.ignoredRows++; return; }
      let value;
      try { value = model.parseCell(typeof rawValue === 'number' ? rawValue : text(rawValue).replace(/,/g, '')); }
      catch { result.errors.push(`Row ${rowNumber}: average volume must be a finite, non-negative number.`); return; }
      const period = `P${Number(rawPeriod.replace(/^P/i, ''))}`, key = `${jobNumber}|${workGroup}|${period}`;
      if (values.has(key)) result.aggregatedRows++;
      values.set(key, { jobNumber, workGroup, period, value: (values.get(key)?.value || 0) + value });
      result.recognisedRows++;
    });
    result.values = [...values.values()];
    result.values.forEach(item => { result.totals[item.period] = (result.totals[item.period] || 0) + item.value; });
    result.periods = Object.keys(result.totals).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    if (result.aggregatedRows) result.warnings.push(`${result.aggregatedRows} repeated job / Work Group / period rows were summed across report categories.`);
    if (result.exceptions.length) result.warnings.push(`${result.exceptions.length} unknown catalogue rows will be excluded.`);
    return result;
  }
  function patchSnapshot(source, values, options = {}) {
    const data = new Map(Array.from(source || [], ([key, value]) => [key, clone(value)]));
    const type = options.source || 'waif', affected = new Set();
    const jobKeys = new Map([...data.keys()].map(key => [model.extractJobNumber(key), key]));
    const changedJobs = new Set();
    if (!['mst', 'waif'].includes(type)) throw new Error('Invalid forecast source.');
    values.forEach(item => {
      const key = jobKeys.get(item.jobNumber) || item.jobNumber;
      jobKeys.set(item.jobNumber, key);
      const job = data.get(key) || { periods: {}, wgs: {}, comments: {} };
      job.wgs ||= {}; job.comments ||= {}; job.sources ||= {};
      const existing = model.readWorkGroupForecast(job, item.workGroup, options.resolveWorkGroupCode);
      const aliases = [...new Set([...existing.keys, ...Object.keys(job.sources).filter(code => model.workGroupIdentity(code, options.resolveWorkGroupCode) === item.workGroup)])];
      const evidence = Object.assign({ mst: {}, waif: {}, applied: {} }, ...aliases.map(alias => job.sources[alias] || {}));
      const current = Number(existing.periods[item.period]) || 0;
      const tracked = Object.hasOwn(evidence.applied, item.period);
      // Existing V0 values have no source provenance: protect them as planned work.
      if (!Object.hasOwn(evidence.mst, item.period)) evidence.mst[item.period] = current;
      evidence[type][item.period] = item.value;
      const controlled = evidence.otm && Object.hasOwn(evidence.otm, item.period);
      const automatic = controlled ? evidence.otm[item.period] : evidence.mst[item.period] > 0 ? evidence.mst[item.period] : (evidence.waif[item.period] || 0);
      const manual = tracked && current !== evidence.applied[item.period];
      const next = controlled ? automatic : manual ? current : automatic;
      evidence.applied[item.period] = manual && !controlled ? evidence.applied[item.period] : next;
      aliases.forEach(alias => { delete job.wgs[alias]; delete job.comments[alias]; delete job.sources[alias]; });
      job.sources[item.workGroup] = evidence;
      job.wgs[item.workGroup] = { ...existing.periods, [item.period]: next };
      const note = type === 'waif' ? 'WAIF forecast: historical total prediction; overlaps require engineer review.' : 'forecast via future work report';
      job.comments[item.workGroup] = existing.comment.split('\n').includes(note) ? existing.comment : [existing.comment, note].filter(Boolean).join('\n');
      data.set(key, job); changedJobs.add(key); affected.add(`${item.jobNumber}|${item.workGroup}`);
    });
    changedJobs.forEach(key => {
      const job = data.get(key);
      job.periods = Object.fromEntries(model.periods.map(period => [period, Object.values(job.wgs).reduce((total, row) => total + (Number(row[period]) || 0), 0)]));
    });
    return { data, affected };
  }
  function restoreSources(target, source, resolve) {
    const entries = new Map([...source].map(([key, entry]) => [model.extractJobNumber(key), entry]));
    target.forEach((job, key) => {
      const original = entries.get(model.extractJobNumber(key));
      Object.entries(original?.sources || {}).forEach(([code, evidence]) => {
        const canonical = model.workGroupIdentity(code, resolve);
        if (!Object.hasOwn(job.wgs, canonical)) return;
        const clean = {};
        Object.entries(evidence).forEach(([name, periods]) => {
          if (name === 'otmPlan') { clean[name] = clone(periods); return; }
          if (!['mst', 'waif', 'applied', 'otm', 'otmManual'].includes(name) || !periods || typeof periods !== 'object' || Array.isArray(periods)) throw new Error('Invalid source evidence in JSON.');
          clean[name] = {};
          Object.entries(periods).forEach(([period, value]) => {
            if (!model.periods.includes(period) || typeof value !== 'number') throw new Error('Invalid source period or volume in JSON.');
            clean[name][period] = model.parseCell(value);
          });
        });
        const error = otm?.validateEvidence(clean);
        if (error) throw new Error(error);
        if (clean.otm && (!otm?.JOBS.includes(model.extractJobNumber(key)) || Object.entries(clean.otm).some(([p, v]) => job.wgs[canonical][p] !== v))) throw new Error('OTM source does not match the exported job forecast.');
        (job.sources ||= {})[canonical] = clean;
      });
    });
    return target;
  }
  return { parseRows, parseCsv, patchSnapshot, restoreSources };
});
