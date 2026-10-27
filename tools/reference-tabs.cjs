// tools/reference-tabs.cjs — the clinical reference tables, cell by cell (NF-28).
//
// Every clinical number the calculator reads comes from a table in data.js:
// EN_DB (feed composition), KCMH_STOCK (stock strengths), SUPP_DB (oral
// supplements), the limit constants, and the target bands (TPN_TARGETS,
// ENTERAL_TARGETS, TARGETS). The Sheet holds none of them. One wrong cell makes
// every order that reads it wrong, so each cell is checked against
// tools/reference-tabs.json:
//
//   - a number is a finite number, never a string that looks like one, with
//     the sign its column states and inside its stated range
//   - a range comes from the neofeed-clinical-rules skill when a CR- rule codes
//     the value (exact) or states it (the rule is named); a range no rule gives
//     is marked `proposed`, and the harness lists those for Pp
//   - every column has a unit header; a column the spec does not name fails
//   - every lookup key a dropdown, a default, a code reference or the backend
//     uses matches its table's key exactly
//
// Nothing is coerced, trimmed or rewritten: a padded string, a comma decimal or
// a key in the wrong case is a failure with its cell named, not a value fixed.
//
//   checkReferenceTabs(input, spec)  pure: the tables in, the failures out
//   fromSources(src, spec, data)     pure: the lists and the backend's rules,
//                                    read from source text
//   readReferenceTabs(dir)           reads data.js, the skill and the sources
//   readSpec(dir)                    reads tools/reference-tabs.json
//
// test/verify-reference-tabs.cjs runs it in CI, which `release` requires.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SPEC_FILE = 'tools/reference-tabs.json';
const SKILL_FILE = '.claude/skills/neofeed-clinical-rules/SKILL.md';
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const DOLS = Array.from({ length: 61 }, (_, i) => i);          // DOL 0 to 60
const WEIGHTS_G = [400, 999, 1000, 1499, 1500, 2499, 2500, 4000, 8000];

// ── the skill's rules ──────────────────────────────────────────────────────
// The first JSON line of each ```rule block: {rule, kind, coded}.
function parseRules(md) {
  const rules = {}, errors = [];
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  let inBlock = false, first = false;
  lines.forEach((l, i) => {
    if (/^```rule\s*$/.test(l)) { inBlock = true; first = true; return; }
    if (inBlock && /^```\s*$/.test(l)) { inBlock = false; return; }
    if (!inBlock || !first || !l.trim()) return;
    first = false;
    try {
      const row = JSON.parse(l);
      if (typeof row.rule !== 'string') throw new Error('no "rule" id');
      rules[row.rule] = { kind: row.kind, coded: row.coded || {}, line: i + 1 };
    } catch (e) {
      errors.push(`${SKILL_FILE}:${i + 1}: ${e.message}`);
    }
  });
  return { rules, errors };
}

// Every value a rule codes, flattened to leaves: "LIPID_GKGH": {warn, max}
// becomes LIPID_GKGH.warn and LIPID_GKGH.max, an array of numbers its indexes.
// An empty array or object, or null, is a leaf itself.
function codedLeaves(rules) {
  const out = new Map();
  const add = (p, value, rule) => {
    if (!out.has(p)) out.set(p, []);
    out.get(p).push({ rule, value });
  };
  const walk = (p, v, rule) => {
    if (v && typeof v === 'object' && Object.keys(v).length) {
      for (const [k, x] of Object.entries(v)) walk(`${p}.${k}`, x, rule);
    } else add(p, v, rule);
  };
  for (const [id, r] of Object.entries(rules)) for (const [p, v] of Object.entries(r.coded)) walk(p, v, id);
  return out;
}

// ── small helpers ──────────────────────────────────────────────────────────
const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : typeof v === 'function' ? 'a function'
  : Array.isArray(v) ? `[${v.map(show).join(', ')}]` : v === undefined ? 'undefined'
  : (typeof v === 'number' && !Number.isFinite(v)) ? String(v) : JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b) && typeof a === typeof b;
