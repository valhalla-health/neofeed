// verify-bed-transfer-0927.cjs — the bed-transfer review, 2026-09-27.
//
// Pp found it while capturing the manual from release 10a4272: on the desktop
// ward list a parked infant's "รอเตียง · จาก NICU 7" chip (122 px) sat in the
// 90 px Bed column and printed over the infant's name ("รอเตียง · จาก NIธน อร").
// She then asked for every bed-transfer bug ("verify and scrutinize all bed
// transfer bug"). Six more were found and checked on the real app; she chose
// the fixes from rendered before/after sheets (look "C" for the chip).
//
//   §1 a parked infant's bed cell, in the ward table and the Switch-patient
//      list: a "รอเตียง" chip with a small "จาก NICU 7" line under it, in the
//      column's own width. The phone card keeps its one-line chip.
//   §2 an infant who left the unit while parked is not "รอเตียง": the archive
//      row and the phone's archive card show the bed they last had, in the
//      ordinary chip
//   §2b Switch patient lists the unit first. An infant who has left (found by
//      another session, confirmed here) was listed under their old bed with no
//      status, and searching that bed's number put them above the infant now
//      in it. Now they come after the unit, dimmed, their bed cell reading
//      "Transferred จาก NICU 9"
//   §3 the transfer dialog: a bed someone is in can be chosen, which says who
//      is in it and how to swap (park them first). Confirm stays disabled.
//      Register and Edit still refuse the bed at the dropdown.
//   §4 "ย้ายไปเตียงว่างถัดไป" never offers the bed the infant is already in
//   §5 Edit records the bed an infant is moved out of, as ⇄ does, so a bed
//      cleared in Edit reads "รอเตียง · จาก <that bed>" on that bed's ward
//   §6 against the real gas-backend.gs: every hop is its own entry, so a
//      same-day return (NICU 4 → SCN 1 → NICU 4 → park) keeps its last hop and
//      the infant stays on the NICU list. A retried save still adds nothing.
//   §6b a retry from the same dialog re-sends the same hop (a guard: it also
//      holds before, when hops had no `at` to differ by)
//   §7 real Chromium, when playwright is installed: at 1024, 1280 and 1440 px
//      nothing in a bed cell reaches past its column or over the name, on the
//      NICU and SCN tables (archive rows included) and in Switch patient; on a
//      390 px phone the card keeps its one-line chip, and Switch patient shows
//      a parked bed on one line at the size of the other beds' chips
//
// Every section except §6b FAILS against f675420 (the tree release 10a4272
// serves) and passes after.
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
//   d=$(mktemp -d)
//   git -c core.autocrlf=false archive --format=tar f675420 | tar -x -C "$d"
//   cp test/verify-bed-transfer-0927.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && TZ=Asia/Bangkok node test/verify-bed-transfer-0927.cjs )
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const http = require('http');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(76)}${yes ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(76)}${cond ? '' : '  ' + JSON.stringify(detail ?? '').slice(0, 400)}`);
  cond ? pass++ : fail++;
}
async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  try { await fn(); } catch (e) { ok(`(section ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 4)); }
}

// ── jsdom + the real registry ─────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="probe"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, {
  window, document: window.document, self: window,
  HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
  getComputedStyle: window.getComputedStyle,
  sessionStorage: window.sessionStorage, localStorage: window.localStorage,
  Event: window.Event, CustomEvent: window.CustomEvent, MouseEvent: window.MouseEvent,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const alerts = [];
window.alert = (m) => alerts.push(String(m));
window.confirm = () => true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;

const load = (f) => vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: f, configFile: false, babelrc: false,
}).code);
vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
['icons.jsx', 'registry.jsx'].forEach(load);
const D = window.NEOFEED_DATA;

