// "Changes since the previous confirmed version" on Center Point's TPN sheet
// (decision, Praew 2026-09-16: compare with the previous confirmed —
// published, not withdrawn — revision of the same CP record).
//
// center-point/tpn-document.mjs owns the comparison, so NeoFeed's calculator
// review page and CP's desktop print show the same list. It compares what a
// prescriber orders, in the terms of calculator.jsx's own ORDER_DIFF_FIELDS
// (plus the dosing weight and each preparation), never amounts that only move
// because the weight moved: a bag volume or a delivered dose is not a change of
// order. CP's server decides which revision is "previous"; this file only
// checks the comparison and how renderTpn shows it.
const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(66)}${cond ? '' : '  ' + JSON.stringify(detail)}`);
  cond ? pass++ : fail++;
}
const { window } = new JSDOM('<!doctype html><html><body></body></html>');

(async () => {
  const { TPN_FIELDS, TPN_ORDER_CHANGES, tpnChanges, renderTpn } = await import(pathToFileURL(DIR + 'center-point/tpn-document.mjs').href);
  const values = Object.fromEntries(TPN_FIELDS.map(f => [f[0], '1']));
  Object.assign(values, { dexPct: '10', soluvit: '1.2', enVol: '7', enFreq: '8' });
  const base = { schema: 'neofeed-tpn-v2', templateVersion: 'cp-tpn-2', appVersion: '2026-test', constantsVersion: '2026-test',
    orderDate: '2026-09-15', effectiveFrom: '2026-09-15T01:00:00.000Z', effectiveTo: '2026-09-16T01:00:00.000Z',
    dosingWeightG: 1200, currentWeightG: 1200, usingBirthWeight: false, route: 'central', dol: 3, values,
    preparations: { ca: 'none', phosphate: 'none', iron: 'none', enteral: 'BM_20' }, criticalOverride: null };
  const next = (edit) => { const t = structuredClone(base); edit(t); return t; };
  const previous = (tpn, revision = 2) => ({ revision, publishedAt: '2026-09-15T02:00:00.000Z', tpn });

  console.log('');
  console.log('── what counts as a change of order ──');
  ok('every order field reads a real slot of the packet', TPN_ORDER_CHANGES.every(([, , read]) => typeof read(base) === 'string'),
    TPN_ORDER_CHANGES.filter(([, , read]) => typeof read(base) !== 'string').map(([label]) => label));
  ok('an identical order has no changes', tpnChanges(base, structuredClone(base)).length === 0);
  const dex = tpnChanges(base, next(t => { t.values.dexPct = '12.5'; }));
  ok('a changed dextrose is one change, with label, unit, from and to',
    dex.length === 1 && dex[0].label === 'Dextrose' && dex[0].unit === '%' && dex[0].from === '10' && dex[0].to === '12.5', dex);
  ok('amounts that follow the weight are not changes of order',
    tpnChanges(base, next(t => { Object.assign(t.values, { naClBag: '9', dexBag: '9', aaMl: '9', energy: '9', soluvit: '1.3' }); t.currentWeightG = 1250; t.dol = 4; t.orderDate = '2026-09-16'; })).length === 0);
  const weight = tpnChanges(base, next(t => { t.dosingWeightG = 1250; }));
  ok('the dosing weight is a change', weight.length === 1 && weight[0].label === 'Dosing weight' && weight[0].to === '1250', weight);
  ok('the route is a change', tpnChanges(base, next(t => { t.route = 'peripheral'; }))[0]?.to === 'peripheral');
  const soluvit = tpnChanges(base, next(t => { t.values.soluvit = '—'; }));
  ok('stopping Soluvit reads as yes → no', soluvit.length === 1 && soluvit[0].from === 'yes' && soluvit[0].to === 'no', soluvit);
  const feed = tpnChanges(base, next(t => { t.preparations.enteral = 'PRENAN_22'; }));
  ok('a changed feed shows the preparation names', feed.length === 1 && /Breast Milk/.test(feed[0].from) && /Pre Nan/.test(feed[0].to), feed);

  console.log('');
  console.log('── how renderTpn shows it ──');
  const render = (...args) => { const el = window.document.createElement('div'); renderTpn(el, ...args); return el; };
  const changed = next(t => { t.values.dexPct = '12.5'; t.values.kClKg = '2'; });
  ok('no previous argument: no changes section (callers that do not compare)', !render(changed).querySelector('.tpn-changes'));
  ok('null: the first confirmed version says so', /ฉบับยืนยันแรก/.test(render(changed, null).querySelector('.tpn-changes')?.textContent || ''));
  ok('a previous version without a TPN order says so', /ไม่มีใบสั่ง TPN/.test(render(changed, previous(null)).querySelector('.tpn-changes')?.textContent || ''));
  ok('an unchanged order says "no changes" and names the revision',
    /ไม่มีการเปลี่ยนแปลง/.test(render(base, previous(base)).querySelector('.tpn-changes')?.textContent || '')
    && /ฉบับ 2/.test(render(base, previous(base)).querySelector('.tpn-changes')?.textContent || ''));
  const sheet = render(changed, previous(base, 3));
  const items = [...sheet.querySelectorAll('.tpn-changes li')].map(li => li.textContent);
  ok('each change is listed as label: from → to unit', items.includes('Dextrose: 10 → 12.5 %') && items.includes('KCl: 1 → 2 mEq/kg/day'), items);
  ok('…under a heading naming the previous revision', /เปลี่ยนแปลงจากฉบับยืนยันก่อนหน้า \(ฉบับ 3\)/.test(sheet.querySelector('.tpn-changes')?.textContent || ''));
  ok('the value rows are untouched (still one per slot)', sheet.querySelectorAll('tr[data-field]').length === TPN_FIELDS.length);
  for (const [what, bad] of [
    ['revision 0', { ...previous(base), revision: 0 }],
    ['a missing publishedAt', { revision: 2, tpn: base }],
    ['an extra key', { ...previous(base), name: 'PRIVATE' }],
    ['a malformed previous TPN', previous({ ...base, values: {} })],
  ]) {
    let threw = false;
    try { render(changed, bad); } catch { threw = true; }
    ok(`renderTpn refuses a previous version with ${what}`, threw);
  }

  console.log('');
  console.log(`${fail === 0 ? 'ORDER CHANGES: ALL PASS' : `ORDER CHANGES: ${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
