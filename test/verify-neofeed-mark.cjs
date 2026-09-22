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

// The icon's ground: Porcelain Mist, the app's OWN page background, byte for
// byte the value :root gives --bg. Praew, 2026-09-22, choosing from three
// grounds rendered on a light home screen, a dark one and a browser tab
// ("icon เอาแค่ตัว N ... หรือเอาสีพื้นหลังเท่า dashboard"). Not white: white
// looked identical at icon size and would only have resembled the app.
//
// THE MARK DOES NOT FOLLOW THE APP'S PALETTE. It was re-tinted into the
// Valhalla Teal sheet when the app moved back to teal, and Praew put it
// straight back — "ขอกลับไปใช้ NeoFeed และหน้า login เดิม สีนี้". So the logo
// and the login screen are the board's green while the workspace is teal, on
// purpose, and every colour in the mark is a LITERAL so the next palette move
// cannot carry it off again.
const GROUND_RGB = [0xF5, 0xF8, 0xF7];

// ── the master ────────────────────────────────────────────────────────────
console.log('\n── icons/icon.svg — the master ──');
const svg = read('icons/icon.svg');
const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(m => m[1]);
ok('no counter-dot', !/<circle\b/.test(svg));
ok('no stroked N — the letter is filled shapes now', !/\bstroke(-width)?=/.test(svg));
ok('exactly two shapes: the dark body and the light left stem', paths.length === 2, paths.length);
ok('the ground is Porcelain Mist, the app\'s own page background',
  new RegExp(`<rect\\b[^>]*fill="#${GROUND_RGB.map(c => c.toString(16).padStart(2, '0')).join('')}"`, 'i').test(svg));
