// verify-clinical-rules.cjs — every rule in the neofeed-clinical-rules skill holds (NF-04).
//
// The skill (.claude/skills/neofeed-clinical-rules/SKILL.md) is Pp's list of
// every limit, unit and rounding rule the calculator enforces. Each rule has a
// ```rule block of JSON lines: the first line is the rule itself, every other
// line is a synthetic case. This harness reads that file and nothing else for
// its expectations, so Pp adds a test by adding a line there.
//
//   rule line  {"rule": "CR-…", "kind": …, "coded": {…}, "where": […]}
//     coded    each key is a path in window.NEOFEED_DATA (data.js), each value
//              what the skill says it is; the two must be equal
//     where    {file, line, has}: `has` must be in `file`. A `line` that no
//              longer holds `has` is reported as moved, not failed; run with
//              --fix-lines to rewrite the numbers in the skill
//   case line  {"case": …, "side": "inside" | "outside", …}
//     fn       a data.js function, called with `args` (or a value, read as is);
//              the result must equal `want`, or lie `within` that much of it
//     otherwise an order typed into the real <Calculator>:
//       infant {g, bw?, dol?, bed?} · route "Central" | "Peripheral" (none if
//       left out) · fluid (target, default 150) · feed (an EN_DB key) ·
//       order {on-screen field label: value, typed in that order} ·
//       tick {checkbox label: true | false} · hours (lipid infused over)
//     expect   alert / no_alert: an alert title (or a list) on the Calculator,
//              with `level` crit | warn | info for `alert`;
//              submit: "blocked" (Submit disabled), "asks_reason" (Submit asks
//              for a reason naming the alert) or "no_reason" (saves without asking);
//              shows / hides: text on the Calculator (or not) ·
//              prints: text on the order form once the order is saved
//
// Limit rules (stop, critical, red, caution, cap, target) need at least one
// inside and one outside case.
//
//   node test/verify-clinical-rules.cjs                 every rule
//   node test/verify-clinical-rules.cjs --show CR-GIR-MAX   what each case produced
//   node test/verify-clinical-rules.cjs --fix-lines     rewrite moved line numbers
//
// NEGATIVE_CONTROL proves the harness bites; each must FAIL:
//   1  data.js GIR_HARD_HI 12 → 13
//   2  calculator.jsx peripheral osmolarity graded "> 900" instead of ">= 900"
//
// Mounts the real <Calculator> in jsdom: the deps in test/README.md. Synthetic
// infants only.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
const SKILL = '.claude/skills/neofeed-clinical-rules/SKILL.md';
const lf = (s) => String(s).replace(/\r\n/g, '\n');
const R = (f) => lf(fs.readFileSync(DIR + f, 'utf8'));
const args = process.argv.slice(2);
const SHOW = args.includes('--show') ? (args[args.indexOf('--show') + 1] || '').replace(/^--.*/, '') || '*' : null;
const FIX = args.includes('--fix-lines');
const NEG = process.env.NEGATIVE_CONTROL || '';

let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  if (SHOW && cond) { pass++; n++; return; }
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name.padEnd(78)}${cond ? '' : '  ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}

// ── the skill ─────────────────────────────────────────────────────────────
const KINDS = ['stop', 'critical', 'red', 'caution', 'cap', 'target', 'unit', 'round'];
const LIMIT_KINDS = new Set(['stop', 'critical', 'red', 'caution', 'cap', 'target']);
function parseSkill(md) {
  const rules = [], errors = [];
  const lines = md.split('\n');
  let heading = null, block = null;
  lines.forEach((l, i) => {
    const h = /^### (CR-[A-Z0-9-]+)\b/.exec(l);
    if (h && !block) { heading = h[1]; return; }
    if (/^```rule\s*$/.test(l)) { block = { heading, start: i + 1, rows: [] }; return; }
    if (block && /^```\s*$/.test(l)) { rules.push(block); block = null; return; }
    if (block && l.trim()) {
      try { block.rows.push({ at: i + 1, row: JSON.parse(l) }); }
      catch (e) { errors.push(`${SKILL}:${i + 1} is not one JSON object: ${e.message}`); }
    }
  });
  return { errors, rules: rules.map(b => ({ heading: b.heading, at: b.start, rule: b.rows[0]?.row || {}, ruleAt: b.rows[0]?.at,
    cases: b.rows.slice(1).map(r => ({ ...r.row, _at: r.at })) })) };
}
const md = R(SKILL);
const { rules, errors } = parseSkill(md);
const D_PATH = (D, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), D);

