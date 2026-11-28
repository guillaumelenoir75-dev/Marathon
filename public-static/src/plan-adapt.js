// ─── Plan qui s'adapte à ce que tu encaisses ───────────────────────────────
// A. Note d'absorption de chaque séance faite (paAbsorb) : allure tenue, FC, effort ressenti, dérive, km, douleur, récup du lendemain
//    → « facile / juste / dur », dans les deux sens (le plan peut monter, pas seulement s'alléger) ; tendance sur 3 semaines (paTrend).
// B. Échelles de progression par famille de séance (paLadderProposals) : la prochaine séance de seuil / fractionné / vitesse /
//    allure course monte d'un palier quand les deux dernières ont été faciles, redescend après une séance dure.
// C. Volume visé selon ton objectif et ton niveau (paGoalPeak, lu par prVolumePlan) ; progression selon la tendance (paProg).
// F. Données de l'écran « Comment ton plan évolue » (paEvolution, dessiné par plan-review-ui.js).

// effort ressenti attendu (sur 10) et part de la FC max moyenne attendue sur la séance
const PA_RPE = { ef: [2, 4], long: [3, 5], tempo: [5, 7], frac: [6, 8], race: [8, 10] };
const PA_FAM = { T: 'Seuil / tempo', I: 'Fractionné', R: 'Vitesse', race: 'Allure course' };
const PA_FAM_IC = { T: '🔥', I: '⚡', R: '💨', race: '🎯' };
const PA_REC = { T: '2 min', I: '1\'30', R: '1 min', race: '2 min' };
// paliers : [répétitions, quantité] — même unité que la séance (min ou m) ; une séance garde toujours son unité
const PA_LADDERS = {
  'T|min': [[3, 6], [3, 8], [4, 8], [3, 10], [2, 15], [3, 12], [2, 20]],
  'T|m': [[3, 1600], [2, 2000], [3, 2000], [2, 3000], [3, 3000], [2, 4000], [2, 5000]],
  'I|m': [[8, 400], [6, 600], [5, 800], [6, 800], [5, 1000], [6, 1000], [5, 1200], [4, 1600]],
  'I|min': [[6, 2], [5, 3], [6, 3], [5, 4], [4, 5], [5, 5]],
  'R|m': [[8, 200], [10, 200], [8, 300], [10, 300], [8, 400]],
  'R|min': [[6, 1], [8, 1], [10, 1], [12, 1], [8, 1.5], [10, 1.5]],
  'race|m|5 km': [[6, 800], [5, 1000], [4, 1200], [3, 1600], [3, 2000]],
  'race|m|10 km': [[5, 1000], [4, 1500], [3, 2000], [3, 2500], [2, 3000], [3, 3000]],
  'race|m|Semi-marathon': [[3, 2000], [3, 2500], [3, 3000], [2, 4000], [2, 5000], [3, 4000]],
  'race|m|Marathon': [[3, 3000], [2, 5000], [3, 5000], [2, 8000], [3, 6000], [2, 10000]]
};
const PA_RE = /(\d+)\s*[×x]\s*(\d{1,2}(?:[  ]\d{3})+|\d+(?:[,.]\d+)?)\s*(min|m)\b/i;

// répétitions d'une séance : « 3 × 8 min », « 6 × 1 000 m », « 3 × 3 000 m à AS21 »
function paParseReps(text){
  const m = String(text || '').match(PA_RE); if(!m) return null;
  const q = parseFloat(m[2].replace(/[  ]/g, '').replace(',', '.')), n = +m[1];
  if(!(n >= 1 && n <= 40 && q > 0)) return null;
  return { n: n, q: q, unit: m[3].toLowerCase(), raw: m[0] };
}
function paFam(s){ const it = typeof prIntent === 'function' ? prIntent(s) : null; return it === 'E' ? 'E' : it; }
function paLadderKey(fam, unit, cat){ return fam === 'race' ? 'race|m|' + (PA_LADDERS['race|m|' + cat] ? cat : 'Semi-marathon') : fam + '|' + unit; }
// palier le plus proche (quantité de travail = répétitions × quantité)
function paRung(L, r){
  const w = r.n * r.q; let best = 0, d = Infinity;
  L.forEach(function(x, i){ const e = Math.abs(x[0] * x[1] - w) + (x[1] === r.q ? -0.01 : 0); if(e < d){ d = e; best = i; } });
  return best;
}
const paFmtQ = function(q, unit){ return unit === 'min' ? String(q).replace('.', ',') + ' min' : (q >= 1000 ? Math.floor(q / 1000) + ' ' + String(q % 1000).padStart(3, '0') : String(q)) + ' m'; };

