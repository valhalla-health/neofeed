# NeoFeed — App Walkthrough

NeoFeed is a bedside nutrition-management tool for NICU (neonatal intensive
care) staff at KCMH. It replaces manual TPN/EN (total parenteral / enteral
nutrition) calculation sheets with a guided calculator, tracks each infant's
daily nutrition log, and plots growth against Fenton 2013 preterm growth
curves. There is no build step — it's plain React 18 + Babel loaded from a
CDN, deployed as static files, backed by a Google Apps Script + Google
Sheets "backend."

Read this before touching the code. For the latest session-by-session
change log and known caveats, see `HANDOFF.md`.

## 1. Run it

Open `NeoFeed.html` directly in a browser (or serve the folder statically —
no bundler, no `npm install`). `index.html` is an older/parallel copy; treat
`NeoFeed.html` as canonical unless told otherwise.

`NeoFeed.html` is the shell: it sets `window.NEOFEED_CLIENT_ID` and
`window.NEOFEED_GAS_URL` inline, then loads the CSS (embedded, oklch-based
design system) and pulls in each `.jsx` module in dependency order via
in-browser Babel:

```
data.js → tweaks-panel.jsx → icons.jsx → calculator.jsx → fenton.jsx
  → registry.jsx → log.jsx → app.jsx (mounts <App/>)
```

`window.NEOFEED_GAS_URL` points at the deployed Apps Script web app. If it's
commented out, the app falls back to mock data/local state instead of
hitting the live Google Sheet — check this first when data doesn't persist
across a refresh.

## 2. Architecture at a glance

| File | Role |
|---|---|
| `NeoFeed.html` | App shell + all CSS. Script loader, GAS URL config. |
| `manifest.json` | Web App Manifest (PWA installability) — name, icons, `display: standalone`. |
| `icons/` | Home-screen icons (`icon.svg` source + generated PNGs at 16/32/180/192/512, plus maskable 192/512 variants for Android's adaptive-icon safe zone). |
| `app.jsx` | Root `<App/>`: auth, nav rail/bottom-nav, view router, `PatientStrip`, `AlertCenter`, `AdminDashboard`, Thai date/GA formatting helpers, guidelines/formulas reference panels. |
| `data.js` | Pure clinical data + helpers — ESPGHAN/WHO nutrition targets, feed/formula database, `liveDol`, `fmtGA`/`parseGAInput`/`gaToDecimalWeeks`, mock patients/log for offline dev. |
| `calculator.jsx` | The TPN + EN calculator — a 6-step wizard producing one Daily_Log entry. |
| `log.jsx` | Daily nutrition log view + `TrendGraph` (per-metric trend chart with PN/EN target bands). |
| `fenton.jsx` | Fenton 2013 growth chart (weight/length/HC vs. PMA) + `MeasurementLogger`. |
| `registry.jsx` | Patient registry — desktop table / mobile card list, add/edit patient. |
| `icons.jsx` | Small inline SVG icon set used everywhere via `<Icon name=.../>`. |
| `tweaks-panel.jsx` | Dev-only UI customization panel (design tokens), not part of the clinical workflow. |
| `gas-backend.gs` | Google Apps Script backend: auth, CRUD over the Google Sheet, audit log, PDPA erasure endpoint. |

Everything is plain React function components + hooks, no Redux/Zustand —
state lives in `App` and is threaded down via props. There's no client
router; navigation is a `view` string in `App` state, rendered through a
big conditional block plus `RailItem`/`BottomNav`.

## 3. Data model

### Client-side identifiers
- **`sessionId`** — the patient's key everywhere in the client (`Patient_Registry`
  and `Daily_Log` both key off it). Generated as `initials + BW + twinSuffix`
  (see `data.js`) — it's a pseudonym, not an anonymous ID (see § 6).
- **`entryId`** — stable key for a single Daily_Log row, used by
  `updateDailyNutrition()` to match an existing entry for edit-in-place
  rather than always inserting.

### GA/PMA convention (important — read before touching any GA field)
`ga` is stored as a `WW.D` shorthand number, **not** decimal weeks:
- `26.4` means 26 weeks + 4 days (integer part = weeks, first decimal
  digit = days, clamped 0–6). `28.1` is "28+1", never "28.1 weeks".
