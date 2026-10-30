// sync.js — enregistrement de l'état : seulement ce qui a changé, et rien de perdu sans réseau
// - syncSave() (appelé par save()) : compare l'état à la dernière version connue de la base (_syncBase) et n'écrit que les clés
//   modifiées (dbRef.update) → une écriture du serveur (pilote de nuit, historique Strava, WHOOP…) ou d'un autre appareil sur une
//   autre clé n'est jamais écrasée. État remplacé (copie consultée, vue d'un athlète…) : écriture complète comme avant.
// - hors-ligne : chaque écriture est aussi gardée sur le téléphone (localStorage pm_pending_<uid>) jusqu'à l'accusé de la base ;
//   si l'app est fermée avant, elle est rejouée au prochain lancement (syncApplyPending). Copie de l'état (pm_state_<uid>) pour
//   démarrer sans réseau (syncOfflineOnce), puis rechargement depuis la base au retour du réseau (syncOnReconnect).
let _syncBases = {}, _syncSeq = 0, _syncCacheAt = 0, _syncFromCache = false;
const _sj = function(v){ return v === undefined ? undefined : JSON.stringify(v); };
function _syncRefKey(r){ try { return r && typeof r.toString === 'function' ? String(r.toString()) : ''; } catch(e) { return ''; } }
function _syncLs(){ try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch(e) { return null; } }
function _syncUid(){ return typeof currentUserId !== 'undefined' && currentUserId ? currentUserId : 'anon'; }
// écritures de l'utilisateur sur son propre état seulement (pas une copie, pas un athlète, pas la prépa à venir)
function _syncOwn(){ return typeof dbRef !== 'undefined' && !!dbRef && _syncRefKey(dbRef).replace(/\/+$/, '').slice(-('/users/' + _syncUid() + '/state').length) === '/users/' + _syncUid() + '/state'; }

// version de la base sur laquelle l'état est calé (au chargement, après un rechargement)
function syncBaseReset(data){
  const map = {}; Object.keys(data || {}).forEach(function(k){ if(data[k] !== undefined) map[k] = _sj(data[k]); });
  _syncBases[_syncRefKey(typeof dbRef !== 'undefined' ? dbRef : null)] = { obj: state, map: map };   // une base par emplacement (son état, un athlète…)
}
// clés à écrire : modifiées, ajoutées, ou retirées (null)
function syncDiff(){
  const b = _syncBases[_syncRefKey(typeof dbRef !== 'undefined' ? dbRef : null)], up = {}, B = (b && b.obj === state && b.map) || {};
  Object.keys(state).forEach(function(k){ const v = state[k]; if(v === undefined){ if(B[k] !== undefined) up[k] = null; return; } if(_sj(v) !== B[k]) up[k] = v; });
  Object.keys(B).forEach(function(k){ if(!(k in state)) up[k] = null; });
  return up;
}
function syncSave(){
  if(typeof dbRef === 'undefined' || !dbRef) return Promise.resolve();
  const rk = _syncRefKey(dbRef);
  const base = _syncBases[rk];
  if(!base || base.obj !== state){
    // état remplacé (copie consultée, vue d'un athlète, prépa à venir) : écriture complète, puis calage
    syncBaseReset(state);
    return Promise.resolve(dbRef.set(state)).catch(function(e){ console.error('Firebase save error:', e); });
  }
  const up = syncDiff(), keys = Object.keys(up);
  if(!keys.length) return Promise.resolve();
  const B = base.map, before = {};
  keys.forEach(function(k){ before[k] = B[k]; if(up[k] === null) delete B[k]; else B[k] = _sj(up[k]); });
  const seq = ++_syncSeq, own = _syncOwn();
  if(own) syncPendingAdd(up, seq);
  return Promise.resolve(dbRef.update(up)).then(function(){
    if(own){ syncPendingDone(seq); syncCacheState(false); }
  }).catch(function(e){
    // refusée par la base (pas un manque de réseau) : pas rejouée au lancement ; ces clés repartiront à la prochaine sauvegarde
    console.error('Firebase save error:', e);
    if(own) syncPendingDone(seq);
    keys.forEach(function(k){ B[k] = '\u0000' + (before[k] || ''); });
  });
}

