const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo = path.resolve(__dirname, '../..');
const { publicAsset } = require('../../backend/static-assets');
const fixture = { group: 'Track', correction: 9, future: 30, failForecast: false, failCorrection: false, failReview: false, reviews: {} };
const forecast = version => version === 'v0' ? {
  '009001': { wgs: { [fixture.group]: { P1: 10, P2: 20 } }, periods: { P1: 10, P2: 20 } },
  '009002': { wgs: { [fixture.group]: { P1: 6, P2: 4 } }, periods: { P1: 6, P2: 4 } }
} : { '009001': { wgs: { [fixture.group]: { P2: fixture.future } }, periods: { P2: fixture.future } } };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.setHeader('Content-Type', 'application/json');
    let data = {};
    if (url.pathname.startsWith('/api/forecasts/FY27/')) {
      if (fixture.failForecast) { res.writeHead(503); res.end(JSON.stringify({ success: false })); return; }
      data = forecast(url.pathname.split('/').at(-1));
    } else if (url.pathname === '/api/work-order-amendments') {
      if (fixture.failCorrection) { res.writeHead(503); res.end(JSON.stringify({ success: false })); return; }
      data = { '009001-WO1-1': { units: fixture.correction } };
    } else if (url.pathname.startsWith('/api/reviews')) {
      if (req.method === 'POST') {
        if (fixture.failReview) { res.writeHead(503); res.end(JSON.stringify({ success: false })); return; }
        fixture.reviews = JSON.parse(body).data || JSON.parse(body);
      }
      data = fixture.reviews;
    } else if (url.pathname.includes('change-history')) {
      data = [{ id: 'event', saved_at: '2026-10-20T10:00:00Z', kind: 'forecast', job_number: '009001', fiscal_year: 'FY27', plan_version: 'v1', details: { changes: [{ group: fixture.group, period: 'P2', from: null, to: 0 }] } }];
    } else if (/groups|forecast-planning|v1-overrides/.test(url.pathname)) data = [];
    res.end(JSON.stringify({ success: true, data, revision: 1, revisions: {}, next: null }));
    return;
  }
  const asset = publicAsset(url.pathname);
  if (!asset) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', asset.endsWith('.js') ? 'application/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(fs.readFileSync(path.join(repo, asset)));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
      contentType: 'application/javascript',
      body: route.request().url().includes('chart') ? 'window.Chart=class {constructor(){} destroy(){} update(){}};' : 'window.XLSX={};'
    }));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => window.aprReady);
    fixture.group = await page.evaluate(() => [...window.workGroupSets.keys()][0]);
    await page.evaluate(group => {
      requiresContextSelection = false;
      currentFinancialYear = 'FY27'; currentReviewStage = 'RF9'; currentPlanVersion = 'v1'; currentDeliveryUnit = 'all';
      currentForecastCutoff = 'P1'; cutoffFinancialYear = 'FY27';
      document.getElementById('reportingPeriodSelect').value = 'P1';
      for (const el of document.querySelectorAll('.modal')) el.classList.remove('open');
      stdJobs.set('009001', { desc: 'Inspection A', disc: 'PWAY', unit: 'Miles' });
      stdJobs.set('009002', { desc: 'Inspection B', disc: 'PWAY', unit: 'Miles' });
      const rows = ['009001', '009002'].map((job, i) => [job, {
        periods: { P1: i ? 5 : 7 }, wgs: { [group]: { P1: i ? 5 : 7 } },
        workOrders: [{ id: `${job}-WO${i+1}-1`, jobNumber: job, number: `WO${i+1}`, originalUnits: i ? 5 : 7, units: i ? 5 : 7, period: 'P1', workGroup: group }]
      }]);
      WorkDoneSession.replace('FY27', new Map(rows), 'private-work-done.xlsx');
      groupStore = [{ id: 'test', name: 'Inspection group', jobNumbers: ['009001', '009002', '009001'], rollUp: true }];
      updateGroupFilterOptions();
      API_CONFIG.retryAttempts = 1;
    }, fixture.group);
    await page.locator('#aprRefreshShared').click();
    await page.waitForFunction(() => document.getElementById('aprRefreshStatus').textContent.includes('retained'));
    assert.match(await page.locator('#aprReportingDetails').textContent(), /private-work-done.xlsx/);
    assert.equal(await page.evaluate(() => wData.get('009001').periods.P1), 9);
    assert.match(await page.locator('#aprReviewQueueStatus').textContent(), /2 unreviewed/);
    await page.locator('#aprStartReview').click();
    assert.equal(await page.locator('#breakdown').evaluate(el => el.classList.contains('open')), true);
    await page.locator('#aprJobHistory summary').click();
    await page.locator('#aprJobHistory [data-history-load]').click();
    await page.waitForFunction(() => document.querySelector('#aprJobHistory [data-history-body]').textContent.includes('changed'));
    assert.match(await page.locator('#aprJobHistory').textContent(), /Inherit V0.*0/);
    // Failed review saves must not advance the queue or mark the job reviewed.
    const currentJob = await page.evaluate(() => currentBreakdownJobNumber);
    fixture.failReview = true;
    await page.locator('#aprReviewNext').click();
    await page.waitForFunction(() => !document.getElementById('aprReviewNext').disabled);
    assert.equal(await page.evaluate(job => isJobReviewed(job), currentJob), false);
    fixture.failReview = false;
    await page.locator('#aprReviewNext').click();
    await page.waitForFunction(job => isJobReviewed(job), currentJob);
    assert.match(await page.locator('#aprReviewQueueStatus').textContent(), /1 unreviewed/);
    await page.evaluate(() => showBreakdown(currentJobsMap.get('Inspection group')));
    await page.locator('#aprRollupExplanation > summary').click();
    assert.equal(await page.locator('#aprRollupRows > .apr-table-scroll tbody tr').count(), 2);
    assert.match(await page.locator('#aprRollupRows tfoot').textContent(), /50/);
    await page.evaluate(() => closeBreakdown());
    fixture.future = 35; fixture.correction = 11;
    await page.locator('#aprRefreshShared').click();
    await page.waitForFunction(() => wData.get('009001').periods.P1 === 11);
    assert.equal(await page.evaluate(() => WorkDoneSession.get('FY27').fileName), 'private-work-done.xlsx');
    fixture.failForecast = true;
    await page.locator('#aprRefreshShared').click();
    await page.waitForFunction(() => Boolean(window.forecastLoadError));
    assert.equal(await page.locator('#jobs').isVisible(), false);
    assert.equal(await page.evaluate(() => WorkDoneSession.get('FY27').fileName), 'private-work-done.xlsx');
    fixture.failForecast = false;
    await page.locator('#aprRefreshShared').click();
    await page.waitForFunction(() => !window.forecastLoadError && !document.getElementById('aprRefreshShared').disabled);
    await page.evaluate(() => openSettings());
    await page.locator('#settingsModal details summary').first().click();
    assert.equal(await page.locator('#aprDeveloperDiagnostics').isVisible(), false);
    await page.locator('#aprShowDiagnostics').check();
    await page.locator('#aprRunDiagnostics').click();
    await page.waitForFunction(() => document.getElementById('aprDiagnosticsResults').textContent.includes('Sparse'));
    assert.match(await page.locator('#aprDiagnosticsResults').textContent(), /Passed/);
    await page.evaluate(() => closeSettings());
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.locator('.apr-context-bar').evaluate(el => el.scrollWidth > el.clientWidth), false);
    }
    if (process.env.SCREENSHOT_PATH) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: process.env.SCREENSHOT_PATH });
    }
    await page.evaluate(group => { currentDeliveryUnit = getOrganisationForWorkGroup(group).deliveryUnit.id; }, fixture.group);
    await page.evaluate(() => openForecastBuilderPreview());
    const owner = await page.evaluate(group => getOrganisationForWorkGroup(group).engineer.id, fixture.group);
    await page.locator('[data-engineer-id="' + owner + '"]').click();
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('#forecastPreviewContent').isVisible(), true, await page.locator('#forecastPreviewLoading').textContent());
    await page.locator('[data-audit-job]').first().click();
    await page.waitForFunction(() => document.querySelector('#aprBuilderHistory [data-history-body]').textContent.includes('changed'));
    assert.equal(await page.locator('#aprBuilderHistory').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: context, shared refresh, retained private Work Done, history, review save failure/success, group totals, failure recovery, diagnostics and responsive layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
