// Suivi Guillaume — fonctions communes aux pages /suivi-guillaume (lecture) et /suivi-admin (envoi GPS).
// Données en direct dans la Realtime Database, nœud /live (lecture publique, écriture réservée à l'admin).

const SUIVI_FB = {
  apiKey: 'AIzaSyA1yOzyqcrIM4fYOJh5DCBFPQXCSV7X5uw',
  authDomain: 'prepa-marathon.firebaseapp.com',
  databaseURL: 'https://prepa-marathon-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'prepa-marathon',
  appId: '1:1068433254929:web:63147befb9b51dd2f95fb0',
};
const SUIVI_ADMIN_UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1';

function suiviLoadScript(src){
  return new Promise(function(ok, ko){ const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
}
async function suiviFirebase(withAuth){
  const base = 'https://www.gstatic.com/firebasejs/9.23.0/';
  await suiviLoadScript(base + 'firebase-app-compat.js');
  if(withAuth) await suiviLoadScript(base + 'firebase-auth-compat.js');
  await suiviLoadScript(base + 'firebase-database-compat.js');
  if(!firebase.apps.length) firebase.initializeApp(SUIVI_FB);
  return firebase.database().ref('live');
}
function suiviLeaflet(){
  if(window.L) return Promise.resolve();
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l);
  return suiviLoadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
}

// ─── Géométrie du parcours (mètres le long du tracé GPX) ────────────────────
const SuiviGeo = (function(){
  const RAD = Math.PI / 180;
  const kx = function(lat){ return 111320 * Math.cos(lat * RAD); };
  const dist = function(a, b){ const dx = (b[1]-a[1]) * kx((a[0]+b[0])/2), dy = (b[0]-a[0]) * 110540; return Math.sqrt(dx*dx + dy*dy); };
  const pts = SUIVI_DATA.route, cum = [0];
  for(let i = 1; i < pts.length; i++) cum.push(cum[i-1] + dist(pts[i-1], pts[i]));
  const len = cum[cum.length - 1], scale = SUIVI_DATA.official / len;
  function project(p, sMin, sMax){
    const K = kx(p[0]); let best = { d: Infinity, s: 0 };
    for(let i = 1; i < pts.length; i++){
      if(sMax !== undefined && (cum[i] < sMin || cum[i-1] > sMax)) continue;
      const a = pts[i-1], b = pts[i];
      const ax = (a[1]-p[1]) * K, ay = (a[0]-p[0]) * 110540, bx = (b[1]-p[1]) * K, by = (b[0]-p[0]) * 110540;
      const dx = bx-ax, dy = by-ay, L2 = dx*dx + dy*dy, u = L2 ? Math.max(0, Math.min(1, -(ax*dx + ay*dy) / L2)) : 0;
      const d = Math.hypot(ax + u*dx, ay + u*dy);
      if(d < best.d) best = { d: d, s: cum[i-1] + u * Math.sqrt(L2) };
    }
    return best;
  }
  function pointAt(s){
    s = Math.max(0, Math.min(len, s));
    for(let i = 1; i < pts.length; i++) if(cum[i] >= s){ const f = (s - cum[i-1]) / ((cum[i] - cum[i-1]) || 1); return [pts[i-1][0] + (pts[i][0]-pts[i-1][0]) * f, pts[i-1][1] + (pts[i][1]-pts[i-1][1]) * f]; }
    return pts[pts.length - 1];
  }
  // position des points de passage sur le tracé (fenêtre autour du km annoncé pour éviter les portions voisines)
  SUIVI_DATA.points.forEach(function(pt){
    pt.s = pt.id === 'finish' ? len - 60 : project(pt.coord, (pt.km - 3) * 1000 / scale, (pt.km + 3) * 1000 / scale).s;
  });
  return { dist: dist, project: project, pointAt: pointAt, len: len, scale: scale, km: function(s){ return s * scale / 1000; } };
})();

// ─── Plan de course (PacePro) : temps cumulés prévus en secondes à chaque km (dernier = arrivée 42,195) ──
// Sert uniquement à repérer les valeurs aberrantes (erreur de saisie, GPS figé ou qui saute) ; jamais affiché aux amis.
const SUIVI_PLAN = [320, 636, 952, 1264, 1585, 1895, 2206, 2519, 2832, 3147, 3461, 3772, 4084, 4393, 4705, 5017, 5329, 5640, 5956, 6265,
  6572, 6881, 7187, 7492, 7799, 8107, 8416, 8724, 9044, 9352, 9660, 9968, 10276, 10584, 10892, 11200, 11508, 11816, 12124, 12432, 12740, 13108];
const SuiviPlan = (function(){
  const T = SUIVI_PLAN, D = T.map(function(x, i){ return i < T.length - 1 ? (i + 1) * 1000 : 42195; }), n = T.length - 1;
  function t(d){                                         // secondes prévues à d mètres
    if(d <= 0) return 0;
    for(let i = 0; i <= n; i++) if(d <= D[i]){ const d0 = i ? D[i-1] : 0, t0 = i ? T[i-1] : 0; return t0 + (T[i] - t0) * (d - d0) / (D[i] - d0); }
    return T[n] + (d - D[n]) * (T[n] - T[n-1]) / (D[n] - D[n-1]);
  }
  function pace(d1, d2){ if(!(d2 > d1 + 50)) d2 = d1 + 1000; return (t(d2) - t(d1)) / (d2 - d1) * 1000; }   // s/km prévus
  // allures plausibles (s/km) sur un tronçon : au plus 50 s plus rapide que le plan ; au plus 1 min plus lent
  // jusqu'au km 30 (une allure en 6 ou 7 y est forcément une erreur), 3 min au-delà (coup de moins bien possible)
  function bounds(d1, d2){ const p = pace(d1, d2); return { plan: p, min: p - 50, max: p + (d2 > 30500 ? 180 : 60) }; }
  return { t: t, pace: pace, bounds: bounds };
})();

// ─── Distance et allure (pages /suivi-guillaume, /suivi-admin et panneau « Course en direct ») ──
// Le dernier pointage officiel (km + temps) est acquis définitivement : seul le tronçon parcouru depuis
// ce pointage (ou depuis le départ) est mesuré au GPS (ou estimé), puis ajouté aux km et au temps validés.
// Hors essai, le tronçon GPS est ramené dans les allures plausibles du plan (GPS figé ou qui saute).
// d : mètres officiels parcourus · el : temps de course (ms) à cette distance · ts : instant de cette distance
// s / ll : position sur le tracé (carte) · speed : m/s moyens · known : allure mesurée · adj : GPS recalé
function suiviCalc(live, t){
  const o = { st: live.status || 'idle', t: t };
  if(!live.startedAt) return o;
  // essai : le temps part de la première position sur le parcours (s0t), pas du bouton « Lancer un essai »
  const t0 = live.test && typeof live.s0t === 'number' ? live.s0t : live.startedAt, R = SUIVI_DATA.route;
  const planSpeed = function(d){ return 1000 / SuiviPlan.pace(d); };
  if(o.st === 'finished'){
    const el = (live.finishedAt || t) - t0;
    return Object.assign(o, { d: 42195, el: el, ts: live.finishedAt || t, s: SuiviGeo.len, ll: R[R.length - 1], speed: 42195 / (el / 1000), known: true });
  }
  // ancrage : pointage officiel le plus loin, sinon le départ
  let A = null;
  if(live.splits) Object.keys(live.splits).forEach(function(k){ const x = live.splits[k]; if(x && x.km > 0 && x.el > 0 && (!A || x.km > A.km)) A = x; });
  const P = live.pos && typeof live.pos.s === 'number' && live.pos.src !== 'officiel' ? live.pos : null;
  if(!A && !P) return Object.assign(o, { d: 0, el: t - t0, ts: t, s: 0, ll: null, speed: planSpeed(0), known: false });
  if(!A) A = { km: 0, el: 0 };
  const At = t0 + A.el, Ad = Math.min(42195, A.km * 1000), As = Math.min(SuiviGeo.len, Ad / SuiviGeo.scale);
  // position GPS au moment du pointage (trace interpolée) : le tronçon GPS est mesuré à partir de là
  // essai démarré ailleurs qu'au départ : la distance part de l'origine de l'essai (s0, posée par le serveur)
  let gA = A.km ? null : (live.test && typeof live.s0 === 'number' ? live.s0 : 0);
  if(gA === null){
    const g = live.track ? Object.keys(live.track).map(function(k){ const x = live.track[k]; return [x[2], x[3]]; }) : [];
    if(P) g.push([P.ts, P.s]);
    g.sort(function(a, b){ return a[0] - b[0]; });
    for(let i = 1; i < g.length; i++) if(g[i-1][0] <= At && g[i][0] >= At){ const f = (At - g[i-1][0]) / ((g[i][0] - g[i-1][0]) || 1); gA = g[i-1][1] + (g[i][1] - g[i-1][1]) * f; break; }
    if(gA === null) gA = As;
  }
  let ref;
  if(P && P.ts > At){
    const e = (P.ts - At) / 1000, raw = Math.max(0, (P.s - gA) * SuiviGeo.scale);
    let dd = raw;
    if(!live.test && e >= 20){ const B = SuiviPlan.bounds(Ad, Ad + raw); dd = Math.max(e / B.max * 1000, Math.min(e / B.min * 1000, raw)); }
    dd = Math.min(42195 - Ad, dd);
    const adj = Math.abs(dd - raw) > 1, s = adj ? Math.max(0, Math.min(SuiviGeo.len, gA + dd / SuiviGeo.scale)) : P.s;
    ref = { d: Ad + dd, el: A.el + (P.ts - At), ts: P.ts, s: s, ll: adj ? SuiviGeo.pointAt(s) : [P.lat, P.lon], adj: adj };
  } else ref = { d: Ad, el: A.el, ts: At, s: As, ll: SuiviGeo.pointAt(As) };
  o.known = ref.d > 300 && ref.el > 60000;
  o.speed = o.known ? ref.d / (ref.el / 1000) : planSpeed(ref.d);
  o.ref = ref; o.adj = !!ref.adj; o.d = ref.d; o.el = ref.el; o.ts = ref.ts; o.s = ref.s; o.ll = ref.ll;
  o.age = t - ref.ts;
  // sans nouvelle position depuis 2 min : avancée estimée à l'allure moyenne
  if(o.age > 120000 && o.st === 'running'){
    const add = Math.min(42195 - ref.d, o.speed * o.age / 1000);
    o.est = true; o.d = ref.d + add; o.el = ref.el + o.age; o.ts = t;
    o.s = Math.min(SuiviGeo.len, ref.s + add / SuiviGeo.scale); o.ll = SuiviGeo.pointAt(o.s);
  }
  return o;
}

// Arrivée estimée : temps restant du plan PacePro depuis la distance atteinte, ajusté au rythme réel
// (temps réalisé ÷ temps prévu à cette distance ; pris en compte progressivement sur les 10 premiers km).
// at : heure d'arrivée (ms) · dur : temps final estimé (ms) · done : arrivée réelle
function suiviEta(o, live){
  const total = SuiviPlan.t(42195) * 1000;
  if(o.st === 'finished' && live.startedAt) return { at: live.finishedAt, dur: live.finishedAt - live.startedAt, done: true };
  if(!live.startedAt){ const st = suiviFmt.planned(SUIVI_DATA.start); return { at: st + total, dur: total }; }
  const t0 = live.startedAt, d = o.d || 0;
  if(d < 200 || !(o.el > 0)) return { at: Math.max(o.t, t0 + total), dur: Math.max(o.t - t0, total) };
  const planEl = SuiviPlan.t(d) * 1000, r = Math.max(0.85, Math.min(1.5, o.el / planEl)), w = Math.min(1, d / 10000);
  const rem = (total - planEl) * (1 + (r - 1) * w), at = Math.max(o.t, t0 + o.el + rem);
  return { at: at, dur: at - t0 };
}

// ─── Formats ────────────────────────────────────────────────────────────────
const suiviFmt = {
  hhmm: function(t){ const d = new Date(t); return d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0'); },
  hm: function(ms){ const m = Math.round(Math.max(0, ms) / 60000); return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); },
  dur: function(ms){ ms = Math.max(0, ms); const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); },
  km: function(m){ return (m / 1000).toFixed(m >= 9950 ? 1 : 2).replace('.', ','); },
  pace: function(secPerKm){ if(!isFinite(secPerKm) || secPerKm <= 0) return '–'; const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60); return m + "'" + String(s === 60 ? 59 : s).padStart(2, '0') + '"/km'; },
  ago: function(ms){ const s = Math.round(ms / 1000); return s < 60 ? 'il y a ' + Math.max(1, s) + ' s' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : 'il y a ' + Math.floor(s / 3600) + ' h'; },
  planned: function(hm){ const p = hm.split(':'); const d = new Date(SUIVI_DATA.date + 'T00:00:00'); d.setHours(+p[0], +p[1], 0, 0); return d.getTime(); },
};