const own = (o, k) => o != null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const getPath = (root, p) => p.split('.').reduce((o, k) => (own(o, k) ? o[k] : undefined), root);
const hasPath = (root, p) => {
  const parts = p.split('.');
  let o = root;
  for (const k of parts) { if (!own(o, k)) return false; o = o[k]; }
  return true;
};
const fmtRange = (r, unit) => `${r.lo}–${r.hi}${unit ? ' ' + unit : ''}`;
const rangeSource = (r) => (r.rule ? r.rule : r.proposed ? 'proposed' : r.backend ? `backend ${r.backend}` : 'stated');

// The one place a number is judged. Returns a problem, or null.
function numberProblem(v, col) {
  if (v === null) return col.nullable ? null : 'is null; no reason for a blank is stated';
  if (typeof v === 'string') return `is the string ${show(v)}, not a number (nothing is coerced)`;
  if (typeof v !== 'number') return `is ${show(v)}, not a number`;
  if (!Number.isFinite(v)) return `is ${show(v)}, not a finite number`;
  if (col.sign === 'positive' && !(v > 0)) return v < 0 ? `is negative; it must be positive` : `is ${v}; it must be positive`;
  if (col.sign === 'nonnegative' && v < 0) return `is negative; it must be 0 or more`;
  return null;
}
function rangeProblem(v, r, unit) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < r.lo) return `${v} is below ${fmtRange(r, unit)} (${rangeSource(r)})`;
  if (v > r.hi) return `${v} is above ${fmtRange(r, unit)} (${rangeSource(r)})`;
  return null;
}

