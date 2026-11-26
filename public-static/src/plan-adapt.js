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
  const rpe = parseInt(p.rpe) || null, R = s.type === 'long' && paLongRaceKm(s.detail) ? [4, 7] : PA_RPE[s.type];   // longue avec allure course : plus d'effort attendu
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
  prSessions(st).filter(function(s){ return !s.done && !s.skip && s.date && s.date >= today && prDays(today, s.date) <= 14 && (s.type === 'tempo' || s.type === 'frac'); })
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
  return { calib: calib, habits: habits, longNext: longP ? { title: longP.short, date: longP.date, up: longP.delta > 0 } : null, trend: trend, ladders: ladders, level: lvl, fit: a.fit && a.fit.vdot, planVdot: a.planVdotNow || a.planVdot, volume: V ? { base: V.base, peak: V.peak, goalPeak: V.goalPeak || null, prog: V.prog || null, weeks: V.weeks } : null,
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
  const rate = n ? ok / n : null;
  const mode = n >= 3 && rate >= 0.8 ? 'bold' : n >= 3 && rate <= 0.6 ? 'careful' : 'normal';
  return { n: n, ok: ok, rate: rate, mode: mode, fams: fams };
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
  const s = prSessions(st).filter(function(x){ return x.type === 'long' && !x.done && !x.skip && x.date && x.date >= today && prDays(today, x.date) <= 14; }).sort(function(x, y){ return x.date.localeCompare(y.date); })[0];
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
