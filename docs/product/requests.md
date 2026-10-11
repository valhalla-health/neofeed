# NeoFeed — ward requests

What the ward asked for, the problem behind it, the options and what was decided. Started 2026-10-11
(NF-21) from requests the repo already records; each row cites its source. Bets built from a request go in
[`product-decisions.md`](product-decisions.md).

## How a row is written

1. **Asked for:** the stated solution, in the ward's words where the repo has them.
2. **Problem:** ask "why" once and write the answer. When nobody asked, the cell says `TODO(Pp)`.
3. **Options:** A, B, C, with ★ on the one Pp recommends.
4. **Status:** **build**, **later (date)** or **no**. A *later* item is built only if the ward asks for it
   again; when it comes back, add the new date to its row instead of opening a second one.

No patient details in any cell: no names, beds, HN or screenshots of a real order.

## Requests

| # | Date · from | Asked for | Problem (one "why") | Options (★ Pp's pick) | Status | Source |
|---|---|---|---|---|---|---|
| R1 | 2026-09-18 · NICU team | "ติ๊ก MEN แล้ว ไม่ต้องเอาไปคิดสารอาหารได้ไหม": leave a MEN feed out of the nutrient totals | A trophic feed was counted into energy and electrolytes, so a TPN with no calcium read "Calcium off target" | ★ A: MEN counts toward no total and is shown greyed. B, C: not recorded | build (PR #77) | `CHANGELOG.md` 2026-09-18 (2) § 1 |
| R2 | 2026-09-22 · TPN team | "อยากให้มีชื่อหมอที่ key": the prescriber's name on the order | The team needs to reach the doctor when an order has a problem; a reprint showed only an email | ★ A: keep the saver's "Name (email)" with each save and print it. B, C: not recorded | build | `CHANGELOG.md` 2026-09-22 (4) § 6 |
| R3 | 2026-09-22 · TPN team | A zinc field, maximum 5 mg/day, with a confirm | TODO(Pp) | ★ A: ZnSO₄ in mg elemental Zn/kg/d, as on the paper form, critical above 5 mg/day. B, C: not recorded | build | `CHANGELOG.md` 2026-09-22 (4) § 1 |
| R4 | 2026-09-28 · TPN team, items 7–8 | Feed brand and concentration chosen separately; a second feed with its own volume | The fixed 50 : 50 "FBM 24 ↔ Infatrini 30" pair cannot write breast milk alternating with formula at unequal counts | TODO(Pp) (needs a design Pp signs off) | TODO(Pp) | `BACKLOG.md` § Now, TPN meeting, C · 7 · 8 |
| R5 | 2026-09-28 · TPN team, items 9 and 28 | A tick per red alert before Print, and a signature box on the front sheet | TODO(Pp). Today a typed reason at Submit is the only record | TODO(Pp) | TODO(Pp) | `BACKLOG.md` § Now, TPN meeting, C · 9 · 28 |
| R6 | 2026-09-28 · TPN team, items 19 and 27 | A pharmacist view: how many TPN orders, and which to compound | Pharmacy cannot tell a submitted order (compound it) from a draft that may be waiting for labs | TODO(Pp). Joins "Pharmacist role" in `BACKLOG.md` § Later | TODO(Pp) | `BACKLOG.md` § Now, TPN meeting, C · 19 · 27 |

The rest of the TPN team's 28 requests sit in `BACKLOG.md` § Now in three groups (A built in PR #129, B
waiting for the team's numbers, C design). A row moves here when it needs a decision on options.