// ── the check ──────────────────────────────────────────────────────────────
function checkReferenceTabs(input, spec) {
  const failures = [], proposed = [], fromRules = [];
  const seen = { tables: [], bands: [] };
  const counts = { tables: 0, cells: 0, limits: 0, bands: 0, bandCalls: 0, listKeys: 0, refs: 0 };
  const fail = (where, problem) => failures.push({ where, problem });
  const data = input.data || {};
  const rules = input.rules || {};
  const coded = codedLeaves(rules);
  const covered = new Set();   // coded leaves that have a unit header

  const statedRange = (where, r, unit) => {
    if (!r || typeof r !== 'object') return null;
    if (typeof r.lo !== 'number' || typeof r.hi !== 'number' || r.lo > r.hi) {
      fail(where, `the stated range ${show(r.lo)}–${show(r.hi)} in ${SPEC_FILE} is not two numbers, low first`);
      return null;
    }
    if (r.rule) {
      if (!rules[r.rule]) { fail(where, `its range cites ${r.rule}, which the skill does not have`); return null; }
      fromRules.push({ where, rule: r.rule, how: 'stated', lo: r.lo, hi: r.hi, unit });
    } else if (r.proposed) {
      proposed.push({ where, lo: r.lo, hi: r.hi, unit, source: r.proposed });
    } else {
      fail(where, `its range in ${SPEC_FILE} names neither a CR- rule nor a proposed source`);
      return null;
    }
    return r;
  };
  // Exact value a rule codes for this path, checked; true when one exists.
  const codedCheck = (where, p, v, unit) => {
    const hits = coded.get(p);
    if (!hits) return false;
    covered.add(p);
    const values = [...new Set(hits.map(h => JSON.stringify(h.value)))];
    if (values.length > 1) fail(where, `the skill's rules code it differently: ${hits.map(h => `${h.rule} ${show(h.value)}`).join(', ')}`);
    const want = hits[0].value;
    if (!same(v, want)) fail(where, `is ${show(v)}; ${hits.map(h => h.rule).join(', ')} codes ${show(want)}${unit ? ' ' + unit : ''}`);
    fromRules.push({ where, rule: hits.map(h => h.rule).join(', '), how: 'coded', value: want, unit });
    return true;
  };

  // Tables: rows of named cells.
  for (const [table, tspec] of Object.entries(spec.tables || {})) {
    const rows = data[table];
    if (!rows || typeof rows !== 'object') { fail(table, 'the table is not in data.js'); continue; }
    seen.tables.push(table); counts.tables++;
    const cols = tspec.columns || {};
    for (const [c, col] of Object.entries(cols)) {
      if (col.type === 'number' && !(typeof col.unit === 'string' && col.unit.trim())) fail(`${table}.${c}`, `a number column with no unit in ${SPEC_FILE}`);
    }
    const colRange = {};
    for (const [c, col] of Object.entries(cols)) {
      if (col.type === 'number' && col.range && col.range !== 'rule') colRange[c] = statedRange(`${table}.${c}`, col.range, col.unit);
    }
    const cellRange = {};
    for (const [cell, r] of Object.entries(tspec.cells || {})) {
      const c = cell.split('.')[1];
      cellRange[cell] = statedRange(`${table}.${cell}`, r, cols[c] && cols[c].unit);
    }
    const unknownCols = new Set();
    const cat = (spec.categories || {})[table];
    for (const [row, cells] of Object.entries(rows)) {
      if (!KEY_RE.test(row)) { fail(`${table}.${row}`, `the row key ${show(row)} is not letters, digits and _ (a lookup must match it exactly)`); continue; }
      if (!cells || typeof cells !== 'object' || Array.isArray(cells)) { fail(`${table}.${row}`, `is ${show(cells)}, not a row`); continue; }
      for (const [c, col] of Object.entries(cols)) {
        if (!col.optional && !own(cells, c)) fail(`${table}.${row}.${c}`, `is missing; every ${table} row needs ${c}`);
      }
      for (const [c, v] of Object.entries(cells)) {
        const where = `${table}.${row}.${c}`;
        const col = cols[c];
        counts.cells++;
        if (!col) {
          if (!unknownCols.has(c)) fail(where, `the column ${c} has no unit header in ${SPEC_FILE}`);
          unknownCols.add(c);
          continue;
        }
        if (col.type === 'text') {
          if (typeof v !== 'string') fail(where, `is ${show(v)}, not text`);
          else if (!v.length) fail(where, 'is empty');
          else if (v !== v.trim()) fail(where, `${show(v)} starts or ends with a space (nothing is trimmed)`);
          continue;
        }
        if (col.type === 'boolean') {
          if (typeof v !== 'boolean') fail(where, `is ${show(v)}, not true or false`);
          continue;
        }
        const np = numberProblem(v, col);
        if (np) { fail(where, np); continue; }
        if (v === null) { codedCheck(where, `${table}.${row}.${c}`, v, col.unit); continue; }
        const hadRule = codedCheck(where, `${table}.${row}.${c}`, v, col.unit);
        const cr = cellRange[`${row}.${c}`];
        if (cr) { const rp = rangeProblem(v, cr, col.unit); if (rp) fail(where, rp); }
        const r = colRange[c];
        if (r) { const rp = rangeProblem(v, r, col.unit); if (rp) fail(where, rp); }
        if (col.range === 'rule' && !hadRule && !own(tspec.cells || {}, `${row}.${c}`)) {
          fail(where, `no stated range: no CR- rule codes it and ${SPEC_FILE} gives none`);
        }
      }
      if (cat && own(cells, cat.column) && !cat.values.includes(cells[cat.column])) {
        fail(`${table}.${row}.${cat.column}`, `category ${show(cells[cat.column])} is not one of ${cat.values.join(', ')}; the dropdowns filter on these exactly`);
      }
    }
    // A coded cell of this table counts as covered when its column is named.
    for (const p of coded.keys()) {
      const [t, , c] = p.split('.');
      if (t === table && c && cols[c]) covered.add(p);
    }
  }

  // Limits: single values, by path.
  for (const [p, lim] of Object.entries(spec.limits || {})) {
    counts.limits++;
    if (!(typeof lim.unit === 'string' && lim.unit.trim())) fail(p, `no unit in ${SPEC_FILE}`);
    for (const k of coded.keys()) if (k === p || k.startsWith(p + '.')) covered.add(k);
    if (!hasPath(data, p)) { fail(p, 'is not in data.js'); continue; }
    const v = getPath(data, p);
    if (lim.type === 'list') {
      if (!Array.isArray(v)) { fail(p, `is ${show(v)}, not a list`); continue; }
      if (!v.every(x => typeof x === 'string' && x.length && x === x.trim())) { fail(p, `holds an entry that is not plain text: ${show(v)}`); continue; }
      if (!codedCheck(p, p, v, lim.unit) && !lim.range) fail(p, `no stated range: no CR- rule codes it and ${SPEC_FILE} gives none`);
      continue;
    }
    const np = numberProblem(v, lim);
    if (np) { fail(p, np); continue; }
    const hadRule = codedCheck(p, p, v, lim.unit);
    const r = lim.range ? statedRange(p, lim.range, lim.unit) : null;
    if (r) { const rp = rangeProblem(v, r, lim.unit); if (rp) fail(p, rp); }
    if (!hadRule && !lim.range) fail(p, `no stated range: no CR- rule codes it and ${SPEC_FILE} gives none`);
  }

  // Every value the skill codes needs a unit header here.
  for (const [p, hits] of coded) {
    if (!covered.has(p)) fail(p, `${hits.map(h => h.rule).join(', ')} codes it, but it has no unit header in ${SPEC_FILE}`);
  }

  // Target bands: functions returning [lo, hi], called over DOL and weight.
  const limitValue = (name) => (hasPath(data, name) ? getPath(data, name) : undefined);
  for (const [table, bspec] of Object.entries(spec.bands || {})) {
    const fns = data[table];
    if (!fns || typeof fns !== 'object') { fail(table, 'the band table is not in data.js'); continue; }
    seen.bands.push(table);
    for (const k of Object.keys(fns)) if (!bspec[k]) fail(`${table}.${k}`, `the band ${k} has no unit header in ${SPEC_FILE}`);
    for (let [k, b] of Object.entries(bspec)) {
      const where = `${table}.${k}`;
      counts.bands++;
      if (!(typeof b.unit === 'string' && b.unit.trim())) fail(where, `no unit in ${SPEC_FILE}`);
      if (typeof fns[k] !== 'function') { fail(where, `is ${show(fns[k])}, not a band function`); continue; }
      if (!b.within && !b.hiAtMost && !b.loAtLeast) { fail(where, `no stated range in ${SPEC_FILE} (within, hiAtMost or loAtLeast)`); continue; }
      let within = null;
      if (b.within && b.within.backend) {
        const bb = (input.backendBounds || {})[b.within.backend];
        if (!bb) { fail(where, `the backend bound "${b.within.backend}" was not found in gas-backend.gs _validateLogEntry`); continue; }
        within = { lo: bb.lo, hi: bb.hi, backend: `${b.within.backend} (${bb.at})` };
        fromRules.push({ where, rule: bb.at, how: 'backend', lo: bb.lo, hi: bb.hi, unit: b.unit });
      } else if (b.within) within = statedRange(where, b.within, b.unit);
      const hiMax = b.hiAtMost ? limitValue(b.hiAtMost) : undefined;
      const loMin = b.loAtLeast ? limitValue(b.loAtLeast) : undefined;
      if (b.hiAtMost && typeof hiMax !== 'number') { fail(where, `its ceiling ${b.hiAtMost} is not a number in data.js`); continue; }
      if (b.loAtLeast && typeof loMin !== 'number') { fail(where, `its floor ${b.loAtLeast} is not a number in data.js`); continue; }
      // The limit and the CR- rule that codes it, for the message.
      const label = (name, v) => { const rs = (coded.get(name) || []).map(h => h.rule); return `${name} = ${v}${rs.length ? ` (${rs.join(', ')})` : ''}`; };
      b = { ...b, hiLabel: b.hiAtMost ? label(b.hiAtMost, hiMax) : '', loLabel: b.loAtLeast ? label(b.loAtLeast, loMin) : '' };
      const grid = argGrid(b.args);
      if (!grid) { fail(where, `args ${show(b.args)} in ${SPEC_FILE} is not none, dol, "dol,wtG,bwG" or "dol,isEnteral"`); continue; }
      const problems = new Map();   // problem kind → { first message, count }
      const note = (kind, msg) => {
        if (!problems.has(kind)) problems.set(kind, { msg, count: 0 });
        problems.get(kind).count++;
      };
      for (const args of grid) {
        counts.bandCalls++;
        let out;
        try { out = fns[k](...args); } catch (e) { note('throws', `${callText(k, args)} throws ${e.message}`); continue; }
        if (b.shape === 'object') {
          if (!out || typeof out !== 'object' || Array.isArray(out)) { note('shape', `${callText(k, args)} = ${show(out)}, not an object`); continue; }
          for (const [leaf, val] of Object.entries(out)) {
            const lw = `${where}.${leaf}`;
            const pr = Array.isArray(val) ? bandProblem(val, b, within, hiMax, loMin) : leafProblem(val, b, within, hiMax, loMin);
            if (pr) note(`${leaf}:${pr.kind}`, { where: lw, msg: `${callText(k, args)}.${leaf} = ${show(val)}: ${pr.msg}` });
          }
          continue;
        }
        const pr = bandProblem(out, b, within, hiMax, loMin);
        if (pr) note(pr.kind, `${callText(k, args)} = ${show(out)}: ${pr.msg}`);
      }
      for (const { msg, count } of problems.values()) {
        const m = typeof msg === 'string' ? { where, msg } : msg;
        fail(m.where, `${m.msg}${count > 1 ? ` (and ${count - 1} more inputs)` : ''}`);
      }
    }
  }

  // Lookup lists: dropdowns, defaults, choice lists.
  for (const list of input.lists || []) {
    const rows = data[list.table] || {};
    const seenKeys = new Set();
    const labels = new Map();
    for (const key of list.keys) {
      counts.listKeys++;
      if (typeof key !== 'string') { fail(list.name, `${list.at}: the key ${show(key)} is not text`); continue; }
      if (seenKeys.has(key)) { fail(list.name, `${list.at}: ${show(key)} is listed twice`); continue; }
      seenKeys.add(key);
      if (!own(rows, key)) {
        const near = Object.keys(rows).find(r => r.toLowerCase() === key.trim().toLowerCase());
        fail(list.name, `${list.at}: ${show(key)} is not a key of ${list.table}${near ? ` (${show(near)} is; nothing is trimmed or case-folded)` : ''}`);
        continue;
      }
      const row = rows[key];
      if (list.category && row[list.category.column] !== list.category.value) {
        fail(list.name, `${list.at}: ${show(key)} is a ${show(row[list.category.column])} row, not ${show(list.category.value)}`);
      }
      if (list.requireColumn && !(typeof row[list.requireColumn] === 'number' && Number.isFinite(row[list.requireColumn]))) {
        fail(list.name, `${list.at}: ${list.table}.${key} has no ${list.requireColumn}`);
      }
      if (list.uniqueLabels) {
        const l = row.label;
        if (labels.has(l)) fail(list.name, `${list.at}: ${show(labels.get(l))} and ${show(key)} show the same label ${show(l)}`);
        else labels.set(l, key);
      }
    }
  }
  // Keys another program must accept (the backend's NURSING_FEED_KEY_RE).
  for (const kp of input.keyPatterns || []) {
    for (const key of kp.keys) {
      counts.listKeys++;
      if (!(typeof key === 'string' && kp.pattern.test(key))) fail(kp.name, `${kp.at}: ${show(key)} fails ${kp.pattern}, so the backend refuses a save with it`);
    }
  }
  // Literal references in the code: D.KCMH_STOCK.naCl.naMeqPerMl and the like.
  for (const ref of input.refs || []) {
    counts.refs++;
    const rows = data[ref.table] || {};
    if (!own(rows, ref.row)) { fail(ref.at, `reads ${ref.table}.${ref.row}, which is not a row of ${ref.table}`); continue; }
    if (ref.column && !own(rows[ref.row], ref.column)) fail(ref.at, `reads ${ref.table}.${ref.row}.${ref.column}, which that row does not have`);
  }
  // Dropdowns built by category: each category exists and has a row.
  for (const cf of input.categoryFilters || []) {
    const cat = (spec.categories || {})[cf.table];
    const rows = Object.values(data[cf.table] || {});
    if (!cat) { fail(cf.at, `filters ${cf.table} by category, but ${SPEC_FILE} lists no categories for it`); continue; }
    if (!cat.values.includes(cf.category)) fail(cf.at, `filters ${cf.table} on category ${show(cf.category)}, which is not one of ${cat.values.join(', ')}`);
    else if (!rows.some(r => r && r[cat.column] === cf.category)) fail(cf.at, `filters ${cf.table} on category ${show(cf.category)}, which no row has`);
  }
  for (const nf of input.notFound || []) fail(nf.where, nf.problem);

  return { failures, proposed, fromRules, counts, seen };
}

