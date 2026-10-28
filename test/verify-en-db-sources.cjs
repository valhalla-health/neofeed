// verify-en-db-sources.cjs — every feed composition in EN_DB comes from its
// printed source, or is the one row kept as it was (2026-10-17, 2026-10-20).
//
// Why it exists: the provenance audit of 2026-10-17 found that most formula
// rows in EN_DB had been copied (commit 357d095) from
// docs/Chula_Handbook_Ed3_Reference.md, an AI extraction whose tables do not
// match the scanned handbook. HiQ LF phosphorus was 76% high, Infatrini
// calcium 25% high, BM + HMF protein 13% high. Nothing could catch it,
// because no harness held the source.
//
// This one does. Below is its OWN transcription of the source tables, typed
// from the page images row by row as the book prints them (nutrients down,
// products across), never from data.js. If you change EN_DB, change it here
// from the page, or this harness stops being a second reading.
//
//   #1  the transcription checks itself: each per-100-kcal column adds up to
//       about 100 kcal (4·protein + 9·fat + 4·carbohydrate), and its Ca and P
//       give the Ca:P ratio printed on the same page
//   #2  every EN_DB row equals its source, field by field, at its strength;
//       BM_PF_20 keeps the numbers it had before 2026-10-17
//   #3  every row names its source (table and page), or is marked unsourced;
//       the unsourced set is exactly the one below
//   #4  the Calculator still offers BM_PF_20 under its own label, and an
//       order on it (new, reopened, or copied) raises no source alert
//       (Pp, 2026-10-20: keep PF 20 as it was until the formulas are revised)
//   #5  the Formula reference page: a source line on every row, rounded
//       figures, "—" where the source gives no osmolality
//
// Sources (book page = scanned PDF page − 8 for the handbook):
//   Chula Pediatric Nutrition Handbook 3rd ed. (2565), docs/Nutrition PedCu Ed3.pdf
//     Table 5 p. 16 (preterm formula), Table 7 p. 18 (lactose-free formula),
//     Table 16 p. 29 (balanced supplement formula); all per 100 kcal.
//     p. 10 (human milk fortifiers, per 1 g protein).
//   WHO 2006, Optimal feeding of low-birth-weight infants: technical review,
//     Box 1.3.1 p. 16 (milk, per litre), Box 1.3.3 p. 19 (the HMF dose's protein only).
//
// Watch it fail first: on the EN_DB before 2026-10-17, #2 fails on every
// formula row and on BM_HMF_24, and #3 fails on every row.
//
// Dev-only deps as in test/README.md. Scenario isolation via review-0917-boot.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { boot, runScenarios } = require('./review-0917-boot.cjs');

const DIR = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// ── The sources, as printed ────────────────────────────────────────────────
// Chula Table 5, p. 16. Per 100 kcal.     Enfalac premature, Pre Nan, Hi-Q LBW
const T5 = {
  page: 16, products: ['enfalacPremature', 'preNan', 'hiQLbw'],
  kcalOz:      [24,   24,   24],
  protein:     [3,    2.9,  3.3],
  carb:        [11,   10.7, 11.5],
  fat:         [5.1,  5.2,  4.8],
  sodiumMg:    [58,   43,   86],
  potassiumMg: [100,  103,  99],
  calciumMg:   [120,  130,  123],
  phosphMg:    [66,   76,   69],
  caToP:       [1.8,  1.7,  1.8],
  osmolality:  [310,  263,  360],
};
// Chula Table 7, p. 18. Per 100 kcal.     Enfalac LF, Hi-Q LF  (Similac, Nan, S26 not used)
const T7 = {
  page: 18, products: ['enfalacLf', 'hiQLf'],
  kcalOz:      [20,   20],
  protein:     [2.1,  2.4],
  carb:        [10.6, 10.8],
  fat:         [5.4,  5.2],
  sodiumMg:    [46,   34],
  potassiumMg: [115,  80],
  calciumMg:   [115,  64],
  phosphMg:    [77,   34],
  caToP:       [1.5,  1.9],
  osmolality:  [200,  170],
};
// Chula Table 16, p. 29. Per 100 kcal.    Infatrini powder, Infatrini liquid  (Nutrinidrink not used)
const T16 = {
  page: 29, products: ['infatriniPowder', 'infatriniLiquid'],
  kcalOz:      [30,   30],
  protein:     [2.6,  2.6],
  carb:        [10.3, 10.3],
  fat:         [5.4,  5.4],
  sodiumMg:    [37,   37],
  potassiumMg: [100,  100],
  calciumMg:   [99,   100],
  phosphMg:    [54,   56],
  caToP:       [1.8,  1.8],
  osmolality:  [345,  360],
};
// WHO 2006 Box 1.3.1, term mature milk (> 30 days). Per litre.
const BOX_131_TERM = { energyKcal: 640, proteinG: 12, fatG: 34, carbG: 67, caMmol: 6.5, pMmol: 4.8, naMmol: 9.0, kMmol: 13.9 };
// Chula p. 10 (PDF p. 18), "Human milk fortifier (per 4 packages)", Enfamil HMF
// (Mead Johnson) powder. The protein row reads 1 in every column, so the column is
// per 1 g protein. Typed from the page image on 2026-10-20 (Pp chose this page).
const P10_ENFAMIL_HMF = { proteinG: 1, carbG: 0.4, fatG: 0.9, energyKcal: 13, caMg: 81.8, pMg: 40.9, naMg: 14.5, kMg: 26.4 };
// The book gives no dose: one 4 g dose for 100 mL carries 1.1 g protein (WHO 2006
// Box 1.3.3, the same product).
const HMF_PROTEIN_G_PER_DOSE = 1.1;