// ─── Hors-ligne : écritures en attente, gardées sur le téléphone ───
function _syncPendingKey(){ return 'pm_pending_' + _syncUid(); }
function syncPendingGet(){ const L = _syncLs(); if(!L) return null; try { return JSON.parse(L.getItem(_syncPendingKey()) || 'null'); } catch(e) { return null; } }
function syncPendingAdd(up, seq){
  const L = _syncLs(); if(!L) return;
  try { const P = syncPendingGet() || { up: {} }; Object.assign(P.up, up); P.seq = seq; P.at = Date.now(); L.setItem(_syncPendingKey(), JSON.stringify(P)); } catch(e) {}
  syncStatusRender();
}
function syncPendingDone(seq){
  const L = _syncLs(); if(!L) return;
  try { const P = syncPendingGet(); if(P && P.seq === seq) L.removeItem(_syncPendingKey()); } catch(e) {}
  syncStatusRender();
}
// au lancement : écritures faites sans réseau puis app fermée → rejouées sur l'état chargé (avant la 1re sauvegarde)
function syncApplyPending(){
  const P = syncPendingGet(); if(!P || !P.up) return 0;
  const ks = Object.keys(P.up);
  ks.forEach(function(k){ if(P.up[k] === null) delete state[k]; else state[k] = P.up[k]; });
  return ks.length;
}

// ─── Démarrage sans réseau : copie de l'état et du rôle ───
function syncCacheState(force){
  const L = _syncLs(); if(!L || !_syncOwn()) return;
  const now = Date.now(); if(!force && now - _syncCacheAt < 30000) return;
  _syncCacheAt = now;
  try { L.setItem('pm_state_' + _syncUid(), JSON.stringify(state)); } catch(e) { try { L.removeItem('pm_state_' + _syncUid()); } catch(e2) {} }
}
function syncCacheRole(uid, role){ const L = _syncLs(); if(L && role) try { L.setItem('pm_role_' + uid, role); } catch(e) {} }
// lecture de la base, ou de la copie du téléphone si le réseau ne répond pas (hors ligne : tout de suite ; sinon après ms)
function syncOfflineOnce(ref, cacheKey, ms){
  const L = _syncLs();
  let cached = null; try { cached = L ? L.getItem(cacheKey) : null; } catch(e) {}
  const live = Promise.resolve(ref.once('value'));
  if(cached == null) return live;
  const val = cacheKey.indexOf('pm_role_') === 0 ? cached : (function(){ try { return JSON.parse(cached); } catch(e) { return null; } })();
  if(val == null) return live;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return Promise.race([live, new Promise(function(res){ setTimeout(function(){ res({ val: function(){ return val; }, _cached: true }); }, offline ? 0 : ms || 8000); })]);
}
function syncMarkFromCache(v){ _syncFromCache = !!v; syncStatusRender(); }
// retour du réseau après un démarrage sur la copie : état rechargé depuis la base, écritures en attente rejouées
async function syncOnReconnect(){
  if(!_syncFromCache || typeof dbRef === 'undefined' || !dbRef || !_syncOwn()) return false;
  try {
    const snap = await dbRef.once('value'); const data = snap && snap.val();
    if(!data) return false;
    _syncFromCache = false;
    state = data; syncBaseReset(data); syncApplyPending();
    if(typeof syncPlanCompat === 'function') syncPlanCompat();
    if(typeof prHistoryChanged === 'function') prHistoryChanged();
    await syncSave();
    try { if(typeof renderHome === 'function') renderHome(); } catch(e) {}
    syncStatusRender();
    return true;
  } catch(e) { return false; }
}

// réseau lent au démarrage (copie utilisée) : rechargement dès que la base répond
function syncWatchConnection(){
  try { if(typeof firebase === 'undefined' || !firebase.database) return;
    firebase.database().ref('.info/connected').on('value', function(s){ if(s && s.val() === true && _syncFromCache) syncOnReconnect(); });
  } catch(e) {}
}

// ─── Bandeau « hors connexion » ───
function syncStatusRender(){
  if(typeof document === 'undefined') return;
  const off = (typeof navigator !== 'undefined' && navigator.onLine === false) || _syncFromCache, P = syncPendingGet(), n = P && P.up ? Object.keys(P.up).length : 0;
  let el = document.getElementById('sync-banner');
  if(!off){ if(el) el.remove(); return; }
  if(!el){ el = document.createElement('div'); el.id = 'sync-banner'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 8px);z-index:9000;max-width:360px;width:calc(100% - 32px);box-sizing:border-box;background:#1E293B;color:#fff;border-radius:12px;padding:8px 12px;font-size:12.5px;line-height:1.35;box-shadow:0 6px 18px rgba(15,23,42,.25);display:flex;gap:8px;align-items:center;';
  el.innerHTML = '<span aria-hidden="true">📴</span><span><b>Hors connexion</b> · ' + (n ? 'tes changements sont gardés sur le téléphone et partiront au retour du réseau' : 'tu peux consulter et valider tes séances, tout sera envoyé au retour du réseau') + '</span>';
}
if(typeof window !== 'undefined' && window.addEventListener){
  window.addEventListener('offline', syncStatusRender);
  window.addEventListener('online', function(){ syncStatusRender(); syncOnReconnect(); });
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'hidden') syncCacheState(true); });
}