function argGrid(args) {
  if (args === 'none') return [[]];
  if (args === 'dol') return DOLS.map(d => [d]);
  if (args === 'dol,isEnteral') return DOLS.flatMap(d => [[d, false], [d, true]]);
  if (args === 'dol,wtG,bwG') return DOLS.flatMap(d => WEIGHTS_G.flatMap(w => [[d, w, undefined], [d, w, w], [d, w, w + 600]]));
  return null;
}
const callText = (k, args) => `${k}(${args.map(a => (a === undefined ? '–' : String(a))).join(', ')})`;

// A band [lo, hi]: two numbers, low first, 0 or more, inside its bounds. The
// first problem only, so one bad band is one line.
function bandProblem(out, b, within, hiMax, loMin) {
  if (!Array.isArray(out) || out.length !== 2) return { kind: 'pair', msg: 'not a pair [low, high]' };
  const [lo, hi] = out;
  for (const v of out) {
    if (typeof v === 'string') return { kind: 'string', msg: `holds the string ${show(v)}, not a number` };
    if (typeof v !== 'number' || Number.isNaN(v)) return { kind: 'type', msg: `holds ${show(v)}, not a number` };
  }
  if (!Number.isFinite(lo) || (!Number.isFinite(hi) && !(b.hiMayBeInfinite && hi === Infinity))) {
    return { kind: 'finite', msg: 'an end is not a finite number' };
  }
  if (lo < 0 || hi < 0) return { kind: 'negative', msg: 'an end is negative' };
  if (lo > hi) return { kind: 'order', msg: `the lower end ${lo} is above its upper end ${hi}` };
  if (within) {
    if (lo < within.lo || (Number.isFinite(hi) && hi > within.hi)) {
      return { kind: 'within', msg: `outside ${fmtRange(within, b.unit)} (${rangeSource(within)})` };
    }
  }
  if (typeof hiMax === 'number' && Number.isFinite(hi) && hi > hiMax) return { kind: 'hiMax', msg: `the upper end is above ${b.hiLabel}` };
  if (typeof loMin === 'number' && lo < loMin) return { kind: 'loMin', msg: `the lower end is below ${b.loLabel}` };
  return null;
}
function leafProblem(v, b, within, hiMax, loMin) {
  if (typeof v === 'string') return { kind: 'string', msg: `is the string ${show(v)}, not a number` };
  if (typeof v !== 'number' || !Number.isFinite(v)) return { kind: 'finite', msg: 'not a finite number' };
  if (v < 0) return { kind: 'negative', msg: 'is negative' };
  if (within && (v < within.lo || v > within.hi)) return { kind: 'within', msg: `outside ${fmtRange(within, b.unit)} (${rangeSource(within)})` };
  if (typeof hiMax === 'number' && v > hiMax) return { kind: 'hiMax', msg: `is above ${b.hiLabel}` };
  if (typeof loMin === 'number' && v < loMin) return { kind: 'loMin', msg: `is below ${b.loLabel}` };
  return null;
}

