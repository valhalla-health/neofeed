# Design: TPN room stickers

Agreed with Pp on 2026-10-30, one section at a time. Examples use synthetic infants only.

## Data flow

```
doctor ── NeoFeed save ──► Daily_Log row + printJson ─┐
          NeoFeed Submit ─► published (AH)            │ pharmacyOrders: counts, NeoFeed ID, bed,
                                                      │ BW, DOL, status, revision, printJson
                                                      ▼ (no name, initials or dob)
TPN-room PC ── tpn-room.html ◄────────────────────────┘
                 │ NeoFeed ID → name, AN: encrypted file on this PC's disk, never sent
                 └─► three stickers on one A4 sheet ─► the room's printer
```

Two things leave the PC: the sign-in, and `{action: "pharmacyOrders", token, date}`. Just before a print the page also
fetches its own `compiled/tpn-room-version.js` from the host, which sends nothing: a tab left open across a release
that moved a figure must reload first (Vera, 2026-11-05).

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Sticker figures come from `printJson`, saved by NeoFeed. The page never recomputes them. | A second implementation of the TPN calculation could print a figure the signed order does not have. The calculation is one `useMemo` inside `<Calculator>` and cannot be shared without rebuilding the dose code. |
| D2 | `printJson` holds finished strings, formatted in NeoFeed, not raw numbers. | Rounding happens once, in the app that owns the calculation. The page copies strings, so it has no rounding of its own to get wrong. |
| D3 | Dropped (plan for PR A, change 1). A save without `printJson` still lands with AM blank. A saved bag without the `calcInput.printJsonV` marker, dated today or tomorrow, shows "ยังไม่มีตัวเลขสติกเกอร์ — กด Submit อีกครั้ง" with Submit enabled, and that save writes a revision with figures. | Refusing would have touched sixteen backend harnesses, and the only orders that could lack figures come from a tab older than the release. Print is not held: the doctor's sheet uses no sticker figure. |
| D4 | Role `pharmacy` is an allow-list: `ping`, `login`, `logout`, `changePassword`, `pharmacyOrders`. The check sits right after the password-change gate, before `getActivePatients`. | Today `getActivePatients` and `sendHelpRequest` answer every signed-in role, and the registry payload carries names. "Cannot change anything" has to hold at the server, not in a screen. |
| D5 | `pharmacyOrders` sends no name, initials or date of birth. The pharmacist maps each infant from the paper order, which carries both the NeoFeed ID and the hospital patient sticker. The one exception: an ID issued before 2026-09-27 carries the infant's initials. Pp accepted that as a residual risk on 2026-10-30: the paper order and the hospital sticker carry the same ID, and re-keying is out of scope. A second residual: `critical.reason` is free text that reaches the reply. The Submit prompt forbids names and HNs, and nothing enforces it. | The pharmacy account never receives a name from NeoFeed. The key that links the ID to a person (the name file) lives only on the TPN-room PC, kept apart from NeoFeed: that is what makes the NeoFeed ID a pseudonym and not a lookup. |
| D6 | The NeoFeed app shows a pharmacy account only a line saying that the account works with the TPN-room page. | D4 already refuses its data; this only makes the refusal readable. |
| D7 | The name table lives in an encrypted file on the PC's disk (File System Access API), not in browser storage (Pp's choice). | Clearing the browser does not lose it. Its folder must be outside OneDrive and outside any Deep Freeze-style restore. |
| D8 | The page loads orders when it opens and on its refresh button, never on a timer. | Each call adds an `Audit_Log` row, and that tab's growth is already an open item. |
| D9 | The stickers follow the TPN unit's sample: its rows, units and decimals (Pp, 2026-10-30). The values are NeoFeed's, so Soluvit and Peditrace stay × Factor on the worksheet (Pp, 2026-10-30, keeping her 2026-09-18 decision). The PN label prints what reaches the infant (TPN unit, 2026-11-03). | The pharmacy sheet no longer prints, so the sticker is what the compounder reads; it should read the way the unit already works. A rounding or unit rule changes the format only, never a dose. |
| D10 | The page lives in this repo as `tpn-room.html` and ships through the same release gate (Pp's choice). | CI can test `printJson` and the stickers together, so a calculator change that would break a sticker fails the build. |
| D11 | The doctor's print stays as it is: the doctor's sheet only, one page per infant, with critical values confirmed at Submit and printed in the red box. | Live since 2026-10-29 (`96f7d2a`, TPN team 2026-10-28). Pp asked for exactly this on 2026-10-30; nothing to build except checking that the fullest order still fits one A4 page. Checked 2026-11-02 on the sheet as it is live: it does not. With every stock, two feeds, five oral lines and a critical value, the signature and footer reach page 2. Pp chose a PR of its own for that. The sheet has no changes-from-previous section: that is on the hidden pharmacy back. |
| D12 | A pharmacy account's login reply carries no registry (plan, change 4). | `_loginReply` attached the first registry snapshot, names included, to any successful login that asked for it, before the allow-list could run. |
| D13 | `pharmacyOrders` also answers an admin (plan, change 5), and reads one real date from the ward's today −7 to +1 days, for an admin too. | Pp can check it without a pharmacy account. The room needs today, tomorrow and a week of reprints, and nothing further back. |
| D14 | The server holds `printJson` to the schema `stickerFigures` makes and to the order it came with: exact keys; figures as number strings of at most 12 characters with no minus sign; `null` only on the two Addamel rows; the order's DOL, weight, constants version and date. It checks form and belonging, not whether a dose is right. | The page prints from `printJson` alone (D1), so the server is the last place that can refuse a wrong one. An attack pass stored DOL 25 on a DOL 10 row, D50W -5, KCl "abc" and a patient name. A refusal stops a doctor's save, so `stickerFigures` returns null rather than send a figure the server would refuse: the order saves, with no sticker. |
| D15 | The backend deploys first, always. A later change to the sticker schema does too. | On an older backend a new frontend writes the marker with no figures behind it, so the doctor sees no notice and the room says "save again". And a backend on `v: 1` refuses a client on a new key or version, which stops the doctor's save. |
| D16 | A cancelled or revised order is confirmed to the TPN room by phone (Pp, 2026-11-02 and 2026-11-03). A cancelled order not yet printed just leaves the page. One already printed keeps the warning any printed order gets when it leaves the reply. | When a doctor ticks No TPN over a submitted order the same day, the old row is superseded and the new one has no bag, so the order leaves the room's list. The doctor's short sheet says "TPN stopped today" as well. The warning costs nothing and covers a call that did not reach the room. |
| D17 | The PN label's date made comes from a date box beside the print button, today by default, and the pharmacist can change it (Pp, 2026-11-05). It goes on the sticker and in the print log on this PC, never in a request. | The unit says it is the day the TPN is prepared (2026-11-03), which NeoFeed does not hold and the page cannot assume is the print day or the order's date. |
| D18 | The PN label's heading, storage line and extension are constants in `tpn-room-core.js`, blank until the unit gives them, and the page refuses to print until all three are filled in (Pp, 2026-11-05). | The unit left 0.3 i blank. A label with a guessed storage line, or none, must not reach a bag. |
| D19 | The page does not hold an order after a birth-weight correction (Pp, 2026-11-05). The row shows BW beside the weight used to calculate, the doctor phones the room (D16), and the re-save shows as a changed order. | The page cannot see `dosingWeightChanged`: it lives in the calculator, and the reply has only BW and the saved weight, which differ for ordinary reasons (the weight is floored at birth weight until regained). A server flag would mean a backend deploy for a narrow window. **Residual risk:** between the correction and the re-save the room can print figures from the old weight. |
| D20 | The page does not load `data.js`. `tools/build.mjs` writes the two versions it checks into `compiled/tpn-room-version.js`. | D1 holds by construction: the page has no dose code to call. A `CONSTANTS_VERSION` bump still reaches it in the same build, and CI fails on stale output. |

## The name file (D7)

- **Setup:** on first use the pharmacist picks a folder; the page creates the file there and keeps its
  handle in IndexedDB.
- **Encryption:** a random AES-GCM data key encrypts the table. The file stores that key wrapped twice:
  - by a non-extractable device key held in the browser's IndexedDB, which unlocks silently every day;
  - by a key derived from the TPN room's passphrase (PBKDF2-SHA-256), which is needed only after the
    browser's data is cleared or on a new PC. The page then makes a new device key.

  A copy of the file opened elsewhere without the passphrase cannot be read.
- **Writes:** every change rewrites the whole file through `createWritable()`. The swap file commits on
  `close()`, so a crash leaves the previous version.
- **Contents:** per infant: NeoFeed ID, the name to print, AN, who mapped it and when, and the edit
  history. A print log: NeoFeed ID, order date, `entryId`, revision, who printed and when. The page looks
  an order up in the log by NeoFeed ID and date and compares the `entryId`: an order deleted and written
  again starts at revision 1 again (cold readers, 2026-10-30).
- **Purge:** an infant not seen in any order for 30 days is removed. If that infant comes back on TPN,
  the pharmacist maps the infant again from the paper order.
- **Status line:** the number of infants in the table, whether the file is open, its folder, and who is
  signed in.
- **A changed byte stops the file.** The payload's additional data covers the header, and the text must equal
  its canonical form. A wrong passphrase, a damaged file and a missing file each say so, and none opens an
  empty table.
- **A lost passphrase:** "start a new file" warns, keeps the old file beside the new one under another name,
  and records the day, so every order from 7 days before it to 1 day after says "เทียบกับ order กระดาษก่อน".
- **A first file counts as a lost log too:** a cleared browser and an empty folder look like a first run, so the page
  cannot tell them apart, and a paper check in the first week costs little (Vera, 2026-11-05).
- **One write at a time** in a tab; a second tab's write stops this one with "โหลดหน้านี้ใหม่".

## Network (PDPA)

- The page sends only the sign-in and `pharmacyOrders`. No code path puts a name or an AN in a request.
- `tpn-room.html` gets the same `connect-src` NeoFeed's pages use (the backend URL by full path and
  `script.googleusercontent.com`), and loads no third-party script.
