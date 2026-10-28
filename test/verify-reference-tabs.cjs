// verify-reference-tabs.cjs — every cell of the clinical reference tables holds (NF-28).
//
// One wrong cell in a reference table makes every order that reads it wrong.
// NeoFeed keeps those tables in data.js, not in the Sheet: gas-backend.gs reads
// only Staff, Patient_Registry, Daily_Log, Nursing_Log and Audit_Log, and sends
// the frontend no clinical number. So the tables ship with the frontend, on a
// merge into `release`, and this harness runs in the `harnesses` check that
// `release` requires: a failing cell blocks the deploy and is listed below.
//
// tools/reference-tabs.cjs is the check (checkReferenceTabs, a pure function),
// tools/reference-tabs.json what each table must hold: a unit for every column,
// the sign and the range of every number. A range comes from the
// neofeed-clinical-rules skill when a CR- rule codes that value, and is marked
// `proposed` (for Pp) when no rule does.
//
//   #1  synthetic tables: a good set passes, and each kind of bad cell fails
//       alone, naming the cell; nothing is coerced, trimmed or changed
//   #2  the source readers find the dropdown lists and the backend's key rule
//   #3  the real tables: data.js, the skill, calculator.jsx, log.jsx, app.jsx
//       and gas-backend.gs, against tools/reference-tabs.json
//
// NEGATIVE_CONTROL proves #3 bites; each must FAIL:
//   1  EN_DB.BM_20.pro becomes the string "1.2"
//   2  KCMH_STOCK.naCl.naMeqPerMl 3.42 → 34.2
//   3  the Calculator's feed list asks for "BM_20 " (a trailing space)
//
// Needs Node 18+ and no npm install. Synthetic values only.
const path = require('path');
const RT = require('../tools/reference-tabs.cjs');

