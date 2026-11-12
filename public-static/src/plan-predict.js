// Historique complet pour la prédiction : toutes les séances réalisées, toutes prépas confondues (prAllDone, plan-optim.js)
function _ppHist(){ return typeof prAllDone==='function'?prAllDone():[]; }
// n° de semaine continu d'aujourd'hui (1 = semaine de la 1re séance enregistrée) et lundi d'une semaine continue
function _ppGwNow(){ const h=_ppHist(); if(!h.length||typeof prMonday!=='function') return CW; return Math.round((prMonday(prTodayIso()).getTime()-prMonday(h[0].date).getTime())/604800000)+1; }
function _ppGwDate(gw){ const h=_ppHist(); if(!h.length||typeof prMonday!=='function') return null; const d=prMonday(h[0].date); d.setDate(d.getDate()+(gw-1)*7); return prIso(d); }
// libellé d'une séance / semaine de l'historique : date courte (« 12 mars »), sinon S + n° de semaine
function _ppWk(h){ return h&&h.date?new Date(h.date+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):'S'+(h&&h.ws); }
function _buildMarathonPredictionLegacy() {
  // Pour les athlètes sans données : retourner vide
  if(!usesHardPlan()){
    // Vérifier s'ils ont des séances validées avec perf
    const hasData=_ppHist().some(h=>h.perf&&(h.perf.pace||h.perf.hr));   // tout l'historique, pas seulement la prépa en cours
    if(!hasData) return {tempsStr:null,amPaceRecoStr:null,confiance:0};
  }
  const vo2max = getVo2max();
  const vdotPaceSec = vdotMarathonPaceSec(vo2max);
  const fmtTime = s => { const hh=Math.floor(s/3600),mm=Math.floor((s%3600)/60); return `${hh}h${String(mm).padStart(2,'0')}`; };

  // ── Collecter toutes les séances validées : tout l'historique (toutes les prépas) ──
  // ws = n° de semaine continu depuis la 1re séance enregistrée (prAllDone), date = date réelle
  const efPts = [], longPts = [], tempoPts = [];
  _ppHist().forEach(h => {
    if(h.hard && (h.w === 22 || h.w === 23)) return;          // plan Seine-Eure : semaines 22-23 exclues (comme avant)
    const perf = h.perf || {};
    if(!perf.pace || !perf.hr) return;
    const fc = parseInt(perf.hr);
    const paceSec = paceStrToSec(String(perf.pace));
    if(!paceSec || fc < 100) return;
    const cadence = perf.strava ? (perf.strava.cadence || perf.strava.cadence_moy || null) : null;
    const entry = { ws: h.gw, date: h.date, paceSec, fc, km: h.km, cadence, type: h.type, perf };
    if(h.type === 'ef' && fc <= hrEfMax() + 4) { efPts.push(entry); }          // plafond d'endurance de l'app (+4 de tolérance), plus 152 en dur
    else if(h.type === 'long' && fc <= hrEfMax() + 10) { longPts.push(entry); }
    else if(h.type === 'tempo' || h.type === 'frac') {
      const blocs = perf.blocsAllure ? perf.blocsAllure.filter(Boolean) : [];
      if(blocs.length > 0) { blocs.forEach(b => { const bSec = paceStrToSec(b); if(bSec) tempoPts.push({...entry, paceSec: bSec}); }); }
    }
  });
  const gwNow = _ppGwNow();

  const nbTotal = efPts.length + longPts.length + tempoPts.length;

  if(efPts.length === 0 && tempoPts.length === 0) {
    const total = Math.round(vdotPaceSec * 1.05 * 42.195);
    return { tempsSec:total, tempsStr:fmtTime(total), methode:'vdot_pur', confiance:10,
      nbSeances:0, tendanceSec:null, intervalMin:total-1200, intervalMax:total+1200,
      intervalMinStr:fmtTime(total-1200), intervalMaxStr:fmtTime(total+1200),
      historique:[], sub4hEcartSec:total-14400, vo2max,
      details:{vdotPurLabel:fmtTime(Math.round(vdotPaceSec*42.195)),vdotPurSec:Math.round(vdotPaceSec*42.195),
        slopeLabel:'—',nbEf:0,nbLong:0,nbTempo:0,amFromEf:null,amFromLong:null,amFromTempo:null,
        bestEfPace:null,bestLongPace:null,bestTempoPace:null,avgCadence:null}};
  }

  // ── Tendance EF (slope) — exclure S1-S3 démarrage ──
  const slopePts = efPts.filter(p=>p.fc<=hrEfMax() && p.ws>=4);
  let slope = 0;
  if(slopePts.length >= 3) {
    const n=slopePts.length, sX=slopePts.reduce((a,p)=>a+p.ws,0), sY=slopePts.reduce((a,p)=>a+p.paceSec,0);
    const sXY=slopePts.reduce((a,p)=>a+p.ws*p.paceSec,0), sX2=slopePts.reduce((a,p)=>a+p.ws*p.ws,0);
    slope = (n*sXY-sX*sY)/(n*sX2-sX*sX);
  }

  // ── SIGNAL 1 : EF — ratio empirique calibré ──
  // Ratio empirique : allure marathon ≈ allure EF normalisée × 0.935
  // (coureurs intermédiaires courent l'EF ~7% plus lentement que leur allure marathon)
  // Plus fiable que le ratio VDOT théorique qui suppose une course à intensité maximale
  let amFromEf = null, bestEfPaceSec = null, efHistory = [];
  if(efPts.length >= 1) {
    const FCref = 143;
    const last3Ef = efPts.slice(-3);
    const efWeights = last3Ef.map((p,i) => i+1);
    const efTotalW = efWeights.reduce((a,b)=>a+b,0);
    const normPaces = last3Ef.map(p => p.paceSec * Math.pow(p.fc/FCref, 0.5));
    const weightedNormPace = normPaces.reduce((a,p,i)=>a+p*efWeights[i],0)/efTotalW;
    bestEfPaceSec = weightedNormPace;
    // Ratio empirique 0.965 : calibré sur niveau S10 actuel
    // (marathon ≈ EF normalisée × 0.965 pour coureur 4h en phase de prépa)
    // Monte vers 0.95 avec l'endurance spécifique (longues > 20km, S18+)
    const efRatioBase = Math.max(0.875, 0.905 - (Math.max(0, efPts.length - 6) * 0.003));
    amFromEf = weightedNormPace * efRatioBase;
    efHistory = last3Ef.map((p,i) => ({
      ws: p.ws, date: p.date, pace: p.paceSec, fc: p.fc,
      normPace: Math.round(normPaces[i]),
      rawPaceStr: `${Math.floor(p.paceSec/60)}'${String(Math.round(p.paceSec%60)).padStart(2,'0')}`,
      amPred: Math.round(normPaces[i] * efRatioBase * 42.195)
    }));
  }

  // ── SIGNAL 2 : TEMPO — 3 dernières séances tempo, pondération croissante ──
  let amFromTempo = null, bestTempoPaceSec = null, tempoHistory = [];
  if(tempoPts.length >= 2) {
    // Regrouper les blocs par séance (ws) et faire la moyenne par séance
    const byWs = {}, dateWs = {};
    tempoPts.forEach(p => {
      if(!byWs[p.ws]) byWs[p.ws] = [];
      byWs[p.ws].push(p.paceSec); dateWs[p.ws] = p.date;
    });
    const tempoSessions = Object.entries(byWs)
      .sort((a,b)=>parseInt(a[0])-parseInt(b[0]))
      .map(([ws, paces]) => ({
        ws: parseInt(ws), date: dateWs[ws],
        avgPace: Math.round(paces.reduce((a,b)=>a+b,0)/paces.length),
        blocs: paces.length,
        bestPace: Math.min(...paces)
      }));
    const last3Tempo = tempoSessions.slice(-3); // 3 dernières séances tempo
    if(last3Tempo.length >= 1) {
      // Pondération croissante : plus récent = plus de poids
      const tWeights = last3Tempo.map((s,i) => i+1);
      const tTotalW = tWeights.reduce((a,b)=>a+b,0);
      // Moyenne pondérée des moyennes de séance
      const weightedPace = last3Tempo.reduce((a,s,i)=>a+s.avgPace*tWeights[i],0)/tTotalW;
      bestTempoPaceSec = weightedPace;
      amFromTempo = bestTempoPaceSec * 1.06;
      // Historique individuel
      tempoHistory = last3Tempo.map(s => ({
        ws: s.ws, date: s.date, avgPace: s.avgPace, blocs: s.blocs,
        avgPaceStr: `${Math.floor(s.avgPace/60)}'${String(Math.round(s.avgPace%60)).padStart(2,'0')}`,
        amPred: Math.round(s.avgPace * 1.17 * 42.195)
      }));
    }
  }

  // ── SIGNAL 3 : LONG — Riegel, pondération dynamique selon distance ──
  let amFromLong = null, bestLongPaceSec = null, longHistory = [];
  if(longPts.length >= 1) {
    const recentLong = longPts.slice(-3); // 3 dernières longues
    const FCrefL = 145;
    const maxKm = Math.max(...recentLong.map(p=>p.km));
    const dynWeight = Math.min(3.0, Math.max(0.2, (maxKm-10)/5));
    if(dynWeight > 0 || recentLong.length > 0) {
      // Pondération croissante : plus récent = plus de poids
      const lWeights = recentLong.map((p,i)=>i+1);
      const lTotalW = lWeights.reduce((a,b)=>a+b,0);
      const riegelPaces = recentLong.map(p => {
        const normPace = p.paceSec * Math.pow(p.fc/FCrefL, 0.5);
        return normPace * Math.pow(42.195/p.km, 0.06);
      });
      const weightedRiegel = riegelPaces.reduce((a,v,i)=>a+v*lWeights[i],0)/lTotalW;
      amFromLong = weightedRiegel;
      bestLongPaceSec = Math.min(...recentLong.map(p=>p.paceSec));
      // Historique individuel
      longHistory = recentLong.map((p,i) => ({
        ws: p.ws, date: p.date, pace: p.paceSec, fc: p.fc, km: p.km,
        paceStr: `${Math.floor(p.paceSec/60)}'${String(Math.round(p.paceSec%60)).padStart(2,'0')}`,
        riegelAm: Math.round(riegelPaces[i]*42.195)
      }));
    }
  }

  // ── Fusion pondérée — poids dynamiques ──
  const signals = [];
  // EF toujours présent si données dispo
  if(amFromEf !== null) signals.push({ key:'ef', val:amFromEf, weight:2.5 });

  // Tempo : signal principal si blocs disponibles
  if(amFromTempo !== null) signals.push({ key:'tempo', val:amFromTempo, weight:3.0 });

  // Long : poids dynamique selon distance max des longues
  if(amFromLong !== null && longPts.length >= 1) {
    const maxKm = Math.max(...longPts.slice(-4).map(p=>p.km));
    const dynWeight = Math.min(3.0, Math.max(0.2, (maxKm-10)/5)); // 0.2 à 10km, 3.0 à 25km
    signals.push({ key:'long', val:amFromLong, weight:dynWeight });
  }

  if(signals.length === 0) {
    const total = Math.round(vdotPaceSec*42.195);
    return { tempsSec:total, tempsStr:fmtTime(total), methode:'vdot_pur', confiance:15,
      nbSeances:0, tendanceSec:null, intervalMin:total-900, intervalMax:total+900,
      intervalMinStr:fmtTime(total-900), intervalMaxStr:fmtTime(total+900),
      historique:[], sub4hEcartSec:total-14400, vo2max,
      details:{vdotPurLabel:fmtTime(Math.round(vdotPaceSec*42.195)),vdotPurSec:Math.round(vdotPaceSec*42.195),
        slopeLabel:'—',nbEf:0,nbLong:0,nbTempo:0,amFromEf:null,amFromLong:null,amFromTempo:null,
        bestEfPace:null,bestLongPace:null,bestTempoPace:null,avgCadence:null}};
  }

  const totalWeight = signals.reduce((a,s)=>a+s.weight,0);
  let amSecFused = signals.reduce((a,s)=>a+s.val*s.weight,0)/totalWeight;

  // ── Corrections ──
  // Cadence — pénalité réduite à 50%
  const allCadences = [...efPts,...longPts].filter(p=>p.cadence).map(p=>p.cadence);
  const avgCadence = allCadences.length>0 ? Math.round(allCadences.reduce((a,b)=>a+b,0)/allCadences.length) : null;
  if(avgCadence) amSecFused += Math.max(0,(180-avgCadence)/8); // /8 au lieu de /4 = 50%

  // ── Dérive cardiaque sur longues (cardiac drift) ──
  // FC début (1er tiers) vs FC fin (dernier tiers) — 3 dernières longues uniquement
  let cardiacDrift = null, driftPenaltySec = 0, driftHistory = [];
  const longWithSplits = longPts.filter(p => {
    const perf = p.perf || {};
    return perf.strava && perf.strava.splits && perf.strava.splits.length >= 6; // min 6km pour avoir 4 après skip
  });
  if(longWithSplits.length > 0) {
    const drifts = [];
    longWithSplits.slice(-3).forEach(p => {
      const perf = p.perf || {};
      const allSplits = (perf.strava.splits||[]).filter(sp=>sp.fc&&sp.fc>0);
      if(allSplits.length < 6) return;
      // Ignorer les 2 premiers km (échauffement cardiaque — FC encore en montée)
      const stable = allSplits.slice(2);
      const half = Math.floor(stable.length/2);
      const fcMid = stable.slice(0,half).reduce((a,s)=>a+s.fc,0)/half;
      const fcEnd = stable.slice(half).reduce((a,s)=>a+s.fc,0)/stable.slice(half).length;
      const drift = (fcEnd-fcMid)/fcMid*100;
      drifts.push({
        ws: p.ws, date: p.date, drift: Math.round(drift*10)/10, km: p.km,
        fcStart: Math.round(fcMid), fcEnd: Math.round(fcEnd),
        note: `km3-${2+half} vs km${3+half}-${allSplits.length}`
      });
    });
    driftHistory = drifts;
    if(drifts.length > 0) {
      const weights = drifts.map((d,i)=>i+1);
      const totalW = weights.reduce((a,b)=>a+b,0);
      cardiacDrift = Math.round(drifts.reduce((a,d,i)=>a+d.drift*weights[i],0)/totalW*10)/10;
      // Seuils révisés (mesure milieu→fin, sans échauffement) :
      // < 3% : parfait → bonus -4 min
      // 3-5% : excellent → bonus -2 min
      // 5-8% : bon → neutre
      // 8-12% : moyen → pénalité +2 min
      // > 12% : élevé → pénalité +4 min
      if(cardiacDrift < 3) driftPenaltySec = -240;
      else if(cardiacDrift < 5) driftPenaltySec = -120;
      else if(cardiacDrift < 8) driftPenaltySec = 0;
      else if(cardiacDrift < 12) driftPenaltySec = 120;
      else driftPenaltySec = 240;
      amSecFused += driftPenaltySec / 42.195;
    }
  }

  // Progression (slope négatif = s'améliore) — plafonné à 4 sec/km max
  if(slope < -0.5 && slopePts.length >= 4) {
    amSecFused -= Math.min(Math.abs(slope)*Math.max(0,planTotalWeeks()-CW)*0.2, 4);
  }

  const amSecPred = Math.round(amSecFused);
  const totalSecBase = Math.round(amSecPred*42.195);

  // Moyenne avec l'estimation par record 10km (si disponible)
  const r10pred = getRecord10kmPredictions();
  const totalSecR10 = r10pred ? r10pred.marSec : null;
  const totalSec = totalSecR10
    ? Math.round(totalSecBase * 0.25 + totalSecR10 * 0.75)
    : totalSecBase;
  const tempsStr = fmtTime(totalSec);

  // Intervalle de confiance
  const allVals = signals.map(s=>s.val);
  const spread = allVals.length>1 ? Math.max(...allVals)-Math.min(...allVals) : 120;
  const intervalTot = Math.round(Math.min(12, Math.max(2, spread*0.35))*42.195);
  const iMin=totalSec-intervalTot, iMax=totalSec+intervalTot;

  // Confiance : monte avec nb séances, semaines avancées, convergence signaux
  const convergence = spread < 30 ? 20 : spread < 60 ? 10 : 0;
  const confiance = Math.min(88, Math.round(
    (nbTotal/25)*30 + (Math.min(gwNow,32)/32)*25 + convergence + (signals.length>=2?10:0) + (vo2max>0?5:0)
  ));

  // Historique semaine par semaine
  const historique = [];
  for(let ws=4; ws<=gwNow; ws++) {
    const ePts=efPts.filter(p=>p.ws<=ws), lPts=longPts.filter(p=>p.ws<=ws), tPts=tempoPts.filter(p=>p.ws<=ws);
    const sig=[];
    if(ePts.length>=1){
      const FCr=143, normB=Math.min(...ePts.slice(-3).map(p=>p.paceSec*Math.pow(p.fc/FCr,0.5)));
      const vEf=vdotPaceSec*(1/0.79)*0.75;
      sig.push({val:vdotPaceSec/(vEf/normB),weight:2.5});
    }
    if(tPts.length>=2){
      const srt=[...tPts].sort((a,b)=>a.paceSec-b.paceSec);
      const med=srt.slice(0,Math.min(3,srt.length)).reduce((a,p)=>a+p.paceSec,0)/Math.min(3,srt.length);
      sig.push({val:med*1.17,weight:3.0});
    }
    if(lPts.length>=1){
      const mxK=Math.max(...lPts.slice(-2).map(p=>p.km));
      const dw=Math.min(3.0,Math.max(0.2,(mxK-10)/5));
      const rAm=Math.min(...lPts.slice(-2).map(p=>p.paceSec*Math.pow(p.fc/145,0.5)*Math.pow(42.195/p.km,0.06)));
      sig.push({val:rAm,weight:dw});
    }
    if(sig.length===0) continue;
    const tw=sig.reduce((a,s)=>a+s.weight,0);
    historique.push({ws, date:_ppGwDate(ws), tempsSec:Math.round(sig.reduce((a,s)=>a+s.val*s.weight,0)/tw*42.195)});
  }

  // Allure marathon recommandée = depuis le temps FINAL (moyenne avec 10km si dispo)
  const amPaceReco = Math.round(totalSec / 42.195 / 5) * 5;  // arrondi à 5s

  return {
    tempsSec:totalSec, tempsStr, methode:'vdot_multi', confiance,
    nbSeances:nbTotal, tendanceSec:slope,
    intervalMin:iMin, intervalMax:iMax,
    intervalMinStr:fmtTime(iMin), intervalMaxStr:fmtTime(iMax),
    historique, sub4hEcartSec:totalSec-14400, vo2max,
    amPaceReco, // allure recommandée en sec/km
    amPaceRecoStr: `${Math.floor(amPaceReco/60)}'${String(amPaceReco%60).padStart(2,'0')}`,
    tempsSecBase: totalSecBase,
    tempsStrBase: fmtTime(totalSecBase),
    tempsSecR10: totalSecR10,
    tempsStrR10: totalSecR10 ? fmtTime(totalSecR10) : null,
    signals, // pour debug
    details:{
      vdotPurLabel:fmtTime(Math.round(vdotPaceSec*42.195)),
      vdotPurSec:Math.round(vdotPaceSec*42.195),
      slopeLabel:slope<-0.5?`−${Math.round(Math.abs(slope)*10)/10}s/km/sem`:slope>0.5?`+${Math.round(slope*10)/10}s/km/sem`:'stable',
      nbEf:efPts.length, nbLong:longPts.length, nbTempo:tempoPts.length,
      amFromEf:amFromEf?Math.round(amFromEf*42.195):null,
      amFromLong:amFromLong?Math.round(amFromLong*42.195):null,
      amFromTempo:amFromTempo?Math.round(amFromTempo*42.195):null,
      bestEfPace:bestEfPaceSec, bestLongPace:bestLongPaceSec, bestTempoPace:bestTempoPaceSec,
      avgCadence, efHistory, tempoHistory, longHistory,
      longMaxKm: longPts.length>0?Math.max(...longPts.slice(-4).map(p=>p.km)):0,
      cardiacDrift: cardiacDrift !== null ? Math.round(cardiacDrift*10)/10 : null,
      driftPenaltySec,
      driftHistory,
    }
  };
}



