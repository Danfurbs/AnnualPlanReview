/**
 * Database Initialization Script
 * Creates all necessary tables for the Annual Plan Review application
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'db', 'apr.db');

// Ensure db directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

console.log('Initializing database...');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- Forecasts table: stores forecast data for each job/workgroup/period/year/version
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

  -- Forecast comments: work-group specific comments
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

  -- Job comments: standalone review comments (general commentary)
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

  -- Baselines: single total value per job
  CREATE TABLE IF NOT EXISTS baselines (
    job_number TEXT PRIMARY KEY,
    total_value REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- V1 Overrides: tracks which jobs have been edited in plan v1
  CREATE TABLE IF NOT EXISTS v1_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_number TEXT NOT NULL,
    fiscal_year TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_number, fiscal_year)
  );

  -- Shared public standard-job groups
  CREATE TABLE IF NOT EXISTS public_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    roll_up INTEGER DEFAULT 0,
    job_numbers_json TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Work done snapshots by fiscal year
  CREATE TABLE IF NOT EXISTS work_done_snapshots (
    fiscal_year TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Indexes for better query performance
  CREATE INDEX IF NOT EXISTS idx_forecasts_job ON forecasts(job_number);
  CREATE INDEX IF NOT EXISTS idx_forecasts_fy_version ON forecasts(fiscal_year, plan_version);
  CREATE INDEX IF NOT EXISTS idx_forecast_comments_job ON forecast_comments(job_number);
  CREATE INDEX IF NOT EXISTS idx_job_comments_job ON job_comments(job_number);
  CREATE INDEX IF NOT EXISTS idx_job_comments_fy ON job_comments(fiscal_year);
  CREATE INDEX IF NOT EXISTS idx_public_groups_updated_at ON public_groups(updated_at);
`);

console.log('Database initialized successfully!');
console.log(`Database location: ${dbPath}`);

db.close();
