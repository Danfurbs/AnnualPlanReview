(function (root) {
  'use strict';
  function totals(forecast, workDone, cutoff, available) {
    const annual = Object.values(forecast || {}).reduce((sum, n) => sum + Number(n || 0), 0);
    let completed = 0, future = 0;
    for (let i = 1; i <= 13; i++) {
      if (i <= cutoff) completed += Number(workDone?.['P' + i] || 0);
      else future += Number(forecast?.['P' + i] || 0);
    }
    return { annual, completed: available ? completed : null, future, projected: available ? completed + future : null };
  }
  function reviewQueue(rows) {
    return rows.filter(row => !row.group && !row.reviewed).sort((a, b) =>
      Math.abs(b.variance || 0) - Math.abs(a.variance || 0) || a.job.localeCompare(b.job));
  }
  if (typeof module !== 'undefined') module.exports = { totals, reviewQueue };
  if (!root?.document) return;
  const $ = id => document.getElementById(id);
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = n => n === null ? 'Unavailable' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  let queue = [], activeJob = null, historySerial = 0, historyRecords = [], historyNext = null, historyTarget = null;
  function context() {
    const c = root.APRReview.context(), node = $('aprReportingDetails');
    if (!node) return;
    root.APRDashboard?.update(c);
    node.innerHTML = `<div><strong>Your Work Done</strong><span>${esc(c.file || 'No file uploaded')} · private to this session</span></div>
      <div><strong>Shared data</strong><span>${c.error ? 'Unavailable — retry loading' : c.loadedAt ? 'Loaded ' + esc(new Date(c.loadedAt).toLocaleString()) : 'Not loaded'}</span></div>`;
    $('aprFilterDetails').textContent = c.filters.join(' · ');
    $('aprRefreshShared').disabled = Boolean(c.refreshing);
    $('aprRefreshShared').textContent = c.refreshing ? 'Refreshing…' : 'Refresh shared data';
    $('aprStartReview').disabled = Boolean(c.error || c.refreshing) || !queue.length;
  }
  function setQueue(rows) {
    queue = reviewQueue(rows);
    root.APRDashboard?.counts(rows);
    $('aprReviewQueueStatus').textContent = `${queue.length} unreviewed jobs in the current filters`;
    const c = root.APRReview.context();
    $('aprStartReview').disabled = Boolean(c.error || c.refreshing) || !queue.length;
  }
  function canLeave() {
    if (root.APRReview.hasDrafts()) { root.Toast?.error('Save or discard open edits before moving between jobs or refreshing.'); return false; }
    return true;
  }
  function openJob(job) {
    const c = root.APRReview.context();
    if (!job || c.error || c.refreshing || !canLeave()) return;
    root.APRReview.open(job);
  }
  function navigation(job) {
    activeJob = job;
    const index = queue.findIndex(row => row.job === job.jn);
    $('aprReviewNavigation').hidden = job.isGroupRollup;
    $('aprQueuePosition').textContent = index >= 0 ? `Unreviewed job ${index + 1} of ${queue.length} · current filters` : 'Outside the current unreviewed queue';
    $('aprPreviousJob').disabled = index <= 0;
    $('aprNextJob').disabled = index < 0 || index >= queue.length - 1;
    $('aprReviewNext').disabled = Boolean(job.isGroupRollup) || root.APRReview.reviewed(job.jn);
  }
  function explain(job, rows, unit, cutoff) {
    const detail = $('aprRollupExplanation');
    detail.hidden = !job.isGroupRollup;
    if (!job.isGroupRollup) return;
    const incompatible = new Set(rows.map(row => row.unit)).size > 1 || rows.some(row => !row.unit || row.unit === 'Unit not specified');
    const total = rows.reduce((sum, row) => {
      for (const key of ['annual', 'completed', 'future', 'projected']) sum[key] = sum[key] === null || row[key] === null ? null : sum[key] + row[key];
      return sum;
    }, { annual: 0, completed: 0, future: 0, projected: 0 });
    const tr = row => `<tr><td>${esc(row.job)}<br><small>${esc(row.description)}</small></td><td>${esc(row.unit)}</td><td>${number(row.annual)}</td><td>${number(row.completed)}</td><td>${number(row.future)}</td><td>${number(row.projected)}</td></tr>`;
    $('aprRollupRows').innerHTML = `<p class="helper-text">Effective Reforecast · current dashboard work-group and engineer filters · ${rows.length} distinct members · ${cutoff === null ? 'reporting period not selected' : 'completed through P' + cutoff}. Work Done uses your uploaded file and shared corrections.</p>
      <div class="apr-table-scroll"><table><thead><tr><th>Standard job</th><th>Unit</th><th>Annual forecast</th><th>Work Done</th><th>Future forecast</th><th>Projected year</th></tr></thead><tbody>${rows.map(tr).join('')}</tbody>${incompatible ? '' : `<tfoot>${tr({ ...total, job: 'Group total', description: 'Work Done + future forecast = projected year', unit })}</tfoot>`}</table></div>
      ${rows.map(row => `<details><summary>${esc(row.job)} · work group contributions</summary><div class="apr-table-scroll"><table><thead><tr><th>Work group</th><th>Unit</th><th>Annual forecast</th><th>Work Done</th><th>Future forecast</th><th>Projected year</th></tr></thead><tbody>${(row.children || []).map(tr).join('')}</tbody></table></div></details>`).join('')}
      ${incompatible ? '<p role="alert">Member units do not match. A combined volume is not valid; review group membership.</p>' : ''}`;
  }
  function formatHistoryValue(value, event) {
    if (value === null) return event.kind === 'correction' ? 'Uploaded original' : event.plan_version === 'v1' ? 'Inherit V0' : 'Not set';
    return typeof value === 'number' ? number(value) : value || '(empty)';
  }
  function renderHistory() {
    if (!historyTarget) return;
    const filter = historyTarget.querySelector('select').value;
    const records = historyRecords.filter(row => filter === 'all' || row.kind === filter);
    const body = historyTarget.querySelector('[data-history-body]');
    body.innerHTML = records.length ? records.map(event => {
      const changes = event.kind === 'correction' ? [event.details] : event.details.changes;
      return `<article class="apr-history-event"><strong>${esc(event.kind === 'correction' ? event.details.orderId + ' · correction (shared across uploads)' : event.fiscal_year + ' · ' + event.plan_version.toUpperCase())}</strong>
        <small>${esc(new Date(event.saved_at).toLocaleString())} · server-confirmed</small>${event.details.reason ? `<p>${esc(event.details.reason)}</p>` : ''}
        <details><summary>${changes.length} changed ${changes.length === 1 ? 'value' : 'values'}</summary>
        <ul>${changes.map(change => `<li>${esc([change.group, change.period].filter(Boolean).join(' · '))} ${esc(formatHistoryValue(change.from, event))} → ${esc(formatHistoryValue(change.to, event))}</li>`).join('')}</ul></details></article>`;
    }).join('') : '<p>No recorded changes match this selection.</p>';
    historyTarget.querySelector('[data-history-more]').hidden = !historyNext;
  }
  async function loadHistory(target, year, job, append = false) {
    if (target.dataset.historyLoading === 'true' || (append && !historyNext)) return;
    const serial = ++historySerial;
    historyTarget = target;
    if (!append) { historyRecords = []; historyNext = null; }
    const status = target.querySelector('[data-history-status]');
    const button = target.querySelector('[data-history-load]');
    const more = target.querySelector('[data-history-more]');
    target.dataset.historyLoading = 'true';
    target.setAttribute('aria-busy', 'true');
    button.disabled = true;
    more.disabled = true;
    if (!append) renderHistory();
    status.textContent = 'Loading saved history…';
    try {
      const page = await root.loadChangeHistoryFromApi(year, job, append ? historyNext : null);
      if (serial !== historySerial) return;
      historyRecords = append ? [...historyRecords, ...page.data] : page.data;
      historyNext = page.next;
      renderHistory();
      status.textContent = 'History starts from when change recording was enabled.';
    } catch (error) {
      if (serial !== historySerial) return;
      status.textContent = error.message;
    } finally {
      button.disabled = false;
      more.disabled = false;
      if (serial === historySerial) {
        target.dataset.historyLoading = 'false';
        target.setAttribute('aria-busy', 'false');
      }
    }
  }
  function bindHistory(target, year, job) {
    historySerial++;
    historyTarget = target;
    historyRecords = []; historyNext = null;
    target.dataset.historyLoading = 'false';
    target.setAttribute('aria-busy', 'false');
    target.innerHTML = `<summary>Saved change history · ${esc(job)}</summary>
      <div class="apr-inline-actions"><label>Show <select aria-label="History change type"><option value="all">All changes</option><option value="forecast">Forecast</option><option value="correction">Corrections</option></select></label><button type="button" class="group-action-button" data-history-load>Load history</button></div>
      <p class="helper-text" role="status" data-history-status></p><div data-history-body></div><button type="button" class="group-action-button" data-history-more hidden>Load older changes</button>`;
    target.querySelector('[data-history-load]').onclick = () => loadHistory(target, year, job);
    target.querySelector('[data-history-more]').onclick = () => loadHistory(target, year, job, true);
    target.querySelector('select').onchange = () => { if (historyTarget === target) renderHistory(); };
  }
  function breakdown(job, rows, unit, cutoff) {
    navigation(job);
    explain(job, rows, unit, cutoff);
    const detail = $('aprJobHistory');
    detail.hidden = job.isGroupRollup;
    if (!job.isGroupRollup) bindHistory(detail, root.APRReview.context().year, job.jn);
  }
  async function diagnostics() {
    const button = $('aprRunDiagnostics'), output = $('aprDiagnosticsResults');
    button.disabled = true; output.textContent = 'Checking…';
    const results = [];
    try {
      const health = await root.loadAPRDatabaseHealth();
      results.push(['Database connection', health.success ? 'Passed' : 'Failed']);
    } catch { results.push(['Database connection', 'Failed']); }
    const c = root.APRReview.context();
    results.push(['Shared reporting data', c.error ? 'Failed — ' + c.error : c.loadedAt ? 'Loaded successfully' : 'Not loaded']);
    const merged = root.mergeForecastWorkGroups({ Test: { P1: 4, P2: 6 } }, { Test: { P1: 0 } });
    results.push(['Sparse V1 inheritance and explicit zero', merged.Test.P1 === 0 && merged.Test.P2 === 6 ? 'Passed' : 'Failed']);
    const scoped = totals({ P1: 10, P2: 20 }, { P1: 7, P2: 999 }, 1, true);
    results.push(['Reporting cutoff excludes later Work Done', scoped.projected === 27 ? 'Passed' : 'Failed']);
    results.push(['Unsaved edits', root.APRReview.hasDrafts() ? 'Present — save or discard before refresh' : 'None']);
    results.push(['Browser and release regression suite', 'Run by CI on each push and pull request; not executed in this browser']);
    output.innerHTML = `<ul>${results.map(([label, value]) => `<li><strong>${esc(label)}</strong>: ${esc(value)}</li>`).join('')}</ul>`;
    button.disabled = false;
  }
  root.APRFeatures = { context, setQueue, breakdown, totals, bindHistory };
  document.addEventListener('DOMContentLoaded', () => {
    $('aprStartReview').onclick = () => openJob(queue[0]?.job);
    $('aprPreviousJob').onclick = () => openJob(queue[queue.findIndex(row => row.job === activeJob?.jn) - 1]?.job);
    $('aprNextJob').onclick = () => openJob(queue[queue.findIndex(row => row.job === activeJob?.jn) + 1]?.job);
    $('aprReviewNext').onclick = async () => {
      if (!activeJob || !canLeave()) return;
      const current = activeJob.jn, index = queue.findIndex(row => row.job === current);
      const next = queue[index + 1]?.job || queue.find(row => row.job !== current)?.job;
      const button = $('aprReviewNext'); button.disabled = true;
      try {
        if (!await root.APRReview.markReviewed(current)) throw new Error('Review was not saved. Please retry.');
        root.APRReview.render();
        if (next) openJob(next); else root.APRReview.open(current);
      } catch (error) { root.Toast?.error(error.message); button.disabled = false; }
    };
    $('aprRefreshShared').onclick = async () => {
      if (!canLeave()) return;
      const status = $('aprRefreshStatus');
      status.textContent = 'Loading shared forecasts and corrections…';
      try {
        await root.APRReview.refresh();
        status.textContent = 'Shared data refreshed.';
      } catch (error) { status.textContent = error.message; }
      context();
    };
    $('aprShowDiagnostics').onchange = event => { $('aprDeveloperDiagnostics').hidden = !event.target.checked; };
    $('aprRunDiagnostics').onclick = diagnostics;
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-audit-job]');
      if (!button) return;
      const target = $('aprBuilderHistory');
      target.hidden = false; target.open = true;
      bindHistory(target, $('forecastPreviewYear').value, button.dataset.auditJob);
      loadHistory(target, $('forecastPreviewYear').value, button.dataset.auditJob);
      target.scrollIntoView({ block: 'nearest' });
    });
  });
})(typeof window === 'undefined' ? null : window);
