/**
 * PostgreSQL Database Service
 * Handles all database operations for forecasts, baselines, and comments using PostgreSQL
 * Compatible with Render's free PostgreSQL offering
 */

const { Pool } = require('pg');

class DatabaseServicePG {
  constructor() {
    // Use DATABASE_URL from environment (Render provides this automatically)
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false // Required for Render PostgreSQL
      } : false
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    console.log('PostgreSQL database service initialized');
  }

  // ========== Forecast Operations ==========

  /**
   * Save forecast data for a specific job
   * @param {string} jobNumber
   * @param {string} fiscalYear
   * @param {string} planVersion
   * @param {Object} forecastData - { periods: {...}, wgs: {...}, comments: {...} }
   */
  async saveForecast(jobNumber, fiscalYear, planVersion, forecastData) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const { wgs, comments } = forecastData;

      // Delete existing forecast data for this job
      await client.query(
        'DELETE FROM forecasts WHERE job_number = $1 AND fiscal_year = $2 AND plan_version = $3',
        [jobNumber, fiscalYear, planVersion]
      );

      // Insert forecast values for each work group and period
      for (const [workGroup, periods] of Object.entries(wgs)) {
        for (const [period, value] of Object.entries(periods)) {
          await client.query(
            `INSERT INTO forecasts (job_number, work_group, fiscal_year, plan_version, period, value, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
            [jobNumber, workGroup, fiscalYear, planVersion, period, value]
          );
        }

        // Save comment for this work group if exists
        if (comments && comments[workGroup]) {
          await client.query(
            `INSERT INTO forecast_comments (job_number, work_group, fiscal_year, plan_version, comment, updated_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             ON CONFLICT (job_number, work_group, fiscal_year, plan_version)
             DO UPDATE SET comment = EXCLUDED.comment, updated_at = CURRENT_TIMESTAMP`,
            [jobNumber, workGroup, fiscalYear, planVersion, comments[workGroup]]
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all forecasts for a fiscal year and plan version
   * @param {string} fiscalYear
   * @param {string} planVersion
   * @returns {Object} - Structured forecast data
   */
  async getForecastData(fiscalYear, planVersion) {
    const forecastsResult = await this.pool.query(
      `SELECT * FROM forecasts
       WHERE fiscal_year = $1 AND plan_version = $2
       ORDER BY job_number, work_group, period`,
      [fiscalYear, planVersion]
    );

    const commentsResult = await this.pool.query(
      `SELECT * FROM forecast_comments
       WHERE fiscal_year = $1 AND plan_version = $2`,
      [fiscalYear, planVersion]
    );

    const forecasts = forecastsResult.rows;
    const comments = commentsResult.rows;

    // Transform rows into the expected data structure
    const data = {};

    forecasts.forEach(row => {
      if (!data[row.job_number]) {
        data[row.job_number] = {
          periods: {},
          wgs: {},
          comments: {}
        };
      }

      if (!data[row.job_number].wgs[row.work_group]) {
        data[row.job_number].wgs[row.work_group] = {};
      }

      data[row.job_number].wgs[row.work_group][row.period] = parseFloat(row.value);
    });

    // Add comments
    comments.forEach(row => {
      if (data[row.job_number]) {
        data[row.job_number].comments[row.work_group] = row.comment;
      }
    });

    // Calculate period totals for each job
    Object.keys(data).forEach(jobNumber => {
      const job = data[jobNumber];
      job.periods = {};

      // Sum all work groups for each period
      Object.values(job.wgs).forEach(wgPeriods => {
        Object.entries(wgPeriods).forEach(([period, value]) => {
          job.periods[period] = (job.periods[period] || 0) + value;
        });
      });
    });

    return data;
  }

  /**
   * Get forecast for a specific job
   * @param {string} jobNumber
   * @param {string} fiscalYear
   * @param {string} planVersion
   */
  async getForecastByJob(jobNumber, fiscalYear, planVersion) {
    const forecastsResult = await this.pool.query(
      `SELECT * FROM forecasts
       WHERE job_number = $1 AND fiscal_year = $2 AND plan_version = $3
       ORDER BY work_group, period`,
      [jobNumber, fiscalYear, planVersion]
    );

    const commentsResult = await this.pool.query(
      `SELECT * FROM forecast_comments
       WHERE job_number = $1 AND fiscal_year = $2 AND plan_version = $3`,
      [jobNumber, fiscalYear, planVersion]
    );

    const forecasts = forecastsResult.rows;
    const comments = commentsResult.rows;

    const data = {
      periods: {},
      wgs: {},
      comments: {}
    };

    forecasts.forEach(row => {
      if (!data.wgs[row.work_group]) {
        data.wgs[row.work_group] = {};
      }
      data.wgs[row.work_group][row.period] = parseFloat(row.value);
    });

    comments.forEach(row => {
      data.comments[row.work_group] = row.comment;
    });

    // Calculate period totals
    Object.values(data.wgs).forEach(wgPeriods => {
      Object.entries(wgPeriods).forEach(([period, value]) => {
        data.periods[period] = (data.periods[period] || 0) + value;
      });
    });

    return data;
  }

  // ========== Job Comments Operations ==========

  /**
   * Save a job comment
   * @param {Object} comment - { id, jobNumber, category, text, timestamp, fy, rf }
   */
  async saveJobComment(comment) {
    await this.pool.query(
      `INSERT INTO job_comments (id, job_number, category, text, timestamp, fiscal_year, rf_stage)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         category = EXCLUDED.category,
         text = EXCLUDED.text,
         timestamp = EXCLUDED.timestamp,
         fiscal_year = EXCLUDED.fiscal_year,
         rf_stage = EXCLUDED.rf_stage`,
      [comment.id, comment.jobNumber, comment.category, comment.text, comment.timestamp, comment.fy, comment.rf]
    );
  }

  /**
   * Get all comments for a specific job
   * @param {string} jobNumber
   */
  async getJobComments(jobNumber) {
    const result = await this.pool.query(
      'SELECT * FROM job_comments WHERE job_number = $1 ORDER BY timestamp DESC',
      [jobNumber]
    );

    return result.rows.map(row => ({
      id: row.id,
      jobNumber: row.job_number,
      category: row.category,
      text: row.text,
      timestamp: row.timestamp,
      fy: row.fiscal_year,
      rf: row.rf_stage
    }));
  }

  /**
   * Get all job comments
   */
  async getAllJobComments() {
    const result = await this.pool.query(
      'SELECT * FROM job_comments ORDER BY timestamp DESC'
    );

    const commentStore = {};

    result.rows.forEach(row => {
      if (!commentStore[row.job_number]) {
        commentStore[row.job_number] = [];
      }
      commentStore[row.job_number].push({
        id: row.id,
        jobNumber: row.job_number,
        category: row.category,
        text: row.text,
        timestamp: row.timestamp,
        fy: row.fiscal_year,
        rf: row.rf_stage
      });
    });

    return commentStore;
  }

  /**
   * Delete a job comment
   * @param {string} commentId
   */
  async deleteJobComment(commentId) {
    await this.pool.query(
      'DELETE FROM job_comments WHERE id = $1',
      [commentId]
    );
  }

  // ========== Baseline Operations ==========

  /**
   * Save baseline for a job
   * @param {string} jobNumber
   * @param {number} totalValue
   */
  async saveBaseline(jobNumber, totalValue) {
    await this.pool.query(
      `INSERT INTO baselines (job_number, total_value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (job_number) DO UPDATE SET
         total_value = EXCLUDED.total_value,
         updated_at = CURRENT_TIMESTAMP`,
      [jobNumber, totalValue]
    );
  }

  /**
   * Get baseline for a specific job
   * @param {string} jobNumber
   */
  async getBaseline(jobNumber) {
    const result = await this.pool.query(
      'SELECT total_value FROM baselines WHERE job_number = $1',
      [jobNumber]
    );
    return result.rows.length > 0 ? parseFloat(result.rows[0].total_value) : null;
  }

  /**
   * Get all baselines
   */
  async getAllBaselines() {
    const result = await this.pool.query('SELECT * FROM baselines');
    const baselines = {};
    result.rows.forEach(row => {
      baselines[row.job_number] = parseFloat(row.total_value);
    });
    return baselines;
  }

  /**
   * Delete baseline for a job
   * @param {string} jobNumber
   */
  async deleteBaseline(jobNumber) {
    await this.pool.query(
      'DELETE FROM baselines WHERE job_number = $1',
      [jobNumber]
    );
  }

  /**
   * Bulk save baselines
   * @param {Object} baselines - { jobNumber: totalValue, ... }
   */
  async saveAllBaselines(baselines) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const [jobNumber, totalValue] of Object.entries(baselines)) {
        await client.query(
          `INSERT INTO baselines (job_number, total_value, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT (job_number) DO UPDATE SET
             total_value = EXCLUDED.total_value,
             updated_at = CURRENT_TIMESTAMP`,
          [jobNumber, totalValue]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ========== V1 Override Operations ==========

  /**
   * Mark a job as having v1 overrides
   * @param {string} jobNumber
   * @param {string} fiscalYear
   */
  async addV1Override(jobNumber, fiscalYear) {
    await this.pool.query(
      `INSERT INTO v1_overrides (job_number, fiscal_year)
       VALUES ($1, $2)
       ON CONFLICT (job_number, fiscal_year) DO NOTHING`,
      [jobNumber, fiscalYear]
    );
  }

  /**
   * Get all v1 overrides for a fiscal year
   * @param {string} fiscalYear
   */
  async getV1Overrides(fiscalYear) {
    const result = await this.pool.query(
      'SELECT job_number FROM v1_overrides WHERE fiscal_year = $1',
      [fiscalYear]
    );
    return result.rows.map(row => row.job_number);
  }

  /**
   * Remove v1 override
   * @param {string} jobNumber
   * @param {string} fiscalYear
   */
  async removeV1Override(jobNumber, fiscalYear) {
    await this.pool.query(
      'DELETE FROM v1_overrides WHERE job_number = $1 AND fiscal_year = $2',
      [jobNumber, fiscalYear]
    );
  }

  // ========== Utility ==========

  async close() {
    await this.pool.end();
  }
}

module.exports = DatabaseServicePG;
