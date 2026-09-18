// The build step (2026-09-17): what the two shells load, and what the hosts
// publish. Dependency-free, source-level.
//
// Until 2026-09-17 the shells pulled React, ReactDOM and @babel/standalone from
// unpkg and compiled the .jsx modules in the browser, which is why _headers'
// script-src carried 'unsafe-eval' and 'unsafe-inline'. tools/build.mjs now
// precompiles them to compiled/*.js and self-hosts React in vendor/. The CSP and
// the shells only work as a pair: the new CSP white-screens the old shells, and
// a shell that still needs Babel is exactly what that CSP exists to refuse. So
// this pins both halves, plus the two publish filters that could silently drop
// a file the app now needs (a missing boot.js puts the app in LOCAL MOCK MODE).
//
// CI separately rebuilds and fails on any diff, so the compiled output matching
// its sources is proven there; this harness needs no npm install.
//
//   #1 both shells: byte-identical; every <script> is same-origin boot.js /
//      vendor / data.js / compiled, or Google Sign-In; no inline script body, no
//      text/babel, no unpkg; exact load order; boot.js first in <head>
//   #2 every ?v= token is the content hash of the file it loads
//   #3 vendor/ holds the exact React builds the old SRI hashes pinned
//   #4 _headers: script-src has no 'unsafe-*' and no unpkg
//   #5 .assetsignore / _config.yml publish boot.js, data.js, compiled/, vendor/
//      and keep tools/ private
//   #6 the Google Fonts stylesheet comes after the last script
//   #7 appVersion() still derives the provenance stamp from the loaded tokens
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const has = (f) => fs.existsSync(path.join(ROOT, f));
const read = (f) => (has(f) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '');
const lf = (s) => s.replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${good ? 'PASS' : 'FAIL'}  ${name.padEnd(66)}${good ? '' : ` got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  good ? pass++ : fail++;
}
const ok = (name, cond) => eq(name, !!cond, true);

const MODULES = ['icons', 'calculator', 'fenton', 'registry', 'log', 'app'];
const VENDOR = {
  'vendor/react-18.3.1.production.min.js': 'sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z',
  'vendor/react-dom-18.3.1.production.min.js': 'sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1',
};
const GSI = 'https://accounts.google.com/gsi/client';
// Structure is read with HTML comments removed, so a comment that mentions a
// tag cannot satisfy (or fail) a check.
const shell = lf(read('index.html')).replace(/<!--[\s\S]*?-->/g, '');
const scripts = [...shell.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .map(m => ({ attrs: m[1], body: m[2], src: (m[1].match(/\bsrc="([^"]*)"/) || [])[1] || null }));
const base = (src) => src.split('?')[0];

console.log('\n── #1 the shells load precompiled, same-origin scripts only ──');
{
  ok('1.1 index.html and NeoFeed.html are byte-identical', read('index.html') === read('NeoFeed.html'));
  ok('1.2 every <script> has a src', scripts.length > 0 && scripts.every(s => s.src));
  eq('1.3 no inline <script> bodies (the CSP has no \'unsafe-inline\')', scripts.filter(s => s.body.trim()).length, 0);
  ok('1.4 no type="text/babel" and no @babel/standalone', !/text\/babel|@babel\/standalone|babel\.min\.js/.test(shell));
  ok('1.5 nothing from unpkg.com', !/unpkg\.com/.test(shell));
  const allowed = (src) => src === GSI || /^(boot|data)\.js\?v=/.test(src) || /^compiled\/[a-z]+\.js\?v=/.test(src) || Object.keys(VENDOR).includes(src);
  eq('1.6 only boot.js, vendor/, data.js, compiled/ and Google Sign-In', scripts.map(s => s.src).filter(s => !allowed(s || '')), []);
  eq('1.7 load order', scripts.map(s => base(s.src || 'INLINE')).filter(s => s !== GSI),
    ['boot.js', ...Object.keys(VENDOR), 'data.js', ...MODULES.map(m => `compiled/${m}.js`)]);
  const head = shell.slice(0, shell.indexOf('</head>'));
  const boot = head.indexOf('<script src="boot.js');
  ok('1.8 boot.js is the first script in <head>, before any <link>', boot >= 0 && boot === head.indexOf('<script') && boot < head.indexOf('<link'));
  ok('1.9 Google Sign-In stays async', scripts.some(s => s.src === GSI && /\basync\b/.test(s.attrs)));
  eq('1.10 no <script> loads a .jsx', scripts.filter(s => /\.jsx\b/.test(s.src || '')).length, 0);
}

console.log('\n── #2 every ?v= token is the hash of the bytes it loads ──');
{
  const tokened = scripts.filter(s => /\?v=/.test(s.src || ''));
  eq('2.0 eight scripts carry a token', tokened.map(s => base(s.src)), ['boot.js', 'data.js', ...MODULES.map(m => `compiled/${m}.js`)]);
  for (const s of tokened) {
    const f = base(s.src);
    const want = has(f) ? crypto.createHash('sha256').update(lf(read(f))).digest('hex').slice(0, 10) : '(missing file)';
    eq(`2.x ${f}`, s.src.split('?v=')[1], want);
  }
  eq('2.9 compiled/ holds exactly the six modules', has('compiled') ? fs.readdirSync(path.join(ROOT, 'compiled')).sort() : [], MODULES.map(m => `${m}.js`).sort());
  for (const m of MODULES) {
    const code = read(`compiled/${m}.js`);
    // Compiling (not running) as a classic script: leftover JSX is a SyntaxError.
    let parses = false;
    try { new vm.Script(code, { filename: `compiled/${m}.js` }); parses = code.length > 0; } catch { /* stays false */ }
    ok(`2.10 compiled/${m}.js is plain strict-mode JavaScript`, parses && /^"use strict";/.test(code));
  }
}

console.log('\n── #3 self-hosted React is the build the old SRI hashes pinned ──');
for (const [f, sri] of Object.entries(VENDOR)) {
  const got = has(f) ? 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(path.join(ROOT, f))).digest('base64') : '(missing file)';
  eq(`3.x ${f}`, got, sri);
}
eq('3.9 vendor/ holds nothing else', has('vendor') ? fs.readdirSync(path.join(ROOT, 'vendor')).sort() : [], Object.keys(VENDOR).map(f => f.slice(7)).sort());

console.log('\n── #4 _headers: script-src without unsafe-inline / unsafe-eval ──');
{
  const csp = (read('_headers').split(/\r?\n/).find(l => l.trim().startsWith('Content-Security-Policy:')) || '');
  const directive = (name) => (csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) || '').split(/\s+/).slice(1);
  const scriptSrc = directive('script-src');
  eq('4.1 script-src is exactly \'self\' + Google Sign-In', scriptSrc, ["'self'", 'https://accounts.google.com']);
  ok('4.2 no \'unsafe-inline\' or \'unsafe-eval\' in script-src', scriptSrc.length && !scriptSrc.some(s => /unsafe/.test(s)));
  ok('4.3 no unpkg.com anywhere in the policy', csp && !/unpkg/.test(csp));
  ok('4.4 no script-src-elem / script-src-attr loosening it again', !/script-src-(elem|attr)/.test(csp));
}

console.log('\n── #5 both hosts publish what the app loads, and not tools/ ──');
{
  // .assetsignore is gitignore syntax. Enough of it for the patterns used there.
  const globRe = (pat) => {
    let p = pat.replace(/\/$/, '');
    const anchored = pat.startsWith('/') || p.includes('/');
    p = p.replace(/^\//, '');
    const body = p.split(/(\*\*\/?|\*|\?)/).map(t => t === '**/' || t === '**' ? '(?:.*/)?' : t === '*' ? '[^/]*' : t === '?' ? '[^/]' : t.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('');
    return new RegExp((anchored ? '^' : '(?:^|/)') + body + '(?:/|$)');
  };
  const ignored = (file, text) => {
    let out = false;
    for (const raw of lf(text).split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const neg = line.startsWith('!');
      if (globRe(neg ? line.slice(1) : line).test(file)) out = !neg;
    }
    return out;
  };
  const NEEDED = ['index.html', 'boot.js', 'data.js', 'manifest.json', 'moved.html', 'icons/icon.svg',
    ...MODULES.map(m => `compiled/${m}.js`), ...Object.keys(VENDOR)];
  const assetsignore = read('.assetsignore');
  ok('5.0 .assetsignore exists', assetsignore);
  eq('5.1 Cloudflare publishes every file the shell loads', NEEDED.filter(f => ignored(f, assetsignore)), []);
  ok('5.2 Cloudflare does not publish tools/', ignored('tools/build.mjs', assetsignore) && ignored('tools/package.json', assetsignore));
  // _config.yml: Jekyll's exclude list, one "- entry" per line.
  const excludes = [...lf(read('_config.yml')).matchAll(/^\s*-\s*"?([^"\n#]+?)"?\s*$/gm)].map(m => m[1]);
  const jekyllDrops = (f) => excludes.some(e => globRe(e).test(f));
  ok('5.3 _config.yml has an exclude list', excludes.length > 0);
  eq('5.4 GitHub Pages publishes every file the shell loads', NEEDED.filter(jekyllDrops), []);
  ok('5.5 GitHub Pages does not publish tools/', jekyllDrops('tools/build.mjs'));
  // Old clients mid-deploy may still hold a cached shell that asks for .jsx.
  eq('5.6 the .jsx sources stay published for this release', MODULES.map(m => `${m}.jsx`).filter(f => ignored(f, assetsignore) || jekyllDrops(f)), []);
}

console.log('\n── #6 fonts never hold back a script ──');
{
  const fonts = shell.indexOf('https://fonts.googleapis.com/css2');
  const lastScript = shell.lastIndexOf('</script>');
  ok('6.1 the Google Fonts stylesheet <link> is after the last <script>', fonts > lastScript && lastScript > 0);
  ok('6.2 …and it is still loaded, once', (shell.match(/fonts\.googleapis\.com\/css2/g) || []).length === 1);
}

console.log('\n── #7 the provenance stamp reads the new script list ──');
{
  const nodes = scripts.filter(s => s.src).map(s => ({ getAttribute: (k) => (k === 'src' ? s.src : null) }));
  const ctx = {
    window: {}, console,
    document: { querySelectorAll: (sel) => (sel === 'script[src*="?v="]' ? nodes.filter(n => /\?v=/.test(n.getAttribute('src'))) : []) },
  };
  vm.createContext(ctx);
  let stamp = null;
  try {
    vm.runInContext(read('data.js'), ctx);
    stamp = ctx.window.NEOFEED_DATA.appVersion();
  } catch (e) { stamp = 'threw: ' + e.message; }
  const tok = (src) => (scripts.find(s => base(s.src || '') === src)?.src || '').split('?v=')[1];
  eq('7.1 appVersion() = b;d;i;c;f;r;l;a tokens in load order', stamp,
    ['b=' + tok('boot.js'), 'd=' + tok('data.js'), ...MODULES.map(m => `${m[0]}=${tok(`compiled/${m}.js`)}`)].join(';'));
  ok('7.2 …which the sheet cannot read as a formula', stamp && !/^[=+\-@]/.test(stamp));
}

console.log(`\nBUILD + SHELLS: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
