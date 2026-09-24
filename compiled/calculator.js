"use strict";
const { useState, useMemo } = React;
const D = window.NEOFEED_DATA;
const S = D.KCMH_STOCK;
const fmt = (n, d = 1) => n === Infinity ? "!!" : D.displayNum(n, d);
function sortClinicalAlerts(items) {
  const priority = { crit: 0, warn: 1, info: 2 };
  return items.map((alert, index) => ({ alert, index })).sort((a, b) => (priority[a.alert.level] ?? 3) - (priority[b.alert.level] ?? 3) || a.index - b.index).map(({ alert }) => alert);
}
function normalizeCalcInput(src, fallbackWeight, fallbackFluid) {
  src = src || {};
  return {
    // curWtG is the new key; src.wtG is the pre-migration key an older saved
    // entry/localStorage draft used for the same "weight typed into the field".
    curWtG: src.curWtG ?? src.wtG ?? fallbackWeight ?? 0,
    // Manual TPN calculation weight; 0 = follow the birth-weight-floor rule.
    // Absent from every entry saved before 2026-09-15, which is exactly the
    // automatic behaviour those orders were calculated with, so ?? 0 restores
    // them unchanged.
    tpnWtOverrideG: src.tpnWtOverrideG ?? 0,
    // A row saved before calcInput existed has no fluid plan; start it from the
    // ESPGHAN midpoint rather than 0 (2026-09-11 review, F10).
    fluidTargetPerKg: src.fluidTargetPerKg ?? fallbackFluid ?? 0,
    otherIV_mL: src.otherIV_mL ?? 0,
    drug_mL: src.drug_mL ?? 0,
    ioInput: src.ioInput ?? 0,
    ioOutput: src.ioOutput ?? 0,
    drainContent: src.drainContent ?? 0,
    route: src.route ?? "central",
    totalTPN_mL: src.totalTPN_mL ?? 0,
    deadVol_mL: src.deadVol_mL ?? 0,
    dexPct: src.dexPct ?? 0,
    aaPerKg: src.aaPerKg ?? 0,
    // Which amino-acid stock (a KCMH_STOCK key). Absent from every entry saved
    // before 2026-09-18, all of which were Aminoven — the only stock there was.
    aaProduct: src.aaProduct ?? "aminoven10",
    lipidPerKg: src.lipidPerKg ?? 0,
    lipidDripHours: src.lipidDripHours ?? 24,
    naCl: src.naCl ?? 0,
    naAcet: src.naAcet ?? 0,
    glycophosP: src.glycophosP ?? 0,
    kCl: src.kCl ?? 0,
    k2hpo4: src.k2hpo4 ?? 0,
    mgPerKg: src.mgPerKg ?? 0,
    mgStrength: src.mgStrength ?? "10",
    caPerKg: src.caPerKg ?? 0,
    extraP_mg_kg: src.extraP_mg_kg ?? 0,
    enType: src.enType ?? "BM_20",
    enVol: src.enVol ?? 0,
    enFreq: src.enFreq ?? 0,
    isMEN: src.isMEN ?? false,
    inclSoluvit: src.inclSoluvit ?? true,
    inclPeditrace: src.inclPeditrace ?? true,
    // ZnSO₄ added on top of Peditrace, mg elemental Zn/kg/d (TPN team,
    // 2026-09-22). Absent from every entry saved before then: none was added.
    znPerKg: src.znPerKg ?? 0,
    inclAddamel: src.inclAddamel ?? false,
    heparinUmL: src.heparinUmL ?? 1,
    suppVitD: src.suppVitD ?? 0,
    suppCa: src.suppCa ?? 0,
    suppCaType: src.suppCaType ?? "CA_CACO3_350",
    suppPO4: src.suppPO4 ?? 0,
    suppPO4Type: src.suppPO4Type ?? "PO4_PHOSPHATE",
    suppMTV: src.suppMTV ?? false,
    suppFerdek: src.suppFerdek ?? 0,
    suppFeType: src.suppFeType ?? "FE_FERDEK"
  };
}
function calcInputKey(inputs) {
  return JSON.stringify(inputs, Object.keys(inputs || {}).sort());
}
function newOrderDeadVol(src, patient) {
  const v = Number(src?.deadVol_mL);
  return v > 0 ? v : window.NEOFEED_DATA.defaultDeadVolFor(patient);
}
const ORDER_DIFF_FIELDS = [
  ["route", "Route", ""],
  ["fluidTargetPerKg", "Target fluid", "mL/kg/d"],
  ["totalTPN_mL", "TPN volume", "mL/d"],
  ["deadVol_mL", "Dead space", "mL"],
  ["dexPct", "Dextrose", "%"],
  ["aaPerKg", "Amino acid", "g/kg/d"],
  ["aaProduct", "Amino acid product", ""],
  ["lipidPerKg", "SMOF lipid", "g/kg/d"],
  ["lipidDripHours", "Lipid over", "h"],
  ["naCl", "20% NaCl", "mEq/kg/d"],
  ["naAcet", "Na acetate", "mEq/kg/d"],
  ["glycophosP", "Glycophos", "mL/kg/d"],
  ["kCl", "KCl", "mEq/kg/d"],
  ["k2hpo4", "K₂HPO₄", "mEq/kg/d"],
  ["mgPerKg", "MgSO₄", "mEq/kg/d"],
  ["mgStrength", "MgSO₄ vial", "%"],
  ["caPerKg", "Ca gluconate", "mg/kg/d"],
  ["heparinUmL", "Heparin", "U/mL"],
  ["inclSoluvit", "Soluvit", ""],
  ["inclPeditrace", "Peditrace", ""],
  ["znPerKg", "ZnSO₄", "mg Zn/kg/d"],
  ["otherIV_mL", "Other IV", "mL/d"],
  ["drug_mL", "Drug volume", "mL/d"],
  ["enType", "Feed", ""],
  ["enVol", "Feed volume", "mL/feed"],
  ["enFreq", "Feeds", "/d"],
  ["isMEN", "MEN", ""],
  ["suppVitD", "Vit D", "IU/kg/d"],
  ["suppCa", "Oral Ca", "mg/kg/d"],
  ["suppPO4", "Oral PO₄", "mg/kg/d"],
  ["suppFerdek", "Oral Fe", "mg/kg/d"],
  ["suppMTV", "Munti-vim", ""]
];
function describeOrderValue(key, v) {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (key === "enType") return (window.NEOFEED_DATA.EN_DB[v]?.label || v).split(" (")[0];
  if (key === "aaProduct") return window.NEOFEED_DATA.KCMH_STOCK[v]?.short || v;
  if (typeof v === "number" && isFinite(v)) return String(Number(v.toPrecision(12)));
  return String(v);
}
function diffOrderInputs(prev, cur) {
  const out = [];
  for (const [key, label, unit] of ORDER_DIFF_FIELDS) {
    const a = prev[key], b = cur[key];
    if (a === b) continue;
    if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9) continue;
    out.push({ label, from: describeOrderValue(key, a), to: describeOrderValue(key, b), unit });
  }
  return out;
}
const DRAFT_MAX_AGE_MS = 72 * 60 * 60 * 1e3;
const draftStorageKey = (sessionId, dateStr) => `neofeed_draft_${sessionId}_${dateStr}`;
const CALC_STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
function draftOwnerOf(userEmail, userLabel) {
  const email = String(userEmail || "").trim() || (String(userLabel || "").match(/([^\s()<>]+@[^\s()<>]+)/) || [])[1] || "";
  return email.toLowerCase();
}
function savedByOf(entry) {
  const email = String(entry?.lastModifiedBy || entry?.submittedBy || "").trim();
  const label = String(entry?.calcInput?.savedByLabel || "").trim();
  return label && email && draftOwnerOf("", label) === email.toLowerCase() ? label : email;
}
function savedAtLabelOf(at) {
  return at && isFinite(Date.parse(at)) ? new Date(at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}
const isPendingEntryId = (id) => /^(local_)?tmp_/.test(String(id || ""));
function savedDosingWeightOf(entry) {
  const ci = entry?.calcInput || {};
  const num = (v) => {
    const x = Number(v);
    return isFinite(x) ? x : 0;
  };
  if (num(ci.tpnWtG) > 0) return { g: num(ci.tpnWtG), exact: true };
  const dexG = num(ci.totalTPN_mL) * num(ci.dexPct) / 100, gir = num(entry?.gir);
  if (dexG > 0 && gir > 0) return { g: dexG * 1e3 / (1440 * gir) * 1e3, exact: false };
  const enTotal = num(ci.enVol) * num(ci.enFreq), enPerKg = num(entry?.enVolPerKg);
  if (enTotal > 0 && enPerKg > 0) return { g: enTotal / enPerKg * 1e3, exact: false };
  return null;
}
const FIRST_AA_PRODUCT_VERSION = "2026-09-18.1";
function savedCalcVersionOf(entry) {
  const ci = entry?.calcInput;
  if (!ci) return null;
  if (ci.constantsVersion) return String(ci.constantsVersion);
  return Object.prototype.hasOwnProperty.call(ci, "aaProduct") ? FIRST_AA_PRODUCT_VERSION : null;
}
function NumField({
  label,
  unit,
  value,
  onChange,
  step = 1,
  min = 0,
  hint,
  name,
  required = false,
  seedZero = false,
  onBlankChange
}) {
  const typedRef = React.useRef(false);
  const shown = (v) => v || (seedZero || typedRef.current) && v === 0 ? String(v) : "";
  const [raw, setRaw] = React.useState(() => shown(value));
  const focusedRef = React.useRef(false);
  React.useEffect(() => {
    if (focusedRef.current) return;
    setRaw(shown(value));
  }, [value, seedZero]);
  React.useEffect(() => {
    if (!required || !onBlankChange || !name) return;
    onBlankChange(name, raw.trim() === "");
  }, [raw, required, name, onBlankChange]);
  const handle = (e) => {
    let s = e.target.value.replace(/[^0-9.]/g, "");
    const firstDot = s.indexOf(".");
    if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    typedRef.current = s !== "";
    setRaw(s);
    let v = parseFloat(s);
    if (isNaN(v)) v = 0;
    if (min !== void 0 && v < min) v = min;
    onChange(v);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, label, unit && /* @__PURE__ */ React.createElement("span", { className: "unit" }, "(", unit, ")")), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      inputMode: "decimal",
      className: "inp num",
      value: raw,
      placeholder: "0",
      onChange: handle,
      onFocus: (e) => {
        focusedRef.current = true;
        e.target.select();
      },
      onBlur: () => {
        focusedRef.current = false;
        setRaw(shown(value));
      }
    }
  ), hint && /* @__PURE__ */ React.createElement("div", { className: "field-hint", style: { fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 } }, hint));
}
function Chk({ label, value, onChange, hint }) {
  return /* @__PURE__ */ React.createElement("label", { className: "chk-label", style: { display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 6, background: value ? "var(--brand-bg)" : "var(--bg-2)", border: `1px solid ${value ? "var(--brand-line)" : "var(--line-2)"}`, cursor: "pointer", fontSize: 13 } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: value, onChange: (e) => onChange(e.target.checked), style: { marginTop: 2, width: 18, height: 18, flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 500, color: value ? "var(--brand-2)" : "var(--ink)" } }, label), hint && /* @__PURE__ */ React.createElement("span", { className: "chk-hint", style: { display: "block", color: "var(--ink-3)", marginTop: 2, fontSize: 11 } }, hint)));
}
const ZONE_SAMPLES = 120;
function meterZones(statusAt, m) {
  const zones = [];
  const cell = (i) => (i + 0.5) / ZONE_SAMPLES * m;
  let start = 0, prev = statusAt(cell(0));
  for (let i = 1; i < ZONE_SAMPLES; i++) {
    const s = statusAt(cell(i));
    if (s === prev) continue;
    let lo = cell(i - 1), hi = cell(i);
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (statusAt(mid) === prev) lo = mid;
      else hi = mid;
    }
    zones.push({ from: start, to: hi, status: prev });
    start = hi;
    prev = s;
  }
  zones.push({ from: start, to: m, status: prev });
  return zones;
}
function Meter({ value, target, max, optimal, statusAt }) {
  const m = max || target[1] * 1.6;
  const pct = (v) => Math.min(100, Math.max(0, v / m * 100));
  const zones = meterZones(statusAt || ((v) => D.rangeStatus(v, target)), m);
  return /* @__PURE__ */ React.createElement("div", { className: "meter" }, /* @__PURE__ */ React.createElement("div", { className: "meter-track" }, zones.map((z, i) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: i,
      className: `zone z-${z.status}`,
      style: { left: `${pct(z.from)}%`, width: `${pct(z.to) - pct(z.from)}%` }
    }
  )), optimal && /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "zone z-best",
      title: `Optimal: ${optimal[0]}–${optimal[1]}`,
      style: { left: `${pct(optimal[0])}%`, width: `${pct(optimal[1]) - pct(optimal[0])}%` }
    }
  )), Number.isFinite(value) && value !== 0 && /* @__PURE__ */ React.createElement("div", { className: "needle", style: { left: `${pct(value)}%` } }));
}
function Tile({ label, value, unit, decimals = 1, target, status, max, optimal, statusAt }) {
  const display = fmt(value, decimals);
  return /* @__PURE__ */ React.createElement("div", { className: `metric s-${status}` }, /* @__PURE__ */ React.createElement("div", { className: "stripe" }), /* @__PURE__ */ React.createElement("div", { className: "lbl" }, label), /* @__PURE__ */ React.createElement("div", { className: "val" }, display, /* @__PURE__ */ React.createElement("span", { className: "u" }, unit)), target && /* @__PURE__ */ React.createElement(Meter, { value: value || 0, target, max, optimal, statusAt }), target && /* @__PURE__ */ React.createElement("div", { className: "target" }, /* @__PURE__ */ React.createElement("span", null, "Range"), /* @__PURE__ */ React.createElement("span", { className: "range" }, target[0], "–", target[1]), optimal && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ok-ink)", marginLeft: 8, fontSize: 10 } }, "▮ optimal ", optimal[0], "–", optimal[1])));
}
const FLUID_TONE = {
  ok: { bg: "var(--ok-bg)", line: "var(--ok-line)", ink: "var(--ok)" },
  left: { bg: "var(--brand-bg)", line: "var(--brand-line)", ink: "var(--brand-2)" },
  warn: {
    bg: "linear-gradient(180deg, var(--warn-bg), var(--surface) 75%)",
    line: "var(--warn-line)",
    ink: "var(--warn-ink)",
    stripe: "var(--warn)"
  },
  crit: { bg: "var(--crit-bg)", line: "var(--crit)", ink: "var(--crit)" }
};
function MiniReadout({ label, value, unit, fontSize = 13, color = "var(--ink)" }) {
  return /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 10px", background: "var(--bg-2)", borderRadius: 4, display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-3)" } }, label), /* @__PURE__ */ React.createElement("span", { className: "num", style: { fontWeight: 600, fontSize, color } }, value, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "var(--ink-3)", marginLeft: 3 } }, unit)));
}
function SaltRow({ label, note, perKg, onChange, wtKg, unit = "mEq/kg/d", mlPerKg = 0 }) {
  const [raw, setRaw] = React.useState(perKg ? String(perKg) : "");
  const focusedRef = React.useRef(false);
  React.useEffect(() => {
    if (focusedRef.current) return;
    setRaw(perKg ? String(perKg) : "");
  }, [perKg]);
  const handle = (e) => {
    let s = e.target.value.replace(/[^0-9.]/g, "");
    const fd = s.indexOf(".");
    if (fd !== -1) s = s.slice(0, fd + 1) + s.slice(fd + 1).replace(/\./g, "");
    setRaw(s);
    let v = parseFloat(s);
    if (isNaN(v)) v = 0;
    if (v < 0) v = 0;
    onChange(v);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "salt-row-grid", style: { display: "grid", gridTemplateColumns: "1.6fr 1fr 90px", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px dashed var(--line-2)" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--ink)", fontWeight: 500 } }, label), note && /* @__PURE__ */ React.createElement("div", { className: "salt-note", style: { fontSize: 11, color: "var(--ink-3)" } }, note)), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      inputMode: "decimal",
      className: "inp num",
      style: { height: 44 },
      value: raw,
      placeholder: "0",
      onChange: handle,
      onFocus: (e) => {
        focusedRef.current = true;
        e.target.select();
      },
      onBlur: () => {
        focusedRef.current = false;
      }
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", textAlign: "right" } }, wtKg > 0 && perKg > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "num", style: { color: "var(--ink)", fontWeight: 600, fontSize: 12 } }, "= ", fmt(perKg * wtKg, 1)), " ", unit.replace("/kg/d", "/d").replace("/kg", ""), mlPerKg > 0 && /* @__PURE__ */ React.createElement("div", { className: "salt-ml" }, /* @__PURE__ */ React.createElement("span", { className: "num", style: { color: "var(--ink)", fontWeight: 600, fontSize: 12 } }, "= ", fmt(mlPerKg * wtKg, 2)), " mL/d")) : /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ink-4)", fontSize: 10 } }, perKg > 0 ? `${perKg} ${unit.split("/")[0]}/kg` : "—")));
}
function Calculator({
  patient,
  entries,
  dol: dolProp,
  editEntry,
  baselineEntry,
  previousEntry,
  logDate,
  userLabel,
  userEmail,
  onLog,
  onUpdate,
  onPublish,
  onSaved,
  onOrderDate,
  onDelete,
  centerPoint,
  scratch,
  nursing = [],
  ordersReadOnly = false
}) {
  const [newOrderDate, setNewOrderDate] = useState(() => D.todayLocal());
  const orderDateKey = editEntry ? D.normalizeDateStr(editEntry.ts) || D.todayLocal() : logDate || newOrderDate;
  const orderDayRolledOver = !scratch && !editEntry && !logDate && newOrderDate !== D.todayLocal();
  const dol = orderDayRolledOver ? D.dolAtDate(patient, newOrderDate) : dolProp;
  React.useEffect(() => {
    onOrderDate?.(orderDateKey);
  }, [orderDateKey]);
  const orderIsToday = !editEntry && !logDate && !orderDayRolledOver;
  const weightAsOfDol = orderIsToday ? void 0 : dol;
  const draftOwner = draftOwnerOf(userEmail, userLabel);
  const [curWtG, setCurWtG] = useState(0);
  const bwG = patient?.bw || 0;
  const [tpnWtOverrideG, setTpnWtOverrideG] = useState(0);
  const autoWtG = bwG > 0 && curWtG > 0 && curWtG < bwG ? bwG : curWtG;
  const wtG = tpnWtOverrideG > 0 ? tpnWtOverrideG : autoWtG;
  const tpnWtManual = tpnWtOverrideG > 0 && tpnWtOverrideG !== autoWtG;
  const usingBirthWeight = !tpnWtManual && autoWtG === bwG && curWtG > 0 && curWtG < bwG;
  const recordedWeight = D.currentWeight(patient, entries, weightAsOfDol);
  const weightIsRecorded = !!recordedWeight && curWtG > 0 && Math.round(curWtG) === Math.round(recordedWeight.w);
  const weightSourceHint = !weightIsRecorded ? "= น้ำหนักที่กรอกในใบสั่งนี้" : recordedWeight.src === "measured" ? `= น้ำหนักที่ชั่ง (DOL ${recordedWeight.dol})` : `= น้ำหนักในคำสั่ง DOL ${recordedWeight.dol}`;
  const wtKg = wtG / 1e3;
  const IO_FIELD_KEYS = /* @__PURE__ */ new Set(["ioInput", "ioOutput", "drainContent"]);
  const REQUIRED_FIELDS = [
    { key: "fluidTargetPerKg", label: "Target fluid" },
    { key: "otherIV_mL", label: "Other IV" },
    { key: "drug_mL", label: "Drug volume" },
    { key: "curWtG", label: "Current weight" },
    { key: "tpnWtG", label: "TPN calc. weight" },
    { key: "ioInput", label: "Input" },
    { key: "ioOutput", label: "Urine output" },
    { key: "drainContent", label: "Drain content" }
  ].filter((f) => !((centerPoint || scratch) && IO_FIELD_KEYS.has(f.key))).filter(() => !scratch).filter(() => !ordersReadOnly);
  const [blankFields, setBlankFields] = useState(() => new Set(REQUIRED_FIELDS.map((f) => f.key)));
  const reportBlank = React.useCallback((key, isBlank) => {
    setBlankFields((prev) => {
      if (prev.has(key) === isBlank) return prev;
      const next = new Set(prev);
      if (isBlank) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const missingFields = REQUIRED_FIELDS.filter((f) => blankFields.has(f.key));
  const seededZeros = React.useMemo(() => {
    const keys = /* @__PURE__ */ new Set();
    if (!editEntry) return keys;
    const ci = editEntry.calcInput || {};
    const recorded = (v) => v !== void 0 && v !== null && v !== "";
    const weight = ci.curWtG ?? ci.wtG ?? editEntry.weight;
    const carried = {
      fluidTargetPerKg: ci.fluidTargetPerKg,
      otherIV_mL: ci.otherIV_mL,
      drug_mL: ci.drug_mL,
      curWtG: weight,
      tpnWtG: weight
    };
    const draftBlank = new Set(Array.isArray(ci.blankFields) ? ci.blankFields : []);
    Object.keys(carried).forEach((k) => {
      if (recorded(carried[k]) && !draftBlank.has(k)) keys.add(k);
    });
    ["ioInput", "ioOutput", "drainContent"].forEach((k) => {
      if (draftBlank.has(k)) return;
      if (recorded(ci[k]) || recorded(editEntry[k]) && Number(editEntry[k]) !== 0) keys.add(k);
    });
    return keys;
  }, [editEntry]);
  const [nursingApplied, setNursingApplied] = useState(null);
  const seedsZero = (key) => seededZeros.has(key) || !!nursingApplied?.keys?.has(key);
  const releaseNursingKey = (key) => setNursingApplied((prev) => {
    if (!prev?.keys?.has(key)) return prev;
    const keys = new Set(prev.keys);
    keys.delete(key);
    return keys.size ? { ...prev, keys } : null;
  });
  const [ioGen, setIoGen] = useState(0);
  const nursingServed = Array.isArray(nursing);
  const [fluidTargetPerKg, setFluidTargetPerKg] = useState(0);
  const [otherIV_mL, setOtherIV_mL] = useState(0);
  const [drug_mL, setDrug_mL] = useState(0);
  const [ioInput, setIoInput] = useState(0);
  const [ioInputTouched, setIoInputTouched] = useState(false);
  const ioInputTouchedRef = React.useRef(false);
  const markIoInputTouched = (v) => {
    ioInputTouchedRef.current = v;
    setIoInputTouched(v);
  };
  const [ioOutput, setIoOutput] = useState(0);
  const [drainContent, setDrainContent] = useState(0);
  const [route, setRoute] = useState("central");
  const [totalTPN_mL, setTotalTPN_mL] = useState(0);
  const [deadVol_mL, setDeadVol_mL] = useState(0);
  const [dexPct, setDexPct] = useState(0);
  const [aaPerKg, setAaPerKg] = useState(0);
  const [aaProduct, setAaProduct] = useState("aminoven10");
  const [lipidPerKg, setLipidPerKg] = useState(0);
  const [lipidDripHours, setLipidDripHours] = useState(24);
  const [naCl, setNaCl] = useState(0);
  const [naAcet, setNaAcet] = useState(0);
  const [glycophosP, setGlycophosP] = useState(0);
  const [kCl, setKCl] = useState(0);
  const [k2hpo4, setK2HPO4] = useState(0);
  const [mgPerKg, setMgPerKg] = useState(0);
  const [mgStrength, setMgStrength] = useState("10");
  const [caPerKg, setCaPerKg] = useState(0);
  const [extraP_mg_kg, setExtraP_mg_kg] = useState(0);
  const [enType, setEnType] = useState("BM_20");
  const [enVol, setEnVol] = useState(0);
  const [enFreq, setEnFreq] = useState(0);
  const [isMEN, setIsMEN] = useState(false);
  const [inclSoluvit, setInclSoluvit] = useState(true);
  const [inclPeditrace, setInclPeditrace] = useState(true);
  const [znPerKg, setZnPerKg] = useState(0);
  const [inclAddamel, setInclAddamel] = useState(false);
  const [heparinUmL, setHeparinUmL] = useState(1);
  const [suppVitD, setSuppVitD] = useState(0);
  const [suppCa, setSuppCa] = useState(0);
  const [suppCaType, setSuppCaType] = useState("CA_CACO3_350");
  const [suppPO4, setSuppPO4] = useState(0);
  const [suppPO4Type, setSuppPO4Type] = useState("PO4_PHOSPHATE");
  const [suppMTV, setSuppMTV] = useState(false);
  const [suppFerdek, setSuppFerdek] = useState(0);
  const [suppFeType, setSuppFeType] = useState("FE_FERDEK");
  const [openSteps, setOpenSteps] = useState(/* @__PURE__ */ new Set([1]));
  const [prefilledFrom, setPrefilledFrom] = useState(null);
  const [savedEntryId, setSavedEntryId] = useState(editEntry?.entryId || null);
  const [savedLastModified, setSavedLastModified] = useState(editEntry?.lastModified || null);
  const [savedStatus, setSavedStatus] = useState(editEntry ? D.isDraftEntry(editEntry) ? "draft" : "submitted" : null);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(!!editEntry?.published);
  const [publishing, setPublishing] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [savedKey, setSavedKey] = useState(null);
  const [prefillKey, setPrefillKey] = useState(null);
  const [savedMeta, setSavedMeta] = useState(null);
  const [critOverride, setCritOverride] = useState(editEntry?.calcInput?.critOverride || null);
  const [draftOffer, setDraftOffer] = useState(null);
  const [savedDosingWt, setSavedDosingWt] = useState(null);
  const [savedCalcVersion, setSavedCalcVersion] = useState(null);
  const fluidMidpoint = (weightG) => {
    const r = D.TARGETS.fluid(dol, weightG || patient?.bw || 1e3, patient?.bw);
    return Math.round((r[0] + r[1]) / 2);
  };
  const applyCalcInput = (src, fallbackWeight, ioTouched = true, fallbackFluid) => {
    const n = normalizeCalcInput(src, fallbackWeight, fallbackFluid);
    setCurWtG(n.curWtG);
    setTpnWtOverrideG(n.tpnWtOverrideG);
    setFluidTargetPerKg(n.fluidTargetPerKg);
    setOtherIV_mL(n.otherIV_mL);
    setDrug_mL(n.drug_mL);
    setIoInput(n.ioInput);
    markIoInputTouched(ioTouched);
    setIoOutput(n.ioOutput);
    setDrainContent(n.drainContent);
    setRoute(n.route);
    setTotalTPN_mL(n.totalTPN_mL);
    setDeadVol_mL(n.deadVol_mL);
    setDexPct(n.dexPct);
    setAaPerKg(n.aaPerKg);
    setAaProduct(n.aaProduct);
    setLipidPerKg(n.lipidPerKg);
    setLipidDripHours(n.lipidDripHours);
    setNaCl(n.naCl);
    setNaAcet(n.naAcet);
    setGlycophosP(n.glycophosP);
    setKCl(n.kCl);
    setK2HPO4(n.k2hpo4);
    setMgPerKg(n.mgPerKg);
    setMgStrength(n.mgStrength);
    setCaPerKg(n.caPerKg);
    setExtraP_mg_kg(n.extraP_mg_kg);
    setEnType(n.enType);
    setEnVol(n.enVol);
    setEnFreq(n.enFreq);
    setIsMEN(n.isMEN);
    setInclSoluvit(n.inclSoluvit);
    setInclPeditrace(n.inclPeditrace);
    setZnPerKg(n.znPerKg);
    setInclAddamel(n.inclAddamel);
    setHeparinUmL(n.heparinUmL);
    setSuppVitD(n.suppVitD);
    setSuppCa(n.suppCa);
    setSuppCaType(n.suppCaType);
    setSuppPO4(n.suppPO4);
    setSuppPO4Type(n.suppPO4Type);
    setSuppMTV(n.suppMTV);
    setSuppFerdek(n.suppFerdek);
    setSuppFeType(n.suppFeType);
    setPrefillKey(calcInputKey({ ...n, ioInput: ioTouched ? n.ioInput : null }));
    return n;
  };
  const withEntryIO = (entry) => {
    const src = { ...entry?.calcInput || {} };
    if (entry?.ioInput != null) src.ioInput = entry.ioInput;
    if (entry?.ioOutput != null) src.ioOutput = entry.ioOutput;
    if (entry?.drainContent != null) src.drainContent = entry.drainContent;
    return src;
  };
  const applyNursingIO = (dateKey) => {
    if (!nursingServed) return false;
    setIoGen((g) => g + 1);
    const rec = D.nursingRecordOn(nursing, dateKey);
    const dropped = (key) => !!nursingApplied?.keys?.has(key);
    const keys = /* @__PURE__ */ new Set();
    const intake = rec ? D.nursingIntakeMl(rec) : null;
    if (intake != null) {
      setIoInput(intake);
      markIoInputTouched(true);
      keys.add("ioInput");
    } else if (dropped("ioInput")) markIoInputTouched(false);
    if (rec?.urineMl != null) {
      setIoOutput(Number(rec.urineMl));
      keys.add("ioOutput");
    } else if (dropped("ioOutput")) setIoOutput(0);
    if (rec?.drainMl != null) {
      setDrainContent(Number(rec.drainMl));
      keys.add("drainContent");
    } else if (dropped("drainContent")) setDrainContent(0);
    if (!keys.size) {
      setNursingApplied(null);
      return false;
    }
    const partialIntake = intake == null && (rec.ivInMl != null || rec.enInMl != null);
    setNursingApplied({ date: D.normalizeDateStr(rec.ts), keys, rec, partialIntake });
    return true;
  };
  const formIdentity = `${patient?.sessionId || "?"}·${orderDateKey}·${editEntry?.entryId || "new"}`;
  React.useEffect(() => {
    if (centerPoint || scratch) return;
    try {
      const now = Date.now(), doomed = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        const maxAge = k.startsWith("neofeed_draft_") ? DRAFT_MAX_AGE_MS : k.startsWith("neofeed_calc_") ? CALC_STATE_MAX_AGE_MS : 0;
        if (!maxAge) continue;
        let at = NaN;
        try {
          at = Date.parse(JSON.parse(localStorage.getItem(k))?.savedAt || "");
        } catch {
        }
        if (!isFinite(at) || now - at > maxAge) doomed.push(k);
      }
      doomed.forEach((k) => localStorage.removeItem(k));
    } catch {
    }
  }, []);
  React.useEffect(() => {
    if (scratch) {
      applyCalcInput({ deadVol_mL: D.defaultDeadVolFor(null) }, 0, false, 0);
      setSavedKey(null);
      setPrefilledFrom(null);
      setDraftOffer(null);
      return;
    }
    if (!patient?.sessionId) return;
    setNursingApplied(null);
    const openedOn = D.todayLocal();
    if (!editEntry && !logDate) setNewOrderDate(openedOn);
    const dateKey = editEntry ? D.normalizeDateStr(editEntry.ts) || openedOn : logDate || openedOn;
    setSavedEntryId(editEntry?.entryId || null);
    setSavedLastModified(editEntry?.lastModified || null);
    setSavedStatus(editEntry ? D.isDraftEntry(editEntry) ? "draft" : "submitted" : null);
    setConflict(null);
    setCritOverride(editEntry?.calcInput?.critOverride || null);
    setSavedMeta(editEntry ? {
      by: savedByOf(editEntry),
      at: editEntry.lastModified || "",
      revision: editEntry.revisionNumber || 1
    } : null);
    setSavedDosingWt(editEntry ? savedDosingWeightOf(editEntry) : null);
    setSavedCalcVersion(editEntry ? savedCalcVersionOf(editEntry) : null);
    setDraftOffer(null);
    if (!centerPoint) try {
      const dk = draftStorageKey(patient.sessionId, dateKey);
      const raw = localStorage.getItem(dk);
      if (raw) {
        const draft = JSON.parse(raw);
        const at = Date.parse(draft?.savedAt || "");
        const mine = !!draftOwner && draft?.by === draftOwner;
        if (!mine || !isFinite(at) || Date.now() - at > DRAFT_MAX_AGE_MS) localStorage.removeItem(dk);
        else setDraftOffer(draft);
      }
    } catch {
    }
    if (editEntry) {
      const src = withEntryIO(editEntry);
      const n = applyCalcInput(src, editEntry.weight, true, fluidMidpoint(src.curWtG ?? src.wtG ?? editEntry.weight));
      setSavedKey(calcInputKey(n));
      setPrefilledFrom(null);
      return;
    }
    setSavedKey(null);
    const NEW_DAY_IO = { ioInput: 0, ioOutput: 0, drainContent: 0 };
    if (baselineEntry) {
      const base = { ...withEntryIO(baselineEntry), ...NEW_DAY_IO };
      const src = { ...base, deadVol_mL: newOrderDeadVol(base, patient) };
      const baselineWeight = src.curWtG ?? src.wtG ?? baselineEntry.weight;
      const recorded2 = D.currentWeight(patient, entries, weightAsOfDol);
      const startWeight = recorded2 ? recorded2.w : baselineWeight;
      applyCalcInput({ ...src, curWtG: startWeight }, startWeight, false, fluidMidpoint(startWeight));
      setPrefilledFrom({
        dol: D.entryDol(patient, baselineEntry),
        baseline: true,
        ...recorded2 && Math.round(recorded2.w) !== Math.round(baselineWeight) ? { weightFrom: { dol: recorded2.dol, w: recorded2.w, src: recorded2.src }, weightWas: baselineWeight } : {}
      });
      return;
    }
    let restored = null;
    if (!logDate && !centerPoint) {
      try {
        const raw = localStorage.getItem(`neofeed_calc_${patient.sessionId}`);
        if (raw) restored = JSON.parse(raw);
        const at = Date.parse(restored?.savedAt || "");
        if (restored && (!isFinite(at) || Date.now() - at > CALC_STATE_MAX_AGE_MS)) {
          restored = null;
          localStorage.removeItem(`neofeed_calc_${patient.sessionId}`);
        }
      } catch {
      }
    }
    const recorded = D.currentWeight(patient, entries, weightAsOfDol);
    const wtDefault = recorded?.w ?? restored?.curWtG ?? restored?.wtG ?? patient.bw ?? 0;
    const fresh = restored ? { ...restored, ...NEW_DAY_IO } : {};
    applyCalcInput({ ...fresh, curWtG: wtDefault, deadVol_mL: newOrderDeadVol(fresh, patient) }, wtDefault, false, fluidMidpoint(wtDefault));
    if (restored?.savedAt) {
      setPrefilledFrom({ savedAt: restored.savedAt });
    } else {
      setPrefilledFrom(null);
    }
  }, [patient?.sessionId, editEntry]);
  const aaChoices = centerPoint || scratch ? ["aminoven10"] : D.aaProductsFor(patient);
  const aaStockKey = aaChoices.includes(aaProduct) ? aaProduct : aaChoices[0];
  const currentInputs = () => normalizeCalcInput({
    curWtG,
    tpnWtOverrideG,
    fluidTargetPerKg,
    otherIV_mL,
    drug_mL,
    ioInput,
    ioOutput,
    drainContent,
    route,
    totalTPN_mL,
    deadVol_mL,
    dexPct,
    aaPerKg,
    aaProduct: aaStockKey,
    lipidPerKg,
    lipidDripHours,
    naCl,
    naAcet,
    glycophosP,
    kCl,
    k2hpo4,
    mgPerKg,
    mgStrength,
    caPerKg,
    extraP_mg_kg,
    enType,
    enVol,
    enFreq,
    isMEN,
    inclSoluvit,
    inclPeditrace,
    znPerKg,
    inclAddamel,
    heparinUmL,
    suppVitD,
    suppCa,
    suppCaType,
    suppPO4,
    suppPO4Type,
    suppMTV,
    suppFerdek,
    suppFeType
  });
  const captureState = () => ({ ...currentInputs(), dol, savedAt: (/* @__PURE__ */ new Date()).toISOString() });
  const liveInputs = currentInputs();
  const formKey = calcInputKey(liveInputs);
  const dirty = savedKey === null || formKey !== savedKey;
  const pendingSave = isPendingEntryId(savedEntryId);
  const userKey = calcInputKey({ ...liveInputs, ioInput: ioInputTouched ? ioInput : null });
  const userEdited = prefillKey !== null && userKey !== prefillKey && formKey !== savedKey;
  const writeDraft = (inputs) => {
    if (centerPoint || scratch || ordersReadOnly || !patient?.sessionId) return;
    try {
      localStorage.setItem(
        draftStorageKey(patient.sessionId, orderDateKey),
        JSON.stringify({
          ...inputs,
          dol,
          savedAt: (/* @__PURE__ */ new Date()).toISOString(),
          by: draftOwner,
          baseLastModified: savedLastModified || null
        })
      );
    } catch {
    }
  };
  React.useEffect(() => {
    if (!userEdited) return;
    writeDraft(liveInputs);
  }, [userKey, userEdited]);
  const clearDraft = () => {
    if (centerPoint || scratch || ordersReadOnly || !patient?.sessionId) return;
    try {
      localStorage.removeItem(draftStorageKey(patient.sessionId, orderDateKey));
    } catch {
    }
  };
  const draftIsStale = !!(draftOffer && editEntry && (draftOffer.baseLastModified || null) !== (editEntry.lastModified || null));
  const restoreDraft = () => {
    if (!draftOffer) return;
    setNursingApplied(null);
    const n = applyCalcInput(draftOffer, curWtG, true, fluidTargetPerKg);
    writeDraft(n);
    setDraftOffer(null);
  };
  const orderChanges = useMemo(() => {
    if (!previousEntry?.calcInput) return null;
    return diffOrderInputs(normalizeCalcInput(previousEntry.calcInput, previousEntry.weight, 0), liveInputs);
  }, [previousEntry, formKey]);
  const toggleStep = (n) => setOpenSteps((prev) => {
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });
  const calc = useMemo(() => {
    if (!wtKg) {
      const en0 = D.EN_DB[enType];
      const sv0 = {
        naCl: 0,
        naAcet: 0,
        glycophos: 0,
        kCl: 0,
        k2hpo4: 0,
        ca: 0,
        mg: 0,
        mg10: 0,
        mg50: 0,
        heparin: 0,
        aa: 0,
        lipidSMOF: 0
      };
      return {
        wtKg: 0,
        totalTPN_mL,
        lipidVol: 0,
        lipidBagVol: 0,
        vitalipidVol: 0,
        enVolTotal: 0,
        enVolPerKg: 0,
        enKcal: 0,
        enCounted: 0,
        en: en0,
        useEnteralTargets: false,
        enFeedKg: { kcal: 0, pro: 0, na: 0, k: 0, ca: 0, p: 0 },
        aaStockKey,
        prescribedFluid: 0,
        totalFluidPerKg: 0,
        remaining: 0,
        gir: 0,
        dexG: 0,
        aaG: 0,
        lipidG: 0,
        naKg: 0,
        kKg: 0,
        caKg: 0,
        pKg: 0,
        caP: 0,
        caFromEN: 0,
        pFromEN: 0,
        naTotalDelivered: 0,
        kTotalDelivered: 0,
        proteinKg: 0,
        lipidKgTotal: 0,
        kcalKg: 0,
        totalKcal: 0,
        tpnKcal: 0,
        kcalProtPct: 0,
        kcalFatPct: 0,
        kcalChoPct: 0,
        npeN: 0,
        peRatio: 0,
        osm: 300,
        pTotal_mg: 0,
        p_glycophos: 0,
        p_k2hpo4: 0,
        na_glycophos: 0,
        isMEN,
        d50wVol: 0,
        soluvitVol: 0,
        peditrace_vol: 0,
        solVol: sv0,
        componentVol: 0,
        wfiVol: 0,
        dexGPerKg: 0,
        kMeqPerL: 0,
        mgStrength,
        preparedVol: totalTPN_mL > 0 ? totalTPN_mL + deadVol_mL : 0,
        deadVol_mL,
        overfill: 1,
        factor: 0,
        deliveredFrac: 1,
        dexG_bag: 0,
        aaG_bag: 0,
        bag: { na_mEq: 0, k_mEq: 0, ca_mg: 0, mg_mEq: 0, p_mg: 0, heparin_units: 0 },
        znPeditrace_mg: 0,
        znSO4_mg: 0,
        znSO4_bag_mg: 0,
        znTotal_mg: 0
      };
    }
    const preparedVol = totalTPN_mL > 0 ? totalTPN_mL + deadVol_mL : 0;
    const overfill = totalTPN_mL > 0 ? preparedVol / totalTPN_mL : 1;
    const factor = wtKg * overfill;
    const deliveredFrac = overfill > 0 ? 1 / overfill : 1;
    const aaG = aaPerKg * wtKg;
    const aaG_bag = aaPerKg * factor;
    const lipidG = lipidPerKg * wtKg;
    const lipidVol = lipidG / 0.2;
    const vitalipidVol = lipidPerKg > 0 ? Math.min(4 * wtKg, 10) : 0;
    const lipidBagVol = lipidVol + vitalipidVol;
    const dexG = totalTPN_mL * dexPct / 100;
    const dexG_bag = preparedVol * dexPct / 100;
    const gir = dexG * 1e3 / (1440 * wtKg);
    const na_glycophos = glycophosP * 2;
    const p_glycophos = glycophosP * wtKg * 31;
    const p_k2hpo4 = k2hpo4 * wtKg * 15.5;
    const pTotal_mg = p_glycophos + p_k2hpo4 + extraP_mg_kg * wtKg;
    const naKg = naCl + naAcet + na_glycophos;
    const kKg = kCl + k2hpo4;
    const pKg_tpn = pTotal_mg / wtKg;
    const en = D.EN_DB[enType];
    const enVolTotal = enVol * enFreq;
    const enVolPerKg = enVolTotal / wtKg;
    const enCounted = isMEN ? 0 : enVolTotal;
    const enKcal = enCounted / 100 * en.kcal;
    const enProteinG = enCounted / 100 * en.pro;
    const enLipidG = enCounted / 100 * en.fat;
    const useEnteralTargets = enCounted / wtKg >= 100;
    const enFeedKg = {
      kcal: enVolTotal / 100 * en.kcal / wtKg,
      pro: enVolTotal / 100 * en.pro / wtKg,
      na: enVolTotal / 100 * en.na / wtKg,
      k: enVolTotal / 100 * en.k / wtKg,
      ca: enVolTotal / 100 * en.ca / wtKg,
      p: enVolTotal / 100 * en.p / wtKg
    };
    const targetFluid_mLd = fluidTargetPerKg * wtKg;
    const prescribedFluid = totalTPN_mL + lipidBagVol + otherIV_mL + drug_mL + enCounted;
    const remaining = targetFluid_mLd - prescribedFluid;
    const totalFluidPerKg = prescribedFluid / wtKg;
    const dexKcal = dexG * 3.4;
    const aaKcal = aaG * 4;
    const lipidKcal = lipidG * 9;
    const tpnKcal = dexKcal + aaKcal + lipidKcal;
    const totalKcal = tpnKcal + enKcal;
    const kcalKg = totalKcal / wtKg;
    const totalProteinG = aaG + enProteinG;
    const proteinKg = totalProteinG / wtKg;
    const totalLipidG = lipidG + enLipidG;
    const lipidKgTotal = totalLipidG / wtKg;
    const kcalCho = (dexKcal + enCounted / 100 * en.cho * 4) / wtKg;
    const kcalPro = (aaKcal + enProteinG * 4) / wtKg;
    const kcalFat = (lipidKcal + enLipidG * 9) / wtKg;
    const kcalProtPct = kcalKg > 0 ? kcalPro / kcalKg * 100 : 0;
    const kcalFatPct = kcalKg > 0 ? kcalFat / kcalKg * 100 : 0;
    const kcalChoPct = kcalKg > 0 ? kcalCho / kcalKg * 100 : 0;
    const nonProteinKcal = totalKcal - totalProteinG * 4;
    const npeN = totalProteinG > 0 ? nonProteinKcal / totalProteinG : 0;
    const peRatio = totalKcal > 0 ? totalProteinG / totalKcal * 100 : 0;
    const naFromEN = en.na * enCounted / 100 / wtKg;
    const kFromEN = en.k * enCounted / 100 / wtKg;
    const caFromEN = en.ca * enCounted / 100 / wtKg;
    const pFromEN = en.p * enCounted / 100 / wtKg;
    const totalCaMg_combined = (caPerKg + caFromEN) * wtKg;
    const totalPMg_combined = pTotal_mg + pFromEN * wtKg;
    const caP = totalPMg_combined > 0 ? totalCaMg_combined / totalPMg_combined : totalCaMg_combined > 0 ? Infinity : 0;
    const d50wVol = dexG_bag > 0 ? parseFloat((dexG_bag / S.d50w.gPerMl).toFixed(1)) : 0;
    const soluvitVol = inclSoluvit && totalTPN_mL > 0 ? parseFloat((Math.min(S.soluvit.mlPerKg * wtKg, S.soluvit.maxMl) * overfill).toFixed(1)) : 0;
    const peditrace_vol = inclPeditrace && totalTPN_mL > 0 ? parseFloat((Math.min(S.peditrace.mlPerKg * wtKg, S.peditrace.maxMl) * overfill).toFixed(1)) : 0;
    const znPeditrace_mg = inclPeditrace && totalTPN_mL > 0 ? Math.min(S.peditrace.mlPerKg * wtKg, S.peditrace.maxMl) * S.peditrace.znMgPerMl : 0;
    const znSO4_mg = znPerKg * wtKg;
    const znSO4_bag_mg = znPerKg * factor;
    const znTotal_mg = znPeditrace_mg + znSO4_mg;
    const r1 = (n) => parseFloat(n.toFixed(1));
    const r2 = (n) => parseFloat(n.toFixed(2));
    const mgStock = mgStrength === "50" ? S.mgso4_50 : S.mgso4_10;
    const solVol = {
      naCl: naCl > 0 ? r1(naCl * factor / S.naCl.naMeqPerMl) : 0,
      // 20% NaCl
      naAcet: naAcet > 0 ? r1(naAcet * factor / S.naAcetate.naMeqPerMl) : 0,
      // Na Acetate
      glycophos: r1(glycophosP * factor),
      // 1 mL = 1 mmol P
      kCl: kCl > 0 ? r1(kCl * factor / S.kCl.kMeqPerMl) : 0,
      // KCl
      k2hpo4: k2hpo4 > 0 ? r2(k2hpo4 * factor / S.k2hpo4.kMeqPerMl) : 0,
      // K₂HPO₄
      ca: caPerKg > 0 ? r1(caPerKg * factor / S.caGluconate.caMgPerMl) : 0,
      // 10% Ca gluconate
      mg: mgPerKg > 0 ? r2(mgPerKg * factor / mgStock.mgMeqPerMl) : 0,
      // MgSO₄ (chosen strength)
      // Both Mg strengths, so the pharmacy label can show the alternative
      mg10: mgPerKg > 0 ? r2(mgPerKg * factor / S.mgso4_10.mgMeqPerMl) : 0,
      mg50: mgPerKg > 0 ? r2(mgPerKg * factor / S.mgso4_50.mgMeqPerMl) : 0,
      // Heparin is dosed per mL of bag (sheet G51 = F51 × G7), so prepared volume
      heparin: heparinUmL > 0 ? r2(heparinUmL * preparedVol / S.heparin.unitsPerMl) : 0,
      aa: r1(aaG_bag / S[aaStockKey].gPerMl),
      // amino acid, chosen stock (aaStockKey)
      lipidSMOF: r1(lipidG / S.smof20.gPerMl)
      // separate syringe — no overfill
    };
    const bag = {
      na_mEq: (naCl + naAcet + glycophosP * S.glycophos.naMeqPerMl) * factor,
      k_mEq: (kCl + k2hpo4) * factor,
      ca_mg: caPerKg * factor,
      mg_mEq: mgPerKg * factor,
      p_mg: (glycophosP * S.glycophos.pMgPerMl + k2hpo4 * S.k2hpo4.pMgPerKMeq + extraP_mg_kg) * factor,
      heparin_units: heparinUmL * preparedVol
    };
    const componentVol = parseFloat((d50wVol + solVol.aa + solVol.naCl + solVol.naAcet + solVol.glycophos + solVol.k2hpo4 + solVol.kCl + solVol.mg + solVol.ca + soluvitVol + peditrace_vol + solVol.heparin).toFixed(1));
    const wfiVol = parseFloat((preparedVol - componentVol).toFixed(1));
    const dexGPerKg = dexG / wtKg;
    const kMeqPerL = preparedVol > 0 ? bag.k_mEq / (preparedVol / 1e3) : 0;
    const osm = D.estimateOsmolarity({
      dexPct,
      aaPct: aaG > 0 && totalTPN_mL > 0 ? aaG / totalTPN_mL * 100 : 0,
      naMeqPerL: totalTPN_mL > 0 ? naKg * wtKg / (totalTPN_mL / 1e3) : 0,
      kMeqPerL,
      caMgPerL: totalTPN_mL > 0 ? caPerKg * wtKg / (totalTPN_mL / 1e3) : 0,
      // elemental Ca mg/L
      mgMeqPerL: totalTPN_mL > 0 ? mgPerKg * wtKg / (totalTPN_mL / 1e3) : 0
      // Mg mEq/L
    });
    return {
      wtKg,
      totalTPN_mL,
      lipidVol,
      lipidBagVol,
      vitalipidVol,
      enVolTotal,
      enVolPerKg,
      enKcal,
      enCounted,
      en,
      useEnteralTargets,
      enFeedKg,
      aaStockKey,
      prescribedFluid,
      totalFluidPerKg,
      remaining,
      gir,
      dexG,
      aaG,
      lipidG,
      naKg,
      kKg,
      caKg: caPerKg + caFromEN,
      pKg: pKg_tpn + pFromEN,
      caP,
      caFromEN,
      pFromEN,
      naTotalDelivered: naKg + naFromEN,
      kTotalDelivered: kKg + kFromEN,
      proteinKg,
      lipidKgTotal,
      kcalKg,
      totalKcal,
      tpnKcal,
      kcalProtPct,
      kcalFatPct,
      kcalChoPct,
      npeN,
      peRatio,
      osm,
      pTotal_mg,
      p_glycophos,
      p_k2hpo4,
      na_glycophos,
      isMEN,
      d50wVol,
      soluvitVol,
      peditrace_vol,
      solVol,
      componentVol,
      wfiVol,
      dexGPerKg,
      kMeqPerL,
      mgStrength,
      // Prepared-vs-delivered (the Factor)
      preparedVol,
      deadVol_mL,
      overfill,
      factor,
      deliveredFrac,
      dexG_bag,
      aaG_bag,
      bag,
      znPeditrace_mg,
      znSO4_mg,
      znSO4_bag_mg,
      znTotal_mg
    };
  }, [
    wtG,
    wtKg,
    fluidTargetPerKg,
    otherIV_mL,
    drug_mL,
    totalTPN_mL,
    deadVol_mL,
    dexPct,
    aaPerKg,
    aaStockKey,
    lipidPerKg,
    naCl,
    naAcet,
    glycophosP,
    kCl,
    k2hpo4,
    mgPerKg,
    mgStrength,
    caPerKg,
    extraP_mg_kg,
    enType,
    enVol,
    enFreq,
    isMEN,
    // `route` is deliberately NOT a dependency — the memo never reads it. It is
    // used afterwards for sOsm and the saved entry's route string. Listing it
    // recomputed the whole memo on every central/peripheral toggle.
    inclSoluvit,
    inclPeditrace,
    znPerKg,
    heparinUmL
  ]);
  React.useEffect(() => {
    if (ioInputTouchedRef.current) return;
    setIoInput(Math.round(calc.prescribedFluid) || 0);
  }, [calc.prescribedFluid, ioInputTouched]);
  const ioDivisor = D.ioDivisorG(patient, dol, curWtG, entries);
  const ioDivisorGVal = ioDivisor.g;
  const ioDivisorKg = ioDivisorGVal ? ioDivisorGVal / 1e3 : null;
  const ioInputPerKg = ioDivisorKg ? ioInput / ioDivisorKg : null;
  const ioOutputPerKgH = ioDivisorKg ? Math.round(ioOutput / ioDivisorKg / 24 * 100) / 100 : null;
  const ioDrainPerKg = ioDivisorKg ? drainContent / ioDivisorKg : null;
  const ioBalance = ioInput - ioOutput - drainContent;
  const nursingForDate = nursingServed && !centerPoint && !scratch && !editEntry ? D.nursingRecordOn(nursing, orderDateKey) : null;
  const nursingTaken = (r) => r ? [D.nursingIntakeMl(r), r.urineMl ?? null, r.drainMl ?? null].join("|") : "";
  const nursingChanged = !!nursingApplied && nursingServed && !editEntry && nursingTaken(D.nursingRecordOn(nursing, nursingApplied.date)) !== nursingTaken(nursingApplied.rec);
  const mineral = useMemo(() => {
    const ratio = (ca, p) => p > 0 ? ca / p : ca > 0 ? Infinity : 0;
    const tpnCa = caPerKg, tpnP = calc.pTotal_mg > 0 && wtKg > 0 ? calc.pTotal_mg / wtKg : 0;
    const enCa = calc.caFromEN, enP = calc.pFromEN;
    const oralCa = suppCa, oralP = suppPO4;
    const ivCa = tpnCa + enCa, ivP = tpnP + enP;
    const totCa = ivCa + oralCa, totP = ivP + oralP;
    return {
      tpnCa,
      tpnP,
      tpnCaP: ratio(tpnCa, tpnP),
      enCa,
      enP,
      oralCa,
      oralP,
      oralCaP: ratio(oralCa, oralP),
      ivCa,
      ivP,
      ivCaP: ratio(ivCa, ivP),
      totCa,
      totP,
      totCaP: ratio(totCa, totP),
      hasOral: oralCa > 0 || oralP > 0,
      hasIV: ivCa > 0 || ivP > 0
    };
  }, [caPerKg, suppCa, suppPO4, wtKg, calc.pTotal_mg, calc.caFromEN, calc.pFromEN]);
  const stepStatus = {
    1: fluidTargetPerKg > 0 && Math.abs(calc.remaining) < 20 ? "done" : "partial",
    2: totalTPN_mL > 0 && dexPct > 0 && aaPerKg > 0 ? "done" : totalTPN_mL > 0 || dexPct > 0 || aaPerKg > 0 ? "partial" : "empty",
    3: naCl + naAcet + glycophosP + kCl + caPerKg + mgPerKg > 0 ? "done" : "empty",
    4: "done",
    // vitamins/TE always defaulted
    5: calc.enVolPerKg >= 100 ? "done" : calc.enVolPerKg > 0 ? "partial" : "empty"
  };
  const useEN = calc.useEnteralTargets;
  const T = useEN ? D.ENTERAL_TARGETS : D.TPN_TARGETS;
  const tFluid = D.TARGETS.fluid(dol, wtG, patient?.bw);
  const tGir = D.TARGETS.gir();
  const tPro = T.protein(dol);
  const tKcal = T.kcal(dol);
  const tLip = T.lipid(dol);
  const tNa = T.na(dol);
  const tK = T.k(dol);
  const tCa = T.ca(dol, calc.useEnteralTargets);
  const tP = T.p(dol, calc.useEnteralTargets);
  const tCaP = D.TARGETS.caP();
  const tMg = D.TARGETS.mg(dol);
  const tNPE = D.TARGETS.npePerGAA();
  const tPE = D.TARGETS.peRatio();
  const sFluid = D.rangeStatus(calc.totalFluidPerKg, tFluid);
  const fluidTone = Math.abs(calc.remaining) < 1 ? "ok" : calc.remaining < -10 ? "crit" : calc.remaining <= -1 ? "warn" : "left";
  const GIR_HARD = { hardHi: D.GIR_HARD_HI };
  const PRO_HARD = { hardHi: 4.8 };
  const girStatusAt = (v) => D.rangeStatus(v, tGir, GIR_HARD);
  const proStatusAt = (v) => D.rangeStatus(v, tPro, PRO_HARD);
  const sGir = girStatusAt(calc.gir);
  const sPro = proStatusAt(calc.proteinKg);
  const kcalStatusAt = (v) => D.rangeStatus(v, tKcal, { hardHi: D.KCAL_HARD_HI });
  const sKcal = kcalStatusAt(calc.kcalKg);
  const sLip = D.rangeStatus(calc.lipidKgTotal, tLip);
  const sNa = D.rangeStatus(calc.naTotalDelivered, tNa);
  const sK = D.rangeStatus(calc.kTotalDelivered, tK);
  const sCa = D.rangeStatus(calc.caKg, tCa);
  const sP = D.rangeStatus(calc.pKg, tP);
  const sCaP = D.rangeStatus(calc.caP, tCaP);
  const sMg = D.rangeStatus(mgPerKg, tMg);
  const sTotCa = D.rangeStatus(mineral.totCa, tCa);
  const sTotP = D.rangeStatus(mineral.totP, tP);
  const sTotCaP = D.rangeStatus(mineral.totCaP, tCaP);
  const sNPE = D.rangeStatus(calc.npeN, tNPE);
  const sPE = D.rangeStatus(calc.peRatio, tPE);
  const kConcStatusAt = (v) => D.rangeStatus(v, [0, D.MAX_K_MEQ_PER_L], { hardHi: D.MAX_K_MEQ_PER_L });
  const sKConc = kConcStatusAt(calc.kMeqPerL);
  const osmStatusAt = (v) => route === "peripheral" ? v > 900 ? "crit" : v > 850 ? "warn" : "ok" : v > 1800 ? "warn" : "ok";
  const sOsm = osmStatusAt(calc.osm);
  const enVolStatusAt = (v) => v >= 100 ? "ok" : v > 0 ? "warn" : "ok";
  const ivLipidKg = wtKg > 0 ? calc.lipidG / wtKg : 0;
  const ivKKg = calc.kKg;
  const ivNpeN = calc.aaG > 0 ? (calc.tpnKcal - calc.aaG * 4) / calc.aaG : null;
  const hardLip = D.rangeStatus(ivLipidKg, tLip, { hardHi: 4.5 }) === "crit";
  const hardK = D.rangeStatus(ivKKg, tK, { hardHi: 3.5 }) === "crit";
  const hardNPE = ivNpeN !== null && D.rangeStatus(ivNpeN, tNPE, { hardHi: 32 }) === "crit";
  const lowNPE = ivNpeN !== null && !hardNPE && ivNpeN < 20;
  const withTotal = (iv, total, d, unit) => Math.abs(total - iv) >= 0.5 * Math.pow(10, -d) ? ` · total incl. EN ${fmt(total, d)} ${unit}` : "";
  const vsLimit = (v, limit, d) => {
    while (d < 3 && fmt(v, d) === fmt(limit, d)) d++;
    return fmt(v, d);
  };
  const ivRef = "Hard limit · TPN (IV) portion";
  const bagIngredientsWithoutVolume = totalTPN_mL > 0 ? [] : [
    [aaPerKg, "Amino acid"],
    [dexPct, "Dextrose"],
    [naCl, "20% NaCl"],
    [naAcet, "Na acetate"],
    [glycophosP, "Glycophos"],
    [kCl, "KCl"],
    [k2hpo4, "K₂HPO₄"],
    [mgPerKg, "MgSO₄"],
    [caPerKg, "Ca gluconate"],
    [znPerKg, "ZnSO₄"]
  ].filter(([v]) => v > 0).map(([, label]) => label);
  const zeroVolumeBag = bagIngredientsWithoutVolume.length > 0;
  const bagOrdered = calc.totalTPN_mL > 0 || zeroVolumeBag;
  const alerts = [];
  if (calc.totalTPN_mL > 0 && sGir === "crit") alerts.push({ level: "crit", title: "GIR critically high", body: `${fmt(calc.gir, 1)} mg/kg/min — lower dextrose %.`, ref: "ESPGHAN 2018" });
  else if (calc.totalTPN_mL > 0 && sGir === "warn") alerts.push({ level: "warn", title: "GIR off target", body: `${fmt(calc.gir, 1)} — aim ${tGir[0]}–${tGir[1]}.`, ref: "ESPGHAN" });
  if (hardNPE) alerts.push({ level: "crit", title: "NPE:AA critically off target", body: `NPE:AA IV ${vsLimit(ivNpeN, 32, 0)} kcal/g AA > 32 hard limit (TPN only) — risks excess fat deposition${withTotal(ivNpeN, calc.npeN, 0, "kcal/g")}.`, ref: `NPC:N 150–200:1 · ${ivRef}` });
  else if (lowNPE) alerts.push({ level: "warn", title: "NPE:AA off target", body: `NPE:AA IV ${vsLimit(ivNpeN, 20, 0)} kcal/g AA < 20 — พลังงานที่ไม่ใช่โปรตีนยังน้อยเมื่อเทียบกับ amino acid ที่ให้ ปกติพบระหว่างค่อย ๆ เพิ่ม dextrose/lipid ในสัปดาห์แรก ตรวจว่าเป็นไปตามแผน${withTotal(ivNpeN, calc.npeN, 0, "kcal/g")}.`, ref: "NPC:N 150–200:1" });
  else if (calc.totalKcal > 0 && sNPE === "warn") alerts.push({ level: "warn", title: "NPE:AA off target", body: `${D.displayNum(calc.npeN, 0)} kcal/g protein — aim ${tNPE[0]}–${tNPE[1]} kcal/g AA (soft-alert zone 20–<24).`, ref: "NPC:N 150–200:1" });
  const tileRef = useEN ? "ESPGHAN 2022 (enteral)" : "ESPGHAN 2018 (parenteral)";
  const pushTile = (status, name, value, decimals, target, unit, critNote, ref = tileRef) => {
    if (status === "crit") alerts.push({
      level: "crit",
      title: `${name} critically out of range`,
      body: `${fmt(value, decimals)} ${unit} — ${critNote || `target ${target[0]}–${target[1]} ${unit}`}.`,
      ref
    });
    else if (status === "warn") alerts.push({
      level: "warn",
      title: `${name} off target`,
      body: `${fmt(value, decimals)} ${unit} — target ${target[0]}–${target[1]} ${unit}.`,
      ref
    });
  };
  pushTile(sPro, "Protein", calc.proteinKg, 1, tPro, "g/kg/d", "above the 4.8 g/kg/d hard limit");
  pushTile(sKcal, "Energy", calc.kcalKg, 0, tKcal, "kcal/kg/d");
  if (hardLip) alerts.push({
    level: "crit",
    title: "Lipid critically out of range",
    body: `Lipid IV ${vsLimit(ivLipidKg, 4.5, 1)} g/kg/d > 4.5 g/kg/d hard limit (TPN lipid only)${withTotal(ivLipidKg, calc.lipidKgTotal, 1, "g/kg/d")}.`,
    ref: ivRef
  });
  else pushTile(sLip, "Lipid", calc.lipidKgTotal, 1, tLip, "g/kg/d");
  pushTile(sNa, "Sodium", calc.naTotalDelivered, 1, tNa, "mEq/kg/d");
  if (hardK) alerts.push({
    level: "crit",
    title: "Potassium critically out of range",
    body: `K IV ${vsLimit(ivKKg, 3.5, 1)} mEq/kg/d > 3.5 mEq/kg/d hard limit (TPN only)${withTotal(ivKKg, calc.kTotalDelivered, 1, "mEq/kg/d")}.`,
    ref: ivRef
  });
  else pushTile(sK, "Potassium", calc.kTotalDelivered, 1, tK, "mEq/kg/d");
  pushTile(sMg, "Magnesium", mgPerKg, 2, tMg, "mEq/kg/d", null, "ESPGHAN 2018 (parenteral)");
  if (mineral.hasOral) {
    pushTile(sTotCa, "Calcium (total incl. oral)", mineral.totCa, 0, tCa, "mg/kg/d");
    pushTile(sTotP, "Phosphate (total incl. oral)", mineral.totP, 0, tP, "mg/kg/d");
  } else {
    pushTile(sCa, "Calcium", calc.caKg, 0, tCa, "mg/kg/d");
    pushTile(sP, "Phosphorus", calc.pKg, 0, tP, "mg/kg/d");
  }
  const caPStatus = mineral.hasOral ? sTotCaP : sCaP;
  const caPValue = mineral.hasOral ? mineral.totCaP : calc.caP;
  const caPScope = mineral.hasOral ? " (รวม oral supp)" : "";
  if (caPStatus === "crit") alerts.push({ level: "crit", title: `Ca:P ratio${caPScope} — ไม่มี P`, body: `Ca ${fmt(mineral.hasOral ? mineral.totCa : calc.caKg, 0)} mg/kg/d แต่ P = 0 — เสี่ยง metabolic bone disease / สั่ง phosphate ร่วมด้วย.`, ref: "ESPGHAN 2018" });
  else if (caPStatus === "warn") alerts.push({ level: "warn", title: `Ca:P ratio${caPScope} off target`, body: `Mass ratio ${fmt(caPValue, 2)}:1 — aim ${tCaP[0]}–${tCaP[1]}:1 (molar 0.8–1.3:1 ESPGHAN 2018).`, ref: "ESPGHAN 2018" });
  if (!isMEN && calc.enVolPerKg > 100 && sPE === "warn") alerts.push({ level: "warn", title: "Protein : Energy off target", body: `${fmt(calc.peRatio, 1)} g/100 kcal — aim ${tPE[0]}–${tPE[1]}.`, ref: "ESPGHAN 2022" });
  if (isMEN && calc.enVolPerKg > D.MEN_MAX_ML_KG) alerts.push({
    level: "warn",
    title: "MEN ticked above trophic volume",
    body: `EN ${fmt(calc.enVolPerKg, 0)} mL/kg/d is above the ${D.MEN_MAX_ML_KG} mL/kg/d trophic ceiling, and a MEN feed counts toward neither fluid nor nutrition. ถ้าเพิ่มนมแล้ว ให้เอาเครื่องหมาย MEN ออก.`,
    ref: `Feeding Advancement · MEF 12–${D.MEN_MAX_ML_KG} mL/kg/d`
  });
  if (bagOrdered && sOsm === "crit") alerts.push({ level: "crit", title: "Osmolarity > peripheral limit", body: `${calc.osm.toFixed(0)} mOsm/L — switch to central.`, ref: "Safety" });
  else if (bagOrdered && sOsm === "warn") alerts.push({ level: "warn", title: route === "peripheral" ? "Osmolarity near peripheral limit" : "Osmolarity high for central line", body: `${calc.osm.toFixed(0)} mOsm/L — ${route === "peripheral" ? "peripheral limit 900" : "endothelial risk above 1800"} mOsm/L.`, ref: "Safety" });
  if (calc.totalTPN_mL > 0 && Math.abs(calc.totalFluidPerKg - fluidTargetPerKg) > 20) alerts.push({ level: "info", title: "Fluid: prescribed ≠ target", body: `Prescribed ${calc.totalFluidPerKg.toFixed(0)} vs plan ${fluidTargetPerKg} mL/kg/d — attending discretion`, ref: "Plan" });
  if (calc.dexGPerKg > D.MAX_DEXTROSE_G_KG) alerts.push({ level: "crit", title: "Dextrose over KCMH max", body: `${fmt(calc.dexGPerKg, 1)} g/kg/d — sheet limit is ${D.MAX_DEXTROSE_G_KG} g/kg/d. Lower dextrose % or bag volume.`, ref: "KCMH TPN worksheet" });
  if (calc.kMeqPerL > D.MAX_K_MEQ_PER_L) alerts.push({ level: "crit", title: "K⁺ concentration too high", body: `${fmt(calc.kMeqPerL, 0)} mEq/L — max ${D.MAX_K_MEQ_PER_L} mEq/L in the bag (reference ceilings: peripheral ${D.K_REF_MEQ_PER_L.peripheral} · central ${D.K_REF_MEQ_PER_L.central} mEq/L). Increase volume or reduce K.`, ref: "KCMH TPN worksheet" });
  if (calc.znTotal_mg > D.MAX_ZN_MG_DAY) alerts.push({ level: "crit", title: `Zinc total above ${D.MAX_ZN_MG_DAY} mg/day`, body: `Zn ${fmt(calc.znTotal_mg, 2)} mg/day (Peditrace ${fmt(calc.znPeditrace_mg, 2)} + ZnSO₄ ${fmt(calc.znSO4_mg, 2)}) — max ${D.MAX_ZN_MG_DAY} mg/day.`, ref: "KCMH TPN team" });
  if (bagOrdered && calc.wfiVol < 0) alerts.push({ level: "crit", title: "Bag cannot be compounded", body: `Components total ${fmt(calc.componentVol, 1)} mL but the prepared bag is only ${fmt(calc.preparedVol, 1)} mL — over by ${fmt(Math.abs(calc.wfiVol), 1)} mL.`, ref: "WFI q.s." });
  if (calc.totalTPN_mL > 0 && caPerKg > 0 && k2hpo4 > 0) alerts.push({ level: "warn", title: "Calcium–phosphate compatibility not calculated", body: "This order combines calcium with inorganic phosphate. NeoFeed does not calculate formulation-specific precipitation risk; pharmacy must verify compatibility before compounding or administration.", ref: "ESPGHAN/ESPEN/ESPR/CSPEN 2018" });
  const dosingWeightChanged = !!savedDosingWt && wtG > 0 && (savedDosingWt.exact ? Math.abs(savedDosingWt.g - wtG) > 0.01 : Math.abs(savedDosingWt.g - wtG) > Math.max(1, wtG * 5e-3));
  const calcMoved = !!savedEntryId && (savedCalcVersion ? savedCalcVersion !== D.CONSTANTS_VERSION : calc.overfill > 1.001 && (inclSoluvit || inclPeditrace) || isMEN && calc.enVolTotal > 0);
  const uncoveredCritical = alerts.filter((a) => a.level === "crit").map((a) => a.title).filter((t) => !(critOverride?.alerts || []).includes(t));
  const isDraftSaved = !!savedEntryId && savedStatus === "draft";
  const printable = !!savedEntryId && !dirty && !pendingSave && !zeroVolumeBag && !dosingWeightChanged && !calcMoved && uncoveredCritical.length === 0 && !isDraftSaved;
  const zeroVolumeText = `ปริมาตร TPN = 0 แต่ยังมีส่วนประกอบในถุง: ${bagIngredientsWithoutVolume.join(", ")} — ลบส่วนประกอบ หรือใส่ปริมาตร`;
  const printBlockMessage = (before) => pendingSave ? `รายการนี้ยังบันทึกไม่เสร็จ (กำลังบันทึก…) — รอสักครู่แล้วเปิดใหม่${before}` : isDraftSaved && !dirty ? `เป็นแบบร่าง — กรอกให้ครบทุกช่องแล้วกด Submit${before}` : zeroVolumeBag ? `${zeroVolumeText} แล้วบันทึก${before}` : dirty ? `มีการแก้ไขที่ยังไม่ได้บันทึก — กดบันทึก${before}` : dosingWeightChanged ? `น้ำหนักที่ใช้คำนวณเปลี่ยนไปหลังบันทึก (birth weight แก้ไข) — ตรวจสอบและบันทึกใหม่${before}` : calcMoved ? `NeoFeed ปรับการคำนวณหลังคำสั่งนี้ถูกบันทึก — ตัวเลขบางรายการเปลี่ยน ตรวจสอบและบันทึกใหม่${before}` : uncoveredCritical.length > 0 ? `มีค่าวิกฤตที่ยังไม่ได้ระบุเหตุผล — บันทึกพร้อมเหตุผล${before}` : "";
  const printBlockToast = printable ? "" : printBlockMessage("ก่อนพิมพ์");
  React.useEffect(() => {
    const ALL = /* @__PURE__ */ new Set([1, 2, 3, 4, 5, 6]);
    const handler = () => {
      if (centerPoint) {
        centerPoint.review();
        return;
      }
      if (scratch) {
        showToast("Calculator นี้ไม่ได้ผูกกับผู้ป่วย จึงพิมพ์ใบสั่ง TPN ไม่ได้ — เปิดจากผู้ป่วยเพื่อบันทึกและพิมพ์", "error");
        return;
      }
      if (!savedEntryId) {
        showToast(ordersReadOnly ? "พิมพ์ได้เฉพาะคำสั่งที่แพทย์บันทึกแล้ว" : "กรุณาบันทึกคำสั่งให้สำเร็จก่อนพิมพ์", "error");
        return;
      }
      if (!printable) {
        showToast(printBlockToast || "มีการแก้ไขที่ยังไม่ได้บันทึก — กดบันทึกก่อนพิมพ์", "error");
        return;
      }
      setOpenSteps(ALL);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.print();
        window.onafterprint = () => setOpenSteps(/* @__PURE__ */ new Set([1]));
      }));
    };
    document.addEventListener("__neofeed_print", handler);
    return () => document.removeEventListener("__neofeed_print", handler);
  }, [savedEntryId, printable, printBlockToast]);
  const handleSave = async (asDraft = false) => {
    asDraft = asDraft === true;
    if (saving) return;
    if (scratch) return;
    if (ordersReadOnly) return;
    if (asDraft && (blankFields.has("curWtG") || !(curWtG > 0))) {
      setOpenSteps((prev) => new Set(prev).add(1));
      showToast("บันทึกร่างต้องมีน้ำหนักปัจจุบัน (Current weight) อย่างน้อย", "error");
      return;
    }
    if (!asDraft && missingFields.length > 0) {
      setOpenSteps((prev) => new Set(prev).add(1));
      showToast(`ยังกรอกไม่ครบ — ต้องกรอก: ${missingFields.map((f) => f.label).join(", ")}`, "error");
      return;
    }
    if (pendingSave) {
      showToast("รายการนี้ยังบันทึกไม่เสร็จ (กำลังบันทึก…) — รอสักครู่แล้วเปิดใหม่", "error");
      return;
    }
    if (!asDraft && zeroVolumeBag) {
      setOpenSteps((prev) => new Set(prev).add(2).add(3));
      showToast(zeroVolumeText, "error");
      return;
    }
    const critical = asDraft ? [] : sortClinicalAlerts(alerts).filter((a) => a.level === "crit");
    let override = null;
    if (critical.length > 0) {
      const reason = window.prompt(
        `มีค่าวิกฤต ${critical.length} รายการ:
• ${critical.map((a) => a.title).join("\n• ")}

ยืนยันการสั่งหรือไม่? — แพทย์ยืนยันคำสั่งโดยระบุเหตุผลทางคลินิก (จะพิมพ์ลงใบสั่ง TPN · ห้ามใส่ชื่อหรือ HN):`,
        ""
      );
      if (reason == null || !String(reason).trim()) {
        showToast("ยังไม่ได้บันทึก — มีค่าวิกฤต ต้องระบุเหตุผลก่อน", "error");
        return;
      }
      override = { reason: String(reason).trim().slice(0, 300), alerts: critical.map((a) => a.title), at: (/* @__PURE__ */ new Date()).toISOString() };
    }
    const keyAtSave = formKey;
    const dosingWtAtSave = wtG;
    if (centerPoint) {
      setSaving(true);
      try {
        const result = await centerPoint.save({
          dol,
          wtG,
          wtKg,
          curWtG,
          usingBirthWeight,
          route,
          orderDate: logDate,
          dexPct,
          totalTPN_mL,
          aaPerKg,
          lipidPerKg,
          lipidDripHours,
          naCl,
          naAcet,
          glycophosP,
          kCl,
          k2hpo4,
          mgPerKg,
          mgStrength,
          caPerKg,
          inclSoluvit,
          inclPeditrace,
          inclAddamel,
          heparinUmL,
          calc,
          suppVitD,
          suppCa,
          suppCaType,
          suppPO4,
          suppPO4Type,
          suppMTV,
          suppFerdek,
          suppFeType,
          mineral,
          enType,
          enVol,
          enFreq,
          critOverride: override
        });
        setSavedEntryId(result.sourceRecordId);
        setSavedLastModified(result.recordedAt);
        setSavedKey(keyAtSave);
        setCritOverride(override);
        setSavedDosingWt({ g: dosingWtAtSave, exact: true });
        setSavedCalcVersion(D.CONSTANTS_VERSION);
      } catch (error) {
        centerPoint.failed?.(error);
        showToast("บันทึกไป Center Point ไม่สำเร็จ กรุณาตรวจสถานะและลองใหม่", "error");
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      localStorage.setItem(`neofeed_calc_${patient.sessionId}`, JSON.stringify(captureState()));
    } catch {
    }
    const _suppPayload = {
      suppMTV: suppMTV ? 1 : 0,
      suppVitD_IU: suppVitD > 0 && wtKg > 0 ? Math.round(suppVitD * wtKg) : 0,
      suppCa_mg: suppCa > 0 && wtKg > 0 ? Math.round(suppCa * wtKg) : 0,
      suppCaType: suppCa > 0 ? suppCaType : "",
      suppPO4_mmol: suppPO4 > 0 && wtKg > 0 ? parseFloat((suppPO4 * wtKg / 31).toFixed(2)) : 0,
      suppPO4Type: suppPO4 > 0 ? suppPO4Type : "",
      suppFe_mg: suppFerdek > 0 && wtKg > 0 ? parseFloat((suppFerdek * wtKg).toFixed(1)) : 0,
      suppFeType: suppFerdek > 0 ? suppFeType : ""
    };
    const entry = {
      dol,
      weight: curWtG,
      fluid: calc.totalFluidPerKg,
      gir: calc.gir,
      pro: calc.proteinKg,
      kcal: calc.kcalKg,
      na: calc.naTotalDelivered,
      k: calc.kTotalDelivered,
      ca: calc.caKg,
      p: calc.pKg,
      enVolPerKg: calc.enVolPerKg,
      // Intake/Output card — raw mL/day, entered directly. Per-kg/rate figures
      // (e.g. urine mL/kg/h) are re-derived on display from these plus
      // D.ioDivisorG, never stored, so they stay correct if weights are
      // edited later.
      ioInput,
      ioOutput,
      drainContent,
      // Route reflects what was actually delivered, not just the IV-access toggle —
      // a fully-weaned-to-EN day (totalTPN_mL === 0) must not be logged as "TPN ...".
      route: calc.totalTPN_mL > 0 ? route === "central" ? "TPN central" : "TPN peripheral" : calc.enVolPerKg > 0 ? "Enteral only" : "NPO",
      status: asDraft ? "draft" : "submitted",
      ..._suppPayload,
      // tpnWtG: the resolved dosing weight these numbers were computed with,
      // so a reopened row can tell when a birth-weight edit has re-dosed it
      // (UP-C2). Derived, not an input — normalizeCalcInput ignores it.
      // constantsVersion: the calculation these numbers came from, so a later
      // release that moves a printed figure holds this row's reprint (calcMoved).
      // savedByLabel: the saver's "Name (email)", so the form can name whom
      // to call (savedByOf). Not an input — normalizeCalcInput ignores it.
      calcInput: {
        ...captureState(),
        tpnWtG: dosingWtAtSave,
        constantsVersion: D.CONSTANTS_VERSION,
        ...userLabel ? { savedByLabel: userLabel } : {},
        ...override ? { critOverride: override } : {},
        // Which required boxes were blank — they reopen blank (seededZeros).
        ...asDraft ? { blankFields: missingFields.map((f) => f.key) } : {}
      },
      // Provenance — which constants and which frontend computed these
      // numbers. Lands in Daily_Log AF/AG and prints on the order form, so a
      // constant that later turns out wrong can be traced to the exact rows
      // it affected. Sent on every save, including edits: an edit recomputes
      // the figures with today's constants, so the stamp must move with them.
      constantsVersion: D.CONSTANTS_VERSION,
      appVersion: D.appVersion(),
      // Editing must keep the entry's original calendar date; a brand-new entry
      // is stamped with the back-date the user picked (logDate) or else the
      // date the form was opened on — sent explicitly, so a form saved after
      // midnight is still filed under the day it was written for (UP-C11).
      ts: editEntry ? editEntry.ts : logDate || newOrderDate
    };
    setSaving(true);
    const res = savedEntryId ? await onUpdate(savedEntryId, savedLastModified, entry) : await onLog(entry);
    setSaving(false);
    if (res.conflict) {
      if (dirty) writeDraft(currentInputs());
      setConflict(res.current);
      return;
    }
    if (!res.ok) return;
    if (res.revised) {
      setSavedEntryId(res.entryId);
      setPublished(false);
    } else {
      if (!savedEntryId) setSavedEntryId(res.entryId);
    }
    setSavedLastModified(res.lastModified);
    setSavedStatus(asDraft ? "draft" : "submitted");
    setSavedKey(keyAtSave);
    setCritOverride(override);
    setSavedDosingWt({ g: dosingWtAtSave, exact: true });
    setSavedCalcVersion(D.CONSTANTS_VERSION);
    setSavedMeta({
      by: userLabel || "",
      at: res.lastModified || (/* @__PURE__ */ new Date()).toISOString(),
      revision: res.revisionNumber || savedMeta?.revision || 1
    });
    clearDraft();
    setDraftOffer(null);
    if (!D.ENABLE_PUBLISH_GATE) onSaved && onSaved();
  };
  const handlePublish = async () => {
    if (!savedEntryId || published || publishing) return;
    if (!printable) {
      showToast(printBlockMessage("ก่อนส่ง"), "error");
      return;
    }
    setPublishing(true);
    const res = await onPublish(savedEntryId, savedLastModified);
    setPublishing(false);
    if (res.conflict) {
      setConflict(res.current);
      return;
    }
    if (!res.ok) return;
    setPublished(true);
    onSaved && onSaved();
  };
  const handleDelete = () => {
    if (!savedEntryId || pendingSave || !onDelete) return;
    const ts = editEntry?.ts || logDate;
    const label = `DOL ${dol}${ts ? ` (${window.NEOFEED_FMT_DATE?.(ts) || ts})` : ""}`;
    if (!window.confirm(`ลบบันทึก ${label} ใช่หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้`)) return;
    onDelete({ entryId: savedEntryId, dol, ts });
  };
  return /* @__PURE__ */ React.createElement(React.Fragment, null, conflict && /* @__PURE__ */ React.createElement("div", { style: {
    padding: "10px 12px",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit-line)",
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 12.5,
    color: "var(--crit)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  } }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 13, color: "var(--crit)" }), /* @__PURE__ */ React.createElement("span", null, "รายการนี้ถูกแก้ไขจาก", conflict.lastModifiedBy ? ` ${conflict.lastModifiedBy}` : "เครื่องอื่น", ' หลังจากหน้านี้เปิดขึ้นมา — ข้อมูลที่คุณกรอกยังอยู่ครบ กด "โหลดข้อมูลล่าสุด" เพื่อดูของใหม่ก่อนบันทึกทับ (ข้อมูลที่กรอกเก็บเป็นร่างไว้ — กู้คืนได้หลังโหลด)'), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => setConflict(null) }, "แก้ไขต่อ"), /* @__PURE__ */ React.createElement("button", { className: "btn sm primary", onClick: () => window.location.reload() }, "โหลดข้อมูลล่าสุด"))), draftOffer && /* @__PURE__ */ React.createElement("div", { style: {
    padding: "10px 12px",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-line)",
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 12.5,
    color: "var(--warn)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  } }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 13, color: "var(--warn)" }), /* @__PURE__ */ React.createElement("span", null, "มีข้อมูลที่กรอกค้างไว้แต่ยังไม่ได้บันทึก", draftOffer.savedAt ? ` (เมื่อ ${new Date(draftOffer.savedAt).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${draftOffer.by ? ` · โดย ${draftOffer.by}` : ""})` : "", draftIsStale && /* @__PURE__ */ React.createElement("strong", null, " · ร่างนี้เก่ากว่าฉบับที่บันทึกล่าสุด — กู้คืนแล้วตรวจกับฉบับล่าสุดก่อนบันทึก"), " ", "— กู้คืนเพื่อบันทึกต่อ หรือทิ้งไป"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => {
    clearDraft();
    setDraftOffer(null);
  } }, "ทิ้ง"), /* @__PURE__ */ React.createElement("button", { className: "btn sm primary", onClick: restoreDraft }, "กู้คืน"))), editEntry && !conflict && /* @__PURE__ */ React.createElement("div", { style: {
    padding: "8px 12px",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-line)",
    boxShadow: "inset 4px 0 0 var(--warn)",
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 12,
    color: "var(--warn-ink)",
    display: "flex",
    alignItems: "center",
    gap: 8
  } }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 13, color: "var(--warn)" }), /* @__PURE__ */ React.createElement("span", null, "กำลังแก้ไขบันทึก DOL ", /* @__PURE__ */ React.createElement("strong", null, dol), " (", window.NEOFEED_FMT_DATE?.(editEntry.ts) || editEntry.ts, ") — บันทึกเพื่ออัปเดตรายการเดิม ไม่สร้างรายการใหม่")), orderDayRolledOver && !conflict && /* @__PURE__ */ React.createElement("div", { role: "status", style: {
    padding: "8px 12px",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-line)",
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 12.5,
    color: "var(--warn)",
    display: "flex",
    alignItems: "center",
    gap: 8
  } }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 13, color: "var(--warn)" }), /* @__PURE__ */ React.createElement("span", null, "คำสั่งนี้เป็นของวันที่ ", /* @__PURE__ */ React.createElement("strong", null, window.NEOFEED_FMT_DATE?.(newOrderDate) || newOrderDate), " (DOL ", /* @__PURE__ */ React.createElement("strong", null, dol), ") — เปิดไว้ตั้งแต่ก่อนเที่ยงคืน และจะบันทึกเป็นของวันนั้น")), !editEntry && logDate && !conflict && /* @__PURE__ */ React.createElement("div", { style: {
    padding: "8px 12px",
    background: "var(--brand-bg)",
    border: "1px solid var(--brand-line)",
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 12,
    color: "var(--brand-2)",
    display: "flex",
    alignItems: "center",
    gap: 8
  } }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 13, color: "var(--brand-2)" }), /* @__PURE__ */ React.createElement("span", null, "กำลังบันทึกย้อนหลังสำหรับวันที่ ", /* @__PURE__ */ React.createElement("strong", null, window.NEOFEED_FMT_DATE?.(logDate) || logDate), " (DOL ", /* @__PURE__ */ React.createElement("strong", null, dol), ")")), !editEntry && prefilledFrom && /* @__PURE__ */ React.createElement("div", { style: {
    padding: "8px 12px",
    background: "var(--brand-bg)",
    border: "1px solid var(--brand-line)",
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 12,
    color: "var(--brand-2)",
    display: "flex",
    alignItems: "center",
    gap: 8
  } }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 13, color: "var(--brand-2)" }), /* @__PURE__ */ React.createElement("span", null, prefilledFrom.baseline ? /* @__PURE__ */ React.createElement(React.Fragment, null, "ดึงข้อมูลจากบันทึกล่าสุด (DOL ", /* @__PURE__ */ React.createElement("strong", null, prefilledFrom.dol), ") มาเป็นค่าตั้งต้น — ตรวจสอบและปรับก่อนบันทึก", prefilledFrom.weightFrom && /* @__PURE__ */ React.createElement(React.Fragment, null, " · ", "น้ำหนักใช้ค่า", prefilledFrom.weightFrom.src === "order" ? "ในคำสั่ง" : "ที่ชั่ง", "ล่าสุด ", /* @__PURE__ */ React.createElement("strong", null, prefilledFrom.weightFrom.w, " g"), " (DOL ", prefilledFrom.weightFrom.dol, ")", " แทนน้ำหนักในบันทึกเดิม ", prefilledFrom.weightWas, " g")) : /* @__PURE__ */ React.createElement(React.Fragment, null, "Prefilled from previous submission (saved ", /* @__PURE__ */ React.createElement("strong", null, window.NEOFEED_FMT_DATE?.(D.normalizeDateStr(new Date(prefilledFrom.savedAt))) || D.normalizeDateStr(new Date(prefilledFrom.savedAt))), ") — review and adjust before submitting today.")), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm",
      style: { marginLeft: "auto", padding: "3px 10px" },
      onClick: () => setPrefilledFrom(null)
    },
    "Dismiss"
  )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 } }, /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => setOpenSteps(/* @__PURE__ */ new Set([1, 2, 3, 4, 5, 6])) }, "Open all"), /* @__PURE__ */ React.createElement("button", { className: "btn sm", onClick: () => setOpenSteps(/* @__PURE__ */ new Set()) }, "Close all")), /* @__PURE__ */ React.createElement("div", { className: "card", style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "card-h clickable", onClick: () => toggleStep(1) }, /* @__PURE__ */ React.createElement(Icon, { name: "drop", size: 14, color: "var(--brand)" }), "Step 1 · Fluid plan", !openSteps.has(1) && /* @__PURE__ */ React.createElement("div", { className: "step-summary" }, /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, fluidTargetPerKg, " mL/kg/d"), /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, fmt(fluidTargetPerKg * wtKg, 0), " mL/day"), Math.abs(calc.remaining) > 5 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip", style: { color: "var(--warn)" } }, fmt(Math.abs(calc.remaining), 0), " mL ", calc.remaining < 0 ? "over" : "left")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("div", { className: `step-dot ${stepStatus[1]}` }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, color: "var(--ink-3)" } }, openSteps.has(1) ? "▲" : "▼"))), /* @__PURE__ */ React.createElement("div", { className: `accordion-body${openSteps.has(1) ? " open" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement("div", { className: "s1-grid", style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr) 1.4fr", gap: 12, alignItems: "stretch" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Target fluid",
      unit: "mL/kg/d",
      value: fluidTargetPerKg,
      onChange: setFluidTargetPerKg,
      step: 5,
      key: `${formIdentity}·fluidTargetPerKg`,
      name: "fluidTargetPerKg",
      required: true,
      seedZero: seedsZero("fluidTargetPerKg"),
      onBlankChange: reportBlank,
      hint: `= ${fmt(fluidTargetPerKg * wtKg, 0)} mL/d · attending discretion`
    }
  ), /* @__PURE__ */ React.createElement(PresetChips, { values: [60, 80, 100, 120, 150], current: fluidTargetPerKg, onSelect: setFluidTargetPerKg })), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Other IV",
      unit: "mL/d",
      value: otherIV_mL,
      onChange: setOtherIV_mL,
      step: 1,
      key: `${formIdentity}·otherIV_mL`,
      name: "otherIV_mL",
      required: true,
      seedZero: seedsZero("otherIV_mL"),
      onBlankChange: reportBlank,
      hint: `= ${fmt(otherIV_mL / wtKg, 1)} mL/kg/d`
    }
  ), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Drug volume",
      unit: "mL/d",
      value: drug_mL,
      onChange: setDrug_mL,
      step: 1,
      key: `${formIdentity}·drug_mL`,
      name: "drug_mL",
      required: true,
      seedZero: seedsZero("drug_mL"),
      onBlankChange: reportBlank,
      hint: `= ${fmt(drug_mL / wtKg, 1)} mL/kg/d`
    }
  ), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Current weight",
      unit: "g",
      value: curWtG,
      onChange: setCurWtG,
      step: 5,
      key: `${formIdentity}·curWtG`,
      name: "curWtG",
      required: true,
      seedZero: seedsZero("curWtG"),
      onBlankChange: reportBlank
    }
  ), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "TPN calc. weight",
      unit: "g",
      value: wtG,
      step: 5,
      key: `${formIdentity}·tpnWtG`,
      name: "tpnWtG",
      required: true,
      seedZero: seedsZero("tpnWtG"),
      onBlankChange: reportBlank,
      onChange: (v) => setTpnWtOverrideG(v === autoWtG ? 0 : v),
      hint: tpnWtManual ? `⚠ แก้เอง · อัตโนมัติ = ${fmt(autoWtG, 0)} g` : usingBirthWeight ? "= birth weight (not yet regained)" : curWtG > 0 ? weightSourceHint : "—"
    }
  ), /* @__PURE__ */ React.createElement("div", { style: {
    padding: "10px 14px",
    borderRadius: 8,
    background: FLUID_TONE[fluidTone].bg,
    border: `1px solid ${FLUID_TONE[fluidTone].line}`,
    boxShadow: FLUID_TONE[fluidTone].stripe ? `inset 3px 0 0 ${FLUID_TONE[fluidTone].stripe}` : void 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center"
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.05 } }, fluidTone === "warn" || fluidTone === "crit" ? "Over target" : "Remaining"), /* @__PURE__ */ React.createElement("div", { className: "num", style: {
    fontSize: 26,
    fontWeight: 500,
    color: FLUID_TONE[fluidTone].ink,
    letterSpacing: "-0.02em"
  } }, calc.remaining >= 0 ? "" : "+", fmt(Math.abs(calc.remaining), 1), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "var(--ink-3)", marginLeft: 4 } }, "mL/d ", calc.remaining < 0 ? "over" : "left")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)" } }, "Plan ", /* @__PURE__ */ React.createElement("span", { className: "num" }, fmt(fluidTargetPerKg * wtKg, 0)), " · Prescribed ", /* @__PURE__ */ React.createElement("span", { className: "num" }, fmt(calc.prescribedFluid, 0)), " mL/d"))), tpnWtManual && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10, fontSize: 11.5, color: "var(--warn)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", null, "TPN calc. weight ถูกแก้เป็น ", /* @__PURE__ */ React.createElement("span", { className: "num", style: { fontWeight: 600 } }, fmt(wtG, 0)), " g — ทุก dose/target ด้านล่างคิดจากค่านี้ (อัตโนมัติ = ", fmt(autoWtG, 0), " g)"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn",
      style: { fontSize: 11.5, padding: "3px 10px" },
      onClick: () => setTpnWtOverrideG(0)
    },
    "ใช้ค่าอัตโนมัติ"
  ))))), !centerPoint && !scratch && /* @__PURE__ */ React.createElement("div", { className: "card", style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "drop", size: 14, color: "var(--brand)" }), "Intake / Output"), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement("div", { className: "s1-grid", style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, alignItems: "stretch" } }, /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Input",
      unit: "mL/d",
      value: ioInput,
      step: 1,
      key: `${formIdentity}·ioInput·${ioGen}`,
      name: "ioInput",
      required: true,
      seedZero: seedsZero("ioInput"),
      onBlankChange: reportBlank,
      onChange: (v) => {
        markIoInputTouched(true);
        releaseNursingKey("ioInput");
        setIoInput(v);
      },
      hint: `(${fmt(ioInputPerKg, 1)} mL/kg/d)`
    }
  ), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Urine output",
      unit: "mL/d",
      value: ioOutput,
      step: 1,
      key: `${formIdentity}·ioOutput·${ioGen}`,
      name: "ioOutput",
      required: true,
      seedZero: seedsZero("ioOutput"),
      onBlankChange: reportBlank,
      onChange: (v) => {
        releaseNursingKey("ioOutput");
        setIoOutput(v);
      },
      hint: `(${fmt(ioOutputPerKgH, 2)} mL/kg/h)`
    }
  ), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Drain content",
      unit: "mL/d",
      value: drainContent,
      step: 1,
      onChange: (v) => {
        releaseNursingKey("drainContent");
        setDrainContent(v);
      },
      key: `${formIdentity}·drainContent·${ioGen}`,
      name: "drainContent",
      required: true,
      seedZero: seedsZero("drainContent"),
      onBlankChange: reportBlank,
      hint: `(${fmt(ioDrainPerKg, 1)} mL/kg/d)`
    }
  )), (ioInput > 0 || ioOutput > 0 || drainContent > 0) && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10, fontSize: 11.5, color: "var(--ink-3)" } }, "Balance ", /* @__PURE__ */ React.createElement("span", { className: "num", style: { fontWeight: 600, color: "var(--ink-2)" } }, ioBalance >= 0 ? "+" : "", fmt(ioBalance, 0)), " mL/d", ioDivisorGVal != null && /* @__PURE__ */ React.createElement(React.Fragment, null, " · divisor ", /* @__PURE__ */ React.createElement("span", { className: "num" }, fmt(ioDivisorGVal, 0)), " g", ioDivisor.source === "birth" ? " (birth weight)" : ioDivisor.source === "today" ? " (today)" : " (previous day)")), nursingApplied && /* @__PURE__ */ React.createElement("div", { className: "nursing-prefill-note", style: { marginTop: 8, fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5 } }, "เติมจากบันทึกพยาบาล · ยอด 24 ชม. ปิดยอดเช้า ", window.NEOFEED_FMT_DATE?.(nursingApplied.date) || nursingApplied.date, " ", "(", [nursingApplied.keys.has("ioInput") && "Input", nursingApplied.keys.has("ioOutput") && "Urine", nursingApplied.keys.has("drainContent") && "Drain"].filter(Boolean).join(" · "), ") — แก้ได้", nursingApplied.partialIntake && /* @__PURE__ */ React.createElement(React.Fragment, null, " · ", /* @__PURE__ */ React.createElement("strong", null, "Input ไม่ได้เติม: บันทึก IV หรือ นม/EN ไม่ครบ"))), nursingChanged && /* @__PURE__ */ React.createElement("div", { className: "nursing-prefill-changed", role: "alert", style: {
    marginTop: 8,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    fontSize: 12,
    color: "var(--warn-ink)",
    fontWeight: 600
  } }, nursingForDate ? "พยาบาลแก้ยอด I/O นี้หลังเติมแล้ว" : "บันทึก I/O ที่ใช้เติมถูกลบแล้ว", /* @__PURE__ */ React.createElement("button", { className: "btn sm nursing-prefill-apply", onClick: () => applyNursingIO(nursingApplied.date) }, nursingForDate ? "ใช้ยอดล่าสุด" : "ล้างยอดที่เติมไว้")), !nursingApplied && nursingForDate && nursingTaken(nursingForDate) !== "||" && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn sm nursing-prefill-apply",
      style: { marginTop: 8 },
      onClick: () => applyNursingIO(orderDateKey)
    },
    "ใช้ยอด I/O จากบันทึกพยาบาล (ปิดยอดเช้า ",
    window.NEOFEED_FMT_DATE?.(orderDateKey) || orderDateKey,
    ")"
  ))), /* @__PURE__ */ React.createElement("div", { className: "card", style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "card-h clickable", onClick: () => toggleStep(5) }, /* @__PURE__ */ React.createElement(Icon, { name: "milk", size: 14, color: "var(--brand)" }), "Step 2 · Enteral feeding", !openSteps.has(5) && calc.enVolPerKg > 0 && /* @__PURE__ */ React.createElement("div", { className: "step-summary" }, /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, calc.enVolPerKg.toFixed(0), " mL/kg/d"), calc.enVolPerKg > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, D.EN_DB[enType]?.label?.split(" — ")[0]), D.EN_DB[enType]?.lf && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip", style: { color: "var(--ok)" } }, "LF ✅"), calc.useEnteralTargets && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip", style: { color: "var(--ok)" } }, "Full EN ✅")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("div", { className: `step-dot ${stepStatus[5]}` }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, color: "var(--ink-3)" } }, openSteps.has(5) ? "▲" : "▼"))), /* @__PURE__ */ React.createElement("div", { className: `accordion-body${openSteps.has(5) ? " open" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(TwoCol, null, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "Feed type"), /* @__PURE__ */ React.createElement("select", { className: "sel", value: enType, onChange: (e) => setEnType(e.target.value) }, /* @__PURE__ */ React.createElement("optgroup", { label: "🤱 Breast Milk" }, ["BM_20", "BM_HMF_24"].filter((k) => D.EN_DB[k]).map((k) => /* @__PURE__ */ React.createElement("option", { key: k, value: k }, D.EN_DB[k].label))), /* @__PURE__ */ React.createElement("optgroup", { label: "⚡ Preterm / High-energy formula" }, ["BM_PF_20", "FBM_PF_22", "PRENAN_22", "FBM_PF_24", "FBM_INF_MIX", "INFATRINI_30"].filter((k) => D.EN_DB[k]).map((k) => /* @__PURE__ */ React.createElement("option", { key: k, value: k }, D.EN_DB[k].label))), /* @__PURE__ */ React.createElement("optgroup", { label: "🥛 Lactose-free" }, ["LF_20", "LF_24", "LF_27"].filter((k) => D.EN_DB[k]).map((k) => /* @__PURE__ */ React.createElement("option", { key: k, value: k }, D.EN_DB[k].label))))), /* @__PURE__ */ React.createElement("div", { className: "en-fields-row", style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 } }, /* @__PURE__ */ React.createElement(NumField, { label: "Volume", unit: "mL/feed", value: enVol, onChange: setEnVol, step: 0.5 }), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Frequency",
      unit: "feeds/d",
      value: enFreq,
      onChange: setEnFreq,
      step: 1,
      hint: `q${Math.round(24 / Math.max(enFreq, 1))}h`
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "field en-men-col" }, /* @__PURE__ */ React.createElement("label", { style: { visibility: "hidden" } }, "MEN"), /* @__PURE__ */ React.createElement(
    Chk,
    {
      label: "MEN (trophic)",
      value: isMEN,
      onChange: setIsMEN,
      hint: "Not counted in fluid or nutrient totals"
    }
  ))), calc.useEnteralTargets && /* @__PURE__ */ React.createElement("div", { style: {
    padding: "8px 10px",
    background: "var(--ok-bg)",
    border: "1px solid var(--ok-line)",
    borderRadius: 6,
    fontSize: 11.5,
    color: "var(--ok)",
    marginTop: 8,
    fontWeight: 600
  } }, "✅ Full EN ≥100 mL/kg/d — wean PN · ESPGHAN 2022 EN targets active"), /* @__PURE__ */ React.createElement("div", { className: "en-delivered", style: { marginTop: 10, padding: 10, background: "var(--bg-2)", borderRadius: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.05 } }, "Delivered per kg from EN"), isMEN && calc.enVolTotal > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, fontWeight: 600, color: "var(--brand-2)" } }, "MEN — not counted in totals")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, fontSize: 11.5, color: "var(--ink-2)", flexWrap: "nowrap", overflowX: "auto" } }, [
    ["kcal", calc.enFeedKg.kcal, 0],
    ["pro", calc.enFeedKg.pro, 1],
    ["Na", calc.enFeedKg.na, 1],
    ["K", calc.enFeedKg.k, 1],
    ["Ca", calc.enFeedKg.ca, 0],
    ["P", calc.enFeedKg.p, 0]
  ].map(([lab, v, d]) => /* @__PURE__ */ React.createElement("span", { key: lab, style: { whiteSpace: "nowrap" } }, lab, " ", /* @__PURE__ */ React.createElement("span", { className: "num", style: { fontWeight: 600, color: isMEN ? "var(--ink-3)" : "var(--ink)" } }, fmt(v, d))))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React.createElement(Tile, { label: "EN volume", value: calc.enVolPerKg, unit: " mL/kg/d", target: [100, 200], status: enVolStatusAt(calc.enVolPerKg), statusAt: enVolStatusAt, decimals: 0, max: 210 }), (() => {
    const avail = fluidTargetPerKg * wtKg - totalTPN_mL - calc.lipidBagVol - otherIV_mL - drug_mL;
    const availKg = wtKg > 0 ? avail / wtKg : 0;
    const over = avail < 0;
    return /* @__PURE__ */ React.createElement("div", { style: {
      padding: "10px 12px",
      background: over ? "var(--crit-bg)" : "var(--brand-bg)",
      border: `1px solid ${over ? "var(--crit-line)" : "var(--brand-line)"}`,
      borderRadius: 8,
      position: "relative",
      overflow: "hidden"
    } }, /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 3,
      background: over ? "var(--crit)" : "var(--brand)"
    } }), /* @__PURE__ */ React.createElement("div", { style: {
      fontSize: 10,
      color: "var(--ink-3)",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      marginBottom: 4
    } }, "Remaining fluid for EN"), /* @__PURE__ */ React.createElement("div", { className: "num", style: {
      fontSize: 26,
      fontWeight: 500,
      lineHeight: 1.1,
      color: over ? "var(--crit)" : "var(--brand-2)"
    } }, over ? "0" : fmt(avail, 0), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-3)", marginLeft: 4, fontWeight: 400 } }, "mL/day")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", marginTop: 2 } }, over ? /* @__PURE__ */ React.createElement("span", { style: { color: "var(--crit)", fontWeight: 600 } }, "IV เกิน target ", fmt(Math.abs(avail), 0), " mL") : /* @__PURE__ */ React.createElement("span", null, "= ", fmt(availKg, 0), " mL/kg/d")));
  })(), !isMEN && calc.enVolPerKg > 100 && /* @__PURE__ */ React.createElement(Tile, { label: "Protein : Energy", value: calc.peRatio, unit: " g/100kcal", target: tPE, status: sPE, decimals: 1, max: 5 })))))), /* @__PURE__ */ React.createElement("div", { className: "card", style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "card-h clickable step2-card-h", onClick: () => toggleStep(2) }, /* @__PURE__ */ React.createElement(Icon, { name: "drop", size: 14, color: "var(--brand)" }), "Step 3 · TPN macronutrients", /* @__PURE__ */ React.createElement("span", { className: "step2-ctrl", style: { display: "flex", alignItems: "center", gap: 8, marginLeft: 10 }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "seg", style: { padding: 1 } }, /* @__PURE__ */ React.createElement("button", { className: route === "peripheral" ? "on" : "", onClick: () => setRoute("peripheral") }, "Peripheral"), /* @__PURE__ */ React.createElement("button", { className: route === "central" ? "on" : "", onClick: () => setRoute("central") }, "Central")), /* @__PURE__ */ React.createElement("span", { style: {
    padding: "2px 10px",
    borderRadius: 999,
    fontFamily: "IBM Plex Mono,monospace",
    fontSize: 11,
    fontWeight: 600,
    /* ok is deliberately NOT green (Praew, 2026-09-23: "ปกติให้เป็นเทา
       เหลือสีเฉพาะตอนผิดปกติ") — an in-range osmolarity is the common
       case, and colouring it spends the ward's attention on the state
       that needs none. warn/crit keep their status colours. */
    background: sOsm === "crit" ? "var(--crit-bg)" : sOsm === "warn" ? "var(--warn-bg)" : "var(--bg-2)",
    color: sOsm === "crit" ? "var(--crit)" : sOsm === "warn" ? "var(--warn)" : "var(--ink-2)"
  } }, "Osm ", calc.osm.toFixed(0), " mOsm/L", route === "peripheral" && calc.osm > 900 ? " ⚠️" : "")), !openSteps.has(2) && totalTPN_mL > 0 && /* @__PURE__ */ React.createElement("div", { className: "step-summary" }, /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, fmt(totalTPN_mL, 0), " mL/d"), calc.overfill > 1.001 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "prep ", fmt(calc.preparedVol, 0), " mL · ×", fmt(calc.overfill, 2)), /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, fmt(totalTPN_mL / 24, 2), " mL/hr"), calc.gir > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "GIR ", fmt(calc.gir, 1)), aaPerKg > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "AA ", aaPerKg), lipidPerKg > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "Lip ", fmt(calc.lipidBagVol / lipidDripHours, 2), " mL/hr")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("div", { className: `step-dot ${stepStatus[2]}` }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, color: "var(--ink-3)" } }, openSteps.has(2) ? "▲" : "▼"))), /* @__PURE__ */ React.createElement("div", { className: `accordion-body${openSteps.has(2) ? " open" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "card-b", style: { display: "flex", flexDirection: "column", gap: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { border: "1.5px solid var(--brand-line)", borderRadius: 8, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: {
    background: "var(--brand-bg)",
    padding: "6px 12px",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--brand-2)",
    display: "flex",
    alignItems: "center",
    gap: 6
  } }, "💉 TPN Aqueous Pump"), /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 28px 1fr", gap: 8, alignItems: "start" } }, /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Volume",
      unit: "mL/day",
      value: totalTPN_mL,
      onChange: setTotalTPN_mL,
      step: 1,
      hint: totalTPN_mL > 0 ? `= ${(totalTPN_mL / wtKg).toFixed(0)} mL/kg/d` : ""
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5, alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, visibility: "hidden" } }, " "), /* @__PURE__ */ React.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    fontSize: 18,
    color: "var(--ink-3)",
    lineHeight: 1
  } }, "↔")), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Rate",
      unit: "mL/hr",
      value: parseFloat((totalTPN_mL / 24).toFixed(2)),
      onChange: (r) => setTotalTPN_mL(parseFloat((r * 24).toFixed(2))),
      step: 0.05,
      hint: totalTPN_mL > 0 ? `= ${totalTPN_mL.toFixed(0)} mL/day` : "ใส่ rate pump"
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "start" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "ปริมาตรคาสาย (dead space)",
      unit: "mL/day",
      value: deadVol_mL,
      onChange: setDeadVol_mL,
      step: 1,
      hint: `${deadVol_mL > 0 ? "stays in the line" : "0 = no overfill"}${D.defaultDeadVolFor(patient) > 0 ? ` · NICU/SCN starts at ${D.defaultDeadVolFor(patient)}` : ""}`
    }
  ), /* @__PURE__ */ React.createElement(PresetChips, { values: [0, 10, 20, 30], current: deadVol_mL, onSelect: setDeadVol_mL })), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 10px", background: "var(--bg-2)", borderRadius: 6, fontSize: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" } }, "Prepared (เตรียมจริง)"), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontWeight: 700, fontSize: 15, color: "var(--ink)" } }, fmt(calc.preparedVol, 1), " mL/day"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, marginTop: 1 } }, "delivered ", fmt(totalTPN_mL, 1), " mL")), /* @__PURE__ */ React.createElement("div", { style: {
    padding: "8px 10px",
    borderRadius: 6,
    fontSize: 12,
    background: calc.overfill > 1.001 ? "var(--brand-bg)" : "var(--bg-2)"
  } }, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" } }, "Factor"), /* @__PURE__ */ React.createElement("div", { className: "num", style: {
    fontWeight: 700,
    fontSize: 15,
    color: calc.overfill > 1.001 ? "var(--brand-2)" : "var(--ink)"
  } }, fmt(calc.factor, 3)), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, marginTop: 1 } }, calc.overfill > 1.001 ? `= ${fmt(wtKg, 2)} kg × ${fmt(calc.overfill, 3)} overfill` : "no overfill — doses use actual weight"))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "start" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Dextrose final",
      unit: "%",
      value: dexPct,
      onChange: setDexPct,
      step: 0.5,
      hint: dexPct > 0 ? `${fmt(calc.dexG, 1)} g/d delivered · ${fmt(calc.dexGPerKg, 1)} g/kg/d (max ${D.MAX_DEXTROSE_G_KG})${calc.overfill > 1.001 ? ` · ${fmt(calc.dexG_bag, 1)} g in bag` : ""}` : ""
    }
  ), /* @__PURE__ */ React.createElement(PresetChips, { values: [5, 7.5, 10, 12.5, 15], current: dexPct, onSelect: setDexPct, suffix: "%" }), calc.d50wVol > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 4, padding: "4px 8px", background: "var(--brand-bg)", borderRadius: 4, fontSize: 11 } }, "D50W: ", /* @__PURE__ */ React.createElement("span", { className: "num", style: { fontWeight: 700, color: "var(--brand-2)" } }, fmt(calc.d50wVol, 1), " mL/d"), route === "peripheral" && dexPct > 12.5 && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--crit)", fontWeight: 700, marginLeft: 6 } }, "⚠️ Central only!"))), /* @__PURE__ */ React.createElement("div", { className: `gir-readout s-${sGir}`, style: {
    background: `linear-gradient(180deg,${sGir === "crit" ? "var(--crit-bg)" : sGir === "warn" ? "var(--warn-bg)" : "var(--ok-bg)"},#fff 70%)`,
    border: `1.5px solid ${sGir === "crit" ? "var(--crit-line)" : sGir === "warn" ? "var(--warn-line)" : "var(--ok-line)"}`,
    borderRadius: 8,
    padding: "8px 12px",
    position: "relative",
    overflow: "hidden"
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    background: sGir === "crit" ? "var(--crit)" : sGir === "warn" ? "var(--warn)" : "var(--ok)"
  } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--ink-3)", fontWeight: 600, letterSpacing: "0.04em" } }, "GIR"), /* @__PURE__ */ React.createElement("div", { className: "num", style: {
    fontSize: 26,
    fontWeight: 500,
    lineHeight: 1.1,
    color: sGir === "crit" ? "var(--crit)" : sGir === "warn" ? "var(--warn)" : "var(--ok)"
  } }, fmt(calc.gir, 1), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-3)", marginLeft: 4, fontWeight: 400 } }, "mg/kg/min")), /* @__PURE__ */ React.createElement(Meter, { value: calc.gir || 0, target: tGir, max: 16, optimal: [8, 10], statusAt: girStatusAt }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--ink-3)", marginTop: 2 } }, "target 8–10 · max 12"))), /* @__PURE__ */ React.createElement("div", { className: "s2-aa-row", style: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
    alignItems: "center",
    padding: "8px 10px",
    background: "var(--bg-2)",
    borderRadius: 6
  } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(NumField, { label: `Amino acid (${S[aaStockKey].short})`, unit: "g/kg/d", value: aaPerKg, onChange: setAaPerKg, step: 0.1 }), /* @__PURE__ */ React.createElement(PresetChips, { values: [1.5, 2, 2.5, 3, 3.5], current: aaPerKg, onSelect: setAaPerKg }), aaChoices.length > 1 && /* @__PURE__ */ React.createElement("div", { className: "aa-product", style: { display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, color: "var(--ink-3)" } }, "Product"), /* @__PURE__ */ React.createElement("div", { className: "seg", style: { padding: 1 } }, aaChoices.map((k) => /* @__PURE__ */ React.createElement("button", { key: k, className: aaStockKey === k ? "on" : "", onClick: () => setAaProduct(k) }, S[k].short)))), S[aaStockKey].caution && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--warn)", fontWeight: 600, marginTop: 2 } }, "⚠ ", S[aaStockKey].caution)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--ink-2)" } }, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" } }, calc.overfill > 1.001 ? "In bag / delivered" : "Total"), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontWeight: 600, fontSize: 15 } }, calc.overfill > 1.001 ? /* @__PURE__ */ React.createElement(React.Fragment, null, fmt(calc.aaG_bag, 1), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ink-3)", fontWeight: 400 } }, " / ", fmt(calc.aaG, 1)), " g/day") : /* @__PURE__ */ React.createElement(React.Fragment, null, fmt(calc.aaG, 1), " g/day"))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--brand-2)", fontWeight: 600 } }, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" } }, "Volume"), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontWeight: 700, fontSize: 15 } }, fmt(calc.solVol.aa, 1), " mL/day"))), (totalTPN_mL > 0 || zeroVolumeBag) && /* @__PURE__ */ React.createElement("div", { style: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    background: calc.wfiVol < 0 ? "var(--crit-bg)" : "var(--bg-2)",
    border: calc.wfiVol < 0 ? "1.5px solid var(--crit-line)" : "1px solid var(--line-2)"
  } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" } }, "Components"), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontWeight: 600, fontSize: 15 } }, fmt(calc.componentVol, 1), " mL")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" } }, "WFI q.s."), /* @__PURE__ */ React.createElement("div", { className: "num", style: {
    fontWeight: 700,
    fontSize: 15,
    color: calc.wfiVol < 0 ? "var(--crit)" : "var(--brand-2)"
  } }, fmt(calc.wfiVol, 1), " mL")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" } }, "Bag total (prepared)"), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontWeight: 600, fontSize: 15 } }, fmt(calc.preparedVol, 1), " mL")), calc.wfiVol < 0 && /* @__PURE__ */ React.createElement("div", { style: { gridColumn: "1 / -1", fontSize: 11, color: "var(--crit)", fontWeight: 600 } }, "⚠️ Components exceed the bag by ", fmt(Math.abs(calc.wfiVol), 1), " mL — cannot be compounded.")))), /* @__PURE__ */ React.createElement("div", { style: { border: "1.5px solid var(--warn-line)", borderRadius: 8, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: {
    background: "var(--warn-bg)",
    padding: "6px 12px",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--warn-ink)",
    display: "flex",
    alignItems: "center",
    gap: 6
  } }, "🫙 Lipid Pump — separate pump"), /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: {
    background: "linear-gradient(180deg,var(--warn-bg),#fff 70%)",
    border: "1.5px solid var(--warn-line)",
    borderRadius: 8,
    padding: "10px 14px",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10
  } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "var(--warn)" } }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--ink-3)", fontWeight: 600, letterSpacing: "0.04em" } }, "PUMP RATE"), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontSize: 30, fontWeight: 700, lineHeight: 1.15, color: "var(--warn-ink)" } }, calc.lipidBagVol > 0 ? fmt(calc.lipidBagVol / lipidDripHours, 2) : "—", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, color: "var(--ink-3)", marginLeft: 5, fontWeight: 400 } }, "mL/hr")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", marginTop: 1 } }, fmt(calc.lipidBagVol, 1), " mL/day over ", lipidDripHours, " h"), lipidPerKg > 0 && /* @__PURE__ */ React.createElement("div", { className: "lipid-gkgh", style: { fontSize: 12, fontWeight: 600, color: "var(--warn-ink)", marginTop: 2 } }, "= ", /* @__PURE__ */ React.createElement("span", { className: "num" }, fmt(lipidPerKg / lipidDripHours, 3)), " g/kg/h")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--ink-3)", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 4 } }, "INFUSE OVER"), /* @__PURE__ */ React.createElement("div", { className: "seg", style: { padding: 1 } }, [16, 20, 24].map((h) => /* @__PURE__ */ React.createElement("button", { key: h, className: lipidDripHours === h ? "on" : "", onClick: () => setLipidDripHours(h) }, h, "h"))))), /* @__PURE__ */ React.createElement("div", { className: "s2-lip-row", style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(NumField, { label: "SMOF Lipid 20%", unit: "g/kg/d", value: lipidPerKg, onChange: setLipidPerKg, step: 0.1 }), /* @__PURE__ */ React.createElement(PresetChips, { values: [0.5, 1, 2, 3, 4], current: lipidPerKg, onSelect: setLipidPerKg })), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 10px", background: "var(--bg-2)", borderRadius: 6, fontSize: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" } }, "SMOF volume"), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontWeight: 700, fontSize: 15, color: "var(--ink)" } }, lipidPerKg > 0 ? fmt(calc.solVol.lipidSMOF, 1) : "—", " mL/day"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, marginTop: 1 } }, lipidPerKg > 0 ? `${fmt(calc.lipidG, 1)} g/day` : "", lipidPerKg > 0 && wtKg > 0 && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 6, color: "var(--brand-2)", fontWeight: 600 } }, "= ", fmt(lipidPerKg * 5, 1), " mL/kg/d"))), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 10px", background: "var(--bg-2)", borderRadius: 6, fontSize: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" } }, "+ Vitalipid N"), /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontWeight: 700, fontSize: 15, color: "var(--ink)" } }, fmt(calc.vitalipidVol, 1), " mL/day"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)", fontSize: 10, marginTop: 1 } }, "4 mL/kg (max 10)"))), calc.lipidBagVol > 0 && /* @__PURE__ */ React.createElement("div", { style: {
    padding: "7px 10px",
    background: "var(--bg-2)",
    borderRadius: 6,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 12
  } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ink-2)" } }, "Lipid bag total (SMOF + Vitalipid)"), /* @__PURE__ */ React.createElement("span", { className: "num", style: { fontWeight: 700, color: "var(--ink)" } }, fmt(calc.lipidBagVol, 1), " mL/day")))), /* @__PURE__ */ React.createElement("div", { className: "metric-tiles-4", style: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 } }, /* @__PURE__ */ React.createElement(Tile, { label: "Energy (total)", value: calc.kcalKg, unit: " kcal/kg/d", target: tKcal, status: sKcal, statusAt: kcalStatusAt, decimals: 0, max: 180 }), /* @__PURE__ */ React.createElement(Tile, { label: "Protein", value: calc.proteinKg, unit: " g/kg/d", target: tPro, status: sPro, statusAt: proStatusAt, decimals: 1, max: 5.5 }), /* @__PURE__ */ React.createElement(Tile, { label: "Lipid (total)", value: calc.lipidKgTotal, unit: " g/kg/d", target: tLip, status: sLip, decimals: 1, max: 7 }), /* @__PURE__ */ React.createElement(Tile, { label: "NPC : Protein", value: calc.npeN, unit: " kcal/g AA", target: tNPE, status: sNPE, decimals: 0, max: 60 }), /* @__PURE__ */ React.createElement(Tile, { label: "Osmolarity", value: calc.osm, unit: " mOsm/L", target: route === "peripheral" ? [0, 900] : [0, 1800], status: sOsm, statusAt: osmStatusAt, decimals: 0, max: route === "peripheral" ? 1100 : 2200 })), isMEN && calc.enVolTotal > 0 && /* @__PURE__ */ React.createElement("div", { className: "men-note", style: { fontSize: 11.5, color: "var(--ink-2)", padding: "6px 10px", background: "var(--bg-2)", borderRadius: 6 } }, "นม MEN (trophic) ", /* @__PURE__ */ React.createElement("span", { className: "num" }, fmt(calc.enVolPerKg, 0)), " mL/kg/d ไม่นับในค่ารวม — Energy, Protein, Lipid ด้านบน และ Na K Ca P ใน Step 4")))), /* @__PURE__ */ React.createElement("div", { className: "card", style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "card-h clickable", onClick: () => toggleStep(3) }, /* @__PURE__ */ React.createElement(Icon, { name: "drop", size: 14, color: "var(--brand)" }), "Step 4 · Electrolytes", !openSteps.has(3) && naCl + kCl + caPerKg + glycophosP > 0 && /* @__PURE__ */ React.createElement("div", { className: "step-summary" }, naCl > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "Na ", fmt(calc.naKg, 1), " mEq/kg"), kCl > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "K ", fmt(calc.kKg, 1), " mEq/kg"), caPerKg > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "Ca ", caPerKg, " mg/kg"), glycophosP > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "P ", glycophosP, " mL/kg Glycophos")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("div", { className: `step-dot ${stepStatus[3]}` }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, color: "var(--ink-3)" } }, openSteps.has(3) ? "▲" : "▼"))), /* @__PURE__ */ React.createElement("div", { className: `accordion-body${openSteps.has(3) ? " open" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(TwoCol, null, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.05, marginBottom: 4 } }, "Na (mEq/kg)"), /* @__PURE__ */ React.createElement(SaltRow, { label: S.naCl.label, note: `${S.naCl.naMeqPerMl} mEq Na/mL`, perKg: naCl, onChange: setNaCl, wtKg }), /* @__PURE__ */ React.createElement(PresetChips, { values: [1, 2, 3, 4], current: naCl, onSelect: setNaCl }), calc.solVol.naCl > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--brand-2)", paddingLeft: 2, marginTop: 1, marginBottom: 3 } }, fmt(naCl, 1), " mEq Na/kg/d = ", fmt(naCl / S.naCl.naMeqPerMl, 2), " mL/kg/d", /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)" } }, "เตรียม ", fmt(calc.solVol.naCl, 1), " mL/d", calc.overfill > 1.001 && ` = ถึงผู้ป่วย ${fmt(naCl / S.naCl.naMeqPerMl * wtKg, 1)} + คาสาย ${fmt(calc.solVol.naCl - naCl / S.naCl.naMeqPerMl * wtKg, 1)} mL`)), /* @__PURE__ */ React.createElement(SaltRow, { label: S.naAcetate.label, note: `metabolic acidosis · ${S.naAcetate.naMeqPerMl} mEq Na/mL`, perKg: naAcet, onChange: setNaAcet, wtKg }), /* @__PURE__ */ React.createElement(PresetChips, { values: [1, 2, 3, 4], current: naAcet, onSelect: setNaAcet }), calc.solVol.naAcet > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--brand-2)", paddingLeft: 2, marginTop: 1, marginBottom: 3 } }, fmt(naAcet, 1), " mEq Na/kg/d = ", fmt(naAcet / S.naAcetate.naMeqPerMl, 2), " mL/kg/d", /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)" } }, "เตรียม ", fmt(calc.solVol.naAcet, 1), " mL/d", calc.overfill > 1.001 && ` = ถึงผู้ป่วย ${fmt(naAcet / S.naAcetate.naMeqPerMl * wtKg, 1)} + คาสาย ${fmt(calc.solVol.naAcet - naAcet / S.naAcetate.naMeqPerMl * wtKg, 1)} mL`)), /* @__PURE__ */ React.createElement(
    SaltRow,
    {
      label: "Glycophos® (ใส่เป็น Na)",
      note: "ใส่ mEq Na/kg · 2 mEq Na = 1 mL = 1 mmol P (31 mg)",
      perKg: glycophosP * 2,
      onChange: (v) => setGlycophosP(v / 2),
      wtKg,
      unit: "mEq Na/kg",
      mlPerKg: glycophosP
    }
  ), /* @__PURE__ */ React.createElement(PresetChips, { values: [1, 2, 3, 4], current: glycophosP * 2, onSelect: (v) => setGlycophosP(v / 2) }), /* @__PURE__ */ React.createElement("div", { className: "glycophos-p", style: { fontSize: 11.5, fontWeight: 700, color: glycophosP > 0 ? "var(--brand-2)" : "var(--ink-3)", paddingLeft: 2, marginTop: 1 } }, "→ P ", fmt(glycophosP, 2), " mmol/kg/d = ", fmt(glycophosP * 31, 0), " mg/kg/d"), glycophosP > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--brand-2)", paddingLeft: 2, marginTop: 1, marginBottom: 3 } }, fmt(glycophosP * 2, 1), " mEq Na/kg/d = ", fmt(glycophosP, 2), " mL/kg/d · P ", fmt(glycophosP * 31, 0), " mg/kg/d", /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)" } }, "เตรียม ", fmt(calc.solVol.glycophos, 1), " mL/d", calc.overfill > 1.001 && ` = ถึงผู้ป่วย ${fmt(glycophosP * wtKg, 1)} + คาสาย ${fmt(calc.solVol.glycophos - glycophosP * wtKg, 1)} mL`)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.05, margin: "12px 0 4px" } }, "K (mEq/kg)"), /* @__PURE__ */ React.createElement(SaltRow, { label: S.kCl.label, note: `${S.kCl.kMeqPerMl} mEq K/mL`, perKg: kCl, onChange: setKCl, wtKg }), /* @__PURE__ */ React.createElement(PresetChips, { values: [1, 2, 3, 4], current: kCl, onSelect: setKCl }), calc.solVol.kCl > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--brand-2)", paddingLeft: 2, marginTop: 1, marginBottom: 3 } }, fmt(kCl, 1), " mEq K/kg/d = ", fmt(kCl / S.kCl.kMeqPerMl, 2), " mL/kg/d", /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)" } }, "เตรียม ", fmt(calc.solVol.kCl, 1), " mL/d", calc.overfill > 1.001 && ` = ถึงผู้ป่วย ${fmt(kCl / S.kCl.kMeqPerMl * wtKg, 1)} + คาสาย ${fmt(calc.solVol.kCl - kCl / S.kCl.kMeqPerMl * wtKg, 1)} mL`)), /* @__PURE__ */ React.createElement(SaltRow, { label: "K₂HPO₄", note: "1 mEq K/mL · P 15.5 mg/mEq K", perKg: k2hpo4, onChange: setK2HPO4, wtKg }), /* @__PURE__ */ React.createElement(PresetChips, { values: [1, 2, 3, 4], current: k2hpo4, onSelect: setK2HPO4 }), calc.solVol.k2hpo4 > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--brand-2)", paddingLeft: 2, marginTop: 1, marginBottom: 3 } }, fmt(k2hpo4, 1), " mEq K/kg/d = ", fmt(k2hpo4 / S.k2hpo4.kMeqPerMl, 2), " mL/kg/d · P ", fmt(k2hpo4 * S.k2hpo4.pMgPerKMeq, 0), " mg/kg/d", /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)" } }, "เตรียม ", fmt(calc.solVol.k2hpo4, 2), " mL/d", calc.overfill > 1.001 && ` = ถึงผู้ป่วย ${fmt(k2hpo4 / S.k2hpo4.kMeqPerMl * wtKg, 2)} + คาสาย ${fmt(calc.solVol.k2hpo4 - k2hpo4 / S.k2hpo4.kMeqPerMl * wtKg, 2)} mL`)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.05, margin: "12px 0 4px" } }, "Mg (mEq/kg + mg/kg) · Ca (mg/kg)"), /* @__PURE__ */ React.createElement(SaltRow, { label: "MgSO₄", note: `${(mgStrength === "50" ? S.mgso4_50 : S.mgso4_10).mgMeqPerMl} mEq/mL`, perKg: mgPerKg, onChange: setMgPerKg, wtKg }), /* @__PURE__ */ React.createElement(PresetChips, { values: [0.2, 0.4, 0.6], current: mgPerKg, onSelect: setMgPerKg }), mgPerKg > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--brand-2)", paddingLeft: 2, marginTop: 1, marginBottom: 3 } }, fmt(mgPerKg, 2), " mEq Mg/kg/d = ", fmt(mgPerKg * D.MG_MG_PER_MEQ, 1), " mg/kg/d"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, color: "var(--ink-3)" } }, "Vial ", mgStrength, "%"), calc.solVol.mg > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, color: "var(--brand-2)", fontWeight: 600 } }, "→ ", calc.solVol.mg, " mL/d"), mgStrength !== "10" && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, color: "var(--warn-ink)", fontWeight: 600 } }, "Saved as ", mgStrength, "% — KCMH stocks 10% only", " ", /* @__PURE__ */ React.createElement("button", { type: "button", className: "preset-chip", onClick: () => setMgStrength("10") }, "Use 10%"))), /* @__PURE__ */ React.createElement(SaltRow, { label: S.caGluconate.label, note: `Elemental Ca ${fmt(S.caGluconate.caMgPerMl, 1)} mg/mL · Ca:P ~1.7:1`, perKg: caPerKg, onChange: setCaPerKg, wtKg, unit: "mg/kg/d" }), /* @__PURE__ */ React.createElement(PresetChips, { values: [32, 60, 80, 100], current: caPerKg, onSelect: setCaPerKg }), calc.solVol.ca > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--brand-2)", paddingLeft: 2, marginTop: 1, marginBottom: 3 } }, "→ ", calc.solVol.ca, " mL/d")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React.createElement(Tile, { label: "Sodium", value: calc.naTotalDelivered, unit: " mEq/kg/d", target: tNa, status: sNa, decimals: 1, max: 7 }), /* @__PURE__ */ React.createElement(Tile, { label: "Potassium", value: calc.kTotalDelivered, unit: " mEq/kg/d", target: tK, status: sK, decimals: 1, max: 4 }), /* @__PURE__ */ React.createElement(Tile, { label: "K⁺ in bag", value: calc.kMeqPerL, unit: " mEq/L", target: [0, D.MAX_K_MEQ_PER_L], status: sKConc, statusAt: kConcStatusAt, decimals: 0, max: D.MAX_K_MEQ_PER_L * 2 }), /* @__PURE__ */ React.createElement("div", { className: "k-conc-ref", style: { marginTop: -4, fontSize: 10.5, textAlign: "right", color: "var(--ink-3)" } }, "max ", D.MAX_K_MEQ_PER_L, " (KCMH) · ref. peripheral ", D.K_REF_MEQ_PER_L.peripheral, " / central ", D.K_REF_MEQ_PER_L.central, " mEq/L"), /* @__PURE__ */ React.createElement(Tile, { label: "Magnesium", value: mgPerKg, unit: " mEq/kg/d", target: tMg, status: sMg, decimals: 2, max: 1 }), mgPerKg > 0 && /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "mg-mgkg",
      style: { marginTop: -4, fontSize: 10.5, textAlign: "right", color: "var(--ink-3)" },
      title: "ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Mihatsch): preterm, first days 0.1–0.2 mmol (2.5–5.0 mg)/kg/d; growing 0.2–0.3 mmol (5.0–7.5 mg)/kg/d · 1 mmol Mg = 2 mEq"
    },
    "= ",
    fmt(mgPerKg * D.MG_MG_PER_MEQ, 1),
    " mg/kg/d · TPN only"
  ), /* @__PURE__ */ React.createElement(Tile, { label: "Calcium", value: calc.caKg, unit: " mg/kg/d", target: tCa, status: sCa, decimals: 0, max: 140 }), /* @__PURE__ */ React.createElement(Tile, { label: "Phosphorus", value: calc.pKg, unit: " mg/kg/d", target: tP, status: sP, decimals: 0, max: 90 }), /* @__PURE__ */ React.createElement(Tile, { label: "Ca:P ratio", value: calc.caP, unit: ":1 (mass)", target: tCaP, status: sCaP, decimals: 2, max: 2.5 })))))), /* @__PURE__ */ React.createElement("div", { className: "card", style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "card-h clickable", onClick: () => toggleStep(4) }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 14, color: "var(--brand)" }), "Step 5 · Vitamins · Trace Elements · Heparin", !openSteps.has(4) && /* @__PURE__ */ React.createElement("div", { className: "step-summary" }, inclSoluvit && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "Soluvit ", fmt(calc.soluvitVol, 1), " mL"), inclPeditrace && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "Peditrace ", fmt(calc.peditrace_vol, 1), " mL"), znPerKg > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "ZnSO₄ ", znPerKg, " mg Zn/kg"), /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "Heparin ", heparinUmL, " U/mL")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("div", { className: `step-dot ${stepStatus[4]}` }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, color: "var(--ink-3)" } }, openSteps.has(4) ? "▲" : "▼"))), /* @__PURE__ */ React.createElement("div", { className: `accordion-body${openSteps.has(4) ? " open" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(TwoCol, null, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "sub-h" }, "5. Multivitamin"), /* @__PURE__ */ React.createElement(
    Chk,
    {
      label: "Soluvit N® (water-soluble vitamins)",
      value: inclSoluvit,
      onChange: setInclSoluvit,
      hint: inclSoluvit ? `${fmt(calc.soluvitVol, 1)} mL/day in bag${calc.overfill > 1.001 ? ` (× Factor → delivers ${fmt(calc.soluvitVol * calc.deliveredFrac, 1)})` : ""}  ·  ${S.soluvit.mlPerKg} mL/kg/day (max ${S.soluvit.maxMl} mL/day) · add to aqueous PN` : "Not included"
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "sub-h", style: { marginTop: 14 } }, "6. Trace Elements"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React.createElement(
    Chk,
    {
      label: `Peditrace (Zn ${S.peditrace.znMgPerMl * 1e3} µg/mL)`,
      value: inclPeditrace,
      onChange: setInclPeditrace,
      hint: inclPeditrace ? `${fmt(calc.peditrace_vol, 1)} mL/day in bag${calc.overfill > 1.001 ? ` (× Factor → delivers ${fmt(calc.peditrace_vol * calc.deliveredFrac, 1)})` : ""}  ·  ${S.peditrace.mlPerKg} mL/kg/day (max ${S.peditrace.maxMl} mL) · add to aqueous PN` : "Not included"
    }
  ), !centerPoint && /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "ZnSO₄ (เพิ่มจาก Peditrace)",
      unit: "mg Zn/kg/d",
      value: znPerKg,
      onChange: setZnPerKg,
      step: 0.05,
      hint: znPerKg > 0 ? `elemental Zn · = ${fmt(calc.znSO4_mg, 2)} mg/day ถึงผู้ป่วย${calc.overfill > 1.001 ? ` · ${fmt(calc.znSO4_bag_mg, 2)} mg ในถุง (× Factor)` : ""}` : "elemental Zn · ไม่ให้เพิ่ม = เว้นว่าง"
    }
  ), calc.znTotal_mg > 0 && /* @__PURE__ */ React.createElement("div", { className: "zn-total", style: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 6,
    background: calc.znTotal_mg > D.MAX_ZN_MG_DAY ? "var(--crit-bg)" : "var(--bg-2)",
    color: calc.znTotal_mg > D.MAX_ZN_MG_DAY ? "var(--crit)" : "var(--ink-2)"
  } }, "Zinc รวม ", /* @__PURE__ */ React.createElement("strong", { className: "num" }, fmt(calc.znTotal_mg, 2), " mg/day"), " = ", /* @__PURE__ */ React.createElement("span", { className: "num" }, fmt(wtKg > 0 ? calc.znTotal_mg / wtKg : 0, 2)), " mg/kg/d", /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--ink-3)" } }, "Peditrace ", /* @__PURE__ */ React.createElement("span", { className: "num" }, fmt(calc.znPeditrace_mg, 2)), " + ZnSO₄ ", /* @__PURE__ */ React.createElement("span", { className: "num" }, fmt(calc.znSO4_mg, 2)), " · max ", D.MAX_ZN_MG_DAY, " mg/day"))), /* @__PURE__ */ React.createElement("div", { className: "sub-h", style: { marginTop: 14 } }, "7. Heparin"), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Heparin",
      unit: "U/mL",
      value: heparinUmL,
      onChange: setHeparinUmL,
      step: 0.5,
      hint: `Normal 0.5–1 U/mL · total ${fmt(heparinUmL * calc.preparedVol, 0)} U/day → ${fmt(calc.solVol.heparin, 2)} mL of ${S.heparin.unitsPerMl} U/mL`
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { background: "var(--bg-2)", borderRadius: 8, padding: "16px", display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { className: "sub-h", style: { marginTop: 0 } }, "Additives Summary"), /* @__PURE__ */ React.createElement(
    MiniReadout,
    {
      label: "Vitalipid N Infant (fat-sol.)",
      value: fmt(calc.vitalipidVol, 1),
      unit: "mL/day",
      color: "var(--brand-2)"
    }
  ), /* @__PURE__ */ React.createElement(
    MiniReadout,
    {
      label: "Soluvit N (water-sol.)",
      value: inclSoluvit ? fmt(calc.soluvitVol, 1) : "—",
      unit: inclSoluvit ? "mL/day" : "",
      color: inclSoluvit ? "var(--brand-2)" : "var(--ink-3)"
    }
  ), /* @__PURE__ */ React.createElement(
    MiniReadout,
    {
      label: "Peditrace",
      value: inclPeditrace ? fmt(calc.peditrace_vol, 1) : "—",
      unit: inclPeditrace ? "mL/day" : "",
      color: inclPeditrace ? "var(--brand-2)" : "var(--ink-3)"
    }
  ), /* @__PURE__ */ React.createElement(MiniReadout, { label: "Heparin", value: heparinUmL, unit: "U/mL" }), /* @__PURE__ */ React.createElement(
    MiniReadout,
    {
      label: `Heparin ${S.heparin.unitsPerMl} U/mL — volume`,
      value: fmt(calc.solVol.heparin, 2),
      unit: "mL/day",
      color: "var(--brand-2)"
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "var(--surface)", fontSize: 11, color: "var(--ink-3)", borderTop: "1px solid var(--line-2)" } }, "💡 Vitalipid → ", /* @__PURE__ */ React.createElement("strong", null, "lipid bag"), /* @__PURE__ */ React.createElement("br", null), "Soluvit + Peditrace → ", /* @__PURE__ */ React.createElement("strong", null, "aqueous PN bag"), /* @__PURE__ */ React.createElement("br", null), "Heparin 0.5–1 U/mL → ", /* @__PURE__ */ React.createElement("strong", null, "aqueous PN bag"))))))), /* @__PURE__ */ React.createElement("div", { className: "card", style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "card-h clickable", onClick: () => toggleStep(6) }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 14, color: "var(--brand)" }), "Step 6 · Enteral Supplements", !openSteps.has(6) && (suppVitD > 0 || suppCa > 0 || suppPO4 > 0 || suppMTV || suppFerdek > 0) && /* @__PURE__ */ React.createElement("div", { className: "step-summary" }, suppVitD > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "Vit D ", suppVitD, " IU/kg"), suppCa > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "Ca ", suppCa, " mg/kg"), suppPO4 > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "PO₄ ", suppPO4, " mg/kg"), suppMTV && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "MTV ✓"), suppFerdek > 0 && /* @__PURE__ */ React.createElement("span", { className: "step-summary-chip" }, "Fe ", suppFerdek, " mg/kg")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("div", { className: `step-dot ${suppVitD > 0 || suppCa > 0 || suppPO4 > 0 || suppMTV || suppFerdek > 0 ? "done" : "empty"}` }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, color: "var(--ink-3)" } }, openSteps.has(6) ? "▲" : "▼"))), /* @__PURE__ */ React.createElement("div", { className: `accordion-body${openSteps.has(6) ? " open" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement("div", { className: "guidelines-grid" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "sub-h" }, "Multivitamin — Munti-vim Drop"), /* @__PURE__ */ React.createElement(
    Chk,
    {
      label: "Munti-vim Drop 1 mL/day",
      value: suppMTV,
      onChange: setSuppMTV,
      hint: "Vit D3 400 IU · Vit A 2000 IU · B1/B2/B3/B6/B12 · Vit C 40 mg · 1 mL/day · ให้พร้อมอาหาร"
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "sub-h", style: { marginTop: 14 } }, "Iron (oral)"), /* @__PURE__ */ React.createElement("div", { className: "field", style: { marginBottom: 6 } }, /* @__PURE__ */ React.createElement("label", null, "ผลิตภัณฑ์"), /* @__PURE__ */ React.createElement("select", { className: "sel", style: { height: 38 }, value: suppFeType, onChange: (e) => setSuppFeType(e.target.value) }, Object.entries(D.SUPP_DB).filter(([, v]) => v.category === "fe").map(
    ([k, v]) => /* @__PURE__ */ React.createElement("option", { key: k, value: k }, v.label, " · ", v.fe_mg_per_ml, " mg elem Fe/mL")
  ))), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Iron",
      unit: "mg/kg/day elem Fe",
      value: suppFerdek,
      onChange: setSuppFerdek,
      step: 0.5,
      hint: (() => {
        const prod = D.SUPP_DB[suppFeType];
        const totalMg = suppFerdek * wtKg;
        const vol = prod && totalMg > 0 ? totalMg / prod.fe_mg_per_ml : 0;
        return suppFerdek > 0 && wtKg > 0 ? `= ${fmt(totalMg, 1)} mg elem Fe/day · ${fmt(vol, 2)} mL/day (${prod?.label})` : `ESPGHAN 2022: 2–3 mg/kg/day · เริ่มอายุ 2–4 สัปดาห์`;
      })()
    }
  ), /* @__PURE__ */ React.createElement(PresetChips, { values: [2, 3, 4], current: suppFerdek, onSelect: setSuppFerdek })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "sub-h" }, "Calcium (oral)"), /* @__PURE__ */ React.createElement("div", { className: "field", style: { marginBottom: 6 } }, /* @__PURE__ */ React.createElement("label", null, "ผลิตภัณฑ์"), /* @__PURE__ */ React.createElement("select", { className: "sel", style: { height: 38 }, value: suppCaType, onChange: (e) => setSuppCaType(e.target.value) }, Object.entries(D.SUPP_DB).filter(([, v]) => v.category === "ca").map(
    ([k, v]) => /* @__PURE__ */ React.createElement("option", { key: k, value: k }, v.label, " — ", v.ca_mg_per_unit, " mg elem Ca/tab")
  ))), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "ปริมาณ elem Ca",
      unit: "mg/kg/day",
      value: suppCa,
      onChange: setSuppCa,
      step: 10,
      hint: (() => {
        const prod = D.SUPP_DB[suppCaType];
        const totalMg = suppCa * wtKg;
        const tabs = prod && totalMg > 0 ? totalMg / prod.ca_mg_per_unit : 0;
        return suppCa > 0 && wtKg > 0 ? `= ${Math.round(totalMg)} mg/day · ${fmt(tabs, 2)} tab/day (${prod?.label})` : `ESPGHAN 2022 target: 120–200 mg/kg/day · ${D.SUPP_DB[suppCaType]?.note || ""}`;
      })()
    }
  ), /* @__PURE__ */ React.createElement(PresetChips, { values: [50, 80, 100, 120], current: suppCa, onSelect: setSuppCa }), /* @__PURE__ */ React.createElement("div", { className: "sub-h", style: { marginTop: 14 } }, "Phosphate (oral)"), /* @__PURE__ */ React.createElement("div", { className: "field", style: { marginBottom: 6 } }, /* @__PURE__ */ React.createElement("label", null, "ผลิตภัณฑ์"), /* @__PURE__ */ React.createElement("select", { className: "sel", style: { height: 38 }, value: suppPO4Type, onChange: (e) => setSuppPO4Type(e.target.value) }, Object.entries(D.SUPP_DB).filter(([, v]) => v.category === "po4").map(
    ([k, v]) => /* @__PURE__ */ React.createElement("option", { key: k, value: k }, v.label, " · ", v.unitVol, " mL = ", (v.po4_mg_per_ml * v.unitVol).toFixed(0), " mg P")
  ))), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "ปริมาณ elem P",
      unit: "mg/kg/day",
      value: suppPO4,
      onChange: setSuppPO4,
      step: 5,
      hint: (() => {
        const prod = D.SUPP_DB[suppPO4Type];
        const totalMg = suppPO4 * wtKg;
        const vol = prod && totalMg > 0 ? totalMg / prod.po4_mg_per_ml : 0;
        return suppPO4 > 0 && wtKg > 0 ? `= ${fmt(totalMg, 1)} mg/day (${fmt(totalMg / 31, 2)} mmol) · ${fmt(vol, 1)} mL/day (${prod?.label})` : `ESPGHAN 2022 target: 2.2–3.7 mmol/kg/day (~68–115 mg/kg/day) · ${D.SUPP_DB[suppPO4Type]?.note || ""}`;
      })()
    }
  ), /* @__PURE__ */ React.createElement(PresetChips, { values: [30, 40, 60], current: suppPO4, onSelect: setSuppPO4 }), suppCa > 0 && suppPO4 > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--warn)", marginTop: 3 } }, "⚠ ให้ทั้ง Ca และ P — บริหารยาคนละเวลา หรือห่างกันอย่างน้อย 1 ชั่วโมง"), /* @__PURE__ */ React.createElement("div", { className: "sub-h", style: { marginTop: 14 } }, "Vitamin D drops"), /* @__PURE__ */ React.createElement(
    NumField,
    {
      label: "Vitamin D",
      unit: "IU/kg/day",
      value: suppVitD,
      onChange: setSuppVitD,
      step: 100,
      hint: suppVitD > 0 && wtKg > 0 ? `= ${Math.round(suppVitD * wtKg)} IU/day · ESPGHAN 2022: 400–700 IU/kg` : "ESPGHAN 2022: 400–700 IU/kg/day"
    }
  ), /* @__PURE__ */ React.createElement(PresetChips, { values: [400, 500, 600, 700], current: suppVitD, onSelect: setSuppVitD, suffix: " IU/kg" }), suppMTV && suppVitD > 0 && /* @__PURE__ */ React.createElement("div", { className: "vitd-total", style: { fontSize: 10.5, color: "var(--warn)", marginTop: 3 } }, "⚠ Munti-vim มี D3 400 IU อยู่แล้ว — รวมเป็น ", Math.round(suppVitD * wtKg + 400), " IU/day"), (suppVitD > 0 || suppCa > 0 || suppPO4 > 0 || suppMTV || suppFerdek > 0) && /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 14,
    padding: "12px 14px",
    background: "var(--brand-bg)",
    border: "1px solid var(--brand-line)",
    borderRadius: 8
  } }, /* @__PURE__ */ React.createElement("div", { style: {
    fontSize: 11,
    color: "var(--ink-3)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 8
  } }, "Supplement order / day"), suppMTV && /* @__PURE__ */ React.createElement(MiniReadout, { label: "Munti-vim Drop", value: "1", unit: "mL/day", color: "var(--brand-2)" }), suppVitD > 0 && wtKg > 0 && /* @__PURE__ */ React.createElement(MiniReadout, { label: "Vitamin D", value: `${Math.round(suppVitD * wtKg)} IU`, unit: "/day", color: "var(--brand-2)" }), suppCa > 0 && wtKg > 0 && (() => {
    const prod = D.SUPP_DB[suppCaType];
    const tabs = prod ? suppCa * wtKg / prod.ca_mg_per_unit : 0;
    return /* @__PURE__ */ React.createElement(
      MiniReadout,
      {
        label: `Ca · ${prod?.label}`,
        value: `${Math.round(suppCa * wtKg)} mg`,
        unit: `→ ${fmt(tabs, 2)} tab/day`,
        color: "var(--brand-2)"
      }
    );
  })(), suppPO4 > 0 && wtKg > 0 && (() => {
    const prod = D.SUPP_DB[suppPO4Type];
    const vol = prod ? suppPO4 * wtKg / prod.po4_mg_per_ml : 0;
    return /* @__PURE__ */ React.createElement(
      MiniReadout,
      {
        label: `PO₄ · ${prod?.label}`,
        value: `${fmt(suppPO4 * wtKg, 1)} mg`,
        unit: `→ ${fmt(vol, 1)} mL/day`,
        color: "var(--brand-2)"
      }
    );
  })(), suppFerdek > 0 && wtKg > 0 && (() => {
    const prod = D.SUPP_DB[suppFeType];
    const vol = prod ? suppFerdek * wtKg / prod.fe_mg_per_ml : 0;
    return /* @__PURE__ */ React.createElement(
      MiniReadout,
      {
        label: `Fe · ${prod?.label}`,
        value: `${fmt(suppFerdek * wtKg, 1)} mg`,
        unit: `→ ${fmt(vol, 2)} mL/day`,
        color: "var(--brand-2)"
      }
    );
  })()))), (mineral.hasOral || mineral.hasIV) && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-2)" } }, /* @__PURE__ */ React.createElement("div", { className: "sub-h", style: { marginTop: 0, textTransform: "none", letterSpacing: "0.02em", fontSize: 12 } }, "สรุป Ca · PO₄ · Ca:P ratio"), /* @__PURE__ */ React.createElement("div", { style: { border: "1px solid var(--line-2)", borderRadius: 8, overflow: "hidden", marginBottom: 12 } }, /* @__PURE__ */ React.createElement("div", { style: {
    display: "grid",
    gridTemplateColumns: "1.3fr 1fr 1fr 0.9fr",
    gap: 6,
    padding: "7px 10px",
    background: "var(--bg-2)",
    fontSize: 10.5,
    color: "var(--ink-3)",
    fontWeight: 600,
    letterSpacing: "0.03em"
  } }, /* @__PURE__ */ React.createElement("span", null, "แหล่ง"), /* @__PURE__ */ React.createElement("span", { style: { textAlign: "right" } }, "Ca"), /* @__PURE__ */ React.createElement("span", { style: { textAlign: "right" } }, "PO₄"), /* @__PURE__ */ React.createElement("span", { style: { textAlign: "right" } }, "Ca:P")), /* @__PURE__ */ React.createElement(CaPRow, { label: "TPN (IV)", ca: mineral.tpnCa, p: mineral.tpnP, ratio: mineral.tpnCaP }), (mineral.enCa > 0 || mineral.enP > 0) && /* @__PURE__ */ React.createElement(CaPRow, { label: "EN (นม)", ca: mineral.enCa, p: mineral.enP, ratio: null }), /* @__PURE__ */ React.createElement(CaPRow, { label: "Oral supplement", ca: mineral.oralCa, p: mineral.oralP, ratio: mineral.oralCaP, highlight: true }), /* @__PURE__ */ React.createElement(CaPRow, { label: "รวมทั้งหมด", ca: mineral.totCa, p: mineral.totP, ratio: mineral.totCaP, total: true }), /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 10px", fontSize: 10, color: "var(--ink-4)", background: "var(--bg-2)" } }, "หน่วย mg/kg/day (elemental) · Ca:P = mass ratio", !mineral.hasIV && " · ยังไม่มี Ca/PO₄ จาก TPN หรือนม")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 } }, "รวม TPN + EN + oral supplement · เทียบเป้าหมาย", /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 400, color: "var(--ink-4)" } }, " ", "(", calc.useEnteralTargets ? "ESPGHAN 2022 enteral" : "ESPGHAN 2018 parenteral", ")")), /* @__PURE__ */ React.createElement("div", { className: "capo4-tiles" }, /* @__PURE__ */ React.createElement(Tile, { label: "Calcium (total)", value: mineral.totCa, unit: " mg/kg/d", target: tCa, status: sTotCa, decimals: 0, max: 220 }), /* @__PURE__ */ React.createElement(Tile, { label: "Phosphate (total)", value: mineral.totP, unit: " mg/kg/d", target: tP, status: sTotP, decimals: 0, max: 130 }), /* @__PURE__ */ React.createElement(Tile, { label: "Ca:P ratio (total)", value: mineral.totCaP, unit: ":1 (mass)", target: tCaP, status: sTotCaP, decimals: 2, max: 2.5, exact: true })), mineral.oralCa > 0 && mineral.oralP === 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--warn)", marginTop: 8 } }, "⚠ ให้ Ca ทางปากโดยไม่มี PO₄ — ตรวจสอบ ratio รวมก่อนสั่ง"))))), /* @__PURE__ */ React.createElement("div", { className: "calc-bottom", style: { display: "grid", gridTemplateColumns: "1fr 1fr 280px", gap: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "info", size: 14, color: "var(--brand)" }), "Energy distribution", /* @__PURE__ */ React.createElement("span", { className: "h-meta" }, calc.kcalKg.toFixed(0), " kcal/kg/d")), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, /* @__PURE__ */ React.createElement(KcalBar, { cho: calc.kcalChoPct, pro: calc.kcalProtPct, fat: calc.kcalFatPct }), /* @__PURE__ */ React.createElement("div", { className: "kcal-legend", style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", marginTop: 14, gap: 10 } }, /* @__PURE__ */ React.createElement(KcalLegend, { color: "oklch(75% 0.13 80)", label: "CHO", pct: calc.kcalChoPct, target: "45–55%" }), /* @__PURE__ */ React.createElement(KcalLegend, { color: "oklch(55% 0.13 155)", label: "Protein", pct: calc.kcalProtPct, target: "10–15%" }), /* @__PURE__ */ React.createElement(KcalLegend, { color: "oklch(60% 0.11 25)", label: "Fat", pct: calc.kcalFatPct, target: "35–45%" })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12, borderTop: "1px solid var(--line-2)", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-3)" } }, /* @__PURE__ */ React.createElement("span", null, "TPN ", /* @__PURE__ */ React.createElement("span", { className: "num", style: { color: "var(--ink)" } }, calc.tpnKcal.toFixed(0))), /* @__PURE__ */ React.createElement("span", null, "EN ", /* @__PURE__ */ React.createElement("span", { className: "num", style: { color: "var(--ink)" } }, calc.enKcal.toFixed(0)), isMEN && calc.enVolTotal > 0 && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 4 } }, "(MEN — not counted)")), /* @__PURE__ */ React.createElement("span", null, "EN share ", /* @__PURE__ */ React.createElement("span", { className: "num", style: { color: "var(--ink)" } }, calc.totalKcal > 0 ? (calc.enKcal / calc.totalKcal * 100).toFixed(0) : 0, "%"))))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: "bell", size: 14, color: "var(--brand)" }), "Active alerts", /* @__PURE__ */ React.createElement("span", { className: "h-meta" }, alerts.length, " flagged")), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, alerts.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "alert-row info" }, /* @__PURE__ */ React.createElement("div", { className: "ico" }, /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 12, color: "#fff" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "title" }, "No safety flags"), /* @__PURE__ */ React.createElement("div", { className: "body" }, "Every prescribed nutrient is within its target range."))) : sortClinicalAlerts(alerts).map(
    (a, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: `alert-row ${a.level}` }, /* @__PURE__ */ React.createElement("div", { className: "ico" }, a.level === "crit" ? "!" : "!"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "title" }, a.title), /* @__PURE__ */ React.createElement("div", { className: "body" }, a.body), /* @__PURE__ */ React.createElement("div", { className: "meta" }, "Ref: ", a.ref)))
  ))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-h" }, /* @__PURE__ */ React.createElement(Icon, { name: scratch ? "calc" : "save", size: 14, color: "var(--brand)" }), " ", scratch ? "ผลคำนวณ · คัดลอก" : "Save + Copy Order"), /* @__PURE__ */ React.createElement("div", { className: "card-b" }, scratch && /* @__PURE__ */ React.createElement("div", { className: "scratch-note", role: "note", style: {
    fontSize: 11.5,
    lineHeight: 1.55,
    marginBottom: 10,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--warn-bg)",
    color: "var(--warn)",
    border: "1px solid var(--warn-line)"
  } }, /* @__PURE__ */ React.createElement("strong", { style: { fontWeight: 700 } }, "Calculator — ไม่บันทึกลง Google Sheets"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 400 } }, "ไม่ผูกกับผู้ป่วยรายใด ไม่มีใน Daily log และไม่พิมพ์ใบสั่ง TPN — ปิดหน้านี้แล้วตัวเลขทั้งหมดจะหายไป")), ordersReadOnly && /* @__PURE__ */ React.createElement("div", { className: "nurse-readonly-note", role: "note", style: {
    fontSize: 11.5,
    lineHeight: 1.55,
    marginBottom: 10,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-2)",
    color: "var(--ink-2)",
    border: "1px solid var(--line)"
  } }, /* @__PURE__ */ React.createElement("strong", { style: { fontWeight: 700 } }, "พยาบาล: ใช้ Calculator คำนวณได้ — บันทึกและ Submit ใบสั่งทำโดยแพทย์"), /* @__PURE__ */ React.createElement("div", null, "บันทึก I/O ประจำวันที่ Dashboard › I/O ประจำวัน · คัดลอก/พิมพ์ได้เฉพาะคำสั่งที่แพทย์บันทึกแล้ว")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--ink-3)", marginBottom: 10 } }, /* @__PURE__ */ React.createElement("span", { className: "num" }, scratch ? "ไม่ผูกกับผู้ป่วย" : patient?.name || patient?.initials || "—"), " · DOL ", /* @__PURE__ */ React.createElement("span", { className: "num" }, dol), " · ", curWtG, "g", usingBirthWeight && /* @__PURE__ */ React.createElement(React.Fragment, null, " (calc. at birth weight ", wtG, "g)"), tpnWtManual && /* @__PURE__ */ React.createElement(React.Fragment, null, " (calc. weight set manually to ", wtG, "g)"), " · ", route === "central" ? "Central" : "Peripheral"), !centerPoint && !scratch && savedEntryId && savedMeta?.by && /* @__PURE__ */ React.createElement("div", { className: "saved-by", style: { fontSize: 11.5, color: "var(--ink-3)", marginBottom: 10 } }, "บันทึกโดย ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--ink-2)", fontWeight: 600 } }, savedMeta.by), " · ", savedAtLabelOf(savedMeta.at)), savedEntryId && dirty && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--warn)", fontWeight: 600, marginBottom: 8 } }, "● มีการแก้ไขที่ยังไม่ได้บันทึก — พิมพ์/คัดลอกได้หลังบันทึก"), !centerPoint && savedEntryId && !dirty && !printable && !zeroVolumeBag && /* @__PURE__ */ React.createElement("div", { className: "print-blocked", role: "alert", style: { fontSize: 11.5, color: "var(--crit)", fontWeight: 600, marginBottom: 8, lineHeight: 1.5 } }, "● ", printBlockMessage("ก่อนพิมพ์/คัดลอก"), !pendingSave && dosingWeightChanged && /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 400 } }, "บันทึกไว้ที่ ", /* @__PURE__ */ React.createElement("span", { className: "num" }, fmt(savedDosingWt.g, 0)), " g · ตอนนี้ ", /* @__PURE__ */ React.createElement("span", { className: "num" }, fmt(wtG, 0)), " g"), !pendingSave && !dosingWeightChanged && uncoveredCritical.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 400 } }, uncoveredCritical.join(" · "))), previousEntry && /* @__PURE__ */ React.createElement("div", { className: "order-changes", style: { fontSize: 11.5, marginBottom: 10, padding: "8px 10px", background: "var(--bg-2)", borderRadius: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, color: "var(--ink-2)", marginBottom: 4 } }, "เปลี่ยนแปลงจากคำสั่งก่อนหน้า (DOL ", D.entryDol(patient, previousEntry), ")"), !orderChanges ? /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)" } }, "คำสั่งก่อนหน้าไม่มีข้อมูลละเอียดให้เปรียบเทียบ") : orderChanges.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { color: "var(--ink-3)" } }, "ไม่มีการเปลี่ยนแปลง") : orderChanges.map((c) => /* @__PURE__ */ React.createElement("div", { key: c.label, className: "num", style: { color: "var(--ink)" } }, c.label, ": ", c.from, " → ", /* @__PURE__ */ React.createElement("strong", null, c.to), " ", c.unit))), /* @__PURE__ */ React.createElement("div", { className: "calc-save-bar" }, !centerPoint && /* @__PURE__ */ React.createElement("button", { className: "btn", style: { width: "100%", marginBottom: 8 }, onClick: () => {
    if (!scratch && !savedEntryId) {
      showToast(ordersReadOnly ? "คัดลอกได้เฉพาะคำสั่งที่แพทย์บันทึกแล้ว" : "กรุณาบันทึกคำสั่งให้สำเร็จก่อนคัดลอก", "error");
      return;
    }
    if (!scratch && !printable) {
      showToast(printBlockMessage("ก่อนคัดลอก") || "มีการแก้ไขที่ยังไม่ได้บันทึก — กดบันทึกก่อนคัดลอก", "error");
      return;
    }
    if (scratch && !(wtKg > 0)) {
      showToast("ใส่น้ำหนักก่อน จึงจะคัดลอกผลคำนวณได้", "error");
      return;
    }
    const stepDisplayNumber = { 1: 1, 2: 3, 3: 4 };
    const incomplete = Object.entries(stepStatus).filter(([n, s]) => s === "empty" && ["1", "2", "3"].includes(n)).map(([n]) => `Step ${stepDisplayNumber[n]}`);
    if (incomplete.length > 0 && !window.confirm(`${incomplete.join(", ")} ยังไม่ได้กรอก
Copy order ต่อไปหรือไม่?`)) return;
    const lines = [
      scratch ? `══ NeoFeed — Calculator (ไม่ใช่คำสั่งการรักษา) ══` : `══ NeoFeed V2 — TPN Order ══`,
      // The quick calc's text carries no bed and no NeoFeed ID —
      // there is no patient behind it — and says so on its own
      // second line, because a paste into LINE arrives without the
      // screen it came from.
      scratch ? `⚠ คำนวณจากน้ำหนักที่พิมพ์เอง · ไม่ผูกกับผู้ป่วย · ไม่ได้บันทึกในระบบ — ตรวจกับผู้ป่วยจริงก่อนใช้` : `Bed: ${patient?.currentBed || "—"} | NeoFeed ID: ${patient?.sessionId || "—"} | DOL: ${dol} | Wt: ${curWtG}g${usingBirthWeight ? ` (calc. at birth weight ${wtG}g)` : ""}${tpnWtManual ? ` (calc. weight set manually to ${wtG}g; auto ${autoWtG}g)` : ""}`,
      scratch ? `DOL: ${dol} | Wt: ${curWtG} g${tpnWtManual ? ` (calc. weight ${wtG}g)` : ""}` : "",
      critOverride ? `⚠ CRITICAL OVERRIDE — แพทย์ยืนยันคำสั่ง: ${critOverride.alerts.join("; ")} — reason: ${critOverride.reason}` : "",
      `Route: ${route === "central" ? "Central" : "Peripheral (<900 mOsm/L)"}`,
      // Every figure below goes through fmt: at most the decimals
      // shown, never a trailing zero (Praew, 2026-09-22). The stock
      // mL in solVol/soluvitVol/peditrace_vol are already rounded
      // to the mL pharmacy draws up, and print as they are.
      `Osm: ${fmt(calc.osm, 0)} mOsm/L`,
      `──────────────────────────────`,
      `FLUID: Target ${fluidTargetPerKg} mL/kg/d = ${fmt(fluidTargetPerKg * calc.wtKg, 0)} mL/day`,
      `  TPN aqueous: ${fmt(totalTPN_mL, 1)} mL/day delivered → Rate ${fmt(totalTPN_mL / 24, 2)} mL/hr`,
      calc.overfill > 1.001 ? `  PREPARE:     ${fmt(calc.preparedVol, 1)} mL/day (+${fmt(deadVol_mL, 1)} mL ปริมาตรคาสาย) · Factor ${fmt(calc.factor, 3)} = ${fmt(calc.wtKg, 2)} kg × ${fmt(calc.overfill, 3)}` : `  PREPARE:     ${fmt(calc.preparedVol, 1)} mL/day (no overfill)`,
      `  Lipid bag:   ${fmt(calc.lipidBagVol, 1)} mL/day over ${lipidDripHours}h → Rate ${fmt(calc.lipidBagVol / lipidDripHours, 2)} mL/hr${lipidPerKg > 0 ? ` (${fmt(lipidPerKg / lipidDripHours, 3)} g/kg/h)` : ""}`,
      `  Prescribed:  ${fmt(calc.prescribedFluid, 0)} mL/day | Remaining: ${fmt(calc.remaining, 1)} mL`,
      `──────────────────────────────`,
      `DEXTROSE: ${dexPct}% → D50W ${calc.d50wVol} mL/day | ${fmt(calc.dexG_bag, 1)} g in bag, ${fmt(calc.dexG, 1)} g delivered = ${fmt(calc.dexGPerKg, 1)} g/kg/d (max ${D.MAX_DEXTROSE_G_KG})`,
      `  GIR: ${fmt(calc.gir, 1)} mg/kg/min`,
      `AA (${S[aaStockKey].short}): ${aaPerKg} g/kg/d → ${fmt(calc.aaG_bag, 1)} g in bag = ${calc.solVol.aa} mL/day (${fmt(calc.aaG, 1)} g delivered)`,
      `Lipid (SMOF 20%): ${lipidPerKg} g/kg/d = ${fmt(calc.lipidG, 1)} g/d → ${calc.solVol.lipidSMOF} mL/day`,
      `Vitalipid N Infant: ${fmt(calc.vitalipidVol, 1)} mL/day → lipid bag`,
      `──────────────────────────────`,
      `ELECTROLYTES (ordered per kg → amount IN BAG → mL of stock):`,
      naCl > 0 ? `  ${S.naCl.label}:    ${naCl} mEq/kg → ${fmt(naCl * calc.factor, 1)} mEq → ${calc.solVol.naCl} mL` : "",
      naAcet > 0 ? `  Na Acetate:   ${naAcet} mEq/kg → ${fmt(naAcet * calc.factor, 1)} mEq → ${calc.solVol.naAcet} mL` : "",
      glycophosP > 0 ? `  Glycophos®:   ${glycophosP} mL/kg → ${calc.solVol.glycophos} mL (Na ${fmt(glycophosP * 2 * calc.factor, 1)} mEq | P ${fmt(glycophosP * 31 * calc.factor, 0)} mg)` : "",
      `  Total Na:     ${fmt(calc.bag.na_mEq, 1)} mEq in bag = ${fmt(calc.naKg, 1)} mEq/kg/d delivered`,
      kCl > 0 ? `  KCl (${S.kCl.kMeqPerMl} mEq/mL): ${kCl} mEq/kg → ${fmt(kCl * calc.factor, 1)} mEq → ${calc.solVol.kCl} mL` : "",
      k2hpo4 > 0 ? `  K2HPO4:       ${k2hpo4} mEq/kg → ${fmt(k2hpo4 * calc.factor, 1)} mEq → ${calc.solVol.k2hpo4} mL (P ${fmt(k2hpo4 * 15.5 * calc.factor, 0)} mg)` : "",
      `  Total K:      ${fmt(calc.bag.k_mEq, 1)} mEq in bag = ${fmt(calc.kKg, 1)} mEq/kg/d delivered (${fmt(calc.kMeqPerL, 0)} mEq/L, max ${D.MAX_K_MEQ_PER_L})`,
      caPerKg > 0 ? `  Ca-gluconate: ${caPerKg} mg/kg → ${fmt(caPerKg * calc.factor, 0)} mg → ${calc.solVol.ca} mL` : "",
      mgPerKg > 0 ? `  MgSO4 ${mgStrength}%:    ${mgPerKg} mEq/kg → ${fmt(mgPerKg * calc.factor, 2)} mEq → ${calc.solVol.mg} mL` : "",
      calc.caP > 0 ? `  Ca:P ratio:   ${isFinite(calc.caP) ? fmt(calc.caP, 2) : "!! (Ca ordered, P = 0)"}:1 (mass, TPN+EN)` : "",
      `──────────────────────────────`,
      inclSoluvit ? `Soluvit N:      ${calc.soluvitVol} mL/day → aqueous bag${calc.overfill > 1.001 ? ` (× Factor — delivers ${fmt(calc.soluvitVol * calc.deliveredFrac, 2)} mL)` : ""}` : "",
      inclPeditrace ? `Peditrace:      ${calc.peditrace_vol} mL/day → aqueous bag${calc.overfill > 1.001 ? ` (× Factor — delivers ${fmt(calc.peditrace_vol * calc.deliveredFrac, 2)} mL)` : ""}` : "",
      znPerKg > 0 ? `ZnSO₄:          ${znPerKg} mg Zn/kg → ${fmt(calc.znSO4_bag_mg, 2)} mg Zn in bag → aqueous bag (elemental Zn; its mL is not in the WFI below)` : "",
      calc.znTotal_mg > 0 ? `  Zn total ${fmt(calc.znTotal_mg, 2)} mg/day delivered (Peditrace ${fmt(calc.znPeditrace_mg, 2)} + ZnSO₄ ${fmt(calc.znSO4_mg, 2)}) · max ${D.MAX_ZN_MG_DAY} mg/day` : "",
      `Heparin:        ${heparinUmL} U/mL = ${calc.solVol.heparin} mL of ${S.heparin.unitsPerMl} U/mL`,
      `──────────────────────────────`,
      `BAG MAKE-UP:  components ${fmt(calc.componentVol, 1)} mL + WFI q.s. ${fmt(calc.wfiVol, 1)} mL = ${fmt(calc.preparedVol, 1)} mL prepared`,
      calc.wfiVol < 0 ? `  !! COMPONENTS EXCEED BAG VOLUME by ${fmt(Math.abs(calc.wfiVol), 1)} mL — cannot compound` : "",
      `──────────────────────────────`,
      calc.enVolPerKg > 0 ? `EN: ${D.EN_DB[enType]?.label} | ${enVol} mL × ${enFreq} feeds = ${fmt(calc.enVolTotal, 2)} mL/day (${fmt(calc.enVolPerKg, 0)} mL/kg/d)${isMEN ? " [MEN — not counted in fluid or nutrition]" : ""}` : "EN: None",
      `──────────────────────────────`,
      suppVitD > 0 || suppCa > 0 || suppPO4 > 0 || suppMTV || suppFerdek > 0 ? `ENTERAL SUPPLEMENTS:` : `SUPPLEMENTS: None`,
      suppMTV ? `  Munti-vim Drop: 1 mL/day  (D3 400 IU · Vit A 2000 IU)` : "",
      suppVitD > 0 && wtKg > 0 ? `  Vit D: ${suppVitD} IU/kg/d = ${Math.round(suppVitD * wtKg)} IU/day` : "",
      suppCa > 0 && wtKg > 0 ? `  Ca oral (${D.SUPP_DB[suppCaType]?.label}): ${suppCa} mg/kg/d = ${Math.round(suppCa * wtKg)} mg/day → ${fmt(suppCa * wtKg / (D.SUPP_DB[suppCaType]?.ca_mg_per_unit || 1), 2)} tab/day` : "",
      suppPO4 > 0 && wtKg > 0 ? `  PO₄ oral (${D.SUPP_DB[suppPO4Type]?.label}): ${suppPO4} mg/kg/d = ${fmt(suppPO4 * wtKg, 1)} mg/day → ${fmt(suppPO4 * wtKg / (D.SUPP_DB[suppPO4Type]?.po4_mg_per_ml || 1), 1)} mL/day` : "",
      suppFerdek > 0 && wtKg > 0 ? `  Fe oral (${D.SUPP_DB[suppFeType]?.label}): ${suppFerdek} mg/kg/d = ${fmt(suppFerdek * wtKg, 1)} mg/day → ${fmt(suppFerdek * wtKg / (D.SUPP_DB[suppFeType]?.fe_mg_per_ml || 1), 2)} mL/day` : "",
      mineral.hasOral || mineral.hasIV ? `──────────────────────────────` : "",
      mineral.hasOral || mineral.hasIV ? `Ca · PO₄ · Ca:P (mg/kg/d elemental):` : "",
      mineral.tpnCa > 0 || mineral.tpnP > 0 ? `  TPN (IV):         Ca ${fmt(mineral.tpnCa, 0)} | P ${fmt(mineral.tpnP, 0)} | ${mineral.tpnCaP > 0 ? fmt(mineral.tpnCaP, 2) + ":1" : "—"}` : "",
      mineral.enCa > 0 || mineral.enP > 0 ? `  EN (นม):          Ca ${fmt(mineral.enCa, 0)} | P ${fmt(mineral.enP, 0)}` : "",
      mineral.hasOral ? `  Oral supplement:  Ca ${fmt(mineral.oralCa, 0)} | P ${fmt(mineral.oralP, 0)} | ${mineral.oralCaP > 0 ? fmt(mineral.oralCaP, 2) + ":1" : "—"}` : "",
      mineral.hasOral || mineral.hasIV ? `  TOTAL:            Ca ${fmt(mineral.totCa, 0)} | P ${fmt(mineral.totP, 0)} | ${mineral.totCaP > 0 ? fmt(mineral.totCaP, 2) + ":1" : "—"} (target ${tCaP[0]}–${tCaP[1]}:1)` : "",
      `──────────────────────────────`,
      `SUMMARY: Protein ${fmt(calc.proteinKg, 1)} g/kg | Energy ${fmt(calc.kcalKg, 0)} kcal/kg | GIR ${fmt(calc.gir, 1)} mg/kg/min`,
      `Na ${fmt(calc.naTotalDelivered, 1)} mEq/kg | Ca ${fmt(calc.caKg, 0)} mg/kg | P ${fmt(calc.pKg, 0)} mg/kg  (TPN+EN — see Ca·PO₄ block above for total)`,
      scratch ? `══ NeoFeed · Calculator · ESPGHAN 2018/2022 · ไม่ได้บันทึก ══` : `══ NeoFeed V2 · ESPGHAN 2018/2022 ══`
    ].filter((l) => l !== "").join("\n");
    navigator.clipboard.writeText(lines).then(() => showToast("📋 Order copied to clipboard")).catch(() => showToast("Copy failed — try again"));
  } }, "📋 ", scratch ? "คัดลอกผลคำนวณ" : "Copy Order to Clipboard"), missingFields.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--crit)", marginBottom: 8, lineHeight: 1.5 } }, "ยังกรอกไม่ครบ (", missingFields.length, ") — ต้องกรอกทุกช่องใน Step 1", centerPoint ? "" : " และ Intake / Output", " ก่อน", centerPoint ? "บันทึก" : " Submit (บันทึกร่างไว้ก่อนได้)", ":", /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600 } }, missingFields.map((f) => f.label).join(" · "))), zeroVolumeBag && /* @__PURE__ */ React.createElement("div", { className: "zero-volume-bag", role: "alert", style: { fontSize: 11.5, color: "var(--crit)", fontWeight: 600, marginBottom: 8, lineHeight: 1.5 } }, zeroVolumeText, " — บันทึก/พิมพ์ไม่ได้"), isDraftSaved && !dirty && /* @__PURE__ */ React.createElement("div", { className: "draft-note", style: { fontSize: 11.5, color: "var(--warn-ink)", fontWeight: 600, marginBottom: 8 } }, "● บันทึกเป็นแบบร่าง — ยังพิมพ์ไม่ได้ จนกว่าจะกรอกครบและกด Submit"), !scratch && !centerPoint && !ordersReadOnly && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn save-draft",
      style: { width: "100%", marginBottom: 8 },
      disabled: saving || pendingSave || savedStatus === "submitted" && !!savedEntryId,
      title: savedStatus === "submitted" && savedEntryId ? "Submit แล้ว — แก้ไขแล้วกด Submit อีกครั้ง" : "บันทึกไว้ก่อน แม้ยังกรอกไม่ครบ — พิมพ์ไม่ได้จนกว่าจะ Submit",
      onClick: () => handleSave(true)
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "save", size: 14 }),
    " ",
    saving ? "กำลังบันทึก..." : "Save draft (บันทึกร่าง)"
  ), !scratch && !ordersReadOnly && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn primary",
      style: { width: "100%" },
      disabled: saving || missingFields.length > 0 || zeroVolumeBag || pendingSave,
      onClick: () => handleSave(false)
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 14, color: "#fff" }),
    " ",
    saving ? "กำลังบันทึก..." : centerPoint ? "บันทึก" : "Submit"
  ), D.ENABLE_PUBLISH_GATE && !centerPoint && !scratch && !ordersReadOnly && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn primary",
      style: { width: "100%", marginTop: 8 },
      disabled: !savedEntryId || published || publishing || !printable,
      onClick: handlePublish
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 14, color: "#fff" }),
    publishing ? "กำลังส่ง..." : published ? "ส่งแล้ว" : "Submit"
  ), savedEntryId && !pendingSave && onDelete && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn",
      style: { width: "100%", marginTop: 8, color: "var(--crit)", borderColor: "var(--crit-line)" },
      onClick: handleDelete
    },
    /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 14, color: "var(--crit)" }),
    " ลบบันทึกนี้"
  ))))), printable && !centerPoint && !scratch && /* @__PURE__ */ React.createElement(
    PrintOrderForm,
    {
      targets: { na: tNa, k: tK, ca: tCa, p: tP, mg: tMg, source: tileRef },
      savedMeta,
      critOverride,
      orderChanges,
      previousDol: previousEntry ? D.entryDol(patient, previousEntry) : null,
      patient,
      dol,
      wtG,
      wtKg,
      curWtG,
      usingBirthWeight,
      tpnWtManual,
      autoWtG,
      route,
      orderDate: editEntry?.ts || logDate || newOrderDate,
      dexPct,
      totalTPN_mL,
      entryId: savedEntryId,
      published: D.ENABLE_PUBLISH_GATE ? published : true,
      aaPerKg,
      lipidPerKg,
      lipidDripHours,
      naCl,
      naAcet,
      glycophosP,
      kCl,
      k2hpo4,
      mgPerKg,
      mgStrength,
      caPerKg,
      inclSoluvit,
      inclPeditrace,
      znPerKg,
      inclAddamel,
      heparinUmL,
      calc,
      suppVitD,
      suppCa,
      suppCaType,
      suppPO4,
      suppPO4Type,
      suppMTV,
      suppFerdek,
      suppFeType,
      mineral
    }
  ));
}
function ElecRow({ label, note, values, current, onSelect, wtKg, unit = "mEq/kg", solVol }) {
  const active = current > 0;
  return /* @__PURE__ */ React.createElement("div", { style: {
    display: "grid",
    gridTemplateColumns: "140px 1fr auto",
    gap: 10,
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px dashed var(--line-2)"
  } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--ink)", fontWeight: 500 } }, label), note && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--ink-3)" } }, note)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: `preset-chip${current === 0 ? " active" : ""}`,
      style: { fontSize: 11, padding: "3px 9px", opacity: current === 0 ? 1 : 0.5 },
      onClick: () => onSelect(0)
    },
    "—"
  ), values.map((v) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: v,
      className: `preset-chip${current === v ? " active" : ""}`,
      style: { fontSize: 11, padding: "3px 9px" },
      onClick: () => onSelect(current === v ? 0 : v)
    },
    v
  )), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "var(--ink-3)", marginLeft: 2 } }, unit)), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right", minWidth: 90 } }, active ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "num", style: { fontSize: 12, fontWeight: 600, color: "var(--ink)" } }, "= ", fmt(current * wtKg, 1), " ", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "var(--ink-3)" } }, unit.replace("/kg", ""), "/d")), solVol > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--brand-2)", fontWeight: 600 } }, "→ ", solVol, " mL/day")) : /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--ink-4)" } }, "—")));
}
function PresetChips({ values, current, onSelect, suffix = "" }) {
  return /* @__PURE__ */ React.createElement("div", { className: "preset-chips" }, values.map((v) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: v,
      className: `preset-chip${current === v ? " active" : ""}`,
      onClick: () => onSelect(v)
    },
    v,
    suffix
  )));
}
function CaPRow({ label, ca, p, ratio, highlight, total }) {
  const dim = ca === 0 && p === 0;
  return /* @__PURE__ */ React.createElement("div", { style: {
    display: "grid",
    gridTemplateColumns: "1.3fr 1fr 1fr 0.9fr",
    gap: 6,
    padding: "8px 10px",
    alignItems: "baseline",
    borderTop: "1px solid var(--line-2)",
    background: total ? "var(--surface)" : highlight ? "var(--bg-2)" : "transparent",
    fontWeight: total ? 600 : 400
  } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5, color: total ? "var(--brand-2)" : "var(--ink-3)" } }, label), /* @__PURE__ */ React.createElement("span", { className: "num", style: { fontSize: 12.5, textAlign: "right", color: dim ? "var(--ink-4)" : "var(--ink)" } }, fmt(ca, 0)), /* @__PURE__ */ React.createElement("span", { className: "num", style: { fontSize: 12.5, textAlign: "right", color: dim ? "var(--ink-4)" : "var(--ink)" } }, fmt(p, 0)), /* @__PURE__ */ React.createElement("span", { className: "num", style: { fontSize: 12.5, textAlign: "right", color: dim ? "var(--ink-4)" : "var(--ink)" } }, ratio === null ? "—" : ratio > 0 ? `${fmt(ratio, 2)}` : "—"));
}
function TwoCol({ children }) {
  return /* @__PURE__ */ React.createElement("div", { className: "two-col", style: { display: "grid", gridTemplateColumns: "1fr 280px", gap: 14 } }, children);
}
function KcalBar({ cho, pro, fat }) {
  return /* @__PURE__ */ React.createElement("div", { style: { height: 22, borderRadius: 6, overflow: "hidden", display: "flex", border: "1px solid var(--line)" } }, /* @__PURE__ */ React.createElement("div", { style: { width: `${cho}%`, background: "oklch(75% 0.13 80)" } }), /* @__PURE__ */ React.createElement("div", { style: { width: `${pro}%`, background: "oklch(55% 0.13 155)" } }), /* @__PURE__ */ React.createElement("div", { style: { width: `${fat}%`, background: "oklch(60% 0.11 25)" } }));
}
function KcalLegend({ color, label, pct, target }) {
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" } }, /* @__PURE__ */ React.createElement("span", { style: { width: 10, height: 10, background: color, borderRadius: 2 } }), label), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, fontSize: 16, marginTop: 2 } }, pct.toFixed(0), "%"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--ink-3)" } }, target));
}
function PrintOrderForm({
  patient,
  dol,
  wtG,
  wtKg,
  curWtG,
  usingBirthWeight,
  tpnWtManual,
  autoWtG,
  route,
  orderDate,
  dexPct,
  totalTPN_mL,
  entryId,
  aaPerKg,
  lipidPerKg,
  lipidDripHours,
  naCl,
  naAcet,
  glycophosP,
  kCl,
  k2hpo4,
  mgPerKg,
  mgStrength,
  caPerKg,
  inclSoluvit,
  inclPeditrace,
  znPerKg,
  inclAddamel,
  heparinUmL,
  calc,
  suppVitD,
  suppCa,
  suppCaType,
  suppPO4,
  suppPO4Type,
  suppMTV,
  suppFerdek,
  suppFeType,
  mineral,
  published,
  targets,
  savedMeta,
  critOverride,
  orderChanges,
  previousDol
}) {
  const rng = (r) => r ? `${r[0]}–${r[1]}` : "—";
  const tgtNote = targets ? `NeoFeed target DOL ${dol} · ${targets.source}` : "";
  const savedAtLabel = savedAtLabelOf(savedMeta?.at);
  const f = (n, d = 1) => isFinite(n) && n > 0 ? D.displayNum(n, d) : "—";
  const f0 = (n) => isFinite(n) && n > 0 ? Math.round(n).toString() : "—";
  const fSigned = (n, d = 1) => D.displayNum(n, d);
  const normalizedOrderDate = D.normalizeDateStr(orderDate) || D.todayLocal();
  const orderDateLabel = (/* @__PURE__ */ new Date(`${normalizedOrderDate}T12:00:00`)).toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
  const printedAt = (/* @__PURE__ */ new Date()).toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
  const chk = (v) => v ? "☑" : "☐";
  const td = { border: "1px solid #999", padding: "3px 6px", verticalAlign: "top", fontSize: 10 };
  const tdr = { ...td, textAlign: "right" };
  const tdh = { ...td, background: "#f0f0f0", fontWeight: 600, textAlign: "center" };
  const tdGroup = { ...td, fontWeight: 700, background: "#fafafa" };
  const tdRx = (on) => on ? { ...td, fontWeight: 700 } : { ...td, color: "#555" };
  const plain = { fontWeight: 400 };
  const note = { fontSize: 9, color: "#555", fontWeight: 400 };
  const bag = totalTPN_mL > 0;
  const aaKey = calc.aaStockKey || "aminoven10";
  const orals = [
    suppMTV && /* @__PURE__ */ React.createElement("span", { key: "mtv" }, chk(true), " Munti-vim Drop ", /* @__PURE__ */ React.createElement("strong", null, "1"), " mL/day"),
    suppVitD > 0 && /* @__PURE__ */ React.createElement("span", { key: "vd" }, chk(true), " Vitamin D drops ", /* @__PURE__ */ React.createElement("strong", null, suppVitD), " IU/kg/d = ", /* @__PURE__ */ React.createElement("strong", null, Math.round(suppVitD * (wtKg || 0))), " IU/day"),
    suppCa > 0 && /* @__PURE__ */ React.createElement("span", { key: "ca" }, chk(true), " Ca oral (", D.SUPP_DB[suppCaType]?.label, ") ", /* @__PURE__ */ React.createElement("strong", null, suppCa), " mg/kg/d = ", /* @__PURE__ */ React.createElement("strong", null, f0(suppCa * (wtKg || 0))), " mg → ", f(suppCa * (wtKg || 0) / (D.SUPP_DB[suppCaType]?.ca_mg_per_unit || 1), 2), " tab/day"),
    suppPO4 > 0 && /* @__PURE__ */ React.createElement("span", { key: "po4" }, chk(true), " PO₄ oral (", D.SUPP_DB[suppPO4Type]?.label, ") ", /* @__PURE__ */ React.createElement("strong", null, suppPO4), " mg/kg/d = ", /* @__PURE__ */ React.createElement("strong", null, f0(suppPO4 * (wtKg || 0))), " mg → ", f(suppPO4 * (wtKg || 0) / (D.SUPP_DB[suppPO4Type]?.po4_mg_per_ml || 1), 1), " mL/day"),
    suppFerdek > 0 && /* @__PURE__ */ React.createElement("span", { key: "fe" }, chk(true), " Fe oral (", D.SUPP_DB[suppFeType]?.label, ") ", /* @__PURE__ */ React.createElement("strong", null, suppFerdek), " mg/kg/d = ", /* @__PURE__ */ React.createElement("strong", null, f(suppFerdek * (wtKg || 0), 1)), " mg → ", f(suppFerdek * (wtKg || 0) / (D.SUPP_DB[suppFeType]?.fe_mg_per_ml || 1), 2), " mL/day")
  ].filter(Boolean);
  const AA_CHOICES = [
    ["aminoven10", "10% Aminoven infant (0-1 yr.)"],
    [null, "10% Amiparen (>1 Yr.)"],
    [null, "8% Aminoleban"],
    [null, "7% Nephrosteril"],
    ["aminoplasmal15", "15% Aminoplasmal"]
  ];
  return /* @__PURE__ */ React.createElement("div", { id: "print-form", style: { position: "relative", fontFamily: "'IBM Plex Sans','Sarabun',serif", fontSize: 10.5, color: "#000", padding: "4mm 6mm", display: "none" } }, !published && /* @__PURE__ */ React.createElement("div", { "aria-hidden": "true", style: {
    position: "absolute",
    top: "45%",
    left: "50%",
    transform: "translate(-50%, -50%) rotate(-30deg)",
    fontSize: 44,
    fontWeight: 800,
    color: "rgba(200,0,0,0.28)",
    letterSpacing: 4,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: 10
  } }, "รอผลแลป"), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 4, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: 13 } }, "PEDIATRIC PARENTERAL NUTRITION ORDER FORM"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11 } }, "กลุ่มงานเภสัชกรรม ร.พ.จุฬาลงกรณ์")), /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", marginBottom: 4, fontSize: 10.5 } }, /* @__PURE__ */ React.createElement("tbody", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: { width: "45%" } }, "ชื่อ: ", /* @__PURE__ */ React.createElement("strong", null, patient?.name || patient?.initials || "—"), patient?.twinSuffix && /* @__PURE__ */ React.createElement("strong", null, " (Twin ", patient.twinSuffix, ")")), /* @__PURE__ */ React.createElement("td", { style: { width: "30%" } }, "NeoFeed ID: ", /* @__PURE__ */ React.createElement("strong", null, patient?.sessionId || "—")), /* @__PURE__ */ React.createElement("td", null, "วันที่ให้ TPN: ", /* @__PURE__ */ React.createElement("strong", null, orderDateLabel))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, "HN: ______________________"), /* @__PURE__ */ React.createElement("td", { colSpan: 2 }, "AN: ______________________ ", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: "#555" } }, "(เขียน/ติดสติกเกอร์ — ตรวจตัวตนกับแฟ้มผู้ป่วย)"))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, "อายุ: DOL ", /* @__PURE__ */ React.createElement("strong", null, dol), "   ตึก: ", /* @__PURE__ */ React.createElement("strong", null, patient?.currentBed || "—")), /* @__PURE__ */ React.createElement("td", { colSpan: 2 }, "โรค: ", /* @__PURE__ */ React.createElement("strong", null, patient?.diagnosis || "—"), "   ☐ Liver Dysfunction   ☐ Renal Dysfunction")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 3 }, "Nutritional Status: ☐ Normal   ☐ Mild   ☐ Moderate   ☐ Severe malnutrition")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, "Route of Delivery: ", route === "central" ? /* @__PURE__ */ React.createElement(React.Fragment, null, "☐ Peripheral (<900 mOsm/L)  ", /* @__PURE__ */ React.createElement("strong", null, "☑ Central")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, "☑ Peripheral"), " (<900 mOsm/L)  ☐ Central")), /* @__PURE__ */ React.createElement("td", { colSpan: 2 }, "Weight for calculation: ", /* @__PURE__ */ React.createElement("strong", null, f(wtKg, 2)), " Kg", usingBirthWeight && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: "#555" } }, " (birth weight — current ", curWtG, "g not yet regained)"), tpnWtManual && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: "#555" } }, " (กำหนดเอง — current ", curWtG, "g, อัตโนมัติ ", autoWtG, "g)"))))), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, borderBottom: "1px solid #000", marginBottom: 4 } }, "PARENTERAL NUTRITION FLUID:"), /* @__PURE__ */ React.createElement("table", { style: { width: "100%", marginBottom: 4, fontSize: 10.5 } }, /* @__PURE__ */ React.createElement("tbody", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, "Total Volume"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("strong", null, f(totalTPN_mL, 1)), " mL (Delivered Vol.) / ", /* @__PURE__ */ React.createElement("strong", null, f(calc.preparedVol, 1)), " mL (Prepared Vol.) / Day")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, "Dextrose"), /* @__PURE__ */ React.createElement("td", null, "Final Conc. ", /* @__PURE__ */ React.createElement("strong", null, dexPct || "—", "%"), " = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.dexG_bag, 1)), " g. (ในถุง) = ", /* @__PURE__ */ React.createElement("strong", null, wtKg ? f(calc.dexGPerKg, 2) : "—"), " g/kg/d = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.d50wVol, 1)), " mL (D50W)")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: { verticalAlign: "top" } }, "Amino acid"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", null, AA_CHOICES.map(([key, label]) => /* @__PURE__ */ React.createElement("div", { key: label, style: key === aaKey ? { fontWeight: 700 } : { color: "#555" } }, chk(key === aaKey), " ", label)), /* @__PURE__ */ React.createElement("div", { style: { color: "#555" } }, "☐ Other ........")), /* @__PURE__ */ React.createElement("div", null, "= ", /* @__PURE__ */ React.createElement("strong", null, f(aaPerKg, 2)), " g/kg/d = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.aa, 1)), " mL")))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, "Lipid"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { style: lipidPerKg > 0 ? { fontWeight: 700 } : void 0 }, chk(lipidPerKg > 0), " 20% SMOF"), "  ", /* @__PURE__ */ React.createElement("span", { style: { color: "#555" } }, "☐ 20% Intralipid  ☐ 20% Clinoleic  ☐ Other (Specify) ...."), " = ", /* @__PURE__ */ React.createElement("strong", null, f(lipidPerKg, 2)), " g/kg/d = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.lipidSMOF, 1)), " mL")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, "Fat soluble vitamin"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { style: calc.vitalipidVol > 0 ? { fontWeight: 700 } : void 0 }, chk(calc.vitalipidVol > 0), " Vitalipid N infant"), " = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.vitalipidVol, 1)), " mL")))), /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: 4, fontSize: 10 } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { style: tdh, rowSpan: 2 }, "Electrolyte"), /* @__PURE__ */ React.createElement("th", { style: tdh, colSpan: 2 }, "Prescribed"), /* @__PURE__ */ React.createElement("th", { style: tdh, rowSpan: 2 }, "Normal Requirement")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { style: tdh }, "per kg"), /* @__PURE__ */ React.createElement("th", { style: tdh }, "total per day", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 400, fontSize: 9 } }, "(For Pharmacist Only — in bag, × Factor)")))), /* @__PURE__ */ React.createElement("tbody", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdGroup, colSpan: 3 }, "1. Na⁺"), /* @__PURE__ */ React.createElement("td", { style: td, rowSpan: 5 }, "Na ", rng(targets?.na), " mEq/kg/day", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: "#555" } }, tgtNote))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(naCl > 0) }, chk(naCl > 0), " NaCl"), /* @__PURE__ */ React.createElement("td", { style: tdr }, naCl > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, naCl), " mEq") : "—"), /* @__PURE__ */ React.createElement("td", { style: tdr }, naCl > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, f(naCl * (calc.factor || 0), 1)), " mEq = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.naCl, 1)), " mL") : "—")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(naAcet > 0) }, chk(naAcet > 0), " Na Acetate"), /* @__PURE__ */ React.createElement("td", { style: tdr }, naAcet > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, naAcet), " mEq") : "—"), /* @__PURE__ */ React.createElement("td", { style: tdr }, naAcet > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, f(naAcet * (calc.factor || 0), 1)), " mEq = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.naAcet, 1)), " mL") : "—")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(glycophosP > 0) }, chk(glycophosP > 0), " Disodium glycerophosphate", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: plain }, "(Na = ", S.glycophos.naMeqPerMl, " mEq/mL, P = ", S.glycophos.pMgPerMl, " mg/mL)")), /* @__PURE__ */ React.createElement("td", { style: tdr }, glycophosP > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, glycophosP), " mL", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: note }, "Na ", f(glycophosP * S.glycophos.naMeqPerMl, 2), " mEq · P ", f(glycophosP * S.glycophos.pMgPerMl, 1), " mg")) : "—"), /* @__PURE__ */ React.createElement("td", { style: tdr }, glycophosP > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.glycophos, 1)), " mL") : "—")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: { ...td, textAlign: "right" } }, "Total Na"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.naKg, 2)), " mEq"), /* @__PURE__ */ React.createElement("td", { style: tdr })), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdGroup, colSpan: 3 }, "2. K⁺"), /* @__PURE__ */ React.createElement("td", { style: td, rowSpan: 3 }, "K⁺ ", rng(targets?.k), " mEq/kg/day", /* @__PURE__ */ React.createElement("br", null), "P ", rng(targets?.p), " mg/kg/day", /* @__PURE__ */ React.createElement("br", null), "max ", D.MAX_K_MEQ_PER_L, " mEq/L in bag")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(k2hpo4 > 0) }, chk(k2hpo4 > 0), " K₂HPO₄", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: plain }, "(K ", S.k2hpo4.kMeqPerMl, " mEq/mL, P ", S.k2hpo4.pMgPerKMeq, " mg/mL)")), /* @__PURE__ */ React.createElement("td", { style: tdr }, k2hpo4 > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, "K ", /* @__PURE__ */ React.createElement("strong", null, k2hpo4), " mEq", /* @__PURE__ */ React.createElement("br", null), "P ", /* @__PURE__ */ React.createElement("strong", null, f(k2hpo4 * 15.5, 1)), " mg") : "—"), /* @__PURE__ */ React.createElement("td", { style: tdr }, k2hpo4 > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, f(k2hpo4 * (calc.factor || 0), 1)), " mEq = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.k2hpo4, 2)), " mL") : "—")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(kCl > 0) }, chk(kCl > 0), " KCl (", S.kCl.kMeqPerMl, " mEq/mL)"), /* @__PURE__ */ React.createElement("td", { style: tdr }, kCl > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, kCl), " mEq") : "—"), /* @__PURE__ */ React.createElement("td", { style: tdr }, kCl > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, f(kCl * (calc.factor || 0), 1)), " mEq = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.kCl, 1)), " mL") : "—")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(mgPerKg > 0) }, "3. Mg⁺⁺  ", chk(mgPerKg > 0), " MgSO₄"), /* @__PURE__ */ React.createElement("td", { style: tdr }, mgPerKg > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, mgPerKg), " mEq", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: note }, "= ", f(mgPerKg * D.MG_MG_PER_MEQ, 1), " mg/kg")) : "—"), /* @__PURE__ */ React.createElement("td", { style: tdr }, mgPerKg > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, f(mgPerKg * (calc.factor || 0), 2)), " mEq = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.mg, 2)), " mL (", mgStrength, "%)") : "—"), /* @__PURE__ */ React.createElement("td", { style: td }, "Mg ", rng(targets?.mg), " mEq/kg/day")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(caPerKg > 0) }, "4. Ca⁺⁺  ", chk(caPerKg > 0), " Ca Gluconate"), /* @__PURE__ */ React.createElement("td", { style: tdr }, caPerKg > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, caPerKg), " mg") : "—"), /* @__PURE__ */ React.createElement("td", { style: tdr }, caPerKg > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, f0(caPerKg * (calc.factor || 0))), " mg = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.ca, 1)), " mL") : "—"), /* @__PURE__ */ React.createElement("td", { style: td }, "Ca ", rng(targets?.ca), " mg/kg/day (Ca:P ", D.TARGETS.caP()[0], "–", D.TARGETS.caP()[1], ":1 mass)")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdGroup, colSpan: 3 }, "5. Multivitamin"), /* @__PURE__ */ React.createElement("td", { style: td, rowSpan: 3 }, "Soluvit N ", S.soluvit.mlPerKg, " mL/kg/day (max ", S.soluvit.maxMl, " mL/day)")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(inclSoluvit && bag) }, chk(inclSoluvit), " Soluvit N"), /* @__PURE__ */ React.createElement("td", { style: tdr, colSpan: 2 }, /* @__PURE__ */ React.createElement("strong", null, inclSoluvit ? f(calc.soluvitVol, 1) : "—"), " mL/day")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(false) }, "☐ อื่นๆ ........"), /* @__PURE__ */ React.createElement("td", { style: tdr, colSpan: 2 })), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdGroup, colSpan: 3 }, "6. Trace Element"), /* @__PURE__ */ React.createElement("td", { style: td, rowSpan: 4 }, "Peditrace ", S.peditrace.mlPerKg, " mL/kg/day (max ", S.peditrace.maxMl, " mL)", /* @__PURE__ */ React.createElement("div", { style: { marginTop: 2 } }, "Zn รวม ", f(calc.znTotal_mg, 2), " mg/day", wtKg > 0 && calc.znTotal_mg > 0 ? ` (${f(calc.znTotal_mg / wtKg, 2)} mg/kg/d)` : "", " · max ", D.MAX_ZN_MG_DAY, " mg/day"))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(inclPeditrace && bag) }, chk(inclPeditrace), " Peditrace (Zn ", S.peditrace.znMgPerMl * 1e3, " µg/mL)"), /* @__PURE__ */ React.createElement("td", { style: tdr, colSpan: 2 }, /* @__PURE__ */ React.createElement("strong", null, inclPeditrace ? f(calc.peditrace_vol, 1) : "—"), " mL/day")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(false) }, "☐ Addamel N (Zn 650 µg/mL)"), /* @__PURE__ */ React.createElement("td", { style: tdr, colSpan: 2 }, "—")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(znPerKg > 0) }, chk(znPerKg > 0), " ZnSO₄ (Additional to the above) ", /* @__PURE__ */ React.createElement("span", { style: note }, "elemental Zn")), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, znPerKg > 0 ? znPerKg : "—"), " mg Zn/kg"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, znPerKg > 0 ? f(calc.znSO4_bag_mg, 2) : "—"), " mg Zn")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: tdRx(heparinUmL > 0) }, "7. Heparin (", S.heparin.unitsPerMl, " unit/mL)"), /* @__PURE__ */ React.createElement("td", { style: tdr, colSpan: 2 }, /* @__PURE__ */ React.createElement("strong", null, heparinUmL), " unit/mL"), /* @__PURE__ */ React.createElement("td", { style: td }, "0.5–1 unit/mL")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: { ...td, fontWeight: 700 } }, "8. Other"), /* @__PURE__ */ React.createElement("td", { style: td, colSpan: 3 }, orals.length === 0 ? "........" : orals.map((o, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: plain }, o)))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14, gap: 12 } }, /* @__PURE__ */ React.createElement("div", null, "แพทย์ ", /* @__PURE__ */ React.createElement("span", { className: "print-doctor", style: { fontWeight: 700 } }, savedMeta?.by || ""), " ........................................ (ลงนาม)"), /* @__PURE__ */ React.createElement("div", null, "รหัส ................................")), /* @__PURE__ */ React.createElement("div", { className: "print-back", style: { breakBefore: "page", pageBreakBefore: "always", paddingTop: 4 } }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 4, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: 12 } }, "สำหรับเภสัชกร — รายละเอียดการผสม (ด้านหลังใบสั่ง)"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10 } }, patient?.name || patient?.initials || "—", patient?.twinSuffix ? ` (Twin ${patient.twinSuffix})` : "", " · NeoFeed ID ", patient?.sessionId || "—", " · DOL ", dol, " · ตึก ", patient?.currentBed || "—", " · วันที่ให้ TPN ", orderDateLabel)), /* @__PURE__ */ React.createElement("div", { className: "print-saved-by", style: { marginBottom: 6, fontSize: 10.5 } }, "บันทึกโดย ", /* @__PURE__ */ React.createElement("strong", null, savedMeta?.by || "—"), " (ผู้สั่ง — ติดต่อ) · เวลา ", /* @__PURE__ */ React.createElement("strong", null, savedAtLabel), " · ฉบับที่ ", /* @__PURE__ */ React.createElement("strong", null, savedMeta?.revision || 1)), critOverride && /* @__PURE__ */ React.createElement("div", { style: { border: "2px solid #c00", color: "#c00", padding: "4px 8px", marginBottom: 6, fontSize: 10.5, fontWeight: 700 } }, /* @__PURE__ */ React.createElement("div", { className: "crit-confirmed" }, "✔ แพทย์ยืนยันคำสั่ง (ยืนยันพร้อมเหตุผลตอนบันทึก)"), "⚠ สั่งทั้งที่มีค่าวิกฤต: ", critOverride.alerts.join("; "), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 400, color: "#000" } }, "เหตุผล: ", critOverride.reason)), /* @__PURE__ */ React.createElement("table", { style: { width: "100%", marginBottom: 4, fontSize: 10.5 } }, /* @__PURE__ */ React.createElement("tbody", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, "Total Volume:"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("strong", null, f(totalTPN_mL, 1)), " mL delivered / ", /* @__PURE__ */ React.createElement("strong", null, f(calc.preparedVol, 1)), " mL prepared", calc.overfill > 1.001 && /* @__PURE__ */ React.createElement(React.Fragment, null, "  ·  ปริมาตรคาสาย ", /* @__PURE__ */ React.createElement("strong", null, f(calc.deadVol_mL, 1)), " mL"))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, "Factor:"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("strong", null, f(calc.factor, 3)), calc.overfill > 1.001 ? /* @__PURE__ */ React.createElement(React.Fragment, null, " = ", f(wtKg, 2), " kg × ", f(calc.overfill, 3), " (prepared ÷ delivered) — every per-kg dose is scaled by this") : /* @__PURE__ */ React.createElement(React.Fragment, null, " = weight (no overfill)"))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: { whiteSpace: "nowrap" } }, "Dextrose Final Conc."), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("strong", null, dexPct || "—", "%"), " = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.dexG_bag, 1)), " g in bag = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.d50wVol, 1)), " mL (D50W)  ·  delivered ", /* @__PURE__ */ React.createElement("strong", null, f(calc.dexG, 1)), " g = ", /* @__PURE__ */ React.createElement("strong", null, wtKg ? f(calc.dexGPerKg, 2) : "—"), " g/kg/d  ", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: "#555" } }, "(max ", D.MAX_DEXTROSE_G_KG, " g/kg/d)"))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, "Amino acid"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("strong", null, "☑ ", S[aaKey]?.label || S.aminoven10.label), " = ", /* @__PURE__ */ React.createElement("strong", null, f(aaPerKg, 2)), " g/kg/d = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.aaG_bag, 1)), " g in bag = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.aa, 1)), " mL")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, "Lipid"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("strong", null, "☑ 20% SMOF"), " = ", /* @__PURE__ */ React.createElement("strong", null, f(lipidPerKg, 2)), " g/kg/d = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.lipidSMOF, 1)), " mL    Vitalipid N infant = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.vitalipidVol, 1)), " mL")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, "Lipid pump rate"), /* @__PURE__ */ React.createElement("td", null, "Bag total ", /* @__PURE__ */ React.createElement("strong", null, f(calc.lipidBagVol, 1)), " mL infused over ", /* @__PURE__ */ React.createElement("strong", null, lipidDripHours || 24), " h = Rate ", /* @__PURE__ */ React.createElement("strong", null, calc.lipidBagVol > 0 ? f(calc.lipidBagVol / (lipidDripHours || 24), 2) : "—"), " mL/hr", lipidPerKg > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9.5 } }, " (= ", f(lipidPerKg / (lipidDripHours || 24), 3), " g/kg/h)"))))), /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: 4, fontSize: 10 } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { style: tdh }, "Aqueous bag — stock"), /* @__PURE__ */ React.createElement("th", { style: tdh }, "in bag"), /* @__PURE__ */ React.createElement("th", { style: tdh }, "mL"))), /* @__PURE__ */ React.createElement("tbody", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "50% Dextrose (D50W)"), /* @__PURE__ */ React.createElement("td", { style: tdr }, f(calc.dexG_bag, 1), " g"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.d50wVol, 1)))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, S[aaKey]?.label || S.aminoven10.label), /* @__PURE__ */ React.createElement("td", { style: tdr }, f(calc.aaG_bag, 1), " g"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.aa, 1)))), naCl > 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, S.naCl.label), /* @__PURE__ */ React.createElement("td", { style: tdr }, f(naCl * (calc.factor || 0), 1), " mEq"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.naCl, 1)))), naAcet > 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "Na Acetate"), /* @__PURE__ */ React.createElement("td", { style: tdr }, f(naAcet * (calc.factor || 0), 1), " mEq"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.naAcet, 1)))), glycophosP > 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "Disodium glycerophosphate"), /* @__PURE__ */ React.createElement("td", { style: tdr }, "Na ", f(glycophosP * S.glycophos.naMeqPerMl * (calc.factor || 0), 1), " mEq · P ", f0(glycophosP * S.glycophos.pMgPerMl * (calc.factor || 0)), " mg"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.glycophos, 1)))), kCl > 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "KCl"), /* @__PURE__ */ React.createElement("td", { style: tdr }, f(kCl * (calc.factor || 0), 1), " mEq"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.kCl, 1)))), k2hpo4 > 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "K₂HPO₄"), /* @__PURE__ */ React.createElement("td", { style: tdr }, f(k2hpo4 * (calc.factor || 0), 1), " mEq"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.k2hpo4, 2)))), mgPerKg > 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "MgSO₄ ", mgStrength, "%"), /* @__PURE__ */ React.createElement("td", { style: tdr }, f(mgPerKg * (calc.factor || 0), 2), " mEq"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.mg, 2)))), caPerKg > 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "10% Ca Gluconate"), /* @__PURE__ */ React.createElement("td", { style: tdr }, f0(caPerKg * (calc.factor || 0)), " mg"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.ca, 1)))), inclSoluvit && bag && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "Soluvit N"), /* @__PURE__ */ React.createElement("td", { style: tdr }, calc.overfill > 1.001 ? `× Factor → delivers ${f(calc.soluvitVol * calc.deliveredFrac, 2)} mL (KCMH sheet G43: × actual weight)` : "no overfill"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.soluvitVol, 1)))), inclPeditrace && bag && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "Peditrace"), /* @__PURE__ */ React.createElement("td", { style: tdr }, calc.overfill > 1.001 ? `× Factor → delivers ${f(calc.peditrace_vol * calc.deliveredFrac, 2)} mL (KCMH sheet G45: × actual weight)` : "no overfill"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.peditrace_vol, 1)))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "Heparin ", S.heparin.unitsPerMl, " unit/mL"), /* @__PURE__ */ React.createElement("td", { style: tdr }, bag ? `${fmt(heparinUmL * calc.preparedVol, 0)} unit` : "—"), /* @__PURE__ */ React.createElement("td", { style: tdr }, /* @__PURE__ */ React.createElement("strong", null, f(calc.solVol?.heparin, 2)))), znPerKg > 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "ZnSO₄ (elemental Zn)"), /* @__PURE__ */ React.createElement("td", { style: tdr }, f(calc.znSO4_bag_mg, 2), " mg Zn"), /* @__PURE__ */ React.createElement("td", { style: tdr, title: "stock not in KCMH_STOCK" }, "ปริมาตร ZnSO₄ ไม่ได้รวมใน WFI — หักตามที่ใส่จริง")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: { ...td, fontWeight: 700 } }, "Water for injection q.s."), /* @__PURE__ */ React.createElement("td", { style: tdr, colSpan: 2 }, "Components ", /* @__PURE__ */ React.createElement("strong", null, f(calc.componentVol, 1)), " mL + WFI ", /* @__PURE__ */ React.createElement("strong", { style: { color: calc.wfiVol < 0 ? "#c00" : "#000" } }, fSigned(calc.wfiVol, 1)), " mL  =  ", /* @__PURE__ */ React.createElement("strong", null, f(calc.preparedVol, 1)), " mL prepared", calc.wfiVol < 0 && /* @__PURE__ */ React.createElement("div", { style: { color: "#c00", fontWeight: 700 } }, "เกินปริมาตรถุง ", f(Math.abs(calc.wfiVol), 1), " mL"))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td, colSpan: 3 }, "K⁺ in bag ", fmt(calc.kMeqPerL, 0), " mEq/L (max ", D.MAX_K_MEQ_PER_L, ") · Osm ", bag && calc.osm ? fmt(calc.osm, 0) : "—", " mOsm/L · Lipid + Vitalipid are a separate syringe, not in this bag")))), mineral && (mineral.hasOral || mineral.hasIV) && /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: 6, fontSize: 10 } }, /* @__PURE__ */ React.createElement("tbody", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: { ...td, fontWeight: 700, background: "#f0f0f0", fontSize: 10.5 }, colSpan: 4 }, "Ca · PO₄ · Ca:P (mg/kg/day elemental)")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "TPN (IV)"), /* @__PURE__ */ React.createElement("td", { style: tdr }, "Ca ", /* @__PURE__ */ React.createElement("strong", null, f0(mineral.tpnCa))), /* @__PURE__ */ React.createElement("td", { style: tdr }, "PO₄ ", /* @__PURE__ */ React.createElement("strong", null, f0(mineral.tpnP))), /* @__PURE__ */ React.createElement("td", { style: td }, "Ca:P ", isFinite(mineral.tpnCaP) && mineral.tpnCaP > 0 ? `${fmt(mineral.tpnCaP, 2)}:1` : mineral.tpnCaP > 0 ? "!! (Ca, no P)" : "—")), (mineral.enCa > 0 || mineral.enP > 0) && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "EN (นม)"), /* @__PURE__ */ React.createElement("td", { style: tdr }, "Ca ", /* @__PURE__ */ React.createElement("strong", null, f0(mineral.enCa))), /* @__PURE__ */ React.createElement("td", { style: tdr }, "PO₄ ", /* @__PURE__ */ React.createElement("strong", null, f0(mineral.enP))), /* @__PURE__ */ React.createElement("td", { style: td }, "—")), mineral.hasOral && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "Oral supplement"), /* @__PURE__ */ React.createElement("td", { style: tdr }, "Ca ", /* @__PURE__ */ React.createElement("strong", null, f0(mineral.oralCa))), /* @__PURE__ */ React.createElement("td", { style: tdr }, "PO₄ ", /* @__PURE__ */ React.createElement("strong", null, f0(mineral.oralP))), /* @__PURE__ */ React.createElement("td", { style: td }, "Ca:P ", isFinite(mineral.oralCaP) && mineral.oralCaP > 0 ? `${fmt(mineral.oralCaP, 2)}:1` : mineral.oralCaP > 0 ? "!! (Ca, no P)" : "—")), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: { ...td, fontWeight: 700 } }, "รวมทั้งหมด"), /* @__PURE__ */ React.createElement("td", { style: tdr }, "Ca ", /* @__PURE__ */ React.createElement("strong", null, f0(mineral.totCa))), /* @__PURE__ */ React.createElement("td", { style: tdr }, "PO₄ ", /* @__PURE__ */ React.createElement("strong", null, f0(mineral.totP))), /* @__PURE__ */ React.createElement("td", { style: { ...td, fontWeight: 700 } }, "Ca:P ", isFinite(mineral.totCaP) && mineral.totCaP > 0 ? `${fmt(mineral.totCaP, 2)}:1` : mineral.totCaP > 0 ? "!! (Ca, no P)" : "—", " (target ", D.TARGETS.caP()[0], "–", D.TARGETS.caP()[1], ":1)")))), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, borderBottom: "1px solid #000", marginTop: 8, marginBottom: 4 } }, "องค์ประกอบที่ผู้ป่วยได้รับ / DELIVERED IN ", f(totalTPN_mL, 1), " mL", calc.overfill > 1.001 && /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 400, fontSize: 9.5 } }, "  (= bag × ", f(calc.deliveredFrac, 3), ")")), /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 10 } }, /* @__PURE__ */ React.createElement("tbody", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "Dextrose ", /* @__PURE__ */ React.createElement("strong", null, f(calc.dexG, 1)), " g"), /* @__PURE__ */ React.createElement("td", { style: td }, "Amino acid ", /* @__PURE__ */ React.createElement("strong", null, f(calc.aaG, 1)), " g = ", /* @__PURE__ */ React.createElement("strong", null, f(aaPerKg, 2)), " g/kg"), /* @__PURE__ */ React.createElement("td", { style: td }, "Energy (TPN) ", /* @__PURE__ */ React.createElement("strong", null, f0(calc.tpnKcal)), " kcal = ", /* @__PURE__ */ React.createElement("strong", null, wtKg ? f0(calc.tpnKcal / wtKg) : "—"), " kcal/kg", calc.enKcal > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, " · total incl. EN ", /* @__PURE__ */ React.createElement("strong", null, f0(calc.kcalKg)), " kcal/kg"))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "Na⁺ ", /* @__PURE__ */ React.createElement("strong", null, f(calc.naKg * (wtKg || 0), 2)), " mEq = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.naKg, 2)), " mEq/kg"), /* @__PURE__ */ React.createElement("td", { style: td }, "K⁺ ", /* @__PURE__ */ React.createElement("strong", null, f(calc.kKg * (wtKg || 0), 2)), " mEq = ", /* @__PURE__ */ React.createElement("strong", null, f(calc.kKg, 2)), " mEq/kg"), /* @__PURE__ */ React.createElement("td", { style: td }, "Mg²⁺ ", /* @__PURE__ */ React.createElement("strong", null, f(mgPerKg * (wtKg || 0), 2)), " mEq = ", /* @__PURE__ */ React.createElement("strong", null, f(mgPerKg, 2)), " mEq/kg", mgPerKg > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, " (", /* @__PURE__ */ React.createElement("strong", null, f(mgPerKg * D.MG_MG_PER_MEQ, 1)), " mg/kg)"))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { style: td }, "Ca²⁺ ", /* @__PURE__ */ React.createElement("strong", null, f0(caPerKg * (wtKg || 0))), " mg = ", /* @__PURE__ */ React.createElement("strong", null, f0(caPerKg)), " mg/kg"), /* @__PURE__ */ React.createElement("td", { style: td }, "Phosphate ", /* @__PURE__ */ React.createElement("strong", null, f0(calc.pTotal_mg)), " mg"), /* @__PURE__ */ React.createElement("td", { style: td }, "Osmolarity ", /* @__PURE__ */ React.createElement("strong", null, calc.osm ? calc.osm.toFixed(0) : "—"), " mOsm/L")))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, padding: "4px 8px", border: "1px solid #ccc", fontSize: 10, background: "#fafafa" } }, "GIR ", f(calc.gir, 1), " mg/kg/min · Protein ", f(calc.proteinKg, 2), " g/kg/d · Energy ", f0(calc.kcalKg), " kcal/kg/d · Na ", f(calc.naKg, 2), " mEq/kg · Ca:P ", f(calc.caP, 2), ":1 (TPN+EN) · Osm ", calc.osm ? calc.osm.toFixed(0) : "—", " mOsm/L"), orderChanges && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, padding: "4px 8px", border: "1px dashed #999", fontSize: 9.5 } }, /* @__PURE__ */ React.createElement("strong", null, "เปลี่ยนแปลงจากคำสั่ง DOL ", previousDol ?? "ก่อนหน้า", ":"), " ", orderChanges.length === 0 ? "ไม่มีการเปลี่ยนแปลง" : orderChanges.map((c) => `${c.label} ${c.from}→${c.to}${c.unit ? " " + c.unit : ""}`).join(" · "))), /* @__PURE__ */ React.createElement("div", { style: {
    marginTop: 8,
    paddingTop: 4,
    borderTop: "1px solid #ccc",
    fontSize: 8,
    color: "#555",
    display: "flex",
    justifyContent: "space-between"
  } }, /* @__PURE__ */ React.createElement("span", null, "NeoFeed · constants ", D.CONSTANTS_VERSION, " · app ", D.appVersion()), /* @__PURE__ */ React.createElement("span", null, "entry ", entryId || "(unsaved)", " · printed ", printedAt)));
}
window.Calculator = Calculator;
