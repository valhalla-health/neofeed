## ADDED Requirements

### Requirement: Orders and counts for a chosen date

`tpn-room.html` SHALL show, for the date chosen (today by default: the ward date, UTC+7), the submitted, draft and active counts
and the list of TPN orders. It SHALL load them when the page opens and when the pharmacist presses
refresh, and never on a timer.

#### Scenario: Opening the page

- **WHEN** a pharmacist signs in
- **THEN** the page calls `pharmacyOrders` once for today and shows the counts, the submitted orders and,
  folded away, the drafts

### Requirement: Names and ANs stay on the PC

The page SHALL keep the NeoFeed ID → name and AN table only in the encrypted file on the PC's disk and
SHALL NOT put a name or an AN in any request.

#### Scenario: A sentinel name never leaves the page

- **GIVEN** a synthetic infant mapped to the sentinel name `SENTINEL-NAME-7Q`
- **WHEN** the page loads orders, maps, prints and refreshes
- **THEN** no request URL, header or body contains `SENTINEL-NAME-7Q`

#### Scenario: The file copied to another PC

- **WHEN** the file is opened on another PC without the room passphrase
- **THEN** the page cannot read it and says so

#### Scenario: The browser's data was cleared

- **WHEN** the device key is gone
- **THEN** the page asks for the room passphrase, opens the file with it, and makes a new device key

#### Scenario: A tampered file

- **WHEN** a byte of the file is changed
- **THEN** decryption fails and the page refuses the file, without falling back to an empty table

#### Scenario: Purge

- **WHEN** an infant has not appeared in any order for 30 days
- **THEN** the infant's entry is removed from the file

### Requirement: Mapping an infant

The page SHALL let the pharmacist enter the name to print and the AN for a NeoFeed ID, showing BW, bed and
DOL beside it, the order's weight for calculation (`printJson.dosingWeightKg`, the weight the paper order
prints), and for twins the letter and set size in large type ("Twin A of 2"). It SHALL check the AN against the `nnnnn/yy` pattern, warn when that AN is already mapped
to another NeoFeed ID, and record who mapped or edited the entry and when.

#### Scenario: An AN already in use

- **WHEN** the pharmacist enters an AN already mapped to another NeoFeed ID
- **THEN** the page names that other ID and asks for confirmation before saving

### Requirement: Print only what is safe to print

The page SHALL offer printing only for a submitted order that has `printJson`, a mapped name and AN, and a
bed in NICU, iso or SCN. Any other order SHALL show why it cannot print.

#### Scenario: Not printable

- **WHEN** an order is a draft, lacks `printJson`, is unmapped, or has a blank or free-text bed
- **THEN** it has no print button, and the row names the reason

#### Scenario: The order changed after printing

- **WHEN** the order for a NeoFeed ID and date has an `entryId` other than the one last printed for it
  (a revision, or an order deleted and written again, which starts at revision 1 again)
- **THEN** the row shows "หมอแก้ order หลังพิมพ์ → ฉบับ N" and offers printing the new order

#### Scenario: The order was deleted after printing

- **WHEN** an order printed for the chosen date is no longer in the reply
- **THEN** the page lists it as "พิมพ์แล้ว แต่ถูกลบใน NeoFeed — อย่าใช้ถุงนี้"

#### Scenario: Checked again just before printing

- **WHEN** the pharmacist presses print
- **THEN** the page calls `pharmacyOrders` for that date once more and refuses to print an order whose
  `entryId` changed since the list was loaded; the counts show when the list was loaded ("โหลดเมื่อ HH:MM")

#### Scenario: A doctor-confirmed critical value

- **WHEN** the order's `printJson` carries a confirmed critical alert
- **THEN** the row shows the alert and the reason before the pharmacist prints

### Requirement: Stickers print `printJson` strings, unchanged

The page SHALL print the three parts on one A4 sheet. Every figure on them SHALL be a string from
`printJson`, unit and decimals included, and the page SHALL compute none. The bag label SHALL print the
ward as `9B2(NICU)` for NICU and iso beds and `9B2(SCN)` for SCN beds. Dates SHALL print in the Buddhist
era.

#### Scenario: Figures are copied, not computed

- **WHEN** the stickers for a synthetic order are rendered
- **THEN** every number on them appears character-for-character in that order's `printJson`

#### Scenario: Zero rows on the worksheet

- **WHEN** `printJson` lists a stock at 0 mL
- **THEN** the worksheet prints that row with its 0, so the compounder can tick it

#### Scenario: An isolation bed

- **WHEN** the infant's bed is `iso 2-1`
- **THEN** the bag label's ward box reads `9B2(NICU)`
