// Thème clair / sombre / piste (Compte › « 🌗 Thème » : Auto = réglage de l'iPhone, Clair, Sombre, Piste de nuit ; localStorage pm_theme).
// « Piste de nuit » = le même adaptateur sombre, aux couleurs bleu nuit (#0E1424 / #161E33) avec le bleu de l'app remplacé par
// l'orange de piste (#E0603A), polices Manrope (texte) et Big Shoulders Display (chiffres), html[data-piste] ; accueil propre (piste-home.js).
// L'attribut html[data-theme] est posé dès le <head> (script en ligne de index.html) pour éviter un flash blanc.
// Mode sombre = adaptateur automatique des couleurs (aucune couleur à réécrire module par module) :
//   • fonds clairs → sombres (même teinte, l'ordre clair/foncé est gardé : la page reste plus sombre que les cartes),
//   • textes foncés → clairs, bordures claires → sombres, traits / remplissages SVG idem ;
//   • couleurs vives, en-têtes en dégradé foncé, voiles transparents, images et canvas (images à partager) : inchangés.
// Appliqué à toutes les feuilles de style (y compris celles ajoutées plus tard par les modules) et aux styles en ligne,
// au fil des rendus (MutationObserver, avant l'affichage). Changement de thème = rechargement de l'app.
const TH_KEY = 'pm_theme';
function themePref(){ try { return localStorage.getItem(TH_KEY) || 'auto'; } catch(e) { return 'auto'; } }
function themeIsPiste(p){ return (p || themePref()) === 'piste'; }
function themeIsDark(p){ p = p || themePref(); return p === 'dark' || p === 'piste' || (p === 'auto' && !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)); }

