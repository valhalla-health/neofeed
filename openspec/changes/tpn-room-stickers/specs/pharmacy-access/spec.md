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
orders only. The reply SHALL contain no name, initials or date of birth.

Every field comes from what the server wrote, held to its shape (cold readers, 2026-10-30): the
prescriber is the Staff name of the account the server stamped as the row's saver, never text a client
wrote, and blank when that name is an email; the bed is a ward bed (`NICU n`, `SCN n`, `iso n[-m]`) or
blank; a time is an ISO timestamp or blank. The server SHALL check both tabs' headers first and refuse
with `SchemaMismatch` when a column has moved.

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
