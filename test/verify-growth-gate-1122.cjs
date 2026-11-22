// verify-growth-gate-1122.cjs — Sunday's length and head circumference hold the
// TPN order (Pp, 2026-11-22).
//
// Pp: "แก้ไขให้หมอยังต้องไปกรอก HC and length weekly ด้วย ยังไงก็ได้ ถ้าไม่กรอก submit
// และพิมพ์ ไม่ได้". Her answers the same day: Sunday only; a reason the infant cannot
// be measured unlocks it, kept with the order (calcInput.growthSkip) and not
// printed; the app holds it and sends stop CR-GROWTH-WEEKLY, no backend check of
// its own; only the order dated that Sunday is held. Then: "ให้วัดทุกวันอาทิตย์ ที่
// HC and length ล่าสุดมากกว่า 6 วัน คืออาทิตย์ต่อไป": a value of the last 6 days counts,
// so an infant admitted and measured on Saturday is not asked again on Sunday.
//
//   data      the 6-day window (growthSince, weeklyGrowthMissing), and the growth
//             page's prompt (weeklyGrowthDue) reading it
//   print     on a Sunday the ward print list and Print order hold an order whose
//             infant has no length or HC this week, and say why; an infant measured
//             today, or admitted and measured on Saturday, prints; last Sunday's
//             values (7 days old) are not this week's
//   refused   Submit asks for a reason; Cancel or a blank reason saves nothing
//   reason    a reason saves with the order, without the stop, and unlocks Print;
//             the printed sheet does not carry it
//   values    the line's button opens the growth page; with both values saved,
//             Print goes and Submit asks nothing
//   weekday   the same infant on a Monday: Print goes, Submit asks nothing
//   older     Saturday's order reprinted on the Sunday is not held
//   printall  Print ทั้งหมด leaves the held orders out and lists why
//   nurse     a nurse's I/O Submit is not asked and sends no stop; her Print is held
//   nurse-ro  with the nursing switch on (a nurse's orders read-only), her line has
//             no Submit wording and her Print is held (Vera's second review)
//   new       a brand-new Sunday order submitted with a reason: logDailyNutrition
//             carries it and no stop (Vera's second review)
//   revision  a reason on a locked order: one prompt, the stored critical-value
//             reason kept, revision 2, and the line says to phone the TPN room
//             (Pp, after Vera: "ฉบับใหม่ + บอกให้โทร")
//
// Drives the real <App/> through review-0917-boot on a Sunday reached with
// clock.advance, as verify-growth-weekly-print-1116.cjs does. Made-up infants only.
const fs = require('fs');
const vm = require('vm');
const { boot, runScenarios, mkPatient, DIR } = require('./review-0917-boot.cjs');

const HOUR = 3600e3, DAY = 24 * HOUR;
// Milliseconds from now to the next Sunday 09:00 in Bangkok (today's, if it is
// Sunday before 09:00). review-0917-boot runs a real Sunday as the Monday, so
// this is always at least a few hours ahead.
const toSunday9 = () => {
  const bkk = new Date(Date.now() + 7 * HOUR);
  const sinceMidnight = bkk.getUTCHours() * HOUR + bkk.getUTCMinutes() * 60e3 + bkk.getUTCSeconds() * 1e3 + bkk.getUTCMilliseconds();
  let days = (7 - bkk.getUTCDay()) % 7;
  if (days === 0 && sinceMidnight > 9 * HOUR) days = 7;
  return days * DAY + 9 * HOUR - sinceMidnight;
};
const bkkDate = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(ms));
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const CONSTANTS_VERSION = fs.readFileSync(DIR + 'data.js', 'utf8').match(/const CONSTANTS_VERSION = "([^"]+)"/)[1];
// A submitted order whose figures reproduce on reload (verify-ward-print-1012.cjs's).
const CI = { curWtG: 900, fluidTargetPerKg: 150, otherIV_mL: 0, drug_mL: 0, ioInput: 130, ioOutput: 60, drainContent: 0,
  totalTPN_mL: 110, dexPct: 12.5, aaPerKg: 3, lipidPerKg: 3, naCl: 2, kCl: 1, caPerKg: 60, glycophosP: 1, constantsVersion: CONSTANTS_VERSION };