function _parseRecord10km(val) {
  if (!val) return null;
  const clean = String(val).replace(/'/g, ':').replace(/\s/g, '');
  const parts = clean.split(':').map(Number);
  let sec = 0;
  if (parts.length === 3) { if(parts[1]>=60||parts[2]>=60) return null; sec = parts[0]*3600+parts[1]*60+parts[2]; }
  else if (parts.length === 2) { if(parts[1]>=60) return null; sec = parts[0]*60+parts[1]; }
  if (!sec || sec < 1200 || sec > 7200) return null;
  return sec;
}




// ─────────────────────────────────────────────────────────────
// Prédiction courtes distances (5km, 10km) via blocs frac/tempo
// Modèle direct : pas de Riegel depuis marathon (double-indirect)
// 5km ≈ 97% VMA = allure fractionné  → factor frac 1.00, tempo 0.907
// 10km ≈ 92% VMA                     → factor frac 1.055, tempo 0.957
// ─────────────────────────────────────────────────────────────
function buildShortDistancePrediction(course) {
  const distMap = {'10 km':10,'5 km':5};
  const dist = distMap[course];
  if(!dist) return {tempsStr:null,paceStr:null,confiance:0,nbSeances:0};

  const fracPts=[], tempoPts=[];
  let nbSeancesAvecBlocs=0;
  const collectBlocs = (type, perf) => {
    const blocs=(perf.blocsAllure||[]).filter(Boolean);
    let added=false;
    blocs.forEach(b=>{const s=paceStrToSec(b);if(s){(type==='frac'?fracPts:tempoPts).push(s);added=true;}});
    if(added) nbSeancesAvecBlocs++;
  };
  // blocs de fractionné / tempo de tout l'historique (toutes les prépas)
  _ppHist().forEach(h=>{
    if(h.hard&&(h.w===22||h.w===23)) return;
    if(h.type!=='frac'&&h.type!=='tempo') return;
    collectBlocs(h.type, h.perf||{});
  });

  if(fracPts.length===0&&tempoPts.length===0) return {tempsStr:null,paceStr:null,confiance:0,nbSeances:0,nbFrac:0,nbTempo:0,_method:'blocs_directs'};

  const fracFactor  = course==='5 km' ? 1.00 : 1.055;
  const tempoFactor = course==='5 km' ? 0.907 : 0.957;

  const weightedAvg=pts=>{const r=pts.slice(-Math.min(5,pts.length)),w=r.map((_,i)=>i+1),tw=w.reduce((a,b)=>a+b,0);return r.reduce((a,v,i)=>a+v*w[i],0)/tw;};
  const signals=[];
  if(fracPts.length>0) signals.push({val:weightedAvg(fracPts)*fracFactor, w:Math.min(3,fracPts.length)});
  if(tempoPts.length>0) signals.push({val:weightedAvg(tempoPts)*tempoFactor, w:Math.min(2,tempoPts.length)});

  const totalW=signals.reduce((a,s)=>a+s.w,0);
  const paceSec=Math.round(signals.reduce((a,s)=>a+s.val*s.w,0)/totalW);
  const timeSec=Math.round(paceSec*dist);
  const nbSeances=nbSeancesAvecBlocs;
  const confiance=Math.min(80,15+nbSeances*12);

  const fmtTime=s=>{const hh=Math.floor(s/3600),mm=Math.floor((s%3600)/60),ss=s%60;if(hh>0)return`${hh}h${String(mm).padStart(2,'0')}`;return`${mm}'${String(ss).padStart(2,'0')}`;};
  const fmtPaceFn=s=>Math.floor(s/60)+"'"+(s%60<10?'0':'')+s%60;

  return {tempsSec:timeSec,tempsStr:fmtTime(timeSec),paceSec,paceStr:fmtPaceFn(paceSec),confiance,nbSeances,nbFrac:fracPts.length,nbTempo:tempoPts.length,_method:'blocs_directs',nbBlocsTotal:fracPts.length+tempoPts.length};
}

// ─────────────────────────────────────────────────────────────
// Prédiction pour les distances courtes (semi, 10km, 5km)
// Semi : Riegel depuis modèle marathon
// 10km : blocs directs, fallback Riegel si pas de blocs
// 5km  : blocs directs uniquement (Riegel trop indirect)
// ─────────────────────────────────────────────────────────────
function _buildDistancePredictionLegacy(course) {
  const distMap = {'Semi-marathon':21.097,'10 km':10,'5 km':5};
  const dist = distMap[course];
  if(!dist) return {tempsStr:null,paceStr:null,confiance:0};

  // 5km : modèle blocs directs uniquement
  if(course==='5 km') return buildShortDistancePrediction('5 km');

  // 10km : blocs directs en priorité, fallback Riegel
  if(course==='10 km'){
    const shortPred=buildShortDistancePrediction('10 km');
    if(shortPred.tempsStr) return shortPred;
    const pred=buildMarathonPrediction();
    if(!pred.tempsSec) return {tempsStr:null,paceStr:null,confiance:pred.confiance||0,nbSeances:pred.nbSeances||0,_method:'riegel_fallback',nbFrac:0,nbTempo:0};
    const rf=Math.pow(10/42.195,1.06);
    const ts=Math.round(pred.tempsSec*rf), ps=Math.round(ts/10);
    const fmtT=s=>{const hh=Math.floor(s/3600),mm=Math.floor((s%3600)/60),ss=s%60;if(hh>0)return`${hh}h${String(mm).padStart(2,'0')}`;return`${mm}'${String(ss).padStart(2,'0')}`;};
    const fmtP=s=>Math.floor(s/60)+"'"+(s%60<10?'0':'')+s%60;
    return {tempsSec:ts,tempsStr:fmtT(ts),paceSec:ps,paceStr:fmtP(ps),confiance:Math.round((pred.confiance||0)*0.7),nbSeances:pred.nbSeances,details:pred.details,historique:(pred.historique||[]).map(h=>({ws:h.ws,tempsSec:Math.round(h.tempsSec*rf)})),_method:'riegel_fallback',nbFrac:0,nbTempo:0};
  }

  // Semi-marathon : Riegel depuis marathon
  const pred = buildMarathonPrediction();
  if(!pred.tempsSec) return {tempsStr:null,paceStr:null,confiance:pred.confiance||0,nbSeances:pred.nbSeances||0};

  const riegelFactor = Math.pow(dist/42.195, 1.06);
  const distTimeSec  = Math.round(pred.tempsSec * riegelFactor);
  const distPaceSec  = Math.round(distTimeSec / dist);

  const fmtTime = s => {
    const hh=Math.floor(s/3600), mm=Math.floor((s%3600)/60), ss=s%60;
    if(hh>0) return `${hh}h${String(mm).padStart(2,'0')}`;
    return `${mm}'${String(ss).padStart(2,'0')}`;
  };
  const fmtPaceFn = s => Math.floor(s/60)+"'"+(s%60<10?'0':'')+s%60;

  return {
    tempsSec: distTimeSec,
    tempsStr: fmtTime(distTimeSec),
    paceSec:  distPaceSec,
    paceStr:  fmtPaceFn(distPaceSec),
    confiance:pred.confiance,
    nbSeances:pred.nbSeances,
    details:  pred.details,
    _method:  'riegel',
    historique: (pred.historique||[]).map(h=>({
      ws: h.ws,
      tempsSec: Math.round(h.tempsSec * riegelFactor),
    })),
  };
}


// ─── Prédiction unique : le même temps partout (en-tête, fenêtres, Coach, Statistiques, MAJ le plan) ──────────
// L'ancien modèle (EF / tempo / longues / record 10 km, blocs directs) ne sert plus que s'il n'y a pas encore de niveau
// (aucune course, record ni séance de qualité) ou pour le plan Seine-Eure écrit en dur. Sinon : predRace (plan-optim.js).
function buildMarathonPrediction(){ return predUnify(_buildMarathonPredictionLegacy(), 'Marathon'); }
function buildDistancePrediction(course){ return predUnify(_buildDistancePredictionLegacy(course), course); }
function predUnify(L, cat){
  L = L || {};
  if((typeof usesHardPlan === 'function' && usesHardPlan()) || typeof predRace !== 'function') return L;
  const P = predRace(cat); if(!P) return L;
  const fT = function(s){ s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h > 0 ? h + 'h' + String(m).padStart(2, '0') : m + "'" + String(x).padStart(2, '0'); };
  const fP = function(s){ s = Math.round(s); return Math.floor(s / 60) + "'" + String(s % 60).padStart(2, '0'); };
  const reco = Math.round(P.pace / 5) * 5;
  const out = Object.assign({}, L, {
    tempsSec: P.sec, tempsStr: fT(P.sec), paceSec: Math.round(P.pace), paceStr: fP(P.pace),
    amPaceReco: reco, amPaceRecoStr: fP(reco), methode: 'niveau', _method: 'niveau', vdot: P.vdot,
    predNow: P.now, predNowStr: fT(P.now), predRace: P.race, predDate: P.date,
    intervalMin: P.lo || L.intervalMin, intervalMax: P.hi || L.intervalMax,
    intervalMinStr: P.lo ? fT(P.lo) : L.intervalMinStr, intervalMaxStr: P.hi ? fT(P.hi) : L.intervalMaxStr,
    // anciens sous-modèles : plus affichés (ils donnaient d'autres temps dans la même fenêtre)
    tempsStrBase: null, tempsStrR10: null, tempsSecR10: null,
    confiance: Math.max(L.confiance || 0, 60), sub4hEcartSec: P.sec - 14400,
  });
  // courbe : le niveau semaine par semaine (même calcul qu'à chaque date), converti en temps — calculée seulement si on la lit
  let _h = null;
  Object.defineProperty(out, 'historique', { enumerable: true, get: function(){
    if(_h) return _h;
    try { _h = typeof bsLevelHistory === 'function' ? bsLevelHistory().map(function(p, i){ return { ws: i + 1, date: p.date, tempsSec: Math.round(raceTimeFromVdot(p.v, P.m)) }; }) : (L.historique || []); }
    catch(e) { _h = L.historique || []; }
    return _h;
  } });
  return out;
}
// d'où vient le temps : niveau du moment, projection au jour J et temps équivalent aujourd'hui (fenêtres de prédiction)
function predExplainHtml(pred){
  if(!pred || pred.methode !== 'niveau') return '';
  const v = String(Math.round(pred.vdot * 10) / 10).replace('.', ','), d = pred.predRace ? new Date(pred.predRace.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null;
  return '<div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.45;">' + (d ? 'Prévu le ' + d + ' (' + pred.intervalMinStr + ' – ' + pred.intervalMaxStr + ')' : 'À ton niveau d\'aujourd\'hui')
    + ' · niveau ' + v + (d ? ' · aujourd\'hui : <b style="color:var(--text);">' + pred.predNowStr + '</b>' : '') + '<br>Même calcul que Statistiques › Niveau et « MAJ le plan »</div>';
}
