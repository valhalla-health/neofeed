// ============================================================
// Patient registry view + picker
// ============================================================
const D_R = window.NEOFEED_DATA;

// Spread onto a clickable row/card div so keyboard users can open a patient
// without tabbing through every nested action button first (Enter/Space
// activates it like a native control; nested buttons still stopPropagation
// their own clicks so they don't double-fire this).
const rowA11y = (onActivate) => ({
  role: "button",
  tabIndex: 0,
  onKeyDown: (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(); }
  },
});

// Ward display order: NICU beds first, then iso, then SCN, then anything
// else/unbedded last — a plain string sort would alphabetize to iso < NICU
// < SCN instead. Numeric ordering within a ward (NICU 2 before NICU 10,
// iso 1-2 before iso 2-1) still comes from the numeric localeCompare below.
const WARD_RANK = { nicu: 0, iso: 1, scn: 2 };
const bedSort = (a, b) => {
  const bedA = a.currentBed || "zzz";
  const bedB = b.currentBed || "zzz";
  const rank = (bed) => WARD_RANK[(bed.match(/^[a-z]+/i) || [""])[0].toLowerCase()] ?? 3;
  return rank(bedA) - rank(bedB) ||
    bedA.localeCompare(bedB, undefined, { numeric: true, sensitivity: "base" });
};

// One definition of "still on the unit" for the whole registry — the list, the
// Active tile, and the Logged today / Needs entry split all have to agree, and
// they didn't: the list counted a blank status as Active (the backend defaults
// it, but locally-added patients can be blank) while the Active tile required
// the literal string, so the tile could read lower than the list it sits above.
const isActivePatient = (p) => !p.status || p.status === "Active";

// AddPatientModal's "Multiples" letter (A–D) only records this session's
// position in the set, not how many siblings there are — "A" means the same
// thing whether it's one of twins or one of triplets. `multiplesCount`
// (added alongside it) is what actually disambiguates the label. Patients
// registered before that field existed have no `multiplesCount`, so fall
// back to the old (imperfect — A/B could really be a triplet) letter guess
// rather than showing nothing.
const MULTIPLES_COUNT_TERM = { 2: "Twin", 3: "Triplet", 4: "Quadruplet" };
const MULTIPLES_LETTER_FALLBACK = { A: "Twin", B: "Twin", C: "Triplet", D: "Quadruplet" };
function multiplesLabel(p) {
  if (!p.twinSuffix) return null;
  const term = MULTIPLES_COUNT_TERM[p.multiplesCount] || MULTIPLES_LETTER_FALLBACK[p.twinSuffix] || "Multiple";
  return `${term} ${p.twinSuffix}`;
}

// ── Ward gate ────────────────────────────────────────────────
// The first screen of the shift: pick NICU or SCN, then work that ward's
// list. The unit runs two wards with two different censuses and two rounding
// teams, and the combined list made every nurse scroll past the other ward's
// patients to reach their own — so the ward is chosen once on entry and the
// list stays scoped to it until it is changed.
//
// The two tiles are always shown even when a ward is empty (an empty NICU is
// information, and the tile is where you register the first admission into
// it). A third "other" tile appears only when patients exist with no bed or
// an unrecognized one — those patients would otherwise be reachable from no
// tile at all, which is the one failure mode a gate like this can introduce.
// Module level, not nested inside WardGate — a component defined inside
// another is a new type on every render, so React unmounts and remounts it
// (the reason calculator.jsx keeps TwoCol out of Calculator).
function WardTile({ label, sub, list, log, today, onPick }) {
  const logged = list.filter(p => D_R.hasLogOnDate(log[p.sessionId], today)).length;
  const needs  = list.length - logged;
  return (
    <button className="ward-tile" onClick={onPick}
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
        padding: "22px 24px", borderRadius: 12, border: "1px solid var(--line-2)",
        background: "var(--bg-1)", cursor: "pointer", textAlign: "left", width: "100%" }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: "var(--brand-2)", letterSpacing: "-0.02em" }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{sub}</div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12.5 }}>
        <span><span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{list.length}</span>
          <span style={{ color: "var(--ink-3)" }}> active</span></span>
        <span style={{ color: needs === 0 ? "var(--ok)" : "var(--crit)" }}>
          <span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{needs}</span>
          <span> needs entry</span></span>
      </div>
    </button>
  );
}

function WardGate({ patients, log, today, onPick }) {
  const groups = { NICU: [], SCN: [], other: [] };
  const active = patients.filter(isActivePatient);
  active.forEach(p => groups[D_R.wardGroup(p.currentBed)].push(p));
  const tile = (ward) => ({ list: groups[ward], log, today, onPick: () => onPick(ward) });

  return (
    <>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1>เลือก ward</h1>
          <div className="sub">{active.length} active sessions · {today}</div>
        </div>
      </div>
      <div className="ward-gate" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, maxWidth: 760 }}>
        <WardTile label="NICU" sub="NICU 1–12 · iso 1–3" {...tile("NICU")} />
        <WardTile label="SCN"  sub="SCN 1–30"            {...tile("SCN")} />
        {groups.other.length > 0 &&
          <WardTile label="อื่นๆ" sub="ยังไม่ระบุเตียง / เตียงนอกรายการ" {...tile("other")} />}
      </div>
    </>
  );
}

