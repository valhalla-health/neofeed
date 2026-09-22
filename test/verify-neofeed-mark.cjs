// verify-neofeed-mark.cjs — the two-tone N: app icons, login wordmark, app mark.
//
// Praew, 2026-09-22, choosing from the brand board she approved (the no-dot,
// shaded N: a lighter left stem, the diagonal and right stem darker, a slit
// between them): replace the old N-with-dot in the favicon and phone icons,
// and put the new wordmark on the login screen. Later the same day: put the
// mark in the app itself ("Logo icon N ให้ใช้ใน app ด้วย มุมซ้ายบน ... ให้แทน
// n+dot เก่าทุกอัน"), and draw the whole thing in the Valhalla Teal sheet
// rather than the board's green ("ลองใช้ logo ที่ทำใหม่ แต่ใช้ palette สี
// valhalla teal") once the app went back to teal.
//
// ONE GEOMETRY, now in THREE places — the master, the login wordmark and the
// in-app <NeoFeedMark/> — and no copy may drift: icons/icon.svg is the master,
// and both app.jsx marks must carry the very same two path strings and the very
// same four gradient stops. The seven PNGs are checked by decoding them (zlib
// is Node's own; no dependencies), so a master that changed without a re-render
// — or the reverse — fails here. There must be no N+dot left anywhere.
//
// Source-level like verify-login-endorsement.cjs: reads app.jsx and both
// hand-synced shells, CRLF-normalised so a Windows checkout reads what CI reads.
//   node test/verify-neofeed-mark.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 300)}`);
  cond ? pass++ : fail++;
}

// The icon's tile: Mineral Mist, the Valhalla Teal sheet's lightest brand
// colour. (It was the board's jade #D3E3D3 until the app went back to teal.)
const TILE_RGB = [0xD5, 0xEC, 0xEA];

// ── the master ────────────────────────────────────────────────────────────
console.log('\n── icons/icon.svg — the master ──');
const svg = read('icons/icon.svg');
const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(m => m[1]);
ok('no counter-dot', !/<circle\b/.test(svg));
ok('no stroked N — the letter is filled shapes now', !/\bstroke(-width)?=/.test(svg));
ok('exactly two shapes: the dark body and the light left stem', paths.length === 2, paths.length);
ok('the tile is Mineral Mist', new RegExp(`<rect\\b[^>]*fill="#${TILE_RGB.map(c => c.toString(16).padStart(2, '0')).join('')}"`, 'i').test(svg));
ok('the body is the brand ramp: Valhalla Teal → Midnight Teal', /stop-color="#12656A"/i.test(svg) && /stop-color="#103F43"/i.test(svg));
ok('the left stem is Sea Glass, falling to a darker Sea Glass', /stop-color="#78BFC0"/i.test(svg) && /stop-color="#5BA2A3"/i.test(svg));
ok('no green left from the brand board', !/#335A4A|#284C40|#99B29C|#799781|#D3E3D3/i.test(svg));

// ── the seven PNGs ────────────────────────────────────────────────────────
// A minimal PNG reader: 8-bit, non-interlaced, RGB / RGBA / palette.
function decodePng(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);
  let off = 8, ihdr, plte, trns;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const { w, h, depth, color, interlace } = ihdr;
  const ch = { 2: 3, 3: 1, 6: 4 }[color];
  if (depth !== 8 || interlace !== 0 || !ch) throw new Error(`${file}: unsupported PNG (depth ${depth}, colour type ${color}, interlace ${interlace})`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const add = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      line[x] = (line[x] + add) & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (color === 3) {
        const i = line[x];
        out[o] = plte[i * 3]; out[o + 1] = plte[i * 3 + 1]; out[o + 2] = plte[i * 3 + 2];
        out[o + 3] = trns && i < trns.length ? trns[i] : 255;
      } else {
        out[o] = line[x * ch]; out[o + 1] = line[x * ch + 1]; out[o + 2] = line[x * ch + 2];
        out[o + 3] = ch === 4 ? line[x * ch + 3] : 255;
      }
    }
    prev = line;
  }
  return { w, h, px: out };
}

// Opaque pixels only, sorted into the mark's three colours (plus white, which
// the mark never uses and the old white-stroked N was made of).
// `g > r` is the cool-family test that survived the green→teal move; the old
// classifier also required `g > b`, which is a GREEN test — teal's blue channel
// is the equal or larger of the two, so every pixel fell through it.
function census({ w, h, px }) {
  const k = { forest: [], sage: [], jade: 0, white: 0, opaque: 0 };
  const freq = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, [r, g, b, a] = [px[o], px[o + 1], px[o + 2], px[o + 3]];
    if (a < 250) continue;
    k.opaque++;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (r > 240 && g > 240 && b > 240) k.white++;
    else if (L < 110 && g > r) k.forest.push(x);
    else if (L < 195 && g > r) k.sage.push(x);
    else if (g - r >= 8) k.jade++;
    const key = (r >> 2) << 16 | (g >> 2) << 8 | (b >> 2);
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  k.mode = [(top >> 16) << 2, ((top >> 8) & 255) << 2, (top & 255) << 2];
  return k;
}
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
const near = (c, want, tol) => c.every((v, i) => Math.abs(v - want[i]) <= tol);

