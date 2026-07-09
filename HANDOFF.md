# NeoFeed V2 — Session Handoff
**Last updated:** 2026-05-25 (session 8) | **Status:** 🟢 PRODUCTION

---

## TLDR — read this only
- **Canonical:** `NeoFeed.html` (React 18 CDN + Babel) — open this
- **GAS URL:** `https://script.google.com/macros/s/AKfycby44DAIfEueeGj_XSKCyWEWmgr46WjP-vKFEGnDhZSr2_q0KdyO8O5CBxY2qqdoNkoN/exec` — currently **commented out** in `NeoFeed.html` line ~960 (sandbox uses mock data). Restore for production.
- **Sheet schema CHANGED in session 8:** Daily_Log now has 16 columns (A–P). If you redeploy `gas-backend.gs`, you must add `ca | p | enVolPerKg` columns before the existing `route | status | submittedBy` cols, OR clear the sheet so the script re-creates headers.
- **No open bugs.** Mobile-first polish done.
- **Next (optional):** discharge workflow · drug compatibility · Buddhist calendar in Edit modals

---

## Session 8 changes (2026-05-25)

### New features
1. **TrendGraph** in Daily log — single-metric trend with target band shading, metric chips (Energy / Protein / GIR / Fluid / Na / K / Ca / P / Weight), X-axis toggle (Admit day ↔ DOL), smooth Catmull-Rom curve, hover crosshair + tooltip
2. **PN/EN dynamic targets** — TrendGraph picks `ENTERAL_TARGETS` when an entry's `enVolPerKg ≥ 100`, else `TPN_TARGETS(dol)`. PN/EN badge shown next to target value (blue / green)
3. **Live DOL** — single helper `liveDol(patient)` in `data.js` (admit date + days since). Used everywhere: PatientStrip, Calculator, Registry table, Fenton MeasurementLogger
4. **GA / PMA in WW+D format** — stored as `WW.D` shorthand (e.g. `28.1` = 28 wk 1 d). `fmtGA(ga)` → `"28+1"`. `parseGAInput("28+4")` accepts both `28+4` and `28.4`. Days digit clamped to 0-6
5. **Thai BE date format** — `fmtDate("2026-05-15")` → `"15 พ.ค. 2569"`. Exposed via `window.NEOFEED_FMT_DATE`
6. **Stale-weight alert** — warn at 3+ days, crit at 7+ days since last weight entry
7. **Calculator prefill** — full input state persisted to `localStorage[neofeed_calc_<sessionId>]` on submit/draft. Restored on patient switch with blue "Prefilled from previous submission (DOL X)" banner
8. **Smart defaults Step 1** — current weight prefilled from latest stored weight; target fluid prefilled from ESPGHAN midpoint for DOL+BW
9. **Feed-type dropdown reorder** — BM → FBM with HMF → Preterm Formula 20/22/24 → FBM↔Infatrini → Infatrini → LF 20/24/27. Brands merged into generic LF (HiQ + Enfalac averaged in `EN_DB.LF_*`)

### UX polish
- Login screen REMOVED — app skips straight to registry with stub Local user. To restore: `app.jsx` line ~220 flip `if (false)` → `if (!user)`
- Calculator opens with only Step 1 expanded (was Steps 1+2)
- Step 4 collapsed summary hides "ยังไม่ได้ตั้ง" placeholder when no enteral set
- Shell scroll fixed: `.app` is `height: 100dvh + overflow: hidden`, only `.work` scrolls (topbar + bottom-nav stay pinned)
- Δ vs prev in TrendGraph hidden when either value is 0 (route-change noise)
- Route stopped indicator shows when going non-zero → 0

### Mobile QOL (session 8 final pass)
- **Registry on mobile** = card list (each patient = tappable card with name+status, bed+GA/BW/DOL, diagnosis, Wt+Δ, Edit/Open). Desktop keeps the table
- **Patient strip on mobile** — Identity row spans full width on top, other 4 cells in 2×2 below
- **TrendGraph chips** — horizontal-scroll with snap on mobile, larger 38-44px tap targets, pill style with color-dot indicator
- **TrendGraph stats row** — vertical dividers between Latest / Target / Δ on desktop; 2-col grid stack on mobile (Latest spans full width)
- **X-axis seg** — compact pill-style (28px tall, 6px radius) using `.trend-xaxis-seg` class. Labels shortened: "Admit day" / "DOL"
- **Alert rows** stack on mobile (Acknowledge button full-width below)
- **Calculator save bar** sticky on mobile (above bottom nav)
- **Bottom-nav badge** positioned next to icon (top:4, left: 50%+6) — no center overlap
- **Modal safe-area** padding (iOS bottom inset)

### Logged data (per Daily_Log entry)
Now captures combined PN+EN totals:
`{ dol, weight, fluid, gir, pro, kcal, na, k, ca, p, enVolPerKg, route, status }`

Where `enVolPerKg` drives target picker. `pro/kcal/na/k/ca/p` are per-kg combined PN+EN.

---

## File inventory

