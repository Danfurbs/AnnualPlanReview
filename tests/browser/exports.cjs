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
    await page.route('https://cdn.jsdelivr.net/**', route => route.request().url().includes('chart') ? route.fulfill({contentType:'application/javascript',body:'window.Chart=class {constructor(){} destroy(){} update(){}};'}) : process.env.XLSX_BUNDLE_FILE ? route.fulfill({contentType:'application/javascript',path:process.env.XLSX_BUNDLE_FILE}) : route.continue());
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

    await page.waitForFunction(() => window.XLSX?.utils);
    const commentDU = await page.evaluate(group => encodeCommentDeliveryUnit(getOrganisationForWorkGroup(group).deliveryUnit.id), fixture.group);
    fixture.comments = {'009001':[{fy:'FY27',rf:'RF9',category:'General',text:'=This is text',filteredWorkGroup:fixture.group,deliveryUnit:commentDU}]};
    await page.evaluate(() => {
      window.savedBooks = [];
      XLSX.writeFile = (book, name) => {
        const encoded = XLSX.write(book, {type:'base64',bookType:'xlsx'});
        const decoded = XLSX.read(encoded, {type:'base64',cellStyles:true});
        savedBooks.push({name, encoded, sheets:decoded.SheetNames, rows:Object.fromEntries(decoded.SheetNames.map(key=>[key,XLSX.utils.sheet_to_json(decoded.Sheets[key],{defval:null,...(['V0','V1','RF review plan'].includes(key)?{range:11}:{})})])), first:decoded.Sheets[decoded.SheetNames[0]]});
      };
    });
    await page.evaluate(()=>{
      const capture=APRExportSource.capture, prepare=APRExportData.prepareAsync;
      window.exportReads=0; window.exportBuilds=0;
      APRExportSource.capture=(...args)=>{exportReads++;return capture(...args);};
      APRExportData.prepareAsync=(...args)=>{exportBuilds++;return prepare(...args);};
    });
    fs.mkdirSync(path.join(repo,'.cache'),{recursive:true});
    await page.screenshot({path:path.join(repo,'.cache/dashboard-clean-header.png')});
    const aligned = await page.evaluate(()=>{
      const sidebar=document.getElementById('dashboardSidebar').getBoundingClientRect();
      const button=document.getElementById('dashboardExports').getBoundingClientRect();
      return button.left >= sidebar.left && button.right <= sidebar.right;
    });
    assert.equal(aligned,true,'Exports stays aligned inside the sidebar');
    await page.locator('#dashboardExports').click();
    assert.equal(await page.evaluate(()=>exportReads),0,'opening does not load shared data');
    assert.equal(await page.evaluate(()=>exportBuilds),0,'opening does not build any report');
    await page.screenshot({path:path.join(repo,'.cache/exports-clean.png')});
    const openReport=async id=>{const report=page.locator('[data-report="'+id+'"]');if(!await report.evaluate(el=>el.open))await report.locator('summary').click();};
    await page.locator('.exports-settings > summary').click();
    assert.equal(await page.locator('#exportsModal').isVisible(),true);
    assert.deepEqual(await page.locator('[data-report]').evaluateAll(els=>els.map(el=>el.dataset.report)), ['v0','v1','rf','orders','comments']);
    const performance=page.locator('[data-report="v1"]');
    await openReport('v1');
    await performance.locator('[data-preview]').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.startsWith('Preview ready'));
    assert.equal(await page.evaluate(()=>exportBuilds),1);
    assert.equal(await performance.locator('[data-count]').innerText(),(await page.evaluate(()=>stdJobs.size))+' rows');
    const owner=await page.evaluate(group=>getOrganisationForWorkGroup(group),fixture.group);
    await page.selectOption('#exportsDU',owner.deliveryUnit.id);
    await performance.locator('[data-scale]').selectOption('engineer');
    await performance.locator('[data-target]').selectOption(owner.engineer.id);
    const download = async id => {
      const before=await page.evaluate(()=>savedBooks.length);
      await openReport(id);
      await page.locator('[data-report="'+id+'"] [data-download]').click();
      await page.waitForFunction(n=>savedBooks.length===n+1,before);
      return page.evaluate(()=>savedBooks.at(-1));
    };
    let output=await download('v1');
    assert.equal(output.rows.V1.find(row=>row['Standard Job No.']==='009001')['Standard Job No.'],'009001');
    assert.equal(output.rows.V1.find(row=>row['Standard Job No.']==='009001').P1,10);
    assert.equal(output.rows.V1.find(row=>row['Standard Job No.']==='009001').P2,30);
    assert.equal(output.rows.V1.find(row=>row['Standard Job No.']==='009001')['FY27 Total'],40);
    assert.match(output.first.B4.v,/Engineer: /);
    assert.match(output.first.B3.v,/Financial year: FY27/);
    assert.equal(output.first.D13.t,'s');
    assert.equal(output.first.U13.s.fgColor.rgb,'D9D9D9');
    assert.equal(output.first.H12.s.fgColor.rgb,'FFFF00');
    assert.equal(output.first.B12.s.fgColor.rgb,'95B3D7');
    fs.writeFileSync(path.join(repo,'.cache/export-v1.xlsx'),Buffer.from(output.encoded,'base64'));
    output=await download('v0');
    assert.equal(output.rows.V0.find(row=>row['Standard Job No.']==='009001').P2,20);
    assert.equal(output.rows.V0.find(row=>row['Standard Job No.']==='009001')['FY27 Total'],30);
    fs.writeFileSync(path.join(repo,'.cache/export-v0.xlsx'),Buffer.from(output.encoded,'base64'));
    await openReport('rf');
    for (const stage of ['RF3','RF6','RF9','RF11']) {
      await page.selectOption('#exportsStage',stage);
      output=await download('rf');
      assert.equal(output.rows['RF review plan'].find(row=>row['Standard Job No.']==='009001').P1,9);
      assert.equal(output.rows['RF review plan'].find(row=>row['Standard Job No.']==='009001').P2,30);
      assert.equal(output.rows['RF review plan'].find(row=>row['Standard Job No.']==='009001')['FY27 Total'],39);
      assert.match(output.first.B5.v,new RegExp('RF stage: '+stage+'.*cutoff: P1'));
      assert.match(output.first.B8.v,/Work Done file: private-work-done.xlsx.*Uploaded:/);
      assert.equal(output.rows['RF review plan'].find(row=>row['Standard Job No.']==='009001')['FY27 Comments'].includes('=This is text'),stage==='RF9');
    }
    fs.writeFileSync(path.join(repo,'.cache/export-rf.xlsx'),Buffer.from(output.encoded,'base64'));
    const comments=page.locator('[data-report="comments"]');
    await openReport('comments');
    await comments.locator('[data-scale]').selectOption('workgroup');
    await comments.locator('[data-target]').selectOption(fixture.group);
    output=await download('comments');
    assert.deepEqual(output.sheets,['Comments','About']);
    assert.equal(output.rows.Comments[0].Comment,'=This is text');
    assert.equal(Object.values(output.first).find(cell=>cell?.v==='=This is text').t,'s');
    assert.equal(await performance.locator('[data-scale]').inputValue(),'engineer');
    output=await download('orders');
    assert.match(output.rows['Work Order data errors'][0]['Data errors'],/Correction awaiting ELLIPSE/);
    assert.equal(output.rows['Work Order data errors'].length,1);
    for(const width of [1440,768,390]){
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'exports fits '+width);
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#exportsModal .exports-backups summary').click();
    const downloaded=page.waitForEvent('download');
    await page.locator('[data-backup="comments"]').click();
    assert.deepEqual(JSON.parse(fs.readFileSync(await (await downloaded).path(),'utf8')),fixture.comments);
    let before=await page.evaluate(()=>savedBooks.length);
    fixture.failForecast=true;
    await openReport('v1'); await performance.locator('[data-download]').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.includes('could not be read'));
    assert.equal(await page.evaluate(()=>savedBooks.length),before);
    fixture.failForecast=false; fixture.future=0;
    output=await download('v1');
    assert.equal(output.rows.V1.find(row=>row['Standard Job No.']==='009001').P2,0);
    assert.equal(output.rows.V1.find(row=>row['Standard Job No.']==='009001')['FY27 Total'],10);
    await page.selectOption('#exportsCutoff','');
    before=await page.evaluate(()=>savedBooks.length);
    await openReport('rf'); await page.locator('[data-report="rf"] [data-download]').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.includes('Select a Work Done cutoff'));
    assert.equal(await page.evaluate(()=>savedBooks.length),before);
    await page.locator('[data-report="rf"] [data-preview]').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.includes('Select a Work Done cutoff'));
    assert.equal(await page.locator('#exportsPreview').isVisible(),false);
    output=await download('v0'); assert.equal(output.rows.V0.find(row=>row['Standard Job No.']==='009001').P1,10,'V0 does not need a Work Done cutoff');
    await page.selectOption('#exportsCutoff','1');
    await page.evaluate(()=>{window.testWorkDone=WorkDoneSession.get('FY27');WorkDoneSession.clear('FY27');});
    await openReport('rf');
    for (const action of ['data-preview','data-download']) {
      const count=await page.evaluate(()=>savedBooks.length);
      await page.locator('[data-report="rf"] ['+action+']').click();
      await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.includes('Upload Work Done for the selected financial year'));
      assert.equal(await page.evaluate(()=>savedBooks.length),count);
      assert.equal(await page.locator('#exportsPreview').isVisible(),false);
    }
    await page.evaluate(()=>{WorkDoneSession.replace('FY27',testWorkDone.data,testWorkDone.fileName);delete window.testWorkDone;});
    await download('rf');
    fixture.failCorrection=true;
    before=await page.evaluate(()=>savedBooks.length);
    await openReport('orders'); await page.locator('[data-report="orders"] [data-download]').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.includes('corrections could not be loaded'));
    assert.equal(await page.evaluate(()=>savedBooks.length),before);
    fixture.failCorrection=false;
    await page.evaluate(()=>pendingCorrections.set('unsaved-test',{}));
    await openReport('v1'); await performance.locator('[data-download]').click();
    assert.match(await page.locator('#exportsStatus').innerText(),/Save or discard/);
    await page.evaluate(()=>pendingCorrections.clear());
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#exportsModal').isVisible(),false);
    assert.equal(await page.locator('#forecastSavedFileExports #exportFySelect').count(),1);
    assert.equal(await page.locator('#settingsModal #exportFySelect').count(),0);
    await page.evaluate(async du=>{currentDeliveryUnit=du; await openForecastBuilderPreview(); document.getElementById('forecastSavedFileExports').open=true;},owner.deliveryUnit.id);
    await page.waitForFunction(()=>document.getElementById('exportFySelect').options.length>1);
    await page.selectOption('#exportFySelect','FY27');
    await page.selectOption('#exportPlanSelect','v1');
    await page.selectOption('#exportWorkGroupSelect',fixture.group);
    const jsonEvent=page.waitForEvent('download');
    await page.evaluate(()=>downloadSettingsForecastExport());
    const jsonFile=await jsonEvent;
    const forecastJson=JSON.parse(fs.readFileSync(await jsonFile.path(),'utf8'));
    assert.equal(forecastJson.forecasts.FY27.v1.data['009001'].wgs[fixture.group].P2,0);
    assert.equal(forecastJson.forecasts.FY27.v1.data['009001'].wgs[fixture.group].P1,undefined,'JSON retains sparse overrides');
    const csvEvent=page.waitForEvent('download');
    await page.evaluate(()=>downloadSettingsExcelExport());
    const csvFile=await csvEvent;
    const csv=fs.readFileSync(await csvFile.path(),'utf8');
    const csvRows=await page.evaluate(csv=>{const book=XLSX.read(csv,{type:'string'});return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);},csv);
    assert.equal(Number(csvRows[0].P01),10,'CSV resolves original periods');
    assert.equal(Number(csvRows[0].P02),0,'CSV retains updated zero');
    fixture.large = await page.evaluate(du=>{
      closeForecastBuilderPreview();
      const codes=getDeliveryUnitWorkGroups(du).slice(0,12);
      const data={};
      for(let i=1;i<=600;i++)data[String(i).padStart(6,'0')]={wgs:Object.fromEntries(codes.map(code=>[code,{P1:10,P2:20,P3:30}]))};
      return {v0:data,v1:{}};
    },owner.deliveryUnit.id);
    const openTiming = await page.evaluate(async()=>{
      const reads=exportReads, builds=exportBuilds, start=performance.now();
      await APRExports.open();
      return {ms:performance.now()-start,reads:exportReads-reads,builds:exportBuilds-builds};
    });
    assert.equal(openTiming.reads,0); assert.equal(openTiming.builds,0);
    assert.ok(openTiming.ms<500,'modal opens promptly with large forecast sources');
    await openReport('v1');
    await page.evaluate(()=>{window.exportTicks=0;window.exportTimer=setInterval(()=>exportTicks++,0);});
    await performance.locator('[data-preview]').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.startsWith('Preview ready'));
    const ticks=await page.evaluate(()=>{clearInterval(exportTimer);return exportTicks;});
    assert.ok(ticks>10,'large report yields to browser events');
    assert.equal(await performance.locator('[data-count]').innerText(),(await page.evaluate(()=>new Set([...stdJobs.keys(),...Array.from({length:600},(_,i)=>String(i+1).padStart(6,'0'))]).size)).toLocaleString()+' rows');
    console.log('Large data check: modal opened in '+openTiming.ms.toFixed(1)+'ms; no reads or report builds on open; 600-SJN preview yielded '+ticks+' browser ticks.');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors,[]);
    console.log('PASS: exports modal, per-report scopes, real Excel roundtrip, standalone reports, comments backup, zero, missing cutoff, failed reads and responsive layout');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
