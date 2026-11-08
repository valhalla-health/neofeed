#!/usr/bin/env node
// calc-compare.cjs — the Calculator of one version against another's (NF-42).
//
//   node tools/calc-compare.cjs --base origin/release --head . --out report.md
//   node tools/calc-compare.cjs --base origin/release --intended "GIR|Dextrose"
//
// Types the same seeded made-up orders into both real <Calculator>s and compares
// every figure: the tiles and their colours, the alerts, the numbers handed to
// the Sheet, the sticker figures and the printed form. NF-42 first asked for this
// on the ward, old and new side by side during a pilot. Pp dropped that pilot on
// 2026-10-28 and chose this form on 2026-11-08: nothing here reaches a ward
// device, and no patient's figures are read.
//
// --base and --head take a git ref or a folder holding the three source files.
// --intended is a regular expression over field names: a difference it matches
// is explained. Exit: 0 no unexplained difference · 1 at least one, which stops
// a release · 2 the comparison could not run.
//
// Dev-only deps as in test/README.md (react@18 react-dom@18 @babel/core
// @babel/preset-react jsdom).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SOURCES = ['data.js', 'icons.jsx', 'calculator.jsx'];
const NOT_ENTERED = '(case could not be entered)';
const ROOT = path.join(__dirname, '..');

function args(argv) {
  const o = { head: '.', n: 100, seed: 20261108 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    if (!['base', 'head', 'n', 'seed', 'intended', 'out', 'snapshot', 'cases', 'to'].includes(k)) die(`unknown argument ${argv[i]}`);
    o[k] = argv[++i];
  }
  o.n = Number(o.n); o.seed = Number(o.seed);
  return o;
}
function die(msg) { console.error(`calc-compare: ${msg}`); process.exit(2); }

// ── the orders ──────────────────────────────────────────────────────────────
// The ranges of test/verify-calc-fuzz.cjs: ordinary orders and very odd ones.
const FEEDS = ['BM_20', 'BM_HMF_24', 'BM_PF_20', 'FBM_PF_22', 'PRENAN_22', 'FBM_PF_24', 'INFATRINI_30', 'LF_20', 'LF_24', 'LF_27'];
function makeCases(n, seed0) {
  let seed = seed0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const between = (lo, hi, step) => Number((Math.round((lo + rnd() * (hi - lo)) / step) * step).toFixed(4));
  const cases = [];
  for (let i = 0; i < n; i++) {
    const bw = between(400, 4000, 10);
    const cur = pick([bw, between(400, 4500, 10), between(Math.max(400, bw - 300), bw + 600, 10)]);
    const s = {
      i, bw, cur, dol: pick([1, 2, 3, 5, 7, 8, 14, 30, 60]),
      route: pick(['central', 'peripheral']),
      fluid: between(40, 200, 5), otherIV: pick([0, 0, between(0, 20, 0.5)]), drug: pick([0, 0, between(0, 30, 0.5)]),
      tpn: pick([between(10, 400, 1), between(10, 400, 0.5)]), dead: pick([0, 10, 20, 30, between(0, 40, 1)]),
      dex: pick([0, between(2.5, 20, 0.5)]), aa: pick([0, between(0.5, 5, 0.1)]), lip: pick([0, between(0.5, 5, 0.1)]), lipH: pick([16, 20, 24]),
      naCl: pick([0, between(0, 6, 0.5)]), naAc: pick([0, between(0, 4, 0.5)]), glyNa: pick([0, between(0, 4, 0.5)]),
      kCl: pick([0, between(0, 5, 0.5)]), k2: pick([0, between(0, 3, 0.5)]), mg: pick([0, between(0, 1, 0.1)]),
      ca: pick([0, between(0, 150, 5)]), soluvit: rnd() > 0.2, pedi: rnd() > 0.2, zn: pick([0, between(0, 2, 0.05)]), hep: pick([0, 0.5, 1]),
      feed: pick(FEEDS), enVol: pick([0, between(0, 60, 0.5)]), enFreq: pick([0, 6, 8, 12]), men: rnd() > 0.7,
      ioIn: between(10, 300, 1), ioOut: between(0, 200, 1), drain: pick([0, 0, between(0, 40, 1)]),
    };
    cases.push(s);
  }
  return cases;
}

