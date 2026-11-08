#!/usr/bin/env node
// run_checks.js — the one command that runs NeoFeed's checks (NF-32).
//
//   node tools/run_checks.js --level commit        what the pre-commit hook runs
//   node tools/run_checks.js --level stop --hook   what the Stop hook runs
//   node tools/run_checks.js --level ci            all of CI, here, in order
//   node tools/run_checks.js --level ci --phase sources
//   node tools/run_checks.js --validate            read tools/checks.json and stop
//   node tools/run_checks.js --install-hooks       point this clone at .githooks/
//
// tools/checks.json is the list: a check added there runs at every level it
// names. The result is per dimension, with no average, because one failing
// clinical check must close the gate however many others pass (Pp, 2026-11-08).
//
// Exit: 0 gate open · 1 gate closed · 2 the config is wrong, or --hook and the
// gate is closed (2 is the code that sends an agent back to work).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEVELS = ['stop', 'commit', 'ci'];
const HOOK_PHASES = ['pre', 'sources'];

function fail2(msg) {
  console.error(`run_checks: ${msg}`);
  process.exit(2);
}

function parseArgs(argv) {
  const o = { root: path.join(__dirname, '..') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--level') o.level = argv[++i];
    else if (a === '--phase') o.phase = argv[++i];
    else if (a === '--root') o.root = argv[++i];
    else if (a === '--config') o.config = argv[++i];
    else if (a === '--changed') o.changed = argv[++i].split(',').filter(Boolean);
    else if (a === '--hook') o.hook = true;
    else if (a === '--validate') o.validate = true;
    else if (a === '--install-hooks') o.install = true;
    else fail2(`unknown argument ${a}`);
  }
  o.config = o.config || path.join(o.root, 'tools', 'checks.json');
  return o;
}

// A pattern is a path with at most one * in its file name.
function expand(root, pattern) {
  const dir = path.posix.dirname(pattern);
  const base = path.posix.basename(pattern);
  if (!base.includes('*')) return fs.existsSync(path.join(root, pattern)) ? [pattern] : [];
  const re = new RegExp('^' + base.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  let names = [];
  try { names = fs.readdirSync(path.join(root, dir)); } catch { /* an empty match is refused by the caller */ }
  return names.filter(n => re.test(n)).sort().map(n => `${dir}/${n}`);
}

const BUILTINS = {
  // First, before anything else writes to the tree.
  async 'build-fresh'({ root, env, sink }) {
    for (const [cmd, ...args] of [['npm', 'ci', '--prefix', 'tools'], ['node', 'tools/build.mjs']]) {
      const r = await exec(cmd, args, { root, env, sink });
      if (r.code !== 0) return { ok: false, output: r.output, why: `${cmd} ${args.join(' ')} failed` };
    }
    const s = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    if (s.status !== 0 || s.stdout.trim()) {
      return {
        ok: false, output: s.stdout,
        why: "compiled/, vendor/ or the HTML shells do not match a fresh build of the committed sources. Run 'npm ci --prefix tools && node tools/build.mjs' and commit everything it changes with the .jsx edit.",
      };
    }
    return { ok: true, output: '' };
  },
  async 'shells-identical'({ root }) {
    const same = fs.readFileSync(path.join(root, 'index.html')).equals(fs.readFileSync(path.join(root, 'NeoFeed.html')));
    return same ? { ok: true, output: '' } : { ok: false, output: '', why: 'index.html and NeoFeed.html differ' };
  },
};

const GUARDS = {
  'compiled-swapped': (src, out) => /transformSync|review-0917-boot/.test(src) && !out.includes('[compiled-loader] swapped in')
    ? 'mounts .jsx modules, but none was replaced by compiled/ output' : null,
  'no-browser-skip': (src, out) => /SKIP +(playwright not installed|could not launch Chromium)/.test(out)
    ? 'skipped its browser sections: Playwright or Chromium is missing' : null,
};

function load(o) {
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(o.config, 'utf8')); } catch (e) { fail2(`cannot read ${o.config}: ${e.message}`); }
  const phases = Object.keys(cfg.phases || {});
  const seen = new Set();
  const claimed = new Map();
  const files = new Map();
  for (const c of cfg.checks || []) {
    const at = `check "${c.id}"`;
    if (!c.id) fail2('a check has no id');
    if (seen.has(c.id)) fail2(`duplicate check id "${c.id}"`);
    seen.add(c.id);
    const dim = (cfg.dimensions || {})[c.dimension];
    if (!dim) fail2(`${at}: unknown dimension "${c.dimension}"`);
    if (typeof c.blocking !== 'boolean') fail2(`${at}: blocking must be true or false`);
    if (dim.binary && !c.blocking) fail2(`${at}: dimension "${c.dimension}" is binary, so its checks must block`);
    for (const l of c.levels || []) if (!LEVELS.includes(l)) fail2(`${at}: unknown level "${l}"`);
    if (!(c.levels || []).length) fail2(`${at}: names no level`);
    for (const p of c.phases || []) if (!phases.includes(p)) fail2(`${at}: unknown phase "${p}"`);
    if (!(c.phases || []).length) fail2(`${at}: names no phase`);
    if ([c.harness, c.cmd, c.builtin].filter(Boolean).length !== 1) fail2(`${at}: needs exactly one of harness, cmd, builtin`);
    if (c.builtin && !BUILTINS[c.builtin]) fail2(`${at}: unknown builtin "${c.builtin}"`);
    if (c.harness) {
      const found = expand(o.root, c.harness);
      if (!found.length) fail2(`${at}: nothing matches ${c.harness}`);
      const mine = found.filter(f => !claimed.has(f));
      for (const f of mine) claimed.set(f, c);
      files.set(c.id, mine);
    }
  }
  for (const p of phases) {
    for (const g of cfg.phases[p].guards || []) if (!GUARDS[g]) fail2(`phase "${p}": unknown guard "${g}"`);
  }
  for (const f of expand(o.root, 'test/verify-*.cjs')) {
    if (!claimed.has(f) || !claimed.get(f).levels.includes('ci')) fail2(`${f} runs in no CI check`);
  }
  return { cfg, files };
}

