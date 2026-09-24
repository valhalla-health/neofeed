// One infant, one weight, one day of life — on every screen (Praew, 2026-09-24:
// "น้ำหนัก และ day of life ของทุกที่ ในคนๆเดียวกัน ตรงกันทุกหน้าจอ ... ให้เอามาจากที่เดียวกัน").
//
// The helpers already existed (data.js liveDol / dolAtDate / entryDol and the
// weight series), and most screens called them. What disagreed was what was
// kept on the way: the number being typed in the Calculator shown as the
// infant's weight on every page, prefills that read the growth chart alone,
// DOLs read back off the row that stored them, a "Day admit" counted from the
// birth row, and growth-chart rows left behind when the admission date was
// corrected. This harness walks ONE fixture infant through every screen of the
// real <App/> and requires each figure shown to equal the one function behind
// it: D.currentWeight for weight, D.liveDol / D.entryDol / D.admissionDol for
// DOL. See docs/WEIGHT_DOL_SINGLE_SOURCE_SPEC.md.
//
// The fixture is built to make the old answers visible:
//   • outborn — born 20 days ago, admitted on DOL 6 — with a DOL-1 birth row
//     ahead of the row a legacy registration filed on the admission DOL;
//   • every saved order's stored `dol` is two days stale, as after a dob fix;
//   • DOL 20 has both a measured weight (1,600 g) and an order weight
//     (1,610 g) — the measurement wins, on every screen;
//   • a draft on DOL 19 carries 1,700 g, which is no one's weight.
//
// Same scenario runner and fake Apps Script as the 2026-09-17 review harnesses
// (review-0917-boot.cjs): each scenario runs in its own process.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { boot, runScenarios, mkPatient, addDays, TODAY, DIR } = require('./review-0917-boot.cjs');

const DOB = addDays(TODAY, -20);            // today is DOL 21
const ADMIT = addDays(TODAY, -15);          // admitted on DOL 6
const dateOfDol = (n) => addDays(DOB, n - 1);
const SID = 'SS-BW1500';

const P = mkPatient({
  sessionId: SID, name: 'SS', initials: 'SS', bw: 1500, ga: 30.0,
  dob: DOB, admissionDate: ADMIT, currentBed: 'NICU 3',
  weights: [
    { dol: 1, w: 1500, l: null, hc: null },    // birth row
    { dol: 6, w: 1500, l: 41, hc: 28 },         // a legacy registration's row, on the admission DOL
    { dol: 12, w: 1450, l: null, hc: null },    // measured
    { dol: 20, w: 1600, l: null, hc: null },    // measured, same DOL as an order
  ],
});
const row = (dol, storedDol, weight, extra = {}) => ({
  entryId: 'e' + dol, ts: dateOfDol(dol), dol: storedDol, weight,
  fluid: 150, gir: 7, pro: 3.5, kcal: 100, na: 3, k: 2, ca: 80, p: 50, enVolPerKg: 20,
  ioInput: 0, ioOutput: 0, drainContent: 0, route: 'TPN central', status: 'submitted',
  lastModified: '2026-09-01T00:00:00.000Z', ...extra,
});
const LOG = {
  [SID]: [
    row(16, 14, 1520),
    row(18, 16, 1580),
    row(19, 17, 1700, { status: 'draft' }),
    row(20, 18, 1610),
  ],
};
const WEIGHT_NOW = 1600;
const DOL_NOW = 21;

// ── reading the screen ──────────────────────────────────────────────────────
const digits = (s) => { const m = String(s || '').replace(/,/g, '').match(/\d+/); return m ? Number(m[0]) : null; };
const stripWeight = () => {
  const strip = document.querySelector('.patient-strip');
  const lbl = strip && [...strip.querySelectorAll('.lbl')].find(l => l.textContent.trim() === 'Current weight');
  return lbl ? digits(lbl.parentElement.querySelector('span.num')?.textContent) : null;
};
const stripDol = () => digits((document.querySelector('.patient-strip .bed')?.textContent || '').split('DOL')[1]);
const fieldValue = (t, label) => t.fieldInput(label)?.value ?? null;
const fieldText = (label) => [...document.querySelectorAll('.field')]
  .find(f => f.querySelector('label')?.textContent.trim().startsWith(label))?.textContent || '';
