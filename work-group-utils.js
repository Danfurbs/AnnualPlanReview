/**
 * Work Group Utilities
 * Parses work group codes and organizes them into a hierarchical structure
 */

// Discipline mapping from description patterns
const DISCIPLINE_PATTERNS = [
  { pattern: /\(TRACK\)$/i, discipline: 'Track', code: 'TRA', order: 1 },
  { pattern: /\(SIGNALS?\)$/i, discipline: 'Signals', code: 'SIG', order: 2 },
  { pattern: /\(OLE\)$/i, discipline: 'OLE', code: 'OLE', order: 3 },
  { pattern: /\(OFFTRACK\)$/i, discipline: 'Off Track', code: 'OFT', order: 4 },
  { pattern: /\(W&G\)$/i, discipline: 'Walkways & Gauging', code: 'W&G', order: 5 },
  { pattern: /\(RT&L\)$/i, discipline: 'Rail Treatment', code: 'RTL', order: 6 },
  { pattern: /\(D&P\)$/i, discipline: 'Distribution & Plant', code: 'D&P', order: 7 },
  { pattern: /\(E&P\)$/i, discipline: 'Electrical & Power', code: 'E&P', order: 8 },
  { pattern: /\(S&TME\)$/i, discipline: 'S&T Maintenance', code: 'STM', order: 9 },
  { pattern: /\(SIGELP\)$/i, discipline: 'Signals ELP', code: 'ELP', order: 10 },
  { pattern: /\(CRE\)$/i, discipline: 'Civil Engineering', code: 'CRE', order: 11 },
  { pattern: /\(PLANT\)$/i, discipline: 'Plant', code: 'PLT', order: 12 },
  { pattern: /\(DISTRIBUTION\)$/i, discipline: 'Distribution', code: 'DST', order: 13 },
  { pattern: /\(ATG\)$/i, discipline: 'ATG', code: 'ATG', order: 14 },
  { pattern: /LCM$/i, discipline: 'Level Crossings', code: 'LCM', order: 15 },
  { pattern: /Telecoms$/i, discipline: 'Telecoms', code: 'TEL', order: 16 },
  { pattern: /RME$/i, discipline: 'Rail Maintenance', code: 'RME', order: 17 },
  { pattern: /IMDM/i, discipline: 'IMDM', code: 'IMD', order: 18 },
  { pattern: /ROC$/i, discipline: 'ROC', code: 'ROC', order: 19 },
  { pattern: /Investment/i, discipline: 'Investment', code: 'INV', order: 20 },
  { pattern: /WDM.*OLE/i, discipline: 'OLE', code: 'OLE', order: 3 },
  { pattern: /RBM TRACK/i, discipline: 'Track', code: 'TRA', order: 1 },
  { pattern: /Ballasting/i, discipline: 'Track', code: 'TRA', order: 1 },
];

/**
 * Extract discipline from work group description
 */
function extractDiscipline(description) {
  if (!description) return { discipline: 'Other', code: 'OTH', order: 99 };

  for (const { pattern, discipline, code, order } of DISCIPLINE_PATTERNS) {
    if (pattern.test(description)) {
      return { discipline, code, order };
    }
  }

  return { discipline: 'Other', code: 'OTH', order: 99 };
}

/**
 * Parse a work group code to extract components
 * Format: DDLLLXXX where DD=region, LLL=location, XXX=type
 */
function parseWorkGroupCode(code) {
  if (!code || code.length < 6) {
    return { region: '', location: '', type: '' };
  }

  return {
    region: code.substring(0, 2),
    location: code.substring(2, 5),
    type: code.substring(5)
  };
}

/**
 * Get all work groups organized by discipline
 * Includes both predefined work groups AND any found in forecast data
 * Returns: { discipline: { name, code, order, workGroups: [...] } }
 */
