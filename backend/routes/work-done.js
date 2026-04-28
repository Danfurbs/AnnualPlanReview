const express = require('express');
const router = express.Router();

module.exports = (db) => {
  router.get('/:fiscalYear', async (req, res) => {
    try {
      const { fiscalYear } = req.params;
      const payload = await db.getWorkDoneData(fiscalYear);
      res.json({ success: true, data: payload?.data || {}, uploadedAt: payload?.uploadedAt || null });
    } catch (error) {
      console.error('Error fetching work done:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch work done' });
    }
  });

  router.post('/:fiscalYear', async (req, res) => {
    try {
      const { fiscalYear } = req.params;
      const { data } = req.body || {};
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ success: false, error: 'Missing work done data payload' });
      }
      const uploadedAt = await db.saveWorkDoneData(fiscalYear, data);
      res.json({ success: true, uploadedAt });
    } catch (error) {
      console.error('Error saving work done:', error);
      res.status(500).json({ success: false, error: 'Failed to save work done' });
    }
  });

  router.delete('/:fiscalYear', async (req, res) => {
    try {
      const { fiscalYear } = req.params;
      await db.deleteWorkDoneData(fiscalYear);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting work done for fiscal year:', error);
      res.status(500).json({ success: false, error: 'Failed to delete work done snapshot' });
    }
  });

  router.delete('/', async (req, res) => {
    try {
      await db.clearAllWorkDoneData();
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing all work done snapshots:', error);
      res.status(500).json({ success: false, error: 'Failed to clear work done snapshots' });
    }
  });

  return router;
};
