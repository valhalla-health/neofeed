// verify-ward-requests-0925.cjs — Pp's three requests of 2026-09-25.
//
//   1. "Android เลื่อนแล้วไม่เต็มช่อง" — a calculator step was clipped on a
//      phone. The open state of .accordion-body was `max-height: 1800px`; the
//      two-column steps stack below 768px, and Step 3 measured 1943px at 360px
//      wide, so its last 143px (the Lipid and NPC : Protein tiles) were cut
//      off with nothing to scroll to. A step now opens by sliding one grid row
//      from 0fr to 1fr — the content's own height — through StepBody.
//   2. "ใส่ชื่อ เป็นชื่อ + นามสกุล เอาตัวอักษรไทย สองตัวแรก", then "ให้ใส่เป็นชื่อ
//      ภาษาไทย (ยกเว้นต่างชาติ)" — the name is two boxes, the first two
//      characters of the first name and of the surname, Thai unless the infant
//      is foreign (English). Stored as "สม ใจ"; the sessionId keeps initials.
//   3. "ช่องค้นหา เอาวอร์ดออก … ให้ค้นหาได้ทั้งชื่อนามสกุล … ค้นหายากมาก" — the
//      ward list searches its own ward (verify-registry-logged-today.cjs pins
//      that half), and one forgiving search (data.js searchPatients) answers a
//      first name or a surname, whole or begun, in both search boxes.
//
// Sections 1-5 run everywhere (static source checks, pure helpers, jsdom).
// Section 6 measures the real calculator in Chromium when playwright is
// installed; CI installs no browser, so there it degrades to a notice, like
// verify-mobile-fit.cjs.
//   node test/verify-ward-requests-0925.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const read = (f) => fs.readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 300)}`);
  cond ? pass++ : fail++;
}
const eq = (name, got, want) => ok(`${name}  (${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want), { got, want });

const SHELLS = ['NeoFeed.html', 'index.html'];
const cssOf = (shell) => read(shell).match(/<style>([\s\S]*?)<\/style>/)[1];
const rulesFor = (css, sel) => [...css.matchAll(new RegExp(`(^|[\\n}])\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))].map(m => m[2]);

// ══ 1 · a step is never capped ══════════════════════════════════════════════
console.log('\n── #1 an open calculator step is as tall as its content ──');
for (const shell of SHELLS) {
  const css = cssOf(shell);
  const body = rulesFor(css, '.accordion-body');
  const open = rulesFor(css, '.accordion-body.open');
  const inner = rulesFor(css, '.accordion-inner');
  ok(`${shell}: .accordion-body and .accordion-body.open are styled`, body.length === 1 && open.length === 1, { body, open });
  ok(`${shell}: nothing in either sets a max-height or a height (the 1800px cap is gone)`,
    ![...body, ...open].some(r => /(^|[^-])(max-)?height\s*:/.test(r)), [...body, ...open]);
  ok(`${shell}: closed is one grid row at 0fr`,
    /display:\s*grid/.test(body[0] || '') && /grid-template-rows:\s*0fr/.test(body[0] || ''), body[0]);
  ok(`${shell}: open is that row at 1fr — the content's own height`, /grid-template-rows:\s*1fr/.test(open[0] || ''), open[0]);
  ok(`${shell}: the slide is still animated, and visibility still hides a closed step`,
    /transition:\s*grid-template-rows/.test(body[0] || '') && /visibility:\s*hidden/.test(body[0] || '')
    && /visibility:\s*visible/.test(open[0] || ''), body[0]);
  ok(`${shell}: .accordion-inner can close to nothing and clips while sliding`,
    inner.length === 1 && /min-height:\s*0/.test(inner[0]) && /overflow:\s*hidden/.test(inner[0]), inner);
  ok(`${shell}: no other rule anywhere caps .accordion-body`,
    ![...css.matchAll(/\.accordion-(body|inner)[^{]*\{([^}]*)\}/g)].some(m => /max-height\s*:/.test(m[2])));
}
{
  const src = read('calculator.jsx');
  ok('calculator.jsx: one "accordion-body" className in the file — the one StepBody renders',
    (src.match(/className=\{`accordion-body/g) || []).length === 1
    && /function StepBody\(\{ open, children \}\) \{\s*return \(\s*<div className=\{`accordion-body\$\{open \? " open" : ""\}`\}>\s*<div className="accordion-inner">\{children\}<\/div>/.test(src));
  for (let n = 1; n <= 6; n++) {
    ok(`calculator.jsx: step ${n}'s body goes through StepBody`,
      (src.match(new RegExp(`<StepBody open=\\{openSteps\\.has\\(${n}\\)\\}>`, 'g')) || []).length === 1);
  }
  eq('calculator.jsx: six StepBody closes for six opens', (src.match(/<\/StepBody>/g) || []).length, 6);
}

// ══ jsdom + the modules ═════════════════════════════════════════════════════
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
global.self = window;
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.getComputedStyle = window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;

vm.runInThisContext(read('data.js'));
const D = window.NEOFEED_DATA;
// registry.jsx only uses <Icon> as decoration.
global.Icon = () => null; window.Icon = global.Icon;
vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + 'registry.jsx', 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: 'registry.jsx', configFile: false, babelrc: false,
}).code);

