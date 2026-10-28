// ============================================================
// NeoFeed — clinical data, formulas, reference values
// Sources:
//   PN  → ESPGHAN/ESPEN/ESPR/CSPEN 2018 (Clin Nutr 2018)
//   EN  → ESPGHAN Committee on Nutrition 2022 (JPGN 2022)
//   EN  → WHO 2023 Preterm Feeding Guidelines
//   Thai PN Guideline พ.ศ. 2564 (สมาคมโภชนาการเด็กแห่งประเทศไทย)
// ============================================================

// ── Provenance stamp ────────────────────────────────────────
// CONSTANTS_VERSION identifies the exact set of clinical constants that
// produced a printed number. It is written into Daily_Log columns AF/AG and
// printed in the order form's footer, so "which values compounded this bag?"
// stays answerable after the fact. Until 2026-08-26 nothing recorded it: the
// sheet knew WHO submitted an order and WHEN, never WHICH VALUES it used.
//
// 🔴 BUMP THIS whenever a change below can move a printed dose — KCMH_STOCK,
// MAX_DEXTROSE_G_KG, K_BAG_MEQ_PER_L, TPN_TARGETS, ENTERAL_TARGETS, EN_DB —
// and, since 2026-09-18, whenever calculator.jsx logic can move a printed
// figure. Not for comments, labels or UI. Not for FENTON_*: only fenton.jsx
// reads them, for the Growth tab, and nothing they give is printed, saved or
// dosed (2026-10-19; 2026-09-05.1 did bump for FENTON_WEIGHT). Every save stamps it into
// calcInput, and a saved order stamped with another version prints only after
// it is saved again (calculator.jsx, calcMoved). The register of what each
// version contains is docs/CLINICAL_CONSTANTS.md.
//
// The immediate reason this exists: the Na acetate (3 mEq/mL) and KCl
// (2 mEq/mL) stock strengths were INFERRED from the KCMH worksheet's divisors,
// not read off a strength label (BACKLOG.md § Now). If the shelf check comes
// back different, the question is "which printed orders used the old divisor?"
// — and this column is the only thing that can answer it.
//
// Format YYYY-MM-DD or YYYY-MM-DD.N (N = that day's change sequence). Pinned
// by test/verify-provenance-stamp.cjs, which also rejects a leading = + - @
// because the sheet would read that as a formula.
const CONSTANTS_VERSION = "2026-10-28.1";

// APP_VERSION identifies the frontend that ran the arithmetic. It used to be
// maintained by hand and was not bumped between 2026-08-27 and 2026-09-11,
// across PR #58 and two other frontend releases — so every row saved in that
// window claimed the 08-27 frontend (2026-09-11 review, P1). appVersion()
// below now derives the stamp from the ?v= cache-bust tokens actually loaded,
// which change on every deploy by definition. APP_VERSION stays only as the
// fallback for a context with no <script> tags (the Node test harnesses).
const APP_VERSION = "2026-09-11-review";
let _appVersionCache = null;
function appVersion() {
  if (_appVersionCache) return _appVersionCache;
  try {
    const parts = [];
    document.querySelectorAll('script[src*="?v="]').forEach(s => {
      const m = String(s.getAttribute("src")).match(/^(?:.*\/)?([A-Za-z][\w-]*)\.(?:jsx?)\?v=([\w.-]+)/);
      if (m) parts.push(m[1][0].toLowerCase() + "=" + m[2]);
    });
    // Starts with a letter by construction, so the sheet never reads it as a
    // formula (verify-provenance-stamp.cjs rejects a leading = + - @).
    if (parts.length) return (_appVersionCache = parts.join(";"));
  } catch (e) { /* no DOM — fall through */ }
  return APP_VERSION;
}

// ── Publish-lock rollout flag ───────────────────────────────
// Gates the "Save / Submit / Print" design (approved 2026-09-10): a saved
// Daily_Log row starts as a draft (prints with a "รอผลแลป" watermark) until a
// clinician explicitly Submits it, which locks the row — further edits create
// a new revision instead of overwriting it. The backend (publishLog,
// updateDailyNutrition's revision branch) is unconditional and always
// correct regardless of this flag; this only controls whether the Submit
// button and the draft watermark are shown to staff.
//
// Defaults OFF. NeoFeed is a live clinical tool with no frontend deploy gate
// (AI_SDLC.md §5) — a `main` push reaches every NICU workstation within
// minutes, so a UI-visible behaviour change like this ships dark first and is
// flipped on deliberately once the backend has been exercised against a real
// login, not just the harnesses in test/.
//
// Since 2026-10-28 the lock does not wait for this flag: the one Submit button
// (Save draft beside it) saves and then locks the row (calculator.jsx
// handleSave; TPN team, "Submit แล้วไม่ให้แก้แล้ว"). The flag now governs only
// the older second Submit step and its watermark, and stays off.
const ENABLE_PUBLISH_GATE = false;

// ── Sync freshness — the staleness banner's decision ────────
// "Is the number on screen still trustworthy?" is a clinical-safety rule, so
// it lives here in the Business Logic layer rather than as a ternary inside
// app.jsx (TDD.md §5.2 lists the layer violations we are not adding to).
// app.jsx only renders what this returns.
//
// The thresholds are this app's latency requirement written down: a registry
// under 5 minutes old is fine on a ward round, 5–15 minutes is worth
// flagging, and past 15 minutes the figures should not be acted on without a
// refresh. Stated as numbers on purpose — "real time" that cannot be given as
// a number is a preference, not a requirement.
const SYNC_WARN_MS  =  5 * 60 * 1000;
const SYNC_STALE_MS = 15 * 60 * 1000;

// How often a VISIBLE tab pulls from GAS on its own, with nobody touching it.
//
// Until 2026-09-16 there was no such interval: the app re-synced on login, on
// tab focus/visibilitychange, and on day rollover, and nothing else. On a
// ward workstation that is the one device it never fires for — the tab sits
// open and focused on the registry all shift, so no focus event is ever
// raised and the data simply ages. It crossed SYNC_WARN_MS after five
// minutes, SYNC_STALE_MS after fifteen, and then the staleness banner stayed
// on screen permanently, telling the ward to press Sync by hand — which is
// how "sync ใช้เวลานานกว่าปกติ" was reported: not a slow request, a sync that
// was never issued.
//
// 4 min, against SYNC_WARN_MS = 5: short enough that an ordinary visible tab
// never reaches even the warn tier, so the banner goes back to meaning what
// its own comment says it means — something is actually wrong — instead of
// meaning "nobody has clicked anything for a while".
//
// Cost is bounded on purpose, because every sync is also an Audit_Log row
// (logAudit("readRegistry") in gas-backend.gs) and that sheet already grows
// without bound (AI_SDLC.md § 1). 4 min = 15 rows/hour per open tab, and the
// poll is suppressed whenever the tab is hidden, the device is offline, or a
// request is already in flight — a backgrounded tab costs nothing at all.
const SYNC_POLL_MS = 4 * 60 * 1000;

// Age of the last SUCCESSFUL sync, clamped at 0. A device clock that jumps
// backwards (or a DST shift) would otherwise give a negative age and read as
// impossibly fresh — the one direction this must never fail in.
function _syncAgeMs(s) {
  if (s.lastSyncMs == null) return null;
  var now = s.nowMs == null ? Date.now() : s.nowMs;
  return Math.max(0, now - s.lastSyncMs);
}

// → { level: "local" | "offline" | "stale" | "warn" | "ok", ageMs }
function syncFreshness(s) {
  s = s || {};
  // GAS not configured → local/mock development. Never a clinical banner.
  if (!s.gasOn) return { level: "local", ageMs: null };
  // No network explains any sync error, so it outranks one. Showing "sync
  // error" to someone whose wifi has dropped sends them at the wrong problem.
  if (s.online === false) return { level: "offline", ageMs: _syncAgeMs(s) };

  var age = _syncAgeMs(s);
  // A failure one second ago is not freshness, and a session that has never
  // synced has nothing to trust. Both are stale.
  if (age === null || s.syncState === "error") return { level: "stale", ageMs: age };
  if (age >= SYNC_STALE_MS) return { level: "stale", ageMs: age };
  if (age >= SYNC_WARN_MS)  return { level: "warn",  ageMs: age };
  return { level: "ok", ageMs: age };
}

// ── Enteral feed composition per 100 mL ─────────────────────
// Units: kcal, pro/fat/cho in g, na/k in mmol, ca/p in mg, osm in mOsm/kg H₂O.
// 1 oz = 30 mL: 20 kcal/oz = 67, 22 = 73, 24 = 80, 27 = 90, 30 = 100 kcal/100 mL.
//
// Rebuilt 2026-10-17 from the sources themselves (provenance audit, Pp). Until
// then most formula rows came from docs/Chula_Handbook_Ed3_Reference.md, an AI
// extraction whose tables do not match the scanned book (commit 357d095): HiQ
// LF phosphorus was 76% high, Infatrini calcium 25% high, BM + HMF protein 13%
// high. Never use that .md as a source.
//
// So the source tables are copied below AS PRINTED, in the source's own units,
// and EN_DB is computed from them: each literal can be checked against its
// page, and a 24 or 27 kcal/oz row can never drift from its 20 kcal/oz row.
// Every row names its `source`. A row with none carries `unsourced: true`, and
// the Formula reference page says "No source" for it; the Calculator still
// offers it (Pp, 2026-10-20, until the feed formulas are revised). Checked by
// test/verify-en-db-sources.cjs, which holds its own copy of these tables. `osm` is shown on the Formula reference page only, and no
// calculation reads it; null means the source gives none at that strength.
const EN_MG_PER_MMOL = { na: 22.99, k: 39.10, ca: 40.08, p: 30.97 };
const EN_KCAL_PER_100ML = { 20: 67, 22: 73, 24: 80, 27: 90, 30: 100 };

// Chula Pediatric Nutrition Handbook, 3rd ed. (2565), docs/Nutrition PedCu Ed3.pdf.
// The formula tables are per 100 kcal, Na and K in mg. `kcalOz` is the strength
// the book prints the product at, the only one its osmolality applies to.
// p. = the book's printed page (the scanned PDF's page − 8).
const EN_SRC_CHULA_PER_100_KCAL = {
  // Table 5, p. 16 — preterm formula
  enfalacPremature: { pro: 3,   fat: 5.1, cho: 11,   naMg: 58, kMg: 100, ca: 120, p: 66, osm: 310, kcalOz: 24 },
  preNan:           { pro: 2.9, fat: 5.2, cho: 10.7, naMg: 43, kMg: 103, ca: 130, p: 76, osm: 263, kcalOz: 24 },
  hiQLbw:           { pro: 3.3, fat: 4.8, cho: 11.5, naMg: 86, kMg: 99,  ca: 123, p: 69, osm: 360, kcalOz: 24 },
  // Table 7, p. 18 — lactose-free formula
  enfalacLf:        { pro: 2.1, fat: 5.4, cho: 10.6, naMg: 46, kMg: 115, ca: 115, p: 77, osm: 200, kcalOz: 20 },
  hiQLf:            { pro: 2.4, fat: 5.2, cho: 10.8, naMg: 34, kMg: 80,  ca: 64,  p: 34, osm: 170, kcalOz: 20 },
  // Table 16, p. 29 — Infatrini powder (4 scoops, 20 g, + water 90 mL = 100 mL)
  infatriniPowder:  { pro: 2.6, fat: 5.4, cho: 10.3, naMg: 37, kMg: 100, ca: 99,  p: 54, osm: 345, kcalOz: 30 },
};

// WHO 2006, Optimal feeding of low-birth-weight infants: technical review.
// Box 1.3.1 (p. 16): term mature milk (> 30 days), per litre.
const EN_SRC_WHO_TERM_MILK_PER_L = { kcal: 640, pro: 12, fat: 34, cho: 67, naMmol: 9.0, kMmol: 13.9, caMmol: 6.5, pMmol: 4.8 };
// Chula Handbook p. 10 (PDF p. 18), "Human milk fortifier (per 4 packages)",
// Enfamil HMF (Mead Johnson) powder. The protein row reads 1 in every column,
// so the table is per 1 g protein whatever its title says. Pp, 2026-10-20: BM +
// HMF takes its fortifier from this page, not from WHO Box 1.3.3.
const EN_SRC_CHULA_ENFAMIL_HMF_PER_G_PROTEIN = { kcal: 13, fat: 0.9, cho: 0.4, naMg: 14.5, kMg: 26.4, ca: 81.8, p: 40.9 };
// The book gives no dose. One 4 g dose (4 packets) for 100 mL carries 1.1 g
// protein: WHO 2006 Box 1.3.3 (p. 19), the same product.
const EN_HMF_PROTEIN_G_PER_DOSE = 1.1;

// A Chula per-100-kcal column at a ward strength, per 100 mL.
function _enFromChula(col, kcalOz) {
  const kcal = EN_KCAL_PER_100ML[kcalOz], s = kcal / 100;
  return { kcal, pro: col.pro * s, fat: col.fat * s, cho: col.cho * s,
    na: col.naMg * s / EN_MG_PER_MMOL.na, k: col.kMg * s / EN_MG_PER_MMOL.k,
    ca: col.ca * s, p: col.p * s, osm: kcalOz === col.kcalOz ? col.osm : null };
}

// Term mature milk, Box 1.3.1 per litre → per 100 mL. Energy is the one
// departure: 67 is the 20 kcal/oz the label promises, inside Chula p. 8's
// mature-milk range (65.2–70 kcal/100 mL); the Box gives 64 ± 8.
const _EN_BM = (() => {
  const w = EN_SRC_WHO_TERM_MILK_PER_L;
  return { kcal: 67, pro: w.pro / 10, fat: w.fat / 10, cho: w.cho / 10,
    na: w.naMmol / 10, k: w.kMmol / 10,
    ca: w.caMmol * EN_MG_PER_MMOL.ca / 10, p: w.pMmol * EN_MG_PER_MMOL.p / 10, osm: null };
})();
// Mature milk + one dose of Enfamil HMF: the p. 10 column × 1.1 g protein.
// Osmolality stays null: p. 10 gives osmolarity in mOsm/L (377 estimated, 401
// from the literature), not the mOsm/kg H2O this field holds.
const _EN_BM_HMF = (() => {
  const h = EN_SRC_CHULA_ENFAMIL_HMF_PER_G_PROTEIN, g = EN_HMF_PROTEIN_G_PER_DOSE, b = _EN_BM;
  return { kcal: b.kcal + h.kcal * g, pro: b.pro + g, fat: b.fat + h.fat * g, cho: b.cho + h.cho * g,
    na: b.na + h.naMg * g / EN_MG_PER_MMOL.na, k: b.k + h.kMg * g / EN_MG_PER_MMOL.k,
    ca: b.ca + h.ca * g, p: b.p + h.p * g, osm: null };
})();
const _EN_INFATRINI = _enFromChula(EN_SRC_CHULA_PER_100_KCAL.infatriniPowder, 30);
// Alternating feeds: the mean of the two rows, per nutrient. The feeds are
// never mixed in one bottle, so there is no osmolality to average.
const _EN_FBM_INF_MIX = (() => {
  const mean = {};
  for (const f of ["kcal", "pro", "fat", "cho", "na", "k", "ca", "p"]) mean[f] = (_EN_BM_HMF[f] + _EN_INFATRINI[f]) / 2;
  return { ...mean, osm: null };
})();

