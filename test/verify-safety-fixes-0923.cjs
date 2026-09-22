// verify-safety-fixes-0923.cjs — the fixes for the 2026-09-23 safety review's
// findings (BACKLOG.md § Now / § Next; the review itself is CHANGELOG.md
// 2026-09-23). Every section below FAILS against d08e0fc.
//
// The four fix-first findings:
//   §1  Two "current weights" that never meet. An order's weight went to
//       Daily_Log.weight, a growth measurement to patient.weights[], and
//       nothing joined them: a new order prefilled YESTERDAY's order weight
//       under the hint "= current weight" while a newer weight sat on record,
//       and the growth chart, "Wt now" and the stale-weight alert could not
//       see an order's weight at all.
//   §2  DOL was inferred from weights[0].dol. The array is sorted by DOL, so
//       recording an outborn infant's birth measurement re-dated the whole
//       record — DOL 8 → 4, and with it PMA and every DOL-indexed target.
//   §3  The admit date was unguarded. Blank, future and a Thai BE year were
//       all accepted and pinned DOL at 1; editing a record with no admit date
//       stamped today, taking a DOL 20 record to DOL 1.
//   §4  A sync while a patient modal was open turned the three-way merge
//       against you: `base` was read at SAVE time, so an edit saved after a
//       background poll compared against a NEWER server record.
//
// The clinically-important ones:
//   §5  The Alert centre and the calculator disagreed about GIR (>12 critical
//       vs 12–13 the yellow margin), and the alert bodies printed the stored
//       value unrounded ("GIR 7.206498951781971").
//   §6  Growth velocity fired "critically low" through the physiological
//       postnatal nadir, and went blind past 42 wk PMA.
//   §7  The trend graph drew the LATEST row's target band across the whole
//       history, so a day that was on target read far below it.
//   §8  Quick calc wore the previously-opened infant's identity strip, and its
//       DOL box could not be emptied (14 → backspace → "1" → type 5 → 15).
//   §9  The NPE:AA < 20 hard stop fired on ordinary ramping orders.
//   §10 Server bounds refused legitimate orders (weight < 300 g, GIR > 20,
//       kcal exactly 200) in raw English at the bedside.
//
// §1–§2, §5–§6 and §10 are pure functions and a vm sandbox; §3–§4, §7–§9 mount
// the real components in jsdom (same dev-only deps as the other component
// harnesses — see test/README.md). The jsdom sections render into their own
// `#probe` node: app.jsx mounts the whole app into `#root` on its last line.
//
// ── NEGATIVE CONTROL ───────────────────────────────────────────────────────
// A harness that has never been seen to fail is a harness nobody should
// believe. verify-calc-oracle.cjs carries a NEGATIVE_CONTROL=1 switch for this;
// the equivalent here is to run this file against the commit BEFORE the fixes,
// which is the real thing rather than a simulation of it — every section must
// go red, and go red by reproducing the reported symptom:
//
//   d=$(mktemp -d)
//   git -c core.autocrlf=false archive --format=tar d08e0fc | tar -x -C "$d"
//   cp test/verify-safety-fixes-0923.cjs "$d/test/"
//   cp -r node_modules "$d/node_modules"
//   ( cd "$d" && TZ=Asia/Bangkok node test/verify-safety-fixes-0923.cjs )
//
// Expected there: 38 FAILED (24 passed), every section contributing —
//
//   §1  1   §2  3   §3  1   §3b 6   §4  5   §5  1
//   §6  1   §7  3   §8  2   §9  3   §10 12
//
// and failing for the RIGHT reason, not merely by missing a new export: §2
// returns DOL 5 for an infant nine days old, §3b finds the admit-date field
// pre-stamped with today and lets the save through, §4 finds no merge base sent
// at all, §7 finds one target-band step at one height, §8 finds the DOL box
// snapping back to "1", §10 finds a 250 g weight, GIR 25 and 240 kcal/kg/d all
// refused, in English.
//
// §1, §3, §5 and §6 score only 1 there because they abort on the first missing
// helper (D.weightSeries / admissionDateIssue / girStatus / growthVelocity)
// rather than reaching their later assertions. That is a valid negative control
// — the section is red — but it is a weaker signal than the others, so when
// changing one of those helpers, read the section's assertions rather than
// trusting its count.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(70)}${yes ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(70)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}
async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  try { await fn(); } catch (e) { ok(`(section ran to the end) ${e.message}`, false, e.stack.split('\n').slice(0, 4)); }
}

