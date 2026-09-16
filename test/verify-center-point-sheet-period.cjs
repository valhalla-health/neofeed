// The plan period on Center Point's TPN review and print sheet (CP sprint walk-through,
// 2026-09-16).
//
// The packet stores effectiveFrom/effectiveTo as UTC instants, and renderTpn printed them
// as they are: "Effective 2026-09-15T18:35:00.000Z → …" on an order whose header says
// TPN 2026-09-16. The prescriber typed the plan in Thai time, so a reader saw the day
// before. The sheet now prints Thai time (UTC+7; Thailand keeps no daylight saving), to
// the minute that CP's form takes, and says so. The packet itself is unchanged.
//
// Renders the real center-point/tpn-document.mjs in jsdom.
const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
function eq(name, got, want) {
  const yes = Object.is(got, want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${name.padEnd(66)}${yes ? '' : `  got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}

const { window } = new JSDOM('<!doctype html><html><body></body></html>');

(async () => {
  const { TPN_FIELDS, TPN_SCHEMA, validateTpn, renderTpn } = await import(pathToFileURL(DIR + 'center-point/tpn-document.mjs').href);
  const packet = (effectiveFrom, effectiveTo) => ({
    schema: TPN_SCHEMA, appVersion: '2026-test', constantsVersion: '2026-test', templateVersion: 'cp-tpn-2',
    orderDate: '2026-09-16', effectiveFrom, effectiveTo, dosingWeightG: 1200, currentWeightG: 1200,
    usingBirthWeight: false, route: 'central', dol: 3,
    values: Object.fromEntries(TPN_FIELDS.map(([id]) => [id, '1'])),
    preparations: { ca: 'none', phosphate: 'none', iron: 'none', enteral: 'BM_20' }, criticalOverride: null,
  });
  const period = (from, to) => {
    const sheet = window.document.createElement('div');
    renderTpn(sheet, packet(from, to));
    return [...sheet.querySelectorAll('p')].find(p => p.textContent.startsWith('Effective'))?.textContent;
  };

  console.log('\n── the plan period prints in Thai time ──');
  eq('the walk-through order: 01:35 Thai time on 16 Sep, a day long',
    period('2026-09-15T18:35:00.000Z', '2026-09-16T18:35:00.000Z'), 'Effective 2026-09-16 01:35 → 2026-09-17 01:35 (เวลาไทย)');
  eq('the minute before and at Thai midnight',
    period('2026-09-15T16:59:00.000Z', '2026-09-15T17:00:00.000Z'), 'Effective 2026-09-15 23:59 → 2026-09-16 00:00 (เวลาไทย)');
  eq('across the new year in Thai time',
    period('2026-12-31T16:30:00.000Z', '2026-12-31T17:00:00.000Z'), 'Effective 2026-12-31 23:30 → 2027-01-01 00:00 (เวลาไทย)');

  console.log('\n── the packet keeps its UTC instants ──');
  const stored = packet('2026-09-15T18:35:00.000Z', '2026-09-16T18:35:00.000Z');
  renderTpn(window.document.createElement('div'), stored);
  eq('renderTpn leaves effectiveFrom as stored', validateTpn(stored).effectiveFrom, '2026-09-15T18:35:00.000Z');

  console.log(`\n${fail === 0 ? 'CP SHEET PERIOD: ALL PASS' : `CP SHEET PERIOD: ${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
