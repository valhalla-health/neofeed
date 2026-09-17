// NeoFeed build: precompiles the six .jsx modules to plain classic scripts.
//
//   npm ci --prefix tools        (once, and after tools/package-lock.json changes)
//   node tools/build.mjs         (after every .jsx, data.js, boot.js or shell edit)
//
// Commit the .jsx sources and everything this writes (compiled/, vendor/, both
// shells) together. CI runs this same command on a clean checkout and fails if
// `git status --porcelain` is not empty afterwards, so stale output cannot merge.
//
// Until 2026-09-17 the shells loaded @babel/standalone from unpkg and compiled
// ~570 KB of JSX in every browser on every page load (about 4 s on a ward PC, and
// the reason _headers needed 'unsafe-eval' and 'unsafe-inline'). Nothing here runs
// on a host: Cloudflare and GitHub Pages still serve files straight from git.
//
// Everything is checked before anything is written; any failure exits non-zero
// and leaves the tree untouched.
//   1. Compile each .jsx with esbuild, JSX -> React.createElement only. target
//      es2020 lowers nothing today (data.js already ships ES2020 syntax raw, so
//      that was the browser floor anyway). The "use strict" banner keeps what
//      production always had: @babel/standalone's default presets prepended it
//      to every module.
//   2. Prove the scripts can share one global scope as classic scripts.
//      @babel/standalone lowered top-level const/let/class to var, so a name
//      declared in two files used to "work"; natively it is a load-time
//      SyntaxError that white-screens the app. Also rejects a top-level
//      lexical name the browser's window already owns (window, document,
//      location, top), which a bare vm context cannot see by itself.
//   3. Take React/ReactDOM UMD from the pinned npm packages and prove they are
//      byte-identical to the unpkg files index.html pinned by SRI.
//   4. Rewrite every ?v= token in BOTH shells to a content hash of the file it
//      loads, and check the shells' script list, order and byte-identity.
// Text inputs are CRLF->LF normalised, so a Windows checkout (core.autocrlf=true)
// and the Linux CI runner produce identical bytes and identical tokens.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(TOOLS, '..');
const OUT = path.join(ROOT, 'compiled');
const VENDOR = path.join(ROOT, 'vendor');
const fail = (msg) => { console.error('BUILD FAILED: ' + msg); process.exit(1); };

// Load order: the one list. Must match both shells exactly (checked in 4).
const MODULES = ['icons', 'calculator', 'fenton', 'registry', 'log', 'app'];
// data.js appVersion() stamps every Daily_Log row with "<first letter>=<token>"
// per loaded script, so the first letters must stay unique.
const STAMPED = ['boot', 'data', ...MODULES];

// ── 0 · the pinned toolchain, from tools/node_modules only ──────────────────
// Never resolve up the tree: a repo-root node_modules (the test harness deps)
// could hold a different React or no esbuild at all.
const pins = JSON.parse(readFileSync(path.join(TOOLS, 'package.json'), 'utf8')).devDependencies;
const pkgDir = (name) => {
  const dir = path.join(TOOLS, 'node_modules', name);
  if (!existsSync(path.join(dir, 'package.json'))) fail(`tools/node_modules/${name} is missing — run: npm ci --prefix tools`);
  const { version } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (version !== pins[name]) fail(`tools/node_modules/${name} is ${version}, tools/package.json pins ${pins[name]} — run: npm ci --prefix tools`);
  return dir;
};
const esbuild = await import(pathToFileURL(path.join(pkgDir('esbuild'), 'lib', 'main.js')).href);
if (esbuild.version !== pins.esbuild) fail(`esbuild reports ${esbuild.version}, expected ${pins.esbuild}`);

const lf = (s) => s.replace(/\r\n/g, '\n');
const read = (rel) => lf(readFileSync(path.join(ROOT, rel), 'utf8'));
const token = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);

