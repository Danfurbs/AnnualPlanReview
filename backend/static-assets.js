const path = require('node:path');
// Public browser assets only. Never make the checkout itself a document root.
const PUBLIC_ASSETS = new Set([
  'index.html', 'styles.css', 'utils.js', 'ui-feedback.js',
  'work-group-utils.js', 'organisation-data.js', 'standard-jobs-data.js',
  'forecast-library.js', 'api-client.js', 'data-migration.js', 'forecast-globals.js',
  'forecast-model.js', 'forecast-storage.js', 'forecast-state.js',
  'forecast-builder-data.js', 'future-work-import.js', 'work-done-session.js',
  'forecast-builder-actions.js', 'forecast-builder-preview.js',
  'baseline-storage.js', 'baseline-page.js', 'app.js', 'settings.js'
]);
function publicAsset(urlPath) {
  return urlPath === '/' ? 'index.html' : PUBLIC_ASSETS.has(urlPath.slice(1)) ? urlPath.slice(1) : null;
}
function servePublicAsset(req, res, next) {
  if (req.path.startsWith('/api/')) return next();
  const asset = publicAsset(req.path);
  if (!asset || !['GET', 'HEAD'].includes(req.method)) return res.sendStatus(404);
  return res.sendFile(path.join(__dirname, '..', asset));
}
module.exports = { PUBLIC_ASSETS, publicAsset, servePublicAsset };
