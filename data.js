// ============================================================
// NeoFeed — clinical data, formulas, reference values
// Sources:
//   PN  → ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Clin Nutr 2018)
//   EN  → ESPGHAN Committee on Nutrition 2022 (JPGN 2022)
//   EN  → WHO 2023 Preterm Feeding Guidelines
//   Thai PN Guideline พ.ศ. 2564 (สมาคมโภชนาการเด็กแห่งประเทศไทย)
// ============================================================

// ── Enteral feed composition per 100 mL ─────────────────────
// Units: kcal, pro/fat/cho in g, na/k in mmol, ca/p in mg
// 1 oz = 30 mL; 20 kcal/oz ≈ 67 kcal/100 mL
const EN_DB = {
  // ── Breast Milk ────────────────────────────────────────────
  // Source: BOX 1.3.1 Term mature milk (>30 days) per L → /10 per 100 mL
  // Na corrected: 9.0 mmol/L = 0.90 mmol/100mL (was 0.65 — underestimate)
  // Fat corrected: 34 g/L = 3.4 g/100mL (was 3.8 — overestimate; note: fat highly variable ±4g/L)
  // Composition varies widely — use measured values (indirect calorimetry/mid-IR) when available
  BM_20: {
    label: "Breast Milk (20 kcal/oz, mature)",
    kcal: 67, pro: 1.2, fat: 3.4, cho: 6.7,
    na: 0.90, k: 1.39, ca: 26, p: 15,
    osm: 290, lf: false,
    note: "Term mature MOM (BOX 1.3.1). Composition varies greatly — use measured values when available",
  },

  // ── Fortified Breast Milk / Preterm Formula ────────────────
  // Generic reference values for EBM/donor milk fortified to target density
  // Verify with actual product label at KCMH (HiQ/Enfalac preterm)
  BM_PF_20: {
    label: "Preterm Formula (20 kcal/oz)",
    kcal: 67, pro: 1.5, fat: 3.5, cho: 7.4,
    na: 1.0, k: 1.7, ca: 50, p: 28,
    osm: 290, lf: false,
  },
  FBM_PF_22: {
    label: "Preterm Formula (22 kcal/oz)",
    kcal: 73, pro: 2.0, fat: 3.8, cho: 8.0,
    na: 1.3, k: 1.9, ca: 75, p: 40,
    osm: 300, lf: false,
  },
  FBM_PF_24: {
    label: "Preterm Formula (24 kcal/oz)",
    kcal: 80, pro: 2.6, fat: 4.1, cho: 8.6,
    na: 1.5, k: 2.1, ca: 100, p: 55,
    osm: 310, lf: false,
    note: "HMF indicated at ≥40 mL/kg/day for <32 wk or <1.5 kg",
  },

  // ── BM + HMF ─────────────────────────────────────────────
  // Source: BOX 1.3.3 Enfamil HMF 4g/100mL + mature BM (BOX 1.3.1)
  //   Ca: 25+90=115 mg · P: 14+45=59 mg · Na: 0.90+0.5=1.40 mmol
  //   K: 1.39+0.5=1.89 mmol · Osm: 290+63=353 mOsm
  // Chula uses Enfamil HMF (Mead Johnson) — values from BOX 1.3.3
  BM_HMF_24: {
    label: "BM + HMF (Enfamil HMF ≈ 24 kcal/oz)",
    kcal: 81, pro: 2.3, fat: 4.1, cho: 7.8,
    na: 1.40, k: 1.89, ca: 115, p: 59,
    osm: 353, lf: false,
    note: "Start HMF at ≥40 mL/kg/day · <32 wk or <1.5 kg (WHO 2023) · Enfamil HMF reference (BOX 1.3.3)",
  },

  // ── HiQ LF (Dumex/Danone) — Lactose-Free ──────────────────
  // Low osmolality — safe to concentrate. Protein from whey.
  // Ca:P mass ratio 1.91 — good bone mineralisation ratio
  HIQLF_20: {
    label: "HiQ LF — 20 kcal/oz (67 kcal/100mL)",
    kcal: 67, pro: 1.67, fat: 3.6, cho: 7.4,
    na: 0.53, k: 0.93, ca: 44, p: 23,
    osm: 220, lf: true,
    note: "LF → glucose polymer → low osmolality. Safe to concentrate to 27 kcal/oz",
  },
  HIQLF_24: {
    label: "HiQ LF — 24 kcal/oz (80 kcal/100mL)",
    kcal: 80, pro: 2.0, fat: 4.3, cho: 8.9,
    na: 0.67, k: 1.13, ca: 53, p: 28,
    osm: 255, lf: true,
  },
  HIQLF_27: {
    label: "HiQ LF — 27 kcal/oz (90 kcal/100mL)",
    kcal: 90, pro: 2.25, fat: 4.8, cho: 10.0,
    na: 0.73, k: 1.27, ca: 58, p: 31,
    osm: 290, lf: true,
    note: "Ca still below 2022 goal at 150 mL/kg — supplement CaCO₃. Na always needs supplement",
  },

  // ── Enfalac LF (Mead Johnson) — Lactose-Free ──────────────
  // Higher Ca/P than HiQ — P goal met at 24 kcal/oz + 150 mL/kg
  ENFALAC_20: {
    label: "Enfalac LF — 20 kcal/oz (67 kcal/100mL)",
    kcal: 67, pro: 1.53, fat: 3.6, cho: 7.3,
    na: 0.93, k: 1.20, ca: 65, p: 43,
    osm: 220, lf: true,
  },
  ENFALAC_24: {
    label: "Enfalac LF — 24 kcal/oz (80 kcal/100mL)",
    kcal: 80, pro: 1.80, fat: 4.3, cho: 8.7,
    na: 1.13, k: 1.47, ca: 78, p: 51,
    osm: 255, lf: true,
    note: "P goal met at 150 mL/kg ✅ — still need Na supplement",
  },
  ENFALAC_27: {
    label: "Enfalac LF — 27 kcal/oz (90 kcal/100mL)",
    kcal: 90, pro: 2.00, fat: 4.8, cho: 9.8,
    na: 1.27, k: 1.67, ca: 87, p: 58,
    osm: 290, lf: true,
    note: "Ca goal met at 150 mL/kg ✅",
  },

  // ── Infatrini (Nutricia) — 100 kcal/100 mL ────────────────
  // Pre-concentrated, has lactose — complete nutrition at 150 mL/kg (if no LF req)
  INFATRINI_30: {
    label: "Infatrini (30 kcal/oz)",
    kcal: 100, pro: 2.6, fat: 5.4, cho: 10.3,
    na: 2.00, k: 2.75, ca: 100, p: 56,
    osm: 345, lf: false,
    note: "Complete at 150 mL/kg without protein module (if lactose tolerated)",
  },

  // ── Mixed feeds ────────────────────────────────────────────
  FBM_INF_MIX: {
    label: "FBM 24 ↔ Infatrini 30 (alternating)",
    kcal: 90, pro: 2.6, fat: 4.75, cho: 9.45,
    na: 1.55, k: 2.3, ca: 100, p: 55,
    osm: 375, lf: false,
    note: "Half feeds FBM 24, half Infatrini — values are mean",
  },
};

