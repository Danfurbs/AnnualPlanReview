/**
 * Forecast API Routes
 */

const express = require('express');
const router = express.Router();
const {
  isValidFiscalYear,
  isValidPlanVersion,
  isValidJobNumber,
  isPlainObject,
  isNonNegativeInteger
} = require('./validators');

const VALID_PERIOD_KEYS = new Set(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13']);
const MAX_JOBS = 10000;
const MAX_WORKGROUPS_PER_JOB = 250;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validatePeriods(periods, context) {
  if (!isPlainObject(periods)) {
    return `${context} must be an object`;
  }

  for (const [periodKey, periodValue] of Object.entries(periods)) {
    if (!VALID_PERIOD_KEYS.has(periodKey)) {
      return `${context} contains invalid period key '${periodKey}'`;
    }
    if (!isFiniteNumber(periodValue)) {
      return `${context} period '${periodKey}' must be a finite number`;
    }
    if (periodValue < 0) {
      return `${context} period '${periodKey}' must be non-negative`;
    }
  }

  return null;
}

function validateForecastEntry(jobNumber, forecastData) {
  if (!isPlainObject(forecastData)) {
    return `Job ${jobNumber}: forecast data must be an object`;
  }

  if (!isPlainObject(forecastData.wgs)) {
    return `Job ${jobNumber}: 'wgs' must be an object`;
  }

  for (const [wgName, wgPeriods] of Object.entries(forecastData.wgs)) {
    if (!wgName.trim() || wgName.length > 50) return `Job ${jobNumber}: workgroup names must be 1-50 characters`;
    const periodsError = validatePeriods(wgPeriods, `Job ${jobNumber} workgroup '${wgName}'`);
    if (periodsError) return periodsError;
  }

  if (forecastData.periods !== undefined) {
    const periodsError = validatePeriods(forecastData.periods, `Job ${jobNumber} periods`);
    if (periodsError) return periodsError;
  }

  if (forecastData.comments !== undefined && !isPlainObject(forecastData.comments)) {
    return `Job ${jobNumber}: 'comments' must be an object when provided`;
  }

  return null;
}

function createForecastRoutes(db) {
  /**
   * GET /api/forecasts/:fiscalYear/:planVersion
   * Get all forecasts for a fiscal year and plan version
   */
  router.get('/:fiscalYear/:planVersion', async (req, res, next) => {
    try {
      const { fiscalYear, planVersion } = req.params;

      // This generic two-segment route is registered before the legacy
      // /v1-overrides/:fiscalYear endpoint below. Let that more-specific route
      // handle its own requests instead of treating "v1-overrides" as a year.
      if (fiscalYear === 'v1-overrides') return next('route');

      if (!isValidFiscalYear(fiscalYear) || !isValidPlanVersion(planVersion)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid fiscal year or plan version format'
        });
      }
      const data = await db.getForecastData(fiscalYear, planVersion);
      const revision = await db.getRevision('forecast', `${fiscalYear}:${planVersion}`);

      res.json({
        success: true,
        data: data,
        revision,
        rowCount: Object.keys(data).length,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching forecasts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch forecasts'
      });
    }
  });

  /**
   * GET /api/forecasts/:fiscalYear/:planVersion/job/:jobNumber
   * Get forecast for a specific job
   */
  router.get('/:fiscalYear/:planVersion/job/:jobNumber', async (req, res) => {
    try {
      const { fiscalYear, planVersion, jobNumber } = req.params;
      if (!isValidFiscalYear(fiscalYear) || !isValidPlanVersion(planVersion) || !isValidJobNumber(jobNumber)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid fiscal year, plan version, or job number format'
        });
      }
      const data = await db.getForecastByJob(jobNumber, fiscalYear, planVersion);

      res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('Error fetching forecast:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch forecast'
      });
    }
  });

  /**
   * POST /api/forecasts/:fiscalYear/:planVersion
   * Save all forecasts for a fiscal year and plan version
   * Body: { data: { jobNumber: { periods, wgs, comments }, ... } }
   */
  router.post('/:fiscalYear/:planVersion', async (req, res) => {
    try {
      const { fiscalYear, planVersion } = req.params;
      const { data, expectedRevision } = req.body || {};
      if (!isValidFiscalYear(fiscalYear) || !isValidPlanVersion(planVersion)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid fiscal year or plan version format'
        });
      }

      if (!isPlainObject(data)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid data format'
        });
      }
      if (!isNonNegativeInteger(expectedRevision)) return res.status(400).json({ success: false, error: 'expectedRevision must be a non-negative integer' });
      if (Object.keys(data).length > MAX_JOBS) return res.status(413).json({ success: false, error: `Forecast snapshot exceeds the ${MAX_JOBS} job limit` });
      for (const [jobNumber, forecastData] of Object.entries(data)) {
        if (!isValidJobNumber(jobNumber)) {
          return res.status(400).json({
            success: false,
            error: `Invalid job number: ${jobNumber}`
          });
        }
        const validationError = validateForecastEntry(jobNumber, forecastData);
        if (validationError) {
          return res.status(400).json({
            success: false,
            error: validationError
          });
        }
        if (Object.keys(forecastData.wgs).length > MAX_WORKGROUPS_PER_JOB) return res.status(413).json({ success: false, error: `Job ${jobNumber} exceeds the ${MAX_WORKGROUPS_PER_JOB} workgroup limit` });
      }

      // Use bulk save for all forecasts in a single transaction
      const revision = await db.saveAllForecasts(data, fiscalYear, planVersion, expectedRevision);

      res.json({
        success: true,
        message: 'Forecasts saved successfully',
        rowCount: Object.keys(data).length,
        revision
      });
    } catch (error) {
      if (error.code === 'REVISION_CONFLICT') return res.status(409).json({ success: false, error: 'Forecast changed since it was loaded. Reload before saving.' });
      console.error('Error saving forecasts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save forecasts'
      });
    }
  });

  /**
   * POST /api/forecasts/:fiscalYear/:planVersion/job/:jobNumber
   * Save forecast for a specific job
   * Body: { periods, wgs, comments }
   */
  router.post('/:fiscalYear/:planVersion/job/:jobNumber', async (req, res) => {
    try {
      const { fiscalYear, planVersion, jobNumber } = req.params;
      const forecastData = req.body;
      if (!isValidFiscalYear(fiscalYear) || !isValidPlanVersion(planVersion) || !isValidJobNumber(jobNumber)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid fiscal year, plan version, or job number format'
        });
      }

      const validationError = validateForecastEntry(jobNumber, forecastData);
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: validationError
        });
      }

      const revision = await db.saveForecast(jobNumber, fiscalYear, planVersion, forecastData);

      res.json({
        success: true,
        message: 'Forecast saved successfully', revision
      });
    } catch (error) {
      console.error('Error saving forecast:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save forecast'
      });
    }
  });

  /**
   * POST /api/forecasts/v1-overrides/:fiscalYear/batch
   * Batch save v1 overrides for multiple jobs
   * Body: { jobNumbers: ["job1", "job2", ...] }
   */
  router.post('/v1-overrides/:fiscalYear/batch', async (req, res) => {
    try {
      const { fiscalYear } = req.params;
      const { jobNumbers } = req.body;
      if (!isValidFiscalYear(fiscalYear)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid fiscal year format'
        });
      }

      if (!Array.isArray(jobNumbers)) {
        return res.status(400).json({
          success: false,
          error: 'jobNumbers must be an array'
        });
      }
      if (!jobNumbers.every(isValidJobNumber)) {
        return res.status(400).json({
          success: false,
          error: 'All job numbers must be non-empty strings with max length 100'
        });
      }

      // Use bulk save for all v1 overrides
      await db.saveAllV1Overrides(jobNumbers, fiscalYear);

      res.json({
        success: true,
        message: `${jobNumbers.length} v1 overrides saved successfully`
      });
    } catch (error) {
      console.error('Error saving v1 overrides batch:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save v1 overrides'
      });
    }
  });

  /**
   * GET /api/forecasts/v1-overrides/:fiscalYear
   * Get list of jobs with v1 overrides
   */
  router.get('/v1-overrides/:fiscalYear', async (req, res) => {
    try {
      const { fiscalYear } = req.params;
      if (!isValidFiscalYear(fiscalYear)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid fiscal year format'
        });
      }
      const overrides = await db.getV1Overrides(fiscalYear);

      res.json({
        success: true,
        data: overrides
      });
    } catch (error) {
      console.error('Error fetching v1 overrides:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch v1 overrides'
      });
    }
  });

  /**
   * POST /api/forecasts/v1-overrides/:fiscalYear/:jobNumber
   * Mark a job as having v1 overrides
   */
  router.post('/v1-overrides/:fiscalYear/:jobNumber', async (req, res) => {
    try {
      const { fiscalYear, jobNumber } = req.params;
      if (!isValidFiscalYear(fiscalYear) || !isValidJobNumber(jobNumber)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid fiscal year or job number format'
        });
      }
      await db.addV1Override(jobNumber, fiscalYear);

      res.json({
        success: true,
        message: 'V1 override added'
      });
    } catch (error) {
      console.error('Error adding v1 override:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add v1 override'
      });
    }
  });

  /**
   * DELETE /api/forecasts/v1-overrides/:fiscalYear/:jobNumber
   * Remove v1 override for a job
   */
  router.delete('/v1-overrides/:fiscalYear/:jobNumber', async (req, res) => {
    try {
      const { fiscalYear, jobNumber } = req.params;
      if (!isValidFiscalYear(fiscalYear) || !isValidJobNumber(jobNumber)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid fiscal year or job number format'
        });
      }
      await db.removeV1Override(jobNumber, fiscalYear);

      res.json({
        success: true,
        message: 'V1 override removed'
      });
    } catch (error) {
      console.error('Error removing v1 override:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to remove v1 override'
      });
    }
  });

  return router;
}

createForecastRoutes.validateForecastEntry = validateForecastEntry;
createForecastRoutes.validatePeriods = validatePeriods;
module.exports = createForecastRoutes;