const _EN_CHULA = EN_SRC_CHULA_PER_100_KCAL;
const EN_DB = {
  // ── Breast Milk ────────────────────────────────────────────
  // Composition varies widely — use measured values (mid-IR analyser) when available
  BM_20: {
    label: "Breast Milk (20 kcal/oz, mature)",
    ..._EN_BM, lf: false,
    source: "WHO 2006 technical review, Box 1.3.1 (term mature milk); kcal: Chula Handbook p. 8",
    note: "Term mature milk. Composition varies greatly — use measured values when available",
  },

  // ── Preterm formula ────────────────────────────────────────
  // No source: no product has this profile (per 100 kcal it is a term
  // formula: 2.2 g protein, 75 mg Ca). Pp, 2026-10-20: keep it as it was,
  // offered in the Calculator with its old numbers, until the feed formulas
  // are revised. `unsourced` only makes the Formula page say "No source".
  BM_PF_20: {
    label: "Preterm Formula (20 kcal/oz)",
    kcal: 67, pro: 1.5, fat: 3.5, cho: 7.4,
    na: 1.0, k: 1.7, ca: 50, p: 28,
    osm: 290, lf: false,
    unsourced: true,
  },
  // 22 kcal/oz is the ward's strength: "Preterm Formula (22 kcal/oz)" at 73
  // kcal/100 mL from the first commit until 357d095 named it Enfalac Premature
  // and set 74. The book prints the product at 24, so its osmolality (310)
  // does not apply here.
  FBM_PF_22: {
    label: "Enfalac Premature (22 kcal/oz)",
    ..._enFromChula(_EN_CHULA.enfalacPremature, 22), lf: false,
    source: "Chula Handbook Table 5, p. 16 (per 100 kcal)",
    note: "Enfalac Premature (MJN) · Ca:P 1.8:1 · whey:casein 60:40",
  },
  // Added by 357d095 at 22 kcal/oz; the book prints it at 24 (osmolality 263
  // there). The book lists Pre Nan with the preterm formulas (Table 5), and so
  // does the nutrition unit (2026-10-25); the Calculator grouped it as
  // post-discharge from 2026-09-28 until then.
  PRENAN_22: {
    label: "Pre Nan (22 kcal/oz)",
    ..._enFromChula(_EN_CHULA.preNan, 22), lf: false,
    source: "Chula Handbook Table 5, p. 16 (per 100 kcal)",
    note: "Pre Nan (Nestlé) · Ca:P 1.7:1 · whey:casein 70:30",
  },
  // The ward mixes Enfalac Premature and Pre Nan at 22 and at 24 kcal/oz
  // (nutrition unit, 2026-10-25). 24 is the strength the book prints them at,
  // so here its osmolality applies.
  ENFALAC_PREM_24: {
    label: "Enfalac Premature (24 kcal/oz)",
    ..._enFromChula(_EN_CHULA.enfalacPremature, 24), lf: false,
    source: "Chula Handbook Table 5, p. 16 (per 100 kcal)",
    note: "Enfalac Premature (MJN) · Ca:P 1.8:1 · whey:casein 60:40",
  },
  PRENAN_24: {
    label: "Pre Nan (24 kcal/oz)",
    ..._enFromChula(_EN_CHULA.preNan, 24), lf: false,
    source: "Chula Handbook Table 5, p. 16 (per 100 kcal)",
    note: "Pre Nan (Nestlé) · Ca:P 1.7:1 · whey:casein 70:30",
  },
  FBM_PF_24: {
    label: "Hi-Q LBW (24 kcal/oz)",
    ..._enFromChula(_EN_CHULA.hiQLbw, 24), lf: false,
    source: "Chula Handbook Table 5, p. 16 (per 100 kcal)",
    note: "Hi-Q LBW · Ca:P 1.8:1 · GOS/FOS, osmolality 360 → watch feed tolerance",
  },

  // ── BM + HMF ─────────────────────────────────────────────
  BM_HMF_24: {
    label: "FBM with HMF (24 kcal/oz)",
    ..._EN_BM_HMF, lf: false,
    source: "BM_20 + Enfamil HMF, Chula Handbook p. 10 (per 1 g protein) × 1.1 g protein per 4 g dose (WHO 2006 Box 1.3.3)",
    note: "Start HMF at ≥40 mL/kg/day · <32 wk or <1.5 kg (WHO 2023) · osmolarity 377 (estimated) to 401 mOsm/L (Chula p. 10)",
  },

  // ── Lactose-free — HiQ LF (the Calculator's LF rows) ──────
  LF_20: {
    label: "LF — HiQ LF (20 kcal/oz)",
    ..._enFromChula(_EN_CHULA.hiQLf, 20), lf: true,
    source: "Chula Handbook Table 7, p. 18 (per 100 kcal)",
    note: "HiQ LF 20 kcal/oz · Ca:P 1.9:1",
  },
  LF_24: {
    label: "LF — HiQ LF (24 kcal/oz)",
    ..._enFromChula(_EN_CHULA.hiQLf, 24), lf: true,
    source: "Chula Handbook Table 7, p. 18 (per 100 kcal), concentrated to 24 kcal/oz",
  },
  LF_27: {
    label: "LF — HiQ LF (27 kcal/oz)",
    ..._enFromChula(_EN_CHULA.hiQLf, 27), lf: true,
    source: "Chula Handbook Table 7, p. 18 (per 100 kcal), concentrated to 27 kcal/oz",
    note: "Ca and P below the ESPGHAN goal at 150 mL/kg → supplement oral Ca and P. Na may need a supplement",
  },

  // ── HiQ LF — the same rows, for the Formula reference page ─
  HIQLF_20: {
    label: "HiQ LF — 20 kcal/oz (67 kcal/100mL)",
    ..._enFromChula(_EN_CHULA.hiQLf, 20), lf: true,
    source: "Chula Handbook Table 7, p. 18 (per 100 kcal)",
  },
  HIQLF_24: {
    label: "HiQ LF — 24 kcal/oz (80 kcal/100mL)",
    ..._enFromChula(_EN_CHULA.hiQLf, 24), lf: true,
    source: "Chula Handbook Table 7, p. 18 (per 100 kcal), concentrated to 24 kcal/oz",
  },
  HIQLF_27: {
    label: "HiQ LF — 27 kcal/oz (90 kcal/100mL)",
    ..._enFromChula(_EN_CHULA.hiQLf, 27), lf: true,
    source: "Chula Handbook Table 7, p. 18 (per 100 kcal), concentrated to 27 kcal/oz",
    note: "Ca and P below the ESPGHAN goal at 150 mL/kg → supplement oral Ca and P",
  },

  // ── Enfalac LF (Mead Johnson) — the Formula reference page, and since
  // 2026-10-27 the Calculator's Lactose-free group (nutrition unit) ─
  ENFALAC_20: {
    label: "Enfalac LF — 20 kcal/oz (67 kcal/100mL)",
    ..._enFromChula(_EN_CHULA.enfalacLf, 20), lf: true,
    source: "Chula Handbook Table 7, p. 18 (per 100 kcal)",
  },
  ENFALAC_24: {
    label: "Enfalac LF — 24 kcal/oz (80 kcal/100mL)",
    ..._enFromChula(_EN_CHULA.enfalacLf, 24), lf: true,
    source: "Chula Handbook Table 7, p. 18 (per 100 kcal), concentrated to 24 kcal/oz",
    note: "P goal met at 150 mL/kg — Na still below goal",
  },
  ENFALAC_27: {
    label: "Enfalac LF — 27 kcal/oz (90 kcal/100mL)",
    ..._enFromChula(_EN_CHULA.enfalacLf, 27), lf: true,
    source: "Chula Handbook Table 7, p. 18 (per 100 kcal), concentrated to 27 kcal/oz",
    note: "Ca goal met at 150 mL/kg",
  },

  // ── Infatrini (Nutricia) — 100 kcal/100 mL ────────────────
  // Pre-concentrated, has lactose. The book's liquid column differs slightly
  // (Ca 100, P 56, osmolality 360); the powder is the one this row has used.
  INFATRINI_30: {
    label: "Infatrini (30 kcal/oz)",
    ..._EN_INFATRINI, lf: false,
    source: "Chula Handbook Table 16, p. 29 (Infatrini powder, per 100 kcal = per 100 mL)",
    note: "Infatrini powder (Nutricia) · 100 kcal/100mL · Ca:P 1.8:1",
  },

  // ── Mixed feeds ────────────────────────────────────────────
  FBM_INF_MIX: {
    label: "FBM 24 ↔ Infatrini 30 (alternating)",
    ..._EN_FBM_INF_MIX, lf: false,
    source: "Mean of BM_HMF_24 and INFATRINI_30",
    note: "Half feeds FBM 24, half Infatrini — values are the mean of the two rows",
  },
};

// ── What the Calculator's Step 2 offers: a feed, then its strength ─────────
// Pp, 2026-10-28: pick the milk, then its kcal/oz, for each of up to two
// feeds. Every strength is an EN_DB row above, so a saved order still holds
// one EN_DB key per feed (calcInput.enType / enType2) and every row keeps its
// source. The strengths are the ones the formulary already had (nutrition
// unit, 2026-10-25 and 2026-10-27); offering another one is a decision for Pp
// and the nutrition unit: add its EN_DB row from the book's per-100-kcal
// column (_enFromChula), then its [kcalOz, key] pair here. Product ids are
// lower case so they can never be read as an EN_DB key.
const EN_PRODUCTS = [
  { id: "bm",          group: "Breast Milk",         label: "Breast Milk (mature)",          strengths: [[20, "BM_20"]] },
  { id: "bmHmf",       group: "Breast Milk",         label: "FBM with HMF",                  strengths: [[24, "BM_HMF_24"]] },
  { id: "pf",          group: "Preterm formula",     label: "Preterm Formula",               strengths: [[20, "BM_PF_20"]] },
  { id: "enfalacPrem", group: "Preterm formula",     label: "Enfalac Premature",             strengths: [[22, "FBM_PF_22"], [24, "ENFALAC_PREM_24"]] },
  { id: "preNan",      group: "Preterm formula",     label: "Pre Nan",                       strengths: [[22, "PRENAN_22"], [24, "PRENAN_24"]] },
  { id: "hiQLbw",      group: "Preterm formula",     label: "Hi-Q LBW",                      strengths: [[24, "FBM_PF_24"]] },
  { id: "fbmInfMix",   group: "High-energy formula", label: "FBM 24 ↔ Infatrini 30 (alternating)", strengths: [["24 ↔ 30", "FBM_INF_MIX"]] },
  { id: "infatrini",   group: "High-energy formula", label: "Infatrini",                     strengths: [[30, "INFATRINI_30"]] },
  { id: "hiQLf",       group: "Lactose-free",        label: "LF — HiQ LF",                   strengths: [[20, "LF_20"], [24, "LF_24"], [27, "LF_27"]] },
  { id: "enfalacLf",   group: "Lactose-free",        label: "Enfalac LF",                    strengths: [[20, "ENFALAC_20"], [24, "ENFALAC_24"], [27, "ENFALAC_27"]] },
];
// Feed 1 + feed 2 together, at most 8 feeds a day (q3h); q4h is 6 (Pp,
// 2026-10-28: "Feed 1+2 รวมกันมากสุดจะได้แค่ 8 มื้อ หรือถ้ากินทุก 4 ชม ก็จะได้
// 6 มื้อ"). Above it a two-feed order cannot be submitted, and the two must be
// on one regular schedule (24 h ÷ their total is whole hours: 6 + 2, 4 + 4, 3 + 3).
const EN_FEEDS_PER_DAY_MAX = 8;

// The product and strength an EN_DB key is offered as, or null for a key the
// Calculator does not offer (the Formula page's HIQLF_* copies).
function enProductOf(key) {
  for (const product of EN_PRODUCTS) {
    const s = product.strengths.find(([, k]) => k === key);
    if (s) return { product, kcalOz: s[0] };
  }
  return null;
}

// Per 100 mL, what the day's feeds provide together: each feed's EN_DB row
// weighted by the mL/day it is given (Pp, 2026-10-28: two feeds). Every enteral
// figure is mL/day ÷ 100 × this, so it is the sum over the feeds. A day with
// one feed returns that feed's own row, so its figures are exactly what they
// were before there could be two. `feeds` is [{ key, mlPerDay }], feed 1 first.
// A feed given from a key EN_DB does not hold (a row removed since the order
// was saved, or written by a newer NeoFeed) has no composition: null, never
// the other feed's, and the Calculator refuses the order (enFeedsUnknown).
const EN_NUTRIENTS = ["kcal", "pro", "fat", "cho", "na", "k", "ca", "p"];
function enFeedsUnknown(feeds) {
  return feeds.filter(f => f.mlPerDay > 0 && !EN_DB[f.key]).map(f => f.key);
}
function enMixPer100mL(feeds) {
  if (enFeedsUnknown(feeds).length > 0) return null;
  const given = feeds.filter(f => f.mlPerDay > 0);
  if (given.length < 2) return EN_DB[(given[0] || feeds[0]).key] || null;
  const total = given.reduce((s, f) => s + f.mlPerDay, 0);
  const mix = { osm: null, lf: given.every(f => EN_DB[f.key].lf) };
  for (const n of EN_NUTRIENTS) mix[n] = given.reduce((s, f) => s + EN_DB[f.key][n] * f.mlPerDay, 0) / total;
  return mix;
}

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
// Reference list of strengths that EXIST — NOT the ones the TPN calculator uses.
// KCMH_STOCK (below) is the single authority for what the calculator and the
// printed order form compound from; entries here marked "KCMH TPN" match it.
// Do not wire this table into the calculator without reconciling it first —
// its NaCl 3% / KCl 1 mEq/mL rows are other strengths, not KCMH's TPN stock.
const SALT_SOURCES = {
  // Sodium
  NaCl_3:      { label: "NaCl 3%",                   ion: "Na", mEqPerML: 0.51,  group: "sodium" },
  NaCl_5:      { label: "NaCl 5%",                   ion: "Na", mEqPerML: 0.86,  group: "sodium" },
  NaCl_15:     { label: "NaCl 15%",                  ion: "Na", mEqPerML: 2.56,  group: "sodium" },
  NaCl_20:     { label: "NaCl 20%",                  ion: "Na", mEqPerML: 3.42,  group: "sodium", note: "KCMH TPN stock" },
  Na_Acetate:  { label: "Na Acetate",                ion: "Na", mEqPerML: 3.0,   group: "sodium", note: "KCMH TPN stock · use to correct metabolic acidosis; contributes Na" },
  // Disodium glycerophosphate = Glycophos® — as on order form:
  // Input: mL/kg/day → Na = 2 mEq/mL · P = 31 mg/mL
  Na_diphos:   { label: "Disodium glycerophosphate (Glycophos®)", ion: "NaP",
                 mEqNaPerML: 2.0, pMgPerML: 31,
                 group: "sodium", note: "Na = 2 mEq/mL · P = 31 mg/mL — dose in mL/kg/d (preferred P source: organic phosphate)" },
  // Potassium
  KCl:         { label: "KCl (2 mEq/mL)",             ion: "K",  mEqPerML: 2.0,   group: "potassium", note: "KCMH TPN stock" },
  KCl_746:     { label: "KCl 7.46%",                  ion: "K",  mEqPerML: 1.0,   group: "potassium", note: "1 mEq/mL — not the TPN stock" },
  K2HPO4:      { label: "K₂HPO₄",                    ion: "KP", mEqKPerML: 1.0,  pMgPerMEqK: 15.5, group: "potassium", note: "K⁺ 1 mEq/mL · P 15.5 mg/mEq K" },
  // Calcium — order form: elemental Ca 9 mg/mL
  Ca_Gluconate:{ label: "Ca Gluconate 10%",            ion: "Ca", mgPerML: 9.01755, group: "calcium",  note: "KCMH TPN stock · elemental Ca 9.0 mg/mL (0.45 mEq/mL)" },
  // Magnesium — KCMH uses 10% only; the 50% row is gone (Pp, 2026-10-27)
  MgSO4_10:    { label: "MgSO₄ 10%",                 ion: "Mg", mEqPerML: 0.812, group: "magnesium", note: "KCMH TPN stock · preterm: 0.4 mEq/kg/day" },
};

// ── Vitamins / additives ──────────────────────────────────────
const ADDITIVE_PRODUCTS = {
  VITALIPID_INF: { label: "Vitalipid N Infant® (fat-soluble vit)",  dose: "4 mL/kg/day (max 10 mL/day) — add to lipid bag",   note: "BW <2.5 kg: 4 mL/kg · BW ≥2.5 kg: 10 mL/day" },
  SOLUVIT_N:     { label: "Soluvit N® (water-soluble vit)",          dose: "1 mL/kg/day — add to aqueous PN bag" },
  PEDITRACE:     { label: "Peditrace® (trace elements)",             dose: "1 mL/kg/day (maximum 15 mL/day) — add to aqueous PN bag", note: "Provides Zn 250 µg, Cu 20 µg, Mn <1 µg, Se 2 µg, I 1 µg per mL" },
};

// ============================================================
// TARGET SYSTEMS
// ============================================================

// The last DOL of Mihatsch 2018's "first days of life" Ca, P and Mg ranges
// (TPN team, 2026-10-25: "7 วัน").
const FIRST_DAYS_LAST_DOL = 7;

