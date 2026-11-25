#!/usr/bin/env node
// ward-table.cjs — the ward table's two copies (openspec/changes/paediatric-wards, design D1).
//
//   node tools/ward-table.cjs           check: each copy matches data.js WARDS; exit 1 names the copy
//   node tools/ward-table.cjs --write   rewrite both copies from data.js
//
// WARDS in data.js is the one list of wards and beds. gas-backend.gs (Apps Script cannot load
// data.js) and tpn-room-core.js (the TPN room's page never loads it) each hold a copy, between
// the two marker lines below, that this tool writes. The check is in tools/checks.json, blocking:
// a copy edited by hand, or a table changed without --write, closes the gate. The copy carries
// what the two files read: each ward's key, label and sticker label, and each run of beds with
// its prefix, its ward and whether it is two-part ("iso 1-2"). REFERENCE.md § Adding a ward.
//
// Exit: 0 both copies match · 1 a copy differs, or the table is malformed · 2 a file is missing.
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE = 'data.js';
const COPIES = [
  { file: 'gas-backend.gs', decl: 'var', indent: '' },
  { file: 'tpn-room-core.js', decl: 'const', indent: '  ' },
];
const FILES = [SOURCE, ...COPIES.map(c => c.file)];
const BEGIN = '// ── Ward table: generated from data.js WARDS by tools/ward-table.cjs';
const END = '// ── end of the generated ward table ──';
const RESERVED = ['other', 'none', 'all', 'total'];
const FIX = 'Run `node tools/ward-table.cjs --write` and commit both copies with data.js.';

function loadData(src) {
  const box = { console, Math, Date, JSON, Intl };
  box.window = box;
  box.globalThis = box;
  vm.createContext(box);
  vm.runInContext(src, box, { filename: SOURCE });
  return box.NEOFEED_DATA;
}

// What is wrong with the table, as sentences; [] when nothing is.
function validate(D) {
  const out = [];
  const wards = D && D.WARDS;
  if (!Array.isArray(wards) || !wards.length) return ['data.js has no WARDS list'];
  const keys = new Set(), prefixes = new Set();
  for (const w of wards) {
    const at = `ward ${JSON.stringify(w && w.key)}`;
    if (!w || typeof w.key !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(w.key)) { out.push(`${at}: key must be letters and digits`); continue; }
    if (RESERVED.includes(w.key.toLowerCase())) out.push(`${at}: "${w.key}" is taken (${RESERVED.join(', ')})`);
    if (keys.has(w.key.toLowerCase())) out.push(`${at}: a second ward with this key`);
    keys.add(w.key.toLowerCase());
    for (const f of ['label', 'sub', 'stickerLabel']) {
      if (typeof w[f] !== 'string' || !w[f].trim()) out.push(`${at}: ${f} is blank`);
    }
    // The dead space a new order starts with (defaultDeadVolFor): the ward's own
    // giving set, from the TPN room. 0 is a real value (no overfill); a missing one is not.
    if (typeof w.deadVolMl !== 'number' || !Number.isFinite(w.deadVolMl) || w.deadVolMl < 0) {
      out.push(`${at}: deadVolMl must be a number of mL, 0 or more (the TPN room's value for the ward's giving set)`);
    }
    if (!Array.isArray(w.beds) || !w.beds.length) { out.push(`${at}: no beds`); continue; }
    for (const r of w.beds) {
      const p = r && r.prefix;
      if (typeof p !== 'string' || !/^[A-Za-z]+$/.test(p)) { out.push(`${at}: bed prefix ${JSON.stringify(p)} must be letters only`); continue; }
      if (RESERVED.includes(p.toLowerCase())) out.push(`${at}: bed prefix "${p}" is taken`);
      if (prefixes.has(p.toLowerCase())) out.push(`${at}: bed prefix "${p}" is another run's, in some case`);
      prefixes.add(p.toLowerCase());
      const flat = Number.isInteger(r.count) && r.count > 0;
      const rooms = Array.isArray(r.rooms) && r.rooms.length > 0 && r.rooms.every(n => Number.isInteger(n) && n > 0);
      if (flat === rooms) out.push(`${at}: run "${p}" needs either count (a whole number above 0) or rooms (a list of them)`);
    }
  }
  return out;
}

// The copy: what gas-backend.gs and tpn-room-core.js read, nothing more.
function tableCopy(D) {
  return {
    wards: D.WARDS.map(w => ({ key: w.key, label: w.label, stickerLabel: w.stickerLabel })),
    runs: D.WARD_BED_RUNS.map(r => ({ prefix: r.prefix, ward: r.ward, rooms: !!r.rooms })),
  };
}
const digest = (copy) => crypto.createHash('sha256').update(JSON.stringify(copy)).digest('hex').slice(0, 12);

