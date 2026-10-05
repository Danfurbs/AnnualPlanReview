const express = require('express');
const { isPlainObject } = require('./validators');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const { data, revisions } = await db.getWorkOrderAmendmentSnapshot();
      res.json({ success: true, data: data || {}, revisions });
    } catch (error) {
      console.error('Error fetching work order amendments:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch work order amendments' });
    }
  });

  // Older clients must not replace corrections saved by another user.
  router.post('/', (req, res) => res.status(409).json({ success: false, error: 'Reload the application to save individual Work Order corrections safely.' }));

  router.put('/:orderId', async (req, res) => {
    try {
      const { value, expectedRevision } = req.body || {};
      const orderId = req.params.orderId;
      if (!orderId || orderId.length > 500 || ['__proto__', 'constructor', 'prototype'].includes(orderId) ||
          !Number.isInteger(expectedRevision) || expectedRevision < 0 ||
          (value !== null && (!isPlainObject(value) || typeof value.units !== 'number' || !Number.isFinite(value.units)))) {
        return res.status(400).json({ success: false, error: 'Invalid work order amendments payload' });
      }
      const correction = value === null ? null : { units: value.units, updatedAt: new Date().toISOString() };
      const revision = await db.updateWorkOrderAmendment(orderId, correction, expectedRevision);
      return res.json({ success: true, revision, value: correction });
    } catch (error) {
      if (error.code === 'REVISION_CONFLICT') return res.status(409).json({ success: false, error: 'This Work Order correction changed in another session. Your draft has been retained.' });
      console.error('Error saving work order amendments:', error);
      return res.status(500).json({ success: false, error: 'Failed to save work order amendments' });
    }
  });

  return router;
};
