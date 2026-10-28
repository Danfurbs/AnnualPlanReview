const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo = path.resolve(__dirname, '../..');
const { publicAsset } = require('../../backend/static-assets');
const {DatabaseSync}=require('node:sqlite');
const Module=require('node:module');
const originalLoad=Module._load;
const amendmentRoutes=new Map();
Module._load=function(name,...args){
 if(name==='better-sqlite3')return class {};
 if(name==='express')return {Router:()=>Object.fromEntries(['get','post','put'].map(method=>[method,(route,handler)=>amendmentRoutes.set(method+' '+route,handler)]))};
 return originalLoad.call(this,name,...args);
};
const SQLite=require('../../backend/services/database');
const createAmendmentRoutes=require('../../backend/routes/work-order-amendments');
Module._load=originalLoad;
const db=new DatabaseSync(':memory:');
const service=Object.create(SQLite.prototype);
service.db={exec:sql=>db.exec(sql),prepare:sql=>db.prepare(sql),transaction:fn=>(...args)=>{db.exec('BEGIN');try{const value=fn(...args);db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}};
service.ensureSchema();service.prepareStatements();createAmendmentRoutes(service);
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
    if(url.pathname.startsWith('/api/work-order-amendments')){
      const tail=url.pathname.slice('/api/work-order-amendments'.length);
      const route=req.method==='GET'?'get /':tail==='/reconcile'?'post /reconcile':'put /:orderId';
      if(fixture.failResolution && route==='post /reconcile'){res.writeHead(503);res.end(JSON.stringify({success:false}));return;}
      if(fixture.concurrentChange && route==='post /reconcile'){
        fixture.concurrentChange=false;
        const item=JSON.parse(body).items[0],snapshot=service.getWorkOrderAmendmentSnapshot();
        service.updateWorkOrderAmendment(item.orderId,{...snapshot.data[item.orderId],units:21,status:'active'},snapshot.revisions[item.orderId]);
      }
      const output={code:200,status(code){this.code=code;return this;},json(value){res.writeHead(this.code);res.end(JSON.stringify(value));return this;}};
      await amendmentRoutes.get(route)({body:body?JSON.parse(body):{},params:{orderId:decodeURIComponent(tail.slice(1))}},output);
      return;
    }
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
    await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:route.request().url().includes('chart')?'window.Chart=class {constructor(){}destroy(){}update(){}};':''}));
    await page.addInitScript(()=>{window.XLSX={read:buffer=>({Sheets:{Detail:JSON.parse(new TextDecoder().decode(buffer))}}),utils:{sheet_to_json:sheet=>sheet}};});
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
    assert.equal(await page.evaluate(() => wData.get('009001').periods.P1),7);
    assert.match(await page.locator('#aprReviewQueueStatus').textContent(), /2 unreviewed/);


    const row=(workOrder,units)=>({'Standard Job No':'009001','Work Order Closed Period':1,'Units Complete':units,'Work Group Set':fixture.group,'Work Order':workOrder});
    const upload=async rows=>{
      await page.evaluate(()=>openModal());
      await page.selectOption('#workDoneFySelect','FY27');
      await page.setInputFiles('#wFile',{name:'fresh-ellipse.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(rows))});
      await page.evaluate(()=>uploadSelectedWorkDoneFile());
    };
    const outstanding=()=>page.evaluate(async()=>{
      const input=await APRExportSource.capture('FY27','RF9',1);
      return APRExportData.prepare(input,{du:'all',scale:'du'},{orders:'corrected'},'orders').datasets.orders;
    });
    await upload([row('WO-A',0),row('WO-B',5)]);
    await page.evaluate(()=>showBreakdown(currentJobsMap.get('009001')));
    const amended=await page.evaluate(async()=>{
      const order=currentWorkOrders.find(order=>order.number==='WO-A');
      const saved=await applyWorkOrderUnitAmendment(order.id,9,'Corrected units in ELLIPSE');
      return {saved,id:order.id};
    });
    assert.equal(amended.saved,true);
    assert.equal(service.getWorkOrderAmendments()[amended.id].status,'active');
    assert.equal((await outstanding()).length,1);
    assert.match(await page.locator('#woTable').innerText(),/Correction awaiting ELLIPSE/);
    await page.evaluate(()=>closeBreakdown());
    await upload([row('WO-B',5),row('WO-A',9)]);
    assert.equal(service.getWorkOrderAmendments()[amended.id].status,'resolved','fresh corrected source retires the override');
    assert.equal((await outstanding()).length,0);
    assert.equal(await page.locator('#workOrderAmended').textContent(),'0');
    await page.evaluate(()=>showBreakdown(currentJobsMap.get('009001')));
    assert.equal(await page.locator('#woFlagOnly').isChecked(),true);
    assert.match(await page.locator('#woTable').innerText(),/No outstanding/);
    await page.locator('#woFlagOnly').uncheck();
    assert.match(await page.locator('#woTable').innerText(),/Confirmed in ELLIPSE/);
    await page.evaluate(()=>closeBreakdown());
    await upload([row('WO-A',12),row('WO-B',5)]);
    assert.equal(await page.evaluate(()=>wData.get('009001').workOrders.find(order=>order.number==='WO-A').units),12,'retired overrides never replace later source values');
    // Explicit zero is a valid correction, and its old zero-unit warning must disappear after confirmation.
    await page.evaluate(()=>showBreakdown(currentJobsMap.get('009001')));
    assert.equal(await page.evaluate(async()=>{
      const order=currentWorkOrders.find(order=>order.number==='WO-A');
      return applyWorkOrderUnitAmendment(order.id,0,'Confirmed zero');
    }),true);
    await page.evaluate(()=>closeBreakdown());
    await upload([row('WO-A',0),row('WO-B',5)]);
    assert.equal((await outstanding()).length,0);
    await page.evaluate(()=>showBreakdown(currentJobsMap.get('009001')));
    assert.match(await page.locator('#woTable').innerText(),/No outstanding/);
    assert.equal(await page.evaluate(()=>currentWorkOrders.find(order=>order.number==='WO-A').correctionResolved),true);
    await page.evaluate(()=>closeBreakdown());
    // A missing row and duplicate rows are not proof of completion.
    await page.evaluate(()=>showBreakdown(currentJobsMap.get('009001')));
    await page.evaluate(async()=>{const order=currentWorkOrders.find(order=>order.number==='WO-A');await applyWorkOrderUnitAmendment(order.id,10,'Next correction');closeBreakdown();});
    await upload([row('WO-B',5)]);
    assert.equal(service.getWorkOrderAmendments()[amended.id].status,'active');
    assert.match((await outstanding())[0]['Review status'],/Missing from current upload/);
    await page.evaluate(()=>showBreakdown(currentJobsMap.get('009001')));
    assert.match(await page.locator('#woTable').innerText(),/Missing from current upload/);
    assert.equal(await page.locator('#woTable .wo-amend:disabled').count(),1);
    assert.equal(await page.locator('#workOrderAmended').textContent(),'1');
    await page.evaluate(()=>closeBreakdown());
    await upload([row('WO-A',10),row('WO-A',10),row('WO-B',5)]);
    assert.equal(service.getWorkOrderAmendments()[amended.id].status,'active');
    assert.equal((await outstanding()).length,2);
    await page.evaluate(()=>showBreakdown(currentJobsMap.get('009001')));
    assert.match(await page.locator('#woTable').innerText(),/Duplicate work order rows/);
    assert.equal(await page.locator('#woTable .wo-amend:disabled').count(),2);
    await page.evaluate(()=>closeBreakdown());
    fixture.failResolution=true;
    await upload([row('WO-B',5),row('WO-A',10)]);
    assert.equal(await page.locator('#modal').evaluate(el=>el.classList.contains('open')),true);
    assert.match(await page.locator('#workDoneUploadStatusDetail').innerText(),/could not be confirmed/);
    assert.equal(await page.evaluate(()=>wData.get('009001').workOrders.length),3,'failed reconciliation retains previous upload');
    assert.equal(service.getWorkOrderAmendments()[amended.id].status,'active');
    fixture.failResolution=false;
    await upload([row('WO-B',5),row('WO-A',10)]);
    assert.equal((await outstanding()).length,0);
    const history=service.getChangeHistory('009001','FY27').map(event=>JSON.parse(event.details_json));
    assert.equal(history.filter(event=>event.status==='resolved').length,3);
    await page.evaluate(async()=>{showBreakdown(currentJobsMap.get('009001'));const order=currentWorkOrders.find(order=>order.number==='WO-A');await applyWorkOrderUnitAmendment(order.id,20,'Concurrent correction test');closeBreakdown();});
    fixture.concurrentChange=true;
    await upload([row('WO-A',20),row('WO-B',5)]);
    assert.equal(service.getWorkOrderAmendments()[amended.id].status,'active');
    assert.equal(service.getWorkOrderAmendments()[amended.id].units,21);
    assert.equal((await outstanding()).length,1,'newer planner correction stays outstanding after a revision conflict');
    assert.equal(await page.evaluate(()=>wData.get('009001').workOrders.find(order=>order.number==='WO-A').originalUnits),20);
    assert.deepEqual(errors,[]);
    console.log('PASS: real SQLite correction lifecycle, stable identities, reordered fresh uploads, zero resolution, outstanding lists/exports, missing/duplicate rows, failed resolution retention/retry, later source values and durable history');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{server.close();db.close();});
