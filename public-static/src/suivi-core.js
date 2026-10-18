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

// ─── Distance et allure (pages /suivi-guillaume, /parcours, /suivi-admin et panneau « Course en direct ») ──
// Distance : uniquement la position GPS projetée sur le tracé officiel (42,195 km) — un pointage ne la fait jamais
// reculer ; il ne la remplace que si le GPS est absent ou en retard sur lui. Temps : le dernier pointage officiel
// (km + temps) cale le chrono à l'instant où la trace GPS a franchi ce km ; le tronçon suivant est chronométré au GPS.
// Hors essai, l'allure moyenne affichée reste dans les bornes plausibles du plan.
// d : mètres parcourus · el : temps de course (ms) à cette distance · ts : instant de cette distance
// s / ll : position sur le tracé (carte) · speed : m/s moyens · known : allure mesurée · adj : allure bornée
let _suiviMax = { key: null, d: 0 };
function suiviCalc(live, t){
  const o = { st: live.status || 'idle', t: t };
  if(!live.startedAt) return o;
  const test = !!live.test, R = SUIVI_DATA.route, K = SuiviGeo.scale;
  // essai : distance et temps partent de la première position sur le parcours (s0 / s0t), où qu'elle soit
  const s0 = test && typeof live.s0 === 'number' ? live.s0 : 0;
  const t0 = test && typeof live.s0t === 'number' ? live.s0t : live.startedAt;
  const planSpeed = function(d){ return 1000 / SuiviPlan.pace(d); };
  if(o.st === 'finished'){
    const el = (live.finishedAt || t) - live.startedAt;
    return Object.assign(o, { d: 42195, el: el, ts: live.finishedAt || t, s: SuiviGeo.len, ll: R[R.length - 1], speed: 42195 / (el / 1000), known: true });
  }
  let A = null;                                          // pointage officiel le plus loin
  if(live.splits) Object.keys(live.splits).forEach(function(k){ const x = live.splits[k]; if(x && x.km > 0 && x.el > 0 && (!A || x.km > A.km)) A = x; });
  const P = live.pos && typeof live.pos.s === 'number' && live.pos.src !== 'officiel' ? live.pos : null;
  if(!A && !P) return Object.assign(o, { d: 0, el: t - t0, ts: t, s: s0, ll: null, speed: planSpeed(0), known: false });
  let ref = null;
  if(P){
    const Pt = P.sts || P.ts;                            // instant où la distance GPS a été mesurée
    ref = { d: Math.max(0, Math.min(42195, (P.s - s0) * K)), el: Pt - t0, ts: Pt, s: P.s, ll: [P.lat, P.lon] };
  }
  if(A){
    const sA = s0 + A.km * 1000 / K;
    if(ref && ref.d >= A.km * 1000 - 1){
      // instant où la trace GPS a franchi le km pointé (interpolé sur la distance, pas sur l'heure de départ)
      const g = live.track ? Object.keys(live.track).map(function(k){ const x = live.track[k]; return [x[2], x[3]]; }) : [];
      g.push([ref.ts, P.s]);
      g.sort(function(a, b){ return a[0] - b[0]; });
      let TA = null;
      for(let i = 1; i < g.length; i++) if(g[i-1][1] < sA && g[i][1] >= sA){ TA = g[i-1][0] + (g[i][0] - g[i-1][0]) * (sA - g[i-1][1]) / ((g[i][1] - g[i-1][1]) || 1); break; }
      if(TA !== null) ref.el = A.el + (ref.ts - TA);
    } else {
      // GPS absent ou en retard sur le pointage : le pointage donne la position (jamais en arrière)
      ref = { d: Math.min(42195, A.km * 1000), el: A.el, ts: t0 + A.el, s: Math.min(SuiviGeo.len, sA), ll: SuiviGeo.pointAt(sA) };
    }
  }
  o.known = ref.d > 300 && ref.el > 60000;
  let pace = o.known ? ref.el / 1000 / ref.d : 1 / planSpeed(ref.d);   // s/m
  if(o.known && !test){ const B = SuiviPlan.bounds(0, ref.d), q = Math.max(B.min, Math.min(B.max, pace * 1000)) / 1000; o.adj = Math.abs(q - pace) > 1e-6; pace = q; }
  o.speed = 1 / pace;
  o.ref = ref; o.d = ref.d; o.el = ref.el; o.ts = ref.ts; o.s = ref.s; o.ll = ref.ll;
  o.age = t - ref.ts;
  o.ratio = suiviRatio(ref.d, ref.el);
  // sans nouvelle distance depuis 2 min (GPS coupé, OwnTracks en Quiet, batterie…) : suivi autonome,
  // la position avance selon le plan PacePro au rythme réel, et se recale à chaque temps officiel saisi
  if(o.age > 120000 && o.st === 'running'){
    const add = Math.min(42195 - ref.d, suiviPlanAdvance(ref.d, o.age, o.ratio));
    o.est = true; o.d = ref.d + add; o.el = ref.el + o.age; o.ts = t;
    o.s = Math.min(SuiviGeo.len, ref.s + add / K); o.ll = SuiviGeo.pointAt(o.s);
  }
  // la distance affichée ne recule jamais pendant une même course (sur cet écran)
  const key = live.startedAt + '|' + s0;
  if(_suiviMax.key === key && _suiviMax.d > o.d){ o.d = _suiviMax.d; o.s = _suiviMax.s; if(o.est || !P) o.ll = SuiviGeo.pointAt(o.s); }
  else _suiviMax = { key: key, d: o.d, s: o.s };
  return o;
}

// Rythme réel par rapport au plan (temps réalisé ÷ temps prévu à cette distance), pris en compte
// progressivement sur les 10 premiers km ; 1 = pile sur le plan
function suiviRatio(d, el){
  if(!(d > 300 && el > 60000)) return 1;
  const r = Math.max(0.85, Math.min(1.5, el / 1000 / SuiviPlan.t(d))), w = Math.min(1, d / 10000);
  return 1 + (r - 1) * w;
}
// Mètres parcourus en ageMs depuis la distance d, en suivant les allures du plan au rythme réel (ratio)
function suiviPlanAdvance(d, ageMs, ratio){
  const target = SuiviPlan.t(d) + Math.max(0, ageMs) / 1000 / (ratio || 1);
  if(SuiviPlan.t(42195) <= target) return Math.max(0, 42195 - d);
  let lo = d, hi = 42195;
  for(let k = 0; k < 32; k++){ const m = (lo + hi) / 2; if(SuiviPlan.t(m) < target) lo = m; else hi = m; }
  return lo - d;
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
  planned: function(hm){ const p = hm.split(':'); const d = new Date(SUIVI_DATA.date + 'T00:00:00'); d.setHours(+p[0], +p[1], +(p[2] || 0), 0); return d.getTime(); },
  hhmmss: function(t){ const d = new Date(t); return d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); },
};
