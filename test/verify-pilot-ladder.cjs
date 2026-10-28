// verify-pilot-ladder.cjs — NF-05, the pilot ladder (REFERENCE.md § The pilot ladder).
//
// A release runs on the `pilot` branch's preview for 48 h before it reaches the
// ward. Two pieces of code carry that, and this pins both:
//   #1 boot.js § 3  the pilot host, and only the pilot host, talks to the pilot
//                   deployment; with no pilot deployment set it uses the ward's;
//                   a lookalike hostname never gets the pilot
//   #2 tools/release-gate.mjs  a release PR passes only from `pilot`, on the
//                   commit the pilot ran, 48 h after it started, with the
//                   rollback target named and every box ticked
//   #3 the workflow and the template it reads: the PR body reaches the script
//                   as an environment variable, and the unfilled template fails
//                   on every line it should
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 400)}`);
  cond ? pass++ : fail++;
};

const PILOT_HOST = 'pilot-neofeed.valhalla-health.workers.dev';
const PILOT_URL = 'https://script.google.com/macros/s/AKfycbPILOTverifyladder/exec';

// boot.js as the browser runs it, on one hostname. Storage is a stub: only the
// GitHub Pages guard touches it, and no host here is GitHub Pages.
function runBoot(src, hostname) {
  const store = { getItem: () => null, setItem() {}, removeItem() {} };
  const window = { location: { hostname, replace() {} } };
  const ctx = { window, localStorage: store, sessionStorage: store, Object };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return window;
}

(async () => {
  const boot = read('boot.js');
  const ward = (boot.match(/window\.NEOFEED_GAS_URL\s*=\s*"([^"]+)"/) || [])[1];
  const filled = boot.replace(/window\.NEOFEED_PILOT_GAS_URL\s*=\s*"[^"]*";/, `window.NEOFEED_PILOT_GAS_URL = "${PILOT_URL}";`);

  console.log('\n── #1 boot.js: which backend each host talks to ──');
  ok('1.0 (boot.js names the ward deployment, and the pilot line is there to fill)',
    /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(ward || '') && filled !== boot, ward);
  ok('1.1 the pilot deployment is empty until Pp creates it', /window\.NEOFEED_PILOT_GAS_URL\s*=\s*"";/.test(boot));
  for (const host of ['neofeed.valhalla-health.workers.dev', PILOT_HOST, '127.0.0.1']) {
    ok(`1.2 empty pilot, ${host}: the ward's backend`, runBoot(boot, host).NEOFEED_GAS_URL === ward);
  }
  ok('1.3 pilot set, the pilot host: the pilot deployment', runBoot(filled, PILOT_HOST).NEOFEED_GAS_URL === PILOT_URL);
  ok('1.4 …also with a trailing dot', runBoot(filled, PILOT_HOST + '.').NEOFEED_GAS_URL === PILOT_URL);
  ok('1.5 pilot set, the ward host: still the ward', runBoot(filled, 'neofeed.valhalla-health.workers.dev').NEOFEED_GAS_URL === ward);
  for (const host of [
    PILOT_HOST + '.evil.example', 'evil-' + PILOT_HOST, 'nf05-pilot-ladder-neofeed.valhalla-health.workers.dev',
    'main-neofeed.valhalla-health.workers.dev', 'localhost',
  ]) {
    ok(`1.6 pilot set, ${host}: the ward, never the pilot`, runBoot(filled, host).NEOFEED_GAS_URL === ward);
  }
  const keys = Object.keys(runBoot(filled, PILOT_HOST)).sort();
  ok('1.7 boot.js adds no window name but the client ID and the two backend URLs',
    JSON.stringify(keys) === JSON.stringify(['NEOFEED_CLIENT_ID', 'NEOFEED_GAS_URL', 'NEOFEED_PILOT_GAS_URL', 'location']), keys);

  console.log('\n── #2 tools/release-gate.mjs ──');
  const { checkReleasePr, PILOT_HOURS } = await import(pathToFileURL(path.join(ROOT, 'tools', 'release-gate.mjs')).href);
  const template = read('.github/PULL_REQUEST_TEMPLATE/release.md');
  const SHA = '0123456789abcdef0123456789abcdef01234567';
  const now = new Date('2026-11-02T10:00:00+07:00');
  const fill = (hoursAgo, body = template) => {
    const at = new Date(now.getTime() - hoursAgo * 3_600_000 + 7 * 3_600_000).toISOString();
    return body
      .replace('`<sha>` <!--', '`0123456789ab` <!--')
      .replace('YYYY-MM-DD HH:MM ICT', `${at.slice(0, 10)} ${at.slice(11, 16)} ICT`)
      .replace('`release-YYYY-MM-DD-prNN` (`<sha>`)', '`release-2026-10-21-pr167` (`08c298d`)')
      .replace('`AKfycbz8…` at `@<n>`', '`AKfycbz8…` at `@64`')
      .replace('#<N>: <what the ward sees>', '#170: the route is pressed, never assumed')
      .replace('unchanged / `<old>` → `<new>`', 'unchanged')
      .replace('unchanged / ward `@<old>` → `@<new>`', 'unchanged')
      .replace('Pp, <fellow>', 'Pp, the pilot fellow')
      .replace('pilot deployment at `@<n>`', 'pilot deployment at `@64`')
      .replace('(what was tried: <…>)', '(what was tried: a TPN order for NICU 1)')
      .replace('at least <N> orders', 'at least 5 orders')
      .replace(/- \[ \]/g, '- [x]');
  };
  const good = { base: 'release', head: 'pilot', headSha: SHA, now };
  ok(`2.0 PILOT_HOURS is 48`, PILOT_HOURS === 48);
  const passed = checkReleasePr({ ...good, body: fill(49) });
  ok('2.1 the filled template, 49 h after the pilot started: passes', passed.ok, passed.problems);
  const at48 = checkReleasePr({ ...good, body: fill(48) });
  ok('2.2 …at exactly 48 h: passes', at48.ok, at48.problems);
  const at47 = checkReleasePr({ ...good, body: fill(47.5) });
  ok('2.3 …at 47 h 30 min: fails, saying how long it has run',
    !at47.ok && at47.problems.length === 1 && /has run 47 h of 48/.test(at47.problems[0]), at47.problems);
  const fromMain = checkReleasePr({ ...good, head: 'main', body: fill(49) });
  ok('2.4 a release PR from main fails, naming pilot', !fromMain.ok && /comes from pilot/.test(fromMain.problems.join('\n')), fromMain.problems);
  const moved = checkReleasePr({ ...good, headSha: 'fedcba9876543210fedcba9876543210fedcba98', body: fill(49) });
  ok('2.5 pilot pushed since the start (head ≠ pilot commit): fails', !moved.ok && /restarts the 48 h/.test(moved.problems.join('\n')), moved.problems);
  const future = checkReleasePr({ ...good, body: fill(-2) });
  ok('2.6 a start time in the future fails', !future.ok && /in the future/.test(future.problems.join('\n')), future.problems);
  const noTag = checkReleasePr({ ...good, body: fill(49).replace('release-2026-10-21-pr167', 'the last release') });
  ok('2.7 a rollback target with no release tag fails', !noTag.ok && /no release tag/.test(noTag.problems.join('\n')), noTag.problems);
  const noVer = checkReleasePr({ ...good, body: fill(49).replace('`AKfycbz8…` at `@64`', '`AKfycbz8…` at the current version') });
  ok('2.8 a rollback target with no backend version fails', !noVer.ok && /no backend version/.test(noVer.problems.join('\n')), noVer.problems);
  const oneOpen = fill(49).replace('- [x] No help request', '- [ ] No help request');
  const open = checkReleasePr({ ...good, body: oneOpen });
  ok('2.9 one unticked box fails, naming it', !open.ok && open.problems.length === 1 && /not ticked: No help request/.test(open.problems[0]), open.problems);
  const commented = checkReleasePr({ ...good, body: fill(49) + '\n<!--\n- [ ] an example inside a comment\n-->\n' });
  ok('2.10 a box inside an HTML comment is not a box', commented.ok, commented.problems);
  const crlf = checkReleasePr({ ...good, body: fill(49).replace(/\n/g, '\r\n') });
  ok('2.11 CRLF line ends read the same', crlf.ok, crlf.problems);
  const sneaky = checkReleasePr({ ...good, body: fill(49) + '\n- [ ] ::add-mask::x\n' });
  ok('2.12 an unticked line is echoed with no "::" left, so it cannot start a workflow command',
    !sneaky.ok && sneaky.problems.every(p => !p.includes('::')), sneaky.problems);
  const wrongBase = checkReleasePr({ ...good, base: 'main', body: fill(49) });
  ok('2.13 a PR into another branch is not a release PR', !wrongBase.ok && /not release/.test(wrongBase.problems[0]), wrongBase.problems);
  // Vera, 2026-10-28: the Cloudflare rollback picks a version by its commit, and a
  // body with a field left as <…> had passed.
  const noCommit = checkReleasePr({ ...good, body: fill(49).replace('(`08c298d`)', '(the one before)') });
  ok('2.14 a rollback target with a tag but no commit fails', !noCommit.ok
    && noCommit.problems.some(p => /Frontend line names no commit/.test(p)), noCommit.problems);
  const fellow = checkReleasePr({ ...good, body: fill(49).replace('Pp, the pilot fellow', 'Pp, <fellow>') });
  ok('2.15 a field left as <fellow> fails, naming it', !fellow.ok && fellow.problems.length === 1
    && /placeholder left: <fellow>/.test(fellow.problems[0]), fellow.problems);
  const linked = checkReleasePr({ ...good, body: fill(49) + '\nSee <https://github.com/valhalla-health/neofeed/pull/172>.\n' });
  ok('2.16 a link in angle brackets is not a placeholder', linked.ok, linked.problems);

  console.log('\n── #3 the workflow, and the template unfilled ──');
  const wf = read('.github/workflows/release-gate.yml');
  ok('3.0 it runs on PRs into release, again on every edit of the body',
    /pull_request:\s*\n\s*branches:\s*\[release\]/.test(wf) && /types:\s*\[[^\]]*\bedited\b[^\]]*\]/.test(wf), wf.slice(0, 200));
  ok('3.1 the body reaches the script as an environment variable', /PR_BODY:\s*\$\{\{\s*github\.event\.pull_request\.body\s*\}\}/.test(wf));
  ok('3.2 …and never inside a run: command', !wf.split(/\r?\n/).some(l => /run:/.test(l) && /\$\{\{/.test(l)));
  ok('3.3 it is not pull_request_target, so a PR\'s code runs with no secrets', !/pull_request_target/.test(wf));
  const blank = checkReleasePr({ ...good, body: template });
  const said = blank.problems.join('\n');
  ok('3.4 the unfilled template fails on the commit, the start, the tag, the version, the boxes and the <…> fields',
    !blank.ok && /Pilot commit/.test(said) && /Pilot started/.test(said) && /no release tag/.test(said)
    && /no backend version/.test(said) && /not ticked:/.test(said) && /placeholder left/.test(said), blank.problems);
  const boxes = (template.match(/^- \[ \]/gm) || []).length;
  ok('3.5 the template has its checklist (side by side, pilot, promotion)', boxes >= 16, boxes);
  const sideBySide = (template.split(/^## Side by side/m)[1] || '').split(/^## /m)[0];
  ok('3.7 "Side by side" asks about Script Properties and the stale value a rewritten row leaves (Vera, 2026-10-28)',
    /^- \[ \].*Script Propert/m.test(sideBySide) && /^- \[ \].*rewrites the row/m.test(sideBySide), sideBySide.slice(0, 300));
  ok('3.6 REFERENCE.md has the runbook the template points at', /^### The pilot ladder/m.test(read('REFERENCE.md')));

  console.log(`\n${fail === 0 ? 'PILOT LADDER (NF-05): ALL PASS' : `PILOT LADDER (NF-05): ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
