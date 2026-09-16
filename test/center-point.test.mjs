import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {CenterPointClient} from '../center-point/client.mjs';

test('publication sends only the reviewed revision and link, never clinical form values', async () => {
  const calls = [], link = { localId: randomUUID(), linkId: randomUUID(), encounterId: randomUUID() };
  const client = new CenterPointClient({ origin: 'https://center.invalid', store: {}, fetchImpl: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ revision: 2 }) };
  } });
  await client.publishDraft(link, 2, 'measurement_correction');
  assert.equal(calls[0].url, 'https://center.invalid/api/neofeed/publish');
  assert.deepEqual(calls[0].body, { sourceRecordId: link.localId, encounterId: link.encounterId, linkId: link.linkId,
    expectedRevision: 2, reviewed: true, correctionReason: 'measurement_correction' });
  await assert.rejects(client.publishDraft({ ...link, linkId: 'legacy-id' }, 2), /invalid_local_record/);
});

test('an existing verified app link opens from the server without local storage or another link write', async () => {
  const encounterId = randomUUID(), id = randomUUID(), local = randomUUID(), alias = randomUUID();
  const calls = [];
  const client = new CenterPointClient({ origin: 'https://center.invalid', store: {}, fetchImpl: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ encounter: { id: encounterId }, links: [{ app: 'neofeed',
      encounter_id: encounterId, id, local_id: local, patient_alias: alias }] }) };
  } });
  const link = await client.existingLink(encounterId);
  assert.equal(link.linkId, id); assert.equal(link.localId, local);
  assert.deepEqual(calls, [{ url: 'https://center.invalid/api/details', body: { encounterId } }]);
  await assert.rejects(client.existingLink(randomUUID()), /invalid_center_response/);
});

test('draft retries reuse stable source UUID and cannot override selected mapping',async()=>{
 const calls=[],link={localId:randomUUID(),linkId:randomUUID(),encounterId:randomUUID()};
 const client=new CenterPointClient({origin:'https://center.invalid',store:{},fetchImpl:async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)});if(calls.length===1)throw Error('lost');return{ok:true,json:async()=>({revision:1})};
 }});
 const fields={observedAt:'2026-09-08T01:00:00.000Z',actual:null,encounterId:randomUUID()};
 await assert.rejects(client.saveDraft(link,fields,0));await client.saveDraft(link,fields,0);
 assert.deepEqual(calls[0],calls[1]);assert.equal(calls[1].body.encounterId,link.encounterId);
 assert.equal(calls[1].body.sourceRecordId,link.localId);assert.equal(calls[1].body.actual,null);
});

test('new cohort links with UUID only; failed response retries same record without legacy fallback',async()=>{
 const values=new Map(),calls=[],encounterId=randomUUID(),id=randomUUID(),alias=randomUUID();let fail=true;
 const store={async get(k){return values.get(k);},async set(k,v){values.set(k,structuredClone(v));}};
 const reference=`ncp:v1:${'a'.repeat(43)}`;
 const client=new CenterPointClient({origin:'https://center.invalid',store,fetchImpl:async function(url,init){ assert.equal(this,undefined);
  calls.push({url,body:JSON.parse(init.body),credentials:init.credentials});
  if(url.endsWith('/resolve'))return {ok:true,json:async()=>({encounterId,app:'neofeed',confirmationRequired:true})};
  if(fail){fail=false;throw Error('response_lost');}
  return {ok:true,json:async()=>({id,patient_alias:alias,encounter_id:encounterId,local_id:JSON.parse(init.body).localId})};
 }});
 const resolved=await client.resolve(reference);
 await assert.rejects(client.link(resolved,randomUUID()),/confirmation_mismatch/);
 await assert.rejects(client.link(resolved,encounterId),/response_lost/);
 assert.equal(values.get(`neofeed-v2:${encounterId}`).status,'pending');
 const result=await client.link(resolved,encounterId);
 assert.equal(result.status,'linked');assert.equal(calls[1].body.localId,calls[2].body.localId);
 assert.ok(calls.every(c=>c.url.startsWith('https://center.invalid/api/')));
 assert.ok(calls.every(c=>!('name' in c.body)&&!('hn' in c.body)&&!('sessionId' in c.body)));
 assert.ok(!JSON.stringify([...values.values()]).includes(reference));
});

test('legacy-shaped local record is rejected before request',async()=>{
 let sent=false;const id=randomUUID();
 const client=new CenterPointClient({origin:'https://center.invalid',store:{async get(){return{localId:'NAME-BW900',encounterId:id,schemaVersion:1};}},fetchImpl:async()=>{sent=true;}});
 await assert.rejects(client.link({encounterId:id},id),/invalid_local_record/);assert.equal(sent,false);
});
