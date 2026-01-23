/**
 * Database Service
 * Handles all database operations for forecasts, baselines, and comments
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DatabaseService {
  constructor() {
    // Support environment variable for database path
    const dbPath = process.env.DATABASE_PATH
      ? path.resolve(process.env.DATABASE_PATH)
      : path.join(__dirname, '..', 'db', 'apr.db');

    // Ensure database directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');

    // Prepare common statements for better performance
    this.prepareStatements();
  }

  prepareStatements() {
    // Forecast statements
    this.stmts = {
      insertForecast: this.db.prepare(`
        INSERT OR REPLACE INTO forecasts
        (job_number, work_group, fiscal_year, plan_version, period, value, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `),

      getForecastsByYear: this.db.prepare(`
        SELECT * FROM forecasts
        WHERE fiscal_year = ? AND plan_version = ?
        ORDER BY job_number, work_group, period
      `),

      getForecastsByJob: this.db.prepare(`
        SELECT * FROM forecasts
        WHERE job_number = ? AND fiscal_year = ? AND plan_version = ?
        ORDER BY work_group, period
      `),

      deleteForecastsByJob: this.db.prepare(`
        DELETE FROM forecasts
        WHERE job_number = ? AND fiscal_year = ? AND plan_version = ?
      `),

      // Forecast comments
      insertForecastComment: this.db.prepare(`
        INSERT OR REPLACE INTO forecast_comments
        (job_number, work_group, fiscal_year, plan_version, comment, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `),

      getForecastComments: this.db.prepare(`
        SELECT * FROM forecast_comments
        WHERE fiscal_year = ? AND plan_version = ?
      `),

      getForecastCommentsByJob: this.db.prepare(`
        SELECT * FROM forecast_comments
        WHERE job_number = ? AND fiscal_year = ? AND plan_version = ?
      `),

      // Job comments
      insertJobComment: this.db.prepare(`
        INSERT OR REPLACE INTO job_comments
        (id, job_number, category, text, timestamp, fiscal_year, rf_stage)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),

      getJobComments: this.db.prepare(`
        SELECT * FROM job_comments
        WHERE job_number = ?
        ORDER BY timestamp DESC
      `),

      getAllJobComments: this.db.prepare(`
        SELECT * FROM job_comments
        ORDER BY timestamp DESC
      `),

      deleteJobComment: this.db.prepare(`
        DELETE FROM job_comments WHERE id = ?
      `),

      // Baselines
      insertBaseline: this.db.prepare(`
        INSERT OR REPLACE INTO baselines
        (job_number, total_value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `),

      getBaseline: this.db.prepare(`
        SELECT * FROM baselines WHERE job_number = ?
      `),

      getAllBaselines: this.db.prepare(`
        SELECT * FROM baselines
      `),

      deleteBaseline: this.db.prepare(`
        DELETE FROM baselines WHERE job_number = ?
      `),

      // V1 Overrides
      insertV1Override: this.db.prepare(`
        INSERT OR IGNORE INTO v1_overrides (job_number, fiscal_year)
        VALUES (?, ?)
      `),

      getV1Overrides: this.db.prepare(`
        SELECT job_number FROM v1_overrides WHERE fiscal_year = ?
      `),

      deleteV1Override: this.db.prepare(`
        DELETE FROM v1_overrides WHERE job_number = ? AND fiscal_year = ?
      `)
    };
  }

  // ========== Forecast Operations ==========

  /**
   * Save forecast data for a specific job
   * @param {string} jobNumber
   * @param {string} fiscalYear
   * @param {string} planVersion
   * @param {Object} forecastData - { periods: {...}, wgs: {...}, comments: {...} }
   */
  saveForecast(jobNumber, fiscalYear, planVersion, forecastData) {
    const saveTransaction = this.db.transaction((data) => {
      const { wgs, comments } = data;

      // Delete existing forecast data for this job
      this.stmts.deleteForecastsByJob.run(jobNumber, fiscalYear, planVersion);

      // Insert forecast values for each work group and period
      for (const [workGroup, periods] of Object.entries(wgs)) {
        for (const [period, value] of Object.entries(periods)) {
          this.stmts.insertForecast.run(
            jobNumber, workGroup, fiscalYear, planVersion, period, value
          );
        }

        // Save comment for this work group if exists
        if (comments && comments[workGroup]) {
          this.stmts.insertForecastComment.run(
            jobNumber, workGroup, fiscalYear, planVersion, comments[workGroup]
          );
        }
      }
    });

    saveTransaction(forecastData);
  }

  /**
   * Get all forecasts for a fiscal year and plan version
   * @param {string} fiscalYear
   * @param {string} planVersion
   * @returns {Object} - Structured forecast data
   */
  getForecastData(fiscalYear, planVersion) {
    const forecasts = this.stmts.getForecastsByYear.all(fiscalYear, planVersion);
    const comments = this.stmts.getForecastComments.all(fiscalYear, planVersion);

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

      data[row.job_number].wgs[row.work_group][row.period] = row.value;
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
  getForecastByJob(jobNumber, fiscalYear, planVersion) {
    const forecasts = this.stmts.getForecastsByJob.all(jobNumber, fiscalYear, planVersion);
    const comments = this.stmts.getForecastCommentsByJob.all(jobNumber, fiscalYear, planVersion);

    const data = {
      periods: {},
      wgs: {},
      comments: {}
    };

    forecasts.forEach(row => {
      if (!data.wgs[row.work_group]) {
        data.wgs[row.work_group] = {};
      }
      data.wgs[row.work_group][row.period] = row.value;
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
  saveJobComment(comment) {
    this.stmts.insertJobComment.run(
      comment.id,
      comment.jobNumber,
      comment.category,
      comment.text,
      comment.timestamp,
      comment.fy,
      comment.rf
    );
  }

  /**
   * Get all comments for a specific job
   * @param {string} jobNumber
   */
  getJobComments(jobNumber) {
    return this.stmts.getJobComments.all(jobNumber).map(row => ({
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
  getAllJobComments() {
    const rows = this.stmts.getAllJobComments.all();
    const commentStore = {};

    rows.forEach(row => {
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
  deleteJobComment(commentId) {
    this.stmts.deleteJobComment.run(commentId);
  }

  // ========== Baseline Operations ==========

  /**
   * Save baseline for a job
   * @param {string} jobNumber
   * @param {number} totalValue
   */
  saveBaseline(jobNumber, totalValue) {
    this.stmts.insertBaseline.run(jobNumber, totalValue);
  }

  /**
   * Get baseline for a specific job
   * @param {string} jobNumber
   */
  getBaseline(jobNumber) {
    const row = this.stmts.getBaseline.get(jobNumber);
    return row ? row.total_value : null;
  }

  /**
   * Get all baselines
   */
  getAllBaselines() {
    const rows = this.stmts.getAllBaselines.all();
    const baselines = {};
    rows.forEach(row => {
      baselines[row.job_number] = row.total_value;
    });
    return baselines;
  }

  /**
   * Delete baseline for a job
   * @param {string} jobNumber
   */
  deleteBaseline(jobNumber) {
    this.stmts.deleteBaseline.run(jobNumber);
  }

  /**
   * Bulk save baselines
   * @param {Object} baselines - { jobNumber: totalValue, ... }
   */
  saveAllBaselines(baselines) {
    const saveTransaction = this.db.transaction((data) => {
      Object.entries(data).forEach(([jobNumber, totalValue]) => {
        this.stmts.insertBaseline.run(jobNumber, totalValue);
      });
    });

    saveTransaction(baselines);
  }

  // ========== V1 Override Operations ==========

  /**
   * Mark a job as having v1 overrides
   * @param {string} jobNumber
   * @param {string} fiscalYear
   */
  addV1Override(jobNumber, fiscalYear) {
    this.stmts.insertV1Override.run(jobNumber, fiscalYear);
  }

  /**
   * Get all v1 overrides for a fiscal year
   * @param {string} fiscalYear
   */
  getV1Overrides(fiscalYear) {
    return this.stmts.getV1Overrides.all(fiscalYear).map(row => row.job_number);
  }

  /**
   * Remove v1 override
   * @param {string} jobNumber
   * @param {string} fiscalYear
   */
  removeV1Override(jobNumber, fiscalYear) {
    this.stmts.deleteV1Override.run(jobNumber, fiscalYear);
  }

  // ========== Utility ==========

  close() {
    this.db.close();
  }
}

module.exports = DatabaseService;
