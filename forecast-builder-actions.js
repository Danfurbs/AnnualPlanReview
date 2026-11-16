/* Pure V0 operations shared by Builder controls and regression tests. */
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./forecast-model') : root.ForecastModel);
  if (typeof module !== 'undefined') module.exports = api;
  if (root) root.ForecastBuilderActions = api;
})(typeof window === 'undefined' ? null : window, function (model) {
  const periods = model.periods;
  const clone = value => JSON.parse(JSON.stringify(value));
  function fingerprint(value) {
    return JSON.stringify(value, function (key, item) { return item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item; });
  }
  function total(job) {
    job.periods = Object.fromEntries(periods.map(p => [p, Object.values(job.wgs || {}).reduce((n, row) => n + (Number(row[p]) || 0), 0)]));
    return job;
  }
  function mergeDraft(stored, draft, resolve = value => value) {
    const job = clone(stored || { wgs: {}, comments: {} });
    job.wgs ||= {}; job.comments ||= {};
    for (const [code, row] of Object.entries(draft.rows)) {
      for (const key of new Set([...Object.keys(job.wgs), ...Object.keys(job.comments)])) {
        if ((resolve(key) || key) === code) { delete job.wgs[key]; delete job.comments[key]; }
      }
      if (draft.clearedWorkGroups.has(code)) continue;
      job.wgs[code] = Object.fromEntries(periods.map(p => {
        const value = model.parseCell(row.periods[p]) ?? 0;
        return [p, value];
      }));
      if (row.comment.trim()) job.comments[code] = row.comment;
    }
    return total(job);
  }
  function mergeDraftChanges(base, latest, draft, resolve) {
    const job = clone(latest || { wgs: {}, comments: {} }), conflicts = [];
    job.wgs ||= {}; job.comments ||= {};
    for (const [code, row] of Object.entries(draft.rows)) {
      const before = model.readWorkGroupForecast(base, code, resolve);
      const remote = model.readWorkGroupForecast(latest, code, resolve);
      const clearing = draft.clearedWorkGroups.has(code);
      const desired = { periods: Object.fromEntries(periods.map(p => [p, clearing ? 0 : model.parseCell(row.periods[p]) ?? 0])), comment: clearing ? '' : row.comment };
      const normalized = entry => ({ periods: Object.fromEntries(periods.map(p => [p, Number(entry.periods[p]) || 0])), comment: entry.comment });
      const old = normalized(before), current = normalized(remote);
      if (clearing) {
        if (!model.equal(old, current)) conflicts.push(`${code} (clear row)`);
        remote.keys.forEach(key => { delete job.wgs[key]; delete job.comments[key]; });
        continue;
      }
      if (model.equal(old, desired)) continue;
      const merged = model.mergeChanges(old, desired, current);
      conflicts.push(...merged.conflicts.map(path => `${code}.${path}`));
      remote.keys.forEach(key => { delete job.wgs[key]; delete job.comments[key]; });
      job.wgs[code] = merged.value.periods;
      if (merged.value.comment.trim()) job.comments[code] = merged.value.comment;
    }
    return { job: total(job), conflicts };
  }
  function clearScope(source, includes) {
    const result = new Map(); let count = 0;
    source.forEach((original, key) => {
      const job = clone(original);
      let removed = false;
      for (const wg of new Set([...Object.keys(job.wgs || {}), ...Object.keys(job.comments || {})])) {
        if (includes(wg)) { delete job.wgs?.[wg]; delete job.comments?.[wg]; count++; removed = true; }
      }
      if (!removed) result.set(key, job);
      else if (Object.keys(job.wgs || {}).length || Object.keys(job.comments || {}).length) result.set(key, total(job));
    });
    return { data: result, count };
  }
  function exportRows(source, year, includes = () => true) {
    const rows = [];
    source.forEach((job, key) => {
      for (const wg of new Set([...Object.keys(job.wgs || {}), ...Object.keys(job.comments || {})])) {
        if (!includes(wg)) continue;
        rows.push({ 'Strategic Route': '', WGST: wg, 'Financial Year': /^FY\d{2}$/.test(year) ? `20${year.slice(2)}` : year.replace(/^FY/, ''),
          'Standard Job': key, 'SJN and Desc': '', 'Account Code': 'XXXX',
          ...Object.fromEntries(periods.map((p, i) => [`P${String(i + 1).padStart(2, '0')}`, job.wgs?.[wg]?.[p] ?? ''])),
          Comment: job.comments?.[wg] || '' });
      }
    });
    return rows;
  }
  function importRows(rows, year, resolve = value => value) {
    if (!rows.length) throw new Error('The file has no forecast rows.');
    const result = new Map();
    rows.forEach((row, index) => {
      const rowYear = String(row['Financial Year'] || '').replace(/^20/, 'FY');
      if (rowYear !== year) throw new Error(`Row ${index + 2}: Financial Year must be ${year}.`);
      const rawJob = String(row['Standard Job'] || '').trim();
      const wg = resolve(String(row.WGST || '').trim());
      if (!/^\d{1,6}$/.test(rawJob) || !wg) throw new Error(`Row ${index + 2}: valid Standard Job and Work Group Set required.`);
      const key = rawJob.padStart(6, '0'), job = result.get(key) || { wgs: {}, comments: {} };
      if (job.wgs[wg]) throw new Error(`Duplicate Standard Job / Work Group Set at row ${index + 2}.`);
      job.wgs[wg] = Object.fromEntries(periods.map((p, i) => {
        const heading = `P${String(i + 1).padStart(2, '0')}`;
        if (!(heading in row)) throw new Error(`Missing column ${heading}.`);
        let value;
        try { value = model.parseCell(row[heading]) ?? 0; }
        catch { throw new Error(`Row ${index + 2}: ${heading} must be finite and non-negative.`); }
        return [p, value];
      }));
      if (row.Comment) job.comments[wg] = String(row.Comment);
      result.set(key, total(job));
    });
    return result;
  }
  return { mergeDraft, mergeDraftChanges, clearScope, exportRows, importRows, fingerprint };
});