ok('the body is Forest, shading onto Forest itself', /stop-color="#335A4A"/i.test(svg) && /stop-color="#284C40"/i.test(svg));
ok('the left stem is Sage, falling to a darker Sage', /stop-color="#99B29C"/i.test(svg) && /stop-color="#799781"/i.test(svg));
ok('no teal left from the app\'s old sheet', !/#12656A|#103F43|#78BFC0|#5BA2A3|#D5ECEA/i.test(svg));

// NO FRAME. An Ivory ring on a Pale Jade ground lasted one look: at 16px it
// turned to mush and squeezed the letter down with it. One rect now — the
// ground — and the renderer squares off its corners for the full-bleed
// variants, which is why it is the only one that carries an id.
const rects = [...svg.matchAll(/<rect\b([^>]*)>/g)].map(m => m[1]);
ok('exactly one rect: the ground, no ring and no inner tile', rects.length === 1, rects.length);
ok('…and it is the one the renderer names', /id="nf-ground"/.test(rects[0]) && /rx="56"/.test(rects[0]), rects[0]);
ok('no Ivory or Pale Jade left — the frame is gone from the master',
  !/#F7F6EE|#E4EDE0|#D3E3D3/i.test(svg), (/#(F7F6EE|E4EDE0|D3E3D3)/i.exec(svg) || [''])[0]);

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

// Opaque pixels sorted into the ground and the letter's two tones.
//
// The ground is matched by PROXIMITY to its actual value, not by a hue test.
// It used to be a jade, caught by `g - r >= 8`; Porcelain Mist is a near-white
// with g-r of 3, so that test would have read the whole icon as "no ground" and
// still passed the ratio check vacuously. Proximity says what is meant.
//
// There is no `white` bucket any more either. It existed to prove the old
// white-stroked N was gone — but the ground is itself near-white now, so the
// check would count the whole tile and fail for the wrong reason. That claim is
// made at the SVG level instead, where it is exact: no <circle>, no stroke, and
// no N+dot path anywhere in app.jsx.
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

// [file, size, kind] — with no frame left there are two shapes, not three:
//   any              — the master's own rounded corners, transparent outside
//   apple / maskable — ground squared off; the platform draws the shape.
// `kind` still names all three because the maskable pair carries one extra
// assertion the others do not: Android's safe zone.
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
  ok('the dark body is present, and not the whole tile (5–40%)', k.forest.length / k.opaque >= 0.05 && k.forest.length / k.opaque <= 0.4, +(k.forest.length / k.opaque).toFixed(3));
  // The letter's height as a share of the square. TWO SIZES, on purpose
  // (tools/render-icons.cjs): 54.7% wherever the whole square is shown, and
  // 39% in the maskable pair, because Android shows only the middle of a
  // maskable icon. At 54.7% the letter filled 82% of the icon on Praew's
  // Samsung ("Install icon ไม่โอเค มัน fit ไป", 2026-09-22).
  const letterH = (k.bottom - k.top + 1) / size;
  if (kind === 'maskable') {
    // Android's safe zone is the central 80% DIAMETER, i.e. radius 40% of the
    // width. Anything of the letter outside it can be cropped by a mask.
    ok('the letter is inside the maskable safe zone (r ≤ 40%)',
      k.markR <= size * 0.40, { markR: Math.round(k.markR), limit: Math.round(size * 0.4) });
    // …and inside the circle Android keeps under ANY launcher mask even when
    // a launcher uses the whole image as the adaptive layer: 66 dp of 108,
    // radius 33/108 = 30.6% of the image. Chrome's own conversion pads the
    // image so that circle is the 40% one above; this holds without it.
    ok("…and inside Android's 66/108 dp circle, however the launcher crops (r ≤ 30.6%)",
      k.markR <= size * 33 / 108, { markR: +(k.markR / size).toFixed(3), limit: +(33 / 108).toFixed(3) });
    ok('the letter is the maskable size: 36–42% of the square, not the whole-square 55%',
      letterH >= 0.36 && letterH <= 0.42, +letterH.toFixed(3));
  } else if (size >= 180) {
    ok('the letter is the whole-square size: 52–57% of the square',
      letterH >= 0.52 && letterH <= 0.57, +letterH.toFixed(3));
  }
  if (size >= 180) {
    // At 16/32 px the antialiased Forest edge outweighs the stem itself, so
    // position is only read where the stem is many pixels wide.
    // Against the letter's own ink, not the whole tile: the share of the tile
    // halves when the letter shrinks, and the maskable letter is smaller on
    // purpose. 0.27–0.30 in every icon from 180 px up.
    const stem = k.sage.length / (k.sage.length + k.forest.length);
    ok("a light stem is present (≥ 20% of the letter's ink)", stem >= 0.2, +stem.toFixed(3));
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
  for (const [tok, val] of [['--brand', 'oklch(38.5% 0.047 170)'],
                            ['--brand-4', 'oklch(82.4% 0.039 139)'], ['--line', 'oklch(87.6% 0.031 148)']])
    ok(`.login-wrap pins ${tok} to the brand board`, wrap.includes(`${tok}:`) && wrap.includes(val),
      wrap.replace(/\s+/g, ' ').slice(0, 200));
  // --bg is deliberately NOT pinned (Praew, 2026-09-22, variant C): the login
  // takes the app's own ground so the two screens are continuous, and follows
  // :root if that ground ever moves. Pinning it again silently re-splits them.
  ok('.login-wrap does NOT override --bg — it shares the app\'s ground',
    !/--bg\s*:/.test(wrap), (/--bg\s*:[^;]*/.exec(wrap) || [''])[0]);
  // The app's ACCENT moved onto the mark's Forest on 2026-09-22 ("ใช้สีนี้ แทน
  // valhalla teal แทนเท่านั้น"), so --brand and --brand-4 in the scope above
  // now happen to match :root. They stay anyway — they are what holds this
  // screen on the board if the app's accent ever moves again, which is the
  // scope's whole job.
  // The GROUND is no longer one of the differences: variant C put the login on
  // the app's Porcelain Mist on purpose. What still differs is the warm note —
  // the app's Nordic Sand against the board's Champagne Gold, which is the one
  // colour under the wordmark. If that collapses too, the scope is doing
  // nothing and this screen has silently joined the app's palette outright.
  const rootBlock = /^  :root \{[\s\S]*?^  \}/m.exec(css)?.[0] || '';
  ok('…and the ground both screens now share is Porcelain Mist',
    /--bg:\s*oklch\(97\.7% 0\.004 195\)/.test(rootBlock), /--bg:[^;]*/.exec(rootBlock)?.[0]);
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
  // The ribbons went with the Ivory ground: on Porcelain Mist the wash read as
  // a second colour rather than as depth. Their absence is asserted, not
  // assumed — a stray gradient here is how the screen stops matching the app.
  ok('no ribbon wash is left on the login screen',
    !/\.login-wrap::before/.test(css) && !/login-drift/.test(css),
    (/.{0,60}login-wrap::before.{0,40}/.exec(css) || [''])[0]);
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
