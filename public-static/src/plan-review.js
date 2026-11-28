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
// Titre cohérent avec la consigne et le type (génération, MAJ du plan, Coach, pilote, plan en cours) :
// « + accélérations / lignes droites / strides / éducatifs » retiré du titre quand la consigne dit « sans … » (ou « sans intensité »),
// ou quand une nouvelle consigne (oldDet = l'ancienne) ne les mentionne plus ; séance devenue facile avec un titre de séance de
// qualité (fractionné, tempo, 6×1000…) → « Footing EF » / « Sortie longue » ; l'inverse → « Fractionné » / « Tempo ». Course : inchangée.
const PR_ACC_RE = /acc[ée]l[ée]rations?|lignes?\s+droites?|strides?|[ée]ducatifs?/i;
const PR_NOACC_RE = /\b(sans|aucune?|pas\s+d['’e]?|ni)\s*(les\s+|d['’]\s*)?(acc[ée]l[ée]ration|ligne|stride|[ée]ducatif|intensit)/i;
function prTitleFor(title, det, type, oldDet){
  let t = String(title || '').trim(); const d = String(det || '');
  if(type === 'race' || type === 'rest') return t;
  const def = type === 'long' ? 'Sortie longue' : type === 'frac' ? 'Fractionné' : type === 'tempo' ? 'Tempo' : 'Footing EF';
  if(PR_ACC_RE.test(t) && (PR_NOACC_RE.test(d) || (oldDet != null && PR_ACC_RE.test(String(oldDet)) && !PR_ACC_RE.test(d.replace(PR_NOACC_RE, ''))))){
    t = t.replace(/\s*(\+|&|avec|et)\s*(quelques\s+|\d+\s*[×x]?\s*)?(acc[ée]l[ée]rations?|lignes?\s+droites?|strides?|[ée]ducatifs?)(\s+(progressives|légères|courtes))?/ig, '').trim();
    if(PR_ACC_RE.test(t)) t = def;
    if(/^ef$/i.test(t) || (type === 'ef' && /^footing$/i.test(t))) t = 'Footing EF';
  }
  if((type === 'ef' || type === 'long') && /fractionn|tempo|seuil|\bvma\b|\d+\s*[×x]\s*\d|allure\s+(course|semi|marathon|10)/i.test(t)) t = def;
  if((type === 'frac' || type === 'tempo') && /^(footing|sortie longue|ef\b|récup)/i.test(t)) t = def;
  return t || def;
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
  else if(age < 0 || age > 540) return null;                                    // course pas encore courue à cette date / trop ancienne
  // fraîcheur : une course compte pleinement 8 semaines, puis perd ~0,5 point toutes les 8 semaines (tes séances peuvent la confirmer)
  else if(age > 56){ v -= (age - 56) / 112; note = 'il y a ' + (age < 60 ? Math.round(age / 7) + ' sem.' : Math.round(age / 30) + ' mois') + ' : compte moins'; }
  if(cat === 'Marathon'){ v += 0.8; note = (note ? note + ' · ' : '') + 'marathon corrigé +0,8'; }
  return { vdot: v, note: note };
}
// ─── Niveau d'après l'allure et la FC des sorties en endurance (réserve cardiaque, Karvonen / Swain) ───
// %FCR ≈ %VO2R : VO2max ≈ 3,5 + (VO2 de l'allure − 3,5) / %FCR, avec le coût en O2 de Daniels (même échelle que le VDOT).
// Sortie retenue : EF / longue de 20 à 110 min, 55-92 % de la FC de réserve, allure corrigée de la chaleur, pas un lendemain d'alcool.
// FC max : zones recalées, sinon la plus haute observée (pic isolé écarté), sinon déclarée ; FC repos : médiane des 30 jours avant la date.
function prHrRef(st, done, today){
  const man = typeof hrManualMax === 'function' ? hrManualMax(st) : null;   // FC max saisie : la référence
  let max = man ? man.v : st._hr_zones && +st._hr_zones.fcMax ? +st._hr_zones.fcMax : null;
  if(!max){
    const m = done.filter(function(s){ return s.date && prDays(s.date, today) <= 365 && prDays(s.date, today) >= 0; })
      .map(function(s){ return parseInt(((s.perf || {}).strava || {}).fcMax) || 0; }).filter(function(v){ return v >= 150 && v <= 220; }).sort(function(a, b){ return b - a; });
    if(m.length) max = m.length > 1 && m[0] - m[1] > 4 ? m[1] : m[0];
  }
  if(!max) max = parseInt(st.fc_max) || parseInt((st.onboarding || {}).fc_max) || null;
  const rs = [];
  for(let k = 0; k <= 30; k++){ const v = parseInt(st['fc_repos_' + prAddDays(today, -k)]); if(v >= 30 && v <= 90) rs.push(v); }
  if(rs.length < 3) (((st.whoop_data || {}).recoveries) || []).forEach(function(r){ if(r && r.date && r.rhr >= 30 && r.rhr <= 90 && r.date <= today && prDays(r.date, today) <= 30) rs.push(+r.rhr); });
  rs.sort(function(a, b){ return a - b; });
  const rest = rs.length >= 3 ? rs[Math.floor(rs.length / 2)] : null;
  return max && rest && max - rest >= 80 ? { max: max, rest: rest } : null;
}
function prRunVdot(s, H, useAlc){
  if(!s || !s.done || !(s.type === 'ef' || s.type === 'long') || !s.perf || !s.perf.pace || !H) return null;
  if(useAlc && typeof alcRunAffected === 'function' && alcRunAffected(s.date)) return null;
  const hr = parseInt(s.perf.hr), p = prPaceSec(s.perf.pace); if(!hr || !p || p < 180 || p > 540) return null;
  const min = (s.km || 0) * p / 60; if(min < 20 || min > 110) return null;
  const r = (hr - H.rest) / (H.max - H.rest); if(r < 0.55 || r > 0.92) return null;
  // allure équivalente plat et frais (dénivelé + météo, prEqPace) ; à défaut, chaleur seule
  const E = typeof prEqPace === 'function' ? prEqPace(s.perf, s.km) : null;
  const wx = typeof prWxAdjFromMeteo === 'function' ? prWxAdjFromMeteo(s.perf.meteo).pct : 0;
  return 3.5 + (prVo2(E ? E.eq : p / (1 + wx / 100)) - 3.5) / r;
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
  // séances réalisées : tout l'historique (toutes les prépas) pour la prépa en cours, sinon celles de la copie analysée
  // (opt.done : historique déjà chargé, filtré à la date demandée — courbe du niveau dans le temps)
  const doneAll = opt.done ? opt.done.filter(function(s){ return s.date && s.date <= today; })
    : st === state && typeof prAllDone === 'function' ? prAllDone(today) : prSessions(st).filter(function(s){ return s.done; });
  // séances test (5 km à fond) réalisées : comptent comme une course
  doneAll.forEach(function(s){ if(s.done && /^Test\b/i.test(s.title) && s.date && typeof prTestTime === 'function'){ const t = prTestTime(s); if(t) addRace('5 km', prTime(t), s.date, 'Test 5 km'); } });
  // blocs de qualité récents
  const sess = doneAll, recent = [];
  sess.forEach(function(s){
    if(!s.done || !s.date || prDays(s.date, today) > 56 || prDays(s.date, today) < 0) return;
    if(st === state && typeof alcRunAffected === 'function' && alcRunAffected(s.date)) return;   // lendemain d'alcool : allure / FC faussées, ni repère ni « séance manquée »
    const it = prIntent(s); if(it !== 'T' && it !== 'I' && it !== 'race') return;
    const bl = (s.perf.blocsAllure || []).map(function(b){ const m = String(b).match(/(\d{1,2})['’:](\d{2})/); return m ? prParsePace(m[1], m[2]) : null; }).filter(Boolean);
    if(bl.length < 2) return;
    const wx = typeof prWxAdjFromMeteo === 'function' ? prWxAdjFromMeteo(s.perf.meteo).pct : 0;
    const avg = bl.reduce(function(a, b){ return a + b; }, 0) / bl.length / (1 + wx / 100), hr = parseInt(s.perf.hr) || null;   // allure équivalente sans chaleur
    // seuil ≈ 88 % VDOT, fractionné ≈ 97,5 % ; FC moyenne de séance basse = effort contenu (marge)
    const pct = it === 'I' ? 0.975 : it === 'race' ? 0.9 : 0.88;
    let v = vdotFromPaceAt(avg, pct);
    if(hr && hr > 0.93 * hrMax) v -= 0.8;
    // marge ressentie (plan-adapt.js) : séance tenue avec de la réserve (effort, FC) = signal plus fort, à la limite = plus faible
    const ab = st === state && typeof paAbsorb === 'function' ? paAbsorb(s, st, { today: today }) : null;
    if(ab && ab.margin >= 1) v += 0.4; else if(ab && ab.margin <= -1) v -= 0.3;
    // blocs nettement plus lents que la consigne (corrigée de la chaleur) : allure non tenue
    const missed = !!(s.pace && avg > s.pace.hi + 3);
    recent.push({ kind: 'séance', label: s.title + (s.perf._blocsAuto || s.perf.blocsAuto ? ' (tours Strava)' : '') + (wx >= 1 ? ' (corrigé chaleur +' + prV(wx) + ' %)' : ''), date: s.date, pace: prPace(avg), hr: hr, vdot: v, missed: missed });
  });
  src.push.apply(src, recent);
  const races = src.filter(function(x){ return x.kind === 'course'; }), sesV = recent.map(function(x){ return x.vdot; }).sort(function(a, b){ return a - b; });
  const bestRace = races.length ? races.slice().sort(function(a, b){ return b.vdot - a.vdot; })[0] : null, raceBest = bestRace ? bestRace.vdot : null;
  // niveau des séances : moyenne pondérée par la fraîcheur (poids divisé par 2 toutes les 3 semaines) — chaque séance compte ;
  // à partir de 4 séances, la plus haute et la plus basse sont écartées (valeurs aberrantes)
  const sesMed = (function(){
    if(recent.length < 2) return null;
    let l = recent.slice().sort(function(a, b){ return a.vdot - b.vdot; });
    if(l.length >= 4) l = l.slice(1, -1);
    let sw = 0, sv = 0; l.forEach(function(x){ const w = Math.pow(0.5, Math.max(0, prDays(x.date, today)) / 21); sw += w; sv += w * x.vdot; });
    return sw ? sv / sw : null;
  })();
  // « niveau du moment » : meilleure course (selon sa fraîcheur), relevée par les séances de qualité, abaissée par des
  // séances manquées, une coupure ou une endurance en recul ; why = ce qui a fait bouger le niveau
  const why = [];
  let vdot = raceBest, basis = 'courses';
  if(bestRace) why.push({ k: 'base', t: bestRace.label + (bestRace.date ? ' (' + prFmtDate(bestRace.date) + ')' : '') + (bestRace.note ? ' — ' + bestRace.note : ''), v: raceBest, base: true });
  if(sesMed && (!vdot || sesMed > vdot)){
    const nv = raceBest ? Math.min(sesMed, raceBest + 2) : sesMed;
    if(raceBest) why.push({ k: 'qual', t: 'séances de qualité récentes', d: nv - raceBest }); else why.push({ k: 'qual', t: 'séances de qualité récentes', v: nv, base: true });
    vdot = nv; basis = 'séances récentes';
  }
  // allure + FC des sorties en endurance (3 dernières semaines, médiane), calées sur tes courses : écart moyen entre le niveau
  // d'une course et celui de tes sorties des 4 semaines d'avant (corrige l'erreur de FC max / repos) ; sans course, poids réduit
  const H = prHrRef(st, doneAll, today), useAlc = st === state;
  const runMed = function(end, days){ const v = doneAll.filter(function(s){ const d = prDays(s.date, end); return s.date && d >= 0 && d < days; }).map(function(s){ return prRunVdot(s, H, useAlc); }).filter(function(x){ return x != null; }).sort(function(a, b){ return a - b; });
    return v.length >= 3 ? { v: v[Math.floor(v.length / 2)], n: v.length } : null; };
  const hNow = H ? runMed(today, 21) : null;
  let hrEst = null;
  if(hNow){
    const offs = races.filter(function(r){ return r.date && r.date <= today; }).map(function(r){ const m = PR_RACE_M[r.cat], sec = prTimeSec(r.time); if(!m || !sec) return null;
      const at = runMed(prAddDays(r.date, -1), 28); return at ? vdotFromRace(m, sec) + (r.cat === 'Marathon' ? 0.8 : 0) - at.v : null; }).filter(function(x){ return x != null && Math.abs(x) <= 8; }).sort(function(a, b){ return a - b; });
    // sans course pour caler : seulement l'évolution (3 dernières semaines vs 6-12 semaines avant), jamais la valeur brute
    const prev = offs.length ? null : runMed(prAddDays(today, -42), 42);
    if(offs.length) hrEst = { v: hNow.v + offs[Math.floor(offs.length / 2)], n: hNow.n, cal: offs.length };
    else if(prev) hrEst = { rel: (hNow.v - prev.v) / 2, n: hNow.n, cal: 0 };
  }
  if(!vdot && st.vo2max_current){ vdot = parseFloat(st.vo2max_current) * 0.9; basis = 'VO2max montre'; why.push({ k: 'base', t: 'VO2max de la montre', v: vdot, base: true }); }
  if(!vdot) return { vdot: null, sources: src, hrMax: hrMax, why: why };
  if(hrEst && !hrEst.cal){
    const d = Math.max(-0.7, Math.min(0.7, hrEst.rel));
    if(Math.abs(d) >= 0.1){ vdot += d; why.push({ k: 'hr', t: 'allure à FC égale de tes sorties ' + (d > 0 ? 'en progrès' : 'en recul') + ' (6 sem.)', d: d }); }
  } else if(hrEst){
    // poids : la base (course) compte moins en vieillissant ; les sorties comptent plus quand elles sont calées sur des courses
    const ageR = basis === 'courses' && bestRace && bestRace.date ? prDays(bestRace.date, today) : 0;
    const wB = Math.max(0.3, 1 - Math.max(0, ageR - 56) / 360), wH = hrEst.cal ? Math.min(1, 0.5 + 0.25 * hrEst.cal) : 0.3;
    const cap = hrEst.cal ? 1.5 : 0.7, d = Math.max(-cap, Math.min(cap, (hrEst.v - vdot) * wH / (wH + wB)));
    if(Math.abs(d) >= 0.1){ vdot += d; why.push({ k: 'hr', t: 'allure et FC de tes ' + hrEst.n + ' sorties récentes' + (hrEst.cal ? ' (calé sur ' + hrEst.cal + ' course' + (hrEst.cal > 1 ? 's' : '') + ')' : ''), d: d }); }
  }
  // séances de qualité manquées : ≥ 3 sur 6 semaines nettement sous le niveau → baisse (moitié de l'écart, 1,5 au plus)
  const miss = recent.filter(function(x){ return x.missed && prDays(x.date, today) <= 42; }).map(function(x){ return x.vdot; }).sort(function(a, b){ return a - b; });
  if(miss.length >= 3){
    const mm = miss[Math.floor(miss.length / 2)];
    if(mm < vdot - 0.5){ const d = -Math.min(1.5, (vdot - mm) / 2); vdot += d; why.push({ k: 'miss', t: miss.length + ' séances de qualité sous l\'allure prévue (6 sem.)', d: d }); }
  }
  // coupure : plus de 10 jours sans courir → −0,35 par semaine d'arrêt (3 au plus), effacé progressivement à la reprise
  // (une course enregistrée compte comme une sortie, même sans séance validée ce jour-là)
  // (seulement dans la période couverte par l'historique : un record plus ancien que la 1re séance n'invente pas de pause)
  const runD = doneAll.filter(function(s){ return s.date && s.date <= today && s.type !== 'rest'; }).map(function(s){ return s.date; }).sort();
  const runs = runD.concat(races.filter(function(r){ return r.date && r.date <= today && runD.length && r.date >= runD[0]; }).map(function(r){ return r.date; })).sort();
  if(runs.length){
    let gap = 0, back = null, from = null;
    for(let i = 1; i < runs.length; i++){ const g = prDays(runs[i - 1], runs[i]); if(g > 10 && prDays(runs[i], today) <= 60){ gap = g; back = runs[i]; from = runs[i - 1]; } }
    const cur = prDays(runs[runs.length - 1], today); if(cur > 10){ gap = cur; back = null; from = runs[runs.length - 1]; }
    // repos prévu après une course (≈ 1 jour par mile : marathon 26 j, semi 13 j, 10 km 6 j) : pas une perte de forme
    const REC = { 'Marathon': 26, 'Semi-marathon': 13, '10 km': 6, '5 km': 3 };
    const raceRest = from && races.some(function(r){ return r.date && Math.abs(prDays(r.date, from)) <= 2 && gap <= (REC[r.cat] || 7) + 3; });
    if(gap && !raceRest){
      const pen = Math.min(3, 0.35 * (gap - 7) / 7), left = back ? Math.max(0, 1 - prDays(back, today) / gap) : 1;
      const raceAfter = back && races.some(function(r){ return r.date && r.date >= back; });
      const d = raceAfter ? 0 : -pen * left;
      if(d <= -0.05){ vdot += d; why.push({ k: 'gap', t: back ? 'reprise après ' + gap + ' jours sans courir' : gap + ' jours sans courir', d: d }); }
    }
  }
  // endurance : allure à FC égale des footings, 3 dernières semaines vs 6-12 semaines avant (±0,5 au plus)
  const efE = function(a, b){ const l = doneAll.filter(function(s){ const d = prDays(s.date, today); return (s.type === 'ef' || s.type === 'long') && d >= a && d <= b && s.perf && s.perf.pace && parseInt(s.perf.hr) >= 100 && !(st === state && typeof alcRunAffected === 'function' && alcRunAffected(s.date)); })
    .map(function(s){ const p = prPaceSec(s.perf.pace), wx = typeof prWxAdjFromMeteo === 'function' ? prWxAdjFromMeteo(s.perf.meteo).pct : 0; return p ? 60000 / p * (1 + wx / 100) / parseInt(s.perf.hr) : null; }).filter(Boolean);
    return l.length >= 3 ? prMean(l) : null; };
  const e1 = hNow ? null : efE(0, 21), e0 = hNow ? null : efE(42, 84);   // déjà compté par la composante « allure et FC »
  if(e1 && e0){ const pct = (e1 - e0) / e0 * 100, d = Math.max(-0.5, Math.min(0.5, pct * 0.1)); if(Math.abs(d) >= 0.1){ vdot += d; why.push({ k: 'ef', t: 'endurance (allure à FC égale) ' + (d > 0 ? 'en progrès' : 'en recul') + ' de ' + Math.round(Math.abs(pct)) + ' %', d: d }); } }
  vdot = Math.round(vdot * 10) / 10;
  const paces = { T: paceAtPct(vdot, 0.88), I: paceAtPct(vdot, 0.975), R: paceAtPct(vdot, 1.05), E: [paceAtPct(vdot, 0.70), paceAtPct(vdot, 0.62)] };
  const preds = {}; Object.keys(PR_RACE_M).forEach(function(c){ preds[c] = raceTimeFromVdot(vdot, PR_RACE_M[c]); });
  return { vdot: vdot, basis: basis, paces: paces, preds: preds, sources: src, hrMax: hrMax, why: why, hr: hNow ? { runs: hNow.n, ref: H } : null };
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
// niveau des allures écrites aujourd'hui (après les mises à jour) : ce que montre la tuile « plan »
function prPlanVdotNow(st){
  const v = [];
  prSessions(st).forEach(function(s){ const it = prIntent(s); if(!PR_PCT[it] || !s.pace || s.done || s.skip) return; v.push(prVo2((s.pace.lo + s.pace.hi) / 2) / PR_PCT[it]); });
  if(!v.length) return null;
  v.sort(function(a, b){ return a - b; });
  return v[Math.floor(v.length / 2)];
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
  // … sauf si une course plus récente que cette consigne a donné un nouveau repère (ex. 10 km juste couru)
  // … et plus du tout dès que ton niveau a bougé d'un point depuis, ou après 4 semaines : le plan suit toujours ton niveau
  const byCoach = {}, coachAt = {}, lastRace = opt.lastRace && opt.lastRace.date ? opt.lastRace.date : null;
  (st._plan_reviews || []).forEach(function(h){ if(h.undone) return;
    const old = (lastRace && h.date && h.date < lastRace) || (h.date && prDays(h.date, today) > 28) || (h.vdot && Math.abs(fit.vdot - h.vdot) >= 1);
    (h.changes || []).forEach(function(c){ if(c.field === 'detail'){ byCoach[c.ref] = c.src === 'coach' && !old ? c.after : null; coachAt[c.ref] = h.date; } }); });
  // pourquoi chaque séance de qualité à venir bouge ou non (affiché quand rien n'est proposé)
  const trace = opt.trace || null, tr = function(s, it, st0, extra){ if(trace && it && it !== 'E' && s.date && prDays(today, s.date) <= 28) trace.push(Object.assign({ key: s.key, title: s.title, date: s.date, intent: it, st: st0, cur: s.pace ? s.pace.text.replace(/\s*\/\s*km$/, '') : null }, extra || {})); };
  // course récente (≤ 3 semaines) = repère sûr, comme le veut Daniels : l'écart est rattrapé en une fois (30 s/km au plus)
  const freshRace = !opt.auto && !!lastRace && prDays(lastRace, today) >= 0 && prDays(lastRace, today) <= 21;
  prSessions(st).forEach(function(s){
    if(s.done || s.skip || (s.date && s.date < today)) return;
    if(s.x && s.x.lib) return;                                                    // séance de la bibliothèque : allures recalées par slProposals
    const it = prIntent(s); if(!it) return;
    if(!s.pace){ tr(s, it, 'nopace'); return; }
    if(byCoach[s.key] != null && byCoach[s.key] === s.detail){ tr(s, it, 'coach', { since: coachAt[s.key] }); return; }
    const mid = (s.pace.lo + s.pace.hi) / 2, half = Math.max(2, (s.pace.hi - s.pace.lo) / 2);
    let nmid, why, short;
    if(it === 'E'){
      // EF : uniquement si ton allure EF réelle (FC ≤ plafond EF, hrEfMax) sort nettement de la plage ; jamais les footings « très facile »
      if(!efObs || opt.postRace || /très facile|récup/i.test(s.title + ' ' + s.detail)) return;
      if(efObs >= s.pace.lo - 10 && efObs <= s.pace.hi + 10) return;
      if(opt.drift && opt.drift.avg >= 5 && efObs < s.pace.lo) return;                   // dérive cardiaque élevée : on n'accélère pas l'EF
      nmid = efObs + (s.pace.hi - s.pace.lo) / 2 - 5; why = 'ton allure EF réelle (FC ≤ ' + hrEfMax() + ') est ' + prPace(efObs) + '/km';
      short = 'Ton endurance réelle (FC ≤ ' + hrEfMax() + ') tourne à ' + prPace(efObs) + '/km : la plage est recalée dessus.';
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
    if(Math.abs(mid - nmid) < 4){ tr(s, it, 'ok', { target: prPace(nmid) }); return; }   // écart < 4 s/km : on laisse
    let capped = false;
    const capF = freshRace && it !== 'E' ? 30 : opt.calib === 'prudent' ? 5 : opt.calib === 'confiant' ? 12 : 10;
    if(nmid < mid - capF){ nmid = mid - capF; capped = true; }                 // progression prudente : 10 s/km au plus par mise à jour (5 si prudent, 12 si confiant)
    const lo = nmid - half, hi = nmid + half;
    const txt = s.pace.range ? prPace(lo) + ' — ' + prPace(hi) + ' /km' : prPace(nmid) + '/km';
    let det = s.detail.replace(s.pace.text, txt);
    // temps par répétition entre parenthèses « (3'28 — 3'36) » : recalculés
    const rep = (s.title + ' ' + s.detail).match(/(\d+)\s*[×x]\s*(\d[\d\s]*?)\s*m\b/), repM = rep ? parseInt(rep[2].replace(/\s/g, '')) : null;
    if(repM) det = det.replace(/\((\d{1,2})['’](\d{2})\s*[—–-]\s*(\d{1,2})['’](\d{2})\)/, '(' + prPace(lo * repM / 1000) + ' — ' + prPace(hi * repM / 1000) + ')');
    const d = Math.round(nmid - mid);
    const held = d < 0 && opt.noFasterUntil && s.date && s.date <= opt.noFasterUntil;   // début de récupération post-course : mise en attente
    tr(s, it, held ? 'held' : 'change', { target: txt.replace(/\s*\/\s*km$/, ''), delta: d });
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
  if(typeof prStravaRaces === 'function') prStravaRaces().forEach(function(r){ if(!out.some(function(o){ return o.date === r.date && o.cat === r.cat; })) out.push(r); });   // courses Strava
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
      const ef = prObservedEf(st, p.date); if(ef) o.allure_ef_plafond = prPace(ef);
    }
    out.push(o);
  }
  return out;
}
// allure EF réelle : médiane des 5 dernières sorties EF / longues à FC ≤ plafond EF (148 ou zones recalées, hrEfMax) (6 dernières semaines,
// toutes prépas confondues pour la prépa en cours)
function prObservedEf(st, today){
  const v = (st === state && typeof prAllDone === 'function' ? prAllDone(today) : prSessions(st)).filter(function(s){ return !(st === state && typeof alcRunAffected === 'function' && alcRunAffected(s.date)) && s.done && (s.type === 'ef' || s.type === 'long') && s.date && prDays(s.date, today) <= 42 && s.perf.pace && parseInt(s.perf.hr) && parseInt(s.perf.hr) <= hrEfMax(st); })
    .sort(function(a, b){ return b.date.localeCompare(a.date); }).slice(0, 5)
    .map(function(s){ const E = typeof prEqPace === 'function' ? prEqPace(s.perf, s.km) : null; if(E) return E.eq;   // sur plat, par temps frais
      const m = String(s.perf.pace).match(/(\d{1,2})['’:](\d{2})/); return m ? prParsePace(m[1], m[2]) : null; }).filter(Boolean).sort(function(a, b){ return a - b; });
  return v.length >= 2 ? v[Math.floor(v.length / 2)] : null;
}
// analyse complète de la prépa affichée (en cours, ou à venir ouverte avec « Voir et modifier »)
function prAnalyze(mode){   // mode.auto : pilote de nuit (jamais de rattrapage d'allure en grand, il applique sans te demander)
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
    habitual: lp ? lp.vol.avg : null, habitualFrom: lp ? (lp.race || lp.title) : null, habitualPeak: lp ? lp.vol.peak : null, lastRace: last ? { cat: last.cat, date: last.date } : null, auto: !!(mode && mode.auto) };
  const opt2 = typeof prLoad === 'function';                                     // plan-optim.js chargé
  const a = { fit: fit, opt: opt, race: R };
  if(opt2){
    a.load = prLoad(today); a.drift = prDrift(today); a.whoop = prWhoop(today); a.calib = prCalib(state);
    if(typeof prInternal === 'function') a.internal = prInternal(today);
    if(typeof prStride === 'function') a.stride = prStride(today);              // FC à allure égale et cadence (body-signals.js)
    a.recette = state._recette || null; opt.recette = a.recette;
    // tout l'historique rejoué (plan-adapt.js) : progression tenue, meilleur volume, recalage des temps prévus, effort habituel
    if(typeof paHist === 'function'){ a.hist = paHist(today); const HV = a.hist && a.hist.vol; opt.histProg = HV && HV.prog || null; opt.histBest4 = HV && HV.best4 || null; }              // ce que tes prépas précédentes ont appris (prep-debrief.js)
    // ce que tu encaisses (plan-adapt.js) : tendance des 3 dernières semaines, objectif → volume visé
    if(typeof paTrend === 'function'){ a.absorb = paTrend(state, today); opt.absorb = a.absorb; }
    if(goalSec && raceCat && PR_RACE_M[raceCat]) opt.goalVdot = vdotFromRace(PR_RACE_M[raceCat], goalSec);
    opt.noVolumeUp = !!(a.whoop && a.whoop.tired) || !!(a.internal && a.internal.pains.some(function(x){ return x.level >= 2; })) || !!(a.stride && a.stride.level >= 2);
    opt.drift = a.drift; opt.calib = a.calib.n >= 2 || !(a.recette && a.recette.calib) ? a.calib.mode : a.recette.calib;   // sans recul dans cette prépa : réglage de ta recette
    a.volume = prVolumePlan(state, a); opt.volumeManaged = !!a.volume; opt.volumeWeeks = a.volume ? a.volume.horizonWeeks : null;
  }
  opt.trace = [];
  const all = prPaceProposals(state, fit, opt);
  a.paceTrace = opt.trace; delete opt.trace;
  // échelles des séances de qualité (plan-adapt.js) : la séance change de palier avec l'allure du jour déjà dedans
  if(opt2 && typeof paLadderCalib === 'function') a.ladderCalib = paLadderCalib(state, today);   // les paliers d'avant ont-ils été tenus ?
  const ladder = opt2 && typeof paLadderProposals === 'function' ? paLadderProposals(state, a, all).concat(paLongProposals(state, a, all)) : [];
  const habit = opt2 && typeof paHabitProposals === 'function' ? paHabitProposals(state, a) : [];
  // bibliothèque de séances (session-lib.js) : profil de coureur, séances proposées / recalées / montées d'un palier
  if(opt2 && typeof slProfile === 'function'){ try { a.profile = slProfile(state, a); a.libOffer = slOffer(state); } catch(e) { diagSilent(e, 'plan-review:slProfile'); } }
  const lib = opt2 && typeof slProposals === 'function' ? (function(){ try { return slProposals(state, a); } catch(e) { diagSilent(e, 'plan-review:slProposals'); return []; } })() : [];
  // version pro seulement quand elle sert (session-lib.js) : conseil séance par séance, proposé dans les 14 jours
  let advice = [];
  if(opt2 && typeof slAdvice === 'function'){ try { a.advice = slAdvice(state, a); slAdviceStore(state, a, a.advice); advice = slAdviceProposals(state, a, a.advice); } catch(e) { diagSilent(e, 'plan-review:slAdvice'); } }
  // une proposition par séance et par champ : douleur > WHOOP > séance test > palier > volume / allure
  const extra = opt2 ? (typeof prPainProposals === 'function' ? prPainProposals(state, a, a.internal) : []).concat(prWhoopProposals(state, a, a.whoop)).concat([prTestProposal(state, a)].filter(Boolean)).concat(lib).concat(ladder).concat(advice).concat(habit).concat(a.volume ? a.volume.proposals : []) : [];
  const seen = {}, merged = [];
  extra.concat(all).forEach(function(p){
    const k = p.key + '|' + (p.field === 'session' ? 'session' : p.field), ks = p.key + '|session';
    if(seen[k] || (p.field !== 'session' && seen[ks]) || (p.field === 'session' && Object.keys(seen).some(function(x){ return x.indexOf(p.key + '|') === 0; }))) return;
    seen[k] = 1; merged.push(p);
  });
  // échanges de jours (WHOOP, vraie semaine) : les deux séances ensemble ou aucune ; une séance déplacée une seule fois
  const pairs = {}; merged.forEach(function(p){ if(p.pair) pairs[p.pair] = (pairs[p.pair] || 0) + 1; });
  for(let i = merged.length - 1; i >= 0; i--){ const p = merged[i]; if(p.pair && pairs[p.pair] !== 2) merged.splice(i, 1); }
  merged.sort(function(x, y){ return (x.date || '').localeCompare(y.date || '') || x.w - y.w; });
  a.proposals = merged.filter(function(p){ return !p.held; }); a.held = merged.filter(function(p){ return p.held; });
  a.warnings = prChecks(state, fit, opt); a.planVdot = prPlanVdot(state); a.planVdotNow = prPlanVdotNow(state);
  if(opt2){
    a.trajectory = prTrajectory(a);
    a.greenLight = prGreenLight(state, a, a.whoop);
    if(typeof paGoalCheck === 'function') a.goalCheck = paGoalCheck(a, state);
    if(typeof paNextWeek === 'function') a.nextWeek = paNextWeek(a, today);
  }
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
    if(!window._prPrefetchedOnce){ window._prPrefetchedOnce = true; prPrefetch().then(function(){ if(typeof rendered !== 'undefined'){ rendered.plan = false; try { if(document.getElementById('sc-plan').style.display !== 'none') renderPlan(); } catch(e) { diagSilent(e, 'plan-review:planReviewPending'); } } }); }
    return 0;                                                                    // pastille calculée une fois la prépa précédente chargée
  }
  try { const a = prAnalyze(); return a.proposals.length && prSig(a.proposals) !== state._review_seen ? a.proposals.length : 0; } catch(e) { return 0; }
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
function renderRecordsRow(){
  const el = document.getElementById('records-sub'); if(!el) return;
  const t = PR_CATS.filter(function(c){ return state[PR_RECORD_KEY[c]]; }).map(function(c){ return prCatLabel(c).toLowerCase() + ' ' + state[PR_RECORD_KEY[c]]; });
  el.textContent = t.length ? t.join(' · ') : '5 km, 10 km, semi, marathon';
}

// ─── Fenêtre « Mise à jour du plan » ────────────────────────────────────────
let _prReview = null;               // { a: analyse, items: propositions affichées, coach: avis du Coach }
// fenêtre « Mise à jour du plan » : son style est dans plan-review-ui.js (chargé avec elle) ; ici seulement le bandeau après validation
const PR_SNACK_CSS = ''
  + '.pr-snack{position:fixed;left:16px;right:16px;margin:0 auto;width:max-content;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:450;display:flex;align-items:center;gap:12px;background:#0F172A;color:#fff;border-radius:16px;padding:10px 10px 10px 16px;font-size:13px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:calc(100vw - 32px);animation:_prFade .3s ease both;}'
  + '.pr-snack button{flex-shrink:0;background:#3B82F6;color:#fff;border:none;border-radius:10px;padding:8px 14px;font-weight:800;font-size:13px;font-family:inherit;cursor:pointer;}'
  + '.pr-snack .pr-ck.ok{color:#86EFAC;}.pr-snack .pr-ck.partial{color:#FCD34D;}.pr-snack .pr-ck.miss{color:#FCA5A5;}'
  + '.pr-snack .pr-snack-t{display:flex;flex-direction:column;gap:2px;min-width:0;}.pr-snack .pr-snack-t small{font-size:12px;font-weight:600;opacity:.85;}.pr-snack button.sec{background:rgba(255,255,255,.14);}';
function _prSnackCss(){ if(!document.getElementById('pr-snack-css')){ const st = document.createElement('style'); st.id = 'pr-snack-css'; st.textContent = PR_SNACK_CSS; document.head.appendChild(st); } }



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



// données envoyées au Coach (relecture du plan, discussion « Mon plan ») : plan complet, niveau, volume, charge, ressenti, historique…
// a = prAnalyze() ; R = { items: propositions calculées, held: séances en attente }
async function prCoachBody(a, R, force){
  const today = a.opt.today;
  const weeks = {};
  prSessions(state).forEach(function(s){
    const w = weeks[s.w] = weeks[s.w] || { w: s.w, meta: (function(){ try { return JSON.parse(state['meta_w' + s.w] || '{}'); } catch(e) { return {}; } })(), sessions: [] };
    w.sessions.push({ ref: s.key, date: s.date, type: s.type, title: s.title, detail: s.detail, km: s.kmPlan, done: s.done, lib: s.x && s.x.lib ? s.x.lib.id + ' (palier ' + (s.x.lib.r + 1) + ')' : undefined,
      result: s.done ? (s.date && prDays(s.date, today) <= 56 ? { km: s.km, pace: s.perf.pace || null, hr: s.perf.hr || null, blocs: s.perf.blocsAllure || null, note: s.perf.note || null, rpe: s.perf.rpe || null } : { km: s.km }) : undefined });
  });
  const body = { today: today, race: { name: a.race.name, course: a.race.course, date: a.race.date, objectif: a.race.objectif },
    fitness: a.fit.vdot ? { vdot: a.fit.vdot, basis: a.fit.basis, planVdot: a.planVdot, paces: { seuil: prPace(a.fit.paces.T), fractionne: prPace(a.fit.paces.I), ef_reelle: a.opt.efPace ? prPace(a.opt.efPace) : null },
      predictions: Object.keys(a.fit.preds).reduce(function(o, c){ o[c] = prTime(a.fit.preds[c]); return o; }, {}), sources: a.fit.sources.slice(-12).map(function(x){ return { label: x.label, time: x.time || x.pace, date: x.date, vdot: Math.round(x.vdot * 10) / 10 }; }) } : null,
    postRaceUntil: a.opt.postRaceUntil, habitualKm: a.opt.habitual, history: await prHistory(today).catch(function(){ return []; }), warnings: a.warnings.slice(0, 20).map(function(w){ return w.text; }),
    proposals: R.items.filter(function(p){ return p.src !== 'coach'; }).map(function(p){ return { ref: p.key, champ: p.field, nature: p.kind || 'allure', title: p.title, before: p.before, after: p.after, reason: p.short || p.reason, retenue: !!p.on }; }),
    force: force, next: !!(typeof _prepView !== 'undefined' && _prepView && _prepView.next), startDate: state.plan_start_date || null,
    held: (R.held || []).map(function(p){ return { ref: p.key, title: p.title, date: p.date, before: p.before, allure_a_ton_niveau: p.after }; }),
    plan: Object.keys(weeks).map(function(k){ return weeks[k]; }), memos: state._coach_memos || '',
    reviewHistory: (state._plan_reviews || []).slice(-4).map(function(h){ return { date: h.date, avec_coach: !!h.coach, niveau: h.vdot, changements: (h.changes || []).map(function(c){ return { ref: c.ref, seance: c.title, date: c.date, champ: c.field, avant: c.before, apres: c.after, par: c.src === 'coach' ? 'toi (Coach)' : 'calcul', raison: c.reason }; }) }; }),
    volume: a.volume ? { base_km_sem: a.volume.base, pic_vise_km: a.volume.peak, semaines: a.volume.weeks.map(function(w){ return { semaine: w.w, prevu: w.plan, fait: w.past ? w.done : undefined, conseille: w.target || undefined, raison: w.why || undefined }; }) } : null,
    charge: a.load ? { km_7j: a.load.k7, moyenne_28j_km_sem: a.load.chronic, ratio: a.load.acwr ? Math.round(a.load.acwr * 100) / 100 : null } : null,
    signaux_foulee: a.stride ? { niveau: a.stride.status, efficacite_pct: a.stride.eiPct, cadence: a.stride.cad, constats: a.stride.items } : null,
    zones_fc: { plafond_ef: typeof hrEfMax === 'function' ? hrEfMax() : 148, recalees: !!(state._hr_zones && state._hr_zones.applied), fc_seuil: (state._hr_zones || {}).lthr || null },
    recette: a.recette ? { progression_max_pct: Math.round((a.recette.progression - 1) * 100), raison: a.recette.progWhy, affutage: a.recette.taper, allures: a.recette.calib, base_km_sem: a.recette.base, sortie_longue_max: a.recette.longest, tiree_de: a.recette.from } : null,
    dernier_bilan: (function(){ const IX = (typeof _prepIndex !== 'undefined' && _prepIndex) || {}; const L = Object.keys(IX).map(function(k){ return IX[k]; }).filter(function(p){ return p && p.debrief; }).sort(function(x, y){ return String(y.date || '').localeCompare(String(x.date || '')); })[0]; return L ? { prepa: L.title, date: L.date, resultat: L.result || null, lecons: L.debrief.lessons } : null; })(),
    derniere_course: state._race_analysis ? (function(A){ return { course: A.name || A.cat, date: A.date, temps: A.time, objectif: A.target ? prTime(A.target.sec) : null, niveau_la_veille: A.pred ? prTime(A.pred) : null, verdict: A.verdict.t, depart_pct_vs_prevu: A.start ? Math.round(A.start.pct * 10) / 10 : null, seconde_moitie_pct: A.halves ? A.halves.pct : null, coup_de_mou_km: A.fade ? A.fade.km : null, derive_cardio_pct: A.drift ? A.drift.pct : null, meteo_pct: A.heat ? A.heat.pct : null, lecons: A.lessons }; })(state._race_analysis) : null,
    pro_conseillee: a.advice ? Object.keys(a.advice).filter(function(k){ return a.advice[k].rec === 'pro' || a.advice[k].k === 'block'; }).slice(0, 12).map(function(k){ const A = a.advice[k]; return { ref: k, conseil: A.rec === 'pro' ? 'version pro' : 'version classique', version_actuelle: A.cur, pourquoi: A.why }; }) : undefined,
    bibliotheque: typeof SL_LIB !== 'undefined' ? SL_LIB.map(function(L){ return { id: L.id, nom: L.n, effet: L.stim, type: L.type, phases: L.ph, paliers: L.prog.length }; }) : null,
    profil_coureur: a.profile ? { priorites: a.profile.focus, points: a.profile.items.map(function(x){ return x.t + ' (' + (x.tone === 'weak' ? 'à travailler' : x.tone === 'strong' ? 'force' : 'équilibré') + ') : ' + x.v; }) } : null,
    historique_appris: a.hist ? { depuis: a.hist.first, seances: a.hist.n, km: a.hist.km,
      courses_rejouees: a.hist.pred ? a.hist.pred.races.map(function(r){ return { course: r.label, date: r.date, prevu_6_sem_avant: prTime(r.projSec), reel: prTime(r.sec), ecart_niveau: r.err }; }) : [],
      recalage_temps_prevus: a.hist.pred ? a.hist.pred.bias : 0, hausse_volume_tenue: a.hist.vol ? a.hist.vol.prog : null, meilleur_volume_4_sem: a.hist.vol ? a.hist.vol.best4 : null, effort_habituel: a.hist.rpe } : null,
    reglage_paliers: a.ladderCalib && a.ladderCalib.n ? { mode: a.ladderCalib.mode, hausses_tenues: a.ladderCalib.ok, hausses: a.ladderCalib.n } : null,
    feu_vert: a.greenLight ? a.greenLight.text : null,
    objectif_a_revoir: a.goalCheck ? { sens: a.goalCheck.dir, objectif: prTime(a.goalCheck.from), propose: prTime(a.goalCheck.to), prevu: prTime(a.goalCheck.mid) } : null,
    absorption: a.absorb && a.absorb.n ? { tendance_3_semaines: a.absorb.verdict, score_moyen: a.absorb.mean, seances: a.absorb.list.slice(0, 8).map(function(x){ return { date: x.date, seance: x.title, verdict: x.verdict, pourquoi: x.parts.map(function(p){ return p.t; }).join(' ; ') }; }) } : null,
    effort_ressenti: a.internal && a.internal.rpes.length ? { seances_14j: a.internal.rpes, charge_ressentie_ratio_7j_28j: a.internal.ratio ? Math.round(a.internal.ratio * 100) / 100 : null } : null,
    douleurs: a.internal && a.internal.pains.length ? a.internal.pains : null,
    derive_cardiaque: a.drift ? { moyenne_pct: Math.round(a.drift.avg * 10) / 10, sorties: a.drift.n, endurance: a.drift.label } : null,
    whoop: a.whoop ? { recup_3j_corrigee_alcool: a.whoop.scores, moyenne_corrigee: a.whoop.avg3, vfc_vs_moyenne_pct: a.whoop.hrvDrop, fatigue_entrainement: a.whoop.tired, alcool: a.whoop.alc || null } : null,
    alcool: typeof alcCoachContext === 'function' ? alcCoachContext(today) : null,
    allures_tenues: a.calib && a.calib.n ? { tenues: a.calib.k, total: a.calib.n, detail: a.calib.list.map(function(r){ return { seance: r.title, date: r.date, cible: r.target, realise: prPace(r.real), tenue: r.ok }; }) } : null,
    trajectoire: a.trajectory && a.trajectory.race ? { niveau: a.fit.vdot, tendance_par_semaine: Math.round(a.trajectory.slope * 70) / 10, projection_jour_j: Math.round(a.trajectory.race.v * 10) / 10, fourchette: prTime(a.trajectory.race.lo) + ' – ' + prTime(a.trajectory.race.hi), niveau_objectif: a.trajectory.need ? Math.round(a.trajectory.need * 10) / 10 : null, verdict: a.trajectory.verdict || null } : null,
    lastCoachReview: state._coach_review ? { date: state._coach_review.date, avis: state._coach_review.assessment } : null,
    newSince: state._coach_review ? prDoneSince(state._coach_review.date, state._coach_review.at) : null };
  return body;
}
// changements renvoyés par le Coach → propositions (séances à venir non faites ; un champ par proposition)
// semaine du plan (1, 2…) d'une date, d'après le lundi de début de la prépa
function prWeekOfDate(st, date){
  if(!st || !st.plan_start_date || !date) return null;
  const d = Math.round((new Date(date + 'T12:00:00') - new Date(prIso(prMonday(st.plan_start_date)) + 'T12:00:00')) / 864e5);
  return d >= 0 ? Math.floor(d / 7) + 1 : null;
}
function prCoachItems(changes){
  const byKey = {}; prSessions(state).forEach(function(s){ byKey[s.key] = s; });
  const items = [];
  (changes || []).forEach(function(c, i){
    // séance créée par le Coach : clé attribuée à l'application ; séance retirée : « non prévue »
    if(c && c.add){ const a = c.add, w = prWeekOfDate(state, a.date); if(!w) return;
      items.push({ on: true, key: 'new:' + a.date + ':' + i, w: w, date: a.date, field: 'add', title: a.title, type: a.type, before: null,
        after: { t: a.title, d: a.detail || '', km: a.km, type: a.type, date: a.date, time: a.time || null }, reason: c.reason || '', src: 'coach' }); return; }
    const s = byKey[c.ref]; if(!s || s.done) return;
    // modèle de la bibliothèque choisi par le Coach : séance détaillée écrite aux allures du jour (session-lib.js)
    if(c.lib && typeof SL_BY_ID !== 'undefined' && SL_BY_ID[c.lib]){
      const ctx = slCtx(state, {}), b = ctx ? slFit(c.lib, c.r != null ? c.r : 0, ctx, s.kmPlan) : null;
      if(b){ const A = slAsSession(b); A.lib.at = prTodayIso(); items.push({ on: true, key: s.key, w: s.w, date: s.date, field: 'session', title: s.title, type: s.type, kind: 'lib', sub: 'coach', before: { t: s.title, d: s.detail, km: s.kmPlan, type: s.type }, after: A, reason: c.reason || '', src: 'coach' }); }
      return;
    }
    if(c.skip === true){ if(!s.skip) items.push({ on: true, key: s.key, w: s.w, date: s.date, field: 'skip', title: s.title, type: s.type, before: 'prévue', after: 'retirée par le Coach', reason: c.reason || '', src: 'coach' }); return; }
    const push = function(field, before, after){ if(after === undefined || after === null || String(after) === String(before)) return; items.push({ on: true, key: s.key, w: s.w, date: s.date, field: field, title: s.title, type: s.type, before: before, after: after, reason: c.reason || '', src: 'coach' }); };
    push('detail', s.detail, c.detail); push('title', s.title, c.title); push('km', s.kmPlan, c.km != null ? Math.round(+c.km * 10) / 10 : null); push('type', s.type, c.type);
  });
  return items;
}
// Relecture automatique du Coach le week-end (compte admin) : la semaine prochaine relue sans rien demander, une fois par
// week-end et seulement s'il y a du nouveau. D'accord avec le calcul → « ✓ Relu par le Coach » ; pas d'accord → ligne sur
// la carte « Ton plan » de l'accueil et ses changements prêts dans MAJ le plan (_prRestoreCoach).
let _prCoachAutoBusy = false;
async function prCoachAuto(){
  if(_prCoachAutoBusy || typeof coachAI !== 'function' || !coachAI() || (typeof _prepView !== 'undefined' && _prepView) || !state._plan_engine || !window._prPrefetchDone) return null;
  const today = prTodayIso(), wd = prWeekday(today); if(wd < 6) return null;
  const week = prAddDays(today, 8 - wd), c = state._coach_review || {};
  if(state._coach_auto_week === week) return null;
  if(c.sig === prDataSig() && c.date && prDays(c.date, today) <= 7){ state._coach_auto_week = week; if(dbRef) dbRef.child('_coach_auto_week').set(week).catch(function(){}); return null; }   // rien de nouveau
  _prCoachAutoBusy = true;
  state._coach_auto_week = week; if(dbRef) dbRef.child('_coach_auto_week').set(week).catch(function(){});
  try {
    const a = prAnalyze(), R = { items: a.proposals.map(function(p){ return Object.assign({ on: true }, p); }) };
    const body = await prCoachBody(a, R, false);
    const token = await getAuthToken();
    const r = await fetch(FUNCTIONS_BASE + '/planReview', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
    const j = await r.json();
    if(!r.ok || !j.success) throw new Error(j.error || 'HTTP ' + r.status);
    const items = prCoachItems(j.changes || []);
    // ce que le Coach change par rapport au calcul (même séance, même champ, même valeur = d'accord)
    const same = function(x){ return a.proposals.some(function(p){ return p.key === x.key && p.field === x.field && JSON.stringify(p.after) === JSON.stringify(x.after); }); };
    const diff = items.filter(function(x){ return !same(x); }), rej = (j.rejected || []).slice(0, 30);
    state._coach_review = { date: today, at: new Date().toISOString(), sig: prDataSig(), assessment: j.assessment || '', rejected: rej, auto: true, week: week,
      agree: !diff.length && !rej.length, diff: diff.length + rej.length,
      changes: items.map(function(x){ return { key: x.key, w: x.w, date: x.date, field: x.field, title: x.title, type: x.type, before: x.before, after: x.after, reason: x.reason }; }), applied: !items.length };
    if(dbRef) dbRef.child('_coach_review').set(state._coach_review).catch(function(){});
    return state._coach_review;
  } catch(e) {
    console.warn('[Coach] relecture du week-end', e && e.message);
    return null;
  } finally { _prCoachAutoBusy = false; }
}
// ce que dit la dernière relecture du Coach (carte « Ton plan », MAJ le plan) : null si elle date ou si de nouvelles séances ont été faites
function prCoachVerdict(){
  const c = state._coach_review; if(!c || !c.date || prDays(c.date, prTodayIso()) > 7) return null;
  const fresh = c.sig === prDataSig();
  const first = (c.changes || []).filter(function(x){ return x.field !== 'title'; })[0] || null;
  return { date: c.date, auto: !!c.auto, agree: c.agree != null ? c.agree : !(c.changes || []).length, n: c.diff != null ? c.diff : (c.changes || []).length, applied: !!c.applied, fresh: fresh,
    first: first, text: (String(c.assessment || '').match(/^[^.!?]*[.!?]?/) || [''])[0].trim().slice(0, 110) };
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

// applique des changements au plan (state) et les inscrit dans l'historique _plan_reviews (annulables : prUndoReview) ;
// meta : { coach, vdot, auto (pilote automatique), kind } — utilisé par « MAJ le plan », l'affûtage conseillé et le pilote de nuit
function prApplyChanges(sel, meta){
  meta = meta || {};
  let n = 0; const touched = {};
  // consigne déjà réécrite pour cette séance (Coach : consigne + km ensemble) : les km ne la retouchent pas
  const newDet = {}; sel.forEach(function(p){ if(p.field === 'detail' || p.field === 'session') newDet[p.key] = 1; });
  sel.forEach(function(p){
    // nouvelle séance : rangée dans sa semaine, après les séances existantes (clé libre suivante)
    if(p.field === 'add'){
      const a = p.after || {}, w = prWeekOfDate(state, a.date); if(!w || !a.t) return;
      let idx = 0; while(idx <= 60 && state['extra_w' + w + '_s' + idx] !== undefined) idx++;
      const key = 'extra_w' + w + '_s' + idx;
      state[key] = JSON.stringify({ type: ['ef', 'long', 'tempo', 'frac', 'race'].indexOf(a.type) >= 0 ? a.type : 'ef', km: +a.km || 0, d: a.t + (a.d ? '|' + a.d : ''),
        sched_date: a.date, sched_day: prWeekday(a.date), sched_time: a.time || undefined, _added: true, _modified: true, _seq: 1 });
      p.key = key; p.w = w; touched[key] = 1; n++; return;
    }
    if(p.field === 'skip'){
      if(state[p.key + '_done'] || state[p.key + '_skip']) return;
      state[p.key + '_skip'] = true; state[p.key + '_skip_reason'] = p.after || 'retirée'; touched[p.key] = 1; n++; return;
    }
    let x; try { x = JSON.parse(state[p.key]); } catch(e) { return; }
    if(!x || state[p.key + '_done']) return;
    const parts = String(x.d || '').split('|'), title = parts[0], det = parts.slice(1).join('|');
    const cl0 = { t: title, d: det, km: x.km, type: x.type };                     // version classique, gardée si la séance passe en pro
    if(p.field === 'detail') x.d = title + '|' + p.after;
    else if(p.field === 'title') x.d = p.after + (det ? '|' + det : '');
    else if(p.field === 'km'){
      let nd = newDet[p.key] ? det : prKmDetail(det, x.type, x.km, p.after);
      // footing / sortie longue de la bibliothèque : consigne réécrite pour les nouveaux km (étapes recalculées)
      if(!newDet[p.key] && x.lib && (x.type === 'ef' || x.type === 'long') && typeof slBuild === 'function'){ const b = slBuild(x.lib.id, x.lib.r, slCtx(state, { v: x.lib.v, ef: x.lib.ef, cat: x.lib.cat }), +p.after); if(b) nd = b.text; }
      x.km = +p.after; if(nd !== det){ x.d = title + '|' + nd; p.detBefore = det; p.detAfter = nd; } }
    else if(p.field === 'type' && ['ef', 'long', 'tempo', 'frac'].indexOf(p.after) >= 0) x.type = p.after;
    else if(p.field === 'date' && /^\d{4}-\d\d-\d\d$/.test(String(p.after))){ x.sched_date = p.after; x.sched_day = prWeekday(p.after); }
    else if(p.field === 'session' && p.after && p.after.t){ x.d = p.after.t + '|' + p.after.d; x.km = +p.after.km; if(['ef', 'long', 'tempo', 'frac', 'rest'].indexOf(p.after.type) >= 0) x.type = p.after.type; }
    else return;
    // séance de la bibliothèque (session-lib.js) : modèle + palier gardés avec la séance ; une consigne réécrite autrement la retire
    if(p.field === 'session' || p.field === 'detail' || p.field === 'type'){
      p.libBefore = x.lib || null;
      if(p.field === 'session' && p.after && p.after.lib){
        const cl = p.libBefore ? p.libBefore.cl : cl0;                            // l'autre version de la séance reste disponible (choix classique / pro)
        x.lib = Object.assign({}, p.after.lib); if(cl && cl.t) x.lib.cl = cl; else delete x.lib.cl;
      } else delete x.lib;
    }
    x._modified = true; x._seq = (x._seq || 0) + 1;
    state[p.key] = JSON.stringify(x); touched[p.key] = 1; n++;
  });
  if(!n) return { n: 0, touched: touched, index: null };
  // titre remis en cohérence avec la nouvelle consigne / le nouveau type (annulable comme le reste)
  const detBefore = {}; sel.forEach(function(p){ if(p.field === 'detail' && detBefore[p.key] === undefined) detBefore[p.key] = p.before; });
  const fixes = [];
  Object.keys(touched).forEach(function(k){
    let x; try { x = JSON.parse(state[k]); } catch(e) { return; }
    const parts = String(x.d || '').split('|'), t0 = parts[0], det = parts.slice(1).join('|'), t1 = prTitleFor(t0, det, x.type, detBefore[k]);
    if(t1 === t0) return;
    x.d = t1 + (det ? '|' + det : ''); state[k] = JSON.stringify(x);
    const p0 = sel.find(function(p){ return p.key === k; }) || {};
    fixes.push({ key: k, field: 'title', before: t0, after: t1, title: t0, type: x.type, date: p0.date || null, kind: 'coherence', reason: 'Titre accordé à la consigne' });
  });
  sel = sel.concat(fixes);
  const hist = (state._plan_reviews || []).slice(-5);
  const entry = { date: prTodayIso(), n: Object.keys(touched).length, coach: !!meta.coach, vdot: meta.vdot || null, sig: prDataSig() };
  if(meta.auto) entry.auto = true; if(meta.kind) entry.kind = meta.kind; if(meta.at) entry.at = meta.at;
  entry.changes = sel.filter(function(p){ return touched[p.key]; }).slice(0, 200).map(function(p){ return { ref: p.key, title: p.title, type: p.type || null, kind: p.kind || null, detBefore: p.detBefore, detAfter: p.detAfter, date: p.date || null, field: p.field, before: p.before, after: p.after, src: p.src, delta: p.delta != null ? p.delta : undefined, fam: p.fam || undefined, libBefore: p.libBefore !== undefined ? p.libBefore : undefined, libAfter: p.after && p.after.lib ? p.after.lib.id : undefined, reason: String(p.short || p.reason || p.why || '').slice(0, 140) }; });
  hist.push(entry);
  state._plan_reviews = hist;
  return { n: Object.keys(touched).length, touched: touched, index: hist.length - 1, entry: entry };
}
