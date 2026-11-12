// health.js — « Santé de l'app » (compte admin) : chaque branchement et chaque tâche automatique, avec la date de son dernier
// succès, pour qu'aucune panne ne reste silencieuse (jeton Strava / WHOOP expiré, notifications coupées, pilote de nuit
// arrêté, calendrier plus lu, enregistrements refusés…).
// Moteur partagé app + serveur : healthStatus(st, H, nowMs) lit l'état et les relevés du serveur (_health/<clé> = { at, ok,
// lastOk, lastErr, err, msg }, écrits par healthMark dans helpers.js) ; healthLocalItems(L, nowMs) = ce que seul le téléphone
// sait (écritures refusées par la base, écritures en attente, erreurs JavaScript). Statuts : ok / warn / bad / off.
// Côté serveur : healthWatch (2 fois par jour) envoie une notification quand un point passe en panne (`/?action=health`).
const HL_H = 3600000;
const _hlAge = function(t, now){ const x = typeof t === 'number' ? t : t ? Date.parse(t) : NaN; return isFinite(x) ? Math.max(0, now - x) : null; };
function hlAgo(ms){
  if(ms == null) return 'jamais';
  const m = Math.round(ms / 60000);
  if(m < 2) return 'à l\'instant';
  if(m < 60) return 'il y a ' + m + ' min';
  const h = Math.round(ms / HL_H);
  if(h < 48) return 'il y a ' + h + ' h';
  return 'il y a ' + Math.round(ms / (24 * HL_H)) + ' j';
}
// préférence de notification (état de l'app : _prefs en texte JSON ou objet ; absente = activée)
function _hlPref(st, k){ let p = st && st._prefs; if(typeof p === 'string'){ try { p = JSON.parse(p); } catch(e) { p = null; } } return !(p && p[k] === false); }

