// verify-io-tpn-weight-1115.cjs — "I/O ใช้น้ำหนักคำนวณ TPN" (Pp, 2026-11-15).
//
// The ward: an infant on bed 10 went from 460 g to 560 g in days, and the
// Intake/Output card divided by the latest weight, not the weight the TPN was
// dosed on, so intake per kg read very differently. Pp's answer: a tick.
// Her choices the same day: unticked by default; the nurses' I/O card follows
// it too.
//
//   §1 The Calculator: unticked, the card divides as before (previous day's
//      weight, 560 g); ticked, by the TPN calc. weight (460 g typed), and says
//      so. The tick is saved with the order and restored with it.
//   §2 The nurses' I/O card: urine mL/kg/h on that date's submitted order's
//      TPN calc. weight when that order ticked it, else as before.
//
// Synthetic infant only. NEGATIVE CONTROL: on origin/main (81ac33e) the tick
// does not exist and both §1 and §2's ticked checks fail.
const {
  boot, runScenarios, mkPatient,
} = require('./review-0917-boot.cjs');

const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];

function probe(t) {
  const el = document.createElement('div');
  el.id = 'probe';
  document.body.appendChild(el);
  const root = t.ReactDOM.createRoot(el);
  return { el, render: async (node) => { await t.act(async () => { root.render(node); }); await t.flush(); } };
}

// Born 460 g, weighed 560 g on DOL 5; today is DOL 6.
const fixture = (t) => {
  const D = t.D();
  const today = D.todayLocal();
  const day = (n) => D.addDaysToDateStr(today, n);
  const patient = mkPatient({ sessionId: 'NF-000460', name: 'IO', initials: 'IO', bw: 460,
    dob: day(-5), admissionDate: day(-5), currentBed: 'NICU 10',
    weights: [{ dol: 1, w: 460, l: null, hc: null }, { dol: 5, w: 560, l: null, hc: null }] });
  return { D, today, day, patient };
};

const scenarios = {
  async calculator(A) {
    console.log('\n── §1 The Calculator\'s Intake/Output card ──');
    const t = boot({ session: null });
    t.quiet();
    global.showToast = () => {};
    const { today, patient } = fixture(t);
    const P = probe(t);
    const logged = [];
    const calc = (props) => P.render(t.React.createElement(t.window.Calculator, {
      patient, dol: 6, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null,
      userLabel: 'Dr Test', userEmail: 'dr@test.th',
      onLog: (e) => { logged.push(e); return Promise.resolve({ ok: true, entryId: 'e-1', lastModified: 'lm' }); },
      onUpdate() {}, onSaved() {}, onWeightChange() {}, nursing: [], ...props,
    }));
    const field = (label) => t.fieldInput(label, $('#probe'));
    const tickBox = () => $('input[name="ioUseTpnWt"]');
    const card = () => $$('.card', $('#probe')).find(c => /Intake \/ Output/.test(($('.card-h', c) || {}).textContent || ''));

    await calc({});
    A.ok('1.0 the tick is on the card', !!tickBox() && /I\/O ใช้น้ำหนักคำนวณ TPN/.test(card().textContent));
    A.eq('1.1 unticked by default (Pp)', tickBox().checked, false);
    await t.typeInto(field('Current weight'), 560);
    await t.typeInto(field('TPN calc. weight'), 460);
    await t.typeInto(field('Input'), 92);
    await t.typeInto(field('Urine output'), 46);
    const txt = () => card().textContent;
    A.ok('1.2 unticked: 92 mL on the previous day\'s 560 g = 164.3 mL/kg/d', txt().includes('(164.3 mL/kg/d)'), txt());
    A.ok('1.3 …divisor 560 g (previous day)', txt().includes('divisor 560 g (previous day)'), txt());
    A.ok('1.4 the tick names the TPN calc. weight, 460 g', /I\/O ใช้น้ำหนักคำนวณ TPN \(460 g\)/.test(txt()), txt());

    await t.click(tickBox());
    A.eq('1.5 ticked', tickBox().checked, true);
    A.ok('1.6 ticked: 92 mL on 460 g = 200 mL/kg/d', txt().includes('(200 mL/kg/d)'), txt());
    A.ok('1.7 …urine 46 mL on 460 g = 4.17 mL/kg/h', txt().includes('(4.17 mL/kg/h)'), txt());
    A.ok('1.8 …divisor 460 g (TPN calc. weight)', txt().includes('divisor 460 g (TPN calc. weight)'), txt());

    // Saved with the order.
    const save = $$('button', $('#probe')).find(b => /Save draft/.test(b.textContent));
    if (save) await t.click(save);
    const saved = logged.length ? logged[logged.length - 1] : null;
    A.ok('1.9 a save carries ioUseTpnWt: true and the TPN calc. weight 460', !!saved && saved.calcInput?.ioUseTpnWt === true && saved.calcInput?.tpnWtG === 460,
      saved && { ioUseTpnWt: saved.calcInput?.ioUseTpnWt, tpnWtG: saved.calcInput?.tpnWtG });

    // Restored with the order.
    await P.render(null); localStorage.clear();
    const entry = { ts: today, status: 'draft', entryId: 'e-9', weight: 560, ioInput: 92, ioOutput: 46, drainContent: 0,
      calcInput: { ...(saved?.calcInput || {}), ioUseTpnWt: true } };
    await calc({ editEntry: entry });
    A.eq('1.10 an order saved ticked reopens ticked', tickBox() && tickBox().checked, true);
    A.ok('1.11 …and divides by its TPN calc. weight', card().textContent.includes('(TPN calc. weight)'), card().textContent);
    await P.render(null); localStorage.clear();
    const { ioUseTpnWt, ...older } = entry.calcInput;
    await calc({ editEntry: { ...entry, calcInput: older } });
    A.eq('1.12 an order saved before the tick existed reopens unticked', tickBox() && tickBox().checked, false);
  },

  async nursingCard(A) {
    console.log('\n── §2 The nurses\' I/O card ──');
    const t = boot({ session: null });
    t.quiet();
    const { today, patient } = fixture(t);
    const P = probe(t);
    const Card = t.window.NursingIOCard;
    const rec = { ts: today, entryId: 'r0', ivInMl: 50, enInMl: 42, urineMl: 46, drainMl: 0, stoolCount: 1, lastModifiedBy: 'n@test.th' };
    const order = (calcInput, status = 'submitted') => [{ ts: today, status, entryId: 'e-1', weight: 560, calcInput }];
    const urine = async (entries) => {
      await P.render(t.React.createElement(Card, { patient, records: [rec], entries, onOpen() {} }));
      return $$('.nio-vals span')[1].textContent;
    };
    A.eq('2.1 no order: urine on the previous day\'s 560 g = 3.4 mL/kg/h', await urine([]), 'ปัสสาวะ 46 · 3.4 mL/kg/h');
    A.eq('2.2 today\'s order unticked: the same', await urine(order({ tpnWtG: 460 })), 'ปัสสาวะ 46 · 3.4 mL/kg/h');
    A.eq('2.3 today\'s order ticked, TPN calc. weight 460 g: 4.2 mL/kg/h', await urine(order({ tpnWtG: 460, ioUseTpnWt: true })), 'ปัสสาวะ 46 · 4.2 mL/kg/h');
    A.eq('2.4 a ticked draft is not an order yet: as before', await urine(order({ tpnWtG: 460, ioUseTpnWt: true }, 'draft')), 'ปัสสาวะ 46 · 3.4 mL/kg/h');
  },
};

runScenarios(__filename, 'I/O ON TPN CALC. WEIGHT', scenarios);
