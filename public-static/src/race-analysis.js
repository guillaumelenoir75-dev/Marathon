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
    const R = typeof prepRace === 'function' ? prepRace() : {}, race = prSessions(state).filter(function(s){ return s.type === 'race' && s.done; }).pop();
    if(!race) return null;
    const perf = race.perf || {}, rr = state._race_result || {}, sec = prTimeSec(rr.time || perf.official || perf.dur);
    const cat = typeof PD_CAT === 'function' ? PD_CAT(R) : rr.dist, dist = R.km || (cat && PR_RACE_M[cat] ? PR_RACE_M[cat] / 1000 : null);
    const date = perf.date || race.date || R.date, plan = state._race_plan && state._race_plan.date === R.date ? state._race_plan : null;
    let pred = null; try { const fit = prFitness(state, { today: prAddDays(date, -1) }); pred = fit && fit.preds && cat ? fit.preds[cat] : null; } catch(e) {}
    return raAnalyze({ perf: perf, sec: sec, dist: dist, cat: cat, date: date, name: R.name || '', plan: plan, goal: prTimeSec((state.onboarding || {}).target_time || state.target_time), pred: pred });
  } catch(e) { console.warn('[analyse course]', e); return null; }
}
// course d'une prépa passée (copie figée) : pour son bilan
function raFromSnap(st, meta){
  try {
    const race = prSessions(st).filter(function(s){ return s.type === 'race' && s.done; }).pop(); if(!race) return null;
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

// ─── Écran ───
function _raChart(A){
  const K = A.kms; if(K.length < 3) return '';
  const W = 340, H = 150, padL = 34, padR = 8, padT = 10, padB = 22;
  const vals = K.map(function(k){ return k.pace; }).concat(K.map(function(k){ return k.plan; }).filter(Boolean));
  let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); const m = Math.max(4, (hi - lo) * 0.15); lo -= m; hi += m;
  const x = function(i){ return padL + (W - padL - padR) * (K.length === 1 ? 0.5 : i / (K.length - 1)); }, y = function(v){ return padT + (H - padT - padB) * (v - lo) / (hi - lo); };   // plus rapide en haut
  const ln = function(arr){ return arr.map(function(v, i){ return v == null ? null : (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).filter(Boolean).join(' '); };
  const ticks = [lo + m, (lo + hi) / 2, hi - m];
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ra-svg" role="img" aria-label="Allure km par km : réalisé et prévu">';
  ticks.forEach(function(t){ s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" class="ra-grid"/><text x="' + (padL - 4) + '" y="' + (y(t) + 3).toFixed(1) + '" class="ra-ax" text-anchor="end">' + prPace(t) + '</text>'; });
  if(A.halves) s += '<line x1="' + x((A.dist / 2) - 1).toFixed(1) + '" x2="' + x((A.dist / 2) - 1).toFixed(1) + '" y1="' + padT + '" y2="' + (H - padB) + '" class="ra-mid"/>';
  if(K.some(function(k){ return k.plan; })) s += '<path d="' + ln(K.map(function(k){ return k.plan; })) + '" class="ra-plan"/>';
  s += '<path d="' + ln(K.map(function(k){ return k.pace; })) + '" class="ra-real"/>';
  K.forEach(function(k, i){ const bad = A.fade && k.km >= A.fade.km; s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(k.pace).toFixed(1) + '" r="2.6" class="' + (bad ? 'ra-dot bad' : 'ra-dot') + '"/>'; });
  [0, Math.floor((K.length - 1) / 2), K.length - 1].forEach(function(i, j){ s += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" class="ra-ax" text-anchor="' + ['start', 'middle', 'end'][j] + '">km ' + K[i].km + '</text>'; });
  return s + '</svg><p class="ra-leg"><span class="r"></span>ton allure' + (K.some(function(k){ return k.plan; }) ? ' <span class="p"></span>plan de course' : '') + (A.halves ? ' <span class="m"></span>mi-course' : '') + '</p>';
}
function openRaceAnalysis(A){
  A = A || state._race_analysis || raCurrent();
  if(!A){ alert('Valide ta course avec son temps officiel pour obtenir son analyse.'); return; }
  _raCss(); window._raShown = A;
  const old = document.getElementById('ra-modal'); if(old) old.remove();
  const tile = function(l, v, s, cls){ return '<div class="ra-t ' + (cls || '') + '"><small>' + l + '</small><b>' + v + '</b>' + (s ? '<span>' + s + '</span>' : '') + '</div>'; };
  const tiles = [];
  if(A.target) tiles.push(tile(A.target.src === 'plan' ? 'Plan de course' : 'Objectif', prTime(A.target.sec), (A.delta <= 0 ? '−' : '+') + prTime(Math.abs(A.delta)), A.delta <= 0 ? 'ok' : 'ko'));
  if(A.pred) tiles.push(tile('Niveau la veille', prTime(A.pred), (A.predDelta <= 0 ? '−' : '+') + prTime(Math.abs(A.predDelta)), A.predDelta <= 0 ? 'ok' : A.predDelta > A.pred * 0.02 ? 'ko' : ''));
  if(A.start) tiles.push(tile('Départ (' + A.start.n + ' km)', prPace(A.start.pace) + '/km', (A.start.refSrc === 'plan' ? 'prévu ' : 'moy. ') + prPace(A.start.ref), A.start.pct <= -2 ? 'ko' : 'ok'));
  if(A.halves) tiles.push(tile('2e moitié', (A.halves.pct > 0 ? '+' : '') + String(A.halves.pct).replace('.', ',') + ' %', prPace(A.halves.p1) + ' → ' + prPace(A.halves.p2), A.pacing === 'fade' ? 'ko' : A.pacing === 'positive' ? '' : 'ok'));
  if(A.drift) tiles.push(tile('Dérive cardio', String(A.drift.pct).replace('.', ',') + ' %', 'FC ' + A.drift.fc1 + ' → ' + A.drift.fc2, A.drift.pct >= 8 ? 'ko' : A.drift.pct <= 4 ? 'ok' : ''));
  if(A.heat) tiles.push(tile('Météo', '+' + String(A.heat.pct).replace('.', ',') + ' %', A.heat.why || '', 'ko'));
  const d = A.date ? new Date(A.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ra-modal'; ov.style.zIndex = '495'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;"><div class="ra-head"><div><p class="ra-eb">Analyse de course' + (d ? ' · ' + d : '') + '</p><p class="ra-name">' + prEsc(A.name || A.cat) + '</p>'
    + '<p class="ra-time">' + A.time + '<small> · ' + prPace(A.avg) + '/km</small></p></div><button class="ra-x" onclick="document.getElementById(\'ra-modal\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F7FB;"><div class="ra-body">'
    + '<div class="ra-v"><span>' + A.verdict.e + '</span><div><b>' + prEsc(A.verdict.t) + '</b><p>' + prEsc(A.verdict.s) + '</p></div></div>'
    + (tiles.length ? '<div class="ra-tiles">' + tiles.join('') + '</div>' : '')
    + (A.kms.length >= 3 ? '<p class="ra-sec">Allure km par km</p><div class="ra-card">' + _raChart(A) + '</div>' : '')
    + (A.lessons.length ? '<p class="ra-sec">Ce que tu en retiens</p><div class="ra-card ra-les">' + A.lessons.map(function(l){ return '<p>' + prEsc(l) + '</p>'; }).join('') + '</div>' : '')
    + (A.startAdvice === 'slower' ? '<p class="ra-n">Retenu dans ta recette : ton prochain plan de course partira un peu plus prudemment.</p>' : '')
    + '<button type="button" class="ra-share" onclick="raShare()">📤 Partager mon bilan</button>'
    + '</div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

// ─── Bilan à partager (image 1080 × 1350) ───
function raDraw(A, cv){
  cv.width = 1080; cv.height = 1350; const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, '#0B1F4D'); g.addColorStop(1, '#1B4FD8'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1350);
  c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '700 34px system-ui, -apple-system, sans-serif'; c.fillText(((A.name || A.cat) + (A.date ? ' · ' + new Date(A.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')).slice(0, 52), 80, 130);
  c.fillStyle = '#fff'; c.font = '900 190px system-ui, -apple-system, sans-serif'; c.fillText(A.time, 74, 330);
  c.font = '600 40px system-ui, -apple-system, sans-serif'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText(prPace(A.avg) + '/km' + (A.target ? '   ·   ' + (A.target.src === 'plan' ? 'plan ' : 'objectif ') + prTime(A.target.sec) : ''), 80, 400);
  c.fillStyle = '#fff'; c.font = '800 54px system-ui, -apple-system, sans-serif'; c.fillText(A.verdict.e + ' ' + A.verdict.t, 80, 510);
  // allure km par km : barres (plus haute = plus rapide)
  const K = A.kms;
  if(K.length >= 3){
    const x0 = 80, x1 = 1000, yb = 1010, hMax = 380, ps = K.map(function(k){ return k.pace; }), lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps), bw = (x1 - x0) / K.length;
    K.forEach(function(k, i){ const h = 120 + (hMax - 120) * (hi === lo ? 0.5 : (hi - k.pace) / (hi - lo)); c.fillStyle = A.fade && k.km >= A.fade.km ? '#FDBA74' : 'rgba(255,255,255,.9)'; c.fillRect(x0 + i * bw + bw * 0.15, yb - h, bw * 0.7, h); });
    c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '600 30px system-ui, -apple-system, sans-serif'; c.fillText('Allure km par km', 80, yb - hMax - 30);
    c.fillText('km 1', 80, yb + 44); c.textAlign = 'right'; c.fillText('km ' + K[K.length - 1].km, 1000, yb + 44); c.textAlign = 'left';
  }
  c.font = '600 36px system-ui, -apple-system, sans-serif'; c.fillStyle = '#fff';
  const facts = [];
  if(A.halves) facts.push('2e moitié ' + (A.halves.pct > 0 ? '+' : '') + String(A.halves.pct).replace('.', ',') + ' %');
  if(A.drift) facts.push('dérive cardio ' + String(A.drift.pct).replace('.', ',') + ' %');
  if(A.heat) facts.push(A.heat.why);
  c.fillText(facts.join('   ·   ').slice(0, 60), 80, 1150);
  c.fillStyle = 'rgba(255,255,255,.55)'; c.font = '600 28px system-ui, -apple-system, sans-serif'; c.fillText('Plan Marathon', 80, 1270);
  return cv;
}
function raShare(){
  const A = window._raShown || state._race_analysis; if(!A || typeof document === 'undefined') return;
  const cv = raDraw(A, document.createElement('canvas'));
  cv.toBlob(function(b){
    if(!b) return;
    const f = new File([b], 'course-' + (A.date || 'bilan') + '.png', { type: 'image/png' });
    if(navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: 'Ma course', text: (A.name || A.cat) + ' : ' + A.time + ' 🏁' }).catch(function(){});
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); }
  }, 'image/png');
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
