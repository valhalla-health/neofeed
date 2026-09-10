# NeoFeed architecture diagrams

Eraser-ready graphical notation for NeoFeed's current production architecture.
The diagrams are based on `app-walkthrough.md` sections 2–6,
`gas-backend.gs`'s `doPost()` action routing, and `STATUS.md` as of
2026-08-22.

No patient-level or staff-level data is included.

## Files

1. `neofeed-system-architecture.eraserdiagram`
   - Deployment boundary, frontend components, backend services, identity,
     session management, and Google Sheets storage.
2. `neofeed-sheet-erd.eraserdiagram`
   - Conceptual ERD for `Patient_Registry`, `Daily_Log`, `Staff`, and
     `Audit_Log`.
3. `neofeed-daily-log-sequence.eraserdiagram`
   - Hybrid login, forced password change, initial synchronization, courtesy
     edit lock, and optimistic-concurrency save flow.

## Rendered diagrams

The `rendered/` folder contains presentation-ready output:

- `neofeed-system-architecture.svg` and `.png`
- `neofeed-sheet-erd.svg` and `.png`
- `neofeed-daily-log-workflow.svg` and `.png`

The SVG files remain editable in vector-design applications. The matching
Graphviz `.dot` files are the deterministic source used for these renders.

Run `render-diagrams.cjs` with the bundled Node dependencies to regenerate all
six image files after changing a `.dot` source.

## Open in Eraser

### VS Code extension

Open a `.eraserdiagram` file directly. Its first line declares the diagram
type.

### Eraser web app

1. Create or open an Eraser file.
2. Insert **Diagram as Code**.
3. Choose the matching diagram type.
4. Paste everything below the first line of the corresponding file.

The matching types are:

- `cloud-architecture-diagram`
- `entity-relationship-diagram`
- `sequence-diagram`

## Modeling notes

- `sessionId` is an immutable pseudonymous patient key after issuance.
- Google Sheets does not enforce foreign-key constraints. ERD relationships
  describe how NeoFeed joins and validates records in application code.
- `Audit_Log.sessionId` can be blank for actions such as a registry read.
- The `CacheService` edit lock is advisory. The real lost-update protection is
  `Daily_Log.lastModified` checked against `expectedLastModified`.
- The client has no route to `pseudonymizePatient`; it remains an admin backend
  capability invoked manually.
- `usageMetrics()` is intentionally omitted from the runtime request path
  because it is not exposed by `doPost()`.
