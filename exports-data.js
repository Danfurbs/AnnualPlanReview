/* Shared report datasets: no DOM or downloads, so previews and workbooks agree. */
(function (root) {
  'use strict';
  const periods = Array.from({ length: 13 }, (_, i) => `P${i + 1}`);
  const number = value => Number(value || 0);
  const jobKey = value => String(value).padStart(6, '0');
  function* build(input, scope, filters = {}, report = null) {
    const wants = id => !report || report === id || report === 'top10' && id === 'performance';
    const aliases = new Map(), organisations = new Map();
    const normalise = value => { if (!aliases.has(value)) aliases.set(value, input.normalise ? input.normalise(value) : value); return aliases.get(value); };
    const organisation = code => { if (!organisations.has(code)) organisations.set(code, input.organisation(code)); return organisations.get(code); };
    const memberSet = filters.members ? new Set(filters.members.map(jobKey)) : null;
    const mapped = map => new Map([...map || []].map(([key, value]) => [jobKey(key), value]));
    const v0 = mapped(input.v0), v1 = mapped(input.v1), done = mapped(input.done), catalogue = mapped(input.catalogue);
    const comments = new Map(Object.entries(input.comments || {}).map(([key, entries]) => [jobKey(key), entries]));
    const groups = job => {
      const result = {};
      Object.entries(job?.wgs || {}).forEach(([key, values]) => {
        const code = normalise(key);
        result[code] = { ...result[code], ...values };
      });
      return result;
    };
    const allowed = code => {
      const org = organisation(code);
      if (scope.du !== 'all' && org?.deliveryUnit?.id !== scope.du) return false;
      if (scope.scale === 'engineer') return org?.engineer?.id === scope.target;
      if (scope.scale === 'workgroup') return code === normalise(scope.target);
      return true;
    };
    const available = input.cutoff !== null && (input.cutoff === 0 || input.hasWorkDone) && !input.correctionsError;
    const rag = (forecast, projected) => {
      if (projected === null) return 'Unavailable';
      const ratio = forecast ? Math.abs(projected - forecast) / Math.abs(forecast) : projected ? Infinity : 0;
      return ratio >= 0.5 ? 'Red' : ratio >= 0.1 ? 'Amber' : 'Green';
    };
    const datasets = { performance: [], periods: [], comparison: [], comments: [], orders: [], coverage: [], reviews: [], top10: [] };
    const coverage = new Map();
    (input.groupCodes || []).filter(allowed).forEach(code => coverage.set(code, { original: new Set(), latest: new Set() }));
    const all = new Set([...v0.keys(), ...v1.keys(), ...done.keys(), ...comments.keys()]);
    let processed = 0;
    for (const sjn of [...all].sort()) {
      if (processed++ % 25 === 0) yield;
      const meta = catalogue.get(sjn) || {};
      const original = groups(v0.get(sjn)), overrides = groups(v1.get(sjn)), workDone = groups(done.get(sjn));
      const codes = [...new Set([...Object.keys(original), ...Object.keys(overrides), ...Object.keys(workDone)])].filter(allowed);
      const scopedComments = (comments.get(sjn) || []).filter(entry => {
        if ((entry.fy || entry.financialYear) !== input.year) return false;
        if (input.commentScope) return input.commentScope(entry, { deliveryUnitId: scope.du, engineerId: scope.scale === 'engineer' ? scope.target : 'all', workGroupCode: scope.scale === 'workgroup' ? scope.target : 'all' });
        const org = input.commentOrganisation(entry);
        const code = normalise(entry.filteredWorkGroup || '');
        if (code) return allowed(code);
        return scope.scale === 'du' && (scope.du === 'all' || org?.deliveryUnit?.id === scope.du);
      });
      if (!codes.length && !scopedComments.length) continue;
      const record = input.reviews?.[sjn]?.[input.year]?.[input.stage];
      const reviewed = record === true || Boolean(record?.reviewedAt);
      const base = { 'Standard Job No': sjn, Description: meta.desc || '', Discipline: meta.disc || '', Unit: meta.unit || 'Unit not specified' };
      const periodRows = [], comparisons = [];
      let originalTotal = 0, latestTotal = 0, completed = 0, projectedTotal = 0, changed = 0, reportedTotal = 0;
      for (const code of codes) {
        const org = organisation(code);
        const identity = { ...base, 'Delivery Unit': org?.deliveryUnit?.name || 'Unassigned', Engineer: org?.engineer?.name || 'Unassigned', 'Work Group Set': code, 'Work Group Description': input.groupDescription(code) };
        for (const p of periods) {
          const before = number(original[code]?.[p]);
          const explicit = Object.hasOwn(overrides[code] || {}, p);
          const latest = explicit ? number(overrides[code][p]) : before;
          const inCutoff = number(p.slice(1)) <= input.cutoff;
          const wd = available && inCutoff ? number(workDone[code]?.[p]) : null;
          const projected = available ? inCutoff ? wd : latest : null;
          originalTotal += before; latestTotal += latest; changed += Number(explicit);
          completed += wd || 0; projectedTotal += projected || 0;
          reportedTotal += number(workDone[code]?.[p]);
          if (wants('periods')) periodRows.push({ ...identity, Period: p, 'Original plan V0': Object.hasOwn(original[code] || {}, p) ? before : null, 'Latest forecast': latest, 'Explicit V1 update': explicit ? 'Yes' : 'No', 'Completed Work Done': wd, 'Projected outcome': projected, 'Variance vs latest': available ? projected - latest : null });
          if (wants('comparison')) comparisons.push({ ...identity, Period: p, 'Original plan V0': Object.hasOwn(original[code] || {}, p) ? before : null, 'Latest forecast': latest, Change: Object.hasOwn(original[code] || {}, p) ? latest - before : null, 'Explicit V1 update': explicit ? 'Yes' : 'No' });
        }
      }
      const projected = available ? projectedTotal : null;
      const status = rag(latestTotal, projected);
      if (filters.search && ![sjn, meta.desc, meta.disc].some(value => String(value || '').toLowerCase().includes(filters.search.toLowerCase()))) continue;
      if (memberSet && !memberSet.has(sjn)) continue;
      if (filters.review === 'reviewed' && !reviewed || filters.review === 'needsreview' && reviewed) continue;
      if (filters.hideZero && !latestTotal && !reportedTotal) continue;
      const variance = available ? projectedTotal - latestTotal : null;
      if (filters.variance && filters.variance !== 'all') {
        const match = { good: status === 'Green', warning: status === 'Amber', bad: status === 'Red', over: variance > 0, under: variance < 0, variance: variance !== null && variance !== 0 };
        if (!match[filters.variance]) continue;
      }
      if (codes.length) {
        const ownership = { 'Delivery Units': [...new Set(codes.map(code => organisation(code)?.deliveryUnit?.name || 'Unassigned'))].join(', '), Engineers: [...new Set(codes.map(code => organisation(code)?.engineer?.name || 'Unassigned'))].join(', '), 'Work Group Sets': codes.join(', ') };
        if (wants('performance')) datasets.performance.push({ ...base, ...ownership, 'Original plan V0': originalTotal, 'Latest forecast': latestTotal, 'Completed Work Done': available ? completed : null, 'Projected full year': projected, 'Variance vs latest': variance, 'Variance %': available && latestTotal ? variance / Math.abs(latestTotal) : null, 'Percentage note': available && !latestTotal && projected ? 'Nonzero projection against zero forecast' : '', RAG: status, 'V1 updated cells': changed, 'Review status': reviewed ? 'Reviewed' : 'Not reviewed' });
        datasets.periods.push(...periodRows); datasets.comparison.push(...comparisons);
        if (wants('reviews')) datasets.reviews.push({ ...base, 'Financial Year': input.year, 'Review stage': input.stage, 'Review status': reviewed ? 'Reviewed' : 'Not reviewed', 'Reviewed at': record?.reviewedAt || '', 'Work Group Sets': codes.join(', ') });
      }
      codes.forEach(code => {
        if (!coverage.has(code)) coverage.set(code, { original: new Set(), latest: new Set() });
        const count = coverage.get(code);
        if (periods.some(p => Object.hasOwn(original[code] || {}, p))) count.original.add(sjn);
        if (periods.some(p => Object.hasOwn(original[code] || {}, p) || Object.hasOwn(overrides[code] || {}, p))) count.latest.add(sjn);
      });
      if (wants('comments')) scopedComments.filter(entry => (!filters.commentType || filters.commentType === 'all' || (entry.category || 'General') === filters.commentType) && (!filters.commentStage || filters.commentStage === 'all' || entry.rf === filters.commentStage)).forEach(entry => {
        const org = input.commentOrganisation(entry);
        datasets.comments.push({ 'Standard Job Number': sjn, Description: base.Description, Unit: base.Unit, 'Financial Year': input.year, 'Review Stage': entry.rf || '', 'Comment Type': entry.category || 'General', Comment: entry.text || '', 'Delivery Unit ID': org?.deliveryUnit?.id || '', 'Delivery Unit': org?.deliveryUnit?.name || '', Engineer: org?.engineer?.name || '', 'Work Group Set': normalise(entry.filteredWorkGroup || ''), 'Root Cause': entry.rootCause || '', 'Corrective Action': entry.correctiveAction || '', Owner: entry.owner || '', 'Due Date': entry.dueDate || '', 'Evidence Links': (entry.evidenceLinks || []).join('\n') });
      });
      if (wants('orders')) (done.get(sjn)?.workOrders || []).filter(order => allowed(normalise(order.workGroup))).filter(order => filters.orders !== 'corrected' || order.isAmended).forEach(order => {
        const org = organisation(normalise(order.workGroup));
        datasets.orders.push({ ...base, 'Delivery Unit': org?.deliveryUnit?.name || '', Engineer: org?.engineer?.name || '', 'Work Group Set': normalise(order.workGroup), 'Work Order': order.number || '', 'Order description': order.description || '', 'Order type': order.workOrderType || '', 'Closed period': order.period || '', 'Closed date': order.closedDate || '', 'Original units': number(order.originalUnits), 'Corrected units': number(order.units), Difference: number(order.units) - number(order.originalUnits), Corrected: order.isAmended ? 'Yes' : 'No', 'Correction saved at': input.amendments?.[order.id]?.updatedAt || '', 'Correction reason': input.amendments?.[order.id]?.reason || '' });
      });
    }
    for (const [code, counts] of coverage) {
      const org = organisation(code);
      datasets.coverage.push({ 'Financial Year': input.year, 'Delivery Unit': org?.deliveryUnit?.name || '', Engineer: org?.engineer?.name || '', 'Work Group Set': code, Description: input.groupDescription(code), 'V0 SJN count': counts.original.size, 'Latest forecast SJN count': counts.latest.size });
    }
    const ranked = rows => rows.filter(row => row['Variance vs latest'] !== null && row['Variance vs latest'] !== 0).sort((a, b) => {
      const metric = row => filters.rank === 'percent' ? row['Latest forecast'] ? Math.abs(row['Variance %']) : Infinity : Math.abs(row['Variance vs latest']);
      return metric(b) - metric(a);
    }).slice(0, 10);
    datasets.top10 = filters.rank === 'percent' ? ranked(datasets.performance) : [...new Set(datasets.performance.map(row => row.Unit))].flatMap(unit => ranked(datasets.performance.filter(row => row.Unit === unit)));
    return { datasets, available };
  }
  function prepare(...args) {
    const iterator = build(...args);
    let step;
    do { step = iterator.next(); } while (!step.done);
    return step.value;
  }
  async function prepareAsync(...args) {
    const iterator = build(...args);
    let step;
    do {
      step = iterator.next();
      if (!step.done) await new Promise(resolve => setTimeout(resolve, 0));
    } while (!step.done);
    return step.value;
  }
  const api = { prepare, prepareAsync };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.APRExportData = api;
})(typeof window === 'undefined' ? null : window);