const order = (entryId, ts, dol) => ({ entryId, lastModified: ts + 'T02:00:00.000Z', ts, dol,
  weight: 900, ioInput: 130, ioOutput: 60, drainContent: 0, status: 'submitted', calcInput: { ...CI } });

// The four infants, on day `day` (YYYY-MM-DD): DOL 10 for AA, BB and DD; CC was
// born and admitted the day before, so it is DOL 2.
function ward(day) {
  const born = addDays(day, -9);
  return {
    patients: [
      mkPatient({ sessionId: 'AA-1', name: 'AA', initials: 'AA', currentBed: 'NICU 1', dob: born, admissionDate: born }),
      mkPatient({ sessionId: 'BB-1', name: 'BB', initials: 'BB', currentBed: 'NICU 2', dob: born, admissionDate: born,
        lengths: [{ dol: 10, v: 36 }], hcs: [{ dol: 10, v: 26 }] }),
      mkPatient({ sessionId: 'CC-1', name: 'CC', initials: 'CC', currentBed: 'NICU 3', dob: addDays(day, -1), admissionDate: addDays(day, -1),
        weights: [{ dol: 1, w: 900, l: 35, hc: 25.5 }] }),
      mkPatient({ sessionId: 'DD-1', name: 'DD', initials: 'DD', currentBed: 'NICU 4', dob: born, admissionDate: born,
        lengths: [{ dol: 3, v: 35.5 }], hcs: [{ dol: 3, v: 25.5 }] }),
    ],
    log: {
      'AA-1': [order('e-aa', day, 10)], 'BB-1': [order('e-bb', day, 10)],
      'CC-1': [order('e-cc', day, 2)], 'DD-1': [order('e-dd', day, 10)],
    },
  };
}

const NURSE = { name: 'Nurse N', role: 'nurse', email: 'n@test.th', token: 'tok-nurse-abcdefg', authMethod: 'password' };

async function setup({ offset = toSunday9(), prompt = () => null, logFor = null, session, nursingOn = false } = {}) {
  const day = bkkDate(Date.now() + offset);
  const { patients, log } = ward(day);
  if (logFor) Object.assign(log, logFor(day));
  const t = boot(session ? { patients, log, session } : { patients, log });
  t.quiet();
  t.day = day;
  t.printed = 0;
  t.window.print = () => { t.printed++; };
  t.asked = [];
  t.window.prompt = (msg) => { t.asked.push(String(msg)); return prompt(String(msg)); };
  // The backend's nursing switch: the sync payload carries a `nursing` map (app.jsx nursingLive).
  if (nursingOn) t.server.hooks.getActivePatients = () => ({ after: (data) => { data.nursing = {}; } });
  t.clock.advance(offset);
  await t.start();
  const doc = t.window.document;
  t.settle = async (n = 6) => { for (let i = 0; i < n; i++) await t.flush(); };
  t.printButton = () => [...doc.querySelectorAll('.ward-gate .ward-print')][0];
  t.printRow = (name) => [...doc.querySelectorAll('.print-row')].find(r => r.querySelector('.pr-name')?.textContent === name);
  // Open an infant's order from the ward's Print order list, as the ward does on
  // the day: its automatic print goes, or the hold reason comes after 1.5 s.
  t.openFromList = async (name) => {
    await t.rail(/Patients/);
    if (t.btn(/เปลี่ยน ward/)) await t.click(t.btn(/เปลี่ยน ward/));
    await t.click(t.printButton());
    await t.click(t.printRow(name));
    await t.settle();
    await t.flush(1700);
    await t.settle();
  };
  // Print order on the page, waiting for the print or a refusal toast.
  t.pressPrint = async () => {
    const before = t.printed, toastsBefore = t.toasts().length;
    await t.click(t.btn(/^\s*Print order\s*$/));
    for (let i = 0; i < 80 && t.printed === before && t.toasts().length === toastsBefore; i++) await t.flush(25);
    return t.printed - before;
  };
  t.submit = async () => { await t.click(t.btn(/^\s*Submit\s*$/)); await t.settle(); };
  t.gateLine = () => doc.querySelector('.growth-gate');
  t.skipLine = () => doc.querySelector('.growth-gate-skip');
  t.updates = () => t.callsOf('updateDailyNutrition');
  return t;
}

