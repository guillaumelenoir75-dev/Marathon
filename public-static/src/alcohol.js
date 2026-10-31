// alcohol.js — Alcool la veille : saisie du matin et impact PERSONNEL sur la récupération, séparé de celui de l'entraînement.
// Saisie (après « Je suis réveillé », sinon à la 1re ouverture du matin) : state._alcohol[jour du réveil] = { l: 0-10, t: ['beer'|'wine'|'spirits'], at }.
// Modèle (alcModel) : ta BASE = médiane de tes nuits sans alcool connu (non renseignées comprises, 90 j, hors lendemains de soirée et de
// très grosse charge d'entraînement — course) ; DOSE d'une nuit = alcool de la veille + moitié de celui de l'avant-veille (l'effet se
// prolonge la nuit suivante, ALC_CARRY) ; effet par point de dose = régression à l'origine des écarts à la base (récupération, VFC en %,
// FC repos, sommeil), rapprochée de la valeur générale tant qu'il y a peu de soirées (ALC_PRIOR, poids ALC_K) et bornée (ALC_BOUNDS)
// → impact du jour (alcImpact) : points de récupération dus à l'alcool, forme « hors alcool », part de la baisse due à l'alcool.
// Utilisé par : la forme du jour (ligne dédiée), l'allègement WHOOP (prWhoop : récupération corrigée de l'alcool, pas de séances allégées
// pour une nuit arrosée), les tendances FC (prStride, prDrift, allure EF : séances du lendemain d'une soirée ≥ 4/10 écartées), le Coach
// (contexte, analyse de séance, relecture / discussion du plan) et le brief du matin (state._alcohol_model, recalculé chaque jour).
const ALC_TYPES = [{ id: 'beer', t: 'Bière', ico: '🍺' }, { id: 'wine', t: 'Vin', ico: '🍷' }, { id: 'spirits', t: 'Alcool fort', ico: '🥃' }];
// valeurs générales par point de dose (échelle 0-10) : une soirée à 8/10 ≈ −36 pts de récupération, −28 % de VFC, +10 bpm de FC repos
const ALC_PRIOR = { rec: -4.5, hrv: -3.5, rhr: 1.2, sleep: -2.0 };
const ALC_PRIOR_SD = { rec: 2.0, hrv: 1.6, rhr: 0.6, sleep: 1.2 };   // incertitude de la valeur générale (par point)
const ALC_CARRY = 0.5;                                        // l'alcool de l'avant-veille compte encore à moitié (valeur de départ, ajustée sur tes nuits)
const ALC_CARRY_SD = 0.15;                                    // incertitude de cette valeur de départ
const ALC_Z80 = 1.28;                                         // fourchette à 80 %
// gabarit (Compte : state._body {kg, cm}) → grammes d'alcool, alcoolémie et temps d'élimination (Widmark, coefficient de Seidl)
const ALC_DRINKS = [0, 1, 2, 3, 3.5, 5, 6, 7.5, 9, 11, 13];   // verres standard (10 g) par niveau de l'échelle
const ALC_ELIM = 0.15;                                        // élimination g/L/h
const ALC_HEAVY_LOAD = 200;                                   // TRIMP de la veille : nuit après une très grosse séance / course, hors base et hors calcul
const ALC_BOUNDS = { rec: [-9, -0.5], hrv: [-8, -0.5], rhr: [0.2, 3.5], sleep: [-6, -0.3] };
const ALC_AFFECTS_RUN = 4;                                    // soirée ≥ 4/10 : séance du lendemain écartée des tendances FC
const ALC_LEVELS = ['Aucun', '1 verre', '2 verres', '3 verres', '3-4 verres', 'Soirée arrosée', 'Soirée bien arrosée', 'Beaucoup', 'Beaucoup trop', 'Excès', 'Gros excès'];

function alcDay(){ return typeof wellnessDay === 'function' ? wellnessDay() : prTodayIso(); }
function alcEntry(day){ const A = state._alcohol; return A && A[day || alcDay()] ? A[day || alcDay()] : null; }
function alcLevel(day){ const e = alcEntry(day); return e ? +e.l || 0 : null; }
// séance faite le lendemain d'une soirée arrosée (même jour que la saisie du matin) : FC faussée
function alcRunAffected(date){ const l = alcLevel(date); return l != null && l >= ALC_AFFECTS_RUN; }
function alcTypesText(t){ return (t || []).map(function(id){ const x = ALC_TYPES.find(function(y){ return y.id === id; }); return x ? x.t.toLowerCase() : null; }).filter(Boolean).join(', '); }

function alcSave(day, l, types){
  day = day || alcDay();
  const A = Object.assign({}, state._alcohol || {});
  A[day] = { l: Math.max(0, Math.min(10, Math.round(+l || 0))), t: (types || []).filter(function(x){ return ALC_TYPES.some(function(y){ return y.id === x; }); }), at: new Date().toISOString() };
  Object.keys(A).sort().slice(0, -400).forEach(function(k){ delete A[k]; });        // 400 nuits au plus
  state._alcohol = A;
  alcStoreModel(true);
  save();
}

