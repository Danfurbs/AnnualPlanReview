// Run only after deploying the release that removes Work Done persistence.
// Deliberately never creates a database, drops a table, or touches corrections.
async function purgePostgres(client) {
  await client.query('BEGIN');
  try {
    const exists = await client.query("SELECT to_regclass('public.work_done_snapshots') AS name");
    const result = exists.rows[0]?.name
      ? await client.query('DELETE FROM public.work_done_snapshots') : { rowCount: 0 };
    await client.query('COMMIT');
    return result.rowCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function purgeSqlite(db) {
  db.exec('BEGIN');
  try {
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_done_snapshots'").get();
    const result = exists ? db.prepare('DELETE FROM work_done_snapshots').run() : { changes: 0 };
    db.exec('COMMIT');
    return Number(result.changes);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

async function main() {
  require('dotenv').config();
  const [mode, file] = process.argv.slice(2);
  if (mode === '--postgres') {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
    try {
      const client = await pool.connect();
      try { console.log(`Purged ${await purgePostgres(client)} Work Done snapshot(s).`); }
      finally { client.release(); }
    } finally { await pool.end(); }
  } else if (mode === '--sqlite' && file) {
    const Database = require('better-sqlite3');
    const db = new Database(file, { fileMustExist: true });
    try { console.log(`Purged ${purgeSqlite(db)} Work Done snapshot(s).`); }
    finally { db.close(); }
  } else throw new Error('Usage: node scripts/purge-work-done.js --postgres | --sqlite <existing-database-path>');
}

module.exports = { purgePostgres, purgeSqlite };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
