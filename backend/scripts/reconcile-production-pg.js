/**
 * Read-only production reconciliation for an RF6 deployment.
 *
 * The transaction is explicitly READ ONLY and is always rolled back. Output is
 * JSON so it can be retained alongside a backup and compared after deployment.
 */
const { Pool } = require('pg');
require('dotenv').config();

async function reconcile() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const queries = {
      forecastsByYearVersion: `
        SELECT fiscal_year, plan_version, COUNT(*)::integer AS rows,
          COUNT(*) FILTER (WHERE value = 0)::integer AS zero_rows,
          COUNT(DISTINCT job_number)::integer AS jobs
        FROM forecasts GROUP BY fiscal_year, plan_version ORDER BY fiscal_year, plan_version`,
      negativeForecasts: `SELECT COUNT(*)::integer AS rows FROM forecasts WHERE value < 0`,
      forecastComments: `
        SELECT fiscal_year, plan_version, COUNT(*)::integer AS rows
        FROM forecast_comments GROUP BY fiscal_year, plan_version ORDER BY fiscal_year, plan_version`,
      reviewComments: `
        SELECT fiscal_year, rf_stage, COUNT(*)::integer AS rows
        FROM job_comments GROUP BY fiscal_year, rf_stage ORDER BY fiscal_year, rf_stage`,
      reviewStatuses: `
        SELECT fiscal_year, rf_stage, COUNT(*)::integer AS rows
        FROM review_statuses GROUP BY fiscal_year, rf_stage ORDER BY fiscal_year, rf_stage`,
      v1Overrides: `
        SELECT fiscal_year, COUNT(*)::integer AS rows
        FROM v1_overrides GROUP BY fiscal_year ORDER BY fiscal_year`,
      workDoneSnapshots: `
        SELECT fiscal_year, uploaded_at FROM work_done_snapshots ORDER BY fiscal_year`,
      workOrderAmendments: `
        SELECT COUNT(*)::integer AS documents,
          COALESCE(SUM(jsonb_object_length(data_json)), 0)::integer AS amendments
        FROM work_order_amendments`
    };
    const report = { generatedAt: new Date().toISOString(), transaction: 'REPEATABLE READ READ ONLY' };
    for (const [name, sql] of Object.entries(queries)) {
      report[name] = (await client.query(sql)).rows;
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }
}

reconcile().catch(error => {
  console.error(`Reconciliation failed: ${error.message}`);
  process.exitCode = 1;
});
