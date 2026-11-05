// A synthetic sticker order for the TPN room's harnesses and dev local: the figures
// come from the real stickerFigures in data.js, so a schema change reaches them. The
// calc values are written out for a made-up 0.9 kg infant, 110 mL delivered. No figure
// here comes from a real order.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function loadData(root) {
  const box = { console, Math, Date, JSON };
  box.window = box;
  box.globalThis = box;
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), box, { filename: 'data.js' });
  return box.NEOFEED_DATA;
}

const CALC = {
  totalTPN_mL: 110, wtKg: 0.9, aaStockKey: 'aminoven10', factor: 1.12, deadVol_mL: 13.05, preparedVol: 123.2,
  d50wVol: 30.8, soluvitVol: 1, peditrace_vol: 1, wfiVol: 49.7, dexG: 13.75, osmIn: { aaPct: 2.45 }, aaG: 2.7,
  naKg: 2.5, kKg: 1, pTotal_mg: 40.5, znTotal_mg: 0.3, osm: 856, dexKcal: 46.75, aaKcal: 10.8,
  solVol: { aa: 30.2, naCl: 1.3, glycophos: 0.6, k2hpo4: 0, naAcet: 0.3, kCl: 0.5, mg: 0.4, ca: 5.5, heparin: 0.6, znso4: 0 },
};
const ORDER = { dol: 5, dexPct: 12.5, caPerKg: 60, mgPerKg: 0.3, naAcet: 0.5, naCl: 2, kCl: 1, heparinUmL: 0.5, inclAddamel: false };

function printJson(data, orderDate, extra) {
  return data.stickerFigures({ ...ORDER, orderDate, calc: CALC, ...(extra || {}) });
}

module.exports = { loadData, printJson, CALC, ORDER };