// Jochum 2018's "preterm neonate < 1500 g", on the weight the fluid tier uses
// (TARGETS.fluid): the dosing weight, held at birth weight until it is
// regained. With no weight known, the ≥ 1500 g row.
function _jochumUnder1500(wtG, bwG) {
  const w = (bwG && wtG < bwG) ? bwG : wtG;
  return w > 0 && w < 1500;
}

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
  // Advancing: 70–100 kcal/kg/day DOL 3–7. Not Moltu's figure (PN late acute,
  // preterm, is 60–80): the TPN team kept 70–100 as the unit's own range
  // (2026-10-25, targets audit of 2026-09-28 § 9).
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

  // Electrolytes mEq/kg/day — Jochum F et al. 2018, Tables 1–3, preterm rows
  // (TPN team, 2026-10-25: "follow the source" for Na DOL 3–7 and K DOL ≤ 7).
  // DOL 1–5 are Table 1's day columns, DOL 6–7 Table 2 (intermediate phase),
  // DOL 8 on Table 3 (stable growth). The weight group is the fluid tier's
  // weight (_jochumUnder1500 below). A bracketed upper value in the tables,
  // "(7)", is for high urinary Na loss and is not the band. Term rows are not
  // used: whether term infants get their own rows is still open (§ 2.5 item 7).
  na: (dol, wtG, bwG) => {
    if (!dol || dol <= 2) return [0, 2];   // Table 1 D1–2: 0–2 (3)
    if (dol === 3) return _jochumUnder1500(wtG, bwG) ? [0, 5] : [0, 3];  // D3: < 1500 g 0–5 (7), > 1500 g 0–3
    if (dol <= 7) return [2, 5];           // D4–5 2–5 (7) · Table 2 preterm 2–5
    // Stable: 2–5 as before. Table 3 gives 3–5 for both preterm rows (< 1500
    // and > 1500 g) and 2–3 for term; raising the floor to 3 by weight would
    // push term infants off their own row, so it waits for the term question.
    return [2, 5];
  },
  k: (dol, wtG, bwG) => {
    if (!dol || dol <= 3) return [0, 3];   // Table 1 D1–3: 0–3
    if (dol <= 5) return [2, 3];           // Table 1 D4–5: 2–3
    if (dol <= 7) return [1, 3];           // Table 2 (intermediate): 1–3
    // Table 3 splits K by weight as printed: preterm < 1500 g 2–5, preterm
    // > 1500 g 1–3, term 1.5–3. At or above 1500 g NeoFeed keeps its old 2–3,
    // inside both of those rows, until the term rows are decided.
    return _jochumUnder1500(wtG, bwG) ? [2, 5] : [2, 3];
  },

  // Calcium mg/kg/day — Mihatsch 2018 (ESPGHAN 2018)
  // First days: 0.8–2.0 mmol/kg × 40 = 32–80 mg/kg
  // Growing (stable): 1.6–3.5 mmol/kg × 40 = 64–140 mg/kg
  // Mihatsch never says when "the first days of life" end. The TPN team set
  // DOL 7 (2026-10-25); until then Ca and P switched after DOL 1, Mg after DOL 2.
  ca: (dol) => {
    if (!dol || dol <= FIRST_DAYS_LAST_DOL) return [32, 80];   // 0.8–2.0 mmol×40 = 32–80 mg/kg
    return [64, 140];                          // Growing: 1.6–3.5 mmol×40 = 64–140 mg/kg
  },

  // Phosphorus mg/kg/day — Mihatsch 2018 (ESPGHAN 2018)
  // First days: 1.0–2.0 mmol/kg × 31 = 31–62 mg/kg
  // Growing premature: 1.6–3.5 mmol/kg × 31 = 50–108 mg/kg
  p: (dol) => {
    if (!dol || dol <= FIRST_DAYS_LAST_DOL) return [31, 62];   // 1.0–2.0 mmol×31 = 31–62 mg/kg
    return [50, 108];                          // Growing: 1.6–3.5 mmol×31 = 50–108 mg/kg
  },

  // Magnesium, elemental mg/kg/day — Mihatsch 2018 (ESPGHAN 2018), the mg column:
  // first days 0.1–0.2 mmol/kg = 2.5–5 mg/kg · growing 0.2–0.3 mmol = 5–7.5 mg/kg.
  // In mg since 2026-10-28 (TPN team; Pp chose the guideline's round mg figures
  // over the exact 2.43 mg per 0.1 mmol). It was 0.2–0.4 / 0.4–0.6 mEq/kg.
  mg: (dol) => {
    if (!dol || dol <= FIRST_DAYS_LAST_DOL) return [2.5, 5];
    return [5, 7.5];
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

  // Fluid mL/kg/day by DOL and birth-weight tier (grams)
  // ESPGHAN 2018: Jochum F et al. — 4-tier by BW (ELBW / VLBW / preterm / term)
  // wtG is the current dosing weight; bwG (optional) applies the birth-weight
  // floor Pp set 2026-09-24: while the infant is still below birth weight
  // (postnatal loss) the tier is held at birth weight rather than dropping into
  // a lighter, higher-fluid tier off the nadir, and it tracks current weight
  // once regained. Called without bwG it floors nothing (legacy behaviour).
  fluid: (dol, wtG, bwG) => {
    // From DOL 6 every preterm tier is Jochum's Tables 2–3: 140–160. Until
    // 2026-10-27 ELBW stayed at 160–180 for the rest of the stay and VLBW had
    // 140–160 on DOL 5, where Table 1 gives 160–180 (TPN team, 2026-10-25:
    // follow the source).
    const w = (bwG && wtG < bwG) ? bwG : wtG;
    const d = Math.min(dol, 7);
    if (w < 1000) {           // ELBW <1000g — highest IWL, humidified incubator essential
      const map = {1:[80,100], 2:[100,120], 3:[120,140], 4:[140,160], 5:[160,180], 6:[140,160], 7:[140,160]};
      return map[d] || [140, 160];
    }
    if (w < 1500) {           // VLBW 1000–1500g
      const map = {1:[70,90], 2:[90,110], 3:[110,130], 4:[130,150], 5:[160,180], 6:[140,160], 7:[140,160]};
      return map[d] || [140, 160];
    }
    if (w < 2500) {           // Preterm >1500g
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
    return [115, 140];                 // Full nutrition target (ESPGHAN 2022 EN; was 110 — the 2010 floor)
  },

  // Lipid g/kg/day
  lipid: (dol) => {
    if (dol <= 1) return [0.5, 1.0];
    if (dol <= 7) return [1.0, 4.0];
    return [4.8, 8.1];   // Full enteral
  },

  // Sodium and potassium mEq/kg/day — the PN rows, TPN_TARGETS.na/k (Jochum
  // 2018 Tables 1–3; TPN team, 2026-10-25). One copy, so the two cannot drift.
  na: (dol, wtG, bwG) => TPN_TARGETS.na(dol, wtG, bwG),
  k:  (dol, wtG, bwG) => TPN_TARGETS.k(dol, wtG, bwG),

  // Calcium mg/kg/day — Mihatsch 2018 (ESPGHAN 2018)
  // First days (DOL 1–7): 0.8–2.0 mmol/kg × 40 = 32–80 mg/kg
  // Growing (stable): 1.6–3.5 mmol/kg × 40 = 64–140 mg/kg
  ca: (dol, isEnteral) => {
    if (isEnteral) return [120, 200];       // ESPGHAN 2022 EN: 3.0–5.0 mmol×40
    return TPN_TARGETS.ca(dol);
  },

  // Phosphorus mg/kg/day — Mihatsch 2018 (ESPGHAN 2018)
  // First days (DOL 1–7): 1.0–2.0 mmol/kg × 31 = 31–62 mg/kg
  // Growing premature: 1.6–3.5 mmol/kg × 31 = 50–108 mg/kg
  p: (dol, isEnteral) => {
    if (isEnteral) return [70, 115];        // ESPGHAN 2022 EN: 2.2–3.7 mmol×31
    return TPN_TARGETS.p(dol);
  },

  // Magnesium, elemental mg/kg/day — TPN_TARGETS.mg: DOL 1–7 2.5–5, then 5–7.5,
  // the bounds the Mg chips sit on
  mg: (dol) => TPN_TARGETS.mg(dol),

  // Ca:P mass ratio — order form: Ca:P ~1.7:1 target
  // ESPGHAN 2018 molar 0.8–1.3:1 → mass 1.0–1.68 ≈ 1.7:1
  caP: () => [1.0, 1.7],   // mass ratio; ESPGHAN molar 0.8–1.3 → mass 1.0–1.7; KCMH aim 1.7:1

  // Non-protein energy per gram amino acid (classic NPC:N 150 ÷ 6.25 g AA/g N
  // = 24 kcal/g AA). No upper end: ESPGHAN's 30–40 kcal/g is a minimum, not a
  // ceiling, and the TPN team removed the > 32 hard limit (2026-10-25).
  // At least 24 · soft-alert 20–<24 · caution < 20 · critical < 12 (IV portion,
  // calculator.jsx NPE_CRIT_LO).
  npePerGAA: () => [24, Infinity],

  // Protein:Energy ratio — ESPGHAN 2022 EN
  // 2.8–3.6 g protein per 100 kcal → ensures lean mass accretion
  peRatio: () => [2.8, 3.6],
};

// ── KCMH pharmacy stock concentrations ────────────────────────
// Single source of truth for every "how many mL of stock solution" conversion.
// Source-verified 2026-08-06 against the official KCMH TPN worksheet
// ("TPN 05082569.xlsx", ward 9B2/NICU templates — sheets "NEW Temphate",
// "Starter TPN", "s tpn2/3"). Each `perMl` below is the divisor the official
// sheet uses, so NeoFeed's mL/day match what กลุ่มงานเภสัชกรรม compounds.
//
// DO NOT change these to textbook/other-hospital strengths — they describe
// what is physically on the shelf at KCMH. Changing one silently changes
// every printed order form.
const KCMH_STOCK = {
  d50w:        { label: "D50W",                  gPerMl: 0.5 },
  // Amino acid — `label` is what the pharmacy form prints, `short` what the
  // screen and the copied order say. Which one a patient may be ordered is
  // aaProductsFor() below, not this table.
  // PED AMINE is 10 % too, so the same mL (Pp, 2026-10-28); the form names both.
  aminoven10:  { label: "10% Aminoven infant / PED AMINE", short: "Aminoven 10%", gPerMl: 0.10 },
  // B. Braun Aminoplasmal 15%: 150 g amino acids/L (UK SmPC; Na 5.3 mmol/L,
  // theoretical osmolarity 1290 mOsm/L — neither modelled, as for Aminoven).
  // Its label contraindicates it in newborn infants, infants and toddlers
  // under 2 years (UK SmPC; Singapore HSA), so it is kept for older children
  // and no newborn ward is offered it (Praew, 2026-09-18).
  aminoplasmal15: { label: "15% Aminoplasmal",   short: "Aminoplasmal 15%", gPerMl: 0.15,
                 caution: "ฉลากยา: ห้ามใช้ในทารกและเด็กอายุต่ำกว่า 2 ปี (not for < 2 years)" },
  smof20:      { label: "20% SMOF",              gPerMl: 0.20 },
  // Na sources — sheet rows 20/21/23
  naCl:        { label: "20% NaCl",              naMeqPerMl: 3.42 },  // H20 = mEq ÷ 3.42
  // acetateMeqPerMl: read it off the vial label before setting it. The TPN
  // team gave "Na 3, acetate 6 mEq" per mL (2026-09-28), but sodium acetate is
  // 1 : 1, so 6 may be the label's osmolarity; Praew chose to wait for the
  // label. While null, the calculator shows no acetate.
  naAcetate:   { label: "Na Acetate",            naMeqPerMl: 3.0, acetateMeqPerMl: null },  // H21 = mEq ÷ 3
  glycophos:   { label: "Glycophos®",            naMeqPerMl: 2, pMgPerMl: 31 },
  // K sources — sheet rows 27/29
  k2hpo4:      { label: "K₂HPO₄",                kMeqPerMl: 1, pMgPerKMeq: 15.5 },
  kCl:         { label: "KCl",                   kMeqPerMl: 2.0   },  // I29 = mEq ÷ 2
  // Mg — sheet row 32 offers both; the recipe line (J32) defaults to 10%
  mgso4_10:    { label: "10% MgSO₄",             mgMeqPerMl: 0.812 }, // I32 = mEq×2/8.12×5
  // Ca — sheet row 36: 0.45 mEq/mL × 20.039 = 9.01755 mg elemental Ca/mL
  caGluconate: { label: "10% Ca gluconate",      caMgPerMl: 9.01755, caMeqPerMl: 0.45 },
  // Additives — sheet rows 43/45/51
  soluvit:     { label: "Soluvit N®",            mlPerKg: 1.0, maxMl: 10 },
  // Zn 250 µg/mL, the fluoride-containing Peditrace (pharmacy, 2026-10-25).
  peditrace:   { label: "Peditrace",             mlPerKg: 1.0, maxMl: 15, znMgPerMl: 0.25 },
  // Pharmacy's ZnSO₄ stock: 1 mg elemental Zn/mL, and the paper form's "ZnSO₄
  // … mg" is elemental Zn too (pharmacy, 2026-10-25). Not on the KCMH sheet.
  znso4:       { label: "ZnSO₄",                 znMgPerMl: 1 },
  heparin:     { label: "Heparin",               unitsPerMl: 100 },
};

// Max dextrose, g/kg/day: Mesotten 2018 R 5.4, glucose at most 12 mg/kg/min
// = 17.3 g/kg/d (TPN team, 2026-10-25: follow the source). The KCMH sheet's
// own limit is 18 (F9 = 18 × weight), about 12.5 mg/kg/min, which this was
// until 2026-10-27.
const MAX_DEXTROSE_G_KG = 17.3;
// The TPN room's largest bottle, mL (TPN team, 2026-10-25). A bag whose
// prepared volume is above it cannot be ordered: Submit and Print refuse it,
// as for K⁺ over the route's maximum (Pp, 2026-10-27: "ห้ามสั่ง").
const TPN_BOTTLE_MAX_ML = 1250;
// Oral vitamin D is dosed per kg (ESPGHAN 2022, 400–700 IU/kg/d) with an
// upper border of 1,000 IU a day from the nutrition unit's range file
// (2026-10-25). Above it is a caution.
const VIT_D_MAX_IU_DAY = 1000;
// Heparin in the aqueous bag, U/mL: the usual 0.5–1 (KCMH default 1). Above
// it is a caution, so a tenfold 10 U/mL is caught (TPN team, 2026-10-25).
const HEPARIN_USUAL_MAX_U_ML = 1;
// K⁺ concentration in the finished bag, mEq/L, by route (TPN team meeting and
// Praew, 2026-09-28): amber above `warn`; critical above `red`, ordered only
// with a confirmed reason; and above `hardMax` not ordered at all — Save and
// Print refuse it (Praew: "K ทาง central ลดเป็น 120 ให้ขึ้นแดง แต่ max ที่ 200").
// Central red at 120 follows published neonatal practice (IWK Health NICU);
// nothing published supports more than 120 (docs/CLINICAL_CONSTANTS.md).
// Reviewing PR #129, Praew set the 200 maximum on both routes ("max 200
// ทั้งสองสาย"): on central only, switching a bag to Peripheral turned the stop
// into a critical alert that a typed reason cleared. On 2026-10-08 she lowered
// the peripheral maximum to 60 ("เพดาน K⁺ สาย peripheral จะให้อยู่ที่ 60"), the
// same figure as its red: above 60 a peripheral bag cannot be ordered at all,
// so the confirm-with-a-reason tier no longer exists on that route.
// Replaces the KCMH worksheet's single 40 mEq/L stop (G25), which the team
// cancelled.
const K_BAG_MEQ_PER_L = {
  peripheral: { warn: 40, red: 60,  hardMax: 60 },
  central:    { warn: 60, red: 120, hardMax: 200 },
};
const kBagLimitsFor = (route) => K_BAG_MEQ_PER_L[route === "central" ? "central" : "peripheral"];
// Lipid infusion rate ceiling, g/kg/h (TPN team meeting and Praew, 2026-09-28):
// amber above `warn`, critical above `max`. Graded on the figure the pump card
// shows (2 decimals), so its colour never disagrees with its number.
const LIPID_GKGH = { warn: 0.13, max: 0.17 };
// Total elemental zinc reaching the infant per day — Peditrace plus ZnSO₄ —
// above which an order is a critical alert (KCMH TPN team, 2026-09-22).
const MAX_ZN_MG_DAY = 5;
// The TPN calc. weight, which the attending may type over the automatic one
// (calculator.jsx, since 2026-09-15); every dose and mL on the order follows
// it. Pp, 2026-10-08, after an outside review saved a 900 g infant's order
// dosed at 8,500 g: outside TPN_WT_RANGE_G the order cannot be saved at all,
// draft included (the bounds of a Daily_Log weight; gas-backend.gs refuses it
// too), and a typed weight more than TPN_WT_MANUAL_MAX_DIFF (a fraction) away
// from the automatic one is critical, so it is ordered only with a reason.
// Alert thresholds: they move no dose, so CONSTANTS_VERSION stays.
const TPN_WT_RANGE_G = [200, 8000];
const TPN_WT_MANUAL_MAX_DIFF = 0.2;
// Elemental Mg, MW 24.305 g/mol ÷ valence 2 = mg per mEq. Since 2026-10-28 the
// Mg box takes mg/kg/d and divides by this to store mEq (calcInput.mgPerKg);
// KCMH_STOCK.mgso4_10's mEq/mL stays the mL authority.
const MG_MG_PER_MEQ = 12.1525;
// Ceiling of minimal enteral / trophic feeding, mL/kg/day — the "MEF (trophic)
// 12–24 mL/kg/day" step of the app's own Feeding Advancement card. A feed
// ticked MEN counts toward neither fluid nor nutrition, and orders prefill
// from yesterday, so MEN still ticked above this is a warning (never a stop):
// the feed was probably advanced and the tick left on (Praew, 2026-09-18).
const MEN_MAX_ML_KG = 24;

// ── Numbers a person reads ────────────────────────────────────
// Every figure on a screen, the pharmacy form or a copied order goes through
// here: at most `maxDecimals`, and never a trailing zero — "18.0" can be read
// as 180 (Praew, 2026-09-22: "ห้ามมี .0 เช่น 18.0 คือ 18"; the ISMP rule). Display
// only: saved rows keep full precision. Rounds half away from zero (Pp,
// 2026-10-27: "1.25 > 1.3"), after clearing the float tail at 6 decimals of
// the scaled value: 1.5 × 0.7 is 1.0499999999999998 in JS and printed "1"
// beside a K₂HPO₄ mL of 1.1 (Vera, 2026-10-27). Takes numbers or numeric
// strings (GAS returns both); null, "", NaN and ±Infinity print "—".
function displayNum(value, maxDecimals = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const x = Number(value);
  if (!isFinite(x)) return "—";
  const p = Math.pow(10, maxDecimals);
  const scaled = Math.round(Math.abs(x) * p * 1e6) / 1e6;
  const r = Math.sign(x) * Math.round(scaled) / p;
  return String(r === 0 ? 0 : r);   // never "-0"
}

// ── Traffic-light status helper ───────────────────────────────
function rangeStatus(value, [lo, hi], { hardHi = null, hardLo = null } = {}) {
  if (value === 0) return "empty";
  // Positive Infinity = nutrient present with no opposing nutrient (e.g. Ca with zero P)
  if (!isFinite(value)) return value > 0 ? "crit" : "empty";
  if (hardHi != null && value > hardHi) return "crit";
  if (hardLo != null && value < hardLo) return "crit";
  if (value < lo || value > hi) return "warn";
  return "ok";
}

// ── GIR: ONE grading, used by every screen that grades a GIR ──
// The Calculator graded GIR as rangeStatus(gir, [4,12], { hardHi: 13 }) while
// the Alerts page graded the SAME saved number as `gir > 12 → critical`. A
// logged GIR of 12.5 was therefore amber on the order it came from and red on
// the alert list, with no way for a nurse to tell which screen to believe
// (2026-09-23). The threshold was never in dispute — only that two screens
// each carried their own copy of it. It now lives here, and both call this.
//   4–12 mg/kg/min  ok   · outside that  warn  · above GIR_HARD_HI  crit
// 12 is Mesotten 2018 R 5.4's maximum (TPN team, 2026-10-25: follow the
// source). From 2026-09-22 to 2026-10-27 it was 13, with 12–13 an amber
// margin (Praew: "GIR bar turn red at >13").
const GIR_HARD_HI = 12;
// Energy ceiling — ESPGHAN 2022 EN: 140–160 kcal/kg/d only for suboptimal
// growth, once protein and other nutrients are sufficient, and never above
// 160 (CUPA 2023 lecture, slide 17). 140–160 grades amber, above 160 red.
const KCAL_HARD_HI = 160;
// Hard limits that had no source from the first commit until the TPN team set
// them (2026-10-25, provenance audit of 2026-10-17 § 3.8). Each is critical
// above the figure, so it is ordered only with a reason; NPE:AA below 12 is a
// red line that asks for none (Pp, 2026-10-27).
//   protein, total TPN + EN, g/kg/d: 4.5 (was 4.8; ESPGHAN 2022's enteral ceiling)
//   lipid, IV only, g/kg/d:          4.0 (was 4.5; ESPGHAN 2018, at most 4)
//   K, IV only, mEq/kg/d:            5.0 at every weight (was 3.5; Jochum 2018
//                                    Table 3 gives < 1500 g 2–5; Pp, 2026-10-27)
//   NPE:AA, IV only, kcal/g AA:      red below 12, no reason asked; the > 32
//                                    ceiling is gone
//   osmolarity, peripheral, mOsm/L:  900 and above as printed (the KCMH form
//                                    says "<900"; Pp, 2026-10-27); the 850
//                                    caution had no source and is gone
const PROTEIN_HARD_HI = 4.5;
const LIPID_IV_HARD_HI = 4.0;
const K_IV_HARD_HI = 5.0;
const NPE_IV_CRIT_LO = 12;
const OSM_PERIPHERAL_MAX = 900;
function girStatus(gir) {
  return rangeStatus(gir, TARGETS.gir(), { hardHi: GIR_HARD_HI });
}

// ── Osmolarity estimate (mOsm/L) ─────────────────────────────
// Matches the official KCMH worksheet cell E52 exactly (verified 2026-08-06
// by reproducing its own cached results: 856 and 896 mOsm/L on sheets s tpn2/s tpn3):
//   Osm (mOsm/L) = 50×D% + 100×AA% + 2×Na(mEq/L) + 2×K(mEq/L) + 1.4×Ca(mEq/L) + 1×Mg(mEq/L)
// Ca unit: caMgPerL = elemental Ca mg/L → convert to mEq/L ÷20 (MW=40, valence=2)
// Peripheral limit: <900 mOsm/L · Central: no upper limit (Praew, 2026-09-28; it
// used to warn above 1800 mOsm/L)
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
      // TARGETS.fluid's tiers. Jochum Table 1 to DOL 5, Tables 2–3 after.
      elbw:   { d1:[80,100], d2:[100,120], d3:[120,140], d4:[140,160], d5:[160,180], d6plus:[140,160] },
      vlbw:   { d1:[70,90],  d2:[90,110],  d3:[110,130], d4:[130,150], d5:[160,180], d6plus:[140,160] },
      preterm:{ d1:[60,80],  d2:[80,100],  d3:[100,120], d4:[120,140], d5:[140,160], d6plus:[140,160] },
      term:   { d1:[40,60],  d2:[50,70],   d3:[60,80],   d4:[60,100],  d5:[100,140], d6plus:[140,160] },
      note: "ESPGHAN guideline ranges — no absolute max. Attending may use up to 200 mL/kg/day per clinical judgment. ELBW in humidified incubator: IWL ≈30 vs open warmer ≈120 mL/kg/day",
    },
    electrolytes: {
      // TPN_TARGETS.na/k: Jochum Table 1 to DOL 5, Table 2 DOL 6–7, Table 3 DOL 8+.
      na: {
        under1500: { d1to2:[0,2], d3:[0,5], d4to7:[2,5], stable:[2,5] },
        over1500:  { d1to2:[0,2], d3:[0,3], d4to7:[2,5], stable:[2,5] },
        unit: "mmol/kg/day",
      },
      k: {
        under1500: { d1to3:[0,3], d4to5:[2,3], d6to7:[1,3], stable:[2,5] },
        over1500:  { d1to3:[0,3], d4to5:[2,3], d6to7:[1,3], stable:[2,3] },
        unit: "mmol/kg/day",
      },
      // First days = DOL 1–7 (FIRST_DAYS_LAST_DOL; TPN team, 2026-10-25).
      ca: { dol1:[0.8,2.0], growing:[1.6,3.5], unit:"mmol/kg/day" },  // × 40.08 = mg/kg
      // growing was [1.5, 2.0] until 2026-09-11 — the 2026-09-05 correction of
      // TPN_TARGETS.p (1.6–3.5 mmol = 50–108 mg/kg) never reached this display copy.
      p:  { dol1:[1.0,2.0], growing:[1.6,3.5], unit:"mmol/kg/day" },  // × 30.97 = mg/kg
      mg: { dol1:[0.1,0.2], growing:[0.2,0.3], unit:"mmol/kg/day" },
      caP_molar:  [0.8, 1.3],   // molar Ca:P ratio — aim 1.3:1 (ESPGHAN 2018)
      caP_mass:   [1.0, 1.7],   // mass ratio — ESPGHAN 0.8–1.3 molar × 1.29 = 1.0–1.7; KCMH aim 1.7:1
    },
    micronutrients: {
      zn: { preterm:[400,500], term:[250,250], unit:"µg/kg/day" },
      fe: { preterm:[200,250], term:[50,100],  unit:"µg/kg/day", note:"Prefer enteral Fe when possible" },
      // Domellöf 2018 R 7.10: preterm 40, term 20 (TPN team, 2026-10-25). It
      // read 40 for every age until then.
      cu: { preterm: 40, term: 20, unit: "µg/kg/day" },
      // Peditrace® 1 mL/kg/day (maximum 15 mL/day) covers Zn, Cu, Se, Mn, I
    },
    energy: {
      kcalPerGGlucose: 3.4,
      kcalPerGAA: 4.0,
      kcalPerGLipid: 9.0,
      kcalPerMlILE20: 2.0,
      npePerGAA: [24, Infinity],   // kcal non-protein per g amino acid, at least 24 (TARGETS.npePerGAA)
    },
    additives: {
      vitalipid: "BW <2.5 kg: 4 mL/kg/day · BW ≥2.5 kg: 10 mL/day (add to lipid bag)",
      soluvit:   "1 mL/kg/day (add to aqueous PN bag)",
      peditrace: "1 mL/kg/day, maximum 15 mL/day (add to aqueous PN bag)",
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
    vitD:    { range:[400,700], maxIuDay:1000, unit:"IU/kg/day", note:"Per kg (not per day) — changed in 2022! At most 1,000 IU/day (nutrition unit)" },
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
// Columns: [GA in completed weeks, 3rd, 10th, 50th, 90th, 97th]
// A row covers GA+0 to GA+6, mean age GA + 0.5, which is where the
// official chart and fenton.jsx draw it (2026-10-17). Column 0 is not
// an exact PMA: reading a row at x = GA puts the curve half a week early.
// ============================================================

// Weight (g) — EVERY WEEK 22–42 (the reference's own resolution), then
// every 2 weeks 44–50. It used to be 2-weekly throughout, with odd weeks
// linearly interpolated at render time in fenton.jsx; since the source
// publishes all 21 weekly rows that interpolation was pure avoidable error
// (worst case 56 g at girls GA 41, right where a borderline SGA call sits).
// Verified 2026-08-10 against the Fenton 2025 LMS + percentile tables:
// p3/p10/p90 reproduce the published integers exactly, p50 is the LMS
// median M, p97 is reconstructed from L/M/S (the table carries no p97).
// Re-checked 2026-09-05 against the official "2025_ASSIGN_size_for_
// gestational_age..._v2.pdf" cutoff table (ucalgary.ca/fenton, same PMID
// 40534585 source, dated v2). GA 36-41 boys and GA 36/40/41 girls were off
// by 8-51 g on p3/p10/p90/p97 — the 2026-08-10 session's reference table
// evidently predates this v2 revision at those weeks specifically (GA <=35
// and GA 42 already matched v2 within +-4 g, so those were left as-is).
// Corrected p3/p10/p90/p97 to v2; p50 (LMS median) is NOT in the v2 table
// (it only carries the SGA/LGA cutoffs) and was left untouched — GA 42 and
// the unaffected weeks show p50 was already fine, so there's no evidence it
// needs revisiting. FENTON_LENGTH/FENTON_HC have no equivalent public
// numeric table to re-check against; see BACKLOG.md.
const FENTON_WEIGHT = {
  boys: [
    [22,  367,  411,  505,  599,  643],
    [23,  436,  488,  597,  704,  753],
    [24,  511,  571,  697,  820,  877],
    [25,  594,  665,  812,  953, 1017],
    [26,  684,  767,  938, 1102, 1177],
    [27,  785,  877, 1071, 1263, 1352],
    [28,  899,  996, 1211, 1436, 1544],
    [29, 1025, 1125, 1359, 1623, 1757],
    [30, 1159, 1264, 1520, 1826, 1989],
    [31, 1300, 1413, 1695, 2046, 2239],
    [32, 1450, 1577, 1893, 2282, 2494],
    [33, 1616, 1757, 2107, 2535, 2768],
    [34, 1792, 1949, 2334, 2796, 3043],
    [35, 1971, 2143, 2561, 3057, 3320],
    [36, 2141, 2330, 2782, 3306, 3579],
    [37, 2317, 2523, 3009, 3558, 3838],
    [38, 2494, 2714, 3225, 3791, 4075],
    [39, 2655, 2888, 3420, 4000, 4288],
    [40, 2801, 3040, 3585, 4178, 4471],
    [41, 2927, 3171, 3725, 4324, 4620],
    [42, 2970, 3213, 3763, 4353, 4643],
    // ── Past the Fenton 2025 reference, which ends at 42 weeks ──
    // Attributed to "WHO Growth Standard 2026" in the header above, but
    // UNVERIFIED — and every value below is a multiple of 10, which is not
    // what an LMS-derived table produces (contrast the rows above). Treat
    // percentiles past 42 wk with suspicion until the source is confirmed;
    // the chart still plots to 50 wk, which is exactly where long-stay BPD
    // infants sit. See HANDOFF.md 2026-08-10 (3).
    [44, 3090, 3340, 3900, 4520, 4830],
    [46, 3200, 3450, 4020, 4660, 4980],
    [48, 3300, 3550, 4130, 4790, 5120],
    [50, 3400, 3650, 4230, 4900, 5240],
  ],
  girls: [
    [22,  359,  392,  470,  558,  603],
    [23,  423,  464,  558,  662,  714],
    [24,  492,  542,  654,  774,  832],
    [25,  570,  631,  765,  902,  967],
    [26,  658,  729,  884, 1044, 1120],
    [27,  753,  834, 1012, 1197, 1285],
    [28,  853,  944, 1147, 1359, 1462],
    [29,  964, 1062, 1288, 1536, 1660],
    [30, 1086, 1194, 1448, 1735, 1881],
    [31, 1220, 1340, 1627, 1958, 2129],
    [32, 1366, 1500, 1822, 2199, 2395],
    [33, 1524, 1673, 2031, 2447, 2664],
    [34, 1691, 1855, 2247, 2699, 2933],
    [35, 1863, 2043, 2469, 2954, 3203],
    [36, 2034, 2229, 2688, 3204, 3468],
    [37, 2211, 2418, 2900, 3436, 3706],
    [38, 2407, 2618, 3105, 3643, 3912],
    [39, 2593, 2804, 3291, 3828, 4097],
    [40, 2736, 2953, 3449, 4002, 4276],
    [41, 2828, 3051, 3583, 4128, 4410],
    [42, 2859, 3087, 3610, 4184, 4470],
    // ── Past the Fenton 2025 reference — see the note in `boys` above ──
    [44, 2970, 3210, 3750, 4360, 4660],
    [46, 3080, 3320, 3880, 4510, 4820],
    [48, 3180, 3430, 4000, 4640, 4970],
    [50, 3280, 3540, 4110, 4760, 5100],
  ],
};

// Weight, growth monitoring, 36.5–42 wk: [exact PMA in weeks, L, M (g), S].
// FENTON_WEIGHT above is Fenton's size-at-birth table. Fenton's growth chart
// follows it to about 37 weeks, then bends towards WHO at 50 (Fenton 2025
// Table 3), so from 37 weeks those rows are the wrong curve for monitoring:
// up to 10.2 centile points off Fenton's own calculator (2026-10-17). These
// rows are that calculator's monitoring curve. Fenton's LMS are not published;
// L, M and S were solved at each half week from fentongrowth.ca's z-scores
// (API 2.1.3.0, 2026-10-19) for three made-up weights per knot, near the
// 10th, 50th and 90th (test/fenton-official-1019.json). 24 held-out points
// and the 10 of 2026-10-17 read back within 0.02 centile points; an LMS fit
// to the digitised printed chart agrees on M within 2 g. Unlike the rows
// above, column 0 is an exact age, not completed weeks. fenton.jsx uses this
// table for weight from 36.5 weeks, except a DOL-1 weight, which is a size at
// birth and stays on FENTON_WEIGHT, as Fenton's Birth size evaluation does.
const FENTON_WEIGHT_GROWTH_LMS = {
  boys: [
    [36.5, +0.060,  2782.1, 0.13630],
    [37.0, +0.056,  2890.8, 0.13531],
    [37.5, +0.052,  2999.1, 0.13434],
    [38.0, +0.044,  3107.4, 0.13338],
    [38.5, +0.048,  3216.2, 0.13249],
    [39.0, +0.048,  3325.1, 0.13171],
    [39.5, +0.052,  3434.1, 0.13096],
    [40.0, +0.060,  3543.6, 0.13022],
    [40.5, +0.064,  3653.0, 0.12951],
    [41.0, +0.072,  3762.5, 0.12887],
    [41.5, +0.080,  3872.0, 0.12825],
    [42.0, +0.092,  3982.0, 0.12773],
  ],
  girls: [
    [36.5, +0.260,  2687.9, 0.14198],
    [37.0, +0.228,  2796.7, 0.14162],
    [37.5, +0.180,  2904.0, 0.14166],
    [38.0, +0.128,  3009.6, 0.14177],
    [38.5, +0.076,  3113.6, 0.14195],
    [39.0, +0.036,  3216.1, 0.14220],
    [39.5, +0.000,  3317.0, 0.14227],
    [40.0, -0.016,  3416.5, 0.14224],
    [40.5, -0.016,  3515.0, 0.14198],
    [41.0, -0.008,  3612.1, 0.14146],
    [41.5, +0.000,  3708.0, 0.14073],
    [42.0, +0.008,  3803.1, 0.13978],
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
// Session ID format: Initials + BW + TwinSuffix — a *pseudonym*, not
// anonymous data: on a small NICU census, initials + birthweight can still
// be reverse-mapped to a patient by staff. Treat sessionId as identifying
// for PDPA purposes (access control, erasure requests) even though it
// avoids storing the full name as the primary key. See the residual-risk
// note on pseudonymizePatient() in gas-backend.gs.
// ============================================================
const MOCK_PATIENTS = [
  // Test fixture: 28+1, BW 900g, admitted DOL 1 nine days ago → today DOL 10
  // NPO DOL 1-2 → trophic DOL 3 → step-feed advance → full EN by DOL 10
  {
    sessionId: "TT-BW900-A", initials: "ทท", name: "ทท", bw: 900, ga: 28.1, sex: "boys",
    dob: "2026-05-15", admissionDate: "2026-05-15", twinSuffix: "",
    status: "Active", currentBed: "NICU 2", diagnosis: "VLBW · RDS · step-feed",
    weights: [
      { dol: 1,  w: 900 }, { dol: 2,  w: 870 }, { dol: 3,  w: 850 },
      { dol: 4,  w: 830 }, { dol: 5,  w: 815 }, { dol: 6,  w: 810 },
      { dol: 7,  w: 820 }, { dol: 8,  w: 840 }, { dol: 9,  w: 870 },
      { dol: 10, w: 900 },
    ],
    lengths: [{ dol: 1, v: 35.0 }, { dol: 7, v: 35.2 }],
    hcs:     [{ dol: 1, v: 25.5 }, { dol: 7, v: 25.8 }],
  },
  {
    sessionId: "PP-BW850-A", initials: "PP", name: "ปพ", bw: 850, ga: 26.4, sex: "boys",
    dob: "2026-05-04", admissionDate: "2026-05-04", twinSuffix: "A",
    status: "Active", currentBed: "NICU 3", diagnosis: "ELBW · RDS · PDA",
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
    status: "Active", currentBed: "NICU 7", diagnosis: "VLBW · feeding intolerance",
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
    status: "Active", currentBed: "NICU 1", diagnosis: "ELBW Twin B · IVH gr.II",
    weights: [
      { dol: 1, w: 720 }, { dol: 2, w: 690 }, { dol: 3, w: 670 },
    ],
    lengths: [{ dol: 0, v: 32.0 }],
    hcs:     [{ dol: 0, v: 22.8 }],
  },
  {
    sessionId: "AT-BW1450-A", initials: "AT", name: "อท", bw: 1450, ga: 31.0, sex: "girls",
    dob: "2026-04-10", admissionDate: "2026-04-10", twinSuffix: "",
    status: "Active", currentBed: "SCN 2", diagnosis: "Growing premie",
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
  "TT-BW900-A": [
    // Fields pro/kcal/na/k/ca/p are PN+EN combined (per-kg). enVolPerKg drives target choice (≥100 → EN targets, else PN).
    { dol: 1,  ts: "2026-05-15", weight: 900, fluid: 80,  gir: 5.6, pro: 1.5, kcal: 33,  na: 0,   k: 0,   ca: 40,  p: 22, enVolPerKg: 0,   route: "TPN central",      status: "submitted" },
    { dol: 2,  ts: "2026-05-16", weight: 870, fluid: 100, gir: 7.0, pro: 2.5, kcal: 55,  na: 1.5, k: 0,   ca: 60,  p: 34, enVolPerKg: 0,   route: "TPN central",      status: "submitted" },
    { dol: 3,  ts: "2026-05-17", weight: 850, fluid: 120, gir: 8.0, pro: 3.0, kcal: 75,  na: 2.0, k: 1.0, ca: 75,  p: 42, enVolPerKg: 10,  route: "TPN + trophic",    status: "submitted" },
    { dol: 4,  ts: "2026-05-18", weight: 830, fluid: 135, gir: 9.0, pro: 3.5, kcal: 90,  na: 2.5, k: 1.5, ca: 85,  p: 48, enVolPerKg: 25,  route: "TPN + EBM 25 mL/kg", status: "submitted" },
    { dol: 5,  ts: "2026-05-19", weight: 815, fluid: 150, gir: 10,  pro: 3.5, kcal: 100, na: 3.0, k: 2.0, ca: 95,  p: 52, enVolPerKg: 40,  route: "TPN + EBM 40 mL/kg", status: "submitted" },
    { dol: 6,  ts: "2026-05-20", weight: 810, fluid: 160, gir: 10,  pro: 3.5, kcal: 105, na: 3.0, k: 2.5, ca: 105, p: 56, enVolPerKg: 55,  route: "TPN + EBM 55 mL/kg", status: "submitted" },
    { dol: 7,  ts: "2026-05-21", weight: 820, fluid: 165, gir: 9,   pro: 3.5, kcal: 115, na: 3.0, k: 2.5, ca: 115, p: 60, enVolPerKg: 75,  route: "TPN + EBM 75 mL/kg", status: "submitted" },
    { dol: 8,  ts: "2026-05-22", weight: 840, fluid: 160, gir: 7,   pro: 3.5, kcal: 120, na: 3.0, k: 2.5, ca: 125, p: 65, enVolPerKg: 95,  route: "TPN + EBM 95 mL/kg", status: "submitted" },
    { dol: 9,  ts: "2026-05-23", weight: 870, fluid: 155, gir: 5,   pro: 3.0, kcal: 125, na: 3.0, k: 2.5, ca: 135, p: 72, enVolPerKg: 115, route: "TPN + EBM 115 mL/kg",status: "submitted" },
    { dol: 10, ts: "2026-05-24", weight: 900, fluid: 150, gir: 0,   pro: 4.0, kcal: 130, na: 3.5, k: 3.0, ca: 145, p: 78, enVolPerKg: 135, route: "Full EN 135 mL/kg",  status: "submitted" },
  ],
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
// GA / PMA — stored as WW.D shorthand (e.g. 26.4 = 26 wk 4 d).
// Days digit is literal (0-6), NOT decimal-week fraction.
// Display: "26+4". Internal math goes through gaTotalDays().
// ============================================================
function gaTotalDays(ga) {
  if (!isFinite(ga) || ga <= 0) return 0;
  const weeks = Math.floor(ga);
  // First decimal digit = days, clamped 0-6 — the same rule parseGAInput applies.
  // These used to disagree: parseGAInput("27.9") clamps to 27+6 (189 d) while
  // this carried to 28+2 (198 d), so a hand-edited sheet value decoded
  // differently depending on which helper the caller reached for.
  const raw = Math.min(6, Math.max(0, Math.round((ga - weeks) * 10)));
  return weeks * 7 + raw;
}
function daysToGA(totalDays) {
  if (!isFinite(totalDays) || totalDays < 0) return 0;
  const w = Math.floor(totalDays / 7);
  const d = totalDays % 7;
  return w + d / 10;
}
function fmtGA(ga) {
  const td = gaTotalDays(ga);
  if (td <= 0) return "—";
  return Math.floor(td / 7) + "+" + (td % 7);
}
// PMA in WW.D shorthand: GA + (DOL-1) days
function pmaShort(ga, dol) {
  return daysToGA(gaTotalDays(ga) + Math.max(0, (dol || 1) - 1));
}
// True decimal weeks (for Fenton x-axis plotting) — NOT same as ga
function gaToDecimalWeeks(ga) {
  return gaTotalDays(ga) / 7;
}
// Parse user input: accepts "28+4" / "28.4" / "28" → ga value (clamps days 0-6)
function parseGAInput(s) {
  if (typeof s === "number") return s;
  s = String(s || "").trim();
  let w, d;
  if (s.includes("+")) { const [a, b] = s.split("+"); w = parseInt(a, 10); d = parseInt(b, 10) || 0; }
  else { const n = parseFloat(s); w = Math.floor(n); d = Math.round((n - w) * 10); }
  if (!isFinite(w) || w <= 0) return 0;
  d = Math.min(6, Math.max(0, d || 0));
  return w + d / 10;
}
// Corrected age in days = PMA − 40 weeks. Negative = still preterm.
// Display: "CA 2+3 wk" (2 weeks 3 days past term), or null when preterm.
function correctedAge(ga, dol) {
  const caDays = gaTotalDays(pmaShort(ga, dol)) - 280; // 40 * 7
  return caDays; // caller checks: caDays >= 0 → post-term, else preterm
}

// ============================================================
// Calendar dates — always local (Bangkok), never UTC.
//
// `new Date().toISOString().slice(0,10)` is the *UTC* date. Bangkok is UTC+7,
// so for any local time before 07:00 it returns YESTERDAY. Two distinct
// defects came out of that, fixed 2026-08-08:
//   • liveDol() ran a day behind for the whole 00:00–07:00 night shift — the
//     shift on which the next day's TPN is written — putting DOL and every
//     DOL-derived target (fluid, protein, kcal, Ca, P, Mg, PMA) one day back.
//   • NewPatientModal derived DOB by taking local midnight through
//     toISOString(), which rolled back across the offset and produced a DOB
//     one day early for EVERY patient, at any hour.
//
// Use todayLocal() for "what day is it here", and addDaysToDateStr() for
// arithmetic on a YYYY-MM-DD string. Neither goes near toISOString().
// The timezone is pinned rather than left to the browser so a mis-set NICU
// workstation can't reintroduce the drift.
// ============================================================
const _BKK_DATE_FMT = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }); // sv-SE formats as YYYY-MM-DD
function todayLocal() {
  return _BKK_DATE_FMT.format(new Date());
}
// Coerce anything date-shaped into the canonical "YYYY-MM-DD" string every
// date comparison in the app assumes. Needed because Google Sheets stores the
// Daily_Log `ts` cell as a real date value, so the backend can hand back
// "Sun Aug 17 2026 00:00:00 GMT+0700 (Indochina Time)" instead of
// "2026-08-17" — which silently fails every `e.ts === todayLocal()` check
// (that's what pinned "Logged today" at 0 and left every patient in "Needs
// entry"). Already-canonical strings are sliced, never re-parsed, so no
// timezone shift can creep in.
function normalizeDateStr(val) {
  if (val == null || val === "") return "";
  if (val instanceof Date) return isNaN(val) ? "" : _BKK_DATE_FMT.format(val);
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d) ? s : _BKK_DATE_FMT.format(d);
}

// Daily_Log entries as they arrive from the backend: `ts` normalized (above)
// and sorted oldest → newest. Several views read `entries[entries.length - 1]`
// as "the latest entry", which is only true if the array is in date order —
// the sheet returns rows in insertion order, so a back-filled past date lands
// after the entries it precedes.
function normalizeLogEntries(entries) {
  return (entries || [])
    // A superseded row (see gas-backend.gs updateDailyNutrition's revision
    // branch) is the OLD copy a Submit-then-edit left behind — the current
    // revision is a separate row already in this array. Dropping it here,
    // once, keeps every reader (TrendGraph, the entry table, "logged today")
    // from double-counting a date that has more than one row on record.
    .filter(e => !e.supersededAt)
    .map(e => ({ ...e, ts: normalizeDateStr(e.ts) }))
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}
function normalizeLogMap(logMap) {
  const out = {};
  for (const sid of Object.keys(logMap || {})) out[sid] = normalizeLogEntries(logMap[sid]);
  return out;
}

// True if this patient's log already has an entry stamped with `date`
// (default: today). Checks every entry, not just the last one — a back-dated
// entry saved after today's would otherwise hide today's from the check.
function hasLogOnDate(entries, date) {
  const target = normalizeDateStr(date || todayLocal());
  return finalEntries(entries).some(e => normalizeDateStr(e.ts) === target);
}
// A draft saved today — the ward list shows it as "DRAFT", not "✓ LOGGED".
function hasDraftOnDate(entries, date) {
  const target = normalizeDateStr(date || todayLocal());
  return (entries || []).some(e => isDraftEntry(e) && normalizeDateStr(e.ts) === target);
}

// ── Draft orders (Praew, 2026-09-23) ──────────────────────────
// "Save draft" keeps an order whose required boxes are not all filled yet
// (Daily_Log column O, status "draft"). A draft is not a record of what the
// infant received: its blank urine output reads as 0 and its figures may be
// half-typed. So it stays out of every trend, alert, weight series, "logged
// today" count and previous-order prefill, and it cannot print, until it is
// completed and Submitted (status "submitted"). Every row saved before drafts
// existed carries "submitted" (the calculator always wrote it; the backend
// defaults a blank to it), so old orders count as submitted.
function isDraftEntry(e) {
  return !!e && String(e.status || "").toLowerCase() === "draft";
}
function finalEntries(entries) {
  return (entries || []).filter(e => !isDraftEntry(e));
}

// React hook form of todayLocal(): the current local date, re-rendering the
// caller when the day rolls over. NICU workstations and the installed PWA stay
// open for days, so without this "today"-derived UI (DOL, Logged today / Needs
// entry, the discharged auto-hide) freezes at whatever day the tab was opened.
// Polls once a minute and re-checks on tab focus — cheap, and unlike a
// setTimeout aimed at midnight it also survives a device sleeping through it.
function useTodayLocal() {
  const [today, setToday] = React.useState(todayLocal);
  React.useEffect(() => {
    const check = () => setToday(prev => { const now = todayLocal(); return prev === now ? prev : now; });
    const timer = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  return today;
}

// Date-string arithmetic with no timezone exposure at all: parse as UTC, shift
// in UTC, render in UTC. Anchoring both ends to UTC makes the round-trip exact,
// which is what the local-midnight + toISOString() pattern got wrong.
function addDaysToDateStr(dateStr, deltaDays) {
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d)) return dateStr;
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// ============================================================
// Admission / birth date plausibility (2026-09-23)
// ============================================================
// Every DOL, PMA and DOL-indexed target in the app is measured from one of
// these two dates, and until now nothing checked either of them. Three values
// were accepted and all three silently pinned DOL at 1 — the day-1 fluid,
// energy, Na, K, Ca and P bands — for an infant of any age:
//
//   • blank        — dolAtDate had no anchor and fell back to the stored
//                    weights[] DOL;
//   • a future date — daysSince went negative and Math.max clamped it away;
//   • a Buddhist-era year (2569 for 2026) — a date 543 years in the future,
//     which is the same negative case, and the single likeliest typo on a
//     Thai ward where every paper form is dated in BE.
//
// Returns null when the date is usable, else { code, message } with the
// message already in the language the ward reads. `today` is injectable so
// the harnesses can pin a date.
const ADMIT_DATE_MIN = "2000-01-01";   // NeoFeed holds live admissions only
function admissionDateIssue(dateStr, today) {
  const s = normalizeDateStr(dateStr);
  const now = normalizeDateStr(today || todayLocal());
  if (!s) return { code: "missing", message: "ต้องระบุวันที่ — ระบบใช้วันนี้คำนวณ DOL, PMA และเป้าหมายสารอาหารทุกค่า" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + "T00:00:00Z")))
    return { code: "unparseable", message: `วันที่ไม่ถูกต้อง (${s}) — ใช้รูปแบบ ปี-เดือน-วัน ค.ศ.` };
  // Check BE before "future": a BE year is a future date, and naming it as the
  // typo it is beats telling the user their date is in the future.
  const year = Number(s.slice(0, 4));
  const nowYear = Number(now.slice(0, 4)) || year;
  if (year >= nowYear + 400) {
    return { code: "buddhistEra", message:
      `ปี ${year} เป็นปี พ.ศ. — กรอกเป็น ค.ศ. (${year - 543})` };
  }
  if (s > now) return { code: "future", message: `วันที่ ${s} เป็นวันในอนาคต — ตรวจสอบอีกครั้ง` };
  if (s < ADMIT_DATE_MIN) return { code: "tooOld", message: `วันที่ ${s} เก่าเกินกว่าที่ระบบรับได้` };
  return null;
}
// Best-effort correction of the one typo worth auto-correcting: a Buddhist-era
// year typed into a date field. Everything else is returned untouched for
// admissionDateIssue to report — silently rewriting a date the user meant is
// how a wrong DOL gets saved without anyone seeing it happen.
function toChristianEraDateStr(dateStr, today) {
  const s = normalizeDateStr(dateStr);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const issue = admissionDateIssue(s, today);
  if (!issue || issue.code !== "buddhistEra") return s;
  return String(Number(s.slice(0, 4)) - 543).padStart(4, "0") + s.slice(4);
}

// ============================================================
// Live DOL — single source of truth for "day of life as of today".
// Falls back to last stored weight's DOL if no admissionDate.
// Used by app.jsx PatientStrip, Calculator, Registry table, Fenton.
// ============================================================
function liveDol(patient) {
  return dolAtDate(patient, todayLocal());
}

// ============================================================
// The weight series — BOTH stores, read as one (2026-09-23)
// ============================================================
// A weight reaches NeoFeed by two doors and they were never connected:
//
//   • the Fenton chart's MeasurementLogger writes patient.weights[]
//   • every TPN order writes its dosing weight to Daily_Log.weight
//
// Nothing copied either way, so a ward that weighs the infant once a day and
// types that weight into the order — which is most of them — built a complete
// weight history that the growth chart, the "Wt now" figure on the patient
// strip and the stale-weight alert could not see at all. The result was a
// one-point growth chart and a red "Weight measurement >7 days overdue" on an
// infant weighed that morning.
//
// This joins them at READ time rather than copying at write time. Copying
// would mean a second server write after every order, a second chance for the
// two stores to disagree, and a merge to get wrong; joining cannot drift
// because there is only ever one answer. A deliberate measurement outranks an
// order's working figure on the same day: MeasurementLogger is someone
// recording a weight, an order is someone using one.
//
// Returns [{ dol, w, src: "measured" | "order", ts? }] sorted by DOL.
function weightSeries(patient, entries) {
  const byDol = new Map();
  for (const e of finalEntries(entries)) {
    const w = Number(e?.weight);
    if (!isFinite(w) || w <= 0) continue;
    const dol = entryDol(patient, e);
    byDol.set(dol, { dol, w, src: "order", ts: normalizeDateStr(e.ts) });
  }
  for (const m of (patient?.weights || [])) {
    if (!m || m.w == null) continue;
    const dol = Number(m.dol) || 1;
    byDol.set(dol, { dol, w: Number(m.w), src: "measured" });   // measured wins
  }
  return [...byDol.values()].sort((a, b) => a.dol - b.dol);
}

// A weight recorded for one DOL, merged into weights[] exactly the way the
// growth chart's MeasurementLogger merges it: an entry already on that DOL
// keeps its length/HC and takes the new weight; otherwise a new entry is added
// and the array stays sorted by DOL. The nursing I/O form records its weight
// through this (UX roadmap #4), so a nurse's weight is an ordinary measurement
// — one store, the one every weight reader already joins (weightSeries).
function upsertWeight(weights, dol, w) {
  const list = Array.isArray(weights) ? weights : [];
  const n = Number(dol);
  if (list.some(x => x && x.dol === n)) return list.map(x => (x && x.dol === n) ? { ...x, w } : x);
  return [...list, { dol: n, w, l: null, hc: null }].sort((a, b) => a.dol - b.dol);
}

// ── Nursing Intake/Output (UX roadmap #4, 2026-09-24) ────────────────────────
// One record per infant per date: the ward's 24-hour totals, dated the morning
// the total CLOSED — so an order written that morning reads it as "the past
// 24 h" (the Calculator's Intake/Output card offers it with one tap, Pp's D4).
// Every volume is mL per 24 h and may be null: null means "not recorded" and
// must never be read as a measured 0 (gas-backend.gs _numOrNull).
// What went in, IV + enteral — and only when BOTH were recorded: IV 100 with
// the enteral total blank is not an intake of 100 (blank ≠ 0; the nurses type 0
// for "none"). Rounded to 0.1 mL, so 0.1 + 0.2 reads 0.3 on the card and in
// the Calculator's box.
function nursingIntakeMl(rec) {
  const iv = rec?.ivInMl, en = rec?.enInMl;
  if (iv == null || en == null) return null;
  return Math.round(((Number(iv) || 0) + (Number(en) || 0)) * 10) / 10;
}
// The record for one date, or null.
function nursingRecordOn(records, date) {
  const d = normalizeDateStr(date);
  if (!d) return null;
  return (records || []).find(r => normalizeDateStr(r?.ts) === d) || null;
}
// Every record's date as YYYY-MM-DD (Sheets can hand `ts` back as a Date),
// newest first — the order the Dashboard card lists them in.
function normalizeNursingMap(map) {
  const out = {};
  for (const [sid, recs] of Object.entries(map || {})) {
    if (!Array.isArray(recs)) continue;
    out[sid] = recs
      .filter(r => r && typeof r === "object")
      .map(r => ({ ...r, ts: normalizeDateStr(r.ts) }))
      .filter(r => r.ts)
      .sort((a, b) => b.ts.localeCompare(a.ts));
  }
  return out;
}

// ============================================================
// Current weight — the ONE answer to "what does this infant weigh" (2026-09-24)
// ============================================================
// Praew, 2026-09-24: an infant's weight must read the same on every screen,
// from one place. It did not: the patient strip showed whatever was being
// typed in the Calculator, a new order started from the growth chart alone,
// and the Trend read the orders alone. Every screen that shows or starts from
// "the current weight" — the patient strip, the Ward list, a new order's
// Current weight box, the I/O divisor, the stale-weight alert — now calls this
// with the patient's Daily_Log.
//
// It is the latest point of weightSeries (both stores, drafts excluded, a
// measurement winning over an order on the same DOL) on or before `asOfDol`,
// or the latest overall when `asOfDol` is omitted. A back-fill passes its own
// DOL, so an earlier day is never given a later weight. Called with no log it
// is the growth chart alone, which is right only for a caller that genuinely
// has none (Center Point, the quick calc). It replaces lastWeighed and
// weightAtOrBeforeDol, which read the growth chart unless handed the log.
// Null-safe through weightSeries: a length/HC-only row (`w: null`) is not a
// weight, and a stored array can carry a null element (SEC-B3).
//
// Returns { dol, w, src: "measured" | "order", ts? } or null.
function currentWeight(patient, entries, asOfDol) {
  const series = weightSeries(patient, entries || []);
  for (let i = series.length - 1; i >= 0; i--) {
    if (asOfDol == null || series[i].dol <= asOfDol) return series[i];
  }
  return null;
}

// ============================================================
// Growth velocity (g/kg/day) — and, as importantly, when NOT to judge it
// ============================================================
// The alert built on this used to take the first and last of the past seven
// weight rows and grade the slope against ≥15 g/kg/d unconditionally. Two ways
// that was wrong at the bedside (2026-09-23), and a third found on 2026-09-24:
//
//   1. **Physiological weight loss.** Every newborn loses weight in the first
//      days — up to ~10% of birth weight for a preterm infant, regained by
//      about DOL 7–14. Across that window the slope is NEGATIVE by design, so
//      a textbook-normal infant raised "Growth velocity critically low" every
//      day of its first week. Velocity is only meaningful once the nadir is
//      past, which is why it is conventionally measured from the regain of
//      birth weight — so that is where this starts measuring.
//
//   2. **No reference past term.** ≥15 g/kg/d is a PRETERM target (ESPGHAN
//      2022, intrauterine growth). Past 42 weeks PMA the Fenton reference this
//      app carries stops (fenton.jsx GA_MAX, and the chart hides those points),
//      and a term infant growing a healthy ~20–30 g/day is well under 15 g/kg/d
//      at 3 kg — so the same rule that false-alarmed in week one false-alarms
//      again after term, from the opposite direction. Rather than grade against
//      a target that does not apply, say so: the caller renders that as an
//      informational line, not an alarm.
//
//   3. **Back AT birth weight is not growth** (Pp, 2026-09-24). A weight that
//      has only returned to birth weight has not gained anything yet, so it is
//      not graded either. The regain is the first weight >= birth weight, and
//      grading used to start right there: two order weights left at the
//      birth-weight prefill (1,200 g on a 1,200 g infant, DOL 8 and 10) read
//      "0 g/kg/d" in critical red on DOL 10. Now velocity is graded only once a
//      weight rises ABOVE birth weight. It is still measured from the regain,
//      so a week spent flat at birth weight still counts against it.
//
// Returns { status, vel, days, from, to, reason } where status is one of
//   "ok" | "low" | "critical"          — a real, gradeable velocity
//   "physiologicalLoss"                — not yet above birth weight, DOL <= 14
//   "notRegained"                      — not yet above birth weight past DOL 14
//   "beyondReference"                  — past PMA_REFERENCE_MAX weeks
//   "insufficientData"                 — fewer than two usable weights
// `reason` is ward-readable text for the non-gradeable cases. The two
// not-yet-above states also carry `bw`, and `atBirthWeight`: true when the
// latest weight equals birth weight, false when it is below it. The Growth
// chart's readout says "Weight at/below birth weight" from these.
const PMA_REFERENCE_MAX = 42;            // Fenton 2025 stops here (fenton.jsx GA_MAX)
const GROWTH_VEL_TARGET = 15;            // g/kg/d, ESPGHAN 2022 minimum
const GROWTH_VEL_CRITICAL = 10;          // g/kg/d
const REGAIN_EXPECTED_BY_DOL = 14;       // birth weight normally regained by ~DOL 7–14
function growthVelocity(patient, entries) {
  // Both stores (weightSeries): a ward that records weight only in the order
  // otherwise had no velocity at all, or one computed from two points weeks
  // apart.
  const wts = entries
    ? weightSeries(patient, entries)
    : (patient?.weights || []).filter(w => w && w.w != null)
        .slice().sort((a, b) => (a.dol || 0) - (b.dol || 0));
  if (wts.length < 2) return { status: "insufficientData", vel: null, days: 0 };

  const latest = wts[wts.length - 1];

  // Past the reference the target does not apply — report, don't grade.
  const pma = gaTotalDays(pmaShort(patient?.ga || 0, latest.dol)) / 7;
  if (patient?.ga && pma > PMA_REFERENCE_MAX) {
    return { status: "beyondReference", vel: null, days: 0, to: latest, pma,
      reason: `PMA ${displayNum(pma, 1)} สัปดาห์ — เกินช่วงอ้างอิง Fenton (${PMA_REFERENCE_MAX} สัปดาห์) และเป้าหมาย ≥${GROWTH_VEL_TARGET} g/kg/d เป็นเป้าของทารกเกิดก่อนกำหนด ไม่ใช้กับทารกครบกำหนด — ระบบไม่ตัดสินอัตราการเจริญเติบโตในช่วงนี้` };
  }

  // Measure from the regain of birth weight, not from whatever row happens to
  // be seven back. Before regain there is nothing to grade.
  const bw = Number(patient?.bw) || 0;
  // Skip the loss window only when there is one to skip: either the series
  // dipped below birth weight, or its first point sits exactly AT birth weight
  // (the birth point itself, which is not a "regain"). A series that begins
  // already ABOVE birth weight — an outborn infant admitted grown, or an
  // order-only history — has no loss to skip, so its first point IS the start,
  // and two such points now grade instead of returning insufficientData
  // (2026-09-24). A record that did lose and regain is unaffected.
  const hasLossWindow = wts.some(w => w.w < bw) || (wts[0]?.w ?? Infinity) <= bw;
  const regainIdx = bw > 0
    ? (hasLossWindow ? wts.findIndex(w => w.w >= bw && w.dol > (wts[0]?.dol ?? 1)) : 0)
    : 0;
  // Graded only once a weight on or after the regain is ABOVE birth weight
  // (point 3 above). Until then the latest weight is at or below birth weight:
  // either nothing after birth reached it (regainIdx -1), or everything from
  // the regain on is <= it. A series that starts above birth weight passes.
  const aboveBirthWeight = regainIdx !== -1 && wts.slice(regainIdx).some(w => w.w > bw);
  if (bw > 0 && !aboveBirthWeight) {
    const stillLosing = latest.dol <= REGAIN_EXPECTED_BY_DOL;
    const atBirthWeight = latest.w >= bw;
    return {
      status: stillLosing ? "physiologicalLoss" : "notRegained",
      vel: null, days: 0, to: latest, bw, atBirthWeight,
      reason: atBirthWeight
        ? (stillLosing
          ? `น้ำหนักเท่ากับน้ำหนักแรกเกิด (${bw} g) ยังไม่เพิ่มขึ้น — DOL ${latest.dol} ยังไม่ประเมินอัตราการเจริญเติบโตจนกว่าน้ำหนักจะเกินน้ำหนักแรกเกิด`
          : `น้ำหนักยังไม่เกินน้ำหนักแรกเกิด (${bw} g) ภายใน DOL ${REGAIN_EXPECTED_BY_DOL} — ตรวจสอบปริมาณสารอาหารที่ได้รับ`)
        : (stillLosing
          ? `ยังไม่กลับถึงน้ำหนักแรกเกิด (${bw} g) — DOL ${latest.dol} อยู่ในช่วงน้ำหนักลดตามสรีรวิทยา ยังไม่ประเมินอัตราการเจริญเติบโต`
          : `ยังไม่กลับถึงน้ำหนักแรกเกิด (${bw} g) ภายใน DOL ${REGAIN_EXPECTED_BY_DOL} — ตรวจสอบปริมาณสารอาหารที่ได้รับ`),
    };
  }

  // Up to the last seven weighed rows, but never reaching back before regain.
  const usable = wts.slice(Math.max(regainIdx, wts.length - 7));
  if (usable.length < 2) return { status: "insufficientData", vel: null, days: 0, to: latest };
  const from = usable[0], to = usable[usable.length - 1];
  const days = Math.max(1, to.dol - from.dol);
  const avgKg = (from.w + to.w) / 2 / 1000;
  if (!avgKg) return { status: "insufficientData", vel: null, days: 0, to: latest };
  const vel = (to.w - from.w) / days / avgKg;
  const status = vel < GROWTH_VEL_CRITICAL ? "critical" : vel < GROWTH_VEL_TARGET ? "low" : "ok";
  return { status, vel, days, from, to };
}

// Divisor (grams) for intake/output mL/kg/day math: the previous day's
// weight, unless the infant hasn't yet regained birth weight — in which
// case birth weight is used instead, per KCMH bedside convention (avoids
// inflating mL/kg/day off a still-low post-natal-weight-loss nadir).
//
// `todayWeightG` (optional) is the weight entered in the current calculator
// session for this log day. When the previous-day lookup falls back to birth
// weight — no prior weight on record, or a still-below-birth-weight nadir —
// but today's actual weight already exceeds birth weight, today's weight is
// used instead so the divisor doesn't stay pinned to birth weight once the
// infant has clearly grown past it.
//
// `entries` is the patient's Daily_Log. "The previous day's weight" is read
// from the same series as every other weight in the app (currentWeight, as of
// DOL − 1): until 2026-09-24 it came from the growth chart alone, so a ward
// that weighs in the order had its urine mL/kg/h divided by the birth weight
// or a weeks-old measurement (Praew's decision, 2026-09-24). The floor rules
// above are unchanged.
function ioDivisorG(patient, dol, todayWeightG, entries) {
  const bw = patient?.bw || 0;
  const prevW = currentWeight(patient, entries, (dol || 1) - 1)?.w ?? null;
  const base = prevW != null ? prevW : bw;
  const divisor = base ? (base < bw ? bw : base) : (bw || null);
  if (divisor === bw && todayWeightG > bw) return { g: todayWeightG, source: "today" };
  return { g: divisor, source: divisor === bw ? "birth" : "prevDay" };
}

// Whole days between two "YYYY-MM-DD" strings, or null if either is unusable.
// Both anchored to UTC ("Z"), not local midnight — the difference is then an
// exact multiple of 86 400 000 by construction, independent of the browser's
// timezone or any DST rule. Same reasoning as addDaysToDateStr() above.
function daysBetweenDateStr(fromStr, toStr) {
  const a = new Date(String(fromStr || "") + "T00:00:00Z");
  const b = new Date(String(toStr || "") + "T00:00:00Z");
  if (isNaN(a) || isNaN(b)) return null;
  return Math.floor((b - a) / 86400000);
}

// DOL as of an arbitrary calendar date (YYYY-MM-DD) — same math as liveDol,
// used to back-date a log entry to the DOL that applied on that date.
//
// ANCHORED ON DATE OF BIRTH, which is what "day of life" actually counts from:
// DOL = (date − dob) + 1, so the day an infant is born is DOL 1.
//
// It used to anchor on `weights[0].dol` — the DOL of the first measurement —
// with admissionDate supplying the elapsed days. That conflated a *clinical
// measurement* with the *admission anchor*, and weights[] is sorted by DOL, so
// recording a birth measurement for an outborn infant prepended a DOL-1 row and
// silently re-dated the entire record: an infant admitted on DOL 5 and nine days
// in went DOL 8 → 4, PMA 31+0 → 30+3, and with them the fluid, energy and Na
// bands and the DOL printed on the pharmacy form (2026-09-23). dob cannot move
// that way — it is a fact about the infant, not a row in an editable array, and
// both registry modals derive and store it from admit date + DOL at admit.
//
// The weights[0].dol + admissionDate path stays as the fallback for a record
// with no dob (registered before dob was stored, or imported). For a record
// whose dob was derived the usual way the two agree exactly, so this changes
// no correct patient's DOL — only stops an editable array from moving it.
// Primary anchor: date of birth. Only a plausible one — a blank, future or
// Buddhist-era dob would peg every DOL at 1 (see admissionDateIssue).
// (Validity is a property of the stored date itself — judged against today,
// never against the date being asked about, which may legitimately be a
// back-dated log entry.)
//
// …and a dob LATER than the admission date is not a birth date: an infant
// cannot be admitted before it is born. That combination means the dob is
// wrong — a legacy row where it was defaulted to the registration date, most
// likely — and trusting it would report DOL 1 for an infant ten days in.
// When the two disagree, the pair that agrees with each other wins.
function dobCredible(patient) {
  return !!(patient?.dob
    && !admissionDateIssue(patient.dob)
    && (!patient.admissionDate || normalizeDateStr(patient.dob) <= normalizeDateStr(patient.admissionDate)));
}
// True when dolAtDate can measure a date from something real: a credible dob,
// or a usable admission date. Without either it can only repeat the last
// stored weights[] DOL, which is no DOL for a date at all.
function hasDolAnchor(patient) {
  return dobCredible(patient) || !!(patient?.admissionDate && !admissionDateIssue(patient.admissionDate));
}

function dolAtDate(patient, dateStr) {
  if (!patient) return 1;
  const admitDol = patient.weights?.[0]?.dol ?? 1;
  const lastDol  = patient.weights?.slice(-1)[0]?.dol ?? admitDol;
  if (!dateStr) return lastDol;

  if (dobCredible(patient)) {
    const sinceBirth = daysBetweenDateStr(patient.dob, dateStr);
    if (sinceBirth != null) return Math.max(1, sinceBirth + 1);
  }

  // Fallback: admission date + the DOL the first measurement was taken on.
  if (!patient.admissionDate || admissionDateIssue(patient.admissionDate)) return lastDol;
  const daysSince = daysBetweenDateStr(patient.admissionDate, dateStr);
  if (daysSince == null) return lastDol;
  return Math.max(admitDol, admitDol + daysSince);
}

// DOL to SHOW for an already-saved Daily_Log row.
//
// The `dol` column is only ever a snapshot of what DOL was at the moment the
// row was written, so it goes stale exactly like a cached liveDol() would:
//   • a row saved before the patient had an admissionDate got dolAtDate()'s
//     fallback (the last stored weight's DOL, typically 1) frozen into it;
//   • correcting a patient's admission date afterwards re-dates every DOL in
//     the app EXCEPT those already-written rows, so the log table ends up
//     showing e.g. "DOL 1" against a date nine days into the admission.
// The row's calendar date (`ts`) is the durable fact, so re-derive DOL from
// it — same "DOL is always computed live, never trusted from storage" rule
// the rest of the app follows. `dol` survives only as the fallback for a row
// with no date, or a patient with no admission date to measure from.
// `ts` goes through normalizeDateStr first: Sheets hands the Daily_Log date
// cell back as a real date value, and dolAtDate parses "YYYY-MM-DD" only, so
// a raw "Sun Aug 17 2026 00:00:00 GMT+0700" would fall through to the stored
// column — the exact staleness this function exists to avoid. syncFromGAS
// already normalizes the whole log map, so this is belt-and-braces for any
// caller holding an entry that didn't come through there.
// The gate is hasDolAnchor, not "has an admission date" (2026-09-24): a record
// with a dob and no admission date showed stored DOLs in the log beside a
// dob-based DOL in the strip, and one whose admission date was unusable had
// every row collapse onto the same frozen DOL.
function entryDol(patient, entry) {
  if (!entry) return 1;
  const ts = normalizeDateStr(entry.ts);
  if (ts && hasDolAnchor(patient)) return dolAtDate(patient, ts);
  return entry.dol || 1;
}

// The DOL of the admission day — what the Dashboard's "Day admit" counts from
// and the Edit form's "DOL แรกรับ" opens on. From the anchor, never from
// weights[0]: that is the birth row for any record with a birth measurement,
// which read every order as five days further into the admission than it was
// for an infant admitted on DOL 6 (2026-09-24). Only a record with no usable
// admission date falls back to the first row, as it always did.
function admissionDol(patient) {
  const adm = normalizeDateStr(patient?.admissionDate);
  if (adm && !admissionDateIssue(adm)) return dolAtDate(patient, adm);
  return Number(patient?.weights?.[0]?.dol) || 1;
}

// Date of birth from an admission date and the DOL on that day: admission date
// − (DOL − 1). The one place it is computed (2026-09-27, single source of
// truth): the Register and Edit modals and dobFromAdmission below each had
// their own copy of this arithmetic. A blank or non-numeric DOL counts as 1.
function dobFromAdmitDol(admitDate, admitDol) {
  const dol = Math.max(1, parseInt(admitDol, 10) || 1);
  return addDaysToDateStr(admitDate, -(dol - 1));
}

// The dob a legacy record without one implies: admission date − (the first
// row's DOL − 1). app.jsx gives every such record one at sync, so DOL is on the
// anchor that cannot move; the first edit of the record persists it. "" when
// there is no usable admission date to derive from.
function dobFromAdmission(patient) {
  if (!patient?.admissionDate || admissionDateIssue(patient.admissionDate)) return "";
  return dobFromAdmitDol(normalizeDateStr(patient.admissionDate), patient.weights?.[0]?.dol);
}

// ============================================================
// Growth-chart rows follow a corrected DOL anchor (2026-09-24)
// ============================================================
// weights[], lengths[] and hcs[] rows are keyed by the DOL that applied on the
// day each was taken, and carry no date. Orders re-derive their DOL from their
// own date (entryDol), so correcting the admission date or the DOL at
// admission moved every order and left every measurement where it was: a
// weight and an order from the same morning ended up days apart, and
// "measured wins on the same DOL" then paired weights from different days.
//
// anchorShiftDays is how far every DOL moves when a record changes from
// `before` to `after` (0 if either has no anchor). moveGrowthRows applies it,
// keeping each row on its calendar day, except the two rows the anchor itself
// defines:
//   • the birth row (DOL ≤ 1) — birth is DOL 1 whatever the anchor;
//   • rows on the old admission DOL — a legacy registration filed the birth
//     weight there — which move to the new admission DOL.
// It returns { rows, conflict }. `conflict` is { dol, to } for the first row
// that would land on or before the day of birth, or onto another row; the
// rows are then returned unmoved and the edit must not save.
function anchorShiftDays(before, after) {
  if (!hasDolAnchor(before) || !hasDolAnchor(after)) return 0;
  const ref = todayLocal();
  return dolAtDate(after, ref) - dolAtDate(before, ref);
}
function moveGrowthRows(rows, shift, admitDolBefore, admitDolAfter) {
  const list = Array.isArray(rows) ? rows : [];
  if (!shift && admitDolBefore === admitDolAfter) return { rows: list, conflict: null };
  const out = list.map(r => {
    if (!r || typeof r !== "object") return r;
    const dol = Number(r.dol);
    if (!isFinite(dol) || dol <= 1) return r;
    if (admitDolBefore > 1 && dol === admitDolBefore) return { ...r, dol: Math.max(1, admitDolAfter) };
    return { ...r, dol: dol + shift };
  });
  // Each conflict is named by the row that moved: first one pushed onto or
  // before the day of birth, then one landing on a DOL another row holds (two
  // rows that already shared a DOL are not this edit's doing). A row on the
  // admission DOL follows the admission, so it may land on DOL 1 — an infant
  // admitted on its birthday, whose registration row IS the birth weight —
  // and only a birth row already there (the second check) refuses it.
  const followsAdmission = (dol) => admitDolBefore > 1 && dol === admitDolBefore;
  for (let i = 0; i < out.length; i++) {
    const was = Number(list[i]?.dol), now = Number(out[i]?.dol);
    if (was > 1 && now <= 1 && !followsAdmission(was)) return { rows: list, conflict: { dol: was, to: now } };
  }
  for (let i = 0; i < out.length; i++) {
    const was = Number(list[i]?.dol), now = Number(out[i]?.dol);
    if (was === now) continue;
    for (let j = 0; j < out.length; j++) {
      if (j !== i && now === Number(out[j]?.dol) && was !== Number(list[j]?.dol)) {
        return { rows: list, conflict: { dol: was, to: now } };
      }
    }
  }
  return { rows: out.slice().sort((a, b) => (Number(a?.dol) || 0) - (Number(b?.dol) || 0)), conflict: null };
}

// ============================================================
// Bed labels — canonical form is exactly what BED_OPTIONS below offers:
// "NICU <n>" (1–12) and "SCN <n>" (1–30) are flat bed numbers, while the
// isolation rooms genuinely are two-part ("iso <room>-<bed>").
//
// Stored records carry non-canonical spellings that all name the same bed
// and must not be shown verbatim:
//   • a bogus "-1" sub-index ("NICU 1-1") — the registry modals used to
//     default the bed field to that literal string, which was never in
//     BED_OPTIONS, so it neither matched an <option> nor could be spotted in
//     the dropdown, and every patient admitted without touching the field
//     was filed under it;
//   • a hyphen where the ward name ends ("NICU-3", "SCN-2");
//   • stray casing or doubled whitespace.
// Normalizing on read shows the bed the ward actually calls it, and the
// value is rewritten for real the next time that patient row is saved.
// ============================================================
function normalizeBed(bed) {
  const s = String(bed ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const m = s.match(/^(nicu|scn|iso)\s*-?\s*(\d+)(?:\s*-\s*(\d+))?$/i);
  if (!m) return s;                       // unrecognized free-text bed — leave alone
  const ward = m[1].toLowerCase();
  if (ward === "iso") return m[3] ? `iso ${m[2]}-${m[3]}` : `iso ${m[2]}`;
  // NICU/SCN beds are a single number; a trailing "-<n>" is the old default's
  // artifact rather than a real sub-bed, so it is dropped.
  return `${ward.toUpperCase()} ${m[2]}`;
}

// The canonical bed list. It lives here rather than in registry.jsx because
// three things now need it and only one of them is a dropdown: the picker,
// the one-patient-per-bed occupancy guard, and the "next free bed" the
// transfer modal pre-selects. registry.jsx re-exports it as its own
// BED_OPTIONS so there is still exactly one <select> rendering it.
//
// SCN runs 1–30 (widened from 1–10 on 2026-09-15 at the ward's request).
// Widening is safe in a way narrowing is not: every bed a patient already
// occupies stays in the list. If SCN is ever narrowed again, patients parked
// above the new ceiling keep their label — BedSelect carries an off-list bed
// as an extra option — but they can no longer be re-picked, so check the
// census first.
const BED_OPTIONS = [
  ...Array.from({ length: 12 }, (_, i) => `NICU ${i + 1}`),
  "iso 1-1", "iso 1-2",
  "iso 2-1", "iso 2-2",
  "iso 3-1", "iso 3-2", "iso 3-3", "iso 3-4",
  ...Array.from({ length: 30 }, (_, i) => `SCN ${i + 1}`),
];

// Which ward a bed label belongs to: "NICU" | "SCN" | "iso" | "" (no bed) |
// "other" (free-text bed from the sheet). The ward gate on the registry and
// the next-free-bed search both group by this, so they can't disagree about
// where a bed lives.
function bedWard(bed) {
  const s = normalizeBed(bed);
  if (!s) return "";
  const m = s.match(/^(NICU|SCN|iso)\b/i);
  if (!m) return "other";
  const w = m[1].toLowerCase();
  return w === "iso" ? "iso" : w.toUpperCase();
}

// Which of the two wards the registry's entry screen puts a patient under.
// The isolation rooms are NICU rooms — they are staffed and rounded as part
// of NICU, and the ward gate offers the two wards the unit actually runs, so
// grouping iso under NICU is what keeps an isolated infant reachable from the
// screen the team looks for them on. Everything with no bed, or a free-text
// bed typed straight into the sheet, falls into "other" — which the gate
// shows as its own tile whenever it is non-empty, so no patient can be made
// unreachable by a bed label nobody recognizes.
function wardGroup(bed) {
  const w = bedWard(bed);
  if (w === "NICU" || w === "iso") return "NICU";
  if (w === "SCN") return "SCN";
  return "other";
}

// NeoFeed's wards are newborn units — NICU (with its iso rooms) and SCN — so,
// until a ward for older children is added, every patient is on one, with or
// without a bed. Praew named the two units in both rules below ("newborn
// (NICU+SCN)", "SCN+NICU"). A ward for children ≥ 2 years joins by adding its
// bedWard() value here (once bedWard recognises it), and gets Aminoplasmal
// and its own dead-space default.
const OLDER_CHILD_WARDS = Object.freeze([]);
function isNewbornUnit(patient) {
  return !OLDER_CHILD_WARDS.includes(bedWard(patient?.currentBed));
}

// Which amino-acid stocks (KCMH_STOCK keys) a patient may be ordered from,
// default first. Aminoplasmal 15% is contraindicated under 2 years by its
// label; Praew (2026-09-18): "plan ไว้สำหรับเด็กโตในอนาคต ปิดช่องนี้ไม่โชว์ใน
// newborn (NICU+SCN)". So every patient today is offered Aminoven only.
function aaProductsFor(patient) {
  return isNewbornUnit(patient) ? ["aminoven10"] : ["aminoven10", "aminoplasmal15"];
}

// Dead space (ปริมาตรคาสาย, sheet G8) a new TPN order starts with, mL/day —
// what stays in the giving set, so pharmacy prepares delivered + this and the
// Factor scales every additive. Praew (2026-09-18): "ใน SCN+NICU แก้เป็น +30 ml
// อัตโนมัติไปเลย". Until then every order started at 0 (no overfill). It is a
// starting value — the field and its chips still change it per order — and a
// saved order keeps its own. A future older-children ward starts at 0 until
// its own value is decided.
const NEWBORN_DEAD_VOL_ML = 30;
function defaultDeadVolFor(patient) {
  return isNewbornUnit(patient) ? NEWBORN_DEAD_VOL_ML : 0;
}

// The four statuses a session can carry, in the order every picker lists
// them: Edit session's select and the ward list's status chip (Pp,
// 2026-10-28). The server accepts exactly these (VALID_STATUS, gas-backend.gs).
const PATIENT_STATUSES = ["Active", "Discharged", "Transferred", "Expired"];

// Only a patient still on the unit occupies a bed — a discharged/transferred/
// expired session keeps its `currentBed` in the record (that is where they
// were), but the bed itself is free for the next admission. Same definition
// of "still here" as registry.jsx's isActivePatient, deliberately: if these
// two ever disagree, a bed reads as occupied by someone the registry no
// longer lists, and nothing on screen explains why it can't be picked.
function isOnUnit(p) {
  return !!p && patientStatus(p) === "Active";
}

// What a patient's status reads as, on every screen. A blank status is Active,
// the rule isOnUnit applies, so no chip reads blank or "Active" while the
// list it sits on says otherwise. A cell typed into the sheet by hand
// ("Active ", "discharged") reads as the status it names. Anything else stays
// as typed and is not on the unit: a mistyped "Expird" is not an Active infant
// holding a bed. gas-backend.gs reads a status the same way (_readStatus,
// 2026-10-28) in its sync window, its bed guard and its merge, and refuses to
// store a status that is not one of the four (_normStatus), so Edit session
// asks for one when the stored status is not (registry.jsx). Until then
// "Active " synced and dropped off the ward's list here (Vera, 2026-10-28),
// "active" reached no ward device, and "Expird" came back as Active on save.
function patientStatus(p) {
  const s = String((p && p.status) ?? "").trim();
  if (!s) return "Active";
  return PATIENT_STATUSES.find(k => k.toLowerCase() === s.toLowerCase()) || s;
}

// The two fields a status change writes: `status`, and `statusDate`, the day
// the patient left Active, from which the ward list hides an archived name
// after 7 days. Re-stamped only when the status actually changes, so saving
// the same archived status again does not restart those 7 days. An Active
// record that had no statusDate keeps the exact empty value it came with (""
// from the sheet), not null: under the three-way merge (app.jsx
// handleEditPatient, UP-S1) a phantom "" → null change would blank the
// statusDate another device had just stamped on a discharge. Edit session and
// the status chip both save through this.
//
// A stored status that is not one of the four ("Expird", typed by hand) is a
// typo of a status, not a status of its own: picking the one it meant keeps
// the date already recorded rather than stamping today (Vera, 2026-10-28). For
// Expired that date is the day of death, and today would also restart the
// 7-day archive hide and the server's 30-day sync window.
function statusChange(patient, status, today) {
  const prev = patientStatus(patient);
  const prevKnown = PATIENT_STATUSES.includes(prev);
  const statusDate = status === "Active"
    ? (prev === "Active" && !patient.statusDate ? (patient.statusDate ?? null) : null)
    : ((status !== prev && prevKnown) || !patient.statusDate) ? today : patient.statusDate;
  return { status, statusDate };
}

// Map of bed label → the patient holding it. `excludeSessionId` drops one
// patient from the map, which is what makes "save my own record again"
// different from "move onto someone else's bed": every caller that is
// editing an existing patient passes that patient's own id.
function bedOccupancy(patients, excludeSessionId) {
  const map = new Map();
  (patients || []).forEach(p => {
    if (!isOnUnit(p)) return;
    if (excludeSessionId && String(p.sessionId) === String(excludeSessionId)) return;
    const bed = normalizeBed(p.currentBed);
    if (!bed) return;
    // First writer wins, so a pre-existing double-booking (two rows typed
    // straight into the sheet) names the same patient everywhere it is
    // reported instead of flipping with list order.
    if (!map.has(bed)) map.set(bed, p);
  });
  return map;
}

// The patient already in `bed`, or null. Null for a blank bed: "not yet
// assigned" is not an occupancy, and several unbedded patients are normal.
function bedOccupant(patients, bed, excludeSessionId) {
  const b = normalizeBed(bed);
  if (!b) return null;
  return bedOccupancy(patients, excludeSessionId).get(b) || null;
}

// Who, if anyone, stops `record` being saved on the bed it names. A record
// that is not on the unit claims no bed: a discharged patient keeps their old
// bed label after the bed goes to the next admission, and correcting that
// record must not read as a double-book. Mirrors _bedConflict in gas-backend.gs.
function bedBlocker(patients, record) {
  if (!isOnUnit(record)) return null;
  return bedOccupant(patients, record.currentBed, record.sessionId);
}

// The one message for a bed someone else holds (2026-09-27, single source of
// truth: the modals and App's last check worded it two ways). It says who is in
// it and what to do, because "เตียงไม่ว่าง" alone leaves the user clicking the
// same option again. The server words its own refusal (_bedConflict).
function bedTakenMsg(bed, holder) {
  const who = patientName(holder) || holder.sessionId;
  return `เตียง ${bed} มี ${who} อยู่แล้ว — ต้องย้าย ${who} ออกก่อน (Transfer) จึงจะบันทึกเตียงนี้ได้`;
}

// A patient "parked" mid-move (Praew, 2026-09-23: "ย้ายเตียงแปะไว้ก่อน"): they
// hold no bed right now but have left one, recorded in bedHistory. A swap of
// two occupied beds is park A → move B into A's bed → move A into B's — the
// one-infant-per-bed rule (here and _bedConflict in gas-backend.gs) never
// bends, because a blank bed is not an occupancy.
function lastBed(p) {
  const h = (p && Array.isArray(p.bedHistory)) ? p.bedHistory : [];
  for (let i = h.length - 1; i >= 0; i--) {
    const b = normalizeBed(h[i] && h[i].bed);
    if (b) return b;
  }
  return "";
}
// Only an infant still on the unit is waiting for a bed. One discharged,
// transferred or expired while parked keeps the blank bed and the history,
// and read "รอเตียง" in the warn colour on the archive rows, Switch patient
// and the Dashboard strip (2026-09-27).
function isParked(p) {
  return !!p && isOnUnit(p) && !normalizeBed(p.currentBed) && !!lastBed(p);
}
// One "Previous beds" entry: the bed left, the local day, and the moment.
// `at` makes every move its own entry. gas-backend.gs merges bedHistory
// append-only and skips an incoming entry equal to one it already holds, so
// with only { bed, date } a same-day return — NICU 4 → SCN 1 → NICU 4, then
// park — lost its last hop, and every device then read "รอเตียง · จาก SCN 1"
// on the SCN list (2026-09-27). A dialog makes its hop once and re-sends that
// same hop on a retry, so a retried save still reads as the same move.
function bedHop(bed) {
  return { bed: normalizeBed(bed), date: todayLocal(), at: new Date().toISOString() };
}
// Which ward list a patient belongs on: their bed's ward, or — while parked —
// the ward of the bed they left, so they stay on the list the nurse is
// working from instead of dropping into "อื่นๆ" in the middle of a swap.
function patientWard(p) {
  const bed = normalizeBed(p && p.currentBed);
  if (bed) return wardGroup(bed);
  const last = lastBed(p);
  return last ? wardGroup(last) : "other";
}

// The lowest-numbered free bed in a ward — what the transfer modal
// pre-selects so moving a patient out of NICU lands them on the next running
// SCN number instead of on whatever bed happened to be listed first.
// Returns "" when the ward is full, which callers must treat as "leave the
// current selection alone", never as "unassign the patient".
function nextFreeBed(patients, ward, excludeSessionId) {
  const occupied = bedOccupancy(patients, excludeSessionId);
  return BED_OPTIONS.find(b => bedWard(b) === ward && !occupied.has(b)) || "";
}

// ============================================================
// KCMH Enteral Supplement Formulary
// Source: Chula Pediatric Nutrition Handbook 3rd edition
// ============================================================
const SUPP_DB = {

  // ── Multivitamin drops ──────────────────────────────────────
  MTV_MUNTIVIM: {
    label: "Munti-vim Drop",
    category: "mtv",
    form: "drop", unitVol: 1, unitLabel: "mL",
    dose_default: 1,                  // 1 mL/day (fixed dose)
    vitD_iu_per_ml:  400,
    vitA_iu_per_ml:  2000,
    vitC_mg_per_ml:  40,
    b1_mg_per_ml:    2,
    b2_mg_per_ml:    2,
    b3_mg_per_ml:    15,
    b6_mg_per_ml:    1.8,
    b12_mcg_per_ml:  5,
    ca_mg_per_ml:    5,
    note: "1 mL/day · มี Vit D3 400 IU — นับรวมกับ supplement Vit D ด้วย",
  },

  // ── Phosphate solutions (oral) ──────────────────────────────
  // Phosphate Solution: 5 mL = Na 4.94 mEq + PO4 265 mg (8.55 mmol)
  PO4_PHOSPHATE: {
    label: "Phosphate Solution",
    category: "po4",
    form: "solution", unitVol: 5, unitLabel: "mL",
    po4_mg_per_ml:   53,              // 265 mg / 5 mL
    po4_mmol_per_ml: 265 / 31 / 5,   // ≈ 1.710 mmol/mL
    na_meq_per_ml:   4.94 / 5,       // ≈ 0.988 mEq/mL
    k_meq_per_ml:    0,
    note: "5 mL = PO4 265 mg (8.55 mmol) + Na 4.94 mEq",
  },
  // Neutral Phos: 5 mL = Na 0.475 mEq + K 0.475 mEq + PO4 72 mg (2.32 mmol)
  PO4_NEUTRAL: {
    label: "Neutral Phos Solution",
    category: "po4",
    form: "solution", unitVol: 5, unitLabel: "mL",
    po4_mg_per_ml:   14.4,
    po4_mmol_per_ml: 72 / 31 / 5,    // ≈ 0.465 mmol/mL
    na_meq_per_ml:   0.475 / 5,      // ≈ 0.095 mEq/mL
    k_meq_per_ml:    0.475 / 5,
    note: "5 mL = PO4 72 mg (2.32 mmol) + Na 0.475 mEq + K 0.475 mEq",
  },

  // ── Iron drops ──────────────────────────────────────────────
  // Ferdek Drop: 1 mL = 25 mg elemental Fe (ferric iron complex)
  FE_FERDEK: {
    label: "Ferdek Drop",
    category: "fe",
    form: "drop", unitVol: 1, unitLabel: "mL",
    fe_mg_per_ml:    25,
    note: "25 mg elem Fe/mL · ESPGHAN 2022: 2–3 mg/kg/day · เริ่มอายุ 2–4 สัปดาห์",
  },
  // Ferrokid: 1 mL = 5 mg elemental Fe
  FE_FERROKID: {
    label: "Ferrokid Suspension",
    category: "fe",
    form: "suspension", unitVol: 1, unitLabel: "mL",
    fe_mg_per_ml:    5,
    note: "5 mg elem Fe/mL",
  },

  // ── Calcium oral ─────────────────────────────────────────────
  // CaCO3 350 mg tab: 140 mg elem Ca (7 mEq) per tab
  CA_CACO3_350: {
    label: "CaCO₃ 350 mg",
    category: "ca",
    form: "tab", unitVol: 1, unitLabel: "tab",
    ca_mg_per_unit:  140,             // elemental Ca per tab
    ca_meq_per_unit: 7,
    note: "140 mg elem Ca/tab (7 mEq) · บด + ละลายน้ำให้นม",
  },
  // CaCO3 1000 mg tab: 400 mg elem Ca (20 mEq)
  CA_CACO3_1000: {
    label: "CaCO₃ 1000 mg",
    category: "ca",
    form: "tab", unitVol: 1, unitLabel: "tab",
    ca_mg_per_unit:  400,
    ca_meq_per_unit: 20,
    note: "400 mg elem Ca/tab (20 mEq)",
  },
  // Calcetate 1000 mg: 253 mg elem Ca (12.6 mEq)
  CA_CALCETATE: {
    label: "Calcetate 1000 mg",
    category: "ca",
    form: "tab", unitVol: 1, unitLabel: "tab",
    ca_mg_per_unit:  253,
    ca_meq_per_unit: 12.6,
    note: "253 mg elem Ca/tab (12.6 mEq)",
  },

  // ── Vitamin D drops ──────────────────────────────────────────
  // (Generic — D3 drops vary by brand; user inputs IU/kg/day and concentration)
  VITD_GENERIC: {
    label: "Vitamin D3 drops (generic)",
    category: "vitd",
    form: "drop", unitVol: 1, unitLabel: "drop",
    vitD_iu_per_drop: 400,           // typical Thai market: 400 IU/drop
    note: "ตรวจสอบ concentration ตามยี่ห้อ · เป้าหมาย 400–700 IU/kg/day (ESPGHAN 2022)",
  },
};

// ============================================================
// Patient name (ชื่อ + นามสกุล) and the patient search
// ============================================================
// Pp, 2026-09-25: "ใส่ชื่อ เป็นชื่อ + นามสกุล เอาตัวอักษรไทย สองตัวแรก", then
// "ให้ใส่เป็นชื่อภาษาไทย (ยกเว้นต่างชาติ)", then "ให้ใช้เป็นตัวอักษรเท่านั้น
// ไม่นับสระหรือวรรณยุกต์ เช่น ทองดี ใช้ ทอ, เรยา ใช้ รย". Until then a name was
// ONE box of two characters, the first letter of the first name and of the
// surname ("ปพ"), and the ward reported it as close to unsearchable
// ("ค้นหายากมาก"): one letter of a name matches half the unit. A name is now
// two parts, the first two LETTERS of the first name and of the surname,
// stored in the one `name` column as "รย ทอ" (one space between; Pp's own
// example was "กค จด").
//
// A letter is one of the 44 consonants (พยัญชนะ). Every vowel is dropped —
// before the letter (เ แ โ ใ ไ), after it (ะ า ำ ๅ), above or below it — and
// so is every tone mark and ์. ฤ and ฦ are vowels in Thai grammar although
// Unicode files them among the consonants, so they are dropped too. อ ย ว ห
// are consonants wherever they stand: ทองดี → ทอ, เรยา → รย, สมศรี → สม,
// ใจดี → จด, พัฒนา → พฒ, น้ำฝน → นฝ.
//
// Except a name with fewer than two letters (Pp, 2026-09-27: "ฤดี จะใช้ ฤด …
// ถ้าเกิดขึ้นจริง ให้นับสระเฉพาะชื่อแบบนี้"). There its vowels count too, ฤ and
// ฦ with them, in the order typed, so it still keeps two characters: ฤดี → ฤด,
// ใจ → ใจ, คำ → คำ. Tone marks and ์ never count. Until then such a name could
// not be registered at all: two letters were required, and it has one.
//
// Thai, so every name is typed and searched from one keyboard. The exception
// is a foreign infant (`foreign`): the first two English letters, the first
// capitalised ("John Smith" → "Jo Sm"). Which one a stored name is needs no
// column of its own: its letters say so.
const NAME_PART_CHARS = 2;
// The 44: ก–ร, ล, ว–ฮ (U+0E24 ฤ and U+0E26 ฦ left out).
const THAI_CONSONANTS_RE = /[\u0E01-\u0E23\u0E25\u0E27-\u0E2E]/g;
// A name with fewer than two letters is cut from these instead: the letters,
// ฤ ฦ, and the vowels (ะ–ู, เ–ๅ). None of the marks: ็ ่ ้ ๊ ๋ ์ ํ ๎.
const THAI_SHORT_NAME_RE = /[\u0E01-\u0E2E\u0E30-\u0E39\u0E40-\u0E45]/g;
const HAS_THAI_RE  = /[\u0E00-\u0E7F]/;
const HAS_LATIN_RE = /[A-Za-z]/;
// A word's letters, in order: what a Thai name part is cut from, and what a
// search word is compared by.
function thaiLetters(s) {
  return String(s ?? "").match(THAI_CONSONANTS_RE) || [];
}

// The part of one typed name that is kept. Both patient modals run what is
// typed through this, so a box shows exactly what will be saved, and typing
// on past two letters changes nothing.
function namePart(raw, foreign) {
  const s = String(raw ?? "").normalize("NFC");
  if (foreign) {
    // "José" → "Jo": accents off, then letters only.
    const letters = s.normalize("NFD").replace(/[\u0300-\u036F]/g, "").replace(/[^A-Za-z]/g, "")
      .slice(0, NAME_PART_CHARS);
    return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
  }
  const letters = thaiLetters(s);
  if (letters.length >= NAME_PART_CHARS) return letters.slice(0, NAME_PART_CHARS).join("");
  // Fewer than two letters: the vowels count as well (ฤดี → ฤด, ใจ → ใจ).
  return (s.match(THAI_SHORT_NAME_RE) || []).slice(0, NAME_PART_CHARS).join("");
}

// Both parts at their full two letters. Registration requires it; an edit
// requires it as soon as anything is typed into either box.
function nameComplete(first, last, foreign) {
  const full = (x) => { const p = namePart(x, foreign); return p === String(x ?? "") && Array.from(p).length === NAME_PART_CHARS; };
  return full(first) && full(last);
}

// The stored form, "ชื่อ นามสกุล".
function composePatientName(first, last, foreign) {
  return `${namePart(first, foreign)} ${namePart(last, foreign)}`.trim();
}

// A stored name back into its two parts, or null when it is not in the
// two-part form: a name registered before 2026-09-25 (the two-letter "ปพ", a
// Latin nickname), a cell typed by hand, a PDPA-erased row. Callers keep such
// a name exactly as it is unless somebody types a new one.
function splitPatientName(name) {
  const m = /^(\S+) (\S+)$/.exec(String(name ?? "").trim());
  if (!m) return null;
  const foreign = !HAS_THAI_RE.test(m[0]);
  return nameComplete(m[1], m[2], foreign) ? { first: m[1], last: m[2], foreign } : null;
}

// The two letters of the `initials` column: the first letter of each part, so
// "สม จด" → "สจ" (ฤด → ด: ฤ is a vowel). A new sessionId began with them until
// 2026-09-27; it is random now (newSessionId, below). For a word that is not a
// stored part (the old two-letter names' search, below) it is the first
// consonant: เพ็ญ → พ.
function nameInitial(part) {
  const s = String(part ?? "");
  const t = thaiLetters(s);
  return t.length ? t[0] : s.charAt(0).toUpperCase();
}
function nameInitials(first, last) {
  return nameInitial(first) + nameInitial(last);
}

// The infant's name as every screen, form and search shows it: the `name`
// column, or the `initials` one for a record from before names were stored, or
// "". The one definition (2026-09-27, single source of truth); each caller adds
// only its own placeholder, "—" or the NeoFeed ID where someone must be named.
function patientName(p) {
  return String((p && (p.name || p.initials)) || "");
}

// ── NeoFeed ID ────────────────────────────────────────────────
// A new infant's sessionId is "NF-" and six random digits (Pp, 2026-09-27:
// "สร้าง ID … มันก็แค่ ID ที่หลังบ้านจะเข้าใจตรงกันเฉยๆ user ไม่ต้องรู้ความหมาย
// แค่บอกว่าเป็น ID เดียวกัน"). Until then it was the initials, the birth weight
// and the twin letter ("สจ-BW900-A"). That put patient data into every order
// copied to LINE, and two unrelated infants with the same initials and weight
// drew the same id, which the server refused with advice nobody could follow.
// The id is the key of every Patient_Registry and Daily_Log row, so an existing
// one never changes: only new registrations get this form. An id that is
// already taken is refused by the server, and handleAddPatient (app.jsx) draws
// another one.
const SESSION_ID_PREFIX = "NF-";
function newSessionId() {
  const c = (typeof globalThis !== "undefined" && globalThis.crypto)
    || (typeof window !== "undefined" && window.crypto);
  let n;
  if (c && typeof c.getRandomValues === "function") {
    const a = new Uint32Array(1);
    // 4294000000 is the largest multiple of 10^6 below 2^32: no modulo bias.
    do { c.getRandomValues(a); } while (a[0] >= 4294000000);
    n = a[0] % 1000000;
  } else {
    n = Math.floor(Math.random() * 1000000);
  }
  return SESSION_ID_PREFIX + String(n).padStart(6, "0");
}

// ── Search ────────────────────────────────────────────────────
// What two spellings of one name have in common: for comparing, never for
// storing. Tone marks and the other marks from U+0E47 are dropped (they are
// what gets left out or mistyped), ํ+า is ำ, zero-width characters go, Latin
// is lower-cased, and dots and white space become single spaces.
function searchFold(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/\u0E4D\u0E32/g, "\u0E33")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u0E47-\u0E4E]/g, "")
    .toLowerCase()
    .replace(/[\s.]+/g, " ")
    .trim();
}

