// Diagnostic (chargé juste après theme.js) : journal des erreurs JavaScript survenues sur ce téléphone (20 au plus, sans
// doublon : compteur + dernière fois, localStorage pm_errors) et temps de démarrage (jusqu'au 1er affichage de l'accueil,
// 10 derniers, pm_boot). Compte › « 🩺 Diagnostic » (diagOpen) : version, démarrage, erreurs, copier / effacer.
const DIAG_ERR = 'pm_errors', DIAG_BOOT = 'pm_boot';
function _diagGet(k){ try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch(e) { return []; } }
function _diagPut(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} }
function diagLog(msg, where){
  msg = String(msg || 'Erreur inconnue').slice(0, 200); where = String(where || '').slice(0, 80);
  const L = _diagGet(DIAG_ERR), now = new Date().toISOString(), x = L.find(function(e){ return e.m === msg && e.w === where; });
  if(x){ x.n = (x.n || 1) + 1; x.at = now; } else L.unshift({ m: msg, w: where, n: 1, at: now, first: now });
  L.sort(function(a, b){ return String(b.at).localeCompare(String(a.at)); });
  _diagPut(DIAG_ERR, L.slice(0, 20));
}
if(typeof window !== 'undefined' && window.addEventListener){
  window.addEventListener('error', function(e){ if(!e || !e.message) return; diagLog(e.message, (String(e.filename || '').split('/').pop().split('?')[0]) + (e.lineno ? ':' + e.lineno : '')); });
  window.addEventListener('unhandledrejection', function(e){ const r = e && e.reason; diagLog('Promesse rejetée : ' + (r && r.message ? r.message : String(r)), ''); });
}
// 1er affichage de l'accueil (appelé par renderHome) : temps depuis le début du chargement de la page
function diagBootDone(){
  if(typeof window === 'undefined' || window._bootMs || !window.performance) return;
  window._bootMs = Math.round(performance.now());
  const B = _diagGet(DIAG_BOOT); B.unshift({ ms: window._bootMs, at: new Date().toISOString() }); _diagPut(DIAG_BOOT, B.slice(0, 10));
}
function _diagVersion(){ const s = Array.prototype.slice.call(document.scripts).map(function(x){ return x.src || ''; }).find(function(x){ return /bundle-\d+/.test(x); }); return s ? (s.match(/bundle-(\d+)/) || [])[1] : 'dev'; }
function diagOpen(){
  const E = _diagGet(DIAG_ERR), B = _diagGet(DIAG_BOOT), mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'dg-modal'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  const v = _diagVersion(), med = B.length ? B.map(function(b){ return b.ms; }).sort(function(a, b){ return a - b; })[Math.floor(B.length / 2)] : null;
  const esc = function(t){ return String(t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const fd = function(iso){ try { return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch(e) { return iso; } };
  ov.innerHTML = '<div class="modal-box" style="max-height:90vh;"><div class="dg-head"><div><p class="dg-eb">Compte</p><p class="dg-title">🩺 Diagnostic</p></div><button class="dg-x" onclick="document.getElementById(\'dg-modal\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body"><div class="dg-body">'
    + '<div class="dg-tiles"><div><b>' + (med != null ? (med / 1000).toFixed(1).replace('.', ',') + ' s' : '—') + '</b><small>démarrage (médiane)</small></div><div><b>' + E.length + '</b><small>erreur' + (E.length > 1 ? 's' : '') + ' récente' + (E.length > 1 ? 's' : '') + '</small></div><div><b>' + esc(v === 'dev' ? 'dev' : new Date(+v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })) + '</b><small>version</small></div></div>'
    + (E.length ? '<ul class="dg-list">' + E.map(function(e){ return '<li><b>' + esc(e.m) + '</b><small>' + (e.w ? esc(e.w) + ' · ' : '') + '×' + (e.n || 1) + ' · ' + fd(e.at) + '</small></li>'; }).join('') + '</ul>' : '<p class="dg-ok">✅ Aucune erreur enregistrée</p>')
    + '<div class="dg-btns"><button type="button" onclick="diagCopy()">📋 Copier</button>' + (E.length ? '<button type="button" onclick="diagClear()">🧹 Effacer</button>' : '') + '</div></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
}
function diagText(){ return JSON.stringify({ version: _diagVersion(), ua: navigator.userAgent, boot: _diagGet(DIAG_BOOT), errors: _diagGet(DIAG_ERR) }, null, 1); }
function diagCopy(){ const t = diagText(); if(navigator.clipboard) navigator.clipboard.writeText(t).then(function(){ if(typeof showToast === 'function') showToast('Diagnostic copié', '🩺'); }).catch(function(){}); }
function diagClear(){ _diagPut(DIAG_ERR, []); const ov = document.getElementById('dg-modal'); if(ov) ov.remove(); diagOpen(); }