// ── jsdom + React + data.js + the Calculator ──────────────────────────────
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
window.prompt = () => null;
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = require('react');
global.React = React; window.React = React;
{ const w = console.error; console.error = (...a) => { if (!/act\(|not wrapped|Not implemented/.test(String(a[0]))) w(...a); }; }

const PATCHES = {
  1: ['data.js', 'const GIR_HARD_HI = 12;', 'const GIR_HARD_HI = 13;', 'GIR_HARD_HI 12 → 13'],
  2: ['calculator.jsx', '? (Number(D.displayNum(v, 0)) >= D.OSM_PERIPHERAL_MAX ? "crit" : "ok")',
      '? (Number(D.displayNum(v, 0)) > D.OSM_PERIPHERAL_MAX ? "crit" : "ok")', 'peripheral osmolarity graded > 900'],
};
const patch = PATCHES[NEG];
if (NEG && !patch) { console.error(`NEGATIVE_CONTROL=${NEG}: use 1 or 2`); process.exit(2); }
function source(f) {
  const s = R(f);
  if (!patch || patch[0] !== f) return [s, f];
  if (!s.includes(patch[1])) { console.error(`NEGATIVE_CONTROL=${NEG}: the text to patch is no longer in ${f}`); process.exit(2); }
  console.log(`NEGATIVE_CONTROL=${NEG}: ${patch[3]} — this run must FAIL`);
  // Not "calculator.jsx": the compiled loader only stands in for the file on disk.
  return [s.replace(patch[1], patch[2]), f.replace('.jsx', '-negative-control.jsx')];
}
vm.runInThisContext(source('data.js')[0]);
const D = window.NEOFEED_DATA;
for (const f of ['icons.jsx', 'calculator.jsx']) {
  const [code, filename] = source(f);
  vm.runInThisContext(babel.transformSync(code, {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename, configFile: false, babelrc: false,
  }).code);
}

const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const fieldOf = (label) => [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
const saltRow = (label) => [...container.querySelectorAll('.salt-row-grid')]
  .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label)) || null;
