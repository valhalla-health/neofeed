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
//   #7  --shard: CI's parallel jobs cover a phase exactly once (2026-11-16)
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
  ok('every other harness still runs in both passes', JSON.stringify(byId['every-other-harness']?.phases) === '["sources","compiled"]', byId['every-other-harness']);
  // calc-compare clears NODE_OPTIONS for the trees it builds, so the compiled
  // loader never reaches them: a compiled-pass run only repeated this one.
  ok('calc-compare runs once, in the sources pass', JSON.stringify(byId['calc-compare']?.phases) === '["sources"]', byId['calc-compare']);
  ok('calc-compare really never loads compiled/', /NODE_OPTIONS: ''/.test(fs.readFileSync(path.join(DIR, 'tools', 'calc-compare.cjs'), 'utf8')) && /NODE_OPTIONS: ''/.test(fs.readFileSync(path.join(DIR, 'test', 'verify-calc-compare.cjs'), 'utf8')));
  // A hint naming no step weighs nothing, so a renamed slow harness would
  // quietly unbalance CI's shards. Names as the runner gives them.
  const claimed = new Set();
  const names = {};
  for (const c of cfg.checks) {
    let own = [c.id];
    if (c.harness) {
      const dir = path.posix.dirname(c.harness), b = path.posix.basename(c.harness);
      const re = new RegExp('^' + b.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      const found = fs.readdirSync(path.join(DIR, dir)).filter(f => re.test(f)).map(f => `${dir}/${f}`).filter(f => !claimed.has(f));
      found.forEach(f => claimed.add(f));
      own = b.includes('*') ? found.map(f => path.posix.basename(f)) : [c.id];
    }
    for (const p of c.phases) (names[p] ||= new Set()) && own.forEach(x => names[p].add(x));
  }
  const stale = Object.entries(cfg.shard_seconds || {}).filter(([p]) => p !== 'about')
    .flatMap(([p, h]) => Object.keys(h).filter(l => !names[p]?.has(l)).map(l => `${p}: ${l}`));
  ok('every shard_seconds hint names a step of its phase', stale.length === 0, stale);
}

