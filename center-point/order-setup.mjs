// The Center Point calculator's setup form, turned into what <Calculator> is given.
//
// DOL is not typed. It is NeoFeed's own D.dolAtDate for the TPN date, from the
// date of birth: the same function every NeoFeed screen uses, so the DOL CP
// saves and prints is the ward's (Praew, 2026-09-24: "Check DOL ของ center point
// กับ neofeed ให้ตรงกัน"). A typed DOL was tied to neither the birth date nor
// the order date, and CP checked only that it was a whole number.
//
// `D` is window.NEOFEED_DATA (data.js), passed in so the page and the harness
// run the same code. `today` is injectable for the harness.
// Returns { patient, dol } or { error } with the message in the ward's language.
export function orderSetup({ bw, ga, dob, order }, D, today) {
  // Blank, unparseable, Buddhist-era, future or implausibly old: NeoFeed's own
  // check and wording (the same one its admission dates go through).
  const issue = D.admissionDateIssue(dob, today);
  if (issue) return { error: `วันเกิด: ${issue.message}` };
  const birth = D.normalizeDateStr(dob);
  const orderDate = D.normalizeDateStr(order);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) return { error: 'วันที่ให้ TPN ไม่ถูกต้อง' };
  if (birth > orderDate) return { error: `วันเกิด ${birth} อยู่หลังวันที่ให้ TPN ${orderDate}` };
  const patient = { bw: Number(bw), ga: Number(ga), dob: birth, weights: [] };
  return { patient, dol: D.dolAtDate(patient, orderDate) };
}