// ─── Modèle personnel ───
// dose de la nuit `day` (matin) : alcool d'hier soir + ALC_CARRY × celui d'avant-hier ; null si la soirée d'hier n'est pas renseignée
function alcDose(day, carry){
  const l = alcLevel(day); if(l == null) return null;
  const p = alcLevel(prAddDays(day, -1));
  return l + (carry != null ? carry : ALC_CARRY) * (p || 0);
}
const _alcMed = function(a){ if(!a.length) return null; const b = a.slice().sort(function(x, y){ return x - y; }), m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const _alcMean = function(a){ return a.length ? a.reduce(function(s, x){ return s + x; }, 0) / a.length : null; };
function alcNights(today){
  today = today || prTodayIso();
  const wd = state.whoop_data || {}, sl = {};
  (wd.sleeps || []).forEach(function(s){ if(s && s.date && s.performance_pct != null) sl[s.date] = s.performance_pct; });
  let L = {}; try { if(typeof fmLoads === 'function') L = fmLoads(today) || {}; } catch(e) {}
  const out = [];
  (wd.recoveries || []).forEach(function(r){
    if(!r || !r.date || r.score == null || r.date > today || prDays(r.date, today) > 90) return;
    const l = alcLevel(r.date), p = alcLevel(prAddDays(r.date, -1));
    out.push({ date: r.date, l: l, prev: p, dose: alcDose(r.date), rec: +r.score, hrv: r.hrv != null ? +r.hrv : null, rhr: r.rhr != null ? +r.rhr : null,
      sleep: sl[r.date] != null ? +sl[r.date] : null, load: (L[prAddDays(r.date, -1)] || 0) + 0.5 * (L[prAddDays(r.date, -2)] || 0) });
  });
  return out.sort(function(a, b){ return a.date.localeCompare(b.date); });
}
// soirée probable non renseignée : FC repos nettement au-dessus de ta base ET VFC nettement en dessous, sans grosse charge d'entraînement la veille
function _alcSuspect(n, base){
  if(n.l != null || n.load >= ALC_HEAVY_LOAD || base.rhr == null || !base.hrv || n.rhr == null || n.hrv == null) return false;
  return n.rhr - base.rhr >= 6 && n.hrv / base.hrv - 1 <= -0.2;
}
function _alcBase(nights){
  const v = function(k){ return nights.map(function(n){ return n[k]; }).filter(function(x){ return x != null; }); };
  const recs = v('rec'), med = _alcMed(recs);
  const mad = recs.length >= 3 ? _alcMed(recs.map(function(x){ return Math.abs(x - med); })) : null;
  return { rec: med, hrv: _alcMed(v('hrv')), rhr: _alcMed(v('rhr')), sleep: _alcMed(v('sleep')), sd: mad != null ? Math.max(6, 1.4826 * mad) : 12 };
}
function alcModel(today){
  today = today || prTodayIso();
  const N = alcNights(today);
  // base : nuits sans alcool connu (0 ou non renseignée), pas au lendemain d'une soirée, pas après une très grosse charge ; 45 derniers jours en priorité
  const pick = function(excl){
    const b0 = N.filter(function(n){ return !(n.l > 0) && !(n.prev > 0) && n.load < ALC_HEAVY_LOAD && !excl[n.date]; });
    const rc = b0.filter(function(n){ return prDays(n.date, today) <= 45; });
    return rc.length >= 5 ? rc : b0;
  };
  let baseN = pick({}), base = _alcBase(baseN);
  // soirées probables non renseignées (et leur lendemain) : retirées de la base, puis base recalculée
  const ign = state._alcohol_ign || {}, susp = N.filter(function(n){ return !ign[n.date] && _alcSuspect(n, base); }), excl = {};
  Object.keys(ign).forEach(function(d){ excl[d] = 1; });
  susp.forEach(function(n){ excl[n.date] = 1; excl[prAddDays(n.date, 1)] = 1; });
  if(Object.keys(excl).length){ const b2 = pick(excl); if(b2.length >= 3){ baseN = b2; base = _alcBase(baseN); } }
  const delta = { rec: function(n){ return base.rec != null ? n.rec - base.rec : null; }, hrv: function(n){ return n.hrv != null && base.hrv ? (n.hrv / base.hrv - 1) * 100 : null; },
    rhr: function(n){ return n.rhr != null && base.rhr != null ? n.rhr - base.rhr : null; }, sleep: function(n){ return n.sleep != null && base.sleep != null ? n.sleep - base.sleep : null; } };
  const dosed = N.filter(function(n){ return n.l != null && (n.l > 0 || n.prev > 0) && n.load < ALC_HEAVY_LOAD; });
  const ok = baseN.length >= 3;
  // effet du lendemain : ajusté sur la récupération quand il y a des nuits des deux sortes (soirée la veille / seulement l'avant-veille)
  let carry = ALC_CARRY, carryFit = null;
  const cr = ok ? dosed.map(function(n){ return { l: n.l || 0, p: n.prev || 0, y: delta.rec(n) }; }).filter(function(r){ return r.y != null; }) : [];
  if(cr.filter(function(r){ return r.p > 0; }).length >= 2 && cr.filter(function(r){ return r.l > 0; }).length >= 2){
    let best = null;
    for(let c = 0.1; c <= 0.91; c += 0.05){
      const sdd = cr.reduce(function(s, r){ const d = r.l + c * r.p; return s + d * d; }, 0), sdy = cr.reduce(function(s, r){ return s + (r.l + c * r.p) * r.y; }, 0), bb = sdy / sdd;
      const sse = cr.reduce(function(s, r){ const e = r.y - bb * (r.l + c * r.p); return s + e * e; }, 0);
      const cost = sse / (base.sd * base.sd) + Math.pow((c - ALC_CARRY) / ALC_CARRY_SD, 2);   // écart aux nuits + écart à la valeur de départ
      if(!best || cost < best.cost) best = { c: Math.round(c * 100) / 100, cost: cost };
    }
    carry = best.c; carryFit = { valeur: best.c, nuits: cr.length };
  }
  const dz = function(n){ return (n.l || 0) + carry * (n.prev || 0); };
  // effet par point de dose : moyenne bayésienne de la valeur générale (ALC_PRIOR ± ALC_PRIOR_SD) et de tes nuits (régression à l'origine) ;
  // bruit des nuits = au moins la variabilité de tes nuits sans alcool (ramenée à l'échelle de chaque mesure)
  const scaleSd = { rec: 1, hrv: base.hrv && base.rec ? 100 / base.rec * 0.6 : 1, rhr: 0.25, sleep: 0.6 };
  const coef = {}, fit = {}, sd = {};
  Object.keys(delta).forEach(function(k){
    const rows = ok ? dosed.map(function(n){ return { d: dz(n), y: delta[k](n) }; }).filter(function(r){ return r.y != null && r.d > 0; }) : [];
    const sdd = rows.reduce(function(s, r){ return s + r.d * r.d; }, 0), sdy = rows.reduce(function(s, r){ return s + r.d * r.y; }, 0);
    const bh = sdd > 0 ? sdy / sdd : null, v0 = ALC_PRIOR_SD[k] * ALC_PRIOR_SD[k];
    let m = ALC_PRIOR[k], vv = v0;
    if(bh != null){
      const sse = rows.reduce(function(s, r){ const e = r.y - bh * r.d; return s + e * e; }, 0), nb = base.sd * scaleSd[k];
      const s2 = (sse + 2 * nb * nb) / (rows.length - 1 + 2);           // 2 nuits « fictives » au bruit habituel : jamais trop sûr de soi
      vv = 1 / (1 / v0 + sdd / s2); m = vv * (ALC_PRIOR[k] / v0 + bh * sdd / s2);
    }
    m = Math.max(ALC_BOUNDS[k][0], Math.min(ALC_BOUNDS[k][1], m));
    coef[k] = Math.round(m * 100) / 100; sd[k] = Math.round(Math.sqrt(vv) * 100) / 100;
    fit[k] = bh != null ? { brut: Math.round(bh * 100) / 100, nuits: rows.length } : null;
  });
  const known = N.filter(function(n){ return n.l != null; });
  const band = function(lab, f){ const a = known.filter(f); return { lab: lab, n: a.length, rec: a.length ? Math.round(_alcMean(a.map(function(n){ return n.rec; }))) : null,
    hrv: (function(){ const v = a.map(function(n){ return n.hrv; }).filter(function(x){ return x != null; }); return v.length ? Math.round(_alcMean(v)) : null; })(),
    rhr: (function(){ const v = a.map(function(n){ return n.rhr; }).filter(function(x){ return x != null; }); return v.length ? Math.round(_alcMean(v) * 10) / 10 : null; })() }; };
  // nuits avec alcool : mesuré vs attendu (base + effet) — pour vérifier que le modèle colle à tes nuits
  const check = dosed.filter(function(n){ return delta.rec(n) != null; }).map(function(n){ return { date: n.date, l: n.l, prev: n.prev || 0, dose: Math.round(dz(n) * 10) / 10, mesure: n.rec, attendu: Math.round(Math.max(0, base.rec + coef.rec * dz(n))) }; });
  return { n: known.length, nAlc: dosed.length, nFree: known.filter(function(n){ return n.l === 0; }).length, nBase: baseN.length, personal: dosed.length >= 2 && baseN.length >= 5,
    coef: coef, sd: sd, fit: fit, carry: carry, carryFit: carryFit, hrvBase: base.hrv ? Math.round(base.hrv) : null, check: check,
    suspects: susp.filter(function(n){ return prDays(n.date, today) <= 21; }).map(function(n){ return { date: n.date, rec: n.rec, rhr: n.rhr, hrv: Math.round(n.hrv), hrvPct: Math.round((n.hrv / base.hrv - 1) * 100), rhrUp: Math.round(n.rhr - base.rhr) }; }),
    base: { lab: 'Ta base (nuits sans alcool)', n: baseN.length, rec: base.rec != null ? Math.round(base.rec) : null, hrv: base.hrv ? Math.round(base.hrv) : null, rhr: base.rhr != null ? Math.round(base.rhr * 10) / 10 : null, sleep: base.sleep != null ? Math.round(base.sleep) : null, sd: Math.round(base.sd) },
    bands: [band('Sans alcool', function(n){ return n.l === 0; }), band('Léger (1-3)', function(n){ return n.l >= 1 && n.l <= 3; }), band('Modéré (4-6)', function(n){ return n.l >= 4 && n.l <= 6; }), band('Fort (7-10)', function(n){ return n.l >= 7; })] };
}
// modèle compact pour le serveur (brief du matin) : recalculé une fois par jour, et à chaque saisie
function alcStoreModel(force){
  try {
    const t = prTodayIso(), cur = state._alcohol_model;
    if(!force && cur && cur.at === t) return cur;
    const M = alcModel(t);
    state._alcohol_model = { at: t, n: M.n, nAlc: M.nAlc, personal: M.personal, rec: M.coef.rec, hrv: M.coef.hrv, rhr: M.coef.rhr, sleep: M.coef.sleep, carry: M.carry, base_rec: M.base.rec, rec_sd: M.sd.rec };
    return state._alcohol_model;
  } catch(e) { return null; }
}
// impact de l'alcool sur la nuit du jour `day` (négatif = perdu) : soirée d'hier + reste de celle d'avant-hier ; observé et « hors alcool »
function alcImpact(day, M){
  day = day || alcDay();
  const e = alcEntry(day); if(!e) return null;
  M = M || alcModel();
  const dose = alcDose(day, M.carry); if(!(dose > 0)) return null;
  const c = M.coef, prev = alcLevel(prAddDays(day, -1)) || 0;
  const wd = state.whoop_data || {}, r = (wd.recoveries || []).find(function(x){ return x && x.date === day; }) || null, s = (wd.sleeps || []).find(function(x){ return x && x.date === day; }) || null;
  const out = { day: day, l: +e.l || 0, t: e.t || [], prev: prev, dose: dose, personal: M.personal, n: M.nAlc, rec: Math.round(c.rec * dose), hrv: Math.round(c.hrv * dose), rhr: Math.round(c.rhr * dose * 10) / 10, sleep: Math.round(c.sleep * dose),
    recPrev: prev ? Math.round(c.rec * M.carry * prev) : 0, recRange: M.sd ? [Math.round(Math.min(0, (c.rec + ALC_Z80 * M.sd.rec) * dose)), Math.round((c.rec - ALC_Z80 * M.sd.rec) * dose)] : null };
  if(r && r.score != null){
    out.recObs = +r.score; out.recWithout = Math.max(0, Math.min(100, Math.round(r.score - out.rec)));
    const base = M.base && M.base.rec != null ? M.base.rec : null, gap = base != null ? base - r.score : null;
    out.base = base;
    out.share = gap != null && gap > 0 ? Math.round(Math.min(1, -out.rec / gap) * 100) : null;   // part de la baisse due à l'alcool
  }
  // nuit corrigée (pour le score « hors alcool »)
  out.rCorr = r ? Object.assign({}, r, { score: r.score != null ? Math.max(0, Math.min(100, r.score - out.rec)) : r.score, hrv: r.hrv != null ? r.hrv / Math.max(0.3, 1 + out.hrv / 100) : r.hrv, rhr: r.rhr != null ? r.rhr - out.rhr : r.rhr }) : null;
  out.sCorr = s ? Object.assign({}, s, { performance_pct: s.performance_pct != null ? Math.max(0, Math.min(100, s.performance_pct - out.sleep)) : s.performance_pct }) : null;
  return out;
}
// récupération WHOOP corrigée de l'alcool (soirée d'hier + reste d'avant-hier) pour juger la fatigue d'ENTRAÎNEMENT — prWhoop
function alcCorrectRecovery(r, M){
  if(!r || r.score == null) return r;
  M = M || alcModel(); const c = M.coef;
  const d = alcDose(r.date, M.carry); if(!(d > 0)) return r;
  return Object.assign({}, r, { score: Math.max(0, Math.min(100, r.score - c.rec * d)), hrv: r.hrv != null ? r.hrv / Math.max(0.3, 1 + c.hrv * d / 100) : r.hrv, rhr: r.rhr != null ? r.rhr - c.rhr * d : r.rhr, _alc: Math.round(d * 10) / 10 });
}

// ─── Forme du jour décomposée : mesurée, part de l'alcool, « sans alcool » (avec fourchette) ───
const _alcClamp = function(x){ return Math.max(0, Math.min(100, x)); };
function alcFormSplit(F, day, M){
  try {
    if(!F || F.score == null || typeof wellnessScore !== 'function' || typeof wellnessNight !== 'function') return null;
    day = day || alcDay(); M = M || alcModel(); const I = alcImpact(day, M); if(!I) return null;
    const n = wellnessNight(); if(!n.r || n.r.score == null) return null;
    const obs = wellnessScore(n.r, n.s, n.fc); if(obs == null) return null;
    const mk = function(f){                                   // f : part de l'effet estimé (1 = estimation centrale)
      const r = Object.assign({}, n.r, { score: _alcClamp(n.r.score - I.rec * f), hrv: n.r.hrv != null ? n.r.hrv / Math.max(0.3, 1 + I.hrv * f / 100) : null });
      const sl = n.s && n.s.performance_pct != null ? Object.assign({}, n.s, { performance_pct: _alcClamp(n.s.performance_pct - I.sleep * f) }) : n.s;
      const fc = n.fc != null ? Math.round(n.fc - I.rhr * f) : null, w = wellnessScore(r, sl, fc);
      return { r: r, s: sl, fc: fc, score: w == null ? null : Math.round(_alcClamp(F.score + w - obs)) };
    };
    const c = mk(1); if(c.score == null) return null;
    const fl = I.recRange && I.rec ? I.recRange[0] / I.rec : 0.8, fh = I.recRange && I.rec ? I.recRange[1] / I.rec : 1.2;
    const lo = mk(fl).score, hi = mk(fh).score;
    const sg = function(x){ x = Math.round(x); return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x); };
    const comps = [{ k: 'rec', lab: 'Récupération', o: n.r.score + ' %', w: Math.round(c.r.score) + ' %', d: sg(c.r.score - n.r.score) }];
    if(n.s && n.s.performance_pct != null) comps.push({ k: 'sleep', lab: 'Sommeil', o: n.s.performance_pct + ' %', w: Math.round(c.s.performance_pct) + ' %', d: sg(c.s.performance_pct - n.s.performance_pct) });
    if(n.fc != null) comps.push({ k: 'rhr', lab: 'FC repos', o: n.fc + ' bpm', w: c.fc + ' bpm', d: sg(c.fc - n.fc) });
    if(n.r.hrv != null) comps.push({ k: 'hrv', lab: 'VFC', o: Math.round(n.r.hrv) + ' ms', w: Math.round(c.r.hrv) + ' ms', d: sg(c.r.hrv - n.r.hrv) });
    return { day: day, I: I, M: M, obs: F.score, without: c.score, lost: Math.max(0, c.score - F.score), lo: Math.min(lo, hi), hi: Math.max(lo, hi), comps: comps };
  } catch(e) { return null; }
}
// libellé de la forme quand l'alcool explique la baisse : la récupération est réelle (à respecter), mais ce n'est pas de la fatigue d'entraînement
function alcFormLabel(F, S){
  if(!F || !S || S.lost < 8) return null;
  if(S.without >= 67 && F.score < 67) return 'Basse à cause de l\'alcool';
  if(S.without >= 34 && F.score < 34) return 'Très basse, surtout à cause de l\'alcool';
  return null;
}
// pastille compacte dans la carte « Forme du jour » (une ligne) : alcool de la nuit, points perdus, forme sans alcool
function alcFormChip(F, S){
  try {
    if(typeof _prepView !== 'undefined' && _prepView) return '';
    _alcCss();
    const day = alcDay(), e = alcEntry(day);
    if(!e) return state['_wakeup_' + day] ? '<button type="button" class="alc-chip ask" onclick="alcAsk()"><span>🌙</span><span class="t">Alcool hier soir ? <u>Répondre</u></span><i aria-hidden="true">›</i></button>' : '';
    const ico = function(t){ return (t || []).map(function(id){ const x = ALC_TYPES.find(function(y){ return y.id === id; }); return x ? x.ico : ''; }).join(''); };
    if(S && S.lost >= 3){
      const I = S.I, what = I.l ? I.l + '/10 hier soir ' + ico(I.t) : 'Pas d\'alcool hier soir';   // accueil : seulement la soirée d'hier
      return '<button type="button" class="alc-chip on two" onclick="openAlcoholInsights()" aria-label="Alcool : ' + S.lost + ' points de forme perdus, environ ' + S.without + ' sans alcool"><span class="ic">🍷</span><span class="t"><span class="l1"><b>−' + S.lost + '</b> pts · <b>~' + S.without + '</b> sans alcool</span><span class="l2">' + what + '</span></span><i aria-hidden="true">›</i></button>';
    }
    if(!(+e.l > 0)) return '<button type="button" class="alc-chip zero" onclick="openAlcoholInsights()"><span>💧</span><span class="t">Pas d\'alcool hier soir</span><i aria-hidden="true">›</i></button>';
    return '<button type="button" class="alc-chip on" onclick="openAlcoholInsights()"><span class="t">' + (ico(e.t) || '🍷') + ' ' + e.l + '/10 hier soir</span><i aria-hidden="true">›</i></button>';
  } catch(err) { return ''; }
}
// soirée signalée « à vérifier » que tu as écartée (autre cause : maladie, nuit courte…) : plus proposée, hors de ta base
function alcIgnore(day){
  const G = Object.assign({}, state._alcohol_ign || {}); G[day] = new Date().toISOString().slice(0, 10); state._alcohol_ign = G;
  alcStoreModel(true); save();
  if(typeof prRenderHomeCard === 'function') prRenderHomeCard();
  if(typeof showToast === 'function') showToast('Noté : autre cause, écartée du calcul', '👍');
}

