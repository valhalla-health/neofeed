// verify-tpn-room-store-1105.cjs — the TPN room's encrypted name file, on real WebCrypto
// with a fake folder (openspec/changes/tpn-room-stickers, D7 and "Names and ANs stay on
// the PC"): the daily silent open, a cleared device key, a wrong passphrase, a copy on
// another PC, a changed byte anywhere, a failed write, the 30-day purge, a lost
// passphrase. Synthetic names only. No npm dependency.
const { webcrypto } = require('node:crypto');
const Store = require('../tpn-room-store.js');

let pass = 0, fail = 0, n = 0;
function eq(name, got, want) {
  const yes = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${yes ? 'PASS' : 'FAIL'}  ${String(++n).padStart(3)}. ${name}${yes ? '' : `  got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  yes ? pass++ : fail++;
}
const ok = (name, cond) => eq(name, !!cond, true);
const section = (t) => console.log(`\n── ${t} ──`);
async function refused(fn) { try { await fn(); return ''; } catch (e) { return e.kind || e.message; } }

// A folder with the File System Access calls the store uses. createWritable holds the
// text back until close(), as the real swap file does.
function fakeFolder(name) {
  const files = new Map();
  let clock = 1000;
  const dir = {
    name, files, failNextWrite: false,
    async getFileHandle(fname, opts) {
      if (!files.has(fname)) {
        if (!(opts && opts.create)) { const e = new Error('nope'); e.name = 'NotFoundError'; throw e; }
        files.set(fname, { text: '', lastModified: ++clock });
      }
      return {
        getFile: async () => { const f = files.get(fname); return { lastModified: f.lastModified, text: async () => f.text }; },
        createWritable: async () => {
          let pending = '';
          return {
            write: async (t) => { pending = t; },
            close: async () => {
              if (dir.failNextWrite) { dir.failNextWrite = false; throw new Error('disk full'); }
              files.set(fname, { text: pending, lastModified: ++clock });
            },
            abort: async () => {},
          };
        },
      };
    },
  };
  return dir;
}
function fakeKv() {
  const m = new Map();
  return { m, get: async (k) => m.get(k), set: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); } };
}
let today = '2026-11-16';
const device = () => {
  const kv = fakeKv();
  return { kv, store: Store.createStore({
    subtle: webcrypto.subtle, kv, today: () => today,
    randomBytes: (k) => webcrypto.getRandomValues(new Uint8Array(k)),
  }) };
};
const PASS = 'synthetic-room-passphrase';
const FN = Store.FILE_NAME;
const SENTINEL = 'SENTINEL-NAME-7Q';

(async () => {
  const pc = device();
  const folder = fakeFolder('TPN');

  section('§1 a new file');
  eq('an empty folder has no file', await pc.store.openFile(folder), { missing: true });
  eq('a short passphrase is refused', await refused(() => pc.store.createFile(folder, 'short')), 'weakPassphrase');
  let file = await pc.store.createFile(folder, PASS);
  eq('the file reports its folder', file.folderName, 'TPN');
  eq('it starts empty', file.state, { infants: {}, printLog: [], meta: { logLostOn: '' } });
  eq('creating over a file is refused', await refused(() => pc.store.createFile(folder, PASS)), 'exists');
  await file.save((s) => Store.mapInfant(s, 'SY-1', { name: SENTINEL, an: '12345/69' }, 'เภสัช ก', '2026-11-16T03:00:00.000Z', today));
  const onDisk = folder.files.get(FN).text;
  ok('the sentinel name is not readable on disk', !onDisk.includes(SENTINEL));
  ok('nor its base64', !onDisk.includes(Buffer.from(SENTINEL).toString('base64')));
  ok('nor the AN', !onDisk.includes('12345/69'));
  ok('the passphrase is not stored', !onDisk.includes(PASS));
  eq('the KDF is PBKDF2-SHA-256', [JSON.parse(onDisk).kdf.name, JSON.parse(onDisk).kdf.hash], ['PBKDF2', 'SHA-256']);

  section('§2 the daily open');
  let r = await pc.store.openFile(folder);
  eq('opens silently with the device key', r.file.state.infants['SY-1'].name, SENTINEL);
  eq('the device key is non-extractable', (await pc.kv.get('deviceKey')).extractable, false);
  file = r.file;

  section('§3 the browser\'s data was cleared');
  const cleared = device();
  eq('no device key: asks for the passphrase', await cleared.store.openFile(folder), { needsPassphrase: true });
  eq('a wrong passphrase is refused', await refused(() => cleared.store.openFile(folder, 'wrong-passphrase-1')), 'wrongPassphrase');
  r = await cleared.store.openFile(folder, PASS);
  eq('the right one opens it', r.file.state.infants['SY-1'].name, SENTINEL);
  ok('and makes a new device key', await cleared.kv.get('deviceKey'));
  r = await cleared.store.openFile(folder);
  eq('from then on it opens silently', r.file.state.infants['SY-1'].an, '12345/69');
  eq('the old device key no longer opens it, so that browser asks', await pc.store.openFile(folder), { needsPassphrase: true });
  r = await pc.store.openFile(folder, PASS);
  file = r.file;

  section('§4 the file copied to another PC');
  const other = device();
  const copy = fakeFolder('USB');
  copy.files.set(FN, { text: folder.files.get(FN).text, lastModified: 1 });
  eq('without the passphrase it stays shut', await other.store.openFile(copy), { needsPassphrase: true });

  section('§5 a changed byte');
  const good = folder.files.get(FN).text;
  const tamperedCopy = (text) => { const d = fakeFolder('T'); d.files.set(FN, { text, lastModified: 1 }); return d; };
  const flip = (t, i) => t.slice(0, i) + (t[i] === 'A' ? 'B' : 'A') + t.slice(i + 1);
  const parsed = JSON.parse(good);
  const spots = {
    'in the payload': good.indexOf(parsed.payload.ct) + 10,
    'in the payload iv': good.indexOf(parsed.payload.iv) + 2,
    'in the device wrap': good.indexOf(parsed.byDevice.ct) + 2,
    'in the passphrase wrap': good.indexOf(parsed.byPassphrase.ct) + 2,
    'in the salt': good.indexOf(parsed.kdf.salt) + 2,
  };
  for (const [where, i] of Object.entries(spots)) {
    const bad = tamperedCopy(flip(good, i));
    let seen;
    try {
      const silent = await pc.store.openFile(bad);
      seen = silent.needsPassphrase ? await refused(() => pc.store.openFile(bad, PASS)) : 'opened';
    } catch (e) { seen = e.kind; }
    ok(`a byte ${where} is refused, never read as empty (${seen})`, seen === 'damaged' || seen === 'wrongPassphrase');
  }
  eq('a stray space is refused', await refused(() => pc.store.openFile(tamperedCopy(good + ' '))), 'damaged');
  eq('a truncated file is refused', await refused(() => pc.store.openFile(tamperedCopy(good.slice(0, 200)))), 'damaged');
  eq('another format is refused', await refused(() => pc.store.openFile(tamperedCopy(JSON.stringify({ format: 'x' })))), 'damaged');
  const iterations = good.replace(`"iterations":${parsed.kdf.iterations}`, '"iterations":1000');
  const weakened = await refused(async () => { const s = await pc.store.openFile(tamperedCopy(iterations)); if (s.needsPassphrase) await pc.store.openFile(tamperedCopy(iterations), PASS); });
  ok(`a lowered iteration count is refused (${weakened})`, weakened === 'damaged' || weakened === 'wrongPassphrase');

  section('§6 writes');
  const beforeFail = folder.files.get(FN).text;
  folder.failNextWrite = true;
  ok('a failed write throws', await refused(() => file.save((s) => Store.mapInfant(s, 'SY-2', { name: 'x', an: '22222/69' }, 'a', 'b', today))));
  eq('the old version stays on disk', folder.files.get(FN).text === beforeFail, true);
  eq('and the table in memory is unchanged', file.state.infants['SY-2'], undefined);
  await file.save((s) => Store.mapInfant(s, 'SY-2', { name: 'ทารกสอง', an: '22222/69' }, 'เภสัช ก', 'at-1', today));
  await file.save((s) => Store.mapInfant(s, 'SY-2', { name: 'ทารกสอง แก้', an: '22222/69' }, 'เภสัช ข', 'at-2', today));
  eq('an edit keeps who and when', [file.state.infants['SY-2'].by, file.state.infants['SY-2'].at], ['เภสัช ข', 'at-2']);
  eq('and the history', file.state.infants['SY-2'].history, [{ name: 'ทารกสอง', an: '22222/69', by: 'เภสัช ก', at: 'at-1' }]);
  await file.save((s) => Store.logPrint(s, { sessionId: 'SY-1', date: today, entryId: 'e1', revision: 1, by: 'x', at: 'y' }));
  r = await pc.store.openFile(folder);
  eq('the print log comes back after a reopen', r.file.state.printLog.map((p) => p.entryId), ['e1']);
  await Promise.all([
    r.file.save((s) => Store.logPrint(s, { sessionId: 'SY-1', date: today, entryId: 'e2', revision: 2, by: 'x', at: 'y' })),
    r.file.save((s) => Store.logPrint(s, { sessionId: 'SY-1', date: today, entryId: 'e3', revision: 3, by: 'x', at: 'y' })),
  ]);
  eq('two saves at once both land, in order', r.file.state.printLog.map((p) => p.entryId), ['e1', 'e2', 'e3']);
  const stale = file;
  await r.file.save((s) => Store.mapInfant(s, 'SY-3', { name: 'n', an: '33333/69' }, 'a', 'b', today));
  eq('a second tab writing first stops this tab\'s write', await refused(() => stale.save(() => {})), 'changedElsewhere');
  file = r.file;

  section('§7 the seen date and the purge');
  const probe = JSON.parse(JSON.stringify(file.state));
  ok('a newer order moves the date', Store.touchSeen(probe, ['SY-1'], '2026-11-17'));
  ok('the same date again writes nothing', !Store.touchSeen(probe, ['SY-1'], '2026-11-17'));
  ok('an unmapped ID stores nothing', !Store.touchSeen(probe, ['UNMAPPED'], '2026-11-17') && !probe.infants.UNMAPPED);
  await file.save((s) => { Store.touchSeen(s, ['SY-1'], '2026-11-17'); });
  today = '2026-12-16';
  await file.save(() => {});
  eq('30 days after SY-2 was last seen it is still there', !!file.state.infants['SY-2'], true);
  eq('…and SY-1, a day newer', !!file.state.infants['SY-1'], true);
  today = '2026-12-17';
  r = await pc.store.openFile(folder);
  eq('past 30 days the open removes it', [!!r.file.state.infants['SY-2'], !!r.file.state.infants['SY-1']], [false, true]);
  eq('old print-log lines go with it', r.file.state.printLog, []);
  ok('…and that is written back', !(await pc.store.openFile(folder)).file.state.infants['SY-2']);
  today = '2026-11-16';

  section('§8 a lost passphrase');
  const lost = fakeFolder('TPN');
  const lostPc = device();
  const first = await lostPc.store.createFile(lost, PASS);
  await first.save((s) => Store.mapInfant(s, 'SY-1', { name: SENTINEL, an: '12345/69' }, 'a', 'b', today));
  const oldText = lost.files.get(FN).text;
  const fresh = await lostPc.store.replaceFile(lost, 'another-room-passphrase');
  eq('the new file is empty', Object.keys(fresh.state.infants), []);
  eq('it says the print log is gone, and when', fresh.state.meta.logLostOn, today);
  const kept = [...lost.files.keys()].filter((f) => f !== FN);
  eq('the old file stays beside it', kept.length, 1);
  eq('byte for byte', lost.files.get(kept[0]).text === oldText, true);
  eq('a new device opens it with the new passphrase only', await refused(() => device().store.openFile(lost, PASS)), 'wrongPassphrase');

  section('§9 the folder is remembered');
  ok('the store keeps the folder handle in the box', (await pc.store.savedFolder()) === folder || await pc.store.savedFolder());
  await pc.store.forgetFolder();
  eq('and can forget it', await pc.store.savedFolder(), undefined);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
