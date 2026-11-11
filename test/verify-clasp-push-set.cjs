// verify-clasp-push-set.cjs — clasp pushes the backend from this repo (Pp, 2026-11-11),
// so the repo root is both the Apps Script project and the frontend's asset directory.
//   #1 push set   .claspignore lets through gas-backend.gs and appsscript.json, nothing else
//   #2 project    .clasp.json names the live project, from the repo root, no subdirectories
//   #3 manifest   appsscript.json keeps the settings production depends on
//   #4 hosts      neither web host publishes the clasp files
// CI has no clasp; #1 re-implements its ignore rule for these few lines and is checked
// against the real `clasp status` by hand at each deploy (REFERENCE.md § Backend (GAS)).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail)}`);
  cond ? pass++ : fail++;
};

console.log('── #1 push set ──');
const rules = read('.claspignore').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
ok('the first rule ignores everything', rules[0] === '**/**', rules);
const allowed = rules.slice(1).map(r => r.replace(/^!/, ''));
ok('every later rule re-includes a file', rules.slice(1).every(r => r.startsWith('!')), rules);
ok('exactly gas-backend.gs and appsscript.json are re-included',
  JSON.stringify(allowed.slice().sort()) === JSON.stringify(['appsscript.json', 'gas-backend.gs']), allowed);
ok('both re-included files exist', allowed.every(f => fs.existsSync(path.join(ROOT, f))), allowed);

console.log('── #2 project ──');
const clasp = JSON.parse(read('.clasp.json'));
ok('scriptId is the live NeoFeed project', clasp.scriptId === '1L7JOyDZ1skvskBd_MDHtqI9rcKZMtOvyBqowFDzKnJFdFdtePZGa_ZTR', clasp.scriptId);
ok('rootDir is the repo root', clasp.rootDir === '' || clasp.rootDir === '.', clasp.rootDir);
ok('subdirectories are skipped', clasp.skipSubdirectories === true, clasp.skipSubdirectories);
ok('no credentials in the repo', !fs.existsSync(path.join(ROOT, '.clasprc.json')));

console.log('── #3 manifest ──');
const m = JSON.parse(read('appsscript.json'));
ok('timeZone is Asia/Bangkok', m.timeZone === 'Asia/Bangkok', m.timeZone);
ok('executeAs is USER_DEPLOYING', m.webapp && m.webapp.executeAs === 'USER_DEPLOYING', m.webapp);
ok('runtime is V8', m.runtimeVersion === 'V8', m.runtimeVersion);
for (const s of ['spreadsheets', 'script.external_request', 'script.send_mail']) {
  ok(`scope ${s} is listed`, (m.oauthScopes || []).includes('https://www.googleapis.com/auth/' + s), m.oauthScopes);
}

console.log('── #4 hosts ──');
const assets = read('.assetsignore').split(/\r?\n/).map(l => l.trim());
for (const f of ['appsscript.json', '.clasp.json', '.claspignore']) {
  ok(`Cloudflare does not publish ${f}`, assets.includes(f), f);
}
ok('GitHub Pages does not publish appsscript.json (Jekyll skips the dotfiles)',
  /^\s*-\s*appsscript\.json\s*$/m.test(read('_config.yml')));

console.log(`\nCLASP PUSH SET: ${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
