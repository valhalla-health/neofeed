import React from 'react';import {createRoot} from 'react-dom/client';
import {CenterPointClient} from './client.mjs';import {buildTpn} from './tpn-snapshot.mjs';import {renderTpn} from './tpn-document.mjs';
window.React=React;
// A message goes to #feedback, the status line at the top of the page, and also shows on screen:
// Save and the review sit thousands of pixels below #feedback, so a refusal there looked like
// nothing happening (CP sprint walk-through, 2026-09-16). Placed and timed like NeoFeed's own toast.
let noticeTimer;
function say(text,type='ok'){document.getElementById('feedback').textContent=text;document.querySelector('[data-notice]')?.remove();clearTimeout(noticeTimer);
 const error=type==='error',notice=document.createElement('div');notice.dataset.notice='';notice.setAttribute('role',error?'alert':'status');notice.textContent=(error?'⚠ ':'✓ ')+text;
 notice.style.cssText=`position:fixed;bottom:24px;left:50%;transform:translateX(-50%);max-width:90vw;padding:10px 16px;border-radius:8px;z-index:80;text-align:center;font-size:14px;color:#fff;box-shadow:0 6px 24px oklch(20% 0 0 / .25);background:${error?'oklch(38% 0.15 20)':'oklch(20% 0.01 230)'}`;
 document.body.append(notice);noticeTimer=setTimeout(()=>notice.remove(),error?4200:2400);}
window.showToast=say;
await import('../data.js');await import('../icons.jsx');await import('../calculator.jsx');
const $=id=>document.getElementById(id),client=new CenterPointClient({origin:location.origin,store:{get:async()=>null,set:async()=>{}}});
let link,saved,published,dirty=true,busy=false,root,requestId;
function controls(){const ready=saved&&!dirty&&!busy;$('checked').disabled=!ready;$('publish').disabled=!ready||!$('checked').checked||saved.revision===published?.revision;$('print-job').disabled=!ready||published?.revision!==saved.revision;}
function markDirty(){dirty=true;$('checked').checked=false;requestId=null;$('job').textContent='';controls();}
async function run(work){if(busy)return;busy=true;controls();try{await work();}catch(e){say(`ยังไม่สำเร็จ: ${e.message}`,'error');}finally{busy=false;controls();}}
const withdraw=document.createElement('button');withdraw.textContent='ยกเลิกฉบับที่ยืนยัน';withdraw.type='button';document.getElementById('review').append(withdraw);withdraw.onclick=()=>run(async()=>{if(!published||!window.confirm('ยกเลิกฉบับนี้และระงับงานพิมพ์ที่ยังไม่เริ่มหรือไม่'))return;await client.request('neofeed/withdraw',{encounterId:link.encounterId,linkId:link.linkId,sourceRecordId:link.localId,revision:published.revision,reason:'cancelled'});$('revision').textContent=`ฉบับ ${published.revision} · ยกเลิกแล้ว`;published=null;markDirty();say('ยกเลิกฉบับแล้ว ต้องบันทึกร่างใหม่ก่อนยืนยันอีกครั้ง');});
const encounter=new URL(location.href).searchParams.get('encounter');
await run(async()=>{const user=await client.request('session',{});if(user.role!=='clinician')throw Error('clinician_required');link=await client.existingLink(encounter);if(!link)throw Error('mapping_unavailable');$('context').textContent=`การรับเข้า ${link.encounterId}`;const rows=await client.drafts(link);saved=rows.find(r=>r.sourceRecordId===link.localId);published=(await client.publications(link)).find(r=>r.sourceRecordId===link.localId);if(saved?.tpn){renderTpn($('document'),saved.tpn,saved.previous);$('revision').textContent=`ฉบับ ${saved.revision}`;$('review').hidden=false;dirty=false;}});
$('calculator').addEventListener('input',markDirty);$('calculator').addEventListener('change',markDirty);$('calculator').addEventListener('click',markDirty);
$('setup').onsubmit=e=>{e.preventDefault();if(!link)return;const f=e.currentTarget.elements;const metadata={bw:Number(f.bw.value),ga:Number(f.ga.value),dol:Number(f.dol.value),order:f.order.value,measured:f.measured.value,from:new Date(f.from.value+'+07:00').toISOString(),to:new Date(f.to.value+'+07:00').toISOString(),source:f.source.value};if(metadata.to<=metadata.from){$('feedback').textContent='เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม';return;}markDirty();
 const bridge={failed:error=>{document.getElementById('revision').textContent=error.message;},review:()=>$('review').scrollIntoView(),save:async p=>{const tpn=buildTpn(p,window.NEOFEED_DATA,metadata.from,metadata.to);const result=await client.saveDraft(link,{observedAt:new Date().toISOString(),weight:{value:p.curWtG,unit:'g',measuredDate:metadata.measured},prescribed:{volumePerFeedMl:p.enVol,feedsPer24h:p.enFreq,milkSource:metadata.source},actual:null,tpn},saved?.revision??0);saved=result;dirty=false;renderTpn($('document'),result.tpn,result.previous);$('revision').textContent=`ฉบับ ${result.revision} · รอทบทวน`;$('review').hidden=false;$('checked').checked=false;$('feedback').textContent='บันทึกทั้งฉบับแล้ว กรุณาทบทวนก่อนยืนยัน';controls();return result;}};
 root??=createRoot($('calculator'));root.render(React.createElement(window.Calculator,{key:crypto.randomUUID(),patient:{sessionId:link.localId,bw:metadata.bw,ga:metadata.ga,weights:[]},dol:metadata.dol,logDate:metadata.order,centerPoint:bridge}));$('setup').hidden=true;
};
$('checked').onchange=controls;$('reason').onchange=controls;
$('publish').onclick=()=>run(async()=>{if(!saved||dirty||!$('checked').checked)throw Error('review_required');published=await client.publishDraft(link,saved.revision,$('reason').value||null);$('revision').textContent=`ฉบับ ${published.revision} · ยืนยันแล้ว`;say(`ยืนยันฉบับ ${published.revision} แล้ว`);$('checked').checked=false;});
$('print-job').onclick=()=>run(async()=>{if(dirty||!saved||published?.revision!==saved.revision)throw Error('review_required');requestId??=crypto.randomUUID();const job=await client.createPrintJob(link,saved.revision,$('workstation').value.trim(),requestId);$('job').textContent=`รหัสงาน ${job.jobId} · ตรวจชื่อที่ CP Desktop เครื่อง ${job.workstationId}`;});
$('workstation').oninput=()=>{requestId=null;$('job').textContent='';};
window.addEventListener('pagehide',()=>{root?.unmount();$('document').replaceChildren();});
