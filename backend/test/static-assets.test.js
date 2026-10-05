const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { publicAsset, PUBLIC_ASSETS } = require('../static-assets');
test('only frontend assets are public and every local entrypoint asset is listed', () => {
  assert.equal(publicAsset('/'), 'index.html');
  for (const asset of ['/backend/server.js', '/backend/db/app.db', '/.env', '/package.json', '/README.md', '/tests/browser/work-done.cjs', '/../app.js']) assert.equal(publicAsset(asset), null);
  const html = fs.readFileSync(require('node:path').join(__dirname, '../../index.html'), 'utf8');
  for (const [, asset] of html.matchAll(/(?:src|href)="([^"/:]+\.(?:js|css))"/g)) assert.equal(PUBLIC_ASSETS.has(asset), true, asset);
});
