const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync('app.js', 'utf8');
function extract(name) {
  const start = source.indexOf('    function ' + name + '(');
  const end = source.indexOf('\n    function ', start + 1);
  return source.slice(start, end);
}
test('group chart counts each member once and uses stored work-group totals', () => {
  const data = new Map([
    ['000001', { periods: { P1: 999 }, wgs: { Track: { P1: 10, P2: 0 } } }],
    ['000002', { periods: { P1: 999 }, wgs: { Track: { P1: 20, P2: 5 } } }]
  ]);
  const context = vm.createContext({ currentFinancialYear: 'FY27', getForecastSnapshot: () => ({ data }), getEffectiveForecastSnapshot: () => ({ data }), normalizeWorkGroupSet: value => value });
  vm.runInContext(extract('getAggregateForecastPeriods') + extract('getForecastPeriodsForGroup'), context);
  const result = context.getForecastPeriodsForGroup(['000001', '000002', '000001'], 'all', 'v0');
  assert.equal(result.P1, 30);
  assert.equal(result.P2, 5);
  assert.equal(context.getForecastPeriodsForGroup(['000001', '000002', '000001'], 'Track', 'v1').P1, 30);
});
