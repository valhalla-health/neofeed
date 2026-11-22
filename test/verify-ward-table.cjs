// verify-ward-table.cjs — the ward table (openspec/changes/paediatric-wards, task 1.1, design D1).
//
// Pp, 2026-11-22: the ward and bed lists were written by hand in about twelve places across five
// files; they move into one table, WARDS in data.js, so adding a ward is a data change. No ward is
// added here, and nothing NICU or SCN shows may change.
//
//   § 1 today, data.js   the table yields today's BED_OPTIONS in order, and today's normalizeBed,
//                        bedWard, wardGroup, patientWard, next free bed, amino-acid product and
//                        dead-space default for every bed and every spelling (OLD below is main's
//                        code at c5b9050, copied word for word)
//   § 2 today, backend   gas-backend.gs keeps, normalises and files every bed as before; the usage
//                        and QI wards, and the editor's usage table, are as before
//   § 3 today, TPN room  tpn-room-core.js: the sticker's ward, the room's ward groups and bed order
//   § 4 the copies       tools/ward-table.cjs: both copies match data.js; a copy edited by hand, or a
//                        table changed without --write, fails and names the file; a malformed
//                        table is refused
//   § 5 a fixture ward   one row of three beds planted in WARDS, the copies regenerated, nothing
//                        else edited: its beds are in the picker, its tile is on the ward page with
//                        Print order, it has a button in the transfer dialog, a tab on "TPN ทั้งหอ",
//                        a census card, a usage-chart card, the backend keeps and files its beds,
//                        and the TPN room groups and labels its orders
//
// § 1–4 need no npm package; § 5's screens need the jsdom set in test/README.md. Made-up infants.
//
// NEGATIVE CONTROL — red against main before the table (c5b9050):
//   git archive c5b9050 | tar -x -C /tmp/main-c5b9050
//   NEOFEED_TREE=/tmp/main-c5b9050 node test/verify-ward-table.cjs
process.env.TZ = process.env.TZ || 'Asia/Bangkok';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const RB = require('./review-0917-boot.cjs');
const W = require('./ward-screens.cjs');

const TREE = path.resolve(process.env.NEOFEED_TREE || path.join(__dirname, '..'));
const read = (f) => fs.readFileSync(path.join(TREE, f), 'utf8');
function tool() {
  try { return require(path.join(TREE, 'tools', 'ward-table.cjs')); } catch (e) { return null; }
}
function loadData(src) {
  const box = { console, Math, Date, JSON, Intl };
  box.window = box;
  box.globalThis = box;
  vm.createContext(box);
  vm.runInContext(src, box, { filename: 'data.js' });
  return box.NEOFEED_DATA;
}

// ── main's hand-written ward code at c5b9050, word for word ───────────────
const OLD = (() => {
  function normalizeBed(bed) {
    const s = String(bed ?? "").trim().replace(/\s+/g, " ");
    if (!s) return "";
    const m = s.match(/^(nicu|scn|iso)\s*-?\s*(\d+)(?:\s*-\s*(\d+))?$/i);
    if (!m) return s;
    const ward = m[1].toLowerCase();
    if (ward === "iso") return m[3] ? `iso ${m[2]}-${m[3]}` : `iso ${m[2]}`;
    return `${ward.toUpperCase()} ${m[2]}`;
  }
  const BED_OPTIONS = [
    ...Array.from({ length: 12 }, (_, i) => `NICU ${i + 1}`),
    "iso 1-1", "iso 1-2",
    "iso 2-1", "iso 2-2",
    "iso 3-1", "iso 3-2", "iso 3-3", "iso 3-4",
    ...Array.from({ length: 30 }, (_, i) => `SCN ${i + 1}`),
  ];
  function bedWard(bed) {
    const s = normalizeBed(bed);
    if (!s) return "";
    const m = s.match(/^(NICU|SCN|iso)\b/i);
    if (!m) return "other";
    const w = m[1].toLowerCase();
    return w === "iso" ? "iso" : w.toUpperCase();
  }
  function wardGroup(bed) {
    const w = bedWard(bed);
    if (w === "NICU" || w === "iso") return "NICU";
    if (w === "SCN") return "SCN";
    return "other";
  }
  // tpn-room-core.js
  const WARD_BED = /^(NICU \d+|SCN \d+|iso \d+(-\d+)?)$/;
  function wardLabel(bed) {
    if (!WARD_BED.test(String(bed || ""))) return "";
    return /^SCN /.test(bed) ? "9B1(SCN)" : "9B2(NICU)";
  }
  function roomGroup(bed) {
    const b = String(bed || "");
    if (!WARD_BED.test(b)) return "none";
    return /^SCN /.test(b) ? "SCN" : "NICU";
  }
  // gas-backend.gs
  function usageWardGroup(bed) {
    var m = normalizeBed(bed).match(/^(NICU|SCN|iso)\b/i);
    if (!m) return "other";
    return m[1].toLowerCase() === "scn" ? "SCN" : "NICU";
  }
  return { normalizeBed, BED_OPTIONS, bedWard, wardGroup, wardLabel, roomGroup, usageWardGroup, PHARMACY_WARD_BED: WARD_BED };
})();
const CORPUS = [...OLD.BED_OPTIONS, ...W.BED_VARIANTS];
const STR = CORPUS.filter(b => typeof b === 'string');
const USAGE_HEADER = 'week      Monday       NICU   SCN other total    TPN    EN   NPO type?';

