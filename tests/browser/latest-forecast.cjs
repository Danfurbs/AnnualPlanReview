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
      body: route.request().url().includes('chart') ? 'window.Chart=class {constructor(ctx,config){window.testChart=config;} destroy(){} update(){}};' : 'window.XLSX={};'
    }));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => window.aprReady);
    assert.equal(await page.locator('#dashboard-accordion-data').evaluate(el => el.open), true, 'Missing Work Done opens uploads');
    assert.equal(await page.locator('#dashboard-accordion-filters').evaluate(el => el.open), true, 'Filters start open');
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
    await page.evaluate(() => APRDashboard.openSection('data'));
    await page.locator('#aprRefreshShared').click();
    await page.waitForFunction(() => document.getElementById('aprRefreshStatus').textContent === 'Shared data refreshed.');
    assert.match(await page.locator('#aprReportingDetails').textContent(), /private-work-done.xlsx/);
    assert.equal(await page.evaluate(() => wData.get('009001').periods.P1), 9);
    assert.match(await page.locator('#aprReviewQueueStatus').textContent(), /2 unreviewed/);
    await page.locator('#aprStartReview').click();
    assert.equal(await page.locator('#breakdown').evaluate(el => el.classList.contains('open')), true);

    assert.equal(await page.locator('#breakdownPlanVersion, #wgComparePlanVersion').count(), 0);
    assert.equal(await page.locator('#wgDisplayMode').inputValue(), 'forecast');
    assert.match(await page.locator('#wgCompareBadge').innerText(), /Latest forecast: V1/);
    const chart = await page.evaluate(() => testChart.data.datasets);
    assert.deepEqual(chart.slice(0,2).map(d => d.data[12]), [30,40]);
    assert.equal(chart[2].data[12], 39);
    const detail = page.locator('#wgTable [data-detail-key="f"][data-period="P2"] button');
    assert.equal(await detail.count(), 1);
    assert.match(await detail.getAttribute('data-forecast-tip'), /Original plan \(V0\): 20.0[\s\S]*Change: \+10.0/);
    assert.equal(await page.locator('#wgTable [data-detail-key="f"][data-period="P1"] button').count(), 0);
    const marker = page.locator('#periodGrid button').first();
    await marker.hover();
    assert.equal(await page.locator('.forecast-value-tip').isVisible(), true);
    await marker.focus();
    await marker.press('Escape');
    assert.equal(await page.locator('.forecast-value-tip').count(), 0);
    await marker.click();
    assert.equal(await page.locator('.forecast-value-tip').isVisible(), true);
    assert.match(await page.locator('#wgTable [data-detail-total="f"] button').getAttribute('data-forecast-tip'), /Includes V1 updates/);
    await page.evaluate(() => showBreakdown(currentJobsMap.get('009002')));
    assert.match(await page.locator('#wgCompareBadge').innerText(), /Forecast: V0/);
    assert.equal(await page.locator('#wgTable button.forecast-value').count(), 0);
    assert.equal(await page.evaluate(() => testChart.data.datasets.filter(d => d.label === 'Latest forecast (V1)').length), 0);
    await page.evaluate(() => showBreakdown(currentJobsMap.get('Inspection group')));
    assert.deepEqual(await page.evaluate(() => testChart.data.datasets.slice(0,2).map(d => d.data[12])), [40,50]);
    assert.match(await page.locator('#wgTable [data-detail-total="f"] button').getAttribute('data-forecast-tip'), /Latest forecast.*50.0/);
    await page.evaluate(group => {
      breakdownChartScope = 'workgroup'; breakdownChartScopeTarget = group;
      showBreakdown(currentJobsMap.get('009001'));
    }, fixture.group);
    assert.equal(await page.evaluate(() => testChart.data.datasets[1].data[12]), 40);
    await page.selectOption('#wgDisplayMode', 'variance');
    assert.equal(await page.locator('#wgTable [data-detail-key="v"][data-period="P1"]').innerText(), '-1.0');
    await page.selectOption('#wgDisplayMode', 'forecast');
    await page.locator('#wgTable .engineer-header').first().click();
    await page.locator('#wgTable .wg-summary').first().click();
    for (const width of [1440,768,390]) {
      await page.setViewportSize({width,height:1000});
      await page.locator('#wgTable .forecast-value').first().click();
      const tip = await page.locator('.forecast-value-tip').boundingBox();
      assert.ok(tip.x >= 0 && tip.x + tip.width <= width, 'comparison fits viewport');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
    await page.setViewportSize({width:1440,height:1000});
    fs.mkdirSync(path.join(repo,'.cache'),{recursive:true});
    await page.locator('#wgTable .forecast-value').first().hover();
    await page.screenshot({path:path.join(repo,'.cache/latest-forecast-review.png')});
    const change = async value => page.evaluate(({ group, value }) => {
      getForecastSnapshot('FY27', 'v1').data.get('009001').wgs[group].P2 = value;
      showBreakdown(currentJobsMap.get('009001'));
    }, { group: fixture.group, value });
    await change(0);
    assert.match(await detail.getAttribute('data-forecast-tip'), /Latest forecast \(V1\): 0.0/);
    assert.equal(await page.evaluate(() => testChart.data.datasets[1].data[12]), 10);
    await change(20);
    assert.match(await detail.getAttribute('data-forecast-tip'), /Unchanged from original/);
    assert.match(await page.locator('#breakdownChartScopeBadge').innerText(), /V1 matches V0/);
    await page.evaluate(() => { getForecastSnapshot('FY27', 'v0').data.delete('009001'); showBreakdown(currentJobsMap.get('009001')); });
    assert.match(await detail.getAttribute('data-forecast-tip'), /No original plan available/);
    assert.equal(await page.evaluate(() => testChart.data.datasets.filter(d => d.label === 'Original approved plan (V0)').length), 0);
    await page.evaluate(() => { getForecastSnapshot('FY27', 'v1').data.delete('009001'); showBreakdown(currentJobsMap.get('009001')); });
    assert.match(await page.locator('#wgCompareBadge').innerText(), /No forecast available/);
    assert.equal(await page.locator('#wgTable button.forecast-value').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Automatic forecast review passed: both lines, latest projection, per-SJN fallback, sparse inheritance, zero, equal values, group totals, and hover/focus/tap comparisons.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
