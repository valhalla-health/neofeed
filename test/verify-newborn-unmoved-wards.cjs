// verify-newborn-unmoved-wards.cjs — the newborn no-move proof for the ward table
// (openspec/changes/paediatric-wards, task 1.4, design D8).
//
// Moving the ward and bed lists into data.js WARDS must leave NICU, SCN and ทดสอบระบบ exactly as
// they were. This reads every screen and answer that names a ward or a bed (test/ward-screens.cjs,
// a fixed clock, made-up infants) and compares it with the same reading taken from main at
// c5b9050, before the table: test/newborn-unmoved-wards.json.
//
//   § 1 screens   the ward page (gate, each ward's list, the search's other-ward button), the bed
//                 picker, New session's default bed from each tile, the transfer dialog for a NICU,
//                 an SCN and a parked infant, "TPN ทั้งหอ" for each ward, the admin census and its
//                 cards, the usage chart
//   § 2 TPN room  the room's ward groups and bed order, the sticker's ward for every bed, and the
//                 whole sticker of a NICU and an SCN order
//   § 3 backend   the bed the backend keeps, sends the TPN room and files usage under, a parked
//                 infant's ward, the usage and QI wards, a QI day's rows, the editor's usage table
//
// Any difference fails and names the screen. A later change that is meant to move one of these
// screens records the reading again, from the commit before it, and says so in its PR:
//   git archive <base> | tar -x -C /tmp/base
//   node test/verify-newborn-unmoved-wards.cjs --record /tmp/base <base-sha>
// Or compare with any tree directly, without the file:
//   node test/verify-newborn-unmoved-wards.cjs --base /tmp/base
//
// § 1 needs the jsdom set in test/README.md; § 2 and § 3 need none.
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const RB = require('./review-0917-boot.cjs');
const W = require('./ward-screens.cjs');
const { loadData, printJson } = require('./tpn-room-fixture.cjs');

const FIXTURE = path.join(__dirname, 'newborn-unmoved-wards.json');
const read = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');

// The beds every reading covers: the picker's 50 and every other spelling.
function beds(root) {
  return [...loadData(root).BED_OPTIONS, ...W.BED_VARIANTS];
}
async function screens(root) {
  return W.screenViews(W.mount({ root }));
}
function room(root) {
  const list = beds(root).filter(b => typeof b === 'string');
  const view = W.roomView(read(root, 'tpn-room-core.js'), list);
  const Core = W.loadCore(read(root, 'tpn-room-core.js'));
  const D = loadData(root);
  view.stickers = ['NICU 4', 'iso 3-2', 'SCN 7'].map((bed, i) => Core.stickerModel(
    { sessionId: `NF-9200${i}`, bed, printJson: printJson(D, '2026-11-22') },
    { name: 'ทด สอบ', an: '12345/69' }, '2026-11-22'));
  return view;
}
function backend(root) {
  return W.backendView(read(root, 'gas-backend.gs'), beds(root));
}
const PARTS = { screens, room, backend };

// The first difference in each top-level field, so a failure says which screen moved.
function differences(got, want, at = '') {
  if (JSON.stringify(got) === JSON.stringify(want)) return [];
  if (got && want && typeof got === 'object' && typeof want === 'object' && !Array.isArray(got) && !Array.isArray(want)) {
    return [...new Set([...Object.keys(want), ...Object.keys(got)])].flatMap(k => differences(got[k], want[k], at ? `${at}.${k}` : k));
  }
  return [`${at}: got ${JSON.stringify(got).slice(0, 240)} · was ${JSON.stringify(want).slice(0, 240)}`];
}

