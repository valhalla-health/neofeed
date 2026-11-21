# Spec Delta

## Purpose

States which checks an order under the paediatric rule set is held to, and the evidence each value
needs before it can stop, flag or cap a child's order.

## ADDED Requirements

### Requirement: Every paediatric guard has a source and two signatures

A paediatric stop, critical limit, caution, target band, cap or input range SHALL ship only with a
`CR-P-` rule block that names its source, a synthetic case in the clinical-rules harness, a read of
its source by a reviewer who had not seen the work, and sign-off by the ward's rule owner and Pp.

#### Scenario: A guard with no rule block

- **WHEN** the paediatric tables hold a value that no `CR-P-` block names
- **THEN** a blocking check fails and names the value

### Requirement: No limit is borrowed from the newborn set

A check under the paediatric rule set SHALL use a paediatric value, or a newborn value that a signed
`CR-P-` block adopts by name. A parameter with neither SHALL show its figure with the note
"ยังไม่มีเกณฑ์" and SHALL NOT be graded.

#### Scenario: A parameter not yet signed

- **WHEN** a paediatric order shows a parameter whose guard is not signed
- **THEN** its tile shows the figure, the note, and no in-range or out-of-range colour

### Requirement: The paediatric set covers the same checks the newborn set has

Before a paediatric ward opens to its staff, the paediatric set SHALL hold a signed decision (a
value, or "not applicable" with a reason) for every parameter the newborn set checks. A readiness
check SHALL list them and fail while any is undecided.

#### Scenario: The parameters the readiness check lists

- **WHEN** the readiness check runs
- **THEN** it covers every rule in the clinical-rules index of the newborn set, among them: input
  ranges for age, weight and length; dosing weight and the typed-weight difference; fluid; energy;
  amino acids and non-protein energy per gram; lipid dose and hourly rate; glucose rate and dextrose
  concentration; Na, K, Cl; Ca, P, Mg and their ratio; K⁺ in the bag by route; peripheral
  osmolarity; zinc and trace elements; vitamins, vitamin D and oral supplements; heparin; bag and
  bottle volume and pump hours; the enteral bands, feeds per day, MEN and the No TPN floor; the
  parenteral to enteral switch; weight gain; the "TPN ทั้งหอ" flags; and the server's per-kg
  plausibility bounds

#### Scenario: Opening a ward with a decision missing

- **WHEN** the readiness check runs with one of the listed parameters undecided
- **THEN** it fails and names the parameter, and the ward cannot be opened to its staff

### Requirement: Bands follow the source's own age or weight bands

Where a source gives a value by age or weight band, the guard SHALL use the band that holds the
child on the order's date, and the tile SHALL name the band it applied.

#### Scenario: Two children in different bands

- **WHEN** two children fall in different bands of a signed guard and receive the same dose per kg
- **THEN** each is graded against its own band, and each tile names that band

### Requirement: A rule for a clinical group is switched by a recorded PN context

A guard that applies only to a clinical group (long-term PN, intestinal failure, PN-associated liver
disease) SHALL apply when that PN context is recorded for the patient in a structured field (the
PN indication or a tick), under the newborn and the paediatric rule set alike, and SHALL NOT be
inferred from the diagnosis text. A context SHALL add or tighten guards and SHALL NOT remove a stop.

#### Scenario: A second indication typed as free text

- **WHEN** a patient has one PN indication chosen from the list and another typed as free text
- **THEN** only the chosen indication's context applies, and the typed text switches nothing

#### Scenario: An indication and the liver tick together

- **WHEN** a patient has an indication with a signed rule and the Liver Dysfunction tick
- **THEN** both contexts apply, and the form shows both messages

#### Scenario: The same dose with and without a context

- **WHEN** two orders for children in the same age band carry the same dose, and one has a PN
  context whose signed rule sets a lower limit for it
- **THEN** only the order with the context is flagged, and its tile names the context

#### Scenario: A context that only advises

- **WHEN** the patient's PN indication is "Short bowel syndrome", whose rule is advice to look at
  sodium and zinc beyond the usual when stoma output is high
- **THEN** the form shows the advice, and no figure, tile colour, alert or limit differs from the
  same order without the context

#### Scenario: A context never loosens a stop

- **WHEN** an order that a stop blocks has a PN context added
- **THEN** the stop still blocks Save and Submit

### Requirement: A context's message is saved with the order and shown to the prescriber

The order SHALL save the contexts it was graded under. A context's message SHALL show on the
prescriber's screen, and SHALL print on the order only where its signed rule says so.

#### Scenario: The cholestasis message

- **WHEN** an order with the cholestasis context includes Peditrace or Addamel N
- **THEN** the form tells the prescriber to stop manganese, to consider taking the product off and
  giving zinc in its place, and that copper, selenium and iodine go with it; the printed order
  carries none of this text

#### Scenario: A reopened order after the patient record changed

- **WHEN** an order saved under a context is reopened after that context was removed from the patient
- **THEN** the order shows the context it was saved under, and says the patient record now differs

### Requirement: Paediatric alerts behave like the newborn kinds

A paediatric stop SHALL block Save and Submit; a critical limit SHALL ask for a typed reason at
Submit and print it; a caution or band SHALL colour the tile only. The kinds SHALL mean the same as
in the newborn set.

#### Scenario: A critical paediatric limit

- **WHEN** a paediatric order exceeds a signed critical limit
- **THEN** Submit asks for a reason, and the printed order carries the limit's name and the reason

### Requirement: Input ranges fit the age group

Under the paediatric rule set the server and the form SHALL accept age, weight and length within the
signed paediatric ranges and refuse values outside them. A typed weight that differs from the last
recorded weight by more than the signed paediatric difference SHALL ask for confirmation.

#### Scenario: A weight outside the paediatric range

- **WHEN** a paediatric order carries a weight outside the signed range
- **THEN** the form stops, and a hand-made request is refused by the server
