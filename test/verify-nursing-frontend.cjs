// verify-nursing-frontend.cjs — UX roadmap #4, the nurse form's frontend, built
// to Pp's decisions of 2026-09-24 (docs/NURSING_FORM_SPEC.md § 8).
//
//   §1  data.js: a blank is not a 0 (nursingIntakeMl), one record per date,
//       every date normalised and newest first, a weight merged the growth
//       chart's way (keeps length/HC, stays sorted, never mutates).
//   §2  The form: a blank box goes to the server as null and a typed 0 as 0,
//       the ward's bounds hold, there is no free-text box anywhere, a
//       weight-only save sends no I/O row, the measured weight is offered,
//       the server's refusal is shown in place, and a stray tap outside a
//       form with typing in it does not throw the typing away.
//   §3  The Dashboard card: is today in yet, the last seven days newest first,
//       "—" for not recorded (never 0), urine in mL/kg/h on the Calculator's
//       own divisor, and a delete button only where one was given.
//   §4  D4: a NEW order's Intake/Output is filled from the nurses' totals for
//       its date — a recorded 0 counts as entered, a blank does not — and
//       opening that form writes no draft. A saved order is never touched. A
//       record that arrives, changes or goes after the form opened is offered,
//       not forced in; a restored draft is what was typed, not the record.
//   §5  D5: a nurse computes and cannot save — no Save draft / Submit, no
//       unsaved-draft store, the reason said where the buttons were.
//   §6  The real <App/> against a fake Apps Script:
//       6a  until the backend serves `nursing` (its switch, NURSING_LOG_ENABLED,
//           is off until the DPO signs off — D7), nothing changes: no card, and
//           a nurse still saves orders, as the ward does today;
//       6b  after, a nurse gets the card, loses New log and Submit, and the form
//           sends logNursingEntry + updateWeights; a DuplicateDate is said in
//           the form and re-syncs;
//       6c  an edit made on another device is a conflict, shown in the form;
//       6d  a doctor keeps New log and Submit; an admin alone deletes;
//       6e  the backend's go-live switch works both ways on the next sync: off,
//           the card goes and a nurse's New log and Submit come back;
//       6f  the I/O row landed but the weight could not be sent (an earlier
//           write's result unknown): the form still closes, so a second Save
//           cannot make a second record for the date.
//   §7  Both shells style it; in real Chromium (when playwright is installed)
//       neither the card nor the form scrolls sideways at 280–1280 px, and
//       every row, button and box is at least 44 px.
//       (Run with NODE_PATH="$(npm root -g)" to use a global playwright; CI
//       prints SKIP for the browser half, as verify-mobile-fit.cjs does.)
//
// One scenario per process (review-0917-boot.cjs): app.jsx mounts <AppRoot/>
// the moment it loads, so each App scenario needs a fresh one.
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
//   d=$(mktemp -d)
//   git -c core.autocrlf=false archive --format=tar b64c7fa | tar -x -C "$d"
//   cp test/verify-nursing-frontend.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && node test/verify-nursing-frontend.cjs )
// b64c7fa has the backend (Nursing_Log, the nursing actions, D5 on the server,
// all behind its switch) and none of this: no helpers, no card, no form, no
// prefill, and a nurse's Calculator still offers Submit against a server that
// refuses it once switched on. Every scenario fails there (40 assertions; 39
// without a browser) except §6a — which pins that NOTHING changes until the
// backend serves nursing records, and so holds on the old tree by design.
const fs = require('fs');
const {
  boot, runScenarios, mkPatient, addDays, DOCTOR, DIR,
} = require('./review-0917-boot.cjs');

const NURSE = { name: 'Nurse N', role: 'nurse', email: 'n@test.th', token: 'tok-nurse-abcdefg', authMethod: 'password' };
const ADMIN = { name: 'Admin A', role: 'admin', email: 'a@test.th', token: 'tok-admin-abcdefg', authMethod: 'password' };
const clone = (x) => JSON.parse(JSON.stringify(x));

// ── shared driving ──────────────────────────────────────────────────────────
// A probe root for components mounted on their own (§2–§5).
function probe(t) {
  const el = document.createElement('div');
  el.id = 'probe';
  document.body.appendChild(el);
  const root = t.ReactDOM.createRoot(el);
  return {
    el,
    render: async (node) => { await t.act(async () => { root.render(node); }); await t.flush(); },
  };
}
const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];
const modal = () => $('.nursing-modal');
const box = (name) => $(`#nio-${name}`);
const saveBtn = () => $$('button', modal()).find(b => /^(บันทึก|กำลังบันทึก…)$/.test(b.textContent.trim()));
const problemsText = () => ($('.nio-problems', modal()) || {}).textContent || '';
const draftKeys = () => Object.keys(localStorage).filter(k => k.startsWith('neofeed_draft_'));
// The Calculator's required-field list ("ยังกรอกไม่ครบ (n) — …: a · b").
const missingText = () => $$('div').map(d => d.textContent).filter(t => /^ยังกรอกไม่ครบ/.test(t)).pop() || '';
const calcField = (t, label) => t.fieldInput(label, $('#probe') || document);
const hasButton = (re, scope = document) => $$('button', scope).some(b => re.test(b.textContent.trim()));

// The fake Apps Script's nursing half — the contract gas-backend.gs keeps
// (verify-nursing-backend.cjs pins the real one). `S.serveNursing` is the
// go-live switch (NURSING_LOG_ENABLED): on, the sync carries `nursing` and a
// nurse's order write is refused (D5); off, neither. DuplicateDate with the
// existing entryId, and optimistic-lock conflicts on edit.
function nursingBackend(t, { serve = true, nursing = {} } = {}) {
  const S = t.server;
  S.nursing = clone(nursing);
  S.serveNursing = serve;
  let n = 0;
  S.hooks.getActivePatients = () => ({ after: (data) => { if (S.serveNursing) data.nursing = clone(S.nursing); } });
  S.hooks.logNursingEntry = (body) => {
    const rows = S.nursing[body.sessionId] || (S.nursing[body.sessionId] = []);
    const dup = rows.find(r => r.ts === body.entry.ts);
    if (dup) {
      return { reply: { error: `มีบันทึก I/O ของผู้ป่วยรายนี้ในวันที่ ${body.entry.ts} แล้ว — กรุณาเปิดรายการเดิมเพื่อแก้ไข`,
        code: 'DuplicateDate', entryId: dup.entryId } };
    }
    const entryId = 'srv-n' + (++n), lastModified = `2026-09-24T01:00:${String(10 + n)}.000Z`;
    const { appVersion, ...vals } = body.entry;
    rows.push({ ...vals, entryId, lastModified, enteredBy: 'n@test.th', lastModifiedBy: 'n@test.th' });
    return { reply: { entryId, lastModified } };
  };
  S.hooks.updateNursingEntry = (body) => {
    const r = (S.nursing[body.sessionId] || []).find(x => x.entryId === body.entryId);
    if (!r) return { reply: { error: 'ไม่พบบันทึก I/O ที่ต้องการแก้ไข — อาจถูกลบไปแล้ว' } };
    if (r.lastModified !== body.expectedLastModified) {
      return { reply: { conflict: true, current: { lastModified: r.lastModified, lastModifiedBy: r.lastModifiedBy } } };
    }
    const { appVersion, ts, ...vals } = body.entry;
    Object.assign(r, vals, { lastModified: `2026-09-24T02:00:${String(10 + (++n))}.000Z` });
    return { reply: { ok: true, lastModified: r.lastModified } };
  };
  S.hooks.deleteNursingEntry = (body) => {
    const rows = S.nursing[body.sessionId] || [];
    const i = rows.findIndex(x => x.entryId === body.entryId);
    if (i < 0) return { reply: { error: 'ไม่พบบันทึก I/O ที่ต้องการลบ — อาจถูกลบไปแล้ว' } };
    rows.splice(i, 1);
    return { reply: { ok: true } };
  };
  const refuseNurse = (body) => (S.serveNursing && body.token === NURSE.token
    ? { reply: { error: 'พยาบาลใช้ Calculator ได้ แต่บันทึกหรือ Submit ใบสั่ง TPN ไม่ได้ — บันทึก I/O ที่ Dashboard', code: 'Forbidden' } }
    : undefined);
  ['logDailyNutrition', 'updateDailyNutrition', 'publishLog'].forEach(a => { S.hooks[a] = refuseNurse; });
}

