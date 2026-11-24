// verify-ward-scope-frontend.cjs — the ward page and the Admin page under ward-scoped access
// (openspec/changes/paediatric-wards, task 2.4). The server keeps the rule (verify-ward-scope.cjs);
// this pins what the screens make of the `wards` list each sync carries.
//
//   § 1  the ward page: the tiles of the wards the account holds, then ทดสอบระบบ; no list (a backend
//        from before) is every ward, as before; an empty list says the account has no ward
//   § 2  "TPN ทั้งหอ": the same tabs
//   § 3  the Admin page's "หอของแต่ละบัญชี" card: lists doctors and nurses with a box per ward, saves one
//        account's wards through setStaffWards, shows a refusal in the server's words, says when the
//        Staff column is missing and when the backend predates the action
//
// Made-up accounts and infants. Dev-only deps as in test/README.md (react@18 react-dom@18 @babel/core
// @babel/preset-react jsdom).
//
// NEGATIVE CONTROL — red against main before ward scope (c37d8b6):
//   git -C <repo> archive c37d8b6 | tar -x -C /tmp/main-c37d8b6
//   NEOFEED_TREE=/tmp/main-c37d8b6 node test/verify-ward-scope-frontend.cjs
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const path = require('path');
const W = require('./ward-screens.cjs');
const { recorder } = require('./gas-vm-sandbox.cjs');
const T = recorder('WARD-SCOPED ACCESS · SCREENS');
const TREE = path.resolve(process.env.NEOFEED_TREE || path.join(__dirname, '..'));

