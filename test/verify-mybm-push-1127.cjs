// verify-mybm-push-1127.cjs — the MyBreastmilk push (gas-backend.gs § MyBreastmilk
// push, 2026-11-27).
//
// NeoFeed sends MyBreastmilk (MyBM), twice a day, each linked infant's weights
// and the feeds on the current order. MyBM never calls NeoFeed. The design is
// MyBM's docs/superpowers/specs/2026-11-27-neofeed-push-design.md (signed by Pp,
// 2026-11-27); the section numbers below are that spec's.
//
//   §1  Off unless MYBM_PUSH_ENABLED is exactly "true": no fetch, no sheet read.
//       A missing or plain-http URL, or a short secret, stops before any fetch.
//   §2  Identity before status (spec §3 step 4): no registry row is `inactive`
//       with not_in_registry; a DOB or admission date that differs is `mismatch`,
//       even for an infant who has left; only then a status that is not Active
//       is `inactive`. Only `current` carries bed, multiple, weights and card.
//   §3  Which order's card (§5.1): not superseded (AL) and not a draft (O, any
//       case and spacing); an I/O-only revision and a row from before published
//       existed both count; never an order dated after today; a tie goes to the
//       highest revisionNumber; a TPN and a no-TPN order alike.
//   §4  Feeds (§4.2, §5.1 rule 5): a feed is given when volume × feeds > 0, the
//       Calculator's own test (feed2Given, read from calculator.jsx); an NPO day
//       written as 0 mL × 8 is no feed and no flag; a volume with 0 feeds is
//       feed_incomplete and the card still goes; a bound broken, or an order
//       that does not parse, sends no card.
//   §5  Weights (§5.2): dates from DOB and DOL; DOL 0 left out with its code;
//       two points on one DOL keep the later; a point with no weight left out;
//       a future date or a weight out of 200–8000 fails closed; a blank or broken
//       cell is weights_unreadable; the registration flag; the newest 120 only.
//   §6  Bed and multiple (§4.2): a ward bed only, canonical; a twin letter A–D;
//       a typed "Twin A" is twin_suffix_unreadable; a multiplesCount of 2–4 with
//       no letter still sends `multiple` (§0 item 3: NeoFeed records a multiple).
//   §7  What never leaves: no sessionId, name or initials in any envelope.
//   §8  The run: one links call, the registry and Daily_Log read once, envelopes
//       in chunks of 20 through fetchAll with muteHttpExceptions, each request
//       signed (x-nf-timestamp, x-nf-signature = hex HMAC-SHA256 of
//       timestamp + "." + body), one Audit_Log row per envelope sent.
//   §9  Answers: a 401 to the links call or inside a chunk stops the run and
//       throws; any other non-200 inside a chunk leaves the other envelopes
//       alone, and the run throws at the end with counts; an unreadable links
//       answer throws before any sheet read; a bad link entry is skipped.
//   §10 Logs and thrown messages carry no sessionId, name, URL or secret.
//
// Run: node test/verify-mybm-push-1127.cjs

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { boot, recorder, withNow, addDays, bkkMidnight } = require('./gas-vm-sandbox.cjs');

const t = recorder('verify-mybm-push-1127');

const SECRET = 'test-secret-'.padEnd(40, 'x');
const URL = 'https://mybm.example.test/functions/v1/receive-neofeed';
// 2026-11-27 16:12 Bangkok.
const NOW = Date.parse('2026-11-27T09:12:03.120Z');
const TODAY = '2026-11-27';
const DOB = '2026-11-20';
const ADM = '2026-11-20';

const uuid = () => crypto.randomUUID();
const ci = (o) => JSON.stringify(Object.assign({ wtG: 1000 }, o));

function freshBoot(opts) {
  const g = boot();
  if (!(opts && opts.off)) {
    g.props.set('MYBM_PUSH_ENABLED', 'true');
    g.props.set('MYBM_PUSH_URL', URL);
    g.props.set('MYBM_PUSH_SECRET', SECRET);
  }
  return g;
}

// A registry row, sheet shaped, for an infant born DOB and admitted ADM.
function pat(g, sid, extra) {
  return g.patRow(sid, Object.assign({ 6: bkkMidnight(DOB), 7: bkkMidnight(ADM), 3: 980,
    10: 'NICU 3', 12: JSON.stringify([{ dol: 1, w: 980 }, { dol: 8, w: 1040 }]) }, extra || {}));
}
// A Daily_Log row for `sid` dated `key` (a Date at Bangkok midnight, as Sheets returns it).
function order(g, sid, key, extra) {
  return g.logRow(sid, bkkMidnight(key), Object.assign({ 24: ci({ enType: 'BM_20', enVol: 3, enFreq: 8 }) }, extra || {}));
}
const link = (sid, o) => Object.assign({ linkId: uuid(), sessionId: sid, expectedDob: DOB, expectedAdmissionDate: ADM }, o || {});

// wardFeedEnvelope at NOW, today TODAY.
function env(g, row, orders, lk) {
  return withNow(NOW, () => g.sb.wardFeedEnvelope(row, orders || [], lk, TODAY, { nowMs: NOW, deliveryId: 'd-' + lk.linkId }));
}