// ── one version's figures, in a process of its own ──────────────────────────
async function snapshot(o) {
  const vm = require('vm');
  const babel = require('@babel/core');
  const { JSDOM } = require('jsdom');
  const tree = o.snapshot;
  const R = (f) => fs.readFileSync(path.join(tree, f), 'utf8');

  // A date printed on the form must not read as a difference between two runs.
  const RealDate = Date, FIXED = RealDate.parse('2026-11-08T03:00:00.000Z');
  global.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(FIXED); }
    static now() { return FIXED; }
  };

  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'https://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  Object.assign(global, { window, document: window.document, self: window, HTMLElement: window.HTMLElement, Element: window.Element,
    Node: window.Node, getComputedStyle: window.getComputedStyle, localStorage: window.localStorage,
    requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true });
  global.showToast = () => {};
  window.print = () => {}; window.prompt = () => 'compare'; window.confirm = () => true;
  const React = require('react');
  const ReactDOM = require('react-dom/client');
  const { act } = require('react');
  global.React = React; window.React = React;
  console.error = () => {};
  vm.runInThisContext(R('data.js'));
  const D = window.NEOFEED_DATA;
  for (const f of ['icons.jsx', 'calculator.jsx']) {
    vm.runInThisContext(babel.transformSync(R(f), { presets: [[require('@babel/preset-react'), { runtime: 'classic' }]], filename: f, configFile: false, babelrc: false }).code);
  }

  const container = document.getElementById('root');
  let root = ReactDOM.createRoot(container);
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const selSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const click = (el) => act(() => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  const clickAsync = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); };
  const need = (el, what) => { if (!el) throw new Error(`no ${what}`); return el; };
  const inputFor = (label) => {
    const fi = [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label));
    if (fi) return fi.querySelector('input');
    const row = [...container.querySelectorAll('.salt-row-grid')].find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label));
    return row ? row.querySelector('input') : null;
  };
  const setField = (label, v) => {
    const i = need(inputFor(label), `field ${label}`);
    act(() => { valueSetter.call(i, String(v)); i.dispatchEvent(new window.Event('input', { bubbles: true })); });
  };
  const box = (lbl) => need([...container.querySelectorAll('label.chk-label')].find(l => l.textContent.trim().startsWith(lbl)), `tick ${lbl}`).querySelector('input');
  const tick = (lbl, want) => { const b = box(lbl); if (b.checked !== want) act(() => b.click()); };
  function selectFeed(key) {
    const at = need(D.enProductOf(key), `feed ${key} on Step 2`);
    for (const [cls, v] of [['en-product', at.product.id], ['en-strength', key]]) {
      const sel = need(container.querySelector(`.en-feed-1 .${cls}`), `.${cls}`);
      act(() => { selSetter.call(sel, v); sel.dispatchEvent(new window.Event('change', { bubbles: true })); });
    }
  }
  const button = (t) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === t);

  function flatten(prefix, v, out) {
    if (/constantsVersion/.test(prefix)) return;           // named once, at the top of the report
    if (typeof v === 'number') out[prefix] = String(v);
    else if (typeof v === 'string' && /stickers/.test(prefix)) out[prefix] = v;
    else if (Array.isArray(v)) v.forEach((x, i) => flatten(`${prefix}[${i}]`, x, out));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) flatten(`${prefix}.${k}`, v[k], out);
  }
  function readFigures(saved) {
    const f = {};
    for (const m of container.querySelectorAll('.metric')) {
      const lbl = clean(m.querySelector('.lbl')?.textContent);
      f[`tile: ${lbl}`] = clean(m.querySelector('.val')?.textContent);
      f[`colour: ${lbl}`] = (m.className.match(/s-(\w+)/) || [])[1] || '';
    }
    f['alerts'] = [...container.querySelectorAll('.calc-bottom .alert-row')].map(a => clean(a.textContent)).sort().join(' | ');
    f['Submit enabled'] = String(!!button('Submit') && !button('Submit').disabled);
    if (saved) {
      const { printJson, ...row } = saved;
      for (const k of Object.keys(row)) if (typeof row[k] === 'number') f[`saved: ${k}`] = String(row[k]);
      flatten('stickers', printJson, f);
    }
    const form = container.querySelector('#print-form');
    if (form) {
      const seen = {};
      for (const tr of form.querySelectorAll('tr')) {
        const cells = [...tr.children].map(c => clean(c.textContent));
        const name = (cells.find(c => /[^\d\s.,—-]/.test(c)) || 'row').replace(/[\d.,]+/g, '#').slice(0, 50);
        seen[name] = (seen[name] || 0) + 1;
        f[`print: ${name}${seen[name] > 1 ? ` (${seen[name]})` : ''}`] = cells.join(' · ');
      }
      const rest = form.cloneNode(true);
      rest.querySelectorAll('tr').forEach(t => t.remove());
      f['print: text outside tables'] = clean(rest.textContent).replace(/constants \S+ · app \S*/, 'constants · app');
    }
    return f;
  }

  const out = { constants: D.CONSTANTS_VERSION, cases: [] };
  for (const s of JSON.parse(fs.readFileSync(o.cases, 'utf8'))) {
    let saved = null;
    try {
      act(() => { root.unmount(); });
      root = ReactDOM.createRoot(container);
      window.localStorage.clear();
      act(() => {
        root.render(React.createElement(window.Calculator, {
          patient: { sessionId: 'CMP' + s.i, name: 'Compare', bw: s.bw, ga: 30, sex: 'boys', admissionDate: '2026-09-01', currentBed: 'NICU 1', diagnosis: '-', weights: [{ dol: 1, w: s.bw }], lengths: [], hcs: [] },
          dol: s.dol, editEntry: null, baselineEntry: null, previousEntry: null, logDate: null, userLabel: 'Dr Compare (c@x.test)', userEmail: 'c@x.test',
          onLog: (e) => { saved = e; return Promise.resolve({ ok: true, entryId: 'e', lastModified: 'l' }); },
          onUpdate: () => Promise.resolve({ ok: true, lastModified: 'l' }), onSaved() {}, onWeightChange() {},
        }));
      });
      click(need(button('Open all'), 'Open all'));
      setField('Current weight', s.cur);
      setField('Target fluid', s.fluid); setField('Other IV', s.otherIV); setField('Drug volume', s.drug);
      selectFeed(s.feed);
      setField('Volume(mL/feed)', s.enVol); setField('Frequency', s.enFreq);
      tick('MEN', s.men);
      click(need([...container.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent === (s.route === 'central' ? 'Central' : 'Peripheral')), 'route button'));
      setField('Volume(mL/day)', s.tpn); setField('ปริมาตรคาสาย', s.dead);
      setField('Dextrose final', s.dex); setField('Amino acid', s.aa); setField('20% lipid', s.lip);
      click(need(button(`${s.lipH}h`), `${s.lipH}h`));
      setField('20% NaCl', s.naCl); setField('Na Acetate', s.naAc); setField('Glycophos', s.glyNa);
      setField('KCl', s.kCl); setField('K₂HPO₄', s.k2); setField('MgSO₄', s.mg * 12.1525);
      setField('10% Ca gluconate', s.ca);
      tick('Soluvit N', s.soluvit); tick('Peditrace', s.pedi);
      setField('ZnSO₄', s.zn); setField('Heparin(U/mL)', s.hep);
      setField('Input', s.ioIn); setField('Urine output', s.ioOut); setField('Drain content', s.drain);
      const before = readFigures(null);
      const submit = button('Submit');
      if (submit && !submit.disabled) await clickAsync(submit);
      out.cases.push({ i: s.i, saved: !!saved, fields: { ...before, ...readFigures(saved) } });
    } catch (e) {
      out.cases.push({ i: s.i, error: e.message });
    }
  }
  fs.writeFileSync(o.to, JSON.stringify(out));
}