// ══ 2 · the name: two parts, two characters each ═══════════════════════════
console.log('\n── #2 ชื่อ + นามสกุล, two characters each (Thai; English if foreign) ──');
const TH = [
  ['สมศรี', 'สม'], ['ปราณี', 'ปร'], ['พัฒนา', 'พั'], ['น้ำฝน', 'น้'], ['เพ็ญ', 'เพ'],
  ['ใจดี', 'ใจ'], ['ไพลิน', 'ไพ'],
  ['Sombat', ''],            // not Thai: nothing is kept (the box says why)
  ['ส1ม', 'สม'],              // digits are not letters
  ['๑๒สม', 'สม'],             // nor are Thai digits
  ['ัสม', 'สม'],              // a mark cannot begin a name
  ['าสม', 'สม'],              // nor can a following vowel
  ['ทํางาน', 'ทำ'],           // ํ + า is ำ, one character
  [' ใจ ดี ', 'ใจ'],          // spaces are not letters
  ['ด.ญ.สมศรี', 'ดญ'],         // an honorific is not stripped here — NameFields questions it
];
for (const [raw, want] of TH) eq(`Thai: ${JSON.stringify(raw)} keeps`, D.namePart(raw, false), want);
const EN = [['john', 'Jo'], ['SMITH', 'Sm'], ['José', 'Jo'], ["o'neil", 'On'], ['ส้ม', ''], ['x1y', 'Xy']];
for (const [raw, want] of EN) eq(`foreign: ${JSON.stringify(raw)} keeps`, D.namePart(raw, true), want);
eq('two characters is the rule', D.NAME_PART_CHARS, 2);
eq('complete: both parts at two', [D.nameComplete('สม', 'ใจ'), D.nameComplete('ส', 'ใจ'), D.nameComplete('สม', ''),
  D.nameComplete('Jo', 'Sm', true), D.nameComplete('jo', 'Sm', true)], [true, false, false, true, false]);
eq('stored as "ชื่อ นามสกุล"', [D.composePatientName('สม', 'ใจ'), D.composePatientName('Jo', 'Sm', true)], ['สม ใจ', 'Jo Sm']);
eq('split back into its parts', D.splitPatientName('สม ใจ'), { first: 'สม', last: 'ใจ', foreign: false });
eq('…an English one says it is foreign', D.splitPatientName('Jo Sm'), { first: 'Jo', last: 'Sm', foreign: true });
eq('names from before 2026-09-25 do not split — kept as they are',
  ['ปพ', 'KH', 'Fo', 'JO SM', '[PDPA-erased 2026-09-01]', 'ส ใ', '', null].map(D.splitPatientName),
  [null, null, null, null, null, null, null, null]);
