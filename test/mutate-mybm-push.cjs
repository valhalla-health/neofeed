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
  ['tie by row only', '(key === bestKey && rev >= bestRev)', '(key === bestKey)'],
  ['status before identity', 'if (codes.length) { env.status = "mismatch"; env.checks = codes; return env; }\n  if (_readStatus(row[9]) !== "Active") { env.status = "inactive"; return env; }',
    'if (_readStatus(row[9]) !== "Active") { env.status = "inactive"; return env; }\n  if (codes.length) { env.status = "mismatch"; env.checks = codes; return env; }'],
  ['free-text bed sent', 'env.sourceBed = PHARMACY_WARD_BED.test(bed) ? bed : null;', 'env.sourceBed = bed || null;'],
  ['feed given by volume alone', 'if (!(v * f > 0)) {', 'if (!(v > 0)) {'],
  ['no feed_incomplete', 'return v > 0 && f === 0 ? { none: true, code: "feed_incomplete" } : { none: true };', 'return { none: true };'],
  ['300 mL bound off', 'if (v > 300 || ', 'if (v > 3000 || '],
  ['superseded rows kept (card)', 'if (r[37]) continue;   // superseded (AL), as pharmacyOrders', 'if (false) continue;   // superseded (AL), as pharmacyOrders'],
  ['card DOL from column C', '  var dol = _mybmDolOf(dobKey, bestKey);\n', '  var dol = Number(best[2]);\n'],
  ['DOL 0 dropped', 'if (dol === 0) dol = 1;', 'if (dol === 0) continue;'],
  ['first duplicate kept', '    byDol[point.dol] = point;\n', '    if (!byDol[point.dol]) byDol[point.dol] = point;\n'],
  ['order weights ignored', '    final.push({ key: key, w: ow, at: j });\n', ''],
  ['superseded order weights kept', '    if (r[37]) continue;   // superseded (AL)\n', ''],
  ['tomorrow\'s order weight kept', '    if (o.key > todayKey) continue;', '    if (false) continue;'],
  ['earlier row on a date wins', '(a.key > b.key ? 1 : a.at - b.at)', '(a.key > b.key ? 1 : b.at - a.at)'],
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
  ['future orders kept (card)', '    if (!_mybmIsDateKey(key) || key > todayKey) continue;   // an order already written for tomorrow is not today\'s', '    if (!_mybmIsDateKey(key)) continue;   // an order already written for tomorrow is not today\'s'],
  ['drafts kept (card)', '.trim().toLowerCase() === "draft") continue;\n    var key = _fmtDate(r[0]);   // as the ward sync sends the date', '.trim() === "x") continue;\n    var key = _fmtDate(r[0]);   // as the ward sync sends the date'],
  ['weight bound off', '    if (q.w < 200 || q.w > 8000) bad("weights_out_of_range");\n', ''],
  ['future weight kept', '    if (q.date > todayKey) bad("weights_future_date");\n', ''],
  ['blank chart weight skipped', '    if (p.w == null) continue;   // a length or HC only', '    if (p.w == null || p.w === "") continue;   // a length or HC only'],
  ['undated order weight dropped', '    if (!_mybmIsDateKey(key)) return unreadable;   // a weight NeoFeed would place by column C', '    if (!_mybmIsDateKey(key)) continue;   // a weight NeoFeed would place by column C'],
  ['negative order weight kept', '    if (!isFinite(ow) || ow <= 0) continue;', '    if (!isFinite(ow) || ow === 0) continue;'],
  ['registration by equality off', '  if (!reg) for (var n = 0; n < points.length; n++) if (points[n].first && Number(bw) === points[n].w) reg = points[n];\n', ''],
  ['legacy flag only on the lowest DOL', '  if (!reg) for (var n = 0; n < points.length; n++) if (points[n].first && Number(bw) === points[n].w) reg = points[n];\n', '  if (!reg && points.length && points[0].first && Number(bw) === points[0].w) reg = points[0];\n'],
  ['draft order weights kept', '    if (status.toLowerCase() === "draft") continue;   // a draft, as data.js isDraftEntry reads it\n', ''],
  ['odd " draft " sent', '    if (status.trim().toLowerCase() === "draft") return unreadable;\n', ''],
  ['odd " draft " read as a draft', '    if (status.trim().toLowerCase() === "draft") return unreadable;\n', '    if (status.trim().toLowerCase() === "draft") continue;\n'],
  ['date check before the filters', '    if (r[37]) continue;   // superseded (AL)\n', '    if (!_mybmIsDateKey(_fmtDate(r[0]))) return unreadable;\n    if (r[37]) continue;   // superseded (AL)\n'],
  ['weights date by _wardDateKey', '    var key = _fmtDate(r[0]);\n    if (!_mybmIsDateKey(key)) return unreadable;', '    var key = _wardDateKey(r[0]);\n    if (!_mybmIsDateKey(key)) return unreadable;'],
  ['card date by _wardDateKey', '    var key = _fmtDate(r[0]);   // as the ward sync sends the date', '    var key = _wardDateKey(r[0]);   // as the ward sync sends the date'],
  ['order before birth off DOL 1', 'put({ dol: Math.max(1, odol), w: o.w, first: false, beforeBirth: odol < 1 });', 'put({ dol: odol, w: o.w, first: false, beforeBirth: odol < 1 });'],
  ['order before birth shown as the birth weight', '    if (q.dol > 400 || q.beforeBirth) return unreadable;\n', '    if (q.dol > 400) return unreadable;\n'],
  ['last registry row kept', '      if (want[sid] === true && !Object.prototype.hasOwnProperty.call(rowOf, sid)) rowOf[sid] = pat[i];\n', '      if (want[sid] === true) rowOf[sid] = pat[i];\n'],
  ['past DOL 400 kept', '    if (q.dol > 400 || q.beforeBirth) return unreadable;\n', '    if (q.beforeBirth) return unreadable;\n'],
  ['order point takes the legacy flag', 'w: o.w, first: false, beforeBirth: odol < 1 });', 'w: o.w, first: true, beforeBirth: odol < 1 });'],
  ['order bound checked before the merge', '    var odol = _mybmDolOf(dobKey, o.key);\n', '    if (o.w < 200 || o.w > 8000) return { weights: null, codes: ["weights_out_of_range"] };\n    var odol = _mybmDolOf(dobKey, o.key);\n'],
  ['links signing error passes through', '  } catch (e) { throw new Error("mybm push: the links request could not be signed', '  } catch (e) { throw e; throw new Error("mybm push: the links request could not be signed'],
  ['whole queue signed up front', '    var refused = false, unreachable = false;\n', '    var refused = false, unreachable = false;\n    queue.forEach(function (q) { _mybmSigned(url, secret, q.payload); });\n'],
  ['unreachable throw dropped', '  if (failedCodes.unreachable) {\n    throw', '  if (false) {\n    throw'],
  ['signing inside the network try', '      try { reqs = chunk.map(function (q) { return _mybmSigned(url, secret, q.payload); }); }\n      catch (e) { unsigned = true; break; }\n      var resps = null;\n      try { resps = UrlFetchApp.fetchAll(reqs); }',
    '      var resps = null;\n      try { reqs = chunk.map(function (q) { return _mybmSigned(url, secret, q.payload); }); resps = UrlFetchApp.fetchAll(reqs); }'],
  ['repeated sessionId kept', 'if (sidCount["s:" + v.sessionId] > 1 || idCount', 'if (idCount'],
  ['repeated linkId kept', ' || idCount["i:" + v.linkId.toLowerCase()] > 1) { skipped++; continue; }', ') { skipped++; continue; }'],
  ['order before birth kept', '!isFinite(dol) || dol < 1 || dol > 400)', '!isFinite(dol) || dol > 400)'],
  ['links network error passes through', 'catch (e) { throw new Error("mybm push: MyBM could not be reached on the links request', 'catch (e) { throw e; throw new Error("mybm push: MyBM could not be reached on the links request'],
  ['chunk network error not audited', '          counts.failed++;\n          logAudit("mybmPush", chunk[u].sessionId, MYBM_PUSH_ACTOR);', '          counts.failed++;'],
  ['unknown 200 status counted', 'MYBM_RECEIPTS[receipt] === true) { counts[receipt]++; continue; }', 'true) { counts[receipt] = (counts[receipt] || 0) + 1; continue; }'],
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
