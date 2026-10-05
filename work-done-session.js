/* Work Done is intentionally memory-only: a page load starts a new session. */
(function (root) {
  function createWorkDoneSession() {
    const years = new Map();
    return Object.freeze({
      get: year => years.get(year) || null,
      replace(year, data, fileName = '') {
        if (!/^FY\d{2,4}$/.test(year) || !(data instanceof Map) || !data.size) {
          throw new Error('A financial year and validated Work Done map are required.');
        }
        years.set(year, { data, fileName: String(fileName), uploadedAt: new Date().toISOString() });
      },
      clear(year) { if (year === undefined) years.clear(); else years.delete(year); }
    });
  }
  if (typeof module !== 'undefined') module.exports = { createWorkDoneSession };
  if (root) {
    try { root.localStorage.removeItem('aprWorkDoneByYearV1'); } catch (error) {
      console.warn('Could not remove legacy Work Done cache:', error);
    }
    root.WorkDoneSession = createWorkDoneSession();
  }
})(typeof window === 'undefined' ? null : window);
