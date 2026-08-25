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

  function getWorkDoneCoverage(source, uploaded) {
    if (!uploaded) return { lastPeriod: 0, label: 'not uploaded' };
    let lastPeriod = 0;
    entries(source).forEach(([, job]) => Object.values(job?.wgs || {}).forEach(periods => {
      Object.keys(periods || {}).forEach(period => {
        const match = /^P(\d+)$/.exec(period);
        if (match) lastPeriod = Math.max(lastPeriod, Number(match[1]));
      });
    }));
    return { lastPeriod, label: lastPeriod >= 13 ? 'full year' : `through P${lastPeriod}` };
  }

  function getPlanningContext(options) {
    const years = options.historyYears || getPlanningHistoryYears(options.selectedYear);
    return years.map(year => {
      const forecastJob = getJob(options.effectiveForecastsByYear?.[year], options.jobNumber);
      const forecastPeriods = findWorkGroup(forecastJob, options.workGroup, options.resolveWorkGroupCode) || {};
      const workDoneJob = getJob(options.workDoneByYear?.[year], options.jobNumber);
      const workDonePeriods = findWorkGroup(workDoneJob, options.workGroup, options.resolveWorkGroupCode) || {};
      const coverage = getWorkDoneCoverage(options.workDoneByYear?.[year], options.workDoneUploadedByYear?.[year]);
      return {
        year,
        forecastPeriods: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`P${i + 1}`, Number(forecastPeriods[`P${i + 1}`]) || 0])),
        workDonePeriods: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`P${i + 1}`, Number(workDonePeriods[`P${i + 1}`]) || 0])),
        forecastTotal: Object.values(forecastPeriods).reduce((sum, value) => sum + (Number(value) || 0), 0),
        workDoneTotal: Object.values(workDonePeriods).reduce((sum, value) => sum + (Number(value) || 0), 0),
        coverage
      };
    });
  }

  function copyPlanningProfile(context, source) {
    if (!context) return null;
    if (source === 'forecast') return { ...context.forecastPeriods };
    if (source !== 'work-done') return null;
    return Object.fromEntries(Array.from({ length: 13 }, (_, i) => {
      const period = `P${i + 1}`;
      return [period, i < context.coverage.lastPeriod ? context.workDonePeriods[period] : context.forecastPeriods[period]];
    }));
  }

  function buildTemporaryWorkDoneEvidence(rows, options = {}) {
    const aliases = {
      job: ['standard job number & desc', 'standard job no', 'standard job', 'standard job number', 'sjn'],
      workGroup: ['work group set', 'work group set description', 'workgroup set', 'wgs'],
      period: ['work order closed period', 'period completed', 'completed period', 'period'],
      units: ['units complete', 'units completed', 'completed units']
    };
    const read = (row, names) => Object.entries(row || {}).find(([key]) => names.includes(String(key).trim().toLowerCase()))?.[1];
    const data = new Map(); let accepted = 0, rejected = 0;
    (rows || []).forEach(row => {
      const rawJob = read(row, aliases.job);
      const extractedJob = options.extractJob?.(rawJob) || String(rawJob || '').trim().split('-')[0].match(/\d+/)?.[0];
      const jobNumber = normalizeJobNumber(extractedJob);
      const workGroup = options.resolveWorkGroupCode?.(read(row, aliases.workGroup)) || '';
      const periodMatch = /^P?(\d{1,2})$/i.exec(String(read(row, aliases.period) || '').trim());
      const units = Number(read(row, aliases.units));
      if (!jobNumber || (options.activeJobs && !options.activeJobs.has(jobNumber)) || !workGroup || (options.activeWorkGroups && !options.activeWorkGroups.has(workGroup)) ||
          !periodMatch || Number(periodMatch[1]) < 1 || Number(periodMatch[1]) > 13 || !Number.isFinite(units) || units < 0) {
        rejected += 1; return;
      }
      const period = `P${Number(periodMatch[1])}`, job = data.get(jobNumber) || { periods: {}, wgs: {}, comments: {} };
      if (!job.wgs[workGroup]) job.wgs[workGroup] = {};
      job.wgs[workGroup][period] = (Number(job.wgs[workGroup][period]) || 0) + units;
      data.set(jobNumber, job); accepted += 1;
    });
    return { data, accepted, rejected };
  }

  return {
    REASONS, getPlanningHistoryYears, getStandardJobsForEngineer,
    getWorkGroupSetsForStandardJob, canRemoveManuallyAddedStandardJob, normalizeJobNumber,
    getWorkDoneCoverage, getPlanningContext, copyPlanningProfile, buildTemporaryWorkDoneEvidence
  };
});
