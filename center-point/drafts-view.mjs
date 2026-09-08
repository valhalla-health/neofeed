// Synthetic clinical drafts stay on the server, never in browser storage.
export function draftView(client) {
  const section = document.createElement('section'); section.hidden = true;
  section.innerHTML = `<h2>ร่างข้อมูล NeoFeed</h2><p data-context class="code"></p>
    <p>ข้อมูลสมมติ · การยืนยันฉบับนี้ยังไม่ใช่คำสั่งการรักษา และยังไม่ส่งรอบ 16:00</p>
    <p>เวลาทั้งหมดใช้เวลาไทย (Asia/Bangkok)</p>
    <form><fieldset><legend>ข้อมูลสำหรับทบทวน</legend>
      <label>เวลาของข้อมูล<input name="observedAt" type="datetime-local" step="1" required></label>
      <label>น้ำหนัก (g) — เว้นว่างหากไม่มี<input name="weight" type="number" min="0.001" step="any"></label>
      <label>ความละเอียดเวลาชั่ง<select name="precision"><option value="time">ทราบวันและเวลา</option><option value="date">ทราบเฉพาะวันที่</option></select></label>
      <label data-time>เวลาชั่งน้ำหนัก<input name="measuredAt" type="datetime-local" step="1"></label>
      <label data-date hidden>วันที่ชั่งน้ำหนัก<input name="measuredDate" type="date"></label>
      <label>ปริมาณนมที่สั่ง (mL/feed)<input name="prescribed" type="number" min="0" step="any"></label>
      <label>จำนวนมื้อที่สั่งต่อ 24 ชั่วโมง<input name="frequency" type="number" min="1" max="1440" step="1"></label>
      <label>แหล่งนมของปริมาตรที่สั่ง<select name="milkSource"><option value="">ยังไม่ระบุ</option><option value="mothers_milk">นมแม่ล้วน (ปริมาตรนมก่อนเติมสารเสริม)</option><option value="donor_milk">นมบริจาค</option><option value="formula">นมผสม</option><option value="mixed">หลายชนิด / ปริมาตรหลังผสมสารเสริม</option></select></label>
      <label>ปริมาณที่ได้รับจริง (mL) — เว้นว่างหากไม่ทราบ<input name="actual" type="number" min="0" step="any"></label>
      <label>เริ่มช่วงบันทึกปริมาณที่ได้รับจริง<input name="startAt" type="datetime-local" step="1"></label>
      <label>สิ้นสุดช่วงบันทึกปริมาณที่ได้รับจริง<input name="endAt" type="datetime-local" step="1"></label>
      <button>บันทึกร่าง</button>
    </fieldset></form>
    <button type="button" data-reload class="secondary">โหลดฉบับล่าสุดจากเซิร์ฟเวอร์</button>
    <p data-feedback role="status"></p>
    <h3>ฉบับที่ยืนยันแล้ว</h3><pre data-published class="code"></pre>
    <div data-print-area hidden><p>ส่งเอกสารสรุปทดสอบไปตรวจชื่อบน CP Desktop · ยังไม่ใช่ใบสั่ง TPN</p>
      <label>รหัสเครื่อง CP Desktop ที่ลงทะเบียน<input data-workstation autocomplete="off"></label>
      <button type="button" data-print-job>สร้างงานตรวจชื่อและพิมพ์ทดสอบ</button><p data-job class="code" role="status"></p></div>
    <div data-review-area hidden><h3>ทบทวนก่อนยืนยัน</h3>
      <p>ตรวจการรับเข้าและข้อมูลที่บันทึกด้านล่างก่อนยืนยัน การแก้แบบฟอร์มจะยกเลิกการทบทวนนี้</p>
      <pre data-review class="code"></pre>
      <label data-reason-label hidden>เหตุผลที่เปลี่ยนฉบับยืนยัน<select data-reason>
        <option value="">เลือกเหตุผล</option><option value="measurement_correction">แก้ข้อมูลการวัด</option>
        <option value="plan_change">เปลี่ยนแผน</option><option value="entry_correction">แก้ข้อมูลที่บันทึก</option>
      </select></label>
      <label><input data-reviewed type="checkbox">ตรวจสอบฉบับที่แสดงแล้ว</label>
      <button type="button" data-publish>ยืนยันฉบับที่ทบทวน</button>
    </div>`;
  document.querySelector('main').append(section);
  const find = selector => section.querySelector(selector), form = find('form'), status = find('[data-feedback]');
  const input = name => form.elements.namedItem(name);
  let link = null, saved = null, published = null, busy = false, generation = 0, dirty = false, role = null, ready = false;
  let printRequest = null;
  const bangkok = iso => iso ? new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 19) : '';
  const iso = value => { if (!value) throw Error('missing_time'); return new Date(`${value}+07:00`).toISOString(); };
  const stamp = value => value ? `${bangkok(value).replace('T', ' ')} น.` : 'ไม่ทราบ';
  const errors = {
    source_revision_conflict: 'มีฉบับใหม่กว่า กรุณาโหลดและทบทวนฉบับล่าสุด',
    correction_reason_required: 'กรุณาระบุเหตุผลที่เปลี่ยนฉบับยืนยัน',
    publication_conflict: 'สถานะยืนยันเปลี่ยนแล้ว กรุณาโหลดฉบับล่าสุด',
    mapping_unavailable: 'การเชื่อมต่อถูกยกเลิก กรุณาตรวจสอบใหม่',
    encounter_unavailable: 'การรับเข้านี้ปิดแล้ว', forbidden: 'บัญชีนี้ไม่มีสิทธิ์ดำเนินการ',
    authentication_required: 'กรุณาเข้าสู่ระบบและยืนยัน MFA ใหม่',
    missing_time: 'กรุณาระบุวันและเวลาให้ครบ', incomplete_plan: 'กรุณาระบุปริมาณที่สั่งและจำนวนมื้อให้ครบ'
  };
  function summary(draft) {
    if (!draft) return '';
    const weight = draft.weight;
    return [`การรับเข้า ${draft.encounterId}`, `ฉบับที่ ${draft.revision} · เวลาข้อมูล ${stamp(draft.observedAt)}`,
      weight ? `น้ำหนัก ${weight.value} g · ${weight.measuredDate ? `${weight.measuredDate} (ไม่ทราบเวลาชั่ง)` : stamp(weight.measuredAt)}` : 'น้ำหนัก: ไม่มีข้อมูล',
      draft.prescribed ? `แผน: ${draft.prescribed.volumePerFeedMl} mL/feed × ${draft.prescribed.feedsPer24h} มื้อ/24 ชม. (ไม่ใช่ปริมาณที่ได้รับจริง)` : 'แผน: ไม่มีข้อมูล',
      `แหล่งนม: ${({mothers_milk:'นมแม่ล้วน ก่อนเติมสารเสริม',donor_milk:'นมบริจาค',formula:'นมผสม',mixed:'หลายชนิด / หลังผสมสารเสริม'})[draft.prescribed?.milkSource] ?? 'ยังไม่ระบุ'}`,
      draft.actual ? `ได้รับจริงที่บันทึก: ${draft.actual.volumeMl} mL · ${stamp(draft.actual.startAt)} ถึง ${stamp(draft.actual.endAt)}` : 'ได้รับจริง: ไม่ทราบ'].join('\n');
  }
  function controls() {
    find('fieldset').disabled = busy || !ready;
    find('[data-reload]').disabled = busy || !link;
    find('[data-time]').hidden = input('precision').value === 'date';
    find('[data-date]').hidden = input('precision').value !== 'date';
    const reviewable = ready && saved && !dirty && role === 'clinician' && saved.revision !== published?.revision;
    find('[data-review-area]').hidden = !reviewable;
    find('[data-reason-label]').hidden = !published;
    find('[data-reviewed]').disabled = busy; find('[data-reason]').disabled = busy;
    find('[data-publish]').disabled = busy || !reviewable || !find('[data-reviewed]').checked || (!!published && !find('[data-reason]').value);
    find('[data-print-area]').hidden = !(ready && role === 'clinician' && published && saved?.revision === published.revision && !dirty);
    find('[data-print-job]').disabled = busy;
  }
  function renderPublication() {
    find('[data-published]').textContent = !published ? 'ยังไม่มีฉบับยืนยัน' :
      `ฉบับที่ ${published.revision} · ยืนยัน ${stamp(published.publishedAt)}${saved?.revision > published.revision ? ' · มีร่างใหม่รอทบทวน' : ''}\n${summary(published)}`;
  }
  function fill(draft) {
    printRequest = null; find('[data-job]').textContent = '';
    form.reset(); saved = draft ?? null; dirty = false;
    input('observedAt').value = bangkok(draft?.observedAt ?? new Date().toISOString());
    input('weight').value = draft?.weight?.value ?? '';
    input('precision').value = draft?.weight?.measuredDate ? 'date' : 'time';
    input('measuredAt').value = bangkok(draft?.weight?.measuredAt); input('measuredDate').value = draft?.weight?.measuredDate ?? '';
    input('prescribed').value = draft?.prescribed?.volumePerFeedMl ?? ''; input('frequency').value = draft?.prescribed?.feedsPer24h ?? '';
    input('milkSource').value = draft?.prescribed?.milkSource ?? '';
    input('actual').value = draft?.actual?.volumeMl ?? '';
    input('startAt').value = bangkok(draft?.actual?.startAt); input('endAt').value = bangkok(draft?.actual?.endAt);
    find('[data-reviewed]').checked = false; find('[data-reason]').value = '';
    find('[data-review]').textContent = summary(saved); renderPublication(); controls();
  }
  async function load(selected, version) {
    const [records, publications, user] = await Promise.all([client.drafts(selected), client.publications(selected), client.request('session', {})]);
    if (version !== generation) return;
    role = user.role; published = publications.find(row => row.sourceRecordId === selected.localId) ?? null;
    ready = true; fill(records.find(row => row.sourceRecordId === selected.localId));
    status.textContent = saved ? `โหลดฉบับที่ ${saved.revision} แล้ว${role !== 'clinician' ? ' · รอแพทย์ทบทวนและยืนยัน' : ''}` : 'ยังไม่มีร่างที่บันทึก';
  }
  async function run(work) {
    if (busy || !link) return;
    busy = true; controls(); const selected = link, version = generation;
    try { await work(selected, version); }
    catch (error) {
      if (version === generation) {
        status.textContent = errors[error.message] ?? 'ดำเนินการไม่สำเร็จ ตรวจข้อมูลหรือโหลดฉบับล่าสุดก่อนลองใหม่';
        find('[data-reviewed]').checked = false;
        if (['authentication_required', 'forbidden', 'mapping_unavailable', 'encounter_unavailable'].includes(error.message)) {
          ready = false; published = null; fill(null);
        }
      }
    } finally { busy = false; controls(); }
  }
  form.oninput = () => { dirty = true; find('[data-reviewed]').checked = false; controls(); };
  form.onchange = form.oninput;
  find('[data-reviewed]').onchange = controls; find('[data-reason]').onchange = controls;
  form.onsubmit = event => {
    event.preventDefault(); if (!ready) return;
    void run(async (selected, version) => {
      const fields = { observedAt: iso(input('observedAt').value), weight: null, prescribed: null, actual: null };
      if (input('weight').value !== '') fields.weight = { value: Number(input('weight').value), unit: 'g',
        ...(input('precision').value === 'date' ? { measuredDate: input('measuredDate').value } : { measuredAt: iso(input('measuredAt').value) }) };
      if (input('prescribed').value !== '' || input('frequency').value !== '') {
        if (input('prescribed').value === '' || input('frequency').value === '') throw Error('incomplete_plan');
        fields.prescribed = { volumePerFeedMl: Number(input('prescribed').value), feedsPer24h: Number(input('frequency').value) };
        if (input('milkSource').value) fields.prescribed.milkSource = input('milkSource').value;
      }
      if (input('actual').value !== '') fields.actual = { volumeMl: Number(input('actual').value), startAt: iso(input('startAt').value), endAt: iso(input('endAt').value) };
      const result = await client.saveDraft(selected, fields, saved?.revision ?? 0);
      if (version !== generation) return;
      fill(result); status.textContent = `บันทึกร่างฉบับที่ ${result.revision} แล้ว · ยังไม่ยืนยันหรือส่งรอบประจำวัน`;
    });
  };
  find('[data-reload]').onclick = () => {
    if (dirty && !window.confirm('โหลดข้อมูลจากเซิร์ฟเวอร์แทนการแก้ไขที่ยังไม่ได้บันทึกหรือไม่')) return;
    void run(async (selected, version) => { ready = false; published = null; fill(null); await load(selected, version); });
  };
  find('[data-publish]').onclick = () => {
    if (find('[data-publish]').disabled) return;
    const revision = saved.revision, reason = find('[data-reason]').value || null;
    void run(async (selected, version) => {
      const result = await client.publishDraft(selected, revision, reason);
      if (version !== generation) return;
      published = result; find('[data-reviewed]').checked = false; renderPublication();
      status.textContent = `ยืนยันฉบับที่ ${result.revision} แล้ว · ยังไม่ส่งรอบประจำวัน`;
    });
  };
  find('[data-workstation]').oninput = () => { printRequest = null; find('[data-job]').textContent = ''; };
  find('[data-print-job]').onclick = () => {
    if (busy || !published || saved?.revision !== published.revision || dirty) return;
    printRequest ??= crypto.randomUUID();
    const revision = published.revision, workstation = find('[data-workstation]').value.trim(), requestId = printRequest;
    void run(async (selected, version) => {
      const job = await client.createPrintJob(selected, revision, workstation, requestId);
      if (version !== generation) return;
      find('[data-job]').textContent = `รหัสงาน ${job.jobId} · เปิดหน้าพิมพ์บน CP Desktop เครื่อง ${job.workstationId} เพื่อตรวจชื่อ · หมดอายุใน 15 นาที`;
    });
  };
  return {
    hide() { generation++; link = null; ready = false; published = null; role = null; section.hidden = true; fill(null); status.textContent = ''; },
    async show(value) {
      let launch=section.querySelector('[data-calculator-link]');
      if(!launch){launch=document.createElement('a');launch.dataset.calculatorLink='';launch.textContent='เปิดเครื่องคำนวณ TPN สำหรับการรับเข้านี้';section.prepend(launch);}
      launch.href=`/neofeed/calculator?encounter=${encodeURIComponent(value.encounterId)}`;
      if (busy) throw Error('request_in_progress');
      generation++; link = value; ready = false; published = null; fill(null); section.hidden = false;
      find('[data-context]').textContent = `การรับเข้า ${value.encounterId}`; await run(load);
    }
  };
}
