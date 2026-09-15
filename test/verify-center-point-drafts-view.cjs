// The /neofeed/ drafts view on a record that carries a TPN order (PR #57 third
// review, 2026-09-15).
//
// The drafts view and the TPN calculator page edit the same CP record. The
// drafts view's review text shows weight, feed plan and intake only — no TPN
// value and no critical-value reason — yet its Publish and print-job buttons
// act on the whole saved revision, and its save carries no TPN, so a nurse's
// weight correction silently dropped the doctor's TPN order. Decision (Praew,
// 2026-09-15): a TPN order is reviewed, published and printed only on the
// calculator page; the drafts view is read-only for such a record. CP's server
// refuses the save as tpn_draft_superseded.
//
// Mounts the real center-point/drafts-view.mjs in jsdom with a stub client.
const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM } = require('jsdom');

const DIR = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name.padEnd(66)}${cond ? '' : '  ' + JSON.stringify(detail)}`);
  cond ? pass++ : fail++;
}

const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', { url: 'https://localhost/neofeed/', pretendToBeVisual: true });
const { window } = dom;
Object.assign(global, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
window.confirm = () => true;

const ids = { encounterId: '11111111-1111-4111-8111-111111111111', linkId: '22222222-2222-4222-8222-222222222222', localId: '33333333-3333-4333-8333-333333333333' };
const observation = { sourceRecordId: ids.localId, encounterId: ids.encounterId, revision: 1, observedAt: '2026-09-15T01:00:00.000Z',
  weight: { value: 1200, unit: 'g', measuredDate: '2026-09-15' }, prescribed: { volumePerFeedMl: 7, feedsPer24h: 8, milkSource: 'mixed' }, actual: null };
const tpnDraft = { ...observation, tpn: { schema: 'neofeed-tpn-v2', orderDate: '2026-09-15', dol: 3, criticalOverride: { reason: 'synthetic', alerts: ['x'] } } };

function stubClient({ draft, publication = null, role = 'clinician', saveError = null }) {
  const calls = { save: 0, publish: 0, print: 0 };
  return {
    calls,
    drafts: async () => (draft ? [draft] : []),
    publications: async () => (publication ? [publication] : []),
    request: async (op) => (op === 'session' ? { role, accountId: 'synthetic' } : {}),
    saveDraft: async (_link, fields, expected) => { calls.save++; if (saveError) throw Error(saveError); return { ...observation, ...fields, revision: expected + 1 }; },
    publishDraft: async () => { calls.publish++; return { ...draft, publishedAt: '2026-09-15T02:00:00.000Z' }; },
    createPrintJob: async () => { calls.print++; return { jobId: 'job', workstationId: 'ws' }; },
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const visible = (section, selector) => { const el = section.querySelector(selector); return !!el && !el.hidden && !el.closest('[hidden]'); };

(async () => {
  const { draftView } = await import(pathToFileURL(DIR + 'center-point/drafts-view.mjs').href);
  async function mount(options) {
    document.querySelector('main').replaceChildren();
    const client = stubClient(options), view = draftView(client);
    await view.show({ ...ids });
    await flush();
    return { client, view, section: document.querySelector('main > section') };
  }
  const submit = (section) => section.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  console.log('\n── control: an observation-only record is editable and reviewable ──');
  {
    const { section } = await mount({ draft: observation });
    ok('the form can be edited', section.querySelector('fieldset').disabled === false);
    ok('a clinician sees the review area', visible(section, '[data-review-area]'));
    ok('no TPN notice', !visible(section, '[data-tpn-notice]'));
  }

  console.log('\n── a record whose latest draft carries a TPN order is read-only here ──');
  {
    const { section, client } = await mount({ draft: tpnDraft });
    ok('the form is disabled', section.querySelector('fieldset').disabled === true);
    ok('the notice points to the calculator page', visible(section, '[data-tpn-notice]') && /หน้าเครื่องคำนวณ TPN/.test(section.querySelector('[data-tpn-notice]').textContent));
    ok('…and the calculator link is there', /\/neofeed\/calculator\?encounter=/.test(section.querySelector('[data-calculator-link]')?.href || ''));
    ok('no review / publish area', !visible(section, '[data-review-area]'));
    ok('the summary names it a TPN order', /ใบสั่ง TPN วันที่ 2026-09-15 · DOL 3/.test(section.querySelector('[data-review]').textContent));
    const reviewed = section.querySelector('[data-reviewed]'); reviewed.checked = true;
    reviewed.dispatchEvent(new window.Event('change', { bubbles: true }));   // as a real tick would
    section.querySelector('[data-publish]').click(); await flush();
    ok('Publish does nothing even if forced', client.calls.publish === 0, client.calls);
    submit(section); await flush();
    ok('a forced form submit saves nothing', client.calls.save === 0, client.calls);
  }

  console.log('\n── a published TPN order cannot be sent to print from here ──');
  {
    const { section, client } = await mount({ draft: tpnDraft, publication: { ...tpnDraft, publishedAt: '2026-09-15T02:00:00.000Z' } });
    ok('no print area', !visible(section, '[data-print-area]'));
    section.querySelector('[data-workstation]').value = 'ws';
    section.querySelector('[data-print-job]').click(); await flush();
    ok('the print-job button does nothing even if forced', client.calls.print === 0, client.calls);
  }

  console.log('\n── a nurse sees the same read-only record ──');
  {
    const { section } = await mount({ draft: tpnDraft, role: 'nurse' });
    ok('the form is disabled for a nurse', section.querySelector('fieldset').disabled === true);
    ok('…with the notice', visible(section, '[data-tpn-notice]'));
  }

  console.log('\n── a view loaded before the TPN save explains the server refusal ──');
  {
    const { section, client } = await mount({ draft: observation, saveError: 'tpn_draft_superseded' });
    submit(section); await flush(); await flush();
    ok('the save was attempted', client.calls.save === 1, client.calls);
    ok('…and the refusal says to use the calculator page', /หน้าเครื่องคำนวณ TPN/.test(section.querySelector('[data-feedback]').textContent),
      section.querySelector('[data-feedback]').textContent);
  }

  console.log(`\n${fail === 0 ? 'CP DRAFTS VIEW: ALL PASS' : `CP DRAFTS VIEW: ${fail} FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
