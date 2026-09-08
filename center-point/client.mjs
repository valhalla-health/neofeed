const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
// New-cohort transport only. Never imports GAS configuration or legacy identity.
export class CenterPointClient {
  constructor({ origin, store, fetchImpl = fetch }) {
    const url = new URL(origin);
    if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1'))) throw Error('invalid_center_origin');
    this.origin = origin; this.store = store; this.fetch = (...args) => fetchImpl(...args);
  }
  async request(operation, body) {
    if (!['session','resolve','link'].includes(operation)) throw Error('unsupported_operation');
    const response = await this.fetch(`${this.origin}/api/${operation}`, { method:'POST', credentials:'same-origin', redirect:'error',
      headers:{'Content-Type':'application/json','X-NCP-Request':'1'}, body:JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'center_unavailable');
    return data;
  }
  async resolve(reference) {
    if (typeof reference !== 'string' || !/^ncp:v1:[A-Za-z0-9_-]{43}$/.test(reference)) throw Error('invalid_label');
    const result = await this.request('resolve', {reference, app:'neofeed'});
    if (!uuid(result.encounterId) || result.app !== 'neofeed' || result.confirmationRequired !== true) throw Error('invalid_center_response');
    return {reference, encounterId:result.encounterId};
  }
  async link(resolved, confirmedEncounterId) {
    if (!uuid(confirmedEncounterId) || confirmedEncounterId !== resolved.encounterId) throw Error('confirmation_mismatch');
    const key = `neofeed-v2:${confirmedEncounterId}`;
    let record = await this.store.get(key);
    if (!record) {
      record = {schemaVersion:2, app:'neofeed', encounterId:confirmedEncounterId, localId:crypto.randomUUID(), status:'pending'};
      await this.store.set(key,record); // Durable retry identity before first request.
    }
    if (!uuid(record.localId) || record.encounterId !== confirmedEncounterId || record.schemaVersion !== 2 || record.app !== 'neofeed') throw Error('invalid_local_record');
    const result = await this.request('link', {reference:resolved.reference, app:'neofeed', schemaVersion:2,
      localId:record.localId, confirmedEncounterId});
    if (result.encounter_id !== confirmedEncounterId || result.local_id !== record.localId || !uuid(result.id) || !uuid(result.patient_alias)) throw Error('invalid_center_response');
    const linked = {schemaVersion:2, app:'neofeed', encounterId:confirmedEncounterId, localId:record.localId,
      status:'linked', linkId:result.id, patientAlias:result.patient_alias};
    await this.store.set(key,linked); return linked;
  }
}
