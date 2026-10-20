const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
const history = require('../services/change-history');
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'better-sqlite3') return class {};
  if (request === 'pg') return { Pool: class {} };
  return originalLoad.call(this, request, ...args);
};
const SQLite = require('../services/database');
const PostgreSQL = require('../services/database-pg');
Module._load = originalLoad;

test('history distinguishes absence, explicit zero, removal and changed comments; ignores unchanged cells', () => {
  const a = { '009001': { wgs: { WG: { P1: 5, P2: 0 } }, comments: { WG: 'Old note' } } };
  const b = { '009001': { wgs: { WG: { P2: 0, P3: 0 } }, comments: { WG: 'New note' } } };
  const events = history.forecastEvents(a, b, 'FY27', 'v1');
  const changes = JSON.parse(events[0][6]).changes;
  assert.deepEqual(changes, [
    { group: 'WG', period: 'P1', from: 5, to: null },
    { group: 'WG', period: 'P3', from: null, to: 0 },
    { group: 'WG', period: 'Comment', from: 'Old note', to: 'New note' }
  ]);
  assert.equal(history.forecastEvents(a, a, 'FY27', 'v1').length, 0);
});

function sqlite() {
  const db = new DatabaseSync(':memory:');
  const service = Object.create(SQLite.prototype);
  service.db = {
    exec: sql => db.exec(sql), prepare: sql => db.prepare(sql),
    transaction: fn => (...args) => {
      db.exec('BEGIN');
      try { const result = fn(...args); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  service.ensureSchema(); service.prepareStatements();
  return { db, service };
}
test('SQLite history is durable, scoped, and committed with both job and bulk saves', () => {
  const { db, service } = sqlite();
  try {
    const job = { wgs: { WG: { P1: 5 } }, comments: {} };
    service.saveForecast('009001', 'FY27', 'v0', job, 0);
    service.saveForecast('009001', 'FY28', 'v0', job, 0);
    service.saveAllForecasts({}, 'FY27', 'v0', 1);
    service.updateWorkOrderAmendment('009001-WO1-1', { units: 0 }, 0);
    const rows = service.getChangeHistory('009001', 'FY27');
    assert.equal(rows.length, 3);
    assert.equal(rows.filter(row => row.kind === 'forecast').length, 2);
    assert.equal(service.getChangeHistory('009002', 'FY27').length, 0);
    assert.equal(service.getChangeHistory('009001', 'FY28').length, 2);
    assert.throws(() => service.saveForecast('009001', 'FY27', 'v0', job, 0), /Revision conflict/);
    assert.equal(service.getChangeHistory('009001', 'FY27').length, 3);
    const first = rows[0];
    const older = service.getChangeHistory('009001', 'FY27', first.saved_at + first.id);
    assert.equal(older.length, 2);
  } finally { db.close(); }
});

test('an audit insert failure rolls back a SQLite forecast save', () => {
  const { db, service } = sqlite();
  try {
    db.exec("CREATE TRIGGER reject_history BEFORE INSERT ON change_history BEGIN SELECT RAISE(ABORT, 'history unavailable'); END;");
    assert.throws(() => service.saveForecast('009001', 'FY27', 'v0', { wgs: { WG: { P1: 5 } }, comments: {} }, 0), /history unavailable/);
    assert.deepEqual(service.getForecastData('FY27', 'v0'), {});
    assert.equal(service.getRevision('forecast', 'FY27:v0'), 0);
  } finally { db.close(); }
});

test('PostgreSQL history failure rolls back the business write before commit', async () => {
  const calls = [];
  let inserted = false;
  const client = { query: async sql => {
    calls.push(sql);
    if (sql.startsWith('INSERT INTO forecasts')) inserted = true;
    if (sql.startsWith('SELECT * FROM forecasts') && inserted) return { rows: [{ job_number: '009001', work_group: 'WG', period: 'P1', value: 5 }] };
    if (sql.includes('SELECT revision')) return { rows: [{ revision: 0 }] };
    if (sql.includes('RETURNING revision')) return { rows: [{ revision: 1 }] };
    if (sql.startsWith('INSERT INTO change_history')) throw Error('history unavailable');
    return { rows: [] };
  }, release() {} };
  const service = Object.create(PostgreSQL.prototype);
  service.ready = Promise.resolve(); service.pool = { connect: async () => client };
  await assert.rejects(service.saveForecast('009001', 'FY27', 'v0', { wgs: { WG: { P1: 5 } }, comments: {} }, 0), /history unavailable/);
  assert.equal(calls.includes('COMMIT'), false);
  assert.equal(calls.at(-1), 'ROLLBACK');
});
