// Safety regressions found in the 2026-08-27 clinician/nurse/TPN review.
//
// These checks deliberately stay source-level and dependency-free. The
// calculation engine already has mounted-component/worksheet harnesses; the
// defects here are workflow guardrails that can disappear through a one-line
// UI change even while every arithmetic assertion remains green.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const calc = read('calculator.jsx');
const app = read('app.jsx');
const data = read('data.js');
const html = read('index.html');
const htmlTwin = read('NeoFeed.html');

let pass = 0, fail = 0;
function ok(name, condition) {
  const yes = !!condition;
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${name}`);
  yes ? pass++ : fail++;
}

console.log('\n── electrolyte input cannot encode a negative dose ──');
const salt = calc.slice(calc.indexOf('function SaltRow'), calc.indexOf('function Calculator'));
ok('SaltRow strips every character except digits and one decimal point',
  /replace\(\/\[\^0-9\.\]\/g,\s*["']\s*["']\)/.test(salt));
ok('SaltRow does not allow a minus sign', !/0-9\.\\-/.test(salt));

console.log('\n── critical alerts remain visible ──');
ok('alerts are ordered by clinical severity', /function sortClinicalAlerts\(/.test(calc));
ok('the alert panel does not truncate to four items', !/alerts\.slice\(0,\s*4\)/.test(calc));
ok('Ca plus inorganic phosphate raises a compatibility warning',
  /calcium.phosphate compatibility not calculated/i.test(calc));

console.log('\n── a back-fill never starts from a future order ──');
ok('app owns a previous-entry selector', /function previousLogEntry\(/.test(app));
ok('CalculatorView selects its baseline relative to the target date',
  /previousLogEntry\(log\[activeId\]\s*\|\|\s*\[\],\s*lockDate\)/.test(app));
ok('a dated back-fill does not restore an unrelated local draft',
  /if\s*\(!logDate\)\s*\{\s*try\s*\{\s*const raw = localStorage\.getItem/.test(calc));

console.log('\n── printed treatment date and product guidance ──');
ok('PrintOrderForm receives the clinical order date',
  /orderDate=\{editEntry\?\.ts\s*\|\|\s*logDate\s*\|\|\s*D\.todayLocal\(\)\}/.test(calc));
ok('the form labels a formatted order date, not always today',
  /const orderDateLabel\s*=/.test(calc) && /วันที่ให้ TPN:[^\n]*orderDateLabel/.test(calc));
ok('print and copy require a successfully saved entry',
  /if\s*\(!savedEntryId\)[\s\S]{0,180}ก่อนพิมพ์/.test(calc) &&
  /if\s*\(!savedEntryId\)[\s\S]{0,180}ก่อนคัดลอก/.test(calc));
// Tightened 2026-09-11 (review F2): saved is not enough — the form must still
// MATCH what was saved. verify-review-0911.cjs drives this in jsdom.
ok('the print form renders only while the form matches the saved row',
  /const printable\s*=\s*!!savedEntryId\s*&&\s*!dirty/.test(calc) &&
  /\{printable\s*&&\s*<PrintOrderForm/.test(calc) &&
  /if\s*\(!printable\)[\s\S]{0,160}ก่อนพิมพ์/.test(calc) &&
  /if\s*\(!printable\)[\s\S]{0,160}ก่อนคัดลอก/.test(calc));
ok('Peditrace guidance is 1 mL/kg/day (maximum 15 mL)',
  /Peditrace[^\n]*1 mL\/kg\/day[^\n]*max(?:imum)? 15 mL/i.test(data) &&
  !/Peditrace[^\n]*1[–-]2 mL\/kg\/day/i.test(data + '\n' + app));

console.log('\n── deploy-shell consistency ──');
ok('the two hand-synced HTML shells remain byte-identical', html === htmlTwin);

console.log('\n── failed measurement writes do not remain on screen ──');
ok('an unsuccessful updateWeights request rolls the optimistic value back',
  /action:\s*["']updateWeights["'][\s\S]{0,500}p\.weights\s*===\s*weights[\s\S]{0,180}previousWeights/.test(app));

console.log(`\nSAFETY REVIEW: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
