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
    await page.route('https://cdn.jsdelivr.net/**', route => route.request().url().includes('chart') ? route.fulfill({contentType:'application/javascript',body:'window.Chart=class {constructor(){} destroy(){} update(){}};'}) : route.continue());
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
        const decoded = XLSX.read(encoded, {type:'base64'});
        savedBooks.push({name, sheets:decoded.SheetNames, rows:Object.fromEntries(decoded.SheetNames.map(key=>[key,XLSX.utils.sheet_to_json(decoded.Sheets[key],{defval:null})])), first:decoded.Sheets[decoded.SheetNames[0]]});
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
    const performance=page.locator('[data-report="performance"]');
    await openReport('performance');
    await performance.locator('[data-preview]').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.startsWith('Preview ready'));
    assert.equal(await page.evaluate(()=>exportBuilds),1,'preview builds only one requested dataset');
    assert.match(await performance.locator('[data-count]').innerText(),/2 rows/);
    await openReport('performance');
    await performance.locator('[data-download]').click();
    await page.waitForFunction(()=>savedBooks.length===1);
    let output=await page.evaluate(()=>savedBooks.at(-1));
    assert.equal(output.rows['SJN performance'][0]['Standard Job No'],'009001');
    assert.equal(output.rows['SJN performance'][0]['Latest forecast'],40);
    assert.equal(output.rows['SJN performance'][0]['Projected full year'],39);
    assert.equal(output.first.A2.t,'s');
    assert.ok(output.sheets.includes('About'));
    const owner=await page.evaluate(group=>getOrganisationForWorkGroup(group),fixture.group);
    await page.selectOption('#exportsDU',owner.deliveryUnit.id);
    await performance.locator('[data-scale]').selectOption('engineer');
    await performance.locator('[data-target]').selectOption(owner.engineer.id);
    const comments=page.locator('[data-report="comments"]');
    await openReport('comments');
    await comments.locator('[data-scale]').selectOption('workgroup');
    await comments.locator('[data-target]').selectOption(fixture.group);
    assert.equal(await page.locator('[data-pack], #exportsDownloadPack, .exports-pack').count(),0);
    await comments.locator('[data-download]').click();
    await page.waitForFunction(()=>savedBooks.length===2);
    output=await page.evaluate(()=>savedBooks.at(-1));
    assert.deepEqual(output.sheets,['Comments','About']);
    assert.equal(output.rows.Comments[0].Comment,'=This is text');
    assert.equal(await performance.locator('[data-scale]').inputValue(),'engineer');
    assert.equal(await performance.locator('[data-target]').inputValue(),owner.engineer.id);
    assert.equal(output.rows.About.find(row=>row.Setting==='Comments scope').Value.includes(fixture.group),true);
    await openReport('performance');
    await performance.locator('[data-preview]').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.startsWith('Preview ready'));
    assert.equal(await page.locator('#exportsPreview').isVisible(),true);
    for(const width of [1440,768,390]){
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'exports fits '+width);
    }
    await page.setViewportSize({width:1440,height:1000});
    fs.mkdirSync(path.join(repo,'.cache'),{recursive:true});
    await page.locator('#exportsModal .modal-content').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:path.join(repo,'.cache/exports-modal.png')});
    await page.locator('#exportsModal .exports-backups summary').click();
    const downloaded=page.waitForEvent('download');
    await page.locator('[data-backup="comments"]').click();
    const backup=await downloaded;
    assert.deepEqual(JSON.parse(fs.readFileSync(await backup.path(),'utf8')),fixture.comments);
    fixture.failForecast=true;
    await openReport('performance');
    await performance.locator('[data-download]').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.includes('could not be read'));
    assert.equal(await page.evaluate(()=>savedBooks.length),2,'failed read cannot generate stale workbook');
    fixture.failForecast=false;
    fixture.future=0;
    await openReport('performance');
    await performance.locator('[data-download]').click();
    await page.waitForFunction(()=>savedBooks.length===3);
    output=await page.evaluate(()=>savedBooks.at(-1));
    assert.equal(output.rows['SJN performance'][0]['Latest forecast'],10);
    assert.equal(output.rows['SJN performance'][0]['Projected full year'],9);
    await page.selectOption('#exportsCutoff','');
    await page.locator('#exportsRefresh').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.startsWith('Report data ready'));
    await openReport('performance');
    await performance.locator('[data-download]').click();
    await page.waitForFunction(()=>savedBooks.length===4);
    output=await page.evaluate(()=>savedBooks.at(-1));
    assert.equal(output.rows['SJN performance'][0]['Projected full year'],null);
    assert.equal(output.rows['SJN performance'][0].RAG,'Unavailable');
    await page.selectOption('#exportsCutoff','1');
    await page.locator('#exportsRefresh').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.startsWith('Report data ready'));
    for (const id of ['periods','comparison','orders','coverage','reviews','top10','comments']) {
      const previous = await page.evaluate(()=>savedBooks.length);
      await openReport(id);
      await page.locator('[data-report="'+id+'"] [data-download]').click();
      await page.waitForFunction(count=>savedBooks.length===count+1,previous);
      const report = await page.evaluate(()=>savedBooks.at(-1));
      assert.ok(report.rows[report.sheets[0]].length > 0,id+' has rows');
      if(id==='comments') {
        assert.equal(report.rows.Comments[0]['Standard Job Number'],'009001');
        assert.equal(report.rows.Comments[0]['Comment Type'],'General');
        assert.equal(report.rows.Comments[0]['Review Stage'],'RF9');
        const cells=Object.values(report.first).filter(cell=>cell?.v==='=This is text');
        assert.equal(cells[0].t,'s'); assert.equal(cells[0].f,undefined);
      }
    }
    const beforeCoverage=await page.evaluate(()=>savedBooks.length);
    await openReport('coverage');
    await page.selectOption('#exportsCoverageYears',['FY28']);
    await openReport('coverage');
    await page.locator('[data-report="coverage"] [data-download]').click();
    await page.waitForFunction(count=>savedBooks.length===count+1,beforeCoverage);
    const years=await page.evaluate(()=>savedBooks.at(-1).rows['Work Group coverage']);
    assert.ok(years.some(row=>row['Financial Year']==='FY28' && row['Latest forecast SJN count']===0));
    const beforeCorrectionFailure=await page.evaluate(()=>savedBooks.length);
    fixture.failCorrection=true;
    await openReport('orders');
    await page.locator('[data-report="orders"] [data-download]').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.includes('corrections could not be loaded'));
    assert.equal(await page.evaluate(()=>savedBooks.length),beforeCorrectionFailure);
    fixture.failCorrection=false;
    await page.evaluate(()=>{window.printCount=0;window.print=()=>printCount++;});
    await openReport('top10');
    await page.locator('#exportsPrintBrief').click();
    await page.waitForFunction(()=>printCount===1);
    assert.match(await page.locator('#exportsPreviewTitle').innerText(),/Top 10/);
    await page.emulateMedia({media:'print'});
    await page.screenshot({path:path.join(repo,'.cache/exports-print.png')});
    await page.emulateMedia({media:'screen'});
    const countBeforeDraft = await page.evaluate(()=>savedBooks.length);
    await page.evaluate(()=>pendingCorrections.set('unsaved-test',{}));
    await openReport('performance');
    await performance.locator('[data-download]').click();
    assert.match(await page.locator('#exportsStatus').innerText(),/Save or discard/);
    assert.equal(await page.evaluate(()=>savedBooks.length),countBeforeDraft);
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
    await openReport('performance');
    await page.evaluate(()=>{window.exportTicks=0;window.exportTimer=setInterval(()=>exportTicks++,0);});
    await performance.locator('[data-preview]').click();
    await page.waitForFunction(()=>document.getElementById('exportsStatus').textContent.startsWith('Preview ready'));
    const ticks=await page.evaluate(()=>{clearInterval(exportTimer);return exportTicks;});
    assert.ok(ticks>10,'large report yields to browser events');
    assert.match(await performance.locator('[data-count]').innerText(),/602 rows/);
    console.log('Large data check: modal opened in '+openTiming.ms.toFixed(1)+'ms; no reads or report builds on open; 600-SJN preview yielded '+ticks+' browser ticks.');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors,[]);
    console.log('PASS: exports modal, per-report scopes, real Excel roundtrip, standalone reports, comments backup, zero, missing cutoff, failed reads and responsive layout');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
