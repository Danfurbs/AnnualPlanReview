// New Builder acceptance smoke test against the actual local application. Chart.js is stubbed to inspect series.
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
    await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => {
      localStorage.setItem('aprApiEnabled', 'false');
      window.Chart = class { constructor(canvas, config) { this.data = config.data; window.smokeCharts ||= []; window.smokeCharts.push(config); } update() {} destroy() {} };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.stdJobs?.size > 0 && document.getElementById('workDoneFySelect').options.length > 0);
    const fixture = await page.evaluate(async () => {
      const du = getDeliveryUnits().find(unit => getEngineersForDeliveryUnit(unit.id).filter(e => e.workGroupSets.length).length >= 2);
      const engineers = getEngineersForDeliveryUnit(du.id).filter(e => e.workGroupSets.length);
      const outside = getDeliveryUnits().filter(unit => unit.id !== du.id).flatMap(unit => getEngineersForDeliveryUnit(unit.id)).find(e => e.workGroupSets.length);
      const a = engineers[0].workGroupSets[0], b = engineers[1].workGroupSets[0], c = outside.workGroupSets[0], job = window.stdJobs.keys().next().value;
      const make = () => new Map([[job, { periods: { P1: 15 }, wgs: { [a]: { P1: 4 }, [b]: { P1: 5 }, [c]: { P1: 6 } }, comments: { [a]: 'Current A', [b]: 'Keep B', [c]: 'Keep outside DU' } }]]);
      window.smokeSeed = async () => { await saveForecastToStorageAsync(make(), 1, 'FY27', 'v0'); };
      await window.smokeSeed();
      await saveForecastToStorageAsync(new Map([[job, { periods: { P1: 8 }, wgs: { [a]: { P1: 8 } }, comments: { [a]: 'Historical V0' } }]]), 1, 'FY26', 'v0');
      await saveForecastToStorageAsync(new Map([[job, { periods: { P1: 0 }, wgs: { [a]: { P1: 0 } }, comments: { [a]: 'Historical V1' } }]]), 1, 'FY26', 'v1');
      await saveForecastToStorageAsync(new Map([[job, { periods: { P1: 99 }, wgs: { [a]: { P1: 99 } }, comments: {} }]]), 1, 'FY27', 'v1');
      await setForecastContext('RF6', 'FY27', 'v0', { deliveryUnit: du.id }); closeStageModal();
      await openForecastBuilderPreview();
      return { a, b, c, job, engineer: engineers[0].id, du: du.id };
    });
    const jobCard = page.locator('[data-expand-card]').filter({ has: page.locator(`[data-expand-job="${Number(fixture.job)}"]`) });
    await page.locator(`[data-engineer-id="${fixture.engineer}"]`).click();
    await page.locator('[data-expand-job]').first().click();
    let input = page.locator(`[data-grid-wgs="${fixture.a}"][data-period="P1"]`);
    await input.fill('12');
    await page.locator('[data-undo-job]').first().click();
    assert.equal(await input.inputValue(), '4');
    await page.locator('[data-redo-job]').first().click();
    assert.equal(await input.inputValue(), '12');
    // Add exceptional WGS while retaining the first row's dirty draft.
    await page.locator('[data-add-wgs]').first().click();
    await page.locator('#forecastPreviewWgsSearch').fill(fixture.b);
    await page.locator(`[data-catalogue-wgs="${fixture.b}"]`).click();
    await page.locator('#forecastPreviewConfirmWgs').click();
    assert.equal(await input.inputValue(), '12');
    assert.equal(await page.locator(`[data-grid-wgs="${fixture.b}"][data-period="P1"]`).inputValue(), '5');
    await page.locator('[data-save-job]').first().click();
    await page.waitForFunction(() => !document.getElementById('forecastBuilderPreviewPage').inert);
    let saved = await page.evaluate(job => getForecastSnapshot('FY27', 'v0').data.get(job), fixture.job);
    assert.equal(saved.wgs[fixture.a].P1, 12);
    assert.equal(saved.wgs[fixture.c].P1, 6);
    assert.equal(saved.comments[fixture.c], 'Keep outside DU');
    // History is reachable and shows both forecast comment sources.
    await page.locator(`[data-context-wgs="${fixture.a}"]`).click();
    await page.waitForFunction(() => document.querySelector('.preview-history-list'));
    await page.locator('.preview-history-comments > summary').first().click();
    assert.ok((await page.locator('.preview-history-list').first().innerText()).includes('Historical V0'));
    assert.ok((await page.locator('.preview-history-list').first().innerText()).includes('Historical V1'));
    assert.ok((await page.locator('.preview-history-list').first().innerText()).includes('Not uploaded'));
    await page.locator('[data-show-history]').first().click();
    await page.waitForFunction(() => document.querySelector('[data-show-history]')?.getAttribute('aria-pressed') === 'true');
    await page.waitForFunction(() => window.smokeCharts.at(-1).data.datasets.length > 2);
    // Copy explicit V1 zero into the current draft, without saving automatically.
    await page.locator(`[data-copy-context="forecast"][data-copy-year="FY26"][data-copy-wgs="${fixture.a}"]`).click();
    assert.equal(await input.inputValue(), '');
    saved = await page.evaluate(job => getForecastSnapshot('FY27', 'v0').data.get(job), fixture.job);
    assert.equal(saved.wgs[fixture.a].P1, 12);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-discard-job]').first().click();
    await page.locator('.preview-bulk-actions > summary').click();
    const assertOtherPlans = async () => {
      assert.equal(await page.evaluate(({job,a}) => getForecastSnapshot('FY27', 'v1').data.get(job).wgs[a].P1, fixture), 99);
      assert.equal(await page.evaluate(({job,a}) => getForecastSnapshot('FY26', 'v0').data.get(job).wgs[a].P1, fixture), 8);
    };
    const read = () => page.evaluate(job => getForecastSnapshot('FY27', 'v0').data.get(job), fixture.job);
    const clear = async button => { page.once('dialog', dialog => dialog.accept('CLEAR FY27')); await page.locator(button).click(); await page.waitForFunction(() => !document.getElementById('forecastBuilderPreviewPage').inert); };
    await page.selectOption('#forecastPreviewClearWgsSelect', fixture.a);
    await clear('#forecastPreviewClearWgs');
    saved = await read(); assert.equal(saved.wgs[fixture.a], undefined); assert.equal(saved.wgs[fixture.b].P1, 5); assert.equal(saved.wgs[fixture.c].P1, 6);
    await assertOtherPlans();
    await page.evaluate(async () => { await window.smokeSeed(); await closeForecastBuilderPreview(); await openForecastBuilderPreview(); });
    if (!await page.locator('.preview-bulk-actions').evaluate(el => el.open)) await page.locator('.preview-bulk-actions > summary').click();
    await clear('#forecastPreviewClearEngineer');
    saved = await read(); assert.equal(saved.wgs[fixture.a], undefined); assert.equal(saved.wgs[fixture.b].P1, 5); assert.equal(saved.wgs[fixture.c].P1, 6);
    await page.evaluate(async () => { await window.smokeSeed(); await closeForecastBuilderPreview(); await openForecastBuilderPreview(); });
    if (!await page.locator('.preview-bulk-actions').evaluate(el => el.open)) await page.locator('.preview-bulk-actions > summary').click();
    page.once('dialog', dialog => dialog.dismiss()); await page.locator('#forecastPreviewClearAll').click();
    assert.equal((await read()).wgs[fixture.a].P1, 4);
    await clear('#forecastPreviewClearAll');
    saved = await read(); assert.equal(saved.wgs[fixture.a], undefined); assert.equal(saved.wgs[fixture.b], undefined); assert.equal(saved.wgs[fixture.c].P1, 6);
    await assertOtherPlans();
    // Exercise Future Work confirmation with a deterministic parsed report;
    // workbook parsing has its own fixtures in future-work-import.test.js.
    await page.evaluate(async ({ job, a }) => {
      await window.smokeSeed(); await closeForecastBuilderPreview(); await openForecastBuilderPreview();
      window.XLSX = { read: () => ({}) };
      window.smokeParse = window.FutureWorkImport.parseFutureWorkWorkbook;
      window.FutureWorkImport.parseFutureWorkWorkbook = () => ({ values: [{ jobNumber: job.padStart(6, '0'), workGroup: a, period: 'P1', value: 0 }], periods: ['P01'], totals: { P01: 0 }, warnings: [], exceptions: [], errors: [], recognisedRows: 1, ignoredRows: 0 });
    }, fixture);
    if (!await page.locator('[data-grid-wgs]').count()) await page.locator('[data-expand-job]').first().click();
    input = page.locator(`[data-grid-wgs="${fixture.a}"][data-period="P1"]`);
    await input.fill('12');
    const reviewFutureWork = async () => {
      await page.locator('#forecastPreviewFutureWork').click();
      await page.setInputFiles('#forecastPreviewFutureWorkFile', { name: 'future.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('fixture') });
      await page.waitForFunction(() => !document.getElementById('forecastPreviewFutureWorkConfirm').disabled);
    };
    await reviewFutureWork();
    await page.locator('#forecastPreviewFutureWorkConfirm').click();
    assert.equal(await input.inputValue(), '12'); assert.equal((await read()).wgs[fixture.a].P1, 4);
    await page.locator('#forecastPreviewFutureWorkCancel').click();
    page.once('dialog', dialog => dialog.accept()); await page.locator('[data-discard-job]').first().click();
    await reviewFutureWork();
    const metadataBefore = await page.evaluate(() => localStorage.getItem('aprForecastPlanningMetadataV1'));
    await page.locator('#forecastPreviewFutureWorkConfirm').click();
    await page.waitForFunction(({job,a}) => getForecastSnapshot('FY27', 'v0').data.get(job).wgs[a].P1 === 0 && !document.getElementById('forecastBuilderPreviewPage').inert, fixture);
    assert.equal((await read()).wgs[fixture.c].P1, 6);
    assert.equal(await page.evaluate(() => localStorage.getItem('aprForecastPlanningMetadataV1')), metadataBefore);
    await page.evaluate(() => { window.FutureWorkImport.parseFutureWorkWorkbook = window.smokeParse; });
    // Export the selected DU and round-trip a V0 JSON replacement through UI.
    await page.evaluate(async () => { await window.smokeSeed(); await closeForecastBuilderPreview(); await openForecastBuilderPreview(); });
    if (!await page.locator('.preview-bulk-actions').evaluate(el => el.open)) await page.locator('.preview-bulk-actions > summary').click();
    await page.selectOption('#forecastPreviewActionScope', 'du');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#forecastPreviewExportJson').click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    const exportedJob = exported.forecasts.FY27.v0.data[fixture.job];
    assert.ok(exportedJob.wgs[fixture.a]); assert.ok(exportedJob.wgs[fixture.b]); assert.equal(exportedJob.wgs[fixture.c], undefined);
    const csvPromise = page.waitForEvent('download'); await page.locator('#forecastPreviewExportCsv').click();
    const csv = fs.readFileSync(await (await csvPromise).path(), 'utf8');
    assert.ok(csv.includes(fixture.a)); assert.ok(csv.includes(fixture.b)); assert.equal(csv.includes(fixture.c), false);
    const snapshot = await page.evaluate(() => ({ forecasts: { FY27: { v0: { data: Object.fromEntries(getForecastSnapshot('FY27', 'v0').data) } } } }));
    snapshot.forecasts.FY27.v0.data[fixture.job].wgs[fixture.a].P1 = 21;
    page.once('dialog', dialog => dialog.accept('REPLACE FY27'));
    await page.setInputFiles('#forecastPreviewFullFile', { name: 'forecast.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(snapshot)) });
    await page.waitForFunction(() => !document.getElementById('forecastBuilderPreviewPage').inert);
    assert.equal((await read()).wgs[fixture.a].P1, 21);
    await assertOtherPlans();
    // Failed clear retains the saved plan and restores usable controls.
    await page.evaluate(() => { window.smokeSave = window.saveForecastToStorageAsync; window.saveForecastToStorageAsync = async () => false; });
    await clear('#forecastPreviewClearAll');
    assert.equal((await read()).wgs[fixture.a].P1, 21);
    await page.evaluate(() => { window.saveForecastToStorageAsync = window.smokeSave; });
    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `overflow at ${width}`);
    }
    assert.equal(await page.locator('#forecastPage').count(), 0);
    console.log('PASS: per-job preservation, undo/redo, exceptional WGS draft retention, historical comments and explicit zero copy, all-history charts, WGS/Engineer/DU clear isolation, cancellation, V1/history preservation, Future Work draft blocking and atomic zero import, CSV/JSON exports, full JSON import, failed-clear retention, responsive widths, legacy retired; V0 Builder retained');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
