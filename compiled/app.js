"use strict";
const D_A = window.NEOFEED_DATA;
const THAI_LEAD = /* @__PURE__ */ new Set(["เ", "แ", "โ", "ใ", "ไ"]);
function firstChar(str) {
  if (!str) return "?";
  for (const ch of str) {
    if (!THAI_LEAD.has(ch)) return ch.toUpperCase();
  }
  return str[0].toUpperCase();
}
const GAS_URL = window.NEOFEED_GAS_URL || "";
const GAS_ON = GAS_URL.length > 10;
const GAS_TIMEOUT_MS = 45e3;
class GasRequestError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "GasRequestError";
    this.kind = kind;
  }
}
function gasErrorText(kind) {
  return kind === "timeout" ? `เซิร์ฟเวอร์ไม่ตอบกลับภายใน ${GAS_TIMEOUT_MS / 1e3} วินาที` : kind === "badResponse" ? "เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (อาจกำลังปรับปรุงหรือใช้งานเกินโควตา)" : kind === "offline" ? "อุปกรณ์นี้ออฟไลน์อยู่" : "ตรวจสอบการเชื่อมต่อ";
}
function gasRequest(body, { timeoutMs = GAS_TIMEOUT_MS } = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return Promise.reject(new GasRequestError("offline", gasErrorText("offline")));
  }
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer = null;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        ctrl && ctrl.abort();
      } catch {
      }
      reject(new GasRequestError("timeout", gasErrorText("timeout")));
    }, timeoutMs);
  });
  const run = (async () => {
    let res;
    try {
      res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
        ...ctrl ? { signal: ctrl.signal } : {}
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw new GasRequestError("timeout", gasErrorText("timeout"));
      throw new GasRequestError("network", gasErrorText("network"));
    }
    let data;
    try {
      data = await res.json();
    } catch {
      throw new GasRequestError("badResponse", gasErrorText("badResponse"));
    }
    if (!data || typeof data !== "object") throw new GasRequestError("badResponse", gasErrorText("badResponse"));
    return data;
  })();
  return Promise.race([run, deadline]).finally(() => clearTimeout(timer));
}
const SEX_ALIASES = {
  boys: "boys",
  boy: "boys",
  m: "boys",
  male: "boys",
  "ชาย": "boys",
  girls: "girls",
  girl: "girls",
  f: "girls",
  female: "girls",
  "หญิง": "girls"
};
function normalizeSex(v) {
  const k = String(v == null ? "" : v).trim().toLowerCase();
  return SEX_ALIASES[k] || (v == null ? "" : v);
}
const IDLE_LOGOUT_MS = 30 * 60 * 1e3;
const IDLE_CHECK_MS = 3e4;
const IDLE_INPUT_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"];
const SESSION_NOTICES = {
  idle: {
    kind: "idle",
    title: "ออกจากระบบอัตโนมัติ — ไม่มีการใช้งาน 30 นาที",
    body: "งานที่ยังไม่บันทึกถูกเก็บเป็นร่างไว้ — เข้าสู่ระบบอีกครั้งเพื่อทำต่อ"
  },
  expired: {
    kind: "expired",
    title: "เซสชันหมดอายุ — งานที่ยังไม่บันทึกถูกเก็บเป็นร่าง",
    body: "กรุณาเข้าสู่ระบบใหม่"
  },
  // gas-backend.gs's absolute 12 h cap answers Unauthorized with
  // reason "SessionMaxAge" — same logout, but "expired" would read as a fault.
  maxAge: {
    kind: "maxAge",
    title: "เซสชันครบ 12 ชั่วโมง — กรุณาเข้าสู่ระบบใหม่",
    body: "งานที่ยังไม่บันทึกถูกเก็บเป็นร่าง"
  }
};
const unauthorizedReason = (data) => data && data.reason === "SessionMaxAge" ? "maxAge" : "expired";
const DUPLICATE_DATE_RE = /มีบันทึกของผู้ป่วยรายนี้ในวันที่/;
const isDuplicateDate = (res) => res && (res.code === "DuplicateDate" || DUPLICATE_DATE_RE.test(String(res.error || "")));
const ackKey = (id, dol) => `${id}:${dol}`;
const readAckedMap = (sessionId) => {
  try {
    return JSON.parse(localStorage.getItem(`neofeed_acked_${sessionId}`)) || {};
  } catch {
    return {};
  }
};
function previousLogEntry(entries, targetDate) {
  const target = D_A.normalizeDateStr(targetDate);
  if (!target) return null;
  return D_A.finalEntries(entries).filter((entry) => {
    const entryDate = D_A.normalizeDateStr(entry?.ts);
    return entryDate && entryDate < target;
  }).slice().sort((a, b) => D_A.normalizeDateStr(a.ts).localeCompare(D_A.normalizeDateStr(b.ts))).slice(-1)[0] || null;
}
function computeAlerts(patient, allEntries) {
  const alerts = [];
  const entries = D_A.finalEntries(allEntries);
  const last = entries[entries.length - 1];
  if (last) {
    const isEN = (last.enVolPerKg || 0) >= 100;
    const T = isEN ? D_A.ENTERAL_TARGETS : D_A.TPN_TARGETS;
    const src = isEN ? "ESPGHAN 2022" : "ESPGHAN 2018";
    const route = isEN ? "enteral" : "parenteral";
    const lastDol = D_A.entryDol(patient, last);
    const tGir = D_A.TARGETS.gir();
    const tPro = isEN ? T.protein() : T.protein(lastDol);
    const tKcal = isEN ? T.kcal() : T.kcal(lastDol);
    const nA = (v, d = 1) => D_A.displayNum(v, d);
    const girS = D_A.girStatus(last.gir);
    if (girS === "crit") alerts.push({ id: "gir-high", level: "crit", title: "GIR critically high", body: `Logged GIR ${nA(last.gir, 2)} mg/kg/min — above the ${D_A.GIR_HARD_HI} hard limit; reduce dextrose concentration.`, dol: lastDol, ref: "ESPGHAN 2018" });
    else if (girS === "warn") alerts.push({ id: "gir-off", level: "warn", title: "GIR off target", body: `Logged GIR ${nA(last.gir, 2)} mg/kg/min — aim ${tGir[0]}–${tGir[1]} mg/kg/min.`, dol: lastDol, ref: "ESPGHAN 2018" });
    if (last.pro < tPro[0] && lastDol > 2) alerts.push({ id: "protein-low", level: "warn", title: "Protein below DOL target", body: `${nA(last.pro, 2)} g/kg/d on DOL ${lastDol} — target ${tPro[0]}–${tPro[1]} g/kg/d (${src}, ${route}).`, dol: lastDol, ref: src });
    if (last.kcal < tKcal[0] && lastDol > 4) alerts.push({ id: "kcal-low", level: "warn", title: "Energy below growth target", body: `${nA(last.kcal, 1)} kcal/kg/d — target ${tKcal[0]}–${tKcal[1]} kcal/kg/d for DOL ${lastDol} (${src}, ${route}).`, dol: lastDol, ref: src });
  }
  const gv = D_A.growthVelocity(patient, entries);
  if (gv.status === "critical" || gv.status === "low") {
    alerts.push({
      id: "growth-velocity",
      level: gv.status === "critical" ? "crit" : "warn",
      title: gv.status === "critical" ? "Growth velocity critically low" : "Growth velocity below target",
      body: `${D_A.displayNum(gv.vel, 1)} g/kg/d over ${gv.days} d (DOL ${gv.from.dol}→${gv.to.dol}, measured from the regain of birth weight) — target ≥${D_A.GROWTH_VEL_TARGET} g/kg/d (ESPGHAN 2022 ≥17–20 for catch-up).`,
      dol: gv.to.dol,
      ref: "ESPGHAN 2022"
    });
  } else if (gv.status === "notRegained") {
    alerts.push({
      id: "growth-regain",
      level: "warn",
      title: "Birth weight not regained",
      body: gv.reason,
      dol: gv.to?.dol,
      ref: "ESPGHAN 2022"
    });
  } else if (gv.status === "physiologicalLoss" || gv.status === "beyondReference") {
    alerts.push({
      id: `growth-${gv.status}`,
      level: "info",
      title: gv.status === "physiologicalLoss" ? "Growth velocity — not yet assessable" : "Growth velocity — beyond the Fenton reference",
      body: gv.reason,
      dol: gv.to?.dol,
      ref: "ESPGHAN 2022"
    });
  }
  const lastWtEntry = D_A.lastWeighed(patient, entries);
  const todaysDol = D_A.liveDol(patient);
  if (lastWtEntry) {
    const daysSince = todaysDol - lastWtEntry.dol;
    if (daysSince >= 3) {
      alerts.push({
        id: "weight-stale",
        level: daysSince >= 7 ? "crit" : "warn",
        title: daysSince >= 7 ? "Weight measurement >7 days overdue" : "Weight measurement stale",
        body: `Last weight ${lastWtEntry.w} g on DOL ${lastWtEntry.dol}${lastWtEntry.src === "order" ? " (จากใบสั่ง TPN)" : ""} — ${daysSince} days ago. ESPGHAN: daily weights for VLBW/ELBW infants.`,
        dol: todaysDol,
        ref: "ESPGHAN 2022"
      });
    }
  }
  alerts.push({ id: "electrolyte-audit", level: "info", title: "Electrolyte review — protocol reminder", body: "KCMH protocol: review serum electrolytes at least weekly while on PN. NeoFeed does not track draw dates — check the chart.", dol: last ? D_A.entryDol(patient, last) : void 0, ref: "KCMH protocol" });
  return alerts;
}
function activeAlertCount(patient, entries) {
  const acked = readAckedMap(patient.sessionId);
  return computeAlerts(patient, entries).filter((a) => !acked[ackKey(a.id, a.dol)]).length;
}
const NeoFeedWordmark = ({ className, style, lockup = false }) => /* @__PURE__ */ React.createElement(
  "div",
  {
    className: className ? `nf-wordmark ${className}` : "nf-wordmark",
    style,
    role: "img",
    "aria-label": "NeoFeed"
  },
  /* @__PURE__ */ React.createElement(
    "svg",
    {
      className: "nf-mark",
      viewBox: lockup ? "0 0 456 112.9" : "0 0 456 100.9",
      "aria-hidden": "true",
      focusable: "false"
    },
    /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "nf-forest", gradientUnits: "userSpaceOnUse", x1: "0", y1: "0", x2: "0", y2: "100" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#335A4A" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#284C40" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "nf-sage", gradientUnits: "userSpaceOnUse", x1: "0", y1: "22", x2: "0", y2: "100" }, /* @__PURE__ */ React.createElement("stop", { offset: "0", stopColor: "#99B29C" }), /* @__PURE__ */ React.createElement("stop", { offset: "1", stopColor: "#799781" }))),
    /* @__PURE__ */ React.createElement("path", { fill: "url(#nf-forest)", d: "M0 8 C0 13.11 2.65 19.16 6.4 24.95 A15.5 15.5 0 0 1 27.71 47.05 C40.21 56.58 50.45 66.99 58.81 80.53 C61.77 85.33 68.4 100 78 100 L81 100 A9 9 0 0 0 90 91 L90 4 A4 4 0 0 0 86 0 L66 0 A4 4 0 0 0 62 4 L62 45.01 L28 3.65 A10 10 0 0 0 20.28 0 L8 0 A8 8 0 0 0 0 8 Z" }),
    /* @__PURE__ */ React.createElement("path", { fill: "url(#nf-sage)", d: "M0 21.91 C9.27 39.88 24.23 49.21 30 53.96 L30 91 A9 9 0 0 1 21 100 L9 100 A9 9 0 0 1 0 91 Z" }),
    /* @__PURE__ */ React.createElement("path", { fill: "url(#nf-sage)", d: "M8.66 28.25 A11.5 11.5 0 0 1 24.5 44.65 C24.43 44.6 24.36 44.55 24.29 44.49 C19.75 41.19 13.63 35.07 8.66 28.25 Z" }),
    /* @__PURE__ */ React.createElement("path", { fill: "#284C40", fillRule: "evenodd", d: "M151.85 73.49L114.61 73.49C113.92 73.49 113.38 74.07 113.45 74.76Q113.98 78.87 116.13 81.03Q118.61 83.5 122.46 83.5Q126.85 83.5 129.2 80.29C129.78 79.29 130.89 78.66 132.05 78.66L149.4 78.66C151.32 78.66 152.63 80.41 152.09 82.25Q150.52 86.49 147.59 90.05Q143.47 95.05 137.2 97.91Q130.93 100.77 123.34 100.77Q114.21 100.77 107.11 96.92Q100.02 93.07 96 85.92Q91.99 78.77 91.99 69.09Q91.99 59.41 95.95 52.31Q99.91 45.22 107 41.37Q114.1 37.52 123.34 37.52Q132.47 37.52 139.51 41.26Q146.55 45 150.51 51.98Q154.47 58.97 154.47 68.43Q154.47 69.82 154.37 71.22C154.24 72.52 153.16 73.49 151.85 73.49ZM132.4 61.84Q132.05 58.73 129.83 56.83Q127.19 54.57 123.23 54.57Q119.27 54.57 116.74 56.71Q114.65 58.48 113.76 61.64C113.59 62.37 114.13 63.04 114.88 63.04L131.27 63.04C131.93 63.04 132.44 62.5 132.4 61.84ZM155.21 69.09Q155.21 59.52 159.44 52.37Q163.68 45.22 170.99 41.37Q178.31 37.52 187.55 37.52Q196.79 37.52 204.1 41.37Q211.42 45.22 215.65 52.37Q219.89 59.52 219.89 69.09Q219.89 78.66 215.65 85.86Q211.42 93.07 204.05 96.92Q196.68 100.77 187.44 100.77Q178.2 100.77 170.88 96.92Q163.57 93.07 159.39 85.92Q155.21 78.77 155.21 69.09ZM198 69.09Q198 62.82 194.97 59.52Q191.95 56.22 187.55 56.22Q183.15 56.22 180.18 59.52Q177.21 62.82 177.21 69.09Q177.21 75.47 180.07 78.77Q182.93 82.07 187.44 82.07Q191.95 82.07 194.97 78.72Q198 75.36 198 69.09Z" }),
    /* @__PURE__ */ React.createElement("path", { fill: "#476655", fillRule: "evenodd", d: "M273.14 25.78L273.14 34.85C273.14 36.51 271.8 37.85 270.14 37.85L242.88 37.85C242.22 37.85 241.68 38.39 241.68 39.05L241.68 52.93C241.68 53.59 242.22 54.13 242.88 54.13L262.22 54.13C263.88 54.13 265.22 55.47 265.22 57.13L265.22 65.76C265.22 67.42 263.88 68.76 262.22 68.76L242.88 68.76C242.22 68.76 241.68 69.3 241.68 69.96L241.68 97C241.68 98.66 240.34 100 238.68 100L225.87 100C224.21 100 222.87 98.66 222.87 97L222.87 25.78C222.87 24.12 224.21 22.78 225.87 22.78L270.14 22.78C271.8 22.78 273.14 24.12 273.14 25.78ZM324.99 73.82L286.2 73.82C285.5 73.82 284.96 74.41 285.04 75.11Q285.72 79.89 288.58 82.56Q291.83 85.59 296.56 85.59Q302.53 85.59 305.41 81.32C305.98 80.3 307.1 79.65 308.27 79.65L322.51 79.65C324.47 79.65 325.78 81.46 325.17 83.31Q323.58 87.21 320.81 90.54Q316.8 95.38 310.75 98.13Q304.7 100.88 297.22 100.88Q288.2 100.88 281.16 97.03Q274.12 93.18 270.16 86.03Q266.2 78.88 266.2 69.31Q266.2 59.74 270.1 52.59Q274.01 45.44 281.05 41.59Q288.09 37.74 297.22 37.74Q306.13 37.74 313.06 41.48Q319.99 45.22 323.89 52.15Q327.8 59.08 327.8 68.32Q327.8 69.8 327.7 71.35C327.57 72.76 326.4 73.82 324.99 73.82ZM297.86 49.11V46.06A0.62 0.62 0 0 1 299.09 46.06V49.11Q302.11 49.11 302.11 50.75V52.64L303.9 54.28V65.52A1.39 1.39 0 0 1 302.51 66.91H294.45A1.39 1.39 0 0 1 293.06 65.52V54.28L294.84 52.64V50.75Q294.84 49.11 297.86 49.11ZM387.57 73.82L348.78 73.82C348.08 73.82 347.55 74.41 347.62 75.11Q348.3 79.89 351.17 82.56Q354.41 85.59 359.14 85.59Q365.11 85.59 368 81.32C368.57 80.3 369.68 79.65 370.85 79.65L385.09 79.65C387.05 79.65 388.36 81.46 387.75 83.31Q386.16 87.21 383.4 90.54Q379.38 95.38 373.33 98.13Q367.28 100.88 359.8 100.88Q350.78 100.88 343.74 97.03Q336.7 93.18 332.74 86.03Q328.78 78.88 328.78 69.31Q328.78 59.74 332.69 52.59Q336.59 45.44 343.63 41.59Q350.67 37.74 359.8 37.74Q368.71 37.74 375.64 41.48Q382.57 45.22 386.48 52.15Q390.38 59.08 390.38 68.32Q390.38 69.8 390.28 71.35C390.15 72.76 388.99 73.82 387.57 73.82ZM360.63 46.07C364.13 52 366.54 55.77 366.54 59.81C366.54 62.84 363.7 66.28 360.63 66.28C357.56 66.28 354.72 62.84 354.72 59.81C354.72 55.77 357.13 52 360.63 46.07ZM418.18 37.74Q424.23 37.74 429.23 40.27Q432.31 41.82 434.57 44.04C435.33 44.96 437.1 44.31 437.1 43.13L437.1 21.6C437.1 19.94 438.44 18.6 440.1 18.6L452.91 18.6C454.56 18.6 455.91 19.94 455.91 21.6L455.91 97C455.91 98.66 454.56 100 452.91 100L440.1 100C438.44 100 437.1 98.66 437.1 97L437.1 95.16C437.1 94.05 435.38 93.46 434.71 94.35Q432.56 96.62 429.56 98.24Q424.67 100.88 418.18 100.88Q410.59 100.88 404.43 96.97Q398.27 93.07 394.69 85.86Q391.12 78.66 391.12 69.2Q391.12 59.74 394.69 52.59Q398.27 45.44 404.43 41.59Q410.59 37.74 418.18 37.74ZM423.68 54.13Q418.07 54.13 414.16 58.15Q410.26 62.16 410.26 69.2Q410.26 76.24 414.16 80.36Q418.07 84.49 423.68 84.49Q429.29 84.49 433.19 80.42Q437.1 76.35 437.1 69.31Q437.1 62.27 433.19 58.2Q429.29 54.13 423.68 54.13Z" }),
    lockup && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { fill: "#476655", d: "M53.03 106.59H227.95V112.81H53.03A3.11 3.11 0 0 1 53.03 106.59Z" }), /* @__PURE__ */ React.createElement("path", { fill: "#C5A46D", d: "M227.95 106.59H402.88A3.11 3.11 0 0 1 402.88 112.81H227.95Z" }))
  )
);
const SYNC_SLOW_AFTER_MS = 6e3;
const SYNC_VERY_SLOW_AFTER_MS = 15e3;
function SyncGate({ online, failed, detail, onRetry }) {
  const [elapsed, setElapsed] = React.useState(0);
  const startRef = React.useRef(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 1e3);
    return () => clearInterval(t);
  }, []);
  const slow = elapsed >= SYNC_SLOW_AFTER_MS;
  const verySlow = elapsed >= SYNC_VERY_SLOW_AFTER_MS;
  const secs = Math.floor(elapsed / 1e3);
  const stalled = !online || failed;
  const head = !online ? "ไม่ได้เชื่อมต่อเครือข่าย" : failed ? "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ" : "กำลังโหลดข้อมูลผู้ป่วย";
  const sub = !online ? "อุปกรณ์นี้ออฟไลน์อยู่ — ตรวจสอบ Wi-Fi ของ ward แล้วลองใหม่" : failed ? "เซิร์ฟเวอร์ไม่ตอบกลับ — กด “ลองใหม่” หรือแจ้ง admin หากยังไม่สำเร็จ" : verySlow ? "ใช้เวลานานกว่าปกติ — เซิร์ฟเวอร์ Apps Script อาจกำลังเริ่มทำงาน (cold start) หรือสัญญาณ Wi-Fi อ่อน" : slow ? "กำลังซิงก์จาก Google Apps Script" : "กำลังเชื่อมต่อ Google Apps Script";
  const accent = !online ? "var(--crit)" : failed ? "var(--crit)" : "var(--brand)";
  return /* @__PURE__ */ React.createElement("div", { style: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg)",
    fontFamily: "'IBM Plex Sans','IBM Plex Sans Thai','Sarabun',sans-serif",
    padding: "24px calc(20px + env(safe-area-inset-right, 0px)) calc(24px + env(safe-area-inset-bottom, 0px)) calc(20px + env(safe-area-inset-left, 0px))",
    overflowY: "auto"
  } }, /* @__PURE__ */ React.createElement("div", { role: "status", "aria-live": "polite", style: {
    width: "min(380px, 100%)",
    boxSizing: "border-box",
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-pop)",
    padding: "28px 24px 22px",
    textAlign: "center"
  } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20 } }, /* @__PURE__ */ React.createElement(NeoFeedWordmark, { style: { fontSize: 30 } })), /* @__PURE__ */ React.createElement("div", { style: {
    height: 4,
    borderRadius: 999,
    background: "var(--line-2)",
    overflow: "hidden",
    marginBottom: 18,
    position: "relative"
  } }, stalled ? /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", inset: 0, background: accent, opacity: 0.45 } }) : /* @__PURE__ */ React.createElement("div", { className: "sg-bar", style: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "40%",
    borderRadius: 999,
    background: "linear-gradient(90deg, transparent, var(--brand), transparent)"
  } })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 6, lineHeight: 1.4 } }, head), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 } }, sub), online && failed && detail && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, fontSize: 12, color: "var(--crit)", lineHeight: 1.5 } }, detail), (slow || stalled) && /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 14,
    fontSize: 11.5,
    color: "var(--ink-4)",
    fontVariantNumeric: "tabular-nums",
    fontFeatureSettings: "'tnum'"
  } }, "รอมาแล้ว ", secs, " วินาที"), (verySlow || stalled) && /* @__PURE__ */ React.createElement("button", { className: "btn primary", onClick: onRetry, style: {
    marginTop: 16,
    width: "100%",
    minHeight: 44,
    justifyContent: "center",
    fontSize: 13.5,
    fontWeight: 600
  } }, "ลองใหม่"), /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 18,
    paddingTop: 14,
    borderTop: "1px solid var(--line-2)",
    fontSize: 10.5,
    color: "var(--ink-4)",
    letterSpacing: "0.02em"
  } }, "V2.0 · ESPGHAN 2018/2022")), /* @__PURE__ */ React.createElement("style", null, `
        @keyframes sg-slide { 0% { left: -40%; } 100% { left: 100%; } }
        .sg-bar { animation: sg-slide 1.15s cubic-bezier(.4,0,.6,1) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .sg-bar { animation: none; left: 0; width: 100%; opacity: .45; }
        }
      `));
}
function writeSession(u) {
  try {
    sessionStorage.setItem("neofeed_session", JSON.stringify(u));
  } catch {
  }
}
function clearSession() {
  try {
    sessionStorage.removeItem("neofeed_session");
  } catch {
  }
}
function AppRoot() {
  const [epoch, setEpoch] = React.useState(0);
  const [notice, setNotice] = React.useState(null);
  const onSessionEnd = React.useCallback((n) => {
    setNotice(n || null);
    setEpoch((e) => e + 1);
  }, []);
  const onNoticeSeen = React.useCallback(() => setNotice(null), []);
  return /* @__PURE__ */ React.createElement(App, { key: epoch, notice, onSessionEnd, onNoticeSeen });
}
class ViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("NeoFeed: a view failed to render", error, info && info.componentStack);
  }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const root = this.props.variant === "root";
    return /* @__PURE__ */ React.createElement("div", { role: "alert", className: "card", style: { padding: "24px 20px", maxWidth: 520, margin: root ? "12vh auto" : "24px auto", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, fontWeight: 600, color: "var(--crit, #b3261e)", marginBottom: 6 } }, root ? "NeoFeed แสดงผลไม่ได้" : "หน้านี้แสดงผลไม่ได้"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--ink-3)", marginBottom: 16, lineHeight: 1.6 } }, "ข้อมูลที่บันทึกแล้วไม่ได้รับผลกระทบ · งานที่ยังไม่บันทึกในหน้าคำสั่ง (Calc) ถูกเก็บเป็นร่างไว้", root ? " — กดโหลดใหม่ ถ้ายังเกิดซ้ำให้แจ้ง admin" : " — ลองกลับไปหน้ารายชื่อผู้ป่วย หรือโหลดใหม่ ถ้ายังเกิดซ้ำกับผู้ป่วยรายนี้ให้แจ้ง admin"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" } }, !root && this.props.onGoRegistry && /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => {
      this.setState({ error: null });
      this.props.onGoRegistry();
    } }, "กลับไปหน้ารายชื่อผู้ป่วย"), /* @__PURE__ */ React.createElement("button", { className: "btn primary", onClick: () => location.reload() }, "โหลดใหม่")), /* @__PURE__ */ React.createElement("details", { style: { marginTop: 14, fontSize: 11, color: "var(--ink-3)", textAlign: "left" } }, /* @__PURE__ */ React.createElement("summary", { style: { cursor: "pointer" } }, "รายละเอียดสำหรับผู้ดูแลระบบ"), /* @__PURE__ */ React.createElement("code", { style: { whiteSpace: "pre-wrap", wordBreak: "break-word" } }, String(error && error.message || error))));
  }
}
const PATIENT_VIEWS = ["log", "calculator", "fenton", "alerts"];
function NoPatientCard({ onPick }) {
  return /* @__PURE__ */ React.createElement("div", { className: "card", style: { padding: "28px 20px", textAlign: "center", maxWidth: 460, margin: "24px auto" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 6 } }, "ยังไม่ได้เลือกผู้ป่วย"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--ink-3)", marginBottom: 16, lineHeight: 1.5 } }, "หน้านี้แสดงข้อมูลของผู้ป่วยทีละราย — เลือกผู้ป่วยก่อน"), /* @__PURE__ */ React.createElement("button", { className: "btn primary", onClick: onPick, style: { justifyContent: "center", minWidth: 160 } }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14, color: "#fff" }), " เลือกผู้ป่วย"));
}
function App({ notice = null, onSessionEnd, onNoticeSeen } = {}) {
  const [user, setUser] = React.useState(() => {
    try {
      const s = sessionStorage.getItem("neofeed_session");
      if (s) return JSON.parse(s);
    } catch {
    }
    return GAS_ON ? null : { name: "Local user", role: "doctor", email: "", token: "" };
  });
  const role = user?.role || null;
  const authName = user?.name || "";
  const userRef = React.useRef(user);
  userRef.current = user;
  const [patients, setPatients] = React.useState(GAS_ON ? [] : D_A.MOCK_PATIENTS);
  const [log, setLog] = React.useState(GAS_ON ? {} : D_A.MOCK_DAILY_LOG);
  const [activeId, setActiveId] = React.useState(null);
  const [view, setView] = React.useState("registry");
  const [ward, setWard] = React.useState(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [syncState, setSyncState] = React.useState(GAS_ON ? "loading" : "local");
  const [lastSync, setLastSync] = React.useState(null);
  const [syncError, setSyncError] = React.useState("");
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const includeArchivedRef = React.useRef(false);
  includeArchivedRef.current = includeArchived;
  const [online, setOnline] = React.useState(
    typeof navigator === "undefined" || navigator.onLine !== false
  );
  const [staleTick, setStaleTick] = React.useState(0);
  const [calcWeights, setCalcWeights] = React.useState({});
  React.useEffect(() => {
    setCalcWeights({});
  }, [activeId]);
  const [editEntry, setEditEntry] = React.useState(null);
  const [logDate, setLogDate] = React.useState(null);
  React.useEffect(() => {
    setEditEntry(null);
    setLogDate(null);
  }, [activeId]);
  const goTo = (v) => {
    setEditEntry(null);
    setLogDate(null);
    setView(v);
  };
  const active = patients.find((p) => p.sessionId === activeId);
  const lastWt = active?.weights?.slice(-1)[0];
  const dol = D_A.liveDol(active);
  const [ackVersion, setAckVersion] = React.useState(0);
  const alertCount = React.useMemo(() => {
    if (!active) return 0;
    return activeAlertCount(active, log[active.sessionId] || []);
  }, [active, log, dol, ackVersion]);
  const flagPasswordChangeRequired = React.useCallback(() => {
    setUser((u) => {
      if (!u || u.mustChangePassword) return u;
      const flagged = { ...u, mustChangePassword: true };
      writeSession(flagged);
      return flagged;
    });
  }, []);
  const endedRef = React.useRef(false);
  const endSession = React.useCallback((reason) => {
    if (endedRef.current) return;
    endedRef.current = true;
    const tok = userRef.current?.token || "";
    if (GAS_ON && tok && (reason === "manual" || reason === "idle")) {
      gasRequest({ action: "logout", token: tok }, { timeoutMs: 1e4 }).catch(() => {
      });
    }
    clearSession();
    if (reason === "manual" || reason === "idle") {
      const prefixes = reason === "manual" ? ["neofeed_calc_", "neofeed_acked_", "neofeed_draft_"] : ["neofeed_calc_", "neofeed_acked_"];
      try {
        Object.keys(localStorage).filter((k) => prefixes.some((p) => k.startsWith(p))).forEach((k) => localStorage.removeItem(k));
      } catch {
      }
    }
    try {
      if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
    } catch {
    }
    if (onSessionEnd) onSessionEnd(SESSION_NOTICES[reason] || null);
    else setUser(null);
  }, [onSessionEnd]);
  const endSessionRef = React.useRef(endSession);
  endSessionRef.current = endSession;
  const lastInputRef = React.useRef(Date.now());
  React.useEffect(() => {
    if (!GAS_ON || !user) return;
    lastInputRef.current = Date.now();
    const mark = () => {
      lastInputRef.current = Date.now();
    };
    const check = () => {
      if (Date.now() - lastInputRef.current >= IDLE_LOGOUT_MS) endSessionRef.current("idle");
    };
    const opts = { capture: true, passive: true };
    IDLE_INPUT_EVENTS.forEach((t2) => window.addEventListener(t2, mark, opts));
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const t = setInterval(check, IDLE_CHECK_MS);
    return () => {
      IDLE_INPUT_EVENTS.forEach((ev) => window.removeEventListener(ev, mark, opts));
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      clearInterval(t);
    };
  }, [user?.email]);
  const SYNC_INFLIGHT_MAX_MS = 6e4;
  const inFlightRef = React.useRef(0);
  const syncSeqRef = React.useRef(0);
  const syncInFlight = React.useCallback(
    () => inFlightRef.current > 0 && Date.now() - inFlightRef.current < SYNC_INFLIGHT_MAX_MS,
    []
  );
  const syncMsRef = React.useRef(null);
  const writeGenRef = React.useRef(0);
  const pendingWritesRef = React.useRef(0);
  const resyncAfterWritesRef = React.useRef(false);
  const unknownWriteRef = React.useRef(false);
  const syncRef = React.useRef(null);
  const beginWrite = React.useCallback(() => {
    writeGenRef.current++;
    pendingWritesRef.current++;
    let done = false;
    return (res) => {
      if (done) return;
      done = true;
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      if (res && res.unknown) unknownWriteRef.current = true;
      if (res && !res.ok && res.refused) resyncAfterWritesRef.current = true;
      if (pendingWritesRef.current === 0 && (resyncAfterWritesRef.current || unknownWriteRef.current)) {
        resyncAfterWritesRef.current = false;
        if (!endedRef.current && syncRef.current) syncRef.current();
      }
    };
  }, []);
  const syncFailsRef = React.useRef(0);
  const lastSyncAttemptRef = React.useRef(0);
  const syncBackingOff = React.useCallback(() => {
    const fails = syncFailsRef.current;
    if (!fails) return false;
    const wait = Math.min(D_A.SYNC_POLL_MS, 3e4 * Math.pow(2, fails));
    return Date.now() - lastSyncAttemptRef.current < wait;
  }, []);
  const serverPatientsRef = React.useRef(/* @__PURE__ */ new Map());
  const appliedSeqRef = React.useRef(0);
  const syncFromGAS = React.useCallback(() => {
    if (!GAS_ON || endedRef.current) return;
    const startedAt = Date.now();
    inFlightRef.current = startedAt;
    lastSyncAttemptRef.current = startedAt;
    const seq = ++syncSeqRef.current;
    const genAtStart = writeGenRef.current;
    const pendingAtStart = pendingWritesRef.current;
    const stale = () => seq !== syncSeqRef.current || endedRef.current;
    const settle = () => {
      inFlightRef.current = 0;
      syncMsRef.current = Date.now() - startedAt;
    };
    const failed = (msg) => {
      syncFailsRef.current++;
      setSyncError(msg || "");
      setSyncState("error");
    };
    setSyncState("loading");
    const u = userRef.current || {};
    gasRequest({
      action: "getActivePatients",
      token: u.token || "",
      // The server returns only patients within its sync window (active, or
      // discharged ≤30 days) unless an admin asks for the archive — admins
      // handle data-subject requests and readmissions. The server re-checks
      // the role; this flag alone grants nothing. Sent only while an admin
      // has switched the archive on (UP-S14).
      includeArchived: u.role === "admin" && includeArchivedRef.current
    }).then((data) => {
      if (stale()) return;
      settle();
      if (data.error === "Unauthorized") {
        endSessionRef.current(unauthorizedReason(data));
        return;
      }
      if (data.error === "PasswordChangeRequired") {
        flagPasswordChangeRequired();
        setSyncState("error");
        return;
      }
      if (data.error) {
        if (syncFailsRef.current === 0 && data.code) showToast(String(data.error), "error");
        failed(String(data.error));
        return;
      }
      if (pendingAtStart > 0 || writeGenRef.current !== genAtStart) {
        if (pendingWritesRef.current > 0) resyncAfterWritesRef.current = true;
        else if (syncRef.current) syncRef.current();
        return;
      }
      if (Array.isArray(data.patients)) {
        const cleanMeasures = (arr) => Array.isArray(arr) ? arr.filter((x) => x && typeof x === "object" && !Array.isArray(x)) : arr;
        const incoming = data.patients.map((p) => ({
          ...p,
          currentBed: D_A.normalizeBed(p.currentBed),
          sex: normalizeSex(p.sex),
          weights: cleanMeasures(p.weights),
          lengths: cleanMeasures(p.lengths),
          hcs: cleanMeasures(p.hcs),
          bedHistory: cleanMeasures(p.bedHistory)
        }));
        serverPatientsRef.current = new Map(incoming.map((p) => [p.sessionId, p]));
        const withDob = incoming.map((p) => {
          if (p.dob || !p.admissionDate || D_A.admissionDateIssue(p.admissionDate)) return p;
          const admitDol = Math.max(1, Number(p.weights?.[0]?.dol) || 1);
          return { ...p, dob: D_A.addDaysToDateStr(p.admissionDate, -(admitDol - 1)) };
        });
        setPatients(withDob.length > 0 ? withDob : []);
        setActiveId((prev) => data.patients.some((p) => p.sessionId === prev) ? prev : null);
      }
      if (data.log) setLog(D_A.normalizeLogMap(data.log));
      unknownWriteRef.current = false;
      appliedSeqRef.current = seq;
      syncFailsRef.current = 0;
      setSyncError("");
      setSyncState("ok");
      setLastSync(/* @__PURE__ */ new Date());
    }).catch((err) => {
      if (stale()) return;
      settle();
      console.warn("GAS sync failed:", err);
      failed(err && err.kind ? err.message : "");
    });
  }, [flagPasswordChangeRequired]);
  syncRef.current = syncFromGAS;
  React.useEffect(() => {
    if (user) syncFromGAS();
  }, [user?.email]);
  const today = D_A.useTodayLocal();
  const lastSyncRef = React.useRef(0);
  React.useEffect(() => {
    if (lastSync) lastSyncRef.current = lastSync.getTime();
  }, [lastSync]);
  React.useEffect(() => {
    if (!GAS_ON || !user) return;
    const RESYNC_AFTER_MS = 6e4;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (syncInFlight()) return;
      if (syncBackingOff()) return;
      if (Date.now() - lastSyncRef.current < RESYNC_AFTER_MS) return;
      syncFromGAS();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [user?.email, syncFromGAS, syncInFlight]);
  React.useEffect(() => {
    if (!GAS_ON || !user) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (syncInFlight()) return;
      if (syncBackingOff()) return;
      if (Date.now() - lastSyncRef.current < D_A.SYNC_POLL_MS) return;
      syncFromGAS();
    };
    const t = setInterval(tick, 3e4);
    return () => clearInterval(t);
  }, [user?.email, syncFromGAS, syncInFlight]);
  React.useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const t = setInterval(() => setStaleTick((n) => n + 1), 3e4);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(t);
    };
  }, []);
  const freshness = React.useMemo(
    () => D_A.syncFreshness({
      gasOn: GAS_ON,
      online,
      syncState,
      lastSyncMs: lastSync ? lastSync.getTime() : null,
      nowMs: Date.now()
    }),
    [online, syncState, lastSync, staleTick]
  );
  const firstDayRef = React.useRef(true);
  React.useEffect(() => {
    if (firstDayRef.current) {
      firstDayRef.current = false;
      return;
    }
    if (GAS_ON && user && !syncBackingOff()) syncFromGAS();
  }, [today]);
  const shellReadyRef = React.useRef(false);
  React.useEffect(() => {
    const open = () => {
      if (shellReadyRef.current) setPickerOpen(true);
    };
    document.addEventListener("__open_picker", open);
    return () => document.removeEventListener("__open_picker", open);
  }, []);
  const [pendingOpen, setPendingOpen] = React.useState(null);
  React.useEffect(() => {
    document.documentElement.style.setProperty("--brand", `oklch(38.5% 0.047 170)`);
  }, []);
  const gasPost = React.useCallback(async (payload, { quiet = false } = {}) => {
    if (!GAS_ON) return { ok: true };
    const toast = (msg) => {
      if (!quiet) showToast(msg, "error");
    };
    let data;
    try {
      data = await gasRequest({ ...payload, token: userRef.current?.token });
    } catch (e) {
      if (endedRef.current) return { ok: false, ended: true, error: "" };
      console.warn("GAS POST failed:", e);
      const kind = e && e.kind || "network";
      if (kind === "offline") {
        const error2 = `บันทึกไม่สำเร็จ — ${gasErrorText("offline")}`;
        toast(error2);
        return { ok: false, offline: true, networkError: true, error: error2 };
      }
      const error = `ไม่ทราบผลการบันทึก — ${gasErrorText(kind)} · กำลังซิงก์ตรวจสอบกับเซิร์ฟเวอร์ก่อนให้บันทึกซ้ำ`;
      toast(error);
      return { ok: false, unknown: true, networkError: kind === "network", timeout: kind === "timeout", error };
    }
    if (endedRef.current) return { ok: false, ended: true, error: "" };
    if (data.error === "Unauthorized") {
      const reason = unauthorizedReason(data);
      if (!quiet) showToast(SESSION_NOTICES[reason].title, "error");
      endSessionRef.current(reason);
      return { ok: false, unauthorized: true, error: SESSION_NOTICES[reason].title };
    }
    if (data.error === "PasswordChangeRequired") {
      flagPasswordChangeRequired();
      return { ok: false, mustChangePassword: true };
    }
    if (data.conflict) return { ok: false, conflict: true, current: data.current };
    if (data.error) {
      const error = data.code === "SchemaMismatch" ? String(data.error) : `บันทึกไม่สำเร็จ: ${data.error}`;
      toast(error);
      return {
        ok: false,
        refused: true,
        error,
        code: data.code || "",
        retryable: !!data.retryable,
        ...data.entryId ? { entryId: data.entryId } : {}
      };
    }
    return { ok: true, ...data };
  }, [flagPasswordChangeRequired]);
  const writeGAS = (payload, opts) => {
    const end = beginWrite();
    return gasPost(payload, opts).then((res) => {
      end(res);
      return res;
    });
  };
  const blockedByUnknownWrite = (quiet = false) => {
    if (!GAS_ON || !unknownWriteRef.current) return null;
    const error = "ยังไม่ทราบผลการบันทึกครั้งก่อน — กำลังซิงก์ตรวจสอบกับเซิร์ฟเวอร์ รอสักครู่แล้วลองใหม่";
    if (!quiet) showToast(error, "error");
    if (pendingWritesRef.current === 0 && !syncInFlight()) syncFromGAS();
    return { ok: false, blocked: true, error };
  };
  const handleLogToGAS = (entry) => {
    const id = active.sessionId;
    const ts = entry.ts || D_A.todayLocal();
    const blocked = blockedByUnknownWrite();
    if (blocked) return Promise.resolve(blocked);
    const seqAtSave = syncSeqRef.current;
    const tempId = "tmp_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const who = user?.email || "";
    setLog((prev) => ({ ...prev, [id]: D_A.normalizeLogEntries(
      [...prev[id] || [], { ...entry, ts, entryId: tempId, lastModified: ts, submittedBy: who, lastModifiedBy: who }]
    ) }));
    const reconcile = (res) => {
      if (res.ok) {
        setLog((prev) => ({ ...prev, [id]: (prev[id] || []).map((e) => e.entryId === tempId ? { ...e, entryId: res.entryId, lastModified: res.lastModified } : e) }));
        showToast(`Logged DOL ${entry.dol} · ${entry.status === "submitted" ? "Submitted" : "Draft saved"}`);
      } else if (res.unknown) {
      } else {
        setLog((prev) => ({ ...prev, [id]: (prev[id] || []).filter((e) => e.entryId !== tempId) }));
        if (isDuplicateDate(res)) {
          setPendingOpen({
            sessionId: id,
            entryId: res.entryId || "",
            date: D_A.normalizeDateStr(ts),
            afterSeq: seqAtSave
          });
        }
      }
      return res;
    };
    if (!GAS_ON) return Promise.resolve(reconcile({ ok: true, entryId: "local_" + tempId, lastModified: ts }));
    return writeGAS({ action: "logDailyNutrition", sessionId: id, entry: { ...entry, ts } }).then(reconcile);
  };
  const handleUpdateToGAS = (entryId, expectedLastModified, entry) => {
    const id = active.sessionId;
    const ts = entry.ts || D_A.todayLocal();
    const who = user?.email || "";
    const blocked = blockedByUnknownWrite();
    if (blocked) return Promise.resolve(blocked);
    const apply = (res) => {
      if (res.ok && res.revised) {
        setLog((prev) => ({ ...prev, [id]: D_A.normalizeLogEntries([
          ...(prev[id] || []).map((e) => e.entryId === entryId ? { ...e, supersededAt: res.lastModified } : e),
          {
            ...entry,
            ts,
            entryId: res.entryId,
            lastModified: res.lastModified,
            lastModifiedBy: who,
            submittedBy: who,
            published: "",
            publishedBy: "",
            revisionNumber: res.revisionNumber,
            revisionOf: entryId,
            supersededAt: ""
          }
        ]) }));
        showToast(`สร้างฉบับแก้ไขใหม่สำหรับ DOL ${entry.dol}`);
      } else if (res.ok) {
        setLog((prev) => ({ ...prev, [id]: (prev[id] || []).map((e) => e.entryId === entryId ? { ...e, ...entry, ts, lastModified: res.lastModified, lastModifiedBy: who } : e) }));
        showToast(`อัปเดต DOL ${entry.dol} แล้ว`);
      }
      return res;
    };
    if (!GAS_ON) return Promise.resolve(apply({ ok: true, lastModified: (/* @__PURE__ */ new Date()).toISOString() }));
    return writeGAS({ action: "updateDailyNutrition", sessionId: id, entryId, expectedLastModified, entry: { ...entry, ts } }).then(apply);
  };
  const handlePublishToGAS = (entryId, expectedLastModified) => {
    const id = active.sessionId;
    const who = user?.email || "";
    const blocked = blockedByUnknownWrite();
    if (blocked) return Promise.resolve(blocked);
    const apply = (res) => {
      if (res.ok && res.alreadyPublished) {
        showToast("รายการนี้ส่งไปแล้วก่อนหน้านี้");
      } else if (res.ok) {
        setLog((prev) => ({ ...prev, [id]: (prev[id] || []).map((e) => e.entryId === entryId ? { ...e, published: res.publishedAt, publishedBy: who } : e) }));
        showToast(`ส่งรายการเพื่อตรวจทานแล้ว`);
      }
      return res;
    };
    if (!GAS_ON) return Promise.resolve(apply({ ok: true, publishedAt: (/* @__PURE__ */ new Date()).toISOString() }));
    return writeGAS({ action: "publishLog", sessionId: id, entryId, expectedLastModified }).then(apply);
  };
  const handleDeleteEntry = (entry) => {
    const id = active.sessionId;
    const blocked = blockedByUnknownWrite();
    if (blocked) return Promise.resolve(blocked);
    const prevEntries = log[id] || [];
    setLog((prev) => ({ ...prev, [id]: (prev[id] || []).filter((e) => e.entryId !== entry.entryId) }));
    if (!GAS_ON) {
      showToast(`ลบบันทึก DOL ${entry.dol} แล้ว`);
      return Promise.resolve({ ok: true });
    }
    return writeGAS({ action: "deleteDailyNutrition", sessionId: id, entryId: entry.entryId }).then((res) => {
      if (res.ok) showToast(`ลบบันทึก DOL ${entry.dol} แล้ว`);
      else if (!res.unknown) setLog((prev) => ({ ...prev, [id]: prevEntries }));
      return res;
    });
  };
  const handleDeletePatient = (patient) => {
    const id = patient.sessionId;
    const blocked = blockedByUnknownWrite();
    if (blocked) return Promise.resolve(blocked);
    const prevPatients = patients;
    const prevLog = log;
    const wasActive = activeId === id;
    setPatients((prev) => prev.filter((p) => p.sessionId !== id));
    setLog((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (wasActive) {
      setActiveId(null);
      goTo("registry");
    }
    if (!GAS_ON) {
      showToast(`ลบ session ${patient.name || id} แล้ว`);
      return Promise.resolve({ ok: true });
    }
    return writeGAS({ action: "deletePatient", sessionId: id }).then((res) => {
      if (res.ok) {
        serverPatientsRef.current.delete(id);
        showToast(`ลบ session ${patient.name || id} ถาวรแล้ว`);
      } else if (!res.unknown) {
        setPatients(prevPatients);
        setLog(prevLog);
        if (wasActive) setActiveId(id);
      }
      return res;
    });
  };
  const mergeBaseFor = React.useCallback(
    (sessionId) => serverPatientsRef.current.get(sessionId) ?? null,
    []
  );
  const bedConflict = (p) => {
    const holder = D_A.bedBlocker(patients, p);
    if (!holder) return null;
    return `เตียง ${D_A.normalizeBed(p.currentBed)} มี ${holder.name || holder.sessionId} อยู่แล้ว — ย้ายผู้ป่วยรายนั้นออกก่อน`;
  };
  const handleAddPatient = (p) => {
    const clash = bedConflict(p);
    if (clash) return Promise.resolve({ ok: false, refused: true, error: clash });
    const blocked = blockedByUnknownWrite(true);
    if (blocked) return Promise.resolve(blocked);
    setPatients((prev) => [p, ...prev]);
    setActiveId(p.sessionId);
    if (!GAS_ON) {
      showToast(`Session ${p.sessionId} registered (local)`);
      return Promise.resolve({ ok: true });
    }
    const rollback = () => {
      setPatients((prev) => prev.filter((x) => x !== p));
      setActiveId((prev) => prev === p.sessionId ? null : prev);
    };
    const settle = (res) => {
      if (res.ok) {
        serverPatientsRef.current.set(p.sessionId, p);
        showToast(`Session ${p.sessionId} registered → GAS`);
      } else if (!res.unknown) {
        rollback();
      }
      return res;
    };
    return writeGAS({ action: "registerPatient", patient: p, isNew: true }, { quiet: true }).then((res) => {
      if (res.needsConfirm) {
        const yes = typeof window !== "undefined" && typeof window.confirm === "function" && window.confirm(`${res.error}

ยืนยันเขียนทับข้อมูลเดิมหรือไม่?`);
        if (!yes) {
          rollback();
          return { ok: false, refused: true, error: "ยกเลิก — ไม่ได้เขียนทับข้อมูลเดิม" };
        }
        return writeGAS({ action: "registerPatient", patient: p, isNew: true, confirmOverwrite: true }, { quiet: true }).then(settle);
      }
      return settle(res);
    });
  };
  const handleEditPatient = (p, openedFromBase) => {
    const clash = bedConflict(p);
    if (clash) return Promise.resolve({ ok: false, refused: true, error: clash });
    const blocked = blockedByUnknownWrite(true);
    if (blocked) return Promise.resolve(blocked);
    const previous = patients.find((x) => x.sessionId === p.sessionId);
    const base = openedFromBase !== void 0 ? openedFromBase : serverPatientsRef.current.get(p.sessionId);
    setPatients((prev) => prev.map((x) => x.sessionId === p.sessionId ? p : x));
    if (!GAS_ON) {
      showToast(`${p.name || p.sessionId} อัปเดตแล้ว`);
      return Promise.resolve({ ok: true });
    }
    return writeGAS({ action: "registerPatient", patient: p, ...base ? { base } : {} }, { quiet: true }).then((res) => {
      if (res.ok) {
        serverPatientsRef.current.set(p.sessionId, p);
        showToast(`${p.name || p.sessionId} อัปเดตแล้ว`);
      } else if (!res.unknown && previous) {
        setPatients((prev) => prev.map((x) => x === p ? previous : x));
      }
      return res;
    });
  };
  const startAddToday = (dateStr) => {
    const targetDate = dateStr || D_A.todayLocal();
    const existing = (log[activeId] || []).find((e) => D_A.normalizeDateStr(e.ts) === targetDate && e.entryId && !String(e.entryId).startsWith("tmp_"));
    if (existing) {
      showToast(`มีบันทึกของวันที่ ${fmtDate(targetDate)} อยู่แล้ว — เปิดให้แก้ไขรายการเดิม`);
      startEditEntry(existing);
      return;
    }
    setEditEntry(null);
    setLogDate(dateStr && dateStr !== D_A.todayLocal() ? dateStr : null);
    setView("calculator");
  };
  const startEditEntry = (entry) => {
    setEditEntry(entry);
    setLogDate(null);
    setView("calculator");
  };
  React.useEffect(() => {
    if (!pendingOpen || !lastSync || appliedSeqRef.current <= pendingOpen.afterSeq) return;
    const want = pendingOpen;
    setPendingOpen(null);
    const entries = log[want.sessionId] || [];
    const real = (e) => e.entryId && !String(e.entryId).startsWith("tmp_");
    const hit = want.entryId && entries.find((e) => e.entryId === want.entryId) || entries.find((e) => real(e) && D_A.normalizeDateStr(e.ts) === want.date);
    if (!hit) return;
    if (view === "calculator" && activeId === want.sessionId && !editEntry) {
      showToast(`มีบันทึกของวันที่ ${fmtDate(want.date)} อยู่แล้ว — เปิดรายการเดิมให้แก้ไข`);
      startEditEntry(hit);
    }
  }, [lastSync]);
  const handleWeightUpdate = (sessionId, weights) => {
    if (blockedByUnknownWrite()) return false;
    const rec0 = patients.find((p) => p.sessionId === sessionId);
    const previousWeights = rec0?.weights || [];
    const derivedDob = rec0?.dob || "";
    const baseRecord = serverPatientsRef.current.get(sessionId);
    setPatients((prev) => prev.map(
      (p) => p.sessionId === sessionId ? { ...p, weights } : p
    ));
    const remember = () => {
      const rec = serverPatientsRef.current.get(sessionId);
      if (rec) serverPatientsRef.current.set(sessionId, { ...rec, weights });
    };
    if (GAS_ON) {
      writeGAS({
        action: "updateWeights",
        sessionId,
        weights,
        ...derivedDob ? { dob: derivedDob } : {},
        ...baseRecord ? { baseWeights: baseRecord.weights || [] } : {}
      }).then((res) => {
        if (res.ok) {
          remember();
          return;
        }
        if (res.unknown) return;
        setPatients((prev) => prev.map(
          (p) => p.sessionId === sessionId && p.weights === weights ? { ...p, weights: previousWeights } : p
        ));
      });
    }
  };
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const [showChangePwd, setShowChangePwd] = React.useState(false);
  const [editingPatient, setEditingPatient] = React.useState(null);
  const handleLogout = () => endSession("manual");
  shellReadyRef.current = false;
  if (!user) {
    return /* @__PURE__ */ React.createElement(LoginScreen, { notice, onLogin: (u) => {
      writeSession(u);
      if (onNoticeSeen) onNoticeSeen();
      setUser(u);
    } });
  }
  if (user.mustChangePassword) {
    return /* @__PURE__ */ React.createElement(
      ChangePasswordModal,
      {
        forced: true,
        onLogout: handleLogout,
        onSave: async (oldPwd, newPwd) => {
          const res = await gasPost({ action: "changePassword", oldPassword: oldPwd, newPassword: newPwd }, { quiet: true });
          if (res.ok) {
            const updated = { ...user, token: res.token || user.token, mustChangePassword: false };
            writeSession(updated);
            setUser(updated);
            showToast("ตั้งรหัสผ่านใหม่สำเร็จ");
          }
          return res;
        }
      }
    );
  }
  if (GAS_ON && syncState !== "ok" && !lastSync) {
    return /* @__PURE__ */ React.createElement(SyncGate, { online, failed: syncState === "error", detail: syncError, onRetry: () => syncFromGAS() });
  }
  shellReadyRef.current = true;
  const showQuickFab = view === "registry";
  return /* @__PURE__ */ React.createElement("div", { className: showQuickFab ? "app has-quick-fab" : "app" }, /* @__PURE__ */ React.createElement("div", { className: "topbar" }, /* @__PURE__ */ React.createElement("div", { className: "brandmark" }, /* @__PURE__ */ React.createElement(NeoFeedWordmark, null)), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "switch-patient",
      onClick: () => setPickerOpen(true)
    },
    /* @__PURE__ */ React.createElement("span", { className: "sp-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 13, color: "var(--ink-2)" })),
    /* @__PURE__ */ React.createElement("span", { className: "sp-label" }, "Switch patient")
  ), /* @__PURE__ */ React.createElement("div", { className: "spacer" }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { className: "pill", title: !GAS_ON ? "GAS_URL not configured" : syncState === "error" && syncError ? `Sync error · ${syncError}` : syncMsRef.current == null ? "Google Apps Script" : `Google Apps Script · ซิงก์ล่าสุดใช้เวลา ${D_A.displayNum(syncMsRef.current / 1e3, 1)} วินาที` }, syncState === "loading" ? /* @__PURE__ */ React.createElement("span", { className: "dot dot-spin", style: { width: 7, height: 7 } }) : /* @__PURE__ */ React.createElement("span", { className: "dot", style: { background: syncState === "ok" ? "var(--ok)" : syncState === "error" ? "var(--crit)" : "var(--line)" } }), syncState === "loading" ? "Syncing…" : syncState === "ok" ? `GAS · ${lastSync ? lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}` : syncState === "error" ? "Sync error" : "Local only"), GAS_ON && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "icon-btn",
      title: "Sync now from GAS",
      onClick: () => syncFromGAS(),
      style: { opacity: syncState === "loading" ? 0.4 : 1, pointerEvents: syncState === "loading" ? "none" : "auto" }
    },
    /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 16 16", width: "13", height: "13", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" }), /* @__PURE__ */ React.createElement("polyline", { points: "14,2 14,5 11,5" }))
  )), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement("div", { className: "user", onClick: () => setShowUserMenu((m) => !m), style: { cursor: "pointer" }, title: "เมนูผู้ใช้" }, /* @__PURE__ */ React.createElement("div", { className: "av" }, firstChar(authName || user?.email || "?")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "name" }, authName || user?.email || "—"), /* @__PURE__ */ React.createElement("div", { className: "role" }, role === "admin" ? "Administrator · KCMH" : "Neonatology · KCMH"))), showUserMenu && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 4px 16px #0002", minWidth: 170, zIndex: 999, overflow: "hidden" } }, user?.authMethod !== "google" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn",
      style: { width: "100%", justifyContent: "flex-start", borderRadius: 0, padding: "10px 14px", fontSize: 13 },
      onClick: () => {
        setShowChangePwd(true);
        setShowUserMenu(false);
      }
    },
    "🔑 เปลี่ยนรหัสผ่าน"
  ), /* @__PURE__ */ React.createElement("div", { style: { height: 1, background: "var(--line)" } })), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn",
      style: { width: "100%", justifyContent: "flex-start", borderRadius: 0, padding: "10px 14px", fontSize: 13, color: "var(--crit-ink)" },
      onClick: () => {
        setShowUserMenu(false);
        handleLogout();
      }
    },
    "ออกจากระบบ"
  )))), (freshness.level === "offline" || freshness.level === "stale") && (() => {
    const crit = freshness.level === "offline";
    const mins = freshness.ageMs == null ? null : Math.floor(freshness.ageMs / 6e4);
    const age = mins == null ? "ยังไม่เคยซิงก์" : mins < 1 ? "ไม่ถึง 1 นาที" : `${mins} นาที`;
    const line = crit ? "var(--crit-line)" : "var(--warn-line)";
    return /* @__PURE__ */ React.createElement("div", { role: "status", "aria-live": "polite", style: {
      display: "flex",
      alignItems: "center",
      gap: "8px 12px",
      flexWrap: "wrap",
      padding: "8px 14px",
      fontSize: 12.5,
      lineHeight: 1.45,
      background: crit ? "var(--crit-bg)" : "var(--warn-bg)",
      color: crit ? "var(--crit)" : "var(--warn)",
      borderBottom: `1px solid ${line}`
    } }, /* @__PURE__ */ React.createElement("span", { style: {
      width: 7,
      height: 7,
      borderRadius: "50%",
      flex: "0 0 auto",
      background: crit ? "var(--crit)" : "var(--warn)"
    } }), /* @__PURE__ */ React.createElement("div", { style: {
      flex: "1 1 260px",
      minWidth: 0,
      display: "flex",
      alignItems: "baseline",
      gap: "0 8px",
      flexWrap: "wrap"
    } }, /* @__PURE__ */ React.createElement("strong", { style: { fontWeight: 600 } }, crit ? "ออฟไลน์ — ไม่ได้เชื่อมต่อเครือข่าย" : "ข้อมูลไม่เป็นปัจจุบัน"), /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.95 } }, crit ? `ตัวเลขที่แสดงคือข้อมูลล่าสุดเมื่อ ${age} ที่แล้ว และการบันทึกจะยังไม่ถูกส่งขึ้นเซิร์ฟเวอร์ — ตรวจสอบกับแฟ้มผู้ป่วยก่อนใช้สั่งการรักษา` : `ซิงก์ล่าสุดเมื่อ ${age} ที่แล้ว — กด Sync ก่อนใช้ตัวเลขนี้`)), GAS_ON && online && // className="btn", so the shell's own sizing applies: 40px on a
    // desktop, and 44px under the (hover:none)(pointer:coarse) block
    // that covers every touch device. Height is deliberately NOT set
    // inline — an inline min-height would outrank that media query
    // and shrink the target back on exactly the devices it is for.
    /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn sync-banner-btn",
        onClick: () => syncFromGAS(),
        disabled: syncState === "loading",
        style: {
          padding: "0 14px",
          justifyContent: "center",
          gap: 6,
          background: "transparent",
          color: "inherit",
          fontSize: 12.5,
          fontWeight: 600,
          border: `1px solid ${line}`,
          borderRadius: 6,
          cursor: syncState === "loading" ? "default" : "pointer",
          opacity: syncState === "loading" ? 0.55 : 1
        }
      },
      syncState === "loading" ? /* @__PURE__ */ React.createElement("span", { className: "dot dot-spin", style: { width: 7, height: 7 } }) : null,
      syncState === "loading" ? "กำลังซิงก์…" : "Sync now"
    ));
  })(), /* @__PURE__ */ React.createElement("nav", { className: "rail" }, /* @__PURE__ */ React.createElement("div", { className: "rail-section" }, "Workspace"), /* @__PURE__ */ React.createElement(RailItem, { icon: "users", label: "Patients", active: view === "registry", count: patients.length, onClick: () => goTo("registry") }), /* @__PURE__ */ React.createElement(RailItem, { icon: "log", label: "Dashboard", active: view === "log", count: (log[activeId] || []).length, onClick: () => goTo("log") }), (role === "doctor" || role === "nurse") && /* @__PURE__ */ React.createElement(RailItem, { icon: "calc", label: "Calculator", active: view === "calculator", onClick: () => goTo("calculator") }), /* @__PURE__ */ React.createElement(RailItem, { icon: "chart", label: "Growth chart", active: view === "fenton", onClick: () => goTo("fenton") }), /* @__PURE__ */ React.createElement(RailItem, { icon: "bell", label: "Alerts", active: view === "alerts", count: alertCount || null, crit: alertCount > 0, onClick: () => goTo("alerts") }), role === "admin" && /* @__PURE__ */ React.createElement(RailItem, { icon: "chart", label: "Admin dashboard", active: view === "admin", onClick: () => goTo("admin") }), /* @__PURE__ */ React.createElement("div", { className: "rail-section" }, "Reference"), /* @__PURE__ */ React.createElement(RailItem, { icon: "info", label: "Guidelines (ESPGHAN)", active: view === "guidelines", onClick: () => goTo("guidelines") }), /* @__PURE__ */ React.createElement("div", { className: "rail-item", style: { opacity: 0.45, cursor: "default", pointerEvents: "none" } }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 15 }), /* @__PURE__ */ React.createElement("span", null, "Drug compatibility"), /* @__PURE__ */ React.createElement("span", { className: "count", style: { marginLeft: "auto", fontSize: 10 } }, "soon")), /* @__PURE__ */ React.createElement(RailItem, { icon: "info", label: "Formulas + products", active: view === "formulas", onClick: () => goTo("formulas") }), /* @__PURE__ */ React.createElement("div", { className: "rail-foot" }, /* @__PURE__ */ React.createElement("div", { className: "conn" }, /* @__PURE__ */ React.createElement("span", { className: "dot", style: { background: freshness.level === "ok" ? "var(--ok)" : freshness.level === "local" ? "var(--line)" : freshness.level === "warn" ? "var(--warn)" : "var(--crit)" } }), !GAS_ON ? "Local only" : lastSync ? `Sync · ${lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not synced"), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 4 } }, "V2.0 · ESPGHAN 2018/2022"))), /* @__PURE__ */ React.createElement("main", { className: "work" }, /* @__PURE__ */ React.createElement("div", { className: "work-inner" }, /* @__PURE__ */ React.createElement(ViewErrorBoundary, { variant: "view", resetKey: `${view}|${activeId || ""}`, onGoRegistry: () => goTo("registry") }, GAS_ON && syncState === "ok" && patients.length === 0 && /* @__PURE__ */ React.createElement("div", { style: {
    padding: "12px 16px",
    background: "var(--brand-bg)",
    border: "1px solid var(--brand-line)",
    borderRadius: 8,
    marginBottom: 14,
    fontSize: 13,
    color: "var(--brand-2)",
    display: "flex",
    alignItems: "center",
    gap: 10
  } }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 14, color: "var(--brand)" }), "ยังไม่มีผู้ป่วยในระบบ — ไปที่ ", /* @__PURE__ */ React.createElement("strong", null, "Patients"), " เพื่อลงทะเบียนผู้ป่วยใหม่"), PATIENT_VIEWS.includes(view) && active && /* @__PURE__ */ React.createElement(PatientStrip, { patient: active, entries: log[activeId] || [], onSwitch: () => setPickerOpen(true), liveWeight: calcWeights[activeId] || null, currentDol: dol, onEdit: () => setEditingPatient(active) }), editingPatient && /* @__PURE__ */ React.createElement(
    EditPatientModal,
    {
      patient: editingPatient,
      patients,
      onClose: () => setEditingPatient(null),
      onSubmit: handleEditPatient,
      mergeBaseFor,
      onDelete: role === "admin" ? handleDeletePatient : void 0
    }
  ), view === "registry" && /* @__PURE__ */ React.createElement(PatientRegistry, { patients, activeId, role, log, ward, onWardChange: setWard, onSelect: (id) => {
    setEditEntry(null);
    setActiveId(id);
    setView("log");
  }, onAdd: handleAddPatient, onEdit: handleEditPatient, mergeBaseFor, onDelete: role === "admin" ? handleDeletePatient : void 0 }), view === "admin" && role === "admin" && /* @__PURE__ */ React.createElement(
    AdminDashboard,
    {
      patients,
      log,
      lastSync,
      includeArchived,
      onToggleArchived: () => {
        includeArchivedRef.current = !includeArchived;
        setIncludeArchived((v) => !v);
        syncFromGAS();
      }
    }
  ), PATIENT_VIEWS.includes(view) && !active && (view !== "calculator" || role === "doctor" || role === "nurse") && /* @__PURE__ */ React.createElement(NoPatientCard, { onPick: () => setPickerOpen(true) }), view === "calculator" && active && /* @__PURE__ */ React.createElement(
    CalculatorView,
    {
      active,
      dol,
      editEntry,
      logDate,
      log,
      activeId,
      token: user?.token,
      role,
      userLabel: user?.name ? `${user.name}${user.email ? ` (${user.email})` : ""}` : user?.email || "",
      userEmail: user?.email || "",
      handleLogToGAS,
      handleUpdateToGAS,
      handlePublishToGAS,
      handleDeleteEntry,
      goTo,
      setCalcWeights
    }
  ), view === "fenton" && active && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Fenton 2025 growth chart"), /* @__PURE__ */ React.createElement("div", { className: "sub" }, "Plot weight, length, and HC by post-menstrual age · Fenton TR et al. 2025 (PMID 40534585)"))), /* @__PURE__ */ React.createElement(FentonChart, { patient: active, entries: log[activeId] || [], currentDol: dol, onUpdate: (weights) => handleWeightUpdate(active.sessionId, weights) })), view === "log" && active && /* @__PURE__ */ React.createElement(
    DailyLog,
    {
      patient: active,
      log,
      dol,
      onAddToday: startAddToday,
      onEditEntry: startEditEntry,
      onDeleteEntry: role === "admin" ? handleDeleteEntry : void 0
    }
  ), view === "alerts" && active && /* @__PURE__ */ React.createElement(AlertCenter, { patient: active, log, onAckChange: () => setAckVersion((v) => v + 1) }), view === "quickcalc" && /* @__PURE__ */ React.createElement(QuickCalcView, { onBack: () => goTo("registry") }), view === "guidelines" && /* @__PURE__ */ React.createElement(GuidelinesPanel, null), view === "formulas" && /* @__PURE__ */ React.createElement(FormulasPanel, null)))), pickerOpen && /* @__PURE__ */ React.createElement(PatientPicker, { patients, activeId, onSelect: setActiveId, onClose: () => setPickerOpen(false) }), showChangePwd && /* @__PURE__ */ React.createElement(
    ChangePasswordModal,
    {
      onClose: () => setShowChangePwd(false),
      onSave: async (oldPwd, newPwd) => {
        const res = await gasPost({ action: "changePassword", oldPassword: oldPwd, newPassword: newPwd }, { quiet: true });
        if (res.ok) {
          if (res.token) {
            const updated = { ...user, token: res.token };
            writeSession(updated);
            setUser(updated);
          }
          showToast("เปลี่ยนรหัสผ่านสำเร็จ");
          setShowChangePwd(false);
        }
        return res;
      }
    }
  ), showQuickFab && /* @__PURE__ */ React.createElement(QuickCalcFab, { onClick: () => goTo("quickcalc") }), /* @__PURE__ */ React.createElement(
    BottomNav,
    {
      view,
      setView: goTo,
      alertCount,
      logCount: (log[activeId] || []).length,
      role
    }
  ));
}
const LOG_LOCK_HEARTBEAT_MS = 45e3;
function useDailyLogLock(sessionId, dateStr, token) {
  const [holder, setHolder] = React.useState(null);
  React.useEffect(() => {
    if (!GAS_ON || !sessionId || !dateStr || !token) {
      setHolder(null);
      return;
    }
    let cancelled = false;
    const call = (action) => gasRequest({ action, sessionId, date: dateStr, token }).catch(() => null);
    const touch = () => call("acquireLogLock").then((data) => {
      if (cancelled || !data) return;
      setHolder(data.locked ? data.holder || null : null);
    });
    touch();
    const iv = setInterval(touch, LOG_LOCK_HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
      call("releaseLogLock");
    };
  }, [sessionId, dateStr, token]);
  return holder;
}
function CalculatorView({
  active,
  dol,
  editEntry,
  logDate,
  log,
  activeId,
  token,
  role,
  userLabel,
  userEmail,
  handleLogToGAS,
  handleUpdateToGAS,
  handlePublishToGAS,
  handleDeleteEntry,
  goTo,
  setCalcWeights
}) {
  const displayDol = editEntry ? D_A.entryDol(active, editEntry) : logDate ? D_A.dolAtDate(active, logDate) : dol;
  const lockDate = editEntry ? editEntry.ts : logDate || D_A.todayLocal();
  const previousEntry = previousLogEntry(log[activeId] || [], lockDate);
  const baselineEntry = !editEntry ? previousEntry : null;
  const holder = useDailyLogLock(active.sessionId, lockDate, token);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, editEntry && /* @__PURE__ */ React.createElement("button", { className: "login-alt-link", style: { padding: 0, marginBottom: 4 }, onClick: () => goTo("log") }, "← กลับไป Dashboard"), /* @__PURE__ */ React.createElement("h1", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, editEntry ? "แก้ไขบันทึกโภชนาการ" : "TPN + Enteral nutrition order", /* @__PURE__ */ React.createElement("span", { className: "chip brand", style: { fontSize: 13, fontWeight: 700 } }, "DOL ", displayDol)), /* @__PURE__ */ React.createElement("div", { className: "sub" }, "Real-time targets vs. ESPGHAN 2018 thresholds")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => {
    document.querySelector(".work-inner")?.setAttribute("data-date", (/* @__PURE__ */ new Date()).toLocaleDateString("th-TH"));
    document.dispatchEvent(new CustomEvent("__neofeed_print"));
  } }, /* @__PURE__ */ React.createElement(Icon, { name: "pdf", size: 14 }), " Print order"), /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => goTo("guidelines") }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 14 }), " Reference values"))), holder && /* @__PURE__ */ React.createElement("div", { style: {
    padding: "10px 12px",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-line)",
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 12.5,
    color: "var(--warn)",
    display: "flex",
    alignItems: "center",
    gap: 8
  } }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 13, color: "var(--warn)" }), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, holder.name || holder.email || "ผู้ใช้งานอื่น"), " กำลังเปิดบันทึกวันที่ ", fmtDate(lockDate), " ของผู้ป่วยนี้อยู่ — หากบันทึกพร้อมกัน ระบบจะแจ้งเตือนความขัดแย้งตอนบันทึกทับ")), /* @__PURE__ */ React.createElement(
    Calculator,
    {
      patient: active,
      dol: displayDol,
      editEntry,
      baselineEntry,
      previousEntry,
      logDate,
      userLabel,
      userEmail,
      onLog: handleLogToGAS,
      onUpdate: handleUpdateToGAS,
      onPublish: handlePublishToGAS,
      onSaved: () => goTo("log"),
      onDelete: role === "admin" ? (entry) => handleDeleteEntry(entry).then((res) => {
        if (res.ok) goTo("log");
        return res;
      }) : void 0,
      onWeightChange: (w) => setCalcWeights((prev) => ({ ...prev, [activeId]: w }))
    }
  ));
}
const SCRATCH_PATIENT = Object.freeze({
  sessionId: null,
  name: null,
  initials: null,
  // bw 0 switches off calculator.jsx's birth-weight floor: with no birth
  // weight on record, the weight typed here IS the dosing weight and there is
  // nothing to floor it against. The "TPN calc. weight" override still works.
  bw: 0,
  ga: 0,
  sex: "",
  currentBed: "",
  diagnosis: "",
  weights: [],
  lengths: [],
  hcs: []
});
const QUICK_DOL_MAX = 60;
function QuickCalcView({ onBack }) {
  const [dolText, setDolText] = React.useState("1");
  const dolValue = Math.min(QUICK_DOL_MAX, Math.max(1, parseInt(dolText, 10) || 1));
  const dol = dolValue;
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("button", { className: "login-alt-link", style: { padding: 0, marginBottom: 4 }, onClick: onBack }, "← กลับไป Ward"), /* @__PURE__ */ React.createElement("h1", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, "Calculator", /* @__PURE__ */ React.createElement("span", { className: "chip", style: {
    fontSize: 12,
    fontWeight: 700,
    background: "var(--warn-bg)",
    color: "var(--warn)",
    borderColor: "var(--warn-line)"
  } }, "ไม่บันทึก")), /* @__PURE__ */ React.createElement("div", { className: "sub" }, "ใส่น้ำหนักแล้วคำนวณได้เลย — ไม่ผูกกับผู้ป่วย ไม่เซฟลง Google Sheets")), /* @__PURE__ */ React.createElement("div", { className: "quick-dol" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "quick-dol-input" }, "DOL"), /* @__PURE__ */ React.createElement(
    "input",
    {
      id: "quick-dol-input",
      className: "num",
      type: "number",
      inputMode: "numeric",
      min: 1,
      max: QUICK_DOL_MAX,
      step: 1,
      value: dolText,
      onChange: (e) => {
        const raw = e.target.value;
        if (raw === "") {
          setDolText("");
          return;
        }
        const v = Math.round(Number(raw));
        if (!isFinite(v)) return;
        setDolText(String(Math.min(QUICK_DOL_MAX, Math.max(1, v))));
      },
      onBlur: () => setDolText(String(dolValue))
    }
  ))), /* @__PURE__ */ React.createElement(
    Calculator,
    {
      patient: SCRATCH_PATIENT,
      dol,
      scratch: true,
      editEntry: null,
      baselineEntry: null,
      previousEntry: null,
      logDate: null,
      userLabel: "",
      userEmail: ""
    }
  ));
}
function QuickCalcFab({ onClick }) {
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "quick-fab",
      onClick,
      "aria-label": "Calculator — ไม่บันทึก",
      title: "Calculator (ไม่บันทึก)"
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "calculator", size: 22, color: "#fff", stroke: 1.9 }),
    /* @__PURE__ */ React.createElement("span", { className: "quick-fab-label" }, "Calculator")
  );
}
const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function fmtDate(iso) {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), dd = Number(m[3]);
    const probe = new Date(Date.UTC(y, mo - 1, dd));
    if (mo >= 1 && mo <= 12 && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === dd) {
      return `${dd} ${THAI_MONTHS_SHORT[mo - 1]} ${y + 543}`;
    }
  }
  try {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const dd = d.getDate();
    const mo = THAI_MONTHS_SHORT[d.getMonth()];
    const yyyy = d.getFullYear() + 543;
    return `${dd} ${mo} ${yyyy}`;
  } catch {
    return iso;
  }
}
window.NEOFEED_FMT_DATE = fmtDate;
function fmtGA(ga) {
  return D_A.fmtGA(ga);
}
function RailItem({ icon, label, active, count, crit, onClick }) {
  return /* @__PURE__ */ React.createElement("div", { className: `rail-item ${active ? "active" : ""} ${crit ? "crit" : ""}`, onClick }, /* @__PURE__ */ React.createElement(Icon, { name: icon, size: 15 }), /* @__PURE__ */ React.createElement("span", null, label), count && /* @__PURE__ */ React.createElement("span", { className: "count" }, count));
}
function PatientStrip({ patient, entries, onSwitch, liveWeight, currentDol, onEdit }) {
  const ws = patient.weights || [];
  const last = D_A.lastWeighed(patient, entries) || ws[ws.length - 1] || null;
  const currentW = liveWeight ?? last?.w ?? patient.bw;
  const displayDol = currentDol ?? last?.dol ?? 1;
  const delta = currentW - patient.bw;
  const deltaPct = delta / patient.bw * 100;
  const [wtLabel, wtColor] = patient.bw < 1e3 ? ["ELBW", "var(--crit)"] : patient.bw < 1500 ? ["VLBW", "var(--warn)"] : ["LBW", "var(--ink-3)"];
  const deltaColor = deltaPct < -10 ? "var(--crit)" : deltaPct < 0 ? "var(--warn-ink)" : "var(--ok)";
  return /* @__PURE__ */ React.createElement("div", { className: "patient-strip" }, /* @__PURE__ */ React.createElement("div", { className: "lead" }, /* @__PURE__ */ React.createElement("div", { className: "lbl" }, "Active session"), /* @__PURE__ */ React.createElement("div", { className: "pid" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "id" }, patient.name || patient.initials || "—"), /* @__PURE__ */ React.createElement("div", { className: "bed" }, "Bed ", /* @__PURE__ */ React.createElement("span", { className: "num" }, patient.currentBed || (D_A.isParked(patient) ? "รอเตียง" : "—")), " · DOL ", /* @__PURE__ */ React.createElement("span", { className: "num", style: { color: "var(--brand-2)", fontWeight: 700 } }, displayDol)), /* @__PURE__ */ React.createElement("div", { className: "bed" }, "Admit ", fmtDate(patient.admissionDate)), onEdit && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm",
      style: { marginTop: 6, fontSize: 11 },
      onClick: onEdit
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "edit", size: 11 }),
    " Edit session"
  )))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "lbl" }, "GA at birth"), /* @__PURE__ */ React.createElement("div", { className: "val num", style: { color: "var(--brand-2)" } }, fmtGA(patient.ga), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-3)", marginLeft: 4 } }, "wk")), /* @__PURE__ */ React.createElement("div", { className: "sub" }, patient.sex === "boys" ? "Male" : patient.sex === "girls" ? "Female" : "—", patient.twinSuffix ? ` · Twin ${patient.twinSuffix}` : "")), /* @__PURE__ */ React.createElement("div", { style: { padding: 0, flexDirection: "row" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: "0 0 38%", padding: "10px 8px 10px 14px", display: "flex", flexDirection: "column" } }, /* @__PURE__ */ React.createElement("div", { className: "lbl" }, "Birth weight"), /* @__PURE__ */ React.createElement("div", { className: "val num" }, patient.bw.toLocaleString(), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-3)", marginLeft: 3 } }, "g")), /* @__PURE__ */ React.createElement("div", { className: "sub", style: { color: wtColor, fontWeight: 600 } }, wtLabel)), /* @__PURE__ */ React.createElement("div", { style: { width: 1, background: "var(--line-2)", alignSelf: "stretch" } }), /* @__PURE__ */ React.createElement("div", { style: { flex: "1 1 62%", padding: "10px 14px 10px 10px", display: "flex", flexDirection: "column" } }, /* @__PURE__ */ React.createElement("div", { className: "lbl" }, "Current weight"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 7, marginTop: 1, flexWrap: "nowrap" } }, /* @__PURE__ */ React.createElement("span", { className: "num", style: { fontFamily: "IBM Plex Mono,monospace", fontSize: 17, fontWeight: 500, letterSpacing: "-0.01em" } }, currentW.toLocaleString(), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-3)", marginLeft: 3 } }, "g")), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: deltaColor, fontWeight: 700, whiteSpace: "nowrap" } }, delta >= 0 ? "+" : "", delta, "g (", D_A.displayNum(deltaPct, 1), "%)")))), (() => {
    const caDays = D_A.correctedAge(patient.ga, displayDol);
    const caLabel = caDays >= 0 ? `CA ${Math.floor(caDays / 7)}+${caDays % 7} wk` : null;
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "lbl" }, "PMA"), /* @__PURE__ */ React.createElement("div", { className: "val num", style: { color: "var(--brand-2)" } }, fmtGA(D_A.pmaShort(patient.ga, displayDol)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-3)", marginLeft: 4 } }, "wk")), caLabel && /* @__PURE__ */ React.createElement("div", { className: "sub", style: { color: "var(--ok)", fontWeight: 600 } }, caLabel));
  })(), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "lbl" }, "Diagnosis"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { className: "val", style: { fontSize: 13, lineHeight: 1.3, fontWeight: 700 } }, patient.diagnosis), /* @__PURE__ */ React.createElement("span", { className: "chip" + (!patient.status || patient.status === "Active" ? " ok" : ""), style: { fontSize: 11 } }, /* @__PURE__ */ React.createElement("span", { className: "d" }), patient.status))));
}
function AlertCenter({ patient, log, onAckChange }) {
  const entries = log[patient.sessionId] || [];
  const alerts = computeAlerts(patient, entries);
  const ackKeyFor = (a) => ackKey(a.id, a.dol);
  const storageKey = `neofeed_acked_${patient.sessionId}`;
  const [acked, setAcked] = React.useState(() => readAckedMap(patient.sessionId));
  React.useEffect(() => {
    setAcked(readAckedMap(patient.sessionId));
  }, [storageKey]);
  const persistAcked = (next) => {
    setAcked(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
    }
    onAckChange && onAckChange();
  };
  const acknowledge = (a) => persistAcked({ ...acked, [ackKeyFor(a)]: (/* @__PURE__ */ new Date()).toISOString() });
  const acknowledgeAll = () => {
    const next = { ...acked };
    alerts.forEach((a) => {
      if (!next[ackKeyFor(a)]) next[ackKeyFor(a)] = (/* @__PURE__ */ new Date()).toISOString();
    });
    persistAcked(next);
  };
  const activeAlerts = alerts.filter((a) => !acked[ackKeyFor(a)]);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Alert center"), /* @__PURE__ */ React.createElement("div", { className: "sub" }, "Cross-cutting safety signals based on latest logged values · ", /* @__PURE__ */ React.createElement("span", null, patient.name || patient.initials || "—"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("button", { className: "btn", disabled: activeAlerts.length === 0, onClick: acknowledgeAll }, /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 14 }), " Acknowledge all"))), /* @__PURE__ */ React.createElement("div", { className: "alert-summary-tiles" }, /* @__PURE__ */ React.createElement("div", { className: "card", style: { padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06 } }, "Active critical"), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontSize: 32, fontWeight: 500, color: "var(--crit)" } }, activeAlerts.filter((a) => a.level === "crit").length)), /* @__PURE__ */ React.createElement("div", { className: "card", style: { padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06 } }, "Cautions"), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontSize: 32, fontWeight: 500, color: "var(--warn-ink)" } }, activeAlerts.filter((a) => a.level === "warn").length)), /* @__PURE__ */ React.createElement("div", { className: "card", style: { padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06 } }, "Info / reminders"), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontSize: 32, fontWeight: 500, color: "var(--brand)" } }, activeAlerts.filter((a) => a.level === "info").length))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "bell", size: 14, color: "var(--brand)" }), " Patient alerts", /* @__PURE__ */ React.createElement("span", { className: "h-meta" }, activeAlerts.length, " active · ", alerts.length, " total")), /* @__PURE__ */ React.createElement("div", { className: "card-b", style: { display: "flex", flexDirection: "column", gap: 8 } }, alerts.slice().sort((a, b) => (acked[ackKeyFor(a)] ? 1 : 0) - (acked[ackKeyFor(b)] ? 1 : 0)).map((a, i) => {
    const ackedAt = acked[ackKeyFor(a)];
    return /* @__PURE__ */ React.createElement("div", { key: ackKeyFor(a), className: `alert-row ${a.level}`, style: ackedAt ? { opacity: 0.5 } : void 0 }, /* @__PURE__ */ React.createElement("div", { className: "ico" }, a.level === "crit" ? "!" : a.level === "warn" ? "!" : "i"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("span", { className: "title" }, a.title), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-3)" }, className: "mono" }, "DOL ", a.dol)), /* @__PURE__ */ React.createElement("div", { className: "body" }, a.body), /* @__PURE__ */ React.createElement("div", { className: "meta" }, "Ref: ", a.ref)), ackedAt ? /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" } }, /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 12, color: "var(--ok)" }), " Acknowledged") : /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => acknowledge(a) }, "Acknowledge"));
  }))));
}
const MIN_PASSWORD_LENGTH = 10;
function ChangePasswordModal({ onClose, onSave, forced, onLogout }) {
  const [oldPwd, setOldPwd] = React.useState("");
  const [newPwd, setNewPwd] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const busyRef = React.useRef(false);
  const handleSubmit = async () => {
    if (loading || busyRef.current) return;
    if (!oldPwd || !newPwd) return setErr("กรุณากรอกข้อมูลให้ครบ");
    if (newPwd.length < MIN_PASSWORD_LENGTH) return setErr(`รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
    if (newPwd !== confirm) return setErr("รหัสผ่านใหม่ไม่ตรงกัน");
    setErr("");
    setLoading(true);
    busyRef.current = true;
    let res;
    try {
      res = await onSave(oldPwd, newPwd);
    } finally {
      busyRef.current = false;
    }
    setLoading(false);
    if (res && res.ok === false) setErr(res.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ");
  };
  return /* @__PURE__ */ React.createElement("div", { className: "modal-backdrop", onClick: forced ? void 0 : onClose }, /* @__PURE__ */ React.createElement("div", { className: "modal-box", onClick: (e) => e.stopPropagation(), style: { maxWidth: 340 } }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("h2", null, "เปลี่ยนรหัสผ่าน")), /* @__PURE__ */ React.createElement("div", { className: "modal-body", style: { display: "flex", flexDirection: "column", gap: 12 } }, forced && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: "var(--ink-2)", background: "var(--surface-2, #f4f6f7)", borderRadius: 8, padding: "8px 10px" } }, "บัญชีนี้ใช้รหัสผ่านชั่วคราว — กรุณากรอกรหัสผ่านชั่วคราวที่ได้รับ แล้วตั้งรหัสผ่านใหม่ก่อนใช้งานระบบ"), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, forced ? "รหัสผ่านชั่วคราว" : "รหัสผ่านเดิม"), /* @__PURE__ */ React.createElement("input", { type: "password", className: "inp", value: oldPwd, onChange: (e) => setOldPwd(e.target.value), placeholder: "••••••••", autoFocus: true })), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "รหัสผ่านใหม่ ", /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(อย่างน้อย ", MIN_PASSWORD_LENGTH, " ตัว)")), /* @__PURE__ */ React.createElement("input", { type: "password", className: "inp", value: newPwd, onChange: (e) => setNewPwd(e.target.value), placeholder: "••••••••" })), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "ยืนยันรหัสผ่านใหม่"), /* @__PURE__ */ React.createElement("input", { type: "password", className: "inp", value: confirm, onChange: (e) => setConfirm(e.target.value), placeholder: "••••••••", onKeyDown: (e) => e.key === "Enter" && handleSubmit() })), err && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--crit-ink)", fontSize: 13 } }, err)), /* @__PURE__ */ React.createElement("div", { className: "modal-foot" }, forced ? /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: onLogout }, "ออกจากระบบ") : /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: onClose }, "ยกเลิก"), /* @__PURE__ */ React.createElement("button", { className: "btn primary", onClick: handleSubmit, disabled: loading }, loading ? "กำลังบันทึก…" : "บันทึก"))));
}
const GSI_LOAD_TIMEOUT_MS = 1e4;
async function loginRequest(body) {
  let data;
  try {
    data = await gasRequest({ action: "login", ...body });
  } catch (e) {
    throw new Error(`เข้าสู่ระบบไม่สำเร็จ — ${e && e.kind ? e.message : gasErrorText("network")}`);
  }
  if (data.status !== "ok") throw new Error(data.error || "ไม่พบบัญชีนี้ในระบบ");
  return { name: data.name, role: data.role, email: data.email, token: data.token, authMethod: data.authMethod, mustChangePassword: !!data.mustChangePassword };
}
function LoginScreen({ onLogin, notice = null }) {
  const [mode, setMode] = React.useState("google");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [showPwd, setShowPwd] = React.useState(false);
  const [gsiFailed, setGsiFailed] = React.useState(false);
  const btnRef = React.useRef(null);
  React.useEffect(() => {
    if (mode !== "google") return;
    const init = () => {
      if (!window.google?.accounts?.id || !btnRef.current) return;
      setGsiFailed(false);
      google.accounts.id.initialize({
        client_id: window.NEOFEED_CLIENT_ID,
        callback: async (resp) => {
          setLoading(true);
          setError(null);
          try {
            onLogin(await loginRequest({ googleToken: resp.credential }));
          } catch (err) {
            setError(err.message);
            setLoading(false);
          }
        }
      });
      google.accounts.id.renderButton(btnRef.current, {
        type: "standard",
        shape: "pill",
        theme: "outline",
        text: "signin_with",
        locale: "th",
        size: "large",
        width: 300
      });
    };
    if (window.google?.accounts?.id) {
      init();
      return;
    }
    const fail = () => {
      if (!window.google?.accounts?.id) setGsiFailed(true);
    };
    const s = document.querySelector('script[src*="gsi/client"]');
    if (s) {
      s.addEventListener("load", init, { once: true });
      s.addEventListener("error", fail, { once: true });
    } else {
      window.addEventListener("load", init, { once: true });
    }
    const timer = setTimeout(fail, GSI_LOAD_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("load", init);
      if (s) {
        s.removeEventListener("load", init);
        s.removeEventListener("error", fail);
      }
    };
  }, [mode]);
  const submitEmail = async (e) => {
    e && e.preventDefault();
    if (!email.trim() || !password) {
      setError("กรุณากรอก email และรหัสผ่าน");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      onLogin(await loginRequest({ email: email.trim().toLowerCase(), password }));
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };
  const switchToEmail = () => {
    setMode("email");
    setError(null);
  };
  const switchBack = () => {
    setMode("google");
    setError(null);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "login-wrap" }, /* @__PURE__ */ React.createElement(NeoFeedWordmark, { className: "login-app-name", lockup: true }), /* @__PURE__ */ React.createElement("div", { className: "login-tagline" }, "Neonatal nutrition,", /* @__PURE__ */ React.createElement("br", null), "calculated precisely"), notice && /* @__PURE__ */ React.createElement("div", { role: "status", "aria-live": "polite", className: "login-notice", style: {
    width: "100%",
    maxWidth: 320,
    boxSizing: "border-box",
    marginBottom: 18,
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 1.5,
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-line)",
    color: "var(--warn-ink)"
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600 } }, notice.title), notice.body && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 2 } }, notice.body)), mode === "google" && /* @__PURE__ */ React.createElement(React.Fragment, null, gsiFailed && /* @__PURE__ */ React.createElement("div", { role: "alert", className: "login-gsi-failed", style: {
    width: "100%",
    maxWidth: 320,
    boxSizing: "border-box",
    marginBottom: 8,
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 1.5,
    textAlign: "center",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit-line)",
    color: "var(--crit)"
  } }, "โหลด Google Sign-In ไม่สำเร็จ — ตรวจสอบเครือข่าย"), /* @__PURE__ */ React.createElement("div", { className: "login-btn-area" }, /* @__PURE__ */ React.createElement("div", { ref: btnRef, style: { display: loading ? "none" : "flex", justifyContent: "center", minHeight: 44 } }), loading && /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    color: "var(--ink-2)",
    fontSize: 13
  } }, /* @__PURE__ */ React.createElement("span", { style: {
    width: 16,
    height: 16,
    border: "2px solid var(--line)",
    borderTopColor: "var(--brand)",
    borderRadius: "50%",
    animation: "spin .9s linear infinite",
    display: "inline-block"
  } }), "กำลังตรวจสอบ...")), /* @__PURE__ */ React.createElement("button", { className: "login-alt-link", onClick: switchToEmail }, "เข้าด้วย email อื่น →")), mode === "email" && /* @__PURE__ */ React.createElement("div", { className: "login-form-wrap" }, /* @__PURE__ */ React.createElement("button", { className: "login-back-link", onClick: switchBack }, "← Sign in ด้วย Google"), /* @__PURE__ */ React.createElement("form", { onSubmit: submitEmail, style: { width: "100%", display: "flex", flexDirection: "column", gap: 10 } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "inp",
      type: "email",
      placeholder: "Email (@redcross.or.th …)",
      value: email,
      onChange: (e) => setEmail(e.target.value),
      autoComplete: "username",
      autoFocus: true,
      disabled: loading,
      style: { width: "100%", fontSize: 14 }
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { position: "relative", width: "100%" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "inp",
      type: showPwd ? "text" : "password",
      placeholder: "รหัสผ่าน",
      value: password,
      onChange: (e) => setPassword(e.target.value),
      autoComplete: "current-password",
      disabled: loading,
      style: { width: "100%", fontSize: 14, paddingRight: 54 }
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setShowPwd((s) => !s),
      style: {
        position: "absolute",
        right: 10,
        top: "50%",
        transform: "translateY(-50%)",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--ink-3)",
        fontSize: 12,
        padding: 4
      }
    },
    showPwd ? "ซ่อน" : "แสดง"
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn primary",
      type: "submit",
      disabled: loading,
      style: { width: "100%", height: 44, fontSize: 14 }
    },
    loading ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { style: {
      display: "inline-block",
      width: 14,
      height: 14,
      border: "2px solid rgba(255,255,255,.4)",
      borderTopColor: "#fff",
      borderRadius: "50%",
      animation: "spin .9s linear infinite",
      marginRight: 8,
      verticalAlign: "middle"
    } }), "กำลังตรวจสอบ...") : "เข้าสู่ระบบ"
  ))), error && /* @__PURE__ */ React.createElement("div", { className: "login-error", style: { maxWidth: 320, width: "100%" } }, "⚠️ ", error), /* @__PURE__ */ React.createElement("div", { className: "login-contact" }, /* @__PURE__ */ React.createElement("div", { className: "login-endorse" }, /* @__PURE__ */ React.createElement("span", null, "by Valhalla Health · © 2026"))), /* @__PURE__ */ React.createElement("style", null, `@keyframes spin { to { transform: rotate(360deg); } }`));
}
function AdminDashboard({ patients, log, lastSync, includeArchived = false, onToggleArchived }) {
  const totalLogs = Object.values(log).reduce((a, l) => a + l.length, 0);
  const active = patients.filter((p) => !p.status || p.status === "Active").length;
  const allEntries = patients.flatMap((p) => (log[p.sessionId] || []).map((e) => ({ ...e, sid: p.sessionId, bed: p.currentBed, showDol: D_A.entryDol(p, e) }))).sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));
  const alertsTotal = patients.reduce((sum, p) => {
    return sum + activeAlertCount(p, log[p.sessionId] || []);
  }, 0);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Admin dashboard"), /* @__PURE__ */ React.createElement("div", { className: "sub" }, "Read-only oversight · pulled from GAS Patient_Registry & Daily_Log")), /* @__PURE__ */ React.createElement("div", { className: "pill" }, /* @__PURE__ */ React.createElement("span", { className: "dot", style: { background: "var(--brand)" } }), lastSync ? `Synced ${lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : GAS_ON ? "Not synced" : "Local only")), GAS_ON && onToggleArchived && /* @__PURE__ */ React.createElement("div", { className: "card", style: { padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: "1 1 220px", minWidth: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, color: "var(--ink)" } }, "แสดงผู้ป่วยที่จำหน่ายเกิน 30 วัน"), includeArchived ? "เปิดอยู่ — ดึงข้อมูลผู้ป่วยที่จำหน่ายแล้วทั้งหมดลงเครื่องนี้ ปิดเมื่อใช้งานเสร็จ" : "ปิดอยู่ — ซิงก์เฉพาะผู้ป่วยที่ยังอยู่หรือจำหน่ายไม่เกิน 30 วัน"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: `btn archive-toggle${includeArchived ? " primary" : ""}`,
      "aria-pressed": includeArchived,
      onClick: onToggleArchived,
      style: { justifyContent: "center", minWidth: 96 }
    },
    includeArchived ? "ปิด" : "เปิด"
  )), /* @__PURE__ */ React.createElement("div", { className: "admin-stat-tiles" }, [
    ["Active sessions", active, "var(--brand)"],
    ["Total patients", patients.length, "var(--ink)"],
    ["Logged entries", totalLogs, "var(--ok)"],
    ["Active alerts", alertsTotal, "var(--warn-ink)"]
  ].map(
    ([l, v, c]) => /* @__PURE__ */ React.createElement("div", { key: l, className: "card", style: { padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06 } }, l), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontSize: 30, fontWeight: 500, color: c } }, v))
  )), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "log", size: 14, color: "var(--brand)" }), " Recent log entries", /* @__PURE__ */ React.createElement("span", { className: "h-meta" }, allEntries.length, " total")), /* @__PURE__ */ React.createElement("div", { className: "card-b", style: { padding: 0 } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { background: "var(--bg-2)", textAlign: "left" } }, /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" } }, "Session"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" } }, "Bed"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" } }, "DOL"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" } }, "Wt (g)"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" } }, "kcal"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" } }, "Protein"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" } }, "Route"))), /* @__PURE__ */ React.createElement("tbody", null, allEntries.slice(-20).reverse().map(
    (e, i) => /* @__PURE__ */ React.createElement("tr", { key: i, style: { borderTop: "1px solid var(--line-2)" } }, /* @__PURE__ */ React.createElement("td", { className: "num", style: { padding: "8px 12px" } }, e.sid), /* @__PURE__ */ React.createElement("td", { className: "num", style: { padding: "8px 12px" } }, e.bed), /* @__PURE__ */ React.createElement("td", { className: "num", style: { padding: "8px 12px" } }, e.showDol), /* @__PURE__ */ React.createElement("td", { className: "num", style: { padding: "8px 12px" } }, D_A.displayNum(e.weight, 2)), /* @__PURE__ */ React.createElement("td", { className: "num", style: { padding: "8px 12px" } }, D_A.displayNum(e.kcal, 2)), /* @__PURE__ */ React.createElement("td", { className: "num", style: { padding: "8px 12px" } }, D_A.displayNum(e.pro, 2)), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 12px", color: "var(--ink-2)" } }, e.route))
  ))))));
}
function BottomNav({ view, setView, alertCount, logCount, role }) {
  const tabs = [
    { id: "registry", icon: "users", label: "Patients" },
    { id: "log", icon: "log", label: "Dashboard", badge: logCount },
    ...role === "doctor" || role === "nurse" ? [{ id: "calculator", icon: "calc", label: "Calc" }] : [],
    { id: "fenton", icon: "chart", label: "Growth" },
    { id: "alerts", icon: "bell", label: "Alerts", badge: alertCount }
  ];
  return /* @__PURE__ */ React.createElement("nav", { className: "bottom-nav", "aria-label": "Main navigation" }, tabs.map((t) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: t.id,
      className: `bnav-item${view === t.id ? " active" : ""}`,
      onClick: () => setView(t.id),
      "aria-label": t.label
    },
    t.badge > 0 && /* @__PURE__ */ React.createElement("span", { className: "bnav-badge" }, t.badge),
    /* @__PURE__ */ React.createElement(Icon, { name: t.icon, size: 23, color: view === t.id ? "var(--brand)" : "var(--ink-4)" }),
    /* @__PURE__ */ React.createElement("span", null, t.label)
  )));
}
function GuidelinesPanel() {
  const G = D_A.ESPGHAN_TARGETS;
  const [tab, setTab] = React.useState("pn");
  const Seg = ({ tabs, active, onChange }) => /* @__PURE__ */ React.createElement("div", { className: "seg", style: { marginBottom: 18 } }, tabs.map(
    ([id, label]) => /* @__PURE__ */ React.createElement("button", { key: id, className: active === id ? "on" : "", onClick: () => onChange(id) }, label)
  ));
  const RangeRow = ({ label, min, max, unit, note, highlight }) => /* @__PURE__ */ React.createElement("div", { style: {
    display: "grid",
    gridTemplateColumns: "1.8fr 1fr 1.2fr",
    gap: 8,
    alignItems: "center",
    padding: "7px 0",
    borderBottom: "1px solid var(--line-2)"
  } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, color: "var(--ink)", fontWeight: 500 } }, label), note && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--ink-3)", marginTop: 1 } }, note)), /* @__PURE__ */ React.createElement("div", { className: "num", style: {
    fontWeight: 600,
    fontSize: 13,
    color: highlight ? "var(--brand-2)" : "var(--ink)"
  } }, min, "–", max), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)" } }, unit));
  const SectionHead = ({ children }) => /* @__PURE__ */ React.createElement("div", { className: "sub-h", style: { marginTop: 18 } }, children);
  const Badge = ({ children, color = "var(--brand-bg)", text = "var(--brand-2)" }) => /* @__PURE__ */ React.createElement("span", { style: {
    fontSize: 10,
    padding: "1px 7px",
    borderRadius: 999,
    background: color,
    color: text,
    fontWeight: 600,
    marginLeft: 6
  } }, children);
  const PhaseTable = ({ rows, cols }) => /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto", marginTop: 8 } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { background: "var(--bg-2)" } }, cols.map((c, i) => /* @__PURE__ */ React.createElement("th", { key: i, style: {
    padding: "6px 10px",
    textAlign: i === 0 ? "left" : "center",
    fontWeight: 600,
    color: "var(--ink-3)",
    fontSize: 11,
    letterSpacing: "0.04em",
    borderBottom: "1px solid var(--line)"
  } }, c)))), /* @__PURE__ */ React.createElement("tbody", null, rows.map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: i, style: { borderBottom: "1px solid var(--line-2)", background: i % 2 === 0 ? "var(--surface)" : "var(--bg-2)" } }, r.map((cell, j) => /* @__PURE__ */ React.createElement("td", { key: j, style: {
    padding: "6px 10px",
    textAlign: j === 0 ? "left" : "center",
    fontFamily: j > 0 ? "IBM Plex Mono, monospace" : "inherit",
    fontWeight: j > 0 ? 500 : 400,
    fontSize: j === 0 ? 12 : 12.5
  } }, cell)))))));
  const Rule = ({ level, title, body }) => /* @__PURE__ */ React.createElement("div", { className: `alert-row ${level}`, style: { marginBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { className: "ico" }, level === "crit" ? "!" : "i"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "title" }, title), /* @__PURE__ */ React.createElement("div", { className: "body" }, body)));
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Clinical Guidelines"), /* @__PURE__ */ React.createElement("div", { className: "sub" }, "ESPGHAN/ESPEN/ESPR/CSPEN 2018 (PN) · ESPGHAN CoN 2022 (EN) · WHO 2023 · Fenton 2025")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", textAlign: "right" } }, "Quick reference for bedside use", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--brand)" } }, "Not a substitute for clinical judgment"))), /* @__PURE__ */ React.createElement(
    Seg,
    {
      tabs: [["pn", "💉 PN (ESPGHAN 2018)"], ["en", "🍼 EN (ESPGHAN 2022)"], ["who", "🌍 WHO 2023"]],
      active: tab,
      onChange: setTab
    }
  ), tab === "pn" && /* @__PURE__ */ React.createElement("div", { className: "guidelines-grid" }, /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "drop", size: 14, color: "var(--brand)" }), "Amino Acids", /* @__PURE__ */ React.createElement(Badge, null, "R3.1 LOE 1++ · R3.2 LOE 1+")), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(
    RangeRow,
    {
      label: "Day 1 (preterm)",
      min: "1.5",
      max: "2.5",
      unit: "g/kg/day",
      note: "Start from birth or ASAP — avoid 'metabolic shock'",
      highlight: true
    }
  ), /* @__PURE__ */ React.createElement(
    RangeRow,
    {
      label: "Day 2+ (preterm)",
      min: "2.5",
      max: "3.5",
      unit: "g/kg/day",
      note: "Needs non-protein energy ≥65 kcal/kg to utilise AA",
      highlight: true
    }
  ), /* @__PURE__ */ React.createElement(RangeRow, { label: "Above 3.5 g/kg", min: "—", max: "—", unit: "", note: "Research only (LOE 2+, RG 0)" }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Term stable", min: "1.5", max: "3.0", unit: "g/kg/day" }), /* @__PURE__ */ React.createElement(SectionHead, null, "Specific AAs"), /* @__PURE__ */ React.createElement(RangeRow, { label: "Cysteine", min: "50", max: "75", unit: "mg/kg/day", note: "Conditionally essential — add to preterm PN" }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Glutamine", min: "—", max: "—", unit: "", note: "Do NOT supplement ≤2 yr (LOE 1++, RG A)" }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Arginine", min: "—", max: "—", unit: "", note: "May use for NEC prevention (LOE 1-, RG B)" }))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "drop", size: 14, color: "var(--brand)" }), "Glucose Infusion Rate (GIR)"), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(RangeRow, { label: "Start (preterm)", min: "4", max: "8", unit: "mg/kg/min", highlight: true }), /* @__PURE__ */ React.createElement(
    RangeRow,
    {
      label: "Target (preterm)",
      min: "8",
      max: "10",
      unit: "mg/kg/min",
      note: "Optimal anabolism without excess lipogenesis",
      highlight: true
    }
  ), /* @__PURE__ */ React.createElement(
    RangeRow,
    {
      label: "Max (all)",
      min: "—",
      max: "12",
      unit: "mg/kg/min",
      note: ">12 → ↑lipogenesis, ↑TG, ↑CO₂, ventilator weaning difficulty"
    }
  ), /* @__PURE__ */ React.createElement(RangeRow, { label: "Advance", min: "+1", max: "+2", unit: "mg/kg/min per day" }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Term start", min: "2.5", max: "5", unit: "mg/kg/min" }), /* @__PURE__ */ React.createElement(SectionHead, null, "Hyperglycemia management"), /* @__PURE__ */ React.createElement(Rule, { level: "warn", title: "BG >145 mg/dL", body: "Reduce GIR first (step down 1–2 mg/kg/min)" }), /* @__PURE__ */ React.createElement(Rule, { level: "crit", title: "BG >180 mg/dL persistent", body: "Insulin 0.01–0.05 U/kg/hr — only after GIR minimised" }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", marginTop: 8 } }, "Peripheral IV: max dextrose ", /* @__PURE__ */ React.createElement("strong", null, "12.5%")))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "drop", size: 14, color: "var(--brand)" }), "Lipid Emulsion"), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(RangeRow, { label: "Start (Day 1–2)", min: "0.5", max: "1.0", unit: "g/kg/day", highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Advance", min: "+0.5", max: "+1.0", unit: "g/kg/day per day" }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Max", min: "—", max: "4.0", unit: "g/kg/day" }), /* @__PURE__ */ React.createElement(RangeRow, { label: "TG threshold", min: "—", max: "265", unit: "mg/dL → reduce ILE" }), /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 10,
    padding: "8px 10px",
    background: "var(--brand-bg)",
    borderRadius: 6,
    fontSize: 11.5,
    color: "var(--ink-2)"
  } }, /* @__PURE__ */ React.createElement("strong", null, "SMOF lipid preferred"), " — composite ILE (soy+MCT+olive+fish oil) reduces PNALD risk vs pure soy-based. Protect all lipid from light."), /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 8,
    padding: "8px 10px",
    background: "var(--bg-2)",
    borderRadius: 6,
    fontSize: 11.5
  } }, "20% ILE = ", /* @__PURE__ */ React.createElement("strong", { className: "mono" }, "2.0 kcal/mL"), " · 1 g fat = 5 mL SMOF 20%"))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "drop", size: 14, color: "var(--brand)" }), "Ca · P · Mg (PN)", /* @__PURE__ */ React.createElement(Badge, null, "Mihatsch 2018")), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(SectionHead, null, "Day 1"), /* @__PURE__ */ React.createElement(RangeRow, { label: "Ca", min: "0.8", max: "2.0", unit: "mmol/kg/day = 32–80 mg/kg", highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "P", min: "1.0", max: "2.0", unit: "mmol/kg/day = 31–62 mg/kg", highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Mg", min: "0.1", max: "0.2", unit: "mmol/kg/day" }), /* @__PURE__ */ React.createElement(SectionHead, null, "Growing preterm (D2+)"), /* @__PURE__ */ React.createElement(RangeRow, { label: "Ca", min: "1.6", max: "3.5", unit: "mmol/kg/day = 64–140 mg/kg", highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "P", min: "1.6", max: "3.5", unit: `mmol/kg/day = ${D_A.TPN_TARGETS.p(2)[0]}–${D_A.TPN_TARGETS.p(2)[1]} mg/kg`, highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Mg", min: "0.2", max: "0.3", unit: "mmol/kg/day" }), /* @__PURE__ */ React.createElement(SectionHead, null, "Ca:P ratio"), /* @__PURE__ */ React.createElement(RangeRow, { label: "Molar (PN)", min: "0.8", max: "1.3", unit: ":1 — target 1.3:1 for stable growth", highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Mass ratio", min: "1.0", max: "1.7", unit: ":1 (Ca g / P g)" }), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, fontSize: 11, color: "var(--ink-3)" } }, "Use ", /* @__PURE__ */ React.createElement("strong", null, "Glycophos®"), " (organic P) — avoids CaPO₄ precipitation. 1 mL = 1 mmol P + 2 mmol Na."))), /* @__PURE__ */ React.createElement("div", { className: "card", style: { gridColumn: "1 / -1" } }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "drop", size: 14, color: "var(--brand)" }), "Fluid targets (mL/kg/day) by DOL + birth weight", /* @__PURE__ */ React.createElement(Badge, null, "Jochum 2018")), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(
    PhaseTable,
    {
      cols: ["BW category", "DOL 1", "DOL 2", "DOL 3", "DOL 4", "DOL 5+"],
      rows: [
        ["ELBW <1000g", "80–100", "100–120", "120–140", "140–160", "160–180"],
        ["VLBW 1000–1500g", "70–90", "90–110", "110–130", "130–150", "140–160"],
        ["Preterm >1500g", "60–80", "80–100", "100–120", "120–140", "140–160"],
        ["Term ≥2500g", "40–60", "50–70", "60–80", "60–100", "100–140"]
      ]
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, fontSize: 11, color: "var(--ink-3)" } }, "ELBW in humidified incubator (80–90%): IWL ≈30 mL/kg/day. Open warmer: IWL up to 120 mL/kg/day. Target UO 1–3 mL/kg/hr."))), /* @__PURE__ */ React.createElement("div", { className: "card", style: { gridColumn: "1 / -1" } }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "drop", size: 14, color: "var(--brand)" }), "Electrolytes (mmol/kg/day) by phase", /* @__PURE__ */ React.createElement(Badge, null, "Jochum 2018")), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(
    PhaseTable,
    {
      cols: ["Electrolyte", "Transition (D1–2)", "Intermediate (D3–7)", "Stable (D8+)", "Notes"],
      rows: [
        ["Na — ELBW <1kg", "0–2", "0–5", "2–7", "High Na loss possible; guided by serum Na"],
        ["Na — Preterm", "0–2", "0–3", "2–5", "Withhold D1–2; add when UO established"],
        ["Na — Term", "0–2", "0–2", "1–3", ""],
        ["K — All", "0–3", "0–3", "2–3", "Avoid routine K in D1–2 ELBW (hyperkalemia risk)"],
        ["Cl — All", "0–3", "0–3", "2–5", "Keep Na+K > Cl by 1–2 mmol/kg to avoid acidosis"]
      ]
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 } }, [
    ["Zn (preterm)", "400–500 µg/kg/day"],
    ["Fe (preterm)", "200–250 µg/kg/day"],
    ["Cu", "40 µg/kg/day"]
  ].map(([l, v]) => /* @__PURE__ */ React.createElement("div", { key: l, style: { background: "var(--bg-2)", borderRadius: 6, padding: "8px 10px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em" } }, l), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontWeight: 600, fontSize: 13 } }, v)))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, fontSize: 11, color: "var(--ink-3)" } }, "Peditrace® 1 mL/kg/day (maximum 15 mL/day) covers Zn, Cu, Se, Mn, I. Vitalipid N Infant: BW ", "<", "2.5 kg → 4 mL/kg · BW ≥2.5 kg → 10 mL/day (lipid bag). Soluvit N: 1 mL/kg/day (aqueous bag).")))), tab === "en" && /* @__PURE__ */ React.createElement("div", { className: "guidelines-grid" }, /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "milk", size: 14, color: "var(--brand)" }), "Macronutrients", /* @__PURE__ */ React.createElement(Badge, null, "ESPGHAN CoN 2022")), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(RangeRow, { label: "Energy", min: "115", max: "140", unit: "kcal/kg/day (max 160 for catch-up)", highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Protein", min: "3.5", max: "4.0", unit: "g/kg/day (max 4.5)", highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "P:E ratio", min: "2.8", max: "3.6", unit: "g/100 kcal — ensures lean mass" }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Fat", min: "4.8", max: "8.1", unit: "g/kg/day (↑ from 2010)" }), /* @__PURE__ */ React.createElement(RangeRow, { label: "DHA", min: "30", max: "65", unit: "mg/kg/day (↑↑ from 12–30)", highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "ARA", min: "30", max: "100", unit: "mg/kg/day (↑ from 18–42)" }), /* @__PURE__ */ React.createElement(RangeRow, { label: "CHO", min: "11", max: "17", unit: "g/kg/day" }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Fluid", min: "150", max: "180", unit: "mL/kg/day (target 165)" }))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "drop", size: 14, color: "var(--brand)" }), "Minerals + Vitamins", /* @__PURE__ */ React.createElement(Badge, null, "ESPGHAN CoN 2022")), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(RangeRow, { label: "Na", min: "3.0", max: "5.0", unit: "mmol/kg/day (up to 8.0 ELBW)", highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "K", min: "2.3", max: "4.6", unit: "mmol/kg/day (↑↑ from 1.7–3.4)", highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Ca", min: "120", max: "200", unit: "mg/kg/day = 3.0–5.0 mmol/kg (↑)", highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "P", min: "70", max: "115", unit: "mg/kg/day = 2.2–3.7 mmol/kg (↑)", highlight: true }), /* @__PURE__ */ React.createElement(SectionHead, null, "Vitamins + trace (enteral)"), /* @__PURE__ */ React.createElement(RangeRow, { label: "Vitamin D", min: "400", max: "700", unit: "IU/kg/day (⚠️ per kg, not per day!)", highlight: true }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Iron", min: "2", max: "3", unit: "mg/kg/day, start at 2 wks (up to 6)" }), /* @__PURE__ */ React.createElement(RangeRow, { label: "Zinc", min: "2.0", max: "3.0", unit: "mg/kg/day (↑↑ from 1.1–2.0)", highlight: true }), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, fontSize: 11, color: "var(--ok)", fontWeight: 500 } }, "✅ Key 2022 changes: DHA↑ · K↑ · Ca↑ · P↑ · Zn↑ · Vit D switched to per kg/day"))), /* @__PURE__ */ React.createElement("div", { className: "card", style: { gridColumn: "1 / -1" } }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "milk", size: 14, color: "var(--brand)" }), "Feeding Advancement Protocol"), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement("div", { className: "feeding-steps-grid" }, [
    ["1. Start ASAP", "12–24 mL/kg/day", "MEF (trophic)", "Day 1 — even ELBW", "GOR B"],
    ["2. Advance", "+18–30 mL/kg/day", "per day", "WHO 2023: up to 30 safe", "Mod certainty"],
    ["3. Fortify", "≥40 mL/kg/day", "Start HMF", "<32 wk or <1.5 kg on MOM/DHM", "WHO 2023"],
    ["4. Full EN", "≥100 mL/kg/day", "Wean PN", "KCMH threshold · switch to EN targets", "KCMH practice"],
    ["5. Oral feed", "PMA ≥32 wks", "Non-nutritive", "Support breastfeeding", ""]
  ].map(([step, vol, label, note, ref], i) => /* @__PURE__ */ React.createElement("div", { key: i, style: {
    padding: "12px 10px",
    textAlign: "center",
    background: i % 2 === 0 ? "var(--surface)" : "var(--bg-2)"
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--brand-2)", marginBottom: 4 } }, step), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontSize: 14, fontWeight: 600, color: "var(--ink)" } }, vol), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-2)", marginTop: 2 } }, label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--ink-3)", marginTop: 4 } }, note), ref && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--brand)", marginTop: 2 } }, ref)))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } }, /* @__PURE__ */ React.createElement(
    Rule,
    {
      level: "info",
      title: "No routine gastric residual monitoring",
      body: "Not recommended in stable preterm infants (ESPGHAN 2022 GOR B). Check only if: abdominal distension, tenderness, bilious vomiting, bloody stools."
    }
  ), /* @__PURE__ */ React.createElement(
    Rule,
    {
      level: "info",
      title: "Scheduled feeding preferred",
      body: "q2–3h scheduled feeds for <34 wk, rather than demand feeding — until hospital discharge (WHO 2023, conditional)."
    }
  )), /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 12,
    padding: "10px 14px",
    background: "var(--brand-bg)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--ink-2)"
  } }, /* @__PURE__ */ React.createElement("strong", null, "Growth targets (ESPGHAN 2022):"), " Weight ≥17–20 g/kg/day · Length ≥0.8 cm/wk · HC ≥0.5 cm/wk")))), tab === "who" && /* @__PURE__ */ React.createElement("div", { className: "guidelines-grid" }, /* @__PURE__ */ React.createElement("div", { className: "card", style: { gridColumn: "1 / -1" } }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 14, color: "var(--brand)" }), "WHO 2023 Preterm Feeding — New & Changed Recommendations"), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, [
    {
      level: "crit",
      title: "Ca/P supplementation: NOT recommended",
      body: "Changed from 2015 — routine Ca/P supplement for formula-fed preterm/LBW no longer recommended (insufficient evidence)."
    },
    {
      level: "info",
      title: "Early enteral feeding from Day 1 (Strong, Moderate certainty)",
      body: "All preterm/LBW including <32 wk and <1.5 kg. Clinically stable or not. Base on clinical judgment for unstable infants."
    },
    {
      level: "info",
      title: "Feed advancement: up to 30 mL/kg/day (Conditional, Moderate certainty)",
      body: "All trials compared fast (30–40 mL/kg/day) vs slow (10–25). Fast advancement: ↓ time to regain BW, ↓ LOS. No ↑ NEC."
    },
    // The start threshold used to read "EN ≥100 mL/kg/day" here while
    // the EN tab and EN_DB both said ≥40, each citing WHO 2023
    // (review F5). NeoFeed's own value is the one shown below —
    // ESPGHAN_TARGETS.en.advancement.hmfStart.
    {
      level: "info",
      title: "HMF: conditionally recommended for <32 wk or <1.5 kg on MOM/DHM",
      body: `Use commercially available multicomponent HMF formulated for preterm infants. Start threshold: NeoFeed uses ≥${D_A.ESPGHAN_TARGETS.en.advancement.hmfStart} mL/kg/day (unit protocol — confirm locally).`
    },
    {
      level: "info",
      title: "Iron: 2–4 mg/kg/day (Strong, Moderate certainty)",
      body: "For human milk-fed preterm/LBW not receiving iron from another source. Start when EN established."
    },
    {
      level: "info",
      title: "Zinc: 1–3 mg/kg/day (Conditional, Low certainty)",
      body: "For human milk-fed preterm/LBW. Initiate when EN established."
    },
    {
      level: "info",
      title: "Vitamin D: 400–800 IU/day (Conditional, Low certainty)",
      body: "For human milk-fed preterm/LBW. Note: WHO says per day (not per kg as ESPGHAN 2022). Use clinical judgment."
    },
    {
      level: "warn",
      title: "Scheduled feeds q2–3h preferred over demand (Conditional, Low certainty)",
      body: "For <34 wk in health facilities until discharge. Balance with nurturing/responsive caregiving."
    },
    {
      level: "info",
      title: "Probiotics: conditionally recommended for <32 wk on human milk",
      body: "Moderate certainty for ↓ mortality, NEC, invasive infection. Use only regulatory-approved formulations."
    }
  ].map((a, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: `alert-row ${a.level}`, style: { marginBottom: 8 } }, /* @__PURE__ */ React.createElement("div", { className: "ico" }, a.level === "crit" ? "!" : a.level === "warn" ? "!" : "i"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "title" }, a.title), /* @__PURE__ */ React.createElement("div", { className: "body" }, a.body)))))), /* @__PURE__ */ React.createElement("div", { className: "card", style: { gridColumn: "1 / -1" } }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 14, color: "var(--brand)" }), "ESPGHAN 2022 vs 2010 — Key numeric changes"), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(
    PhaseTable,
    {
      cols: ["Nutrient", "ESPGHAN 2010", "ESPGHAN 2022", "Change", "Unit"],
      rows: [
        ["Energy", "110–135", "115–140 (max 160)", "↑ upper", "kcal/kg/day"],
        ["Protein", "3.5–4.5", "3.5–4.0 (max 4.5)", "Quality focus", "g/kg/day"],
        ["Fat", "4.8–6.6", "4.8–8.1", "↑↑ upper", "g/kg/day"],
        ["DHA", "12–30", "30–65", "↑↑", "mg/kg/day"],
        ["ARA", "18–42", "30–100", "↑", "mg/kg/day"],
        ["Na", "3.0–5.0", "3.0–5.0 (–8.0)", "↑ upper range", "mmol/kg/day"],
        ["K", "1.7–3.4", "2.3–4.6", "↑↑ both ends", "mmol/kg/day"],
        ["Ca", "3.0–3.5 mmol", "3.0–5.0 mmol", "↑ upper", "mmol/kg/day"],
        ["P", "1.9–2.9 mmol", "2.2–3.7 mmol", "↑", "mmol/kg/day"],
        ["Vitamin D", "800–1000 IU/day", "400–700 IU/kg/day", "Per kg now!", "IU"],
        ["Iron", "2–3 mg/kg", "2–3 (up to 6)", "≈same", "mg/kg/day"],
        ["Zinc", "1.1–2.0", "2.0–3.0", "↑↑", "mg/kg/day"]
      ]
    }
  )))));
}
function FormulasPanel() {
  const DB = D_A.EN_DB;
  const groups = [
    { label: "🤱 Breast Milk", keys: ["BM_20", "BM_HMF_24"] },
    { label: "🥛 HiQ LF (Dumex)", keys: ["HIQLF_20", "HIQLF_24", "HIQLF_27"] },
    { label: "🍼 Enfalac LF (MJN)", keys: ["ENFALAC_20", "ENFALAC_24", "ENFALAC_27"] },
    { label: "⚡ High-energy / Mixed", keys: ["BM_PF_20", "FBM_PF_22", "FBM_PF_24", "FBM_INF_MIX", "INFATRINI_30"] }
  ];
  const cols = ["Formula", "kcal", "Protein", "Fat", "Na", "K", "Ca", "P", "Osm", "LF?", "Note"];
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Formula + Feed Reference"), /* @__PURE__ */ React.createElement("div", { className: "sub" }, "KCMH NICU formulary · per 100 mL prepared formula")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)" } }, "Units: kcal · g · mmol (Na/K) · mg (Ca/P)")), groups.map(({ label, keys }) => /* @__PURE__ */ React.createElement("div", { key: label, className: "card", style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "milk", size: 14, color: "var(--brand)" }), label), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { background: "var(--bg-2)" } }, ["Formula", "kcal/100mL", "Protein g", "Fat g", "Na mmol", "K mmol", "Ca mg", "P mg", "Osm", "LF", "Note"].map((h, i) => /* @__PURE__ */ React.createElement("th", { key: i, style: {
    padding: "7px 10px",
    textAlign: i === 0 ? "left" : "center",
    fontWeight: 600,
    color: "var(--ink-3)",
    fontSize: 11,
    borderBottom: "1px solid var(--line)",
    whiteSpace: "nowrap"
  } }, h)))), /* @__PURE__ */ React.createElement("tbody", null, keys.filter((k) => DB[k]).map((k, i) => {
    const f = DB[k];
    return /* @__PURE__ */ React.createElement("tr", { key: k, style: {
      borderBottom: "1px solid var(--line-2)",
      background: i % 2 === 0 ? "var(--surface)" : "var(--bg-2)"
    } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", color: "var(--ink)", maxWidth: 180, minWidth: 130 } }, (() => {
      const m = f.label.match(/^(.*?)\s*\((.+)\)$/);
      if (!m) return /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 500 } }, f.label);
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 13 } }, m[1]), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--ink-3)", marginTop: 1 } }, "(", m[2], ")"));
    })()), [f.kcal, f.pro, f.fat, f.na == null ? null : D_A.displayNum(f.na, 2), f.k == null ? null : D_A.displayNum(f.k, 2), f.ca, f.p].map((v, j) => /* @__PURE__ */ React.createElement("td", { key: j, className: "num", style: {
      padding: "7px 10px",
      textAlign: "center",
      fontWeight: 500,
      fontSize: 12.5
    } }, v ?? "—")), /* @__PURE__ */ React.createElement("td", { className: "num", style: { padding: "7px 10px", textAlign: "center", fontSize: 12 } }, f.osm), /* @__PURE__ */ React.createElement("td", { style: { padding: "7px 10px", textAlign: "center", fontSize: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { color: f.lf ? "var(--ok)" : "var(--ink-3)" } }, f.lf ? "✅" : "—")), /* @__PURE__ */ React.createElement("td", { style: {
      padding: "7px 10px",
      fontSize: 11,
      color: "var(--ink-3)",
      maxWidth: 200,
      wordBreak: "break-word"
    } }, f.note || ""));
  })))))));
}
function toastHost() {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    document.body.appendChild(host);
  }
  return host;
}
function showToast(msg, type = "ok") {
  const host = toastHost();
  const t = document.createElement("div");
  const bg = type === "error" ? "oklch(38% 0.15 20)" : "oklch(26% 0.035 203)";
  const prefix = type === "error" ? "⚠ " : "✓ ";
  const dur = type === "error" ? 4200 : 2400;
  const toastBottom = getComputedStyle(document.documentElement).getPropertyValue("--toast-bottom").trim() || "24px";
  t.style.cssText = `position:fixed;bottom:${toastBottom};left:50%;transform:translateX(-50%) translateY(10px);background:${bg};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;box-shadow:0 8px 28px oklch(25% 0.02 205 / .28);z-index:80;font-family:'IBM Plex Sans',sans-serif;opacity:0;transition:opacity .18s ease,transform .18s ease;max-width:90vw;text-align:center;`;
  t.textContent = prefix + msg;
  host.appendChild(t);
  requestAnimationFrame(() => {
    t.style.opacity = "1";
    t.style.transform = "translateX(-50%) translateY(0)";
  });
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(-50%) translateY(4px)";
  }, dur);
  setTimeout(() => {
    if (host.contains(t)) host.removeChild(t);
  }, dur + 250);
}
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent("__open_picker"));
  }
});
ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(ViewErrorBoundary, { variant: "root" }, /* @__PURE__ */ React.createElement(AppRoot, null)));
