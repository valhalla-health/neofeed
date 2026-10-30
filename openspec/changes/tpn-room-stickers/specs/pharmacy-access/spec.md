## ADDED Requirements

### Requirement: A pharmacy role that cannot write

The server SHALL accept `pharmacy` as a Staff role. For a pharmacy session it SHALL answer only `ping`,
`login`, `logout`, `changePassword` and `pharmacyOrders`, and SHALL return `Forbidden` for every other
action before any sheet is read or written.

#### Scenario: Every other action is refused

- **WHEN** a pharmacy session calls each action the backend handles, other than the five allowed
- **THEN** each reply is `Forbidden` and no sheet changes

#### Scenario: The registry is refused

- **WHEN** a pharmacy session calls `getActivePatients`
- **THEN** the reply is `Forbidden` and carries no patient data

### Requirement: pharmacyOrders returns one date's orders without identifying fields

`pharmacyOrders` SHALL take a date and return, for the TPN orders whose TPN date (the date the printed
form shows as วันที่ให้ TPN) is that date: the counts
of submitted orders and drafts, the count of active patients on the unit, and one entry per order with the
NeoFeed ID, the row's `entryId`, bed, BW, the twin letter and set size, DOL, status (submitted or draft),
revision number, the prescriber's name, the saved and submitted times, and `printJson` for submitted
orders only. The reply SHALL contain no name, initials or date of birth, except the initials inside a
NeoFeed ID issued before 2026-09-27.

The fields are held to their shape (cold readers and task review, 2026-10-30): the prescriber is the
Staff name of the account the server stamped as the row's saver, never text a client wrote, and blank
when that name is an email; the bed is a ward bed (`NICU n`, `SCN n`, `iso n[-m]`) or blank; the twin
letter is A–D or blank; `entryId` is a UUID or blank; a time is an ISO timestamp or blank. The server
SHALL check both tabs' headers on every call, not through the write guard's cached verdict, and refuse
with `SchemaMismatch` when a column has moved. Two fields are still as written: `printJson`, until
Tasks 1–2 hold it to the final key set (plan-pr-a.md), and the NeoFeed ID, which for an infant
registered before 2026-09-27 carries initials (Pp accepted this as a residual risk on 2026-10-30;
re-keying those IDs is out of scope in proposal.md; design D5 gains the exception in Task 7).

#### Scenario: A day with submitted orders and a draft

- **GIVEN** three submitted TPN orders and one TPN draft for 2026-11-16, all synthetic
- **WHEN** a pharmacy session asks for that date
- **THEN** the counts are 3 submitted and 1 draft, with the active census
- **AND** four entries are listed, and only the three submitted ones carry `printJson`
- **AND** no name, initials or date of birth appears anywhere in the reply

#### Scenario: A revised order

- **WHEN** an order has a superseded row and a revision row
- **THEN** only the revision row is listed, with its revision number

#### Scenario: An order deleted and written again

- **WHEN** an admin deletes a submitted order and the doctor writes a new one for that infant and date
- **THEN** the new order is revision 1 again, with a different `entryId`

#### Scenario: Text a client wrote never reaches the reply

- **WHEN** a save carries a `savedByLabel` naming someone else, or a registry bed holds free text
- **THEN** the reply names the saver from Staff and leaves that bed blank

#### Scenario: Every call is audited

- **WHEN** a pharmacy session calls `pharmacyOrders`
- **THEN** `Audit_Log` gains a `readPharmacyOrders` row with the actor's email

### Requirement: The NeoFeed app turns a pharmacy account away

#### Scenario: A pharmacist signs in to NeoFeed

- **WHEN** a pharmacy account signs in to `NeoFeed.html` or `index.html`
- **THEN** it sees only a line saying that the account works with the TPN-room page

#### Scenario: A signed-in ward account becomes pharmacy

- **WHEN** an admin changes a signed-in account's role to pharmacy, or a pharmacy session is found in the
  browser's storage at load
- **THEN** the next sync answers `Forbidden`, and the app logs the token out, clears the calculator
  caches, and shows the sign-in screen with the same line
