// verify-print-one-page-1102.cjs — the doctor's printed order is one A4 page at its fullest,
// with the signature on the same page as the order (Pp, 2026-11-02: "แยก PR แก้ให้พอดี 1 หน้า";
// and "อยากให้มีลายเซ็นอยู่ในหน้าเดียวกัน" when a doctor confirms a critical value).
//
// Before this, the fullest order printed on two pages: the red box was cut by the page break, and its
// reason, the doctor's signature line and the provenance footer fell on page 2 (11 critical alerts, a
// 300-character reason, every stock line and five oral lines: about 30 mm over; one alert, about
// 13 mm). What changed, with no font size lowered and no line removed or abbreviated:
//   - the amino-acid choices are two lines (the ticked product with its dose, then the other choices side by side);
//   - cell padding 3px -> 1.5px and a 1.35 line height on cells; the form's own 4mm 6mm padding -> 0 2mm
//     (the page already has its 8mm 10mm margins);
//   - the signature line sits inside the red box when a critical value was confirmed, and the box and the
//     line never split across a page break (break-inside: avoid, in the shells' @media print block);
//   - in that box the signature line also carries the NeoFeed ID and the order date, so that if an order
//     ever does overflow and the box moves whole to page 2, page 2 still names the infant and the day.
//
//   §1 jsdom: the markup that carries it, on three orders saved through the real Submit (no critical alert,
//      one, several). The signature is inside the red box (and the only one) with the NeoFeed ID and the
//      date between the doctor and the code; the box keeps its three texts; with no critical value there is
//      no box and the line stands as it was; room to sign; the amino-acid cell prints all five products and
//      "Other" once each, also for Aminoplasmal; every figure stays at 10 px or more; the shells carry the
//      print rules; every critical title the app can raise is in the fit test's list.
//   §2 Chromium, when playwright is installed (SKIP without it; CI runs it): the form of each order is
//      printed to a PDF with the shells' own CSS, and each is ONE page. It is printed in a wide font
//      (DejaVu Sans / Verdana) on purpose: a CI machine has neither IBM Plex nor Sarabun, and a fallback
//      wider than the ward's font can only make the page fuller, so a pass is not an accident of a
//      narrow fallback. Then an order that does NOT fit (every alert, a 300-character reason, a long
//      diagnosis) is printed with a link around each piece of the red box: Chrome writes a link annotation
//      on the page where the link falls, so the PDF itself says which page holds what. The whole box, its
//      signature and the infant's ID and date are on page 2; with the rule switched off the same order
//      splits, which proves the check can see a split.
//
// Same jsdom harness as verify-nutrition-meeting-1028.cjs. Synthetic infants only.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => fs.readFileSync(DIR + f, 'utf8');

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(72)}${yes ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(72)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}
async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  try { await fn(); } catch (e) { ok(`(section ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 3)); }
}

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
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
vm.runInThisContext(R('data.js'));
const D = window.NEOFEED_DATA;
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(R(f), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const squash = (s) => (s || '').replace(/\s+/g, ' ').trim();
function inputFor(label) {
  const field = [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label));
  if (field) return field.querySelector('input');
  const row = [...container.querySelectorAll('.salt-row-grid')]
    .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label));
  return row ? row.querySelector('input') : null;
}
function setField(label, value) {
  const input = inputFor(label);
  if (!input) throw new Error('field not found: ' + label);
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
function check(labelStart) {
  const box = [...container.querySelectorAll('input[type=checkbox]')]
    .find(i => (i.closest('label')?.textContent || i.parentElement?.textContent || '').startsWith(labelStart));
  if (!box) throw new Error('checkbox not found: ' + labelStart);
  if (!box.checked) act(() => { box.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
}
const clickAsync = async (el) => {
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
};
const submitBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit') || null;
const printForm = () => container.querySelector('#print-form');
const FOLLOWS = (a, b) => !!(a.compareDocumentPosition(b) & window.Node.DOCUMENT_POSITION_FOLLOWING);

const pt = (over = {}) => ({ sessionId: 'OP-1', name: 'OP', bw: 1000, currentBed: 'NICU 4', diagnosis: '-',
  weights: [{ dol: 1, w: 1000 }], admissionDate: '2026-10-18', ...over });
function recorder() {
  const calls = [];
  return {
    calls,
    onLog(entry) { calls.push(['log', entry]); return Promise.resolve({ ok: true, entryId: 'e-new', lastModified: 'lm-new' }); },
    onUpdate(id, lm, entry) { calls.push(['update', id, lm, entry]); return Promise.resolve({ ok: true, lastModified: 'lm-u' }); },
    onPublish(id, lm) { calls.push(['publish', id, lm]); return Promise.resolve({ ok: true, publishedAt: '2026-11-02T03:00:00Z' }); },
  };
}
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  act(() => { root.render(React.createElement(window.Calculator, {
    patient: pt(), dol: 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-11-02',
    userLabel: 'Dr Onepage (onepage@kcmh.test)', onSaved() {}, onWeightChange() {}, ...props })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}

// Three orders, each with every stock line, a feed and the five oral lines, saved through the real Submit:
//   MILD   moderate doses: no critical alert at all
//   ONE    the same with KCl 6 mEq/kg/d: a critical alert
//   HEAVY  doses high enough to raise several critical alerts at once
const MILD = [
  ['Current weight', 1200], ['Target fluid', 150], ['Other IV', 0], ['Drug volume', 0],
  ['Input', 150], ['Urine output', 90], ['Drain content', 0],
  ['Volume(mL/feed)', 8], ['Frequency', 4],
  ['Volume(mL/day)', 120], ['Dextrose final', 12], ['Amino acid', 3], ['20% lipid', 3],
  ['20% NaCl', 2], ['Na Acetate', 1], ['Glycophos', 1], ['KCl', 1], ['K₂HPO₄', 0.5], ['MgSO₄', 6],
  ['10% Ca gluconate', 60], ['ZnSO₄', 0.5], ['Heparin', 1],
  ['Iron', 2], ['ปริมาณ elem Ca', 40], ['ปริมาณ elem P', 20], ['Vitamin D', 400],
];
const ONE = MILD.map(([l, v]) => l === 'KCl' ? [l, 6] : [l, v]);
const HEAVY = [
  ['Current weight', 1500], ['Target fluid', 120], ['Other IV', 10], ['Drug volume', 5],
  ['Input', 200], ['Urine output', 110], ['Drain content', 5],
  ['Volume(mL/feed)', 12], ['Frequency', 4],
  ['Volume(mL/day)', 200], ['Dextrose final', 14], ['Amino acid', 4.6], ['20% lipid', 4.2],
  ['20% NaCl', 3], ['Na Acetate', 2], ['Glycophos', 2], ['KCl', 3], ['K₂HPO₄', 2.5], ['MgSO₄', 9.7],
  ['10% Ca gluconate', 100], ['ZnSO₄', 3.5], ['Heparin', 1],
  ['Iron', 3], ['ปริมาณ elem Ca', 120], ['ปริมาณ elem P', 30], ['Vitamin D', 700],
];
// Submit slices a reason to 300 characters (calculator.jsx), so 300 is the longest one that can print.
const REASON_300 = ('ผู้ป่วยมี hypokalemia จากการสูญเสียทาง renal ร่วมกับ hyperglycemia หลังหยุด insulin จึงเพิ่ม dextrose, amino acid, '
  + 'lipid และ K ตามคำแนะนำของ TPN team ตรวจ electrolyte ทุก 6 ชั่วโมง ปรึกษา pharmacy แล้ว แพทย์เจ้าของไข้ยืนยันคำสั่ง '
  + 'ติดตาม GIR, triglyceride, Mg, Zn และ osmolarity ต่อเนื่อง ลดขนาดเมื่อค่าห้องปฏิบัติการดีขึ้น และประเมินซ้ำทุกวัน').slice(0, 300);
const REASON_40 = REASON_300.slice(0, 40);
// Every critical title that takes a reason at Submit and can print on a TPN order, one per rule in calculator.jsx
// (the ones whose line has no `noReason`, and that Submit does not refuse outright):
//   TPN calc. weight far from automatic, GIR, Protein and Energy (the tile line), Lipid, Potassium, Magnesium,
//   Ca:P with no P (its title says "(รวม oral supp)" when an oral Ca or P is ordered), Osmolarity, Dextrose,
//   K⁺ concentration too high, Lipid rate, Zinc.
// Not here: NPE:AA critically low (`noReason`); "No TPN: feeds below 80 mL/kg/d…" (a No TPN order has no bag
// and prints the short sheet); and the stops Submit refuses with no reason: weight out of range, K⁺ above the
// maximum, Bag cannot be made, Stock rounds to 0 mL, Feeds above 8 a day, Two feeds off a regular schedule,
// Feed not in the formulary. §1e fails when calculator.jsx gains or loses a critical line, so this list is read again.
const ALERTS_13 = ['TPN calc. weight far from automatic', 'GIR critically high', 'Protein critically out of range',
  'Energy critically out of range', 'Lipid critically out of range', 'Potassium critically out of range',
  'Magnesium below 1 mg/kg/d: พิมพ์เป็น mEq หรือเปล่า', 'Ca:P ratio (รวม oral supp) — ไม่มี P',
  'Osmolarity > peripheral limit', 'Dextrose over KCMH max', 'K⁺ concentration too high',
  'Lipid rate above the ceiling', 'Zinc total above 5 mg/day'];
const CRIT_LINES_IN_SOURCE = 21;   // `level: "crit"` pushes in calculator.jsx: 13 above + NPE:AA + No TPN feeds + 6 stops
const UUID = '2d0b8f3a-7c1e-4b5a-9f66-1a2b3c4d5e6f';   // the longest NeoFeed ID the sheet could carry
const DIAG_600 = ('Preterm 27 wk, BPD, NEC stage IIB post bowel resection, short bowel syndrome, cholestasis, PDA ligation, '
  + 'ROP stage 2 zone II, IVH grade 3 with post-haemorrhagic ventricular dilatation, anaemia of prematurity on EPO, '
  + 'osteopenia of prematurity, feeding intolerance, Klebsiella sepsis on meropenem, renal impairment, hypokalaemia, ').repeat(3).slice(0, 600);

// Type an order, press Submit (a prompt, if the order is critical, answers with `reason`) and return the saved row.
async function saveOrder(order, reason) {
  const r = recorder();
  mount(r);
  { const route = [...container.querySelectorAll('.step2-ctrl .seg button')];
    if (route.length && !route.some(b => b.classList.contains('on'))) act(() => { route.find(b => b.textContent.trim() === 'Central').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); }
  order.forEach(([l, v]) => setField(l, v));
  check('Soluvit'); check('Peditrace'); check('Munti-vim');
  let asked = 0;
  window.prompt = () => { asked++; return reason; };
  await clickAsync(submitBtn());
  const row = r.calls.find(c => c[0] === 'log')?.[1];
  return { row, asked, form: printForm(), alerts: row?.calcInput?.critOverride?.alerts || [] };
}
// The row as the server keeps it, reopened from the log, with `critOverride` as given (none when null).
const reopened = (row, critOverride, calcOver = {}) => {
  const calcInput = { ...row.calcInput, ...calcOver };
  delete calcInput.critOverride;
  if (critOverride) calcInput.critOverride = { ...critOverride, at: '2026-11-02T03:00:00Z' };
  return { ...row, entryId: 'e1', lastModified: 'lm1', ts: '2026-11-02', published: '2026-11-02T03:00:00Z',
    publishedBy: 'onepage@kcmh.test', revisionNumber: 1, calcInput };
};
const oralLines = (form) => [...form.querySelectorAll('td')].find(td => td.textContent.trim() === '8. Other')?.nextElementSibling?.children.length;
// What the sheet prints at its top for the infant and the day: the box's signature row must say the same strings.
const topStrings = (form) => {
  const cells = [...form.querySelector(':scope > table').querySelectorAll('td')];
  const strong = (start) => squash(cells.find(td => squash(td.textContent).startsWith(start))?.querySelector('strong')?.textContent);
  return { id: strong('NeoFeed ID:'), date: strong('วันที่ให้ TPN:') };
};

(async () => {
  const forms = {};   // label -> the print form's outerHTML, for the Chromium section

  const mild = await saveOrder(MILD, REASON_300);
  const one = await saveOrder(ONE, REASON_40);
  const heavy = await saveOrder(HEAVY, REASON_300);

  await section('§1 three orders, saved through the real Submit', async () => {
    ok('the moderate order raises no critical alert (no prompt, nothing confirmed)', !!mild.row && mild.asked === 0 && mild.alerts.length === 0, [mild.asked, mild.alerts]);
    ok('KCl 6 mEq/kg/d raises a critical alert, and Submit asks for a reason', !!one.row && one.asked === 1 && one.alerts.length >= 1, [one.asked, one.alerts]);
    ok('the heavy order raises several', !!heavy.row && heavy.asked === 1 && heavy.alerts.length >= 3, [heavy.asked, heavy.alerts]);
    for (const [name, o] of [['moderate', mild], ['one-alert', one], ['heavy', heavy]]) {
      eq(`the ${name} order prints five oral lines under 8. Other`, o.form ? oralLines(o.form) : null, 5);
    }
  });
  if (!mild.row || !one.row || !heavy.row) { console.log('\nONE-PAGE ORDER: cannot run'); process.exit(1); }

  await section('§1a no critical value: the signature line stands as it was', async () => {
    mount({ ...recorder(), editEntry: reopened(mild.row, null) });
    const form = printForm();
    ok('the order prints', !!form);
    ok('there is no red box', !form.querySelector('.print-crit-box') && !form.querySelector('.crit-confirmed'));
    const sign = form.querySelectorAll('.print-sign');
    eq('one signature line', sign.length, 1);
    ok('…a direct child of the form, after the lipid pump rate',
      sign[0]?.parentElement === form && FOLLOWS(form.querySelector('.print-lipid-rate'), sign[0]));
    ok('…with the doctor\'s name slot and the ลงนาม dots', !!sign[0]?.querySelector('.print-doctor') && /\(ลงนาม\)/.test(sign[0].textContent));
    eq('…and only the doctor and the code, as before: the ID and date stay in the box', [...(sign[0]?.children || [])].map(c => squash(c.textContent).replace(/\.{4,}/g, '…')),
      ['แพทย์ … (ลงนาม)', 'รหัส …']);
    ok('…14 px below what it signs, as before', sign[0]?.style.marginTop === '14px', sign[0]?.style.marginTop);
    ok('the provenance footer is still the form\'s last child', /NeoFeed · constants/.test(form.lastElementChild.textContent) && !form.lastElementChild.closest('.print-back'));
    forms['no critical alert'] = form.outerHTML;
  });

  // Every title above, plus whatever the heavy order really raised: the fullest box an order can print.
  const alertsAll = [...new Set([...heavy.alerts, ...ALERTS_13])];
  await section('§1b a confirmed critical value: the signature is inside the red box', async () => {
    mount({ ...recorder(), editEntry: reopened(heavy.row, { reason: REASON_300, alerts: alertsAll }) });
    const form = printForm();
    const box = form?.querySelector('.print-crit-box');
    ok('the red box is there', !!box);
    eq('…with its three texts, unchanged', [
      /^✔ แพทย์ยืนยันคำสั่ง \(ยืนยันพร้อมเหตุผลตอนบันทึก\)/.test(squash(box?.querySelector('.crit-confirmed')?.textContent)),
      squash(box?.textContent).includes('⚠ สั่งทั้งที่มีค่าวิกฤต: ' + alertsAll.join('; ')),
      squash(box?.textContent).includes('เหตุผล: ' + REASON_300),
    ], [true, true, true]);
    eq('one signature line on the sheet', form.querySelectorAll('.print-sign').length, 1);
    ok('…and it is inside the box', !!box && !!box.querySelector('.print-sign') && box.contains(form.querySelector('.print-doctor')));
    const parts = [box?.querySelector('.crit-confirmed'), [...(box?.querySelectorAll('div') || [])].find(d => /^เหตุผล:/.test(d.textContent)), box?.querySelector('.print-sign')];
    ok('…after the confirmation and the reason it signs', parts.every(Boolean) && FOLLOWS(parts[0], parts[1]) && FOLLOWS(parts[1], parts[2]));
    ok('the box follows the lipid pump rate and is a direct child of the form',
      box?.parentElement === form && FOLLOWS(form.querySelector('.print-lipid-rate'), box));
    ok('the provenance footer is still the form\'s last child', /NeoFeed · constants/.test(form.lastElementChild.textContent));

    // Pp, 2026-11-02: if the box moves whole to page 2, that page must still name the infant and the day.
    const top = topStrings(form), sign = box?.querySelector('.print-sign');
    eq('the signature line names the infant and the day, between the doctor and the code', [...(sign?.children || [])].map(c => squash(c.textContent).replace(/\.{4,}/g, '…')),
      ['แพทย์ … (ลงนาม)', `NeoFeed ID: ${top.id} · วันที่ให้ TPN: ${top.date}`, 'รหัส …']);
    ok('…the same ID and date strings the sheet prints at its top', top.id === 'OP-1' && /^\d\d\/\d\d\/\d{4}$/.test(top.date), top);
    ok('…as plain text, not <strong>, so no figure sweep reads them', !sign?.querySelector('strong'));
    ok('…and the doctor\'s name slot is still the only .print-doctor', form.querySelectorAll('.print-doctor').length === 1);

    // Room to sign by hand (Vera, 2026-11-02): the gap above the line was cut to 10 px when it moved into the box.
    ok('the signature line is at least 14 px below the reason', parseFloat(sign?.style.marginTop) >= 14, sign?.style.marginTop);
    ok('…and the box has at least 8 px of padding under it before the red border', parseFloat(box?.style.paddingBottom) >= 8, box?.style.paddingBottom);
    // The ID a real order carries is "NF-" and six digits (since 2026-09-27); a 36-character one is the worst case for the row.
    mount({ ...recorder(), patient: pt({ sessionId: 'NF-482913' }), editEntry: reopened(heavy.row, { reason: REASON_300, alerts: alertsAll }) });
    forms[`${alertsAll.length} alerts, 300-character reason`] = printForm().outerHTML;
    mount({ ...recorder(), patient: pt({ sessionId: UUID }), editEntry: reopened(heavy.row, { reason: REASON_300, alerts: alertsAll }) });
    forms[`${alertsAll.length} alerts, a ${UUID.length}-character ID (layout only)`] = printForm().outerHTML;

    mount({ ...recorder(), editEntry: reopened(one.row, { reason: REASON_40, alerts: one.alerts }) });
    ok('one alert with a 40-character reason: the same box, the same signature inside it',
      !!printForm()?.querySelector('.print-crit-box .print-sign') && printForm().querySelectorAll('.print-sign').length === 1);
    forms[`${one.alerts.length} alert, 40-character reason`] = printForm()?.outerHTML;

    // An order that does not fit: every alert, a 300-character reason and a long diagnosis (§2b prints it).
    mount({ ...recorder(), patient: pt({ diagnosis: DIAG_600 }), editEntry: reopened(heavy.row, { reason: REASON_300, alerts: alertsAll }) });
    ok('a 600-character diagnosis prints in full', squash(printForm()?.textContent).includes(DIAG_600.trim().slice(0, 590)), '');
    forms.overflow = printForm()?.outerHTML;
  });

  await section('§1c nothing printed is cut or shrunk to make room', async () => {
    mount({ ...recorder(), editEntry: reopened(heavy.row, { reason: REASON_300, alerts: alertsAll }) });
    const form = printForm();
    const aa = [...form.querySelectorAll('td')].find(td => td.textContent.trim() === 'Amino acid')?.nextElementSibling;
    const picked = aa?.querySelector('.print-aa-picked'), others = aa?.querySelector('.print-aa-others');
    ok('the amino-acid cell is two lines: the ticked product with its dose, then the other choices', !!picked && !!others && aa.children.length === 2);
    ok('…the ticked line carries the product ☑ and its dose', /^☑ 10% Aminoven infant \/ PED AMINE \(0-1 yr\.\)\s*= 4\.6 g\/kg\/d = [\d.]+ mL$/.test(squash(picked?.textContent)), squash(picked?.textContent));
    eq('…the other four choices and "Other" follow, all unticked',
      [...(others?.children || [])].map(c => squash(c.textContent)),
      ['☐ 10% Amiparen (>1 Yr.)', '☐ 8% Aminoleban', '☐ 7% Nephrosteril', '☐ 15% Aminoplasmal', '☐ Other ........']);

    // A figure is a <strong>: its size is the nearest inline font size going up, else the form's own 10.5.
    const sizeOf = (el) => { for (let e = el; e && e !== form.parentElement; e = e.parentElement) { if (e.style?.fontSize) return parseFloat(e.style.fontSize); } return 10.5; };
    const back = form.querySelector('.print-back');
    const small = [...form.querySelectorAll('strong')].filter(s => !back?.contains(s) && sizeOf(s) < 10);
    eq('every figure on the doctor\'s sheet is 10 px or larger', small.map(s => [s.textContent, sizeOf(s)]), []);
    const sizes = [...form.querySelectorAll('td,th')].filter(c => !back?.contains(c)).map(c => parseFloat(c.style.fontSize || '0')).filter(Boolean);
    ok('…and no cell is set smaller than 10 px (they were 10 px before)', sizes.length > 30 && Math.min(...sizes) >= 10, Math.min(...sizes));
  });

  await section('§1d an order saved with Aminoplasmal 15% (a ward that is offered it)', async () => {
    const realGate = D.aaProductsFor;
    D.aaProductsFor = () => ['aminoven10', 'aminoplasmal15'];   // no ward is offered it today (verify-ward-requests-0918.cjs §9)
    try {
      mount({ ...recorder(), editEntry: reopened(mild.row, null, { aaProduct: 'aminoplasmal15' }) });
      const form = printForm();
      const aa = [...(form?.querySelectorAll('td') || [])].find(td => td.textContent.trim() === 'Amino acid')?.nextElementSibling;
      const picked = aa?.querySelector('.print-aa-picked'), others = aa?.querySelector('.print-aa-others');
      ok('the order prints', !!form && !!aa);
      ok('the ticked line reads ☑ 15% Aminoplasmal with its dose', /^☑ 15% Aminoplasmal\s*= 3 g\/kg\/d = [\d.]+ mL$/.test(squash(picked?.textContent)), squash(picked?.textContent));
      eq('…the other choices start with the ten-percent Aminoven, unticked, and none is ticked',
        [...(others?.children || [])].map(c => squash(c.textContent)),
        ['☐ 10% Aminoven infant / PED AMINE (0-1 yr.)', '☐ 10% Amiparen (>1 Yr.)', '☐ 8% Aminoleban', '☐ 7% Nephrosteril', '☐ Other ........']);
      ok('…and the product is ticked once on the sheet', (squash(aa?.textContent).match(/☑/g) || []).length === 1);
    } finally { D.aaProductsFor = realGate; }
  });

  await section('§1e the fit test lists every critical title the app can raise', async () => {
    const lines = (R('calculator.jsx').match(/level: "crit"/g) || []).length;
    eq(`calculator.jsx raises ${CRIT_LINES_IN_SOURCE} kinds of critical alert; a new one needs a place in ALERTS_13 or a reason it is not there`, lines, CRIT_LINES_IN_SOURCE);
    eq('the list holds 13 distinct titles', new Set(ALERTS_13).size, 13);
    const src = R('calculator.jsx');
    const named = ['TPN calc. weight far from automatic', 'GIR critically high', 'Lipid critically out of range', 'Potassium critically out of range',
      'Osmolarity > peripheral limit', 'Dextrose over KCMH max', 'K⁺ concentration too high', 'Lipid rate above the ceiling', 'ไม่มี P'];
    eq('…each of the literal ones is still spelled that way in calculator.jsx', named.filter(t => !src.includes(t)), []);
  });

  await section('§1f both shells carry the print rules', async () => {
    for (const shell of ['index.html', 'NeoFeed.html']) {
      const print = R(shell).slice(R(shell).indexOf('@media print'));
      ok(`${shell}: the red box and the signature line never split`,
        /#print-form \.print-crit-box,\s*#print-form \.print-sign\s*\{\s*break-inside:\s*avoid;\s*page-break-inside:\s*avoid;\s*\}/.test(print), '');
      ok(`${shell}: cells print at a 1.35 line height`, /#print-form td,\s*#print-form th\s*\{\s*line-height:\s*1\.35;\s*\}/.test(print), '');
    }
  });

  // ── §2 a real browser ──────────────────────────────────────────────────────────────────────────
  // Which page does each marked piece land on? Chrome writes a /Link annotation on the page where a link falls, as
  // plain text in the PDF (no library needed): page objects list their annotations, annotations carry the URL.
  function pagesOfMarkers(pdf) {
    const s = pdf.toString('latin1');
    const objs = {};
    for (const m of s.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) objs[m[1]] = m[2];
    const urlOf = {};
    for (const [num, body] of Object.entries(objs)) {
      const u = body.match(/\/URI\s*\(([^)]*)\)/);
      if (u && /\/Subtype\s*\/Link/.test(body)) urlOf[num] = u[1].replace('https://marker.invalid/', '');
    }
    const kids = [];
    for (const body of Object.values(objs)) {
      if (/\/Type\s*\/Pages/.test(body)) { const k = body.match(/\/Kids\s*\[([^\]]*)\]/); if (k) for (const r of k[1].matchAll(/(\d+) 0 R/g)) kids.push(r[1]); }
    }
    const on = {};
    kids.forEach((pageObj, i) => {
      const an = (objs[pageObj].match(/\/Annots\s*\[([^\]]*)\]/) || [])[1] || '';
      for (const r of an.matchAll(/(\d+) 0 R/g)) { const u = urlOf[r[1]]; if (u) (on[u] = on[u] || new Set()).add(i + 1); }
    });
    return { pages: kids.length, on: Object.fromEntries(Object.entries(on).map(([k, v]) => [k, [...v].sort()])) };
  }

  await section('§2 Chromium: each order is one A4 page', async () => {
    let chromium;
    try { chromium = require('playwright').chromium; }
    catch { console.log('  SKIP  playwright not installed — §1 only'); return; }
    const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
    let browser;
    try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
    catch (e) { console.log('  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); return; }
    try {
      // The shells' own CSS and nothing else: no app script runs on this page.
      const css = [...R('index.html').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
      const wide = `@media print { #print-form, #print-form * { font-family: 'DejaVu Sans', Verdana, sans-serif !important; } }`;
      const MM = 96 / 25.4;
      const open = async (html, extraCss = '') => {
        const page = await browser.newPage({ viewport: { width: Math.round(190 * MM), height: 1200 } });
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}\n${wide}\n${extraCss}</style></head>`
          + `<body><div id="root"><div class="app"><div class="work"><div class="work-inner">${html}</div></div></div></div></body></html>`);
        await page.emulateMedia({ media: 'print' });
        return page;
      };
      const measured = {};
      for (const [label, html] of Object.entries(forms)) {
        if (label === 'overflow') continue;
        const page = await open(html);
        const heightMm = await page.evaluate(() => document.getElementById('print-form').getBoundingClientRect().height * 25.4 / 96);
        const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
        const pages = pagesOfMarkers(pdf).pages;
        measured[label] = { pages, heightMm: Math.round(heightMm * 10) / 10 };
        const layoutOnly = /layout only/.test(label);   // a 36-character ID wraps the ID row; it must not overlap, it need not fit
        if (!layoutOnly) eq(`${label}: the doctor's sheet prints on one A4 page`, pages, 1);
        // The rules reach the real elements in a real browser (a renamed class would leave them dangling).
        const used = await page.evaluate(() => {
          const cs = (el) => el ? getComputedStyle(el) : null;
          const box = document.querySelector('#print-form .print-crit-box');
          const sign = document.querySelector('#print-form .print-sign');
          const td = document.querySelector('#print-form td[style*="border"]');   // a ruled cell of the electrolyte table, not the patient table
          const reason = box && [...box.querySelectorAll('div')].find(d => /^เหตุผล:/.test(d.textContent) && !d.querySelector('div'));
          const px = (el) => el.getBoundingClientRect();
          const kids = sign ? [...sign.children].map(px) : [];
          return { box: box ? cs(box).breakInside : 'none', sign: cs(sign)?.breakInside, lineHeight: cs(td)?.lineHeight, tdFont: cs(td)?.fontSize,
            gapAbove: box && reason ? px(sign).top - px(reason).bottom : null, below: box ? px(box).bottom - px(sign).bottom : null,
            overlap: kids.some((a, i) => kids.some((b, j) => j > i && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5)),
            nKids: kids.length };
        });
        const hasBox = !/^no /.test(label);
        eq(`${label}: the signature line is break-inside: avoid${hasBox ? ', and so is the red box' : ''}`, [used.sign, used.box], ['avoid', hasBox ? 'avoid' : 'none']);
        ok(`${label}: …cells are 1.35 times their 10 px font (${used.lineHeight} for ${used.tdFont})`, used.tdFont === '10px' && parseFloat(used.lineHeight) === 13.5, used);
        if (hasBox) {
          ok(`${label}: …${Math.round(used.gapAbove)} px above the signature line and ${Math.round(used.below)} px below it to sign by hand`, used.gapAbove >= 14 && used.below >= 10, used);
          ok(`${label}: …its ${used.nKids} parts (doctor, ID and date, code) do not overlap, whatever the ID's length`, used.nKids === 3 && !used.overlap, used);
        }
        if (!layoutOnly) ok(`${label}: …the form is ${measured[label].heightMm} mm tall, the page holds 281`, heightMm < 281, heightMm);
        await page.close();
      }
      console.log('  info  measured in DejaVu Sans / Verdana:', JSON.stringify(measured));

      // §2b an order that does not fit: the box and its signature move whole, and page 2 names the infant.
      // A link around each piece of the box tells which page it landed on. Padding before the box brings its
      // middle to the bottom of page 1, so that without the rule it would be cut there (the form is mostly
      // as long as the font makes it: the padding only makes sure the test meets a split box in any font).
      const marked = async (extraCss) => {
        const page = await open(forms.overflow, extraCss);
        const info = await page.evaluate(() => {
          const form = document.getElementById('print-form');
          const box = form.querySelector('.print-crit-box');
          const link = (el, name) => { const a = document.createElement('a'); a.href = 'https://marker.invalid/' + name; a.style.cssText = 'color:inherit;text-decoration:none'; while (el.firstChild) a.appendChild(el.firstChild); el.appendChild(a); };
          const red = box.querySelector('.crit-confirmed').parentElement;
          const alertsText = [...red.childNodes].find(c => c.nodeType === 3 && /ค่าวิกฤต/.test(c.data));
          const alertsLine = document.createElement('span'); alertsText.replaceWith(alertsLine); alertsLine.append(alertsText);
          link(box.querySelector('.crit-confirmed'), 'confirmed');
          link(alertsLine, 'alerts');
          link([...red.children].find(d => /^เหตุผล:/.test(d.textContent)), 'reason');
          link(box.querySelector('.print-sign > div:first-child'), 'signature');
          link(box.querySelector('.print-sign-id'), 'idAndDate');
          const H = 281 * 96 / 25.4, f = form.getBoundingClientRect(), b = box.getBoundingClientRect();
          const boxTop = b.top - f.top, boxH = b.height;
          const pad = Math.max(0, H - 0.5 * boxH - boxTop);
          if (pad > 0) { const sp = document.createElement('div'); sp.style.height = pad + 'px'; box.before(sp); }
          return { padMm: Math.round(pad * 25.4 / 96), boxTopMm: Math.round(boxTop * 25.4 / 96), boxHeightMm: Math.round(boxH * 25.4 / 96) };
        });
        const res = pagesOfMarkers(await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true }));
        await page.close();
        return { ...res, info };
      };
      const kept = await marked('');
      console.log('  info  overflow order:', JSON.stringify(kept.info), JSON.stringify(kept.on));
      eq('an order that does not fit prints on two pages', kept.pages, 2);
      eq('…the whole red box is on page 2: confirmation, alerts, reason, signature, and the ID and date',
        ['confirmed', 'alerts', 'reason', 'signature', 'idAndDate'].map(k => kept.on[k]), [[2], [2], [2], [2], [2]]);
      const split = await marked(`@media print { #print-form .print-crit-box, #print-form .print-sign { break-inside: auto !important; page-break-inside: auto !important; } }`);
      ok('…and with break-inside switched off the same order splits the box between the pages (the check can see a split)',
        split.pages === 2 && split.on.confirmed?.[0] === 1 && split.on.signature?.[0] === 2, split.on);
    } finally { await browser.close(); }
  });

  console.log(`\nONE-PAGE ORDER: ${fail ? 'FAILURES' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
  process.exit(fail ? 1 : 0);
})();
