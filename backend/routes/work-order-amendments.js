const express = require('express');
const { isPlainObject } = require('./validators');
const review = require('../../work-order-review');

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

  // Only matching source evidence can retire an active correction. Conflicts are never auto-overridden.
  router.post('/reconcile', async (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length > 5000 || items.some(item => !isPlainObject(item) || typeof item.orderId !== 'string' || !item.orderId || item.orderId.length > 500 || ['__proto__','constructor','prototype'].includes(item.orderId) || !Number.isInteger(item.expectedRevision) || item.expectedRevision < 0 || !review.validIdentity(item.identity) || typeof item.sourceUnits !== 'number' || !Number.isFinite(item.sourceUnits) || item.sourceUnits < 0)) {
      return res.status(400).json({ success: false, error: 'Invalid Work Order reconciliation evidence.' });
    }
    try {
      const results = [];
      for (const item of items) {
        try {
          const revision = await db.updateWorkOrderAmendment(item.orderId, null, item.expectedRevision, { identity: item.identity, sourceUnits: item.sourceUnits });
          results.push({ orderId: item.orderId, resolved: true, revision });
        } catch (error) {
          if (!['REVISION_CONFLICT','RECONCILIATION_MISMATCH'].includes(error.code)) throw error;
          results.push({ orderId: item.orderId, resolved: false });
        }
      }
      return res.json({ success: true, results });
    } catch (error) {
      console.error('Work Order reconciliation failed:', error);
      return res.status(500).json({ success: false, error: 'Work Order resolutions could not be confirmed. Retry the upload.' });
    }
  });

  router.put('/:orderId', async (req, res) => {
    try {
      const { value, expectedRevision } = req.body || {};
      const orderId = req.params.orderId;
      if (!orderId || orderId.length > 500 || ['__proto__', 'constructor', 'prototype'].includes(orderId) ||
          !Number.isInteger(expectedRevision) || expectedRevision < 0 ||
          (value !== null && (!isPlainObject(value) || typeof value.units !== 'number' || !Number.isFinite(value.units) || value.units < 0 || (value.identity !== undefined && !review.validIdentity(value.identity)) || (orderId.startsWith('wo2|') && (!review.validIdentity(value.identity) || review.stableId(value.identity) !== orderId)) || (value.reason !== undefined && (typeof value.reason !== 'string' || value.reason.length > 1000))))) {
        return res.status(400).json({ success: false, error: 'Invalid work order amendments payload' });
      }
      const correction = value === null ? null : { units: value.units, reason: (value.reason || '').trim(), updatedAt: new Date().toISOString(), status: 'active', ...(value.identity ? { identity: value.identity } : {}) };
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
