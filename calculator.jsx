// ============================================================
// TPN + Enteral Calculator — input-led, inline live results
// ============================================================
const { useState, useMemo } = React;
const D = window.NEOFEED_DATA;
// KCMH pharmacy stock strengths — every mL/day conversion resolves through this
const S = D.KCMH_STOCK;

// Format for display: at most `d` decimals and never a trailing zero (1.0 -> "1",
// 1.25 -> "1.3") — D.displayNum. There used to be a keepZeros option for
// side-by-side columns (a Ca:P of 1.70); Praew ruled it out on 2026-09-22 with
// every other trailing zero, because "18.0" can be read as 180.
// Positive Infinity = nutrient-without-counterpart (e.g. Ca with no P) → show "!!"
const fmt = (n, d = 1) => n === Infinity ? "!!" : D.displayNum(n, d);

// Safety alerts must be deterministic and clinically prioritised. A stable
// sort preserves the calculation order within each severity group so the
// screen does not jump around while a prescription is being edited.
function sortClinicalAlerts(items) {
  const priority = { crit: 0, warn: 1, info: 2 };
  return items
    .map((alert, index) => ({ alert, index }))
    .sort((a, b) => (priority[a.alert.level] ?? 3) - (priority[b.alert.level] ?? 3) || a.index - b.index)
    .map(({ alert }) => alert);
}

// ── Calculator input model ────────────────────────────────────────
// The one definition of "the raw inputs of an order": what gets restored from
// a saved entry, what gets saved as calcInput, and what "has this form changed
// since it was saved?" compares. Prefill and change-detection MUST go through
// the same function, or a freshly opened entry would read as edited.
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
    suppFeType: src.suppFeType ?? "FE_FERDEK",
  };
}
// Order-independent fingerprint of a flat input object.
function calcInputKey(inputs) {
  return JSON.stringify(inputs, Object.keys(inputs || {}).sort());
}

// The dead space a NEW order starts with (Praew, 2026-09-18: "ใน SCN+NICU
// แก้เป็น +30 ml อัตโนมัติไปเลย"). A dead space set on the order it is copied
// from is kept. Yesterday's 0 was the old default, so it — like an order with
// none — takes the ward's default (D.defaultDeadVolFor: 30 mL on the newborn
// wards). A saved order being reopened never comes through here: its dead
// space is part of the record, and so is an unsaved draft's.
function newOrderDeadVol(src, patient) {
  const v = Number(src?.deadVol_mL);
  return v > 0 ? v : window.NEOFEED_DATA.defaultDeadVolFor(patient);
}

// What the "changes vs previous order" list compares — per-kg ORDER values,
// so a weight change alone doesn't flag every electrolyte line.
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
  ["suppMTV", "Munti-vim", ""],
];
function describeOrderValue(key, v) {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (key === "enType") return (window.NEOFEED_DATA.EN_DB[v]?.label || v).split(" (")[0];
  if (key === "aaProduct") return window.NEOFEED_DATA.KCMH_STOCK[v]?.short || v;
  // A volume derived from Rate × 24 used to reach this list — and the printed
  // pharmacy form — as "98.39999999999999" (review 2026-09-17, UP-C13).
  // toPrecision(12) strips float noise without rounding away a real decimal
  // (a Glycophos 0.0625 mL/kg/d stays 0.0625).
  if (typeof v === "number" && isFinite(v)) return String(Number(v.toPrecision(12)));
  return String(v);
}
// → [{ label, from, to, unit }] for every order field that differs.
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

// Unsaved work survives a forced logout (session expiry mid-save) — 2026-09-11
// review, F3. Keyed per patient AND per order date, so it can never be offered
// on a different day's order. Cleared on a successful save and on deliberate
// logout (app.jsx); anything older than this is discarded unread.
const DRAFT_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const draftStorageKey = (sessionId, dateStr) => `neofeed_draft_${sessionId}_${dateStr}`;
// "Prefilled from previous submission" state (neofeed_calc_<sessionId>). It
// was never expired, so a shared ward PC kept every infant's last order
// indefinitely (review 2026-09-17, SEC-F3). A week is past any plausible
// "continue yesterday's order" use; anything older is deleted unread.
const CALC_STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Whose unsaved draft this is (SEC-F3). Ward PCs are shared, so a draft is
// only ever offered back to the account that typed it. `userEmail` is the
// explicit prop; app.jsx currently passes only `userLabel`, which carries the
// email as "Name (email)" or as the bare email — so the email is read from
// there. No email → "" → drafts are written unowned and never offered.
function draftOwnerOf(userEmail, userLabel) {
  const email = String(userEmail || "").trim()
    || (String(userLabel || "").match(/([^\s()<>]+@[^\s()<>]+)/) || [])[1] || "";
  return email.toLowerCase();
}

// Who saved a row, for the printed form and the Save card. The row itself holds
// only the email the server stamped; the TPN team need a name to call about an
// order (2026-09-22), so each save also keeps the saver's own "Name (email)" as
// calcInput.savedByLabel. That name is shown only while its email is the row's
// — lastModifiedBy, else submittedBy — so it can never sit on someone else's
// save. Otherwise, and on rows saved before names were kept, the email alone.
function savedByOf(entry) {
  const email = String(entry?.lastModifiedBy || entry?.submittedBy || "").trim();
  const label = String(entry?.calcInput?.savedByLabel || "").trim();
  return label && email && draftOwnerOf("", label) === email.toLowerCase() ? label : email;
}
// When a row was saved, in Bangkok time ("22/09/2569 10:30"), or "—".
function savedAtLabelOf(at) {
  return at && isFinite(Date.parse(at))
    ? new Date(at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";
}

// app.jsx inserts a new log row optimistically under "tmp_…" (or
// "local_tmp_…" with no backend) until the server returns the real entryId.
// Such a row is not saved yet: opening it and printing put an id on the
// pharmacy form that no Daily_Log row has, and saving it again targeted a row
// the server has never seen (review 2026-09-17, UP-C9). log.jsx keeps its own
// copy of this test — the two files load as separate scripts.
const isPendingEntryId = (id) => /^(local_)?tmp_/.test(String(id || ""));

// The TPN dosing weight (g) a saved row was calculated with (UP-C2). Every
// per-kg dose follows the dosing weight, and that weight can move without the
// form changing: it floors at `patient.bw`, so correcting a birth weight
// re-doses a reopened order that still looked "saved" and printed the new mL
// under the old entry id. Rows saved from 2026-09-17 carry it as
// calcInput.tpnWtG (exact). Older rows don't, so it is recovered only from
// columns whose formula has not changed and depends on nothing but the dosing
// weight: GIR (delivered dextrose g × 1000 ÷ 1440 ÷ kg) or EN mL/kg/d. No such
// evidence → null → never blocks (a legacy row is only held back when the
// record itself shows the weight moved).
function savedDosingWeightOf(entry) {
  const ci = entry?.calcInput || {};
  const num = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
  if (num(ci.tpnWtG) > 0) return { g: num(ci.tpnWtG), exact: true };
  const dexG = num(ci.totalTPN_mL) * num(ci.dexPct) / 100, gir = num(entry?.gir);
  if (dexG > 0 && gir > 0) return { g: dexG * 1000 / (1440 * gir) * 1000, exact: false };
  const enTotal = num(ci.enVol) * num(ci.enFreq), enPerKg = num(entry?.enVolPerKg);
  if (enTotal > 0 && enPerKg > 0) return { g: enTotal / enPerKg * 1000, exact: false };
  return null;
}

// The CONSTANTS_VERSION a saved row's figures were computed with (calcMoved).
// Saves stamp it as calcInput.constantsVersion. The first 2026-09-18.1
// frontend went live (PR #77, 11:17 ICT on 2026-09-18) before the stamp
// shipped, so its rows carry none — but it was the first release to save
// calcInput.aaProduct, and that key dates them. Neither → null: a row from
// before 2026-09-18, which calcMoved checks against that release's changes.
const FIRST_AA_PRODUCT_VERSION = "2026-09-18.1";
function savedCalcVersionOf(entry) {
  const ci = entry?.calcInput;
  if (!ci) return null;
  if (ci.constantsVersion) return String(ci.constantsVersion);
  return Object.prototype.hasOwnProperty.call(ci, "aaProduct") ? FIRST_AA_PRODUCT_VERSION : null;
}

// `name` + `required` + `onBlankChange` implement the "every field must be
// filled in before this order can be saved" rule (2026-09-15). What counts as
// filled is deliberately **the box is not empty**, not "the value is > 0":
// a fresh form renders 0 as an empty box with a "0" placeholder, so a field
// nobody has touched looks exactly like a field someone deliberately zeroed.
// Requiring a typed character separates the two — Other IV, Drug volume and
// Drain really are 0 most days, and the point of the rule is that somebody
// says so rather than that the default says so.
//
// `seedZero` is the other half: when the form is hydrated from a row that was
// already saved, a stored 0 IS an entered value, so it renders as "0" rather
// than as an empty box the user would have to re-type to save a correction to
// some other field.
function NumField({ label, unit, value, onChange, step = 1, min = 0, hint,
  name, required = false, seedZero = false, onBlankChange }) {
  // Set once the user types anything into this box, cleared when they empty
  // it again. Without it a typed "0" erased itself: the keystroke sets the
  // value to 0, the sync effect below re-renders 0 as an empty box, and the
  // field the user just filled in reads as blank again — which the save gate
  // would then refuse, with no way to satisfy it. A field remounts (see the
  // `key` on the required fields) when the form moves to another patient or
  // entry, so this never carries one order's answer into the next.
  const typedRef = React.useRef(false);
  const shown = (v) => (v || ((seedZero || typedRef.current) && v === 0)) ? String(v) : "";
  const [raw, setRaw] = React.useState(() => shown(value));
  const focusedRef = React.useRef(false);
  React.useEffect(() => {
    if (focusedRef.current) return;
    setRaw(shown(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, seedZero]);
  // Report blankness up on every change, and once on mount so a field nobody
  // ever touches still counts against the save gate.
  React.useEffect(() => {
    if (!required || !onBlankChange || !name) return;
    onBlankChange(name, raw.trim() === "");
  }, [raw, required, name, onBlankChange]);
  const handle = (e) => {
    // Every field here is a physical clinical quantity (weight/volume/rate/
    // dose/%) — none are legitimately negative, so "-" isn't in the allowed
    // charset at all (rather than allowing it then clamping after parse,
    // which would still let a bad value slip through onChange transiently).
    let s = e.target.value.replace(/[^0-9.]/g, "");
    const firstDot = s.indexOf(".");
    if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    typedRef.current = s !== "";   // emptying the box makes it blank again
    setRaw(s);
    let v = parseFloat(s);
    if (isNaN(v)) v = 0;
    if (min !== undefined && v < min) v = min;
    onChange(v);
  };
  return (
    <div className="field">
      <label>{label}{unit && <span className="unit">({unit})</span>}</label>
      <input
        type="text" inputMode="decimal" className="inp num"
        value={raw} placeholder="0" onChange={handle}
        onFocus={(e) => { focusedRef.current = true; e.target.select(); }}
        // Re-sync on blur so the box always shows the value actually in use
        // once focus leaves it. Without this, a field whose `value` is
        // computed rather than stored (the TPN calc weight falling back to
        // its automatic figure when the override is cleared) stays visually
        // empty while the order below it is calculated from a real number.
        // A field the user genuinely emptied re-renders empty, which is what
        // keeps the required-field gate honest.
        onBlur={() => { focusedRef.current = false; setRaw(shown(value)); }} />
      {hint && <div className="field-hint" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{hint}</div>}
    </div>);
}

function Chk({ label, value, onChange, hint }) {
  return (
    <label className="chk-label" style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 6, background: value ? "var(--brand-bg)" : "var(--bg-2)", border: `1px solid ${value ? "var(--brand-line)" : "var(--line-2)"}`, cursor: "pointer", fontSize: 13 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0 }} />
      <span>
        <span style={{ fontWeight: 500, color: value ? "var(--brand-2)" : "var(--ink)" }}>{label}</span>
        {hint && <span className="chk-hint" style={{ display: "block", color: "var(--ink-3)", marginTop: 2, fontSize: 11 }}>{hint}</span>}
      </span>
    </label>);

}

function Meter({ value, target, status, max, optimal }) {
  const m = max || target[1] * 1.6;
  const pct = (v) => Math.min(100, Math.max(0, v / m * 100));
  return (
    <div className={`meter s-${status}`}>
      <div className="range-bg" style={{ left: `${pct(target[0])}%`, right: `${100 - pct(target[1])}%` }} />
      {optimal && (
        <div className="optimal-zone"
          title={`Optimal: ${optimal[0]}–${optimal[1]}`}
          style={{ position:"absolute", top:0, bottom:0,
            left: `${pct(optimal[0])}%`, right: `${100 - pct(optimal[1])}%`,
            background: "oklch(52% 0.12 155 / .45)", borderRadius: 2 }} />
      )}
      <div className="needle" style={{ left: `${pct(value)}%` }} />
    </div>);
}

function Tile({ label, value, unit, decimals = 1, target, status, max, optimal }) {
  const display = fmt(value, decimals); // fmt handles Infinity → "!!", null → "—"
  return (
    <div className={`metric s-${status}`}>
      <div className="stripe" />
      <div className="lbl">{label}</div>
      <div className="val">{display}<span className="u">{unit}</span></div>
      {target && <Meter value={value || 0} target={target} status={status} max={max} optimal={optimal} />}
      {target && (
        <div className="target">
          <span>Range</span>
          <span className="range">{target[0]}–{target[1]}</span>
          {optimal && <span style={{ color:"oklch(45% 0.12 155)", marginLeft:8, fontSize:10 }}>▮ optimal {optimal[0]}–{optimal[1]}</span>}
        </div>
      )}
    </div>);
}

function MiniReadout({ label, value, unit, fontSize = 13, color = "var(--ink)" }) {
  return (
    <div style={{ padding: "6px 10px", background: "var(--bg-2)", borderRadius: 4, display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{label}</span>
      <span className="num" style={{ fontWeight: 600, fontSize, color }}>{value}<span style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 3 }}>{unit}</span></span>
    </div>);

}

// `mlPerKg`: the same dose in mL of stock per kg, for a stock entered in
// another unit — Glycophos is typed as mEq Na but drawn up in mL, so its mL/day
// sits beside the mEq Na/day at the same size (TPN team, 2026-09-22).
function SaltRow({ label, note, perKg, onChange, wtKg, unit = "mEq/kg/d", mlPerKg = 0 }) {
  const [raw, setRaw] = React.useState(perKg ? String(perKg) : "");
  const focusedRef = React.useRef(false);
  React.useEffect(() => {
    if (focusedRef.current) return;
    setRaw(perKg ? String(perKg) : "");
  }, [perKg]);
  const handle = (e) => {
    // A salt dose is a physical quantity — same reasoning as NumField just
    // above: "-" isn't in the allowed charset at all, rather than allowing it
    // and clamping after parse, which would let a negative value slip through
    // onChange transiently before the clamp caught it.
    let s = e.target.value.replace(/[^0-9.]/g, "");
    const fd = s.indexOf("."); if (fd !== -1) s = s.slice(0, fd + 1) + s.slice(fd + 1).replace(/\./g, "");
    setRaw(s);
    let v = parseFloat(s);
    if (isNaN(v)) v = 0;
    if (v < 0) v = 0;
    onChange(v);
  };
  return (
    <div className="salt-row-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 90px", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px dashed var(--line-2)" }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--ink)", fontWeight: 500 }}>{label}</div>
        {note && <div className="salt-note" style={{ fontSize: 11, color: "var(--ink-3)" }}>{note}</div>}
      </div>
      <input type="text" inputMode="decimal" className="inp num" style={{ height: 44 }}
        value={raw} placeholder="0" onChange={handle}
        onFocus={(e) => { focusedRef.current = true; e.target.select(); }}
        onBlur={() => { focusedRef.current = false; }} />
      <div style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>
        {wtKg > 0 && perKg > 0
          ? <><span className="num" style={{ color: "var(--ink)", fontWeight: 600, fontSize: 12 }}>= {fmt(perKg * wtKg, 1)}</span> {unit.replace("/kg/d", "/d").replace("/kg","")}
              {mlPerKg > 0 && (
                <div className="salt-ml"><span className="num" style={{ color: "var(--ink)", fontWeight: 600, fontSize: 12 }}>= {fmt(mlPerKg * wtKg, 2)}</span> mL/d</div>
              )}</>
          : <span style={{ color:"var(--ink-4)", fontSize:10 }}>{perKg > 0 ? `${perKg} ${unit.split("/")[0]}/kg` : "—"}</span>
        }
      </div>
    </div>);
}