// gabarit (state._body) → alcool dans le sang : verres, grammes, pic d'alcoolémie, temps d'élimination (Widmark, coefficient de Seidl)
function alcBody(){ const b = state._body; return b && +b.kg > 30 && +b.cm > 120 ? { kg: +b.kg, cm: +b.cm, sex: b.sex === 'f' ? 'f' : 'm' } : null; }
function alcBlood(l, body){
  body = body || alcBody(); l = Math.max(0, Math.min(10, Math.round(+l || 0))); if(!body || !l) return null;
  const r = body.sex === 'f' ? 0.31223 - 0.006446 * body.kg + 0.004466 * body.cm : 0.31608 - 0.004821 * body.kg + 0.004632 * body.cm;
  const drinks = ALC_DRINKS[l], g = drinks * 10, c0 = g / (body.kg * Math.max(0.45, Math.min(0.9, r)));
  const peak = Math.max(0, c0 - ALC_ELIM * 1.5);                         // bu sur ~3 h : pic à mi-soirée
  return { drinks: drinks, g: g, r: Math.round(r * 100) / 100, peak: Math.round(peak * 100) / 100, hours: Math.round(c0 / ALC_ELIM * 2) / 2 };
}
function alcSaveBody(){
  const v = function(id){ const el = document.getElementById(id); return el ? parseFloat(String(el.value).replace(',', '.')) : NaN; };
  const kg = v('alc-kg'), cm = v('alc-cm'), sx = document.getElementById('alc-sex');
  if(!(kg > 30 && kg < 250 && cm > 120 && cm < 230)){ if(typeof showToast === 'function') showToast('Taille (cm) et poids (kg) à vérifier', '⚠️'); return; }
  state._body = { kg: Math.round(kg * 10) / 10, cm: Math.round(cm), sex: sx && sx.value === 'f' ? 'f' : 'm', at: new Date().toISOString() };
  save(); if(typeof showToast === 'function') showToast('Gabarit enregistré', '✅');
  openAlcoholInsights();
}

// ─── Saisie du matin ───
let _alcSel = null;
function alcShouldAsk(){
  if(typeof _prepView !== 'undefined' && _prepView) return false;
  const day = alcDay();
  return !alcEntry(day) && !!state['_wakeup_' + day];
}
function alcAsk(opts){
  opts = opts || {};
  _alcCss();
  const day = opts.day || alcDay(), e = alcEntry(day);
  _alcSel = { day: day, l: e && e.l > 0 ? e.l : null, t: e ? (e.t || []).slice() : [], done: opts.done || null };
  const old = document.getElementById('alc-modal'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'alc-modal'; ov.style.zIndex = '9600'; ov.style.setProperty('--_overlay-bg', 'rgba(8,15,35,0.6)');
  const today = day === alcDay(), d = new Date(prAddDays(day, -1) + 'T12:00:00').toLocaleDateString('fr-FR', today ? { weekday: 'long' } : { weekday: 'long', day: 'numeric', month: 'long' });
  ov.innerHTML = '<div class="modal-box alc-box" role="dialog" aria-labelledby="alc-t"><div class="alc-head"><p class="alc-eb">' + (today ? 'Ce matin' : 'Nuit passée') + '</p><p class="alc-t" id="alc-t">🌙 ' + (today ? 'Alcool hier soir ?' : 'Alcool ce soir-là ?') + '</p>'
    + '<p class="alc-sub">' + d.charAt(0).toUpperCase() + d.slice(1) + ' soir. Pour séparer l\'effet de l\'alcool de celui de l\'entraînement sur ta récupération.</p></div>'
    + '<div class="alc-body"><button type="button" class="alc-none" onclick="alcPickNone()">🚫 Pas d\'alcool ' + (today ? 'hier soir' : 'ce soir-là') + '</button>'
    + '<p class="alc-or"><span>ou combien</span></p><div class="alc-scale" role="radiogroup" aria-label="Quantité d\'alcool de 1 à 10" id="alc-scale"></div><p class="alc-lv" id="alc-lv">1 = un verre · 10 = gros excès</p>'
    + '<p class="alc-lab">Quoi ? <span>plusieurs choix possibles</span></p><div class="alc-types" id="alc-types"></div>'
    + '<button type="button" class="alc-go" id="alc-go" onclick="alcPickSave()" disabled>Enregistrer</button>'
    + '<button type="button" class="alc-later" onclick="alcClose()">Plus tard</button></div></div>';
  document.body.appendChild(ov);
  _alcRender();
}
function _alcRender(){
  const S = _alcSel; if(!S) return;
  const sc = document.getElementById('alc-scale'), ty = document.getElementById('alc-types'), go = document.getElementById('alc-go'), lv = document.getElementById('alc-lv');
  if(sc) sc.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function(n){ return '<button type="button" role="radio" aria-checked="' + (S.l === n) + '" class="alc-n' + (S.l === n ? ' on' : '') + '" style="--h:' + Math.round(48 - n * 4.6) + '" onclick="alcPickLevel(' + n + ')">' + n + '</button>'; }).join('');
  if(ty) ty.innerHTML = ALC_TYPES.map(function(x){ const on = S.t.indexOf(x.id) >= 0; return '<button type="button" role="checkbox" aria-checked="' + on + '" class="alc-ty' + (on ? ' on' : '') + '" onclick="alcPickType(\'' + x.id + '\')"><span>' + x.ico + '</span>' + x.t + '</button>'; }).join('');
  if(lv) lv.textContent = S.l ? S.l + '/10 · ' + ALC_LEVELS[S.l] : '1 = un verre · 10 = gros excès';
  if(go){ go.disabled = !S.l; go.textContent = S.l ? 'Enregistrer ' + S.l + '/10' + (S.t.length ? ' · ' + alcTypesText(S.t) : '') : 'Enregistrer'; }
}
function alcPickLevel(n){ if(_alcSel){ _alcSel.l = _alcSel.l === n ? null : n; _alcRender(); } }
function alcPickType(id){ if(!_alcSel) return; const i = _alcSel.t.indexOf(id); if(i >= 0) _alcSel.t.splice(i, 1); else _alcSel.t.push(id); _alcRender(); }
function alcPickNone(){ if(!_alcSel) return; alcSave(_alcSel.day, 0, []); _alcFinish('Noté : pas d\'alcool hier soir', '💧'); }
function alcPickSave(){ if(!_alcSel || !_alcSel.l) return; alcSave(_alcSel.day, _alcSel.l, _alcSel.t); _alcFinish('Noté : ' + _alcSel.l + '/10' + (_alcSel.t.length ? ' (' + alcTypesText(_alcSel.t) + ')' : ''), '🍷'); }
function _alcFinish(msg, ico){
  const done = _alcSel && _alcSel.done, fs = _alcSel && _alcSel.fs; alcClose(true);
  if(typeof showToast === 'function' && !fs) showToast(msg, ico);
  try { if(typeof prRenderHomeCard === 'function') prRenderHomeCard(); } catch(e) {}
  if(typeof done === 'function') done();
}
function alcClose(saved){
  const ov = document.getElementById('alc-modal'); if(ov) ov.remove();
  const S = _alcSel; _alcSel = null;
  if(!saved){ if(S && S.day === alcDay()) window._alcSkipped = alcDay(); if(S && typeof S.done === 'function') S.done(); }
}
// à l'ouverture de l'app : réveil déclaré mais pas de réponse ce matin → on demande (une fois par ouverture)
function alcMaybeAsk(){
  try {
    if(!alcShouldAsk() || window._alcSkipped === alcDay() || document.getElementById('alc-modal') || document.querySelector('#wakeup-banner .alc-fs')) return;
    // même écran plein que « Je suis réveillé », puis l'accueil
    const banner = document.getElementById('wakeup-banner');
    if(!banner){ alcAsk(); return; }
    if(typeof _wakeupBannerHtml0 !== 'undefined' && _wakeupBannerHtml0 === null) _wakeupBannerHtml0 = banner.innerHTML;
    if(typeof wakeFlowSet === 'function') wakeFlowSet(true);
    banner.style.display = 'flex';
    alcBannerStep(banner, { day: alcDay(), done: function(){ if(typeof wakeFlowSet === 'function') wakeFlowSet(false); banner.style.display = 'none'; try { if(typeof renderHome === 'function') renderHome(); } catch(e) {} } });
  } catch(e) {}
}

