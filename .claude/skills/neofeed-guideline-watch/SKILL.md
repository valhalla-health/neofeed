---
name: neofeed-guideline-watch
description: Use when Pp asks whether a nutrition guideline NeoFeed cites has been revised (เช็ก guideline, guideline ออกใหม่, ตรวจ guard เทียบ guideline, guideline watch), on the quarterly watch, and before a clinical rule set is added or changed. Proves which code the ward is running, checks each society and product label in sources.md for a newer edition, audits the coded numbers against what the sources print now, and hands Pp a list of differences.
---

# NeoFeed guideline watch

NeoFeed's limits and target bands come from guidelines and product labels that get revised. This
skill finds the revisions and shows where the code the ward is running no longer matches its
source. It is a **watch**: it reads, compares and reports. Every clinical number stays Pp's; a
difference becomes a question for her, and the code changes only through the
`neofeed-clinical-rules` skill after she answers.

State lives in this folder and three other files:

- [`sources.md`](sources.md): every source NeoFeed cites, the edition in use, where its full text
  is, where a revision would be announced, the last check and its result, and when the next run is due.
- `audits/<date>.md` in this folder: one file per run, the record of what was read (step 4).
- `.claude/skills/neofeed-clinical-rules/SKILL.md` ("the rule file"): every coded rule (`CR-…`) with
  its source, and the open questions (`Q…`). Pp owns it; a watch run writes there only what step 6 says.
- `docs/CLINICAL_CONSTANTS.md` ("the register"): every constant, who decided it, and its "Next review".

## When to run

- **Baseline:** everything in step 4's scope, read once. It is too much for one run (about 130
  lines before the feed tables, growth tables and server range checks), so it is done one rotation
  group per run on consecutive runs, and `sources.md` § Next run names the groups still unread.
- **Quarterly** (January, April, July, October): every row of `sources.md`, and one rotation group.
  `sources.md` § Next run holds the due date; a session that opens this skill after that date says so.
- **Before a rule set is added or changed** (for example a `CR-P-` paediatric block): the sources
  that rule set cites.
- **When Pp or the TPN team hears of a new edition:** that source alone.

## Steps

### 1. Establish what the ward is running

The audit is of production, the code a prescriber uses today, and `main` can be ahead of it. Three
checks, each with its own verdict in the report:

1. **Frontend.** `git fetch origin release main`, then `node tools/verify-release.mjs`. A pass means
   both hosts serve the tip of `release` byte for byte, so `origin/release` is the live frontend.