// ── a fake MyBM, recording every request ──
function fakeMybm(g, opts) {
  opts = opts || {};
  const calls = { fetch: [], fetchAll: [] };
  const answerOf = opts.answer || (() => ({ code: 200, body: { status: 'accepted' } }));
  const resp = (a) => ({ getResponseCode: () => a.code, getContentText: () => (typeof a.body === 'string' ? a.body : JSON.stringify(a.body)) });
  g.sb.UrlFetchApp = {
    fetch(url, params) {
      calls.fetch.push({ url, params });
      if (opts.linksCode) return resp({ code: opts.linksCode, body: '{}' });
      return resp({ code: 200, body: opts.linksBody !== undefined ? opts.linksBody : { links: opts.links || [] } });
    },
    fetchAll(reqs) {
      calls.fetchAll.push(reqs);
      return reqs.map((r, i) => resp(answerOf(JSON.parse(r.payload), calls.fetchAll.length - 1, i)));
    },
  };
  return calls;
}
function countDataReads(g, tab) {
  const n = { reads: 0 };
  const sh = g.sheet(tab);
  sh.hooks.beforeRead = (s, r, c, nr) => { if (r >= 2 || nr > 1) n.reads++; };
  return n;
}
function hmacHex(stamp, raw) {
  return crypto.createHmac('sha256', Buffer.from(SECRET, 'utf8')).update(Buffer.from(stamp + '.' + raw, 'utf8')).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
t.section('§1 off unless MYBM_PUSH_ENABLED is exactly "true"', () => {
  for (const v of [undefined, '', 'TRUE', 'yes', ' true']) {
    const g = freshBoot();
    if (v === undefined) g.props.delete('MYBM_PUSH_ENABLED'); else g.props.set('MYBM_PUSH_ENABLED', v);
    const calls = fakeMybm(g, { links: [link('S1')] });
    const reads = countDataReads(g, 'Daily_Log');
    const out = withNow(NOW, () => g.sb.mybmPushRun());
    t.ok('MYBM_PUSH_ENABLED ' + JSON.stringify(v) + ': no fetch', calls.fetch.length === 0 && calls.fetchAll.length === 0, calls);
    t.ok('MYBM_PUSH_ENABLED ' + JSON.stringify(v) + ': no Daily_Log read', reads.reads === 0, reads);
    t.ok('MYBM_PUSH_ENABLED ' + JSON.stringify(v) + ': returns enabled false', out && out.enabled === false, out);
  }
  const cases = [
    ['URL missing', (g) => g.props.delete('MYBM_PUSH_URL')],
    ['URL plain http', (g) => g.props.set('MYBM_PUSH_URL', 'http://mybm.example.test/x')],
    ['secret missing', (g) => g.props.delete('MYBM_PUSH_SECRET')],
    ['secret of 31 characters', (g) => g.props.set('MYBM_PUSH_SECRET', 'x'.repeat(31))],
  ];
  for (const [name, set] of cases) {
    const g = freshBoot();
    set(g);
    const calls = fakeMybm(g, { links: [link('S1')] });
    let threw = null;
    try { withNow(NOW, () => g.sb.mybmPushRun()); } catch (e) { threw = String(e.message); }
    t.ok(name + ': throws before any fetch', threw !== null && calls.fetch.length === 0, { threw, calls: calls.fetch.length });
    t.ok(name + ': the message names no value', threw !== null && threw.indexOf(SECRET) === -1 && threw.indexOf('mybm.example.test') === -1, threw);
  }
});

t.section('§2 identity before status', () => {
  const g = freshBoot();
  const lk = link('S1');
  const none = env(g, null, [], lk);
  t.eq('no registry row: inactive', none.status, 'inactive');
  t.eq('no registry row: not_in_registry', none.checks, ['not_in_registry']);
  t.ok('no registry row: bed, multiple, weights, card all null',
    none.sourceBed === null && none.multiple === null && none.weights === null && none.feedCard === null, none);

  const dobOff = env(g, pat(g, 'S1', { 6: bkkMidnight('2026-11-19') }), [], lk);
  t.eq('DOB differs: mismatch', [dobOff.status, dobOff.checks], ['mismatch', ['dob_mismatch']]);
  const admOff = env(g, pat(g, 'S1', { 7: bkkMidnight('2026-11-21') }), [], lk);
  t.eq('admission differs: mismatch', [admOff.status, admOff.checks], ['mismatch', ['admission_mismatch']]);
  const both = env(g, pat(g, 'S1', { 6: bkkMidnight('2026-11-19'), 7: bkkMidnight('2026-11-21') }), [], lk);
  t.eq('both differ: both codes, in order', both.checks, ['dob_mismatch', 'admission_mismatch']);
  const leftWrong = env(g, pat(g, 'S1', { 6: bkkMidnight('2026-11-19'), 9: 'Discharged' }), [], lk);
  t.eq('the wrong infant, who has left: mismatch, not inactive', leftWrong.status, 'mismatch');
  t.ok('mismatch carries no data', leftWrong.weights === null && leftWrong.feedCard === null && leftWrong.sourceBed === null, leftWrong);
  const dobText = env(g, pat(g, 'S1', { 6: DOB, 7: ADM }), [], lk);
  t.eq('dates stored as text read the same', dobText.status, 'current');
  const blankDob = env(g, pat(g, 'S1', { 6: '' }), [], lk);
  t.eq('a blank DOB is a mismatch', blankDob.checks, ['dob_mismatch']);

  for (const st of ['Discharged', 'Transferred', 'Expired', 'expired ']) {
    const e = env(g, pat(g, 'S1', { 9: st }), [order(g, 'S1', TODAY)], lk);
    t.ok('status ' + JSON.stringify(st) + ': inactive with no data and no code',
      e.status === 'inactive' && e.checks.length === 0 && e.weights === null && e.feedCard === null && e.sourceBed === null && e.multiple === null, e);
  }
  const blank = env(g, pat(g, 'S1', { 9: '' }), [], lk);
  t.eq('a blank status reads as Active', blank.status, 'current');

  const e = env(g, pat(g, 'S1'), [order(g, 'S1', TODAY)], lk);
  t.eq('envelope keys, exactly', Object.keys(e).sort(), ['checks', 'deliveryId', 'feedCard', 'generatedAt', 'linkId', 'multiple',
    'schema', 'sender', 'sequence', 'sourceBed', 'status', 'validUntil', 'weights'].sort());
  t.eq('schema and sender', [e.schema, e.sender], ['ward-feed-v1', 'neofeed']);
  t.eq('linkId is the link\'s', e.linkId, lk.linkId);
  t.eq('sequence is the clock in ms', e.sequence, NOW);
  t.eq('generatedAt', e.generatedAt, '2026-11-27T09:12:03.120Z');
  t.eq('validUntil is 26 h later', e.validUntil, '2026-11-28T11:12:03.120Z');
});

t.section('§3 which order\'s card', () => {
  const g = freshBoot();
  const lk = link('S1');
  const row = pat(g, 'S1');
  const card = (orders) => env(g, row, orders, lk).feedCard;
  const v = (n) => ci({ enType: 'BM_20', enVol: n, enFreq: 8 });

  t.eq('today\'s order', card([order(g, 'S1', TODAY, { 2: 8 })]), { orderDate: TODAY, dol: 8, feeds: [{ feedKey: 'BM_20', mlPerFeed: 3, feedsPerDay: 8 }] });
  t.eq('no order: no card', card([]), null);
  t.eq('a superseded row is skipped', card([
    order(g, 'S1', TODAY, { 24: v(5), 37: '2026-11-27T05:00:00.000Z' }),
    order(g, 'S1', TODAY, { 24: v(4), 35: 2 }),
  ]).feeds[0].mlPerFeed, 4);
  t.eq('a superseded row is skipped even with the higher revisionNumber', card([
    order(g, 'S1', TODAY, { 24: v(4), 35: 1 }),
    order(g, 'S1', TODAY, { 24: v(5), 35: 2, 37: '2026-11-27T05:00:00.000Z' }),
  ]).feeds[0].mlPerFeed, 4);
  t.eq('today\'s only submitted row superseded by a draft: yesterday\'s card shows', card([
    order(g, 'S1', addDays(TODAY, -1), { 24: v(2) }),
    order(g, 'S1', TODAY, { 24: v(5), 37: '2026-11-27T05:00:00.000Z' }),
    order(g, 'S1', TODAY, { 24: v(6), 14: 'draft', 35: 2 }),
  ]).orderDate, addDays(TODAY, -1));
  for (const st of ['draft', 'Draft', ' DRAFT ']) {
    t.eq('status ' + JSON.stringify(st) + ' is a draft, skipped: yesterday\'s card shows', card([
      order(g, 'S1', addDays(TODAY, -1), { 24: v(2) }),
      order(g, 'S1', TODAY, { 24: v(6), 14: st }),
    ]), { orderDate: addDays(TODAY, -1), dol: 7, feeds: [{ feedKey: 'BM_20', mlPerFeed: 2, feedsPerDay: 8 }] });
  }
  t.eq('an I/O-only revision (published blank) counts', card([
    order(g, 'S1', TODAY, { 24: v(5), 33: '2026-11-27T02:00:00.000Z', 37: '2026-11-27T04:00:00.000Z' }),
    order(g, 'S1', TODAY, { 24: v(5), 33: '', 35: 2, 36: 'prev' }),
  ]).feeds[0].mlPerFeed, 5);
  const elder = pat(g, 'S1', { 6: bkkMidnight('2026-10-01'), 7: bkkMidnight('2026-10-01') });
  const elderLink = link('S1', { expectedDob: '2026-10-01', expectedAdmissionDate: '2026-10-01' });
  t.eq('a row from before published existed counts', env(g, elder, [order(g, 'S1', '2026-10-20', { 24: v(7) })], elderLink).feedCard.orderDate, '2026-10-20');
  t.eq('an order dated tomorrow is not today\'s', card([
    order(g, 'S1', TODAY, { 24: v(3) }),
    order(g, 'S1', addDays(TODAY, 1), { 24: v(9) }),
  ]).feeds[0].mlPerFeed, 3);
  t.eq('only a future order: no card', card([order(g, 'S1', addDays(TODAY, 1))]), null);
  t.eq('the newest date wins over row order', card([
    order(g, 'S1', TODAY, { 24: v(4) }),
    order(g, 'S1', addDays(TODAY, -2), { 24: v(1) }),
  ]).feeds[0].mlPerFeed, 4);
  t.eq('a tie goes to the highest revisionNumber', card([
    order(g, 'S1', TODAY, { 24: v(6), 35: 3 }),
    order(g, 'S1', TODAY, { 24: v(5), 35: 2 }),
  ]).feeds[0].mlPerFeed, 6);
  t.eq('a no-TPN order counts as much as a TPN one', card([order(g, 'S1', TODAY, { 13: '', 24: v(8) })]).feeds[0].mlPerFeed, 8);
  t.eq('a date stored as text reads the same', card([order(g, 'S1', TODAY, { 0: TODAY })]).orderDate, TODAY);
  t.eq('a row with no date is skipped', card([order(g, 'S1', TODAY, { 0: '' })]), null);
  const old = env(g, elder, [order(g, 'S1', '2026-11-01', { 2: 12 })], elderLink);
  t.ok('an old order still shows, with its own date (no age limit)', old.feedCard && old.feedCard.orderDate === '2026-11-01' && old.feedCard.dol === 32, old.feedCard);
});

t.section('§4 feeds', () => {
  const g = freshBoot();
  const lk = link('S1');
  const row = pat(g, 'S1');
  const run = (c) => env(g, row, [order(g, 'S1', TODAY, { 24: typeof c === 'string' ? c : ci(c) })], lk);

  // The Calculator's own test for a given feed, read from calculator.jsx.
  const src = fs.readFileSync(path.join(__dirname, '..', 'calculator.jsx'), 'utf8');
  const m = src.match(/const feed2Given = (\(o\) => [^;]+);/);
  t.ok('calculator.jsx still defines feed2Given', !!m);
  const feed2Given = m ? eval(m[1]) : () => false;   // eslint-disable-line no-eval
  const fixtures = [
    { enType: 'BM_20', enVol: 3, enFreq: 8, enType2: 'PRENAN_24', enVol2: 2, enFreq2: 4 },
    { enType: 'BM_20', enVol: 3, enFreq: 8, enType2: 'PRENAN_24', enVol2: 0, enFreq2: 8 },
    { enType: 'BM_20', enVol: 0, enFreq: 8, enType2: 'DONOR_BM', enVol2: 5, enFreq2: 8 },
    { enType: 'BM_20', enVol: 0, enFreq: 8 },
    { enType: 'BM_20', enVol: 3, enFreq: 8 },
    { enType: 'BM_HMF_24', enVol: '2.5', enFreq: '12' },
  ];
  for (const f of fixtures) {
    const feeds = run(f).feedCard.feeds;
    const want1 = feed2Given({ enVol2: f.enVol, enFreq2: f.enFreq });
    const want2 = feed2Given(f);
    t.ok('feeds of ' + JSON.stringify(f) + ' match the Calculator', feeds.length === (want1 ? 1 : 0) + (want2 ? 1 : 0)
      && (!want1 || feeds[0].feedKey === f.enType) && (!want2 || feeds[feeds.length - 1].feedKey === f.enType2), feeds);
  }
  const two = run({ enType: 'BM_20', enVol: 3, enFreq: 8, enType2: 'PRENAN_24', enVol2: 2, enFreq2: 4 });
  t.eq('two feeds, feed 1 first', two.feedCard.feeds, [
    { feedKey: 'BM_20', mlPerFeed: 3, feedsPerDay: 8 }, { feedKey: 'PRENAN_24', mlPerFeed: 2, feedsPerDay: 4 }]);
  t.eq('numbers stored as text are read', run({ enType: 'BM_HMF_24', enVol: '2.5', enFreq: '12' }).feedCard.feeds,
    [{ feedKey: 'BM_HMF_24', mlPerFeed: 2.5, feedsPerDay: 12 }]);
  const npo = run({ enType: 'BM_20', enVol: 0, enFreq: 8 });
  t.ok('NPO written as 0 mL × 8: a card with no feed and no code', npo.feedCard && npo.feedCard.feeds.length === 0 && npo.checks.length === 0, npo);
  const npoBlank = run({});
  t.ok('an order with no feed fields: a card with no feed', npoBlank.feedCard && npoBlank.feedCard.feeds.length === 0 && npoBlank.checks.length === 0, npoBlank);
  const slip = run({ enType: 'BM_20', enVol: 3, enFreq: 0, enType2: 'PRENAN_24', enVol2: 2, enFreq2: 4 });
  t.eq('a volume with 0 feeds: feed_incomplete', slip.checks, ['feed_incomplete']);
  t.eq('…and the card still goes without that feed', slip.feedCard.feeds, [{ feedKey: 'PRENAN_24', mlPerFeed: 2, feedsPerDay: 4 }]);
  t.eq('a missing feed key reads as the Calculator\'s default', run({ enVol: 3, enFreq: 8 }).feedCard.feeds[0].feedKey, 'BM_20');
  const bad = [
    ['301 mL a feed', { enType: 'BM_20', enVol: 301, enFreq: 1 }, 'feed_out_of_range'],
    ['25 feeds a day', { enType: 'BM_20', enVol: 1, enFreq: 25 }, 'feed_out_of_range'],
    ['8.5 feeds a day', { enType: 'BM_20', enVol: 1, enFreq: 8.5 }, 'feed_out_of_range'],
    ['3 decimals', { enType: 'BM_20', enVol: 1.255, enFreq: 8 }, 'feed_out_of_range'],
    ['a negative volume', { enType: 'BM_20', enVol: -3, enFreq: 8 }, 'feed_out_of_range'],
    ['both negative', { enType: 'BM_20', enVol: -3, enFreq: -8 }, 'feed_out_of_range'],
    ['a volume that is not a number', { enType: 'BM_20', enVol: 'abc', enFreq: 8 }, 'feed_out_of_range'],
    ['feed 2 out of range', { enType: 'BM_20', enVol: 3, enFreq: 8, enType2: 'BM_20', enVol2: 400, enFreq2: 1 }, 'feed_out_of_range'],
    ['a key in lower case', { enType: 'bm_20', enVol: 3, enFreq: 8 }, 'order_unreadable'],
    ['a blank key with a volume', { enType: '', enVol: 3, enFreq: 8 }, 'order_unreadable'],
    ['a key that is a formula', { enType: '=HYPERLINK("x")', enVol: 3, enFreq: 8 }, 'order_unreadable'],
    ['calcInputJson that does not parse', '{not json', 'order_unreadable'],
    ['calcInputJson that is a list', '[1,2]', 'order_unreadable'],
    ['calcInputJson blank', '', 'order_unreadable'],
  ];
  for (const [name, c, code] of bad) {
    const e = run(c);
    t.ok(name + ': no card, ' + code, e.feedCard === null && e.checks.indexOf(code) !== -1 && e.status === 'current', e);
  }
  t.eq('the card\'s DOL is worked out from the order date and the DOB, not the stale column C',
    env(g, row, [order(g, 'S1', TODAY, { 2: 1 })], lk).feedCard.dol, 8);
  t.eq('…so a blank or broken column C does not drop the card', [
    env(g, row, [order(g, 'S1', TODAY, { 2: 'x' })], lk).feedCard.dol, env(g, row, [order(g, 'S1', TODAY, { 2: '' })], lk).feedCard.dol], [8, 8]);
  const early = env(g, row, [order(g, 'S1', '2026-11-19')], lk);
  t.ok('an order dated before birth: no card, order_unreadable', early.feedCard === null && early.checks.indexOf('order_unreadable') !== -1, early);
  t.ok('weights still go with an unreadable order', run('{not json').weights !== null);
});

t.section('§5 weights', () => {
  const g = freshBoot();
  const lk = link('S1');
  const w = (list, extra) => env(g, pat(g, 'S1', Object.assign({ 12: typeof list === 'string' ? list : JSON.stringify(list) }, extra || {})), [], lk);

  t.eq('points with their dates (DOL 1 is the day of birth) and the registration flag', w([{ dol: 1, w: 980 }, { dol: 8, w: 1040 }]).weights, [
    { dol: 1, date: '2026-11-20', grams: 980, registration: true },
    { dol: 8, date: '2026-11-27', grams: 1040, registration: false }]);
  t.eq('sorted by DOL', w([{ dol: 5, w: 1000 }, { dol: 1, w: 980 }]).weights.map(p => p.dol), [1, 5]);
  t.eq('grams whole', w([{ dol: 2, w: 1000.4 }]).weights[0].grams, 1000);
  const zero = w([{ dol: 0, w: 980 }, { dol: 3, w: 990 }]);
  t.eq('DOL 0 left out, with dol0_skipped', [zero.weights.map(p => p.dol), zero.checks], [[3], ['dol0_skipped']]);
  t.eq('DOL 0 is never the registration weight', zero.weights[0].registration, false);
  t.eq('two points on one DOL: the later kept', w([{ dol: 4, w: 1000 }, { dol: 4, w: 1010 }]).weights, [{ dol: 4, date: '2026-11-23', grams: 1010, registration: false }]);
  t.eq('a point with no weight (length or HC only) left out', w([{ dol: 1, w: 980 }, { dol: 6, w: null, l: 36 }]).weights.map(p => p.dol), [1]);
  t.eq('no point with a weight: an empty list, no code', [w([{ dol: 6, w: null, hc: 26 }]).weights, w([]).checks], [[], []]);
  const fut = w([{ dol: 1, w: 980 }, { dol: 9, w: 1050 }]);
  t.eq('a date after today: weights null, weights_future_date', [fut.weights, fut.checks], [null, ['weights_future_date']]);
  for (const bad of [199, 8001]) {
    const e = w([{ dol: 1, w: 980 }, { dol: 3, w: bad }]);
    t.eq('a weight of ' + bad + ' g: weights null, weights_out_of_range', [e.weights, e.checks], [null, ['weights_out_of_range']]);
  }
  for (const [name, cell] of [['blank', ''], ['broken JSON', '[{dol:1'], ['an object', '{"dol":1}'], ['a bad DOL', '[{"dol":-1,"w":900}]'],
    ['a weight that is text', '[{"dol":2,"w":"heavy"}]'], ['a point that is a list', '[[1,900]]']]) {
    const e = w(cell);
    t.eq('a ' + name + ' cell: weights null, weights_unreadable', [e.weights, e.checks], [null, ['weights_unreadable']]);
  }
  t.ok('…and the read fallback [{dol 1, w bw}] is not used', w('').weights === null);
  const legacy = w([{ dol: 3, w: 980 }, { dol: 8, w: 1040 }], { 3: 980 });
  t.eq('no DOL 1: the first stored point is the registration when it equals bw', legacy.weights.map(p => p.registration), [true, false]);
  t.eq('…and keeps its own DOL and date', legacy.weights[0], { dol: 3, date: '2026-11-22', grams: 980, registration: true });
  t.eq('the first point is not the registration when it differs from bw', w([{ dol: 3, w: 990 }], { 3: 980 }).weights[0].registration, false);
  t.eq('at most one registration flag', w([{ dol: 1, w: 980 }, { dol: 2, w: 980 }], { 3: 980 }).weights.filter(p => p.registration).length, 1);
  const many = [];
  for (let d = 1; d <= 8; d++) many.push({ dol: d, w: 900 + d });
  const longStay = env(g, pat(g, 'S1', { 6: bkkMidnight('2026-03-01'), 7: bkkMidnight('2026-03-01'),
    12: JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ dol: i + 1, w: 900 + i }))) }), [],
    link('S1', { expectedDob: '2026-03-01', expectedAdmissionDate: '2026-03-01' }));
  t.eq('the newest 120 points only', [longStay.weights.length, longStay.weights[0].dol, longStay.weights[119].dol], [120, 81, 200]);
  t.ok('120 points stay under 16 KB', JSON.stringify(longStay).length < 16384, JSON.stringify(longStay).length);
});

