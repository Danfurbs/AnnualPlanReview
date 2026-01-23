/**
 * FORECAST_LIBRARY
 *
 * Baseline forecast data library (FY-wide, not RF-specific)
 *
 * Structure (NEW simplified format):
 * {
 *   [year]: {
 *     [planVersion]: {
 *       rowCount: number,
 *       data: {
 *         [jobNumber]: {
 *           periods: { P1: total, P2: total, ..., P13: total },  // Aggregated totals
 *           wgs: {
 *             [workGroupName]: { P1: value, P2: value, ..., P13: value }
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 *
 * Notes:
 * - Forecasts are FY-wide and persist across all RF stages (RF3, RF6, RF9, RF11)
 * - RF stages are review checkpoints, not separate forecast versions
 * - Use export/import to share forecasts between computers
 * - Plan v0 and v1 are different forecast versions
 *
 * SHARING FORECASTS ACROSS COMPUTERS (Option A: Semi-Automatic):
 *
 * To share forecasts via GitHub:
 * 1. On Computer A:
 *    - Open the Forecast Builder
 *    - Export your forecast (creates a JSON file like forecast-FY27-v0-2024-01-15.json)
 *    - Commit this file to your GitHub repository (e.g., in a 'forecasts/' folder)
 *    - Push to GitHub
 *
 * 2. Configure GitHub URLs in forecast-globals.js:
 *    - Edit the GITHUB_FORECAST_URLS object
 *    - Add URLs pointing to your raw GitHub files
 *    - Example:
 *      window.GITHUB_FORECAST_URLS = {
 *        FY27: {
 *          v0: 'https://raw.githubusercontent.com/yourorg/yourrepo/main/forecasts/FY27-v0.json',
 *          v1: 'https://raw.githubusercontent.com/yourorg/yourrepo/main/forecasts/FY27-v1.json'
 *        }
 *      };
 *
 * 3. On Computer B:
 *    - Pull the latest code (including updated forecast-globals.js)
 *    - Open the app - forecasts will auto-load from GitHub!
 *    - The app checks: localStorage → GitHub → FORECAST_LIBRARY (in that order)
 *
 * Pros: Simple, no backend needed, works client-side only
 * Cons: Manual export/commit workflow
 *
 * Example:
 * {
 *   FY27: {
 *     v0: {
 *       rowCount: 2,
 *       data: {
 *         "123456": {
 *           periods: { P1: 100, P2: 150, P3: 200 },
 *           wgs: {
 *             "Sample WG": { P1: 100, P2: 150, P3: 200 }
 *           }
 *         }
 *       }
 *     },
 *     v1: {
 *       rowCount: 2,
 *       data: {
 *         "123456": {
 *           periods: { P1: 120, P2: 150, P3: 180 },  // Updated forecast
 *           wgs: {
 *             "Sample WG": { P1: 120, P2: 150, P3: 180 }
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 */
const FORECAST_LIBRARY = {
  // Add your forecast data here, or use the import/export functionality
};