function getWorkGroupsByDiscipline() {
  const grouped = new Map();
  const seenCodes = new Set();

  // First, add all predefined work groups
  if (window.workGroupSets) {
    window.workGroupSets.forEach((description, code) => {
      // Skip retired entries
      if (description.includes('RETIRED') || description.includes('DO NOT USE')) {
        return;
      }

      seenCodes.add(code);
      const { discipline, code: discCode, order } = extractDiscipline(description);

      if (!grouped.has(discipline)) {
        grouped.set(discipline, {
          name: discipline,
          code: discCode,
          order: order,
          workGroups: []
        });
      }

      grouped.get(discipline).workGroups.push({
        code: code,
        description: description,
        shortName: description.replace(/\s*\([^)]+\)\s*$/, '').trim()
      });
    });
  }

  // Also add work groups from fData that might not be in the predefined list
  if (window.fData) {
    window.fData.forEach(job => {
      if (job && job.wgs) {
        Object.keys(job.wgs).forEach(wgCode => {
          if (!wgCode || seenCodes.has(wgCode)) return;
          seenCodes.add(wgCode);

          // Try to find description from workGroupSets
          let description = window.workGroupSets?.get(wgCode) || wgCode;
          const { discipline, code: discCode, order } = extractDiscipline(description);

          if (!grouped.has(discipline)) {
            grouped.set(discipline, {
              name: discipline,
              code: discCode,
              order: order,
              workGroups: []
            });
          }

          grouped.get(discipline).workGroups.push({
            code: wgCode,
            description: description,
            shortName: description.replace(/\s*\([^)]+\)\s*$/, '').trim()
          });
        });
      }
    });
  }

  // Sort work groups within each discipline
  grouped.forEach(group => {
    group.workGroups.sort((a, b) => a.shortName.localeCompare(b.shortName));
  });

  return grouped;
}

/**
 * Get disciplines sorted by order
 */
function getSortedDisciplines() {
  const grouped = getWorkGroupsByDiscipline();
  return Array.from(grouped.values()).sort((a, b) => a.order - b.order);
}

/**
 * Get work group status for current context
 * Returns: Map<workGroupCode, { hasData, jobCount, totalVolume }>
 */
function getWorkGroupStatuses(fData, planVersion, year) {
  const statuses = new Map();

  if (!window.workGroupSets) return statuses;

  // Initialize all work groups with empty status
  window.workGroupSets.forEach((description, code) => {
    if (description.includes('RETIRED') || description.includes('DO NOT USE')) {
      return;
    }
    statuses.set(code, { hasData: false, jobCount: 0, totalVolume: 0 });
  });

  // For v1, we need to check both v0 (inherited) and v1 (overrides)
  let dataToCheck = fData;
  if (planVersion === 'v1' && typeof getForecastSnapshot === 'function') {
    const v0Snapshot = getForecastSnapshot(year, 'v0');
    const v1Overrides = typeof loadV1Overrides === 'function' ? loadV1Overrides(year) : new Set();

    if (v0Snapshot && v0Snapshot.data) {
      // Check v0 data for non-overridden jobs
      v0Snapshot.data.forEach((job, jobNumber) => {
        if (v1Overrides.has(jobNumber)) return; // Skip if overridden in v1

        if (job && job.wgs) {
          Object.entries(job.wgs).forEach(([wgCode, periods]) => {
            if (!statuses.has(wgCode)) return;

            const totalForWg = Object.values(periods || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
            if (totalForWg > 0) {
              const status = statuses.get(wgCode);
              status.hasData = true;
              status.jobCount++;
              status.totalVolume += totalForWg;
            }
          });
        }
      });
    }
  }

  // Check current fData
  if (dataToCheck) {
    dataToCheck.forEach((job) => {
      if (job && job.wgs) {
        Object.entries(job.wgs).forEach(([wgCode, periods]) => {
          if (!statuses.has(wgCode)) return;

          const totalForWg = Object.values(periods || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
          if (totalForWg > 0) {
            const status = statuses.get(wgCode);
            status.hasData = true;
            status.jobCount++;
            status.totalVolume += totalForWg;
          }
        });
      }
    });
  }

  return statuses;
}

/**
 * Filter work groups by status
 */
function filterWorkGroupsByStatus(filter = 'all') {
  const disciplines = getSortedDisciplines();
  const statuses = getWorkGroupStatuses(
    window.fData,
    window.forecastEditorState?.planVersion,
    window.forecastEditorState?.year
  );

  return disciplines.map(disc => ({
    ...disc,
    workGroups: disc.workGroups.filter(wg => {
      const status = statuses.get(wg.code);
      if (filter === 'all') return true;
      if (filter === 'with-data') return status?.hasData;
      if (filter === 'without-data') return !status?.hasData;
      return true;
    })
  })).filter(disc => disc.workGroups.length > 0);
}

// Expose functions globally
window.extractDiscipline = extractDiscipline;
window.parseWorkGroupCode = parseWorkGroupCode;
window.getWorkGroupsByDiscipline = getWorkGroupsByDiscipline;
window.getSortedDisciplines = getSortedDisciplines;
window.getWorkGroupStatuses = getWorkGroupStatuses;
window.filterWorkGroupsByStatus = filterWorkGroupsByStatus;
