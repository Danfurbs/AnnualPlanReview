// Browser lifecycle smoke test. Workbook decoding is stubbed; upload processing,
// DOM, session storage, Preview navigation and reload run in the actual app.
// Set PLAYWRIGHT_MODULE to a Playwright installation and BROWSER_EXECUTABLE if needed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
    const page = await browser.newPage();
    const workDoneRequests = [];
    page.on('request', req => { if (req.url().includes('/api/work-done')) workDoneRequests.push(req.url()); });
    await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => {
      localStorage.setItem('aprApiEnabled', 'false');
      if (!localStorage.getItem('smoke-seeded')) {
        localStorage.setItem('aprWorkDoneByYearV1', '{"FY27":{"data":{"legacy":{}}}}');
        localStorage.setItem('smoke-seeded', 'yes');
      }
      window.XLSX = { read: buffer => ({ Sheets: { Detail: JSON.parse(new TextDecoder().decode(buffer)) } }), utils: { sheet_to_json: sheet => sheet } };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.stdJobs?.size > 0 && document.getElementById('workDoneFySelect').options.length > 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('aprWorkDoneByYearV1')), null);
    const job = await page.evaluate(() => window.stdJobs.keys().next().value);
    await page.evaluate(job => { localStorage.setItem('aprWorkOrderAmendmentsV1', JSON.stringify({ [`${job}-WO1-1`]: { units: 9 } })); }, job);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('workDoneFySelect').options.length > 0);
    await page.evaluate(async () => {
      await setForecastContext('RF6', 'FY27', 'v0', { deliveryUnit: getDeliveryUnits().find(du => getEngineersForDeliveryUnit(du.id).length).id });
      closeStageModal();
      openModal();
    });
    const rows = [{ 'Standard Job No': job, 'Work Order Closed Period': 1, 'Units Complete': 5, 'Work Group Set': 'DBAPPTRA', 'Work Order': 'WO1' }];
    await page.selectOption('#workDoneFySelect', 'FY27');
    await page.setInputFiles('#wFile', { name: 'work-done.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(JSON.stringify(rows)) });
    await page.evaluate(() => uploadSelectedWorkDoneFile());
    const loaded = await page.evaluate(job => ({ uploaded: Boolean(window.WorkDoneSession.get('FY27')), order: window.wData?.get(job)?.workOrders[0] }), job);
    assert.equal(loaded.uploaded, true);
    assert.equal(loaded.order.units, 9);
    await page.evaluate(() => closeModal());
    await page.evaluate(() => openForecastBuilderPreview());
    assert.equal(await page.locator('#forecastBuilderPreviewPage').evaluate(el => el.classList.contains('is-hidden')), false);
    await page.evaluate(() => closeForecastBuilderPreview());
    assert.equal(await page.evaluate(() => Boolean(window.WorkDoneSession.get('FY27'))), true);
    await page.reload();
    await page.waitForFunction(() => window.WorkDoneSession);
    assert.equal(await page.evaluate(() => window.WorkDoneSession.get('FY27')), null);
    assert.equal(await page.evaluate(() => window.wData), null);
    assert.ok(await page.evaluate(() => localStorage.getItem('aprWorkOrderAmendmentsV1')));
    assert.deepEqual(workDoneRequests, []);
    console.log('PASS: browser upload/corrections, Preview navigation, reload emptiness, legacy cache purge, no Work Done API requests');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
