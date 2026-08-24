const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadPreviewContext() {
  const engineers = [
    { id: 'du-a-1', name: 'A One', deliveryUnitId: 'du-a' },
    { id: 'du-a-2', name: 'A Two', deliveryUnitId: 'du-a' },
    { id: 'du-b-1', name: 'B One', deliveryUnitId: 'du-b' }
  ];
  let deliveryUnit = 'du-a';
  const document = {
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; }
  };
  const window = {
    getCurrentDeliveryUnitId: () => deliveryUnit,
    getEngineersForDeliveryUnit: id => engineers.filter(engineer => engineer.deliveryUnitId === id)
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8'), {
    window, document, localStorage: {}, console, setTimeout
  });
  return { context: window.forecastBuilderPreviewContext, setDeliveryUnit: id => { deliveryUnit = id; } };
}

test('preview engineer scope follows only the selected Delivery Unit', () => {
  const fixture = loadPreviewContext();
  assert.deepEqual(Array.from(fixture.context.getScopedEngineers(), engineer => engineer.id), ['du-a-1', 'du-a-2']);
  fixture.setDeliveryUnit('du-b');
  assert.deepEqual(Array.from(fixture.context.getScopedEngineers(), engineer => engineer.id), ['du-b-1']);
});

test('preview requires a concrete Delivery Unit rather than treating all as a global queue', () => {
  const fixture = loadPreviewContext();
  fixture.setDeliveryUnit('all');
  assert.deepEqual(Array.from(fixture.context.getScopedEngineers()), []);
  fixture.setDeliveryUnit('');
  assert.deepEqual(Array.from(fixture.context.getScopedEngineers()), []);
});

test('all preview engineer operations use the central scoped helper', () => {
  const source = fs.readFileSync(path.join(root, 'forecast-builder-preview.js'), 'utf8');
  assert.doesNotMatch(source, /window\.getEngineers\s*\?/);
  assert.match(source, /function navigateEngineer[\s\S]*?ensureSelectedEngineer\(\)/);
  assert.match(source, /function rebuildJobCache[\s\S]*?getScopedEngineers\(\)\.forEach/);
});

test('tablet engineer list is a contained, single-row horizontal scroller', () => {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const responsive = css.slice(css.indexOf('@media (max-width: 900px)'));
  assert.match(responsive, /\.preview-engineer-list\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*hidden/s);
  assert.match(responsive, /\.preview-engineer-item\s*\{[^}]*flex:\s*0 0 220px/s);
});
