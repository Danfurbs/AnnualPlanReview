/**
 * Comments API Routes
 * Handles standalone job comments (review commentary)
 */

const express = require('express');
const router = express.Router();

function isValidJobNumber(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 100;
}

function hasRequiredCommentFields(comment) {
  const requiredFields = ['id', 'jobNumber', 'category', 'text', 'timestamp', 'fy', 'rf'];
  if (!comment || typeof comment !== 'object' || Array.isArray(comment)) {
    return requiredFields;
  }
  return requiredFields.filter(field => !comment[field]);
}

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
      if (!isValidJobNumber(jobNumber)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job number format'
        });
      }
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
      const missingFields = hasRequiredCommentFields(comment);

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`
        });
      }
      if (!isValidJobNumber(comment.jobNumber)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job number format'
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

      const commentsToSave = [];
      let count = 0;
      for (const [jobNumber, comments] of Object.entries(commentStore)) {
        if (!isValidJobNumber(jobNumber)) {
          return res.status(400).json({
            success: false,
            error: `Invalid job number in comment store: ${jobNumber}`
          });
        }
        if (!Array.isArray(comments)) {
          return res.status(400).json({
            success: false,
            error: `Comments for job ${jobNumber} must be an array`
          });
        }
        for (const comment of comments) {
          const missingFields = hasRequiredCommentFields(comment);
          if (missingFields.length > 0) {
            return res.status(400).json({
              success: false,
              error: `Job ${jobNumber} has comments missing required fields: ${missingFields.join(', ')}`
            });
          }
          if (comment.jobNumber !== jobNumber) {
            return res.status(400).json({
              success: false,
              error: `Comment jobNumber mismatch for ${jobNumber}: received ${comment.jobNumber}`
            });
          }
          commentsToSave.push(comment);
          count++;
        }
      }
      if (count > 10000) {
        return res.status(413).json({
          success: false,
          error: 'Comment bulk payload too large (max 10,000 comments per request)'
        });
      }

      const startedAt = Date.now();
      if (typeof db.saveAllJobComments === 'function') {
        await db.saveAllJobComments(commentsToSave);
      } else {
        for (const comment of commentsToSave) {
          await db.saveJobComment(comment);
        }
      }
      const durationMs = Date.now() - startedAt;

      res.json({
        success: true,
        message: 'Comments saved successfully',
        count: count,
        durationMs
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
      if (typeof commentId !== 'string' || commentId.trim().length === 0 || commentId.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Invalid comment ID format'
        });
      }
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
