/* Work-order identity and correction lifecycle, shared by browser and server. */
(function (root) {
  'use strict';
  const text = value => String(value || '').trim();
  const equalUnits = (a, b) => a !== null && a !== undefined && a !== '' && b !== null && b !== undefined && b !== '' && Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) < 0.0001;
  const identity = (order, normalise = value => text(value).toUpperCase()) => {
    const value = { jobNumber: text(order.jobNumber).padStart(6, '0'), number: text(order.number).toUpperCase(), workGroup: normalise(order.workGroup) };
    return validIdentity(value) ? value : null;
  };
  function validIdentity(value) {
    return Boolean(value && /^\d{6,50}$/.test(value.jobNumber) && typeof value.number === 'string' && value.number.length > 0 && value.number.length <= 200 && value.number !== 'UNKNOWN' && typeof value.workGroup === 'string' && value.workGroup.length > 0 && value.workGroup.length <= 200 && value.workGroup.toUpperCase() !== 'UNSPECIFIED');
  }
  const stableId = value => 'wo2|' + [value.jobNumber, value.number, value.workGroup].map(encodeURIComponent).join('|');
  const sameIdentity = (a, b) => validIdentity(a) && validIdentity(b) && stableId(a) === stableId(b);
  function legacyMatch(id, value) {
    const prefix = `${value.jobNumber}-${value.number}-`;
    return text(id).toUpperCase().startsWith(prefix.toUpperCase()) && /^\d+$/.test(id.slice(prefix.length));
  }
  function identify(data, corrections, normalise) {
    const rows = [];
    const groups = new Map();
    const normaliseGroup = value => {
      if (!groups.has(value)) groups.set(value, normalise ? normalise(value) : text(value).toUpperCase());
      return groups.get(value);
    };
    const stableCounts = new Map(), orderCounts = new Map();
    const stableCorrections = new Map(), legacyCorrections = new Map();
    Object.entries(corrections || {}).forEach(([id, correction]) => {
      if (correction.identity || id.startsWith('wo2|')) {
        const key = correction.identity ? stableId(correction.identity) : id;
        if (!stableCorrections.has(key)) stableCorrections.set(key, []);
        stableCorrections.get(key).push(id);
      } else {
        const match = id.match(/^(\d{6,50})-(.+)-\d+$/);
        if (match) {
          const key = match[1] + '|' + match[2].toUpperCase();
          if (!legacyCorrections.has(key)) legacyCorrections.set(key, []);
          legacyCorrections.get(key).push(id);
        }
      }
    });
    data?.forEach((job, jobNumber) => (job.workOrders || []).forEach(order => {
      order.jobNumber ||= String(jobNumber);
      const value = identity(order, normaliseGroup);
      order.reviewIdentity = value;
      if (value) {
        const key = stableId(value), pair = value.jobNumber + '|' + value.number;
        stableCounts.set(key, (stableCounts.get(key) || 0) + 1);
        orderCounts.set(pair, (orderCounts.get(pair) || 0) + 1);
      }
      rows.push(order);
    }));
    rows.forEach((order, index) => {
      const value = order.reviewIdentity;
      order.correctionId = null;
      order.matchedCorrectionIds = [];
      order.correctionMatchIssue = '';
      order.hasSavedCorrection = false;
      if (!value) { order.correctionMatchIssue = 'Missing work order identity'; return; }
      const key = stableId(value);
      order.id = stableCounts.get(key) === 1 ? key : `${key}|duplicate-${index}`;
      const matches = [...(stableCorrections.get(key) || []), ...(legacyCorrections.get(value.jobNumber + '|' + value.number) || [])];
      order.matchedCorrectionIds = matches;
      order.hasSavedCorrection = matches.some(id => corrections[id].status !== 'resolved');
      if (stableCounts.get(key) !== 1) { order.correctionMatchIssue = 'Duplicate work order rows — correction needs matching review'; return; }
      const legacyAmbiguous = matches.some(id => !corrections[id].identity && id !== key) && orderCounts.get(value.jobNumber + '|' + value.number) !== 1;
      if (matches.length > 1 || legacyAmbiguous) { order.correctionMatchIssue = 'Saved correction cannot be matched uniquely'; return; }
      order.correctionId = matches[0] || null;
    });
    return rows;
  }
  function apply(data, corrections, normalise) {
    identify(data, corrections, normalise);
    data?.forEach(job => {
      job.periods = {}; job.wgs = {};
      for (const order of job.workOrders || []) {
        const correction = corrections?.[order.correctionId];
        const active = correction && correction.status !== 'resolved';
        order.correctionSourceStale = Boolean(correction?.status === 'resolved' && !equalUnits(correction.units, order.originalUnits) && (order.correctionSourceStale || order.correctionStatus === 'active'));
        order.correctionStatus = order.correctionMatchIssue ? 'unmatched' : active ? 'active' : correction?.status === 'resolved' ? 'resolved' : '';
        order.correctionResolved = Boolean(correction?.status === 'resolved' && equalUnits(correction.units, order.originalUnits));
        order.units = active ? Number(correction.units) : Number(order.originalUnits);
        order.isAmended = Boolean(active && !equalUnits(order.units, order.originalUnits));
        job.periods[order.period] = (job.periods[order.period] || 0) + order.units;
        const group = job.wgs[order.workGroup] ||= {};
        group[order.period] = (group[order.period] || 0) + order.units;
      }
    });
  }
  function proposals(data, corrections, normalise) {
    return identify(data, corrections, normalise).filter(order => {
      const correction = corrections?.[order.correctionId];
      return !order.correctionMatchIssue && correction && correction.status !== 'resolved' && equalUnits(correction.units, order.originalUnits);
    }).map(order => ({ orderId: order.correctionId, identity: order.reviewIdentity, sourceUnits: Number(order.originalUnits) }));
  }
  function resolvedValue(id, before, evidence) {
    if (!before || before.status === 'resolved' || !validIdentity(evidence.identity) || !equalUnits(before.units, evidence.sourceUnits) ||
      (before.identity ? !sameIdentity(before.identity, evidence.identity) : id !== stableId(evidence.identity) && !legacyMatch(id, evidence.identity))) {
      const error = new Error('Correction no longer matches the uploaded source.'); error.code = 'RECONCILIATION_MISMATCH'; throw error;
    }
    return { ...before, identity: evidence.identity, status: 'resolved', resolvedAt: new Date().toISOString() };
  }
  function missing(data, corrections) {
    const seen = new Set([...data?.values() || []].flatMap(job => (job.workOrders || []).flatMap(order => order.matchedCorrectionIds || (order.correctionId ? [order.correctionId] : [order.id]))));
    return Object.entries(corrections || {}).filter(([id, value]) => value.status !== 'resolved' && validIdentity(value.identity) && !seen.has(id));
  }
  const api = { identity, validIdentity, stableId, sameIdentity, legacyMatch, equalUnits, identify, apply, proposals, resolvedValue, missing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorkOrderReview = api;
})(typeof window === 'undefined' ? null : window);