// Today in the app's own reckoning — the date the components compare against.
const fixture = (t) => {
  const D = t.D();
  const today = D.todayLocal();
  const day = (n) => D.addDaysToDateStr(today, n);
  // Admitted 10 days ago at 1000 g; weighed yesterday (DOL 10) at 1050 g.
  const patient = mkPatient({ sessionId: 'NI-BW1000', name: 'NI', initials: 'NI', bw: 1000,
    dob: day(-10), admissionDate: day(-10), currentBed: 'NICU 3',
    weights: [{ dol: 1, w: 1000, l: 35, hc: 25 }, { dol: 10, w: 1050, l: null, hc: null }] });
  return { D, today, day, patient };
};

const scenarios = {
  // ═══════════════════════════════════════════════════════════════════════
  async helpers(A) {
    console.log('\n── §1 data.js: blank is not 0, one record per date, one weight store ──');
    const t = boot({ session: null });
    const { D } = fixture(t);
    A.eq('1.1 nursingIntakeMl: nothing recorded is null, not 0', D.nursingIntakeMl({ ivInMl: null, enInMl: null }), null);
    A.eq('1.2 …a recorded 0 is 0', D.nursingIntakeMl({ ivInMl: 0, enInMl: null }), 0);
    A.eq('1.3 …IV + enteral', D.nursingIntakeMl({ ivInMl: 100, enInMl: 60 }), 160);
    A.eq('1.4 …to 0.1 mL (0.1 + 0.2 reads 0.3)', D.nursingIntakeMl({ ivInMl: 0.1, enInMl: 0.2 }), 0.3);
    A.eq('1.5 …and no record is null', D.nursingIntakeMl(null), null);
    const recs = [{ ts: '2026-09-20', entryId: 'a' }, { ts: '2026-09-22', entryId: 'b' }];
    A.eq('1.6 nursingRecordOn finds the date', (D.nursingRecordOn(recs, '2026-09-22') || {}).entryId, 'b');
    A.eq('1.7 …null for a date with none', D.nursingRecordOn(recs, '2026-09-21'), null);
    A.eq('1.8 …null for no date at all', D.nursingRecordOn(recs, ''), null);
    // A Date object (the client's own path for a Sheets date cell) is the
    // ward's calendar day — 2026-09-22 00:00 ICT is 2026-09-21 17:00 UTC.
    const m = D.normalizeNursingMap({
      X: [{ ts: '2026-09-20', entryId: 'a' }, { ts: new Date('2026-09-21T17:00:00Z'), entryId: 'b' },
        null, 'junk', { ts: '', entryId: 'no-date' }],
      Y: 'not a list',
    });
    A.eq('1.9 normalizeNursingMap: dates as YYYY-MM-DD, newest first, junk dropped',
      m.X.map(r => [r.ts, r.entryId]), [['2026-09-22', 'b'], ['2026-09-20', 'a']]);
    A.eq('1.10 …a session whose value is not a list is left out', 'Y' in m, false);
    const w0 = [{ dol: 1, w: 1000, l: 35, hc: 25 }, { dol: 5, w: 980, l: null, hc: null }];
    const frozen = JSON.stringify(w0);
    A.eq('1.11 upsertWeight on a DOL already measured keeps its length/HC',
      D.upsertWeight(w0, 1, 1010), [{ dol: 1, w: 1010, l: 35, hc: 25 }, { dol: 5, w: 980, l: null, hc: null }]);
    A.eq('1.12 …a new DOL is added in DOL order',
      D.upsertWeight(w0, 3, 990).map(x => x.dol), [1, 3, 5]);
    A.eq('1.13 …as a weight with no length/HC', D.upsertWeight(w0, 3, 990)[1], { dol: 3, w: 990, l: null, hc: null });
    A.eq('1.14 …and the array handed in is not mutated', JSON.stringify(w0), frozen);
    A.eq('1.15 …no weights yet is an empty list, not a crash', D.upsertWeight(undefined, 2, 900), [{ dol: 2, w: 900, l: null, hc: null }]);
  },

  // ═══════════════════════════════════════════════════════════════════════
  async form(A) {
    console.log('\n── §2 The form: blank ≠ 0, the ward\'s bounds, no free text ──');
    const t = boot({ session: null });
    t.quiet();
    const { today, day, patient } = fixture(t);
    const P = probe(t);
    const Modal = t.window.NursingEntryModal;
    A.ok('2.0 NursingEntryModal exists', typeof Modal === 'function');
    let submitted = [], closed = 0, reply = { ok: true };
    const open = async (record = null) => {
      await P.render(null);   // a fresh form: the same element type would keep its state
      await P.render(t.React.createElement(Modal, {
        patient, record, onClose: () => { closed++; },
        onSubmit: (p) => { submitted.push(p); return Promise.resolve(reply); },
      }));
    };

    await open();
    A.ok('2.1 a new form is dated today', box('date').value === today);
    A.ok('2.2 …with nothing typed, Save is disabled', saveBtn() && saveBtn().disabled);
    A.ok('2.3 …and says why', /ยังไม่ได้กรอกค่าใดเลย/.test(problemsText()));
    A.eq('2.4 no weight was measured today: the weight box is empty, not 0', box('weightG').value, '');

    // PDPA minimisation: nothing in this form can hold a name or a note.
    const inputs = $$('input, textarea, select', modal());
    A.eq('2.5 no textarea anywhere', $$('textarea', modal()).length, 0);
    A.ok('2.6 every text box is a number box (inputmode numeric/decimal)',
      inputs.filter(i => i.tagName === 'INPUT' && i.type === 'text').every(i => /^(decimal|numeric)$/.test(i.getAttribute('inputmode'))));
    A.eq('2.7 the only other input is the date', inputs.filter(i => i.tagName === 'INPUT' && i.type !== 'text').map(i => i.type), ['date']);
    const feedOptions = $$('option', box('feed')).map(o => o.value);
    A.eq('2.8 the feed is picked from the formulary (+ several), never typed',
      feedOptions, ['', ...Object.keys(t.D().EN_DB), 'MIXED']);
    await t.typeInto(box('ivInMl'), 'abc');
    A.eq('2.9 letters never reach a box', box('ivInMl').value, '');
    await t.typeInto(box('ivInMl'), '12.5.3');
    A.eq('2.10 …nor a second decimal point', box('ivInMl').value, '12.53');
    await t.typeInto(box('ivInMl'), '');

    // Blank is not 0.
    await t.typeInto(box('urineMl'), '0');
    A.ok('2.11 a typed 0 is an entry: Save is enabled', saveBtn() && !saveBtn().disabled);
    await t.click(saveBtn()); await t.flush();
    const s1 = submitted[0] || {};
    A.eq('2.12 THE PAYLOAD: the typed 0 is 0, every blank is null',
      s1.entry && { iv: s1.entry.ivInMl, en: s1.entry.enInMl, urine: s1.entry.urineMl, drain: s1.entry.drainMl, stool: s1.entry.stoolCount },
      { iv: null, en: null, urine: 0, drain: null, stool: null });
    A.eq('2.13 …dated today, no feed chosen', s1.entry && [s1.entry.ts, s1.entry.feedType], [today, '']);
    A.ok('2.14 …stamped with the app version, as an order is', s1.entry && typeof s1.entry.appVersion === 'string' && s1.entry.appVersion.length > 0);
    A.eq('2.15 …no weight typed: none sent', s1.weightG, null);
    A.eq('2.16 …the DOL of the date (admitted 10 days ago → DOL 11)', s1.dol, 11);
    A.eq('2.17 …and a new record is not an edit', s1.record, null);
    A.eq('2.18 a saved form closes', closed, 1);

    // The ward's bounds.
    submitted = []; closed = 0;
    await open();
    await t.typeInto(box('ivInMl'), '3001');
    A.ok('2.19 3001 mL is refused', /IV เข้า ต้องอยู่ระหว่าง 0–3000 mL/.test(problemsText()) && saveBtn().disabled);
    await t.typeInto(box('ivInMl'), '3000');
    A.ok('2.20 3000 mL is accepted', !problemsText() && !saveBtn().disabled);
    await t.typeInto(box('stoolCount'), '2.5');
    A.eq('2.21 the stool count takes whole numbers only (2.5 → 25)', box('stoolCount').value, '25');
    A.ok('2.22 …and 25 is past the ward\'s 20', /อุจจาระ 0–20 ครั้ง/.test(problemsText()));
    await t.typeInto(box('stoolCount'), '3');
    await t.typeInto(box('weightG'), '150');
    A.ok('2.23 a 150 g weight is refused', /น้ำหนัก 200–8000 g/.test(problemsText()));
    await t.typeInto(box('weightG'), '');
    await t.typeInto(box('date'), day(1));
    A.ok('2.24 tomorrow is refused', /วันที่ต้องไม่เกินวันนี้/.test(problemsText()));
    await t.typeInto(box('date'), day(-11));
    A.ok('2.25 …and so is a date before admission', /วันที่ต้องไม่ก่อนวันรับเข้า/.test(problemsText()));
    A.eq('2.26 the date picker is bounded the same way', [box('date').getAttribute('min'), box('date').getAttribute('max')], [day(-10), today]);

    // The measured weight is offered; a weight alone is a save.
    await open();
    await t.typeInto(box('date'), day(-1));
    A.eq('2.27 yesterday (DOL 10) was weighed: the box offers 1050', box('weightG').value, '1050');
    A.ok('2.28 …and says it is already recorded', /บันทึกไว้แล้ว 1050 g/.test(modal().textContent));
    await t.typeInto(box('date'), today);
    A.eq('2.29 back to today: the offer goes with the date', box('weightG').value, '');
    await t.typeInto(box('weightG'), '1080');
    A.ok('2.30 a weight alone can be saved', !saveBtn().disabled);
    await t.typeInto(box('date'), day(-1));
    A.eq('2.31 a TYPED weight stays when the date moves', box('weightG').value, '1080');
    await t.typeInto(box('date'), today);
    await t.click(saveBtn()); await t.flush();
    A.eq('2.32 weight only: no I/O row is sent, the weight is', [submitted[0] && submitted[0].entry, submitted[0] && submitted[0].weightG], [null, 1080]);

    // An unchanged measured weight is not re-sent.
    submitted = [];
    await open();
    await t.typeInto(box('date'), day(-1));
    await t.typeInto(box('enInMl'), '40');
    await t.click(saveBtn()); await t.flush();
    A.eq('2.33 the offered 1050 g, untouched, is not sent again', submitted[0] && submitted[0].weightG, null);

    // The server's refusal is shown in the form, which stays open.
    submitted = []; closed = 0; reply = { ok: false, error: 'บันทึกไม่สำเร็จ: ทดสอบ' };
    await open();
    await t.typeInto(box('drainMl'), '5');
    await t.click(saveBtn()); await t.flush();
    A.ok('2.34 a refusal is shown in place', /บันทึกไม่สำเร็จ: ทดสอบ/.test(modal().textContent));
    A.eq('2.35 …the form stays open', closed, 0);
    A.eq('2.36 …with what was typed', box('drainMl').value, '5');
    A.ok('2.37 …and Save works again', saveBtn() && !saveBtn().disabled);

    // A stray tap outside a form with typing in it does not close it.
    await t.click($('.picker-backdrop'));
    A.eq('2.38 THE DEFECT GUARDED: a tap outside a typed form keeps it', closed, 0);
    await t.click($$('button', modal()).find(b => b.textContent.trim() === 'ยกเลิก'));
    A.eq('2.39 Cancel always closes', closed, 1);
    closed = 0; reply = { ok: true };
    await open();
    await t.click($('.picker-backdrop'));
    A.eq('2.40 an untouched form closes on a tap outside', closed, 1);

    // Editing a record.
    submitted = []; closed = 0;
    const rec = { ts: day(-1), entryId: 'srv-1', ivInMl: 100, enInMl: null, feedType: 'BM_20', urineMl: 50,
      drainMl: 0, stoolCount: 2, lastModified: 'lm-1', lastModifiedBy: 'n@test.th' };
    await open(rec);
    A.ok('2.41 editing: the date is fixed', box('date').disabled && box('date').value === day(-1));
    A.eq('2.42 …every figure comes back as recorded, the blank one blank',
      ['ivInMl', 'enInMl', 'urineMl', 'drainMl', 'stoolCount'].map(k => box(k).value), ['100', '', '50', '0', '2']);
    A.eq('2.43 …and the feed', box('feed').value, 'BM_20');
    for (const k of ['ivInMl', 'urineMl', 'drainMl', 'stoolCount']) await t.typeInto(box(k), '');
    A.ok('2.44 an edit cannot empty the record (deleting is admin\'s)', /ต้องมีอย่างน้อยหนึ่งค่า/.test(problemsText()) && saveBtn().disabled);
    await t.typeInto(box('urineMl'), '55');
    await t.click(saveBtn()); await t.flush();
    const s2 = submitted[0] || {};
    A.eq('2.45 the edit is sent against the record it opened', s2.record && s2.record.entryId, 'srv-1');
    A.eq('2.46 …with its own date', s2.entry && s2.entry.ts, day(-1));
    A.eq('2.47 …and the emptied boxes as null', s2.entry && [s2.entry.ivInMl, s2.entry.urineMl, s2.entry.drainMl], [null, 55, null]);
    // PDPA: nothing typed here is left on a shared ward PC (no key for
    // endSession's logout list to miss).
    A.eq('2.48 the form keeps nothing in browser storage', [Object.keys(localStorage), Object.keys(sessionStorage)], [[], []]);
  },

  // ═══════════════════════════════════════════════════════════════════════
  async card(A) {
    console.log('\n── §3 The Dashboard card ──');
    const t = boot({ session: null });
    t.quiet();
    const { D, today, day, patient } = fixture(t);
    const P = probe(t);
    const Card = t.window.NursingIOCard;
    A.ok('3.0 NursingIOCard exists', typeof Card === 'function');
    const opened = [], deleted = [];
    const render = (records, withDelete = false) => P.render(t.React.createElement(Card, {
      patient, records, onOpen: (r) => opened.push(r), ...(withDelete ? { onDelete: (r) => deleted.push(r) } : {}),
    }));

    await render([]);
    A.ok('3.1 no record today: the badge says so', /วันนี้ยังไม่ได้บันทึก/.test($('.nio-head').textContent));
    A.ok('3.2 …and not in the "logged" colour', !$('.nio-head .log-badge').classList.contains('is-logged'));
    A.eq('3.3 …the button records a new day', $('.nio-add').textContent.trim(), 'บันทึก I/O');
    A.ok('3.4 …and an empty list says what to do', /ยังไม่มีบันทึก I\/O/.test($('.nio-empty').textContent));
    await t.click($('.nio-add'));
    A.eq('3.5 the button opens a NEW record (null)', opened.pop(), null);

    // Nine days, today included; urine on today's divisor: yesterday's 1050 g.
    const recs = D.normalizeNursingMap({ X: [
      ...Array.from({ length: 8 }, (_, i) => ({ ts: day(-(i + 1)), entryId: 'r' + (i + 1), ivInMl: 50, enInMl: 50, urineMl: 30, drainMl: null, stoolCount: 1, lastModifiedBy: 'n@test.th' })),
      { ts: today, entryId: 'r0', ivInMl: 100, enInMl: 60, feedType: 'BM_20', urineMl: 63, drainMl: 10.4, stoolCount: 0, lastModifiedBy: 'nurse.one@test.th' },
    ] }).X;
    // One day with nothing but a stool count, and one with IV 0.
    recs[2] = { ...recs[2], ivInMl: null, enInMl: null, urineMl: null };
    recs[3] = { ...recs[3], ivInMl: 0, enInMl: null };
    // Sums of typed decimals: 0.3 − 0.1 − 0.1 is 0.09999999999999998 in floating point.
    recs[5] = { ...recs[5], ivInMl: 0.1, enInMl: 0.2, urineMl: 0.1, drainMl: 0.1 };
    await render(recs, false);
    A.ok('3.6 today is in: the badge says so, in the logged colour',
      /✓ วันนี้บันทึกแล้ว/.test($('.nio-head').textContent) && $('.nio-head .log-badge').classList.contains('is-logged'));
    A.eq('3.7 …and the button edits today', $('.nio-add').textContent.trim(), 'แก้ไข I/O วันนี้');
    await t.click($('.nio-add'));
    A.eq('3.8 …opening today\'s record', (opened.pop() || {}).entryId, 'r0');
    const rows = $$('.nio-row');
    A.eq('3.9 the last seven days, newest first', rows.map(r => r.querySelector('.nio-date strong').textContent),
      [0, 1, 2, 3, 4, 5, 6].map(i => day(-i)));
    A.ok('3.10 …and the rest are counted, not hidden', /แสดง 7 วันล่าสุด จาก 9 วัน/.test($('.nio-more').textContent));
    const vals = (i) => $$('.nio-vals span', rows[i]).map(s => s.textContent);
    A.eq('3.11 today: in 160 (feed named), urine 63 = 2.5 mL/kg/h on yesterday\'s 1050 g, drain, balance, stool 0',
      vals(0), ['เข้า 160 (Breast Milk (20 kcal/oz, mature))', 'ปัสสาวะ 63 · 2.5 mL/kg/h', 'Drain 10.4', 'Bal +86.6', 'อุจจาระ 0']);
    A.eq('3.12 a day with nothing but a stool count shows "—", never 0',
      vals(2), ['เข้า —', 'ปัสสาวะ —', 'Drain —', 'Bal —', 'อุจจาระ 1']);
    A.ok('3.13 a recorded IV of 0 reads 0', vals(3)[0] === 'เข้า 0');
    A.eq('3.13b sums are to 0.1 mL, never 0.09999999999999998', [vals(5)[0], vals(5)[3]], ['เข้า 0.3', 'Bal +0.1']);
    A.eq('3.14 who saved it, without the domain', $('.nio-who', rows[0]).textContent.trim(), 'nurse.one');
    A.eq('3.15 DOL beside each date', $('.nio-dol', rows[0]).textContent, 'DOL 11');
    await t.click(rows[4]);
    A.eq('3.16 a row opens its own record', (opened.pop() || {}).entryId, 'r4');
    await t.act(async () => { rows[5].dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await t.flush();
    A.eq('3.17 …from the keyboard too', (opened.pop() || {}).entryId, 'r5');
    A.eq('3.18 no onDelete: no delete button', $$('.nio-del').length, 0);

    await render([{ ...recs[0] }, { ...recs[1], entryId: 'tmp_123' }], true);
    const del = $$('.nio-del');
    A.eq('3.19 with onDelete: one per saved row, none on a provisional (tmp_) row', del.length, 1);
    await t.click(del[0]);
    A.eq('3.20 delete asks, then deletes that row', (deleted.pop() || {}).entryId, 'r0');
    A.eq('3.21 …without also opening it', opened.length, 0);

    // The DailyLog shows the card only when handed records.
    const DL = t.window.DailyLog;
    await P.render(t.React.createElement(DL, { patient, log: {}, dol: 11, onAddToday() {}, onEditEntry() {}, nursing: null, onSaveNursing() {} }));
    A.eq('3.22 DailyLog without nursing records (backend not serving them): no card', $$('.nursing-io').length, 0);
    await P.render(t.React.createElement(DL, { patient, log: {}, dol: 11, onAddToday() {}, onEditEntry() {}, nursing: [], onSaveNursing() {} }));
    A.eq('3.23 …with a list, even an empty one: the card', $$('.nursing-io').length, 1);
    await t.click($('.nio-add'));
    A.ok('3.24 …and its button opens the form', !!modal());
  },

  // ═══════════════════════════════════════════════════════════════════════
  async 'calc-prefill'(A) {
    console.log('\n── §4 D4: a new order starts from the nurses\' totals ──');
    const t = boot({ session: null });
    t.quiet();
    global.showToast = () => {};
    const { today, day, patient } = fixture(t);
    const P = probe(t);
    const rec = { ts: today, entryId: 'srv-1', ivInMl: 100, enInMl: 60, feedType: 'BM_20', urineMl: 0, drainMl: null,
      stoolCount: 1, lastModified: 'lm-1', lastModifiedBy: 'n@test.th' };
    const calc = (props) => P.render(t.React.createElement(t.window.Calculator, {
      patient, dol: 11, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null,
      userLabel: 'Dr Test', userEmail: 'dr@test.th',
      onLog: () => Promise.resolve({ ok: true, entryId: 'e-1', lastModified: 'lm' }), onUpdate() {}, onSaved() {}, onWeightChange() {},
      nursing: [], ...props,
    }));
    const val = (label) => (calcField(t, label) || {}).value;
    const reset = async () => { await P.render(null); localStorage.clear(); };

    // What Input reads with no nursing record: the prescribed total it tracks.
    await reset();
    await calc({ nursing: [] });
    const prescribed = val('Input');
    A.ok('4.0 fixture: with no record, Input tracks the prescribed total (blank: nothing prescribed yet)', prescribed !== '160', prescribed);

    await reset();
    await calc({ nursing: [rec] });
    A.eq('4.1 Input = IV + enteral actually received (100 + 60)', val('Input'), '160');
    A.eq('4.2 a urine output the nurses recorded as 0 is shown as 0 …', val('Urine output'), '0');
    A.ok('4.3 …and counts as entered', !/Urine output/.test(missingText()) && !/Input/.test(missingText()), missingText());
    A.eq('4.4 a drain they left blank stays blank …', val('Drain content'), '');
    A.ok('4.5 …and the gate still asks for it', /Drain content/.test(missingText()), missingText());
    const note = $('.nursing-prefill-note');
    A.ok('4.6 the card says where the figures came from, and which', !!note && /เติมจากบันทึกพยาบาล/.test(note.textContent) && /\(Input · Urine\)/.test(note.textContent));
    A.eq('4.7 THE DEFECT GUARDED: opening a prefilled form writes no draft', draftKeys(), []);
    await t.typeInto(calcField(t, 'Target fluid'), '170');
    A.eq('4.8 Input does not go back to tracking the prescribed total', val('Input'), '160');
    await t.typeInto(calcField(t, 'Drain content'), '3');
    A.eq('4.9 …while typing is still typing: a draft is kept', draftKeys().length, 1);
    await t.typeInto(calcField(t, 'Urine output'), '12');
    A.eq('4.10 every prefilled figure is editable', val('Urine output'), '12');
    // Left and reopened: the record fills the form again and the draft is
    // offered. Restoring it restores what was TYPED — and the note must stop
    // claiming the figures are the nurses'.
    await P.render(null);
    await calc({ nursing: [rec] });
    A.ok('4.10a reopened: the record fills the form again, and the draft is offered',
      !!$('.nursing-prefill-note') && hasButton(/^กู้คืน$/));
    await t.click($$('button').find(b => b.textContent.trim() === 'กู้คืน'));
    A.eq('4.10b restoring the draft brings back what was typed', [val('Urine output'), val('Drain content')], ['12', '3']);
    A.ok('4.10c …and the note no longer claims the nurses\' record; the record is offered instead',
      !$('.nursing-prefill-note') && !!$('.nursing-prefill-apply'));

    await reset();
    await calc({ nursing: [{ ...rec, ts: day(-1) }] });
    A.ok('4.11 a record for another date is not used', !$('.nursing-prefill-note') && val('Input') === prescribed);
    A.ok('4.12 …nor offered', !$('.nursing-prefill-apply'));

    await reset();
    const saved = { ts: today, entryId: 'e-9', dol: 11, weight: 1050, status: 'submitted', lastModified: 'lm-9',
      ioInput: 111, ioOutput: 22, drainContent: 3, calcInput: { curWtG: 1050, fluidTargetPerKg: 150 } };
    await calc({ nursing: [rec], editEntry: saved });
    A.eq('4.13 a SAVED order keeps its own figures', [val('Input'), val('Urine output'), val('Drain content')], ['111', '22', '3']);
    A.ok('4.14 …and is offered nothing', !$('.nursing-prefill-note') && !$('.nursing-prefill-apply'));

    // Arrives after the form opened: offered, not forced.
    await reset();
    await calc({ nursing: [] });
    await calc({ nursing: [rec] });
    A.eq('4.15 a record arriving later does not change the form by itself', val('Input'), prescribed);
    const apply = $('.nursing-prefill-apply');
    A.ok('4.16 …it is offered', !!apply && /ใช้ยอด I\/O จากบันทึกพยาบาล/.test(apply.textContent));
    await t.click(apply);
    A.eq('4.17 …and one tap takes it', [val('Input'), val('Urine output')], ['160', '0']);
    A.ok('4.18 …with the same note', !!$('.nursing-prefill-note'));

    // Corrected after the form took it.
    await calc({ nursing: [{ ...rec, urineMl: 40, lastModified: 'lm-2' }] });
    const changed = $('.nursing-prefill-changed');
    A.ok('4.19 a record corrected after the prefill is flagged', !!changed && /พยาบาลแก้ยอด I\/O นี้หลังเติมแล้ว/.test(changed.textContent));
    A.eq('4.20 …and not swapped in silently', val('Urine output'), '0');
    await t.click($$('button', changed).find(b => /ใช้ยอดล่าสุด/.test(b.textContent)));
    A.eq('4.21 one tap takes the correction', val('Urine output'), '40');
    A.ok('4.22 …and the flag goes', !$('.nursing-prefill-changed'));
    await calc({ nursing: [{ ...rec, urineMl: 40, lastModified: 'lm-3', lastModifiedBy: 'x@test.th' }] });
    A.ok('4.23 a new stamp with the same figures is not a change', !$('.nursing-prefill-changed'));

    // Deleted after the form took it.
    await calc({ nursing: [] });
    const gone = $('.nursing-prefill-changed');
    A.ok('4.24 a record deleted after the prefill is flagged', !!gone && /ถูกลบแล้ว/.test(gone.textContent));
    await t.click($$('button', gone).find(b => /ล้างยอดที่เติมไว้/.test(b.textContent)));
    A.eq('4.25 one tap clears what it filled: urine blank again', val('Urine output'), '');
    A.ok('4.26 …the gate asks for it again', /Urine output/.test(missingText()), missingText());
    A.eq('4.27 …Input tracks the prescribed total again', val('Input'), prescribed);
    A.ok('4.28 …and the note goes', !$('.nursing-prefill-note') && !$('.nursing-prefill-changed'));

    // A stool-count-only record has nothing to take.
    await reset();
    await calc({ nursing: [] });
    await calc({ nursing: [{ ...rec, ivInMl: null, enInMl: null, urineMl: null, drainMl: null }] });
    A.ok('4.29 a record with no I/O figure is not offered', !$('.nursing-prefill-apply'));

    // Center Point and the quick calc record no I/O at all.
    await reset();
    await calc({ nursing: [rec], centerPoint: true });
    A.ok('4.30 Center Point: no prefill, no offer', !$('.nursing-prefill-note') && !$('.nursing-prefill-apply'));
    await reset();
    await calc({ nursing: [rec], scratch: true, patient: null });
    A.ok('4.31 quick calc: no prefill, no offer', !$('.nursing-prefill-note') && !$('.nursing-prefill-apply'));
  },

  // ═══════════════════════════════════════════════════════════════════════
  async 'calc-nurse'(A) {
    console.log('\n── §5 D5: a nurse computes, a prescriber saves ──');
    const t = boot({ session: null });
    t.quiet();
    const toasts = [];
    global.showToast = (m) => toasts.push(m);
    const { today, patient } = fixture(t);
    const P = probe(t);
    const calc = (props) => P.render(t.React.createElement(t.window.Calculator, {
      patient, dol: 11, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null,
      userLabel: 'Nurse N', userEmail: 'n@test.th',
      onLog: () => { throw new Error('a nurse\'s form must never save'); }, onUpdate() {}, onSaved() {}, onWeightChange() {},
      nursing: [{ ts: today, entryId: 's', ivInMl: 90, enInMl: 30, urineMl: 25, drainMl: 0, lastModified: 'l' }], ...props,
    }));

    await calc({ ordersReadOnly: false });
    A.ok('5.1 control: a prescriber\'s form has Submit and Save draft', hasButton(/^Submit$/) && !!$('.save-draft'));
    await P.render(null); localStorage.clear();

    await calc({ ordersReadOnly: true });
    A.ok('5.2 a nurse\'s form has no Submit', !hasButton(/^Submit$/));
    A.ok('5.3 …no Save draft', !$('.save-draft'));
    A.ok('5.4 …and says why, where they were', /พยาบาล: ใช้ Calculator คำนวณได้ — บันทึกและ Submit ใบสั่งทำโดยแพทย์/.test(($('.nurse-readonly-note') || {}).textContent || ''));
    A.eq('5.5 …no "ยังกรอกไม่ครบ" list for a form nobody here can save', missingText(), '');
    A.eq('5.6 the nurses\' totals still fill the calculator', (calcField(t, 'Input') || {}).value, '120');
    await t.typeInto(calcField(t, 'Target fluid'), '165');
    await t.typeInto(calcField(t, 'Other IV'), '2');
    A.eq('5.7 typing keeps no unsaved order in browser storage', draftKeys(), []);
    const copy = $$('button').find(b => /Copy Order to Clipboard/.test(b.textContent));
    await t.click(copy);
    A.ok('5.8 Copy explains that only a saved order is copied', toasts.some(m => /คัดลอกได้เฉพาะคำสั่งที่แพทย์บันทึกแล้ว/.test(m)), toasts);
  },

  // ═══════════════════════════════════════════════════════════════════════
  async 'app-before-deploy'(A) {
    console.log('\n── §6a Before the backend serves nursing: nothing changes ──');
    const t = boot({ session: NURSE });
    t.quiet();
    nursingBackend(t, { serve: false });
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/);
    A.ok('6a.1 the nurse is on the Dashboard', /Daily nutritional log/.test(t.text()));
    A.eq('6a.2 no I/O card while the backend has no Nursing_Log', $$('.nursing-io').length, 0);
    A.ok('6a.3 a nurse still starts an order (New log), as today', !!t.btn(/New log/));
    await t.rail(/Calculator/);
    A.ok('6a.4 …and the Calculator still offers Submit', hasButton(/^Submit$/));
    A.eq('6a.5 …with no read-only note', $$('.nurse-readonly-note').length, 0);
  },

  async 'app-nurse'(A) {
    console.log('\n── §6b After: the nurse\'s card, and no more order writes ──');
    const t = boot({ session: NURSE });
    t.quiet();
    const D = t.D();
    const today = D.todayLocal();
    nursingBackend(t, { serve: true });
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/);
    A.eq('6b.1 the Dashboard carries the I/O card', $$('.nursing-io').length, 1);
    A.ok('6b.2 a nurse has no New log (it opens a new ORDER)', !t.btn(/New log/));
    A.ok('6b.3 the card says today is not in yet', /วันนี้ยังไม่ได้บันทึก/.test($('.nio-head').textContent));

    await t.click($('.nio-add'));
    const S = t.server;
    await t.typeInto(t.fieldInput('น้ำหนัก', modal()), '1080');
    await t.typeInto(t.fieldInput('IV เข้า', modal()), '100');
    await t.typeInto(t.fieldInput('นม/EN เข้า', modal()), '60');
    await t.selectVal(t.fieldInput('ชนิดนม', modal()), 'BM_20');
    await t.typeInto(t.fieldInput('ปัสสาวะ', modal()), '0');
    await t.typeInto(t.fieldInput('อุจจาระ', modal()), '2');
    await t.click(saveBtn()); await t.flush(); await t.flush();
    const call = t.callsOf('logNursingEntry')[0];
    A.ok('6b.4 Save sends logNursingEntry', !!call);
    A.eq('6b.5 …for this infant, today', call && [call.sessionId, call.entry.ts], ['AA-BW900', today]);
    A.eq('6b.6 …the typed 0 as 0 and the untouched drain as null',
      call && [call.entry.ivInMl, call.entry.enInMl, call.entry.urineMl, call.entry.drainMl, call.entry.stoolCount, call.entry.feedType],
      [100, 60, 0, null, 2, 'BM_20']);
    A.ok('6b.7 …and no weight inside the I/O row (one weight store)', call && !('weightG' in call.entry) && !('weight' in call.entry));
    const wcall = t.callsOf('updateWeights')[0];
    const dolToday = D.dolAtDate(S.patients[0], today);
    A.ok('6b.8 the weight goes through updateWeights, as the growth chart\'s does',
      !!wcall && wcall.weights.some(w => w.dol === dolToday && w.w === 1080));
    A.ok('6b.9 …after the I/O row landed', t.server.calls.findIndex(c => c.action === 'updateWeights') > t.server.calls.findIndex(c => c.action === 'logNursingEntry'));
    A.eq('6b.10 …keeping the admission weight', wcall && wcall.weights.find(w => w.dol === 1), { dol: 1, w: 900, l: null, hc: null });
    A.ok('6b.11 the form closed and the card says today is in', !modal() && /✓ วันนี้บันทึกแล้ว/.test($('.nio-head').textContent));
    A.ok('6b.12 …listing the saved figures', /เข้า 160/.test($('.nio-row').textContent) && /Drain —/.test($('.nio-row').textContent));
    A.eq('6b.13 the row carries the server\'s id, not the provisional one', (S.nursing['AA-BW900'] || [])[0]?.entryId, 'srv-n1');

    await t.rail(/Calculator/);
    A.ok('6b.14 the nurse\'s Calculator has no Submit', !hasButton(/^Submit$/) && !$('.save-draft'));
    A.eq('6b.15 …it says why', $$('.nurse-readonly-note').length, 1);
    A.eq('6b.16 …and today\'s figures are already in it', [t.fieldInput('Input')?.value, t.fieldInput('Urine output')?.value], ['160', '0']);
    A.eq('6b.17 no order write was ever sent', t.callsOf('logDailyNutrition').length + t.callsOf('updateDailyNutrition').length, 0);
    A.eq('6b.18 …and no edit lock taken', t.callsOf('acquireLock').length + t.callsOf('lockDailyLog').length, 0);

    // A DuplicateDate. Today's row goes from the server (an admin deleted it)
    // and this device syncs; then another device records today before this
    // one saves.
    S.nursing['AA-BW900'] = [];
    await t.rail(/Dashboard/);
    await t.click(t.syncButton()); await t.flush(); await t.flush();
    A.ok('6b.19 after a sync without today, the card offers a new record', /วันนี้ยังไม่ได้บันทึก/.test($('.nio-head').textContent));
    S.nursing['AA-BW900'].push({ ts: today, entryId: 'srv-race', ivInMl: 70, enInMl: null, urineMl: 20, drainMl: null,
      stoolCount: null, feedType: '', lastModified: 'lm-r', enteredBy: 'x@test.th', lastModifiedBy: 'x@test.th' });
    await t.click($('.nio-add'));
    await t.typeInto(t.fieldInput('ปัสสาวะ', modal()), '15');
    const syncsBeforeDup = t.syncCalls().length;
    await t.click(saveBtn()); await t.flush(); await t.flush();
    A.ok('6b.20 a DuplicateDate is said in the form, which stays open', !!modal() && /มีบันทึก I\/O ของวันที่นี้แล้ว/.test(modal().textContent));
    A.ok('6b.21 …and re-syncs', t.syncCalls().length > syncsBeforeDup);
    A.eq('6b.22 …leaving no provisional row behind', $$('.nio-row').filter(r => /ปัสสาวะ 15/.test(r.textContent)).length, 0);
    await t.click($$('button', modal()).find(b => b.textContent.trim() === 'ยกเลิก'));
    A.ok('6b.23 the other device\'s record is listed, to open and correct', $$('.nio-row').some(r => /ปัสสาวะ 20/.test(r.textContent)));
    A.eq('6b.24 …and the server holds one row for the date', S.nursing['AA-BW900'].filter(r => r.ts === today).length, 1);
  },

  async 'app-conflict'(A) {
    console.log('\n── §6c An edit made on another device is a conflict ──');
    const t = boot({ session: NURSE });
    t.quiet();
    const today = t.D().todayLocal();
    nursingBackend(t, { serve: true, nursing: { 'AA-BW900': [{ ts: today, entryId: 'srv-1', ivInMl: 100, enInMl: null,
      urineMl: 30, drainMl: null, stoolCount: null, feedType: '', lastModified: 'lm-1', enteredBy: 'n@test.th', lastModifiedBy: 'n@test.th' }] } });
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/);
    A.ok('6c.1 today\'s record is listed', /ปัสสาวะ 30/.test($('.nio-row').textContent));
    // Another device corrects it.
    Object.assign(t.server.nursing['AA-BW900'][0], { urineMl: 35, lastModified: 'lm-2', lastModifiedBy: 'x@test.th' });
    await t.click($('.nio-row'));
    await t.typeInto(t.fieldInput('IV เข้า', modal()), '110');
    await t.click(saveBtn()); await t.flush(); await t.flush();
    const call = t.callsOf('updateNursingEntry')[0];
    A.eq('6c.2 the edit is sent against the stamp this device read', call && [call.entryId, call.expectedLastModified], ['srv-1', 'lm-1']);
    A.ok('6c.3 the conflict is said in the form, naming who', !!modal() && /ถูกแก้จากอีกเครื่อง \(x@test\.th\)/.test(modal().textContent));
    A.eq('6c.4 …and the server row is not overwritten', t.server.nursing['AA-BW900'][0].ivInMl, 100);
    await t.click($$('button', modal()).find(b => b.textContent.trim() === 'ยกเลิก'));
    A.ok('6c.5 the re-sync shows the other device\'s figure', /ปัสสาวะ 35/.test($('.nio-row').textContent));
    await t.click($('.nio-row'));
    A.eq('6c.6 reopened: the form holds the current figures', t.fieldInput('ปัสสาวะ', modal()).value, '35');
    await t.typeInto(t.fieldInput('IV เข้า', modal()), '110');
    await t.click(saveBtn()); await t.flush();
    A.eq('6c.7 …and now the edit lands', t.server.nursing['AA-BW900'][0].ivInMl, 110);
    A.ok('6c.8 …and the card shows it', !modal() && /เข้า 110/.test($('.nio-row').textContent));
  },

  async 'app-doctor'(A) {
    console.log('\n── §6d A doctor keeps order writes ──');
    const t = boot({ session: DOCTOR });
    t.quiet();
    const today = t.D().todayLocal();
    nursingBackend(t, { serve: true, nursing: { 'AA-BW900': [{ ts: today, entryId: 'srv-1', ivInMl: 100, enInMl: null,
      urineMl: 30, drainMl: null, stoolCount: null, feedType: '', lastModified: 'lm-1', enteredBy: 'n@test.th', lastModifiedBy: 'n@test.th' }] } });
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/);
    A.eq('6d.1 a doctor sees the card', $$('.nursing-io').length, 1);
    A.ok('6d.2 …keeps New log', !!t.btn(/New log/));
    A.eq('6d.3 …and has no delete button in it (admin only)', $$('.nio-del').length, 0);
    await t.rail(/Calculator/);
    A.ok('6d.4 the doctor\'s Calculator has Submit', hasButton(/^Submit$/));
    A.eq('6d.5 …and no read-only note', $$('.nurse-readonly-note').length, 0);
    A.eq('6d.6 …and today\'s nursing totals in Intake/Output', [t.fieldInput('Input')?.value, t.fieldInput('Urine output')?.value], ['100', '30']);
  },

  async 'app-switch'(A) {
    console.log('\n── §6e The go-live switch, both ways, on the next sync ──');
    const t = boot({ session: NURSE });
    t.quiet();
    nursingBackend(t, { serve: true });
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/);
    A.ok('6e.1 on: the card, and no New log for a nurse', $$('.nursing-io').length === 1 && !t.btn(/New log/));
    // Pp switches it off (NURSING_LOG_ENABLED removed): the next sync has no `nursing`.
    t.server.serveNursing = false;
    await t.click(t.syncButton()); await t.flush(); await t.flush();
    A.eq('6e.2 off: the card goes on the next sync', $$('.nursing-io').length, 0);
    A.ok('6e.3 …New log comes back', !!t.btn(/New log/));
    await t.rail(/Calculator/);
    A.ok('6e.4 …and so does Submit, which the server now accepts again', hasButton(/^Submit$/) && !$('.nurse-readonly-note'));
    t.server.serveNursing = true;
    await t.click(t.syncButton()); await t.flush(); await t.flush();
    A.ok('6e.5 on again: Submit goes on the next sync', !hasButton(/^Submit$/) && !!$('.nurse-readonly-note'));
  },

  async 'app-admin'(A) {
    console.log('\n── §6d An admin deletes ──');
    const t = boot({ session: ADMIN });
    t.quiet();
    const today = t.D().todayLocal();
    nursingBackend(t, { serve: true, nursing: { 'AA-BW900': [{ ts: today, entryId: 'srv-1', ivInMl: 100, enInMl: null,
      urineMl: 30, drainMl: null, stoolCount: null, feedType: '', lastModified: 'lm-1', enteredBy: 'n@test.th', lastModifiedBy: 'n@test.th' }] } });
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/);
    A.eq('6d.9 an admin sees the card', $$('.nursing-io').length, 1);
    A.ok('6d.10 …can record (D3: admin does everything)', !!$('.nio-add'));
    const del = $$('.nio-del');
    A.eq('6d.11 …and has the delete button', del.length, 1);
    await t.click(del[0]); await t.flush();
    const call = t.callsOf('deleteNursingEntry')[0];
    A.eq('6d.12 delete sends deleteNursingEntry for that row', call && [call.sessionId, call.entryId], ['AA-BW900', 'srv-1']);
    A.eq('6d.13 …and the row is gone', $$('.nio-row').length, 0);
    A.eq('6d.14 …on the server too', (t.server.nursing['AA-BW900'] || []).length, 0);
  },

  async 'app-weight-blocked'(A) {
    console.log('\n── §6f The I/O landed, the weight could not be sent: the form still closes ──');
    const t = boot({ session: ADMIN });
    t.quiet();
    const D = t.D();
    const today = D.todayLocal();
    nursingBackend(t, { serve: true, nursing: { 'AA-BW900': [{ ts: D.addDaysToDateStr(today, -1), entryId: 'srv-y', ivInMl: 50,
      enInMl: null, urineMl: 20, drainMl: null, stoolCount: null, feedType: '', lastModified: 'lm-y', enteredBy: 'n@test.th', lastModifiedBy: 'n@test.th' }] } });
    await t.start();
    await t.pickWard('NICU'); await t.openPatientRow(/AA/);
    const S = t.server;
    let release;
    const gate = new Promise(r => { release = r; });
    const normal = S.hooks.logNursingEntry;
    S.hooks.logNursingEntry = (body) => ({ hold: gate, respond: () => normal(body).reply });
    S.hooks.deleteNursingEntry = () => ({ network: true });
    await t.click($('.nio-add'));
    await t.typeInto(t.fieldInput('ปัสสาวะ', modal()), '25');
    await t.typeInto(t.fieldInput('น้ำหนัก', modal()), '1111');
    await t.click(saveBtn());                 // the I/O row is in flight, held
    // Meanwhile another write's result becomes unknown: a delete on flaky Wi-Fi.
    await t.click($$('.nio-del')[0]);
    A.ok('fixture: the delete went out and its result is unknown', t.callsOf('deleteNursingEntry').length === 1);
    await t.act(async () => { release(); });
    await t.flush(); await t.flush();
    A.eq('6f.1 the I/O row was sent once', t.callsOf('logNursingEntry').length, 1);
    A.eq('6f.2 the weight was not sent while an earlier write\'s result is unknown', t.callsOf('updateWeights').length, 0);
    A.ok('6f.3 the form closed anyway — a second Save would be a second record for the date', !modal());
    A.ok('6f.4 …and says the weight is the one thing to re-type',
      t.toasts().some(m => /บันทึก I\/O แล้ว แต่ยังบันทึกน้ำหนักไม่ได้/.test(m)), t.toasts());
  },

  // ═══════════════════════════════════════════════════════════════════════
  async layout(A) {
    console.log('\n── §7 Both shells; real Chromium: no sideways scroll, 44 px targets ──');
    const shell = fs.readFileSync(DIR + 'NeoFeed.html', 'utf8');
    A.ok('7.1 the two shells are byte-identical', shell === fs.readFileSync(DIR + 'index.html', 'utf8'));
    A.ok('7.2 a row is a 44 px target', /\.nio-row \{[^}]*min-height: 44px/.test(shell));
    A.ok('7.3 …so is the delete button, on a desktop too (.btn.sm is 32 px there)', /\.btn\.nio-del \{[^}]*min-width: 44px; min-height: 44px/.test(shell));
    A.ok('7.4 …and the form\'s close button', /\.nursing-modal \.picker-h \.icon-btn \{[^}]*width: 44px; height: 44px/.test(shell));
    A.ok('7.5 figures wrap rather than widen the page', /\.nio-vals \{[^}]*overflow-wrap: anywhere/.test(shell));
    A.ok('7.6 a phone puts the figures under the date', /@media \(max-width: 480px\) \{[\s\S]{0,300}\.nio-vals \{ grid-column: 1 \/ -1/.test(shell));

    let chromium;
    try { chromium = require('playwright').chromium; }
    catch { console.log('  SKIP  playwright not installed — static CSS assertions only'); return; }
    const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
    let browser;
    try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
    catch (e) { console.log('  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); return; }

    const t = boot({ session: null });
    t.quiet();
    const { D, day, patient } = fixture(t);
    const RDS = require('react-dom/server');
    const h = t.React.createElement;
    // The longest feed label the formulary has, on every row.
    const longFeed = Object.entries(D.EN_DB).sort((a, b) => b[1].label.length - a[1].label.length)[0][0];
    const recs = Array.from({ length: 9 }, (_, i) => ({ ts: day(-i), entryId: 'r' + i, ivInMl: 1234.5, enInMl: 876.5,
      feedType: longFeed, urineMl: 1543.2, drainMl: 2999.9, stoolCount: 12, lastModifiedBy: 'a.very.long.nurse.name@test.th' }));
    const card = RDS.renderToStaticMarkup(h(t.window.NursingIOCard, { patient, records: recs, onOpen() {}, onDelete() {} }));
    const form = RDS.renderToStaticMarkup(h(t.window.NursingEntryModal, { patient, record: recs[0], onClose() {}, onSubmit() {} }));
    const css = shell.match(/<style>([\s\S]*?)<\/style>/)[1];
    const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
      <div class="app"><div class="topbar"><div class="spacer"></div></div><nav class="rail"></nav>
      <main class="work"><div class="work-inner">${body}</div></main>
      <nav class="bottom-nav">${['Patients', 'Dashboard', 'Calc', 'Growth', 'Alerts'].map(x => `<button class="bnav-item"><span>${x}</span></button>`).join('')}</nav>
      </div></body></html>`;
    // Touch (phones, and a tablet at 768): every target ≥ 44 px, which the
    // shells' touch rules give .btn/.inp. A mouse-driven desktop keeps the app's
    // 40 px buttons, so there only what this card makes 44 px everywhere counts.
    const measure = (touch) => {
      const drags = [];
      for (const el of [document.documentElement, document.body, ...document.querySelectorAll('.nursing-io, .nursing-io *, .picker, .picker *')]) {
        const over = el.scrollWidth - el.clientWidth;
        if (over <= 0.5 || el.clientWidth <= 0) continue;
        const ox = getComputedStyle(el).overflowX;
        if (ox === 'auto' || ox === 'scroll' || el === document.documentElement || el === document.body) {
          drags.push(`${el.tagName.toLowerCase()}.${el.className} +${over.toFixed(1)}`);
        }
      }
      const small = [...document.querySelectorAll(touch
        ? '.nio-row, .nio-add, .nio-del, .picker .btn, .picker .icon-btn, .picker .inp, .picker .sel'
        : '.nio-row, .nio-add, .nio-del, .picker .icon-btn, .picker .inp, .picker .sel')]
        .map(el => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ el, r }) => r.height < 43.5 || ((el.classList.contains('nio-del') || el.classList.contains('icon-btn')) && r.width < 43.5))
        .map(({ el, r }) => `${el.className} ${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
      const vw = document.documentElement.clientWidth;
      const spill = [...document.querySelectorAll('.nio-row, .nio-vals, .picker')]
        .filter(el => el.getBoundingClientRect().right > vw + 0.5).length;
      return { drags, small, spill };
    };
    for (const W of [280, 320, 360, 390, 768, 1280]) {
      const touch = W <= 768;
      const tab = await browser.newPage({ viewport: { width: W, height: 900 }, hasTouch: touch, isMobile: touch });
      await tab.setContent(page(card));
      const c = await tab.evaluate(measure, touch);
      A.ok(`7.c ${W}px: the card never scrolls sideways (${c.drags.join(', ') || 'ok'})`, c.drags.length === 0 && c.spill === 0);
      A.ok(`7.c ${W}px${touch ? ' touch' : ' mouse'}: every row and button in it is ≥ 44 px (${c.small.join(', ') || 'ok'})`, c.small.length === 0);
      await tab.setContent(page(form));
      const f = await tab.evaluate(measure, touch);
      A.ok(`7.f ${W}px: the form never scrolls sideways (${f.drags.join(', ') || 'ok'})`, f.drags.length === 0 && f.spill === 0);
      A.ok(`7.f ${W}px${touch ? ' touch' : ' mouse'}: every ${touch ? 'box and button' : 'box and the close button'} in it is ≥ 44 px (${f.small.join(', ') || 'ok'})`, f.small.length === 0);
      await tab.close();
    }
    await browser.close();
  },
};

runScenarios(__filename, 'NURSING FRONTEND', scenarios);
