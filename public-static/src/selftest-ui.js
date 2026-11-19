// ─── « Tester l'app » (à la demande, groupe selftest : Diagnostic, recherche) ───
// En 15 s : base de données (écriture + lecture), copie hors ligne, service worker, notifications, son, voix de l'iPhone, voix Google,
// micro, dictée, branchements du serveur (Strava, WHOOP, brief…) → liste ✓ / ⚠️ / ✗ avec ce qu'il faut faire.
// « 📤 Envoyer le diagnostic » : rapport complet (version, erreurs, démarrage, test, taille des données, fonctions utilisées) en un geste
// (feuille de partage de l'iPhone → Mail, Messages, Notes ; sinon copié).
const ST_LABEL = { ok: '✓', warn: '⚠️', bad: '✗', off: '–' };
// verdict d'ensemble d'une liste de résultats {k, t, s: ok|warn|bad|off, d, fix}
function stVerdict(R){
  const n = { ok: 0, warn: 0, bad: 0, off: 0 }; (R || []).forEach(function(r){ n[r.s] = (n[r.s] || 0) + 1; });
  return { n: n, s: n.bad ? 'bad' : n.warn ? 'warn' : 'ok', t: n.bad ? n.bad + ' problème' + (n.bad > 1 ? 's' : '') : n.warn ? n.warn + ' point' + (n.warn > 1 ? 's' : '') + ' à surveiller' : 'Tout fonctionne' };
}
// rapport texte à envoyer (une ligne par résultat, puis les données brutes)
function stReportText(o){
  o = o || {};
  const L = ['Plan Marathon · diagnostic du ' + (o.at || ''), 'Version : ' + (o.version || '?') + ' · ' + (o.ua || '')];
  if(o.results && o.results.length){ const V = stVerdict(o.results); L.push('', 'Test : ' + V.t); o.results.forEach(function(r){ L.push(ST_LABEL[r.s] + ' ' + r.t + (r.d ? ' — ' + r.d : '')); }); }
  if(o.sizes) L.push('', 'Données : ' + o.sizes.totalKo + ' Ko · ' + o.sizes.top.map(function(x){ return x.k + ' ' + x.ko + ' Ko'; }).join(', '));
  if(o.usage) L.push('', 'Jamais ouvertes : ' + (o.usage.never.map(function(r){ return r.t; }).join(', ') || 'aucune'));
  if(o.errors && o.errors.length){ L.push('', 'Erreurs :'); o.errors.slice(0, 20).forEach(function(e){ L.push('· ' + e.m + (e.w ? ' (' + e.w + ')' : '') + ' ×' + (e.n || 1) + ' · ' + e.at); }); }
  if(o.raw) L.push('', o.raw);
  return L.join('\n');
}
function _stWithin(p, ms){ return Promise.race([p, new Promise(function(_, ko){ setTimeout(function(){ ko(new Error('pas de réponse en ' + Math.round(ms / 1000) + ' s')); }, ms); })]); }
async function _stRun(tap){
  const R = [], add = function(k, t, s, d, fix){ R.push({ k: k, t: t, s: s, d: d || '', fix: fix || '' }); };
  const admin = typeof isAdmin === 'function' && isAdmin();
  // 1. base de données : aller-retour réel
  try {
    const t0 = Date.now(), v = Date.now();
    await _stWithin(dbRef.child('_selftest_at').set(v), 8000);
    const back = (await _stWithin(dbRef.child('_selftest_at').once('value'), 8000)).val();
    add('db', 'Base de données', back === v ? 'ok' : 'bad', back === v ? (Date.now() - t0) + ' ms' : 'valeur relue différente', back === v ? '' : 'Recharge l\'app');
  } catch(e) { add('db', 'Base de données', 'bad', e.message, navigator.onLine === false ? 'Pas de réseau' : 'Recharge l\'app'); }
  // 2. copie hors ligne + espace du téléphone
  try {
    const L = localStorage, k = 'pm_state_' + (typeof currentUserId !== 'undefined' ? currentUserId : ''), c = L.getItem(k);
    const sz = typeof stateSizes === 'function' ? stateSizes(state) : null;
    if(!c) add('offline', 'Copie hors ligne', 'bad', 'absente' + (sz ? ' · données ' + sz.totalKo + ' Ko' : ''), 'Stockage du téléphone plein ?');
    else add('offline', 'Copie hors ligne', sz && sz.totalKo > 3500 ? 'warn' : 'ok', Math.round(c.length / 1024) + ' Ko', sz && sz.totalKo > 3500 ? 'Données lourdes' : '');
  } catch(e) { add('offline', 'Copie hors ligne', 'bad', e.message); }
  try {
    const reg = navigator.serviceWorker ? await _stWithin(navigator.serviceWorker.getRegistration(), 4000) : null;
    add('sw', 'App gardée sur le téléphone', reg && reg.active ? 'ok' : 'warn', reg && reg.active ? 'service worker actif' : 'service worker absent', reg ? '' : 'Ajoute l\'app à l\'écran d\'accueil');
  } catch(e) { add('sw', 'App gardée sur le téléphone', 'warn', e.message); }
  // 3. notifications
  try {
    const perm = typeof Notification !== 'undefined' ? Notification.permission : 'absent';
    let sub = null; try { const reg = navigator.serviceWorker ? await _stWithin(navigator.serviceWorker.ready, 3000) : null; sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null; } catch(e) {}
    add('push', 'Notifications', perm === 'granted' && sub ? 'ok' : perm === 'denied' ? 'bad' : 'warn', perm === 'granted' ? (sub ? 'actives' : 'autorisées, pas abonnées') : perm === 'denied' ? 'refusées' : 'pas activées', perm === 'granted' && sub ? '' : perm === 'denied' ? 'Réglages iPhone › Notifications' : 'Active-les depuis l\'accueil');
  } catch(e) { add('push', 'Notifications', 'warn', e.message); }
  // 4. son (débloqué par le toucher du bouton)
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) add('audio', 'Son de l\'app', 'bad', 'non pris en charge');
    else {
      const ac = tap || new AC(); if(ac.state === 'suspended') await _stWithin(ac.resume(), 2000);
      const b = ac.createBuffer(1, Math.round(ac.sampleRate * 0.05), ac.sampleRate), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start();
      add('audio', 'Son de l\'app', ac.state === 'running' ? 'ok' : 'warn', ac.state === 'running' ? 'prêt' : 'en pause (' + ac.state + ')', ac.state === 'running' ? '' : 'Vérifie le mode silencieux');
    }
  } catch(e) { add('audio', 'Son de l\'app', 'warn', e.message); }
  // 5. voix de l'iPhone
  try {
    const ss = window.speechSynthesis;
    let V = ss ? ss.getVoices() : [];
    if(ss && !V.length) V = await new Promise(function(ok){ const t = setTimeout(function(){ ok(ss.getVoices()); }, 1500); ss.onvoiceschanged = function(){ clearTimeout(t); ok(ss.getVoices()); }; });
    const fr = (V || []).filter(function(v){ return /^fr/i.test(v.lang); });
    add('tts', 'Voix de l\'iPhone', !ss ? 'bad' : fr.length ? 'ok' : 'warn', !ss ? 'non prise en charge' : fr.length + ' voix française' + (fr.length > 1 ? 's' : ''), fr.length ? '' : 'Réglages › Accessibilité › Contenu énoncé');
  } catch(e) { add('tts', 'Voix de l\'iPhone', 'warn', e.message); }
  // 6. dictée et micro
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  add('stt', 'Dictée', SR ? 'ok' : 'warn', SR ? 'disponible' : 'non prise en charge', SR ? '' : 'La voix Google prend le relais');
  try {
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) add('mic', 'Micro', 'bad', 'non pris en charge');
    else { const ms = await _stWithin(navigator.mediaDevices.getUserMedia({ audio: true }), 8000); ms.getTracks().forEach(function(t){ t.stop(); }); add('mic', 'Micro', 'ok', 'autorisé'); }
  } catch(e) { add('mic', 'Micro', e && e.name === 'NotAllowedError' ? 'bad' : 'warn', e && e.name === 'NotAllowedError' ? 'refusé' : e.message, 'Réglages iPhone › Safari › Micro'); }
  // 7. serveur (compte admin) : voix Google et branchements
  if(admin){
    try {
      const t0 = Date.now(), r = await _stWithin(fetch(FUNCTIONS_BASE + '/coachTts', { method: 'POST', headers: await authHeaders(false), body: JSON.stringify({ text: 'Test.' }) }), 8000);
      const j = await r.json().catch(function(){ return {}; });
      add('gtts', 'Voix Google du Coach', j.audio ? 'ok' : 'warn', j.audio ? (Date.now() - t0) + ' ms' : (j.reason || 'HTTP ' + r.status), j.audio ? '' : 'La voix de l\'iPhone prend le relais');
    } catch(e) { add('gtts', 'Voix Google du Coach', 'warn', e.message); }
    try {
      const r = await _stWithin(fetch(FUNCTIONS_BASE + '/appHealth', { method: 'POST', headers: await authHeaders(false), body: '{}' }), 10000);
      const j = await r.json();
      if(!r.ok || !j.success) throw new Error(j.error || 'HTTP ' + r.status);
      (j.items || []).forEach(function(x){ if(x.status !== 'off') add('h_' + x.key, x.label || x.key, x.status === 'ok' ? 'ok' : x.status === 'bad' ? 'bad' : 'warn', x.detail || '', x.status === 'ok' ? '' : 'Voir Santé de l\'app'); });
    } catch(e) { add('server', 'Serveur', 'bad', e.message, 'Réessaie dans un instant'); }
  }
  return R;
}
let _stLast = null;
function _stCss(){
  if(document.getElementById('st-css')) return;
  const s = document.createElement('style'); s.id = 'st-css';
  s.textContent = '.st-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.st-list li{display:flex;gap:10px;align-items:flex-start;background:var(--card,#fff);border:1px solid var(--line,#e2e8f0);border-radius:12px;padding:9px 11px}'
    + '.st-list li b{flex:none;width:22px;text-align:center}.st-list li span{flex:1;min-width:0;font-size:13.5px;font-weight:700}.st-list li small{display:block;font-weight:500;color:var(--muted-2,#64748b);font-size:12px}'
    + '.st-list li[data-s=bad]{border-color:#FCA5A5;background:#FEF2F2}.st-list li[data-s=warn]{border-color:#FCD34D;background:#FFFBEB}.st-sum{font-size:15px;font-weight:800;margin:0 0 10px}.st-sum[data-s=bad]{color:#B91C1C}.st-sum[data-s=warn]{color:#B45309}.st-sum[data-s=ok]{color:#15803D}';
  document.head.appendChild(s);
}
async function openSelfTest(){
  _stCss();
  const old = document.getElementById('st-modal'); if(old) old.remove();
  // son débloqué tout de suite, dans le toucher (iOS refuse plus tard)
  let tap = null; try { const AC = window.AudioContext || window.webkitAudioContext; if(AC){ tap = new AC(); tap.resume(); } } catch(e) {}
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'st-modal'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:90vh;"><div class="dg-head"><div><p class="dg-eb">Diagnostic</p><p class="dg-title">🧪 Tester l\'app</p></div><button class="dg-x" onclick="document.getElementById(\'st-modal\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body"><div class="dg-body" id="st-body"><p class="st-sum">⏳ Test en cours…</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
  const R = await _stRun(tap);
  try { if(tap) tap.close(); } catch(e) {}
  _stLast = { at: new Date().toISOString(), results: R };
  const body = document.getElementById('st-body'); if(!body) return;
  const V = stVerdict(R), esc = function(t){ return String(t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const ord = { bad: 0, warn: 1, ok: 2, off: 3 };
  body.innerHTML = '<p class="st-sum" data-s="' + V.s + '">' + (V.s === 'ok' ? '✅ ' : V.s === 'warn' ? '⚠️ ' : '❌ ') + esc(V.t) + '</p>'
    + '<ul class="st-list">' + R.slice().sort(function(a, b){ return ord[a.s] - ord[b.s]; }).map(function(r){ return '<li data-s="' + r.s + '"><b>' + ST_LABEL[r.s] + '</b><span>' + esc(r.t) + '<small>' + esc(r.d) + (r.fix ? ' · ' + esc(r.fix) : '') + '</small></span></li>'; }).join('') + '</ul>'
    + '<div class="dg-btns"><button type="button" onclick="openSelfTest()">↻ Refaire</button><button type="button" onclick="diagSend()">📤 Envoyer le diagnostic</button></div>';
}
// rapport complet en un geste : feuille de partage (iPhone) sinon copie
async function diagSend(){
  let E = [], B = []; try { E = JSON.parse(localStorage.getItem('pm_errors') || '[]'); B = JSON.parse(localStorage.getItem('pm_boot') || '[]'); } catch(e) {}
  const txt = stReportText({ at: new Date().toLocaleString('fr-FR'), version: typeof _diagVersion === 'function' ? _diagVersion() : '?', ua: navigator.userAgent,
    results: _stLast ? _stLast.results : null, sizes: typeof stateSizes === 'function' ? stateSizes(state) : null,
    usage: typeof usageReport === 'function' ? usageReport(typeof searchItems === 'function' ? searchItems() : [], usageGet()) : null, errors: E,
    raw: 'Démarrages (ms) : ' + B.map(function(b){ return b.ms; }).join(', ') });
  if(navigator.share){ try { await navigator.share({ title: 'Diagnostic Plan Marathon', text: txt }); return; } catch(e) { if(e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(txt); if(typeof showToast === 'function') showToast('Diagnostic copié', '📤'); } catch(e) { if(typeof showToast === 'function') showToast('Copie impossible', '⚠️'); }
}