// ============================================================
// Calculator
// ============================================================
// `scratch` (2026-09-21) — the Quick calc entry, reached from the floating
// button rather than from a patient. There is no patient, no Daily_Log row and
// no Google Sheet write: it is the same wizard, the same `calc`, run on a
// weight somebody types at the bedside. Everything that would persist a number
// is off (Save, Submit, Delete, the unsaved-draft store, the
// previous-submission store, the edit lock, the printed pharmacy form), and
// what stays is the arithmetic. Deliberately NOT folded into `centerPoint`:
// that mode still saves, just somewhere else.
function Calculator({ patient, dol: dolProp, editEntry, baselineEntry, previousEntry, logDate, userLabel, userEmail, onLog, onUpdate, onPublish, onSaved, onWeightChange, onDelete, centerPoint, scratch }) {
  // ── The date this order is FOR (review 2026-09-17, UP-C11) ────────────────
  // A new, non-back-dated order used to read "today" on every render, so a
  // form left open across midnight silently became the next day's order: its
  // required fields remounted blank under a new identity, its draft moved to a
  // new key, and Save stamped the new date (and the new DOL) onto numbers
  // typed for the old one. The date is now taken once, when the form opens
  // for a new order (reset on a patient switch in the prefill effect below),
  // and everything that identifies the order reads it: the draft key, the
  // required-field identity, the `ts` sent on save, the printed order date
  // and the DOL. An edit keeps its row's date; a back-fill keeps `logDate`.
  const [newOrderDate, setNewOrderDate] = useState(() => D.todayLocal());
  const orderDateKey = editEntry ? (D.normalizeDateStr(editEntry.ts) || D.todayLocal()) : (logDate || newOrderDate);
  const orderDayRolledOver = !scratch && !editEntry && !logDate && newOrderDate !== D.todayLocal();
  // App's `dol` is live (it ticks at midnight); the order's DOL is the one on
  // its own date — the same dolAtDate a back-filled order is given.
  const dol = orderDayRolledOver ? D.dolAtDate(patient, newOrderDate) : dolProp;
  const draftOwner = draftOwnerOf(userEmail, userLabel);

  // Current weight — the actual weight entered/measured for this log day.
  // This is what gets saved as the Daily_Log `weight` column and propagated
  // to the patient's displayed current weight (PatientStrip, growth chart).
  const [curWtG, setCurWtG] = useState(0);

  // Set alongside setCurWtG whenever the prefill effect below applies a
  // historical weight (edit or baseline) — tells the propagation effect to
  // skip that one change so a stale/past weight never flashes into the
  // PatientStrip header before the user has looked at or touched the field.
  const skipWeightPropagateRef = React.useRef(false);

  // Skip while editing a past entry, or for the one curWtG update caused by
  // baseline-prefill — that weight is historical, not the patient's current
  // weight, and must not overwrite the PatientStrip display.
  React.useEffect(() => {
    if (editEntry || !onWeightChange || curWtG <= 0) return;
    if (skipWeightPropagateRef.current) { skipWeightPropagateRef.current = false; return; }
    onWeightChange(curWtG);
  }, [curWtG, editEntry]);

  // TPN calculated weight — the weight every dose/target below is actually
  // computed from. Floors at birth weight while the infant hasn't yet
  // regained it (KCMH bedside convention: dosing per-kg off a still-falling
  // post-natal-weight-loss nadir would over/under-dose everything), then
  // tracks current weight automatically once it clears birth weight.
  //
  // That rule still *prefills* the field, but since 2026-09-15 the attending
  // can override it (dry weight after a fluid shift, an oedematous infant,
  // a dosing weight agreed on rounds that is neither the birth weight nor
  // today's scale reading). `tpnWtOverrideG` is 0 when the automatic figure
  // is in use, which is what makes "type the automatic number" the same
  // thing as "no override" rather than a sticky manual value that stops
  // following the weight.
  const bwG = patient?.bw || 0;
  const [tpnWtOverrideG, setTpnWtOverrideG] = useState(0);
  const autoWtG = (bwG > 0 && curWtG > 0 && curWtG < bwG) ? bwG : curWtG;
  const wtG = tpnWtOverrideG > 0 ? tpnWtOverrideG : autoWtG;
  const tpnWtManual = tpnWtOverrideG > 0 && tpnWtOverrideG !== autoWtG;
  // Only says "= birth weight" when the automatic rule is what put it there.
  // An override that happens to equal the birth weight is still an override,
  // and the order form must not claim the floor rule produced it.
  const usingBirthWeight = !tpnWtManual && autoWtG === bwG && curWtG > 0 && curWtG < bwG;
  const wtKg = wtG / 1000;

  // ── Required-field gate (2026-09-15) ──────────────────────────────
  // Step 1 (the fluid plan + both weights) and the Intake / Output card must
  // be filled in before an order can be saved — see NumField for why "filled"
  // means a non-empty box rather than a non-zero value. Steps 2-6 are
  // deliberately NOT in this set: a day with no lipid, no oral supplement and
  // no enteral feed is a normal day, and a gate that demanded a typed 0 in
  // every one of those boxes would be cleared by rote within a week.
  //
  // The Center Point entry has no Intake / Output card: none of its three
  // values go to CP, and a required box whose answer is discarded only teaches
  // staff to type 0 (PR #57 review, finding 4). Other IV and Drug volume stay —
  // they feed the fluid budget the TPN volume is chosen against.
  const IO_FIELD_KEYS = new Set(["ioInput", "ioOutput", "drainContent"]);
  const REQUIRED_FIELDS = [
    { key: "fluidTargetPerKg", label: "Target fluid" },
    { key: "otherIV_mL",       label: "Other IV" },
    { key: "drug_mL",          label: "Drug volume" },
    { key: "curWtG",           label: "Current weight" },
    { key: "tpnWtG",           label: "TPN calc. weight" },
    { key: "ioInput",          label: "Input" },
    { key: "ioOutput",         label: "Urine output" },
    { key: "drainContent",     label: "Drain content" },
  ].filter(f => !((centerPoint || scratch) && IO_FIELD_KEYS.has(f.key)))
   // Quick calc saves nothing, so there is nothing to gate: a red "ยังกรอกไม่ครบ"
   // list under a form with no Save button is a dead end, and the one field it
   // would really be asking for (the weight) is already the first thing on the
   // screen and already reads 0 until it is typed.
   .filter(() => !scratch);
  const [blankFields, setBlankFields] = useState(() => new Set(REQUIRED_FIELDS.map(f => f.key)));
  const reportBlank = React.useCallback((key, isBlank) => {
    setBlankFields(prev => {
      if (prev.has(key) === isBlank) return prev;   // no-op re-renders would loop
      const next = new Set(prev);
      if (isBlank) next.add(key); else next.delete(key);
      return next;
    });
  }, []);
  const missingFields = REQUIRED_FIELDS.filter(f => blankFields.has(f.key));
  // Which required fields the entry being edited actually RECORDED. A stored
  // 0 is a typed 0 — it renders as "0" (NumField `seedZero`) so fixing a typo
  // elsewhere doesn't mean re-entering every zero the row already holds. A
  // field the row never carried (a legacy entry from before the Intake/Output
  // card) must come back blank instead, or the form would show a 0 nobody
  // wrote and the gate would count it as entered. Per field, not per entry,
  // because one row can be recorded in one and silent in the next.
  //
  // A brand-new form gets no credit at all, including one prefilled from
  // yesterday: yesterday's urine output is not today's.
  const seededZeros = React.useMemo(() => {
    const keys = new Set();
    if (!editEntry) return keys;
    const ci = editEntry.calcInput || {};
    const recorded = (v) => v !== undefined && v !== null && v !== "";
    const weight = ci.curWtG ?? ci.wtG ?? editEntry.weight;
    // Same precedence as withEntryIO: the dedicated columns are the record,
    // and they exist on rows whose calcInput predates them.
    const carried = {
      fluidTargetPerKg: ci.fluidTargetPerKg,
      otherIV_mL:       ci.otherIV_mL,
      drug_mL:          ci.drug_mL,
      curWtG:           weight,
      tpnWtG:           weight,
    };
    Object.keys(carried).forEach(k => { if (recorded(carried[k])) keys.add(k); });
    // Intake / Output: the AC–AE columns can't say "never recorded" —
    // getActivePatients returns Number('' || 0), so a row saved before the
    // card existed comes back with 0 in all three, and those zeros used to
    // count as entered (review 2026-09-17, UP-C5). A zero is a recorded zero
    // only when calcInput carries the key (every save since 2026-08-10 does);
    // a non-zero column is real data either way.
    ["ioInput", "ioOutput", "drainContent"].forEach(k => {
      if (recorded(ci[k]) || (recorded(editEntry[k]) && Number(editEntry[k]) !== 0)) keys.add(k);
    });
    return keys;
  }, [editEntry]);
  const seedsZero = (key) => seededZeros.has(key);

  // Card key 1 — Fluid plan (displayed as Step 1)
  const [fluidTargetPerKg, setFluidTargetPerKg] = useState(0);
  const [otherIV_mL, setOtherIV_mL] = useState(0);
  const [drug_mL, setDrug_mL] = useState(0);

  // Intake/Output card (also Step 1's "volume" section). ioInput defaults to
  // the computed prescribed-fluid total and re-syncs to it as the fluid plan
  // changes, UNTIL the user edits it directly (ioInputTouched) or an entry is
  // restored/edited (a saved figure is the record — it must not get silently
  // recomputed out from under the user). Output/drain have no computed
  // default; they're bedside-measured numbers.
  const [ioInput, setIoInput] = useState(0);
  const [ioInputTouched, setIoInputTouched] = useState(false);
  // Ref mirror of ioInputTouched, read by the prescribed-fluid auto-sync
  // effect below. Both effects run in the same commit on mount, prefill
  // first — but the auto-sync effect's closure still saw the PRE-prefill
  // `false`, so it re-ran and overwrote the just-restored ioInput with the
  // (still zero, calc hadn't recomputed yet) prescribed total. The saved
  // Input silently came back as 0 on every edit, and saving again wrote that
  // 0 over the real figure. A ref updates synchronously, so the auto-sync
  // effect sees the prefill's decision in the same commit.
  const ioInputTouchedRef = React.useRef(false);
  const markIoInputTouched = (v) => { ioInputTouchedRef.current = v; setIoInputTouched(v); };
  const [ioOutput, setIoOutput] = useState(0);
  const [drainContent, setDrainContent] = useState(0);

  // Card key 2 — TPN main bag (displayed as Step 3)
  const [route, setRoute] = useState("central");
  const [totalTPN_mL, setTotalTPN_mL] = useState(0); // mL/day DELIVERED to the infant (sheet C7)
  // Extra volume compounded that never reaches the infant — it stays in the giving
  // set (ปริมาตรคาสาย, sheet G8). Pharmacy prepares totalTPN_mL + this (sheet G7).
  // 0 = no overfill, which is how NeoFeed behaved before the Factor existed.
  const [deadVol_mL, setDeadVol_mL] = useState(0);
  const [dexPct, setDexPct] = useState(0);
  const [aaPerKg, setAaPerKg] = useState(0);
  const [aaProduct, setAaProduct] = useState("aminoven10");   // KCMH_STOCK key — see aaStockKey
  const [lipidPerKg, setLipidPerKg] = useState(0);
  const [lipidDripHours, setLipidDripHours] = useState(24); // lipid bag infused over 16/20/24h

  // Card key 3 — Electrolytes (displayed as Step 4; all zero baseline)
  const [naCl, setNaCl] = useState(0);
  const [naAcet, setNaAcet] = useState(0);
  // Glycophos® dosed by P (mmol P/kg/day = mL/kg/day since 1 mL = 1 mmol P)
  // Auto-contributes 2 mmol Na per mmol P — shown as computed readout, not input
  const [glycophosP, setGlycophosP] = useState(0);
  const [kCl, setKCl] = useState(0);
  const [k2hpo4, setK2HPO4] = useState(0);
  const [mgPerKg, setMgPerKg] = useState(0);
  // Which MgSO₄ vial the bag is compounded from. The official KCMH sheet prints
  // both strengths on the pharmacy label but its recipe line (J32) uses 10%,
  // so that is the default here — it changes the mL and therefore the WFI q.s.
  const [mgStrength, setMgStrength] = useState("10");   // "10" | "50"
  const [caPerKg, setCaPerKg] = useState(0);
  const [extraP_mg_kg, setExtraP_mg_kg] = useState(0);

  // Card key 5 — Enteral (displayed as Step 2)
  const [enType, setEnType] = useState("BM_20");
  const [enVol, setEnVol] = useState(0);
  const [enFreq, setEnFreq] = useState(0);
  const [isMEN, setIsMEN] = useState(false);

  // Card key 4 — Vitamins, Trace Elements, Heparin (displayed as Step 5)
  const [inclSoluvit,   setInclSoluvit]   = useState(true);
  const [inclPeditrace, setInclPeditrace] = useState(true);
  const [znPerKg,       setZnPerKg]       = useState(0);   // ZnSO₄, mg elemental Zn/kg/day
  const [inclAddamel,   setInclAddamel]   = useState(false);
  const [heparinUmL,    setHeparinUmL]    = useState(1);   // default 1 U/mL per KCMH practice

  // Card key 6 — Enteral Supplements (displayed as Step 6)
  const [suppVitD,   setSuppVitD]   = useState(0);               // IU/kg/day
  const [suppCa,     setSuppCa]     = useState(0);               // mg/kg/day elem Ca
  const [suppCaType, setSuppCaType] = useState("CA_CACO3_350");  // product key
  const [suppPO4,    setSuppPO4]    = useState(0);               // mg/kg/day elem P
  const [suppPO4Type,setSuppPO4Type]= useState("PO4_PHOSPHATE"); // product key
  const [suppMTV,    setSuppMTV]    = useState(false);           // Munti-vim 1 mL/day
  const [suppFerdek, setSuppFerdek] = useState(0);               // mg/kg/day elem Fe
  const [suppFeType, setSuppFeType] = useState("FE_FERDEK");     // product key

  // ── Accordion — which step cards are expanded ──────────────────
  // Only Step 1 open by default; others collapsed until user opens them
  const [openSteps, setOpenSteps] = useState(new Set([1]));

  // ── Restored-from-previous indicator (shown briefly on prefill) ─
  const [prefilledFrom, setPrefilledFrom] = useState(null); // {date, source}

  // ── Editing an existing entry: entryId/lastModified identify the row being
  // updated. Set once (from editEntry) or once the first save of a brand-new
  // entry returns an id — from then on, further saves in this same visit
  // update that row instead of appending a duplicate.
  const [savedEntryId, setSavedEntryId] = useState(editEntry?.entryId || null);
  const [savedLastModified, setSavedLastModified] = useState(editEntry?.lastModified || null);
  const [saving, setSaving] = useState(false);
  // Publish-lock state — only meaningful behind D.ENABLE_PUBLISH_GATE. A row
  // opened for edit carries its own published flag; a brand-new entry always
  // starts as a draft.
  const [published, setPublished] = useState(!!editEntry?.published);
  const [publishing, setPublishing] = useState(false);
  const [conflict, setConflict] = useState(null); // {lastModified, lastModifiedBy} of the row on the server

  // ── "Is what's on screen what's saved?" ────────────────────────────
  // savedKey is the fingerprint of the inputs as last saved (or as loaded
  // from a saved entry); null = nothing saved from this form yet. Print and
  // Copy are only allowed when the live form still matches it — they used to
  // be gated on savedEntryId alone, so an edit made after opening a saved
  // entry printed under that entry's id without ever being saved
  // (2026-09-11 review, F2).
  const [savedKey, setSavedKey] = useState(null);
  // Fingerprint right after prefill, with an untouched ioInput blanked — so
  // the auto-tracking Input figure never counts as the user having typed.
  const [prefillKey, setPrefillKey] = useState(null);
  // Who saved this order, when, and which revision — printed for pharmacy.
  const [savedMeta, setSavedMeta] = useState(null); // { by, at, revision }
  // Critical-alert override recorded with the saved order (F1 hard stop).
  const [critOverride, setCritOverride] = useState(editEntry?.calcInput?.critOverride || null);
  const [draftOffer, setDraftOffer] = useState(null); // this user's unsaved draft for this order
  // Dosing weight the saved row was calculated with — see savedDosingWeightOf.
  // null = nothing saved from this form, or a legacy row with no evidence.
  const [savedDosingWt, setSavedDosingWt] = useState(null); // { g, exact }
  // The CONSTANTS_VERSION the saved row was computed with — see
  // savedCalcVersionOf. null = nothing saved from this form, or a row saved
  // before 2026-09-18.
  const [savedCalcVersion, setSavedCalcVersion] = useState(null);

  // Hydrates the full raw-input form from a saved entry's calcInput — shared
  // by "editing an entry" and "starting today from the latest entry" below,
  // since both need the exact same field-by-field restoration.
  // ioInputTouched: true for an existing entry's exact historical figure
  // (must not get silently recomputed); false when borrowing yesterday's
  // numbers as a starting point for a brand-new day, so ioInput still tracks
  // today's recomputed prescribed-fluid total until the user overrides it.
  // ESPGHAN fluid-plan midpoint for this DOL/weight — the default when a
  // source carries no fluid plan of its own.
  const fluidMidpoint = (weightG) => {
    const r = D.TARGETS.fluid(dol, weightG || patient?.bw || 1000);
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

  // Raw wizard state for a saved entry, with Intake/Output taken from the
  // entry's own ioInput/ioOutput/drainContent (Daily_Log AC–AE) in preference
  // to the copy inside calcInputJson. The dedicated columns are the record —
  // they are what the backend reads back and what any report would use — and
  // they exist even on a row whose calcInput predates the Intake/Output card
  // or failed to parse, where restoring from calcInput alone silently showed
  // an empty I/O card over real saved figures.
  const withEntryIO = (entry) => {
    const src = { ...(entry?.calcInput || {}) };
    if (entry?.ioInput      != null) src.ioInput      = entry.ioInput;
    if (entry?.ioOutput     != null) src.ioOutput     = entry.ioOutput;
    if (entry?.drainContent != null) src.drainContent = entry.drainContent;
    return src;
  };

  // ── Prefill on patient change ──────────────────────────────────
  // 1. Editing an existing entry → restore its exact original inputs (calcInput),
  //    so edits work correctly regardless of which device created the entry
  // 2. Starting today's entry → baseline off the most recent entry's inputs,
  //    since a new day is usually a small tweak on the last one, not a from-
  //    scratch order (dol/entryId are NOT taken from it — this still creates
  //    a brand-new row for today, it only borrows the starting numbers)
  // 3. Otherwise restore full calc state from localStorage if previously submitted
  // 4. Otherwise: smart defaults — wt from latest weight, fluid from ESPGHAN midpoint
  // `orderDateKey` (top of this component) is the clinical date this order is
  // for — it keys the unsaved-draft store.
  // Identity of the order currently open. The required fields are keyed on it
  // so switching patient or date gives them fresh inputs: a "0" typed for one
  // infant must not arrive pre-satisfied on the next one's form.
  const formIdentity = `${patient?.sessionId || "?"}·${orderDateKey}·${editEntry?.entryId || "new"}`;

  // Browser-storage expiry, once per mount (SEC-F3). Drafts past 72 h and
  // "previous submission" state past 7 days are deleted for EVERY patient, not
  // only the one opened — on a shared ward PC nobody else will ever clean them
  // up. Declared before the prefill effect so it runs first. Never on the
  // Center Point entry, which reads nothing from browser storage at all.
  React.useEffect(() => {
    if (centerPoint || scratch) return;
    try {
      const now = Date.now(), doomed = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        const maxAge = k.startsWith("neofeed_draft_") ? DRAFT_MAX_AGE_MS
          : k.startsWith("neofeed_calc_") ? CALC_STATE_MAX_AGE_MS : 0;
        if (!maxAge) continue;
        let at = NaN;
        try { at = Date.parse(JSON.parse(localStorage.getItem(k))?.savedAt || ""); } catch {}
        if (!isFinite(at) || now - at > maxAge) doomed.push(k);
      }
      doomed.forEach(k => localStorage.removeItem(k));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    // Quick calc: there is no patient, so there is no history, no draft and no
    // previous submission to prefill from — and nothing in browser storage is
    // read or written. It opens as an empty order carrying only the ward's
    // usual dead space, so the first number typed is the weight it exists for.
    if (scratch) {
      applyCalcInput({ deadVol_mL: D.defaultDeadVolFor(null) }, 0, false, 0);
      setSavedKey(null);
      setPrefilledFrom(null);
      setDraftOffer(null);
      return;
    }
    if (!patient?.sessionId) return;

    // A new order's date is taken when it is opened (UP-C11): a patient switch
    // is a deliberate new target, so it re-reads today. Read here as well as
    // set, because this run's draft lookup must not use the previous
    // patient's frozen date still held in state.
    const openedOn = D.todayLocal();
    if (!editEntry && !logDate) setNewOrderDate(openedOn);
    const dateKey = editEntry ? (D.normalizeDateStr(editEntry.ts) || openedOn) : (logDate || openedOn);

    // Re-sync the saved-row identity to the current editEntry every time patient
    // or editEntry changes — a patient switch while this component stays mounted
    // (e.g. via the header "Switch patient" picker, without leaving the Calculator
    // view) must not leave a stale entryId/lastModified pointing at the previous
    // patient's row, which would misdirect the next save.
    setSavedEntryId(editEntry?.entryId || null);
    setSavedLastModified(editEntry?.lastModified || null);
    setConflict(null);
    setCritOverride(editEntry?.calcInput?.critOverride || null);
    setSavedMeta(editEntry ? {
      by: savedByOf(editEntry),
      at: editEntry.lastModified || "",
      revision: editEntry.revisionNumber || 1,
    } : null);
    setSavedDosingWt(editEntry ? savedDosingWeightOf(editEntry) : null);
    setSavedCalcVersion(editEntry ? savedCalcVersionOf(editEntry) : null);

    // An unsaved draft for this patient + order date is offered back rather
    // than silently overwritten — but only to the user who typed it (SEC-F3):
    // on a shared ward PC the next person to open the infant must not be
    // handed someone else's unsaved order. Another user's draft, or one with
    // no owner (written before 2026-09-17), is deleted unread.
    // It is offered even when the row was saved again after the draft was
    // taken (UP-C10): that is exactly the save-conflict case, where reloading
    // the newer row used to hide the typed order for good because only a
    // draft NEWER than the row was offered. The banner says it is older.
    // Never on the Center Point entry, which keeps no clinical value in
    // browser storage — it neither writes drafts (below) nor reads them.
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
    } catch {}

    if (editEntry) {
      const src = withEntryIO(editEntry);
      const n = applyCalcInput(src, editEntry.weight, true, fluidMidpoint(src.curWtG ?? src.wtG ?? editEntry.weight));
      setSavedKey(calcInputKey(n));
      setPrefilledFrom(null);
      return;
    }
    setSavedKey(null);

    // Intake / Output is measured bedside for ONE day. A new order borrows
    // yesterday's plan, never yesterday's urine output or drain: carried over,
    // they filled the required boxes, so the gate passed and Save wrote
    // yesterday's figures as today's (review 2026-09-17, UP-C5). Input still
    // tracks today's prescribed total until typed (ioTouched false).
    const NEW_DAY_IO = { ioInput: 0, ioOutput: 0, drainContent: 0 };

    if (baselineEntry) {
      skipWeightPropagateRef.current = true;
      const base = { ...withEntryIO(baselineEntry), ...NEW_DAY_IO };
      const src = { ...base, deadVol_mL: newOrderDeadVol(base, patient) };
      applyCalcInput(src, baselineEntry.weight, false, fluidMidpoint(src.curWtG ?? src.wtG ?? baselineEntry.weight));
      setPrefilledFrom({ dol: baselineEntry.dol, baseline: true });
      return;
    }

    let restored = null;
    // A deliberately dated/back-filled order must start from clinical history
    // relative to that date, never from an undated browser draft that may have
    // been created days later.
    if (!logDate && !centerPoint) {
      try {
        const raw = localStorage.getItem(`neofeed_calc_${patient.sessionId}`);
        if (raw) restored = JSON.parse(raw);
        // Expired (or unstamped) previous-submission state is not a starting
        // point — it is stale clinical data on a shared PC (SEC-F3).
        const at = Date.parse(restored?.savedAt || "");
        if (restored && (!isFinite(at) || Date.now() - at > CALC_STATE_MAX_AGE_MS)) {
          restored = null;
          localStorage.removeItem(`neofeed_calc_${patient.sessionId}`);
        }
      } catch {}
    }

    const lastWt = D.lastWeighed(patient);
    const wtDefault = restored?.curWtG ?? restored?.wtG ?? lastWt?.w ?? patient.bw ?? 0;
    // Fresh entry — ioInput tracks the computed total until edited (ioTouched false).
    const fresh = restored ? { ...restored, ...NEW_DAY_IO } : {};
    applyCalcInput({ ...fresh, deadVol_mL: newOrderDeadVol(fresh, patient) }, lastWt?.w ?? patient.bw ?? 0, false, fluidMidpoint(wtDefault));

    if (restored?.savedAt) {
      setPrefilledFrom({ savedAt: restored.savedAt, dol: restored.dol });
    } else {
      setPrefilledFrom(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.sessionId, editEntry]);

  // Which amino-acid stock this order compounds from. The ward decides what may
  // be offered (D.aaProductsFor — Aminoven only on every ward today, because
  // Aminoplasmal 15% is contraindicated under 2 years). The Center Point entry
  // is Aminoven only on any ward: its packet (neofeed-tpn-v2) has a single
  // amino-acid slot, printed "10% Aminoven infant". A saved choice the ward
  // does not allow falls back to the default — and since the live inputs then
  // differ from the saved ones, the order reads as edited and must be saved
  // again before it can print, never old id over new mL (UP-C2).
  const aaChoices = (centerPoint || scratch) ? ["aminoven10"] : D.aaProductsFor(patient);
  const aaStockKey = aaChoices.includes(aaProduct) ? aaProduct : aaChoices[0];

  // The live inputs, in exactly the shape normalizeCalcInput produces.
  const currentInputs = () => normalizeCalcInput({
    curWtG, tpnWtOverrideG, fluidTargetPerKg, otherIV_mL, drug_mL,
    ioInput, ioOutput, drainContent,
    route, totalTPN_mL, deadVol_mL, dexPct, aaPerKg, aaProduct: aaStockKey, lipidPerKg, lipidDripHours,
    naCl, naAcet, glycophosP, kCl, k2hpo4, mgPerKg, mgStrength, caPerKg, extraP_mg_kg,
    enType, enVol, enFreq, isMEN,
    inclSoluvit, inclPeditrace, znPerKg, inclAddamel, heparinUmL,
    suppVitD, suppCa, suppCaType, suppPO4, suppPO4Type, suppMTV, suppFerdek, suppFeType,
  });
  // Helper to bundle current input state for persistence
  const captureState = () => ({ ...currentInputs(), dol, savedAt: new Date().toISOString() });

  const liveInputs = currentInputs();
  const formKey = calcInputKey(liveInputs);
  // Unsaved = nothing saved from this form yet, or the form moved since.
  // (`printable` — saved, unchanged AND nothing else holding the order back —
  // is derived further down, once the alerts it depends on exist.)
  const dirty = savedKey === null || formKey !== savedKey;
  // A row still under its optimistic "tmp_" id is not saved (UP-C9).
  const pendingSave = isPendingEntryId(savedEntryId);
  // "The user has typed something" — ignores the auto-tracking Input figure.
  const userKey = calcInputKey({ ...liveInputs, ioInput: ioInputTouched ? ioInput : null });
  const userEdited = prefillKey !== null && userKey !== prefillKey && formKey !== savedKey;

  // Autosave unsaved work for this patient + date (F3). Only once the user has
  // actually changed something, so merely opening a form never leaves a draft.
  // Off on the Center Point entry: a whole TPN order in localStorage for up to
  // 72 h on a shared workstation breaks CP's no-clinical-data-in-browser rule
  // (PR #57 review, finding 1). CP holds unsaved work in the open page only.
  // Each draft records who typed it (SEC-F3) and which saved version of the
  // row it was typed on top of (UP-C10) — see the prefill effect.
  const writeDraft = (inputs) => {
    if (centerPoint || scratch || !patient?.sessionId) return;
    try {
      localStorage.setItem(draftStorageKey(patient.sessionId, orderDateKey),
        JSON.stringify({ ...inputs, dol, savedAt: new Date().toISOString(),
          by: draftOwner, baseLastModified: savedLastModified || null }));
    } catch {}
  };
  React.useEffect(() => {
    if (!userEdited) return;
    writeDraft(liveInputs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey, userEdited]);
  const clearDraft = () => {
    if (centerPoint || scratch || !patient?.sessionId) return;
    try { localStorage.removeItem(draftStorageKey(patient.sessionId, orderDateKey)); } catch {}
  };
  // A draft typed on an older saved version of this row than the one now open.
  const draftIsStale = !!(draftOffer && editEntry &&
    (draftOffer.baseLastModified || null) !== (editEntry.lastModified || null));
  const restoreDraft = () => {
    if (!draftOffer) return;
    const n = applyCalcInput(draftOffer, curWtG, true, fluidTargetPerKg);
    // Rebase the draft onto the version now open (UP-C10). This form already
    // holds that row's lastModified, so the next Save is an ordinary edit of
    // it — the user saw the conflict, reloaded and chose to carry on — rather
    // than another conflict against the stamp the draft was first typed on.
    writeDraft(n);
    setDraftOffer(null);
  };

  // Changes vs the previous day's order (for the prescriber and pharmacy).
  const orderChanges = useMemo(() => {
    if (!previousEntry?.calcInput) return null;
    return diffOrderInputs(normalizeCalcInput(previousEntry.calcInput, previousEntry.weight, 0), liveInputs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousEntry, formKey]);
  const toggleStep = (n) => setOpenSteps(prev => {
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });

  // ===== compute =====
  const calc = useMemo(() => {
    if (!wtKg) {
      const en0 = D.EN_DB[enType];
      const sv0 = { naCl:0, naAcet:0, glycophos:0, kCl:0, k2hpo4:0, ca:0, mg:0,
        mg10:0, mg50:0, heparin:0, aa:0, lipidSMOF:0 };
      return { wtKg:0, totalTPN_mL, lipidVol:0, lipidBagVol:0, vitalipidVol:0,
        enVolTotal:0, enVolPerKg:0, enKcal:0, enCounted:0, en:en0, useEnteralTargets:false,
        enFeedKg:{ kcal:0, pro:0, na:0, k:0, ca:0, p:0 }, aaStockKey,
        prescribedFluid:0, totalFluidPerKg:0, remaining:0,
        gir:0, dexG:0, aaG:0, lipidG:0,
        naKg:0, kKg:0, caKg:0, pKg:0, caP:0, caFromEN:0, pFromEN:0,
        naTotalDelivered:0, kTotalDelivered:0,
        proteinKg:0, lipidKgTotal:0, kcalKg:0, totalKcal:0, tpnKcal:0,
        kcalProtPct:0, kcalFatPct:0, kcalChoPct:0,
        npeN:0, peRatio:0, osm:300,
        pTotal_mg:0, p_glycophos:0, p_k2hpo4:0, na_glycophos:0, isMEN,
        d50wVol:0, soluvitVol:0, peditrace_vol:0, solVol:sv0,
        componentVol:0, wfiVol:0, dexGPerKg:0, kMeqPerL:0, mgStrength,
        preparedVol: totalTPN_mL > 0 ? totalTPN_mL + deadVol_mL : 0, deadVol_mL, overfill:1, factor:0,
        deliveredFrac:1, dexG_bag:0, aaG_bag:0,
        bag:{ na_mEq:0, k_mEq:0, ca_mg:0, mg_mEq:0, p_mg:0, heparin_units:0 },
        znPeditrace_mg:0, znSO4_mg:0, znSO4_bag_mg:0, znTotal_mg:0,
      };
    }
    // ── Prepared vs delivered volume — the worksheet's C7 / G7 / G8 / H9 ─────
    // totalTPN_mL (C7) is what the pump actually delivers over 24 h.
    // deadVol_mL (G8) stays in the giving set, so pharmacy compounds
    // preparedVol (G7) = delivered + dead.
    //
    // Only totalTPN_mL/preparedVol of the bag ever reaches the infant, so to
    // land the ordered per-kg dose you must put `overfill`× more in the bag.
    // The sheet folds that into one number: Factor H9 = (G7/C7) × weight, a
    // "scaled kg" it then multiplies every per-kg dose by. Two consequences:
    //   • Delivered dose per kg comes back out exactly as ordered
    //     (perKg × factor × delivered/prepared ÷ wtKg = perKg), so all the
    //     per-kg targets, tiles and GIR below stay on `wtKg` and need no change.
    //   • Concentration in the bag is likewise unchanged — amount and volume
    //     both scale by `overfill` — so osmolarity needs no change either.
    // Only the absolute bag quantities (grams, mEq/day, mL of each stock) grow.
    // No TPN volume, no bag, so no dead space: since a new order starts at
    // 30 mL on the newborn wards (2026-09-18), counting it here would turn a
    // feeds-only day into a 30 mL bag of water and heparin on the pharmacy
    // form. The vitamins that go into that bag are zeroed below, for the same
    // reason.
    const preparedVol = totalTPN_mL > 0 ? totalTPN_mL + deadVol_mL : 0;
    const overfill = totalTPN_mL > 0 ? preparedVol / totalTPN_mL : 1;   // G7/C7
    const factor = wtKg * overfill;                                     // H9
    const deliveredFrac = overfill > 0 ? 1 / overfill : 1;              // C7/G7

    const aaG = aaPerKg * wtKg;          // DELIVERED g/day — drives protein + kcal
    const aaG_bag = aaPerKg * factor;    // IN THE BAG (sheet F11) — drives the amino-acid stock mL
    const lipidG = lipidPerKg * wtKg;    // separate syringe: no overfill applied
    const lipidVol = lipidG / 0.20;
    // Vitalipid rides IN the lipid emulsion — it is not a standalone infusion,
    // so with no lipid ordered there is no Vitalipid. Computing it from weight
    // alone put 4 mL/kg/d (cap 10) of phantom volume into prescribedFluid, into
    // the "fluid available" readout at Step 1, and onto the printed pharmacy
    // order form, for patients with no lipid bag at all. It also silently
    // defeated the `calc.lipidBagVol > 0` guard below, which is meant to read
    // as "lipid is ordered" but could never be false once a weight was entered.
    const vitalipidVol = lipidPerKg > 0 ? Math.min(4 * wtKg, 10) : 0;
    const lipidBagVol = lipidVol + vitalipidVol;

    // dexPct is the final concentration of the PREPARED bag (sheet D10), so the
    // infant receives that concentration in the delivered volume.
    const dexG = totalTPN_mL * dexPct / 100;   // DELIVERED g/day — drives GIR + kcal
    const dexG_bag = preparedVol * dexPct / 100; // IN THE BAG (F10) — drives D50W mL
    const gir = dexG * 1000 / (1440 * wtKg);

    // Phosphate sources
    // Glycophos®: 1 mL = 1 mmol P + 2 mmol Na
    //   Input glycophosP in mmol P/kg/day (= mL/kg/day)
    //   P contribution: glycophosP × 31 mg/kg/day (31 mg/mL per order form)
    //   Na contribution: glycophosP × 2 mmol/kg/day (auto, not entered by doctor)
    const na_glycophos = glycophosP * 2;          // mEq Na/kg/day from Glycophos (Na=2 mEq/mL)
    const p_glycophos  = glycophosP * wtKg * 31;  // mg P total (P=31 mg/mL per order form)
    // K₂HPO₄: 1 mEq K → 15.5 mg P (K entered, P auto-derived)
    const p_k2hpo4 = k2hpo4 * wtKg * 15.5;
    const pTotal_mg = p_glycophos + p_k2hpo4 + extraP_mg_kg * wtKg;

    const naKg = naCl + naAcet + na_glycophos;
    const kKg = kCl + k2hpo4;
    // Parenteral P only. EN is added at the return (`pKg: pKg_tpn + pFromEN`),
    // so do NOT read this as the total — it was named plain `pKg` and shadowed
    // the returned total 139 lines later, in the highest-consequence function
    // in the app.
    const pKg_tpn = pTotal_mg / wtKg;

    // EN — computed before caP so EN minerals can be included in the ratio
    const en = D.EN_DB[enType];
    const enVolTotal = enVol * enFreq;
    const enVolPerKg = enVolTotal / wtKg;
    // The feed volume that COUNTS. A MEN (trophic) feed counts toward neither
    // the fluid total nor any nutrient total — energy, protein, lipid, Na, K,
    // Ca, P, Ca:P and everything saved or printed from them (NICU team,
    // 2026-09-18: "ติ๊ก MEN แล้ว ไม่ต้องเอาไปคิดสารอาหาร"; until then it left
    // fluid only). Every EN term below reads enCounted. enVolTotal/enVolPerKg
    // stay the feed actually given: the EN volume tile, the route and
    // Daily_Log's enVolPerKg (which savedDosingWeightOf reads) keep meaning that.
    const enCounted = isMEN ? 0 : enVolTotal;
    const enKcal = enCounted / 100 * en.kcal;
    const enProteinG = enCounted / 100 * en.pro;
    const enLipidG = enCounted / 100 * en.fat;
    // A MEN feed is not nutrition, so it never switches on the enteral targets.
    const useEnteralTargets = enCounted / wtKg >= 100;
    // What the feed itself provides per kg/day, counted or not — Step 2 shows
    // it, marked "not counted" when MEN is ticked.
    const enFeedKg = {
      kcal: enVolTotal / 100 * en.kcal / wtKg, pro: enVolTotal / 100 * en.pro / wtKg,
      na:   enVolTotal / 100 * en.na   / wtKg, k:   enVolTotal / 100 * en.k   / wtKg,
      ca:   enVolTotal / 100 * en.ca   / wtKg, p:   enVolTotal / 100 * en.p   / wtKg,
    };

    // Fluid
    const targetFluid_mLd = fluidTargetPerKg * wtKg;
    const prescribedFluid = totalTPN_mL + lipidBagVol + otherIV_mL + drug_mL + enCounted;
    const remaining = targetFluid_mLd - prescribedFluid;
    const totalFluidPerKg = prescribedFluid / wtKg;

    // Energy
    const dexKcal = dexG * 3.4;
    const aaKcal = aaG * 4;
    // 9 kcal/g fat — matches the official KCMH sheet (E53 = 3.4×dex + 4×AA + 9×fat)
    // so NeoFeed's kcal/kg/d reconciles with the pharmacy printout. Note this is
    // the pure-fat figure; a 20% emulsion incl. glycerol runs ~10 kcal/g.
    const lipidKcal = lipidG * 9;
    const tpnKcal = dexKcal + aaKcal + lipidKcal;
    const totalKcal = tpnKcal + enKcal;
    const kcalKg = totalKcal / wtKg;

    const totalProteinG = aaG + enProteinG;
    const proteinKg = totalProteinG / wtKg;
    const totalLipidG = lipidG + enLipidG;
    const lipidKgTotal = totalLipidG / wtKg;

    // Distribution per kg
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

    // Ca:P mass ratio — uses combined TPN + EN mineral delivery for accuracy
    // When Ca is ordered but total P = 0, Infinity triggers "crit" in rangeStatus
    const totalCaMg_combined = (caPerKg + caFromEN) * wtKg;
    const totalPMg_combined  = pTotal_mg + pFromEN * wtKg;
    const caP = totalPMg_combined > 0
      ? totalCaMg_combined / totalPMg_combined
      : (totalCaMg_combined > 0 ? Infinity : 0);

    // D50W volume — how much 50% dextrose to add to reach target concentration
    // D50W (0.5 g/mL): mL needed = glucose g IN THE BAG ÷ 0.5
    const d50wVol = dexG_bag > 0 ? parseFloat((dexG_bag / S.d50w.gPerMl).toFixed(1)) : 0;

    // Vitamins + TE volumes (added to aqueous PN bag)
    // Both 1 mL/kg/day per the KCMH sheet (B43, B45), capped at 10 / 15 mL a
    // day to the infant, then scaled by the overfill like every electrolyte
    // and the amino acid, so the infant receives the full 1 mL/kg (Praew,
    // 2026-09-18). The KCMH sheet itself does not: its rows G43/G45/G46 are
    // `× C6` (actual weight), not `× H9`, so an overfilled bag delivered only
    // `deliveredFrac` of them — 80 % on a 120 mL day once every NICU/SCN order
    // started with 30 mL dead space. On an overfilled bag NeoFeed's printed
    // mL therefore exceed that sheet's; the form says so, for pharmacy.
    // With no TPN volume there is no aqueous bag to add them to: 0, not the
    // mL (and the negative WFI) a feeds-only day used to print (review
    // 2026-09-18, finding 4).
    const soluvitVol    = inclSoluvit   && totalTPN_mL > 0 ? parseFloat((Math.min(S.soluvit.mlPerKg   * wtKg, S.soluvit.maxMl  ) * overfill).toFixed(1)) : 0;
    const peditrace_vol = inclPeditrace && totalTPN_mL > 0 ? parseFloat((Math.min(S.peditrace.mlPerKg * wtKg, S.peditrace.maxMl) * overfill).toFixed(1)) : 0;

    // ── Zinc reaching the infant, mg elemental Zn/day (TPN team, 2026-09-22) ─
    // Peditrace at the mL the infant receives (1 mL/kg, the 15 mL cap is on
    // that), not the rounded bag mL, plus ZnSO₄. ZnSO₄ is dosed per kg like
    // every additive, so the bag carries it × Factor. Pharmacy's ZnSO₄ stock
    // is not in KCMH_STOCK, so it has no mL here and no share of the WFI.
    // Counted even with no bag volume, like the salts: that order cannot be
    // saved (zeroVolumeBag).
    const znPeditrace_mg = inclPeditrace && totalTPN_mL > 0
      ? Math.min(S.peditrace.mlPerKg * wtKg, S.peditrace.maxMl) * S.peditrace.znMgPerMl : 0;
    const znSO4_mg = znPerKg * wtKg;
    const znSO4_bag_mg = znPerKg * factor;
    const znTotal_mg = znPeditrace_mg + znSO4_mg;

    // ── Solution volumes mL/day (for pharmacist + order form writing) ────────
    // Every divisor comes from D.KCMH_STOCK — see the "DO NOT change" note there.
    // Every per-kg dose is multiplied by `factor` (H9), NOT wtKg, so the bag is
    // overfilled and the delivered dose lands on the ordered per-kg value.
    const r1 = (n) => parseFloat(n.toFixed(1));
    const r2 = (n) => parseFloat(n.toFixed(2));
    const mgStock = mgStrength === "50" ? S.mgso4_50 : S.mgso4_10;
    const solVol = {
      naCl:      naCl   > 0 ? r1(naCl   * factor / S.naCl.naMeqPerMl     ) : 0, // 20% NaCl
      naAcet:    naAcet > 0 ? r1(naAcet * factor / S.naAcetate.naMeqPerMl) : 0, // Na Acetate
      glycophos: r1(glycophosP * factor),                                       // 1 mL = 1 mmol P
      kCl:       kCl    > 0 ? r1(kCl    * factor / S.kCl.kMeqPerMl       ) : 0, // KCl
      k2hpo4:    k2hpo4 > 0 ? r2(k2hpo4 * factor / S.k2hpo4.kMeqPerMl    ) : 0, // K₂HPO₄
      ca:        caPerKg> 0 ? r1(caPerKg* factor / S.caGluconate.caMgPerMl) : 0,// 10% Ca gluconate
      mg:        mgPerKg> 0 ? r2(mgPerKg* factor / mgStock.mgMeqPerMl    ) : 0, // MgSO₄ (chosen strength)
      // Both Mg strengths, so the pharmacy label can show the alternative
      mg10:      mgPerKg> 0 ? r2(mgPerKg* factor / S.mgso4_10.mgMeqPerMl ) : 0,
      mg50:      mgPerKg> 0 ? r2(mgPerKg* factor / S.mgso4_50.mgMeqPerMl ) : 0,
      // Heparin is dosed per mL of bag (sheet G51 = F51 × G7), so prepared volume
      heparin:   heparinUmL > 0 ? r2(heparinUmL * preparedVol / S.heparin.unitsPerMl) : 0,
      aa:        r1(aaG_bag / S[aaStockKey].gPerMl),     // amino acid, chosen stock (aaStockKey)
      lipidSMOF: r1(lipidG / S.smof20.gPerMl),   // separate syringe — no overfill
    };

    // ── Bag quantities (what pharmacy weighs out) vs delivered ──────────────
    // Absolute amounts in the compounded bag — these are the numbers the sheet's
    // "Prescribed / mEq per Day" column shows, and they carry the overfill.
    const bag = {
      na_mEq: (naCl + naAcet + glycophosP * S.glycophos.naMeqPerMl) * factor,
      k_mEq:  (kCl + k2hpo4) * factor,
      ca_mg:  caPerKg * factor,
      mg_mEq: mgPerKg * factor,
      p_mg:   (glycophosP * S.glycophos.pMgPerMl + k2hpo4 * S.k2hpo4.pMgPerKMeq + extraP_mg_kg) * factor,
      heparin_units: heparinUmL * preparedVol,
    };

    // ── Bag make-up: components vs water for injection ───────────────────────
    // Mirrors the sheet's J52 (Σ component mL) and I53 (WFI q.s. = G7 − Σ).
    // Lipid + Vitalipid are a separate syringe, so they are NOT in this sum.
    const componentVol = parseFloat((
      d50wVol + solVol.aa + solVol.naCl + solVol.naAcet + solVol.glycophos +
      solVol.k2hpo4 + solVol.kCl + solVol.mg + solVol.ca +
      soluvitVol + peditrace_vol + solVol.heparin
    ).toFixed(1));
    const wfiVol = parseFloat((preparedVol - componentVol).toFixed(1));

    // ── Sheet safety ceilings ────────────────────────────────────────────────
    // The sheet tests bag amounts against factor-scaled limits (F10 vs F9 = 18×H9,
    // G30 vs G25 = G7×40/1000). Dividing both sides by the overfill gives the
    // delivered-basis forms below — identical results, easier to read.
    const dexGPerKg = dexG / wtKg;                                             // vs 18 g/kg/d
    const kMeqPerL  = preparedVol > 0 ? bag.k_mEq / (preparedVol / 1000) : 0;  // vs 40 mEq/L

    const osm = D.estimateOsmolarity({
      dexPct,
      aaPct:      aaG > 0 && totalTPN_mL > 0 ? aaG / totalTPN_mL * 100 : 0,
      naMeqPerL:  totalTPN_mL > 0 ? naKg    * wtKg / (totalTPN_mL / 1000) : 0,
      kMeqPerL,
      caMgPerL:   totalTPN_mL > 0 ? caPerKg * wtKg / (totalTPN_mL / 1000) : 0, // elemental Ca mg/L
      mgMeqPerL:  totalTPN_mL > 0 ? mgPerKg * wtKg / (totalTPN_mL / 1000) : 0, // Mg mEq/L
    });

    return {
      wtKg, totalTPN_mL, lipidVol, lipidBagVol, vitalipidVol,
      enVolTotal, enVolPerKg, enKcal, enCounted, en, useEnteralTargets, enFeedKg, aaStockKey,
      prescribedFluid, totalFluidPerKg, remaining,
      gir, dexG, aaG, lipidG,
      naKg, kKg, caKg: caPerKg + caFromEN, pKg: pKg_tpn + pFromEN, caP,
      caFromEN, pFromEN,
      naTotalDelivered: naKg + naFromEN, kTotalDelivered: kKg + kFromEN,
      proteinKg, lipidKgTotal, kcalKg, totalKcal, tpnKcal,
      kcalProtPct, kcalFatPct, kcalChoPct,
      npeN, peRatio, osm,
      pTotal_mg, p_glycophos, p_k2hpo4, na_glycophos, isMEN,
      d50wVol, soluvitVol, peditrace_vol, solVol,
      componentVol, wfiVol, dexGPerKg, kMeqPerL, mgStrength,
      // Prepared-vs-delivered (the Factor)
      preparedVol, deadVol_mL, overfill, factor, deliveredFrac, dexG_bag, aaG_bag, bag,
      znPeditrace_mg, znSO4_mg, znSO4_bag_mg, znTotal_mg,
    };
  }, [wtG, wtKg, fluidTargetPerKg, otherIV_mL, drug_mL,
  totalTPN_mL, deadVol_mL, dexPct, aaPerKg, aaStockKey, lipidPerKg,
  naCl, naAcet, glycophosP, kCl, k2hpo4, mgPerKg, mgStrength, caPerKg, extraP_mg_kg,
  enType, enVol, enFreq, isMEN,
  // `route` is deliberately NOT a dependency — the memo never reads it. It is
  // used afterwards for sOsm and the saved entry's route string. Listing it
  // recomputed the whole memo on every central/peripheral toggle.
  inclSoluvit, inclPeditrace, znPerKg, heparinUmL]);

  // Keep ioInput tracking the computed prescribed-fluid total until the user
  // edits it directly — same "live default, sticky once touched" pattern the
  // rest of this form uses for smart prefills.
  React.useEffect(() => {
    if (ioInputTouchedRef.current) return;   // ref, not state — see markIoInputTouched
    setIoInput(Math.round(calc.prescribedFluid) || 0);
  }, [calc.prescribedFluid, ioInputTouched]);

  // ── Intake / Output card ─────────────────────────────────────────
  // Divisor: previous day's weight, or birth weight while the infant hasn't
  // yet regained it — falling forward to today's entered weight (curWtG)
  // once that alone exceeds birth weight (D.ioDivisorG — see data.js).
  //
  // The Output field is urine output only (drain is entered separately),
  // entered/stored as raw mL/day like Input/Drain and the existing backend
  // column. ioOutputPerKgH is derived for display only — the mL/kg/h rate a
  // nurse judges against the 1–3 mL/kg/h target — shown as a hint under the
  // field, never stored.
  //
  // Balance = Input − Output(urine) − Drain: both are real fluid losses now
  // that Output no longer folds drain in, so both are subtracted explicitly.
  const ioDivisor = D.ioDivisorG(patient, dol, curWtG);
  const ioDivisorGVal = ioDivisor.g;
  const ioDivisorKg = ioDivisorGVal ? ioDivisorGVal / 1000 : null;
  const ioInputPerKg = ioDivisorKg ? ioInput / ioDivisorKg : null;
  const ioOutputPerKgH = ioDivisorKg ? Math.round((ioOutput / ioDivisorKg / 24) * 100) / 100 : null;
  const ioDrainPerKg = ioDivisorKg ? drainContent / ioDivisorKg : null;
  const ioBalance = ioInput - ioOutput - drainContent;

  // ── Ca · PO₄ · Ca:P summary (Step 6) ────────────────────────────
  // Oral supplement doses are entered as elemental mg/kg/day, i.e. already in
  // the same unit as calc.caKg / calc.pKg — so the sources add directly.
  // Kept separate from `calc` on purpose: `calc` feeds the saved Daily_Log
  // entry and the Step 4 TPN tiles, which stay IV+EN only. This block is the
  // total-intake view (IV + feed + oral) that the bedside order needs.
  const mineral = useMemo(() => {
    // Ca present with zero P → Infinity, which rangeStatus reports as "crit"
    const ratio = (ca, p) => p > 0 ? ca / p : (ca > 0 ? Infinity : 0);
    const tpnCa = caPerKg,          tpnP = calc.pTotal_mg > 0 && wtKg > 0 ? calc.pTotal_mg / wtKg : 0;
    const enCa  = calc.caFromEN,    enP  = calc.pFromEN;
    const oralCa = suppCa,          oralP = suppPO4;
    const ivCa = tpnCa + enCa,      ivP  = tpnP + enP;   // everything except oral supplement
    const totCa = ivCa + oralCa,    totP = ivP + oralP;
    return {
      tpnCa, tpnP, tpnCaP: ratio(tpnCa, tpnP),
      enCa, enP,
      oralCa, oralP, oralCaP: ratio(oralCa, oralP),
      ivCa, ivP, ivCaP: ratio(ivCa, ivP),
      totCa, totP, totCaP: ratio(totCa, totP),
      hasOral: oralCa > 0 || oralP > 0,
      hasIV: ivCa > 0 || ivP > 0,
    };
  }, [caPerKg, suppCa, suppPO4, wtKg, calc.pTotal_mg, calc.caFromEN, calc.pFromEN]);

  // ── Step completion status (for dots + collapsed summaries) ──────
  // Keys are content ids, not the visible card order — 1 fluid, 2 TPN
  // (Step 3), 3 electrolytes (Step 4), 4 vitamins (Step 5), 5 enteral (Step 2)
  const stepStatus = {
    1: fluidTargetPerKg > 0 && Math.abs(calc.remaining) < 20 ? "done" : "partial",
    2: totalTPN_mL > 0 && dexPct > 0 && aaPerKg > 0 ? "done"
       : (totalTPN_mL > 0 || dexPct > 0 || aaPerKg > 0) ? "partial" : "empty",
    3: (naCl + naAcet + glycophosP + kCl + caPerKg + mgPerKg) > 0 ? "done" : "empty",
    4: "done", // vitamins/TE always defaulted
    5: calc.enVolPerKg >= 100 ? "done" : calc.enVolPerKg > 0 ? "partial" : "empty",
  };

  // StepHead is inlined in each card below (not a component — avoids unmount/remount issue)

  // Target switching
  const useEN = calc.useEnteralTargets;
  const T = useEN ? D.ENTERAL_TARGETS : D.TPN_TARGETS;
  const tFluid = D.TARGETS.fluid(dol, wtG);
  const tGir   = D.TARGETS.gir();                         // [4, 12] display range
  const tPro   = T.protein(dol);
  const tKcal  = T.kcal(dol);
  const tLip   = T.lipid(dol);
  // Phase-aware electrolyte targets (updated ESPGHAN 2018 + 2022)
  const tNa    = T.na(dol);                               // mmol/kg/day, DOL-specific
  const tK     = T.k(dol);                               // mmol/kg/day, DOL-specific
  const tCa    = T.ca(dol, calc.useEnteralTargets);      // mg/kg/day, route-aware
  const tP     = T.p(dol, calc.useEnteralTargets);       // mg/kg/day, route-aware
  // Ca:P mass ratio — ESPGHAN 2018 molar 0.8–1.3 × (40/31) → mass 1.0–1.7.
  // KCMH order form aims at the upper end (~1.7:1).
  const tCaP = D.TARGETS.caP();            // [1.0, 1.7] mass ratio
  // Mg mEq/kg/day — ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Mihatsch): 0.1–0.2 mmol/kg
  // in the first days, 0.2–0.3 growing = 0.2–0.4 / 0.4–0.6 mEq. The tile, its
  // alert and the printed "Normal Requirement" all read this one range, in
  // mEq because Mg is dosed in mEq: the guideline's mg figures are rounded
  // (0.1 mmol = 2.43 mg, printed 2.5), so comparing in mg would flag the 0.2
  // and 0.4 presets — the exact bounds — as off target. Parenteral only: no
  // enteral Mg target, and no Mg in EN_DB, so the tile is the TPN's Mg.
  const tMg = D.TARGETS.mg(dol);

  // Non-protein energy per g amino acid — classic NPC:N 150–200:1 ÷ 6.25 g AA/g N = 24–32 kcal/g AA
  // (was briefly [30, 40] — that "correction" was unverified; reverted per clinical review 2026-08-11)
  // Soft-alert 20–<24 (AA start being burned as fuel) · hard alert <20 or >32 (excess fat deposition)
  const tNPE = D.TARGETS.npePerGAA();     // [24, 32]

  // Protein:Energy ratio — ESPGHAN 2022: 2.8–3.6 g protein/100 kcal
  // (was [2.5, 3.5] — updated to 2022 lean mass accretion target)
  const tPE  = D.TARGETS.peRatio();       // [2.8, 3.6]

  const sFluid = D.rangeStatus(calc.totalFluidPerKg, tFluid); // no hardHi — attending discretion, may go >200
  const sGir = D.rangeStatus(calc.gir, tGir, { hardHi: 13 });
  const sPro = D.rangeStatus(calc.proteinKg, tPro, { hardHi: 4.8 });
  const sKcal = D.rangeStatus(calc.kcalKg, tKcal);
  // Lipid, K and NPE:AA tiles show the TOTAL (TPN + EN) against the active
  // target band only; their hard limits are judged on the IV portion further
  // down (hardLip / hardK / hardNPE — Praew, 2026-09-17, UP-C4).
  const sLip = D.rangeStatus(calc.lipidKgTotal, tLip);
  const sNa = D.rangeStatus(calc.naTotalDelivered, tNa);
  const sK = D.rangeStatus(calc.kTotalDelivered, tK);
  const sCa = D.rangeStatus(calc.caKg, tCa);
  const sP = D.rangeStatus(calc.pKg, tP);
  const sCaP = D.rangeStatus(calc.caP, tCaP);
  const sMg = D.rangeStatus(mgPerKg, tMg);
  // Step 6 total-intake statuses — same targets as Step 4, applied to IV + feed + oral
  const sTotCa  = D.rangeStatus(mineral.totCa, tCa);
  const sTotP   = D.rangeStatus(mineral.totP, tP);
  const sTotCaP = D.rangeStatus(mineral.totCaP, tCaP);
  const sNPE = D.rangeStatus(calc.npeN, tNPE);
  const sPE = D.rangeStatus(calc.peRatio, tPE);
  // K⁺ concentration of the bag against the worksheet's stop (G25), either route.
  const sKConc = D.rangeStatus(calc.kMeqPerL, [0, D.MAX_K_MEQ_PER_L], { hardHi: D.MAX_K_MEQ_PER_L });
  // Peripheral: crit >900, warn >850 · Central: warn >1800 (endothelial risk), no hard limit
  const sOsm = route === "peripheral"
    ? (calc.osm > 900 ? "crit" : calc.osm > 850 ? "warn" : "ok")
    : (calc.osm > 1800 ? "warn" : "ok");

  // ── Hard limits on the IV (TPN) portion only — Praew, 2026-09-17 (UP-C4) ──
  // Lipid 4.5 g/kg/d, K 3.5 mEq/kg/d and NPE:AA 20–32 kcal/g are limits on what
  // is infused. Judged on TPN + EN they sat inside or below the ENTERAL target
  // bands (lipid 4.8–8.1, K 2.3–4.6), so every infant on full feeds raised
  // critical alerts that could only be cleared by typing an override reason —
  // a stop that gets cleared by rote. What they read now: the lipid syringe
  // (g/kg/d), the bag's K (kKg, delivered mEq/kg/d) and the bag's non-protein
  // kcal per g AA; with no AA in the bag there is no IV NPE:AA to judge. A
  // pure-PN order is unchanged — IV and total are the same numbers — and
  // D.rangeStatus is kept so its semantics (a 0 is "empty", not critical)
  // carry over exactly. GIR is IV already; protein 4.8 is left on the total.
  const ivLipidKg = wtKg > 0 ? calc.lipidG / wtKg : 0;
  const ivKKg     = calc.kKg;
  const ivNpeN    = calc.aaG > 0 ? (calc.tpnKcal - calc.aaG * 4) / calc.aaG : null;
  const hardLip = D.rangeStatus(ivLipidKg, tLip, { hardHi: 4.5 }) === "crit";
  const hardK   = D.rangeStatus(ivKKg, tK, { hardHi: 3.5 }) === "crit";
  const hardNPE = ivNpeN !== null && D.rangeStatus(ivNpeN, tNPE, { hardLo: 20, hardHi: 32 }) === "crit";
  // "· total incl. EN …" only when EN actually moves the figure.
  const withTotal = (iv, total, d, unit) => Math.abs(total - iv) >= 0.5 * Math.pow(10, -d)
    ? ` · total incl. EN ${fmt(total, d)} ${unit}` : "";
  // A value just past a limit must not print AS the limit ("IV 20 < 20" for
  // 19.97): add decimals until the two read differently.
  const vsLimit = (v, limit, d) => {
    while (d < 3 && fmt(v, d) === fmt(limit, d)) d++;
    return fmt(v, d);
  };
  const ivRef = "Hard limit · TPN (IV) portion";

  // The bag has ingredients but no volume (UP-C3) — see zeroVolumeBag below.
  // Here it only widens two bag alerts that used to need volume > 0, so the
  // screen never hides what the printed form would show.
  const bagIngredientsWithoutVolume = totalTPN_mL > 0 ? [] : [
    [aaPerKg, "Amino acid"], [dexPct, "Dextrose"], [naCl, "20% NaCl"], [naAcet, "Na acetate"],
    [glycophosP, "Glycophos"], [kCl, "KCl"], [k2hpo4, "K₂HPO₄"], [mgPerKg, "MgSO₄"], [caPerKg, "Ca gluconate"],
    [znPerKg, "ZnSO₄"],
  ].filter(([v]) => v > 0).map(([, label]) => label);
  const zeroVolumeBag = bagIngredientsWithoutVolume.length > 0;
  const bagOrdered = calc.totalTPN_mL > 0 || zeroVolumeBag;

  const alerts = [];
  if (calc.totalTPN_mL > 0 && sGir === "crit") alerts.push({ level: "crit", title: "GIR critically high", body: `${fmt(calc.gir, 1)} mg/kg/min — lower dextrose %.`, ref: "ESPGHAN 2018" });else
  if (calc.totalTPN_mL > 0 && sGir === "warn") alerts.push({ level: "warn", title: "GIR off target", body: `${fmt(calc.gir, 1)} — aim ${tGir[0]}–${tGir[1]}.`, ref: "ESPGHAN" });
  // Titles are unchanged from the total-based alerts they replace: a saved
  // critOverride lists titles, and print checks the current ones against it.
  if (hardNPE) alerts.push({ level: "crit", title: "NPE:AA critically off target", body: `NPE:AA IV ${vsLimit(ivNpeN, ivNpeN < 20 ? 20 : 32, 0)} kcal/g AA ${ivNpeN < 20 ? "< 20" : "> 32"} hard limit (TPN only) — <20 risks AA oxidised as fuel, >32 risks excess fat deposition${withTotal(ivNpeN, calc.npeN, 0, "kcal/g")}.`, ref: `NPC:N 150–200:1 · ${ivRef}` });else
  if (calc.totalKcal > 0 && sNPE === "warn") alerts.push({ level: "warn", title: "NPE:AA off target", body: `${calc.npeN.toFixed(0)} kcal/g protein — aim ${tNPE[0]}–${tNPE[1]} kcal/g AA (soft-alert zone 20–<24).`, ref: "NPC:N 150–200:1" });
  // ── Every nutrient tile that is off target or critical is ALSO a line here ──
  // Until 2026-09-11 only GIR, NPE, Ca:P-warn and the worksheet ceilings were
  // pushed, so K 5 mEq/kg/d or Ca with zero P turned a tile red while this
  // panel said "All targets within range" (review F1). The rule is now
  // structural: a tile's status and its alert come from the same variable.
  const tileRef = useEN ? "ESPGHAN 2022 (enteral)" : "ESPGHAN 2018 (parenteral)";
  const pushTile = (status, name, value, decimals, target, unit, critNote, ref = tileRef) => {
    if (status === "crit") alerts.push({ level: "crit", title: `${name} critically out of range`,
      body: `${fmt(value, decimals)} ${unit} — ${critNote || `target ${target[0]}–${target[1]} ${unit}`}.`, ref });
    else if (status === "warn") alerts.push({ level: "warn", title: `${name} off target`,
      body: `${fmt(value, decimals)} ${unit} — target ${target[0]}–${target[1]} ${unit}.`, ref });
  };
  pushTile(sPro,  "Protein",   calc.proteinKg,        1, tPro,  "g/kg/d",    "above the 4.8 g/kg/d hard limit");
  pushTile(sKcal, "Energy",    calc.kcalKg,           0, tKcal, "kcal/kg/d");
  // One line per nutrient: an IV hard-limit breach replaces the tile's own
  // off-target line (its body carries the total too), as the single critical
  // alert did before the split.
  if (hardLip) alerts.push({ level: "crit", title: "Lipid critically out of range",
    body: `Lipid IV ${vsLimit(ivLipidKg, 4.5, 1)} g/kg/d > 4.5 g/kg/d hard limit (TPN lipid only)${withTotal(ivLipidKg, calc.lipidKgTotal, 1, "g/kg/d")}.`, ref: ivRef });
  else pushTile(sLip, "Lipid", calc.lipidKgTotal, 1, tLip, "g/kg/d");
  pushTile(sNa,   "Sodium",    calc.naTotalDelivered, 1, tNa,   "mEq/kg/d");
  if (hardK) alerts.push({ level: "crit", title: "Potassium critically out of range",
    body: `K IV ${vsLimit(ivKKg, 3.5, 1)} mEq/kg/d > 3.5 mEq/kg/d hard limit (TPN only)${withTotal(ivKKg, calc.kTotalDelivered, 1, "mEq/kg/d")}.`, ref: ivRef });
  else pushTile(sK, "Potassium", calc.kTotalDelivered, 1, tK, "mEq/kg/d");
  // Mg has only a parenteral reference, so its line never cites the enteral table.
  pushTile(sMg, "Magnesium", mgPerKg, 2, tMg, "mEq/kg/d", null, "ESPGHAN 2018 (parenteral)");
  // With an oral supplement the order is judged on the total (Step 6 tiles);
  // without one, on TPN + EN (Step 4 tiles) — never both, or they contradict.
  if (mineral.hasOral) {
    pushTile(sTotCa, "Calcium (total incl. oral)",   mineral.totCa, 0, tCa, "mg/kg/d");
    pushTile(sTotP,  "Phosphate (total incl. oral)", mineral.totP,  0, tP,  "mg/kg/d");
  } else {
    pushTile(sCa, "Calcium",    calc.caKg, 0, tCa, "mg/kg/d");
    pushTile(sP,  "Phosphorus", calc.pKg,  0, tP,  "mg/kg/d");
  }
  const caPStatus = mineral.hasOral ? sTotCaP : sCaP;
  const caPValue  = mineral.hasOral ? mineral.totCaP : calc.caP;
  const caPScope  = mineral.hasOral ? " (รวม oral supp)" : "";
  if (caPStatus === "crit") alerts.push({ level: "crit", title: `Ca:P ratio${caPScope} — ไม่มี P`, body: `Ca ${fmt(mineral.hasOral ? mineral.totCa : calc.caKg, 0)} mg/kg/d แต่ P = 0 — เสี่ยง metabolic bone disease / สั่ง phosphate ร่วมด้วย.`, ref: "ESPGHAN 2018" });
  else if (caPStatus === "warn") alerts.push({ level: "warn", title: `Ca:P ratio${caPScope} off target`, body: `Mass ratio ${fmt(caPValue, 2)}:1 — aim ${tCaP[0]}–${tCaP[1]}:1 (molar 0.8–1.3:1 ESPGHAN 2018).`, ref: "ESPGHAN 2018" });
  // Not for a MEN feed: its P:E would be the TPN's alone, judged on an enteral target.
  if (!isMEN && calc.enVolPerKg > 100 && sPE === "warn") alerts.push({ level: "warn", title: "Protein : Energy off target", body: `${fmt(calc.peRatio, 1)} g/100 kcal — aim ${tPE[0]}–${tPE[1]}.`, ref: "ESPGHAN 2022" });
  // A MEN feed is left out of fluid and every nutrient total, and orders
  // prefill from yesterday — so a MEN tick left on after the feed is advanced
  // hides real feeds. Above the trophic ceiling it is flagged; a warning, never
  // a stop (Praew, 2026-09-18).
  if (isMEN && calc.enVolPerKg > D.MEN_MAX_ML_KG) alerts.push({ level: "warn", title: "MEN ticked above trophic volume",
    body: `EN ${fmt(calc.enVolPerKg, 0)} mL/kg/d is above the ${D.MEN_MAX_ML_KG} mL/kg/d trophic ceiling, and a MEN feed counts toward neither fluid nor nutrition. ถ้าเพิ่มนมแล้ว ให้เอาเครื่องหมาย MEN ออก.`,
    ref: `Feeding Advancement · MEF 12–${D.MEN_MAX_ML_KG} mL/kg/d` });
  if (bagOrdered && sOsm === "crit") alerts.push({ level: "crit", title: "Osmolarity > peripheral limit", body: `${calc.osm.toFixed(0)} mOsm/L — switch to central.`, ref: "Safety" });
  else if (bagOrdered && sOsm === "warn") alerts.push({ level: "warn", title: route === "peripheral" ? "Osmolarity near peripheral limit" : "Osmolarity high for central line", body: `${calc.osm.toFixed(0)} mOsm/L — ${route === "peripheral" ? "peripheral limit 900" : "endothelial risk above 1800"} mOsm/L.`, ref: "Safety" });
  if (calc.totalTPN_mL > 0 && Math.abs(calc.totalFluidPerKg - fluidTargetPerKg) > 20) alerts.push({ level: "info", title: "Fluid: prescribed ≠ target", body: `Prescribed ${calc.totalFluidPerKg.toFixed(0)} vs plan ${fluidTargetPerKg} mL/kg/d — attending discretion`, ref: "Plan" });
  // ── KCMH worksheet hard ceilings (F9, G25) + compoundability ──────────────
  if (calc.dexGPerKg > D.MAX_DEXTROSE_G_KG) alerts.push({ level: "crit", title: "Dextrose over KCMH max", body: `${fmt(calc.dexGPerKg, 1)} g/kg/d — sheet limit is ${D.MAX_DEXTROSE_G_KG} g/kg/d. Lower dextrose % or bag volume.`, ref: "KCMH TPN worksheet" });
  // The stop is the worksheet's 40 mEq/L on either route; the route ceilings
  // the TPN team quoted are shown for reference only (Praew, 2026-09-22).
  // The title is unchanged: a saved critOverride names alerts by title.
  if (calc.kMeqPerL > D.MAX_K_MEQ_PER_L) alerts.push({ level: "crit", title: "K⁺ concentration too high", body: `${fmt(calc.kMeqPerL, 0)} mEq/L — max ${D.MAX_K_MEQ_PER_L} mEq/L in the bag (reference ceilings: peripheral ${D.K_REF_MEQ_PER_L.peripheral} · central ${D.K_REF_MEQ_PER_L.central} mEq/L). Increase volume or reduce K.`, ref: "KCMH TPN worksheet" });
  // Zinc from Peditrace and ZnSO₄ together, above the TPN team's ceiling.
  // Critical, so Save asks the prescriber to confirm with a reason (2026-09-22).
  if (calc.znTotal_mg > D.MAX_ZN_MG_DAY) alerts.push({ level: "crit", title: `Zinc total above ${D.MAX_ZN_MG_DAY} mg/day`, body: `Zn ${fmt(calc.znTotal_mg, 2)} mg/day (Peditrace ${fmt(calc.znPeditrace_mg, 2)} + ZnSO₄ ${fmt(calc.znSO4_mg, 2)}) — max ${D.MAX_ZN_MG_DAY} mg/day.`, ref: "KCMH TPN team" });
  if (bagOrdered && calc.wfiVol < 0) alerts.push({ level: "crit", title: "Bag cannot be compounded", body: `Components total ${fmt(calc.componentVol, 1)} mL but the prepared bag is only ${fmt(calc.preparedVol, 1)} mL — over by ${fmt(Math.abs(calc.wfiVol), 1)} mL.`, ref: "WFI q.s." });
  if (calc.totalTPN_mL > 0 && caPerKg > 0 && k2hpo4 > 0) alerts.push({ level: "warn", title: "Calcium–phosphate compatibility not calculated", body: "This order combines calcium with inorganic phosphate. NeoFeed does not calculate formulation-specific precipitation risk; pharmacy must verify compatibility before compounding or administration.", ref: "ESPGHAN/ESPEN/ESPR/CSPEN 2018" });

  // ── May this order be printed / copied / submitted right now? ─────────────
  // Saved and unchanged was the whole test (F2). It let through a pharmacy
  // form whose numbers or acknowledgements no longer match the saved row
  // (review 2026-09-17):
  //  • UP-C9  a row still under its optimistic tmp_ id is not saved at all;
  //  • UP-C3  a bag with ingredients and no volume cannot be compounded;
  //  • UP-C2  the dosing weight moved after the save (a corrected birth
  //           weight re-doses every mL while the inputs stay identical);
  //  • UP-C6  a critical alert on screen that the saved override reason does
  //           not name — a legacy row, or one saved before the alert existed;
  //  • 2026-09-18 (review, finding 1) the calculation changed after the save.
  const dosingWeightChanged = !!savedDosingWt && wtG > 0 && (savedDosingWt.exact
    ? Math.abs(savedDosingWt.g - wtG) > 0.01
    // Recovered from GIR / EN mL/kg: allow 0.5 % (min 1 g) so a legacy row is
    // only held back when its own record shows the weight moved.
    : Math.abs(savedDosingWt.g - wtG) > Math.max(1, wtG * 0.005));
  // A saved order prints what the calculator computes NOW from its inputs, so
  // a release that moves a printed figure would reprint an old order with new
  // numbers under its old entry id and revision — UP-C2's rule again. A row
  // knows the CONSTANTS_VERSION it was computed with (savedCalcVersionOf);
  // any other version holds Print until the order is saved again. Rows saved
  // before 2026-09-18 know none, so for them only that release's own changes
  // are checked: an overfilled bag with Soluvit or Peditrace (their mL are now
  // × Factor) and a MEN feed (no longer in the printed totals). A day with no
  // TPN is not held: the only figures that moved there are vitamin mL for a
  // bag that does not exist, now "—". A later release that moves a printed
  // figure bumps CONSTANTS_VERSION and so holds every row dated before it.
  const calcMoved = !!savedEntryId && (savedCalcVersion
    ? savedCalcVersion !== D.CONSTANTS_VERSION
    : (calc.overfill > 1.001 && (inclSoluvit || inclPeditrace))
      || (isMEN && calc.enVolTotal > 0));
  const uncoveredCritical = alerts.filter(a => a.level === "crit")
    .map(a => a.title).filter(t => !(critOverride?.alerts || []).includes(t));
  const printable = !!savedEntryId && !dirty && !pendingSave && !zeroVolumeBag
    && !dosingWeightChanged && !calcMoved && uncoveredCritical.length === 0;
  const zeroVolumeText = `ปริมาตร TPN = 0 แต่ยังมีส่วนประกอบในถุง: ${bagIngredientsWithoutVolume.join(", ")} — ลบส่วนประกอบ หรือใส่ปริมาตร`;
  // Why not, most actionable first. `before` is the verb phrase ("ก่อนพิมพ์").
  const printBlockMessage = (before) =>
    pendingSave ? `รายการนี้ยังบันทึกไม่เสร็จ (กำลังบันทึก…) — รอสักครู่แล้วเปิดใหม่${before}`
    : zeroVolumeBag ? `${zeroVolumeText} แล้วบันทึก${before}`
    : dirty ? `มีการแก้ไขที่ยังไม่ได้บันทึก — กดบันทึก${before}`
    : dosingWeightChanged ? `น้ำหนักที่ใช้คำนวณเปลี่ยนไปหลังบันทึก (birth weight แก้ไข) — ตรวจสอบและบันทึกใหม่${before}`
    : calcMoved ? `NeoFeed ปรับการคำนวณหลังคำสั่งนี้ถูกบันทึก — ตัวเลขบางรายการเปลี่ยน ตรวจสอบและบันทึกใหม่${before}`
    : uncoveredCritical.length > 0 ? `มีค่าวิกฤตที่ยังไม่ได้ระบุเหตุผล — บันทึกพร้อมเหตุผล${before}`
    : "";
  const printBlockToast = printable ? "" : printBlockMessage("ก่อนพิมพ์");

  // ── Print handler — opens all steps, prints, then restores ─────
  React.useEffect(() => {
    const ALL = new Set([1, 2, 3, 4, 5, 6]);
    const handler = () => {
      if (centerPoint) { centerPoint.review(); return; }
      // Quick calc prints nothing: a pharmacy order form with no patient on it
      // is exactly the artifact that could be carried to a bedside as if it
      // were one. `printable` is already false here (it needs a savedEntryId,
      // which the quick calc never has), so PrintOrderForm never renders —
      // this only keeps the toast honest about why.
      if (scratch) {
        showToast("Calculator นี้ไม่ได้ผูกกับผู้ป่วย จึงพิมพ์ใบสั่ง TPN ไม่ได้ — เปิดจากผู้ป่วยเพื่อบันทึกและพิมพ์", "error");
        return;
      }
      if (!savedEntryId) {
        showToast("กรุณาบันทึกคำสั่งให้สำเร็จก่อนพิมพ์", "error");
        return;
      }
      // Saved, but edited since (or held back — see printable): printing now
      // would put numbers nobody saved under the saved row's entry id.
      if (!printable) {
        showToast(printBlockToast || "มีการแก้ไขที่ยังไม่ได้บันทึก — กดบันทึกก่อนพิมพ์", "error");
        return;
      }
      setOpenSteps(ALL);
      // Wait one frame for React to render all card-b sections
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.print();
        window.onafterprint = () => setOpenSteps(new Set([1]));
      }));
    };
    document.addEventListener('__neofeed_print', handler);
    return () => document.removeEventListener('__neofeed_print', handler);
  }, [savedEntryId, printable, printBlockToast]);

  // TwoCol is defined at module level (below) — do NOT define inside Calculator
  // (inline component definitions cause React to unmount/remount on every render → focus lost)

  // ── Save (draft or submit) — creates a new row the first time, then updates
  // that same row for every further save in this visit. calcInput carries the
  // exact raw inputs so this entry stays editable on any device later.
  const handleSave = async () => {
    if (saving) return;
    // The quick calc renders no Save button; this is the belt to that braces.
    // It is the only path in this file that reaches Google Sheets, and
    // "ข้อมูลในนี้จะไม่เซฟลงกูเกิลชีท" is the whole premise of the mode.
    if (scratch) return;
    // ── Required-field gate (2026-09-15) ──────────────────────────────
    // Blocks the save outright rather than warning: an order row whose fluid
    // plan or urine output was never entered is not a partial record, it is a
    // record that reads as 0 to every trend, target band and alert downstream.
    // Step 1 is force-opened because the user may have collapsed it, and a
    // toast naming a field they cannot see is a dead end.
    if (missingFields.length > 0) {
      setOpenSteps(prev => new Set(prev).add(1));
      showToast(`ยังกรอกไม่ครบ — ต้องกรอก: ${missingFields.map(f => f.label).join(", ")}`, "error");
      return;
    }
    // A row still under its optimistic tmp_ id does not exist on the server
    // yet — an update would target an id no row has (UP-C9).
    if (pendingSave) {
      showToast("รายการนี้ยังบันทึกไม่เสร็จ (กำลังบันทึก…) — รอสักครู่แล้วเปิดใหม่", "error");
      return;
    }
    // ── Ingredients with no bag volume (review 2026-09-17, UP-C3) ─────
    // Not a clinical threshold and not overridable: with TPN volume 0 the
    // amino acid, dextrose and salts still count as delivered in every
    // total, while the printed form asks pharmacy for a bag of "—" mL. It
    // happens when TPN is stopped on a form prefilled from yesterday.
    if (zeroVolumeBag) {
      setOpenSteps(prev => new Set(prev).add(2).add(3));
      showToast(zeroVolumeText, "error");
      return;
    }
    // ── Critical-alert hard stop (2026-09-11 review, F1) ──────────────
    // A critical value can still be ordered — the attending may have a
    // reason — but never silently: the reason is required, saved with the
    // order (calcInput.critOverride) and printed on the pharmacy form.
    const critical = sortClinicalAlerts(alerts).filter(a => a.level === "crit");
    let override = null;
    if (critical.length > 0) {
      // The reason prints on the pharmacy form (and, on Center Point, goes
      // into an order packet that deliberately carries no identity), so both
      // prompts say to keep names and HNs out of it (SEC-F7). It asks
      // "ยืนยันการสั่งหรือไม่?" in the TPN team's words (2026-09-22); a reason is
      // still what confirms, so the stop cannot be cleared with one tap.
      const reason = window.prompt(
        `มีค่าวิกฤต ${critical.length} รายการ:\n• ${critical.map(a => a.title).join("\n• ")}\n\n` +
        `ยืนยันการสั่งหรือไม่? — แพทย์ยืนยันคำสั่งโดยระบุเหตุผลทางคลินิก (จะพิมพ์ลงใบสั่ง TPN · ห้ามใส่ชื่อหรือ HN):`, "");
      if (reason == null || !String(reason).trim()) {
        showToast("ยังไม่ได้บันทึก — มีค่าวิกฤต ต้องระบุเหตุผลก่อน", "error");
        return;
      }
      override = { reason: String(reason).trim().slice(0, 300), alerts: critical.map(a => a.title), at: new Date().toISOString() };
    }
    const keyAtSave = formKey;
    const dosingWtAtSave = wtG;   // what every dose on this save was computed from (UP-C2)
    // Center Point saves pass the same required-field gate and F1 stop above.
    // The F1 override goes with the order: CP's snapshot carries it to CP's
    // review and print, as the prompt promises (PR #57 review, finding 3).
    if (centerPoint) {
      setSaving(true);
      try {
        const result=await centerPoint.save({dol,wtG,wtKg,curWtG,usingBirthWeight,route,orderDate:logDate,
          dexPct,totalTPN_mL,aaPerKg,lipidPerKg,lipidDripHours,naCl,naAcet,glycophosP,kCl,k2hpo4,mgPerKg,mgStrength,caPerKg,
          inclSoluvit,inclPeditrace,inclAddamel,heparinUmL,calc,suppVitD,suppCa,suppCaType,suppPO4,suppPO4Type,suppMTV,suppFerdek,suppFeType,mineral,enType,enVol,enFreq,
          critOverride:override});
        setSavedEntryId(result.sourceRecordId);setSavedLastModified(result.recordedAt);
        // What CP now holds is what was on the form when Save was pressed.
        setSavedKey(keyAtSave);setCritOverride(override);setSavedDosingWt({ g: dosingWtAtSave, exact: true });setSavedCalcVersion(D.CONSTANTS_VERSION);
      } catch (error) { centerPoint.failed?.(error);showToast('บันทึกไป Center Point ไม่สำเร็จ กรุณาตรวจสถานะและลองใหม่','error'); }
      finally { setSaving(false); }
      return;
    }
    try { localStorage.setItem(`neofeed_calc_${patient.sessionId}`, JSON.stringify(captureState())); } catch {}
    const _suppPayload = {
      suppMTV:       suppMTV ? 1 : 0,
      suppVitD_IU:   suppVitD > 0 && wtKg > 0 ? Math.round(suppVitD * wtKg) : 0,
      suppCa_mg:     suppCa   > 0 && wtKg > 0 ? Math.round(suppCa   * wtKg) : 0,
      suppCaType:    suppCa   > 0 ? suppCaType   : "",
      suppPO4_mmol:  suppPO4  > 0 && wtKg > 0 ? parseFloat((suppPO4  * wtKg / 31).toFixed(2)) : 0,
      suppPO4Type:   suppPO4  > 0 ? suppPO4Type  : "",
      suppFe_mg:     suppFerdek > 0 && wtKg > 0 ? parseFloat((suppFerdek * wtKg).toFixed(1)) : 0,
      suppFeType:    suppFerdek > 0 ? suppFeType  : "",
    };
    const entry = {
      dol, weight: curWtG, fluid: calc.totalFluidPerKg, gir: calc.gir,
      pro: calc.proteinKg, kcal: calc.kcalKg, na: calc.naTotalDelivered, k: calc.kTotalDelivered,
      ca: calc.caKg, p: calc.pKg, enVolPerKg: calc.enVolPerKg,
      // Intake/Output card — raw mL/day, entered directly. Per-kg/rate figures
      // (e.g. urine mL/kg/h) are re-derived on display from these plus
      // D.ioDivisorG, never stored, so they stay correct if weights are
      // edited later.
      ioInput, ioOutput, drainContent,
      // Route reflects what was actually delivered, not just the IV-access toggle —
      // a fully-weaned-to-EN day (totalTPN_mL === 0) must not be logged as "TPN ...".
      route: calc.totalTPN_mL > 0
        ? (route === "central" ? "TPN central" : "TPN peripheral")
        : (calc.enVolPerKg > 0 ? "Enteral only" : "NPO"),
      status: "submitted", ..._suppPayload,
      // tpnWtG: the resolved dosing weight these numbers were computed with,
      // so a reopened row can tell when a birth-weight edit has re-dosed it
      // (UP-C2). Derived, not an input — normalizeCalcInput ignores it.
      // constantsVersion: the calculation these numbers came from, so a later
      // release that moves a printed figure holds this row's reprint (calcMoved).
      // savedByLabel: the saver's "Name (email)", so the form can name whom
      // to call (savedByOf). Not an input — normalizeCalcInput ignores it.
      calcInput: { ...captureState(), tpnWtG: dosingWtAtSave, constantsVersion: D.CONSTANTS_VERSION,
        ...(userLabel ? { savedByLabel: userLabel } : {}),
        ...(override ? { critOverride: override } : {}) },
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
      ts: editEntry ? editEntry.ts : (logDate || newOrderDate),
    };

    setSaving(true);
    const res = savedEntryId
      ? await onUpdate(savedEntryId, savedLastModified, entry)
      : await onLog(entry);
    setSaving(false);

    // Make sure the typed order is on disk as this user's draft before showing
    // the conflict (UP-C10): the way forward is "โหลดข้อมูลล่าสุด", a full
    // reload, and the draft — still based on the stamp that conflicted — is
    // what brings the typed values back onto the newer row. Only when there
    // is something unsaved to bring back.
    if (res.conflict) { if (dirty) writeDraft(currentInputs()); setConflict(res.current); return; }
    if (!res.ok) return; // gasPost already surfaced an error toast

    if (res.revised) {
      // Editing a published row never overwrote it — the server appended a
      // new revision instead (gas-backend.gs updateDailyNutrition). This is
      // now a fresh draft under a new id, exactly like a brand-new entry.
      setSavedEntryId(res.entryId);
      setPublished(false);
    } else {
      if (!savedEntryId) setSavedEntryId(res.entryId);
    }
    setSavedLastModified(res.lastModified);
    // What was just saved is what may now be printed — the inputs as they
    // were when Save was pressed, not whatever was typed while it ran.
    setSavedKey(keyAtSave);
    setCritOverride(override);
    setSavedDosingWt({ g: dosingWtAtSave, exact: true });
    setSavedCalcVersion(D.CONSTANTS_VERSION);
    setSavedMeta({
      by: userLabel || "",
      at: res.lastModified || new Date().toISOString(),
      revision: res.revisionNumber || savedMeta?.revision || 1,
    });
    clearDraft();
    setDraftOffer(null);

    // With the publish gate on, Save deliberately stays on this screen so
    // Submit and Print are reachable without reopening the entry. With the
    // gate off — today's behaviour, unchanged — Save still navigates away
    // immediately, same as before this existed.
    if (!D.ENABLE_PUBLISH_GATE) onSaved && onSaved();
  };

  // ── Submit — locks the saved row against further in-place edits (see the
  // publish-lock design). Only reachable once a row exists to publish.
  const handlePublish = async () => {
    if (!savedEntryId || published || publishing) return;
    // Submit signs specific numbers — they must be the saved ones, held back
    // by nothing that also holds back printing (see printable).
    if (!printable) { showToast(printBlockMessage("ก่อนส่ง"), "error"); return; }
    setPublishing(true);
    // savedLastModified makes Submit optimistic-locked (gas-backend.gs
    // publishDailyLog): if someone else saved this row since, it's refused.
    const res = await onPublish(savedEntryId, savedLastModified);
    setPublishing(false);
    if (res.conflict) { setConflict(res.current); return; }
    if (!res.ok) return; // gasPost already surfaced an error toast
    setPublished(true);
    onSaved && onSaved();
  };

  // ── Delete this entry — only once it actually exists on the server
  // (savedEntryId), only when the caller granted permission (onDelete, gated
  // to admin same as the Dashboard's trash icon). Native confirm() so the
  // action can't fire on a stray click — matches the confirmation already
  // used for the Dashboard's per-row delete.
  const handleDelete = () => {
    if (!savedEntryId || pendingSave || !onDelete) return;
    const ts = editEntry?.ts || logDate;
    const label = `DOL ${dol}${ts ? ` (${window.NEOFEED_FMT_DATE?.(ts) || ts})` : ""}`;
    if (!window.confirm(`ลบบันทึก ${label} ใช่หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้`)) return;
    onDelete({ entryId: savedEntryId, dol, ts });
  };

  return (
    <>
      {/* Conflict notice — someone else saved this entry after this page opened.
          The form is left untouched: only navigation/reload discards it, never this banner. */}
      {conflict && (
        <div style={{ padding:"10px 12px", background:"var(--crit-bg)", border:"1px solid var(--crit-line)",
             borderRadius:8, marginBottom:10, fontSize:12.5, color:"var(--crit)",
             display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <Icon name="info" size={13} color="var(--crit)" />
          <span>
            รายการนี้ถูกแก้ไขจาก{conflict.lastModifiedBy ? ` ${conflict.lastModifiedBy}` : "เครื่องอื่น"} หลังจากหน้านี้เปิดขึ้นมา —
            ข้อมูลที่คุณกรอกยังอยู่ครบ กด "โหลดข้อมูลล่าสุด" เพื่อดูของใหม่ก่อนบันทึกทับ
            (ข้อมูลที่กรอกเก็บเป็นร่างไว้ — กู้คืนได้หลังโหลด)
          </span>
          <div style={{ display:"flex", gap:6, marginLeft:"auto" }}>
            <button className="btn sm" onClick={() => setConflict(null)}>แก้ไขต่อ</button>
            <button className="btn sm primary" onClick={() => window.location.reload()}>โหลดข้อมูลล่าสุด</button>
          </div>
        </div>
      )}

      {/* Unsaved draft from an earlier visit (e.g. the session expired mid-save,
          or a save conflict was reloaded). Only ever this user's own draft. */}
      {draftOffer && (
        <div style={{ padding:"10px 12px", background:"var(--warn-bg)", border:"1px solid var(--warn-line)",
             borderRadius:8, marginBottom:10, fontSize:12.5, color:"var(--warn)",
             display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <Icon name="info" size={13} color="var(--warn)" />
          <span>
            มีข้อมูลที่กรอกค้างไว้แต่ยังไม่ได้บันทึก
            {draftOffer.savedAt ? ` (เมื่อ ${new Date(draftOffer.savedAt).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${draftOffer.by ? ` · โดย ${draftOffer.by}` : ""})` : ""}
            {draftIsStale && <strong> · ร่างนี้เก่ากว่าฉบับที่บันทึกล่าสุด — กู้คืนแล้วตรวจกับฉบับล่าสุดก่อนบันทึก</strong>}
            {" "}— กู้คืนเพื่อบันทึกต่อ หรือทิ้งไป
          </span>
          <div style={{ display:"flex", gap:6, marginLeft:"auto" }}>
            <button className="btn sm" onClick={() => { clearDraft(); setDraftOffer(null); }}>ทิ้ง</button>
            <button className="btn sm primary" onClick={restoreDraft}>กู้คืน</button>
          </div>
        </div>
      )}

      {editEntry && !conflict && (
        <div style={{ padding:"8px 12px", background:"var(--brand-bg)", border:"1px solid var(--brand-line)",
             borderRadius:8, marginBottom:10, fontSize:12, color:"var(--brand-2)",
             display:"flex", alignItems:"center", gap:8 }}>
          <Icon name="info" size={13} color="var(--brand-2)" />
          <span>กำลังแก้ไขบันทึก DOL <strong>{editEntry.dol}</strong> ({window.NEOFEED_FMT_DATE?.(editEntry.ts) || editEntry.ts}) — บันทึกเพื่ออัปเดตรายการเดิม ไม่สร้างรายการใหม่</span>
        </div>
      )}

      {/* A new order left open across midnight stays the order for the day it
          was opened on (UP-C11) — say so, since the rest of the app has moved on. */}
      {orderDayRolledOver && !conflict && (
        <div role="status" style={{ padding:"8px 12px", background:"var(--warn-bg)", border:"1px solid var(--warn-line)",
             borderRadius:8, marginBottom:10, fontSize:12.5, color:"var(--warn)",
             display:"flex", alignItems:"center", gap:8 }}>
          <Icon name="info" size={13} color="var(--warn)" />
          <span>คำสั่งนี้เป็นของวันที่ <strong>{window.NEOFEED_FMT_DATE?.(newOrderDate) || newOrderDate}</strong> (DOL <strong>{dol}</strong>) — เปิดไว้ตั้งแต่ก่อนเที่ยงคืน และจะบันทึกเป็นของวันนั้น</span>
        </div>
      )}

      {!editEntry && logDate && !conflict && (
        <div style={{ padding:"8px 12px", background:"var(--brand-bg)", border:"1px solid var(--brand-line)",
             borderRadius:8, marginBottom:10, fontSize:12, color:"var(--brand-2)",
             display:"flex", alignItems:"center", gap:8 }}>
          <Icon name="info" size={13} color="var(--brand-2)" />
          <span>กำลังบันทึกย้อนหลังสำหรับวันที่ <strong>{window.NEOFEED_FMT_DATE?.(logDate) || logDate}</strong> (DOL <strong>{dol}</strong>)</span>
        </div>
      )}

      {/* Prefill notice — appears on patient switch if restored from previous submission */}
      {!editEntry && prefilledFrom && (
        <div style={{ padding:"8px 12px", background:"var(--brand-bg)", border:"1px solid var(--brand-line)",
             borderRadius:8, marginBottom:10, fontSize:12, color:"var(--brand-2)",
             display:"flex", alignItems:"center", gap:8 }}>
          <Icon name="info" size={13} color="var(--brand-2)" />
          <span>{prefilledFrom.baseline
            ? <>ดึงข้อมูลจากบันทึกล่าสุด (DOL <strong>{prefilledFrom.dol}</strong>) มาเป็นค่าตั้งต้น — ตรวจสอบและปรับก่อนบันทึก</>
            : <>Prefilled from previous submission (DOL <strong>{prefilledFrom.dol}</strong>) — review and adjust before submitting today.</>}</span>
          <button className="btn sm" style={{ marginLeft:"auto", padding:"3px 10px" }}
            onClick={() => setPrefilledFrom(null)}>Dismiss</button>
        </div>
      )}

      {/* ── Accordion controls ─────────────────────────────────── */}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:6, marginBottom:8 }}>
        <button className="btn sm" onClick={() => setOpenSteps(new Set([1,2,3,4,5,6]))}>Open all</button>
        <button className="btn sm" onClick={() => setOpenSteps(new Set())}>Close all</button>
      </div>

      {/* ===== Step 1 — Fluid plan ===== */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h clickable" onClick={() => toggleStep(1)}>
          <Icon name="drop" size={14} color="var(--brand)" />
          Step 1 · Fluid plan
          {!openSteps.has(1) && (
            <div className="step-summary">
              <span className="step-summary-chip">{fluidTargetPerKg} mL/kg/d</span>
              <span className="step-summary-chip">{fmt(fluidTargetPerKg * wtKg, 0)} mL/day</span>
              {Math.abs(calc.remaining) > 5 && <span className="step-summary-chip" style={{ color:"var(--warn)" }}>{fmt(Math.abs(calc.remaining),0)} mL {calc.remaining < 0 ? "over":"left"}</span>}
            </div>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
            <div className={`step-dot ${stepStatus[1]}`} />
            <span style={{ fontSize:13, color:"var(--ink-3)" }}>{openSteps.has(1) ? "▲" : "▼"}</span>
          </div>
        </div>
        <div className={`accordion-body${openSteps.has(1) ? ' open' : ''}`}><div className="card-b">
          <div className="s1-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr) 1.4fr", gap: 12, alignItems: "stretch" }}>
            <div>
              <NumField label="Target fluid" unit="mL/kg/d" value={fluidTargetPerKg} onChange={setFluidTargetPerKg} step={5}
                key={`${formIdentity}·fluidTargetPerKg`} name="fluidTargetPerKg" required seedZero={seedsZero("fluidTargetPerKg")} onBlankChange={reportBlank}
                hint={`= ${fmt(fluidTargetPerKg * wtKg, 0)} mL/d · attending discretion`} />
              <PresetChips values={[60, 80, 100, 120, 150]} current={fluidTargetPerKg} onSelect={setFluidTargetPerKg} />
            </div>
            <NumField label="Other IV" unit="mL/d" value={otherIV_mL} onChange={setOtherIV_mL} step={1}
              key={`${formIdentity}·otherIV_mL`} name="otherIV_mL" required seedZero={seedsZero("otherIV_mL")} onBlankChange={reportBlank}
              hint={`= ${fmt(otherIV_mL / wtKg, 1)} mL/kg/d`} />
            <NumField label="Drug volume" unit="mL/d" value={drug_mL} onChange={setDrug_mL} step={1}
              key={`${formIdentity}·drug_mL`} name="drug_mL" required seedZero={seedsZero("drug_mL")} onBlankChange={reportBlank}
              hint={`= ${fmt(drug_mL / wtKg, 1)} mL/kg/d`} />
            <NumField label="Current weight" unit="g" value={curWtG} onChange={setCurWtG} step={5}
              key={`${formIdentity}·curWtG`} name="curWtG" required seedZero={seedsZero("curWtG")} onBlankChange={reportBlank} />
            {/* Editable since 2026-09-15 — prefilled by the birth-weight-floor
                rule exactly as before, but the attending can overrule it.
                Typing the automatic figure back in clears the override, so
                the field resumes tracking the weight instead of freezing at
                a number that merely matched it once. */}
            <NumField label="TPN calc. weight" unit="g" value={wtG} step={5}
              key={`${formIdentity}·tpnWtG`} name="tpnWtG" required seedZero={seedsZero("tpnWtG")} onBlankChange={reportBlank}
              onChange={(v) => setTpnWtOverrideG(v === autoWtG ? 0 : v)}
              hint={tpnWtManual
                ? `⚠ แก้เอง · อัตโนมัติ = ${fmt(autoWtG, 0)} g`
                : usingBirthWeight ? "= birth weight (not yet regained)" : curWtG > 0 ? "= current weight" : "—"} />
            <div style={{ padding: "10px 14px", borderRadius: 8,
              background: Math.abs(calc.remaining) < 1 ? "var(--ok-bg)" : calc.remaining < -10 ? "var(--crit-bg)" : "var(--brand-bg)",
              border: `1px solid ${Math.abs(calc.remaining) < 1 ? "var(--ok-line)" : calc.remaining < -10 ? "var(--crit)" : "var(--brand-line)"}`,
              display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.05 }}>
                {calc.remaining < -1 ? "Over target" : "Remaining"}
              </div>
              <div className="num" style={{ fontSize: 26, fontWeight: 500,
                color: Math.abs(calc.remaining) < 1 ? "var(--ok)" : calc.remaining < -10 ? "var(--crit)" : "var(--brand-2)",
                letterSpacing: "-0.02em" }}>
                {calc.remaining >= 0 ? "" : "+"}{fmt(Math.abs(calc.remaining), 1)}<span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 4 }}>mL/d {calc.remaining < 0 ? "over" : "left"}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Plan <span className="num">{fmt(fluidTargetPerKg * wtKg, 0)}</span> · Prescribed <span className="num">{fmt(calc.prescribedFluid, 0)}</span> mL/d
              </div>
            </div>
          </div>
          {tpnWtManual && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--warn)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>
                TPN calc. weight ถูกแก้เป็น <span className="num" style={{ fontWeight: 600 }}>{fmt(wtG, 0)}</span> g —
                ทุก dose/target ด้านล่างคิดจากค่านี้ (อัตโนมัติ = {fmt(autoWtG, 0)} g)
              </span>
              <button className="btn" style={{ fontSize: 11.5, padding: "3px 10px" }}
                onClick={() => setTpnWtOverrideG(0)}>ใช้ค่าอัตโนมัติ</button>
            </div>
          )}
        </div></div>
      </div>

      {/* ===== Intake / Output (volume card) ─────────────────────
          Per-kg divides by yesterday's weight, or birth weight while the
          infant hasn't yet regained it — falling forward to today's entered
          weight once that alone clears birth weight (D.ioDivisorG). Urine output is entered
          and stored as raw mL/day, same as Input/Drain — the mL/kg/h rate
          (ioOutputPerKgH above) is shown as a derived hint only. Balance =
          Input − Output − Drain. Not on the Center Point entry, which
          records none of these (see REQUIRED_FIELDS) — nor does the quick calc,
          which has no patient to measure and no row to record them on. */}
      {!centerPoint && !scratch && <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h">
          <Icon name="drop" size={14} color="var(--brand)" />
          Intake / Output
        </div>
        <div className="card-b">
          <div className="s1-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, alignItems: "stretch" }}>
            <NumField label="Input" unit="mL/d" value={ioInput} step={1}
              key={`${formIdentity}·ioInput`} name="ioInput" required seedZero={seedsZero("ioInput")} onBlankChange={reportBlank}
              onChange={(v) => { markIoInputTouched(true); setIoInput(v); }}
              hint={`(${fmt(ioInputPerKg, 1)} mL/kg/d)`} />
            <NumField label="Urine output" unit="mL/d" value={ioOutput} step={1}
              key={`${formIdentity}·ioOutput`} name="ioOutput" required seedZero={seedsZero("ioOutput")} onBlankChange={reportBlank}
              onChange={setIoOutput}
              hint={`(${fmt(ioOutputPerKgH, 2)} mL/kg/h)`} />
            <NumField label="Drain content" unit="mL/d" value={drainContent} onChange={setDrainContent} step={1}
              key={`${formIdentity}·drainContent`} name="drainContent" required seedZero={seedsZero("drainContent")} onBlankChange={reportBlank}
              hint={`(${fmt(ioDrainPerKg, 1)} mL/kg/d)`} />
          </div>
          {(ioInput > 0 || ioOutput > 0 || drainContent > 0) && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--ink-3)" }}>
              Balance <span className="num" style={{ fontWeight: 600, color: "var(--ink-2)" }}>{ioBalance >= 0 ? "+" : ""}{fmt(ioBalance, 0)}</span> mL/d
              {ioDivisorGVal != null && <> · divisor <span className="num">{fmt(ioDivisorGVal, 0)}</span> g{ioDivisor.source === "birth" ? " (birth weight)" : ioDivisor.source === "today" ? " (today)" : " (previous day)"}</>}
            </div>
          )}
        </div>
      </div>}

      {/* ===== Step 2 — Enteral feeding ===== */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h clickable" onClick={() => toggleStep(5)}>
          <Icon name="milk" size={14} color="var(--brand)" />
          Step 2 · Enteral feeding
          {!openSteps.has(5) && calc.enVolPerKg > 0 && (
            <div className="step-summary">
              <span className="step-summary-chip">{calc.enVolPerKg.toFixed(0)} mL/kg/d</span>
              {calc.enVolPerKg > 0 && <span className="step-summary-chip">{D.EN_DB[enType]?.label?.split(" — ")[0]}</span>}
              {D.EN_DB[enType]?.lf && <span className="step-summary-chip" style={{ color:"var(--ok)" }}>LF ✅</span>}
              {calc.useEnteralTargets && <span className="step-summary-chip" style={{ color:"var(--ok)" }}>Full EN ✅</span>}
            </div>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
            <div className={`step-dot ${stepStatus[5]}`} />
            <span style={{ fontSize:13, color:"var(--ink-3)" }}>{openSteps.has(5) ? "▲" : "▼"}</span>
          </div>
        </div>
        <div className={`accordion-body${openSteps.has(5) ? ' open' : ''}`}><div className="card-b">
          <TwoCol>
            <div>
              <div className="field">
                <label>Feed type</label>
                <select className="sel" value={enType} onChange={(e) => setEnType(e.target.value)}>
                  <optgroup label="🤱 Breast Milk">
                    {["BM_20","BM_HMF_24"].filter(k => D.EN_DB[k]).map(k =>
                      <option key={k} value={k}>{D.EN_DB[k].label}</option>)}
                  </optgroup>
                  <optgroup label="⚡ Preterm / High-energy formula">
                    {["BM_PF_20","FBM_PF_22","PRENAN_22","FBM_PF_24","FBM_INF_MIX","INFATRINI_30"].filter(k => D.EN_DB[k]).map(k =>
                      <option key={k} value={k}>{D.EN_DB[k].label}</option>)}
                  </optgroup>
                  <optgroup label="🥛 Lactose-free">
                    {["LF_20","LF_24","LF_27"].filter(k => D.EN_DB[k]).map(k =>
                      <option key={k} value={k}>{D.EN_DB[k].label}</option>)}
                  </optgroup>
                </select>
              </div>
              <div className="en-fields-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                <NumField label="Volume" unit="mL/feed" value={enVol} onChange={setEnVol} step={0.5} />
                <NumField label="Frequency" unit="feeds/d" value={enFreq} onChange={setEnFreq} step={1}
                  hint={`q${Math.round(24 / Math.max(enFreq, 1))}h`} />
                <div className="field en-men-col">
                  <label style={{ visibility: "hidden" }}>MEN</label>
                  <Chk label="MEN (trophic)" value={isMEN} onChange={setIsMEN}
                    hint="Not counted in fluid or nutrient totals" />
                </div>
              </div>

              {/* Full feeds status — says the enteral targets are active, so it
                  shows exactly when they are (never for a MEN feed) */}
              {calc.useEnteralTargets && (
                <div style={{ padding: "8px 10px", background: "var(--ok-bg)", border: "1px solid var(--ok-line)",
                  borderRadius: 6, fontSize: 11.5, color: "var(--ok)", marginTop: 8, fontWeight: 600 }}>
                  ✅ Full EN ≥100 mL/kg/d — wean PN · ESPGHAN 2022 EN targets active
                </div>
              )}

              {/* What the feed provides per kg — shown for a MEN feed too, greyed
                  and marked, because it is real but counts toward no total. */}
              <div className="en-delivered" style={{ marginTop: 10, padding: 10, background: "var(--bg-2)", borderRadius: 6 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.05 }}>Delivered per kg from EN</span>
                  {isMEN && calc.enVolTotal > 0 && (
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--brand-2)" }}>MEN — not counted in totals</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: "var(--ink-2)", flexWrap: "nowrap", overflowX: "auto" }}>
                  {[["kcal", calc.enFeedKg.kcal, 0], ["pro", calc.enFeedKg.pro, 1], ["Na", calc.enFeedKg.na, 1],
                    ["K", calc.enFeedKg.k, 1], ["Ca", calc.enFeedKg.ca, 0], ["P", calc.enFeedKg.p, 0]].map(([lab, v, d]) => (
                    <span key={lab} style={{ whiteSpace: "nowrap" }}>{lab} <span className="num" style={{ fontWeight: 600, color: isMEN ? "var(--ink-3)" : "var(--ink)" }}>{fmt(v, d)}</span></span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Tile label="EN volume" value={calc.enVolPerKg} unit=" mL/kg/d" target={[100, 200]} status={calc.enVolPerKg >= 100 ? "ok" : calc.enVolPerKg > 0 ? "warn" : "ok"} decimals={0} max={210} />
              {(() => {
                const avail   = fluidTargetPerKg * wtKg - totalTPN_mL - calc.lipidBagVol - otherIV_mL - drug_mL;
                const availKg = wtKg > 0 ? avail / wtKg : 0;
                const over    = avail < 0;
                return (
                  <div style={{ padding: "10px 12px",
                    background: over ? "var(--crit-bg)" : "var(--brand-bg)",
                    border: `1px solid ${over ? "var(--crit-line)" : "var(--brand-line)"}`,
                    borderRadius: 8, position: "relative", overflow: "hidden" }}>
                    <div style={{ position:"absolute", left:0, top:0, bottom:0, width:3,
                      background: over ? "var(--crit)" : "var(--brand)" }} />
                    <div style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                      Remaining fluid for EN
                    </div>
                    <div className="num" style={{ fontSize: 26, fontWeight: 500, lineHeight: 1.1,
                      color: over ? "var(--crit)" : "var(--brand-2)" }}>
                      {over ? "0" : fmt(avail, 0)}
                      <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 4, fontWeight: 400 }}>mL/day</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                      {over
                        ? <span style={{ color:"var(--crit)", fontWeight:600 }}>IV เกิน target {fmt(Math.abs(avail), 0)} mL</span>
                        : <span>= {fmt(availKg, 0)} mL/kg/d</span>
                      }
                    </div>
                  </div>
                );
              })()}
              {!isMEN && calc.enVolPerKg > 100 &&
              <Tile label="Protein : Energy" value={calc.peRatio} unit=" g/100kcal" target={tPE} status={sPE} decimals={1} max={5} />
              }
            </div>
          </TwoCol>
        </div></div>
      </div>

      {/* ===== Step 3 — TPN main bag ===== */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h clickable step2-card-h" onClick={() => toggleStep(2)}>
          <Icon name="drop" size={14} color="var(--brand)" />
          Step 3 · TPN macronutrients
          {/* Route + Osm always visible */}
          <span className="step2-ctrl" style={{ display:"flex", alignItems:"center", gap:8, marginLeft:10 }} onClick={e => e.stopPropagation()}>
            <div className="seg" style={{ padding:1 }}>
              <button className={route === "peripheral" ? "on" : ""} onClick={() => setRoute("peripheral")}>Peripheral</button>
              <button className={route === "central"    ? "on" : ""} onClick={() => setRoute("central")}>Central</button>
            </div>
            <span style={{ padding:"2px 10px", borderRadius:999, fontFamily:"IBM Plex Mono,monospace",
              fontSize:11, fontWeight:600,
              background: sOsm==="crit" ? "var(--crit-bg)" : sOsm==="warn" ? "var(--warn-bg)" : "var(--ok-bg)",
              color:       sOsm==="crit" ? "var(--crit)"   : sOsm==="warn" ? "var(--warn)"   : "var(--ok)" }}>
              Osm {calc.osm.toFixed(0)} mOsm/L{route==="peripheral" && calc.osm > 900 ? " ⚠️" : ""}
            </span>
          </span>
          {!openSteps.has(2) && totalTPN_mL > 0 && (
            <div className="step-summary">
              <span className="step-summary-chip">{fmt(totalTPN_mL,0)} mL/d</span>
              {calc.overfill > 1.001 && <span className="step-summary-chip">prep {fmt(calc.preparedVol,0)} mL · ×{fmt(calc.overfill,2)}</span>}
              <span className="step-summary-chip">{fmt(totalTPN_mL/24,2)} mL/hr</span>
              {calc.gir > 0 && <span className="step-summary-chip">GIR {fmt(calc.gir,1)}</span>}
              {aaPerKg > 0 && <span className="step-summary-chip">AA {aaPerKg}</span>}
              {lipidPerKg > 0 && <span className="step-summary-chip">Lip {fmt(calc.lipidBagVol/lipidDripHours, 2)} mL/hr</span>}
            </div>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
            <div className={`step-dot ${stepStatus[2]}`} />
            <span style={{ fontSize:13, color:"var(--ink-3)" }}>{openSteps.has(2) ? "▲" : "▼"}</span>
          </div>
        </div>

        <div className={`accordion-body${openSteps.has(2) ? ' open' : ''}`}><div className="card-b" style={{ display:"flex", flexDirection:"column", gap:12 }}>

          {/* ══ PUMP 1: TPN Aqueous ══════════════════════════════════════ */}
          <div style={{ border:"1.5px solid var(--brand-line)", borderRadius:8, overflow:"hidden" }}>
            <div style={{ background:"var(--brand-bg)", padding:"6px 12px", fontSize:11, fontWeight:700,
              color:"var(--brand-2)", display:"flex", alignItems:"center", gap:6 }}>
              💉 TPN Aqueous Pump
            </div>
            <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>

              {/* Volume ↔ Rate — always both visible. alignItems:"start" (not
                  "end") keeps the two inputs on the same row regardless of
                  hint length — Volume's hint is blank at 0 while Rate's
                  never is, so bottom-aligning let the shorter field's input
                  drift down out of line with the other. The arrow gets an
                  invisible label spacer so its own "row" lines up with the
                  real inputs too. */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 28px 1fr", gap:8, alignItems:"start" }}>
                <NumField label="Volume" unit="mL/day"
                  value={totalTPN_mL}
                  onChange={setTotalTPN_mL} step={1}
                  hint={totalTPN_mL > 0 ? `= ${(totalTPN_mL/wtKg).toFixed(0)} mL/kg/d` : ""} />
                <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"center" }}>
                  <div style={{ fontSize:12, visibility:"hidden" }}>&nbsp;</div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:44,
                    fontSize:18, color:"var(--mid)", lineHeight:1 }}>↔</div>
                </div>
                {/* r × 24 rounded to 2 dp: 4.1 × 24 is 98.39999999999999 in
                    floating point, and that string reached the Volume box, the
                    changes list and the printed form (UP-C13). */}
                <NumField label="Rate" unit="mL/hr"
                  value={parseFloat((totalTPN_mL/24).toFixed(2))}
                  onChange={(r) => setTotalTPN_mL(parseFloat((r * 24).toFixed(2)))} step={0.05}
                  hint={totalTPN_mL > 0 ? `= ${totalTPN_mL.toFixed(0)} mL/day` : "ใส่ rate pump"} />
              </div>

              {/* ── Overfill: dead space → prepared volume → Factor ──────────
                  The worksheet's C7 / G8 / G7 / H9. Dead space is the state
                  (it is a property of the giving set, not of today's volume),
                  so prepared volume follows automatically and can never fall
                  below delivered.                                            */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, alignItems:"start" }}>
                <div>
                  <NumField label="ปริมาตรคาสาย (dead space)" unit="mL/day"
                    value={deadVol_mL} onChange={setDeadVol_mL} step={1}
                    hint={`${deadVol_mL > 0 ? "stays in the line" : "0 = no overfill"}${D.defaultDeadVolFor(patient) > 0 ? ` · NICU/SCN starts at ${D.defaultDeadVolFor(patient)}` : ""}`} />
                  <PresetChips values={[0, 10, 20, 30]} current={deadVol_mL} onSelect={setDeadVol_mL} />
                </div>
                <div style={{ padding:"8px 10px", background:"var(--bg-2)", borderRadius:6, fontSize:12 }}>
                  <div style={{ color:"var(--ink-3)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em" }}>Prepared (เตรียมจริง)</div>
                  <div className="num" style={{ fontWeight:700, fontSize:15, color:"var(--ink)" }}>
                    {fmt(calc.preparedVol,1)} mL/day
                  </div>
                  <div style={{ color:"var(--ink-3)", fontSize:10, marginTop:1 }}>
                    delivered {fmt(totalTPN_mL,1)} mL
                  </div>
                </div>
                <div style={{ padding:"8px 10px", borderRadius:6, fontSize:12,
                  background: calc.overfill > 1.001 ? "var(--brand-bg)" : "var(--bg-2)" }}>
                  <div style={{ color:"var(--ink-3)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em" }}>Factor</div>
                  <div className="num" style={{ fontWeight:700, fontSize:15,
                    color: calc.overfill > 1.001 ? "var(--brand-2)" : "var(--ink)" }}>
                    {fmt(calc.factor,3)}
                  </div>
                  <div style={{ color:"var(--ink-3)", fontSize:10, marginTop:1 }}>
                    {calc.overfill > 1.001
                      ? `= ${fmt(wtKg,3)} kg × ${fmt(calc.overfill,3)} overfill`
                      : "no overfill — doses use actual weight"}
                  </div>
                </div>
              </div>

              {/* Dextrose + GIR row */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, alignItems:"start" }}>
                <div>
                  <NumField label="Dextrose final" unit="%" value={dexPct} onChange={setDexPct} step={0.5}
                    hint={dexPct > 0
                      ? `${fmt(calc.dexG, 1)} g/d delivered · ${fmt(calc.dexGPerKg, 1)} g/kg/d (max ${D.MAX_DEXTROSE_G_KG})${calc.overfill > 1.001 ? ` · ${fmt(calc.dexG_bag, 1)} g in bag` : ""}`
                      : ""} />
                  <PresetChips values={[5, 7.5, 10, 12.5, 15]} current={dexPct} onSelect={setDexPct} suffix="%" />
                  {calc.d50wVol > 0 && (
                    <div style={{ marginTop:4, padding:"4px 8px", background:"var(--brand-bg)", borderRadius:4, fontSize:11 }}>
                      D50W: <span className="num" style={{ fontWeight:700, color:"var(--brand-2)" }}>{fmt(calc.d50wVol,1)} mL/d</span>
                      {route==="peripheral" && dexPct > 12.5 && <span style={{ color:"var(--crit)", fontWeight:700, marginLeft:6 }}>⚠️ Central only!</span>}
                    </div>
                  )}
                </div>
                {/* GIR readout inline */}
                <div style={{ background:`linear-gradient(180deg,${sGir==="crit"?"var(--crit-bg)":sGir==="warn"?"var(--warn-bg)":"var(--ok-bg)"},#fff 70%)`,
                  border:`1.5px solid ${sGir==="crit"?"var(--crit-line)":sGir==="warn"?"var(--warn-line)":"var(--ok-line)"}`,
                  borderRadius:8, padding:"8px 12px", position:"relative", overflow:"hidden" }}>
                  <div style={{ position:"absolute", left:0, top:0, bottom:0, width:3,
                    background:sGir==="crit"?"var(--crit)":sGir==="warn"?"var(--warn)":"var(--ok)" }} />
                  <div style={{ fontSize:10, color:"var(--ink-3)", fontWeight:600, letterSpacing:"0.04em" }}>GIR</div>
                  <div className="num" style={{ fontSize:26, fontWeight:500, lineHeight:1.1,
                    color:sGir==="crit"?"var(--crit)":sGir==="warn"?"var(--warn)":"var(--ok)" }}>
                    {fmt(calc.gir,1)}<span style={{ fontSize:11, color:"var(--ink-3)", marginLeft:4, fontWeight:400 }}>mg/kg/min</span>
                  </div>
                  <Meter value={calc.gir||0} target={tGir} status={sGir} max={16} optimal={[8,10]} />
                  <div style={{ fontSize:10, color:"var(--ink-3)", marginTop:2 }}>target 8–10 · max 12</div>
                </div>
              </div>

              {/* AA row */}
              <div className="s2-aa-row" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, alignItems:"center",
                padding:"8px 10px", background:"var(--bg-2)", borderRadius:6 }}>
                <div>
                  <NumField label={`Amino acid (${S[aaStockKey].short})`} unit="g/kg/d" value={aaPerKg} onChange={setAaPerKg} step={0.1} />
                  <PresetChips values={[1.5, 2, 2.5, 3, 3.5]} current={aaPerKg} onSelect={setAaPerKg} />
                  {/* Offered only where the ward allows more than one stock — on
                      no ward today (D.aaProductsFor; never on Center Point). */}
                  {aaChoices.length > 1 && (
                    <div className="aa-product" style={{ display:"flex", alignItems:"center", gap:6, marginTop:3, flexWrap:"wrap" }}>
                      <span style={{ fontSize:10.5, color:"var(--ink-3)" }}>Product</span>
                      <div className="seg" style={{ padding:1 }}>
                        {aaChoices.map(k => (
                          <button key={k} className={aaStockKey === k ? "on" : ""} onClick={() => setAaProduct(k)}>{S[k].short}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {S[aaStockKey].caution && (
                    <div style={{ fontSize:10.5, color:"var(--warn)", fontWeight:600, marginTop:2 }}>⚠ {S[aaStockKey].caution}</div>
                  )}
                </div>
                <div style={{ fontSize:12, color:"var(--ink-2)" }}>
                  <div style={{ color:"var(--ink-3)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em" }}>
                    {calc.overfill > 1.001 ? "In bag / delivered" : "Total"}
                  </div>
                  <div className="num" style={{ fontWeight:600, fontSize:15 }}>
                    {calc.overfill > 1.001
                      ? <>{fmt(calc.aaG_bag,1)}<span style={{ color:"var(--ink-3)", fontWeight:400 }}> / {fmt(calc.aaG,1)}</span> g/day</>
                      : <>{fmt(calc.aaG,1)} g/day</>}
                  </div>
                </div>
                <div style={{ fontSize:12, color:"var(--brand-2)", fontWeight:600 }}>
                  <div style={{ color:"var(--ink-3)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em" }}>Volume</div>
                  <div className="num" style={{ fontWeight:700, fontSize:15 }}>{fmt(calc.solVol.aa,1)} mL/day</div>
                </div>
              </div>

              {/* ── Bag make-up: components vs WFI q.s. ──────────────────────
                  Mirrors the KCMH worksheet's "Total volume (mL)" (J52) and
                  "WFI q.s." (I53). Updates live as Step 4 / Step 5 change.
                  Also shown for ingredients with no volume (UP-C3) — the
                  printed form shows this over-full bag, so the screen must. */}
              {(totalTPN_mL > 0 || zeroVolumeBag) && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8,
                  padding:"8px 10px", borderRadius:6,
                  background: calc.wfiVol < 0 ? "var(--crit-bg)" : "var(--bg-2)",
                  border: calc.wfiVol < 0 ? "1.5px solid var(--crit-line)" : "1px solid var(--line-2)" }}>
                  <div>
                    <div style={{ color:"var(--ink-3)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em" }}>Components</div>
                    <div className="num" style={{ fontWeight:600, fontSize:15 }}>{fmt(calc.componentVol,1)} mL</div>
                  </div>
                  <div>
                    <div style={{ color:"var(--ink-3)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em" }}>WFI q.s.</div>
                    <div className="num" style={{ fontWeight:700, fontSize:15,
                      color: calc.wfiVol < 0 ? "var(--crit)" : "var(--brand-2)" }}>
                      {fmt(calc.wfiVol,1)} mL
                    </div>
                  </div>
                  <div>
                    <div style={{ color:"var(--ink-3)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em" }}>Bag total (prepared)</div>
                    <div className="num" style={{ fontWeight:600, fontSize:15 }}>{fmt(calc.preparedVol,1)} mL</div>
                  </div>
                  {calc.wfiVol < 0 && (
                    <div style={{ gridColumn:"1 / -1", fontSize:11, color:"var(--crit)", fontWeight:600 }}>
                      ⚠️ Components exceed the bag by {fmt(Math.abs(calc.wfiVol),1)} mL — cannot be compounded.
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* ══ PUMP 2: Lipid (separate pump) ════════════════════════════ */}
          <div style={{ border:"1.5px solid var(--warn-line)", borderRadius:8, overflow:"hidden" }}>
            <div style={{ background:"var(--warn-bg)", padding:"6px 12px", fontSize:11, fontWeight:700,
              color:"var(--warn-ink)", display:"flex", alignItems:"center", gap:6 }}>
              🫙 Lipid Pump — separate pump
            </div>
            <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>

              {/* Rate — the pump-facing number, always front and center */}
              <div style={{ background:"linear-gradient(180deg,var(--warn-bg),#fff 70%)",
                border:"1.5px solid var(--warn-line)", borderRadius:8, padding:"10px 14px",
                position:"relative", overflow:"hidden",
                display:"flex", flexWrap:"wrap", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                <div style={{ position:"absolute", left:0, top:0, bottom:0, width:3, background:"var(--warn)" }} />
                <div>
                  <div style={{ fontSize:10, color:"var(--ink-3)", fontWeight:600, letterSpacing:"0.04em" }}>PUMP RATE</div>
                  <div className="num" style={{ fontSize:30, fontWeight:700, lineHeight:1.15, color:"var(--warn-ink)" }}>
                    {calc.lipidBagVol > 0 ? fmt(calc.lipidBagVol/lipidDripHours, 2) : "—"}
                    <span style={{ fontSize:13, color:"var(--ink-3)", marginLeft:5, fontWeight:400 }}>mL/hr</span>
                  </div>
                  <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:1 }}>
                    {fmt(calc.lipidBagVol,1)} mL/day over {lipidDripHours} h
                  </div>
                  {/* The same rate as lipid per kg per hour (TPN team,
                      2026-09-22). SMOF only: Vitalipid in the bag is not fat. */}
                  {lipidPerKg > 0 && (
                    <div className="lipid-gkgh" style={{ fontSize:12, fontWeight:600, color:"var(--warn-ink)", marginTop:2 }}>
                      = <span className="num">{fmt(lipidPerKg / lipidDripHours, 3)}</span> g/kg/h
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize:10, color:"var(--ink-3)", fontWeight:600, letterSpacing:"0.04em", marginBottom:4 }}>INFUSE OVER</div>
                  <div className="seg" style={{ padding:1 }}>
                    {[16, 20, 24].map(h => (
                      <button key={h} className={lipidDripHours === h ? "on" : ""} onClick={() => setLipidDripHours(h)}>{h}h</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="s2-lip-row" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, alignItems:"center" }}>
                <div>
                  <NumField label="SMOF Lipid 20%" unit="g/kg/d" value={lipidPerKg} onChange={setLipidPerKg} step={0.1} />
                  <PresetChips values={[0.5, 1, 2, 3, 4]} current={lipidPerKg} onSelect={setLipidPerKg} />
                </div>
                <div style={{ padding:"8px 10px", background:"var(--bg-2)", borderRadius:6, fontSize:12 }}>
                  <div style={{ color:"var(--ink-3)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em" }}>SMOF volume</div>
                  <div className="num" style={{ fontWeight:700, fontSize:15, color:"var(--ink)" }}>
                    {lipidPerKg > 0 ? fmt(calc.solVol.lipidSMOF,1) : "—"} mL/day
                  </div>
                  <div style={{ color:"var(--ink-3)", fontSize:10, marginTop:1 }}>
                    {lipidPerKg > 0 ? `${fmt(calc.lipidG,1)} g/day` : ""}
                    {lipidPerKg > 0 && wtKg > 0 && <span style={{ marginLeft:6, color:"var(--brand-2)", fontWeight:600 }}>= {fmt(lipidPerKg*5,1)} mL/kg/d</span>}
                  </div>
                </div>
                <div style={{ padding:"8px 10px", background:"var(--bg-2)", borderRadius:6, fontSize:12 }}>
                  <div style={{ color:"var(--ink-3)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.04em" }}>+ Vitalipid N</div>
                  <div className="num" style={{ fontWeight:700, fontSize:15, color:"var(--ink)" }}>
                    {fmt(calc.vitalipidVol,1)} mL/day
                  </div>
                  <div style={{ color:"var(--ink-3)", fontSize:10, marginTop:1 }}>4 mL/kg (max 10)</div>
                </div>
              </div>

              {calc.lipidBagVol > 0 && (
                <div style={{ padding:"7px 10px", background:"var(--bg-2)", borderRadius:6,
                  display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12 }}>
                  <span style={{ color:"var(--ink-2)" }}>Lipid bag total (SMOF + Vitalipid)</span>
                  <span className="num" style={{ fontWeight:700, color:"var(--ink)" }}>
                    {fmt(calc.lipidBagVol,1)} mL/day
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ══ Metric tiles — horizontal row ═══════════════════════════ */}
          <div className="metric-tiles-4" style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
            <Tile label="Energy (total)" value={calc.kcalKg} unit=" kcal/kg/d" target={tKcal} status={sKcal} decimals={0} max={160} />
            <Tile label="Protein" value={calc.proteinKg} unit=" g/kg/d" target={tPro} status={sPro} decimals={1} max={5.5} />
            <Tile label="Lipid (total)" value={calc.lipidKgTotal} unit=" g/kg/d" target={tLip} status={sLip} decimals={1} max={7} />
            <Tile label="NPC : Protein" value={calc.npeN} unit=" kcal/g AA" target={tNPE} status={sNPE} decimals={0} max={60} />
            {/* Central range 0–1800: the same threshold sOsm and the alert use
                (UP-C12, Praew 2026-09-17) — it read 0–1600, so 1700 showed
                outside the printed range on a green tile. */}
            <Tile label="Osmolarity" value={calc.osm} unit=" mOsm/L" target={route==="peripheral"?[0,900]:[0,1800]} status={sOsm} decimals={0} max={route==="peripheral"?1100:2200} />
          </div>
          {/* A MEN feed is in none of these totals (since 2026-09-18), and Step
              2 says so — but the TPN team read the totals here as still
              counting it (2026-09-22), so it is said beside them too. */}
          {isMEN && calc.enVolTotal > 0 && (
            <div className="men-note" style={{ fontSize:11.5, color:"var(--ink-2)", padding:"6px 10px", background:"var(--bg-2)", borderRadius:6 }}>
              นม MEN (trophic) <span className="num">{fmt(calc.enVolPerKg, 0)}</span> mL/kg/d ไม่นับในค่ารวม — Energy, Protein, Lipid ด้านบน และ Na K Ca P ใน Step 4
            </div>
          )}

        </div></div>
      </div>

      {/* ===== Step 4 — Electrolytes ===== */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h clickable" onClick={() => toggleStep(3)}>
          <Icon name="drop" size={14} color="var(--brand)" />
          Step 4 · Electrolytes
          {!openSteps.has(3) && (naCl + kCl + caPerKg + glycophosP) > 0 && (
            <div className="step-summary">
              {naCl > 0    && <span className="step-summary-chip">Na {fmt(calc.naKg,1)} mEq/kg</span>}
              {kCl > 0     && <span className="step-summary-chip">K {fmt(calc.kKg,1)} mEq/kg</span>}
              {caPerKg > 0 && <span className="step-summary-chip">Ca {caPerKg} mg/kg</span>}
              {glycophosP > 0 && <span className="step-summary-chip">P {glycophosP} mL/kg Glycophos</span>}
            </div>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
            <div className={`step-dot ${stepStatus[3]}`} />
            <span style={{ fontSize:13, color:"var(--ink-3)" }}>{openSteps.has(3) ? "▲" : "▼"}</span>
          </div>
        </div>
        <div className={`accordion-body${openSteps.has(3) ? ' open' : ''}`}><div className="card-b">
          <TwoCol>
            <div>
              {/* ── Na ── */}
              <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.05, marginBottom: 4 }}>Na (mEq/kg)</div>
              <SaltRow label={S.naCl.label} note={`${S.naCl.naMeqPerMl} mEq Na/mL`} perKg={naCl} onChange={setNaCl} wtKg={wtKg} />
              <PresetChips values={[1, 2, 3, 4]} current={naCl} onSelect={setNaCl} />
              {calc.solVol.naCl > 0 && (
                <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>
                  {fmt(naCl, 1)} mEq Na/kg/d = {fmt(naCl / S.naCl.naMeqPerMl, 2)} mL/kg/d
                  <div style={{ color:"var(--ink-3)" }}>
                    เตรียม {fmt(calc.solVol.naCl, 1)} mL/d
                    {calc.overfill > 1.001 && ` = ถึงผู้ป่วย ${fmt(naCl / S.naCl.naMeqPerMl * wtKg, 1)} + คาสาย ${fmt(calc.solVol.naCl - naCl / S.naCl.naMeqPerMl * wtKg, 1)} mL`}
                  </div>
                </div>
              )}

              <SaltRow label={S.naAcetate.label} note={`metabolic acidosis · ${S.naAcetate.naMeqPerMl} mEq Na/mL`} perKg={naAcet} onChange={setNaAcet} wtKg={wtKg} />
              <PresetChips values={[1, 2, 3, 4]} current={naAcet} onSelect={setNaAcet} />
              {calc.solVol.naAcet > 0 && (
                <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>
                  {fmt(naAcet, 1)} mEq Na/kg/d = {fmt(naAcet / S.naAcetate.naMeqPerMl, 2)} mL/kg/d
                  <div style={{ color:"var(--ink-3)" }}>
                    เตรียม {fmt(calc.solVol.naAcet, 1)} mL/d
                    {calc.overfill > 1.001 && ` = ถึงผู้ป่วย ${fmt(naAcet / S.naAcetate.naMeqPerMl * wtKg, 1)} + คาสาย ${fmt(calc.solVol.naAcet - naAcet / S.naAcetate.naMeqPerMl * wtKg, 1)} mL`}
                  </div>
                </div>
              )}

              {/* Entered as SODIUM (as on the KCMH worksheet), which is the
                  opposite of how phosphate is usually thought about: 1 mmol P/kg
                  means typing 2. The phosphate it delivers is therefore always
                  shown, even at 0, so "Glycophos 1" can't silently mean half
                  the intended P (2026-09-11 review, F7). */}
              <SaltRow label="Glycophos® (ใส่เป็น Na)" note="ใส่ mEq Na/kg · 2 mEq Na = 1 mL = 1 mmol P (31 mg)"
                perKg={glycophosP * 2} onChange={(v) => setGlycophosP(v / 2)} wtKg={wtKg} unit="mEq Na/kg"
                mlPerKg={glycophosP} />
              <PresetChips values={[1, 2, 3, 4]} current={glycophosP * 2} onSelect={(v) => setGlycophosP(v / 2)} />
              <div className="glycophos-p" style={{ fontSize:11.5, fontWeight:700, color: glycophosP > 0 ? "var(--brand-2)" : "var(--ink-3)", paddingLeft:2, marginTop:1 }}>
                → P {fmt(glycophosP, 2)} mmol/kg/d = {fmt(glycophosP * 31, 0)} mg/kg/d
              </div>
              {glycophosP > 0 && (
                <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>
                  {fmt(glycophosP * 2, 1)} mEq Na/kg/d = {fmt(glycophosP, 2)} mL/kg/d · P {fmt(glycophosP * 31, 0)} mg/kg/d
                  <div style={{ color:"var(--ink-3)" }}>
                    เตรียม {fmt(calc.solVol.glycophos, 1)} mL/d
                    {calc.overfill > 1.001 && ` = ถึงผู้ป่วย ${fmt(glycophosP * wtKg, 1)} + คาสาย ${fmt(calc.solVol.glycophos - glycophosP * wtKg, 1)} mL`}
                  </div>
                </div>
              )}

              {/* ── K ── */}
              <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.05, margin: "12px 0 4px" }}>K (mEq/kg)</div>
              <SaltRow label={S.kCl.label} note={`${S.kCl.kMeqPerMl} mEq K/mL`} perKg={kCl} onChange={setKCl} wtKg={wtKg} />
              <PresetChips values={[1, 2, 3, 4]} current={kCl} onSelect={setKCl} />
              {calc.solVol.kCl > 0 && (
                <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>
                  {fmt(kCl, 1)} mEq K/kg/d = {fmt(kCl / S.kCl.kMeqPerMl, 2)} mL/kg/d
                  <div style={{ color:"var(--ink-3)" }}>
                    เตรียม {fmt(calc.solVol.kCl, 1)} mL/d
                    {calc.overfill > 1.001 && ` = ถึงผู้ป่วย ${fmt(kCl / S.kCl.kMeqPerMl * wtKg, 1)} + คาสาย ${fmt(calc.solVol.kCl - kCl / S.kCl.kMeqPerMl * wtKg, 1)} mL`}
                  </div>
                </div>
              )}

              <SaltRow label="K₂HPO₄" note="1 mEq K/mL · P 15.5 mg/mEq K" perKg={k2hpo4} onChange={setK2HPO4} wtKg={wtKg} />
              <PresetChips values={[1, 2, 3, 4]} current={k2hpo4} onSelect={setK2HPO4} />
              {calc.solVol.k2hpo4 > 0 && (
                <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>
                  {fmt(k2hpo4, 1)} mEq K/kg/d = {fmt(k2hpo4 / S.k2hpo4.kMeqPerMl, 2)} mL/kg/d · P {fmt(k2hpo4 * S.k2hpo4.pMgPerKMeq, 0)} mg/kg/d
                  <div style={{ color:"var(--ink-3)" }}>
                    เตรียม {fmt(calc.solVol.k2hpo4, 2)} mL/d
                    {calc.overfill > 1.001 && ` = ถึงผู้ป่วย ${fmt(k2hpo4 / S.k2hpo4.kMeqPerMl * wtKg, 2)} + คาสาย ${fmt(calc.solVol.k2hpo4 - k2hpo4 / S.k2hpo4.kMeqPerMl * wtKg, 2)} mL`}
                  </div>
                </div>
              )}

              {/* ── Mg · Ca ── */}
              <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.05, margin: "12px 0 4px" }}>Mg (mEq/kg + mg/kg) · Ca (mg/kg)</div>
              <SaltRow label="MgSO₄" note={`${(mgStrength === "50" ? S.mgso4_50 : S.mgso4_10).mgMeqPerMl} mEq/mL`} perKg={mgPerKg} onChange={setMgPerKg} wtKg={wtKg} />
              <PresetChips values={[0.2, 0.4, 0.6]} current={mgPerKg} onSelect={setMgPerKg} />
              {/* Dosed and compounded in mEq/kg/d (matches the stock's mEq/mL) —
                  this line only adds mg/kg/d for cross-checking a mg-based reference,
                  it does not change what is compounded. */}
              {mgPerKg > 0 && (
                <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>
                  {fmt(mgPerKg, 2)} mEq Mg/kg/d = {fmt(mgPerKg * D.MG_MG_PER_MEQ, 1)} mg/kg/d
                </div>
              )}
              {/* The KCMH worksheet prints both strengths but compounds from 10% */}
              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
                <span style={{ fontSize:10.5, color:"var(--ink-3)" }}>Vial</span>
                <div className="seg" style={{ padding:1 }}>
                  {[["10","10%"],["50","50%"]].map(([v,lab]) => (
                    <button key={v} className={mgStrength === v ? "on" : ""} onClick={() => setMgStrength(v)}>{lab}</button>
                  ))}
                </div>
                {calc.solVol.mg > 0 && (
                  <span style={{ fontSize:10.5, color:"var(--brand-2)", fontWeight:600 }}>
                    → {calc.solVol.mg} mL/d
                    <span style={{ color:"var(--ink-3)", fontWeight:400, marginLeft:5 }}>
                      ({mgStrength === "50" ? `10% = ${calc.solVol.mg10}` : `50% = ${calc.solVol.mg50}`} mL)
                    </span>
                  </span>
                )}
              </div>

              <SaltRow label={S.caGluconate.label} note={`Elemental Ca ${fmt(S.caGluconate.caMgPerMl, 1)} mg/mL · Ca:P ~1.7:1`} perKg={caPerKg} onChange={setCaPerKg} wtKg={wtKg} unit="mg/kg/d" />
              <PresetChips values={[32, 60, 80, 100]} current={caPerKg} onSelect={setCaPerKg} />
              {calc.solVol.ca > 0 && <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>→ {calc.solVol.ca} mL/d</div>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Tile label="Sodium" value={calc.naTotalDelivered} unit=" mEq/kg/d" target={tNa} status={sNa} decimals={1} max={7} />
              <Tile label="Potassium" value={calc.kTotalDelivered} unit=" mEq/kg/d" target={tK} status={sK} decimals={1} max={4} />
              {/* K⁺ concentration of the finished bag — the sheet's G25 stop,
                  40 mEq/L on either route, not a per-kg dose. A tile since the
                  TPN team missed it as a line of small text (2026-09-22); the
                  route ceilings they quoted are for reference (Praew). */}
              <Tile label="K⁺ in bag" value={calc.kMeqPerL} unit=" mEq/L" target={[0, D.MAX_K_MEQ_PER_L]} status={sKConc} decimals={0} max={D.MAX_K_MEQ_PER_L * 2} />
              <div className="k-conc-ref" style={{ marginTop:-4, fontSize:10.5, textAlign:"right", color:"var(--ink-3)" }}>
                max {D.MAX_K_MEQ_PER_L} (KCMH) · ref. peripheral {D.K_REF_MEQ_PER_L.peripheral} / central {D.K_REF_MEQ_PER_L.central} mEq/L
              </div>
              {/* Mg in the unit it is dosed in (tMg), plus mg/kg/d for the
                  guideline's mg columns. TPN only: EN_DB carries no Mg. */}
              <Tile label="Magnesium" value={mgPerKg} unit=" mEq/kg/d" target={tMg} status={sMg} decimals={2} max={1} />
              {mgPerKg > 0 && (
                <div className="mg-mgkg" style={{ marginTop:-4, fontSize:10.5, textAlign:"right", color:"var(--ink-3)" }}
                  title="ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Mihatsch): preterm, first days 0.1–0.2 mmol (2.5–5.0 mg)/kg/d; growing 0.2–0.3 mmol (5.0–7.5 mg)/kg/d · 1 mmol Mg = 2 mEq">
                  = {fmt(mgPerKg * D.MG_MG_PER_MEQ, 1)} mg/kg/d · TPN only
                </div>
              )}
              <Tile label="Calcium" value={calc.caKg} unit=" mg/kg/d" target={tCa} status={sCa} decimals={0} max={140} />
              <Tile label="Phosphorus" value={calc.pKg} unit=" mg/kg/d" target={tP} status={sP} decimals={0} max={90} />
              <Tile label="Ca:P ratio" value={calc.caP} unit=":1 (mass)" target={tCaP} status={sCaP} decimals={2} max={2.5} />
            </div>
          </TwoCol>
        </div></div>
      </div>

      {/* ===== Step 5 — Vitamins, Trace Elements, Heparin ===== */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h clickable" onClick={() => toggleStep(4)}>
          <Icon name="info" size={14} color="var(--brand)" />
          Step 5 · Vitamins · Trace Elements · Heparin
          {!openSteps.has(4) && (
            <div className="step-summary">
              {inclSoluvit   && <span className="step-summary-chip">Soluvit {fmt(calc.soluvitVol,1)} mL</span>}
              {inclPeditrace && <span className="step-summary-chip">Peditrace {fmt(calc.peditrace_vol,1)} mL</span>}
              {znPerKg > 0 && <span className="step-summary-chip">ZnSO₄ {fmt(znPerKg,3)} mg Zn/kg</span>}
              <span className="step-summary-chip">Heparin {heparinUmL} U/mL</span>
            </div>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
            <div className={`step-dot ${stepStatus[4]}`} />
            <span style={{ fontSize:13, color:"var(--ink-3)" }}>{openSteps.has(4) ? "▲" : "▼"}</span>
          </div>
        </div>
        <div className={`accordion-body${openSteps.has(4) ? ' open' : ''}`}><div className="card-b">
          <TwoCol>
            <div>
              <div className="sub-h">5. Multivitamin</div>
              <Chk label="Soluvit N® (water-soluble vitamins)" value={inclSoluvit} onChange={setInclSoluvit}
                hint={inclSoluvit ? `${fmt(calc.soluvitVol, 1)} mL/day in bag${calc.overfill > 1.001 ? ` (× Factor → delivers ${fmt(calc.soluvitVol * calc.deliveredFrac, 1)})` : ""}  ·  ${S.soluvit.mlPerKg} mL/kg/day (max ${S.soluvit.maxMl} mL/day) · add to aqueous PN` : "Not included"} />

              <div className="sub-h" style={{ marginTop: 14 }}>6. Trace Elements</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Chk label={`Peditrace (Zn ${S.peditrace.znMgPerMl * 1000} µg/mL)`} value={inclPeditrace} onChange={setInclPeditrace}
                  hint={inclPeditrace ? `${fmt(calc.peditrace_vol, 1)} mL/day in bag${calc.overfill > 1.001 ? ` (× Factor → delivers ${fmt(calc.peditrace_vol * calc.deliveredFrac, 1)})` : ""}  ·  ${S.peditrace.mlPerKg} mL/kg/day (max ${S.peditrace.maxMl} mL) · add to aqueous PN` : "Not included"} />
                {/* ZnSO₄ on top of Peditrace — the KCMH paper form's "ZnSO₄
                    (Additional to the above)" line, dosed in mg of ELEMENTAL
                    zinc per kg like every additive (TPN team + Praew,
                    2026-09-22). Not on Center Point: its packet has no slot. */}
                {!centerPoint && (
                  <NumField label="ZnSO₄ (เพิ่มจาก Peditrace)" unit="mg Zn/kg/d" value={znPerKg} onChange={setZnPerKg} step={0.05}
                    hint={znPerKg > 0
                      ? `elemental Zn · = ${fmt(calc.znSO4_mg, 2)} mg/day ถึงผู้ป่วย${calc.overfill > 1.001 ? ` · ${fmt(calc.znSO4_bag_mg, 2)} mg ในถุง (× Factor)` : ""}`
                      : "elemental Zn · ไม่ให้เพิ่ม = เว้นว่าง"} />
                )}
                {calc.znTotal_mg > 0 && (
                  <div className="zn-total" style={{ fontSize:12, padding:"6px 10px", borderRadius:6,
                    background: calc.znTotal_mg > D.MAX_ZN_MG_DAY ? "var(--crit-bg)" : "var(--bg-2)",
                    color: calc.znTotal_mg > D.MAX_ZN_MG_DAY ? "var(--crit)" : "var(--ink-2)" }}>
                    Zinc รวม <strong className="num">{fmt(calc.znTotal_mg, 2)} mg/day</strong> = <span className="num">{fmt(wtKg > 0 ? calc.znTotal_mg / wtKg : 0, 2)}</span> mg/kg/d
                    <div style={{ fontSize:10.5, color:"var(--ink-3)" }}>
                      Peditrace <span className="num">{fmt(calc.znPeditrace_mg, 2)}</span> + ZnSO₄ <span className="num">{fmt(calc.znSO4_mg, 2)}</span> · max {D.MAX_ZN_MG_DAY} mg/day
                    </div>
                  </div>
                )}
              </div>

              <div className="sub-h" style={{ marginTop: 14 }}>7. Heparin</div>
              {/* Units from the PREPARED volume, as the mL beside them are
                  (solVol.heparin, sheet G51) — with dead space the two halves
                  of this hint used to disagree (UP-C13). */}
              <NumField label="Heparin" unit="U/mL" value={heparinUmL} onChange={setHeparinUmL} step={0.5}
                hint={`Normal 0.5–1 U/mL · total ${fmt(heparinUmL * calc.preparedVol, 0)} U/day → ${fmt(calc.solVol.heparin, 2)} mL of ${S.heparin.unitsPerMl} U/mL`} />
            </div>

            <div style={{ background: "var(--bg-2)", borderRadius: 8, padding: "16px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="sub-h" style={{ marginTop: 0 }}>Additives Summary</div>
              <MiniReadout label="Vitalipid N Infant (fat-sol.)" value={fmt(calc.vitalipidVol, 1)} unit="mL/day"
                color="var(--brand-2)" />
              <MiniReadout label="Soluvit N (water-sol.)" value={inclSoluvit ? fmt(calc.soluvitVol, 1) : "—"} unit={inclSoluvit ? "mL/day" : ""}
                color={inclSoluvit ? "var(--brand-2)" : "var(--ink-3)"} />
              <MiniReadout label="Peditrace" value={inclPeditrace ? fmt(calc.peditrace_vol, 1) : "—"} unit={inclPeditrace ? "mL/day" : ""}
                color={inclPeditrace ? "var(--brand-2)" : "var(--ink-3)"} />
              <MiniReadout label="Heparin" value={heparinUmL} unit="U/mL" />
              <MiniReadout label={`Heparin ${S.heparin.unitsPerMl} U/mL — volume`} value={fmt(calc.solVol.heparin, 2)} unit="mL/day"
                color="var(--brand-2)" />
              <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "var(--surface)", fontSize: 11, color: "var(--ink-3)", borderTop: "1px solid var(--line-2)" }}>
                💡 Vitalipid → <strong>lipid bag</strong><br/>
                Soluvit + Peditrace → <strong>aqueous PN bag</strong><br/>
                Heparin 0.5–1 U/mL → <strong>aqueous PN bag</strong>
              </div>
            </div>
          </TwoCol>
        </div></div>
      </div>

      {/* ===== Step 6 — Enteral Supplements ===== */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h clickable" onClick={() => toggleStep(6)}>
          <Icon name="info" size={14} color="var(--brand)" />
          Step 6 · Enteral Supplements
          {!openSteps.has(6) && (suppVitD > 0 || suppCa > 0 || suppPO4 > 0 || suppMTV || suppFerdek > 0) && (
            <div className="step-summary">
              {suppVitD   > 0  && <span className="step-summary-chip">Vit D {suppVitD} IU/kg</span>}
              {suppCa     > 0  && <span className="step-summary-chip">Ca {suppCa} mg/kg</span>}
              {suppPO4    > 0  && <span className="step-summary-chip">PO₄ {suppPO4} mg/kg</span>}
              {suppMTV         && <span className="step-summary-chip">MTV ✓</span>}
              {suppFerdek > 0  && <span className="step-summary-chip">Fe {suppFerdek} mg/kg</span>}
            </div>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
            <div className={`step-dot ${(suppVitD > 0 || suppCa > 0 || suppPO4 > 0 || suppMTV || suppFerdek > 0) ? "done" : "empty"}`} />
            <span style={{ fontSize:13, color:"var(--ink-3)" }}>{openSteps.has(6) ? "▲" : "▼"}</span>
          </div>
        </div>
        <div className={`accordion-body${openSteps.has(6) ? ' open' : ''}`}><div className="card-b">
          <div className="guidelines-grid">
            {/* ── Left column ── */}
            <div>

              {/* Munti-vim Drop */}
              <div className="sub-h">Multivitamin — Munti-vim Drop</div>
              <Chk label="Munti-vim Drop 1 mL/day" value={suppMTV} onChange={setSuppMTV}
                hint="Vit D3 400 IU · Vit A 2000 IU · B1/B2/B3/B6/B12 · Vit C 40 mg · 1 mL/day · ให้พร้อมอาหาร" />

              {/* Iron */}
              <div className="sub-h" style={{ marginTop: 14 }}>Iron (oral)</div>
              <div className="field" style={{ marginBottom: 6 }}>
                <label>ผลิตภัณฑ์</label>
                <select className="sel" style={{ height: 38 }} value={suppFeType} onChange={e => setSuppFeType(e.target.value)}>
                  {Object.entries(D.SUPP_DB).filter(([,v]) => v.category === "fe").map(([k,v]) =>
                    <option key={k} value={k}>{v.label} · {v.fe_mg_per_ml} mg elem Fe/mL</option>
                  )}
                </select>
              </div>
              <NumField label="Iron" unit="mg/kg/day elem Fe" value={suppFerdek} onChange={setSuppFerdek} step={0.5}
                hint={(() => {
                  const prod = D.SUPP_DB[suppFeType];
                  const totalMg = suppFerdek * wtKg;
                  const vol = prod && totalMg > 0 ? totalMg / prod.fe_mg_per_ml : 0;
                  return suppFerdek > 0 && wtKg > 0
                    ? `= ${fmt(totalMg, 1)} mg elem Fe/day · ${fmt(vol, 2)} mL/day (${prod?.label})`
                    : `ESPGHAN 2022: 2–3 mg/kg/day · เริ่มอายุ 2–4 สัปดาห์`;
                })()} />
              <PresetChips values={[2, 3, 4]} current={suppFerdek} onSelect={setSuppFerdek} />

            </div>

            {/* ── Right column ── */}
            <div>

              {/* Calcium */}
              <div className="sub-h">Calcium (oral)</div>
              <div className="field" style={{ marginBottom: 6 }}>
                <label>ผลิตภัณฑ์</label>
                <select className="sel" style={{ height: 38 }} value={suppCaType} onChange={e => setSuppCaType(e.target.value)}>
                  {Object.entries(D.SUPP_DB).filter(([,v]) => v.category === "ca").map(([k,v]) =>
                    <option key={k} value={k}>{v.label} — {v.ca_mg_per_unit} mg elem Ca/tab</option>
                  )}
                </select>
              </div>
              <NumField label="ปริมาณ elem Ca" unit="mg/kg/day" value={suppCa} onChange={setSuppCa} step={10}
                hint={(() => {
                  const prod = D.SUPP_DB[suppCaType];
                  const totalMg = suppCa * wtKg;
                  const tabs = prod && totalMg > 0 ? totalMg / prod.ca_mg_per_unit : 0;
                  return suppCa > 0 && wtKg > 0
                    ? `= ${Math.round(totalMg)} mg/day · ${fmt(tabs, 2)} tab/day (${prod?.label})`
                    : `ESPGHAN 2022 target: 120–200 mg/kg/day · ${D.SUPP_DB[suppCaType]?.note || ""}`;
                })()} />
              <PresetChips values={[50, 80, 100, 120]} current={suppCa} onSelect={setSuppCa} />

              {/* Phosphate */}
              <div className="sub-h" style={{ marginTop: 14 }}>Phosphate (oral)</div>
              <div className="field" style={{ marginBottom: 6 }}>
                <label>ผลิตภัณฑ์</label>
                <select className="sel" style={{ height: 38 }} value={suppPO4Type} onChange={e => setSuppPO4Type(e.target.value)}>
                  {Object.entries(D.SUPP_DB).filter(([,v]) => v.category === "po4").map(([k,v]) =>
                    <option key={k} value={k}>{v.label} · {v.unitVol} mL = {(v.po4_mg_per_ml * v.unitVol).toFixed(0)} mg P</option>
                  )}
                </select>
              </div>
              <NumField label="ปริมาณ elem P" unit="mg/kg/day" value={suppPO4} onChange={setSuppPO4} step={5}
                hint={(() => {
                  const prod = D.SUPP_DB[suppPO4Type];
                  const totalMg = suppPO4 * wtKg;
                  const vol = prod && totalMg > 0 ? totalMg / prod.po4_mg_per_ml : 0;
                  return suppPO4 > 0 && wtKg > 0
                    ? `= ${fmt(totalMg, 1)} mg/day (${fmt(totalMg / 31, 2)} mmol) · ${fmt(vol, 1)} mL/day (${prod?.label})`
                    : `ESPGHAN 2022 target: 2.2–3.7 mmol/kg/day (~68–115 mg/kg/day) · ${D.SUPP_DB[suppPO4Type]?.note || ""}`;
                })()} />
              <PresetChips values={[30, 40, 60]} current={suppPO4} onSelect={setSuppPO4} />
              {/* Nutrition Unit AUG2026 slide 8 — oral Ca and P bind each other in the
                  gut lumen, so the doses have to be separated in time, not just totalled. */}
              {suppCa > 0 && suppPO4 > 0 && (
                <div style={{ fontSize: 10.5, color: "var(--warn)", marginTop: 3 }}>
                  ⚠ ให้ทั้ง Ca และ P — บริหารยาคนละเวลา หรือห่างกันอย่างน้อย 1 ชั่วโมง
                </div>
              )}

              {/* Vitamin D */}
              <div className="sub-h" style={{ marginTop: 14 }}>Vitamin D drops</div>
              <NumField label="Vitamin D" unit="IU/kg/day" value={suppVitD} onChange={setSuppVitD} step={100}
                hint={suppVitD > 0 && wtKg > 0
                  ? `= ${Math.round(suppVitD * wtKg)} IU/day · ESPGHAN 2022: 400–700 IU/kg`
                  : "ESPGHAN 2022: 400–700 IU/kg/day"} />
              <PresetChips values={[400, 500, 600, 700]} current={suppVitD} onSelect={setSuppVitD} suffix=" IU/kg" />
              {suppMTV && suppVitD > 0 && (
                <div style={{ fontSize: 10.5, color: "var(--warn)", marginTop: 3 }}>
                  ⚠ Munti-vim มี D3 400 IU อยู่แล้ว — รวมเป็น {Math.round((suppVitD + 400) * wtKg)} IU/day
                </div>
              )}

              {/* Summary */}
              {(suppVitD > 0 || suppCa > 0 || suppPO4 > 0 || suppMTV || suppFerdek > 0) && (
                <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--brand-bg)",
                  border: "1px solid var(--brand-line)", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                    Supplement order / day
                  </div>
                  {suppMTV && (
                    <MiniReadout label="Munti-vim Drop" value="1" unit="mL/day" color="var(--brand-2)" />
                  )}
                  {suppVitD > 0 && wtKg > 0 && (
                    <MiniReadout label="Vitamin D" value={`${Math.round(suppVitD * wtKg)} IU`} unit="/day" color="var(--brand-2)" />
                  )}
                  {suppCa > 0 && wtKg > 0 && (() => {
                    const prod = D.SUPP_DB[suppCaType];
                    const tabs = prod ? (suppCa * wtKg) / prod.ca_mg_per_unit : 0;
                    return <MiniReadout label={`Ca · ${prod?.label}`}
                      value={`${Math.round(suppCa * wtKg)} mg`}
                      unit={`→ ${fmt(tabs, 2)} tab/day`} color="var(--brand-2)" />;
                  })()}
                  {suppPO4 > 0 && wtKg > 0 && (() => {
                    const prod = D.SUPP_DB[suppPO4Type];
                    const vol = prod ? (suppPO4 * wtKg) / prod.po4_mg_per_ml : 0;
                    return <MiniReadout label={`PO₄ · ${prod?.label}`}
                      value={`${fmt(suppPO4 * wtKg, 1)} mg`}
                      unit={`→ ${fmt(vol, 1)} mL/day`} color="var(--brand-2)" />;
                  })()}
                  {suppFerdek > 0 && wtKg > 0 && (() => {
                    const prod = D.SUPP_DB[suppFeType];
                    const vol = prod ? (suppFerdek * wtKg) / prod.fe_mg_per_ml : 0;
                    return <MiniReadout label={`Fe · ${prod?.label}`}
                      value={`${fmt(suppFerdek * wtKg, 1)} mg`}
                      unit={`→ ${fmt(vol, 2)} mL/day`} color="var(--brand-2)" />;
                  })()}
                </div>
              )}

            </div>
          </div>

          {/* ── Ca · PO₄ · Ca:P summary ─────────────────────────────────
              Oral supplement on its own, then combined with the Ca/PO₄ the
              baby is already getting from TPN and from the feed. Step 4's
              tiles only ever show TPN+EN, so without this the oral dose is
              invisible to the ratio the order is actually judged on. */}
          {(mineral.hasOral || mineral.hasIV) && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-2)" }}>
              {/* text-transform off: .sub-h uppercases, which would render the
                  element symbols as "CA" / "PO₄" / "CA:P" */}
              <div className="sub-h" style={{ marginTop: 0, textTransform: "none", letterSpacing: "0.02em", fontSize: 12 }}>
                สรุป Ca · PO₄ · Ca:P ratio
              </div>

              {/* Source breakdown — everything per kg/day, elemental */}
              <div style={{ border: "1px solid var(--line-2)", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 0.9fr", gap: 6,
                  padding: "7px 10px", background: "var(--bg-2)", fontSize: 10.5, color: "var(--ink-3)",
                  fontWeight: 600, letterSpacing: "0.03em" }}>
                  <span>แหล่ง</span>
                  <span style={{ textAlign: "right" }}>Ca</span>
                  <span style={{ textAlign: "right" }}>PO₄</span>
                  <span style={{ textAlign: "right" }}>Ca:P</span>
                </div>
                <CaPRow label="TPN (IV)"        ca={mineral.tpnCa}  p={mineral.tpnP}  ratio={mineral.tpnCaP} />
                {(mineral.enCa > 0 || mineral.enP > 0) &&
                  <CaPRow label="EN (นม)" ca={mineral.enCa} p={mineral.enP} ratio={null} />}
                <CaPRow label="Oral supplement" ca={mineral.oralCa} p={mineral.oralP} ratio={mineral.oralCaP} highlight />
                <CaPRow label="รวมทั้งหมด"      ca={mineral.totCa}  p={mineral.totP}  ratio={mineral.totCaP} total />
                <div style={{ padding: "6px 10px", fontSize: 10, color: "var(--ink-4)", background: "var(--bg-2)" }}>
                  หน่วย mg/kg/day (elemental) · Ca:P = mass ratio
                  {!mineral.hasIV && " · ยังไม่มี Ca/PO₄ จาก TPN หรือนม"}
                </div>
              </div>

              {/* Combined intake vs. target — the number the order is judged on */}
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>
                รวม TPN + EN + oral supplement · เทียบเป้าหมาย
                <span style={{ fontWeight: 400, color: "var(--ink-4)" }}>
                  {" "}({calc.useEnteralTargets ? "ESPGHAN 2022 enteral" : "ESPGHAN 2018 parenteral"})
                </span>
              </div>
              <div className="capo4-tiles">
                <Tile label="Calcium (total)"   value={mineral.totCa}  unit=" mg/kg/d"   target={tCa}  status={sTotCa}  decimals={0} max={220} />
                <Tile label="Phosphate (total)" value={mineral.totP}   unit=" mg/kg/d"   target={tP}   status={sTotP}   decimals={0} max={130} />
                <Tile label="Ca:P ratio (total)" value={mineral.totCaP} unit=":1 (mass)" target={tCaP} status={sTotCaP} decimals={2} max={2.5} exact />
              </div>
              {mineral.oralCa > 0 && mineral.oralP === 0 && (
                <div style={{ fontSize: 10.5, color: "var(--warn)", marginTop: 8 }}>
                  ⚠ ให้ Ca ทางปากโดยไม่มี PO₄ — ตรวจสอบ ratio รวมก่อนสั่ง
                </div>
              )}
            </div>
          )}
        </div></div>
      </div>

      {/* ===== Energy distribution + Alerts + Save ===== */}
      <div className="calc-bottom" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 280px", gap: 14 }}>
        <div className="card">
          <div className="card-h">
            <Icon name="info" size={14} color="var(--brand)" />
            Energy distribution
            <span className="h-meta">{calc.kcalKg.toFixed(0)} kcal/kg/d</span>
          </div>
          <div className="card-b">
            <KcalBar cho={calc.kcalChoPct} pro={calc.kcalProtPct} fat={calc.kcalFatPct} />
            <div className="kcal-legend" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", marginTop: 14, gap: 10 }}>
              <KcalLegend color="oklch(73.6% 0.082 80)" label="CHO" pct={calc.kcalChoPct} target="45–55%" />
              <KcalLegend color="oklch(55% 0.13 155)" label="Protein" pct={calc.kcalProtPct} target="10–15%" />
              <KcalLegend color="oklch(60% 0.11 25)" label="Fat" pct={calc.kcalFatPct} target="35–45%" />
            </div>
            <div style={{ marginTop: 12, borderTop: "1px solid var(--line-2)", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-3)" }}>
              <span>TPN <span className="num" style={{ color: "var(--ink)" }}>{calc.tpnKcal.toFixed(0)}</span></span>
              <span>EN <span className="num" style={{ color: "var(--ink)" }}>{calc.enKcal.toFixed(0)}</span>
                {isMEN && calc.enVolTotal > 0 && <span style={{ marginLeft: 4 }}>(MEN — not counted)</span>}</span>
              <span>EN share <span className="num" style={{ color: "var(--ink)" }}>{calc.totalKcal > 0 ? (calc.enKcal / calc.totalKcal * 100).toFixed(0) : 0}%</span></span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <Icon name="bell" size={14} color="var(--brand)" />
            Active alerts
            <span className="h-meta">{alerts.length} flagged</span>
          </div>
          <div className="card-b">
            {alerts.length === 0 ?
            <div className="alert-row info">
                <div className="ico"><Icon name="check" size={12} color="#fff" /></div>
                <div><div className="title">No safety flags</div><div className="body">Every prescribed nutrient is within its target range.</div></div>
              </div> :
            sortClinicalAlerts(alerts).map((a, i) =>
            <div key={i} className={`alert-row ${a.level}`}>
                <div className="ico">{a.level === "crit" ? "!" : "!"}</div>
                <div style={{ flex: 1 }}>
                  <div className="title">{a.title}</div>
                  <div className="body">{a.body}</div>
                  <div className="meta">Ref: {a.ref}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><Icon name={scratch ? "calc" : "save"} size={14} color="var(--brand)" /> {scratch ? "ผลคำนวณ · คัดลอก" : "Save + Copy Order"}</div>
          <div className="card-b">
            {scratch && (
              <div className="scratch-note" role="note" style={{ fontSize: 11.5, lineHeight: 1.55, marginBottom: 10,
                padding: "8px 10px", borderRadius: 6, background: "var(--warn-bg)", color: "var(--warn)",
                border: "1px solid var(--warn-line)" }}>
                <strong style={{ fontWeight: 700 }}>Calculator — ไม่บันทึกลง Google Sheets</strong>
                <div style={{ fontWeight: 400 }}>
                  ไม่ผูกกับผู้ป่วยรายใด ไม่มีใน Daily log และไม่พิมพ์ใบสั่ง TPN —
                  ปิดหน้านี้แล้วตัวเลขทั้งหมดจะหายไป
                </div>
              </div>
            )}
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 10 }}>
              <span className="num">{scratch ? "ไม่ผูกกับผู้ป่วย" : (patient?.name || patient?.initials || "—")}</span> · DOL <span className="num">{dol}</span> · {curWtG}g{usingBirthWeight && <> (calc. at birth weight {wtG}g)</>}{tpnWtManual && <> (calc. weight set manually to {wtG}g)</>} · {route === "central" ? "Central" : "Peripheral"}
            </div>
            {/* Whom to call about this order (TPN team, 2026-09-22) — the same
                name the printed form carries (savedByOf). */}
            {!centerPoint && !scratch && savedEntryId && savedMeta?.by && (
              <div className="saved-by" style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 10 }}>
                บันทึกโดย <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>{savedMeta.by}</span> · {savedAtLabelOf(savedMeta.at)}
              </div>
            )}

            {/* Saved-state indicator — Print/Copy/Submit need a saved, unchanged form */}
            {savedEntryId && dirty && (
              <div style={{ fontSize: 11.5, color: "var(--warn)", fontWeight: 600, marginBottom: 8 }}>
                ● มีการแก้ไขที่ยังไม่ได้บันทึก — พิมพ์/คัดลอกได้หลังบันทึก
              </div>
            )}
            {/* Saved and unchanged, but still held back (see printable). The
                no-volume case has its own line by the Save button. */}
            {!centerPoint && savedEntryId && !dirty && !printable && !zeroVolumeBag && (
              <div className="print-blocked" role="alert" style={{ fontSize: 11.5, color: "var(--crit)", fontWeight: 600, marginBottom: 8, lineHeight: 1.5 }}>
                ● {printBlockMessage("ก่อนพิมพ์/คัดลอก")}
                {!pendingSave && dosingWeightChanged && (
                  <div style={{ fontWeight: 400 }}>
                    บันทึกไว้ที่ <span className="num">{fmt(savedDosingWt.g, 0)}</span> g · ตอนนี้ <span className="num">{fmt(wtG, 0)}</span> g
                  </div>
                )}
                {!pendingSave && !dosingWeightChanged && uncoveredCritical.length > 0 && (
                  <div style={{ fontWeight: 400 }}>{uncoveredCritical.join(" · ")}</div>
                )}
              </div>
            )}

            {/* Changes vs the previous order — the cross-check for rounds and pharmacy */}
            {previousEntry && (
              <div className="order-changes" style={{ fontSize: 11.5, marginBottom: 10, padding: "8px 10px", background: "var(--bg-2)", borderRadius: 6 }}>
                <div style={{ fontWeight: 600, color: "var(--ink-2)", marginBottom: 4 }}>
                  เปลี่ยนแปลงจากคำสั่งก่อนหน้า (DOL {D.entryDol(patient, previousEntry)})
                </div>
                {!orderChanges
                  ? <div style={{ color: "var(--ink-3)" }}>คำสั่งก่อนหน้าไม่มีข้อมูลละเอียดให้เปรียบเทียบ</div>
                  : orderChanges.length === 0
                    ? <div style={{ color: "var(--ink-3)" }}>ไม่มีการเปลี่ยนแปลง</div>
                    : orderChanges.map(c => (
                        <div key={c.label} className="num" style={{ color: "var(--ink)" }}>
                          {c.label}: {c.from} → <strong>{c.to}</strong> {c.unit}
                        </div>))}
              </div>
            )}

            {/* Save bar — sticky on mobile */}
            <div className="calc-save-bar">
            {/* Copy order text to clipboard. Not on the Center Point entry:
                there the order leaves only as CP's reviewed revision, and a
                CP save makes the form "printable", which would unlock Copy. */}
            {!centerPoint && <button className="btn" style={{ width: "100%", marginBottom: 8 }} onClick={() => {
              // The save/printable gate exists so an edited form cannot be
              // copied out under a saved row's entry id. The quick calc has no
              // row and no id, so there is nothing to misattribute — and
              // gating it would make the button permanently dead. What the
              // copied text must not do is read like an order, which is what
              // the scratch header below is for.
              if (!scratch && !savedEntryId) {
                showToast("กรุณาบันทึกคำสั่งให้สำเร็จก่อนคัดลอก", "error");
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
              // Completeness check — warn if any clinical step is empty
              // stepStatus keys are content ids, not card display order — map to the
              // visible "Step N" label (fluid=1, TPN=3, electrolytes=4)
              const stepDisplayNumber = { 1: 1, 2: 3, 3: 4 };
              const incomplete = Object.entries(stepStatus)
                .filter(([n, s]) => s === "empty" && ["1","2","3"].includes(n))
                .map(([n]) => `Step ${stepDisplayNumber[n]}`);
              if (incomplete.length > 0 &&
                  !window.confirm(`${incomplete.join(", ")} ยังไม่ได้กรอก\nCopy order ต่อไปหรือไม่?`)) return;
              const lines = [
                scratch ? `══ NeoFeed — Calculator (ไม่ใช่คำสั่งการรักษา) ══` : `══ NeoFeed V2 — TPN Order ══`,
                // The quick calc's text carries no bed and no NeoFeed ID —
                // there is no patient behind it — and says so on its own
                // second line, because a paste into LINE arrives without the
                // screen it came from.
                scratch
                  ? `⚠ คำนวณจากน้ำหนักที่พิมพ์เอง · ไม่ผูกกับผู้ป่วย · ไม่ได้บันทึกในระบบ — ตรวจกับผู้ป่วยจริงก่อนใช้`
                  // No name in copied text: it tends to be pasted into chat
                  // apps (LINE) outside the hospital's control — bed + NeoFeed
                  // ID identify the order on the ward without being PHI on
                  // their own (2026-09-11 review, PDPA).
                  : `Bed: ${patient?.currentBed||"—"} | NeoFeed ID: ${patient?.sessionId||"—"} | DOL: ${dol} | Wt: ${curWtG}g${usingBirthWeight ? ` (calc. at birth weight ${wtG}g)` : ""}${tpnWtManual ? ` (calc. weight set manually to ${wtG}g; auto ${autoWtG}g)` : ""}`,
                scratch ? `DOL: ${dol} | Wt: ${curWtG} g${tpnWtManual ? ` (calc. weight ${wtG}g)` : ""}` : "",
                critOverride ? `⚠ CRITICAL OVERRIDE — แพทย์ยืนยันคำสั่ง: ${critOverride.alerts.join("; ")} — reason: ${critOverride.reason}` : "",
                `Route: ${route === "central" ? "Central" : "Peripheral (<900 mOsm/L)"}`,
                // Every figure below goes through fmt: at most the decimals
                // shown, never a trailing zero (Praew, 2026-09-22). The stock
                // mL in solVol/soluvitVol/peditrace_vol are already rounded
                // to the mL pharmacy draws up, and print as they are.
                `Osm: ${fmt(calc.osm, 0)} mOsm/L`,
                `──────────────────────────────`,
                `FLUID: Target ${fluidTargetPerKg} mL/kg/d = ${fmt(fluidTargetPerKg*calc.wtKg, 0)} mL/day`,
                `  TPN aqueous: ${fmt(totalTPN_mL, 1)} mL/day delivered → Rate ${fmt(totalTPN_mL/24, 2)} mL/hr`,
                calc.overfill > 1.001
                  ? `  PREPARE:     ${fmt(calc.preparedVol, 1)} mL/day (+${fmt(deadVol_mL, 1)} mL ปริมาตรคาสาย) · Factor ${fmt(calc.factor, 3)} = ${fmt(calc.wtKg, 3)} kg × ${fmt(calc.overfill, 3)}`
                  : `  PREPARE:     ${fmt(calc.preparedVol, 1)} mL/day (no overfill)`,
                `  Lipid bag:   ${fmt(calc.lipidBagVol, 1)} mL/day over ${lipidDripHours}h → Rate ${fmt(calc.lipidBagVol/lipidDripHours, 2)} mL/hr${lipidPerKg > 0 ? ` (${fmt(lipidPerKg/lipidDripHours, 3)} g/kg/h)` : ""}`,
                `  Prescribed:  ${fmt(calc.prescribedFluid, 0)} mL/day | Remaining: ${fmt(calc.remaining, 1)} mL`,
                `──────────────────────────────`,
                `DEXTROSE: ${dexPct}% → D50W ${calc.d50wVol} mL/day | ${fmt(calc.dexG_bag, 1)} g in bag, ${fmt(calc.dexG, 1)} g delivered = ${fmt(calc.dexGPerKg, 1)} g/kg/d (max ${D.MAX_DEXTROSE_G_KG})`,
                `  GIR: ${fmt(calc.gir, 1)} mg/kg/min`,
                `AA (${S[aaStockKey].short}): ${aaPerKg} g/kg/d → ${fmt(calc.aaG_bag, 1)} g in bag = ${calc.solVol.aa} mL/day (${fmt(calc.aaG, 1)} g delivered)`,
                `Lipid (SMOF 20%): ${lipidPerKg} g/kg/d = ${fmt(calc.lipidG, 1)} g/d → ${calc.solVol.lipidSMOF} mL/day`,
                `Vitalipid N Infant: ${fmt(calc.vitalipidVol, 1)} mL/day → lipid bag`,
                `──────────────────────────────`,
                `ELECTROLYTES (ordered per kg → amount IN BAG → mL of stock):`,
                naCl>0 ? `  ${S.naCl.label}:    ${naCl} mEq/kg → ${fmt(naCl*calc.factor, 1)} mEq → ${calc.solVol.naCl} mL` : "",
                naAcet>0 ? `  Na Acetate:   ${naAcet} mEq/kg → ${fmt(naAcet*calc.factor, 1)} mEq → ${calc.solVol.naAcet} mL` : "",
                glycophosP>0 ? `  Glycophos®:   ${glycophosP} mL/kg → ${calc.solVol.glycophos} mL (Na ${fmt(glycophosP*2*calc.factor, 1)} mEq | P ${fmt(glycophosP*31*calc.factor, 0)} mg)` : "",
                `  Total Na:     ${fmt(calc.bag.na_mEq, 1)} mEq in bag = ${fmt(calc.naKg, 1)} mEq/kg/d delivered`,
                kCl>0 ? `  KCl (${S.kCl.kMeqPerMl} mEq/mL): ${kCl} mEq/kg → ${fmt(kCl*calc.factor, 1)} mEq → ${calc.solVol.kCl} mL` : "",
                k2hpo4>0 ? `  K2HPO4:       ${k2hpo4} mEq/kg → ${fmt(k2hpo4*calc.factor, 1)} mEq → ${calc.solVol.k2hpo4} mL (P ${fmt(k2hpo4*15.5*calc.factor, 0)} mg)` : "",
                `  Total K:      ${fmt(calc.bag.k_mEq, 1)} mEq in bag = ${fmt(calc.kKg, 1)} mEq/kg/d delivered (${fmt(calc.kMeqPerL, 0)} mEq/L, max ${D.MAX_K_MEQ_PER_L})`,
                caPerKg>0 ? `  Ca-gluconate: ${caPerKg} mg/kg → ${fmt(caPerKg*calc.factor, 0)} mg → ${calc.solVol.ca} mL` : "",
                mgPerKg>0 ? `  MgSO4 ${mgStrength}%:    ${mgPerKg} mEq/kg → ${fmt(mgPerKg*calc.factor, 2)} mEq → ${calc.solVol.mg} mL` : "",
                calc.caP > 0 ? `  Ca:P ratio:   ${isFinite(calc.caP) ? fmt(calc.caP, 2) : "!! (Ca ordered, P = 0)"}:1 (mass, TPN+EN)` : "",
                `──────────────────────────────`,
                inclSoluvit   ? `Soluvit N:      ${calc.soluvitVol} mL/day → aqueous bag${calc.overfill > 1.001 ? ` (× Factor — delivers ${fmt(calc.soluvitVol*calc.deliveredFrac, 2)} mL)` : ""}` : "",
                inclPeditrace ? `Peditrace:      ${calc.peditrace_vol} mL/day → aqueous bag${calc.overfill > 1.001 ? ` (× Factor — delivers ${fmt(calc.peditrace_vol*calc.deliveredFrac, 2)} mL)` : ""}` : "",
                znPerKg > 0 ? `ZnSO₄:          ${fmt(znPerKg, 3)} mg Zn/kg → ${fmt(calc.znSO4_bag_mg, 2)} mg Zn in bag → aqueous bag (elemental Zn; its mL is not in the WFI below)` : "",
                calc.znTotal_mg > 0 ? `  Zn total ${fmt(calc.znTotal_mg, 2)} mg/day delivered (Peditrace ${fmt(calc.znPeditrace_mg, 2)} + ZnSO₄ ${fmt(calc.znSO4_mg, 2)}) · max ${D.MAX_ZN_MG_DAY} mg/day` : "",
                `Heparin:        ${heparinUmL} U/mL = ${calc.solVol.heparin} mL of ${S.heparin.unitsPerMl} U/mL`,
                `──────────────────────────────`,
                `BAG MAKE-UP:  components ${fmt(calc.componentVol, 1)} mL + WFI q.s. ${fmt(calc.wfiVol, 1)} mL = ${fmt(calc.preparedVol, 1)} mL prepared`,
                calc.wfiVol < 0 ? `  !! COMPONENTS EXCEED BAG VOLUME by ${fmt(Math.abs(calc.wfiVol), 1)} mL — cannot compound` : "",
                `──────────────────────────────`,
                calc.enVolPerKg > 0 ? `EN: ${D.EN_DB[enType]?.label} | ${enVol} mL × ${enFreq} feeds = ${fmt(calc.enVolTotal, 2)} mL/day (${fmt(calc.enVolPerKg, 0)} mL/kg/d)${isMEN ? " [MEN — not counted in fluid or nutrition]" : ""}` : "EN: None",
                `──────────────────────────────`,
                (suppVitD > 0 || suppCa > 0 || suppPO4 > 0 || suppMTV || suppFerdek > 0) ? `ENTERAL SUPPLEMENTS:` : `SUPPLEMENTS: None`,
                suppMTV    ? `  Munti-vim Drop: 1 mL/day  (D3 400 IU · Vit A 2000 IU)` : "",
                suppVitD > 0 && wtKg > 0 ? `  Vit D: ${suppVitD} IU/kg/d = ${Math.round(suppVitD * wtKg)} IU/day` : "",
                suppCa > 0 && wtKg > 0 ? `  Ca oral (${D.SUPP_DB[suppCaType]?.label}): ${suppCa} mg/kg/d = ${Math.round(suppCa * wtKg)} mg/day → ${fmt(suppCa * wtKg / (D.SUPP_DB[suppCaType]?.ca_mg_per_unit || 1), 2)} tab/day` : "",
                suppPO4 > 0 && wtKg > 0 ? `  PO₄ oral (${D.SUPP_DB[suppPO4Type]?.label}): ${suppPO4} mg/kg/d = ${fmt(suppPO4 * wtKg, 1)} mg/day → ${fmt(suppPO4 * wtKg / (D.SUPP_DB[suppPO4Type]?.po4_mg_per_ml || 1), 1)} mL/day` : "",
                suppFerdek > 0 && wtKg > 0 ? `  Fe oral (${D.SUPP_DB[suppFeType]?.label}): ${suppFerdek} mg/kg/d = ${fmt(suppFerdek * wtKg, 1)} mg/day → ${fmt(suppFerdek * wtKg / (D.SUPP_DB[suppFeType]?.fe_mg_per_ml || 1), 2)} mL/day` : "",
                (mineral.hasOral || mineral.hasIV) ? `──────────────────────────────` : "",
                (mineral.hasOral || mineral.hasIV) ? `Ca · PO₄ · Ca:P (mg/kg/d elemental):` : "",
                mineral.tpnCa > 0 || mineral.tpnP > 0 ? `  TPN (IV):         Ca ${fmt(mineral.tpnCa,0)} | P ${fmt(mineral.tpnP,0)} | ${mineral.tpnCaP > 0 ? fmt(mineral.tpnCaP,2)+":1" : "—"}` : "",
                mineral.enCa > 0 || mineral.enP > 0 ? `  EN (นม):          Ca ${fmt(mineral.enCa,0)} | P ${fmt(mineral.enP,0)}` : "",
                mineral.hasOral ? `  Oral supplement:  Ca ${fmt(mineral.oralCa,0)} | P ${fmt(mineral.oralP,0)} | ${mineral.oralCaP > 0 ? fmt(mineral.oralCaP,2)+":1" : "—"}` : "",
                (mineral.hasOral || mineral.hasIV) ? `  TOTAL:            Ca ${fmt(mineral.totCa,0)} | P ${fmt(mineral.totP,0)} | ${mineral.totCaP > 0 ? fmt(mineral.totCaP,2)+":1" : "—"} (target ${tCaP[0]}–${tCaP[1]}:1)` : "",
                `──────────────────────────────`,
                `SUMMARY: Protein ${fmt(calc.proteinKg, 1)} g/kg | Energy ${fmt(calc.kcalKg, 0)} kcal/kg | GIR ${fmt(calc.gir, 1)} mg/kg/min`,
                `Na ${fmt(calc.naTotalDelivered, 1)} mEq/kg | Ca ${fmt(calc.caKg, 0)} mg/kg | P ${fmt(calc.pKg, 0)} mg/kg  (TPN+EN — see Ca·PO₄ block above for total)`,
                scratch ? `══ NeoFeed · Calculator · ESPGHAN 2018/2022 · ไม่ได้บันทึก ══`
                        : `══ NeoFeed V2 · ESPGHAN 2018/2022 ══`,
              ].filter(l => l !== "").join("\n");

              navigator.clipboard.writeText(lines)
                .then(() => showToast("📋 Order copied to clipboard"))
                .catch(() => showToast("Copy failed — try again"));
            }}>
              📋 {scratch ? "คัดลอกผลคำนวณ" : "Copy Order to Clipboard"}
            </button>}

            {missingFields.length > 0 && (
              <div style={{ fontSize: 11.5, color: "var(--crit)", marginBottom: 8, lineHeight: 1.5 }}>
                ยังกรอกไม่ครบ ({missingFields.length}) — ต้องกรอกทุกช่องใน Step 1{centerPoint ? "" : " และ Intake / Output"} ก่อนบันทึก:
                <div style={{ fontWeight: 600 }}>{missingFields.map(f => f.label).join(" · ")}</div>
              </div>
            )}
            {zeroVolumeBag && (
              <div className="zero-volume-bag" role="alert" style={{ fontSize: 11.5, color: "var(--crit)", fontWeight: 600, marginBottom: 8, lineHeight: 1.5 }}>
                {zeroVolumeText} — บันทึก/พิมพ์ไม่ได้
              </div>
            )}
            {!scratch && (
              <button className="btn primary" style={{ width: "100%" }} disabled={saving || missingFields.length > 0 || zeroVolumeBag || pendingSave}
                onClick={handleSave}>
                <Icon name="check" size={14} color="#fff" /> {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            )}

            {/* CP has its own review → publish step and passes no onPublish. */}
            {D.ENABLE_PUBLISH_GATE && !centerPoint && !scratch && (
              <button className="btn primary" style={{ width: "100%", marginTop: 8 }}
                disabled={!savedEntryId || published || publishing || !printable}
                onClick={handlePublish}>
                <Icon name="check" size={14} color="#fff" />
                {publishing ? "กำลังส่ง..." : published ? "ส่งแล้ว" : "Submit"}
              </button>
            )}

            {savedEntryId && !pendingSave && onDelete && (
              <button className="btn" style={{ width: "100%", marginTop: 8, color: "var(--crit)", borderColor: "var(--crit-line)" }}
                onClick={handleDelete}>
                <Icon name="trash" size={14} color="var(--crit)" /> ลบบันทึกนี้
              </button>
            )}
            </div>{/* /calc-save-bar */}
          </div>
        </div>
      </div>
      {/* ── Ramathibodi PN order form — print only ── */}
      {/* Rendered only while the form matches what was saved — so neither the
          Print button nor the browser's own Ctrl+P can put unsaved numbers
          on a pharmacy order (2026-09-11 review, F2). */}
      {printable && !centerPoint && !scratch && <PrintOrderForm
        targets={{ na: tNa, k: tK, ca: tCa, p: tP, mg: tMg, source: tileRef }}
        savedMeta={savedMeta} critOverride={critOverride} orderChanges={orderChanges}
        previousDol={previousEntry ? D.entryDol(patient, previousEntry) : null}
        patient={patient} dol={dol} wtG={wtG} wtKg={wtKg} curWtG={curWtG} usingBirthWeight={usingBirthWeight}
        tpnWtManual={tpnWtManual} autoWtG={autoWtG} route={route}
        orderDate={editEntry?.ts || logDate || newOrderDate}
        dexPct={dexPct} totalTPN_mL={totalTPN_mL} entryId={savedEntryId}
        published={D.ENABLE_PUBLISH_GATE ? published : true}
        aaPerKg={aaPerKg} lipidPerKg={lipidPerKg} lipidDripHours={lipidDripHours}
        naCl={naCl} naAcet={naAcet} glycophosP={glycophosP}
        kCl={kCl} k2hpo4={k2hpo4} mgPerKg={mgPerKg} mgStrength={mgStrength} caPerKg={caPerKg}
        inclSoluvit={inclSoluvit} inclPeditrace={inclPeditrace} znPerKg={znPerKg}
        inclAddamel={inclAddamel} heparinUmL={heparinUmL} calc={calc}
        suppVitD={suppVitD} suppCa={suppCa} suppCaType={suppCaType}
        suppPO4={suppPO4} suppPO4Type={suppPO4Type}
        suppMTV={suppMTV} suppFerdek={suppFerdek} suppFeType={suppFeType}
        mineral={mineral}
      />}
    </>);

}

// ── ElecRow — compact chip-selector for electrolytes (no free-text input) ────
// values: array of choices · current: active value · onSelect: setter
// clicking active chip → deselects (sets to 0)
function ElecRow({ label, note, values, current, onSelect, wtKg, unit = "mEq/kg", solVol }) {
  const active = current > 0;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"140px 1fr auto", gap:10, alignItems:"center",
      padding:"8px 0", borderBottom:"1px dashed var(--line-2)" }}>
      <div>
        <div style={{ fontSize:12, color:"var(--ink)", fontWeight:500 }}>{label}</div>
        {note && <div style={{ fontSize:10, color:"var(--ink-3)" }}>{note}</div>}
      </div>
      <div style={{ display:"flex", gap:5, flexWrap:"wrap", alignItems:"center" }}>
        <button
          className={`preset-chip${current === 0 ? " active" : ""}`}
          style={{ fontSize:11, padding:"3px 9px", opacity: current === 0 ? 1 : 0.5 }}
          onClick={() => onSelect(0)}>—</button>
        {values.map(v => (
          <button key={v}
            className={`preset-chip${current === v ? " active" : ""}`}
            style={{ fontSize:11, padding:"3px 9px" }}
            onClick={() => onSelect(current === v ? 0 : v)}>
            {v}
          </button>
        ))}
        <span style={{ fontSize:10, color:"var(--ink-3)", marginLeft:2 }}>{unit}</span>
      </div>
      <div style={{ textAlign:"right", minWidth:90 }}>
        {active
          ? <div>
              <div className="num" style={{ fontSize:12, fontWeight:600, color:"var(--ink)" }}>
                = {fmt(current * wtKg, 1)} <span style={{ fontSize:10, color:"var(--ink-3)" }}>{unit.replace("/kg","")}/d</span>
              </div>
              {solVol > 0 && <div style={{ fontSize:10.5, color:"var(--brand-2)", fontWeight:600 }}>→ {solVol} mL/day</div>}
            </div>
          : <span style={{ fontSize:11, color:"var(--ink-4)" }}>—</span>
        }
      </div>
    </div>
  );
}

// ── Preset chips — quick-fill common values ──────────────────────
// MUST stay outside Calculator (inline definitions break focus on re-render)
function PresetChips({ values, current, onSelect, suffix = "" }) {
  return (
    <div className="preset-chips">
      {values.map(v => (
        <button key={v}
          className={`preset-chip${current === v ? " active" : ""}`}
          onClick={() => onSelect(v)}>
          {v}{suffix}
        </button>
      ))}
    </div>
  );
}

// One source row in the Step 6 Ca · PO₄ · Ca:P breakdown.
// `ratio` = null hides the ratio cell (a feed's own Ca:P isn't an order decision).
function CaPRow({ label, ca, p, ratio, highlight, total }) {
  const dim = ca === 0 && p === 0;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 0.9fr", gap: 6,
      padding: "8px 10px", alignItems: "baseline",
      borderTop: "1px solid var(--line-2)",
      background: total ? "var(--brand-bg)" : highlight ? "var(--bg-2)" : "transparent",
      fontWeight: total ? 600 : 400,
    }}>
      <span style={{ fontSize: 11.5, color: total ? "var(--brand-2)" : "var(--ink-3)" }}>{label}</span>
      <span className="num" style={{ fontSize: 12.5, textAlign: "right", color: dim ? "var(--ink-4)" : "var(--ink)" }}>{fmt(ca, 0)}</span>
      <span className="num" style={{ fontSize: 12.5, textAlign: "right", color: dim ? "var(--ink-4)" : "var(--ink)" }}>{fmt(p, 0)}</span>
      <span className="num" style={{ fontSize: 12.5, textAlign: "right", color: dim ? "var(--ink-4)" : "var(--ink)" }}>
        {ratio === null ? "—" : ratio > 0 ? `${fmt(ratio, 2)}` : "—"}
      </span>
    </div>);
}

// ── Module-level layout helpers ─────────────────────────────────
function TwoCol({ children }) {
  return (
    <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14 }}>
      {children}
    </div>
  );
}

