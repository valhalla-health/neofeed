# Security policy

NeoFeed is a clinical tool used in a neonatal intensive care unit. It computes
parenteral nutrition orders that pharmacy compounds, and its backend holds
infant health data.

**Please do not open a public issue for a security problem.** Email
Valhalla.team.th@gmail.com with what you found and how to reproduce it. You
will get an acknowledgement, and a fix is treated as clinical-safety work.

Out of scope: the OAuth client ID and the Apps Script web-app URL in
`index.html` are public by design; access is enforced server-side in
`gas-backend.gs`.
