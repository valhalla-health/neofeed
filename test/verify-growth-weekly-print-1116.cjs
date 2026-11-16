// verify-growth-weekly-print-1116.cjs — Sunday's length and head circumference,
// and the growth charts on paper (2026-11-16).
//
// Pp, 2026-11-16: "ทุกเช้าวันอาทิตย์ตามเวลาประเทศไทย ให้เมื่อเข้าชื่อผู้ป่วย ให้เด้งหน้าไปกรอก
// HC and length weekly ด้วยเลย", and "ให้มีปุ่ม ปริ้นท กราฟที่ plot fenton ออกมาได้ด้วย".
// Her answers: doctors and nurses both; all of Sunday, Bangkok time, until the
// day has both values; it can be put off and then asks again the next time the
// patient is opened; all three charts print in one go, under the printed
// order's patient block.
//
//   data     isSundayBangkok at the two midnights, and the same answers in a
//            child process whose device zone is UTC and Los Angeles;
//            growthOnDol reads both stores; weeklyGrowthDue by role, status,
//            test patient, no bed, and one value or both.
//   sunday   a doctor on a Sunday opens a patient and lands on the growth page
//            with the banner; "ไว้ทีหลัง" goes to the log; opening again asks
//            again; one value keeps it asking for the other; both end it.
//   picker   the patient picker asks too; from the quick calc it does not.
//   monday   the same doctor on a Monday lands on the log, with no banner.
//   nurse    a nurse on a Sunday is asked too.
//   admin    an admin on a Sunday is not.
//   print    the พิมพ์กราฟ button calls window.print; the print sheet is three
//            pages (weight, length, HC), each with the patient block and one
//            chart with no control in it; and both shells carry each print
//            rule. How the pages look on paper it cannot show.
//
// Made-up infants only. Same dev-only dependencies as the other jsdom
// harnesses (test/README.md).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { boot, runScenarios, mkPatient, DOCTOR, DIR } = require('./review-0917-boot.cjs');

const HOUR = 3600e3, DAY = 24 * HOUR;
// Milliseconds from now to the next Sunday 09:00 in Bangkok (today's, if it is
// Sunday before 09:00), and to the Monday after it.
const toSunday9 = () => {
  const bkk = new Date(Date.now() + 7 * HOUR);
  const sinceMidnight = bkk.getUTCHours() * HOUR + bkk.getUTCMinutes() * 60e3 + bkk.getUTCSeconds() * 1e3 + bkk.getUTCMilliseconds();
  let days = (7 - bkk.getUTCDay()) % 7;
  if (days === 0 && sinceMidnight > 9 * HOUR) days = 7;
  return days * DAY + 9 * HOUR - sinceMidnight;
};

const AA = () => mkPatient({ sessionId: 'NF-100001', name: 'AA', initials: 'AA', ga: 30.1, bw: 1200, currentBed: 'NICU 1' });
const BB = () => mkPatient({ sessionId: 'NF-100002', name: 'BB', initials: 'BB', ga: 31.0, bw: 1400, currentBed: 'NICU 2', sex: 'girls' });

async function setup({ offset, session = DOCTOR } = {}) {
  const t = boot({ patients: [AA(), BB()], log: {}, session });
  t.quiet();
  t.printed = 0;
  t.window.print = () => { t.printed++; };
  if (offset) t.clock.advance(offset);
  await t.start();
  t.onGrowth = () => /Fenton 2025 growth chart/.test(t.window.document.querySelector('.page-head h1')?.textContent || '');
  t.banner = () => t.window.document.querySelector('.growth-due');
  // Back to the ward list (the registry keeps the ward it was on), then the row.
  t.open = async (re) => {
    await t.rail(/Patients/);
    if ([...t.window.document.querySelectorAll('.ward-tile')].some(b => b.textContent.startsWith('NICU'))) await t.pickWard('NICU');
    await t.openPatientRow(re);
  };
  // The measurement boxes of the growth page's logger, by their label.
  t.box = (label) => [...t.window.document.querySelectorAll('.card .field')]
    .find(f => (f.querySelector('label')?.textContent || '').trim().startsWith(label))?.querySelector('input');
  t.saveMeasurement = async (vals) => {
    for (const [label, v] of Object.entries(vals)) await t.typeInto(t.box(label), v);
    await t.click(t.btn(/Save measurement/));
    for (let i = 0; i < 4; i++) await t.flush();
  };
  return t;
}

