const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo = path.resolve(__dirname, '../..');
const { publicAsset } = require('../../backend/static-assets');
const fixture = { group: 'Track', correction: 9, future: 30, failForecast: false, failCorrection: false, failReview: false, reviews: {} };
const forecast = version => fixture.large ? fixture.large[version] : version === 'v0' ? {
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
    } else if (url.pathname === '/api/comments') { data = fixture.comments || {};
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
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => window.aprReady);
    assert.equal(await page.locator('#dashboard-accordion-data').evaluate(el => el.open), true, 'Missing Work Done opens uploads');
    assert.equal(await page.locator('#dashboard-accordion-filters').evaluate(el => el.open), true, 'Filters start open');
    await page.evaluate(() => closeStageModal());
    const header = page.locator('#dashboardPage .top-bar');
    const headerToggle = page.locator('#dashboardHeaderToggle');
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const expandedHeight = (await header.boundingBox()).height;
      await headerToggle.click();
      assert.equal(await headerToggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#dashboardHeaderDetails').isVisible(), false);
      assert.equal(await page.locator('#dashboardSidebarToggle').isVisible(), true);
      assert.ok((await header.boundingBox()).height < expandedHeight, 'collapsed top bar saves space');
      await page.waitForFunction(() => Math.abs(parseFloat(document.getElementById('dashboardPage').style.getPropertyValue('--dashboard-header-height')) - document.querySelector('#dashboardPage .top-bar').getBoundingClientRect().height) < 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await headerToggle.press('Enter');
      assert.equal(await page.locator('#dashboardHeaderDetails').isVisible(), true);
    }
    await headerToggle.click();
    await page.reload();
    await page.evaluate(() => window.aprReady);
    await page.evaluate(() => closeStageModal());
    assert.equal(await headerToggle.getAttribute('aria-expanded'), 'false', 'collapsed choice survives reload');
    await headerToggle.click();
    await page.setViewportSize({ width: 1440, height: 1000 });
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


    await page.waitForFunction(()=>window.Chart?.getChart);
    assert.equal(await page.locator('#topVarianceMode').count(),0,'sidebar rank toggle removed');
    await page.evaluate(group=>{
      wData.get('009001').periods.P2=999;
      wData.get('009001').wgs[group].P2=999;
      render();
      APRDashboard.openSection('comments');
    },fixture.group);
    await page.locator('[onclick="openTopVariancesModal()"]').click();
    assert.equal(await page.locator('#topVarianceGraphView').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.variance-job-chart canvas').count(),2);
    let series=await page.evaluate(()=>{
      const chart=Chart.getChart(document.querySelector('.variance-job-chart canvas'));
      return {labels:chart.data.labels,forecast:chart.data.datasets[0].data,done:chart.data.datasets[1].data,unit:chart.options.scales.y.title.text,width:chart.width};
    });
    assert.equal(series.labels.length,13);
    assert.deepEqual(series.forecast.slice(0,2),[10,30],'forecast is per period rather than cumulative');
    assert.equal(series.done[0],9);
    assert.equal(series.done[1],null,'future uploaded Work Done remains excluded');
    assert.equal(series.unit,'Miles');
    assert.ok(series.width>100,'chart renders at a usable width');
    await page.locator('#topVarianceListView').click();
    assert.equal(await page.locator('.variance-slide-table tbody tr').count(),2);
    assert.equal(await page.evaluate(()=>topVarianceBriefCharts.length),0,'list view destroys graph instances');
    await page.selectOption('#topVarianceSlideMode','percent');
    assert.match(await page.locator('.variance-slide-table tbody tr').first().innerText(),/009002/);
    await page.locator('#topVarianceGraphView').click();
    assert.equal(await page.locator('.variance-job-chart canvas').count(),2);
    assert.match(await page.locator('.variance-job-graph-heading').first().innerText(),/009002/);
    for(const width of [1440,768,390]){
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'graphs fit '+width);
    }
    await page.setViewportSize({width:1440,height:1000});
    fs.mkdirSync(path.join(repo,'.cache'),{recursive:true});
    await page.locator('#topVariancesModal .modal-content').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:path.join(repo,'.cache/top-variance-graphs.png')});
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>topVarianceBriefCharts.length),0,'closing destroys graph instances');
    assert.deepEqual(errors,[]);
    console.log('PASS: no sidebar ranking toggle; List/Graphs switching; real per-period charts; cutoff excludes future Work Done; ranking; responsive layout and chart cleanup');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
