/**
 * Comments API Routes
 * Handles standalone job comments (review commentary)
 */

const express = require('express');
const router = express.Router();
const {
  isValidJobNumber,
  isValidFiscalYear,
  isNonEmptyString,
  isPlainObject,
  isNullOrUndefined
} = require('./validators');

const VALID_RF_STAGE = new Set(['RF3', 'RF6', 'RF9', 'RF11', 'IME']);

function hasRequiredCommentFields(comment) {
  const requiredFields = ['id', 'jobNumber', 'category', 'text', 'timestamp', 'fy', 'rf'];
  if (!isPlainObject(comment)) {
    return requiredFields;
  }
  return requiredFields.filter(field => isNullOrUndefined(comment[field]) || (typeof comment[field] === 'string' && comment[field].trim() === ''));
}

function normalizeEvidenceLinks(comment) {
  if (!Array.isArray(comment.evidenceLinks)) return [];
  return comment.evidenceLinks
    .map(link => String(link || '').trim())
    .filter(Boolean);
}


function normalizeOptionalCommentFields(comment) {
  if (!isPlainObject(comment)) return comment;

  const optionalFieldMaxLengths = {
    owner: 120,
    rootCause: 2000,
    correctiveAction: 2000,
    dueDate: 30,
    filteredWorkGroup: 120,
    filteredEngineerId: 120,
    filteredEngineerName: 200
  };

  Object.entries(optionalFieldMaxLengths).forEach(([field, maxLength]) => {
    if (comment[field] === undefined || comment[field] === null) {
      return;
    }

    const value = String(comment[field]).trim();
    if (!value) {
      delete comment[field];
      return;
    }

    comment[field] = value;
  });

  return comment;
}

function validateCommentShape(comment) {
  if (!isNonEmptyString(comment.id || '', 100)) return 'Invalid comment id';
  if (!isValidJobNumber(comment.jobNumber)) return 'Invalid job number format';
  if (!isNonEmptyString(comment.category || '', 50)) return 'Category is required (max 50 chars)';
  if (!isNonEmptyString(comment.text || '', 5000)) return 'Comment text is required (max 5000 chars)';
  if (!isValidFiscalYear(comment.fy || '')) return 'Invalid fiscal year';
  if (!VALID_RF_STAGE.has(comment.rf)) return 'Invalid review stage';
  if (comment.owner !== undefined && !isNonEmptyString(comment.owner || '', 120)) return 'Owner must be <= 120 chars when provided';
  if (comment.rootCause !== undefined && String(comment.rootCause).length > 2000) return 'Root cause must be <= 2000 chars';
  if (comment.correctiveAction !== undefined && String(comment.correctiveAction).length > 2000) return 'Corrective action must be <= 2000 chars';
  if (comment.dueDate !== undefined && String(comment.dueDate).length > 30) return 'Due date must be <= 30 chars';
  if (comment.filteredWorkGroup !== undefined && String(comment.filteredWorkGroup).length > 120) return 'Filtered work group must be <= 120 chars';
  if (comment.filteredEngineerId !== undefined && String(comment.filteredEngineerId).length > 120) return 'Filtered engineer id must be <= 120 chars';
  if (comment.filteredEngineerName !== undefined && String(comment.filteredEngineerName).length > 200) return 'Filtered engineer name must be <= 200 chars';
  const links = normalizeEvidenceLinks(comment);
  if (links.length > 20) return 'Maximum 20 evidence links per comment';
  if (!links.every(link => /^https?:\/\//i.test(link))) return 'Evidence links must start with http:// or https://';
  return null;
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
      const comment = normalizeOptionalCommentFields(req.body);

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
      const validationError = validateCommentShape(comment);
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: validationError
        });
      }
      comment.evidenceLinks = normalizeEvidenceLinks(comment);

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
          normalizeOptionalCommentFields(comment);
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
          const validationError = validateCommentShape(comment);
          if (validationError) {
            return res.status(400).json({
              success: false,
              error: `Job ${jobNumber}: ${validationError}`
            });
          }
          comment.evidenceLinks = normalizeEvidenceLinks(comment);
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
