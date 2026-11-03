(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => window.escapeHtml(String(value ?? ''));
  const reports = [
    ['v0', 'V0', 'Original P1–P13 plan, in the reference job order with annual totals and comments.'],
    ['v1', 'V1', 'Latest full P1–P13 forecast: saved V1 amendments with V0 inherited where unchanged.'],
    ['rf', 'RF review plan', 'Corrected Work Done through the cutoff plus remaining forecast, using current saved figures. RF stage selects review status and commentary; it is not a historical snapshot.'],
    ['orders', 'Work Order data errors', 'Outstanding corrections, source data flags and matching issues awaiting review. Confirmed ELLIPSE resolutions are excluded.'],
    ['comments', 'Comments', 'Review commentary and actions, scoped by current organisational ownership.']
  ];
  let defaults, snapshot, busy = false;
  const reportCache = new Map();
  let directory = [];
  const modal = document.createElement('div');
  modal.id = 'exportsModal'; modal.className = 'modal';
  modal.setAttribute('aria-labelledby', 'exportsTitle');
  modal.innerHTML = `<div class="modal-content modal-content--wide exports-content">
    <div class="modal-header"><div><h2 id="exportsTitle">Exports</h2><p class="helper-text">Choose a report, set its scope, then preview or download.</p></div><button type="button" class="close" aria-label="Close exports">&times;</button></div>
    <details class="exports-settings"><summary id="exportsContextSummary">Reporting context</summary><div class="exports-context">
      <label>Financial year<select id="exportsYear"></select></label>
      <label>Work Done through (required for RF review)<select id="exportsCutoff"><option value="">Select completed period…</option>${Array.from({length:13},(_,i)=>`<option value="${i+1}">P${i+1}</option>`).join('')}</select></label>
      <label>Delivery Unit<select id="exportsDU"></select></label>
    </div>
    <label class="exports-filter-choice"><input type="checkbox" id="exportsKeepFilters" checked> Keep dashboard job filters for Comments and Work Order data errors</label>
    <p class="helper-text">V0, V1 and RF review plan always include every standard job. Their scope selects the figures and comments; dashboard job filters do not hide rows.</p>
    <p id="exportsFilterNote" class="helper-text"></p><button type="button" id="exportsRefresh" class="group-action-button">Reload saved data</button>

    </details><p id="exportsSource" class="helper-text"></p><p id="exportsStatus" role="status" aria-live="polite"></p><div class="exports-section-heading"><h3>Choose a report</h3></div>

    <div class="exports-report-list">${reports.map(([id,title,description])=>`<details class="exports-report" data-report="${id}"><summary><span>${title}</span><span data-count></span></summary><div class="exports-report-body"><p class="helper-text">${description}</p>
      <div class="exports-report-options"><label>Scope<select data-scale aria-label="${title} scope"><option value="du">Entire selected DU</option><option value="engineer">Engineer</option><option value="workgroup">Work Group Set</option></select></label><label data-target-label>Selection<select data-target aria-label="${title} selection"></select></label>
      ${id === 'comments' ? '<label>Comment type<select id="exportsCommentType"><option value="all">All types</option></select></label><label>Comment review stage<select id="exportsCommentStage"><option value="all">All stages</option></select></label>' : ''}
      ${id === 'rf' ? '<label>RF stage<select id="exportsStage"></select></label><p class="helper-text">Requires Work Done loaded for the selected financial year and a completed period (P1–P13) set in Reporting context above. Confirm that the file includes all Work Done through that period.</p>' : ''}
      </div><div class="exports-report-actions"><button type="button" class="group-action-button" data-preview>Preview</button><button type="button" class="primary-button" data-download>Download Excel</button></div></div></details>`).join('')}</div>
    <details class="exports-backups"><summary>Saved data backups (JSON)</summary><p>For restoring or transferring saved data. These downloads contain <strong>all saved financial years and Delivery Units</strong> and ignore report filters. They are not a full database backup and do not include session Work Done.</p><button type="button" class="group-action-button" data-backup="comments">Download all saved comments</button><button type="button" class="group-action-button" data-backup="baselines">Download all prior submissions</button></details>
    <p class="helper-text">Import-compatible forecast backups and data-transfer downloads remain in <button type="button" class="group-action-button" id="exportsOpenBuilder">Forecast Builder</button>.</p>
    <section id="exportsPreview" class="exports-preview" hidden><h3 id="exportsPreviewTitle"></h3><p id="exportsPreviewScope"></p><div id="exportsPreviewRows" class="apr-table-scroll"></div></section>
  </div>`;
  document.body.append(modal);
  const cards = () => [...modal.querySelectorAll('[data-report]')];
  const selection = (select, items, value) => {
    select.innerHTML = items.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
    select.value = items.some(item => item.id === value) ? value : items[0]?.id || '';
  };
  const scope = card => ({ du: $('exportsDU').value, scale: card.querySelector('[data-scale]').value, target: card.querySelector('[data-target]').value });
  const scopeLabel = card => {
    const value = scope(card);
    return `Delivery Unit: ${$('exportsDU').selectedOptions[0]?.textContent} · ${value.scale === 'du' ? 'Entire DU selection' : (value.scale === 'engineer' ? 'Engineer: ' : 'Work Group Set: ') + (card.querySelector('[data-target]').selectedOptions[0]?.textContent || 'No selection')}`;
  };
  function targets(card, preferred) {
    const du = $('exportsDU').value, scale = card.querySelector('[data-scale]').value;
    const engineers = du === 'all' ? window.getEngineers() : window.getEngineersForDeliveryUnit(du);
    const select = card.querySelector('[data-target]');
    const previous = preferred || select.value;
    const items = scale === 'engineer' ? engineers : directory.filter(item => du === 'all' || item.du === du);
    selection(select, items, previous);
    card.querySelector('[data-target-label]').hidden = scale === 'du';
    card.querySelector('[data-scale] option[value="du"]').textContent = du === 'all' ? 'All Delivery Units' : 'Entire selected DU';
  }
  function filters() {
    return { ...($('exportsKeepFilters').checked ? defaults.filters : {}), commentType: $('exportsCommentType').value, commentStage: $('exportsCommentStage').value, orders: 'corrected' };
  }
  async function result(card, source = snapshot) {
    if (!source) return null;
    const value = scope(card);
    if (value.scale !== 'du' && !value.target) throw new Error('Choose an Engineer or Work Group Set for this report.');
    const key = JSON.stringify([card.dataset.report,value,filters()]);
    if (source !== snapshot || !reportCache.has(key)) {
      const pending = window.APRExportData.prepareAsync(source, value, filters(), card.dataset.report);
      if (source === snapshot) reportCache.set(key, pending);
      else { const prepared = await pending; return { rows: prepared.datasets[card.dataset.report], available: prepared.available }; }
    }
    const prepared = await reportCache.get(key);
    let rows = prepared.datasets[card.dataset.report];
    return { rows: ['v0','v1','rf'].includes(card.dataset.report) ? window.APRExportWorkbook.ordered(rows, window.APRExportLayout) : rows, available: prepared.available };
  }
  function updateCounts() {
    reportCache.clear();
    cards().forEach(card => { card.querySelector('[data-count]').textContent = ''; });
    $('exportsPreview').hidden = true;
    $('exportsContextSummary').textContent = [$('exportsYear').value,$('exportsStage').value,$('exportsDU').selectedOptions[0]?.textContent,'Work Done through '+($('exportsCutoff').value === '' ? 'not selected' : 'P'+$('exportsCutoff').value)].join(' · ');
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
  const sheet = rows => window.APRExportWorkbook.tableSheet(XLSX, rows);
  function planContext(card) {
    const id = card.dataset.report;
    return { title: reports.find(([key]) => key === id)[1], year: snapshot.year,
      scope: scopeLabel(card), stage: snapshot.stage, cutoff: snapshot.cutoff, rf: id === 'rf',
      filters: 'All standard jobs — dashboard job filters ignored',
      basis: id === 'v0' ? 'Original saved V0 plan. No Work Done included.' : id === 'v1' ? 'Current saved V1 amendments over V0; explicit zero replaces V0. No Work Done included.' : 'Current corrected Work Done through P' + snapshot.cutoff + ', then current V1 forecast with V0 inheritance. Not a historical RF snapshot.',
      capturedAt: snapshot.capturedAt, file: snapshot.file, uploadedAt: snapshot.uploadedAt };
  }
  function validateRF(card) {
    if (card.dataset.report !== 'rf') return;
    if (!snapshot.hasWorkDone) throw new Error('Upload Work Done for the selected financial year before previewing or exporting an RF review plan.');
    if (!Number.isInteger(snapshot.cutoff) || snapshot.cutoff < 1 || snapshot.cutoff > 13) {
      modal.querySelector('.exports-settings').open = true;
      throw new Error('Select a Work Done cutoff (P1–P13) in Reporting context to confirm where the uploaded Work Done goes up to.');
    }
    if (snapshot.correctionsError) throw new Error(snapshot.correctionsError);
  }
  async function preview(card, printing = false) {
    if (busy) return false;
    if (!snapshot || card.dataset.report === 'rf') await refresh();
    if (!snapshot) return false;
    setBusy(true);
    $('exportsStatus').textContent = 'Preparing report…';
    try {
      validateRF(card);
      const data = await result(card);
      card.querySelector('[data-count]').textContent = data.rows.length.toLocaleString()+' rows';
      $('exportsStatus').textContent = card.dataset.report !== 'rf' || data.available ? 'Preview ready.' : 'Preview ready. RF plan values are unavailable until a cutoff and Work Done are available.';
      if (!data) throw new Error('Refresh report data before previewing.');
      const title = reports.find(([id])=>id===card.dataset.report)[1];
      const headings = Object.keys(data.rows[0] || {});
      $('exportsPreviewTitle').textContent = title;
      $('exportsPreviewScope').textContent = `${snapshot.year} · ${snapshot.stage} · Work Done through ${snapshot.cutoff === null ? 'not selected' : 'P'+snapshot.cutoff} · ${scopeLabel(card)} · ${data.rows.length} rows${!printing && data.rows.length > 20 ? ' (first 20 shown)' : ''}`;
      $('exportsPreviewRows').innerHTML = headings.length ? `<table><thead><tr>${headings.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${(printing ? data.rows : data.rows.slice(0,20)).map(row=>`<tr>${headings.map(h=>`<td>${esc(row[h] === null ? 'Unavailable' : h === 'Variance %' ? (row[h]*100).toFixed(1)+'%' : row[h])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : card.dataset.report === 'orders' && filters().orders === 'corrected' ? '<p>No outstanding Work Order data errors or corrections in this selection. Confirmed ELLIPSE resolutions are excluded.</p>' : '<p>No matching records in this scope.</p>';
      $('exportsPreview').hidden = false;
      $('exportsPreview').scrollIntoView({block:'nearest'});
      return true;
    } catch (error) { $('exportsStatus').textContent = error.message; return false; }
    finally { setBusy(false); }
  }
  async function download(card) {
    if (busy) return;
    await refresh();
    if (!snapshot) return;
    setBusy(true);
    try {
      validateRF(card);
      const workbook = XLSX.utils.book_new();
      const notes = [
        ['Generated at', snapshot.capturedAt], ['Financial Year', snapshot.year], ['Review stage', snapshot.stage],
        ['Completed reporting period', snapshot.cutoff === null ? 'Not selected' : `P${snapshot.cutoff}`], ['Work Done file', snapshot.file], ['Work Done uploaded at', snapshot.uploadedAt],
        ['Performance availability', snapshot.correctionsError || (snapshot.cutoff === null ? 'Reporting period not selected' : snapshot.cutoff > 0 && !snapshot.hasWorkDone ? 'Work Done not uploaded' : 'Available')],
        ['Latest forecast', 'Explicit V1 period values over V0; absent V1 inherits V0, zero overrides V0.'], ['Projected outcome', 'Corrected Work Done through cutoff plus latest forecast after cutoff.'],
        ['Units', 'Unit types are kept separate. No mixed-unit grand total.'], ['Empty numeric cells', 'Unavailable or no original value; zero is a real numeric zero.'],
        ['Work Order correction lifecycle', 'Outstanding corrections exclude confirmed ELLIPSE resolutions. Identified active corrections missing from the current upload remain outstanding; their source units are unavailable. Corrections are shared across uploads rather than FY-specific.'],
        ['Job filters', ['v0','v1','rf'].includes(card.dataset.report) ? 'All standard jobs — dashboard job filters ignored' : $('exportsKeepFilters').checked ? $('exportsFilterNote').textContent : 'Cleared for this export']
      ];
      let count = 0;
      {
        const id = card.dataset.report;
        if ((id === 'orders' && !snapshot.hasWorkDone) || (snapshot.correctionsError && ['orders','rf'].includes(id))) throw new Error(snapshot.correctionsError || 'Upload Work Done for this financial year before exporting Work Orders.');
        $('exportsStatus').textContent = 'Preparing '+reports.find(([key])=>key===id)[1]+'…';
        let data = await result(card);
        data = { ...data, rows: [...data.rows] };
        count += data.rows.length;
        const title = reports.find(([key])=>key===id)[1];
        if (id === 'rf' && !data.available) throw new Error('Select a Work Done cutoff and upload Work Done for this financial year before exporting an RF review plan.');
        XLSX.utils.book_append_sheet(workbook, ['v0','v1','rf'].includes(id) ? window.APRExportWorkbook.planSheet(XLSX, data.rows, planContext(card), window.APRExportLayout) : sheet(data.rows), title.slice(0,31));
        notes.push([`${title} scope`, scopeLabel(card)], [`${title} row count`, data.rows.length]);
        if (id === 'comments') notes.push(['Comment type / stage', `${filters().commentType} / ${filters().commentStage}`]);
        if (id === 'orders') notes.push(['Work Order selection', 'Outstanding corrections and data errors only']);
      }
      if (!count) throw new Error(card.dataset.report === 'orders' && filters().orders === 'corrected' ? 'No outstanding Work Order data errors or corrections in this selection. Confirmed ELLIPSE resolutions are excluded.' : 'No matching records. Adjust the scope or filters and try again.');
      XLSX.utils.book_append_sheet(workbook, sheet(notes.map(([Setting,Value])=>({Setting,Value}))), 'About');
      const slug = value => String(value).replace(/[^a-z0-9-]+/gi,'-');
      const filenameScope = scopeLabel(card);
      XLSX.writeFile(workbook, `APR-${card.dataset.report}-${snapshot.year}-${slug(filenameScope).slice(0,80)}-${snapshot.stage}-${snapshot.cutoff === null ? 'no-cutoff' : 'P'+snapshot.cutoff}-${snapshot.capturedAt.slice(0,10)}.xlsx`);
      $('exportsStatus').textContent = `Downloaded ${reports.find(([id])=>id===card.dataset.report)[1]} (${count.toLocaleString()} rows).`;
    } catch (error) { $('exportsStatus').textContent = error.message; }
    finally { setBusy(false); }
  }
  function close() { modal.classList.remove('open'); }
  async function open() {
    if (busy) { modal.classList.add('open'); return; }
    snapshot = null; reportCache.clear();
    defaults = window.APRExportSource.defaults();
    const owners = new Map();
    window.getEngineers().forEach(engineer => engineer.workGroupSets.forEach(code=>owners.set(code,engineer.deliveryUnitId)));
    directory = [...window.workGroupSets].map(([id,name])=>({id,name:name+' ('+id+')',du:owners.get(id)}));
    selection($('exportsYear'), (window.getFinancialYearOptions?.() || window.DEFAULT_FINANCIAL_YEARS).map(id=>({id,name:id})), defaults.year);
    selection($('exportsStage'), [...new Set([defaults.stage,...window.REVIEW_STAGES].filter(Boolean))].map(id=>({id,name:id})), defaults.stage);
    selection($('exportsDU'), [{id:'all',name:'All Delivery Units'},...window.getDeliveryUnits()], defaults.du);
    selection($('exportsCommentType'), ['all','General','RF3','RF6','RF9','RF11','IME'].map(id=>({id,name:id === 'all' ? 'All types' : id})), 'all');
    selection($('exportsCommentStage'), ['all',...window.REVIEW_STAGES].map(id=>({id,name:id === 'all' ? 'All stages' : id})), 'all');
    $('exportsCutoff').value = defaults.cutoff === null ? '' : String(defaults.cutoff);
    $('exportsKeepFilters').checked = true;
    const activeFilters = [defaults.filters.search && `Search: ${defaults.filters.search}`, defaults.filters.members && `SJN group: ${defaults.filters.groupName || 'Selected group'}`, defaults.filters.review !== 'all' && `Review status: ${defaults.filters.review === 'needsreview' ? 'Needs review' : 'Reviewed'}`, defaults.filters.variance !== 'all' && `Variance: ${document.getElementById('varianceFilter').selectedOptions[0].textContent}`, defaults.filters.hideZero && 'Zero volume hidden'].filter(Boolean);
    $('exportsFilterNote').textContent = activeFilters.length ? activeFilters.join(' · ') : 'No additional job filters. The scope selectors control Engineer and Work Group Set.';
    cards().forEach(card=>{card.querySelector('[data-scale]').value=defaults.scale; targets(card,defaults.target);});
    modal.classList.add('open');
    cards().forEach(card => {card.open=false;});
    $('exportsSource').textContent = '';
    $('exportsStatus').textContent = '';
    updateCounts();
  }
  cards().forEach(card=>{
    card.addEventListener('toggle',()=>{if(card.open)cards().filter(other=>other!==card).forEach(other=>other.open=false);});
    card.querySelector('[data-scale]').onchange=()=>{targets(card);updateCounts();};
    card.querySelector('[data-target]').onchange=updateCounts;
    card.querySelector('[data-preview]').onclick=()=>preview(card);
    card.querySelector('[data-download]').onclick=()=>download(card);
  });
  modal.querySelector('.close').onclick=close;
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  $('exportsDU').onchange=()=>{cards().forEach(card=>targets(card));updateCounts();};
  ['exportsYear','exportsStage','exportsCutoff'].forEach(id=>$(id).onchange=()=>{snapshot=null;updateCounts();});
  ['exportsKeepFilters','exportsCommentType','exportsCommentStage'].forEach(id=>$(id).onchange=updateCounts);
  $('exportsRefresh').onclick=refresh;
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
