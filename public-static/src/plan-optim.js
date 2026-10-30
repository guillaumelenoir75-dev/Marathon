// Plan › « Mettre à jour le plan » — optimisation (utilisé par plan-review.js) :
// charge réelle (7 j / 28 j), volume conseillé semaine par semaine, sortie longue pilotée, dérive cardiaque (splits Strava),
// séance test, récupération WHOOP, trajectoire vers l'objectif, bilan des allures proposées, annulation d'une mise à jour.

// ─── Historique complet : toutes les prépas enregistrées (copies figées) + la prépa en cours ───
// Toutes les analyses (charge, dérive, foulée, zones FC, niveau, allure EF, prédiction, Coach…) portent sur TOUT ce qui a été
// couru depuis la 1re séance enregistrée, pas seulement sur la prépa en cours : prAllDone(today) / prDoneLog(today).
// prPrefetch() charge les copies (une fois par prépa, en parallèle) ; _prPrevSnap = dernière prépa terminée (≤ 120 j).
let _prAllSnaps = {}, _prPrevSnap = null, _prPrevSnapId = null, _prPrefetching = null;
const _prShimHard = function(st){ return (!st._plan_engine && !st.plan_start_date) ? Object.assign({}, st, { plan_start_date: '2026-03-09' }) : st; };   // plan Seine-Eure écrit en dur
// état réel de la prépa en cours (« Voir et modifier » la prépa à venir remplace state)
function prRealState(){ const V = typeof _prepView !== 'undefined' && _prepView; return V && V.next && V.state ? V.state : state; }
function prPrefetch(){
  if(_prPrefetching) return _prPrefetching;
  let added = 0;
  _prPrefetching = (async function(){
    try {
      const today = prTodayIso();
      if(typeof _prepIndex !== 'undefined' && !_prepIndex && typeof _prepRef === 'function') _prepIndex = (await _prepRef('prep_index').once('value')).val() || {};
      const idx = (typeof _prepIndex !== 'undefined' && _prepIndex) || {}, real = prRealState();
      Object.keys(_prAllSnaps).forEach(function(k){ if(!idx[k]){ delete _prAllSnaps[k]; added++; } });   // prépa supprimée
      if(typeof _prepGetSnap === 'function'){
        await Promise.all(Object.keys(idx).filter(function(k){ return k !== real._prep_id && !_prAllSnaps[k]; }).map(function(id){
          return Promise.race([_prepGetSnap(id), new Promise(function(r){ setTimeout(function(){ r(null); }, 4000); })])
            .then(function(st){ if(st){ _prAllSnaps[id] = _prShimHard(st); added++; } }).catch(function(){});
        }));
      }
      const id = Object.keys(idx).filter(function(k){ const p = idx[k]; return p && p.date && p.date <= today && k !== real._prep_id && prDays(p.date, today) <= 120 && _prAllSnaps[k]; })
        .sort(function(a, b){ return idx[b].date.localeCompare(idx[a].date); })[0];
      _prPrevSnap = id ? _prAllSnaps[id] : null; _prPrevSnapId = id || null;
    } catch(e) {}
  })().finally(function(){
    window._prPrefetchDone = true; setTimeout(function(){ _prPrefetching = null; }, 0);
    if(added){ _prAllCache = null; if(typeof prHistoryRefresh === 'function') prHistoryRefresh(); }
  });
  return _prPrefetching;
}
// historique chargé : les écrans d'analyse se recalculent
function prHistoryRefresh(){
  try {
    if(typeof rendered !== 'undefined'){ rendered.stats = false; rendered.plan = false; }
    if(typeof prRenderHomeCard === 'function') prRenderHomeCard();
    const sc = document.getElementById('sc-stats'); if(sc && sc.style.display !== 'none' && typeof bsRenderStatsCard === 'function') bsRenderStatsCard();
  } catch(e) {}
}
// états à analyser : prépa affichée, prépa en cours réelle, toutes les copies (sauf celle de la prépa en cours) ;
// copie figée consultée en lecture seule : ses seules données
function prHistoryStates(){
  const V = typeof _prepView !== 'undefined' && _prepView;
  if(V && !V.next) return [state];
  const real = prRealState(), out = [state];
  if(real !== state) out.push(real);
  Object.keys(_prAllSnaps).forEach(function(k){ if(k !== real._prep_id) out.push(_prAllSnaps[k]); });
  return out;
}
// toutes les séances réalisées (hors repos) jusqu'à today, dédoublonnées (date | type | km), triées par date ;
// s.date = date réelle, s.cur = prépa affichée, s.hard = plan Seine-Eure écrit en dur, s.gw = n° de semaine continu depuis la 1re séance
let _prAllCache = null;                                                         // { key, t, list } : 1 s au plus, vidé à chaque save()
function prHistoryChanged(){ _prAllCache = null; }
function prAllDone(today){
  today = today || prTodayIso();
  const states = prHistoryStates();
  const key = today + '|' + states.length;
  if(_prAllCache && _prAllCache.key === key && _prAllCache.st0 === state && Date.now() - _prAllCache.t < 1000) return _prAllCache.list.slice();
  const out = [], seen = {}, dups = [];
  prHistoryStates().forEach(function(st){ prSessions(st).forEach(function(s){
    if(!s.done || s.type === 'rest') return;
    const d = s.perf && s.perf.date ? String(s.perf.date).slice(0, 10) : s.date;
    if(!d || d > today) return;
    const k = d + '|' + s.type + '|' + Math.round(s.km * 10);
    // même séance validée deux fois dans la même prépa (deux séances du plan pour une seule sortie) : comptée une fois, signalée
    if(seen[k]){ if(seen[k].st === st && seen[k].key !== s.key) dups.push({ s: s, first: seen[k].s, cur: st === state, date: d }); return; }
    seen[k] = { st: st, key: s.key, s: s };
    s.date = d; s.cur = st === state; s.hard = !st._plan_engine; out.push(s);
  }); });
  out.sort(function(a, b){ return a.date.localeCompare(b.date); });
  const issues = typeof dqClean === 'function' ? dqClean(out, dups) : [];
  if(out.length){ const m0 = prMonday(out[0].date).getTime(); out.forEach(function(s){ s.gw = Math.round((prMonday(s.date).getTime() - m0) / 604800000) + 1; }); }
  _prAllCache = { key: key, st0: state, t: Date.now(), list: out, issues: issues };
  return out.slice();
}

