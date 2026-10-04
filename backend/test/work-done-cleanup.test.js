const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { purgeSqlite, purgePostgres } = require('../scripts/purge-work-done');

test('SQLite cleanup is repeatable and preserves other business records and the legacy table', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const table of ['work_done_snapshots', 'forecasts', 'job_comments', 'review_statuses', 'work_order_amendments']) {
      db.exec(`CREATE TABLE ${table} (value TEXT); INSERT INTO ${table} VALUES ('preserve');`);
    }
    assert.equal(purgeSqlite(db), 1);
    assert.equal(purgeSqlite(db), 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM work_done_snapshots').get().n, 0);
    for (const table of ['forecasts', 'job_comments', 'review_statuses', 'work_order_amendments']) {
      assert.equal(db.prepare(`SELECT value FROM ${table}`).get().value, 'preserve');
    }
  } finally { db.close(); }
});

test('fresh SQLite schema needs no legacy table', () => {
  const db = new DatabaseSync(':memory:');
  try { assert.equal(purgeSqlite(db), 0); } finally { db.close(); }
});

test('PostgreSQL cleanup rolls back on deletion failure', async () => {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (sql.startsWith('SELECT')) return { rows: [{ name: 'work_done_snapshots' }] };
    if (sql.startsWith('DELETE')) throw new Error('denied');
    return {};
  } };
  await assert.rejects(purgePostgres(client), /denied/);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(calls.includes('COMMIT'), false);
});

test('real PostgreSQL cleanup twice in a disposable database', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  // Refuse a nonempty target: the cleanup intentionally addresses the public schema.
  const existing = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  if (existing.rows.length) { await client.end(); throw new Error('TEST_DATABASE_URL must identify an empty disposable database'); }
  const tables = ['work_done_snapshots', 'forecasts', 'job_comments', 'review_statuses', 'work_order_amendments'];
  try {
    for (const table of tables) await client.query(`CREATE TABLE public.${table} (value TEXT); INSERT INTO public.${table} VALUES ('preserve')`);
    assert.equal(await purgePostgres(client), 1);
    assert.equal(await purgePostgres(client), 0);
    for (const table of tables.slice(1)) assert.equal((await client.query(`SELECT value FROM public.${table}`)).rows[0].value, 'preserve');
  } finally {
    for (const table of tables) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    await client.end();
  }
});