runScenarios(__filename, 'GROWTH GATE ON THE TPN ORDER (2026-11-22)', {
  async 'data'(A) {
    console.log('\n── data.js: the 6-day window ──');
    const sandbox = { window: {}, console, Intl, Date };
    vm.runInNewContext(fs.readFileSync(DIR + 'data.js', 'utf8'), sandbox);
    const D = sandbox.window.NEOFEED_DATA;
    const SUN = Date.UTC(2026, 10, 15, 3, 0, 0), MON = Date.UTC(2026, 10, 16, 3, 0, 0);
    A.eq('(the window is 6 days)', D.GROWTH_FRESH_DAYS, 6);
    // No DOB or admission date: today is the last weights row, DOL 12.
    const p = (over) => ({ sessionId: 'NF-1', status: 'Active', currentBed: 'NICU 1', weights: [{ dol: 12, w: 1200 }], lengths: [], hcs: [], ...over });
    const both = (dol) => ({ lengths: [{ dol, v: 40 }], hcs: [{ dol, v: 28 }] });
    A.eq('growthSince: DOL 6 to 12 holds DOL 6', D.growthSince(p(both(6)), 6, 12), { length: true, hc: true });
    A.eq('growthSince: …and not DOL 5', D.growthSince(p(both(5)), 6, 12), { length: false, hc: false });
    A.eq('growthSince: a weights row carrying l and hc', D.growthSince(p({ weights: [{ dol: 8, l: 40, hc: 28 }, { dol: 12, w: 1200 }] }), 6, 12), { length: true, hc: true });
    A.eq('growthOnDol still means that one DOL', D.growthOnDol(p(both(6)), 12), { length: false, hc: false });
    A.eq('Sunday, nothing: both missing', D.weeklyGrowthMissing(p({}), SUN), { dol: 12, missing: ['Length', 'HC'] });
    A.eq('Sunday, both 6 days ago: nothing due', D.weeklyGrowthMissing(p(both(6)), SUN), null);
    A.eq('Sunday, both 7 days ago (last Sunday): both due', D.weeklyGrowthMissing(p(both(5)), SUN), { dol: 12, missing: ['Length', 'HC'] });
    A.eq('each on its own: length this week, HC last week', D.weeklyGrowthMissing(p({ lengths: [{ dol: 9, v: 40 }], hcs: [{ dol: 5, v: 28 }] }), SUN), { dol: 12, missing: ['HC'] });
    A.eq('a value from a future DOL does not count', D.weeklyGrowthMissing(p(both(13)), SUN), { dol: 12, missing: ['Length', 'HC'] });
    A.eq('Monday: nothing due', D.weeklyGrowthMissing(p({}), MON), null);
    A.eq('the growth page prompt reads the window: not due at 6 days', D.weeklyGrowthDue(p(both(6)), 'doctor', SUN), false);
    A.eq('…due at 7', D.weeklyGrowthDue(p(both(5)), 'doctor', SUN), true);
    A.eq('held: the order dated that Sunday', D.sundayGrowthHolds(p({}), '2026-11-15', null, SUN), true);
    A.eq('not held: an order dated Saturday', D.sundayGrowthHolds(p({}), '2026-11-14', null, SUN), false);
    A.eq('not held: a reason for DOL 12', D.sundayGrowthHolds(p({}), '2026-11-15', { reason: 'on HFOV', dol: 12 }, SUN), false);
    A.eq('held: a reason for DOL 5', D.sundayGrowthHolds(p({}), '2026-11-15', { reason: 'on HFOV', dol: 5 }, SUN), true);
    A.eq('held: a blank reason', D.sundayGrowthHolds(p({}), '2026-11-15', { reason: ' ', dol: 12 }, SUN), true);
    A.eq('not held: a reason for another DOL given that Sunday (a DOB corrected since)',
      D.sundayGrowthHolds(p({}), '2026-11-15', { reason: 'on HFOV', dol: 9, at: '2026-11-15T02:00:00.000Z' }, SUN), false);
    A.eq('held: a reason for another DOL given the Sunday before',
      D.sundayGrowthHolds(p({}), '2026-11-15', { reason: 'on HFOV', dol: 5, at: '2026-11-08T02:00:00.000Z' }, SUN), true);
    A.eq('held: a reason whose time cannot be read', D.sundayGrowthHolds(p({}), '2026-11-15', { reason: 'on HFOV', dol: 5, at: 'x' }, SUN), true);
    // An older child's ward is not asked (isNewbornUnit). OLDER_CHILD_WARDS is empty
    // today, so a ward is put on it in a copy of data.js for this case only.
    const src = fs.readFileSync(DIR + 'data.js', 'utf8');
    const anchor = 'const OLDER_CHILD_WARDS = Object.freeze([]);';
    A.ok('(OLDER_CHILD_WARDS is empty in data.js)', src.includes(anchor));
    const sb2 = { window: {}, console, Intl, Date };
    vm.runInNewContext(src.replace(anchor, 'const OLDER_CHILD_WARDS = Object.freeze(["SCN"]);'), sb2);
    const D2 = sb2.window.NEOFEED_DATA;
    A.eq('an older child\'s ward: nothing due, nothing held', [D2.weeklyGrowthMissing(p({ currentBed: 'SCN 1' }), SUN), D2.sundayGrowthHolds(p({ currentBed: 'SCN 1' }), '2026-11-15', null, SUN)], [null, false]);
    A.eq('…a newborn ward in the same copy still is', D2.sundayGrowthHolds(p({}), '2026-11-15', null, SUN), true);
  },

  async 'print'(A) {
    console.log('\n── a Sunday: Print ──');
    const t = await setup();
    A.ok('(the clock is on a Sunday in Bangkok)', t.D().isSundayBangkok(Date.now()) && t.D().todayLocal() === t.day);
    await t.openFromList('AA');
    A.ok('AA\'s order is open', /แก้ไขบันทึกโภชนาการ/.test(t.text()));
    A.eq('AA (no length or HC this week): the print list\'s print does not go', t.printed, 0);
    A.ok('…and says why', t.toasts().some(m => /วันอาทิตย์ยังไม่มี Length และ HC ของสัปดาห์นี้/.test(m)), t.toasts());
    A.ok('the save panel says Submit and Print are held', !!t.gateLine() && /Submit และพิมพ์ไม่ได้/.test(t.gateLine().textContent));
    A.ok('…and offers the growth page', !!t.btn(/ไปกรอก Length \/ HC/, t.gateLine()));
    A.eq('Print order on the page does not print either', await t.pressPrint(), 0);
    A.ok('…its toast names what is missing', t.toasts().some(m => /Growth chart หรือ Submit ใหม่พร้อมเหตุผล/.test(m)));
    await t.openFromList('BB');
    A.eq('BB (both measured today): prints', t.printed, 1);
    A.eq('…with no line', t.gateLine(), null);
    await t.openFromList('CC');
    A.eq('CC (admitted and measured yesterday, Saturday): prints', t.printed, 2);
    await t.openFromList('DD');
    A.eq('DD (last measured last Sunday, 7 days ago): held', t.printed, 2);
    A.ok('…the same line', !!t.gateLine());
  },

  async 'refused'(A) {
    console.log('\n── a Sunday: Submit with no reason ──');
    let answer = null;
    const t = await setup({ prompt: () => answer });
    await t.openFromList('AA');
    const submitBtn = t.btn(/^\s*Submit\s*$/);
    A.ok('Submit is offered on the locked, unchanged order', !!submitBtn && !submitBtn.disabled);
    await t.submit();
    A.eq('Submit asks once', t.asked.length, 1);
    A.ok('…naming what is missing and that the reason is not printed', /ยังไม่มี Length และ HC/.test(t.asked[0]) && /ไม่พิมพ์ลงใบสั่ง/.test(t.asked[0]));
    A.eq('Cancel: nothing is saved', t.updates().length + t.callsOf('logDailyNutrition').length, 0);
    A.eq('…nothing is locked either', t.callsOf('publishDailyLog').length, 0);
    A.ok('…and a toast says why', t.toasts().some(m => /ยังไม่ได้ Submit — วันอาทิตย์ต้องมี Length และ HC/.test(m)));
    answer = '   ';
    await t.submit();
    A.eq('a blank reason: asked again, still nothing saved', [t.asked.length, t.updates().length], [2, 0]);
    A.eq('…and Print still holds', await t.pressPrint(), 0);
  },

  async 'reason'(A) {
    console.log('\n── a Sunday: Submit with a reason ──');
    const t = await setup({ prompt: () => 'on HFOV' });
    await t.openFromList('AA');
    await t.submit();
    A.eq('one save went', t.updates().length, 1);
    const ci = t.updates()[0]?.entry?.calcInput || {};
    A.eq('…carrying the reason for today\'s DOL', [ci.growthSkip?.reason, ci.growthSkip?.dol], ['on HFOV', 10]);
    A.ok('…without the stop', Array.isArray(ci.stops) && !ci.stops.includes('CR-GROWTH-WEEKLY'), ci.stops);
    await t.openFromList('AA');
    A.eq('reopened from the list: it prints', t.printed, 1);
    A.ok('the page shows the reason', /วันนี้ไม่ได้วัด Length และ HC ของสัปดาห์นี้.*on HFOV/.test(t.skipLine()?.textContent || '') && !t.gateLine());
    A.ok('the printed sheet does not carry it', !/on HFOV/.test(t.window.document.querySelector('#print-form')?.textContent || 'on HFOV'));
    const asked = t.asked.length;
    A.eq('Print order prints too', await t.pressPrint(), 1);
    A.eq('…and nothing asks again', t.asked.length, asked);
  },

  async 'values'(A) {
    console.log('\n── a Sunday: the values go in ──');
    const t = await setup();
    await t.openFromList('AA');
    await t.click(t.btn(/ไปกรอก Length \/ HC/, t.gateLine()));
    A.ok('the button opens the growth page', /Fenton 2025 growth chart/.test(t.window.document.querySelector('.page-head h1')?.textContent || ''));
    const box = (label) => [...t.window.document.querySelectorAll('.card .field')]
      .find(f => (f.querySelector('label')?.textContent || '').trim().startsWith(label))?.querySelector('input');
    await t.typeInto(box('Length'), 37);
    await t.typeInto(box('HC'), 26.5);
    await t.click(t.btn(/Save measurement/));
    await t.settle();
    A.eq('(the measurement saved)', t.callsOf('updateWeights').length, 1);
    await t.openFromList('AA');
    A.eq('with both in, AA prints', t.printed, 1);
    A.eq('…with no line', t.gateLine(), null);
    await t.submit();
    A.eq('Submit asks nothing', t.asked.length, 0);
  },

  async 'weekday'(A) {
    console.log('\n── the same infant on a Monday ──');
    const t = await setup({ offset: toSunday9() + DAY });
    A.ok('(the clock is not on a Sunday)', !t.D().isSundayBangkok(Date.now()));
    await t.openFromList('AA');
    A.eq('AA prints', t.printed, 1);
    A.eq('…with no line', t.gateLine(), null);
    await t.submit();
    A.eq('Submit asks nothing', t.asked.length, 0);
    A.ok('…and the order saved or locked', t.updates().length + t.callsOf('publishDailyLog').length > 0);
  },

  async 'older'(A) {
    console.log('\n── Saturday\'s order, opened on the Sunday ──');
    // AA's only order is dated the day before.
    const t = await setup({ logFor: (day) => ({ 'AA-1': [order('e-aa-sat', addDays(day, -1), 9)] }) });
    await t.pickWard('NICU');
    await t.openPatientRow(/AA/);
    // Sunday's prompt opens the growth page first; put it off, to the log.
    await t.click(t.btn(/ไว้ทีหลัง/));
    const row = [...t.window.document.querySelectorAll('tr[title]')].find(r => /กดเพื่อแก้ไข/.test(r.title));
    A.ok('(Saturday\'s order is on the log)', !!row);
    await t.click(row);
    await t.settle();
    A.ok('(it is open)', /แก้ไขบันทึกโภชนาการ/.test(t.text()));
    A.eq('no line on Saturday\'s order', t.gateLine(), null);
    A.eq('Print order prints it', await t.pressPrint(), 1);
  },

  async 'printall'(A) {
    console.log('\n── a Sunday: Print ทั้งหมด ──');
    const t = await setup();
    const doc = t.window.document;
    await t.click(t.printButton());
    await t.click(doc.querySelector('.page-head.print-head > .print-all'));
    for (let i = 0; i < 200 && !doc.querySelector('.print-batch'); i++) await t.flush(30);
    await t.settle();
    const sheets = [...doc.querySelectorAll('.print-batch > .print-batch-sheet')].map(x => x.getAttribute('data-session-id'));
    A.eq('the job holds BB and CC only', sheets, ['BB-1', 'CC-1']);
    A.eq('…which waits for a tap, as any job with an order held back does', t.printed, 0);
    await t.click(t.btn(/พิมพ์ 2 ใบ/));
    await t.settle();
    A.eq('พิมพ์ 2 ใบ prints it once', t.printed, 1);
    const held = [...doc.querySelectorAll('.print-batch-skipped li')].map(li => li.textContent);
    A.ok('AA and DD are listed as held, with the reason',
      held.length === 2 && held.every(x => /วันอาทิตย์ยังไม่มี Length และ HC/.test(x)) && /AA/.test(held[0]) && /DD/.test(held[1]), held);
  },

  async 'nurse'(A) {
    console.log('\n── a nurse on a Sunday ──');
    const t = await setup({ session: NURSE });
    await t.openFromList('AA');
    A.eq('her print of AA does not go', t.printed, 0);
    A.ok('…the line tells her where to enter the values, with no Submit wording',
      /พิมพ์ไม่ได้จนกว่าจะกรอกที่หน้า Growth chart/.test(t.gateLine()?.textContent || '') && !/Submit และพิมพ์/.test(t.gateLine()?.textContent || ''));
    await t.typeInto(t.fieldInput('Input'), 140);
    await t.submit();
    A.eq('her I/O Submit asks nothing', t.asked.length, 0);
    A.eq('…and saves once', t.updates().length, 1);
    const ci = t.updates()[0]?.entry?.calcInput || {};
    A.ok('…with no growth stop for the backend to refuse', Array.isArray(ci.stops) && !ci.stops.includes('CR-GROWTH-WEEKLY'), ci.stops);
  },

  async 'revision'(A) {
    console.log('\n── a Sunday: a reason on a locked order with a confirmed critical value ──');
    const K = { kCl: 6, critOverride: { reason: 'hypokalaemia', alerts: ['Potassium critically out of range'], at: '2026-11-14T03:00:00.000Z' } };
    const t = await setup({ prompt: () => 'on HFOV',
      logFor: (day) => ({ 'AA-1': [{ ...order('e-aa', day, 10), published: true, calcInput: { ...CI, ...K } }] }) });
    await t.openFromList('AA');
    A.eq('(held: nothing printed)', t.printed, 0);
    A.ok('the line says a reason makes a new version with the same figures, and to phone the TPN room',
      /ใส่เหตุผลแล้วจะเป็นฉบับใหม่ ตัวเลขเท่าเดิม โทรแจ้งห้อง TPN ด้วย/.test(t.window.document.querySelector('.revise-phone-note')?.textContent || ''));
    await t.submit();
    A.eq('one prompt only: the growth reason, not the critical value again', t.asked.length, 1);
    A.ok('…and it was the growth one', /วันอาทิตย์: ยังไม่มี/.test(t.asked[0] || ''));
    const ci = t.updates()[0]?.entry?.calcInput || {};
    A.eq('the save keeps the confirmed critical reason', ci.critOverride?.reason, 'hypokalaemia');
    A.eq('…carries the growth reason', ci.growthSkip?.reason, 'on HFOV');
    A.eq('…and is revision 2', ci.orderRev, 2);
  },

  async 'nurse-ro'(A) {
    console.log('\n── a nurse on a Sunday, the nursing switch on ──');
    const t = await setup({ session: NURSE, nursingOn: true });
    await t.openFromList('AA');
    A.eq('(her account has no Submit)', t.btn(/^\s*Submit\s*$/) || null, null);
    A.eq('her print of AA does not go', t.printed, 0);
    A.ok('her line says where to enter the values, with no Submit wording',
      /พิมพ์ไม่ได้จนกว่าจะกรอกที่หน้า Growth chart/.test(t.gateLine()?.textContent || '') && !/Submit/.test(t.gateLine()?.textContent || ''),
      t.gateLine()?.textContent);
  },

  async 'new'(A) {
    console.log('\n── a Sunday: a new order, submitted with a reason ──');
    // AA has no order yet today.
    const t = await setup({ prompt: () => 'on HFOV', logFor: () => ({ 'AA-1': [] }) });
    const doc = t.window.document;
    await t.pickWard('NICU');
    await t.openPatientRow(/AA/);
    await t.click(t.btn(/ไว้ทีหลัง/));
    await t.click(t.btn(/New log/));
    await t.click(t.btn(/ดำเนินการต่อ/));      // the date modal: today
    await t.settle();
    const field = (label) => {
      const f = [...doc.querySelectorAll('.field')].find(d => (d.querySelector('label')?.textContent || '').startsWith(label));
      return f?.querySelector('input') || [...doc.querySelectorAll('.salt-row-grid')]
        .find(d => d.firstElementChild?.firstElementChild?.textContent.startsWith(label))?.querySelector('input') || null;
    };
    await t.click([...doc.querySelectorAll('.step2-ctrl .seg button')].find(b => b.textContent.trim() === 'Central'));
    const fill = [['Current weight', 900], ['Target fluid', 150], ['Other IV', 0], ['Drug volume', 0], ['Input', 0],
      ['Urine output', 0], ['Drain content', 0], ['Volume(mL/day)', 110], ['Dextrose final', 10], ['Amino acid', 3], ['20% lipid', 2]];
    for (const [label, v] of fill) await t.typeInto(field(label), v);
    A.ok('(the line is on the new order too)', !!t.gateLine());
    await t.submit();
    A.eq('one prompt, the growth one', [t.asked.length, /วันอาทิตย์: ยังไม่มี/.test(t.asked[0] || '')], [1, true]);
    const logs = t.callsOf('logDailyNutrition');
    A.eq('one new row went', logs.length, 1);
    const ci = logs[0]?.entry?.calcInput || {};
    A.eq('…carrying the reason for today\'s DOL', [ci.growthSkip?.reason, ci.growthSkip?.dol], ['on HFOV', 10]);
    A.ok('…without the stop', Array.isArray(ci.stops) && !ci.stops.includes('CR-GROWTH-WEEKLY'), ci.stops);
  },
});
