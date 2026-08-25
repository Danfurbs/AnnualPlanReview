/**
 * Database Service
 * Handles all database operations for forecasts, baselines, and comments
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function revisionConflict() {
  const error = new Error('Revision conflict');
  error.code = 'REVISION_CONFLICT';
  return error;
}

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
        filtered_work_group TEXT,
        filtered_engineer_id TEXT,
        filtered_engineer_name TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS baselines (
        job_number TEXT PRIMARY KEY,
        total_value REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS review_statuses (
        job_number TEXT NOT NULL,
        fiscal_year TEXT NOT NULL,
        rf_stage TEXT NOT NULL,
        reviewed_at TEXT NOT NULL,
        PRIMARY KEY(job_number, fiscal_year, rf_stage)
      );
      CREATE TABLE IF NOT EXISTS revisions (
        scope TEXT NOT NULL, data_key TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(scope, data_key)
      );
      CREATE TABLE IF NOT EXISTS work_order_amendments (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data_json TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS v1_overrides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_number TEXT NOT NULL,
        fiscal_year TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_number, fiscal_year)
      );
      CREATE TABLE IF NOT EXISTS forecast_planning_metadata (
        fiscal_year TEXT NOT NULL,
        engineer_id TEXT NOT NULL,
        job_number TEXT NOT NULL,
        work_group TEXT NOT NULL DEFAULT '',
        forecasted INTEGER NOT NULL DEFAULT 0,
        manually_added INTEGER,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(fiscal_year, engineer_id, job_number, work_group)
      );
    `);

    this.ensureColumn('job_comments', 'root_cause', 'TEXT');
    this.ensureColumn('forecast_planning_metadata', 'manually_added', 'INTEGER');
    this.ensureColumn('job_comments', 'corrective_action', 'TEXT');
    this.ensureColumn('job_comments', 'owner', 'TEXT');
    this.ensureColumn('job_comments', 'due_date', 'TEXT');
    this.ensureColumn('job_comments', 'evidence_links_json', 'TEXT');
    this.ensureColumn('job_comments', 'delivery_unit', 'TEXT');
    this.ensureColumn('job_comments', 'filtered_work_group', 'TEXT');
    this.ensureColumn('job_comments', 'filtered_engineer_id', 'TEXT');
    this.ensureColumn('job_comments', 'filtered_engineer_name', 'TEXT');
    this.migrateReviewStatusesSchema();
  }

  migrateReviewStatusesSchema() {
    const columns = this.db.prepare('PRAGMA table_info(review_statuses)').all();
    const hasFiscalYear = columns.some(column => column.name === 'fiscal_year');
    const primaryKey = columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk).map(column => column.name);
    if (hasFiscalYear && primaryKey.join(',') === 'job_number,fiscal_year,rf_stage') return;
    this.db.exec(`
      ALTER TABLE review_statuses RENAME TO review_statuses_legacy;
      CREATE TABLE review_statuses (
        job_number TEXT NOT NULL, fiscal_year TEXT NOT NULL, rf_stage TEXT NOT NULL,
        reviewed_at TEXT NOT NULL, PRIMARY KEY(job_number, fiscal_year, rf_stage)
      );
      INSERT INTO review_statuses (job_number, fiscal_year, rf_stage, reviewed_at)
      SELECT job_number, '', rf_stage, reviewed_at FROM review_statuses_legacy;
      DROP TABLE review_statuses_legacy;
    `);
  }

  ensureColumn(tableName, columnName, columnType) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some(column => column.name === columnName);
    if (!exists) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
      return true;
    }
    return false;
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
      deleteForecastsByVersion: this.db.prepare(`DELETE FROM forecasts WHERE fiscal_year = ? AND plan_version = ?`),
      deleteForecastCommentsByVersion: this.db.prepare(`DELETE FROM forecast_comments WHERE fiscal_year = ? AND plan_version = ?`),
      getRevision: this.db.prepare(`SELECT revision FROM revisions WHERE scope = ? AND data_key = ?`),
      setRevision: this.db.prepare(`INSERT INTO revisions(scope, data_key, revision) VALUES (?, ?, ?) ON CONFLICT(scope, data_key) DO UPDATE SET revision = excluded.revision`),

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
        (id, job_number, category, text, timestamp, fiscal_year, rf_stage, root_cause, corrective_action, owner, due_date, evidence_links_json, delivery_unit, filtered_work_group, filtered_engineer_id, filtered_engineer_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

      getSjnLifetimeTarget: this.db.prepare(`
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

      deleteV1OverridesByYear: this.db.prepare(`
        DELETE FROM v1_overrides WHERE fiscal_year = ?
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
      `),

      upsertReviewStatus: this.db.prepare(`
        INSERT OR REPLACE INTO review_statuses (job_number, fiscal_year, rf_stage, reviewed_at)
        VALUES (?, ?, ?, ?)
      `),
      deleteAllReviewStatuses: this.db.prepare(`DELETE FROM review_statuses`),
      getAllReviewStatuses: this.db.prepare(`SELECT * FROM review_statuses`),
      upsertWorkOrderAmendments: this.db.prepare(`
        INSERT OR REPLACE INTO work_order_amendments (id, data_json, updated_at)
        VALUES (1, ?, CURRENT_TIMESTAMP)
      `),
      getWorkOrderAmendments: this.db.prepare(`SELECT data_json FROM work_order_amendments WHERE id = 1`)
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
  saveForecast(jobNumber, fiscalYear, planVersion, forecastData, expectedRevision) {
    const saveTransaction = this.db.transaction((data) => {
      const { wgs, comments } = data;

      const key = `${fiscalYear}:${planVersion}`;
      const current = this.getRevision('forecast', key);
      if (current !== expectedRevision) throw revisionConflict();

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
      const revision = current + 1;
      this.stmts.setRevision.run('forecast', key, revision);
      return revision;
    });

    return saveTransaction(forecastData);
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
      comment.deliveryUnit || null,
      comment.filteredWorkGroup || null,
      comment.filteredEngineerId || null,
      comment.filteredEngineerName || null
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
          comment.deliveryUnit || null,
          comment.filteredWorkGroup || null,
          comment.filteredEngineerId || null,
          comment.filteredEngineerName || null
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
  getSjnLifetimeTarget(jobNumber) {
    const row = this.stmts.getSjnLifetimeTarget.get(jobNumber);
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
  saveAllForecasts(data, fiscalYear, planVersion, expectedRevision) {
    const saveTransaction = this.db.transaction((forecastData) => {
      const key = `${fiscalYear}:${planVersion}`;
      const current = this.getRevision('forecast', key);
      if (current !== expectedRevision) throw revisionConflict();
      this.stmts.deleteForecastsByVersion.run(fiscalYear, planVersion);
      this.stmts.deleteForecastCommentsByVersion.run(fiscalYear, planVersion);
      for (const [jobNumber, jobData] of Object.entries(forecastData)) {
        const { wgs, comments } = jobData;

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
      const revision = current + 1;
      this.stmts.setRevision.run('forecast', key, revision);
      return revision;
    });

    return saveTransaction(data);
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
      deliveryUnit: row.delivery_unit || '',
      filteredWorkGroup: row.filtered_work_group || '',
      filteredEngineerId: row.filtered_engineer_id || '',
      filteredEngineerName: row.filtered_engineer_name || ''
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
      // Replace the complete set; an empty array must clear stale overrides.
      this.stmts.deleteV1OverridesByYear.run(fiscalYear);
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

  

  saveAllReviewStatuses(reviewStore, expectedRevision) {
    const tx = this.db.transaction((store) => {
      const current = this.getRevision('reviews', 'all');
      if (current !== expectedRevision) throw revisionConflict();
      this.stmts.deleteAllReviewStatuses.run();
      Object.entries(store || {}).forEach(([jobNumber, years]) => {
        Object.entries(years || {}).forEach(([fiscalYear, stages]) => {
          Object.entries(stages || {}).forEach(([stage, value]) => {
            const reviewedAt = value?.reviewedAt || new Date().toISOString();
            this.stmts.upsertReviewStatus.run(jobNumber, fiscalYear, stage, reviewedAt);
          });
        });
      });
      const revision = current + 1;
      this.stmts.setRevision.run('reviews', 'all', revision);
      return revision;
    });
    return tx(reviewStore);
  }

  getAllReviewStatuses() {
    const rows = this.stmts.getAllReviewStatuses.all();
    const out = {};
    rows.forEach(row => {
      if (!out[row.job_number]) out[row.job_number] = {};
      if (!out[row.job_number][row.fiscal_year]) out[row.job_number][row.fiscal_year] = {};
      out[row.job_number][row.fiscal_year][row.rf_stage] = { reviewedAt: row.reviewed_at };
    });
    return out;
  }

  getRevision(scope, dataKey) {
    return this.stmts.getRevision.get(scope, dataKey)?.revision || 0;
  }

  getForecastPlanningMetadata(fiscalYear) {
    return this.db.prepare(`SELECT fiscal_year AS fiscalYear, engineer_id AS engineerId,
      job_number AS jobNumber, work_group AS workGroup, forecasted, manually_added AS manuallyAdded
      FROM forecast_planning_metadata WHERE fiscal_year = ? ORDER BY engineer_id, job_number, work_group`)
      .all(fiscalYear).map(row => ({
        ...row,
        forecasted: Boolean(row.forecasted),
        manuallyAdded: row.manuallyAdded == null ? null : Boolean(row.manuallyAdded)
      }));
  }

  saveForecastPlanningMetadata(item) {
    this.db.prepare(`INSERT INTO forecast_planning_metadata
      (fiscal_year, engineer_id, job_number, work_group, forecasted, manually_added, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(fiscal_year, engineer_id, job_number, work_group)
      DO UPDATE SET forecasted = excluded.forecasted, manually_added = excluded.manually_added, updated_at = CURRENT_TIMESTAMP`)
      .run(item.fiscalYear, item.engineerId, item.jobNumber, item.workGroup || '', item.forecasted ? 1 : 0, item.manuallyAdded ? 1 : 0);
    return { ...item, workGroup: item.workGroup || '', forecasted: Boolean(item.forecasted), manuallyAdded: Boolean(item.manuallyAdded) };
  }

  deleteForecastPlanningMetadata(item) {
    const workGroup = item.workGroup || '';
    const forecast = this.db.prepare(`SELECT 1 FROM forecasts WHERE fiscal_year = ? AND plan_version = 'v0'
      AND job_number = ? AND (? = '' OR work_group = ?) LIMIT 1`).get(item.fiscalYear, item.jobNumber, workGroup, workGroup);
    const comment = this.db.prepare(`SELECT 1 FROM forecast_comments WHERE fiscal_year = ? AND plan_version = 'v0'
      AND job_number = ? AND (? = '' OR work_group = ?) AND TRIM(COALESCE(comment, '')) <> '' LIMIT 1`)
      .get(item.fiscalYear, item.jobNumber, workGroup, workGroup);
    if (forecast || comment) {
      const error = new Error('Planning metadata has V0 data');
      error.code = 'PLANNING_METADATA_HAS_FORECAST_DATA';
      throw error;
    }
    this.db.prepare(`DELETE FROM forecast_planning_metadata
      WHERE fiscal_year = ? AND engineer_id = ? AND job_number = ? AND work_group = ?`)
      .run(item.fiscalYear, item.engineerId, item.jobNumber, item.workGroup || '');
  }


  saveWorkOrderAmendments(data) {
    this.stmts.upsertWorkOrderAmendments.run(JSON.stringify(data || {}));
  }

  getWorkOrderAmendments() {
    const row = this.stmts.getWorkOrderAmendments.get();
    if (!row?.data_json) return {};
    try {
      const parsed = JSON.parse(row.data_json);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
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
