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

function PatientRegistry({ patients, activeId, log = {}, onSelect, onAdd, onEdit, onDelete }) {
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
  const q = filter.toLowerCase().trim();
  const filtered = patients.filter(p =>
    !q ||
    (p.name || "").toLowerCase().includes(q) ||
    (p.currentBed || "").toLowerCase().includes(q) ||
    (p.diagnosis || "").toLowerCase().includes(q)
  );
  const sorted   = [...filtered].sort(bedSort);
  const activeSorted   = sorted.filter(isActivePatient);
  // Discharged/Transferred/Expired patients drop off the registry 7 days
  // after their statusDate — the name shouldn't linger on the dashboard
  // once the case is old news. Patients archived before statusDate existed
  // (no value stored) stay visible since we can't tell their age.
  const ARCHIVE_VISIBLE_DAYS = 7;
  const daysSinceStatus = (p) => {
    if (!p.statusDate) return -1;
    const changed = new Date(p.statusDate + "T00:00:00");
    if (isNaN(changed)) return -1;
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
  const activePatients = patients.filter(isActivePatient);
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
          <h1>Patient registry</h1>
          <div className="sub">{patients.length} sessions · {totalActive} active</div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="reg-stats">
        <div className="reg-stat s-brand">
          <span className="reg-stat-val">{totalActive}</span>
          <span className="reg-stat-lbl">Active</span>
        </div>
        <div className="reg-stat">
          <span className="reg-stat-val">{patients.length}</span>
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
            placeholder="ค้นหา · ชื่อย่อ · เตียง · วินิจฉัย"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <button className="btn primary" style={{ whiteSpace: "nowrap" }} onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={14} color="#fff" /> New session
        </button>
      </div>

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
          const deltaColor = deltaPct < -10 ? "var(--crit)" : deltaPct < 0 ? "oklch(45% 0.13 65)" : "var(--ok)";
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
                    ? <><span className="num">{delta >= 0 ? "+" : ""}{delta}</span> g ({deltaPct.toFixed(1)}%)</>
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
            {filter ? "ไม่พบผู้ป่วยที่ตรงกัน" : "ยังไม่มีผู้ป่วยในระบบ"}
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
                  <td className="num" style={{ color: !last ? "var(--ink-3)" : deltaPct < -10 ? "var(--crit)" : deltaPct < 0 ? "oklch(45% 0.13 65)" : "var(--ok)", fontWeight: 600 }}>
                    {last ? <>
                      {delta >= 0 ? "+" : ""}{delta} g
                      <span style={{ fontWeight: 400, color: "var(--ink-3)", fontSize: 11, marginLeft: 3 }}>({deltaPct.toFixed(1)}%)</span>
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
            {filter ? "ไม่พบผู้ป่วยที่ตรงกัน" : "ยังไม่มีผู้ป่วยในระบบ — กด New session เพื่อเริ่มต้น"}
          </div>
        )}
      </div>

      {showAdd          && <NewPatientModal onClose={() => setShowAdd(false)} onSubmit={p => { onAdd(p); setShowAdd(false); }} />}
      {editPatient      && <EditPatientModal patient={editPatient} onClose={() => setEditPatient(null)}
        onSubmit={p => { onEdit?.(p); setEditPatient(null); }} onDelete={onDelete} />}
      {transferPatient  && <TransferBedModal patient={transferPatient} onClose={() => setTransferPatient(null)}
        onSubmit={p => { onEdit?.(p); setTransferPatient(null); }} />}
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

const BED_OPTIONS = [
  ...Array.from({ length: 12 }, (_, i) => `NICU ${i + 1}`),
  "iso 1-1", "iso 1-2",
  "iso 2-1", "iso 2-2",
  "iso 3-1", "iso 3-2", "iso 3-3", "iso 3-4",
  ...Array.from({ length: 10 }, (_, i) => `SCN ${i + 1}`),
];

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
function BedSelect({ value, onChange, allowUnassigned = false, style }) {
  const current = D_R.normalizeBed(value);
  const isKnown = current === "" || BED_OPTIONS.includes(current);
  return (
    <select className="sel" style={style} value={current}
      onChange={e => onChange(e.target.value)}>
      {(allowUnassigned || current === "") &&
        <option value="">— ยังไม่ระบุเตียง —</option>}
      {BED_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
      {!isKnown && <option value={current}>{current} (ไม่อยู่ในรายการเตียง)</option>}
    </select>
  );
}

function NewPatientModal({ onClose, onSubmit }) {
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
  const [bed, setBed]           = React.useState("NICU 1");
  const [dx, setDx]             = React.useState("");
  const [admitDate, setAdmitDate] = React.useState(today);
  const [admitDol, setAdmitDol]   = React.useState(1);

  // GA stored as WW.D shorthand (e.g. 26+4 → 26.4), not decimal weeks
  const ga = gaW !== "" ? parseInt(gaW) + parseInt(gaD || 0) / 10 : 0;
  const sessionId = `${(name || "XX").slice(0, 2).toUpperCase()}-BW${bw}${twin ? "-" + twin : ""}`;

  // Birth weight and GA feed every downstream nutrition calculation (targets,
  // Fenton percentile, HMF threshold) — a 0/blank value here would silently
  // corrupt every subsequent dose for this patient, so block submission on it.
  const canSubmit = name.trim().length > 0 && bw > 0 && gaW !== "";

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
                  onChange={e => setAdmitDol(Math.max(1, parseInt(e.target.value) || 1))} />
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
              <BedSelect value={bed} onChange={setBed} allowUnassigned />
            </div>
            <div className="field">
              <label>Diagnosis</label>
              <input className="inp" value={dx} onChange={e => setDx(e.target.value)} placeholder="ELBW · RDS …" />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 20 }}>
            {!canSubmit && (
              <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginRight: "auto" }}>
                กรอกชื่อย่อ · น้ำหนักแรกเกิด · GA ให้ครบก่อนลงทะเบียน
              </span>
            )}
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!canSubmit} onClick={() => onSubmit({
              sessionId, name, initials: name, bw, ga, twinSuffix: twin,
              multiplesCount: twin ? (parseInt(multiplesCount) || 0) : 0, sex,
              currentBed: D_R.normalizeBed(bed), diagnosis: dx, status: "Active",
              admissionDate: admitDate,
              dob,
              weights: [{ dol: parseInt(admitDol) || 1, w: bw, l: len || null, hc: hc || null }],
            })}>
              <Icon name="save" size={14} color="#fff" /> Register
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
              <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name || p.initials || "—"}</span>
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