// ─── Étape plein écran (même fond que « Je suis réveillé ») : au réveil, et pour les 3 dernières nuits ───
// container = #wakeup-banner (plein écran) ; o = { day, done, step: '1/3', title }
function alcBannerStep(container, o){
  o = o || {};
  _alcCss();
  const day = o.day || alcDay(), e = alcEntry(day), today = day === alcDay();
  _alcSel = { day: day, l: e && e.l > 0 ? e.l : null, t: e ? (e.t || []).slice() : [], done: o.done || null, fs: true };
  const eve = new Date(prAddDays(day, -1) + 'T12:00:00').toLocaleDateString('fr-FR', today ? { weekday: 'long' } : { weekday: 'long', day: 'numeric', month: 'long' });
  container.innerHTML = '<div class="alc-fs" role="dialog" aria-labelledby="alc-fs-t">'
    + (o.step ? '<p class="alc-fs-step">' + o.step + '</p>' : '')
    + '<div class="alc-fs-ico" aria-hidden="true">🌙</div>'
    + '<p class="alc-fs-t" id="alc-fs-t">' + (o.title || (today ? 'Alcool hier soir ?' : 'Alcool ce soir-là ?')) + '</p>'
    + '<p class="alc-fs-sub">' + eve.charAt(0).toUpperCase() + eve.slice(1) + ' soir · pour séparer l\'effet de l\'alcool de celui de l\'entraînement sur ta récupération</p>'
    + '<button type="button" class="alc-fs-none" onclick="alcPickNone()">🚫 Pas d\'alcool ' + (today ? 'hier soir' : 'ce soir-là') + '</button>'
    + '<p class="alc-or"><span>ou combien</span></p><div class="alc-scale" role="radiogroup" aria-label="Quantité d\'alcool de 1 à 10" id="alc-scale"></div><p class="alc-lv" id="alc-lv"></p>'
    + '<p class="alc-lab">Quoi ? <span>plusieurs choix possibles</span></p><div class="alc-types" id="alc-types"></div>'
    + '<button type="button" class="alc-go" id="alc-go" onclick="alcPickSave()" disabled>Enregistrer</button>'
    + '<button type="button" class="alc-later" onclick="alcClose()">' + (o.laterLabel || 'Plus tard') + '</button></div>';
  _alcRender();
}
// bouton temporaire de l'accueil : alcool des 3 dernières nuits (avant ce matin), à combiner avec leurs nuits WHOOP
const ALC_BACKFILL_UNTIL = '2026-11-15';
function alcBackfillDays(){ const d = alcDay(); return [1, 2, 3].map(function(k){ return prAddDays(d, -k); }); }
function alcBackfillMissing(){ return alcBackfillDays().filter(function(d){ return !alcEntry(d); }); }
function alcBackfill(){
  const banner = document.getElementById('wakeup-banner'); if(!banner) return;
  if(typeof _wakeupBannerHtml0 !== 'undefined' && _wakeupBannerHtml0 === null) _wakeupBannerHtml0 = banner.innerHTML;
  const days = alcBackfillDays().reverse();                       // la plus ancienne d'abord
  let i = 0;
  if(typeof wakeFlowSet === 'function') wakeFlowSet(true);
  banner.style.display = 'flex';
  const next = function(){
    if(i >= days.length){
      if(typeof wakeFlowSet === 'function') wakeFlowSet(false);
      banner.style.display = 'none';
      try { if(typeof renderHome === 'function') renderHome(); } catch(e) {}
      if(typeof showToast === 'function') showToast('Alcool des 3 dernières nuits enregistré', '🍷');
      return;
    }
    const d = days[i++];
    alcBannerStep(banner, { day: d, step: 'Nuit ' + i + ' / ' + days.length, laterLabel: i < days.length ? 'Passer cette nuit' : 'Terminer', done: next });
  };
  next();
}
// Compte › Préférences (test) : efface le réveil et les réponses de ce matin ; au prochain lancement, « Je suis réveillé » revient
async function wakeResetMorning(){
  const day = alcDay(), up = {};
  ['_wakeup_' + day, '_brief_matin_' + day, '_brief_fc_notif_' + day, '_brief_trigger', '_brief_pending'].forEach(function(k){ up[k] = null; delete state[k]; });
  if(state._alcohol && state._alcohol[day]){ const A = Object.assign({}, state._alcohol); delete A[day]; state._alcohol = A; up['_alcohol/' + day] = null; }
  try { if(typeof dbRef !== 'undefined' && dbRef) await dbRef.update(up); } catch(e) {}
  if(typeof syncBaseReset === 'function') try { syncBaseReset(JSON.parse(JSON.stringify(state))); } catch(e) {}
  try { localStorage.setItem('pm_force_wakeup', '1'); localStorage.removeItem('pm_state_' + (typeof currentUserId !== 'undefined' ? currentUserId : '')); } catch(e) {}
  window._alcSkipped = null; window._whoopLastSync = null;
  if(typeof showToast === 'function') showToast('Matinée réinitialisée : réouverture…', '🔄');
  setTimeout(function(){ try { if(typeof window._wakeReload === 'function') window._wakeReload(); else location.reload(); } catch(e) {} }, 700);   // _wakeReload : tests
}

// ─── Accueil : ligne sous la forme du jour ───
function alcHomeLine(F, chipShown){
  try {
    if(typeof _prepView !== 'undefined' && _prepView) return '';
    _alcCss();
    const day = alcDay(), e = alcEntry(day);
    const miss = prTodayIso() <= ALC_BACKFILL_UNTIL && typeof isAdmin === 'function' && isAdmin() ? alcBackfillMissing() : [];
    const back = miss.length ? '<button type="button" class="alc-home back" onclick="alcBackfill()"><span>🗓️</span><span><b>Renseigne l\'alcool des 3 dernières nuits</b><small>' + miss.length + ' nuit' + (miss.length > 1 ? 's' : '') + ' à compléter : avec leurs données WHOOP, ton profil se personnalise dès maintenant</small></span><span aria-hidden="true">›</span></button>' : '';
    let sus = '';
    if(e){ const M = alcModel(), S = (M.suspects || []).filter(function(x){ return prDays(x.date, prTodayIso()) <= 10 && x.date !== day; })[0];
      if(S) sus = '<div class="alc-sus"><span>🔎</span><span class="t"><b>' + _alcEve(S.date) + '</b> : réveil type lendemain d\'alcool (FC +' + S.rhrUp + ', VFC ' + S.hrvPct + ' %)</span><button type="button" onclick="alcAsk({day:\'' + S.date + '\'})">Alcool</button><button type="button" class="no" onclick="alcIgnore(\'' + S.date + '\')">Non</button></div>'; }
    return back + (chipShown ? '' : _alcHomeMain(F, day, e)) + sus;
  } catch(err) { return ''; }
}
function _alcHomeMain(F, day, e){
  try {
    if(!e) return state['_wakeup_' + day] ? '<button type="button" class="alc-home ask" onclick="alcAsk()"><span>🌙</span><span><b>Alcool hier soir ?</b><small>Réponds pour séparer son effet de celui de l\'entraînement</small></span><span aria-hidden="true">›</span></button>' : '';
    if(!(+e.l > 0)){
      const C = alcImpact(day), S0 = F ? alcFormSplit(F, day) : null;
      if(S0 && S0.lost >= 3) return _alcSplitCard(S0, true);
      if(C) return '<button type="button" class="alc-home zero" onclick="openAlcoholInsights()"><span>💧</span><span><b>Pas d\'alcool hier soir</b><small>Reste de la soirée d\'avant-hier (' + C.prev + '/10) : ≈ ' + C.rec + ' pts de récupération' + (C.recWithout != null ? ' · sans, ~' + C.recWithout + ' %' : '') + '</small></span><span aria-hidden="true">›</span></button>';
      return '<button type="button" class="alc-home zero" onclick="alcAsk()"><span>💧</span><span><b>Pas d\'alcool hier soir</b><small>Ta récupération reflète ton entraînement et ta nuit · modifier</small></span></button>';
    }
    const M = alcModel(), I = alcImpact(day, M); if(!I) return '';
    const SP = F ? alcFormSplit(F, day, M) : null; if(SP) return _alcSplitCard(SP, false);
    const parts = ['récup ' + I.rec + ' pts'];
    if(I.hrv) parts.push('VFC ' + I.hrv + ' %'); if(I.rhr) parts.push('FC repos +' + String(I.rhr).replace('.', ','));
    let without = '';
    if(F && I.rCorr && typeof wellnessScore === 'function'){
      const n = typeof wellnessNight === 'function' ? wellnessNight() : null;
      const obs = wellnessScore(n ? n.r : null, n ? n.s : null, n ? n.fc : null), corr = wellnessScore(I.rCorr, I.sCorr || (n ? n.s : null), n && n.fc != null ? Math.round(n.fc - I.rhr) : null);
      if(obs != null && corr != null) without = ' · hors alcool, ta forme serait ~' + Math.max(0, Math.min(100, Math.round(F.score + corr - obs)));
    }
    return '<button type="button" class="alc-home on" onclick="openAlcoholInsights()"><span>🍷</span><span><b>Alcool hier soir : ' + I.l + '/10' + (I.t.length ? ' (' + prEsc(alcTypesText(I.t)) + ')' : '') + (I.prev ? ' · ' + I.prev + '/10 avant-hier' : '') + '</b>'
      + '<small>Effet estimé sur ta nuit : ' + parts.join(' · ') + without + (I.share != null ? ' — ' + I.share + ' % de la baisse vient de l\'alcool, pas de l\'entraînement' : '') + '</small></span><span aria-hidden="true">›</span></button>';
  } catch(err) { return ''; }
}