2. **Rule file against the live code.** Add a worktree of `origin/release` under
   `C:\Users\USER\repos\neofeed-wt\` (`git worktree add --detach`), run
   `node test/verify-clinical-rules.cjs` in it with `NODE_PATH` set to the main checkout's
   `node_modules` folder, and remove the worktree when the run ends. Green means the rule file at `release` describes the
   live calculator. From here on, "the rule file", `data.js` and the register are the copies at
   `release`.
3. **Backend.** The server holds its own stops and bounds. With `clasp` already signed in,
   `clasp list-deployments` gives the version the ward's deployment runs; that listing is the
   truth, and `STATUS.md` is only what someone last wrote. In a scratchpad folder holding a copy of
   the repo's `.clasp.json`, `clasp pull --versionNumber <that version>` and compare the file with
   `gas-backend.gs` at `origin/release`. Identical: `backend matches release`. Different: report
   the difference to Pp at once and stop, as for checks 1 and 2. If `STATUS.md` names another
   version, add `STATUS behind` to the verdict and go on. Read only: no `clasp push`, no deployment
   change, and no sign-in on Pp's behalf. Without `clasp`, the verdict is `backend not checked`.
   Deployment and script IDs stay out of the audit file and the report.

Then list what `main` holds that production does not: `git diff origin/release origin/main` on
`data.js`, `calculator.jsx`, `gas-backend.gs`, the rule file and the register. A number that differs
between the two is audited at its `release` value and noted as "changed on main, not live".

Go on to the audit only when checks 1 and 2 pass and check 3 has not found a difference. A failure of either is the finding of the run,
because nobody then knows which rules the ward has: report it to Pp at once and stop. A red harness
is reported as it is; the rule file and its cases are left untouched.

### 2. Look for a newer edition of every source in scope

For each row of `sources.md`, search for a revision, an erratum, a superseding guideline or a
withdrawal dated after the edition in use. Use the row's watch point, PubMed (the title, then the
society name with "guideline" and the topic, limited to dates after the edition), and one general
web search. A product label is checked at the regulator in its row, by its revision date; where
the row records no revision date for the edition in use, write today's revision date into "Result"
as the baseline and give the verdict `same edition`. A row with two regulators gets a verdict for
each. A row whose watch point is a person (the TPN pharmacist, the department) is not searched: it
goes in the report as a question for Pp to pass on.

The searches may be handed to read-only agents. What they bring back counts only with the URL and
the words on the page; the run's reader opens that URL before writing a verdict of `newer edition`
or `erratum`.

Also search once per run for a source NeoFeed does not cite yet: a new guideline on paediatric or
neonatal parenteral or enteral nutrition from ESPGHAN, ESPEN, ASPEN, the Thai Pediatric Nutrition
Society, the Royal College of Pediatricians of Thailand, NICE, WHO or the AAP.

Each row ends with exactly one verdict, with the URL it rests on:

| Verdict | Meaning |
|---|---|
| `same edition` | At least two routes searched; nothing newer |
| `newer edition, read` | Full text opened; step 3 done |
| `newer edition, not read` | A newer edition exists; its full text could not be opened |
| `erratum` | A correction to the edition in use; step 3 done |
| `withdrawn` | The issuer has withdrawn or replaced it without a successor |
| `could not check` | Fewer than two routes worked; each route tried is listed |
| `ask` | The watch point is a person |

A row that was `could not check` or `newer edition, not read` on the previous run and is again on
this one goes to Pp as its own item, with what she would need to get it (a library request, a
society login, a question to the pharmacist).

### 3. Read what changed

For `newer edition` or `erratum`, open the full text (not the abstract, a news item or a summary).
List every recommendation or table value that differs from the edition in use, with the
recommendation or table number and page in both editions. A new edition can leave every cited
number as it was and still move the pages: list those as "citations to update" with the old and new
page, so the rule file's page references can follow when Pp adopts the edition.

Full texts never go into this repo: it is public and they are copyrighted. Work from the URL or
from a copy in the session scratchpad. Keeping a copy in Pp's own folders is her choice; ask.

### 4. Audit the coded numbers against the sources

The numbers to audit sit in three places, all read at `release`:

1. **The rule file:** every `CR-` rule. Search it for each row's cite keys to find the rules a
   source supports.
2. **The register:** every row of `docs/CLINICAL_CONSTANTS.md`, the ones the rule file leaves out
   included (`ENTERAL_TARGETS`, the feed tables). A row whose "Next review" has passed, or names a
   revision step 2 found, is listed as due.
3. **`data.js` and `gas-backend.gs` outside the rule file:** what the rule file lists under "Not in
   this file" (the "TPN ทั้งหอ" flags, growth references and velocity), the Reference page's tables
   (`ESPGHAN_TARGETS` and the cells `tools/reference-tabs.json` gives a unit for), the feed table
   `EN_DB` cell by cell, and the server's range checks (`_checkRange`), which cite no guideline and
   are read one call at a time. Search `data.js` for each row's cite keys.

Scope: on a baseline run, all of it. On a quarterly run, every number whose source changed in step
3, plus the next rotation group in `sources.md`. Before a rule-set change, every number that set
touches.

For each number, compare the coded value, unit and age or weight band with what the source prints
now, on the page, and write a line in `audits/<date>.md`:

`rule or constant | source and location | coded at release | the source prints | verdict`

Verdicts: `matches`, `differs`, `source silent` (the passage does not hold the value), `no source`
(none is named, or the source is a person's decision), `source not on file`, `not read this run`
(on file, but the run did not get to it; it stays in scope for the next run). A rule with several
sources gets one line per source. A rule that already has a `Q` is read again like any other; its
line adds the Q number, and a difference the Q does not describe is a new one.

Done when every number in scope has a line, and the audit file ends with a coverage list naming
what was in scope and not read.

### 5. A second reader reads the same passages, unprompted

Give a new agent the left two columns of `audits/<date>.md` only (the rule or constant, and the
source and location) for every line that is not `matches`, plus one `matches` line in five, picked
across sources. It writes down the value, unit and band it reads at each location. It is not shown
the first reader's values, the coded values or the verdicts. Use the `fresh-eyes-review` skill where
the session has it; where it does not, brief a new agent with exactly that list and the source
locations, or ask Pp to open a fresh session for it.

Then compare. A line where both readers read the same thing is **confirmed**. A line where they
differ, or the second reader could not find the passage, is **unconfirmed**: both readings go in the
audit file, and the line goes to Pp as unconfirmed. The same second read covers every
`newer edition` and `erratum` value from step 3.

### 6. Write the result

- `audits/<date>.md`: complete, with both readers' columns and step 1's three verdicts at the top.
- `sources.md`: today's date and the verdict in "Last checked" and "Result" on every row checked;
  the next rotation group; the next due date. "Edition in use" stays as it is: it changes only in
  the `neofeed-clinical-rules` PR in which Pp adopts a new edition.
- The rule file, for **confirmed** lines only: one new `Q` under "Questions for Pp" per `differs`,
  `source silent` or `no source` that no existing Q describes, naming the rule, both values and both
  citations, and the Q's number added to that rule's block where the block lists its questions.
  Nothing else in the rule file changes: the coded value, the cases and the wording stay.
- A constant outside the rule file with a confirmed difference goes in the report and in the
  register's notes for that row; its value stays.
- `CHANGELOG.md`: one entry for the run.
- A new source NeoFeed should cite goes in the report only; Pp decides whether it joins `sources.md`.

Which PR: a quarterly or one-source run is its own piece of work and its own PR (check
`gh pr list --state open` first, and run `node tools/run_checks.js --level ci --phase pre`). A run
made before a rule-set change belongs to that change, and its edits go in that change's PR. No dose
file is in either.

### 7. Report to Pp

In Thai, shortest first: whether production was confirmed (step 1's three verdicts); how many
sources were checked and how many could not be; each new edition and whether its full text was
read; each confirmed difference, with the coded number and the source's number side by side and
which way the source moved; what is unconfirmed; register rows due for review; what needs a person.
Ask her which questions to take to the rule owner or the TPN team. A change she approves is then
made with `neofeed-clinical-rules` and the register's change protocol.

## Rules of evidence

- The Clin Nutr 2018 PDFs (the ESPGHAN PN chapters) print µ as "m" and a range dash as "e" in the
  text layer. Both readers take every value from those chapters from the rendered page image. Other
  PDFs are read from the image where a unit could be µg or mg, a band uses < or >, or a table's
  cells run together.
- A number comes from a page opened in this run. Memory, a search snippet and an abstract are leads,
  and a lead is written as a lead (`sources.md` § Leads), never in a row's "Result".
- Cite the way the rule file does: first author and recommendation number for ESPGHAN 2018, PDF page
  for the Thai CPG, the regulator and revision date for a label.
- Two sources that disagree are reported as two rows. Reconciling them is Pp's.
- A session that cannot reach a full text held on Pp's PC records `could not check` for that source.
- A patient, a ward's data and anything in `LocalOnly` have no place in a watch run.
