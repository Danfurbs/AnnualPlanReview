const express = require('express');
const router = express.Router();
const { isValidJobNumber, isNonEmptyString } = require('./validators');

module.exports = (db) => {
  router.get('/', async (req, res) => {
    try {
      const groups = await db.getPublicGroups();
      res.json({ success: true, data: groups });
    } catch (error) {
      console.error('Error fetching public groups:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch public groups' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const group = req.body || {};
      if (!isNonEmptyString(group.name || '', 120)) {
        return res.status(400).json({ success: false, error: 'Group name is required and must be <= 120 characters' });
      }
      if (!Array.isArray(group.jobNumbers) || group.jobNumbers.length === 0) {
        return res.status(400).json({ success: false, error: 'jobNumbers must be a non-empty array' });
      }
      if (!group.jobNumbers.every(isValidJobNumber)) {
        return res.status(400).json({ success: false, error: 'Each job number must be a non-empty string <= 100 characters' });
      }
      const saved = await db.savePublicGroup(group);
      res.json({ success: true, data: saved });
    } catch (error) {
      console.error('Error saving public group:', error);
      res.status(500).json({ success: false, error: 'Failed to save public group' });
    }
  });

  router.delete('/:groupId', async (req, res) => {
    try {
      const { groupId } = req.params;
      await db.deletePublicGroup(groupId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting public group:', error);
      res.status(500).json({ success: false, error: 'Failed to delete public group' });
    }
  });

  return router;
};
