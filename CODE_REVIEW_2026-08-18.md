# NeoFeed — code review, 2026-08-18

Full read of `app.jsx`, `data.js`, `calculator.jsx`, `log.jsx`, `registry.jsx`,
`fenton.jsx`, `gas-backend.gs` and both HTML shells, against the conventions in
`app-walkthrough.md` and the caveats in `HANDOFF.md`.

Starting state: all eight existing harnesses pass (`test/`), and
`NeoFeed.html` / `index.html` are byte-identical — no CSS/config drift this time.

Six defects are **fixed** in this change, each pinned by a new harness
(`test/verify-resync-and-lists.cjs` — 15 assertions, 11 of which fail against
the pre-fix source, which is how the harness was validated). Nine more are
**reported only**: they are backend changes needing a `clasp` deploy, or
clinical decisions that aren't mine to make.

---

## Fixed

### 1. A background re-sync tore the whole app down mid-entry · `app.jsx` · **highest impact**

`App` gated its entire tree on `syncState === "loading"`:

```js
if (GAS_ON && syncState === "loading") return <FullScreenSpinner/>;
```

The comment says "until the **first** GAS sync completes", and that was true when
the app fetched once at login. It no longer does: `syncFromGAS` also runs on tab
focus (throttled to 60s) and on day rollover, and both set `syncState` to
`"loading"` — so **every** background refresh replaced the workspace with the
first-load spinner and unmounted everything under it.

At the bedside that means: glance at another app, come back a minute later, and
the half-finished Calculator is gone. `localStorage` only holds the last
*submitted* state, so every field typed since then resets to its prefill — and
because the wizard's weight field re-prefills from the patient record, the
number silently changes rather than blanking, which is worse. An open modal or
patient picker closes, and the accordion collapses, for the same reason.

Reproduced end-to-end in jsdom against the real `<App/>`: type `1234` into the
Calculator's weight field, fire a `focus` event 61s later, and the field comes
back as `900`.

Fixed by gating on `!lastSync` as well — only the genuine first load blocks.
Later refreshes stay in the background, where the topbar's own "Syncing…" pill
already reports them.

### 2. Registry desktop table reported growing infants as −100% of birth weight · `registry.jsx`

The mobile card reads current weight through `D.lastWeighed(p)`; the desktop
table read `p.weights[p.weights.length - 1]` directly. `MeasurementLogger`
deliberately stores a length/HC-only measurement with `w: null` so it doesn't
fabricate a weight for that day — which is exactly the case `lastWeighed` exists
for. Taking the last element blind picks that row up, so:

| | Wt now | Δ birth |
|---|---|---|
| mobile card | 1,100 g | +200 g (22.2%) |
| desktop table | — g | **−900 g (−100.0%)**, in critical red |

Same patient, same data, on the two halves of one screen. A ward list that says
a baby has lost 100% of its birth weight is the kind of thing someone acts on.

Fixed: both layouts now go through `lastWeighed`, and a patient with no weighed
measurement at all renders an honest "—" rather than a fabricated `0`/`−bw`.

### 3. `PatientStrip` could crash the whole app · `app.jsx`

`D_A.lastWeighed(patient) || patient.weights[patient.weights.length - 1]` then
`last.w`. For a patient with only length/HC measurements — or a registry row
whose `weights` cell holds literal `null` (`_parseJson` returns it as-is;
the fallback only fires on blank/unparseable) — `last` is `undefined` and `.w`
throws. `PatientStrip` renders above every non-registry view and there is no
error boundary anywhere, so that is a white screen for the whole app, not a
broken card. Now falls back to birth weight.

### 4. Alert targets were indexed by a stale DOL · `app.jsx` (`computeAlerts`)

`app-walkthrough.md` §3: *"Anything displaying an entry's DOL — or feeding it
into a DOL-indexed target — must go through `D.entryDol`."* `log.jsx`'s
`pickTarget` and table both do. `computeAlerts` did not — it fed `last.dol`, the
stored snapshot, straight into `TPN_TARGETS.protein(dol)` / `.kcal(dol)`.

On a row that froze `dol: 1` into itself (saved before the patient had an
admission date — the exact case `entryDol` was added for), the DOL-1 bands apply
forever: protein floor 1.5 instead of 2.5 g/kg/d, energy floor 45 instead of 90
kcal/kg/d. A genuinely under-fed infant reads as on target and **no alert
fires**. The `dol > 2` / `dol > 4` suppressions on the protein and energy alerts
were reading the same stale value, so they suppressed indefinitely too.

Fixed; the alert's `dol` (which is half the acknowledge key) now carries the
re-derived value as well, so an ack is filed under the day it actually belongs
to. Existing acks on affected patients will resurface once, then settle.

### 5. Admin dashboard's "Recent log entries" weren't recent · `app.jsx`

`patients.flatMap(...).slice(-20).reverse()` — `flatMap` groups by patient, so
the slice returned *the last patients in registry order*, not the last entries by
date. A unit with more than ~20 rows could show week-old entries under "Recent"
while omitting everything logged today. Now sorted by `ts` before slicing, and
the DOL column goes through `entryDol` like everywhere else.

### 6. Admin "Active sessions" disagreed with the registry's own count · `app.jsx`

`patients.filter(p => p.status === "Active")` vs the registry's
`isActivePatient` (`!p.status || p.status === "Active"`). A blank status —
which the backend defaults but a locally-added patient or a hand-typed sheet row
can have — counted as active in the list and inactive in the tile. This is the
same drift `isActivePatient` was introduced to end; the admin tile just never
got the memo. Now uses the same test.

### 7. Archived registry rows were one column wide · `registry.jsx`

