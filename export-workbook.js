/* Spreadsheet presentation shared by downloads and the on-screen preview. */
(function (root) {
  'use strict';
  const colours = { PWAY: '00B050', 'Off Track': '92D050', 'S&T': '4BACC6', 'E&P - CS': '8064A2', 'E&P - D': 'B1A0C7' };
  const periods = Array.from({ length: 13 }, (_, i) => 'P' + (i + 1));
  function ordered(rows, layout) {
    const sequence = new Map(layout.map(([job, discipline, mnt], index) => [job, { discipline, mnt, index }]));
    return rows.map(row => ({ ...row, Discipline: sequence.get(row['Standard Job No'])?.discipline || row.Discipline || 'Other', 'MNT Code': row['MNT Code'] || sequence.get(row['Standard Job No'])?.mnt || '' }))
      .sort((a, b) => (sequence.get(a['Standard Job No'])?.index ?? Infinity) - (sequence.get(b['Standard Job No'])?.index ?? Infinity) || a.Discipline.localeCompare(b.Discipline) || a['Standard Job No'].localeCompare(b['Standard Job No']));
  }
  const style = (fill, bold = false, white = false) => ({ font: { name: 'Arial', sz: 10, bold, color: { rgb: white ? 'FFFFFF' : '000000' } }, fill: { patternType: 'solid', fgColor: { rgb: fill } }, alignment: { vertical: 'center', wrapText: true } });
  function planSheet(XLSX, rows, context, layout) {
    const orderedRows = ordered(rows, layout);
    const data = [
      ['', context.title + ' — ' + context.year], [],
      ['', 'Report: ' + context.title + ' | Financial year: ' + context.year],
      ['', 'Scope: ' + context.scope],
      ['', context.rf ? 'RF stage: ' + context.stage + ' | Work Done cutoff: P' + context.cutoff : 'Plan version: ' + context.title + (context.filterContext ? ' | ' + context.filterContext : '')],
      ['', 'Job filters: ' + context.filters],
      ['', 'Basis: ' + context.basis],
      ['', 'Generated: ' + context.capturedAt + (context.rf ? ' | Work Done file: ' + context.file + ' | Uploaded: ' + (context.uploadedAt || 'Not recorded') : '')],
      ['', 'All standard jobs included; blank plan cells mean no forecast in this scope. Totals stay separate by unit. Comments ' + (context.rf ? 'are for the selected RF stage.' : 'include all RF stages in the selected financial year.')], [],
      ['', 'Activity Information', '', '', '', '', '', 'Direct Volumes'],
      ['', 'Discipline', 'MNT Code', 'Standard Job No.', 'Standard Job Description', 'Unit of Measure', '', ...periods, context.year + ' Total', context.year + ' Comments']
    ];
    const types = new Map();
    let group = [];
    const finish = () => {
      if (!group.length) return;
      const discipline = group[0].Discipline;
      for (const unit of new Set(group.map(row => row.Unit))) {
        const values = group.filter(row => row.Unit === unit);
        const sum = key => values.some(row => row[key] !== null) ? values.reduce((total, row) => total + (row[key] ?? 0), 0) : null;
        types.set(data.length, { total: true, discipline });
        data.push(['', discipline, '', '', 'Total — ' + unit, unit, '', ...periods.map(sum), sum('Full year total'), '']);
      }
      data.push([]);
      group = [];
    };
    orderedRows.forEach(row => {
      if (group.length && group[0].Discipline !== row.Discipline) finish();
      types.set(data.length, { discipline: row.Discipline });
      data.push(['', row.Discipline, row['MNT Code'], row['Standard Job No'], row.Description, row.Unit, '', ...periods.map(p => row[p]), row['Full year total'], row.Comments]);
      group.push(row);
    });
    finish();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!merges'] = [0, 2, 3, 4, 5, 6, 7, 8].map(r => ({ s: { r, c: 1 }, e: { r, c: 21 } })).concat([{ s: { r: 10, c: 1 }, e: { r: 10, c: 5 } }, { s: { r: 10, c: 7 }, e: { r: 10, c: 21 } }]);
    ws['!cols'] = [3, 15, 14, 19, 50, 25, 2, ...periods.map(() => 12), 16, 60].map(wch => ({ wch }));
    ws['!rows'] = data.map((row, r) => ({ hpt: r === 0 ? 28 : r === 11 ? 42 : r < 9 ? (r === 5 || r === 7 ? 34 : 26) : types.has(r) ? Math.max(24, Math.min(409, 15 * Math.max(Math.ceil(String(row[4] || '').length / 45), String(row[21] || '').split('\n').reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / 55)), 0)))) : 12 }));
    for (let r = 0; r < data.length; r++) {
      const type = types.get(r);
      for (let c = 0; c <= 21; c++) {
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = ws[address] ||= { t: 's', v: '' };
        cell.s = c === 0 || c === 6 ? style('FFFFFF') : r === 0 ? style('E26B0A', true) : r === 10 ? style('95B3D7', true) : r === 11 ? style(c >= 7 && c <= 19 || c === 21 ? 'FFFF00' : '95B3D7', true) : type?.total ? style(colours[type.discipline] || '95B3D7', true) : type ? style(c === 1 ? colours[type.discipline] || 'FFFFFF' : c === 20 ? 'D9D9D9' : c >= 2 && c <= 5 ? 'FFFF99' : 'FFFFFF') : style('FFFFFF');
        if (cell.t === 'n') cell.z = '#,##0.00;[Red]-#,##0.00;0';
      }
    }
    return ws;
  }
  function tableSheet(XLSX, rows) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Status: 'No matching records in this scope' }]);
    const headings = Object.keys(rows[0] || { Status: '' });
    ws['!cols'] = headings.map(h => ({ wch: /description|comment|reason|errors|action/i.test(h) ? 55 : Math.max(16, Math.min(30, h.length + 2)) }));
    if (rows.length) ws['!autofilter'] = { ref: ws['!ref'] };
    Object.entries(ws).forEach(([address, cell]) => {
      if (address.startsWith('!')) return;
      cell.s = style(address.match(/\d+$/)[0] === '1' ? '95B3D7' : 'FFFFFF', address.match(/\d+$/)[0] === '1');
      if (cell.t === 'n') cell.z = '#,##0.00';
    });
    return ws;
  }
  const api = { ordered, planSheet, tableSheet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.APRExportWorkbook = api;
})(typeof window === 'undefined' ? null : window);
