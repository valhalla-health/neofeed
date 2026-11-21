# Sources NeoFeed cites, and when each was last checked for a revision

One row per source. "Cite keys" are the strings to search for in the rule file
(`.claude/skills/neofeed-clinical-rules/SKILL.md`), the register (`docs/CLINICAL_CONSTANTS.md`),
`data.js` and `gas-backend.gs` to find the numbers a source supports; the repo names some sources
more than one way, so a row can have several. `gas-backend.gs` cites no guideline by name. "Watch point" is where a revision would be announced.
Full texts are not in this repo.

"Edition in use" is what the code follows. It changes only in the `neofeed-clinical-rules` PR in
which Pp adopts a new edition; a watch run writes to "Last checked" and "Result" (`SKILL.md` step 6).
"Never" means no watch run has checked the row. The rule file's Sources section says every citation
there was read on 2026-10-27.

Site names in "Watch point" are where to start looking. No watch run has opened them yet, so the
first run confirms each and writes the page it used into "Result".

## Next run

**Baseline partly done on 2026-11-21** (`audits/2026-11-21.md`): step 1 on production, step 2 for
every row, and step 4 for all 69 `CR-` rules, the register's `ENTERAL_TARGETS` and the Reference
page's ESPGHAN and WHO lines, with a second reader. Still unread, for the next run: `EN_DB` cell by
cell (needs the Chula handbook scans), the Fenton tables, the server's `_checkRange` bounds, the
cells of `tools/reference-tabs.json`, and the KCMH worksheet rows (the worksheet is not on disk).
The other source rows were searched on 2026-11-21 with the verdicts in the audit file's step 2
table; they are not copied into the tables below. Next quarterly run: January 2027.

## Guidelines

| Source | Edition in use | Cite keys | Full text | Watch point | Last checked | Result |
|---|---|---|---|---|---|---|
| ESPGHAN/ESPEN/ESPR/CSPEN paediatric PN guidelines (Clin Nutr 2018); the rule file cites ten chapters | 2018 | Joosten · van Goudoever · Lapillonne · Mesotten · Jochum · Mihatsch · Domellöf · Bronsky · Kolaček · Hartman · ESPGHAN 2018 | Pp's folder `Newborn\05_Nutrition\PN_and_EN\ESPGHAN 2018 PN guidelines\`; PMIDs in the rule file § Sources | ESPGHAN's and ESPEN's guideline lists; PubMed by PMID | Never | |
| Thai paediatric PN guideline, Thai Pediatric Nutrition Society | พ.ศ. 2564, public-hearing draft | Thai CPG · Thai PN Guideline 2564 | 2564 draft: thaipediatrics.org `wp-content/uploads/2022/04/media-20210923064524.pdf`; the rule file cites it by PDF page | web.pednutrition.org (the society); thaipediatrics.org/700 | 2026-11-21 | `newer edition, read`: พ.ศ. 2565 final, revised 26 Oct 2566 (web.pednutrition.org). Every cited number is unchanged; the PDF pages moved (audit file, citations to update). Pp has not adopted it |
| Moltu et al., ESPGHAN position paper, critically ill neonates (JPGN 2021;73:274–289) | 2021 | Moltu · ESPGHAN 2021 | Pp's folder `Newborn\05_Nutrition\PN_and_EN\` (`2021_JPGN_…`); PMID 33605663 | ESPGHAN; PubMed | Never | |
| Embleton et al., ESPGHAN enteral nutrition in preterm infants (JPGN 2023;76:248–268; the register and `data.js` call it "ESPGHAN 2022", "JPGN 2022") | 2022 position paper | Embleton · ESPGHAN 2022 | Pp's folder, same place (`2022_JPGN_…`); PMID 36705703 | ESPGHAN; PubMed | Never | |
| Koletzko et al., ESPGHAN/ESPEN paediatric PN guidelines 2005 | 2005 | Koletzko | PMID 16254497 | The 2018 guideline replaced the 2005 set: each rule still citing it needs its 2018 passage | Never | |
| WHO recommendations for care of the preterm or low-birth-weight infant (the rule file says "WHO 2022", `data.js` and the register "WHO 2023") | 2022 | WHO 2022 · WHO 2023 | Pp's folder, same place (`2023_WHO_…`); PMID 37753445 (GDG summary) | WHO publications | Never | First run: settle which year and document the repo means |
| WHO, Optimal feeding of low-birth-weight infants: technical review | 2006 | WHO 2006 | WHO | WHO publications | Never | |
| NICE NG154, Neonatal parenteral nutrition (cited for the "TPN ทั้งหอ" flags, `data.js`; no `CR-` rule) | As cited in `data.js` and `CHANGELOG.md` | NG154 | NICE | The guidance page's update history | 2026-11-21 | `erratum`: minor changes of June 2020 and October 2021, neither to rec 1.8.2 or 1.8.3 |
| ANMF neonatal potassium chloride monograph | 2020 | ANMF | Not on file | ANMF | 2026-11-21 | `newer edition, read`: v4.1, 8 Oct 2026. Peripheral not greater than 40 mmol/L; 20–40 peripheral, 60–80 central: as quoted from 2020 |
| IWK Health NICU potassium guideline | 2026 | IWK | Not on file | IWK Health | 2026-11-21 | First reader `could not check`; the second reader opened the Neonatal Parenteral Manual of 22 Aug 2025 (p. 37: peripheral 60, central 120 mmol/L). No 2026 edition found: the edition the rule file names needs confirming |
| IMSN (Ireland), K⁺ concentration | 2020 | IMSN | Not on file | IMSN | Never | |
| CUPA 2023 lecture, slide 17 (the only citation for the 160 kcal/kg/d ceiling) | 2023 | CUPA | Not on file | Ask Pp | Never | |
| Pereira-da-Silva 2004, neonatal PN osmolarity equation (cited as contrast) | 2004 | Pereira-da-Silva | PMID 14763792 | PubMed | Never | |
| ISMP trailing-zero rule | As cited | ISMP | ISMP | ISMP | Never | |
| Chula Pediatric Nutrition Handbook | 3rd ed., พ.ศ. 2565 | Chula Pediatric · Chula handbook · Chula Table | Scanned pages held by Pp (book page = PDF page − 8) | Ask Pp: a 4th edition | Never | |
| Fenton 2025 preterm growth chart (paper PMID 40534585; fentongrowth.ca for LMS) | 2025; weight re-checked 2026-09-05 | Fenton · 40534585 | As in `data.js` comments | The paper's errata; the calculator's API version | Never | |

