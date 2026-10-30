// Pilote automatique du plan : chaque nuit (fonction serveur autopilotNightly, 4h15), les ajustements des 7 prochains jours
// proposés par « MAJ le plan » (allures, km, allègements WHOOP / douleur) sont appliqués sans intervention, expliqués le matin
// dans le brief (« 🏃 Ton entraînement du jour ») et annulables en un geste. Rien n'est appliqué si le mode est « sur proposition »
// ou « désactivé » (state._autopilot : 'auto' par défaut | 'suggest' | 'off'). Un ajustement annulé n'est pas refait ; une séance
// déjà ajustée depuis moins de 7 jours n'est pas retouchée (les allures avancent de 10 s/km au plus par semaine).
// apRun(today) tourne aussi bien dans le moteur côté serveur (functions/engine.js) que dans l'app.

const AP_DAYS = 7;
function apMode(){ return (typeof state !== 'undefined' && state && state._autopilot) || 'auto'; }
// ajustements retenus : 7 prochains jours, pas de séance test ajoutée, pas de retour en arrière, rien de ce qui a été annulé
function apSelect(a, today){
  // annulé par toi (pilote) → jamais refait ; déjà ajusté depuis moins de 7 jours (pilote ou MAJ) → pas retouché (progression par paliers)
  const end = prAddDays(today, AP_DAYS - 1), undone = {}, since = prAddDays(today, -6);
  (state._plan_reviews || []).forEach(function(h){
    if((h.auto && h.undone) || (!h.undone && h.date >= since)) (h.changes || []).forEach(function(c){ undone[c.ref + '|' + c.field] = 1; });
  });
  return ((a && a.proposals) || []).filter(function(p){
    if(!p.key || !p.date || p.date < today || p.date > end || p.held || p.revert) return false;
    if(p.kind === 'test' || p.field === 'skip' || p.field === 'date') return false;
    if(p.field === 'session' && p.kind !== 'whoop' && p.kind !== 'pain') return false;
    return !undone[p.key + '|' + p.field];
  });
}
const _apVal = function(v, field){
  if(v && typeof v === 'object') return (v.t || 'séance') + (v.km ? ' · ' + v.km + ' km' : '');
  if(field === 'km') return v + ' km';
  return String(v == null ? '' : v);
};
function apDesc(p, today){
  return { key: p.key, title: p.title || '', date: p.date, field: p.field, kind: p.kind || null, before: _apVal(p.before, p.field), after: _apVal(p.after, p.field),
    why: String(p.short || p.why || p.reason || '').slice(0, 160), today: p.date === today };
}
function apRun(today){
  today = today || prTodayIso();
  const mode = apMode(); if(mode === 'off' || (typeof usesHardPlan === 'function' && usesHardPlan())) return null;
  const a = prAnalyze(), sel = apSelect(a, today), at = new Date().toISOString();
  const res = { date: today, at: at, mode: mode, applied: false, changes: sel.map(function(p){ return apDesc(p, today); }) };
  if(mode === 'auto' && sel.length){
    const r = prApplyChanges(sel, { auto: true, kind: 'autopilot', vdot: a.fit && a.fit.vdot, at: at });
    res.applied = r.n > 0;
  }
  return res;
}
// entrée de l'historique _plan_reviews créée par le pilote cette nuit (retrouvée par son horodatage)
function apFindEntry(last){
  const hist = state._plan_reviews || [];
  for(let i = hist.length - 1; i >= 0; i--) if(hist[i].auto && last && hist[i].at === last.at) return i;
  return -1;
}
function apLastToday(){ const L = state._autopilot_last; return L && L.date === prTodayIso() && L.changes && L.changes.length ? L : null; }