runScenarios(__filename, 'GROWTH: SUNDAY PROMPT + PRINT (2026-11-16)', {
  async 'data'(A) {
    console.log('\n── data.js: the day, the two stores, who is asked ──');
    const sandbox = { window: {}, console, Intl, Date };
    vm.runInNewContext(fs.readFileSync(DIR + 'data.js', 'utf8'), sandbox);
    const D = sandbox.window.NEOFEED_DATA;
    const utc = (...a) => Date.UTC(...a);
    // 2026-11-15 is a Sunday. Bangkok midnight is 17:00 UTC the day before.
    A.eq('Saturday 23:59:59 in Bangkok is not Sunday', D.isSundayBangkok(utc(2026, 10, 14, 16, 59, 59)), false);
    A.eq('Sunday 00:00:00 in Bangkok is Sunday', D.isSundayBangkok(utc(2026, 10, 14, 17, 0, 0)), true);
    A.eq('Sunday 23:59:59 in Bangkok is Sunday', D.isSundayBangkok(utc(2026, 10, 15, 16, 59, 59)), true);
    A.eq('Monday 00:00:00 in Bangkok is not', D.isSundayBangkok(utc(2026, 10, 15, 17, 0, 0)), false);
    A.eq('a Date is taken as well as a number', D.isSundayBangkok(new Date(utc(2026, 10, 15, 3, 0, 0))), true);
    const days = [0, 1, 2, 3, 4, 5, 6].map(n => D.isSundayBangkok(utc(2026, 10, 15 + n, 3, 0, 0)));
    A.eq('one day in seven', days, [true, false, false, false, false, false, false]);

    // The device's own time zone must not matter: the same four instants, asked
    // in a child process set to UTC and to Los Angeles.
    const probe = `const vm=require('vm');const s={window:{},console,Intl,Date};vm.runInNewContext(require('fs').readFileSync(process.argv[1],'utf8'),s);`
      + `const D=s.window.NEOFEED_DATA;const u=(...a)=>Date.UTC(...a);`
      + `console.log(JSON.stringify([D.isSundayBangkok(u(2026,10,14,16,59,59)),D.isSundayBangkok(u(2026,10,14,17,0,0)),D.isSundayBangkok(u(2026,10,15,16,59,59)),D.isSundayBangkok(u(2026,10,15,17,0,0))]))`;
    for (const tz of ['UTC', 'America/Los_Angeles']) {
      const r = spawnSync(process.execPath, ['-e', probe, DIR + 'data.js'], { encoding: 'utf8', env: { ...process.env, TZ: tz } });
      // CI runs node with test/compiled-loader.cjs preloaded, and it writes a
      // '[compiled-loader] ...' line to stdout as the child exits: keep only the probe's line.
      const out = (r.stdout || '').split(/\r?\n/).filter(l => l && !l.startsWith('[compiled-loader]')).join('\n');
      A.eq(`the two Bangkok midnights, on a device set to ${tz}`, out, '[false,true,true,false]');
    }

    const p = (over) => ({ sessionId: 'NF-1', status: 'Active', currentBed: 'NICU 1', dob: D.todayLocal(), admissionDate: D.todayLocal(), weights: [], lengths: [], hcs: [], ...over });
    const dol = D.liveDol(p({}));
    A.eq('growthOnDol: nothing recorded', D.growthOnDol(p({}), dol), { length: false, hc: false });
    A.eq('growthOnDol: the separate stores', D.growthOnDol(p({ lengths: [{ dol, v: 40 }], hcs: [{ dol, v: 28 }] }), dol), { length: true, hc: true });
    A.eq('growthOnDol: a weights row carrying l and hc', D.growthOnDol(p({ weights: [{ dol, w: 1200, l: 40, hc: 28 }] }), dol), { length: true, hc: true });
    A.eq('growthOnDol: another day does not count', D.growthOnDol(p({ weights: [{ dol: dol + 1, w: 1200, l: 40, hc: 28 }], lengths: [{ dol: dol + 7, v: 40 }] }), dol), { length: false, hc: false });
    A.eq('growthOnDol: null, blank and 0 are not values', D.growthOnDol(p({ weights: [{ dol, w: 1200, l: null, hc: '' }], hcs: [{ dol, v: 0 }] }), dol), { length: false, hc: false });
    A.eq('growthOnDol: a null row in a store is skipped', D.growthOnDol(p({ weights: [null, { dol, l: 40 }] }), dol), { length: true, hc: false });

    const SUN = utc(2026, 10, 15, 3, 0, 0), MON = utc(2026, 10, 16, 3, 0, 0);
    A.eq('due: a doctor, Sunday, nothing recorded', D.weeklyGrowthDue(p({}), 'doctor', SUN), true);
    A.eq('due: a nurse too', D.weeklyGrowthDue(p({}), 'nurse', SUN), true);
    A.eq('not due: an admin', D.weeklyGrowthDue(p({}), 'admin', SUN), false);
    A.eq('not due: the pharmacy role', D.weeklyGrowthDue(p({}), 'pharmacy', SUN), false);
    A.eq('not due: Monday', D.weeklyGrowthDue(p({}), 'doctor', MON), false);
    A.eq('due: only the length is in', D.weeklyGrowthDue(p({ lengths: [{ dol, v: 40 }] }), 'doctor', SUN), true);
    A.eq('due: only the head circumference is in', D.weeklyGrowthDue(p({ hcs: [{ dol, v: 28 }] }), 'doctor', SUN), true);
    A.eq('not due: both are in', D.weeklyGrowthDue(p({ weights: [{ dol, w: 1200, l: 40, hc: 28 }] }), 'doctor', SUN), false);
    A.eq('due: both are in, but on another day', D.weeklyGrowthDue(p({ weights: [{ dol: dol + 1, l: 40, hc: 28 }] }), 'doctor', SUN), true);
    A.eq('not due: a discharged infant', D.weeklyGrowthDue(p({ status: 'Discharged' }), 'doctor', SUN), false);
    A.eq('(the test prefix is TEST-)', D.TEST_SESSION_PREFIX, 'TEST-');
    A.eq('not due: a test patient', D.weeklyGrowthDue(p({ sessionId: 'TEST-NF-1' }), 'doctor', SUN), false);
    A.eq('(an Active record with no bed is read-only)', D.isReadOnlyOther(p({ currentBed: '' })), true);
    A.eq('not due: no bed in the system, so nothing could be saved', D.weeklyGrowthDue(p({ currentBed: '' }), 'doctor', SUN), false);
    A.eq('not due: both are in on a DOL stored as text, which still counts as today', D.weeklyGrowthDue(p({ weights: [{ dol: String(dol), l: 40, hc: 28 }] }), 'doctor', SUN), false);
    A.eq('not due: no patient', D.weeklyGrowthDue(null, 'doctor', SUN), false);
    // No DOL anchor: liveDol falls back to the last stored row, where the growth
    // page files too, so the prompt stops once that row carries both values.
    const noAnchor = (rows) => p({ dob: '', admissionDate: '', weights: rows });
    A.eq('(with no anchor, today is the last stored row)', D.liveDol(noAnchor([{ dol: 5, w: 1200 }])), 5);
    A.eq('no DOL anchor, the last row lacks a head circumference: due', D.weeklyGrowthDue(noAnchor([{ dol: 5, l: 40 }]), 'doctor', SUN), true);
    A.eq('no DOL anchor, the last row has both: not due', D.weeklyGrowthDue(noAnchor([{ dol: 5, l: 40, hc: 28 }]), 'doctor', SUN), false);
  },

  async 'sunday'(A) {
    console.log('\n── a doctor on a Sunday ──');
    const t = await setup({ offset: toSunday9() });
    A.ok('(the clock is on a Sunday in Bangkok)', t.D().isSundayBangkok(Date.now()));
    await t.open(/AA/);
    A.ok('opening AA lands on the growth page', t.onGrowth());
    A.ok('the banner asks for the weekly Length and HC', !!t.banner() && /วันอาทิตย์/.test(t.banner().textContent) && /Length และ HC/.test(t.banner().textContent));
    A.ok('the banner has a "ไว้ทีหลัง" button', !!t.btn(/ไว้ทีหลัง/, t.banner()));

    await t.click(t.btn(/ไว้ทีหลัง/, t.banner()));
    A.ok('"ไว้ทีหลัง" goes to the patient\'s log', /Daily nutritional log/.test(t.bodyText()) && !t.onGrowth());
    A.eq('…and the banner is not on that page', t.banner(), null);

    await t.open(/AA/);
    A.ok('opening AA again asks again', t.onGrowth() && !!t.banner());

    await t.saveMeasurement({ Length: 40 });
    A.ok('with the length in, the banner stays', !!t.banner());
    A.ok('…and now asks for HC only', /ยังไม่มี HC ของ/.test(t.banner().textContent) && !/Length และ HC ของ/.test(t.banner().textContent));
    A.eq('…the save reached the backend once', t.callsOf('updateWeights').length, 1);

    await t.open(/AA/);
    A.ok('opening AA with only a length still lands on the growth page', t.onGrowth() && !!t.banner());

    await t.saveMeasurement({ HC: 27.5 });
    A.eq('with both in, the banner is gone', t.banner(), null);
    A.ok('…and the page stays on the growth chart', t.onGrowth());
    await t.open(/AA/);
    A.ok('opening AA after both are in lands on the log', !t.onGrowth() && /Daily nutritional log/.test(t.bodyText()));
    await t.open(/BB/);
    A.ok('BB, not yet measured, is still asked', t.onGrowth() && !!t.banner());
  },

  async 'picker'(A) {
    console.log('\n── the patient picker on a Sunday ──');
    const t = await setup({ offset: toSunday9() });
    const doc = t.window.document;
    const pick = async (re) => {
      await t.click(doc.querySelector('.switch-patient'));
      await t.click([...doc.querySelectorAll('.picker-row')].find(r => re.test(r.textContent)));
    };
    await pick(/BB/);
    A.ok('a pick from the ward list lands on the growth page with the banner', t.onGrowth() && !!t.banner());
    await t.click(t.btn(/ไว้ทีหลัง/, t.banner()));
    await t.rail(/Calculator/);
    A.ok('(on the Calculator, a patient page)', !t.onGrowth());
    await pick(/AA/);
    A.ok('a pick from a patient page goes to the growth page too', t.onGrowth() && !!t.banner());

    // The quick calc keeps its typed figures: a pick there changes nothing on screen.
    await t.rail(/Patients/);
    await t.click(doc.querySelector('.quick-fab'));                      // the ward gate's quick-calc button
    A.ok('(on the quick calc)', /ไม่ผูกกับผู้ป่วย/.test(t.bodyText()));
    await pick(/BB/);
    A.ok('a pick from the quick calc stays on the quick calc', /ไม่ผูกกับผู้ป่วย/.test(t.bodyText()) && !t.onGrowth() && t.banner() === null);
  },

  async 'monday'(A) {
    console.log('\n── the same doctor on a Monday ──');
    const t = await setup({ offset: toSunday9() + DAY });
    A.ok('(the clock is not on a Sunday)', !t.D().isSundayBangkok(Date.now()));
    await t.open(/AA/);
    A.ok('opening AA lands on the log', !t.onGrowth() && /Daily nutritional log/.test(t.bodyText()));
    await t.rail(/Growth chart/);
    A.ok('the growth page, opened by hand, has no banner', t.onGrowth() && t.banner() === null);
  },

  async 'nurse'(A) {
    console.log('\n── a nurse on a Sunday ──');
    const t = await setup({ offset: toSunday9(), session: { ...DOCTOR, role: 'nurse', name: 'Nurse Test', email: 'nurse@test.th' } });
    await t.open(/AA/);
    A.ok('a nurse lands on the growth page with the banner', t.onGrowth() && !!t.banner());
  },

  async 'admin'(A) {
    console.log('\n── an admin on a Sunday ──');
    const t = await setup({ offset: toSunday9(), session: { ...DOCTOR, role: 'admin', name: 'Admin Test', email: 'admin@test.th' } });
    await t.open(/AA/);
    A.ok('an admin lands on the log', !t.onGrowth());
    await t.rail(/Growth chart/);
    A.eq('…and sees no banner on the growth page', t.banner(), null);
  },

  async 'print'(A) {
    console.log('\n── the growth charts on paper ──');
    const t = await setup({ offset: toSunday9() + DAY });
    await t.open(/AA/);
    await t.rail(/Growth chart/);
    const doc = t.window.document;
    await t.saveMeasurement({ Length: 40, HC: 27.5 });

    const printBtn = t.btn(/พิมพ์กราฟ/);
    A.ok('the chart card has a พิมพ์กราฟ button', !!printBtn && !!printBtn.closest('.card'));
    await t.click(printBtn);
    A.eq('…which calls window.print once', t.printed, 1);

    const sheet = doc.querySelector('.growth-print');
    A.ok('the print sheet is on the page, a direct child of the work area', !!sheet && sheet.parentElement.classList.contains('work-inner'));
    const pages = [...sheet.querySelectorAll(':scope > .growth-print-page')];
    A.eq('it is three pages: weight, length, HC', pages.map(pg => pg.getAttribute('data-metric')), ['weight', 'length', 'hc']);
    A.eq('each page has one patient block and one chart', pages.map(pg => [pg.querySelectorAll('.growth-print-id').length, pg.querySelectorAll('.growth-print-chart').length]), [[1, 1], [1, 1], [1, 1]]);
    A.eq('every page names the infant and the NeoFeed ID', pages.map(pg => /ชื่อ: AA/.test(pg.textContent) && /NeoFeed ID: NF-100001/.test(pg.textContent)), [true, true, true]);
    const charts = [...sheet.querySelectorAll('.growth-print-chart')];
    A.eq('the three charts are fixed on weight, length, HC', charts.map(c => c.getAttribute('data-metric')), ['weight', 'length', 'hc']);
    A.eq('each has a drawn chart', charts.map(c => !!c.querySelector('svg path')), [true, true, true]);
    A.eq('no chart in it is a .card (the print stylesheet hides those)', sheet.querySelectorAll('.card').length, 0);
    A.eq('no Save measurement box in it', [...sheet.querySelectorAll('button')].filter(b => /Save measurement|Update measurement/.test(b.textContent)).length, 0);
    A.eq('no พิมพ์กราฟ button in it', [...sheet.querySelectorAll('button')].filter(b => /พิมพ์กราฟ/.test(b.textContent)).length, 0);
    const idText = sheet.querySelector('.growth-print-id').textContent;
    A.ok('the patient block names the infant and the NeoFeed ID', /ชื่อ: AA/.test(idText) && /NeoFeed ID: NF-100001/.test(idText));
    A.ok('…leaves boxes for HN and AN', /HN: _{10,}/.test(idText) && /AN: _{10,}/.test(idText));
    A.ok('…and carries bed, GA at birth, sex, birth weight and the print date', /ตึก: NICU 1/.test(idText) && /GA แรกเกิด: 30\+1/.test(idText) && /เพศ: Male/.test(idText) && /1200 g/.test(idText) && /วันที่พิมพ์: \d{4}-\d{2}-\d{2}/.test(idText));

    // Each printed chart reads what the screen chart reads for that measure.
    const screenCard = printBtn.closest('.card');
    const readoutOf = (el) => el.querySelector('.fenton-trajectory')?.children[1]?.textContent.trim();
    const tab = async (label) => { await t.click([...screenCard.querySelectorAll('.seg button')].find(b => b.textContent.trim() === label)); };
    const onScreen = {};
    for (const [label, key] of [['Weight', 'weight'], ['Length', 'length'], ['HC', 'hc']]) { await tab(label); onScreen[key] = readoutOf(screenCard); }
    const onPaper = Object.fromEntries(charts.map(c => [c.getAttribute('data-metric'), readoutOf(c)]));
    A.ok('(the screen reads a percentile for length and HC)', /th|rd|st|nd/.test(onScreen.length || '') && /th|rd|st|nd/.test(onScreen.hc || ''));
    A.eq('each printed chart shows its own measure (the readout the screen gives for it)', onPaper, onScreen);
    A.ok('…and the three readouts are not all the same', new Set(Object.values(onPaper)).size > 1);
    A.eq('switching tabs on screen leaves the printed three as they were', charts.map(c => c.getAttribute('data-metric')), ['weight', 'length', 'hc']);

    // The print rules, in both shells.
    for (const shell of ['index.html', 'NeoFeed.html']) {
      const css = fs.readFileSync(path.join(DIR, shell), 'utf8');
      // The print block alone: from its opening to its closing brace.
      const from = css.indexOf('@media print {');
      const print = css.slice(from, css.indexOf('\n  }', from));
      A.ok(`${shell}: (the print block was found, and it ends)`, from > 0 && print.length > 500 && print.length < 20000);
      A.ok(`${shell}: nothing in the print block hides a page of the sheet`, !/\.growth-print-page[^{}]*\{[^}]*display:\s*none/.test(print));
      A.ok(`${shell}: the sheet is hidden on screen`, /\n  \.growth-print \{ display: none; \}/.test(css.slice(0, css.indexOf('@media print {'))));
      A.ok(`${shell}: on paper the sheet shows and the rest of the work area hides`,
        print.includes('.work-inner > :not(#print-form):not(.print-batch):not(.growth-print)') && print.includes('.growth-print { display: block !important;'));
      A.ok(`${shell}: the tabs and zoom buttons do not print`, /\.growth-print \.fenton-ctrl, \.growth-print \.fenton-zoom \{ display: none !important; \}/.test(print));
      A.ok(`${shell}: each chart after the first starts a new page`, print.includes('.growth-print-page + .growth-print-page { break-before: page; page-break-before: always; }'));
      A.ok(`${shell}: a page, and the chart in it, is not split`, print.includes('.growth-print-page, .growth-print-chart { break-inside: avoid; page-break-inside: avoid; }'));
      A.ok(`${shell}: the legend prints as one row`, print.includes('.growth-print .legend { flex-direction: row !important; flex-wrap: wrap; justify-content: flex-end; gap: 4px 14px !important; }'));
      A.ok(`${shell}: the chart takes the page's width, its panel under it`, print.includes('.growth-print-chart svg { max-width: 100% !important; }') && print.includes('.growth-print .fenton-grid { grid-template-columns: 1fr !important; }'));
      A.ok(`${shell}: colours print as drawn`, /\.growth-print \{ display: block !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; \}/.test(print));
      A.ok(`${shell}: the order form's own print rules are still there`, print.includes('#print-form { display: block !important; }') && print.includes('.print-batch, .print-batch-sheet { display: block !important; }'));
    }
  },
});