- Always go through the helpers in `data.js`, never hand-roll GA math:
  - `D.fmtGA(ga)` → display string `"28+1"`
  - `D.gaTotalDays(ga)` → day arithmetic
  - `D.pmaShort(ga, dol)` → post-menstrual age display
  - `D.gaToDecimalWeeks(ga)` → true decimal weeks, only for Fenton's x-axis
  - `D.parseGAInput(str)` → accepts `"28+4"` or `"28.4"`, clamps days 0–6
- The `patient.ga < 32` HMF-eligibility check relies on this encoding
  staying under integer 32 for all valid values — don't "simplify" it to
  true decimal weeks without re-deriving that threshold.

### Dates
Dates are formatted through `fmtDate()` in `app.jsx` (exposed as
`window.NEOFEED_FMT_DATE`) into Thai Buddhist Era: `"2026-05-15"` →
`"15 พ.ค. 2569"`. DOL (day of life) is always computed live via
`liveDol(patient)` in `data.js` — never stored/cached, so it stays correct
across days without a refresh trigger. `D.dolAtDate(patient, dateStr)` is the
same math at an arbitrary date, used when a new log entry is back-dated (see
§5's Dashboard entry) — don't hand-roll this either.

### Daily_Log entry shape
Each submission from the Calculator produces one row combining PN + EN
totals per kg:
```
{ dol, weight, fluid, gir, pro, kcal, na, k, ca, p, enVolPerKg, route, status,
  submittedBy, calcInputJson, entryId, lastModified, lastModifiedBy }
```
`enVolPerKg` is the PN/EN target-picker switch: `log.jsx`'s `TrendGraph`
uses `ENTERAL_TARGETS` once `enVolPerKg >= 100`, otherwise `TPN_TARGETS(dol)`.
Legacy entries (pre "session 8") lack `enVolPerKg` and silently default to
PN targets. `calcInputJson` is the raw Calculator wizard state as JSON —
that's what lets an entry be reopened and edited exactly as entered, from
any device.

### Backend sheets (`gas-backend.gs`)
- **`Patient_Registry`** (A–P): `sessionId | name | initials | bw | ga | sex |
  dob | admissionDate | twinSuffix | status | currentBed | diagnosis |
  weights | lengths | hcs | bedHistory`
- **`Daily_Log`** (A–AB): `ts | sessionId | dol | weight | fluid | gir | pro |
  kcal | na | k | ca | p | enVolPerKg | route | status | submittedBy |
  supp* fields | calcInputJson | entryId | lastModified | lastModifiedBy`
- **`Staff`** (A–H): `email | role | name | active | password_hash | salt |
  must_change_password | temp_password` — the last two only ever hold a
  value for an account mid-provisioning (see §4); blank for every normal
  established account.
- **`Audit_Log`** (A–D): `ts | action | sessionId | actorEmail` — accountability
  trail since Apps Script's own execution log expires after 7 days.

If you change the Daily_Log column layout, either clear the sheet (the
script re-writes headers on next run) or add new columns in the exact
position the script expects — a mismatch silently misaligns every existing
row.

## 4. Auth

`SPREADSHEET_ID`/`CLIENT_ID` are no longer literals in `gas-backend.gs` —
they're read from Script Properties via `SPREADSHEET_ID_()`/`CLIENT_ID_()`
(`_cfg()`), set once by running `setConfig("<spreadsheetId>", "<clientId>")`
from the Apps Script editor. Keeps the Sheet's internal ID out of source/git
history. `CLIENT_ID` itself is still unavoidably public in
`NeoFeed.html`/`index.html`'s `window.NEOFEED_CLIENT_ID` (Google Identity
Services needs it client-side) — moving it server-side too is about a single
source of truth, not secrecy.

Hybrid, handled entirely in `gas-backend.gs`:
- **Gmail / Google Workspace accounts** → Google Sign-In ID token, verified
  server-side against Google's `tokeninfo` endpoint plus an `aud === CLIENT_ID`
  check (`verifyGoogleIdToken`) — signature and audience are actually
  validated, not just the payload decoded, since Apps Script has no native
  JWT/JWKS verification.
- **Any other email** → password, hashed with an iterated HMAC-SHA256 loop
  + per-user salt (`hashPwdV2`, `v2$`-prefixed stored hash), set via
  `setInitialPassword("email","pwd")` run once from the Apps Script editor.
  Legacy single-round-SHA-256 hashes (`hashPwdLegacy`) still verify and are
  transparently upgraded to v2 on next successful login.
