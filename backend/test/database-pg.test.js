const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function mockPg(request, parent, isMain) {
  if (request === 'pg') return { Pool: class {} };
  return originalLoad.call(this, request, parent, isMain);
};
const DatabaseServicePG = require('../services/database-pg');
Module._load = originalLoad;

function serviceWithClient(handler) {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return handler(sql, params, calls);
    },
    release() { released = true; }
  };
  const service = Object.create(DatabaseServicePG.prototype);
  service.ready = Promise.resolve();
  service.pool = { connect: async () => client };
  return { service, calls, wasReleased: () => released };
}

test('stale forecast replacement rolls back before deleting snapshot rows', async () => {
  const fixture = serviceWithClient(sql => {
    if (sql.includes('SELECT revision')) return { rows: [{ revision: 4 }] };
    return { rows: [] };
  });
  await assert.rejects(fixture.service.saveAllForecasts({}, 'FY27', 'v0', 3), error => error.code === 'REVISION_CONFLICT');
  assert.equal(fixture.calls.some(call => call.sql.startsWith('DELETE FROM forecasts')), false);
  assert.equal(fixture.calls.some(call => call.sql === 'ROLLBACK'), true);
  assert.equal(fixture.wasReleased(), true);
});

test('empty replacement clears forecasts and comments and commits', async () => {
  const fixture = serviceWithClient(sql => {
    if (sql.includes('SELECT revision')) return { rows: [{ revision: 0 }] };
    return { rows: [] };
  });
  assert.equal(await fixture.service.saveAllForecasts({}, 'FY27', 'v0', 0), 1);
  assert.equal(fixture.calls.some(call => call.sql.startsWith('DELETE FROM forecasts WHERE fiscal_year')), true);
  assert.equal(fixture.calls.some(call => call.sql.startsWith('DELETE FROM forecast_comments WHERE fiscal_year')), true);
  assert.equal(fixture.calls.some(call => call.sql === 'COMMIT'), true);
  assert.equal(fixture.wasReleased(), true);
});

test('insert failure rolls back and releases PostgreSQL client', async () => {
  const fixture = serviceWithClient(sql => {
    if (sql.includes('SELECT revision')) return { rows: [{ revision: 0 }] };
    if (sql.startsWith('INSERT INTO forecasts')) throw new Error('insert failed');
    return { rows: [] };
  });
  const data = { '000001': { wgs: { WG: { P1: 1 } }, comments: {} } };
  await assert.rejects(fixture.service.saveAllForecasts(data, 'FY27', 'v0', 0), /insert failed/);
  assert.equal(fixture.calls.some(call => call.sql === 'ROLLBACK'), true);
  assert.equal(fixture.wasReleased(), true);
});
