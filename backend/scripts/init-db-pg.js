/**
 * PostgreSQL Database Initialization Script
 * Creates all required tables for the Annual Plan Review application
 */

const { Pool } = require('pg');
require('dotenv').config();

async function initializeDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false
    } : false
  });

  try {
    console.log('Connecting to PostgreSQL database...');

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

  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run initialization
initializeDatabase();
