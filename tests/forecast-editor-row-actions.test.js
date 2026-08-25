const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'forecast-editor.js'), 'utf8');

test('forecast lines render one remove action after the comment field', () => {
  const rowTemplateStart = source.indexOf('<tr class="discipline-job-row');
  const rowTemplateEnd = source.indexOf('</tr>', rowTemplateStart);
  const rowTemplate = source.slice(rowTemplateStart, rowTemplateEnd);
  const actions = rowTemplate.match(/data-action="delete-row"/g) || [];

  assert.equal(actions.length, 1);
  assert.ok(rowTemplate.indexOf('forecast-comment-cell') < rowTemplate.indexOf('data-action="delete-row"'));
  assert.match(rowTemplate, /aria-label="Remove saved forecast for/);
});

test('removing a forecast line persists deletion for volumes and comments', () => {
  const handlerStart = source.indexOf('function handleForecastEditorDeleteRow');
  const handlerEnd = source.indexOf('\n/**', handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);

  assert.match(handler, /delete job\.wgs\[normalizedWg\]/);
  assert.match(handler, /delete job\.comments\[normalizedWg\]/);
  assert.match(handler, /await saveForecastToStorageAsync\(/);
});
