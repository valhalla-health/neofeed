// verify-registry-chip-taps-1028.cjs — the ward list's status and bed chips
// are buttons (Pp, 2026-10-28).
//
//   "กดปุ่ม active ก็จะสามารถเปลี่ยนตัวเลือก status ได้ และให้ save ที่เดิมที่เคย
//    save หลัง save จะเปลี่ยนทุกที่ที่เกี่ยวข้อง
//    กดตรงเตียง ก็จะเท่ากับปุ่มย้ายเตียง ให้เช็คว่าทุกอย่างดึงมาจากจุดเดียวกัน"
//
// The phone card's "Active" chip and its bed chip were plain text. Now:
//   • the status chip opens a Status dialog that saves where Edit session saves
//     a status (onEdit → handleEditPatient → registerPatient, the merge base
//     frozen at open, D.statusChange for statusDate) and changes nothing else;
//   • the bed chip is the ⇄ button: the same handler, the same TransferBedModal;
//   • a status reads through one helper, D.patientStatus, on the list, the
//     table, the archive and the Dashboard strip, and the status list is one
//     list, D.PATIENT_STATUSES, in Edit session and the dialog.
//
// Drives the REAL <App/> in jsdom against the fake Apps Script in
// review-0917-boot.cjs, one scenario per process.
//
//   #1  the D helpers: the status list, a blank status, statusDate's rule
//   #2  phone card: Active ▾ → Discharged → Save. One registerPatient, only
//       status + statusDate changed, base sent; then the list, the tiles, the
//       archive, the freed bed and the Dashboard strip all say Discharged
//   #3  phone card: the bed chip opens the ⇄ dialog, for that infant only, and
//       a move made from it saves what ⇄ saves; a parked infant's reads
//       เลือกเตียง; an archived infant's bed is not a button
//   #4  back to Active from the archive: refused on a bed given away since,
//       saved (statusDate cleared) on a free one
//   #5  desktop table: the status cell and the bed cell open the same dialogs
//   #6  a blank status reads Active on the card AND the strip (the strip's
//       chip was empty); Edit session lists exactly D.PATIENT_STATUSES
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
//   d=$(mktemp -d)
//   git -c core.autocrlf=false archive --format=tar 326bcd9 | tar -x -C "$d"
//   cp test/verify-registry-chip-taps-1028.cjs test/review-0917-boot.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && TZ=Asia/Bangkok node test/verify-registry-chip-taps-1028.cjs )
// Every scenario fails there: no chip is a button, and data.js has no
// patientStatus, PATIENT_STATUSES or statusChange.
const {
  boot, runScenarios, mkPatient, TODAY, addDays,
} = require('./review-0917-boot.cjs');

// Made-up infants, none from the ward.
const AA = mkPatient({ sessionId: 'NF-100001', name: 'AA', initials: 'AA', currentBed: 'NICU 1', diagnosis: 'RDS' });
const CC = mkPatient({ sessionId: 'NF-100002', name: 'CC', initials: 'CC', bw: 1200, currentBed: 'NICU 2',
  weights: [{ dol: 1, w: 1200, l: null, hc: null }] });
// Parked: left NICU 4, no bed chosen yet.
const PK = mkPatient({ sessionId: 'NF-100003', name: 'PK', initials: 'PK', currentBed: '',
  bedHistory: [{ bed: 'NICU 4', date: TODAY, at: TODAY + 'T01:00:00.000Z' }] });
// Discharged two days ago from NICU 2, which CC holds now.
const LT = mkPatient({ sessionId: 'NF-100004', name: 'LT', initials: 'LT', currentBed: 'NICU 2',
  status: 'Discharged', statusDate: addDays(TODAY, -2) });
// Transferred yesterday from NICU 7, still free.
const TR = mkPatient({ sessionId: 'NF-100005', name: 'TR', initials: 'TR', currentBed: 'NICU 7',
  status: 'Transferred', statusDate: addDays(TODAY, -1) });
// A record whose status cell is blank (typed straight into the sheet).
const BL = mkPatient({ sessionId: 'NF-100006', name: 'BL', initials: 'BL', currentBed: 'NICU 6', status: '' });

