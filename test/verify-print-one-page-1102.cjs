// verify-print-one-page-1102.cjs — the doctor's printed order is one A4 page at its fullest,
// with the signature on the same page as the order (Pp, 2026-11-02: "แยก PR แก้ให้พอดี 1 หน้า";
// and "อยากให้มีลายเซ็นอยู่ในหน้าเดียวกัน" when a doctor confirms a critical value).
//
// Before this, the fullest order printed on two pages: the red box was cut by the page break, and its
// reason, the doctor's signature line and the provenance footer fell on page 2 (11 critical alerts, a
// 300-character reason, every stock line and five oral lines: about 30 mm too long; one alert, about
// 13 mm). What changed, with no font size lowered and no line removed or abbreviated:
//   - the amino-acid choices are two lines (the ticked product with its dose, then the other choices side by side);
//   - cell padding 3px -> 1.5px and a 1.35 line height on cells; the form's own 4mm 6mm padding -> 0 2mm
//     (the page already has its 8mm 10mm margins);
//   - the signature line sits inside the red box when a critical value was confirmed, and the box and the
//     line never split across a page break (break-inside: avoid, in the shells' @media print block).
//
//   §1 jsdom: the markup that carries it, on three orders saved through the real Submit (no critical alert,
//      one, several). The signature is inside the red box (and the only one), the box keeps its three
//      texts, with no critical value there is no box and the line stands alone; the amino-acid cell prints
//      all five products and "Other" once each; every figure stays at 10 px or more; the shells carry the
//      print rules; the footer is still the form's last child.
//   §2 Chromium, when playwright is installed (SKIP without it; CI runs it): the form of each order is
//      printed to a PDF with the shells' own CSS, and each is ONE page. It is printed in a wide font
//      (DejaVu Sans / Verdana) on purpose: a CI machine has neither IBM Plex nor Sarabun, and a fallback
//      wider than the ward's font can only make the page fuller, so a pass is not an accident of a
//      narrow fallback.
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