const PNGS = [
  // [file, size, full-bleed?] — the maskable and Apple icons fill the square
  // (the platform draws the corners); the "any" icons carry their own.
  ['icons/favicon-16.png', 16, false],
  ['icons/favicon-32.png', 32, false],
  ['icons/icon-192.png', 192, false],
  ['icons/icon-512.png', 512, false],
  ['icons/icon-192-maskable.png', 192, true],
  ['icons/icon-512-maskable.png', 512, true],
  ['icons/apple-touch-icon.png', 180, true],
];
for (const [file, size, bleed] of PNGS) {
  console.log(`\n── ${file} ──`);
  let img;
  try { img = decodePng(file); } catch (e) { ok('decodes', false, e.message); continue; }
  ok(`${size}×${size}`, img.w === size && img.h === size, [img.w, img.h]);
  const k = census(img);
  const corner = img.px[3];
  ok(bleed ? 'full-bleed: the corner is opaque' : 'its own rounded corners: the corner is transparent', bleed ? corner === 255 : corner === 0, corner);
  ok('no white — the old N was a white stroke', k.white === 0, k.white);
  ok('the tile is Mineral Mist', near(k.mode, TILE_RGB, 6), k.mode);
  ok('the tile is the ground, not the mark (tile ≥ 40% of the icon)', k.jade / k.opaque >= 0.4, +(k.jade / k.opaque).toFixed(3));
  ok('the dark body is present, and not the whole tile (5–40%)', k.forest.length / k.opaque >= 0.05 && k.forest.length / k.opaque <= 0.4, +(k.forest.length / k.opaque).toFixed(3));
  if (size >= 180) {
    // At 16/32 px the antialiased Forest edge outweighs the stem itself, so
    // position is only read where the stem is many pixels wide.
    ok('a light stem is present', k.sage.length / k.opaque >= 0.03, +(k.sage.length / k.opaque).toFixed(3));
    ok('…and it is the LEFT stem: the light stem sits left of the dark body', mean(k.sage) < mean(k.forest) - size * 0.1, [Math.round(mean(k.sage)), Math.round(mean(k.forest))]);
  }
}

// ── the wordmark, and its three call sites ────────────────────────────────
// Praew, 2026-09-22: "ส่วนบนซ้ายในหน้า dashboard ... ให้เอา NeoFeed ที่แก้แล้วนี้
// ไปใส่ ไม่ต้องใส่ icon". The app's own corner is the WORDMARK now, not an icon
// tile — so the tile above is only ever the home-screen/favicon artwork, and
// ONE <NeoFeedWordmark/> serves the login hero, the topbar and the sync gate.
console.log('\n── app.jsx — <NeoFeedWordmark/> ──');
const app = read('app.jsx');
const word = /const NeoFeedWordmark = \([\s\S]*?\n\);/.exec(app)?.[0] || '';
ok('<NeoFeedWordmark/> is defined', word.length > 0);
ok('it is announced as one name: role="img" aria-label="NeoFeed"',
  /role="img"/.test(word) && /aria-label="NeoFeed"/.test(word), word.slice(0, 200));
ok('it leads with the mark, then "eo", then a light "Feed"',
  /<svg[\s\S]*<\/svg>eo<span className="lw">Feed<\/span>/.test(word), word.slice(-200));
ok('no letter N left in the text — the mark IS the N', !/>\s*Neo\b/.test(word));
for (const [i, d] of paths.entries())
  ok(`it draws icon.svg's shape ${i + 1} with the same path`, word.includes(`d="${d}"`), d.slice(0, 60));
const stops = (text, attr) => [...text.matchAll(new RegExp(`${attr}="(#[0-9a-f]{6})"`, 'gi'))].map(m => m[1].toUpperCase());
ok('…and shades it with the master\'s four stops, in the master\'s order',
  JSON.stringify(stops(word, 'stopColor')) === JSON.stringify(stops(svg, 'stop-color')) && stops(svg, 'stop-color').length === 4,
  { wordmark: stops(word, 'stopColor'), master: stops(svg, 'stop-color') });