function healthStatus(st, H, nowMs){
  st = st || {}; H = H || {}; const now = nowMs || Date.now(), out = [];
  const add = function(key, icon, label, status, detail, fix){ out.push({ key: key, icon: icon, label: label, status: status, detail: detail, fix: fix || null }); };
  const rec = function(k){ const r = H[k]; return r && typeof r === 'object' ? r : null; };
  // dernier relevé : succès / échec, avec l'âge du dernier succès
  const lastOkAge = function(r){ return r ? _hlAge(r.lastOk || (r.ok ? r.at : null), now) : null; };
  const failing = function(r){ return !!(r && r.ok === false && (!r.lastOk || (r.lastErr || r.at) > r.lastOk)); };

  // Strava
  const sv = rec('strava');
  if(!st.strava_token) add('strava', '🟠', 'Strava', 'off', 'Non connecté', 'strava');
  else if(failing(sv)) add('strava', '🟠', 'Strava', 'bad', 'Accès refusé' + (sv.err ? ' (' + sv.err + ')' : '') + ' · reconnecte Strava', 'strava');
  else {
    const a = sv ? lastOkAge(sv) : _hlAge((st._strava_hist || {}).at, now);
    add('strava', '🟠', 'Strava', a == null || a <= 48 * HL_H ? 'ok' : 'warn', a == null ? 'Connecté' : 'Dernier accès ' + hlAgo(a));
  }
  // WHOOP
  const wv = rec('whoop'), wd = st.whoop_data || {};
  if(!st.whoop_token || !st.whoop_token.access_token && !st.whoop_token.refresh_token) add('whoop', '⌚', 'WHOOP', 'off', 'Non connecté', 'whoop');
  else {
    const a = _hlAge(wd.updatedAt, now);
    if(failing(wv) && (a == null || a > 3 * HL_H)) add('whoop', '⌚', 'WHOOP', 'bad', 'Synchro en échec' + (wv.err ? ' (' + wv.err + ')' : '') + ' · données ' + hlAgo(a), 'whoop');
    else add('whoop', '⌚', 'WHOOP', a == null || a > 24 * HL_H ? 'bad' : a > 3 * HL_H ? 'warn' : 'ok', 'Données ' + hlAgo(a), a == null || a > 24 * HL_H ? 'whoop' : null);
  }
  // Notifications
  const pv = rec('push');
  if(!st._push_sub) add('push', '🔔', 'Notifications', 'bad', 'Pas d\'abonnement sur ce téléphone', 'push');
  else if(failing(pv)) add('push', '🔔', 'Notifications', 'bad', 'Envoi refusé' + (pv.err ? ' (' + pv.err + ')' : ''), 'push');
  else { const a = lastOkAge(pv); add('push', '🔔', 'Notifications', a != null && a > 72 * HL_H ? 'warn' : 'ok', a == null ? 'Abonné' : 'Dernière envoyée ' + hlAgo(a)); }
  // Brief du matin
  const bv = rec('brief');
  if(!_hlPref(st, 'notif_brief_matin')) add('brief', '🌅', 'Brief du matin', 'off', 'Désactivé');
  else if(failing(bv)) add('brief', '🌅', 'Brief du matin', 'bad', 'Échec' + (bv.err ? ' : ' + bv.err : ''));
  else { const a = lastOkAge(bv); add('brief', '🌅', 'Brief du matin', a != null && a > 50 * HL_H ? 'warn' : 'ok', a == null ? 'Pas encore relevé' : 'Dernier ' + hlAgo(a)); }
  // Pilote de nuit (4h15)
  const av = rec('autopilot'), apLast = st._autopilot_last || {};
  if((st._autopilot || 'auto') === 'off') add('autopilot', '🤖', 'Pilote de nuit', 'off', 'Désactivé');
  else if(failing(av)) add('autopilot', '🤖', 'Pilote de nuit', 'bad', 'Échec' + (av.err ? ' : ' + av.err : ''));
  else {
    const a = av ? lastOkAge(av) : _hlAge(apLast.at, now);
    add('autopilot', '🤖', 'Pilote de nuit', a == null ? 'warn' : a > 30 * HL_H ? 'bad' : 'ok', a == null ? 'Pas encore lancé' : 'Dernier passage ' + hlAgo(a));
  }
  // Validation automatique (toutes les 15 min, 6h-23h45)
  const vv = rec('autoval');
  if(st._autoval === 'off') add('autoval', '✅', 'Validation automatique', 'off', 'Désactivée');
  else if(failing(vv)) add('autoval', '✅', 'Validation automatique', 'bad', 'Échec' + (vv.err ? ' : ' + vv.err : ''));
  else { const a = lastOkAge(vv); add('autoval', '✅', 'Validation automatique', a == null ? 'warn' : a > 8 * HL_H ? 'bad' : 'ok', a == null ? 'Pas encore lancée' : 'Dernier passage ' + hlAgo(a)); }
  // Calendrier (lu par l'agenda abonné)
  const cv = rec('calendar');
  if(!st._cal_token && !cv) add('calendar', '📅', 'Calendrier', 'off', 'Pas d\'abonnement', 'calendar');
  else {
    const a = lastOkAge(cv);
    // pas encore de relevé (juste après la mise en service, ou abonnement à refaire) : à surveiller, pas une panne
    add('calendar', '📅', 'Calendrier', a == null ? 'warn' : a > 72 * HL_H ? 'bad' : a > 26 * HL_H ? 'warn' : 'ok',
      a == null ? 'Pas encore lu par ton agenda' : 'Lu par ton agenda ' + hlAgo(a) + (cv && cv.msg ? ' · ' + cv.msg : ''), a == null || a > 72 * HL_H ? 'calendar' : null);
  }
  return out;
}
// ce que seul le téléphone sait : L = { syncErr: [{at, m, keys}], pending: {n, at}, jsErr: [{at, m, n}] }
function healthLocalItems(L, nowMs){
  L = L || {}; const now = nowMs || Date.now(), out = [];
  const se = (L.syncErr || []).filter(function(e){ const a = _hlAge(e.at, now); return a != null && a <= 7 * 24 * HL_H; });
  const pend = L.pending && L.pending.n ? L.pending : null, pa = pend ? _hlAge(pend.at, now) : null;
  if(se.length) out.push({ key: 'save', icon: '💾', label: 'Enregistrement', status: 'bad', detail: se.length + ' refusé' + (se.length > 1 ? 's' : '') + ' en 7 j · ' + String(se[0].m || '').slice(0, 60) });
  else if(pend && pa > 10 * 60000) out.push({ key: 'save', icon: '💾', label: 'Enregistrement', status: 'warn', detail: pend.n + ' modification' + (pend.n > 1 ? 's' : '') + ' en attente depuis ' + hlAgo(pa).replace('il y a ', '') });
  else out.push({ key: 'save', icon: '💾', label: 'Enregistrement', status: 'ok', detail: 'Tout est enregistré' });
  const je = (L.jsErr || []).filter(function(e){ const a = _hlAge(e.at, now); return a != null && a <= 7 * 24 * HL_H; });
  const n = je.reduce(function(t, e){ return t + (e.n || 1); }, 0);
  out.push({ key: 'js', icon: '🩺', label: 'Erreurs de l\'app', status: je.length ? 'warn' : 'ok', detail: je.length ? n + ' en 7 j · ' + String(je[0].m || '').slice(0, 60) : 'Aucune en 7 j', fix: je.length ? 'diag' : null });
  return out;
}
const HL_RANK = { bad: 3, warn: 2, ok: 1, off: 0 };
function healthSummary(items){
  const bad = items.filter(function(i){ return i.status === 'bad'; }), warn = items.filter(function(i){ return i.status === 'warn'; });
  return { worst: bad.length ? 'bad' : warn.length ? 'warn' : 'ok', bad: bad.length, warn: warn.length,
    text: bad.length ? bad.length + ' panne' + (bad.length > 1 ? 's' : '') + (warn.length ? ' · ' + warn.length + ' à surveiller' : '') : warn.length ? warn.length + ' à surveiller' : 'Tout fonctionne' };
}
// notification du serveur : une ligne par panne, envoyée quand la liste change (ou au plus tous les 3 jours)
function healthAlertText(items){
  const bad = items.filter(function(i){ return i.status === 'bad'; });
  if(!bad.length) return null;
  return { keys: bad.map(function(i){ return i.key; }).sort().join(','), title: '⚠️ Santé de l\'app : ' + bad.length + ' panne' + (bad.length > 1 ? 's' : ''),
    body: bad.map(function(i){ return i.label + ' : ' + i.detail; }).join(' · ').slice(0, 180) };
}