const pt = () => ({ sessionId: 'OP-1', name: 'OP', bw: 1000, currentBed: 'NICU 4', diagnosis: '-',
  weights: [{ dol: 1, w: 1000 }], admissionDate: '2026-10-18' });
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
// The names Submit's own prompt lists when an order raises 11 critical alerts at once.
const ALERTS_11 = ['TPN calc. weight far from automatic', 'GIR critically high', 'Protein critically out of range',
  'Energy critically out of range', 'Lipid critically out of range', 'Potassium critically out of range',
  'Magnesium below 1 mg/kg/d: พิมพ์เป็น mEq หรือเปล่า', 'Osmolarity > peripheral limit', 'Dextrose over KCMH max',
  'Lipid rate above the ceiling', 'Zinc total above 5 mg/day'];

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
const reopened = (row, critOverride) => {
  const calcInput = { ...row.calcInput };
  delete calcInput.critOverride;
  if (critOverride) calcInput.critOverride = { ...critOverride, at: '2026-11-02T03:00:00Z' };
  return { ...row, entryId: 'e1', lastModified: 'lm1', ts: '2026-11-02', published: '2026-11-02T03:00:00Z',
    publishedBy: 'onepage@kcmh.test', revisionNumber: 1, calcInput };
};
const oralLines = (form) => [...form.querySelectorAll('td')].find(td => td.textContent.trim() === '8. Other')?.nextElementSibling?.children.length;

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

  await section('§1a no critical value: the signature line stands alone', async () => {
    mount({ ...recorder(), editEntry: reopened(mild.row, null) });
    const form = printForm();
    ok('the order prints', !!form);
    ok('there is no red box', !form.querySelector('.print-crit-box') && !form.querySelector('.crit-confirmed'));
    const sign = form.querySelectorAll('.print-sign');
    eq('one signature line', sign.length, 1);
    ok('…a direct child of the form, after the lipid pump rate',
      sign[0]?.parentElement === form && FOLLOWS(form.querySelector('.print-lipid-rate'), sign[0]));
    ok('…with the doctor\'s name slot and the ลงนาม dots', !!sign[0]?.querySelector('.print-doctor') && /\(ลงนาม\)/.test(sign[0].textContent));
    ok('the provenance footer is still the form\'s last child', /NeoFeed · constants/.test(form.lastElementChild.textContent) && !form.lastElementChild.closest('.print-back'));
    forms['no critical alert'] = form.outerHTML;
  });

  // The 11 an order can raise at once: the heavy order's own, padded out with the names Submit's prompt lists.
  const alerts11 = [...new Set([...heavy.alerts, ...ALERTS_11])].slice(0, Math.max(11, heavy.alerts.length));
  await section('§1b a confirmed critical value: the signature is inside the red box', async () => {
    mount({ ...recorder(), editEntry: reopened(heavy.row, { reason: REASON_300, alerts: alerts11 }) });
    const form = printForm();
    const box = form?.querySelector('.print-crit-box');
    ok('the red box is there', !!box);
    eq('…with its three texts, unchanged', [
      /^✔ แพทย์ยืนยันคำสั่ง \(ยืนยันพร้อมเหตุผลตอนบันทึก\)/.test(squash(box?.querySelector('.crit-confirmed')?.textContent)),
      squash(box?.textContent).includes('⚠ สั่งทั้งที่มีค่าวิกฤต: ' + alerts11.join('; ')),
      squash(box?.textContent).includes('เหตุผล: ' + REASON_300),
    ], [true, true, true]);
    eq('one signature line on the sheet', form.querySelectorAll('.print-sign').length, 1);
    ok('…and it is inside the box', !!box && !!box.querySelector('.print-sign') && box.contains(form.querySelector('.print-doctor')));
    const parts = [box?.querySelector('.crit-confirmed'), [...(box?.querySelectorAll('div') || [])].find(d => /^เหตุผล:/.test(d.textContent)), box?.querySelector('.print-sign')];
    ok('…after the confirmation and the reason it signs', parts.every(Boolean) && FOLLOWS(parts[0], parts[1]) && FOLLOWS(parts[1], parts[2]));
    ok('the box follows the lipid pump rate and is a direct child of the form',
      box?.parentElement === form && FOLLOWS(form.querySelector('.print-lipid-rate'), box));
    ok('the provenance footer is still the form\'s last child', /NeoFeed · constants/.test(form.lastElementChild.textContent));
    forms[`${alerts11.length} alerts, 300-character reason`] = form.outerHTML;

    mount({ ...recorder(), editEntry: reopened(one.row, { reason: REASON_40, alerts: one.alerts }) });
    ok('one alert with a 40-character reason: the same box, the same signature inside it',
      !!printForm()?.querySelector('.print-crit-box .print-sign') && printForm().querySelectorAll('.print-sign').length === 1);
    forms[`${one.alerts.length} alert, 40-character reason`] = printForm()?.outerHTML;
  });

  await section('§1c nothing printed is cut or shrunk to make room', async () => {
    mount({ ...recorder(), editEntry: reopened(heavy.row, { reason: REASON_300, alerts: alerts11 }) });
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

  await section('§1d both shells carry the print rules', async () => {
    for (const shell of ['index.html', 'NeoFeed.html']) {
      const print = R(shell).slice(R(shell).indexOf('@media print'));
      ok(`${shell}: the red box and the signature line never split`,
        /#print-form \.print-crit-box,\s*#print-form \.print-sign\s*\{\s*break-inside:\s*avoid;\s*page-break-inside:\s*avoid;\s*\}/.test(print), '');
      ok(`${shell}: cells print at a 1.35 line height`, /#print-form td,\s*#print-form th\s*\{\s*line-height:\s*1\.35;\s*\}/.test(print), '');
    }
  });

  // ── §2 a real browser ──────────────────────────────────────────────────────────────────────────
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
      const measured = {};
      for (const [label, html] of Object.entries(forms)) {
        const page = await browser.newPage({ viewport: { width: Math.round(190 * MM), height: 1200 } });
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}\n${wide}</style></head>`
          + `<body><div id="root"><div class="app"><div class="work"><div class="work-inner">${html}</div></div></div></div></body></html>`);
        await page.emulateMedia({ media: 'print' });
        const heightMm = await page.evaluate(() => document.getElementById('print-form').getBoundingClientRect().height * 25.4 / 96);
        const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
        const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
        measured[label] = { pages, heightMm: Math.round(heightMm * 10) / 10 };
        eq(`${label}: the doctor's sheet prints on one A4 page`, pages, 1);
        // The rules reach the real elements in a real browser (a renamed class would leave them dangling).
        const used = await page.evaluate(() => {
          const cs = (el) => el ? getComputedStyle(el) : null;
          const box = document.querySelector('#print-form .print-crit-box');
          const sign = document.querySelector('#print-form .print-sign');
          const td = document.querySelector('#print-form td[style*="border"]');   // a ruled cell of the electrolyte table, not the patient table
          return { box: box ? cs(box).breakInside : 'none', sign: cs(sign)?.breakInside, lineHeight: cs(td)?.lineHeight, tdFont: cs(td)?.fontSize };
        });
        eq(`${label}: the signature line is break-inside: avoid${/alert/.test(label) && !/^no /.test(label) ? ', and so is the red box' : ''}`,
          [used.sign, /^no /.test(label) ? 'none' : used.box], ['avoid', /^no /.test(label) ? 'none' : 'avoid']);
        ok(`${label}: …cells are 1.35 times their 10 px font (${used.lineHeight} for ${used.tdFont})`, used.tdFont === '10px' && parseFloat(used.lineHeight) === 13.5, used);
        ok(`${label}: …the form is ${measured[label].heightMm} mm tall, the page holds 281`, heightMm < 281, heightMm);
        await page.close();
      }
      console.log('  info  measured in DejaVu Sans / Verdana:', JSON.stringify(measured));
    } finally { await browser.close(); }
  });

  console.log(`\nONE-PAGE ORDER: ${fail ? 'FAILURES' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
  process.exit(fail ? 1 : 0);
})();