// une saisie est rangée au jour du RÉVEIL (nuit WHOOP du même jour) ; on l'affiche à la date de la SOIRÉE (la veille)
function _alcEve(d, bare){ return new Date(prAddDays(d, -1) + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '') + (bare ? '' : ' soir'); }
function _alcDayTxt(d){ const t = new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }).replace(/\./g, ''); return t.charAt(0).toUpperCase() + t.slice(1); }
// carte de l'accueil : forme mesurée | perdue à cause de l'alcool | sans alcool
function _alcSplitCard(S, carryOnly){
  const I = S.I, o = S.obs, w = Math.max(o, S.without), tone = o >= 67 ? 'ok' : o >= 34 ? 'mid' : 'low';
  const what = carryOnly ? 'Pas d\'alcool hier soir · reste de la soirée d\'avant-hier (' + I.prev + '/10)' : 'Alcool hier soir : ' + I.l + '/10' + (I.t.length ? ' (' + prEsc(alcTypesText(I.t)) + ')' : '') + (I.prev ? ' · ' + I.prev + '/10 avant-hier' : '');
  return '<button type="button" class="alc-split" onclick="openAlcoholInsights()" aria-label="Forme du jour ' + o + ', dont ' + S.lost + ' points perdus à cause de l\'alcool, ' + S.without + ' sans alcool">'
    + '<span class="alc-sp-h"><span>🍷 ' + what + '</span><span aria-hidden="true">›</span></span>'
    + '<span class="alc-sp-n"><span><small>Forme mesurée</small><b class="' + tone + '">' + o + '</b></span><span class="alc-sp-m"><small>Alcool</small><b>−' + S.lost + '</b></span><span><small>Sans alcool</small><b>~' + S.without + '</b><em>' + (S.hi - S.lo >= 2 ? S.lo + '-' + S.hi : '') + '</em></span></span>'
    + '<span class="alc-sp-bar" aria-hidden="true"><i class="' + tone + '" style="width:' + o + '%"></i><i class="alc" style="width:' + (w - o) + '%"></i></span>'
    + '<span class="alc-sp-d">' + S.comps.map(function(c){ return c.lab + ' ' + c.o + ' → ' + c.w; }).join(' · ') + '</span>'
    + (I.share != null ? '<span class="alc-sp-f">' + (I.share >= 80 ? 'La baisse vient presque entièrement de l\'alcool' : I.share >= 50 ? 'La baisse vient surtout de l\'alcool' : 'L\'alcool explique ' + I.share + ' % de la baisse, le reste vient de l\'entraînement ou de la nuit') + ' : ton plan n\'est pas allégé pour ça.</span>' : '')
    + '</button>';
}

