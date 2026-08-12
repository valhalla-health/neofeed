# NeoFeed — Technical Design Document

Generated 2026-08-08 following the *Vibe Coding 101* blueprint method
(`prompt02-TDD.md`). This document is the **structural blueprint** of the app as
it exists today — no implementation code, written so a clinician can
cross-reference it against the codebase without reading JavaScript.

> **The codebase is the source of truth.** When this document and the code
> disagree, the document is stale and gets corrected — never the reverse.
> §5 records every place existing documentation already disagreed with the code
> when this was written.

Companion documents: `app-walkthrough.md` (narrative orientation),
`HANDOFF.md` (session log + caveats), `SECURITY_CHECKLIST.md`.

---

## 1. Layer map

NeoFeed was not built with the 4 tiers named, so this is a **retro-fit map**:
which existing file and function belongs to which layer. Read this first — every
later section is organised by these layers.

| Layer | Owns | Frontend | Backend (`gas-backend.gs`) |
|---|---|---|---|
| **1 · Data Access** (Model) | Raw storage, retrieval, sanitisation | `data.js` reference tables · `localStorage` (`neofeed_calc_*`, `neofeed_acked_*`) · `sessionStorage.neofeed_session` | `getSheetPat/Log/Staff/Audit` · `getActivePatients` · `_buildLogRow` · `logDailyNutrition` · `updateDailyNutrition` · `deleteDailyNutrition` · `registerPatient` · `updateWeights` · `pseudonymizePatient` · `logAudit` · `_sheetSafe` · `_numSafe` · `_parseJson` · `_fmtDate` |
| **2 · Business Logic** (Service) | Clinical rules, auth rules, no UI | `data.js` → `TPN_TARGETS`, `ENTERAL_TARGETS`, `TARGETS`, `KCMH_STOCK`, `liveDol`, `dolAtDate`, GA helpers · `calculator.jsx` → `calc`, `mineral`, `alerts` · `log.jsx` → `pickTarget` · `app.jsx` → `computeAlerts`, `activeAlertCount` · `fenton.jsx` → percentile + `GrowthVelocity` math | `verifyGoogleIdToken` · `hashPwdV2` / `hashPwdLegacy` / `verifyPwd` / `safeEqual` · `_lockoutStatus` / `_recordFailure` / `_clearLockout` · `getUserEpoch` / `bumpUserEpoch` · `createSession` / `verifyToken` · `_genTempPassword` · `_usesGoogleSignIn` · the `canWrite` / `role === "admin"` gates |
| **3 · Presentation** (View) | Layout, input capture, rendering only | `NeoFeed.html` / `index.html` shells + CSS · `icons.jsx` · `tweaks-panel.jsx` · all components in `registry.jsx`, `log.jsx`, `fenton.jsx` · `calculator.jsx`'s `NumField`/`Chk`/`Meter`/`Tile`/`SaltRow`/`ElecRow`/`PresetChips`/`CaPRow`/`TwoCol`/`KcalBar`/`PrintOrderForm` · `app.jsx`'s `RailItem`/`PatientStrip`/`AlertCenter`/`LoginScreen`/`ChangePasswordModal`/`AdminDashboard`/`BottomNav`/`GuidelinesPanel`/`FormulasPanel`/`showToast` | — |
| **4 · Orchestration** (Controller) | Workflow, routing, coordination | `app.jsx` → `App()` (state, `view` router, `syncFromGAS`, `gasPost`, all `handle*` functions) | `doPost(e)` action router · `doGet(e)` |

**Layer-boundary violations that exist today** are listed in §5.2. The most
significant: the TPN/EN clinical calculation lives *inside* a Presentation-layer
React component.

---

## 2. System architecture overview — sequence diagrams

Read left to right: **User → Presentation → Orchestration → Business Logic → Data Access**.
`═══>` crosses the network (client → Apps Script).

### WF-1 · Login (email + password path)

