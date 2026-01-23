/**
 * Baseline API Routes
 */

const express = require('express');
const router = express.Router();

module.exports = (db) => {
  /**
   * GET /api/baselines
   * Get all baselines
   */
  router.get('/', async (req, res) => {
    try {
      const baselines = await db.getAllBaselines();

      res.json({
        success: true,
        data: baselines
      });
    } catch (error) {
      console.error('Error fetching baselines:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch baselines'
      });
    }
  });

  /**
   * GET /api/baselines/:jobNumber
   * Get baseline for a specific job
   */
  router.get('/:jobNumber', async (req, res) => {
    try {
      const { jobNumber } = req.params;
      const value = await db.getBaseline(jobNumber);

      res.json({
        success: true,
        data: value
      });
    } catch (error) {
      console.error('Error fetching baseline:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch baseline'
      });
    }
  });

  /**
   * POST /api/baselines
   * Save all baselines
   * Body: { jobNumber: totalValue, ... }
   */
  router.post('/', async (req, res) => {
    try {
      const baselines = req.body;

      if (!baselines || typeof baselines !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Invalid baselines format'
        });
      }

      await db.saveAllBaselines(baselines);

      res.json({
        success: true,
        message: 'Baselines saved successfully',
        count: Object.keys(baselines).length
      });
    } catch (error) {
      console.error('Error saving baselines:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save baselines'
      });
    }
  });

  /**
   * POST /api/baselines/:jobNumber
   * Save baseline for a specific job
   * Body: { value: number }
   */
  router.post('/:jobNumber', async (req, res) => {
    try {
      const { jobNumber } = req.params;
      const { value } = req.body;

      if (typeof value !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'Invalid value format'
        });
      }

      await db.saveBaseline(jobNumber, value);

      res.json({
        success: true,
        message: 'Baseline saved successfully'
      });
    } catch (error) {
      console.error('Error saving baseline:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save baseline'
      });
    }
  });

  /**
   * DELETE /api/baselines/:jobNumber
   * Delete baseline for a specific job
   */
  router.delete('/:jobNumber', async (req, res) => {
    try {
      const { jobNumber } = req.params;
      await db.deleteBaseline(jobNumber);

      res.json({
        success: true,
        message: 'Baseline deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting baseline:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete baseline'
      });
    }
  });

  return router;
};
