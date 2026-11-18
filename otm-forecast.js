/* OTM input validation and scoped V0 application. No storage or DOM side effects. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./forecast-model') : root.ForecastModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OtmForecast = api;
})(typeof window === 'undefined' ? null : window, function (model) {
  const JOBS = ['009112', '009113', '009128', '009122'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const validNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  const total = values => model.periods.reduce((n, p) => n + (values?.[p] ?? 0), 0);
  function outputs(plan) {
    if (!validNumber(plan.rate)) throw new Error('Enter a finite, non-negative output rate.');
    return Object.fromEntries(model.periods.map(p => {
      if (!validNumber(plan.shifts?.[p])) throw new Error(`Enter shifts for ${p}; use 0 for a confirmed zero.`);
      const n = plan.shifts[p] * plan.rate;
      if (!Number.isFinite(n)) throw new Error('Calculated output is too large.');
      // Keep practical decimal precision without rounding fractional output to whole units.
      return [p, Number(n.toFixed(6))];
    }));
  }
  function validateEvidence(evidence) {
    const plan = evidence.otmPlan;
    if (!['otmPlan', 'otm', 'otmManual'].some(k => Object.hasOwn(evidence, k))) return null;
    if (!plain(plan) || Object.keys(plan).some(k => !['engineerId', 'rate', 'shifts'].includes(k)) ||
        typeof plan.engineerId !== 'string' || !plan.engineerId.trim() || plan.engineerId.length > 150 || !plain(plan.shifts)) return 'Invalid OTM inputs.';
    if (Object.keys(plan.shifts).some(p => !model.periods.includes(p))) return 'Invalid OTM shift period.';
    let expected;
    try { expected = outputs(plan); } catch (error) { return error.message; }
    if (!plain(evidence.otm) || Object.keys(evidence.otm).length !== 13 || model.periods.some(p => evidence.otm[p] !== expected[p])) return 'OTM outputs must match saved shifts and output rate.';
    if (evidence.otmManual !== undefined && (!plain(evidence.otmManual) || Object.entries(evidence.otmManual).some(([p,v]) => !model.periods.includes(p) || !validNumber(v)))) return 'Invalid OTM previous manual values.';
    return null;
  }
  function entries(source) { return new Map([...source].map(([key, job]) => [model.extractJobNumber(key), { key, job }])); }
  function scoped(source, groups, resolve) {
    const own = new Set(groups.map(g => model.workGroupIdentity(g, resolve))), data = entries(source);
    return JOBS.map(number => {
      const job = data.get(number)?.job || {}, rows = {};
      const codes = new Set([...Object.keys(job.wgs || {}), ...Object.keys(job.sources || {})]);
      [...codes].sort().forEach(code => {
        const canonical = model.workGroupIdentity(code, resolve);
        if (own.has(canonical)) rows[code] = { periods: job.wgs?.[code] || {}, evidence: job.sources?.[code] || {} };
      });
      return { jobNumber: number, rows };
    });
  }
  function plans(source, groups, resolve) {
    const data = entries(source), own = new Set(groups.map(g => model.workGroupIdentity(g, resolve)));
    return JOBS.map(jobNumber => {
      const job = data.get(jobNumber)?.job || {};
      const saved = Object.entries(job.sources || {}).filter(([code, e]) => own.has(model.workGroupIdentity(code, resolve)) && e.otmPlan);
      if (saved.length > 1) throw new Error(`SJN ${Number(jobNumber)} has multiple saved OTM allocations in this Engineer. Review its Work Group Sets before continuing.`);
      const [code, evidence] = saved[0] || [];
      return { jobNumber, enabled: Boolean(evidence), workGroup: code ? model.workGroupIdentity(code, resolve) : groups[0] || '',
        rate: evidence?.otmPlan.rate ?? null, shifts: clone(evidence?.otmPlan.shifts || {}) };
    });
  }
  function row(job, code, resolve) {
    job.wgs ||= {}; job.sources ||= {}; job.comments ||= {};
    const found = model.readWorkGroupForecast(job, code, resolve);
    const aliases = new Set([...found.keys, ...Object.keys(job.sources).filter(k => model.workGroupIdentity(k, resolve) === code)]);
    const evidence = Object.assign({}, ...[...aliases].map(k => job.sources[k] || {}));
    aliases.forEach(k => { delete job.wgs[k]; delete job.sources[k]; delete job.comments[k]; });
    job.wgs[code] = { ...found.periods }; job.sources[code] = evidence;
    if (found.comment) job.comments[code] = found.comment;
    return evidence;
  }
  function apply(source, inputPlans, options) {
    const { engineerId, workGroups, resolve } = options;
    const own = new Set(workGroups.map(g => model.workGroupIdentity(g, resolve)));
    if (!engineerId || !own.size) throw new Error('Select an Engineer with Work Group Sets.');
    const data = new Map([...source].map(([key, job]) => [key, clone(job)])), lookup = entries(data), seen = new Set();
    for (const plan of inputPlans) {
      const number = model.extractJobNumber(plan.jobNumber);
      if (!JOBS.includes(number) || seen.has(number)) throw new Error('Invalid or duplicate OTM Standard Job.');
      seen.add(number);
      const code = model.workGroupIdentity(plan.workGroup, resolve);
      const output = plan.enabled ? outputs(plan) : null;
      if (plan.enabled && !own.has(code)) throw new Error('Choose a Work Group Set owned by the selected Engineer.');
      const existing = lookup.get(number), job = existing?.job || { wgs: {}, comments: {}, sources: {} };
      // Release previous OTM allocations for this Engineer/job, using refreshed sources.
      for (const oldCode of Object.keys(job.sources || {})) {
        const canonical = model.workGroupIdentity(oldCode, resolve);
        if (!own.has(canonical) || !job.sources[oldCode].otm) continue;
        const e = row(job, canonical, resolve);
        for (const p of Object.keys(e.otm)) {
          const fallback = e.otmManual?.[p] ?? (e.mst?.[p] > 0 ? e.mst[p] : e.waif?.[p] ?? e.mst?.[p] ?? 0);
          job.wgs[canonical][p] = fallback;
          (e.applied ||= {})[p] = e.mst?.[p] > 0 ? e.mst[p] : e.waif?.[p] ?? e.mst?.[p] ?? 0;
        }
        delete e.otm; delete e.otmPlan; delete e.otmManual;
      }
      if (plan.enabled) {
        const e = row(job, code, resolve); e.mst ||= {}; e.waif ||= {}; e.applied ||= {}; e.otmManual = {};
        for (const p of model.periods) {
          const current = job.wgs[code][p] ?? 0;
          if (Object.hasOwn(e.applied, p) && current !== e.applied[p]) e.otmManual[p] = current;
          if (!Object.hasOwn(e.mst, p)) e.mst[p] = current;
          job.wgs[code][p] = output[p]; e.applied[p] = output[p];
        }
        e.otm = output;
        e.otmPlan = { engineerId, rate: plan.rate, shifts: clone(plan.shifts) };
      }
      if (existing || plan.enabled) {
        job.periods = Object.fromEntries(model.periods.map(p => [p, Object.values(job.wgs).reduce((n, values) => n + (values[p] ?? 0), 0)]));
        data.set(existing?.key || number, job);
      }
    }
    return data;
  }
  function parseRows(rows) {
    const seen = new Set();
    return rows.map((r, i) => {
      const jobNumber = model.extractJobNumber(r.sjn), rawPeriod = String(r.period ?? '').replace(/^P/i, ''), period = `P${Number(rawPeriod)}`;
      if (!/^\d{1,6}$/.test(String(r.sjn ?? '').trim()) || !JOBS.includes(jobNumber) || !/^(?:0?[1-9]|1[0-3])$/.test(rawPeriod) || !model.periods.includes(period)) throw new Error(`Row ${i+2}: use a supported OTM SJN and period 1–13.`);
      const shifts = model.parseCell(r.shifts), key = jobNumber+'|'+period;
      if (seen.has(key)) throw new Error(`Row ${i+2}: duplicate job / period.`);
      seen.add(key); return { jobNumber, period, shifts };
    });
  }
  return { JOBS, outputs, total, plans, scoped, apply, parseRows, validateEvidence };
});