t.section('§6 bed and multiple', () => {
  const g = freshBoot();
  const lk = link('S1');
  const e = (extra) => env(g, pat(g, 'S1', extra), [], lk);
  t.eq('a ward bed, canonical', e({ 10: 'nicu-3' }).sourceBed, 'NICU 3');
  t.eq('an iso room bed', e({ 10: 'iso 2 - 1' }).sourceBed, 'iso 2-1');
  t.eq('SCN', e({ 10: 'SCN 12' }).sourceBed, 'SCN 12');
  for (const bed of ['', 'ห้องคลอด', 'NICU 3 (น้องเอ)', '=HYPERLINK("x")', 'Ward 9']) {
    t.eq('a bed of ' + JSON.stringify(bed) + ' sends null', e({ 10: bed }).sourceBed, null);
  }
  t.eq('no twin letter, no count: no multiple', e({ 8: '', 17: 0 }).multiple, null);
  t.eq('twin A of 2', e({ 8: 'a', 17: 2 }).multiple, { suffix: 'A', count: 2 });
  t.eq('a letter with a blank count', e({ 8: 'B', 17: '' }).multiple, { suffix: 'B', count: null });
  const typed = e({ 8: 'Twin A', 17: 2 });
  t.eq('a typed "Twin A": suffix null, twin_suffix_unreadable', [typed.multiple, typed.checks], [{ suffix: null, count: 2 }, ['twin_suffix_unreadable']]);
  t.eq('a count of 2 with no letter still sends multiple', e({ 8: '', 17: 2 }).multiple, { suffix: null, count: 2 });
  t.eq('a count outside 2–4 with no letter: no multiple', [e({ 8: '', 17: 1 }).multiple, e({ 8: '', 17: 5 }).multiple], [null, null]);
});

