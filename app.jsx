// ============================================================
// NeoFeed — App shell
// ============================================================
const D_A = window.NEOFEED_DATA;

// First displayable character: skip Thai leading vowels (เ แ โ ใ ไ), return first consonant/letter
const THAI_LEAD = new Set(['เ','แ','โ','ใ','ไ']);
function firstChar(str) {
  if (!str) return "?";
  for (const ch of str) { if (!THAI_LEAD.has(ch)) return ch.toUpperCase(); }
  return str[0].toUpperCase();
}

// ── Config (set in NeoFeed.html window.NEOFEED_* — do NOT hardcode here) ──────
const GAS_URL  = window.NEOFEED_GAS_URL || "";
const GAS_ON   = GAS_URL.length > 10;

// ── The one GAS transport ─────────────────────────────────────
// Every request to Apps Script goes through here (2026-09-17 review, UP-S8).
// Until then each call site did its own bare fetch with no timeout at all, so
// a request Apps Script never answered left a login spinner, a Save button or
// a heartbeat hanging for as long as the tab stayed open. It also parsed the
// reply with a bare `res.json()`, and Apps Script answers quota errors and
// outages with an HTML page — which surfaced as "Unexpected token '<'" on the
// login screen, or as nothing at all.
//
// Resolves to the parsed JSON body. Rejects with a GasRequestError whose
// `kind` says what went wrong, because the caller must react differently:
//   offline     — the browser says there is no network, so nothing was sent.
//   network     — the request failed in transit. For a WRITE the result is
//                 UNKNOWN: the connection can drop after the request left.
//   timeout     — no answer within GAS_TIMEOUT_MS. Unknown for a write:
//                 Apps Script may still be executing it.
//   badResponse — an answer that is not JSON (an HTML error page). Also
//                 unknown for a write: the page can come back after the
//                 script already ran.
// `res.json()` rather than `res.text()` + JSON.parse, deliberately: the test
// harnesses' fetch doubles implement json() only.
const GAS_TIMEOUT_MS = 45000;
class GasRequestError extends Error {
  constructor(kind, message) { super(message); this.name = "GasRequestError"; this.kind = kind; }
}
function gasErrorText(kind) {
  return kind === "timeout"     ? `เซิร์ฟเวอร์ไม่ตอบกลับภายใน ${GAS_TIMEOUT_MS / 1000} วินาที`
       : kind === "badResponse" ? "เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (อาจกำลังปรับปรุงหรือใช้งานเกินโควตา)"
       : kind === "offline"     ? "อุปกรณ์นี้ออฟไลน์อยู่"
       : "ตรวจสอบการเชื่อมต่อ";
}
function gasRequest(body, { timeoutMs = GAS_TIMEOUT_MS } = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return Promise.reject(new GasRequestError("offline", gasErrorText("offline")));
  }
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer = null;
  // The race, not only the abort signal, is what enforces the deadline: a
  // response whose headers arrived but whose body never finishes is not
  // something every fetch implementation aborts cleanly.
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { ctrl && ctrl.abort(); } catch {}
      reject(new GasRequestError("timeout", gasErrorText("timeout")));
    }, timeoutMs);
  });
  const run = (async () => {
    let res;
    try {
      res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
        ...(ctrl ? { signal: ctrl.signal } : {}),
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw new GasRequestError("timeout", gasErrorText("timeout"));
      throw new GasRequestError("network", gasErrorText("network"));
    }
    let data;
    try { data = await res.json(); }
    catch { throw new GasRequestError("badResponse", gasErrorText("badResponse")); }
    if (!data || typeof data !== "object") throw new GasRequestError("badResponse", gasErrorText("badResponse"));
    return data;
  })();
  return Promise.race([run, deadline]).finally(() => clearTimeout(timer));
}

// ── Sex, as the Fenton chart needs it ─────────────────────────
// FENTON_WEIGHT/LENGTH/HC are keyed "boys"/"girls", and a Patient_Registry
// cell typed by hand ("M", "Female", "ชาย") matched neither: the Growth chart
// read FENTON_WEIGHT["M"] → undefined and took the whole app down (there is no
// error boundary), while the patient strip called that infant Female (review
// UP-S4). Normalised once, at the point records enter client state; anything
// still unrecognised is left as it is so the chart and the edit form can say
// so rather than guess.
const SEX_ALIASES = {
  boys: "boys", boy: "boys", m: "boys", male: "boys", "ชาย": "boys",
  girls: "girls", girl: "girls", f: "girls", female: "girls", "หญิง": "girls",
};
function normalizeSex(v) {
  const k = String(v == null ? "" : v).trim().toLowerCase();
  return SEX_ALIASES[k] || (v == null ? "" : v);
}

// ── Idle logout ───────────────────────────────────────────────
// A ward workstation left signed in used to stay signed in indefinitely: the
// 4-minute poll is an authenticated request, and every authenticated request
// slides the server's 6 h session window forward, so an unattended PC never
// expired (review UP-S13 / SEC-F1). Decided 2026-09-17: log out after 30
// minutes with no REAL input. Only a human counts — the poll, the edit-lock
// heartbeat and every sync are deliberately invisible to this clock.
const IDLE_LOGOUT_MS = 30 * 60 * 1000;
const IDLE_CHECK_MS  = 30000;
const IDLE_INPUT_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"];
// What the login screen says after a session ended without the user asking.
// Unsaved calculator work survives both: calculator.jsx autosaves it as a
// draft on every edit, and neither path clears neofeed_draft_*.
const SESSION_NOTICES = {
  idle:    { kind: "idle",    title: "ออกจากระบบอัตโนมัติ — ไม่มีการใช้งาน 30 นาที",
             body: "งานที่ยังไม่บันทึกถูกเก็บเป็นร่างไว้ — เข้าสู่ระบบอีกครั้งเพื่อทำต่อ" },
  expired: { kind: "expired", title: "เซสชันหมดอายุ — งานที่ยังไม่บันทึกถูกเก็บเป็นร่าง",
             body: "กรุณาเข้าสู่ระบบใหม่" },
  // gas-backend.gs's absolute 12 h cap answers Unauthorized with
  // reason "SessionMaxAge" — same logout, but "expired" would read as a fault.
  maxAge:  { kind: "maxAge",  title: "เซสชันครบ 12 ชั่วโมง — กรุณาเข้าสู่ระบบใหม่",
             body: "งานที่ยังไม่บันทึกถูกเก็บเป็นร่าง" },
};
const unauthorizedReason = (data) => (data && data.reason === "SessionMaxAge") ? "maxAge" : "expired";

// The backend's retryable refusals (added 2026-09-17; an older server never
// sends a `code`, so every branch on it is additive):
//   ServiceUnavailable — a Google service failed during auth. The session is
//                        fine: never a logout.
//   Busy               — the script lock timed out, so the write did NOT
//                        happen. Safe to retry, unlike a timeout.
//   SchemaMismatch     — the sheet's columns drifted; saves are refused. The
//                        message is the server's, shown verbatim.
//   DuplicateDate      — a create for a date that already has an entry; the
//                        reply names the existing entryId.
// The duplicate-date refusal predates `code`, so its message is matched too:
// the live server that ships before this client says only that.
const DUPLICATE_DATE_RE = /มีบันทึกของผู้ป่วยรายนี้ในวันที่/;
const isDuplicateDate = (res) => res && (res.code === "DuplicateDate" || DUPLICATE_DATE_RE.test(String(res.error || "")));

// ── Alert acknowledgment — per-device (localStorage), shared key scheme
// between the AlertCenter page and the App-level badge count so both agree
// on what's still "active" after a doctor acknowledges something on rounds.
const ackKey = (id, dol) => `${id}:${dol}`;
const readAckedMap = (sessionId) => {
  try { return JSON.parse(localStorage.getItem(`neofeed_acked_${sessionId}`)) || {}; }
  catch { return {}; }
};

// Return only an entry strictly earlier than the intended order date. This is
// important for back-filling: the most recent row overall may be from the
// future relative to the clinical day being documented.
function previousLogEntry(entries, targetDate) {
  const target = D_A.normalizeDateStr(targetDate);
  if (!target) return null;
  return (entries || [])
    .filter(entry => {
      const entryDate = D_A.normalizeDateStr(entry?.ts);
      return entryDate && entryDate < target;
    })
    .slice()
    .sort((a, b) => D_A.normalizeDateStr(a.ts).localeCompare(D_A.normalizeDateStr(b.ts)))
    .slice(-1)[0] || null;
}

// Single source of truth for "what alerts does this patient currently have" —
// used by the AlertCenter page, the nav-rail/bottom-nav badge count, and the
// admin dashboard's "Active alerts" tile. Previously each of those three had
// its own hand-rolled copy of this logic and they drifted (e.g. the badge
// never counted the electrolyte-audit reminder that the page always shows),
// so the badge silently under-counted what the Alerts page displayed.
function computeAlerts(patient, entries) {
  const alerts = [];
  const last = entries[entries.length - 1];
  if (last) {
    // Route-aware targets — the same switch log.jsx's pickTarget() uses.
    // ≥100 mL/kg/d enteral means full feeds, so the ESPGHAN 2022 enteral
    // targets apply; below that this is still a PN prescription and the 2018
    // parenteral targets do. D_A.TARGETS.protein/kcal are NOT safe here: they
    // return the enteral values unconditionally once dol > 7, which told a
    // PN-fed infant to exceed the 3.5 g/kg/d parenteral amino acid ceiling
    // while citing ESPGHAN 2018 — the guideline that sets that ceiling.
    // Legacy rows predate enVolPerKg and fall to the parenteral branch, which
    // is both pickTarget's default and the safer of the two.
    const isEN  = (last.enVolPerKg || 0) >= 100;
    const T     = isEN ? D_A.ENTERAL_TARGETS : D_A.TPN_TARGETS;
    const src   = isEN ? "ESPGHAN 2022" : "ESPGHAN 2018";
    const route = isEN ? "enteral" : "parenteral";
    // DOL re-derived from the row's own date, never read off the stored `dol`
    // column (D_A.entryDol — the same rule log.jsx's pickTarget and table
    // already follow). The stored column is a snapshot from when the row was
    // written: a row saved before the patient had an admission date froze
    // DOL 1 into itself, which here picked the DOL-1 parenteral bands
    // (protein 1.5–2.5, kcal 45–55) for an infant a week into its admission —
    // so a genuinely under-fed baby read as on target and never alerted.
    const lastDol = D_A.entryDol(patient, last);
    const tGir  = D_A.TARGETS.gir();
    const tPro  = isEN ? T.protein() : T.protein(lastDol);
    const tKcal = isEN ? T.kcal()    : T.kcal(lastDol);
    if (last.gir > tGir[1]) alerts.push({ id: "gir-high", level: "crit", title: "GIR critically high", body: `Logged GIR ${last.gir} mg/kg/min — reduce dextrose concentration.`, dol: lastDol, ref: "ESPGHAN 2018" });
    if (last.pro < tPro[0] && lastDol > 2) alerts.push({ id: "protein-low", level: "warn", title: "Protein below DOL target", body: `${last.pro} g/kg/d on DOL ${lastDol} — target ${tPro[0]}–${tPro[1]} g/kg/d (${src}, ${route}).`, dol: lastDol, ref: src });
    if (last.kcal < tKcal[0] && lastDol > 4) alerts.push({ id: "kcal-low", level: "warn", title: "Energy below growth target", body: `${last.kcal} kcal/kg/d — target ${tKcal[0]}–${tKcal[1]} kcal/kg/d for DOL ${lastDol} (${src}, ${route}).`, dol: lastDol, ref: src });
  }

  // Growth velocity — from patient.weights (Fenton chart data, most reliable).
  // Length/HC-only rows carry no `w` — exclude them from this reasoning.
  const wts = (patient.weights || []).filter(w => w.w != null);
  if (wts.length >= 2) {
    const recent = wts.slice(-Math.min(wts.length, 7));
    const wFirst = recent[0], wLast = recent[recent.length - 1];
    const dW = wLast.w - wFirst.w;
    const days = Math.max(1, wLast.dol - wFirst.dol);
    const avgKg = (wFirst.w + wLast.w) / 2 / 1000;
    const vel = dW / days / avgKg;
    if (vel < 15) alerts.push({
      id: "growth-velocity",
      level: vel < 10 ? "crit" : "warn",
      title: vel < 10 ? "Growth velocity critically low" : "Growth velocity below target",
      body: `${vel.toFixed(1)} g/kg/d over ${days} d (DOL ${wFirst.dol}→${wLast.dol}) — target ≥15 g/kg/d (ESPGHAN 2022 ≥17–20 for catch-up).`,
      dol: wLast.dol, ref: "ESPGHAN 2022"
    });
  }

  // Stale weight: warn when no weight measurement in 3+ days
  const lastWtEntry = D_A.lastWeighed(patient);
  const todaysDol = D_A.liveDol(patient);
  if (lastWtEntry) {
    const daysSince = todaysDol - lastWtEntry.dol;
    if (daysSince >= 3) {
      alerts.push({
        id: "weight-stale",
        level: daysSince >= 7 ? "crit" : "warn",
        title: daysSince >= 7 ? "Weight measurement >7 days overdue" : "Weight measurement stale",
        body: `Last weight ${lastWtEntry.w} g on DOL ${lastWtEntry.dol} — ${daysSince} days ago. ESPGHAN: daily weights for VLBW/ELBW infants.`,
        dol: todaysDol, ref: "ESPGHAN 2022"
      });
    }
  }

  // Standing protocol reminder — NOT a computed finding. NeoFeed stores no
  // serum electrolyte results anywhere, so it cannot know when the last draw
  // was; the previous wording ("Last serum electrolytes >72 h ago") asserted
  // that anyway, on every patient, in the same visual language as the alerts
  // that ARE computed. Keep it phrased as the reminder it is until an actual
  // electrolyte-draw date is captured and this can be derived.
  alerts.push({ id: "electrolyte-audit", level: "info", title: "Electrolyte review — protocol reminder", body: "KCMH protocol: review serum electrolytes at least weekly while on PN. NeoFeed does not track draw dates — check the chart.", dol: last ? D_A.entryDol(patient, last) : undefined, ref: "KCMH protocol" });

  return alerts;
}
function activeAlertCount(patient, entries) {
  const acked = readAckedMap(patient.sessionId);
  return computeAlerts(patient, entries).filter(a => !acked[ackKey(a.id, a.dol)]).length;
}

// ============================================================
// SyncGate — the first-load screen
// ============================================================
// Shown only while the FIRST sync of a session is still in flight (App's gate
// below explains why only the first). Everything a nurse can tell about the
// app at that moment, they tell from this screen, so it does three jobs the
// bare spinner it replaced did none of:
//
//   1. **Says how long it has been.** A spinner with no clock is the same
//      picture at 2 s and at 40 s. The elapsed seconds appear once the wait
//      stops being ordinary (SYNC_SLOW_AFTER_MS), not before — a counter that
//      starts at 0 s every load is noise on the ~95% of loads that finish
//      before anyone reads it.
//   2. **Explains a slow one.** The two real causes are an Apps Script cold
//      start and ward wifi, and they want different reactions, so the copy
//      names both rather than blaming the app. See SYNC_VERY_SLOW_AFTER_MS.
//   3. **Offers a way out.** A fetch that never settles left no control on
//      screen at all — the only exit was reloading the tab. "ลองใหม่" re-runs
//      the sync without losing the session.
//
// It never shows patient data and never lets the user past — that is the whole
// point of the gate (mock patients must not be interactable before real ones
// arrive). Offline is a distinct state rather than a spinner, because a
// spinner over a dead network is a lie the ward would sit and watch.
//
// Thai-first, like the rest of the clinical copy. Inline styles + one <style>
// for the keyframes, following the banner's rule: a change that needs no CSS
// in NeoFeed.html/index.html cannot desync the two hand-synced shells.
const SYNC_SLOW_AFTER_MS      =  6000;
const SYNC_VERY_SLOW_AFTER_MS = 15000;

function SyncGate({ online, failed, detail, onRetry }) {
  // One tick a second, and only while it matters — the component unmounts the
  // moment the first sync lands, so this never runs under the workspace.
  const [elapsed, setElapsed] = React.useState(0);
  const startRef = React.useRef(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 1000);
    return () => clearInterval(t);
  }, []);

  const slow     = elapsed >= SYNC_SLOW_AFTER_MS;
  const verySlow = elapsed >= SYNC_VERY_SLOW_AFTER_MS;
  const secs     = Math.floor(elapsed / 1000);
  // Offline and "the request came back an error" are different problems with
  // different fixes, and neither is "still loading" — don't spin over either.
  const stalled  = !online || failed;

  const head = !online ? "ไม่ได้เชื่อมต่อเครือข่าย"
             : failed  ? "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ"
             : "กำลังโหลดข้อมูลผู้ป่วย";
  const sub  = !online ? "อุปกรณ์นี้ออฟไลน์อยู่ — ตรวจสอบ Wi-Fi ของ ward แล้วลองใหม่"
             : failed  ? "เซิร์ฟเวอร์ไม่ตอบกลับ — กด “ลองใหม่” หรือแจ้ง admin หากยังไม่สำเร็จ"
             : verySlow ? "ใช้เวลานานกว่าปกติ — เซิร์ฟเวอร์ Apps Script อาจกำลังเริ่มทำงาน (cold start) หรือสัญญาณ Wi-Fi อ่อน"
             : slow     ? "กำลังซิงก์จาก Google Apps Script"
             : "กำลังเชื่อมต่อ Google Apps Script";

  const accent = !online ? "var(--crit)" : failed ? "var(--crit)" : "var(--brand)";

  return (
    <div style={{
      position:"fixed", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
      background:"var(--bg)", fontFamily:"'IBM Plex Sans','Noto Sans Thai',sans-serif",
      padding:"24px calc(20px + env(safe-area-inset-right, 0px)) calc(24px + env(safe-area-inset-bottom, 0px)) calc(20px + env(safe-area-inset-left, 0px))",
      overflowY:"auto",
    }}>
      {/* min() keeps the card off both edges of a 320px phone and stops it
          stretching into a letterbox on a 1440px workstation. */}
      <div role="status" aria-live="polite" style={{
        width:"min(380px, 100%)", boxSizing:"border-box",
        background:"var(--surface)", border:"1px solid var(--line)",
        borderRadius:"var(--r-lg)", boxShadow:"var(--shadow-pop)",
        padding:"28px 24px 22px", textAlign:"center",
      }}>
        {/* Brandmark — the topbar's logo, at rest. Gives the screen an owner:
            "NeoFeed is loading", not "a page is loading". */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:20 }}>
          <div style={{
            width:34, height:34, borderRadius:9, display:"grid", placeItems:"center",
            background:"linear-gradient(145deg, var(--brand-3) 0%, var(--brand) 55%, var(--brand-ink) 100%)",
            boxShadow:"inset 0 -2px 0 oklch(26.8% 0.030 170 / .45), 0 2px 8px oklch(38.5% 0.047 170 / .28)",
          }}>
            <svg viewBox="0 0 28 28" width="20" height="20" fill="none" stroke="#fff"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 21 V 7 L 21 21 V 7" />
              <circle cx="21" cy="7" r="2.2" fill="#fff" stroke="none" />
            </svg>
          </div>
          <div style={{ fontSize:19, fontWeight:600, letterSpacing:"-0.01em", color:"var(--ink)" }}>NeoFeed</div>
        </div>

        {/* Indeterminate bar rather than a ring: it reads as "something is
            still happening" at a glance from a metre away, which is the
            distance a workstation is actually looked at. It stops moving when
            the sync has stalled — a bar still sliding under "ออฟไลน์" would
            say the opposite of the words next to it. */}
        <div style={{
          height:4, borderRadius:999, background:"var(--line-2)",
          overflow:"hidden", marginBottom:18, position:"relative",
        }}>
          {stalled
            ? <div style={{ position:"absolute", inset:0, background:accent, opacity:0.45 }} />
            : <div className="sg-bar" style={{
                position:"absolute", top:0, bottom:0, width:"40%", borderRadius:999,
                background:"linear-gradient(90deg, transparent, var(--brand), transparent)",
              }} />}
        </div>

        <div style={{ fontSize:15, fontWeight:600, color:"var(--ink)", marginBottom:6, lineHeight:1.4 }}>
          {head}
        </div>
        <div style={{ fontSize:12.5, color:"var(--ink-3)", lineHeight:1.55 }}>
          {sub}
        </div>
        {/* The server's own words when it gave any (a quota page, a Google
            auth outage) — something concrete to read out to admin. */}
        {online && failed && detail && (
          <div style={{ marginTop:8, fontSize:12, color:"var(--crit)", lineHeight:1.5 }}>
            {detail}
          </div>
        )}

        {/* The clock, from SYNC_SLOW_AFTER_MS on. Tabular figures so the card
            doesn't reflow on every tick as the digits change width. */}
        {(slow || stalled) && (
          <div style={{
            marginTop:14, fontSize:11.5, color:"var(--ink-4)",
            fontVariantNumeric:"tabular-nums", fontFeatureSettings:"'tnum'",
          }}>
            รอมาแล้ว {secs} วินาที
          </div>
        )}

        {/* Retry waits until SYNC_VERY_SLOW_AFTER_MS — offering it at 6 s
            invites a second request the first one was about to make redundant.
            A stalled sync gets it immediately, since waiting changes nothing
            there. Full width and 44px: on a phone this is the only control on
            screen, pressed by someone already mildly annoyed. */}
        {(verySlow || stalled) && (
          <button className="btn primary" onClick={onRetry} style={{
            marginTop:16, width:"100%", minHeight:44, justifyContent:"center",
            fontSize:13.5, fontWeight:600,
          }}>
            ลองใหม่
          </button>
        )}

        <div style={{
          marginTop:18, paddingTop:14, borderTop:"1px solid var(--line-2)",
          fontSize:10.5, color:"var(--ink-4)", letterSpacing:"0.02em",
        }}>
          V2.0 · ESPGHAN 2018/2022
        </div>
      </div>

      {/* prefers-reduced-motion: the bar holds still instead of sliding. A
          vestibular trigger on the one screen nobody can navigate away from
          is not a fair trade for a loading animation. */}
      <style>{`
        @keyframes sg-slide { 0% { left: -40%; } 100% { left: 100%; } }
        .sg-bar { animation: sg-slide 1.15s cubic-bezier(.4,0,.6,1) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .sg-bar { animation: none; left: 0; width: 100%; opacity: .45; }
        }
      `}</style>
    </div>
  );
}