// ─── Écran (compte admin) : Compte › « 🛰️ Santé de l'app » ───
function _hlLocal(){
  const get = function(k){ try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch(e) { return []; } };
  let pend = null;
  try { const P = typeof syncPendingGet === 'function' ? syncPendingGet() : null; if(P && P.up && Object.keys(P.up).length) pend = { n: Object.keys(P.up).length, at: P.at }; } catch(e) { diagSilent(e, 'health:_hlLocal'); }
  const js = get('pm_errors').filter(function(e){ return !(typeof diagNoise === 'function' && diagNoise(e && e.m)); });   // bruit hors de l'app écarté (diag.js)
  return { syncErr: get('pm_sync_err'), pending: pend, jsErr: js };
}
const _hlEsc = function(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
const HL_FIX = { strava: ['Reconnecter', 'healthFix(\'strava\')'], whoop: ['Reconnecter', 'healthFix(\'whoop\')'], push: ['Réactiver', 'healthFix(\'push\')'],
  calendar: ['Ouvrir', 'healthFix(\'calendar\')'], diag: ['Voir', 'healthFix(\'diag\')'] };
function _hlCss(){
  if(typeof document === 'undefined' || document.getElementById('hl-css')) return;
  const s = document.createElement('style'); s.id = 'hl-css';
  s.textContent = '.hl-sum{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;font-weight:800;font-size:15px;}'
    + '.hl-sum.ok{background:#ECFDF3;color:#166534;}.hl-sum.warn{background:#FFF7ED;color:#9A3412;}.hl-sum.bad{background:#FEF2F2;color:#991B1B;}'
    + '.hl-list{display:flex;flex-direction:column;gap:8px;}.hl-it{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:10px 12px;}'
    + '.hl-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}.hl-dot.ok{background:#16A34A;}.hl-dot.warn{background:#F59E0B;}.hl-dot.bad{background:#DC2626;}.hl-dot.off{background:#CBD5E1;}'
    + '.hl-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}.hl-tx b{font-size:14px;color:#0F172A;}.hl-tx span{font-size:12px;color:#64748B;overflow-wrap:anywhere;}'
    + '.hl-fx{flex-shrink:0;border:1.5px solid #1B4FD8;background:#fff;color:#1B4FD8;border-radius:10px;padding:6px 10px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;}'
    + '.hl-ft{display:flex;gap:8px;}.hl-ft button{flex:1;padding:11px;border-radius:12px;border:1px solid #CBD5E1;background:#fff;font:inherit;font-weight:700;cursor:pointer;}';
  document.head.appendChild(s);
}
function healthRender(items, err){
  const box = document.getElementById('hl-body'); if(!box) return;
  const S = healthSummary(items), order = items.slice().sort(function(a, b){ return HL_RANK[b.status] - HL_RANK[a.status]; });
  box.innerHTML = '<div class="hl-sum ' + S.worst + '">' + (S.worst === 'ok' ? '✅' : S.worst === 'warn' ? '🟠' : '⚠️') + ' ' + _hlEsc(S.text) + '</div>'
    + (err ? '<p style="margin:0;font-size:12px;color:#B45309;">Relevés du serveur indisponibles (' + _hlEsc(err) + ') : état du téléphone seulement.</p>' : '')
    + '<div class="hl-list">' + order.map(function(i){
      const f = i.fix && HL_FIX[i.fix];
      return '<div class="hl-it" data-k="' + i.key + '"><i class="hl-dot ' + i.status + '"></i><span class="hl-tx"><b>' + i.icon + ' ' + _hlEsc(i.label) + '</b><span>' + _hlEsc(i.detail) + '</span></span>'
        + (f && i.status !== 'ok' ? '<button type="button" class="hl-fx" onclick="' + f[1] + '">' + f[0] + '</button>' : '') + '</div>';
    }).join('') + '</div>';
  const sub = document.getElementById('health-sub'); if(sub) sub.textContent = S.text;
}
async function openHealth(){
  if(typeof isAdmin === 'function' && !isAdmin()) return;
  _hlCss();
  const mc = document.getElementById('modal-container'); if(!mc) return;
  const old = document.getElementById('hl-modal'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'hl-modal'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:90vh;"><div style="flex-shrink:0;padding:16px;border-radius:24px 24px 0 0;color:#fff;background:linear-gradient(135deg,#0F766E,#14B8A6);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
    + '<div><p style="font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.8;margin:0;">Compte</p><p style="font-size:20px;font-weight:900;margin:2px 0;">🛰️ Santé de l\'app</p><p style="font-size:12.5px;margin:0;opacity:.9;">Branchements, tâches automatiques, enregistrements</p></div>'
    + '<button onclick="document.getElementById(\'hl-modal\').remove()" aria-label="Fermer" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;flex-shrink:0;">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F6FAF9;"><div style="padding:14px 16px 24px;display:flex;flex-direction:column;gap:12px;">'
    + '<div id="hl-body" style="display:flex;flex-direction:column;gap:12px;"><p style="margin:0;color:#475569;">⏳ Vérification…</p></div>'
    + '<div class="hl-ft"><button type="button" onclick="openHealth()">↻ Actualiser</button><button type="button" onclick="healthFix(\'diag\')">🩺 Diagnostic</button></div>'
    + '</div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
  let items = null, err = null;
  try {
    const token = await firebase.auth().currentUser.getIdToken();
    const r = await fetch(FUNCTIONS_BASE + '/appHealth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: '{}' });
    const j = await r.json();
    if(!r.ok || !j.success) throw new Error(j.error || 'HTTP ' + r.status);
    items = j.items;
  } catch(e) { err = e.message; items = healthStatus(state, {}, Date.now()); }
  healthRender(items.concat(healthLocalItems(_hlLocal(), Date.now())), err);
}
function healthFix(k){
  const close = function(){ const m = document.getElementById('hl-modal'); if(m) m.remove(); };
  if(k === 'diag'){ close(); if(typeof diagOpen === 'function') diagOpen(); return; }
  if(k === 'calendar'){ close(); if(typeof showCalendarUrl === 'function') showCalendarUrl(); return; }
  if(k === 'whoop'){ close(); if(typeof connectWhoop === 'function') connectWhoop(); return; }
  if(k === 'strava'){ close(); if(typeof adminConnectStrava === 'function') adminConnectStrava(); return; }
  if(k === 'push'){ if(typeof initNotifications === 'function') Promise.resolve(initNotifications()).then(function(){ setTimeout(openHealth, 1500); }); return; }
}
