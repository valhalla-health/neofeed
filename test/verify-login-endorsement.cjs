// verify-login-endorsement.cjs — the Valhalla endorsement on the login screen, shown once.
//
// Praew, 2026-09-22, in two steps:
//   1. "ปรับเป็น logo ข้างบน แล้ว by Valhalla Health ข้างล่าง ไม่ต้องมี version 2.0" — no
//      version line on the login screen.
//   2. "Can I remove V logo below login page. Only show by valhalla team เราใส่อะไรที่ดูเป็น
//      ลิขสิทธิไปด้วยได้? @2026?" — the Guardian V goes, and the foot reads, on one line,
//      "by Valhalla Health · © 2026" (the wording she chose from three).
// Then 2026-09-23: the new logo carries "by VALHALLA HEALTH" under its rule, as her artwork
// draws it. The endorsement is shown once, so the foot keeps only "© 2026".
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
const app = read('app.jsx');
const block = /<div className="login-contact">[\s\S]*?\n {6}<\/div>\n/.exec(app)?.[0] || '';
ok('the endorsement block exists', block.includes('className="login-endorse"'), block.slice(0, 200));
// What a reader sees: tags dropped, &nbsp; read as the space it renders as.
const text = block.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
ok('it reads "© 2026", on one line', text === '© 2026', text);
// The endorsement moved up into the logo: the login hero is the full lockup,
// which draws "by VALHALLA HEALTH" and is announced with it.
ok('the login hero is the lockup, which carries the endorsement',
  /<NeoFeedWordmark className="login-app-name" lockup \/>/.test(app)
  && /aria-label=\{lockup \? "NeoFeed by Valhalla Health" : "NeoFeed"\}/.test(app));
ok('…so the foot does not say it a second time', !/Valhalla/i.test(text), text);
ok('the Guardian V is gone from the login screen', !/<img\b/.test(block) && !app.includes('valhalla-guardian-v.png'), block);
ok('no version line on the login screen', !/V ?2\.0|login-footer/.test(block), block);

for (const shell of ['NeoFeed.html', 'index.html']) {
  console.log(`\n── ${shell} ──`);
  const css = read(shell);
  ok("the Guardian V's CSS went with it", !/\.login-endorse img\b/.test(css));
  ok('…and nothing points at its image', !css.includes('valhalla-guardian-v.png'));
  ok('the .login-footer rule went with the version line', !/\.login-footer\b/.test(css));
}

console.log('\n── icons/ ──');
ok('the raster stand-in is no longer shipped', !fs.existsSync(path.join(__dirname, '..', 'icons', 'valhalla-guardian-v.png')));

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