const list = () => document.querySelector('.patient-card-list');
const card = (name, scope = list()) => [...scope.querySelectorAll('.patient-mc')]
  .find(c => c.querySelector('.pmc-name')?.textContent === name);
const statusChip = (el) => el && el.querySelector('button.chip-tap:not(.chip-tap-bed)');
const bedChip = (el) => el && el.querySelector('button.chip-tap-bed');
const dialog = (re) => [...document.querySelectorAll('.picker')].find(m => re.test(m.querySelector('.picker-h')?.textContent || ''));
const statusDialog = () => dialog(/^Status ·/);
const transferDialog = () => dialog(/^Transfer bed ·/);
const title = (m) => m ? m.querySelector('.picker-h div').textContent : null;
const radio = (m, s) => m && [...m.querySelectorAll('[role="radio"]')].find(b => b.textContent.trim() === s);
const strip = () => document.querySelector('.patient-strip');
const tile = (label) => {
  const t = [...document.querySelectorAll('.reg-stat')].find(x => x.querySelector('.reg-stat-lbl')?.textContent === label);
  return t ? t.querySelector('.reg-stat-val').textContent : null;
};
const tableRow = (re) => [...document.querySelectorAll('.patient-table tbody tr')].find(r => re.test(r.textContent));
const without = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

