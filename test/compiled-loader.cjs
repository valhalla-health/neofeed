// Preload: run the existing harnesses against the SHIPPED compiled/*.js instead
// of an in-harness @babel/preset-react transform of the .jsx sources. No harness
// is edited for it.
//
//   NODE_OPTIONS="--require ./test/compiled-loader.cjs" node test/verify-resync-and-lists.cjs
//
// Every harness that mounts a module does
//   vm.runInThisContext(babel.transformSync(<whole .jsx file>, { filename: f, ... }).code)
// so intercepting transformSync by `filename` swaps in compiled/<module>.js and
// leaves everything else (jsdom, the fake backend, the assertions) untouched.
// Source-text assertions (regexes over calculator.jsx and friends) still read
// the sources, which is right: that is what they pin.
//
// A swap is only honest when the harness asked for the whole, unmodified source
// file, so anything else (a slice, a patched copy) throws instead of silently
// testing the sources. CI proves compiled/ is a fresh build of those sources
// before this runs. @babel/core's exports are getter-only, so the module object
// is wrapped at require time rather than mutated.
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const MODULES = new Set(['icons', 'calculator', 'fenton', 'registry', 'log', 'app']);
const lf = (s) => String(s).replace(/\r\n/g, '\n');
const served = new Set();
let wrapped = null;

const load = Module._load;
Module._load = function (request) {
  const real = load.apply(this, arguments);
  if (request !== '@babel/core') return real;
  if (wrapped) return wrapped;
  wrapped = Object.create(real);
  // defineProperty, not assignment: an inherited getter-only accessor silently
  // swallows a plain assignment.
  Object.defineProperty(wrapped, 'transformSync', {
    enumerable: true,
    value(code, opts = {}) {
      const m = /^([a-z]+)\.jsx$/.exec(path.basename(String(opts.filename || '')));
      if (!m || !MODULES.has(m[1])) return real.transformSync.apply(real, arguments);
      const source = fs.readFileSync(path.join(ROOT, `${m[1]}.jsx`), 'utf8');
      if (lf(code) !== lf(source)) {
        throw new Error(`[compiled-loader] ${m[1]}.jsx was transformed from text that is not the file on disk; ` +
          'compiled output cannot stand in for it. Run this harness without the preload.');
      }
      served.add(m[1]);
      return { code: fs.readFileSync(path.join(ROOT, 'compiled', `${m[1]}.js`), 'utf8') };
    },
  });
  return wrapped;
};

process.on('exit', () => {
  fs.writeSync(1, `[compiled-loader] ${served.size ? `swapped in compiled/{${[...served].join(',')}}.js` : 'no module transformed in this process'}\n`);
});
