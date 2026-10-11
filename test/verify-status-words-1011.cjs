// verify-status-words-1011.cjs — pins the 2026-10-11 Hallmark-audit fix (C1 and the
// emoji): a status is never carried by colour alone, and no colour emoji is
// drawn as an icon on any screen.
//
//   §1  statusWord(): the word an off-range tile is read as, with its direction
//       taken from the value against the tile's own target. An amber value
//       still inside its target says "Caution", which claims no direction. A
//       tile that is fine says nothing (Pp, 2026-10-11: "ไม่แสดง In range
//       ตอนปกติ"), and neither do brand and empty tiles.
//   §2  The real <Calculator>: every warn / crit tile has a chip beside its
//       label (not inside it: the label's own text is the tile's name), the
//       chip's word is one of the five, the chip draws a shape, and the 3px
//       side stripe is gone. An ok tile has no chip at all.
//   §3  Nothing on the calculator screen is a colour emoji, and no <optgroup>
//       label starts with one.
//   §4  The registry's stat strip: RegStatMark draws a shape for warn / crit
//       and nothing for ok or for a stat with no severity.
//
// Mounts the real components in jsdom (same dev-only deps as the other
// calculator harnesses — see test/README.md).
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
vm.runInThisContext(R('data.js'));
for (const f of ['icons.jsx', 'calculator.jsx', 'registry.jsx']) {
  vm.runInThisContext(babel.transformSync(R(f), {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    filename: f, configFile: false, babelrc: false,
  }).code);
}