// sessionStorage can throw on every access — a browser or group policy that
// blocks site storage makes the getter itself raise SecurityError. Login used
// to die on the unguarded write right after a successful server reply
// ("The operation is insecure."), review UP-S12. Storage is a convenience that
// survives a reload; the session itself lives in App state (userRef below).
function writeSession(u) {
  try { sessionStorage.setItem("neofeed_session", JSON.stringify(u)); } catch {}
}
function clearSession() {
  try { sessionStorage.removeItem("neofeed_session"); } catch {}
}

// ── AppRoot — the session boundary ────────────────────────────
// Logging out used to be `setUser(null)` on the same <App/> instance, so every
// other piece of state — patients, log, the open view and ward, lastSync, an
// admin's archive — was still there for whoever logged in next. A nurse
// logging in after an admin landed straight on the admin dashboard with the
// archive on screen, and the first-load SyncGate was skipped because
// `lastSync` was already set (review SEC-F2). Now every end of a session
// (logout, expiry, idle) remounts App under a new key: React discards the
// whole tree and its state, the same clean slate a reload gives, without
// losing the one thing that must survive it — the notice telling the next
// person at this PC why they are looking at the login screen.
function AppRoot() {
  const [epoch, setEpoch] = React.useState(0);
  const [notice, setNotice] = React.useState(null);
  const onSessionEnd = React.useCallback((n) => { setNotice(n || null); setEpoch(e => e + 1); }, []);
  const onNoticeSeen = React.useCallback(() => setNotice(null), []);
  return <App key={epoch} notice={notice} onSessionEnd={onSessionEnd} onNoticeSeen={onNoticeSeen} />;
}

// ── Error boundary ────────────────────────────────────────────
// There was none, so any exception thrown while rendering — one malformed
// field in one infant's record, one unanticipated shape from the server —
// unmounted the entire tree and left the ward with a blank white page and no
// way back except a reload that often rendered the same record again
// (BACKLOG "There is no error boundary"; instances hit 2026-08-18 and in the
// 2026-09-17 review: unknown sex on the Growth chart, `weights:[null]`).
// Two layers:
//   • `variant="view"` wraps the workspace only, so the rail, topbar, sync
//     and the patient list stay usable while one view is broken, and it
//     clears itself when the user moves to another view or patient
//     (`resetKey`), instead of trapping them on the error;
//   • `variant="root"` wraps everything, for a throw outside the workspace.
// Render errors only: event handlers and async code already report through
// toasts. Saved data is never affected by a render error, and the calculator
// autosaves unsaved typing as a draft for the same user, which the fallback
// says — the person at the bedside needs to know whether to re-enter an order.
class ViewErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error("NeoFeed: a view failed to render", error, info && info.componentStack);
  }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const root = this.props.variant === "root";
    return (
      <div role="alert" className="card" style={{ padding: "24px 20px", maxWidth: 520, margin: root ? "12vh auto" : "24px auto", textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--crit, #b3261e)", marginBottom: 6 }}>
          {root ? "NeoFeed แสดงผลไม่ได้" : "หน้านี้แสดงผลไม่ได้"}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 16, lineHeight: 1.6 }}>
          ข้อมูลที่บันทึกแล้วไม่ได้รับผลกระทบ · งานที่ยังไม่บันทึกในหน้าคำสั่ง (Calc) ถูกเก็บเป็นร่างไว้
          {root ? " — กดโหลดใหม่ ถ้ายังเกิดซ้ำให้แจ้ง admin" : " — ลองกลับไปหน้ารายชื่อผู้ป่วย หรือโหลดใหม่ ถ้ายังเกิดซ้ำกับผู้ป่วยรายนี้ให้แจ้ง admin"}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {!root && this.props.onGoRegistry &&
            <button className="btn" onClick={() => { this.setState({ error: null }); this.props.onGoRegistry(); }}>กลับไปหน้ารายชื่อผู้ป่วย</button>}
          <button className="btn primary" onClick={() => location.reload()}>โหลดใหม่</button>
        </div>
        <details style={{ marginTop: 14, fontSize: 11, color: "var(--ink-3)", textAlign: "left" }}>
          <summary style={{ cursor: "pointer" }}>รายละเอียดสำหรับผู้ดูแลระบบ</summary>
          <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{String(error && error.message || error)}</code>
        </details>
      </div>
    );
  }
}

// A patient-scoped view opened with no patient selected (bottom nav, rail)
// rendered an empty workspace — nothing on screen at all (review UP-S10).
const PATIENT_VIEWS = ["log", "calculator", "fenton", "alerts"];
function NoPatientCard({ onPick }) {
  return (
    <div className="card" style={{ padding: "28px 20px", textAlign: "center", maxWidth: 460, margin: "24px auto" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>ยังไม่ได้เลือกผู้ป่วย</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 16, lineHeight: 1.5 }}>
        หน้านี้แสดงข้อมูลของผู้ป่วยทีละราย — เลือกผู้ป่วยก่อน
      </div>
      {/* className="btn", no inline height: the shell's touch blocks lift it
          to 44px on phones and tablets. */}
      <button className="btn primary" onClick={onPick} style={{ justifyContent: "center", minWidth: 160 }}>
        <Icon name="search" size={14} color="#fff" /> เลือกผู้ป่วย
      </button>
    </div>
  );
}