function PatientRegistry({ patients, activeId, log = {}, ward, onWardChange, onSelect, onAdd, onEdit, onDelete }) {
  const [filter, setFilter]         = React.useState("");
  const [showAdd, setShowAdd]       = React.useState(false);
  const [editPatient, setEditPatient]       = React.useState(null);
  const [transferPatient, setTransferPatient] = React.useState(null);
  const [showArchived, setShowArchived]     = React.useState(false);

  // Live local date: re-renders this view when the day rolls over, so the
  // stats strip, the per-patient LOGGED / NEEDS ENTRY badges and the 7-day
  // discharged auto-hide all re-evaluate on their own at midnight instead of
  // holding yesterday's answer until someone reloads the tab.
  const today = D_R.useTodayLocal();

  // No ward chosen yet → the gate IS this view. Every hook this component
  // calls is above this line (five useStates and useTodayLocal), so the early
  // return can't change the hook call order between renders.
  if (!ward) return <WardGate patients={patients} log={log} today={today} onPick={onWardChange} />;

  const q = filter.toLowerCase().trim();
  // The ward this screen is about. Every count, badge and stat below is
  // scoped to it — except the bed-occupancy maps the modals build, which take
  // the full census (a bed is occupied by whoever is in it, ward gate or
  // not), and except a search.
  const wardPatients = patients.filter(p => D_R.wardGroup(p.currentBed) === ward);
  // **Searching looks across the whole unit, not just the open ward** (ward
  // decision, 2026-09-15). Someone typing a name is looking for that infant,
  // and answering "ไม่พบ" because they are one ward over — when the app can
  // see them — is the app withholding what it knows. The ward gate is there
  // to shorten the daily list, not to partition the census. Browsing (no
  // query) still shows only this ward.
  const matches = (p) =>
    (p.name || "").toLowerCase().includes(q) ||
    (p.currentBed || "").toLowerCase().includes(q) ||
    (p.diagnosis || "").toLowerCase().includes(q);
  const filtered = q ? patients.filter(matches) : wardPatients;
  // How many of the hits are somewhere else, so the list can say so rather
  // than leaving an SCN bed to appear unexplained on the NICU screen.
  const offWardHits = q ? filtered.filter(p => D_R.wardGroup(p.currentBed) !== ward).length : 0;
  const sorted   = [...filtered].sort(bedSort);
  const activeSorted   = sorted.filter(isActivePatient);
  // Discharged/Transferred/Expired patients drop off the registry 7 days
  // after their statusDate — the name shouldn't linger on the dashboard
  // once the case is old news.
  //
  // A non-Active record with NO usable statusDate (archived before the field
  // existed, 2026-07-20, or a cell typed by hand) used to stay on the ward
  // list forever, "since we can't tell its age". Decided 2026-09-17: it counts
  // as older than the window and is hidden. The server no longer syncs those
  // records to ward devices at all, so showing one here only ever happened on
  // an admin device that has asked for the archive — and admins still reach
  // them there (the admin dashboard's archive switch, then Switch patient).
  // Active and blank-status patients are unaffected: they never reach this
  // filter.
  const ARCHIVE_VISIBLE_DAYS = 7;
  const daysSinceStatus = (p) => {
    if (!p.statusDate) return Infinity;
    const changed = new Date(p.statusDate + "T00:00:00");
    if (isNaN(changed)) return Infinity;
    return Math.floor((new Date(today + "T00:00:00") - changed) / 86400000);
  };
  const archivedSorted = sorted.filter(p =>
    p.status && p.status !== "Active" && daysSinceStatus(p) <= ARCHIVE_VISIBLE_DAYS
  );

  // Summary stats — all three counts are over the *same* set (active patients)
  // so the strip always reconciles: logged + needs entry === active.
  // `hasLogOnDate` scans every entry rather than only the last one (a
  // back-filled past date is appended after today's, which used to make an
  // already-logged patient read as "needs entry") and normalizes `ts` first
  // (the sheet can return it as a Date object, never equal to a date string).
  const activePatients = wardPatients.filter(isActivePatient);
  const loggedSet    = new Set(
    activePatients.filter(p => D_R.hasLogOnDate(log[p.sessionId], today)).map(p => p.sessionId)
  );
  const totalActive  = activePatients.length;
  const loggedToday  = loggedSet.size;
  const needsLog     = totalActive - loggedToday;

  return (
    <>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h1>{ward === "other" ? "อื่นๆ" : ward}</h1>
          <div className="sub">{wardPatients.length} sessions · {totalActive} active</div>
        </div>
        <button className="btn" onClick={() => onWardChange?.(null)} style={{ fontSize: 12.5 }}>
          ← เปลี่ยน ward
        </button>
      </div>

      {/* ── Stats strip ── */}
      <div className="reg-stats">
        <div className="reg-stat s-brand">
          <span className="reg-stat-val">{totalActive}</span>
          <span className="reg-stat-lbl">Active</span>
        </div>
        {/* Ward-scoped like the other three: a strip that mixed one ward's
            active count with the whole unit's session count invited reading
            the difference as "13 discharged" when most of it is the other
            ward still on the unit. */}
        <div className="reg-stat">
          <span className="reg-stat-val">{wardPatients.length}</span>
          <span className="reg-stat-lbl">Total sessions</span>
        </div>
        <div className={`reg-stat ${loggedToday === totalActive && totalActive > 0 ? "s-ok" : loggedToday > 0 ? "s-warn" : "s-crit"}`}>
          <span className="reg-stat-val">{loggedToday}</span>
          <span className="reg-stat-lbl">Logged today</span>
        </div>
        <div className={`reg-stat ${needsLog === 0 ? "" : needsLog <= 1 ? "s-warn" : "s-crit"}`}>
          <span className="reg-stat-val">{needsLog}</span>
          <span className="reg-stat-lbl">Needs entry</span>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="reg-filter">
        <div className="reg-search">
          <div className="s-ico"><Icon name="search" size={14} /></div>
          <input
            className="inp"
            placeholder="ค้นหาทั้ง unit · ชื่อย่อ · เตียง · วินิจฉัย"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <button className="btn primary" style={{ whiteSpace: "nowrap" }} onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={14} color="#fff" /> New session
        </button>
      </div>

      {/* A search reaches across wards, so say when it brought some back —
          otherwise an SCN bed appears on the NICU screen with no explanation
          and reads as the ward filter having broken. */}
      {offWardHits > 0 && (
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "-4px 0 10px" }}>
          ค้นทั้ง unit — {offWardHits} รายอยู่ ward อื่น (ดูเลขเตียงในแต่ละรายการ)
        </div>
      )}

      {/* ─── Mobile: card list ─── */}
      <div className="patient-card-list">
        {activeSorted.map(p => {
          // No fallback to the raw last array element: that element can be a
          // length/HC-only row (`w: null`), which turns Δ into `null - bw`
          // — a bogus −100% — instead of the honest "—" a null `last` gives.
          const last    = D_R.lastWeighed(p) || null;
          const dol     = D_R.liveDol(p);
          const delta   = last ? last.w - p.bw : 0;
          const deltaPct = (delta / p.bw) * 100;
          const deltaColor = deltaPct < -10 ? "var(--crit)" : deltaPct < 0 ? "var(--warn-ink)" : "var(--ok)";
          const isActive  = p.sessionId === activeId;
          const entries   = log[p.sessionId] || [];
          const lastEntry = entries[entries.length - 1];
          const hasToday  = loggedSet.has(p.sessionId);

          return (
            <div key={p.sessionId}
                 className={"patient-mc" + (isActive ? " active" : "")}
                 onClick={() => onSelect(p.sessionId)}
                 {...rowA11y(() => onSelect(p.sessionId))}>

              {/* Row 1: name + DOL + status */}
              <div className="pmc-row pmc-head">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="pmc-name">{p.name || p.initials || "—"}</span>
                  {/* Twins share initials — without this, Twin A and Twin B
                      were two identical cards on the phones nurses use
                      (2026-09-11 review, F9; desktop table + picker had it). */}
                  {p.twinSuffix && <span className="pmc-twin chip" style={{ fontSize: 11, fontWeight: 700 }}>{multiplesLabel(p)}</span>}
                  <span className="pmc-dol">DOL {dol}</span>
                </div>
                <span className="chip ok"><span className="d" />Active</span>
              </div>

              {/* Row 2: bed + GA · BW */}
              <div className="pmc-row">
                <span className="chip"><span className="d" />{p.currentBed}</span>
                <span className="pmc-meta">
                  <span className="num">{D_R.fmtGA(p.ga)}</span> wk ·{" "}
                  <span className="num">{p.bw.toLocaleString()}</span> g
                </span>
              </div>

              {/* Diagnosis */}
              {p.diagnosis && <div className="pmc-diagnosis">{p.diagnosis}</div>}

              {/* Row 3: weight stats + log badge */}
              <div className="pmc-row pmc-stats">
                <span>
                  <span className="pmc-lbl">Wt</span>
                  <span className="num">{last?.w?.toLocaleString() || "—"}</span> g
                </span>
                <span style={{ color: last ? deltaColor : "var(--ink-3)" }}>
                  <span className="pmc-lbl">Δ</span>
                  {last
                    ? <><span className="num">{delta >= 0 ? "+" : ""}{delta}</span> g ({D_R.displayNum(deltaPct, 1)}%)</>
                    : <span className="num">—</span>}
                </span>
                {/* Today's entry, stated outright rather than as a quiet grey
                    hint — this is the one thing the round asks of the list. */}
                <span className={"log-badge" + (hasToday ? " is-logged" : "")}
                      title={hasToday ? "บันทึกวันนี้แล้ว"
                        : lastEntry ? `บันทึกล่าสุด DOL ${lastEntry.dol}` : "ยังไม่มีบันทึก"}>
                  {hasToday ? "✓ LOGGED" : "NEEDS ENTRY"}
                </span>
              </div>

              {/* Actions */}
              <div className="pmc-actions">
                <button className="btn sm" onClick={e => { e.stopPropagation(); setEditPatient(p); }}>
                  Edit
                </button>
                <button className="btn sm primary" onClick={e => { e.stopPropagation(); onSelect(p.sessionId); }}>
                  Open <Icon name="arrow" size={11} color="#fff" />
                </button>
              </div>
            </div>
          );
        })}

        {activeSorted.length === 0 && (
          <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            {filter ? "ไม่พบผู้ป่วยที่ตรงกันทั้ง unit" : `ยังไม่มีผู้ป่วยใน ${ward === "other" ? "กลุ่มนี้" : ward}`}
          </div>
        )}

        {/* Archived toggle */}
        {archivedSorted.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button className="btn" style={{ width: "100%", justifyContent: "center", color: "var(--ink-3)", fontSize: 12 }}
              onClick={() => setShowArchived(s => !s)}>
              {showArchived ? "▲" : "▼"} Discharged / Transferred / Expired ({archivedSorted.length})
            </button>
            {showArchived && archivedSorted.map(p => (
              <div key={p.sessionId} className="patient-mc" style={{ opacity: 0.55 }}
                   onClick={() => onSelect(p.sessionId)}>
                <div className="pmc-row pmc-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="pmc-name">{p.name || p.initials || "—"}</span>
                    {p.twinSuffix && <span className="pmc-twin chip" style={{ fontSize: 11, fontWeight: 700 }}>{multiplesLabel(p)}</span>}
                    <span className="chip"><span className="d" />{p.currentBed}</span>
                  </div>
                  <span className="chip"><span className="d" />{p.status}</span>
                </div>
                <div className="pmc-row">
                  <span className="pmc-meta"><span className="num">{D_R.fmtGA(p.ga)}</span> wk · <span className="num">{p.bw.toLocaleString()}</span> g</span>
                </div>
                {p.diagnosis && <div className="pmc-diagnosis">{p.diagnosis}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Desktop: table ─── */}
      <div className="card patient-table">
        <table className="tbl" style={{ tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            {/* Bed */}
            <col style={{ width: 90 }} />
            {/* Name */}
            <col style={{ width: 68 }} />
            {/* GA */}
            <col style={{ width: 62 }} />
            {/* PCA */}
            <col style={{ width: 62 }} />
            {/* BW */}
            <col style={{ width: 68 }} />
            {/* Diagnosis — flex */}
            <col />
            {/* DOL */}
            <col style={{ width: 48 }} />
            {/* Current wt */}
            <col style={{ width: 78 }} />
            {/* Δ */}
            <col style={{ width: 108 }} />
            {/* Status — wide enough for the "NEEDS ENTRY" badge below the
                Active line; the table is `tableLayout: fixed`, so a narrower
                column clips the badge under the action buttons instead of
                wrapping it. Diagnosis is the flex column that gives up the
                space. */}
            <col style={{ width: 118 }} />
            {/* Actions */}
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Bed</th>
              <th>Name</th>
              <th>GA</th>
              <th>PCA</th>
              <th>BW (g)</th>
              <th>Diagnosis</th>
              <th>DOL</th>
              <th>Wt now</th>
              <th>Δ birth</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {activeSorted.map(p => {
              // D_R.lastWeighed, not the raw last array element — same as the
              // mobile card above. A length/HC-only measurement is stored with
              // `w: null` (see MeasurementLogger), so the newest entry is not
              // necessarily a weighed one: taking it blind showed "— g" for the
              // weight and a Δ of `null - bw`, i.e. every such patient reading
              // as −100% of birth weight, in critical red, on the ward list.
              const last     = D_R.lastWeighed(p) || null;
              const dol      = D_R.liveDol(p);
              const delta    = last ? last.w - p.bw : 0;
              const deltaPct = (delta / p.bw) * 100;
              const entries  = log[p.sessionId] || [];
              const lastEntry = entries[entries.length - 1];
              const hasToday  = loggedSet.has(p.sessionId);
              const isSelected = p.sessionId === activeId;

              return (
                <tr key={p.sessionId}
                    className={isSelected ? "p-active" : ""}
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelect(p.sessionId)}
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(p.sessionId); } }}>
                  <td><span className="chip"><span className="d" />{p.currentBed}</span></td>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name || p.initials || "—"}</div>
                    {p.twinSuffix && <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{multiplesLabel(p)}</div>}
                  </td>
                  <td className="num" style={{ fontWeight: 600, color: "var(--brand-2)" }}>
                    {D_R.fmtGA(p.ga)}
                  </td>
                  <td className="num" style={{ fontWeight: 600, color: "var(--ok)" }}>
                    {D_R.fmtGA(D_R.pmaShort(p.ga, dol))}
                  </td>
                  <td className="num">{p.bw.toLocaleString()}</td>
                  <td style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.diagnosis}</td>
                  <td className="num" style={{ fontWeight: 700, color: "var(--brand-2)", fontSize: 15 }}>{dol}</td>
                  <td className="num">{last ? `${last.w.toLocaleString()} g` : "—"}</td>
                  <td className="num" style={{ color: !last ? "var(--ink-3)" : deltaPct < -10 ? "var(--crit)" : deltaPct < 0 ? "var(--warn-ink)" : "var(--ok)", fontWeight: 600 }}>
                    {last ? <>
                      {delta >= 0 ? "+" : ""}{delta} g
                      <span style={{ fontWeight: 400, color: "var(--ink-3)", fontSize: 11, marginLeft: 3 }}>({D_R.displayNum(deltaPct, 1)}%)</span>
                    </> : "—"}
                  </td>
                  <td>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11, color:"var(--ok)", fontWeight:600 }}>
                      <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--ok)", flexShrink:0 }} />
                      Active
                    </span>
                    {/* Same today's-entry state as the mobile card — the table
                        computed it already but never showed it. */}
                    <div style={{ marginTop: 3 }}>
                      <span className={"log-badge" + (hasToday ? " is-logged" : "")}
                            title={hasToday ? "บันทึกวันนี้แล้ว"
                              : lastEntry ? `บันทึกล่าสุด DOL ${lastEntry.dol}` : "ยังไม่มีบันทึก"}>
                        {hasToday ? "✓ LOGGED" : "NEEDS ENTRY"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      <button className="btn sm" title="ย้ายเตียง"
                        onClick={e => { e.stopPropagation(); setTransferPatient(p); }}
                        style={{ padding: "0 8px", fontSize: 13 }}>⇄</button>
                      <button className="btn sm" style={{ padding: "0 8px" }}
                        onClick={e => { e.stopPropagation(); setEditPatient(p); }}>Edit</button>
                      <button className="btn sm" style={{ padding: "0 8px",
                        background: "var(--brand)", color: "#fff", borderColor: "var(--brand-2)" }}
                        onClick={e => { e.stopPropagation(); onSelect(p.sessionId); }}>
                        Open <Icon name="arrow" size={11} color="#fff" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Archived section */}
            {archivedSorted.length > 0 && (
              <tr>
                <td colSpan={11} style={{ padding: "6px 12px", background: "var(--bg-2)", borderTop: "2px solid var(--line)" }}>
                  <button className="btn sm" style={{ color: "var(--ink-3)", fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); setShowArchived(s => !s); }}>
                    {showArchived ? "▲" : "▼"} Discharged / Transferred / Expired ({archivedSorted.length})
                  </button>
                </td>
              </tr>
            )}
            {showArchived && archivedSorted.map(p => (
              <tr key={p.sessionId} style={{ opacity: 0.5, cursor: "pointer" }}
                  onClick={() => onSelect(p.sessionId)}>
                <td><span className="chip"><span className="d" />{p.currentBed}</span></td>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{p.name || p.initials || "—"}</td>
                <td className="num">{D_R.fmtGA(p.ga)}</td>
                <td className="num">{D_R.fmtGA(D_R.pmaShort(p.ga, D_R.liveDol(p)))}</td>
                <td className="num">{p.bw.toLocaleString()}</td>
                <td style={{ color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.diagnosis}</td>
                {/* DOL · Wt now · Δ birth — three columns, matching the 11 in
                    <thead>. colSpan 4 pushed Status and the actions cell one
                    column past the header, so every archived row's status chip
                    sat under the wrong heading. */}
                <td colSpan={3} />
                <td><span className="chip"><span className="d" />{p.status}</span></td>
                <td style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button className="btn sm" onClick={e => { e.stopPropagation(); setEditPatient(p); }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            {filter ? "ไม่พบผู้ป่วยที่ตรงกันทั้ง unit" : `ยังไม่มีผู้ป่วยใน ${ward === "other" ? "กลุ่มนี้" : ward} — กด New session เพื่อเริ่มต้น`}
          </div>
        )}
      </div>

      {/* All three get the FULL census, not the ward-filtered list — a bed is
          occupied by whoever is in it, including a patient the ward gate is
          currently hiding from view. */}
      {/* Each modal closes itself once its request succeeds (useModalSubmit). */}
      {showAdd          && <NewPatientModal patients={patients} onClose={() => setShowAdd(false)} onSubmit={p => onAdd(p)} />}
      {editPatient      && <EditPatientModal patient={editPatient} patients={patients} onClose={() => setEditPatient(null)}
        onSubmit={p => onEdit?.(p)} onDelete={onDelete} />}
      {transferPatient  && <TransferBedModal patient={transferPatient} patients={patients} onClose={() => setTransferPatient(null)}
        onSubmit={p => onEdit?.(p)} />}
    </>
  );
}

// The gestational ages a session may carry: 22–43 wk. Both modals offer
// exactly this list and nothing else, so a GA outside it cannot be registered
// *or* saved onto an existing session — an out-of-range record (imported, or
// typed straight into the sheet) has to be given a real GA before it can be
// saved again, rather than being carried along as a pickable option. GA drives
// the Fenton percentile and the `ga < 32` HMF threshold; neither means
// anything at 20 wk or 50 wk.
const GA_WEEK_OPTIONS = Array.from({ length: 22 }, (_, i) => 22 + i);

// The canonical bed list now lives in data.js (D_R.BED_OPTIONS), next to
// normalizeBed and the occupancy helpers — the ward gate and the "one patient
// per bed" guard need it too, and only one of the three is a dropdown.
// Referenced through D_R rather than aliased to a local `const BED_OPTIONS`:
// data.js and this file are two plain <script> tags sharing one global
// lexical scope, so a second top-level `const` of that name is a redeclaration
// that kills the whole page at parse time.

// The ONLY bed picker in the app — every place a bed can be set (register,
// edit, transfer) renders this, so "a bed is one of BED_OPTIONS" holds
// everywhere by construction rather than by three modals happening to agree.
//
// Two rules a bare <select> over BED_OPTIONS got wrong, both of which are how
// the "NICU 1-1" report happened in the first place:
//
//  1. **A value with no matching <option> renders BLANK.** The old default
//     was the literal "NICU 1-1", which is not a real bed, so the control
//     showed nothing while still submitting that string. Any value outside
//     BED_OPTIONS — a legacy record, a bed typed straight into the sheet —
//     has the same problem. So an unrecognized current value is carried as an
//     extra, clearly-labelled option: it stays visible and re-selectable, but
//     it is never something a user can newly *pick*.
//  2. **Blank must stay blank.** A patient with no bed recorded used to fall
//     back to a hardcoded default, so merely editing their diagnosis silently
//     admitted them to that bed. `allowUnassigned` renders an explicit
//     "ยังไม่ระบุเตียง" choice instead; the caller decides whether an empty
//     value is submittable.
//
// `occupancy` (a bed → patient Map from D.bedOccupancy, already excluding the
// patient being edited) makes the one-patient-per-bed rule visible where the
// bed is picked: a bed someone else is in is listed with their name and is
// not selectable. It is shown rather than hidden on purpose — "SCN 4 · ไม่ว่าง
// (สมชาย)" tells you to move that patient first, while a silently missing
// SCN 4 reads as a bug in the dropdown. The guard is re-checked on save in
// every modal, and again in the backend, because a stale `patients` snapshot
// (another nurse admitting on another device) can make this list wrong.
function BedSelect({ value, onChange, allowUnassigned = false, style, occupancy }) {
  const current = D_R.normalizeBed(value);
  const isKnown = current === "" || D_R.BED_OPTIONS.includes(current);
  const takenBy = (b) => occupancy?.get(b);
  return (
    <select className="sel" style={style} value={current}
      onChange={e => onChange(e.target.value)}>
      {(allowUnassigned || current === "") &&
        <option value="">— ยังไม่ระบุเตียง —</option>}
      {D_R.BED_OPTIONS.map(b => {
        const holder = takenBy(b);
        // The patient's own current bed is never disabled: `occupancy` is
        // built with their sessionId excluded, so this can only fire for
        // someone else's bed.
        return <option key={b} value={b} disabled={!!holder}>
          {holder ? `${b} · ไม่ว่าง (${holder.name || holder.sessionId})` : b}
        </option>;
      })}
      {!isKnown && <option value={current}>{current} (ไม่อยู่ในรายการเตียง)</option>}
    </select>
  );
}

// The one message the three modals show when a bed is already taken. Says who
// is in it and what to do about it, because "เตียงไม่ว่าง" alone leaves the
// user clicking the same disabled option again.
const bedTakenMsg = (bed, holder) =>
  `เตียง ${bed} มี ${holder.name || holder.sessionId} อยู่แล้ว — ` +
  `ต้องย้าย ${holder.name || holder.sessionId} ออกก่อน (Transfer) จึงจะบันทึกเตียงนี้ได้`;

// Submit for the three patient modals (review UP-S9). They used to close the
// instant Register / Save / Confirm was pressed, before the server had said
// anything — so a refusal (a bed taken on another device, a sessionId that
// already exists) arrived as a toast over an empty registry, and everything
// typed into the form was gone. Now the modal stays open while the request is
// out ("กำลังบันทึก…"), closes itself only on success, and shows the reason in
// place otherwise, with every field as the user left it.
//
// `onSubmit` may return the request's promise (app.jsx does) or nothing at all
// (local mode, and the harnesses that mount a modal on its own). Nothing, or
// anything without `ok: false`, is success — which keeps a synchronous caller
// exactly as it was: submit, then close.
function useModalSubmit(onSubmit, onClose) {
  const [busy, setBusy]   = React.useState(false);
  const [error, setError] = React.useState("");
  const busyRef    = React.useRef(false);
  const mountedRef = React.useRef(true);
  React.useEffect(() => () => { mountedRef.current = false; }, []);
  const fallback = "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง";
  const finish = (res) => {
    busyRef.current = false;
    if (!mountedRef.current) return;
    setBusy(false);
    if (res && res.ok === false) { setError(res.error || fallback); return; }
    onClose();
  };
  const submit = (payload) => {
    if (busyRef.current) return;
    setError("");
    let out;
    try { out = onSubmit(payload); }
    catch (e) { setError((e && e.message) || fallback); return; }
    if (!out || typeof out.then !== "function") { finish(out); return; }
    busyRef.current = true;
    setBusy(true);
    out.then(finish, (e) => finish({ ok: false, error: (e && e.message) || fallback }));
  };
  return { busy, error, submit };
}

// The error line all three modals show above their buttons.
function SubmitError({ error }) {
  if (!error) return null;
  return (
    <div role="alert" className="modal-submit-error" style={{ padding: "8px 12px", background: "var(--crit-bg)",
      border: "1px solid var(--crit-line)", borderRadius: 8, fontSize: 12, color: "var(--crit)", lineHeight: 1.5 }}>
      {error}
    </div>
  );
}

function NewPatientModal({ patients, onClose, onSubmit }) {
  const today = D_R.todayLocal();   // local date, not UTC
  const [name, setName]         = React.useState("");
  const [bw, setBw]             = React.useState(0);
  const [gaW, setGaW]           = React.useState("");
  const [gaD, setGaD]           = React.useState("");
  const [hc, setHc]             = React.useState(0);
  const [len, setLen]           = React.useState(0);
  const [twin, setTwin]         = React.useState("");
  const [multiplesCount, setMultiplesCount] = React.useState("");
  const [sex, setSex]           = React.useState("boys");
  // Default must be a real BED_OPTIONS value. It used to be the literal
  // "NICU 1-1", which no <option> matched — so the dropdown rendered blank
  // while the state still submitted that string, filing every patient
  // registered without touching the field under a bed that does not exist.
  // Now it is the lowest free NICU bed, computed once on open: seeding a
  // fixed "NICU 1" put every admission on an occupied bed by default, which
  // the save guard below would then refuse. Falls back to unassigned when
  // NICU is full — the user picks, rather than being defaulted onto a bed
  // that is someone else's.
  const [bed, setBed]           = React.useState(() => D_R.nextFreeBed(patients, "NICU"));
  // Who is in which bed right now. No exclusion: a session being registered
  // holds no bed yet, so every occupied bed belongs to somebody else.
  const occupancy = React.useMemo(() => D_R.bedOccupancy(patients), [patients]);
  const bedTaken  = occupancy.get(D_R.normalizeBed(bed)) || null;
  const [dx, setDx]             = React.useState("");
  const [admitDate, setAdmitDate] = React.useState(today);
  const [admitDol, setAdmitDol]   = React.useState(1);

  // GA stored as WW.D shorthand (e.g. 26+4 → 26.4), not decimal weeks
  const ga = gaW !== "" ? parseInt(gaW) + parseInt(gaD || 0) / 10 : 0;
  const sessionId = `${(name || "XX").slice(0, 2).toUpperCase()}-BW${bw}${twin ? "-" + twin : ""}`;

  // Birth weight and GA feed every downstream nutrition calculation (targets,
  // Fenton percentile, HMF threshold) — a 0/blank value here would silently
  // corrupt every subsequent dose for this patient, so block submission on it.
  // …and one infant per bed: registering onto an occupied bed would leave two
  // patients reading as the same bed on every board and handover sheet.
  const canSubmit = name.trim().length > 0 && bw > 0 && gaW !== "" && !bedTaken;
  const { busy, error: submitError, submit } = useModalSubmit(onSubmit, onClose);

  // DOB = admitDate − (admitDol − 1) days
  // Via addDaysToDateStr, which is UTC-anchored end to end. The previous
  // version built a LOCAL-midnight Date and rendered it with toISOString(),
  // which crosses back over the +07:00 offset — so it returned a DOB one day
  // early for EVERY patient at EVERY hour, not just on night shift. With
  // admitDol = 1 (no shift at all) a baby admitted on its birth date still got
  // the day before. Fixed 2026-08-08.
  const dob = React.useMemo(() => {
    if (!admitDate) return today;
    return D_R.addDaysToDateStr(admitDate, -(Math.max(1, parseInt(admitDol) || 1) - 1));
  }, [admitDate, admitDol]);

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
        <div className="picker-h" style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Register new session</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ padding: 18 }}>
          <div className="row-3">
            <div className="field">
              <label>ชื่อย่อ <span className="unit">(อักษรแรกของชื่อ + นามสกุล)</span></label>
              <input className="inp" maxLength={2} value={name} onChange={e => setName(e.target.value)} placeholder="เช่น  ปพ" />
            </div>
            <div className="field">
              <label>Multiples <span className="unit">(optional)</span></label>
              <select className="sel" value={twin} onChange={e => {
                setTwin(e.target.value);
                if (!e.target.value) setMultiplesCount("");
              }}>
                <option value="">—</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
              </select>
            </div>
            <div className="field">
              <label>How many <span className="unit">(twin/triplet/quad)</span></label>
              <select className="sel" value={multiplesCount} disabled={!twin} onChange={e => setMultiplesCount(e.target.value)}>
                <option value="">—</option>
                <option value="2">2 · Twin</option>
                <option value="3">3 · Triplet</option>
                <option value="4">4 · Quadruplet</option>
              </select>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <div className="row-3">
            <div className="field">
              <label>Birth weight <span className="unit">(g)</span></label>
              <input type="number" min="0" className="inp" value={bw || ""} onChange={e => setBw(Math.max(0, parseInt(e.target.value) || 0))} placeholder="0" />
            </div>
            <div className="field">
              <label>GA <span className="unit">(weeks + days)</span></label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <select className="sel" value={gaW} onChange={e => setGaW(e.target.value)} style={{ flex: 1 }}>
                  <option value="">wk</option>
                  {GA_WEEK_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>+</span>
                <select className="sel" value={gaD} onChange={e => setGaD(e.target.value)} style={{ width: 68 }}>
                  <option value="">d</option>
                  {[0,1,2,3,4,5,6].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Sex</label>
              <select className="sel" value={sex} onChange={e => setSex(e.target.value)}>
                <option value="boys">Male</option><option value="girls">Female</option>
              </select>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <div className="row-2">
            <div className="field">
              <label>Admit date</label>
              <input type="date" className="inp" value={admitDate} onChange={e => setAdmitDate(e.target.value)} />
            </div>
            <div className="field">
              <label>DOL at admit</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" className="inp" min={1} style={{ flex: 1 }} value={admitDol}
                  onChange={e => {
                    const v = e.target.value;
                    setAdmitDol(v === "" ? "" : Math.max(1, parseInt(v, 10) || 1));
                  }} />
                {admitDol > 1 && (
                  <span style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                    DOB: {dob}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <div className="row-2">
            <div className="field">
              <label>Length at birth <span className="unit">(cm)</span></label>
              <input type="number" min="0" className="inp" step={0.1} value={len || ""} onChange={e => setLen(Math.max(0, parseFloat(e.target.value) || 0))} placeholder="0" />
            </div>
            <div className="field">
              <label>HC at birth <span className="unit">(cm)</span></label>
              <input type="number" min="0" className="inp" step={0.1} value={hc || ""} onChange={e => setHc(Math.max(0, parseFloat(e.target.value) || 0))} placeholder="0" />
            </div>
          </div>
          <div style={{ height: 10 }} />
          <div className="row-2">
            <div className="field">
              <label>Bed</label>
              <BedSelect value={bed} onChange={setBed} allowUnassigned occupancy={occupancy} />
              {bedTaken && (
                <div style={{ fontSize: 11, color: "var(--crit)", marginTop: 4 }}>
                  {bedTakenMsg(D_R.normalizeBed(bed), bedTaken)}
                </div>
              )}
            </div>
            <div className="field">
              <label>Diagnosis</label>
              <input className="inp" value={dx} onChange={e => setDx(e.target.value)} placeholder="ELBW · RDS …" />
            </div>
          </div>
          {submitError && <div style={{ marginTop: 14 }}><SubmitError error={submitError} /></div>}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 20 }}>
            {!canSubmit && (
              <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginRight: "auto" }}>
                {bedTaken ? "เลือกเตียงที่ว่างก่อนลงทะเบียน" : "กรอกชื่อย่อ · น้ำหนักแรกเกิด · GA ให้ครบก่อนลงทะเบียน"}
              </span>
            )}
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!canSubmit || busy} onClick={() => submit({
              sessionId, name, initials: name, bw, ga, twinSuffix: twin,
              multiplesCount: twin ? (parseInt(multiplesCount) || 0) : 0, sex,
              currentBed: D_R.normalizeBed(bed), diagnosis: dx, status: "Active",
              admissionDate: admitDate,
              dob,
              weights: [{ dol: parseInt(admitDol) || 1, w: bw, l: len || null, hc: hc || null }],
            })}>
              <Icon name="save" size={14} color="#fff" /> {busy ? "กำลังบันทึก…" : "Register"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Quick switcher (popup from topbar)
function PatientPicker({ patients, activeId, onSelect, onClose }) {
  const [q, setQ] = React.useState("");
  const ql = q.toLowerCase().trim();
  const filtered = patients
    .filter(p =>
      !ql ||
      (p.name || "").toLowerCase().includes(ql) ||
      (p.currentBed || "").toLowerCase().includes(ql)
    )
    .sort(bedSort);

  React.useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" onClick={e => e.stopPropagation()}>
        <div className="picker-h">
          <Icon name="search" size={16} color="var(--ink-3)" />
          <input placeholder="ค้นหา · เลขเตียง หรือ ชื่อย่อ" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ padding: "6px 0", maxHeight: 480, overflowY: "auto" }}>
          {filtered.map(p => (
            <div key={p.sessionId}
              className="picker-row"
              onClick={() => { onSelect(p.sessionId); onClose(); }}
              style={{
                display: "grid",
                gridTemplateColumns: "84px 96px 64px 76px 1fr",
                gap: 10,
                alignItems: "center", padding: "10px 18px", cursor: "pointer",
                background: p.sessionId === activeId ? "var(--brand-bg)" : undefined,
                borderBottom: "1px solid var(--line-2)"
              }}
              onMouseEnter={e => { if (p.sessionId !== activeId) e.currentTarget.style.background = "var(--bg-2)"; }}
              onMouseLeave={e => { if (p.sessionId !== activeId) e.currentTarget.style.background = ""; }}
            >
              <span className="chip" style={{ justifySelf: "start" }}><span className="d" />{p.currentBed}</span>
              <span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name || p.initials || "—"}</span>
                {/* Twins/multiples share initials by construction and are usually in
                    adjacent beds — without this label, two rows here can look identical
                    except for the small bed chip. Same label the registry table/cards
                    already show (multiplesLabel above); this is the one place it was missing. */}
                {p.twinSuffix && <span style={{ display: "block", fontSize: 10.5, color: "var(--ink-3)" }}>{multiplesLabel(p)}</span>}
              </span>
              <span className="mono" style={{ fontSize: 12, color: "var(--brand-2)", fontWeight: 600 }}>{D_R.fmtGA(p.ga)}</span>
              <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>{p.bw.toLocaleString()}g</span>
              <span style={{ color: "var(--ink-3)", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.diagnosis || "—"}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>ไม่พบผู้ป่วย</div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditPatientModal({ patient, patients, onClose, onSubmit, onDelete }) {
  const today = D_R.todayLocal();   // local date, not UTC
  const [name, setName]         = React.useState(patient.name || patient.initials || "");
  // Birth weight, GA and sex are corrections of what was typed at
  // registration, not new clinical events — and every one of them silently
  // rescales the whole chart downstream if it is wrong: the ESPGHAN kcal /
  // protein bands and fluid targets are per-kg of the *current* weight but
  // anchored on birth weight for the Δ-birth and growth-velocity readouts,
  // `ga` drives the Fenton percentile and the `ga < 32` HMF threshold, and
  // `sex` picks which Fenton curve set is plotted. Until 2026-08-19 they were
  // read-only chips here, so a transposed "1090 → 1900" could only be fixed by
  // deleting the session and re-registering it — which takes the entire
  // Daily_Log with it (deletePatient drops every row for the sessionId).
  //
  // sessionId is deliberately NOT re-derived when bw changes. It is the key
  // Patient_Registry and Daily_Log are matched on (registerPatient's upsert,
  // updateDailyNutrition, deletePatient all scan for it), so regenerating it
  // would leave the patient's whole log stranded under an id nothing points
  // at any more. The BW baked into the id is a label from the day it was
  // issued; `patient.bw` is the clinical value, and that is what every
  // calculation reads. Same reason editing ชื่อในวงการ has never renamed it.
  const [bw, setBw]             = React.useState(patient.bw || 0);
  // Decode through gaTotalDays, not Math.floor/×10 by hand, so a hand-edited
  // sheet value like 27.9 seeds the selects as 27+6 — exactly what every
  // other reader of this field already decodes it to.
  //
  // A stored GA outside GA_WEEK_OPTIONS is NOT carried as an extra option the
  // way BedSelect carries an off-list bed: an unrecognized bed label is still
  // a real place, while a GA of 20 or 50 wk is a data error that every
  // downstream calculation would keep reading. It seeds blank instead, which
  // leaves the save button disabled until a real GA is picked.
  const gaTd                    = D_R.gaTotalDays(patient.ga);
  const gaStoredW               = Math.floor(gaTd / 7);
  const gaInRange               = GA_WEEK_OPTIONS.includes(gaStoredW);
  const [gaW, setGaW]           = React.useState(gaInRange ? String(gaStoredW) : "");
  const [gaD, setGaD]           = React.useState(gaInRange ? String(gaTd % 7) : "");
  // A sex the Fenton chart cannot use ("M" typed into the sheet and not caught
  // by app.jsx's normalizeSex, a blank cell) seeds BLANK and must be picked
  // before saving. It used to seed "boys" silently, so editing the diagnosis
  // re-saved an unknown sex as male (review UP-S4).
  const sexKnown                = patient.sex === "boys" || patient.sex === "girls";
  const [sex, setSex]           = React.useState(sexKnown ? patient.sex : "");
  // Seeded from the patient's own bed, normalized (so a legacy "NICU 1-1"
  // preselects the real "NICU 1" rather than leaving the dropdown blank and
  // silently re-saving the bogus value) — and with **no fallback bed**: a
  // patient with none recorded stays unassigned here, so editing their
  // diagnosis can't quietly admit them to whatever bed the default happened
  // to name. BedSelect renders the explicit "ยังไม่ระบุเตียง" choice for that.
  const [bed, setBed]           = React.useState(D_R.normalizeBed(patient.currentBed));
  // This patient is excluded, so re-saving them on the bed they are already
  // in is never blocked — only moving them onto someone else's is. That is
  // the whole difference between "save again" and "double-book".
  const occupancy = React.useMemo(
    () => D_R.bedOccupancy(patients, patient.sessionId), [patients, patient.sessionId]);
  const [dx, setDx]             = React.useState(patient.diagnosis || "");
  const [status, setStatus]     = React.useState(patient.status || "Active");
  // Asks about the record as it would be saved — with the status picked here,
  // not the stored one — so a discharged record can be corrected after its old
  // bed is reused, while setting it back to Active on that bed is still refused.
  const bedTaken  = D_R.bedBlocker(patients, { sessionId: patient.sessionId, status, currentBed: bed });
  const [dol1, setDol1]         = React.useState(patient.weights?.[0]?.dol ?? 1);
  const [admitDate, setAdmitDate] = React.useState(patient.admissionDate || today);

  // GA stored as WW.D shorthand (e.g. 26+4 → 26.4), not decimal weeks — same
  // encoding NewPatientModal writes; see the GA/PMA section of the walkthrough.
  const ga = gaW !== "" ? parseInt(gaW, 10) + parseInt(gaD || 0, 10) / 10 : 0;
  // Same gate as registration: a 0/blank BW or GA would corrupt every
  // subsequent dose for this patient, so it can be corrected but not cleared.
  const canSave = bw > 0 && gaW !== "" && sex !== "" && !bedTaken;
  const { busy, error: submitError, submit } = useModalSubmit(onSubmit, onClose);

  // Permanently deletes the session — removes it from Patient_Registry and
  // every Daily_Log row for it on the server (`handleDeletePatient` in
  // app.jsx → the `deletePatient` GAS action), not just this browser's view.
  // Used to be local-only (see HANDOFF.md for why that stopped being enough:
  // the next reload/sync just pulled the same row back in), so the confirm
  // below is now the only thing standing between a click and an
  // unrecoverable deletion — worded accordingly. onDelete is only ever
  // passed in for admins (gated at the call site in app.jsx), same as the
  // Dashboard's per-entry trash icon.
  const handleDelete = () => {
    if (!onDelete) return;
    const label = patient.name || patient.sessionId;
    if (!window.confirm(
      `ลบ session ${label} ถาวรใช่หรือไม่? ข้อมูลผู้ป่วยและบันทึกประจำวันทั้งหมดของ session นี้จะถูกลบออกจากระบบ — การลบนี้ไม่สามารถย้อนกลับได้`
    )) return;
    onDelete(patient);
    onClose();
  };

  // statusDate marks when the patient left Active (Discharged/Transferred/
  // Expired) — the registry list uses it to auto-hide the name after 7 days.
  // Re-stamped only when the status actually changes so re-saving the same
  // archived status doesn't keep resetting the 7-day clock.
  const save = () => {
    const prevStatus = patient.status || "Active";
    // An Active record that had no statusDate keeps the exact empty value it
    // came with ("" from the sheet), rather than turning it into null. Under
    // the three-way merge (app.jsx handleEditPatient, UP-S1) a field that
    // differs from `base` counts as changed — and a phantom "" → null change
    // would blank the statusDate another device had just stamped on a
    // discharge.
    const statusDate = status === "Active"
      ? (prevStatus === "Active" && !patient.statusDate ? (patient.statusDate ?? null) : null)
      : (status !== prevStatus || !patient.statusDate) ? today : patient.statusDate;
    // weights[0] is the measurement NewPatientModal seeds from the birth
    // weight, so a corrected BW has to carry into it or the Fenton chart and
    // the registry's "Δ birth" keep plotting the typo. Only when it still
    // matches the old bw, though: once someone has edited that first row on
    // its own (or the patient was admitted at DOL > 1, where it is an
    // admission weight rather than a birth weight that happens to differ),
    // it is a real measurement and not ours to overwrite.
    const bwChanged = Number(bw) !== Number(patient.bw);
    const weights = (patient.weights || []).map((w, i) => i !== 0 ? w : {
      ...w,
      dol: Number(dol1) || 1,
      ...(bwChanged && Number(w.w) === Number(patient.bw) ? { w: Number(bw) } : {}),
    });
    submit({
      ...patient,
      name, initials: name,
      bw: Number(bw), ga, sex,
      currentBed: D_R.normalizeBed(bed),
      diagnosis: dx,
      status,
      statusDate,
      admissionDate: admitDate,
      weights,
    });
  };

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
        <div className="picker-h" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Edit session · {patient.sessionId}</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row-3">
            <div className="field">
              <label>Birth weight <span className="unit">(g)</span></label>
              <input type="number" min="0" className="inp" value={bw || ""}
                onChange={e => setBw(Math.max(0, parseInt(e.target.value, 10) || 0))} placeholder="0" />
            </div>
            <div className="field">
              <label>GA <span className="unit">(weeks + days)</span></label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <select className="sel" value={gaW} onChange={e => setGaW(e.target.value)} style={{ flex: 1 }}>
                  <option value="">wk</option>
                  {GA_WEEK_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>+</span>
                <select className="sel" value={gaD} onChange={e => setGaD(e.target.value)} style={{ width: 64 }}>
                  <option value="">d</option>
                  {[0,1,2,3,4,5,6].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Sex</label>
              <select className="sel" value={sex} onChange={e => setSex(e.target.value)}>
                {sex === "" && <option value="">— เลือก —</option>}
                <option value="boys">Male</option><option value="girls">Female</option>
              </select>
            </div>
          </div>
          {!sexKnown && (
            <div style={{ padding: "8px 12px", background: "var(--warn-bg)", border: "1px solid var(--warn-line)", borderRadius: 8, fontSize: 11.5, color: "var(--warn-ink)", lineHeight: 1.5 }}>
              เพศในทะเบียนของ session นี้ไม่ถูกต้อง{patient.sex ? <> (<strong>{String(patient.sex)}</strong>)</> : null} —
              เลือก Male หรือ Female ก่อนจึงจะบันทึกได้ (ใช้เลือกกราฟ Fenton)
            </div>
          )}
          {gaTd > 0 && !gaInRange && (
            <div style={{ padding: "8px 12px", background: "var(--warn-bg)", border: "1px solid var(--warn-line)", borderRadius: 8, fontSize: 11.5, color: "var(--warn-ink)", lineHeight: 1.5 }}>
              GA เดิมของ session นี้ (<strong>{D_R.fmtGA(patient.ga)} wk</strong>) อยู่นอกช่วง 22–43 wk ที่ระบบรองรับ —
              เลือก GA ใหม่ก่อนจึงจะบันทึกได้
            </div>
          )}
          {Number(bw) !== Number(patient.bw) && bw > 0 && (
            <div style={{ padding: "8px 12px", background: "var(--bg-2)", borderRadius: 8, fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
              แก้ BW จาก <strong>{patient.bw} g</strong> เป็น <strong>{bw} g</strong> — เป้าหมายสารอาหารและกราฟ Fenton
              จะคำนวณใหม่ทั้งหมด ส่วนรหัส session <strong>{patient.sessionId}</strong> ยังคงเดิม (เป็นคีย์ของบันทึกประจำวันทุกรายการ)
            </div>
          )}
          <div className="row-2">
            <div className="field">
              <label>ชื่อในวงการ</label>
              <input className="inp" maxLength={2} value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>DOL แรกรับ</label>
              <input type="number" className="inp" min={1} value={dol1}
                onChange={e => {
                  const v = e.target.value;
                  setDol1(v === "" ? "" : Math.max(1, parseInt(v, 10) || 1));
                }} />
            </div>
          </div>
          <div className="row-2">
            <div className="field">
              <label>Admit date</label>
              <input type="date" className="inp" value={admitDate} onChange={e => setAdmitDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Status</label>
              <select className="sel" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="Active">Active</option>
                <option value="Discharged">Discharged</option>
                <option value="Transferred">Transferred</option>
                <option value="Expired">Expired</option>
              </select>
            </div>
          </div>
          <div className="row-2">
            <div className="field">
              <label>Bed</label>
              <BedSelect value={bed} onChange={setBed} allowUnassigned occupancy={occupancy} />
            </div>
            <div className="field">
              <label>Diagnosis</label>
              <input className="inp" value={dx} onChange={e => setDx(e.target.value)} placeholder="ELBW · RDS …" />
            </div>
          </div>
          {!canSave && (
            <div style={{ fontSize: 11.5, color: bedTaken ? "var(--crit)" : "var(--ink-3)", textAlign: "right" }}>
              {bedTaken ? bedTakenMsg(D_R.normalizeBed(bed), bedTaken)
                : sex === "" ? "ต้องระบุเพศก่อนบันทึก"
                : "ต้องระบุน้ำหนักแรกเกิด · GA ก่อนบันทึก"}
            </div>
          )}
          <SubmitError error={submitError} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            {onDelete && (
              <button className="btn" style={{ marginRight: "auto", color: "var(--crit)", borderColor: "var(--crit-line)" }}
                onClick={handleDelete} disabled={busy}>
                <Icon name="trash" size={14} color="var(--crit)" /> Delete session
              </button>
            )}
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!canSave || busy} onClick={save}><Icon name="save" size={14} color="#fff" /> {busy ? "กำลังบันทึก…" : "Save changes"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Transfer bed modal ───────────────────────────────────────
// Moving a patient out of NICU is the one bed change that happens on a
// schedule (step-down to SCN), and the ward numbers its SCN beds by running
// order rather than by geography — so the ward buttons here jump straight to
// the next free number in a ward instead of making the user read down a
// 30-entry dropdown for the first gap. The dropdown is still there for a
// deliberate pick; occupied beds are disabled in both paths.
function TransferBedModal({ patient, patients, onClose, onSubmit }) {
  // Both sides normalized so a legacy "NICU 1-1" record preselects "NICU 1"
  // and re-picking that same bed still counts as "no change" (rather than
  // writing a spurious bedHistory hop from "NICU 1-1" to "NICU 1").
  const currentBed = D_R.normalizeBed(patient.currentBed);
  const [bed, setBed] = React.useState(currentBed);
  // Excludes this patient: their own bed is not an obstacle to moving them.
  const occupancy = React.useMemo(
    () => D_R.bedOccupancy(patients, patient.sessionId), [patients, patient.sessionId]);
  const bedTaken = occupancy.get(D_R.normalizeBed(bed)) || null;
  const { busy, error: submitError, submit } = useModalSubmit(onSubmit, onClose);

  // Next free running number per ward, recomputed as the census changes. ""
  // means the ward is full — the button is disabled rather than clearing the
  // selection, since "no free bed" must never read as "unassign".
  const WARDS = ["NICU", "iso", "SCN"];
  const nextFree = React.useMemo(() => {
    const out = {};
    WARDS.forEach(w => { out[w] = D_R.nextFreeBed(patients, w, patient.sessionId); });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, patient.sessionId]);

  const save = () => {
    const next = D_R.normalizeBed(bed);
    if (!next || next === currentBed) { onClose(); return; }
    // Re-checked here and not only at the dropdown: `patients` is a synced
    // snapshot, so another device can have filled this bed since it loaded.
    // The backend refuses it a third time — this is the message that explains
    // what to do about it.
    const holder = occupancy.get(next);
    if (holder) { window.alert(bedTakenMsg(next, holder)); return; }
    const bedHistory = [
      ...(patient.bedHistory || []),
      { bed: currentBed, date: D_R.todayLocal() },   // local date, not UTC
    ];
    submit({ ...patient, currentBed: next, bedHistory });
  };

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div className="picker-h" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Transfer bed · {patient.name || patient.initials}</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>

          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ink-2)" }}>
            <span className="chip"><span className="d" />{currentBed || "—"}</span>
            <span style={{ color: "var(--ink-3)" }}>→</span>
            <BedSelect value={bed} onChange={setBed} style={{ flex: 1 }} occupancy={occupancy} />
          </div>

          {/* Next free running number per ward — one tap for the common
              NICU → SCN step-down. */}
          <div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 6 }}>ย้ายไปเตียงว่างถัดไป</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {WARDS.map(w => (
                <button key={w} className={`btn${bed === nextFree[w] && nextFree[w] ? " primary" : ""}`}
                  style={{ fontSize: 12 }}
                  disabled={!nextFree[w]}
                  onClick={() => setBed(nextFree[w])}>
                  {w} · {nextFree[w] || "เต็ม"}
                </button>
              ))}
            </div>
          </div>

          {bedTaken && (
            <div style={{ fontSize: 11.5, color: "var(--crit)" }}>
              {bedTakenMsg(D_R.normalizeBed(bed), bedTaken)}
            </div>
          )}

          {/* Bed history */}
          {(patient.bedHistory || []).length > 0 && (
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Previous beds</div>
              {patient.bedHistory.map((h, i) => (
                <div key={i}>{D_R.normalizeBed(h.bed)} <span style={{ color: "var(--ink-4)" }}>until {h.date}</span></div>
              ))}
            </div>
          )}

          <SubmitError error={submitError} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={save}
              disabled={!bed || D_R.normalizeBed(bed) === currentBed || !!bedTaken || busy}>
              <Icon name="save" size={14} color="#fff" /> {busy ? "กำลังบันทึก…" : "Confirm transfer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.PatientRegistry    = PatientRegistry;
window.PatientPicker      = PatientPicker;
window.EditPatientModal   = EditPatientModal;