```
USER            PRESENTATION            ORCHESTRATION           BUSINESS LOGIC          DATA ACCESS
 │                   │                       │                        │                      │
 │─ email+pwd ──────>│ LoginScreen           │                        │                      │
 │                   │  .handleSubmit()      │                        │                      │
 │                   │══ POST action:login ═════════>│ doPost()       │                      │
 │                   │                       │───────────────────────>│ _lockoutStatus()     │
 │                   │                       │                        │─────────────────────>│ ScriptProperties
 │                   │                       │<── locked? ────────────│                      │
 │                   │                       │─────────────────────────────────────────────>│ getStaffRow(email)
 │                   │                       │<── row[email,role,name,active,hash,salt,…] ──│ Staff sheet
 │                   │                       │───────────────────────>│ verifyPwd()          │
 │                   │                       │                        │  → hashPwdV2()       │
 │                   │                       │                        │  → safeEqual()       │
 │                   │                       │<── {ok, legacy} ───────│                      │
 │                   │                       │── if legacy: rehash ────────────────────────>│ Staff col E
 │                   │                       │───────────────────────>│ createSession()      │
 │                   │                       │                        │  → getUserEpoch() ──>│ ScriptProperties
 │                   │                       │                        │─────────────────────>│ CacheService (6h)
 │                   │<══ {token,role,name,mustChangePassword} ═══════│                      │
 │                   │─ onLogin(user) ──────>│ App.setUser()          │                      │
 │                   │                       │─────────────────────────────────────────────>│ sessionStorage
 │<── app shell ─────│<─ render ─────────────│ triggers WF-2          │                      │
```

*Google Sign-In path is identical from `doPost` onward, except the password
branch is replaced by `verifyGoogleIdToken()` (HTTPS call to Google's
`tokeninfo` + `aud === CLIENT_ID` check) and `mustChangePassword` is always
false.*

### WF-2 · Boot / registry sync

```
USER            PRESENTATION            ORCHESTRATION           BUSINESS LOGIC          DATA ACCESS
 │                   │                       │                        │                      │
 │                   │                       │ useEffect[user.email]  │                      │
 │                   │                       │  → syncFromGAS()       │                      │
 │                   │                       │─────────────────────────────────────────────>│ sessionStorage → token
 │                   │                       │══ POST getActivePatients ════>│ doPost()      │
 │                   │                       │                        │ verifyToken()        │
 │                   │                       │                        │─────────────────────>│ CacheService.get
 │                   │                       │                        │  epoch match? ──────>│ ScriptProperties
 │                   │                       │                        │─────────────────────>│ logAudit("readRegistry")
 │                   │                       │                        │                      │ → Audit_Log
 │                   │                       │─────────────────────────────────────────────>│ getActivePatients()
 │                   │                       │                        │                      │ → Patient_Registry
 │                   │                       │                        │                      │ → Daily_Log
 │                   │                       │<══ {patients[], log{}} ═══════════════════════│
 │                   │<─ setPatients/setLog ─│ syncState="ok"         │                      │
 │<── registry ──────│                       │                        │                      │
```

*Until `syncState !== "loading"` the whole UI is replaced by a spinner — this is
deliberate, so mock fixtures can never be mistaken for real patients.*

### WF-3 · Record a daily nutrition entry (primary clinical workflow)

```
USER            PRESENTATION            ORCHESTRATION           BUSINESS LOGIC          DATA ACCESS
 │                   │                       │                        │                      │
 │─ "บันทึกวันนี้" ──>│ DailyLog              │                        │                      │
 │                   │─ onAddToday ─────────>│ App                    │                      │
 │<─ date picker ────│ LogDateModal          │                        │                      │
 │─ today | back-date>│─ onConfirm(dateStr) ─>│──────────────────────>│ D.dolAtDate()        │
 │                   │                       │<── dol ────────────────│                      │
 │                   │                       │ setView("calc")        │                      │
 │                   │ Calculator mounts     │<──────────────────────│                      │
 │                   │───────────────────────────────────────────────────────────────────>│ localStorage
 │                   │<── prior wizard state (prefill banner) ───────────────────────────────│  neofeed_calc_<id>
 │─ 6-step wizard ──>│ NumField/Chk/SaltRow  │                        │                      │
 │   inputs          │  setState             │                        │                      │
 │                   │───────────────────────────────────────────────>│ calc = useMemo()     │
 │                   │                       │                        │  fluid, GIR, macros, │
 │                   │                       │                        │  electrolytes, osm,  │
 │                   │                       │                        │  Ca:P, overfill      │
 │                   │───────────────────────────────────────────────>│ mineral = useMemo()  │
 │                   │                       │                        │  Ca/PO₄ by source    │
 │                   │───────────────────────────────────────────────>│ alerts[]  vs         │
 │                   │                       │                        │  D.TARGETS / TPN_… ──>│ data.js
 │<─ Tiles, Meters ──│<── statuses ──────────────────────────────────│                      │
 │   live alerts     │                       │                        │                      │
 │─ submit ─────────>│─ onLog(entry) ───────>│ handleLogToGAS()       │                      │
 │                   │                       │ optimistic insert      │                      │
 │<─ row appears ────│<── tempId in state ───│                        │                      │
 │                   │                       │══ POST logDailyNutrition ════>│ doPost()      │
 │                   │                       │                        │ verifyToken()        │
 │                   │                       │                        │ canWrite? (RBAC)     │
 │                   │                       │                        │─────────────────────>│ _buildLogRow()
 │                   │                       │                        │                      │  _sheetSafe/_numSafe
 │                   │                       │                        │                      │ → Daily_Log append
 │                   │                       │<══ {entryId, lastModified} ═══════════════════│
 │                   │<─ reconcile() ────────│ tempId → real entryId  │                      │
 │                   │───────────────────────────────────────────────────────────────────>│ localStorage persist
```