// Conversions. 1 oz = 30 mL, rounded as the ward has always written it.
// 22 kcal/oz is the ward's strength for Enfalac Premature and Pre Nan; the
// book prints both at 24, so their osmolality does not carry over.
const PER_100ML_AT_OZ = { 20: 67, 22: 73, 24: 80, 27: 90, 30: 100 };
const MG_PER_MMOL = { Na: 22.99, K: 39.10, Ca: 40.08, P: 30.97 };
// Term mature milk is labelled 20 kcal/oz = 67 kcal/100 mL, inside Chula
// p. 8's mature-milk range (65.2–70); the Box itself gives 64.
const BM_KCAL = 67;

function column(table, product) {
  const i = table.products.indexOf(product);
  if (i < 0) throw new Error('no column ' + product);
  const v = (row) => table[row][i];
  return { kcalOz: v('kcalOz'), pro: v('protein'), cho: v('carb'), fat: v('fat'), naMg: v('sodiumMg'),
    kMg: v('potassiumMg'), ca: v('calciumMg'), p: v('phosphMg'), caToP: v('caToP'), osm: v('osmolality') };
}
function atStrength(col, oz) {
  const kcal = PER_100ML_AT_OZ[oz], f = kcal / 100;
  return { kcal, pro: col.pro * f, fat: col.fat * f, cho: col.cho * f, na: col.naMg * f / MG_PER_MMOL.Na,
    k: col.kMg * f / MG_PER_MMOL.K, ca: col.ca * f, p: col.p * f, osm: oz === col.kcalOz ? col.osm : null };
}
const BM = { kcal: BM_KCAL, pro: BOX_131_TERM.proteinG / 10, fat: BOX_131_TERM.fatG / 10, cho: BOX_131_TERM.carbG / 10,
  na: BOX_131_TERM.naMmol / 10, k: BOX_131_TERM.kMmol / 10,
  ca: BOX_131_TERM.caMmol * MG_PER_MMOL.Ca / 10, p: BOX_131_TERM.pMmol * MG_PER_MMOL.P / 10, osm: null };
const DOSE = HMF_PROTEIN_G_PER_DOSE / P10_ENFAMIL_HMF.proteinG;
const BM_HMF = { kcal: BM.kcal + P10_ENFAMIL_HMF.energyKcal * DOSE, pro: BM.pro + P10_ENFAMIL_HMF.proteinG * DOSE,
  fat: BM.fat + P10_ENFAMIL_HMF.fatG * DOSE, cho: BM.cho + P10_ENFAMIL_HMF.carbG * DOSE,
  na: BM.na + P10_ENFAMIL_HMF.naMg * DOSE / MG_PER_MMOL.Na, k: BM.k + P10_ENFAMIL_HMF.kMg * DOSE / MG_PER_MMOL.K,
  ca: BM.ca + P10_ENFAMIL_HMF.caMg * DOSE, p: BM.p + P10_ENFAMIL_HMF.pMg * DOSE, osm: null };