const DIR = path.join(__dirname, '..');
const NEG = process.env.NEGATIVE_CONTROL || '';
let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${cond ? '' : '\n         ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}
const clone = (v) => JSON.parse(JSON.stringify(v));

// ── #1 synthetic tables ───────────────────────────────────────────────────
console.log('\n── #1 synthetic tables: each kind of bad cell fails alone ──');

const RULES_MD = [
  '### CR-T-MAX · a made-up ceiling',
  '```rule',
  '{"rule": "CR-T-MAX", "kind": "critical", "coded": {"MAX_X": 12, "STOCK.a.perMl": 3.42, "STOCK.a.k": 0, "WARDS": [], "PAIR": {"warn": 40, "max": 60}}}',
  '{"case": "inside", "side": "inside", "fn": "MAX_X", "want": 12}',
  '```',
  '### CR-T-KCAL · a made-up unit rule',
  '```rule',
  '{"rule": "CR-T-KCAL", "kind": "unit"}',
  '```',
].join('\n');

const SPEC = {
  tables: {
    MILK: {
      columns: {
        label: { type: 'text' },
        note: { type: 'text', optional: true },
        lf: { type: 'boolean' },
        kcal: { type: 'number', unit: 'kcal/100 mL', sign: 'positive', range: { lo: 67, hi: 100, rule: 'CR-T-KCAL' } },
        pro: { type: 'number', unit: 'g/100 mL', sign: 'positive', range: { lo: 0.6, hi: 4, proposed: 'fixture' } },
        osm: { type: 'number', unit: 'mOsm/kg H2O', sign: 'positive', nullable: 'the source gives none',
          range: { lo: 85, hi: 540, proposed: 'fixture' } },
      },
    },
    STOCK: {
      columns: {
        label: { type: 'text' },
        perMl: { type: 'number', unit: 'mEq/mL', sign: 'positive', optional: true, range: 'rule' },
        k: { type: 'number', unit: 'mEq/mL', sign: 'nonnegative', optional: true, range: 'rule' },
      },
      cells: { 'b.perMl': { lo: 2, hi: 2, proposed: 'fixture' } },
    },
  },
  limits: {
    MAX_X: { unit: 'mg/kg/min', sign: 'positive' },
    MIN_Y: { unit: 'kcal/g', sign: 'positive', range: { lo: 12, hi: 12, proposed: 'fixture' } },
    'PAIR.warn': { unit: 'mEq/L', sign: 'positive' },
    'PAIR.max': { unit: 'mEq/L', sign: 'positive' },
    WARDS: { type: 'list', unit: 'ward names' },
  },
  bands: {
    TGT: {
      prot: { args: 'dol', unit: 'g/kg/d', within: { backend: 'pro' }, hiAtMost: 'MAX_X' },
      ratio: { args: 'none', unit: 'kcal/g', hiMayBeInfinite: true, loAtLeast: 'MIN_Y' },
      gir: { args: 'none', shape: 'object', unit: 'mg/kg/min', within: { lo: 0, hi: 30, proposed: 'fixture' }, hiAtMost: 'MAX_X' },
      girBand: { args: 'none', unit: 'mg/kg/min', within: { lo: 0, hi: 30, proposed: 'fixture' }, hiAtMost: 'MAX_X' },
    },
  },
  categories: { STOCK: { column: 'kind', values: ['salt', 'base'] } },
};

const goodData = () => ({
  MILK: {
    BM: { label: 'Breast milk', lf: false, kcal: 67, pro: 1.2, osm: null },
    PF: { label: 'Preterm formula', lf: false, kcal: 80, pro: 2.6, osm: 310, note: 'made up' },
  },
  STOCK: { a: { label: 'Salt A', perMl: 3.42, k: 0 }, b: { label: 'Salt B', perMl: 2 } },
  MAX_X: 12, MIN_Y: 12, WARDS: [], PAIR: { warn: 40, max: 60 },
  TGT: {
    prot: (dol) => (dol <= 1 ? [1.5, 2.5] : [2.5, 3.5]),
    ratio: () => [24, Infinity],
    gir: () => ({ start: [4, 8], max: 12 }),
    girBand: () => [4, 12],
  },
});
const { rules, errors: ruleErrors } = RT.parseRules(RULES_MD);
ok('#1.1 the fixture skill parses: two rules, no errors', Object.keys(rules).length === 2 && ruleErrors.length === 0, { rules, ruleErrors });

const goodInput = (data = goodData()) => ({
  data, rules,
  backendBounds: { pro: { lo: 0, hi: 8, at: 'gas-backend.gs:1' } },
  lists: [{ name: 'feed dropdown', at: 'calc.jsx:1', table: 'MILK', keys: ['BM', 'PF'], uniqueLabels: true }],
  keyPatterns: [{ name: 'backend feed key', at: 'gas-backend.gs:2', pattern: /^[A-Z][A-Z0-9_]{0,39}$/, keys: ['BM', 'PF'] }],
  refs: [{ at: 'calc.jsx:9', table: 'STOCK', row: 'a', column: 'perMl' }],
  categoryFilters: [{ at: 'calc.jsx:5', table: 'STOCK', category: 'salt' }],
  notFound: [],
});
// SPEC.categories names the column that holds a STOCK row's category.
const withKinds = (d) => { d.STOCK.a.kind = 'salt'; d.STOCK.b.kind = 'base'; return d; };
SPEC.tables.STOCK.columns.kind = { type: 'text' };

const run = (mutate, specMutate) => {
  const data = withKinds(goodData());
  const input = goodInput(data);
  const spec = clone(SPEC);
  if (mutate) mutate(input.data, input);
  if (specMutate) specMutate(spec, input);
  return RT.checkReferenceTabs(input, spec);
};

{
  const r = run();
  ok('#1.2 the good tables pass with no failure', r.failures.length === 0, r.failures);
  ok('#1.3 the proposed ranges are listed for Pp (MILK.pro, MILK.osm, STOCK.b.perMl, MIN_Y, TGT.gir)',
    ['MILK.pro', 'MILK.osm', 'STOCK.b.perMl', 'MIN_Y', 'TGT.gir'].every(w => r.proposed.some(p => p.where === w)), r.proposed);
  ok('#1.4 a range read from a rule names it: STOCK.a.perMl from CR-T-MAX',
    r.fromRules.some(x => x.where === 'STOCK.a.perMl' && x.rule === 'CR-T-MAX'), r.fromRules);
}

// Each case: what goes wrong, the cell the one failure must name, and a word
// its message must contain.
const CASES = [
  ['a number typed as a string is not coerced', (d) => { d.MILK.BM.pro = '1.2'; }, 'MILK.BM.pro', /string/],
  ['a comma decimal is a string too', (d) => { d.MILK.PF.pro = '2,6'; }, 'MILK.PF.pro', /string/],
  ['NaN is not a number', (d) => { d.MILK.PF.kcal = NaN; }, 'MILK.PF.kcal', /finite/],
  ['Infinity in a cell is not a number', (d) => { d.MILK.PF.kcal = Infinity; }, 'MILK.PF.kcal', /finite/],
  ['null where no reason allows it', (d) => { d.MILK.BM.pro = null; }, 'MILK.BM.pro', /null/],
  ['a required cell left out', (d) => { delete d.MILK.PF.pro; }, 'MILK.PF.pro', /missing/],
  ['a negative value', (d) => { d.MILK.PF.pro = -2.6; }, 'MILK.PF.pro', /sign|negative/],
  ['zero where the value must be positive', (d) => { d.MILK.PF.pro = 0; }, 'MILK.PF.pro', /positive/],
  ['a negative where zero is allowed', (d) => { d.STOCK.a.k = -1; }, 'STOCK.a.k', /negative/],
  ['above the stated range (a slipped decimal)', (d) => { d.MILK.PF.pro = 26; }, 'MILK.PF.pro', /above/],
  ['below the stated range', (d) => { d.MILK.PF.kcal = 60; }, 'MILK.PF.kcal', /below/],
  ['a cell the skill codes, changed', (d) => { d.STOCK.a.perMl = 34.2; }, 'STOCK.a.perMl', /CR-T-MAX/],
  ['a limit the skill codes, changed', (d) => { d.MAX_X = 13; }, 'MAX_X', /CR-T-MAX/],
  ['a limit inside an object the skill codes, changed', (d) => { d.PAIR.max = 600; }, 'PAIR.max', /CR-T-MAX/],
  ['a limit typed as a string', (d) => { d.PAIR.warn = '40'; }, 'PAIR.warn', /string/],
  ['a list limit that became a number', (d) => { d.WARDS = 0; }, 'WARDS', /list/],
  ['a column with no unit header', (d) => { d.MILK.PF.ca = 120; }, 'MILK.PF.ca', /unit header/],
  ['a text cell with a trailing space is not trimmed', (d) => { d.MILK.PF.label = 'Preterm formula '; }, 'MILK.PF.label', /space/],
  ['a text cell left empty', (d) => { d.MILK.PF.label = ''; }, 'MILK.PF.label', /empty/],
  ['a flag typed as a string', (d) => { d.MILK.PF.lf = 'false'; }, 'MILK.PF.lf', /true or false/],
  ['a row key with a space', (d) => { d.MILK['PF 2'] = { label: 'Copy', lf: false, kcal: 80, pro: 2.6, osm: 310 }; }, 'MILK.PF 2', /key/],
  ['a dropdown key that is not in its table', (d, i) => { i.lists[0].keys.push('PF_24'); }, 'feed dropdown', /PF_24/],
  ['a dropdown key with a trailing space', (d, i) => { i.lists[0].keys[0] = 'BM '; }, 'feed dropdown', /"BM "/],
  ['a dropdown key in the wrong case', (d, i) => { i.lists[0].keys[0] = 'bm'; }, 'feed dropdown', /"bm"/],
  ['a dropdown key listed twice', (d, i) => { i.lists[0].keys.push('BM'); }, 'feed dropdown', /twice/],
  ['two dropdown options with one label', (d) => { d.MILK.PF.label = 'Breast milk'; }, 'feed dropdown', /label/],
  ['a key the backend refuses', (d, i) => { i.keyPatterns[0].keys.push('pf_lower'); }, 'backend feed key', /pf_lower/],
  ['a code reference to a row that is gone', (d, i) => { i.refs.push({ at: 'calc.jsx:10', table: 'STOCK', row: 'zz' }); }, 'calc.jsx:10', /STOCK\.zz/],
  ['a code reference to a cell the row lacks', (d, i) => { i.refs.push({ at: 'calc.jsx:11', table: 'STOCK', row: 'b', column: 'k' }); }, 'calc.jsx:11', /STOCK\.b\.k/],
  ['a row category the dropdowns do not know', (d) => { d.STOCK.b.kind = 'Base'; }, 'STOCK.b.kind', /Base/],
  ['a dropdown category no row has', (d, i) => { i.categoryFilters.push({ at: 'calc.jsx:6', table: 'STOCK', category: 'iron' }); }, 'calc.jsx:6', /iron/],
  ['a band whose ends are swapped', (d) => { d.TGT.prot = (dol) => (dol <= 1 ? [2.5, 1.5] : [2.5, 3.5]); }, 'TGT.prot', /above its upper/],
  ['a band end that is not a number', (d) => { d.TGT.prot = () => [2.5, '3.5']; }, 'TGT.prot', /string/],
  ['a band above the backend bound', (d) => { d.TGT.prot = () => [2.5, 9]; }, 'TGT.prot', /backend/],
  ['a band above its hard limit', (d) => { d.TGT.girBand = () => [4, 13]; }, 'TGT.girBand', /MAX_X/],
  ['an infinite band end where none is allowed', (d) => { d.TGT.prot = () => [2.5, Infinity]; }, 'TGT.prot', /finite/],
  ['a band below its floor', (d) => { d.TGT.ratio = () => [10, Infinity]; }, 'TGT.ratio', /MIN_Y/],
  ['a band with a negative end', (d) => { d.TGT.prot = () => [-1, 3.5]; }, 'TGT.prot', /negative/],
  ['a band that is not a pair', (d) => { d.TGT.prot = () => 3.5; }, 'TGT.prot', /pair/],
  ['an object band leaf above its limit', (d) => { d.TGT.gir = () => ({ start: [4, 8], max: 13 }); }, 'TGT.gir.max', /MAX_X/],
  ['a band with no unit header', (d) => { d.TGT.extra = () => [1, 2]; }, 'TGT.extra', /unit header/],
  ['a code-reading step that found nothing', (d, i) => { i.notFound.push({ where: 'calculator.jsx', problem: 'no feed dropdown list found' }); }, 'calculator.jsx', /feed dropdown/],
];
const SPEC_CASES = [
  ['a number column with no unit', (s) => { delete s.tables.MILK.columns.pro.unit; }, 'MILK.pro', /unit/],
  ['a range citing a rule the skill does not have', (s) => { s.tables.MILK.columns.kcal.range.rule = 'CR-T-GONE'; }, 'MILK.kcal', /CR-T-GONE/],
  ['a rule-ranged cell with no rule and no stated range', (s) => { delete s.tables.STOCK.cells['b.perMl']; }, 'STOCK.b.perMl', /no stated range/],
  ['a value the skill codes that has no unit header', (s) => { delete s.limits['PAIR.max']; }, 'PAIR.max', /unit header/],
  ['a band whose backend bound is gone', (s, i) => { i.backendBounds = {}; }, 'TGT.prot', /backend bound/],
];

for (const [name, mutate, where, word, specMutate] of CASES) {
  const r = run(mutate, specMutate);
  const f = r.failures;
  ok(`#1 ${name}: one failure at ${where}`, f.length === 1 && f[0].where === where && word.test(f[0].problem), f);
}
for (const [name, specMutate, where, word] of SPEC_CASES) {
  const r = run(null, specMutate);
  const f = r.failures;
  ok(`#1 spec: ${name}: one failure at ${where}`, f.length === 1 && f[0].where === where && word.test(f[0].problem), f);
}

{
  // Nothing is coerced or trimmed: the check leaves every cell as it was.
  const data = withKinds(goodData());
  data.MILK.BM.pro = ' 1.2 ';
  data.MILK.PF.label = 'Preterm formula ';
  const before = JSON.stringify(data);
  const r = RT.checkReferenceTabs(goodInput(data), clone(SPEC));
  ok('#1 the check changes no cell (a padded string stays padded)', JSON.stringify(data) === before && r.failures.length === 2, r.failures);
}

// ── #2 the source readers ─────────────────────────────────────────────────
console.log('\n── #2 the readers find the dropdown lists and the backend key rule ──');
{
  const src = {
    'calculator.jsx': [
      'const [enType, setEnType] = useState("BM");',
      '{["BM", "PF"].filter(k => D.EN_DB[k]).map(k => <option/>)}',
      '{["LF_20"].filter(k => D.EN_DB[k]).map(k => <option/>)}',
      'const x = D.KCMH_STOCK.naCl.naMeqPerMl;',
      'Object.entries(D.SUPP_DB).filter(([,v]) => v.category === "fe")',
      'const aaChoices = (centerPoint || scratch) ? ["aminoven10"] : D.aaProductsFor(patient);',
    ].join('\n'),
    'log.jsx': 'const NURSING_FEED_OPTIONS = [...Object.entries(D_L.EN_DB).map(([k, v]) => [k, v.label]), ["MIXED", "many"]];',
    'app.jsx': 'const y = D_A.EN_DB.BM.label;',
    'data.js': 'function aaProductsFor(patient) {\n  return isNewbornUnit(patient) ? ["aminoven10"] : ["aminoven10", "aminoplasmal15"];\n}',
    'gas-backend.gs': 'var NURSING_FEED_KEY_RE = /^[A-Z][A-Z0-9_]{0,39}$/;\n  _checkRange(entry.pro,          0,   8,    "Protein (g/kg/d)");',
  };
  const spec = { defaults: { enType: { table: 'EN_DB' } }, nursingFeedTable: 'EN_DB' };
  const r = RT.fromSources(src, spec, { EN_DB: { BM: {}, PF: {}, LF_20: {} } });
  const feed = r.lists.find(l => /feed dropdown/.test(l.name));
  ok('#2.1 the Calculator feed groups are read as one list, in order', feed && JSON.stringify(feed.keys) === '["BM","PF","LF_20"]', r.lists);
  ok('#2.2 the feed list names where it was read', feed && feed.at === 'calculator.jsx:2', feed);
  ok('#2.3 the enType default is read', r.lists.some(l => /enType/.test(l.name) && l.keys[0] === 'BM'), r.lists);
  ok('#2.4 both amino-acid choice lists are read, with their stock column', r.lists.filter(l => l.table === 'KCMH_STOCK' && l.requireColumn === 'gPerMl').length === 2, r.lists);
  ok('#2.5 the backend key rule is read as a RegExp, not rewritten', r.keyPatterns[0] && String(r.keyPatterns[0].pattern) === '/^[A-Z][A-Z0-9_]{0,39}$/', r.keyPatterns);
  ok('#2.6 the nursing feed keys are every EN_DB key and MIXED', r.keyPatterns[0] && JSON.stringify(r.keyPatterns[0].keys) === '["BM","PF","LF_20","MIXED"]', r.keyPatterns);
  ok('#2.7 the backend save bound for protein is 0–8', r.backendBounds.pro && r.backendBounds.pro.lo === 0 && r.backendBounds.pro.hi === 8, r.backendBounds);
  ok('#2.8 code references to a row and a cell are read with their line', r.refs.some(x => x.table === 'KCMH_STOCK' && x.row === 'naCl' && x.column === 'naMeqPerMl' && x.at === 'calculator.jsx:4')
    && r.refs.some(x => x.table === 'EN_DB' && x.row === 'BM' && x.at === 'app.jsx:1'), r.refs);
  ok('#2.9 the supplement dropdown category is read', r.categoryFilters.some(c => c.table === 'SUPP_DB' && c.category === 'fe'), r.categoryFilters);
  ok('#2.10 nothing reported missing', r.notFound.length === 0, r.notFound);
  const ra = RT.fromSources({ ...src, 'calculator.jsx': `${src['calculator.jsx']}\nconst S = D.KCMH_STOCK;\nconst g = S.d50w.gPerMl * 2; const o = obj.S.x;` }, spec, { EN_DB: {} });
  ok('#2.12 a reference through an alias (const S = D.KCMH_STOCK) is read, obj.S.x is not',
    ra.refs.some(x => x.table === 'KCMH_STOCK' && x.row === 'd50w' && x.column === 'gPerMl') && !ra.refs.some(x => x.row === 'x'), ra.refs);
  const calcLines = src['calculator.jsx'].split('\n');
  const productsSrc = { ...src, 'calculator.jsx': [calcLines[0], '{D.EN_PRODUCTS.map(p => <option/>)}', ...calcLines.slice(3)].join('\n') };
  const rp = RT.fromSources(productsSrc, spec, { EN_DB: { BM: {}, PF: {}, LF_20: {} },
    EN_PRODUCTS: [{ id: 'bm', strengths: [[20, 'BM']] }, { id: 'lf', strengths: [[20, 'PF'], [24, 'LF_20']] }] });
  const pf = rp.lists.find(l => /feed dropdown/.test(l.name));
  ok('#2.13 a dropdown that reads D.EN_PRODUCTS (#182) is every strength key, in order, where it is read',
    pf && JSON.stringify(pf.keys) === '["BM","PF","LF_20"]' && pf.at === 'calculator.jsx:2', rp.lists);
  const rp2 = RT.fromSources(productsSrc, spec, { EN_DB: { BM: {} } });
  ok('#2.14 a dropdown that reads D.EN_PRODUCTS with no EN_PRODUCTS in data.js says so',
    rp2.notFound.some(x => x.problem.includes('EN_PRODUCTS')) && !rp2.lists.some(l => /feed dropdown/.test(l.name)), rp2.notFound);
  const r2 = RT.fromSources({ ...src, 'calculator.jsx': 'nothing here', 'gas-backend.gs': '' }, spec, { EN_DB: {} });
  ok('#2.11 a reader that finds nothing says so, it does not pass quietly',
    ['feed dropdown', 'enType', 'NURSING_FEED_KEY_RE', 'aaChoices', 'category'].every(w => r2.notFound.some(x => x.problem.includes(w))), r2.notFound);
}

// ── #3 the real tables ────────────────────────────────────────────────────
console.log('\n── #3 the real reference tables against tools/reference-tabs.json ──');
{
  const input = RT.readReferenceTabs(DIR);
  const spec = RT.readSpec(DIR);
  if (NEG === '1') input.data.EN_DB.BM_20.pro = '1.2';
  if (NEG === '2') input.data.KCMH_STOCK.naCl.naMeqPerMl = 34.2;
  if (NEG === '3') input.lists.find(l => /feed dropdown/.test(l.name)).keys[0] = 'BM_20 ';
  if (NEG) console.log(`  NEGATIVE_CONTROL=${NEG}: this section must fail`);
  const r = RT.checkReferenceTabs(input, spec);
  const c = r.counts;
  console.log(`  checked ${c.cells} cells in ${c.tables} tables, ${c.limits} limits, ${c.bandCalls} band calls on ${c.bands} bands, `
    + `${c.listKeys} lookup keys, ${c.refs} code references`);
  const backend = r.fromRules.filter(x => x.how === 'backend').length;
  console.log(`  ranges: ${r.fromRules.length - backend} from CR- rules, ${backend} from the backend's save bounds, `
    + `${r.proposed.length} proposed and waiting for Pp (tools/reference-tabs.json)`);
  for (const f of r.failures) console.log(`  ✗ ${f.where}: ${f.problem}`);
  ok('#3.1 the skill parses with no error', input.ruleErrors.length === 0, input.ruleErrors);
  ok('#3.2 every reference cell, limit, band and lookup key holds', r.failures.length === 0, `${r.failures.length} failing, listed above`);
  ok('#3.3 the check reached each table (EN_DB, KCMH_STOCK, SUPP_DB), the limits and the three target tables',
    ['EN_DB', 'KCMH_STOCK', 'SUPP_DB'].every(t => r.seen.tables.includes(t)) && c.limits >= 20
    && ['TPN_TARGETS', 'ENTERAL_TARGETS', 'TARGETS'].every(t => r.seen.bands.includes(t)), r.seen);
  ok('#3.4 the readers found the feed dropdown, the defaults, the amino-acid lists and the backend key rule',
    input.lists.some(l => /feed dropdown/.test(l.name) && l.keys.length >= 10) && input.keyPatterns.length === 1 && input.notFound.length === 0, input.notFound);
  ok('#3.5 every KCMH_STOCK strength the skill codes is ranged from its rule',
    Object.entries(input.data.KCMH_STOCK).every(([row, cells]) => Object.entries(cells).every(([col, v]) =>
      typeof v !== 'number' || r.fromRules.some(x => x.where === `KCMH_STOCK.${row}.${col}`) || r.proposed.some(x => x.where === `KCMH_STOCK.${row}.${col}`))), r.fromRules.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
