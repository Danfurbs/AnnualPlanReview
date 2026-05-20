const express = require('express');

module.exports = function createReviewRoutes(db) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const data = await db.getAllReviewStatuses();
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching review statuses:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch review statuses' });
    }
  });

  router.post('/bulk', async (req, res) => {
    try {
      const reviewStore = req.body?.reviewStore;
      if (!reviewStore || typeof reviewStore !== 'object' || Array.isArray(reviewStore)) {
        return res.status(400).json({ success: false, error: 'Invalid review store format' });
      }
      await db.saveAllReviewStatuses(reviewStore);
      return res.json({ success: true });
    } catch (error) {
      console.error('Error saving review statuses:', error);
      return res.status(500).json({ success: false, error: 'Failed to save review statuses' });
    }
  });

  return router;
};