const INFATRINI = atStrength(column(T16, 'infatriniPowder'), 30);
const MIX = {};
for (const f of ['kcal', 'pro', 'fat', 'cho', 'na', 'k', 'ca', 'p']) MIX[f] = (BM_HMF[f] + INFATRINI[f]) / 2;
MIX.osm = null;

// What every EN_DB key must equal, and the words its `source` must contain.
const EXPECTED = {
  BM_20:        { want: BM, cites: ['Box 1.3.1'] },
  BM_HMF_24:    { want: BM_HMF, cites: ['p. 10', 'Box 1.3.3'] },
  FBM_PF_22:    { want: atStrength(column(T5, 'enfalacPremature'), 22), cites: ['Table 5', 'p. 16'] },
  PRENAN_22:    { want: atStrength(column(T5, 'preNan'), 22), cites: ['Table 5', 'p. 16'] },
  // At 24 kcal/oz too (nutrition unit, 2026-10-25), the book's own strength.
  ENFALAC_PREM_24: { want: atStrength(column(T5, 'enfalacPremature'), 24), cites: ['Table 5', 'p. 16'] },
  PRENAN_24:    { want: atStrength(column(T5, 'preNan'), 24), cites: ['Table 5', 'p. 16'] },
  FBM_PF_24:    { want: atStrength(column(T5, 'hiQLbw'), 24), cites: ['Table 5', 'p. 16'] },
  LF_20:        { want: atStrength(column(T7, 'hiQLf'), 20), cites: ['Table 7', 'p. 18'] },
  LF_24:        { want: atStrength(column(T7, 'hiQLf'), 24), cites: ['Table 7', 'p. 18'] },
  LF_27:        { want: atStrength(column(T7, 'hiQLf'), 27), cites: ['Table 7', 'p. 18'] },
  HIQLF_20:     { want: atStrength(column(T7, 'hiQLf'), 20), cites: ['Table 7', 'p. 18'] },
  HIQLF_24:     { want: atStrength(column(T7, 'hiQLf'), 24), cites: ['Table 7', 'p. 18'] },
  HIQLF_27:     { want: atStrength(column(T7, 'hiQLf'), 27), cites: ['Table 7', 'p. 18'] },
  ENFALAC_20:   { want: atStrength(column(T7, 'enfalacLf'), 20), cites: ['Table 7', 'p. 18'] },
  ENFALAC_24:   { want: atStrength(column(T7, 'enfalacLf'), 24), cites: ['Table 7', 'p. 18'] },
  ENFALAC_27:   { want: atStrength(column(T7, 'enfalacLf'), 27), cites: ['Table 7', 'p. 18'] },
  INFATRINI_30: { want: INFATRINI, cites: ['Table 16', 'p. 29'] },
  FBM_INF_MIX:  { want: MIX, cites: ['BM_HMF_24', 'INFATRINI_30'] },
};
// Rows with no source. Adding one here is a decision for Pp, not a fix.
const UNSOURCED = ['BM_PF_20'];
// Pp, 2026-10-20: "PF 20 kcal/oz คงไว้อย่างเดิมก่อน". Its numbers as they were
// on main before this PR (55d893d data.js), until the formulas are revised.
const KEPT = { BM_PF_20: { kcal: 67, pro: 1.5, fat: 3.5, cho: 7.4, na: 1.0, k: 1.7, ca: 50, p: 28, osm: 290 } };
// The Calculator's feed list for a new order (calculator.jsx, Step 2). The two
// 24 kcal/oz rows and Enfalac LF joined on 2026-10-27 (nutrition unit).
const CALC_OFFERS = ['BM_20', 'BM_HMF_24', 'BM_PF_20', 'FBM_PF_22', 'ENFALAC_PREM_24', 'FBM_PF_24', 'PRENAN_22', 'PRENAN_24',
  'FBM_INF_MIX', 'INFATRINI_30', 'LF_20', 'LF_24', 'LF_27', 'ENFALAC_20', 'ENFALAC_24', 'ENFALAC_27'];
const FIELDS = ['kcal', 'pro', 'fat', 'cho', 'na', 'k', 'ca', 'p'];
const close = (a, b) => typeof a === 'number' && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