// ── Amino acid product densities (g protein / 100 mL) ────────
const AA_PRODUCTS = {
  AMINOVEN_10:     { label: "Aminoven Infant 10% (0–1 yr)",  conc: 10 },
  AMIPAREN_10:     { label: "Amiparen 10% (>1 yr)",          conc: 10 },
  PRIMENE_10:      { label: "Primene 10% (neonatal)",         conc: 10 },
  AMINOLEBAN_8:    { label: "Aminoleban 8%",                  conc: 8  },
  NEPHROSTERIL_7:  { label: "Nephrosteril 7%",               conc: 7  },
  AMINOPLASMAL_15: { label: "Aminoplasmal 15%",              conc: 15 },
};

// ── Lipid emulsions ───────────────────────────────────────────
// ESPGHAN 2018: prefer composite ILE (SMOF) when PN lasts >few days
// 20% ILE = 0.2 g fat/mL = 2.0 kcal/mL
const LIPID_PRODUCTS = {
  SMOF_20:       { label: "SMOFlipid 20% (composite — preferred)", conc: 20, kcalPerML: 2.0, note: "ESPGHAN preferred: fish oil reduces PNALD risk" },
  INTRALIPID_20: { label: "Intralipid 20% (pure soy)",             conc: 20, kcalPerML: 2.0 },
  CLINOLEIC_20:  { label: "Clinoleic 20% (olive/soy)",            conc: 20, kcalPerML: 2.0 },
};

// ── Salt / electrolyte sources ────────────────────────────────
// KCMH formulary — concentrations per mL
const SALT_SOURCES = {
  // Sodium
  NaCl_3:      { label: "NaCl 3%",                   ion: "Na", mEqPerML: 0.51,  group: "sodium" },
  NaCl_5:      { label: "NaCl 5%",                   ion: "Na", mEqPerML: 0.86,  group: "sodium" },
  NaCl_15:     { label: "NaCl 15%",                  ion: "Na", mEqPerML: 2.56,  group: "sodium" },
  Na_Acetate:  { label: "Na Acetate",                ion: "Na", mEqPerML: 2.0,   group: "sodium", note: "Use to correct metabolic acidosis; contributes Na" },
  // Disodium glycerophosphate = Glycophos® — as on order form:
  // Input: mL/kg/day → Na = 2 mEq/mL · P = 31 mg/mL
  Na_diphos:   { label: "Disodium glycerophosphate (Glycophos®)", ion: "NaP",
                 mEqNaPerML: 2.0, pMgPerML: 31,
                 group: "sodium", note: "Na = 2 mEq/mL · P = 31 mg/mL — dose in mL/kg/d (preferred P source: organic phosphate)" },
  // Potassium
  KCl:         { label: "KCl",                        ion: "K",  mEqPerML: 1.0,   group: "potassium", note: "1 mEq/mL" },
  K2HPO4:      { label: "K₂HPO₄",                    ion: "KP", mEqKPerML: 1.0,  pMgPerMEqK: 15.5, group: "potassium", note: "K⁺ 1 mEq/mL · P 15.5 mg/mEq K" },
  // Calcium — order form: elemental Ca 9 mg/mL
  Ca_Gluconate:{ label: "Ca Gluconate 10%",            ion: "Ca", mgPerML: 9,      group: "calcium",  note: "Elemental Ca 9 mg/mL" },
  // Magnesium — MgSO₄ 50%: 4.06 mEq/mL (anhydrous) — form uses mEq
  MgSO4_50:    { label: "MgSO₄ 50%",                 ion: "Mg", mEqPerML: 4.06,  group: "magnesium", note: "4.06 mEq/mL · preterm: 0.4 mEq/kg/day" },
};

// ── Vitamins / additives ──────────────────────────────────────
const ADDITIVE_PRODUCTS = {
  VITALIPID_INF: { label: "Vitalipid N Infant® (fat-soluble vit)",  dose: "4 mL/kg/day (max 10 mL/day) — add to lipid bag",   note: "BW <2.5 kg: 4 mL/kg · BW ≥2.5 kg: 10 mL/day" },
  SOLUVIT_N:     { label: "Soluvit N® (water-soluble vit)",          dose: "1 mL/kg/day — add to aqueous PN bag" },
  PEDITRACE:     { label: "Peditrace® (trace elements)",             dose: "1–2 mL/kg/day — add to aqueous PN bag",            note: "Provides Zn 250 µg, Cu 20 µg, Mn <1 µg, Se 2 µg, I 1 µg per mL" },
};

// ============================================================
// TARGET SYSTEMS
// ============================================================