(async () => {
  let m;
  try { m = W.mount({ root: TREE }); } catch (e) { T.ok('the app mounts in jsdom', false, String(e && e.message)); T.done(); }
  const { D, G, h, render, flush, probe, window } = m;
  const today = D.todayLocal();
  const P = W.patients(today), LOG = W.wardLog(today, P);
  const noop = () => {};
  // Each tile's ward name: its first line.
  const tiles = () => [...probe().querySelectorAll('.ward-gate .ward-tile')].map(t => W.norm(t.firstElementChild));
  const TEST = 'ทดสอบระบบ';

  // ── § 1 the ward page ──
  console.log('\n── § 1 the ward page ──');
  await render(h(G.WardGate, { patients: P, log: LOG, today, onPick: noop, onPrintList: noop }));
  const before = tiles();
  T.eq('1.1 no list (a backend from before): every ward, then ทดสอบระบบ', before, ['NICU', 'SCN', TEST]);
  await render(h(G.WardGate, { patients: P, log: LOG, today, onPick: noop, onPrintList: noop, wards: ['NICU', 'SCN'] }));
  T.eq('1.2 NICU and SCN: the same page as before', tiles(), before);
  T.ok('1.3 …and no "no ward" note', !probe().querySelector('.ward-none'));
  await render(h(G.WardGate, { patients: P, log: LOG, today, onPick: noop, onPrintList: noop, wards: ['SCN'] }));
  T.eq('1.4 SCN only: the SCN tile, then ทดสอบระบบ', tiles(), ['SCN', TEST]);
  await render(h(G.WardGate, { patients: P, log: LOG, today, onPick: noop, onPrintList: noop, wards: [] }));
  T.eq('1.5 no ward: only ทดสอบระบบ', tiles(), [TEST]);
  const note = W.norm(probe().querySelector('.ward-none'));
  T.ok('1.6 …and the page says the account has no ward and an admin assigns one', !!note && /ยังไม่มีหอ/.test(note) && /admin/.test(note), note);
  await render(h(G.PatientRegistry, { patients: P, log: LOG, ward: null, wards: ['SCN'], role: 'doctor', onWardChange: noop, onSelect: noop,
    onAdd: noop, onEdit: noop, onDelete: noop, mergeBaseFor: () => null, onPrintWard: noop, onPrintOrder: noop, onPrintAll: noop, onOpenWardTpn: noop }));
  T.eq('1.7 the registry hands its list to the ward page', tiles(), ['SCN', TEST]);

  // ── § 2 "TPN ทั้งหอ" ──
  console.log('\n── § 2 "TPN ทั้งหอ" ──');
  const tabs = () => [...probe().querySelectorAll('.wtpn .seg button')].map(W.norm);
  await render(h(G.WardTpnPage, { patients: P, log: LOG, ward: 'NICU', onSelect: noop }));
  T.eq('2.1 no list: every ward\'s tab, as before', tabs(), ['NICU', 'SCN', 'ทดสอบระบบ']);
  await render(h(G.WardTpnPage, { patients: P, log: LOG, ward: 'NICU', onSelect: noop, wards: ['SCN'] }));
  T.eq('2.2 SCN only: SCN and ทดสอบระบบ', tabs(), ['SCN', 'ทดสอบระบบ']);
  T.ok('2.3 …opened from NICU, it opens on SCN', /TPN ทั้งหอ · SCN/.test(W.norm(probe().querySelector('.wtpn h1'))), W.norm(probe().querySelector('.wtpn h1')));

  // ── § 3 the Admin page's card ──
  console.log('\n── § 3 the Admin page\'s card ──');
  if (typeof G.StaffWardsCard !== 'function') {
    T.ok('3.0 the Admin page has a ward card (StaffWardsCard)', false, typeof G.StaffWardsCard);
    T.done();
  }
  const LIST = () => ({ ok: true, columnReady: true, wardTable: [{ key: 'NICU', label: 'NICU' }, { key: 'SCN', label: 'SCN' }],
    staff: [
      { email: 'doc@example.test', name: 'หมอ ทดสอบ', role: 'doctor', active: true, wards: ['NICU', 'SCN'] },
      { email: 'new@example.test', name: 'พยาบาล ใหม่', role: 'nurse', active: true, wards: [] },
      { email: 'admin@example.test', name: 'Admin', role: 'admin', active: true, wards: ['NICU', 'SCN'] },
      { email: 'rx@example.test', name: 'Rx', role: 'pharmacy', active: true, wards: [] },
    ] });
  const saves = [];
  let saveReply = (email, wards) => ({ ok: true, email, wards });
  const api = { load: async () => LIST(), save: async (email, wards) => { saves.push([email, wards]); return saveReply(email, wards); } };
  await render(h(G.StaffWardsCard, { api }));
  await flush(30);
  const rows = () => [...probe().querySelectorAll('.staff-wards-row')];
  const rowOf = (email) => rows().find(r => r.textContent.includes(email));
  T.eq('3.1 one row per doctor and nurse; admin and pharmacy have none', rows().map(r => W.norm(r.firstElementChild.firstElementChild)),
    ['หมอ ทดสอบdoctor', 'พยาบาล ใหม่nurseไม่มีหอ']);
  const boxes = (email) => [...rowOf(email).querySelectorAll('input[type="checkbox"]')].map(b => b.checked);
  T.eq('3.2 a box per ward, ticked as the account holds', [boxes('doc@example.test'), boxes('new@example.test')], [[true, true], [false, false]]);
  T.ok('3.3 the card says an admin holds every ward by role', /admin ดูแลทุกหอ/.test(W.norm(probe())));
  const saveBtn = (email) => rowOf(email).querySelector('button');
  T.ok('3.4 Save is off until a box changes', saveBtn('new@example.test').disabled === true);
  const { act } = require('react');
  const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await flush(30); };
  await click(rowOf('new@example.test').querySelectorAll('input[type="checkbox"]')[1]);
  T.eq('3.5 ticking SCN ticks SCN', boxes('new@example.test'), [false, true]);
  T.ok('3.6 …and turns Save on', saveBtn('new@example.test').disabled === false);
  await click(saveBtn('new@example.test'));
  T.eq('3.7 Save sends that account and its wards, in table order', saves, [['new@example.test', ['SCN']]]);
  T.ok('3.8 …and says it is saved', /บันทึกแล้ว/.test(W.norm(rowOf('new@example.test'))), W.norm(rowOf('new@example.test')));
  T.ok('3.9 …and Save is off again', saveBtn('new@example.test').disabled === true);
  saveReply = () => ({ ok: false, refused: true, serverError: 'กำหนดหอได้เฉพาะบัญชี doctor และ nurse' });
  await click(rowOf('doc@example.test').querySelectorAll('input[type="checkbox"]')[0]);
  await click(saveBtn('doc@example.test'));
  T.ok('3.10 a refusal shows in the server\'s words', /กำหนดหอได้เฉพาะบัญชี doctor และ nurse/.test(W.norm(rowOf('doc@example.test'))), W.norm(rowOf('doc@example.test')));
  T.eq('3.11 …and the boxes keep what was ticked', boxes('doc@example.test'), [false, true]);

  await render(h(G.StaffWardsCard, { api: { load: async () => Object.assign(LIST(), { columnReady: false }), save: api.save } }));
  await flush(30);
  T.ok('3.12 no wards column yet: the card says to run the migration', /applyStaffWardsMigration/.test(W.norm(probe())));
  T.ok('3.13 …and no box can be ticked', [...probe().querySelectorAll('input[type="checkbox"]')].every(b => b.disabled));
  await render(h(G.StaffWardsCard, { api: { load: async () => ({ ok: false, serverError: 'Unknown action: getStaffWards' }), save: api.save } }));
  await flush(30);
  T.ok('3.14 a backend from before: the card says ward access is not on yet', /ยังไม่มีการแบ่งสิทธิ์ตามหอ/.test(W.norm(probe())), W.norm(probe()));
  await render(null);
  T.done();
})().catch(e => { console.error(e); process.exit(1); });