function loadData() {
  global.window = global.window || {};
  vm.runInThisContext(R('data.js'));
  return window.NEOFEED_DATA;
}

const scenarios = {
  async 'transcription'(A) {
    console.log('\n── #1 the transcription checks itself against its own page ──');
    for (const [name, t] of [['Table 5', T5], ['Table 7', T7], ['Table 16', T16]]) {
      for (const product of t.products) {
        const c = column(t, product);
        const atwater = 4 * c.pro + 9 * c.fat + 4 * c.cho;
        A.ok(`1.${name} ${product}: 4P+9F+4C = ${atwater.toFixed(1)} kcal ≈ 100`, atwater >= 97 && atwater <= 104);
        A.ok(`1.${name} ${product}: Ca/P ${(c.ca / c.p).toFixed(2)} rounds to the printed ${c.caToP}`,
          Math.abs(c.ca / c.p - c.caToP) <= 0.05 + 1e-9);
      }
    }
    const b = BOX_131_TERM, atw = (4 * b.proteinG + 9 * b.fatG + 4 * b.carbG) / 10;
    A.ok(`1.Box 1.3.1 term milk: 4P+9F+4C = ${atw.toFixed(1)} kcal/100 mL, within 10% of the label's ${BM_KCAL}`,
      Math.abs(atw - BM_KCAL) / BM_KCAL <= 0.10);
    const h = P10_ENFAMIL_HMF, hAtw = 4 * h.proteinG + 9 * h.fatG + 4 * h.carbG;
    A.ok(`1.p. 10 Enfamil HMF: 4P+9F+4C = ${hAtw.toFixed(1)} kcal, within 10% of the printed ${h.energyKcal}`,
      Math.abs(hAtw - h.energyKcal) / h.energyKcal <= 0.10);
  },

  async 'rows'(A) {
    console.log('\n── #2 every EN_DB row equals its source ──');
    const DB = loadData().EN_DB;
    for (const [key, { want }] of Object.entries(EXPECTED)) {
      const row = DB[key];
      if (!row) { A.ok(`2.${key} exists`, false); continue; }
      const off = FIELDS.filter(f => !close(row[f], want[f]))
        .map(f => `${f} ${+Number(row[f]).toFixed(3)} (source ${+want[f].toFixed(3)})`);
      A.eq(`2.${key} kcal, protein, fat, CHO, Na, K, Ca, P`, off, []);
      A.eq(`2.${key} osmolality (null = the source gives none at this strength)`, row.osm ?? null, want.osm);
    }
    for (const [key, want] of Object.entries(KEPT)) {
      const row = DB[key] || {};
      A.eq(`2.${key} keeps its numbers from before 2026-10-17`,
        [...FIELDS, 'osm'].filter(f => row[f] !== want[f]).map(f => `${f} ${row[f]} (was ${want[f]})`), []);
    }
    // The label's strength and the row's energy agree (1 oz = 30 mL).
    for (const [key, row] of Object.entries(DB)) {
      const m = /^[^↔]*?\((\d+) kcal\/oz/.exec(row.label);
      if (!m || !PER_100ML_AT_OZ[m[1]]) continue;
      A.ok(`2.${key} label ${m[1]} kcal/oz ≈ ${row.kcal} kcal/100 mL`, Math.abs(row.kcal - PER_100ML_AT_OZ[m[1]]) / PER_100ML_AT_OZ[m[1]] <= 0.02);
    }
  },

  async 'sources'(A) {
    console.log('\n── #3 every row names its source, or says it has none ──');
    const DB = loadData().EN_DB;
    for (const [key, row] of Object.entries(DB)) {
      if (UNSOURCED.includes(key)) {
        A.ok(`3.${key} is marked unsourced`, row.unsourced === true);
        A.ok(`3.${key} claims no source`, !row.source);
        continue;
      }
      A.ok(`3.${key} is checked by this harness`, !!EXPECTED[key]);
      A.ok(`3.${key} is not marked unsourced`, !row.unsourced);
      const cites = EXPECTED[key]?.cites || [];
      A.ok(`3.${key} source names ${cites.join(' + ') || '?'}`,
        typeof row.source === 'string' && cites.length > 0 && cites.every(c => row.source.includes(c)));
      A.ok(`3.${key} cites no AI extraction (no "§")`, !/§/.test(`${row.source || ''} ${row.note || ''}`));
    }
    A.eq('3.the unsourced rows are exactly these', Object.keys(DB).filter(k => DB[k].unsourced).sort(), [...UNSOURCED].sort());
  },

  async 'calculator'(A) {
    console.log('\n── #4 the Calculator still offers PF 20, as it was, with no source alert ──');
    const babel = require('@babel/core');
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',
      { url: 'https://localhost/', pretendToBeVisual: true });
    const { window } = dom;
    Object.assign(global, {
      window, document: window.document, self: window, HTMLElement: window.HTMLElement,
      Element: window.Element, Node: window.Node, getComputedStyle: window.getComputedStyle,
      localStorage: window.localStorage, sessionStorage: window.sessionStorage,
      requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch {}
    global.showToast = () => {};
    window.print = () => {}; window.prompt = () => 'reason'; window.confirm = () => true;
    const React = require('react');
    const ReactDOM = require('react-dom/client');
    const { act } = React;
    global.React = React; window.React = React;
    { const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }
    vm.runInThisContext(R('data.js'));
    for (const f of ['icons.jsx', 'calculator.jsx']) {
      vm.runInThisContext(babel.transformSync(R(f), {
        presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
        filename: f, configFile: false, babelrc: false,
      }).code);
    }
    const DB = window.NEOFEED_DATA.EN_DB;
    const container = document.getElementById('root');
    const patient = { sessionId: 'EN-SRC', name: 'Source', initials: 'SR', bw: 1200, ga: 30, sex: 'boys',
      admissionDate: '2026-10-01', currentBed: 'NICU 1', diagnosis: '-', weights: [{ dol: 1, w: 1200 }], lengths: [], hcs: [] };
    let root = null;
    const mount = (editEntry, baselineEntry = null, previousEntry = null) => {
      if (root) act(() => { root.unmount(); });
      window.localStorage.clear();
      root = ReactDOM.createRoot(container);
      act(() => {
        root.render(React.createElement(window.Calculator, {
          patient, dol: 12, editEntry, baselineEntry, previousEntry, logDate: null,
          userLabel: 'Dr Source (src@kcmh.test)', userEmail: 'src@kcmh.test',
          onLog: () => Promise.resolve({ ok: true, entryId: 'x', lastModified: 'x' }),
          onUpdate: () => Promise.resolve({ ok: true, lastModified: 'x' }), onSaved() {}, onWeightChange() {},
        }));
      });
      const open = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Open all');
      if (open) act(() => { open.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    };
    // Step 2 picks the milk, then its kcal/oz (Pp, 2026-10-28). The order
    // still saves one EN_DB key, the kcal/oz select's value.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    const set = (sel, value) => act(() => { setter.call(sel, value); sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
    const productSelect = () => container.querySelector('.en-feed-1 .en-product');
    const strengthSelect = () => container.querySelector('.en-feed-1 .en-strength');
    const feedKey = () => strengthSelect()?.value;
    const pick = (key) => { set(productSelect(), window.NEOFEED_DATA.enProductOf(key).product.id); set(strengthSelect(), key); };
    // Every milk the first select offers, and every kcal/oz the second then offers.
    const offered = () => {
      const out = [];
      for (const o of [...productSelect().options]) {
        set(productSelect(), o.value);
        for (const st of [...strengthSelect().options]) out.push({ product: o, strength: st });
      }
      return out;
    };
    // 44f88e4 raised "Feed composition has no source" on a PF 20 order; any
    // alert that names the source comes back here.
    const noSourceAlerts = () => [...container.querySelectorAll('.calc-bottom .alert-row')]
      .filter(a => /no source/i.test(a.textContent));

    // A new order.
    mount(null);
    A.ok('4.1 the milk and kcal/oz selects are on screen', !!productSelect() && !!strengthSelect());
    const opts = productSelect() ? offered() : [];
    A.eq('4.2 a new order offers the sourced feeds and PF 20', opts.map(o => o.strength.value).sort(), [...CALC_OFFERS].sort());
    A.eq('4.3 none of them is disabled', opts.filter(o => o.product.disabled || o.strength.disabled).map(o => o.strength.value), []);
    A.eq('4.4 each kcal/oz option is the strength its EN_DB row is labelled with',
      opts.filter(o => !/^\d+$/.test(o.strength.textContent) ? o.strength.textContent !== '24 ↔ 30'
        : !DB[o.strength.value]?.label.includes(`${o.strength.textContent} kcal/oz`)).map(o => o.strength.value), []);
    A.ok('4.5 Enfalac Premature keeps the ward\'s 22 kcal/oz',
      opts.some(o => o.strength.value === 'FBM_PF_22' && o.product.textContent === 'Enfalac Premature' && o.strength.textContent === '22'));

    mount(null);
    pick('BM_PF_20');
    A.eq('4.6 a new order can pick PF 20', feedKey(), 'BM_PF_20');
    A.eq('4.7 …and raises no source alert', noSourceAlerts().length, 0);

    // An order saved on PF 20, reopened.
    const old = { entryId: 'e-old', ts: '2026-10-12', weight: 1500, lastModified: '2026-10-12T02:00:00.000Z',
      calcInput: { curWtG: 1500, fluidTargetPerKg: 150, enType: 'BM_PF_20', enVol: 28, enFreq: 8 } };
    mount(old);
    A.eq('4.8 a reopened PF 20 order shows its own feed', feedKey(), 'BM_PF_20');
    A.eq('4.9 …as Preterm Formula at 20 kcal/oz',
      [productSelect()?.selectedOptions[0]?.textContent, strengthSelect()?.selectedOptions[0]?.textContent], ['Preterm Formula', '20']);
    A.eq('4.10 …with the same feed list as a new order', productSelect() ? offered().map(o => o.strength.value).sort() : [], [...CALC_OFFERS].sort());
    mount(old);
    A.eq('4.11 …and raises no source alert', noSourceAlerts().length, 0);

    // A saved order whose feed is not an EN_DB row (removed since, or written by
    // a newer NeoFeed) is refused, never costed as the other feed (Vera, 2026-10-28).
    const critTitles = () => [...container.querySelectorAll('.calc-bottom .alert-row.crit .title')].map(t => t.textContent);
    const submitBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit');
    for (const [label, ci] of [
      ['feed 2', { enType: 'BM_20', enVol: 10, enFreq: 8, enType2: 'NOT_A_FEED', enVol2: 10, enFreq2: 8 }],
      ['feed 1', { enType: 'NOT_A_FEED', enVol: 10, enFreq: 8 }],
    ]) {
      mount({ ...old, entryId: 'e-unknown', calcInput: { curWtG: 1500, fluidTargetPerKg: 150, ...ci } });
      A.ok(`4.14 a saved ${label} not in EN_DB raises "Feed not in the formulary"`, critTitles().includes('Feed not in the formulary'), critTitles());
      A.ok(`4.15 …and the save panel refuses it`, /บันทึก\/พิมพ์ไม่ได้/.test(container.querySelector('.feed-unknown')?.textContent || '') && !!submitBtn() && submitBtn().disabled);
      A.ok(`4.16 …and the feed shows as saved, not swapped`, [...container.querySelectorAll('.en-product option')].some(o => o.selected && o.textContent === 'NOT_A_FEED'));
    }

    // The change list names feed 2's milk only where feed 2 is given (Vera,
    // 2026-10-28): removing it reads "none", never a switch to breast milk, and
    // a milk picked for a feed 2 with no volume is not a change.
    const changes = () => (container.querySelector('.order-changes')?.textContent || '').replace(/\s+/g, ' ');
    const twoFeedPrev = { ...old, entryId: 'e-two', calcInput: { curWtG: 1500, fluidTargetPerKg: 150,
      enType: 'BM_20', enVol: 20, enFreq: 4, enType2: 'PRENAN_22', enVol2: 10, enFreq2: 4 } };
    mount(null, null, twoFeedPrev);
    A.ok('4.17 feed 2 not given today: "Feed 2: Pre Nan → none"', changes().includes('Feed 2: Pre Nan → none'), changes());
    A.ok('4.18 …never "Pre Nan → Breast Milk"', !changes().includes('Pre Nan → Breast Milk'), changes());
    mount(null, null, { ...old, entryId: 'e-one', calcInput: { curWtG: 1500, fluidTargetPerKg: 150, enType: 'BM_20', enVol: 20, enFreq: 8 } });
    const add = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === '+ Add a second feed (นมชนิดที่ 2)');
    act(() => { add.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    for (const [cls, v] of [['en-product', 'preNan'], ['en-strength', 'PRENAN_22']]) set(container.querySelector(`.en-feed-2 .${cls}`), v);
    A.ok('4.19 a milk picked for feed 2 with no volume is not a change', !/Feed 2:/.test(changes()), changes());

    // Changing the milk to one that does not come in the kcal/oz on screen says
    // so (Vera, 2026-10-28): Infatrini 30 → Pre Nan is 22, never silently.
    mount(null);
    pick('INFATRINI_30');
    set(productSelect(), 'preNan');
    const notice = () => (container.querySelector('.en-feed-1 .en-strength-changed')?.textContent || '').replace(/\s+/g, ' ');
    A.eq('4.20 Infatrini 30 → Pre Nan takes Pre Nan 22', feedKey(), 'PRENAN_22');
    A.ok('4.21 …and says "kcal/oz 30 → 22"', notice().includes('kcal/oz 30 → 22: Pre Nan ไม่มี 30 kcal/oz'), notice());
    set(productSelect(), 'enfalacPrem');
    A.ok('4.22 a milk that keeps the 22 clears it', feedKey() === 'FBM_PF_22' && notice() === '', { key: feedKey(), notice: notice() });

    // The next day's new order, copied from a PF 20 order.
    mount(null, old);
    A.eq('4.12 a copied new order keeps PF 20', feedKey(), 'BM_PF_20');
    A.eq('4.13 …and raises no source alert', noSourceAlerts().length, 0);
    act(() => { root.unmount(); });
  },

  async 'formulas'(A) {
    console.log('\n── #5 the Formula reference page shows each row\'s source ──');
    const t = boot();
    t.quiet();
    await t.start();
    await t.pickWard('NICU');
    await t.rail(/Formulas/);
    const rows = [...document.querySelectorAll('table tbody tr')];
    const DB = t.D().EN_DB;
    // 16 since 2026-10-27: Enfalac Premature and Pre Nan at 24 kcal/oz.
    A.eq('5.1 the page lists its 16 formula rows', rows.length, 16);
    const byLabel = (key) => rows.find(r => {
      const first = r.querySelector('td');
      return first && first.textContent.replace(/\s+/g, ' ').trim() === DB[key].label.replace(/\s+/g, ' ').trim()
        .replace(/^(.*?)\s*\((.+)\)$/, '$1($2)');
    });
    const missing = [], unlabelled = [];
    for (const key of Object.keys(DB)) {
      if (!['FBM_PF_22', 'ENFALAC_PREM_24', 'PRENAN_24', 'BM_20', 'BM_PF_20', 'HIQLF_20', 'HIQLF_24', 'ENFALAC_27', 'INFATRINI_30', 'FBM_INF_MIX', 'BM_HMF_24'].includes(key)) continue;
      const r = byLabel(key);
      if (!r) { missing.push(key); continue; }
      const want = DB[key].unsourced ? 'No source' : `Source: ${DB[key].source}`;
      if (!r.textContent.includes(want)) unlabelled.push(key);
    }
    A.eq('5.2 the rows checked are on the page', missing, []);
    A.eq('5.3 each shows "Source: …" or "No source"', unlabelled, []);
    const cells = rows.flatMap(r => [...r.querySelectorAll('td.num')].map(td => td.textContent.trim()));
    A.eq('5.4 no figure has a float tail or a trailing zero', cells.filter(c => /\.\d{3,}|\.\d*0$/.test(c)), []);
    const bm = byLabel('BM_20');
    const bmCells = bm ? [...bm.querySelectorAll('td.num')].map(td => td.textContent.trim()) : [];
    A.eq('5.5 breast milk: Ca 26.1, P 14.9, osmolality "—"', [bmCells[5], bmCells[6], bmCells[7]], ['26.1', '14.9', '—']);
    const lf = byLabel('HIQLF_20');
    const lfCells = lf ? [...lf.querySelectorAll('td.num')].map(td => td.textContent.trim()) : [];
    A.eq('5.6 HiQ LF 20: protein 1.61, Ca 42.9, P 22.8, osmolality 170', [lfCells[1], lfCells[5], lfCells[6], lfCells[7]], ['1.61', '42.9', '22.8', '170']);
  },
};

runScenarios(__filename, 'EN_DB SOURCES', scenarios);
