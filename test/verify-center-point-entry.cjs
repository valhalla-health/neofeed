// The Center Point entry to <Calculator> (PR #57 review, 2026-09-15).
//
// Center Point mounts this same <Calculator> with a `centerPoint` bridge in
// place of onLog/onUpdate. Five things that entry must hold to, each found
// broken in review:
//
//   §1 No clinical value reaches browser storage. The F3 draft autosave and
//      the draft read both ran on the CP screen, so a full TPN order sat in
//      localStorage for up to 72 hours on a shared workstation (finding 1).
//   §2 After a CP save the form reads as saved, not "unsaved changes".
//   §3 Step 1 still gates the save, but the Intake / Output card does not
//      exist on the CP screen: none of its three values go to CP, so
//      requiring them only taught staff to type 0 (finding 4).
//   §4 The critical-value reason the prompt promises to print is handed to
//      CP with the order, and the CP snapshot carries it to CP's print
//      (finding 3).
//   §5 Neither NeoFeed host publishes center-point/ (finding 5).
//   §6 A tripwire on center-point/tpn-document.mjs, which CP keeps a copy of.
//
// Same jsdom harness as verify-required-log-fields.cjs.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { pathToFileURL } = require('url');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const yes = Object.is(got, want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  yes ? pass++ : fail++;
}
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(64)}${cond ? '' : '  ' + JSON.stringify(detail)}`);
  cond ? pass++ : fail++;
}

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
// calculator.jsx says bare `localStorage`; without this it is Node's own global.
global.localStorage = window.localStorage;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
const toasts = [];
window.showToast = (msg, kind) => toasts.push({ msg, kind });

vm.runInThisContext(fs.readFileSync(DIR + 'data.js', 'utf8'));
for (const f of ['icons.jsx', 'calculator.jsx']) {
  vm.runInThisContext(babel.transformSync(fs.readFileSync(DIR + f, 'utf8'), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const inputFor = (label) => [...container.querySelectorAll('.field')]
  .find((d) => d.querySelector('label')?.textContent.startsWith(label))?.querySelector('input') || null;
function setField(label, value) {
  const input = inputFor(label);
  if (!input) throw new Error('field not found: ' + label);
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const click = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const saveButton = () => [...container.querySelectorAll('button')]
  .find(b => b.textContent.trim() === 'บันทึก' || /กำลังบันทึก/.test(b.textContent));
const missingText = () => [...container.querySelectorAll('div')]
  .map(d => d.textContent).filter(t => /^ยังกรอกไม่ครบ/.test(t)).pop() || '';
const cardTitles = () => [...container.querySelectorAll('.card-h')].map(h => h.textContent.trim());
const storageKeys = () => Object.keys(window.localStorage);

// A CP link's local id is a UUID, never NeoFeed's initials+BW session id.
const patient = { sessionId: '6f1c2f4e-2b7a-4c1e-9d55-0c8f0e6b1a11', bw: 1200, ga: 28, weights: [] };
const ORDER_DATE = '2026-09-15';
let saved = [];
const centerPoint = {
  save(p) { saved.push(p); return Promise.resolve({ sourceRecordId: patient.sessionId, recordedAt: '2026-09-15T08:00:00.000Z' }); },
  review() {}, failed() {},
};
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  act(() => {
    root.render(React.createElement(window.Calculator, {
      patient, dol: 3, logDate: ORDER_DATE, ...props,
    }));
  });
  act(() => {
    container.querySelectorAll('.card-h.clickable').forEach((h) =>
      h.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  });
}

(async () => {
  // ── §0 control: the legacy screen DOES autosave ──────────────────────────
  // Without this, §1 could pass against a harness in which autosave never runs.
  console.log('\n── §0 control: the legacy entry autosaves a draft ──');
  window.localStorage.clear();
  mount({ onLog() { return Promise.resolve({ ok: true, entryId: 'e-1', lastModified: 'lm-1' }); }, onUpdate() {}, onSaved() {} });
  setField('Volume(mL/day)', 100);
  ok('an edit on the legacy screen writes a neofeed_draft_ key',
    storageKeys().some(k => k.startsWith('neofeed_draft_')), storageKeys());

  // ── §1 no clinical value in browser storage ──────────────────────────────
  console.log('\n── §1 the CP entry keeps browser storage empty ──');
  window.localStorage.clear();
  saved = [];
  mount({ centerPoint });
  setField('Volume(mL/day)', 100);
  setField('Dextrose final', 10);
  setField('Other IV', 0);
  setField('Drug volume', 0);
  eq('after edits, localStorage is empty', window.localStorage.length, 0);
  window.prompt = () => 'synthetic attending aware';
  await click(saveButton());
  eq('the order reached Center Point', saved.length, 1);
  eq('after a save, localStorage is still empty', window.localStorage.length, 0);
  setField('Dextrose final', 11);
  eq('after an edit following the save, still empty', window.localStorage.length, 0);

  // A draft left by the legacy screen on the same workstation (or planted) must
  // not be read into a CP order, nor offered back.
  window.localStorage.clear();
  const draftKey = `neofeed_draft_${patient.sessionId}_${ORDER_DATE}`;
  window.localStorage.setItem(draftKey, JSON.stringify({ totalTPN_mL: 999, dexPct: 25, savedAt: new Date().toISOString() }));
  window.localStorage.setItem(`neofeed_calc_${patient.sessionId}`, JSON.stringify({ totalTPN_mL: 888, savedAt: new Date().toISOString() }));
  const getItem = window.Storage.prototype.getItem;
  const reads = [];
  window.Storage.prototype.getItem = function (k) { reads.push(k); return getItem.call(this, k); };
  mount({ centerPoint });
  window.Storage.prototype.getItem = getItem;
  eq('the CP entry reads nothing from localStorage', reads.length, 0);
  ok('…offers no "unsaved draft" banner', !/มีข้อมูลที่กรอกค้างไว้/.test(container.textContent));
  ok('…and does not prefill from it', inputFor('Volume(mL/day)')?.value !== '999' && inputFor('Volume(mL/day)')?.value !== '888',
    inputFor('Volume(mL/day)')?.value);
  window.localStorage.clear();

  // ── §2 a CP save reads as saved ──────────────────────────────────────────
  console.log('\n── §2 after a CP save the form is not "unsaved" ──');
  saved = [];
  mount({ centerPoint });
  setField('Volume(mL/day)', 100);
  setField('Dextrose final', 10);
  setField('Other IV', 0);
  setField('Drug volume', 0);
  await click(saveButton());
  eq('saved once', saved.length, 1);
  ok('no "unsaved changes" line after the save', !/มีการแก้ไขที่ยังไม่ได้บันทึก/.test(container.textContent));
  setField('Dextrose final', 11);
  ok('an edit after the save shows it again', /มีการแก้ไขที่ยังไม่ได้บันทึก/.test(container.textContent));
  // Copy would put order text on the clipboard outside CP's reviewed revision.
  mount({ centerPoint });
  const copyBtn = [...container.querySelectorAll('button')].find(b => /Copy Order/.test(b.textContent));
  ok('the CP entry has no Copy Order button', !copyBtn, copyBtn && copyBtn.textContent);

  // ── §3 required fields on the CP screen ──────────────────────────────────
  console.log('\n── §3 Step 1 gates a CP save; the Intake / Output card is not there ──');
  saved = [];
  mount({ centerPoint });
  ok('no Intake / Output card on the CP screen', !cardTitles().some(t => /Intake \/ Output/.test(t)), cardTitles());
  ok('…and none of its three fields', !inputFor('Input') && !inputFor('Urine output') && !inputFor('Drain content'));
  ok('Save is disabled on an untouched CP form', saveButton()?.disabled === true, missingText());
  ok('…naming the Step 1 fields', /Other IV/.test(missingText()) && /Drug volume/.test(missingText()), missingText());
  ok('…and not the Intake / Output ones', !/Urine output|Drain content|\bInput\b/.test(missingText()), missingText());
  ok('…nor telling the user to fill a card that is not there', !/Intake \/ Output/.test(missingText()), missingText());
  setField('Other IV', 0);
  setField('Drug volume', 0);
  eq('Step 1 filled → nothing missing', missingText(), '');
  ok('…and Save is enabled', saveButton()?.disabled === false);

  // The legacy screen is unchanged: the card and its three fields still gate.
  mount({ onLog() { return Promise.resolve({ ok: true, entryId: 'e-2', lastModified: 'lm-2' }); }, onUpdate() {}, onSaved() {} });
  ok('the legacy screen still has the Intake / Output card', cardTitles().some(t => /Intake \/ Output/.test(t)), cardTitles());
  setField('Other IV', 0);
  setField('Drug volume', 0);
  ok('…and still requires Urine output', /Urine output/.test(missingText()), missingText());

  // ── §4 the critical-value reason travels with the CP order ───────────────
  console.log('\n── §4 the critical-value reason reaches Center Point ──');
  saved = [];
  mount({ centerPoint });
  setField('Other IV', 0);
  setField('Drug volume', 0);
  setField('Volume(mL/day)', 300);
  setField('Dextrose final', 25);
  let promptText = '';
  window.prompt = (text) => { promptText = text; return 'synthetic — attending aware'; };
  await click(saveButton());
  eq('saved once', saved.length, 1);
  ok('the prompt still says the reason is printed on the TPN order', /พิมพ์ลงใบสั่ง TPN/.test(promptText), promptText);
  ok('…and asks for no name or HN (CP keeps identity out of the packet)', /ชื่อ|HN/.test(promptText), promptText);
  const override = saved[0]?.critOverride;
  eq('the reason is handed to Center Point', override && override.reason, 'synthetic — attending aware');
  ok('…with the alerts it overrode', !!override && override.alerts.some(a => /Dextrose over KCMH max/.test(a)), override);

  saved = [];
  mount({ centerPoint });
  setField('Other IV', 0);
  setField('Drug volume', 0);
  setField('Volume(mL/day)', 100);
  setField('Dextrose final', 10);
  window.prompt = () => { throw new Error('no critical value — the prompt must not open'); };
  await click(saveButton());
  eq('an order with no critical value hands CP no override', saved[0] && saved[0].critOverride, null);

  // The snapshot builder and CP's renderer (center-point/*.mjs) carry it on.
  const { buildTpn } = await import(pathToFileURL(DIR + 'center-point/tpn-snapshot.mjs').href);
  const { renderTpn, validateTpn } = await import(pathToFileURL(DIR + 'center-point/tpn-document.mjs').href);
  const from = '2026-09-15T01:00:00.000Z', to = '2026-09-16T01:00:00.000Z';
  saved = [];
  mount({ centerPoint });
  setField('Other IV', 0);
  setField('Drug volume', 0);
  setField('Volume(mL/day)', 300);
  setField('Dextrose final', 25);
  window.prompt = () => 'synthetic — attending aware';
  await click(saveButton());
  if (!saved[0]) throw new Error('§4: the critical order never reached Center Point, so there is no snapshot to check');
  const tpn = buildTpn(saved[0], window.NEOFEED_DATA, from, to);
  eq('the snapshot carries the reason', tpn.criticalOverride && tpn.criticalOverride.reason, 'synthetic — attending aware');
  ok('…and the alert titles', !!tpn.criticalOverride && tpn.criticalOverride.alerts.some(a => /Dextrose over KCMH max/.test(a)), tpn.criticalOverride);
  const sheet = document.createElement('div');
  renderTpn(sheet, tpn);
  ok('CP\'s rendered order shows the reason', /synthetic — attending aware/.test(sheet.textContent), sheet.textContent.slice(0, 200));
  ok('…under the critical-value heading', /สั่งทั้งที่มีค่าวิกฤต/.test(sheet.textContent));
  ok('…as text, never markup', sheet.querySelectorAll('script').length === 0);
  const plain = buildTpn({ ...saved[0], critOverride: null }, window.NEOFEED_DATA, from, to);
  eq('no override → criticalOverride is null', plain.criticalOverride, null);
  const sheet2 = document.createElement('div');
  renderTpn(sheet2, plain);
  ok('…and no critical-value heading is rendered', !/สั่งทั้งที่มีค่าวิกฤต/.test(sheet2.textContent));
  // A reason is clinical free text ("K > 3.5, treated"), so < and > are allowed;
  // it is only ever rendered as text.
  const marked = document.createElement('div');
  renderTpn(marked, { ...tpn, criticalOverride: { reason: 'K > 3.5 <img src=x onerror=alert(1)>', alerts: ['x'] } });
  ok('a reason containing markup renders as literal text', /K > 3\.5 <img src=x/.test(marked.textContent) && !marked.querySelector('img'));
  for (const [what, bad] of [
    ['an empty reason', { reason: '   ', alerts: ['x'] }],
    ['a reason over 300 characters', { reason: 'x'.repeat(301), alerts: ['x'] }],
    ['a control character in the reason', { reason: 'ok\u0000', alerts: ['x'] }],
    ['no alerts', { reason: 'ok', alerts: [] }],
    ['a non-string alert', { reason: 'ok', alerts: [7] }],
    ['an extra key', { reason: 'ok', alerts: ['x'], name: 'PRIVATE' }],
  ]) {
    let threw = false;
    try { validateTpn({ ...tpn, criticalOverride: bad }); } catch { threw = true; }
    ok(`validateTpn rejects ${what}`, threw);
  }
  {
    let threw = false;
    try { validateTpn({ ...tpn, criticalOverride: { reason: 'half ' + String.fromCharCode(0xD83D), alerts: ['x'] } }); } catch { threw = true; }
    ok('validateTpn rejects a lone surrogate (broken text)', threw);
  }

  // Any reason NeoFeed's prompt accepts must survive CP's validator (re-review
  // finding 1). handleSave trims and then cuts at 300 UTF-16 units, so the cut
  // can end on a space or split an emoji, and a pasted tab is kept. Each case
  // goes through the real prompt → save → buildTpn path.
  console.log('\n── §4b a reason NeoFeed accepts is never refused by CP ──');
  const TAB = String.fromCharCode(9), EMOJI = String.fromCodePoint(0x1F600);
  for (const [what, typed, check] of [
    ['a long Thai reason whose 300th character is a space', 'ก'.repeat(299) + ' ' + 'ข'.repeat(20),
      r => r.length <= 300 && r === r.trim()],
    ['a tab pasted into the reason', 'K high' + TAB + 'attending aware',
      r => r === 'K high attending aware'],
    ['an emoji cut in half at character 300', 'x'.repeat(299) + EMOJI + ' tail',
      r => r.length <= 300 && r.isWellFormed()],
  ]) {
    saved = [];
    mount({ centerPoint });
    setField('Other IV', 0);
    setField('Drug volume', 0);
    setField('Volume(mL/day)', 300);
    setField('Dextrose final', 25);
    window.prompt = () => typed;
    await click(saveButton());
    let built = null, error = null;
    try { built = buildTpn(saved[0], window.NEOFEED_DATA, from, to); } catch (e) { error = e.message; }
    ok(`CP accepts ${what}`, !!built, error);
    ok('…and the stored reason is clean', !!built && check(built.criticalOverride.reason), built && built.criticalOverride.reason.slice(-12));
  }

  // ── §6 tripwire: CP holds a copy of center-point/tpn-document.mjs ────────
  // CP validates and prints with its own copy (web/tpn-document.mjs), checked in
  // CP's CI against the NeoFeed commit recorded in CP's test/neofeed-commit. An
  // edit here passes both CIs until someone re-pins, so a changed unit label
  // would print wrongly on CP (PR #57 third review, finding 4). This fails on
  // any change to the file, on purpose. After changing it: sync CP's
  // web/tpn-document.mjs, point CP's test/neofeed-commit at the new NeoFeed
  // commit, then record the new digest below.
  console.log('\n── §6 center-point/tpn-document.mjs matches the version CP was synced to ──');
  const TPN_DOCUMENT_SHA256 = 'bcedde10311d5e82baef3e77cba452b69e233ffda980954220bf0a05360da504';
  const digest = require('crypto').createHash('sha256')
    .update(fs.readFileSync(DIR + 'center-point/tpn-document.mjs', 'utf8').replace(/\r\n/g, '\n')).digest('hex');
  ok('tpn-document.mjs is the version CP is synced to (else: sync CP, re-pin, update this digest)', digest === TPN_DOCUMENT_SHA256, digest);

  // ── §5 NeoFeed's own hosts never serve the CP entry ──────────────────────
  // A main → release merge deploys the working tree to Cloudflare and GitHub
  // Pages. Without these lines center-point/ (synthetic test pages, a second
  // copy of the calculator) would be live on the clinical domain (finding 5).
  console.log('\n── §5 center-point/ is excluded from both NeoFeed hosts ──');
  const lines = (f) => fs.readFileSync(DIR + f, 'utf8').split(/\r?\n/).map(l => l.trim());
  ok('.assetsignore (Cloudflare) lists center-point/', lines('.assetsignore').includes('center-point/'));
  ok('_config.yml (GitHub Pages) excludes center-point/', lines('_config.yml').includes('- center-point/'));

  act(() => { root.unmount(); });
  console.log(`\n${fail === 0 ? 'CENTER POINT ENTRY: ALL PASS' : `CENTER POINT ENTRY: ${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
