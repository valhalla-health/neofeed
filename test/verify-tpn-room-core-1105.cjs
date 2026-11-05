// verify-tpn-room-core-1105.cjs — the TPN-room page's rules, in Node, against the real
// stickerFigures and the real pharmacyOrders (openspec/changes/tpn-room-stickers, PR B).
//
//   §1 dates, ward label, twin label, AN
//   §2 every "cannot print" reason in the spec, one at a time, and a clean order prints
//   §3 changed, deleted and cancelled after printing; the re-read before a print
//   §4 stickerModel copies printJson strings and works out nothing
//   §5 a reply from the real gas-backend.gs goes through the same rules
//   §6 the page ships no dose code, and its versions match data.js
//
// Synthetic infants only. No npm dependency.
const fs = require('fs');
const path = require('path');
const Core = require('../tpn-room-core.js');
const FX = require('./tpn-room-fixture.cjs');
const SBX = require('./gas-vm-sandbox.cjs');

const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${yes ? '' : `  got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
const ok = (name, cond) => eq(name, !!cond, true);
const section = (t) => console.log(`\n── ${t} ──`);

const data = FX.loadData(ROOT);
const DATE = '2026-11-16';
const VERS = { constantsVersion: data.CONSTANTS_VERSION, stickerSchema: data.STICKER_SCHEMA_VERSION };
const FIXED = { heading: 'H', storage: 'S', extension: 'E' };
const pj = (extra) => FX.printJson(data, DATE, extra);
const order = (over) => ({
  sessionId: 'SY-1', entryId: '11111111-1111-4111-8111-111111111111', bed: 'NICU 3', bw: 900, twinSuffix: '', multiplesCount: 0,
  dol: 5, status: 'submitted', revision: 1, prescriber: 'Dr Synthetic', savedAt: '', submittedAt: '', printJson: pj(), ...over,
});
const MAP = { name: 'ทารกสังเคราะห์', an: '12345/69' };
const ctx = (over) => ({ date: DATE, ...VERS, nameFileOpen: true, mapping: MAP, fixed: FIXED, ...over });

section('§1 dates, ward, twins, AN');
{
  eq('ward today is UTC+7: 18:00 UTC is the next ward day', Core.wardToday(Date.parse('2026-11-15T18:00:00Z')), DATE);
  eq('window is today −7 to +1', Core.dateWindow(Date.parse('2026-11-16T03:00:00Z')), { today: DATE, min: '2026-11-09', max: '2026-11-17' });
  eq('Buddhist era', Core.buddhistDate(DATE), '16/11/2569');
  eq('a date that does not exist prints nothing', Core.buddhistDate('2026-02-30'), '');
  ok('isRealDate refuses a typed junk date', !Core.isRealDate('2026-13-01'));
  eq('NICU prints 9B2(NICU)', Core.wardLabel('NICU 3'), '9B2(NICU)');
  eq('iso 2-1 prints 9B2(NICU)', Core.wardLabel('iso 2-1'), '9B2(NICU)');
  eq('SCN prints 9B2(SCN)', Core.wardLabel('SCN 4'), '9B2(SCN)');
  eq('a blank bed has no ward', Core.wardLabel(''), '');
  eq('a free-text bed has no ward', Core.wardLabel('หน้าห้อง'), '');
  eq('Twin A of 2', Core.twinLabel('A', 2), 'Twin A of 2');
  eq('Triplet C of 3', Core.twinLabel('C', 3), 'Triplet C of 3');
  eq('Quadruplet D of 4', Core.twinLabel('D', 4), 'Quadruplet D of 4');
  eq('no set size, as the registry does', Core.twinLabel('A', 0), 'Twin A');
  eq('no letter, no label', Core.twinLabel('', 2), '');
  eq('AN nnnnn/yy passes', Core.anProblem('12345/69'), '');
  ok('a short AN is refused', Core.anProblem('1234/69'));
  ok('text in an AN is refused', Core.anProblem('12345/6a'));
  eq('an AN on another ID is named', Core.anUsedBy({ 'SY-2': { an: '12345/69' } }, '12345/69', 'SY-1'), 'SY-2');
  eq('the same ID keeping its AN is fine', Core.anUsedBy({ 'SY-1': { an: '12345/69' } }, '12345/69', 'SY-1'), '');
}

section('§2 what may print');
{
  eq('a submitted, mapped order with figures prints', Core.printReasons(order(), ctx()), []);
  const has = (o, c, re) => Core.printReasons(o, c).some((r) => re.test(r));
  ok('a draft does not', has(order({ status: 'draft', printJson: null }), ctx(), /ฉบับร่าง/));
  ok('no printJson does not', has(order({ printJson: null }), ctx(), /Submit อีกครั้ง/));
  ok('unmapped does not', has(order(), ctx({ mapping: null }), /ชื่อกับ AN/));
  ok('a mapping with no AN does not', has(order(), ctx({ mapping: { name: 'x', an: '' } }), /ชื่อกับ AN/));
  ok('a closed name file does not', has(order(), ctx({ nameFileOpen: false }), /ไฟล์ชื่อ/));
  ok('a blank bed does not', has(order({ bed: '' }), ctx(), /เตียง/));
  ok('a free-text bed does not', has(order({ bed: 'หน้าห้อง' }), ctx(), /เตียง/));
  ok('an older constants version does not', has(order({ printJson: { ...pj(), constantsVersion: '2000-01-01.1' } }), ctx(), /ปรับการคำนวณ/));
  ok('another sticker schema does not', has(order({ printJson: { ...pj(), v: 99 } }), ctx(), /คนละรุ่น/));
  ok('an empty orderDate does not', has(order({ printJson: { ...pj(), orderDate: '' } }), ctx(), /ไม่มีวันที่/));
  ok('another date does not', has(order(), ctx({ date: '2026-11-15' }), /ไม่ตรงกับวันที่เลือก/));
  ok('a blank entryId does not', has(order({ entryId: '' }), ctx(), /entryId/));
  const addamel = pj({ inclAddamel: true });
  eq('Addamel ordered leaves real nulls in stickerFigures', [addamel.stockMl.addamel, addamel.delivered.addamelMl], [null, null]);
  ok('a null figure (Addamel ordered) does not', has(order({ printJson: addamel }), ctx(), /Addamel/));
  const holed = pj(); delete holed.delivered.kcal;
  ok('a missing figure does not', has(order({ printJson: holed }), ctx(), /ตัวเลขไม่ครบ/));
  ok('blank fixed lines hold every print', has(order(), ctx({ fixed: Core.PN_FIXED }), /ข้อความคงที่/));
  eq('the fixed lines ship blank until the unit gives them', Core.fixedLinesReady(), false);
  eq('every figure a sticker reads is present in the real figures', Core.missingFigures(pj()), []);
}

section('§3 changed since printing');
{
  const log = [{ sessionId: 'SY-1', date: DATE, entryId: order().entryId, revision: 1 }];
  ok('the same entryId is not a change', !Core.changedAfterPrint(order(), log, DATE));
  ok('a revision is', Core.changedAfterPrint(order({ entryId: '22222222-2222-4222-8222-222222222222', revision: 2 }), log, DATE));
  ok('written again at revision 1 is too', Core.changedAfterPrint(order({ entryId: '33333333-3333-4333-8333-333333333333', revision: 1 }), log, DATE));
  ok('another date\'s print does not count', !Core.changedAfterPrint(order({ entryId: '33333333-3333-4333-8333-333333333333' }), log, '2026-11-15'));
  const twice = log.concat([{ sessionId: 'SY-1', date: DATE, entryId: 'later', revision: 2 }]);
  eq('the last print wins', Core.lastPrint(twice, 'SY-1', DATE).entryId, 'later');
  eq('gone from the reply: deleted or cancelled', Core.goneAfterPrint([], log, DATE).map((p) => p.sessionId), ['SY-1']);
  eq('still in the reply: not gone', Core.goneAfterPrint([order({ entryId: 'other' })], log, DATE), []);
  eq('another date is not this date\'s worry', Core.goneAfterPrint([], log, '2026-11-15'), []);
  const nowDraft = order({ status: 'draft', printJson: null, entryId: 'draft-1', revision: 2 });
  eq('printed, and now only a draft: listed', typeof Core.draftAfterPrint === 'function' ? Core.draftAfterPrint([nowDraft], log, DATE).map((o) => o.sessionId) : 'no function', ['SY-1']);
  eq('a draft never printed: not listed', typeof Core.draftAfterPrint === 'function' ? Core.draftAfterPrint([{ ...nowDraft, sessionId: 'SY-9' }], log, DATE) : 'no function', []);
  const ver = (cv, ss) => `window.TPN_ROOM_VERSIONS = { constantsVersion: ${JSON.stringify(cv)}, stickerSchema: ${ss} };`;
  eq('the served version file matches this tab', Core.versionsMatch ? Core.versionsMatch(ver('a', 1), { constantsVersion: 'a', stickerSchema: 1 }) : 'no function', true);
  eq('a release moved the constants', Core.versionsMatch ? Core.versionsMatch(ver('b', 1), { constantsVersion: 'a', stickerSchema: 1 }) : 'no function', false);
  eq('a release moved the schema', Core.versionsMatch ? Core.versionsMatch(ver('a', 2), { constantsVersion: 'a', stickerSchema: 1 }) : 'no function', false);
  eq('something else served there is not a match', Core.versionsMatch ? Core.versionsMatch('<html>', { constantsVersion: 'a', stickerSchema: 1 }) : 'no function', false);
  const NOW = Date.parse('2026-11-16T03:00:00Z');
  eq('date made: today passes', Core.preparedDateOk ? Core.preparedDateOk(DATE, NOW) : 'no function', true);
  eq('date made: a week ahead passes', Core.preparedDateOk ? Core.preparedDateOk('2026-11-23', NOW) : 'no function', true);
  eq('date made: a mistyped year does not', Core.preparedDateOk ? Core.preparedDateOk('2025-11-16', NOW) : 'no function', false);
  eq('date made: a date that does not exist does not', Core.preparedDateOk ? Core.preparedDateOk('2026-02-30', NOW) : 'no function', false);
  ok('a new file marks the week before it', Core.needsPaperCheck(DATE, '2026-11-20'));
  ok('…and tomorrow', Core.needsPaperCheck('2026-11-21', '2026-11-20'));
  ok('…not two weeks back', !Core.needsPaperCheck('2026-11-05', '2026-11-20'));
  ok('…and nothing when no log was lost', !Core.needsPaperCheck(DATE, ''));
  eq('the re-read passes the same order', Core.recheck(order(), [order()]).order.entryId, order().entryId);
  ok('the re-read refuses a new entryId', Core.recheck(order(), [order({ entryId: 'new', revision: 2 })]).refuse);
  ok('the re-read refuses an order gone', Core.recheck(order(), []).refuse);
  const kept = Core.currentOrders([order({ revision: 1, entryId: 'a' }), order({ revision: 3, entryId: 'c' }), order({ revision: 2, entryId: 'b' })]);
  eq('highest revision per ID', kept.map((o) => o.entryId), ['c']);
  const sorted = Core.currentOrders([order({ sessionId: 'S', bed: 'SCN 1' }), order({ sessionId: 'N10', bed: 'NICU 10' }), order({ sessionId: 'N2', bed: 'NICU 2' }), order({ sessionId: 'I', bed: 'iso 1-2' }), order({ sessionId: 'X', bed: '' })]);
  eq('sorted NICU, iso, SCN, then no bed, by number', sorted.map((o) => o.sessionId), ['N2', 'N10', 'I', 'S', 'X']);
}

section('§4 the sticker model copies strings');
{
  const j = pj();
  const m = Core.stickerModel(order({ printJson: j }), MAP, '2026-11-17', FIXED);
  eq('rows in the unit\'s order, less the three it dropped', m.stock.map((r) => r.key),
    ['d50w', 'aminoven10', 'amiparen10', 'aminoplasmal15', 'nacl20', 'glycophos', 'k2hpo4', 'naAcetate', 'kcl', 'mgso4_10', 'caGluconate', 'soluvit', 'peditrace', 'heparin', 'znso4', 'addamel']);
  ok('every stock value is the same string', m.stock.every((r) => r.value === j.stockMl[r.key]));
  ok('every delivered value is the same string', m.delivered.every((r) => r.value === j.delivered[r.key]));
  ok('every amino value is the same string', m.amino.every((r) => r.value === j.delivered.aminoAcidG[r.key]));
  eq('a zero row keeps its 0', m.stock.find((r) => r.key === 'amiparen10').value, '0');
  eq('a typed dextrose stays as typed', m.dextrosePct, j.delivered.dextrosePct);
  eq('WFI is printJson\'s', m.wfiMl, j.stockMl.wfi);
  eq('order date in the Buddhist era', m.orderDate, '16/11/2569');
  eq('date made is the box, not the order date', m.preparedDate, '17/11/2569');
  eq('iso bed on the bag label', Core.stickerModel(order({ bed: 'iso 2-1' }), MAP, DATE, FIXED).ward, '9B2(NICU)');
  const src = R('tpn-room-core.js') + R('tpn-room.jsx');
  ok('no toFixed, Math.round or parseFloat on the page', !/toFixed|Math\.round|parseFloat|Number\(p|\* *pj/.test(src));
}

section('§5 a reply from the real backend');
{
  const g = SBX.boot();
  const pw = ['Synthetic', 'Pass', '1'].join('-');
  g.addStaff('ph@kcmh.test', 'pharmacy', pw, { name: 'เภสัชสังเคราะห์' });
  const today = SBX.wardToday();
  const figures = FX.printJson(data, today);
  g.sheet('Patient_Registry').data.push(g.patRow('SY-1', { 3: 900, 8: 'B', 10: 'iso 2-1', 17: 2 }));
  g.sheet('Patient_Registry').data.push(g.patRow('SY-2', { 10: 'SCN 1' }));
  const logSheet = g.sheet('Daily_Log');
  logSheet.maxColumns = 39;
  logSheet.data[0][38] = 'printJson';
  const log = logSheet.data;
  const am = (j) => ({ 38: JSON.stringify(j) });
  log.push(g.logRow('SY-1', SBX.bkkMidnight(today), am(figures)));
  log.push(g.logRow('SY-2', SBX.bkkMidnight(today), { 14: 'draft' }));
  const login = JSON.parse(g.postText(JSON.stringify({ action: 'login', email: 'ph@kcmh.test', password: pw })));
  eq('a pharmacy account signs in', login.role, 'pharmacy');
  eq('…with no registry on the reply', login.sync, undefined);
  const r = JSON.parse(g.postText(JSON.stringify({ action: 'pharmacyOrders', token: login.token, date: today })));
  eq('counts', [r.counts.submitted, r.counts.drafts], [1, 1]);
  const orders = Core.currentOrders(r.orders);
  const one = orders.find((o) => o.sessionId === 'SY-1');
  ok('the seeded entryId is a plain UUID, so the server keeps it', /^[0-9a-f-]{36}$/.test(one.entryId));
  eq('a mapped, submitted order from the real reply prints', Core.printReasons(one, { date: today, ...VERS, nameFileOpen: true, mapping: MAP, fixed: FIXED }), []);
  ok('the draft from the real reply does not', Core.printReasons(orders.find((o) => o.sessionId === 'SY-2'), { date: today, ...VERS, nameFileOpen: true, mapping: MAP, fixed: FIXED }).length > 0);
  eq('twin label from the real reply', Core.twinLabel(one.twinSuffix, one.multiplesCount), 'Twin B of 2');
  eq('ward from the real reply', Core.wardLabel(one.bed), '9B2(NICU)');
  ok('no patient name in the reply', !JSON.stringify(r).includes('ทารก'));
}

section('§6 the page ships no dose code');
{
  const html = R('tpn-room.html');
  ok('tpn-room.html does not load data.js', !/data\.js/.test(html));
  ok('no calculator or registry module either', !/compiled\/(calculator|registry|app|log|fenton)/.test(html));
  const vers = R('compiled/tpn-room-version.js');
  ok('compiled/tpn-room-version.js holds data.js\'s CONSTANTS_VERSION', vers.includes(JSON.stringify(data.CONSTANTS_VERSION)));
  ok('…and its STICKER_SCHEMA_VERSION', vers.includes(`stickerSchema: ${data.STICKER_SCHEMA_VERSION}`));
  ok('no dangerouslySetInnerHTML or innerHTML: every string is text', !/dangerouslySetInnerHTML|innerHTML/.test(R('tpn-room.jsx')));
  ok('its own session key, never neofeed_session', /neofeed_tpn_room_session/.test(R('tpn-room.jsx')) && !/["']neofeed_session["']/.test(R('tpn-room.jsx')));
  ok('no Google sign-in script on a page that holds names', !/accounts\.google\.com|gsi\/client/.test(html + R('tpn-room.jsx')));
  ok('no timer reads orders: the only setInterval is the idle sign-out', (R('tpn-room.jsx').match(/setInterval/g) || []).length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