t.section('§7 what never leaves', () => {
  const g = freshBoot();
  const sid = 'PT-2026-SECRETSID';
  const row = pat(g, sid, { 1: 'ด.ญ. ทดสอบ นามสมมุติ', 2: 'ทน', 11: 'RDS', 8: 'A', 17: 2 });
  const lk = link(sid);
  const variants = [
    env(g, row, [order(g, sid, TODAY)], lk),
    env(g, null, [], lk),
    env(g, pat(g, sid, { 6: bkkMidnight('2026-11-19') }), [], lk),
    env(g, pat(g, sid, { 9: 'Discharged' }), [], lk),
  ];
  for (const v of variants) {
    const s = JSON.stringify(v);
    t.ok(v.status + (v.checks[0] ? ' (' + v.checks[0] + ')' : '') + ': no sessionId, name, initials or diagnosis',
      s.indexOf(sid) === -1 && s.indexOf('ทดสอบ') === -1 && s.indexOf('ทน') === -1 && s.indexOf('RDS') === -1, s);
  }
});

// ── the run ──
function seedWard(g, n) {
  const links = [];
  for (let i = 0; i < n; i++) {
    const sid = 'S' + String(i).padStart(3, '0');
    g.sheet('Patient_Registry').data.push(pat(g, sid));
    g.sheet('Daily_Log').data.push(order(g, sid, TODAY));
    links.push(link(sid));
  }
  return links;
}

