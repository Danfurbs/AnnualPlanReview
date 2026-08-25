/**
 * PostgreSQL Database Service
 * Handles all database operations for forecasts, baselines, and comments using PostgreSQL
 * Compatible with Render's free PostgreSQL offering
 */

const { Pool } = require('pg');

function revisionConflict() { const error = new Error('Revision conflict'); error.code = 'REVISION_CONFLICT'; return error; }

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

    this.ready = this.ensureSchema();
    console.log('PostgreSQL database service initialized');
  }

  async ensureSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS forecasts (
        id SERIAL PRIMARY KEY,
        job_number VARCHAR(50) NOT NULL,
        work_group VARCHAR(50) NOT NULL,
        fiscal_year VARCHAR(10) NOT NULL,
        plan_version VARCHAR(10) NOT NULL,
        period VARCHAR(10) NOT NULL,
        value DECIMAL(15, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_forecasts_job
      ON forecasts(job_number, fiscal_year, plan_version)
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS forecast_comments (
        id SERIAL PRIMARY KEY,
        job_number VARCHAR(50) NOT NULL,
        work_group VARCHAR(50) NOT NULL,
        fiscal_year VARCHAR(10) NOT NULL,
        plan_version VARCHAR(10) NOT NULL,
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_number, work_group, fiscal_year, plan_version)
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS job_comments (
        id VARCHAR(100) PRIMARY KEY,
        job_number VARCHAR(50) NOT NULL,
        category VARCHAR(50),
        text TEXT NOT NULL,
        timestamp VARCHAR(50),
        fiscal_year VARCHAR(10),
        rf_stage VARCHAR(50),
        root_cause TEXT,
        corrective_action TEXT,
        owner VARCHAR(120),
        due_date VARCHAR(50),
        evidence_links_json JSONB DEFAULT '[]'::jsonb,
        delivery_unit VARCHAR(120),
        filtered_work_group VARCHAR(120),
        filtered_engineer_id VARCHAR(120),
        filtered_engineer_name VARCHAR(200),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.pool.query(`ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS root_cause TEXT`);
    await this.pool.query(`ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS corrective_action TEXT`);
    await this.pool.query(`ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS owner VARCHAR(120)`);
    await this.pool.query(`ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS due_date VARCHAR(50)`);
    await this.pool.query(`ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS evidence_links_json JSONB DEFAULT '[]'::jsonb`);
    await this.pool.query(`ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS delivery_unit VARCHAR(120)`);
    await this.pool.query(`ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS filtered_work_group VARCHAR(120)`);
    await this.pool.query(`ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS filtered_engineer_id VARCHAR(120)`);
    await this.pool.query(`ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS filtered_engineer_name VARCHAR(200)`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS baselines (
        job_number VARCHAR(50) PRIMARY KEY,
        total_value DECIMAL(15, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS review_statuses (
        job_number VARCHAR(50) NOT NULL,
        fiscal_year VARCHAR(10) NOT NULL,
        rf_stage VARCHAR(50) NOT NULL,
        reviewed_at VARCHAR(50) NOT NULL,
        PRIMARY KEY(job_number, fiscal_year, rf_stage)
      )
    `);
    // Upgrade the original job/RF-only table without assigning its ambiguous
    // records to an arbitrary financial year.
    await this.pool.query(`ALTER TABLE review_statuses ADD COLUMN IF NOT EXISTS fiscal_year VARCHAR(10)`);
    await this.pool.query(`UPDATE review_statuses SET fiscal_year = '' WHERE fiscal_year IS NULL`);
    await this.pool.query(`ALTER TABLE review_statuses ALTER COLUMN fiscal_year SET NOT NULL`);
    await this.pool.query(`ALTER TABLE review_statuses DROP CONSTRAINT IF EXISTS review_statuses_pkey`);
    await this.pool.query(`ALTER TABLE review_statuses ADD CONSTRAINT review_statuses_pkey PRIMARY KEY (job_number, fiscal_year, rf_stage)`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS work_order_amendments (
        id INTEGER PRIMARY KEY,
        data_json JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS v1_overrides (
        id SERIAL PRIMARY KEY,
        job_number VARCHAR(50) NOT NULL,
        fiscal_year VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_number, fiscal_year)
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_v1_overrides
      ON v1_overrides(job_number, fiscal_year)
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS forecast_planning_metadata (
        fiscal_year VARCHAR(10) NOT NULL,
        engineer_id VARCHAR(120) NOT NULL,
        job_number VARCHAR(50) NOT NULL,
        work_group VARCHAR(120) NOT NULL DEFAULT '',
        forecasted BOOLEAN NOT NULL DEFAULT FALSE,
        manually_added BOOLEAN,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(fiscal_year, engineer_id, job_number, work_group)
      )
    `);
    const planningMetadataColumns = await this.pool.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'forecast_planning_metadata' AND column_name = 'manually_added'`);
    if (!planningMetadataColumns.rows.length) {
      // Keep legacy rows NULL rather than rewriting planning metadata. The
      // discovery layer applies the old Forecasted=false interpretation only
      // when this discriminator is absent; every new write supplies a boolean.
      await this.pool.query(`ALTER TABLE forecast_planning_metadata ADD COLUMN manually_added BOOLEAN`);
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS public_groups (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        roll_up BOOLEAN DEFAULT FALSE,
        job_numbers_json JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS work_done_snapshots (
        fiscal_year VARCHAR(10) PRIMARY KEY,
        data_json JSONB NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS revisions (scope VARCHAR(50) NOT NULL, data_key VARCHAR(100) NOT NULL, revision INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(scope, data_key))`);
  }

  // ========== Forecast Operations ==========

  /**
   * Save forecast data for a specific job
   * @param {string} jobNumber
   * @param {string} fiscalYear
   * @param {string} planVersion
   * @param {Object} forecastData - { periods: {...}, wgs: {...}, comments: {...} }
   */
  async saveForecast(jobNumber, fiscalYear, planVersion, forecastData, expectedRevision) {
    await this.ready;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const key = `${fiscalYear}:${planVersion}`;
      await client.query(`INSERT INTO revisions(scope,data_key,revision) VALUES ('forecast',$1,0) ON CONFLICT DO NOTHING`, [key]);
      const currentResult = await client.query(`SELECT revision FROM revisions WHERE scope = 'forecast' AND data_key = $1 FOR UPDATE`, [key]);
      const current = currentResult.rows[0].revision;
      if (current !== expectedRevision) throw revisionConflict();

      const { wgs, comments } = forecastData;

      // Delete existing forecast data for this job
      await client.query(
        'DELETE FROM forecasts WHERE job_number = $1 AND fiscal_year = $2 AND plan_version = $3',
        [jobNumber, fiscalYear, planVersion]
      );
      // Remove stale comments for this job/version before reinserting current workgroup rows
      await client.query(
        'DELETE FROM forecast_comments WHERE job_number = $1 AND fiscal_year = $2 AND plan_version = $3',
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

      const revisionResult = await client.query(`UPDATE revisions SET revision = revision + 1 WHERE scope = 'forecast' AND data_key = $1 RETURNING revision`, [key]);
      await client.query('COMMIT');
      return revisionResult.rows[0].revision;
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
    await this.ready;
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
    await this.ready;
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
    await this.ready;
    await this.pool.query(
      `INSERT INTO job_comments (id, job_number, category, text, timestamp, fiscal_year, rf_stage, root_cause, corrective_action, owner, due_date, evidence_links_json, delivery_unit, filtered_work_group, filtered_engineer_id, filtered_engineer_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16)
       ON CONFLICT (id) DO UPDATE SET
         category = EXCLUDED.category,
         text = EXCLUDED.text,
         timestamp = EXCLUDED.timestamp,
         fiscal_year = EXCLUDED.fiscal_year,
         rf_stage = EXCLUDED.rf_stage,
         root_cause = EXCLUDED.root_cause,
         corrective_action = EXCLUDED.corrective_action,
         owner = EXCLUDED.owner,
         due_date = EXCLUDED.due_date,
         evidence_links_json = EXCLUDED.evidence_links_json,
         delivery_unit = EXCLUDED.delivery_unit,
         filtered_work_group = EXCLUDED.filtered_work_group,
         filtered_engineer_id = EXCLUDED.filtered_engineer_id,
         filtered_engineer_name = EXCLUDED.filtered_engineer_name`,
      [comment.id, comment.jobNumber, comment.category, comment.text, comment.timestamp, comment.fy, comment.rf, comment.rootCause || null, comment.correctiveAction || null, comment.owner || null, comment.dueDate || null, JSON.stringify(Array.isArray(comment.evidenceLinks) ? comment.evidenceLinks : []), comment.deliveryUnit || null, comment.filteredWorkGroup || null, comment.filteredEngineerId || null, comment.filteredEngineerName || null]
    );
  }

  /**
   * Bulk save job comments in a single query
   * @param {Array<Object>} comments - Array of comment objects
   */
  async saveAllJobComments(comments) {
    await this.ready;
    if (!Array.isArray(comments) || comments.length === 0) return;

    const ids = comments.map(comment => comment.id);
    const jobNumbers = comments.map(comment => comment.jobNumber);
    const categories = comments.map(comment => comment.category);
    const texts = comments.map(comment => comment.text);
    const timestamps = comments.map(comment => comment.timestamp);
    const fiscalYears = comments.map(comment => comment.fy);
    const rfStages = comments.map(comment => comment.rf);
    const rootCauses = comments.map(comment => comment.rootCause || null);
    const correctiveActions = comments.map(comment => comment.correctiveAction || null);
    const owners = comments.map(comment => comment.owner || null);
    const dueDates = comments.map(comment => comment.dueDate || null);
    const evidenceLinks = comments.map(comment => JSON.stringify(Array.isArray(comment.evidenceLinks) ? comment.evidenceLinks : []));
    const deliveryUnits = comments.map(comment => comment.deliveryUnit || null);
    const filteredWorkGroups = comments.map(comment => comment.filteredWorkGroup || null);
    const filteredEngineerIds = comments.map(comment => comment.filteredEngineerId || null);
    const filteredEngineerNames = comments.map(comment => comment.filteredEngineerName || null);

    await this.pool.query(
      `INSERT INTO job_comments (id, job_number, category, text, timestamp, fiscal_year, rf_stage, root_cause, corrective_action, owner, due_date, evidence_links_json, delivery_unit, filtered_work_group, filtered_engineer_id, filtered_engineer_name)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::jsonb[], $13::text[], $14::text[], $15::text[], $16::text[])
       ON CONFLICT (id) DO UPDATE SET
         category = EXCLUDED.category,
         text = EXCLUDED.text,
         timestamp = EXCLUDED.timestamp,
         fiscal_year = EXCLUDED.fiscal_year,
         rf_stage = EXCLUDED.rf_stage,
         root_cause = EXCLUDED.root_cause,
         corrective_action = EXCLUDED.corrective_action,
         owner = EXCLUDED.owner,
         due_date = EXCLUDED.due_date,
         evidence_links_json = EXCLUDED.evidence_links_json,
         delivery_unit = EXCLUDED.delivery_unit,
         filtered_work_group = EXCLUDED.filtered_work_group,
         filtered_engineer_id = EXCLUDED.filtered_engineer_id,
         filtered_engineer_name = EXCLUDED.filtered_engineer_name`,
      [ids, jobNumbers, categories, texts, timestamps, fiscalYears, rfStages, rootCauses, correctiveActions, owners, dueDates, evidenceLinks, deliveryUnits, filteredWorkGroups, filteredEngineerIds, filteredEngineerNames]
    );
  }

  /**
   * Get all comments for a specific job
   * @param {string} jobNumber
   */
  async getJobComments(jobNumber) {
    await this.ready;
    const result = await this.pool.query(
      'SELECT * FROM job_comments WHERE job_number = $1 ORDER BY timestamp DESC',
      [jobNumber]
    );

    return result.rows.map(row => this.mapJobCommentRow(row));
  }

  /**
   * Get all job comments
   */
  async getAllJobComments() {
    await this.ready;
    const result = await this.pool.query(
      'SELECT * FROM job_comments ORDER BY timestamp DESC'
    );

    const commentStore = {};

    result.rows.forEach(row => {
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
  async deleteJobComment(commentId) {
    await this.ready;
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
    await this.ready;
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
  async getSjnLifetimeTarget(jobNumber) {
    await this.ready;
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
    await this.ready;
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
    await this.ready;
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
    await this.ready;
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

  /**
   * Bulk save all forecasts in a single transaction with batch inserts
   * @param {Object} data - { jobNumber: { periods, wgs, comments }, ... }
   * @param {string} fiscalYear
   * @param {string} planVersion
   */
  async saveAllForecasts(data, fiscalYear, planVersion, expectedRevision) {
    await this.ready;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const key = `${fiscalYear}:${planVersion}`;
      await client.query(`INSERT INTO revisions(scope,data_key,revision) VALUES ('forecast',$1,0) ON CONFLICT DO NOTHING`, [key]);
      const currentResult = await client.query(`SELECT revision FROM revisions WHERE scope = 'forecast' AND data_key = $1 FOR UPDATE`, [key]);
      const current = currentResult.rows[0].revision;
      if (current !== expectedRevision) throw revisionConflict();
      await client.query('DELETE FROM forecasts WHERE fiscal_year = $1 AND plan_version = $2', [fiscalYear, planVersion]);
      await client.query('DELETE FROM forecast_comments WHERE fiscal_year = $1 AND plan_version = $2', [fiscalYear, planVersion]);

      // Collect all forecast values and comments for batch insert
      const forecastValues = [];
      const commentValues = [];

      for (const [jobNumber, jobData] of Object.entries(data)) {
        const { wgs, comments } = jobData;

        for (const [workGroup, periods] of Object.entries(wgs || {})) {
          for (const [period, value] of Object.entries(periods)) {
            forecastValues.push([jobNumber, workGroup, fiscalYear, planVersion, period, value]);
          }

          if (comments && comments[workGroup]) {
            commentValues.push([jobNumber, workGroup, fiscalYear, planVersion, comments[workGroup]]);
          }
        }
      }

      // Batch insert forecasts using unnest for maximum performance
      if (forecastValues.length > 0) {
        const jobNums = forecastValues.map(v => v[0]);
        const workGroups = forecastValues.map(v => v[1]);
        const fiscalYears = forecastValues.map(v => v[2]);
        const planVersions = forecastValues.map(v => v[3]);
        const periods = forecastValues.map(v => v[4]);
        const values = forecastValues.map(v => v[5]);

        await client.query(
          `INSERT INTO forecasts (job_number, work_group, fiscal_year, plan_version, period, value)
           SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[])`,
          [jobNums, workGroups, fiscalYears, planVersions, periods, values]
        );
      }

      // Batch insert comments using unnest
      if (commentValues.length > 0) {
        const jobNums = commentValues.map(v => v[0]);
        const workGroups = commentValues.map(v => v[1]);
        const fiscalYears = commentValues.map(v => v[2]);
        const planVersions = commentValues.map(v => v[3]);
        const comments = commentValues.map(v => v[4]);

        await client.query(
          `INSERT INTO forecast_comments (job_number, work_group, fiscal_year, plan_version, comment)
           SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])`,
          [jobNums, workGroups, fiscalYears, planVersions, comments]
        );
      }

      const revision = current + 1;
      await client.query(`UPDATE revisions SET revision = $2 WHERE scope = 'forecast' AND data_key = $1`, [key, revision]);
      await client.query('COMMIT');
      return revision;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Bulk save v1 overrides in a single transaction
   * @param {Array<string>} jobNumbers - Array of job numbers
   * @param {string} fiscalYear
   */
  async saveAllV1Overrides(jobNumbers, fiscalYear) {
    await this.ready;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Replace the FY-wide set so removed overrides do not linger. An empty
      // set is the expected payload when an entire V1 plan is deleted.
      await client.query('DELETE FROM v1_overrides WHERE fiscal_year = $1', [fiscalYear]);

      if (jobNumbers.length > 0) {
        // Use unnest for batch insert with ON CONFLICT
        const fiscalYears = jobNumbers.map(() => fiscalYear);

        await client.query(
          `INSERT INTO v1_overrides (job_number, fiscal_year)
           SELECT * FROM unnest($1::text[], $2::text[])
           ON CONFLICT (job_number, fiscal_year) DO NOTHING`,
          [jobNumbers, fiscalYears]
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
    await this.ready;
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
    await this.ready;
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
    await this.ready;
    await this.pool.query(
      'DELETE FROM v1_overrides WHERE job_number = $1 AND fiscal_year = $2',
      [jobNumber, fiscalYear]
    );
  }

  async getPublicGroups() {
    await this.ready;
    const result = await this.pool.query(
      'SELECT * FROM public_groups ORDER BY updated_at DESC'
    );
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      rollUp: Boolean(row.roll_up),
      jobNumbers: Array.isArray(row.job_numbers_json) ? row.job_numbers_json : [],
      scope: 'public'
    }));
  }

  async savePublicGroup(group) {
    await this.ready;
    const id = group.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await this.pool.query(
      `INSERT INTO public_groups (id, name, description, roll_up, job_numbers_json, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         roll_up = EXCLUDED.roll_up,
         job_numbers_json = EXCLUDED.job_numbers_json,
         updated_at = CURRENT_TIMESTAMP`,
      [id, group.name || 'Unnamed Group', group.description || '', Boolean(group.rollUp), JSON.stringify(group.jobNumbers || [])]
    );
    return { ...group, id, scope: 'public' };
  }

  async deletePublicGroup(groupId) {
    await this.ready;
    await this.pool.query('DELETE FROM public_groups WHERE id = $1', [groupId]);
  }

  async saveWorkDoneData(fiscalYear, data) {
    await this.ready;
    const result = await this.pool.query(
      `INSERT INTO work_done_snapshots (fiscal_year, data_json, uploaded_at)
       VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (fiscal_year) DO UPDATE SET
         data_json = EXCLUDED.data_json,
         uploaded_at = CURRENT_TIMESTAMP
       RETURNING uploaded_at`,
      [fiscalYear, JSON.stringify(data || {})]
    );
    return result.rows[0]?.uploaded_at || new Date().toISOString();
  }

  async getWorkDoneData(fiscalYear) {
    await this.ready;
    const result = await this.pool.query(
      'SELECT data_json, uploaded_at FROM work_done_snapshots WHERE fiscal_year = $1',
      [fiscalYear]
    );
    if (!result.rows.length) return null;
    return {
      data: result.rows[0].data_json || {},
      uploadedAt: result.rows[0].uploaded_at
    };
  }

  async deleteWorkDoneData(fiscalYear) {
    await this.ready;
    await this.pool.query(
      'DELETE FROM work_done_snapshots WHERE fiscal_year = $1',
      [fiscalYear]
    );
  }

  async clearAllWorkDoneData() {
    await this.ready;
    await this.pool.query('DELETE FROM work_done_snapshots');
  }

  // ========== Utility ==========



  async saveWorkOrderAmendments(data) {
    await this.ready;
    await this.pool.query(
      `INSERT INTO work_order_amendments (id, data_json, updated_at)
       VALUES (1, $1::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET
         data_json = EXCLUDED.data_json,
         updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(data || {})]
    );
  }

  async getWorkOrderAmendments() {
    await this.ready;
    const result = await this.pool.query('SELECT data_json FROM work_order_amendments WHERE id = 1');
    if (!result.rows.length) return {};
    return result.rows[0].data_json || {};
  }
  async ping() {
    await this.ready;
    const result = await this.pool.query('SELECT 1 AS ok');
    return result.rows[0]?.ok === 1;
  }

  async close() {
    await this.pool.end();
  }



  async saveAllReviewStatuses(reviewStore, expectedRevision) {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO revisions(scope,data_key,revision) VALUES ('reviews','all',0) ON CONFLICT DO NOTHING`);
      const revisionResult = await client.query(`SELECT revision FROM revisions WHERE scope = 'reviews' AND data_key = 'all' FOR UPDATE`);
      const current = revisionResult.rows[0].revision;
      if (current !== expectedRevision) throw revisionConflict();
      await client.query('DELETE FROM review_statuses');
      for (const [jobNumber, years] of Object.entries(reviewStore || {})) {
        for (const [fiscalYear, stages] of Object.entries(years || {})) {
          for (const [stage, value] of Object.entries(stages || {})) {
            await client.query(
              `INSERT INTO review_statuses (job_number, fiscal_year, rf_stage, reviewed_at) VALUES ($1,$2,$3,$4)
               ON CONFLICT (job_number, fiscal_year, rf_stage) DO UPDATE SET reviewed_at = EXCLUDED.reviewed_at`,
              [jobNumber, fiscalYear, stage, value?.reviewedAt || new Date().toISOString()]
            );
          }
        }
      }
      const revision = current + 1;
      await client.query(`UPDATE revisions SET revision = $1 WHERE scope = 'reviews' AND data_key = 'all'`, [revision]);
      await client.query('COMMIT');
      return revision;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getAllReviewStatuses() {
    await this.ready;
    const result = await this.pool.query('SELECT * FROM review_statuses');
    const out = {};
    result.rows.forEach(row => {
      if (!out[row.job_number]) out[row.job_number] = {};
      if (!out[row.job_number][row.fiscal_year]) out[row.job_number][row.fiscal_year] = {};
      out[row.job_number][row.fiscal_year][row.rf_stage] = { reviewedAt: row.reviewed_at };
    });
    return out;
  }
  async getRevision(scope, dataKey) {
    await this.ready;
    const result = await this.pool.query('SELECT revision FROM revisions WHERE scope = $1 AND data_key = $2', [scope, dataKey]);
    return result.rows[0]?.revision || 0;
  }
  async getForecastPlanningMetadata(fiscalYear) {
    await this.ready;
    const result = await this.pool.query(`SELECT fiscal_year AS "fiscalYear", engineer_id AS "engineerId",
      job_number AS "jobNumber", work_group AS "workGroup", forecasted, manually_added AS "manuallyAdded"
      FROM forecast_planning_metadata WHERE fiscal_year = $1 ORDER BY engineer_id, job_number, work_group`, [fiscalYear]);
    return result.rows;
  }

  async saveForecastPlanningMetadata(item) {
    await this.ready;
    const result = await this.pool.query(`INSERT INTO forecast_planning_metadata
      (fiscal_year, engineer_id, job_number, work_group, forecasted, manually_added, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT(fiscal_year, engineer_id, job_number, work_group)
      DO UPDATE SET forecasted = EXCLUDED.forecasted, manually_added = EXCLUDED.manually_added, updated_at = CURRENT_TIMESTAMP
      RETURNING fiscal_year AS "fiscalYear", engineer_id AS "engineerId",
        job_number AS "jobNumber", work_group AS "workGroup", forecasted, manually_added AS "manuallyAdded"`,
      [item.fiscalYear, item.engineerId, item.jobNumber, item.workGroup || '', Boolean(item.forecasted), Boolean(item.manuallyAdded)]);
    return result.rows[0];
  }

  async deleteForecastPlanningMetadata(item) {
    await this.ready;
    const evidence = await this.pool.query(`SELECT
      EXISTS(SELECT 1 FROM forecasts WHERE fiscal_year = $1 AND plan_version = 'v0' AND job_number = $2
        AND ($3 = '' OR work_group = $3)) OR
      EXISTS(SELECT 1 FROM forecast_comments WHERE fiscal_year = $1 AND plan_version = 'v0'
        AND job_number = $2 AND ($3 = '' OR work_group = $3)
        AND BTRIM(COALESCE(comment, '')) <> '') AS present`,
    [item.fiscalYear, item.jobNumber, item.workGroup || '']);
    if (evidence.rows[0]?.present) {
      const error = new Error('Planning metadata has V0 data');
      error.code = 'PLANNING_METADATA_HAS_FORECAST_DATA';
      throw error;
    }
    await this.pool.query(`DELETE FROM forecast_planning_metadata
      WHERE fiscal_year = $1 AND engineer_id = $2 AND job_number = $3 AND work_group = $4`,
      [item.fiscalYear, item.engineerId, item.jobNumber, item.workGroup || '']);
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
      evidenceLinks: Array.isArray(row.evidence_links_json) ? row.evidence_links_json : [],
      deliveryUnit: row.delivery_unit || '',
      filteredWorkGroup: row.filtered_work_group || '',
      filteredEngineerId: row.filtered_engineer_id || '',
      filteredEngineerName: row.filtered_engineer_name || ''
    };
  }
}

module.exports = DatabaseServicePG;
