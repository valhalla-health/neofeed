// ============================================================
// TPN + Enteral Calculator — input-led, inline live results
// ============================================================
const { useState, useMemo } = React;
const D = window.NEOFEED_DATA;
// KCMH pharmacy stock strengths — every mL/day conversion resolves through this
const S = D.KCMH_STOCK;

// Format: max `d` decimals, strip trailing zeros by default (e.g. 1.0 -> "1", 1.25 -> "1.3").
// Pass keepZeros=true for values compared side-by-side at fixed precision (e.g. a Ca:P
// ratio column) — otherwise a round total (1.70) reads as less precise than its
// neighbors (1.72, 1.67) even though all three are rounded to the same 2 decimals.
// Positive Infinity = nutrient-without-counterpart (e.g. Ca with no P) → show "!!"
const fmt = (n, d = 1, keepZeros = false) => {
  if (n === null) return "—";
  if (n === Infinity) return "!!";
  if (!isFinite(n)) return "—";
  const p = Math.pow(10, d);
  const r = Math.round(n * p) / p;
  return keepZeros ? r.toFixed(d) : String(r);
};

function NumField({ label, unit, value, onChange, step = 1, min = 0, hint }) {
  const [raw, setRaw] = React.useState(value ? String(value) : "");
  const focusedRef = React.useRef(false);
  React.useEffect(() => {
    if (focusedRef.current) return;
    setRaw(value ? String(value) : "");
  }, [value]);
  const handle = (e) => {
    // Every field here is a physical clinical quantity (weight/volume/rate/
    // dose/%) — none are legitimately negative, so "-" isn't in the allowed
    // charset at all (rather than allowing it then clamping after parse,
    // which would still let a bad value slip through onChange transiently).
    let s = e.target.value.replace(/[^0-9.]/g, "");
    const firstDot = s.indexOf(".");
    if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
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
        onBlur={() => { focusedRef.current = false; }} />
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

function Tile({ label, value, unit, decimals = 1, target, status, max, optimal, exact }) {
  const display = fmt(value, decimals, exact); // fmt handles Infinity → "!!", null → "—"
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

function SaltRow({ label, note, perKg, onChange, wtKg, unit = "mEq/kg/d" }) {
  const [raw, setRaw] = React.useState(perKg ? String(perKg) : "");
  const focusedRef = React.useRef(false);
  React.useEffect(() => {
    if (focusedRef.current) return;
    setRaw(perKg ? String(perKg) : "");
  }, [perKg]);
  const handle = (e) => {
    let s = e.target.value.replace(/[^0-9.\-]/g, "");
    const fd = s.indexOf("."); if (fd !== -1) s = s.slice(0, fd + 1) + s.slice(fd + 1).replace(/\./g, "");
    setRaw(s);
    const v = parseFloat(s);
    onChange(isNaN(v) ? 0 : v);
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
          ? <><span className="num" style={{ color: "var(--ink)", fontWeight: 600, fontSize: 12 }}>= {fmt(perKg * wtKg, 1)}</span> {unit.replace("/kg/d", "/d").replace("/kg","")}</>
          : <span style={{ color:"var(--ink-4)", fontSize:10 }}>{perKg > 0 ? `${perKg} ${unit.split("/")[0]}/kg` : "—"}</span>
        }
      </div>
    </div>);
}

// ============================================================
// Calculator
// ============================================================
function Calculator({ patient, dol, editEntry, baselineEntry, logDate, onLog, onUpdate, onSaved, onWeightChange }) {
  const [wtG, setWtG] = useState(0);

  // Set alongside setWtG whenever the prefill effect below applies a historical
  // weight (edit or baseline) — tells the propagation effect to skip that one
  // change so a stale/past weight never flashes into the PatientStrip header
  // before the user has looked at or touched the field.
  const skipWeightPropagateRef = React.useRef(false);

  // Skip while editing a past entry, or for the one wtG update caused by
  // baseline-prefill — that weight is historical, not the patient's current
  // weight, and must not overwrite the PatientStrip display.
  React.useEffect(() => {
    if (editEntry || !onWeightChange || wtG <= 0) return;
    if (skipWeightPropagateRef.current) { skipWeightPropagateRef.current = false; return; }
    onWeightChange(wtG);
  }, [wtG, editEntry]);
  const wtKg = wtG / 1000;

  // Card key 1 — Fluid plan (displayed as Step 1)
  const [fluidTargetPerKg, setFluidTargetPerKg] = useState(0);
  const [otherIV_mL, setOtherIV_mL] = useState(0);
  const [drug_mL, setDrug_mL] = useState(0);

  // Card key 2 — TPN main bag (displayed as Step 3)
  const [route, setRoute] = useState("central");
  const [totalTPN_mL, setTotalTPN_mL] = useState(0); // mL/day DELIVERED to the infant (sheet C7)
  // Extra volume compounded that never reaches the infant — it stays in the giving
  // set (ปริมาตรคาสาย, sheet G8). Pharmacy prepares totalTPN_mL + this (sheet G7).
  // 0 = no overfill, which is how NeoFeed behaved before the Factor existed.
  const [deadVol_mL, setDeadVol_mL] = useState(0);
  const [dexPct, setDexPct] = useState(0);
  const [aaPerKg, setAaPerKg] = useState(0);
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
  const [conflict, setConflict] = useState(null); // {lastModified, lastModifiedBy} of the row on the server

  // Hydrates the full raw-input form from a saved entry's calcInput — shared
  // by "editing an entry" and "starting today from the latest entry" below,
  // since both need the exact same field-by-field restoration.
  const applyCalcInput = (src, fallbackWeight) => {
    setWtG(src.wtG ?? fallbackWeight ?? 0);
    setFluidTargetPerKg(src.fluidTargetPerKg ?? 0);
    setOtherIV_mL(src.otherIV_mL ?? 0);
    setDrug_mL(src.drug_mL ?? 0);
    setRoute(src.route ?? "central");
    setTotalTPN_mL(src.totalTPN_mL ?? 0);
    setDeadVol_mL(src.deadVol_mL ?? 0);
    setDexPct(src.dexPct ?? 0);
    setAaPerKg(src.aaPerKg ?? 0);
    setLipidPerKg(src.lipidPerKg ?? 0);
    setLipidDripHours(src.lipidDripHours ?? 24);
    setNaCl(src.naCl ?? 0);
    setNaAcet(src.naAcet ?? 0);
    setGlycophosP(src.glycophosP ?? 0);
    setKCl(src.kCl ?? 0);
    setK2HPO4(src.k2hpo4 ?? 0);
    setMgPerKg(src.mgPerKg ?? 0);
    setMgStrength(src.mgStrength ?? "10");
    setCaPerKg(src.caPerKg ?? 0);
    setExtraP_mg_kg(src.extraP_mg_kg ?? 0);
    setEnType(src.enType ?? "BM_20");
    setEnVol(src.enVol ?? 0);
    setEnFreq(src.enFreq ?? 0);
    setIsMEN(src.isMEN ?? false);
    setInclSoluvit(src.inclSoluvit ?? true);
    setInclPeditrace(src.inclPeditrace ?? true);
    setInclAddamel(src.inclAddamel ?? false);
    setHeparinUmL(src.heparinUmL ?? 1);
    setSuppVitD(src.suppVitD ?? 0);
    setSuppCa(src.suppCa ?? 0);
    setSuppCaType(src.suppCaType ?? "CA_CACO3_350");
    setSuppPO4(src.suppPO4 ?? 0);
    setSuppPO4Type(src.suppPO4Type ?? "PO4_PHOSPHATE");
    setSuppMTV(src.suppMTV ?? false);
    setSuppFerdek(src.suppFerdek ?? 0);
    setSuppFeType(src.suppFeType ?? "FE_FERDEK");
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
  React.useEffect(() => {
    if (!patient?.sessionId) return;

    // Re-sync the saved-row identity to the current editEntry every time patient
    // or editEntry changes — a patient switch while this component stays mounted
    // (e.g. via the header "Switch patient" picker, without leaving the Calculator
    // view) must not leave a stale entryId/lastModified pointing at the previous
    // patient's row, which would misdirect the next save.
    setSavedEntryId(editEntry?.entryId || null);
    setSavedLastModified(editEntry?.lastModified || null);
    setConflict(null);

    if (editEntry) {
      applyCalcInput(editEntry.calcInput || {}, editEntry.weight);
      setPrefilledFrom(null);
      return;
    }

    if (baselineEntry) {
      skipWeightPropagateRef.current = true;
      applyCalcInput(baselineEntry.calcInput || {}, baselineEntry.weight);
      setPrefilledFrom({ dol: baselineEntry.dol, baseline: true });
      return;
    }

    let restored = null;
    try {
      const raw = localStorage.getItem(`neofeed_calc_${patient.sessionId}`);
      if (raw) restored = JSON.parse(raw);
    } catch {}

    const lastWt = D.lastWeighed(patient);
    const wtDefault = restored?.wtG ?? lastWt?.w ?? patient.bw ?? 0;
    const fluidRange = D.TARGETS.fluid(dol, wtDefault || patient.bw || 1000);
    const fluidDefault = Math.round((fluidRange[0] + fluidRange[1]) / 2);

    setWtG(wtDefault);
    setFluidTargetPerKg(restored?.fluidTargetPerKg ?? fluidDefault);
    setOtherIV_mL(restored?.otherIV_mL ?? 0);
    setDrug_mL(restored?.drug_mL ?? 0);
    setRoute(restored?.route ?? "central");
    setTotalTPN_mL(restored?.totalTPN_mL ?? 0);
    setDeadVol_mL(restored?.deadVol_mL ?? 0);
    setDexPct(restored?.dexPct ?? 0);
    setAaPerKg(restored?.aaPerKg ?? 0);
    setLipidPerKg(restored?.lipidPerKg ?? 0);
    setLipidDripHours(restored?.lipidDripHours ?? 24);
    setNaCl(restored?.naCl ?? 0);
    setNaAcet(restored?.naAcet ?? 0);
    setGlycophosP(restored?.glycophosP ?? 0);
    setKCl(restored?.kCl ?? 0);
    setK2HPO4(restored?.k2hpo4 ?? 0);
    setMgPerKg(restored?.mgPerKg ?? 0);
    setMgStrength(restored?.mgStrength ?? "10");
    setCaPerKg(restored?.caPerKg ?? 0);
    setExtraP_mg_kg(restored?.extraP_mg_kg ?? 0);
    setEnType(restored?.enType ?? "BM_20");
    setEnVol(restored?.enVol ?? 0);
    setEnFreq(restored?.enFreq ?? 0);
    setIsMEN(restored?.isMEN ?? false);
    setInclSoluvit(restored?.inclSoluvit ?? true);
    setInclPeditrace(restored?.inclPeditrace ?? true);
    setInclAddamel(restored?.inclAddamel ?? false);
    setHeparinUmL(restored?.heparinUmL ?? 1);
    setSuppVitD(restored?.suppVitD ?? 0);
    setSuppCa(restored?.suppCa ?? 0);
    setSuppCaType(restored?.suppCaType ?? "CA_CACO3_350");
    setSuppPO4(restored?.suppPO4 ?? 0);
    setSuppPO4Type(restored?.suppPO4Type ?? "PO4_PHOSPHATE");
    setSuppMTV(restored?.suppMTV ?? false);
    setSuppFerdek(restored?.suppFerdek ?? 0);
    setSuppFeType(restored?.suppFeType ?? "FE_FERDEK");

    if (restored?.savedAt) {
      setPrefilledFrom({ savedAt: restored.savedAt, dol: restored.dol });
    } else {
      setPrefilledFrom(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.sessionId, editEntry]);

  // Helper to bundle current input state for persistence
  const captureState = () => ({
    wtG, fluidTargetPerKg, otherIV_mL, drug_mL,
    route, totalTPN_mL, deadVol_mL, dexPct, aaPerKg, lipidPerKg, lipidDripHours,
    naCl, naAcet, glycophosP, kCl, k2hpo4, mgPerKg, mgStrength, caPerKg, extraP_mg_kg,
    enType, enVol, enFreq, isMEN,
    inclSoluvit, inclPeditrace, inclAddamel, heparinUmL,
    suppVitD, suppCa, suppCaType, suppPO4, suppPO4Type, suppMTV, suppFerdek, suppFeType,
    dol, savedAt: new Date().toISOString(),
  });
  const toggleStep = (n) => setOpenSteps(prev => {
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });

  // ── Print handler — opens all steps, prints, then restores ─────
  React.useEffect(() => {
    const ALL = new Set([1, 2, 3, 4, 5, 6]);
    const handler = () => {
      setOpenSteps(ALL);
      // Wait one frame for React to render all card-b sections
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.print();
        window.onafterprint = () => setOpenSteps(new Set([1]));
      }));
    };
    document.addEventListener('__neofeed_print', handler);
    return () => document.removeEventListener('__neofeed_print', handler);
  }, []);

  // ===== compute =====
  const calc = useMemo(() => {
    if (!wtKg) {
      const en0 = D.EN_DB[enType];
      const sv0 = { naCl:0, naAcet:0, glycophos:0, kCl:0, k2hpo4:0, ca:0, mg:0,
        mg10:0, mg50:0, heparin:0, aaAminoven:0, lipidSMOF:0 };
      return { wtKg:0, totalTPN_mL, lipidVol:0, lipidBagVol:0, vitalipidVol:0,
        enVolTotal:0, enVolPerKg:0, enKcal:0, enCounted:0, en:en0, useEnteralTargets:false,
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
        preparedVol: totalTPN_mL + deadVol_mL, deadVol_mL, overfill:1, factor:0,
        deliveredFrac:1, dexG_bag:0, aaG_bag:0,
        bag:{ na_mEq:0, k_mEq:0, ca_mg:0, mg_mEq:0, p_mg:0, heparin_units:0 },
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
    const preparedVol = totalTPN_mL + deadVol_mL;
    const overfill = totalTPN_mL > 0 ? preparedVol / totalTPN_mL : 1;   // G7/C7
    const factor = wtKg * overfill;                                     // H9
    const deliveredFrac = overfill > 0 ? 1 / overfill : 1;              // C7/G7

    const aaG = aaPerKg * wtKg;          // DELIVERED g/day — drives protein + kcal
    const aaG_bag = aaPerKg * factor;    // IN THE BAG (sheet F11) — drives Aminoven mL
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
    const enKcal = enVolTotal / 100 * en.kcal;
    const enProteinG = enVolTotal / 100 * en.pro;
    const enLipidG = enVolTotal / 100 * en.fat;
    const useEnteralTargets = enVolPerKg >= 100;

    // Fluid
    const targetFluid_mLd = fluidTargetPerKg * wtKg;
    const enCounted = isMEN ? 0 : enVolTotal;
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
    const kcalCho = (dexKcal + enVolTotal / 100 * en.cho * 4) / wtKg;
    const kcalPro = (aaKcal + enProteinG * 4) / wtKg;
    const kcalFat = (lipidKcal + enLipidG * 9) / wtKg;
    const kcalProtPct = kcalKg > 0 ? kcalPro / kcalKg * 100 : 0;
    const kcalFatPct = kcalKg > 0 ? kcalFat / kcalKg * 100 : 0;
    const kcalChoPct = kcalKg > 0 ? kcalCho / kcalKg * 100 : 0;

    const nonProteinKcal = totalKcal - totalProteinG * 4;
    const npeN = totalProteinG > 0 ? nonProteinKcal / totalProteinG : 0;
    const peRatio = totalKcal > 0 ? totalProteinG / totalKcal * 100 : 0;

    const naFromEN = en.na * enVolTotal / 100 / wtKg;
    const kFromEN = en.k * enVolTotal / 100 / wtKg;
    const caFromEN = en.ca * enVolTotal / 100 / wtKg;
    const pFromEN = en.p * enVolTotal / 100 / wtKg;

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
    // Both 1 mL/kg/day per the KCMH sheet (B43, B45), capped at 10 / 15 mL.
    // NOTE: these deliberately use ACTUAL weight, not the Factor — the sheet's
    // compounding rows G43/G45/G46 are `× C6` while every electrolyte row is
    // `× H9`. So with overfill the infant receives only `deliveredFrac` of the
    // 1 mL/kg (surfaced as an alert below rather than silently "corrected").
    const soluvitVol    = inclSoluvit   ? parseFloat(Math.min(S.soluvit.mlPerKg   * wtKg, S.soluvit.maxMl  ).toFixed(1)) : 0;
    const peditrace_vol = inclPeditrace ? parseFloat(Math.min(S.peditrace.mlPerKg * wtKg, S.peditrace.maxMl).toFixed(1)) : 0;

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
      aaAminoven:r1(aaG_bag / S.aminoven10.gPerMl),
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
      d50wVol + solVol.aaAminoven + solVol.naCl + solVol.naAcet + solVol.glycophos +
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
      enVolTotal, enVolPerKg, enKcal, enCounted, en, useEnteralTargets,
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
    };
  }, [wtG, wtKg, fluidTargetPerKg, otherIV_mL, drug_mL,
  totalTPN_mL, deadVol_mL, dexPct, aaPerKg, lipidPerKg,
  naCl, naAcet, glycophosP, kCl, k2hpo4, mgPerKg, mgStrength, caPerKg, extraP_mg_kg,
  enType, enVol, enFreq, isMEN,
  // `route` is deliberately NOT a dependency — the memo never reads it. It is
  // used afterwards for sOsm and the saved entry's route string. Listing it
  // recomputed the whole memo on every central/peripheral toggle.
  inclSoluvit, inclPeditrace, heparinUmL]);

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

  // Non-protein energy per g amino acid — ESPGHAN 2018: 30–40 kcal/g AA
  // (was [24, 32] — corrected: minimum 30 kcal/g for adequate AA utilisation)
  const tNPE = D.TARGETS.npePerGAA();     // [30, 40]

  // Protein:Energy ratio — ESPGHAN 2022: 2.8–3.6 g protein/100 kcal
  // (was [2.5, 3.5] — updated to 2022 lean mass accretion target)
  const tPE  = D.TARGETS.peRatio();       // [2.8, 3.6]

  const sFluid = D.rangeStatus(calc.totalFluidPerKg, tFluid); // no hardHi — attending discretion, may go >200
  const sGir = D.rangeStatus(calc.gir, tGir, { hardHi: 13 });
  const sPro = D.rangeStatus(calc.proteinKg, tPro, { hardHi: 4.8 });
  const sKcal = D.rangeStatus(calc.kcalKg, tKcal);
  const sLip = D.rangeStatus(calc.lipidKgTotal, tLip, { hardHi: 4.5 });
  const sNa = D.rangeStatus(calc.naTotalDelivered, tNa);
  const sK = D.rangeStatus(calc.kTotalDelivered, tK, { hardHi: 3.5 });
  const sCa = D.rangeStatus(calc.caKg, tCa);
  const sP = D.rangeStatus(calc.pKg, tP);
  const sCaP = D.rangeStatus(calc.caP, tCaP);
  // Step 6 total-intake statuses — same targets as Step 4, applied to IV + feed + oral
  const sTotCa  = D.rangeStatus(mineral.totCa, tCa);
  const sTotP   = D.rangeStatus(mineral.totP, tP);
  const sTotCaP = D.rangeStatus(mineral.totCaP, tCaP);
  const sNPE = D.rangeStatus(calc.npeN, tNPE);
  const sPE = D.rangeStatus(calc.peRatio, tPE);
  // Peripheral: crit >900, warn >850 · Central: warn >1600 (endothelial risk), no hard limit
  const sOsm = route === "peripheral"
    ? (calc.osm > 900 ? "crit" : calc.osm > 850 ? "warn" : "ok")
    : (calc.osm > 1800 ? "warn" : "ok");

  const alerts = [];
  if (calc.totalTPN_mL > 0 && sGir === "crit") alerts.push({ level: "crit", title: "GIR critically high", body: `${calc.gir.toFixed(1)} mg/kg/min — lower dextrose %.`, ref: "ESPGHAN 2018" });else
  if (calc.totalTPN_mL > 0 && sGir === "warn") alerts.push({ level: "warn", title: "GIR off target", body: `${calc.gir.toFixed(1)} — aim ${tGir[0]}–${tGir[1]}.`, ref: "ESPGHAN" });
  if (calc.totalKcal > 0 && sNPE === "warn") alerts.push({ level: "warn", title: "NPE:AA off target", body: `${calc.npeN.toFixed(0)} kcal/g protein — aim ${tNPE[0]}–${tNPE[1]} kcal/g AA (ESPGHAN 2018).`, ref: "ESPGHAN 2018" });
  if (calc.pTotal_mg > 0 && sCaP === "warn") alerts.push({ level: "warn", title: "Ca:P ratio off target", body: `Mass ratio ${calc.caP.toFixed(2)} — aim ${tCaP[0]}–${tCaP[1]}:1 (molar 0.8–1.3:1 ESPGHAN 2018).`, ref: "ESPGHAN 2018" });
  // Oral supplement changes the picture the Step 4 tile shows — flag the combined total separately
  if (mineral.hasOral && sTotCaP === "crit") alerts.push({ level: "crit", title: "Ca:P ratio (รวม oral supp) — ไม่มี P", body: `Ca ${fmt(mineral.totCa, 0)} mg/kg/d แต่ P รวม = 0 — เสี่ยง metabolic bone disease.`, ref: "ESPGHAN 2018" });else
  if (mineral.hasOral && sTotCaP === "warn") alerts.push({ level: "warn", title: "Ca:P ratio (รวม oral supp) off target", body: `รวม TPN + EN + oral = ${fmt(mineral.totCaP, 2, true)}:1 (mass) — aim ${tCaP[0]}–${tCaP[1]}:1.`, ref: "ESPGHAN 2018" });
  if (calc.totalTPN_mL > 0 && sOsm === "crit") alerts.push({ level: "crit", title: "Osmolarity > peripheral limit", body: `${calc.osm.toFixed(0)} mOsm/L — switch to central.`, ref: "Safety" });
  if (calc.totalTPN_mL > 0 && Math.abs(calc.totalFluidPerKg - fluidTargetPerKg) > 20) alerts.push({ level: "info", title: "Fluid: prescribed ≠ target", body: `Prescribed ${calc.totalFluidPerKg.toFixed(0)} vs plan ${fluidTargetPerKg} mL/kg/d — attending discretion`, ref: "Plan" });
  // ── KCMH worksheet hard ceilings (F9, G25) + compoundability ──────────────
  if (calc.dexGPerKg > D.MAX_DEXTROSE_G_KG) alerts.push({ level: "crit", title: "Dextrose over KCMH max", body: `${calc.dexGPerKg.toFixed(1)} g/kg/d — sheet limit is ${D.MAX_DEXTROSE_G_KG} g/kg/d. Lower dextrose % or bag volume.`, ref: "KCMH TPN worksheet" });
  if (calc.kMeqPerL > D.MAX_K_MEQ_PER_L) alerts.push({ level: "crit", title: "K⁺ concentration too high", body: `${calc.kMeqPerL.toFixed(0)} mEq/L — max ${D.MAX_K_MEQ_PER_L} mEq/L in the bag. Increase volume or reduce K.`, ref: "KCMH TPN worksheet" });
  if (calc.totalTPN_mL > 0 && calc.wfiVol < 0) alerts.push({ level: "crit", title: "Bag cannot be compounded", body: `Components total ${calc.componentVol.toFixed(1)} mL but the prepared bag is only ${calc.preparedVol.toFixed(1)} mL — over by ${Math.abs(calc.wfiVol).toFixed(1)} mL.`, ref: "WFI q.s." });
  // Vitamins/TE are compounded on actual weight (sheet G43/G45/G46 use C6, not
  // H9), so an overfilled bag under-delivers them. Surfaced, not auto-corrected.
  if (calc.overfill > 1.001 && (inclSoluvit || inclPeditrace)) alerts.push({ level: "info", title: "Vitamins / trace elements not overfill-scaled", body: `Bag is overfilled ×${calc.overfill.toFixed(2)}, but Soluvit/Peditrace are dosed on actual weight per the KCMH sheet — the infant receives ${(calc.deliveredFrac * 100).toFixed(0)}% of the 1 mL/kg (${fmt(calc.soluvitVol * calc.deliveredFrac, 2)} / ${fmt(calc.peditrace_vol * calc.deliveredFrac, 2)} mL). Electrolytes and AA are scaled.`, ref: "KCMH TPN worksheet" });

  // TwoCol is defined at module level (below) — do NOT define inside Calculator
  // (inline component definitions cause React to unmount/remount on every render → focus lost)

  // ── Save (draft or submit) — creates a new row the first time, then updates
  // that same row for every further save in this visit. calcInput carries the
  // exact raw inputs so this entry stays editable on any device later.
  const handleSave = async () => {
    if (saving) return;
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
      dol, weight: wtG, fluid: calc.totalFluidPerKg, gir: calc.gir,
      pro: calc.proteinKg, kcal: calc.kcalKg, na: calc.naTotalDelivered, k: calc.kTotalDelivered,
      ca: calc.caKg, p: calc.pKg, enVolPerKg: calc.enVolPerKg,
      // Route reflects what was actually delivered, not just the IV-access toggle —
      // a fully-weaned-to-EN day (totalTPN_mL === 0) must not be logged as "TPN ...".
      route: calc.totalTPN_mL > 0
        ? (route === "central" ? "TPN central" : "TPN peripheral")
        : (calc.enVolPerKg > 0 ? "Enteral only" : "NPO"),
      status: "submitted", ..._suppPayload, calcInput: captureState(),
      // Editing must keep the entry's original calendar date; a brand-new entry
      // is stamped with today's date unless the user picked a back-date (logDate).
      ...(editEntry ? { ts: editEntry.ts } : logDate ? { ts: logDate } : {}),
    };

    setSaving(true);
    const res = savedEntryId
      ? await onUpdate(savedEntryId, savedLastModified, entry)
      : await onLog(entry);
    setSaving(false);

    if (res.conflict) { setConflict(res.current); return; }
    if (!res.ok) return; // gasPost already surfaced an error toast

    if (!savedEntryId) setSavedEntryId(res.entryId);
    setSavedLastModified(res.lastModified);
    onSaved && onSaved();
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
          </span>
          <div style={{ display:"flex", gap:6, marginLeft:"auto" }}>
            <button className="btn sm" onClick={() => setConflict(null)}>แก้ไขต่อ</button>
            <button className="btn sm primary" onClick={() => window.location.reload()}>โหลดข้อมูลล่าสุด</button>
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
          <div className="s1-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr) 1.4fr", gap: 12, alignItems: "stretch" }}>
            <div>
              <NumField label="Target fluid" unit="mL/kg/d" value={fluidTargetPerKg} onChange={setFluidTargetPerKg} step={5}
                hint={`= ${fmt(fluidTargetPerKg * wtKg, 0)} mL/d · attending discretion`} />
              <PresetChips values={[60, 80, 100, 120, 150]} current={fluidTargetPerKg} onSelect={setFluidTargetPerKg} />
            </div>
            <NumField label="Other IV" unit="mL/d" value={otherIV_mL} onChange={setOtherIV_mL} step={1}
              hint={`= ${fmt(otherIV_mL / wtKg, 1)} mL/kg/d`} />
            <NumField label="Drug volume" unit="mL/d" value={drug_mL} onChange={setDrug_mL} step={1}
              hint={`= ${fmt(drug_mL / wtKg, 1)} mL/kg/d`} />
            <NumField label="Current weight" unit="g" value={wtG} onChange={setWtG} step={5} />
            <div style={{ padding: "10px 14px", borderRadius: 8,
              background: Math.abs(calc.remaining) < 1 ? "var(--ok-bg)" : calc.remaining < -10 ? "oklch(96% 0.04 25)" : "var(--brand-bg)",
              border: `1px solid ${Math.abs(calc.remaining) < 1 ? "var(--ok-line)" : calc.remaining < -10 ? "oklch(60% 0.13 25)" : "var(--brand-line)"}`,
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
        </div></div>
      </div>

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
              {calc.enVolPerKg >= 100 && <span className="step-summary-chip" style={{ color:"var(--ok)" }}>Full EN ✅</span>}
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
                    hint="Volume not counted in fluid total" />
                </div>
              </div>

              {/* Full feeds status */}
              {calc.enVolPerKg >= 100 && (
                <div style={{ padding: "8px 10px", background: "var(--ok-bg)", border: "1px solid var(--ok-line)",
                  borderRadius: 6, fontSize: 11.5, color: "var(--ok)", marginTop: 8, fontWeight: 600 }}>
                  ✅ Full EN ≥100 mL/kg/d — wean PN · ESPGHAN 2022 EN targets active
                </div>
              )}

              <div style={{ marginTop: 10, padding: 10, background: "var(--bg-2)", borderRadius: 6 }}>
                <div style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.05, marginBottom: 6 }}>Delivered per kg from EN</div>
                <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: "var(--ink-2)", flexWrap: "nowrap", overflowX: "auto" }}>
                  <span style={{ whiteSpace: "nowrap" }}>kcal <span className="num" style={{ fontWeight: 600, color: "var(--ink)" }}>{fmt(calc.enKcal / wtKg, 0)}</span></span>
                  <span style={{ whiteSpace: "nowrap" }}>pro <span className="num" style={{ fontWeight: 600, color: "var(--ink)" }}>{fmt(calc.enVolTotal / 100 * calc.en.pro / wtKg, 1)}</span></span>
                  <span style={{ whiteSpace: "nowrap" }}>Na <span className="num" style={{ fontWeight: 600, color: "var(--ink)" }}>{fmt(calc.enVolTotal / 100 * calc.en.na / wtKg, 1)}</span></span>
                  <span style={{ whiteSpace: "nowrap" }}>K <span className="num" style={{ fontWeight: 600, color: "var(--ink)" }}>{fmt(calc.enVolTotal / 100 * calc.en.k / wtKg, 1)}</span></span>
                  <span style={{ whiteSpace: "nowrap" }}>Ca <span className="num" style={{ fontWeight: 600, color: "var(--ink)" }}>{fmt(calc.enVolTotal / 100 * calc.en.ca / wtKg, 0)}</span></span>
                  <span style={{ whiteSpace: "nowrap" }}>P <span className="num" style={{ fontWeight: 600, color: "var(--ink)" }}>{fmt(calc.enVolTotal / 100 * calc.en.p / wtKg, 0)}</span></span>
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
              {calc.enVolPerKg > 100 &&
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
              {lipidPerKg > 0 && <span className="step-summary-chip">Lip {(calc.lipidBagVol/lipidDripHours).toFixed(2)} mL/hr</span>}
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
                <NumField label="Rate" unit="mL/hr"
                  value={parseFloat((totalTPN_mL/24).toFixed(2))}
                  onChange={(r) => setTotalTPN_mL(r * 24)} step={0.05}
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
                    hint={deadVol_mL > 0 ? "stays in the line" : "0 = no overfill"} />
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
                      ? `${calc.dexG.toFixed(1)} g/d delivered · ${calc.dexGPerKg.toFixed(1)} g/kg/d (max ${D.MAX_DEXTROSE_G_KG})${calc.overfill > 1.001 ? ` · ${calc.dexG_bag.toFixed(1)} g in bag` : ""}`
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
                  <NumField label="Amino acid (Aminoven 10%)" unit="g/kg/d" value={aaPerKg} onChange={setAaPerKg} step={0.1} />
                  <PresetChips values={[1.5, 2, 2.5, 3, 3.5]} current={aaPerKg} onSelect={setAaPerKg} />
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
                  <div className="num" style={{ fontWeight:700, fontSize:15 }}>{fmt(calc.solVol.aaAminoven,1)} mL/day</div>
                </div>
              </div>

              {/* ── Bag make-up: components vs WFI q.s. ──────────────────────
                  Mirrors the KCMH worksheet's "Total volume (mL)" (J52) and
                  "WFI q.s." (I53). Updates live as Step 4 / Step 5 change.  */}
              {totalTPN_mL > 0 && (
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
              color:"oklch(45% 0.13 65)", display:"flex", alignItems:"center", gap:6 }}>
              🫙 Lipid Pump — separate pump
            </div>
            <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>

              {/* Rate — the pump-facing number, always front and center */}
              <div style={{ background:"linear-gradient(180deg,oklch(96.5% 0.04 75),#fff 70%)",
                border:"1.5px solid var(--warn-line)", borderRadius:8, padding:"10px 14px",
                position:"relative", overflow:"hidden",
                display:"flex", flexWrap:"wrap", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                <div style={{ position:"absolute", left:0, top:0, bottom:0, width:3, background:"oklch(55% 0.15 65)" }} />
                <div>
                  <div style={{ fontSize:10, color:"var(--ink-3)", fontWeight:600, letterSpacing:"0.04em" }}>PUMP RATE</div>
                  <div className="num" style={{ fontSize:30, fontWeight:700, lineHeight:1.15, color:"oklch(38% 0.14 65)" }}>
                    {calc.lipidBagVol > 0 ? (calc.lipidBagVol/lipidDripHours).toFixed(2) : "—"}
                    <span style={{ fontSize:13, color:"var(--ink-3)", marginLeft:5, fontWeight:400 }}>mL/hr</span>
                  </div>
                  <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:1 }}>
                    {fmt(calc.lipidBagVol,1)} mL/day over {lipidDripHours} h
                  </div>
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
            <Tile label="Osmolarity" value={calc.osm} unit=" mOsm/L" target={route==="peripheral"?[0,900]:[0,1600]} status={sOsm} decimals={0} max={route==="peripheral"?1100:2200} />
          </div>

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
              {calc.solVol.naCl > 0 && <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>→ {calc.solVol.naCl} mL/d</div>}

              <SaltRow label={S.naAcetate.label} note={`metabolic acidosis · ${S.naAcetate.naMeqPerMl} mEq Na/mL`} perKg={naAcet} onChange={setNaAcet} wtKg={wtKg} />
              <PresetChips values={[1, 2, 3, 4]} current={naAcet} onSelect={setNaAcet} />
              {calc.solVol.naAcet > 0 && <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>→ {calc.solVol.naAcet} mL/d</div>}

              <SaltRow label="Glycophos®" note="Na input mEq/kg · 1 mL = 2 mEq Na, P 31 mg/mL"
                perKg={glycophosP * 2} onChange={(v) => setGlycophosP(v / 2)} wtKg={wtKg} unit="mEq Na/kg" />
              <PresetChips values={[1, 2, 3, 4]} current={glycophosP * 2} onSelect={(v) => setGlycophosP(v / 2)} />
              {glycophosP > 0 && (
                <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>
                  → {fmt(calc.solVol.glycophos,1)} mL/d · P {fmt(glycophosP*31,0)} mg/kg/d
                </div>
              )}

              {/* ── K ── */}
              <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.05, margin: "12px 0 4px" }}>K (mEq/kg)</div>
              <SaltRow label={S.kCl.label} note={`${S.kCl.kMeqPerMl} mEq K/mL`} perKg={kCl} onChange={setKCl} wtKg={wtKg} />
              <PresetChips values={[1, 2, 3, 4]} current={kCl} onSelect={setKCl} />
              {calc.solVol.kCl > 0 && <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>→ {calc.solVol.kCl} mL/d</div>}

              <SaltRow label="K₂HPO₄" note="1 mEq K/mL · P 15.5 mg/mEq K" perKg={k2hpo4} onChange={setK2HPO4} wtKg={wtKg} />
              <PresetChips values={[1, 2, 3, 4]} current={k2hpo4} onSelect={setK2HPO4} />
              {calc.solVol.k2hpo4 > 0 && <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>→ {calc.solVol.k2hpo4} mL/d</div>}

              {/* ── Mg · Ca ── */}
              <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.05, margin: "12px 0 4px" }}>Mg (mEq/kg) · Ca (mg/kg)</div>
              <SaltRow label="MgSO₄" note={`${(mgStrength === "50" ? S.mgso4_50 : S.mgso4_10).mgMeqPerMl} mEq/mL`} perKg={mgPerKg} onChange={setMgPerKg} wtKg={wtKg} />
              <PresetChips values={[0.2, 0.4, 0.6]} current={mgPerKg} onSelect={setMgPerKg} />
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

              <SaltRow label={S.caGluconate.label} note={`Elemental Ca ${S.caGluconate.caMgPerMl.toFixed(1)} mg/mL · Ca:P ~1.7:1`} perKg={caPerKg} onChange={setCaPerKg} wtKg={wtKg} unit="mg/kg/d" />
              <PresetChips values={[32, 60, 80, 100]} current={caPerKg} onSelect={setCaPerKg} />
              {calc.solVol.ca > 0 && <div style={{ fontSize:10.5, color:"var(--brand-2)", paddingLeft:2, marginTop:1, marginBottom:3 }}>→ {calc.solVol.ca} mL/d</div>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Tile label="Sodium" value={calc.naTotalDelivered} unit=" mEq/kg/d" target={tNa} status={sNa} decimals={1} max={7} />
              <Tile label="Potassium" value={calc.kTotalDelivered} unit=" mEq/kg/d" target={tK} status={sK} decimals={1} max={4} />
              {/* Bag K⁺ concentration — the sheet's G25 ceiling, not a per-kg dose */}
              {calc.kMeqPerL > 0 && (
                <div style={{ marginTop:-4, fontSize:10.5, textAlign:"right",
                  color: calc.kMeqPerL > D.MAX_K_MEQ_PER_L ? "var(--crit)" : "var(--ink-3)",
                  fontWeight: calc.kMeqPerL > D.MAX_K_MEQ_PER_L ? 700 : 400 }}>
                  in bag: {fmt(calc.kMeqPerL,0)} mEq/L (max {D.MAX_K_MEQ_PER_L})
                </div>
              )}
              <Tile label="Calcium" value={calc.caKg} unit=" mg/kg/d" target={tCa} status={sCa} decimals={0} max={140} />
              <Tile label="Phosphorus" value={calc.pKg} unit=" mg/kg/d" target={tP} status={sP} decimals={0} max={90} />
              <Tile label="Ca:P ratio" value={calc.caP} unit=":1 (mass)" target={tCaP} status={sCaP} decimals={2} max={2.5} exact />
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
                hint={inclSoluvit ? `${fmt(calc.soluvitVol, 1)} mL/day  ·  ${S.soluvit.mlPerKg} mL/kg/day (max ${S.soluvit.maxMl} mL/day) · add to aqueous PN` : "Not included"} />

              <div className="sub-h" style={{ marginTop: 14 }}>6. Trace Elements</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Chk label={`Peditrace (Zn ${S.peditrace.znMgPerMl * 1000} µg/mL)`} value={inclPeditrace} onChange={setInclPeditrace}
                  hint={inclPeditrace ? `${fmt(calc.peditrace_vol, 1)} mL/day  ·  ${S.peditrace.mlPerKg} mL/kg/day (max ${S.peditrace.maxMl} mL) · add to aqueous PN` : "Not included"} />
              </div>

              <div className="sub-h" style={{ marginTop: 14 }}>7. Heparin</div>
              <NumField label="Heparin" unit="U/mL" value={heparinUmL} onChange={setHeparinUmL} step={0.5}
                hint={`Normal 0.5–1 U/mL · total ${fmt(heparinUmL * totalTPN_mL, 0)} U/day → ${fmt(calc.solVol.heparin, 2)} mL of ${S.heparin.unitsPerMl} U/mL`} />
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
              <KcalLegend color="oklch(75% 0.13 80)" label="CHO" pct={calc.kcalChoPct} target="45–55%" />
              <KcalLegend color="oklch(55% 0.13 155)" label="Protein" pct={calc.kcalProtPct} target="10–15%" />
              <KcalLegend color="oklch(60% 0.11 25)" label="Fat" pct={calc.kcalFatPct} target="35–45%" />
            </div>
            <div style={{ marginTop: 12, borderTop: "1px solid var(--line-2)", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-3)" }}>
              <span>TPN <span className="num" style={{ color: "var(--ink)" }}>{calc.tpnKcal.toFixed(0)}</span></span>
              <span>EN <span className="num" style={{ color: "var(--ink)" }}>{calc.enKcal.toFixed(0)}</span></span>
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
                <div><div className="title">All targets within range</div><div className="body">No safety flags for current prescription.</div></div>
              </div> :
            alerts.slice(0, 4).map((a, i) =>
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
          <div className="card-h"><Icon name="save" size={14} color="var(--brand)" /> Save + Copy Order</div>
          <div className="card-b">
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 10 }}>
              <span className="num">{patient?.name || patient?.initials || "—"}</span> · DOL <span className="num">{dol}</span> · {wtG}g · {route === "central" ? "Central" : "Peripheral"}
            </div>

            {/* Save bar — sticky on mobile */}
            <div className="calc-save-bar">
            {/* Copy order text to clipboard */}
            <button className="btn" style={{ width: "100%", marginBottom: 8 }} onClick={() => {
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
                `══ NeoFeed V2 — TPN Order ══`,
                `Patient: ${patient?.name||"—"} | DOL: ${dol} | Wt: ${wtG}g | Session: ${patient?.sessionId||"—"}`,
                `Route: ${route === "central" ? "Central" : "Peripheral (<900 mOsm/L)"}`,
                `Osm: ${calc.osm.toFixed(0)} mOsm/L`,
                `──────────────────────────────`,
                `FLUID: Target ${fluidTargetPerKg} mL/kg/d = ${(fluidTargetPerKg*calc.wtKg).toFixed(0)} mL/day`,
                `  TPN aqueous: ${totalTPN_mL.toFixed(1)} mL/day delivered → Rate ${(totalTPN_mL/24).toFixed(2)} mL/hr`,
                calc.overfill > 1.001
                  ? `  PREPARE:     ${calc.preparedVol.toFixed(1)} mL/day (+${deadVol_mL.toFixed(1)} mL ปริมาตรคาสาย) · Factor ${calc.factor.toFixed(3)} = ${calc.wtKg.toFixed(3)} kg × ${calc.overfill.toFixed(3)}`
                  : `  PREPARE:     ${calc.preparedVol.toFixed(1)} mL/day (no overfill)`,
                `  Lipid bag:   ${calc.lipidBagVol.toFixed(1)} mL/day over ${lipidDripHours}h → Rate ${(calc.lipidBagVol/lipidDripHours).toFixed(2)} mL/hr`,
                `  Prescribed:  ${calc.prescribedFluid.toFixed(0)} mL/day | Remaining: ${calc.remaining.toFixed(1)} mL`,
                `──────────────────────────────`,
                `DEXTROSE: ${dexPct}% → D50W ${calc.d50wVol} mL/day | ${calc.dexG_bag.toFixed(1)} g in bag, ${calc.dexG.toFixed(1)} g delivered = ${calc.dexGPerKg.toFixed(1)} g/kg/d (max ${D.MAX_DEXTROSE_G_KG})`,
                `  GIR: ${calc.gir.toFixed(1)} mg/kg/min`,
                `AA (Aminoven 10%): ${aaPerKg} g/kg/d → ${calc.aaG_bag.toFixed(1)} g in bag = ${calc.solVol.aaAminoven} mL/day (${calc.aaG.toFixed(1)} g delivered)`,
                `Lipid (SMOF 20%): ${lipidPerKg} g/kg/d = ${calc.lipidG.toFixed(1)} g/d → ${calc.solVol.lipidSMOF} mL/day`,
                `Vitalipid N Infant: ${calc.vitalipidVol.toFixed(1)} mL/day → lipid bag`,
                `──────────────────────────────`,
                `ELECTROLYTES (ordered per kg → amount IN BAG → mL of stock):`,
                naCl>0 ? `  ${S.naCl.label}:    ${naCl} mEq/kg → ${(naCl*calc.factor).toFixed(1)} mEq → ${calc.solVol.naCl} mL` : "",
                naAcet>0 ? `  Na Acetate:   ${naAcet} mEq/kg → ${(naAcet*calc.factor).toFixed(1)} mEq → ${calc.solVol.naAcet} mL` : "",
                glycophosP>0 ? `  Glycophos®:   ${glycophosP} mL/kg → ${calc.solVol.glycophos} mL (Na ${(glycophosP*2*calc.factor).toFixed(1)} mEq | P ${(glycophosP*31*calc.factor).toFixed(0)} mg)` : "",
                `  Total Na:     ${calc.bag.na_mEq.toFixed(1)} mEq in bag = ${calc.naKg.toFixed(1)} mEq/kg/d delivered`,
                kCl>0 ? `  KCl (${S.kCl.kMeqPerMl} mEq/mL): ${kCl} mEq/kg → ${(kCl*calc.factor).toFixed(1)} mEq → ${calc.solVol.kCl} mL` : "",
                k2hpo4>0 ? `  K2HPO4:       ${k2hpo4} mEq/kg → ${(k2hpo4*calc.factor).toFixed(1)} mEq → ${calc.solVol.k2hpo4} mL (P ${(k2hpo4*15.5*calc.factor).toFixed(0)} mg)` : "",
                `  Total K:      ${calc.bag.k_mEq.toFixed(1)} mEq in bag = ${calc.kKg.toFixed(1)} mEq/kg/d delivered (${calc.kMeqPerL.toFixed(0)} mEq/L, max ${D.MAX_K_MEQ_PER_L})`,
                caPerKg>0 ? `  Ca-gluconate: ${caPerKg} mg/kg → ${(caPerKg*calc.factor).toFixed(0)} mg → ${calc.solVol.ca} mL` : "",
                mgPerKg>0 ? `  MgSO4 ${mgStrength}%:    ${mgPerKg} mEq/kg → ${(mgPerKg*calc.factor).toFixed(2)} mEq → ${calc.solVol.mg} mL` : "",
                calc.caP > 0 ? `  Ca:P ratio:   ${isFinite(calc.caP) ? calc.caP.toFixed(2) : "!! (Ca ordered, P = 0)"}:1 (mass, TPN+EN)` : "",
                `──────────────────────────────`,
                inclSoluvit   ? `Soluvit N:      ${calc.soluvitVol} mL/day → aqueous bag${calc.overfill > 1.001 ? ` (not × Factor — delivers ${(calc.soluvitVol*calc.deliveredFrac).toFixed(2)} mL)` : ""}` : "",
                inclPeditrace ? `Peditrace:      ${calc.peditrace_vol} mL/day → aqueous bag${calc.overfill > 1.001 ? ` (not × Factor — delivers ${(calc.peditrace_vol*calc.deliveredFrac).toFixed(2)} mL)` : ""}` : "",
                `Heparin:        ${heparinUmL} U/mL = ${calc.solVol.heparin} mL of ${S.heparin.unitsPerMl} U/mL`,
                `──────────────────────────────`,
                `BAG MAKE-UP:  components ${calc.componentVol.toFixed(1)} mL + WFI q.s. ${calc.wfiVol.toFixed(1)} mL = ${calc.preparedVol.toFixed(1)} mL prepared`,
                calc.wfiVol < 0 ? `  !! COMPONENTS EXCEED BAG VOLUME by ${Math.abs(calc.wfiVol).toFixed(1)} mL — cannot compound` : "",
                `──────────────────────────────`,
                calc.enVolPerKg > 0 ? `EN: ${D.EN_DB[enType]?.label} | ${enVol} mL × ${enFreq} feeds = ${calc.enVolTotal} mL/day (${calc.enVolPerKg.toFixed(0)} mL/kg/d)${isMEN ? " [MEN — not counted in fluid]" : ""}` : "EN: None",
                `──────────────────────────────`,
                (suppVitD > 0 || suppCa > 0 || suppPO4 > 0 || suppMTV || suppFerdek > 0) ? `ENTERAL SUPPLEMENTS:` : `SUPPLEMENTS: None`,
                suppMTV    ? `  Munti-vim Drop: 1 mL/day  (D3 400 IU · Vit A 2000 IU)` : "",
                suppVitD > 0 && wtKg > 0 ? `  Vit D: ${suppVitD} IU/kg/d = ${Math.round(suppVitD * wtKg)} IU/day` : "",
                suppCa > 0 && wtKg > 0 ? `  Ca oral (${D.SUPP_DB[suppCaType]?.label}): ${suppCa} mg/kg/d = ${Math.round(suppCa * wtKg)} mg/day → ${fmt(suppCa * wtKg / (D.SUPP_DB[suppCaType]?.ca_mg_per_unit || 1), 2)} tab/day` : "",
                suppPO4 > 0 && wtKg > 0 ? `  PO₄ oral (${D.SUPP_DB[suppPO4Type]?.label}): ${suppPO4} mg/kg/d = ${fmt(suppPO4 * wtKg, 1)} mg/day → ${fmt(suppPO4 * wtKg / (D.SUPP_DB[suppPO4Type]?.po4_mg_per_ml || 1), 1)} mL/day` : "",
                suppFerdek > 0 && wtKg > 0 ? `  Fe oral (${D.SUPP_DB[suppFeType]?.label}): ${suppFerdek} mg/kg/d = ${fmt(suppFerdek * wtKg, 1)} mg/day → ${fmt(suppFerdek * wtKg / (D.SUPP_DB[suppFeType]?.fe_mg_per_ml || 1), 2)} mL/day` : "",
                (mineral.hasOral || mineral.hasIV) ? `──────────────────────────────` : "",
                (mineral.hasOral || mineral.hasIV) ? `Ca · PO₄ · Ca:P (mg/kg/d elemental):` : "",
                mineral.tpnCa > 0 || mineral.tpnP > 0 ? `  TPN (IV):         Ca ${fmt(mineral.tpnCa,0)} | P ${fmt(mineral.tpnP,0)} | ${mineral.tpnCaP > 0 ? fmt(mineral.tpnCaP,2,true)+":1" : "—"}` : "",
                mineral.enCa > 0 || mineral.enP > 0 ? `  EN (นม):          Ca ${fmt(mineral.enCa,0)} | P ${fmt(mineral.enP,0)}` : "",
                mineral.hasOral ? `  Oral supplement:  Ca ${fmt(mineral.oralCa,0)} | P ${fmt(mineral.oralP,0)} | ${mineral.oralCaP > 0 ? fmt(mineral.oralCaP,2,true)+":1" : "—"}` : "",
                (mineral.hasOral || mineral.hasIV) ? `  TOTAL:            Ca ${fmt(mineral.totCa,0)} | P ${fmt(mineral.totP,0)} | ${mineral.totCaP > 0 ? fmt(mineral.totCaP,2,true)+":1" : "—"} (target ${tCaP[0]}–${tCaP[1]}:1)` : "",
                `──────────────────────────────`,
                `SUMMARY: Protein ${calc.proteinKg.toFixed(1)} g/kg | Energy ${calc.kcalKg.toFixed(0)} kcal/kg | GIR ${calc.gir.toFixed(1)} mg/kg/min`,
                `Na ${calc.naTotalDelivered.toFixed(1)} mEq/kg | Ca ${calc.caKg.toFixed(0)} mg/kg | P ${calc.pKg.toFixed(0)} mg/kg  (TPN+EN — see Ca·PO₄ block above for total)`,
                `══ NeoFeed V2 · ESPGHAN 2018/2022 ══`,
              ].filter(l => l !== "").join("\n");

              navigator.clipboard.writeText(lines)
                .then(() => showToast("📋 Order copied to clipboard"))
                .catch(() => showToast("Copy failed — try again"));
            }}>
              📋 Copy Order to Clipboard
            </button>

            <button className="btn primary" style={{ width: "100%" }} disabled={saving}
              onClick={handleSave}>
              <Icon name="check" size={14} color="#fff" /> {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            </div>{/* /calc-save-bar */}
          </div>
        </div>
      </div>
      {/* ── Ramathibodi PN order form — print only ── */}
      <PrintOrderForm
        patient={patient} dol={dol} wtG={wtG} wtKg={wtKg} route={route}
        dexPct={dexPct} totalTPN_mL={totalTPN_mL}
        aaPerKg={aaPerKg} lipidPerKg={lipidPerKg} lipidDripHours={lipidDripHours}
        naCl={naCl} naAcet={naAcet} glycophosP={glycophosP}
        kCl={kCl} k2hpo4={k2hpo4} mgPerKg={mgPerKg} mgStrength={mgStrength} caPerKg={caPerKg}
        inclSoluvit={inclSoluvit} inclPeditrace={inclPeditrace}
        inclAddamel={inclAddamel} heparinUmL={heparinUmL} calc={calc}
        suppVitD={suppVitD} suppCa={suppCa} suppCaType={suppCaType}
        suppPO4={suppPO4} suppPO4Type={suppPO4Type}
        suppMTV={suppMTV} suppFerdek={suppFerdek} suppFeType={suppFeType}
        mineral={mineral}
      />
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
                = {(current * wtKg).toFixed(1)} <span style={{ fontSize:10, color:"var(--ink-3)" }}>{unit.replace("/kg","")}/d</span>
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
        {ratio === null ? "—" : ratio > 0 ? `${fmt(ratio, 2, true)}` : "—"}
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
      <div style={{ width: `${cho}%`, background: "oklch(75% 0.13 80)" }} />
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
function PrintOrderForm({ patient, dol, wtG, wtKg, route, dexPct, totalTPN_mL,
  aaPerKg, lipidPerKg, lipidDripHours, naCl, naAcet, glycophosP, kCl, k2hpo4, mgPerKg, mgStrength, caPerKg,
  inclSoluvit, inclPeditrace, inclAddamel, heparinUmL, calc,
  suppVitD, suppCa, suppCaType, suppPO4, suppPO4Type, suppMTV, suppFerdek, suppFeType,
  mineral }) {

  const f  = (n, d=1) => (isFinite(n) && n > 0) ? Number(n.toFixed(d)).toString() : "—";
  const f0 = (n)      => (isFinite(n) && n > 0) ? Math.round(n).toString() : "—";
  // WFI q.s. can legitimately be 0 or negative (over-filled bag) — must not print "—"
  const fSigned = (n, d=1) => isFinite(n) ? Number(n.toFixed(d)).toString() : "—";
  const today = new Date().toLocaleDateString("th-TH", { year:"numeric", month:"2-digit", day:"2-digit" });
  const chk = (v) => v ? "☑" : "☐";
  const td  = { border:"1px solid #999", padding:"3px 6px", verticalAlign:"top", fontSize:10 };
  const tdr = { ...td, textAlign:"right" };
  const tdh = { ...td, background:"#f0f0f0", fontWeight:600, textAlign:"center" };

  return (
    <div id="print-form" style={{ fontFamily:"'IBM Plex Sans','Sarabun',serif", fontSize:10.5, color:"#000", padding:"4mm 6mm", display:"none" }}>

      {/* Header */}
      <div style={{ textAlign:"center", borderBottom:"2px solid #000", paddingBottom:4, marginBottom:6 }}>
        <div style={{ fontWeight:700, fontSize:13 }}>PEDIATRIC PARENTERAL NUTRITION ORDER FORM</div>
        <div style={{ fontSize:11 }}>กลุ่มงานเภสัชกรรม ร.พ.จุฬาลงกรณ์</div>
      </div>

      {/* Patient info row */}
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:4, fontSize:10.5 }}>
        <tbody>
          <tr>
            <td style={{ width:"45%" }}>ชื่อ: <strong>{patient?.name || patient?.initials || "—"}</strong></td>
            <td style={{ width:"30%" }}>AN: <strong>{patient?.sessionId || "—"}</strong></td>
            <td>วันที่ให้ TPN: <strong>{today}</strong></td>
          </tr>
          <tr>
            <td>DOL: <strong>{dol}</strong> &nbsp; ตึก: <strong>{patient?.currentBed || "—"}</strong></td>
            <td colSpan={2}>โรค: <strong>{patient?.diagnosis || "—"}</strong></td>
          </tr>
          <tr>
            <td>Route: {route === "central" ? <><strong>☑ Central</strong>  ☐ Peripheral</> : <>☐ Central  <strong>☑ Peripheral</strong> (&lt;900 mOsm/L)</>}</td>
            <td colSpan={2}>Weight for calculation: <strong>{wtKg ? wtKg.toFixed(3) : "—"}</strong> Kg</td>
          </tr>
        </tbody>
      </table>

      {/* PN Fluid section */}
      <div style={{ fontWeight:700, borderBottom:"1px solid #000", marginBottom:4 }}>PARENTERAL NUTRITION FLUID:</div>
      <table style={{ width:"100%", marginBottom:4, fontSize:10.5 }}><tbody>
        <tr>
          <td>Total Volume:</td>
          <td><strong>{totalTPN_mL ? totalTPN_mL.toFixed(1) : "—"}</strong> mL (Delivered Vol.) / <strong>{f(calc.preparedVol,1)}</strong> mL (Prepared Vol.) / Day
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
          <td><strong>☑ 10% Aminoven infant</strong> = <strong>{f(aaPerKg,2)}</strong> g/kg/d = <strong>{f(calc.aaG_bag,1)}</strong> g in bag = <strong>{f(calc.solVol?.aaAminoven,1)}</strong> mL</td>
        </tr>
        <tr>
          <td>Lipid</td>
          <td><strong>☑ 20% SMOF</strong> = <strong>{f(lipidPerKg,2)}</strong> g/kg/d = <strong>{f(calc.solVol?.lipidSMOF,1)}</strong> mL &nbsp;&nbsp;
            Fat soluble vitamin &nbsp; Vitalipid N infant = <strong>{f(calc.vitalipidVol,1)}</strong> mL</td>
        </tr>
        <tr>
          <td>Lipid pump rate</td>
          <td>Bag total <strong>{f(calc.lipidBagVol,1)}</strong> mL infused over <strong>{lipidDripHours || 24}</strong> h
            = Rate <strong>{calc.lipidBagVol > 0 ? f(calc.lipidBagVol/(lipidDripHours||24),2) : "—"}</strong> mL/hr</td>
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
            <td style={td}>Na 2-5 mEq/kg/day<br/>(increase requirement in preterm)</td>
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
            <td style={td}>K⁺ 1-3 mEq/kg/day<br/>P preterm 30-70 mg/kg/day<br/>max {D.MAX_K_MEQ_PER_L} mEq/L in bag</td>
          </tr>
          {/* Mg */}
          <tr>
            <td style={td}><strong>3. Mg⁺⁺</strong><br/>{chk(mgPerKg > 0)} MgSO₄ {mgStrength}% ({(mgStrength === "50" ? S.mgso4_50 : S.mgso4_10).mgMeqPerMl} mEq/mL)</td>
            <td style={tdr}><strong>{mgPerKg > 0 ? mgPerKg : "—"}</strong> mEq</td>
            <td style={tdr}><strong>{mgPerKg > 0 ? f(mgPerKg*(calc.factor||0),2) : "—"}</strong> mEq
              {mgPerKg > 0 && <> = <strong>{f(calc.solVol?.mg,2)}</strong> mL</>}</td>
            <td style={td}>Mg 0-12 mo. 0.4 mEq/kg/day<br/>&gt;1 yr. 0.2 mEq/kg/day</td>
          </tr>
          {/* Ca */}
          <tr>
            <td style={td}><strong>4. Ca⁺⁺</strong><br/>{chk(caPerKg > 0)} Ca Gluconate (Elemental Ca {S.caGluconate.caMgPerMl.toFixed(1)} mg/mL)</td>
            <td style={tdr}><strong>{caPerKg > 0 ? caPerKg : "—"}</strong> mg</td>
            <td style={tdr}><strong>{caPerKg > 0 ? f0(caPerKg*(calc.factor||0)) : "—"}</strong> mg
              {caPerKg > 0 && <> = <strong>{f(calc.solVol?.ca,1)}</strong> mL</>}</td>
            <td style={td}>Ca preterm 50-120 mg/kg/day (Ca:P ~1.7:1)</td>
          </tr>
          {/* Vitamins */}
          <tr>
            <td style={td}><strong>5. Multivitamin</strong><br/>{chk(inclSoluvit)} Soluvit N</td>
            <td style={{...tdr}} colSpan={2}><strong>{inclSoluvit ? f(calc.soluvitVol,1) : "—"}</strong> mL/day</td>
            <td style={td}>Soluvit N {S.soluvit.mlPerKg} mL/kg/day (max {S.soluvit.maxMl} mL/day)
              {calc.overfill > 1.001 && <div style={{ fontSize:9, color:"#a60" }}>not × Factor (sheet G43) → delivers {f(calc.soluvitVol * calc.deliveredFrac, 2)} mL</div>}</td>
          </tr>
          {/* Trace */}
          <tr>
            <td style={td}><strong>6. Trace Element</strong><br/>{chk(inclPeditrace)} Peditrace (Zn {S.peditrace.znMgPerMl * 1000} µg/mL)</td>
            <td style={{...tdr}} colSpan={2}><strong>{inclPeditrace ? f(calc.peditrace_vol,1) : "—"}</strong> mL/day</td>
            <td style={td}>Peditrace {S.peditrace.mlPerKg} mL/kg/day (max {S.peditrace.maxMl} mL)
              {calc.overfill > 1.001 && <div style={{ fontSize:9, color:"#a60" }}>not × Factor (sheet G45) → delivers {f(calc.peditrace_vol * calc.deliveredFrac, 2)} mL</div>}</td>
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
            <td style={td}>Ca:P {isFinite(mineral.tpnCaP) && mineral.tpnCaP > 0 ? `${mineral.tpnCaP.toFixed(2)}:1` : mineral.tpnCaP > 0 ? "!! (Ca, no P)" : "—"}</td>
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
            <td style={td}>Ca:P {isFinite(mineral.oralCaP) && mineral.oralCaP > 0 ? `${mineral.oralCaP.toFixed(2)}:1` : mineral.oralCaP > 0 ? "!! (Ca, no P)" : "—"}</td>
          </tr>}
          <tr>
            <td style={{...td, fontWeight:700}}>รวมทั้งหมด</td>
            <td style={tdr}>Ca <strong>{f0(mineral.totCa)}</strong></td>
            <td style={tdr}>PO₄ <strong>{f0(mineral.totP)}</strong></td>
            <td style={{...td, fontWeight:700}}>Ca:P {isFinite(mineral.totCaP) && mineral.totCaP > 0 ? `${mineral.totCaP.toFixed(2)}:1` : mineral.totCaP > 0 ? "!! (Ca, no P)" : "—"} (target {D.TARGETS.caP()[0]}–{D.TARGETS.caP()[1]}:1)</td>
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
          <td style={td}>Energy <strong>{f0(calc.tpnKcal)}</strong> kcal = <strong>{f0(calc.kcalKg)}</strong> kcal/kg</td>
        </tr>
        <tr>
          <td style={td}>Na⁺ <strong>{f(calc.naKg*(wtKg||0),2)}</strong> mEq = <strong>{f(calc.naKg,2)}</strong> mEq/kg</td>
          <td style={td}>K⁺ <strong>{f(calc.kKg*(wtKg||0),2)}</strong> mEq = <strong>{f(calc.kKg,2)}</strong> mEq/kg</td>
          <td style={td}>Mg²⁺ <strong>{f(mgPerKg*(wtKg||0),2)}</strong> mEq = <strong>{f(mgPerKg,2)}</strong> mEq/kg</td>
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

      {/* Signature */}
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:14 }}>
        <div>แพทย์ ................................................................</div>
        <div>รหัส ................................</div>
      </div>
    </div>
  );
}

window.Calculator = Calculator;