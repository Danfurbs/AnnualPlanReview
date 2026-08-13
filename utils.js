/**
 * Utility functions for the Annual Plan Review application
 */

/**
 * Debounce function - delays execution until after wait milliseconds have elapsed
 * since the last time it was invoked
 * @param {Function} func - The function to debounce
 * @param {number} wait - The number of milliseconds to delay
 * @returns {Function} - The debounced function
 */
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function - ensures a function is called at most once per specified time period
 * @param {Function} func - The function to throttle
 * @param {number} limit - The time limit in milliseconds
 * @returns {Function} - The throttled function
 */
function throttle(func, limit = 300) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Resolve the value used for the dashboard's actual/forecast projection.
 * Work done is used only through the selected cutoff; later periods use the
 * forecast even when the uploaded work-done file already contains values.
 */
function getActualOrForecastForCutoff(forecastValue, workDonePeriods, periodNumber, cutoffPeriod) {
  return Number(periodNumber) <= Number(cutoffPeriod)
    ? Number(workDonePeriods?.[`P${periodNumber}`] || 0)
    : Number(forecastValue || 0);
}

/**
 * Apply the nationally defined percentage RAG thresholds to aggregated values.
 * Direction does not affect colour. A positive actual against a zero forecast
 * is Red; zero against zero is Green.
 */
function getForecastVarianceStatus(forecastValue, actualValue) {
  const forecast = Number(forecastValue || 0);
  const actual = Number(actualValue || 0);
  const variance = actual - forecast;

  if (forecast === 0) {
    return {
      status: actual === 0 ? 'good' : 'bad',
      hasVariance: variance !== 0,
      hasNoForecast: true,
      ratio: actual === 0 ? 0 : Infinity
    };
  }

  const ratio = Math.abs(variance / forecast);
  const status = ratio >= 0.5 ? 'bad' : ratio >= 0.1 ? 'warning' : 'good';
  return { status, hasVariance: variance !== 0, hasNoForecast: false, ratio };
}

// Export for use in other files
if (typeof window !== 'undefined') {
  window.debounce = debounce;
  window.throttle = throttle;
  window.getActualOrForecastForCutoff = getActualOrForecastForCutoff;
  window.getForecastVarianceStatus = getForecastVarianceStatus;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { debounce, throttle, getActualOrForecastForCutoff, getForecastVarianceStatus };
}
