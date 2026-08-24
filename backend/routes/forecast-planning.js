const express = require('express');

function requiredText(value, maxLength) {
  const text = String(value || '').trim();
  return text && text.length <= maxLength ? text : null;
}

module.exports = function createForecastPlanningRoutes(db) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const fiscalYear = requiredText(req.query.fiscalYear, 10);
    if (!fiscalYear) return res.status(400).json({ success: false, error: 'Valid fiscalYear is required' });
    try {
      return res.json({ success: true, data: await db.getForecastPlanningMetadata(fiscalYear) });
    } catch (error) {
      console.error('Failed to load forecast planning metadata:', error);
      return res.status(500).json({ success: false, error: 'Failed to load forecast planning metadata' });
    }
  });

  router.put('/', async (req, res) => {
    const fiscalYear = requiredText(req.body?.fiscalYear, 10);
    const engineerId = requiredText(req.body?.engineerId, 120);
    const jobNumber = requiredText(req.body?.jobNumber, 50);
    const workGroup = String(req.body?.workGroup || '').trim();
    if (!fiscalYear || !engineerId || !jobNumber || workGroup.length > 120 || typeof req.body?.forecasted !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Invalid planning metadata' });
    }
    try {
      const data = await db.saveForecastPlanningMetadata({ fiscalYear, engineerId, jobNumber, workGroup, forecasted: req.body.forecasted });
      return res.json({ success: true, data });
    } catch (error) {
      console.error('Failed to save forecast planning metadata:', error);
      return res.status(500).json({ success: false, error: 'Failed to save forecast planning metadata' });
    }
  });

  router.delete('/', async (req, res) => {
    const fiscalYear = requiredText(req.body?.fiscalYear, 10);
    const engineerId = requiredText(req.body?.engineerId, 120);
    const jobNumber = requiredText(req.body?.jobNumber, 50);
    const workGroup = String(req.body?.workGroup || '').trim();
    if (!fiscalYear || !engineerId || !jobNumber || workGroup.length > 120) {
      return res.status(400).json({ success: false, error: 'Invalid planning metadata key' });
    }
    try {
      await db.deleteForecastPlanningMetadata({ fiscalYear, engineerId, jobNumber, workGroup });
      return res.json({ success: true });
    } catch (error) {
      if (error.code === 'PLANNING_METADATA_HAS_FORECAST_DATA') {
        return res.status(409).json({ success: false, error: 'Planning entry cannot be removed after V0 data or comments exist' });
      }
      console.error('Failed to delete forecast planning metadata:', error);
      return res.status(500).json({ success: false, error: 'Failed to delete forecast planning metadata' });
    }
  });

  return router;
};
