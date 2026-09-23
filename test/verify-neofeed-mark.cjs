// verify-neofeed-mark.cjs — the NeoFeed logo: app icons, the logo master, the in-app wordmark.
//
// Praew, 2026-09-23, choosing from rendered sheets: a new logo drawn from her
// Canva artwork. The N is a swaddled baby ("ศีรษะทารกนอนอยู่แล้วถูกห่อผ้า") — a
// Sage head in a round bite out of the Forest ribbon, a Sage stem for the body
// — with the head moved up 5 and forward 3 ("ให้วงกลมขยับขึ้นและมาทางด้านหน้า",
// then "ปรับศีรษะทารกใน neofeed เท่ากับ icon ที่เลือก"). Then "eo" and "Feed"
// with a feeding bottle and a milk drop in Feed's two e's ("หยดน้ำ ให้เป็นหยดน้ำ
// เหมือนต้นฉบับ") and a two-tone rule, in the N's own Forest family. Then, from
// her look at the built app: "by Valhalla health เอาไว้ด้านล่าง คู่กับ 2026
// เหมือนเดิม" (the byline left the logo), "สีของ feed ให้เขียวเข้มขึ้นเข้ากับ N
// เขียวอ่อนตัวหน้า" (option C, #476655), and "ให้ขอบของ F, d มนๆ เหมือน N"
// (every letter's corners rounded, for "ความเข้ากันของทั้ง logo"). The icon
// keeps the app's own Porcelain Mist ground ("logo เอาแบบนี้").
//
// ONE DRAWING, THREE COPIES, and no copy may drift:
//   icons/icon.svg  — the app-icon master: the N's three paths on the ground
//   icons/logo.svg  — the lockup master: the N + "eo" + "Feed" + the rule
//   app.jsx         — <NeoFeedWordmark/>, which must carry logo.svg's paths
//                     character for character, and the N's three are icon.svg's.
// The seven PNGs are checked by decoding them (zlib is Node's own; no
// dependencies), so a master that changed without a re-render — or the
// reverse — fails here.
//
// Source-level like verify-login-endorsement.cjs: reads app.jsx and both
// hand-synced shells, CRLF-normalised so a Windows checkout reads what CI reads.
//   node test/verify-neofeed-mark.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
// A missing file reads as empty, so it fails the assertions about it rather than crashing the run.
const read = (f) => fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n') : '';

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 300)}`);
  cond ? pass++ : fail++;
}

// The icon's ground: Porcelain Mist, the app's OWN page background, byte for
// byte the value :root gives --bg (Praew, 2026-09-22, and kept on 2026-09-23).
const GROUND_RGB = [0xF5, 0xF8, 0xF7];
// The lockup's literal colours — two greens and a gold: "eo" in the N's
// Forest, "Feed" and the rule's left half in one Sage-family green (option C,
// a step darker than the N's stem), the rule's right half Champagne Gold.
// Literals, because a logo is not a UI colour.
const INK = { eo: '#284C40', feed: '#476655', ruleL: '#476655', ruleR: '#C5A46D' };
// Every joint of a letter's outline must be smooth, i.e. every corner rounded
// like the N's. Reads the absolute M/L/Q/C/Z path data the logo is written in
// and returns, per subpath, the largest turn (degrees) at any joint.
function maxTurns(d) {
  const tok = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const subs = []; let segs = [], cur = null, cmd = null, i = 0;
  const num = () => +tok[i++];
  while (i < tok.length) {
    if (/[MLQCZ]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'Z') { subs.push(segs); segs = []; cmd = null; continue; }
    if (cmd === 'M') { cur = [num(), num()]; cmd = 'L'; continue; }
    const n = { L: 1, Q: 2, C: 3 }[cmd], pts = [cur];
    for (let k = 0; k < n; k++) pts.push([num(), num()]);
    segs.push(pts); cur = pts[pts.length - 1];
  }
  const dir = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return l > 1e-6 ? [(b[0] - a[0]) / l, (b[1] - a[1]) / l] : null; };
  const endDir = (s) => { for (let k = s.length - 2; k >= 0; k--) { const v = dir(s[k], s[s.length - 1]); if (v) return v; } };
  const startDir = (s) => { for (let k = 1; k < s.length; k++) { const v = dir(s[0], s[k]); if (v) return v; } };
  return subs.map(ss => Math.max(...ss.map((s, j) => {
    const u = endDir(s), v = startDir(ss[(j + 1) % ss.length]);
    return u && v ? Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180 / Math.PI : 0;
  })));
}
const pathsOf = (text) => [...text.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(m => m[1]);
const fillOf = (text, d) => d && (new RegExp(`<path\\b[^>]*\\bfill="([^"]+)"[^>]*\\bd="${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).exec(text) || [])[1];

