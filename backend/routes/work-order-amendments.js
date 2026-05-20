const express = require('express');
const { isPlainObject } = require('./validators');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const data = await db.getWorkOrderAmendments();
      res.json({ success: true, data: data || {} });
    } catch (error) {
      console.error('Error fetching work order amendments:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch work order amendments' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { data } = req.body || {};
      if (!isPlainObject(data)) {
        return res.status(400).json({ success: false, error: 'Invalid work order amendments payload' });
      }
      await db.saveWorkOrderAmendments(data);
      return res.json({ success: true });
    } catch (error) {
      console.error('Error saving work order amendments:', error);
      return res.status(500).json({ success: false, error: 'Failed to save work order amendments' });
    }
  });

  return router;
};
