# TPN room: stickers from NeoFeed and a read-only pharmacy account

## Why

The TPN unit receives each order on paper and types the infant's name and every component into its own
Excel workbook. It prints that on one A4 sticker sheet and cuts it into three: the compounding worksheet,
which goes into the compounding room with the bag; the PN label, stuck over it once the bag is made; and
the bag label on the light-protective cover, with the ward in large type. Typing the order a second time is where transcription errors come from.

Pharmacy accounts cannot print patient-name stickers from the hospital system, and the unit does not
want to read NeoFeed IDs and stick name labels on by hand. It also asked for one screen with the number
of submitted orders (compound these) and drafts (wait), and for pharmacy staff, weekend cover from other
units included, to be unable to change anything in NeoFeed.

## What changes

- **Sticker figures saved with the order.** Every save of a TPN order writes `printJson` (`Daily_Log`
  column AM): the figures the three stickers need, computed by NeoFeed and formatted the way the TPN
  unit's sample sticker shows them. A save without it still lands: a tab from before the release sends
  none, and a marker lets the doctor save such an order again. The server holds what it stores to the
  sticker schema, for the order it came with.
- **A `pharmacy` role.** The server answers a pharmacy session for a short allow-list of actions (design D4) and
  refuses everything else, before any other handler runs.
- **`pharmacyOrders`.** A read action that returns one date's counts and TPN orders with no name,
  initials or date of birth. Each call is audited.
- **`tpn-room.html`.** A separate page for the TPN-room PC. It lists the orders, keeps the NeoFeed ID →
  name and AN table in an encrypted file on that PC's disk, and prints the three stickers from
  `printJson` without computing anything.

## Impact

- `gas-backend.gs`: the role, the allow-list, `pharmacyOrders`, column AM, the sticker schema check. Needs
  a backend deploy (Pp's go-ahead) before the frontend release, and that order is required (design D15).
- `calculator.jsx` and the save path: build `printJson` from the calculator's own values.
- New `tpn-room.html` and its script, served by both hosts from `release`.
- The doctor's printed sheet does not change: it is already the only page that prints (since
  2026-10-29), so the sticker is the one printed place for stock mL. No dose moves, so
  `CONSTANTS_VERSION` stays.
- Process: Vera before each PR. Pharmacy is told that Soluvit and Peditrace are × Factor. IT and the DPO
  are told about the new local store of names.

## Out of scope

- Lipid syringe labels: the TPN unit does not compound lipid.
- Any status sent back to NeoFeed (received, compounded). The page only reads.
- The pharmacy account using the NeoFeed app itself.
- Removing names from NeoFeed's registry, and re-keying IDs issued before 2026-09-27.
