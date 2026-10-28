// verify-show-working-1028.cjs — NF-12: the Calculator says what its numbers rest on.
//
// NOURISH (JAMA Pediatrics; journal club 2026-09-29) found standard fortification
// enough and did not support routine milk analysis, so NeoFeed keeps an assumed
// breast milk and says so. Each result line can also show its working, so a
// doctor can check a number in seconds (NF-12, Pp's apply list of 2026-10-27).
//
//   §1  the ward view: Step 3 gets one row of four collapsed toggles (GIR,
//       Osmolarity, Energy, Protein); no working text is on the page until one
//       is pressed, and pressing one changes no tile;
//   §2  Step 2 names the breast milk it assumes: protein and kcal per 100 mL
//       from EN_DB.BM_20 with that row's source, what Enfamil HMF adds (from
//       EN_HMF_PROTEIN_G_PER_DOSE and the Chula p. 10 column) with its source,
//       and one line that real milk varies; for BM, BM + HMF and FBM ↔
//       Infatrini, a MEN feed included; never for a formula or with no feed;
//   §3  the line and the limits read the constants themselves: change the value
//       in window.NEOFEED_DATA and the screen follows (no copy in the JSX);
//   §4  each panel names its formula, the inputs used, the unit conversion and
//       the limit with its CR- IDs, its result is the tile's figure, and its
//       inputs recompute to that figure; three inputs are checked by hand
//       arithmetic, not the app's formula;
//   §5  every CR- ID a panel names is a rule heading in the clinical-rules skill;
//   §6  the pharmacy gets the same thing: the print form is identical with
//       every panel open as with none and carries none of the new text; a
//       patient's order has no Copy (main, 2026-10-28), so the quick calc's
//       copied text is checked the same way;
//   §7  no trailing zero and no float tail in any of the new text;
//   §8  Vera's three cases on this PR;
//   §9  two feeds (main's #182): the milk line follows the feeds given, not
//       feed 1's picker, and the energy and protein panels give each feed its
//       own line (its mL, its row per 100 mL, its source) adding up to the total.
//
// Fails on 326bcd9 (main before NF-12): there is no toggle, no panel and no
// assumption line. NEGATIVE_CONTROL proves it bites; each must FAIL:
//   1  calculator.jsx: dextrose at 3.5 kcal/g in the memo (the panel's text says 3.4)
//   2  calculator.jsx: the BM protein typed into the JSX instead of read from EN_DB
// Mounts the real <Calculator> in jsdom: the deps in test/README.md.
// Synthetic infants only.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const R = (f) => fs.readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n');
const SKILL = '.claude/skills/neofeed-clinical-rules/SKILL.md';

