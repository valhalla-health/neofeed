// verify-maintainer-doctor.cjs — tools/maintainer-doctor.mjs, the read-only check a new
// maintainer runs after docs/MAINTAINER_SETUP.md (Pp, 2026-11-17).
//
// The tool's one dangerous failure would be to change something on a maintainer's computer
// or in the repo while claiming to only look. So beside its checks this pins what it may run:
//   #1 node     below 22 fails; 22 passes as CI's version; newer passes with a note
//   #2 remote   only valhalla-health/neofeed, over https or ssh
//   #3 hooks    core.hooksPath must be .githooks
//   #4 gh       write access (push) passes; read-only, no answer or junk fails
//   #5 clasp    clasp 3 passes; 2, or no version, fails
//   #6 probes   every command it may start is a version, a status, a `git config --get`
//               or a GitHub read; the list is pinned exactly, and nothing else starts a process
//   #7 summary  a required item that fails or is skipped fails the run; an optional one does not
//   #8 cli      by default (no --checks) --offline --json runs to a JSON answer and leaves the tree
//               unchanged; --checks, which runs npm ci and a build, is the only step that writes
const { spawnSync } = require('child_process');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'maintainer-doctor.mjs');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail)}`);
  cond ? pass++ : fail++;
};

(async () => {
  const doc = await import(pathToFileURL(TOOL).href);

  console.log('\n── #1 Node version ──');
  ok('1.0 Node 21 fails', doc.nodeVersionCheck('21.7.3').ok === false);
  const n22 = doc.nodeVersionCheck('22.11.0');
  ok('1.1 Node 22 passes as CI\'s version', n22.ok === true && /ตรงกับ CI/.test(n22.detail), n22);
  const n24 = doc.nodeVersionCheck('v24.21.0');
  ok('1.2 Node 24 passes and names CI\'s 22', n24.ok === true && /22/.test(n24.detail), n24);
  ok('1.3 an unreadable version fails', doc.nodeVersionCheck('').ok === false);

  console.log('\n── #2 remote ──');
  ok('2.0 https remote passes', doc.remoteCheck('https://github.com/valhalla-health/neofeed.git').ok === true);
  ok('2.1 ssh remote passes', doc.remoteCheck('git@github.com:valhalla-health/neofeed.git\n').ok === true);
  ok('2.2 a fork fails', doc.remoteCheck('https://github.com/someone/neofeed.git').ok === false);
  ok('2.3 another repo of the org fails', doc.remoteCheck('https://github.com/valhalla-health/neofeed-site.git').ok === false);
  ok('2.4 no remote fails and says so', doc.remoteCheck('').ok === false && /origin/.test(doc.remoteCheck('').detail));

  console.log('\n── #3 hooks ──');
  ok('3.0 .githooks passes', doc.hooksCheck('.githooks\n').ok === true);
  const noHooks = doc.hooksCheck('');
  ok('3.1 unset fails and names --install-hooks', noHooks.ok === false && /--install-hooks/.test(noHooks.fix), noHooks);
  ok('3.2 another hooks folder fails', doc.hooksCheck('.husky').ok === false);

  console.log('\n── #4 GitHub permission ──');
  const maintain = doc.ghPermissionCheck('{"admin":false,"maintain":true,"push":true,"triage":true,"pull":true}');
  ok('4.0 maintain passes and is named', maintain.ok === true && /maintain/.test(maintain.detail), maintain);
  const readOnly = doc.ghPermissionCheck('{"admin":false,"maintain":false,"push":false,"triage":false,"pull":true}');
  ok('4.1 read-only fails', readOnly.ok === false && /read/.test(readOnly.detail), readOnly);
  ok('4.2 no answer fails', doc.ghPermissionCheck('').ok === false);
  ok('4.3 an error page fails', doc.ghPermissionCheck('gh: Not Found (HTTP 404)').ok === false);

  console.log('\n── #5 clasp ──');
  ok('5.0 clasp 3 passes', doc.claspVersionCheck('3.3.0\n').ok === true);
  ok('5.1 clasp 2 fails', doc.claspVersionCheck('2.4.2').ok === false);
  ok('5.2 no version fails', doc.claspVersionCheck('').ok === false);

  console.log('\n── #6 read-only probes ──');
  const probes = Object.entries(doc.PROBES);
  ok('6.0 the probe list is frozen', Object.isFrozen(doc.PROBES));
  const WRITES = /\b(push|deploy|undeploy|install|uninstall|login|logout|set|unset|add|rm|remove|delete|create|update|commit|merge|clone|init|pull|fetch|reset|checkout|config\s+(?!--get\b))\b|>|\||&&|;|--method|-X\b|-f\b/i;
  for (const [id, cmd] of probes) {
    const bad = cmd.replace(/^git config --get /, 'git config-get ').match(WRITES);
    ok(`6.1 ${id}: "${cmd}" only reads`, !bad, bad && bad[0]);
  }
  ok('6.2 every git config probe uses --get', probes.filter(([, c]) => /^git config/.test(c)).every(([, c]) => /^git config --get /.test(c)));
  ok('6.3 the GitHub API read is a GET of this repo only', doc.PROBES.ghRepo === 'gh api repos/valhalla-health/neofeed --jq .permissions');
  ok('6.4 the network probes are named', JSON.stringify(doc.NETWORK_PROBES) === JSON.stringify(['ghAuth', 'ghRepo']));
  // A deny-list cannot name every writing command (a review found `gh workflow run`, `clasp run`,
  // `clasp redeploy` and `npx wrangler rollback` passed one), so the list itself is pinned: adding
  // or changing a probe means changing this literal, in a diff a reviewer reads.
  const EXPECTED = {
    git: 'git --version',
    hooks: 'git config --get core.hooksPath',
    remote: 'git config --get remote.origin.url',
    gh: 'gh --version',
    ghAuth: 'gh auth status',
    ghRepo: 'gh api repos/valhalla-health/neofeed --jq .permissions',
    clasp: 'clasp --version',
  };
  ok('6.5 the probe list is exactly the pinned one', JSON.stringify({ ...doc.PROBES }) === JSON.stringify(EXPECTED), doc.PROBES);
  const src = require('fs').readFileSync(TOOL, 'utf8');
  const spawns = (src.match(/spawnSync\(/g) || []).length;
  ok('6.6 it starts commands in two places only: run() and the --checks step', spawns === 2, spawns);
  ok('6.7 no other way to start a process', !/\b(exec|execSync|execFile|execFileSync|spawn|fork)\(/.test(src.replace(/spawnSync\(/g, '')));
  // A second review routed commands past 6.5-6.7: a bare run("git push"), an aliased execSync
  // import, and changed --checks arguments. Each of those three doors is pinned here.
  ok('6.8 run() is called once, and only with a PROBES entry',
    (src.match(/\brun\(/g) || []).length === 2 && src.includes('const probe = id => run(PROBES[id]);'));
  // A third review aliased them instead (`const rr = run`, `const sp = spawnSync`). Counting every
  // mention outside comments catches an alias too: run twice (its definition and the probe),
  // spawnSync three times (the import, run() and the --checks step).
  const code = src.replace(/^\s*\/\/.*$/gm, '');
  ok('6.11 no alias of run or spawnSync', (code.match(/\brun\b/g) || []).length === 2 && (code.match(/\bspawnSync\b/g) || []).length === 3,
    { run: (code.match(/\brun\b/g) || []).length, spawnSync: (code.match(/\bspawnSync\b/g) || []).length });
  ok('6.9 child_process gives spawnSync only, under its own name',
    (src.match(/child_process/g) || []).length === 1 && src.includes('import { spawnSync } from "node:child_process";'));
  ok('6.10 --checks starts exactly the pre-PR checks',
    src.includes('spawnSync(process.execPath, [path.join(ROOT, "tools", "run_checks.js"), "--level", "ci", "--phase", "pre"],'));

  console.log('\n── #7 summary ──');
  const r = (id, required, okv) => ({ id, required, ok: okv });
  ok('7.0 all required ok gives exit 0', doc.summarize([r('a', true, true), r('b', false, false)]).exitCode === 0);
  const one = doc.summarize([r('a', true, true), r('b', true, false)]);
  ok('7.1 a failed required item gives exit 1 and is named', one.exitCode === 1 && one.failed.join() === 'b', one);
  ok('7.2 a skipped required item gives exit 1', doc.summarize([r('ghAuth', true, null)]).exitCode === 1);

  console.log('\n── #8 the command line ──');
  const status = () => spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  const before = status();
  const run = spawnSync(process.execPath, [TOOL, '--offline', '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  let out = null;
  try { out = JSON.parse(run.stdout); } catch (e) { out = null; }
  ok('8.0 it answers 0 or 1, never a crash', run.status === 0 || run.status === 1, { status: run.status, stderr: (run.stderr || '').slice(0, 300) });
  ok('8.1 --json prints JSON only', out !== null, (run.stdout || '').slice(0, 200));
  const ids = out ? out.results.map(x => x.id) : [];
  ok('8.2 it checks Node, the build tools and clasp sign-in', ['node', 'buildDeps', 'claspLogin'].every(id => ids.includes(id)), ids);
  ok('8.3 --offline skips both network reads', out !== null && !out.results.some(x => doc.NETWORK_PROBES.includes(x.id) && x.ok !== null), ids);
  ok('8.4 without --checks it runs no pre-PR checks (they run npm ci and a build)', !ids.includes('preChecks'), ids);
  ok('8.5 the exit code matches the summary', out !== null && out.exitCode === run.status, out && out.exitCode);
  ok('8.6 the working tree is unchanged', status() === before);
  const td = out ? out.results.find(x => x.id === 'testDeps') : null;
  ok('8.7 the harness packages are required (AGENTS.md: run the harnesses before a PR)', td && td.required === true, td);
  // CI has no clasp, so the run's own exit code is 1 anyway; check the skipped items themselves.
  const net = out ? out.results.filter(x => doc.NETWORK_PROBES.includes(x.id)) : [];
  const ghHere = ids.includes('gh') && out.results.find(x => x.id === 'gh').ok === true;
  ok('8.8 --offline skips the GitHub checks as required and unanswered, so it cannot pass',
    !ghHere || (net.length === 2 && net.every(x => x.required === true && x.ok === null) && doc.summarize(net).exitCode === 1), net);
  const skipped = [{ id: 'ghAuth', required: true, ok: null }, { id: 'ghRepo', required: true, ok: null }];
  ok('8.9 two skipped required items alone fail the run', doc.summarize(skipped).exitCode === 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
