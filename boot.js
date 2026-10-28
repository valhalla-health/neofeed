// NeoFeed boot — the first script in <head> of both HTML shells.
//
// These two blocks were inline <script>s in the shells until the 2026-09-17
// build step. They moved into this same-origin file so the Cloudflare CSP can
// drop 'unsafe-inline' from script-src without hash bookkeeping. Plain script,
// never compiled: what is here is what the browser runs. tools/build.mjs
// writes the ?v= token that loads it; do not edit that token by hand.
//
// ── 1 · GitHub Pages retirement guard ─────────────────────────────────────
// NeoFeed's GitHub Pages host is being retired in favor of Cloudflare —
// see BACKLOG.md and STATUS.md § Response headers. This must stay the
// very first script in <head>, before any <link> that fetches something
// (manifest, icons, fonts), so a GitHub Pages visitor never loads the app
// shell at all — just bounces straight to moved.html. Cloudflare visitors
// never match this hostname, so this is a no-op for them.
//
// The trailing dot is stripped first: "valhalla-health.github.io." is the
// same host to DNS and to GitHub Pages, but a different string, and it
// walked straight past an exact match into the full app (2026-09-17 review,
// SEC-F6).
//
// Before leaving, clear whatever NeoFeed ever stored on this origin
// (SEC-F5). valhalla-health.github.io is shared by every Pages site in the
// org, and storage is per origin, not per path — so old calculator prefills,
// drafts and a session token left from before the move are readable by
// five sibling sites. Every access is guarded: storage can be blocked, and
// the redirect must happen regardless.
// Wrapped so the guard adds no global name to the page the app then loads.
(function () {
  var host = window.location.hostname.replace(/\.$/, "");
  if (host !== "valhalla-health.github.io") return;
  try {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf("neofeed_") === 0) localStorage.removeItem(k);
    });
  } catch (e) {}
  try { sessionStorage.removeItem("neofeed_session"); } catch (e) {}
  window.location.replace("moved.html");
})();

// ── 2 · App config ────────────────────────────────────────────────────────
// app.jsx reads both at module scope. If this file fails to load, GAS_ON is
// false and the app falls back to LOCAL MOCK MODE, so it must stay same-origin
// and must never be excluded by .assetsignore or _config.yml.
//
// NEOFEED_GAS_URL is also named, by its full path, in _headers' connect-src.
// If the deployment ID ever changes, both change together —
// test/verify-review-0917-shell.cjs fails when they disagree.
window.NEOFEED_CLIENT_ID = "750019806043-imunne8ndetdesii70o3t1vnr0ta2br4.apps.googleusercontent.com";
window.NEOFEED_GAS_URL   = "https://script.google.com/macros/s/AKfycbz8NtHuyTdo4EP-ZKb5n5LIRqVzGSY286MZRlXMniO51xjiuQO7eOLvltsrejkL4GgV/exec";

// ── 3 · Pilot backend (NF-05) ─────────────────────────────────────────────
// pilot-neofeed.valhalla-health.workers.dev is Cloudflare's preview of the
// `pilot` branch: the release candidate that Pp and one fellow use for 48 h
// before it is promoted to `release` (REFERENCE.md § The pilot ladder). On
// that one host the app talks to the pilot deployment of the same Apps Script
// project, so a new backend version can be piloted while the ward stays on the
// old one. Every host gets these same bytes; the hostname decides.
//
// Empty until Pp creates the pilot deployment: the pilot host then uses the
// ward's backend, which is right for a release that changes no backend code.
// When it is set, the same URL goes into _headers' connect-src
// (test/verify-review-0917-shell.cjs fails when they disagree), and
// tools/dev-local.mjs blanks it in its local copy.
window.NEOFEED_PILOT_GAS_URL = "";
(function () {
  var host = window.location.hostname.replace(/\.$/, "");
  if (host === "pilot-neofeed.valhalla-health.workers.dev" && window.NEOFEED_PILOT_GAS_URL) {
    window.NEOFEED_GAS_URL = window.NEOFEED_PILOT_GAS_URL;
  }
})();