ok('it carries no tile — the wordmark is the letter alone',
  !/<rect\b/.test(word) && /viewBox="0 0 98 100"/.test(word), word.slice(0, 200));

// The three call sites, and only one component behind them.
ok('the login screen renders it as the hero',
  /<NeoFeedWordmark className="login-app-name" \/>/.test(app),
  /.{0,80}NeoFeedWordmark className.{0,40}/.exec(app)?.[0]);
ok('the topbar corner renders it, with NO icon tile beside it',
  /<div className="brandmark"><NeoFeedWordmark \/><\/div>/.test(app),
  /.{0,120}className="brandmark".{0,120}/.exec(app)?.[0]);
ok('the sync gate renders it too', /<NeoFeedWordmark style=\{\{ fontSize:23/.test(app));
ok('there is exactly one wordmark component in the file, not three copies',
  (app.match(/viewBox="0 0 98 100"/g) || []).length === 1,
  (app.match(/viewBox="0 0 98 100"/g) || []).length);
ok('the icon TILE is drawn by no component at all — it is icons/ artwork',
  !/viewBox="0 0 256 256"/.test(app) && !/NeoFeedMark/.test(app),
  (/.{0,60}NeoFeedMark.{0,40}/.exec(app) || [''])[0]);

// The point of the exercise: the old mark is gone from the app, not merely
// unused. `M7 21 V 7 L 21 21 V 7` was its one path, drawn twice.
ok('NO N+dot is left anywhere in app.jsx', !/M7 21 V 7/.test(app), (/.{0,80}M7 21 V 7.{0,40}/.exec(app) || [''])[0]);

for (const shell of ['NeoFeed.html', 'index.html']) {
  console.log(`\n── ${shell} ──`);
  const css = read(shell);
  ok('the .login-logo-mark rule went with the tile', !/\.login-logo-mark\b/.test(css));
  // No tile anywhere in the app's chrome: the topbar's .logo box is gone, not
  // just emptied, so nothing can paint a square behind the wordmark again.
  ok('the topbar draws no icon tile', !/\.brandmark \.logo\b/.test(css),
    (/.{0,80}\.brandmark \.logo.{0,60}/.exec(css) || [''])[0]);
  // One sizing rule, in em, so a call site sets font-size and nothing else.
  const wm = /\n  \.nf-wordmark \{([^}]*)\}/.exec(css)?.[1] || '';
  const nfn = /\.nf-wordmark \.nf-n \{([^}]*)\}/.exec(css)?.[1] || '';
  ok('.nf-wordmark is styled once and takes its colour from --brand',
    /color:\s*var\(--brand\)/.test(wm), wm.replace(/\s+/g, ' ').slice(0, 160));
  ok('…and the N is sized in em, to the cap height, on the baseline',
    /width:\s*0\.684em/.test(nfn) && /height:\s*0\.698em/.test(nfn) && /vertical-align:\s*baseline/.test(nfn),
    nfn.replace(/\s+/g, ' ').slice(0, 160));
  // Praew, 2026-09-22: "ให้คำว่า feed สีเข้มเท่า N ตรงที่เข้มๆ". --brand-ink IS
  // Midnight Teal, the stop the N's body gradient ends on — so this is a token
  // reference to "the dark part of the N", not a literal matched by eye.
  const lw = /\.nf-wordmark \.lw \{([^}]*)\}/.exec(css)?.[1] || '';
  ok('"Feed" is as dark as the N\'s dark stop (--brand-ink)',
    /color:\s*var\(--brand-ink\)/.test(lw), lw.replace(/\s+/g, ' '));
  const inkTok = /--brand-ink:\s*([^;]+);/.exec(css)?.[1].trim();
  ok('…and --brand-ink is Midnight Teal, which is that stop',
    inkTok === 'oklch(33.9% 0.049 203)' && /stop-color="#103F43"/i.test(svg), inkTok);
  ok('both the topbar and the login hero size it, nothing else',
    /\.brandmark \.nf-wordmark \{[^}]*font-size/.test(css) && /\.login-app-name \{[^}]*font-size/.test(css));
  const after = /\.login-app-name::after\s*\{([^}]*)\}/.exec(css)?.[1] || '';
  ok('the rule under the wordmark is two-tone: Sage, then Champagne Gold', /var\(--brand-4\)[\s\S]*var\(--sand\)/.test(after), after);
  const weight = /font-weight:\s*(\d+)/.exec(lw)?.[1];
  const loaded = /IBM\+Plex\+Sans:wght@([\d;]+)/.exec(css)?.[1]?.split(';') || [];
  ok(`"Feed"'s weight (${weight}) is one the fonts link actually loads`, !!weight && loaded.includes(weight), { weight, loaded });
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