t.section('§8 the run', () => {
  const g = freshBoot();
  const links = seedWard(g, 60);
  links.push(link('NOT-IN-NEOFEED'));
  const calls = fakeMybm(g, { links });
  const patReads = countDataReads(g, 'Patient_Registry');
  const logReads = countDataReads(g, 'Daily_Log');
  const out = withNow(NOW, () => g.sb.mybmPushRun());
  t.eq('one links call', calls.fetch.length, 1);
  t.eq('…to the URL', calls.fetch[0] && calls.fetch[0].url, URL);
  const lp = calls.fetch[0].params;
  const lb = JSON.parse(lp.payload);
  t.eq('the links request body, exact keys', Object.keys(lb).sort(), ['generatedAt', 'requestId', 'schema', 'sender']);
  t.eq('…ward-feed-links-v1 from neofeed', [lb.schema, lb.sender], ['ward-feed-links-v1', 'neofeed']);
  t.ok('…signed', lp.headers['x-nf-signature'] === hmacHex(lp.headers['x-nf-timestamp'], lp.payload), lp.headers);
  t.eq('…timestamp in ms', lp.headers['x-nf-timestamp'], String(NOW));
  t.ok('…post, JSON, muteHttpExceptions, no redirects', lp.method === 'post' && lp.contentType === 'application/json'
    && lp.muteHttpExceptions === true && lp.followRedirects === false, lp);
  t.eq('61 envelopes in chunks of 20: 4 fetchAll calls', calls.fetchAll.map(c => c.length), [20, 20, 20, 1]);
  t.eq('the registry read once', patReads.reads, 1);
  t.eq('Daily_Log read once', logReads.reads, 1);
  const all = [].concat(...calls.fetchAll);
  let signed = true, keysOk = true;
  for (const r of all) {
    if (r.url !== URL || r.method !== 'post' || r.muteHttpExceptions !== true || r.followRedirects !== false) keysOk = false;
    if (r.headers['x-nf-signature'] !== hmacHex(r.headers['x-nf-timestamp'], r.payload)) signed = false;
  }
  t.ok('every envelope signed', signed);
  t.ok('every envelope posted to the URL, muted, no redirects', keysOk);
  const bodies = all.map(r => JSON.parse(r.payload));
  t.eq('one envelope per link, in order', bodies.map(b => b.linkId), links.map(l => l.linkId));
  t.eq('the unknown sessionId is inactive, not_in_registry', [bodies[60].status, bodies[60].checks], ['inactive', ['not_in_registry']]);
  t.eq('the others are current with today\'s card', bodies.slice(0, 60).every(b => b.status === 'current' && b.feedCard && b.feedCard.orderDate === TODAY), true);
  t.eq('deliveryIds are all different', new Set(bodies.map(b => b.deliveryId)).size, 61);
  t.ok('deliveryIds are uuids', bodies.every(b => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(b.deliveryId)));
  const audit = g.audit().filter(a => a.action === 'mybmPush');
  t.eq('one Audit_Log row per envelope sent', audit.length, 61);
  t.ok('…by trigger:mybmPush, naming the sessionId', audit.every(a => a.actor === 'trigger:mybmPush') && audit[0].sessionId === 'S000', audit[0]);
  t.eq('counts', [out.counts.links, out.counts.sent, out.counts.accepted, out.counts.current, out.counts.inactive], [61, 61, 61, 60, 1]);
  t.eq('nothing written to Patient_Registry or Daily_Log', [g.rows('Patient_Registry').length, g.rows('Daily_Log').length], [60, 60]);
  t.ok('no script lock taken (a read-only run)', g.env.lockWaits === 0, g.env.lockWaits);

  const g2 = freshBoot();
  const calls2 = fakeMybm(g2, { links: [] });
  const reads2 = countDataReads(g2, 'Daily_Log');
  const out2 = withNow(NOW, () => g2.sb.mybmPushRun());
  t.ok('no links: no fetchAll, no Daily_Log read', calls2.fetchAll.length === 0 && reads2.reads === 0 && out2.counts.links === 0, out2);

  const g3 = freshBoot();
  const links3 = seedWard(g3, 3);
  const calls3 = fakeMybm(g3, { links: links3, answer: (b, c, i) => ({ code: 200, body: { status: ['duplicate', 'unlinked', 'no_consent'][i] } }) });
  const out3 = withNow(NOW, () => g3.sb.mybmPushRun());
  t.eq('duplicate, unlinked and no_consent are counted, not failures', [out3.counts.duplicate, out3.counts.unlinked, out3.counts.no_consent, out3.counts.failed], [1, 1, 1, 0]);
  t.ok('a later run signs with its own clock', calls3.fetchAll[0][0].headers['x-nf-timestamp'] === String(NOW));
});