- **Google sign-in (Pp, 2026-11-14)** is a redirect to Google's OpenID Connect endpoint and back
  (`response_type=id_token`, state and nonce checked on return, the fragment wiped before the first render).
  A gmail or Chula account has no NeoFeed password, so the room needs it. Google's Sign-In script was tried
  first and dropped: any script on this origin can reach the device key and the folder handle in IndexedDB,
  names on screen or not (Vera, 2026-11-14). The redirect URI `https://neofeed.valhalla-health.workers.dev/tpn-room` must be
  listed on the OAuth client.
- A CI test maps a sentinel name and fails if any request URL, header or body contains it.
- **Residual risk:** the page's code is downloaded from the host, so a malicious `release` could read the
  names, and CSP cannot stop it because the same host serves the CSP. The release gate (CI, Vera,
  merge into `release` only on Pp's word) is the control. NeoFeed's own Sheet already sits behind the
  same gate. The page shares its origin with the ward app on the Workers host, so the ward app's code could
  reach the device key and the folder handle in IndexedDB; the same gate covers that too, and the room's PC
  has no reason to open the ward app.
- The processing purpose (compounding) and the recipient (the TPN unit) are unchanged. What is new is
  a store of names on a hospital PC, which goes to IT and the DPO in the planned change request for the
  record of processing.

## Stickers (D9)

One A4 sheet, three parts, cut by hand, as in the unit's current print.

| Part | Content |
|---|---|
| 1 Compounding worksheet | Name, ward, dosing weight, DOL, TPN date, Factor, prepared volume; every stock row `printJson` lists, zeros included, so the compounder can tick each one; WFI on the right; the NeoFeed ID in small type |
| 2 PN label | The unit's heading; name, AN, DOL, ward; order date and a blank "เวลาที่เริ่มให้"; delivered, dead-space and prepared volumes; the delivered amounts; osmolarity; kcal; date made (the day the TPN is prepared: TPN unit, 2026-11-03); the storage line and the unit's extension (both configured in the page) |
| 3 Bag label | Name in large type; the ward in a large box; AN; date |

- **Ward on the bag label:** NICU and iso beds print `9B2(NICU)`, SCN beds print `9B2(SCN)` (Pp,
  2026-10-30). A blank or free-text bed blocks printing until NeoFeed has a bed.
- **Dates and font:** dates print in the Buddhist era, as now. The font is Sarabun (OFL) served with the
  page, so every PC prints the same.
- **Rows:** the worksheet lists the sample's stock rows in its order, less Aminoleban, Nephrosteril and
  MgSO₄ 50 %, which the unit dropped (2026-11-03). A stock the unit keeps and NeoFeed cannot order (Amiparen,
  Addamel N) prints `0`.
- **A sheet that does not fit is refused.** The sheet hides its overflow, so the page lays it out off-screen at its
  printed size and measures it before the dialog (Vera, 2026-11-05). The print log is written after that check.
- **Decimals:** at most the sample's, and never a trailing zero (Pp, 2026-10-30: the ISMP rule holds on
  the sticker too, so KCl prints `3`, not `3.0`, and an empty row `0`).

  | Figure | At most |
  |---|---|
  | D50W, amino acid stocks, WFI, prepared and delivered volumes | one decimal, as the doctor's form (Pp, 2026-10-30: the sample's whole mL rounded NeoFeed's 0.1 mL value a second time and was 1 mL off in 4–8 % of orders) |
  | Every other stock row | one decimal |
  | Dead space | two decimals |
  | Factor | two decimals |
  | PN label amounts | the sample's units: dextrose % and g, amino acid % and g per product, Na⁺ K⁺ Cl⁻ acetate in mEq, Ca²⁺ phosphate Zn²⁺ in mg, vitamin and trace mL, heparin units, osmolarity mOsm/L and kcal as whole numbers. One exception: **Mg²⁺ in mg**, in the same mg the order uses, where the sample shows mEq (Pp, 2026-10-30: the unit's own label moves to mg too) |

  Each figure is NeoFeed's calculated value rounded half up for display. No printed figure is derived
  from another printed figure. Every mL row prints at #171's one decimal at most, so the worksheet adds up
  to the prepared volume and matches the doctor's form row for row; the calculation is unchanged.
- **Known difference from the unit's Excel:** on the worksheet, Soluvit and Peditrace are × Factor (2.5 mL where the
  sheet gives 2.2 for a 2.20 kg infant at 280/250 mL). Pharmacy is told before the first real sticker.

## Risks

- **Wrong mapping.** An ID mapped to the wrong infant labels every bag for that infant wrongly. The
  pharmacist maps from the paper order, which carries both identifiers; the dialog shows BW, bed and DOL,
  and warns when an AN is already mapped to another ID.
- **Browser support.** File System Access works in Chrome and Edge only, and may ask for permission when
  the page opens. Task 0.1 checks this on the real PC with `tpn-room-check.html`. Pp chose on 2026-11-05 to
  build first, with the file code in `tpn-room-store.js` on its own, and not to release until the check passes.
- **Orders saved before release** have no `printJson`; the doctor opens the order and saves it again.
  The ward starts routine use on 16 Nov.
