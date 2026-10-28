(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => window.escapeHtml(String(value ?? ''));
  const reports = [
    ['performance', 'SJN performance', 'Original plan, latest forecast, completed Work Done, full-year outcome, variance and review status.'],
    ['periods', 'Performance by period', 'One row per SJN, Work Group Set and period, with V1 updates clearly identified.'],
    ['comparison', 'Forecast comparison', 'Original V0 against the complete latest forecast, with period changes and explicit V1 markers.'],
    ['comments', 'Comments', 'Review commentary and existing actions, scoped by current organisational ownership.'],
    ['orders', 'Work Orders', 'Original and corrected units, differences and saved correction details.'],
    ['coverage', 'Work Group coverage', 'Unique SJNs with forecast evidence per Work Group Set. Compare financial years if needed.'],
    ['reviews', 'Review progress', 'Reviewed and outstanding SJNs for the selected review stage.'],
    ['top10', 'Top 10 variance brief', 'Largest variances in this scope. Unit rankings are separated by measurement unit.']
  ];
  let defaults, snapshot, busy = false;
  const modal = document.createElement('div');
  modal.id = 'exportsModal'; modal.className = 'modal';
  modal.setAttribute('aria-labelledby', 'exportsTitle');
  modal.innerHTML = `<div class="modal-content modal-content--wide exports-content">
    <div class="modal-header"><div><h2 id="exportsTitle">Exports</h2><p class="helper-text">Choose a scope for each report. Export settings do not change your dashboard.</p></div><button type="button" class="close" aria-label="Close exports">&times;</button></div>
    <div class="exports-context">
      <label>Financial year<select id="exportsYear"></select></label>
      <label>Review stage<select id="exportsStage"></select></label>
      <label>Work Done through<select id="exportsCutoff"><option value="">Not selected</option>${Array.from({length:14},(_,i)=>`<option value="${i}">P${i}${i === 0 ? ' — no completed periods' : ''}</option>`).join('')}</select></label>
      <label>Delivery Unit<select id="exportsDU"></select></label>
    </div>
    <label class="exports-filter-choice"><input type="checkbox" id="exportsKeepFilters" checked> Keep dashboard job filters (search, SJN group, review status, variance and zero volume)</label>
    <p id="exportsFilterNote" class="helper-text"></p>
    <p id="exportsSource" class="helper-text"></p><p id="exportsStatus" role="status" aria-live="polite"></p>
    <div class="exports-section-heading"><h3>Excel reports</h3><button type="button" id="exportsRefresh" class="group-action-button">Refresh report data</button></div>
    <p class="helper-text">Each scope replaces the dashboard Engineer / Work Group Set selection. Latest forecast is V1 over V0; projected outcome uses Work Done through the cutoff, then latest forecast.</p>
    <div class="exports-report-list">${reports.map(([id,title,description])=>`<section class="exports-report" data-report="${id}">
      <div><h4>${title}</h4><p class="helper-text">${description}</p></div>
      <div class="exports-report-options"><label>Scope<select data-scale aria-label="${title} scope"><option value="du">Entire selected DU</option><option value="engineer">Engineer</option><option value="workgroup">Work Group Set</option></select></label><label data-target-label>Selection<select data-target aria-label="${title} selection"></select></label>
      ${id === 'comments' ? '<label>Comment type<select id="exportsCommentType"><option value="all">All types</option></select></label><label>Comment review stage<select id="exportsCommentStage"><option value="all">All stages</option></select></label>' : ''}
      ${id === 'orders' ? '<label>Orders<select id="exportsOrderMode"><option value="corrected">Corrected orders only</option><option value="all">All uploaded orders</option></select></label>' : ''}
      ${id === 'top10' ? '<label>Rank by<select id="exportsRank"><option value="units">Units (per unit type)</option><option value="percent">Percentage</option></select></label>' : ''}
      ${id === 'coverage' ? '<label>Additional financial years<select id="exportsCoverageYears" multiple size="2"></select></label>' : ''}</div>
      <div class="exports-report-actions"><label><input type="checkbox" data-pack ${['performance','comments','reviews'].includes(id)?'checked':''}> Include in review pack</label><span data-count></span><button type="button" class="group-action-button" data-preview>Preview</button><button type="button" class="primary-button" data-download>Download Excel</button>${id==='top10'?'<button type="button" class="group-action-button" id="exportsPrintBrief">Print / save PDF</button>':''}</div></section>`).join('')}</div>
    <section class="exports-pack"><h3>Combined Excel review pack</h3><p class="helper-text">Includes the reports ticked above, each using its own scope. The About sheet records every selection and data source. Backups are separate.</p><button type="button" class="primary-button" id="exportsDownloadPack">Download selected reports together</button></section>
    <details class="exports-backups"><summary>Saved data backups (JSON)</summary><p>For restoring or transferring saved data. These downloads contain <strong>all saved financial years and Delivery Units</strong> and ignore report filters. They are not a full database backup and do not include session Work Done.</p><button type="button" class="group-action-button" data-backup="comments">Download all saved comments</button><button type="button" class="group-action-button" data-backup="baselines">Download all prior submissions</button></details>
    <p class="helper-text">Forecast CSV / JSON and upload-template exports remain in <button type="button" class="group-action-button" id="exportsOpenBuilder">Forecast Builder</button>.</p>
    <section id="exportsPreview" class="exports-preview" hidden><h3 id="exportsPreviewTitle"></h3><p id="exportsPreviewScope"></p><div id="exportsPreviewRows" class="apr-table-scroll"></div></section>
  </div>`;
  document.body.append(modal);
  const cards = () => [...modal.querySelectorAll('[data-report]')];
  const cardFor = id => cards().find(card => card.dataset.report === id);
  const selection = (select, items, value) => {
    select.innerHTML = items.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
    select.value = items.some(item => item.id === value) ? value : items[0]?.id || '';
  };
  const scope = card => ({ du: $('exportsDU').value, scale: card.querySelector('[data-scale]').value, target: card.querySelector('[data-target]').value });
  const scopeLabel = card => {
    const value = scope(card);
    return `${$('exportsDU').selectedOptions[0]?.textContent} · ${value.scale === 'du' ? 'Entire selection' : card.querySelector('[data-target]').selectedOptions[0]?.textContent || 'No selection'}`;
  };
  function targets(card, preferred) {
    const du = $('exportsDU').value, scale = card.querySelector('[data-scale]').value;
    const engineers = du === 'all' ? window.getEngineers() : window.getEngineersForDeliveryUnit(du);
    const select = card.querySelector('[data-target]');
    const previous = preferred || select.value;
    const items = scale === 'engineer' ? engineers : [...window.workGroupSets].filter(([code]) => du === 'all' || window.getOrganisationForWorkGroup(code)?.deliveryUnit?.id === du).map(([id,name])=>({id,name:`${name} (${id})`}));
    selection(select, items, previous);
    card.querySelector('[data-target-label]').hidden = scale === 'du';
    card.querySelector('[data-scale] option[value="du"]').textContent = du === 'all' ? 'All Delivery Units' : 'Entire selected DU';
  }
  function filters() {
    return { ...($('exportsKeepFilters').checked ? defaults.filters : {}), commentType: $('exportsCommentType').value, commentStage: $('exportsCommentStage').value, orders: $('exportsOrderMode').value, rank: $('exportsRank').value };
  }
  function result(card, source = snapshot) {
    if (!source) return null;
    const value = scope(card);
    if (value.scale !== 'du' && !value.target) throw new Error('Choose an Engineer or Work Group Set for this report.');
    const prepared = window.APRExportData.prepare(source, value, filters());
    let rows = prepared.datasets[card.dataset.report];
    return { rows, available: prepared.available };
  }
  function updateCounts() {
    cards().forEach(card => {
      const target = card.querySelector('[data-count]');
      try {
        const data = result(card);
        target.textContent = data ? `${data.rows.length.toLocaleString()} rows${card.dataset.report === 'coverage' ? ' in selected FY; extra years added on download' : ''}${!data.available && ['performance','periods','top10'].includes(card.dataset.report) ? ' · Performance unavailable' : ''}` : 'Data not loaded';
      } catch (error) { target.textContent = error.message; }
    });
    $('exportsPreview').hidden = true;
  }
  function setBusy(value) {
    busy = value;
    modal.querySelectorAll('button:not(.close), select, input').forEach(control => { control.disabled = value; });
  }
  async function refresh() {
    if (busy) return;
    setBusy(true); snapshot = null; updateCounts();
    $('exportsStatus').textContent = 'Reading saved report data…';
    try {
      snapshot = await window.APRExportSource.capture($('exportsYear').value, $('exportsStage').value, $('exportsCutoff').value === '' ? null : Number($('exportsCutoff').value));
      $('exportsSource').textContent = `${snapshot.year} · ${snapshot.stage} · Work Done: ${snapshot.file} · Report data read ${new Date(snapshot.capturedAt).toLocaleString()}`;
      $('exportsStatus').textContent = snapshot.correctionsError || 'Report data ready. Blank performance cells mean unavailable; zeros are real values.';
      updateCounts();
    } catch (error) { $('exportsStatus').textContent = error.message; $('exportsSource').textContent = ''; }
    finally { setBusy(false); }
  }
  function sheet(rows) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Status: 'No matching records in this scope' }]);
    const headings = Object.keys(rows[0] || {Status:''});
    ws['!cols'] = headings.map(heading => ({wch: /description|comment|reason|context|value/i.test(heading) ? 45 : /job no/i.test(heading) ? 18 : Math.max(14, Math.min(30, heading.length + 2))}));
    if (rows.length) ws['!autofilter'] = { ref: ws['!ref'] };
    rows.forEach((row, index) => headings.forEach((heading, column) => {
      const cell = ws[XLSX.utils.encode_cell({ r: index + 1, c: column })];
      if (cell?.t === 'n') cell.z = heading === 'Variance %' ? '0.0%' : /count|updated cells/i.test(heading) ? '#,##0' : '#,##0.0';
    }));
    return ws;
  }
  function preview(card, printing = false) {
    try {
      const data = result(card);
      if (!data) throw new Error('Refresh report data before previewing.');
      const title = reports.find(([id])=>id===card.dataset.report)[1];
      const headings = data.rows.length && card.dataset.report === 'top10' ? ['Standard Job No','Description','Unit','Latest forecast','Projected full year','Variance vs latest','Variance %','RAG'] : Object.keys(data.rows[0] || {});
      $('exportsPreviewTitle').textContent = title;
      $('exportsPreviewScope').textContent = `${snapshot.year} · ${snapshot.stage} · Work Done through ${snapshot.cutoff === null ? 'not selected' : 'P'+snapshot.cutoff} · ${scopeLabel(card)} · ${data.rows.length} rows${!printing && data.rows.length > 20 ? ' (first 20 shown)' : ''}`;
      $('exportsPreviewRows').innerHTML = headings.length ? `<table><thead><tr>${headings.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${(printing ? data.rows : data.rows.slice(0,20)).map(row=>`<tr>${headings.map(h=>`<td>${esc(row[h] === null ? 'Unavailable' : h === 'Variance %' ? (row[h]*100).toFixed(1)+'%' : row[h])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p>No matching records in this scope.</p>';
      $('exportsPreview').hidden = false;
      $('exportsPreview').scrollIntoView({block:'nearest'});
      return true;
    } catch (error) { $('exportsStatus').textContent = error.message; return false; }
  }
  async function download(selected) {
    if (busy) return;
    if (!selected.length) { $('exportsStatus').textContent = 'Tick at least one report to include in the review pack.'; return; }
    await refresh();
    if (!snapshot) return;
    setBusy(true);
    try {
      const workbook = XLSX.utils.book_new();
      const notes = [
        ['Generated at', snapshot.capturedAt], ['Financial Year', snapshot.year], ['Review stage', snapshot.stage],
        ['Completed reporting period', snapshot.cutoff === null ? 'Not selected' : `P${snapshot.cutoff}`], ['Work Done file', snapshot.file], ['Work Done uploaded at', snapshot.uploadedAt],
        ['Performance availability', snapshot.correctionsError || (snapshot.cutoff === null ? 'Reporting period not selected' : snapshot.cutoff > 0 && !snapshot.hasWorkDone ? 'Work Done not uploaded' : 'Available')],
        ['Latest forecast', 'Explicit V1 period values over V0; absent V1 inherits V0, zero overrides V0.'], ['Projected outcome', 'Corrected Work Done through cutoff plus latest forecast after cutoff.'],
        ['Units', 'Unit types are kept separate. No mixed-unit grand total.'], ['Empty numeric cells', 'Unavailable or no original value; zero is a real numeric zero.'],
        ['Job filters', $('exportsKeepFilters').checked ? $('exportsFilterNote').textContent : 'Cleared for this export']
      ];
      let count = 0;
      for (const card of selected) {
        const id = card.dataset.report;
        if ((id === 'orders' && !snapshot.hasWorkDone) || (snapshot.correctionsError && ['orders','performance','periods','top10'].includes(id))) throw new Error(snapshot.correctionsError || 'Upload Work Done for this financial year before exporting Work Orders.');
        let data = result(card);
        if (id === 'coverage') {
          const years = [...$('exportsCoverageYears').selectedOptions].map(option=>option.value).filter(year=>year !== snapshot.year);
          for (const year of years) {
            const extra = await window.APRExportSource.capture(year, snapshot.stage, null);
            data.rows.push(...result(card, extra).rows);
            notes.push([`Coverage ${year} read at`, extra.capturedAt]);
          }
        }
        count += data.rows.length;
        const title = reports.find(([key])=>key===id)[1];
        XLSX.utils.book_append_sheet(workbook, sheet(data.rows), title.slice(0,31));
        notes.push([`${title} scope`, scopeLabel(card)], [`${title} row count`, data.rows.length]);
        if (id === 'comments') notes.push(['Comment type / stage', `${filters().commentType} / ${filters().commentStage}`]);
        if (id === 'orders') notes.push(['Work Order selection', filters().orders]);
        if (id === 'top10') notes.push(['Ranking', filters().rank === 'units' ? 'Absolute units, top 10 per unit type' : 'Absolute percentage; nonzero delivery against zero forecast ranks first']);
      }
      if (!count) throw new Error('No matching records. Adjust the scope or filters and try again.');
      XLSX.utils.book_append_sheet(workbook, sheet(notes.map(([Setting,Value])=>({Setting,Value}))), 'About');
      const slug = value => String(value).replace(/[^a-z0-9-]+/gi,'-');
      const filenameScope = selected.length === 1 ? scopeLabel(selected[0]) : $('exportsDU').selectedOptions[0].textContent;
      XLSX.writeFile(workbook, `APR-${selected.length === 1 ? selected[0].dataset.report : 'review-pack'}-${snapshot.year}-${slug(filenameScope).slice(0,80)}-${snapshot.stage}-${snapshot.cutoff === null ? 'no-cutoff' : 'P'+snapshot.cutoff}-${snapshot.capturedAt.slice(0,10)}.xlsx`);
      $('exportsStatus').textContent = `Downloaded ${selected.length} report${selected.length===1?'':'s'} (${count.toLocaleString()} rows).`;
    } catch (error) { $('exportsStatus').textContent = error.message; }
    finally { setBusy(false); }
  }
  function close() { modal.classList.remove('open'); }
  async function open() {
    if (busy) { modal.classList.add('open'); return; }
    defaults = window.APRExportSource.defaults();
    selection($('exportsYear'), (window.getFinancialYearOptions?.() || window.DEFAULT_FINANCIAL_YEARS).map(id=>({id,name:id})), defaults.year);
    selection($('exportsStage'), [...new Set([defaults.stage,...window.REVIEW_STAGES].filter(Boolean))].map(id=>({id,name:id})), defaults.stage);
    selection($('exportsDU'), [{id:'all',name:'All Delivery Units'},...window.getDeliveryUnits()], defaults.du);
    selection($('exportsCoverageYears'), (window.getFinancialYearOptions?.() || window.DEFAULT_FINANCIAL_YEARS).map(id=>({id,name:id})), '');
    [...$('exportsCoverageYears').options].forEach(option=>option.selected=false);
    selection($('exportsCommentType'), ['all','General','RF3','RF6','RF9','RF11','IME'].map(id=>({id,name:id === 'all' ? 'All types' : id})), 'all');
    selection($('exportsCommentStage'), ['all',...window.REVIEW_STAGES].map(id=>({id,name:id === 'all' ? 'All stages' : id})), 'all');
    $('exportsCutoff').value = defaults.cutoff === null ? '' : String(defaults.cutoff);
    $('exportsKeepFilters').checked = true;
    const activeFilters = [defaults.filters.search && `Search: ${defaults.filters.search}`, defaults.filters.members && 'Selected SJN group', defaults.filters.review !== 'all' && `Review status: ${defaults.filters.review === 'needsreview' ? 'Needs review' : 'Reviewed'}`, defaults.filters.variance !== 'all' && `Variance: ${document.getElementById('varianceFilter').selectedOptions[0].textContent}`, defaults.filters.hideZero && 'Zero volume hidden'].filter(Boolean);
    $('exportsFilterNote').textContent = activeFilters.length ? activeFilters.join(' · ') : 'No additional job filters. The scope selectors control Engineer and Work Group Set.';
    cards().forEach(card=>{card.querySelector('[data-scale]').value=defaults.scale; targets(card,defaults.target);});
    modal.classList.add('open');
    await refresh();
  }
  cards().forEach(card=>{
    card.querySelector('[data-scale]').onchange=()=>{targets(card);updateCounts();};
    card.querySelector('[data-target]').onchange=updateCounts;
    card.querySelector('[data-preview]').onclick=()=>preview(card);
    card.querySelector('[data-download]').onclick=()=>download([card]);
  });
  modal.querySelector('.close').onclick=close;
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  $('exportsDU').onchange=()=>{cards().forEach(card=>targets(card));updateCounts();};
  ['exportsYear','exportsStage','exportsCutoff'].forEach(id=>$(id).onchange=refresh);
  ['exportsKeepFilters','exportsCommentType','exportsCommentStage','exportsOrderMode','exportsRank','exportsCoverageYears'].forEach(id=>$(id).onchange=updateCounts);
  $('exportsRefresh').onclick=refresh;
  $('exportsDownloadPack').onclick=()=>download(cards().filter(card=>card.querySelector('[data-pack]').checked));
  $('exportsPrintBrief').onclick=async()=>{
    await refresh();
    if(!snapshot)return;
    if(snapshot.correctionsError || !result(cardFor('top10')).available){$('exportsStatus').textContent=snapshot.correctionsError || 'Select a reporting cutoff and upload Work Done before printing performance.';return;}
    if(!result(cardFor('top10')).rows.length){$('exportsStatus').textContent='No nonzero variances in this scope.';return;}
    if(preview(cardFor('top10'),true))window.print();
  };
  $('exportsOpenBuilder').onclick=()=>{close();window.openForecastBuilderPreview();};
  modal.querySelectorAll('[data-backup]').forEach(button=>button.onclick=async()=>{
    if(busy)return;setBusy(true);
    try {
      const data=await window.APRExportSource.backup(button.dataset.backup);
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`${button.dataset.backup==='comments'?'comments':'baseline-data'}-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      $('exportsStatus').textContent='Saved data downloaded. This file contains all saved years and Delivery Units.';
    }catch(error){$('exportsStatus').textContent=error.message;}finally{setBusy(false);}
  });
  window.APRExports={open,close};
  $('forecastSavedFileExports').addEventListener('toggle', event => { if(event.target.open) window.populateExportSelectors(); });
})();
