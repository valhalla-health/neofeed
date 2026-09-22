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

// The icon's tile: the jade the brand board draws it on.
//
// THE MARK DOES NOT FOLLOW THE APP'S PALETTE. It was re-tinted into the
// Valhalla Teal sheet when the app moved back to teal, and Praew put it
// straight back — "ขอกลับไปใช้ NeoFeed และหน้า login เดิม สีนี้". So the logo
// and the login screen are the board's green while the workspace is teal, on
// purpose, and every colour in the mark is a LITERAL so the next palette move
// cannot carry it off again.
const TILE_RGB = [0xD3, 0xE3, 0xD3];

// ── the master ────────────────────────────────────────────────────────────
console.log('\n── icons/icon.svg — the master ──');
const svg = read('icons/icon.svg');
const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(m => m[1]);
ok('no counter-dot', !/<circle\b/.test(svg));
ok('no stroked N — the letter is filled shapes now', !/\bstroke(-width)?=/.test(svg));
ok('exactly two shapes: the dark body and the light left stem', paths.length === 2, paths.length);
ok('the tile is the approved jade', new RegExp(`<rect\\b[^>]*fill="#${TILE_RGB.map(c => c.toString(16).padStart(2, '0')).join('')}"`, 'i').test(svg));
ok('the body is Forest, shading onto Forest itself', /stop-color="#335A4A"/i.test(svg) && /stop-color="#284C40"/i.test(svg));
ok('the left stem is Sage, falling to a darker Sage', /stop-color="#99B29C"/i.test(svg) && /stop-color="#799781"/i.test(svg));
ok('no teal left from the app\'s sheet', !/#12656A|#103F43|#78BFC0|#5BA2A3|#D5ECEA/i.test(svg));

// The frame Praew approved on 2026-09-22 ("icon ใช้อันนี้"): three concentric
// rects, Pale Jade ground → Ivory ring → jade tile, in that order. The ground
// carries the id because the renderer targets it by name — it is the only rect
// that loses its corners on a full-bleed variant.
const rects = [...svg.matchAll(/<rect\b([^>]*)>/g)].map(m => m[1]);
ok('three concentric rects: ground, ring, tile', rects.length === 3, rects.length);
ok('…the ground is Pale Jade, full square, and is the one the renderer names',
  /id="nf-ground"/.test(rects[0]) && /width="256"/.test(rects[0])
  && /fill="#E4EDE0"/i.test(rects[0]) && /rx="56"/.test(rects[0]), rects[0]);
ok('…the ring is Ivory, inset 7%, and keeps its own corners',
  /x="18"[^>]*y="18"/.test(rects[1]) && /fill="#F7F6EE"/i.test(rects[1])
  && /rx="/.test(rects[1]) && !/id=/.test(rects[1]), rects[1]);
ok('…the tile sits inside the ring', /x="34"[^>]*y="34"/.test(rects[2])
  && /fill="#D3E3D3"/i.test(rects[2]), rects[2]);
ok('only the ground is named, so a bleed render cannot square off the frame',
  (svg.match(/id="nf-ground"/g) || []).length === 1);

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
  const k = { forest: [], sage: [], jade: 0, white: 0, ivory: 0, opaque: 0, markR: 0 };
  const freq = new Map();
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, [r, g, b, a] = [px[o], px[o + 1], px[o + 2], px[o + 3]];
    if (a < 250) continue;
    k.opaque++;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (r > 240 && g > 240 && b > 240) k.white++;
    else if (L < 110 && g > r) k.forest.push(x);
    else if (L < 195 && g > r) k.sage.push(x);
    else if (g - r >= 8) k.jade++;
    // Ivory #F7F6EE — the ring. It is deliberately in no other bucket: it is
    // not white (b is 238), and g-r is negative so it is not jade either.
    if (Math.abs(r - 0xF7) <= 7 && Math.abs(g - 0xF6) <= 7 && Math.abs(b - 0xEE) <= 7) k.ivory++;
    // How far the LETTER reaches from the centre, for the maskable safe zone.
    if (L < 195 && g > r) k.markR = Math.max(k.markR, Math.hypot(x - cx, y - cy));
    const key = (r >> 2) << 16 | (g >> 2) << 8 | (b >> 2);
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  k.mode = [(top >> 16) << 2, ((top >> 8) & 255) << 2, (top & 255) << 2];
  return k;
}
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
const near = (c, want, tol) => c.every((v, i) => Math.abs(v - want[i]) <= tol);

// [file, size, kind] — three variants from the one master:
//   any      — the full design on its own rounded corners, transparent outside
//   apple    — the full design, ground squared off; iOS crops the whole square
//   maskable — NO FRAME. Android crops to a circle well inside the square,
//              which turns a decorative ring into a crescent at the edge, so
//              these carry the tile colour and the letter alone.
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
  ok('no white — the old N was a white stroke', k.white === 0, k.white);
  ok('the tile is the approved jade', near(k.mode, TILE_RGB, 6), k.mode);
  ok('the tile is the ground, not the mark (tile ≥ 40% of the icon)', k.jade / k.opaque >= 0.4, +(k.jade / k.opaque).toFixed(3));
  ok('the dark body is present, and not the whole tile (5–40%)', k.forest.length / k.opaque >= 0.05 && k.forest.length / k.opaque <= 0.4, +(k.forest.length / k.opaque).toFixed(3));
  // The frame, and the one variant that must not have it.
  if (size >= 32) {
    const ivoryPct = k.ivory / k.opaque;
    if (kind === 'maskable')
      ok('no Ivory ring — a circular mask would crop it to a crescent', ivoryPct < 0.01, +ivoryPct.toFixed(4));
    else
      ok('the Ivory ring is present', ivoryPct >= 0.04, +ivoryPct.toFixed(4));
  }
  if (kind === 'maskable') {
    // Android's safe zone is the central 80% DIAMETER, i.e. radius 40% of the
    // width. Anything of the letter outside it can be cropped by a mask.
    ok('the letter is inside the maskable safe zone (r ≤ 40%)',
      k.markR <= size * 0.40, { markR: Math.round(k.markR), limit: Math.round(size * 0.4) });
  }
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
  // The login screen keeps Luminous Protection while :root is the teal sheet,
  // scoped by re-declaring the tokens it consumes on .login-wrap itself.
  // Custom properties inherit, so no .login-* rule names a literal.
  const wrap = /\n  \.login-wrap \{([\s\S]*?)\n  \}/.exec(css)?.[1] || '';
  for (const [tok, val] of [['--bg', 'oklch(97.2% 0.011 101)'], ['--brand', 'oklch(38.5% 0.047 170)'],
                            ['--brand-4', 'oklch(82.4% 0.039 139)'], ['--line', 'oklch(87.6% 0.031 148)']])
    ok(`.login-wrap pins ${tok} to the brand board`, wrap.includes(`${tok}:`) && wrap.includes(val),
      wrap.replace(/\s+/g, ' ').slice(0, 200));
  // The app's ACCENT moved onto the mark's Forest on 2026-09-22 ("ใช้สีนี้ แทน
  // valhalla teal แทนเท่านั้น"), so --brand and --brand-4 in the scope above
  // now happen to match :root. They stay anyway — they are what holds this
  // screen on the board if the app's accent ever moves again, which is the
  // scope's whole job. What must still differ is the GROUND and the warm
  // note: the app is Porcelain Mist + Nordic Sand, the login is Ivory +
  // Champagne Gold. If those ever collapse into one value, the scope has
  // stopped doing anything and this screen has silently joined the app's
  // palette.
  const rootBlock = /^  :root \{[\s\S]*?^  \}/m.exec(css)?.[0] || '';
  ok('…while :root keeps the app\'s own ground (Porcelain Mist, not Ivory)',
    /--bg:\s*oklch\(97\.7% 0\.004 195\)/.test(rootBlock)
    && wrap.includes('oklch(97.2% 0.011 101)'),
    [/--bg:[^;]*/.exec(rootBlock)?.[0], /--bg:[^;]*/.exec(wrap)?.[0]]);
  ok('…and its own warm note (Nordic Sand, not Champagne Gold)',
    /--sand:\s*oklch\(79\.8% 0\.067 80\)/.test(rootBlock)
    && wrap.includes('oklch(73.6% 0.082  80)'),
    [/--sand:[^;]*/.exec(rootBlock)?.[0], /--sand:[^;]*/.exec(wrap)?.[0]]);
  // The accent IS the mark now — that is the point of the 2026-09-22 swap.
  ok('the app\'s accent is the mark\'s Forest, not Valhalla Teal',
    /--brand:\s*oklch\(38\.5% 0\.047 170\)/.test(rootBlock)
    && !/--brand:\s*oklch\(46\.3% 0\.074 201\)/.test(rootBlock),
    /--brand:[^;]*/.exec(rootBlock)?.[0]);
  ok('…and the ground/ink it sits on did NOT follow it into the green family',
    /--ink:\s*oklch\(24% 0\.022 205\)/.test(rootBlock)
    && /--line:\s*oklch\(90\.5% 0\.008 198\)/.test(rootBlock),
    [/--ink:[^;]*/.exec(rootBlock)?.[0], /--line:[^;]*/.exec(rootBlock)?.[0]]);
  ok('the ribbons are the board\'s too: Sage over Pale Jade, one Champagne Gold',
    /oklch\(82\.4% 0\.039 139 \/ \.32\)/.test(css) && /oklch\(73\.6% 0\.082 80 \/ \.16\)/.test(css));
  // No tile anywhere in the app's chrome: the topbar's .logo box is gone, not
  // just emptied, so nothing can paint a square behind the wordmark again.
  ok('the topbar draws no icon tile', !/\.brandmark \.logo\b/.test(css),
    (/.{0,80}\.brandmark \.logo.{0,60}/.exec(css) || [''])[0]);
  // One sizing rule, in em, so a call site sets font-size and nothing else.
  const wm = /\n  \.nf-wordmark \{([^}]*)\}/.exec(css)?.[1] || '';
  const nfn = /\.nf-wordmark \.nf-n \{([^}]*)\}/.exec(css)?.[1] || '';
  // A LITERAL, not var(--brand): the mark must not follow the app's palette.
  // It is Forest, which is also the stop the N's body gradient ends on, so
  // "Neo", "Feed" and the dark half of the letter are one colour by
  // construction rather than by three values agreeing.
  ok('.nf-wordmark is styled once, in the mark\'s own Forest, not a token',
    /color:\s*#284C40/i.test(wm) && !/color:\s*var\(/.test(wm), wm.replace(/\s+/g, ' ').slice(0, 200));
  ok('…and that is the stop the master\'s body gradient ends on',
    /stop-color="#284C40"/i.test(svg));
  ok('…and the N is sized in em, to the cap height, on the baseline',
    /width:\s*0\.684em/.test(nfn) && /height:\s*0\.698em/.test(nfn) && /vertical-align:\s*baseline/.test(nfn),
    nfn.replace(/\s+/g, ' ').slice(0, 160));
  // Praew, 2026-09-22: "ให้คำว่า feed สีเข้มเท่า N ตรงที่เข้มๆ". On the board's
  // green that needs no second value — "Feed" inherits Forest from the rule
  // above, so it IS the dark half of the N. It carried its own darker colour
  // only while the mark was teal, whose accent is the letter's TOP stop.
  const lw = /\.nf-wordmark \.lw \{([^}]*)\}/.exec(css)?.[1] || '';
  ok('"Feed" is the light weight and nothing else — it inherits the N\'s dark',
    /font-weight:\s*300/.test(lw) && !/color:/.test(lw), lw.replace(/\s+/g, ' '));
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