// Honorifics a query may begin with when it is copied from the hospital
// record. A query is tried with them and without, so a real name that starts
// the same way (นางนวล) is still found. Longest first, so บุตรนาง wins over บุตร.
const NAME_TITLES = ["เด็กหญิง", "เด็กชาย", "ด.ญ.", "ด.ช.", "บุตรนางสาว", "บุตรนาง", "บุตร",
  "นางสาว", "น.ส.", "นาง", "นาย", "ทารก"].map(searchFold).sort((a, b) => b.length - a.length);
function stripNameTitles(folded) {
  let s = folded;
  for (let again = true; again;) {
    again = false;
    for (const t of NAME_TITLES) {
      if (s.startsWith(t) && s.length > t.length) { s = s.slice(t.length).trim(); again = true; break; }
    }
  }
  return s;
}

// A query typed with the keyboard left in English, read as the Thai keys it
// was meant for: "l;ylfu" is "สวัสดี". Both shift levels of the Kedmanee
// layout, generated from its X11 definition (xkb symbols/th "basic").
const KEDMANEE_EN = "`~1!2@3#4$5%6^7&8*9(0)-_=+qQwWeErRtTyYuUiIoOpP[{]}aAsSdDfFgGhHjJkKlL;:'\"\\|zZxXcCvVbBnNmM,<.>/?";
const KEDMANEE_TH = "_%ๅ+/๑-๒ภ๓ถ๔ุูึ฿ค๕ต๖จ๗ข๘ช๙ๆ๐ไ\"ำฎพฑะธัํี๊รณนฯยญบฐล,ฟฤหฆกฏดโเฌ้็่๋าษสศวซง.ฃฅผ(ป)แฉอฮิฺื์ท?มฒใฬฝฦ";
function qwertyToThai(s) {
  return Array.from(String(s ?? "")).map(c => {
    const i = KEDMANEE_EN.indexOf(c);
    return i < 0 ? c : KEDMANEE_TH[i];
  }).join("");
}

