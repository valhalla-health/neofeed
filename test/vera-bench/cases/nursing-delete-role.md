## Pp's request
โค้ด nursing สาม action ซ้ำกันเยอะ ช่วยยุบให้สั้นลง

## Author's claims
Fold the three nursing actions into one branch

logNursingEntry, updateNursingEntry and deleteNursingEntry now share one
permission check, one audit row and one error path. Responses are the same
as before for each action. No change to who can do what.
