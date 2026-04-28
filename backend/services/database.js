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
    this.ensureSchema();

    // Prepare common statements for better performance
    this.prepareStatements();
  }

  ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS forecasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_number TEXT NOT NULL,
        work_group TEXT NOT NULL,
        fiscal_year TEXT NOT NULL,
        plan_version TEXT NOT NULL,
        period TEXT NOT NULL,
        value REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_number, work_group, fiscal_year, plan_version, period)
      );
      CREATE TABLE IF NOT EXISTS forecast_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_number TEXT NOT NULL,
        work_group TEXT NOT NULL,
        fiscal_year TEXT NOT NULL,
        plan_version TEXT NOT NULL,
        comment TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_number, work_group, fiscal_year, plan_version)
      );
      CREATE TABLE IF NOT EXISTS job_comments (
        id TEXT PRIMARY KEY,
        job_number TEXT NOT NULL,
        category TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        fiscal_year TEXT NOT NULL,
        rf_stage TEXT NOT NULL,
        root_cause TEXT,
        corrective_action TEXT,
        owner TEXT,
        due_date TEXT,
        evidence_links_json TEXT,
        delivery_unit TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS baselines (
        job_number TEXT PRIMARY KEY,
        total_value REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS v1_overrides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_number TEXT NOT NULL,
        fiscal_year TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_number, fiscal_year)
      );
    `);

    this.ensureColumn('job_comments', 'root_cause', 'TEXT');
    this.ensureColumn('job_comments', 'corrective_action', 'TEXT');
    this.ensureColumn('job_comments', 'owner', 'TEXT');
    this.ensureColumn('job_comments', 'due_date', 'TEXT');
    this.ensureColumn('job_comments', 'evidence_links_json', 'TEXT');
    this.ensureColumn('job_comments', 'delivery_unit', 'TEXT');
  }

  ensureColumn(tableName, columnName, columnType) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some(column => column.name === columnName);
    if (!exists) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
    }
  }

  prepareStatements() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS public_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        roll_up INTEGER DEFAULT 0,
        job_numbers_json TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS work_done_snapshots (
        fiscal_year TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

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
      deleteForecastCommentsByJob: this.db.prepare(`
        DELETE FROM forecast_comments
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
        (id, job_number, category, text, timestamp, fiscal_year, rf_stage, root_cause, corrective_action, owner, due_date, evidence_links_json, delivery_unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      `),

      upsertPublicGroup: this.db.prepare(`
        INSERT OR REPLACE INTO public_groups
        (id, name, description, roll_up, job_numbers_json, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `),

      getPublicGroups: this.db.prepare(`
        SELECT * FROM public_groups ORDER BY updated_at DESC
      `),

      deletePublicGroup: this.db.prepare(`
        DELETE FROM public_groups WHERE id = ?
      `),

      upsertWorkDoneSnapshot: this.db.prepare(`
        INSERT OR REPLACE INTO work_done_snapshots
        (fiscal_year, data_json, uploaded_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `),

      getWorkDoneSnapshot: this.db.prepare(`
        SELECT * FROM work_done_snapshots WHERE fiscal_year = ?
      `),

      deleteWorkDoneSnapshot: this.db.prepare(`
        DELETE FROM work_done_snapshots WHERE fiscal_year = ?
      `),

      clearAllWorkDoneSnapshots: this.db.prepare(`
        DELETE FROM work_done_snapshots
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
      this.stmts.deleteForecastCommentsByJob.run(jobNumber, fiscalYear, planVersion);

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
      comment.rf,
      comment.rootCause || null,
      comment.correctiveAction || null,
      comment.owner || null,
      comment.dueDate || null,
      JSON.stringify(Array.isArray(comment.evidenceLinks) ? comment.evidenceLinks : []),
      comment.deliveryUnit || null
    );
  }

  /**
   * Bulk save job comments in a single transaction
   * @param {Array<Object>} comments - Array of comment objects
   */
  saveAllJobComments(comments) {
    if (!Array.isArray(comments) || comments.length === 0) return;

    const saveTransaction = this.db.transaction((items) => {
      for (const comment of items) {
        this.stmts.insertJobComment.run(
          comment.id,
          comment.jobNumber,
          comment.category,
          comment.text,
          comment.timestamp,
          comment.fy,
          comment.rf,
          comment.rootCause || null,
          comment.correctiveAction || null,
          comment.owner || null,
          comment.dueDate || null,
          JSON.stringify(Array.isArray(comment.evidenceLinks) ? comment.evidenceLinks : []),
          comment.deliveryUnit || null
        );
      }
    });

    saveTransaction(comments);
  }

  /**
   * Get all comments for a specific job
   * @param {string} jobNumber
   */
  getJobComments(jobNumber) {
    return this.stmts.getJobComments.all(jobNumber).map(row => this.mapJobCommentRow(row));
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
        ...this.mapJobCommentRow(row)
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

  /**
   * Bulk save all forecasts in a single transaction
   * @param {Object} data - { jobNumber: { periods, wgs, comments }, ... }
   * @param {string} fiscalYear
   * @param {string} planVersion
   */
  saveAllForecasts(data, fiscalYear, planVersion) {
    const saveTransaction = this.db.transaction((forecastData) => {
      for (const [jobNumber, jobData] of Object.entries(forecastData)) {
        const { wgs, comments } = jobData;

        // Delete existing forecast data for this job
        this.stmts.deleteForecastsByJob.run(jobNumber, fiscalYear, planVersion);
        this.stmts.deleteForecastCommentsByJob.run(jobNumber, fiscalYear, planVersion);

        // Insert forecast values for each work group and period
        for (const [workGroup, periods] of Object.entries(wgs || {})) {
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
      }
    });

    saveTransaction(data);
  }

  mapJobCommentRow(row) {
    return {
      id: row.id,
      jobNumber: row.job_number,
      category: row.category,
      text: row.text,
      timestamp: row.timestamp,
      fy: row.fiscal_year,
      rf: row.rf_stage,
      rootCause: row.root_cause || '',
      correctiveAction: row.corrective_action || '',
      owner: row.owner || '',
      dueDate: row.due_date || '',
      evidenceLinks: this.parseEvidenceLinks(row.evidence_links_json),
      deliveryUnit: row.delivery_unit || ''
    };
  }

  parseEvidenceLinks(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Bulk save v1 overrides in a single transaction
   * @param {Array<string>} jobNumbers - Array of job numbers
   * @param {string} fiscalYear
   */
  saveAllV1Overrides(jobNumbers, fiscalYear) {
    const saveTransaction = this.db.transaction((jobs) => {
      for (const jobNumber of jobs) {
        this.stmts.insertV1Override.run(jobNumber, fiscalYear);
      }
    });

    saveTransaction(jobNumbers);
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

  getPublicGroups() {
    return this.stmts.getPublicGroups.all().map(row => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      rollUp: Boolean(row.roll_up),
      jobNumbers: JSON.parse(row.job_numbers_json || '[]'),
      scope: 'public'
    }));
  }

  savePublicGroup(group) {
    const id = group.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.stmts.upsertPublicGroup.run(
      id,
      group.name || 'Unnamed Group',
      group.description || '',
      group.rollUp ? 1 : 0,
      JSON.stringify(group.jobNumbers || [])
    );
    return { ...group, id, scope: 'public' };
  }

  deletePublicGroup(groupId) {
    this.stmts.deletePublicGroup.run(groupId);
  }

  saveWorkDoneData(fiscalYear, data) {
    this.stmts.upsertWorkDoneSnapshot.run(fiscalYear, JSON.stringify(data || {}));
    const row = this.stmts.getWorkDoneSnapshot.get(fiscalYear);
    return row?.uploaded_at || new Date().toISOString();
  }

  getWorkDoneData(fiscalYear) {
    const row = this.stmts.getWorkDoneSnapshot.get(fiscalYear);
    if (!row) return null;
    return {
      data: JSON.parse(row.data_json || '{}'),
      uploadedAt: row.uploaded_at
    };
  }

  deleteWorkDoneData(fiscalYear) {
    this.stmts.deleteWorkDoneSnapshot.run(fiscalYear);
  }

  clearAllWorkDoneData() {
    this.stmts.clearAllWorkDoneSnapshots.run();
  }

  // ========== Utility ==========

  ping() {
    const row = this.db.prepare('SELECT 1 AS ok').get();
    return row && row.ok === 1;
  }

  close() {
    this.db.close();
  }
}

module.exports = DatabaseService;