function EditPatientModal({ patient, onClose, onSubmit, onDelete }) {
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
  const [sex, setSex]           = React.useState(patient.sex === "girls" ? "girls" : "boys");
  // Seeded from the patient's own bed, normalized (so a legacy "NICU 1-1"
  // preselects the real "NICU 1" rather than leaving the dropdown blank and
  // silently re-saving the bogus value) — and with **no fallback bed**: a
  // patient with none recorded stays unassigned here, so editing their
  // diagnosis can't quietly admit them to whatever bed the default happened
  // to name. BedSelect renders the explicit "ยังไม่ระบุเตียง" choice for that.
  const [bed, setBed]           = React.useState(D_R.normalizeBed(patient.currentBed));
  const [dx, setDx]             = React.useState(patient.diagnosis || "");
  const [status, setStatus]     = React.useState(patient.status || "Active");
  const [dol1, setDol1]         = React.useState(patient.weights?.[0]?.dol ?? 1);
  const [admitDate, setAdmitDate] = React.useState(patient.admissionDate || today);

  // GA stored as WW.D shorthand (e.g. 26+4 → 26.4), not decimal weeks — same
  // encoding NewPatientModal writes; see the GA/PMA section of the walkthrough.
  const ga = gaW !== "" ? parseInt(gaW, 10) + parseInt(gaD || 0, 10) / 10 : 0;
  // Same gate as registration: a 0/blank BW or GA would corrupt every
  // subsequent dose for this patient, so it can be corrected but not cleared.
  const canSave = bw > 0 && gaW !== "";

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
    const statusDate = status === "Active"
      ? null
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
    onSubmit({
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
                <option value="boys">Male</option><option value="girls">Female</option>
              </select>
            </div>
          </div>
          {gaTd > 0 && !gaInRange && (
            <div style={{ padding: "8px 12px", background: "var(--warn-bg)", border: "1px solid var(--warn-line)", borderRadius: 8, fontSize: 11.5, color: "oklch(45% 0.13 65)", lineHeight: 1.5 }}>
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
              <input type="number" className="inp" min={1} value={dol1} onChange={e => setDol1(Math.max(1, parseInt(e.target.value, 10) || 1))} />
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
              <BedSelect value={bed} onChange={setBed} allowUnassigned />
            </div>
            <div className="field">
              <label>Diagnosis</label>
              <input className="inp" value={dx} onChange={e => setDx(e.target.value)} placeholder="ELBW · RDS …" />
            </div>
          </div>
          {!canSave && (
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", textAlign: "right" }}>
              ต้องระบุน้ำหนักแรกเกิด · GA ก่อนบันทึก
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            {onDelete && (
              <button className="btn" style={{ marginRight: "auto", color: "var(--crit)", borderColor: "var(--crit-line)" }}
                onClick={handleDelete}>
                <Icon name="trash" size={14} color="var(--crit)" /> Delete session
              </button>
            )}
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!canSave} onClick={save}><Icon name="save" size={14} color="#fff" /> Save changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Transfer bed modal ───────────────────────────────────────
function TransferBedModal({ patient, onClose, onSubmit }) {
  // Both sides normalized so a legacy "NICU 1-1" record preselects "NICU 1"
  // and re-picking that same bed still counts as "no change" (rather than
  // writing a spurious bedHistory hop from "NICU 1-1" to "NICU 1").
  const currentBed = D_R.normalizeBed(patient.currentBed);
  const [bed, setBed] = React.useState(currentBed);

  const save = () => {
    const next = D_R.normalizeBed(bed);
    if (!next || next === currentBed) { onClose(); return; }
    const bedHistory = [
      ...(patient.bedHistory || []),
      { bed: currentBed, date: D_R.todayLocal() },   // local date, not UTC
    ];
    onSubmit({ ...patient, currentBed: next, bedHistory });
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
            <BedSelect value={bed} onChange={setBed} style={{ flex: 1 }} />
          </div>

          {/* Bed history */}
          {(patient.bedHistory || []).length > 0 && (
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Previous beds</div>
              {patient.bedHistory.map((h, i) => (
                <div key={i}>{D_R.normalizeBed(h.bed)} <span style={{ color: "var(--ink-4)" }}>until {h.date}</span></div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={save}
              disabled={!bed || D_R.normalizeBed(bed) === currentBed}>
              <Icon name="save" size={14} color="#fff" /> Confirm transfer
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