### WF-4 · Edit an existing entry (optimistic concurrency)

```
USER            PRESENTATION            ORCHESTRATION           BUSINESS LOGIC          DATA ACCESS
 │                   │                       │                        │                      │
 │─ edit past row ──>│ DailyLog              │                        │                      │
 │                   │─ onEditEntry(entry) ─>│ setEditEntry + "calc"  │                      │
 │                   │ Calculator restores from entry.calcInputJson   │                      │
 │─ change values ──>│───────────────────────────────────────────────>│ calc / mineral /     │
 │<─ updated tiles ──│<──────────────────────────────────────────────│ alerts (same as WF-3)│
 │─ submit ─────────>│─ onUpdate(...) ──────>│ handleUpdateToGAS(     │                      │
 │                   │                       │   entryId,             │                      │
 │                   │                       │   expectedLastModified)│                      │
 │                   │                       │══ POST updateDailyNutrition ═>│ doPost()      │
 │                   │                       │                        │ verifyToken + canWrite│
 │                   │                       │                        │─────────────────────>│ find row by entryId
 │                   │                       │                        │ compare lastModified │
 │                   │                       │                        │  vs expected         │
 │                   │                       │  ── MISMATCH ──────────│                      │
 │                   │                       │<══ {conflict, current} ═══════════════════════│
 │<─ conflict prompt ─│<── ok:false,conflict ─│ (no generic error toast)                     │
 │                   │                       │  ── MATCH ─────────────│                      │
 │                   │                       │                        │─────────────────────>│ write row +
 │                   │                       │                        │                      │  lastModified/By
 │                   │                       │<══ {ok, lastModified} ════════════════════════│
 │<─ row updated ────│<─ apply() ────────────│                        │                      │
```

### WF-5 · PDPA erasure (pseudonymise a patient)

```
USER            PRESENTATION            ORCHESTRATION           BUSINESS LOGIC          DATA ACCESS
 │                   │                       │                        │                      │
 │  ⚠ NO UI ENTRY POINT EXISTS — see §5.1 finding RC-3                │                      │
 │  (admin must invoke from the Apps Script editor or POST by hand)   │                      │
 │                   │                       │══ POST pseudonymizePatient ══>│ doPost()      │
 │                   │                       │                        │ verifyToken()        │
 │                   │                       │                        │ role === "admin"     │
 │                   │                       │                        │─────────────────────>│ pseudonymizePatient()
 │                   │                       │                        │                      │  name → "[PDPA-erased …]"
 │                   │                       │                        │                      │  initials → ""
 │                   │                       │                        │                      │  dob → ""
 │                   │                       │                        │                      │ logAudit("pseudonymize")
 │                   │                       │<══ {ok} ══════════════════════════════════════│
```

*Clinical history in `Daily_Log` is deliberately retained (medical-record
retention duty). `sessionId` is derived from initials + BW + twin suffix and is
**not** scrubbed — it stays reverse-mappable on a small census.*

---

## 3. Method specification