let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(76)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
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
window.prompt = () => 'working check';
// Node ≥ 21 has its own global navigator, and the Calculator run through vm
// sees that one: stub the clipboard on both (test/README.md).
let copied = null;
const clipboardStub = { writeText: (t) => { copied = t; return Promise.resolve(); } };
try { Object.defineProperty(window.navigator, 'clipboard', { value: clipboardStub, configurable: true }); }
catch { try { window.navigator.clipboard.writeText = clipboardStub.writeText; } catch {} }
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch {}
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
const NEG = process.env.NEGATIVE_CONTROL || '';
const PATCHES = {
  1: ['const dexKcal = dexG * 3.4;', 'const dexKcal = dexG * 3.5;', 'dextrose counted at 3.5 kcal/g'],
  2: ['<WorkVal k="bm.pro" v={bm.pro} />', '<WorkVal k="bm.pro" v={1.2} />', 'BM protein typed into the JSX'],
};
const patch = PATCHES[NEG];
if (NEG && !patch) { console.error(`NEGATIVE_CONTROL=${NEG}: use 1 or 2`); process.exit(2); }
function calculatorSource() {
  const s = R('calculator.jsx');
  if (!patch) return [s, 'calculator.jsx'];
  if (!s.includes(patch[0])) { console.error(`NEGATIVE_CONTROL=${NEG}: the text to patch is no longer in calculator.jsx`); process.exit(2); }
  console.log(`NEGATIVE_CONTROL=${NEG}: ${patch[2]} — this run must FAIL`);
  // Not "calculator.jsx": the compiled loader only stands in for the file on disk.
  return [s.replace(patch[0], patch[1]), 'calculator-negative-control.jsx'];
}
vm.runInThisContext(R('data.js'));
const D = window.NEOFEED_DATA;
for (const [code, f] of [[R('icons.jsx'), 'icons.jsx'], calculatorSource()]) {
  vm.runInThisContext(babel.transformSync(code, {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const fieldOf = (label, scope = container) => [...scope.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
const saltRow = (label) => [...container.querySelectorAll('.salt-row-grid')]
  .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label)) || null;
function setField(label, value, scope = container) {
  const input = fieldOf(label, scope)?.querySelector('input') || (scope === container ? saltRow(label)?.querySelector('input') : null);
  if (!input) throw new Error('no field labelled ' + JSON.stringify(label));
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const clickAsync = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const buttonNamed = (sel, name) => [...container.querySelectorAll(sel)].find(b => b.textContent.trim() === name) || null;
function tick(label, want) {
  const lab = [...container.querySelectorAll('label.chk-label')].find(l => l.textContent.includes(label));
  if (!lab) throw new Error('no checkbox labelled ' + JSON.stringify(label));
  const box = lab.querySelector('input[type=checkbox]');
  if (box.checked !== want) act(() => { box.click(); });
}
// Step 2 picks a milk and then its kcal/oz (main's #182), on feed 1 or feed 2.
function feed(key, which = 1) {
  const at = D.enProductOf(key);
  if (!at) throw new Error('Step 2 does not offer ' + key);
  for (const [cls, v] of [['en-product', at.product.id], ['en-strength', key]]) {
    const sel = container.querySelector(`.en-feed-${which} .${cls}`);
    if (!sel) throw new Error(`no .${cls} on feed ${which}`);
    act(() => { selectSetter.call(sel, v); sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
  }
}

// An order typed into the real Calculator, the way verify-clinical-rules.cjs types one.
// `scratch` mounts the quick calc: since main's 14caa41 (Pp, 2026-10-28) it is the
// one Calculator with a Copy, as a patient's order leaves only as the print form.
function mount(c) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  copied = null;
  const patient = c.scratch
    ? { sessionId: null, name: null, initials: null, bw: 0, ga: 0, sex: '', currentBed: '', diagnosis: '', weights: [], lengths: [], hcs: [] }
    : { sessionId: 'NF12-' + c.name, name: 'NF', bw: c.g, currentBed: 'NICU 5', diagnosis: '-',
      weights: [{ dol: 1, w: c.g }], admissionDate: '2026-10-18' };
  act(() => { root.render(React.createElement(window.Calculator, {
    patient, scratch: !!c.scratch, dol: c.dol ?? 10, editEntry: null, baselineEntry: null, previousEntry: null,
    logDate: c.scratch ? null : '2026-10-28',
    userLabel: 'Dr Working (working@kcmh.test)', userEmail: 'working@kcmh.test',
    onLog: () => Promise.resolve({ ok: true, entryId: 'e-nf12', lastModified: 'lm-1' }),
    onUpdate: () => Promise.resolve({ ok: true, lastModified: 'lm-u' }),
    onSaved() {}, onWeightChange() {} })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
  if (c.route) click(buttonNamed('.step2-ctrl .seg button', c.route));
  setField('Current weight', c.g);
  // The quick calc has no intake/output fields; it skips the ones it does not show.
  for (const l of ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']) {
    if (c.scratch && !fieldOf(l)) continue;
    setField(l, l === 'Target fluid' ? (c.fluid ?? 150) : 0);
  }
  if (c.feed) feed(c.feed);
  for (const [label, v] of Object.entries(c.order || {})) setField(label, v);
  // A second feed: `feed2` is its EN_DB key, `order2` its fields inside the Feed 2 box.
  if (c.feed2 || c.order2) {
    const add = buttonNamed('button', '+ Add a second feed (นมชนิดที่ 2)');
    if (!add) throw new Error('no button to add a second feed');
    click(add);
    if (c.feed2) feed(c.feed2, 2);
    for (const [label, v] of Object.entries(c.order2 || {})) setField(label, v, container.querySelector('.en-feed-2'));
  }
  for (const [label, v] of Object.entries(c.tick || {})) tick(label, v);
}

const toggles = () => [...container.querySelectorAll('button.working-toggle')];
const toggle = (id) => toggles().find(b => b.dataset.working === id) || null;
const panel = (id) => container.querySelector(`.working-panel[data-working="${id}"]`);
const vOf = (p, key) => { const el = p?.querySelector(`[data-v="${key}"]`); return el ? Number(el.textContent.trim()) : NaN; };
const tileVal = (label) => {
  const t = [...container.querySelectorAll('.metric')].find(m => m.querySelector('.lbl')?.textContent === label);
  return t ? Number(t.querySelector('.val').firstChild.textContent) : NaN;
};
const girVal = () => Number(container.querySelector('.gir-readout .num')?.firstChild?.textContent);
const assumption = () => container.querySelector('.en-milk-assumption');
const openAll = () => { for (const b of toggles()) if (b.getAttribute('aria-expanded') !== 'true') click(b); };
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

const TRAILING_ZERO = /(?<![\d.])\d+\.\d*0(?!\d)/g;
const FLOAT_NOISE = /\d\.\d{5,}/g;
const badNumbers = (s) => [...(s.match(TRAILING_ZERO) || []), ...(s.match(FLOAT_NOISE) || [])];

// The orders. A: central, every osmolarity term, BM. B: peripheral, BM + HMF.
// C: full feeds of a formula, no bag. D: BM ticked MEN. E: FBM ↔ Infatrini.
// F: TPN only, no feed.
const A = { name: 'A', g: 1000, route: 'Central', feed: 'BM_20',
  order: { 'Volume(mL/day)': 100, 'Dextrose final': 10, 'Amino acid': 3, '20% lipid': 2, '20% NaCl': 3, 'KCl': 2,
    '10% Ca gluconate': 40, 'MgSO₄': 0.4, 'Volume(mL/feed)': 2, 'Frequency': 8 } };
const B = { name: 'B', g: 1500, route: 'Peripheral', feed: 'BM_HMF_24',
  order: { 'Volume(mL/day)': 120, 'Dextrose final': 10, 'Amino acid': 2, 'Volume(mL/feed)': 5, 'Frequency': 8 } };
const C = { name: 'C', g: 1000, fluid: 160, feed: 'FBM_PF_24', order: { 'Volume(mL/feed)': 19, 'Frequency': 8 } };
const Dm = { name: 'D', g: 1000, route: 'Central', feed: 'BM_20',
  order: { 'Volume(mL/day)': 100, 'Dextrose final': 10, 'Amino acid': 3, 'Volume(mL/feed)': 3, 'Frequency': 8 }, tick: { 'MEN (trophic)': true } };
const E = { name: 'E', g: 2000, fluid: 160, feed: 'FBM_INF_MIX', order: { 'Volume(mL/feed)': 40, 'Frequency': 8 } };
const F = { name: 'F', g: 1000, route: 'Central',
  order: { 'Volume(mL/day)': 100, 'Dextrose final': 10, 'Amino acid': 3 } };

const fmt = (v, d) => D.displayNum(v, d);
const BM = D.EN_DB.BM_20, BMH = D.EN_DB.BM_HMF_24;

(async () => {
  await section('§1 the ward view: four collapsed toggles, no working text, tiles unchanged', async () => {
    mount(A);
    const ids = toggles().map(b => b.dataset.working);
    ok('Step 3 has one toggle each for GIR, osmolarity, energy and protein', JSON.stringify(ids) === JSON.stringify(['gir', 'osm', 'kcal', 'protein']), ids);
    ok('every toggle starts collapsed (aria-expanded false)', toggles().length === 4 && toggles().every(b => b.getAttribute('aria-expanded') === 'false'),
      toggles().map(b => b.getAttribute('aria-expanded')));
    ok('no working panel is in the page until a toggle is pressed', container.querySelectorAll('.working-panel').length === 0);
    const page = text(container);
    for (const s of ['สูตร', 'แปลงหน่วย', 'CR-GIR-MAX', 'CR-U-OSM', '× 1,000 ÷']) ok(`collapsed: "${s}" is nowhere on the page`, !page.includes(s));
    const tilesBefore = text(container.querySelector('.metric-tiles-4')) + '|' + text(container.querySelector('.gir-readout'));
    const alertsBefore = text(container.querySelector('.calc-bottom'));
    click(toggle('gir'));
    ok('pressing GIR opens its panel and only that one', !!panel('gir') && container.querySelectorAll('.working-panel').length === 1);
    ok('…and marks its toggle expanded', toggle('gir').getAttribute('aria-expanded') === 'true');
    openAll();
    ok('all four panels open together', ['gir', 'osm', 'kcal', 'protein'].every(id => !!panel(id)));
    ok('opening every panel changes no tile and no GIR readout',
      text(container.querySelector('.metric-tiles-4')) + '|' + text(container.querySelector('.gir-readout')) === tilesBefore);
    ok('…and no alert or save-panel text', text(container.querySelector('.calc-bottom')) === alertsBefore);
    click(toggle('gir'));
    ok('pressing GIR again closes its panel', !panel('gir') && toggle('gir').getAttribute('aria-expanded') === 'false');
  });

  await section('§2 Step 2 names the breast milk it assumes, and its source', async () => {
    mount(A);
    const a = assumption();
    ok('breast milk with a volume: the assumption is shown in Step 2', !!a && !!a.closest('.en-delivered'));
    const t = text(a);
    ok(`it names protein ${fmt(BM.pro, 2)} g and ${fmt(BM.kcal, 1)} kcal per 100 mL (EN_DB.BM_20)`,
      vOf(a, 'bm.pro') === Number(fmt(BM.pro, 2)) && vOf(a, 'bm.kcal') === Number(fmt(BM.kcal, 1)) && t.includes('100 mL'), t);
    ok('it names the row\'s own source (WHO 2006 Box 1.3.1; kcal Chula p. 8)', t.includes(BM.source), t);
    ok('it says real milk varies between mothers', t.includes('นมแม่จริงแต่ละคนมีโปรตีนและพลังงานไม่เท่ากัน'), t);
    ok('plain breast milk has no fortifier line', !a.querySelector('[data-v="hmf.pro"]'));
    ok('the line is tagged with its rule, CR-U-BREASTMILK', a.dataset.rule === 'CR-U-BREASTMILK', a.dataset.rule);

    mount(B);
    const b = assumption(), tb = text(b);
    const g = D.EN_HMF_PROTEIN_G_PER_DOSE, h = D.EN_SRC_CHULA_ENFAMIL_HMF_PER_G_PROTEIN;
    ok('data.js exports the HMF dose and the Chula p. 10 column it is computed from', g === 1.1 && h && h.kcal === 13, { g, h });
    ok('BM + HMF: the base milk is named as for BM', vOf(b, 'bm.pro') === Number(fmt(BM.pro, 2)) && vOf(b, 'bm.kcal') === Number(fmt(BM.kcal, 1)), tb);
    ok(`HMF adds protein ${fmt(g, 2)} g and ${fmt(h.kcal * g, 1)} kcal per 100 mL`,
      vOf(b, 'hmf.pro') === Number(fmt(g, 2)) && vOf(b, 'hmf.kcal') === Number(fmt(h.kcal * g, 1)), tb);
    ok(`…for ${fmt(BMH.pro, 2)} g and ${fmt(BMH.kcal, 1)} kcal per 100 mL in all (EN_DB.BM_HMF_24)`,
      vOf(b, 'bmhmf.pro') === Number(fmt(BMH.pro, 2)) && vOf(b, 'bmhmf.kcal') === Number(fmt(BMH.kcal, 1)), tb);
    ok('base + addition = the BM + HMF row (2.3 g; 81.3 kcal)', near(vOf(b, 'bm.pro') + vOf(b, 'hmf.pro'), vOf(b, 'bmhmf.pro'), 1e-9)
      && near(vOf(b, 'bm.kcal') + vOf(b, 'hmf.kcal'), vOf(b, 'bmhmf.kcal'), 1e-9), tb);
    ok('the fortifier\'s source is the BM + HMF row\'s, Chula p. 10 and WHO Box 1.3.3',
      tb.includes('Chula Handbook p. 10') && tb.includes('WHO 2006 Box 1.3.3') && BMH.source.includes('Chula Handbook p. 10'), tb);
    ok('the milk-varies line is there for BM + HMF too', tb.includes('นมแม่จริงแต่ละคนมีโปรตีนและพลังงานไม่เท่ากัน'));

    mount(Dm);
    ok('a MEN feed of breast milk still names its milk (Step 2 shows what it provides)', !!assumption());
    mount(E);
    const e = assumption();
    ok('FBM ↔ Infatrini: base milk and HMF named, and the mix row\'s own note', !!e && !!e.querySelector('[data-v="hmf.pro"]')
      && text(e).includes(D.EN_DB.FBM_INF_MIX.note), text(e));
    mount(C);
    ok('a formula (Hi-Q LBW 24) has no breast-milk line', !assumption());
    mount(F);
    ok('no feed volume: no breast-milk line', !assumption());
  });

  await section('§3 the screen reads the constants, not a copy', async () => {
    const keep = { bm: D.EN_DB.BM_20, g: D.EN_HMF_PROTEIN_G_PER_DOSE, gir: D.GIR_HARD_HI, kcal: D.KCAL_HARD_HI,
      pro: D.PROTEIN_HARD_HI, osm: D.OSM_PERIPHERAL_MAX };
    try {
      D.EN_DB.BM_20 = { ...keep.bm, pro: 1.7, kcal: 71 };
      D.EN_HMF_PROTEIN_G_PER_DOSE = 1.3;
      D.GIR_HARD_HI = 21; D.KCAL_HARD_HI = 222; D.PROTEIN_HARD_HI = 7.7; D.OSM_PERIPHERAL_MAX = 1234;
      mount(A);
      ok('BM protein and kcal follow EN_DB.BM_20 (1.7 g, 71 kcal)', vOf(assumption(), 'bm.pro') === 1.7 && vOf(assumption(), 'bm.kcal') === 71, text(assumption()));
      openAll();
      ok('the GIR panel\'s critical line follows D.GIR_HARD_HI', vOf(panel('gir'), 'lim.hard') === 21, text(panel('gir')));
      ok('the energy panel\'s critical line follows D.KCAL_HARD_HI', vOf(panel('kcal'), 'lim.hard') === 222, text(panel('kcal')));
      ok('the protein panel\'s critical line follows D.PROTEIN_HARD_HI', vOf(panel('protein'), 'lim.hard') === 7.7, text(panel('protein')));
      mount(B);
      ok('the HMF addition follows D.EN_HMF_PROTEIN_G_PER_DOSE (1.3)', vOf(assumption(), 'hmf.pro') === 1.3, text(assumption()));
      openAll();
      ok('the osmolarity panel\'s peripheral line follows D.OSM_PERIPHERAL_MAX', vOf(panel('osm'), 'lim.hard') === 1234, text(panel('osm')));
    } finally {
      D.EN_DB.BM_20 = keep.bm; D.EN_HMF_PROTEIN_G_PER_DOSE = keep.g; D.GIR_HARD_HI = keep.gir;
      D.KCAL_HARD_HI = keep.kcal; D.PROTEIN_HARD_HI = keep.pro; D.OSM_PERIPHERAL_MAX = keep.osm;
    }
  });

  await section('§4 each panel: formula, inputs, units, limit, and it adds up to the tile', async () => {
    mount(A);
    openAll();
    // ── GIR ──
    const pg = panel('gir'), tg = text(pg);
    ok('GIR: the formula, dextrose g/day × 1,000 ÷ (1,440 × kg)', tg.includes('dextrose (g/day) × 1,000 ÷ (1,440 × kg)'), tg);
    ok('GIR: inputs are delivered mL, dextrose % and the TPN calc. weight', vOf(pg, 'tpnMl') === 100 && vOf(pg, 'dexPct') === 10 && vOf(pg, 'wtG') === 1000, tg);
    ok('GIR: dextrose = 100 mL × 10 % = 10 g (hand arithmetic)', vOf(pg, 'dexG') === 10, tg);
    ok('GIR: the unit conversion (g → mg, day → minute, g → kg)', tg.includes('× 1,000') && tg.includes('÷ 1,440') && tg.includes('g ÷ 1,000'), tg);
    ok('GIR: the result is the readout\'s figure', vOf(pg, 'result') === girVal() && girVal() === 6.9, { panel: vOf(pg, 'result'), readout: girVal() });
    ok('GIR: inputs recompute to the result', near(vOf(pg, 'dexG') * 1000 / (1440 * vOf(pg, 'wtG') / 1000), vOf(pg, 'result'), 0.05), tg);
    ok(`GIR: checked against ${D.TARGETS.gir().join('–')} and critical above ${D.GIR_HARD_HI}, CR-GIR-MAX`,
      vOf(pg, 'lim.lo') === D.TARGETS.gir()[0] && vOf(pg, 'lim.hi') === D.TARGETS.gir()[1] && vOf(pg, 'lim.hard') === D.GIR_HARD_HI
      && tg.includes('CR-GIR-MAX') && tg.includes('CR-U-GIR'), tg);
    // ── Osmolarity ──
    const po = panel('osm'), to = text(po);
    ok('Osm: the KCMH formula, 50 × dextrose % + 100 × AA % + 2 × Na + 2 × K + 1.4 × Ca + 1 × Mg',
      to.includes('50 × dextrose % + 100 × AA % + 2 × Na + 2 × K + 1.4 × Ca + 1 × Mg'), to);
    ok('Osm: AA 3 g in 100 mL = 3 % (hand arithmetic)', vOf(po, 'aaPct') === 3, to);
    ok('Osm: Na 3 mEq/kg × 1 kg in 0.1 L = 30 mEq/L (hand arithmetic)', vOf(po, 'na') === 30, to);
    ok('Osm: K 20 mEq/L, Ca 400 mg/L = 20 mEq/L, Mg 4 mEq/L', vOf(po, 'k') === 20 && vOf(po, 'caMg') === 400 && vOf(po, 'caMeq') === 20 && vOf(po, 'mg') === 4, to);
    const terms = ['t.dex', 't.aa', 't.na', 't.k', 't.ca', 't.mg'].map(k => vOf(po, k));
    ok('Osm: each term shown (500, 300, 60, 40, 28, 4)', JSON.stringify(terms) === JSON.stringify([500, 300, 60, 40, 28, 4]), terms);
    ok('Osm: the terms add up to the tile (932)', near(terms.reduce((s, x) => s + x, 0), tileVal('Osmolarity'), 0.5) && vOf(po, 'result') === tileVal('Osmolarity'),
      { sum: terms.reduce((s, x) => s + x, 0), tile: tileVal('Osmolarity') });
    ok('Osm: the inputs give the same figure through D.estimateOsmolarity', near(D.estimateOsmolarity({ dexPct: vOf(po, 'dexPct'), aaPct: vOf(po, 'aaPct'),
      naMeqPerL: vOf(po, 'na'), kMeqPerL: vOf(po, 'k'), caMgPerL: vOf(po, 'caMg'), mgMeqPerL: vOf(po, 'mg') }), tileVal('Osmolarity'), 0.5));
    ok('Osm: the unit conversion (per L of the delivered volume; Ca mg ÷ 20)', to.includes('÷ 20') && to.includes('mL ÷ 1,000'), to);
    ok('Osm, central: no upper limit, CR-OSM-PERIPH and CR-U-OSM', to.includes('central') && to.includes('ไม่มีเพดาน') && to.includes('CR-OSM-PERIPH') && to.includes('CR-U-OSM')
      && !po.querySelector('[data-v="lim.hard"]'), to);
    // ── Energy ──
    const pk = panel('kcal'), tk = text(pk);
    ok('Energy: the formula, (3.4 × dextrose g + 4 × AA g + 9 × lipid g + feed kcal) ÷ kg', tk.includes('(3.4 × dextrose g + 4 × AA g + 9 × lipid g + kcal จากนม) ÷ kg'), tk);
    ok('Energy: 10 g → 34, AA 3 g → 12, lipid 2 g → 18 kcal', vOf(pk, 'dexG') === 10 && vOf(pk, 'dexKcal') === 34 && vOf(pk, 'aaG') === 3 && vOf(pk, 'aaKcal') === 12
      && vOf(pk, 'lipidG') === 2 && vOf(pk, 'lipidKcal') === 18, tk);
    ok('Energy: each term is its grams × its kcal/g as the formula says', near(vOf(pk, 'dexG') * 3.4, vOf(pk, 'dexKcal'), 0.05)
      && near(vOf(pk, 'aaG') * 4, vOf(pk, 'aaKcal'), 0.05) && near(vOf(pk, 'lipidG') * 9, vOf(pk, 'lipidKcal'), 0.05), tk);
    ok(`Energy: feed 16 mL × ${BM.kcal} kcal/100 mL ÷ 100 = 10.72 kcal`, vOf(pk, 'enMl') === 16 && vOf(pk, 'enPer100') === BM.kcal && vOf(pk, 'enKcal') === 10.72, tk);
    ok('Energy: the feed names its source row', tk.includes(BM.source), tk);
    ok('Energy: total ÷ kg is the tile (75)', near((34 + 12 + 18 + 10.72) / (vOf(pk, 'wtG') / 1000), tileVal('Energy (total)'), 0.5)
      && vOf(pk, 'result') === tileVal('Energy (total)') && tileVal('Energy (total)') === 75, { tile: tileVal('Energy (total)') });
    const tKcal = D.TPN_TARGETS.kcal(10);
    ok(`Energy: checked against PN DOL 10 ${tKcal.join('–')} and critical above ${D.KCAL_HARD_HI}`, vOf(pk, 'lim.lo') === tKcal[0] && vOf(pk, 'lim.hi') === tKcal[1]
      && vOf(pk, 'lim.hard') === D.KCAL_HARD_HI && tk.includes('CR-TGT-KCAL') && tk.includes('CR-KCAL-MAX') && tk.includes('CR-U-ENERGY'), tk);
    // ── Protein ──
    const pp = panel('protein'), tp = text(pp);
    ok('Protein: the formula, (AA g + feed protein g) ÷ kg', tp.includes('(AA g + protein จากนม g) ÷ kg'), tp);
    ok(`Protein: AA 3 g/kg × 1,000 g = 3 g; feed 16 mL × ${BM.pro} g/100 mL = 0.19 g`, vOf(pp, 'aaPerKg') === 3 && vOf(pp, 'aaG') === 3
      && vOf(pp, 'enPer100') === BM.pro && vOf(pp, 'enProG') === 0.19, tp);
    ok('Protein: total ÷ kg is the tile (3.2)', vOf(pp, 'result') === tileVal('Protein') && tileVal('Protein') === 3.2
      && near((vOf(pp, 'aaG') + vOf(pp, 'enProG')) / (vOf(pp, 'wtG') / 1000), tileVal('Protein'), 0.05), { tile: tileVal('Protein') });
    const tPro = D.TPN_TARGETS.protein(10);
    ok(`Protein: checked against ${tPro.join('–')} and critical above ${D.PROTEIN_HARD_HI}, CR-PROTEIN-MAX`, vOf(pp, 'lim.lo') === tPro[0] && vOf(pp, 'lim.hi') === tPro[1]
      && vOf(pp, 'lim.hard') === D.PROTEIN_HARD_HI && tp.includes('CR-TGT-PROTEIN') && tp.includes('CR-PROTEIN-MAX'), tp);
    ok('Protein: breast milk cites CR-U-BREASTMILK', tp.includes('CR-U-BREASTMILK'), tp);

    // B: peripheral, so the osmolarity panel names the 900 line.
    mount(B);
    openAll();
    const pb = panel('osm'), tb = text(pb);
    ok(`Osm, peripheral: critical at ${D.OSM_PERIPHERAL_MAX} and above, as printed`, vOf(pb, 'lim.hard') === D.OSM_PERIPHERAL_MAX && tb.includes('peripheral'), tb);
    ok('Osm, peripheral: 500 + 250 = 750 (AA 3 g in 120 mL = 2.5 %)', vOf(pb, 'aaPct') === 2.5 && vOf(pb, 'result') === 750 && tileVal('Osmolarity') === 750, tb);
    const bk = panel('kcal');
    ok(`Energy, BM + HMF: feed 40 mL × ${fmt(BMH.kcal, 1)} kcal/100 mL`, vOf(bk, 'enMl') === 40 && vOf(bk, 'enPer100') === Number(fmt(BMH.kcal, 1)), text(bk));
    ok('Energy, BM + HMF: the result is the tile', vOf(bk, 'result') === tileVal('Energy (total)'), { panel: vOf(bk, 'result'), tile: tileVal('Energy (total)') });
    ok('Protein, BM + HMF: the result is the tile', vOf(panel('protein'), 'result') === tileVal('Protein'));

    // C: full feeds of a formula: the enteral bands, and the formula's own source.
    mount(C);
    openAll();
    const ck = panel('kcal'), tck = text(ck);
    const eKcal = D.ENTERAL_TARGETS.kcal();
    ok(`Energy, full feeds: the enteral band ${eKcal.join('–')}, and why (CR-U-SWITCH)`, vOf(ck, 'lim.lo') === eKcal[0] && vOf(ck, 'lim.hi') === eKcal[1]
      && tck.includes('CR-U-SWITCH') && tck.includes('enteral'), tck);
    ok('Energy, full feeds: the feed names Hi-Q LBW\'s source, Chula Table 5', tck.includes(D.EN_DB.FBM_PF_24.source), tck);
    ok('Protein, full feeds: the enteral band', vOf(panel('protein'), 'lim.lo') === D.ENTERAL_TARGETS.protein()[0]);
    ok('Protein, formula: no CR-U-BREASTMILK', !text(panel('protein')).includes('CR-U-BREASTMILK'));
    ok('GIR with no bag: 0, and the panel says the bag has no volume', vOf(panel('gir'), 'result') === 0 && text(panel('gir')).includes('ไม่มีถุง'), text(panel('gir')));

    // D: MEN — the feed counts toward nothing, and the panel says so.
    mount(Dm);
    openAll();
    const dk = panel('kcal');
    ok('Energy, MEN: the feed counts 0 kcal, and the panel says MEN is not counted', vOf(dk, 'enKcal') === 0 && text(dk).includes('MEN'), text(dk));
    ok('Energy, MEN: the result is the tile', vOf(dk, 'result') === tileVal('Energy (total)'));
  });

  await section('§5 every CR- ID a panel names is a rule in the skill', async () => {
    const heads = new Set([...R(SKILL).matchAll(/^### (CR-[A-Z0-9-]+)\b/gm)].map(m => m[1]));
    const named = new Set();
    for (const c of [A, B, C, Dm]) {
      mount(c);
      openAll();
      for (const p of container.querySelectorAll('.working-panel')) for (const m of text(p).matchAll(/CR-[A-Z0-9-]+[A-Z0-9]/g)) named.add(m[0]);
      if (assumption()) named.add(assumption().dataset.rule);
    }
    const missing = [...named].filter(id => !heads.has(id));
    ok(`the panels name ${named.size} rules`, named.size >= 10, [...named]);
    ok('each is a ### heading in the skill', missing.length === 0, missing);
  });

  // A patient's order has had no Copy since main's 14caa41 (Pp, 2026-10-28): it
  // leaves as the print form. The quick calc keeps its Copy, so its copied text
  // is the one checked here.
  const copyButton = () => [...container.querySelectorAll('button')].find(b => /Copy Order|คัดลอกผลคำนวณ/.test(b.textContent)) || null;
  await section('§6 the pharmacy gets the same print form; the quick calc copies the same text', async () => {
    async function saveAndRead(c, open) {
      mount(c);
      if (open) openAll();
      const submit = buttonNamed('button', 'Submit');
      if (!submit || submit.disabled) return { error: 'Submit not available' };
      await clickAsync(submit);
      const form = container.querySelector('#print-form');
      return { form: form ? form.innerHTML : null, formText: text(form), copyButton: !!copyButton() };
    }
    for (const c of [A, B]) {
      const shut = await saveAndRead(c, false), open = await saveAndRead(c, true);
      ok(`${c.name}: there is a print form, and no Copy on a patient's order`, !!shut.form && !shut.copyButton && !open.copyButton,
        { error: shut.error, copy: shut.copyButton });
      ok(`${c.name}: the print form is the same with every panel open`, !!shut.form && shut.form === open.form);
      for (const s of ['นมแม่จริง', 'นมแม่ที่ใช้คำนวณ', 'CR-', 'แปลงหน่วย', 'ที่มาของตัวเลข']) {
        ok(`${c.name}: "${s}" is not on the print form`, !open.formText.includes(s));
      }
    }
    async function quickCopy(open) {
      mount({ ...A, name: 'Q', scratch: true });
      if (open) openAll();
      const btn = copyButton();
      if (!btn) return { error: 'no Copy on the quick calc' };
      copied = null;
      await clickAsync(btn);
      return { copy: copied, panels: container.querySelectorAll('.working-panel').length, milk: !!assumption() };
    }
    const qShut = await quickCopy(false), qOpen = await quickCopy(true);
    ok('quick calc: Copy gives text with every panel open and with none', typeof qShut.copy === 'string' && typeof qOpen.copy === 'string',
      { shut: qShut.error || typeof qShut.copy, open: qOpen.error || typeof qOpen.copy });
    ok('quick calc: its four panels and the milk line were on screen when copied', qOpen.panels === 4 && qOpen.milk === true,
      { panels: qOpen.panels, milk: qOpen.milk });
    ok('quick calc: the copied text is the same with every panel open', typeof qShut.copy === 'string' && qShut.copy === qOpen.copy);
    for (const s of ['นมแม่จริง', 'นมแม่ที่ใช้คำนวณ', 'CR-', 'แปลงหน่วย', 'ที่มาของตัวเลข']) {
      ok(`quick calc: "${s}" is not in the copied text`, !(qOpen.copy || '').includes(s));
    }
  });

  await section('§7 no trailing zero and no float tail in the new text', async () => {
    const bad = [];
    for (const c of [A, B, C, Dm, E]) {
      mount(c);
      openAll();
      for (const el of [assumption(), ...container.querySelectorAll('.working-panel')].filter(Boolean)) {
        const walker = document.createTreeWalker(el, window.NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          const hits = badNumbers(t.nodeValue);
          if (hits.length) bad.push(`${c.name}: ${hits.join(', ')} in "${t.nodeValue.trim().slice(0, 60)}"`);
        }
      }
    }
    ok('every number reads without a trailing zero or a float tail', bad.length === 0, bad.slice(0, 8));
  });

  await section('§8 Vera on this PR: a value past its limit, a rounded factor, a MEN feed', async () => {
    // GIR 12.007 grades critical; read at the tile's one decimal it is "12" beside
    // "above 12". The panel reads it the way the alert does (vsLimit).
    mount({ name: 'V1', g: 1000, route: 'Central', order: { 'Volume(mL/day)': 133, 'Dextrose final': 13, 'Amino acid': 3 } });
    click(toggle('gir'));
    const alert = [...container.querySelectorAll('.calc-bottom .alert-row')].find(a => a.querySelector('.title')?.textContent === 'GIR critically high');
    ok('GIR 12.007: the alert reads 12.01 mg/kg/min', !!alert && text(alert).includes('12.01 mg/kg/min'), text(alert));
    ok('GIR 12.007: the panel reads 12.01, not the limit itself', panel('gir')?.querySelector('[data-v="result"]')?.textContent === '12.01',
      panel('gir')?.querySelector('[data-v="result"]')?.textContent);
    mount({ name: 'V2', g: 1000, route: 'Central', order: { 'Volume(mL/day)': 100, 'Dextrose final': 12, 'Amino acid': 4.51, '20% lipid': 3 } });
    click(toggle('protein'));
    ok('protein 4.51 (critical above 4.5): the panel reads 4.51', panel('protein')?.querySelector('[data-v="result"]')?.textContent === '4.51',
      panel('protein')?.querySelector('[data-v="result"]')?.textContent);
    // FBM ↔ Infatrini is 90.65 kcal/100 mL; shown as 90.7 the arithmetic on screen
    // gave 290.24 against the 290.08 it printed.
    mount(E);
    click(toggle('kcal'));
    const pe = panel('kcal');
    ok('FBM ↔ Infatrini: mL × kcal/100 mL ÷ 100 on screen is the kcal it shows', near(vOf(pe, 'enMl') * vOf(pe, 'enPer100') / 100, vOf(pe, 'enKcal'), 0.005),
      { enMl: vOf(pe, 'enMl'), enPer100: vOf(pe, 'enPer100'), enKcal: vOf(pe, 'enKcal') });
    // A MEN feed: the infant gets 3 mL × 8 = 24 mL; none of it counts.
    mount(Dm);
    click(toggle('kcal'));
    const pm = panel('kcal');
    ok('MEN: the panel names the 24 mL given', vOf(pm, 'enGiven') === 24, text(pm));
    ok('MEN: …and counts 0 kcal of it', vOf(pm, 'enKcal') === 0, text(pm));
  });

  // main's #182 lets a day have two feeds. Its `calc.en` is then their mix per
  // 100 mL, with no label and no source, and feed 1 can be left at 0 mL beside
  // feed 2. What the screen says the infant is fed must follow the feeds given.
  await section('§9 two feeds: each feed its own line, and the milk line follows the feeds given', async () => {
    const tpn = { 'Volume(mL/day)': 100, 'Dextrose final': 10, 'Amino acid': 3 };
    const PF = D.EN_DB.FBM_PF_24;
    // G: Hi-Q LBW 24 as feed 1, breast milk as feed 2, 2 mL × 4 each (q3h together).
    const G = { name: 'G', g: 1000, route: 'Central', feed: 'FBM_PF_24', order: { ...tpn, 'Volume(mL/feed)': 2, 'Frequency': 4 },
      feed2: 'BM_20', order2: { 'Volume': 2, 'Frequency': 4 } };
    mount(G);
    ok('G: breast milk as feed 2 shows the milk line', !!assumption() && text(assumption()).includes('นมแม่ที่ใช้คำนวณ'), text(assumption()));
    for (const [id, n, k, unit] of [['kcal', 'kcal', 'enKcal', 'kcal'], ['protein', 'pro', 'enProG', 'g']]) {
      click(toggle(id));
      const p = panel(id), t = text(p);
      ok(`G ${id}: no "undefined" in the panel`, !!p && !/undefined/.test(t), t);
      ok(`G ${id}: feed 1 is 8 mL × Hi-Q LBW's ${n} per 100 mL`, vOf(p, 'enMl1') === 8 && near(vOf(p, 'enPer100_1'), PF[n], 0.005),
        { ml: vOf(p, 'enMl1'), per100: vOf(p, 'enPer100_1') });
      ok(`G ${id}: feed 2 is 8 mL × breast milk's ${n} per 100 mL`, vOf(p, 'enMl2') === 8 && near(vOf(p, 'enPer100_2'), BM[n], 0.005),
        { ml: vOf(p, 'enMl2'), per100: vOf(p, 'enPer100_2') });
      const hand = 8 * PF[n] / 100 + 8 * BM[n] / 100;
      ok(`G ${id}: the two lines add up to the total, ${fmt(hand, 2)} ${unit}`,
        near(vOf(p, k + '1') + vOf(p, k + '2'), vOf(p, k), 0.011) && near(vOf(p, k), hand, 0.005),
        { one: vOf(p, k + '1'), two: vOf(p, k + '2'), total: vOf(p, k) });
      ok(`G ${id}: each feed is named with its source`, t.includes(PF.label) && t.includes(BM.label) && t.includes(BM.source), t);
      ok(`G ${id}: CR-U-BREASTMILK sits on the breast-milk line only`, (t.match(/CR-U-BREASTMILK/g) || []).length === 1, t);
      click(toggle(id));
    }
    // H: feed 1 left at 0 mL, Hi-Q LBW 24 as feed 2 only.
    const H = { name: 'H', g: 1000, route: 'Central', order: tpn, feed2: 'FBM_PF_24', order2: { 'Volume': 2, 'Frequency': 8 } };
    mount(H);
    ok('H: formula as feed 2 only shows no milk line', !assumption(), text(assumption()));
    click(toggle('kcal'));
    const ph = panel('kcal'), th = text(ph);
    ok('H: the energy panel names Hi-Q LBW and not breast milk', th.includes(PF.label) && !th.includes(BM.label) && !th.includes('CR-U-BREASTMILK'), th);
    ok('H: 16 mL × Hi-Q LBW per 100 mL is the kcal shown', vOf(ph, 'enMl') === 16 && near(vOf(ph, 'enMl') * vOf(ph, 'enPer100') / 100, vOf(ph, 'enKcal'), 0.005),
      { ml: vOf(ph, 'enMl'), per100: vOf(ph, 'enPer100'), kcal: vOf(ph, 'enKcal') });
    // I: breast milk and BM + HMF.
    mount({ name: 'I', g: 1000, order: { 'Volume(mL/feed)': 2, 'Frequency': 4 }, feed2: 'BM_HMF_24', order2: { 'Volume': 2, 'Frequency': 4 } });
    ok('I: BM + HMF as feed 2 adds the HMF line', !!assumption() && text(assumption()).includes('HMF ที่เติมต่อ 100 mL'), text(assumption()));
  });

  act(() => { root.unmount(); });
  console.log(`\nSHOW WORKING (NF-12): ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
