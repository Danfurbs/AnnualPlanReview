const express = require('express');
const { isPlainObject, isNonNegativeInteger } = require('./validators');

module.exports = function createReviewRoutes(db) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const { data, revision } = await db.getReviewSnapshot();
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, data, revision });
    } catch (error) {
      console.error('Error fetching review statuses:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch review statuses' });
    }
  });

  router.post('/bulk', async (req, res) => {
    try {
      const reviewStore = req.body?.reviewStore;
      const expectedRevision = req.body?.expectedRevision;
      if (!isPlainObject(reviewStore)) {
        return res.status(400).json({ success: false, error: 'Invalid review store format' });
      }
      if (!isNonNegativeInteger(expectedRevision)) return res.status(400).json({ success: false, error: 'expectedRevision must be a non-negative integer' });
      const revision = await db.saveAllReviewStatuses(reviewStore, expectedRevision);
      return res.json({ success: true, revision });
    } catch (error) {
      if (error.code === 'REVISION_CONFLICT') return res.status(409).json({ success: false, error: 'Review statuses changed since they were loaded. Reload before saving.' });
      console.error('Error saving review statuses:', error);
      return res.status(500).json({ success: false, error: 'Failed to save review statuses' });
    }
  });

  return router;
};