// One folded query against one patient's name.
//   100  the words are the two parts exactly ("รย ทอ")
//    80  every word begins a part, or a part begins the word — so a whole
//        "เรยา" finds "รย", and "ร" finds it too — first name or surname
//    70  the two parts typed together, without the space ("รยทอ")
//    60  a name from before 2026-09-25, matched as it always was: the query
//        anywhere in it, or it at the start of the query
//  45/40/35  such a name that is two Thai letters — the old initials — against
//        the initials of the words typed, so "สมศรี ใจดี" still finds the
//        "สใ" registered last week (both words, the first, the second)
// A Thai word is compared by its letters alone (thaiLetters), exactly as the
// stored part was cut: "ทองดี", "ทอง" and "ทอ" all read ทอ…, whatever vowels
// or tone marks were typed or left out. An English word by its letters.
function nameSearchRank(name, q) {
  const words = q.split(" ").filter(Boolean);
  if (!words.length) return 0;
  const either = (a, b) => a.startsWith(b) || b.startsWith(a);
  const parts = splitPatientName(name);
  if (parts) {
    const key = (w) => parts.foreign ? w.replace(/[^a-z]/g, "") : thaiLetters(w).join("");
    const f = key(searchFold(parts.first)), l = key(searchFold(parts.last));
    const keys = words.map(key).filter(Boolean);
    if (!keys.length) return 0;
    if (keys.every(k => either(k, f) || either(k, l))) {
      return keys.length === 2 && keys[0] === f && keys[1] === l ? 100 : 80;
    }
    return keys.length > 1 && either(keys.join(""), f + l) ? 70 : 0;
  }
  const whole = searchFold(name);
  if (!whole) return 0;
  if (whole.includes(q) || q.startsWith(whole)) return 60;
  if (/^[\u0E01-\u0E2E\u0E40-\u0E44]{2}$/.test(whole)) {
    // Whoever typed the old initials may have written a leading vowel (ใ of
    // ใจดี) or the consonant after it (จ): either counts.
    const starts = (w, letter) => w.charAt(0) === letter || nameInitial(w) === letter;
    if (words.length >= 2) return starts(words[0], whole[0]) && starts(words[1], whole[1]) ? 45 : 0;
    if (starts(words[0], whole[0])) return 40;
    if (starts(words[0], whole[1])) return 35;
  }
  return 0;
}