// ── #6 ──────────────────────────────────────────────────────────────────────
console.log('\n── #6 every level calls the one runner ──');
{
  const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
  const yml = read('.github/workflows/test.yml');
  const ymlLines = yml.split('\n');
  const isComment = (l) => /^[ \t]*#/.test(l);
  // YAML also breaks a line at a lone CR (and YAML 1.1 at U+0085, U+2028 and
  // U+2029), so `# note<CR>if: false` is a comment here but a skipped step on
  // GitHub. Git keeps a lone CR whatever .gitattributes says. Every pin below
  // reads lines as LF splits them, so this check holds the pin up.
  ok('test.yml breaks lines with LF only', !/[\r\u0085\u2028\u2029]/.test(yml));
  // Every line of the workflow that is not blank or a comment, pinned (Pp,
  // 2026-11-16, after four reviews each found a new way to write YAML that a
  // pattern missed: `|| true` on or after a run line, a step `if:` written as
  // its first key, a `shell:` or `defaults:` override, a runner step in a job
  // `harnesses` does not wait for). Whole-line comments may change freely; any
  // other edit to test.yml changes this list in the same commit, where a
  // reviewer sees it. This pin is the guard.
  // The checks after it say why the lines that matter are what they are.
  const LIVE = [
    "name: test",
    "on:",
    "  pull_request:",
    "  push:",
    "    branches: [main]",
    "permissions:",
    "  contents: read",
    "concurrency:",
    "  group: test-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.run_id }}",
    "  cancel-in-progress: true",
    "env:",
    "  TZ: Asia/Bangkok",
    "jobs:",
    "  pre:",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 15",
    "    steps:",
    "      - uses: actions/checkout@v5",
    "      - uses: actions/setup-node@v5",
    "        with:",
    "          node-version: 22",
    "      - name: Build, shells and CI bans",
    "        run: node tools/run_checks.js --level ci --phase pre",
    "      - name: Center Point builds and its client tests pass",
    "        run: node tools/run_checks.js --level ci --phase center-point",
    "  sources:",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 30",
    "    strategy:",
    "      fail-fast: false",
    "      matrix:",
    "        shard: [1, 2, 3]",
    "    steps:",
    "      - uses: actions/checkout@v5",
    "      - uses: actions/setup-node@v5",
    "        with:",
    "          node-version: 22",
    "      - name: Install dev-only test dependencies (not committed)",
    "        run: npm install --no-save --no-package-lock react@18 react-dom@18 @babel/core@7 @babel/preset-react@7 jsdom@30",
    "      - name: This shard of every harness, against the sources",
    "        run: node tools/run_checks.js --level ci --phase sources --shard $(( ${{ strategy.job-index }} + 1 ))/${{ strategy.job-total }}",
    "  compiled:",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 30",
    "    strategy:",
    "      fail-fast: false",
    "      matrix:",
    "        shard: [1, 2, 3]",
    "    steps:",
    "      - uses: actions/checkout@v5",
    "      - uses: actions/setup-node@v5",
    "        with:",
    "          node-version: 22",
    "      - name: Install dev-only test dependencies (not committed)",
    "        run: npm install --no-save --no-package-lock react@18 react-dom@18 @babel/core@7 @babel/preset-react@7 jsdom@30",
    "      - name: Install Playwright and Chromium",
    "        run: |",
    "          npm install --prefix \"$RUNNER_TEMP/pw\" --no-save --no-package-lock playwright@1",
    "          \"$RUNNER_TEMP/pw/node_modules/.bin/playwright\" install --with-deps chromium",
    "      - name: This shard of every harness, against the shipped compiled/*.js, with the browser sections",
    "        env:",
    "          NODE_PATH: ${{ runner.temp }}/pw/node_modules",
    "        run: node tools/run_checks.js --level ci --phase compiled --shard $(( ${{ strategy.job-index }} + 1 ))/${{ strategy.job-total }}",
    "  harnesses:",
    "    needs: [pre, sources, compiled]",
    "    if: always()",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 5",
    "    steps:",
    "      - name: Every job above passed",
    "        env:",
    "          PRE: ${{ needs.pre.result }}",
    "          SOURCES: ${{ needs.sources.result }}",
    "          COMPILED: ${{ needs.compiled.result }}",
    "        run: |",
    "          echo \"pre: $PRE, sources: $SOURCES, compiled: $COMPILED\"",
    "          test \"$PRE\" = success && test \"$SOURCES\" = success && test \"$COMPILED\" = success",
  ];
  const live = ymlLines.filter(l => l.trim() && !isComment(l));
  let firstDiff = live.findIndex((l, i) => l !== LIVE[i]);
  if (firstDiff === -1 && live.length !== LIVE.length) firstDiff = Math.min(live.length, LIVE.length);
  ok('every live line of test.yml is the pinned one', firstDiff === -1,
    { firstDiff, got: live[firstDiff], want: LIVE[firstDiff], lines: [live.length, LIVE.length] });

  // The checks below are a second layer: they say why the lines that matter
  // are what they are, and catch the plain mistakes. They read text, not YAML,
  // so an escaped or quoted key, a ` #` inside quotes or a commented job key can
  // get past them; none of those gets past the pin.
  //
  // Each runner step's run line, whole: a substring check passed with `|| true`
  // appended, which turns a failing shard green and so `harnesses` with it.
  // Every line that names the runner counts, a `run: |` block's included, with
  // or without `.js`.
  const SHARD = '--shard $(( ${{ strategy.job-index }} + 1 ))/${{ strategy.job-total }}';
  const bare = (l) => /["'\\]/.test(l) ? l : l.replace(/\s#.*$/, '');
  const runnerAt = ymlLines.map((l, i) => [l, i]).filter(([l]) => !isComment(l) && /run_checks\b/.test(bare(l)));
  const jobOf = (i) => { for (let j = i; j >= 0; j--) { const m = /^  ([\w-]+):\s*$/.exec(ymlLines[j]); if (m) return m[1]; } return null; };
  const want = [['pre', 'pre', ''], ['center-point', 'pre', ''], ['sources', 'sources', ` ${SHARD}`], ['compiled', 'compiled', ` ${SHARD}`]]
    .map(([phase, job, tail]) => [phase, job, `        run: node tools/run_checks.js --level ci --phase ${phase}${tail}`]);
  for (const [phase, job, line] of want) {
    const at = runnerAt.find(([l]) => l === line);
    ok(`CI runs phase ${phase} through the runner, and its exit code alone decides the step${tail(phase)}`, !!at, runnerAt.map(([l]) => l));
    ok(`phase ${phase} runs in the ${job} job, which harnesses waits for`, !!at && jobOf(at[1]) === job, at && jobOf(at[1]));
    // A plain YAML value folds a more-indented next line into itself, so
    // `|| true` there would join the command. After a blank line such text
    // becomes a new script line, which `bash -e` never reaches once the runner
    // has failed; the pin above refuses it anyway.
    const next = at ? ymlLines.slice(at[1] + 1).find(l => !isComment(l)) : undefined;
    ok(`nothing continues phase ${phase}'s run line`, next === '', next);
  }
  function tail(phase) { return phase === 'sources' || phase === 'compiled' ? ", split by the job's index" : ''; }
  ok('no other line calls the runner', runnerAt.length === 4, runnerAt.map(([l]) => l));
  // A step or job `if:` could skip a runner step and leave its job green; the
  // gate's `if: always()` is the only one, in any spelling of the key.
  const ifs = ymlLines.filter(l => !isComment(l) && /^\s*(?:-\s+)?["']?if["']?\s*:/.test(l));
  ok('the only if: in the workflow is the gate\'s always()', JSON.stringify(ifs) === JSON.stringify(['    if: always()']), ifs);
  // `shell: true {0}` would run `true <script>` and end every step green.
  ok('no shell: or defaults: anywhere', !/^\s*(?:-\s+)?["']?(?:shell|defaults)["']?\s*:/m.test(yml));
  ok('CI has no harness loop of its own', !/for f in test\/verify-/.test(yml));
  ok('CI calls no check directly', !/node tools\/ci_bans\.js|cmp index\.html|node tools\/build\.mjs|node --test test\//.test(yml));
  ok('the job name the branch rule requires is unchanged', /^  harnesses:/m.test(yml));
  // The gate job, whole and literal, to the end of the file (its live lines, so
  // a comment in it may change). A substring check passed with `|| true`,
  // `continue-on-error`, or COMPILED bound to the sources result.
  const GATE = [
    '  harnesses:',
    '    needs: [pre, sources, compiled]',
    '    if: always()',
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 5',
    '    steps:',
    '      - name: Every job above passed',
    '        env:',
    '          PRE: ${{ needs.pre.result }}',
    '          SOURCES: ${{ needs.sources.result }}',
    '          COMPILED: ${{ needs.compiled.result }}',
    '        run: |',
    '          echo "pre: $PRE, sources: $SOURCES, compiled: $COMPILED"',
    '          test "$PRE" = success && test "$SOURCES" = success && test "$COMPILED" = success',
  ];
  const gateAt = live.indexOf('  harnesses:');
  ok('harnesses waits for every job, runs after a failure or a cancel, and is green only when each one passed',
    gateAt >= 0 && JSON.stringify(live.slice(gateAt)) === JSON.stringify(GATE), gateAt >= 0 ? live.slice(gateAt) : 'no harnesses job');
  ok('no step anywhere may fail without failing its job', !/continue-on-error/.test(yml));
  const concAt = live.indexOf('concurrency:');
  ok('a PR\'s older run is cancelled; each push to main has its own group', concAt >= 0 && JSON.stringify(live.slice(concAt, concAt + 3)) === JSON.stringify([
    'concurrency:',
    "  group: test-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.run_id }}",
    '  cancel-in-progress: true',
  ]), concAt >= 0 && live.slice(concAt, concAt + 3));
  ok('a push to main still runs CI, the post-merge check', /push:\n(\s+#.*\n)*\s+branches: \[main\]/.test(yml));
  const settings = JSON.parse(read('.claude/settings.json'));
  const stop = settings.hooks.Stop[0].hooks[0].command;
  ok('the Stop hook calls the runner in hook mode', /run_checks\.js/.test(stop) && /--level stop/.test(stop) && /--hook/.test(stop), stop);
  const pre = read('.githooks/pre-commit');
  ok('the pre-commit hook calls the runner', /tools\/run_checks\.js --level commit/.test(pre), pre);
  ok('the hook is LF, or sh on this PC cannot read its first line', !pre.includes('\r') || /\.githooks\/\* text eol=lf/.test(read('.gitattributes')));
  ok('.githooks is never published', /^\.githooks\/$/m.test(read('.assetsignore')));
  ok('AGENTS.md names the one command', /node tools\/run_checks\.js/.test(read('AGENTS.md')));
}

// ── #7 ──────────────────────────────────────────────────────────────────────
console.log('\n── #7 shards cover a phase exactly once ──');
{
  const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const files = Object.fromEntries(tags.map(t => [`test/verify-${t}.cjs`, PASSES(t)]));
  const cfg = base([chk('a', 'clinical', 'test/verify-a.cjs'), chk('rest', 'app', 'test/verify-*.cjs')]);
  const root = fixture(files, cfg);
  const shares = [];
  for (const k of [1, 2, 3]) {
    fs.rmSync(path.join(root, 'mark'), { force: true });
    const r = run(root, ['--level', 'ci', '--phase', 'sources', '--shard', `${k}/3`]);
    shares.push(marks(root));
    if (k === 2) ok('the report names the share', new RegExp(`shard 2/3: ${shares[1].length} of 7 steps`).test(r.out), r.out);
  }
  const all = shares.flat();
  ok('three shares run every step', JSON.stringify([...all].sort()) === JSON.stringify(tags), shares);
  ok('and no step twice', new Set(all).size === all.length, shares);
  ok('no share is empty', shares.every(s => s.length > 0), shares);
  fs.rmSync(path.join(root, 'mark'), { force: true });
  run(root, ['--level', 'ci', '--phase', 'sources', '--shard', '1/1']);
  ok('1/1 is the whole phase', marks(root).sort().join() === tags.join(), marks(root));

  // A heavy step goes first onto an empty share and gets it to itself.
  const heavy = fixture(files, { ...cfg, shard_seconds: { about: 'x', sources: { 'verify-c.cjs': 100 } } });
  const outs = [];
  const got = [1, 2, 3].map(k => {
    fs.rmSync(path.join(heavy, 'mark'), { force: true });
    outs.push(run(heavy, ['--level', 'ci', '--phase', 'sources', '--shard', `${k}/3`]).out);
    return marks(heavy);
  });
  ok('a step shard_seconds calls heavy runs alone', got.some(s => s.join() === 'c'), got);
  // Its hint is refreshed from this line, so it is listed however fast it ran.
  ok('a hinted step is on the slowest: line even under 10 s', outs.some(o => /slowest: verify-c\.cjs \d s/.test(o)), outs);
  ok('an unhinted step under 10 s is not', outs.every(o => !/slowest:.*verify-[abdefg]\.cjs/.test(o)), outs);
  ok('the other shares still cover the rest once', JSON.stringify(got.flat().sort()) === JSON.stringify(tags), got);

  const bad = (name, args, config, re) => {
    const r = run(fixture(files, config || cfg), args);
    ok(name, r.code === 2 && re.test(r.out), r);
  };
  bad('a share past the count is refused', ['--level', 'ci', '--phase', 'sources', '--shard', '4/3'], null, /--shard/);
  bad('share 0 is refused', ['--level', 'ci', '--phase', 'sources', '--shard', '0/3'], null, /--shard/);
  bad('a share that is not K/N is refused', ['--level', 'ci', '--phase', 'sources', '--shard', 'two'], null, /--shard/);
  bad('--shard with no value is refused, not read as the whole phase', ['--level', 'ci', '--phase', 'sources', '--shard'], null, /--shard/);
  bad('a share needs one phase', ['--level', 'ci', '--shard', '1/2'], null, /--phase/);
  bad('a share is for CI only', ['--level', 'commit', '--phase', 'sources', '--shard', '1/2', '--changed', 'x.txt'], null, /--level ci/);
  bad('shard_seconds for an unknown phase is refused', ['--level', 'ci'], { ...cfg, shard_seconds: { nope: {} } }, /shard_seconds/);
  bad('a hint that is not seconds is refused', ['--level', 'ci'], { ...cfg, shard_seconds: { sources: { 'verify-c.cjs': 'slow' } } }, /shard_seconds/);
}

for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