{
  const letters = STAMPED.map(m => m[0].toLowerCase());
  const dup = letters.find((l, i) => letters.indexOf(l) !== i);
  if (dup) fail(`two stamped scripts start with "${dup}" (${STAMPED.filter(m => m[0].toLowerCase() === dup).join(', ')}) — appVersion() could not tell them apart`);
}

// ── 1 · compile ─────────────────────────────────────────────────────────────
const compiled = {};
for (const m of MODULES) {
  const r = await esbuild.transform(read(`${m}.jsx`), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2020',
    charset: 'utf8',          // keep Thai literals readable, not \u escapes
    banner: '"use strict";',
    legalComments: 'none',
    minify: false,            // reviewable, diffable committed output
    sourcefile: `${m}.jsx`,
  });
  if (r.warnings.length) fail(`${m}.jsx: ${r.warnings.map(w => w.text).join('; ')}`);
  compiled[m] = r.code;
}

// ── 2 · one shared global scope ─────────────────────────────────────────────
{
  // The window properties Chromium makes non-configurable (read from a live
  // page, 2026-09-17). A top-level const/let/class with one of these names is
  // a SyntaxError in the browser.
  const RESTRICTED = ['window', 'document', 'location', 'top'];
  const sandbox = {};
  for (const k of RESTRICTED) Object.defineProperty(sandbox, k, { value: {}, configurable: false, writable: false, enumerable: true });
  const ctx = vm.createContext(sandbox);
  const scripts = [
    ['boot.js', read('boot.js')],
    ['data.js', read('data.js')],
    ...MODULES.map(m => [`compiled/${m}.js`, compiled[m]]),
  ];
  for (const [name, code] of scripts) {
    // A leading `throw` stops execution right AFTER GlobalDeclarationInstantiation,
    // which is exactly where a cross-script redeclaration is rejected. Declarations
    // register; no app code runs. The directive stays first so strict-mode early
    // errors still apply.
    const body = code.startsWith('"use strict";') ? '"use strict";throw 0;' + code.slice(13) : 'throw 0;' + code;
    try { new vm.Script(body, { filename: name }).runInContext(ctx); }
    catch (e) {
      if (e === 0) continue;
      fail(`${name} cannot load after the scripts before it: ${e && e.message}`);
    }
  }
  // A global lexical binding shadows the window property of the same name; its
  // binding stays uninitialised, so reading it throws.
  for (const k of RESTRICTED) {
    try { vm.runInContext(`typeof ${k}`, ctx); }
    catch { fail(`a script declares a top-level "${k}", which the browser's window already owns`); }
  }
}

// ── 3 · vendor: React/ReactDOM, byte-identical to what unpkg served ─────────
// The SRI hashes index.html pinned for unpkg's React 18.3.1 UMD builds until
// 2026-09-17. Self-hosted bytes must be those exact bytes, or the move changed
// React itself.
const PINNED_SRI = {
  'react/umd/react.production.min.js': 'sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z',
  'react-dom/umd/react-dom.production.min.js': 'sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1',
};
const vendor = [];
for (const [rel, sri] of Object.entries(PINNED_SRI)) {
  const [name, , file] = rel.split('/');
  const bytes = readFileSync(path.join(pkgDir(name), 'umd', file));   // raw bytes, never normalised
  const got = 'sha384-' + createHash('sha384').update(bytes).digest('base64');
  if (got !== sri) fail(`${name}@${pins[name]} umd/${file} is not the build index.html pinned (${got})`);
  vendor.push({ file: file.replace('.production.min.js', `-${pins[name]}.production.min.js`), bytes });
}

