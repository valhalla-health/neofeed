// verify-run-checks.cjs — one list of checks, one runner, every level (NF-32).
//
// tools/checks.json names every check with a dimension and a blocking flag.
// tools/run_checks.js is the one command that runs them, and CI, the
// pre-commit hook and the Stop hook all call it, so a check added once runs at
// every level. It reports per dimension and never an average: one failing
// clinical check closes the gate however many others pass.
//
//   #1  the runner on made-up configs: the gate, the report, the levels
//   #2  a bad config is refused, not run
//   #3  hooks: the loop guard, nothing changed, a missing dependency
//   #4  the compiled pass keeps both of CI's guards
//   #5  the real tools/checks.json: Pp's gate (2026-11-08), every harness claimed
//   #6  CI, both hooks and the docs really call the runner
//
// Needs Node 18+ and no npm install. Synthetic files only.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = path.join(__dirname, '..');
const RUNNER = path.join(DIR, 'tools', 'run_checks.js');
let pass = 0, fail = 0, n = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${cond ? '' : '\n         ' + JSON.stringify(detail ?? '')}`);
  cond ? pass++ : fail++;
}

const roots = [];
function fixture(files, config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nf32-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'test'));
  for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(root, f), body);
  fs.writeFileSync(path.join(root, 'checks.json'), JSON.stringify(config));
  return root;
}
// A compiled-pass parent's NODE_OPTIONS names a path relative to the repo; it
// must not reach a run whose working directory is a temp folder.
function run(root, args, opts = {}) {
  const r = spawnSync(process.execPath, [RUNNER, '--root', root, '--config', path.join(root, 'checks.json'), ...args], {
    cwd: root, encoding: 'utf8', input: opts.input ?? '',
    env: { ...process.env, NODE_OPTIONS: '', GITHUB_ACTIONS: '', MARK: path.join(root, 'mark'), ...(opts.env || {}) },
  });
  return { code: r.status, out: r.stdout + r.stderr, err: r.stderr };
}
const marks = (root) => { try { return fs.readFileSync(path.join(root, 'mark'), 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };

const PASSES = (tag) => `require('fs').appendFileSync(process.env.MARK, ${JSON.stringify(tag)} + '\\n');`;
const FAILS = (tag) => PASSES(tag) + `process.exit(1);`;
const DIMS = { clinical: { binary: true }, app: {} };
const PHASES = { sources: {} };
const base = (checks, extra = {}) => ({ dimensions: DIMS, phases: PHASES, checks, ...extra });
const chk = (id, dimension, harness, extra = {}) => ({ id, dimension, blocking: true, levels: ['ci'], phases: ['sources'], harness, ...extra });

// ── #1 ──────────────────────────────────────────────────────────────────────
console.log('\n── #1 the gate and the report ──');
{
  const root = fixture({ 'test/verify-a.cjs': PASSES('a'), 'test/verify-b.cjs': PASSES('b') },
    base([chk('a', 'clinical', 'test/verify-a.cjs'), chk('rest', 'app', 'test/verify-*.cjs')]));
  const r = run(root, ['--level', 'ci']);
  ok('all pass: exit 0 and the gate is open', r.code === 0 && /GATE OPEN/.test(r.out), r);
  ok('each dimension has its own line', /clinical\s+PASS/.test(r.out) && /app\s+PASS/.test(r.out), r.out);
  ok('a harness claimed by an earlier check runs once', marks(root).filter(m => m === 'a').length === 1, marks(root));
}
{
  const root = fixture({ 'test/verify-a.cjs': FAILS('a'), 'test/verify-b.cjs': PASSES('b') },
    base([chk('a', 'clinical', 'test/verify-a.cjs'), chk('b', 'app', 'test/verify-b.cjs')]));
  const r = run(root, ['--level', 'ci']);
  ok('one blocking failure: exit 1 and the gate is closed', r.code === 1 && /GATE CLOSED/.test(r.out), r);
  ok('the failure names its dimension and check', /clinical\s+FAIL.*\ba\b/.test(r.out), r.out);
  ok('the other dimension still reports PASS', /app\s+PASS/.test(r.out), r.out);
  ok('every check still ran after the failure', marks(root).join() === 'a,b', marks(root));
  ok('no average, mean, percentage or score anywhere', !/average|\bmean\b|%|score/i.test(r.out), r.out);
}
{
  const root = fixture({ 'test/verify-a.cjs': FAILS('a') }, base([chk('a', 'app', 'test/verify-a.cjs', { blocking: false })]));
  const r = run(root, ['--level', 'ci']);
  ok('a non-blocking failure is reported and leaves the gate open', r.code === 0 && /not blocking/.test(r.out) && /GATE OPEN/.test(r.out), r);
}
{
  const root = fixture({ 'test/verify-a.cjs': `process.kill(process.pid, 'SIGKILL');` }, base([chk('a', 'clinical', 'test/verify-a.cjs')]));
  ok('a harness that dies with no exit code is a failure', run(root, ['--level', 'ci']).code === 1);
}
{
  const root = fixture({
    'test/verify-a.cjs': `process.exit(process.env.GLOBAL_V==='g' && process.env.PHASE_V==='p' && process.env.CHECK_V==='c' ? 0 : 1);`,
  }, base([chk('a', 'app', 'test/verify-a.cjs', { env: { CHECK_V: 'c' } })], { env: { GLOBAL_V: 'g' }, phases: { sources: { env: { PHASE_V: 'p' } } } }));
  ok('config, phase and check env all reach the child', run(root, ['--level', 'ci']).code === 0);
}
{
  const root = fixture({ 'test/verify-a.cjs': PASSES('a'), 'test/verify-b.cjs': PASSES('b') }, {
    dimensions: DIMS, phases: { pre: {}, sources: {} }, checks: [
      chk('a', 'app', 'test/verify-a.cjs', { phases: ['pre'] }),
      chk('b', 'app', 'test/verify-b.cjs', { phases: ['sources'], levels: ['ci', 'commit'] }),
    ],
  });
  run(root, ['--level', 'ci', '--phase', 'pre']);
  ok('--phase runs that phase only', marks(root).join() === 'a', marks(root));
  fs.rmSync(path.join(root, 'mark'), { force: true });
  run(root, ['--level', 'commit', '--changed', 'x.txt']);
  ok('--level runs that level only', marks(root).join() === 'b', marks(root));
}
{
  const root = fixture({ 'test/verify-a.cjs': PASSES('a') }, base([chk('a', 'clinical', 'test/verify-a.cjs', { levels: ['commit', 'ci'], when_changed: ['calculator.jsx'] })]));
  run(root, ['--level', 'commit', '--changed', 'README.md']);
  ok('when_changed: no matching file, a hook skips it', marks(root).length === 0, marks(root));
  run(root, ['--level', 'commit', '--changed', 'calculator.jsx']);
  ok('when_changed: a matching file, the hook runs it', marks(root).length === 1, marks(root));
  run(root, ['--level', 'ci']);
  ok('when_changed never applies in CI', marks(root).length === 2, marks(root));
}

// ── #2 ──────────────────────────────────────────────────────────────────────
console.log('\n── #2 a bad config is refused ──');
const refused = (name, files, config, re) => {
  const r = run(fixture(files, config), ['--level', 'ci']);
  ok(name, r.code === 2 && re.test(r.out), r);
};
const A = { 'test/verify-a.cjs': PASSES('a') };
refused('a binary dimension cannot hold a non-blocking check', A, base([chk('a', 'clinical', 'test/verify-a.cjs', { blocking: false })]), /binary/);
refused('an unknown dimension', A, base([chk('a', 'nope', 'test/verify-a.cjs')]), /dimension/);
refused('a blocking flag that is not true or false', A, base([chk('a', 'app', 'test/verify-a.cjs', { blocking: 'yes' })]), /blocking/);
refused('a harness file that does not exist', A, base([chk('a', 'app', 'test/verify-a.cjs'), chk('b', 'app', 'test/verify-gone.cjs')]), /verify-gone/);
refused('a glob that matches nothing', A, base([chk('a', 'app', 'test/verify-a.cjs'), chk('b', 'app', 'test/other-*.cjs')]), /other-/);
refused('two checks with one id', A, base([chk('a', 'app', 'test/verify-a.cjs'), chk('a', 'app', 'test/verify-a.cjs')]), /duplicate/i);
refused('a harness no CI check claims', { ...A, 'test/verify-lost.cjs': PASSES('l') }, base([chk('a', 'app', 'test/verify-a.cjs')]), /verify-lost/);
refused('an unknown phase', A, base([chk('a', 'app', 'test/verify-a.cjs', { phases: ['nope'] })]), /phase/);
refused('an unknown level', A, base([chk('a', 'app', 'test/verify-a.cjs', { levels: ['ci', 'nope'] })]), /level/);
refused('a check with no way to run', A, base([{ id: 'a', dimension: 'app', blocking: true, levels: ['ci'], phases: ['sources'] }, chk('b', 'app', 'test/verify-a.cjs')]), /one of/);

// ── #3 ──────────────────────────────────────────────────────────────────────
console.log('\n── #3 hooks ──');
const STOP = (extra = {}) => chk('a', 'clinical', 'test/verify-a.cjs', { levels: ['stop', 'ci'], ...extra });
{
  const root = fixture({ 'test/verify-a.cjs': FAILS('a') }, base([STOP()]));
  const active = run(root, ['--level', 'stop', '--hook', '--changed', 'x.txt'], { input: '{"stop_hook_active":true}' });
  ok('the second Stop in a row runs nothing and lets the agent stop', active.code === 0 && marks(root).length === 0, active);
  const blocked = run(root, ['--level', 'stop', '--hook', '--changed', 'x.txt'], { input: '{"stop_hook_active":false}' });
  ok('a failed Stop exits 2, the code that sends the agent back', blocked.code === 2, blocked);
  ok('the agent is told the dimension and the check, on stderr', /clinical/.test(blocked.err) && /\ba\b/.test(blocked.err), blocked.err);
  const none = run(root, ['--level', 'stop', '--hook', '--changed', ''], { input: '{}' });
  ok('a Stop with nothing changed runs nothing', none.code === 0 && marks(root).length === 1, { none, m: marks(root) });
  fs.writeFileSync(path.join(root, 'checks.json'), '<<<<<<< a merge conflict');
  const broken = run(root, ['--level', 'stop', '--hook', '--changed', 'x.txt'], { input: '{"stop_hook_active":true}' });
  ok('a broken checks.json cannot trap an agent on its second Stop', broken.code === 0, broken);
  const brokenFirst = run(root, ['--level', 'stop', '--hook', '--changed', 'x.txt'], { input: '{}' });
  ok('on the first Stop it is still sent back', brokenFirst.code === 2, brokenFirst);
  fs.writeFileSync(path.join(root, 'checks.json'), JSON.stringify(base([STOP()])));
  const commit = run(root, ['--level', 'ci']);
  ok('outside --hook a closed gate is exit 1', commit.code === 1, commit);
}
{
  const root = fixture(A, base([chk('a', 'clinical', 'test/verify-a.cjs', { levels: ['commit', 'ci'], needs: ['a-package-nobody-has'] })]));
  const hook = run(root, ['--level', 'commit', '--changed', 'x.txt']);
  ok('a hook with a missing package skips and says so', hook.code === 0 && /SKIP/.test(hook.out) && /a-package-nobody-has/.test(hook.out) && marks(root).length === 0, hook);
  run(root, ['--level', 'ci']);
  ok('CI never skips for a missing package: it runs the check', marks(root).length === 1, marks(root));
}

// ── #4 ──────────────────────────────────────────────────────────────────────
console.log('\n── #4 the compiled pass keeps its guards ──');
const COMPILED = { compiled: { guards: ['compiled-swapped', 'no-browser-skip'] } };
const MOUNTS = `// ${'transform' + 'Sync'}\n`;
const compiledRun = (body) => run(fixture({ 'test/verify-a.cjs': body }, base([chk('a', 'app', 'test/verify-a.cjs', { phases: ['compiled'] })], { phases: COMPILED })), ['--level', 'ci']);
ok('a harness that mounts .jsx and swapped nothing fails', compiledRun(MOUNTS).code === 1);
ok('a harness that mounts .jsx and swapped passes', compiledRun(MOUNTS + `console.log('[compiled-loader] swapped in x');`).code === 0);
ok('a harness that mounts nothing needs no swap', compiledRun('').code === 0);
ok('a skipped browser section fails', compiledRun(`console.log('SKIP  ' + 'playwright not installed');`).code === 1);
ok('so does a Chromium that would not launch', compiledRun(`console.log('SKIP ' + 'could not launch Chromium');`).code === 1);

