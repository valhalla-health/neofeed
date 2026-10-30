// verify-health-report-1030.cjs — sheetHealthReport names the measurement
// cells to fix, by row and column, and counts the ones that are not JSON.
//
// On 2026-10-29, before @66, the report said measurementArraysFailingValidation:
// 1 and nothing more: no row, no column, so Pp had to paste a one-off locator
// into the editor to find the infant whose ward edit would be refused. It also
// passed a cell that is not JSON at all (curly quotes from a hand edit):
// _parseJson falls back quietly, the app reads that cell as empty, and the next
// ward edit can save the empty reading over the history.
//
//   §1  each failing cell is listed as { row, column, field, problem, record }:
//       the rule it breaks without the stored value, and whether the record is
//       on ward devices; a row with two bad cells is listed twice, counted once;
//       a blank M is reported at D, the birth weight the app falls back to
//   §2  a cell that is not JSON is counted and listed, not counted as failing
//   §3  nothing in the report names an infant or repeats a stored value
//   §4  a clean sheet gives an empty list and zero counts
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
//   git show 8644e78:gas-backend.gs > old.gs
//   NEOFEED_GAS_SRC=old.gs node test/verify-health-report-1030.cjs
// fails §1, §2 and §4: that report has no list and no not-JSON count.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const { boot, recorder, wardToday, addDays, bkkMidnight } = require('./gas-vm-sandbox.cjs');
const T = recorder('HEALTH REPORT 2026-10-30 · CELLS TO FIX');
const TODAY = wardToday();

function seeded() {
  const g = boot();
  const pat = g.sheet('Patient_Registry').data;
  const add = (sid, extra) => { pat.push(g.patRow(sid, extra)); return pat.length; };
  const rows = {
    ok: add('OK-1200'),
    weight: add('WT-1200', { 12: JSON.stringify([{ dol: 1, w: 1200 }, { dol: 4, w: 12345 }]) }),
    length: add('LN-1200', { 9: 'Discharged', 16: bkkMidnight(addDays(TODAY, -3)),
      13: JSON.stringify([{ dol: 'x3', v: 40 }]) }),
    bw: add('BW-1200', { 3: 99999, 12: '', 9: 'Transferred', 16: bkkMidnight(addDays(TODAY, -90)) }),
    hc: add('HC-1200', { 14: '{}' }),
    bed: add('BD-1200', { 15: JSON.stringify([{ 'NICU 7 ward': { a: 1 } }]) }),
    two: add('TW-1200', { 12: JSON.stringify([{ dol: 1, w: 50 }]), 14: JSON.stringify([{ dol: 2, v: 99 }]) }),
    curly: add('CQ-1200', { 13: '[{“dol”:3,“v”:41}]' }),
  };
  return { g, rows, out: g.sb.sheetHealthReport() };
}

T.section('§1 Each failing cell is named by row and column, with the rule it breaks', () => {
  const { rows, out } = seeded();
  const cells = out.registry.measurementCellsToFix;
  T.ok('the report carries a list of cells to fix', Array.isArray(cells), cells);
  const failing = (cells || []).filter(c => !/not valid JSON/.test(c.problem));
  T.eq('every failing cell, in sheet order', failing, [
    { row: rows.weight, column: 'M', field: 'weights', problem: 'weights[1].w (g) is outside 200–8000', record: 'on the unit' },
    { row: rows.length, column: 'N', field: 'lengths', problem: 'lengths[0].dol must be a whole number 0–400',
      record: 'archived, still on ward devices' },
    { row: rows.bw, column: 'D', field: 'bw (M is blank)', problem: 'weights[0].w (g) is outside 200–8000',
      record: 'archived, not on ward devices' },
    { row: rows.hc, column: 'O', field: 'hcs', problem: 'hcs must be an array', record: 'on the unit' },
    { row: rows.bed, column: 'P', field: 'bedHistory', problem: 'bedHistory[0] has a value that is not text', record: 'on the unit' },
    { row: rows.two, column: 'M', field: 'weights', problem: 'weights[0].w (g) is outside 200–8000', record: 'on the unit' },
    { row: rows.two, column: 'O', field: 'hcs', problem: 'hcs[0].v (cm) is outside 15–50', record: 'on the unit' },
  ]);
  T.eq('the row count is unchanged: a row with two bad cells counts once',
    out.registry.measurementArraysFailingValidation, 6);
  T.ok('the clean row is not listed', !(cells || []).some(c => c.row === rows.ok), cells);
});

T.section('§2 A cell that is not JSON is counted and listed, not counted as failing', () => {
  const { rows, out } = seeded();
  T.eq('measurementCellsNotJson', out.registry.measurementCellsNotJson, 1);
  T.eq('…listed at its row and column',
    (out.registry.measurementCellsToFix || []).filter(c => /not valid JSON/.test(c.problem)),
    [{ row: rows.curly, column: 'N', field: 'lengths', problem: 'not valid JSON, the app reads it as empty', record: 'on the unit' }]);
});

T.section('§3 Nothing in the report names an infant or repeats a stored value', () => {
  const { out } = seeded();
  const text = JSON.stringify(out);
  const ids = ['-1200', 'ทารก'];
  T.eq('no sessionId or name anywhere in the report', ids.filter(f => text.includes(f)), []);
  const reg = JSON.stringify(out.registry);
  const values = ['12345', '99999', 'x3', 'NICU 7', '“', '41'];
  T.eq('no stored value or bedHistory key in the registry part', values.filter(f => reg.includes(f)), []);
});

T.section('§4 A clean sheet gives an empty list and zero counts', () => {
  const g = boot();
  const pat = g.sheet('Patient_Registry').data;
  pat.push(g.patRow('OK-1200'), g.patRow('OK-1300', { 13: '', 14: '', 15: '' }));
  const r = g.sb.sheetHealthReport().registry;
  T.eq('measurementCellsToFix', r.measurementCellsToFix, []);
  T.eq('measurementArraysFailingValidation', r.measurementArraysFailingValidation, 0);
  T.eq('measurementCellsNotJson', r.measurementCellsNotJson, 0);
});

T.done();
