/**
 * Forecast API Routes
 */

const express = require('express');
const router = express.Router();

module.exports = (db) => {
  /**
   * GET /api/forecasts/:fiscalYear/:planVersion
   * Get all forecasts for a fiscal year and plan version
   */
  router.get('/:fiscalYear/:planVersion', async (req, res) => {
    try {
      const { fiscalYear, planVersion } = req.params;
      const data = await db.getForecastData(fiscalYear, planVersion);

      res.json({
        success: true,
        data: data,
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
      const { data } = req.body;

      if (!data || typeof data !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Invalid data format'
        });
      }

      // Use bulk save for all forecasts in a single transaction
      await db.saveAllForecasts(data, fiscalYear, planVersion);

      res.json({
        success: true,
        message: 'Forecasts saved successfully',
        rowCount: Object.keys(data).length
      });
    } catch (error) {
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

      if (!forecastData.wgs || typeof forecastData.wgs !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Invalid forecast data format'
        });
      }

      await db.saveForecast(jobNumber, fiscalYear, planVersion, forecastData);

      res.json({
        success: true,
        message: 'Forecast saved successfully'
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

      if (!Array.isArray(jobNumbers)) {
        return res.status(400).json({
          success: false,
          error: 'jobNumbers must be an array'
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
};
