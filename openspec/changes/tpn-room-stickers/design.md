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

Two things leave the PC: the sign-in, and `{action: "pharmacyOrders", token, date}`.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Sticker figures come from `printJson`, saved by NeoFeed. The page never recomputes them. | A second implementation of the TPN calculation could print a figure the signed order does not have. The calculation is one `useMemo` inside `<Calculator>` and cannot be shared without rebuilding the dose code. |
| D2 | `printJson` holds finished strings, formatted in NeoFeed, not raw numbers. | Rounding happens once, in the app that owns the calculation. The page copies strings, so it has no rounding of its own to get wrong. |
| D3 | Submit refuses a row without `printJson`, with the existing "open and save again" message. | Every submitted order then has sticker figures. It is the same rule `_stopRefusal` already applies to drafts from an older app. |
| D4 | Role `pharmacy` is an allow-list: `ping`, `login`, `logout`, `changePassword`, `pharmacyOrders`. The check sits right after the password-change gate, before `getActivePatients`. | Today `getActivePatients` and `sendHelpRequest` answer every signed-in role, and the registry payload carries names. "Cannot change anything" has to hold at the server, not in a screen. |
| D5 | `pharmacyOrders` sends no name, initials or date of birth. The pharmacist maps each infant from the paper order, which carries both the NeoFeed ID and the hospital patient sticker. | The pharmacy account never receives a name from NeoFeed. The key that links the ID to a person (the name file) lives only on the TPN-room PC, kept apart from NeoFeed: that is what makes the NeoFeed ID a pseudonym and not a lookup. |
| D6 | The NeoFeed app shows a pharmacy account only a line saying that the account works with the TPN-room page. | D4 already refuses its data; this only makes the refusal readable. |
| D7 | The name table lives in an encrypted file on the PC's disk (File System Access API), not in browser storage (Pp's choice). | Clearing the browser does not lose it. Its folder must be outside OneDrive and outside any Deep Freeze-style restore. |
| D8 | The page loads orders when it opens and on its refresh button, never on a timer. | Each call adds an `Audit_Log` row, and that tab's growth is already an open item. |
| D9 | The stickers follow the TPN unit's sample: its rows, units and decimals (Pp, 2026-10-30). The values are NeoFeed's, so Soluvit and Peditrace stay × Factor (Pp, 2026-10-30, keeping her 2026-09-18 decision). | The pharmacy sheet no longer prints, so the sticker is what the compounder reads; it should read the way the unit already works. A rounding or unit rule changes the format only, never a dose. |
| D10 | The page lives in this repo as `tpn-room.html` and ships through the same release gate (Pp's choice). | CI can test `printJson` and the stickers together, so a calculator change that would break a sticker fails the build. |
| D11 | The doctor's print stays as it is: the doctor's sheet only, one page per infant, with critical values confirmed at Submit and printed in the red box. | Live since 2026-10-29 (`96f7d2a`, TPN team 2026-10-28). Pp asked for exactly this on 2026-10-30; nothing to build except checking that the fullest order still fits one A4 page. |

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
  history. A print log: NeoFeed ID, order date, revision, who printed and when.
- **Purge:** an infant not seen in any order for 30 days is removed. If that infant comes back on TPN,
  the pharmacist maps the infant again from the paper order.
- **Status line:** the number of infants in the table, whether the file is open, and who is signed in.

## Network (PDPA)

- The page sends only the sign-in and `pharmacyOrders`. No code path puts a name or an AN in a request.
- `tpn-room.html` gets the same `connect-src` NeoFeed's pages use (the backend URL by full path and
  `script.googleusercontent.com`), and loads no third-party script.
- A CI test maps a sentinel name and fails if any request URL, header or body contains it.
- **Residual risk:** the page's code is downloaded from the host, so a malicious `release` could read the
  names, and CSP cannot stop it because the same host serves the CSP. The release gate (CI, Vera,
  merge into `release` only on Pp's word) is the control. NeoFeed's own Sheet already sits behind the
  same gate.
- The processing purpose (compounding) and the recipient (the TPN unit) are unchanged. What is new is
  a store of names on a hospital PC, which goes to IT and the DPO in the planned change request for the
  record of processing.

## Stickers (D9)

One A4 sheet, three parts, cut by hand, as in the unit's current print.

| Part | Content |
|---|---|
| 1 Compounding worksheet | Name, ward, dosing weight, DOL, TPN date, Factor, prepared volume; every stock row `printJson` lists, zeros included, so the compounder can tick each one; WFI on the right; the NeoFeed ID in small type |
| 2 PN label | The unit's heading; name, AN, DOL, ward; order date and a blank "เวลาที่เริ่มให้"; delivered, dead-space and prepared volumes; the delivered amounts; osmolarity; kcal; date made; the storage line and the unit's extension (both configured in the page) |
| 3 Bag label | Name in large type; the ward in a large box; AN; date |

- **Ward on the bag label:** NICU and iso beds print `9B2(NICU)`, SCN beds print `9B2(SCN)` (Pp,
  2026-10-30). A blank or free-text bed blocks printing until NeoFeed has a bed.
- **Dates and font:** dates print in the Buddhist era, as now. The font is Sarabun (OFL) served with the
  page, so every PC prints the same.
- **Rows:** the worksheet lists every stock row the sample lists, in its order. A stock NeoFeed cannot
  order (Aminoleban, Nephrosteril, MgSO₄ 50 %, Addamel N) prints `0`.
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
- **Known difference from the unit's Excel:** Soluvit and Peditrace are × Factor (2.5 mL where the
  sheet gives 2.2 for a 2.20 kg infant at 280/250 mL). Pharmacy is told before the first real sticker.

## Risks

- **Wrong mapping.** An ID mapped to the wrong infant labels every bag for that infant wrongly. The
  pharmacist maps from the paper order, which carries both identifiers; the dialog shows BW, bed and DOL,
  and warns when an AN is already mapped to another ID.
- **Browser support.** File System Access works in Chrome and Edge only, and may ask for permission when
  the page opens. Task 0.1 checks this on the real PC before anything is built.
- **Orders saved before release** have no `printJson`; the doctor opens the order and saves it again.
  The ward starts routine use on 16 Nov.
