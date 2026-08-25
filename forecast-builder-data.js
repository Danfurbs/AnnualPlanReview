/**
 * Phase 1 data layer for the Engineer -> Standard Job -> Work Group Set builder.
 * This module discovers planning candidates without writing forecast data.
 */
(function exposeForecastBuilderData(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis, function createForecastBuilderData() {
  const REASONS = Object.freeze({
    RECENT_FORECAST: 'recent forecast',
    RECENT_WORK_DONE: 'recent Work Done',
    COMMENT_ONLY: 'comment-only',
    CURRENT_V0: 'current V0',
    MANUALLY_ADDED: 'manually added'
  });

  function getPlanningHistoryYears(selectedYear) {
    const match = /^FY(\d+)$/i.exec(String(selectedYear || '').trim());
    if (!match) throw new Error(`Invalid financial year: ${selectedYear}`);
    const width = match[1].length;
    const value = Number(match[1]);
    return [1, 2, 3].map(offset => `FY${String(value - offset).padStart(width, '0')}`);
  }

  function entries(source) {
    if (source instanceof Map) return Array.from(source.entries());
    return Object.entries(source || {});
  }

  function normalizeJobNumber(value) {
    const text = String(value || '').trim();
    return /^\d+$/.test(text) ? String(Number(text)) : text;
  }

  function resolveCode(value, resolveWorkGroupCode) {
    return (resolveWorkGroupCode?.(value) || String(value || '').trim()).toUpperCase();
  }

  function hasVolume(periods) {
    return Object.values(periods || {}).some(value => Number(value) !== 0);
  }

  function hasComment(job, workGroup, resolveWorkGroupCode) {
    const target = resolveCode(workGroup, resolveWorkGroupCode);
    return Object.entries(job?.comments || {}).some(([key, value]) =>
      Boolean(String(value || '').trim()) && resolveCode(key, resolveWorkGroupCode) === target
    );
  }

  function findWorkGroup(job, workGroup, resolveWorkGroupCode) {
    const target = resolveCode(workGroup, resolveWorkGroupCode);
    const match = Object.entries(job?.wgs || {}).find(([key]) =>
      resolveCode(key, resolveWorkGroupCode) === target
    );
    return match?.[1] || null;
  }

  function getJob(source, jobNumber) {
    const canonical = normalizeJobNumber(jobNumber);
    const candidates = [String(jobNumber), canonical, canonical.padStart(6, '0')];
    if (source instanceof Map) {
      for (const candidate of candidates) if (source.has(candidate)) return source.get(candidate);
      return undefined;
    }
    for (const candidate of candidates) if (source?.[candidate]) return source[candidate];
    return undefined;
  }

  function normalizeMetadata(metadata) {
    return (metadata || []).map(item => ({
      fiscalYear: item.fiscalYear || item.fiscal_year,
      engineerId: item.engineerId || item.engineer_id,
      jobNumber: normalizeJobNumber(item.jobNumber || item.job_number || ''),
      workGroup: item.workGroup || item.work_group || '',
      forecasted: Boolean(item.forecasted),
      // Legacy Phase 2 metadata had no discriminator. Forecasted=false records
      // were created only by manual addition, so retain those queue entries.
      manuallyAdded: Boolean(item.manuallyAdded ?? item.manually_added ?? !item.forecasted)
    }));
  }

  function collectEvidence(options, jobNumber, workGroup) {
    const {
      selectedYear, effectiveForecastsByYear = {}, v0ForecastsByYear = {},
      workDoneByYear = {}, resolveWorkGroupCode
    } = options;
    const reasons = new Set();
    const historyYears = getPlanningHistoryYears(selectedYear);

    historyYears.forEach(year => {
      const effectiveJob = getJob(effectiveForecastsByYear[year], jobNumber);
      const effectivePeriods = findWorkGroup(effectiveJob, workGroup, resolveWorkGroupCode);
      if (hasVolume(effectivePeriods)) reasons.add(REASONS.RECENT_FORECAST);
      if (hasComment(effectiveJob, workGroup, resolveWorkGroupCode) && !hasVolume(effectivePeriods)) {
        reasons.add(REASONS.COMMENT_ONLY);
      }

      const workDoneJob = getJob(workDoneByYear[year], jobNumber);
      if (hasVolume(findWorkGroup(workDoneJob, workGroup, resolveWorkGroupCode))) {
        reasons.add(REASONS.RECENT_WORK_DONE);
      }
    });

    const currentJob = getJob(v0ForecastsByYear[selectedYear], jobNumber);
    if (hasVolume(findWorkGroup(currentJob, workGroup, resolveWorkGroupCode)) ||
        hasComment(currentJob, workGroup, resolveWorkGroupCode)) {
      reasons.add(REASONS.CURRENT_V0);
    }
    return reasons;
  }

  function candidateJobNumbers(options) {
    const years = [...getPlanningHistoryYears(options.selectedYear), options.selectedYear];
    const numbers = new Set();
    years.forEach(year => {
      [options.effectiveForecastsByYear?.[year], options.v0ForecastsByYear?.[year], options.workDoneByYear?.[year]]
        .forEach(source => entries(source).forEach(([jobNumber]) => numbers.add(normalizeJobNumber(jobNumber))));
    });
    normalizeMetadata(options.planningMetadata).forEach(item => {
      if (item.fiscalYear === options.selectedYear && item.engineerId === options.engineerId) numbers.add(item.jobNumber);
    });
    return numbers;
  }

  function getWorkGroupSetsForStandardJob(options) {
    const engineer = (options.engineers || []).find(item => item.id === options.engineerId);
    if (!engineer) return [];
    const metadata = normalizeMetadata(options.planningMetadata);
    const manualRows = metadata.filter(item => item.fiscalYear === options.selectedYear &&
      item.engineerId === options.engineerId && item.jobNumber === String(options.jobNumber) && item.workGroup && item.manuallyAdded);
    const workGroups = new Set([...(engineer.workGroupSets || []), ...manualRows.map(item => item.workGroup)]);

    return Array.from(workGroups).map(workGroup => {
      const reasons = collectEvidence(options, String(options.jobNumber), workGroup);
      if (manualRows.some(item => resolveCode(item.workGroup, options.resolveWorkGroupCode) ===
          resolveCode(workGroup, options.resolveWorkGroupCode))) reasons.add(REASONS.MANUALLY_ADDED);
      return { workGroup, reasons: Array.from(reasons) };
    }).filter(item => item.reasons.length).sort((a, b) => a.workGroup.localeCompare(b.workGroup));
  }

  function getStandardJobsForEngineer(options) {
    const metadata = normalizeMetadata(options.planningMetadata);
    const manualJobs = metadata.filter(item => item.fiscalYear === options.selectedYear &&
      item.engineerId === options.engineerId && !item.workGroup && item.manuallyAdded);
    return Array.from(candidateJobNumbers(options)).map(jobNumber => {
      const rows = getWorkGroupSetsForStandardJob({ ...options, jobNumber });
      const reasons = new Set(rows.flatMap(row => row.reasons));
      if (manualJobs.some(item => item.jobNumber === jobNumber)) reasons.add(REASONS.MANUALLY_ADDED);
      if (!reasons.size) return null;
      const forecasted = metadata.some(item => item.fiscalYear === options.selectedYear &&
        item.engineerId === options.engineerId && item.jobNumber === jobNumber && !item.workGroup && item.forecasted);
      return { jobNumber, reasons: Array.from(reasons), workGroupCount: rows.length, forecasted };
    }).filter(Boolean).sort((a, b) => a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true }));
  }

  function canRemoveManuallyAddedStandardJob(options) {
    const metadata = normalizeMetadata(options.planningMetadata);
    const manual = metadata.some(item => item.fiscalYear === options.selectedYear &&
      item.engineerId === options.engineerId && item.jobNumber === String(options.jobNumber) && !item.workGroup && item.manuallyAdded);
    if (!manual) return false;
    const job = getJob(options.v0ForecastsByYear?.[options.selectedYear], String(options.jobNumber));
    const hasData = Object.values(job?.wgs || {}).some(hasVolume);
    const hasComments = Object.values(job?.comments || {}).some(value => Boolean(String(value || '').trim()));
    return !hasData && !hasComments;
  }

  return {
    REASONS, getPlanningHistoryYears, getStandardJobsForEngineer,
    getWorkGroupSetsForStandardJob, canRemoveManuallyAddedStandardJob, normalizeJobNumber
  };
});
