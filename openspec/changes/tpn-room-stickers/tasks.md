# Tasks

## 0. Before building

- [ ] 0.1 Spike on the TPN-room PC with a throwaway test page: the Chrome/Edge version; whether File System
      Access can create and rewrite a file in a local folder; whether the permission survives closing the
      browser and restarting the PC; whether the page installs as an app.
      **Pp, 2026-11-05: build first, spike after, and no release until it passes.** The test page is
      `tpn-room-check.html`. It has no patient data and calls no server.
- [ ] 0.2 Ask IT whether that PC runs Deep Freeze or a similar restore, or clears browser data on exit, and
      which local folder is neither restored nor synced. Put the new store of names in the planned change
      request so the DPO can add it to the record of processing.
- [ ] 0.3 Ask the TPN unit (Pp, 2026-10-30). The unit replied in writing on 2026-11-03 to a list of a–i (kept in
      Pp's product notes). Still open: e as written here, i, j, k, l and m. Figures:
      a. Soluvit and Peditrace on the PN label: what reaches the infant (1.6 mL for a 1.6 kg infant) or
         what is in the bag (1.9 mL, × Factor)? The unit's sample shows one number on both stickers only
         because its Excel does not overfill.
         **Answered: what reaches the infant** ("ใส่ปริมาตรที่เด็กได้จริง"). The worksheet stays × Factor (D9).
      b. Cl⁻: from 20% NaCl and KCl only, 1 : 1? **Answered: yes.**
      c. Calories/Deliv.Vol: dextrose at 3.4 and amino acid at 4 kcal/g in the delivered volume, nothing
         else? **Answered: yes.**
      d. Heparin units on the PN label: in the delivered volume, as the sample shows, not the bag?
         **Answered: the delivered volume,** at "0.5 - 1 unit / cc". The calculator cautions only above 1 U/mL
         and has no caution below 0.5.
      e. Osmolarity: NeoFeed's formula is the KCMH worksheet's E52, and on the unit's sample order it
         gives the same whole number the sticker shows. Does the unit's Excel count the sodium
         from Glycophos and Na acetate? Leaving out Glycophos or Na acetate sodium lowers the figure by
         2 mOsm/L per mEq/L of Na, which can put a peripheral bag under 900 on paper and over it in NeoFeed.
         **Not answered as written.** The list the unit saw asked instead where the sodium error it once
         mentioned was, and whether Excel had been fixed. Reply: "เดิมคำนวณถูกแล้ว", so there was no error.
         **Whether Excel counts Glycophos and Na acetate sodium was not asked, and stays open.**
      Format and practice:
      f. The sample's decimals are the rule for every sticker, printed without trailing zeros (`3`, not
         `3.0`). Dextrose keeps what was typed (`12.25`), as on the doctor's sheet.
         **Answered: print `3`** ("พิมพ์เฉพาะ 3"). The reply says nothing against the sample's decimals.
      g. The rows NeoFeed cannot order (Amiparen, Aminoleban, Nephrosteril, MgSO₄ 50 %, Addamel N): keep
         them at 0 as a checklist, or drop them?
         **Answered: Amiparen and Addamel N stay at 0** ("ยังมีสก.สั่งอยู่"). **Aminoleban and Nephrosteril go**
         ("ไม่มีหมอเด็กสั่ง ตัดออก"), **and so does MgSO₄ 50 %** ("เอาออกได้").
      h. The worksheet's bw is the dosing weight the order used, and วันที่ผลิต is the day the sticker is
         printed.
         **Answered: bw is the weight the calculation used. วันที่ผลิต is the day the TPN is prepared**
         ("วันที่เตรียม TPN"), not the day the sticker prints. See 2.6.
      i. The printer model, whether the A4 sheet is cut by hand, and the PN label's fixed lines (heading,
         storage line, extension). **The reply left this blank.**
      j. Twins share BW and DOL: print the twin letter (A, B) on all three stickers, or does the name the
         room maps already carry it?
      k. An order written in the evening for the next bag carries that day's date in NeoFeed (the ward app
         dates an order today or earlier), and so does the doctor's sheet. Is that the date the sticker
         should show?
      l. Who holds the room's passphrase, and is the Excel routine the fallback on a day the page cannot open
         the name file?
      m. Acetate on the PN label is the Na acetate ordered. It leaves out Aminoven Infant's lysine acetate, as
         the sample does. Is that right?
      j, k, l and m were not on the list the unit answered.
      Still to tell them: Soluvit and Peditrace are × Factor on the worksheet (2.5 mL where their Excel gives
      2.2), and Mg on the label is in mg.