// ── compare two versions ────────────────────────────────────────────────────
function materialise(spec, tmp, name) {
  if (fs.existsSync(path.join(spec, 'calculator.jsx'))) return { dir: path.resolve(spec), label: spec };
  const sha = spawnSync('git', ['rev-parse', '--short', spec], { cwd: ROOT, encoding: 'utf8' });
  if (sha.status !== 0) die(`${spec} is neither a folder with calculator.jsx nor a git ref`);
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir);
  for (const f of SOURCES) {
    const r = spawnSync('git', ['-c', 'core.autocrlf=false', 'show', `${spec}:${f}`], { cwd: ROOT, maxBuffer: 1 << 28 });
    if (r.status !== 0) die(`${spec}:${f} could not be read`);
    fs.writeFileSync(path.join(dir, f), r.stdout);
  }
  return { dir, label: `${spec} (${sha.stdout.trim()})` };
}

function takeSnapshot(dir, cases, to) {
  const r = spawnSync(process.execPath, [__filename, '--snapshot', dir, '--cases', cases, '--to', to], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, NODE_OPTIONS: '', TZ: 'Asia/Bangkok' },
  });
  if (r.status !== 0) die(`snapshot of ${dir} failed:\n${r.stderr || r.stdout}`);
  return JSON.parse(fs.readFileSync(to, 'utf8'));
}

