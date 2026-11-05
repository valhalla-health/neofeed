// The TPN-room page's rules: what may print, what a sticker shows, what changed
// since the last print. No DOM and no network, so test/verify-tpn-room-core-1105.cjs
// runs them in Node. Plain script, never compiled: what is here is what runs.
//
// This file does no arithmetic on a figure, and neither does anything else on the
// page: every figure on a sticker is a string NeoFeed saved in printJson
// (openspec/changes/tpn-room-stickers, D1, D2). The page does not load data.js, so
// it has no dose code to reach for. tools/build.mjs writes the two versions the
// page checks into compiled/tpn-room-version.js.
(function (root) {
  "use strict";

  // The unit's fixed lines on the PN label (tasks.md 0.3 i). The unit has not given
  // them, so nothing prints until all three are filled in (Pp, 2026-11-05).
  const PN_FIXED = { heading: "", storage: "", extension: "" };

  // Who to call. A blank line is left off the page, never guessed (tasks.md 2.9).
  const CONTACTS = { neofeed: "", passphrase: "", wrongOrder: "หมอผู้สั่ง" };

  const WARD_BED = /^(NICU \d+|SCN \d+|iso \d+(-\d+)?)$/;
  const AN_PATTERN = /^\d{5}\/\d{2}$/;
  const DAY_MS = 86400000;
  const WARD_OFFSET_MS = 7 * 3600000;

  // Worksheet and label rows, in the unit's order (design, Stickers). WFI has its
  // own box on the worksheet, so it is not in this list.
  const STOCK_ROWS = [
    ["d50w", "50% Dextrose"],
    ["aminoven10", "10% Aminoven Infant"],
    ["amiparen10", "10% Amiparen"],
    ["aminoplasmal15", "15% Aminoplasmal"],
    ["nacl20", "20% NaCl"],
    ["glycophos", "Glycophos"],
    ["k2hpo4", "K2HPO4"],
    ["naAcetate", "Na acetate"],
    ["kcl", "KCl"],
    ["mgso4_10", "10% MgSO4"],
    ["caGluconate", "10% Ca gluconate"],
    ["soluvit", "Soluvit N"],
    ["peditrace", "Peditrace"],
    ["heparin", "Heparin"],
    ["znso4", "ZnSO4"],
    ["addamel", "Addamel N"],
  ];
  const AMINO_ROWS = [
    ["aminoven10", "Aminoven Infant"],
    ["amiparen10", "Amiparen"],
    ["aminoplasmal15", "Aminoplasmal"],
  ];
  const DELIVERED_ROWS = [
    ["naMeq", "Na", "mEq"],
    ["kMeq", "K", "mEq"],
    ["clMeq", "Cl", "mEq"],
    ["acetateMeq", "Acetate", "mEq"],
    ["caMg", "Ca", "mg"],
    ["mgMg", "Mg", "mg"],
    ["phosphateMg", "Phosphate", "mg"],
    ["znMg", "Zn", "mg"],
    ["soluvitMl", "Soluvit N", "mL"],
    ["peditraceMl", "Peditrace", "mL"],
    ["addamelMl", "Addamel N", "mL"],
    ["heparinUnits", "Heparin", "unit"],
  ];
  const TOP_FIGURES = ["dol", "dosingWeightKg", "factor", "deliveredMl", "deadMl", "preparedMl"];
  const DELIVERED_TOP = ["dextrosePct", "dextroseG", "aminoAcidPct", "osmolarity", "kcal"];

  const isFigure = (x) => typeof x === "string" && x !== "";
  const pad2 = (n) => String(n).padStart(2, "0");

  // ── Dates. Every date here is the ward's (UTC+7), as a YYYY-MM-DD string. ──
  function wardToday(now) {
    const at = now === undefined ? Date.now() : now;
    return new Date(at + WARD_OFFSET_MS).toISOString().slice(0, 10);
  }
  function isRealDate(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const at = Date.parse(s + "T00:00:00Z");
    return isFinite(at) && new Date(at).toISOString().slice(0, 10) === s;
  }
  function addDays(s, n) {
    return new Date(Date.parse(s + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
  }
  // The server's window for pharmacyOrders: today − 7 to today + 1 (design D13).
  function dateWindow(now) {
    const today = wardToday(now);
    return { today, min: addDays(today, -7), max: addDays(today, 1) };
  }
  // Stickers print the Buddhist era (design, Stickers).
  function buddhistDate(s) {
    if (!isRealDate(s)) return "";
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${Number(y) + 543}`;
  }
  function wardTime(iso, now) {
    const at = iso ? Date.parse(iso) : now;
    if (!isFinite(at)) return "";
    const t = new Date(at + WARD_OFFSET_MS);
    return `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
  }

  // ── The ward on a sticker. NICU and iso share a ward (Pp, 2026-10-30). ──
  function wardLabel(bed) {
    if (!WARD_BED.test(String(bed || ""))) return "";
    return /^SCN /.test(bed) ? "9B2(SCN)" : "9B2(NICU)";
  }

  // ── Twins share BW and DOL, so the mapping dialog says which one in large type.
  //    A registry from before 2026-08-14 has a letter and no set size. ──
  function twinLabel(letter, count) {
    if (!/^[A-D]$/.test(String(letter || ""))) return "";
    const term = { 2: "Twin", 3: "Triplet", 4: "Quadruplet" }[count];
    if (term) return `${term} ${letter} of ${count}`;
    return `${{ A: "Twin", B: "Twin", C: "Triplet", D: "Quadruplet" }[letter]} ${letter}`;
  }

  // ── The list ──
  // The server sends current revisions only. A reader that keeps the highest one
  // per NeoFeed ID still prints the right bag if that ever slips (tasks.md 2.10).
  function currentOrders(orders) {
    const best = new Map();
    for (const o of Array.isArray(orders) ? orders : []) {
      const had = best.get(o.sessionId);
      if (!had || Number(o.revision) > Number(had.revision)) best.set(o.sessionId, o);
    }
    return [...best.values()].sort(byBed);
  }
  function bedRank(bed) {
    const m = /^(NICU|iso|SCN) (\d+)(?:-(\d+))?$/.exec(String(bed || ""));
    if (!m) return [3, 0, 0];
    return [{ NICU: 0, iso: 1, SCN: 2 }[m[1]], Number(m[2]), Number(m[3] || 0)];
  }
  function byBed(a, b) {
    const x = bedRank(a.bed), y = bedRank(b.bed);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return String(a.sessionId).localeCompare(String(b.sessionId));
  }

  // ── Mapping ──
  function anProblem(an) {
    return AN_PATTERN.test(String(an || "").trim()) ? "" : "AN ต้องเป็นตัวเลขแบบ nnnnn/yy เช่น 12345/69";
  }
  // Another NeoFeed ID already holding this AN, or "".
  function anUsedBy(infants, an, sessionId) {
    const want = String(an || "").trim();
    for (const id of Object.keys(infants || {})) {
      if (id !== sessionId && infants[id].an === want) return id;
    }
    return "";
  }

  // ── Figures ──
  // Every figure a sticker reads is present and is a string. null means NeoFeed has
  // no figure (Addamel N ordered), and a missing key means the schema moved. Either
  // way the sticker would have a hole in it, so nothing prints.
  function missingFigures(pj) {
    const out = [];
    const need = (where, key) => { if (!where || !isFigure(where[key])) out.push(key); };
    for (const k of TOP_FIGURES) need(pj, k);
    for (const [k] of STOCK_ROWS) need(pj.stockMl, k);
    need(pj.stockMl, "wfi");
    for (const k of DELIVERED_TOP) need(pj.delivered, k);
    for (const [k] of DELIVERED_ROWS) need(pj.delivered, k);
    for (const [k] of AMINO_ROWS) need(pj.delivered && pj.delivered.aminoAcidG, k);
    return out;
  }

  // Why this order cannot print, in the room's words. Empty means it can.
  function printReasons(order, ctx) {
    const why = [];
    if (order.status !== "submitted") why.push("ฉบับร่าง รอหมอ Submit");
    const pj = order.printJson;
    if (!pj) {
      why.push("ยังไม่มีตัวเลขสติกเกอร์ ให้หมอเปิด order แล้วกด Submit อีกครั้ง");
    } else {
      if (pj.v !== ctx.stickerSchema) why.push("ตัวเลขสติกเกอร์คนละรุ่นกับหน้านี้ ให้หมอกด Submit อีกครั้ง");
      if (pj.constantsVersion !== ctx.constantsVersion) why.push("NeoFeed ปรับการคำนวณหลัง order นี้ ให้หมอเปิดแล้วกด Submit อีกครั้ง");
      if (!isRealDate(pj.orderDate)) why.push("order นี้ไม่มีวันที่");
      else if (ctx.date && pj.orderDate !== ctx.date) why.push("วันที่บนตัวเลขไม่ตรงกับวันที่เลือก");
      const missing = missingFigures(pj);
      if (missing.length) {
        why.push(missing.includes("addamelMl") || missing.includes("addamel")
          ? "มี Addamel N ซึ่ง NeoFeed ยังไม่มีตัวเลข เขียนจาก order กระดาษ"
          : `ตัวเลขไม่ครบ: ${missing.join(", ")}`);
      }
    }
    if (!order.entryId) why.push("order นี้ไม่มีเลขอ้างอิง (entryId)");
    if (!wardLabel(order.bed)) why.push("ยังไม่มีเตียงใน NeoFeed ให้หมอหรือพยาบาลใส่เตียงก่อน");
    if (!ctx.nameFileOpen) why.push("ไฟล์ชื่อยังไม่เปิด");
    else if (!ctx.mapping || !ctx.mapping.name || !ctx.mapping.an) why.push("ยังไม่ได้ใส่ชื่อกับ AN");
    if (!fixedLinesReady(ctx.fixed)) why.push("ยังไม่ได้ใส่ข้อความคงที่บนฉลาก PN");
    return why;
  }
  function fixedLinesReady(fixed) {
    const f = fixed || PN_FIXED;
    return !!(f.heading && f.storage && f.extension);
  }

  // ── What changed since the last print ──
  // The log holds one line per print, oldest first, so the last line for an ID and
  // date is what the room last printed. The entryId decides: an order deleted and
  // written again starts at revision 1 again (design, The name file).
  function lastPrint(printLog, sessionId, date) {
    let hit = null;
    for (const p of printLog || []) if (p.sessionId === sessionId && p.date === date) hit = p;
    return hit;
  }
  function changedAfterPrint(order, printLog, date) {
    const last = lastPrint(printLog, order.sessionId, date);
    return !!(last && last.entryId !== order.entryId);
  }
  // Printed for this date and gone from the reply: deleted, or cancelled by a No TPN
  // tick (design D16). A revision is still in the reply, so it shows as changed.
  function goneAfterPrint(orders, printLog, date) {
    const here = new Set((orders || []).map((o) => o.sessionId));
    const last = new Map();
    for (const p of printLog || []) if (p.date === date) last.set(p.sessionId, p);
    return [...last.values()].filter((p) => !here.has(p.sessionId));
  }
  // A new file lost the print log, so nothing in the window can say what was already
  // printed. Those orders go against the paper first (tasks.md 2.9).
  function needsPaperCheck(date, logLostOn) {
    if (!logLostOn || !isRealDate(date)) return false;
    return date >= addDays(logLostOn, -7) && date <= addDays(logLostOn, 1);
  }
  // The read just before a print. The list may be minutes old: refuse if this order
  // moved under it. Returns the fresh order, or the reason.
  function recheck(before, freshOrders) {
    const fresh = currentOrders(freshOrders).find((o) => o.sessionId === before.sessionId);
    if (!fresh) return { refuse: "order นี้ไม่อยู่ใน NeoFeed แล้ว" };
    if (fresh.entryId !== before.entryId) return { refuse: `หมอแก้ order ระหว่างนี้ เป็นฉบับ ${fresh.revision} ดูแถวใหม่ก่อนพิมพ์` };
    return { order: fresh };
  }

  // ── The three stickers. Strings from printJson and the mapping, nothing worked out. ──
  function stickerModel(order, mapping, preparedDate, fixed) {
    const pj = order.printJson, dl = pj.delivered, f = fixed || PN_FIXED;
    return {
      name: mapping.name,
      an: mapping.an,
      ward: wardLabel(order.bed),
      sessionId: order.sessionId,
      orderDate: buddhistDate(pj.orderDate),
      preparedDate: buddhistDate(preparedDate),
      dol: pj.dol,
      dosingWeightKg: pj.dosingWeightKg,
      factor: pj.factor,
      deliveredMl: pj.deliveredMl,
      deadMl: pj.deadMl,
      preparedMl: pj.preparedMl,
      wfiMl: pj.stockMl.wfi,
      stock: STOCK_ROWS.map(([k, label]) => ({ key: k, label, value: pj.stockMl[k] })),
      dextrosePct: dl.dextrosePct,
      dextroseG: dl.dextroseG,
      aminoAcidPct: dl.aminoAcidPct,
      amino: AMINO_ROWS.map(([k, label]) => ({ key: k, label, value: dl.aminoAcidG[k] })),
      delivered: DELIVERED_ROWS.map(([k, label, unit]) => ({ key: k, label, unit, value: dl[k] })),
      osmolarity: dl.osmolarity,
      kcal: dl.kcal,
      heading: f.heading,
      storage: f.storage,
      extension: f.extension,
    };
  }

  const api = {
    PN_FIXED, CONTACTS, STOCK_ROWS, AMINO_ROWS, DELIVERED_ROWS,
    wardToday, isRealDate, addDays, dateWindow, buddhistDate, wardTime,
    wardLabel, twinLabel, currentOrders, anProblem, anUsedBy,
    missingFigures, printReasons, fixedLinesReady,
    lastPrint, changedAfterPrint, goneAfterPrint, needsPaperCheck, recheck, stickerModel,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TPNRoomCore = api;
})(typeof window !== "undefined" ? window : globalThis);
