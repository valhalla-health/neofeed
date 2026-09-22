// render-icons.cjs — rasterise icons/icon.svg into the seven PNGs in icons/.
//
//   NODE_PATH=<folder with playwright> node tools/render-icons.cjs [filter]
//
// `filter` is a substring of the file names to write (e.g. `maskable`);
// without it every PNG is rewritten. ICON_OUT=<dir> writes somewhere other
// than icons/, to compare a render before replacing anything. Chromium draws
// the SVG at 4x and each 4x4 block is averaged in premultiplied alpha, so
// edges are antialiased the same way at every size. CommonJS and NODE_PATH
// for the same reason as the test harnesses: playwright is a dev tool
// installed on demand, never a dependency of the app (see test/README.md).
//
// The five whole-square PNGs were last written on 2026-09-22 by an earlier,
// uncommitted renderer. This one reproduces them to within antialiasing (at
// most 27/255 on an opaque edge pixel, measured), so they were left as they
// are when it was added and only the maskable pair was written with it.
//
// ONE GEOMETRY, TWO LETTER SIZES. The master draws the letter at scale 1.4
// (54.7% of the square's height), which is right wherever the whole square
// is shown: a browser tab, the "any" icon, the Apple icon (iOS rounds the
// corners and shows the rest). A MASKABLE icon is not shown whole. Android
// treats it as an adaptive icon and shows only the middle — Chrome's own
// conversion keeps about 87% of it, and on Praew's Samsung the middle two
// thirds (measured 2026-09-22 from her home screen: the letter filled 82% of
// the icon, "fit ไป"). So the maskable pair draws the same letter at 1.0 —
// 39% of the square, furthest ink 27% from the centre — which lands at ~58%
// of that launcher's icon and inside the 66/108 circle Android guarantees no
// mask will cut. test/verify-neofeed-mark.cjs measures both sizes in the PNGs.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const MASTER = fs.readFileSync(path.join(ROOT, 'icons', 'icon.svg'), 'utf8');
const LETTER = { w: 98, h: 100 };          // the two paths' box, in master units
const FULL = 1.4, MASKABLE = 1.0;          // letter scale: whole-square vs maskable

// [file, px, bleed, letter scale] — bleed squares the ground off; the
// platform draws the shape. `any` keeps the master's own rounded corners.
const OUTPUTS = [
  ['favicon-16.png',          16, false, FULL],
  ['favicon-32.png',          32, false, FULL],
  ['icon-192.png',           192, false, FULL],
  ['icon-512.png',           512, false, FULL],
  ['apple-touch-icon.png',   180, true,  FULL],
  ['icon-192-maskable.png',  192, true,  MASKABLE],
  ['icon-512-maskable.png',  512, true,  MASKABLE],
];

function variant(bleed, scale) {
  const tx = +((256 - LETTER.w * scale) / 2).toFixed(3);
  const ty = +((256 - LETTER.h * scale) / 2).toFixed(3);
  let svg = MASTER.replace(/<g transform="[^"]*">/, `<g transform="translate(${tx} ${ty}) scale(${scale})">`);
  if (bleed) svg = svg.replace(/(<rect id="nf-ground"[^>]*?)\srx="\d+"/, '$1');
  if (!svg.includes(`scale(${scale})`)) throw new Error('icon.svg: letter group not found');
  return svg;
}

(async () => {
  const filter = process.argv[2] || '';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [file, px, bleed, scale] of OUTPUTS) {
    if (!file.includes(filter)) continue;
    const b64 = await page.evaluate(async ({ svg, px }) => {
      const SS = 4, big = px * SS;
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      await img.decode();
      const a = document.createElement('canvas'); a.width = a.height = big;
      const ga = a.getContext('2d', { willReadFrequently: true });
      ga.drawImage(img, 0, 0, big, big);
      const src = ga.getImageData(0, 0, big, big).data;
      const out = new ImageData(px, px);
      for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
        let r = 0, g = 0, b = 0, al = 0;
        for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
          const o = ((y * SS + j) * big + (x * SS + i)) * 4, w = src[o + 3];
          r += src[o] * w; g += src[o + 1] * w; b += src[o + 2] * w; al += w;
        }
        const o = (y * px + x) * 4;
        out.data[o]     = al ? Math.round(r / al) : 0;
        out.data[o + 1] = al ? Math.round(g / al) : 0;
        out.data[o + 2] = al ? Math.round(b / al) : 0;
        out.data[o + 3] = Math.round(al / (SS * SS));
      }
      const c = document.createElement('canvas'); c.width = c.height = px;
      c.getContext('2d').putImageData(out, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    }, { svg: variant(bleed, scale), px });
    fs.writeFileSync(path.join(process.env.ICON_OUT || path.join(ROOT, 'icons'), file), Buffer.from(b64, 'base64'));
    console.log(`  ${file.padEnd(24)} ${px}px  ${bleed ? 'full-bleed' : 'rounded'}  letter ×${scale}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
