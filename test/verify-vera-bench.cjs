// verify-vera-bench.cjs — the scorer and the answer key of Vera's seeded-bug
// benchmark (2026-10-11). Dependency-free; runs no model.
//
// test/vera-bench/ holds diffs against a fixed base commit, each with planted
// defects and decoys (changes that look wrong and are right), and key.json
// says where each one is. tools/vera-bench.mjs prepares the cases and scores
// Vera's reports against the key. This harness pins the scorer on synthetic
// reports and checks that the key still points at lines the patches add, so a
// stale key cannot quietly score every report as a miss.
//
//   #1 scoring: a caught defect, a weak catch, a miss, a decoy flagged, a
//      finding matched by its quoted line when its line number is off, a
//      finding in the wrong file
//   #2 the key: every case has its patch and its request file; every defect
//      and decoy sits on an added line of its file, holding its snippet
//   #3 the first run's reports (runs/2026-10-11-opus/) still score the same
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const BENCH = path.join(ROOT, 'test', 'vera-bench');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${good ? 'PASS' : 'FAIL'}  ${name.padEnd(66)}${good ? '' : ` got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  good ? pass++ : fail++;
}
const ok = (name, cond) => eq(name, !!cond, true);

const CASE = {
  id: 'demo',
  expect: 'BLOCK',
  defects: [{ id: 'edge', file: 'calculator.jsx', line: 100, min: '🔴', snippet: 'kMeqPerLGraded >= kLim.hardMax' }],
  decoys: [{ id: 'flip', file: 'calculator.jsx', line: 40, snippet: 'D.LIPID_GKGH.max < lipidGkgh' }],
};
const report = (verdict, findings) => [
  `VERDICT: ${verdict}`,
  'SCOPE: Dose',
  'FINDINGS:',
  ...(findings.length ? findings : ['- none']),
  'TESTS TO ADD:', '- none', 'NOT REVIEWED:', '- none', '',
].join('\n');

(async () => {
  const bench = await import(pathToFileURL(path.join(ROOT, 'tools', 'vera-bench.mjs')).href);

  console.log('\n── #1 scoring ──');
  const caught = bench.scoreCase(CASE, report('BLOCK', [
    '1. 🔴 calculator.jsx:101 — 60 itself is refused — use >',
    '   Evidence: `const kOverMax = kLim.hardMax != null && kMeqPerLGraded >= kLim.hardMax;`',
    '   Fails when: peripheral K⁺ 60 mEq/L → refused.',
  ]));
  eq('1.1 a 🔴 two lines off: caught, verdict right', [caught.caught, caught.verdictOk], [['edge'], true]);
  eq('1.2 …no decoy touched, report shape clean', [caught.decoyHits, caught.shape], [[], []]);

  const weak = bench.scoreCase(CASE, report('NO BLOCK', [
    '1. 🟡 calculator.jsx:100 — boundary changed — check the source',
    '   Evidence: `kMeqPerLGraded >= kLim.hardMax`',
  ]));
  eq('1.3 the right line at 🟡: partial, and the verdict is wrong', [weak.caught, weak.partial, weak.verdictOk], [[], ['edge'], false]);

  const missed = bench.scoreCase(CASE, report('NO BLOCK', []));
  eq('1.4 no findings: missed', [missed.missed, missed.verdictOk], [['edge'], false]);

  const decoy = bench.scoreCase(CASE, report('BLOCK', [
    '1. 🔴 calculator.jsx:100 — 60 refused — use >',
    '   Evidence: `kMeqPerLGraded >= kLim.hardMax`',
    '   Fails when: 60 → refused.',
    '2. 🟠 calculator.jsx:41 — the lipid comparison was flipped — check it',
    '   Evidence: `D.LIPID_GKGH.max < lipidGkgh`',
  ]));
  eq('1.5 a 🟠 on the decoy: a false positive', decoy.decoyHits, ['flip']);
  const noise = bench.scoreCase(CASE, report('BLOCK', [
    '1. 🔴 calculator.jsx:100 — 60 refused — use >',
    '   Evidence: `kMeqPerLGraded >= kLim.hardMax`',
    '   Fails when: 60 → refused.',
    '2. 🟡 calculator.jsx:40 — the flipped comparison reads oddly',
    '   Evidence: `D.LIPID_GKGH.max < lipidGkgh`',
  ]));
  eq('1.6 a 🟡 on the decoy: noise, not a false positive', [noise.decoyHits, noise.decoyNoise], [[], ['flip']]);

  const bySnippet = bench.scoreCase(CASE, report('BLOCK', [
    '1. 🔴 calculator.jsx:9 — 60 refused — use >',
    '   Evidence: `const kOverMax = kLim.hardMax != null && kMeqPerLGraded >= kLim.hardMax;`',
    '   Fails when: 60 → refused.',
  ]));
  eq('1.7 line number off, quoted line matches: caught', bySnippet.caught, ['edge']);

  const wrongFile = bench.scoreCase(CASE, report('BLOCK', [
    '1. 🔴 data.js:100 — something else — fix',
    '   Evidence: `const K_BAG_MEQ_PER_L = {`',
    '   Fails when: never.',
  ]));
  eq('1.8 same line in another file: missed', wrongFile.missed, ['edge']);

  const clean = bench.scoreCase({ id: 'c', expect: 'NO BLOCK', defects: [], decoys: CASE.decoys }, report('NO BLOCK', []));
  eq('1.9 a clean case left clean: verdict right, nothing flagged', [clean.verdictOk, clean.decoyHits], [true, []]);

  const totals = bench.summarize([caught, missed, clean]);
  eq('1.10 totals add up across cases', [totals.defects, totals.caught, totals.verdictsRight, totals.cases], [2, 1, 2, 3]);

  console.log('\n── #2 the answer key ──');
  const key = JSON.parse(fs.readFileSync(path.join(BENCH, 'key.json'), 'utf8'));
  ok('2.1 key.base is a full commit sha', /^[0-9a-f]{40}$/.test(key.base));
  ok('2.2 at least one clean case and four defect cases', key.cases.filter(c => c.defects.length === 0).length >= 1 && key.cases.filter(c => c.defects.length > 0).length >= 4);
  for (const c of key.cases) {
    const patchPath = path.join(BENCH, 'cases', `${c.id}.patch`);
    const mdPath = path.join(BENCH, 'cases', `${c.id}.md`);
    const md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '';
    ok(`2.3 ${c.id}: patch and request file exist`, fs.existsSync(patchPath) && md);
    ok(`2.4 ${c.id}: request file has both sections`, /^## Pp's request/m.test(md) && /^## Author's claims/m.test(md));
    eq(`2.5 ${c.id}: expected verdict follows the planted severities`, c.expect, c.defects.some(d => d.min === '🔴') ? 'BLOCK' : 'NO BLOCK');
    const added = fs.existsSync(patchPath) ? bench.addedLines(fs.readFileSync(patchPath, 'utf8')) : {};
    for (const item of [...c.defects, ...c.decoys]) {
      const text = (added[item.file] || {})[item.line];
      ok(`2.6 ${c.id}/${item.id}: ${item.file}:${item.line} is added and holds its snippet`, text != null && text.includes(item.snippet));
    }
  }

  console.log('\n── #3 the 2026-10-11 baseline still scores the same ──');
  // Vera's first run (Opus, vera.md as of that day), kept so a change to the
  // scorer or the key cannot quietly rescore it. phi-log found its defect but
  // cited gas-backend.gas, so it scores as a miss with one shape problem.
  const RUN = path.join(BENCH, 'runs', '2026-10-11-opus');
  const base = key.cases.map(c => bench.scoreCase(c, fs.readFileSync(path.join(RUN, `${c.id}.md`), 'utf8'), ROOT));
  const bt = bench.summarize(base);
  eq('3.1 verdicts 6/6, defects 4/5, decoys flagged 0/7, off-shape 1',
    [bt.verdictsRight, bt.cases, bt.caught, bt.defects, bt.decoyHits, bt.decoys, bt.shapeProblems], [6, 6, 4, 5, 0, 7, 1]);
  eq('3.2 the one miss is the misspelt path', base.flatMap(r => r.missed), ['erased-name-and-dob-logged']);

  console.log(`\nVERA BENCH: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