## 1. PR A: NeoFeed (printed figures, pharmacy role)

- [ ] 1.1 Map every figure on the unit's sample stickers to a calculator value. List the ones the
      calculator does not produce yet (for example amino acid %, Mg²⁺ in mg in the delivered volume, kcal
      of the delivered aqueous volume) with the formula each would use, and get Pp's sign-off on that
      table before coding. Pp went ahead on 2026-10-31 with figures a–d marked PROVISIONAL in `data.js`. The
      TPN unit confirmed a–d on 2026-11-03, and `data.js` no longer marks them. Her sign-off is the step left.
- [x] 1.2 Build `printJson` from the calculator's values with the sticker number format. Add a harness
      that, for a matrix of synthetic orders (the KCMH-worksheet cases included), asserts each `printJson`
      string equals the calculator's value rounded half up to its decimals, and covers the three
      scenarios in `specs/order-print-figures`.
- [x] 1.3 Write `printJson` on `logDailyNutrition` and `updateDailyNutrition`: `LOG_HEADERS` gains
      `printJson` (AM), `_ensureLogWidth` 39, `_assertSchema`; run `applyLogHeaderColumns` after the deploy.
- [x] 1.4 Dropped (plan for PR A, change 1; design D3). A saved bag without figures gets a notice and can be
      saved again, and the server holds the figures it stores to the schema (design D14).
- [x] 1.5 Add `pharmacy` to `VALID_STAFF_ROLES` and the allow-list right after the password-change gate.
      In `test/gas-vm-sandbox.cjs`, call every handled action as a pharmacy session and assert `Forbidden`
      and an unchanged sheet.
- [x] 1.6 Add `pharmacyOrders` with its `readPharmacyOrders` audit row. Assert that the reply holds no
      name, initials or date of birth, and that drafts carry no `printJson`.
- [x] 1.7 Turn a pharmacy account away in the NeoFeed app with one line of text.
- [ ] 1.7a Check that the doctor's sheet of the fullest synthetic order (every stock, a critical-value box)
      still prints on one A4 page, with a headless Chrome PDF. Run 2026-11-02 on the sheet as it is live: 2
      pages, and the signature reaches page 2. Pp chose a PR of its own. This change does not touch the sheet.
- [ ] 1.8 Vera's report in the PR; `CHANGELOG.md` entry; `STATUS.md` in the same PR. Backend deploy before
      the frontend release, both on Pp's go-ahead.

## 2. PR B: `tpn-room.html`

Built 2026-11-05 on branch `claude/tpn-room-page`, ahead of 0.1 and 0.3 i on Pp's word. Harnesses:
`test/verify-tpn-room-core-1105.cjs`, `verify-tpn-room-store-1105.cjs`, `verify-tpn-room-page-1105.cjs`, and § 8 of
`verify-build-shells.cjs`.

- [x] 2.1 Page shell in both hosts' file lists, with the same `connect-src` as NeoFeed's pages and no
      third-party script. Sarabun served with the page.
- [x] 2.2 Sign-in, and the date's counts and order list from `pharmacyOrders`, on open and on refresh only.
- [x] 2.3 The name file: folder picker, envelope encryption (device key and room passphrase), atomic
      rewrite, purge after 30 days, status line. Tests: wrong passphrase, tampered file, cleared device key.