// ── TPN_TARGETS — used when EN < 100 mL/kg/d ─────────────────
// Source: ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Clin Nutr 2018)
// ESPGHAN 2021 JPGN update for critically ill term infants
// Thai PN Guideline 2564
const TPN_TARGETS = {
  // Amino acids g/kg/day — van Goudoever et al. 2018
  // R3.1: Day 1 ≥1.5 g/kg (LOE 1++, RG A) | R3.2: Day 2+ 2.5–3.5 g/kg (LOE 1+, RG A)
  protein: (dol) => {
    if (dol <= 1) return [1.5, 2.5];   // Day 1: start ≥1.5 (target 1.5–2.5 g/kg)
    return [2.5, 3.5];                  // Day 2+: 2.5–3.5 g/kg (>3.5 research only)
  },

  // Total PN energy kcal/kg/day — Moltu SJ et al. JPGN 2021
  // Early PN: non-protein energy goal 45–55 kcal/kg/day DOL 1–2
  // Advancing: 70–100 kcal/kg/day DOL 3–7
  kcal: (dol) => {
    if (dol <= 2) return [45, 55];     // Transition: meet BMR + minimal synthesis
    if (dol <= 7) return [70, 100];    // Intermediate: increasing substrate delivery
    return [90, 120];                   // Stable: approach full PN energy
  },

  // Lipid g/kg/day — Lapillonne A et al. 2018
  // Start immediately (no later than DOL 2). SMOF preferred over pure soy.
  lipid: (dol) => {
    if (dol <= 1) return [0.5, 1.0];  // Day 1: start 0.5–1 g/kg
    return [1.0, 4.0];                 // Advance by 0.5–1 g/kg/day, max 4.0
  },

  // Electrolytes mEq/kg/day — Jochum F et al. 2018 · order form units
  // Transition phase D1–2: hold Na & K (diuretic phase, natriuresis)
  na: (dol) => {
    if (!dol || dol <= 2) return [0, 2];   // Transition: 0–2 mEq/kg/day (withhold in ELBW)
    if (dol <= 7)         return [0, 3];   // Intermediate: 0–3 mEq/kg/day
    return [2, 5];                          // Stable: 2–5 mEq/kg/day (form: 2–5 mEq/kg/d)
  },
  k: (dol) => {
    if (!dol || dol <= 3) return [0, 3];   // Transition/Intermediate: 0–3 mEq/kg (hold D1-2 ELBW)
    return [2, 3];                          // Stable D8+: 2–3 mEq/kg (Jochum 2018)
  },

  // Calcium mg/kg/day — Mihatsch 2018 (ESPGHAN 2018)
  // DOL1: 0.8–2.0 mmol/kg × 40 = 32–80 mg/kg
  // Growing (stable): 1.6–3.5 mmol/kg × 40 = 64–140 mg/kg
  ca: (dol) => {
    if (!dol || dol <= 1) return [32, 80];   // DOL1: 0.8–2.0 mmol×40 = 32–80 mg/kg
    return [64, 140];                          // Growing: 1.6–3.5 mmol×40 = 64–140 mg/kg
  },

  // Phosphorus mg/kg/day — Mihatsch 2018 (ESPGHAN 2018)
  // DOL1: 1.0–2.0 mmol/kg × 31 = 31–62 mg/kg
  // Growing (stable): 1.5–2.0 mmol/kg × 31 = 46–62 mg/kg
  p: (dol) => {
    if (!dol || dol <= 1) return [31, 62];   // DOL1: 1.0–2.0 mmol×31 = 31–62 mg/kg
    return [46, 62];                           // Growing: 1.5–2.0 mmol×31 = 46–62 mg/kg
  },

  // Magnesium mEq/kg/day — Mihatsch 2018 (ESPGHAN 2018)
  // Mg²⁺ valence 2 → 1 mmol = 2 mEq
  // DOL1: 0.1–0.2 mmol/kg = 0.2–0.4 mEq/kg · Growing: 0.2–0.3 mmol = 0.4–0.6 mEq/kg
  mg: (dol) => {
    if (!dol || dol <= 2) return [0.2, 0.4];  // Transition: 0.1–0.2 mmol×2
    return [0.4, 0.6];                          // Growing: 0.2–0.3 mmol×2
  },

  // Ca:P mass ratio — ESPGHAN 2018 molar 0.8–1.3 → mass 1.0–1.7 (×40/31=1.29)
  // Full acceptable range [1.0, 1.7]; order form targets upper end ~1.7:1
  caP: () => [1.0, 1.7],   // mass ratio; full ESPGHAN range; KCMH aim 1.7:1
};

// ── ENTERAL_TARGETS — used when EN ≥ 100 mL/kg/d ────────────
// Source: ESPGHAN Committee on Nutrition 2022 (JPGN 2022)
//         WHO 2023 Preterm Feeding Guidelines
const ENTERAL_TARGETS = {
  // ESPGHAN 2022: 3.5–4.0 g/kg/day (target); up to 4.5 in catch-up situations
  protein: () => [3.5, 4.0],   // was [3.5, 4.5] — 4.5 is ceiling, not target

  // ESPGHAN 2022: 115–140 kcal/kg/day (max 160 for catch-up)
  kcal: () => [115, 140],       // was [110, 135] — updated to 2022 values

  // ESPGHAN 2022: 4.8–8.1 g/kg/day (upper limit raised from 2010 4.8–6.6)
  lipid: () => [4.8, 8.1],      // was [4.8, 6.6] — upper limit updated

  // ESPGHAN 2022: 3.0–5.0 mmol/kg/day (up to 8.0 in ELBW with high Na loss)
  na: () => [3.0, 5.0],

  // ESPGHAN 2022: 2.3–4.6 mmol/kg/day (increased from 2010 range of 1.7–3.4)
  k: () => [2.3, 4.6],          // was [2, 3] — significantly updated

  // ESPGHAN 2022: 3.0–5.0 mmol/kg/day = 120–200 mg/kg/day
  ca: () => [120, 200],          // was [100, 140] — updated to 2022 values

  // ESPGHAN 2022: 2.2–3.7 mmol/kg/day = 68–115 mg/kg/day → [70, 115]
  p: () => [70, 115],            // was [60, 90] — updated to 2022 values

  // Protein:Energy ratio — ESPGHAN 2022: 2.8–3.6 g/100 kcal
  peRatio: () => [2.8, 3.6],    // g protein per 100 kcal

  // Non-protein energy per g protein — ESPGHAN 2018: 30–40 kcal/g AA
  npePerG: () => [30, 40],
};