Plain-language Input → Process → Output tables, grouped by layer. Scope note:
this covers every function that carries clinical, security or workflow meaning.
Pure-presentational leaf components (`Tile`, `Meter`, `TweakSlider`, …) are
listed by name in §1 but not tabulated — they take props and draw them.

### 3.1 Data Access Layer

**`data.js` — clinical reference tables** *(constants, no methods)*

| Table | What it holds |
|---|---|
| `EN_DB` | Enteral feed/formula database — composition per 100 mL |
| `AA_PRODUCTS`, `LIPID_PRODUCTS` | Amino-acid and lipid emulsion products |
| `SALT_SOURCES`, `ADDITIVE_PRODUCTS` | Electrolyte salts and vitamin/trace additives with strengths |
| `KCMH_STOCK` | The KCMH pharmacy's actual stock concentrations and divisors |
| `MAX_DEXTROSE_G_KG`, `MAX_K_MEQ_PER_L` | Hard compounding ceilings |

**`gas-backend.gs` — sheet access**

| Method | Inputs | Process | Outputs |
|---|---|---|---|
| `getSheetPat` / `getSheetLog` / `getSheetStaff` / `getSheetAudit` | — | Opens the spreadsheet by ID; creates the sheet with its header row if missing | Sheet handle |
| `getStaffRow` | email | Scans the Staff sheet for a matching email | `{row, data[]}` or null |
| `getActivePatients` | — | Reads Patient_Registry and Daily_Log in full, filters to active patients, groups log rows by `sessionId` | `{patients[], log{}}` |
| `_buildLogRow` | sessionId, entry, submittedBy | Maps an entry object onto the Daily_Log column order, passing text through `_sheetSafe` and numbers through `_numSafe` | Array in column order |
| `logDailyNutrition` | sessionId, entry, submittedBy | Generates an `entryId`, appends one row | `{entryId, lastModified}` |
| `updateDailyNutrition` | sessionId, entryId, expectedLastModified, entry, editedBy | Finds the row by `entryId`; if its `lastModified` ≠ expected, refuses; otherwise overwrites and re-stamps | `{lastModified}` \| `{conflict, current}` \| `{error}` |
| `deleteDailyNutrition` | sessionId, entryId | Deletes the matching row permanently | `{ok}` \| `{error}` |
| `registerPatient` | patient object | Inserts a new registry row, or overwrites the existing row with the same `sessionId` | — |
| `updateWeights` | sessionId, weights | Overwrites the serialised weights column | — |
| `pseudonymizePatient` | sessionId, adminEmail | Blanks name/initials/dob, writes an erasure note, audit-logs it | — |
| `logAudit` | action, sessionId, actorEmail | Appends a timestamped row to Audit_Log; swallows its own failures | — |
| `_sheetSafe` | any value | Prefixes `'` if the value starts with `= + - @` tab or CR — defuses formula injection | Safe string |
| `_numSafe` | value, default | Coerces via `Number()`; anything non-finite becomes the default | Number or default |

**Browser storage**

| Key | Written by | Holds | Cleared |
|---|---|---|---|
| `localStorage["neofeed_calc_<sessionId>"]` | Calculator submit/draft | Full wizard input state | On logout |
| `localStorage["neofeed_acked_<sessionId>"]` | AlertCenter acknowledge | Acknowledged alert keys | On logout |
| `sessionStorage["neofeed_session"]` | App on login / token rotation | `{email, name, role, token, …}` | On logout, tab close, or 401 |

### 3.2 Business Logic Layer

**Clinical targets and age math — `data.js`**

| Method | Inputs | Process | Outputs |
|---|---|---|---|
| `TPN_TARGETS.*` | `dol` (day of life) | ESPGHAN 2018 parenteral targets ramped by day of life | `[min, max]` per nutrient |
| `ENTERAL_TARGETS.*` | — | ESPGHAN 2022 enteral targets (fixed, not day-ramped) | `[min, max]` |
| `TARGETS.*` | `dol`, sometimes weight / `isEnteral` | Unified accessor the UI reads; picks the right regime per nutrient | `[min, max]` |
| `liveDol` | patient | Days between admission/DOB and *today*, computed fresh every call — never stored | Integer day of life |
| `dolAtDate` | patient, dateStr | Same arithmetic at an arbitrary date — used when back-filling a missed day | Integer day of life |
| `fmtGA` | `ga` as `WW.D` | Renders gestational age for display | `"28+1"` |
| `parseGAInput` | `"28+4"` or `"28.4"` | Parses either form, clamps days to 0–6 | `ga` as `WW.D` |
| `gaTotalDays` | `ga` | Converts `WW.D` to total days for arithmetic | Integer days |
| `gaToDecimalWeeks` | `ga` | True decimal weeks — **only** for Fenton's x-axis | Decimal weeks |
| `pmaShort` | `ga`, `dol` | Post-menstrual age for display | `"32+2"` |

