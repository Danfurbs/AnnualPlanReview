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

test('comment-only forecast jobs survive a full snapshot reload after override reset', async () => {
  const service = Object.create(DatabaseServicePG.prototype);
  service.ready = Promise.resolve();
  service.pool = { query: async sql => ({ rows: sql.includes('FROM forecast_comments')
    ? [{ job_number: '000123', work_group: 'WG', comment: 'Keep after reset' }]
    : [] }) };
  const data = await service.getForecastData('FY27', 'v1');
  assert.deepEqual(data['000123'], { periods: {}, wgs: {}, comments: { WG: 'Keep after reset' } });
});

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

test('OTM inputs and derived outputs share the PostgreSQL transaction and reload intact',async()=>{
 const otm=require('../../otm-forecast');
 const shifts=Object.fromEntries(Array.from({length:13},(_,i)=>['P'+(i+1),i]));
 const data=Object.fromEntries(otm.apply(new Map(),[{jobNumber:'009112',enabled:true,workGroup:'WG',rate:.25,shifts}],{engineerId:'eng',workGroups:['WG']}));
 const fixture=serviceWithClient(sql=>({rows:sql.includes('SELECT revision')?[{revision:0}]:[]}));
 await fixture.service.saveAllForecasts(data,'FY27','v0',0);
 const insert=fixture.calls.find(c=>c.sql.startsWith('INSERT INTO forecast_sources'));
 assert.deepEqual(JSON.parse(insert.params[3][0]),data['009112'].sources);
 assert.ok(fixture.calls.indexOf(insert)<fixture.calls.findIndex(c=>c.sql==='COMMIT'));
 fixture.service.pool.query=async sql=>({rows:sql.includes('FROM forecast_sources')?[{job_number:'009112',data_json:insert.params[3][0]}]:sql.includes('FROM forecasts')?Object.entries(data['009112'].wgs.WG).map(([period,value])=>({job_number:'009112',work_group:'WG',period,value})):[]});
 const restored=(await fixture.service.getForecastData('FY27','v0'))['009112'];
 assert.deepEqual(restored.sources,data['009112'].sources);assert.equal(restored.wgs.WG.P1,0);assert.equal(restored.wgs.WG.P13,3);
});

test('PostgreSQL batches source evidence with the forecast transaction and restores it', async () => {
  const sources = { WG: { mst: { P2: 10 }, waif: { P2: 14 }, applied: { P2: 10 } } };
  const fixture = serviceWithClient(sql => ({ rows: sql.includes('SELECT revision') ? [{ revision: 0 }] : [] }));
  await fixture.service.saveAllForecasts({ '009144': { wgs: { WG: { P2: 10 } }, sources } }, 'FY27', 'v0', 0);
  const insert = fixture.calls.find(call => call.sql.startsWith('INSERT INTO forecast_sources'));
  assert.deepEqual(insert.params, [['009144'], ['FY27'], ['v0'], [JSON.stringify(sources)]]);
  assert.ok(fixture.calls.indexOf(insert) < fixture.calls.findIndex(call => call.sql === 'COMMIT'));
  fixture.service.pool.query = async sql => ({ rows: sql.includes('FROM forecast_sources')
    ? [{ job_number: '009144', data_json: JSON.stringify(sources) }]
    : sql.includes('FROM forecasts') ? [{ job_number: '009144', work_group: 'WG', period: 'P2', value: '10' }] : [] });
  const result = await fixture.service.getForecastData('FY27', 'v0');
  assert.deepEqual(result['009144'].sources, sources);
  assert.equal(result['009144'].wgs.WG.P2, 10);
});

test('a source write failure rolls back PostgreSQL forecast replacement', async () => {
  const fixture = serviceWithClient(sql => {
    if (sql.includes('SELECT revision')) return { rows: [{ revision: 0 }] };
    if (sql.startsWith('INSERT INTO forecast_sources')) throw new Error('source failed');
    return { rows: [] };
  });
  await assert.rejects(fixture.service.saveAllForecasts({ '009144': { wgs: { WG: {} }, sources: { WG: {} } } }, 'FY27', 'v0', 0), /source failed/);
  assert.equal(fixture.calls.some(call => call.sql === 'ROLLBACK'), true);
  assert.equal(fixture.calls.some(call => call.sql === 'COMMIT'), false);
});

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

