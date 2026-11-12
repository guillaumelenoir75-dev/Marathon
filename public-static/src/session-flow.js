// ─── Circulation de la donnée : une séance qui change met à jour tout ce qui en dépend ─────────────────────
// sessionChanged(opts) est appelé par TOUS les chemins qui changent une séance faite : validation manuelle
// (saveValidationExtra, après la météo et WHOOP), modification (_savePerfExtra), annulation, « non réalisée » (saveSkipExtra),
// ressenti après une validation automatique (avFeelSave), état rechargé après une écriture du serveur (apRefreshIfServerChanged :
// validation automatique, pilote de nuit). Regroupé (250 ms), il fait dans l'ordre :
//  1. historique analysé vidé (prHistoryChanged) ;
//  2. allure marathon de référence (updateMarathonPace → _am_pace) ;
//  3. données lues par le serveur pour les briefs : allure EF de référence (_ef_ref), signal de la foulée (_body_signals) ;
//  4. records : une course datée plus rapide (prépa, Strava) devient le record (sfSyncRecords → record_*, _records) ;
//  5. course objectif validée : analyse refaite avec la météo arrivée entre-temps (raStore) ;
//  6. chaussures reliées à Strava : compteur Strava relu (shoesStravaFetch(true)) ;
//  7. copie figée de la prépa et fiche prep_index (prepAutoSave(true)) ;
//  8. écrans : accueil, et Plan / Statistiques s'ils sont ouverts (sinon redessinés à l'ouverture).
let _sfTimer = null, _sfOpts = {}, _sfRunning = null;
function sessionChanged(opts){
  _sfOpts = Object.assign(_sfOpts, opts || {});
  if(_sfTimer) clearTimeout(_sfTimer);
  _sfTimer = setTimeout(function(){ _sfTimer = null; _sfRun(); }, (opts && opts.now) ? 0 : 250);
}
async function _sfRun(){
  const o = _sfOpts; _sfOpts = {};
  if(typeof _prepView !== 'undefined' && _prepView && !_prepView.next) return;          // copie consultée : lecture seule
  try { if(typeof prHistoryChanged === 'function') prHistoryChanged(); } catch(e) {}
  try { if(typeof updateMarathonPace === 'function') updateMarathonPace(); } catch(e) { console.warn('[données] allure marathon', e); }
  try { sfStoreDerived(); } catch(e) { console.warn('[données] dérivées', e); }
  try { const r = sfSyncRecords(); if(r.length && typeof showToast === 'function') showToast('🏆 Record ' + r[0].cat + ' : ' + r[0].time + ' (' + r[0].src + ')'); } catch(e) {}
  try { if(o.race && typeof raStore === 'function') raStore(); } catch(e) {}
  try { if(typeof state !== 'undefined' && state.strava_token && typeof shoesStravaFetch === 'function' && typeof getShoes === 'function' && getShoes().some(function(s){ return s.strava_id; })) shoesStravaFetch(true).catch(function(){}); } catch(e) {}
  try { if(typeof prepAutoSave === 'function') prepAutoSave(true).catch(function(){}); } catch(e) {}
  sfRefreshScreens();
}
// allure EF et signal de la foulée tels que l'app les calcule, pour le brief du lendemain matin (serveur : efRefOf, buildTrainingSituation)
function sfStoreDerived(){
  if(typeof _prepView !== 'undefined' && _prepView) return;
  const today = typeof prTodayIso === 'function' ? prTodayIso() : null;
  if(typeof getBestEfPace === 'function'){
    const p = getBestEfPace(), r = state._ef_ref || {};
    if(p && (r.pace !== p || r.at !== today)){ state._ef_ref = { pace: p, at: today }; if(typeof dbRef !== 'undefined' && dbRef) dbRef.child('_ef_ref').set(state._ef_ref).catch(function(){}); }
  }
  if(typeof prStride === 'function' && typeof bsStoreSignal === 'function') bsStoreSignal(prStride());
}
// une course datée plus rapide que le record enregistré (fiche de prépa, course Strava) devient le record ; renvoie les records changés
function sfSyncRecords(){
  const out = [];
  if(typeof prepBestTime !== 'function' || typeof PREP_RECORD_KEYS === 'undefined' || (typeof _prepView !== 'undefined' && _prepView)) return out;
  Object.keys(PREP_RECORD_KEYS).forEach(function(cat){
    const key = PREP_RECORD_KEYS[cat], b = prepBestTime(cat), cur = typeof prepTimeSec === 'function' ? prepTimeSec(state[key]) : null;
    if(!b || b.src === 'record' || !b.date || (cur && b.sec >= cur - 0.5)) return;
    state[key] = b.time;
    const rm = Object.assign({}, state._records || {}); rm[cat] = { date: b.date, race: b.src || null, auto: true }; state._records = rm;
    if(typeof dbRef !== 'undefined' && dbRef){ const up = {}; up[key] = b.time; up._records = rm; dbRef.update(up).catch(function(){}); }
    out.push({ cat: cat, time: b.time, src: b.src, date: b.date });
  });
  return out;
}
function sfRefreshScreens(){
  if(typeof document === 'undefined' || !document.getElementById) return;
  try { if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; } } catch(e) {}
  const vis = function(id){ const el = document.getElementById(id); return !!el && el.style.display !== 'none' && el.style.display !== ''; };
  try { if(typeof renderHome === 'function') renderHome(); } catch(e) {}
  try { if(vis('sc-plan') && typeof renderPlan === 'function'){ rendered.plan = true; renderPlan(); } } catch(e) {}
  try { if(vis('sc-stats') && typeof renderStats === 'function'){ rendered.stats = true; renderStats(); } } catch(e) {}
}