// A bed: a number is a bed number (50 exact, 30 as its start — "1" is NICU 1
// first, then 10–12); anything else anywhere in the label, 30. A parked
// infant answers to the bed they left, which is what their card shows.
function bedSearchRank(p, q) {
  const bed = (normalizeBed(p.currentBed) || lastBed(p)).toLowerCase();
  if (!bed) return 0;
  if (/^\d+(-\d+)?$/.test(q)) {
    const num = (/\d+(?:-\d+)?$/.exec(bed) || [""])[0];
    return num === q ? 50 : num.startsWith(q) ? 30 : 0;
  }
  const flat = q.replace(/\s+/g, "");
  return flat.length >= 2 && bed.replace(/\s+/g, "").includes(flat) ? 30 : 0;
}

// How well one patient answers the search box: 0 is not at all, and higher is
// a better answer — the name (above), then the bed, then the NeoFeed ID as
// printed on the order form (20), then the diagnosis (10). A query that
// starts with an honorific is also tried without it.
//
// The ID is compared without its hyphens, so "สจ-BW900", "nf-482913" and
// "nf482913" all find theirs. Four or more digits alone are the digits of an
// NF id (482913 finds NF-482913): no bed number is that long.
function idSearchRank(id, v) {
  const flat = v.replace(/[\s-]/g, "");
  const idFlat = id.replace(/[\s-]/g, "");
  if (/^\d+$/.test(flat)) return flat.length >= 4 && idFlat.startsWith(SESSION_ID_PREFIX.replace(/-/g, "").toLowerCase() + flat) ? 20 : 0;
  return flat.length >= 3 && idFlat.startsWith(flat) ? 20 : 0;
}
function patientSearchRank(p, query) {
  const q = searchFold(query);
  if (!q || !p) return 0;
  const bare = stripNameTitles(q);
  const id = searchFold(p.sessionId), dx = searchFold(p.diagnosis);
  let best = 0;
  for (const v of bare && bare !== q ? [q, bare] : [q]) {
    best = Math.max(best,
      nameSearchRank(patientName(p), v),
      bedSearchRank(p, v),
      idSearchRank(id, v),
      v.length >= 2 && dx.includes(v) ? 10 : 0);
  }
  return best;
}

