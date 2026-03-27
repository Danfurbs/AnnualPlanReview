/**
 * forecast-globals.js
 * Shared global variables for forecast modules
 * Must load BEFORE forecast modules and app.js
 */

// Forecast constants
window.REVIEW_STAGES = ['RF3', 'RF6', 'RF9', 'RF11'];
window.DEFAULT_FINANCIAL_YEARS = ['FY27', 'FY28', 'FY29', 'FY30'];
window.PLAN_VERSIONS = [
  { id: 'v0', label: 'Plan v0' },
  { id: 'v1', label: 'Plan v1' }
];
window.FORECAST_PERIODS = Array.from({ length: 13 }, (_, i) => `P${i + 1}`);

// Forecast context state
window.currentReviewStage = null;
window.currentFinancialYear = null;
window.currentPlanVersion = 'v0';

// Forecast data
window.fData = null;

// Forecast editor state
window.forecastEditorState = {
  year: '',
  planVersion: '',
  workGroup: '',
  rows: []
};

// GitHub forecast library configuration (Option A: Semi-Automatic)
// To enable GitHub-based forecast sharing:
// 1. Export your forecasts from Computer A
// 2. Commit the JSON files to GitHub (e.g., in a 'forecasts/' folder)
// 3. Configure the URLs below to point to the raw GitHub URLs
// Example: 'https://raw.githubusercontent.com/yourrepo/main/forecasts/FY27-v0.json'
window.GITHUB_FORECAST_URLS = {
  // FY27: {
  //   v0: 'https://raw.githubusercontent.com/yourrepo/main/forecasts/FY27-v0.json',
  //   v1: 'https://raw.githubusercontent.com/yourrepo/main/forecasts/FY27-v1.json'
  // },
  // FY28: {
  //   v0: 'https://raw.githubusercontent.com/yourrepo/main/forecasts/FY28-v0.json',
  //   v1: 'https://raw.githubusercontent.com/yourrepo/main/forecasts/FY28-v1.json'
  // }
};