const TODAY = D.todayLocal();
const rec = (id, over) => ({
  sessionId: `${id}-BW1000`, name: id, initials: id, bw: 1000, ga: 28.0, sex: 'girls',
  dob: TODAY, admissionDate: TODAY, twinSuffix: '', status: 'Active', diagnosis: 'VLBW',
  currentBed: '', bedHistory: [], weights: [{ dol: 1, w: 1000 }], lengths: [], hcs: [],
  statusDate: '', multiplesCount: 0, ...over,
});
// A hop as the ward reads it: the bed and the day. `at` is checked on its own.
const hops = (p) => (p && p.bedHistory || []).map(h => ({ bed: h.bed, date: h.date }));

const probe = document.getElementById('probe');
const root = ReactDOM.createRoot(probe);
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
const click = async (el) => {
  if (!el) throw new Error('nothing to click');
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await flush();
};
// What a user's pick does. Choosing an option the <select> marks disabled is
// not something a user can do, so every caller checks `disabled` first.
const setSelect = async (sel, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(sel, value);
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await flush();
};
let edits = [];
const render = async (el) => { await act(async () => { root.render(el); }); await flush(); };
const mountRegistry = async (patients, { ward = 'NICU', onEdit, mergeBaseFor } = {}) => {
  edits = [];
  await render(React.createElement(window.PatientRegistry, {
    patients, activeId: null, log: {}, ward, onWardChange() {}, onSelect() {}, onAdd() {},
    onEdit: onEdit || ((p, base) => { edits.push({ p, base }); return { ok: true }; }),
    mergeBaseFor: mergeBaseFor || ((id) => patients.find(p => p.sessionId === id)),
  }));
};
const mountPicker = async (patients) => {
  await render(React.createElement(window.PatientPicker, { patients, activeId: null, onSelect() {}, onClose() {} }));
};
const tableRow = (name) => [...probe.querySelectorAll('.patient-table tbody tr')]
  .find(tr => tr.cells.length > 2 && tr.cells[1].textContent.trim() === name);
const card = (name) => [...probe.querySelectorAll('.patient-card-list .patient-mc')]
  .find(c => c.querySelector('.pmc-name')?.textContent === name);
const pickerRow = (name) => [...probe.querySelectorAll('.picker-row')]
  .find(r => r.children[1] && r.children[1].textContent.trim() === name);
const btn = (re, scope = probe) => [...scope.querySelectorAll('button')].find(b => re.test(b.textContent.trim()));
const modal = () => probe.querySelector('.picker');
const openTransfer = (name) => click(tableRow(name)?.querySelector('button[title="ย้ายเตียง"]'));
const openEdit = (name) => click(btn(/^Edit$/, tableRow(name)));
const transferSelect = () => modal().querySelector('select');
const editBedSelect = () => [...modal().querySelectorAll('.field')]
  .find(f => f.querySelector('label')?.textContent.trim() === 'Bed').querySelector('select');
const option = (sel, value) => [...sel.options].find(o => o.value === value);
// The parked look (C): a warn chip reading exactly "รอเตียง", and a separate
// line naming the bed left. Returns what the bed cell shows, or null.
const parkedLook = (cell) => {
  if (!cell) return null;
  const chip = cell.querySelector('.chip.warn');
  const from = [...cell.querySelectorAll('*')].find(e => !e.closest('.chip') && /^จาก /.test(e.textContent.trim()));
  return { chip: chip ? chip.textContent.trim() : null, from: from ? from.textContent.trim() : null,
    title: cell.querySelector('[title]')?.getAttribute('title') || null };
};

