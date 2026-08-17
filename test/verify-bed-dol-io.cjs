// Regression checks for three bedside-reported defects (2026-08-17):
//
//   1. A patient in NICU bed 1 displayed as "NICU 1-1" — the registry modals
//      defaulted the bed field to a literal that was not in BED_OPTIONS.
//   2. A Daily_Log row's DOL disagreed with its own date, because the stored
//      `dol` column is a snapshot taken when the row was written and goes
//      stale the moment the admission date is set or corrected.
//   3. The Calculator's Intake / Output "Input" figure came back empty when a
//      saved entry was reopened, and re-saving then wrote that 0 over it.
//
// Sections 1-2 are pure-function checks against data.js. Section 3 drives the
// REAL <Calculator> in jsdom, same harness as verify-kcmh-factor.cjs, because
// the defect was an effect-ordering race that only exists once mounted.
const fs = require('fs');
const vm = require('vm');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = Object.is(got, want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
function ok(name, cond) { eq(name, !!cond, true); }

// ── boot the app modules in a jsdom window ────────────────────────────────
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

vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
for (const f of ['icons.jsx', 'calculator.jsx', 'registry.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}
const D = window.NEOFEED_DATA;

// ══ 1. Bed labels ════════════════════════════════════════════════════════
// NICU/SCN beds are flat numbers; only iso rooms are genuinely two-part.
console.log('\n── #1 bed label normalization ──');
eq('reported case: NICU 1-1 → NICU 1',      D.normalizeBed('NICU 1-1'), 'NICU 1');
eq('legacy hyphen: NICU-3 → NICU 3',        D.normalizeBed('NICU-3'),   'NICU 3');
eq('SCN 2-1 → SCN 2',                       D.normalizeBed('SCN 2-1'),  'SCN 2');
eq('already canonical is untouched',        D.normalizeBed('NICU 12'),  'NICU 12');
eq('iso keeps its room-bed pair',           D.normalizeBed('iso 3-2'),  'iso 3-2');
eq('casing + whitespace collapse',          D.normalizeBed('  nicu   4 '), 'NICU 4');
eq('unknown free-text bed left alone',      D.normalizeBed('9B2'),      '9B2');
eq('blank stays blank',                     D.normalizeBed(''),         '');
eq('null-safe',                             D.normalizeBed(null),       '');
// Every normalized form must be a bed the registry dropdown actually offers,
// otherwise the <select> renders blank again — the original defect.
const BED_OPTIONS = [
  ...Array.from({ length: 12 }, (_, i) => `NICU ${i + 1}`),
  'iso 1-1', 'iso 1-2', 'iso 2-1', 'iso 2-2',
  'iso 3-1', 'iso 3-2', 'iso 3-3', 'iso 3-4',
  ...Array.from({ length: 10 }, (_, i) => `SCN ${i + 1}`),
];
eq('normalized value exists in BED_OPTIONS', BED_OPTIONS.includes(D.normalizeBed('NICU 1-1')), true);
eq('mock fixtures use canonical beds',
  D.MOCK_PATIENTS.every(p => BED_OPTIONS.includes(p.currentBed)), true);

// Structural: every place a bed can be SET must go through the one picker,
// so "a bed is one of BED_OPTIONS" holds by construction rather than by
// three modals happening to agree. A raw <select> over BED_OPTIONS is what
// let the bogus default through unnoticed, so none may remain outside
// BedSelect's own body, and no modal may seed its bed state with a literal.
const registrySrc = fs.readFileSync(DIR + 'registry.jsx', 'utf8');
const bedSelectBody = registrySrc.slice(
  registrySrc.indexOf('function BedSelect'),
  registrySrc.indexOf('function NewPatientModal'));
const rawSelects = (registrySrc.match(/BED_OPTIONS\.map/g) || []).length;
const rawSelectsInPicker = (bedSelectBody.match(/BED_OPTIONS\.map/g) || []).length;
eq('BedSelect exists',                       /function BedSelect\(/.test(registrySrc), true);
eq('BED_OPTIONS is rendered in one place',   rawSelects, 1);
eq('…and that place is BedSelect',           rawSelectsInPicker, 1);
eq('all three modals use the picker',
  (registrySrc.match(/<BedSelect\b/g) || []).length, 3);
eq('no modal seeds bed state with a literal',
  /const \[bed, setBed\][^\n]*useState\(\s*"(?!NICU 1")/.test(registrySrc), false);
eq('no bed state defaults to NICU 1-1',
  /useState\(\s*"NICU 1-1"/.test(registrySrc), false);
// EditPatientModal must NOT coerce a bedless patient onto a default bed —
// that turns "edit the diagnosis" into a silent admission to that bed.
eq('edit modal keeps an unrecorded bed empty',
  /useState\(D_R\.normalizeBed\(patient\.currentBed\)\s*\)/.test(registrySrc), true);

// ── 1b. The picker itself, rendered ───────────────────────────────────────
// The grep checks above prove every modal routes through BedSelect; these
// prove BedSelect does the right thing with each kind of stored value.
console.log('\n── #1b BedSelect rendered ──');
const bedHost = document.createElement('div');
document.body.appendChild(bedHost);
const bedRoot = ReactDOM.createRoot(bedHost);
function renderBed(props) {
  act(() => { bedRoot.render(React.createElement(globalThis.BedSelect, { onChange() {}, ...props })); });
  const sel = bedHost.querySelector('select');
  return {
    value: sel.value,
    options: [...sel.options].map(o => o.value),
    labels: [...sel.options].map(o => o.textContent),
  };
}
// Every canonical bed is offered, and nothing outside BED_OPTIONS is.
const canonical = renderBed({ value: 'NICU 3' });
eq('canonical value selects itself',       canonical.value, 'NICU 3');
eq('offers exactly the 30 defined beds',   canonical.options.length, BED_OPTIONS.length);
eq('options are exactly BED_OPTIONS',
  canonical.options.join('|'), BED_OPTIONS.join('|'));
// A legacy record normalizes onto a real option rather than rendering blank.
const legacy = renderBed({ value: 'NICU 1-1' });
eq('legacy NICU 1-1 lands on NICU 1',      legacy.value, 'NICU 1');
eq('…without adding an option',            legacy.options.length, BED_OPTIONS.length);
// A free-text bed stays visible and flagged — never silently blank, and
// never something a user can newly pick from the list.
const freeText = renderBed({ value: '9B2' });
eq('free-text bed stays selected',         freeText.value, '9B2');
eq('…carried as one extra option',         freeText.options.length, BED_OPTIONS.length + 1);
ok('…and is labelled as off-list',         freeText.labels.some(l => l.includes('ไม่อยู่ในรายการเตียง')));
// A patient with no bed recorded stays unassigned — no silent admission.
const none = renderBed({ value: '' });
eq('blank bed stays blank',                none.value, '');
ok('…offering an explicit unassigned choice', none.labels.some(l => l.includes('ยังไม่ระบุเตียง')));
eq('unassigned choice submits empty',      none.options[0], '');
// allowUnassigned exposes that choice even when a bed IS set (so a bed can
// be cleared), and is off by default for the transfer flow.
ok('allowUnassigned offers it alongside a set bed',
  renderBed({ value: 'NICU 3', allowUnassigned: true }).options.includes(''));
ok('transfer picker does not offer unassigned',
  !renderBed({ value: 'NICU 3' }).options.includes(''));

// ══ 2. DOL derived from the row's date, not the stored column ════════════
// The reported patient: admitted 2026-08-01 at DOL 1. Rows dated 08-09 and
// 08-11 carried a stored dol of 1 and 3 (written before the admission date
// existed), so the log showed "DOL 1" nine days into the admission.
console.log('\n── #2 log-entry DOL re-derived from date ──');
const fo = {
  sessionId: 'FO-1', bw: 2025, ga: 33.1,
  admissionDate: '2026-08-01',
  weights: [{ dol: 1, w: 2025 }],
};
eq('admit day is DOL 1',            D.entryDol(fo, { ts: '2026-08-01', dol: 1 }),  1);
eq('stale dol 1 on 08-09 → DOL 9',  D.entryDol(fo, { ts: '2026-08-09', dol: 1 }),  9);
eq('stale dol 3 on 08-11 → DOL 11', D.entryDol(fo, { ts: '2026-08-11', dol: 3 }), 11);
eq('correct rows are unchanged',    D.entryDol(fo, { ts: '2026-08-12', dol: 12 }), 12);
eq('agrees with dolAtDate',
  D.entryDol(fo, { ts: '2026-08-15', dol: 99 }), D.dolAtDate(fo, '2026-08-15'));
eq('day-of-admission = DOL − admitDol',
  D.entryDol(fo, { ts: '2026-08-15', dol: 15 }) - fo.weights[0].dol, 14);
// Fallbacks: nothing to re-derive from → the stored column is all there is.
eq('no admission date → stored dol', D.entryDol({ weights: [] }, { ts: '2026-08-09', dol: 4 }), 4);
eq('no ts → stored dol',             D.entryDol(fo, { dol: 7 }), 7);
eq('no entry at all → 1',            D.entryDol(fo, null), 1);
// A patient admitted at DOL 5 (transferred in) keeps that offset.
const late = { admissionDate: '2026-08-01', weights: [{ dol: 5, w: 1000 }] };
eq('admit-at-DOL-5 offset preserved', D.entryDol(late, { ts: '2026-08-04', dol: 1 }), 8);

// ══ 3. Intake / Output survives a reopen ═════════════════════════════════
console.log('\n── #3 Intake/Output restored when an entry is reopened ──');
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);

function ioFields() {
  const out = {};
  for (const f of container.querySelectorAll('.field')) {
    const label = f.querySelector('label')?.textContent || '';
    if (/^Input/.test(label))        out.input  = f.querySelector('input').value;
    if (/^Urine output/.test(label)) out.urine  = f.querySelector('input').value;
    if (/^Drain content/.test(label))out.drain  = f.querySelector('input').value;
  }
  return out;
}

const patient = {
  sessionId: 'FO-1', name: 'Fo', bw: 2025, ga: 33.1, currentBed: 'NICU 11',
  diagnosis: 'RDS', admissionDate: '2026-08-01',
  weights: [{ dol: 1, w: 2025 }, { dol: 15, w: 1930 }],
};
// A saved row as getActivePatients() hands it back: the dedicated AC-AE
// columns alongside the raw wizard state in calcInput.
const savedEntry = {
  entryId: 'e-1', ts: '2026-08-15', dol: 15, weight: 1930, lastModified: 'x',
  ioInput: 214, ioOutput: 143, drainContent: 12,
  calcInput: {
    wtG: 1930, fluidTargetPerKg: 118, otherIV_mL: 0, drug_mL: 9,
    ioInput: 214, ioOutput: 143, drainContent: 12,
    totalTPN_mL: 200, dexPct: 10, aaPerKg: 3,
  },
};

let logged = null;
act(() => {
  root.render(React.createElement(window.Calculator, {
    patient, dol: 15, editEntry: savedEntry, baselineEntry: null, logDate: null,
    onLog() {}, onUpdate(id, lm, entry) { logged = entry; return Promise.resolve({ ok: true, lastModified: 'y' }); },
    onSaved() {}, onWeightChange() {},
  }));
});

const shown = ioFields();
eq('Input restored (was silently cleared)', shown.input, '214');
eq('Urine output restored',                 shown.urine, '143');
eq('Drain content restored',                shown.drain, '12');

// …and an untouched re-save must write the same figures back, not zeros.
act(() => {
  [...container.querySelectorAll('button')]
    .find(b => /บันทึก|Save/i.test(b.textContent))
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
});
eq('re-save preserves ioInput',      logged && logged.ioInput,      214);
eq('re-save preserves ioOutput',     logged && logged.ioOutput,     143);
eq('re-save preserves drainContent', logged && logged.drainContent, 12);
eq('re-save stamps date-derived DOL', logged && logged.dol,         15);

// An entry whose calcInput predates the Intake/Output card still restores
// from the dedicated columns rather than showing an empty card.
const legacyEntry = {
  entryId: 'e-2', ts: '2026-08-12', dol: 12, weight: 2025, lastModified: 'x',
  ioInput: 180, ioOutput: 120, drainContent: 0,
  calcInput: { wtG: 2025, fluidTargetPerKg: 116, totalTPN_mL: 190, dexPct: 10 },
};
act(() => {
  root.render(React.createElement(window.Calculator, {
    patient, dol: 12, editEntry: legacyEntry, baselineEntry: null, logDate: null,
    onLog() {}, onUpdate() { return Promise.resolve({ ok: true }); },
    onSaved() {}, onWeightChange() {},
  }));
});
const legacyShown = ioFields();
eq('legacy calcInput falls back to columns', legacyShown.input, '180');
eq('legacy urine from column',               legacyShown.urine, '120');

// A brand-new entry must still track the live prescribed-fluid total for
// Input until the user edits that field — the fix above pins the auto-sync
// to a ref, so verify it did not pin it permanently "touched".
act(() => {
  root.render(React.createElement(window.Calculator, {
    patient, dol: 16, editEntry: null, baselineEntry: null, logDate: '2026-08-16',
    onLog() { return Promise.resolve({ ok: true }); }, onUpdate() {},
    onSaved() {}, onWeightChange() {},
  }));
});
eq('new entry starts with nothing prescribed', ioFields().input, '');

// prescribedFluid = TPN + lipid + other IV + drug volume + counted EN.
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
function setField(labelText, value) {
  const field = [...container.querySelectorAll('.field')]
    .find(d => d.querySelector('label')?.textContent.startsWith(labelText));
  if (!field) throw new Error('field not found: ' + labelText);
  const input = field.querySelector('input');
  act(() => {
    valueSetter.call(input, String(value));
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
setField('Other IV', 60);
eq('new entry: Input tracks prescribed fluid', ioFields().input, '60');
setField('Drug volume', 9);
eq('…and keeps tracking as the plan changes', ioFields().input, '69');
// Once the nurse types a measured Input, it stops re-syncing.
setField('Input', 214);
setField('Other IV', 80);
eq('edited Input is sticky',                   ioFields().input, '214');

console.log(`\n${fail === 0 ? 'BED + DOL + I/O: ALL PASS' : `BED + DOL + I/O: ${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