// ── #5 ──────────────────────────────────────────────────────────────────────
console.log('\n── #5 the real tools/checks.json ──');
{
  const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'tools', 'checks.json'), 'utf8'));
  const v = spawnSync(process.execPath, [RUNNER, '--validate'], { cwd: DIR, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  ok('the runner accepts it: every harness is claimed, every file exists', v.status === 0, v.stdout + v.stderr);
  // Pp, 2026-11-08: every dimension closes the gate. Moving one to false is
  // her call, and this line has to change with it.
  const loose = cfg.checks.filter(c => c.blocking !== true).map(c => c.id);
  ok('every check blocks (Pp, 2026-11-08)', loose.length === 0, loose);
  const byId = Object.fromEntries(cfg.checks.map(c => [c.id, c]));
  for (const id of ['calc-sum', 'clinical-rules', 'reference-tabs', 'status-zones', 'safety-fixes-0923']) {
    ok(`${id} is clinical, and the dimension is binary`, byId[id]?.dimension === 'clinical-calculation' && cfg.dimensions['clinical-calculation'].binary === true, byId[id]);
  }
  for (const id of ['ci-bans', 'ci-bans-self-test', 'reference-tabs', 'calc-sum', 'clinical-rules']) {
    ok(`${id} runs at stop, commit and ci`, ['stop', 'commit', 'ci'].every(l => byId[id]?.levels.includes(l)), byId[id]);
  }
  for (const id of ['calc-sum', 'clinical-rules']) {
    const w = byId[id]?.when_changed || [];
    ok(`${id} waits for a dose file at the hooks`, w.includes('calculator.jsx') && w.includes('data.js'), w);
  }
  ok('the compiled pass keeps both guards', JSON.stringify(cfg.phases.compiled.guards.slice().sort()) === '["compiled-swapped","no-browser-skip"]', cfg.phases.compiled);
  ok('the compiled pass loads the compiled files', /compiled-loader\.cjs/.test(cfg.phases.compiled.env.NODE_OPTIONS), cfg.phases.compiled);
  ok('the no-dead-space KCMH run survived', byId['kcmh-factor-no-dead-space']?.env?.DEAD === '0', byId['kcmh-factor-no-dead-space']);
  ok('Center Point is still built and tested', byId['center-point-build'] && byId['center-point-tests']);
  ok('the build-freshness check runs first', cfg.checks[0].id === 'build-fresh' && cfg.checks[0].phases[0] === Object.keys(cfg.phases)[0], cfg.checks[0]);
}

// ── #6 ──────────────────────────────────────────────────────────────────────
console.log('\n── #6 every level calls the one runner ──');
{
  const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
  const yml = read('.github/workflows/test.yml');
  for (const phase of ['pre', 'sources', 'compiled', 'center-point']) {
    ok(`CI runs phase ${phase} through the runner`, yml.includes(`node tools/run_checks.js --level ci --phase ${phase}`));
  }
  ok('CI has no harness loop of its own', !/for f in test\/verify-/.test(yml));
  ok('CI calls no check directly', !/node tools\/ci_bans\.js|cmp index\.html|node tools\/build\.mjs|node --test test\//.test(yml));
  ok('the job name the branch rule requires is unchanged', /^  harnesses:/m.test(yml));
  const settings = JSON.parse(read('.claude/settings.json'));
  const stop = settings.hooks.Stop[0].hooks[0].command;
  ok('the Stop hook calls the runner in hook mode', /run_checks\.js/.test(stop) && /--level stop/.test(stop) && /--hook/.test(stop), stop);
  const pre = read('.githooks/pre-commit');
  ok('the pre-commit hook calls the runner', /tools\/run_checks\.js --level commit/.test(pre), pre);
  ok('the hook is LF, or sh on this PC cannot read its first line', !pre.includes('\r') || /\.githooks\/\* text eol=lf/.test(read('.gitattributes')));
  ok('.githooks is never published', /^\.githooks\/$/m.test(read('.assetsignore')));
  ok('AGENTS.md names the one command', /node tools\/run_checks\.js/.test(read('AGENTS.md')));
}

for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
