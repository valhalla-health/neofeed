const { printFormTicked: __printFormTicked } = require('./print-acks-helper.cjs');
// verify-pn-indication-1105.cjs — "Indication for PN" dropdown and Liver/Renal
// Dysfunction ticks on the patient record (Pp, 2026-10-28 meeting; built
// 2026-11-05). Frontend only this round (Pp, 2026-11-05): the fields live on
// the patient record next to Diagnosis, in state and on the printed sheet,
// with no Patient_Registry column yet — a reload still loses them until the
// backend ships.
//
//   #1  the options list: D.PN_INDICATIONS, in dropdown order
//   #2  New patient: the fields default blank/unticked, and register carries
//       whatever was picked
//   #3  Edit session: seeded from the patient record, and Save sends only
//       what changed when that is all that changed
//   #4  the printed TPN order: the indication and the ticks, unticked by
//       default, ticked when true — mirroring the Route of Delivery pattern
const {
  boot, runScenarios, mkPatient,
} = require('./review-0917-boot.cjs');

const dialog = (re) => [...document.querySelectorAll('.picker')].find(m => re.test(m.querySelector('.picker-h')?.textContent || ''));
const without = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const liverChk = (scope) => scope.querySelector('label.liver-dx-chk input[type=checkbox]');
const renalChk = (scope) => scope.querySelector('label.renal-dx-chk input[type=checkbox]');