t.section('§9 answers', () => {
  // 401 to the links call.
  {
    const g = freshBoot();
    seedWard(g, 2);
    const calls = fakeMybm(g, { linksCode: 401 });
    const reads = countDataReads(g, 'Daily_Log');
    let threw = null;
    try { withNow(NOW, () => g.sb.mybmPushRun()); } catch (e) { threw = String(e.message); }
    t.ok('links 401: throws, nothing read, nothing sent', threw && /401/.test(threw) && reads.reads === 0 && calls.fetchAll.length === 0, { threw, reads });
  }
  for (const code of [500, 503, 404]) {
    const g = freshBoot();
    const calls = fakeMybm(g, { linksCode: code });
    let threw = null;
    try { withNow(NOW, () => g.sb.mybmPushRun()); } catch (e) { threw = String(e.message); }
    t.ok('links ' + code + ': throws, nothing sent', threw && threw.indexOf(String(code)) !== -1 && calls.fetchAll.length === 0, threw);
  }
  for (const [name, body] of [['not JSON', 'oops'], ['no links key', { rows: [] }], ['links not a list', { links: {} }],
    ['501 links', { links: Array.from({ length: 501 }, (_, i) => link('S' + i)) }]]) {
    const g = freshBoot();
    const calls = fakeMybm(g, { linksBody: body });
    const reads = countDataReads(g, 'Daily_Log');
    let threw = null;
    try { withNow(NOW, () => g.sb.mybmPushRun()); } catch (e) { threw = String(e.message); }
    t.ok('links answer ' + name + ': throws before any read', threw !== null && reads.reads === 0 && calls.fetchAll.length === 0, threw);
  }
  // Bad entries are skipped, the rest go.
  {
    const g = freshBoot();
    const good = seedWard(g, 1);
    const badLinks = [
      Object.assign(link('B1'), { linkId: 'not-a-uuid' }),
      Object.assign(link('B2'), { sessionId: '' }),
      Object.assign(link('B3'), { sessionId: 'x'.repeat(161) }),
      Object.assign(link('B4'), { expectedDob: '2026-02-30' }),
      Object.assign(link('B5'), { extra: 1 }),
      { linkId: uuid(), sessionId: 'B6', expectedDob: DOB },
      null,
    ];
    const calls = fakeMybm(g, { links: good.concat(badLinks) });
    const out = withNow(NOW, () => g.sb.mybmPushRun());
    t.eq('bad link entries are skipped, the good one goes', [out.counts.links, out.counts.skippedLinks, [].concat(...calls.fetchAll).length], [1, 7, 1]);
  }
  // One infant, one link: a sessionId listed twice with different dates could guess the
  // DOB until one entry matched (Vera, 2026-11-27, finding 2). Every entry of a repeated
  // sessionId or linkId is skipped.
  {
    const g = freshBoot();
    seedWard(g, 2);
    const guesses = [link('S000', { expectedDob: '2026-11-19' }), link('S000'), link('S001')];
    const calls = fakeMybm(g, { links: guesses });
    const out = withNow(NOW, () => g.sb.mybmPushRun());
    const bodies = [].concat(...calls.fetchAll).map(r => JSON.parse(r.payload));
    t.eq('a sessionId listed twice: both entries skipped', [out.counts.links, out.counts.skippedLinks], [1, 2]);
    t.ok('…and no envelope for it carries data', bodies.length === 1 && bodies[0].linkId === guesses[2].linkId, bodies.map(b => b.linkId));
    const g2 = freshBoot();
    seedWard(g2, 2);
    const one = link('S000');
    const calls2 = fakeMybm(g2, { links: [one, Object.assign(link('S001'), { linkId: one.linkId.toUpperCase() })] });
    const out2 = withNow(NOW, () => g2.sb.mybmPushRun());
    t.eq('a linkId listed twice (any case): both entries skipped', [out2.counts.links, out2.counts.skippedLinks, calls2.fetchAll.length], [0, 2, 0]);
  }
  // A 401 inside a chunk stops the run.
  {
    const g = freshBoot();
    const links = seedWard(g, 45);
    const calls = fakeMybm(g, { links, answer: (b, c, i) => (c === 1 && i === 3 ? { code: 401, body: '' } : { code: 200, body: { status: 'accepted' } }) });
    let threw = null;
    try { withNow(NOW, () => g.sb.mybmPushRun()); } catch (e) { threw = String(e.message); }
    t.ok('a 401 in chunk 2: throws', threw && /401/.test(threw), threw);
    t.eq('…and chunk 3 is not sent', calls.fetchAll.length, 2);
    t.eq('…the 40 sent are audited', g.audit().filter(a => a.action === 'mybmPush').length, 40);
  }
  // Another non-200 inside a chunk leaves the rest alone, then throws with counts.
  {
    const g = freshBoot();
    const links = seedWard(g, 25);
    const calls = fakeMybm(g, { links, answer: (b, c, i) => (c === 0 && i === 2 ? { code: 503, body: '' } : (c === 0 && i === 5 ? { code: 400, body: { error: 'invalid_delivery' } } : { code: 200, body: { status: 'accepted' } })) });
    let threw = null;
    try { withNow(NOW, () => g.sb.mybmPushRun()); } catch (e) { threw = String(e.message); }
    t.eq('a 503 and a 400 in chunk 1: chunk 2 still sent', calls.fetchAll.map(c => c.length), [20, 5]);
    t.ok('…then the run throws, naming the counts and codes', threw && /2 of 25/.test(threw) && /400/.test(threw) && /503/.test(threw), threw);
    t.ok('…its message names no sessionId', threw && threw.indexOf('S00') === -1, threw);
    const line = g.env.logs.find(l => /^mybm push: /.test(l));
    t.ok('…and the log line holds the counts', line && /"accepted":23/.test(line) && /"failed":2/.test(line), line);
  }
  // A 200 with a status MyBM does not send is a failure.
  {
    const g = freshBoot();
    const links = seedWard(g, 1);
    fakeMybm(g, { links, answer: () => ({ code: 200, body: { status: 'weird' } }) });
    let threw = null;
    try { withNow(NOW, () => g.sb.mybmPushRun()); } catch (e) { threw = String(e.message); }
    t.ok('a 200 with an unknown status counts as not recorded', threw && /1 of 1/.test(threw), threw);
  }
});

