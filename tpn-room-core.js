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

  // The unit's fixed lines on the PN label (tasks.md 0.3 i), as the TPN unit wrote
  // them (2026-11-16, through Pp). While any of the three is blank, the whole sheet
  // prints as a trial: a mark across each of its three parts, and a placeholder in
  // each blank line of the PN label, never a guessed line (design D18). With all
  // three in, the sheet is a real label (Pp, 2026-11-16: the mark goes in this PR,
  // after she checks the sheet's PDF against the room's sticker paper).
  const PN_FIXED = {
    heading: "Parenteral nutrition กลุ่มงานเภสัชกรรม โรงพยาบาลจุฬาลงกรณ์",
    storage: "วิธีเก็บ: เก็บในตู้เย็นได้ 7 วัน, ถ้าใส่วิตามินแล้วจะเก็บ 1 วัน",
    extension: "เบอร์ต่อหน่วย TPN: 73602",
  };
  // The blank set, for the trial path and its tests.
  const PN_BLANK = { heading: "", storage: "", extension: "" };
  const PN_TRIAL = {
    mark: "ทดลองพิมพ์ ห้ามใช้จริง",
    heading: "ฉลากทดลอง ห้ามติดถุง · รอหัวฉลากจากหน่วย TPN",
    storage: "วิธีเก็บ: รอหน่วย TPN",
    extension: "เบอร์ต่อ: รอหน่วย TPN",
  };

  // Who to call. A blank line is left off the page, never guessed (tasks.md 2.9).
  const CONTACTS = { neofeed: "", passphrase: "", wrongOrder: "หมอผู้สั่ง" };

  // The wards and beds: a copy of data.js WARDS (this page never loads data.js), written by
  // tools/ward-table.cjs; a blocking check fails when it differs (paediatric-wards, design D1).
  // The sticker's ward, the room's ward groups and the bed sort all read it.
  // ── Ward table: generated from data.js WARDS by tools/ward-table.cjs (digest f6fc6b17463b). ──
  // Do not edit: change WARDS in data.js, then run `node tools/ward-table.cjs --write` (REFERENCE.md § Adding a ward).
  const WARD_TABLE = {
    "wards": [
      {"key":"NICU","label":"NICU","stickerLabel":"9B2(NICU)"},
      {"key":"SCN","label":"SCN","stickerLabel":"9B1(SCN)"}
    ],
    "runs": [
      {"prefix":"NICU","ward":"NICU","rooms":false},
      {"prefix":"iso","ward":"NICU","rooms":true},
      {"prefix":"SCN","ward":"SCN","rooms":false}
    ]
  };
  // ── end of the generated ward table ──
  const WARD_BED_RUNS = WARD_TABLE.runs;
  const runOf = (prefix) => WARD_BED_RUNS.find((r) => r.prefix === prefix) || null;
  const wardOf = (key) => WARD_TABLE.wards.find((w) => w.key === key) || null;
  const BED_PREFIXES = WARD_BED_RUNS.map((r) => r.prefix).join("|");
  // A ward bed as the backend sends it, canonical: "<prefix> <n>", and "<prefix> <room>-<bed>"
  // for a two-part run (the iso rooms). The backend blanks any other bed (PHARMACY_WARD_BED).
  const WARD_BED = new RegExp(`^(${WARD_BED_RUNS.map((r) => `${r.prefix} \\d+${r.rooms ? "(-\\d+)?" : ""}`).join("|")})$`);
  const BED_RANK = new RegExp(`^(${BED_PREFIXES}) (\\d+)(?:-(\\d+))?$`);
  // The ward a ward bed is in, or null for any other bed.
  const bedWardOf = (bed) => {
    const b = String(bed || "");
    return WARD_BED.test(b) ? wardOf(runOf(b.split(" ")[0]).ward) : null;
  };
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
  // An ISO time as the ward reads it, Buddhist era: "17/11/2569 09:05". "" when it is not a time.
  function wardDateTime(iso) {
    const at = Date.parse(iso || "");
    if (!isFinite(at)) return "";
    const day = new Date(at + WARD_OFFSET_MS).toISOString().slice(0, 10);
    return `${buddhistDate(day)} ${wardTime(iso)}`;
  }
  function wardTime(iso, now) {
    const at = iso ? Date.parse(iso) : now;
    if (!isFinite(at)) return "";
    const t = new Date(at + WARD_OFFSET_MS);
    return `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
  }

  // ── The ward on a sticker: the ward table's stickerLabel. NICU and iso share 9B2 (Pp,
  //    2026-10-30); SCN is 9B1, not 9B2 (TPN unit through Pp, 2026-11-19: "sticker cover bag
  //    ไป SCN เขียนว่า 9B2 ที่ถูกต้องคือ 9B1"). ──
  function wardLabel(bed) {
    const w = bedWardOf(bed);
    return w ? w.stickerLabel : "";
  }

  // A stock the bag does not get: printJson's string reads as zero ("0", "0.0"). The worksheet
  // leaves that row off (TPN unit through Pp, 2026-11-19: "ถ้าอันไหนไม่เติมก็ทำให้ไม่ขึ้นเลย").
  // A missing or null figure is not zero: missingFigures holds the print before it gets here.
  function zeroMl(value) {
    return typeof value === "string" && /^0+(\.0+)?$/.test(value.trim());
  }

  // ── The list is split by ward so the room sees each ward at a glance (Pp, 2026-11-14:
  //    "แยกวอร์ดให้ห้อง TPN เช่นกัน เพื่อให้ดูภาพรวมได้"). The groups are the registry's
  //    ward gate, one per ward of the table, in its order: the iso rooms are NICU's
  //    (wardGroup in data.js), the same rule as wardLabel above. The backend blanks a bed
  //    outside WARD_BED, so an order in no ward has no bed; that group shows only when it
  //    holds an order. ──
  const WARD_GROUPS = [...WARD_TABLE.wards.map((w) => [w.key, w.label]), ["none", "ไม่มีเตียง"]];
  function wardGroup(bed) {
    const w = bedWardOf(bed);
    return w ? w.key : "none";
  }
  // Orders keep the order they come in, which currentOrders sets by bed (NICU, iso, SCN).
  function ordersByWard(orders) {
    const list = orders || [];
    return WARD_GROUPS.map(([key, label]) => {
      const mine = list.filter((o) => wardGroup(o.bed) === key);
      return {
        key, label,
        submitted: mine.filter((o) => o.status === "submitted"),
        drafts: mine.filter((o) => o.status !== "submitted"),
      };
    }).filter((w) => w.key !== "none" || w.submitted.length + w.drafts.length > 0);
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
  // The run of beds in table order (NICU 0, iso 1, SCN 2), then the numbers; any other bed last.
  function bedRank(bed) {
    const m = BED_RANK.exec(String(bed || ""));
    if (!m) return [WARD_BED_RUNS.length, 0, 0];
    return [WARD_BED_RUNS.indexOf(runOf(m[1])), Number(m[2]), Number(m[3] || 0)];
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
  // The day a mapping counts as seen. From an order row it is that order's date. From the
  // names page it is the day the infant was last seen, so an edit there is no sighting and
  // the 30-day purge still counts from the orders. With neither (no list loaded), today.
  function mappingSeenOn(had, fromList, orderDate, now) {
    if (fromList && had && isRealDate(had.lastSeen)) return had.lastSeen;
    return isRealDate(orderDate) ? orderDate : wardToday(now);
  }
  // Every infant in the name file, for the names page (Pp, 2026-11-17: "หน้ารวมชื่อทุกคน"):
  // the one seen in an order most recently first, then by NeoFeed ID. `query` keeps the
  // rows whose ID, name or AN contains it, case and spaces aside.
  function namesList(infants, query) {
    const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/\s+/g, "");
    const q = norm(query);
    return Object.keys(infants || {})
      .map((id) => ({ sessionId: id, name: infants[id].name, an: infants[id].an, lastSeen: infants[id].lastSeen || "",
        by: infants[id].by || "", at: infants[id].at || "" }))
      .filter((r) => !q || [r.sessionId, r.name, r.an].some((v) => norm(v).includes(q)))
      .sort((a, b) => (a.lastSeen === b.lastSeen ? (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0)
        : a.lastSeen < b.lastSeen ? 1 : -1));
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

  // "YYYY-MM-DD.N" against "YYYY-MM-DD.N": -1, 0 or 1, the number compared as a number, as
  // gas-backend.gs _constantsVersionBefore does. null when either is not a version.
  function compareVersions(a, b) {
    const re = /^(\d{4}-\d{2}-\d{2})\.(\d+)$/;
    const x = re.exec(String(a == null ? "" : a)), y = re.exec(String(b == null ? "" : b));
    if (!x || !y) return null;
    if (x[1] !== y[1]) return x[1] < y[1] ? -1 : 1;
    const nx = Number(x[2]), ny = Number(y[2]);
    return nx === ny ? 0 : nx < ny ? -1 : 1;
  }

  // The two versions compiled/tpn-room-version.js names, from its text, or null when the
  // text is not that file.
  function versionsOf(text) {
    const m = /constantsVersion: ("[^"]*"), stickerSchema: (\d+)/.exec(String(text || ""));
    if (!m) return null;
    try { return { constantsVersion: JSON.parse(m[1]), stickerSchema: Number(m[2]) }; } catch (e) { return null; }
  }
  const sameVersions = (a, b) => !!a && !!b && a.constantsVersion === b.constantsVersion && a.stickerSchema === b.stickerSchema;

  // Which side reloads when an order is not on this page's versions (2026-11-17). On
  // 2026-11-17 a ward tab left open across the 23:21 release went on saving the old
  // calculation. The room asked for Submit again, the same tab sent the old one again,
  // and the order printed on the third press, after a reload. Submit from a tab that
  // was never reloaded cannot help, so the room says reload before Submit.
  // The served release decides (`ctx.served`, read with the list): an order on it needs
  // nothing from the doctor, and if this page is not on it, the page reloads; an order
  // on anything else, older or newer (a rollback), is the doctor's to reload and Submit,
  // and this page reloads too when it is behind. Without a served release read, this
  // page's own versions stand in for it, and an order newer than the page can only mean
  // the page was left open.
  const DOCTOR_RELOADS = "NeoFeed ปรับการคำนวณหลัง order นี้ ให้หมอกดโหลดหน้า NeoFeed ใหม่ก่อน แล้วเปิด order กด Submit อีกครั้ง";
  const PAGE_RELOADS = "หน้านี้เป็นรุ่นเก่ากว่า NeoFeed ตอนนี้ กดโหลดหน้านี้ใหม่ก่อน หมอไม่ต้อง Submit ใหม่";
  const PAGE_RELOADS_TOO = "หน้านี้เป็นรุ่นเก่ากว่า NeoFeed ตอนนี้ กดโหลดหน้านี้ใหม่ด้วย";
  function versionReasons(pj, ctx) {
    const page = { constantsVersion: ctx.constantsVersion, stickerSchema: ctx.stickerSchema };
    const ord = { constantsVersion: pj.constantsVersion, stickerSchema: pj.v };
    const served = ctx.served && typeof ctx.served.constantsVersion === "string" ? ctx.served : null;
    if (served) {
      const pageBehind = !sameVersions(page, served);
      if (sameVersions(ord, served)) return pageBehind ? [PAGE_RELOADS] : [];
      return pageBehind ? [DOCTOR_RELOADS, PAGE_RELOADS_TOO] : [DOCTOR_RELOADS];
    }
    if (sameVersions(ord, page)) return [];
    const newer = typeof pj.v === "number" && (pj.v > page.stickerSchema
      || (pj.v === page.stickerSchema && compareVersions(ord.constantsVersion, page.constantsVersion) === 1));
    return [newer ? PAGE_RELOADS : DOCTOR_RELOADS];
  }

  // Why this order cannot print, in the room's words. Empty means it can. `ctx.served`:
  // the versions the host serves now (versionsOf), or null when they were not read.
  function printReasons(order, ctx) {
    const why = [];
    if (order.status !== "submitted") why.push("ฉบับร่าง รอหมอ Submit");
    const pj = order.printJson;
    if (!pj) {
      why.push("ยังไม่มีตัวเลขสติกเกอร์ ให้หมอเปิด order แล้วกด Submit อีกครั้ง");
    } else {
      why.push(...versionReasons(pj, ctx));
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
    return why;
  }
  function fixedLinesReady(fixed) {
    const f = fixed || PN_FIXED;
    return !!(f.heading && f.storage && f.extension);
  }
  // Said on the row, beside the print button, while the sheet prints as a trial.
  function trialNote(fixed) {
    return fixedLinesReady(fixed) ? "" : "จะพิมพ์เป็นแผ่นทดลอง ห้ามใช้จริง ทั้งใบผสม ฉลาก PN และสติกเกอร์ถุง เพราะยังไม่มีหัวฉลาก วิธีเก็บ และเบอร์ต่อจากหน่วย TPN ดูเสร็จแล้วทำลายหรือทิ้งถังเอกสารลับ เพราะมีชื่อและ AN";
  }

  // The last print was a trial sheet, and the unit's lines are in now: what the room
  // holds is still the trial sheet, so the row asks for a reprint (Vera, 2026-11-16).
  function trialReprintDue(last, fixed) {
    return !!(last && last.trial && fixedLinesReady(fixed));
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
  // The last print for an ID on any date: the names page has no date.
  function lastPrintOf(printLog, sessionId) {
    let hit = null;
    for (const p of printLog || []) if (p.sessionId === sessionId) hit = p;
    return hit;
  }
  // The name or AN is not the one `last` printed, so that bag still carries the old one
  // (Vera on the names page, Pp 2026-11-17: "เพิ่มเลย"). The log keeps no name. A print
  // records the mapping's own time (`mappingAt`), so an edit saved while a print was in
  // flight, or a PC clock that stepped back, still shows; a log line from before that
  // field falls back to comparing the edit with the print's time. A print of the current
  // mapping clears it.
  function editedAfterPrint(mapping, last) {
    if (!mapping || !last) return false;
    if (typeof last.mappingAt === "string") return !!mapping.at && mapping.at !== last.mappingAt;
    const edited = Date.parse(mapping.at || ""), printed = Date.parse(last.at || "");
    return isFinite(edited) && isFinite(printed) && edited > printed;
  }
  // Every day in `win` (dateWindow) whose last print for this ID has an older name or AN
  // than `mapping`, oldest first: the names page names each bag that may still be in use
  // (Vera's second check of the flag), not only the last one printed.
  function renamedBagDates(mapping, printLog, sessionId, win) {
    const lastByDate = {};
    for (const p of printLog || []) if (p.sessionId === sessionId) lastByDate[p.date] = p;
    return Object.keys(lastByDate)
      .filter((d) => (!win || (d >= win.min && d <= win.max)) && editedAfterPrint(mapping, lastByDate[d]))
      .sort();
  }
  // A nurse's I/O-only revision keeps the bag (gas-backend.gs pharmacyOrders,
  // sameBagEntryIds), so a print of the row it revised is not a change (Vera on
  // the stakeholder-walk fixes, 2026-11-07).
  function sameBag(order, entryId) {
    return entryId === order.entryId || (order.sameBagEntryIds || []).indexOf(entryId) !== -1;
  }
  function changedAfterPrint(order, printLog, date) {
    const last = lastPrint(printLog, order.sessionId, date);
    return !!(last && !sameBag(order, last.entryId));
  }
  // Printed for this date and gone from the reply: deleted, or cancelled by a No TPN
  // tick (design D16). A revision is still in the reply, so it shows as changed.
  function goneAfterPrint(orders, printLog, date) {
    const here = new Set((orders || []).map((o) => o.sessionId));
    const last = new Map();
    for (const p of printLog || []) if (p.date === date) last.set(p.sessionId, p);
    return [...last.values()].filter((p) => !here.has(p.sessionId));
  }
  // Printed, and the reply now holds only a draft for that infant: the bag in the room
  // is out of date, and the draft's own row sits folded away (Vera, 2026-11-05).
  function draftAfterPrint(orders, printLog, date) {
    return (orders || []).filter((o) => o.status !== "submitted" && changedAfterPrint(o, printLog, date));
  }
  // A new file lost the print log, so nothing in the window can say what was already
  // printed. Those orders go against the paper first (tasks.md 2.9).
  function needsPaperCheck(date, logLostOn) {
    if (!logLostOn || !isRealDate(date)) return false;
    return date >= addDays(logLostOn, -7) && date <= addDays(logLostOn, 1);
  }
  // A tab left open keeps the versions it loaded, across a release (Vera, 2026-11-05).
  // `text` is compiled/tpn-room-version.js as the host serves it now.
  function versionsMatch(text, versions) {
    const m = /constantsVersion: ("[^"]*"), stickerSchema: (\d+)/.exec(String(text || ""));
    return !!m && m[1] === JSON.stringify(versions.constantsVersion) && Number(m[2]) === versions.stickerSchema;
  }
  // The date made: a real date within a week of today, so a mistyped year cannot print.
  function preparedDateOk(s, now) {
    if (!isRealDate(s)) return false;
    const today = wardToday(now);
    return s >= addDays(today, -7) && s <= addDays(today, 7);
  }
  // The read just before a print. The list may be minutes old: refuse if this order
  // moved under it. Returns the fresh order, or the reason.
  function recheck(before, freshOrders) {
    const fresh = currentOrders(freshOrders).find((o) => o.sessionId === before.sessionId);
    if (!fresh) return { refuse: "order นี้ไม่อยู่ใน NeoFeed แล้ว" };
    if (!sameBag(fresh, before.entryId)) return { refuse: `หมอแก้ order ระหว่างนี้ เป็นฉบับ ${fresh.revision} ดูแถวใหม่ก่อนพิมพ์` };
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
      stock: STOCK_ROWS.map(([k, label]) => ({ key: k, label, value: pj.stockMl[k] })).filter((r) => !zeroMl(r.value)),
      dextrosePct: dl.dextrosePct,
      dextroseG: dl.dextroseG,
      aminoAcidPct: dl.aminoAcidPct,
      amino: AMINO_ROWS.map(([k, label]) => ({ key: k, label, value: dl.aminoAcidG[k] })),
      delivered: DELIVERED_ROWS.map(([k, label, unit]) => ({ key: k, label, unit, value: dl[k] })),
      osmolarity: dl.osmolarity,
      kcal: dl.kcal,
      trial: !fixedLinesReady(f),
      heading: f.heading || PN_TRIAL.heading,
      storage: f.storage || PN_TRIAL.storage,
      extension: f.extension || PN_TRIAL.extension,
    };
  }

  const api = {
    PN_FIXED, PN_BLANK, PN_TRIAL, CONTACTS, STOCK_ROWS, AMINO_ROWS, DELIVERED_ROWS,
    wardToday, isRealDate, addDays, dateWindow, buddhistDate, wardTime,
    wardLabel, zeroMl, wardGroup, ordersByWard, twinLabel, currentOrders, anProblem, anUsedBy, mappingSeenOn, namesList, wardDateTime,
    missingFigures, compareVersions, versionsOf, printReasons, fixedLinesReady, trialNote, trialReprintDue,
    lastPrint, lastPrintOf, editedAfterPrint, renamedBagDates, changedAfterPrint, goneAfterPrint, draftAfterPrint, needsPaperCheck, versionsMatch, preparedDateOk,
    recheck, stickerModel,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TPNRoomCore = api;
})(typeof window !== "undefined" ? window : globalThis);
