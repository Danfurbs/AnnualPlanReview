const { randomUUID } = require('node:crypto');

const schema = `CREATE TABLE IF NOT EXISTS change_history (
  id TEXT PRIMARY KEY, saved_at TEXT NOT NULL, kind TEXT NOT NULL,
  job_number TEXT NOT NULL, fiscal_year TEXT NOT NULL, plan_version TEXT NOT NULL,
  details_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS change_history_job ON change_history(job_number, fiscal_year, saved_at);`;

function forecastEvents(before, after, year, version) {
  const events = [];
  for (const job of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const old = before[job] || {}, next = after[job] || {}, changes = [];
    const groups = new Set([...Object.keys(old.wgs || {}), ...Object.keys(next.wgs || {}),
      ...Object.keys(old.comments || {}), ...Object.keys(next.comments || {})]);
    for (const group of groups) {
      const a = old.wgs?.[group] || {}, b = next.wgs?.[group] || {};
      for (const period of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const from = Object.hasOwn(a, period) ? Number(a[period]) : null;
        const to = Object.hasOwn(b, period) ? Number(b[period]) : null;
        if (from !== to) changes.push({ group, period, from, to });
      }
      if ((old.comments?.[group] || '') !== (next.comments?.[group] || '')) {
        changes.push({ group, period: 'Comment', from: old.comments?.[group] || '', to: next.comments?.[group] || '' });
      }
    }
    if (changes.length) events.push(event('forecast', job, year, version, { changes }));
  }
  return events;
}
function event(kind, job, year, version, details) {
  return [randomUUID(), new Date().toISOString(), kind, job, year, version, JSON.stringify(details)];
}
function correctionEvents(id, before, after) {
  const from = before ? Number(before.units) : null, to = after ? Number(after.units) : null;
  return from === to ? [] : [event('correction', id.split('-')[0], '', '', { orderId: id, from, to, reason: after?.reason || (after === null ? 'Reverted to uploaded original' : '') })];
}
function rowsToForecast(rows, comments = []) {
  const data = Object.create(null);
  for (const row of rows) {
    const job = data[row.job_number] ||= { wgs: Object.create(null), comments: Object.create(null) };
    const group = job.wgs[row.work_group] ||= Object.create(null);
    group[row.period] = Number(row.value);
  }
  for (const row of comments) {
    const job = data[row.job_number] ||= { wgs: Object.create(null), comments: Object.create(null) };
    job.comments[row.work_group] = row.comment;
  }
  return data;
}
function insertSQLite(db, events) {
  if (!events.length) return;
  const statement = db.prepare('INSERT INTO change_history VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const row of events) statement.run(...row);
}
async function insertPG(client, events) {
  // Batch history writes so large imports do not require one round trip per job.
  if (!events.length) return;
  const columns = Array.from({ length: 7 }, (_, i) => events.map(row => row[i]));
  await client.query('INSERT INTO change_history SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])', columns);
}
module.exports = { schema, forecastEvents, correctionEvents, rowsToForecast, insertSQLite, insertPG };
