// ─── Compteur d'usage (gardé sur le téléphone, localStorage.pm_use) ───
// Chaque fonction ouverte par un toucher (attribut onclick), chaque onglet (showScreen) et chaque entrée de la recherche est comptée :
// {since, c: {clé: [nombre, dernier jour]}}. Diagnostic › « 📈 Fonctions utilisées » : les plus utilisées et celles jamais ouvertes
// d'après le catalogue de la recherche (SR_ITEMS) → décider quoi garder, simplifier ou retirer. Rien n'est envoyé au serveur.
const USE_KEY = 'pm_use';
// clé d'une entrée du catalogue : fonction ouverte, onglet, ou onglet de Statistiques
const USE_ALIAS = { forme: 'statsTab:forme', zones: 'statsTab:train', fatigue: 'statsTab:forme', volume: 'statsTab:train', hist: 'statsTab:hist',
  fcmax: 'openFcMaxEdit', connect: 'screen:compte', home: 'screen:home', plan: 'screen:plan', renfo: 'screen:renfo', stats: 'screen:stats', coach: 'screen:coach', compte: 'screen:compte' };
function usageKeyOf(x){ return x ? (USE_ALIAS[x.id] || x.fn || 'sr:' + x.id) : null; }
// appels d'un attribut onclick → clés comptées (fonctions globales seulement ; statsTab('x') → statsTab:x ; showScreen compté à part)
const USE_SKIP = /^(if|for|while|switch|return|function|typeof|new|showScreen|event|this|document|window|Math|JSON|String|Number|parseInt|parseFloat|setTimeout|clearTimeout|Object|Array|Date|alert|confirm|encodeURIComponent)$/;
function usageKeysOf(code, isFn){
  const out = [], seen = {}, re = /(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(\s*(?:'([\w-]+)')?/g;
  let m; code = String(code || '');
  while((m = re.exec(code))){
    const n = m[2]; if(USE_SKIP.test(n) || (isFn && !isFn(n))) continue;
    const k = n === 'statsTab' && m[3] ? 'statsTab:' + m[3] : n;
    if(!seen[k]){ seen[k] = 1; out.push(k); }
  }
  return out;
}
function _useLs(){ try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch(e) { return null; } }
function usageGet(){ const L = _useLs(); let d = null; try { d = L ? JSON.parse(L.getItem(USE_KEY) || 'null') : null; } catch(e) {} return d && d.c ? d : { since: null, c: {} }; }
function usageCount(key, today){
  if(!key) return;
  const L = _useLs(); if(!L) return;
  const d = usageGet(); today = today || new Date().toISOString().slice(0, 10);
  if(!d.since) d.since = today;
  const e = d.c[key] || [0, null]; d.c[key] = [e[0] + 1, today];
  try { L.setItem(USE_KEY, JSON.stringify(d)); } catch(e2) {}
}
// rapport : entrées du catalogue utilisées (triées) et jamais ouvertes depuis le début du relevé
function usageReport(items, d){
  d = d || { c: {} };
  const rows = (items || []).map(function(x){ const k = usageKeyOf(x), e = (d.c || {})[k] || [0, null]; return { id: x.id, ic: x.ic, t: x.t, g: x.g, k: k, n: e[0], last: e[1] }; });
  return { since: d.since || null, used: rows.filter(function(r){ return r.n > 0; }).sort(function(a, b){ return b.n - a.n || a.t.localeCompare(b.t); }),
    never: rows.filter(function(r){ return !r.n; }) };
}
function usageOpen(){
  const R = usageReport(typeof searchItems === 'function' ? searchItems() : [], usageGet());
  const esc = function(t){ return String(t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const fd = function(iso){ try { return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); } catch(e) { return iso; } };
  const row = function(r, right){ return '<li><span>' + r.ic + ' ' + esc(r.t) + '<small>' + esc(r.g) + '</small></span><b>' + right + '</b></li>'; };
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'use-modal'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:90vh;"><div class="dg-head"><div><p class="dg-eb">Diagnostic</p><p class="dg-title">📈 Fonctions utilisées</p></div><button class="dg-x" onclick="document.getElementById(\'use-modal\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body"><div class="dg-body">'
    + '<div class="dg-tiles"><div><b>' + R.used.length + '</b><small>utilisées</small></div><div><b>' + R.never.length + '</b><small>jamais ouvertes</small></div><div><b>' + (R.since ? fd(R.since) : '—') + '</b><small>relevé depuis</small></div></div>'
    + (R.used.length ? '<p class="use-h">Les plus utilisées</p><ul class="dg-list use-list">' + R.used.slice(0, 12).map(function(r){ return row(r, '×' + r.n); }).join('') + '</ul>' : '')
    + (R.never.length ? '<p class="use-h">Jamais ouvertes</p><ul class="dg-list use-list">' + R.never.map(function(r){ return row(r, '—'); }).join('') + '</ul>' : '<p class="dg-ok">Tout a déjà servi</p>')
    + '</div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  if(!document.getElementById('use-css')){ const s = document.createElement('style'); s.id = 'use-css';
    s.textContent = '.use-h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted-2,#64748b);margin:14px 0 6px}.use-list li{display:flex;justify-content:space-between;align-items:center;gap:10px}.use-list li span{min-width:0}.use-list li small{display:block}.use-list li b{flex:none;font-variant-numeric:tabular-nums}';
    document.head.appendChild(s); }
  mc.appendChild(ov);
}
// relevé : touchers sur un élément à onclick (phase de capture, avant que l'écran ne change) et onglets
if(typeof window !== 'undefined' && typeof document !== 'undefined' && document.addEventListener){
  document.addEventListener('click', function(e){
    try {
      const el = e.target && e.target.closest ? e.target.closest('[onclick]') : null; if(!el) return;
      usageKeysOf(el.getAttribute('onclick'), function(n){ return typeof window[n] === 'function'; }).forEach(function(k){ usageCount(k); });
    } catch(e2) { diagSilent(e2, 'usage:click'); }
  }, true);
  if(typeof showScreen === 'function'){
    const _useOrig = showScreen;
    showScreen = function(name){ try { usageCount('screen:' + name); } catch(e) { diagSilent(e, 'usage:showScreen'); } return _useOrig.apply(this, arguments); };
  }
}