const container = document.getElementById('root');
let root = ReactDOM.createRoot(container);
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const fieldOf = (label) => [...container.querySelectorAll('.field')].find(d => d.querySelector('label')?.textContent.startsWith(label)) || null;
function setField(label, value) {
  const input = fieldOf(label)?.querySelector('input');
  if (!input) throw new Error('field not found: ' + label);
  act(() => { valueSetter.call(input, String(value)); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
// What a person sees on screen: everything but the (print-only) order form.
function screenText() {
  const c = container.cloneNode(true);
  c.querySelector('#print-form')?.remove();
  return text(c);
}
const COLOUR_EMOJI = /[\p{Emoji_Presentation}️]/u;
const BASE = { dol: 1, editEntry: null, baselineEntry: null, previousEntry: null, logDate: '2026-10-11',
  userLabel: 'Dr Test (doc@kcmh.test)', onUpdate() { return Promise.resolve({ ok: true, lastModified: 'lm-u' }); },
  onSaved() {}, onWeightChange() {}, onLog() { return Promise.resolve({ ok: true, entryId: 'e-1', lastModified: 'lm-1' }); } };
function mount(props) {
  act(() => { root.unmount(); });
  root = ReactDOM.createRoot(container);
  window.localStorage.clear();
  act(() => { root.render(React.createElement(window.Calculator, { ...BASE, ...props })); });
  act(() => { container.querySelectorAll('.card-h.clickable').forEach(h => h.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))); });
}
// A synthetic infant only (no real identifiers).
const pt = (sid, bw) => ({ sessionId: sid, name: sid.slice(0, 2), bw, currentBed: 'NICU 5', diagnosis: '-',
  weights: [{ dol: 1, w: bw }], admissionDate: '2026-10-11' });

const WORDS = ['Low', 'High', 'Caution', 'Critical low', 'Critical high', 'Critical'];

(async () => {
  await section('§1 statusWord: the word, and the direction it is read from', async () => {
    const w = (s, v, t) => global.statusWord(s, v, t);
    eq('ok inside a target says nothing', w('ok', 3.8, [3.5, 4.5]), null);
    eq('ok with no target says nothing', w('ok', 512, null), null);
    eq('warn below the target is Low', w('warn', 98, [110, 135]), 'Low');
    eq('warn above the target is High', w('warn', 140, [110, 135]), 'High');
    eq('warn still inside the target claims no direction', w('warn', 120, [110, 135]), 'Caution');
    eq('crit below the target is Critical low', w('crit', 40, [110, 135]), 'Critical low');
    eq('crit above the target is Critical high', w('crit', 64, [0, 40]), 'Critical high');
    eq('crit inside the target is plain Critical', w('crit', 120, [110, 135]), 'Critical');
    eq('crit with no target is plain Critical', w('crit', 120, null), 'Critical');
    eq('a missing value gets no direction (null is not below 0)', w('warn', null, [3, 4]), 'Caution');
    eq('NaN gets no direction', w('crit', NaN, [3, 4]), 'Critical');
    eq('Infinity ("!!") over a finite maximum is Critical high', w('crit', Infinity, [0, 2.2]), 'Critical high');
    eq('an unbounded upper edge claims no direction above', w('warn', 9e9, [1, Infinity]), 'Caution');
    eq('a brand tile carries no word', w('brand', 5, [1, 9]), null);
    eq('an empty tile carries no word', w('empty', null, [1, 9]), null);
  });

  await section('§2 the calculator: a warn / crit tile has a chip beside its label, an ok tile has none, no stripe', async () => {
    mount({ patient: pt('SW-2000', 2000), onLog: BASE.onLog });
    const set = (l, v) => setField(l, v);
    ['Target fluid', 'Other IV', 'Drug volume', 'Input', 'Urine output', 'Drain content']
      .forEach(l => set(l, l === 'Target fluid' ? 120 : 0));
    set('Current weight', 2000); set('Volume(mL/day)', 180);
    set('Dextrose final', 10); set('Amino acid', 2);
    const tiles = [...container.querySelectorAll('.metric')];
    ok('there are severity tiles to look at', tiles.length > 3, tiles.length);
    ok('no tile has the side stripe any more', tiles.every(t => !t.querySelector('.stripe')), tiles.length);
    const graded = tiles.filter(t => /\bs-(ok|warn|crit)\b/.test(t.className));
    ok('some tiles are graded ok / warn / crit', graded.length > 0, graded.map(t => t.className));
    const okTiles = graded.filter(t => /\bs-ok\b/.test(t.className));
    ok('some tiles are fine (ok), so the quiet state is on screen', okTiles.length > 0, graded.map(t => t.className));
    ok('an ok tile has no chip at all', okTiles.every(t => !t.querySelector('.stat-chip')),
      okTiles.filter(t => t.querySelector('.stat-chip')).map(t => text(t.querySelector('.lbl'))));
    const bad = [];
    for (const t of graded.filter(t => !/\bs-ok\b/.test(t.className))) {
      const tone = t.className.match(/\bs-(warn|crit)\b/)[1];
      const chip = t.querySelector('.metric-top > .stat-chip');
      const label = t.querySelector('.metric-top > .lbl');
      if (!chip || !chip.classList.contains('s-' + tone)) { bad.push([text(label), tone, 'chip missing or wrong tone']); continue; }
      if (!chip.querySelector('svg')) bad.push([text(label), tone, 'no shape']);
      if (!WORDS.includes(text(chip))) bad.push([text(label), tone, 'word ' + text(chip)]);
      if (WORDS.some(x => text(label) === x || text(label).endsWith(x))) bad.push([text(label), tone, 'word inside the label']);
      if (tone === 'warn' && !['Low', 'High', 'Caution'].includes(text(chip))) bad.push([text(label), tone, 'warn word ' + text(chip)]);
      if (tone === 'crit' && !/^Critical/.test(text(chip))) bad.push([text(label), tone, 'crit word ' + text(chip)]);
    }
    ok('each warn / crit tile: chip in .metric-top with its own tone, a shape and a valid word', bad.length === 0, bad);
    const plain = tiles.filter(t => !/\bs-(ok|warn|crit)\b/.test(t.className));
    ok('brand / empty tiles carry no chip', plain.every(t => !t.querySelector('.stat-chip')), plain.map(t => t.className));

    // Push a nutrient past its limit so a warn or crit tile is on screen, and
    // check the chip follows the colour and reads the direction.
    set('Amino acid', 7);
    const hot = [...container.querySelectorAll('.metric')].filter(t => /\bs-(warn|crit)\b/.test(t.className));
    ok('a high amino-acid dose puts a warn or crit tile on screen', hot.length > 0, hot.length);
    // The direction is read off the number and the range the tile itself shows.
    const wrong = [];
    for (const t of hot) {
      const v = parseFloat(t.querySelector('.val').firstChild?.textContent);
      const m = text(t.querySelector('.target .range')).match(/^(-?[\d.]+)–(-?[\d.]+)$/);
      const word = text(t.querySelector('.stat-chip'));
      if (!Number.isFinite(v) || !m) continue;
      const lo = parseFloat(m[1]), hi = parseFloat(m[2]);
      const want = v < lo ? /Low$|low$/ : v > hi ? /High$|high$/ : /^(Caution|Critical)$/;
      if (!want.test(word)) wrong.push([text(t.querySelector('.lbl')), v, [lo, hi], word]);
    }
    ok('…and each chip names the side of its range the number is on', wrong.length === 0, wrong);
    ok('…at least one of them reads Low and at least one High, so both directions are exercised',
      hot.some(t => /Low$|low$/.test(text(t.querySelector('.stat-chip')))) && hot.some(t => /High$|high$/.test(text(t.querySelector('.stat-chip')))),
      hot.map(t => text(t.querySelector('.stat-chip'))));
  });

  await section('§3 no colour emoji on the calculator screen', async () => {
    mount({ patient: pt('SW-2000', 2000), onLog: BASE.onLog });
    const s = screenText();
    ok('the screen text holds no colour emoji', !COLOUR_EMOJI.test(s), s.match(/.{0,20}[\p{Emoji_Presentation}️].{0,20}/u)?.[0]);
    const groups = [...container.querySelectorAll('optgroup')].map(o => o.getAttribute('label'));
    ok('the feed list has its groups', groups.length >= 4, groups);
    ok('…and none of their labels starts with an emoji', groups.every(g => !COLOUR_EMOJI.test(g)), groups);
    const D = window.NEOFEED_DATA;
    const notes = Object.values(D.EN_DB).map(f => f.note || '').filter(Boolean);
    ok('the feed notes in data.js hold no emoji', notes.every(x => !COLOUR_EMOJI.test(x)), notes.filter(x => COLOUR_EMOJI.test(x)));
  });

  await section('§4 the registry stat strip: a shape per severity', async () => {
    const render = (tone) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const r = ReactDOM.createRoot(host);
      act(() => { r.render(React.createElement(global.RegStatMark, { tone })); });
      const out = { svg: !!host.querySelector('svg'), hidden: host.querySelector('.reg-stat-mark')?.getAttribute('aria-hidden') };
      act(() => { r.unmount(); }); host.remove();
      return out;
    };
    for (const tone of ['warn', 'crit']) eq(`${tone} draws a shape, hidden from a screen reader`, render(tone), { svg: true, hidden: 'true' });
    eq('ok draws nothing: a stat that is fine is quiet', render('ok'), { svg: false, hidden: undefined });
    eq('no severity draws nothing', render(null), { svg: false, hidden: undefined });
    eq('an unknown tone draws nothing', render('brand'), { svg: false, hidden: undefined });
    const css = R('NeoFeed.html');
    ok('the shell has no .stripe rule and no reg-stat left border', !/\.metric\s+\.stripe|\.metric\.s-\w+\s+\.stripe/.test(css) && !/\.reg-stat[^{]*\{[^}]*border-left/.test(css));
    eq('the two HTML shells are still byte-identical', R('index.html') === R('NeoFeed.html'), true);
  });

  console.log(`\nSTATUS WORDS + NO EMOJI 2026-10-11: ${fail ? fail + ' FAILED' : 'ALL PASSED'} (${pass} passed)`);
  act(() => { root.unmount(); });
  process.exit(fail ? 1 : 0);
})();
