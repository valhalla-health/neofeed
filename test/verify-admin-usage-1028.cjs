// verify-admin-usage-1028.cjs — NF-02 on the Admin page (Pp, 2026-10-28:
// "ได้" to the chart). The real <App/> against the stateful fake backend of
// review-0917-boot.cjs, so what is pinned is the request the page sends and
// what it does with each reply. The card itself (bars, scale, legend, states)
// is pinned by verify-admin-census.cjs § 5, the action by
// verify-usage-log.cjs § 7.
//
//   admin       opening Admin dashboard sends one getUsageWeekly with the
//               session token and nothing else, and draws the chart; going
//               back to it asks again, a sync does not.
//   oldBackend  a backend from before the action answers "Unknown action":
//               the card reads ยังไม่มีข้อมูล, no toast, still signed in.
//   network     a failed request: the card says so and its retry asks again;
//               no toast.
//   doctor      a doctor never sends getUsageWeekly.
//
// The jsdom set from test/README.md. Synthetic data only.
const { boot, runScenarios, DOCTOR } = require('./review-0917-boot.cjs');

const ADMIN = { name: 'Admin A', role: 'admin', email: 'adm@test.th', token: 'tok-admin-1234567', authMethod: 'password' };
const cell = (o) => ({ total: 0, TPN: 0, EN: 0, NPO: 0, other: 0, ...o });
const WEEKS = [0, 1, 2].map(i => ({
  week: '2026-W' + (42 + i), weekStart: ['2026-10-12', '2026-10-19', '2026-10-26'][i], total: 3 + i,
  byWard: { NICU: cell({ total: 2 + i, TPN: 2 + i }), SCN: cell({ total: 1, EN: 1 }), other: cell() },
}));
const REPLY = { ok: true, weeks: WEEKS, wards: ['NICU', 'SCN', 'other'], types: ['TPN', 'EN', 'NPO', 'other'] };
const card = () => document.querySelector('.usage-card');
const cardText = () => (card() ? card().textContent.replace(/\s+/g, ' ').trim() : '');

runScenarios(__filename, 'ADMIN USAGE CARD (NF-02)', {
  async admin(A) {
    const b = boot({ session: ADMIN });
    b.server.hooks.getUsageWeekly = () => ({ reply: REPLY });
    const restore = b.quiet();
    await b.start();
    A.eq('nothing asks for usage before the Admin page opens', b.callsOf('getUsageWeekly').length, 0);
    await b.rail(/Admin dashboard/);
    await b.flush(); await b.flush();
    const calls = b.callsOf('getUsageWeekly');
    A.eq('opening Admin dashboard sends one getUsageWeekly', calls.length, 1);
    A.eq('…carrying only the action and the session token', calls[0] && Object.keys(calls[0]).sort(), ['action', 'token']);
    A.eq('…with this admin\'s token', calls[0] && calls[0].token, ADMIN.token);
    A.eq('the chart shows NICU and SCN', [...document.querySelectorAll('.usage-ward')].map(w => w.getAttribute('data-ward')), ['NICU', 'SCN']);
    A.ok('NICU: this week 4, 3 weeks 9', /สัปดาห์นี้ 4 · รวม 9/.test(document.querySelector('.usage-ward[data-ward="NICU"]')?.textContent || ''));
    await b.click(b.syncButton());
    await b.flush();
    A.eq('a sync does not ask again', b.callsOf('getUsageWeekly').length, 1);
    await b.rail(/^Patients/);
    await b.rail(/Admin dashboard/);
    await b.flush();
    A.eq('coming back to the page asks again', b.callsOf('getUsageWeekly').length, 2);
    A.eq('no toast', b.toasts(), []);
    restore();
  },

  async oldBackend(A) {
    const b = boot({ session: ADMIN });
    b.server.hooks.getUsageWeekly = () => ({ reply: { error: 'Unknown action: getUsageWeekly' } });
    const restore = b.quiet();
    await b.start();
    await b.rail(/Admin dashboard/);
    await b.flush(); await b.flush();
    A.ok('the card reads ยังไม่มีข้อมูล', /ยังไม่มีข้อมูล/.test(cardText()));
    A.ok('…with no chart', !document.querySelector('.usage-ward'));
    A.eq('no toast', b.toasts(), []);
    A.ok('still signed in, still on the Admin page', !!document.querySelector('.census-card'));
    restore();
  },

  async network(A) {
    const b = boot({ session: ADMIN });
    let failNext = true;
    b.server.hooks.getUsageWeekly = () => (failNext ? (failNext = false, { network: true }) : { reply: REPLY });
    const restore = b.quiet();
    await b.start();
    await b.rail(/Admin dashboard/);
    await b.flush(); await b.flush();
    A.ok('a failed request: the card says so', /ไม่สำเร็จ/.test(cardText()));
    A.eq('no toast for it', b.toasts(), []);
    await b.click(b.btn(/ลองใหม่/, card()));
    await b.flush();
    A.eq('the retry asks again', b.callsOf('getUsageWeekly').length, 2);
    A.eq('…and draws the chart', document.querySelectorAll('.usage-ward').length, 2);
    restore();
  },

  async doctor(A) {
    const b = boot({ session: DOCTOR });
    const restore = b.quiet();
    await b.start();
    await b.flush();
    A.ok('a doctor has no Admin dashboard in the rail', ![...document.querySelectorAll('.rail-item')].some(r => /Admin dashboard/.test(r.textContent)));
    A.eq('…and never sends getUsageWeekly', b.callsOf('getUsageWeekly').length, 0);
    restore();
  },
});