(async () => {

  // ══════════════════════════════════════════════════════════════════════
  await section('§1 A parked infant\'s bed cell: "รอเตียง" + "จาก NICU 7", in the column\'s width', async () => {
    const patients = [rec('BA', { currentBed: 'NICU 1' }),
      rec('BB', { bedHistory: [{ bed: 'NICU 7', date: TODAY }] })];
    await mountRegistry(patients);
    const cell = tableRow('BB')?.cells[0];
    eq('ward table: the warn chip reads just "รอเตียง"', parkedLook(cell)?.chip, 'รอเตียง');
    eq('…and the bed left is its own line under it', parkedLook(cell)?.from, 'จาก NICU 7');
    eq('…the tooltip still says what happened', parkedLook(cell)?.title, 'ย้ายออกจาก NICU 7 แล้ว — ยังไม่ได้เลือกเตียงใหม่');
    eq('an infant in a bed keeps the plain chip', tableRow('BA')?.cells[0].textContent.trim(), 'NICU 1');
    const phoneChip = card('BB')?.querySelector('.pmc-row:not(.pmc-head) .chip');
    eq('the phone card keeps its one-line chip — it has the room', phoneChip?.textContent.trim(), 'รอเตียง · จาก NICU 7');
    ok('…in the warn colour', !!phoneChip && phoneChip.classList.contains('warn'));
    const src = fs.readFileSync(DIR + 'registry.jsx', 'utf8');
    ok('the Bed column is still 90 px (look C widens nothing)', /\{\/\* Bed \*\/\}\s*<col style=\{\{ width: 90 \}\} \/>/.test(src));

    await mountPicker(patients);
    const pcell = pickerRow('BB')?.children[0];
    eq('Switch patient: the same "รอเตียง" chip', parkedLook(pcell)?.chip, 'รอเตียง');
    eq('…and the same "จาก NICU 7" line', parkedLook(pcell)?.from, 'จาก NICU 7');
    ok('…in the 84 px column it always had', /gridTemplateColumns: "84px 96px 64px 76px 1fr"/.test(src));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§2 An infant who left the unit while parked is not "รอเตียง"', async () => {
    const left = (status) => rec('BC', { status, statusDate: TODAY, bedHistory: [{ bed: 'NICU 9', date: TODAY }] });
    for (const st of ['Discharged', 'Transferred', 'Expired']) eq(`${st} while parked → not parked`, D.isParked(left(st)), false);
    eq('a blank status is still Active → still parked', D.isParked({ ...left(''), status: '' }), true);
    eq('…and an Active one too', D.isParked(left('Active')), true);
    eq('the record still files under the ward it left', D.patientWard(left('Discharged')), 'NICU');

    const patients = [rec('BA', { currentBed: 'NICU 1' }), left('Discharged')];
    await mountRegistry(patients);
    // One toggle opens the archive in the table and on the phone cards alike
    // (they share showArchived), so it is pressed once.
    await click(btn(/Discharged \/ Transferred \/ Expired/, probe.querySelector('.patient-table')));
    const row = tableRow('BC');
    eq('archive row: the bed they last had, in the plain chip', row?.cells[0].textContent.trim(), 'NICU 9');
    ok('…not the warn chip', !!row && !row.cells[0].querySelector('.chip.warn'));
    const archivedCard = [...probe.querySelectorAll('.patient-card-list .patient-mc')].find(c => c.textContent.includes('BC'));
    ok('phone archive card: no "รอเตียง"', !!archivedCard && !/รอเตียง/.test(archivedCard.textContent), archivedCard?.textContent);

    await mountPicker(patients);
    eq('Switch patient: their status, and the bed they left from', pickerRow('BC')?.children[0].textContent.trim(), 'Discharged จาก NICU 9');
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§2b Switch patient: the unit first; an infant who has left never reads as in their old bed', async () => {
    const t3 = D.addDaysToDateStr(TODAY, -3);
    const patients = [
      rec('BK', { currentBed: 'NICU 1' }),
      rec('BL', { currentBed: 'NICU 9', status: 'Transferred', statusDate: t3 }),     // left NICU 9 three days ago
      rec('BM', { currentBed: 'NICU 9' }),                                           // in NICU 9 now
      rec('BN', { bedHistory: [{ bed: 'NICU 7', date: TODAY }] }),                  // parked
      rec('BO', { status: 'Discharged', statusDate: TODAY, bedHistory: [{ bed: 'NICU 12', date: TODAY }] }),
    ];
    await mountPicker(patients);
    const names = () => [...probe.querySelectorAll('.picker-row')].map(r => r.children[1].textContent.trim());
    eq('browsing: every infant on the unit, then those who have left', names(), ['BK', 'BM', 'BN', 'BL', 'BO']);
    const input = probe.querySelector('.picker-h input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '9');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await flush();
    eq('searching "9": the infant in NICU 9 before the one who left it', names(), ['BM', 'BL']);
    const left = pickerRow('BL');
    eq('the departed row\'s bed cell: status, then the bed left from', left?.children[0].textContent.trim(), 'Transferred จาก NICU 9');
    // The cell itself may be the chip (querySelectorAll never returns the element it is called on).
    const chipsIn = (el) => [el, ...el.querySelectorAll('.chip')].filter(e => e.classList.contains('chip'));
    ok('…with no plain "NICU 9" bed chip', !!left && !chipsIn(left.children[0]).some(c => c.textContent.trim() === 'NICU 9'),
      left && chipsIn(left.children[0]).map(c => c.textContent.trim()));
    eq('…dimmed', left?.style.opacity, '0.6');
    eq('the infant in NICU 9 is not dimmed', pickerRow('BM')?.style.opacity, '');
    eq('the tooltip says they have left', left?.children[0].getAttribute('title'), 'Transferred — ออกจาก unit แล้ว');
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§3 Transfer: a taken bed can be chosen, and says how to swap', async () => {
    const patients = [rec('BA', { currentBed: 'NICU 1' }), rec('BB', { currentBed: 'NICU 3' })];
    await mountRegistry(patients);
    await openTransfer('BA');
    const taken = option(transferSelect(), 'NICU 3');
    eq('BB\'s bed is listed as taken, by name', taken?.textContent, 'NICU 3 · ไม่ว่าง (BB)');
    eq('…and it can be chosen (a disabled option cannot be, so its hint was never seen)', taken?.disabled, false);
    if (taken && !taken.disabled) await setSelect(transferSelect(), 'NICU 3');
    const text = modal()?.textContent || '';
    ok('choosing it says who is in it', /เตียง NICU 3 มี BB อยู่แล้ว/.test(text), text);
    ok('…and how to swap: open BB\'s ⇄ and park them first', /สลับเตียง: เปิด ⇄ ของ BB แล้วกด "พักไว้ก่อน"/.test(text), text);
    const confirm = btn(/Confirm transfer/, modal());
    ok('Confirm transfer stays disabled on a taken bed', !!confirm && confirm.disabled);
    await click(confirm);
    eq('…and nothing was saved', edits.length, 0);
    await click(btn(/^Cancel$/, modal()));

    await openEdit('BA');
    eq('Edit still refuses the taken bed at the dropdown', option(editBedSelect(), 'NICU 3')?.disabled, true);
    await click(btn(/^Cancel$/, modal()));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§4 "Next free bed" never offers the bed the infant is in', async () => {
    const patients = [rec('BA', { currentBed: 'NICU 1' }), rec('BB', { currentBed: 'NICU 3' }),
      rec('BD', { bedHistory: [{ bed: 'NICU 5', date: TODAY }] })];
    await mountRegistry(patients);
    await openTransfer('BA');
    ok('BA in NICU 1: the NICU shortcut is NICU 2, not NICU 1', !!btn(/^NICU · NICU 2$/, modal()),
      [...modal().querySelectorAll('button')].map(b => b.textContent.trim()));
    ok('…and nothing is pre-highlighted as if it were a move', !modal().querySelector('button.primary:not([disabled])') ||
      !/^NICU · /.test(modal().querySelector('button.primary:not([disabled])').textContent.trim()));
    await click(btn(/^Cancel$/, modal()));
    await openTransfer('BB');
    ok('BB in NICU 3: NICU 2 as well (NICU 1 is BA\'s)', !!btn(/^NICU · NICU 2$/, modal()));
    await click(btn(/^Cancel$/, modal()));
    await openTransfer('BD');
    ok('parked BD: NICU 2, the lowest free bed', !!btn(/^NICU · NICU 2$/, modal()));
    await click(btn(/^Cancel$/, modal()));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§5 Edit records the bed an infant is moved out of', async () => {
    const earlier = D.addDaysToDateStr(TODAY, -3);
    const up = () => rec('BE', { currentBed: 'NICU 5', bedHistory: [{ bed: 'SCN 2', date: earlier }] });

    await mountRegistry([up()]);
    await openEdit('BE');
    await setSelect(editBedSelect(), '');
    await click(btn(/Save changes/, modal()));
    let saved = edits[0]?.p;
    eq('clearing the bed in Edit records NICU 5, the bed left', hops(saved), [{ bed: 'SCN 2', date: earlier }, { bed: 'NICU 5', date: TODAY }]);
    eq('…so the infant reads รอเตียง from NICU 5', saved && D.lastBed(saved), 'NICU 5');
    eq('…on the NICU list, where they were — not SCN\'s', saved && D.patientWard(saved), 'NICU');

    await mountRegistry([up()]);
    await openEdit('BE');
    await setSelect(editBedSelect(), 'NICU 6');
    await click(btn(/Save changes/, modal()));
    saved = edits[0]?.p;
    eq('a bed changed in Edit records the bed left', hops(saved), [{ bed: 'SCN 2', date: earlier }, { bed: 'NICU 5', date: TODAY }]);
    eq('…and lands in the new one', saved?.currentBed, 'NICU 6');

    await mountRegistry([up()]);
    await openEdit('BE');
    await click(btn(/Save changes/, modal()));
    eq('an Edit that leaves the bed alone adds no hop', hops(edits[0]?.p), [{ bed: 'SCN 2', date: earlier }]);

    await mountRegistry([rec('BF', { currentBed: 'NICU-4' })]);
    await openEdit('BF');
    await click(btn(/Save changes/, modal()));
    eq('re-saving a legacy spelling ("NICU-4" → "NICU 4") is not a move', [edits[0]?.p.currentBed, hops(edits[0]?.p)], ['NICU 4', []]);

    await mountRegistry([rec('BG', { bedHistory: [{ bed: 'NICU 7', date: TODAY }] })]);
    await openEdit('BG');
    await setSelect(editBedSelect(), 'NICU 8');
    await click(btn(/Save changes/, modal()));
    eq('a parked infant given a bed in Edit adds no blank hop', hops(edits[0]?.p), [{ bed: 'NICU 7', date: TODAY }]);

    // A record that already left the unit: its bed is history, and correcting
    // it is not a move made today.
    const gone = rec('BJ', { currentBed: 'NICU 5', status: 'Discharged', statusDate: earlier });
    await mountRegistry([gone]);
    await click(btn(/Discharged \/ Transferred \/ Expired/, probe.querySelector('.patient-table')));
    await openEdit('BJ');
    await setSelect(editBedSelect(), 'NICU 6');
    await click(btn(/Save changes/, modal()));
    eq('correcting the bed of a discharged record adds no hop', [edits[0]?.p.currentBed, hops(edits[0]?.p)], ['NICU 6', []]);

    // Discharged the same day the bed is cleared: they did leave it today.
    await mountRegistry([up()]);
    await openEdit('BE');
    await setSelect(editBedSelect(), '');
    await setSelect([...modal().querySelectorAll('.field')].find(f => f.querySelector('label')?.textContent.trim() === 'Status').querySelector('select'), 'Discharged');
    await click(btn(/Save changes/, modal()));
    eq('discharging and clearing the bed at once records the bed left', hops(edits[0]?.p).at(-1), { bed: 'NICU 5', date: TODAY });
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§6 The real backend keeps a same-day return (NICU 4 → SCN 1 → NICU 4 → park)', async () => {
    const { boot, wardToday, addDays } = require('./gas-vm-sandbox.cjs');
    const g = boot();
    g.addStaff('doc@kcmh.test', 'doctor', 'Doctor-Password-1');
    const tok = g.session('doc@kcmh.test', 'doctor');
    const post = (b) => g.post(Object.assign({ token: tok }, b));
    const admitted = addDays(wardToday(), -7);
    const reg = post({ action: 'registerPatient', isNew: true, patient: rec('BH', {
      sessionId: 'BH-BW900', bw: 900, ga: 28.1, sex: 'boys', dob: admitted, admissionDate: admitted,
      currentBed: 'NICU 4', weights: [{ dol: 1, w: 900 }] }) });
    eq('registered in NICU 4', reg, { ok: true });
    // One ward device: saves carry the server's last copy as `base`, then it syncs.
    let synced = post({ action: 'getActivePatients' }).patients;
    let lastBody = null;
    const device = async (ward) => mountRegistry(synced, { ward,
      mergeBaseFor: (id) => synced.find(p => p.sessionId === id),
      onEdit: (p, base) => {
        lastBody = { action: 'registerPatient', patient: p, base };
        const r = post(lastBody);
        synced = post({ action: 'getActivePatients' }).patients;
        return r.error ? { ok: false, error: r.error } : { ok: true };
      } });
    const bh = () => synced.find(p => p.sessionId === 'BH-BW900');

    await device('NICU');
    await openTransfer('BH');
    await click(btn(/^SCN · SCN 1$/, modal()));
    await click(btn(/Confirm transfer/, modal()));
    eq('1 · NICU 4 → SCN 1', [bh().currentBed, hops(bh()).map(h => h.bed)], ['SCN 1', ['NICU 4']]);

    await device('SCN');
    await openTransfer('BH');
    ok('NICU 4 is free to go back to', option(transferSelect(), 'NICU 4') && !option(transferSelect(), 'NICU 4').disabled);
    await setSelect(transferSelect(), 'NICU 4');
    await click(btn(/Confirm transfer/, modal()));
    eq('2 · SCN 1 → NICU 4, the same day', [bh().currentBed, hops(bh()).map(h => h.bed)], ['NICU 4', ['NICU 4', 'SCN 1']]);

    await device('NICU');
    await openTransfer('BH');
    await click(btn(/^พักไว้ก่อน$/, modal()));
    eq('3 · parked: the server kept the second NICU 4 hop', hops(bh()).map(h => h.bed), ['NICU 4', 'SCN 1', 'NICU 4']);
    eq('…so every device reads รอเตียง from NICU 4', D.lastBed(bh()), 'NICU 4');
    eq('…on the NICU list, not SCN\'s', D.patientWard(bh()), 'NICU');
    ok('each hop carries when it happened (what makes a repeat its own entry)',
      bh().bedHistory.every(h => typeof h.at === 'string' && !isNaN(Date.parse(h.at))), bh().bedHistory);

    // A save retried after an unknown result is the same hop, and adds nothing.
    const before = JSON.stringify(bh().bedHistory);
    post(lastBody);
    synced = post({ action: 'getActivePatients' }).patients;
    eq('a retried park adds no second hop', JSON.stringify(bh().bedHistory), before);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§6b A retry from the same dialog sends the same hop', async () => {
    let tries = 0;
    const sent = [];
    await mountRegistry([rec('BI', { currentBed: 'NICU 2' })], {
      onEdit: (p) => { sent.push(p); tries++; return tries === 1 ? { ok: false, error: 'ไม่ทราบผลการบันทึก' } : { ok: true }; } });
    await openTransfer('BI');
    await click(btn(/^พักไว้ก่อน$/, modal()));
    ok('the first try failed and the dialog stayed open', !!modal() && /ไม่ทราบผลการบันทึก/.test(modal().textContent));
    await click(btn(/^พักไว้ก่อน$/, modal()));
    eq('two tries', sent.length, 2);
    eq('…carrying the identical hop, so the server can tell it is the same move',
      JSON.stringify(sent[1]?.bedHistory), JSON.stringify(sent[0]?.bedHistory));
  });
  await act(async () => root.unmount());

  // ══════════════════════════════════════════════════════════════════════
  await section('§7 Real Chromium: nothing in a bed cell past its column or over the name', async () => {
    let chromium;
    try { chromium = require('playwright').chromium; }
    catch { console.log('  SKIP  playwright not installed — §1–§6 only'); return; }
    const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
    let browser;
    try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
    catch (e) { console.log('  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); return; }

    // The real app from this tree, and a fake backend in gas-backend.gs's reply shapes.
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const P = (sessionId, name, bed, over = {}) => ({ ...rec(sessionId, over), sessionId, name, initials: name.replace(/\s/g, ''),
      currentBed: bed, dob: today, admissionDate: today, diagnosis: 'ELBW · RDS · PDA s/p ibuprofen · r/o NEC', ...over });
    const PATIENTS = [
      P('สจ-BW1000', 'สม จด', 'NICU 1'), P('กข-BW1000', 'กค จด', 'NICU 12'), P('ปพ-BW1000', 'ปพ ดา', 'iso 3-4'),
      P('ธอ-BW1000', 'ธน อร', '', { bedHistory: [{ bed: 'NICU 7', date: today }] }),
      P('นจ-BW1000', 'นฝ จด', '', { bedHistory: [{ bed: 'NICU 12', date: today }] }),
      P('วส-BW1000', 'วร สข', '', { status: 'Discharged', statusDate: today, bedHistory: [{ bed: 'NICU 10', date: today }] }),
      P('ทฟ-BW1000', 'ทฟ กด', 'NICU 11', { status: 'Transferred', statusDate: today }),   // the widest status chip
      P('ทก-BW1000', 'ทอ กล', 'SCN 30'),
      P('มน-BW1000', 'มน นา', '', { bedHistory: [{ bed: 'SCN 30', date: today }] }),
    ];
    const backend = (b) => b.action === 'login'
      ? { status: 'ok', token: 't', email: 'doc@x', role: 'doctor', name: 'Doc', authMethod: 'password' }
      : b.action === 'getActivePatients' ? { patients: PATIENTS, log: {}, ts: new Date().toISOString() } : { ok: true };
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
    const ROOT = path.join(DIR);   // not DIR itself: see verify-phone-sweep.cjs on '/' vs '\' (Windows)
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' }); res.end(fs.readFileSync(file));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${server.address().port}`;

    // Everything drawn in each bed cell, against its column and the name's text.
    const TABLE = () => [...document.querySelectorAll('.patient-table tbody tr')].filter(tr => tr.cells.length > 5).map(tr => {
      const td = tr.cells[0], name = tr.cells[1];
      const right = Math.max(...[...td.querySelectorAll('*')].map(e => e.getBoundingClientRect()).filter(r => r.width).map(r => r.right));
      const range = document.createRange(); range.selectNodeContents(name.firstElementChild || name);
      return { bed: td.textContent.trim(), past: +(right - td.getBoundingClientRect().right).toFixed(1),
        overName: right > range.getBoundingClientRect().left };
    });
    const PICKER = () => [...document.querySelectorAll('.picker-row')].map(row => {
      const bed = row.children[0], name = row.children[1];
      const right = Math.max(...[bed, ...bed.querySelectorAll('*')].map(e => e.getBoundingClientRect().right));
      const range = document.createRange(); range.selectNodeContents(name);
      return { bed: bed.textContent.trim(), overName: right > range.getBoundingClientRect().left };
    });
    const clean = (rows) => rows.every(r => r.past <= 0.5 && !r.overName);

    for (const W of [1024, 1280, 1440]) {
      const page = await browser.newPage({ viewport: { width: W, height: 800 } });
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.route('https://accounts.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
      await page.route('**://script.google.com/**', r => {
        let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {}
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(backend(b)) });
      });
      try {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.locator('button', { hasText: 'email' }).first().click({ timeout: 5000 });
        await page.locator('input[type="email"]').first().fill('doc@x');
        await page.locator('input[type="password"]').first().fill('pw');
        await page.locator('form button[type="submit"]').last().click({ timeout: 5000 });
        await page.waitForSelector('.ward-tile', { timeout: 10000 });
        await page.locator('.ward-tile', { hasText: 'NICU' }).first().click();
        await page.waitForSelector('.patient-table tbody tr');
        await page.locator('.patient-table button', { hasText: 'Discharged / Transferred / Expired' }).click();
        await page.waitForTimeout(150);
        const nicu = await page.evaluate(TABLE);
        ok(`${W}px NICU table: every bed cell inside its column, clear of the name (${nicu.length} rows)`,
          nicu.length === 7 && clean(nicu), nicu.filter(r => r.past > 0.5 || r.overName));
        await page.locator('button', { hasText: 'เปลี่ยน ward' }).click();
        await page.locator('.ward-tile', { hasText: 'SCN' }).first().click();
        await page.waitForSelector('.patient-table tbody tr');
        const scn = await page.evaluate(TABLE);
        ok(`${W}px SCN table: the same (${scn.length} rows)`, scn.length === 2 && clean(scn), scn.filter(r => r.past > 0.5 || r.overName));
        await page.locator('.switch-patient').click();
        await page.waitForSelector('.picker-row');
        const pick = await page.evaluate(PICKER);
        ok(`${W}px Switch patient: no bed column over a name (${pick.length} rows)`,
          pick.length === 9 && pick.every(r => !r.overName), pick.filter(r => r.overName));
        ok(`${W}px no page errors`, errors.length === 0, errors);
      } catch (e) {
        ok(`${W}px the app opened and every screen was reached`, false, e.message.split('\n')[0]);
      }
      await page.close();
    }

    // A phone: the card keeps its one-line chip, and Switch patient — where
    // the bed has the row's width — shows a parked bed on one line, at the size
    // of the other beds' chips.
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await page.route('https://accounts.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
      await page.route('**://script.google.com/**', r => {
        let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {}
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(backend(b)) });
      });
      try {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.locator('button', { hasText: 'email' }).first().click({ timeout: 5000 });
        await page.locator('input[type="email"]').first().fill('doc@x');
        await page.locator('input[type="password"]').first().fill('pw');
        await page.locator('form button[type="submit"]').last().click({ timeout: 5000 });
        await page.waitForSelector('.ward-tile', { timeout: 10000 });
        await page.locator('.ward-tile', { hasText: 'NICU' }).first().click();
        await page.waitForSelector('.patient-card-list .patient-mc');
        const cards = await page.evaluate(() => [...document.querySelectorAll('.patient-card-list .patient-mc')].map(c => {
          const chip = c.querySelector('.pmc-row:not(.pmc-head) .chip');
          return { bed: chip.textContent.trim(), h: chip.getBoundingClientRect().height };
        }));
        const parkedCard = cards.find(c => /^รอเตียง · จาก NICU 7$/.test(c.bed));
        ok('390px phone card: "รอเตียง · จาก NICU 7" on one line, as tall as a bed chip',
          !!parkedCard && Math.abs(parkedCard.h - cards.find(c => c.bed === 'NICU 1').h) < 1, cards);
        await page.evaluate(() => document.dispatchEvent(new Event('__open_picker')));
        await page.waitForSelector('.picker-row');
        const rows = await page.evaluate(() => [...document.querySelectorAll('.picker-row')].map(row => {
          const bed = row.children[0], chip = bed.classList.contains('chip') ? bed : bed.querySelector('.chip');
          const from = bed.querySelector('.bed-wait-from');
          return { bed: bed.textContent.trim(), chipFont: getComputedStyle(chip).fontSize,
            oneLine: !from || Math.abs(from.getBoundingClientRect().top + from.getBoundingClientRect().height / 2
              - (chip.getBoundingClientRect().top + chip.getBoundingClientRect().height / 2)) < 2 };
        }));
        const plain = rows.find(r => r.bed === 'NICU 1'), parked = rows.filter(r => /^รอเตียง/.test(r.bed));
        ok('390px Switch patient: a parked bed is one line', parked.length === 3 && parked.every(r => r.oneLine), parked);
        ok('…its chip the size of the other beds\' chips', !!plain && parked.every(r => r.chipFont === plain.chipFont), rows);
      } catch (e) {
        ok('390px the app opened and every screen was reached', false, e.message.split('\n')[0]);
      }
      await page.close();
    }
    await browser.close();
    server.close();
  });

  console.log(`\nBED TRANSFER 0927: ${fail === 0 ? 'ALL PASS' : fail + ' FAILED'} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