- **New non-Gmail staff rows** don't need `setInitialPassword` run by hand:
  an `onEdit` simple trigger (`autoProvisionStaffPassword`) fires the moment
  a row is saved with an email but no `password_hash`, generates a random
  ~40-bit temp password (`_genTempPassword()`), and writes it to Staff col H
  (`temp_password`) for whoever added the row to relay to the new staff
  member, plus sets col G (`must_change_password`) so `login()` reports
  `mustChangePassword: true`. `app.jsx` gates on that right after the login
  screen with a non-dismissible `ChangePasswordModal` (no Cancel, backdrop
  click is inert, only escape hatch is logout) — the rest of the app,
  including the GAS patient sync, is blocked until a real password is set.
  A successful change clears cols G/H. Google/Workspace domains
  (`GOOGLE_WORKSPACE_DOMAINS`, currently just `chula.ac.th`) are excluded —
  `clearStaffPassword(email)` undoes it if one picks up a temp password
  anyway. **Don't reintroduce a single shared constant here** — an earlier
  same-day version of this trigger used one hardcoded password for every
  new account, which is a standing vulnerability in a no-build-step repo
  (every non-secret file is effectively public — see `SECURITY_CHECKLIST.md`),
  not just a weak default; see `HANDOFF.md`'s 2026-07-18 session for why it
  was replaced with the per-account random + forced-change flow above.

Both paths issue a `CacheService` session token with a 6h sliding TTL — the
hard max `CacheService.put()` allows (`app.jsx` handles the sliding-window
refresh and the logout endpoint). Each
token also embeds a per-user "epoch" (`getUserEpoch`/`bumpUserEpoch` in
`PropertiesService`); changing a password bumps the epoch, which invalidates
every other token issued for that user on their next request — the changing
device gets a freshly-rotated token in the `changePassword` response so it
stays logged in. Roles are `admin` / `doctor` / `nurse`; role gates what's in
the nav rail (`app.jsx` ~L409–423): Calculator is doctor/nurse only, Admin
dashboard is admin only.

String fields that get written into the Google Sheet from client-submitted
JSON (patient name/diagnosis/route/etc.) are passed through `_sheetSafe()`
first — it prefixes values starting with `=+-@` with an apostrophe so Sheets
can't interpret them as formulas (formula/CSV injection).

