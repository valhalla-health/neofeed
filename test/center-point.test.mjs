import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {CenterPointClient} from '../center-point/client.mjs';

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
