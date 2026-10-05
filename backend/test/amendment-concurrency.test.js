const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'better-sqlite3') return class {};
  if (request === 'pg') return { Pool: class {} };
  return originalLoad.call(this, request, ...args);
};
const SQLiteService = require('../services/database');
const PGService = require('../services/database-pg');
Module._load = originalLoad;

test('SQLite snapshot retains a comment-only job after resetting its numerical overrides', () => {
  const service = Object.create(SQLiteService.prototype);
  service.stmts = {
    getForecastsByYear: { all: () => [] },
    getForecastComments: { all: () => [{ job_number: '000123', work_group: 'WG', comment: 'Keep after reset' }] }
  };
  assert.deepEqual(service.getForecastData('FY27', 'v1')['000123'], { periods: {}, wgs: {}, comments: { WG: 'Keep after reset' } });
});

test('independent corrections merge; stale edits and stale deletion cannot overwrite newer values', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE work_order_amendment_revisions (order_id TEXT PRIMARY KEY, revision INTEGER NOT NULL); CREATE TABLE work_order_amendments (id INTEGER PRIMARY KEY, data_json TEXT, updated_at TEXT)');
  const service = Object.create(SQLiteService.prototype);
  service.db = { prepare: sql => db.prepare(sql), transaction: fn => () => {
    db.exec('BEGIN');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } };
  service.stmts = {
    getWorkOrderAmendments: db.prepare('SELECT data_json FROM work_order_amendments WHERE id = 1'),
    upsertWorkOrderAmendments: db.prepare('INSERT INTO work_order_amendments (id, data_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json')
  };
  try {
    service.saveWorkOrderAmendments({ legacy: { units: 7 } });
    assert.equal(service.updateWorkOrderAmendment('A', { units: 10 }, 0), 1);
    assert.equal(service.updateWorkOrderAmendment('B', { units: 20 }, 0), 1);
    assert.deepEqual(service.getWorkOrderAmendments(), { legacy: { units: 7 }, A: { units: 10 }, B: { units: 20 } });
    assert.throws(() => service.updateWorkOrderAmendment('A', { units: 99 }, 0), error => error.code === 'REVISION_CONFLICT');
    assert.equal(service.updateWorkOrderAmendment('A', null, 1), 2);
    assert.throws(() => service.updateWorkOrderAmendment('A', { units: 99 }, 1), error => error.code === 'REVISION_CONFLICT');
    assert.deepEqual(service.getWorkOrderAmendmentRevisions(), { A: 2, B: 1 });
    assert.equal(service.getWorkOrderAmendments().legacy.units, 7);
  } finally { db.close(); }
});

test('PostgreSQL correction conflict locks the shared document and rolls back without writing it', async () => {
  const calls = [];
  let released = false;
  const client = { query: async sql => {
    calls.push(sql);
    if (sql.includes('SELECT data_json')) return { rows: [{ data_json: { A: { units: 2 } } }] };
    if (sql.includes('SELECT revision')) return { rows: [{ revision: 3 }] };
    return { rows: [] };
  }, release() { released = true; } };
  const service = Object.create(PGService.prototype);
  service.ready = Promise.resolve(); service.pool = { connect: async () => client };
  await assert.rejects(service.updateWorkOrderAmendment('A', { units: 8 }, 2), error => error.code === 'REVISION_CONFLICT');
  assert.ok(calls.some(sql => sql.includes('FOR UPDATE')));
  assert.ok(!calls.some(sql => sql.startsWith('UPDATE work_order_amendments')));
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(released, true);
});
