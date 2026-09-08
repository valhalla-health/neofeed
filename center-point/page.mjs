import {CenterPointClient} from './client.mjs';
const $=id=>document.getElementById(id);let selection=null,busy=false;
const client=new CenterPointClient({origin:location.origin,store:{
  async get(key){return JSON.parse(localStorage.getItem(key)||'null');},
  async set(key,value){localStorage.setItem(key,JSON.stringify(value));}
}});
const messages={authentication_required:'กรุณาเข้าสู่ระบบและยืนยัน MFA',forbidden:'ไม่มีสิทธิ์ดำเนินการ',invalid_label:'QR ไม่ถูกต้องหรือถูกยกเลิก',mapping_conflict:'การเชื่อมต่อขัดแย้งกับรายการเดิม',bedside_verification_required:'ยังไม่ได้ยืนยันข้างเตียง',confirmation_mismatch:'รหัสการรับเข้าไม่ตรงกัน'};
async function run(work){if(busy)return;busy=true;$('error').textContent='';document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await work();}catch(e){$('error').textContent=messages[e.message]||'ยังไม่สำเร็จ โปรดลองใหม่ ข้อมูลจะไม่ถูกส่งไปยังระบบเดิม';}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
$('reference').oninput=()=>{selection=null;$('confirmation').hidden=true;};
$('resolve').onclick=()=>run(async()=>{selection=null;$('confirmation').hidden=true;selection=await client.resolve($('reference').value.trim());$('encounter').textContent=`รหัสการรับเข้า ${selection.encounterId}`;$('confirmation').hidden=false;});
$('confirm').onclick=()=>run(async()=>{if(!selection)throw Error('invalid_label');const result=await client.link(selection,selection.encounterId);$('status').textContent=`เชื่อมต่อแล้ว · รหัส NeoFeed ${result.localId}`;$('confirmation').hidden=true;selection=null;});
run(async()=>{const user=await client.request('session',{});$('identity').textContent=`บัญชี ${user.accountId} · ${user.role}`;});