const chipText = () => document.querySelector('.page-head .chip.brand')?.textContent.trim() || '';
const tableRow = (dol) => [...document.querySelectorAll('.tbl tbody tr')]
  .find(tr => tr.cells[0] && tr.cells[0].textContent.trim() === String(dol));

async function openInfant(t) {
  await t.start();
  await t.pickWard('NICU');
  await t.openPatientRow(/SS/);
}
async function newLog(t, dateStr) {
  await t.click(t.btn(/New log/));
  if (dateStr) {
    await t.click([...document.querySelectorAll('input[name="logdate-mode"]')][1]);
    await t.typeInto(document.querySelector('.picker input[type="date"]'), dateStr);
  }
  await t.click(t.btn(/ดำเนินการต่อ/));
}
const readSrc = (f) => fs.readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n');

runScenarios(__filename, 'SINGLE SOURCE — WEIGHT AND DOL', {

  // ══ §1 the resolvers themselves (data.js) ══════════════════════════════════
  async data(A) {
    const t = boot({ patients: [P], log: LOG });
    const D = t.D();
    const call = (name, ...args) => typeof D[name] === 'function' ? D[name](...args) : `(no D.${name})`;
    const log = D.normalizeLogEntries(LOG[SID]);
    const pick = (w) => w && typeof w === 'object' ? { dol: w.dol, w: w.w, src: w.src } : w;

    A.eq('1.1 current weight: the measurement wins the DOL-20 tie, the draft is ignored',
      pick(call('currentWeight', P, log)), { dol: 20, w: WEIGHT_NOW, src: 'measured' });
    A.eq('1.2 as of DOL 17 it is the DOL-16 order, never a later weight',
      pick(call('currentWeight', P, log, 17)), { dol: 16, w: 1520, src: 'order' });
    A.eq('1.3 without a log it is the growth chart alone',
      pick(call('currentWeight', P, [])), { dol: 20, w: WEIGHT_NOW, src: 'measured' });
    A.eq('1.4 today is DOL 21', D.liveDol(P), DOL_NOW);
    A.eq('1.5 a row\'s DOL comes from its date, not its stale stored dol', D.entryDol(P, log[0]), 16);
    A.eq('1.6 …also for a record with a dob and no admission date',
      D.entryDol({ ...P, admissionDate: '' }, log[0]), 16);
    A.eq('1.7 the admission DOL comes from the anchor, not the DOL-1 birth row',
      call('admissionDol', P), 6);
    const earlier = { ...P, admissionDate: addDays(ADMIT, -2), dob: addDays(DOB, -2) };
    A.eq('1.8 moving the admission two days earlier moves every DOL by +2',
      call('anchorShiftDays', P, earlier), 2);
    const moved = call('moveGrowthRows', P.weights, 2, 6, 6);
    A.eq('1.9 growth rows follow: birth stays, the admission row stays, the rest move',
      moved && moved.rows ? moved.rows.map(r => r.dol) : moved, [1, 6, 14, 22]);
    const tooFar = call('moveGrowthRows', P.weights, -11, 6, 6);
    A.eq('1.10 a row pushed onto the day of birth is a conflict, and nothing moves',
      tooFar && tooFar.conflict, { dol: 12, to: 1 });
    const collide = call('moveGrowthRows', [{ dol: 1, w: 1500 }, { dol: 6, w: 1500 }, { dol: 14, w: 1480 }], 0, 6, 14);
    A.eq('1.11 two rows landing on one DOL is a conflict', collide && collide.conflict, { dol: 6, to: 14 });
    const noMeasureYesterday = { ...P, weights: P.weights.filter(w => w.dol !== 20) };
    A.eq('1.12 the I/O divisor\'s yesterday reads the order weights too',
      D.ioDivisorG(noMeasureYesterday, 21, 1650, log), { g: 1610, source: 'prevDay' });
  },

  // ══ §2 the patient strip never shows a weight that is only being typed ═══
  async strip(A) {
    const t = boot({ patients: [P], log: LOG });
    const restore = t.quiet();
    await openInfant(t);
    A.eq('2.1 strip weight on the Dashboard', stripWeight(), WEIGHT_NOW);
    A.eq('2.2 strip DOL', stripDol(), DOL_NOW);
    await newLog(t);
    await t.typeInto(t.fieldInput('Current weight'), 1650);
    A.eq('2.3 typing 1,650 in the Calculator leaves the strip on the recorded weight', stripWeight(), WEIGHT_NOW);
    await t.rail(/^Dashboard/);
    A.eq('2.4 …and on the Dashboard afterwards', stripWeight(), WEIGHT_NOW);
    await t.rail(/^Alerts/);
    A.eq('2.5 …and on the Alerts page', stripWeight(), WEIGHT_NOW);
    restore();
  },

  // ══ §3 the Calculator starts from the recorded weight of the order's day ══
  async newOrder(A) {
    const t = boot({ patients: [P], log: LOG });
    const restore = t.quiet();
    await openInfant(t);
    await newLog(t);
    A.eq('3.1 a new order starts from the strip\'s weight', digits(fieldValue(t, 'Current weight')), WEIGHT_NOW);
    A.ok('3.2 …and says it was measured on DOL 20', /น้ำหนักที่ชั่ง \(DOL 20\)/.test(fieldText('TPN calc. weight')));
    A.eq('3.3 the chip is today\'s DOL', chipText(), `DOL ${DOL_NOW}`);
    restore();
  },
  async backfill(A) {
    const t = boot({ patients: [P], log: LOG });
    const restore = t.quiet();
    await openInfant(t);
    await newLog(t, addDays(TODAY, -4));
    A.eq('3.4 a back-fill for DOL 17 starts from the DOL-16 weight, not a later one',
      digits(fieldValue(t, 'Current weight')), 1520);
    A.ok('3.5 the chip names the order\'s own DOL and date', /^DOL 17 · /.test(chipText()));
    restore();
  },
  async edit(A) {
    const t = boot({ patients: [P], log: LOG });
    const restore = t.quiet();
    await openInfant(t);
    await t.click(tableRow(16));
    const banner = (document.body.textContent.match(/กำลังแก้ไขบันทึก DOL\s*(\d+)/) || [])[1];
    A.eq('3.6 the edit banner shows the row\'s DOL from its date (stored: 14)', Number(banner), 16);
    A.ok('3.7 the chip names the order\'s DOL and date', /^DOL 16 · /.test(chipText()));
    A.eq('3.8 the strip above still reads today', stripDol(), DOL_NOW);
    restore();
  },
  async io(A) {
    const p = { ...P, weights: P.weights.filter(w => w.dol !== 20) };
    const t = boot({ patients: [p], log: LOG });
    const restore = t.quiet();
    await openInfant(t);
    await newLog(t);
    await t.typeInto(t.fieldInput('Current weight'), 1650);
    await t.typeInto(t.fieldInput('Urine output'), 100);   // the divisor line shows once an I/O value is in
    const m = document.body.textContent.match(/divisor\s*([\d,]+)\s*g\s*\(([^)]+)\)/);
    A.eq('3.9 the I/O divisor is yesterday\'s order weight', m && [digits(m[1]), m[2]], [1610, 'previous day']);
    // 100 mL/d ÷ 1.610 kg ÷ 24 h — today's typed 1,650 g would give 2.53.
    A.ok('3.10 urine output reads 2.59 mL/kg/h off that divisor', /\(2\.59 mL\/kg\/h\)/.test(fieldText('Urine output')));
    restore();
  },

  // ══ §4 the Ward list and the patient modals ═══════════════════════════════
  async ward(A) {
    const t = boot({ patients: [P], log: LOG });
    const restore = t.quiet();
    await t.start();
    await t.pickWard('NICU');
    const tr = [...document.querySelectorAll('.patient-table tbody tr')].find(r => /SS/.test(r.textContent));
    A.eq('4.1 Ward DOL', tr && digits(tr.cells[6].textContent), DOL_NOW);
    A.eq('4.2 Ward "Wt now"', tr && digits(tr.cells[7].textContent), WEIGHT_NOW);
    A.eq('4.3 the badge names the last order\'s DOL from its date (stored: 18)',
      tr && tr.querySelector('.log-badge')?.getAttribute('title'), 'บันทึกล่าสุด DOL 20');
    restore();
  },
  async anchorShift(A) {
    const t = boot({ patients: [P], log: LOG });
    const restore = t.quiet();
    const { React, act } = t;
    const probe = document.createElement('div'); document.body.appendChild(probe);
    const root = t.ReactDOM.createRoot(probe);
    let submitted = null;
    await act(async () => { root.render(React.createElement(global.EditPatientModal, {
      patient: P, patients: [P], onClose() {}, onSubmit: (p) => { submitted = p; return { ok: true }; },
    })); });
    await t.flush();
    const field = (label) => [...probe.querySelectorAll('.field')]
      .find(f => f.querySelector('label')?.textContent.trim().startsWith(label))?.querySelector('input');
    A.eq('4.4 DOL แรกรับ seeds from the anchor', field('DOL แรกรับ')?.value, '6');
    await t.typeInto(field('Admit date'), addDays(ADMIT, -2));
    const save = [...probe.querySelectorAll('button')].find(b => /Save changes/.test(b.textContent));
    await t.click(save);
    A.eq('4.5 the admission moved two days earlier: rows keep their calendar day',
      submitted && submitted.weights.map(w => w.dol), [1, 6, 14, 22]);
    A.eq('4.6 …and today reads DOL 23 on the corrected record', submitted && t.D().liveDol(submitted), 23);
    // Pushing a measurement onto the day of birth is refused, not saved.
    submitted = null;
    await act(async () => { root.render(null); });
    await act(async () => { root.render(React.createElement(global.EditPatientModal, {
      key: 'again', patient: P, patients: [P], onClose() {}, onSubmit: (p) => { submitted = p; return { ok: true }; },
    })); });
    await t.flush();
    await t.typeInto(field('Admit date'), addDays(ADMIT, 11));
    const save2 = [...probe.querySelectorAll('button')].find(b => /Save changes/.test(b.textContent));
    A.ok('4.7 a move that lands a row on the day of birth disables Save', save2 && save2.disabled);
    A.ok('4.8 …and says which row', /DOL 12/.test(probe.textContent));
    restore();
  },
  async register(A) {
    const t = boot({ patients: [], log: {} });
    const restore = t.quiet();
    const { React, act } = t;
    const probe = document.createElement('div'); document.body.appendChild(probe);
    const root = t.ReactDOM.createRoot(probe);
    let submitted = null;
    await act(async () => { root.render(React.createElement(global.NewPatientModal, {
      patients: [], onClose() {}, onSubmit: (p) => { submitted = p; return { ok: true }; },
    })); });
    await t.flush();
    const field = (label) => [...probe.querySelectorAll('.field')]
      .find(f => f.querySelector('label')?.textContent.includes(label))?.querySelector('input, select');
    const set = async (el, v) => {
      const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      await act(async () => {
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(v));
        el.dispatchEvent(new window.Event('input', { bubbles: true }));
        el.dispatchEvent(new window.Event('change', { bubbles: true }));
      });
      await t.flush();
    };
    await set(field('ชื่อย่อ'), 'อบ');
    await set(field('Birth weight'), 1200);
    await set(field('GA'), '29');
    await set(field('Sex'), 'girls');
    await set(field('DOL at admit'), 4);
    await t.click([...probe.querySelectorAll('button')].find(b => /Register/.test(b.textContent)));
    A.eq('4.9 an outborn registration files the birth weight on DOL 1, not the admission DOL',
      submitted && submitted.weights.map(w => [w.dol, w.w]), [[1, 1200]]);
    A.eq('4.10 …and its dob puts the admission on DOL 4',
      submitted && t.D().dolAtDate(submitted, submitted.admissionDate), 4);
    restore();
  },

  // ══ §5 the Dashboard and the growth chart ══════════════════════════════════
  async dashboard(A) {
    const t = boot({ patients: [P], log: LOG });
    const restore = t.quiet();
    await openInfant(t);
    A.eq('5.1 "Day admit" counts from the admission DOL (6), not the birth row',
      [16, 18, 20].map(d => tableRow(d) && digits(tableRow(d).cells[1].textContent)), [10, 12, 14]);
    await t.click([...document.querySelectorAll('.trend-chip')].find(b => /Weight/.test(b.textContent)));
    const latest = document.querySelector('.trend-latest')?.firstElementChild?.children[1]?.textContent;
    A.eq('5.2 the Trend\'s Weight reads the same latest weight as the strip', digits(latest), WEIGHT_NOW);
    restore();
  },
  async growth(A) {
    const t = boot({ patients: [P], log: LOG });
    const restore = t.quiet();
    await openInfant(t);
    await t.rail(/^Growth/);
    const head = [...document.querySelectorAll('.sub-h')].find(h => /^Latest/.test(h.textContent.trim()));
    A.eq('5.3 Fenton\'s latest weight is the strip\'s', digits(head?.parentElement.querySelector('.num')?.textContent), WEIGHT_NOW);
    A.eq('5.4 the logger files a new measurement on today\'s DOL', digits(fieldValue(t, 'DOL')), DOL_NOW);
    restore();
  },
  async loggerCap(A) {
    // A row filed above today's DOL (the kind an uncorrected anchor leaves)
    // must not become the logger's default or its cap.
    const p = { ...P, weights: [...P.weights, { dol: 25, w: 1650, l: null, hc: null }] };
    const t = boot({ patients: [p], log: LOG });
    const restore = t.quiet();
    await openInfant(t);
    await t.rail(/^Growth/);
    A.eq('5.5 the logger\'s DOL is today\'s, not a stored higher one', digits(fieldValue(t, 'DOL')), DOL_NOW);
    restore();
  },

  // ══ §6 Center Point's calculator page computes DOL with NeoFeed's function ═
  async centerPoint(A) {
    const t = boot({ patients: [], log: {} });
    const D = t.D();
    let mod = null;
    try { mod = await import(pathToFileURL(path.join(DIR, 'center-point', 'order-setup.mjs')).href); } catch (e) { mod = null; }
    A.ok('6.1 center-point/order-setup.mjs exports orderSetup', !!(mod && typeof mod.orderSetup === 'function'));
    const setup = (v) => (mod && mod.orderSetup ? mod.orderSetup(v, D, '2026-09-24') : {});
    A.eq('6.2 born 09-10, TPN on 09-14 → DOL 5 (D.dolAtDate)',
      setup({ bw: 1200, ga: 28, dob: '2026-09-10', order: '2026-09-14' }).dol, 5);
    A.eq('6.3 …the same number NeoFeed gives', D.dolAtDate({ dob: '2026-09-10' }, '2026-09-14'), 5);
    A.ok('6.4 a Buddhist-era birth year is refused with NeoFeed\'s message',
      /พ\.ศ\./.test(setup({ bw: 1200, ga: 28, dob: '2569-09-10', order: '2026-09-14' }).error || ''));
    A.ok('6.5 a birth date after the TPN date is refused',
      !!setup({ bw: 1200, ga: 28, dob: '2026-09-15', order: '2026-09-14' }).error);
    const html = readSrc('center-point/calculator.html');
    A.ok('6.6 the setup form asks for the date of birth', /<input name="dob" type="date"/.test(html));
    A.ok('6.7 …and no longer takes a typed DOL', !/<input name="dol"/.test(html));
    A.ok('6.8 the page mounts the Calculator with the computed DOL',
      /orderSetup\(/.test(readSrc('center-point/calculator-page.jsx')));
  },

  // ══ §7 no screen can drift back to a copy ═══════════════════════════════════
  async source(A) {
    const jsx = ['app.jsx', 'calculator.jsx', 'registry.jsx', 'log.jsx', 'fenton.jsx'];
    const all = jsx.map(f => [f, readSrc(f)]);
    const hits = (re) => all.filter(([, s]) => re.test(s)).map(([f]) => f);
    A.eq('7.1 nothing calls lastWeighed (use D.currentWeight with the log)', hits(/\blastWeighed\(/), []);
    A.eq('7.2 nothing calls weightAtOrBeforeDol', hits(/\bweightAtOrBeforeDol\(/), []);
    A.eq('7.3 no typed weight is carried out of the Calculator', hits(/\bonWeightChange\b|\bliveWeight\b|\bcalcWeights\b/), []);
    A.eq('7.4 no stored dol is displayed', hits(/\beditEntry\.dol\b|\blastEntry\.dol\b|\bentry\.dol\}|\brestored\.dol\b|\bbaselineEntry\.dol\b/), []);
    A.eq('7.5 no DOL is counted from weights[0] outside data.js', hits(/weights\?\.\[0\]\?\.dol/), []);
    const data = readSrc('data.js');
    A.ok('7.6 data.js no longer defines lastWeighed or weightAtOrBeforeDol',
      !/function lastWeighed\(|function weightAtOrBeforeDol\(/.test(data));
  },
});