function exec(cmd, args, { root, env, sink, quiet }) {
  return new Promise((resolve) => {
    const bin = cmd === 'node' ? process.execPath : cmd;
    const child = spawn(bin, args, { cwd: root, env, shell: cmd !== 'node' && process.platform === 'win32' });
    let stdout = '', output = '';
    const take = (isOut) => (d) => {
      const s = d.toString();
      output += s;
      if (isOut) stdout += s;
      if (!quiet) sink.write(s);
    };
    child.stdout.on('data', take(true));
    child.stderr.on('data', take(false));
    child.on('error', (e) => resolve({ code: 1, stdout, output: output + e.message }));
    child.on('close', (code) => resolve({ code: code === null ? 1 : code, stdout, output }));
  });
}

function changedFiles(o) {
  if (o.changed) return o.changed;
  const git = (...a) => {
    const r = spawnSync('git', a, { cwd: o.root, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.split('\n').map(s => s.trim()).filter(Boolean) : [];
  };
  if (o.level === 'commit') return git('diff', '--cached', '--name-only');
  return [...new Set([...git('diff', '--name-only', 'HEAD'), ...git('ls-files', '--others', '--exclude-standard')])];
}

// A worktree has no node_modules of its own; the main checkout's serves it.
function worktreeNodePath(o, env) {
  if (fs.existsSync(path.join(o.root, 'node_modules'))) return;
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: o.root, encoding: 'utf8' });
  if (r.status !== 0) return;
  const shared = path.join(path.resolve(o.root, r.stdout.trim()), '..', 'node_modules');
  if (fs.existsSync(shared)) env.NODE_PATH = [shared, env.NODE_PATH].filter(Boolean).join(path.delimiter);
}

function missingPackages(c, o, env) {
  const dirs = [path.join(o.root, 'node_modules'), ...String(env.NODE_PATH || '').split(path.delimiter).filter(Boolean)];
  return (c.needs || []).filter(p => !dirs.some(d => fs.existsSync(path.join(d, p))));
}

