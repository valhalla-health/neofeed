// verify-check-deployments.cjs — tools/check-deployments.mjs, the gate before a backend
// release (Pp, 2026-11-03: must be 2 deployments only; if more, stop).
//
// CI has no clasp, so everything here feeds the tool a saved list. The IDs other than
// production's are made up. The gate's one dangerous failure is a pass it should not give:
//   #1 pass    exactly @HEAD and production
//   #2 more    any third deployment stops, including what a plain `clasp deploy` leaves
//   #3 pair    two rows that are not those two stop
//   #4 unread  a list it cannot read stops, never passes
//   #5 boot    production's ID comes from boot.js, and no ID means no answer
//   #6 cli     exit codes, and the output never prints another deployment's whole ID
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'check-deployments.mjs');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail)}`);
  cond ? pass++ : fail++;
};

const PROD = 'AKfycbPRODUCTIONproductionPRODUCTIONproduction0123456789';
const HEAD_ID = 'AKfycbHEADheadHEADheadHEADheadHEADheadHEADhead012345678';
const OLD_ID = 'AKfycbOLDoldOLDoldOLDoldOLDoldOLDoldOLDoldOLDoldOLD01234';
const NEW_ID = 'AKfycbNEWnewNEWnewNEWnewNEWnewNEWnewNEWnewNEWnewNEW01234';
const row = (id, version, note = '') => `- ${id} @${version}${note ? ' - ' + note : ' '}`;
const list = (...rows) => [`Found ${rows.length} deployments.`, ...rows].join('\n') + '\n';

(async () => {
  const { checkDeployments, productionIdFrom } = await import(pathToFileURL(TOOL).href);
  const check = text => checkDeployments(text, PROD);

  console.log('\n── #1 exactly the two ──');
  const good = check(list(row(HEAD_ID, 'HEAD'), row(PROD, 66, 'PR #200 revisions')));
  ok('1.0 @HEAD and production pass', good.ok === true, good);
  ok('1.1 the pass names production\'s version', /@66/.test(good.summary), good.summary);
  ok('1.2 row order does not matter', check(list(row(PROD, 66), row(HEAD_ID, 'HEAD'))).ok === true);

  console.log('\n── #2 more than two stops ──');
  const old = check(list(row(HEAD_ID, 'HEAD'), row(OLD_ID, 5), row(PROD, 66)));
  ok('2.0 an old deployment stops the release', old.ok === false, old);
  ok('2.1 the stop names it by version', old.problems.some(p => p.includes('@5')), old.problems);
  ok('2.2 what a plain `clasp deploy` leaves stops the release',
    check(list(row(HEAD_ID, 'HEAD'), row(PROD, 66), row(NEW_ID, 67))).ok === false);
  ok('2.3 the same ID listed twice is not two deployments',
    check(list(row(PROD, 66), row(PROD, 66))).ok === false);

  console.log('\n── #3 two rows, the wrong two ──');
  ok('3.0 production missing stops', check(list(row(HEAD_ID, 'HEAD'), row(OLD_ID, 5))).ok === false);
  ok('3.1 @HEAD missing stops', check(list(row(OLD_ID, 5), row(PROD, 66))).ok === false);
  const onHead = check(list(row(PROD, 'HEAD'), row(OLD_ID, 5)));
  ok('3.2 production itself on @HEAD stops', onHead.ok === false, onHead);

  console.log('\n── #4 a list it cannot read ──');
  ok('4.0 an empty reply stops', check('').ok === false);
  ok('4.1 "no deployments" stops', check('No deployments.\n').ok === false);
  ok('4.2 clasp\'s sign-in error stops', check('Error: No credentials found.\n').ok === false);
  ok('4.3 a count that disagrees with the rows stops',
    check(['Found 3 deployments.', row(HEAD_ID, 'HEAD'), row(PROD, 66)].join('\n')).ok === false);
  ok('4.4 rows with no count line stop', check([row(HEAD_ID, 'HEAD'), row(PROD, 66)].join('\n')).ok === false);

  console.log('\n── #5 production\'s ID ──');
  const boot = fs.readFileSync(path.join(ROOT, 'boot.js'), 'utf8');
  const live = productionIdFrom(boot);
  ok('5.0 boot.js names a production deployment', /^AKfycb[\w-]{40,}$/.test(live), live);
  ok('5.1 a comment that quotes another URL is not the ID',
    productionIdFrom(`// NEOFEED_GAS_URL was once "https://script.google.com/macros/s/${OLD_ID}/exec"\nwindow.NEOFEED_GAS_URL = "https://script.google.com/macros/s/${PROD}/exec";`) === PROD);
  let threw = false;
  try { productionIdFrom('// NEOFEED_GAS_URL is also named in _headers\nwindow.NEOFEED_GAS_URL = "http://127.0.0.1:8000/gas";'); } catch (e) { threw = true; }
  ok('5.2 a boot.js with no production URL throws', threw);

  console.log('\n── #6 the command ──');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neofeed-deployments-'));
  const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });
  const saved = (name, text) => { const p = path.join(dir, name); fs.writeFileSync(p, text); return p; };
  try {
    const pass2 = run('--from', saved('two.txt', list(row(HEAD_ID, 'HEAD'), row(live, 66))));
    ok('6.0 two: exit 0', pass2.status === 0, pass2.stdout + pass2.stderr);
    const stop = run('--from', saved('three.txt', list(row(HEAD_ID, 'HEAD'), row(OLD_ID, 5), row(live, 66))));
    ok('6.1 three: exit 1', stop.status === 1, stop.stdout + stop.stderr);
    ok('6.2 the stop says stop', /STOP/.test(stop.stdout + stop.stderr), stop.stdout);
    ok('6.3 the output never prints the other deployment\'s whole ID',
      !(stop.stdout + stop.stderr).includes(OLD_ID), stop.stdout);
    const unread = run('--dir', path.join(dir, 'no-such-folder'));
    ok('6.4 clasp cannot run: not exit 0', unread.status !== 0 && unread.status !== null, unread.status);
    ok('6.5 …and it does not say OK', !/\bOK\b/.test(unread.stdout + unread.stderr), unread.stdout);
    const bad = run('--from');
    ok('6.6 a flag with no value: not exit 0', bad.status !== 0, bad.status);

    // A stand-in clasp on PATH, so the path through the real command runs in CI too.
    const reply = list(row(HEAD_ID, 'HEAD'), row(live, 66));
    fs.writeFileSync(path.join(dir, 'reply.txt'), reply);
    const fakeClasp = (code) => {
      fs.writeFileSync(path.join(dir, 'clasp'), `#!/bin/sh\ncat "$(dirname "$0")/reply.txt"\nexit ${code}\n`, { mode: 0o755 });
      fs.writeFileSync(path.join(dir, 'clasp.cmd'), `@type "%~dp0reply.txt"\r\n@exit /b ${code}\r\n`);
      return spawnSync(process.execPath, [TOOL, '--dir', dir], {
        encoding: 'utf8',
        env: { ...process.env, PATH: dir + path.delimiter + process.env.PATH },
      });
    };
    const fine = fakeClasp(0);
    ok('6.7 clasp answers with the two: exit 0, says OK', fine.status === 0 && /\bOK\b/.test(fine.stdout), fine.stdout + fine.stderr);
    const failed = fakeClasp(1);
    ok('6.8 clasp prints the two but exits 1: exit 2, not OK',
      failed.status === 2 && !/\bOK\b/.test(failed.stdout + failed.stderr), failed.stdout + failed.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n${fail === 0 ? 'CHECK-DEPLOYMENTS: ALL PASS' : `CHECK-DEPLOYMENTS: ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