// ── icons/icon.svg — the app-icon master ─────────────────────────────────
console.log('\n── icons/icon.svg — the app-icon master ──');
const svg = read('icons/icon.svg');
const N = pathsOf(svg);
ok('the letter is filled shapes: no <circle>, no stroke', !/<circle\b/.test(svg) && !/\bstroke(-width)?=/.test(svg));
ok('exactly three shapes: the ribbon and right stem, the stem, the head', N.length === 3, N.length);
ok('…the ribbon in Forest, the stem and the head in Sage',
  /fill="url\(#nf-forest\)"[^>]*d="/.test(svg) && (svg.match(/fill="url\(#nf-sage\)"/g) || []).length === 2);
// The ring round the head is geometry, not a stroke: the head's circle is
// 11.5 and the bite out of the ribbon 15.5, so the ground shows through a
// 4-unit ring at every size and on every background.
ok('the head (r 11.5) sits in a bite (r 15.5) out of the ribbon: a 4-unit ring',
  /A15\.5 15\.5 /.test(N[0] || '') && /A11\.5 11\.5 /.test(N[2] || ''), [(N[0] || '').slice(0, 90), (N[2] || '').slice(0, 60)]);
ok('the ground is Porcelain Mist, the app\'s own page background',
  new RegExp(`<rect\\b[^>]*fill="#${GROUND_RGB.map(c => c.toString(16).padStart(2, '0')).join('')}"`, 'i').test(svg));
ok('the ribbon is Forest, shading onto Forest itself', /stop-color="#335A4A"/i.test(svg) && /stop-color="#284C40"/i.test(svg));
ok('the stem and head are Sage, falling to a darker Sage', /stop-color="#99B29C"/i.test(svg) && /stop-color="#799781"/i.test(svg));
ok('no teal left from the app\'s old sheet', !/#12656A|#103F43|#78BFC0|#5BA2A3|#D5ECEA/i.test(svg));
const rects = [...svg.matchAll(/<rect\b([^>]*)>/g)].map(m => m[1]);
ok('exactly one rect: the ground, no ring and no inner tile', rects.length === 1, rects.length);
ok('…and it is the one the renderer names', /id="nf-ground"/.test(rects[0]) && /rx="56"/.test(rects[0]), rects[0]);
ok('no Ivory or Pale Jade frame', !/#F7F6EE|#E4EDE0|#D3E3D3/i.test(svg), (/#(F7F6EE|E4EDE0|D3E3D3)/i.exec(svg) || [''])[0]);
// The letter box is 90 x 100; scale 1.59 makes it 62% of the square, the size
// Praew picked (tools/render-icons.cjs must agree, or the PNGs below fail).
ok('the letter is drawn at scale 1.59 (62% of the square)', /<g transform="translate\([\d.]+ [\d.]+\) scale\(1\.59\)">/.test(svg),
  (/<g transform="[^"]*">/.exec(svg) || [''])[0]);
const render = read('tools/render-icons.cjs');
ok('…and the renderer knows the 90 x 100 letter and both scales',
  /LETTER = \{ w: 90, h: 100 \}/.test(render) && /FULL = 1\.59, MASKABLE = 1\.0/.test(render));

// ── icons/logo.svg — the lockup master ───────────────────────────────────
console.log('\n── icons/logo.svg — the lockup master ──');
const logo = read('icons/logo.svg');
const LP = pathsOf(logo);
ok('it is announced as one name', /role="img"/.test(logo) && /aria-label="NeoFeed"/.test(logo));
ok('seven shapes: the N\'s three, "eo", "Feed", the rule\'s two halves — no byline',
  LP.length === 7 && !/VALHALLA|Valhalla/.test(logo.replace(/<!--[\s\S]*?-->/g, '')), LP.length);
for (const [i, d] of N.entries())
  ok(`it draws icon.svg's shape ${i + 1} with the same path`, LP[i] === d, (LP[i] || '').slice(0, 60));
const [eoD = '', feedD = '', ruleLD = '', ruleRD = ''] = LP.slice(3);
ok('no font is needed: no <text>, every letter an outline', !/<text\b/.test(logo));
ok('"eo" and "Feed" are filled even-odd, so their counters (and the bottle and drop) are holes',
  (logo.match(/fill-rule="evenodd"/g) || []).length === 2);
// F (1 contour), e + bottle (2), e + drop (2), d (2): the e's eyes are gone
// and the bottle and the drop stand in their place.
ok('"Feed" has seven contours: F, e + bottle, e + drop, d', (feedD.match(/M/g) || []).length === 7, (feedD.match(/M/g) || []).length);
ok('"eo" has four: each letter and its counter', (eoD.match(/M/g) || []).length === 4, (eoD.match(/M/g) || []).length);
for (const [k, d] of [['eo', eoD], ['feed', feedD], ['ruleL', ruleLD], ['ruleR', ruleRD]])
  ok(`${k} is ${INK[k]}, a literal`, (fillOf(logo, d) || '').toUpperCase() === INK[k], fillOf(logo, d));
// Corners rounded like the N's ("ให้ขอบของ F, d มนๆ เหมือน N"): no joint of a
// letter turns sharply. The bottle and the drop are exempt — a drop has a tip
// and a bottle a shoulder — so Feed's subpaths 2 (bottle) and 4 (drop) are
// skipped: F 0, e 1, e 3, d 5 and 6.
const eoTurns = maxTurns(eoD), feedTurns = maxTurns(feedD);
ok('every corner of "eo" is rounded (no joint turns more than 12°)',
  eoTurns.length === 4 && eoTurns.every(t => t <= 12), eoTurns.map(t => Math.round(t)));
ok('every corner of F, both e\'s and d is rounded (no joint turns more than 12°)',
  feedTurns.length === 7 && [0, 1, 3, 5, 6].every(k => feedTurns[k] <= 12), feedTurns.map(t => Math.round(t)));
const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(logo) || [null, '', ''];
ok('the drawing is 456 units wide for an N of 100', vb && vb[1] === '456', vb && vb.slice(1));

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

// Opaque pixels sorted into the ground and the letter's two tones. The ground
// is matched by PROXIMITY to its actual value (a near-white has no hue to test).
function census({ w, h, px }) {
  const k = { forest: [], sage: [], ground: 0, opaque: 0, markR: 0, top: h, bottom: -1 };
  const nearGround = (r, g, b) => Math.abs(r - GROUND_RGB[0]) <= 6
    && Math.abs(g - GROUND_RGB[1]) <= 6 && Math.abs(b - GROUND_RGB[2]) <= 6;
  const freq = new Map();
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, [r, g, b, a] = [px[o], px[o + 1], px[o + 2], px[o + 3]];
    if (a < 250) continue;
    k.opaque++;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (nearGround(r, g, b)) k.ground++;
    else if (L < 110 && g > r) k.forest.push(x);
    else if (L < 195 && g > r) k.sage.push(x);
    // How far the LETTER reaches from the centre, for the maskable safe zone.
    if (L < 195 && g > r) {
      k.markR = Math.max(k.markR, Math.hypot(x - cx, y - cy));
      k.top = Math.min(k.top, y); k.bottom = Math.max(k.bottom, y);
    }
    const key = (r >> 2) << 16 | (g >> 2) << 8 | (b >> 2);
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  k.mode = [(top >> 16) << 2, ((top >> 8) & 255) << 2, (top & 255) << 2];
  k.groundPct = k.ground / k.opaque;
  return k;
}
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
const near = (c, want, tol) => c.every((v, i) => Math.abs(v - want[i]) <= tol);

// [file, size, kind]:
//   any              — the master's own rounded corners, transparent outside
//   apple / maskable — ground squared off; the platform draws the shape.
// The maskable pair carries one extra assertion the others do not: Android's safe zone.
const PNGS = [
  ['icons/favicon-16.png', 16, 'any'],
  ['icons/favicon-32.png', 32, 'any'],
  ['icons/icon-192.png', 192, 'any'],
  ['icons/icon-512.png', 512, 'any'],
  ['icons/icon-192-maskable.png', 192, 'maskable'],
  ['icons/icon-512-maskable.png', 512, 'maskable'],
  ['icons/apple-touch-icon.png', 180, 'apple'],
];
for (const [file, size, kind] of PNGS) {
  const bleed = kind !== 'any';
  console.log(`\n── ${file} ──`);
  let img;
  try { img = decodePng(file); } catch (e) { ok('decodes', false, e.message); continue; }
  ok(`${size}×${size}`, img.w === size && img.h === size, [img.w, img.h]);
  const k = census(img);
  const corner = img.px[3];
  ok(bleed ? 'full-bleed: the corner is opaque' : 'its own rounded corners: the corner is transparent', bleed ? corner === 255 : corner === 0, corner);
  ok('the ground is Porcelain Mist', near(k.mode, GROUND_RGB, 6), k.mode);
  ok('…and it IS the ground, not the mark (≥ 40% of the icon)', k.groundPct >= 0.4, +k.groundPct.toFixed(3));
  ok('the dark ribbon is present, and not the whole tile (5–40%)', k.forest.length / k.opaque >= 0.05 && k.forest.length / k.opaque <= 0.4, +(k.forest.length / k.opaque).toFixed(3));
  // The letter's height as a share of the square. TWO SIZES, on purpose
  // (tools/render-icons.cjs): 62% wherever the whole square is shown, and 39%
  // in the maskable pair, because Android shows only the middle of a maskable
  // icon (the middle two thirds on Praew's Samsung).
  const letterH = (k.bottom - k.top + 1) / size;
  if (kind === 'maskable') {
    // Android's safe zone is the central 80% DIAMETER, i.e. radius 40% of the
    // width. Anything of the letter outside it can be cropped by a mask.
    ok('the letter is inside the maskable safe zone (r ≤ 40%)',
      k.markR <= size * 0.40, { markR: Math.round(k.markR), limit: Math.round(size * 0.4) });
    // …and inside the circle Android keeps under ANY launcher mask even when
    // a launcher uses the whole image as the adaptive layer: 66 dp of 108.
    ok("…and inside Android's 66/108 dp circle, however the launcher crops (r ≤ 30.6%)",
      k.markR <= size * 33 / 108, { markR: +(k.markR / size).toFixed(3), limit: +(33 / 108).toFixed(3) });
    ok('the letter is the maskable size: 36–42% of the square, not the whole-square 62%',
      letterH >= 0.36 && letterH <= 0.42, +letterH.toFixed(3));
  } else if (size >= 180) {
    ok('the letter is the whole-square size: 60–64% of the square',
      letterH >= 0.60 && letterH <= 0.64, +letterH.toFixed(3));
  }
  if (size >= 180) {
    // At 16/32 px the antialiased Forest edge outweighs the stem itself, so
    // position is only read where the stem is many pixels wide.
    const stem = k.sage.length / (k.sage.length + k.forest.length);
    ok("the light stem and head are present (≥ 20% of the letter's ink)", stem >= 0.2, +stem.toFixed(3));
    ok('…and they are on the LEFT: the light shapes sit left of the dark ribbon', mean(k.sage) < mean(k.forest) - size * 0.1, [Math.round(mean(k.sage)), Math.round(mean(k.forest))]);
  }
}

// ── app.jsx — <NeoFeedWordmark/>, and its three call sites ────────────────
console.log('\n── app.jsx — <NeoFeedWordmark/> ──');
const app = read('app.jsx');
const word = /const NeoFeedWordmark = \([\s\S]*?\n\);/.exec(app)?.[0] || '';
ok('<NeoFeedWordmark/> is defined', word.length > 0);
ok('it is announced as one name, "NeoFeed", at every call site',
  /role="img"/.test(word) && /aria-label="NeoFeed"/.test(word), word.slice(0, 300));
for (const [i, d] of LP.entries())
  ok(`it draws logo.svg's shape ${i + 1} with the same path`, word.includes(`d="${d}"`), d.slice(0, 60));
const stops = (text, attr) => [...text.matchAll(new RegExp(`${attr}="(#[0-9a-f]{6})"`, 'gi'))].map(m => m[1].toUpperCase());
ok('…and shades the N with the master\'s four stops, in the master\'s order',
  JSON.stringify(stops(word, 'stopColor')) === JSON.stringify(stops(svg, 'stop-color')) && stops(svg, 'stop-color').length === 4,
  { wordmark: stops(word, 'stopColor'), master: stops(svg, 'stop-color') });
for (const [k, d] of [['eo', eoD], ['feed', feedD], ['ruleL', ruleLD], ['ruleR', ruleRD]])
  ok(`…and paints ${k} in logo.svg's literal ${INK[k]}`, (fillOf(word, d) || '').toUpperCase() === INK[k], fillOf(word, d));
ok('no letters left as text — every letter is a path', !/<text\b/.test(word) && !/>\s*(Neo|eo|Feed)\s*</.test(word));
const lockupOnly = /\{lockup && <>([\s\S]*?)<\/>\}/.exec(word)?.[1] || '';
ok('the rule is drawn only for the lockup, and nothing else is',
  [ruleLD, ruleRD].every(d => lockupOnly.includes(`d="${d}"`)) && pathsOf(lockupOnly).length === 2,
  pathsOf(lockupOnly).length);
const wordVB = /viewBox=\{lockup \? "0 0 ([\d.]+) ([\d.]+)" : "0 0 ([\d.]+) ([\d.]+)"\}/.exec(word);
ok('its lockup viewBox is logo.svg\'s', wordVB && `${wordVB[1]} ${wordVB[2]}` === `${vb[1]} ${vb[2]}`, wordVB && wordVB.slice(1));
ok('…and the word alone is the same width, cut above the rule', wordVB && wordVB[3] === vb[1] && +wordVB[4] > 100 && +wordVB[4] < 102,
  wordVB && wordVB.slice(3));
ok('it carries no tile — the wordmark is not the app icon', !/<rect\b/.test(word));

// The three call sites, and only one component behind them.
ok('the login screen renders the full lockup as the hero',
  /<NeoFeedWordmark className="login-app-name" lockup \/>/.test(app),
  /.{0,80}NeoFeedWordmark className.{0,40}/.exec(app)?.[0]);
ok('the topbar corner renders the word, with NO icon tile beside it',
  /<div className="brandmark"><NeoFeedWordmark \/><\/div>/.test(app),
  /.{0,120}className="brandmark".{0,120}/.exec(app)?.[0]);
ok('the sync gate renders the word, sized by font-size alone', /<NeoFeedWordmark style=\{\{ fontSize:30 \}\} \/>/.test(app));
ok('there is exactly one wordmark component in the file, not three copies',
  (app.match(/className="nf-mark"/g) || []).length === 1, (app.match(/className="nf-mark"/g) || []).length);
ok('the icon TILE is drawn by no component at all — it is icons/ artwork',
  !/viewBox="0 0 256 256"/.test(app) && !/NeoFeedMark/.test(app), (/.{0,60}NeoFeedMark.{0,40}/.exec(app) || [''])[0]);
ok('NO N+dot is left anywhere in app.jsx', !/M7 21 V 7/.test(app), (/.{0,80}M7 21 V 7.{0,40}/.exec(app) || [''])[0]);

for (const shell of ['NeoFeed.html', 'index.html']) {
  console.log(`\n── ${shell} ──`);
  const css = read(shell);
  ok('the .login-logo-mark rule went with the tile', !/\.login-logo-mark\b/.test(css));
  // The login screen keeps the board's hairline and ink tiers while :root is
  // the app's, scoped by re-declaring the tokens it consumes on .login-wrap.
  const wrap = /\n  \.login-wrap \{([\s\S]*?)\n  \}/.exec(css)?.[1] || '';
  for (const [tok, val] of [['--brand', 'oklch(38.5% 0.047 170)'], ['--line', 'oklch(87.6% 0.031 148)']])
    ok(`.login-wrap pins ${tok} to the brand board`, wrap.includes(`${tok}:`) && wrap.includes(val),
      wrap.replace(/\s+/g, ' ').slice(0, 200));
  // Sage and Champagne Gold had ONE consumer on this screen: the CSS rule under
  // the old wordmark. The rule is part of the logo drawing now, in literals, so
  // re-declaring them here would pin tokens that nothing reads.
  ok('.login-wrap no longer declares --brand-4 or --sand (their one consumer is gone)',
    !/--brand-4\s*:/.test(wrap) && !/--sand\s*:/.test(wrap), (/--(brand-4|sand)\s*:[^;]*/.exec(wrap) || [''])[0]);
  ok('.login-wrap does NOT override --bg — it shares the app\'s ground',
    !/--bg\s*:/.test(wrap), (/--bg\s*:[^;]*/.exec(wrap) || [''])[0]);
  const rootBlock = /^  :root \{[\s\S]*?^  \}/m.exec(css)?.[0] || '';
  ok('…and the ground both screens share is Porcelain Mist',
    /--bg:\s*oklch\(97\.7% 0\.004 195\)/.test(rootBlock), /--bg:[^;]*/.exec(rootBlock)?.[0]);
  ok('the app\'s accent is the mark\'s Forest, not Valhalla Teal',
    /--brand:\s*oklch\(38\.5% 0\.047 170\)/.test(rootBlock)
    && !/--brand:\s*oklch\(46\.3% 0\.074 201\)/.test(rootBlock),
    /--brand:[^;]*/.exec(rootBlock)?.[0]);
  ok('…and the ground/ink it sits on did NOT follow it into the green family',
    /--ink:\s*oklch\(24% 0\.022 205\)/.test(rootBlock)
    && /--line:\s*oklch\(90\.5% 0\.008 198\)/.test(rootBlock),
    [/--ink:[^;]*/.exec(rootBlock)?.[0], /--line:[^;]*/.exec(rootBlock)?.[0]]);
  ok('no ribbon wash is left on the login screen',
    !/\.login-wrap::before/.test(css) && !/login-drift/.test(css),
    (/.{0,60}login-wrap::before.{0,40}/.exec(css) || [''])[0]);
  ok('the topbar draws no icon tile', !/\.brandmark \.logo\b/.test(css),
    (/.{0,80}\.brandmark \.logo.{0,60}/.exec(css) || [''])[0]);
  // One sizing rule, in em: 1em is the N's height, and the drawing is 4.56 of
  // them wide (logo.svg's 456 units for an N of 100). No colour: the mark
  // paints its own literals.
  const wm = /\n  \.nf-wordmark \{([^}]*)\}/.exec(css)?.[1] || '';
  const mk = /\.nf-wordmark \.nf-mark \{([^}]*)\}/.exec(css)?.[1] || '';
  ok('.nf-mark is sized once, in em: 4.56em wide, its height from its own viewBox',
    new RegExp(`width:\\s*${(+vb[1] / 100).toFixed(2)}em`).test(mk) && /height:\s*auto/.test(mk) && /max-width:\s*100%/.test(mk),
    mk.replace(/\s+/g, ' '));
  ok('.nf-wordmark sets no colour — the logo is not a UI colour', !/color:/.test(wm), wm.replace(/\s+/g, ' '));
  ok('the old text-wordmark rules are gone (.nf-n, .lw, the ::after rule)',
    !/\.nf-wordmark \.nf-n\b/.test(css) && !/\.nf-wordmark \.lw\b/.test(css) && !/\.login-app-name::after/.test(css));
  ok('the topbar sets the N at 26px (Praew, 2026-09-23), and the login hero sizes it too',
    /\.brandmark \.nf-wordmark \{ font-size: 26px; \}/.test(css) && /\.login-app-name \{[^}]*font-size/.test(css));
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
