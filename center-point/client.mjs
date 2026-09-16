const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
// New-cohort transport only. Never imports GAS configuration or legacy identity.
export class CenterPointClient {
  constructor({ origin, store, fetchImpl = fetch }) {
    const url = new URL(origin);
    if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1'))) throw Error('invalid_center_origin');
    this.origin = origin; this.store = store; this.fetch = (...args) => fetchImpl(...args);
  }
  async request(operation, body) {
    if (!['session','resolve','link','details','neofeed/save-draft','neofeed/drafts','neofeed/publish','neofeed/publications','print/create','neofeed/withdraw'].includes(operation)) throw Error('unsupported_operation');
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
  async drafts(link) {
    if (!uuid(link.encounterId) || !uuid(link.linkId)) throw Error('invalid_local_record');
    return this.request('neofeed/drafts', {encounterId:link.encounterId,linkId:link.linkId});
  }
  async existingLink(encounterId) {
    if (!uuid(encounterId)) throw Error('invalid_local_record');
    const details = await this.request('details', { encounterId });
    if (details.encounter?.id !== encounterId || !Array.isArray(details.links)) throw Error('invalid_center_response');
    const row = details.links.find(link => link.app === 'neofeed');
    if (!row) return null;
    if (row.encounter_id !== encounterId || !uuid(row.id) || !uuid(row.local_id) || !uuid(row.patient_alias)) throw Error('invalid_center_response');
    return { schemaVersion: 2, app: 'neofeed', encounterId, localId: row.local_id, linkId: row.id, patientAlias: row.patient_alias, status: 'linked' };
  }
  async publications(link) {
    if (!uuid(link.encounterId) || !uuid(link.linkId)) throw Error('invalid_local_record');
    return this.request('neofeed/publications', { encounterId: link.encounterId, linkId: link.linkId });
  }
  async createPrintJob(link, revision, workstationId, requestId) {
    if (![link.encounterId,link.linkId,link.localId,requestId].every(uuid)) throw Error('invalid_local_record');
    return this.request('print/create', {requestId,encounterId:link.encounterId,linkId:link.linkId,
      sourceRecordId:link.localId,revision,workstationId});
  }
  async publishDraft(link, expectedRevision, correctionReason = null) {
    if (!uuid(link.localId) || !uuid(link.linkId) || !uuid(link.encounterId)) throw Error('invalid_local_record');
    return this.request('neofeed/publish', { sourceRecordId: link.localId, encounterId: link.encounterId,
      linkId: link.linkId, expectedRevision, reviewed: true, correctionReason });
  }
  async saveDraft(link, fields, expectedRevision) {
    if (!uuid(link.localId) || !uuid(link.linkId) || !uuid(link.encounterId)) throw Error('invalid_local_record');
    // One working draft per v2 local admission, with immutable source revisions.
    // Server independently validates the current link; local flags grant no access.
    return this.request('neofeed/save-draft', {...fields,schemaVersion:2,sourceRecordId:link.localId,
      encounterId:link.encounterId,linkId:link.linkId,expectedRevision});
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