eq('the id keeps initials: first consonant of each part (a leading vowel is skipped)',
  [D.nameInitials('สม', 'ใจ'), D.nameInitials('เพ', 'แก'), D.nameInitials('อุ', 'ไพ'), D.nameInitials('Jo', 'Sm')],
  ['สจ', 'พก', 'อพ', 'JS']);

// ══ 3 · the search ═════════════════════════════════════════════════════════
console.log('\n── #3 one forgiving search: first name or surname, whole or begun ──');
const P = (sessionId, name, currentBed, diagnosis, extra) => Object.assign(
  { sessionId, name, initials: name, currentBed, diagnosis, status: 'Active' }, extra || {});
const WARD = [
  P('สใ-BW1200', 'สม ใจ',  'NICU 1',  'RDS'),
  P('ปพ-BW900',  'ปร พั',  'NICU 10', 'NEC'),
  P('นใ-BW1500', 'น้ ใจ',  'NICU 5',  'PDA'),
  P('ปพ-BW1100', 'ปพ',     'NICU 3',  'RDS'),     // registered before 2026-09-25
  P('JS-BW2000', 'Jo Sm',  'NICU 12', 'TTNB'),    // foreign
  P('FO-1',      'Fo',     'iso 1-2', ''),         // an old Latin nickname
];
const names = (q) => D.searchPatients(WARD, q).hits.map(p => p.name);
const CASES = [
  ['สม',           ['สม ใจ']],                     // a first name, begun
  ['สมศรี',        ['สม ใจ']],                     // …typed whole
  ['สมศรี ใจดี',   ['สม ใจ']],                     // both, whole
  ['สม ใจ',        ['สม ใจ']],                     // as displayed
  ['สมใจ',         ['สม ใจ']],                     // …without the space
  ['ใจดี',         ['สม ใจ', 'น้ ใจ']],            // a surname finds everyone who has it
  ['ปราณี พัฒนา',  ['ปร พั', 'ปพ']],               // the old initials still answer, below the real match
  ['พัฒนา',        ['ปร พั', 'ปพ']],
  ['น้ำฝน',        ['น้ ใจ']],
  ['นำฝน',         ['น้ ใจ']],                     // a tone mark left out
  ['ด.ญ. สมศรี',   ['สม ใจ']],                     // an honorific copied from the record
  ['บุตรนางสมศรี', ['สม ใจ']],
  ['john',         ['Jo Sm']],
  ['smith',        ['Jo Sm']],
  ['fo',           ['Fo']],                        // an old nickname, as it always matched
  ['5',            ['น้ ใจ']],                     // a bed number
  ['1',            ['สม ใจ', 'ปร พั', 'Jo Sm', 'Fo']], // NICU 1 first, then 10, 12, iso 1-2
  ['nicu 5',       ['น้ ใจ']],
  ['สใ-bw1200',    ['สม ใจ']],                     // the NeoFeed ID on the order form
  ['nec',          ['ปร พั']],                     // a diagnosis, last
  ['สุ',           []],
  ['',             []],
];
for (const [q, want] of CASES) eq(`"${q}" finds`, names(q), want);
eq('the exact name ranks above a begun one',
  D.patientSearchRank(WARD[0], 'สม ใจ') > D.patientSearchRank(WARD[0], 'สม'), true);
{
  // The keyboard left in English: nothing matches as typed, so it is read as
  // the Thai keys, and the result says so.
  const r = D.searchPatients(WARD, 'l,');
  eq('"l," (สม on an English keyboard) is read as Thai', [r.hits.map(p => p.name), r.thai], [['สม ใจ'], 'สม']);
  eq('…but a query that matches as typed is never re-read', D.searchPatients(WARD, 'fo').thai, '');
  eq('…and a bed number is never read as a letter (5 is ถ)', D.searchPatients(WARD, '55').hits.length, 0);
  eq('the classic check: "l;ylfu" is สวัสดี', D.qwertyToThai('l;ylfu'), 'สวัสดี');
  eq('…both shift levels ("L:" is ศซ)', D.qwertyToThai('L:'), 'ศซ');
  eq('…and anything else passes through', D.qwertyToThai('สม 12 ?'), 'สม ๅ/ ฦ');
}
// The whole layout against the system's own definition, where it is installed
// (Linux with xkb-data; CI runners usually have it — skipped, not failed, if not).
{
  const xkbFile = '/usr/share/X11/xkb/symbols/th', ksFile = '/usr/include/X11/keysymdef.h';
  if (!fs.existsSync(xkbFile) || !fs.existsSync(ksFile)) {
    console.log('  SKIP  no xkb-data / keysymdef.h here — the full Kedmanee table is not re-derived');
  } else {
    const xkb = fs.readFileSync(xkbFile, 'utf8');
    const basic = xkb.slice(xkb.indexOf('xkb_symbols "basic"')).split('\n};')[0];
    const keys = Object.fromEntries([...basic.matchAll(/key <(\w+)>\s*\{\[\s*([^\]]+?)\s*\]\}/g)].map(m => [m[1], m[2]]));
    const ks = {};
    for (const line of fs.readFileSync(ksFile, 'utf8').split('\n')) {
      const m = /^#define XK_(\w+)\s+0x[0-9a-f]+\s*\/\*\s*U\+([0-9A-F]+)/.exec(line);
      if (m) ks[m[1]] = String.fromCodePoint(parseInt(m[2], 16));
    }
    const ascii = { underscore: '_', percent: '%', plus: '+', slash: '/', minus: '-', quotedbl: '"', comma: ',',
      period: '.', parenleft: '(', parenright: ')', question: '?' };
    const us = [['TLDE', '`~']];
    '1234567890-='.split('').forEach((c, i) => us.push([`AE${String(i + 1).padStart(2, '0')}`, c + '!@#$%^&*()_+'[i]]));
    'qwertyuiop[]'.split('').forEach((c, i) => us.push([`AD${String(i + 1).padStart(2, '0')}`, c + 'QWERTYUIOP{}'[i]]));
    "asdfghjkl;'".split('').forEach((c, i) => us.push([`AC${String(i + 1).padStart(2, '0')}`, c + 'ASDFGHJKL:"'[i]]));
    us.push(['BKSL', '\\|']);
    'zxcvbnm,./'.split('').forEach((c, i) => us.push([`AB${String(i + 1).padStart(2, '0')}`, c + 'ZXCVBNM<>?'[i]]));
    const wrong = [];
    for (const [k, pair] of us) {
      const syms = (keys[k] || '').split(',').map(x => x.trim()).map(x => ascii[x] || ks[x]);
      [0, 1].forEach(lvl => { if (D.qwertyToThai(pair[lvl]) !== syms[lvl]) wrong.push(`${pair[lvl]}→${D.qwertyToThai(pair[lvl])} (xkb ${syms[lvl]})`); });
    }
    ok(`every one of the 94 keys matches xkb "th" basic`, us.length === 47 && wrong.length === 0, wrong);
  }
}