// ── TARGETS — general DOL + weight-aware lookup ───────────────
// Both PN and EN phases — highest-level reference used in calculator
const TARGETS = {

  // Fluid mL/kg/day by DOL and birth weight (grams)
  // ESPGHAN 2018: Jochum F et al. — 4-tier by BW (ELBW / VLBW / preterm / term)
  fluid: (dol, wtG) => {
    const d = Math.min(dol, 7);
    if (wtG < 1000) {         // ELBW <1000g — highest IWL, humidified incubator essential
      const map = {1:[80,100], 2:[100,120], 3:[120,140], 4:[140,160], 5:[160,180], 6:[160,180], 7:[160,180]};
      return map[d] || [160, 180];
    }
    if (wtG < 1500) {         // VLBW 1000–1500g
      const map = {1:[70,90], 2:[90,110], 3:[110,130], 4:[130,150], 5:[140,160], 6:[140,160], 7:[140,160]};
      return map[d] || [140, 160];
    }
    if (wtG < 2500) {         // Preterm >1500g
      const map = {1:[60,80], 2:[80,100], 3:[100,120], 4:[120,140], 5:[140,160], 6:[140,160], 7:[140,160]};
      return map[d] || [140, 160];
    }
    // Term ≥2500g
    const map = {1:[40,60], 2:[50,70], 3:[60,80], 4:[60,100], 5:[100,140], 6:[140,160], 7:[140,160]};
    return map[d] || [140, 160];
  },

  // GIR mg/kg/min — Joosten K et al. 2018 (ESPGHAN)
  // Preterm: start 4–8, target 8–10, max 12
  // Return: [safe lower, max upper] for the meter bar
  gir: () => [4, 12],
  girTarget: () => [8, 10],    // optimal anabolic GIR
  girPreterm: () => ({ start: [4, 8], target: [8, 10], max: 12, step: 2 }),
  girTerm:    () => ({ start: [2.5, 5], target: [5, 10], max: 12 }),

  // Protein g/kg/day — combined best-practice target (PN or EN not yet distinguished)
  // ESPGHAN 2018 PN: Day 1 1.5–2.5, Day 2+ 2.5–3.5
  // ESPGHAN 2022 EN: 3.5–4.0
  protein: (dol) => {
    if (dol <= 1) return [1.5, 2.5];
    if (dol <= 7) return [2.5, 3.5];
    return [3.5, 4.0];
  },

  // Energy kcal/kg/day — phase-aware
  kcal: (dol) => {
    if (dol <= 2) return [45, 55];    // Early PN (non-protein + AA)
    if (dol <= 7) return [70, 100];   // Advancing
    return [110, 140];                 // Full nutrition target (ESPGHAN 2022 EN)
  },

  // Lipid g/kg/day
  lipid: (dol) => {
    if (dol <= 1) return [0.5, 1.0];
    if (dol <= 7) return [1.0, 4.0];
    return [4.8, 8.1];   // Full enteral
  },

  // Sodium mEq/kg/day — phase-specific (order form: 2–5 mEq/kg/day general)
  na: (dol) => {
    if (!dol || dol <= 2) return [0, 2];   // Transition: hold Na
    if (dol <= 7)         return [0, 3];   // Intermediate
    return [2, 5];                          // Stable: form normal requirement
  },

  // Potassium mEq/kg/day — Jochum 2018
  // Transition D1–3: 0–3 · Intermediate D4–7: 0–3 · Stable D8+: 2–3 mEq/kg/day
  k: (dol) => {
    if (!dol || dol <= 7) return [0, 3];  // Transition + Intermediate
    return [2, 3];                         // Stable D8+: Jochum 2–3 mEq/kg/day
  },

  // Calcium mg/kg/day — Mihatsch 2018 (ESPGHAN 2018)
  // DOL1: 0.8–2.0 mmol/kg × 40 = 32–80 mg/kg
  // Growing (stable): 1.6–3.5 mmol/kg × 40 = 64–140 mg/kg
  ca: (dol, isEnteral) => {
    if (isEnteral) return [120, 200];       // ESPGHAN 2022 EN: 3.0–5.0 mmol×40
    if (!dol || dol <= 1) return [32, 80];  // DOL1: 0.8–2.0 mmol×40 = 32–80 mg/kg
    return [64, 140];                        // Growing: 1.6–3.5 mmol×40 = 64–140 mg/kg
  },

  // Phosphorus mg/kg/day — Mihatsch 2018 (ESPGHAN 2018)
  // DOL1: 1.0–2.0 mmol/kg × 31 = 31–62 mg/kg
  // Growing (stable): 1.5–2.0 mmol/kg × 31 = 46–62 mg/kg
  p: (dol, isEnteral) => {
    if (isEnteral) return [70, 115];        // ESPGHAN 2022 EN: 2.2–3.7 mmol×31
    if (!dol || dol <= 1) return [31, 62];  // DOL1: 1.0–2.0 mmol×31 = 31–62 mg/kg
    return [46, 62];                         // Growing: 1.5–2.0 mmol×31 = 46–62 mg/kg
  },

  // Magnesium mEq/kg/day — Mihatsch 2018 (ESPGHAN 2018)
  // DOL1: 0.1–0.2 mmol/kg = 0.2–0.4 mEq/kg (Mg²⁺ valence 2)
  // Growing preterm: 0.2–0.3 mmol/kg = 0.4–0.6 mEq/kg
  mg: (dol) => {
    if (!dol || dol <= 2) return [0.2, 0.4]; // Transition: 0.1–0.2 mmol×2
    return [0.4, 0.6];                         // Growing: 0.2–0.3 mmol×2 — matches Mg chips
  },

  // Ca:P mass ratio — order form: Ca:P ~1.7:1 target
  // ESPGHAN 2018 molar 0.8–1.3:1 → mass 1.0–1.68 ≈ 1.7:1
  caP: () => [1.0, 1.7],   // mass ratio; ESPGHAN molar 0.8–1.3 → mass 1.0–1.7; KCMH aim 1.7:1

  // Non-protein energy per gram amino acid — ESPGHAN 2018
  // "Minimum 30–40 kcal per 1 g amino acids for optimal utilisation"
  npePerGAA: () => [30, 40],

  // Protein:Energy ratio — ESPGHAN 2022 EN
  // 2.8–3.6 g protein per 100 kcal → ensures lean mass accretion
  peRatio: () => [2.8, 3.6],
};