t.section('§10 logs and messages', () => {
  const g = freshBoot();
  const sid = 'PT-2026-LOGCHECK';
  g.sheet('Patient_Registry').data.push(pat(g, sid, { 1: 'ด.ช. ลองดู นามสมมุติ' }));
  g.sheet('Daily_Log').data.push(order(g, sid, TODAY));
  fakeMybm(g, { links: [link(sid)], answer: () => ({ code: 503, body: '' }) });
  let threw = '';
  try { withNow(NOW, () => g.sb.mybmPushRun()); } catch (e) { threw = String(e.message); }
  const text = g.env.logs.join('\n') + '\n' + threw;
  t.ok('no sessionId in a log line or the thrown message', text.indexOf(sid) === -1, text);
  t.ok('no name', text.indexOf('ลองดู') === -1, text);
  t.ok('no URL', text.indexOf('mybm.example.test') === -1, text);
  t.ok('no secret', text.indexOf(SECRET) === -1, text);
  t.ok('a run logs one line', g.env.logs.filter(l => /^mybm push/.test(l)).length === 1, g.env.logs);

  // Apps Script's own network error names the URL (Vera, 2026-11-27, finding 5).
  const g2 = freshBoot();
  g2.sb.UrlFetchApp = { fetch() { throw new Error('Address unavailable: ' + URL); }, fetchAll() { throw new Error('unused'); } };
  let t2 = '';
  try { withNow(NOW, () => g2.sb.mybmPushRun()); } catch (e) { t2 = String(e.message); }
  t.ok('the links request unreachable: throws, without the URL', /mybm push/.test(t2) && t2.indexOf('mybm.example.test') === -1, t2);
  const g3 = freshBoot();
  const links3 = seedWard(g3, 25);
  const calls3 = fakeMybm(g3, { links: links3 });
  const realAll = g3.sb.UrlFetchApp.fetchAll;
  g3.sb.UrlFetchApp.fetchAll = (reqs) => { if (calls3.fetchAll.length === 1) throw new Error('Timeout: ' + URL); return realAll(reqs); };
  let t3 = '';
  try { withNow(NOW, () => g3.sb.mybmPushRun()); } catch (e) { t3 = String(e.message); }
  t.ok('a chunk unreachable: throws, without the URL', /mybm push/.test(t3) && t3.indexOf('mybm.example.test') === -1, t3);
  t.eq('…every envelope that may have left is audited', g3.audit().filter(a => a.action === 'mybmPush').length, 25);
  t.ok('…and the counts line is still logged', g3.env.logs.some(l => /^mybm push: \{/.test(l) && /"accepted":20/.test(l)), g3.env.logs);
});

t.done();
