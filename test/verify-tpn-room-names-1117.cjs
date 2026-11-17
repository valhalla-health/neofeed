// verify-tpn-room-names-1117.cjs — the TPN room's names page (Pp, 2026-11-17: "หน้ารวมชื่อทุกคน"),
// the rules in tpn-room-core.js, in Node. The page itself is in verify-tpn-room-page-1105.cjs §4b.
//
//   §1 namesList: every infant in the name file, the one seen in an order most recently first,
//      then by NeoFeed ID; a search keeps the rows whose ID, name or AN holds it, case and spaces aside.
//   §2 mappingSeenOn: an edit from the names page is no sighting, so it keeps the day last seen and
//      the 30-day purge still counts from the orders; an edit from an order row takes that order's date.
//   §3 wardDateTime: an ISO time in ward time, Buddhist era, for "แก้ล่าสุด" and the edit history.
//   §4 lastPrintOf, editedAfterPrint: a name or AN changed after its sticker printed is flagged until a reprint.
//
// Every check fails on origin/main 0284ee0, which has none of these. Synthetic names only.
const path = require('path');
const Core = require(path.join(__dirname, '..', 'tpn-room-core.js'));

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${yes ? '' : `  got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
const section = (t) => console.log(`\n── ${t} ──`);
const has = (fn) => typeof Core[fn] === 'function';

const INFANTS = {
  'NF-000003': { name: 'ทารกสมมติ สาม', an: '33333/69', by: 'Rx A', at: '2026-11-15T02:00:00.000Z', lastSeen: '2026-11-15', history: [] },
  'NF-000001': { name: 'ด.ญ. ทารกสมมติ หนึ่ง', an: '11111/69', by: 'Rx B', at: '2026-11-17T01:00:00.000Z', lastSeen: '2026-11-17', history: [] },
  'NF-000002': { name: 'Baby Synthetic Two', an: '22222/69', by: 'Rx A', at: '2026-11-16T03:00:00.000Z', lastSeen: '2026-11-17', history: [] },
};
const ids = (rows) => rows.map((r) => r.sessionId);

section('§1 namesList');
{
  const all = has('namesList') ? Core.namesList(INFANTS, '') : null;
  eq('every infant in the file', all && all.length, 3);
  eq('seen most recently first, then by NeoFeed ID', all && ids(all), ['NF-000001', 'NF-000002', 'NF-000003']);
  eq('each row carries what the page shows', all && all[2], { sessionId: 'NF-000003', name: 'ทารกสมมติ สาม', an: '33333/69',
    lastSeen: '2026-11-15', by: 'Rx A', at: '2026-11-15T02:00:00.000Z' });
  const q = (s) => (has('namesList') ? ids(Core.namesList(INFANTS, s)) : 'no function');
  eq('search by part of an ID', q('0002'), ['NF-000002']);
  eq('search by part of a Thai name', q('สาม'), ['NF-000003']);
  eq('search ignores case', q('baby synthetic'), ['NF-000002']);
  eq('search ignores spaces', q('ทารกสมมติหนึ่ง'), ['NF-000001']);
  eq('search by AN', q('22222/69'), ['NF-000002']);
  eq('a search that matches nothing is empty', q('ไม่มีชื่อนี้'), []);
  eq('a blank search keeps everyone', q('   '), ['NF-000001', 'NF-000002', 'NF-000003']);
  eq('an empty or missing file is an empty list', has('namesList') ? [Core.namesList({}, ''), Core.namesList(null, '')] : 'no function', [[], []]);
}

section('§2 mappingSeenOn');
{
  const f = has('mappingSeenOn') ? Core.mappingSeenOn : () => 'no function';
  const had = { lastSeen: '2026-11-10' };
  eq('from the names page: the day last seen, not the list\'s date', f(had, true, '2026-11-17'), '2026-11-10');
  eq('from an order row: that order\'s date', f(had, false, '2026-11-17'), '2026-11-17');
  eq('a new infant from an order row: the order\'s date', f(undefined, false, '2026-11-17'), '2026-11-17');
  eq('no order list loaded: today, ward time', f(undefined, false, undefined, Date.parse('2026-11-17T18:30:00Z')), '2026-11-18');
}

section('§3 wardDateTime');
{
  const f = has('wardDateTime') ? Core.wardDateTime : () => 'no function';
  eq('an ISO time in ward time, Buddhist era', f('2026-11-17T02:05:00.000Z'), '17/11/2569 09:05');
  eq('after 17:00 UTC it is the next ward day', f('2026-11-17T18:30:00.000Z'), '18/11/2569 01:30');
  eq('not a time: empty', [f(''), f(null), f('yesterday')], ['', '', '']);
}

section('§4 a name or AN edited after its sticker printed (Vera on the names page; Pp: "เพิ่มเลย")');
{
  const LOG = [
    { sessionId: 'NF-000001', date: '2026-11-16', entryId: 'e1', revision: 1, by: 'Rx A', at: '2026-11-16T02:00:00.000Z' },
    { sessionId: 'NF-000002', date: '2026-11-17', entryId: 'e2', revision: 1, by: 'Rx A', at: '2026-11-17T01:00:00.000Z' },
    { sessionId: 'NF-000001', date: '2026-11-17', entryId: 'e3', revision: 1, by: 'Rx B', at: '2026-11-17T02:00:00.000Z' },
  ];
  eq('lastPrintOf: the last print for the ID on any date', has('lastPrintOf') ? Core.lastPrintOf(LOG, 'NF-000001').entryId : 'no function', 'e3');
  eq('…none for an ID never printed', has('lastPrintOf') ? Core.lastPrintOf(LOG, 'NF-000009') : 'no function', null);
  const f = has('editedAfterPrint') ? Core.editedAfterPrint : () => 'no function';
  const printed = LOG[2];
  eq('edited after the print: flagged', f({ at: '2026-11-17T04:00:00.000Z' }, printed), true);
  eq('mapped before the print: not flagged', f({ at: '2026-11-17T01:30:00.000Z' }, printed), false);
  eq('the same instant: not flagged', f({ at: printed.at }, printed), false);
  eq('never printed, or no mapping: not flagged', [f({ at: '2026-11-17T04:00:00.000Z' }, null), f(null, printed)], [false, false]);
  eq('a time that is not one: not flagged', f({ at: 'x' }, printed), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