// ── Traffic-light status helper ───────────────────────────────
function rangeStatus(value, [lo, hi], { hardHi = null, hardLo = null } = {}) {
  if (value === 0 || !isFinite(value)) return "empty";
  if (hardHi != null && value > hardHi) return "crit";
  if (hardLo != null && value < hardLo) return "crit";
  if (value < lo || value > hi) return "warn";
  return "ok";
}

// ── Osmolarity estimate (mOsm/L) ─────────────────────────────
// Ramathibodi PN osmolarity formula:
//   Osm (mOsm/L) = 50×D% + 100×AA% + 2×Na(mEq/L) + 2×K(mEq/L) + 1.4×Ca(mEq/L) + 1×Mg(mEq/L)
// Ca unit: caMgPerL = elemental Ca mg/L → convert to mEq/L ÷20 (MW=40, valence=2)
// Peripheral limit: <900 mOsm/L · Central: no hard limit but >1800 mOsm/L = endothelial risk
function estimateOsmolarity({ dexPct, aaPct, naMeqPerL, kMeqPerL, caMgPerL = 0, mgMeqPerL = 0 }) {
  return (
    50  * dexPct     +   // dextrose %
    100 * aaPct      +   // amino acid %
    2   * naMeqPerL  +   // Na  mEq/L
    2   * kMeqPerL   +   // K   mEq/L
    1.4 * (caMgPerL / 20) +  // Ca mEq/L (elemental mg/L ÷ 20)
    1   * mgMeqPerL         // Mg mEq/L
  );
}

// ── GIR helper ────────────────────────────────────────────────
// GIR (mg/kg/min) = dexG(g/day) × 1000 / (1440 × wtKg)
// Or: GIR = dextrose %()/100 × TPN_vol_mL/day × 1000 / 1440 / wtKg
function calcGIR(dexG_per_day, wtKg) {
  return dexG_per_day * 1000 / (1440 * wtKg);
}
// Reverse: glucose g/kg/day from GIR
function girToGPerKg(gir) {
  return gir * 1.44;  // mg/kg/min × 1.44 = g/kg/day
}

