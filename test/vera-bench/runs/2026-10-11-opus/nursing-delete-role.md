VERDICT: BLOCK
SCOPE: Access
FINDINGS:
1. 🔴 gas-backend.gs:1491 — The merged branch checks only `canWrite` for all three nursing actions. `canWrite` includes nurse and doctor (gas-backend.gs:1333), and `deleteNursingEntry` (gas-backend.gs:2733-2753) has no role check of its own. The old admin-only gate on delete is gone, so nurses and doctors can now delete Nursing_Log rows. The commit claim "No change to who can do what" is false, and the comment at gas-backend.gs:1481 ("deleted by admin only") no longer matches the code. — Put the check back inside the folded branch, before the dispatch: `if (action === "deleteNursingEntry" && user.role !== "admin") return jsonOut({ error: "Forbidden" });`
   Evidence: removed `-      if (user.role !== "admin") return jsonOut({ error: "Forbidden" });`, now only `if (!canWrite) return jsonOut({ error: "Forbidden" });` with `var canWrite = user.role === "doctor" || user.role === "admin" || user.role === "nurse";`
   Fails when: a nurse or doctor session POSTs `{ action: "deleteNursingEntry", sessionId: "AA-900", entryId: <any row> }` with nursing switched on. It returns `{ ok: true }` and deletes another clinician's I/O record. Before this change it returned `{ error: "Forbidden" }`. The UI hides the delete button for non-admins (app.jsx:2295), but that does not stop a direct POST.
TESTS TO ADD:
- test/verify-nursing-backend.cjs §2: after the nurse's refused `deleteNursingEntry` on `byDoc.entryId` → `nursingRows(g)` still contains `byDoc.entryId`, and Audit_Log has no `deleteNursingLog:start` row for `nur@kcmh.test`. Fails today because the nurse's delete now goes through, writes the start audit row and removes the row. The existing checks at lines 142-143 only compare the response, and line 146 still passes by coincidence.
NOT REVIEWED:
- I could not run the harness (no shell). Reading the code, verify-nursing-backend.cjs lines 142, 143 and 145 should fail on this branch, so CI should go red too.
- Dose, Patient data and Printed order are not touched by this diff. I checked that the audit call `logAudit(action, body.sessionId, user.email)` writes the same three action names and fields as before.
