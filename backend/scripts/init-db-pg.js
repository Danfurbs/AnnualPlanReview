/**
 * PostgreSQL Database Initialization Script
 * Creates all required tables for the Annual Plan Review application
 */

const { Pool } = require('pg');
require('dotenv').config();

const INIT_DB_MAX_RETRIES = Number(process.env.INIT_DB_MAX_RETRIES || 8);
const INIT_DB_RETRY_DELAY_MS = Number(process.env.INIT_DB_RETRY_DELAY_MS || 3000);
const INIT_DB_STRICT = process.env.INIT_DB_STRICT === 'true';

function shouldRetry(error) {
  const retryableCodes = new Set([
    'ENOTFOUND',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN',
    '57P03' // cannot_connect_now
  ]);
  return Boolean(error && retryableCodes.has(error.code));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is required for PostgreSQL initialization');
    process.exit(1);
  }

  let pool;
  for (let attempt = 1; attempt <= INIT_DB_MAX_RETRIES; attempt++) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
      } : false
    });

    try {
      console.log(`Connecting to PostgreSQL database... (attempt ${attempt}/${INIT_DB_MAX_RETRIES})`);

      // Create forecasts table
      await pool.query(`
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
      console.log('✓ Created forecasts table');

    // Create index on forecasts
      await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_forecasts_job
      ON forecasts(job_number, fiscal_year, plan_version)
      `);
      console.log('✓ Created index on forecasts');

    // Create forecast_comments table
      await pool.query(`
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
      console.log('✓ Created forecast_comments table');

    // Create job_comments table
      await pool.query(`
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
      `);
      console.log('✓ Created job_comments table');

    // Create baselines table
      await pool.query(`
      CREATE TABLE IF NOT EXISTS baselines (
        job_number VARCHAR(50) PRIMARY KEY,
        total_value DECIMAL(15, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
      `);
      console.log('✓ Created baselines table');

    // Create v1_overrides table
      await pool.query(`
      CREATE TABLE IF NOT EXISTS v1_overrides (
        id SERIAL PRIMARY KEY,
        job_number VARCHAR(50) NOT NULL,
        fiscal_year VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_number, fiscal_year)
      )
      `);
      console.log('✓ Created v1_overrides table');

    // Create index on v1_overrides
      await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_v1_overrides
      ON v1_overrides(job_number, fiscal_year)
      `);
      console.log('✓ Created index on v1_overrides');

      await pool.query(`
      CREATE TABLE IF NOT EXISTS public_groups (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        roll_up BOOLEAN DEFAULT FALSE,
        job_numbers_json JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
      `);
      console.log('✓ Created public_groups table');

      await pool.query(`
      CREATE TABLE IF NOT EXISTS work_done_snapshots (
        fiscal_year VARCHAR(10) PRIMARY KEY,
        data_json JSONB NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
      `);
      console.log('✓ Created work_done_snapshots table');

      console.log('\n✅ Database initialization complete!');
      console.log('All tables created successfully.\n');
      await pool.end();
      return;
    } catch (error) {
      const retry = shouldRetry(error) && attempt < INIT_DB_MAX_RETRIES;
      console.error(`❌ Error initializing database on attempt ${attempt}:`, error.message || error);
      await pool.end();
      if (!retry) {
        if (shouldRetry(error) && !INIT_DB_STRICT) {
          console.warn('⚠️ PostgreSQL init skipped after retries due to transient DNS/connectivity issue.');
          console.warn('⚠️ Service startup will attempt schema initialization via backend runtime connection.');
          return;
        }
        process.exit(1);
      }
      console.log(`Retrying in ${INIT_DB_RETRY_DELAY_MS}ms...`);
      await sleep(INIT_DB_RETRY_DELAY_MS);
    }
  }
}

// Run initialization
initializeDatabase();
