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
