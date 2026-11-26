// mutate-mybm-push.cjs — does verify-mybm-push-1127.cjs notice wrong code?
//
// Each entry below makes one small change to gas-backend.gs § MyBreastmilk push in
// a temp copy and runs the harness against it (NEOFEED_GAS_SRC). A mutation is
// KILLED when the harness fails or does not finish in 60 s, and SURVIVED when it
// still passes: a survivor is a behaviour no assertion pins. Not a harness: CI
// runs test/verify-*.cjs only. Run it by hand after changing that block or its
// harness:
//
//   node test/mutate-mybm-push.cjs          (exit 1 if any mutation survives)
//
// An anchor that no longer occurs exactly once in gas-backend.gs is an error,
// not a pass: fix the entry.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SRC = path.join(__dirname, '..', 'gas-backend.gs');
const HARNESS = path.join(__dirname, 'verify-mybm-push-1127.cjs');
const src = fs.readFileSync(SRC, 'utf8');

const M = [
  ['superseded rows kept', 'if (r[37]) continue;   // superseded', 'if (false) continue;   // superseded'],
  ['drafts kept', '.trim().toLowerCase() === "draft") continue;\n    if (r[0]', '.trim() === "draft") continue;\n    if (r[0]'],
  ['future orders kept', 'if (!key || key > todayKey) continue;', 'if (!key) continue;'],
  ['tie by row only', '(key === bestKey && rev >= bestRev)', '(key === bestKey)'],
  ['status before identity', 'if (codes.length) { env.status = "mismatch"; env.checks = codes; return env; }\n  if (_readStatus(row[9]) !== "Active") { env.status = "inactive"; return env; }',
    'if (_readStatus(row[9]) !== "Active") { env.status = "inactive"; return env; }\n  if (codes.length) { env.status = "mismatch"; env.checks = codes; return env; }'],
  ['free-text bed sent', 'env.sourceBed = PHARMACY_WARD_BED.test(bed) ? bed : null;', 'env.sourceBed = bed || null;'],
  ['feed given by volume alone', 'if (!(v * f > 0)) {', 'if (!(v > 0)) {'],
  ['no feed_incomplete', 'return v > 0 && f === 0 ? { none: true, code: "feed_incomplete" } : { none: true };', 'return { none: true };'],
  ['300 mL bound off', 'if (v > 300 || ', 'if (v > 3000 || '],
  ['DOL 0 kept', 'if (dol === 0) { if', 'if (dol === -1) { if'],
  ['future weight kept', 'if (date > todayKey) {', 'if (false) {'],
  ['first duplicate kept', 'byDol[dol] = { dol: dol', 'if (!byDol[dol]) byDol[dol] = { dol: dol'],
  ['blank cell uses fallback', 'var list = (cell === "" || cell == null) ? null : _parseJson(cell, null);', 'var list = (cell === "" || cell == null) ? [{ dol: 1, w: bw }] : _parseJson(cell, null);'],
  ['no 120 cap', 'points = points.slice(-MYBM_WEIGHTS_MAX);', ''],
  ['count-only multiple dropped', 'if (twin || count !== null) {', 'if (twin) {'],
  ['chunk of 25', 'var MYBM_PUSH_CHUNK = 20;', 'var MYBM_PUSH_CHUNK = 25;'],
  ['401 does not stop', 'if (rc === 401) refused = true;', ''],
  ['no audit', 'logAudit("mybmPush", chunk[k].sessionId, MYBM_PUSH_ACTOR);', ''],
  ['failures do not throw', 'if (counts.failed > 0 || counts.tooLarge > 0) {', 'if (false) {'],
  ['switch reads truthy', 'if (props.getProperty("MYBM_PUSH_ENABLED") !== "true") {', 'if (!props.getProperty("MYBM_PUSH_ENABLED")) {'],
  ['http allowed', 'if (!/^https:\\/\\/\\S+$/.test(url)) {', 'if (!/^https?:\\/\\/\\S+$/.test(url)) {'],
  ['wrong signing string', 'computeHmacSha256Signature(stamp + "." + payload', 'computeHmacSha256Signature(stamp + payload'],
  ['untrusted DOB used', 'if (dobKey !== link.expectedDob || !dobTrusted) codes.push("dob_mismatch");', 'if (dobKey !== link.expectedDob) codes.push("dob_mismatch");'],
  ['DOB after admission trusted', '    && (admKey === "" || dobKey <= admKey);', '    && true;'],
  ['DOB of 2000-01-01 refused', 'dobKey >= "2000-01-01" && dobKey <= todayKey', 'dobKey > "2000-01-01" && dobKey <= todayKey'],
  ['DOB of today refused', '&& dobKey <= todayKey\n', '&& dobKey < todayKey\n'],
  ['blank admission distrusts the DOB', '    && (admKey === "" || dobKey <= admKey);', '    && dobKey <= admKey;'],
  ['signing error passes through', 'catch (e) { unsigned = true; break; }', 'catch (e) { throw e; }'],
  ['unreachable throw dropped', '  if (failedCodes.unreachable) {\n    throw', '  if (false) {\n    throw'],
  ['signing inside the network try', '      try { reqs = chunk.map(function (q) { return _mybmSigned(url, secret, q.payload); }); }\n      catch (e) { unsigned = true; break; }\n      var resps = null;\n      try { resps = UrlFetchApp.fetchAll(reqs); }',
    '      var resps = null;\n      try { reqs = chunk.map(function (q) { return _mybmSigned(url, secret, q.payload); }); resps = UrlFetchApp.fetchAll(reqs); }'],
  ['repeated sessionId kept', 'if (sidCount["s:" + v.sessionId] > 1 || idCount', 'if (idCount'],
  ['repeated linkId kept', ' || idCount["i:" + v.linkId.toLowerCase()] > 1) { skipped++; continue; }', ') { skipped++; continue; }'],
  ['card DOL from column C', 'var dol = Math.round((Date.parse(bestKey + "T00:00:00Z") - Date.parse(dobKey + "T00:00:00Z")) / 86400000) + 1;', 'var dol = Number(best[2]);'],
  ['order before birth kept', '!isFinite(dol) || dol < 1 || dol > 400)', '!isFinite(dol) || dol > 400)'],
  ['links network error passes through', 'catch (e) { throw new Error("mybm push: MyBM could not be reached on the links request', 'catch (e) { throw e; throw new Error("mybm push: MyBM could not be reached on the links request'],
  ['chunk network error not audited', '          counts.failed++;\n          logAudit("mybmPush", chunk[u].sessionId, MYBM_PUSH_ACTOR);', '          counts.failed++;'],
  ['unknown 200 status counted', 'MYBM_RECEIPTS[receipt] === true) { counts[receipt]++; continue; }', 'true) { counts[receipt] = (counts[receipt] || 0) + 1; continue; }'],
  ['registration by equality off', 'if (!reg && points.length && points[0].first && Number(bw) === points[0].w) reg = points[0];', ''],
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neofeed-mut-'));
const file = path.join(tmp, 'gas-mutant.gs');
let survived = 0, broken = 0;
for (const [name, from, to] of M) {
  const count = src.split(from).length - 1;
  if (count !== 1) { console.log('ANCHOR  ' + name + '  (found ' + count + ' times)'); broken++; continue; }
  fs.writeFileSync(file, src.replace(from, () => to));
  const r = spawnSync(process.execPath, [HARNESS], { env: Object.assign({}, process.env, { NEOFEED_GAS_SRC: file }), encoding: 'utf8', timeout: 60000 });
  const last = String(r.stdout || '').trim().split('\n').pop() || '';
  const passed = r.status === 0 && /ALL PASS/.test(last);
  if (passed) survived++;
  console.log((passed ? 'SURVIVED' : 'killed  ') + '  ' + name + (r.error && r.error.code === 'ETIMEDOUT' ? '  (did not finish)' : ''));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + M.length + ' mutations: ' + (M.length - survived - broken) + ' killed, ' + survived + ' survived, ' + broken + ' with a stale anchor');
process.exit(survived || broken ? 1 : 0);