test('standard-job V0 save checks revision before replacing only that job', async () => {
  const fixture = serviceWithClient(sql => {
    if (sql.includes('SELECT revision')) return { rows: [{ revision: 7 }] };
    if (sql.includes('RETURNING revision')) return { rows: [{ revision: 8 }] };
    return { rows: [] };
  });
  const data = { wgs: { WG1: { P1: 0, P2: 4 }, WG2: { P1: 2 } }, comments: { WG2: 'Current-year V0 note' } };
  assert.equal(await fixture.service.saveForecast('9005', 'FY28', 'v0', data, 7), 8);
  const deletes = fixture.calls.filter(call => call.sql.startsWith('DELETE FROM forecast'));
  assert.equal(deletes.length, 3);
  assert.equal(deletes.every(call => call.params[0] === '9005' && call.params[1] === 'FY28' && call.params[2] === 'v0'), true);
  assert.equal(fixture.calls.some(call => call.sql === 'COMMIT'), true);
});

test('failed standard-job save rolls back its values and comments together', async () => {
  const fixture = serviceWithClient(sql => {
    if (sql.includes('SELECT revision')) return { rows: [{ revision: 2 }] };
    if (sql.includes('INSERT INTO forecast_comments')) throw new Error('comment failed');
    return { rows: [] };
  });
  await assert.rejects(fixture.service.saveForecast('9005', 'FY28', 'v0', {
    wgs: { WG1: { P1: 3 } }, comments: { WG1: 'note' }
  }, 2), /comment failed/);
  assert.equal(fixture.calls.some(call => call.sql === 'ROLLBACK'), true);
  assert.equal(fixture.calls.some(call => call.sql === 'COMMIT'), false);
});

test('stale standard-job save does not delete forecast or comment rows', async () => {
  const fixture = serviceWithClient(sql => sql.includes('SELECT revision') ? { rows: [{ revision: 3 }] } : { rows: [] });
  await assert.rejects(fixture.service.saveForecast('9005', 'FY28', 'v0', { wgs: {}, comments: {} }, 2), error => error.code === 'REVISION_CONFLICT');
  assert.equal(fixture.calls.some(call => call.sql.startsWith('DELETE FROM forecast')), false);
  assert.equal(fixture.calls.some(call => call.sql === 'ROLLBACK'), true);
});

test('empty V1 override replacement deletes the existing FY set', async () => {
  const fixture = serviceWithClient(() => ({ rows: [] }));
  await fixture.service.saveAllV1Overrides([], 'FY27');
  assert.equal(fixture.calls.some(call => call.sql.startsWith('DELETE FROM v1_overrides') && call.params[0] === 'FY27'), true);
  assert.equal(fixture.calls.some(call => call.sql.startsWith('INSERT INTO v1_overrides')), false);
  assert.equal(fixture.calls.some(call => call.sql === 'COMMIT'), true);
  assert.equal(fixture.wasReleased(), true);
});

test('review statuses persist with financial year and RF stage dimensions', async () => {
  const fixture = serviceWithClient(sql => {
    if (sql.includes('SELECT revision')) return { rows: [{ revision: 0 }] };
    return { rows: [] };
  });
  const store = {
    '001234': {
      FY27: { RF3: { reviewedAt: '2026-01-01T00:00:00.000Z' } },
      FY28: { RF3: { reviewedAt: '2026-02-01T00:00:00.000Z' } }
    }
  };

  assert.equal(await fixture.service.saveAllReviewStatuses(store, 0), 1);
  const inserts = fixture.calls.filter(call => call.sql.includes('INSERT INTO review_statuses'));
  assert.deepEqual(inserts.map(call => call.params), [
    ['001234', 'FY27', 'RF3', '2026-01-01T00:00:00.000Z'],
    ['001234', 'FY28', 'RF3', '2026-02-01T00:00:00.000Z']
  ]);
  assert.equal(inserts.every(call => call.sql.includes('job_number, fiscal_year, rf_stage')), true);
});

test('loaded review statuses restore the job/FY/RF hierarchy', async () => {
  const service = Object.create(DatabaseServicePG.prototype);
  service.ready = Promise.resolve();
  service.pool = { query: async () => ({ rows: [
    { job_number: '001234', fiscal_year: 'FY27', rf_stage: 'RF6', reviewed_at: '2026-01-01T00:00:00.000Z' }
  ] }) };

  assert.deepEqual(await service.getAllReviewStatuses(), {
    '001234': { FY27: { RF6: { reviewedAt: '2026-01-01T00:00:00.000Z' } } }
  });
});