`LoginScreen` is gated on `GAS_ON` (`app.jsx` — true whenever
`window.NEOFEED_GAS_URL` is set), not a standalone bypass flag: real login is
required whenever a live backend is configured, and only local dev without a
`GAS_URL` falls back to the stubbed "Local user". (Older sessions described a
separate `if (false)` toggle here — verified during the 2026-07-13
cybersecurity review that this is no longer how the gate works; don't
reintroduce a bypass that's independent of `GAS_ON`.)

## 5. Main views (nav rail / bottom nav)

1. **Patients** (`registry.jsx`) — patient list. Desktop: table. Mobile:
   tappable cards (name+status, bed+GA/BW/DOL, diagnosis, weight+Δ,
   Edit/Open). Add/edit patient here (admit date, DOL at admit, GA, bed,
   diagnosis).
2. **Dashboard** (`log.jsx`) — the active patient's daily nutrition log +
   `TrendGraph`: pick a metric (Energy/Protein/GIR/Fluid/Na/K/Ca/P/Weight),
   see it plotted with a target band, smooth Catmull-Rom curve, hover
   crosshair/tooltip, X-axis toggle between admit-day and DOL. Past entries
   are editable in place (weight/length/HC corrections included). The
   "บันทึกวันนี้" button opens `LogDateModal` first — today, or a past
   calendar date to back-fill a missed day — before handing off to the
   Calculator with the right DOL/`ts`. Admin role only: a trash icon per row
   (rows with an `entryId`) permanently deletes a `Daily_Log` entry via the
   `deleteDailyNutrition` GAS action, audit-logged.
3. **Calculator** (`calculator.jsx`, doctor/nurse only) — 6-step TPN+EN
   wizard: Fluid plan → TPN macronutrients → Electrolytes → Vitamins/Trace
   Elements/Heparin → Enteral feeding → Enteral supplements. Only Step 1 is
   expanded by default. Full input state is persisted to
   `localStorage["neofeed_calc_<sessionId>"]` on submit/draft and restored
   on patient switch with a "Prefilled from previous submission (DOL X)"
   banner. Submitting writes one row to `Daily_Log`.
4. **Growth chart** (`fenton.jsx`) — Fenton 2013 percentile curves for
   weight/length/HC vs. PMA, plus `MeasurementLogger` to add new
   measurements. Uses `D.gaToDecimalWeeks` for the true decimal x-axis.
5. **Alerts** (`AlertCenter` in `app.jsx`) — flags things like stale weight
   (warn ≥3 days, critical ≥7 days since last entry). Acknowledge is
   per-alert and persisted.
6. **Admin dashboard** (`AdminDashboard`, admin only) — cross-patient view.
7. **Guidelines (ESPGHAN)** / **Formulas + products** (`GuidelinesPanel`,
   `FormulasPanel` in `app.jsx`) — static clinical reference content, no
   patient data.

## 6. Compliance posture (Thai PDPA) — know this before adding data flows

The app processes infant health data, which is "sensitive personal data"
under PDPA Sec 26. Current posture (see `HANDOFF.md` for the full writeup):

- **Lawful basis:** Sec 26(6) medical necessity + professional
  confidentiality, documented at the top of `gas-backend.gs`. This covers
  *treatment* processing only — a new secondary use (research/QI export)
  would need its own basis.
- **Erasure:** `pseudonymizePatient()` in `gas-backend.gs`, admin-only,
  clears name/initials/dob but retains de-identified clinical history for
  medical-record retention duty. Residual risk: `sessionId` is derived from
  initials+BW+twinSuffix, so it's a pseudonym staff can reverse-map on a
  small census — erasure can't scrub that pattern without breaking every
  Daily_Log join.
- **Audit trail:** `Audit_Log` sheet records registry reads + erasures with
  actor email + timestamp.
- **Data minimization:** `handleLogout()` clears `neofeed_calc_*` /
  `neofeed_acked_*` localStorage keys on logout (shared NICU workstations).
- **Open items:** cross-border transfer review (data lives in Google
  Workspace), password hashing is single-round SHA-256 (no PBKDF2/bcrypt —
  Apps Script has no native support), no automatic retention/purge policy.

If a task touches auth, patient identifiers, exports, or any new place
patient data leaves the Sheet, re-read this section and `HANDOFF.md`'s PDPA
notes — don't just add the feature.

## 7. Conventions worth preserving

- **No build tooling.** Don't introduce a bundler/npm dependency without
  discussing it — the whole point is a zero-install static deploy.
  `?v=<tag>` query strings on script tags are the cache-busting mechanism;
  bump them when you change a `.jsx`/`.js` file's content meaningfully.
- **GA math always goes through `data.js` helpers** (§3) — never
  reimplement `fmtGA`/`parseGAInput`/etc. inline.
- **DOL is always computed live** via `liveDol()`, never stored — if you
  see a stored `dol` field being trusted as current, that's a bug.
- **Dates render through `fmtDate()`** for Thai BE formatting — don't
  introduce a second date-formatting path.
- **Mobile-first.** Every recent session has shipped mobile fixes
  (overflow, tap targets, sticky bars, safe-area insets). Test narrow
  viewports before calling a UI change done — see `HANDOFF.md`'s session
  logs for the specific patterns already fixed (don't regress them).
- **`tweaks-panel.jsx`** is a dev/design tool, not user-facing clinical
  functionality — don't wire clinical logic through it.
- **PWA installability** depends on `manifest.json` + `<link rel="manifest">`
  + `<link rel="apple-touch-icon">` being present in **both** `NeoFeed.html`
  and `index.html` heads (same drift risk as the CSS note above — keep them
  identical). No service worker is registered on purpose: the app always
  talks to a live GAS backend and a cache-first SW risks serving stale
  patient data or a stale `.jsx?v=` bundle across the project's cache-busting
  convention. If offline support is ever wanted, scope a SW to network-only
  passthrough for anything hitting `NEOFEED_GAS_URL`.

## 8. Where to look next

- `HANDOFF.md` — session-by-session change log, current known caveats, and
  the "restore production checklist" (GAS URL, mock patient fixture,
  login screen) if you're picking this app back up after it's been in
  sandbox/demo mode.
- `git log --oneline` — most fixes are small, targeted, mobile-UX or
  data-correctness patches; skim recent commits for the current focus
  before starting new work.