// ─── A. Absorption d'une séance faite ───────────────────────────────────────
function paAbsorb(s, st, opt){
  st = st || state; opt = opt || {};
  if(!s || !s.done || !s.perf || s.type === 'race' || s.type === 'rest') return null;
  const p = s.perf, fam = paFam(s), parts = [];
  const add = function(k, v, t){ parts.push({ k: k, v: v, t: t }); };
  // allure des blocs (séances de qualité), corrigée de la chaleur
  if(fam && fam !== 'E' && s.pace){
    const bl = (p.blocsAllure || p._blocsAuto || []).map(function(b){ const m = String(b).match(/(\d{1,2})['’:](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; }).filter(Boolean);
    if(bl.length >= 2){
      const wx = typeof prWxAdjFromMeteo === 'function' ? prWxAdjFromMeteo(p.meteo).pct : 0;
      const avg = bl.reduce(function(a, b){ return a + b; }, 0) / bl.length / (1 + wx / 100);
      if(avg <= s.pace.lo - 3) add('pace', 1, 'blocs à ' + prPace(avg) + ', plus vite que visé (' + s.pace.text.replace(/\s*\/\s*km$/, '') + ')');
      else if(avg > s.pace.hi + 3) add('pace', -1, 'blocs à ' + prPace(avg) + ', plus lents que visé (' + s.pace.text.replace(/\s*\/\s*km$/, '') + ')');
      else add('pace', 0, 'blocs dans l\'allure visée');
    }
  }
  // FC : endurance sous le plafond = aisance ; séance de qualité au-dessus de 93 % de la FC max = limite
  const hr = parseInt(p.hr) || null;
  if(hr){
    if(fam === 'E'){
      const cap = typeof hrEfMax === 'function' ? hrEfMax(st) : 148, slow = s.pace && p.pace && typeof prPaceSec === 'function' ? prPaceSec(p.pace) > s.pace.hi + 15 : false;
      if(hr <= cap - 6 && !slow) add('hr', 1, 'FC ' + hr + ' bien sous ton plafond d\'endurance (' + cap + ')');
      else if(hr > cap + 3) add('hr', -1, 'FC ' + hr + ' au-dessus de ton plafond d\'endurance (' + cap + ')');
    } else {
      const H = typeof prHrRef === 'function' ? prHrRef(st, [], opt.today || prTodayIso()) : null, max = (H && H.max) || parseInt(st.fc_max) || null;
      if(max && hr > 0.93 * max) add('hr', -1, 'FC moyenne ' + hr + ' (' + Math.round(hr / max * 100) + ' % de ta FC max)');
    }
  }
  // effort ressenti vs attendu
  const rpe = parseInt(p.rpe) || null, R = s.type === 'long' && paLongRaceKm(s.detail) ? [4, 7] : paRpeRange(s.type);   // longue avec allure course : plus d'effort attendu ; sinon ton effort habituel (historique)
  if(rpe && R){
    if(rpe < R[0]) add('rpe', 1, 'effort ' + rpe + '/10 (attendu ' + R[0] + '-' + R[1] + ')');
    else if(rpe >= R[1] + 2) add('rpe', -1, 'effort ' + rpe + '/10 (attendu ' + R[0] + '-' + R[1] + ')');
    else if(rpe === R[1] + 1) add('rpe', -0.5, 'effort ' + rpe + '/10, un peu au-dessus de l\'attendu');
    else add('rpe', 0, 'effort ' + rpe + '/10, comme attendu');
  }
  // dérive cardiaque (endurance avec splits Strava)
  if(fam === 'E'){
    const sp = ((p.strava || {}).splits || []).filter(function(x){ return x.allure && x.fc && x.distanceKm >= 0.9; });
    if(sp.length >= 6 && typeof prPaceSec === 'function'){
      const body = sp.slice(1), h = Math.floor(body.length / 2);
      const eff = function(a){ const v = a.map(function(x){ const sec = +x.gap >= 120 && +x.gap <= 900 ? +x.gap : prPaceSec(x.allure); return sec ? (1000 / sec) / x.fc : null; }).filter(Boolean); return v.length ? v.reduce(function(a, b){ return a + b; }, 0) / v.length : null; };
      const e1 = eff(body.slice(0, h)), e2 = eff(body.slice(h));
      if(e1 && e2){ const d = (e1 - e2) / e1 * 100;
        if(d < 3) add('drift', 0.5, 'dérive cardiaque ' + Math.round(d * 10) / 10 + ' %, très stable');
        else if(d > 8) add('drift', -1, 'dérive cardiaque ' + Math.round(d) + ' %');
        else if(d > 5) add('drift', -0.5, 'dérive cardiaque ' + Math.round(d) + ' %'); }
    }
  }
  // séance écourtée
  if(s.kmPlan > 0 && s.km > 0 && s.km < s.kmPlan * 0.85) add('km', -1, Math.round(s.km * 10) / 10 + ' km sur ' + s.kmPlan + ' prévus');
  // douleur
  const pain = p.pain && p.pain.level ? +p.pain.level : 0;
  if(pain >= 2) add('pain', -2, 'douleur ' + (pain >= 3 ? 'forte' : 'gênante'));
  else if(pain === 1) add('pain', -0.5, 'petite gêne');
  // récupération WHOOP le lendemain (séances exigeantes)
  if(s.date && (fam !== 'E' || s.type === 'long')){
    const next = typeof prAddDays === 'function' ? prAddDays(s.date, 1) : null;
    const r = (((st.whoop_data || {}).recoveries) || []).filter(function(x){ return x && x.date === next && x.score != null; })[0];
    if(r && !(typeof alcRunAffected === 'function' && st === state && alcRunAffected(next))){
      if(r.score < 34) add('whoop', -0.5, 'récup du lendemain ' + r.score + ' %');
      else if(r.score >= 67) add('whoop', 0.5, 'récup du lendemain ' + r.score + ' %');
    }
  }
  if(!parts.length) return { key: s.key, date: s.date, title: s.title, type: s.type, fam: fam, score: 0, margin: 0, verdict: null, parts: parts };
  const score = parts.reduce(function(a, x){ return a + x.v; }, 0);
  const margin = parts.filter(function(x){ return x.k === 'rpe' || x.k === 'hr' || x.k === 'drift'; }).reduce(function(a, x){ return a + x.v; }, 0);
  const worst = Math.min.apply(null, parts.map(function(x){ return x.v; }));
  const verdict = score >= 1 && worst > -1 ? 'easy' : score <= -1 || worst <= -2 ? 'hard' : 'ok';
  return { key: s.key, date: s.date, title: s.title, type: s.type, fam: fam, score: Math.round(score * 10) / 10, margin: margin, verdict: verdict, parts: parts };
}
const PA_VERDICT = { easy: ['Facile', '🟢', 'Absorbée facilement'], ok: ['Juste', '🔵', 'Bien dosée'], hard: ['Dure', '🟠', 'Séance dure'] };
// séances faites récentes (toutes prépas) avec leur absorption, la plus récente d'abord
function paRecent(st, today, days){
  st = st || state; today = today || prTodayIso();
  const done = st === state && typeof prAllDone === 'function' ? prAllDone(today) : prSessions(st).filter(function(s){ return s.done; });
  return done.filter(function(s){ return s.done && s.date && s.date <= today && prDays(s.date, today) <= (days || 21) && !s.ext; })
    .sort(function(a, b){ return b.date.localeCompare(a.date); })
    .map(function(s){ return paAbsorb(s, st, { today: today }); }).filter(function(x){ return x && x.verdict; });
}
// tendance sur 3 semaines : facile (le plan peut monter), juste, dure (on ne monte pas)
function paTrend(st, today){
  const L = paRecent(st, today, 21);
  if(!L.length) return { n: 0, mean: 0, verdict: null, list: [] };
  const mean = L.reduce(function(a, x){ return a + x.score; }, 0) / L.length;
  const hard2 = L.slice(0, 2).filter(function(x){ return x.verdict === 'hard'; }).length;
  const easyN = L.filter(function(x){ return x.verdict === 'easy'; }).length;
  const verdict = hard2 >= 2 || mean <= -0.5 ? 'hard' : L.length >= 3 && mean >= 0.6 && easyN >= Math.ceil(L.length / 2) && hard2 === 0 ? 'easy' : 'ok';
  return { n: L.length, mean: Math.round(mean * 100) / 100, verdict: verdict, list: L };
}

// ─── B. Échelles des séances de qualité ─────────────────────────────────────
// prochaine séance de chaque famille (14 jours) : +1 palier après deux séances faciles (ou une facile sans séance dure),
// −1 après une séance dure ; jamais en affûtage, semaine allégée, semaine de course ni pendant la récup d'une course
function paLadderProposals(st, a, pace){
  st = st || state;
  const today = a.opt.today, cat = a.opt.raceCat, W = prWeeks(st, today), raceW = Object.keys(W).map(Number).filter(function(w){ return W[w].race; }).pop();
  const paceBy = {}; (pace || []).forEach(function(p){ if(p.field === 'detail') paceBy[p.key] = p; });
  const hist = (st === state && typeof prAllDone === 'function' ? prAllDone(today) : prSessions(st).filter(function(s){ return s.done; }))
    .filter(function(s){ return s.done && s.date && s.date <= today && prDays(s.date, today) <= 42 && !s.ext && !/^Test\b/i.test(s.title); })
    .sort(function(x, y){ return y.date.localeCompare(x.date); });
  // consignes fixées par le Coach après la dernière course : on n'y touche pas
  const lastRace = a.opt.lastRace && a.opt.lastRace.date, byCoach = {};
  (st._plan_reviews || []).forEach(function(h){ if(h.undone || (lastRace && h.date && h.date < lastRace)) return; (h.changes || []).forEach(function(c){ if(c.src === 'coach') byCoach[c.ref] = 1; }); });
  const out = [], seen = {};
  prSessions(st).filter(function(s){ return !s.done && !s.skip && s.date && s.date >= today && prDays(today, s.date) <= 14 && (s.type === 'tempo' || s.type === 'frac') && !(s.x && s.x.lib); })
    .sort(function(x, y){ return x.date.localeCompare(y.date); }).forEach(function(s){
      const fam = paFam(s); if(!fam || fam === 'E' || seen[fam]) return;
      const r = paParseReps(s.title + ' ' + s.detail); if(!r || !s.pace || /^Test\b/i.test(s.title) || byCoach[s.key]) return;
      seen[fam] = 1;
      const o = W[s.w]; if(!o || o.kind === 'taper' || o.kind === 'recov' || o.race || (raceW != null && raceW - s.w <= 1)) return;
      const key = paLadderKey(fam, r.unit, cat), L = PA_LADDERS[key]; if(!L) return;
      // séances faites de la même famille, avec des répétitions lisibles (même unité)
      const mine = hist.filter(function(x){ return paFam(x) === fam; }).map(function(x){ const rr = paParseReps(x.title + ' ' + x.detail); return rr && rr.unit === r.unit ? { s: x, r: rr, ab: paAbsorb(x, st, { today: today }) } : null; }).filter(Boolean).slice(0, 2);
      if(!mine.length || !mine[0].ab || !mine[0].ab.verdict) return;
      const v0 = mine[0].ab.verdict, v1 = mine[1] && mine[1].ab ? mine[1].ab.verdict : null;
      const adapt = paAdapt(v0, v1, (a.ladderCalib || {}).mode);               // réglage appris : franc / normal / prudent
      if(!adapt) return;
      if(adapt > 0 && a.opt.noFasterUntil && s.date <= a.opt.noFasterUntil) return;           // récup d'une course : on ne monte pas
      if(adapt > 0 && a.opt.noVolumeUp) return;                                               // fatigue WHOOP, douleur, foulée : pas de hausse
      const P = paRung(L, r), Ldone = paRung(L, mine[0].r);
      let to = Math.max(0, Math.min(L.length - 1, Ldone + adapt));
      if(adapt > 0){ if(to <= P) return; to = Math.min(to, P + 2); } else { if(to >= P) return; to = Math.max(to, P - 1); }
      const nr = L[to];
      // allure : celle proposée par le calcul du jour si elle change, sinon la consigne actuelle
      const pp = paceBy[s.key], paceTxt = pp ? pp.pa + ' /km' : s.pace.text, lo = pp ? (prParsePace.apply(null, (pp.pa.match(/(\d{1,2})['’](\d{2})/) || []).slice(1)) || s.pace.lo) : s.pace.lo;
      const hiM = String(paceTxt).match(/[—–-]\s*(\d{1,2})['’](\d{2})/), hi = hiM ? +hiM[1] * 60 + +hiM[2] : lo;
      const mid = (lo + hi) / 2;
      const di = s.detail.search(PA_RE), prefix = di > 0 ? s.detail.slice(0, di) : /^\d+\s*km EF/i.test(s.detail) ? s.detail.split('·')[0].trim() + ' · ' : '3 km EF · ';
      const recM = s.detail.match(/récup[^·|]*/i), rec = recM ? recM[0].trim() : 'récup ' + PA_REC[fam];
      const tag = (s.title + ' ' + s.detail).match(/\b(AS21|AS10|AS42|AS5|AM)\b/i);
      const qTxt = paFmtQ(nr[1], r.unit);
      const per = r.unit === 'm' && fam !== 'T' ? ' (' + prPace(lo * nr[1] / 1000) + (hi !== lo ? ' — ' + prPace(hi * nr[1] / 1000) : '') + ')' : '';
      const title = nr[0] + ' × ' + qTxt + (fam === 'T' ? (/seuil/i.test(s.title) ? ' seuil' : r.unit === 'min' ? ' tempo' : '') : fam === 'race' ? ' à ' + (tag ? tag[1].toUpperCase() : 'allure course') : '');
      const det = prefix + nr[0] + ' × ' + qTxt + (fam === 'race' && tag ? ' à ' + tag[1].toUpperCase() : '') + ' à ' + paceTxt + per + ' · ' + rec;
      const work = function(n, q){ return r.unit === 'm' ? n * q / 1000 : n * q * 60 / mid; };
      const km = Math.max(4, Math.round(s.kmPlan + work(nr[0], nr[1]) - work(r.n, r.q)));
      const why = adapt > 0 ? 'tes ' + (mine.length > 1 && v1 === 'easy' ? 'deux dernières séances' : 'dernière séance') + ' de ' + PA_FAM[fam].toLowerCase() + ' ' + (mine.length > 1 && v1 === 'easy' ? 'ont été faciles' : 'a été facile') + ' (' + mine[0].ab.parts.filter(function(x){ return x.v > 0; }).map(function(x){ return x.t; }).slice(0, 2).join(', ') + ')'
        : 'ta dernière séance de ' + PA_FAM[fam].toLowerCase() + ' a été dure (' + mine[0].ab.parts.filter(function(x){ return x.v < 0; }).map(function(x){ return x.t; }).slice(0, 2).join(', ') + ')';
      out.push({ key: s.key, w: s.w, date: s.date, field: 'session', title: s.title, type: s.type, kind: 'ladder', src: 'calcul', fam: fam, delta: to - P, rung: to, rungs: L.length,
        before: { t: s.title, d: s.detail, km: s.kmPlan, type: s.type }, after: { t: title, d: det, km: km, type: s.type },
        reason: (adapt > 0 ? 'Palier suivant' : 'Palier en dessous') + ' (' + s.title + ' → ' + title + ') : ' + why + '.',
        short: (adapt > 0 ? 'Ça monte : ' : 'On souffle : ') + title + ', car ' + why + '.' });
    });
  return out;
}

// ─── C. Volume visé selon l'objectif et le niveau ───────────────────────────
// km/semaine au pic qu'une prépa demande pour viser ce niveau (repères Daniels / Pfitzinger, prudents)
const PA_GOAL_PEAK = { '5 km': [30, 36, 42, 48], '10 km': [35, 42, 50, 56], 'Semi-marathon': [40, 48, 56, 64], 'Marathon': [55, 65, 75, 85] };
function paGoalPeak(cat, vdot, perWeek){
  const T = PA_GOAL_PEAK[cat]; if(!T || !vdot) return null;
  const i = vdot < 45 ? 0 : vdot < 50 ? 1 : vdot < 55 ? 2 : 3;
  // borné par le nombre de séances de course par semaine (~14 km par séance au plus, 17 pour un marathon)
  const cap = perWeek ? perWeek * (cat === 'Marathon' ? 17 : 14) : Infinity;
  return Math.round(Math.min(T[i], cap));
}
// progression hebdomadaire selon la tendance d'absorption (la recette fixe la base)
function paProg(base, trend){
  const v = trend && trend.verdict;
  return v === 'easy' ? Math.min(1.15, base + 0.03) : v === 'hard' ? 1 : base;
}

// ─── F. Comment ton plan évolue ─────────────────────────────────────────────
function paEvolution(a, today){
  today = today || prTodayIso();
  const st = state, trend = a.absorb || paTrend(st, today);
  // paliers : dernière séance faite et prochaine séance prévue de chaque famille
  const done = (typeof prAllDone === 'function' ? prAllDone(today) : []).filter(function(s){ return s.done && s.date && prDays(s.date, today) <= 56 && !s.ext; }).sort(function(x, y){ return y.date.localeCompare(x.date); });
  const next = prSessions(st).filter(function(s){ return !s.done && !s.skip && s.date && s.date >= today; }).sort(function(x, y){ return x.date.localeCompare(y.date); });
  const ladders = ['T', 'I', 'R', 'race'].map(function(f){
    const last = done.filter(function(s){ return paFam(s) === f && paParseReps(s.title + ' ' + s.detail); })[0];
    const nx = next.filter(function(s){ return paFam(s) === f && paParseReps(s.title + ' ' + s.detail); })[0];
    if(!last && !nx) return null;
    const ref = nx || last, r = paParseReps(ref.title + ' ' + ref.detail), L = PA_LADDERS[paLadderKey(f, r.unit, a.opt.raceCat)];
    const pr = (a.proposals || []).filter(function(p){ return p.kind === 'ladder' && nx && p.key === nx.key; })[0];
    const ab = last ? paAbsorb(last, st, { today: today }) : null;
    return { fam: f, label: PA_FAM[f], ic: PA_FAM_IC[f], rungs: L ? L.length : 0,
      last: last ? { title: last.title, date: last.date, verdict: ab && ab.verdict, rung: L ? paRung(L, paParseReps(last.title + ' ' + last.detail)) : null } : null,
      next: nx ? { title: nx.title, date: nx.date, rung: L ? paRung(L, r) : null, prop: pr ? { title: pr.after.t, rung: pr.rung, up: pr.delta > 0 } : null } : null };
  }).filter(Boolean);
  // niveau : aujourd'hui vs il y a 4 semaines
  let lvl = null;
  try { const H = typeof bsLevelHistory === 'function' ? bsLevelHistory(today) : []; if(H.length){ const now = H[H.length - 1], ago = H.length >= 5 ? H[H.length - 5] : H[0]; lvl = { now: now.v, ago: ago.v, from: ago.date, delta: Math.round((now.v - ago.v) * 10) / 10 }; } } catch(e) { if(typeof diagSilent === 'function') diagSilent(e, 'plan-adapt:paEvolution'); }
  const V = a.volume || null;
  const changes = (st._plan_reviews || []).slice(-6).reverse().map(function(h){
    const kinds = {}; (h.changes || []).forEach(function(c){ if(c.kind !== 'coherence') kinds[c.kind || c.src || 'calcul'] = (kinds[c.kind || c.src || 'calcul'] || 0) + 1; });
    return { date: h.date, n: h.n || 0, undone: !!h.undone, kind: h.kind || (h.coach ? 'coach' : h.auto ? 'autopilot' : 'maj'), kinds: kinds };
  });
  const T = a.trajectory || null;
  const calib = a.ladderCalib || paLadderCalib(state, today), habits = paHabits(state, today);
  const longP = (a.proposals || []).filter(function(p){ return p.fam === 'long'; })[0] || null;
  return { hist: a.hist || null, recal: state._hist_recal || null, calib: calib, habits: habits, longNext: longP ? { title: longP.short, date: longP.date, up: longP.delta > 0 } : null, trend: trend, ladders: ladders, level: lvl, fit: a.fit && a.fit.vdot, planVdot: a.planVdotNow || a.planVdot, volume: V ? { base: V.base, peak: V.peak, goalPeak: V.goalPeak || null, prog: V.prog || null, weeks: V.weeks } : null,
    changes: changes, goal: a.opt.goalSec || null, traj: T && T.race ? { mid: T.race.mid, lo: T.race.lo, hi: T.race.hi, verdict: T.verdict || null } : null };
}

// ─── 3. Le plan s'évalue lui-même : quand il a fait monter une séance, l'as-tu tenue ? ─────────────────
// changements « palier » (kind ladder, delta > 0) appliqués et non annulés → séance faite sans être dure = réussie
function paLadderCalib(st, today){
  st = st || state; today = today || prTodayIso();
  const byKey = {}; prSessions(st).forEach(function(s){ byKey[s.key] = s; });
  const fams = {}; let n = 0, ok = 0;
  (st._plan_reviews || []).forEach(function(h){ if(h.undone) return; (h.changes || []).forEach(function(c){
    if(c.kind !== 'ladder' || !(c.delta > 0)) return;
    const s = byKey[c.ref]; if(!s || !s.date || s.date > today) return;
    if(!s.done && !s.skip) return;                                         // pas encore jouée
    const ab = s.done ? paAbsorb(s, st, { today: today }) : null, good = !!(s.done && (!ab || ab.verdict !== 'hard'));
    const f = c.fam || paFam(s) || '?'; fams[f] = fams[f] || { n: 0, ok: 0 }; fams[f].n++; if(good) fams[f].ok++;
    n++; if(good) ok++;
  }); });
  // paliers franchis dans tout l'historique (séances pas déjà comptées ci-dessus)
  const seenK = {}; (st._plan_reviews || []).forEach(function(h){ (h.changes || []).forEach(function(c){ if(c.kind === 'ladder' && byKey[c.ref]) seenK[c.ref + '|' + byKey[c.ref].date] = 1; }); });
  const H = st === state && typeof paHist === 'function' ? paHist(today) : null; let hn = 0;
  (H && H.ladder ? H.ladder.list : []).forEach(function(x){
    if(seenK[x.key + '|' + x.date]) return;
    fams[x.fam] = fams[x.fam] || { n: 0, ok: 0 }; fams[x.fam].n++; if(x.ok) fams[x.fam].ok++;
    n++; hn++; if(x.ok) ok++;
  });
  const rate = n ? ok / n : null;
  const mode = n >= 3 && rate >= 0.8 ? 'bold' : n >= 3 && rate <= 0.6 ? 'careful' : 'normal';
  return { n: n, ok: ok, rate: rate, mode: mode, fams: fams, hist: hn };
}
// palier suivant selon les 2 dernières séances et le réglage appris : franc (une séance facile suffit, deux = +2),
// normal (une facile sans dure avant), prudent (deux faciles de suite)
function paAdapt(v0, v1, mode){
  if(v0 === 'hard') return -1;
  if(v0 !== 'easy') return 0;
  if(mode === 'bold') return v1 === 'easy' ? 2 : v1 === 'hard' ? 0 : 1;
  if(mode === 'careful') return v1 === 'easy' ? 1 : 0;
  return v1 !== 'hard' ? 1 : 0;
}

// ─── 1. Sortie longue : l'allure course entre dans la sortie longue, par paliers ───────────────────────
// km à allure course dans la sortie longue (total), à partir de N semaines de la course, jamais en semaine allégée / affûtage
const PA_LONG = { 'Semi-marathon': { tag: 'AS21', steps: [0, 2, 4, 6, 8], weeks: 10, share: 0.45 }, 'Marathon': { tag: 'AM', steps: [0, 3, 6, 10, 14, 16], weeks: 12, share: 0.6 }, '10 km': { tag: 'AS10', steps: [0, 2, 3, 4], weeks: 8, share: 0.3 } };
function paLongRaceKm(text){
  const t = String(text || '');
  const m2 = t.match(/(\d+)\s*[×x]\s*(\d+(?:[,.]\d+)?)\s*km\s*(?:à\s*)?(?:l['’])?(AS21|AS10|AS42|AM)\b/i); if(m2) return +m2[1] * parseFloat(m2[2].replace(',', '.'));
  const m1 = t.match(/(\d+(?:[,.]\d+)?)\s*km\s*(?:à\s*)?(?:l['’])?(AS21|AS10|AS42|AM)\b/i); return m1 ? parseFloat(m1[1].replace(',', '.')) : 0;
}
function paLongProposals(st, a, pace){
  st = st || state;
  const cat = a.opt.raceCat, L = PA_LONG[cat]; if(!L) return [];
  const today = a.opt.today, W = prWeeks(st, today), raceW = Object.keys(W).map(Number).filter(function(w){ return W[w].race; }).pop(); if(raceW == null) return [];
  const m = PR_RACE_M[cat] / 1000, gp = a.opt.goalSec ? a.opt.goalSec / m : a.fit && a.fit.preds && a.fit.preds[cat] ? a.fit.preds[cat] / m : null; if(!gp) return [];
  const s = prSessions(st).filter(function(x){ return x.type === 'long' && !x.done && !x.skip && x.date && x.date >= today && prDays(today, x.date) <= 14 && !(x.x && x.x.lib); }).sort(function(x, y){ return x.date.localeCompare(y.date); })[0];
  if(!s) return [];
  const o = W[s.w], toRace = raceW - s.w;
  if(!o || o.kind === 'recov' || o.kind === 'taper' || o.race || toRace < 2 || toRace > L.weeks) return [];
  if(a.opt.noVolumeUp || (a.opt.noFasterUntil && s.date <= a.opt.noFasterUntil)) return [];
  const last = (st === state && typeof prAllDone === 'function' ? prAllDone(today) : prSessions(st)).filter(function(x){ return x.done && x.type === 'long' && x.date && x.date <= today && prDays(x.date, today) <= 21 && !x.ext; })
    .sort(function(x, y){ return y.date.localeCompare(x.date); }).slice(0, 2).map(function(x){ return { s: x, ab: paAbsorb(x, st, { today: today }) }; });
  if(!last.length || !last[0].ab || !last[0].ab.verdict) return [];
  const rungOf = function(km){ return L.steps.reduce(function(b, k, i){ return k <= km ? i : b; }, 0); };
  const cur = paLongRaceKm(s.detail), P = rungOf(cur), Ldone = rungOf(paLongRaceKm(last[0].s.detail));
  const adapt = paAdapt(last[0].ab.verdict, last[1] && last[1].ab ? last[1].ab.verdict : null, (a.ladderCalib || {}).mode);
  if(!adapt) return [];
  let to = Math.max(0, Math.min(L.steps.length - 1, Ldone + Math.max(-1, Math.min(1, adapt))));   // un palier à la fois depuis la dernière longue faite
  while(to > 0 && L.steps[to] > s.kmPlan * L.share) to--;                    // jamais plus de 45 % de la sortie à allure semi
  if(adapt > 0 ? to <= P : to >= P) return [];
  const q = L.steps[to];
  const pp = (pace || []).filter(function(p){ return p.key === s.key && p.field === 'detail' && typeof p.after === 'string'; })[0];   // nouvelle allure EF du jour gardée
  const base = (pp ? pp.after : s.detail).replace(/\s*·?\s*dont\s+[^·|]*?(AS21|AS10|AS42|AM)[^·|]*/i, '').trim();
  const seg = q >= 6 && cat !== 'Marathon' ? '2 × ' + String(q / 2).replace('.', ',') + ' km à ' + L.tag + ' (récup 1 km EF)' : q + ' km à ' + L.tag;
  const after = q ? base + ' · dont ' + seg + ' en fin de sortie (' + prPace(gp) + '/km)' : base;
  const why = adapt > 0 ? 'ta dernière sortie longue a été facile (' + last[0].ab.parts.filter(function(x){ return x.v > 0; }).map(function(x){ return x.t; }).slice(0, 2).join(', ') + ')'
    : 'ta dernière sortie longue a été dure (' + last[0].ab.parts.filter(function(x){ return x.v < 0; }).map(function(x){ return x.t; }).slice(0, 2).join(', ') + ')';
  return [{ key: s.key, w: s.w, date: s.date, field: 'detail', title: s.title, type: 'long', kind: 'ladder', fam: 'long', src: 'calcul', delta: to - P, rung: to, rungs: L.steps.length,
    before: s.detail, after: after,
    reason: (q > cur ? 'Allure course dans la sortie longue : ' + (cur ? cur + ' → ' : '') + q + ' km' : q ? 'Moins d\'allure course : ' + cur + ' → ' + q + ' km' : 'Sortie longue tout en endurance') + ', car ' + why + '.',
    short: (q > cur ? 'Sortie longue + ' + seg : q ? 'Sortie longue : ' + seg + ' seulement' : 'Sortie longue sans allure course') + ', car ' + why + '.' }];
}

// ─── 2. L'objectif qui se réajuste (toutes les 4 semaines au plus, jamais à moins de 4 semaines de la course) ───
function paGoalCheck(a, st){
  st = st || state;
  const T = a.trajectory, g = a.opt.goalSec, cat = a.opt.raceCat;
  if(!T || !T.race || !g || !PR_RACE_M[cat] || T.race.days < 28) return null;
  const gc = st._goal_check || {}; if(gc.at && prDays(gc.at, a.opt.today) < 28) return null;
  const step = PR_RACE_M[cat] >= 21000 ? 30 : 10, rnd = function(x){ return Math.round(x / step) * step; }, mid = T.race.mid;
  if(mid <= g * 0.985) return { dir: 'up', from: g, to: rnd(mid * 1.005), mid: mid, cat: cat };
  if(mid >= g * 1.03 && T.verdict === 'ambitieux') return { dir: 'down', from: g, to: rnd(mid), mid: mid, cat: cat };
  return null;
}
const paHms = function(sec){ sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60; return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };
function paGoalSet(sec, keep){
  const today = prTodayIso(), a = typeof _prReview !== 'undefined' && _prReview && _prReview.a, g = a && a.goalCheck;
  if(keep){ state._goal_check = { at: today, from: g ? g.from : null, to: g ? g.to : null, answer: 'kept' }; }
  else {
    const t = paHms(sec); state.target_time = t;
    if(state.onboarding && typeof state.onboarding === 'object') state.onboarding = Object.assign({}, state.onboarding, { target_time: t });
    state._goal_check = { at: today, from: g ? g.from : null, to: sec, answer: 'changed' };
  }
  save();
  if(typeof prHistoryChanged === 'function') prHistoryChanged();
  if(typeof showToast === 'function') showToast(keep ? 'Objectif gardé' : 'Nouvel objectif : ' + prTime(sec), '🎯');
  if(typeof openPlanReview === 'function' && document.getElementById('plan-review')){ closePlanReview(); openPlanReview(); }
}

// ─── 5. Ta vraie semaine : les jours où tu fais vraiment tes séances clés ──────────────────────────────
// au moins 3 des 4 dernières séances d'un type faites un même jour de la semaine, différent du jour prévu → séances des 2 prochaines
// semaines déplacées sur ce jour (échangées avec un footing s'il y en a un), sans deux séances dures à moins de 48 h, ni sur une activité fixe
function paHabits(st, today){
  st = st || state; today = today || prTodayIso();
  const out = {};
  ['tempo', 'frac', 'long'].forEach(function(ty){
    const done = prSessions(st).filter(function(s){ return s.done && s.type === ty && s.date && s.date <= today && prDays(s.date, today) <= 70; }).sort(function(a, b){ return b.date.localeCompare(a.date); }).slice(0, 4);
    if(done.length < 3) return;
    const c = {}; done.forEach(function(s){ const d = prWeekday(s.date); c[d] = (c[d] || 0) + 1; });
    const d = +Object.keys(c).sort(function(a, b){ return c[b] - c[a]; })[0];
    if(c[d] >= 3) out[ty] = { day: d, n: c[d], of: done.length };
  });
  return out;
}
const PA_DAYS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
function paHabitProposals(st, a){
  st = st || state;
  const today = a.opt.today, H = paHabits(st, today), out = [], used = {};
  const all = prSessions(st).filter(function(s){ return !s.done && !s.skip && s.date; });
  const hard = function(s){ return ['tempo', 'frac', 'long', 'race'].indexOf(s.type) >= 0; };
  const fixedHard = function(date){ return typeof cpFixedOn === 'function' ? cpFixedOn(st, prWeekday(date)).some(function(f){ return (f.gap || 0) >= 12; }) : false; };
  Object.keys(H).forEach(function(ty){
    const day = H[ty].day;
    all.filter(function(s){ return s.type === ty && s.date > today && prDays(today, s.date) <= 14 && prWeekday(s.date) !== day && !used[s.key]; }).forEach(function(s){
      const target = prAddDays(s.date, day - prWeekday(s.date)); if(target <= today || fixedHard(target)) return;
      const week = all.filter(function(x){ return x.w === s.w && x.key !== s.key; });
      if(week.some(function(x){ return hard(x) && Math.abs(prDays(x.date, target)) <= 1; })) return;   // 48 h entre deux séances dures
      const there = week.filter(function(x){ return x.date === target; });
      if(there.some(function(x){ return x.type !== 'ef'; })) return;
      const why = 'tu fais tes séances de ce type le ' + PA_DAYS[day] + ' (' + H[ty].n + ' des ' + H[ty].of + ' dernières)';
      const pair = 'habit-' + s.key;
      out.push({ key: s.key, w: s.w, date: s.date, field: 'date', title: s.title, type: s.type, before: s.date, after: target, src: 'calcul', kind: 'habit', pair: there.length ? pair : undefined, reason: 'Déplacée au ' + PA_DAYS[day] + ' : ' + why + '.', short: 'Au ' + PA_DAYS[day] + ', ton jour habituel pour cette séance.' });
      there.forEach(function(x){ used[x.key] = 1; out.push({ key: x.key, w: x.w, date: x.date, field: 'date', title: x.title, type: x.type, before: x.date, after: s.date, src: 'calcul', kind: 'habit', pair: pair, reason: 'Échangée avec ' + s.title + ' (' + why + ').', short: 'Échangée avec ' + s.title + '.' }); });
      used[s.key] = 1;
    });
  });
  return out;
}

// ─── 6. La semaine prochaine préparée (samedi, dimanche) ──────────────────────────────────────────────
function paNextWeek(a, today){
  today = today || a.opt.today;
  const wd = prWeekday(today); if(wd < 6) return null;
  const from = prAddDays(today, 8 - wd), to = prAddDays(from, 6);
  const props = (a.proposals || []).filter(function(p){ return p.date && p.date >= from && p.date <= to; });
  const sess = prSessions(state).filter(function(s){ return s.date && s.date >= from && s.date <= to && !s.skip && s.type !== 'rest'; }).sort(function(x, y){ return x.date.localeCompare(y.date); });
  if(!sess.length) return null;
  let km = sess.reduce(function(x, s){ return x + (s.type === 'race' ? 0 : s.kmPlan); }, 0);
  props.forEach(function(p){ if(p.field === 'km') km += p.after - p.before; else if(p.field === 'session' && p.after) km += (+p.after.km || 0) - (+p.before.km || 0); });
  return { from: from, to: to, km: Math.round(km), props: props, sessions: sess.map(function(s){ const p = props.filter(function(x){ return x.key === s.key; })[0]; return { key: s.key, date: s.date, title: p && p.field === 'session' && p.after ? p.after.t : s.title, km: s.kmPlan, changed: !!p }; }) };
}

// ─── M. Les propositions dites simplement (accueil « Ton plan », MAJ le plan) ──────────────────────────
// sens d'un changement : monte / s'allège / bouge / autre ; phrase courte de ce qui change
function paPaceDelta(p){
  if(p.pb && p.pa && p.delta) return p.delta;
  if(p.field !== 'detail' || typeof PR_PACE_RE === 'undefined') return 0;
  const m1 = String(p.before || '').match(PR_PACE_RE), m2 = String(p.after || '').match(PR_PACE_RE);
  if(!m1 || !m2 || m1[0] === m2[0]) return 0;
  const mid = function(m){ const x = +m[1] * 60 + +m[2], y = m[3] ? +m[3] * 60 + +m[4] : x; return (x + y) / 2; };
  return Math.round(mid(m2) - mid(m1));
}
function paDir(p){
  if(p.kind === 'test') return 'other';
  if(p.kind === 'pick') return 'lib';
  if(p.kind === 'lib') return p.sub === 'step' ? (p.delta > 0 ? 'up' : 'down') : 'lib';
  if(p.field === 'date') return 'move';
  if(p.field === 'skip') return 'down';
  if(p.field === 'add') return 'up';
  if(p.field === 'km') return +p.after > +p.before ? 'up' : +p.after < +p.before ? 'down' : 'other';
  if(p.kind === 'ladder') return p.delta > 0 ? 'up' : 'down';
  if(p.field === 'session'){
    if(p.kind === 'whoop' || p.kind === 'pain') return 'down';
    const a = +((p.after || {}).km) || 0, b = +((p.before || {}).km) || 0; return a > b ? 'up' : a < b ? 'down' : 'other';
  }
  const d = paPaceDelta(p); return d < 0 ? 'up' : d > 0 ? 'down' : 'other';
}
const PA_DIR = { up: ['↑', 'Ça monte'], down: ['↓', 'On allège'], move: ['⇄', 'Ça bouge'], lib: ['✦', 'Séances de pro'], other: ['•', 'Autres ajustements'] };
function paLine(p){
  const f = p.field, A = p.after || {}, dir = paDir(p);
  const day = function(d){ return typeof prFmtDate === 'function' ? prFmtDate(d, { weekday: 'long' }) : d; };
  let t;
  if(p.kind === 'test') t = 'Test 5 km pour mesurer ton niveau';
  else if(p.kind === 'pick') t = (p.advice ? (p.sub === 'pro' ? '✦ Pro conseillée : ' : 'Classique conseillée : ') : (p.sub === 'pro' ? 'Version pro : ' : 'Version classique : ')) + (A.t || '');
  else if(p.kind === 'lib') t = p.sub === 'refresh' ? 'Allures recalées sur ton niveau' : (p.sub === 'step' ? (p.delta > 0 ? 'Un cran plus dur : ' : 'Un cran plus facile : ') : 'Devient : ') + (A.t || '');
  else if(f === 'date') t = 'Déplacée au ' + day(p.after);
  else if(f === 'km'){ const d = Math.round((+p.after - +p.before) * 10) / 10; t = (d > 0 ? '+' : '−') + String(Math.abs(d)).replace('.', ',') + ' km · ' + String(p.after).replace('.', ',') + ' km au total'; }
  else if(f === 'session') t = (p.kind === 'ladder' ? (p.delta > 0 ? 'Un cran plus dur : ' : 'Un cran plus facile : ') : p.kind === 'whoop' || p.kind === 'pain' ? 'Remplacée par ' : 'Devient ') + (A.t || 'séance') + (A.km ? ' · ' + A.km + ' km' : '');
  else if(f === 'detail' && p.fam === 'long') t = String(p.short || '').split(', car')[0];
  else if(f === 'skip') t = 'Retirée du plan';
  else if(f === 'add') t = 'Ajoutée : ' + (A.t || 'séance');
  else if(f === 'type') t = 'Devient ' + ((typeof typeLabel !== 'undefined' && typeLabel[p.after]) || p.after);
  else if(f === 'title') t = 'Nouveau nom : ' + p.after;
  else {
    const d = paPaceDelta(p), pa = p.pa || ((String(p.after || '').match(PR_PACE_RE) || [''])[0]).replace(/\s*\/\s*km$/, '');
    t = d ? (d < 0 ? 'Plus rapide de ' : 'Plus lente de ') + Math.abs(d) + ' s/km · ' + pa + '/km' : 'Consigne revue';
  }
  return { dir: dir, t: t };
}
// la raison principale en une phrase (tête de la carte de l'accueil et de MAJ le plan)
function paLead(a){
  const pn = a.internal && a.internal.pains && a.internal.pains[0], f = a.fit || {}, pv = a.planVdotNow || a.planVdot;
  const V = function(x){ return String(Math.round(x * 10) / 10).replace('.', ','); };
  if(pn && pn.level >= 2) return { ic: '🩹', t: 'Douleur signalée : le plan s\'allège quelques jours.' };
  if(a.whoop && a.whoop.tired) return { ic: '😮‍💨', t: 'Récup basse ces nuits : on lève le pied.' };
  if(a.opt && a.opt.postRace) return { ic: '🛌', t: 'Récup après ta course : on reprend doucement.' };
  if(f.vdot && pv && f.vdot - pv >= 1) return { ic: '📈', t: 'Tu as progressé : niveau ' + V(f.vdot) + ', ton plan est à ' + V(pv) + '.' };
  if(a.absorb && a.absorb.verdict === 'easy') return { ic: '💪', t: 'Tes séances passent bien : le plan monte d\'un cran.' };
  if(a.absorb && a.absorb.verdict === 'hard') return { ic: '🧘', t: 'Séances récentes dures : le plan ne monte pas.' };
  if(f.vdot && pv && pv - f.vdot >= 1) return { ic: '🧭', t: 'Ton plan est au-dessus de ton niveau : on le recale.' };
  return (a.proposals || []).length ? { ic: '🔧', t: 'Petits ajustements pour coller à ton niveau.' } : { ic: '✓', t: 'Ton plan est à ton niveau.' };
}
// résumé pour la carte de l'accueil
function planNews(a, st){
  st = st || state;
  const P = (a.proposals || []).slice().sort(function(x, y){ return (x.date || '').localeCompare(y.date || ''); });
  const counts = { up: 0, down: 0, move: 0, lib: 0, other: 0 };
  const lines = P.map(function(p){ const L = paLine(p); counts[L.dir]++; return { key: p.key, date: p.date, title: p.title, dir: L.dir, t: L.t, pair: p.pair || null }; })
    .filter(function(x, i, arr){ return !x.pair || arr.findIndex(function(y){ return y.pair === x.pair; }) === i; });   // un échange = une ligne
  const NW = a.nextWeek && st._week_ok !== a.nextWeek.from ? a.nextWeek : null;
  const CV = typeof prCoachVerdict === 'function' ? prCoachVerdict() : null;
  const coach = CV && CV.fresh && !CV.agree && !CV.applied && CV.n ? { n: CV.n, text: CV.text, first: CV.first ? { title: CV.first.title, date: CV.first.date, t: paLine(CV.first).t } : null } : null;
  const RC = st._hist_recal && !st._hist_recal.undone && st._hist_recal.n && prDays(st._hist_recal.date, a.opt.today) <= 7 ? st._hist_recal : null;
  return { offer: !!a.libOffer, libOn: !!st._lib_on, coach: coach, coachOk: !!(CV && CV.fresh && CV.agree), recal: RC, n: P.length, lead: paLead(a), counts: counts, lines: lines, goal: a.goalCheck || null, next: NW ? { from: NW.from, km: NW.km, n: NW.props.length } : null,
    green: a.greenLight ? a.greenLight.text : null, unseen: !!P.length && typeof prSig === 'function' && prSig(a.proposals) !== st._review_seen };
}
// carte « Ton plan » de l'accueil (#home-plan-card) : calcul gardé tant que les données ne changent pas
let _hpCache = null;
function planCardRender(){
  if(typeof document === 'undefined') return;
  const el = document.getElementById('home-plan-card'); if(!el) return;
  const sec = document.getElementById('ph-sec-plan');
  const hide = function(){ el.innerHTML = ''; el.style.display = 'none'; if(sec) sec.style.display = 'none'; };
  if(!state || !state._plan_engine || (typeof _prepView !== 'undefined' && _prepView) || (typeof _adminPreviewUid !== 'undefined' && _adminPreviewUid) || !window._prPrefetchDone || typeof prAnalyze !== 'function') return hide();
  let N;
  try {
    const today = prTodayIso(), R = state._plan_reviews || [], last = R[R.length - 1] || {};
    const key = [today, prDataSig(), R.length, last.at || last.date || '', last.undone ? 1 : 0, state.target_time || '', state._week_ok || '', (state._goal_check || {}).at || '', state._review_seen || '', JSON.stringify(state._hist_recal || null), (state._coach_review || {}).at || '', (state._coach_review || {}).applied ? 1 : 0, state._lib_on || '', JSON.stringify(state._lib_offer || null), Object.keys(state).length].join('|');
    if(_hpCache && _hpCache.key === key && Date.now() - _hpCache.t < 300000) N = _hpCache.n;
    else { N = planNews(prAnalyze(), state); _hpCache = { key: key, t: Date.now(), n: N };
      try { document.querySelectorAll('.sl-vchip[data-k]').forEach(function(el){ let x = null; try { x = JSON.parse(state[el.dataset.k]); } catch(e) { return; } const h = slChipHtml(x, el.dataset.k); if(h) el.outerHTML = h; }); } catch(e) { diagSilent(e, 'plan-adapt:chips'); } }
  } catch(e) { diagSilent(e, 'plan-adapt:planCardRender'); return hide(); }
  _hpCss();
  el.style.display = ''; if(sec) sec.style.display = '';
  const esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const D = function(d){ return d ? prFmtDate(d, { weekday: 'short', day: 'numeric' }).replace('.', '') : ''; };
  const evo = typeof openPlanEvolution === 'function';
  const recal = N.recal ? '<div class="hp-rc"><span>🧬 Recalé sur tout ton historique · ' + N.recal.n + ' séance' + (N.recal.n > 1 ? 's' : '') + '</span><button type="button" onclick="paHistUndo()">Annuler</button></div>' : '';
  const coachRow = N.coach ? '<button type="button" class="hp-r coach" onclick="openPlanReview()"><i aria-hidden="true">🤖</i><span class="hp-x"><b>Le Coach propose autre chose</b><small>' + esc(N.coach.first ? D(N.coach.first.date) + ' · ' + N.coach.first.title + ' : ' + N.coach.first.t : (N.coach.text || N.coach.n + ' changement' + (N.coach.n > 1 ? 's' : ''))) + '</small></span></button>' : '';
  const offerRow = N.offer ? '<button type="button" class="hp-r lib" onclick="openLibPreview()"><i aria-hidden="true">✦</i><span class="hp-x"><b>Séances de pro, à la carte</b><small>Chaque séance en 2 versions : classique ou pro · Choisir</small></span></button>' : '';
  if(!N.n && !N.goal && !N.next && !N.coach && !N.offer){
    if(recal){ el.innerHTML = '<section class="hp">' + recal + '<button type="button" class="hp-h" style="margin-top:8px" onclick="' + (evo ? 'openPlanEvolution()' : 'openPlanReview()') + '"><span class="hp-ic ok">✓</span><span class="hp-t"><b>Ton plan est à jour</b><small>' + esc(N.green || N.lead.t) + '</small></span><span class="hp-go">›</span></button></section>'; return; }
    el.innerHTML = '<button type="button" class="hp hp-ok" onclick="' + (evo ? 'openPlanEvolution()' : 'openPlanReview()') + '"><span class="hp-ic ok">✓</span><span class="hp-t"><b>Ton plan est à jour</b><small>' + esc(N.green || N.lead.t) + '</small></span><span class="hp-go">›</span></button>';
    return;
  }
  const rows = N.lines.slice(0, 3).map(function(x){
    return '<button type="button" class="hp-r ' + x.dir + '" onclick="openPlanReview()"><i aria-hidden="true">' + PA_DIR[x.dir][0] + '</i><span class="hp-d">' + esc(D(x.date)) + '</span><span class="hp-x"><b>' + esc(x.title) + '</b><small>' + esc(x.t) + '</small></span></button>';
  });
  if(coachRow) rows.unshift(coachRow);
  if(offerRow) rows.unshift(offerRow);
  if(N.goal) rows.unshift('<button type="button" class="hp-r goal" onclick="openPlanReview()"><i aria-hidden="true">🎯</i><span class="hp-x"><b>' + (N.goal.dir === 'up' ? 'Tu es en avance sur ton objectif' : 'Ton objectif semble loin') + '</b><small>' + esc(prTime(N.goal.from) + ' → ' + prTime(N.goal.to) + ' possible') + '</small></span></button>');
  if(N.next) rows.push('<button type="button" class="hp-r next" onclick="openPlanReview()"><i aria-hidden="true">📅</i><span class="hp-x"><b>Semaine prochaine prête</b><small>' + N.next.km + ' km' + (N.next.n ? ' · ' + N.next.n + ' ajustement' + (N.next.n > 1 ? 's' : '') : '') + (N.coachOk ? ' · relue par le Coach' : '') + ' · à valider</small></span></button>');
  const more = N.lines.length - 3;
  const C = N.counts, chips = ['up', 'down', 'move', 'lib'].filter(function(k){ return C[k]; }).map(function(k){ return '<span class="hp-c ' + k + '">' + PA_DIR[k][0] + ' ' + C[k] + '</span>'; }).join('');
  el.innerHTML = '<section class="hp" aria-label="Ton plan">' + recal
    + '<button type="button" class="hp-h" onclick="openPlanReview()"><span class="hp-ic">' + esc(N.lead.ic) + '</span><span class="hp-t"><b>' + (N.n ? 'Ton plan s\'adapte' : 'Ton plan') + '' + (N.unseen ? ' <em class="hp-new">Nouveau</em>' : '') + '</b><small>' + esc(N.lead.t) + '</small></span></button>'
    + (chips ? '<div class="hp-cs">' + chips + '<span class="hp-cl">' + N.n + ' changement' + (N.n > 1 ? 's' : '') + ' proposé' + (N.n > 1 ? 's' : '') + '</span></div>' : '')
    + '<div class="hp-l">' + rows.join('') + (more > 0 ? '<button type="button" class="hp-more" onclick="openPlanReview()">+ ' + more + ' autre' + (more > 1 ? 's' : '') + '</button>' : '') + '</div>'
    + (N.green ? '<p class="hp-g">🟢 ' + esc(N.green) + '</p>' : '')
    + '<div class="hp-a"><button type="button" class="hp-b pri" onclick="openPlanReview()">Voir et valider</button>' + (evo ? '<button type="button" class="hp-b" onclick="openPlanEvolution()">Comment il évolue</button>' : '') + '</div></section>';
}
function _hpCss(){
  if(document.getElementById('hp-css')) return;
  const s = document.createElement('style'); s.id = 'hp-css';
  s.textContent = '.hp{display:block;width:100%;box-sizing:border-box;background:#fff;border:1px solid #DCE5F3;border-radius:18px;padding:12px;margin:0 0 4px;font-family:inherit;color:#0F172A;text-align:left;}'
    + 'button.hp{cursor:pointer;display:flex;align-items:center;gap:10px;}'
    + '.hp-h{display:flex;align-items:center;gap:10px;width:100%;background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;text-align:left;cursor:pointer;}'
    + '.hp-ic{flex:0 0 36px;height:36px;border-radius:12px;background:#EEF3FC;display:flex;align-items:center;justify-content:center;font-size:18px;}.hp-ic.ok{background:#ECFDF5;color:#047857;font-weight:900;}'
    + '.hp-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}.hp-t b{font-size:15px;font-weight:800;}.hp-t small{font-size:12.5px;color:#475569;line-height:1.35;}'
    + '.hp-new{font-style:normal;font-size:10.5px;font-weight:800;color:#fff;background:#1B4FD8;border-radius:8px;padding:1px 6px;margin-left:6px;vertical-align:2px;}'
    + '.hp-go{font-size:22px;color:#94A3B8;}'
    + '.hp-cs{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:10px 0 2px;}.hp-c{font-size:12px;font-weight:800;border-radius:9px;padding:2px 8px;}.hp-cl{font-size:12px;color:#64748B;}'
    + '.hp-c.up,.hp-r.up i{background:#ECFDF5;color:#047857;}.hp-c.down,.hp-r.down i{background:#FFFBEB;color:#B45309;}.hp-c.move,.hp-r.move i{background:#EEF3FC;color:#1B4FD8;}.hp-c.lib,.hp-r.lib i{background:#F5F3FF;color:#6D28D9;}.hp-r.other i,.hp-r.goal i,.hp-r.next i,.hp-r.coach i{background:#F1F5F9;color:#334155;}'
    + '.hp-l{display:flex;flex-direction:column;gap:6px;margin-top:8px;}'
    + '.hp-r{display:flex;align-items:center;gap:9px;width:100%;background:#F5F8FD;border:0;border-radius:12px;padding:8px 10px;font:inherit;color:inherit;text-align:left;cursor:pointer;min-width:0;}'
    + '.hp-r i{flex:0 0 26px;height:26px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;font-size:14px;}'
    + '.hp-d{flex:0 0 auto;font-size:12px;font-weight:800;color:#475569;text-transform:capitalize;min-width:44px;}'
    + '.hp-x{flex:1;min-width:0;display:flex;flex-direction:column;}.hp-x b{font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.hp-x small{font-size:12px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.hp-more{background:none;border:0;color:#1B4FD8;font:inherit;font-size:12.5px;font-weight:800;padding:2px 0;text-align:left;cursor:pointer;}'
    + '.hp-g{margin:8px 0 0;font-size:12.5px;color:#065F46;background:#ECFDF5;border-radius:10px;padding:7px 10px;}'
    + '.hp-rc{display:flex;align-items:center;gap:8px;background:#F5F3FF;color:#5B21B6;border-radius:12px;padding:7px 10px;margin-bottom:10px;font-size:12.5px;font-weight:700;}.hp-rc span{flex:1;min-width:0;}.hp-rc button{border:0;background:#fff;color:#5B21B6;border-radius:9px;padding:4px 9px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;}'
    + '.hp-a{display:flex;gap:8px;margin-top:10px;}.hp-b{flex:1;border:1px solid #DCE5F3;background:#F5F8FD;color:#1B4FD8;border-radius:12px;padding:10px 6px;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;}.hp-b.pri{background:#1B4FD8;border-color:#1B4FD8;color:#fff;}';
  document.head.appendChild(s);
}


// ─── N. Ce que tout ton historique apprend au plan ────────────────────────────────────────────────────
// Le moteur est rejoué sur tout ce que tu as couru (prépas enregistrées, prépa en cours, historique Strava complet) :
//  • prédiction : pour chaque course passée, le temps que le plan aurait prévu 6 semaines avant (prTrajectory à cette date, sans rien
//    savoir de la suite) comparé au vrai temps → écart médian = recalage des temps prévus (paHistBias, lu par prTrajectory) ;
//  • progression de volume : hausses d'une semaine à l'autre encaissées ou suivies d'une douleur / d'un arrêt → la hausse que tu tiens
//    (remplace les +12 % par défaut de prVolumePlan) et ton meilleur volume tenu 4 semaines (le pic peut y monter) ;
//  • effort ressenti habituel par type de séance (paRpeRange : un 5/10 en footing n'est pas « dur » si c'est ton habitude) ;
//  • paliers des séances de qualité déjà franchis dans le passé, tenus ou non (ajoutés au réglage franc / prudent, paLadderCalib).
const PA_HIST_V = 1;
let _paHistCache = null;
const paMed = function(a){ if(!a.length) return null; const b = a.slice().sort(function(x, y){ return x - y; }), m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const paQuant = function(a, q){ if(!a.length) return null; const b = a.slice().sort(function(x, y){ return x - y; }); return b[Math.min(b.length - 1, Math.max(0, Math.round(q * (b.length - 1))))]; };
function paHist(today){
  today = today || (typeof prTodayIso === 'function' ? prTodayIso() : null);
  if(!today || typeof prAllDone !== 'function' || typeof state === 'undefined' || !state) return null;
  let done;
  try { done = prAllDone(today).filter(function(x){ return x.date && x.date <= today; }).sort(function(a, b){ return a.date.localeCompare(b.date); }); } catch(e) { return null; }
  const races = typeof prKnownRaces === 'function' ? prKnownRaces() : [];
  const key = today + '|' + done.length + '|' + (done.length ? done[done.length - 1].date + ':' + done[done.length - 1].km : '') + '|' + races.length;
  if(_paHistCache && _paHistCache.key === key) return _paHistCache.v;
  _paHistCache = { key: key, v: null };                                         // en cours de calcul : pas de recalage pendant le rejeu
  let v = null;
  try {
    v = { v: PA_HIST_V, first: done.length ? done[0].date : null, n: done.length, km: Math.round(done.reduce(function(a, x){ return a + (+x.km || 0); }, 0)),
      pred: paHistPred(done, races, today), vol: paHistVol(done, today), rpe: paHistRpe(done, today), ladder: paHistLadder(done, today) };
  } catch(e) { if(typeof diagSilent === 'function') diagSilent(e, 'plan-adapt:paHist'); v = null; }
  _paHistCache = { key: key, v: v };
  return v;
}
// rejeu des courses : niveau la veille, et temps prévu 6 semaines avant
function paHistPred(done, races, today){
  const out = [];
  races.filter(function(r){ return r && r.date && r.date < today && PR_RACE_M[r.cat] && prDays(r.date, today) <= 1095; })
    .sort(function(a, b){ return b.date.localeCompare(a.date); }).slice(0, 12).forEach(function(r){
      const sec = prTimeSec(r.time); if(!sec) return;
      const actual = vdotFromRace(PR_RACE_M[r.cat], sec), d1 = prAddDays(r.date, -1), d6 = prAddDays(r.date, -42);
      const before = done.filter(function(x){ return x.date <= d6; });
      if(before.length < 10) return;                                                  // trop peu d'entraînement connu avant
      const f1 = prFitness(state, { today: d1, races: races, done: done }), f6 = prFitness(state, { today: d6, races: races, done: done });
      let proj = null;
      if(f6 && f6.vdot){ const T = prTrajectory({ fit: f6, opt: { today: d6, raceCat: r.cat, noHist: true }, race: { date: r.date } }); proj = T && T.race ? T.race.v : null; }
      if(proj == null) return;
      out.push({ cat: r.cat, date: r.date, label: r.label || r.cat, sec: sec, actual: Math.round(actual * 10) / 10, eve: f1 && f1.vdot ? Math.round(f1.vdot * 10) / 10 : null,
        proj: Math.round(proj * 10) / 10, projSec: Math.round(raceTimeFromVdot(proj, PR_RACE_M[r.cat])), err: Math.round((actual - proj) * 10) / 10 });
    });
  const errs = out.map(function(x){ return x.err; }), n = errs.length, med = n ? paMed(errs) : 0;
  // peu de courses : on ne recale qu'une partie de l'écart (n / (n + 2)), 1,2 point au plus
  const bias = n ? Math.max(-1.2, Math.min(1.2, med * n / (n + 2))) : 0;
  return { races: out, n: n, med: Math.round(med * 10) / 10, bias: Math.round(bias * 10) / 10, mae: n ? Math.round(errs.reduce(function(a, e){ return a + Math.abs(e); }, 0) / n * 10) / 10 : null };
}
function paHistBias(today){ const H = paHist(today); return H && H.pred && H.pred.n ? H.pred.bias : 0; }
// volume semaine après semaine (lundi → dimanche) depuis la 1re séance
function paHistWeeks(done, today){
  const iso = prIso;
  const wk = {}; done.forEach(function(x){ const m = iso(prMonday(x.date)); wk[m] = (wk[m] || 0) + (+x.km || 0); });
  const cur = iso(prMonday(today)), out = [];
  if(!done.length) return out;
  for(let m = iso(prMonday(done[0].date)); m < cur; m = prAddDays(m, 7)) out.push({ m: m, km: Math.round((wk[m] || 0) * 10) / 10 });
  return out;
}
function paHistVol(done, today){
  const W = paHistWeeks(done, today); if(W.length < 6) return null;
  const pain = done.filter(function(x){ return x.perf && x.perf.pain && (+x.perf.pain.level || 0) >= 2; }).map(function(x){ return x.date; });
  const racesD = done.filter(function(x){ return x.type === 'race'; }).map(function(x){ return x.date; });
  const days = done.map(function(x){ return x.date; });
  const safe = [], bad = [];
  for(let i = 1; i < W.length; i++){
    const a = W[i - 1].km, b = W[i].km; if(a < 15 || b < a * 1.03) continue;
    const from = W[i].m, to = prAddDays(from, 20);
    if(racesD.some(function(d){ return d >= prAddDays(from, -7) && d <= to; })) continue;   // autour d'une course : rien à conclure
    const hurt = pain.some(function(d){ return d >= from && d <= to; });
    // arrêt : 10 jours ou plus sans courir qui commencent dans les 3 semaines
    const nxt = days.filter(function(d){ return d >= from; });
    let stop = false; for(let j = 1; j < nxt.length; j++){ if(nxt[j - 1] > to) break; if(prDays(nxt[j - 1], nxt[j]) >= 10){ stop = true; break; } }
    if(!stop && nxt.length && nxt[nxt.length - 1] <= to && prDays(nxt[nxt.length - 1], today) >= 10) stop = true;
    (hurt || stop ? bad : safe).push(Math.round(b / a * 100) / 100);
  }
  let prog = null;
  if(safe.length + bad.length >= 6 && safe.length >= 4){
    prog = paQuant(safe, 0.6);
    const minBad = bad.length ? Math.min.apply(null, bad) : null;
    if(minBad && minBad > 1.05) prog = Math.min(prog, minBad - 0.02);
    prog = Math.round(Math.max(1.05, Math.min(1.18, prog)) * 100) / 100;
  }
  const recent = W.filter(function(w){ return prDays(w.m, today) <= 730; });
  let best4 = 0; for(let i = 3; i < recent.length; i++){ const s = (recent[i].km + recent[i - 1].km + recent[i - 2].km + recent[i - 3].km) / 4; if(s > best4) best4 = s; }
  return { weeks: W.length, ups: safe.length + bad.length, safe: safe.length, bad: bad.length, prog: prog, worstBad: bad.length ? Math.min.apply(null, bad) : null, best4: Math.round(best4) || null };
}
// effort ressenti habituel par type (12 derniers mois, 6 séances notées au moins)
function paHistRpe(done, today){
  const out = {};
  ['ef', 'long', 'tempo', 'frac'].forEach(function(t){
    const r = done.filter(function(x){ return x.type === t && x.perf && +x.perf.rpe >= 1 && prDays(x.date, today) <= 365 && !(t === 'long' && paLongRaceKm(x.detail)); }).map(function(x){ return +x.perf.rpe; });
    if(r.length >= 6) out[t] = { med: paMed(r), n: r.length };
  });
  return out;
}
function paRpeRange(type){
  const def = PA_RPE[type]; if(!def) return def;
  const H = _paHistCache && _paHistCache.v, r = H && H.rpe && H.rpe[type];              // jamais de calcul ici : seulement ce qui est déjà appris
  if(!r) return def;
  const c = (def[0] + def[1]) / 2; if(Math.abs(r.med - c) > 2.5) return def;          // trop loin du repère : on garde le repère
  return [Math.max(1, Math.round(r.med) - 1), Math.min(10, Math.round(r.med) + 1)];
}
// paliers de qualité franchis dans le passé (même famille, même unité, à 21 jours au plus) : tenus ou non
function paHistLadder(done, today){
  const list = [], fams = {};
  const Q = done.filter(function(x){ return (x.type === 'tempo' || x.type === 'frac') && !x.ext && x.perf && prDays(x.date, today) <= 365 && !/^Test\b/i.test(x.title || ''); });
  const last = {};
  Q.forEach(function(x){
    const fam = paFam(x); if(!fam || fam === 'E' || fam === 'race') return;
    const r = paParseReps((x.title || '') + ' ' + (x.detail || '')); if(!r) return;
    const k = paLadderKey(fam, r.unit), L = PA_LADDERS[k]; if(!L) return;
    const rung = paRung(L, r), prev = last[k];
    if(prev && prDays(prev.date, x.date) <= 21 && rung > prev.rung){
      const ab = paAbsorb(x, state, { today: today }), ok = !ab || ab.verdict !== 'hard';
      list.push({ key: x.key, date: x.date, fam: fam, ok: ok });
      fams[fam] = fams[fam] || { n: 0, ok: 0 }; fams[fam].n++; if(ok) fams[fam].ok++;
    }
    last[k] = { date: x.date, rung: rung };
  });
  return { n: list.length, ok: list.filter(function(x){ return x.ok; }).length, list: list, fams: fams };
}
// recalage du plan, une fois, dès que l'historique est appris : propositions appliquées (annulable d'un geste)
const PA_HIST_FROM = '2026-11-27';
function paHistRecal(){
  try {
    if(typeof state === 'undefined' || !state || !state._plan_engine || (typeof _prepView !== 'undefined' && _prepView) || (typeof _adminPreviewUid !== 'undefined' && _adminPreviewUid)) return null;
    const today = prTodayIso(); if(today < PA_HIST_FROM || state._hist_cal_v === PA_HIST_V || !window._prPrefetchDone) return null;
    const H = paHist(today); if(!H || H.n < 10) return null;
    const a = prAnalyze(), at = new Date().toISOString();
    const sel = (a.proposals || []).filter(function(p){ return !p.held && !p.revert && p.kind !== 'test' && p.kind !== 'habit' && ['date', 'skip', 'add'].indexOf(p.field) < 0 && p.date && p.date >= today; });
    const r = sel.length ? prApplyChanges(sel, { kind: 'hist', vdot: a.fit && a.fit.vdot, at: at }) : { n: 0 };
    state._hist_cal_v = PA_HIST_V;
    state._hist_recal = { at: at, date: today, n: r.n || 0, bias: H.pred ? H.pred.bias : 0, prog: H.vol ? H.vol.prog : null };
    save();
    if(r.n && typeof showToast === 'function') showToast('Plan recalé sur tout ton historique : ' + r.n + ' séance' + (r.n > 1 ? 's' : ''), '🧬');
    return state._hist_recal;
  } catch(e) { if(typeof diagSilent === 'function') diagSilent(e, 'plan-adapt:paHistRecal'); return null; }
}
function paHistUndo(){
  const R = state._hist_recal; if(!R) return;
  const i = (state._plan_reviews || []).findIndex(function(h){ return h.at === R.at && h.kind === 'hist'; });
  if(i >= 0 && typeof prUndoReview === 'function') prUndoReview(i);
  state._hist_recal = Object.assign({}, R, { undone: true }); save();
  if(typeof showToast === 'function') showToast('Recalage annulé', '↩');
  if(typeof renderHome === 'function') try { renderHome(); } catch(e) { diagSilent(e, 'plan-adapt:paHistUndo'); }
}
