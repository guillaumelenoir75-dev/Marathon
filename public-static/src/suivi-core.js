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

// ─── Distance et allure (pages /suivi-guillaume, /suivi-admin et panneau « Course en direct ») ──
// Le dernier pointage officiel (km + temps) est acquis définitivement : seul le tronçon parcouru depuis
// ce pointage est mesuré au GPS (ou estimé), puis ajouté aux km et au temps validés.
// d : mètres officiels parcourus · el : temps de course (ms) à cette distance · ts : instant de cette distance
// s / ll : position sur le tracé (carte) · speed : m/s moyens · known : allure mesurée (sinon allure du plan)
const SUIVI_PLAN_SPEED = 42195 / (3.55 * 3600);
function suiviCalc(live, t){
  const o = { st: live.status || 'idle', t: t };
  if(!live.startedAt) return o;
  const t0 = live.startedAt, R = SUIVI_DATA.route;
  if(o.st === 'finished'){
    const el = (live.finishedAt || t) - t0;
    return Object.assign(o, { d: 42195, el: el, ts: live.finishedAt || t, s: SuiviGeo.len, ll: R[R.length - 1], speed: 42195 / (el / 1000), known: true });
  }
  // ancrage : pointage officiel le plus loin
  let A = null;
  if(live.splits) Object.keys(live.splits).forEach(function(k){ const x = live.splits[k]; if(x && x.km > 0 && x.el > 0 && (!A || x.km > A.km)) A = x; });
  const P = live.pos && typeof live.pos.s === 'number' && live.pos.src !== 'officiel' ? live.pos : null;
  let ref;
  if(A){
    const At = t0 + A.el, Ad = Math.min(42195, A.km * 1000), As = Math.min(SuiviGeo.len, Ad / SuiviGeo.scale);
    // position GPS au moment du pointage (trace interpolée) : le tronçon GPS est mesuré à partir de là
    const g = live.track ? Object.keys(live.track).map(function(k){ const x = live.track[k]; return [x[2], x[3]]; }) : [];
    if(P) g.push([P.ts, P.s]);
    g.sort(function(a, b){ return a[0] - b[0]; });
    let gA = null;
    for(let i = 1; i < g.length; i++) if(g[i-1][0] <= At && g[i][0] >= At){ const f = (At - g[i-1][0]) / ((g[i][0] - g[i-1][0]) || 1); gA = g[i-1][1] + (g[i][1] - g[i-1][1]) * f; break; }
    if(gA === null) gA = As;
    if(P && P.ts > At && P.s > gA) ref = { d: Math.min(42195, Ad + (P.s - gA) * SuiviGeo.scale), el: A.el + (P.ts - At), ts: P.ts, s: P.s, ll: [P.lat, P.lon] };
    else ref = { d: Ad, el: A.el, ts: At, s: As, ll: SuiviGeo.pointAt(As) };
  } else if(P) ref = { d: Math.min(42195, P.s * SuiviGeo.scale), el: P.ts - t0, ts: P.ts, s: P.s, ll: [P.lat, P.lon] };
  else return Object.assign(o, { d: 0, el: t - t0, ts: t, s: 0, ll: null, speed: SUIVI_PLAN_SPEED, known: false });
  o.known = ref.d > 300 && ref.el > 60000;
  o.speed = o.known ? ref.d / (ref.el / 1000) : SUIVI_PLAN_SPEED;
  o.ref = ref; o.d = ref.d; o.el = ref.el; o.ts = ref.ts; o.s = ref.s; o.ll = ref.ll;
  o.age = t - ref.ts;
  // sans nouvelle position depuis 2 min : avancée estimée à l'allure moyenne
  if(o.age > 120000 && o.st === 'running'){
    const add = Math.min(42195 - ref.d, o.speed * o.age / 1000);
    o.est = true; o.d = ref.d + add; o.el = ref.el + o.age; o.ts = t;
    o.s = Math.min(SuiviGeo.len, ref.s + add / SuiviGeo.scale); o.ll = SuiviGeo.pointAt(o.s);
  }
  return o;
}

// ─── Formats ────────────────────────────────────────────────────────────────
const suiviFmt = {
  hhmm: function(t){ const d = new Date(t); return d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0'); },
  dur: function(ms){ ms = Math.max(0, ms); const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); },
  km: function(m){ return (m / 1000).toFixed(m >= 9950 ? 1 : 2).replace('.', ','); },
  pace: function(secPerKm){ if(!isFinite(secPerKm) || secPerKm <= 0) return '–'; const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60); return m + "'" + String(s === 60 ? 59 : s).padStart(2, '0') + '"/km'; },
  ago: function(ms){ const s = Math.round(ms / 1000); return s < 60 ? 'il y a ' + Math.max(1, s) + ' s' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : 'il y a ' + Math.floor(s / 3600) + ' h'; },
  planned: function(hm){ const p = hm.split(':'); const d = new Date(SUIVI_DATA.date + 'T00:00:00'); d.setHours(+p[0], +p[1], 0, 0); return d.getTime(); },
};