// ─── couleurs ────────────────────────────────────────────────────────────────
function _thParse(c){
  c = String(c).trim().toLowerCase();
  if(c === 'white') return { r: 255, g: 255, b: 255, a: 1 }; if(c === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  let m = c.match(/^#([0-9a-f]{3,8})$/);
  if(m){ let h = m[1]; if(h.length === 3 || h.length === 4) h = h.split('').map(function(x){ return x + x; }).join('');
    if(h.length !== 6 && h.length !== 8) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }; }
  m = c.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if(m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : +m[4] };
  return null;
}
function _thHsl(o){ const r = o.r / 255, g = o.g / 255, b = o.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if(mx !== mn){ const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return { h: h, s: s * 100, l: l * 100 }; }
function _thOut(h, s, l, a){ s /= 100; l /= 100; const k = function(n){ return (n + h / 30) % 12; }, f = function(n){ return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); };
  const R = Math.round(f(0) * 255), G = Math.round(f(8) * 255), B = Math.round(f(4) * 255);
  return a < 1 ? 'rgba(' + R + ',' + G + ',' + B + ',' + (Math.round(a * 100) / 100) + ')' : 'rgb(' + R + ',' + G + ',' + B + ')'; }
// Piste de nuit : le bleu vif de l'app (boutons, onglet actif, coches…) devient l'orange de piste ; dans un dégradé, les bleus
// deviennent bleu nuit (en-têtes) ; fonds clairs → bleu nuit plus profond que le Sombre
let _thPiste = false;
const TH_TARTAN = { r: 224, g: 96, b: 58 }, TH_TARTAN_FG = { r: 239, g: 122, b: 84 };
function _thRgb(o, a){ return a < 1 ? 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',' + (Math.round(a * 100) / 100) + ')' : 'rgb(' + o.r + ',' + o.g + ',' + o.b + ')'; }
function thIsBrand(x){ return x.h >= 216 && x.h <= 230 && x.s >= 60 && x.l >= 38 && x.l <= 62; }
// rôles : bg (fond), fg (texte), line (bordure / trait), grad (couleur d'un dégradé de fond, piste seulement)
function thMap(c, role){
  const o = _thParse(c); if(!o) return c;
  const x = _thHsl(o);
  if(_thPiste){
    if(role === 'grad'){ if(x.h >= 205 && x.h <= 235 && x.s >= 35 && x.l < 70) return _thRgb(x.l < 30 ? { r: 18, g: 26, b: 46 } : { r: 28, g: 39, b: 66 }, o.a); role = 'bg'; }
    if(thIsBrand(x)) return _thRgb(role === 'fg' ? TH_TARTAN_FG : TH_TARTAN, o.a);
    // fonds bleu foncé pleins (en-tête du Compte…) → bleu nuit des cartes en relief
    if(role === 'bg' && o.a >= 0.5 && x.h >= 200 && x.h <= 235 && x.s >= 45 && x.l >= 12 && x.l <= 42) return _thRgb({ r: 28, g: 39, b: 66 }, o.a);
  }
  const neutral = x.s < 8, H = neutral ? (_thPiste ? 224 : 222) : x.h;  // blanc / gris neutres → ardoise (teinte du fond de l'app)
  if(role === 'bg'){ if(o.a < 0.5 || x.l < 78) return c;
    if(_thPiste) return _thOut(H, neutral ? 40 : Math.min(x.s, 45), Math.max(4, 1.5 + (x.l - 78) * 0.58), o.a);   // blanc → #161E33, fond de page → #0E1424
    return _thOut(H, neutral ? 22 : Math.min(x.s, 40), 6 + (x.l - 78) * 0.6, o.a); }
  if(role === 'fg'){ if(x.l >= 58 || o.a < 0.3) return c; return _thOut(x.h, Math.min(x.s, 85), x.l < 30 ? 100 - x.l * 0.6 : Math.max(66, 100 - x.l * 0.75), o.a); }
  if(role === 'line'){ if(o.a < 0.3 || x.l >= 97) return c; if(x.l >= 70) return _thOut(H, neutral ? (_thPiste ? 36 : 20) : Math.min(x.s, 35), 18 + (x.l - 70) * 0.25, o.a); if(x.l < 25) return _thOut(x.h, x.s, 55, o.a); return c; }
  if(role === 'fill'){ return x.l >= 78 ? thMap(c, 'bg') : x.l < 58 ? thMap(c, 'fg') : c; }
  if(role === 'stroke'){ return x.l >= 70 ? thMap(c, 'line') : x.l < 58 ? thMap(c, 'fg') : c; }
  return c;
}
const _TH_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/g, _thCache = {};
function thMapValue(v, role){
  if(_thPiste && role === 'bg' && /gradient/.test(v)) role = 'grad';
  const k = role + '|' + v; if(_thCache[k] != null) return _thCache[k];
  const out = String(v).replace(_TH_RE, function(c){ return thMap(c, role); });
  _thCache[k] = out; return out;
}
// rôle d'une propriété CSS (null = non concernée)
function thRole(prop){
  prop = prop.toLowerCase();
  if(prop === 'color' || prop === 'caret-color' || prop === '-webkit-text-fill-color') return 'fg';
  if(prop === 'background' || prop === 'background-color' || prop === 'background-image') return 'bg';
  if(/^border(-(top|right|bottom|left))?(-color)?$/.test(prop) || prop === 'outline' || prop === 'outline-color') return 'line';
  if(prop === 'fill') return 'fill'; if(prop === 'stroke') return 'stroke';
  if(prop.indexOf('--') === 0){ if(/bg|card|page|surface|fond/.test(prop)) return 'bg'; if(/text|ink|muted|fg/.test(prop)) return 'fg'; if(/border|line/.test(prop)) return 'line'; }
  return null;
}

// ─── feuilles de style → règles « html[data-theme=dark] … » ─────────────────
function _thSplitSel(sel){ const out = []; let d = 0, cur = ''; for(const ch of sel){ if(ch === '(') d++; if(ch === ')') d--; if(ch === ',' && !d){ out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(function(x){ return x.trim(); }).filter(Boolean); }
function _thPrefix(sel){
  return _thSplitSel(sel).map(function(s){
    if(/^:root/.test(s)) return 'html[data-theme=dark]' + s.slice(5);
    if(/^html\b/.test(s)) return 'html[data-theme=dark]' + s.slice(4);
    return 'html[data-theme=dark] ' + s;
  }).join(',');
}
let _thHasColorRules = true;
function _thRules(rules){
  let css = '';
  for(let i = 0; i < rules.length; i++){
    const r = rules[i];
    if(r.type === 1 && r.style){
      // toutes les couleurs de la règle sont recopiées (même inchangées) : l'ordre de priorité des états (.on, [aria-pressed]…)
      // reste celui d'origine entre règles sombres
      let decl = '', changed = false;
      for(let j = 0; j < r.style.length; j++){
        const p = r.style[j], role = thRole(p); if(!role) continue;
        const v = r.style.getPropertyValue(p); if(!v || !/#|rgb|white|black|transparent|none/i.test(v)) continue;
        const nv = /#|rgb|white|black/i.test(v) ? thMapValue(v, role) : v; if(nv !== v) changed = true;
        decl += p + ':' + nv + (r.style.getPropertyPriority(p) ? ' !important' : '') + ';';
      }
      if(decl && (changed || _thHasColorRules)) css += _thPrefix(r.selectorText) + '{' + decl + '}\n';
    } else if(r.type === 4 && r.cssRules){ const inner = _thRules(r.cssRules); if(inner) css += '@media ' + r.conditionText + '{' + inner + '}\n'; }
    else if(r.type === 12 && r.cssRules){ const inner = _thRules(r.cssRules); if(inner) css += '@supports ' + r.conditionText + '{' + inner + '}\n'; }
  }
  return css;
}
const _thDone = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
function _thSheet(node){
  if(!node || node.id === 'th-dark' || (node.dataset && node.dataset.th) || (_thDone && _thDone.has(node))) return;
  const sh = node.sheet; if(!sh) return;
  let rules; try { rules = sh.cssRules; } catch(e) { return; }       // feuille externe (polices) : ignorée
  if(_thDone) _thDone.add(node);
  const css = _thRules(rules); if(!css) return;
  const st = document.createElement('style'); st.dataset.th = '1'; st.textContent = css;
  node.parentNode.insertBefore(st, node.nextSibling);
}
// ─── styles en ligne et attributs SVG ────────────────────────────────────────
function _thEl(el){
  if(el.nodeType !== 1) return;
  if(el.hasAttribute('style') && el.__thS !== el.getAttribute('style')){
    const s = el.style;
    for(let j = 0; j < s.length; j++){
      const p = s[j], role = thRole(p); if(!role) continue;
      const v = s.getPropertyValue(p); if(!v || !/#|rgb|white|black/i.test(v)) continue;
      const nv = thMapValue(v, role); if(nv !== v) s.setProperty(p, nv, s.getPropertyPriority(p));
    }
    el.__thS = el.getAttribute('style');
  }
  if(el.namespaceURI === 'http://www.w3.org/2000/svg'){
    ['fill', 'stroke', 'stop-color'].forEach(function(a){
      const v = el.getAttribute(a); if(!v || !/#|rgb|white|black/i.test(v) || el['__th' + a] === v) return;
      const nv = thMapValue(v, a === 'stop-color' ? 'bg' : a); if(nv !== v) el.setAttribute(a, nv); el['__th' + a] = nv;
    });
  }
}
function _thTree(root){
  if(!root || root.nodeType !== 1) return;
  _thEl(root);
  const l = root.querySelectorAll('[style],[fill],[stroke],[stop-color]'); for(let i = 0; i < l.length; i++) _thEl(l[i]);
  if(root.tagName === 'STYLE' || root.tagName === 'LINK') _thSheet(root);
  const ss = root.querySelectorAll ? root.querySelectorAll('style,link[rel=stylesheet]') : []; for(let i = 0; i < ss.length; i++) _thSheet(ss[i]);
}
function themeInit(){
  const dark = themeIsDark(), piste = themeIsPiste();
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  if(piste) document.documentElement.setAttribute('data-piste', '1'); else document.documentElement.removeAttribute('data-piste');
  _thPiste = piste;
  if(window.matchMedia && themePref() === 'auto'){ try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){ location.reload(); }); } catch(e) {} }
  if(!dark) return;
  const meta = document.querySelector('meta[name=color-scheme]'); if(meta) meta.setAttribute('content', 'dark');
  if(piste) thPisteCss();
  document.querySelectorAll('style,link[rel=stylesheet]').forEach(function(n){ if(n.sheet) _thSheet(n); else n.addEventListener('load', function(){ _thSheet(n); }); });
  _thTree(document.body);
  new MutationObserver(function(ms){
    for(const m of ms){
      if(m.type === 'attributes') _thEl(m.target);
      else m.addedNodes.forEach(function(n){ if(n.nodeType === 1){ if(n.tagName === 'LINK' && !n.sheet) n.addEventListener('load', function(){ _thSheet(n); }); else _thTree(n); } });
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'fill', 'stroke', 'stop-color'] });
}
// Compte › Thème
function themeOpen(){
  const p = themePref(), mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'th-set'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  const opt = function(v, t, d){ return '<button type="button" class="th-opt' + (p === v ? ' on' : '') + '" onclick="themeSet(\'' + v + '\')"><b>' + t + '</b><span>' + d + '</span></button>'; };
  ov.innerHTML = '<div class="modal-box" style="max-height:90vh;"><div class="th-head"><div><p class="th-eb">Affichage</p><p class="th-title">🌗 Thème</p></div><button class="th-x" onclick="document.getElementById(\'th-set\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body"><div class="th-body">' + opt('auto', '📱 Auto', 'Suit le réglage de l\'iPhone') + opt('light', '☀️ Clair', 'Toujours clair') + opt('dark', '🌙 Sombre', 'Toujours sombre, plus doux le soir') + opt('piste', '🏟️ Piste de nuit', 'Bleu nuit et orange de piste, nouvel accueil') + '</div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
}
// feuille du thème Piste de nuit : polices (servies par l'app, /fonts), page, onglets ; marquée data-th (jamais convertie)
const TH_P = 'html[data-theme=dark][data-piste]';
function thPisteCss(){
  if(document.getElementById('th-piste')) return;
  const tc = document.querySelector('meta[name=theme-color]'); if(tc) tc.setAttribute('content', '#0E1424');
  const P = TH_P, st = document.createElement('style'); st.id = 'th-piste'; st.dataset.th = '1';
  st.textContent = "@font-face{font-family:'Manrope';font-style:normal;font-weight:200 800;font-display:swap;src:url(/fonts/manrope.woff2) format('woff2');}"
    + "@font-face{font-family:'Big Shoulders Display';font-style:normal;font-weight:100 900;font-display:swap;src:url(/fonts/big-shoulders-display.woff2) format('woff2');}"
    + P + ',' + P + ' body{background:#0E1424;}' + P + '{--blue:#E0603A;}'
    + P + ' .plan-week-card.is-current{box-shadow:0 0 0 2.5px #E0603A,0 4px 28px rgba(224,96,58,.16);}'
    + P + ' body{font-family:Manrope,system-ui,-apple-system,sans-serif;color:#F2F4F8;--page:#0E1424;--card:#161E33;--card-2:#1C2742;--ink:#F2F4F8;--ink-2:#C2CADB;--muted-2:#9AA6BF;--line:#24304D;--brand:#E0603A;--r-card:20px;}'
    + P + ' :where(button,input,select,textarea){font-family:inherit;}'
    + P + ' #app{background:#0E1424;}'
    + P + ' #nav-bar{background:rgba(11,16,29,.94)!important;border-top:1px solid #1E2740!important;}'
    + P + ' .nav-btn{color:#9AA6BF;}' + P + ' .nav-btn.active{color:#E0603A;}' + P + ' .nav-btn.active .nav-icon-wrap{background:rgba(224,96,58,.14);}' + P + ' .nav-btn-label{font-weight:700;}'
    + P + " #plan-title," + P + " .modal-stat-value{font-family:'Big Shoulders Display',Manrope,sans-serif;letter-spacing:.01em;}";
  document.head.appendChild(st);
}
function themeSet(p){ try { localStorage.setItem(TH_KEY, p); } catch(e) {} location.reload(); }
if(typeof document !== 'undefined' && document.documentElement && typeof window !== 'undefined' && window.MutationObserver) themeInit();