// ─── Dans l'app : carte sous le brief du matin et sur l'accueil, annulation, réglage ───
function apUndo(){
  const L = apLastToday(); if(!L) return;
  const i = apFindEntry(L);
  if(i >= 0) prUndoReview(i);
  state._autopilot_last = Object.assign({}, L, { undone: true }); save();
  try { renderHome(); } catch(e) {}
  document.querySelectorAll('.ap-card').forEach(function(el){ el.outerHTML = apCardHtml(); });
}
function apCardHtml(){
  const L = apLastToday(); if(!L) return '';
  _apCss();
  const field = { detail: 'allure', km: 'km', session: 'séance', title: 'intitulé', type: 'type' };
  const rows = L.changes.slice(0, 6).map(function(c){
    const d = new Date(c.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long' });
    return '<li><b>' + (c.today ? 'Aujourd\'hui' : d.charAt(0).toUpperCase() + d.slice(1)) + ' · ' + _apEsc(c.title) + '</b>'
      + '<span class="ap-ch">' + (field[c.field] || c.field) + ' : <s>' + _apEsc(c.before) + '</s> → <em>' + _apEsc(c.after) + '</em></span>'
      + (c.why ? '<span class="ap-why">' + _apEsc(c.why) + '</span>' : '') + '</li>';
  }).join('');
  const head = L.undone ? '↩ Ajustements de la nuit annulés : ton plan d\'origine est rétabli' : L.applied ? '🤖 Ajusté cette nuit par le pilote automatique' : '🤖 Ajustements proposés cette nuit (mode « sur proposition »)';
  const act = L.undone ? '' : L.applied ? '<button type="button" class="ap-undo" onclick="apUndo()">Annuler ces ajustements</button>'
    : '<button type="button" class="ap-undo go" onclick="if(typeof openPlanReview===\'function\')openPlanReview()">Voir et appliquer</button>';
  return '<div class="ap-card' + (L.undone ? ' off' : '') + '"><p class="ap-h">' + head + '</p>' + (L.undone ? '' : '<ul>' + rows + '</ul>') + act + '</div>';
}
const _apEsc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
function openAutopilotSettings(){
  _apCss();
  const m = apMode(), mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ap-set'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  const opt = function(v, t, d){ return '<button type="button" class="ap-opt' + (m === v ? ' on' : '') + '" onclick="apSetMode(\'' + v + '\')"><b>' + t + '</b><span>' + d + '</span></button>'; };
  ov.innerHTML = '<div class="modal-box" style="max-height:90vh;"><div class="ap-head"><div><p class="ap-eb">Plan</p><p class="ap-title">🤖 Pilote automatique</p><p class="ap-sub">Chaque nuit, ton plan des 7 prochains jours s\'ajuste à tes données</p></div>'
    + '<button class="ap-x" onclick="document.getElementById(\'ap-set\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F7FB;"><div style="padding:14px 16px 24px;display:flex;flex-direction:column;gap:8px;">'
    + opt('auto', 'Automatique', 'Les ajustements sont appliqués la nuit. Le brief du matin t\'explique ce qui a changé et pourquoi ; tu peux annuler en un geste.')
    + opt('suggest', 'Sur proposition', 'Rien n\'est modifié : le brief te signale les ajustements, tu les appliques dans « MAJ le plan ».')
    + opt('off', 'Désactivé', 'Le plan ne bouge que lorsque tu ouvres « MAJ le plan ».')
    + '<p style="font-size:12px;color:#64748B;margin:6px 2px 0;line-height:1.45;">Ce qui peut changer : allures (au plus 10 s/km par fois), km des séances, allègement après une fatigue WHOOP ou une douleur. Jamais : la course, une séance ajoutée, un jour déplacé. Un ajustement que tu annules n\'est pas refait.</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
}
function apSetMode(v){
  state._autopilot = v; if(typeof dbRef !== 'undefined' && dbRef) dbRef.child('_autopilot').set(v).catch(function(){});
  const ov = document.getElementById('ap-set'); if(ov) ov.remove(); openAutopilotSettings();
  if(typeof showToast === 'function') showToast(v === 'auto' ? 'Pilote automatique activé' : v === 'suggest' ? 'Pilote : ajustements proposés seulement' : 'Pilote automatique désactivé', '🤖');
}
// le serveur a modifié l'état cette nuit (pilote, historique Strava) : rechargé au retour sur l'app, avant toute écriture
async function apRefreshIfServerChanged(){
  try {
    if(typeof dbRef === 'undefined' || !dbRef || (typeof _prepView !== 'undefined' && _prepView)) return false;
    const rev = (await dbRef.child('_server_rev').once('value')).val();
    if(!rev || rev === state._server_rev) return false;
    const snap = await dbRef.once('value'); if(!snap.val()) return false;
    state = snap.val(); if(typeof syncPlanCompat === 'function') syncPlanCompat();
    if(typeof prHistoryChanged === 'function') prHistoryChanged();
    if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
    try { renderHome(); } catch(e) {}
    return true;
  } catch(e) { return false; }
}
if(typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'visible' && typeof firebaseReady !== 'undefined' && firebaseReady) apRefreshIfServerChanged();
});
function _apCss(){
  if(typeof document === 'undefined' || document.getElementById('ap-css')) return;
  const st = document.createElement('style'); st.id = 'ap-css';
  st.textContent = '.ap-card{margin-top:10px;border:1.5px solid #C7D2FE;background:linear-gradient(180deg,#EEF2FF,#F8FAFF);border-radius:14px;padding:11px 12px;}.ap-card.off{border-color:#E2E8F0;background:#F8FAFC;}'
    + '.ap-h{font-size:13px;font-weight:800;color:#312E81;margin:0;}.ap-card.off .ap-h{color:#475569;font-weight:700;}'
    + '.ap-card ul{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:7px;}.ap-card li{display:flex;flex-direction:column;gap:1px;font-size:12.5px;color:#1E293B;}'
    + '.ap-ch{color:#334155;}.ap-ch s{color:#94A3B8;}.ap-ch em{font-style:normal;font-weight:800;color:#3730A3;}.ap-why{font-size:11.5px;color:#64748B;line-height:1.35;}'
    + '.ap-undo{margin-top:9px;width:100%;padding:9px;border:1.5px solid #A5B4FC;border-radius:11px;background:#fff;color:#3730A3;font-weight:800;font-size:12.5px;cursor:pointer;font-family:inherit;}.ap-undo.go{background:#4F46E5;border-color:#4F46E5;color:#fff;}'
    + '.ap-head{flex-shrink:0;color:#fff;padding:16px;border-radius:24px 24px 0 0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;background:linear-gradient(135deg,#312E81,#4F46E5);}'
    + '.ap-eb{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.75;margin:0;}.ap-title{font-size:20px;font-weight:900;margin:2px 0;}.ap-sub{font-size:12.5px;opacity:.85;margin:0;}'
    + '.ap-x{background:rgba(255,255,255,.18);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;flex-shrink:0;}'
    + '.ap-opt{display:flex;flex-direction:column;gap:2px;text-align:left;border:1.5px solid #E2E8F0;background:#fff;border-radius:14px;padding:11px 12px;cursor:pointer;font-family:inherit;}.ap-opt b{font-size:14px;color:#0F172A;}.ap-opt span{font-size:12px;color:#64748B;line-height:1.4;}'
    + '.ap-opt.on{border-color:#6366F1;background:#EEF2FF;}.ap-opt.on b{color:#312E81;}';
  document.head.appendChild(st);
}
