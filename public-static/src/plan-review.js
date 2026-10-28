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
// lundi de la semaine de plan_start_date : les séances sont calées du lundi au dimanche (sched_day 1 = lundi)
const prMonday = function(iso){ const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); const dw = d.getDay(); d.setDate(d.getDate() + (dw === 0 ? -6 : 1 - dw)); return d; };
const prWeekday = function(iso){ const d = new Date(String(iso).slice(0, 10) + 'T12:00:00').getDay(); return d === 0 ? 7 : d; };
// km d'un footing / d'une sortie longue changés : la consigne qui les écrit suit (« 26 km EF → finir 4 km … », « 8 EF · 3 AM »)
function prKmDetail(det, type, from, to){
  det = String(det || ''); const d = (+to) - (+from);
  if(!d || (type !== 'ef' && type !== 'long')) return det;
  const m = det.match(/(\d+(?:[,.]\d+)?)\s*(km\s*)?EF\b/i);
  if(m){ const v = Math.round((parseFloat(m[1].replace(',', '.')) + d) * 10) / 10; return v >= 1 ? det.replace(m[0], String(v).replace('.', ',') + ' ' + (m[2] ? 'km ' : '') + 'EF') : det; }
  const t = det.match(/^(\d+(?:[,.]\d+)?)\s*km\b/i);
  if(t && Math.abs(parseFloat(t[1].replace(',', '.')) - from) < 0.6) return det.replace(t[0], String(to).replace('.', ',') + ' km');
  return det;
}
const PR_PACE_RE = /(\d{1,2})['’:](\d{2})(?:\s*[—–-]\s*(\d{1,2})['’:](\d{2}))?\s*\/\s*km/;
function prSessions(st, opt){
  opt = opt || {};
  const out = [], start = st.plan_start_date ? prMonday(st.plan_start_date) : null;
  for(let w = 1, empty = 0; w <= 60 && empty < 5; w++){
    let any = false;
    for(let ei = 0; ei <= 50 && st['extra_w' + w + '_s' + ei] !== undefined; ei++){
      any = true;
      const k = 'extra_w' + w + '_s' + ei; let x = {}, perf = {};
      try { x = JSON.parse(st[k]) || {}; } catch(e) { continue; }
      try { perf = JSON.parse(st[k + '_perf'] || '{}') || {}; } catch(e) {}
      let date = x.sched_date || null;
      if(!date && perf.date) date = String(perf.date).slice(0, 10);
      if(!date && start){ const d = new Date(start); d.setDate(d.getDate() + (w - 1) * 7 + (x.sched_day ? +x.sched_day - 1 : Math.min(ei * 2, 6))); date = prIso(d); }   // sans jour prévu : réparti dans la semaine
      const parts = String(x.d || '').split('|'), det = parts.slice(1).join('|');
      const pm = det.match(PR_PACE_RE);
      let pace = null;
      if(pm){ const a = prParsePace(pm[1], pm[2]), b = pm[3] ? prParsePace(pm[3], pm[4]) : a; pace = { lo: Math.min(a, b), hi: Math.max(a, b), range: !!pm[3], text: pm[0] }; }
      const done = !!(st[k + '_done'] || st[k + '_km'] != null);
      if(done && perf.date && /^\d{4}-\d{2}-\d{2}/.test(perf.date)) date = String(perf.date).slice(0, 10);   // séance faite : date réelle
      if(done && (x.type === 'tempo' || x.type === 'frac') && !(perf.blocsAllure || []).some(Boolean) && perf.strava && perf.strava.laps && typeof prBlocsFromLaps === 'function'){
        const bl = prBlocsFromLaps(parts[0], det, perf.strava.laps); if(bl){ perf.blocsAllure = bl; perf._blocsAuto = true; }
      }
      out.push({ key: k, w: w, ei: ei, x: x, perf: perf, date: date, title: parts[0], detail: det, pace: pace, done: done, skip: !done && !!st[k + '_skip'],
        km: done && parseFloat(st[k + '_km']) > 0 ? parseFloat(st[k + '_km']) : parseFloat(x.km) || 0, kmPlan: parseFloat(x.km) || 0, type: x.type });
    }
    if(!any) empty++; else empty = 0;
  }
  return out;
}
const prFmtDay = function(d){ return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }); };
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
// niveau retenu pour un résultat : VDOT de la course, moins de poids s'il est ancien ou sans date,
// marathon corrigé (+0,8 : la fin de course sous-estime le niveau). null si trop ancien (> 18 mois).
function prResultVdot(cat, sec, date, today){
  const m = PR_RACE_M[cat]; if(!m || !sec) return null;
  let v = vdotFromRace(m, sec), note = '';
  const age = date ? prDays(date, today || prTodayIso()) : null;
  if(age === null){ v -= 1; note = 'date inconnue : compte moins'; }
  else if(age > 540) return null;
  else if(age > 180){ v -= (age - 180) / 90; note = 'il y a ' + Math.round(age / 30) + ' mois : compte moins'; }
  if(cat === 'Marathon'){ v += 0.8; note = (note ? note + ' · ' : '') + 'marathon corrigé +0,8'; }
  return { vdot: v, note: note };
}
// sources : records datés (state._records), résultats des prépas enregistrées, course de la prépa en cours,
// blocs tempo / fractionné des 8 dernières semaines (allure par bloc et FC). Retourne aussi le détail des sources.
function prFitness(st, opt){
  opt = opt || {};
  const today = opt.today || prTodayIso(), hrMax = parseInt(st.fc_max) || parseInt((st.onboarding || {}).fc_max) || 196;
  const meta = st._records || {}, src = [];
  const seen = {};
  const addRace = function(cat, time, date, label){
    const sec = prTimeSec(time), r = prResultVdot(cat, sec, date, today); if(!r) return;
    const k = cat + '|' + Math.round(sec); if(seen[k]) return; seen[k] = 1;     // même course en record et en fiche de prépa : une fois
    src.push({ kind: 'course', cat: cat, label: label || cat, time: prTime(sec), date: date || null, vdot: r.vdot, note: r.note });
  };
  Object.keys(PR_RECORD_KEY).forEach(function(cat){ if(st[PR_RECORD_KEY[cat]]) addRace(cat, st[PR_RECORD_KEY[cat]], (meta[cat] || {}).date, 'Record ' + (cat === 'Semi-marathon' ? 'semi' : cat.toLowerCase())); });
  (opt.races || []).forEach(function(r){ if(PR_RACE_M[r.cat]) addRace(r.cat, r.time, r.date, r.label); });
  // séances test (5 km à fond) réalisées : comptent comme une course
  prSessions(st).forEach(function(s){ if(s.done && /^Test\b/i.test(s.title) && s.date && typeof prTestTime === 'function'){ const t = prTestTime(s); if(t) addRace('5 km', prTime(t), s.date, 'Test 5 km'); } });
  // blocs de qualité récents
  const sess = prSessions(st), recent = [];
  sess.forEach(function(s){
    if(!s.done || !s.date || prDays(s.date, today) > 56 || prDays(s.date, today) < 0) return;
    const it = prIntent(s); if(it !== 'T' && it !== 'I' && it !== 'race') return;
    const bl = (s.perf.blocsAllure || []).map(function(b){ const m = String(b).match(/(\d{1,2})['’:](\d{2})/); return m ? prParsePace(m[1], m[2]) : null; }).filter(Boolean);
    if(bl.length < 2) return;
    const wx = typeof prWxAdjFromMeteo === 'function' ? prWxAdjFromMeteo(s.perf.meteo).pct : 0;
    const avg = bl.reduce(function(a, b){ return a + b; }, 0) / bl.length / (1 + wx / 100), hr = parseInt(s.perf.hr) || null;   // allure équivalente sans chaleur
    // seuil ≈ 88 % VDOT, fractionné ≈ 97,5 % ; FC moyenne de séance basse = effort contenu (marge)
    const pct = it === 'I' ? 0.975 : it === 'race' ? 0.9 : 0.88;
    let v = vdotFromPaceAt(avg, pct);
    if(hr && hr > 0.93 * hrMax) v -= 0.8;
    recent.push({ kind: 'séance', label: s.title + (s.perf._blocsAuto || s.perf.blocsAuto ? ' (tours Strava)' : '') + (wx >= 1 ? ' (corrigé chaleur +' + prV(wx) + ' %)' : ''), date: s.date, pace: prPace(avg), hr: hr, vdot: v });
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
// allure d'origine (avant toute mise à jour) de chaque séance modifiée : la plus ancienne consigne non annulée
function prOrigPaces(st){
  const orig = {};
  (st._plan_reviews || []).forEach(function(h){ if(h.undone) return; (h.changes || []).forEach(function(c){
    if(orig[c.ref] !== undefined) return;
    const d = c.field === 'detail' ? String(c.before || '') : c.field === 'session' && c.before && typeof c.before === 'object' ? String(c.before.d || '') : null;
    if(d === null) return;
    const m = d.match(PR_PACE_RE); orig[c.ref] = m ? { lo: prParsePace(m[1], m[2]), hi: m[3] ? prParsePace(m[3], m[4]) : prParsePace(m[1], m[2]) } : null;
  }); });
  return orig;
}
function prPlanVdot(st){
  const v = [], orig = prOrigPaces(st);
  prSessions(st).forEach(function(s){
    const it = prIntent(s); if(!PR_PCT[it]) return;
    const pace = orig[s.key] !== undefined ? orig[s.key] : s.pace;
    if(pace) v.push(prVo2((pace.lo + pace.hi) / 2) / PR_PCT[it]);
  });
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
  const vPlan = prPlanVdot(st), efObs = opt.efPace || null, orig = prOrigPaces(st);
  // consigne fixée par le Coach (dernier changement non annulé) : le calcul ne la retouche pas, le Coach la gère
  const byCoach = {};
  (st._plan_reviews || []).forEach(function(h){ if(h.undone) return; (h.changes || []).forEach(function(c){ if(c.field === 'detail') byCoach[c.ref] = c.src === 'coach' ? c.after : null; }); });
  prSessions(st).forEach(function(s){
    if(s.done || s.skip || !s.pace || (s.date && s.date < today) || (byCoach[s.key] != null && byCoach[s.key] === s.detail)) return;
    const it = prIntent(s); if(!it) return;
    const mid = (s.pace.lo + s.pace.hi) / 2, half = Math.max(2, (s.pace.hi - s.pace.lo) / 2);
    let nmid, why, short;
    if(it === 'E'){
      // EF : uniquement si ton allure EF réelle (FC ≤ 148) sort nettement de la plage ; jamais les footings « très facile »
      if(!efObs || opt.postRace || /très facile|récup/i.test(s.title + ' ' + s.detail)) return;
      if(efObs >= s.pace.lo - 10 && efObs <= s.pace.hi + 10) return;
      if(opt.drift && opt.drift.avg >= 5 && efObs < s.pace.lo) return;                   // dérive cardiaque élevée : on n'accélère pas l'EF
      nmid = efObs + (s.pace.hi - s.pace.lo) / 2 - 5; why = 'ton allure EF réelle (FC ≤ 148) est ' + prPace(efObs) + '/km';
      short = 'Ton endurance réelle (FC ≤ 148) tourne à ' + prPace(efObs) + '/km : la plage est recalée dessus.';
    } else if(it === 'race'){
      if(!racePace || s.type === 'race' || (s.date && prDays(today, s.date) > 42)) return;
      nmid = racePace;
      why = goalPace && racePace > goalPace + 1 ? 'allure course réaliste aujourd\'hui (niveau actuel ' + prPace(curRace) + '/km), l\'objectif ' + prPace(goalPace) + ' viendra avec la forme' : 'allure de ton objectif (' + prPace(goalPace || racePace) + '/km)';
      short = goalPace && racePace > goalPace + 1 ? 'Allure course réaliste aujourd\'hui. L\'objectif (' + prPace(goalPace) + '/km) viendra avec la forme.' : 'Calée sur l\'allure de ton objectif.';
    } else {
      if(!vPlan) return;
      const o0 = orig[s.key], mid0 = o0 ? (o0.lo + o0.hi) / 2 : mid;    // intensité d'origine (pas l'allure déjà ajustée)
      const pct = prVo2(mid0) / vPlan;                        // intensité relative voulue par le plan
      nmid = paceAtPct(fit.vdot, pct);
      why = 'ton niveau a évolué (équivalent VDOT ' + fit.vdot.toFixed(1).replace('.', ',') + ' contre ' + vPlan.toFixed(1).replace('.', ',') + ' prévu par le plan) : même intensité, allure ajustée';
      short = { T: 'Seuil', I: 'Fractionné', R: 'Vitesse' }[it] + ' : même effort que prévu, à ton niveau actuel.';
    }
    if(opt.calib === 'prudent' && nmid < mid && it !== 'E') nmid += 3;          // allures proposées souvent pas tenues : un peu plus prudent
    if(Math.abs(mid - nmid) < 4) return;                                       // écart < 4 s/km : on laisse
    let capped = false;
    const capF = opt.calib === 'prudent' ? 5 : opt.calib === 'confiant' ? 12 : 10;
    if(nmid < mid - capF){ nmid = mid - capF; capped = true; }                 // progression prudente : 10 s/km au plus par mise à jour (5 si prudent, 12 si confiant)
    const lo = nmid - half, hi = nmid + half;
    const txt = s.pace.range ? prPace(lo) + ' — ' + prPace(hi) + ' /km' : prPace(nmid) + '/km';
    let det = s.detail.replace(s.pace.text, txt);
    // temps par répétition entre parenthèses « (3'28 — 3'36) » : recalculés
    const rep = (s.title + ' ' + s.detail).match(/(\d+)\s*[×x]\s*(\d[\d\s]*?)\s*m\b/), repM = rep ? parseInt(rep[2].replace(/\s/g, '')) : null;
    if(repM) det = det.replace(/\((\d{1,2})['’](\d{2})\s*[—–-]\s*(\d{1,2})['’](\d{2})\)/, '(' + prPace(lo * repM / 1000) + ' — ' + prPace(hi * repM / 1000) + ')');
    const d = Math.round(nmid - mid);
    const held = d < 0 && opt.noFasterUntil && s.date && s.date <= opt.noFasterUntil;   // début de récupération post-course : mise en attente
    out.push({ held: !!held, key: s.key, w: s.w, date: s.date, field: 'detail', title: s.title, type: s.type, before: s.detail, after: det, intent: it, delta: d,
      reason: (d < 0 ? 'Plus rapide de ' + (-d) : 'Plus lent de ' + d) + ' s/km : ' + why + (capped ? ' (ajustement limité à ' + capF + ' s/km par mise à jour, la suite viendra aux prochaines)' : '') + '.', src: 'calcul',
      short: short + (capped ? ' Limité à ' + capF + ' s/km cette fois, la suite à la prochaine mise à jour.' : ''),
      pb: s.pace.text.replace(/\s*\/\s*km$/, ''), pa: txt.replace(/\s*\/\s*km$/, '') });
  });
  return out;
}

// ─── Contrôles du plan ──────────────────────────────────────────────────────
function prChecks(st, fit, opt){
  opt = opt || {};
  const sess = prSessions(st).filter(function(s){ return !s.skip; }), weeks = {}, warn = [];
  const managed = function(w){ return opt.volumeManaged && (!opt.volumeWeeks || opt.volumeWeeks.indexOf(w) >= 0); };
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
    const underBase = opt.habitual && v <= opt.habitual;                // jusqu'à ton volume habituel : remontée normale
    if(prev > 0 && !prevRecov && v > prev * 1.15 && v - prev > 4 && !m.isTaper && !underBase && !managed(w))
      warn.push({ w: w, level: v > prev * 1.2 ? 'warn' : 'info', text: 'S' + w + wdate(w) + ' : volume +' + Math.round((v / prev - 1) * 100) + ' % (' + Math.round(prev) + ' → ' + Math.round(v) + ' km), au-delà des +10-15 % conseillés.',
        short: 'Volume en forte hausse : ' + Math.round(prev) + ' → ' + Math.round(v) + ' km (+' + Math.round((v / prev - 1) * 100) + ' %). L\'idéal : +10-15 %.' });
    if(prevRecov && prevMax > 0 && v > prevMax * 1.12 && v - prevMax > 4 && !underBase && !managed(w))
      warn.push({ w: w, level: 'warn', text: 'S' + w + wdate(w) + ' : après la semaine allégée, ' + Math.round(v) + ' km dépasse de ' + Math.round((v / prevMax - 1) * 100) + ' % le dernier pic (' + Math.round(prevMax) + ' km).',
        short: 'Reprise après l\'allègement trop forte : ' + Math.round(v) + ' km, ' + Math.round((v / prevMax - 1) * 100) + ' % au-dessus du dernier pic (' + Math.round(prevMax) + ' km).' });
    const lr = (weeks[w] || []).filter(function(s){ return s.type === 'long'; }).sort(function(a, b){ return b.kmPlan - a.kmPlan; })[0];
    const lrSmall = lr && opt.habitual && lr.kmPlan <= opt.habitual * 0.4;   // sortie longue modeste pour ton niveau
    if(lr && v > 0 && lr.kmPlan / v > 0.4 && v >= 20 && !lrSmall && !managed(w)) warn.push({ w: w, level: 'info', text: 'S' + w + wdate(w) + ' : la sortie longue fait ' + Math.round(lr.kmPlan / v * 100) + ' % du volume de la semaine (au-delà de 35-40 %).',
      short: 'Sortie longue très dominante : ' + Math.round(lr.kmPlan / v * 100) + ' % des km de la semaine (repère : 35-40 %).' });
    const lrPrev = W[i - 1] ? (weeks[W[i - 1]] || []).filter(function(s){ return s.type === 'long'; }).reduce(function(a, s){ return Math.max(a, s.kmPlan); }, 0) : 0;
    if(lr && lrPrev && lr.kmPlan - lrPrev > 3 && lr.kmPlan > lrPrev * 1.2 && !lrSmall && !managed(w)) warn.push({ w: w, level: 'info', text: 'S' + w + wdate(w) + ' : sortie longue +' + Math.round(lr.kmPlan - lrPrev) + ' km d\'un coup (' + lrPrev + ' → ' + lr.kmPlan + ' km).',
      short: 'Sortie longue qui grimpe vite : ' + lrPrev + ' → ' + lr.kmPlan + ' km.' });
    // séances dures enchaînées (qualité / longue / course sur deux jours consécutifs)
    const hard = (weeks[w] || []).concat(weeks[W[i + 1]] || []).filter(function(s){ return s.date && (s.type === 'tempo' || s.type === 'frac' || s.type === 'long' || s.type === 'race'); }).sort(function(a, b){ return a.date.localeCompare(b.date); });
    for(let j = 1; j < hard.length; j++) if(hard[j].w === w || hard[j - 1].w === w){
      if(prDays(hard[j - 1].date, hard[j].date) === 1 && hard[j - 1].w === w && !(hard[j - 1].type === 'long' && hard[j].type === 'long'))
        warn.push({ w: w, level: 'warn', text: hard[j - 1].date.slice(8, 10) + '/' + hard[j - 1].date.slice(5, 7) + ' et ' + hard[j].date.slice(8, 10) + '/' + hard[j].date.slice(5, 7) + ' : deux séances exigeantes d\'affilée (' + hard[j - 1].title + ' puis ' + hard[j].title + ').',
          short: 'Deux séances exigeantes d\'affilée : ' + prFmtDay(hard[j - 1].date) + ' ' + hard[j - 1].title + ', puis ' + prFmtDay(hard[j].date) + ' ' + hard[j].title + '.' });
    }
    // semaines de construction sans allègement
    if(m.isRecov || m.isTaper) build = 0; else if(v > 0) build++;
    if(build === 5) warn.push({ w: w, level: 'info', text: 'S' + w + wdate(w) + ' : 5e semaine de charge d\'affilée sans semaine allégée.', short: '5e semaine de charge d\'affilée, sans semaine plus légère.' });
    // séance de qualité sans allure
    (weeks[w] || []).forEach(function(s){ if((s.type === 'tempo' || s.type === 'frac') && !s.pace && !s.done && !/^Test\b/i.test(s.title)) warn.push({ w: w, level: 'info', text: 'S' + w + ' · ' + s.title + ' : aucune allure indiquée dans la consigne.', short: s.title + ' : aucune allure dans la consigne.' }); });
  });
  // affûtage : volume des deux dernières semaines vs pic
  const peak = Math.max.apply(null, W.map(vol).concat([0])), last = W[W.length - 1], before = W[W.length - 2];
  if(peak > 0 && before && vol(before) > peak * 0.85 && W.length >= 6) warn.push({ w: before, level: 'warn', text: 'Affûtage : S' + before + ' garde ' + Math.round(vol(before) / peak * 100) + ' % du volume du pic (' + Math.round(peak) + ' km) ; viser 60-75 %.',
    short: 'Affûtage trop chargé : ' + Math.round(vol(before) / peak * 100) + ' % du volume du pic (' + Math.round(peak) + ' km). Repère : 60-75 %.' });
  // allure course trop ambitieuse pour le niveau actuel
  if(fit && fit.vdot && opt.raceCat && opt.goalSec && PR_RACE_M[opt.raceCat]){
    const cur = fit.preds[opt.raceCat], gap = (cur - opt.goalSec) / opt.goalSec;
    if(gap > 0.03) warn.push({ w: null, level: 'info', goal: true, text: 'Objectif ' + prTime(opt.goalSec) + ' : ton niveau actuel donne ' + prTime(cur) + ' (' + Math.round(gap * 100) + ' % d\'écart). Les séances à allure course sont calées un peu au-dessus de ton allure actuelle et se rapprocheront de l\'objectif à chaque mise à jour.' });
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
// volume habituel d'une prépa enregistrée (fiche prep_index : shape = [prévu, fait, c|r|p|t] par semaine)
function prPrepVolume(p){
  const sh = (p && p.shape) || []; if(!sh.length) return null;
  let end = sh.length; for(let i = sh.length - 1; i >= 0; i--) if(sh[i][2] === 'c'){ end = i; break; }   // course objectif = la dernière
  let w = sh.slice(0, end).filter(function(x){ return x[2] !== 't'; });
  if(!sh.some(function(x){ return x[2] === 't'; })) w = w.slice(0, Math.max(0, w.length - 2));    // affûtage non marqué : 2 dernières semaines écartées
  const done = w.map(function(x){ return x[1] || 0; }).filter(function(x){ return x > 0; }).slice(-8);
  if(done.length < 3) return null;
  return { avg: Math.round(done.reduce(function(a, b){ return a + b; }, 0) / done.length), peak: Math.round(Math.max.apply(null, sh.map(function(x){ return x[1] || 0; }))) };
}
function prLastPrep(today){
  const idx = (typeof _prepIndex !== 'undefined' && _prepIndex) || {};
  const ids = Object.keys(idx).filter(function(id){ const p = idx[id]; return p && p.date && p.date <= today && id !== state._prep_id && prDays(p.date, today) <= 120 && prPrepVolume(p); })
    .sort(function(a, b){ return idx[b].date.localeCompare(idx[a].date); });
  return ids.length ? Object.assign({ id: ids[0] }, idx[ids[0]], { vol: prPrepVolume(idx[ids[0]]) }) : null;
}
// historique envoyé au Coach : dernières prépas (volume par semaine, sortie longue, séances de qualité réalisées)
async function prHistory(today){
  const idx = (typeof _prepIndex !== 'undefined' && _prepIndex) || {}, out = [];
  const ids = Object.keys(idx).filter(function(id){ return idx[id] && idx[id].date && idx[id].date <= today && id !== state._prep_id; })
    .sort(function(a, b){ return idx[b].date.localeCompare(idx[a].date); }).slice(0, 2);
  for(const id of ids){
    const p = idx[id], v = prPrepVolume(p), o = { prepa: p.title, course: p.race || p.title, date: p.date, distance: p.dist || null, resultat: p.result || null, bilan: p.note || null };
    if(p.shape) o.km_realises_par_semaine = p.shape.map(function(x){ return Math.round(x[1] || 0); });
    if(v){ o.volume_habituel_km_sem = v.avg; o.pic_km_sem = v.peak; }
    let st = null; try { if(typeof _prepGetSnap === 'function') st = await _prepGetSnap(id); } catch(e) {}
    if(st){
      if(!st._plan_engine && !st.plan_start_date) st = Object.assign({}, st, { plan_start_date: '2026-03-09' });   // plan Seine-Eure écrit en dur
      const ss = prSessions(st).filter(function(x){ return x.done; });
      o.sortie_longue_max_km = Math.round(Math.max.apply(null, ss.filter(function(x){ return x.type === 'long'; }).map(function(x){ return x.km; }).concat([0])));
      o.seances_qualite = ss.filter(function(x){ return x.type === 'tempo' || x.type === 'frac'; }).slice(-8)
        .map(function(x){ return { semaine: x.w, date: x.date || x.perf.date || null, titre: x.title, consigne: x.detail, km: x.km, allure: x.perf.pace || null, blocs: x.perf.blocsAllure || null, fc: x.perf.hr || null }; });
      const ef = prObservedEf(st, p.date); if(ef) o.allure_ef_fc148 = prPace(ef);
    }
    out.push(o);
  }
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
  let noFasterUntil = null;
  if(last && REC[last.cat]){
    const d = new Date(last.date + 'T12:00:00'); d.setDate(d.getDate() + REC[last.cat]); postRaceUntil = prIso(d); if(postRaceUntil < today) postRaceUntil = null;
    // allures protégées pendant les 3/4 de la récupération (marathon : J+20) ; l'intensité revient ensuite
    const n = new Date(last.date + 'T12:00:00'); n.setDate(n.getDate() + Math.round(REC[last.cat] * 0.75)); noFasterUntil = prIso(n); if(noFasterUntil < today) noFasterUntil = null;
  }
  const lp = prLastPrep(today);
  const opt = { today: today, raceCat: raceCat, goalSec: goalSec, efPace: prObservedEf(state, today), postRace: !!postRaceUntil, postRaceUntil: postRaceUntil, noFasterUntil: noFasterUntil,
    habitual: lp ? lp.vol.avg : null, habitualFrom: lp ? (lp.race || lp.title) : null, habitualPeak: lp ? lp.vol.peak : null, lastRace: last ? { cat: last.cat, date: last.date } : null };
  const opt2 = typeof prLoad === 'function';                                     // plan-optim.js chargé
  const a = { fit: fit, opt: opt, race: R };
  if(opt2){
    a.load = prLoad(today); a.drift = prDrift(today); a.whoop = prWhoop(today); a.calib = prCalib(state);
    if(typeof prInternal === 'function') a.internal = prInternal(today);
    opt.noVolumeUp = !!(a.whoop && a.whoop.tired) || !!(a.internal && a.internal.pains.some(function(x){ return x.level >= 2; }));
    opt.drift = a.drift; opt.calib = a.calib.mode;
    a.volume = prVolumePlan(state, a); opt.volumeManaged = !!a.volume; opt.volumeWeeks = a.volume ? a.volume.horizonWeeks : null;
  }
  const all = prPaceProposals(state, fit, opt);
  // une proposition par séance et par champ : WHOOP > séance test > volume / allure
  const extra = opt2 ? (typeof prPainProposals === 'function' ? prPainProposals(state, a, a.internal) : []).concat(prWhoopProposals(state, a, a.whoop)).concat([prTestProposal(state, a)].filter(Boolean)).concat(a.volume ? a.volume.proposals : []) : [];
  const seen = {}, merged = [];
  extra.concat(all).forEach(function(p){
    const k = p.key + '|' + (p.field === 'session' ? 'session' : p.field), ks = p.key + '|session';
    if(seen[k] || (p.field !== 'session' && seen[ks]) || (p.field === 'session' && Object.keys(seen).some(function(x){ return x.indexOf(p.key + '|') === 0; }))) return;
    seen[k] = 1; merged.push(p);
  });
  merged.sort(function(x, y){ return (x.date || '').localeCompare(y.date || '') || x.w - y.w; });
  a.proposals = merged.filter(function(p){ return !p.held; }); a.held = merged.filter(function(p){ return p.held; });
  a.warnings = prChecks(state, fit, opt); a.planVdot = prPlanVdot(state);
  if(opt2) a.trajectory = prTrajectory(a);
  return a;
}
// « données nouvelles » pour le Coach : séances réalisées (km, allure, FC, blocs), records, résultat de course.
// Les changements de plan appliqués n'en font pas partie : redemander l'avis juste après n'apporte rien de neuf.
function prDataSig(st){
  st = st || state;
  const parts = prSessions(st).filter(function(x){ return x.done; }).map(function(x){ return x.key + ':' + x.km + ':' + (x.perf.pace || '') + ':' + (x.perf.hr || '') + ':' + (x.perf.blocsAllure || []).join(','); });
  Object.keys(PR_RECORD_KEY).forEach(function(c){ parts.push(c + '=' + (st[PR_RECORD_KEY[c]] || '')); });
  parts.push(JSON.stringify(st._records || {}), JSON.stringify(st._race_result || null));
  let h = 5381; const t = parts.join('|'); for(let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
// séances réalisées depuis une date (envoyées au Coach comme « données nouvelles »)
function prDoneSince(date, at){
  return prSessions(state).filter(function(x){ return x.done && (at && x.perf.validatedAt ? x.perf.validatedAt > at : (!date || (x.date && x.date >= date))); })
    .map(function(x){ return { date: x.date, titre: x.title, km: x.km, allure: x.perf.pace || null, fc: x.perf.hr || null, blocs: x.perf.blocsAllure || null, ressenti: x.perf.note || null }; });
}
// proposition qui annule une modification appliquée lors des dernières mises à jour
function prRevertOf(p){
  const hist = (state._plan_reviews || []).slice(-4).reverse();
  for(const h of hist) for(const c of (h.changes || [])) if(c.ref === p.key && c.field === p.field && String(c.before) === String(p.after) && String(c.after) === String(p.before)) return h.date;
  return null;
}
const prSig = function(list){ return list.map(function(p){ return p.key + '>' + (typeof p.after === 'object' ? JSON.stringify(p.after) : p.after); }).join('|'); };
// pastille sur le bouton « MAJ le plan » : propositions pas encore vues
function planReviewPending(){
  if(typeof prPrefetch === 'function' && !window._prPrefetchDone){
    if(!window._prPrefetchedOnce){ window._prPrefetchedOnce = true; prPrefetch().then(function(){ if(typeof rendered !== 'undefined'){ rendered.plan = false; try { if(document.getElementById('sc-plan').style.display !== 'none') renderPlan(); } catch(e) {} } }); }
    return 0;                                                                    // pastille calculée une fois la prépa précédente chargée
  }
  try { if(typeof usesHardPlan === 'function' && usesHardPlan()) return 0; const a = prAnalyze(); return a.proposals.length && prSig(a.proposals) !== state._review_seen ? a.proposals.length : 0; } catch(e) { return 0; }
}

// ─── Mes records ────────────────────────────────────────────────────────────
// saisie d'un temps au pavé numérique (sans « : ») : 1500 → 15:00 · 13700 → 1:37:00
function prFmtTimeInput(el){
  const d = el.value.replace(/\D/g, '').slice(0, 6);
  el.value = d.length <= 2 ? d : d.length <= 4 ? d.slice(0, -2) + ':' + d.slice(-2) : d.slice(0, -4) + ':' + d.slice(-4, -2) + ':' + d.slice(-2);
}
// niveau équivalent affiché en direct sous chaque record
function prRecLive(i){
  const c = PR_CATS[i], sec = prTimeSec(document.getElementById('rec-t-' + i).value), out = document.getElementById('rec-v-' + i);
  const dIn = document.getElementById('rec-d-' + i), ph = document.getElementById('rec-dp-' + i); if(ph) ph.hidden = !!dIn.value; dIn.classList.toggle('has', !!dIn.value);
  if(!out) return;
  const ok = sec && sec / (PR_RACE_M[c] / 1000) >= 150 && sec / (PR_RACE_M[c] / 1000) <= 600;
  const r = ok ? prResultVdot(c, sec, dIn.value || null) : null;
  out.textContent = ok ? (r ? 'niveau ' + r.vdot.toFixed(1).replace('.', ',') : 'trop ancien, non compté') + ' · ' + prPace(sec / (PR_RACE_M[c] / 1000)) + '/km' : '';
  out.title = r && r.note ? r.note : '';
}
function openRecordsModal(onDone){
  _prCss();
  const meta = state._records || {}, mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'records-modal'; ov.style.zIndex = '720'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  const best = function(c){ return typeof prepBestTime === 'function' ? prepBestTime(c) : null; };
  const ph = ['mm:ss', 'mm:ss', 'h:mm:ss', 'h:mm:ss'];
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="pr-head"><div><p class="pr-eb">Entraînement</p><p class="pr-title">🏆 Mes records</p><p class="pr-sub">Ils fixent ton niveau et les allures de ton plan</p></div><button class="pr-x" onclick="document.getElementById(\'records-modal\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body pr-body"><div style="padding:14px 16px 18px;display:flex;flex-direction:column;gap:10px;">'
    + '<div class="pr-card rec-list">'
    + PR_CATS.map(function(c, i){
        const k = PR_RECORD_KEY[c], m = meta[c] || {}, b = best(c), v = state[k] || '';
        return '<div class="rec-row">'
          + '<div class="rec-dist"><b>' + prCatLabel(c) + '</b><span id="rec-v-' + i + '"></span></div>'
          + '<div class="rec-fields">'
          +   '<input id="rec-t-' + i + '" class="rec-time" inputmode="numeric" autocomplete="off" aria-label="Temps ' + prCatLabel(c) + '" placeholder="' + ph[i] + '" value="' + prEsc(v) + '" oninput="prFmtTimeInput(this);prRecLive(' + i + ')">'
          +   '<label class="rec-date"><input id="rec-d-' + i + '" type="date" aria-label="Date du record ' + prCatLabel(c) + '" max="' + prTodayIso() + '" value="' + prEsc(m.date || '') + '" onchange="prRecLive(' + i + ')"><span id="rec-dp-' + i + '" class="rec-dph"' + (m.date ? ' hidden' : '') + '>Date</span></label>'
          + '</div>'
          + '<input id="rec-r-' + i + '" class="rec-race" aria-label="Course ' + prCatLabel(c) + '" placeholder="Nom de la course (facultatif)" value="' + prEsc(m.race || '') + '">'
          + (!v && b ? '<button type="button" class="pr-link rec-sugg" onclick="const t=document.getElementById(\'rec-t-' + i + '\');t.value=\'' + b.time + '\';prRecLive(' + i + ');this.remove()">↺ Reprendre ' + b.time + ' (' + prEsc(b.src === 'record' ? 'record' : b.src) + ')</button>' : '')
          + '</div>';
      }).join('')
    + '</div><p class="pr-note" style="padding:0 2px;">Tape seulement les chiffres : 4423 → 44:23 · 13700 → 1:37:00. Un record sans date ou de plus de 6 mois compte moins.</p></div></div>'
    + '<div class="pr-foot"><button type="button" class="pr-btn pri" onclick="saveRecordsModal()">Enregistrer mes records</button></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
  PR_CATS.forEach(function(c, i){ prRecLive(i); });
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
  + '.rec-list{padding:4px 14px;gap:0;}.rec-row{display:grid;grid-template-columns:76px minmax(0,1fr);column-gap:10px;row-gap:6px;align-items:center;padding:12px 0;border-bottom:1px solid #EEF2F7;}.rec-row:last-child{border-bottom:none;}'
  + '.rec-dist{display:flex;flex-direction:column;gap:2px;grid-row:span 2;align-self:start;padding-top:9px;}.rec-dist b{font-size:15px;font-weight:850;color:#0C447C;}.rec-dist span{font-size:10.5px;font-weight:700;color:#15803D;line-height:1.3;}'
  + '.rec-fields{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:8px;min-width:0;}'
  + '.rec-row input{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box;margin:0;border:1px solid #D6DFEC;border-radius:10px;background:#fff;font-family:inherit;color:#0F172A;-webkit-appearance:none;appearance:none;}'
  + '.rec-time{height:44px;padding:0 10px;font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;}.rec-time::placeholder{color:#C3CCD9;font-weight:600;}'
  + '.rec-date{position:relative;display:block;min-width:0;}.rec-date input{height:44px;line-height:44px;padding:0 8px 0 10px;font-size:14px;text-align:left;white-space:nowrap;overflow:hidden;}'
  + '.rec-date input::-webkit-date-and-time-value{text-align:left;white-space:nowrap;margin:0;line-height:44px;font-size:14px;}.rec-date input:not(.has):not(:focus){color:transparent;}.rec-date input:not(.has):not(:focus)::-webkit-datetime-edit{color:transparent;}.rec-dph{position:absolute;left:11px;top:50%;transform:translateY(-50%);font-size:14px;color:#A3AEBE;pointer-events:none;}'
  + '.rec-race{grid-column:2;height:34px;padding:0 10px;font-size:13px;border-color:#E6ECF5 !important;background:#F8FAFD !important;}'
  + '.rec-sugg{grid-column:2;justify-self:start;font-size:12px;}'
  + '.pr-tab{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums;}.pr-tab th,.pr-tab td{padding:7px 4px;text-align:left;border-top:1px solid #EEF2F7;vertical-align:top;}'
  + '.pr-tab thead th{border-top:none;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748B;padding-top:0;}.pr-tab tbody th{font-weight:800;color:#0C447C;width:28%;}'
  + '.pr-tab td b{display:block;font-size:14px;color:#0F172A;}.pr-tab td small{display:block;font-size:11px;color:#64748B;font-weight:600;}.pr-tab td:last-child b{color:#1B4FD8;}'
  + '.pr-hero{gap:14px;}.pr-verdict{display:flex;align-items:center;gap:14px;}.pr-big{flex-shrink:0;width:54px;height:54px;border-radius:16px;background:#1B4FD8;color:#fff;font-size:28px;font-weight:900;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums;box-shadow:0 6px 16px -6px rgba(27,79,216,.6);}.pr-big.ok{background:#15803D;box-shadow:0 6px 16px -6px rgba(21,128,61,.55);}'
  + '.pr-verdict b{display:block;font-size:18px;font-weight:900;color:#0F172A;line-height:1.2;}.pr-verdict>div>span{display:block;font-size:12.5px;color:#5B6675;line-height:1.4;margin-top:2px;}'
  + '.pr-gauge{background:#F6F8FD;border-radius:12px;padding:10px 12px 12px;}.pr-gl{margin:0 0 42px;line-height:1.35;font-size:13px;font-weight:800;color:#0C447C;}'
  + '.pr-track{position:relative;height:8px;border-radius:4px;background:#E2E8F3;margin:0 14px 30px;}.pr-fill{position:absolute;top:0;bottom:0;border-radius:4px;background:linear-gradient(90deg,#9DB4EC,#1B4FD8);}'
  + '.pr-mk{position:absolute;top:50%;}.pr-mk i{position:absolute;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-sizing:border-box;box-shadow:0 1px 4px rgba(15,23,42,.25);}'
  + '.pr-mk.plan i{background:#94A3B8;}.pr-mk.you i{background:#1B4FD8;width:20px;height:20px;left:-10px;top:-10px;}'
  + '.pr-mk em{position:absolute;left:0;transform:translateX(-50%);font-style:normal;font-size:10.5px;font-weight:700;color:#64748B;text-align:center;line-height:1.2;white-space:nowrap;}.pr-mk.plan em{top:14px;}.pr-mk.you em{bottom:16px;color:#1B4FD8;}.pr-mk em b{font-size:13px;font-weight:900;}'
  + '.pr-pills{display:flex;flex-wrap:wrap;gap:6px;}.pr-pill{font-size:12px;font-weight:700;border-radius:999px;padding:5px 10px;line-height:1.3;}.pr-pill.goal{background:#EEF3FC;color:#1E3A8A;}.pr-pill.rest{background:#FEF3C7;color:#92400E;}.pr-pill.base{background:#F1F5F9;color:#334155;}'
  + '.pr-coach-h{font-weight:900 !important;font-size:13.5px !important;}.pr-coach-n{font-size:12px !important;color:#166534 !important;opacity:.85;margin-top:2px !important;}.pr-tag.rev{background:#FEF3C7;color:#92400E;}.pr-hist summary{cursor:pointer;}.pr-hist ul{margin:6px 0 2px;padding-left:18px;font-size:12px;color:#475569;line-height:1.5;}'
  + '.pr-strip{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 4px;margin:0 -2px;scrollbar-width:none;}.pr-strip::-webkit-scrollbar{display:none;}'
  + '.pr-wk{flex:0 0 auto;min-width:62px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 6px 7px;border-radius:12px;border:1.5px solid #DCE5F3;background:#fff;font-family:inherit;cursor:pointer;}.pr-wk:disabled{cursor:default;}'
  + '.pr-wk-s{font-size:13px;font-weight:900;color:#0F172A;}.pr-wk-d{font-size:10px;font-weight:700;color:#64748B;white-space:nowrap;}.pr-wk-i{margin-top:2px;min-width:26px;height:20px;border-radius:10px;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 6px;box-sizing:border-box;}'
  + '.pr-wk.ok .pr-wk-i{background:#DCFCE7;color:#15803D;}.pr-wk.chg{border-color:#1B4FD8;background:#F2F6FF;}.pr-wk.chg .pr-wk-i{background:#1B4FD8;color:#fff;}.pr-wk.vig{border-color:#F5C46B;}.pr-wk.vig .pr-wk-i{background:#FEF3C7;color:#B45309;}'
  + '.pr-wk.now{box-shadow:0 0 0 3px rgba(27,79,216,.15);}'
  + '.pr-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin:-4px 2px 0;font-size:11px;font-weight:700;}.pr-legend .chg{color:#1B4FD8;}.pr-legend .vig{color:#B45309;}.pr-legend .ok{color:#15803D;}'
  + '.pr-week{background:#fff;border:1px solid #DCE5F3;border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px;scroll-margin-top:8px;}'
  + '.pr-week header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}.pr-week header b{display:block;font-size:16px;font-weight:900;color:#0C447C;}.pr-week header div>span{display:block;font-size:12px;font-weight:700;color:#64748B;margin-top:1px;}'
  + '.pr-now{display:inline-block;font-size:10px;font-weight:800;color:#1B4FD8;background:#E0E9FF;border-radius:6px;padding:1px 6px;vertical-align:2px;margin-left:4px;}'
  + '.pr-kind{flex-shrink:0;font-size:11.5px;font-weight:800;border-radius:999px;padding:4px 9px;background:#F1F5F9;color:#334155;}.pr-kind.k-race{background:#FEF9C3;color:#854D0E;}.pr-kind.k-recov,.pr-kind.k-taper{background:#ECFDF5;color:#047857;}.pr-kind.k-peak{background:#FFF1E6;color:#C2410C;}'
  + '.pr-chg{border:1.5px solid #1B4FD8;background:#F7F9FF;border-radius:14px;padding:11px 12px;display:flex;flex-direction:column;gap:8px;transition:opacity .2s,border-color .2s,background .2s;}.pr-chg.off{border-color:#DCE5F3;background:#fff;opacity:.6;}'
  + '.pr-chg-h{display:flex;align-items:center;gap:10px;}.pr-dot{flex-shrink:0;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;}'
  + '.pr-chg-t{flex:1;min-width:0;}.pr-chg-t b{display:block;font-size:14px;font-weight:850;color:#0F172A;line-height:1.25;}.pr-chg-t small{display:block;font-size:11.5px;font-weight:700;color:#64748B;margin-top:1px;}'
  + '.pr-tick{flex-shrink:0;width:30px;height:30px;border-radius:50%;border:2px solid #C3CEE0;background:#fff;cursor:pointer;position:relative;padding:0;}.pr-tick[aria-pressed=true]{background:#1B4FD8;border-color:#1B4FD8;}'
  + '.pr-tick[aria-pressed=true]::after{content:"";position:absolute;left:9px;top:4px;width:7px;height:13px;border:solid #fff;border-width:0 3px 3px 0;transform:rotate(45deg);}'
  + '.pr-swap{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-variant-numeric:tabular-nums;}.pr-p{font-size:15px;font-weight:800;border-radius:9px;padding:5px 9px;white-space:nowrap;}.pr-p.old{background:#F1F5F9;color:#94A3B8;text-decoration:line-through;font-size:13px;}.pr-p.new{background:#1B4FD8;color:#fff;}'
  + '.pr-arr{font-weight:900;color:#1B4FD8;}.pr-u{font-size:12px;font-weight:700;color:#64748B;margin-left:-2px;}.pr-d{display:inline-block;font-size:11.5px;font-weight:900;border-radius:999px;padding:2px 8px;margin-right:6px;white-space:nowrap;}.pr-d.fast{background:#DCFCE7;color:#15803D;}.pr-d.slow{background:#FFEDD5;color:#C2410C;}'
  + '.pr-chg .pr-why{font-size:12.5px;color:#334155;font-weight:600;margin:0;line-height:1.4;}.pr-txt{display:flex;flex-direction:column;gap:4px;}.pr-txt p,.pr-full p{margin:0;}'
  + '.pr-full summary{font-size:11.5px;font-weight:800;color:#1B4FD8;cursor:pointer;}.pr-full[open]{display:flex;flex-direction:column;gap:4px;}'
  + '.pr-vig{display:flex;flex-direction:column;gap:6px;background:#FFFBEB;border-radius:12px;padding:9px 11px;}.pr-vig p{margin:0;display:flex;gap:8px;font-size:12.5px;line-height:1.4;color:#713F12;}.pr-vig i{font-style:normal;flex-shrink:0;}.pr-vig .pr-vig-n{font-size:11.5px;color:#A16207;font-weight:700;}'
  + '.pr-ask{display:flex;flex-direction:column;gap:6px;}.pr-held{border:1.5px dashed #F5C46B;background:#FFFBEB;border-radius:14px;padding:11px 12px;display:flex;flex-direction:column;gap:8px;}.pr-held-t b{display:block;font-size:14px;font-weight:850;color:#0F172A;}.pr-held-t small{display:block;font-size:11.5px;font-weight:700;color:#A16207;margin-top:1px;}.pr-p.cur{background:#fff;color:#334155;font-size:13px;border:1px solid #E2E8F0;}.pr-p.sug{background:#FEF3C7;color:#92400E;}.pr-held-b{padding:9px;font-size:13px;}'
  + '.pr-fold{display:block;}.pr-fold[open]>*:not(summary){margin-top:10px;}.pr-fold summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;}.pr-fold summary::-webkit-details-marker{display:none;}.pr-fold summary::after{content:"Détail ▾";font-size:12px;font-weight:800;color:#1B4FD8;}.pr-fold[open] summary::after{content:"Masquer ▴";}'
  + '.pr-load{background:#fff;border:1px solid #DCE5F3;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px;}.pr-load-h{display:flex;justify-content:space-between;align-items:baseline;}.pr-load-h b{font-size:16px;font-weight:900;color:#0C447C;}.pr-load-h span{font-size:12px;font-weight:800;color:#1B4FD8;font-variant-numeric:tabular-nums;}'
  + '.pr-bar{height:6px;border-radius:3px;background:#E2E8F3;overflow:hidden;position:relative;}.pr-bar i{display:block;height:100%;width:0;border-radius:3px;background:linear-gradient(90deg,#60A5FA,#1B4FD8);transition:width .35s ease;}'
  + '.pr-bar.indet i{width:40%;position:absolute;animation:_prInd 1.4s ease-in-out infinite;}@keyframes _prInd{0%{left:-40%;}100%{left:100%;}}'
  + '.pr-step{display:flex;align-items:center;gap:12px;opacity:.35;transition:opacity .25s;}.pr-step.run,.pr-step.ok{opacity:1;}'
  + '.pr-step-ic{position:relative;flex-shrink:0;width:36px;height:36px;border-radius:11px;background:#F1F5FB;display:flex;align-items:center;justify-content:center;font-size:17px;transition:background .25s;}.pr-step.ok .pr-step-ic{background:#E7F0FF;}'
  + '.pr-step.run .pr-step-ic::after{content:"";position:absolute;inset:-3px;border-radius:13px;border:2.5px solid transparent;border-top-color:#1B4FD8;border-right-color:#1B4FD8;animation:_prSpin .7s linear infinite;}'
  + '.pr-step-t{flex:1;min-width:0;}.pr-step-t b{display:block;font-size:13.5px;font-weight:800;color:#0F172A;}.pr-step-t small{display:block;font-size:12px;font-weight:600;color:#64748B;margin-top:1px;transition:opacity .25s;}.pr-step:not(.ok) small{opacity:0;}'
  + '.pr-step-ok{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#15803D;color:#fff;font-size:12px;font-weight:900;display:flex;align-items:center;justify-content:center;transform:scale(0);transition:transform .25s cubic-bezier(.3,1.6,.5,1);}.pr-step.ok .pr-step-ok{transform:scale(1);}'
  + '#pr-content.pr-in>*{animation:_prFade .4s ease both;}#pr-content.pr-in>*:nth-child(2){animation-delay:.06s;}#pr-content.pr-in>*:nth-child(3){animation-delay:.12s;}#pr-content.pr-in>*:nth-child(n+4){animation-delay:.18s;}@keyframes _prFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}'
  + '.pr-cl{background:#fff;border:1.5px solid #1B4FD8;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px;}.pr-cl-h{display:flex;align-items:center;gap:12px;}.pr-cl-ic{font-size:22px;width:42px;height:42px;border-radius:13px;background:#EEF3FC;display:flex;align-items:center;justify-content:center;animation:_prBob 1.6s ease-in-out infinite;}@keyframes _prBob{50%{transform:translateY(-3px);}}'
  + '.pr-cl-h b{display:block;font-size:15px;font-weight:900;color:#0C447C;}.pr-cl-h small{display:block;font-size:11.5px;font-weight:700;color:#64748B;font-variant-numeric:tabular-nums;}.pr-cl-msg{margin:0;font-size:13px;font-weight:600;color:#334155;min-height:36px;line-height:1.4;}.pr-cl-msg.sw{animation:_prFade .35s ease both;}'
  + '.pr-pop{animation:_prFade .45s ease both;}'
  + '@media (prefers-reduced-motion:reduce){.pr-bar.indet i,.pr-cl-ic,.pr-step.run .pr-step-ic::after{animation:none;}#pr-content.pr-in>*{animation:none;}}'
  + '.pr-pill.ok{background:#DCFCE7;color:#166534;}.pr-tag.wh{background:#DCFCE7;color:#166534;}.pr-tag.ts{background:#EDE9FE;color:#5B21B6;}.pr-tag.vo{background:#E0F2FE;color:#075985;}.pr-tgt{color:#1B4FD8;font-weight:800;}'
  + '.pr-tj{gap:10px;}.pr-tj-h{margin:0;font-size:14px;font-weight:700;color:#0F172A;line-height:1.45;}.pr-tj-h b{font-variant-numeric:tabular-nums;color:#0C447C;}'
  + '.pr-verd{display:inline-block;font-size:11.5px;font-weight:800;border-radius:999px;padding:2px 9px;margin-left:2px;}.pr-verd.ok{background:#DCFCE7;color:#166534;}.pr-verd.mid{background:#FEF3C7;color:#92400E;}.pr-verd.hard{background:#FFE4E6;color:#9F1239;}'
  + '.tj-svg,.vc-svg{width:100%;height:auto;display:block;overflow:visible;}.tj-grid{stroke:#EEF2F7;stroke-width:1;}.tj-ax,.vc-ax{font-size:9px;fill:#94A3B8;font-weight:700;font-family:inherit;}'
  + '.tj-goal{stroke:#E8530A;stroke-width:1.2;stroke-dasharray:4 3;}.tj-goal-t{font-size:9px;fill:#E8530A;font-weight:800;}.tj-band{fill:rgba(27,79,216,.10);}.tj-proj{stroke:#1B4FD8;stroke-width:2;stroke-dasharray:5 4;}'
  + '.tj-race{fill:#E8530A;stroke:#fff;stroke-width:1.5;}.tj-ses{fill:#93B4F5;}.tj-now{fill:#1B4FD8;stroke:#fff;stroke-width:2;}.tj-end{fill:#fff;stroke:#1B4FD8;stroke-width:2.5;}.tj-end-t{font-size:10px;fill:#1B4FD8;font-weight:900;}'
  + '.pr-tj-leg{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0;font-size:11px;font-weight:700;color:#64748B;}.pr-tj-leg i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:-1px;}'
  + '.lg-race{background:#E8530A;}.lg-ses{background:#93B4F5;}.lg-proj{background:transparent;border:2px dashed #1B4FD8;width:8px !important;height:8px !important;}.lg-plan{background:#E2E8F0;border-radius:2px !important;}.lg-tgt{background:#1B4FD8;height:3px !important;border-radius:2px !important;vertical-align:2px !important;}.lg-after{background:#1B4FD8;border-radius:2px !important;}.lg-done{background:#86EFAC;border-radius:2px !important;}'
  + '.pr-vol{gap:6px;padding:12px 12px 10px;}.pr-vol-h{margin:0;font-size:13px;font-weight:850;color:#0C447C;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;}.pr-vol-h span{font-size:11px;font-weight:700;color:#64748B;}'
  + '.vc-plan{fill:#E2E8F0;}.vc-after{fill:#1B4FD8;}.vc-done{fill:#86EFAC;}.vc-tgt{stroke:#1B4FD8;stroke-width:2.5;stroke-linecap:round;}'
  + '.pr-undo{display:block;margin:6px 0 2px;font-size:12px;}'
  + '.pr-snack{position:fixed;left:16px;right:16px;margin:0 auto;width:max-content;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:450;display:flex;align-items:center;gap:12px;background:#0F172A;color:#fff;border-radius:16px;padding:10px 10px 10px 16px;font-size:13px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:calc(100vw - 32px);animation:_prFade .3s ease both;}'
  + '.pr-snack button{flex-shrink:0;background:#3B82F6;color:#fff;border:none;border-radius:10px;padding:8px 14px;font-weight:800;font-size:13px;font-family:inherit;cursor:pointer;}'
  + '.pr-spin{width:16px;height:16px;border-radius:50%;border:2.5px solid rgba(255,255,255,.45);border-top-color:#fff;animation:_prSpin .7s linear infinite;}@keyframes _prSpin{to{transform:rotate(360deg);}}';
function _prCss(){ if(!document.getElementById('pr-css')){ const st = document.createElement('style'); st.id = 'pr-css'; st.textContent = PR_CSS; document.head.appendChild(st); } }

function openPlanReview(opts){
  _prCss(); opts = opts || {};
  if(document.getElementById('plan-review')) return;
  const R0 = typeof prepRace === 'function' ? prepRace() : {};
  const a = { race: R0 };
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'plan-review'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="pr-head"><div><p class="pr-eb">Plan</p><p class="pr-title">🔄 Mise à jour du plan</p><p class="pr-sub">' + prEsc(a.race.name || 'Prépa en cours') + (a.race.objectif && a.race.objectif !== 'non défini' ? ' · objectif ' + prEsc(a.race.objectif) : '') + '</p></div>'
    + '<button class="pr-x" onclick="closePlanReview()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body pr-body"><div id="pr-content" style="padding:14px 16px 18px;display:flex;flex-direction:column;gap:12px;"></div></div>'
    + '<div class="pr-foot"><button type="button" id="pr-apply" class="pr-btn ok" onclick="applyPlanReview()"></button></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) closePlanReview(); });
  mc.appendChild(ov);
  const box = document.getElementById('pr-content'); if(box) box.innerHTML = '<div class="pr-load"><div class="pr-load-h"><b>Analyse de ton plan…</b><span>0 %</span></div><div class="pr-bar indet"><i></i></div></div>';
  const b = document.getElementById('pr-apply'); if(b){ b.disabled = true; b.textContent = 'Analyse en cours…'; }
  (async function(){
    if(typeof prPrefetch === 'function'){ try { await prPrefetch(); } catch(e) {} }
    if(ov !== document.getElementById('plan-review')) return;
    const an = prAnalyze();
    _prReview = { a: an, items: an.proposals.map(function(p){ return Object.assign({ on: true }, p); }), held: an.held.slice(), coach: null, autoCoach: !!opts.autoCoach };
    _prReview.items.forEach(function(x){ const d = prRevertOf(x); if(d){ x.revert = d; x.on = false; } });
    _prReview.auto = _prReview.items.slice();
    _prRestoreCoach(_prReview);
    state._review_seen = prSig(an.proposals);
    if(dbRef) dbRef.child('_review_seen').set(state._review_seen).catch(function(){});
    _prLoading(an);
  })();
  try { if(typeof renderPlan === 'function'){ rendered.plan = false; } } catch(e) {}
}
function closePlanReview(){ const ov = document.getElementById('plan-review'); if(ov) ov.remove(); if(_prReview && _prReview.clTimer) clearInterval(_prReview.clTimer); _prReview = null; try { renderPlan(); } catch(e) {} }

// Analyse affichée étape par étape, avec les chiffres réellement calculés (records, séances, base, plan), puis le résultat
function _prLoading(a){
  const box = document.getElementById('pr-content'); if(!box) return;
  const f = a.fit, sess = prSessions(state), today = a.opt.today, pl = function(n, w){ return n + ' ' + w + (n > 1 ? 's' : ''); };
  const done = sess.filter(function(x){ return x.done; }).length, next = sess.filter(function(x){ return !x.done && (!x.date || x.date >= today); }).length;
  const nW = Object.keys(sess.reduce(function(o, x){ o[x.w] = 1; return o; }, {})).length;
  const races = (f.sources || []).filter(function(x){ return x.kind === 'course'; }).length, qual = (f.sources || []).filter(function(x){ return x.kind === 'séance'; }).length;
  const n = a.proposals.length, nv = a.warnings.filter(function(x){ return x.w != null; }).length;
  const steps = [
    ['🏆', 'Tes records et tes courses', races ? pl(races, 'résultat') + ' → niveau ' + prV(f.vdot) : f.vdot ? 'niveau ' + prV(f.vdot) + ' d\'après tes ' + prEsc(f.basis) : 'aucun record daté'],
    ['✅', 'Tes séances réalisées', pl(done, 'séance') + ' validée' + (done > 1 ? 's' : '') + (qual ? ' · ' + pl(qual, 'séance') + ' de qualité mesurée' + (qual > 1 ? 's' : '') : '')],
    ['🏋️', 'Ta base d\'entraînement', a.opt.habitual ? '~' + a.opt.habitual + ' km/sem (' + prEsc(a.opt.habitualFrom) + ')' : 'pas de prépa précédente enregistrée'],
    ['📈', 'Ta charge réelle', a.load ? a.load.k7 + ' km sur 7 jours · ~' + a.load.chronic + ' km/sem sur 28 jours' + (a.drift ? ' · dérive cardiaque ' + prV(a.drift.avg) + ' %' : '') : 'non disponible'],
    ['💚', 'Ta récupération', a.whoop ? 'WHOOP : ' + a.whoop.avg3 + ' % en moyenne sur 3 jours' + (a.whoop.hrvDrop != null ? ' · VFC ' + (a.whoop.hrvDrop > 0 ? '+' : '') + a.whoop.hrvDrop + ' %' : '') : 'pas de données WHOOP récentes'],
    ['📅', 'Ton plan, semaine par semaine', pl(nW, 'semaine') + ' · ' + pl(next, 'séance') + ' à venir contrôlée' + (next > 1 ? 's' : '')],
    ['🎯', 'Propositions', (n ? pl(n, 'ajustement') + ' proposé' + (n > 1 ? 's' : '') : 'rien à ajuster') + (nv ? ' · ' + pl(nv, 'point') + ' de vigilance' : '')]
  ];
  box.innerHTML = '<div class="pr-load"><div class="pr-load-h"><b>Analyse de ton plan…</b><span id="pr-load-pct">0 %</span></div><div class="pr-bar"><i id="pr-load-bar"></i></div>'
    + steps.map(function(st, i){ return '<div class="pr-step" id="pr-step-' + i + '"><span class="pr-step-ic">' + st[0] + '</span><span class="pr-step-t"><b>' + st[1] + '</b><small>' + st[2] + '</small></span><span class="pr-step-ok">✓</span></div>'; }).join('') + '</div>';
  const b = document.getElementById('pr-apply'); if(b){ b.disabled = true; b.textContent = 'Analyse en cours…'; }
  const fast = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches, T = fast ? 90 : 300, R = _prReview;
  steps.forEach(function(st, i){
    setTimeout(function(){
      if(_prReview !== R) return;
      const el = document.getElementById('pr-step-' + i); if(el) el.classList.add('run');
      setTimeout(function(){
        if(_prReview !== R) return;
        if(el){ el.classList.remove('run'); el.classList.add('ok'); }
        const pct = Math.round((i + 1) / steps.length * 100), bar = document.getElementById('pr-load-bar'), t = document.getElementById('pr-load-pct');
        if(bar) bar.style.width = pct + '%'; if(t) t.textContent = pct + ' %';
      }, T * 0.75);
    }, i * T);
  });
  setTimeout(function(){
    if(_prReview !== R) return;
    const c = document.getElementById('pr-content'); if(c){ c.classList.add('pr-in'); }
    _prRender();
    // ouverture depuis la notification du dimanche : avis du Coach s'il y a du nouveau
    if(R.autoCoach && typeof isAdmin === 'function' && isAdmin() && !(state._coach_review && state._coach_review.sig === prDataSig())) setTimeout(function(){ if(_prReview === R) askCoachPlanReview(); }, 400);
  }, steps.length * T + (fast ? 100 : 450));
}

// semaines de la prépa : dates, volume, nature (charge, allègement, affûtage, course)
function prWeeks(st, today){
  const W = {}, start = st.plan_start_date ? prMonday(st.plan_start_date) : null;
  prSessions(st).forEach(function(s){
    if(s.skip) return;                                                            // séance retirée (imprévu, non réalisée)
    const o = W[s.w] = W[s.w] || { w: s.w, sess: [], km: 0, race: false };
    o.sess.push(s); if(s.type === 'race') o.race = true; else o.km += s.kmPlan;
  });
  Object.keys(W).forEach(function(k){
    const o = W[k];
    if(start){ const d = new Date(start); d.setDate(d.getDate() + (o.w - 1) * 7); o.from = prIso(d); d.setDate(d.getDate() + 6); o.to = prIso(d); }
    else { const ds = o.sess.map(function(s){ return s.date; }).filter(Boolean).sort(); o.from = ds[0] || null; o.to = ds[ds.length - 1] || null; }
    let m = {}; try { m = JSON.parse(st['meta_w' + o.w] || '{}') || {}; } catch(e) {}
    o.kind = o.race ? 'race' : m.isTaper ? 'taper' : m.isRecov ? 'recov' : m.isPeak ? 'peak' : 'load';
    o.past = !!(o.to && o.to < today); o.now = !!(o.from && o.to && o.from <= today && today <= o.to);
  });
  return W;
}
const PR_KIND = { race: ['Course', '🏁'], taper: ['Affûtage', '🪶'], recov: ['Allègement', '🌿'], peak: ['Pic', '⛰️'], load: ['Charge', '🧱'] };
const prV = function(x){ return x.toFixed(1).replace('.', ','); };
const prReload = 'openRecordsModal(function(){ _prReview.a = prAnalyze(); _prReview.items = _prReview.a.proposals.map(function(p){ return Object.assign({ on: true }, p); }); _prReview.auto = _prReview.items.slice(); _prReview.held = _prReview.a.held.slice(); _prRender(); })';
function _prGo(w){ const el = document.getElementById('pr-wk-' + w); if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
// séance mise en attente (début de récupération) : l'athlète choisit de l'accélérer quand même
function _prUnhold(i){
  const R = _prReview; if(!R || !R.held || !R.held[i]) return;
  const p = Object.assign({}, R.held.splice(i, 1)[0], { on: true, held: false });
  p.short = 'Accélérée à ta demande malgré la récupération : écoute tes sensations.';
  R.items.push(p); if(R.auto) R.auto.push(p); R.items.sort(function(x, y){ return (x.date || '').localeCompare(y.date || '') || x.w - y.w; });
  _prRender();
  const k = R.items.indexOf(p), el = document.getElementById('pr-it-' + k); if(el){ el.classList.add('pr-pop'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
function _prToggle(i){
  const it = _prReview && _prReview.items[i]; if(!it) return;
  it.on = !it.on;
  const el = document.getElementById('pr-it-' + i); if(el){ el.classList.toggle('off', !it.on); const t = el.querySelector('.pr-tick'); t.setAttribute('aria-pressed', it.on ? 'true' : 'false'); }
  _prFoot();
}
// une proposition : séance, changement en grand (allure, km, titre), raison en une phrase
function _prItem(p, i){
  const ty = p.type || 'ef', col = (typeof typeColor !== 'undefined' && typeColor[ty]) || '#1B4FD8', bg = (typeof typeBg !== 'undefined' && typeBg[ty]) || '#EEF3FC';
  const title = typeof normalizeSessionTitle === 'function' ? normalizeSessionTitle(p.title, p.type, p.before) || p.title : p.title;
  let swap = '', full = '', delta = '';
  if(p.field === 'detail' && !p.pb){                                       // consigne du Coach : allures extraites si elles changent
    const m1 = String(p.before).match(PR_PACE_RE), m2 = String(p.after).match(PR_PACE_RE);
    if(m1 && m2 && m1[0] !== m2[0]){
      const mid = function(m){ const x = prParsePace(m[1], m[2]), y = m[3] ? prParsePace(m[3], m[4]) : x; return (x + y) / 2; };
      p = Object.assign({}, p, { pb: m1[0].replace(/\s*\/\s*km$/, ''), pa: m2[0].replace(/\s*\/\s*km$/, ''), delta: Math.round(mid(m2) - mid(m1)) });
    }
  }
  if(p.pb && p.pa){
    const d = p.delta || 0;
    swap = '<div class="pr-swap"><span class="pr-p old">' + prEsc(p.pb) + '</span><span class="pr-arr">→</span><span class="pr-p new">' + prEsc(p.pa) + '</span><span class="pr-u">/km</span></div>';
    if(d) delta = '<span class="pr-d ' + (d < 0 ? 'fast' : 'slow') + '">' + (d < 0 ? '⚡ ' + (-d) + ' s/km plus vite' : '🐢 ' + d + ' s/km plus lent') + '</span>';
    full = '<details class="pr-full"><summary>Consigne complète</summary><p class="pr-old">' + prEsc(p.before) + '</p><p class="pr-new">' + prEsc(p.after) + '</p></details>';
  } else if(p.field === 'session'){
    swap = '<div class="pr-swap"><span class="pr-p old">' + prEsc(p.before.t) + ' · ' + prEsc(p.before.km) + ' km</span><span class="pr-arr">→</span><span class="pr-p new">' + prEsc(p.after.t) + ' · ' + prEsc(p.after.km) + ' km</span></div>';
    full = '<details class="pr-full"><summary>Consigne</summary><p class="pr-old">' + prEsc(p.before.d) + '</p><p class="pr-new">' + prEsc(p.after.d) + '</p></details>';
  } else if(p.field === 'km'){
    swap = '<div class="pr-swap"><span class="pr-p old">' + prEsc(p.before) + ' km</span><span class="pr-arr">→</span><span class="pr-p new">' + prEsc(p.after) + ' km</span></div>';
  } else if(p.field === 'type'){
    const L = function(t){ return (typeof typeLabel !== 'undefined' && typeLabel[t]) || t; };
    swap = '<div class="pr-swap"><span class="pr-p old">' + prEsc(L(p.before)) + '</span><span class="pr-arr">→</span><span class="pr-p new">' + prEsc(L(p.after)) + '</span></div>';
  } else {
    swap = '<div class="pr-txt"><p class="pr-old">' + (p.field === 'title' ? 'Titre : ' : '') + prEsc(p.before) + '</p><p class="pr-new">' + (p.field === 'title' ? 'Titre : ' : '') + prEsc(p.after) + '</p></div>';
  }
  const kindTag = p.kind === 'pain' ? ' · <span class="pr-tag rev">🩹 Douleur</span>' : p.kind === 'whoop' ? ' · <span class="pr-tag wh">💚 WHOOP</span>' : p.kind === 'test' ? ' · <span class="pr-tag ts">🎯 Test</span>' : p.kind === 'volume' ? ' · <span class="pr-tag vo">Volume</span>' : '';
  return '<div class="pr-chg' + (p.on ? '' : ' off') + '" id="pr-it-' + i + '">'
    + '<div class="pr-chg-h"><span class="pr-dot" style="background:' + bg + ';color:' + col + ';">' + ((typeof typeEmoji !== 'undefined' && typeEmoji[ty]) || '•') + '</span>'
    + '<div class="pr-chg-t"><b>' + prEsc(title) + '</b><small>' + (p.date ? prFmtDate(p.date, { weekday: 'long', day: 'numeric', month: 'short' }) : 'S' + p.w) + (p.src === 'coach' ? ' · <span class="pr-tag coach">Coach</span>' : '') + kindTag + (p.revert ? ' · <span class="pr-tag rev">↩ annule la modif du ' + prFmtDate(p.revert) + '</span>' : '') + '</small></div>'
    + '<button type="button" class="pr-tick" aria-pressed="' + (p.on ? 'true' : 'false') + '" aria-label="Retenir ce changement" onclick="_prToggle(' + i + ')"></button></div>'
    + swap + '<p class="pr-why">' + delta + prEsc(p.short || p.reason) + '</p>' + full + '</div>';
}

// volume par semaine : prévu (gris), conseillé (trait bleu), fait (vert) ; après les changements proposés (bleu)
function _prVolChart(V){
  const allW = V.weeks.filter(function(x){ return x.past ? x.done > 0 : true; }), i0 = allW.findIndex(function(x){ return !x.past; });
  const from = Math.max(0, Math.min((i0 < 0 ? allW.length : i0) - 4, allW.length - 16)), ws = allW.slice(from, from + 16); if(ws.length < 2) return '';
  const W = 320, H = 116, B = 18, T = 14, n = ws.length, bw = Math.min(22, (W - 16) / n * 0.62), gap = (W - 16) / n;
  const max = Math.max.apply(null, ws.map(function(x){ return Math.max(x.plan, x.target || 0, x.done || 0, x.after || 0); }).concat([10]));
  const Y = function(v){ return T + (1 - v / max) * (H - T - B); };
  let g = '';
  ws.forEach(function(x, i){
    const cx = 8 + gap * i + gap / 2, l = cx - bw / 2;
    if(x.past) g += '<rect x="' + l + '" y="' + Y(x.done) + '" width="' + bw + '" height="' + (H - B - Y(x.done)) + '" rx="3" class="vc-done"><title>S' + x.w + ' : ' + x.done + ' km faits</title></rect>';
    else {
      g += '<rect x="' + l + '" y="' + Y(x.plan) + '" width="' + bw + '" height="' + (H - B - Y(x.plan)) + '" rx="3" class="vc-plan"><title>S' + x.w + ' : ' + x.plan + ' km prévus</title></rect>';
      if(x.changed && x.after !== x.plan) g += '<rect x="' + (l + bw * 0.22) + '" y="' + Y(x.after) + '" width="' + bw * 0.56 + '" height="' + (H - B - Y(x.after)) + '" rx="2" class="vc-after"><title>S' + x.w + ' : ' + x.after + ' km après changements</title></rect>';
      if(x.target) g += '<line x1="' + (l - 3) + '" x2="' + (l + bw + 3) + '" y1="' + Y(x.target) + '" y2="' + Y(x.target) + '" class="vc-tgt"><title>S' + x.w + ' : ' + x.target + ' km conseillés</title></line>';
    }
    g += '<text x="' + cx + '" y="' + (H - 5) + '" class="vc-ax" text-anchor="middle">S' + x.w + '</text>';
  });
  return '<div class="pr-card pr-vol"><p class="pr-vol-h">Volume par semaine <span>base ~' + V.base + ' km · pic visé ~' + V.peak + ' km</span></p>'
    + '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vc-svg" role="img" aria-label="Volume prévu, conseillé et réalisé par semaine">' + g + '</svg>'
    + '<p class="pr-tj-leg"><span><i class="lg-plan"></i>prévu</span><span><i class="lg-tgt"></i>conseillé</span><span><i class="lg-after"></i>avec les changements</span><span><i class="lg-done"></i>fait</span></p></div>';
}
function _prRender(){
  const box = document.getElementById('pr-content'); if(!box || !_prReview) return;
  const a = _prReview.a, f = a.fit, R = _prReview, today = a.opt.today;
  const W = prWeeks(state, today), wk = Object.keys(W).map(Number).sort(function(x, y){ return x - y; }).map(function(w){ return W[w]; }).filter(function(o){ return !o.past; });
  const byW = {}, warnW = {};
  R.items.forEach(function(p, i){ (byW[p.w] = byW[p.w] || []).push(i); });
  a.warnings.forEach(function(x){ if(x.w != null && W[x.w] && !W[x.w].past) (warnW[x.w] = warnW[x.w] || []).push(x); });
  const heldW = {}; (R.held || []).forEach(function(p, i){ (heldW[p.w] = heldW[p.w] || []).push(i); });
  const nW = Object.keys(warnW).reduce(function(n, k){ return n + warnW[k].length; }, 0), nI = R.items.length;
  const goal = a.warnings.filter(function(x){ return x.goal; })[0];
  let h = '';

  // ── Verdict
  h += '<div class="pr-card pr-hero">';
  h += '<div class="pr-verdict"><span class="pr-big' + (nI ? '' : ' ok') + '">' + (nI ? nI : '✓') + '</span><div><b>' + (nI ? 'séance' + (nI > 1 ? 's' : '') + ' à ajuster' : 'Ton plan est à jour') + '</b><span>'
    + (nI ? 'Coche ce que tu veux garder, puis applique.' : 'Rien à changer dans tes allures pour l\'instant.')
    + (nW ? ' ' + nW + ' point' + (nW > 1 ? 's' : '') + ' de vigilance à regarder.' : '') + '</span></div></div>';
  if(f.vdot && a.planVdot){
    const lo = Math.floor(Math.min(f.vdot, a.planVdot) - 1.5), hi = Math.ceil(Math.max(f.vdot, a.planVdot) + 1.5), pos = function(v){ return ((v - lo) / (hi - lo) * 100).toFixed(1) + '%'; };
    const gap = f.vdot - a.planVdot, l = Math.min(f.vdot, a.planVdot), r = Math.max(f.vdot, a.planVdot);
    const q = R.items.filter(function(p){ return p.src === 'calcul' && /^[TIR]$/.test(p.intent); }), dq = q.length ? Math.max.apply(null, q.map(function(p){ return Math.abs(p.delta); })) : 0;
    h += '<div class="pr-gauge"><p class="pr-gl">' + (gap > 0.4 ? '📈 Tu as progressé depuis l\'écriture du plan' + (dq ? ' : ' + (q.length > 1 ? 'tes séances de seuil et de fractionné passent' : 'ta séance de qualité passe') + ' jusqu\'à ' + dq + ' s/km plus vite.' : '.') : gap < -0.4 ? '🧭 Ton plan est un peu au-dessus de ton niveau actuel' + (dq ? ' : ' + (q.length > 1 ? 'tes séances de qualité ralentissent' : 'ta séance de qualité ralentit') + ' de ' + dq + ' s/km au plus.' : '.') : '👌 Ton plan colle à ton niveau.') + '</p>'
      + '<div class="pr-track"><span class="pr-fill" style="left:' + pos(l) + ';width:calc(' + pos(r) + ' - ' + pos(l) + ');"></span>'
      + '<span class="pr-mk plan" style="left:' + pos(a.planVdot) + '"><i></i><em>Plan<br><b>' + prV(a.planVdot) + '</b></em></span>'
      + '<span class="pr-mk you" style="left:' + pos(f.vdot) + '"><i></i><em>Toi<br><b>' + prV(f.vdot) + '</b></em></span></div></div>';
  }
  const pills = [];
  if(goal && f.vdot && a.opt.raceCat) pills.push('<span class="pr-pill goal">🎯 Objectif <b>' + prTime(a.opt.goalSec) + '</b> · aujourd\'hui ' + prTime(f.preds[a.opt.raceCat]) + '</span>');
  if(a.opt.habitual) pills.push('<span class="pr-pill base">🏋️ Ta base : ~' + a.opt.habitual + ' km/sem (' + prEsc(a.opt.habitualFrom) + ')</span>');
  if(a.opt.postRace && wk.length && (!wk[0].from || a.opt.postRaceUntil >= wk[0].from)) pills.push('<span class="pr-pill rest">🛌 Récup jusqu\'au ' + prFmtDate(a.opt.postRaceUntil, { day: 'numeric', month: 'short' }) + (a.opt.noFasterUntil ? ' · allures gardées jusqu\'au ' + prFmtDate(a.opt.noFasterUntil, { day: 'numeric', month: 'short' }) : '') + '</span>');
  if(a.load && a.load.chronic) pills.push('<span class="pr-pill base">📈 Charge : ' + a.load.k7 + ' km / 7 j · ~' + a.load.chronic + ' km/sem sur 28 j' + (a.load.acwr ? ' · ratio ' + prV(a.load.acwr) : '') + '</span>');
  if(a.whoop) pills.push('<span class="pr-pill ' + (a.whoop.tired ? 'rest' : 'ok') + '">' + (a.whoop.tired ? '😮‍💨 WHOOP : récupération basse (' + a.whoop.avg3 + ' %)' : a.whoop.fresh ? '💚 WHOOP : bien récupéré (' + a.whoop.avg3 + ' %)' : '💛 WHOOP : récupération moyenne (' + a.whoop.avg3 + ' %)') + (a.whoop.hrvDrop != null ? ' · VFC ' + (a.whoop.hrvDrop > 0 ? '+' : '') + a.whoop.hrvDrop + ' %' : '') + '</span>');
  const pn = a.internal && a.internal.pains[0];
  if(pn) pills.push('<span class="pr-pill ' + (pn.level >= 2 ? 'rest' : 'base') + '">🩹 Douleur ' + ['', 'légère', 'gênante', 'forte'][pn.level] + ' (' + prEsc(pn.zone.toLowerCase()) + ') le ' + prFmtDate(pn.date) + (pn.level >= 2 ? ' → jours suivants allégés' : ' : surveille') + '</span>');
  if(a.internal && a.internal.ratio) pills.push('<span class="pr-pill ' + (a.internal.ratio > 1.5 ? 'rest' : 'base') + '">💪 Charge ressentie 7 j : ' + prV(a.internal.ratio) + '× ta moyenne</span>');
  if(a.drift) pills.push('<span class="pr-pill base">❤️ Dérive cardiaque ' + prV(a.drift.avg) + ' % : endurance ' + a.drift.label + '</span>');
  if(a.calib && a.calib.n) pills.push('<span class="pr-pill ' + (a.calib.mode === 'prudent' ? 'rest' : 'base') + '">🎯 Allures proposées tenues : ' + a.calib.k + '/' + a.calib.n + (a.calib.mode === 'prudent' ? ' → calcul plus prudent' : a.calib.mode === 'confiant' ? ' → progression plus franche' : '') + '</span>');
  if(pills.length) h += '<div class="pr-pills">' + pills.join('') + '</div>';
  if(!f.vdot) h += '<p class="pr-note">Pour calculer ton niveau, ajoute au moins un record daté ou valide des séances de seuil / fractionné avec l\'allure de chaque bloc.</p><button class="pr-btn sec" onclick="' + prReload + '">🏆 Saisir mes records</button>';
  h += '</div>';

  // ── Trajectoire vers l'objectif
  const TJ = a.trajectory;
  if(TJ && TJ.race){
    const col = TJ.verdict === 'atteignable' ? 'ok' : TJ.verdict === 'à portée' ? 'mid' : 'hard';
    h += '<p class="pr-sec"><span>Trajectoire vers l\'objectif</span></p><div class="pr-card pr-tj">'
      + '<p class="pr-tj-h">À ce rythme, le ' + prFmtDate(TJ.race.date, { day: 'numeric', month: 'long' }) + ' : <b>' + prTime(TJ.race.lo) + ' – ' + prTime(TJ.race.hi) + '</b>'
      + (TJ.verdict ? ' <span class="pr-verd ' + col + '">objectif ' + prEsc(a.race.objectif || prTime(a.opt.goalSec)) + ' : ' + TJ.verdict + '</span>' : '') + '</p>'
      + prTrajectorySvg(TJ)
      + '<p class="pr-tj-leg"><span><i class="lg-race"></i>courses et tests</span><span><i class="lg-ses"></i>séances de qualité</span><span><i class="lg-proj"></i>projection</span></p>'
      + '<p class="pr-note">' + (TJ.assumed ? 'Pas encore assez de séances mesurées pour une tendance : projection sur une progression type (+0,1 de niveau par semaine).' : 'Tendance de tes 4 derniers mois : ' + (TJ.slope >= 0 ? '+' : '') + prV(TJ.slope * 7) + ' de niveau par semaine.') + ' Fourchette = ± 0,6 de niveau.</p></div>';
  }

  // ── Avis du Coach
  if(R.coach) h += '<div class="pr-card pr-coach"><p class="pr-coach-h">🤖 L\'avis du Coach</p><p>' + prEsc(R.coach) + '</p></div>';

  // ── Semaine par semaine
  if(wk.length){
    h += '<p class="pr-sec"><span>Semaine par semaine</span></p>';
    if(a.volume) h += _prVolChart(a.volume);
    h += '<div class="pr-strip">' + wk.map(function(o){
        const ni = (byW[o.w] || []).length, nv = (warnW[o.w] || []).length + (heldW[o.w] || []).length, st = ni ? 'chg' : nv ? 'vig' : 'ok';
        return '<button type="button" class="pr-wk ' + st + (o.now ? ' now' : '') + '"' + (ni || nv ? ' onclick="_prGo(' + o.w + ')"' : ' disabled') + '>'
          + '<span class="pr-wk-s">S' + o.w + '</span><span class="pr-wk-d">' + (o.now ? 'cette sem.' : o.from ? prFmtDate(o.from) : '') + '</span>'
          + '<span class="pr-wk-i">' + (ni ? ni + ' ✎' : nv ? '!' : (o.race ? '🏁' : '✓')) + '</span></button>';
      }).join('') + '</div>'
      + '<p class="pr-legend"><span class="chg">✎ à ajuster</span><span class="vig">! vigilance</span><span class="ok">✓ rien à changer</span></p>';
    wk.forEach(function(o){
      const its = byW[o.w] || [], ws = warnW[o.w] || [], hs = heldW[o.w] || []; if(!its.length && !ws.length && !hs.length) return;
      const K = PR_KIND[o.kind];
      h += '<section class="pr-week" id="pr-wk-' + o.w + '"><header><div><b>Semaine ' + o.w + (o.now ? ' <span class="pr-now">en cours</span>' : '') + '</b><span>'
        + (o.from ? prFmtDate(o.from) + ' → ' + prFmtDate(o.to) + ' · ' : '') + Math.round(o.km) + ' km' + (function(){ const vw = a.volume && a.volume.weeks.find(function(x){ return x.w === o.w; }); return vw && vw.target && Math.abs(vw.target - o.km) >= 3 ? ' · <b class="pr-tgt">' + vw.target + ' km conseillés</b>' : ''; })() + '</span></div><span class="pr-kind k-' + o.kind + '">' + K[1] + ' ' + K[0] + '</span></header>';
      its.forEach(function(i){ h += _prItem(R.items[i], i); });
      hs.forEach(function(i){
        const p = R.held[i], title = typeof normalizeSessionTitle === 'function' ? normalizeSessionTitle(p.title, p.type, p.before) || p.title : p.title;
        h += '<div class="pr-held"><div class="pr-held-t"><b>⏳ ' + prEsc(title) + '</b><small>' + (p.date ? prFmtDate(p.date, { weekday: 'long', day: 'numeric', month: 'short' }) + ' · ' : '') + 'en attente : début de récupération</small></div>'
          + '<div class="pr-swap"><span class="pr-p cur">' + prEsc(p.pb) + '</span><span class="pr-arr">→</span><span class="pr-p sug">' + prEsc(p.pa) + '</span><span class="pr-u">/km</span></div><p class="pr-why">À ton niveau, tu pourrais la courir à ' + prEsc(p.pa) + ' /km.</p>'
          + '<button type="button" class="pr-btn sec pr-held-b" onclick="_prUnhold(' + i + ')">⚡ Accélérer quand même</button></div>';
      });
      if(ws.length) h += '<div class="pr-vig">' + ws.map(function(x){ return '<p><i>' + (x.level === 'warn' ? '⚠️' : '💡') + '</i><span>' + prEsc(x.short || x.text) + '</span></p>'; }).join('')
        + '</div>';
      h += '</section>';
    });
    // propositions sur des semaines passées ou sans date (cas rare)
    R.items.forEach(function(p, i){ if(!W[p.w] || W[p.w].past) h += '<section class="pr-week">' + _prItem(p, i) + '</section>'; });
    if(nI > 1) h += '<button class="pr-link" style="align-self:flex-start;" onclick="const on=_prReview.items.some(function(x){return !x.on;});_prReview.items.forEach(function(x){x.on=on;});_prRender()">' + (R.items.every(function(x){ return x.on; }) ? 'Tout décocher' : 'Tout cocher') + '</button>';
  }

  // ── Coach IA (admin)
  const lastC = state._coach_review, same = !R.coach && lastC && lastC.sig === prDataSig();
  if(typeof isAdmin === 'function' && isAdmin() && same) h += '<div class="pr-ask"><div class="pr-card pr-coach"><p class="pr-coach-h">🤖 Le Coach a déjà relu ton plan ' + (lastC.date === a.opt.today ? 'aujourd\'hui' : 'le ' + prFmtDate(lastC.date, { day: 'numeric', month: 'long' })) + '</p>'
    + '<p>' + prEsc(lastC.assessment || '') + '</p><p class="pr-coach-n">Rien de nouveau depuis : ni séance réalisée, ni record. Il pourra proposer de nouveaux ajustements après ta prochaine séance.</p></div>'
    + '<button type="button" id="pr-coach-btn" class="pr-link" style="align-self:center;padding:6px;" onclick="askCoachPlanReview(true)">Relancer quand même</button></div>';
  else if(typeof isAdmin === 'function' && isAdmin()) h += '<div class="pr-ask"><button type="button" id="pr-coach-btn" class="pr-btn pri" onclick="askCoachPlanReview()">' + (R.coach ? '🤖 Redemander l\'avis du Coach' : '🤖 Demander l\'avis du Coach') + '</button>'
    + '<p class="pr-note">Il relit tout le plan, tes séances faites et ta forme, et peut proposer d\'autres changements (volumes, enchaînements, allures)' + (nW ? ', notamment pour corriger les points de vigilance' : '') + '.</p></div>';

  // ── Ton niveau (détail)
  h += '<p class="pr-sec"><span>Ton niveau en détail</span><button class="pr-link" onclick="' + prReload + '">🏆 Mes records</button></p>';
  if(f.vdot){
    h += '<details class="pr-card pr-fold"><summary><span class="pr-lvl"><b>' + prV(f.vdot) + '</b><span>équivalent VDOT (Daniels)<br>d\'après tes ' + prEsc(f.basis) + '</span></span></summary>'
      + '<table class="pr-tab"><thead><tr><th></th><th>Ton record</th><th>À ton niveau</th></tr></thead><tbody>'
      + PR_CATS.map(function(c){
          const rec = state[PR_RECORD_KEY[c]], rs = prTimeSec(rec), rv = rs ? prResultVdot(c, rs, ((state._records || {})[c] || {}).date || null) : null;
          return '<tr><th>' + prCatLabel(c) + '</th><td>' + (rec ? '<b>' + prEsc(prTime(rs)) + '</b><small>' + (rv ? 'niveau ' + prV(rv.vdot) : 'trop ancien') + '</small>' : '<small>—</small>') + '</td><td><b>' + prTime(f.preds[c]) + '</b></td></tr>';
        }).join('') + '</tbody></table>'
      + '<p class="pr-note">« À ton niveau » : temps équivalents à ton niveau ' + prV(f.vdot) + ', fixé par ton meilleur résultat récent. Sur marathon, l\'équivalent suppose une prépa marathon complète et des conditions idéales : il est souvent plus rapide que le temps réalisé.</p>'
      + '<p class="pr-note">Allures du moment : seuil <b>' + prPace(f.paces.T) + '</b> · fractionné <b>' + prPace(f.paces.I) + '</b>' + (a.opt.efPace ? ' · EF réelle <b>' + prPace(a.opt.efPace) + '</b> (FC ≤ 148)' : '') + ' /km'
      + (a.planVdot ? '. Ton plan a été écrit pour un niveau ' + prV(a.planVdot) + '.' : '.') + '</p>'
      + '<p class="pr-note"><b>Sur quoi c\'est calculé</b><br>' + f.sources.map(function(x){ return '• ' + prEsc(x.label) + ' — ' + (x.time || x.pace + '/km' + (x.hr ? ', FC ' + x.hr : '')) + (x.date ? ' (' + prFmtDate(x.date, { day: 'numeric', month: 'short', year: 'numeric' }) + ')' : '') + (x.note ? ' · ' + x.note : '') + ' → ' + prV(x.vdot); }).join('<br>') + '</p></details>';
  } else h += '<div class="pr-card"><p class="pr-note">Aucun niveau calculé pour l\'instant.</p></div>';

  // ── Historique
  const allH = state._plan_reviews || [], hist = allH.slice(-3).reverse();
  const short = function(c, v){ if(c.field === 'km') return v + ' km'; if(c.field === 'skip') return v ? 'non réalisée' : 'prévue'; if(c.field === 'date') return v ? prFmtDate(v, { weekday: 'short', day: 'numeric' }) : ''; if(c.field === 'session') return v && v.t ? v.t + ' · ' + v.km + ' km' : ''; const m = String(v).match(PR_PACE_RE); return c.field === 'detail' && m ? m[0].replace(/\s*\/\s*km$/, '') : String(v); };
  if(hist.length) h += '<p class="pr-sec"><span>Dernières mises à jour</span></p><div class="pr-card">' + hist.map(function(x){
      const idx = allH.indexOf(x);
      const line = (x.undone ? '↩ ' : x.imprevu ? '🧳 ' : '✓ ') + prFmtDate(x.date, { day: 'numeric', month: 'long' }) + ' — ' + (x.imprevu ? 'imprévu (' + ({ indispo: 'indisponible', charge: 'semaine chargée', malade: 'malade' }[x.imprevu] || '') + ') : ' : '') + x.n + ' séance' + (x.n > 1 ? 's' : '') + ' modifiée' + (x.n > 1 ? 's' : '') + (x.coach ? ' (avec le Coach)' : '') + (x.vdot ? ' · niveau ' + String(x.vdot).replace('.', ',') : '');
      if(!(x.changes || []).length) return '<p class="pr-note">' + line + '</p>';
      return '<details class="pr-hist"><summary class="pr-note">' + line + '</summary><ul>' + x.changes.map(function(c){ return '<li><b>' + prEsc(typeof normalizeSessionTitle === 'function' && c.type ? normalizeSessionTitle(c.title, c.type, typeof c.before === 'string' ? c.before : '') || c.title : c.title) + '</b>' + (c.date ? ' · ' + prFmtDate(c.date) : '') + ' : ' + prEsc(short(c, c.before)) + ' → <b>' + prEsc(short(c, c.after)) + '</b></li>'; }).join('') + '</ul>'
        + (x.undone ? '<p class="pr-note">Annulée le ' + prFmtDate(x.undone, { day: 'numeric', month: 'long' }) + '.</p>' : '<button type="button" class="pr-link pr-undo" onclick="if(confirm(\'Annuler cette mise à jour ? Les séances pas encore faites retrouvent leur ancienne version.\')) prUndoReview(' + idx + ')">↩ Annuler cette mise à jour</button>') + '</details>';
    }).join('') + '</div>';
  box.innerHTML = h;
  _prFoot();
}
function _prFoot(){
  const b = document.getElementById('pr-apply'); if(!b || !_prReview) return;
  const n = _prReview.items.filter(function(x){ return x.on; }).length;
  b.disabled = !n; b.textContent = n ? '✓ Appliquer ' + n + ' changement' + (n > 1 ? 's' : '') + ' au plan' : (_prReview.items.length ? 'Aucun changement retenu' : 'Rien à appliquer');
}

// Coach IA : relecture complète du plan (fonction planReview)
async function askCoachPlanReview(force){
  if(!_prReview) return;
  const a = _prReview.a, today = a.opt.today, R = _prReview;
  force = !!force || !!(state._coach_review && state._coach_review.sig === prDataSig());   // redemande sans donnée nouvelle
  const ask = document.querySelector('#pr-content .pr-ask');
  const nW = Object.keys(prSessions(state).reduce(function(o, x){ o[x.w] = 1; return o; }, {})).length;
  const msgs = ['Il relit tes ' + nW + ' semaines de plan, séance par séance…', 'Il regarde tes séances réalisées : allures, FC, ressenti…']
    .concat(a.opt.habitual ? ['Il compare avec ta prépa ' + a.opt.habitualFrom + ' (~' + a.opt.habitual + ' km/sem)…'] : [])
    .concat(a.fit.vdot ? ['Il vérifie tes allures par rapport à ton niveau ' + prV(a.fit.vdot) + '…'] : [])
    .concat(a.opt.postRace ? ['Il tient compte de ta récupération après ta dernière course…'] : [])
    .concat(['Il prépare ses propositions…']);
  if(ask){
    ask.innerHTML = '<div class="pr-cl"><div class="pr-cl-h"><span class="pr-cl-ic">🤖</span><div><b>Le Coach relit ton plan</b><small id="pr-cl-t">0 s · en général 15 à 40 s</small></div></div>'
      + '<p id="pr-cl-msg" class="pr-cl-msg">' + prEsc(msgs[0]) + '</p><div class="pr-bar indet"><i></i></div></div>';
    ask.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  let k = 0; const t0 = Date.now();
  R.clTimer = setInterval(function(){
    const m = document.getElementById('pr-cl-msg'), t = document.getElementById('pr-cl-t'), sec = Math.round((Date.now() - t0) / 1000);
    if(t) t.textContent = sec + ' s · en général 15 à 40 s';
    if(sec && sec % 3 === 0 && m && k < msgs.length - 1){ k++; m.classList.remove('sw'); void m.offsetWidth; m.classList.add('sw'); m.textContent = msgs[k]; }
  }, 1000);
  const weeks = {};
  prSessions(state).forEach(function(s){
    const w = weeks[s.w] = weeks[s.w] || { w: s.w, meta: (function(){ try { return JSON.parse(state['meta_w' + s.w] || '{}'); } catch(e) { return {}; } })(), sessions: [] };
    w.sessions.push({ ref: s.key, date: s.date, type: s.type, title: s.title, detail: s.detail, km: s.kmPlan, done: s.done,
      result: s.done ? (s.date && prDays(s.date, today) <= 56 ? { km: s.km, pace: s.perf.pace || null, hr: s.perf.hr || null, blocs: s.perf.blocsAllure || null, note: s.perf.note || null, rpe: s.perf.rpe || null } : { km: s.km }) : undefined });
  });
  const body = { today: today, race: { name: a.race.name, course: a.race.course, date: a.race.date, objectif: a.race.objectif },
    fitness: a.fit.vdot ? { vdot: a.fit.vdot, basis: a.fit.basis, planVdot: a.planVdot, paces: { seuil: prPace(a.fit.paces.T), fractionne: prPace(a.fit.paces.I), ef_reelle: a.opt.efPace ? prPace(a.opt.efPace) : null },
      predictions: Object.keys(a.fit.preds).reduce(function(o, c){ o[c] = prTime(a.fit.preds[c]); return o; }, {}), sources: a.fit.sources.slice(-12).map(function(x){ return { label: x.label, time: x.time || x.pace, date: x.date, vdot: Math.round(x.vdot * 10) / 10 }; }) } : null,
    postRaceUntil: a.opt.postRaceUntil, habitualKm: a.opt.habitual, history: await prHistory(today).catch(function(){ return []; }), warnings: a.warnings.slice(0, 20).map(function(w){ return w.text; }),
    proposals: R.items.filter(function(p){ return p.src !== 'coach'; }).map(function(p){ return { ref: p.key, champ: p.field, nature: p.kind || 'allure', title: p.title, before: p.before, after: p.after, reason: p.short || p.reason, retenue: !!p.on }; }),
    force: force, next: !!(typeof _prepView !== 'undefined' && _prepView && _prepView.next), startDate: state.plan_start_date || null,
    held: (_prReview.held || []).map(function(p){ return { ref: p.key, title: p.title, date: p.date, before: p.before, allure_a_ton_niveau: p.after }; }),
    plan: Object.keys(weeks).map(function(k){ return weeks[k]; }), memos: state._coach_memos || '',
    reviewHistory: (state._plan_reviews || []).slice(-4).map(function(h){ return { date: h.date, avec_coach: !!h.coach, niveau: h.vdot, changements: (h.changes || []).map(function(c){ return { ref: c.ref, seance: c.title, date: c.date, champ: c.field, avant: c.before, apres: c.after, par: c.src === 'coach' ? 'toi (Coach)' : 'calcul', raison: c.reason }; }) }; }),
    volume: a.volume ? { base_km_sem: a.volume.base, pic_vise_km: a.volume.peak, semaines: a.volume.weeks.map(function(w){ return { semaine: w.w, prevu: w.plan, fait: w.past ? w.done : undefined, conseille: w.target || undefined, raison: w.why || undefined }; }) } : null,
    charge: a.load ? { km_7j: a.load.k7, moyenne_28j_km_sem: a.load.chronic, ratio: a.load.acwr ? Math.round(a.load.acwr * 100) / 100 : null } : null,
    effort_ressenti: a.internal && a.internal.rpes.length ? { seances_14j: a.internal.rpes, charge_ressentie_ratio_7j_28j: a.internal.ratio ? Math.round(a.internal.ratio * 100) / 100 : null } : null,
    douleurs: a.internal && a.internal.pains.length ? a.internal.pains : null,
    derive_cardiaque: a.drift ? { moyenne_pct: Math.round(a.drift.avg * 10) / 10, sorties: a.drift.n, endurance: a.drift.label } : null,
    whoop: a.whoop ? { recup_3j: a.whoop.scores, moyenne: a.whoop.avg3, vfc_vs_moyenne_pct: a.whoop.hrvDrop, fatigue: a.whoop.tired } : null,
    allures_tenues: a.calib && a.calib.n ? { tenues: a.calib.k, total: a.calib.n, detail: a.calib.list.map(function(r){ return { seance: r.title, date: r.date, cible: r.target, realise: prPace(r.real), tenue: r.ok }; }) } : null,
    trajectoire: a.trajectory && a.trajectory.race ? { niveau: a.fit.vdot, tendance_par_semaine: Math.round(a.trajectory.slope * 70) / 10, projection_jour_j: Math.round(a.trajectory.race.v * 10) / 10, fourchette: prTime(a.trajectory.race.lo) + ' – ' + prTime(a.trajectory.race.hi), niveau_objectif: a.trajectory.need ? Math.round(a.trajectory.need * 10) / 10 : null, verdict: a.trajectory.verdict || null } : null,
    lastCoachReview: state._coach_review ? { date: state._coach_review.date, avis: state._coach_review.assessment } : null,
    newSince: state._coach_review ? prDoneSince(state._coach_review.date, state._coach_review.at) : null };
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
    clearInterval(R.clTimer); if(_prReview !== R) return;
    _prMergeCoach(R, items, j.rejected || [], j.assessment || '');
    // avis mémorisé avec ses changements : réaffiché tant qu'ils ne sont pas appliqués
    state._coach_review = { date: today, at: new Date().toISOString(), sig: prDataSig(), assessment: R.coach, rejected: (j.rejected || []).slice(0, 30),
      changes: items.map(function(x){ return { key: x.key, w: x.w, date: x.date, field: x.field, title: x.title, type: x.type, before: x.before, after: x.after, reason: x.reason }; }), applied: !items.length };
    if(dbRef) dbRef.child('_coach_review').set(state._coach_review).catch(function(){});
    _prRender();
    const cc = document.querySelector('#pr-content .pr-coach'); if(cc){ cc.classList.add('pr-pop'); cc.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  } catch(e) {
    clearInterval(R.clTimer); if(_prReview !== R) return;
    alert('Le Coach n\'a pas pu relire le plan (' + e.message + '). Réessaie dans un instant.');
    _prRender();
  }
}

// Fusion des changements du Coach avec les propositions calculées, en gardant les choix déjà faits (coché / décoché,
// « Accélérer quand même »). Une consigne du Coach sur une séance remplacée (footing WHOOP, test…) s'applique à la
// nouvelle séance ; tout autre changement du Coach sur cette séance retire le remplacement. « ref » ou « ref:champ » écartés.
function _prMergeCoach(R, items, rejected, assessment){
  const rej = {}; (rejected || []).forEach(function(r){ rej[String(r)] = 1; });
  const isRej = function(p){ return rej[p.key] || rej[p.key + ':' + p.field]; };
  // toujours repartir de toutes les propositions calculées (avec les choix faits), pas de la liste déjà filtrée
  const base = (R.auto || R.items).filter(function(p){ return p.src !== 'coach'; });
  base.forEach(function(p){ if(p._after0){ p.after = p._after0; p.short = p._short0; } });
  const autoSession = {}; base.forEach(function(p){ if(p.field === 'session' && !isRej(p)) autoSession[p.key] = p; });
  const coachField = {}, coachAny = {};
  const coach = items.filter(function(x){
    const sp = autoSession[x.key];
    if(sp && x.field === 'detail'){ sp._after0 = sp._after0 || sp.after; sp._short0 = sp._short0 != null ? sp._short0 : (sp.short || ''); sp.after = Object.assign({}, sp._after0, { d: x.after }); sp.short = sp._short0 + ' Consigne ajustée par le Coach.'; return false; }
    coachField[x.key + '|' + x.field] = 1; coachAny[x.key] = 1; return true;
  });
  const keep = base.filter(function(p){ return !isRej(p) && !coachField[p.key + '|' + p.field] && !(p.field === 'session' && coachAny[p.key]); });
  coach.forEach(function(x){ x.on = true; const d = prRevertOf(x); if(d){ x.revert = d; x.on = false; } });
  R.items = keep.concat(coach).sort(function(x, y){ return (x.date || '').localeCompare(y.date || '') || x.w - y.w; });
  R.held = (R.held || []).filter(function(p){ return !coachAny[p.key]; });
  R.rejected = (rejected || []).length; R.coach = assessment;
}
// Avis du Coach pas encore appliqué (même données) : ses changements encore valables sont proposés de nouveau
function _prRestoreCoach(R){
  const c = state._coach_review; if(!c || c.applied || !c.changes || !c.changes.length || c.sig !== prDataSig()) return;
  const byKey = {}; prSessions(state).forEach(function(s){ byKey[s.key] = s; });
  const cur = function(s, f){ return f === 'detail' ? s.detail : f === 'title' ? s.title : f === 'km' ? s.kmPlan : f === 'type' ? s.type : null; };
  const items = c.changes.filter(function(x){ const s = byKey[x.key]; return s && !s.done && String(cur(s, x.field)) === String(x.before); })
    .map(function(x){ return Object.assign({ on: true, src: 'coach' }, x); });
  if(items.length) _prMergeCoach(R, items, c.rejected || [], c.assessment || '');
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
    else if(p.field === 'km'){ const nd = prKmDetail(det, x.type, x.km, p.after); x.km = +p.after; if(nd !== det){ x.d = title + '|' + nd; p.detBefore = det; p.detAfter = nd; } }
    else if(p.field === 'type' && ['ef', 'long', 'tempo', 'frac'].indexOf(p.after) >= 0) x.type = p.after;
    else if(p.field === 'session' && p.after && p.after.t){ x.d = p.after.t + '|' + p.after.d; x.km = +p.after.km; if(['ef', 'long', 'tempo', 'frac', 'rest'].indexOf(p.after.type) >= 0) x.type = p.after.type; }
    else return;
    x._modified = true; x._seq = (x._seq || 0) + 1;
    state[p.key] = JSON.stringify(x); touched[p.key] = 1; n++;
  });
  const hist = (state._plan_reviews || []).slice(-5);
  hist.push({ date: prTodayIso(), n: Object.keys(touched).length, coach: sel.some(function(p){ return p.src === 'coach'; }), vdot: _prReview.a.fit.vdot || null, sig: prDataSig(),
    changes: sel.filter(function(p){ return touched[p.key]; }).slice(0, 200).map(function(p){ return { ref: p.key, title: p.title, type: p.type || null, kind: p.kind || null, detBefore: p.detBefore, detAfter: p.detAfter, date: p.date || null, field: p.field, before: p.before, after: p.after, src: p.src, reason: String(p.short || p.reason || '').slice(0, 140) }; }) });
  state._plan_reviews = hist;
  if(state._coach_review && sel.some(function(p){ return p.src === 'coach'; })) state._coach_review.applied = true;
  save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  const k = Object.keys(touched).length;
  closePlanReview();
  try { renderHome(); } catch(e) {}
  if(typeof showToast === 'function') showToast(k + ' séance' + (k > 1 ? 's' : '') + ' mise' + (k > 1 ? 's' : '') + ' à jour');
}