function App({ notice = null, onSessionEnd, onNoticeSeen } = {}) {

  // user = { name, role, email, token } — stored in sessionStorage (clears on tab close)
  // Login screen removed — default to a stub user so the app skips the gate.
  // sessionStorage is still honored for compatibility with prior real Google sessions.
  const [user, setUser] = React.useState(() => {
    try {
      const s = sessionStorage.getItem("neofeed_session");
      if (s) return JSON.parse(s);
    } catch {}
    // GAS_ON → require real Google login; local dev → stub user
    return GAS_ON ? null : { name: "Local user", role: "doctor", email: "", token: "" };
  });
  const role     = user?.role || null;
  const authName = user?.name || "";
  // The live session for callbacks that must not close over a stale `user`.
  // syncFromGAS used to read the token back out of sessionStorage for exactly
  // that reason, which made the whole app depend on storage being available
  // (UP-S12). Assigned during render, so it is current before any effect runs.
  const userRef = React.useRef(user);
  userRef.current = user;

  // Patient registry — empty until GAS sync completes (prevents mock patient identity confusion)
  const [patients, setPatients] = React.useState(GAS_ON ? [] : D_A.MOCK_PATIENTS);
  const [log, setLog] = React.useState(GAS_ON ? {} : D_A.MOCK_DAILY_LOG);
  const [activeId, setActiveId] = React.useState(null);
  const [view, setView] = React.useState("registry");
  // Which view the quick calc was opened from, so its ← กลับ goes back where
  // the user actually was rather than dumping them at the registry mid-round.
  // Not persisted: the quick calc holds nothing worth returning to.
  const [quickFrom, setQuickFrom] = React.useState(null);
  // Which ward the registry is showing. null = show the ward gate, which is
  // deliberately the state every session starts in: the unit runs NICU and
  // SCN as two censuses, and the first thing a shift does is say which one it
  // is working. Held here rather than inside PatientRegistry so navigating to
  // the Dashboard and back doesn't drop the user at the gate again mid-round;
  // not persisted, so a fresh load always asks.
  const [ward, setWard] = React.useState(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [syncState, setSyncState] = React.useState(GAS_ON ? "loading" : "local"); // local | loading | ok | error
  const [lastSync, setLastSync] = React.useState(null);
  // What the last failed sync said, for the pill's tooltip and SyncGate — a
  // bare "Sync error" gave nobody anything to report.
  const [syncError, setSyncError] = React.useState("");
  // Admin-only, off by default, never persisted (review UP-S14). The sync used
  // to send `includeArchived: role === "admin"` on every request, so every
  // admin device pulled the whole discharged archive every four minutes to
  // show a registry that hides it. Now the archive comes down only while an
  // admin has asked for it on the admin dashboard, and only for this session.
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const includeArchivedRef = React.useRef(false);
  includeArchivedRef.current = includeArchived;
  // Network reachability, as the browser reports it. Deliberately separate
  // from syncState: "the fetch failed" and "this device has no network" are
  // different problems and send the user to different fixes.
  const [online, setOnline] = React.useState(
    typeof navigator === "undefined" || navigator.onLine !== false);
  // Ticks so the staleness banner ages in place. Without it the banner only
  // re-evaluated when something else re-rendered App, so a tab sitting idle
  // (the exact case that produces stale data) would never show the warning.
  const [staleTick, setStaleTick] = React.useState(0);
  const [calcWeights, setCalcWeights] = React.useState({});
  React.useEffect(() => { setCalcWeights({}); }, [activeId]); // reset typed weight on patient switch

  // Which existing log entry the Calculator is editing (null = creating a new entry).
  // Cleared on any ordinary navigation so it never bleeds into an unrelated Calculator visit.
  const [editEntry, setEditEntry] = React.useState(null);
  // Back-date for a brand-new entry (YYYY-MM-DD, null = today) — set when the
  // user picks "เลือกวันที่ย้อนหลัง" on the Dashboard's log button.
  const [logDate, setLogDate] = React.useState(null);
  React.useEffect(() => { setEditEntry(null); setLogDate(null); }, [activeId]);
  const goTo = (v) => { setEditEntry(null); setLogDate(null); setView(v); };

  const active = patients.find((p) => p.sessionId === activeId);
  const lastWt = active?.weights?.slice(-1)[0];
  // DOL = admissionDOL + daysSinceAdmit — single source of truth (data.js → liveDol)
  const dol = D_A.liveDol(active);

  // Bumped whenever AlertCenter acknowledges something for the active patient,
  // so this memo (which reads localStorage directly) knows to recompute.
  const [ackVersion, setAckVersion] = React.useState(0);

  const alertCount = React.useMemo(() => {
    if (!active) return 0;
    return activeAlertCount(active, log[active.sessionId] || []);
  }, [active, log, dol, ackVersion]);

  // ── GAS fetch (initial + manual sync) ────────────────────────
  // Token is sent in POST body — never in URL (prevents token leakage in server logs)
  // Shared by syncFromGAS and gasPost — the two independent request paths in
  // this file. Since 2026-08-21 the server refuses every action except
  // changePassword while Staff col G is set (gas-backend.gs's doPost gate).
  // In the normal flow the client never meets that refusal: App renders
  // <ChangePasswordModal forced> before any request goes out. It shows up when
  // col G is flagged **mid-session** — this browser still holds
  // mustChangePassword:false from its login response. Flipping the flag
  // re-renders into the same forced modal the login path would have produced,
  // and persisting it means a reload does not bounce straight back out.
  // Deliberately NOT a logout: the session is still valid, it just cannot do
  // anything until the password is replaced.
  const flagPasswordChangeRequired = React.useCallback(() => {
    setUser(u => {
      if (!u || u.mustChangePassword) return u;
      const flagged = { ...u, mustChangePassword: true };
      writeSession(flagged);
      return flagged;
    });
  }, []);

  // ── Ending a session ─────────────────────────────────────────
  // One path for all three ways a session ends, so none of them can forget a
  // step (review SEC-F2 / UP-S7 / UP-S13):
  //   manual  — the user chose ออกจากระบบ. Revoke the token, clear every
  //             neofeed_* clinical key on this device, drafts included (PDPA
  //             data minimisation on a shared NICU workstation).
  //   idle    — 30 min with no input. Revoke and clear the same, EXCEPT
  //             drafts: this user did not choose to abandon that order.
  //   expired / maxAge — the server already refused the token. Nothing to
  //             revoke; browser storage is left as it always was on expiry.
  // Then AppRoot remounts App, which is what actually wipes the previous
  // user's patients, log, view, ward and sync state off the screen.
  // Held in a ref so the sync/write callbacks can end a session without
  // depending on its identity.
  //
  // endedRef: set once this session has ended, so a request that was already
  // on its way (or a handler still running in the same tick) does nothing more.
  const endedRef = React.useRef(false);
  const endSession = React.useCallback((reason) => {
    // Once only, per App instance. A request this session sent before it ended
    // can still come back — a sync refused as Unauthorized because the logout
    // just revoked its token — and without this it would end the NEXT user's
    // session too: AppRoot's remount does not care which instance asked.
    if (endedRef.current) return;
    endedRef.current = true;
    const tok = userRef.current?.token || "";
    if (GAS_ON && tok && (reason === "manual" || reason === "idle")) {
      gasRequest({ action: "logout", token: tok }, { timeoutMs: 10000 }).catch(() => {});
    }
    clearSession();
    if (reason === "manual" || reason === "idle") {
      const prefixes = reason === "manual"
        ? ["neofeed_calc_", "neofeed_acked_", "neofeed_draft_"]
        : ["neofeed_calc_", "neofeed_acked_"];
      try {
        Object.keys(localStorage)
          .filter(k => prefixes.some(p => k.startsWith(p)))
          .forEach(k => localStorage.removeItem(k));
      } catch {}
    }
    try { if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect(); } catch {}
    if (onSessionEnd) onSessionEnd(SESSION_NOTICES[reason] || null);
    else setUser(null);
  }, [onSessionEnd]);
  const endSessionRef = React.useRef(endSession);
  endSessionRef.current = endSession;

  // ── Idle logout (30 min, decided 2026-09-17) ─────────────────
  // Registered before the sync effects below, so on a tab coming back after
  // half an hour the idle check runs before the focus refresh would pull
  // patient data onto the screen of whoever just sat down.
  const lastInputRef = React.useRef(Date.now());
  React.useEffect(() => {
    if (!GAS_ON || !user) return;
    lastInputRef.current = Date.now();
    const mark = () => { lastInputRef.current = Date.now(); };
    const check = () => {
      if (Date.now() - lastInputRef.current >= IDLE_LOGOUT_MS) endSessionRef.current("idle");
    };
    const opts = { capture: true, passive: true };
    IDLE_INPUT_EVENTS.forEach(t => window.addEventListener(t, mark, opts));
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const t = setInterval(check, IDLE_CHECK_MS);
    return () => {
      IDLE_INPUT_EVENTS.forEach(ev => window.removeEventListener(ev, mark, opts));
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      clearInterval(t);
    };
  }, [user?.email]);

  // Guards on the ONE request path that replaces client state wholesale.
  //
  // syncFromGAS has seven callers — four automatic (login, tab focus, day
  // rollover, the poll below) and three manual (the topbar button, the
  // banner's Sync now, SyncGate's retry) — and until 2026-09-16 no request had
  // any identity at all. Two in flight at once is not hypothetical: focus plus
  // the manual button, a second apart, against an Apps Script backend that can
  // take seconds to answer.
  //
  // `syncSeqRef` is the correctness half. Both responses call
  // setPatients/setLog unconditionally, so the LAST to arrive won rather than
  // the NEWEST: a slow request landing after a fast one silently rolled the
  // registry back to older data, with a fresh green "GAS · HH:MM" beside it
  // saying it was current. Every response now carries its own request's
  // sequence number and is dropped if a later request has been issued since.
  //
  // `inFlightRef` is only an economy measure, and it is deliberately NOT an
  // early return inside syncFromGAS: a fetch that never settles (Apps Script
  // occasionally just doesn't answer) would wedge it on forever and swallow
  // every later sync — including the "Sync now" button and SyncGate's retry,
  // the two controls someone reaches for precisely because a sync appears
  // stuck. Superseding is always safe, so a manual sync always goes through;
  // the AUTOMATIC callers skip while one is in flight, since they have nobody
  // waiting on them. It holds the request's start time rather than a boolean
  // so that even for them it expires: a request still unanswered after
  // SYNC_INFLIGHT_MAX_MS stops suppressing the poll, or one hung fetch would
  // silently end background syncing for the rest of the shift.
  const SYNC_INFLIGHT_MAX_MS = 60000;
  const inFlightRef = React.useRef(0);
  const syncSeqRef  = React.useRef(0);
  const syncInFlight = React.useCallback(
    () => inFlightRef.current > 0 && Date.now() - inFlightRef.current < SYNC_INFLIGHT_MAX_MS, []);
  // Round-trip of the last completed sync, in ms. Read by the topbar pill's
  // tooltip — a number the ward can quote when reporting "it's slow", instead
  // of everyone guessing. Not state: it must not re-render anything.
  const syncMsRef   = React.useRef(null);

  // ── Writes vs. the sync that replaces everything (review UP-S3) ─────────
  // syncSeqRef orders syncs against syncs, and nothing ordered them against
  // WRITES. A sync issued before Save was pressed returns a snapshot taken
  // before the row existed, and applying it wholesale deleted the entry the
  // nurse had just saved: the Dashboard said "No log entries yet", the
  // registry said NEEDS ENTRY, and saving again was refused by the server's
  // one-entry-per-date guard — the saved entry was unreachable until the next
  // poll. Every data write now registers here:
  //   writeGenRef     bumps when a write starts,
  //   pendingWritesRef counts writes still waiting for an answer.
  // A sync response is applied only if no write was pending when that sync was
  // issued AND none has started since; otherwise it is dropped (it may predate
  // a write) and a fresh sync goes out once every write has settled.
  //
  // unknownWriteRef is the other half (UP-S8 / UP-B10): a write whose answer
  // never came back readable — timeout, dropped connection, HTML error page —
  // may or may not have landed. Rolling its optimistic change back and letting
  // the user press Save again is how a duplicate gets made; keeping it and
  // pretending it saved is how a lost order looks saved. Neither: leave the
  // optimistic state as it is, re-sync, and let the server's snapshot decide —
  // an applied sync replaces patients and log wholesale, which keeps what
  // landed and drops what did not. Until that sync lands, further writes are
  // refused with a message saying why.
  const writeGenRef          = React.useRef(0);
  const pendingWritesRef     = React.useRef(0);
  const resyncAfterWritesRef = React.useRef(false);
  const unknownWriteRef      = React.useRef(false);
  const syncRef              = React.useRef(null);
  const beginWrite = React.useCallback(() => {
    writeGenRef.current++;
    pendingWritesRef.current++;
    let done = false;
    return (res) => {
      if (done) return;
      done = true;
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      if (res && res.unknown) unknownWriteRef.current = true;
      // A server refusal means this device's picture disagrees with the
      // sheet's (a bed taken elsewhere, an entry already there, a deleted
      // session) — pull the sheet's version once the writes are done.
      if (res && !res.ok && res.refused) resyncAfterWritesRef.current = true;
      if (pendingWritesRef.current === 0 && (resyncAfterWritesRef.current || unknownWriteRef.current)) {
        resyncAfterWritesRef.current = false;
        if (!endedRef.current && syncRef.current) syncRef.current();
      }
    };
  }, []);

  // ── Backoff for automatic syncs during an outage (review UP-S6) ─────────
  // The poll's own gate is "SYNC_POLL_MS since the last SUCCESSFUL sync", and
  // a failure never moves that — so while Apps Script was down, every 30 s
  // tick was due and fired another request (20 in ten minutes from one tab,
  // each one an Audit_Log attempt against a backend already in trouble). Now
  // consecutive failures back off 1 → 2 → 4 min, capped at SYNC_POLL_MS.
  // Manual syncs (the Sync buttons, SyncGate's retry) never wait.
  const syncFailsRef       = React.useRef(0);
  const lastSyncAttemptRef = React.useRef(0);
  const syncBackingOff = React.useCallback(() => {
    const fails = syncFailsRef.current;
    if (!fails) return false;
    const wait = Math.min(D_A.SYNC_POLL_MS, 30000 * Math.pow(2, fails));
    return Date.now() - lastSyncAttemptRef.current < wait;
  }, []);

  // The patient records exactly as this device last received them from the
  // server, by sessionId — the `base` half of the three-way merge contract
  // with gas-backend.gs (review UP-S1). See handleEditPatient.
  const serverPatientsRef = React.useRef(new Map());
  // Sequence number of the last sync whose snapshot was applied.
  const appliedSeqRef = React.useRef(0);

  const syncFromGAS = React.useCallback(() => {
    if (!GAS_ON || endedRef.current) return;
    const startedAt = Date.now();
    inFlightRef.current = startedAt;
    lastSyncAttemptRef.current = startedAt;
    const seq = ++syncSeqRef.current;
    const genAtStart = writeGenRef.current;
    const pendingAtStart = pendingWritesRef.current;
    // A response from a superseded request must not touch state at all; the
    // request that superseded it owns both the state and the flag.
    const stale = () => seq !== syncSeqRef.current || endedRef.current;
    const settle = () => {
      inFlightRef.current = 0;
      syncMsRef.current = Date.now() - startedAt;
    };
    const failed = (msg) => {
      syncFailsRef.current++;
      setSyncError(msg || "");
      setSyncState("error");
    };
    setSyncState("loading");
    const u = userRef.current || {};
    gasRequest({
      action: "getActivePatients", token: u.token || "",
      // The server returns only patients within its sync window (active, or
      // discharged ≤30 days) unless an admin asks for the archive — admins
      // handle data-subject requests and readmissions. The server re-checks
      // the role; this flag alone grants nothing. Sent only while an admin
      // has switched the archive on (UP-S14).
      includeArchived: u.role === "admin" && includeArchivedRef.current,
    })
      .then(data => {
        if (stale()) return;
        settle();
        // Auth expired → end the session: back to the login screen, with every
        // piece of the previous user's state gone (SEC-F2) and a notice saying
        // why (UP-S7).
        if (data.error === "Unauthorized") {
          endSessionRef.current(unauthorizedReason(data));
          return;
        }
        // This path, not gasPost, is where a mid-session col G flag actually
        // lands: syncFromGAS is the call that fires on login, on tab focus and
        // on day rollover, and it does its own fetch. Without this branch the
        // refusal fell into the generic `data.error` case below and did nothing
        // but turn the sync pill red — the server secure, the app apparently
        // just broken.
        if (data.error === "PasswordChangeRequired") {
          flagPasswordChangeRequired();
          setSyncState("error");
          return;
        }
        if (data.error) {
          // ServiceUnavailable (a Google auth hiccup) lands here too, and on
          // purpose: it is a failed sync — backoff, red pill, the server's own
          // words — and never a logout. Said once per outage, not every retry.
          if (syncFailsRef.current === 0 && data.code) showToast(String(data.error), "error");
          failed(String(data.error));
          return;
        }

        // UP-S3: this snapshot may predate a write — drop it and ask again
        // once the writes have answered. Not a failure, so no backoff.
        if (pendingAtStart > 0 || writeGenRef.current !== genAtStart) {
          if (pendingWritesRef.current > 0) resyncAfterWritesRef.current = true;
          else if (syncRef.current) syncRef.current();
          return;
        }

        if (Array.isArray(data.patients)) {
          // Replace mock data with real GAS data (even if empty registry).
          // Bed labels are canonicalized here, at the single point every
          // patient record enters client state, so the registry cards, the
          // patient strip, the calculator's print header and the admin
          // dashboard all show one spelling without each having to normalize
          // (see D.normalizeBed — legacy rows carry "NICU 1-1"/"NICU-1").
          // Sex the same way, for the same reason (normalizeSex, UP-S4).
          // And the measurement arrays: a record already in the Sheet can hold
          // a null or non-object element (nothing validated them server-side
          // until the 2026-09-17 review, SEC-B3), and a dozen readers do
          // `x.w` / `x.dol` — one bad element blanked every device on the next
          // sync. Dropping them here keeps the ward working; the server still
          // holds the bad cell, which `sheetHealthReport()` counts, and refuses
          // edits to that record until it is corrected.
          const cleanMeasures = (arr) => Array.isArray(arr)
            ? arr.filter(x => x && typeof x === "object" && !Array.isArray(x)) : arr;
          const incoming = data.patients.map(p =>
            ({ ...p, currentBed: D_A.normalizeBed(p.currentBed), sex: normalizeSex(p.sex),
               weights: cleanMeasures(p.weights), lengths: cleanMeasures(p.lengths),
               hcs: cleanMeasures(p.hcs), bedHistory: cleanMeasures(p.bedHistory) }));
          serverPatientsRef.current = new Map(incoming.map(p => [p.sessionId, p]));
          setPatients(incoming.length > 0 ? incoming : []);
          // Never auto-pick a patient — keep the current selection only if it
          // still exists in the fresh data, otherwise fall back to none (registry list).
          setActiveId(prev => data.patients.some(p => p.sessionId === prev) ? prev : null);
        }
        // Normalize before anything reads it: Sheets hands `ts` back as a date
        // value (stringified to "Sun Aug 17 2026 …"), which never matches a
        // YYYY-MM-DD comparison, and rows arrive in insertion order rather
        // than date order. See D.normalizeLogMap.
        if (data.log) setLog(D_A.normalizeLogMap(data.log));
        // Every write this device made has now been checked against the sheet.
        unknownWriteRef.current = false;
        appliedSeqRef.current = seq;
        syncFailsRef.current = 0;
        setSyncError("");
        setSyncState("ok");
        setLastSync(new Date());
      })
      .catch(err => {
        if (stale()) return;
        settle();
        console.warn("GAS sync failed:", err);
        failed(err && err.kind ? err.message : "");
      });
  }, [flagPasswordChangeRequired]);
  syncRef.current = syncFromGAS;

  // Sync after login — fires when user changes (null → logged-in object)
  React.useEffect(() => { if (user) syncFromGAS(); }, [user?.email]);

  // Keep the registry honest without a manual refresh. The app used to fetch
  // once at login and then never again, so on a workstation left open all
  // shift the "Active / Logged today / Needs entry" strip showed whatever was
  // true when the tab was opened — entries logged from another device (or a
  // patient discharged elsewhere) simply never appeared. Refetch when the tab
  // comes back to the foreground, and when the local day rolls over.
  const today = D_A.useTodayLocal();
  const lastSyncRef = React.useRef(0);
  React.useEffect(() => { if (lastSync) lastSyncRef.current = lastSync.getTime(); }, [lastSync]);
  React.useEffect(() => {
    if (!GAS_ON || !user) return;
    const RESYNC_AFTER_MS = 60000;   // don't re-hit GAS on every tab flick
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (syncInFlight()) return;
      if (syncBackingOff()) return;
      if (Date.now() - lastSyncRef.current < RESYNC_AFTER_MS) return;
      syncFromGAS();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [user?.email, syncFromGAS, syncInFlight]);

  // ── Background poll ──────────────────────────────────────────
  // The refetch above only fires on an event the ward's own workstation never
  // raises. That machine sits on the registry, focused, for a whole shift:
  // no visibilitychange, no focus, no day rollover until midnight — so after
  // the login sync it never pulled again, and the "ข้อมูลไม่เป็นปัจจุบัน"
  // banner appeared at the 15-minute mark and then simply stayed, since the
  // only thing that could clear it was a human clicking Sync. That is the
  // reported "sync ใช้เวลานานกว่าปกติ": not a slow round trip, a sync nothing
  // ever asked for. (The screenshot that opened this: pill and rail both
  // reading 14:43, wall clock 15:02, banner at 18 minutes.)
  //
  // Every condition here is a reason NOT to spend a request, and each one is
  // load-bearing:
  //   hidden tab     — a backgrounded PWA or a second monitor's tab must cost
  //                    nothing; the focus handler above covers its return.
  //   offline        — the fetch can only fail, and a failure flips syncState
  //                    to "error", which downgrades the banner's own message
  //                    from "ออฟไลน์" to a generic stale one. Worse, not better.
  //   in flight      — see syncInFlight; the poll has nobody waiting on it,
  //                    and the check expires so a hung fetch cannot end
  //                    background syncing for the rest of the shift.
  //   synced just now— a manual Sync or a focus refresh seconds ago already
  //                    did this poll's job.
  //   backing off    — the last attempts failed; see syncBackingOff.
  //
  // setInterval, not setTimeout chaining: a laptop that suspends fires this
  // once on wake rather than accumulating a backlog, which is what we want.
  React.useEffect(() => {
    if (!GAS_ON || !user) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (syncInFlight()) return;
      if (syncBackingOff()) return;
      if (Date.now() - lastSyncRef.current < D_A.SYNC_POLL_MS) return;
      syncFromGAS();
    };
    // Checked every 30 s but only ACTS every SYNC_POLL_MS (the lastSyncRef
    // guard above). The gap matters: a tab that was hidden or offline when its
    // slot came round picks the sync up within half a minute of coming back,
    // instead of waiting out another full four.
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [user?.email, syncFromGAS, syncInFlight]);
  // ── Staleness signal ─────────────────────────────────────────
  // Two inputs, both needed. `online`/`offline` fire immediately when the
  // network drops, which is the fast path; the 30 s tick covers everything
  // else — a server that stopped answering, a session that expired, a laptop
  // that woke from sleep with the wifi still "connected" but going nowhere.
  //
  // 30 s is chosen against SYNC_WARN_MS (5 min): fine enough that the banner
  // appears within a small fraction of the threshold it is announcing, coarse
  // enough to be invisible. The interval is unconditional — a device can go
  // offline before login, and the login screen is exactly where "you have no
  // network" is the useful message.
  React.useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const t = setInterval(() => setStaleTick(n => n + 1), 30000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(t);
    };
  }, []);

  // The decision itself lives in data.js so it can be pinned by a test —
  // see test/verify-sync-freshness.cjs. This only reads it.
  // staleTick is referenced so the memo actually re-runs on the interval.
  const freshness = React.useMemo(
    () => D_A.syncFreshness({
      gasOn: GAS_ON, online, syncState,
      lastSyncMs: lastSync ? lastSync.getTime() : null,
      nowMs: Date.now(),
    }),
    [online, syncState, lastSync, staleTick]);

  // Day rollover: everything DOL- and today-derived needs re-deriving, and a
  // fresh pull makes sure the new day starts from the sheet's current truth.
  const firstDayRef = React.useRef(true);
  React.useEffect(() => {
    if (firstDayRef.current) { firstDayRef.current = false; return; }
    if (GAS_ON && user && !syncBackingOff()) syncFromGAS();
  }, [today]);

  // Ctrl/Cmd+K dispatches __open_picker (bottom of this file) and nothing was
  // listening, so the shortcut was swallowed for nothing (review UP-S17).
  // Only once the workspace is actually on screen — never over the login
  // screen, the forced password change or the first-load gate.
  const shellReadyRef = React.useRef(false);
  React.useEffect(() => {
    const open = () => { if (shellReadyRef.current) setPickerOpen(true); };
    document.addEventListener("__open_picker", open);
    return () => document.removeEventListener("__open_picker", open);
  }, []);

  // A create refused because that date already has an entry (DuplicateDate)
  // used to be a dead end: the entry was on the server, not on this device, so
  // the Dashboard could not open it. The refusal now asks for a re-sync, and
  // when that lands the existing entry is opened for editing — if the user is
  // still on that patient's new-order form. Any typed values are not lost:
  // calculator.jsx keeps them as a draft for that patient and date and offers
  // it on the entry it opens.
  const [pendingOpen, setPendingOpen] = React.useState(null);

  // ── Brand accent ─────────────────────────────────────────────
  // Was driven by tweaks-panel.jsx, a design-tool panel (postMessage to/from
  // any origin) that shipped to every clinical page load for a colour picker.
  // Removed 2026-09-11 (review C5); the default accent it always resolved to
  // stays.
  React.useEffect(() => {
    document.documentElement.style.setProperty("--brand", `oklch(38.5% 0.047 170)`);
  }, []);

  // ── Shared GAS write helper ───────────────────────────────────
  // Sorts every outcome of a request into one result shape, so a caller can
  // tell "refused" from "never sent" from "nobody knows":
  //   { ok: true, ...reply }                   landed
  //   { ok: false, conflict: true, current }   optimistic-lock conflict — no
  //                                            toast; the Calculator shows it
  //   { ok: false, unauthorized: true }        session over → login screen
  //   { ok: false, mustChangePassword: true }  see flagPasswordChangeRequired
  //   { ok: false, refused: true, code, … }    the server answered and did NOT
  //                                            write (Busy, ServiceUnavailable,
  //                                            SchemaMismatch, DuplicateDate,
  //                                            and every older refusal)
  //   { ok: false, offline: true }             nothing was sent
  //   { ok: false, unknown: true }             may or may not have landed —
  //                                            see unknownWriteRef
  // Every failure carries a Thai `error` a modal can show in place. With
  // { quiet: true } the caller shows it and no toast fires (UP-S9).
  const gasPost = React.useCallback(async (payload, { quiet = false } = {}) => {
    if (!GAS_ON) return { ok: true };
    const toast = (msg) => { if (!quiet) showToast(msg, "error"); };
    let data;
    try {
      data = await gasRequest({ ...payload, token: userRef.current?.token });
    } catch (e) {
      if (endedRef.current) return { ok: false, ended: true, error: "" };
      console.warn("GAS POST failed:", e);
      const kind = (e && e.kind) || "network";
      if (kind === "offline") {
        const error = `บันทึกไม่สำเร็จ — ${gasErrorText("offline")}`;
        toast(error);
        return { ok: false, offline: true, networkError: true, error };
      }
      const error = `ไม่ทราบผลการบันทึก — ${gasErrorText(kind)} · กำลังซิงก์ตรวจสอบกับเซิร์ฟเวอร์ก่อนให้บันทึกซ้ำ`;
      toast(error);
      return { ok: false, unknown: true, networkError: kind === "network", timeout: kind === "timeout", error };
    }
    // The answer to a request from a session that has since ended belongs to
    // nobody on screen now — no toast, no logout of whoever is signed in.
    if (endedRef.current) return { ok: false, ended: true, error: "" };
    if (data.error === "Unauthorized") {
      const reason = unauthorizedReason(data);
      if (!quiet) showToast(SESSION_NOTICES[reason].title, "error");
      endSessionRef.current(reason);
      return { ok: false, unauthorized: true, error: SESSION_NOTICES[reason].title };
    }
    // Without this the refusal would fall through to the generic handler
    // below and toast "บันทึกไม่สำเร็จ: PasswordChangeRequired" — an
    // untranslated error code — at a user with no route to the
    // change-password screen. See flagPasswordChangeRequired above.
    if (data.error === "PasswordChangeRequired") {
      flagPasswordChangeRequired();
      return { ok: false, mustChangePassword: true };
    }
    if (data.conflict) return { ok: false, conflict: true, current: data.current };
    if (data.error) {
      // SchemaMismatch is the server telling staff exactly what is wrong with
      // the sheet — shown verbatim, not wrapped in a generic prefix.
      const error = data.code === "SchemaMismatch" ? String(data.error) : `บันทึกไม่สำเร็จ: ${data.error}`;
      toast(error);
      return { ok: false, refused: true, error, code: data.code || "", retryable: !!data.retryable,
        ...(data.entryId ? { entryId: data.entryId } : {}) };
    }
    return { ok: true, ...data };
  }, [flagPasswordChangeRequired]);

  // Every DATA write goes through here, so the sync guard (beginWrite) knows
  // it is in flight. changePassword and the edit-lock heartbeat are not data
  // writes and do not.
  const writeGAS = (payload, opts) => {
    const end = beginWrite();
    return gasPost(payload, opts).then(res => { end(res); return res; });
  };

  // While an earlier write's result is unknown, a new write may be that same
  // order or registration a second time — refuse it, and make sure the sync
  // that settles the question is on its way.
  const blockedByUnknownWrite = (quiet = false) => {
    if (!GAS_ON || !unknownWriteRef.current) return null;
    const error = "ยังไม่ทราบผลการบันทึกครั้งก่อน — กำลังซิงก์ตรวจสอบกับเซิร์ฟเวอร์ รอสักครู่แล้วลองใหม่";
    if (!quiet) showToast(error, "error");
    if (pendingWritesRef.current === 0 && !syncInFlight()) syncFromGAS();
    return { ok: false, blocked: true, error };
  };

  // ── Handlers ─────────────────────────────────────────────────
  // Creates a brand-new Daily_Log row. Returns a promise resolving to
  // { ok, entryId, lastModified } so the Calculator can remember the id and
  // switch to handleUpdateToGAS for any further save within the same visit
  // (prevents the old "draft" + "submit" duplicate-row behavior).
  const handleLogToGAS = (entry) => {
    const id = active.sessionId;
    // todayLocal(), not toISOString() — the latter is the UTC date, so an entry
    // saved on night shift (before 07:00 ICT) was stamped with yesterday.
    const ts = entry.ts || D_A.todayLocal();
    const blocked = blockedByUnknownWrite();
    if (blocked) return Promise.resolve(blocked);
    // Taken before the request: the re-sync a refusal triggers is issued
    // before reconcile runs, and that is exactly the sync that must count.
    const seqAtSave = syncSeqRef.current;
    const tempId = "tmp_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const who = user?.email || "";
    // Optimistic insert under a temp id — reconciled with the real entryId below,
    // or rolled back if the write never actually lands.
    // Re-sorted on insert, not just appended: a back-filled past date would
    // otherwise sit at the end of the array, where every "latest entry" read
    // (`entries[entries.length - 1]`) would mistake it for the newest one.
    setLog(prev => ({ ...prev, [id]: D_A.normalizeLogEntries(
      [...(prev[id] || []), { ...entry, ts, entryId: tempId, lastModified: ts, submittedBy: who, lastModifiedBy: who }]) }));

    const reconcile = (res) => {
      if (res.ok) {
        setLog(prev => ({ ...prev, [id]: (prev[id] || []).map(e =>
          e.entryId === tempId ? { ...e, entryId: res.entryId, lastModified: res.lastModified } : e) }));
        showToast(`Logged DOL ${entry.dol} · ${entry.status === "submitted" ? "Submitted" : "Draft saved"}`);
      } else if (res.unknown) {
        // UP-B10: not rolled back. The provisional row stays until the
        // verification sync replaces this patient's log with the sheet's —
        // which keeps the row if it landed and drops it if it did not.
      } else {
        setLog(prev => ({ ...prev, [id]: (prev[id] || []).filter(e => e.entryId !== tempId) }));
        if (isDuplicateDate(res)) {
          setPendingOpen({ sessionId: id, entryId: res.entryId || "",
            date: D_A.normalizeDateStr(ts), afterSeq: seqAtSave });
        }
      }
      return res;
    };

    if (!GAS_ON) return Promise.resolve(reconcile({ ok: true, entryId: "local_" + tempId, lastModified: ts }));
    return writeGAS({ action: "logDailyNutrition", sessionId: id, entry: { ...entry, ts } }).then(reconcile);
  };

  // Updates an existing Daily_Log row in place (optimistic-locked by entryId+lastModified).
  // On conflict, does NOT touch local state or the caller's form — the Calculator keeps
  // whatever the user typed and decides how to surface the conflict.
  const handleUpdateToGAS = (entryId, expectedLastModified, entry) => {
    const id = active.sessionId;
    const ts = entry.ts || D_A.todayLocal();   // local date, not UTC — see handleLogToGAS
    const who = user?.email || "";
    const blocked = blockedByUnknownWrite();
    if (blocked) return Promise.resolve(blocked);

    const apply = (res) => {
      if (res.ok && res.revised) {
        // Editing a published row never overwrote it — gas-backend.gs
        // appended a new revision instead. Match that locally: mark the old
        // row superseded and add the new one, rather than overwriting the
        // old row's own content with the edit (which would show data the
        // sheet no longer agrees with until the next resync).
        // normalizeLogEntries both sorts the result AND drops the row just
        // marked superseded, so the visible list ends up exactly like a
        // fresh sync would show it.
        setLog(prev => ({ ...prev, [id]: D_A.normalizeLogEntries([
          ...(prev[id] || []).map(e => e.entryId === entryId ? { ...e, supersededAt: res.lastModified } : e),
          { ...entry, ts, entryId: res.entryId, lastModified: res.lastModified, lastModifiedBy: who,
            submittedBy: who, published: "", publishedBy: "",
            revisionNumber: res.revisionNumber, revisionOf: entryId, supersededAt: "" },
        ]) }));
        showToast(`สร้างฉบับแก้ไขใหม่สำหรับ DOL ${entry.dol}`);
      } else if (res.ok) {
        setLog(prev => ({ ...prev, [id]: (prev[id] || []).map(e =>
          e.entryId === entryId ? { ...e, ...entry, ts, lastModified: res.lastModified, lastModifiedBy: who } : e) }));
        showToast(`อัปเดต DOL ${entry.dol} แล้ว`);
      }
      // Nothing was applied before the answer, so an unknown result has
      // nothing to roll back — the verification sync shows what the row is.
      return res;
    };

    if (!GAS_ON) return Promise.resolve(apply({ ok: true, lastModified: new Date().toISOString() }));
    return writeGAS({ action: "updateDailyNutrition", sessionId: id, entryId, expectedLastModified, entry: { ...entry, ts } }).then(apply);
  };

  // Marks an existing Daily_Log row published — locks it against further
  // in-place edits (gas-backend.gs publishDailyLog; further edits go through
  // handleUpdateToGAS's res.revised branch above instead). One-directional:
  // there is no unpublish.
  const handlePublishToGAS = (entryId, expectedLastModified) => {
    const id = active.sessionId;
    const who = user?.email || "";
    const blocked = blockedByUnknownWrite();
    if (blocked) return Promise.resolve(blocked);

    const apply = (res) => {
      if (res.ok && res.alreadyPublished) {
        showToast("รายการนี้ส่งไปแล้วก่อนหน้านี้");
      } else if (res.ok) {
        setLog(prev => ({ ...prev, [id]: (prev[id] || []).map(e =>
          e.entryId === entryId ? { ...e, published: res.publishedAt, publishedBy: who } : e) }));
        showToast(`ส่งรายการเพื่อตรวจทานแล้ว`);
      }
      return res;
    };

    if (!GAS_ON) return Promise.resolve(apply({ ok: true, publishedAt: new Date().toISOString() }));
    return writeGAS({ action: "publishLog", sessionId: id, entryId, expectedLastModified }).then(apply);
  };

  // Permanently removes a Daily_Log row — admin-only (gated where this is passed
  // down to DailyLog), audited server-side. Optimistic delete with rollback on
  // a definite failure; an unknown one waits for the verification sync.
  const handleDeleteEntry = (entry) => {
    const id = active.sessionId;
    const blocked = blockedByUnknownWrite();
    if (blocked) return Promise.resolve(blocked);
    const prevEntries = log[id] || [];
    setLog(prev => ({ ...prev, [id]: (prev[id] || []).filter(e => e.entryId !== entry.entryId) }));

    if (!GAS_ON) { showToast(`ลบบันทึก DOL ${entry.dol} แล้ว`); return Promise.resolve({ ok: true }); }
    return writeGAS({ action: "deleteDailyNutrition", sessionId: id, entryId: entry.entryId }).then(res => {
      if (res.ok) showToast(`ลบบันทึก DOL ${entry.dol} แล้ว`);
      else if (!res.unknown) setLog(prev => ({ ...prev, [id]: prevEntries }));
      return res;
    });
  };

  // Permanently deletes the session — removes it from Patient_Registry and
  // every Daily_Log row for it server-side (`deletePatient` GAS action), not
  // just this browser's state. Used to be local-state-only, which looked
  // like it worked until the next sync pulled the same row straight back in
  // from the sheet (see HANDOFF.md); the confirm dialog in EditPatientModal
  // is unchanged, so it's still one deliberate click, but that click now
  // sticks. Optimistic removal with rollback on failure, same pattern as
  // handleDeleteEntry. Admin-only (gated where this is passed down to
  // EditPatientModal). If the deleted patient was active, clear the
  // selection and back out of any patient-specific view so nothing keeps
  // rendering against a sessionId that's no longer in `patients`.
  const handleDeletePatient = (patient) => {
    const id = patient.sessionId;
    const blocked = blockedByUnknownWrite();
    if (blocked) return Promise.resolve(blocked);
    const prevPatients = patients;
    const prevLog = log;
    const wasActive = activeId === id;
    setPatients(prev => prev.filter(p => p.sessionId !== id));
    setLog(prev => { const next = { ...prev }; delete next[id]; return next; });
    if (wasActive) { setActiveId(null); goTo("registry"); }

    if (!GAS_ON) { showToast(`ลบ session ${patient.name || id} แล้ว`); return Promise.resolve({ ok: true }); }
    return writeGAS({ action: "deletePatient", sessionId: id }).then(res => {
      if (res.ok) {
        serverPatientsRef.current.delete(id);
        showToast(`ลบ session ${patient.name || id} ถาวรแล้ว`);
      } else if (!res.unknown) {
        setPatients(prevPatients);
        setLog(prevLog);
        if (wasActive) setActiveId(id);
      }
      return res;
    });
  };

  // One infant per bed. The modals disable an occupied bed in the picker and
  // refuse it on save, but every one of them works off a `patients` snapshot
  // taken when it opened — on a ward with several tablets in use, the bed can
  // be taken between opening the modal and pressing save. This is the last
  // client-side point where a patient record is written, so it re-checks
  // against live state; the backend refuses it once more (registerPatient in
  // gas-backend.gs), which is the only check that sees other devices' writes.
  // Returns the message (shown inside the modal, UP-S9), or null.
  const bedConflict = (p) => {
    const holder = D_A.bedBlocker(patients, p);
    if (!holder) return null;
    return `เตียง ${D_A.normalizeBed(p.currentBed)} มี ${holder.name || holder.sessionId} อยู่แล้ว — ` +
      `ย้ายผู้ป่วยรายนั้นออกก่อน`;
  };

  // Both patient handlers return the request's promise, and the modals stay
  // open until it answers (UP-S9): they used to close the moment Register /
  // Save was pressed, so a refusal (a bed taken on another device, a duplicate
  // sessionId) was a toast over an empty screen and everything typed was gone.
  const handleAddPatient = (p) => {
    const clash = bedConflict(p);
    if (clash) return Promise.resolve({ ok: false, refused: true, error: clash });
    const blocked = blockedByUnknownWrite(true);
    if (blocked) return Promise.resolve(blocked);
    setPatients(prev => [p, ...prev]);
    setActiveId(p.sessionId);
    if (!GAS_ON) {
      showToast(`Session ${p.sessionId} registered (local)`);
      return Promise.resolve({ ok: true });
    }
    // isNew tells the backend this is a registration, not an edit, so its
    // sessionId collision guard can refuse a second infant landing on an
    // existing id (same initials + same birth weight) instead of silently
    // overwriting the first one. See _sessionIdConflict in gas-backend.gs.
    // No `base`: there is no earlier server copy to merge against.
    return writeGAS({ action: "registerPatient", patient: p, isNew: true }, { quiet: true })
      .then(res => {
        if (res.ok) {
          serverPatientsRef.current.set(p.sessionId, p);
          showToast(`Session ${p.sessionId} registered → GAS`);
        } else if (!res.unknown) {
          // A definite failure rolls the optimistic insert back. The network
          // case used to keep the patient on screen as "local only", but
          // nothing ever queued it: an order could be saved against it (the
          // server then held log rows for a patient it had never registered)
          // and the next sync silently dropped the patient (2026-09-11
          // review, B5). An UNKNOWN result is different (UP-B10): it stays
          // until the verification sync shows whether it landed, and the
          // unknown-write gate refuses any order against it meanwhile — so
          // B5 cannot come back through this door.
          setPatients(prev => prev.filter(x => x !== p));
          setActiveId(prev => (prev === p.sessionId ? null : prev));
        }
        return res;
      });
  };

  // ── Edit patient (update bed, dx, status, admitDOL) ──────────
  // `base` (review UP-S1): the record as this device last received it from
  // the server, before this edit. gas-backend.gs merges three-way — a field
  // the edit did not change (patient === base) keeps whatever the sheet holds
  // now, and measurement arrays merge per DOL. Without it the whole record was
  // written from this device's snapshot, so a transfer from a workstation that
  // had not re-synced erased a weight saved from a phone two minutes earlier,
  // and a stale diagnosis edit put a discharged infant back to Active. An older
  // server ignores the field.
  //
  // What `base` holds: the record as syncFromGAS put it into state (bed and
  // sex already normalised — the only form any modal ever saw), replaced by
  // what this device sent once a save of its own succeeds, since that is the
  // latest the server is known to hold for the fields it changed.
  const handleEditPatient = (p) => {
    const clash = bedConflict(p);
    if (clash) return Promise.resolve({ ok: false, refused: true, error: clash });
    const blocked = blockedByUnknownWrite(true);
    if (blocked) return Promise.resolve(blocked);
    const previous = patients.find(x => x.sessionId === p.sessionId);
    const base = serverPatientsRef.current.get(p.sessionId);
    setPatients(prev => prev.map(x => x.sessionId === p.sessionId ? p : x));
    if (!GAS_ON) {
      showToast(`${p.name || p.sessionId} อัปเดตแล้ว`);
      return Promise.resolve({ ok: true });
    }
    return writeGAS({ action: "registerPatient", patient: p, ...(base ? { base } : {}) }, { quiet: true })
      .then(res => {
        if (res.ok) {
          serverPatientsRef.current.set(p.sessionId, p);
          showToast(`${p.name || p.sessionId} อัปเดตแล้ว`);
        } else if (!res.unknown && previous) {
          // A refused/failed edit must not stay on screen looking saved —
          // BW and GA drive every target. Roll back only this exact edit.
          setPatients(prev => prev.map(x => x === p ? previous : x));
        }
        return res;
      });
  };

  // ── Start "add today" / "add for a past date" / "edit an entry" from the
  // Log dashboard. dateStr is only set when the user picked a back-date.
  // Duplicate-date guard: a patient can only have one Daily_Log entry per
  // calendar date. If one already exists for the requested date, don't open
  // a second blank Calculator that would create a duplicate row — link
  // straight into editing the entry that's already there instead.
  const startAddToday = (dateStr) => {
    const targetDate = dateStr || D_A.todayLocal();
    const existing = (log[activeId] || []).find(e =>
      D_A.normalizeDateStr(e.ts) === targetDate && e.entryId && !String(e.entryId).startsWith("tmp_"));
    if (existing) {
      showToast(`มีบันทึกของวันที่ ${fmtDate(targetDate)} อยู่แล้ว — เปิดให้แก้ไขรายการเดิม`);
      startEditEntry(existing);
      return;
    }
    // LogDateModal hands back today's date string for "วันนี้" too, and a
    // non-null logDate is what makes the Calculator announce a back-fill —
    // so today's ordinary order used to open under "กำลังบันทึกย้อนหลัง"
    // (found 2026-09-17 while capturing the user guide). Only a date that is
    // not today is a back-fill; today opens as a normal new order, whose date
    // the Calculator freezes itself (UP-C11).
    setEditEntry(null); setLogDate(dateStr && dateStr !== D_A.todayLocal() ? dateStr : null); setView("calculator");
  };
  const startEditEntry = (entry) => { setEditEntry(entry); setLogDate(null); setView("calculator"); };

  // The DuplicateDate follow-through (see pendingOpen). Runs on each applied
  // sync; acts only on one that landed after the refusal.
  React.useEffect(() => {
    // By sequence number, not clock: only a sync ISSUED after the refusal can
    // hold the entry that caused it.
    if (!pendingOpen || !lastSync || appliedSeqRef.current <= pendingOpen.afterSeq) return;
    const want = pendingOpen;
    setPendingOpen(null);
    const entries = log[want.sessionId] || [];
    const real = (e) => e.entryId && !String(e.entryId).startsWith("tmp_");
    const hit = (want.entryId && entries.find(e => e.entryId === want.entryId))
      || entries.find(e => real(e) && D_A.normalizeDateStr(e.ts) === want.date);
    if (!hit) return;
    if (view === "calculator" && activeId === want.sessionId && !editEntry) {
      showToast(`มีบันทึกของวันที่ ${fmtDate(want.date)} อยู่แล้ว — เปิดรายการเดิมให้แก้ไข`);
      startEditEntry(hit);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSync]);

  // ── Weight update (from Fenton chart logger) ──────────────────
  // Sends `baseWeights` — the weights array as this device last received it —
  // so the server can merge per DOL instead of replacing the whole array with
  // this device's copy (UP-S1; see handleEditPatient).
  // Returns false when the save was not attempted, so MeasurementLogger keeps
  // what was typed instead of clearing it.
  const handleWeightUpdate = (sessionId, weights) => {
    if (blockedByUnknownWrite()) return false;
    const previousWeights = patients.find(p => p.sessionId === sessionId)?.weights || [];
    const baseRecord = serverPatientsRef.current.get(sessionId);
    setPatients(prev => prev.map(p =>
      p.sessionId === sessionId ? { ...p, weights } : p
    ));
    const remember = () => {
      const rec = serverPatientsRef.current.get(sessionId);
      if (rec) serverPatientsRef.current.set(sessionId, { ...rec, weights });
    };
    if (GAS_ON) {
      // Do not leave an unsaved measurement looking authoritative. A definite
      // failure rolls back only this exact optimistic update (a newer edit made
      // while the request was in flight must win); an unknown result is left
      // for the verification sync to settle (UP-B10).
      writeGAS({ action: "updateWeights", sessionId, weights,
        ...(baseRecord ? { baseWeights: baseRecord.weights || [] } : {}) }).then(res => {
        if (res.ok) { remember(); return; }
        if (res.unknown) return;
        setPatients(prev => prev.map(p =>
          p.sessionId === sessionId && p.weights === weights ? { ...p, weights: previousWeights } : p
        ));
      });
      // Weight saves are silent on success; errors surface via gasPost's toast.
    }
  };

  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const [showChangePwd, setShowChangePwd] = React.useState(false);
  const [editingPatient, setEditingPatient] = React.useState(null);

  const handleLogout = () => endSession("manual");

  // Re-computed on every render below: true only on the render that returns
  // the workspace itself.
  shellReadyRef.current = false;

  if (!user) {
    return <LoginScreen notice={notice} onLogin={(u) => {
      writeSession(u);
      if (onNoticeSeen) onNoticeSeen();
      setUser(u);
    }} />;
  }

  // Accounts auto-provisioned with a random temp password (gas-backend.gs's
  // onEdit/backfillDefaultPasswords) come back from login with
  // mustChangePassword: true. Block everything else — including the GAS
  // sync below — until they set a real password; there's no dismiss path
  // other than logging out, since the token is already valid and would
  // otherwise grant full access on the temp password indefinitely.
  if (user.mustChangePassword) {
    return (
      <ChangePasswordModal
        forced
        onLogout={handleLogout}
        onSave={async (oldPwd, newPwd) => {
          // quiet: the modal shows a refusal in place, next to the fields.
          const res = await gasPost({ action: "changePassword", oldPassword: oldPwd, newPassword: newPwd }, { quiet: true });
          if (res.ok) {
            const updated = { ...user, token: res.token || user.token, mustChangePassword: false };
            writeSession(updated);
            setUser(updated);
            showToast("ตั้งรหัสผ่านใหม่สำเร็จ");
          }
          return res;
        }}
      />
    );
  }

  // Block the main UI until the FIRST GAS sync completes — prevents mock patients
  // from being visible or interactable before real patient data arrives.
  //
  // `!lastSync`, not `syncState === "loading"` on its own: syncFromGAS also runs
  // on tab focus (throttled to once a minute) and on day rollover, and gating
  // the whole tree on "loading" tore the app down and rebuilt it on every one of
  // those. Everything below unmounted — so a half-finished Calculator lost every
  // typed field back to its prefill, an open modal/picker closed, and the
  // accordion collapsed, merely because someone glanced at another app and came
  // back. Only the very first load has nothing to protect; after that the
  // refresh is a background one, surfaced by the topbar's own "Syncing…" pill.
  //
  // `syncState !== "ok"` rather than `=== "loading"`: a first sync that FAILS
  // leaves the state at "error" with lastSync still null, and the old gate let
  // that fall straight through to the workspace — an empty registry, rendered
  // as fact, with nothing but the topbar pill saying the fetch had failed.
  // "ยังไม่มีผู้ป่วยในระบบ" is what the ward saw when the server was down.
  // The gate now holds, and SyncGate says which of the two it is.
  if (GAS_ON && syncState !== "ok" && !lastSync) {
    return <SyncGate online={online} failed={syncState === "error"} detail={syncError} onRetry={() => syncFromGAS()} />;
  }

  shellReadyRef.current = true;
  return (
    <div className="app">
      {/* Top bar */}
      <div className="topbar">
        <div className="brandmark">
          <div className="logo">
            <svg viewBox="0 0 28 28" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 21 V 7 L 21 21 V 7" />
              <circle cx="21" cy="7" r="2.2" fill="#fff" stroke="none" />
            </svg>
          </div>
          <div>
            <div className="name">NeoFeed</div>
          </div>
        </div>

        <button
          className="switch-patient"
          onClick={() => setPickerOpen(true)}>
          <span className="sp-icon"><Icon name="search" size={13} color="var(--ink-2)" /></span>
          <span className="sp-label">Switch patient</span>
        </button>

        <div className="spacer" />

        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {/* The tooltip carries the last round trip, so "it's slow today" can
              be reported as a number. syncMsRef is a ref, but settle() writes
              it before setSyncState("ok"), so the re-render that paints the
              new time reads the matching duration. */}
          <div className="pill" data-tip={
            !GAS_ON ? "GAS_URL not configured"
            : syncState === "error" && syncError ? `Sync error · ${syncError}`
            : syncMsRef.current == null ? "Google Apps Script"
            : `Google Apps Script · ซิงก์ล่าสุดใช้เวลา ${(syncMsRef.current / 1000).toFixed(1)} วินาที`}>
            {syncState === "loading"
              ? <span className="dot dot-spin" style={{ width:7, height:7 }} />
              : <span className="dot" style={{ background:
                  syncState === "ok"    ? "var(--ok)"   :
                  syncState === "error" ? "var(--crit)" : "var(--line)" }} />
            }
            {syncState === "loading" ? "Syncing…" :
             syncState === "ok"      ? `GAS · ${lastSync ? lastSync.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }) : ""}` :
             syncState === "error"   ? "Sync error" : "Local only"}
          </div>
          {GAS_ON && (
            <button className="icon-btn" title="Sync now from GAS"
              onClick={() => syncFromGAS()}
              style={{ opacity: syncState === "loading" ? 0.4 : 1, pointerEvents: syncState === "loading" ? "none" : "auto" }}>
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" />
                <polyline points="14,2 14,5 11,5" />
              </svg>
            </button>
          )}
        </div>



        <div style={{ position: "relative" }}>
          <div className="user" onClick={() => setShowUserMenu(m => !m)} style={{ cursor: "pointer" }} title="เมนูผู้ใช้">
            <div className="av">{firstChar(authName || user?.email || "?")}</div>
            <div>
              <div className="name">{authName || user?.email || "—"}</div>
              <div className="role">{role === "admin" ? "Administrator · KCMH" : "Neonatology · KCMH"}</div>
            </div>
          </div>
          {showUserMenu && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 4px 16px #0002", minWidth: 170, zIndex: 999, overflow: "hidden" }}>
              {user?.authMethod !== "google" && <>
                <button className="btn" style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0, padding: "10px 14px", fontSize: 13 }}
                  onClick={() => { setShowChangePwd(true); setShowUserMenu(false); }}>
                  🔑 เปลี่ยนรหัสผ่าน
                </button>
                <div style={{ height: 1, background: "var(--line)" }} />
              </>}
              <button className="btn" style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0, padding: "10px 14px", fontSize: 13, color: "var(--red, #c0392b)" }}
                onClick={() => { setShowUserMenu(false); handleLogout(); }}>
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Staleness banner ──────────────────────────────────────
          Shown ONLY when something is wrong. A banner that is always there
          is wallpaper, and wallpaper is what the topbar sync pill already
          became — small, peripheral, and easy to read past while typing a
          fluid balance.

          What it is for: silence about staleness is the failure mode. A round
          reading an intake/output figure that is twenty minutes old, with
          nothing on screen saying so, is "stale data appearing as current" —
          and unlike a wrong dose there is no arithmetic error to catch it.

          Inline styles, not a shell class, deliberately: NeoFeed.html and
          index.html are hand-synced and drift silently (REFERENCE.md), so a
          change that needs no CSS in either shell is a change that cannot
          desync them. The CSS variables used here already exist in both. */}
      {/* "warn" (5–15 min) is deliberately NOT a banner. The app only
          re-syncs on tab focus, so ordinary uninterrupted use crosses five
          minutes constantly — a banner there would be on screen most of the
          day and would train everyone to read past it, including on the days
          it means something. It stays a tier in syncFreshness() because it is
          a truthful description of the data's age and the topbar pill can use
          it; the banner is reserved for the two states that are actually
          actionable. If this turns out to be tuned wrong in the ward, the
          thresholds are SYNC_WARN_MS / SYNC_STALE_MS in data.js. */}
      {(freshness.level === "offline" || freshness.level === "stale") && (() => {
        // offline = writes are definitely not reaching the sheet.
        // stale    = data is old; writes are probably fine. Different colour,
        //            because they need different reactions.
        const crit = freshness.level === "offline";
        const mins = freshness.ageMs == null ? null : Math.floor(freshness.ageMs / 60000);
        const age  = mins == null ? "ยังไม่เคยซิงก์" : mins < 1 ? "ไม่ถึง 1 นาที" : `${mins} นาที`;
        const line = crit ? "var(--crit-line)" : "var(--warn-line)";
        // Two rows on a phone, one on a workstation, from a single flex box:
        // the text column is `flex: 1 1 260px`, so it takes the rest of a wide
        // banner and forces the button onto its own line below 260px + the
        // button's own width. Before this the button was pinned by
        // `marginLeft: auto` inside a wrapping row, which on a 390px screen
        // put "Sync now" alone on a second line, right-aligned, ~25px tall —
        // under the finger of someone who has just been told the numbers on
        // screen are stale. It is a 44px target now, on both layouts.
        return (
          <div role="status" aria-live="polite" style={{
            display:"flex", alignItems:"center", gap:"8px 12px", flexWrap:"wrap",
            padding:"8px 14px", fontSize:12.5, lineHeight:1.45,
            background: crit ? "var(--crit-bg)" : "var(--warn-bg)",
            color:      crit ? "var(--crit)"    : "var(--warn)",
            borderBottom: `1px solid ${line}`,
          }}>
            <span style={{ width:7, height:7, borderRadius:"50%", flex:"0 0 auto",
              background: crit ? "var(--crit)" : "var(--warn)" }} />
            {/* minWidth:0 so a long Thai sentence wraps inside the column
                instead of widening it past the banner and pushing the button
                off the edge. */}
            <div style={{ flex:"1 1 260px", minWidth:0, display:"flex",
              alignItems:"baseline", gap:"0 8px", flexWrap:"wrap" }}>
              <strong style={{ fontWeight:600 }}>
                {crit ? "ออฟไลน์ — ไม่ได้เชื่อมต่อเครือข่าย" : "ข้อมูลไม่เป็นปัจจุบัน"}
              </strong>
              <span style={{ opacity:0.95 }}>
                {crit
                  ? `ตัวเลขที่แสดงคือข้อมูลล่าสุดเมื่อ ${age} ที่แล้ว และการบันทึกจะยังไม่ถูกส่งขึ้นเซิร์ฟเวอร์ — ตรวจสอบกับแฟ้มผู้ป่วยก่อนใช้สั่งการรักษา`
                  : `ซิงก์ล่าสุดเมื่อ ${age} ที่แล้ว — กด Sync ก่อนใช้ตัวเลขนี้`}
              </span>
            </div>
            {GAS_ON && online && (
              // className="btn", so the shell's own sizing applies: 40px on a
              // desktop, and 44px under the (hover:none)(pointer:coarse) block
              // that covers every touch device. Height is deliberately NOT set
              // inline — an inline min-height would outrank that media query
              // and shrink the target back on exactly the devices it is for.
              <button className="btn sync-banner-btn" onClick={() => syncFromGAS()} disabled={syncState === "loading"}
                style={{ padding:"0 14px", justifyContent:"center", gap:6,
                  background:"transparent", color:"inherit", fontSize:12.5, fontWeight:600,
                  border:`1px solid ${line}`, borderRadius:6,
                  cursor: syncState === "loading" ? "default" : "pointer",
                  opacity: syncState === "loading" ? 0.55 : 1 }}>
                {syncState === "loading"
                  ? <span className="dot dot-spin" style={{ width:7, height:7 }} />
                  : null}
                {syncState === "loading" ? "กำลังซิงก์…" : "Sync now"}
              </button>
            )}
          </div>
        );
      })()}

      {/* Rail */}
      <nav className="rail">
        <div className="rail-section">Workspace</div>
        <RailItem icon="users" label="Patients" active={view === "registry"} count={patients.length} onClick={() => goTo("registry")} />
        <RailItem icon="log" label="Dashboard" active={view === "log"} count={(log[activeId] || []).length} onClick={() => goTo("log")} />
        {(role === "doctor" || role === "nurse") && <RailItem icon="calc" label="Calculator" active={view === "calculator"} onClick={() => goTo("calculator")} />}
        <RailItem icon="chart" label="Growth chart" active={view === "fenton"} onClick={() => goTo("fenton")} />
        <RailItem icon="bell" label="Alerts" active={view === "alerts"} count={alertCount || null} crit={alertCount > 0} onClick={() => goTo("alerts")} />
        {role === "admin" && <RailItem icon="chart" label="Admin dashboard" active={view === "admin"} onClick={() => goTo("admin")} />}

        <div className="rail-section">Reference</div>
        <RailItem icon="info" label="Guidelines (ESPGHAN)" active={view === "guidelines"} onClick={() => goTo("guidelines")} />
        <div className="rail-item" style={{ opacity:0.45, cursor:"default", pointerEvents:"none" }}>
          <Icon name="info" size={15} />
          <span>Drug compatibility</span>
          <span className="count" style={{ marginLeft:"auto", fontSize:10 }}>soon</span>
        </div>
        <RailItem icon="info" label="Formulas + products" active={view === "formulas"} onClick={() => goTo("formulas")} />

        <div className="rail-foot">
          {/* Bound to the real sync state — this said "just now" permanently,
              beside a staleness banner built to say otherwise (review F8). */}
          <div className="conn"><span className="dot" style={{ background:
            freshness.level === "ok" ? "var(--ok)" : freshness.level === "local" ? "var(--line)"
            : freshness.level === "warn" ? "var(--warn)" : "var(--crit)" }} />
            {!GAS_ON ? "Local only"
              : lastSync ? `Sync · ${lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Not synced"}</div>
          <div style={{ marginTop: 4 }}>V2.0 · ESPGHAN 2018/2022</div>
        </div>
      </nav>

      {/* Workspace */}
      <main className="work">
        <div className="work-inner">
          <ViewErrorBoundary variant="view" resetKey={`${view}|${activeId || ""}`} onGoRegistry={() => goTo("registry")}>
          {/* Banner: GAS connected but no real patients yet */}
          {GAS_ON && syncState === "ok" && patients.length === 0 && (
            <div style={{ padding:"12px 16px", background:"var(--brand-bg)", border:"1px solid var(--brand-line)",
              borderRadius:8, marginBottom:14, fontSize:13, color:"var(--brand-2)", display:"flex", alignItems:"center", gap:10 }}>
              <Icon name="info" size={14} color="var(--brand)" />
              ยังไม่มีผู้ป่วยในระบบ — ไปที่ <strong>Patients</strong> เพื่อลงทะเบียนผู้ป่วยใหม่
            </div>
          )}
          {view !== "registry" && active &&
          <PatientStrip patient={active} onSwitch={() => setPickerOpen(true)} liveWeight={calcWeights[activeId] || null} currentDol={dol} onEdit={() => setEditingPatient(active)} />
          }
          {/* The modal waits for the server and closes itself on success (UP-S9). */}
          {editingPatient && <EditPatientModal patient={editingPatient} patients={patients} onClose={() => setEditingPatient(null)}
            onSubmit={handleEditPatient}
            onDelete={role === "admin" ? handleDeletePatient : undefined} />}

          {view === "registry" && <PatientRegistry patients={patients} activeId={activeId} role={role} log={log} ward={ward} onWardChange={setWard} onSelect={(id) => {setEditEntry(null);setActiveId(id);setView("log");}} onAdd={handleAddPatient} onEdit={handleEditPatient} onDelete={role === "admin" ? handleDeletePatient : undefined} />}
          {/* Role-checked here as well as in the rail: `view` is plain state,
              and before sessions remounted App an admin's "admin" view was
              still selected for the next user of the tab (SEC-F2). */}
          {view === "admin" && role === "admin" && <AdminDashboard patients={patients} log={log} lastSync={lastSync}
            includeArchived={includeArchived}
            onToggleArchived={() => {
              includeArchivedRef.current = !includeArchived;
              setIncludeArchived(v => !v);
              // Both directions re-sync: on, to fetch the archive; off, to drop
              // it from this device again rather than keep it until the poll.
              syncFromGAS();
            }} />}
          {PATIENT_VIEWS.includes(view) && !active && (view !== "calculator" || role === "doctor" || role === "nurse") &&
            <NoPatientCard onPick={() => setPickerOpen(true)} />}
          {view === "calculator" && active && (
            <CalculatorView active={active} dol={dol} editEntry={editEntry} logDate={logDate}
              log={log} activeId={activeId} token={user?.token} role={role}
              userLabel={user?.name ? `${user.name}${user.email ? ` (${user.email})` : ""}` : (user?.email || "")}
              userEmail={user?.email || ""}
              handleLogToGAS={handleLogToGAS} handleUpdateToGAS={handleUpdateToGAS}
              handlePublishToGAS={handlePublishToGAS}
              handleDeleteEntry={handleDeleteEntry}
              goTo={goTo} setCalcWeights={setCalcWeights} />
          )}
          {view === "fenton" && active &&
          <>
              <div className="page-head">
                <div>
                  <h1>Fenton 2025 growth chart</h1>
                  <div className="sub">Plot weight, length, and HC by post-menstrual age · Fenton TR et al. 2025 (PMID 40534585)</div>
                </div>
              </div>
              <FentonChart patient={active} currentDol={dol} onUpdate={(weights) =>
                handleWeightUpdate(active.sessionId, weights)
              } />
            </>
          }
          {view === "log" && active && <DailyLog patient={active} log={log} dol={dol}
            onAddToday={startAddToday} onEditEntry={startEditEntry}
            onDeleteEntry={role === "admin" ? handleDeleteEntry : undefined} />}
          {view === "alerts" && active && <AlertCenter patient={active} log={log} onAckChange={() => setAckVersion(v => v + 1)} />}
          {/* Quick calc — no patient, no role gate: it is a calculator over a
              typed weight, it reads no record and writes nothing, so there is
              no access it could grant that the ESPGHAN reference panels below
              don't already. (The patient Calculator stays doctor/nurse — that
              one writes orders.) */}
          {view === "quickcalc" && <QuickCalcView onBack={() => goTo(quickFrom || "registry")} />}
          {view === "guidelines" && <GuidelinesPanel />}
          {view === "formulas" && <FormulasPanel />}
          </ViewErrorBoundary>
        </div>
      </main>

      {pickerOpen &&
      <PatientPicker patients={patients} activeId={activeId} onSelect={setActiveId} onClose={() => setPickerOpen(false)} />
      }

      {showChangePwd &&
      <ChangePasswordModal
        onClose={() => setShowChangePwd(false)}
        onSave={async (oldPwd, newPwd) => {
          const res = await gasPost({ action: "changePassword", oldPassword: oldPwd, newPassword: newPwd }, { quiet: true });
          if (res.ok) {
            // Backend rotates the session token on password change (invalidates
            // any other token issued for this user) — persist the new one so
            // this device doesn't get logged out by its own password change.
            if (res.token) {
              const updated = { ...user, token: res.token };
              writeSession(updated);
              setUser(updated);
            }
            showToast("เปลี่ยนรหัสผ่านสำเร็จ");
            setShowChangePwd(false);
          }
          // Returned so a refusal shows inside the modal, as the forced
          // variant's already did (UP-S5).
          return res;
        }}
      />
      }

      {view !== "quickcalc" && view !== "calculator" &&
        <QuickCalcFab onClick={() => { setQuickFrom(view); goTo("quickcalc"); }} />}

      <BottomNav
        view={view}
        setView={goTo}
        alertCount={alertCount}
        logCount={(log[activeId] || []).length}
        role={role}
      />
      {/* No #toast-host here any more: showToast keeps its own on
          document.body, so a toast survives the login screen replacing this
          tree (UP-S7). */}
    </div>);

}

// ── Daily-log edit lock ──────────────────────────────────────
// Courtesy-only presence check: acquires a short server-side lock
// (gas-backend.gs's acquireLogLock, CacheService-backed, ~90s TTL) when the
// Calculator opens for a given patient+date, heartbeats it while mounted so
// a genuine in-progress edit doesn't lapse, and releases it on unmount. If
// someone else already holds it, this does NOT block the form — it only
// surfaces who — the real safety net against a lost edit is the existing
// expectedLastModified conflict check in handleUpdateToGAS.
//
// Deliberately bypasses the shared gasPost() helper: gasPost shows an error
// toast ("บันทึกไม่สำเร็จ: ...") and force-logs-out on any server error,
// which is right for an actual save but wrong for a background heartbeat —
// it would fire on every Calculator open (e.g. against a gas-backend.gs that
// hasn't been redeployed with this action yet) for a feature that isn't
// saving anything. Any failure here (GAS off, network hiccup, unknown
// action) is silently treated as "no lock info" — fails open, no toast,
// never blocks clinical work over a courtesy feature.
const LOG_LOCK_HEARTBEAT_MS = 45000;
function useDailyLogLock(sessionId, dateStr, token) {
  const [holder, setHolder] = React.useState(null);
  React.useEffect(() => {
    if (!GAS_ON || !sessionId || !dateStr || !token) { setHolder(null); return; }
    let cancelled = false;
    // Through gasRequest for its timeout (UP-S8); any failure is still "no
    // lock info", never an error the user sees.
    const call = (action) => gasRequest({ action, sessionId, date: dateStr, token }).catch(() => null);
    const touch = () => call("acquireLogLock").then(data => {
      if (cancelled || !data) return;
      setHolder(data.locked ? (data.holder || null) : null);
    });
    touch();
    const iv = setInterval(touch, LOG_LOCK_HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
      call("releaseLogLock");
    };
  }, [sessionId, dateStr, token]);
  return holder;
}

// ── Calculator view — wraps <Calculator> with the duplicate-edit lock notice
// and the page header. A separate component (not an inline IIFE in App's
// JSX) so useDailyLogLock's hook calls follow React's rules: it only mounts
// while view === "calculator", so its own hook-call sequence is consistent
// across its own renders, independent of App's much larger render.
function CalculatorView({ active, dol, editEntry, logDate, log, activeId, token, role, userLabel, userEmail,
  handleLogToGAS, handleUpdateToGAS, handlePublishToGAS, handleDeleteEntry, goTo, setCalcWeights }) {
  // Editing an existing row re-derives its DOL from the row's date rather
  // than trusting the stored `dol` column (D_A.entryDol) — otherwise a row
  // saved before this patient had an admission date keeps re-saving that
  // wrong DOL every time it is edited, and the wizard's DOL-indexed targets
  // are computed for the wrong day.
  const displayDol = editEntry ? D_A.entryDol(active, editEntry) : (logDate ? D_A.dolAtDate(active, logDate) : dol);
  const lockDate = editEntry ? editEntry.ts : (logDate || D_A.todayLocal());
  // The order strictly before this one's date — the new day's starting point,
  // and (for new and edited orders alike) the "changes vs previous" reference.
  const previousEntry = previousLogEntry(log[activeId] || [], lockDate);
  const baselineEntry = !editEntry ? previousEntry : null;
  const holder = useDailyLogLock(active.sessionId, lockDate, token);

  return (
    <>
      <div className="page-head">
        <div>
          {editEntry && (
            <button className="login-alt-link" style={{ padding: 0, marginBottom: 4 }} onClick={() => goTo("log")}>
              ← กลับไป Dashboard
            </button>
          )}
          <h1 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {editEntry ? "แก้ไขบันทึกโภชนาการ" : "TPN + Enteral nutrition order"}
            <span className="chip brand" style={{ fontSize: 13, fontWeight: 700 }}>DOL {displayDol}</span>
          </h1>
          <div className="sub">Real-time targets vs. ESPGHAN 2018 thresholds</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => {
            document.querySelector('.work-inner')?.setAttribute('data-date', new Date().toLocaleDateString('th-TH'));
            document.dispatchEvent(new CustomEvent('__neofeed_print'));
          }}>
            <Icon name="pdf" size={14} /> Print order
          </button>
          <button className="btn" onClick={() => goTo("guidelines")}><Icon name="info" size={14} /> Reference values</button>
        </div>
      </div>

      {holder && (
        <div style={{ padding: "10px 12px", background: "var(--warn-bg)",
          border: "1px solid var(--warn-line)", borderRadius: 8, marginBottom: 10,
          fontSize: 12.5, color: "var(--warn)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="info" size={13} color="var(--warn)" />
          <span>
            <strong>{holder.name || holder.email || "ผู้ใช้งานอื่น"}</strong> กำลังเปิดบันทึกวันที่ {fmtDate(lockDate)} ของผู้ป่วยนี้อยู่ —
            หากบันทึกพร้อมกัน ระบบจะแจ้งเตือนความขัดแย้งตอนบันทึกทับ
          </span>
        </div>
      )}

      <Calculator patient={active} dol={displayDol}
        editEntry={editEntry} baselineEntry={baselineEntry} previousEntry={previousEntry}
        logDate={logDate} userLabel={userLabel}
        // The signed-in email, so calculator.jsx can offer a draft back only to
        // the user who wrote it (SEC-F3, calculator branch). Unused until then.
        userEmail={userEmail}
        onLog={handleLogToGAS} onUpdate={handleUpdateToGAS} onPublish={handlePublishToGAS}
        onSaved={() => goTo("log")}
        onDelete={role === "admin" ? (entry) => handleDeleteEntry(entry).then(res => { if (res.ok) goTo("log"); return res; }) : undefined}
        onWeightChange={(w) => setCalcWeights(prev => ({ ...prev, [activeId]: w }))} />
    </>
  );
}

// ── Quick calc — the floating-button entry ───────────────────
// Ward request 2026-09-21: "เพิ่มปุ่มขวาล่าง ให้เป็นสำหรับแคลคูเลเตอร์ ใส่ข้อมูล
// แค่น้ำหนักและคำนวณตามแคลคูเลเตอร์ได้เลย โดยข้อมูลในนี้จะไม่เซฟลงกูเกิลชีท."
//
// This is the SAME <Calculator/>, not a second one. Every dose, mL of stock,
// GIR and target band on the screen is calculator.jsx's own `calc`. A separate
// "quick" calculator would be a second implementation of KCMH's dosing
// arithmetic living beside the first, and the two would drift the first time
// either moved — in the one file in this app that prints pharmacy orders.
// What the `scratch` prop changes is only what the mode may PERSIST: no Save,
// no Submit, no unsaved-draft store, no previous-submission store, no edit
// lock, no printed pharmacy form, no Intake/Output card. Nothing in here
// reaches the Google Sheet, and nothing survives leaving the page.
//
// No patient is attached, so there is no PHI in it to protect (PDPA) and no
// Daily_Log row it could be mistaken for. Two numbers are still needed, and
// only two: the weight — typed into Step 1's "Current weight" like any other
// order — and the DOL, because every ESPGHAN band the wizard grades against
// is DOL-indexed. Without it a quick calc would quietly read day-1 protein,
// Na, K, Ca and P targets for a two-week-old.
const SCRATCH_PATIENT = Object.freeze({
  sessionId: null, name: null, initials: null,
  // bw 0 switches off calculator.jsx's birth-weight floor: with no birth
  // weight on record, the weight typed here IS the dosing weight and there is
  // nothing to floor it against. The "TPN calc. weight" override still works.
  bw: 0, ga: 0, sex: "", currentBed: "", diagnosis: "",
  weights: [], lengths: [], hcs: [],
});

// Same span the Calculator's own DOL-indexed targets distinguish (day 1, 2,
// 3–7, 8+) with room past it; a quick calc past four weeks is a growing infant
// whose bands no longer move.
const QUICK_DOL_MAX = 60;

function QuickCalcView({ onBack }) {
  const [dol, setDol] = React.useState(1);
  return (
    <>
      <div className="page-head">
        <div>
          <button className="login-alt-link" style={{ padding: 0, marginBottom: 4 }} onClick={onBack}>
            ← กลับ
          </button>
          <h1 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            Calculator
            <span className="chip" style={{ fontSize: 12, fontWeight: 700,
              background: "var(--warn-bg)", color: "var(--warn)", borderColor: "var(--warn-line)" }}>
              ไม่บันทึก
            </span>
          </h1>
          <div className="sub">ใส่น้ำหนักแล้วคำนวณได้เลย — ไม่ผูกกับผู้ป่วย ไม่เซฟลง Google Sheets</div>
        </div>
        <div className="quick-dol">
          <label htmlFor="quick-dol-input">DOL</label>
          <input id="quick-dol-input" className="num" type="number" inputMode="numeric"
            min={1} max={QUICK_DOL_MAX} step={1} value={dol}
            onChange={(e) => {
              // Empty box while retyping must not become NaN and take every
              // target band with it — hold the last real day until one is typed.
              const v = Math.round(Number(e.target.value));
              if (!isFinite(v)) return;
              setDol(Math.min(QUICK_DOL_MAX, Math.max(1, v)));
            }} />
        </div>
      </div>

      {/* No banner between the head and Step 1 (Praew, 2026-09-21: "ไม่ต้อง
          ขึ้นกรอบสีเหลืองกลาง"). The ไม่บันทึก chip and the subtitle above
          already say it on arrival, and the one place it has to be read
          rather than glanced at — next to Copy, the only way a number here
          leaves the page — still carries it, in the footer card. A third
          copy pushed Step 1 below the fold on a phone for no new
          information. */}
      <Calculator patient={SCRATCH_PATIENT} dol={dol} scratch
        editEntry={null} baselineEntry={null} previousEntry={null} logDate={null}
        userLabel="" userEmail="" />
    </>
  );
}

// ── Quick-calc floating button ───────────────────────────────
// Bottom-right on every screen size. On a phone it clears the bottom nav and
// the home-indicator inset; on a workstation it sits in the corner of the
// viewport. Hidden on the Calculator itself (you are already in it, and
// navigating away would drop an in-progress order's edit context) and on the
// quick calc, which has its own ← กลับ.
function QuickCalcFab({ onClick }) {
  return (
    <button type="button" className="quick-fab" onClick={onClick}
      aria-label="Calculator — ไม่บันทึก" title="Calculator (ไม่บันทึก)">
      {/* `calculator`, not `calc`: see icons.jsx — the filled `calc` glyph
          collapses to a plain rounded square in white at this size. */}
      <Icon name="calculator" size={22} color="#fff" stroke={1.9} />
      <span className="quick-fab-label">Calculator</span>
    </button>
  );
}

// ── Gestational/post-menstrual age formatter ─────────────────
// Input: decimal weeks (e.g. 28.43). Output: "28+3"
// Uses integer days internally → no floating point overflow (28+7 → 29+0)
// Format ISO date → Thai BE short, e.g. "15 พ.ค. 2569"
const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function fmtDate(iso) {
  if (!iso) return "—";
  // A plain calendar date is formatted from its own digits (review UP-S15).
  // `new Date("2026-09-17")` is UTC midnight, so on any device whose clock
  // zone sits west of UTC it printed the day BEFORE — the admission date on
  // the patient strip, the date in the duplicate-entry toast. Only an exact
  // YYYY-MM-DD with a real month/day takes this path; anything else (a
  // timestamp, a stringified Date from the sheet) goes through the Date
  // parsing below exactly as before.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), dd = Number(m[3]);
    // Real calendar day only (checked in UTC, so zone-free); an impossible
    // one like 2026-02-31 keeps its old handling below.
    const probe = new Date(Date.UTC(y, mo - 1, dd));
    if (mo >= 1 && mo <= 12 && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === dd) {
      return `${dd} ${THAI_MONTHS_SHORT[mo - 1]} ${y + 543}`;
    }
  }
  try {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const dd = d.getDate();
    const mo = THAI_MONTHS_SHORT[d.getMonth()];
    const yyyy = d.getFullYear() + 543; // Gregorian → พ.ศ.
    return `${dd} ${mo} ${yyyy}`;
  } catch { return iso; }
}
// Expose globally so registry.jsx / other modules can use the same formatter
window.NEOFEED_FMT_DATE = fmtDate;

// fmtGA: GA stored as WW.D shorthand (26.4 = 26 wk 4 d). Display "W+D".
// Delegates to D_A.fmtGA for single source of truth.
function fmtGA(ga) { return D_A.fmtGA(ga); }

function RailItem({ icon, label, active, count, crit, onClick }) {
  return (
    <div className={`rail-item ${active ? "active" : ""} ${crit ? "crit" : ""}`} onClick={onClick}>
      <Icon name={icon} size={15} />
      <span>{label}</span>
      {count && <span className="count">{count}</span>}
    </div>);

}

function PatientStrip({ patient, onSwitch, liveWeight, currentDol, onEdit }) {
  // `?? patient.bw` rather than trusting `last.w`: a patient whose only
  // measurements are length/HC (w: null) has no weighed entry at all, and this
  // strip is rendered above every non-registry view — reading `.w` off nothing
  // threw and took the whole app down with it, since there is no error boundary.
  const ws = patient.weights || [];
  const last = D_A.lastWeighed(patient) || ws[ws.length - 1] || null;
  const currentW = liveWeight ?? last?.w ?? patient.bw;
  // Use calculated DOL if passed, else fall back to stored value
  const displayDol = currentDol ?? last?.dol ?? 1;
  const delta = currentW - patient.bw;
  const deltaPct = delta / patient.bw * 100;
  const [wtLabel, wtColor] = patient.bw < 1000
    ? ["ELBW", "var(--crit)"]
    : patient.bw < 1500 ? ["VLBW", "var(--warn)"] : ["LBW", "var(--ink-3)"];
  const deltaColor = deltaPct < -10 ? "var(--crit)" : deltaPct < 0 ? "var(--warn-ink)" : "var(--ok)";
  return (
    <div className="patient-strip">

      {/* ── Identity ── */}
      <div className="lead">
        <div className="lbl">Active session</div>
        <div className="pid">
          <div>
            <div className="id">{patient.name || patient.initials || "—"}</div>
            <div className="bed">
              Bed <span className="num">{patient.currentBed}</span>
              {" · DOL "}
              <span className="num" style={{ color:"var(--brand-2)", fontWeight:700 }}>{displayDol}</span>
            </div>
            <div className="bed">Admit {fmtDate(patient.admissionDate)}</div>
            {onEdit && (
              <button className="btn sm" style={{ marginTop:6, fontSize:11 }}
                onClick={onEdit}>
                <Icon name="edit" size={11} /> Edit session
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── GA ── */}
      <div>
        <div className="lbl">GA at birth</div>
        <div className="val num" style={{ color:"var(--brand-2)" }}>
          {fmtGA(patient.ga)}<span style={{ fontSize:11, color:"var(--ink-3)", marginLeft:4 }}>wk</span>
        </div>
        {/* Anything but the two values normalizeSex produces is unknown —
            "M" used to read "Female" here (UP-S4). */}
        <div className="sub">{patient.sex === "boys" ? "Male" : patient.sex === "girls" ? "Female" : "—"}{patient.twinSuffix ? ` · Twin ${patient.twinSuffix}` : ""}</div>
      </div>

      {/* ── BW + Current weight — merged column ── */}
      <div style={{ padding:0, flexDirection:"row" }}>
        {/* BW — narrower half */}
        <div style={{ flex:"0 0 38%", padding:"10px 8px 10px 14px", display:"flex", flexDirection:"column" }}>
          <div className="lbl">Birth weight</div>
          <div className="val num">
            {patient.bw.toLocaleString()}<span style={{ fontSize:11, color:"var(--ink-3)", marginLeft:3 }}>g</span>
          </div>
          <div className="sub" style={{ color:wtColor, fontWeight:600 }}>{wtLabel}</div>
        </div>
        <div style={{ width:1, background:"var(--line-2)", alignSelf:"stretch" }} />
        {/* Current weight — wider half, val + delta on one line */}
        <div style={{ flex:"1 1 62%", padding:"10px 14px 10px 10px", display:"flex", flexDirection:"column" }}>
          <div className="lbl">Current weight</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:7, marginTop:1, flexWrap:"nowrap" }}>
            <span className="num" style={{ fontFamily:"IBM Plex Mono,monospace", fontSize:17, fontWeight:500, letterSpacing:"-0.01em" }}>
              {currentW.toLocaleString()}<span style={{ fontSize:11, color:"var(--ink-3)", marginLeft:3 }}>g</span>
            </span>
            <span style={{ fontSize:12, color:deltaColor, fontWeight:700, whiteSpace:"nowrap" }}>
              {delta >= 0 ? "+" : ""}{delta}g ({deltaPct.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>

      {/* ── PMA + Corrected Age ── */}
      {(() => {
        const caDays = D_A.correctedAge(patient.ga, displayDol);
        const caLabel = caDays >= 0
          ? `CA ${Math.floor(caDays / 7)}+${caDays % 7} wk`
          : null;
        return (
          <div>
            <div className="lbl">PMA</div>
            <div className="val num" style={{ color:"var(--brand-2)" }}>
              {fmtGA(D_A.pmaShort(patient.ga, displayDol))}<span style={{ fontSize:11, color:"var(--ink-3)", marginLeft:4 }}>wk</span>
            </div>
            {caLabel && <div className="sub" style={{ color:"var(--ok)", fontWeight:600 }}>{caLabel}</div>}
          </div>
        );
      })()}

      {/* ── Diagnosis + Status — merged column ── */}
      <div>
        <div className="lbl">Diagnosis</div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <div className="val" style={{ fontSize:13, lineHeight:1.3, fontWeight:700 }}>{patient.diagnosis}</div>
          <span className="chip ok" style={{ fontSize:11 }}><span className="d" />{patient.status}</span>
        </div>
      </div>

    </div>);
}

// ============================================================
// Alert center (cross-cutting view)
// ============================================================
function AlertCenter({ patient, log, onAckChange }) {
  const entries = log[patient.sessionId] || [];

  // Each alert carries a stable `id` (independent of dol/wording) — combined
  // with dol below to form the acknowledge key, so an ack only silences that
  // specific day's instance and a fresh recurrence (new dol) surfaces again.
  // computeAlerts() is the single shared source of truth (see its definition
  // near the top of this file) — also used by the nav badge and admin tile.
  const alerts = computeAlerts(patient, entries);

  // ── Acknowledge state — per-device, keyed by patient session (localStorage).
  // Not yet synced server-side (would need a new Patient sheet column); a
  // second reviewer on another device won't see this device's acknowledgments.
  const ackKeyFor = (a) => ackKey(a.id, a.dol);
  const storageKey = `neofeed_acked_${patient.sessionId}`;
  const [acked, setAcked] = React.useState(() => readAckedMap(patient.sessionId));
  React.useEffect(() => { setAcked(readAckedMap(patient.sessionId)); }, [storageKey]);
  const persistAcked = (next) => {
    setAcked(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
    onAckChange && onAckChange();
  };
  const acknowledge = (a) => persistAcked({ ...acked, [ackKeyFor(a)]: new Date().toISOString() });
  const acknowledgeAll = () => {
    const next = { ...acked };
    alerts.forEach(a => { if (!next[ackKeyFor(a)]) next[ackKeyFor(a)] = new Date().toISOString(); });
    persistAcked(next);
  };
  const activeAlerts = alerts.filter(a => !acked[ackKeyFor(a)]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alert center</h1>
          <div className="sub">Cross-cutting safety signals based on latest logged values · <span>{patient.name || patient.initials || "—"}</span></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" disabled={activeAlerts.length === 0} onClick={acknowledgeAll}>
            <Icon name="check" size={14} /> Acknowledge all
          </button>
        </div>
      </div>

      <div className="alert-summary-tiles">
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06 }}>Active critical</div>
          <div className="num" style={{ fontSize: 32, fontWeight: 500, color: "var(--crit)" }}>{activeAlerts.filter((a) => a.level === "crit").length}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06 }}>Cautions</div>
          <div className="num" style={{ fontSize: 32, fontWeight: 500, color: "var(--warn-ink)" }}>{activeAlerts.filter((a) => a.level === "warn").length}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06 }}>Info / reminders</div>
          <div className="num" style={{ fontSize: 32, fontWeight: 500, color: "var(--brand)" }}>{activeAlerts.filter((a) => a.level === "info").length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <Icon name="bell" size={14} color="var(--brand)" /> Patient alerts
          <span className="h-meta">{activeAlerts.length} active · {alerts.length} total</span>
        </div>
        <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.slice().sort((a, b) => (acked[ackKeyFor(a)] ? 1 : 0) - (acked[ackKeyFor(b)] ? 1 : 0)).map((a, i) => {
            const ackedAt = acked[ackKeyFor(a)];
            return (
            <div key={ackKeyFor(a)} className={`alert-row ${a.level}`} style={ackedAt ? { opacity: 0.5 } : undefined}>
              <div className="ico">{a.level === "crit" ? "!" : a.level === "warn" ? "!" : "i"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="title">{a.title}</span>
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }} className="mono">DOL {a.dol}</span>
                </div>
                <div className="body">{a.body}</div>
                <div className="meta">Ref: {a.ref}</div>
              </div>
              {ackedAt
                ? <span style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                    <Icon name="check" size={12} color="var(--ok)" /> Acknowledged
                  </span>
                : <button className="btn sm" onClick={() => acknowledge(a)}>Acknowledge</button>}
            </div>
          );})}
        </div>
      </div>
    </>);

}

// ============================================================
// Login screen — hybrid auth
//   Default : Google Sign-In (Gmail / Google Workspace)
//   Toggle  : email + password for non-Google domains
// ============================================================
// ============================================================
// ChangePasswordModal
// ============================================================
const MIN_PASSWORD_LENGTH = 10;
function ChangePasswordModal({ onClose, onSave, forced, onLogout }) {
  const [oldPwd, setOldPwd] = React.useState("");
  const [newPwd, setNewPwd] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  // A second Enter while the first change was still in flight sent a second
  // changePassword with the pre-rotation token. The server had already bumped
  // the epoch, answered Unauthorized, and the user was logged out straight
  // after a SUCCESSFUL change (review UP-S5). The ref closes the gap before
  // React has re-rendered with loading = true.
  const busyRef = React.useRef(false);

  const handleSubmit = async () => {
    if (loading || busyRef.current) return;
    if (!oldPwd || !newPwd) return setErr("กรุณากรอกข้อมูลให้ครบ");
    // Mirrors gas-backend.gs MIN_PASSWORD_LENGTH (raised from 6, 2026-09-11).
    if (newPwd.length < MIN_PASSWORD_LENGTH) return setErr(`รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
    if (newPwd !== confirm) return setErr("รหัสผ่านใหม่ไม่ตรงกัน");
    setErr(""); setLoading(true);
    busyRef.current = true;
    let res;
    try { res = await onSave(oldPwd, newPwd); }
    finally { busyRef.current = false; }
    setLoading(false);
    if (res && res.ok === false) setErr(res.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ");
  };

  return (
    <div className="modal-backdrop" onClick={forced ? undefined : onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 340 }}>
        <div className="modal-head"><h2>เปลี่ยนรหัสผ่าน</h2></div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {forced && (
            <div style={{ fontSize: 13, color: "var(--ink-2)", background: "var(--surface-2, #f4f6f7)", borderRadius: 8, padding: "8px 10px" }}>
              บัญชีนี้ใช้รหัสผ่านชั่วคราว — กรุณากรอกรหัสผ่านชั่วคราวที่ได้รับ แล้วตั้งรหัสผ่านใหม่ก่อนใช้งานระบบ
            </div>
          )}
          <div className="field">
            <label>{forced ? "รหัสผ่านชั่วคราว" : "รหัสผ่านเดิม"}</label>
            <input type="password" className="inp" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder="••••••••" autoFocus />
          </div>
          <div className="field">
            <label>รหัสผ่านใหม่ <span className="unit">(อย่างน้อย {MIN_PASSWORD_LENGTH} ตัว)</span></label>
            <input type="password" className="inp" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="field">
            <label>ยืนยันรหัสผ่านใหม่</label>
            <input type="password" className="inp" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleSubmit()} />
          </div>
          {err && <div style={{ color: "var(--red, #c0392b)", fontSize: 13 }}>{err}</div>}
        </div>
        <div className="modal-foot">
          {forced
            ? <button className="btn" onClick={onLogout}>ออกจากระบบ</button>
            : <button className="btn" onClick={onClose}>ยกเลิก</button>}
          <button className="btn primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