> **GA encoding trap.** `ga` is `WW.D` shorthand, not decimal weeks: `26.4` is
> 26 weeks + 4 days. The `patient.ga < 32` HMF-eligibility test depends on this
> encoding. Never hand-roll GA arithmetic.

**The TPN/EN calculation — `calculator.jsx`** *(currently inside the `Calculator` component; see §5.2 LV-1)*

| Method | Inputs | Process | Outputs |
|---|---|---|---|
| `calc` (memo) | Full wizard state + weight, dol, route | Derives the whole prescription: total fluid, dextrose g/kg/d and GIR, amino acid and lipid g/kg/d, kcal and NPE:AA ratio, Na/K/Ca/P/Mg per kg, Ca:P mass ratio, osmolarity, bag component volumes, WFI q.s., overfill factor and delivered fraction | One object of derived clinical values, consumed by the tiles, the alerts and the Daily_Log row |
| `mineral` (memo) | `calc` + oral supplement inputs | Breaks Ca and PO₄ down by source (TPN / EN / oral) and totals them. `mineral.ivCaP` is defined to equal `calc.caP` so the two cannot drift | Mineral memo object |
| `alerts` (array) | `calc`, `mineral`, `D.TARGETS` | Threshold comparisons producing info / warn / crit flags: GIR out of range, NPE:AA off target, Ca:P off target, osmolarity above peripheral limit, dextrose above the KCMH maximum, K⁺ concentration above the bag maximum, bag not compoundable (negative WFI), vitamins/trace not overfill-scaled | Ordered alert list with level, title, body and reference |

> **Ca/PO₄ split.** `calc.caKg` / `calc.pKg` — and therefore the `ca` / `p`
> columns in every Daily_Log row — count **TPN + EN only**. Oral supplement
> appears only in the separate `mineral` memo. Merging them would retroactively
> change the meaning of every historical row and every TrendGraph target band.

**Other clinical logic**

| Method | File | Inputs | Process | Outputs |
|---|---|---|---|---|
| `pickTarget` | `log.jsx` | metric key, entry, patient | Chooses the enteral band when `enVolPerKg ≥ 100`, otherwise the parenteral band for that DOL. Legacy entries lacking `enVolPerKg` fall back to parenteral | `[min, max]` or null |
| `computeAlerts` | `app.jsx` | patient, entries | Stale-weight detection (warn ≥3 days, critical ≥7 days since the last weight) plus weight-trend checks | Alert list |
| `activeAlertCount` | `app.jsx` | patient, entries | Counts alerts not acknowledged in `neofeed_acked_*` | Integer badge count |
| percentile math | `fenton.jsx` | measurement, PMA, sex | Positions weight/length/HC against Fenton curves | Plot coordinates + percentile |
| `GrowthVelocity` | `fenton.jsx` | measurement points, metric | g/kg/day for weight, cm/week for length and HC | Velocity + label |

**Authentication and authorisation — `gas-backend.gs`**