// ─── Nettoyage des données : valeurs suspectes écartées des analyses (sauf « garder », state._data_keep) ───
// fcmax : pic de FC max sur un footing (capteur) ou au-dessus de la FC max ; hr : FC moyenne improbable (cadence prise pour la FC) ;
// pace : allure impossible ou incohérente avec km + durée (GPS) ; splits : tours à moins de 2'45/km (saut GPS) ;
// dup : même sortie validée sur deux séances du plan (déjà comptée une fois). Seule la valeur fautive est retirée, pas la séance.
function dqClean(list, dups){
  const keep = (typeof state !== 'undefined' && state && state._data_keep) || {}, issues = [];
  const ref = parseInt(state && state.fc_max) || parseInt(((state && state.onboarding) || {}).fc_max) || 196;
  const efMax = typeof hrEfMax === 'function' ? hrEfMax() : 148, P = function(x){ return prPace(x); };
  const durSec = function(t){ const p = String(t || '').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null; };
  const add = function(s, kind, msg, fix){
    const id = (s.date + '|' + s.key + '|' + kind).replace(/[.#$\[\]\/]/g, '_'), kept = !!keep[id];
    issues.push({ id: id, kind: kind, date: s.date, key: s.key, w: s.w, ei: s.ei, title: s.title, msg: msg, cur: !!s.cur, kept: kept });
    if(!kept && fix) fix();
  };
  list.forEach(function(s){
    const p = s.perf || {}, st = p.strava || {}, hr = parseInt(p.hr) || null, easy = s.type === 'ef' || s.type === 'long', ps = prPaceSec(p.pace);
    const fm = parseInt(st.fcMax) || null;
    // (au-dessus de la FC max saisie sur une séance dure : plausible, sert à la relever — seul > 215 est impossible)
    if(fm && ((easy && hr && fm - hr > 35 && fm >= 0.95 * ref) || fm > 215))
      add(s, 'fcmax', 'FC max ' + fm + (fm > 215 ? ' impossible' : ' sur une sortie à ' + hr + ' de moyenne : pic du capteur probable'), function(){ p.strava = Object.assign({}, st); delete p.strava.fcMax; });
    if(hr && (hr < 85 || hr > 210 || (easy && hr > 0.92 * ref)))
      add(s, 'hr', 'FC moyenne ' + hr + ' improbable' + (easy ? ' pour une sortie facile' : '') + ' : capteur (cadence prise pour la FC ?)', function(){ delete p.hr; });
    if(ps){
      const d = durSec(p.dur), comp = d && s.km > 0 ? d / s.km : null;
      if(ps < 150 || ps > 600) add(s, 'pace', 'Allure ' + P(ps) + '/km impossible', function(){ delete p.pace; });
      // durée trop courte pour les km (saisie ou GPS) ; plus longue = arrêts (feux, marche) : l'allure en mouvement reste juste
      else if(comp && comp < ps * 0.85) add(s, 'pace', 'Allure ' + P(ps) + '/km incohérente avec ' + String(s.km).replace('.', ',') + ' km en ' + p.dur + ' (' + P(comp) + '/km) : GPS ?', function(){ delete p.pace; });
    }
    const bad = (st.splits || []).filter(function(sp){ const x = prPaceSec(sp.allure); return x && x < 165 && (sp.distanceKm == null || sp.distanceKm >= 0.5); });
    if(bad.length) add(s, 'splits', bad.length + ' km à ' + bad.map(function(sp){ return sp.allure; }).slice(0, 2).join(', ') + '/km : saut GPS', function(){ p.strava = Object.assign({}, p.strava || st); p.strava.splits = (st.splits || []).filter(function(sp){ return bad.indexOf(sp) < 0; }); });
  });
  dups.forEach(function(d){ issues.push({ id: (d.date + '|' + d.s.key + '|dup').replace(/[.#$\[\]\/]/g, '_'), kind: 'dup', date: d.date, key: d.s.key, w: d.s.w, ei: d.s.ei, title: d.s.title,
    msg: 'Même sortie validée aussi pour « ' + d.first.title + ' » : comptée une fois', cur: d.cur, kept: false, info: true }); });
  return issues;
}
// valeurs suspectes de tout l'historique (après le calcul de prAllDone)
function dqIssues(today){ prAllDone(today); return (_prAllCache && _prAllCache.issues) || []; }
function dqKeep(id, on){
  state._data_keep = Object.assign({}, state._data_keep || {});
  if(on) state._data_keep[id] = true; else delete state._data_keep[id];
  if(typeof dbRef !== 'undefined' && dbRef) dbRef.child('_data_keep').set(Object.keys(state._data_keep).length ? state._data_keep : null).catch(function(){});
  prHistoryChanged();
}
const prAddDays = function(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return prIso(d); };
const prMean = function(a){ return a.length ? a.reduce(function(x, y){ return x + y; }, 0) / a.length : null; };
const prPaceSec = function(t){ const m = String(t || '').match(/(\d{1,2})['’:](\d{2})/); return m ? prParsePace(m[1], m[2]) : null; };

// ─── 2. Charge réelle ───────────────────────────────────────────────────────
// séances réalisées de tout l'historique : date, km, type
function prDoneLog(today){
  return prAllDone(today).map(function(s){ return { date: s.date, km: s.km, type: s.type, s: s, src: s.cur ? 'cur' : 'hist' }; });
}
function prLoad(today){
  const log = prDoneLog(today);
  const sum = function(n){ return log.filter(function(x){ const d = prDays(x.date, today); return d >= 0 && d < n; }).reduce(function(a, x){ return a + x.km; }, 0); };
  const k7 = sum(7), k28 = sum(28), chronic = k28 / 4;
  return { k7: Math.round(k7), k28: Math.round(k28), chronic: Math.round(chronic), acwr: chronic >= 5 ? k7 / chronic : null, log: log };
}

// ─── 1 + 3. Volume conseillé et sortie longue ───────────────────────────────
const PR_PEAK = { '5 km': 1.0, '10 km': 1.05, 'Semi-marathon': 1.15, 'Marathon': 1.25 };
const PR_LONG_CAP = { '5 km': 14, '10 km': 16, 'Semi-marathon': 22, 'Marathon': 32 };
const PR_REC_DAYS = { 'Marathon': 26, 'Semi-marathon': 13, '10 km': 6, '5 km': 3 };
// Courbe cible : reprise après marathon / semi (≈ 40 → 85 % de ta base), progression ≤ +12 %/semaine vers le pic de la course,
// semaines allégées à ~78 %, affûtage (2 dernières semaines), plafond si la semaine passée n'a pas été faite,
// garde-fou de charge (7 j ≤ 1,35 × moyenne 28 j). Retourne les cibles par semaine et les propositions de km.
function prVolumePlan(st, a){
  const today = a.opt.today, W = prWeeks(st, today), weeks = Object.keys(W).map(Number).sort(function(x, y){ return x - y; }).map(function(w){ return W[w]; });
  const base = a.opt.habitual || (a.load && a.load.chronic >= 12 ? a.load.chronic : null);
  if(!base || !weeks.length) return null;
  const cat = a.opt.raceCat, peak = base * (PR_PEAK[cat] || 1.1), longRace = cat === 'Marathon' || cat === 'Semi-marathon';
  const raceW = weeks.filter(function(o){ return o.race; }).map(function(o){ return o.w; }).pop();
  const lr = a.opt.lastRace, recD = lr && (lr.cat === 'Marathon' || lr.cat === 'Semi-marathon') ? PR_REC_DAYS[lr.cat] : null;
  const longCap = PR_LONG_CAP[cat] || 20;
  // plus longue sortie des 8 dernières semaines (prépa précédente comprise) : une sortie déjà encaissée n'est pas un risque
  const recentLong = Math.max.apply(null, (a.load ? a.load.log : []).filter(function(x){ return x.type === 'long' && prDays(x.date, today) <= 56; }).map(function(x){ return x.km; }).concat([0]));
  const out = { base: Math.round(base), peak: Math.round(peak), weeks: [], proposals: [], horizonWeeks: [] };
  const noUp = !!a.opt.noVolumeUp;                                                // fatigue WHOOP / douleur : pas de hausse cette semaine
  const REC = a.opt.recette || null, PROG = REC && REC.progression >= 1.03 && REC.progression <= 1.2 ? REC.progression : 1.12;   // recette : progression encaissée
  // progression mesurée depuis la dernière semaine de charge (pas depuis une semaine allégée) ; propositions de km sur 4 semaines
  let lastBuild = null, prevT = null, prevLong = null, buildLong = null, prevPast = null, firstFuture = true, nFuture = 0;
  weeks.forEach(function(o){
    const longS = o.sess.filter(function(s){ return s.type === 'long'; }).sort(function(x, y){ return y.kmPlan - x.kmPlan; })[0];
    if(o.past){
      const done = o.sess.filter(function(s){ return s.done && s.type !== 'race'; }).reduce(function(x, s){ return x + s.km; }, 0);
      // séances des 2 derniers jours pas encore validées (sortie longue du dimanche le lundi matin…) : comptées comme prévues
      const pending = o.sess.filter(function(s){ return !s.done && s.type !== 'race' && s.date && prDays(s.date, today) <= 2; }).reduce(function(x, s){ return x + s.kmPlan; }, 0);
      const real = done + pending, ok = o.km <= 0 || real >= o.km * 0.8;
      out.weeks.push({ w: o.w, from: o.from, plan: Math.round(o.km), done: Math.round(done), target: null, past: true, kind: o.kind });
      prevPast = { plan: o.km, done: real, kind: o.kind, race: o.race };
      prevT = ok ? o.km : Math.max(real, o.km * 0.6);                            // semaine faite (≥ 80 %) : le plan sert de référence
      prevLong = longS ? (longS.done ? longS.km : longS.kmPlan) : prevLong;
      if(o.kind !== 'recov' && !o.race){ lastBuild = prevT; buildLong = prevLong; }
      return;
    }
    const toRace = raceW != null ? raceW - o.w : null;
    // course de préparation (semi test d'un marathon…) : semaine laissée telle quelle, sans servir de référence
    if(o.race && toRace !== 0){ nFuture++; out.weeks.push({ w: o.w, from: o.from, plan: Math.round(o.km), target: Math.round(o.km), after: Math.round(o.km), why: 'course de préparation', kind: o.kind, now: o.now, changed: false }); firstFuture = false; return; }
    let t, why;
    // affûtage selon la distance : 10 km 90 % → 60 % ; semi 90 → 75 → 50 % ; marathon 80 → 60 → 40 % du pic
    let TAPER = cat === 'Marathon' ? [0.4, 0.6, 0.8] : cat === 'Semi-marathon' ? [0.5, 0.75, 0.9] : [0.6, 0.9];
    // recette : affûtage de ta dernière course réussie de la même famille (borné à ± 0,15 autour des repères)
    const RT = REC && REC.taper && REC.taper[longRace ? 'long' : 'short'];
    if(RT){ const own = [RT.w0, RT.w1, RT.w2]; TAPER = TAPER.map(function(f, i){ const x = own[i]; return x > 0 ? Math.max(f - 0.15, Math.min(f + 0.15, x)) : f; }); }
    if(toRace != null && toRace >= 0 && toRace < TAPER.length){ t = peak * TAPER[toRace]; why = toRace === 0 ? 'semaine de course' : toRace === TAPER.length - 1 ? 'début d\'affûtage' : 'affûtage'; }
    else if(o.kind === 'recov'){ t = lastBuild ? lastBuild * 0.78 : o.km; why = 'semaine allégée'; }   // sans semaine de charge avant : le plan fait foi
    else { t = Math.min(peak, (lastBuild || o.km) * PROG); why = t >= peak - 0.5 ? 'pic de la prépa (~' + Math.round(peak) + ' km)' : 'progression ≤ +' + Math.round((PROG - 1) * 100) + ' %/semaine' + (PROG !== 1.12 ? ' (ta recette)' : ''); }
    // reprise après un marathon / semi : pourcentage de ta base selon le nombre de jours depuis la course
    const ds = recD && o.from ? prDays(lr.date, o.from) : null;
    if(ds != null && ds >= 0 && ds < recD * 1.08){
      const f = ds < recD * 0.27 ? 0.4 : ds < recD * 0.54 ? 0.55 : ds < recD * 0.8 ? 0.7 : 0.85;
      const r = base * f;
      if(!(toRace != null && toRace <= 1 && r > t)){ t = r; why = 'reprise J+' + ds + ' après ta course : ~' + Math.round(f * 100) + ' % de ta base'; }
    }
    if(firstFuture){
      // semaine passée pas faite : on ne rattrape pas, on repart de ce qui a été fait
      if(prevPast && prevPast.kind !== 'recov' && !prevPast.race && prevPast.plan > 0 && prevPast.done < prevPast.plan * 0.8){
        const cap = Math.max(prevPast.done * 1.15, prevPast.plan * 0.6);
        if(cap < t){ t = cap; why = 'semaine passée faite à ' + Math.round(prevPast.done / prevPast.plan * 100) + ' % : on repart de là'; }
      }
      // garde-fou de charge réelle
      if(a.load && a.load.chronic >= 10){
        const cap = a.load.chronic * 1.35;
        if(cap < t && !(ds != null && ds < recD * 1.08)){ t = cap; why = 'charge réelle : ~' + a.load.chronic + ' km/sem sur 28 jours'; }
      }
      if(a.load && a.load.acwr && a.load.acwr > 1.5 && o.now){ t = Math.min(t, o.km * 0.8); why = 'charge des 7 derniers jours élevée (' + prV(a.load.acwr) + '× ta moyenne)'; }
    }
    firstFuture = false;
    t = Math.round(t);
    const horizon = nFuture++ < 4;                                               // km proposés sur les 4 prochaines semaines
    if(horizon) out.horizonWeeks.push(o.w);
    const build = o.kind !== 'recov' && !(toRace != null && toRace < TAPER.length) && !(ds != null && ds < recD * 1.08);
    // sortie longue : progression depuis la précédente (+2 km), repère 32-40 % du volume, plafond selon la course
    let longTo = null, longWhy = '';
    if(longS && !longS.done && (!longS.date || longS.date >= today)){
      const share = t < 40 ? 0.4 : 0.32;
      const refLong = o.kind === 'recov' ? prevLong : (buildLong != null ? buildLong : prevLong);
      let up = Math.min(longCap, Math.max(share * t, refLong != null ? refLong : 0, recentLong * 0.6), refLong != null ? Math.max(refLong + 2, recentLong * 0.75) : Infinity);
      if(o.kind === 'recov' || (toRace != null && toRace < TAPER.length - 1)) up = Math.min(up, (refLong || longS.kmPlan) * 0.85);   // allégée / affûtage (10 km : semaine de course seulement)
      up = Math.max(up, 6);
      if(!horizon || (noUp && o.now && longS.kmPlan <= up + 1)){}
      else if(longS.kmPlan > up + 1){ longTo = Math.round(up); longWhy = 'sortie longue : ' + (refLong != null && Math.round(up) === Math.round(refLong + 2) && recentLong * 0.75 <= refLong + 2 ? '+2 km max après ' + refLong + ' km' : up === longCap ? 'plafond ' + longCap + ' km pour ta course' : 'pas plus de ~' + Math.round(up) + ' km cette semaine'); }
      else if(o.kind !== 'recov' && !(toRace != null && toRace <= 2) && longS.kmPlan < up * 0.75 - 1){ longTo = Math.round(Math.min(up, longS.kmPlan + 3)); longWhy = 'sortie longue un peu courte pour ta base'; }
    }
    // répartition : sortie longue d'abord, puis footings EF au prorata
    const adj = o.sess.filter(function(s){ return !s.done && (!s.date || s.date >= today) && s.type === 'ef'; });
    // zone conseillée = cible ± 15 % : seules les semaines qui en sortent sont corrigées (jusqu'au bord de la zone)
    // en construction, la hausse reste proche de +12 %/semaine (+4 % de tolérance, +10 % au pic) ; ailleurs ± 15 %
    const hiZ = t * (build ? (t >= peak - 0.5 ? 1.1 : 1.04) : 1.15), loZ = t * 0.85;
    let goal = o.km > hiZ ? hiZ : o.km < loZ ? Math.min(loZ, o.km * 1.25) : null;
    if(goal != null && goal > o.km && ((noUp && o.now) || (toRace != null && toRace < TAPER.length))) goal = null;   // affûtage / fatigue : jamais de hausse
    const changes = {};
    let target = Math.round(o.km);
    if(longTo != null){ changes[longS.key] = { s: longS, to: longTo, why: longWhy }; target += longTo - longS.kmPlan; }
    if(horizon && goal != null && Math.abs(goal - o.km) >= 3 && adj.length){
      const want = Math.round(goal) - target;
      const sumEf = adj.reduce(function(x, s){ return x + s.kmPlan; }, 0) || 1;
      const lim = (longTo != null ? longTo : longS ? longS.kmPlan : 99) - 1;
      adj.forEach(function(s){
        let to = Math.round(s.kmPlan + want * s.kmPlan / sumEf);
        to = Math.max(3, Math.min(to, s.kmPlan + 5, lim));
        if(to !== s.kmPlan) changes[s.key] = { s: s, to: to, why: 'semaine ' + Math.round(o.km) + ' → ' + t + ' km conseillés (' + why + ')' };
      });
    }
    let after = o.km; Object.keys(changes).forEach(function(k){ after += changes[k].to - changes[k].s.kmPlan; });
    out.weeks.push({ w: o.w, from: o.from, plan: Math.round(o.km), target: t, after: Math.round(after), why: why, kind: o.kind, now: o.now, changed: Object.keys(changes).length > 0 });
    Object.keys(changes).forEach(function(k){
      const c = changes[k], s = c.s;
      out.proposals.push({ key: s.key, w: s.w, date: s.date, field: 'km', title: s.title, type: s.type, before: s.kmPlan, after: c.to, src: 'calcul', kind: 'volume',
        delta: c.to - s.kmPlan, reason: 'Volume : ' + c.why + '.', short: (c.to > s.kmPlan ? 'Plus de volume : ' : 'Moins de volume : ') + c.why + '.' });
    });
    prevT = after; prevLong = longTo != null ? longTo : longS ? longS.kmPlan : prevLong;
    if(o.kind !== 'recov' && !(toRace != null && toRace < 3)){ lastBuild = after; buildLong = prevLong; }
  });
  return out;
}

// ─── 5. Dérive cardiaque (splits Strava des footings et sorties longues) ────
// efficacité = vitesse / FC ; dérive = baisse d'efficacité entre la 1re et la 2e moitié (1er km écarté)
function prDrift(today){
  const runs = prDoneLog(today).filter(function(x){ return (x.type === 'ef' || x.type === 'long') && prDays(x.date, today) <= 42; }).map(function(x){
    const sp = (((x.s.perf || {}).strava || {}).splits || []).filter(function(p){ return p.allure && p.fc && p.distanceKm >= 0.9; });
    if(sp.length < 6) return null;
    const body = sp.slice(1), h = Math.floor(body.length / 2);
    const eff = function(arr){ return prMean(arr.map(function(p){ const s = prPaceSec(p.allure); return s ? (1000 / s) / p.fc : null; }).filter(Boolean)); };
    const e1 = eff(body.slice(0, h)), e2 = eff(body.slice(h));
    return e1 && e2 ? { date: x.date, km: x.km, type: x.type, drift: (e1 - e2) / e1 * 100 } : null;
  }).filter(Boolean).sort(function(a, b){ return b.date.localeCompare(a.date); }).slice(0, 5);
  if(!runs.length) return null;
  const avg = prMean(runs.map(function(r){ return r.drift; }));
  return { avg: avg, n: runs.length, runs: runs, label: avg < 3 ? 'excellente' : avg < 5 ? 'solide' : avg < 8 ? 'à consolider' : 'fragile' };
}

// ─── 6. Séance test (5 km) toutes les ~6 semaines sans repère ───────────────
const PR_TEST = { t: 'Test 5 km', d: '3 km EF · 5 km test : à fond, régulier · 2 km EF', km: 10, type: 'tempo' };
function prTestProposal(st, a){
  const today = a.opt.today, raceDate = a.race && a.race.date; if(!raceDate) return null;
  const sess = prSessions(st);
  if(sess.some(function(s){ return !s.done && /^Test\b/i.test(s.title); })) return null;
  let lastB = null;
  (a.fit.sources || []).forEach(function(x){ if(x.kind === 'course' && x.date && x.date <= today && (!lastB || x.date > lastB)) lastB = x.date; });
  (st === state && typeof prAllDone === 'function' ? prAllDone(today) : sess).forEach(function(s){ if(s.done && /^Test\b/i.test(s.title) && s.date && (!lastB || s.date > lastB)) lastB = s.date; });
  if(raceDate <= today) return null;
  const W = prWeeks(st, today), due = lastB ? prAddDays(lastB, 42) : today, latest = prAddDays(raceDate, -21), soon = prAddDays(today, 5);
  const cand = sess.filter(function(s){ const o = W[s.w]; return !s.done && !s.skip && (s.type === 'tempo' || s.type === 'frac') && s.date && s.date >= soon && s.date >= due && s.date <= latest && o && o.kind !== 'recov' && o.kind !== 'taper' && !o.race; })
    .sort(function(x, y){ return x.date.localeCompare(y.date); });
  if(!cand.length) return null;
  const s = cand.find(function(x){ return x.type === 'tempo' && prDays(cand[0].date, x.date) <= 7; }) || cand[0];
  const weeksAgo = lastB ? Math.round(prDays(lastB, s.date) / 7) : null;
  return { key: s.key, w: s.w, date: s.date, field: 'session', title: s.title, type: s.type, before: { t: s.title, d: s.detail, km: s.kmPlan, type: s.type }, after: Object.assign({}, PR_TEST),
    src: 'calcul', kind: 'test', reason: 'Séance test : ' + (weeksAgo ? 'dernier repère il y a ' + weeksAgo + ' semaines' : 'aucun repère récent') + ', un 5 km à fond recale ton niveau et toutes tes allures.',
    short: (weeksAgo ? 'Dernier repère il y a ' + weeksAgo + ' semaines' : 'Aucun repère récent') + ' : un 5 km test recale ton niveau et tes allures.' };
}
// temps d'un test 5 km réalisé : bloc saisi, tour Strava de ~5 km, sinon allure moyenne si la séance fait ~5 km
function prTestTime(s){
  const ok = function(t){ return t >= 750 && t <= 3000 ? t : null; };          // 5 km entre 12'30 et 50'
  const bl = (s.perf.blocsAllure || []).filter(Boolean).map(prPaceSec).filter(Boolean);
  if(bl.length === 1){ const v = bl[0]; return ok(v * 5) || ok(v); }          // allure « 4:10 » ou temps « 20:50 » saisi à la place
  return _prTestTimeLaps(s, ok);
}
function _prTestTimeLaps(s, ok){
  const laps = (((s.perf || {}).strava || {}).laps || []).filter(function(l){ return l.distanceKm >= 4.8 && l.distanceKm <= 5.3 && l.duree_sec; });
  if(laps.length) return ok(laps[0].duree_sec / laps[0].distanceKm * 5);
  const p = prPaceSec(s.perf.pace); if(p && s.km >= 4.8 && s.km <= 5.3) return ok(p * 5);
  return null;
}

// ─── 7. WHOOP : récupération et VFC des derniers jours ──────────────────────
function prWhoop(today){
  const wd = state.whoop_data;
  const rec = ((wd && wd.recoveries) || []).filter(function(r){ return r && r.date && r.score != null; }).sort(function(a, b){ return b.date.localeCompare(a.date); });
  if(!rec.length || prDays(rec[0].date, today) > 2) return null;
  const last3 = rec.slice(0, 3), base = rec.slice(3, 14).filter(function(r){ return r.hrv; });
  const red = last3.filter(function(r){ return r.score < 34; }).length, avg3 = prMean(last3.map(function(r){ return r.score; }));
  const hrv3 = prMean(last3.filter(function(r){ return r.hrv; }).map(function(r){ return r.hrv; })), hrvB = base.length >= 5 ? prMean(base.map(function(r){ return r.hrv; })) : null;
  const hrvDrop = hrv3 && hrvB ? (hrv3 / hrvB - 1) * 100 : null;
  return { tired: red >= 2 || avg3 < 40 || (hrvDrop != null && hrvDrop <= -15), fresh: avg3 >= 67 && (hrvDrop == null || hrvDrop >= -5),
    avg3: Math.round(avg3), red: red, hrvDrop: hrvDrop != null ? Math.round(hrvDrop) : null, scores: last3.map(function(r){ return r.score; }) };
}
// séances déjà allégées par une mise à jour (WHOOP / douleur) depuis une date : pas de nouvel allègement par-dessus
function prEasedSince(st, since){
  const out = {};
  (st._plan_reviews || []).forEach(function(h){ if(h.undone || !h.date || h.date < since) return; (h.changes || []).forEach(function(c){ if(c.kind === 'whoop' || c.kind === 'pain') out[c.ref] = 1; }); });
  return out;
}
function prWhoopProposals(st, a, wh){
  if(!wh || !wh.tired) return [];
  const today = a.opt.today, end = prAddDays(today, 3), eased = prEasedSince(st, prAddDays(today, -4));
  const efTxt = (function(){ const c = {}; prSessions(st).forEach(function(s){ if(s.type === 'ef' && s.pace) c[s.pace.text] = (c[s.pace.text] || 0) + 1; }); const k = Object.keys(c).sort(function(x, y){ return c[y] - c[x]; })[0]; return k || (a.fit.paces ? prPace(a.fit.paces.E[0]) + ' — ' + prPace(a.fit.paces.E[1]) + ' /km' : 'allure très facile'); })();
  const why = 'WHOOP : récupération ' + wh.scores.map(function(x){ return x + ' %'; }).join(', ') + (wh.hrvDrop != null && wh.hrvDrop < 0 ? ', VFC ' + wh.hrvDrop + ' % vs ta moyenne' : '');
  return prSessions(st).filter(function(s){ return !s.done && s.date && s.date >= today && s.date <= end && s.type !== 'race' && s.type !== 'rest' && !s.skip && !eased[s.key]; }).map(function(s){
    if(s.type === 'tempo' || s.type === 'frac') return { key: s.key, w: s.w, date: s.date, field: 'session', title: s.title, type: s.type, before: { t: s.title, d: s.detail, km: s.kmPlan, type: s.type },
      after: { t: 'Footing EF', d: efTxt, km: Math.max(4, Math.round(s.kmPlan * 0.8)), type: 'ef' }, src: 'calcul', kind: 'whoop', reason: why + ' : séance de qualité remplacée par un footing.', short: why + ' : on remplace l\'intensité par un footing.' };
    const to = Math.min(s.kmPlan, Math.max(3, Math.round(s.kmPlan * 0.8)));
    return to === s.kmPlan ? null : { key: s.key, w: s.w, date: s.date, field: 'km', title: s.title, type: s.type, before: s.kmPlan, after: to, src: 'calcul', kind: 'whoop', delta: to - s.kmPlan, reason: why + ' : volume allégé de 20 %.', short: why + ' : −20 % de volume.' };
  }).filter(Boolean);
}

// ─── 9. Trajectoire vers l'objectif ─────────────────────────────────────────
// points datés (courses, tests, séances de qualité sur 6 mois, prépa précédente incluse), tendance sur 4 mois, projection au jour J
function prSessionVdot(s, hrMax){
  const it = prIntent(s); if(it !== 'T' && it !== 'I' && it !== 'race') return null;
  const bl = (s.perf.blocsAllure || []).map(prPaceSec).filter(Boolean); if(bl.length < 2) return null;
  const wx = typeof prWxAdjFromMeteo === 'function' ? prWxAdjFromMeteo(s.perf.meteo).pct : 0;
  let v = vdotFromPaceAt(prMean(bl) / (1 + wx / 100), it === 'I' ? 0.975 : it === 'race' ? 0.9 : 0.88);
  const hr = parseInt(s.perf.hr); if(hr && hr > 0.93 * hrMax) v -= 0.8;
  return v;
}
function prTrajectory(a){
  const f = a.fit, today = a.opt.today, R = a.race || {}; if(!f || !f.vdot) return null;
  const pts = [];
  (f.sources || []).forEach(function(x){ if(x.kind === 'course' && x.date && prDays(x.date, today) <= 180 && prDays(x.date, today) >= 0) pts.push({ date: x.date, v: x.vdot, kind: 'course', label: x.label }); });
  prDoneLog(today).forEach(function(x){
    if(prDays(x.date, today) > 180) return;
    if(/^Test\b/i.test(x.s.title)) return;                                          // déjà compté via les sources du niveau
    const v = prSessionVdot(x.s, f.hrMax || 196); if(v) pts.push({ date: x.date, v: v, kind: 'séance', label: x.s.title });
  });
  pts.sort(function(p, q){ return p.date.localeCompare(q.date); });
  // tendance : séances de qualité et tests 5 km seulement (des courses de distances différentes faussent la pente)
  const rec = pts.filter(function(p){ return prDays(p.date, today) <= 120 && (p.kind === 'séance' || p.label === 'Test 5 km'); });
  let slope = 0.1 / 7, assumed = true;                                          // progression type : +0,1 / semaine
  if(rec.length >= 4 && prDays(rec[0].date, rec[rec.length - 1].date) >= 28){
    const xs = rec.map(function(p){ return prDays(rec[0].date, p.date); }), ys = rec.map(function(p){ return p.v; });
    const mx = prMean(xs), my = prMean(ys); let num = 0, den = 0;
    xs.forEach(function(x, i){ num += (x - mx) * (ys[i] - my); den += (x - mx) * (x - mx); });
    if(den > 0){ slope = Math.max(-0.05 / 7, Math.min(0.2 / 7, num / den)); assumed = false; }
  }
  const out = { pts: pts, slope: slope, assumed: assumed, now: f.vdot };
  const m = PR_RACE_M[a.opt.raceCat];
  if(R.date && R.date > today && m){
    const days = prDays(today, R.date), gain = Math.max(-1.5, Math.min(3, slope * days));
    const v = f.vdot + gain;
    out.race = { date: R.date, days: days, v: v, lo: raceTimeFromVdot(v + 0.6, m), hi: raceTimeFromVdot(v - 0.6, m), mid: raceTimeFromVdot(v, m) };
    if(a.opt.goalSec){
      out.need = vdotFromRace(m, a.opt.goalSec);
      out.verdict = v - 0.6 >= out.need ? 'atteignable' : v + 0.6 >= out.need ? 'à portée' : 'ambitieux';
    }
  }
  return out;
}
function prTrajectorySvg(T){
  if(!T || !T.race) return '';
  const W = 320, H = 150, L = 30, Rt = 8, Tp = 12, B = 22;
  const today = prTodayIso(), first = T.pts.length && T.pts[0].date < prAddDays(today, -14) ? T.pts[0].date : prAddDays(today, -28), t0 = Date.parse(first + 'T12:00:00Z'), t1 = Date.parse(T.race.date + 'T12:00:00Z'), now = Date.parse(prTodayIso() + 'T12:00:00Z');
  const vs = T.pts.map(function(p){ return p.v; }).concat([T.now, T.race.v + 0.6, T.race.v - 0.6]).concat(T.need ? [T.need] : []);
  const v0 = Math.floor(Math.min.apply(null, vs) - 0.5), v1 = Math.ceil(Math.max.apply(null, vs) + 0.5);
  const X = function(t){ return L + (t - t0) / Math.max(1, t1 - t0) * (W - L - Rt); }, Y = function(v){ return Tp + (v1 - v) / Math.max(0.5, v1 - v0) * (H - Tp - B); };
  const td = function(d){ return Date.parse(d + 'T12:00:00Z'); };
  let g = '';
  for(let v = Math.ceil(v0); v <= v1; v++) if(v1 - v0 <= 8 || v % 2 === 0) g += '<line x1="' + L + '" x2="' + (W - Rt) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" class="tj-grid"/><text x="' + (L - 5) + '" y="' + (Y(v) + 3) + '" class="tj-ax" text-anchor="end">' + v + '</text>';
  const months = []; const d = new Date(t0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  while(d.getTime() <= t1){ months.push(d.getTime()); d.setUTCMonth(d.getUTCMonth() + 1); }
  const step = Math.ceil(months.length / 5);
  months.forEach(function(t, i){ if(i % step) return; g += '<text x="' + X(t) + '" y="' + (H - 6) + '" class="tj-ax" text-anchor="middle">' + new Date(t).toLocaleDateString('fr-FR', { month: 'short' }) + '</text>'; });
  if(T.need) g += '<line x1="' + L + '" x2="' + (W - Rt) + '" y1="' + Y(T.need) + '" y2="' + Y(T.need) + '" class="tj-goal"/><text x="' + (W - Rt - 2) + '" y="' + (Y(T.need) - 4) + '" class="tj-goal-t" text-anchor="end">objectif ' + prV(T.need) + '</text>';
  const xn = X(now), xr = X(t1), yn = Y(T.now), yr = Y(T.race.v);
  g += '<polygon points="' + xn + ',' + yn + ' ' + xr + ',' + Y(T.race.v + 0.6) + ' ' + xr + ',' + Y(T.race.v - 0.6) + '" class="tj-band"/>';
  g += '<line x1="' + xn + '" y1="' + yn + '" x2="' + xr + '" y2="' + yr + '" class="tj-proj"/>';
  T.pts.forEach(function(p){ g += '<circle cx="' + X(td(p.date)) + '" cy="' + Y(p.v) + '" r="' + (p.kind === 'course' ? 4 : 2.6) + '" class="' + (p.kind === 'course' ? 'tj-race' : 'tj-ses') + '"><title>' + prEsc(p.label) + ' · ' + prV(p.v) + '</title></circle>'; });
  g += '<circle cx="' + xn + '" cy="' + yn + '" r="5" class="tj-now"/><circle cx="' + xr + '" cy="' + yr + '" r="4.5" class="tj-end"/><text x="' + xr + '" y="' + (yr - 9) + '" class="tj-end-t" text-anchor="end">' + prV(T.race.v) + '</text>';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="tj-svg" role="img" aria-label="Niveau dans le temps et projection au jour de la course">' + g + '</svg>';
}

// ─── 10. Bilan des allures proposées : tenues ou non, calibrage du calcul ───
function prCalib(st){
  const byKey = {}; prSessions(st).forEach(function(s){ byKey[s.key] = s; });
  const res = {};
  (st._plan_reviews || []).forEach(function(h){ if(h.undone) return; (h.changes || []).forEach(function(c){
    if(c.field !== 'detail') return;
    const m = String(c.after).match(PR_PACE_RE); if(!m) return;
    const s = byKey[c.ref]; if(!s || !s.done || s.detail !== c.after) return;
    const lo = prParsePace(m[1], m[2]), hi = m[3] ? prParsePace(m[3], m[4]) : lo;
    let real = prMean((s.perf.blocsAllure || []).map(prPaceSec).filter(Boolean));
    if(!real && (s.type === 'ef' || s.type === 'long')) real = prPaceSec(s.perf.pace);
    if(!real){ const laps = (((s.perf || {}).strava || {}).laps || []).map(function(l){ return prPaceSec(l.allure); }).filter(function(p){ return p && Math.abs(p - (lo + hi) / 2) <= 25; }); real = prMean(laps); }
    if(!real) return;
    const easy = s.type === 'ef' || s.type === 'long', wx = typeof prWxAdjFromMeteo === 'function' ? prWxAdjFromMeteo(s.perf.meteo).pct : 0, hiW = hi * (1 + wx / 100);   // allure cible corrigée de la météo du jour
    res[c.ref] = { key: c.ref, title: s.title, date: s.date, target: m[0].replace(/\s*\/\s*km$/, ''), real: real, ok: easy ? real <= hiW + 10 : real <= hiW + 3, hr: s.perf.hr || null, wx: wx };
  }); });
  const list = Object.keys(res).map(function(k){ return res[k]; }).sort(function(x, y){ return (x.date || '').localeCompare(y.date || ''); });
  const k = list.filter(function(r){ return r.ok; }).length, n = list.length;
  return { n: n, k: k, list: list, mode: n >= 2 && k / n < 0.5 ? 'prudent' : n >= 3 && k / n >= 0.8 ? 'confiant' : 'normal' };
}

// ─── 11. Annuler une mise à jour (séances non encore faites et non retouchées depuis) ───
function prUndoReview(i){
  const hist = state._plan_reviews || [], h = hist[i]; if(!h || h.undone) return;
  let ok = 0, skip = 0;
  (h.changes || []).forEach(function(c){
    let x; try { x = JSON.parse(state[c.ref]); } catch(e) { skip++; return; }
    if(!x || state[c.ref + '_done'] || state[c.ref + '_km'] != null){ skip++; return; }
    if(c.field === 'skip'){ if(state[c.ref + '_skip'] && state[c.ref + '_skip_reason'] === c.after){ delete state[c.ref + '_skip']; delete state[c.ref + '_skip_reason']; ok++; } else skip++; return; }
    if(c.field === 'date'){ if(x.sched_date === c.after){ x.sched_date = c.before; x.sched_day = prWeekday(c.before); x._seq = (x._seq || 0) + 1; state[c.ref] = JSON.stringify(x); ok++; } else skip++; return; }
    const parts = String(x.d || '').split('|'), title = parts[0], det = parts.slice(1).join('|');
    const same = c.field === 'detail' ? det === c.after : c.field === 'title' ? title === c.after : c.field === 'km' ? +x.km === +c.after : c.field === 'type' ? x.type === c.after
      : c.field === 'session' ? title === c.after.t && det === c.after.d : false;
    if(!same){ skip++; return; }
    if(c.field === 'detail') x.d = title + '|' + c.before;
    else if(c.field === 'title') x.d = c.before + (det ? '|' + det : '');
    else if(c.field === 'km'){ x.km = +c.before; if(c.detAfter != null && det === c.detAfter) x.d = title + '|' + c.detBefore; }
    else if(c.field === 'type') x.type = c.before;
    else if(c.field === 'session'){ x.d = c.before.t + (c.before.d ? '|' + c.before.d : ''); x.km = +c.before.km; if(c.before.type) x.type = c.before.type; }
    x._seq = (x._seq || 0) + 1; state[c.ref] = JSON.stringify(x); ok++;
  });
  h.undone = prTodayIso(); state._plan_reviews = hist;
  save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  if(typeof showToast === 'function') showToast(ok + ' séance' + (ok > 1 ? 's' : '') + ' restaurée' + (ok > 1 ? 's' : '') + (skip ? ' · ' + skip + ' déjà faite' + (skip > 1 ? 's' : '') + ' ou retouchée' + (skip > 1 ? 's' : '') : ''), '↩');
  if(_prReview){ _prReview.a = prAnalyze(); _prReview.items = _prReview.a.proposals.map(function(p){ return Object.assign({ on: true }, p); }); _prReview.auto = _prReview.items.slice(); _prReview.held = _prReview.a.held.slice(); _prRender(); }
}

// ─── 8. Après la validation d'une séance : ajustements proposés ─────────────
function prAfterValidation(){
  try {
    if(typeof usesHardPlan === 'function' && usesHardPlan()) return;
    prPrefetch().then(function(){
      const n = planReviewPending(); if(!n) return;
      // attendre que le retour de séance (fenêtre) soit fermé
      let tries = 0;
      (function show(){
        if(document.querySelector('#modal-container .modal-overlay') && tries++ < 60) return setTimeout(show, 1500);
      if(typeof rendered !== 'undefined') rendered.plan = false;
      const old = document.getElementById('pr-snack'); if(old) old.remove();
      const el = document.createElement('div'); el.id = 'pr-snack'; el.className = 'pr-snack';
      el.innerHTML = '<span>🔄 ' + n + ' ajustement' + (n > 1 ? 's' : '') + ' proposé' + (n > 1 ? 's' : '') + ' pour ton plan</span><button type="button" onclick="document.getElementById(\'pr-snack\').remove();showScreen(\'plan\');openPlanReview()">Voir</button>';
      _prCss(); document.body.appendChild(el);
      setTimeout(function(){ if(el.parentNode) el.remove(); }, 9000);
      })();
    });
  } catch(e) {}
}
// Notification du dimanche (relecture de la semaine) : ouvre la mise à jour et demande l'avis du Coach s'il y a du nouveau
function prOpenFromNotif(){
  try { history.replaceState(null, '', location.pathname); } catch(e) {}
  if(typeof usesHardPlan === 'function' && usesHardPlan()) return;
  showScreen('plan');
  openPlanReview({ autoCoach: true });
}
