const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { publicAsset } = require('../../backend/static-assets');
const root = path.resolve(__dirname, '../..');
const server = http.createServer((req, res) => {
  const asset = publicAsset(req.url.split('?')[0]);
  if (!asset) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(fs.readFileSync(path.join(root, asset)));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    const real = process.env.REAL_BROWSER_LIBRARIES === 'true';
    if (!real) await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => localStorage.setItem('aprApiEnabled', 'false'));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.stdJobs?.size > 0);
    if (real) await page.waitForFunction(() => window.XLSX && window.Chart);
    const fixture = await page.evaluate(async () => {
      const engineer = getDeliveryUnits().flatMap(du => getEngineersForDeliveryUnit(du.id).map(e => ({ ...e, du: du.id }))).find(e => e.workGroupSets.length);
      const wg = engineer.workGroupSets[0], job = window.stdJobs.keys().next().value;
      const data = new Map([[job, { wgs: { [wg]: { P1: 100, P7: 100, P8: 100, P9: 100 } }, periods: { P1: 100, P7: 100, P8: 100, P9: 100 }, comments: { [wg]: 'V0 comment' } }]]);
      await saveForecastToStorageAsync(data, 1, 'FY27', 'v0');
      await saveForecastToStorageAsync(new Map([[job, { wgs: {}, periods: {}, comments: { [wg]: 'Keep V1 comment' } }]]), 1, 'FY27', 'v1');
      await setForecastContext('RF6', 'FY27', 'v1', { deliveryUnit: engineer.du }); closeStageModal();
      return { wg, job, du: engineer.du };
    });
    assert.equal(await page.locator('#reportingPeriodSelect').inputValue(), '');
    assert.match(await page.locator('#performanceSummary').innerText(), /Unavailable/);
    await page.selectOption('#reportingPeriodSelect', 'P0');
    assert.match(await page.locator('#performanceSummary').innerText(), /400/);
    await page.selectOption('#reportingPeriodSelect', 'P5');
    assert.match(await page.locator('#healthJobCount').innerText(), /unavailable/i);
    await page.evaluate(({ job, wg }) => openWorkGroupPlanEditor(window.currentJobsMap.get(job), wg), fixture);
    await page.locator('#workGroupPlanEditGrid input[data-period="P8"]').fill('0');
    assert.match(await page.locator('#saveWorkGroupPlanEdit').innerText(), /1 changed/);
    // A failed API write leaves the modal and draft intact and does not alter saved data.
    await page.evaluate(() => {
      window.testOriginalSaver = window.saveForecastJobToApi;
      window.API_CONFIG.enabled = true;
      window.saveForecastJobToApi = async () => false;
    });
    await page.click('#saveWorkGroupPlanEdit');
    assert.equal(await page.locator('#workGroupPlanEditModal').evaluate(el => el.classList.contains('open')), true);
    assert.equal(await page.locator('#workGroupPlanEditGrid input[data-period="P8"]').inputValue(), '0');
    assert.equal(await page.evaluate(({ job }) => Object.keys(getForecastSnapshot('FY27', 'v1').data.get(job).wgs).length, fixture), 0);
    await page.evaluate(() => { window.API_CONFIG.enabled = false; window.saveForecastJobToApi = window.testOriginalSaver; });
    await page.click('#saveWorkGroupPlanEdit');
    let stored = await page.evaluate(({ job, wg }) => getForecastSnapshot('FY27', 'v1').data.get(job).wgs[wg], fixture);
    assert.deepEqual(stored, { P8: 0 });
    await page.evaluate(async ({ job, wg }) => {
      closeBreakdown();
      const snapshot = getForecastSnapshot('FY27', 'v0'); snapshot.data.get(job).wgs[wg].P9 = 150;
      snapshot.data.get(job).periods = recalculatePeriodsFromWgs(snapshot.data.get(job).wgs);
      await saveForecastToStorageAsync(snapshot.data, 1, 'FY27', 'v0');
    }, fixture);
    assert.equal(await page.evaluate(({ job, wg }) => resolveForecastWorkGroupPeriods(getEffectiveForecastJob('FY27', job), wg).P9, fixture), 150);
    await page.evaluate(({ job, wg }) => openWorkGroupPlanEditor(window.currentJobsMap.get(job), wg), fixture);
    await page.click('[data-use-v0="P8"]');
    await page.click('#saveWorkGroupPlanEdit');
    const comment = await page.evaluate(({ job, wg }) => getForecastSnapshot('FY27', 'v1').data.get(job).comments[wg], fixture);
    assert.equal(comment, 'Keep V1 comment');
    await page.evaluate(() => closeBreakdown());
    await page.evaluate(() => closeBreakdown());
    assert.equal(await page.locator('#forecastPage').count(), 0);
    // FY-scoped cutoff survives RF changes and reload, independently of uploads.
    await page.evaluate(async ({ du }) => {
      await setForecastContext('RF3', 'FY28', 'v1', { deliveryUnit: du }); closeStageModal();
    }, fixture);
    assert.equal(await page.locator('#reportingPeriodSelect').inputValue(), '');
    await page.selectOption('#reportingPeriodSelect', 'P2');
    await page.evaluate(async ({ du }) => { await setForecastContext('RF9', 'FY27', 'v1', { deliveryUnit: du }); closeStageModal(); }, fixture);
    assert.equal(await page.locator('#reportingPeriodSelect').inputValue(), 'P5');
    if (real) {
      const workbook = await page.evaluate(({ job, wg }) => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
          { 'Standard Job No': job, 'Work Order Closed Period': 1, 'Units Complete': 90, 'Work Group Set': wg, 'Work Order': 'TEST1' },
          { 'Standard Job No': job, 'Work Order Closed Period': 6, 'Units Complete': 99, 'Work Group Set': wg, 'Work Order': 'TEST2' }
        ]), 'Detail');
        return Array.from(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
      }, fixture);
      await page.evaluate(() => openModal());
      await page.selectOption('#workDoneFySelect', 'FY27');
      await page.fill('#wRow', '1');
      await page.setInputFiles('#wFile', { name: 'review-acceptance.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(workbook) });
      await page.evaluate(() => uploadSelectedWorkDoneFile());
      assert.equal(await page.evaluate(() => Boolean(window.wData)), true, await page.locator('#workDoneUploadStatus').innerText());
      await page.evaluate(() => closeModal());
      assert.equal(await page.locator('#reportingPeriodSelect').inputValue(), 'P5');
      assert.match(await page.locator('#workDoneSessionStatus').innerText(), /review-acceptance.xlsx/);
      await page.evaluate(({ job }) => showBreakdown(window.currentJobsMap.get(job)), fixture);
      assert.equal(await page.evaluate(() => Boolean(Chart.getChart(document.getElementById('chart')))), true);
      await page.evaluate(() => closeBreakdown());
      // Both export paths use effective V1 and canonical Work Group identities.
      const exported = await page.evaluate(async () => {
        const write = XLSX.writeFile;
        const sheets = [];
        XLSX.writeFile = workbook => sheets.push(Object.fromEntries(workbook.SheetNames.map(name => [name, XLSX.utils.sheet_to_json(workbook.Sheets[name])])));
        try { await exportWorkGroupJobSummary(); await exportForecastSummary(); }
        finally { XLSX.writeFile = write; }
        return sheets;
      });
      const summary = exported[0]['Work Group Job Summary'].find(row => row['Work Group Code'] === fixture.wg);
      assert.equal(summary['FY27 V0 jobs'], 1);
      assert.equal(summary['FY27 Effective Reforecast jobs'], 1);
      assert.equal(exported[1]['Effective Reforecast'][0].P09, 150);
    }
    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getClientRects().length && el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => ({ tag: el.tagName, cls: el.className, id: el.id, right: el.getBoundingClientRect().right })));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'page fits width ' + width + ': ' + JSON.stringify(overflow));
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    for (const close of await page.locator('.toast-close').all()) await close.click();
    await page.waitForFunction(() => !document.querySelector('.toast'));
    fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
    await page.screenshot({ path: path.join(root, '.cache/review-dashboard.png'), fullPage: true });
    await page.evaluate(({ job, wg }) => openWorkGroupPlanEditor(window.currentJobsMap.get(job), wg), fixture);
    await page.locator('#workGroupPlanEditGrid input[data-period="P8"]').fill('0');
    await page.locator('#workGroupPlanEditModal').screenshot({ path: path.join(root, '.cache/review-v1-editor.png') });
    await page.evaluate(() => closeWorkGroupPlanEditor());
    await page.evaluate(() => openModal());
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.getElementById('modal').contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal').evaluate(el => el.classList.contains('open')), false);
    for (const url of ['/backend/server.js', '/.env', '/backend/db/apr.db']) assert.equal((await page.request.get(`http://127.0.0.1:${server.address().port}${url}`)).status(), 404);
    assert.deepEqual(errors, []);
    console.log('PASS: sparse V1, comment preservation, reporting availability/FY isolation, responsive layout, modal keyboard, static asset protection' + (real ? ', real XLSX and Chart.js' : ''));
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