## Textbooks

| Source | Edition in use | Cite keys | Full text | Watch point | Last checked | Result |
|---|---|---|---|---|---|---|
| Avery's Diseases of the Newborn | 11th ed. | Avery | The `neonatal-textbooks` skill | A 12th edition | Never | |
| Fanaroff and Martin's Neonatal-Perinatal Medicine | 12th ed. | Fanaroff | The `neonatal-textbooks` skill | A 13th edition | Never | |

## Product labels and local sources

| Source | Edition in use | Cite keys | Full text | Watch point | Last checked | Result |
|---|---|---|---|---|---|---|
| Peditrace SmPC | HPRA, 2019 | Peditrace | HPRA | HPRA revision date; the Thai label (rule file Q4) | Never | |
| Vitalipid N Infant SmPC | HPRA, 2022; Singapore SIN05207P | Vitalipid | HPRA; HSA | Revision dates; the Thai label | Never | |
| Soluvit N datasheet | Medsafe, 2021 | Soluvit | Medsafe | Revision date | Never | |
| Aminoplasmal 15 % SmPC (B. Braun) | UK SmPC, emc 15186; Singapore SIN08352P; read 2026-09-18 | Aminoplasmal · emc 15186 · SIN08352P | emc; HSA | Revision dates; the Thai label and the KCMH shelf | 2026-11-21 | `same edition`: emc text revised 05/03/2026, before the repo's read date |
| SMOFlipid | US label, as cited in `CHANGELOG.md` ("Not checked against the Thai label") | SMOF | Not on file | The regulator's revision date; the Thai label through the TPN pharmacist | 2026-11-21 | US label revised 8/2025 seen on DailyMed, not read; no revision date was on record for the edition in use, and no coded number cites it |
| Aminoven Infant 10 %, Amiparen 10 % | No label on file | Aminoven · Amiparen | Not on file | Ask: the Thai labels through the TPN pharmacist | Never | |
| Glycophos, PED AMINE and the other stocks with no label cited | No source on file | Glycophos · PED AMINE | Not on file | Ask: the TPN pharmacist | Never | |
| Feed products (Enfalac Premature, Pre Nan, Hi-Q, Infatrini, Enfamil HMF) | As in the Chula handbook tables; the register asks for a check "against current pharmacy labels" | The product names | Not on file | Ask: the product labels through pharmacy | Never | |
| KCMH pharmacy TPN worksheet (stock strengths, the osmolarity formula) | The sheet pinned by `test/verify-kcmh-constants.cjs` | KCMH worksheet · KCMH sheet | Held by pharmacy | Ask: the TPN team, "on any worksheet revision" | Never | |

## Candidates, not cited by a coded number yet

Read for the paediatric rule set (`openspec/changes/paediatric-wards/guideline-values.md`). They join
the tables above when a signed rule cites them.

| Source | Watch point |
|---|---|
| ASPEN paediatric PN dosing recommendations | ASPEN |
| Mehta et al. 2017, SCCM/ASPEN nutrition support of the pediatric critically ill patient | ASPEN; SCCM; PubMed |

## Leads

Things heard or seen in passing, not yet read on the page by a watch run. A lead is never a finding.

- (none open; the Thai CPG lead of 2026-11-21 was read by the first run and is now in its row.)

## Audit rotation

After the baseline, one group per quarterly run, so everything is re-read against its sources once a
year. Move the marker after a run.

1. Rule file: Stops; Critical ← next after the baseline
2. Rule file: Red without a reason; Cautions; Caps that change the dose
3. Rule file: Target bands. Register: `ENTERAL_TARGETS`, `EN_DB`
4. Rule file: Units and conventions; Rounding. Outside the rule file: the "TPN ทั้งหอ" flags, growth
   references, the server's range checks, the reference tabs

## Check log

Newest first: date, who ran it, scope, the audit file, the PR.

- 2026-11-21 · first run, on production (`release` 373eca8, backend @78): frontend and rule file
  confirmed, `STATUS behind` (it named @77). 26 source rows searched; 128 audit lines, 70 of them read
  again by a second reader with no disagreement; Q28 added. `audits/2026-11-21.md`. PR: not opened yet.
- 2026-11-21 · registry written.