// ── reading the lists from source text ────────────────────────────────────
// Each reader says when it finds nothing: a changed line of code must fail
// here, never pass with an empty list.
function fromSources(src, spec, data) {
  const lists = [], keyPatterns = [], refs = [], categoryFilters = [], notFound = [];
  const backendBounds = {};
  const text = (f) => String(src[f] || '').replace(/\r\n/g, '\n');
  const lineAt = (t, i) => t.slice(0, i).split('\n').length;
  const quoted = (s) => [...s.matchAll(/"([^"]*)"/g)].map(m => m[1]);
  const calc = text('calculator.jsx');

  // The Calculator's feed dropdown (Step 2): groups of EN_DB keys, each
  // `.filter(k => D.EN_DB[k])`, which drops an unknown key without a word.
  const groups = [...calc.matchAll(/\[((?:\s*"[^"]*"\s*,?)+)\]\s*\.filter\(\s*k\s*=>\s*D\.EN_DB\[k\]\s*\)/g)];
  if (groups.length) {
    lists.push({ name: 'Calculator feed dropdown', at: `calculator.jsx:${lineAt(calc, groups[0].index)}`, table: 'EN_DB',
      keys: groups.flatMap(g => quoted(g[1])), uniqueLabels: true });
  } else notFound.push({ where: 'calculator.jsx', problem: 'no feed dropdown list found (`["…"].filter(k => D.EN_DB[k])`); update fromSources with the new code' });

  // Defaults: useState("…") of each named state.
  for (const [name, d] of Object.entries(spec.defaults || {})) {
    const m = new RegExp(`const \\[${name}\\s*,\\s*\\w+\\]\\s*=\\s*useState\\("([^"]*)"\\)`).exec(calc);
    if (!m) { notFound.push({ where: 'calculator.jsx', problem: `the ${name} default (useState("…")) was not found` }); continue; }
    lists.push({ name: `${name} default`, at: `calculator.jsx:${lineAt(calc, m.index)}`, table: d.table, keys: [m[1]],
      category: d.category ? { column: ((spec.categories || {})[d.table] || {}).column, value: d.category } : null });
  }

  // Amino-acid choices: the Calculator's own list and aaProductsFor's.
  const aa = /const aaChoices\s*=([^;]*);/.exec(calc);
  if (aa) lists.push({ name: 'aaChoices (Calculator)', at: `calculator.jsx:${lineAt(calc, aa.index)}`, table: 'KCMH_STOCK', keys: [...new Set(quoted(aa[1]))], requireColumn: 'gPerMl' });
  else notFound.push({ where: 'calculator.jsx', problem: 'the aaChoices list was not found' });
  const dj = text('data.js');
  const ap = /function aaProductsFor\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(dj);
  if (ap) lists.push({ name: 'aaProductsFor (data.js)', at: `data.js:${lineAt(dj, ap.index)}`, table: 'KCMH_STOCK', keys: [...new Set(quoted(ap[1]))], requireColumn: 'gPerMl' });
  else notFound.push({ where: 'data.js', problem: 'aaProductsFor was not found' });

  // Supplement dropdowns built by category.
  const cats = [...calc.matchAll(/D\.SUPP_DB\)\s*\.filter\(\s*\(\[\s*,\s*v\s*\]\)\s*=>\s*v\.category\s*===\s*"([^"]*)"\s*\)/g)];
  if (cats.length) for (const c of cats) categoryFilters.push({ at: `calculator.jsx:${lineAt(calc, c.index)}`, table: 'SUPP_DB', category: c[1] });
  else notFound.push({ where: 'calculator.jsx', problem: 'no SUPP_DB category dropdown found (`v.category === "…"`)' });

  // The nursing form posts an EN_DB key (or one of its own) as feedType, and
  // the backend refuses any key that fails NURSING_FEED_KEY_RE.
  const gs = text('gas-backend.gs');
  const re = /var NURSING_FEED_KEY_RE\s*=\s*\/(.+)\/([a-z]*);/.exec(gs);
  const logj = text('log.jsx');
  const nfo = /const NURSING_FEED_OPTIONS\s*=\s*\[\.\.\.Object\.entries\(D_L\.(\w+)\)[^\n]*/.exec(logj);
  if (!re) notFound.push({ where: 'gas-backend.gs', problem: 'NURSING_FEED_KEY_RE was not found' });
  if (!nfo) notFound.push({ where: 'log.jsx', problem: 'NURSING_FEED_OPTIONS was not found' });
  if (re && nfo) {
    const table = nfo[1];
    if (spec.nursingFeedTable && table !== spec.nursingFeedTable) notFound.push({ where: 'log.jsx', problem: `NURSING_FEED_OPTIONS lists ${table}, not ${spec.nursingFeedTable}` });
    const extras = [...nfo[0].matchAll(/\[\s*"([^"]+)"\s*,\s*"[^"]*"\s*\]/g)].map(m => m[1]);
    keyPatterns.push({ name: 'backend NURSING_FEED_KEY_RE', at: `gas-backend.gs:${lineAt(gs, re.index)}`,
      pattern: new RegExp(re[1], re[2]), keys: [...Object.keys((data || {})[table] || {}), ...extras] });
  }

  // The backend's save bounds for a Daily_Log field: a target band outside
  // them is a target nobody could save.
  for (const m of gs.matchAll(/_checkRange\(entry\.(\w+),\s*(-?[\d.]+),\s*(-?[\d.]+),/g)) {
    backendBounds[m[1]] = { lo: Number(m[2]), hi: Number(m[3]), at: `gas-backend.gs:${lineAt(gs, m.index)}` };
  }

  // Literal table references in the screens: D.KCMH_STOCK.naCl.naMeqPerMl,
  // and through an alias such as calculator.jsx's `const S = D.KCMH_STOCK;`.
  for (const f of ['calculator.jsx', 'log.jsx', 'app.jsx']) {
    const t = text(f);
    const push = (m, table, row, column) => refs.push({ at: `${f}:${lineAt(t, m.index)}`, table, row, column: column || null });
    for (const m of t.matchAll(/(?<![\w$.])(?:D|D_A|D_L)\.(EN_DB|KCMH_STOCK|SUPP_DB)\.([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?/g)) push(m, m[1], m[2], m[3]);
    for (const a of t.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:D|D_A|D_L)\.(EN_DB|KCMH_STOCK|SUPP_DB)\s*;/g)) {
      const re = new RegExp(`(?<![\\w$.])${a[1].replace(/\$/g, '\\$')}\\.([A-Za-z_$][\\w$]*)(?:\\.([A-Za-z_$][\\w$]*))?`, 'g');
      for (const m of t.matchAll(re)) push(m, a[2], m[1], m[2]);
    }
  }
  return { lists, keyPatterns, refs, categoryFilters, backendBounds, notFound };
}

// ── reading the repo ───────────────────────────────────────────────────────
function readSpec(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, SPEC_FILE), 'utf8'));
}
function readReferenceTabs(dir) {
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(read('data.js'), sandbox, { filename: 'data.js' });
  const data = sandbox.window.NEOFEED_DATA;
  const { rules, errors } = parseRules(read(SKILL_FILE));
  const src = {};
  for (const f of ['calculator.jsx', 'log.jsx', 'app.jsx', 'data.js', 'gas-backend.gs']) src[f] = read(f);
  return { data, rules, ruleErrors: errors, ...fromSources(src, readSpec(dir), data) };
}

module.exports = { checkReferenceTabs, fromSources, parseRules, readReferenceTabs, readSpec, SPEC_FILE, SKILL_FILE };
