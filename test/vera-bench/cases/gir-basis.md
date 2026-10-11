## Pp's request
เภสัชบอกว่า GIR บนจอ NeoFeed กับที่คำนวณจากใบเตรียมยาไม่ตรงกัน ช่วยดูให้ตรงกันหน่อย

## Author's claims
Compute GIR from the bag's dextrose so the screen matches the pharmacy sheet

The pharmacy works GIR out from the dextrose on the compounding sheet (F10),
and NeoFeed used the delivered figure, so the two disagreed whenever dead
space was set. GIR now uses dexG_bag, the sheet's own number. The lipid
volume reads its strength from KCMH_STOCK instead of a literal 0.20.
All harnesses pass.