function amount(a, b) {
  const nums = (s) => (String(s ?? '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const x = nums(a), y = nums(b);
  if (!x.length || x.length !== y.length) return null;
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
}

function compare(a, b, intended) {
  const diff = new Map();
  const note = (field, i, before, after) => {
    const d = diff.get(field) || { field, n: 0, largest: null, textOnly: false, example: null };
    d.n++;
    const by = amount(before, after);
    if (by === null) d.textOnly = true; else d.largest = Math.max(d.largest ?? 0, by);
    if (!d.example) d.example = { i, before: before ?? '(absent)', after: after ?? '(absent)' };
    diff.set(field, d);
  };
  let compared = 0, fields = 0;
  a.cases.forEach((ca, x) => {
    const cb = b.cases[x];
    if (ca.error || cb.error) { note(NOT_ENTERED, ca.i, ca.error || 'entered', cb.error || 'entered'); return; }
    compared++;
    const names = new Set([...Object.keys(ca.fields), ...Object.keys(cb.fields)]);
    fields += names.size;
    for (const k of names) if (ca.fields[k] !== cb.fields[k]) note(k, ca.i, ca.fields[k], cb.fields[k]);
  });
  const rows = [...diff.values()].sort((p, q) => q.n - p.n || p.field.localeCompare(q.field));
  for (const r of rows) r.intended = intended ? intended.test(r.field) : false;
  return { rows, compared, fields };
}

function report(o, base, head, a, b, res, cases) {
  const short = (s) => { const t = String(s).replace(/\|/g, '/'); return t.length > 70 ? t.slice(0, 67) + '…' : t; };
  // A long line differs somewhere in the middle: show that part of each.
  const near = (x, y) => {
    const [a0, b0] = [String(x), String(y)];
    let at = 0;
    while (at < a0.length && a0[at] === b0[at]) at++;
    const cut = (t) => short((at > 25 ? '…' : '') + t.slice(Math.max(0, at - 25), at + 40));
    return `${cut(a0)} → ${cut(b0)}`;
  };
  const bad = res.rows.filter(r => !r.intended);
  const L = [];
  L.push('### Calculator comparison (NF-42)', '');
  L.push(`- **Before:** ${base.label}, constants ${a.constants}`);
  L.push(`- **After:** ${head.label}, constants ${b.constants}`);
  L.push(`- **Made-up orders:** ${cases.length} (seed ${o.seed}), ${res.compared} entered in both, ${a.cases.filter(c => c.saved).length} saved before and ${b.cases.filter(c => c.saved).length} after`);
  L.push(`- **Figures compared:** ${res.fields}`);
  if (o.intended) L.push(`- **Intended (fields matching):** \`${o.intended}\``);
  L.push('');
  if (!res.rows.length) {
    L.push('**No difference in any figure.**');
  } else {
    L.push('| Field | Orders that differ | Largest difference | Example: order, before → after | Explained? |', '|---|---|---|---|---|');
    for (const r of res.rows) {
      const by = r.textOnly ? 'text' : String(Number(r.largest.toFixed(4)));
      L.push(`| ${short(r.field)} | ${r.n} | ${by} | #${r.example.i}: ${near(r.example.before, r.example.after)} | ${r.intended ? 'intended' : '**NO**'} |`);
    }
    L.push('', bad.length ? `**${bad.length} field(s) differ with no explanation. This stops the release.**` : '**Every difference is marked intended. Check each one against the release table.**');
  }
  return { text: L.join('\n') + '\n', bad: bad.length };
}

async function main() {
  const o = args(process.argv.slice(2));
  if (o.snapshot) return snapshot(o);
  if (!o.base) die('--base is required');
  let intended = null;
  if (o.intended) { try { intended = new RegExp(o.intended); } catch (e) { die(`--intended: ${e.message}`); } }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nf42-'));
  try {
    const base = materialise(o.base, tmp, 'base');
    const head = materialise(o.head, tmp, 'head');
    const cases = makeCases(o.n, o.seed);
    const casesFile = path.join(tmp, 'cases.json');
    fs.writeFileSync(casesFile, JSON.stringify(cases));
    const a = takeSnapshot(base.dir, casesFile, path.join(tmp, 'a.json'));
    const b = takeSnapshot(head.dir, casesFile, path.join(tmp, 'b.json'));
    const res = compare(a, b, intended);
    if (!res.compared) { console.log(report(o, base, head, a, b, res, cases).text); die('no order could be entered in both versions'); }
    const { text, bad } = report(o, base, head, a, b, res, cases);
    if (o.out) fs.writeFileSync(o.out, text);
    console.log(text);
    process.exit(bad ? 1 : 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch(e => die(e.stack || e.message));
