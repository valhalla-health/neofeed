export const TPN_PREPARATIONS = {
  "MTV_MUNTIVIM": "Munti-vim Drop",
  "PO4_PHOSPHATE": "Phosphate Solution",
  "PO4_NEUTRAL": "Neutral Phos Solution",
  "FE_FERDEK": "Ferdek Drop",
  "FE_FERROKID": "Ferrokid Suspension",
  "CA_CACO3_350": "CaCO₃ 350 mg",
  "CA_CACO3_1000": "CaCO₃ 1000 mg",
  "CA_CALCETATE": "Calcetate 1000 mg",
  "VITD_GENERIC": "Vitamin D3 drops (generic)",
  "BM_20": "Breast Milk (20 kcal/oz, mature)",
  "BM_PF_20": "Preterm Formula (20 kcal/oz)",
  "FBM_PF_22": "Enfalac Premature (22 kcal/oz)",
  "PRENAN_22": "Pre Nan (22 kcal/oz)",
  "FBM_PF_24": "Hi-Q LBW (24 kcal/oz)",
  "BM_HMF_24": "FBM with HMF (24 kcal/oz)",
  "LF_20": "LF — HiQ LF (20 kcal/oz)",
  "LF_24": "LF — HiQ LF (24 kcal/oz)",
  "LF_27": "LF — HiQ LF (27 kcal/oz)",
  "HIQLF_20": "HiQ LF — 20 kcal/oz (67 kcal/100mL)",
  "HIQLF_24": "HiQ LF — 24 kcal/oz (80 kcal/100mL)",
  "HIQLF_27": "HiQ LF — 27 kcal/oz (90 kcal/100mL)",
  "ENFALAC_20": "Enfalac LF — 20 kcal/oz (67 kcal/100mL)",
  "ENFALAC_24": "Enfalac LF — 24 kcal/oz (80 kcal/100mL)",
  "ENFALAC_27": "Enfalac LF — 27 kcal/oz (90 kcal/100mL)",
  "INFATRINI_30": "Infatrini (30 kcal/oz)",
  "FBM_INF_MIX": "FBM 24 ↔ Infatrini 30 (alternating)",
  "none": "Not prescribed"
};
// Fixed clinical print slots. Values are formatted ONCE by NeoFeed; CP only
// validates and renders text. No HTML, identity fields or recalculation accepted.
export const TPN_FIELDS = [
 ['naClStrength','Stock concentrations','NaCl','mEq/mL'],['naAcetStrength','Stock concentrations','Na acetate','mEq/mL'],['glycoNaStrength','Stock concentrations','Glycophos Na','mEq/mL'],['glycoPStrength','Stock concentrations','Glycophos phosphate','mg/mL'],
 ['k2KStrength','Stock concentrations','K2HPO4 potassium','mEq/mL'],['k2PStrength','Stock concentrations','K2HPO4 phosphate','mg/mL'],['kClStrength','Stock concentrations','KCl','mEq/mL'],['mgConcentration','Stock concentrations','Selected MgSO4','mEq/mL'],['caConcentration','Stock concentrations','Ca gluconate elemental calcium','mg/mL'],['heparinStrength','Stock concentrations','Heparin','unit/mL'],['peditraceZn','Stock concentrations','Peditrace zinc','µg/mL'],
 ['delivered','PN fluid','Delivered PN volume','mL/day'],['prepared','PN fluid','Prepared PN volume','mL/day'],
 ['dead','PN fluid','Dead-space volume','mL'],['factor','PN fluid','Factor','kg'],['overfill','PN fluid','Prepared / delivered','ratio'],
 ['pnRate','PN fluid','PN pump rate','mL/hr'],['dexPct','PN fluid','Dextrose final','%'],['dexBag','PN fluid','Dextrose in bag','g'],
 ['d50','PN fluid','D50W','mL'],['dexDelivered','PN fluid','Dextrose delivered','g'],['dexKg','PN fluid','Dextrose delivered','g/kg/day'],
 ['aaKg','PN fluid','Amino acid ordered','g/kg/day'],['aaBag','PN fluid','Amino acid in bag','g'],['aaMl','PN fluid','10% Aminoven infant','mL'],
 ['lipidKg','Separate lipid syringe','20% SMOF ordered','g/kg/day'],['lipidMl','Separate lipid syringe','20% SMOF','mL'],
 ['vitalipid','Separate lipid syringe','Vitalipid N infant','mL'],['lipidBag','Separate lipid syringe','Lipid syringe total','mL'],
 ['lipidHours','Separate lipid syringe','Infusion duration','hr'],['lipidRate','Separate lipid syringe','Lipid pump rate','mL/hr'],
 ['naClKg','Electrolytes','NaCl ordered','mEq/kg/day'],['naClBag','Electrolytes','NaCl in bag','mEq'],['naClMl','Electrolytes','20% NaCl','mL'],
 ['naAcetKg','Electrolytes','Na acetate ordered','mEq/kg/day'],['naAcetBag','Electrolytes','Na acetate in bag','mEq'],['naAcetMl','Electrolytes','Na acetate','mL'],
 ['glycoKg','Electrolytes','Glycophos ordered','mL/kg/day'],['glycoMl','Electrolytes','Glycophos in bag','mL'],['naKg','Electrolytes','Total Na delivered','mEq/kg/day'],
 ['k2Kg','Electrolytes','K2HPO4 ordered as K','mEq/kg/day'],['k2P','Electrolytes','K2HPO4 ordered as P','mg/kg/day'],
 ['k2Bag','Electrolytes','K2HPO4 in bag as K','mEq'],['k2Ml','Electrolytes','K2HPO4','mL'],
 ['kClKg','Electrolytes','KCl ordered','mEq/kg/day'],['kClBag','Electrolytes','KCl in bag','mEq'],['kClMl','Electrolytes','KCl','mL'],['kConc','Electrolytes','K in bag','mEq/L'],
 ['mgKg','Electrolytes','Mg ordered','mEq/kg/day'],['mgBag','Electrolytes','Mg in bag','mEq'],['mgStrength','Electrolytes','MgSO4 strength','%'],['mgMl','Electrolytes','MgSO4','mL'],
 ['caKg','Electrolytes','Elemental Ca ordered','mg/kg/day'],['caBag','Electrolytes','Elemental Ca in bag','mg'],['caMl','Electrolytes','Ca gluconate','mL'],
 ['soluvit','Vitamins and trace','Soluvit N in bag','mL/day'],['soluvitDelivered','Vitamins and trace','Soluvit delivered','mL/day'],
 ['peditrace','Vitamins and trace','Peditrace in bag','mL/day'],['peditraceDelivered','Vitamins and trace','Peditrace delivered','mL/day'],
 ['heparin','Vitamins and trace','Heparin concentration','unit/mL'],['heparinMl','Vitamins and trace','Heparin stock','mL/day'],
 ['components','Bag make-up','Components total (excludes lipid syringe)','mL'],['wfi','Bag make-up','Water for injection q.s. (negative = overfilled)','mL'],
 ['mtv','Enteral supplements','Munti-vim Drop','mL/day'],['vitDKg','Enteral supplements','Vitamin D ordered','IU/kg/day'],['vitD','Enteral supplements','Vitamin D','IU/day'],
 ['oralCaKg','Enteral supplements','Oral Ca ordered','mg/kg/day'],['oralCa','Enteral supplements','Oral Ca','mg/day'],['oralCaTab','Enteral supplements','Oral Ca preparation','tab/day'],
 ['oralPKg','Enteral supplements','Oral phosphate ordered','mg/kg/day'],['oralP','Enteral supplements','Oral phosphate','mg/day'],['oralPMl','Enteral supplements','Oral phosphate preparation','mL/day'],
 ['oralFeKg','Enteral supplements','Oral Fe ordered','mg/kg/day'],['oralFe','Enteral supplements','Oral Fe','mg/day'],['oralFeMl','Enteral supplements','Oral Fe preparation','mL/day'],
 ['minTpnCa','Combined minerals','TPN Ca','mg/kg/day'],['minTpnP','Combined minerals','TPN P','mg/kg/day'],['minTpnRatio','Combined minerals','TPN Ca:P','ratio'],
 ['minEnCa','Combined minerals','EN Ca','mg/kg/day'],['minEnP','Combined minerals','EN P','mg/kg/day'],
 ['minOralCa','Combined minerals','Oral Ca','mg/kg/day'],['minOralP','Combined minerals','Oral P','mg/kg/day'],['minOralRatio','Combined minerals','Oral Ca:P','ratio'],
 ['minTotalCa','Combined minerals','Total Ca','mg/kg/day'],['minTotalP','Combined minerals','Total P','mg/kg/day'],['minTotalRatio','Combined minerals','Total Ca:P','ratio'],
 ['aaDelivered','Delivered PN','Amino acid','g'],['energy','Delivered PN','Energy','kcal'],['energyKg','Delivered PN','Energy','kcal/kg/day'],
 ['naDelivered','Delivered PN','Na','mEq'],['kDelivered','Delivered PN','K','mEq'],['kKg','Delivered PN','K','mEq/kg/day'],
 ['mgDelivered','Delivered PN','Mg','mEq'],['caDelivered','Delivered PN','Ca','mg'],['pDelivered','Delivered PN','Phosphate','mg'],
 ['osm','Summary','Osmolarity','mOsm/L'],['gir','Summary','GIR','mg/kg/min'],['protein','Summary','Protein','g/kg/day'],['caP','Summary','Ca:P (TPN + EN)','ratio'],
 ['enVol','Enteral plan','Volume per feed','mL/feed'],['enFreq','Enteral plan','Feeds per 24 hours',''],['enDaily','Enteral plan','Planned enteral volume','mL/day']
];
export function validateTpn(value) {
 const fail=()=>{throw Error('invalid_tpn_snapshot');};
 const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();};
 exact(value,['schema','appVersion','constantsVersion','templateVersion','orderDate','effectiveFrom','effectiveTo','dosingWeightG','currentWeightG','usingBirthWeight','route','dol','values','preparations']);
 if(value.schema!=='neofeed-tpn-v1'||value.templateVersion!=='cp-tpn-1')fail();
 for(const k of ['appVersion','constantsVersion'])if(typeof value[k]!=='string'||!/^[0-9][0-9A-Za-z._-]{0,63}$/.test(value[k]))fail();
 const time=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 if(!/^\d{4}-\d\d-\d\d$/.test(value.orderDate)||!time(value.orderDate+'T00:00:00.000Z')||!time(value.effectiveFrom)||!time(value.effectiveTo)||value.effectiveTo<=value.effectiveFrom)fail();
 for(const k of ['dosingWeightG','currentWeightG'])if(!Number.isFinite(value[k])||value[k]<=0)fail();
 if(typeof value.usingBirthWeight!=='boolean'||!['central','peripheral'].includes(value.route)||!Number.isSafeInteger(value.dol)||value.dol<1)fail();
 exact(value.values,TPN_FIELDS.map(f=>f[0]));
 for(const v of Object.values(value.values))if(typeof v!=='string'||v.length>24||!/^(-?\d+(\.\d+)?|—|!!)$/.test(v))fail();
 exact(value.preparations,['ca','phosphate','iron','enteral']);
 // Only machine keys from the source constants, no free-text labels or identity.
 for(const v of Object.values(value.preparations))if(typeof v!=='string'||!Object.hasOwn(TPN_PREPARATIONS,v))fail();
 return structuredClone(value);
}
export function renderTpn(container, value) {
 const t=validateTpn(value), doc=container.ownerDocument;container.replaceChildren();
 const line=doc.createElement('p');line.textContent=`TPN ${t.orderDate} · ${t.route} · DOL ${t.dol} · dosing ${t.dosingWeightG} g · current ${t.currentWeightG} g${t.usingBirthWeight?' · birth-weight basis':''}`;container.append(line);
 const period=doc.createElement('p');period.textContent=`Effective ${t.effectiveFrom} → ${t.effectiveTo}`;container.append(period);
 let section,table;
 for(const [id,group,label,unit] of TPN_FIELDS){
  if(group!==section){section=group;const h=doc.createElement('h3');h.textContent=group;table=doc.createElement('table');table.className='tpn-table';container.append(h,table);}
  const tr=doc.createElement('tr');tr.dataset.field=id;
  for(const text of [label,t.values[id],unit]){const td=doc.createElement('td');td.textContent=text;tr.append(td);}table.append(tr);
 }
 const p=doc.createElement('p');p.textContent=`Preparations: ${TPN_PREPARATIONS[t.preparations.ca]}; ${TPN_PREPARATIONS[t.preparations.phosphate]}; ${TPN_PREPARATIONS[t.preparations.iron]}; ${TPN_PREPARATIONS[t.preparations.enteral]}. NeoFeed app ${t.appVersion}; constants ${t.constantsVersion}; template ${t.templateVersion}. — = zero/not selected/unavailable as displayed by source; !! = undefined mineral ratio.`;container.append(p);
}