const scenarios = {
  async options(A) {
    console.log('\n── #1 The one options list ──');
    const t = boot({ patients: [mkPatient()] });
    t.quiet();
    await t.start();
    const D = t.D();
    A.eq('1.1 PN_INDICATIONS, in dropdown order', D.PN_INDICATIONS, [
      'Short bowel syndrome', 'Motility disorder', 'Mucosal disease', 'Preterm infant',
      'NEC', 'Post-surgery', 'Feeding intolerance', 'For supplementation',
    ]);
  },

  async 'new-patient'(A) {
    console.log('\n── #2 New patient: default blank/unticked, register carries the pick ──');
    const t = boot({ patients: [mkPatient({ sessionId: 'NF-900001', name: 'ZZ' })] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    await t.click(t.btn(/New session/));
    const modal = document.querySelector('.picker');
    const sel = t.fieldInput('Indication for PN', modal);
    A.ok('2.1 the dropdown is on the New session form', !!sel);
    A.eq('2.2 it defaults blank', sel && sel.value, '');
    A.eq('2.3 it lists exactly D.PN_INDICATIONS, with a blank first', sel && [...sel.options].map(o => o.value), ['', ...t.D().PN_INDICATIONS]);
    A.ok('2.4 Liver Dysfunction starts unticked', liverChk(modal) && liverChk(modal).checked === false);
    A.ok('2.5 Renal Dysfunction starts unticked', renalChk(modal) && renalChk(modal).checked === false);
  },

  async 'edit-session'(A) {
    console.log('\n── #3 Edit session: seeded, and Save sends the change ──');
    const AA = mkPatient({ sessionId: 'NF-900002', name: 'AA', diagnosis: 'ELBW · RDS',
      pnIndication: 'Preterm infant', liverDysfunction: false, renalDysfunction: true });
    const t = boot({ patients: [AA] });
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    await t.click(t.btn(/^\s*Edit\s*$/, [...document.querySelectorAll('.patient-mc')].find(c => c.querySelector('.pmc-name')?.textContent === 'AA')));
    const edit = dialog(/^Edit session ·/);
    const sel = t.fieldInput('Indication for PN', edit);
    A.eq('3.1 the dropdown is seeded from the record', sel && sel.value, 'Preterm infant');
    A.eq('3.2 Liver unticked, Renal ticked, from the record',
      [liverChk(edit) && liverChk(edit).checked, renalChk(edit) && renalChk(edit).checked], [false, true]);
    await t.selectVal(sel, 'NEC');
    await t.click(liverChk(edit));
    const before = t.callsOf('registerPatient').length;
    await t.click(t.btn(/Save changes/, edit));
    await t.flush(); await t.flush();
    const calls = t.callsOf('registerPatient');
    A.eq('3.3 one save', calls.length - before, 1);
    const sent = calls[calls.length - 1];
    A.eq('3.4 the new indication and both ticks sent',
      sent && [sent.patient.pnIndication, sent.patient.liverDysfunction, sent.patient.renalDysfunction],
      ['NEC', true, true]);
    A.eq('3.5 nothing else on the record changed',
      sent && without(sent.patient, ['pnIndication', 'liverDysfunction', 'renalDysfunction']),
      without(AA, ['pnIndication', 'liverDysfunction', 'renalDysfunction']));
  },

  async 'printed-sheet'(A) {
    console.log('\n── #4 The printed TPN order: the indication and the ticks ──');
    const fs = require('fs');
    const vm = require('vm');
    const path = require('path');
    const babel = require('@babel/core');
    const { JSDOM } = require('jsdom');
    const DIR = path.join(__dirname, '..') + '/';
    const R = (f) => String(fs.readFileSync(DIR + f, 'utf8')).replace(/\r\n/g, '\n');

    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',
      { url: 'https://localhost/', pretendToBeVisual: true });
    const { window } = dom;
    Object.assign(global, {
      window, document: window.document, self: window, HTMLElement: window.HTMLElement,
      Element: window.Element, Node: window.Node, getComputedStyle: window.getComputedStyle,
      localStorage: window.localStorage,
      requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    global.showToast = () => {};
    window.print = () => {};
    window.confirm = () => true;
    { const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
    const React = require('react');
    const ReactDOM = require('react-dom/client');
    const { act } = require('react');
    global.React = React; window.React = React;
    vm.runInThisContext(R('data.js'));
    for (const f of ['icons.jsx', 'calculator.jsx']) {
      vm.runInThisContext(babel.transformSync(R(f), {
        presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
        filename: f, configFile: false, babelrc: false,
      }).code);
    }

    const container = document.getElementById('root');
    let root = ReactDOM.createRoot(container);
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const fieldOf = (label) => [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
    const saltRow = (label) => [...container.querySelectorAll('.salt-row-grid')]
      .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label)) || null;
    const inputFor = (label) => fieldOf(label)?.querySelector('input') || saltRow(label)?.querySelector('input') || null;
    const setField = (label, value) => {
      const input = inputFor(label);
      if (!input) throw new Error('field not found: ' + label);
      act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
    };
    const routeBtn = (name) => [...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent.trim() === name);
    const submitBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit') || null;
    const settle = async (el) => {
      await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
      await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    };
    // A real submitted bag — orderSettled (and so PrintOrderForm) needs a saved
    // entryId, not just a patient prop, the same minimum verify-revise-phone-1103
    // uses.
    async function mountSubmittedOrder(patient) {
      act(() => { root.unmount(); });
      root = ReactDOM.createRoot(container);
      window.localStorage.clear();
      const PT = { sessionId: 'NF-900003', name: 'BB', bw: 1600, currentBed: 'NICU 2', diagnosis: 'ELBW · RDS',
        weights: [{ dol: 1, w: 1600 }], admissionDate: '2026-11-01', ...patient };
      const calls = [];
      act(() => { root.render(React.createElement(window.Calculator, {
        patient: PT, dol: 5, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-11-05',
        userLabel: 'Dr Test (doc@kcmh.test)', onSaved() {}, onWeightChange() {},
        onLog(e) { calls.push(e); return Promise.resolve({ ok: true, entryId: 'e-1', lastModified: 'lm-1' }); },
        onUpdate(id, lm, e) { calls.push(e); return Promise.resolve({ ok: true, revised: true, entryId: id, lastModified: 'lm-2', revisionNumber: 2 }); },
        onPublish() { return Promise.resolve({ ok: true, publishedAt: '2026-11-05T03:00:00Z' }); },
      })); });
      act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
      click(routeBtn('Central'));
      setField('Current weight', 1600);
      ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content'].forEach(l => setField(l, l === 'Target fluid' ? 150 : 0));
      setField('Volume(mL/day)', 160); setField('ปริมาตรคาสาย (dead space)', 30);
      setField('Dextrose final', 10); setField('Amino acid', 2);
      setField('20% NaCl', 2); setField('KCl', 2.5); setField('MgSO₄', 4.861);
      await settle(submitBtn());
    }
    function click(el) { act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); }
    const sheetText = () => (__printFormTicked(container) || container).textContent;

    await mountSubmittedOrder({});
    A.ok('4.1 no indication, both unticked: the sheet says so plainly', /Indication for PN:\s*—/.test(sheetText()));
    A.eq('4.2 …and both boxes read ☐', [sheetText().includes('☐ Liver Dysfunction'), sheetText().includes('☐ Renal Dysfunction')], [true, true]);
    await mountSubmittedOrder({ pnIndication: 'NEC', liverDysfunction: true, renalDysfunction: false });
    A.ok('4.3 the indication prints', sheetText().includes('Indication for PN: NEC'));
    A.eq('4.4 Liver ticked, bold; Renal not',
      [sheetText().includes('☑ Liver Dysfunction'), sheetText().includes('☐ Renal Dysfunction')], [true, true]);
    await mountSubmittedOrder({ pnIndication: 'Mucosal disease', liverDysfunction: false, renalDysfunction: true });
    A.eq('4.5 Renal ticked, Liver not',
      [sheetText().includes('☐ Liver Dysfunction'), sheetText().includes('☑ Renal Dysfunction')], [true, true]);
    act(() => { root.unmount(); });
  },
};

runScenarios(__filename, 'PN INDICATION 1105 · DROPDOWN + LIVER/RENAL TICKS', scenarios);