// ============================================================
// COMPREHENSIVE ESPGHAN REFERENCE (read-only, for display)
// Organised by component — can be shown in a "Reference" panel
// ============================================================
const ESPGHAN_TARGETS = {
  // ── PN targets (ESPGHAN 2018) ──────────────────────────────
  pn: {
    aa: {
      preterm: {
        day1:    { range: [1.5, 2.5], note: "LOE 1++, RG A — start ≥1.5 from birth", unit: "g/kg/day" },
        day2plus:{ range: [2.5, 3.5], note: "LOE 1+, RG A — accompanied by NPE ≥65 kcal/kg", unit: "g/kg/day" },
        above35: "Research only (LOE 2+, RG 0)",
        cysteine:"50–75 mg/kg/day — conditionally essential in preterm",
      },
      term: { range: [1.5, 3.0], note: "LOE 1+, RG B" },
    },
    gir: {
      preterm: { start: [4, 8], target: [8, 10], max: 12, step: 2, unit: "mg/kg/min" },
      term:    { start: [2.5, 5], target: [5, 10], max: 12, unit: "mg/kg/min" },
      hyperglycemia: {
        threshold1: 145,  // BG mg/dL → reduce GIR first
        threshold2: 180,  // BG mg/dL → insulin if GIR already minimal
        insulin: "0.01–0.05 U/kg/hr (after GIR reduced to minimum)",
      },
      peripheralMaxDex: 12.5, // % max for peripheral IV (osmolarity limit)
    },
    lipid: {
      start:   0.5,   // g/kg/day, Day 1 or no later than Day 2
      step:    1.0,   // advance 0.5–1 g/kg/day
      max:     4.0,
      tgCutoff:265,   // mg/dL — reduce ILE if above
      preferred: "Composite ILE (SMOF lipid) — reduces PNALD risk vs pure soy",
      kcalPerMl_20pct: 2.0,
    },
    fluid: {
      unit: "mL/kg/day",
      elbw:   { d1:[80,100], d2:[100,120], d3:[120,140], d4:[140,160], d5plus:[160,180] },
      vlbw:   { d1:[70,90],  d2:[90,110],  d3:[110,130], d4:[130,150], d5plus:[140,160] },
      preterm:{ d1:[60,80],  d2:[80,100],  d3:[100,120], d4:[120,140], d5plus:[140,160] },
      term:   { d1:[40,60],  d2:[50,70],   d3:[60,80],   d4:[60,100],  d5plus:[100,140] },
      note: "ESPGHAN guideline ranges — no absolute max. Attending may use up to 200 mL/kg/day per clinical judgment. ELBW in humidified incubator: IWL ≈30 vs open warmer ≈120 mL/kg/day",
    },
    electrolytes: {
      // Transition D1–2, Intermediate D3–7, Stable D8+
      na: {
        elbw:    { transition:[0,2], intermediate:[0,5], stable:[2,7]  },
        preterm: { transition:[0,2], intermediate:[0,3], stable:[2,5]  },
        term:    { transition:[0,2], intermediate:[0,2], stable:[1,3]  },
        unit: "mmol/kg/day",
      },
      k:  { transition:[0,3], intermediate:[0,3], stable:[2,3],  unit:"mmol/kg/day" },
      ca: { dol1:[0.8,2.0], growing:[1.6,3.5], unit:"mmol/kg/day" },  // × 40.08 = mg/kg
      p:  { dol1:[1.0,2.0], growing:[1.5,2.0], unit:"mmol/kg/day" },  // × 30.97 = mg/kg
      mg: { dol1:[0.1,0.2], growing:[0.2,0.3], unit:"mmol/kg/day" },
      caP_molar:  [0.8, 1.3],   // molar Ca:P ratio — aim 1.3:1 (ESPGHAN 2018)
      caP_mass:   [1.0, 1.7],   // mass ratio — ESPGHAN 0.8–1.3 molar × 1.29 = 1.0–1.7; KCMH aim 1.7:1
    },
    micronutrients: {
      zn: { preterm:[400,500], term:[250,250], unit:"µg/kg/day" },
      fe: { preterm:[200,250], term:[50,100],  unit:"µg/kg/day", note:"Prefer enteral Fe when possible" },
      cu: 40,   // µg/kg/day all ages
      // Peditrace® 1–2 mL/kg/day covers Zn, Cu, Se, Mn, I
    },
    energy: {
      kcalPerGGlucose: 3.4,
      kcalPerGAA: 4.0,
      kcalPerGLipid: 9.0,
      kcalPerMlILE20: 2.0,
      npePerGAA: [30, 40],   // kcal non-protein per g amino acid — ESPGHAN 2018
    },
    additives: {
      vitalipid: "BW <2.5 kg: 4 mL/kg/day · BW ≥2.5 kg: 10 mL/day (add to lipid bag)",
      soluvit:   "1 mL/kg/day (add to aqueous PN bag)",
      peditrace: "1–2 mL/kg/day (add to aqueous PN bag)",
    },
    light: "Protect all PN bags and lipid from light — reduces peroxide formation (ESPGHAN 2018)",
  },

  // ── EN targets (ESPGHAN 2022) ──────────────────────────────
  en: {
    energy:  { range:[115,140], max:160,   unit:"kcal/kg/day", note:"Max 160 for catch-up EUGR" },
    protein: { range:[3.5,4.0], max:4.5,   unit:"g/kg/day",   note:"PER 2.8–3.6 g/100 kcal" },
    fat:     { range:[4.8,8.1],             unit:"g/kg/day",   note:"DHA 30–65 mg/kg/day · ARA 30–100 mg/kg/day ↑↑" },
    cho:     { range:[11,17],               unit:"g/kg/day"   },
    na:      { range:[3.0,5.0], high:8.0,  unit:"mmol/kg/day" },
    k:       { range:[2.3,4.6],             unit:"mmol/kg/day", note:"↑ from 2010 range" },
    ca:      { range:[3.0,5.0], mgPerKg:[120,200], unit:"mmol/kg/day", note:"↑ upper limit" },
    p:       { range:[2.2,3.7], mgPerKg:[70,115],  unit:"mmol/kg/day", note:"↑ from 2010" },
    vitD:    { range:[400,700],             unit:"IU/kg/day",  note:"Per kg (not per day) — changed in 2022!" },
    fe:      { range:[2,3], max:6,          unit:"mg/kg/day",  note:"Start at 2 weeks" },
    zn:      { range:[2.0,3.0],             unit:"mg/kg/day",  note:"↑↑ from 2010: 1.1–2.0" },
    fluid:   { range:[150,200], target:165, unit:"mL/kg/day", note:"ESPGHAN 150–180; attending may use up to 200 mL/kg/day" },
    growth:  { weight:[17,20], length:0.8, hc:0.5, unit:"g/kg/day | cm/week | cm/week" },
    peRatio: { range:[2.8,3.6],             unit:"g/100 kcal", note:"For lean mass accretion" },
    advancement: {
      mef:      [12,24],   // mL/kg/day minimal enteral feeding
      step:     [18,30],   // advance per day (WHO 2023: up to 30 mL/kg/day safe)
      hmfStart: 40,         // start HMF at ≥40 mL/kg/day
      fullFeeds: 100,        // KCMH threshold: ≥100 mL/kg/day = full EN → wean PN + switch to EN targets
      maxVol: 200,           // max enteral volume — attending discretion, some go to 200 mL/kg/day
      hmfIndication: "<32 wk gestation or <1.5 kg birth weight on MOM or DHM",
      grNote: "No routine gastric residual monitoring in stable infants (ESPGHAN 2022 GOR B)",
    },
    schedule: "Scheduled feeds q2–3h for <34 wk preferred over demand (WHO 2023 conditional, low certainty)",
  },

  // ── WHO 2023 new recommendations ─────────────────────────────
  who2023: {
    caP_supplement: "NOT recommended for formula-fed preterm/LBW infants (changed 2023)",
    hmf: "Conditionally recommended for <32 wk or <1.5 kg on MOM/DHM (low-moderate certainty)",
    iron: "2–4 mg/kg/day when EN established (strong, moderate certainty)",
    zinc: "1–3 mg/kg/day when EN established (conditional, low certainty)",
    vitD: "400–800 IU/day when EN established (conditional, low certainty)",
    earlyEN: "Feed as early as possible from Day 1 (strong, moderate certainty)",
    advancement: "Up to 30 mL/kg/day increments (conditional, moderate certainty)",
  },
};

