// Plan › « MAJ le plan » : le plan s'adapte aux résultats.
// 1. Niveau actuel (équivalent VDOT, Jack Daniels) d'après les records et courses datés, puis les blocs
//    tempo / fractionné validés (allure par bloc + FC).
// 2. Allures cibles de chaque séance à venir selon son intention (seuil, fractionné, allure course, EF)
//    → propositions de nouvelles consignes quand l'écart est sensible.
// 3. Contrôles du plan (progression du volume, sortie longue, séances dures enchaînées, récupération, affûtage).
// 4. Avis du Coach IA (admin, fonction planReview) qui relit tout et peut proposer d'autres modifications.
// Rien n'est modifié sans validation : chaque proposition se coche, puis « Appliquer ».

// ─── VDOT (formules de Jack Daniels) ────────────────────────────────────────
const PR_RACE_M = { '5 km': 5000, '10 km': 10000, 'Semi-marathon': 21097.5, 'Marathon': 42195 };
const PR_RECORD_KEY = { '5 km': 'record_5km', '10 km': 'record_10km', 'Semi-marathon': 'record_semi', 'Marathon': 'record_marathon' };
function vdotFromRace(meters, sec){
  const t = sec / 60, v = meters / t;
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return vo2 / pct;
}
// allure (s/km) correspondant à un pourcentage de VDOT
function paceAtPct(vdot, pct){
  const vo2 = vdot * pct, a = 0.000104, b = 0.182258, c = -(4.6 + vo2);
  const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);                 // m/min
  return 60000 / v;
}
// VDOT pour lequel l'allure au pourcentage donné vaut paceSec
function vdotFromPaceAt(paceSec, pct){ const v = 60000 / paceSec; return (-4.6 + 0.182258 * v + 0.000104 * v * v) / pct; }
function raceTimeFromVdot(vdot, meters){
  let lo = meters / 1000 * 120, hi = meters / 1000 * 600;                 // 2'00 à 10'00 /km
  for(let i = 0; i < 60; i++){ const m = (lo + hi) / 2; if(vdotFromRace(meters, m) > vdot) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const prPace = function(s){ s = Math.round(s); return Math.floor(s / 60) + "'" + String(s % 60).padStart(2, '0'); };
const prTime = function(s){ s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const prParsePace = function(m, s){ return +m * 60 + +s; };
const prDays = function(a, b){ return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); };
const prTodayIso = function(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const prTimeSec = function(t){
  const p = String(t || '').trim().replace(/\s/g, '').replace(/[’'h]/g, ':').replace(/"$/, '').split(':').filter(function(x){ return x !== ''; }).map(Number);
  if(!p.length || p.some(isNaN)) return null;
  const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null;
  return s > 0 ? s : null;
};

// ─── Séances du programme ───────────────────────────────────────────────────
// pace : 1re allure suivie de « /km » dans la consigne (plage « 4'18 — 4'22 /km » ou allure seule « 5'50/km »)
const PR_PACE_RE = /(\d{1,2})['’:](\d{2})(?:\s*[—–-]\s*(\d{1,2})['’:](\d{2}))?\s*\/\s*km/;
function prSessions(st, opt){
  opt = opt || {};
  const out = [], start = st.plan_start_date ? new Date(String(st.plan_start_date).slice(0, 10) + 'T12:00:00') : null;
  for(let w = 1, empty = 0; w <= 60 && empty < 5; w++){
    let any = false;
    for(let ei = 0; ei <= 50 && st['extra_w' + w + '_s' + ei] !== undefined; ei++){
      any = true;
      const k = 'extra_w' + w + '_s' + ei; let x = {}, perf = {};
      try { x = JSON.parse(st[k]) || {}; } catch(e) { continue; }
      try { perf = JSON.parse(st[k + '_perf'] || '{}') || {}; } catch(e) {}
      let date = x.sched_date || null;
      if(!date && start && x.sched_day){ const d = new Date(start); d.setDate(d.getDate() + (w - 1) * 7 + (+x.sched_day - 1)); date = prIso(d); }
      const parts = String(x.d || '').split('|'), det = parts.slice(1).join('|');
      const pm = det.match(PR_PACE_RE);
      let pace = null;
      if(pm){ const a = prParsePace(pm[1], pm[2]), b = pm[3] ? prParsePace(pm[3], pm[4]) : a; pace = { lo: Math.min(a, b), hi: Math.max(a, b), range: !!pm[3], text: pm[0] }; }
      const done = !!(st[k + '_done'] || st[k + '_km'] != null);
      out.push({ key: k, w: w, ei: ei, x: x, perf: perf, date: date, title: parts[0], detail: det, pace: pace, done: done,
        km: done && parseFloat(st[k + '_km']) > 0 ? parseFloat(st[k + '_km']) : parseFloat(x.km) || 0, kmPlan: parseFloat(x.km) || 0, type: x.type });
    }
    if(!any) empty++; else empty = 0;
  }
  return out;
}
function prIso(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
// intention d'une séance de qualité : race (allure course), T (seuil), I (fractionné VMA), R (vitesse)
function prIntent(s){
  const t = (s.title + ' ' + s.detail).toLowerCase();
  if(s.type === 'race') return 'race';
  if(s.type === 'ef' || s.type === 'long' || s.type === 'rest') return s.type === 'rest' ? null : 'E';
  if(/as21|as10|as42|allure semi|allure 10|allure marathon|allure course|allure objectif|\bam\b/.test(t)) return 'race';
  const mm = t.match(/(\d+)\s*[×x]\s*(\d[\d\s]*?)\s*m\b/), mn = t.match(/(\d+)\s*[×x]\s*(\d+(?:[,.]\d+)?)\s*min/);
  const repM = mm ? parseInt(mm[2].replace(/\s/g, '')) : null, repMin = mn ? parseFloat(mn[2].replace(',', '.')) : null;
  if(/tempo|seuil/.test(t) || (repM && repM >= 2000) || (repMin && repMin >= 6)) return 'T';
  if((repM && repM <= 400) || (repMin && repMin <= 1)) return 'R';
  if((repM && repM <= 1600) || (repMin && repMin <= 5)) return 'I';
  return 'T';
}

// ─── Niveau actuel ──────────────────────────────────────────────────────────
// sources : records datés (state._records), résultats des prépas enregistrées, course de la prépa en cours,
// blocs tempo / fractionné des 8 dernières semaines (allure par bloc et FC). Retourne aussi le détail des sources.
function prFitness(st, opt){
  opt = opt || {};
  const today = opt.today || prTodayIso(), hrMax = parseInt(st.fc_max) || parseInt((st.onboarding || {}).fc_max) || 196;
  const meta = st._records || {}, src = [];
  const addRace = function(cat, time, date, label){
    const m = PR_RACE_M[cat], sec = prTimeSec(time); if(!m || !sec) return;
    let v = vdotFromRace(m, sec), age = date ? prDays(date, today) : null, note = '';
    if(age === null){ v -= 1; note = 'date inconnue'; }                       // sans date : un peu de prudence
    else if(age > 540) return;                                                 // plus de 18 mois : ignoré
    else if(age > 180){ v -= (age - 180) / 90; note = 'il y a ' + Math.round(age / 30) + ' mois'; }
    if(cat === 'Marathon') v += 0.8;                                           // le marathon sous-estime le niveau (fatigue de fin de course)
    src.push({ kind: 'course', cat: cat, label: label || cat, time: prTime(sec), date: date || null, vdot: v, note: note });
  };
  Object.keys(PR_RECORD_KEY).forEach(function(cat){ if(st[PR_RECORD_KEY[cat]]) addRace(cat, st[PR_RECORD_KEY[cat]], (meta[cat] || {}).date, 'Record ' + (cat === 'Semi-marathon' ? 'semi' : cat.toLowerCase())); });
  (opt.races || []).forEach(function(r){ if(PR_RACE_M[r.cat]) addRace(r.cat, r.time, r.date, r.label); });
  // blocs de qualité récents
  const sess = prSessions(st), recent = [];
  sess.forEach(function(s){
    if(!s.done || !s.date || prDays(s.date, today) > 56 || prDays(s.date, today) < 0) return;
    const it = prIntent(s); if(it !== 'T' && it !== 'I' && it !== 'race') return;
    const bl = (s.perf.blocsAllure || []).map(function(b){ const m = String(b).match(/(\d{1,2})['’:](\d{2})/); return m ? prParsePace(m[1], m[2]) : null; }).filter(Boolean);
    if(bl.length < 2) return;
    const avg = bl.reduce(function(a, b){ return a + b; }, 0) / bl.length, hr = parseInt(s.perf.hr) || null;
    // seuil ≈ 88 % VDOT, fractionné ≈ 97,5 % ; FC moyenne de séance basse = effort contenu (marge)
    const pct = it === 'I' ? 0.975 : it === 'race' ? 0.9 : 0.88;
    let v = vdotFromPaceAt(avg, pct);
    if(hr && hr > 0.93 * hrMax) v -= 0.8;
    recent.push({ kind: 'séance', label: s.title, date: s.date, pace: prPace(avg), hr: hr, vdot: v });
  });
  src.push.apply(src, recent);
  const races = src.filter(function(x){ return x.kind === 'course'; }), sesV = recent.map(function(x){ return x.vdot; }).sort(function(a, b){ return a - b; });
  const raceBest = races.length ? Math.max.apply(null, races.map(function(x){ return x.vdot; })) : null;
  const sesMed = sesV.length >= 2 ? sesV[Math.floor(sesV.length / 2)] : null;
  let vdot = raceBest, basis = 'courses';
  if(sesMed && (!vdot || sesMed > vdot)){ vdot = raceBest ? Math.min(sesMed, raceBest + 2) : sesMed; basis = 'séances récentes'; }
  if(!vdot && st.vo2max_current){ vdot = parseFloat(st.vo2max_current) * 0.9; basis = 'VO2max montre'; }
  if(!vdot) return { vdot: null, sources: src, hrMax: hrMax };
  vdot = Math.round(vdot * 10) / 10;
  const paces = { T: paceAtPct(vdot, 0.88), I: paceAtPct(vdot, 0.975), R: paceAtPct(vdot, 1.05), E: [paceAtPct(vdot, 0.70), paceAtPct(vdot, 0.62)] };
  const preds = {}; Object.keys(PR_RACE_M).forEach(function(c){ preds[c] = raceTimeFromVdot(vdot, PR_RACE_M[c]); });
  return { vdot: vdot, basis: basis, paces: paces, preds: preds, sources: src, hrMax: hrMax };
}

// ─── Propositions d'allures ─────────────────────────────────────────────────
// Le plan garde ses intentions : on déduit le niveau pour lequel il a été écrit (VDOT médian implicite de ses
// séances seuil / fractionné), puis chaque séance garde son intensité relative et suit l'écart avec ton niveau
// actuel. Allure course : objectif de la prépa, sans dépasser de plus de 2 % ton allure course actuelle,
// réévaluée seulement à moins de 6 semaines de la séance.
const PR_PCT = { T: 0.88, I: 0.975, R: 1.05 };
const prVo2 = function(paceSec){ const v = 60000 / paceSec; return -4.6 + 0.182258 * v + 0.000104 * v * v; };
function prPlanVdot(st){
  const v = [];
  prSessions(st).forEach(function(s){ const it = prIntent(s); if(s.pace && PR_PCT[it]) v.push(prVo2((s.pace.lo + s.pace.hi) / 2) / PR_PCT[it]); });
  if(!v.length) return null;
  v.sort(function(a, b){ return a - b; });
  return v[Math.floor(v.length / 2)];
}
function prPaceProposals(st, fit, opt){
  opt = opt || {};
  if(!fit || !fit.vdot) return [];
  const today = opt.today || prTodayIso(), out = [];
  const raceM = PR_RACE_M[opt.raceCat] || null, curRace = raceM ? fit.preds[opt.raceCat] / (raceM / 1000) : null;
  const goalPace = raceM && opt.goalSec ? opt.goalSec / (raceM / 1000) : null;
  const racePace = curRace ? (goalPace ? Math.max(goalPace, curRace * 0.98) : curRace) : null;
  const vPlan = prPlanVdot(st), efObs = opt.efPace || null;
  prSessions(st).forEach(function(s){
    if(s.done || !s.pace || (s.date && s.date < today)) return;
    const it = prIntent(s); if(!it) return;
    const mid = (s.pace.lo + s.pace.hi) / 2, half = Math.max(2, (s.pace.hi - s.pace.lo) / 2);
    let nmid, why;
    if(it === 'E'){
      // EF : uniquement si ton allure EF réelle (FC ≤ 148) sort nettement de la plage ; jamais les footings « très facile »
      if(!efObs || opt.postRace || /très facile|récup/i.test(s.title + ' ' + s.detail)) return;
      if(efObs >= s.pace.lo - 10 && efObs <= s.pace.hi + 10) return;
      nmid = efObs + (s.pace.hi - s.pace.lo) / 2 - 5; why = 'ton allure EF réelle (FC ≤ 148) est ' + prPace(efObs) + '/km';
    } else if(it === 'race'){
      if(!racePace || s.type === 'race' || (s.date && prDays(today, s.date) > 42)) return;
      nmid = racePace;
      why = goalPace && racePace > goalPace + 1 ? 'allure course réaliste aujourd\'hui (niveau actuel ' + prPace(curRace) + '/km), l\'objectif ' + prPace(goalPace) + ' viendra avec la forme' : 'allure de ton objectif (' + prPace(goalPace || racePace) + '/km)';
    } else {
      if(!vPlan) return;
      const pct = prVo2(mid) / vPlan;                         // intensité relative voulue par le plan
      nmid = paceAtPct(fit.vdot, pct);
      why = 'ton niveau a évolué (équivalent VDOT ' + fit.vdot.toFixed(1).replace('.', ',') + ' contre ' + vPlan.toFixed(1).replace('.', ',') + ' prévu par le plan) : même intensité, allure ajustée';
    }
    if(Math.abs(mid - nmid) < 4) return;                                       // écart < 4 s/km : on laisse
    let capped = false;
    if(nmid < mid - 10){ nmid = mid - 10; capped = true; }                     // progression prudente : 10 s/km au plus par mise à jour
    const lo = nmid - half, hi = nmid + half;
    const txt = s.pace.range ? prPace(lo) + ' — ' + prPace(hi) + ' /km' : prPace(nmid) + '/km';
    let det = s.detail.replace(s.pace.text, txt);
    // temps par répétition entre parenthèses « (3'28 — 3'36) » : recalculés
    const rep = (s.title + ' ' + s.detail).match(/(\d+)\s*[×x]\s*(\d[\d\s]*?)\s*m\b/), repM = rep ? parseInt(rep[2].replace(/\s/g, '')) : null;
    if(repM) det = det.replace(/\((\d{1,2})['’](\d{2})\s*[—–-]\s*(\d{1,2})['’](\d{2})\)/, '(' + prPace(lo * repM / 1000) + ' — ' + prPace(hi * repM / 1000) + ')');
    const d = Math.round(nmid - mid);
    if(d < 0 && opt.postRaceUntil && s.date && s.date <= opt.postRaceUntil) return;   // période post-course : on n'accélère pas
    out.push({ key: s.key, w: s.w, date: s.date, field: 'detail', title: s.title, type: s.type, before: s.detail, after: det, intent: it, delta: d,
      reason: (d < 0 ? 'Plus rapide de ' + (-d) : 'Plus lent de ' + d) + ' s/km : ' + why + (capped ? ' (ajustement limité à 10 s/km par mise à jour, la suite viendra aux prochaines)' : '') + '.', src: 'calcul' });
  });
  return out;
}

// ─── Contrôles du plan ──────────────────────────────────────────────────────
function prChecks(st, fit, opt){
  opt = opt || {};
  const sess = prSessions(st), weeks = {}, warn = [];
  sess.forEach(function(s){ (weeks[s.w] = weeks[s.w] || []).push(s); });
  const W = Object.keys(weeks).map(Number).sort(function(a, b){ return a - b; });
  const meta = function(w){ try { return JSON.parse(st['meta_w' + w] || '{}') || {}; } catch(e) { return {}; } };
  const vol = function(w){ return (weeks[w] || []).filter(function(s){ return s.type !== 'race'; }).reduce(function(a, s){ return a + s.kmPlan; }, 0); };
  const wdate = function(w){ const d = (weeks[w] || []).map(function(s){ return s.date; }).filter(Boolean).sort()[0]; return d ? ' (' + d.slice(8, 10) + '/' + d.slice(5, 7) + ')' : ''; };
  let build = 0;
  W.forEach(function(w, i){
    const m = meta(w), v = vol(w);
    const prev = W[i - 1] ? vol(W[i - 1]) : 0, prevRecov = W[i - 1] && meta(W[i - 1]).isRecov;
    const prevMax = Math.max.apply(null, [W[i - 2], W[i - 3]].filter(Boolean).map(vol).concat([0]));   // pic avant la semaine allégée
    if(prev > 0 && !prevRecov && v > prev * 1.15 && v - prev > 4 && !m.isTaper)
      warn.push({ w: w, level: v > prev * 1.2 ? 'warn' : 'info', text: 'S' + w + wdate(w) + ' : volume +' + Math.round((v / prev - 1) * 100) + ' % (' + Math.round(prev) + ' → ' + Math.round(v) + ' km), au-delà des +10-15 % conseillés.' });
    if(prevRecov && prevMax > 0 && v > prevMax * 1.12 && v - prevMax > 4)
      warn.push({ w: w, level: 'warn', text: 'S' + w + wdate(w) + ' : après la semaine allégée, ' + Math.round(v) + ' km dépasse de ' + Math.round((v / prevMax - 1) * 100) + ' % le dernier pic (' + Math.round(prevMax) + ' km).' });
    const lr = (weeks[w] || []).filter(function(s){ return s.type === 'long'; }).sort(function(a, b){ return b.kmPlan - a.kmPlan; })[0];
    if(lr && v > 0 && lr.kmPlan / v > 0.4 && v >= 20) warn.push({ w: w, level: 'info', text: 'S' + w + wdate(w) + ' : la sortie longue fait ' + Math.round(lr.kmPlan / v * 100) + ' % du volume de la semaine (au-delà de 35-40 %).' });
    const lrPrev = W[i - 1] ? (weeks[W[i - 1]] || []).filter(function(s){ return s.type === 'long'; }).reduce(function(a, s){ return Math.max(a, s.kmPlan); }, 0) : 0;
    if(lr && lrPrev && lr.kmPlan - lrPrev > 3 && lr.kmPlan > lrPrev * 1.2) warn.push({ w: w, level: 'info', text: 'S' + w + wdate(w) + ' : sortie longue +' + Math.round(lr.kmPlan - lrPrev) + ' km d\'un coup (' + lrPrev + ' → ' + lr.kmPlan + ' km).' });
    // séances dures enchaînées (qualité / longue / course sur deux jours consécutifs)
    const hard = (weeks[w] || []).concat(weeks[W[i + 1]] || []).filter(function(s){ return s.date && (s.type === 'tempo' || s.type === 'frac' || s.type === 'long' || s.type === 'race'); }).sort(function(a, b){ return a.date.localeCompare(b.date); });
    for(let j = 1; j < hard.length; j++) if(hard[j].w === w || hard[j - 1].w === w){
      if(prDays(hard[j - 1].date, hard[j].date) === 1 && hard[j - 1].w === w && !(hard[j - 1].type === 'long' && hard[j].type === 'long'))
        warn.push({ w: w, level: 'warn', text: hard[j - 1].date.slice(8, 10) + '/' + hard[j - 1].date.slice(5, 7) + ' et ' + hard[j].date.slice(8, 10) + '/' + hard[j].date.slice(5, 7) + ' : deux séances exigeantes d\'affilée (' + hard[j - 1].title + ' puis ' + hard[j].title + ').' });
    }
    // semaines de construction sans allègement
    if(m.isRecov || m.isTaper) build = 0; else if(v > 0) build++;
    if(build === 5) warn.push({ w: w, level: 'info', text: 'S' + w + wdate(w) + ' : 5e semaine de charge d\'affilée sans semaine allégée.' });
    // séance de qualité sans allure
    (weeks[w] || []).forEach(function(s){ if((s.type === 'tempo' || s.type === 'frac') && !s.pace && !s.done) warn.push({ w: w, level: 'info', text: 'S' + w + ' · ' + s.title + ' : aucune allure indiquée dans la consigne.' }); });
  });
  // affûtage : volume des deux dernières semaines vs pic
  const peak = Math.max.apply(null, W.map(vol).concat([0])), last = W[W.length - 1], before = W[W.length - 2];
  if(peak > 0 && before && vol(before) > peak * 0.85 && W.length >= 6) warn.push({ w: before, level: 'warn', text: 'Affûtage : S' + before + ' garde ' + Math.round(vol(before) / peak * 100) + ' % du volume du pic (' + Math.round(peak) + ' km) ; viser 60-75 %.' });
  // allure course trop ambitieuse pour le niveau actuel
  if(fit && fit.vdot && opt.raceCat && opt.goalSec && PR_RACE_M[opt.raceCat]){
    const cur = fit.preds[opt.raceCat], gap = (cur - opt.goalSec) / opt.goalSec;
    if(gap > 0.03) warn.push({ w: null, level: 'info', text: 'Objectif ' + prTime(opt.goalSec) + ' : ton niveau actuel donne ' + prTime(cur) + ' (' + Math.round(gap * 100) + ' % d\'écart). Les séances à allure course sont calées un peu au-dessus de ton allure actuelle et se rapprocheront de l\'objectif à chaque mise à jour.' });
  }
  return warn;
}

// ════════════════════════════════════════════════════════════════════════════
// Application (navigateur)
// ════════════════════════════════════════════════════════════════════════════
const PR_CATS = ['5 km', '10 km', 'Semi-marathon', 'Marathon'];
const prCatLabel = function(c){ return c === 'Semi-marathon' ? 'Semi' : c === 'Marathon' ? 'Marathon' : c; };
const prEsc = function(x){ return String(x == null ? '' : x).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
const prFmtDate = function(d, o){ return d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', o || { day: 'numeric', month: 'short' }) : ''; };

// courses connues : fiches « Mes prépas » (résultat + distance) et course de la prépa en cours
function prKnownRaces(){
  const out = [], idx = (typeof _prepIndex !== 'undefined' && _prepIndex) || {};
  Object.keys(idx).forEach(function(k){ const p = idx[k]; if(p && p.result && p.date && PR_RACE_M[p.dist]) out.push({ cat: p.dist, time: p.result, date: p.date, label: p.race || p.title }); });
  const rr = state._race_result; if(rr && rr.time && PR_RACE_M[rr.dist]) out.push({ cat: rr.dist, time: rr.time, date: rr.date, label: (typeof prepRace === 'function' ? prepRace().name : 'Course') });
  return out;
}
// allure EF réelle : médiane des 5 dernières sorties EF / longues à FC ≤ 148 (6 dernières semaines)
function prObservedEf(st, today){
  const v = prSessions(st).filter(function(s){ return s.done && (s.type === 'ef' || s.type === 'long') && s.date && prDays(s.date, today) <= 42 && s.perf.pace && parseInt(s.perf.hr) && parseInt(s.perf.hr) <= 148; })
    .sort(function(a, b){ return b.date.localeCompare(a.date); }).slice(0, 5)
    .map(function(s){ const m = String(s.perf.pace).match(/(\d{1,2})['’:](\d{2})/); return m ? prParsePace(m[1], m[2]) : null; }).filter(Boolean).sort(function(a, b){ return a - b; });
  return v.length >= 2 ? v[Math.floor(v.length / 2)] : null;
}
// analyse complète de la prépa affichée (en cours, ou à venir ouverte avec « Voir et modifier »)
function prAnalyze(){
  const today = prTodayIso(), R = typeof prepRace === 'function' ? prepRace() : {};
  const raceCat = PR_RACE_M[R.course] ? R.course : (R.km ? (Math.abs(R.km - 21.1) < 0.6 ? 'Semi-marathon' : Math.abs(R.km - 42.2) < 0.6 ? 'Marathon' : Math.abs(R.km - 10) < 0.6 ? '10 km' : Math.abs(R.km - 5) < 0.6 ? '5 km' : null) : null);
  const goalSec = prTimeSec(state.target_time || (state.onboarding || {}).target_time);
  const races = prKnownRaces(), fit = prFitness(state, { today: today, races: races });
  // période post-course : dernière course connue (≈ 1 jour par mile)
  const REC = { 'Marathon': 26, 'Semi-marathon': 13, '10 km': 6, '5 km': 3 };
  const last = races.concat(Object.keys(PR_RECORD_KEY).map(function(c){ const m = (state._records || {})[c]; return m && m.date ? { cat: c, date: m.date } : null; }).filter(Boolean))
    .filter(function(r){ return r.date && r.date <= today; }).sort(function(a, b){ return b.date.localeCompare(a.date); })[0];
  let postRaceUntil = null;
  if(last && REC[last.cat]){ const d = new Date(last.date + 'T12:00:00'); d.setDate(d.getDate() + REC[last.cat]); postRaceUntil = prIso(d); if(postRaceUntil < today) postRaceUntil = null; }
  const opt = { today: today, raceCat: raceCat, goalSec: goalSec, efPace: prObservedEf(state, today), postRace: !!postRaceUntil, postRaceUntil: postRaceUntil };
  return { fit: fit, opt: opt, race: R, proposals: prPaceProposals(state, fit, opt), warnings: prChecks(state, fit, opt), planVdot: prPlanVdot(state) };
}
const prSig = function(list){ return list.map(function(p){ return p.key + '>' + p.after; }).join('|'); };
// pastille sur le bouton « MAJ le plan » : propositions pas encore vues
function planReviewPending(){
  try { if(typeof usesHardPlan === 'function' && usesHardPlan()) return 0; const a = prAnalyze(); return a.proposals.length && prSig(a.proposals) !== state._review_seen ? a.proposals.length : 0; } catch(e) { return 0; }
}

// ─── Mes records ────────────────────────────────────────────────────────────
function openRecordsModal(onDone){
  _prCss();
  const meta = state._records || {}, mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'records-modal'; ov.style.zIndex = '720'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  const best = function(c){ return typeof prepBestTime === 'function' ? prepBestTime(c) : null; };
  ov.innerHTML = '<div class="modal-box"><div class="pr-head"><div><p class="pr-eb">Entraînement</p><p class="pr-title">🏆 Mes records</p></div><button class="pr-x" onclick="document.getElementById(\'records-modal\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body"><div style="padding:14px 16px 20px;display:flex;flex-direction:column;gap:10px;">'
    + '<p class="pr-note">Tes records servent à calculer ton niveau actuel et les allures de ton plan. Indique la date : un record ancien compte moins.</p>'
    + PR_CATS.map(function(c, i){
        const k = PR_RECORD_KEY[c], m = meta[c] || {}, b = best(c), v = state[k] || '';
        return '<div class="pr-card"><div class="pr-rec-top"><b>' + prCatLabel(c) + '</b>' + (!v && b ? '<button type="button" class="pr-link" onclick="document.getElementById(\'rec-t-' + i + '\').value=\'' + b.time + '\'">Reprendre ' + b.time + '</button>' : '') + '</div>'
          + '<div class="pr-rec-row"><label>Temps<input id="rec-t-' + i + '" inputmode="numeric" placeholder="' + ['20:30', '42:30', '1:35:00', '3:30:00'][i] + '" value="' + prEsc(v) + '"></label>'
          + '<label>Date<input id="rec-d-' + i + '" type="date" value="' + prEsc(m.date || '') + '"></label></div>'
          + '<label class="pr-full">Course<input id="rec-r-' + i + '" placeholder="ex. Semi de Paris" value="' + prEsc(m.race || '') + '"></label></div>';
      }).join('')
    + '<button type="button" class="pr-btn pri" onclick="saveRecordsModal()">Enregistrer mes records</button></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
  window._recordsDone = onDone || null;
}
function saveRecordsModal(){
  const meta = Object.assign({}, state._records || {}), up = {};
  for(let i = 0; i < PR_CATS.length; i++){
    const c = PR_CATS[i], k = PR_RECORD_KEY[c], raw = document.getElementById('rec-t-' + i).value.trim();
    const sec = raw ? prTimeSec(raw) : null, km = PR_RACE_M[c] / 1000;
    if(raw && (!sec || sec / km < 150 || sec / km > 600)){ alert(prCatLabel(c) + ' : temps invalide (ex. ' + (i < 2 ? '42:30' : '1:35:00') + ').'); return; }
    up[k] = sec ? prTime(sec) : null;
    const d = document.getElementById('rec-d-' + i).value, r = document.getElementById('rec-r-' + i).value.trim();
    if(sec) meta[c] = { date: d || null, race: r || null }; else delete meta[c];
  }
  Object.keys(up).forEach(function(k){ if(up[k]) state[k] = up[k]; else delete state[k]; });
  state._records = meta;
  save();
  const ov = document.getElementById('records-modal'); if(ov) ov.remove();
  renderRecordsRow();
  if(typeof showToast === 'function') showToast('Records enregistrés 🏆');
  if(typeof window._recordsDone === 'function') window._recordsDone();
}
function renderRecordsRow(){
  const el = document.getElementById('records-sub'); if(!el) return;
  const t = PR_CATS.filter(function(c){ return state[PR_RECORD_KEY[c]]; }).map(function(c){ return prCatLabel(c).toLowerCase() + ' ' + state[PR_RECORD_KEY[c]]; });
  el.textContent = t.length ? t.join(' · ') : '5 km, 10 km, semi, marathon';
}

// ─── Fenêtre « Mise à jour du plan » ────────────────────────────────────────
let _prReview = null;               // { a: analyse, items: propositions affichées, coach: avis du Coach }
const PR_CSS = '.pr-head{flex-shrink:0;background:linear-gradient(135deg,#0C447C,#1D4ED8);color:#fff;padding:16px;border-radius:24px 24px 0 0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}'
  + '.pr-eb{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.8;margin:0 0 2px;}.pr-title{font-size:21px;font-weight:900;margin:0;}.pr-sub{font-size:12.5px;opacity:.85;margin:3px 0 0;font-weight:600;}'
  + '.pr-x{flex-shrink:0;width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:18px;cursor:pointer;}'
  + '.pr-body{background:#F3F6FC;}.pr-sec{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#64748B;margin:6px 2px -2px;display:flex;justify-content:space-between;align-items:baseline;}'
  + '.pr-card{background:#fff;border:1px solid #DCE5F3;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px;}'
  + '.pr-note{font-size:12.5px;color:#5B6675;line-height:1.45;margin:0;}'
  + '.pr-lvl{display:flex;align-items:center;gap:14px;}.pr-lvl b{font-size:30px;font-weight:900;color:#0C447C;line-height:1;font-variant-numeric:tabular-nums;}.pr-lvl span{font-size:12px;color:#64748B;font-weight:700;line-height:1.35;}'
  + '.pr-chips{display:flex;flex-wrap:wrap;gap:6px;}.pr-chip{background:#F1F5FB;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:700;color:#334155;font-variant-numeric:tabular-nums;}.pr-chip b{color:#0C447C;}'
  + '.pr-warn{display:flex;gap:8px;font-size:12.5px;line-height:1.4;color:#334155;}.pr-warn i{font-style:normal;flex-shrink:0;}'
  + '.pr-item{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid #EEF2F7;}.pr-item:first-of-type{border-top:none;padding-top:2px;}'
  + '.pr-item input{width:20px;height:20px;flex-shrink:0;margin-top:1px;accent-color:#1B4FD8;}.pr-item-b{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px;}'
  + '.pr-item-t{font-size:13px;font-weight:800;color:#0F172A;}.pr-item-t small{font-weight:700;color:#64748B;font-size:11.5px;margin-left:4px;}'
  + '.pr-old{font-size:12px;color:#94A3B8;text-decoration:line-through;overflow-wrap:anywhere;}.pr-new{font-size:12.5px;color:#0F172A;font-weight:700;overflow-wrap:anywhere;}'
  + '.pr-why{font-size:11.5px;color:#5B6675;line-height:1.35;}.pr-tag{display:inline-block;font-size:10px;font-weight:800;border-radius:6px;padding:1px 6px;margin-right:5px;vertical-align:1px;}'
  + '.pr-tag.calc{background:#E0E9FF;color:#1B4FD8;}.pr-tag.coach{background:#DCFCE7;color:#15803D;}'
  + '.pr-btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;border:1px solid transparent;border-radius:12px;padding:12px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;}'
  + '.pr-btn.pri{background:#1B4FD8;color:#fff;}.pr-btn.sec{background:#EEF3FC;color:#1B4FD8;border-color:#D3DFF5;}.pr-btn.ok{background:#15803D;color:#fff;}.pr-btn:disabled{opacity:.55;cursor:default;}'
  + '.pr-link{background:none;border:none;color:#1B4FD8;font-weight:800;font-size:12.5px;cursor:pointer;padding:0;font-family:inherit;}'
  + '.pr-foot{flex-shrink:0;background:#fff;border-top:1px solid #E2E8F0;padding:10px 16px calc(env(safe-area-inset-bottom) + 10px);}'
  + '.pr-rec-top{display:flex;justify-content:space-between;align-items:center;}.pr-rec-top b{font-size:15px;color:#0C447C;}'
  + '.pr-rec-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;}.pr-card label{font-size:11.5px;font-weight:700;color:#5B6675;display:flex;flex-direction:column;gap:3px;}'
  + '.pr-card input:not([type=checkbox]){width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #D6DFEC;border-radius:9px;font-size:15px;font-family:inherit;background:#fff;}'
  + '.pr-coach{background:#F0FDF4;border-color:#BBF7D0;}.pr-coach p{margin:0;font-size:13px;line-height:1.5;color:#14532D;white-space:pre-line;}'
  + '.pr-spin{width:16px;height:16px;border-radius:50%;border:2.5px solid rgba(255,255,255,.45);border-top-color:#fff;animation:_prSpin .7s linear infinite;}@keyframes _prSpin{to{transform:rotate(360deg);}}';
function _prCss(){ if(!document.getElementById('pr-css')){ const st = document.createElement('style'); st.id = 'pr-css'; st.textContent = PR_CSS; document.head.appendChild(st); } }

function openPlanReview(){
  _prCss();
  const a = prAnalyze();
  _prReview = { a: a, items: a.proposals.map(function(p){ return Object.assign({ on: true }, p); }), coach: null };
  state._review_seen = prSig(a.proposals);
  if(dbRef) dbRef.child('_review_seen').set(state._review_seen).catch(function(){});
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'plan-review'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="pr-head"><div><p class="pr-eb">Plan</p><p class="pr-title">🔄 Mise à jour du plan</p><p class="pr-sub">' + prEsc(a.race.name || 'Prépa en cours') + (a.race.objectif && a.race.objectif !== 'non défini' ? ' · objectif ' + prEsc(a.race.objectif) : '') + '</p></div>'
    + '<button class="pr-x" onclick="closePlanReview()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body pr-body"><div id="pr-content" style="padding:14px 16px 18px;display:flex;flex-direction:column;gap:12px;"></div></div>'
    + '<div class="pr-foot"><button type="button" id="pr-apply" class="pr-btn ok" onclick="applyPlanReview()"></button></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) closePlanReview(); });
  mc.appendChild(ov);
  _prRender();
  try { if(typeof renderPlan === 'function'){ rendered.plan = false; } } catch(e) {}
}
function closePlanReview(){ const ov = document.getElementById('plan-review'); if(ov) ov.remove(); _prReview = null; try { renderPlan(); } catch(e) {} }

function _prRender(){
  const box = document.getElementById('pr-content'); if(!box || !_prReview) return;
  const a = _prReview.a, f = a.fit, R = _prReview;
  let h = '';
  // niveau actuel
  h += '<p class="pr-sec"><span>Ton niveau actuel</span><button class="pr-link" onclick="openRecordsModal(function(){ _prReview.a = prAnalyze(); _prReview.items = _prReview.a.proposals.map(function(p){ return Object.assign({ on: true }, p); }); _prRender(); })">🏆 Mes records</button></p><div class="pr-card">';
  if(f.vdot){
    h += '<div class="pr-lvl"><b>' + f.vdot.toFixed(1).replace('.', ',') + '</b><span>équivalent VDOT (Daniels)<br>d\'après tes ' + prEsc(f.basis) + '</span></div>'
      + '<div class="pr-chips">' + PR_CATS.map(function(c){ return '<span class="pr-chip">' + prCatLabel(c) + ' <b>' + prTime(f.preds[c]) + '</b></span>'; }).join('') + '</div>'
      + '<p class="pr-note">Allures du moment : seuil <b>' + prPace(f.paces.T) + '</b> · fractionné <b>' + prPace(f.paces.I) + '</b>' + (a.opt.efPace ? ' · EF réelle <b>' + prPace(a.opt.efPace) + '</b> (FC ≤ 148)' : '') + ' /km'
      + (a.planVdot ? '. Ton plan a été écrit pour un niveau ' + a.planVdot.toFixed(1).replace('.', ',') + '.' : '.') + '</p>'
      + (a.opt.postRace ? '<p class="pr-note" style="color:#B45309;font-weight:700;">Période de récupération après ta dernière course jusqu\'au ' + prFmtDate(a.opt.postRaceUntil, { day: 'numeric', month: 'long' }) + ' : aucune séance n\'est accélérée d\'ici là.</p>' : '')
      + '<details><summary class="pr-note" style="cursor:pointer;font-weight:700;">Sur quoi c\'est calculé (' + f.sources.length + ')</summary><div class="pr-note" style="margin-top:6px;">'
      + f.sources.map(function(x){ return '• ' + prEsc(x.label) + ' — ' + (x.time || x.pace + '/km' + (x.hr ? ', FC ' + x.hr : '')) + (x.date ? ' (' + prFmtDate(x.date, { day: 'numeric', month: 'short', year: 'numeric' }) + ')' : '') + (x.note ? ' · ' + x.note : '') + ' → ' + x.vdot.toFixed(1).replace('.', ','); }).join('<br>') + '</div></details>';
  } else {
    h += '<p class="pr-note">Pour calculer ton niveau, ajoute au moins un record daté (5 km, 10 km, semi ou marathon) ou valide des séances de seuil / fractionné avec l\'allure de chaque bloc.</p>'
      + '<button class="pr-btn sec" onclick="openRecordsModal(function(){ _prReview.a = prAnalyze(); _prReview.items = _prReview.a.proposals.map(function(p){ return Object.assign({ on: true }, p); }); _prRender(); })">🏆 Saisir mes records</button>';
  }
  h += '</div>';
  // avis du Coach
  if(R.coach) h += '<p class="pr-sec"><span>L\'avis du Coach</span></p><div class="pr-card pr-coach"><p>' + prEsc(R.coach) + '</p></div>';
  // points à revoir
  if(a.warnings.length) h += '<p class="pr-sec"><span>Points à revoir</span><span>' + a.warnings.length + '</span></p><div class="pr-card">'
    + a.warnings.map(function(w){ return '<div class="pr-warn"><i>' + (w.level === 'warn' ? '⚠️' : 'ℹ️') + '</i><span>' + prEsc(w.text) + '</span></div>'; }).join('') + '</div>';
  // propositions
  const n = R.items.filter(function(x){ return x.on; }).length;
  h += '<p class="pr-sec"><span>Propositions</span><span>' + R.items.length + '</span></p><div class="pr-card">';
  if(!R.items.length) h += '<p class="pr-note">' + (f.vdot ? 'Tes allures sont déjà en phase avec ton niveau : rien à changer pour l\'instant.' : 'Aucune proposition sans niveau calculé.') + '</p>';
  R.items.forEach(function(p, i){
    const field = { detail: '', title: 'Titre : ', km: 'Km : ', type: 'Type : ' };
    h += '<label class="pr-item"><input type="checkbox" ' + (p.on ? 'checked' : '') + ' onchange="_prReview.items[' + i + '].on=this.checked;_prFoot()">'
      + '<span class="pr-item-b"><span class="pr-item-t"><span class="pr-tag ' + (p.src === 'coach' ? 'coach' : 'calc') + '">' + (p.src === 'coach' ? 'Coach' : 'Calcul') + '</span>' + prEsc(typeof normalizeSessionTitle === 'function' ? normalizeSessionTitle(p.title, p.type, p.before) || p.title : p.title) + '<small>S' + p.w + (p.date ? ' · ' + prFmtDate(p.date, { weekday: 'short', day: 'numeric', month: 'short' }) : '') + '</small></span>'
      + '<span class="pr-old">' + (field[p.field] || '') + prEsc(p.before) + '</span><span class="pr-new">→ ' + (field[p.field] || '') + prEsc(p.after) + '</span>'
      + '<span class="pr-why">' + prEsc(p.reason) + '</span></span></label>';
  });
  if(R.items.length > 1) h += '<button class="pr-link" style="align-self:flex-start;" onclick="const on=_prReview.items.some(function(x){return !x.on;});_prReview.items.forEach(function(x){x.on=on;});_prRender()">' + (R.items.every(function(x){ return x.on; }) ? 'Tout décocher' : 'Tout cocher') + '</button>';
  h += '</div>';
  // Coach IA (admin)
  if(typeof isAdmin === 'function' && isAdmin()) h += '<button type="button" id="pr-coach-btn" class="pr-btn pri" onclick="askCoachPlanReview()">' + (R.coach ? '🤖 Redemander l\'avis du Coach' : '🤖 Demander l\'avis du Coach') + '</button>'
    + '<p class="pr-note" style="margin-top:-4px;">Le Coach relit tout le plan, tes séances réalisées, ton niveau et ta situation, et propose ses modifications (allures, volumes, enchaînements).</p>';
  // historique
  const hist = (state._plan_reviews || []).slice(-3).reverse();
  if(hist.length) h += '<p class="pr-sec"><span>Dernières mises à jour</span></p><div class="pr-card">' + hist.map(function(x){ return '<p class="pr-note">✓ ' + prFmtDate(x.date, { day: 'numeric', month: 'long' }) + ' — ' + x.n + ' séance' + (x.n > 1 ? 's' : '') + ' modifiée' + (x.n > 1 ? 's' : '') + (x.coach ? ' (avec le Coach)' : '') + (x.vdot ? ' · niveau ' + String(x.vdot).replace('.', ',') : '') + '</p>'; }).join('') + '</div>';
  box.innerHTML = h;
  _prFoot();
}
function _prFoot(){
  const b = document.getElementById('pr-apply'); if(!b || !_prReview) return;
  const n = _prReview.items.filter(function(x){ return x.on; }).length;
  b.disabled = !n; b.textContent = n ? 'Appliquer ' + n + ' modification' + (n > 1 ? 's' : '') : 'Aucune modification sélectionnée';
}

// Coach IA : relecture complète du plan (fonction planReview)
async function askCoachPlanReview(){
  if(!_prReview) return;
  const btn = document.getElementById('pr-coach-btn'); if(btn){ btn.disabled = true; btn.innerHTML = '<span class="pr-spin"></span> Le Coach relit ton plan…'; }
  const a = _prReview.a, today = a.opt.today;
  const weeks = {};
  prSessions(state).forEach(function(s){
    const w = weeks[s.w] = weeks[s.w] || { w: s.w, meta: (function(){ try { return JSON.parse(state['meta_w' + s.w] || '{}'); } catch(e) { return {}; } })(), sessions: [] };
    w.sessions.push({ ref: s.key, date: s.date, type: s.type, title: s.title, detail: s.detail, km: s.kmPlan, done: s.done,
      result: s.done ? { km: s.km, pace: s.perf.pace || null, hr: s.perf.hr || null, blocs: s.perf.blocsAllure || null, note: s.perf.note || null } : undefined });
  });
  const body = { today: today, race: { name: a.race.name, course: a.race.course, date: a.race.date, objectif: a.race.objectif },
    fitness: a.fit.vdot ? { vdot: a.fit.vdot, basis: a.fit.basis, planVdot: a.planVdot, paces: { seuil: prPace(a.fit.paces.T), fractionne: prPace(a.fit.paces.I), ef_reelle: a.opt.efPace ? prPace(a.opt.efPace) : null },
      predictions: Object.keys(a.fit.preds).reduce(function(o, c){ o[c] = prTime(a.fit.preds[c]); return o; }, {}), sources: a.fit.sources.map(function(x){ return { label: x.label, time: x.time || x.pace, date: x.date, vdot: Math.round(x.vdot * 10) / 10 }; }) } : null,
    postRaceUntil: a.opt.postRaceUntil, warnings: a.warnings.map(function(w){ return w.text; }),
    proposals: a.proposals.map(function(p){ return { ref: p.key, title: p.title, before: p.before, after: p.after, reason: p.reason }; }),
    plan: Object.keys(weeks).map(function(k){ return weeks[k]; }), memos: state._coach_memos || '' };
  try {
    const token = await getAuthToken();
    const r = await fetch(FUNCTIONS_BASE + '/planReview', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
    const j = await r.json();
    if(!r.ok || !j.success) throw new Error(j.error || 'HTTP ' + r.status);
    const byKey = {}; prSessions(state).forEach(function(s){ byKey[s.key] = s; });
    const items = [];
    (j.changes || []).forEach(function(c){
      const s = byKey[c.ref]; if(!s || s.done) return;
      const push = function(field, before, after){ if(after === undefined || after === null || String(after) === String(before)) return; items.push({ on: true, key: s.key, w: s.w, date: s.date, field: field, title: s.title, type: s.type, before: before, after: after, reason: c.reason || '', src: 'coach' }); };
      push('detail', s.detail, c.detail); push('title', s.title, c.title); push('km', s.kmPlan, c.km != null ? Math.round(+c.km * 10) / 10 : null); push('type', s.type, c.type);
    });
    _prReview.items = items; _prReview.coach = j.assessment || '';
    _prRender();
  } catch(e) {
    alert('Le Coach n\'a pas pu relire le plan (' + e.message + '). Réessaie dans un instant.');
    if(btn){ btn.disabled = false; btn.textContent = '🤖 Demander l\'avis du Coach'; }
  }
}

// Application des propositions cochées (séances à venir uniquement)
function applyPlanReview(){
  if(!_prReview) return;
  const sel = _prReview.items.filter(function(x){ return x.on; }); if(!sel.length) return;
  let n = 0; const touched = {};
  sel.forEach(function(p){
    let x; try { x = JSON.parse(state[p.key]); } catch(e) { return; }
    if(!x || state[p.key + '_done']) return;
    const parts = String(x.d || '').split('|'), title = parts[0], det = parts.slice(1).join('|');
    if(p.field === 'detail') x.d = title + '|' + p.after;
    else if(p.field === 'title') x.d = p.after + (det ? '|' + det : '');
    else if(p.field === 'km') x.km = +p.after;
    else if(p.field === 'type' && ['ef', 'long', 'tempo', 'frac'].indexOf(p.after) >= 0) x.type = p.after;
    else return;
    x._modified = true; x._seq = (x._seq || 0) + 1;
    state[p.key] = JSON.stringify(x); touched[p.key] = 1; n++;
  });
  const hist = (state._plan_reviews || []).slice(-9);
  hist.push({ date: prTodayIso(), n: Object.keys(touched).length, coach: sel.some(function(p){ return p.src === 'coach'; }), vdot: _prReview.a.fit.vdot || null });
  state._plan_reviews = hist;
  save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  const k = Object.keys(touched).length;
  closePlanReview();
  try { renderHome(); } catch(e) {}
  if(typeof showToast === 'function') showToast(k + ' séance' + (k > 1 ? 's' : '') + ' mise' + (k > 1 ? 's' : '') + ' à jour ✓');
}