// The fixture ward: three beds, a sticker label no real ward has. Beds read "FIX 1"–"FIX 3".
const FIXTURE_ROW = '{ key: "FIX", label: "FIX", sub: "FIX 1–3", stickerLabel: "FIX(test)", beds: [{ prefix: "FIX", count: 3 }] },';
function planted() {
  const T = tool();
  if (!T) throw new Error('tools/ward-table.cjs is missing');
  const data = T.plantWard(read('data.js'), FIXTURE_ROW);
  return T.write({ 'data.js': data, 'gas-backend.gs': read('gas-backend.gs'), 'tpn-room-core.js': read('tpn-room-core.js') });
}
function sameFor(A, name, list, got, want) {
  const bad = list.filter(b => JSON.stringify(got(b)) !== JSON.stringify(want(b)));
  A.eq(`${name} (${list.length} labels)`, bad.slice(0, 5).map(b => [b, got(b), want(b)]), []);
}

const scenarios = {
  async 'today-data'(A) {
    console.log('\n── § 1 today, data.js ──');
    const D = loadData(read('data.js'));
    A.ok('1.1 data.js has WARDS', Array.isArray(D.WARDS));
    const rows = (D.WARDS || []).map(w => [w.key, w.label, w.sub, w.stickerLabel]);
    A.eq('1.2 two wards, NICU then SCN, as the ward page and the sticker name them', rows,
      [['NICU', 'NICU', 'NICU 1–12 · iso 1–3', '9B2(NICU)'], ['SCN', 'SCN', 'SCN 1–30', '9B1(SCN)']]);
    A.ok('1.3 the table and its rows are frozen', Array.isArray(D.WARDS) && Object.isFrozen(D.WARDS) && D.WARDS.every(w => Object.isFrozen(w) && Object.isFrozen(w.beds)));
    A.eq('1.4 BED_OPTIONS: NICU 1–12, the 8 iso beds, SCN 1–30, in that order', D.BED_OPTIONS, OLD.BED_OPTIONS);
    A.eq('1.5 the runs of beds, in table order', (D.WARD_BED_RUNS || []).map(r => [r.prefix, r.ward, r.rooms]),
      [['NICU', 'NICU', false], ['iso', 'NICU', true], ['SCN', 'SCN', false]]);
    sameFor(A, '1.6 normalizeBed', CORPUS, D.normalizeBed, OLD.normalizeBed);
    sameFor(A, '1.7 bedWard', CORPUS, D.bedWard, OLD.bedWard);
    sameFor(A, '1.8 wardGroup', CORPUS, D.wardGroup, OLD.wardGroup);
    const p = (bed, history) => ({ sessionId: 'NF-900001', status: 'Active', currentBed: bed, bedHistory: history || [] });
    sameFor(A, '1.9 patientWard, in a bed', CORPUS, b => D.patientWard(p(b)), b => {
      const s = OLD.normalizeBed(b); return s ? OLD.wardGroup(s) : 'other';
    });
    sameFor(A, '1.10 patientWard, parked from that bed', STR, b => D.patientWard(p('', [{ bed: b, date: '2026-11-20' }])), b => {
      const s = OLD.normalizeBed(b); return s ? OLD.wardGroup(s) : 'other';
    });
    // Next free bed per run, as the transfer dialog asks it, with the ward empty, partly full and full.
    const held = (beds) => beds.map((bed, i) => ({ sessionId: `NF-91${String(i).padStart(4, '0')}`, status: 'Active', currentBed: bed }));
    const states = { empty: [], some: ['NICU 1', 'NICU 2', 'iso 1-1', 'SCN 1', 'SCN 3'], full: OLD.BED_OPTIONS };
    for (const [name, beds] of Object.entries(states)) {
      const ps = held(beds);
      const occ = new Set(beds);
      for (const run of ['NICU', 'iso', 'SCN']) {
        A.eq(`1.11 next free ${run} bed, ${name}`, D.nextFreeBed(ps, run), OLD.BED_OPTIONS.find(b => OLD.bedWard(b) === run && !occ.has(b)) || '');
      }
    }
    sameFor(A, '1.12 every bed stays a newborn unit: Aminoven only, dead space 30 mL', CORPUS,
      b => [D.isNewbornUnit(p(b)), D.aaProductsFor(p(b)), D.defaultDeadVolFor(p(b))], () => [true, ['aminoven10'], 30]);
  },

  async 'today-backend'(A) {
    console.log('\n── § 2 today, gas-backend.gs ──');
    const B = W.backendView(read('gas-backend.gs'), CORPUS);
    const want = CORPUS.map(b => [b, OLD.normalizeBed(b), OLD.normalizeBed(b) ? OLD.usageWardGroup(b) : 'other', OLD.PHARMACY_WARD_BED.test(OLD.normalizeBed(b))]);
    const bad = B.beds.filter((r, i) => JSON.stringify(r) !== JSON.stringify(want[i]));
    A.eq(`2.1 _normBed, the usage ward and the bed the TPN room is sent (${CORPUS.length} labels)`, bad.slice(0, 5), []);
    A.eq('2.2 a parked infant is counted on the ward of the bed they left', B.parked.filter(([b, w]) => w !== (OLD.normalizeBed(b) ? OLD.usageWardGroup(b) : 'other')), []);
    A.eq('2.3 USAGE_WARDS', B.usageWards, ['NICU', 'SCN', 'other']);
    A.eq('2.4 QI_SUBMIT_WARDS', B.qiWards, ['NICU', 'SCN']);
    A.eq('2.5 a QI day: ALL, NICU, SCN', B.qiRows, ['ALL', 'NICU', 'SCN']);
    A.eq('2.6 the editor\'s usage table: the same heading', B.usageTable.split('\n')[1], USAGE_HEADER);
    A.eq('2.7 …and the same columns (one week: NICU 1, SCN 2, other 3)', B.usageTable.split('\n')[2],
      '2026-W47  2026-11-16      1     2     3     6      6     0     0     0');
  },

  async 'today-room'(A) {
    console.log('\n── § 3 today, tpn-room-core.js ──');
    const R = W.roomView(read('tpn-room-core.js'), STR);
    sameFor(A, '3.1 the sticker\'s ward: 9B2(NICU) for NICU and iso, 9B1(SCN) for SCN, blank otherwise', STR,
      b => R.sticker.find(([x]) => x === b)[1], OLD.wardLabel);
    sameFor(A, '3.2 the room\'s ward group', STR, b => R.group.find(([x]) => x === b)[1], OLD.roomGroup);
    A.eq('3.3 the groups, in order: NICU, SCN, then ไม่มีเตียง', R.groups.map(g => [g.key, g.label]),
      [['NICU', 'NICU'], ['SCN', 'SCN'], ['none', 'ไม่มีเตียง']]);
    const rank = (b) => { const m = /^(NICU|iso|SCN) (\d+)(?:-(\d+))?$/.exec(String(b || '')); return m ? [{ NICU: 0, iso: 1, SCN: 2 }[m[1]], +m[2], +(m[3] || 0)] : [3, 0, 0]; };
    const want = STR.map((bed, i) => ({ bed, id: `NF-9100${String(i).padStart(2, '0')}` }))
      .sort((a, b) => { const x = rank(a.bed), y = rank(b.bed); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return a.id.localeCompare(b.id); })
      .map(o => o.bed);
    A.eq('3.4 orders sorted by bed: NICU, iso, SCN, by number, then the rest', R.order, want);
  },

  async 'copies'(A) {
    console.log('\n── § 4 the copies ──');
    const T = tool();
    A.ok('4.1 tools/ward-table.cjs exists', !!T);
    if (!T) return;
    const files = () => ({ 'data.js': read('data.js'), 'gas-backend.gs': read('gas-backend.gs'), 'tpn-room-core.js': read('tpn-room-core.js') });
    A.eq('4.2 both copies match data.js', T.checkSources(files()), []);
    A.eq('4.3 --write changes nothing', T.write(files()), files());
    const which = (problems) => problems.map(p => p.file);
    const gas = files(); gas['gas-backend.gs'] = gas['gas-backend.gs'].replace('"9B1(SCN)"', '"9B1(scn)"');
    A.eq('4.4 the backend copy edited by hand: fails, naming gas-backend.gs', which(T.checkSources(gas)), ['gas-backend.gs']);
    const room = files(); room['tpn-room-core.js'] = room['tpn-room-core.js'].replace('"prefix":"SCN"', '"prefix":"SCX"');
    A.eq('4.5 the TPN room copy edited by hand: fails, naming tpn-room-core.js', which(T.checkSources(room)), ['tpn-room-core.js']);
    const gone = files(); gone['tpn-room-core.js'] = gone['tpn-room-core.js'].replace(/\n[^\n]*── end of the generated ward table ──/, '');
    A.eq('4.6 a copy with its block cut: fails, naming the file', which(T.checkSources(gone)), ['tpn-room-core.js']);
    const moved = files(); moved['data.js'] = T.plantWard(moved['data.js'], FIXTURE_ROW);
    A.eq('4.7 a ward added to data.js without --write: both copies fail', which(T.checkSources(moved)), ['gas-backend.gs', 'tpn-room-core.js']);
    const msg = T.checkSources(gas)[0];
    A.ok('4.8 the failure says what to run', msg && /node tools\/ward-table\.cjs --write/.test(msg.why));
    const bad = (row) => which(T.checkSources({ ...files(), 'data.js': T.plantWard(read('data.js'), row) }));
    A.eq('4.9 a second NICU is refused', bad('{ key: "NICU", label: "N2", sub: "x", stickerLabel: "x", beds: [{ prefix: "NN", count: 1 }] },'), ['data.js']);
    A.eq('4.10 a ward keyed "other" is refused', bad('{ key: "other", label: "O", sub: "x", stickerLabel: "x", beds: [{ prefix: "OO", count: 1 }] },'), ['data.js']);
    A.eq('4.11 a prefix another ward has (any case) is refused', bad('{ key: "PICU", label: "PICU", sub: "x", stickerLabel: "x", beds: [{ prefix: "scn", count: 2 }] },'), ['data.js']);
    A.eq('4.12 a prefix that is not letters is refused', bad('{ key: "PICU", label: "PICU", sub: "x", stickerLabel: "x", beds: [{ prefix: "P-1", count: 2 }] },'), ['data.js']);
    A.eq('4.13 a ward with no bed is refused', bad('{ key: "PICU", label: "PICU", sub: "x", stickerLabel: "x", beds: [] },'), ['data.js']);
    A.eq('4.14 a ward with no sticker label is refused', bad('{ key: "PICU", label: "PICU", sub: "x", stickerLabel: "", beds: [{ prefix: "PICU", count: 2 }] },'), ['data.js']);
    const checks = JSON.parse(read('tools/checks.json')).checks;
    const c = checks.find(x => Array.isArray(x.cmd) && x.cmd.join(' ') === 'node tools/ward-table.cjs');
    A.ok('4.15 tools/checks.json runs it, blocking, at every level, in the pre phase',
      c && c.blocking === true && ['stop', 'commit', 'ci'].every(l => c.levels.includes(l)) && c.phases.includes('pre'));
  },

  async 'fixture-data'(A) {
    console.log('\n── § 5a a fixture ward, data.js ──');
    const D = loadData(planted()['data.js']);
    const fix = ['FIX 1', 'FIX 2', 'FIX 3'];
    A.eq('5.1 its beds join BED_OPTIONS after SCN', D.BED_OPTIONS, [...OLD.BED_OPTIONS, ...fix]);
    A.eq('5.2 bedWard and wardGroup name it', fix.map(b => [D.bedWard(b), D.wardGroup(b)]), fix.map(() => ['FIX', 'FIX']));
    A.eq('5.3 normalizeBed reads its old spellings', ['fix-2', 'FIX 2-1', ' fix  3 '].map(D.normalizeBed), ['FIX 2', 'FIX 2', 'FIX 3']);
    A.eq('5.4 the next free bed is its first', D.nextFreeBed([], 'FIX'), 'FIX 1');
    sameFor(A, '5.5 NICU and SCN answers do not move', CORPUS.filter(b => !/^\s*fix/i.test(String(b))),
      b => [D.normalizeBed(b), D.bedWard(b), D.wardGroup(b)], b => [OLD.normalizeBed(b), OLD.bedWard(b), OLD.wardGroup(b)]);
  },

  async 'fixture-backend'(A) {
    console.log('\n── § 5b a fixture ward, gas-backend.gs ──');
    const B = W.backendView(planted()['gas-backend.gs'], ['FIX 2', 'fix-3', 'FIX 9', 'NICU 1', 'SCN 1']);
    A.eq('5.6 the backend keeps its beds and files them under it', B.beds.slice(0, 3),
      [['FIX 2', 'FIX 2', 'FIX', true], ['fix-3', 'FIX 3', 'FIX', true], ['FIX 9', 'FIX 9', 'FIX', true]]);
    A.eq('5.7 NICU and SCN as before', B.beds.slice(3), [['NICU 1', 'NICU 1', 'NICU', true], ['SCN 1', 'SCN 1', 'SCN', true]]);
    A.eq('5.8 a usage ward, before other', B.usageWards, ['NICU', 'SCN', 'FIX', 'other']);
    A.eq('5.9 a QI ward: in ALL and on its own row', [B.qiWards, B.qiRows], [['NICU', 'SCN', 'FIX'], ['ALL', 'NICU', 'SCN', 'FIX']]);
    A.ok('5.10 a column in the editor\'s usage table', /NICU +SCN +FIX +other total/.test(B.usageTable.split('\n')[1]));
  },

  async 'fixture-room'(A) {
    console.log('\n── § 5c a fixture ward, tpn-room-core.js ──');
    const R = W.roomView(planted()['tpn-room-core.js'], ['FIX 3', 'SCN 2', 'FIX 1', 'NICU 1', 'OR 1']);
    A.eq('5.11 its sticker label', R.sticker, [['FIX 3', 'FIX(test)'], ['SCN 2', '9B1(SCN)'], ['FIX 1', 'FIX(test)'], ['NICU 1', '9B2(NICU)'], ['OR 1', '']]);
    A.eq('5.12 its own group on the room\'s list, after SCN', R.groups.map(g => [g.key, g.label, g.submitted.length + g.drafts.length]),
      [['NICU', 'NICU', 1], ['SCN', 'SCN', 1], ['FIX', 'FIX', 2], ['none', 'ไม่มีเตียง', 1]]);
    A.eq('5.13 its orders sorted after SCN\'s', R.order, ['NICU 1', 'SCN 2', 'FIX 1', 'FIX 3', 'OR 1']);
  },

  async 'fixture-screens'(A) {
    console.log('\n── § 5d a fixture ward, on screen ──');
    const data = planted()['data.js'];
    const m = W.mount({ root: TREE, patchData: () => data });
    const v = await W.screenViews(m, { extraBeds: ['FIX 2'] });
    A.eq('5.14 the bed picker offers FIX 1–3, FIX 2 taken', v.picker.filter(([b]) => /^FIX/.test(b)).map(([b, , dis]) => [b, dis]),
      [['FIX 1', false], ['FIX 2', true], ['FIX 3', false]]);
    A.eq('5.15 the ward page: a FIX tile with Print order, between SCN and ทดสอบระบบ',
      v.gate.map(g => [g.tile.replace(/\d+ active.*$/, ''), !!g.print]),
      [['NICUNICU 1–12 · iso 1–3', true], ['SCNSCN 1–30', true], ['FIXFIX 1–3', true], ['ทดสอบระบบไม่มีเตียง · ไม่บันทึกเข้าระบบ', false]]);
    A.ok('5.16 …counting its infant', /^FIX.*1 active/.test(v.gate[2] && v.gate[2].tile));
    A.eq('5.17 FIX\'s ward list is headed FIX and lists FIX 2', v.wardList.FIX && [v.wardList.FIX.head, v.wardList.FIX.beds[0]], ['FIX', 'FIX 2']);
    A.ok('5.18 the transfer dialog jumps to FIX\'s next free bed', v.transfer['NICU 1'].includes('FIX · FIX 1'));
    A.ok('5.19 "TPN ทั้งหอ" has a FIX tab, and its page lists FIX 2',
      /^TPN ทั้งหอ · FIX/.test(v.wardTpn.FIX || '') && /NICUSCNFIXทดสอบระบบ/.test(v.wardTpn.FIX) && /FIX 2/.test(v.wardTpn.FIX));
    const fixCensus = v.census.wards.find(w => w.ward === 'FIX');
    A.eq('5.20 a census card: FIX, 3 beds, 1 held, 1 infant', fixCensus && [fixCensus.label, fixCensus.capacity, fixCensus.occupied, fixCensus.active], ['FIX', 3, 1, 1]);
    A.eq('5.21 …and the unit counts 53 beds', v.census.total.capacity, 53);
    A.eq('5.22 the usage chart has a FIX card, after SCN', v.usage.map(u => u.ward), ['NICU', 'SCN', 'FIX']);
    A.eq('5.23 New session still starts on the next free NICU bed', v.newSessionBed.FIX, 'NICU 2');
  },
};

RB.runScenarios(__filename, 'WARD TABLE', scenarios);