const scenarios = {
  async helpers(A) {
    console.log('\n── #1 One status list, one reading of a status, one statusDate rule ──');
    const t = boot({ patients: [AA] });
    t.quiet();
    await t.start();
    const D = t.D();
    A.eq('1.1 the status list, in picker order', D.PATIENT_STATUSES, ['Active', 'Discharged', 'Transferred', 'Expired']);
    A.eq('1.2 a blank status reads Active', ['', null, undefined].map(s => D.patientStatus({ status: s })), ['Active', 'Active', 'Active']);
    A.eq('1.3 any other reads as itself', D.patientStatus({ status: 'Expired' }), 'Expired');
    A.eq('1.4 isOnUnit is unchanged: blank and Active are on the unit, the rest are not',
      [{ status: '' }, { status: 'Active' }, { status: 'Discharged' }, { status: 'Transferred' }, { status: 'Expired' }, null].map(D.isOnUnit),
      [true, true, false, false, false, false]);
    const X = addDays(TODAY, -3);
    const sc = (from, fromDate, to) => D.statusChange({ status: from, statusDate: fromDate }, to, TODAY);
    A.eq('1.5 Active → Discharged stamps today', sc('Active', '', 'Discharged'), { status: 'Discharged', statusDate: TODAY });
    A.eq('1.6 a blank status → Expired stamps today', sc('', '', 'Expired'), { status: 'Expired', statusDate: TODAY });
    A.eq('1.7 Discharged saved again keeps its day (the 7 days do not restart)', sc('Discharged', X, 'Discharged'), { status: 'Discharged', statusDate: X });
    A.eq('1.8 Discharged → Transferred is a new day', sc('Discharged', X, 'Transferred'), { status: 'Transferred', statusDate: TODAY });
    A.eq('1.9 an archived status with no day gets today', sc('Discharged', '', 'Discharged'), { status: 'Discharged', statusDate: TODAY });
    A.eq('1.10 back to Active clears the day', sc('Discharged', X, 'Active'), { status: 'Active', statusDate: null });
    A.eq('1.11 Active saved again keeps the empty value it came with ("" stays "")', sc('Active', '', 'Active'), { status: 'Active', statusDate: '' });
  },

  async 'phone-status-discharge'(A) {
    console.log('\n── #2 Phone card: Active ▾ → Discharged → Save, and every screen follows ──');
    const t = boot({ patients: [AA, CC] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    const chip = statusChip(card('AA'));
    A.ok('2.1 the card\'s status chip is a button', !!chip);
    A.eq('2.2 …reading Active ▾', chip && chip.textContent, 'Active▾');
    A.eq('2.3 …named for a screen reader', chip && chip.getAttribute('aria-label'), 'Status Active — เปลี่ยนสถานะ AA');
    A.eq('2.4 the tiles before: Active', tile('Active'), '2');
    await t.click(chip);
    A.eq('2.5 a tap opens the Status dialog for AA', title(statusDialog()), 'Status · AA');
    A.ok('2.6 …and does not also open AA\'s Dashboard', !strip());
    A.eq('2.7 it offers the four statuses, Active checked',
      [...statusDialog().querySelectorAll('[role="radio"]')].map(b => `${b.textContent}${b.getAttribute('aria-checked') === 'true' ? '*' : ''}`),
      ['Active*', 'Discharged', 'Transferred', 'Expired']);
    const save = () => t.btn(/^\s*Save\s*$/, statusDialog());
    A.ok('2.8 Save is off until another status is picked', save() && save().disabled);
    await t.click(radio(statusDialog(), 'Discharged'));
    A.ok('2.9 picking Discharged turns Save on', save() && !save().disabled);
    A.ok('2.10 …and says the bed will be free', /เตียง NICU 1 จะว่าง/.test(statusDialog().textContent));
    const before = t.callsOf('registerPatient').length;
    await t.click(save());
    await t.flush(); await t.flush();
    const calls = t.callsOf('registerPatient');
    A.eq('2.11 one save, through registerPatient (where Edit session saves)', calls.length - before, 1);
    const sent = calls[calls.length - 1];
    A.eq('2.12 AA, status Discharged, dated today',
      sent && [sent.patient.sessionId, sent.patient.status, sent.patient.statusDate], ['NF-100001', 'Discharged', TODAY]);
    A.ok('2.13 an edit, not a new registration', sent && sent.isNew !== true);
    A.eq('2.14 nothing else on the record changed',
      sent && without(sent.patient, ['status', 'statusDate']), without(AA, ['status', 'statusDate']));
    A.eq('2.15 the merge base it was opened on travels with it', sent && sent.base && sent.base.status, 'Active');
    A.ok('2.16 the dialog closed', !statusDialog());
    A.eq('2.17 the server holds AA Discharged',
      (({ status, statusDate }) => ({ status, statusDate }))(t.server.patients.find(p => p.sessionId === 'NF-100001')),
      { status: 'Discharged', statusDate: TODAY });
    // …and everywhere it shows.
    A.ok('2.18 AA has left the active list', !card('AA'));
    A.eq('2.19 the Active tile counts one', tile('Active'), '1');
    await t.click(t.btn(/Discharged \/ Transferred \/ Expired/, list()));
    A.eq('2.20 AA is in the archive, its chip reading Discharged ▾', statusChip(card('AA')) && statusChip(card('AA')).textContent, 'Discharged▾');
    await t.click(bedChip(card('CC')));
    A.ok('2.21 NICU 1 is free: CC\'s Transfer bed offers it as the next NICU bed',
      !!t.btn(/^NICU · NICU 1$/, transferDialog()));
    await t.click(t.btn(/^Cancel$/, transferDialog()));
    await t.click(document.querySelector('.switch-patient'));
    await t.click([...document.querySelectorAll('.picker-row')].find(r => /AA/.test(r.textContent)));
    const stripChip = strip() && [...strip().querySelectorAll('.chip')].map(c => c.textContent).pop();
    A.eq('2.22 AA\'s Dashboard strip says Discharged', stripChip, 'Discharged');
  },

  async 'phone-bed-chip'(A) {
    console.log('\n── #3 Phone card: the bed chip is the ⇄ button ──');
    const t = boot({ patients: [AA, CC, PK, TR] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    const chip = bedChip(card('AA'));
    const arrows = [...card('AA').querySelectorAll('.pmc-actions button')].find(b => b.textContent.includes('⇄'));
    A.ok('3.1 the bed chip is a button', !!chip);
    A.eq('3.2 …named as ⇄ is', chip && chip.getAttribute('aria-label'), arrows && arrows.getAttribute('aria-label'));
    await t.click(chip);
    A.eq('3.3 a tap opens Transfer bed for AA', title(transferDialog()), 'Transfer bed · AA');
    A.ok('3.4 …and does not also open AA\'s Dashboard', !strip());
    const fromChip = transferDialog().textContent;
    await t.click(t.btn(/^Cancel$/, transferDialog()));
    await t.click(arrows);
    A.ok('3.5 ⇄ opens the very same dialog, showing the same', !!transferDialog() && transferDialog().textContent === fromChip);
    await t.click(t.btn(/^Cancel$/, transferDialog()));
    // A move made from the chip saves what ⇄ saves.
    await t.click(bedChip(card('AA')));
    await t.selectVal(transferDialog().querySelector('select'), 'NICU 5');
    await t.click(t.btn(/Confirm transfer/, transferDialog()));
    await t.flush(); await t.flush();
    const sent = t.callsOf('registerPatient').pop();
    A.eq('3.6 the move saves AA in NICU 5', sent && [sent.patient.sessionId, sent.patient.currentBed], ['NF-100001', 'NICU 5']);
    A.eq('3.7 …with NICU 1 in Previous beds', sent && sent.patient.bedHistory.map(h => h.bed), ['NICU 1']);
    A.eq('3.8 …and its status untouched', sent && sent.patient.status, 'Active');
    A.eq('3.9 a parked infant\'s bed chip reads เลือกเตียง to a screen reader',
      bedChip(card('PK')) && bedChip(card('PK')).getAttribute('aria-label'), 'เลือกเตียง PK');
    await t.click(t.btn(/Discharged \/ Transferred \/ Expired/, list()));
    A.ok('3.10 an archived infant\'s bed is not a button', !!card('TR') && !bedChip(card('TR')) && /NICU 7/.test(card('TR').textContent));
  },

  async 'back-to-active'(A) {
    console.log('\n── #4 Back to Active from the archive ──');
    const t = boot({ patients: [AA, CC, LT, TR] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    await t.click(t.btn(/Discharged \/ Transferred \/ Expired/, list()));
    await t.click(statusChip(card('LT')));
    A.eq('4.1 the archived chip opens the dialog, Discharged checked',
      statusDialog() && radio(statusDialog(), 'Discharged').getAttribute('aria-checked'), 'true');
    await t.click(radio(statusDialog(), 'Active'));
    const save = () => t.btn(/^\s*Save\s*$/, statusDialog());
    A.ok('4.2 Active on NICU 2, which CC holds now, is refused', save().disabled && /NICU 2 มี CC อยู่แล้ว/.test(statusDialog().textContent));
    const n = t.callsOf('registerPatient').length;
    await t.click(t.btn(/^Cancel$/, statusDialog()));
    A.eq('4.3 nothing was sent', t.callsOf('registerPatient').length, n);
    await t.click(statusChip(card('TR')));
    await t.click(radio(statusDialog(), 'Active'));
    A.ok('4.4 Active on NICU 7, still free, says where they go back to', /กลับเข้ารายชื่อ ward ที่เตียง NICU 7/.test(statusDialog().textContent));
    await t.click(save());
    await t.flush(); await t.flush();
    const sent = t.callsOf('registerPatient').pop();
    A.eq('4.5 TR is saved Active, the transfer day cleared',
      sent && [sent.patient.sessionId, sent.patient.status, sent.patient.statusDate], ['NF-100005', 'Active', null]);
    A.ok('4.6 TR is back on the active list', !!card('TR') && statusChip(card('TR')).textContent === 'Active▾');
    A.eq('4.7 the Active tile counts three', tile('Active'), '3');
  },

  async 'desktop-table'(A) {
    console.log('\n── #5 Desktop table: the status and bed cells ──');
    const t = boot({ patients: [AA, CC] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    const row = tableRow(/AA/);
    await t.click(bedChip(row));
    A.eq('5.1 the bed cell opens Transfer bed for AA', title(transferDialog()), 'Transfer bed · AA');
    A.ok('5.2 …not AA\'s Dashboard', !strip());
    await t.click(t.btn(/^Cancel$/, transferDialog()));
    await t.click(statusChip(tableRow(/AA/)));
    A.eq('5.3 the status cell opens the Status dialog for AA', title(statusDialog()), 'Status · AA');
    A.ok('5.4 …not AA\'s Dashboard', !strip());
    await t.click(radio(statusDialog(), 'Transferred'));
    await t.click(t.btn(/^\s*Save\s*$/, statusDialog()));
    await t.flush(); await t.flush();
    const sent = t.callsOf('registerPatient').pop();
    A.eq('5.5 AA is saved Transferred, dated today',
      sent && [sent.patient.status, sent.patient.statusDate], ['Transferred', TODAY]);
    A.ok('5.6 AA has left the table\'s active rows (the archive is folded)', !tableRow(/AA/) && !!tableRow(/CC/));
  },

  async 'blank-status-and-edit'(A) {
    console.log('\n── #6 A blank status reads Active everywhere; Edit lists the one status list ──');
    const t = boot({ patients: [BL] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    A.eq('6.1 the card reads Active ▾', statusChip(card('BL')) && statusChip(card('BL')).textContent, 'Active▾');
    await t.click(t.btn(/^\s*Edit\s*$/, card('BL')));
    const edit = dialog(/^Edit session ·/);
    const sel = t.fieldInput('Status', edit);
    A.eq('6.2 Edit session lists exactly D.PATIENT_STATUSES', sel && [...sel.options].map(o => o.value), t.D().PATIENT_STATUSES);
    A.eq('6.3 …with Active chosen for the blank status', sel && sel.value, 'Active');
    await t.click(t.btn(/^Cancel$/, edit));
    await t.openPatientRow(/BL/);
    const stripChip = strip() && [...strip().querySelectorAll('.chip')].map(c => c.textContent).pop();
    A.eq('6.4 the Dashboard strip reads Active too (it read blank)', stripChip, 'Active');
  },

  async chromium(A) {
    console.log('\n── #7 Real Chromium, a touch phone 320–430px ──');
    let chromium;
    try { chromium = require('playwright').chromium; }
    catch { console.log('  SKIP  playwright not installed'); return; }
    const fs = require('fs');
    const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
    let browser;
    try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
    catch (e) { console.log('  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); return; }
    const t = boot({ patients: [AA, CC, PK] });
    const ReactDOMServer = require('react-dom/server');
    const css = fs.readFileSync(require('path').join(__dirname, '..', 'NeoFeed.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
    const page = ReactDOMServer.renderToStaticMarkup(t.React.createElement(t.window.PatientRegistry, {
      patients: [AA, CC, PK], activeId: null, log: {}, ward: 'NICU', onWardChange() {}, onSelect() {} }));
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>
      <div class="app"><div class="topbar"></div><nav class="rail"></nav>
      <main class="work"><div class="work-inner">${page}</div></main></div></body></html>`;
    for (const W of [320, 360, 390, 430]) {
      const tab = await browser.newPage({ viewport: { width: W, height: 900 }, hasTouch: true, isMobile: true });
      await tab.setContent(html);
      const r = await tab.evaluate(() => {
        // What a finger lands on 20px above and below the middle of each chip:
        // the chip itself, if its tap area is 44px tall.
        const reach = (b) => {
          const rc = b.getBoundingClientRect(), x = rc.left + rc.width / 2, y = rc.top + rc.height / 2;
          return [y - 20, y + 20].every(yy => document.elementFromPoint(x, yy)?.closest('.chip-tap') === b);
        };
        const cards = [...document.querySelectorAll('.patient-card-list .patient-mc')];
        const chips = cards.flatMap(c => [...c.querySelectorAll('.chip-tap')]);
        const head = cards.map(c => {
          const s = c.querySelector('.pmc-head .chip-tap').getBoundingClientRect();
          const n = c.querySelector('.pmc-name').getBoundingClientRect();
          return Math.abs((s.top + s.height / 2) - (n.top + n.height / 2)) < 6;
        });
        const doc = document.documentElement;
        return { n: chips.length, reach: chips.map(reach), head, pageDrag: doc.scrollWidth - doc.clientWidth,
          coarse: matchMedia('(pointer: coarse)').matches };
      });
      A.ok(`7.${W} a touch screen (pointer: coarse)`, r.coarse);
      A.eq(`7.${W} every chip's tap area reaches 44px tall (${r.n} chips)`, r.reach.every(Boolean) && r.n === 6, true);
      A.eq(`7.${W} the status chip stays on the name's line`, r.head, [true, true, true]);
      A.ok(`7.${W} the page does not scroll sideways`, r.pageDrag <= 0.5);
      if (W === 390 && process.env.SHOT) await tab.screenshot({ path: process.env.SHOT, fullPage: false });
      await tab.close();
    }
    await browser.close();
  },
};

runScenarios(__filename, 'REGISTRY CHIP TAPS 1028 · STATUS + BED', scenarios);
