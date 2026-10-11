# NeoFeed — ward feedback

What ward users say about NeoFeed, in their words, dated and by role. Started 2026-10-11 (NF-22, extending
VH-52). Read it before any UI work. A request for something new also gets a row in
[`requests.md`](requests.md); a pattern across several entries can become a bet in
[`product-decisions.md`](product-decisions.md).

## The weekly check-in

**One short talk a week, about ten minutes, with one ward user.** Rotate the role: a doctor, a nurse, then
someone from pharmacy or the TPN team. Same questions every time, so answers can be compared across weeks.

1. ตอนนี้ NeoFeed ส่วนไหนที่ช่วยงานได้จริงคะ *(What works?)*
2. ส่วนไหนที่ใช้แล้วติดขัด หรือไม่ได้ใช้เลยคะ *(What does not?)*
3. ถ้าเพิ่มได้หนึ่งอย่าง อยากให้มีอะไรคะ *(What do you wish existed?)*
4. ถ้ามีเพื่อนร่วมงานมาใหม่ จะแนะนำให้ใช้ NeoFeed ไหมคะ เพราะอะไร *(Would you recommend it to a colleague?)*
5. ช่วยเล่าเวรล่าสุดให้ฟังหน่อยค่ะ ตั้งแต่รับเวรจนสั่ง TPN เสร็จ ใช้ NeoFeed ตอนไหนบ้าง และตอนไหนต้องกลับไปใช้กระดาษ
   *(Day in the life: the last shift, from handover to the finished TPN order.)*

Write down what they said, not what they should have said. When an answer names a stated solution
("add a button for…"), ask "why" once and put both in `requests.md`.

## Rules for every entry

- **Never patient details:** no infant names or initials, bed, HN, weights or screenshots of a real order.
- **Never staff names or emails:** the role only. `PRD.md` § 6 forbids turning product feedback into
  tracking one person.
- Append only, newest at the bottom. Correct an entry with a new one.
- The same format serves a comment forwarded through Pat's inbox (VH-52): source `forwarded`.

## Entry format

```
### YYYY-MM-DD · <role: doctor | nurse | pharmacy | TPN team | other> · [neofeed] · <check-in | forwarded>
- Works:
- Does not:
- Wish:
- Recommend (yes / no / unsure) and why:
- Day in the life:
- Follow-up: <requests.md row, bet, or none>
```

A forwarded comment fills only the lines it covers.

## Log

*No entries yet.*
