/* Shared forecast editing and reporting rules; no storage or UI side effects. */
(function (root) {
  const periods = Array.from({ length: 13 }, (_, i) => `P${i + 1}`);
  function parseCell(value) {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new Error('Enter a finite, non-negative forecast value.');
    return number;
  }
  function applyPeriodEdits(original, edits) {
    const result = { ...original };
    for (const [period, value] of Object.entries(edits)) {
      if (!periods.includes(period)) throw new Error(`Invalid period: ${period}`);
      const parsed = parseCell(value);
      if (parsed === undefined) delete result[period]; else result[period] = parsed;
    }
    return result;
  }
  function performance(forecast, workDone, cutoff, uploaded) {
    const selected = Number.isInteger(cutoff) && cutoff >= 0 && cutoff <= 13;
    const available = selected && (cutoff === 0 || uploaded);
    const annual = periods.reduce((n, p) => n + (Number(forecast?.[p]) || 0), 0);
    const planned = selected ? periods.slice(0, cutoff).reduce((n, p) => n + (Number(forecast?.[p]) || 0), 0) : null;
    const completed = available ? periods.slice(0, cutoff).reduce((n, p) => n + (Number(workDone?.[p]) || 0), 0) : null;
    return { available, annual, planned, completed, actual: available ? completed + annual - planned : null };
  }
  function movement(original, current) {
    return { units: current - original, percent: original === 0 ? (current === 0 ? 0 : null) : (current - original) / original * 100 };
  }
  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
  }
  // Three-way merge preserves unrelated remote edits and reports true collisions.
  function mergeChanges(base, draft, remote, path = '') {
    if (equal(base, draft)) return { value: remote, conflicts: [] };
    if (equal(base, remote) || equal(draft, remote)) return { value: draft, conflicts: [] };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    if (object(draft) && object(remote) && (base === undefined || object(base))) {
      const value = {}, conflicts = [];
      for (const key of new Set([...Object.keys(base || {}), ...Object.keys(draft), ...Object.keys(remote)])) {
        const result = mergeChanges(base?.[key], draft[key], remote[key], path ? path + '.' + key : key);
        if (result.value !== undefined) value[key] = result.value;
        conflicts.push(...result.conflicts);
      }
      return { value, conflicts };
    }
    return { value: draft, conflicts: [path] };
  }
  const api = { periods, parseCell, applyPeriodEdits, performance, movement, equal, mergeChanges };
  if (typeof module !== 'undefined') module.exports = api;
  if (root) root.ForecastModel = api;
})(typeof window === 'undefined' ? null : window);
