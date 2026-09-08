import { validateTpn } from './tpn-document.mjs';
// Evaluate only while saving the source calculator. CP never imports this builder.
export function buildTpn(p, D, effectiveFrom, effectiveTo) {
 const c=p.calc,s=c.solVol||{},m=p.mineral||{},w=p.wtKg||0,factor=c.factor||0,S=D.KCMH_STOCK;
 const f=(n,d=1)=>Number.isFinite(n)&&n>0?String(Number(n.toFixed(d))):'—';
 const z=(n,d=1)=>Number.isFinite(n)?String(Number(n.toFixed(d))):'—';
 const ratio=n=>n===Infinity?'!!':f(n,2);
 const values={
 naClStrength:z(S.naCl.naMeqPerMl,5),naAcetStrength:z(S.naAcetate.naMeqPerMl,5),glycoNaStrength:z(S.glycophos.naMeqPerMl,5),glycoPStrength:z(S.glycophos.pMgPerMl,5),k2KStrength:z(S.k2hpo4.kMeqPerMl,5),k2PStrength:z(S.k2hpo4.pMgPerKMeq,5),kClStrength:z(S.kCl.kMeqPerMl,5),mgConcentration:z((p.mgStrength==='50'?S.mgso4_50:S.mgso4_10).mgMeqPerMl,5),caConcentration:z(S.caGluconate.caMgPerMl,5),heparinStrength:z(S.heparin.unitsPerMl,5),peditraceZn:z(S.peditrace.znMgPerMl*1000,5),
 delivered:z(p.totalTPN_mL,1),prepared:f(c.preparedVol),dead:f(c.deadVol_mL),factor:f(c.factor,3),overfill:f(c.overfill,3),pnRate:f(p.totalTPN_mL/24,2),
 dexPct:z(p.dexPct),dexBag:f(c.dexG_bag),d50:f(c.d50wVol),dexDelivered:f(c.dexG),dexKg:f(c.dexGPerKg,2),
 aaKg:f(p.aaPerKg,2),aaBag:f(c.aaG_bag),aaMl:f(s.aaAminoven),lipidKg:f(p.lipidPerKg,2),lipidMl:f(s.lipidSMOF),vitalipid:f(c.vitalipidVol),lipidBag:f(c.lipidBagVol),lipidHours:z(p.lipidDripHours||24),lipidRate:f(c.lipidBagVol/(p.lipidDripHours||24),2),
 naClKg:f(p.naCl,3),naClBag:f(p.naCl*factor),naClMl:f(s.naCl),naAcetKg:f(p.naAcet,3),naAcetBag:f(p.naAcet*factor),naAcetMl:f(s.naAcet),glycoKg:f(p.glycophosP,3),glycoMl:f(s.glycophos),naKg:f(c.naKg,2),
 k2Kg:f(p.k2hpo4,3),k2P:f(p.k2hpo4*15.5),k2Bag:f(p.k2hpo4*factor),k2Ml:f(s.k2hpo4,2),kClKg:f(p.kCl,3),kClBag:f(p.kCl*factor),kClMl:f(s.kCl),kConc:f(c.kMeqPerL,0),
 mgKg:f(p.mgPerKg,3),mgBag:f(p.mgPerKg*factor,2),mgStrength:z(Number(p.mgStrength),0),mgMl:f(s.mg,2),caKg:f(p.caPerKg,3),caBag:f(p.caPerKg*factor,0),caMl:f(s.ca),
 soluvit:p.inclSoluvit?f(c.soluvitVol):'—',soluvitDelivered:p.inclSoluvit?f(c.soluvitVol*c.deliveredFrac,2):'—',peditrace:p.inclPeditrace?f(c.peditrace_vol):'—',peditraceDelivered:p.inclPeditrace?f(c.peditrace_vol*c.deliveredFrac,2):'—',heparin:z(p.heparinUmL,3),heparinMl:f(s.heparin,2),components:f(c.componentVol),wfi:z(c.wfiVol),
 mtv:p.suppMTV?'1':'—',vitDKg:f(p.suppVitD,3),vitD:f(p.suppVitD*w,0),oralCaKg:f(p.suppCa,3),oralCa:f(p.suppCa*w,0),oralCaTab:f(p.suppCa*w/(D.SUPP_DB[p.suppCaType]?.ca_mg_per_unit||1),2),
 oralPKg:f(p.suppPO4,3),oralP:f(p.suppPO4*w,0),oralPMl:f(p.suppPO4*w/(D.SUPP_DB[p.suppPO4Type]?.po4_mg_per_ml||1)),oralFeKg:f(p.suppFerdek,3),oralFe:f(p.suppFerdek*w),oralFeMl:f(p.suppFerdek*w/(D.SUPP_DB[p.suppFeType]?.fe_mg_per_ml||1),2),
 minTpnCa:f(m.tpnCa,0),minTpnP:f(m.tpnP,0),minTpnRatio:ratio(m.tpnCaP),minEnCa:f(m.enCa,0),minEnP:f(m.enP,0),minOralCa:f(m.oralCa,0),minOralP:f(m.oralP,0),minOralRatio:ratio(m.oralCaP),minTotalCa:f(m.totCa,0),minTotalP:f(m.totP,0),minTotalRatio:ratio(m.totCaP),
 aaDelivered:f(c.aaG),energy:f(c.tpnKcal,0),energyKg:f(c.kcalKg,0),naDelivered:f(c.naKg*w,2),kDelivered:f(c.kKg*w,2),kKg:f(c.kKg,2),mgDelivered:f(p.mgPerKg*w,2),caDelivered:f(p.caPerKg*w,0),pDelivered:f(c.pTotal_mg,0),osm:f(c.osm,0),gir:f(c.gir),protein:f(c.proteinKg,2),caP:ratio(c.caP),enVol:z(p.enVol,3),enFreq:z(p.enFreq,0),enDaily:z(p.enVol*p.enFreq,3)
 };
 return validateTpn({schema:'neofeed-tpn-v1',templateVersion:'cp-tpn-1',appVersion:D.APP_VERSION,constantsVersion:D.CONSTANTS_VERSION,
 orderDate:p.orderDate,effectiveFrom,effectiveTo,dosingWeightG:p.wtG,currentWeightG:p.curWtG,usingBirthWeight:p.usingBirthWeight,route:p.route,dol:p.dol,values,
 preparations:{ca:p.suppCa>0?p.suppCaType:'none',phosphate:p.suppPO4>0?p.suppPO4Type:'none',iron:p.suppFerdek>0?p.suppFeType:'none',enteral:p.enVol>0?p.enType:'none'}});
}
