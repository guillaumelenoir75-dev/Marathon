// ─── Navigation façon appli native ──────────────────────────────────────────────────────────────────────────
// • Retour : le bouton / geste retour du téléphone (Android, navigateur) et le glisser depuis le bord gauche (iPhone, app
//   installée, où il n'existe pas) ferment la fenêtre du dessus ; sans fenêtre ouverte, ramènent à l'Accueil.
//   Une entrée « piège » est gardée en haut de l'historique (navArm) : chaque retour arrive dans `popstate` → navBack().
//   Sur l'Accueil sans rien d'ouvert, le retour n'est pas retenu (on peut quitter l'app sur Android).
// • Fenêtres détectées sans rien changer aux écrans existants (navLayers) : éléments fixés qui couvrent la moitié de l'écran
//   au moins, au-dessus des écrans (z-index ≥ 190), hors chargement / réveil / onboarding / toasts. Fermeture comme l'utilisateur
//   le ferait (navCloseLayer) : bouton de fermeture (× / Fermer / Annuler), sinon toucher du fond, sinon retrait.
// • Adresses : chaque onglet a la sienne (#/plan, #/stats…, mise à jour sans entrée d'historique) ; au lancement, #/<onglet> ouvre
//   l'onglet et #/go/<id> l'action de la recherche (search.js) — navDeepLink, appelé par firebase.js.
const NAV_SCREENS = ['home', 'plan', 'renfo', 'stats', 'coach', 'compte'];
const NAV_SKIP_ID = /^(loading-overlay|wakeup-banner|brief-loading-overlay|onboarding-overlay|_global-toast|safe-top|prep-veil|nav-edge)$/;
let _navCur = 'home', _navReady = false, _navMuteHash = false;
// adresse d'arrivée, gardée avant que le 1er affichage de l'Accueil ne la remplace
const _navStartHash = typeof location !== 'undefined' ? String(location.hash || '') : '';

