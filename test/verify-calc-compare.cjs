// verify-calc-compare.cjs — the old-against-new comparison finds what moved (NF-42).
//
// tools/calc-compare.cjs types the same made-up orders into two versions of the
// real Calculator and compares every figure. It is what a release leans on, so
// this harness plants changes and proves it reports them, by field and amount.
//
//   #1  a version against itself: no difference, exit 0
//   #2  a planted stock strength: exit 1, named, with its amount
//   #3  --intended explains a difference and only that difference
//   #4  an order that cannot be entered is reported, never dropped
//   #5  git refs work, and the release path names the tool
//
// Dev-only deps as in test/README.md. Made-up orders only.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = path.join(__dirname, '..');
const TOOL = path.join(DIR, 'tools', 'calc-compare.cjs');
let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${cond ? '' : '\n         ' + JSON.stringify(detail ?? '').slice(0, 900)}`);
  cond ? pass++ : fail++;
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nf42t-'));
function tree(name, edit) {
  const d = path.join(tmp, name);
  fs.mkdirSync(d);
  for (const f of ['data.js', 'icons.jsx', 'calculator.jsx']) {
    let s = fs.readFileSync(path.join(DIR, f), 'utf8');
    if (edit) s = edit(f, s);
    fs.writeFileSync(path.join(d, f), s);
  }
  return d;
}
// NODE_OPTIONS: a compiled-pass parent's loader would swap the planted sources
// for the repo's compiled files.
function run(base, head, extra = [], n = '14') {
  const r = spawnSync(process.execPath, [TOOL, '--base', base, '--head', head, '--n', n, ...extra], {
    cwd: DIR, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, NODE_OPTIONS: '' },
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

const same = tree('same');
// One change of each kind the report must name. A plant that no longer matches
// the source throws, so this harness cannot go quiet.
const plant = (s, from, to) => { if (!s.includes(from)) throw new Error('the planted line is gone: ' + from); return s.replace(from, to); };
const planted = tree('planted', (f, s) => {
  if (f === 'data.js') {
    if (!/naMeqPerMl:\s*3\.42/.test(s)) throw new Error('the planted stock line is gone');
    return s.replace(/naMeqPerMl:\s*3\.42/, 'naMeqPerMl: 3.5');
  }
  if (f !== 'calculator.jsx') return s;
  s = plant(s, 'className={`alert-row ${a.level}`}', 'className={`alert-row ${a.level === "warn" ? "info" : a.level}`}');
  s = plant(s, 'className={`gir-readout s-${sGir}`}', 'className={`gir-readout s-${sGir === "ok" ? "warn" : sGir}`}');
  s = plant(s, '<Tile label="Calcium" value={calc.caKg}', '<Tile label="Calcium" value={calc.caKg + 1}');
  s = plant(s, '`${Math.round(suppVitD * wtKg)} IU`', '`${Math.round(suppVitD * wtKg * 2)} IU`');
  s = plant(s, 'printJson: figures,', 'printJson: figures, plantedNote: "x", plantedEmpty: {},');
  return s;
});
const bumped = tree('bumped', (f, s) => (f === 'data.js' ? s.replace(/CONSTANTS_VERSION = "[^"]+"/, 'CONSTANTS_VERSION = "2099-01-01.1"') : s));
// Step 2 stops offering one feed: only the orders that use it cannot be entered.
const noneOnOneOrder = tree('one-feed-gone', (f, s) => (f === 'data.js' ? plant(s, 'function enProductOf(key) {', 'function enProductOf(key) {\n  if (key === "LF_27") return null;') : s));
const noSubmit = tree('no-submit', (f, s) => (f === 'calculator.jsx' ? plant(s, '{ key: "ioInput",', '{ key: "neverFilled", label: "x" }, { key: "ioInput",') : s));
const noField = tree('no-field', (f, s) => (f === 'calculator.jsx' ? s.split('Target fluid').join('Fluid goal') : s));

console.log('\n── #1 a version against itself ──');
{
  const r = run(same, same);
  ok('exit 0', r.code === 0, r);
  ok('says no figure differs', /No difference in any figure/.test(r.out), r.out);
  ok('every order was entered', /14 entered in both/.test(r.out), r.out);
  const m = r.out.match(/(\d+) saved before and (\d+) after/);
  ok('some orders reached Submit, so the printed form was compared', !!m && +m[1] > 0 && m[1] === m[2], m);
  const kinds = r.out.match(/(\d+) with a second feed, (\d+) No TPN, (\d+) with oral orders, (\d+) with a typed dosing weight/);
  ok('the orders include each kind', !!kinds && kinds.slice(1).every(k => +k > 0), kinds);
  ok('figures were compared', +(r.out.match(/Figures compared:\*\* (\d+)/) || [])[1] > 300, r.out);
}

{
  const r = run(same, bumped);
  ok('a version number alone is no difference', r.code === 0 && /2099-01-01\.1/.test(r.out) && /No difference/.test(r.out), r.out);
}

console.log('\n── #2 a planted stock strength ──');
const moved = run(same, planted);
{
  ok('exit 1: the release stops', moved.code === 1, moved);
  ok('the printed NaCl line is named', /\| print: [^|]*NaCl[^|]*\|/.test(moved.out), moved.out);
  for (const [what, re] of [
    ['a sticker figure', /\| stickers\.[^|]*\|/],
    ['an alert whose level alone moved', /\| alerts \|/],
    ['the GIR readout colour', /\| colour: GIR readout \|/],
    ['a tile', /\| tile: Calcium \|/],
    ['a figure elsewhere on the screen', /\| screen: other text \|/],
    ['a saved string', /\| saved\.plantedNote \|/],
    ['a saved empty object', /\| saved\.plantedEmpty \|/],
  ]) ok(`names ${what}`, re.test(moved.out), moved.out);
  ok('each row says how much', /\| \d+ \| \d+(\.\d+)? \| #\d+:/.test(moved.out), moved.out);
  ok('and is marked unexplained', /\*\*NO\*\*/.test(moved.out) && /stops the release/.test(moved.out), moved.out);
  ok('no name reaches the report', !/Compare\b(?! \(NF| any)|CMP\d/.test(moved.out.replace('Calculator comparison', '')), moved.out);
}

console.log('\n── #3 --intended ──');
{
  const all = run(same, planted, ['--intended', '.']);
  ok('every difference explained: exit 0', all.code === 0, all);
  ok('and the report still lists them', /\| intended \|/.test(all.out) && /Check each one/.test(all.out), all.out);
  const part = run(same, planted, ['--intended', '^nothing-matches$']);
  ok('a pattern that misses explains nothing: exit 1', part.code === 1, part);
  const notEntered = run(same, noneOnOneOrder, ['--intended', 'case']);
  ok('--intended cannot explain an order that was not entered', notEntered.code === 1 && /could not be entered/.test(notEntered.out), notEntered);
  const badRe = run(same, same, ['--intended', '(']);
  ok('a broken pattern is refused', badRe.code === 2, badRe);
}

console.log('\n── #4 an order that cannot be entered ──');
{
  const r = run(same, noField);
  ok('no order enters on one side: it cannot compare', r.code === 2, r);
  ok('the row says why', /case could not be entered/.test(r.out) && /no field Target fluid/.test(r.out), r.out);
}

{
  const r = run(noSubmit, noSubmit);
  ok('no order reached Submit anywhere: it cannot vouch for the print', r.code === 2 && /reached Submit/.test(r.out), r);
}

console.log('\n── #5 git refs and the release path ──');
{
  const r = run('HEAD', 'HEAD');
  ok('a ref on both sides works', r.code === 0 && /HEAD \(\w+\)/.test(r.out), r);
  const missing = run('no-such-ref-here', same);
  ok('an unknown ref is refused', missing.code === 2, missing);
  const tpl = fs.readFileSync(path.join(DIR, '.github/PULL_REQUEST_TEMPLATE/release.md'), 'utf8');
  ok('the release template asks for the report', /calc-compare\.cjs/.test(tpl) && /Calculator comparison/.test(tpl));
  const ref = fs.readFileSync(path.join(DIR, 'REFERENCE.md'), 'utf8').replace(/\s+/g, ' ');
  ok('REFERENCE.md says how', /calc-compare\.cjs/.test(ref));
  ok('and says what it does not cover', /does not cover/.test(ref) && /[Ee]xit 2/.test(ref));
  const ignored = fs.readFileSync(path.join(DIR, '.assetsignore'), 'utf8');
  ok('tools/ is never published', /^tools\/$/m.test(ignored));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
