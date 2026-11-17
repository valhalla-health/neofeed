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
//               or a GitHub read; nothing installs, signs in, pushes or deploys
//   #7 summary  a required item that fails or is skipped fails the run; an optional one does not
//   #8 cli      --offline --no-checks --json runs to a JSON answer and leaves the tree unchanged
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

  console.log('\n── #7 summary ──');
  const r = (id, required, okv) => ({ id, required, ok: okv });
  ok('7.0 all required ok gives exit 0', doc.summarize([r('a', true, true), r('b', false, false)]).exitCode === 0);
  const one = doc.summarize([r('a', true, true), r('b', true, false)]);
  ok('7.1 a failed required item gives exit 1 and is named', one.exitCode === 1 && one.failed.join() === 'b', one);
  ok('7.2 a skipped required item gives exit 1', doc.summarize([r('ghAuth', true, null)]).exitCode === 1);

  console.log('\n── #8 the command line ──');
  const status = () => spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  const before = status();
  const run = spawnSync(process.execPath, [TOOL, '--offline', '--no-checks', '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  let out = null;
  try { out = JSON.parse(run.stdout); } catch (e) { out = null; }
  ok('8.0 it answers 0 or 1, never a crash', run.status === 0 || run.status === 1, { status: run.status, stderr: (run.stderr || '').slice(0, 300) });
  ok('8.1 --json prints JSON only', out !== null, (run.stdout || '').slice(0, 200));
  const ids = out ? out.results.map(x => x.id) : [];
  ok('8.2 it checks Node, the build tools and clasp sign-in', ['node', 'buildDeps', 'claspLogin'].every(id => ids.includes(id)), ids);
  ok('8.3 --offline skips both network reads', out !== null && !out.results.some(x => doc.NETWORK_PROBES.includes(x.id) && x.ok !== null), ids);
  ok('8.4 --no-checks runs no pre-PR checks', !ids.includes('preChecks'), ids);
  ok('8.5 the exit code matches the summary', out !== null && out.exitCode === run.status, out && out.exitCode);
  ok('8.6 the working tree is unchanged', status() === before);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
