// verify-login-endorsement.cjs — the Valhalla endorsement under the login form.
//
// Praew, 2026-09-22: "ปรับเป็น logo ข้างบน แล้ว by Valhalla Health ข้างล่าง ไม่ต้องมี
// version 2.0" — the Guardian V stacked above "by Valhalla Health", and no
// version line on the login screen.
//
// Source-level, like verify-quick-calc.cjs § 7: it reads app.jsx and both
// hand-synced shells, CRLF-normalised so a Windows checkout reads what CI reads.
// No dependencies: node test/verify-login-endorsement.cjs
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 300)}`);
  cond ? pass++ : fail++;
}

console.log('\n── the login screen ──');
const block = /<div className="login-contact">[\s\S]*?\n {6}<\/div>\n/.exec(read('app.jsx'))?.[0] || '';
ok('the endorsement block exists', block.includes('className="login-endorse"'), block.slice(0, 200));
const mark = block.indexOf('valhalla-guardian-v.png'), words = block.indexOf('by Valhalla');
ok('the Guardian V comes first, "by Valhalla Health" after it', mark !== -1 && words > mark, { mark, words });
ok('no version line on the login screen', !/V ?2\.0|login-footer/.test(block), block);

for (const shell of ['NeoFeed.html', 'index.html']) {
  console.log(`\n── ${shell} ──`);
  const css = read(shell);
  const rule = /\.login-endorse\s*\{([^}]*)\}/.exec(css)?.[1] || '';
  ok('the endorsement stacks: a centred column', /flex-direction:\s*column/.test(rule) && /align-items:\s*center/.test(rule), rule);
  ok('the .login-footer rule went with the version line', !/\.login-footer\b/.test(css));
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