function block(copy, { decl, indent }) {
  const list = (name, rows, last) => [
    `${indent}  "${name}": [`,
    ...rows.map((r, i) => `${indent}    ${JSON.stringify(r)}${i < rows.length - 1 ? ',' : ''}`),
    `${indent}  ]${last ? '' : ','}`,
  ];
  return [
    `${indent}${BEGIN} (digest ${digest(copy)}). ──`,
    `${indent}// Do not edit: change WARDS in data.js, then run \`node tools/ward-table.cjs --write\` (REFERENCE.md § Adding a ward).`,
    `${indent}${decl} WARD_TABLE = {`,
    ...list('wards', copy.wards, false),
    ...list('runs', copy.runs, true),
    `${indent}};`,
    `${indent}${END}`,
  ].join('\n');
}

// [start, end) of the block in `src`, the whole lines from the BEGIN marker to the END marker.
function findBlock(src) {
  const b = src.indexOf(BEGIN);
  if (b < 0) return null;
  const start = src.lastIndexOf('\n', b) + 1;
  const e = src.indexOf(END, b);
  if (e < 0) return null;
  if (src.indexOf(BEGIN, b + 1) >= 0) return null;
  return [start, e + END.length];
}
const lf = (s) => String(s).replace(/\r\n/g, '\n');
// The digest of what a copy's block holds now, whatever its first line says.
function copyDigest(text) {
  const m = /WARD_TABLE = (\{[\s\S]*\});/.exec(text);
  try { return m ? digest(JSON.parse(m[1])) : 'none: no WARD_TABLE'; } catch (e) { return 'none: not JSON'; }
}

// { file, why } for each thing wrong, given the three files' text.
function checkSources(srcs) {
  let D;
  try { D = loadData(lf(srcs[SOURCE])); } catch (e) { return [{ file: SOURCE, why: `data.js does not load: ${e.message}` }]; }
  const bad = validate(D);
  if (bad.length) return [{ file: SOURCE, why: `the ward table is malformed: ${bad.join('; ')}` }];
  const copy = tableCopy(D);
  const out = [];
  for (const c of COPIES) {
    const src = lf(srcs[c.file]);
    const at = findBlock(src);
    if (!at) { out.push({ file: c.file, why: `its generated ward table is missing or its markers are broken. ${FIX}` }); continue; }
    const have = src.slice(at[0], at[1]);
    if (have !== block(copy, c)) {
      out.push({ file: c.file, why: `its ward table (digest ${copyDigest(have)}) is not data.js WARDS (digest ${digest(copy)}). ${FIX}` });
    }
  }
  return out;
}

// The three files with both copies rewritten from data.js (unchanged when they already match).
function write(srcs) {
  const D = loadData(lf(srcs[SOURCE]));
  const bad = validate(D);
  if (bad.length) throw new Error(`the ward table is malformed: ${bad.join('; ')}`);
  const copy = tableCopy(D);
  const out = { ...srcs };
  for (const c of COPIES) {
    const src = srcs[c.file];
    const crlf = /\r\n/.test(src);
    const text = lf(src);
    const at = findBlock(text);
    if (!at) throw new Error(`${c.file}: no generated ward table to replace (the "${BEGIN}" and "${END}" lines)`);
    const next = text.slice(0, at[0]) + block(copy, c) + text.slice(at[1]);
    out[c.file] = next === text ? src : (crlf ? next.replace(/\n/g, '\r\n') : next);
  }
  return out;
}

// data.js with one more row at the end of WARDS: how the harnesses and REFERENCE.md's fixture
// ward add a ward without editing the file on disk.
function plantWard(dataSrc, rowSrc) {
  const m = /\nconst WARDS = freezeWards\(\[\n[\s\S]*?\n\]\);/.exec(dataSrc);
  if (!m) throw new Error('data.js: the WARDS table (const WARDS = freezeWards([ … ]);) was not found');
  const end = m.index + m[0].length - '\n]);'.length;
  return dataSrc.slice(0, end) + '\n  ' + rowSrc + dataSrc.slice(end);
}

function readAll(root) {
  const out = {};
  for (const f of FILES) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) { console.error(`ward-table: ${f} is missing`); process.exit(2); }
    out[f] = fs.readFileSync(p, 'utf8');
  }
  return out;
}

function main(argv) {
  const root = ROOT;
  const srcs = readAll(root);
  if (argv.includes('--write')) {
    const next = write(srcs);
    const changed = COPIES.map(c => c.file).filter(f => next[f] !== srcs[f]);
    changed.forEach(f => fs.writeFileSync(path.join(root, f), next[f]));
    console.log(changed.length ? `ward-table: rewrote ${changed.join(' and ')}` : 'ward-table: both copies already match data.js');
    return 0;
  }
  const problems = checkSources(srcs);
  if (!problems.length) {
    console.log(`ward-table: gas-backend.gs and tpn-room-core.js match data.js WARDS (digest ${digest(tableCopy(loadData(lf(srcs[SOURCE]))))})`);
    return 0;
  }
  problems.forEach(p => console.error(`ward-table: ${p.file}: ${p.why}`));
  return 1;
}

module.exports = { COPIES, BEGIN, END, loadData, validate, tableCopy, digest, block, findBlock, checkSources, write, plantWard };
if (require.main === module) process.exit(main(process.argv.slice(2)));