// ============================================================
// FENTON 2025 GROWTH CHART — third-generation (F_2025)
// Source: Fenton TR, Elmrayed S, Alshaikh BN. Fenton third-
//   generation growth charts of preterm infants without
//   abnormal fetal growth: a systematic review and
//   meta-analysis. Paediatr Perinat Epidemiol. 2025.
//   PMID: 40534585 · doi: 10.1111/ppe.70035
// Data: LMS parameters from official size-at-birth calculator
//   (ucalgary.ca/fenton). Percentiles computed via Box-Cox
//   normal distribution. Sources: iNeo International Consortium
//   2025, Netherlands, Australia, US 2014-2022, Finland, Japan,
//   China. Post-term (44-50 wk): WHO Growth Standard 2026.
// Columns: [PMA_wk, 3rd, 10th, 50th, 90th, 97th]
// ============================================================

// Weight (g) — every 2 weeks 22–50
const FENTON_WEIGHT = {
  boys: [
    [22,  367,  411,  505,  599,  643],
    [24,  511,  571,  697,  820,  876],
    [26,  684,  767,  938, 1102, 1177],
    [28,  899,  996, 1211, 1436, 1544],
    [30, 1159, 1263, 1519, 1826, 1990],
    [32, 1450, 1577, 1892, 2282, 2496],
    [34, 1792, 1949, 2334, 2796, 3043],
    [36, 2149, 2334, 2782, 3310, 3588],
    [38, 2500, 2721, 3226, 3773, 4043],
    [40, 2842, 3069, 3586, 4144, 4418],
    [42, 2970, 3213, 3762, 4353, 4644],
    [44, 3090, 3340, 3900, 4520, 4830],
    [46, 3200, 3450, 4020, 4660, 4980],
    [48, 3300, 3550, 4130, 4790, 5120],
    [50, 3400, 3650, 4230, 4900, 5240],
  ],
  girls: [
    [22,  359,  392,  470,  558,  603],
    [24,  492,  542,  655,  774,  831],
    [26,  658,  729,  885, 1044, 1120],
    [28,  853,  944, 1146, 1359, 1463],
    [30, 1086, 1194, 1447, 1735, 1882],
    [32, 1366, 1500, 1823, 2199, 2394],
    [34, 1691, 1855, 2248, 2699, 2932],
    [36, 2038, 2231, 2688, 3211, 3480],
    [38, 2407, 2618, 3106, 3643, 3912],
    [40, 2743, 2957, 3450, 3991, 4261],
    [42, 2859, 3087, 3610, 4184, 4471],
    [44, 2970, 3210, 3750, 4360, 4660],
    [46, 3080, 3320, 3880, 4510, 4820],
    [48, 3180, 3430, 4000, 4640, 4970],
    [50, 3280, 3540, 4110, 4760, 5100],
  ],
};

// Length (cm) — every 4 weeks 22–50
const FENTON_LENGTH = {
  boys: [
    [22, 24.2, 25.6, 28.7, 31.7, 33.1],
    [26, 29.8, 31.2, 34.4, 37.6, 39.0],
    [30, 35.5, 37.0, 40.2, 43.4, 44.9],
    [34, 41.3, 42.7, 45.5, 48.3, 49.6],
    [38, 46.2, 47.3, 49.7, 52.0, 53.2],
    [42, 52.1, 53.3, 55.5, 57.7, 58.9],
    [46, 53.5, 54.8, 57.0, 59.3, 60.5],
    [50, 55.0, 56.3, 58.5, 60.8, 62.1],
  ],
  girls: [
    [22, 23.8, 25.2, 28.1, 31.0, 32.4],
    [26, 29.3, 30.7, 33.7, 36.8, 38.2],
    [30, 35.0, 36.4, 39.5, 42.6, 44.1],
    [34, 40.5, 41.8, 44.7, 47.6, 48.9],
    [38, 45.4, 46.5, 48.9, 51.2, 52.3],
    [42, 51.0, 52.2, 54.3, 56.4, 57.6],
    [46, 52.5, 53.7, 55.9, 58.1, 59.3],
    [50, 54.0, 55.3, 57.5, 59.8, 61.0],
  ],
};

// Head circumference (cm) — every 4 weeks 22–50
const FENTON_HC = {
  boys: [
    [22, 17.5, 18.2, 19.9, 21.5, 22.3],
    [26, 21.5, 22.3, 24.1, 26.0, 26.8],
    [30, 25.4, 26.3, 28.2, 30.2, 31.1],
    [34, 29.2, 30.0, 31.9, 33.8, 34.7],
    [38, 31.9, 32.8, 34.5, 36.2, 37.0],
    [42, 33.2, 34.0, 35.7, 37.4, 38.2],
    [46, 35.2, 36.0, 37.8, 39.5, 40.4],
    [50, 36.4, 37.2, 39.0, 40.8, 41.6],
  ],
  girls: [
    [22, 17.0, 17.8, 19.4, 21.1, 21.9],
    [26, 21.1, 21.9, 23.7, 25.4, 26.3],
    [30, 25.0, 25.9, 27.8, 29.6, 30.5],
    [34, 28.7, 29.5, 31.4, 33.2, 34.1],
    [38, 31.4, 32.2, 33.9, 35.6, 36.4],
    [42, 32.7, 33.5, 35.2, 36.9, 37.7],
    [46, 34.8, 35.6, 37.4, 39.1, 40.0],
    [50, 36.0, 36.8, 38.5, 40.3, 41.2],
  ],
};

