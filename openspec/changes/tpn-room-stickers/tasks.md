# Tasks

## 0. Before building

- [ ] 0.1 Spike on the TPN-room PC with a throwaway test page: the Chrome/Edge version; whether File System
      Access can create and rewrite a file in a local folder; whether the permission survives closing the
      browser and restarting the PC; whether the page installs as an app.
- [ ] 0.2 Ask IT whether that PC runs Deep Freeze or a similar restore, or clears browser data on exit, and
      which local folder is neither restored nor synced. Put the new store of names in the planned change
      request so the DPO can add it to the record of processing.
- [ ] 0.3 Ask the TPN unit (Pp, 2026-10-30). Figures:
      a. Soluvit and Peditrace on the PN label: what reaches the infant (1.6 mL for a 1.6 kg infant) or
         what is in the bag (1.9 mL, × Factor)? The unit's sample shows one number on both stickers only
         because its Excel does not overfill.
      b. Cl⁻: from 20% NaCl and KCl only, 1 : 1?
      c. Calories/Deliv.Vol: dextrose at 3.4 and amino acid at 4 kcal/g in the delivered volume, nothing
         else?
      d. Heparin units on the PN label: in the delivered volume, as the sample shows, not the bag?
      e. Osmolarity: NeoFeed's formula is the KCMH worksheet's E52, and on the unit's sample order it
         gives the same whole number the sticker shows. Does the unit's Excel count the sodium
         from Glycophos and Na acetate? Leaving out Glycophos or Na acetate sodium lowers the figure by
         2 mOsm/L per mEq/L of Na, which can put a peripheral bag under 900 on paper and over it in NeoFeed.
      Format and practice:
      f. The sample's decimals are the rule for every sticker, printed without trailing zeros (`3`, not
         `3.0`).
      g. The rows NeoFeed cannot order (Amiparen, Aminoleban, Nephrosteril, MgSO₄ 50 %, Addamel N): keep
         them at 0 as a checklist, or drop them?
      h. The worksheet's bw is the dosing weight the order used, and วันที่ผลิต is the day the sticker is
         printed.
      i. The printer model, whether the A4 sheet is cut by hand, and the PN label's fixed lines (heading,
         storage line, extension).
      Tell them: Soluvit and Peditrace are × Factor (2.5 mL where their Excel gives 2.2), and Mg on the
      label is in mg.

## 1. PR A: NeoFeed (printed figures, pharmacy role)

- [ ] 1.1 Map every figure on the unit's sample stickers to a calculator value. List the ones the
      calculator does not produce yet (for example amino acid %, Mg²⁺ in mg in the delivered volume, kcal
      of the delivered aqueous volume) with the formula each would use, and get Pp's sign-off on that
      table before coding.
- [ ] 1.2 Build `printJson` from the calculator's values with the sticker number format. Add a harness
      that, for a matrix of synthetic orders (the KCMH-worksheet cases included), asserts each `printJson`
      string equals the calculator's value rounded half up to its decimals, and covers the three
      scenarios in `specs/order-print-figures`.
- [ ] 1.3 Write `printJson` on `logDailyNutrition` and `updateDailyNutrition`: `LOG_HEADERS` gains
      `printJson` (AM), `_ensureLogWidth` 39, `_assertSchema`; run `applyLogHeaderColumns` after the deploy.
- [ ] 1.4 Refuse Submit for a TPN row without `printJson`, with the existing older-app message.
- [ ] 1.5 Add `pharmacy` to `VALID_STAFF_ROLES` and the allow-list right after the password-change gate.
      In `test/gas-vm-sandbox.cjs`, call every handled action as a pharmacy session and assert `Forbidden`
      and an unchanged sheet.
- [ ] 1.6 Add `pharmacyOrders` with its `readPharmacyOrders` audit row. Assert that the reply holds no
      name, initials or date of birth, and that drafts carry no `printJson`.
- [ ] 1.7 Turn a pharmacy account away in the NeoFeed app with one line of text.
- [ ] 1.7a Check that the doctor's sheet of the fullest synthetic order (every stock, a critical-value box,
      changes from the previous day) still prints on one A4 page, with a headless Chrome PDF.
- [ ] 1.8 Vera's report in the PR; `CHANGELOG.md` entry; `STATUS.md` in the same PR. Backend deploy before
      the frontend release, both on Pp's go-ahead.

## 2. PR B: `tpn-room.html`

- [ ] 2.1 Page shell in both hosts' file lists, with the same `connect-src` as NeoFeed's pages and no
      third-party script. Sarabun served with the page.
- [ ] 2.2 Sign-in, and the date's counts and order list from `pharmacyOrders`, on open and on refresh only.
- [ ] 2.3 The name file: folder picker, envelope encryption (device key and room passphrase), atomic
      rewrite, purge after 30 days, status line. Tests: wrong passphrase, tampered file, cleared device key.
- [ ] 2.4 Mapping dialog with BW, bed and DOL, the AN pattern, the AN-reuse warning and the edit history.
- [ ] 2.5 Printability rules and the revision warning; critical alerts on the row.
- [ ] 2.6 The three stickers on A4 from `printJson`. Tests: every number on the stickers is in `printJson`;
      zero rows print; iso prints `9B2(NICU)`. A headless Chrome PDF of a synthetic sheet for Pp to check
      against a real sticker sheet.
- [ ] 2.7 The sentinel-name test: no request URL, header or body contains the mapped name.
- [ ] 2.8 Vera's report in the PR; `CHANGELOG.md`; `STATUS.md`.

## 3. Pilot and go-live

- [ ] 3.1 On the TPN-room PC with synthetic infants: map, print, revise, clear the browser and recover with
      the passphrase. Watch DevTools' Network tab with Pp while mapping and printing.
- [ ] 3.2 Tell pharmacy that Soluvit and Peditrace are × Factor (2.5 mL where their Excel gives 2.2 on a
      2.20 kg infant at 280/250 mL), and show how to map from the paper order.
- [ ] 3.3 First real day with Pp or a named pharmacist checking the first stickers against the paper order.