// ─── Statistiques › Forme : alcool et récupération ───
const _alcN = function(x, d){ const k = Math.pow(10, d == null ? 1 : d); return String(Math.round(x * k) / k).replace('.', ','); };
const _alcIco = function(t){ return (t || []).map(function(id){ const x = ALC_TYPES.find(function(y){ return y.id === id; }); return x ? x.ico : ''; }).join(''); };
// profil : effet par point d'alcool (tuiles) + base sans alcool + 30 derniers jours — partagé par Statistiques et le détail
function _alcProfileHtml(M){
  const t = function(v, u){ return '<div><b>' + v + '</b><small>' + u + '</small></div>'; };
  const last30 = Object.keys(state._alcohol || {}).filter(function(d){ const k = prDays(d, prTodayIso()); return k <= 30 && k >= 0; }), drinks = last30.filter(function(d){ return state._alcohol[d].l > 0; });
  const lost = last30.reduce(function(s, d){ return s + Math.max(0, -M.coef.rec * (alcDose(d, M.carry) || 0)); }, 0);
  return '<p class="alc-k">Par point d\'alcool (/10)</p><div class="alc-tiles">' + t('−' + _alcN(-M.coef.rec), 'pts récup') + t('−' + _alcN(-M.coef.hrv), '% VFC') + t('+' + _alcN(M.coef.rhr), 'bpm FC') + t(Math.round(M.carry * 100) + ' %', 'le lendemain') + '</div>'
    + (M.base.rec != null ? '<p class="alc-k">Sans alcool (ta base)</p><div class="alc-tiles b">' + t(M.base.rec + ' %', 'récup') + (M.base.hrv ? t(M.base.hrv, 'ms VFC') : '') + (M.base.rhr != null ? t(_alcN(M.base.rhr), 'bpm FC') : '') + '</div>' : '')
    + (last30.length ? '<p class="alc-meta">30 j : <b>' + drinks.length + '</b> soirée' + (drinks.length > 1 ? 's' : '') + ' · <b>−' + Math.round(lost) + '</b> pts récup</p>' : '');
}
function alcStatsHtml(){
  const M = alcModel(); if(!M.n && !Object.keys(state._alcohol || {}).length) return '';
  _alcCss();
  // Statistiques › Forme : une ligne (le détail s'ouvre au toucher)
  const n30 = Object.keys(state._alcohol || {}).filter(function(d){ const k = prDays(d, prTodayIso()); return k >= 0 && k <= 30 && state._alcohol[d].l > 0; }).length;
  return '<button type="button" class="alc-line" onclick="openAlcoholInsights()"><span class="ic">🍷</span><span class="t"><b>Alcool et récupération</b><small>−' + _alcN(-M.coef.rec) + ' pts récup par point' + (M.base.rec != null ? ' · base ' + M.base.rec + ' %' : '') + ' · 30 j : ' + n30 + ' soirée' + (n30 > 1 ? 's' : '') + '</small></span><i aria-hidden="true">›</i></button>';
}
function openAlcoholInsights(){
  _alcCss();
  const M = alcModel(), I = alcImpact(alcDay(), M), A = state._alcohol || {};
  // 7 dernières soirées toujours listées (même non renseignées), puis les plus anciennes saisies
  const last7 = []; for(let k = 0; k < 7; k++) last7.push(prAddDays(alcDay(), -k));
  const days = last7.concat(Object.keys(A).filter(function(d){ return last7.indexOf(d) < 0; }).sort().reverse()).slice(0, 24);
  const old = document.getElementById('alc-ins'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'alc-ins'; ov.style.zIndex = '510'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  const rec = {}; ((state.whoop_data || {}).recoveries || []).forEach(function(r){ if(r && r.date) rec[r.date] = r; });
  const chk = {}; (M.check || []).forEach(function(c){ chk[c.date] = c; });
  const close = 'document.getElementById(\'alc-ins\').remove();';
  let h = '<div class="modal-box" style="max-height:90vh;"><div class="alc-ihead"><div><p class="alc-t">🍷 Alcool et récupération</p><p class="alc-sub">' + (M.personal ? 'Modèle perso · ' + M.nAlc + ' soirée' + (M.nAlc > 1 ? 's' : '') : 'Estimation générale') + '</p></div>'
    + '<button class="alc-x" onclick="' + close + '" aria-label="Fermer">×</button></div><div class="modal-scroll-body" style="background:#F5F3FA;"><div class="alc-ibody">';
  // ce matin : 3 chiffres + mesuré → sans alcool
  if(I){
    const F = typeof prFormScore === 'function' ? prFormScore() : null, SP = F ? alcFormSplit(F, alcDay(), M) : null, BL = alcBlood(I.l);
    h += '<div class="alc-today"><p class="alc-k">Ce matin · ' + (I.l ? I.l + '/10 hier' : '0 hier') + (I.prev ? ' · ' + I.prev + '/10 avant-hier' : '') + '</p>';
    if(SP) h += '<div class="alc-big"><div><small>Forme</small><b>' + SP.obs + '</b></div><div class="m"><small>Alcool</small><b>−' + SP.lost + '</b></div><div><small>Sans alcool</small><b>~' + SP.without + '</b>' + (SP.hi - SP.lo >= 2 ? '<em>' + SP.lo + '-' + SP.hi + '</em>' : '') + '</div></div>'
      + '<div class="alc-sp-bar alc-bigbar" aria-hidden="true"><i class="' + (SP.obs >= 67 ? 'ok' : SP.obs >= 34 ? 'mid' : 'low') + '" style="width:' + SP.obs + '%"></i><i class="alc" style="width:' + Math.max(0, SP.without - SP.obs) + '%"></i></div>'
      + '<table class="alc-tab"><thead><tr><th></th><th>Mesuré</th><th>Sans alcool</th><th>Écart</th></tr></thead><tbody>' + SP.comps.map(function(c){ return '<tr><td>' + c.lab + '</td><td>' + c.o + '</td><td>' + c.w + '</td><td>' + c.d + '</td></tr>'; }).join('') + '</tbody></table>';
    else h += '<div class="alc-big"><div class="m"><small>Récup</small><b>' + I.rec + '</b></div><div><small>VFC</small><b>' + I.hrv + ' %</b></div><div><small>FC</small><b>+' + _alcN(I.rhr) + '</b></div></div>';
    const meta = [];
    if(BL) meta.push('🥃 ≈ ' + _alcN(BL.drinks) + ' verres', '⏱ éliminé en ' + _alcN(BL.hours) + ' h');
    if(I.prev && I.l) meta.push('−' + Math.abs(I.recPrev) + ' pts d\'avant-hier');
    meta.push('✓ plan non allégé');
    h += '<div class="alc-pills">' + meta.map(function(x){ return '<span>' + x + '</span>'; }).join('') + '</div></div>';
  }
  // soirées à vérifier
  if(M.suspects && M.suspects.length) h += '<p class="alc-sec">À vérifier <span>réveil type lendemain d\'alcool</span></p><div class="alc-list">' + M.suspects.map(function(x){ return '<button type="button" class="alc-row sus" onclick="' + close + 'alcAsk({day:\'' + x.date + '\'})"><span>' + _alcEve(x.date, true) + '</span><b class="q">Alcool ?</b><small>FC +' + x.rhrUp + ' · VFC ' + x.hrvPct + ' %</small><em>' + x.rec + ' %</em></button>'; }).join('') + '</div>';
  // profil
  h += '<p class="alc-sec">Ton profil</p><div class="alc-card">' + _alcProfileHtml(M);
  const bb = M.bands.filter(function(x){ return x.n && x.lab !== 'Sans alcool'; }), mx = Math.max.apply(null, [M.base.rec || 0].concat(bb.map(function(x){ return x.rec || 0; })).concat([1]));
  if(bb.length && M.base.rec != null) h += '<div class="alc-bars">' + [{ lab: 'Sans alcool', n: M.base.n, rec: M.base.rec }].concat(bb).map(function(x){ return '<div class="alc-bar"><small>' + x.lab.replace(/ \(.*\)/, '') + '</small><i style="width:' + Math.round((x.rec || 0) / mx * 100) + '%"></i><b>' + x.rec + ' %</b></div>'; }).join('') + '</div>';
  h += '</div>';
  // 14 derniers réveils : récupération, soirées avec alcool en violet, base en pointillé
  const days14 = []; for(let k = 13; k >= 0; k--) days14.push(prAddDays(alcDay(), -k));
  if(days14.some(function(d){ return rec[d] && rec[d].score != null; })){
    const W = 320, H = 96, bw = W / 14, y = function(v){ return H - 14 - (v / 100) * (H - 22); };
    let g = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="alc-chart" role="img" aria-label="Récupération des 14 derniers réveils">';
    days14.forEach(function(d, i){
      const r = rec[d], e = A[d], ds = alcDose(d, M.carry) || 0, v = r && r.score != null ? +r.score : null;
      if(v != null) g += '<rect x="' + (i * bw + 3).toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + (bw - 6).toFixed(1) + '" height="' + (H - 14 - y(v)).toFixed(1) + '" rx="3" class="' + (ds > 0 ? (e && e.l > 0 ? 'a' : 'c') : (M.suspects || []).some(function(x){ return x.date === d; }) ? 's' : 'n') + '"/>';
      g += '<text x="' + (i * bw + bw / 2).toFixed(1) + '" y="' + (H - 2) + '" text-anchor="middle">' + new Date(prAddDays(d, -1) + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'narrow' }) + '</text>';
    });
    if(M.base.rec != null) g += '<line x1="0" x2="' + W + '" y1="' + y(M.base.rec).toFixed(1) + '" y2="' + y(M.base.rec).toFixed(1) + '" class="b"/>';
    h += '<p class="alc-sec">Récup après chaque soirée <span>14 j</span></p><div class="alc-card">' + g + '</svg><div class="alc-leg"><span><i class="a"></i>alcool la veille</span><span><i class="c"></i>avant-hier</span><span><i class="n"></i>sans</span><span><i class="b"></i>ta base</span></div></div>';
  }
  // soirées : alcool, récup mesurée au réveil, récup prévue par le modèle
  h += '<p class="alc-sec">Tes soirées</p><div class="alc-list"><div class="alc-row ev hd"><span>Soirée</span><b>Alcool</b><small>Récup</small><em>Prévu</em></div>' + days.map(function(d){
    const e = A[d], r = rec[d], c = chk[d];
    return '<button type="button" class="alc-row ev" onclick="' + close + 'alcAsk({day:\'' + d + '\'})"><span>' + _alcEve(d, true) + '</span><b class="' + (!e ? 'q' : e.l > 0 ? 'y' : 'n') + '">' + (!e ? 'À remplir' : e.l > 0 ? e.l + '/10 ' + _alcIco(e.t) : 'Aucun') + '</b><small class="' + (r && r.score != null ? (r.score >= 67 ? 'g' : r.score >= 34 ? 'o' : 'r') : '') + '">' + (r && r.score != null ? r.score + ' %' : '—') + '</small><em>' + (c ? c.attendu + ' %' : '') + '</em></button>';
  }).join('') + '</div><p class="alc-note">Récup = au réveil le lendemain · toucher pour corriger</p>';
  // gabarit (replié) + copie des données
  const BD = alcBody();
  h += '<details class="alc-gab"><summary>Gabarit : ' + (BD ? BD.cm + ' cm · ' + _alcN(BD.kg) + ' kg' : 'à renseigner') + '</summary><div class="alc-body-f"><label>Taille <input id="alc-cm" type="number" inputmode="numeric" min="120" max="230" placeholder="cm" value="' + (BD ? BD.cm : '') + '"></label><label>Poids <input id="alc-kg" type="number" inputmode="decimal" step="0.1" min="30" max="250" placeholder="kg" value="' + (BD ? BD.kg : '') + '"></label>'
    + '<label>Sexe <select id="alc-sex"><option value="m"' + (!BD || BD.sex === 'm' ? ' selected' : '') + '>Homme</option><option value="f"' + (BD && BD.sex === 'f' ? ' selected' : '') + '>Femme</option></select></label><button type="button" onclick="alcSaveBody()">OK</button></div></details>'
    + '<button type="button" class="alc-copy" onclick="alcCopyDiag(this)">📋 Copier les données</button></div></div></div>';
  ov.innerHTML = h;
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

// ─── Diagnostic à copier (vérifier les saisies et ce que le modèle en a tiré) ───
function alcDiagText(today){
  today = today || prTodayIso();
  const A = state._alcohol || {}, wd = state.whoop_data || {}, M = alcModel(today), I = alcImpact(alcDay(), M);
  let L = {}; try { if(typeof fmLoads === 'function') L = fmLoads(today) || {}; } catch(e) {}
  const days = []; for(let k = 0; k < 14; k++) days.push(prAddDays(alcDay(), -k));
  const rec = {}, sl = {}; (wd.recoveries || []).forEach(function(r){ if(r && r.date) rec[r.date] = r; }); (wd.sleeps || []).forEach(function(s){ if(s && s.date) sl[s.date] = s; });
  const nights = days.map(function(d){ const e = A[d], r = rec[d], s = sl[d];
    return { matin: d, soiree: prAddDays(d, -1), alcool: e ? e.l : null, types: e ? (e.t || []) : null, saisi_le: e ? e.at : null, recup: r ? r.score : null, vfc: r ? r.hrv : null, fc_repos: r ? r.rhr : null, sommeil_pct: s ? s.performance_pct : null, sommeil: s ? s.duration_hours : null,
      charge_veille_trimp: Math.round(L[prAddDays(d, -1)] || 0), dose: alcDose(d, M.carry), recup_corrigee: r && (alcDose(d) || 0) > 0 ? Math.round(alcCorrectRecovery(r, M).score) : null }; });
  return JSON.stringify({ genere: new Date().toISOString(), jour_reveil: alcDay(), saisies_total: Object.keys(A).length, nuits_14j: nights,
    modele: { personnel: M.personal, nuits: M.n, soirees: M.nAlc, sans_alcool: M.nFree, par_point_de_dose: M.coef, incertitude: M.sd, ajustement_brut: M.fit, effet_lendemain: M.carry, effet_lendemain_ajuste: M.carryFit, base: M.base, nuits_suspectes: M.suspects, controle: M.check, groupes: M.bands, gabarit: alcBody() },
    modele_stocke_pour_serveur: state._alcohol_model || null, ce_matin: I ? { niveau: I.l, avant_hier: I.prev, dose: I.dose, base_recup: I.base, effet_recup: I.rec, fourchette_recup: I.recRange, effet_vfc_pct: I.hrv, effet_fc: I.rhr, effet_sommeil: I.sleep, recup_mesuree: I.recObs, recup_sans_alcool: I.recWithout, part_alcool_pct: I.share } : null,
    forme_du_jour: (function(){ try { const F = typeof prFormScore === 'function' ? prFormScore() : null, S = F ? alcFormSplit(F, alcDay(), M) : null; return S ? { mesuree: S.obs, sans_alcool: S.without, perdue: S.lost, fourchette: [S.lo, S.hi], detail: S.comps } : (F ? { mesuree: F.score } : null); } catch(e) { return null; } })(),
    whoop_fatigue: typeof prWhoop === 'function' ? (function(){ try { return prWhoop(today); } catch(e) { return null; } })() : null }, null, 1);
}
async function alcCopyDiag(btn){
  const t = alcDiagText();
  let ok = false;
  try { if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(t); ok = true; } } catch(e) {}
  if(!ok){ try { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch(e) {} }
  if(btn) btn.textContent = ok ? '✅ Copié — colle-le dans la conversation' : 'Copie impossible';
  if(typeof showToast === 'function') showToast(ok ? 'Données copiées' : 'Copie impossible', ok ? '📋' : '⚠️');
  return ok;
}

// ─── Pour le Coach (chat, analyse de séance, relecture / discussion du plan) ───
function alcCoachContext(today){
  try {
    today = today || prTodayIso();
    const A = state._alcohol || {}, M = alcModel(today), I = alcImpact(alcDay(), M);
    const recent = Object.keys(A).filter(function(d){ const k = prDays(d, today); return k >= 0 && k <= 14; }).sort().map(function(d){ return { matin: d, niveau_0_10: A[d].l, types: alcTypesText(A[d].t) || null }; });
    if(!recent.length && !M.n) return null;
    return { regle: 'Une récupération WHOOP basse, une VFC basse ou une FC repos haute le lendemain d\'un soir d\'alcool viennent en partie de l\'alcool, PAS de l\'entraînement : ne les attribue pas à une séance trop rapide ou trop chargée, ne propose pas d\'alléger le plan pour ça.',
      cette_nuit: I ? { niveau_0_10: I.l, avant_hier_0_10: I.prev || 0, dose_effective: I.dose, base_recup: I.base != null ? I.base : null, types: alcTypesText(I.t) || null, effet_recup_pts: I.rec, effet_vfc_pct: I.hrv, effet_fc_repos_bpm: I.rhr, recup_mesuree: I.recObs != null ? I.recObs : null, recup_sans_alcool_estimee: I.recWithout != null ? I.recWithout : null, part_de_la_baisse_due_a_l_alcool_pct: I.share, fourchette_effet_recup: I.recRange } : (alcEntry(alcDay()) ? 'pas d\'alcool' : 'non renseigné'),
      quatorze_derniers_jours: recent,
      modele: { personnel: M.personal, nuits_avec_alcool: M.nAlc, base: M.base, effet_lendemain: 'l\'alcool de l\'avant-veille compte encore à ' + Math.round(M.carry * 100) + ' %', par_point_alcool: { recup_pts: M.coef.rec, vfc_pct: M.coef.hrv, fc_repos_bpm: M.coef.rhr, sommeil_pts: M.coef.sleep } } };
  } catch(e) { return null; }
}

function _alcCss(){
  if(typeof document === 'undefined' || document.getElementById('alc-css')) return;
  const st = document.createElement('style'); st.id = 'alc-css';
  st.textContent = '.alc-box{max-height:94vh;}.alc-head{flex-shrink:0;padding:20px 18px 14px;border-radius:24px 24px 0 0;color:#fff;background:linear-gradient(160deg,#1E1B4B,#4C1D95);}'
    + '.alc-eb{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.7;margin:0;}.alc-t{font-size:22px;font-weight:900;margin:3px 0 4px;}.alc-sub{font-size:12.5px;opacity:.85;margin:0;line-height:1.45;}'
    + '.alc-body{padding:16px 18px 22px;display:flex;flex-direction:column;gap:12px;background:#fff;overflow-y:auto;}'
    + '.alc-none{width:100%;padding:20px 16px;border:none;border-radius:18px;background:linear-gradient(135deg,#059669,#10B981);color:#fff;font:inherit;font-size:18px;font-weight:900;cursor:pointer;box-shadow:0 10px 22px -12px rgba(5,150,105,.8);}'
    + '.alc-or{display:flex;align-items:center;gap:10px;margin:2px 0;color:#94A3B8;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;}.alc-or::before,.alc-or::after{content:"";flex:1;height:1px;background:#E2E8F0;}'
    + '.alc-scale{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;}.alc-n{padding:12px 0;border:1.5px solid hsl(var(--h),85%,80%);border-radius:12px;background:hsl(var(--h),95%,96%);color:hsl(var(--h),70%,30%);font:inherit;font-size:17px;font-weight:900;cursor:pointer;font-variant-numeric:tabular-nums;}'
    + '.alc-n.on{background:hsl(var(--h),80%,48%);border-color:hsl(var(--h),80%,40%);color:#fff;transform:scale(1.05);}'
    + '.alc-lv{margin:0;text-align:center;font-size:13px;font-weight:700;color:#475569;}.alc-lab{margin:4px 0 -4px;font-size:12px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:.06em;}.alc-lab span{font-weight:600;text-transform:none;letter-spacing:0;color:#94A3B8;}'
    + '.alc-types{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}.alc-ty{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 4px;border:1.5px solid #E2E8F0;border-radius:14px;background:#F8FAFC;font:inherit;font-size:13px;font-weight:800;color:#334155;cursor:pointer;}.alc-ty span{font-size:22px;}'
    + '.alc-ty.on{border-color:#7C3AED;background:#F5F3FF;color:#5B21B6;}'
    + '.alc-go{padding:15px;border:none;border-radius:14px;background:#4C1D95;color:#fff;font:inherit;font-size:15px;font-weight:900;cursor:pointer;}.alc-go:disabled{opacity:.35;cursor:default;}'
    + '.alc-later{border:none;background:none;color:#64748B;font:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:4px;}'
    + '.alc-none:focus-visible,.alc-n:focus-visible,.alc-ty:focus-visible,.alc-go:focus-visible,.alc-home:focus-visible,.alc-row:focus-visible{outline:2px solid #7C3AED;outline-offset:2px;}'
    + '.alc-home{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:1.5px solid #DDD6FE;border-radius:14px;background:#F5F3FF;font:inherit;text-align:left;cursor:pointer;color:#2E1065;}'
    + '.alc-home>span:first-child{font-size:20px;}.alc-home>span:nth-child(2){flex:1;display:flex;flex-direction:column;min-width:0;}.alc-home b{font-size:13px;}.alc-home small{font-size:11.5px;color:#5B21B6;line-height:1.35;}.alc-home>span:last-child{color:#7C3AED;font-size:18px;}'
    + '.alc-home.zero{border-color:#BBF7D0;background:#F0FDF4;color:#14532D;}.alc-home.zero small{color:#15803D;}.alc-home.ask{border-style:dashed;}'
    + '.alc-card{background:#fff;border-radius:18px;padding:14px;margin-bottom:14px;border:1px solid #E2E8F0;box-shadow:0 1px 3px rgba(15,23,42,.06);display:flex;flex-direction:column;gap:9px;}'
    + '.alc-card-t{margin:0;font-size:15px;font-weight:800;color:#0F172A;display:flex;flex-direction:column;gap:2px;}.alc-card-t span{font-size:11.5px;font-weight:600;color:#64748B;}'
    + '.alc-card-s{margin:0;font-size:13px;color:#334155;line-height:1.5;}.alc-card-n{margin:0;font-size:11.5px;color:#64748B;line-height:1.45;}'
    + '.alc-bars{display:flex;flex-direction:column;gap:7px;}.alc-bar{display:grid;grid-template-columns:96px 1fr 44px;grid-template-rows:auto auto;align-items:center;column-gap:8px;}'
    + '.alc-bar small{font-size:11.5px;font-weight:700;color:#475569;}.alc-bar i{height:10px;border-radius:6px;background:linear-gradient(90deg,#A78BFA,#7C3AED);}.alc-bar b{font-size:13px;font-weight:900;text-align:right;font-variant-numeric:tabular-nums;}.alc-bar span{grid-column:2/4;font-size:10.5px;color:#94A3B8;}'
    + '.alc-card-b{align-self:flex-start;border:none;background:none;color:#6D28D9;font:inherit;font-size:13px;font-weight:800;cursor:pointer;padding:0;}'
    + '.alc-ihead{flex-shrink:0;padding:16px;border-radius:24px 24px 0 0;color:#fff;background:linear-gradient(160deg,#1E1B4B,#4C1D95);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}'
    + '.alc-x{background:rgba(255,255,255,.2);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;flex-shrink:0;}.alc-ibody{padding:14px 16px 24px;display:flex;flex-direction:column;gap:10px;}'
    + '.alc-today{background:#fff;border:1.5px solid #DDD6FE;border-radius:16px;padding:12px 14px;}.alc-today b{color:#4C1D95;}.alc-today p{margin:4px 0 0;font-size:13px;color:#334155;line-height:1.5;}'
    + '.alc-sec{margin:6px 2px -2px;font-size:11px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:.07em;}.alc-list{display:flex;flex-direction:column;background:#fff;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;}'
    + '.alc-fs{width:100%;max-width:380px;display:flex;flex-direction:column;gap:12px;color:#fff;max-height:100%;overflow-y:auto;padding:6px 2px;}'
    + '.alc-fs-step{align-self:center;margin:0;font-size:11.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;background:rgba(255,255,255,.16);border-radius:20px;padding:4px 12px;}'
    + '.alc-fs-ico{font-size:52px;line-height:1;text-align:center;}.alc-fs-t{margin:0;text-align:center;font-size:26px;font-weight:900;letter-spacing:-.4px;}.alc-fs-sub{margin:-4px 0 4px;text-align:center;font-size:13.5px;color:rgba(255,255,255,.82);line-height:1.45;}'
    + '.alc-fs-none{width:100%;padding:20px 16px;border:none;border-radius:18px;background:#fff;color:#047857;font:inherit;font-size:18px;font-weight:900;cursor:pointer;box-shadow:0 12px 26px -14px rgba(0,0,0,.6);}'
    + '.alc-fs .alc-or{color:rgba(255,255,255,.65);}.alc-fs .alc-or::before,.alc-fs .alc-or::after{background:rgba(255,255,255,.25);}'
    + '.alc-fs .alc-n{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.28);color:#fff;}.alc-fs .alc-n.on{background:hsl(var(--h),85%,55%);border-color:#fff;color:#fff;}'
    + '.alc-fs .alc-lv{color:rgba(255,255,255,.85);min-height:18px;}.alc-fs .alc-lab{color:rgba(255,255,255,.9);}.alc-fs .alc-lab span{color:rgba(255,255,255,.6);}'
    + '.alc-fs .alc-ty{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.28);color:#fff;}.alc-fs .alc-ty.on{background:#fff;border-color:#fff;color:#4C1D95;}'
    + '.alc-fs .alc-go{background:#fff;color:#1E3A8A;}.alc-fs .alc-go:disabled{opacity:.35;}.alc-fs .alc-later{color:rgba(255,255,255,.75);}'
    + '.alc-fs-none:focus-visible,.alc-fs .alc-n:focus-visible,.alc-fs .alc-ty:focus-visible,.alc-fs .alc-go:focus-visible,.alc-fs .alc-later:focus-visible{outline:2px solid #fff;outline-offset:2px;}'
    + '.alc-chip{display:flex;align-items:center;gap:6px;width:100%;margin-top:7px;padding:6px 9px;border:1px solid #DDD6FE;border-radius:10px;background:#F5F3FF;font:inherit;font-size:12px;line-height:1.3;color:#4C1D95;text-align:left;cursor:pointer;}'
    + '.alc-chip .t{flex:1;min-width:0;font-weight:700;}.alc-chip .t small{display:inline;margin:0;font-weight:600;color:#7C3AED;font-size:11px;}.alc-chip .n{white-space:nowrap;font-variant-numeric:tabular-nums;color:#5B21B6;}.alc-chip .n b{display:inline;font-size:13px;color:#6D28D9;font-weight:900;}.alc-chip i{font-style:normal;color:#7C3AED;font-size:15px;line-height:1;}'
    + '.alc-chip.zero{border-color:#BBF7D0;background:#F0FDF4;color:#166534;}.alc-chip.zero i{color:#16A34A;}.alc-chip.ask{border-style:dashed;}.alc-chip.ask u{text-decoration:none;color:#6D28D9;}.alc-chip:focus-visible{outline:2px solid #7C3AED;outline-offset:2px;}'
    + '.alc-sus{display:flex;align-items:center;gap:7px;padding:6px 8px 6px 10px;border:1px dashed #C7D2FE;border-radius:12px;background:#F8FAFF;font-size:11.5px;color:#3730A3;line-height:1.3;}.alc-sus .t{flex:1;min-width:0;}'
    + '.alc-sus button{flex-shrink:0;padding:5px 9px;border:none;border-radius:8px;background:#4338CA;color:#fff;font:inherit;font-size:11.5px;font-weight:800;cursor:pointer;}.alc-sus button.no{background:#E0E7FF;color:#3730A3;}'
    + '.alc-k{margin:0 0 6px;font-size:10.5px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:.06em;}.alc-today .alc-k{color:#6D28D9;}'
    + '.alc-big{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;}.alc-big>div{display:flex;flex-direction:column;}.alc-big small{font-size:10.5px;font-weight:700;color:#64748B;}.alc-big b{font-size:26px;font-weight:900;line-height:1.1;color:#0F172A!important;font-variant-numeric:tabular-nums;}.alc-big .m b{color:#7C3AED!important;}.alc-big em{font-style:normal;font-size:10.5px;color:#94A3B8;}'
    + '.alc-tab{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums;}.alc-tab th{text-align:left;font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:.05em;padding:2px 0;}.alc-tab td{padding:4px 0;border-top:1px solid #EDE9FE;color:#334155;}.alc-tab td:last-child{font-weight:800;color:#4C1D95;}'
    + '.alc-meta{margin:6px 0 0!important;font-size:11.5px!important;color:#64748B!important;}.alc-meta b{color:#334155!important;}'
    + '.alc-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px;}.alc-tiles.b{grid-template-columns:repeat(3,1fr);}.alc-tiles>div{display:flex;flex-direction:column;align-items:center;padding:7px 4px;border-radius:10px;background:#F5F3FF;}.alc-tiles.b>div{background:#F0FDF4;}'
    + '.alc-tiles b{font-size:16px;font-weight:900;color:#4C1D95;font-variant-numeric:tabular-nums;}.alc-tiles.b b{color:#166534;}.alc-tiles small{font-size:10px;font-weight:700;color:#64748B;text-align:center;}'
    + '.alc-sec span{text-transform:none;letter-spacing:0;font-weight:600;color:#94A3B8;margin-left:4px;}.alc-note{margin:4px 2px 0;font-size:11px;color:#94A3B8;}'
    + '.alc-row.ev{grid-template-columns:78px 1fr 44px 44px;}.alc-row.ev small,.alc-row.ev em{text-align:right;font-variant-numeric:tabular-nums;}.alc-row.ev small{font-size:12.5px;color:#334155;font-weight:700;}.alc-row.ev em{color:#94A3B8;}'
    + '.alc-gab{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:9px 12px;font-size:12.5px;color:#475569;}.alc-gab summary{cursor:pointer;font-weight:700;}.alc-gab .alc-body-f{margin-top:8px;}'
    + '.alc-copy{align-self:center;border:none;background:none;color:#6D28D9;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;padding:6px;}'
    + '.alc-chip.two{align-items:center;padding:7px 10px;}.alc-chip.two .ic{font-size:17px;}.alc-chip.two .t{display:flex;flex-direction:column;gap:1px;}.alc-chip.two .l1{font-size:12.5px;font-weight:700;color:#4C1D95;}.alc-chip.two .l1 b{display:inline;font-size:14px;font-weight:900;color:#6D28D9;}.alc-chip.two .l2{font-size:11px;font-weight:600;color:#7C6BAA;}'
    + '.alc-bigbar{margin:-2px 0 10px;}.alc-tab td:nth-child(4),.alc-tab th:nth-child(4){text-align:right;}.alc-tab td:nth-child(4){font-weight:800;color:#7C3AED;}.alc-tab td:nth-child(3){font-weight:800;color:#4C1D95;}.alc-tab td:last-child{color:#7C3AED;}'
    + '.alc-pills{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px;}.alc-pills span{padding:3px 8px;border-radius:20px;background:#F5F3FF;color:#5B21B6;font-size:11px;font-weight:700;}.alc-pills span:last-child{background:#F0FDF4;color:#166534;}'
    + '.alc-chart{width:100%;height:auto;display:block;}.alc-chart rect.a{fill:#7C3AED;}.alc-chart rect.c{fill:#C4B5FD;}.alc-chart rect.n{fill:#CBD5E1;}.alc-chart rect.s{fill:#FCD34D;}.alc-chart line.b{stroke:#16A34A;stroke-width:1.5;stroke-dasharray:4 3;}.alc-chart text{font-size:9px;fill:#94A3B8;font-family:inherit;}'
    + '.alc-leg{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;font-size:10.5px;color:#64748B;}.alc-leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px;}.alc-leg i.a{background:#7C3AED;}.alc-leg i.c{background:#C4B5FD;}.alc-leg i.n{background:#CBD5E1;}.alc-leg i.b{height:0;border-top:2px dashed #16A34A;border-radius:0;vertical-align:3px;}'
    + '.alc-row.ev small.g{color:#16A34A;}.alc-row.ev small.o{color:#CA8A04;}.alc-row.ev small.r{color:#DC2626;}'
    + '.alc-line{display:flex;align-items:center;gap:10px;width:100%;margin-bottom:14px;padding:12px 14px;border:1px solid #E2E8F0;border-radius:16px;background:#fff;font:inherit;text-align:left;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.06);}.alc-line .ic{font-size:20px;}.alc-line .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}.alc-line b{font-size:14px;font-weight:800;color:#0F172A;}.alc-line small{font-size:12px;font-weight:600;color:#6D28D9;}.alc-line i{font-style:normal;color:#7C3AED;font-size:18px;}.alc-line:focus-visible{outline:2px solid #7C3AED;outline-offset:2px;}'
    + '.alc-home.back{border-color:#C7D2FE;background:#EEF2FF;color:#1E1B4B;}.alc-home.back small{color:#4338CA;}'
    + '.alc-row{display:grid;grid-template-columns:104px 56px 1fr auto;align-items:center;gap:6px;padding:9px 12px;border:none;border-top:1px solid #F1F5F9;background:none;font:inherit;text-align:left;cursor:pointer;font-size:12.5px;color:#334155;}.alc-row:first-child{border-top:none;}'
    + '.alc-split{display:flex;flex-direction:column;gap:7px;width:100%;padding:11px 13px;border:1.5px solid #DDD6FE;border-radius:16px;background:#FAF8FF;font:inherit;text-align:left;cursor:pointer;color:#2E1065;}.alc-split:focus-visible{outline:2px solid #7C3AED;outline-offset:2px;}'
    + '.alc-sp-h{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;font-weight:800;}.alc-sp-h>span:last-child{color:#7C3AED;font-size:17px;line-height:1;}'
    + '.alc-sp-n{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;}.alc-sp-n>span{display:flex;flex-direction:column;align-items:flex-start;}.alc-sp-n small{font-size:10.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.05em;}'
    + '.alc-sp-n b{font-size:24px;font-weight:900;line-height:1.1;font-variant-numeric:tabular-nums;color:#0F172A;}.alc-sp-n b.ok{color:#16A34A;}.alc-sp-n b.mid{color:#CA8A04;}.alc-sp-n b.low{color:#DC2626;}.alc-sp-m b{color:#7C3AED;}.alc-sp-n em{font-style:normal;font-size:10.5px;color:#94A3B8;font-variant-numeric:tabular-nums;}'
    + '.alc-sp-bar{display:flex;height:10px;border-radius:6px;background:#EEF2F7;overflow:hidden;}.alc-sp-bar i.ok{background:#16A34A;}.alc-sp-bar i.mid{background:#EAB308;}.alc-sp-bar i.low{background:#DC2626;}.alc-sp-bar i.alc{background:repeating-linear-gradient(135deg,#A78BFA 0 5px,#C4B5FD 5px 10px);}'
    + '.alc-sp-d{font-size:11.5px;color:#5B21B6;line-height:1.4;font-variant-numeric:tabular-nums;}.alc-sp-f{font-size:11.5px;color:#475569;line-height:1.4;}'
    + '.alc-dec{margin:8px 0 6px;padding:10px;border-radius:12px;background:#F5F3FF;}.alc-dec-t{margin:0 0 6px!important;}.alc-dec-t span{color:#64748B;font-size:12px;}.alc-dec table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums;}.alc-dec th{text-align:left;font-size:10.5px;color:#64748B;text-transform:uppercase;letter-spacing:.05em;padding:2px 4px;}.alc-dec td{padding:3px 4px;border-top:1px solid #EDE9FE;}.alc-dec td:last-child{font-weight:800;color:#4C1D95;}'
    + '.alc-blood{font-size:12.5px!important;color:#475569!important;}.alc-row.chk{cursor:default;}.alc-row.sus b.q{color:#B45309;}'
    + '.alc-body-f{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;}.alc-body-f label{display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:700;color:#64748B;}.alc-body-f input,.alc-body-f select{width:84px;padding:8px;border:1.5px solid #E2E8F0;border-radius:10px;font:inherit;font-size:14px;background:#fff;}.alc-body-f button{padding:9px 14px;border:none;border-radius:10px;background:#4C1D95;color:#fff;font:inherit;font-weight:800;cursor:pointer;}'
    + '.alc-row.hd{cursor:default;padding:7px 12px;background:#F8FAFC;}.alc-row.hd>*{font-size:10.5px!important;font-weight:800!important;color:#64748B!important;text-transform:uppercase;letter-spacing:.05em;}.alc-row b.y{color:#7C3AED;}.alc-row b.n{color:#15803D;}.alc-row b.q{color:#94A3B8;font-weight:700;}.alc-row small{color:#64748B;font-size:11.5px;}.alc-row em{font-style:normal;font-size:11.5px;color:#475569;font-variant-numeric:tabular-nums;}';
  document.head.appendChild(st);
}