// fenêtres ouvertes, de la plus basse à celle du dessus
function navLayers(){
  if(typeof document === 'undefined' || !document.body) return [];
  const mc = document.getElementById('modal-container'), roots = [];
  Array.prototype.forEach.call(document.body.children, function(el){ if(el !== mc) roots.push(el); });
  if(mc) Array.prototype.push.apply(roots, mc.children);              // fenêtres ouvertes dans #modal-container (où qu'il soit)
  const W = window.innerWidth || 390, H = window.innerHeight || 844;
  return roots.map(function(el, i){
    if(!el || el.nodeType !== 1 || /^(SCRIPT|STYLE|LINK|NOSCRIPT)$/.test(el.tagName) || (el.id && NAV_SKIP_ID.test(el.id))) return null;
    const cs = getComputedStyle(el);
    if(cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
    const z = parseInt(cs.zIndex, 10) || 0; if(z < 190) return null;
    const r = el.getBoundingClientRect(); if(r.width < W * 0.5 || r.height < H * 0.5) return null;
    return { el: el, z: z, i: i };
  }).filter(Boolean).sort(function(a, b){ return a.z - b.z || a.i - b.i; }).map(function(x){ return x.el; });
}
// fermer une fenêtre comme on le ferait à la main
function navCloseLayer(el){
  if(!el) return;
  const btns = Array.prototype.slice.call(el.querySelectorAll('button, [role="button"]'));
  const btn = el.querySelector('[data-nav-close], .lc-x, .wi-x, .modal-close, .close-btn, #cm-cancel, [aria-label="Fermer"], [aria-label^="Fermer"]')
    || btns.filter(function(b){ return /^(×|✕|✖|✖️|Fermer|Annuler|Plus tard|Non merci)$/.test((b.textContent || '').trim()); })[0];
  if(btn) btn.click();
  else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));     // toucher du fond (e.target === fenêtre)
  setTimeout(function(){
    if(el.isConnected && navLayers().indexOf(el) >= 0 && (el.classList.contains('modal-overlay') || (el.parentElement && el.parentElement.id === 'modal-container'))) el.remove();
  }, 80);
}
// un pas en arrière : fenêtre du dessus, sinon l'Accueil ; false = rien à faire
function navBack(){
  const L = navLayers();
  if(L.length){ navCloseLayer(L[L.length - 1]); return true; }
  if(_navCur !== 'home' && typeof showScreen === 'function'){ showScreen('home'); return true; }
  return false;
}
// entrée « piège » en haut de l'historique : le prochain retour reste dans l'app
function navArm(){
  try { if(!(history.state && history.state.pmTrap)) history.pushState({ pmTrap: 1 }, '', location.href); } catch(e) {}
}
function navInit(){
  if(_navReady || typeof window === 'undefined') return; _navReady = true;
  try { history.replaceState(Object.assign({}, history.state || {}, { pmBase: 1 }), '', location.href); } catch(e) {}
  navArm();
  window.addEventListener('popstate', function(e){
    if(e.state && e.state.pmTrap) return;                    // « avancer » : rien
    if(navBack()) navArm();                                  // retour traité : on garde la main
  });
  // une fenêtre qui s'ouvre ré-arme le retour (après un retour sur l'Accueil sans fenêtre)
  try {
    const mo = new MutationObserver(function(){ if(navLayers().length) navArm(); });
    mo.observe(document.body, { childList: true });
    const mc = document.getElementById('modal-container'); if(mc) mo.observe(mc, { childList: true });
  } catch(e) {}
  navSwipeInit();
}
// onglet affiché : adresse #/onglet (sans nouvelle entrée d'historique)
function navScreenShown(name){
  if(NAV_SCREENS.indexOf(name) < 0) return;
  _navCur = name;
  if(_navMuteHash) return;
  try {
    const url = location.pathname + location.search + (name === 'home' ? '' : '#/' + name);
    if(location.pathname + location.search + location.hash !== url) history.replaceState(history.state, '', url);
  } catch(e) {}
  if(name !== 'home') navArm();
}
// adresse d'arrivée : #/stats, #/go/fcmax…
function navDeepLink(hash, delay){
  const h = String(hash || _navStartHash || '').replace(/^#\/?/, ''); if(!h) return false;
  const run = function(fn){ setTimeout(fn, delay || 0); };
  const g = h.match(/^go\/([\w-]+)/);
  if(g){ run(function(){ if(typeof searchRun === 'function') searchRun(g[1]); }); return true; }
  if(NAV_SCREENS.indexOf(h) >= 0 && h !== 'home'){ run(function(){ if(typeof showScreen === 'function') showScreen(h); }); return true; }
  return false;
}

// ─── Glisser depuis le bord gauche (app installée sur iPhone : pas de geste retour du système) ───
function navSwipeOn(){
  return !!(window._navSwipeForce || navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
}
function navSwipeInit(){
  let on = false, sx = 0, sy = 0, dx = 0, layer = null, edge = null;
  const W = function(){ return window.innerWidth || 390; };
  const hint = function(x){
    if(!edge){ edge = document.createElement('div'); edge.id = 'nav-edge'; edge.setAttribute('aria-hidden', 'true'); edge.textContent = '‹'; document.body.appendChild(edge); }
    const p = Math.min(1, x / 90);
    edge.style.cssText = 'position:fixed;left:' + Math.round(-34 + p * 46) + 'px;top:50%;width:34px;height:34px;margin-top:-17px;border-radius:50%;background:rgba(15,23,42,.72);color:#fff;font-size:22px;font-weight:700;line-height:32px;text-align:center;z-index:10050;pointer-events:none;opacity:' + p.toFixed(2) + ';';
  };
  const reset = function(anim){
    if(layer){ layer.style.transition = anim ? 'transform .2s ease' : ''; layer.style.transform = ''; const l = layer; setTimeout(function(){ l.style.transition = ''; }, 220); }
    if(edge){ edge.remove(); edge = null; }
    layer = null;
  };
  document.addEventListener('touchstart', function(e){
    if(!navSwipeOn() || e.touches.length !== 1) return;
    const t = e.touches[0]; if(t.clientX > 22) return;
    const L = navLayers(); layer = L.length ? L[L.length - 1] : null;
    if(!layer && _navCur === 'home') return;                // rien à quitter
    on = true; sx = t.clientX; sy = t.clientY; dx = 0;
  }, { passive: true });
  document.addEventListener('touchmove', function(e){
    if(!on) return;
    const t = e.touches[0]; dx = t.clientX - sx; const dy = t.clientY - sy;
    if(Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)){ on = false; reset(true); return; }   // geste vertical : défilement
    if(dx <= 0) return;
    if(layer){ layer.style.transition = 'none'; layer.style.transform = 'translateX(' + Math.round(dx) + 'px)'; }
    else hint(dx);
  }, { passive: true });
  const end = function(){
    if(!on) return; on = false;
    if(dx > Math.min(110, W() * 0.28)){
      if(layer){ const l = layer; l.style.transition = 'transform .18s ease-out'; l.style.transform = 'translateX(' + W() + 'px)';
        setTimeout(function(){ navCloseLayer(l); setTimeout(function(){ if(l.isConnected){ l.style.transition = ''; l.style.transform = ''; } }, 120); }, 170);
        layer = null; if(edge){ edge.remove(); edge = null; }
      } else { reset(false); navBack(); }
    } else reset(true);
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', function(){ on = false; reset(true); }, { passive: true });
}

// branché sur showScreen (stats.js) : adresse de l'onglet + retour
(function(){
  if(typeof window === 'undefined' || typeof document === 'undefined' || !document.addEventListener) return;
  const wrap = function(){
    if(typeof showScreen !== 'function' || showScreen._nav) return;
    const orig = showScreen;
    showScreen = function(name){ const r = orig.apply(this, arguments); try { navScreenShown(name); } catch(e) {} return r; };
    showScreen._nav = true;
  };
  wrap();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ wrap(); navInit(); });
  else { wrap(); navInit(); }
})();