test('comments save and restore with their financial year and RF stage', async () => {
  const service = Object.create(DatabaseServicePG.prototype);
  const calls = [];
  service.ready = Promise.resolve();
  service.pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
  await service.saveJobComment({
    id: 'comment-1', jobNumber: '001234', category: 'RF3', text: 'Persistent note',
    timestamp: '2026-01-01T00:00:00.000Z', fy: 'FY27', rf: 'RF3',
    evidenceLinks: ['https://example.com/evidence']
  });
  assert.equal(calls[0].sql.includes('fiscal_year, rf_stage'), true);
  assert.deepEqual(calls[0].params.slice(0, 7), [
    'comment-1', '001234', 'RF3', 'Persistent note', '2026-01-01T00:00:00.000Z', 'FY27', 'RF3'
  ]);

  const restored = service.mapJobCommentRow({
    id: 'comment-1', job_number: '001234', category: 'RF3', text: 'Persistent note',
    timestamp: '2026-01-01T00:00:00.000Z', fiscal_year: 'FY27', rf_stage: 'RF3',
    evidence_links_json: ['https://example.com/evidence']
  });

  assert.equal(restored.text, 'Persistent note');
  assert.equal(restored.fy, 'FY27');
  assert.equal(restored.rf, 'RF3');
  assert.deepEqual(restored.evidenceLinks, ['https://example.com/evidence']);
});

test('forecast planning metadata remains isolated by FY, Engineer, job and Work Group Set', async () => {
  const calls = [];
  const service = Object.create(DatabaseServicePG.prototype);
  service.ready = Promise.resolve();
  service.pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ fiscalYear: 'FY28', engineerId: 'track', jobNumber: '9005', workGroup: '', forecasted: true, manuallyAdded: false }] };
  } };
  const saved = await service.saveForecastPlanningMetadata({
    fiscalYear: 'FY28', engineerId: 'track', jobNumber: '9005', workGroup: '', forecasted: true, manuallyAdded: false
  });
  assert.deepEqual(calls[0].params, ['FY28', 'track', '9005', '', true, false]);
  assert.equal(calls[0].sql.includes('ON CONFLICT(fiscal_year, engineer_id, job_number, work_group)'), true);
  assert.equal(saved.forecasted, true);
});

test('forecast planning metadata removal is blocked when selected-year V0 exists', async () => {
  const calls = [];
  const service = Object.create(DatabaseServicePG.prototype);
  service.ready = Promise.resolve();
  service.pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    return sql.includes(' AS present') ? { rows: [{ present: true }] } : { rows: [] };
  } };
  await assert.rejects(service.deleteForecastPlanningMetadata({
    fiscalYear: 'FY28', engineerId: 'track', jobNumber: '9005', workGroup: ''
  }), error => error.code === 'PLANNING_METADATA_HAS_FORECAST_DATA');
  assert.equal(calls.some(call => call.sql.startsWith('DELETE FROM forecast_planning_metadata')), false);
  assert.deepEqual(calls[0].params, ['FY28', '9005', '']);
});

test('untouched planning metadata can be removed without touching forecast tables', async () => {
  const calls = [];
  const service = Object.create(DatabaseServicePG.prototype);
  service.ready = Promise.resolve();
  service.pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    return sql.includes(' AS present') ? { rows: [{ present: false }] } : { rows: [] };
  } };
  await service.deleteForecastPlanningMetadata({
    fiscalYear: 'FY28', engineerId: 'track', jobNumber: '9005', workGroup: ''
  });
  const deletion = calls.find(call => call.sql.startsWith('DELETE FROM forecast_planning_metadata'));
  assert.deepEqual(deletion.params, ['FY28', 'track', '9005', '']);
  assert.equal(calls.some(call => /^DELETE FROM forecasts/.test(call.sql)), false);
});

test('exceptional Work Group Set removal checks only that selected V0 row', async () => {
  const calls = [];
  const service = Object.create(DatabaseServicePG.prototype);
  service.ready = Promise.resolve();
  service.pool = { query: async (sql, params) => { calls.push({ sql, params }); return sql.includes(' AS present') ? { rows: [{ present: false }] } : { rows: [] }; } };
  await service.deleteForecastPlanningMetadata({ fiscalYear: 'FY28', engineerId: 'track', jobNumber: '9005', workGroup: 'WG2' });
  assert.deepEqual(calls[0].params, ['FY28', '9005', 'WG2']);
  assert.match(calls[0].sql, /work_group = \$3/);
});
