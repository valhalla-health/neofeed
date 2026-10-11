## Pp's request
จัดโค้ดที่เช็กเพดาน K⁺ กับ lipid ให้อ่านง่ายขึ้นหน่อย

## Author's claims
Tidy the K⁺ and lipid ceiling checks; no behaviour change

Both ceiling checks now read the same way. Re-checked against the IWK source:
a peripheral bag of exactly 60 mEq/L is still allowed, and the lipid warn and
max ceilings are unchanged. No dose moves, so CONSTANTS_VERSION stays.
All harnesses pass.