function KcalBar({ cho, pro, fat }) {
  return (
    <div style={{ height: 22, borderRadius: 6, overflow: "hidden", display: "flex", border: "1px solid var(--line)" }}>
      <div style={{ width: `${cho}%`, background: "oklch(73.6% 0.082 80)" }} />
      <div style={{ width: `${pro}%`, background: "oklch(55% 0.13 155)" }} />
      <div style={{ width: `${fat}%`, background: "oklch(60% 0.11 25)" }} />
    </div>);

}
function KcalLegend({ color, label, pct, target }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" }}>
        <span style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />{label}
      </div>
      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, fontSize: 16, marginTop: 2 }}>{pct.toFixed(0)}%</div>
      <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{target}</div>
    </div>);

}

// ── Ramathibodi PN Order Form (print only) ──────────────────────
function PrintOrderForm({ patient, dol, wtG, wtKg, curWtG, usingBirthWeight, tpnWtManual, autoWtG, route, orderDate, dexPct, totalTPN_mL, entryId,
  aaPerKg, lipidPerKg, lipidDripHours, naCl, naAcet, glycophosP, kCl, k2hpo4, mgPerKg, mgStrength, caPerKg,
  inclSoluvit, inclPeditrace, znPerKg, inclAddamel, heparinUmL, calc,
  suppVitD, suppCa, suppCaType, suppPO4, suppPO4Type, suppMTV, suppFerdek, suppFeType,
  mineral, published, targets, savedMeta, critOverride, orderChanges, previousDol }) {
  // "Normal requirement" comes from the same targets the tiles use — it used
  // to be hard-coded form text (P 30-70, Ca 50-120, K 1-3) that contradicted
  // the calculator after the 2026-09-05 phosphorus correction (review F4).
  const rng = (r) => (r ? `${r[0]}–${r[1]}` : "—");
  const tgtNote = targets ? `NeoFeed target DOL ${dol} · ${targets.source}` : "";
  const savedAtLabel = savedAtLabelOf(savedMeta?.at);

  // Never a trailing zero on the pharmacy form (D.displayNum, 2026-09-22).
  const f  = (n, d=1) => (isFinite(n) && n > 0) ? D.displayNum(n, d) : "—";
  const f0 = (n)      => (isFinite(n) && n > 0) ? Math.round(n).toString() : "—";
  // WFI q.s. can legitimately be 0 or negative (over-filled bag) — must not print "—"
  const fSigned = (n, d=1) => D.displayNum(n, d);
  const normalizedOrderDate = D.normalizeDateStr(orderDate) || D.todayLocal();
  const orderDateLabel = new Date(`${normalizedOrderDate}T12:00:00`).toLocaleDateString("th-TH", { year:"numeric", month:"2-digit", day:"2-digit" });
  const printedAt = new Date().toLocaleDateString("th-TH", { year:"numeric", month:"2-digit", day:"2-digit" });
  const chk = (v) => v ? "☑" : "☐";
  const td  = { border:"1px solid #999", padding:"3px 6px", verticalAlign:"top", fontSize:10 };
  const tdr = { ...td, textAlign:"right" };
  const tdh = { ...td, background:"#f0f0f0", fontWeight:600, textAlign:"center" };

  return (
    <div id="print-form" style={{ position:"relative", fontFamily:"'IBM Plex Sans','Sarabun',serif", fontSize:10.5, color:"#000", padding:"4mm 6mm", display:"none" }}>

      {/* Draft watermark — printed before Submit locks the row (see the
          publish-lock design). Not shown once published, and never shown at
          all with D.ENABLE_PUBLISH_GATE off (Calculator passes published=true
          unconditionally in that case). */}
      {!published && (
        <div aria-hidden="true" style={{
          position:"absolute", top:"45%", left:"50%",
          transform:"translate(-50%, -50%) rotate(-30deg)",
          fontSize:44, fontWeight:800, color:"rgba(200,0,0,0.28)",
          letterSpacing:4, whiteSpace:"nowrap", pointerEvents:"none", zIndex:10,
        }}>รอผลแลป</div>
      )}

      {/* Header */}
      <div style={{ textAlign:"center", borderBottom:"2px solid #000", paddingBottom:4, marginBottom:6 }}>
        <div style={{ fontWeight:700, fontSize:13 }}>PEDIATRIC PARENTERAL NUTRITION ORDER FORM</div>
        <div style={{ fontSize:11 }}>กลุ่มงานเภสัชกรรม ร.พ.จุฬาลงกรณ์</div>
      </div>

      {/* Patient info row */}
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:4, fontSize:10.5 }}>
        <tbody>
          <tr>
            <td style={{ width:"45%" }}>ชื่อ: <strong>{patient?.name || patient?.initials || "—"}</strong>
              {patient?.twinSuffix && <strong> (Twin {patient.twinSuffix})</strong>}</td>
            {/* Was labeled "AN:" — read as the hospital's real Admission Number, but this
                is NeoFeed's own derived sessionId (initials+BW+twinSuffix), which can collide
                across unrelated infants (see gas-backend.gs's _sessionIdConflict). Mislabeling
                it as AN gives a pharmacist a false cross-check against the chart. */}
            <td style={{ width:"30%" }}>NeoFeed ID: <strong>{patient?.sessionId || "—"}</strong></td>
            <td>วันที่ให้ TPN: <strong>{orderDateLabel}</strong></td>
          </tr>
          {/* NeoFeed deliberately stores no HN/AN (PDPA minimisation), but
              pharmacy needs a chart identifier to dispense against — so the
              form leaves boxes for it to be written or stickered on. */}
          <tr>
            <td>HN: ______________________</td>
            <td colSpan={2}>AN: ______________________ <span style={{ fontSize:9, color:"#555" }}>(เขียน/ติดสติกเกอร์ — ตรวจตัวตนกับแฟ้มผู้ป่วย)</span></td>
          </tr>
          <tr>
            <td>DOL: <strong>{dol}</strong> &nbsp; ตึก: <strong>{patient?.currentBed || "—"}</strong></td>
            <td colSpan={2}>โรค: <strong>{patient?.diagnosis || "—"}</strong></td>
          </tr>
          <tr>
            <td>Route: {route === "central" ? <><strong>☑ Central</strong>  ☐ Peripheral</> : <>☐ Central  <strong>☑ Peripheral</strong> (&lt;900 mOsm/L)</>}</td>
            <td colSpan={2}>Weight for calculation: <strong>{f(wtKg, 3)}</strong> Kg
              {usingBirthWeight && <span style={{ fontSize:9, color:"#555" }}> (birth weight — current {curWtG}g not yet regained)</span>}
              {/* A dosing weight that is neither the scale reading nor the
                  birth-weight floor is a prescribing decision, so it prints
                  with what the automatic rule would have given — pharmacy can
                  see the difference without opening the app. */}
              {tpnWtManual && <span style={{ fontSize:9, color:"#555" }}> (กำหนดเอง — current {curWtG}g, อัตโนมัติ {autoWtG}g)</span>}</td>
          </tr>
        </tbody>
      </table>

      {/* Who saved exactly these numbers, when, and which revision — at the
          top, so pharmacy can see whom to call about the order (TPN team,
          2026-09-22). The name is the saver's own (savedByOf). */}
      <div className="print-saved-by" style={{ marginBottom:6, fontSize:10.5 }}>
        บันทึกโดย <strong>{savedMeta?.by || "—"}</strong> (ผู้สั่ง — ติดต่อ) · เวลา <strong>{savedAtLabel}</strong> · ฉบับที่ <strong>{savedMeta?.revision || 1}</strong>
      </div>

      {/* "แพทย์ยืนยันคำสั่ง" in the TPN team's words, above the critical-value
          heading. The heading's own text is unchanged: Center Point's sheet
          prints it too, and the parity check reads the alerts after it. */}
      {critOverride && (
        <div style={{ border:"2px solid #c00", color:"#c00", padding:"4px 8px", marginBottom:6, fontSize:10.5, fontWeight:700 }}>
          <div className="crit-confirmed">✔ แพทย์ยืนยันคำสั่ง (ยืนยันพร้อมเหตุผลตอนบันทึก)</div>
          ⚠ สั่งทั้งที่มีค่าวิกฤต: {critOverride.alerts.join("; ")}
          <div style={{ fontWeight:400, color:"#000" }}>เหตุผล: {critOverride.reason}</div>
        </div>
      )}

      {/* PN Fluid section */}
      <div style={{ fontWeight:700, borderBottom:"1px solid #000", marginBottom:4 }}>PARENTERAL NUTRITION FLUID:</div>
      <table style={{ width:"100%", marginBottom:4, fontSize:10.5 }}><tbody>
        <tr>
          <td>Total Volume:</td>
          <td><strong>{f(totalTPN_mL, 1)}</strong> mL (Delivered Vol.) / <strong>{f(calc.preparedVol,1)}</strong> mL (Prepared Vol.) / Day
            {calc.overfill > 1.001 && <> &nbsp;·&nbsp; ปริมาตรคาสาย <strong>{f(calc.deadVol_mL,1)}</strong> mL</>}</td>
        </tr>
        <tr>
          <td>Factor:</td>
          <td><strong>{f(calc.factor,3)}</strong>
            {calc.overfill > 1.001
              ? <> = {f(wtKg,3)} kg × {f(calc.overfill,3)} (prepared ÷ delivered) — every per-kg dose below is scaled by this</>
              : <> = weight (no overfill)</>}</td>
        </tr>
        <tr>
          <td style={{ whiteSpace:"nowrap" }}>Dextrose Final Conc.</td>
          <td><strong>{dexPct || "—"}%</strong> = <strong>{f(calc.dexG_bag,1)}</strong> g in bag = <strong>{f(calc.d50wVol,1)}</strong> mL (D50W)
            &nbsp;·&nbsp; delivered <strong>{f(calc.dexG,1)}</strong> g = <strong>{wtKg ? f(calc.dexGPerKg,2) : "—"}</strong> g/kg/d
            &nbsp;<span style={{ fontSize:9, color:"#555" }}>(max {D.MAX_DEXTROSE_G_KG} g/kg/d)</span></td>
        </tr>
        <tr>
          <td>Amino acid</td>
          <td><strong>☑ {S[calc.aaStockKey]?.label || S.aminoven10.label}</strong> = <strong>{f(aaPerKg,2)}</strong> g/kg/d = <strong>{f(calc.aaG_bag,1)}</strong> g in bag = <strong>{f(calc.solVol?.aa,1)}</strong> mL</td>
        </tr>
        <tr>
          <td>Lipid</td>
          <td><strong>☑ 20% SMOF</strong> = <strong>{f(lipidPerKg,2)}</strong> g/kg/d = <strong>{f(calc.solVol?.lipidSMOF,1)}</strong> mL &nbsp;&nbsp;
            Fat soluble vitamin &nbsp; Vitalipid N infant = <strong>{f(calc.vitalipidVol,1)}</strong> mL</td>
        </tr>
        <tr>
          <td>Lipid pump rate</td>
          <td>Bag total <strong>{f(calc.lipidBagVol,1)}</strong> mL infused over <strong>{lipidDripHours || 24}</strong> h
            = Rate <strong>{calc.lipidBagVol > 0 ? f(calc.lipidBagVol/(lipidDripHours||24),2) : "—"}</strong> mL/hr
            {/* A conversion of two figures printed on this line, so plain
                text like the Mg mg/kg one — not a dose of its own. */}
            {lipidPerKg > 0 && <span style={{ fontSize:9.5 }}> (= {f(lipidPerKg/(lipidDripHours||24), 3)} g/kg/h)</span>}</td>
        </tr>
      </tbody></table>

      {/* Electrolytes table */}
      <table style={{ width:"100%", borderCollapse:"collapse", marginTop:4, fontSize:10 }}>
        <thead>
          <tr>
            <th style={tdh} rowSpan={2}>Electrolyte</th>
            <th style={tdh} colSpan={2}>Prescribed</th>
            <th style={tdh} rowSpan={2}>Normal Requirement</th>
          </tr>
          <tr>
            <th style={tdh}>per kg<br/><span style={{fontWeight:400,fontSize:9}}>(as ordered)</span></th>
            <th style={tdh}>total per day IN BAG<br/><span style={{fontWeight:400,fontSize:9}}>(For Pharmacist — × Factor)</span></th>
          </tr>
        </thead>
        <tbody>
          {/* Na */}
          <tr>
            <td style={td}>
              <strong>1. Na⁺</strong><br/>
              {chk(naCl > 0)} {S.naCl.label} ({S.naCl.naMeqPerMl} mEq/mL)<br/>
              {chk(naAcet > 0)} Na Acetate ({S.naAcetate.naMeqPerMl} mEq/mL)<br/>
              {chk(glycophosP > 0)} Disodium glycerophosphate (Na=2 mEq/mL, P=31 mg/mL)<br/>
              <span style={{paddingLeft:12}}>Na ___ mEq &nbsp; P ___ mg</span><br/>
              Total Na
            </td>
            <td style={tdr}>
              {naCl > 0    && <><strong>{naCl}</strong> mEq<br/></>}
              {naAcet > 0  && <><strong>{naAcet}</strong> mEq<br/></>}
              {glycophosP > 0 && <><strong>{glycophosP}</strong> mL<br/></>}
              <br/>
              <strong>{f(calc.naKg,2)}</strong> mEq
            </td>
            <td style={tdr}>
              {naCl > 0    && <><strong>{f(naCl*(calc.factor||0),1)}</strong> mEq = <strong>{f(calc.solVol?.naCl,1)}</strong> mL<br/></>}
              {naAcet > 0  && <><strong>{f(naAcet*(calc.factor||0),1)}</strong> mEq = <strong>{f(calc.solVol?.naAcet,1)}</strong> mL<br/></>}
              {glycophosP > 0 && <><strong>{f(calc.solVol?.glycophos,1)}</strong> mL<br/></>}
            </td>
            <td style={td}>Na {rng(targets?.na)} mEq/kg/day<br/><span style={{ fontSize:9, color:"#555" }}>{tgtNote}</span></td>
          </tr>
          {/* K */}
          <tr>
            <td style={td}>
              <strong>2. K⁺</strong><br/>
              {chk(k2hpo4 > 0)} K₂HPO₄ (K {S.k2hpo4.kMeqPerMl} mEq/mL, P {S.k2hpo4.pMgPerKMeq} mg/mL)<br/>
              <span style={{paddingLeft:12}}>K ___ mEq &nbsp; P ___ mg</span><br/>
              {chk(kCl > 0)} KCl ({S.kCl.kMeqPerMl} mEq/mL)
            </td>
            <td style={tdr}>
              {k2hpo4 > 0 && <>K: <strong>{k2hpo4}</strong> mEq<br/>P: <strong>{f(k2hpo4*15.5,1)}</strong> mg<br/></>}
              {kCl > 0    && <><strong>{kCl}</strong> mEq<br/></>}
            </td>
            <td style={tdr}>
              {k2hpo4 > 0 && <><strong>{f(k2hpo4*(calc.factor||0),1)}</strong> mEq = <strong>{f(calc.solVol?.k2hpo4,2)}</strong> mL<br/></>}
              {kCl > 0    && <><strong>{f(kCl*(calc.factor||0),1)}</strong> mEq = <strong>{f(calc.solVol?.kCl,1)}</strong> mL<br/></>}
              {calc.kMeqPerL > 0 && <span style={{ fontSize:9, color: calc.kMeqPerL > D.MAX_K_MEQ_PER_L ? "#c00" : "#555" }}>
                {f(calc.kMeqPerL,0)} mEq/L in bag</span>}
            </td>
            <td style={td}>K⁺ {rng(targets?.k)} mEq/kg/day<br/>P {rng(targets?.p)} mg/kg/day<br/>max {D.MAX_K_MEQ_PER_L} mEq/L in bag</td>
          </tr>
          {/* Mg */}
          <tr>
            <td style={td}><strong>3. Mg⁺⁺</strong><br/>{chk(mgPerKg > 0)} MgSO₄ {mgStrength}% ({(mgStrength === "50" ? S.mgso4_50 : S.mgso4_10).mgMeqPerMl} mEq/mL)</td>
            <td style={tdr}><strong>{mgPerKg > 0 ? mgPerKg : "—"}</strong> mEq
              {mgPerKg > 0 && <><br/><span style={{ fontSize:9, color:"#555" }}>= {f(mgPerKg*D.MG_MG_PER_MEQ,1)} mg/kg</span></>}</td>
            <td style={tdr}><strong>{mgPerKg > 0 ? f(mgPerKg*(calc.factor||0),2) : "—"}</strong> mEq
              {mgPerKg > 0 && <> = <strong>{f(calc.solVol?.mg,2)}</strong> mL</>}</td>
            <td style={td}>Mg {rng(targets?.mg)} mEq/kg/day</td>
          </tr>
          {/* Ca */}
          <tr>
            <td style={td}><strong>4. Ca⁺⁺</strong><br/>{chk(caPerKg > 0)} Ca Gluconate (Elemental Ca {fmt(S.caGluconate.caMgPerMl, 1)} mg/mL)</td>
            <td style={tdr}><strong>{caPerKg > 0 ? caPerKg : "—"}</strong> mg</td>
            <td style={tdr}><strong>{caPerKg > 0 ? f0(caPerKg*(calc.factor||0)) : "—"}</strong> mg
              {caPerKg > 0 && <> = <strong>{f(calc.solVol?.ca,1)}</strong> mL</>}</td>
            <td style={td}>Ca {rng(targets?.ca)} mg/kg/day (Ca:P {D.TARGETS.caP()[0]}–{D.TARGETS.caP()[1]}:1 mass)</td>
          </tr>
          {/* Vitamins */}
          <tr>
            <td style={td}><strong>5. Multivitamin</strong><br/>{chk(inclSoluvit)} Soluvit N</td>
            <td style={{...tdr}} colSpan={2}><strong>{inclSoluvit ? f(calc.soluvitVol,1) : "—"}</strong> mL/day</td>
            <td style={td}>Soluvit N {S.soluvit.mlPerKg} mL/kg/day (max {S.soluvit.maxMl} mL/day)
              {calc.overfill > 1.001 && <div style={{ fontSize:9, color:"#a60" }}>× Factor → delivers {f(calc.soluvitVol * calc.deliveredFrac, 2)} mL (KCMH sheet G43: × actual weight)</div>}</td>
          </tr>
          {/* Trace */}
          <tr>
            <td style={td}><strong>6. Trace Element</strong><br/>{chk(inclPeditrace)} Peditrace (Zn {S.peditrace.znMgPerMl * 1000} µg/mL)</td>
            <td style={{...tdr}} colSpan={2}><strong>{inclPeditrace ? f(calc.peditrace_vol,1) : "—"}</strong> mL/day</td>
            <td style={td}>Peditrace {S.peditrace.mlPerKg} mL/kg/day (max {S.peditrace.maxMl} mL)
              {calc.overfill > 1.001 && <div style={{ fontSize:9, color:"#a60" }}>× Factor → delivers {f(calc.peditrace_vol * calc.deliveredFrac, 2)} mL (KCMH sheet G45: × actual weight)</div>}</td>
          </tr>
          {/* The paper form's "ZnSO₄ (Additional to the above)" line: per kg
              as ordered, and the bag's amount × Factor. Elemental Zn, said
              outright — a ZnSO₄ salt figure would be ~4.4× higher. Pharmacy's
              ZnSO₄ stock is not in KCMH_STOCK, so its mL is not in the WFI
              below. The delivered total with Peditrace is plain text: a sum of
              figures on this form, not a dose (TPN team, 2026-09-22). */}
          <tr>
            <td style={td}>{chk(znPerKg > 0)} ZnSO₄ (Additional to the above)<br/><span style={{ fontSize:9 }}>elemental Zn</span></td>
            <td style={tdr}><strong>{znPerKg > 0 ? f(znPerKg, 3) : "—"}</strong> mg Zn/kg</td>
            <td style={tdr}><strong>{znPerKg > 0 ? f(calc.znSO4_bag_mg, 2) : "—"}</strong> mg Zn
              {znPerKg > 0 && <div style={{ fontSize:9, color:"#a60" }}>ปริมาตร ZnSO₄ ไม่ได้รวมใน WFI — หักตามที่ใส่จริง</div>}</td>
            <td style={td}>Zn รวม {f(calc.znTotal_mg, 2)} mg/day{wtKg > 0 && calc.znTotal_mg > 0 ? ` (${f(calc.znTotal_mg / wtKg, 2)} mg/kg/d)` : ""} · max {D.MAX_ZN_MG_DAY} mg/day</td>
          </tr>
          {/* Heparin */}
          <tr>
            <td style={td}><strong>7. Heparin</strong> ({S.heparin.unitsPerMl} unit/mL)</td>
            <td style={{...tdr}} colSpan={2}><strong>{heparinUmL}</strong> unit/mL = <strong>{f(calc.solVol?.heparin,2)}</strong> mL/day</td>
            <td style={td}>0.5-1 unit/mL</td>
          </tr>
          {/* Bag make-up — the sheet's J52 / I53 */}
          <tr>
            <td style={td}><strong>Bag make-up</strong><br/>Water for injection q.s.</td>
            <td style={{...tdr}} colSpan={2}>
              Components <strong>{f(calc.componentVol,1)}</strong> mL + WFI <strong style={{ color: calc.wfiVol < 0 ? "#c00" : "#000" }}>{fSigned(calc.wfiVol,1)}</strong> mL
              &nbsp;=&nbsp; <strong>{f(calc.preparedVol,1)}</strong> mL prepared
              {calc.wfiVol < 0 && <div style={{ color:"#c00", fontWeight:700 }}>เกินปริมาตรถุง {f(Math.abs(calc.wfiVol),1)} mL</div>}
            </td>
            <td style={td}>Lipid + Vitalipid are a separate syringe — not in this sum</td>
          </tr>
          {/* Enteral Supplements */}
          {(suppMTV || suppVitD > 0 || suppCa > 0 || suppPO4 > 0 || suppFerdek > 0) && (<>
          <tr><td style={{...td, fontWeight:700, background:"#f0f0f0", fontSize:10.5}} colSpan={4}>ENTERAL SUPPLEMENTS (oral / เข้าทางอาหาร)</td></tr>
          {suppMTV && <tr>
            <td style={td}>{chk(true)} Munti-vim Drop</td>
            <td style={{...tdr}} colSpan={2}><strong>1</strong> mL/day</td>
            <td style={td}>D3 400 IU · Vit A 2000 IU · B-complex · Vit C 40 mg</td>
          </tr>}
          {suppVitD > 0 && <tr>
            <td style={td}>{chk(true)} Vitamin D drops</td>
            <td style={tdr}><strong>{suppVitD}</strong> IU/kg/d</td>
            <td style={tdr}><strong>{Math.round(suppVitD * (wtKg||0))}</strong> IU/day</td>
            <td style={td}>ESPGHAN 2022: 400–700 IU/kg/day</td>
          </tr>}
          {suppCa > 0 && <tr>
            <td style={td}>{chk(true)} Ca oral<br/><em>{D.SUPP_DB[suppCaType]?.label}</em></td>
            <td style={tdr}><strong>{suppCa}</strong> mg/kg/d</td>
            <td style={tdr}><strong>{f0(suppCa*(wtKg||0))}</strong> mg → {f(suppCa*(wtKg||0)/(D.SUPP_DB[suppCaType]?.ca_mg_per_unit||1),2)} tab/day</td>
            <td style={td}>ESPGHAN: 120–200 mg/kg/day</td>
          </tr>}
          {suppPO4 > 0 && <tr>
            <td style={td}>{chk(true)} PO₄ oral<br/><em>{D.SUPP_DB[suppPO4Type]?.label}</em></td>
            <td style={tdr}><strong>{suppPO4}</strong> mg/kg/d</td>
            <td style={tdr}><strong>{f0(suppPO4*(wtKg||0))}</strong> mg → {f(suppPO4*(wtKg||0)/(D.SUPP_DB[suppPO4Type]?.po4_mg_per_ml||1),1)} mL/day</td>
            <td style={td}>ESPGHAN: 2.2–3.7 mmol/kg/day (~68–115 mg/kg/day)</td>
          </tr>}
          {suppFerdek > 0 && <tr>
            <td style={td}>{chk(true)} Fe oral<br/><em>{D.SUPP_DB[suppFeType]?.label}</em></td>
            <td style={tdr}><strong>{suppFerdek}</strong> mg/kg/d</td>
            <td style={tdr}><strong>{f(suppFerdek*(wtKg||0),1)}</strong> mg → {f(suppFerdek*(wtKg||0)/(D.SUPP_DB[suppFeType]?.fe_mg_per_ml||1),2)} mL/day</td>
            <td style={td}>ESPGHAN 2022: 2–3 mg/kg/day</td>
          </tr>}
          </>)}
          {/* Combined Ca · PO₄ · Ca:P — the summary bar below shows TPN+EN only,
              so oral supplement would otherwise be missing from the ratio. */}
          {mineral && (mineral.hasOral || mineral.hasIV) && (<>
          <tr><td style={{...td, fontWeight:700, background:"#f0f0f0", fontSize:10.5}} colSpan={4}>Ca · PO₄ · Ca:P (mg/kg/day elemental)</td></tr>
          <tr>
            <td style={td}>TPN (IV)</td>
            <td style={tdr}>Ca <strong>{f0(mineral.tpnCa)}</strong></td>
            <td style={tdr}>PO₄ <strong>{f0(mineral.tpnP)}</strong></td>
            <td style={td}>Ca:P {isFinite(mineral.tpnCaP) && mineral.tpnCaP > 0 ? `${fmt(mineral.tpnCaP, 2)}:1` : mineral.tpnCaP > 0 ? "!! (Ca, no P)" : "—"}</td>
          </tr>
          {(mineral.enCa > 0 || mineral.enP > 0) && <tr>
            <td style={td}>EN (นม)</td>
            <td style={tdr}>Ca <strong>{f0(mineral.enCa)}</strong></td>
            <td style={tdr}>PO₄ <strong>{f0(mineral.enP)}</strong></td>
            <td style={td}>—</td>
          </tr>}
          {mineral.hasOral && <tr>
            <td style={td}>Oral supplement</td>
            <td style={tdr}>Ca <strong>{f0(mineral.oralCa)}</strong></td>
            <td style={tdr}>PO₄ <strong>{f0(mineral.oralP)}</strong></td>
            <td style={td}>Ca:P {isFinite(mineral.oralCaP) && mineral.oralCaP > 0 ? `${fmt(mineral.oralCaP, 2)}:1` : mineral.oralCaP > 0 ? "!! (Ca, no P)" : "—"}</td>
          </tr>}
          <tr>
            <td style={{...td, fontWeight:700}}>รวมทั้งหมด</td>
            <td style={tdr}>Ca <strong>{f0(mineral.totCa)}</strong></td>
            <td style={tdr}>PO₄ <strong>{f0(mineral.totP)}</strong></td>
            <td style={{...td, fontWeight:700}}>Ca:P {isFinite(mineral.totCaP) && mineral.totCaP > 0 ? `${fmt(mineral.totCaP, 2)}:1` : mineral.totCaP > 0 ? "!! (Ca, no P)" : "—"} (target {D.TARGETS.caP()[0]}–{D.TARGETS.caP()[1]}:1)</td>
          </tr>
          </>)}
        </tbody>
      </table>

      {/* ── องค์ประกอบที่ผู้ป่วยได้รับ — what actually reaches the infant ──────
          The worksheet's rows 83–98: every bag amount × delivered ÷ prepared.
          Because the bag was overfilled by the same ratio, these come back to
          the ordered per-kg doses — printing them is the ward's cross-check
          that the Factor was applied correctly.                              */}
      <div style={{ fontWeight:700, borderBottom:"1px solid #000", marginTop:8, marginBottom:4 }}>
        องค์ประกอบที่ผู้ป่วยได้รับ / DELIVERED IN {f(totalTPN_mL,1)} mL
        {calc.overfill > 1.001 && <span style={{ fontWeight:400, fontSize:9.5 }}> &nbsp;(= bag × {f(calc.deliveredFrac,3)})</span>}
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}><tbody>
        <tr>
          <td style={td}>Dextrose <strong>{f(calc.dexG,1)}</strong> g</td>
          <td style={td}>Amino acid <strong>{f(calc.aaG,1)}</strong> g = <strong>{f(aaPerKg,2)}</strong> g/kg</td>
          {/* TPN-only kcal and its own per-kg, then the TPN+EN total — the old
              line paired a TPN-only numerator with a TPN+EN per-kg (F6). */}
          <td style={td}>Energy (TPN) <strong>{f0(calc.tpnKcal)}</strong> kcal = <strong>{wtKg ? f0(calc.tpnKcal / wtKg) : "—"}</strong> kcal/kg
            {calc.enKcal > 0 && <> · total incl. EN <strong>{f0(calc.kcalKg)}</strong> kcal/kg</>}</td>
        </tr>
        <tr>
          <td style={td}>Na⁺ <strong>{f(calc.naKg*(wtKg||0),2)}</strong> mEq = <strong>{f(calc.naKg,2)}</strong> mEq/kg</td>
          <td style={td}>K⁺ <strong>{f(calc.kKg*(wtKg||0),2)}</strong> mEq = <strong>{f(calc.kKg,2)}</strong> mEq/kg</td>
          <td style={td}>Mg²⁺ <strong>{f(mgPerKg*(wtKg||0),2)}</strong> mEq = <strong>{f(mgPerKg,2)}</strong> mEq/kg
            {mgPerKg > 0 && <> (<strong>{f(mgPerKg*D.MG_MG_PER_MEQ,1)}</strong> mg/kg)</>}</td>
        </tr>
        <tr>
          <td style={td}>Ca²⁺ <strong>{f0(caPerKg*(wtKg||0))}</strong> mg = <strong>{f0(caPerKg)}</strong> mg/kg</td>
          <td style={td}>Phosphate <strong>{f0(calc.pTotal_mg)}</strong> mg</td>
          <td style={td}>Osmolarity <strong>{calc.osm ? calc.osm.toFixed(0) : "—"}</strong> mOsm/L</td>
        </tr>
      </tbody></table>

      {/* Summary bar */}
      <div style={{ marginTop:6, padding:"4px 8px", border:"1px solid #ccc", fontSize:10, background:"#fafafa" }}>
        GIR {f(calc.gir,1)} mg/kg/min · Protein {f(calc.proteinKg,2)} g/kg/d · Energy {f0(calc.kcalKg)} kcal/kg/d ·
        Na {f(calc.naKg,2)} mEq/kg · Ca:P {f(calc.caP,2)}:1 (TPN+EN) · Osm {calc.osm ? calc.osm.toFixed(0) : "—"} mOsm/L
      </div>

      {/* Changes vs the previous order — the pharmacist's fastest cross-check */}
      {orderChanges && (
        <div style={{ marginTop:6, padding:"4px 8px", border:"1px dashed #999", fontSize:9.5 }}>
          <strong>เปลี่ยนแปลงจากคำสั่ง DOL {previousDol ?? "ก่อนหน้า"}:</strong>{" "}
          {orderChanges.length === 0 ? "ไม่มีการเปลี่ยนแปลง"
            : orderChanges.map(c => `${c.label} ${c.from}→${c.to}${c.unit ? " " + c.unit : ""}`).join(" · ")}
        </div>
      )}

      {/* Signature */}
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:14 }}>
        <div>แพทย์ ................................................................</div>
        <div>รหัส ................................</div>
      </div>

      {/* Provenance footer — which values produced the figures above, and
          which Daily_Log row they came from. Deliberately small and last:
          it is for the person reconciling an order after the fact, not for
          the person signing it. The parent only renders this form after a
          successful save, so every printable order has a backing row. */}
      <div style={{ marginTop:8, paddingTop:4, borderTop:"1px solid #ccc",
        fontSize:8, color:"#555", display:"flex", justifyContent:"space-between" }}>
        <span>NeoFeed · constants {D.CONSTANTS_VERSION} · app {D.appVersion()}</span>
        <span>entry {entryId || "(unsaved)"} · printed {printedAt}</span>
      </div>
    </div>
  );
}

window.Calculator = Calculator;