function setField(label, value) {
  const input = fieldOf(label)?.querySelector('input') || saltRow(label)?.querySelector('input');
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
function feed(key) {
  const sel = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === key));
  if (!sel) throw new Error('no feed ' + JSON.stringify(key) + ' in any select');
  act(() => { selectSetter.call(sel, key); sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
}
const alertRows = () => [...container.querySelectorAll('.calc-bottom .alert-row')].map(a => ({
  level: ['crit', 'warn', 'info'].find(c => a.classList.contains(c)),
  title: a.querySelector('.title')?.textContent || '' }));

function mount(c, log) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  const inf = c.infant || {};
  const bw = inf.bw ?? inf.g;
  const patient = { sessionId: 'CR-' + c._at, name: 'CR', bw, currentBed: inf.bed || 'NICU 5', diagnosis: '-',
    weights: [{ dol: 1, w: bw }], admissionDate: '2026-10-18' };
  act(() => { root.render(React.createElement(window.Calculator, {
    patient, dol: inf.dol ?? 10, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-10-27',
    userLabel: 'Dr Rules (rules@kcmh.test)', onLog: log, onUpdate: () => Promise.resolve({ ok: true, lastModified: 'lm-u' }),
    onSaved() {}, onWeightChange() {} })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
  if (c.route) {
    const b = buttonNamed('.step2-ctrl .seg button', c.route);
    if (!b) throw new Error('no route button ' + JSON.stringify(c.route));
    click(b);
  }
  setField('Current weight', inf.g);
  for (const l of ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']) setField(l, l === 'Target fluid' ? (c.fluid ?? 150) : 0);
  if (c.feed) feed(c.feed);
  for (const [label, v] of Object.entries(c.order || {})) setField(label, v);
  for (const [label, v] of Object.entries(c.tick || {})) tick(label, v);
  if (c.hours) {
    const b = buttonNamed('button', `${c.hours}h`);
    if (!b) throw new Error(`no ${c.hours}h button`);
    click(b);
  }
}

const list = (v) => v == null ? [] : Array.isArray(v) ? v : [v];
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function runOrder(c, ruleId) {
  const box = { calls: 0 };
  const log = () => { box.calls++; return Promise.resolve({ ok: true, entryId: 'e-' + box.calls, lastModified: 'lm-' + box.calls }); };
  mount(c, log);
  const e = c.expect || {};
  const rows = alertRows();
  const got = { alerts: rows.map(a => `${a.level} ${a.title}`) };
  const label = `${ruleId} · ${c.case}`;
  for (const t of list(e.alert)) {
    const a = rows.find(r => r.title === t);
    ok(`${label}: alert "${t}"${e.level ? ` (${e.level})` : ''}`, !!a && (!e.level || a.level === e.level), got.alerts);
  }
  for (const t of list(e.no_alert)) ok(`${label}: no alert "${t}"`, !rows.some(r => r.title === t), got.alerts);
  for (const t of list(e.shows)) ok(`${label}: shows "${t}"`, text(container).includes(t), 'not on the Calculator');
  for (const t of list(e.hides)) ok(`${label}: does not show "${t}"`, !text(container).includes(t), 'on the Calculator');
  const submit = buttonNamed('button', 'Submit');
  got.submit = submit?.disabled ? 'blocked' : 'enabled';
  if (e.submit === 'blocked') ok(`${label}: Submit is disabled`, !!submit && submit.disabled, got);
  else if (e.submit || e.prints != null) {
    let asked = null;
    window.prompt = (msg) => { asked = String(msg); return e.prints != null ? 'rules check' : null; };
    if (!submit || submit.disabled) ok(`${label}: Submit is enabled`, false, got);
    else {
      await clickAsync(submit);
      got.asked = asked;
      if (e.submit === 'asks_reason') {
        ok(`${label}: Submit asks for a reason`, asked != null, got);
        for (const t of list(e.alert)) ok(`${label}: …naming "${t}"`, asked != null && asked.includes(t), asked);
      }
      if (e.submit === 'no_reason') ok(`${label}: Submit saves without asking`, asked == null && box.calls === 1, { asked, logged: box.calls });
      if (e.prints != null) {
        const form = text(container.querySelector('#print-form'));
        for (const t of list(e.prints)) ok(`${label}: prints "${t}"`, form.includes(t), form ? 'not on the order form' : 'no order form');
      }
    }
    window.prompt = () => null;
  }
  if (SHOW && (SHOW === '*' || SHOW === ruleId)) console.log(`      ${c.case}\n        ${JSON.stringify(got)}`);
}

(async () => {
  console.log(`\n── the skill: ${SKILL} ──`);
  for (const e of errors) ok(e, false);
  ok('the skill has rule blocks', rules.length > 0, rules.length);
  const ids = rules.map(r => r.rule.rule);
  ok('every rule ID is unique', new Set(ids).size === ids.length, ids.filter((x, i) => ids.indexOf(x) !== i));
  const moved = [];
  let fixed = md;
  for (const r of rules) {
    const id = r.rule.rule;
    ok(`${id}: under its own heading`, !!id && id === r.heading, { heading: r.heading, block: id, line: r.at });
    ok(`${id}: kind is one of ${KINDS.join(', ')}`, KINDS.includes(r.rule.kind), r.rule.kind);
    for (const [p, want] of Object.entries(r.rule.coded || {})) {
      const got = D_PATH(D, p);
      ok(`${id}: data.js ${p} = ${JSON.stringify(want)}`, deepEq(got, want), { got });
    }
    const where = list(r.rule.where);
    ok(`${id}: names where the code enforces it`, where.length > 0);
    for (const w of where) {
      let src = null;
      try { src = R(w.file).split('\n'); } catch {}
      const at = src ? src.findIndex(l => l.includes(w.has)) + 1 : 0;
      ok(`${id}: ${w.file} has ${JSON.stringify(w.has).slice(0, 60)}`, at > 0, src ? 'not found' : 'no such file');
      if (at > 0 && !(src[w.line - 1] || '').includes(w.has)) {
        moved.push(`${id}: ${w.file}:${w.line} is now ${w.file}:${at}`);
        const old = `"file": ${JSON.stringify(w.file)}, "line": ${w.line}, "has": ${JSON.stringify(w.has)}`;
        fixed = fixed.replace(old, old.replace(`"line": ${w.line}`, `"line": ${at}`));
      }
    }
    const sides = new Set(r.cases.map(c => c.side));
    if (LIMIT_KINDS.has(r.rule.kind)) ok(`${id}: has a case inside and a case outside its limit`, sides.has('inside') && sides.has('outside'), [...sides]);
    else ok(`${id}: has at least one case`, r.cases.length > 0);
  }
  if (moved.length) {
    console.log(`\n  NOTE  ${moved.length} line number(s) moved${FIX ? ' — rewritten in the skill' : ' (run with --fix-lines to rewrite them)'}:`);
    for (const m of moved) console.log(`        ${m}`);
    if (FIX) fs.writeFileSync(DIR + SKILL, fixed);
  }

  console.log('\n── the cases ──');
  for (const r of rules) {
    const id = r.rule.rule;
    if (SHOW && SHOW !== '*' && SHOW !== id) continue;
    if (SHOW) console.log(`\n  ${id}`);
    for (const c of r.cases) {
      try {
        if (c.fn) {
          const fn = D_PATH(D, c.fn);
          const got = typeof fn === 'function' ? fn(...(c.args || [])) : fn;
          const same = c.within != null ? Math.abs(got - c.want) <= c.within : deepEq(got, c.want);
          ok(`${id} · ${c.case}: ${c.fn}(${(c.args || []).map(a => JSON.stringify(a)).join(', ')})`, same, { got, want: c.want });
          if (SHOW) console.log(`      ${c.case}\n        ${JSON.stringify(got)}`);
        } else await runOrder(c, id);
      } catch (e) { ok(`${id} · ${c.case} (${SKILL}:${c._at}) ran`, false, e.message); }
    }
  }

  act(() => { root.unmount(); });
  console.log(`\nCLINICAL RULES (${rules.length} rules): ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
