// alcohol.js — Alcool la veille : saisie du matin et impact PERSONNEL sur la récupération, séparé de celui de l'entraînement.
// Saisie (après « Je suis réveillé », sinon à la 1re ouverture du matin) : state._alcohol[jour du réveil] = { l: 0-10, t: ['beer'|'wine'|'spirits'], at }.
// Modèle (alcModel) : sur les nuits WHOOP renseignées, régression récupération ~ a + b·alcool + c·charge d'entraînement des 2 jours d'avant
// (TRIMP, fitness-model.js), idem VFC (% de ta base sans alcool), FC repos, sommeil ; coefficient alcool rapproché d'une valeur générale tant
// qu'il y a peu de soirées (ALC_PRIOR, poids ALC_K) → impact du jour (alcImpact) : points de récupération dus à l'alcool, forme « hors alcool ».
// Utilisé par : la forme du jour (ligne dédiée), l'allègement WHOOP (prWhoop : récupération corrigée de l'alcool, pas de séances allégées
// pour une nuit arrosée), les tendances FC (prStride, prDrift, allure EF : séances du lendemain d'une soirée ≥ 4/10 écartées), le Coach
// (contexte, analyse de séance, relecture / discussion du plan) et le brief du matin (state._alcohol_model, recalculé chaque jour).
const ALC_TYPES = [{ id: 'beer', t: 'Bière', ico: '🍺' }, { id: 'wine', t: 'Vin', ico: '🍷' }, { id: 'spirits', t: 'Alcool fort', ico: '🥃' }];
// valeurs générales par point d'alcool (échelle 0-10) : 10/10 ≈ −26 pts de récupération, −24 % de VFC, +7 bpm de FC repos, −20 pts de sommeil
const ALC_PRIOR = { rec: -2.6, hrv: -2.4, rhr: 0.7, sleep: -2.0 };
const ALC_K = 4;                                              // poids de la valeur générale (en nombre de soirées)
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
function _alcSolve(X, y){                                     // moindres carrés (équations normales, petite dimension)
  const p = X[0].length, A = [], b = [];
  for(let i = 0; i < p; i++){ A.push(new Array(p).fill(0)); b.push(0); }
  X.forEach(function(r, k){ for(let i = 0; i < p; i++){ b[i] += r[i] * y[k]; for(let j = 0; j < p; j++) A[i][j] += r[i] * r[j]; } });
  for(let i = 0; i < p; i++) A[i][i] += 1e-6;
  for(let c = 0; c < p; c++){
    let m = c; for(let r = c + 1; r < p; r++) if(Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    if(Math.abs(A[m][c]) < 1e-9) return null;
    [A[c], A[m]] = [A[m], A[c]]; [b[c], b[m]] = [b[m], b[c]];
    for(let r = 0; r < p; r++){ if(r === c) continue; const f = A[r][c] / A[c][c]; for(let j = c; j < p; j++) A[r][j] -= f * A[c][j]; b[r] -= f * b[c]; }
  }
  return b.map(function(v, i){ return v / A[i][i]; });
}
function alcNights(today){
  today = today || prTodayIso();
  const wd = state.whoop_data || {}, A = state._alcohol || {}, sl = {};
  (wd.sleeps || []).forEach(function(s){ if(s && s.date && s.performance_pct != null) sl[s.date] = s.performance_pct; });
  let L = {}; try { if(typeof fmLoads === 'function') L = fmLoads(today) || {}; } catch(e) {}
  const out = [];
  (wd.recoveries || []).forEach(function(r){
    if(!r || !r.date || r.score == null || !A[r.date] || r.date > today) return;
    const lp = (L[prAddDays(r.date, -1)] || 0) + 0.5 * (L[prAddDays(r.date, -2)] || 0);
    out.push({ date: r.date, l: +A[r.date].l || 0, rec: +r.score, hrv: r.hrv != null ? +r.hrv : null, rhr: r.rhr != null ? +r.rhr : null, sleep: sl[r.date] != null ? +sl[r.date] : null, load: lp });
  });
  return out.sort(function(a, b){ return a.date.localeCompare(b.date); });
}
function alcModel(today){
  const N = alcNights(today), free = N.filter(function(n){ return n.l === 0; }), drink = N.filter(function(n){ return n.l > 0; });
  const med = function(a){ if(!a.length) return null; const b = a.slice().sort(function(x, y){ return x - y; }), m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const mean = function(a){ return a.length ? a.reduce(function(s, x){ return s + x; }, 0) / a.length : null; };
  const hrvBase = med(free.map(function(n){ return n.hrv; }).filter(function(x){ return x != null; })) || med(N.map(function(n){ return n.hrv; }).filter(function(x){ return x != null; }));
  const metric = { rec: function(n){ return n.rec; }, hrv: function(n){ return n.hrv != null && hrvBase ? (n.hrv / hrvBase - 1) * 100 : null; }, rhr: function(n){ return n.rhr; }, sleep: function(n){ return n.sleep; } };
  const coef = {}, loadCoef = {};
  Object.keys(metric).forEach(function(k){
    const rows = N.map(function(n){ return { y: metric[k](n), l: n.l, ld: n.load / 100 }; }).filter(function(r){ return r.y != null; });
    const nAlc = rows.filter(function(r){ return r.l > 0; }).length, nFree = rows.filter(function(r){ return r.l === 0; }).length;
    let b = null, c = null;
    if(nAlc >= 2 && nFree >= 3 && rows.length >= 6){
      // charge d'entraînement prise en compte seulement si elle varie (sinon système singulier)
      const lds = rows.map(function(r){ return r.ld; }), mL = lds.reduce(function(s, x){ return s + x; }, 0) / lds.length;
      const varL = lds.reduce(function(s, x){ return s + (x - mL) * (x - mL); }, 0) / lds.length;
      const sol = varL > 1e-4 ? _alcSolve(rows.map(function(r){ return [1, r.l, r.ld]; }), rows.map(function(r){ return r.y; })) : null;
      if(sol){ b = sol[1]; c = sol[2]; }
      else { const s2 = _alcSolve(rows.map(function(r){ return [1, r.l]; }), rows.map(function(r){ return r.y; })); if(s2) b = s2[1]; }
    }
    // valeur personnelle rapprochée de la valeur générale tant qu'il y a peu de soirées ; jamais de sens contraire à la physiologie
    const prior = ALC_PRIOR[k], w = b != null ? nAlc / (nAlc + ALC_K) : 0;
    let v = b != null ? w * b + (1 - w) * prior : prior;
    if(prior < 0) v = Math.min(v, prior * 0.25); else v = Math.max(v, prior * 0.25);
    coef[k] = Math.round(v * 100) / 100; loadCoef[k] = c != null ? Math.round(c * 100) / 100 : null;
  });
  const band = function(lab, f){ const a = N.filter(f); return { lab: lab, n: a.length, rec: a.length ? Math.round(mean(a.map(function(n){ return n.rec; }))) : null,
    hrv: (function(){ const v = a.map(function(n){ return n.hrv; }).filter(function(x){ return x != null; }); return v.length ? Math.round(mean(v)) : null; })(),
    rhr: (function(){ const v = a.map(function(n){ return n.rhr; }).filter(function(x){ return x != null; }); return v.length ? Math.round(mean(v) * 10) / 10 : null; })() }; };
  return { n: N.length, nAlc: drink.length, nFree: free.length, personal: drink.length >= 3 && free.length >= 3, coef: coef, loadCoef: loadCoef, hrvBase: hrvBase ? Math.round(hrvBase) : null,
    base: band('Sans alcool', function(n){ return n.l === 0; }),
    bands: [band('Sans alcool', function(n){ return n.l === 0; }), band('Léger (1-3)', function(n){ return n.l >= 1 && n.l <= 3; }), band('Modéré (4-6)', function(n){ return n.l >= 4 && n.l <= 6; }), band('Fort (7-10)', function(n){ return n.l >= 7; })] };
}
// modèle compact pour le serveur (brief du matin) : recalculé une fois par jour, et à chaque saisie
function alcStoreModel(force){
  try {
    const t = prTodayIso(), cur = state._alcohol_model;
    if(!force && cur && cur.at === t) return cur;
    const M = alcModel(t);
    state._alcohol_model = { at: t, n: M.n, nAlc: M.nAlc, personal: M.personal, rec: M.coef.rec, hrv: M.coef.hrv, rhr: M.coef.rhr, sleep: M.coef.sleep };
    return state._alcohol_model;
  } catch(e) { return null; }
}
// impact de la soirée sur la nuit du jour `day` (négatif = perdu) ; observé et « hors alcool »
function alcImpact(day, M){
  day = day || alcDay();
  const e = alcEntry(day); if(!e || !(+e.l > 0)) return null;
  M = M || alcModel();
  const l = +e.l, c = M.coef;
  const wd = state.whoop_data || {}, r = (wd.recoveries || []).find(function(x){ return x && x.date === day; }) || null, s = (wd.sleeps || []).find(function(x){ return x && x.date === day; }) || null;
  const out = { day: day, l: l, t: e.t || [], personal: M.personal, n: M.nAlc, rec: Math.round(c.rec * l), hrv: Math.round(c.hrv * l), rhr: Math.round(c.rhr * l * 10) / 10, sleep: Math.round(c.sleep * l) };
  if(r && r.score != null){
    out.recObs = +r.score; out.recWithout = Math.max(0, Math.min(100, Math.round(r.score - out.rec)));
    const base = M.base && M.base.rec != null ? M.base.rec : null, gap = base != null ? base - r.score : null;
    out.share = gap != null && gap > 0 ? Math.round(Math.min(1, -out.rec / gap) * 100) : null;   // part de la baisse due à l'alcool
  }
  // nuit corrigée (pour le score « hors alcool »)
  out.rCorr = r ? Object.assign({}, r, { score: r.score != null ? Math.max(0, Math.min(100, r.score - out.rec)) : r.score, hrv: r.hrv != null ? r.hrv / Math.max(0.3, 1 + out.hrv / 100) : r.hrv, rhr: r.rhr != null ? r.rhr - out.rhr : r.rhr }) : null;
  out.sCorr = s ? Object.assign({}, s, { performance_pct: s.performance_pct != null ? Math.max(0, Math.min(100, s.performance_pct - out.sleep)) : s.performance_pct }) : null;
  return out;
}
// récupération WHOOP corrigée de l'alcool de la veille (pour juger la fatigue d'ENTRAÎNEMENT) — prWhoop
function alcCorrectRecovery(r, M){
  if(!r || r.score == null) return r;
  const l = alcLevel(r.date); if(!(l > 0)) return r;
  M = M || alcModel(); const c = M.coef;
  return Object.assign({}, r, { score: Math.max(0, Math.min(100, r.score - c.rec * l)), hrv: r.hrv != null ? r.hrv / Math.max(0.3, 1 + c.hrv * l / 100) : r.hrv, _alc: l });
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
function alcHomeLine(F){
  try {
    if(typeof _prepView !== 'undefined' && _prepView) return '';
    _alcCss();
    const day = alcDay(), e = alcEntry(day);
    const miss = prTodayIso() <= ALC_BACKFILL_UNTIL && typeof isAdmin === 'function' && isAdmin() ? alcBackfillMissing() : [];
    const back = miss.length ? '<button type="button" class="alc-home back" onclick="alcBackfill()"><span>🗓️</span><span><b>Renseigne l\'alcool des 3 dernières nuits</b><small>' + miss.length + ' nuit' + (miss.length > 1 ? 's' : '') + ' à compléter : avec leurs données WHOOP, ton profil se personnalise dès maintenant</small></span><span aria-hidden="true">›</span></button>' : '';
    return back + _alcHomeMain(F, day, e);
  } catch(err) { return ''; }
}
function _alcHomeMain(F, day, e){
  try {
    if(!e) return state['_wakeup_' + day] ? '<button type="button" class="alc-home ask" onclick="alcAsk()"><span>🌙</span><span><b>Alcool hier soir ?</b><small>Réponds pour séparer son effet de celui de l\'entraînement</small></span><span aria-hidden="true">›</span></button>' : '';
    if(!(+e.l > 0)) return '<button type="button" class="alc-home zero" onclick="alcAsk()"><span>💧</span><span><b>Pas d\'alcool hier soir</b><small>Ta récupération reflète ton entraînement et ta nuit · modifier</small></span></button>';
    const M = alcModel(), I = alcImpact(day, M); if(!I) return '';
    const parts = ['récup ' + I.rec + ' pts'];
    if(I.hrv) parts.push('VFC ' + I.hrv + ' %'); if(I.rhr) parts.push('FC repos +' + String(I.rhr).replace('.', ','));
    let without = '';
    if(F && I.rCorr && typeof wellnessScore === 'function'){
      const n = typeof wellnessNight === 'function' ? wellnessNight() : null;
      const obs = wellnessScore(n ? n.r : null, n ? n.s : null, n ? n.fc : null), corr = wellnessScore(I.rCorr, I.sCorr || (n ? n.s : null), n && n.fc != null ? Math.round(n.fc - I.rhr) : null);
      if(obs != null && corr != null) without = ' · hors alcool, ta forme serait ~' + Math.max(0, Math.min(100, Math.round(F.score + corr - obs)));
    }
    return '<button type="button" class="alc-home on" onclick="openAlcoholInsights()"><span>🍷</span><span><b>Alcool hier soir : ' + I.l + '/10' + (I.t.length ? ' (' + prEsc(alcTypesText(I.t)) + ')' : '') + '</b>'
      + '<small>Effet estimé sur ta nuit : ' + parts.join(' · ') + without + (I.share != null ? ' — ' + I.share + ' % de la baisse vient de l\'alcool, pas de l\'entraînement' : '') + '</small></span><span aria-hidden="true">›</span></button>';
  } catch(err) { return ''; }
}

// ─── Statistiques › Forme : alcool et récupération ───
function alcStatsHtml(){
  const M = alcModel(); if(!M.n && !Object.keys(state._alcohol || {}).length) return '';
  _alcCss();
  const b = M.bands.filter(function(x){ return x.n; }), mx = Math.max.apply(null, b.map(function(x){ return x.rec || 0; }).concat([1]));
  const last30 = Object.keys(state._alcohol || {}).filter(function(d){ return prDays(d, prTodayIso()) <= 30 && prDays(d, prTodayIso()) >= 0; }), drinks = last30.filter(function(d){ return state._alcohol[d].l > 0; });
  const lost = drinks.reduce(function(s, d){ return s + Math.max(0, -M.coef.rec * state._alcohol[d].l); }, 0);
  let h = '<div class="alc-card"><p class="alc-card-t">🍷 Alcool et récupération <span>' + (M.personal ? 'modèle ajusté sur toi (' + M.nAlc + ' soirées, ' + M.nFree + ' nuits sans)' : 'estimation générale · se personnalise avec tes saisies') + '</span></p>';
  h += '<p class="alc-card-s">' + (M.personal ? 'Chez toi' : 'En général (en attendant assez de tes saisies)') + ', chaque point d\'alcool (sur 10) coûte environ <b>' + String(-M.coef.rec).replace('.', ',') + ' pts</b> de récupération, <b>' + String(-M.coef.hrv).replace('.', ',') + ' %</b> de VFC et <b>+' + String(M.coef.rhr).replace('.', ',') + ' bpm</b> de FC repos — à charge d\'entraînement égale.</p>';
  if(b.length) h += '<div class="alc-bars">' + b.map(function(x){ return '<div class="alc-bar"><small>' + x.lab + '</small><i style="width:' + Math.round((x.rec || 0) / mx * 100) + '%"></i><b>' + (x.rec != null ? x.rec + ' %' : '—') + '</b><span>' + x.n + ' nuit' + (x.n > 1 ? 's' : '') + (x.rhr ? ' · FC ' + String(x.rhr).replace('.', ',') : '') + (x.hrv ? ' · VFC ' + x.hrv : '') + '</span></div>'; }).join('') + '</div>';
  h += '<p class="alc-card-n">30 derniers jours : ' + drinks.length + ' soirée' + (drinks.length > 1 ? 's' : '') + ' avec alcool sur ' + last30.length + ' renseignée' + (last30.length > 1 ? 's' : '') + (lost ? ' · ≈ ' + Math.round(lost) + ' points de récupération perdus' : '') + '. Les séances du lendemain d\'une soirée ≥ ' + ALC_AFFECTS_RUN + '/10 sont écartées de tes tendances de FC.</p>';
  h += '<button type="button" class="alc-card-b" onclick="openAlcoholInsights()">Détail et historique ›</button></div>';
  return h;
}
function openAlcoholInsights(){
  _alcCss();
  const M = alcModel(), I = alcImpact(alcDay(), M), A = state._alcohol || {};
  // 7 dernières nuits toujours listées (même non renseignées, pour compléter après coup), puis les plus anciennes saisies
  const last7 = []; for(let k = 0; k < 7; k++) last7.push(prAddDays(alcDay(), -k));
  const days = last7.concat(Object.keys(A).filter(function(d){ return last7.indexOf(d) < 0; }).sort().reverse()).slice(0, 24);
  const old = document.getElementById('alc-ins'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'alc-ins'; ov.style.zIndex = '510'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  const rec = {}; ((state.whoop_data || {}).recoveries || []).forEach(function(r){ if(r && r.date) rec[r.date] = r; });
  let h = '<div class="modal-box" style="max-height:90vh;"><div class="alc-ihead"><div><p class="alc-eb">Forme</p><p class="alc-t">🍷 Alcool et récupération</p><p class="alc-sub">' + (M.personal ? 'Modèle ajusté sur tes ' + M.n + ' nuits renseignées' : 'Estimation générale, personnalisée dès 3 soirées et 3 nuits sans alcool renseignées') + '</p></div>'
    + '<button class="alc-x" onclick="document.getElementById(\'alc-ins\').remove()" aria-label="Fermer">×</button></div><div class="modal-scroll-body" style="background:#F5F3FA;"><div class="alc-ibody">';
  if(I) h += '<div class="alc-today"><b>Ce matin (' + I.l + '/10)</b><p>Effet estimé : récupération <b>' + I.rec + ' pts</b>' + (I.recObs != null ? ' (' + I.recObs + ' % mesuré → ~' + I.recWithout + ' % sans alcool)' : '') + ', VFC <b>' + I.hrv + ' %</b>, FC repos <b>+' + String(I.rhr).replace('.', ',') + ' bpm</b>, sommeil <b>' + I.sleep + ' pts</b>.'
    + (I.share != null ? ' Environ <b>' + I.share + ' %</b> de ta baisse de récupération vient de l\'alcool.' : '') + ' Cette part n\'est pas comptée comme de la fatigue d\'entraînement : ton plan n\'est pas allégé pour ça.</p></div>';
  h += alcStatsHtml().replace('<button type="button" class="alc-card-b" onclick="openAlcoholInsights()">Détail et historique ›</button>', '');
  h += '<p class="alc-sec">Tes dernières nuits</p><div class="alc-list">' + (days.length ? days.map(function(d){
    const e = A[d], r = rec[d], dd = new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
    return '<button type="button" class="alc-row" onclick="document.getElementById(\'alc-ins\').remove();alcAsk({day:\'' + d + '\'})"><span>' + dd + '</span><b class="' + (!e ? 'q' : e.l > 0 ? 'y' : 'n') + '">' + (!e ? 'À remplir' : e.l > 0 ? e.l + '/10' : 'Aucun') + '</b><small>' + (e ? prEsc(alcTypesText(e.t)) : '') + '</small><em>' + (r && r.score != null ? 'récup ' + r.score + ' %' : '') + '</em></button>';
  }).join('') : '<p class="alc-card-n">Pas encore de saisie.</p>') + '</div>';
  h += '<p class="alc-card-n" style="margin-top:6px;">Toucher une nuit pour la corriger. Le Coach, le brief du matin et la mise à jour du plan tiennent compte de ces saisies.</p></div></div></div>';
  ov.innerHTML = h;
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

// ─── Pour le Coach (chat, analyse de séance, relecture / discussion du plan) ───
function alcCoachContext(today){
  try {
    today = today || prTodayIso();
    const A = state._alcohol || {}, M = alcModel(today), I = alcImpact(alcDay(), M);
    const recent = Object.keys(A).filter(function(d){ const k = prDays(d, today); return k >= 0 && k <= 14; }).sort().map(function(d){ return { matin: d, niveau_0_10: A[d].l, types: alcTypesText(A[d].t) || null }; });
    if(!recent.length && !M.n) return null;
    return { regle: 'Une récupération WHOOP basse, une VFC basse ou une FC repos haute le lendemain d\'un soir d\'alcool viennent en partie de l\'alcool, PAS de l\'entraînement : ne les attribue pas à une séance trop rapide ou trop chargée, ne propose pas d\'alléger le plan pour ça.',
      cette_nuit: I ? { niveau_0_10: I.l, types: alcTypesText(I.t) || null, effet_recup_pts: I.rec, effet_vfc_pct: I.hrv, effet_fc_repos_bpm: I.rhr, recup_mesuree: I.recObs != null ? I.recObs : null, recup_sans_alcool_estimee: I.recWithout != null ? I.recWithout : null, part_de_la_baisse_due_a_l_alcool_pct: I.share } : (alcEntry(alcDay()) ? 'pas d\'alcool' : 'non renseigné'),
      quatorze_derniers_jours: recent,
      modele: { personnel: M.personal, soirees: M.nAlc, nuits_sans: M.nFree, par_point_alcool: { recup_pts: M.coef.rec, vfc_pct: M.coef.hrv, fc_repos_bpm: M.coef.rhr, sommeil_pts: M.coef.sleep } } };
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
    + '.alc-home.back{border-color:#C7D2FE;background:#EEF2FF;color:#1E1B4B;}.alc-home.back small{color:#4338CA;}'
    + '.alc-row{display:grid;grid-template-columns:92px 56px 1fr auto;align-items:center;gap:6px;padding:9px 12px;border:none;border-top:1px solid #F1F5F9;background:none;font:inherit;text-align:left;cursor:pointer;font-size:12.5px;color:#334155;}.alc-row:first-child{border-top:none;}'
    + '.alc-row b.y{color:#7C3AED;}.alc-row b.n{color:#15803D;}.alc-row b.q{color:#94A3B8;font-weight:700;}.alc-row small{color:#64748B;font-size:11.5px;}.alc-row em{font-style:normal;font-size:11.5px;color:#475569;font-variant-numeric:tabular-nums;}';
  document.head.appendChild(st);
}