// ── 4 · shells ──────────────────────────────────────────────────────────────
const assets = [
  { src: 'boot.js', text: read('boot.js') },
  { src: 'data.js', text: read('data.js') },
  ...MODULES.map(m => ({ src: `compiled/${m}.js`, text: compiled[m] })),
];
const rawShell = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const eol = rawShell.includes('\r\n') ? '\r\n' : '\n';
let shell = lf(rawShell);
// NeoFeed.html is the file people edit; index.html is what ships. Refuse to pick
// a winner: tokens aside they must already agree, or one side's edit is lost.
const stripTokens = (s) => s.replace(/\?v=[\w.-]*"/g, '"');
if (stripTokens(shell) !== stripTokens(read('NeoFeed.html')))
  fail('index.html and NeoFeed.html differ (beyond ?v= tokens) — apply the edit to both first');
for (const a of assets) {
  const re = new RegExp(`(<script src="${a.src.replace(/[.]/g, '\\.')})(?:\\?v=[\\w.-]*)?("></script>)`, 'g');
  const n = (shell.match(re) || []).length;
  if (n !== 1) fail(`the shells must load ${a.src} exactly once, as <script src="${a.src}"></script> (found ${n})`);
  shell = shell.replace(re, `$1?v=${token(a.text)}$2`);
}
if (/text\/babel|@babel\/standalone|unpkg\.com/.test(shell)) fail('a shell still references in-browser Babel or unpkg');
// Structure is read with HTML comments removed, so a comment that mentions a
// tag cannot satisfy (or fail) a check.
const markup = shell.replace(/<!--[\s\S]*?-->/g, '');
const tags = [...markup.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
if (tags.some(t => t[2].trim() !== '')) fail('a shell has an inline <script> body — the CSP no longer allows one; move it into boot.js');
if (tags.some(t => !/\bsrc="/.test(t[1]))) fail('a shell has a <script> without src');
// Execution order of the parser-inserted classic scripts. Sign-In is async and
// order-independent, so it is left out.
const order = tags.map(t => t[1].match(/\bsrc="([^"?]+)/)[1]).filter(s => s !== 'https://accounts.google.com/gsi/client');
const want = ['boot.js', ...vendor.map(v => `vendor/${v.file}`), 'data.js', ...MODULES.map(m => `compiled/${m}.js`)];
if (JSON.stringify(order) !== JSON.stringify(want))
  fail(`script order is\n  ${order.join('\n  ')}\nexpected\n  ${want.join('\n  ')}`);
{
  const head = markup.slice(0, markup.indexOf('</head>'));
  if (!(head.indexOf('<script src="boot.js') >= 0 && head.indexOf('<script src="boot.js') < head.indexOf('<link')))
    fail('boot.js must be the first script in <head>, before any <link>');
  const fonts = markup.indexOf('https://fonts.googleapis.com/css2');
  const lastScript = markup.lastIndexOf('</script>');
  if (!(fonts > lastScript && markup.slice(lastScript, fonts).includes('<link')))
    fail('the Google Fonts stylesheet <link> must come after the last <script> (a slow fonts request blocked every script)');
}

// ── write ───────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (!MODULES.some(m => f === `${m}.js`)) rmSync(path.join(OUT, f), { recursive: true });
for (const m of MODULES) writeFileSync(path.join(OUT, `${m}.js`), compiled[m]);
mkdirSync(VENDOR, { recursive: true });
for (const f of readdirSync(VENDOR)) if (!vendor.some(v => v.file === f)) rmSync(path.join(VENDOR, f), { recursive: true });
for (const v of vendor) writeFileSync(path.join(VENDOR, v.file), v.bytes);
const out = eol === '\n' ? shell : shell.replace(/\n/g, eol);
writeFileSync(path.join(ROOT, 'index.html'), out);
writeFileSync(path.join(ROOT, 'NeoFeed.html'), out);   // identical by construction

console.log(`built with esbuild ${esbuild.version}:`);
for (const a of assets) console.log(`  ${a.src.padEnd(22)} ${String(Buffer.byteLength(a.text)).padStart(7)} B  v=${token(a.text)}`);
for (const v of vendor) console.log(`  vendor/${v.file.padEnd(40)} ${String(v.bytes.length).padStart(7)} B  (matches pinned SRI)`);