// The search box over a list: the patients that answer `query`, best first,
// ties in the order given (the ward list passes them in bed order). One
// function behind every search box, so no two can disagree. When nothing
// answers and the query has English letters and no Thai, it is read once more
// as typed on the Thai layout; `thai` is then that reading, so the list can
// say what it searched for. It is "" whenever the query was used as typed.
function searchPatients(patients, query) {
  const list = Array.isArray(patients) ? patients : [];
  const run = (q) => list
    .map((p, i) => ({ p, i, r: patientSearchRank(p, q) }))
    .filter(x => x.r > 0)
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map(x => x.p);
  const text = String(query ?? "");
  const hits = run(text);
  if (hits.length || !HAS_LATIN_RE.test(text) || HAS_THAI_RE.test(text)) return { hits, thai: "" };
  const thai = qwertyToThai(text.trim());
  const thaiHits = run(thai);
  return thaiHits.length ? { hits: thaiHits, thai } : { hits: [], thai: "" };
}

// ============================================================
// Export
// ============================================================
window.NEOFEED_DATA = {
  // Enteral formula database
  EN_DB,
  // Step 2's feed and strength pickers, and the two-feed composition
  EN_PRODUCTS, enProductOf, enMixPer100mL, enFeedsUnknown, EN_FEEDS_PER_DAY_MAX,
  // KCMH supplement formulary
  SUPP_DB,
  // Product reference
  AA_PRODUCTS, LIPID_PRODUCTS, ADDITIVE_PRODUCTS,
  // Display-only strength reference. NOT compounding divisors — KCMH_STOCK is
  // the sole authority for those, and this table deliberately lists strengths
  // KCMH does not stock (NaCl 3%, KCl 1 mEq/mL). Renamed so it can't be reached
  // for by mistake alongside KCMH_STOCK; see the warning at its declaration.
  SALT_SOURCES_REFERENCE_ONLY: SALT_SOURCES,
  // Target systems (backward-compatible function API)
  TARGETS, TPN_TARGETS, ENTERAL_TARGETS,
  // Comprehensive ESPGHAN reference object (for display panels)
  ESPGHAN_TARGETS,
  // Growth charts
  FENTON_WEIGHT, FENTON_WEIGHT_GROWTH_LMS, FENTON_LENGTH, FENTON_HC,
  // Patient data (mock — replace with GAS fetch)
  MOCK_PATIENTS, MOCK_DAILY_LOG,
  // Utility functions
  rangeStatus, estimateOsmolarity, calcGIR, girToGPerKg, displayNum,
  // The ONE GIR grading — the Calculator and the Alerts page both call it, so
  // the same saved GIR can never be amber on one screen and red on the other.
  girStatus, GIR_HARD_HI, KCAL_HARD_HI,
  PROTEIN_HARD_HI, LIPID_IV_HARD_HI, K_IV_HARD_HI, NPE_IV_CRIT_LO, OSM_PERIPHERAL_MAX,
  // KCMH pharmacy stock strengths + the sheet's hard safety ceilings
  KCMH_STOCK, MAX_DEXTROSE_G_KG, K_BAG_MEQ_PER_L, kBagLimitsFor, LIPID_GKGH, MAX_ZN_MG_DAY, TPN_WT_RANGE_G, TPN_WT_MANUAL_MAX_DIFF, MG_MG_PER_MEQ, MEN_MAX_ML_KG,
  TPN_BOTTLE_MAX_ML, VIT_D_MAX_IU_DAY, HEPARIN_USUAL_MAX_U_ML, FIRST_DAYS_LAST_DOL,
  // Newborn units (every ward today): which amino-acid stock, what dead space a new order starts with
  OLDER_CHILD_WARDS, isNewbornUnit, aaProductsFor, NEWBORN_DEAD_VOL_ML, defaultDeadVolFor,
  // Provenance — which constants and which frontend produced a printed number.
  // Written to Daily_Log AF/AG and printed on the order form. Bump
  // CONSTANTS_VERSION whenever a value above can move a dose.
  CONSTANTS_VERSION, APP_VERSION, appVersion,
  // Publish-lock rollout flag — see its declaration above.
  ENABLE_PUBLISH_GATE,
  // Staleness decision for the sync banner + the thresholds behind it
  syncFreshness, SYNC_WARN_MS, SYNC_STALE_MS, SYNC_POLL_MS,
  // Live DOL helper. entryDol re-derives a saved log row's DOL from its date
  // instead of trusting the stored (snapshot, goes stale) `dol` column;
  // admissionDol is the admission day's DOL, from the anchor.
  liveDol, dolAtDate, entryDol, admissionDol, daysBetweenDateStr,
  dobCredible, hasDolAnchor, dobFromAdmission, dobFromAdmitDol,
  // Growth-chart rows follow a corrected anchor (EditPatientModal)
  anchorShiftDays, moveGrowthRows,
  // Admission/birth-date plausibility. Every DOL, PMA and DOL-indexed target
  // is measured from these, and a blank / future / Buddhist-era value used to
  // pin DOL at 1 silently. Both registry modals and dolAtDate check it.
  admissionDateIssue, toChristianEraDateStr, ADMIT_DATE_MIN,
  // Growth velocity, and when it must NOT be graded: before any weight is
  // above birth weight (below it, or only back AT it), and past the Fenton
  // reference at 42 weeks PMA. REGAIN_EXPECTED_BY_DOL (14) splits the
  // not-yet-above case into the expected window and a caution past it.
  growthVelocity, PMA_REFERENCE_MAX, GROWTH_VEL_TARGET, GROWTH_VEL_CRITICAL, REGAIN_EXPECTED_BY_DOL,
  // Canonical bed label ("NICU 1-1"/"NICU-1" → "NICU 1"; iso keeps room-bed),
  // the one bed list, and the one-patient-per-bed occupancy helpers
  normalizeBed, BED_OPTIONS, bedWard, wardGroup, bedOccupancy, bedOccupant, bedBlocker, bedTakenMsg, nextFreeBed,
  lastBed, isParked, patientWard, bedHop,
  // "Still on the unit" — the one definition the bed guard, the Alerts badge
  // and the admin census all read, so a discharged infant cannot hold a bed on
  // one screen, raise an alarm on a second and count as a census on a third.
  isOnUnit,
  // The status list, how a status reads, and what changing it writes — the
  // one source for Edit session, the ward list's status chip and the strip
  PATIENT_STATUSES, patientStatus, statusChange,
  // Local (Bangkok) calendar dates — use instead of toISOString().slice(0,10),
  // which yields the UTC date and is a day behind before 07:00 local
  todayLocal, addDaysToDateStr,
  // "What day is it" as a live value — re-renders the caller at midnight
  useTodayLocal,
  // Date coercion + Daily_Log normalization: the sheet can hand back `ts` as a
  // Date object, so never compare a raw entry.ts to a YYYY-MM-DD string
  normalizeDateStr, normalizeLogEntries, normalizeLogMap, hasLogOnDate, hasDraftOnDate, isDraftEntry, finalEntries,
  // THE current weight — every screen calls it with the patient's Daily_Log
  // (see currentWeight) — and the joined series it reads.
  currentWeight, weightSeries,
  // A weight merged into weights[] the growth chart's way (the nursing form
  // records its weight through it), and the nursing I/O helpers
  upsertWeight, nursingIntakeMl, nursingRecordOn, normalizeNursingMap,
  // The birth-weight-floor divisor for intake/output mL/kg/day math (see
  // calculator.jsx Step 1); its previous-day weight is currentWeight's
  ioDivisorG,
  // GA / PMA helpers (WW.D shorthand)
  gaTotalDays, daysToGA, fmtGA, pmaShort, gaToDecimalWeeks, parseGAInput,
  // Corrected age in days (negative = still preterm)
  correctedAge,
  // Patient name: ชื่อ + นามสกุล, two characters each (Thai; English for a
  // foreign infant), and the one search every search box goes through
  NAME_PART_CHARS, namePart, nameComplete, composePatientName, splitPatientName, nameInitials,
  newSessionId, patientName,
  searchFold, qwertyToThai, patientSearchRank, searchPatients,
};
