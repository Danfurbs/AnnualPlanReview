/**
 * Comments API Routes
 * Handles standalone job comments (review commentary)
 */

const express = require('express');
const router = express.Router();

module.exports = (db) => {
  /**
   * GET /api/comments
   * Get all job comments
   */
  router.get('/', async (req, res) => {
    try {
      const commentStore = await db.getAllJobComments();

      res.json({
        success: true,
        data: commentStore
      });
    } catch (error) {
      console.error('Error fetching comments:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch comments'
      });
    }
  });

  /**
   * GET /api/comments/:jobNumber
   * Get all comments for a specific job
   */
  router.get('/:jobNumber', async (req, res) => {
    try {
      const { jobNumber } = req.params;
      const comments = await db.getJobComments(jobNumber);

      res.json({
        success: true,
        data: comments
      });
    } catch (error) {
      console.error('Error fetching job comments:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch job comments'
      });
    }
  });

  /**
   * POST /api/comments
   * Save a job comment
   * Body: { id, jobNumber, category, text, timestamp, fy, rf }
   */
  router.post('/', async (req, res) => {
    try {
      const comment = req.body;

      // Validate required fields
      const requiredFields = ['id', 'jobNumber', 'category', 'text', 'timestamp', 'fy', 'rf'];
      const missingFields = requiredFields.filter(field => !comment[field]);

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      await db.saveJobComment(comment);

      res.json({
        success: true,
        message: 'Comment saved successfully'
      });
    } catch (error) {
      console.error('Error saving comment:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save comment'
      });
    }
  });

  /**
   * POST /api/comments/bulk
   * Save multiple job comments at once
   * Body: { commentStore: { jobNumber: [comments...], ... } }
   */
  router.post('/bulk', async (req, res) => {
    try {
      const { commentStore } = req.body;

      if (!commentStore || typeof commentStore !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Invalid comment store format'
        });
      }

      let count = 0;
      for (const [jobNumber, comments] of Object.entries(commentStore)) {
        for (const comment of comments) {
          await db.saveJobComment(comment);
          count++;
        }
      }

      res.json({
        success: true,
        message: 'Comments saved successfully',
        count: count
      });
    } catch (error) {
      console.error('Error saving comments:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save comments'
      });
    }
  });

  /**
   * DELETE /api/comments/:commentId
   * Delete a specific comment
   */
  router.delete('/:commentId', async (req, res) => {
    try {
      const { commentId } = req.params;
      await db.deleteJobComment(commentId);

      res.json({
        success: true,
        message: 'Comment deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete comment'
      });
    }
  });

  return router;
};