`<td colSpan={4} />` where three columns (DOL, Wt now, Δ birth) are being
skipped — 12 cells against an 11-column `<thead>`, so every archived row's
status chip and action button sat under the wrong heading.

---

## Reported, not changed

### Backend (`gas-backend.gs`) — each needs a `clasp push` + redeploy

**B1. `mustChangePassword` is enforced only in the client.** `login()` issues a
fully-privileged token to an account still on its auto-provisioned temp
password, and `doPost` never checks `user.mustChangePassword` on any action.
`app.jsx` blocks the UI, but anyone holding a relayed temp password can call the
API directly — read the whole registry, write log entries — without ever setting
a real password. The documented intent ("the rest of the app, including the GAS
patient sync, is blocked until a real password is set") is not what the server
does. A three-line gate in `doPost` (allow only `logout`/`changePassword` while
the flag is set) would close it.

**B2. No server-side one-entry-per-date guard.** The duplicate-date rule lives
entirely in `app.jsx`'s `startAddToday`. `logDailyNutrition` takes no lock and
does no lookup, so two devices opening the same patient+date both append. The
`acquireLogLock` courtesy banner is explicitly not protection, and
`expectedLastModified` only guards *edits* to a row that already exists — it
cannot see a second `appendRow`. Two rows for one calendar date then feed
`hasLogOnDate`, `TrendGraph` and every "latest entry" read.

**B3. `registerPatient` upserts on a colliding pseudonym.** `sessionId` is
`initials + BW + twinSuffix`. Two infants with the same two-letter initials and
the same birth weight in grams, neither a multiple, produce the same id — and
`registerPatient` is an upsert, so registering the second **silently overwrites
the first's registry row** and both then share one `Daily_Log` stream. There is
no duplicate check on either side. Cheapest mitigation is client-side: warn in
`NewPatientModal` when `patients.some(p => p.sessionId === sessionId)`.

**B4. `updateWeights` fails silently and takes no lock.** No match for the
`sessionId` → returns normally, `doPost` replies `{ok: true}`, and the Fenton
measurement the nurse just entered is gone at the next sync with no error shown.
It is also the one sheet writer without a `LockService` lock, so it races
`registerPatient` (which rewrites the same `weights` column from client state).

**B5. `Audit_Log` now grows with every re-sync.** `getActivePatients` appends a
`readRegistry` row per call. That was once per login; since the focus/rollover
refetch it is up to once per user per minute per open tab — an `appendRow` on
the request path, and a sheet that will need its own retention plan.

**B6. `_buildLogRow`'s date fallback is UTC.** `entry.ts || new
Date().toISOString().slice(0,10)` is the exact `toISOString` pattern the client
was fixed to stop using: before 07:00 ICT it is yesterday. The client always
sends `ts`, so this is latent rather than live — but it is the one remaining
copy of the bug.

**B7. `_fmtDate` formats in `Session.getScriptTimeZone()`** while the client
pins `Asia/Bangkok`. If the script's timezone is ever not Bangkok, every date
read back shifts, and the "logged today" machinery goes with it.

### Client — clinical judgement, not mine to change

**C1. `TARGETS.fluid(dol, wtG)` is documented as taking birth weight** ("Fluid
mL/kg/day by DOL and **birth weight** (grams)", 4-tier ELBW/VLBW/preterm/term)
but every call site passes **current** weight — `calculator.jsx`'s `tFluid`, the
wizard's prefill, and `log.jsx`'s `pickTarget`. An ELBW infant growing past
1000 g therefore drops out of the ELBW tier into the VLBW one (e.g. DOL 3:
120–140 → 110–130 mL/kg/d) even though the insensible-water-loss physiology the
tiers encode is a function of how it was born, not what it weighs today. Either
reading is defensible; what isn't is the doc and the code disagreeing. Worth a
decision, then make all three call sites match it.

**C2. `SaltRow` accepts negative doses.** `NumField` deliberately excludes `-`
from its charset ("none are legitimately negative"); `SaltRow` — the input used
for every electrolyte in Step 4 — allows it and applies no `min`. A negative
`naCl` yields a negative stock volume on the printed pharmacy order. Nothing
guards it downstream.

---

## Checked and found correct

Worth recording so the next review doesn't re-derive it:

- **The Factor / overfill chain** (`calculator.jsx`'s `calc`) — delivered vs.
  prepared volume, `aaG_bag` vs `aaG`, `dexG_bag` vs `dexG`, per-kg doses coming
  back out unchanged, osmolarity and GIR correctly staying on the delivered
  basis, Soluvit/Peditrace deliberately *not* scaled with an alert saying so.
  Independently re-verified by `verify-kcmh-factor.cjs` at `DEAD=20` and `DEAD=0`.
- **GA/PMA `WW.D` handling** — `gaTotalDays`/`parseGAInput` agree on the 0–6
  clamp; `gaToDecimalWeeks` is used only for Fenton's axis.
- **Date handling** — `todayLocal`/`addDaysToDateStr`/`dolAtDate` are UTC-anchored
  or Bangkok-pinned end to end; no `toISOString().slice(0,10)` survives on the
  client.
- **The auth hardening recovered on 2026-08-17** — `exp` check, the Staff-row
  re-check behind `_getStaffRowCached`, epoch-based revocation, constant-time
  compare, the shared login/changePassword lockout, `_sheetSafe`/`_numSafe`.
- **`normalizeLogEntries` / `hasLogOnDate` / `entryDol`** and their call sites in
  `log.jsx` and `registry.jsx` — all correct; `computeAlerts` was the one holdout
  (#4 above).
- **`NeoFeed.html` / `index.html`** — identical, PWA tags present in both.