function readHookInput() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  // Sent back once already: never loop. Before the config is read, so a broken
  // checks.json or a deleted harness cannot trap an agent either.
  if (o.hook && readHookInput().stop_hook_active) return 0;
  if (o.install) {
    const r = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: o.root, stdio: 'inherit' });
    process.exit(r.status === 0 ? 0 : 1);
  }
  const { cfg, files } = load(o);
  if (o.validate) {
    console.log(`checks.json OK: ${cfg.checks.length} checks, ${[...files.values()].flat().length} harnesses`);
    return 0;
  }
  if (!LEVELS.includes(o.level)) fail2(`--level must be one of ${LEVELS.join(', ')}`);
  if (o.phase && !cfg.phases[o.phase]) fail2(`unknown phase "${o.phase}"`);

  const isCi = o.level === 'ci';
  const changed = isCi ? null : changedFiles(o);
  if (changed && !changed.length) return 0;

  const sink = o.hook ? process.stderr : process.stdout;
  const baseEnv = { ...process.env, ...(cfg.env || {}) };
  if (!isCi) worktreeNodePath(o, baseEnv);
  const grouped = isCi && !!process.env.GITHUB_ACTIONS;
  const phases = Object.keys(cfg.phases).filter(p => o.phase ? p === o.phase : (isCi || HOOK_PHASES.includes(p)));
  const results = [];
  const tails = [];

  const record = (c, label, r, why) => {
    results.push({ dimension: c.dimension, label, ok: r, blocking: c.blocking, why });
  };
  async function step(c, label, fn) {
    if (grouped) sink.write(`::group::${label}\n`);
    const r = await fn();
    if (grouped) sink.write('::endgroup::\n');
    record(c, label, r.ok, r.why);
    if (!r.ok) {
      if (grouped) sink.write(`::error::${label}: ${r.why || 'failed'}\n`);
      tails.push(`--- ${label}${r.why ? ` (${r.why})` : ''}\n${String(r.output || '').trim().split('\n').slice(-25).join('\n')}`);
    }
  }

  for (const phase of phases) {
    const ph = cfg.phases[phase];
    const env0 = { ...baseEnv, ...(ph.env || {}) };
    for (const c of cfg.checks) {
      if (!c.phases.includes(phase) || !c.levels.includes(o.level)) continue;
      if (!isCi && c.when_changed && !c.when_changed.some(w => changed.includes(w))) continue;
      const env = { ...env0, ...(c.env || {}) };
      if (!isCi) {
        const gone = missingPackages(c, o, env);
        if (gone.length) {
          results.push({ dimension: c.dimension, label: c.id, skipped: `needs ${gone.join(', ')}; CI runs it` });
          continue;
        }
      }
      const ctx = { root: o.root, env, sink, quiet: !isCi };
      if (c.builtin) {
        await step(c, c.id, () => BUILTINS[c.builtin](ctx));
      } else if (c.cmd) {
        await step(c, c.id, async () => {
          const r = await exec(c.cmd[0], c.cmd.slice(1), ctx);
          return { ok: r.code === 0, output: r.output, why: r.code === 0 ? '' : `exit ${r.code}` };
        });
      } else {
        const list = files.get(c.id);
        for (const f of list) {
          const label = list.length === 1 && !c.harness.includes('*') ? c.id : path.posix.basename(f);
          await step(c, phases.length > 1 && isCi ? `${label} [${phase}]` : label, async () => {
            const r = await exec('node', [f], ctx);
            if (r.code !== 0) return { ok: false, output: r.output, why: `exit ${r.code}` };
            const src = fs.readFileSync(path.join(o.root, f), 'utf8');
            for (const g of ph.guards || []) {
              const why = GUARDS[g](src, r.stdout);
              if (why) return { ok: false, output: r.output, why };
            }
            return { ok: true, output: r.output };
          });
        }
      }
    }
  }

  const out = (s) => sink.write(s + '\n');
  out(`\nrun_checks · level ${o.level}${o.phase ? ` · phase ${o.phase}` : ''}`);
  if (tails.length) out(tails.join('\n'));
  const width = Math.max(10, ...Object.keys(cfg.dimensions).map(d => d.length));
  let closed = [];
  for (const dim of Object.keys(cfg.dimensions)) {
    const rows = results.filter(r => r.dimension === dim);
    const ran = rows.filter(r => !r.skipped);
    for (const r of rows.filter(x => x.skipped)) out(`  SKIP  ${r.label}: ${r.skipped}`);
    if (!ran.length) continue;
    const bad = ran.filter(r => !r.ok);
    const name = dim.padEnd(width);
    if (!bad.length) { out(`  ${name}  PASS  ${ran.length} of ${ran.length}`); continue; }
    const hard = bad.filter(r => r.blocking);
    if (hard.length) closed.push(dim);
    out(`  ${name}  FAIL  ${bad.length} of ${ran.length}: ${bad.map(r => r.label).join(', ')}${hard.length ? '' : ' (not blocking)'}`);
  }
  out(closed.length ? `GATE CLOSED: ${closed.join(', ')}` : 'GATE OPEN');
  if (!closed.length) return 0;
  return o.hook ? 2 : 1;
}

main().then(code => process.exit(code), (e) => fail2(e.stack || e.message));