// --record <tree> [<sha>]: take the reading from that tree, one part per process.
// --base <tree>: compare the working tree with that tree's reading, not with the file.
function readingOf(tree) {
  const out = {};
  for (const part of Object.keys(PARTS)) {
    const r = spawnSync(process.execPath, [__filename, '--part', part, tree], { encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(2); }
    out[part] = JSON.parse(r.stdout);
  }
  return out;
}
const argv = process.argv.slice(2);
if (argv[0] === '--part') {
  const quiet = console.log;
  console.log = () => {};
  Promise.resolve(PARTS[argv[1]](path.resolve(argv[2]))).then(v => {
    console.log = quiet;
    process.stdout.write(JSON.stringify(v), () => process.exit(0));
  }).catch(e => { console.error(e); process.exit(1); });
} else if (argv[0] === '--record') {
  const tree = path.resolve(argv[1]);
  const reading = readingOf(tree);
  fs.writeFileSync(FIXTURE, JSON.stringify({
    about: 'The newborn wards\' screens and answers before the ward table, read by test/verify-newborn-unmoved-wards.cjs. Made-up infants, a fixed clock.',
    recordedFrom: argv[2] || tree,
    ...reading,
  }, null, 1) + '\n');
  console.log(`recorded ${path.relative(process.cwd(), FIXTURE)} from ${argv[2] || tree}`);
} else {
  const TITLES = {
    screens: '§ 1 screens: ward page, bed picker, transfer, TPN ทั้งหอ, census, usage',
    room: '§ 2 the TPN room: groups, bed order, sticker',
    backend: '§ 3 the backend: beds, usage, QI',
  };
  // A ward the table holds besides NICU and SCN (a fixture, or a paediatric ward from task 5.1)
  // adds a tile, a tab, beds and a census card; NICU's, SCN's and ทดสอบระบบ's must still read
  // as before. Both readings are cut to them, and the two figures that sum every ward (the
  // unit's census total and the editor's usage table) are left out.
  const extra = (loadData(W.ROOT).WARDS || []).filter(w => !['NICU', 'SCN'].includes(w.key))
    .map(w => ({ key: w.key, label: w.label, prefixes: w.beds.map(r => r.prefix) }));
  const project = (part, reading) => {
    if (!extra.length) return reading;
    const r = JSON.parse(JSON.stringify(reading));
    const keys = new Set(extra.map(w => w.key)), labels = extra.map(w => w.label), prefixes = extra.flatMap(w => w.prefixes);
    const bedOf = (b) => typeof b === 'string' && prefixes.some(p => new RegExp(`^\\s*${p}(?![a-z])`, 'i').test(b));
    const drop = (o) => { Object.keys(o || {}).forEach(k => { if (keys.has(k)) delete o[k]; }); };
    if (part === 'screens') {
      r.gate = r.gate.filter(g => !labels.some(l => g.tile.startsWith(l)));
      [r.wardList, r.newSessionBed, r.wardTpn].forEach(drop);
      Object.values(r.wardTpn).forEach(t => { t.tabs = t.tabs.filter(x => !labels.includes(x)); });
      r.picker = r.picker.filter(([v]) => !bedOf(v));
      Object.keys(r.transfer).forEach(k => { r.transfer[k] = r.transfer[k].filter(t => !prefixes.some(p => t.startsWith(`${p} · `))); });
      r.census.wards = r.census.wards.filter(w => !keys.has(w.ward));
      delete r.census.total;
      r.censusCards = r.censusCards.filter(t => !labels.some(l => t.startsWith(l)));
      r.usage = r.usage.filter(u => !keys.has(u.ward));
    } else if (part === 'room') {
      r.groups = r.groups.filter(g => !keys.has(g.key));
      r.groups.forEach(g => { g.submitted = g.submitted.filter(b => !bedOf(b)); g.drafts = g.drafts.filter(b => !bedOf(b)); });
      r.order = r.order.filter(b => !bedOf(b));
      r.sticker = r.sticker.filter(([b]) => !bedOf(b));
      r.group = r.group.filter(([b]) => !bedOf(b));
    } else {
      r.beds = r.beds.filter(([b]) => !bedOf(b));
      r.parked = r.parked.filter(([b]) => !bedOf(b));
      r.usageWards = r.usageWards.filter(w => !keys.has(w));
      r.qiWards = r.qiWards.filter(w => !keys.has(w));
      r.qiRows = r.qiRows.filter(w => !keys.has(w));
      delete r.usageTable;
    }
    return r;
  };
  if (extra.length) {
    console.log(`The table also holds ${extra.map(w => w.key).join(', ')}: NICU, SCN and ทดสอบระบบ are compared, and the unit total and the editor's usage table are left out.`);
  }
  const compare = (A, part, gotAll, wantAll, from) => {
    console.log(`\n── ${TITLES[part]} ──`);
    const want = { [part]: project(part, wantAll[part]) };
    const diff = differences(project(part, JSON.parse(JSON.stringify(gotAll))), want[part]);
    for (const k of Object.keys(want[part])) {
      const mine = diff.filter(d => d.startsWith(k + '.') || d.startsWith(k + ':'));
      A.eq(`${part}.${k} reads as on ${from}`, mine, []);
    }
  };
  if (argv[0] === '--base') {
    const base = path.resolve(argv[1]);
    const want = readingOf(base), got = readingOf(W.ROOT);
    const A = RB.makeAsserts();
    Object.keys(PARTS).forEach(part => compare(A, part, got[part], want, base));
    console.log(`\nNEWBORN UNMOVED (ward table) against ${base}: ${A.fail === 0 ? 'ALL PASS' : `${A.fail} FAILED`} (${A.pass} passed, ${A.fail} failed)`);
    process.exit(A.fail === 0 ? 0 : 1);
  }
  const want = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const scenario = (part) => async (A) => compare(A, part, await PARTS[part](W.ROOT), want, want.recordedFrom);
  RB.runScenarios(__filename, 'NEWBORN UNMOVED (ward table)', {
    screens: scenario('screens'),
    room: scenario('room'),
    backend: scenario('backend'),
  });
}