// ── jsdom + the real modules ──────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="probe"></div></body></html>',
  { url: 'https://localhost/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, {
  window, document: window.document, self: window,
  HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
  getComputedStyle: window.getComputedStyle,
  sessionStorage: window.sessionStorage, localStorage: window.localStorage,
  Event: window.Event, CustomEvent: window.CustomEvent, MouseEvent: window.MouseEvent,
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
global.ReactDOM = ReactDOM; window.ReactDOM = ReactDOM;
window.NEOFEED_CLIENT_ID = 'test-client';
window.NEOFEED_GAS_URL = '';           // GAS off: no network from this harness

const load = (f) => vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
  presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
  filename: f, configFile: false, babelrc: false,
}).code);
vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
['icons.jsx', 'calculator.jsx', 'fenton.jsx', 'registry.jsx', 'log.jsx'].forEach(load);
const appSrc = fs.readFileSync(DIR + 'app.jsx', 'utf8');
load('app.jsx');
const D = window.NEOFEED_DATA;

const TODAY = D.todayLocal();
const ago = (days) => D.addDaysToDateStr(TODAY, -days);

// Its own node: app.jsx's last line mounts the whole <App/> into #root.
const root = ReactDOM.createRoot(document.getElementById('probe'));
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
const render = async (el) => { await act(async () => { root.render(el); }); await flush(); };
const text = () => document.getElementById('probe').textContent;
const click = async (el) => {
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await flush();
};
const setInput = async (el, value) => {
  await act(async () => {
    const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value));
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await flush();
};
const fieldInput = (label, scope) => [...(scope || document.getElementById('probe')).querySelectorAll('.field')]
  .find(f => f.querySelector('label') && f.querySelector('label').textContent.includes(label))
  ?.querySelector('input, select');