```
NeoFeed.html      App shell + all CSS (oklch design system)
data.js           Clinical data — ESPGHAN/WHO targets + formulas + helpers (liveDol, fmtGA, pmaShort, gaToDecimalWeeks, parseGAInput)
calculator.jsx    TPN + EN calculator (Steps 1–5) + prefill from localStorage
app.jsx           Nav rail, patient registry routing, fmtDate (Thai BE), AlertCenter, BottomNav
fenton.jsx        Fenton 2013 growth chart + MeasurementLogger
log.jsx           Daily nutrition log + TrendGraph (pickTarget for PN/EN)
registry.jsx      Patient registry — mobile card list + desktop table
icons.jsx         SVG icon library
tweaks-panel.jsx  UI customization
gas-backend.gs    Apps Script backend (Daily_Log schema extended A–P)
```

---

## GA/PMA convention (NEW)

**Storage:** `ga` is a number in `WW.D` shorthand:
- `26.4` = 26 weeks + 4 days
- Integer part = weeks, first decimal digit = days (literal 0–6)
- `28.1` is **28+1**, not "28.1 weeks decimal"

**Display:** Always go through `D.fmtGA(ga)` → `"W+D"` string
**Math:** `D.gaTotalDays(ga)` for day math; `D.pmaShort(ga, dol)` for PMA
**Plotting (Fenton):** `D.gaToDecimalWeeks(ga)` for true decimal x-axis
**Input parsing:** `D.parseGAInput(str)` accepts `"28+4"`, `"28.4"`, `"28"`; clamps days 0–6

The HMF threshold `patient.ga < 32` still works because all valid values stay under integer 32.

---

## Restore production checklist

When ready to redeploy:

1. **`NeoFeed.html` line ~960** — uncomment the `NEOFEED_GAS_URL` line (production URL preserved as comment)
2. **`data.js`** — remove the test patient `TT-BW900-A` from `MOCK_PATIENTS` and `MOCK_DAILY_LOG` if you don't want it as a permanent fixture. (It's labelled `// Test fixture` in the file.)
3. **`gas-backend.gs`** — paste into Apps Script editor. Clear `Daily_Log` sheet (or add `ca, p, enVolPerKg` columns at positions K, L, M) — the script will re-write headers on next run.
4. **Restore LoginScreen** if desired — `app.jsx` line ~220: `if (false)` → `if (!user)`. Stub user fallback at line ~25 can stay or be removed.

---

## Known caveats

- **GAS Unauthorized** no longer redirects to login (shows error toast instead). Restore login behavior in `app.jsx` line ~145 if needed.
- **`enVolPerKg`** is logged on new submissions but legacy log entries (pre-session-8) lack this field — they default to PN targets.
- **Mobile Fenton chart** retains pan/zoom but the SVG width-760 layout works because of `width: 100%; height: auto`.

---

## Thai PDPA compliance posture

This app processes infant health data — "sensitive personal data" under PDPA
Sec 26. What's in place and what's still open:

**Lawful basis:** Sec 26(6) medical necessity + professional confidentiality
(documented at the top of `gas-backend.gs`). No separate consent flow —
consistent with the exemption, but only covers *treatment* processing, not
secondary uses (e.g. research/QI exports) if those are ever added.

**Data subject rights implemented:**
- *Erasure/pseudonymization* — `pseudonymizePatient()` in `gas-backend.gs`,
  admin-only, triggered via `action: "pseudonymizePatient"`. Clears name,
  initials, dob from Patient_Registry; retains de-identified clinical history
  (bw/ga/diagnosis/weights) for the hospital's own medical-record retention
  duty. **Residual risk:** `sessionId` is generated as
  `initials+BW+twinSuffix` (see `data.js`), so it's a pseudonym, not
  anonymous — staff present at admission can still reverse-map it on a small
  census. Erasure does not (and structurally cannot, without breaking every
  Daily_Log join) scrub that pattern from an already-issued sessionId.
- *Access/rectification* — no self-service path yet; handled manually via
  admin editing the registry. Worth a real endpoint if request volume grows.

**Accountability (Sec 39):** `Audit_Log` sheet (auto-created by
`getSheetAudit()`) records registry reads and erasures with actor email +
timestamp — persists past Apps Script's 7-day execution-log window.

**Data minimization:** `handleLogout()` in `app.jsx` clears
`neofeed_calc_*`/`neofeed_acked_*` localStorage keys on logout, since those
hold per-patient clinical inputs (weight, fluids, labs) and NICU workstations
are typically shared devices.

**Open items / not addressed here:**
- *Cross-border transfer (Sec 28):* data lives in Google Sheets/Apps Script —
  verify Google Workspace's DPA/SCC coverage is adequate for the org's data
  location requirements; not evaluated as part of this change.
- *Password hashing:* `hashPwd()` is single-round SHA-256 + per-user salt —
  fine against casual DB browsing but not iterated/memory-hard. Apps Script
  has no native bcrypt/Argon2; would need a manual PBKDF2 loop over
  `Utilities.computeHmacSha256Signature` if strengthened.
- *Retention policy:* no automatic purge after discharge — records persist
  indefinitely in the sheet today.
