// race-analysis.js — Analyse automatique après la course (« 📊 Analyse de ta course »)
// raAnalyze(o) : allure km par km (temps Strava recalé sur le temps officiel) vs plan de course (state._race_plan) ;
// départ (N premiers km), 2e moitié vs 1re (gestion : négative / régulière / positive / coup de mou), où ça a coincé,
// dérive cardiaque, chaleur (prWxAdjFromMeteo), écart à l'objectif et au niveau estimé la veille (prFitness) → verdict + leçons.
// Stockée dans state._race_analysis (+ prep_index/<id>/ra) dès la validation de la course, refaite pour les prépas passées
// dans leur bilan (prepDebrief → d.ra). La recette en tire le départ du prochain plan de course (prepRecette → pacing).
const RA_V = 1;
const _raMean = function(a){ return a.length ? a.reduce(function(x, y){ return x + y; }, 0) / a.length : null; };
const _raMed = function(a){ if(!a.length) return null; const b = a.slice().sort(function(x, y){ return x - y; }), m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const _raSgn = function(s){ const a = Math.round(Math.abs(s)); return (s >= 0 ? '+' : '−') + (a < 60 ? a + ' s' : prPace(a)); };

// o = { perf, sec (officiel), dist (km), cat, date, name, plan ({ target, cum[] } du plan de course), goal (s), pred (s, niveau la veille) }
function raAnalyze(o){
  const perf = o.perf || {}, dist = +o.dist, sec = +o.sec;
  if(!dist || !sec) return null;
  const raw = (((perf.strava || {}).splits) || []).map(function(p){ return { d: +p.distanceKm || 1, p: prPaceSec(p.allure), fc: +p.fc || null }; }).filter(function(p){ return p.p && p.d >= 0.3; });
  // temps Strava (en mouvement, distance GPS) recalé sur le temps officiel et la distance officielle
  const gpsD = raw.reduce(function(a, p){ return a + p.d; }, 0), mov = raw.reduce(function(a, p){ return a + p.p * p.d; }, 0);
  let f = mov ? (sec / mov) * (gpsD / dist) : 1; if(f < 0.9 || f > 1.15) f = 1;
  const full = raw.filter(function(p){ return p.d >= 0.9; });
  const avg = sec / dist;
  // allure prévue km par km (plan de course enregistré pour cette course), sinon allure moyenne visée
  const P = o.plan && o.plan.target ? o.plan : null, cum = P && P.cum && P.cum.length ? P.cum : null;
  const planPace = function(i){ if(cum && cum[i] != null) return cum[i] - (i ? cum[i - 1] : 0); return P ? P.target / dist : null; };
  const kms = full.map(function(p, i){ return { km: i + 1, pace: p.p * f, fc: p.fc, plan: planPace(i) }; });
  const A = { v: RA_V, date: o.date || null, name: o.name || '', cat: o.cat || '', dist: dist, sec: Math.round(sec), time: prTime(sec), avg: avg, kms: kms, lessons: [] };
  // objectif : plan de course, sinon temps visé de la prépa
  const tgt = P ? P.target : o.goal || null;
  if(tgt){ A.target = { sec: Math.round(tgt), src: P ? 'plan' : 'objectif' }; A.delta = Math.round(sec - tgt); }
  if(o.pred){ A.pred = Math.round(o.pred); A.predDelta = Math.round(sec - o.pred); }
  // météo du jour
  const wx = typeof prWxAdjFromMeteo === 'function' ? prWxAdjFromMeteo(perf.meteo) : { pct: 0 };
  if(wx.pct >= 1) A.heat = { pct: Math.round(wx.pct * 10) / 10, why: wx.why, cost: Math.round(sec * wx.pct / (100 + wx.pct)), t: (perf.meteo || {}).temperature };
  if(kms.length >= 4){
    // départ : N premiers km vs allure prévue (ou allure moyenne de la course)
    const n = dist <= 10.5 ? 2 : dist <= 22 ? 3 : 5, st = kms.slice(0, n);
    const sp = _raMean(st.map(function(k){ return k.pace; })), ref = _raMean(st.map(function(k){ return k.plan || avg; }));
    A.start = { n: n, pace: sp, ref: ref, refSrc: P ? 'plan' : 'moyenne', diff: sp - ref, pct: (sp - ref) / ref * 100 };
    // 1re moitié / 2e moitié
    const h1 = kms.filter(function(k){ return k.km - 0.5 < dist / 2; }), h2 = kms.filter(function(k){ return k.km - 0.5 >= dist / 2; });
    const p1 = _raMean(h1.map(function(k){ return k.pace; })), p2 = _raMean(h2.map(function(k){ return k.pace; }));
    if(p1 && p2){
      const pct = (p2 - p1) / p1 * 100;
      A.halves = { p1: p1, p2: p2, pct: Math.round(pct * 10) / 10 };
      A.pacing = pct <= -1 ? 'negative' : pct <= 1.2 ? 'even' : pct <= 3 ? 'positive' : 'fade';
    }
    // où ça a coincé : 1er km (après le départ) nettement plus lent que la 1re moitié, et le suivant aussi
    const m1 = _raMed(h1.map(function(k){ return k.pace; }));
    for(let i = n; i < kms.length - 1; i++){
      if(kms[i].pace > m1 * 1.04 && kms[i + 1].pace > m1 * 1.03){ A.fade = { km: kms[i].km, pct: Math.round((_raMean(kms.slice(i).map(function(k){ return k.pace; })) / m1 - 1) * 1000) / 10 }; break; }
    }
    // dérive cardiaque (vitesse / FC) 1re → 2e moitié, sans le 1er km
    const withFc = kms.slice(1).filter(function(k){ return k.fc; });
    if(withFc.length >= Math.max(3, (kms.length - 1) * 0.6)){
      const hh = Math.floor(withFc.length / 2), eff = function(a){ return _raMean(a.map(function(k){ return (1000 / k.pace) / k.fc; })); };
      const e1 = eff(withFc.slice(0, hh)), e2 = eff(withFc.slice(hh));
      if(e1 && e2) A.drift = { pct: Math.round((e1 - e2) / e1 * 1000) / 10, fc1: Math.round(_raMean(withFc.slice(0, hh).map(function(k){ return k.fc; }))), fc2: Math.round(_raMean(withFc.slice(hh).map(function(k){ return k.fc; }))) };
    }
  }
  // verdict
  const startFast = A.start && A.start.pct <= -2, paid = A.pacing === 'fade' || A.pacing === 'positive' || !!A.fade;
  if(A.delta != null && A.delta <= 0) A.verdict = { e: '🏆', t: 'Objectif atteint', s: (A.delta < 0 ? prTime(-A.delta) + ' de mieux que ' : 'pile ') + (A.target.src === 'plan' ? 'ton plan de course' : 'ton objectif') + '.' };
  else if(A.pred && sec <= A.pred * 1.01) A.verdict = { e: '👍', t: 'Course à ton niveau', s: A.delta != null ? 'Objectif manqué de ' + prTime(A.delta) + ', mais ' + prTime(sec) + ' correspond à ton niveau du moment : l\'objectif était ambitieux.' : prTime(sec) + ' correspond à ton niveau du moment.' };
  else if(A.delta != null) A.verdict = { e: '🔁', t: 'En dessous de ce qui était possible', s: 'Objectif manqué de ' + prTime(A.delta) + (A.heat && A.heat.cost >= Math.abs(A.delta) * 0.5 ? ', en bonne partie à cause de la chaleur.' : startFast && paid ? ' : le départ trop rapide s\'est payé ensuite.' : A.fade ? ' : coup de mou à partir du km ' + A.fade.km + '.' : '.') };
  else A.verdict = { e: '🏁', t: 'Course terminée', s: prTime(sec) + ' sur ' + String(dist).replace('.', ',') + ' km.' };
  // leçons
  const L = A.lessons;
  if(A.start && A.halves){
    if(startFast && paid){ L.push('🐢 Départ trop rapide : ' + _raSgn(A.start.diff) + '/km sur les ' + A.start.n + ' premiers km par rapport au ' + (P ? 'plan' : 'rythme moyen') + ', payé ensuite (2e moitié ' + (A.halves.pct > 0 ? '+' : '') + String(A.halves.pct).replace('.', ',') + ' %). La prochaine fois : départ à l\'allure du plan, même si tout le monde part vite.'); A.startAdvice = 'slower'; }
    else if(A.pacing === 'negative' || A.pacing === 'even') L.push('✅ Gestion ' + (A.pacing === 'negative' ? 'parfaite : 2e moitié plus rapide' : 'régulière : 2e moitié au même rythme') + ' (' + (A.halves.pct > 0 ? '+' : '') + String(A.halves.pct).replace('.', ',') + ' %). Garde ce départ.');
    else if(A.fade) L.push('🧱 Coup de mou à partir du km ' + A.fade.km + ' (allure +' + String(A.fade.pct).replace('.', ',') + ' %) : plus de km à allure course en fin de sortie longue, et ravitaillement à vérifier.');
    else L.push('↘️ 2e moitié un peu plus lente (+' + String(A.halves.pct).replace('.', ',') + ' %) : gestion correcte, départ à garder prudent.');
  }
  if(A.drift){
    if(A.drift.pct >= 8) L.push('❤️ Dérive cardiaque de ' + String(A.drift.pct).replace('.', ',') + ' % (FC ' + A.drift.fc1 + ' → ' + A.drift.fc2 + ') : l\'endurance a lâché' + (A.heat ? ', aggravée par la chaleur' : '') + ' — plus de sorties longues avec un bloc à allure course, et boire tôt.');
    else if(A.drift.pct <= 4) L.push('❤️ Cardio stable (dérive ' + String(A.drift.pct).replace('.', ',') + ' %, FC ' + A.drift.fc1 + ' → ' + A.drift.fc2 + ') : ton endurance a tenu.');
  }
  if(A.heat) L.push('🌡️ ' + (A.heat.why || 'Météo') + ' : environ ' + String(A.heat.pct).replace('.', ',') + ' % de temps en plus (≈ ' + prTime(A.heat.cost) + ').');
  if(A.pred){
    if(sec < A.pred * 0.99) L.push('🚀 Plus rapide que ton niveau estimé la veille (' + prTime(A.pred) + ') : tes allures d\'entraînement vont remonter.');
    else if(sec > A.pred * 1.03 && !A.heat) L.push('📉 ' + prTime(sec - A.pred) + ' au-dessus de ton niveau estimé (' + prTime(A.pred) + ') : fatigue, affûtage ou forme du jour — à regarder dans le bilan de la prépa.');
  }
  if(!kms.length) L.push('ℹ️ Pas de temps au km (Strava) pour cette course : analyse limitée au temps final.');
  return A;
}

// course de la prépa en cours (validée, avec un temps officiel)
function raCurrent(){
  try {
    const R = typeof prepRace === 'function' ? prepRace() : {}, race = prSessions(state).filter(function(s){ return s.type === 'race' && s.done && !(s.x && s.x._season); }).pop();   // étape de « Ma saison » écartée
    if(!race) return null;
    const perf = race.perf || {}, rr = state._race_result || {}, sec = prTimeSec(rr.time || perf.official || perf.dur);
    const cat = typeof PD_CAT === 'function' ? PD_CAT(R) : rr.dist, dist = R.km || (cat && PR_RACE_M[cat] ? PR_RACE_M[cat] / 1000 : null);
    const date = perf.date || race.date || R.date, plan = state._race_plan && state._race_plan.date === R.date ? state._race_plan : null;
    let pred = null; try { const fit = prFitness(state, { today: prAddDays(date, -1) }); pred = fit && fit.preds && cat ? fit.preds[cat] : null; } catch(e) { diagSilent(e, 'race-analysis:raCurrent'); }
    return raAnalyze({ perf: perf, sec: sec, dist: dist, cat: cat, date: date, name: R.name || '', plan: plan, goal: prTimeSec((state.onboarding || {}).target_time || state.target_time), pred: pred });
  } catch(e) { console.warn('[analyse course]', e); return null; }
}
// course d'une prépa passée (copie figée) : pour son bilan
function raFromSnap(st, meta){
  try {
    const race = prSessions(st).filter(function(s){ return s.type === 'race' && s.done && !(s.x && s.x._season); }).pop(); if(!race) return null;
    const cat = meta.dist, dist = PR_RACE_M[cat] ? PR_RACE_M[cat] / 1000 : null, sec = prTimeSec(meta.result || (st._race_result || {}).time);
    const plan = st._race_plan && st._race_plan.date === meta.date ? st._race_plan : null;
    return raAnalyze({ perf: race.perf || {}, sec: sec, dist: dist, cat: cat, date: (race.perf || {}).date || race.date || meta.date, name: meta.race || meta.title || '', plan: plan, goal: prTimeSec(meta.target) });
  } catch(e) { return null; }
}
// après la validation de la course : analyse enregistrée (état + fiche de la prépa)
function raStore(){
  const A = raCurrent(); if(!A) return null;
  state._race_analysis = A; save();
  try { if(state._prep_id && typeof _prepRef === 'function' && !(typeof _prepView !== 'undefined' && _prepView)) _prepRef('prep_index/' + state._prep_id + '/ra').set(A).catch(function(){}); } catch(e) {}
  return A;
}
// carte de l'accueil : 10 jours après la course
function raHomeLine(){
  const A = state._race_analysis; if(!A || !A.date || typeof prDays !== 'function') return '';
  const d = prDays(A.date, prTodayIso()); if(d < 0 || d > 10) return '';
  _raCss();
  return '<button type="button" class="ra-home" onclick="openRaceAnalysis()"><span>' + A.verdict.e + '</span><span><b>Analyse de ta course</b><small>' + prEsc(A.time + ' · ' + A.verdict.t) + '</small></span><span aria-hidden="true">›</span></button>';
}



function _raCss(){
  if(typeof document === 'undefined' || document.getElementById('ra-css')) return;
  const st = document.createElement('style'); st.id = 'ra-css';
  st.textContent = '.ra-head{flex-shrink:0;padding:16px;border-radius:24px 24px 0 0;color:#fff;background:linear-gradient(135deg,#0B1F4D,#1B4FD8);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}'
    + '.ra-eb{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.75;margin:0;}.ra-name{font-size:15px;font-weight:700;margin:3px 0 0;opacity:.95;}'
    + '.ra-time{font-size:38px;font-weight:900;margin:2px 0 0;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}.ra-time small{font-size:14px;font-weight:700;opacity:.8;letter-spacing:0;}'
    + '.ra-x{background:rgba(255,255,255,.2);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;flex-shrink:0;}'
    + '.ra-body{padding:14px 16px 24px;display:flex;flex-direction:column;gap:12px;}'
    + '.ra-v{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:12px 14px;}.ra-v>span{font-size:28px;line-height:1;}.ra-v b{font-size:15px;color:#0F172A;}.ra-v p{margin:3px 0 0;font-size:13px;color:#334155;line-height:1.45;}'
    + '.ra-tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}.ra-t{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:1px;}'
    + '.ra-t small{font-size:10.5px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:.05em;}.ra-t b{font-size:19px;font-weight:900;color:#0F172A;font-variant-numeric:tabular-nums;}.ra-t span{font-size:12px;color:#64748B;font-variant-numeric:tabular-nums;}'
    + '.ra-t.ok{border-color:#BBF7D0;background:#F0FDF4;}.ra-t.ok span{color:#15803D;font-weight:700;}.ra-t.ko{border-color:#FED7AA;background:#FFF7ED;}.ra-t.ko span{color:#C2410C;font-weight:700;}'
    + '.ra-sec{font-size:11px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:.07em;margin:4px 2px -4px;}'
    + '.ra-card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:12px;}.ra-svg{width:100%;height:auto;display:block;}'
    + '.ra-grid{stroke:#E2E8F0;stroke-width:1;}.ra-mid{stroke:#CBD5E1;stroke-dasharray:3 3;}.ra-ax{font-size:9px;fill:#94A3B8;font-variant-numeric:tabular-nums;}'
    + '.ra-plan{fill:none;stroke:#94A3B8;stroke-width:1.6;stroke-dasharray:5 4;}.ra-real{fill:none;stroke:#1B4FD8;stroke-width:2.4;stroke-linejoin:round;}.ra-dot{fill:#1B4FD8;}.ra-dot.bad{fill:#EA580C;}'
    + '.ra-leg{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:#64748B;margin:6px 0 0;}.ra-leg span{display:inline-block;width:14px;height:3px;border-radius:2px;margin-left:6px;}.ra-leg .r{background:#1B4FD8;margin-left:0;}.ra-leg .p{background:repeating-linear-gradient(90deg,#94A3B8 0 4px,transparent 4px 7px);}.ra-leg .m{background:#CBD5E1;}'
    + '.ra-les{display:flex;flex-direction:column;gap:8px;}.ra-les p{margin:0;font-size:13px;color:#1E293B;line-height:1.5;}.ra-n{font-size:12px;color:#475569;margin:0 2px;}'
    + '.ra-share{padding:13px;border:none;border-radius:14px;background:#1B4FD8;color:#fff;font:inherit;font-size:14px;font-weight:800;cursor:pointer;}.ra-share:focus-visible,.ra-home:focus-visible{outline:2px solid #1B4FD8;outline-offset:2px;}'
    + '.ra-home{display:flex;align-items:center;gap:10px;width:100%;margin-top:10px;padding:10px 12px;border:1.5px solid #C7D2FE;border-radius:14px;background:#EEF2FF;font:inherit;text-align:left;cursor:pointer;color:#1E1B4B;}'
    + '.ra-home>span:first-child{font-size:22px;}.ra-home>span:nth-child(2){flex:1;display:flex;flex-direction:column;}.ra-home b{font-size:13.5px;}.ra-home small{font-size:12px;color:#4338CA;}.ra-home>span:last-child{font-size:18px;color:#4338CA;}';
  document.head.appendChild(st);
}