// ============================================================
// Mock patient registry (replace with GAS fetch in production)
// Session ID format: Initials + BW + TwinSuffix (PDPA compliant)
// ============================================================
const MOCK_PATIENTS = [
  {
    sessionId: "PP-BW850-A", initials: "PP", name: "ปพ", bw: 850, ga: 26.4, sex: "boys",
    dob: "2026-05-04", admissionDate: "2026-05-04", twinSuffix: "A",
    status: "Active", currentBed: "NICU-3", diagnosis: "ELBW · RDS · PDA",
    weights: [
      { dol: 1, w: 850 }, { dol: 2, w: 815 }, { dol: 3, w: 790 },
      { dol: 4, w: 778 }, { dol: 5, w: 785 }, { dol: 6, w: 805 },
      { dol: 7, w: 830 }, { dol: 8, w: 858 },
    ],
    lengths: [{ dol: 0, v: 33.5 }, { dol: 7, v: 33.8 }],
    hcs:     [{ dol: 0, v: 23.5 }, { dol: 7, v: 23.9 }],
  },
  {
    sessionId: "SS-BW1180-A", initials: "SS", name: "สส", bw: 1180, ga: 29.0, sex: "girls",
    dob: "2026-04-22", admissionDate: "2026-04-22", twinSuffix: "",
    status: "Active", currentBed: "NICU-7", diagnosis: "VLBW · feeding intolerance",
    weights: [
      { dol: 1, w: 1180 }, { dol: 3, w: 1110 }, { dol: 5, w: 1095 },
      { dol: 7, w: 1130 }, { dol: 10, w: 1240 }, { dol: 14, w: 1380 },
      { dol: 18, w: 1530 }, { dol: 20, w: 1620 },
    ],
    lengths: [{ dol: 0, v: 37.0 }, { dol: 7, v: 37.5 }, { dol: 14, v: 38.4 }],
    hcs:     [{ dol: 0, v: 26.5 }, { dol: 7, v: 27.1 }, { dol: 14, v: 27.8 }],
  },
  {
    sessionId: "NK-BW720-B", initials: "NK", name: "นก", bw: 720, ga: 25.2, sex: "boys",
    dob: "2026-05-09", admissionDate: "2026-05-09", twinSuffix: "B",
    status: "Active", currentBed: "NICU-1", diagnosis: "ELBW Twin B · IVH gr.II",
    weights: [
      { dol: 1, w: 720 }, { dol: 2, w: 690 }, { dol: 3, w: 670 },
    ],
    lengths: [{ dol: 0, v: 32.0 }],
    hcs:     [{ dol: 0, v: 22.8 }],
  },
  {
    sessionId: "AT-BW1450-A", initials: "AT", name: "อท", bw: 1450, ga: 31.0, sex: "girls",
    dob: "2026-04-10", admissionDate: "2026-04-10", twinSuffix: "",
    status: "Active", currentBed: "SCN-2", diagnosis: "Growing premie",
    weights: [
      { dol: 1, w: 1450 }, { dol: 5, w: 1390 }, { dol: 10, w: 1490 },
      { dol: 15, w: 1650 }, { dol: 20, w: 1820 }, { dol: 25, w: 2010 },
      { dol: 30, w: 2210 },
    ],
    lengths: [{ dol: 0, v: 40.0 }, { dol: 7, v: 40.8 }, { dol: 14, v: 41.6 }, { dol: 21, v: 42.5 }, { dol: 28, v: 43.4 }],
    hcs:     [{ dol: 0, v: 28.5 }, { dol: 7, v: 29.0 }, { dol: 14, v: 29.6 }, { dol: 21, v: 30.2 }, { dol: 28, v: 30.8 }],
  },
];

const MOCK_DAILY_LOG = {
  "PP-BW850-A": [
    { dol: 1, ts: "2026-05-04", weight: 850, fluid: 80,  gir: 4.5, pro: 1.5, kcal: 35, na: 0,   k: 0,   route: "TPN central" },
    { dol: 2, ts: "2026-05-05", weight: 815, fluid: 100, gir: 6.0, pro: 2.5, kcal: 55, na: 0,   k: 0,   route: "TPN central" },
    { dol: 3, ts: "2026-05-06", weight: 790, fluid: 120, gir: 7.5, pro: 3.5, kcal: 75, na: 3,   k: 2,   route: "TPN + trophic" },
    { dol: 4, ts: "2026-05-07", weight: 778, fluid: 140, gir: 9.0, pro: 3.8, kcal: 90, na: 3.5, k: 2,   route: "TPN + MOM 10" },
    { dol: 5, ts: "2026-05-08", weight: 785, fluid: 150, gir:10.0, pro: 4.0, kcal:105, na: 3.5, k: 2.5, route: "TPN + MOM 20" },
    { dol: 6, ts: "2026-05-09", weight: 805, fluid: 160, gir:11.0, pro: 4.0, kcal:115, na: 4,   k: 2.5, route: "TPN + MOM 40" },
    { dol: 7, ts: "2026-05-10", weight: 830, fluid: 160, gir:10.5, pro: 3.8, kcal:120, na: 3.5, k: 2.5, route: "TPN + MOM 60" },
    { dol: 8, ts: "2026-05-11", weight: 858, fluid: 160, gir: 9.8, pro: 3.6, kcal:122, na: 3.5, k: 2.5, route: "Mostly EN" },
  ],
};

// ============================================================
// Export
// ============================================================
window.NEOFEED_DATA = {
  // Enteral formula database
  EN_DB,
  // Product reference
  AA_PRODUCTS, LIPID_PRODUCTS, SALT_SOURCES, ADDITIVE_PRODUCTS,
  // Target systems (backward-compatible function API)
  TARGETS, TPN_TARGETS, ENTERAL_TARGETS,
  // Comprehensive ESPGHAN reference object (for display panels)
  ESPGHAN_TARGETS,
  // Growth charts
  FENTON_WEIGHT, FENTON_LENGTH, FENTON_HC,
  // Patient data (mock — replace with GAS fetch)
  MOCK_PATIENTS, MOCK_DAILY_LOG,
  // Utility functions
  rangeStatus, estimateOsmolarity, calcGIR, girToGPerKg,
};