// How long the Google Sign-In script gets before the login screen says it did
// not load. The script tag is async/defer; on a working network it is there
// well inside a second.
const GSI_LOAD_TIMEOUT_MS = 10000;

// Both login paths end here. Through gasRequest, so a hung login stops at
// GAS_TIMEOUT_MS and an HTML error page reads as a sentence, not as
// "Unexpected token '<'" (UP-S8).
async function loginRequest(body) {
  let data;
  try { data = await gasRequest({ action: "login", ...body }); }
  catch (e) { throw new Error(`เข้าสู่ระบบไม่สำเร็จ — ${e && e.kind ? e.message : gasErrorText("network")}`); }
  if (data.status !== "ok") throw new Error(data.error || "ไม่พบบัญชีนี้ในระบบ");
  return { name: data.name, role: data.role, email: data.email, token: data.token, authMethod: data.authMethod, mustChangePassword: !!data.mustChangePassword };
}

function LoginScreen({ onLogin, notice = null }) {
  const [mode, setMode]         = React.useState("google"); // "google" | "email"
  const [email, setEmail]       = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading]   = React.useState(false);
  const [error, setError]       = React.useState(null);
  const [showPwd, setShowPwd]   = React.useState(false);
  // The Sign-In script never arrived (blocked, offline, a proxy). The button
  // area used to stay silently empty, which reads as "the app is broken"
  // rather than "the network is" (review UP-S11).
  const [gsiFailed, setGsiFailed] = React.useState(false);
  const btnRef = React.useRef(null);

  // ── Google Sign-In ───────────────────────────────────────
  React.useEffect(() => {
    if (mode !== "google") return;
    const init = () => {
      if (!window.google?.accounts?.id || !btnRef.current) return;
      setGsiFailed(false);
      google.accounts.id.initialize({
        client_id: window.NEOFEED_CLIENT_ID,
        callback: async (resp) => {
          setLoading(true); setError(null);
          try {
            onLogin(await loginRequest({ googleToken: resp.credential }));
          } catch (err) { setError(err.message); setLoading(false); }
        },
      });
      google.accounts.id.renderButton(btnRef.current, {
        type: "standard", shape: "pill", theme: "outline",
        text: "signin_with", locale: "th", size: "large", width: 300,
      });
    };
    if (window.google?.accounts?.id) { init(); return; }
    const fail = () => { if (!window.google?.accounts?.id) setGsiFailed(true); };
    const s = document.querySelector('script[src*="gsi/client"]');
    if (s) {
      s.addEventListener("load", init, { once: true });
      s.addEventListener("error", fail, { once: true });
    } else {
      window.addEventListener("load", init, { once: true });
    }
    // Belt and braces: a script that neither loads nor errors (a stalled
    // connection) is caught by the clock. A late load still clears it — init
    // runs on the script's load event whenever that comes.
    const timer = setTimeout(fail, GSI_LOAD_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("load", init);
      if (s) { s.removeEventListener("load", init); s.removeEventListener("error", fail); }
    };
  }, [mode]);

  // ── Email + password ─────────────────────────────────────
  const submitEmail = async (e) => {
    e && e.preventDefault();
    if (!email.trim() || !password) { setError("กรุณากรอก email และรหัสผ่าน"); return; }
    setLoading(true); setError(null);
    try {
      onLogin(await loginRequest({ email: email.trim().toLowerCase(), password }));
    } catch (err) { setError(err.message); setLoading(false); }
  };

  const switchToEmail = () => { setMode("email"); setError(null); };
  const switchBack    = () => { setMode("google"); setError(null); };

  return (
    <div className="login-wrap">
      {/* The wordmark (Praew, 2026-09-22): NeoFeed's two-tone N IS the "N",
          followed by "eo" and a light "Feed", as on the approved brand board.
          The two paths are icons/icon.svg's, character for character (pinned
          by test/verify-neofeed-mark.cjs), so the app icon and the wordmark
          cannot drift apart. The colours are literal, like icon.svg's: an SVG
          presentation attribute cannot read var(). role="img" makes a screen
          reader say "NeoFeed" once, not "e o Feed". */}
      <div className="login-app-name" role="img" aria-label="NeoFeed">
        <svg className="login-n" viewBox="0 0 98 100" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="nf-forest" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
              <stop offset="0" stopColor="#335A4A" />
              <stop offset="1" stopColor="#284C40" />
            </linearGradient>
            <linearGradient id="nf-sage" gradientUnits="userSpaceOnUse" x1="0" y1="22.5" x2="0" y2="100">
              <stop offset="0" stopColor="#99B29C" />
              <stop offset="1" stopColor="#799781" />
            </linearGradient>
          </defs>
          <path fill="url(#nf-forest)" d="M0 4.8A4.8 4.8 0 0 1 4.8 0L25.76 0A4.8 4.8 0 0 1 29.44 1.71L70 50L70 4.8A4.8 4.8 0 0 1 74.8 0L93.2 0A4.8 4.8 0 0 1 98 4.8L98 95.2A4.8 4.8 0 0 1 93.2 100L81.14 100A4.8 4.8 0 0 1 77.46 98.29L28 39.4L0 16.5Z" />
          <path fill="url(#nf-sage)" d="M0 22.5L28 45.4L28 95.2A4.8 4.8 0 0 1 23.2 100L4.8 100A4.8 4.8 0 0 1 0 95.2Z" />
        </svg>eo<span className="lw">Feed</span>
      </div>
      <div className="login-tagline">Neonatal nutrition,<br />calculated precisely</div>

      {/* Why this screen is showing, when the user did not ask for it: idle
          logout, an expired session, the 12-hour cap (UP-S7 / UP-S13). A
          session that ended silently left the next person at the PC — or the
          same nurse — unsure whether their order had been saved. Warn
          colours, not crit: nothing is broken. Inline styles, so no CSS has to
          land in both hand-synced shells. */}
      {notice && (
        <div role="status" aria-live="polite" className="login-notice" style={{
          width: "100%", maxWidth: 320, boxSizing: "border-box", marginBottom: 18,
          padding: "10px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.5,
          background: "var(--warn-bg)", border: "1px solid var(--warn-line)", color: "var(--warn-ink)",
        }}>
          <div style={{ fontWeight: 600 }}>{notice.title}</div>
          {notice.body && <div style={{ marginTop: 2 }}>{notice.body}</div>}
        </div>
      )}

      {/* ── Google view ── */}
      {mode === "google" && (
        <>
          {gsiFailed && (
            <div role="alert" className="login-gsi-failed" style={{
              width: "100%", maxWidth: 320, boxSizing: "border-box", marginBottom: 8,
              padding: "10px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.5, textAlign: "center",
              background: "var(--crit-bg)", border: "1px solid var(--crit-line)", color: "var(--crit)",
            }}>
              โหลด Google Sign-In ไม่สำเร็จ — ตรวจสอบเครือข่าย
            </div>
          )}
          <div className="login-btn-area">
            <div ref={btnRef} style={{ display: loading ? "none" : "flex", justifyContent: "center", minHeight: 44 }} />
            {loading && (
              <div style={{ position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center", gap: 8,
                color: "var(--ink-2)", fontSize: 13 }}>
                <span style={{ width: 16, height: 16, border: "2px solid var(--line)",
                  borderTopColor: "var(--brand)", borderRadius: "50%",
                  animation: "spin .9s linear infinite", display: "inline-block" }} />
                กำลังตรวจสอบ...
              </div>
            )}
          </div>
          <button className="login-alt-link" onClick={switchToEmail}>
            เข้าด้วย email อื่น →
          </button>
        </>
      )}

      {/* ── Email + password view ── */}
      {mode === "email" && (
        <div className="login-form-wrap">
          <button className="login-back-link" onClick={switchBack}>
            ← Sign in ด้วย Google
          </button>

          <form onSubmit={submitEmail} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
            <input className="inp" type="email" placeholder="Email (@redcross.or.th …)"
              value={email} onChange={e => setEmail(e.target.value)}
              autoComplete="username" autoFocus disabled={loading}
              style={{ width: "100%", fontSize: 14 }} />

            <div style={{ position: "relative", width: "100%" }}>
              <input className="inp" type={showPwd ? "text" : "password"} placeholder="รหัสผ่าน"
                value={password} onChange={e => setPassword(e.target.value)}
                autoComplete="current-password" disabled={loading}
                style={{ width: "100%", fontSize: 14, paddingRight: 54 }} />
              <button type="button" onClick={() => setShowPwd(s => !s)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--ink-3)", fontSize: 12, padding: 4 }}>
                {showPwd ? "ซ่อน" : "แสดง"}
              </button>
            </div>

            <button className="btn primary" type="submit" disabled={loading}
              style={{ width: "100%", height: 44, fontSize: 14 }}>
              {loading
                ? <><span style={{ display: "inline-block", width: 14, height: 14,
                    border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff",
                    borderRadius: "50%", animation: "spin .9s linear infinite",
                    marginRight: 8, verticalAlign: "middle" }} />กำลังตรวจสอบ...</>
                : "เข้าสู่ระบบ"}
            </button>
          </form>
        </div>
      )}

      {error && <div className="login-error" style={{ maxWidth: 320, width: "100%" }}>⚠️ {error}</div>}

      {/* The Valhalla line at the foot of the screen (Praew, 2026-09-22): one
          quiet line, "by Valhalla Health · © 2026", and no version. The
          Guardian V that stood above it earlier that day was removed at her
          request. The line sits under the form because, by the Brand Handbook
          § 07, the endorsement never outranks the app name. Copyright needs
          no registration: the © line only says whose work this is, and 2026
          is the year it was first published. */}
      <div className="login-contact">
        <div className="login-endorse">
          <span>by Valhalla&nbsp;Health · ©&nbsp;2026</span>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ============================================================
// Admin dashboard — read-only oversight, syncs from GAS
// ============================================================
function AdminDashboard({ patients, log, lastSync, includeArchived = false, onToggleArchived }) {
  const totalLogs = Object.values(log).reduce((a, l) => a + l.length, 0);
  // Same "still on the unit" test the registry uses (registry.jsx's
  // isActivePatient): a blank status counts as Active, because the backend
  // defaults it but a patient added locally — or a row typed straight into
  // the sheet — can have none. Requiring the literal string made this tile
  // read lower than the registry's own Active count for the same census.
  const active = patients.filter(p => !p.status || p.status === "Active").length;
  // Newest first by calendar date, not by whichever patient happens to come
  // last in the registry. flatMap groups by patient, so `.slice(-20)` on the
  // raw concatenation returned "the last patients' entries" — a table titled
  // Recent log entries that could omit today's entries entirely while showing
  // week-old ones. `dol` likewise comes from the row's date (D_A.entryDol),
  // not the stored snapshot column.
  const allEntries = patients
    .flatMap(p => (log[p.sessionId] || []).map(e =>
      ({ ...e, sid: p.sessionId, bed: p.currentBed, showDol: D_A.entryDol(p, e) })))
    .sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));
  // Compute alert count across all patients via the shared computeAlerts() —
  // same source of truth as the per-patient nav badge and the Alerts page.
  const alertsTotal = patients.reduce((sum, p) => {
    return sum + activeAlertCount(p, log[p.sessionId] || []);
  }, 0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Admin dashboard</h1>
          <div className="sub">Read-only oversight · pulled from GAS Patient_Registry & Daily_Log</div>
        </div>
        <div className="pill"><span className="dot" style={{ background: "var(--brand)" }} />
          {lastSync ? `Synced ${lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : (GAS_ON ? "Not synced" : "Local only")}</div>
      </div>
      {/* The archive switch (UP-S14). Off at every login and never stored:
          the discharged archive is pulled only while an admin is looking for
          something in it. Once on, archived sessions appear in Switch patient
          and in these totals; the ward registry list still hides them. */}
      {GAS_ON && onToggleArchived && (
        <div className="card" style={{ padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>แสดงผู้ป่วยที่จำหน่ายเกิน 30 วัน</div>
            {includeArchived
              ? "เปิดอยู่ — ดึงข้อมูลผู้ป่วยที่จำหน่ายแล้วทั้งหมดลงเครื่องนี้ ปิดเมื่อใช้งานเสร็จ"
              : "ปิดอยู่ — ซิงก์เฉพาะผู้ป่วยที่ยังอยู่หรือจำหน่ายไม่เกิน 30 วัน"}
          </div>
          {/* className="btn" and no inline height: 40px on a desktop, 44px
              under the shell's touch blocks. */}
          <button className={`btn archive-toggle${includeArchived ? " primary" : ""}`} aria-pressed={includeArchived}
            onClick={onToggleArchived} style={{ justifyContent: "center", minWidth: 96 }}>
            {includeArchived ? "ปิด" : "เปิด"}
          </button>
        </div>
      )}
      <div className="admin-stat-tiles">
        {[
          ["Active sessions", active, "var(--brand)"],
          ["Total patients", patients.length, "var(--ink)"],
          ["Logged entries", totalLogs, "var(--ok)"],
          ["Active alerts", alertsTotal, "var(--warn-ink)"]
        ].map(([l, v, c]) =>
          <div key={l} className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.06 }}>{l}</div>
            <div className="num" style={{ fontSize: 30, fontWeight: 500, color: c }}>{v}</div>
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-h"><Icon name="log" size={14} color="var(--brand)" /> Recent log entries<span className="h-meta">{allEntries.length} total</span></div>
        <div className="card-b" style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ background: "var(--bg-2)", textAlign: "left" }}>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>Session</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>Bed</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>DOL</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>Wt (g)</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>kcal</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>Protein</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: "var(--ink-3)" }}>Route</th>
            </tr></thead>
            <tbody>
              {allEntries.slice(-20).reverse().map((e, i) =>
                <tr key={i} style={{ borderTop: "1px solid var(--line-2)" }}>
                  <td className="num" style={{ padding: "8px 12px" }}>{e.sid}</td>
                  <td className="num" style={{ padding: "8px 12px" }}>{e.bed}</td>
                  <td className="num" style={{ padding: "8px 12px" }}>{e.showDol}</td>
                  <td className="num" style={{ padding: "8px 12px" }}>{e.weight}</td>
                  <td className="num" style={{ padding: "8px 12px" }}>{e.kcal}</td>
                  <td className="num" style={{ padding: "8px 12px" }}>{e.pro}</td>
                  <td style={{ padding: "8px 12px", color: "var(--ink-2)" }}>{e.route}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============================================================
// BottomNav — mobile-only tab bar (≤767px)
// ============================================================
function BottomNav({ view, setView, alertCount, logCount, role }) {
  const tabs = [
    { id: "registry",   icon: "users",  label: "Patients" },
    { id: "log",        icon: "log",    label: "Dashboard", badge: logCount   },
    ...((role === "doctor" || role === "nurse") ? [{ id: "calculator", icon: "calc", label: "Calc" }] : []),
    { id: "fenton",     icon: "chart",  label: "Growth"   },
    { id: "alerts",     icon: "bell",   label: "Alerts", badge: alertCount },
  ];
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`bnav-item${view === t.id ? " active" : ""}`}
          onClick={() => setView(t.id)}
          aria-label={t.label}
        >
          {t.badge > 0 && <span className="bnav-badge">{t.badge}</span>}
          <Icon name={t.icon} size={23} color={view === t.id ? "var(--brand)" : "var(--ink-4)"} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ============================================================
// GuidelinesPanel — ESPGHAN 2018 PN + 2022 EN quick reference
// ============================================================
function GuidelinesPanel() {
  const G = D_A.ESPGHAN_TARGETS;
  const [tab, setTab] = React.useState("pn");

  const Seg = ({ tabs, active, onChange }) => (
    <div className="seg" style={{ marginBottom: 18 }}>
      {tabs.map(([id, label]) =>
        <button key={id} className={active === id ? "on" : ""} onClick={() => onChange(id)}>{label}</button>
      )}
    </div>
  );

  const RangeRow = ({ label, min, max, unit, note, highlight }) => (
    <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1.2fr", gap: 8, alignItems: "center",
      padding: "7px 0", borderBottom: "1px solid var(--line-2)" }}>
      <div>
        <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{label}</span>
        {note && <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 1 }}>{note}</div>}
      </div>
      <div className="num" style={{ fontWeight: 600, fontSize: 13,
        color: highlight ? "var(--brand-2)" : "var(--ink)" }}>
        {min}–{max}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{unit}</div>
    </div>
  );

  const SectionHead = ({ children }) => (
    <div className="sub-h" style={{ marginTop: 18 }}>{children}</div>
  );

  const Badge = ({ children, color = "var(--brand-bg)", text = "var(--brand-2)" }) => (
    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, background: color,
      color: text, fontWeight: 600, marginLeft: 6 }}>{children}</span>
  );

  // ── Phase table helper (fluid, electrolytes) ───────────────
  const PhaseTable = ({ rows, cols }) => (
    <div style={{ overflowX: "auto", marginTop: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "var(--bg-2)" }}>
            {cols.map((c, i) => <th key={i} style={{ padding: "6px 10px", textAlign: i === 0 ? "left" : "center",
              fontWeight: 600, color: "var(--ink-3)", fontSize: 11, letterSpacing: "0.04em",
              borderBottom: "1px solid var(--line)" }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--line-2)", background: i % 2 === 0 ? "var(--surface)" : "var(--bg-2)" }}>
              {r.map((cell, j) => (
                <td key={j} style={{ padding: "6px 10px", textAlign: j === 0 ? "left" : "center",
                  fontFamily: j > 0 ? "IBM Plex Mono, monospace" : "inherit",
                  fontWeight: j > 0 ? 500 : 400, fontSize: j === 0 ? 12 : 12.5 }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ── Alert rule chip ────────────────────────────────────────
  const Rule = ({ level, title, body }) => (
    <div className={`alert-row ${level}`} style={{ marginBottom: 6 }}>
      <div className="ico">{level === "crit" ? "!" : "i"}</div>
      <div>
        <div className="title">{title}</div>
        <div className="body">{body}</div>
      </div>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clinical Guidelines</h1>
          <div className="sub">
            ESPGHAN/ESPEN/ESPR/CSPEN 2018 (PN) · ESPGHAN CoN 2022 (EN) · WHO 2023 · Fenton 2025
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>
          Quick reference for bedside use<br/>
          <span style={{ color: "var(--brand)" }}>Not a substitute for clinical judgment</span>
        </div>
      </div>

      <Seg
        tabs={[["pn","💉 PN (ESPGHAN 2018)"], ["en","🍼 EN (ESPGHAN 2022)"], ["who","🌍 WHO 2023"]]}
        active={tab}
        onChange={setTab}
      />

      {/* ═══════════ PN TAB ═══════════ */}
      {tab === "pn" && (
        <div className="guidelines-grid">

          {/* Amino Acids */}
          <div className="card">
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Amino Acids
              <Badge>R3.1 LOE 1++ · R3.2 LOE 1+</Badge>
            </div>
            <div className="card-b">
              <RangeRow label="Day 1 (preterm)" min="1.5" max="2.5" unit="g/kg/day"
                note="Start from birth or ASAP — avoid 'metabolic shock'" highlight />
              <RangeRow label="Day 2+ (preterm)" min="2.5" max="3.5" unit="g/kg/day"
                note="Needs non-protein energy ≥65 kcal/kg to utilise AA" highlight />
              <RangeRow label="Above 3.5 g/kg" min="—" max="—" unit="" note="Research only (LOE 2+, RG 0)" />
              <RangeRow label="Term stable" min="1.5" max="3.0" unit="g/kg/day" />
              <SectionHead>Specific AAs</SectionHead>
              <RangeRow label="Cysteine" min="50" max="75" unit="mg/kg/day" note="Conditionally essential — add to preterm PN" />
              <RangeRow label="Glutamine" min="—" max="—" unit="" note="Do NOT supplement ≤2 yr (LOE 1++, RG A)" />
              <RangeRow label="Arginine" min="—" max="—" unit="" note="May use for NEC prevention (LOE 1-, RG B)" />
            </div>
          </div>

          {/* GIR */}
          <div className="card">
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Glucose Infusion Rate (GIR)
            </div>
            <div className="card-b">
              <RangeRow label="Start (preterm)" min="4" max="8" unit="mg/kg/min" highlight />
              <RangeRow label="Target (preterm)" min="8" max="10" unit="mg/kg/min"
                note="Optimal anabolism without excess lipogenesis" highlight />
              <RangeRow label="Max (all)" min="—" max="12" unit="mg/kg/min"
                note=">12 → ↑lipogenesis, ↑TG, ↑CO₂, ventilator weaning difficulty" />
              <RangeRow label="Advance" min="+1" max="+2" unit="mg/kg/min per day" />
              <RangeRow label="Term start" min="2.5" max="5" unit="mg/kg/min" />
              <SectionHead>Hyperglycemia management</SectionHead>
              <Rule level="warn" title="BG >145 mg/dL" body="Reduce GIR first (step down 1–2 mg/kg/min)" />
              <Rule level="crit" title="BG >180 mg/dL persistent" body="Insulin 0.01–0.05 U/kg/hr — only after GIR minimised" />
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8 }}>
                Peripheral IV: max dextrose <strong>12.5%</strong>
              </div>
            </div>
          </div>

          {/* Lipid */}
          <div className="card">
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Lipid Emulsion
            </div>
            <div className="card-b">
              <RangeRow label="Start (Day 1–2)" min="0.5" max="1.0" unit="g/kg/day" highlight />
              <RangeRow label="Advance" min="+0.5" max="+1.0" unit="g/kg/day per day" />
              <RangeRow label="Max" min="—" max="4.0" unit="g/kg/day" />
              <RangeRow label="TG threshold" min="—" max="265" unit="mg/dL → reduce ILE" />
              <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--brand-bg)",
                borderRadius: 6, fontSize: 11.5, color: "var(--ink-2)" }}>
                <strong>SMOF lipid preferred</strong> — composite ILE (soy+MCT+olive+fish oil)
                reduces PNALD risk vs pure soy-based. Protect all lipid from light.
              </div>
              <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--bg-2)",
                borderRadius: 6, fontSize: 11.5 }}>
                20% ILE = <strong className="mono">2.0 kcal/mL</strong> · 1 g fat = 5 mL SMOF 20%
              </div>
            </div>
          </div>

          {/* Ca / P / Mg */}
          <div className="card">
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Ca · P · Mg (PN)
              <Badge>Mihatsch 2018</Badge>
            </div>
            <div className="card-b">
              <SectionHead>Day 1</SectionHead>
              <RangeRow label="Ca" min="0.8" max="2.0" unit="mmol/kg/day = 32–80 mg/kg" highlight />
              <RangeRow label="P" min="1.0" max="2.0" unit="mmol/kg/day = 31–62 mg/kg" highlight />
              <RangeRow label="Mg" min="0.1" max="0.2" unit="mmol/kg/day" />
              <SectionHead>Growing preterm (D2+)</SectionHead>
              <RangeRow label="Ca" min="1.6" max="3.5" unit="mmol/kg/day = 64–140 mg/kg" highlight />
              {/* Read from TPN_TARGETS so this page can't drift from the tiles
                  again — it kept the pre-correction 1.5–2.0 mmol range for two
                  weeks after the calculator moved to 50–108 (2026-09-11 review, F4). */}
              <RangeRow label="P" min="1.6" max="3.5" unit={`mmol/kg/day = ${D_A.TPN_TARGETS.p(2)[0]}–${D_A.TPN_TARGETS.p(2)[1]} mg/kg`} highlight />
              <RangeRow label="Mg" min="0.2" max="0.3" unit="mmol/kg/day" />
              <SectionHead>Ca:P ratio</SectionHead>
              <RangeRow label="Molar (PN)" min="0.8" max="1.3" unit=":1 — target 1.3:1 for stable growth" highlight />
              <RangeRow label="Mass ratio" min="1.0" max="1.7" unit=":1 (Ca g / P g)" />
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)" }}>
                Use <strong>Glycophos®</strong> (organic P) — avoids CaPO₄ precipitation.
                1 mL = 1 mmol P + 2 mmol Na.
              </div>
            </div>
          </div>

          {/* Fluid table */}
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Fluid targets (mL/kg/day) by DOL + birth weight
              <Badge>Jochum 2018</Badge>
            </div>
            <div className="card-b">
              <PhaseTable
                cols={["BW category", "DOL 1", "DOL 2", "DOL 3", "DOL 4", "DOL 5+"]}
                rows={[
                  ["ELBW <1000g",   "80–100","100–120","120–140","140–160","160–180"],
                  ["VLBW 1000–1500g","70–90", "90–110","110–130","130–150","140–160"],
                  ["Preterm >1500g", "60–80", "80–100","100–120","120–140","140–160"],
                  ["Term ≥2500g",    "40–60", "50–70", "60–80", "60–100","100–140"],
                ]}
              />
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)" }}>
                ELBW in humidified incubator (80–90%): IWL ≈30 mL/kg/day.
                Open warmer: IWL up to 120 mL/kg/day. Target UO 1–3 mL/kg/hr.
              </div>
            </div>
          </div>

          {/* Electrolytes table */}
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Electrolytes (mmol/kg/day) by phase
              <Badge>Jochum 2018</Badge>
            </div>
            <div className="card-b">
              <PhaseTable
                cols={["Electrolyte","Transition (D1–2)","Intermediate (D3–7)","Stable (D8+)","Notes"]}
                rows={[
                  ["Na — ELBW <1kg",  "0–2","0–5","2–7", "High Na loss possible; guided by serum Na"],
                  ["Na — Preterm",    "0–2","0–3","2–5", "Withhold D1–2; add when UO established"],
                  ["Na — Term",       "0–2","0–2","1–3", ""],
                  ["K — All",         "0–3","0–3","2–3", "Avoid routine K in D1–2 ELBW (hyperkalemia risk)"],
                  ["Cl — All",        "0–3","0–3","2–5", "Keep Na+K > Cl by 1–2 mmol/kg to avoid acidosis"],
                ]}
              />
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  ["Zn (preterm)", "400–500 µg/kg/day"],
                  ["Fe (preterm)", "200–250 µg/kg/day"],
                  ["Cu", "40 µg/kg/day"],
                ].map(([l,v]) => (
                  <div key={l} style={{ background: "var(--bg-2)", borderRadius: 6, padding: "8px 10px" }}>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
                    <div className="num" style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)" }}>
                Peditrace® 1 mL/kg/day (maximum 15 mL/day) covers Zn, Cu, Se, Mn, I.
                Vitalipid N Infant: BW {'<'}2.5 kg → 4 mL/kg · BW ≥2.5 kg → 10 mL/day (lipid bag).
                Soluvit N: 1 mL/kg/day (aqueous bag).
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ═══════════ EN TAB ═══════════ */}
      {tab === "en" && (
        <div className="guidelines-grid">

          {/* Macronutrients */}
          <div className="card">
            <div className="card-h">
              <Icon name="milk" size={14} color="var(--brand)" />
              Macronutrients
              <Badge>ESPGHAN CoN 2022</Badge>
            </div>
            <div className="card-b">
              <RangeRow label="Energy" min="115" max="140" unit="kcal/kg/day (max 160 for catch-up)" highlight />
              <RangeRow label="Protein" min="3.5" max="4.0" unit="g/kg/day (max 4.5)" highlight />
              <RangeRow label="P:E ratio" min="2.8" max="3.6" unit="g/100 kcal — ensures lean mass" />
              <RangeRow label="Fat" min="4.8" max="8.1" unit="g/kg/day (↑ from 2010)" />
              <RangeRow label="DHA" min="30" max="65" unit="mg/kg/day (↑↑ from 12–30)" highlight />
              <RangeRow label="ARA" min="30" max="100" unit="mg/kg/day (↑ from 18–42)" />
              <RangeRow label="CHO" min="11" max="17" unit="g/kg/day" />
              <RangeRow label="Fluid" min="150" max="180" unit="mL/kg/day (target 165)" />
            </div>
          </div>

          {/* Minerals */}
          <div className="card">
            <div className="card-h">
              <Icon name="drop" size={14} color="var(--brand)" />
              Minerals + Vitamins
              <Badge>ESPGHAN CoN 2022</Badge>
            </div>
            <div className="card-b">
              <RangeRow label="Na" min="3.0" max="5.0" unit="mmol/kg/day (up to 8.0 ELBW)" highlight />
              <RangeRow label="K" min="2.3" max="4.6" unit="mmol/kg/day (↑↑ from 1.7–3.4)" highlight />
              <RangeRow label="Ca" min="120" max="200" unit="mg/kg/day = 3.0–5.0 mmol/kg (↑)" highlight />
              <RangeRow label="P" min="70" max="115" unit="mg/kg/day = 2.2–3.7 mmol/kg (↑)" highlight />
              <SectionHead>Vitamins + trace (enteral)</SectionHead>
              <RangeRow label="Vitamin D" min="400" max="700" unit="IU/kg/day (⚠️ per kg, not per day!)" highlight />
              <RangeRow label="Iron" min="2" max="3" unit="mg/kg/day, start at 2 wks (up to 6)" />
              <RangeRow label="Zinc" min="2.0" max="3.0" unit="mg/kg/day (↑↑ from 1.1–2.0)" highlight />
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--ok)", fontWeight: 500 }}>
                ✅ Key 2022 changes: DHA↑ · K↑ · Ca↑ · P↑ · Zn↑ · Vit D switched to per kg/day
              </div>
            </div>
          </div>

          {/* Feeding advancement */}
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-h">
              <Icon name="milk" size={14} color="var(--brand)" />
              Feeding Advancement Protocol
            </div>
            <div className="card-b">
              <div className="feeding-steps-grid">
                {[
                  ["1. Start ASAP", "12–24 mL/kg/day", "MEF (trophic)", "Day 1 — even ELBW", "GOR B"],
                  ["2. Advance", "+18–30 mL/kg/day", "per day", "WHO 2023: up to 30 safe", "Mod certainty"],
                  ["3. Fortify", "≥40 mL/kg/day", "Start HMF", "<32 wk or <1.5 kg on MOM/DHM", "WHO 2023"],
                  ["4. Full EN", "≥100 mL/kg/day", "Wean PN", "KCMH threshold · switch to EN targets", "KCMH practice"],
                  ["5. Oral feed", "PMA ≥32 wks", "Non-nutritive", "Support breastfeeding", ""],
                ].map(([step, vol, label, note, ref], i) => (
                  <div key={i} style={{ padding: "12px 10px", textAlign: "center",
                    background: i % 2 === 0 ? "var(--surface)" : "var(--bg-2)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-2)", marginBottom: 4 }}>{step}</div>
                    <div className="num" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{vol}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 2 }}>{label}</div>
                    <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>{note}</div>
                    {ref && <div style={{ fontSize: 10, color: "var(--brand)", marginTop: 2 }}>{ref}</div>}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Rule level="info" title="No routine gastric residual monitoring"
                  body="Not recommended in stable preterm infants (ESPGHAN 2022 GOR B). Check only if: abdominal distension, tenderness, bilious vomiting, bloody stools." />
                <Rule level="info" title="Scheduled feeding preferred"
                  body="q2–3h scheduled feeds for <34 wk, rather than demand feeding — until hospital discharge (WHO 2023, conditional)." />
              </div>

              <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--brand-bg)",
                borderRadius: 8, fontSize: 12, color: "var(--ink-2)" }}>
                <strong>Growth targets (ESPGHAN 2022):</strong> Weight ≥17–20 g/kg/day · Length ≥0.8 cm/wk · HC ≥0.5 cm/wk
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ═══════════ WHO 2023 TAB ═══════════ */}
      {tab === "who" && (
        <div className="guidelines-grid">

          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-h">
              <Icon name="info" size={14} color="var(--brand)" />
              WHO 2023 Preterm Feeding — New & Changed Recommendations
            </div>
            <div className="card-b">
              {[
                { level:"crit", title:"Ca/P supplementation: NOT recommended",
                  body:"Changed from 2015 — routine Ca/P supplement for formula-fed preterm/LBW no longer recommended (insufficient evidence)." },
                { level:"info", title:"Early enteral feeding from Day 1 (Strong, Moderate certainty)",
                  body:"All preterm/LBW including <32 wk and <1.5 kg. Clinically stable or not. Base on clinical judgment for unstable infants." },
                { level:"info", title:"Feed advancement: up to 30 mL/kg/day (Conditional, Moderate certainty)",
                  body:"All trials compared fast (30–40 mL/kg/day) vs slow (10–25). Fast advancement: ↓ time to regain BW, ↓ LOS. No ↑ NEC." },
                // The start threshold used to read "EN ≥100 mL/kg/day" here while
                // the EN tab and EN_DB both said ≥40, each citing WHO 2023
                // (review F5). NeoFeed's own value is the one shown below —
                // ESPGHAN_TARGETS.en.advancement.hmfStart.
                { level:"info", title:"HMF: conditionally recommended for <32 wk or <1.5 kg on MOM/DHM",
                  body:`Use commercially available multicomponent HMF formulated for preterm infants. Start threshold: NeoFeed uses ≥${D_A.ESPGHAN_TARGETS.en.advancement.hmfStart} mL/kg/day (unit protocol — confirm locally).` },
                { level:"info", title:"Iron: 2–4 mg/kg/day (Strong, Moderate certainty)",
                  body:"For human milk-fed preterm/LBW not receiving iron from another source. Start when EN established." },
                { level:"info", title:"Zinc: 1–3 mg/kg/day (Conditional, Low certainty)",
                  body:"For human milk-fed preterm/LBW. Initiate when EN established." },
                { level:"info", title:"Vitamin D: 400–800 IU/day (Conditional, Low certainty)",
                  body:"For human milk-fed preterm/LBW. Note: WHO says per day (not per kg as ESPGHAN 2022). Use clinical judgment." },
                { level:"warn", title:"Scheduled feeds q2–3h preferred over demand (Conditional, Low certainty)",
                  body:"For <34 wk in health facilities until discharge. Balance with nurturing/responsive caregiving." },
                { level:"info", title:"Probiotics: conditionally recommended for <32 wk on human milk",
                  body:"Moderate certainty for ↓ mortality, NEC, invasive infection. Use only regulatory-approved formulations." },
              ].map((a, i) => (
                <div key={i} className={`alert-row ${a.level}`} style={{ marginBottom: 8 }}>
                  <div className="ico">{a.level === "crit" ? "!" : a.level === "warn" ? "!" : "i"}</div>
                  <div>
                    <div className="title">{a.title}</div>
                    <div className="body">{a.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick compare 2022 vs 2010 */}
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-h">
              <Icon name="info" size={14} color="var(--brand)" />
              ESPGHAN 2022 vs 2010 — Key numeric changes
            </div>
            <div className="card-b">
              <PhaseTable
                cols={["Nutrient","ESPGHAN 2010","ESPGHAN 2022","Change","Unit"]}
                rows={[
                  ["Energy",    "110–135", "115–140 (max 160)", "↑ upper", "kcal/kg/day"],
                  ["Protein",   "3.5–4.5", "3.5–4.0 (max 4.5)", "Quality focus", "g/kg/day"],
                  ["Fat",       "4.8–6.6", "4.8–8.1",           "↑↑ upper",      "g/kg/day"],
                  ["DHA",       "12–30",   "30–65",              "↑↑",            "mg/kg/day"],
                  ["ARA",       "18–42",   "30–100",             "↑",             "mg/kg/day"],
                  ["Na",        "3.0–5.0", "3.0–5.0 (–8.0)",    "↑ upper range", "mmol/kg/day"],
                  ["K",         "1.7–3.4", "2.3–4.6",           "↑↑ both ends",  "mmol/kg/day"],
                  ["Ca",        "3.0–3.5 mmol","3.0–5.0 mmol",  "↑ upper",       "mmol/kg/day"],
                  ["P",         "1.9–2.9 mmol","2.2–3.7 mmol",  "↑",             "mmol/kg/day"],
                  ["Vitamin D", "800–1000 IU/day","400–700 IU/kg/day","Per kg now!","IU"],
                  ["Iron",      "2–3 mg/kg", "2–3 (up to 6)",   "≈same",         "mg/kg/day"],
                  ["Zinc",      "1.1–2.0", "2.0–3.0",           "↑↑",            "mg/kg/day"],
                ]}
              />
            </div>
          </div>

        </div>
      )}
    </>
  );
}

// ============================================================
// FormulasPanel — KCMH formula composition reference
// ============================================================
function FormulasPanel() {
  const DB = D_A.EN_DB;
  const groups = [
    { label: "🤱 Breast Milk", keys: ["BM_20","BM_HMF_24"] },
    { label: "🥛 HiQ LF (Dumex)", keys: ["HIQLF_20","HIQLF_24","HIQLF_27"] },
    { label: "🍼 Enfalac LF (MJN)", keys: ["ENFALAC_20","ENFALAC_24","ENFALAC_27"] },
    { label: "⚡ High-energy / Mixed", keys: ["BM_PF_20","FBM_PF_22","FBM_PF_24","FBM_INF_MIX","INFATRINI_30"] },
  ];

  const cols = ["Formula","kcal","Protein","Fat","Na","K","Ca","P","Osm","LF?","Note"];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Formula + Feed Reference</h1>
          <div className="sub">KCMH NICU formulary · per 100 mL prepared formula</div>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
          Units: kcal · g · mmol (Na/K) · mg (Ca/P)
        </div>
      </div>

      {groups.map(({ label, keys }) => (
        <div key={label} className="card" style={{ marginBottom: 14 }}>
          <div className="card-h">
            <Icon name="milk" size={14} color="var(--brand)" />
            {label}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "var(--bg-2)" }}>
                  {["Formula","kcal/100mL","Protein g","Fat g","Na mmol","K mmol","Ca mg","P mg","Osm","LF","Note"].map((h,i) => (
                    <th key={i} style={{ padding: "7px 10px", textAlign: i === 0 ? "left" : "center",
                      fontWeight: 600, color: "var(--ink-3)", fontSize: 11,
                      borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.filter(k => DB[k]).map((k, i) => {
                  const f = DB[k];
                  return (
                    <tr key={k} style={{ borderBottom: "1px solid var(--line-2)",
                      background: i % 2 === 0 ? "var(--surface)" : "var(--bg-2)" }}>
                      <td style={{ padding: "7px 10px", color: "var(--ink)", maxWidth: 180, minWidth: 130 }}>
                        {(() => {
                          const m = f.label.match(/^(.*?)\s*\((.+)\)$/);
                          if (!m) return <span style={{ fontWeight: 500 }}>{f.label}</span>;
                          return (
                            <>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{m[1]}</div>
                              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 1 }}>({m[2]})</div>
                            </>
                          );
                        })()}
                      </td>
                      {[f.kcal, f.pro, f.fat, f.na?.toFixed(2), f.k?.toFixed(2), f.ca, f.p].map((v, j) => (
                        <td key={j} className="num" style={{ padding: "7px 10px", textAlign: "center",
                          fontWeight: 500, fontSize: 12.5 }}>{v ?? "—"}</td>
                      ))}
                      <td className="num" style={{ padding: "7px 10px", textAlign: "center", fontSize: 12 }}>{f.osm}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 12 }}>
                        <span style={{ color: f.lf ? "var(--ok)" : "var(--ink-3)" }}>
                          {f.lf ? "✅" : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "7px 10px", fontSize: 11, color: "var(--ink-3)",
                        maxWidth: 200, wordBreak: "break-word" }}>{f.note || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

    </>
  );
}

// ============================================================
// Toast
// ============================================================
// The toast host lives on document.body, created on first use (review UP-S7).
// It used to be a <div> inside App's workspace, so every toast raised while
// the workspace was NOT on screen — "เซสชันหมดอายุ" as the app dropped to the
// login screen, anything over SyncGate or the forced password change — found
// no host and was silently thrown away. The shells' `#toast-host { display:
// contents }` and its print rule still apply to it.
function toastHost() {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    document.body.appendChild(host);
  }
  return host;
}
function showToast(msg, type = "ok") {
  const host = toastHost();
  const t = document.createElement("div");
  const bg     = type === "error" ? "oklch(38% 0.15 20)" : "oklch(26.8% 0.030 170)";
  const prefix = type === "error" ? "⚠ " : "✓ ";
  const dur    = type === "error" ? 4200 : 2400;
  const toastBottom = getComputedStyle(document.documentElement).getPropertyValue('--toast-bottom').trim() || '24px';
  t.style.cssText = `position:fixed;bottom:${toastBottom};left:50%;transform:translateX(-50%) translateY(10px);background:${bg};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;box-shadow:0 8px 28px oklch(26.8% 0.030 170 / .28);z-index:80;font-family:'IBM Plex Sans',sans-serif;opacity:0;transition:opacity .18s ease,transform .18s ease;max-width:90vw;text-align:center;`;
  t.textContent = prefix + msg;
  host.appendChild(t);
  requestAnimationFrame(() => {
    t.style.opacity = "1";
    t.style.transform = "translateX(-50%) translateY(0)";
  });
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(-50%) translateY(4px)";
  }, dur);
  setTimeout(() => { if (host.contains(t)) host.removeChild(t); }, dur + 250);
}

// CMD+K to open picker
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent("__open_picker"));
  }
});

ReactDOM.createRoot(document.getElementById("root")).render(<ViewErrorBoundary variant="root"><AppRoot /></ViewErrorBoundary>);