// ══ 4 · the two patient modals ══════════════════════════════════════════════
console.log('\n── #4 Register and Edit: the two name boxes ──');
const host = document.getElementById('root');
const root = ReactDOM.createRoot(host);
const mount = (el, props) => act(() => { root.render(React.createElement(el, props)); });
const field = (label) => [...host.querySelectorAll('.field')]
  .find(f => f.querySelector('label')?.textContent.trim().startsWith(label));
const input = (label) => field(label)?.querySelector('input, select');
const setters = { INPUT: Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set,
  SELECT: Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set };
const type = (label, v) => act(() => {
  const el = input(label);
  setters[el.tagName].call(el, String(v));
  el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const click = (el) => act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const button = (re) => [...host.querySelectorAll('button')].find(b => re.test(b.textContent));
const foreignBox = () => host.querySelector('.name-foreign input');

{
  let sent = null;
  mount(global.NewPatientModal, { patients: [], onClose() {}, onSubmit: (p) => { sent = p; } });
  ok('Register: a ชื่อ box and a นามสกุล box, and no ชื่อย่อ box', !!input('ชื่อ') && !!input('นามสกุล') && !field('ชื่อย่อ'));
  type('ชื่อ', 'สมศรี');
  type('นามสกุล', 'ใจดี');
  eq('each box keeps its first two characters', [input('ชื่อ').value, input('นามสกุล').value], ['สม', 'ใจ']);
  type('ชื่อ', 'สมx');
  ok('a Latin letter is not saved…', input('ชื่อ').value === 'สม');
  ok('…and the box says why, pointing a foreign infant at the tick box',
    /พิมพ์เป็นภาษาไทย/.test(field('ชื่อ').textContent) && /ชาวต่างชาติ/.test(field('ชื่อ').textContent));
  type('ชื่อ', 'สมศ');     // the next Thai letter typed (the box is full, so it is not kept)
  ok('…and stops saying it once the typing is Thai again',
    input('ชื่อ').value === 'สม' && !/พิมพ์เป็นภาษาไทย/.test(host.textContent));
  type('ชื่อ', 'ด.ช.สม');
  ok('an honorific typed first is questioned', input('ชื่อ').value === 'ดช' && /ไม่ต้องใส่คำนำหน้า/.test(host.textContent));
  type('ชื่อ', 'ส');
  type('Birth weight', 1000);
  type('GA', '30');
  type('Sex', 'girls');
  const reg = button(/Register/);
  ok('Register waits for both parts at two characters', reg.disabled && /นามสกุล อย่างละ 2 ตัว/.test(host.textContent));
  type('ชื่อ', 'สม');
  ok('…and opens when they are', !reg.disabled);
  click(reg);
  eq('saved as "สม ใจ", initials สจ, id สจ-BW1000',
    sent && [sent.name, sent.initials, sent.sessionId], ['สม ใจ', 'สจ', 'สจ-BW1000']);

  // A foreign infant.
  click(foreignBox());
  eq('ticking ชาวต่างชาติ empties both boxes', [input('ชื่อ').value, input('นามสกุล').value], ['', '']);
  type('ชื่อ', 'John');
  type('นามสกุล', 'Smith');
  eq('…which then take English', [input('ชื่อ').value, input('นามสกุล').value], ['Jo', 'Sm']);
  type('ชื่อ', 'Joส');
  ok('…and question Thai instead', input('ชื่อ').value === 'Jo' && /พิมพ์เป็นภาษาอังกฤษ/.test(host.textContent));
  click(button(/Register/));
  eq('saved as "Jo Sm", id JS-BW1000', sent && [sent.name, sent.initials, sent.sessionId], ['Jo Sm', 'JS', 'JS-BW1000']);
}
{
  const base = { sessionId: 'KH-BW1090', name: 'KH', initials: 'KH', bw: 1090, ga: 29.2, sex: 'boys',
    dob: '2026-08-14', admissionDate: '2026-08-14', twinSuffix: '', status: 'Active', currentBed: 'NICU 7',
    diagnosis: 'VLBW', weights: [{ dol: 1, w: 1090 }], lengths: [], hcs: [], bedHistory: [] };
  let sent = null, opened = 0;
  // A fresh modal each time (the key), as the app mounts one per Edit press.
  const open = (patient) => { sent = null; mount(global.EditPatientModal, { key: ++opened, patient, patients: [patient], onClose() {}, onSubmit: (p) => { sent = p; } }); };
  const save = () => click(button(/Save changes/));

  open(base);
  eq('Edit, an old name: both boxes open empty', [input('ชื่อ').value, input('นามสกุล').value], ['', '']);
  ok('…with the old name shown and kept by default', /ชื่อเดิม\s*KH/.test(host.textContent) && !button(/Save changes/).disabled);
  type('Diagnosis', 'VLBW, PDA');
  save();
  eq('…so fixing the diagnosis leaves the name exactly as it was',
    sent && [sent.name, sent.initials, sent.sessionId, sent.diagnosis], ['KH', 'KH', 'KH-BW1090', 'VLBW, PDA']);
  open(base);
  type('ชื่อ', 'กล');
  ok('half a new name blocks Save, and says so',
    button(/Save changes/).disabled && /กรอกชื่อ \+ นามสกุลให้ครบ/.test(host.textContent));
  type('นามสกุล', 'มน');
  save();
  eq('a whole new name replaces it; the id does not move',
    sent && [sent.name, sent.initials, sent.sessionId], ['กล มน', 'กม', 'KH-BW1090']);

  open({ ...base, name: 'สม ใจ', initials: 'สจ' });
  eq('Edit, a two-part name opens in its boxes', [input('ชื่อ').value, input('นามสกุล').value, foreignBox().checked], ['สม', 'ใจ', false]);
  type('นามสกุล', '');
  ok('…and must stay complete', button(/Save changes/).disabled);
  open({ ...base, name: 'Jo Sm', initials: 'JS' });
  eq('an English name opens with ชาวต่างชาติ ticked', [input('ชื่อ').value, foreignBox().checked], ['Jo', true]);
}

// ══ 5 · the two search boxes ════════════════════════════════════════════════
console.log('\n── #5 the ward list and the topbar switcher search the same way ──');
{
  const patients = [
    { ...WARD[0], bw: 1200, ga: 30, weights: [] }, { ...WARD[1], bw: 900, ga: 27, weights: [] },
    { ...WARD[2], bw: 1500, ga: 32, weights: [] }, { ...WARD[3], bw: 1100, ga: 29, weights: [] },
  ];
  let picked = null;
  mount(global.PatientPicker, { patients, activeId: null, onSelect: (id) => { picked = id; }, onClose() {} });
  const pick = host.querySelector('.picker-h input');
  ok('switcher: the box asks for a name or a surname', /^ค้นหา/.test(pick.placeholder) && /นามสกุล/.test(pick.placeholder));
  act(() => { setters.INPUT.call(pick, 'ใจดี'); pick.dispatchEvent(new window.Event('input', { bubbles: true })); });
  const rows = () => [...host.querySelectorAll('.picker-row')].map(r => r.textContent);
  ok('switcher: a surname finds both infants who have it', rows().length === 2 && rows().every(t => /ใจ/.test(t)), rows());
  act(() => { setters.INPUT.call(pick, 'ปราณี'); pick.dispatchEvent(new window.Event('input', { bubbles: true })); });
  ok('switcher: the best match is first', /ปร พั/.test(rows()[0] || ''), rows());
  click(host.querySelector('.picker-row'));
  eq('…and picking it opens that infant', picked, 'ปพ-BW900');

  mount(global.PatientRegistry, { patients, log: {}, activeId: null, ward: 'NICU', onWardChange() {},
    onSelect() {}, onAdd() {}, onEdit() {}, onDelete() {} });
  const box = host.querySelector('.reg-search input');
  const cards = () => [...host.querySelectorAll('.patient-card-list > .patient-mc .pmc-name')].map(n => n.textContent);
  const typeBox = (v) => act(() => { setters.INPUT.call(box, v); box.dispatchEvent(new window.Event('input', { bubbles: true })); });
  ok('ward list: the box asks for a name or a surname, not "the whole unit"',
    /ชื่อ หรือ นามสกุล/.test(box.placeholder) && !/unit/.test(box.placeholder), box.placeholder);
  ok('ward list: no autocomplete or spellcheck on a shared workstation',
    box.getAttribute('autocomplete') === 'off' && box.getAttribute('spellcheck') === 'false');
  ok('ward list: no clear button while the box is empty', !host.querySelector('.s-clear'));
  typeBox('ปราณี');
  eq('ward list: best match first, the old-initials candidate after it', cards(), ['ปร พั', 'ปพ']);
  ok('…and it says how many it found', /พบ 2 รายใน NICU/.test(host.textContent));
  click(host.querySelector('.s-clear'));
  eq('the clear button empties the box and brings the ward back', [box.value, cards().length], ['', 4]);
  typeBox('l,');
  eq('an English-keyboard query is read as Thai…', cards(), ['สม ใจ']);
  ok('…and the list says what it searched for', /ค้นเป็น “สม” \(แป้นพิมพ์ภาษาไทย\)/.test(host.textContent));
  act(() => { box.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  eq('Escape clears the box', box.value, '');
}
// The search glyph — on the ward list's box and on the topbar's search
// button — was a plain ring: its handle was a line drawn out and back, which
// encloses no area, so it vanished in fill. Its handle must now enclose area,
// and lie outside the rim, where evenodd cannot cut it back out.
{
  const d = (/search:\s*"([^"]+)"/.exec(read('icons.jsx')) || [])[1] || '';
  const polys = [...d.matchAll(/M([\d.]+) ([\d.]+)((?:L[\d.]+ [\d.]+)+)z/g)].map(m =>
    [[+m[1], +m[2]], ...[...m[3].matchAll(/L([\d.]+) ([\d.]+)/g)].map(n => [+n[1], +n[2]])]);
  const area = (pts) => Math.abs(pts.reduce((a, [x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; return a + x * v - u * y; }, 0)) / 2;
  const handle = polys[0] || [];
  ok('the search glyph has a handle that encloses area', polys.length === 1 && area(handle) > 10, { polys, area: area(handle) });
  ok('…drawn outside the rim (r 8 about 10,10), so evenodd leaves it filled',
    handle.length === 4 && handle.every(([x, y]) => Math.hypot(x - 10, y - 10) >= 7.99), handle);
}
for (const shell of SHELLS) {
  const css = cssOf(shell);
  ok(`${shell}: the two name boxes stay side by side on a phone (.row-2.pair-row)`,
    rulesFor(css, '.row-2.pair-row').some(r => /grid-template-columns:\s*1fr 1fr/.test(r)));
  // 44px on touch, in the phone block and in the coarse-pointer tablet block.
  const blocks = (re) => [...css.matchAll(re)].map(m => m[1]);
  const touch44 = (b) => /\.s-clear\s*\{[^}]*width:\s*44px;\s*height:\s*44px/.test(b) && /\.name-foreign\s*\{[^}]*min-height:\s*44px/.test(b);
  ok(`${shell}: the clear button and the tick box are 44px on a phone`,
    blocks(/@media \(max-width: 767px\) \{([\s\S]*?)\n  \}/g).some(touch44));
  ok(`${shell}: …and on a touch tablet`,
    blocks(/@media \(hover: none\) and \(pointer: coarse\) and \(min-width: 768px\) \{([\s\S]*?)\n  \}/g).some(touch44));
}

// ══ 6 · measured in Chromium ════════════════════════════════════════════════
// The real, shipped calculator (compiled/calculator.js) under the real shell
// CSS, every step open, at phone widths. jsdom has no layout, so this is the
// only place the clip itself can be seen. The negative control puts the old
// rule back and must see Step 3 clipped — a measurement that cannot fail
// proves nothing.
async function measureInChromium() {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch { console.log('  SKIP  playwright not installed — static CSS assertions only'); return; }
  const exe = ['/opt/pw-browsers/chromium', undefined].find(p => p === undefined || fs.existsSync(p));
  let browser;
  try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
  catch (e) { console.log('  SKIP  could not launch Chromium (' + e.message.split('\n')[0] + ')'); return; }
  const OLD = `.accordion-body { display: block; overflow: hidden; max-height: 0; }
    .accordion-body.open { max-height: 1800px; }`;
  const scripts = ['vendor/react-18.3.1.production.min.js', 'vendor/react-dom-18.3.1.production.min.js',
    'data.js', 'compiled/icons.js', 'compiled/calculator.js'];
  const run = async (W, extraCss) => {
    const page = await browser.newPage({ viewport: { width: W, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${cssOf('NeoFeed.html')}${extraCss || ''}</style></head>
      <body><main class="work"><div class="work-inner" id="calc"></div></main></body></html>`);
    for (const s of scripts) await page.addScriptTag({ content: fs.readFileSync(DIR + s, 'utf8') });
    await page.evaluate(() => {
      window.showToast = () => {};
      ReactDOM.createRoot(document.getElementById('calc')).render(React.createElement(window.Calculator, {
        patient: { sessionId: null, name: null, initials: null, bw: 0, ga: 0, sex: '', currentBed: '',
          diagnosis: '', weights: [], lengths: [], hcs: [] },
        dol: 5, scratch: true, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null,
        userLabel: '', userEmail: '',
      }));
    });
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: 'Open all' }).first().click();
    await page.waitForTimeout(600);                        // past the 0.32s slide
    const open = await page.evaluate(() => [...document.querySelectorAll('.accordion-body')].map(el => ({
      step: (el.previousElementSibling?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 12),
      open: el.classList.contains('open'), content: el.scrollHeight, shown: el.clientHeight,
    })));
    await page.locator('button', { hasText: 'Close all' }).first().click();
    await page.waitForTimeout(600);
    const closed = await page.evaluate(() => [...document.querySelectorAll('.accordion-body')].map(el =>
      ({ h: el.getBoundingClientRect().height, vis: getComputedStyle(el).visibility })));
    await page.close();
    return { open, closed, errors };
  };
  for (const W of [320, 360, 390, 412, 1280]) {
    const r = await run(W);
    ok(`${W}px: the calculator mounts with no page error`, r.errors.length === 0, r.errors);
    ok(`${W}px: all six steps open`, r.open.length === 6 && r.open.every(s => s.open), r.open);
    ok(`${W}px: no open step is clipped (shown = content)`, r.open.every(s => s.shown >= s.content - 1),
      r.open.filter(s => s.shown < s.content - 1));
    ok(`${W}px: every closed step is 0px and hidden`, r.closed.every(c => c.h === 0 && c.vis === 'hidden'), r.closed);
    if (W === 360) {
      const tallest = Math.max(...r.open.map(s => s.content));
      ok(`360px: a step here is taller than the old 1800px cap (${tallest}px) — the case that was clipped`, tallest > 1800, r.open);
    }
  }
  // The search glyph, drawn: rim, hollow lens, and a handle that is there.
  {
    const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
    await page.setContent('<!doctype html><html><body><div id="i"></div></body></html>');
    for (const s of scripts.slice(0, 4)) await page.addScriptTag({ content: fs.readFileSync(DIR + s, 'utf8') });
    const px = await page.evaluate(async () => {
      ReactDOM.flushSync(() => ReactDOM.createRoot(document.getElementById('i'))
        .render(React.createElement(window.Icon, { name: 'search', size: 48, color: '#000' })));
      const xml = new XMLSerializer().serializeToString(document.querySelector('#i svg'));
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      await img.decode();
      const c = document.createElement('canvas'); c.width = 48; c.height = 48;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const a = (x, y) => g.getImageData(x, y, 1, 1).data[3];
      return { handle: a(39, 39), lens: a(20, 20), rim: a(20, 6) };   // viewBox ×2
    });
    ok('the search glyph renders its handle, a hollow lens and the rim',
      px.handle > 200 && px.lens === 0 && px.rim > 200, px);
    await page.close();
  }
  const control = await run(360, OLD);
  ok('negative control: with the old 1800px rule back, 360px clips a step',
    control.open.some(s => s.shown < s.content - 1), control.open);
  await browser.close();
}

(async () => {
  console.log('\n── #6 measured in Chromium ──');
  await measureInChromium();
  console.log(`\nWARD REQUESTS 0925: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