(async () => {

  // ══════════════════════════════════════════════════════════════════════
  await section('§2 DOL is anchored on the date of birth, not on weights[0]', async () => {
    // Outborn: born on the 15th, admitted on the 19th at DOL 5. Nine days of
    // life on the 23rd.
    const outborn = {
      ga: 29.0, bw: 1000, dob: '2026-09-15', admissionDate: '2026-09-19',
      weights: [{ dol: 5, w: 1000 }],
    };
    eq('outborn: DOL on 2026-09-23', D.dolAtDate(outborn, '2026-09-23'), 9);
    eq('…PMA', D.pmaShort(outborn.ga, D.dolAtDate(outborn, '2026-09-23')), 30.1);

    // THE DEFECT: the ward records the birth weight from the referring
    // hospital. weights[] is ordered by DOL, so that row becomes weights[0]
    // and used to become the admission anchor.
    const withBirth = { ...outborn, weights: [{ dol: 1, w: 1050 }, { dol: 5, w: 1000 }] };
    eq('recording a birth measurement does not move DOL', D.dolAtDate(withBirth, '2026-09-23'), 9);
    eq('…nor PMA', D.pmaShort(withBirth.ga, D.dolAtDate(withBirth, '2026-09-23')), 30.1);
    // The bands that moved with it: on DOL 4 vs DOL 8 these differ.
    eq('…nor the fluid band', D.TARGETS.fluid(D.dolAtDate(withBirth, '2026-09-23'), 1000),
       D.TARGETS.fluid(9, 1000));
    eq('…nor the Na band', D.TPN_TARGETS.na(D.dolAtDate(withBirth, '2026-09-23')), D.TPN_TARGETS.na(9));

    // A dob later than the admission date is not a birth date — an infant
    // cannot be admitted before it is born. That pair is a legacy record whose
    // dob was defaulted, so the admission anchor wins rather than reporting
    // DOL 1 for an infant ten days in.
    const contradictory = { ga: 27.2, bw: 900, dob: TODAY, admissionDate: ago(10),
      weights: [{ dol: 1, w: 900 }] };
    eq('a dob that postdates admission is not trusted', D.dolAtDate(contradictory, TODAY), 11);

    // No dob at all: the old admissionDate + weights[0].dol path still answers.
    const legacy = { ga: 29.0, bw: 1000, admissionDate: ago(4), weights: [{ dol: 5, w: 1000 }] };
    eq('a record with no dob still has a DOL', D.dolAtDate(legacy, TODAY), 9);
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§3 The admit date is guarded', async () => {
    eq('blank is refused', D.admissionDateIssue('', TODAY)?.code, 'missing');
    eq('a future date is refused', D.admissionDateIssue(D.addDaysToDateStr(TODAY, 3), TODAY)?.code, 'future');
    eq('a Buddhist-era year is named as one', D.admissionDateIssue('2569-09-01', TODAY)?.code, 'buddhistEra');
    ok('…and the message gives the CE year',
       /2026/.test(D.admissionDateIssue('2569-09-01', TODAY).message),
       D.admissionDateIssue('2569-09-01', TODAY).message);
    eq('…and it can be converted', D.toChristianEraDateStr('2569-09-01', TODAY), '2026-09-01');
    eq('a plausible date passes', D.admissionDateIssue(ago(5), TODAY), null);
    ok('the message is in Thai, not raw English',
       /[฀-๿]/.test(D.admissionDateIssue('', TODAY).message));

    // Each bad value used to pin DOL at 1 — the day-1 target bands for an
    // infant of any age.
    for (const [label, bad] of [['blank', ''], ['future', D.addDaysToDateStr(TODAY, 30)], ['BE year', '2569-09-13']]) {
      const p = { ga: 28, bw: 900, dob: bad, admissionDate: bad, weights: [{ dol: 1, w: 900 }] };
      ok(`an implausible date (${label}) is not used as an anchor`,
         D.dolAtDate(p, TODAY) === 1 && D.admissionDateIssue(bad, TODAY) !== null);
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§3b EditPatientModal does not stamp today over a missing date', async () => {
    const patient = {
      sessionId: 'ZZ-BW900', name: 'ZZ', initials: 'ZZ', bw: 900, ga: 27.2, sex: 'boys',
      dob: '', admissionDate: '', twinSuffix: '', status: 'Active', currentBed: 'NICU 4',
      diagnosis: 'RDS', weights: [{ dol: 1, w: 900 }], lengths: [], hcs: [], bedHistory: [],
      statusDate: '', multiplesCount: 0,
    };
    let submitted = null;
    await render(React.createElement(window.EditPatientModal, {
      patient, patients: [patient], onClose: () => {}, onSubmit: (p) => { submitted = p; return { ok: true }; },
    }));
    const probe = document.getElementById('probe');
    const admit = [...probe.querySelectorAll('input[type="date"]')][0];
    eq('the admit date field opens EMPTY, not stamped with today', admit.value, '');
    const saveBtn = [...document.getElementById('probe').querySelectorAll('button')].find(b => /บันทึก|Save/.test(b.textContent));
    ok('…and Save is disabled until a real date is given', saveBtn.disabled, saveBtn && saveBtn.textContent);
    await click(saveBtn);
    eq('…so nothing was submitted', submitted, null);

    // Give it the real date: dob is derived and saved with it, so the DOL
    // anchor moves too.
    await setInput(admit, ago(19));
    const dolField = fieldInput('DOL แรกรับ');
    await setInput(dolField, '2');
    const saveBtn2 = [...document.getElementById('probe').querySelectorAll('button')].find(b => /บันทึก|Save/.test(b.textContent));
    ok('…Save is enabled once the date is plausible', !saveBtn2.disabled);
    await click(saveBtn2);
    ok('the edit was submitted', !!submitted);
    eq('…with the admission date typed', submitted && submitted.admissionDate, ago(19));
    // Admitted 19 days ago at DOL 2 → born 20 days ago.
    eq('…and a dob derived from admit date and DOL แรกรับ', submitted && submitted.dob, ago(20));
    eq('…which puts the record at DOL 21 today', D.dolAtDate(submitted, TODAY), 21);

    // A future date is refused by the modal, not silently saved.
    await setInput([...probe.querySelectorAll('input[type="date"]')][0], D.addDaysToDateStr(TODAY, 5));
    const saveBtn3 = [...document.getElementById('probe').querySelectorAll('button')].find(b => /บันทึก|Save/.test(b.textContent));
    ok('a future admit date disables Save', saveBtn3.disabled);
    ok('…and says why, in Thai', /อนาคต/.test(text()), text().slice(0, 200));
    await render(React.createElement('div'));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§4 The merge base is the one the editor OPENED on', async () => {
    // The record as the server held it when the modal opened.
    const opened = {
      sessionId: 'MB-BW900', name: 'MB', initials: 'MB', bw: 900, ga: 27.2, sex: 'boys',
      dob: ago(10), admissionDate: ago(10), twinSuffix: '', status: 'Active',
      currentBed: 'NICU 5', diagnosis: 'RDS',
      weights: [{ dol: 1, w: 900 }], lengths: [], hcs: [], bedHistory: [],
      statusDate: '', multiplesCount: 0,
    };
    // What a background sync replaces it with while the modal sits open:
    // another device discharged the infant AND saved a new weight.
    const newer = { ...opened, status: 'Discharged', statusDate: TODAY,
      weights: [{ dol: 1, w: 900 }, { dol: 10, w: 1040 }] };

    let live = opened;                       // what mergeBaseFor returns RIGHT NOW
    let sentBase;
    await render(React.createElement(window.EditPatientModal, {
      patient: opened, patients: [opened], onClose: () => {},
      mergeBaseFor: () => live,
      onSubmit: (p, base) => { sentBase = base; return { ok: true }; },
    }));
    // …the sync lands while the modal is open.
    live = newer;
    await setInput(fieldInput('Diagnosis') || fieldInput('วินิจฉัย') ||
      [...document.getElementById('probe').querySelectorAll('input.inp')].find(i => i.value === 'RDS'), 'RDS · PDA');
    await click([...document.getElementById('probe').querySelectorAll('button')].find(b => /บันทึก|Save/.test(b.textContent)));

    ok('a base was sent at all', sentBase !== undefined);
    eq('the base is the record the modal opened on, not the newer one',
       sentBase && sentBase.status, 'Active');
    eq('…and carries the weights as they were at open',
       sentBase && sentBase.weights.length, 1);
    ok('…so the server sees status as UNCHANGED by this edit and keeps its own',
       sentBase && sentBase.status === 'Active');
    ok('…and sees no weight deleted here',
       sentBase && JSON.stringify(sentBase.weights) === JSON.stringify(opened.weights));
    await render(React.createElement('div'));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§1 The two weight stores are read as one', async () => {
    const patient = { sessionId: 'WS-BW900', ga: 28, bw: 900, dob: ago(20), admissionDate: ago(20),
      weights: [{ dol: 1, w: 900 }] };
    // A ward that weighs daily and records it in the order, never on the chart.
    const entries = [17, 18, 19, 20, 21].map((dol, i) => ({
      ts: D.addDaysToDateStr(ago(20), dol - 1), dol, weight: 1000 + i * 15,
      gir: 6, pro: 3, kcal: 110, enVolPerKg: 0,
    }));

    const series = D.weightSeries(patient, entries);
    eq('the series has every day from both stores', series.length, 6);
    eq('…newest first from the log', series[series.length - 1].w, 1060);
    eq('…tagged with where it came from', series[series.length - 1].src, 'order');
    eq('lastWeighed with the log sees the order weight', D.lastWeighed(patient, entries).w, 1060);
    eq('…without it, the old measurements-only answer is unchanged', D.lastWeighed(patient).w, 900);

    // A deliberate measurement outranks an order's working figure on the same day.
    const both = { ...patient, weights: [{ dol: 1, w: 900 }, { dol: 21, w: 1075 }] };
    const merged = D.weightSeries(both, entries);
    eq('a measurement wins over an order on the same DOL', merged[merged.length - 1].w, 1075);
    eq('…and is tagged as measured', merged[merged.length - 1].src, 'measured');

    // THE DEFECT: "Weight measurement >7 days overdue" on an infant weighed
    // in the order every single day.
    const alerts = global.computeAlerts(patient, entries);
    ok('no stale-weight alert when the order carries daily weights',
       !alerts.find(a => a.id === 'weight-stale'),
       alerts.filter(a => a.id === 'weight-stale').map(a => a.title));
    // …and it still fires when nothing has been weighed either way.
    const quiet = D.addDaysToDateStr(ago(20), 0);
    const stale = global.computeAlerts(patient, [{ ts: quiet, dol: 1, weight: 900, gir: 6, pro: 3, kcal: 110 }]);
    ok('…but it still fires when nothing was weighed for a week',
       !!stale.find(a => a.id === 'weight-stale'));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§5 GIR: one grading, and no raw floats in the alert body', async () => {
    eq('12.5 is the yellow margin, not critical', D.girStatus(12.5), 'warn');
    eq('above the hard limit is critical', D.girStatus(13.5), 'crit');
    eq('in band is ok', D.girStatus(10), 'ok');
    eq('the hard limit is the calculator\'s', D.GIR_HARD_HI, 13);
    ok('calculator.jsx grades GIR through it, not its own literal',
       /GIR_HARD = \{ hardHi: D\.GIR_HARD_HI \}/.test(fs.readFileSync(DIR + 'calculator.jsx', 'utf8')));
    ok('app.jsx grades GIR through it too', /D_A\.girStatus\(last\.gir\)/.test(appSrc));

    const patient = { sessionId: 'GR-BW900', ga: 28, bw: 900, dob: ago(10), admissionDate: ago(10),
      weights: [{ dol: 1, w: 900 }, { dol: 10, w: 1000 }] };
    const row = (gir) => [{ ts: TODAY, dol: 11, weight: 1000, gir, pro: 3, kcal: 120, enVolPerKg: 0 }];

    const at125 = global.computeAlerts(patient, row(12.5)).find(a => a.id.startsWith('gir'));
    eq('a logged GIR of 12.5 is a WARNING on the alert page', at125 && at125.level, 'warn');
    const at135 = global.computeAlerts(patient, row(13.5)).find(a => a.id.startsWith('gir'));
    eq('…and 13.5 is critical, on both screens', at135 && at135.level, 'crit');
    ok('a GIR inside the band raises no GIR alert',
       !global.computeAlerts(patient, row(9)).find(a => a.id.startsWith('gir')));

    // THE DEFECT: "Logged GIR 7.206498951781971 mg/kg/min".
    const raw = global.computeAlerts(patient,
      [{ ts: TODAY, dol: 11, weight: 1000, gir: 13.206498951781971, pro: 2.8581644815256255, kcal: 60.80000000000001, enVolPerKg: 0 }]);
    const bodies = raw.map(a => a.body).join(' ');
    ok('no float noise reaches an alert body', !/\d\.\d{5,}/.test(bodies), bodies.slice(0, 220));
    ok('…the GIR reads 13.21', /13\.21/.test(bodies), bodies.slice(0, 220));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§6 Growth velocity knows when NOT to judge', async () => {
    // Physiological weight loss: DOL 1–5, losing, exactly as expected.
    const losing = { ga: 28, bw: 1000, dob: ago(4), admissionDate: ago(4),
      weights: [1000, 960, 930, 915, 910].map((w, i) => ({ dol: i + 1, w })) };
    eq('during the postnatal nadir there is no velocity to grade',
       D.growthVelocity(losing).status, 'physiologicalLoss');
    ok('…and the alert page says so as INFO, not as a critical alarm',
       global.computeAlerts(losing, []).find(a => a.id === 'growth-physiologicalLoss')?.level === 'info');
    ok('…and raises no "critically low" alarm',
       !global.computeAlerts(losing, []).find(a => a.id === 'growth-velocity'));

    // Regained and growing well.
    const growing = { ga: 28, bw: 1000, dob: ago(20), admissionDate: ago(20),
      weights: [{ dol: 1, w: 1000 }, { dol: 8, w: 1000 }, { dol: 14, w: 1120 }, { dol: 21, w: 1260 }] };
    eq('once birth weight is regained it grades again', D.growthVelocity(growing).status, 'ok');
    ok('…and raises no alert', !global.computeAlerts(growing, []).find(a => a.id === 'growth-velocity'));

    // Genuinely poor growth after regain still alarms.
    const poor = { ga: 28, bw: 1000, dob: ago(28), admissionDate: ago(28),
      weights: [{ dol: 1, w: 1000 }, { dol: 10, w: 1010 }, { dol: 20, w: 1020 }, { dol: 29, w: 1030 }] };
    ok('poor growth after regain is still caught',
       ['low', 'critical'].includes(D.growthVelocity(poor).status), D.growthVelocity(poor).status);

    // Past 42 weeks PMA the ≥15 g/kg/d preterm target does not apply and the
    // Fenton reference has stopped.
    const term = { ga: 38.0, bw: 3000, dob: ago(40), admissionDate: ago(40),
      weights: [{ dol: 1, w: 3000 }, { dol: 20, w: 3200 }, { dol: 41, w: 3500 }] };
    ok('past 42 wk PMA it reports rather than grades',
       D.growthVelocity(term).status === 'beyondReference', D.growthVelocity(term));
    eq('the ceiling is the Fenton one', D.PMA_REFERENCE_MAX, 42);
    const termAlert = global.computeAlerts(term, []).find(a => a.id === 'growth-beyondReference');
    eq('…as an informational line', termAlert && termAlert.level, 'info');
    ok('…that names the reason', /42/.test(termAlert.body), termAlert && termAlert.body);

    // The Fenton panel's own velocity readout must not read the clamped array.
    ok('fenton.jsx feeds GrowthVelocity the unclamped points',
       /<GrowthVelocity points=\{allPoints\}/.test(fs.readFileSync(DIR + 'fenton.jsx', 'utf8')));
    ok('…and "latest measurement" too',
       /const latestPoint = allPoints\.length/.test(fs.readFileSync(DIR + 'fenton.jsx', 'utf8')));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§7 The trend graph judges each day against its own band', async () => {
    const patient = { sessionId: 'TR-BW900', ga: 28, bw: 900, dob: ago(20), admissionDate: ago(20),
      weights: [{ dol: 1, w: 900 }] };
    // DOL 2 at 55 kcal/kg/d is ON target for DOL 2; DOL 20 at 120 is on target
    // for DOL 20. One band cannot describe both.
    const entries = [
      { ts: D.addDaysToDateStr(ago(20), 1), dol: 2, weight: 900, kcal: 55, gir: 5, pro: 2, enVolPerKg: 0 },
      { ts: D.addDaysToDateStr(ago(20), 19), dol: 20, weight: 1200, kcal: 120, gir: 9, pro: 3.5, enVolPerKg: 0 },
    ];
    await render(React.createElement(window.TrendGraph, { entries, patient }));
    const rects = [...document.getElementById('probe').querySelectorAll('svg rect')]
      .filter(r => (r.getAttribute('fill') || '').includes('0.12 155'));
    ok('the target band is drawn as more than one step', rects.length >= 2, rects.length);
    const widths = rects.map(r => Math.round(Number(r.getAttribute('width'))));
    ok('…each step is a real width', widths.every(w => w > 0), widths);
    const ys = rects.map(r => Math.round(Number(r.getAttribute('y'))));
    ok('…and the steps sit at different heights, as the target moves',
       new Set(ys).size >= 2, ys);
    ok('log.jsx gives each point the band of its own day',
       /band: pickTarget\(metricKey, e, patient\)/.test(fs.readFileSync(DIR + 'log.jsx', 'utf8')));
    await render(React.createElement('div'));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§8 The quick calculator belongs to nobody', async () => {
    ok('the patient strip is gated on PATIENT_VIEWS, not on "not the registry"',
       /\{PATIENT_VIEWS\.includes\(view\) && active &&\s*\n\s*<PatientStrip/.test(appSrc),
       (appSrc.match(/\{[^\n]*&& active &&\s*\n\s*<PatientStrip/) || [''])[0]);
    ok('…and quickcalc is not a patient view',
       /const PATIENT_VIEWS = \["log", "calculator", "fenton", "alerts"\]/.test(appSrc));

    // The DOL box: 14 → clear → 5 must be 5, not 15.
    await render(React.createElement(global.QuickCalcView, { onBack: () => {} }));
    const dolBox = document.getElementById('probe').querySelector('#quick-dol-input');
    ok('the quick calc has a DOL box', !!dolBox);
    await setInput(dolBox, '14');
    eq('it takes 14', dolBox.value, '14');
    await setInput(dolBox, '');
    eq('…and can be emptied', dolBox.value, '');
    ok('…while the targets hold the last real day', /DOL/.test(text()));
    await setInput(dolBox, '5');
    eq('…so typing 5 gives 5, not 15', dolBox.value, '5');
    await render(React.createElement('div'));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§9 NPE:AA below 20 is a warning, not a save-blocking stop', async () => {
    const calcSrc = fs.readFileSync(DIR + 'calculator.jsx', 'utf8');
    ok('only the high side is a hard limit',
       /hardNPE = ivNpeN !== null && D\.rangeStatus\(ivNpeN, tNPE, \{ hardHi: 32 \}\)/.test(calcSrc));
    ok('…and the low side has its own warning',
       /lowNPE {2}= ivNpeN !== null && !hardNPE && ivNpeN < 20/.test(calcSrc));
    ok('the low-side alert is pushed at level "warn"',
       /if \(lowNPE\) alerts\.push\(\{ level: "warn"/.test(calcSrc));
    ok('…and the critical body no longer claims a < 20 hard limit',
       !/< 20 hard limit/.test(calcSrc));
  });

  // ══════════════════════════════════════════════════════════════════════
  await section('§10 Server bounds accept real orders, and refuse in Thai', async () => {
    const sandbox = {
      SpreadsheetApp: { openById: () => ({ getSheetByName: () => null, insertSheet: () => null }) },
      Utilities: {
        getUuid: () => 'uuid', computeHmacSha256Signature: () => [], base64Encode: () => '',
        formatDate: (d) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10),
      },
      Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'id', setProperty() {} }) },
      CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
      LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
      UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
      ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
      Logger: { log() {} }, console,
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(DIR + 'gas-backend.gs', 'utf8'), sandbox);

    const base = { dol: 5, weight: 1000, fluid: 150, gir: 8, pro: 3, kcal: 110, na: 3, k: 2, ca: 80, p: 50, enVolPerKg: 0 };
    const tryEntry = (over) => {
      try { sandbox._validateLogEntry({ ...base, ...over }); return null; }
      catch (e) { return e.message; }
    };

    // The three refusals of correct orders.
    eq('a 250 g extreme-preterm weight saves', tryEntry({ weight: 250 }), null);
    eq('GIR 25 (hyperinsulinism) saves', tryEntry({ gir: 25 }), null);
    eq('energy of exactly 200 kcal/kg/d saves', tryEntry({ kcal: 200 }), null);
    eq('…and the float that 200 really was', tryEntry({ kcal: 200.00000000000003 }), null);
    eq('energy of 240 on fortified feeds saves', tryEntry({ kcal: 240 }), null);

    // …while nonsense is still refused.
    ok('a 20 g weight is still refused', tryEntry({ weight: 20 }) !== null);
    ok('a 40 kg weight is still refused', tryEntry({ weight: 40000 }) !== null);
    ok('GIR 60 is still refused', tryEntry({ gir: 60 }) !== null);
    ok('900 kcal/kg/d is still refused', tryEntry({ kcal: 900 }) !== null);

    // …and says so in the language the ward reads.
    const msg = tryEntry({ gir: 60 });
    ok('the refusal is in Thai', /[฀-๿]/.test(msg), msg);
    ok('…and still names the field and the range', /GIR/.test(msg) && /0–30/.test(msg), msg);

    // The dates are checked server-side too, with the legacy tolerance
    // _checkSex established: a value carried through unchanged is not refused.
    const tryDate = (val, stored) => {
      try { sandbox._checkAdmissionDate(val, stored === undefined ? null : stored, 'Admit date'); return null; }
      catch (e) { return e.message; }
    };
    eq('a plausible admit date passes', tryDate(ago(5)), null);
    eq('blank passes (a legacy row may have none)', tryDate(''), null);
    ok('a Buddhist-era year is refused', tryDate('2569-09-01') !== null);
    ok('…in Thai', /[฀-๿]/.test(tryDate('2569-09-01')));
    ok('a far-future date is refused', tryDate(D.addDaysToDateStr(TODAY, 40)) !== null);
    eq('…but today is never refused for clock skew', tryDate(TODAY), null);
    eq('…nor is tomorrow, for the same reason', tryDate(D.addDaysToDateStr(TODAY, 1)), null);
    eq('an UNCHANGED stored bad date does not lock the record',
       tryDate('2569-09-01', '2569-09-01'), null);
    ok('…but changing it to another bad one is refused',
       tryDate('2570-09-01', '2569-09-01') !== null);
  });

  console.log(`\nSAFETY FIXES 2026-09-23: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})();
