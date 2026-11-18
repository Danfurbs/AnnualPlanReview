/* Integrated Engineer-scoped OTM planner. Inputs become durable with the V0 save. */
(function (window) {
  'use strict';
  const model = window.OtmForecast, periods = window.ForecastModel.periods;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => value === null || value === undefined ? '—' : Number(value).toLocaleString('en-GB', { maximumFractionDigits: 6 });
  const byId = id => document.getElementById(id);
  let dialog, context, source, engineerId, selectedJob = 0, tab = 'shifts', busy = false, importSerial = 0;
  let drafts = new Map();
  const engineer = () => context.engineers.find(e => e.id === engineerId);
  const resolve = value => window.resolveWorkGroupCode?.(value) || value;
  const groups = () => [...new Set(engineer().workGroupSets.map(resolve))];
  const detail = number => (window.STANDARD_JOBS || []).find(j => window.ForecastModel.extractJobNumber(j.standardJobNo) === number) || {};
  const unit = number => detail(number).unitOfMeasure || '';
  const description = number => detail(number).standardJobDescription || `SJN ${Number(number)}`;
  const groupName = code => window.workGroupSets?.get(code) || code;
  const options = () => ({ engineerId, workGroups: groups(), resolve });
  const total = values => model.total(values);
  function draft() {
    if (!drafts.has(engineerId)) drafts.set(engineerId, { plans: model.plans(source, groups(), resolve), dirty: false });
    return drafts.get(engineerId);
  }
  const hasDirty = () => [...drafts.values()].some(d => d.dirty);
  function ready(plan) { try { model.outputs(plan); return Boolean(plan.workGroup && groups().includes(plan.workGroup)); } catch { return false; } }
  function values(plan) { return Object.fromEntries(periods.map(p => {
    const n = plan.rate === null || plan.shifts[p] === undefined ? null : plan.shifts[p] * plan.rate;
    return [p, n === null || !Number.isFinite(n) ? null : Number(n.toFixed(6))];
  })); }
  function getJob(data, number) { return [...data].find(([key]) => window.ForecastModel.extractJobNumber(key) === number)?.[1] || {}; }
  function row(data, number, code) { return window.ForecastModel.readWorkGroupForecast(getJob(data, number), code, resolve).periods; }
  function evidence(number, code) {
    return Object.assign({}, ...Object.entries(getJob(source, number).sources || {}).filter(([key]) => resolve(key) === code).map(([, e]) => e));
  }
  function message(text, error = false) { byId('otmStatus').textContent = text; byId('otmStatus').classList.toggle('otm-error', error); }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.id = 'otmPlanner'; dialog.className = 'otm-planner'; dialog.setAttribute('aria-labelledby', 'otmTitle');
    dialog.innerHTML = `<header class="otm-header"><div><div class="otm-eyebrow">Forecast Builder</div><h1 id="otmTitle">OTM Shift Planner</h1></div><div class="otm-header-actions"><strong id="otmYear"></strong><button type="button" id="otmClose" class="group-action-button">Back to Forecast Builder</button></div></header>
      <div class="otm-layout"><aside class="otm-sidebar"><h2>Engineers</h2><div id="otmEngineers"></div></aside><main class="otm-main">
      <div class="otm-intro"><div><h2 id="otmEngineer"></h2><p>Build your OTM forecast from planned shifts and average outputs. Applying the plan overwrites existing V0 volumes for the selected jobs and Work Group Sets.</p></div><div class="otm-actions"><button type="button" id="otmImport" class="group-action-button">Import DU shifts</button><button type="button" id="otmExport" class="group-action-button">Export calculations</button></div></div>
      <div class="otm-stats" id="otmStats"></div><nav class="otm-tabs" aria-label="OTM planner sections"><button type="button" data-otm-tab="shifts">01 &nbsp; Shifts & outputs</button><button type="button" data-otm-tab="rates">02 &nbsp; Output rates</button><button type="button" data-otm-tab="review">03 &nbsp; Review & apply</button></nav>
      <section id="otmShifts"><div class="otm-columns"><div class="otm-panel"><div id="otmJobs" class="otm-jobs"></div><div class="otm-job-heading"><div><h3 id="otmJobTitle"></h3><small id="otmJobUnit"></small></div><div class="otm-rate-summary">Output / shift: <strong id="otmRateValue"></strong> <span id="otmRateUnit"></span><button type="button" id="otmEditRate">Edit rates</button></div></div><div class="otm-allocation"><label class="otm-include"><input type="checkbox" id="otmEnabled"> Include this job</label><label for="otmWorkGroup">Work Group Set</label><select id="otmWorkGroup"></select></div><div class="otm-scroll"><table><thead><tr><th>Period</th><th>Planned shifts</th><th>OTM output</th><th>Current V0</th><th>Movement</th></tr></thead><tbody id="otmPeriods"></tbody><tfoot id="otmTotal"></tfoot></table></div><div class="otm-table-note">Blank = unresolved · 0 = confirmed zero</div></div><aside class="otm-panel otm-output"><div class="otm-eyebrow">Annual output</div><h3 id="otmFormulaTitle"></h3><div id="otmFormula" class="otm-formula"></div><div class="otm-chart" id="otmChart" role="img" aria-label="Calculated output P1 to P13"></div><small>Calculated output · P1–P13</small></aside></div></section>
      <section id="otmRates" hidden><div class="otm-panel"><div class="otm-panel-heading"><h3>Average output per shift</h3><small id="otmRateScope"></small></div><div id="otmRateCards" class="otm-rate-cards"></div></div></section>
      <section id="otmReview" hidden><p class="otm-overwrite">Applying this plan will overwrite existing V0 volumes for the selected jobs and Work Group Sets.</p><div class="otm-panel"><div class="otm-panel-heading"><h3>Forecast impact</h3><small>Annual volumes · units shown per job</small></div><div class="otm-scroll"><table><thead><tr><th>Standard Job / Work Group Set</th><th>Proposed V0</th><th>MST</th><th>WAIF</th><th>Current V0</th><th>Movement</th><th>Action</th></tr></thead><tbody id="otmReviewRows"></tbody></table></div></div></section>
      <details class="otm-import-panel" id="otmImportPanel" hidden><summary>Import shifts</summary><p>Use the template for the selected Engineer and FY. Matching job / period entries replace previous shifts.</p><button type="button" id="otmTemplate" class="group-action-button">Download template</button><label for="otmFile">CSV or Excel · columns: sjn, period, shifts</label><input id="otmFile" type="file" accept=".csv,.xlsx,.xls"><div id="otmImportStatus" role="status"></div></details>
      </main></div><footer class="otm-footer"><div><strong id="otmStatus" role="status" aria-live="polite"></strong><small>V0 only · saved V1 amendments remain in effect.</small></div><div class="otm-actions"><button type="button" id="otmReload" class="group-action-button">Reload saved values</button><button type="button" id="otmApply" class="primary-button">Review forecast</button></div></footer>`;
    document.body.appendChild(dialog);
    byId('otmClose').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    byId('otmEngineers').onclick = event => {
      const button = event.target.closest('[data-otm-engineer]'); if (!button || busy) return;
      engineerId = button.dataset.otmEngineer; importSerial++; byId('otmImportPanel').hidden = true;
      byId('otmImportStatus').textContent = ''; byId('otmFile').value = ''; render();
    };
    dialog.querySelectorAll('[data-otm-tab]').forEach(button => button.onclick = () => { if (!busy) { tab = button.dataset.otmTab; render(); } });
    byId('otmJobs').onclick = event => { const button = event.target.closest('[data-otm-job]'); if (button && !busy) { selectedJob = Number(button.dataset.otmJob); render(); } };
    byId('otmEnabled').onchange = event => { if (busy) return; draft().plans[selectedJob].enabled = event.target.checked; changed(); };
    byId('otmWorkGroup').onchange = event => { if (busy || !groups().includes(event.target.value)) return; const p = draft().plans[selectedJob]; p.workGroup = event.target.value; changed(); };
    byId('otmEditRate').onclick = () => { tab = 'rates'; render(); byId(`otmRate${selectedJob}`).focus(); };
    byId('otmPeriods').addEventListener('change', event => {
      const input = event.target.closest('[data-otm-period]'); if (!input || busy) return;
      if (!input.validity.valid) { input.reportValidity(); return; }
      const p = draft().plans[selectedJob]; const value = window.ForecastModel.parseCell(input.value);
      if (value === undefined) delete p.shifts[input.dataset.otmPeriod]; else p.shifts[input.dataset.otmPeriod] = value;
      p.enabled = true; changed(true);
    });
    byId('otmRateCards').addEventListener('change', event => {
      const input = event.target.closest('[data-otm-rate]'); if (!input || busy) return;
      if (!input.validity.valid) { input.reportValidity(); return; }
      const p = draft().plans[Number(input.dataset.otmRate)]; p.rate = window.ForecastModel.parseCell(input.value) ?? null; p.enabled = true; changed(true);
    });
    byId('otmApply').onclick = () => tab === 'review' ? apply().catch(error => message(error.message, true)) : (tab = 'review', render());
    byId('otmReload').onclick = () => reload().catch(error => message(error.message, true));
    byId('otmImport').onclick = () => { byId('otmImportPanel').hidden = false; byId('otmImportPanel').open = true; byId('otmImportPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
    byId('otmTemplate').onclick = () => download(`OTM-${context.year}-shifts-template.csv`, 'fy,engineer,sjn,period,shifts\r\n'+model.JOBS.flatMap(j => periods.map(p => `${context.year},${engineerId},${Number(j)},${p.slice(1)},`)).join('\r\n'));
    byId('otmFile').onchange = event => importFile(event.target.files?.[0]);
    byId('otmExport').onclick = exportCalculations;
    window.addEventListener('beforeunload', event => { if (dialog.open && hasDirty()) { event.preventDefault(); event.returnValue = ''; } });
  }
  function changed(keepInputs = false) { draft().dirty = true; render({ keepInputs }); }
  function render({ keepInputs = false } = {}) {
    const d = draft(), selected = d.plans[selectedJob], active = d.plans.filter(p => p.enabled);
    const readyCount = active.filter(ready).length;
    const missing = active.reduce((n,p) => n + periods.filter(period => p.shifts[period] === undefined).length, 0);
    byId('otmYear').textContent = context.year+' · V0'; byId('otmEngineer').textContent = engineer().name;
    if (!keepInputs) byId('otmEngineers').innerHTML = context.engineers.map(e => {
      const item = drafts.get(e.id), count = item?.plans.filter(p => p.enabled).length;
      return `<button type="button" class="otm-engineer ${e.id===engineerId?'selected':''}" data-otm-engineer="${escape(e.id)}" aria-pressed="${e.id===engineerId}"><strong>${escape(e.name)}</strong><small>${item?.dirty?'Unsaved changes':count === undefined?'':count+' jobs included'}</small></button>`;
    }).join('');
    byId('otmStats').innerHTML = [ ['Allocated shifts', fmt(active.reduce((n,p) => n+total(p.shifts),0)), 'Selected Engineer · '+context.year], ['Jobs ready', `${readyCount} / ${active.length}`, 'Shifts, rate and Work Group Set entered'], ['Missing shift inputs',fmt(missing), missing?'Job / period entries to complete':'No outstanding shift entries'] ].map(([label,value,note]) => `<article><small>${escape(label)}</small><strong>${escape(value)}</strong><small>${escape(note)}</small></article>`).join('');
    dialog.querySelectorAll('[data-otm-tab]').forEach(b => { b.classList.toggle('active', b.dataset.otmTab===tab); b.setAttribute('aria-current', b.dataset.otmTab===tab?'page':'false'); });
    byId('otmShifts').hidden = tab!=='shifts'; byId('otmRates').hidden = tab!=='rates'; byId('otmReview').hidden = tab!=='review';
    if (!keepInputs) byId('otmJobs').innerHTML = d.plans.map((p,i) => `<button type="button" class="${i===selectedJob?'active':''}" data-otm-job="${i}" aria-pressed="${i===selectedJob}"><strong>${Number(p.jobNumber)}</strong> ${escape(description(p.jobNumber).replace(/^TEF\d+\.\s*/i,''))}</button>`).join('');
    byId('otmJobTitle').textContent = `${Number(selected.jobNumber)} · ${description(selected.jobNumber)}`;
    byId('otmJobUnit').textContent = unit(selected.jobNumber);
    byId('otmRateValue').textContent = fmt(selected.rate); byId('otmRateUnit').textContent = unit(selected.jobNumber);
    byId('otmEnabled').checked = selected.enabled;
    if (!keepInputs) byId('otmWorkGroup').innerHTML = groups().map(code => `<option value="${escape(code)}" ${code===selected.workGroup?'selected':''}>${escape(groupName(code))} · ${escape(code)}</option>`).join('');
    const calculated = values(selected), current = row(source, selected.jobNumber, selected.workGroup);
    if (!keepInputs) byId('otmPeriods').innerHTML = periods.map(p => {
      const output = calculated[p], movement = output === null ? null : output-(current[p] ?? 0);
      return `<tr><th scope="row">${p}</th><td><input type="number" min="0" step="any" value="${selected.shifts[p] ?? ''}" placeholder="—" data-otm-period="${p}" aria-label="${p} planned shifts"></td><td class="otm-number">${fmt(output)}</td><td>${fmt(current[p])}</td><td>${movement>0?'+':''}${fmt(movement)}</td></tr>`;
    }).join('');
    else byId('otmPeriods').querySelectorAll('tr').forEach((tr,i) => {
      const p = periods[i], output = calculated[p], movement = output === null ? null : output-(current[p] ?? 0), cells = tr.querySelectorAll('td');
      cells[1].textContent = fmt(output); cells[2].textContent = fmt(current[p]); cells[3].textContent = (movement>0?'+':'')+fmt(movement);
    });
    const complete = ready(selected);
    byId('otmTotal').innerHTML = `<tr><th>Annual total</th><td>${fmt(total(selected.shifts))}</td><td class="otm-number">${complete?fmt(total(calculated)):'—'} ${escape(unit(selected.jobNumber))}</td><td>${fmt(total(current))}</td><td>${complete?fmt(total(calculated)-total(current)):'—'}</td></tr>`;
    byId('otmFormulaTitle').textContent = Number(selected.jobNumber)+' · '+unit(selected.jobNumber);
    byId('otmFormula').innerHTML = `<div><strong>${fmt(total(selected.shifts))}</strong><small>shifts</small></div><span>×</span><div><strong>${fmt(selected.rate)}</strong><small>output / shift</small></div><span>=</span><div><strong>${complete?fmt(total(calculated)):'—'}</strong><small>${escape(unit(selected.jobNumber))}</small></div>`;
    const max = Math.max(1,...Object.values(calculated).filter(v=>v!==null));
    byId('otmChart').innerHTML = periods.map(p => `<div title="${p}: ${fmt(calculated[p])}"><span style="height:${Math.max(2,(calculated[p]??0)/max*75)}px"></span><small>${p.slice(1)}</small></div>`).join('');
    byId('otmRateScope').textContent = engineer().name+' · '+context.year;
    if (!keepInputs) byId('otmRateCards').innerHTML = d.plans.map((p,i) => `<article><small>${Number(p.jobNumber)}</small><h3>${escape(description(p.jobNumber))}</h3><label for="otmRate${i}">Average output per shift · ${escape(unit(p.jobNumber))}</label><input id="otmRate${i}" type="number" min="0" step="any" data-otm-rate="${i}" value="${p.rate ?? ''}" placeholder="Enter rate"></article>`).join('');
    renderReview();
    message(d.dirty?'Unsaved changes':'Saved values loaded');
    const previous = model.plans(source, groups(), resolve).some(p=>p.enabled);
    byId('otmApply').textContent = tab==='review'?'Apply to V0':'Review forecast';
    byId('otmApply').disabled = busy || (tab==='review' && (!d.dirty || readyCount!==active.length || (!active.length&&!previous)));
  }
  function renderReview() {
    const d = draft(), old = model.plans(source, groups(), resolve);
    const proposed = model.apply(source, d.plans.filter(p=>!p.enabled||ready(p)), options());
    const rows = [];
    d.plans.forEach((p,i) => {
      const codes = new Set([...(p.enabled?[p.workGroup]:[]), ...(old[i].enabled?[old[i].workGroup]:[])]);
      codes.forEach(code => {
        const current = total(row(source,p.jobNumber,code)), next = total(row(proposed,p.jobNumber,code)), e = evidence(p.jobNumber,code);
        const applying = p.enabled && code===p.workGroup, pending = applying&&!ready(p), change = next-current;
        rows.push(`<tr><th scope="row"><strong>${Number(p.jobNumber)} · ${escape(description(p.jobNumber))}</strong><small>${escape(groupName(code))} · ${escape(code)}<br>${escape(unit(p.jobNumber))}</small></th><td class="otm-number">${pending?'—':fmt(next)}</td><td>${fmt(total(e.mst))}</td><td>${fmt(total(e.waif))}</td><td>${fmt(current)}</td><td>${pending?'—':(change>0?'+':'')+fmt(change)}</td><td>${pending?'Missing inputs':applying?'Apply calculation':'Restore previous sources'}</td></tr>`);
      });
    });
    byId('otmReviewRows').innerHTML = rows.join('') || '<tr><td colspan="7">Include a Standard Job and enter shifts and an output rate.</td></tr>';
  }
  async function apply() {
    if (busy || !draft().dirty) return;
    const active = draft().plans.filter(p=>p.enabled);
    if (!active.every(ready)) return message('Complete shifts, rates and Work Group Sets before applying.',true);
    importSerial++; byId('otmImportStatus').textContent = '';
    busy = true; dialog.inert = true; message('Saving V0…');
    try {
      const latest = await context.load();
      if (!(latest?.data instanceof Map)) throw new Error('Saved forecast unavailable. Inputs retained; retry when connected.');
      if (!window.ForecastModel.equal(model.scoped(source,groups(),resolve),model.scoped(latest.data,groups(),resolve))) throw new Error('This Engineer’s OTM jobs changed in another session. Export your draft, then reload saved values before applying.');
      const data = model.apply(latest.data,draft().plans,options());
      if (!await context.save(data,context.year)) throw new Error('Save was not confirmed. Your inputs are retained; retry or reload saved values.');
      source = data; drafts.delete(engineerId); importSerial++;
      context.onSaved(data,engineerId); render(); message('OTM forecasts saved to V0.');
      window.Toast?.success('OTM forecasts saved to V0.');
    } finally { busy = false; dialog.inert = false; byId('otmApply').disabled = !draft().dirty; }
  }
  async function reload() {
    if (busy || (hasDirty()&&!window.confirm('Discard all unsaved OTM inputs and reload saved forecasts?'))) return;
    busy=true; dialog.inert=true; importSerial++;
    try { const latest=await context.load(); if (!(latest?.data instanceof Map)) throw new Error('Forecast reload failed. Your inputs are retained.'); source=latest.data; drafts.clear(); render(); }
    finally { busy=false; dialog.inert=false; }
  }
  function close() {
    if (busy || (hasDirty()&&!window.confirm('Discard unsaved OTM inputs and return to Forecast Builder?'))) return;
    importSerial++; drafts.clear(); dialog.close(); byId('forecastPreviewOtm')?.focus();
  }
  async function importFile(file) {
    if (!file || busy) return;
    const serial=++importSerial, owner=engineerId;
    byId('otmImportStatus').textContent='Reading '+file.name+'…';
    try {
      const workbook=window.XLSX.read(await file.arrayBuffer(),{type:'array'});
      if (serial!==importSerial || owner!==engineerId || !dialog.open) return;
      const rows=window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{defval:''});
      if (!rows.length || ['sjn','period','shifts'].some(key=>!Object.hasOwn(rows[0],key))) throw new Error('Use a template with sjn, period and shifts columns.');
      if (rows.some(r=>(r.fy&&String(r.fy)!==context.year)||(r.engineer&&![engineerId,engineer().name].includes(String(r.engineer))))) throw new Error('The file identifies a different Engineer or FY.');
      const parsed=model.parseRows(rows);
      const next=structuredClone(draft().plans);
      const populated = new Set(parsed.filter(item=>item.shifts!==undefined).map(item=>item.jobNumber));
      let accepted = 0;
      parsed.forEach(item=>{
        const p=next.find(p=>p.jobNumber===item.jobNumber);
        // Unused jobs in the blank template must not become mandatory allocations.
        if (!p.enabled && !populated.has(item.jobNumber)) return;
        if(item.shifts===undefined)delete p.shifts[item.period];else p.shifts[item.period]=item.shifts;
        p.enabled=true; accepted++;
      });
      if (!accepted) throw new Error('No shift values found for an included job.');
      draft().plans=next; draft().dirty=true; render();
      byId('otmImportStatus').textContent=`${accepted} shift entries loaded for ${engineer().name} · ${context.year}. Review before applying.`;
    } catch(error) { if(serial===importSerial)byId('otmImportStatus').textContent=error.message+' No inputs changed.'; }
  }
  function download(name,text) {
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportCalculations() {
    const rows=[['fy','engineer','work_group','sjn','period','shifts','output_per_shift','unit','calculated_output','saved_v0','status']];
    draft().plans.filter(p=>p.enabled).forEach(p=>periods.forEach(period=>rows.push([context.year,engineer().name,p.workGroup,p.jobNumber,period,p.shifts[period]??'',p.rate??'',unit(p.jobNumber),values(p)[period]??'',row(source,p.jobNumber,p.workGroup)[period]??'',draft().dirty?'Draft':'Saved'])));
    if(rows.length===1)return message('Include a Standard Job before exporting.',true);
    const cell=value=>'"'+String(value).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
    download(`OTM-${context.year}-${engineerId.replace(/[^\w-]/g,'_')}.csv`,rows.map(r=>r.map(cell).join(',')).join('\r\n'));
  }
  window.OtmPlanner = Object.freeze({
    open: async config => {
      ensureDialog(); if(dialog.open)return;
      const loaded=await config.load(); if(!(loaded?.data instanceof Map))throw new Error('Forecast unavailable. Retry when connected.');
      if(!config.engineers.length)throw new Error('No Engineer Work Group Sets available.');
      context=config;source=loaded.data;engineerId=config.engineers.some(e=>e.id===config.engineerId)?config.engineerId:config.engineers[0].id;
      drafts.clear();selectedJob=0;tab='shifts';importSerial++;busy=false;
      byId('otmImportPanel').hidden=true;byId('otmFile').value='';byId('otmImportStatus').textContent='';
      render();dialog.showModal();byId('otmClose').focus();
    },
    hasDirtyChanges: () => Boolean(dialog?.open && hasDirty())
  });
})(window);