- [x] 2.4 Mapping dialog with BW, bed and DOL, the AN pattern, the AN-reuse warning and the edit history.
- [x] 2.5 Printability rules and the revision warning; critical alerts on the row.
- [x] 2.6 The three stickers on A4 from `printJson`. Tests: every number on the stickers is in `printJson`;
      zero rows print; iso prints `9B2(NICU)`. A headless Chrome PDF of a synthetic sheet for Pp to check
      against a real sticker sheet. The PN label's date made is the day the TPN is prepared (0.3 h), which the
      page cannot assume is the print day or the order date: settle where it comes from together with 0.3 k.
      **Pp, 2026-11-05: a date box beside the print button, today by default (design D17).** The sticker's
      other dates stay the order's date until 0.3 k is answered. **Still to do, Pp:** check the PDF against a
      real sheet, since the layout follows the design's table and the sample photo was not opened. **Blocked on
      0.3 i:** the PN label's heading, storage line and extension are blank in `tpn-room-core.js`, and the page
      refuses to print until all three are filled in (design D18).
- [x] 2.7 The sentinel-name test: no request URL, header or body contains the mapped name.
- [x] 2.8 Vera's report in the PR (#219); `CHANGELOG.md`; `STATUS.md`. Run 2026-11-05: NO BLOCK, findings 1–4 fixed
      with tests, 5 is the retention question below.
- [ ] 2.8a For Pp and the DPO, with 0.2 (Vera, 2026-11-05): a retention rule for `.replaced-*` name files, and a manual
      erasure step for the name file, which `pseudonymizePatient` cannot reach (`REFERENCE.md` § Thai PDPA).
- [x] 2.9 From the cold readers (2026-10-30), each with a test where it can have one. **Contact line:** only
      "order ผิด: โทรหาหมอผู้สั่ง" is filled in. Who to call about NeoFeed and the passphrase waits on Pp and 0.3 l,
      in `CONTACTS` in `tpn-room-core.js`; a blank line stays off the page.
      - Served by the Workers host only. On `*.github.io`, which every Pages site in the org shares, the page
        redirects before it touches any storage, as `boot.js` does; Pages sends no CSP.
      - Its own session key, never `neofeed_session`. Sign-in by email and password only (no Google script on
        a page that holds names). A forced change-password screen on `mustChangePassword` that keeps the
        rotated token: it applies to a pharmacy row typed into the Staff tab with a non-Google address,
        which the onEdit trigger gives a temporary password. A Google-domain address gets no password from
        the trigger and is never forced to change one: give it a password with
        `setInitialPassword(email, password, "pharmacy")` (checked in the sandbox: it signs in by password,
        with no registry), and offer a change-password button on the page.
      - Every string from the reply rendered as text. The saver labelled "บันทึกโดย": a nurse can save an
        order while the nursing switch is off.
      - The status line shows the name file's folder. A "start a new file" flow for a lost passphrase warns
        that the print log is gone and marks every order in the window "check against the paper first".
      - A fixed contact line: who to call about NeoFeed, the passphrase, a wrong order.
      - The ward app's refusal line for a pharmacy account links to the page.

- [x] 2.10 From PR A's reviews:
      - Keep the highest revision per NeoFeed ID and date, and read twice before any polling: the server's
        read is uncached and whole-column, fine on demand, not on a short timer.
      - The date picker stays inside the server's window, today −7 to +1.
      - The sandbox's `logRow` seeds `entryId` as `e-<uuid>`, which `pharmacyOrders` blanks, so dev-local
        orders show no `entryId` until that fixture is a plain UUID.
      - A cancelled order leaves the list. The doctor phones the room for a cancelled or a revised order
        (design D16).
      - The doctor's Print is held after a birth-weight correction (`dosingWeightChanged`), and AM keeps the
        figures from the old weight. Should the page hold that order too? **Pp, 2026-11-05: no (design D19).**
        The row shows BW beside the weight used to calculate, and the doctor phones the room.
      - Refuse to print a `constantsVersion` other than the current one: the doctor's Print is held when a
        release moves a figure, and the page can reach an old order inside its window.

## 3. Pilot and go-live

- [ ] 3.1 On the TPN-room PC with synthetic infants: map, print, revise, clear the browser and recover with
      the passphrase. Watch DevTools' Network tab with Pp while mapping and printing.
- [ ] 3.2 Tell pharmacy that Soluvit and Peditrace are × Factor (2.5 mL where their Excel gives 2.2 on a
      2.20 kg infant at 280/250 mL), and show how to map from the paper order.
- [ ] 3.3 First real day with Pp or a named pharmacist checking the first stickers against the paper order.