| Method | Inputs | Process | Outputs |
|---|---|---|---|
| `verifyGoogleIdToken` | Google ID token | Calls Google's `tokeninfo` endpoint (real signature validation, not a payload decode) and checks `aud === CLIENT_ID` | `{email}` or `{email: null, reason}` |
| `hashPwdV2` | password, salt | 3 000 iterations of HMAC-SHA256 — the closest PBKDF2 equivalent Apps Script offers | `"v2$<hex>"` |
| `hashPwdLegacy` | password, salt | Single-round SHA-256. **Verification only** — every successful legacy login rehashes to v2 | Hex string |
| `verifyPwd` | password, salt, storedHash | Dispatches on the `v2$` prefix, compares with `safeEqual` | `{ok, legacy}` |
| `safeEqual` | two strings | Constant-time comparison — a plain `!==` leaks timing proportional to matching leading characters | Boolean |
| `_lockoutStatus` / `_recordFailure` / `_clearLockout` | lockout key | 5 failures locks for 15 minutes; the counter self-clears once the cooldown elapses. Applied to **both** login and `changePassword`'s old-password check | `{fails, locked}` |
| `getUserEpoch` / `bumpUserEpoch` | email | Per-user counter in ScriptProperties, embedded in every token. Bumping it invalidates every other outstanding token for that user | Epoch string |
| `createSession` | email, role, name | UUID token → CacheService with `{email, role, name, epoch}`, 6 h TTL (CacheService's hard cap) | Token string |
| `verifyToken` | token | Cache lookup, epoch match, then a sliding-window TTL refresh on every use | `{email, role, name}` or null |
| `_genTempPassword` | — | ~40 bits of randomness — **per account**, never a shared constant | Password string |
| `onEdit` (`autoProvisionStaffPassword`) | edit event | When a Staff row is saved with an email but no hash, generates a temp password into col H and sets `must_change_password` in col G. Excludes Google Workspace domains | — |

**RBAC** — enforced in `doPost`: `canWrite` = doctor \| admin \| nurse for
`logDailyNutrition`, `updateDailyNutrition`, `registerPatient`, `updateWeights`.
`role === "admin"` alone for `deleteDailyNutrition` and `pseudonymizePatient`.
The nav rail applies the matching client-side gate (Calculator: doctor/nurse;
Admin dashboard: admin) — presentation only, the server gate is authoritative.

### 3.3 Orchestration Layer

**`App()` — `app.jsx`**

| Method | Inputs | Process | Outputs |
|---|---|---|---|
| `syncFromGAS` | — | Reads the token from **sessionStorage** (not React state — the callback has no deps and cannot close over `user`), fetches the registry and log, replaces mock fixtures, handles 401 by forcing re-login | Sets `patients`, `log`, `syncState`, `lastSync` |
| `gasPost` | payload | Shared authenticated write transport, token from **React state**. Handles three failure modes: 401 → clear session and re-login; `conflict` → returned to the caller without a toast; other errors → error toast | `{ok, …}` \| `{ok:false, conflict, current}` |
| `handleLogToGAS` | entry | Optimistic insert under a temporary id, POSTs, then reconciles the temp id with the server's real `entryId` | Promise `{ok, entryId, lastModified}` |
| `handleUpdateToGAS` | entryId, expectedLastModified, entry | Sends the edit with its concurrency stamp; applies the server's new stamp on success | Promise |
| `handleDeleteEntry` | entry | Admin-only delete, then removes the row from local state | Promise |
| `handleAddPatient` / `handleEditPatient` | patient | Registry upsert, then local state update | — |
| `handleDeletePatient` | patient | Admin-only, **local state only** — no `gasPost` call, Patient_Registry/Daily_Log untouched. Clears `activeId`/routes to Patients if the removed patient was active | — |
| `handleWeightUpdate` | sessionId, weights | Persists the weight series from the growth chart | — |
| `handleLogout` | — | Revokes the token server-side, then clears `neofeed_calc_*` / `neofeed_acked_*` / session storage — data minimisation on shared NICU workstations | — |
| view router | `view` state | A conditional block rendering Patients / Dashboard / Calculator / Growth / Alerts / Admin / Guidelines / Formulas. No client-side router library | Rendered view |

**Render gates, in order** — each one blocks everything below it:
1. `!user` → `LoginScreen` (gated on `GAS_ON`, not a standalone bypass flag)
2. `user.mustChangePassword` → non-dismissible `ChangePasswordModal`
3. `GAS_ON && syncState === "loading"` → full-screen spinner
4. otherwise → the app shell

**`doPost(e)` — `gas-backend.gs`**

| Step | Process |
|---|---|
| 1 | Parse the JSON body, read `action` |
| 2 | `logout` and `login` are handled **before** the token gate |
| 3 | Everything else: `verifyToken(body.token)` → `{error:"Unauthorized"}` if invalid |
| 4 | Per-action RBAC gate (`canWrite` or `role === "admin"`) |
| 5 | Dispatch to the Data Access function, wrap the result in `jsonOut` |
| 6 | Any thrown error returns `{error: message}` |

Actions: `login`, `logout`, `getActivePatients`, `logDailyNutrition`,
`updateDailyNutrition`, `deleteDailyNutrition`, `registerPatient` /
`updatePatient`, `updateWeights`, `changePassword`, `pseudonymizePatient`.
(No `deletePatient` action — see §3.3's `handleDeletePatient` row: removing
a session from the app is deliberately local-only, nothing to dispatch here.)
`doGet` serves only `ping`.

### 3.4 Presentation Layer

| Component | File | Inputs (props) | Renders |
|---|---|---|---|
| `LoginScreen` | app.jsx | onLogin | Google Sign-In button + email/password form |
| `ChangePasswordModal` | app.jsx | onSave, forced, onLogout | Password change; when `forced`, no cancel and an inert backdrop |
| `PatientStrip` | app.jsx | patient, liveWeight, currentDol, onSwitch, onEdit | Sticky active-patient header |
| `AlertCenter` | app.jsx | patient, log, onAckChange | Alert list with per-alert acknowledge |
| `AdminDashboard` | app.jsx | patients, log | Cross-patient admin view |
| `RailItem` / `BottomNav` | app.jsx | view, counts, role | Role-gated navigation |
| `GuidelinesPanel` / `FormulasPanel` | app.jsx | — | Static reference content, no patient data |
| `PatientRegistry` | registry.jsx | patients, activeId, log, onSelect/onAdd/onEdit | Desktop table / mobile cards; auto-hides discharged patients 7 days after `statusDate` |
| `NewPatientModal` / `EditPatientModal` / `TransferBedModal` / `PatientPicker` | registry.jsx | patient, onSubmit, onClose | Registry forms. `EditPatientModal` stamps `statusDate` when status leaves Active |
| `Calculator` | calculator.jsx | patient, dol, editEntry, logDate, onLog/onUpdate/onSaved/onWeightChange | The 6-step wizard, tiles, alerts, order form |
| `PrintOrderForm` | calculator.jsx | the full prescription | Printable compounding order |
| `DailyLog` | log.jsx | patient, log, dol, onAddToday/onEditEntry/onDeleteEntry | Entry table; trash icon admin-only |
| `TrendGraph` | log.jsx | entries, patient | Metric picker, target band, Catmull-Rom curve, hover crosshair, DOL/admit-day x-axis toggle |
| `LogDateModal` | log.jsx | patient, dol, onConfirm | Today-or-back-date picker |
| `FentonChart` / `MeasurementLogger` / `GrowthVelocity` | fenton.jsx | patient, currentDol, onUpdate | Fenton percentile curves + measurement entry |
| `Icon` | icons.jsx | name, size, color, stroke | Inline SVG |
| `TweaksPanel` + `Tweak*` | tweaks-panel.jsx | — | **Dev/design tool only** — never wire clinical logic through it |

> `TwoCol` and `PresetChips` are defined at **module level** in
> `calculator.jsx`, not inside `Calculator`. Moving them inside re-creates the
> component identity on every render and loses input focus on every keystroke.
> This is regression-tested by history, not by code — do not "tidy" it.

---

## 4. Test coverage against the 3-tier standard

| Tier | Required | Present today |
|---|---|---|
| **Unit** | Components, data cleaning, scoring logic | ⚠ Partial — `test/verify-kcmh-constants.cjs` checks every `KCMH_STOCK` strength against the KCMH pharmacy worksheet's divisors and reproduces two starter recipes. No unit coverage of `TARGETS`, GA helpers, `liveDol`/`dolAtDate`, `pickTarget`, `computeAlerts`, or the alert thresholds |
| **E2E** | A journey proving the layers interact | ✅ `test/verify-kcmh-factor.cjs` transpiles the real `.jsx`, mounts `<Calculator>` in jsdom, drives the actual inputs and reads results back out of the rendered order form — comparing against an independent transcription of the worksheet's formula chain. Asserts dose-per-kg fidelity, osmolarity/GIR invariance under overfill, and the deliberate non-scaling of Soluvit/Peditrace. No E2E for login, sync, edit-conflict, or erasure |
| **Performance** | A timed benchmark | ❌ None |

Run them from the repo root (dev dependencies are installed to a scratch folder,
never committed — the app itself still has no build step):

```bash
node test/verify-kcmh-constants.cjs && DEAD=20 node test/verify-kcmh-factor.cjs && DEAD=0 node test/verify-kcmh-factor.cjs
```

There is no `RUN_TEST_SUITE` switch, and for this app there should not be — the
lecture's single-file switch exists for a Colab script. Separate Node harnesses
are the correct shape here.

---

## 5. Reality check

Step 2 of the feedback loop: this document was checked **against the code**, not
against the existing documentation. These are the disagreements found.

### 5.1 Documentation that contradicts the code

| # | Claim | Where | Reality |
|---|---|---|---|
| **RC-1** | "password hashing is single-round SHA-256 (no PBKDF2/bcrypt)" | `app-walkthrough.md` §6 open items | **Stale.** `hashPwdV2` (`gas-backend.gs:143`) is 3 000 iterations of HMAC-SHA256 with a per-user salt. Single-round SHA-256 survives only as `hashPwdLegacy`, for verifying old hashes, and every successful legacy login rehashes to v2 in place. §4 of the same document describes this correctly — the two sections contradict each other |
| **RC-2** | "LOGIN BROKEN IN PRODUCTION" | `HANDOFF.md` top banner | Already flagged stale in `CLAUDE.md`; login has worked since deployment `@41`. The banner is still there |
| **RC-3** | "Erasure: `pseudonymizePatient()`, admin-only" reads as a shipped capability | `app-walkthrough.md` §6 | The backend action exists and is RBAC-gated, but **no client entry point exists** — no `.jsx` or `.html` file references `pseudonymize`. A PDPA erasure request today requires an admin to run it from the Apps Script editor. Working as documented only if "admin-only" is read as "developer-only" |
| **RC-4** | Fenton chart labelled "Fenton 2025" citing PMID 40534585 | `fenton.jsx` | Never clinically verified against the actual 2025 revision versus a carried-forward 2013 dataset. Already flagged in `CLAUDE.md`; unresolved |

### 5.2 Layer-boundary violations

| # | Violation | Consequence |
|---|---|---|
| **LV-1** | The entire TPN/EN clinical calculation (`calc`, `mineral`, `alerts`) lives inside the `Calculator` React component — Business Logic inside a Presentation file | The clinical rules cannot be unit-tested without mounting React in jsdom, which is exactly why `verify-kcmh-factor.cjs` has to transpile JSX and drive a virtual DOM to check arithmetic. Any future non-Calculator consumer of these rules (a report, a bedside summary, a second calculator) must duplicate them |
| **LV-2** | `data.js` mixes Data Access (product/stock tables) with Business Logic (`TARGETS`, GA math, `liveDol`) | Minor. Both are pure and side-effect-free, so the practical risk is low — worth splitting only if `data.js` grows further |
| **LV-3** | Two token sources: `syncFromGAS` reads `sessionStorage`, `gasPost` reads React state | Currently correct — both change-password paths write the rotated token to *both* stores (`app.jsx:390`, `app.jsx:611`). But the invariant is undocumented and enforced by nothing. Any future token-mutating path that updates only one store desynchronises the two |
| **LV-4** | `NeoFeed.html` and `index.html` are hand-synced duplicates | Not a layer violation but the same class of defect: one Presentation-layer source of truth split into two files that drift silently. Already the app's most repeated bug class |

### 5.3 Structural observations

- **No client router.** Navigation is a `view` string through a conditional
  block. Fine at the current size; the cost is that no view has a URL, so
  nothing is linkable or restorable after a refresh.
- **All state lives in `App`** and is threaded down as props. `app.jsx` is
  1 740 lines and holds Orchestration *and* eleven Presentation components.
- **`getActivePatients` reads both sheets in full on every sync** — the whole
  Daily_Log, not a windowed range. Cost grows linearly with total historical
  entries, not with active census.

---

## 6. What this document does not cover

- CSS and the design-token system (see the shells and `tweaks-panel.jsx`)
- The full ESPGHAN reference content in `GuidelinesPanel` / `FormulasPanel`
- Deployment and `clasp` mechanics (see `CLAUDE.md`)
- PDPA legal posture and the security checklist (see `SECURITY_CHECKLIST.md`
  and `HANDOFF.md`)
